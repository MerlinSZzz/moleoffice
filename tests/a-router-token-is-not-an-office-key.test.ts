// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEVICE_HALF_COOKIE, DEVICE_HALF_HEADER, KEY_COOKIE, KEY_HEADER } from '../src/config/key-header.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const personKey = randomBytes(32).toString('hex')
const officeKey = randomBytes(32).toString('hex')
const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
let db: TestDb
let app: FastifyInstance
let address = ''
let runKey = ''
let routerToken = ''

async function post(path: string, headers: Record<string, string>, payload?: unknown) {
  return fetch(`${address}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) })
}

beforeAll(async () => {
  db = await freshDb()
  writeFileSync(join(dirname(db.file), 'keys.json'), `${JSON.stringify({ person: personKey, office: officeKey, providers: {} })}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  address = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  const agent = await post('/api/agents/started', person, { handle: 'test-run-worker', name: 'Test run worker', role: 'worker', runtime: 'dsh' })
  expect(agent.status).toBe(201)
  const filed = await post('/api/records', { [KEY_HEADER]: officeKey }, { kind: 'session', title: 'A running test session', data: { state: 'running', runtime: 'dsh', servingAgent: 'test-run-worker', startedByMoleOffice: true } })
  expect(filed.status).toBe(201)
  const result = await filed.json() as { record: { id: string }; runKey: { key: string } }
  runKey = result.runKey.key
  const { createRunTokenStore } = await import('../src/server/lib/keyrouter/run-tokens.ts')
  routerToken = createRunTokenStore(db.client.sqlite).mint(result.record.id, 'casting', [{ provider: 'deepseek', model: 'made-up' }], 1).token
  const closed = await post('/api/office/key-window/close', { ...person, [KEY_HEADER]: personKey })
  expect(closed.status).toBe(200)
}, 60_000)
afterAll(async () => { await app?.close(); db?.close() })

describe('a router token cannot prove an office identity', () => {
  const body = { kind: 'note', title: 'A run writes a note', data: { body: 'A made-up note.' } }

  it('refuses the router token in the header while accepting the same run’s office key', async () => {
    const refused = await post('/api/records', { [KEY_HEADER]: routerToken }, body)
    expect(refused.status).toBeGreaterThanOrEqual(400)
    const accepted = await post('/api/records', { [KEY_HEADER]: runKey }, body)
    expect(accepted.status).toBe(201)
  })

  // A BROWSER'S KEY IS NOW TWO HALVES, a cookie half and a header half, and the old cookie is no key. A run key is never
  // sent as two halves, so the router token is refused in the two places a browser's key is, with nothing accepted.
  it.each(['the old cookie', 'two halves'] as const)('refuses the router token in %s', async (place) => {
    const headers: Record<string, string> = place === 'the old cookie'
      ? { cookie: `${KEY_COOKIE}=${routerToken}` }
      : { cookie: `${DEVICE_HALF_COOKIE}=${routerToken.slice(0, 16)}`, [DEVICE_HALF_HEADER]: routerToken.slice(16) }
    const refused = await post('/api/records', headers, body)
    expect(refused.status).toBeGreaterThanOrEqual(400)
  })
})
