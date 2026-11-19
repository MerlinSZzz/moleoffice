// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A real test office, with made-up choices. No agent or merge tool is started. */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'

let t: TestDb, app: FastifyInstance, settings: WorkerSettings
const NAME = 'MOLE_OFFICE_CONFLICT_RESOLVING'
const AS_OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
let address: string

beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app; await app.listen({host: '127.0.0.1', port: 0})
  const bound = app.server.address()
  if (bound === null || typeof bound === 'string') throw new Error('The test office has no TCP address.')
  address = `http://127.0.0.1:${bound.port}`
}, 60_000)

afterAll(async () => {
  await app.close(); t.close()
})

beforeEach(() => {
  const checkout = aCheckoutForATestRun()
  settings = {api: address, workspace: 'default', session: null, stopWithPid: null, checkout, runs: 0, hops: 3, outputRoot: checkout, env: {...process.env}, mergesOnly: true}
})
afterEach(() => { vi.restoreAllMocks() })

it('asks the run-out door once each pass, including merges-only mode, and the office removes an ended choice', async () => {
  const saved = await app.inject({method: 'POST', url: '/api/office/settings', headers: AS_OWNER, payload: {changes: [{name: NAME, value: '1', until: '2099-01-01 07:00'}], because: 'Made-up temporary gate choice'}})
  expect(saved.statusCode, saved.body).toBe(200)
  t.client.sqlite.prepare('UPDATE runtime_settings SET until = ? WHERE name = ?').run('2000-01-01 7:00', NAME)
  const fetch = vi.spyOn(globalThis, 'fetch')
  await onePass(settings, [], [], [])
  expect(t.client.sqlite.prepare('SELECT name FROM runtime_settings WHERE name = ?').get(NAME)).toBeUndefined()
  await onePass(settings, [], [], [])
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/worker/gates/run-out'))).toHaveLength(2)
})

it('says a run-out refusal once and continues each pass with the merge list', async () => {
  const realFetch = globalThis.fetch
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => String(url).endsWith('/api/worker/gates/run-out')
    ? Promise.resolve(new Response(JSON.stringify({error: 'Made-up gate refusal.'}), {status: 503, headers: {'content-type': 'application/json'}}))
    : realFetch(url, init))
  const lines: string[] = []
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { lines.push(String(chunk)); return true })
  await onePass(settings, [], [], [])
  await onePass(settings, [], [], [])
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/worker/gates/run-out'))).toHaveLength(2)
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/worker/merges'))).toHaveLength(2)
  expect(lines.filter(line => line.includes('Made-up gate refusal.'))).toHaveLength(1)
})
