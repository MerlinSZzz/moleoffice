// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ATTENTION RULE'S STATE ROWS ARE READ FROM A RANGE OF TIMES, NOT FROM THE WHOLE OF A PROJECT'S LOG.
 *
 * Wave 13y round 114, item 47. `theAttentionChangeWindow` in src/server/lib/records.ts reads the rows that set
 * `data.state` inside the newest `ATTENTION_CHANGE_ROWS` rows of a project's change log. The window's oldest row is
 * at time t with id i, and the read asked for `at > t OR (at = t AND id >= i)`. With the OR at the top, SQLite
 * searched changes_workspace_at_idx by the project alone and tested every row of the project's log. On the made-up
 * office shaped to the live counts of the second-largest project on 31 October 2026, that statement walked all
 * 563,735 of the project's changes for 4,081 rows: 116.43 ms, at load 42.8. The test is now asked as
 * `at >= t AND (at > t OR id >= i)`, which keeps the same rows because `at` is never null, and SQLite searches the
 * index by the project and a range of times: 26.76 ms for the same 4,081 rows, at load 47.1.
 *
 * WHAT THIS FILE HOLDS, against a test office of its own: the plan. The window is read for a log longer than the
 * window, with no record hidden and with one record hidden. Each time, the read of the state rows is caught as it
 * runs, and SQLite plans it with the values bound to it. It must search changes through changes_workspace_at_idx
 * by the project and a range of `at`, and nothing else of changes. Each read must be bound to the window's edge, so
 * a window that stopped finding its edge would not pass by reading the whole log.
 *
 * CONTROL: red before the change, both cases: the plan searches the index by `workspace_id=?` alone.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In `theAttentionChangeWindow`, ask the window as `or(at > t, and(at = t, id >= i))` again. Both cases go red.
 *   2. In it, ask the range as `+at >= t`, which keeps the rows and hides the column from the index. Both cases go
 *      red.
 *   3. In it, ask `gt(changes.at, oldest.at)` for the range. This file stays green, as its plan is the same, and
 *      tests/the-attention-change-window-is-the-window-it-was.test.ts goes red: the rows at the edge's own time are
 *      lost.
 *
 * WHAT IT DOES NOT HOLD. Which rows the window gives, at an edge inside a run of equal times, with a record hidden and
 * for a short log: tests/the-attention-change-window-is-the-window-it-was.test.ts holds that, against the read as it
 * was written before wave 13w round 22. How long the read takes; the times are in the round's report and the commit.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb`), never the live office. Every change row is written straight
 * into the table and is made up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let R: typeof import('../src/server/lib/records.ts')

/** Rows written beyond the cap, so the log is longer than the window and the window has an edge. */
const PAST_THE_CAP = 40
/** How many rows share one `at`, so the edge falls inside a run of equal times. */
const SAME_TIME = 7

/** True for the read of the state rows: the changes of one project that set `data.state` to a value. */
const isTheStateRowsRead = (source: string): boolean =>
  /^select .* from "changes" where/i.test(source) && /"changes"\."field" = \?/i.test(source) && /"changes"\."new_value" is not null/i.test(source)

/** Every read of the state rows that `work` made, with its values and SQLite's plan for it, asked with those values. */
function theStateRowsReadsDuring(work: () => void): { values: unknown[]; plan: string[] }[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => { all: (...values: unknown[]) => unknown[] } }
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  const ran: { source: string; values: unknown[] }[] = []
  for (const name of ['get', 'all', 'iterate']) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      if (isTheStateRowsRead(this.source)) ran.push({ source: this.source, values: args.flat() })
      return original.apply(this, args)
    }
  }
  try {
    work()
  } finally {
    for (const [name, original] of originals) prototype[name] = original
  }
  return ran.map((one) => ({
    values: one.values,
    plan: (sqlite.prepare(`EXPLAIN QUERY PLAN ${one.source}`).all(...one.values) as { detail: string }[]).map((step) => step.detail),
  }))
}

beforeAll(async () => {
  t = await freshDb()
  R = await import('../src/server/lib/records.ts')
  const total = R.ATTENTION_CHANGE_ROWS + PAST_THE_CAP
  // The first PAST_THE_CAP rows belong to one record, so hiding it leaves the window still at the cap. The rest
  // alternate between two records. Every third row sets a state, every third sets it to null, and the rest change a
  // title. The ids do not follow the order rows were written.
  t.client.sqlite
    .prepare(
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
    )
    .run(total - 1, total, PAST_THE_CAP, SAME_TIME)
}, 300_000)
afterAll(() => {
  t.close()
})

describe("the attention rule's state rows", () => {
  it.each([
    ['no record hidden', []],
    ['one record hidden', ['r-few']],
  ] as const)('are read from a range of times, with %s', (_what, hidden) => {
    const edge = t.client.sqlite
      .prepare(`SELECT at FROM changes WHERE workspace_id = 'default' AND record_id NOT IN (SELECT value FROM json_each(?)) ORDER BY at DESC, id DESC LIMIT 1 OFFSET ?`)
      .get(JSON.stringify(hidden), R.ATTENTION_CHANGE_ROWS - 1) as { at: string }
    let window: ReturnType<typeof R.theAttentionChangeWindow> | undefined
    const reads = theStateRowsReadsDuring(() => {
      window = R.theAttentionChangeWindow('default', hidden.length === 0 ? undefined : R.aChangeNamingNoneOf([...hidden]))
    })
    expect(window?.rows, 'the window is at the cap').toBe(R.ATTENTION_CHANGE_ROWS)
    expect(window?.stateRows.length, 'the window holds state rows').toBeGreaterThan(0)
    expect(reads, 'the state rows were read once').toHaveLength(1)
    const [read] = reads
    expect(read!.values, "the read is bound to the window's edge").toContain(edge.at)
    const steps = read!.plan.filter((step) => /\bchanges\b/.test(step))
    expect(steps, read!.plan.join(' | ')).toEqual(['SEARCH changes USING INDEX changes_workspace_at_idx (workspace_id=? AND at>?)'])
  })
})
