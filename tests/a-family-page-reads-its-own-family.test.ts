// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FAMILY READ OPENS ONLY ITS FAMILY, AND THE FAR ENDS COME APART FROM THE LIST. Wave 13y round 15, finding 2.
 *
 * MEASURED FIRST: on 9 October 2026 GET /api/records answered the owner's browser 142 MB, twice, in 6 to 8 s each.
 * It was the family pages: each asked for every live record of the project and kept its own, and the Work page kept
 * none. Asking `?family=` alone would not have helped the server, which parsed every record before it filtered.
 *
 * WHAT THIS HOLDS:
 *   - `?family=findings` answers that family, and it does not open a record of another kind. A task whose stored
 *     `data` is not JSON breaks the whole-project read (the control below) and does not break the family read.
 *   - `?farEnds=light` (the coordinator's ruling JJNMwadqQj06) answers every record one link away from a row, in the
 *     light shape, apart from `records`. A record of the family is never a far end. A deleted far end is not there,
 *     so the Pipelines page still says the record at the end of that link is deleted.
 *
 * CONTROL: both tests pass at the tip. MUTATIONS, each run and each red:
 *   1. `kinds` left undefined in GET /api/records (src/server/api/records.ts): the family read answers 500.
 *   2. `theOtherEndsOf` keeps the near ids (src/server/lib/records/the-other-ends-of.ts): the second module is a far end.
 *   3. the far ends read with `includeDeleted: true`: the deleted note is a far end.
 *   4. the far ends not cut to the light shape: the problem's `symptom` comes back.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
const ids: Record<string, string> = {}

type Row = { id: string; kind: string; data: Record<string, unknown> }
type Listed = { records: Row[]; farEnds?: Row[] }

async function file(name: string, kind: string, data: Record<string, unknown> = {}): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: { kind, title: `Test ${name}`, data } })
  expect(reply.statusCode, reply.body).toBe(201)
  ids[name] = (reply.json() as { record: { id: string } }).record.id
}

async function link(from: string, to: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/links', headers: PERSON, payload: { fromId: ids[from], toId: ids[to], type: 'relates_to' } })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function list(query: string): Promise<{ status: number; body: Listed }> {
  const reply = await app.inject({ method: 'GET', url: `/api/records${query}`, headers: PERSON })
  return { status: reply.statusCode, body: reply.json() as Listed }
}

const idsOf = (rows: readonly Row[] | undefined): string[] => (rows ?? []).map((row) => row.id).sort()
const named = (...names: string[]): string[] => names.map((name) => ids[name]!).sort()

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await file('claim', 'claim')
  await file('direction', 'direction')
  await file('task', 'task')
  await file('module', 'module')
  await file('second module', 'module')
  await file('problem', 'problem', { state: 'open', symptom: 'The test problem shows a symptom only its own page draws.' })
  await file('note', 'note')
  await link('claim', 'module')
  await link('module', 'problem')
  await link('module', 'second module')
  await link('note', 'module')
  const gone = await app.inject({ method: 'DELETE', url: `/api/records/${ids['note']!}`, headers: PERSON })
  expect(gone.statusCode, gone.body).toBeLessThan(300)
}, 60000)

afterAll(async () => {
  await app.close()
  db.close()
})

it('a family read answers its family and opens no record of another kind', async () => {
  const before = await list('?family=findings')
  expect(before.status).toBe(200)
  expect(idsOf(before.body.records)).toEqual(named('claim', 'direction'))

  // A TASK WHOSE STORED BODY CANNOT BE READ. The whole-project read opens it and fails; the family read must not.
  db.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run('not json', ids['task'])
  try {
    expect((await list('')).status, 'the control: a read that opens the task fails').toBe(500)
    const after = await list('?family=findings')
    expect(after.status, 'the family read did not open the task').toBe(200)
    expect(idsOf(after.body.records)).toEqual(named('claim', 'direction'))
  } finally {
    db.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run('{}', ids['task'])
  }
})

it('the far ends are the live records one link away, in the light shape, and never a row of the list', async () => {
  const { status, body } = await list('?family=structure&farEnds=light')
  expect(status).toBe(200)
  expect(idsOf(body.records)).toEqual(named('module', 'second module'))
  // The second module is joined to the first and is a row, so it is not a far end. The note is deleted, so it is
  // missing, which is what lets the page say the record at that end is deleted.
  expect(idsOf(body.farEnds)).toEqual(named('claim', 'problem'))
  const problem = body.farEnds?.find((row) => row.id === ids['problem'])
  expect(problem?.data['state'], 'the light shape keeps the state a chip draws').toBe('open')
  expect(problem?.data, 'and leaves out the words only the record page draws').not.toHaveProperty('symptom')

  const without = await list('?family=structure')
  expect(without.body, 'a read that does not ask for far ends carries none').not.toHaveProperty('farEnds')
})
