// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLACEMENT READS THE NEWEST CHANGE ROWS AS VALUE ROWS, SO NO OBJECT IS MADE FOR EACH OF A HUNDRED THOUSAND ROWS.
 *
 * Wave 13y round 120, item 54. The detail of a run places it from the newest 100,001 change rows of its project
 * (`PLACEMENT_CHANGE_ROWS` in src/server/lib/sessions.ts), read by `whoWroteWhereNewestFirst` in
 * src/server/lib/records.ts. Drizzle gave each row as an object made of its three columns, one row at a time. On a made-up
 * office at the live sizes of the busiest project (542,827 changes), that read took 88 to 92 ms of the placement's 114
 * to 133. It now gives each row as SQLite gives it, an array of the three columns in the order they are selected: 62 to
 * 64 ms, and the placement 85 to 103, the same by hash. The order is stated whole: newest first by `at`, and among
 * rows of one `at` the row written last first, by `rowid`. That is the order SQLite read them in before, through
 * changes_workspace_at_idx, and now the statement says it.
 *
 * WHAT THIS FILE HOLDS, against a test office of its own:
 *   1. The shape. Each row is an array of three: the session column, the record id and `at`.
 *   2. The rows. They are the rows of this project alone, newest first by `at` and then by `rowid`, cut at the limit,
 *      where many rows share one `at` and `append_order` runs against `rowid`. A second project's rows are not given.
 *   3. The plan. The read is caught as it runs and SQLite plans it with the values bound to it. It searches changes
 *      through changes_workspace_at_idx by the project and sorts nothing in a temporary tree.
 *
 * CONTROL: red before the change, case 1: each row is an object with the keys `sessionId`, `recordId` and `at`. Cases 2
 * and 3 are green before and after: the order and the plan did not change, and they hold that.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In `whoWroteWhereNewestFirst`, give the rows by `.all()` again. Case 1 goes red.
 *   2. In it, order rows of one `at` by `append_order` instead of `rowid`. All three cases go red: the ties come in the
 *      other order, case 1's first row among them, and SQLite sorts them in a temporary tree.
 *   3. In it, leave out the project condition. Cases 2 and 3 go red: the second project's rows come back, and SQLite
 *      reads every project's rows through changes_at_idx.
 *
 * WHAT IT DOES NOT HOLD. How long the read takes: the times are in the round's report and the commit. What the
 * placement makes of the rows: tests/sessions.test.ts and the link tests hold that.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb`), never the live office. Every change row is written straight
 * into the table and is made up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let R: typeof import('../src/server/lib/records.ts')

/** The project the rows are read in, and a second one whose rows must not be given. */
const HERE = 'default'
const THERE = 'made-up-elsewhere'
/** Fewer than this project's rows, and a limit that cuts among rows of one `at`. */
const LIMIT = 53

/** True for the read of the newest rows. */
const isTheNewestRowsRead = (source: string): boolean => /^select "session_id", "record_id", "at" from "changes"/i.test(source)

/** Every read of the newest rows that `work` made, with SQLite's plan for it, asked with its values. */
function theReadsDuring(work: () => void): { values: unknown[]; plan: string[] }[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => { all: (...values: unknown[]) => unknown[] } }
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  const ran: { source: string; values: unknown[] }[] = []
  for (const name of ['get', 'all', 'iterate']) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      if (isTheNewestRowsRead(this.source)) ran.push({ source: this.source, values: args.flat() })
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

/** A row as three values, whether it came as an array or as an object, so case 2 reads the order alone. */
const asThree = (row: unknown): unknown[] => {
  if (Array.isArray(row)) return row
  const named = row as { sessionId: unknown; recordId: unknown; at: unknown }
  return [named.sessionId, named.recordId, named.at]
}

beforeAll(async () => {
  t = await freshDb()
  R = await import('../src/server/lib/records.ts')
  // 400 rows, written in the order of k: a row in five is in the second project, and eight rows share each `at`. The
  // ids do not follow the order the rows were written, and `append_order` runs against it, so only `at` and then
  // `rowid` put the rows in the order asked.
  t.client.sqlite
    .prepare(
      `WITH RECURSIVE n(k) AS (SELECT 0 UNION ALL SELECT k + 1 FROM n WHERE k < 399)
       INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, at, field, old_value, new_value, append_order)
       SELECT printf('c-%05d', (k * 7919) % 400),
              'r-made-up-' || (k % 13),
              CASE WHEN k % 5 = 0 THEN ? ELSE ? END,
              'update', 'agent', 'made-up',
              CASE WHEN k % 3 = 0 THEN 'se-made-up-' || (k % 7) WHEN k % 2 = 0 THEN 'a-made-up-run-name' ELSE NULL END,
              strftime('%Y-%m-%d %H:%M:%S', '2026-09-01 00:00:00', '+' || (k / 8) || ' seconds'),
              'title', 'An old made-up title', 'A new made-up title', 1000 - k
       FROM n`,
    )
    .run(THERE, HERE)
}, 300_000)
afterAll(() => {
  t.close()
})

describe('the newest change rows of a project', () => {
  it('1. are arrays of the session column, the record id and the time', () => {
    const rows = R.whoWroteWhereNewestFirst(HERE, LIMIT) as unknown[]
    expect(rows).toHaveLength(LIMIT)
    for (const row of rows) {
      expect(Array.isArray(row), `a row is ${JSON.stringify(row)}`).toBe(true)
      expect(row).toHaveLength(3)
    }
    expect(rows[0]).toEqual(t.client.sqlite.prepare('SELECT session_id, record_id, at FROM changes WHERE workspace_id = ? ORDER BY at DESC, rowid DESC LIMIT 1').raw().get(HERE))
  })

  it('2. are the rows of this project alone, newest first by time and then by the order SQLite holds them, cut at the limit', () => {
    const byHand = t.client.sqlite
      .prepare('SELECT session_id, record_id, at FROM changes WHERE workspace_id = ? ORDER BY at DESC, rowid DESC')
      .raw()
      .all(HERE) as unknown[][]
    expect(byHand.length, 'the project has more rows than the limit').toBeGreaterThan(LIMIT)
    expect(byHand[LIMIT - 1]![2], 'the limit cuts among rows of one time').toBe(byHand[LIMIT]![2])
    const byAppendOrder = t.client.sqlite
      .prepare('SELECT session_id, record_id, at FROM changes WHERE workspace_id = ? ORDER BY at DESC, append_order DESC LIMIT ?')
      .raw()
      .all(HERE, LIMIT) as unknown[][]
    expect(byAppendOrder, 'the written order and rowid disagree here, so the case can tell them apart').not.toEqual(byHand.slice(0, LIMIT))
    expect((R.whoWroteWhereNewestFirst(HERE, LIMIT) as unknown[]).map(asThree)).toEqual(byHand.slice(0, LIMIT))
  })

  it('3. are read through the project index, with nothing sorted in a temporary tree', () => {
    const reads = theReadsDuring(() => R.whoWroteWhereNewestFirst(HERE, LIMIT))
    expect(reads, 'the rows were read once').toHaveLength(1)
    expect(reads[0]!.plan, reads[0]!.plan.join(' | ')).toEqual(['SEARCH changes USING INDEX changes_workspace_at_idx (workspace_id=?)'])
    expect(reads[0]!.values, 'the read is bound to the project').toContain(HERE)
  })
})
