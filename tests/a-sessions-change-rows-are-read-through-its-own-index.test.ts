// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SESSION'S CHANGE ROWS ARE READ THROUGH THE SESSION'S OWN INDEX, NOT FROM THE WHOLE OF A PROJECT'S LOG.
 *
 * Wave 13s round 186, item 40. `sessionWork` asks `listChanges` for the rows stored under a session's values, the
 * detail of a run shows them, and the timeline, the watchdog and `GET /api/changes` ask the same filter. The filter
 * was planned through changes_workspace_at_idx by the project alone: SQLite read the project's rows newest first and
 * kept the session's, and for a session with fewer rows than the limit that is every row of the project. On a made-up
 * office with the live sizes of the busiest project (542,827 changes), that statement took 149 to 153 ms in the detail
 * of a run, for a session with 0, 79 or 348 rows. The project condition is now asked with a unary `+`, as one record's
 * rows already are, and SQLite searches changes_session_idx by the session's values.
 *
 * WHAT THIS FILE HOLDS, against a test office of its own:
 *   1. The plan. The rows of one session value and of two, with no message hidden and with one hidden, are read once
 *      by `listChanges`, and counted once by `countChangesMatching`. Each read is caught as it runs and SQLite plans
 *      it with the values bound to it. It must search changes through changes_session_idx by the session, and through
 *      no other index of changes.
 *   2. The rows. What `listChanges` gives equals the rows of this project with those values, newest first by `at` and
 *      then by the order they were written, cut at the limit; and the count equals their number. The session also
 *      wrote rows in a second project, which neither may give.
 *
 * CONTROL: red before the change, case 1, every read: the plan searches changes_workspace_at_idx by `workspace_id=?`.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In `changesWhere` in src/server/lib/records.ts, ask a session's project as `eq(changes.workspaceId, …)` again.
 *      Case 1 goes red.
 *   2. In it, leave the project condition out when a session is asked. Both cases go red: case 1 because the read is
 *      no longer bound to the project, and case 2 because the second project's rows come back.
 *
 * WHAT IT DOES NOT HOLD. How long the read takes: the times are in the round's report and the commit. The other
 * filters of `changesWhere`.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb`), never the live office. Every change row is written straight
 * into the table and is made up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let R: typeof import('../src/server/lib/records.ts')

/** The project the session is asked in, and the second one it also wrote in. */
const HERE = 'default'
const THERE = 'made-up-elsewhere'
/** The session's record id and a run name its older rows carry. */
const SESSION = 'se-made-up-0001'
const RUN_NAME = 'made-up-run-name'
/** The message whose rows a reader may not read. */
const HIDDEN = 'ms-made-up-hidden'
/** Fewer than the rows the session wrote here, so the limit cuts. */
const LIMIT = 25

/** True for a read of the change log with a session filter. */
const isASessionsRowsRead = (source: string): boolean => /\bfrom "changes" where/i.test(source) && /"changes"\."session_id" in/i.test(source)

/** Every read of a session's rows that `work` made, with its values and SQLite's plan for it, asked with those values. */
function theSessionReadsDuring(work: () => void): { values: unknown[]; plan: string[] }[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => { all: (...values: unknown[]) => unknown[] } }
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  const ran: { source: string; values: unknown[] }[] = []
  for (const name of ['get', 'all', 'iterate']) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      if (isASessionsRowsRead(this.source)) ran.push({ source: this.source, values: args.flat() })
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

/** The rows of this project under these values, as `listChanges` must give them, read by a statement of this file. */
function theRowsByHand(values: readonly string[], hidden: readonly string[]): string[] {
  return (
    t.client.sqlite
      .prepare(
        `SELECT id FROM changes WHERE workspace_id = ? AND session_id IN (SELECT value FROM json_each(?))
           AND record_id NOT IN (SELECT value FROM json_each(?))
           AND coalesce(old_value, '') NOT IN (SELECT value FROM json_each(?)) AND coalesce(new_value, '') NOT IN (SELECT value FROM json_each(?))
         ORDER BY at DESC, append_order DESC`,
      )
      .all(HERE, JSON.stringify(values), JSON.stringify(hidden), JSON.stringify(hidden), JSON.stringify(hidden)) as { id: string }[]
  ).map((row) => row.id)
}

beforeAll(async () => {
  t = await freshDb()
  R = await import('../src/server/lib/records.ts')
  // 300 rows: every third the session's by its id, every seventh by its run name, the rest another run's or nobody's.
  // A row in five is in the second project, and every eleventh names the hidden message. Many rows share one `at`, and
  // the ids do not follow the order the rows were written, so only `at` and then the written order put them in order.
  t.client.sqlite
    .prepare(
      `WITH RECURSIVE n(k) AS (SELECT 0 UNION ALL SELECT k + 1 FROM n WHERE k < 299)
       INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, at, field, old_value, new_value, append_order)
       SELECT printf('c-%05d', (k * 7919) % 300),
              CASE WHEN k % 11 = 0 THEN ? ELSE 'r-made-up-' || (k % 4) END,
              CASE WHEN k % 5 = 0 THEN ? ELSE ? END,
              'update', 'agent', 'made-up',
              CASE WHEN k % 3 = 0 THEN ? WHEN k % 7 = 0 THEN ? WHEN k % 2 = 0 THEN 'se-made-up-other' ELSE NULL END,
              strftime('%Y-%m-%d %H:%M:%S', '2026-09-01 00:00:00', '+' || (k / 6) || ' seconds'),
              'title', 'An old made-up title', 'A new made-up title', k + 1
       FROM n`,
    )
    .run(HIDDEN, THERE, HERE, SESSION, RUN_NAME)
}, 300_000)
afterAll(() => {
  t.close()
})

const ASKED = [
  ['one value, no message hidden', [SESSION], []],
  ['two values, no message hidden', [SESSION, RUN_NAME], []],
  ['two values, one message hidden', [SESSION, RUN_NAME], [HIDDEN]],
] as const

describe("a session's change rows", () => {
  it.each(ASKED)('1. are read through the session index, with %s', (_what, values, hidden) => {
    const asked = { workspaceId: HERE, session: [...values], hidden: [...hidden] }
    const reads = [
      ...theSessionReadsDuring(() => R.listChanges({ ...asked, limit: LIMIT })),
      ...theSessionReadsDuring(() => R.countChangesMatching(asked)),
    ]
    expect(reads, 'the rows were read once and counted once').toHaveLength(2)
    for (const read of reads) {
      const steps = read.plan.filter((step) => /\bchanges\b/.test(step) && !/json_each/.test(step))
      expect(steps, read.plan.join(' | ')).toEqual(['SEARCH changes USING INDEX changes_session_idx (session_id=?)'])
      expect(read.values, 'the read is bound to the project').toContain(HERE)
    }
  })

  it.each(ASKED)('2. are the rows of this project alone, newest first and cut at the limit, with %s', (_what, values, hidden) => {
    const asked = { workspaceId: HERE, session: [...values], hidden: [...hidden] }
    const byHand = theRowsByHand(values, hidden)
    expect(byHand.length, 'the session has more rows here than the limit').toBeGreaterThan(LIMIT)
    expect(R.listChanges({ ...asked, limit: LIMIT }).map((row) => row.id), 'the rows').toEqual(byHand.slice(0, LIMIT))
    expect(R.countChangesMatching(asked), 'the count').toBe(byHand.length)
  })
})
