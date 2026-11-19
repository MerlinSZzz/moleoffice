// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A contact's projects are membership, not the projects where its messages or runs happened. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const THERE = 'made-up-other-project'
const AWAY = 'made-up-visited-project'
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const cases = [
  { handle: 'made-up-secretary', role: 'secretary', projects: [HERE] },
  { handle: 'made-up-supervisor', role: 'supervisor', projects: [HERE, THERE] },
  { handle: 'made-up-worker', role: 'worker', projects: [HERE] },
  { handle: 'made-up-retired', role: 'worker', projects: [HERE] },
  { handle: 'made-up-unassigned', role: 'worker', projects: [] },
] as const
let db: TestDb
let app: FastifyInstance
const ids = new Map<string, string>()

async function read<T>(url: string): Promise<T> {
  const response = await app.inject({ method: 'GET', url, headers: PERSON })
  expect(response.statusCode, response.body).toBe(200)
  return response.json() as T
}

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const project of [THERE, AWAY]) {
    const result = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: project, title: `Made-up ${project}` } })
    expect(result.statusCode, result.body).toBe(201)
  }
  for (const one of cases) {
    const record = db.api.createRecord({ workspaceId: HERE, kind: 'agent', title: `Made-up ${one.role}`, data: { handle: one.handle, runtime: 'claude-code', state: 'active', role: one.role }, actor: { type: 'human', id: THE_PERSON } })
    const row = db.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(record.id) as { id: string }
    ids.set(one.handle, row.id)
  }
  const sql = db.client.sqlite
  const supervisor = ids.get(cases[1].handle)!
  const worker = ids.get(cases[2].handle)!
  sql.prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE id = ?").run(supervisor, worker)
  sql.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(ids.get(cases[3].handle))
  const secondRecord = db.api.createRecord({ workspaceId: THERE, kind: 'agent', title: 'Made-up second membership', data: { handle: cases[1].handle, runtime: 'claude-code', state: 'active', role: 'supervisor' }, actor: { type: 'human', id: THE_PERSON } })
  expect(sql.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(secondRecord.id)).toEqual({ id: supervisor })
  sql.prepare('DELETE FROM agent_records WHERE agent_id = ?').run(ids.get(cases[4].handle))
  const message = await app.inject({ method: 'POST', url: '/api/records', headers: { ...PERSON, 'x-mole-office-workspace': AWAY, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': cases[0].handle }, payload: { kind: 'message', title: 'Made-up message', data: { body: 'Made-up message in another project.', to: [{ kind: 'person', id: THE_PERSON }] } } })
  expect(message.statusCode, message.body).toBe(201)
  // A past run in a third project does not make the supervisor a member there.
  const owner = (sql.prepare("SELECT owner_id AS id FROM records WHERE kind = 'agent' LIMIT 1").get() as { id: string }).id
  const timestamp = new Date().toISOString()
  sql.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, 'session', ?, ?, 'authored')").run(
    'made-up-visit', AWAY, owner, timestamp, timestamp, 'Made-up visit',
    JSON.stringify({ state: 'finished', servingAgentId: supervisor, servingAgent: cases[1].handle }),
  )
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

type Contact = { who: { kind: string; id: string } | null; projects: string[] }
type Row = { who: { kind: string; id: string }; projects: string[] }
const sorted = (projects: readonly string[]) => [...projects].sort()

describe('the projects of registered agents', () => {
  it('gives contacts their own projects even when no message has been exchanged', async () => {
    const result = await read<{ contacts: Contact[] }>('/api/messages/contacts')
    for (const one of cases) {
      const row = result.contacts.find(contact => contact.who?.id === ids.get(one.handle))
      expect(row, one.handle).toBeDefined()
      expect(sorted(row!.projects), one.handle).toEqual(sorted(one.projects))
    }
  })

  it('uses those same projects in the contact filter', async () => {
    const result = await read<{ contacts: Contact[] }>(`/api/messages/contact-list?project=${THERE}`)
    const found = result.contacts.flatMap(row => row.who?.kind === 'agent' ? [row.who.id] : [])
    expect(found).toContain(ids.get(cases[1].handle))
    expect(found).not.toContain(ids.get(cases[0].handle))
  })

  it('answers the same projects on each agent profile and in the agents list', async () => {
    const list = await read<{ rows: Row[] }>('/api/office/embassy')
    for (const one of cases) {
      const id = ids.get(one.handle)!
      const profile = await read<{ participant: { projects: string[] } }>(`/api/participants/agent/${id}/profile`)
      const row = list.rows.find(row => row.who.kind === 'agent' && row.who.id === id)
      expect(sorted(profile.participant.projects), one.handle).toEqual(sorted(one.projects))
      expect(row, one.handle).toBeDefined()
      expect(sorted(row!.projects), one.handle).toEqual(sorted(one.projects))
    }
  })
})
