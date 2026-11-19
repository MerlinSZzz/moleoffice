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
const plan = { id: 'plan', name: 'Made-up plan', items: [{ id: 'plan-line', text: 'Made-up plan.', state: 'todo' }] }
const requirement = { id: 'requirements', name: 'Made-up requirements', items: [{ id: 'requirement-line', text: 'Made-up requirement.', state: 'todo' }] }

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, any>, raw: reply.body }
}
async function file(data: object) {
  const reply = await call('POST', '/api/records', person, { kind: 'module', title: 'Made-up chat module', data })
  expect(reply.status, reply.raw).toBe(201)
  return String(reply.body.record.id)
}
async function read(id: string) {
  const reply = await call('GET', `/api/records/${id}`, person)
  expect(reply.status, reply.raw).toBe(200)
  return reply.body
}

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  const made = await call('POST', '/api/agents/started', person, { handle: 'made-up-secretary', name: 'Made-up secretary', role: 'secretary' })
  expect(made.status, made.raw).toBe(201)
  secretary = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-secretary', 'x-mole-office-key': String(made.body.whatToGiveIt.key) }
}, 120_000)
afterAll(async () => { await app?.close(); db?.close() })

it('does not let a secretary put a plan into a new module', async () => {
  const before = db.client.sqlite.prepare('SELECT COUNT(*) AS count FROM records').get()
  const refused = await call('POST', '/api/records', secretary, { kind: 'module', title: 'Made-up module', data: { context: 'Made-up.', parts: [plan] } })
  expect(refused.status, refused.raw).toBe(403)
  const { ONLY_THE_MODULE_SUPERVISOR_WRITES_THE_PLAN } = await import('../src/server/lib/module-requirements.ts')
  expect(refused.body.error).toContain(ONLY_THE_MODULE_SUPERVISOR_WRITES_THE_PLAN)
  expect(db.client.sqlite.prepare('SELECT COUNT(*) AS count FROM records').get()).toEqual(before)
})

it('refuses requirements through whole-record and checklist doors even when the person asks', async () => {
  const id = await file({ context: 'Made-up.', parts: [] })
  const before = await read(id)
  for (const [method, url, body] of [
    ['PATCH', `/api/records/${id}`, { ifVersion: before.version, dataPatch: { parts: [requirement] } }],
    ['POST', `/api/records/${id}/parts`, { id: 'requirements', name: 'Made-up requirements' }],
  ] as const) {
    const refused = await call(method, url, person, body)
    expect(refused.status, refused.raw).toBe(403)
    const { USE_THE_REQUIREMENTS_DOOR } = await import('../src/server/lib/module-requirements.ts')
    expect(refused.body.error).toContain(USE_THE_REQUIREMENTS_DOOR)
    const after = await read(id)
    expect(after.record.data).toEqual(before.record.data)
    expect(after.changes).toEqual(before.changes)
  }
  const accepted = await call('POST', `/api/records/${id}/requirements`, person, { items: requirement.items })
  expect(accepted.status, accepted.raw).toBe(200)
  const current = await read(id)
  for (const [method, url, body] of [
    ['POST', `/api/records/${id}/checklist`, { partId: 'requirements', id: 'extra', text: 'Made-up.', state: 'todo' }],
    ['PATCH', `/api/records/${id}/checklist/requirement-line`, { text: 'Changed without the door.' }],
  ] as const) {
    const refused = await call(method, url, person, body)
    expect(refused.status, refused.raw).toBe(403)
    const { USE_THE_REQUIREMENTS_DOOR } = await import('../src/server/lib/module-requirements.ts')
    expect(refused.body.error).toContain(USE_THE_REQUIREMENTS_DOOR)
    const after = await read(id)
    expect(after.record.data).toEqual(current.record.data)
    expect(after.changes).toEqual(current.changes)
  }
})

it('refuses a secretary restoring an older plan without writing a revision', async () => {
  const id = await file({ context: 'Made-up.', parts: [plan] })
  const changed = await call('PATCH', `/api/records/${id}/checklist/plan-line`, person, { state: 'doing' })
  expect(changed.status, changed.raw).toBe(200)
  const before = await read(id)
  const refused = await call('POST', `/api/records/${id}/revisions/1/restore`, secretary, {})
  expect(refused.status, refused.raw).toBe(403)
  const { ONLY_THE_MODULE_SUPERVISOR_WRITES_THE_PLAN } = await import('../src/server/lib/module-requirements.ts')
  expect(refused.body.error).toContain(ONLY_THE_MODULE_SUPERVISOR_WRITES_THE_PLAN)
  const after = await read(id)
  expect(after.record.data).toEqual(before.record.data)
  expect(after.changes).toEqual(before.changes)
  expect(after.revisionSeq).toBe(before.revisionSeq)
})
