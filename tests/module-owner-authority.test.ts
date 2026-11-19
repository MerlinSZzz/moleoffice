// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
let person: Record<string, string>
const people = new Map<string, { id: string; key: string }>()
const agent = (role: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': `made-up-${role}`, 'x-mole-office-key': people.get(role)!.key,
})
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, any>, raw: reply.body }
}
async function read(id: string) {
  const reply = await call('GET', `/api/records/${id}`, person)
  expect(reply.status, reply.raw).toBe(200)
  return reply.body
}
const owner = (role: string) => ({ kind: 'agent', id: people.get(role)!.id })

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  for (const role of ['supervisor', 'worker', 'secretary']) {
    const made = await call('POST', '/api/agents/started', person, { handle: `made-up-${role}`, name: `Made-up ${role}`, role })
    expect(made.status, made.raw).toBe(201)
    people.set(role, { id: String(made.body.agent.id), key: String(made.body.whatToGiveIt.key) })
  }
}, 120_000)
afterAll(async () => { await app?.close(); db?.close() })

it('lets only the person or current owner name the next module owner', async () => {
  const made = await call('POST', '/api/records', person, { kind: 'module', title: 'Made-up chat module', data: { context: 'Made-up.', parts: [] } })
  expect(made.status, made.raw).toBe(201)
  const id = String(made.body.record.id)
  async function refused(role: string) {
    const before = await read(id)
    const reply = await call('PATCH', `/api/records/${id}`, agent(role), { dataPatch: { owner: owner(role) } })
    expect(reply.status, reply.raw).toBe(403)
    const { ONLY_THE_OWNER_NAMES_THE_OWNER } = await import('../src/server/lib/module-requirements.ts')
    expect(reply.body.error).toContain(ONLY_THE_OWNER_NAMES_THE_OWNER)
    const after = await read(id)
    expect(after.record.data).toEqual(before.record.data)
    expect(after.changes).toEqual(before.changes)
  }
  await refused('worker')
  await refused('secretary')
  const named = await call('PATCH', `/api/records/${id}`, person, { dataPatch: { owner: owner('supervisor') } })
  expect(named.status, named.raw).toBe(200)
  await refused('worker')
  await refused('secretary')
  const handed = await call('PATCH', `/api/records/${id}`, agent('supervisor'), { dataPatch: { owner: owner('worker') } })
  expect(handed.status, handed.raw).toBe(200)
  expect((await read(id)).record.data.owner).toEqual(owner('worker'))
  const cleared = await call('PATCH', `/api/records/${id}`, person, { dataPatch: { owner: null } })
  expect(cleared.status, cleared.raw).toBe(200)
  await refused('worker')
})

it('does not let a worker create a module naming itself as owner', async () => {
  const before = db.client.sqlite.prepare('SELECT COUNT(*) AS count FROM records').get()
  const refused = await call('POST', '/api/records', agent('worker'), { kind: 'module', title: 'Made-up chat module', data: { context: 'Made-up.', parts: [], owner: owner('worker') } })
  expect(refused.status, refused.raw).toBe(403)
  const { ONLY_THE_OWNER_NAMES_THE_OWNER } = await import('../src/server/lib/module-requirements.ts')
  expect(refused.body.error).toContain(ONLY_THE_OWNER_NAMES_THE_OWNER)
  expect(db.client.sqlite.prepare('SELECT COUNT(*) AS count FROM records').get()).toEqual(before)
})
