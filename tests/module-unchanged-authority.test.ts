// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
let person: Record<string, string>
let secretary: Record<string, string>
let supervisorId: string

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, any>, raw: reply.body }
}

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  const supervisor = await call('POST', '/api/agents/started', person, { handle: 'made-up-supervisor', name: 'Made-up supervisor', role: 'supervisor' })
  expect(supervisor.status, supervisor.raw).toBe(201)
  supervisorId = String(supervisor.body.agent.id)
  const made = await call('POST', '/api/agents/started', person, { handle: 'made-up-secretary', name: 'Made-up secretary', role: 'secretary' })
  expect(made.status, made.raw).toBe(201)
  secretary = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-secretary', 'x-mole-office-key': String(made.body.whatToGiveIt.key) }
}, 120_000)
afterAll(async () => { await app?.close(); db?.close() })

it('accepts unchanged owner, requirements and plan from a caller who cannot change them', async () => {
  const plan = { id: 'plan', name: 'Made-up plan', items: [{ id: 'plan-line', text: 'Made-up plan.', state: 'todo' }] }
  const requirement = { id: 'requirements', name: 'Made-up requirements', items: [{ id: 'requirement-line', text: 'Made-up requirement.', state: 'todo' }] }
  const made = await call('POST', '/api/records', person, { kind: 'module', title: 'Made-up chat module', data: { context: 'Made-up.', owner: { kind: 'agent', id: supervisorId }, parts: [plan] } })
  expect(made.status, made.raw).toBe(201)
  const id = String(made.body.record.id)
  // Model an older module that already had requirements before this door existed.
  db.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.parts', json(?)) WHERE id = ?").run(JSON.stringify([plan, requirement]), id)
  const before = await call('GET', `/api/records/${id}`, person)
  expect(before.status, before.raw).toBe(200)
  const { owner, parts } = before.body.record.data
  const answer = await call('PATCH', `/api/records/${id}`, secretary, { dataPatch: { owner, parts } })
  expect(answer.status, answer.raw).toBe(200)
  expect(answer.body.nothingWritten).toEqual(expect.any(String))
  const after = await call('GET', `/api/records/${id}`, person)
  expect(after.body.record.data).toEqual(before.body.record.data)
  expect(after.body.changes).toEqual(before.body.changes)
  expect(after.body.revisionSeq).toBe(before.body.revisionSeq)
})
