// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let db: TestDb
let app: FastifyInstance
let person: Record<string, string>
const agents = new Map<string, { id: string; key: string }>()
const personHeaders = () => person
const agentHeaders = (role: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': `made-up-${role}`,
  'x-mole-office-key': agents.get(role)!.key,
})

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: object) {
  const result = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: result.statusCode, body: result.json() as Record<string, any>, raw: result.body }
}

async function register(role: string, card: string): Promise<void> {
  const handle = `made-up-${role}`
  const result = await call('POST', '/api/agents/started', person, { handle, name: handle, role: card })
  expect(result.status, result.raw).toBe(201)
  agents.set(role, { id: String(result.body.agent.id), key: String(result.body.whatToGiveIt.key) })
}

async function moduleWithPlan(owner = 'supervisor', includePlan = true) {
  const result = await call('POST', '/api/records', person, {
    kind: 'module', title: 'Made-up chat module', data: {
      context: 'Made-up module for these requirements.',
      owner: { kind: 'agent', id: agents.get(owner)!.id },
      parts: includePlan ? [{ id: 'plan', name: 'Made-up plan', items: [{ id: 'made-up-plan-line', text: 'A made-up plan line.', state: 'todo' }] }] : [],
    },
  })
  expect(result.status, result.raw).toBe(201)
  return String(result.body.record.id)
}

async function read(id: string) {
  const result = await call('GET', `/api/records/${id}`, personHeaders())
  expect(result.status, result.raw).toBe(200)
  return result.body
}
const requirements = (id: string, headers: Record<string, string>, text: string) =>
  call('POST', `/api/records/${id}/requirements`, headers, { items: [{ id: 'made-up-requirement', text, state: 'todo' }] })

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  await register('secretary', 'secretary')
  await register('supervisor', 'supervisor')
  await register('worker', 'worker')
}, 120_000)
afterAll(async () => { await app?.close(); db?.close() })

describe('a module keeps its requirements apart from its plan', () => {
  it('keeps both update times and authors while the current requirements show the latest lines', async () => {
    const id = await moduleWithPlan()
    const first = await requirements(id, agentHeaders('secretary'), 'A first made-up requirement.')
    expect(first.status, first.raw).toBe(200)
    const second = await requirements(id, agentHeaders('secretary'), 'A second made-up requirement.')
    expect(second.status, second.raw).toBe(200)
    const fetched = await read(id)
    const parts = fetched.record.data.parts as { id: string; items: { text: string }[] }[]
    expect(parts.find(part => part.id === 'requirements')?.items[0]?.text).toBe('A second made-up requirement.')
    const history = (fetched.changes as { field: string; at: string; actorId: string }[]).filter(change => change.field === 'data.requirementsUpdate')
    expect(history).toHaveLength(2)
    for (const change of history) {
      expect(change.at).toBeTruthy()
      expect(change.actorId).toBe('made-up-secretary')
    }
    expect(parts.find(part => part.id === 'plan')?.items[0]?.text).toBe('A made-up plan line.')
  })

  it('refuses a worker requirements update without changing the module or its history', async () => {
    const id = await moduleWithPlan()
    const before = await read(id)
    const refused = await requirements(id, agentHeaders('worker'), 'An unwanted made-up line.')
    expect(refused.status).toBe(403)
    const { ONLY_THE_SECRETARY_UPDATES_REQUIREMENTS } = await import('../src/server/lib/module-requirements.ts')
    expect(refused.body.error).toContain(ONLY_THE_SECRETARY_UPDATES_REQUIREMENTS)
    const after = await read(id)
    expect(after.record.data).toEqual(before.record.data)
    expect(after.changes).toEqual(before.changes)
  })

  it('refuses a secretary or worker through each plan-writing door and keeps the record unchanged', async () => {
    for (const role of ['secretary', 'worker']) {
      for (const door of ['parts', 'checklist', 'item', 'patch']) {
        const id = await moduleWithPlan('supervisor', door !== 'parts')
        const before = await read(id)
        const method = door === 'item' || door === 'patch' ? 'PATCH' : 'POST'
        const url = door === 'parts' ? `/api/records/${id}/parts` : door === 'checklist' ? `/api/records/${id}/checklist` : door === 'item' ? `/api/records/${id}/checklist/made-up-plan-line` : `/api/records/${id}`
        const payload = door === 'parts' ? { id: 'plan', name: 'A replacement made-up plan' } : door === 'checklist' ? { partId: 'plan', id: 'made-up-extra-line', text: 'A made-up line.', state: 'todo' } : door === 'item' ? { text: 'A changed made-up line.' } : { ifVersion: before.version, dataPatch: { parts: [] } }
        const refused = await call(method, url, agentHeaders(role), payload)
        expect(refused.status, `${role} ${door}: ${refused.raw}`).toBe(403)
        const { ONLY_THE_MODULE_SUPERVISOR_WRITES_THE_PLAN } = await import('../src/server/lib/module-requirements.ts')
        expect(refused.body.error).toContain(ONLY_THE_MODULE_SUPERVISOR_WRITES_THE_PLAN)
        const after = await read(id)
        expect(after.record.data).toEqual(before.record.data)
        expect(after.changes).toEqual(before.changes)
      }
    }
  })

  it('allows the named supervisor and person to write the plan, but refuses a secretary even when named owner', async () => {
    const id = await moduleWithPlan()
    const changed = await call('PATCH', `/api/records/${id}/checklist/made-up-plan-line`, agentHeaders('supervisor'), { state: 'doing' })
    expect(changed.status, changed.raw).toBe(200)
    const byPerson = await call('PATCH', `/api/records/${id}/checklist/made-up-plan-line`, person, { state: 'done' })
    expect(byPerson.status, byPerson.raw).toBe(200)
    const secretaryOwned = await moduleWithPlan('secretary')
    const before = await read(secretaryOwned)
    const refused = await call('PATCH', `/api/records/${secretaryOwned}/checklist/made-up-plan-line`, agentHeaders('secretary'), { state: 'doing' })
    expect(refused.status).toBe(403)
    expect((await read(secretaryOwned)).record.data).toEqual(before.record.data)
  })
})
