// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'

let db: TestDb
let app: FastifyInstance
const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['made-up-one', 'made-up-two']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle, name: `made-up ${handle}`, workArea: ['src'] } })
    expect(made.statusCode).toBe(201)
  }
  db.client.sqlite.prepare("UPDATE message_delivery SET mark = 'seen'").run()
})
afterAll(async () => { await app.close(); db.close() })

async function ids(headers: Record<string, string>): Promise<string[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/messages/queued-agent-ids', headers })
  expect(reply.statusCode).toBe(200)
  const answer = reply.json() as { agentIds: string[] }
  expect(Object.keys(answer).filter((key) => key !== 'narrowedByPermission')).toEqual(['agentIds'])
  return answer.agentIds
}

async function oldIds(headers: Record<string, string>): Promise<string[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/messages?only=queued-for-agents&full=1', headers })
  expect(reply.statusCode).toBe(200)
  const all = reply.json() as { messages: { deliveries: { mark: string; to: { kind: string; id: string } }[] }[] }
  const registered = new Set((db.client.sqlite.prepare('SELECT id FROM agents').all() as {id: string}[]).map(one => one.id))
  return [...new Set(all.messages.flatMap(one => one.deliveries).filter(one => one.mark === 'queued' && one.to.kind === 'agent' && registered.has(one.to.id)).map(one => one.to.id))].sort()
}

it('answers only distinct queued registered agent ids and respects the pool visibility', async () => {
  expect(await ids(person)).toEqual([])
  const family = await app.inject({ method: 'GET', url: '/api/families/messages', headers: person })
  const door = (family.json() as { endpoints: { path: string; method: string; description: string }[] }).endpoints.find(one => one.path === '/api/messages/queued-agent-ids' && one.method === 'GET')
  const pool = (family.json() as { endpoints: { path: string; method: string; description: string }[] }).endpoints.find(one => one.path === '/api/messages' && one.method === 'GET')
  expect(door?.description).toBe(pool?.description)
  expect(door?.description).toContain(t('server.queuedAgentIds' as Parameters<typeof t>[0]))
  for (let n = 0; n < 40; n++) {
    db.api.createRecord({ workspaceId: 'default', kind: 'message', title: `made-up message ${n}`, data: { body: 'made-up', to: [{kind: 'agent', id: 'made-up-one'}] }, actor: { type: 'human', id: THE_PERSON } })
  }
  const first = await ids(person)
  expect(first.sort()).toEqual(await oldIds(person))
  expect(first).toHaveLength(1)
  db.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'made-up second recipient', data: { body: 'made-up', to: [{kind: 'agent', id: 'made-up-two'}] }, actor: { type: 'agent', id: 'made-up-one' } })
  for (const headers of [person, agent('made-up-one'), agent('made-up-two')]) {
    const result = await ids(headers)
    expect(result.sort()).toEqual(await oldIds(headers))
    expect(new Set(result).size).toBe(result.length)
  }
  db.client.sqlite.prepare("UPDATE message_delivery SET mark = 'seen'").run()
  expect(await ids(person)).toEqual([])
}, 120_000)
