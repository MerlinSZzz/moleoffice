// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ATTENTION RULE IS GIVEN THE SAME STATE ROWS FROM THE SAME WINDOW (problem CtH8CGBkE5Bz, wave 13w round 22).
 *
 * `attentionNow` used to read the newest `ATTENTION_CHANGE_ROWS` rows of the change log, every field,
 * and the rule then skipped every row that did not set `data.state` to a value. It now asks SQLite for
 * only those rows, inside the same window (`theAttentionChangeWindow` in src/server/lib/records.ts).
 * This file writes a log longer than the window straight into the table and compares the new read with
 * the old one, written out here as it was: the same state rows in the same order, the same count of the
 * window and the same "the log was longer" flag.
 *
 * THE EDGES IT COVERS. Many rows share one `at`, and the row ids do not follow the order rows were
 * written, so the window's last row falls inside a run of equal times and only the id decides it. The
 * window is read four ways: longer than the cap, exactly the cap, under the cap because a reader may not
 * see half the log, and another project's short log.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green; a MUTATION
 * of one line red; RESTORE green, checked with cmp against a saved copy.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type Records = typeof import('../src/server/lib/records.ts')
let R: Records
let t: TestDb

/** Rows written beyond the cap, so the log is longer than the window. */
const PAST_THE_CAP = 40

/** How many rows share one `at`, so the window's edge falls inside a run of equal times. */
const SAME_TIME = 7

beforeAll(async () => {
  t = await freshDb()
  R = await import('../src/server/lib/records.ts')
  const db = t.client.sqlite
  const total = R.ATTENTION_CHANGE_ROWS + PAST_THE_CAP
  // The first PAST_THE_CAP rows belong to one record, so hiding it leaves exactly the cap. The rest
  // alternate between two records, so hiding one leaves about half. Every third row sets a state, every
  // third sets it to null, and the rest change a title.
  db.prepare(
    `WITH RECURSIVE n(k) AS (SELECT 0 UNION ALL SELECT k + 1 FROM n WHERE k < ?)
     INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, at, field, old_value, new_value, append_order)
     SELECT printf('c-%07d', (k * 7919) % ?),
            CASE WHEN k < ? THEN 'r-few' WHEN k % 2 = 1 THEN 'r-odd' ELSE 'r-even' END,
            'default', 'update', 'agent', 'made-up', strftime('%Y-%m-%d %H:%M:%S', '2026-09-01 00:00:00', '+' || (k / ?) || ' seconds'),
            CASE k % 3 WHEN 2 THEN 'title' ELSE 'data.state' END,
            'todo',
            CASE k % 3 WHEN 0 THEN 'doing' WHEN 1 THEN NULL ELSE 'A made-up title' END,
            k + 1
     FROM n`,
  ).run(total - 1, total, PAST_THE_CAP, SAME_TIME)
  db.prepare(
    `WITH RECURSIVE n(k) AS (SELECT 0 UNION ALL SELECT k + 1 FROM n WHERE k < 499)
     INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, at, field, old_value, new_value, append_order)
     SELECT 'o-' || k, 'r-other', 'other', 'update', 'agent', 'made-up', '2026-09-02 00:00:00', 'data.state', 'todo', 'done', ? + k + 1 FROM n`,
  ).run(total)
}, 300_000)

afterAll(() => {
  t.close()
})

/** The window as `attentionNow` read it before round 22, and the rows of it the rule kept. */
function theWindowAsItWasRead(workspaceId: string, hidden: string[]): { stateIds: string[]; rows: number; capped: boolean } {
  const all = t.client.sqlite
    .prepare(`SELECT id, field, new_value AS newValue, record_id AS recordId FROM changes WHERE workspace_id = ? ORDER BY at DESC, id DESC`)
    .all(workspaceId) as { id: string; field: string | null; newValue: string | null; recordId: string }[]
  const visible = all.filter((one) => !hidden.includes(one.recordId)).slice(0, R.ATTENTION_CHANGE_ROWS + 1)
  const capped = visible.length > R.ATTENTION_CHANGE_ROWS
  const window = capped ? visible.slice(0, R.ATTENTION_CHANGE_ROWS) : visible
  return {
    stateIds: window.filter((one) => one.field === 'data.state' && one.newValue !== null).map((one) => one.id),
    rows: window.length,
    capped,
  }
}

describe('the change rows the attention rule is given', () => {
  for (const [what, workspaceId, hidden, expected] of [
    ['a log longer than the window', 'default', [], { rows: 100_000, capped: true }],
    ['a log exactly the window long', 'default', ['r-few'], { rows: 100_000, capped: false }],
    ['a log half of which the reader may not see', 'default', ['r-odd'], { capped: false }],
    ["another project's short log", 'other', [], { rows: 500, capped: false }],
  ] as const) {
    it(`are the state rows of the same window, for ${what}`, () => {
      const was = theWindowAsItWasRead(workspaceId, [...hidden])
      const now = R.theAttentionChangeWindow(workspaceId, R.aChangeNamingNoneOf([...hidden]))
      expect(was).toMatchObject(expected)
      expect(was.stateIds.length, 'the window holds state rows').toBeGreaterThan(0)
      expect({ stateIds: now.stateRows.map((one) => one.id), rows: now.rows, capped: now.capped }).toEqual(was)
    })
  }
})
