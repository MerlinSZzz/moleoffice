// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NARROWED READ PARSES A RECORD'S DATA ONCE WHEN THE DATA BEGINS WITH "{", AND KEEPS WHAT IT KEPT. Wave 13y round 34,
 * item 4.
 *
 * MEASURED FIRST, on 15 October 2026, on three copies of an office: `sessionRecordsForTheRows` (src/server/lib/sessions.ts),
 * the read GET /api/sessions?only=running makes of every session record, took 61 to 73 ms on the two large copies, and
 * its SQL statement 57 to 69 ms of that. In the statement, `onlyTheseFieldsOf` (src/server/lib/records.ts) asked
 * `json_type` whether each record's data is an object, which parses the whole of it, and then walked the same data,
 * which parses it again. Its expression took 44 to 48 ms over every session record of each large copy; with the check
 * asked only of a data whose first character is not "{", 33 to 36 ms, and the same text for every record of the three.
 *
 * WHAT THIS HOLDS, on records written straight into SQLite, so that a data no write would store can be read:
 *   1. `onlyTheseFieldsOf` keeps the fields named, in the order stored, each as stored, and a list named in
 *      `listsAsTheirLength` as a list of nulls of its length; it keeps a data that is not an object whole. Each answer
 *      is compared with the same narrowing done on `JSON.parse` of the stored text, for every shape below.
 *   2. a data that is not JSON still fails the read, whether or not it begins with "{".
 *
 * WHAT IT DOES NOT HOLD. How long the read takes; the times above are in the round's report.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const FIELDS = ['a', 'b', 'c', 'l'] as const
const LISTS = ['l'] as const

/** Every shape of data this file reads, by the id of the record that holds it. All of it is made up. */
const SHAPES: readonly { id: string; data: string }[] = [
  { id: 'nf-plain', data: '{"a":"x","b":null,"c":true,"z":"not kept"}' },
  { id: 'nf-order', data: '{"z":1,"c":false,"a":{"n":[1,2,{"m":null}]}}' },
  { id: 'nf-lists', data: '{"l":[{"big":"x"},{"big":"y"}],"a":1.5,"b":-2}' },
  { id: 'nf-text', data: '{"l":"not a list","b":"é \\u00e9 \\" \\\\ \\n end"}' },
  { id: 'nf-empty', data: '{}' },
  { id: 'nf-none', data: '{"z":"no field named"}' },
  { id: 'nf-twice', data: '{"a":1,"b":2,"a":3}' },
  { id: 'nf-space', data: ' \n {"a":"a space before the object","z":"not kept"}' },
  { id: 'nf-list', data: '[1, 2]' },
  { id: 'nf-string', data: '"a text"' },
  { id: 'nf-number', data: '3' },
  { id: 'nf-null', data: 'null' },
]

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
  const add = t.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, ?, 'owner', '2026-10-15 09:00:00', ?, 'note', ?, NULL, ?, NULL, 'fixture')`,
  )
  SHAPES.forEach((shape, i) => add.run(shape.id, HERE, `2026-10-15 09:00:${String(i).padStart(2, '0')}`, `A made-up note ${shape.id}`, shape.data))
  add.run('nf-broken-brace', 'broken-brace', '2026-10-15 09:01:00', 'A made-up note whose data is not JSON', '{"a":')
  add.run('nf-broken-other', 'broken-other', '2026-10-15 09:01:00', 'A made-up note whose data is not JSON', 'not JSON')
}, 60_000)

afterAll(() => {
  t.close()
})

/** The same narrowing, done on the stored text parsed whole. */
function keptFrom(text: string): unknown {
  const value = JSON.parse(text) as unknown
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const kept: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(value)) {
    if (!(FIELDS as readonly string[]).includes(key)) continue
    kept[key] = (LISTS as readonly string[]).includes(key) && Array.isArray(field) ? field.map(() => null) : field
  }
  return kept
}

/** What `onlyTheseFieldsOf` gives for every record of one project, by id, as text. */
async function theKeptTextOf(workspaceId: string): Promise<Map<string, string>> {
  const { db } = await import('../src/server/db/client.ts')
  const { records } = await import('../src/server/db/schema.ts')
  const { onlyTheseFieldsOf } = await import('../src/server/lib/records.ts')
  const rows = db.select({ id: records.id, kept: onlyTheseFieldsOf(FIELDS, LISTS) }).from(records).where(eq(records.workspaceId, workspaceId)).all()
  return new Map(rows.map((row) => [row.id, row.kept]))
}

it('1: keeps the fields named, in the order stored, each as stored, and a data that is not an object whole', async () => {
  const kept = await theKeptTextOf(HERE)
  expect([...kept.keys()].sort()).toEqual(SHAPES.map((shape) => shape.id).sort())
  for (const shape of SHAPES) {
    const got = JSON.parse(kept.get(shape.id) ?? 'undefined') as unknown
    const want = keptFrom(shape.data)
    expect(got, shape.id).toEqual(want)
    if (want !== null && typeof want === 'object' && !Array.isArray(want)) expect(Object.keys(got as object), `${shape.id}: the order`).toEqual(Object.keys(want))
  }
})

it('2: a data that is not JSON fails the read, whether or not it begins with "{"', async () => {
  await expect(theKeptTextOf('broken-brace')).rejects.toThrow(/malformed JSON/)
  await expect(theKeptTextOf('broken-other')).rejects.toThrow(/malformed JSON/)
})

