// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO USAGE DOORS COUNT FROM ONE INDEX, WITHOUT READING THE TABLE AND WITHOUT SORTING.
 *
 * `GET /api/usage/operations` and `GET /api/usage/patterns` count one project's call rows grouped by
 * operation. On the timing test's 703,341 rows they were red under load
 * (tests/the-usage-reads-answer-before-a-person-gives-up.test.ts, problem `Hy13YXeH7xHL`), because
 * SQLite walked every row by time and then sorted all of them by operation. Migration 0184 adds
 * `api_calls_workspace_operation_idx`, led by the project and the operation and holding every column
 * the two grouped queries read, and src/server/lib/usage-reads.ts names it in both.
 *
 * WHY THIS FILE AND NOT ONLY THE TIMING TEST. The timing test measures wall time, so it can only say
 * something when the machine is busy enough, and then only some of the time. This file asks SQLite
 * for the plan of each grouped query the two readings actually send, on a fresh database with the
 * product's own migrations. A plan does not depend on load. It fails whenever a grouped query stops
 * reading the index alone ("COVERING INDEX"), or needs a sort ("TEMP B-TREE"), or walks the whole
 * table ("SCAN"). Each of those is what made the doors slow.
 *
 * HOW THE QUERIES ARE FOUND. The readings prepare their SQL on the same connection the test holds, so
 * the test watches `prepare` while it calls each reading. A grouped query of the two doors is one that
 * reads `api_calls` without a table alias and groups by operation. The read-back query reads the table
 * twice under the aliases `w` and `r`, walks the traced rows only, and is not what this file is about.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let reads: typeof import('../src/server/lib/usage-reads.ts')

// ONE DATABASE FOR BOTH CASES, because neither writes to it. The minute is for a busy machine:
// `freshDb` runs every migration, and under the merge queue's load that took more than ten seconds.
beforeAll(async () => {
  t = await freshDb()
  reads = await import('../src/server/lib/usage-reads.ts')
}, 60_000)

afterAll(() => {
  vi.restoreAllMocks()
  t.close()
})

const PROJECT = 'default'






describe('the usage doors count from one index', () => {


  // A CALL NO ROUTE MATCHED HAS NO OPERATION, and the index leaves it out. It still counts in `of`,
  // which is how many call rows the window holds, and it is still not drawn as a reading. This case
  // writes its own rows and deletes them at the end, so every case starts from an empty table.
  it('still counts the calls no route matched in how many calls the window holds', () => {
    const insert = t.client.sqlite.prepare(
      'insert into api_calls (id, at_ms, operation, effect, method, waits, status, ms, bytes, workspace_id, identity_source) ' +
        "values (?, ?, ?, ?, 'GET', 0, ?, 5, 10, ?, 'header')",
    )
    insert.run('named-1', 2_000, 'records.read', 'read', 200, PROJECT)
    insert.run('named-2', 3_000, 'records.read', 'read', 200, PROJECT)
    insert.run('unmatched-1', 4_000, null, null, 404, PROJECT)
    insert.run('unmatched-2', 5_000, null, null, 404, PROJECT)
    insert.run('unmatched-elsewhere', 4_000, null, null, 404, 'another-project')
    insert.run('unmatched-too-early', 500, null, null, 404, PROJECT)
    const { readings, of } = reads.operationReadings(1_000, PROJECT)
    expect(of, 'two matched calls and two unmatched ones fall in this project and window').toBe(4)
    expect(readings.map((r) => [r.operation, r.calls])).toEqual([['records.read', 2]])
    t.client.sqlite.prepare('delete from api_calls').run()
  })

})
