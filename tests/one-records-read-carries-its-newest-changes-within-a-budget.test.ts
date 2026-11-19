// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RECORD'S READ CARRIES ITS NEWEST CHANGE ROWS WHOLE, FOR AS LONG AS THEIR VALUES FIT A BUDGET, AND SAYS WHAT IT
 * LEFT OUT. Wave 13y round 15, finding 1.
 *
 * MEASURED FIRST: a run's record logs its whole tool-use list on every turn, and GET /api/records/<that run> answered
 * 28.6 MB on a copy of the live office, asked 449 times in one afternoon by a waiter that wanted the project id.
 *
 * WHAT THIS HOLDS:
 *   - the read carries the newest rows, each whole, while their old and new values fit `ONE_RECORDS_CHANGES_BUDGET`;
 *     `changesCarried` says how many it carried and how many there are, and `next` is a request that reads the rest;
 *   - a record whose rows all fit carries them all and names no `next`;
 *   - `?shape=where` answers the record's id, kind and project, and nothing else;
 *   - a row whose logged value is a message the reader may not read is neither carried nor counted, and the owner,
 *     who reads every message, gets it;
 *   - `whoFiled` names the writer of a record with more than 1,000 change rows. It read the newest 1,000 and kept the
 *     create rows among them, so such a record was answered "nobody recorded".
 *
 * CONTROL: every test passes at the tip. MUTATIONS, each run and each red:
 *   1. the budget is not applied (`spent + bytes <= budget` made always true, src/server/lib/records.ts): every row
 *      is carried and the reply holds more bytes of values than the budget.
 *   2. `?shape=where` falls through to the whole read (src/server/api/records.ts): the answer carries the record.
 *   3. `whoFiled` reads the newest 1,000 rows as it did: it answers null.
 *   4. the rows measured against the budget ordered by `at` alone: three writes in one second carry the first of
 *      them as the newest.
 *   5. (round 15b) the check that a logged value is a message's id asks for a kind no record has: the row naming a
 *      message the reader may not read is carried and counted.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, apiApp, type TestDb } from './helpers.ts'

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']

type Change = { oldValue?: unknown; newValue?: unknown; field?: string | null }
type Carried = { carried: number; total: number; budgetBytes: number; next: string | null }
type Read = { record?: unknown; changes?: Change[]; changesCarried?: Carried }

async function file(title: string, data: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: { kind: 'problem', title, data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

async function read(path: string): Promise<{ status: number; body: Read; bytes: number }> {
  const reply = await app.inject({ method: 'GET', url: path, headers: PERSON })
  return { status: reply.statusCode, body: reply.json() as Read, bytes: reply.body.length }
}

/** The bytes of the values one change row logged, as the server counts them. */
const valueBytes = (one: Change): number =>
  [one.oldValue, one.newValue].reduce<number>((sum, value) => sum + (value === null || value === undefined ? 0 : Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value))), 0)

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
}, 60000)

afterAll(async () => {
  await app.close()
  db.close()
})

it('a record with large changes carries the newest whole, within the budget, and names the request for the rest', async () => {
  const id = await file('Test large changes', { state: 'open', symptom: 'small' })
  // THREE SYMPTOMS OF ABOUT 100 KB EACH, so one change row's values are about 200 KB and two do not fit 256 KB.
  const words = (letter: string): string => `${letter} `.repeat(50_000)
  for (const letter of ['a', 'b', 'c']) {
    const patched = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: PERSON, payload: { dataPatch: { symptom: words(letter) } } })
    expect(patched.statusCode, patched.body).toBe(200)
  }
  const { status, body } = await read(`/api/records/${id}`)
  expect(status).toBe(200)
  const carried = body.changesCarried!
  const rows = body.changes!
  expect(carried.carried).toBe(rows.length)
  expect(rows.length, 'some rows are left out').toBeLessThan(carried.total)
  expect(rows.length, 'and the newest is carried').toBeGreaterThan(0)
  expect(rows.reduce((sum, one) => sum + valueBytes(one), 0), 'the values carried fit the budget').toBeLessThanOrEqual(carried.budgetBytes)
  const newest = rows.find((one) => one.field === 'data.symptom')
  expect(newest?.newValue, 'the newest row is carried whole, not cut').toBe(words('c'))
  expect(carried.next, 'the request for the rest').toMatch(/^GET \/api\/changes\?recordId=/)

  const rest = await app.inject({ method: 'GET', url: carried.next!.replace(/^GET /, ''), headers: PERSON })
  expect(rest.statusCode, rest.body).toBe(200)
})

it('a record whose rows all fit carries them all and names no next request', async () => {
  const id = await file('Test small changes', { state: 'open', symptom: 'small' })
  await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: PERSON, payload: { dataPatch: { symptom: 'still small' } } })
  const { body } = await read(`/api/records/${id}`)
  expect(body.changesCarried).toMatchObject({ carried: body.changes!.length, total: body.changes!.length, next: null })
})

it('?shape=where answers where the record is and nothing else', async () => {
  const id = await file('Test where it is', { state: 'open', symptom: 'small' })
  const { status, body } = await read(`/api/records/${id}?shape=where`)
  expect(status).toBe(200)
  // `narrowedByPermission` is on every answer of the server.
  expect(body).toEqual({ id, kind: 'problem', workspaceId: 'default', narrowedByPermission: null })
})

it('whoFiled names the writer of a record with more than 1,000 change rows', async () => {
  const id = await file('Test many changes', { state: 'open', symptom: 'small' })
  const sqlite = db.client.sqlite
  const create = sqlite.prepare("SELECT * FROM changes WHERE record_id = ? AND op = 'create'").get(id) as Record<string, unknown>
  const columns = Object.keys(create)
  const insert = sqlite.prepare(`INSERT INTO changes (${columns.join(', ')}) VALUES (${columns.map((name) => `@${name}`).join(', ')})`)
  sqlite.transaction(() => {
    for (let n = 0; n < 1001; n++) {
      insert.run({ ...create, id: `${String(create['id'])}-later-${n}`, op: 'update', at: '2099-01-01 00:00:00', append_order: null })
    }
  })()
  expect(db.api.whoFiled('default', id)).toEqual({ actorType: 'human', actorId: THE_TEST_OFFICES_OWNER.id })
})

it('a row naming a message the reader may not read is neither carried nor counted', () => {
  const id = db.api.createRecord({ kind: 'problem', title: 'Test row naming a message', workspaceId: 'default', data: {}, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }).id
  const message = db.api.createRecord({ kind: 'message', title: 'Test message', workspaceId: 'default', data: { body: 'Test message.', to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] }, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }).id
  // A LINK ROW KEEPS THE RECORD AT ITS OTHER END AS ITS VALUE, so this row names the message.
  const sqlite = db.client.sqlite
  const create = sqlite.prepare("SELECT * FROM changes WHERE record_id = ? AND op = 'create'").get(id) as Record<string, unknown>
  const columns = Object.keys(create)
  sqlite
    .prepare(`INSERT INTO changes (${columns.join(', ')}) VALUES (${columns.map((name) => `@${name}`).join(', ')})`)
    .run({ ...create, id: `${String(create['id'])}-names-a-message`, op: 'update', field: 'links', old_value: null, new_value: message, append_order: null })
  const named = (rows: { newValue: string | null }[]): boolean => rows.some((row) => row.newValue === message)

  const nobody = db.api.changesOfOneRecordWithinABudget(id, 'default', { readsEveryMessage: false, who: null })
  expect(named(nobody.rows), 'a row naming a message the reader may not read is carried').toBe(false)
  expect(nobody.carried.total, 'and it is counted').toBe(nobody.rows.length)

  const owner = db.api.changesOfOneRecordWithinABudget(id, 'default', { readsEveryMessage: true, because: 'the owner', who: null })
  expect(named(owner.rows), 'the owner reads every message').toBe(true)
  expect(owner.carried.total).toBe(nobody.carried.total + 1)
})
