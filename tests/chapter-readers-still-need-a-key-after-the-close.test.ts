// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
let db: TestDb, app: FastifyInstance, address: string, person: Record<string, string>, agent: Record<string, string>
beforeAll(async () => {
  db = await freshDb(); app = (await apiApp()).app; await app.ready(); address = await app.listen({ port: 0, host: '127.0.0.1' })
  person = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts'); copyTheDefaultRegulationsOnce()
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle: 'made-up-keyed-reader', name: 'Made up keyed reader', role: 'worker' } }); expect(started.statusCode, started.body).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts'), { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  agent = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-keyed-reader', 'x-mole-office-key': makeAnAgentKey(agentByHandle('made-up-keyed-reader')!.id, null) }
  const closed = await fetch(address + '/api/office/key-window/close', { method: 'POST', headers: person }); expect(closed.status, await closed.text()).toBe(200)
})
afterAll(async () => { await app.close(); db.close() })
const snapshot = () => JSON.stringify(['records', 'revisions', 'changes'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))

it('selection, preview and history refuse unproved readers after the close and still accept proved readers', async () => {
  for (const [path, method, body] of [
    ['/chapters', 'GET', undefined], ['/chapters/preview', 'POST', { n: 1, from: 'shipped' }], ['/chapters/1/history', 'GET', undefined],
  ] as const) {
    const before = snapshot(), url = address + '/api/office-regulations' + path
    const refused = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-unproved-reader' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    expect(refused.status, await refused.text()).toBe(403); expect(snapshot()).toBe(before)
    const accepted = await fetch(url, { method, headers: person, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    expect(accepted.status, await accepted.text()).toBe(200); expect(snapshot()).toBe(before)
    const ordinary = await fetch(url, { method, headers: agent, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    expect(ordinary.status, await ordinary.text()).toBe(200); expect(snapshot()).toBe(before)
  }
})
