// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let office: TestDb
let app: FastifyInstance
const headers = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

beforeAll(async () => {
  office = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app?.close()
  office?.close()
})

it('orders equally updated recent reports by descending id', async () => {
  const insert = office.client.sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, kind, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const ids = ['made-up-report-a', 'made-up-report-z']
  for (const id of ids) insert.run(id, 'default', THE_TEST_OFFICES_OWNER.id, 'report', id, '{}', '2040-01-01 00:00:00', '2040-01-01 00:00:00')
  const reply = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers })
  expect(reply.statusCode, reply.body).toBe(200)
  expect((reply.json() as { recent: { id: string }[] }).recent.map((row) => row.id)).toEqual([...ids].reverse())
})

it('orders equally updated modules in the brief by descending id', async () => {
  const insert = office.client.sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, kind, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const ids = ['made-up-module-a', 'made-up-module-z']
  for (const id of ids) insert.run(id, 'default', THE_TEST_OFFICES_OWNER.id, 'module', id, '{}', '2040-01-01 00:00:00', '2040-01-01 00:00:00')
  const reply = await app.inject({ method: 'GET', url: '/api/brief', headers })
  expect(reply.statusCode, reply.body).toBe(200)
  expect((reply.json() as { modules: { id: string }[] }).modules.map((row) => row.id)).toEqual([...ids].reverse())
})

it('names equally updated pipelines by descending id in the planning refusal', async () => {
  const handle = 'made-up-planner'
  const registration = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, role: 'worker' } })
  expect(registration.statusCode, registration.body).toBe(201)
  const agentId = (registration.json() as { agent: { id: string } }).agent.id
  const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
  const module = office.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'made-up planning module', data: { state: 'active', planner: { kind: 'agent', id: agentId } }, actor }).id
  const session = office.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'made-up planning session', data: { state: 'running', servingAgent: handle, doing: 'made-up planning' }, actor }).id
  const insert = office.client.sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, kind, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const ids = ['made-up-pipeline-a', 'made-up-pipeline-z']
  for (const id of ids) {
    insert.run(id, 'default', THE_TEST_OFFICES_OWNER.id, 'pipeline', id, '{"blockIds":[]}', '2040-01-01 00:00:00', '2040-01-01 00:00:00')
    office.api.createLink({ fromId: id, toId: module, type: 'relates_to', actor })
  }
  office.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id IN (?, ?)').run('2040-01-01 00:00:00', ...ids)
  const reply = await app.inject({
    method: 'POST', url: `/api/modules/${module}/plan-step-done`,
    headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-session': session },
    payload: { pipeline: 'made-up-other-pipeline' },
  })
  expect(reply.statusCode, reply.body).toBe(409)
  const error = (reply.json() as { error: string }).error
  expect(error).toContain(ids[0])
  expect(error).toContain(ids[1])
  expect(error.indexOf(ids[1]!)).toBeLessThan(error.indexOf(ids[0]!))
})

it('names equally updated agents by descending id in the work-domain refusal', async () => {
  const insert = office.client.sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, kind, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const ids = ['made-up-agent-a', 'made-up-agent-z']
  const handles = ['example-first', 'example-last']
  ids.forEach((id, i) => insert.run(id, 'default', THE_TEST_OFFICES_OWNER.id, 'agent', id, JSON.stringify({ handle: handles[i], state: 'active' }), '2040-01-01 00:00:00', '2040-01-01 00:00:00'))
  const reply = await app.inject({
    method: 'POST', url: '/api/records', headers,
    payload: { kind: 'work_domain', title: 'made-up invalid domain', data: { objective: 'made-up work', agent: 'made-up-missing-agent', session: 'made-up-missing-session' } },
  })
  expect(reply.statusCode, reply.body).toBe(400)
  const error = (reply.json() as { error: string }).error
  expect(error).toContain(handles[0])
  expect(error).toContain(handles[1])
  expect(error.indexOf(handles[1]!)).toBeLessThan(error.indexOf(handles[0]!))
})

it('orders equally updated open work domains by descending id', async () => {
  const insert = office.client.sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, kind, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const ids = ['made-up-domain-a', 'made-up-domain-z']
  for (const id of ids) insert.run(id, 'default', THE_TEST_OFFICES_OWNER.id, 'work_domain', id, '{}', '2040-01-01 00:00:00', '2040-01-01 00:00:00')
  const reply = await app.inject({ method: 'GET', url: '/api/work-domains', headers })
  expect(reply.statusCode, reply.body).toBe(200)
  expect((reply.json() as { domains: { id: string }[] }).domains.map((row) => row.id)).toEqual([...ids].reverse())
})
