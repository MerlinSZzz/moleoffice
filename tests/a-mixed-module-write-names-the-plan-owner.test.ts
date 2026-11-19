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

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle: 'made-up-secretary', name: 'Made-up secretary', role: 'secretary' } })
  expect(made.statusCode, made.body).toBe(201)
  secretary = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-secretary', 'x-mole-office-key': String(made.json().whatToGiveIt.key) }
}, 120_000)
afterAll(async () => { await app?.close(); db?.close() })

it('explains plan ownership when a secretary changes the plan and requirements together', async () => {
  const plan = { id: 'plan', name: 'Made-up plan', items: [{ id: 'plan-line', text: 'Made-up plan.', state: 'todo' }] }
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'module', title: 'Made-up chat module', data: { context: 'Made-up.', parts: [plan] } } })
  expect(made.statusCode, made.body).toBe(201)
  const id = String(made.json().record.id)
  const snapshot = () => JSON.stringify({
    record: db.client.sqlite.prepare('SELECT data, updated_at FROM records WHERE id = ?').get(id),
    changes: db.client.sqlite.prepare('SELECT * FROM changes WHERE record_id = ? ORDER BY append_order').all(id),
  })
  const before = snapshot()
  const answer = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: secretary, payload: {
    ifVersion: made.json().version,
    dataPatch: { parts: [
      { ...plan, items: [{ ...plan.items[0], text: 'Changed made-up plan.' }] },
      { id: 'requirements', name: 'Made-up requirements', items: [] },
    ] },
  } })
  expect(answer.statusCode, answer.body).toBe(403)
  const { ONLY_THE_MODULE_SUPERVISOR_WRITES_THE_PLAN } = await import('../src/server/lib/module-requirements.ts')
  expect(answer.json().error).toContain(ONLY_THE_MODULE_SUPERVISOR_WRITES_THE_PLAN)
  expect(snapshot()).toBe(before)
})
