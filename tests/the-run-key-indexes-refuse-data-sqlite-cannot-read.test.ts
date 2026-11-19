// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUN-KEY INDEXES REFUSE DATA SQLITE CANNOT READ AS JSON. Wave 13n, run st5EG9M1BNjt: answer KhkVMkRqrWGt,
 * condition 3.
 *
 * Migration 0277 indexes json_extract(data, '$.extra.runKeyId') read plainly, not in the
 * CASE WHEN json_valid(data) form that migration 0199 uses. The plain form keeps the binding's lookups in their exact
 * words, so they answer as before. Its cost is that SQLite reads the data of every row an index covers, and refuses
 * a write whose data it cannot read:
 *
 *   revisions_run_key_id_idx        every revision
 *   records_session_run_key_id_idx  every session record
 *   revisions_first_agent_run_idx   every first revision, which the first index covers already
 *
 * This case pins that cost on purpose. A change that moves an index to the 0199 form has to change this case, in its
 * own criterion commit.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A revision at seq 2 whose data SQLite cannot read as JSON is refused with "malformed JSON", and nothing is
 *      stored. The same revision with JSON data is then stored.
 *   2. A session record's data changed to text SQLite cannot read is refused the same way, and the record keeps its
 *      data. Changed to other JSON, it is stored.
 *
 * WHAT IS NOT CLAIMED. SQLite also reads JSON5, such as {a:1}, which JSON.parse refuses and json_valid calls not
 * JSON, so the indexes let such data in. A record that is not a session is not in records_session_run_key_id_idx.
 * Neither is pinned here.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, each alone and after a green control
 * ---------------------------------------------------------------------------------------
 *
 *   e. revisions_run_key_id_idx left out of the migration: 1 goes red.
 *   f. records_session_run_key_id_idx left out of the migration: 2 goes red.
 *
 * Every record here is made up.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let session: string

const NOT_JSON = 'text SQLite cannot read as JSON'

beforeAll(async () => {
  t = await freshDb()
  session = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A made-up session', data: { state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN }).id
}, 120_000)

afterAll(() => {
  t?.close()
})

it('1: a revision whose data SQLite cannot read is refused with "malformed JSON", and nothing is stored', () => {
  const write = t.client.sqlite.prepare(
    'INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, op, actor_type, actor_id, session_id, at, note, kind, title, summary, data, deleted_at) ' +
      `VALUES ('a-made-up-revision', ?, 'default', 2, 'made-up', 'update', 'human', '${THE_TEST_OFFICES_OWNER.id}', NULL, ?, NULL, 'session', 'A made-up session', NULL, ?, NULL)`,
  )
  const stored = (): unknown => t.client.sqlite.prepare("SELECT count(*) AS n FROM revisions WHERE id = 'a-made-up-revision'").get()
  const stamp = t.api.localStamp(new Date())
  expect(() => write.run(session, stamp, NOT_JSON)).toThrow(/malformed JSON/)
  expect(stored()).toEqual({ n: 0 })
  write.run(session, stamp, JSON.stringify({ state: 'running', runtime: 'claude-code' }))
  expect(stored()).toEqual({ n: 1 })
})

it('2: a session record whose data changes to text SQLite cannot read is refused the same way, and keeps its data', () => {
  const dataOf = (): string => (t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(session) as { data: string }).data
  const change = t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  const held = dataOf()
  expect(() => change.run(NOT_JSON, session)).toThrow(/malformed JSON/)
  expect(dataOf()).toBe(held)
  const other = JSON.stringify({ ...(JSON.parse(held) as object), doing: 'Changed by hand, as JSON.' })
  change.run(other, session)
  expect(dataOf()).toBe(other)
})
