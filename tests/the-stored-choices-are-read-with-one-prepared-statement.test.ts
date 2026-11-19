// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STORED CHOICES ARE READ WITH ONE PREPARED STATEMENT, AND IT IS THE SAME ANSWER, AS FRESH AS THE ROW.
 *
 * Wave 13y round 42 divided `theModelARunGets` into its parts on a made-up database of the live office's size and shape
 * (tools/build-a-made-up-office.ts). The second-largest part one change could make cheaper was `theStore` in
 * src/server/lib/run-models.ts: on that made-up database, of about 81 ms per process under `theModelARunGets`, 56 ms was
 * building and preparing the same no-parameter SELECT of `run_models` again on every call. It now prepares it once for
 * each database handle, the way `rowsOfRole` in src/server/lib/casting.ts and the runtime-for-agent statement in
 * src/server/lib/participants.ts do. A prepared statement still runs on every call, so a press on the Settings page
 * reaches the next run.
 *
 * Three cases:
 *
 * 1. THE ANSWER. `theModelARunGets` gives the same answer through every layer this part is on: an agent's own model, the
 *    Settings page's choice for a conversation, the Casting table's row for a builder and for a check, and no model at
 *    all. These hold on the code before the change too.
 * 3. NOTHING IS KEPT. The row is written again between two answers, and the second answer shows the new choice. This
 *    holds on the code before the change too; it is here so that a change that kept the parsed choices would turn red.
 *    MUTATION: keep the first answer's settings, and this case is red.
 *
 * HOW THE PREPARING IS COUNTED: the database's `prepare` is replaced before the reader is loaded, so every statement
 * prepared while `counting` is set is written down by its text.
 *
 * The choices are set through the product's own doors, except the row changed in the third case, which is written
 * straight into `run_models` so that case does not test the writer. Every row here is a synthetic fixture in this file's
 * own temporary test database.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })

let t: TestDb
let app: FastifyInstance
// THE SERVER'S OWN READER, loaded after the test database is open and the counter is in: loading it opens a database.
let runModels: typeof import('../src/server/lib/run-models.ts')
let workerId = ''
let counting = false
/** The text of every statement prepared while `counting` is set. */
const prepared: string[] = []

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}

async function setOffice(change: unknown): Promise<void> {
  const reply = await call('POST', '/api/office/run-models', PERSON, change)
  expect(reply.statusCode, reply.body).toBe(200)
}

async function setAgent(handle: string, model: string | null): Promise<void> {
  const reply = await call('POST', `/api/office/run-models/agent/${handle}`, PERSON, { model })
  expect(reply.statusCode, reply.body).toBe(200)
}

/** Set the model and program of one role's marked every-project casting, or empty both with null. */
async function cast(role: string, program: string | null, model: string | null): Promise<void> {
  const marked = ((await call('GET', `/api/casting/for/${role}`, PERSON)).json() as { casting: { id: number } | null }).casting
  const reply =
    marked === null
      ? await call('POST', `/api/casting/${role}`, PERSON, { program: { value: program }, model: { value: model } })
      : await call('PATCH', `/api/casting/rows/${String(marked.id)}`, PERSON, { program: { value: program }, model: { value: model } })
  expect(reply.statusCode, reply.body).toBe(marked === null ? 201 : 200)
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await call('POST', '/api/agents/started', headers, payload)
  expect(reply.statusCode, reply.body).toBe(201)
}

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE READER IS LOADED, so no statement it prepares is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    if (counting) prepared.push(text)
    return prepare.call(this, text)
  }
  app = (await apiApp()).app
  await app.ready()
  await register(PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary', runtime: 'claude-code' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'model-worker', name: 'Model worker', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  workerId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get('model-worker') as { id: string }).id
  runModels = await import('../src/server/lib/run-models.ts')
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

it('takes the agent’s own model for a builder', async () => {
  await setAgent('model-worker', 'the-agents-own-model')
  const answered = runModels.theModelARunGets({ place: 'builder', agentId: workerId, runtime: 'claude-code' }, {})
  expect(answered).toMatchObject({ model: 'the-agents-own-model', from: 'the agent', runtime: 'claude-code' })
  await setAgent('model-worker', null)
})

it('takes the Settings page’s choice for a conversation', async () => {
  await setOffice({ places: { conversation: { runtime: 'claude-code', model: 'the-conversation-model' } } })
  const answered = runModels.theModelARunGets({ place: 'conversation', agentId: workerId, runtime: 'claude-code' }, {})
  expect(answered).toMatchObject({ model: 'the-conversation-model', from: 'the place' })
  // AND ON A RUNTIME THE CHOICE DOES NOT NAME, IT IS NOT TAKEN.
  const other = runModels.theModelARunGets({ place: 'conversation', agentId: workerId, runtime: 'opencode' }, {})
  expect(other.from).not.toBe('the place')
  await setOffice({ places: { conversation: null } })
})

it('takes the Casting table’s row for a builder, and for a check', async () => {
  await cast('worker', 'claude-code', 'the-role-model')
  const builder = runModels.theModelARunGets({ place: 'builder', agentId: workerId, runtime: 'claude-code' }, {})
  expect(builder).toMatchObject({ model: 'the-role-model', from: 'the role' })

  await cast('inspector', 'claude-code', 'the-check-model')
  const check = runModels.theModelARunGets({ place: 'check', agentId: workerId, runtime: null }, {})
  expect(check).toMatchObject({ model: 'the-check-model', from: 'the role' })

  await cast('worker', null, null)
  await cast('inspector', null, null)
})

it('names no model when nothing names one, and says where one is named', async () => {
  const builder = runModels.theModelARunGets({ place: 'builder', agentId: workerId, runtime: 'claude-code' }, {})
  expect(builder).toMatchObject({ model: null, from: 'none' })
  const conversation = runModels.theModelARunGets({ place: 'conversation', agentId: workerId, runtime: 'claude-code' }, {})
  expect(conversation).toMatchObject({ model: null, from: 'none' })
})


it('reads the row again, so a choice written between two answers is shown', async () => {
  await setOffice({ places: { conversation: { runtime: 'claude-code', model: 'before-the-change' } } })
  const ask = { place: 'conversation', agentId: workerId, runtime: 'claude-code' } as const
  expect(runModels.theModelARunGets(ask, {}).model).toBe('before-the-change')

  // A WRITE STRAIGHT INTO THE ROW, in the shape the store reads, so a reader that kept its first answer is caught.
  t.client.sqlite
    .prepare(
      'INSERT INTO run_models (only_row, settings, updated_at, updated_by_kind, updated_by_id, authority) VALUES (1, ?, ?, ?, ?, NULL) ' +
        'ON CONFLICT(only_row) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at, ' +
        'updated_by_kind = excluded.updated_by_kind, updated_by_id = excluded.updated_by_id, authority = excluded.authority',
    )
    .run(JSON.stringify({ places: { conversation: { runtime: 'claude-code', model: 'after-the-change' } } }), '2026-10-19 03:00:00', 'human', THE_PERSON)

  expect(runModels.theModelARunGets(ask, {}).model).toBe('after-the-change')
  // AND CLEARED BETWEEN TWO ANSWERS, THE NEXT ANSWER NAMES NONE.
  t.client.sqlite.prepare('DELETE FROM run_models WHERE only_row = 1').run()
  expect(runModels.theModelARunGets(ask, {}).model).toBeNull()
})
