// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'

type Agent = { id: string; key: string; handle: string }
let office: TestDb
let app: FastifyInstance
let personId: string
let secretaryRole: string
let first: Agent
let second: Agent
let worker: Agent
let stranger: Agent

function headers(kind: 'human' | 'agent', id: string, key?: string) {
  return {
    'content-type': 'application/json', 'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': kind, 'x-mole-office-actor-id': id,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  }
}
const person = () => headers('human', personId)
const as = (agent: Agent) => headers('agent', agent.handle, agent.key)

async function register(handle: string, by: ReturnType<typeof headers>, role?: string): Promise<Agent> {
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: by,
    payload: { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) },
  })
  expect(reply.statusCode).toBe(201)
  const body = reply.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
  expect(body.whatToGiveIt.key).toBeTruthy()
  return { id: body.agent.id, key: body.whatToGiveIt.key, handle }
}

function row(id: string): { started_by_kind: string | null; started_by_id: string | null; owner_kind: string | null; owner_id: string | null } {
  const columns = office.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  const kind = columns.some((column) => column.name === 'owner_kind') ? 'owner_kind' : 'NULL AS owner_kind'
  return office.client.sqlite.prepare(`SELECT started_by_kind, started_by_id, ${kind}, owner_id FROM agents WHERE id = ?`).get(id) as ReturnType<typeof row>
}

async function handOver(target: Agent, owner: { kind: string; id: string }, by: ReturnType<typeof headers>) {
  return app.inject({
    method: 'POST', url: `/api/agents/${target.id}/owner`, headers: by,
    payload: { owner, because: 'A test hand-over' },
  })
}

beforeAll(async () => {
  office = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  personId = (await import('../src/shared/person.ts')).THE_PERSON
  secretaryRole = (await import('../src/server/lib/roles.ts')).theRoleCards().elevation.onlyThisCardCanHoldIt
  first = await register('first-secretary', person(), secretaryRole)
  second = await register('second-secretary', person(), secretaryRole)
  stranger = await register('other-agent', person())
  worker = await register('a-worker', as(first))
}, 120_000)

afterAll(async () => {
  await app?.close()
  office?.close()
})

describe('an agent’s owner', () => {
  it('starts with its person or agent starter as its owner', () => {
    expect(row(worker.id)).toMatchObject({ started_by_kind: 'agent', started_by_id: first.id, owner_kind: 'agent', owner_id: first.id })
    expect(row(first.id)).toMatchObject({ started_by_kind: 'person', started_by_id: personId, owner_kind: 'person', owner_id: personId })
  })

  it('keeps a person owner when its starter later changes', async () => {
    const owned = await register('person-owned-before-starter-move', person())
    const reply = await app.inject({ method: 'POST', url: `/api/agents/${owned.id}/starter`, headers: { ...person(), ...thePersonsKeyHeader() }, payload: { to: first.id, because: 'A test starter change', atOnce: true } })
    expect(reply.statusCode).toBe(200)
    expect(row(owned.id)).toMatchObject({ started_by_kind: 'agent', started_by_id: first.id, owner_kind: 'person', owner_id: personId })
    const { readParticipant } = await import('../src/server/db/read-participant.ts')
    const { whoIsToldOfTheRun } = await import('../src/server/lib/who-is-told-of-a-seal.ts')
    const agent = readParticipant({ kind: 'agent', id: owned.id })
    if (agent === null || !('startedBy' in agent)) throw new Error('The test agent is missing.')
    expect(whoIsToldOfTheRun(agent)).toMatchObject({ to: { kind: 'person', id: personId } })
  })

  it('lets the current owner hand over and preserves the starter', async () => {
    const reply = await handOver(worker, { kind: 'agent', id: second.id }, as(first))
    expect(reply.statusCode).toBe(200)
    expect(row(worker.id)).toMatchObject({ started_by_kind: 'agent', started_by_id: first.id, owner_id: second.id })
  })

  it('refuses the former starter after the hand-over', async () => {
    const reply = await handOver(worker, { kind: 'agent', id: first.id }, as(first))
    expect(reply.statusCode).toBe(403)
    expect(typeof reply.json()['error']).toBe('string')
    expect(reply.json()['error'].length).toBeGreaterThan(0)
    expect(row(worker.id).owner_id).toBe(second.id)
  })

  it('refuses the agent itself', async () => {
    const reply = await handOver(worker, { kind: 'agent', id: first.id }, as(worker))
    expect(reply.statusCode).toBe(403)
    expect(typeof reply.json()['error']).toBe('string')
    expect(reply.json()['error'].length).toBeGreaterThan(0)
    expect(row(worker.id).owner_id).toBe(second.id)
  })

  it('refuses an unrelated agent', async () => {
    const reply = await handOver(worker, { kind: 'agent', id: first.id }, as(stranger))
    expect(reply.statusCode).toBe(403)
    expect(typeof reply.json()['error']).toBe('string')
    expect(reply.json()['error'].length).toBeGreaterThan(0)
    expect(row(worker.id).owner_id).toBe(second.id)
  })

  it('lets the person hand the agent back', async () => {
    const reply = await handOver(worker, { kind: 'agent', id: first.id }, person())
    expect(reply.statusCode).toBe(200)
    expect(row(worker.id)).toMatchObject({ started_by_id: first.id, owner_id: first.id })
  })

  for (const [label, recipient] of [
    ['a person', () => ({ kind: 'person', id: personId })],
    ['an unregistered agent', () => ({ kind: 'agent', id: 'unknown-agent' })],
    ['a non-secretary', () => ({ kind: 'agent', id: stranger.id })],
    ['the agent itself', () => ({ kind: 'agent', id: worker.id })],
  ] as const) {
    it(`refuses ${label} as the new owner`, async () => {
      const reply = await handOver(worker, recipient(), person())
      expect(reply.statusCode).toBeGreaterThanOrEqual(400)
      expect(typeof reply.json()['error']).toBe('string')
    expect(reply.json()['error'].length).toBeGreaterThan(0)
      expect(row(worker.id).owner_id).toBe(first.id)
    })
  }

  it('refuses a retired secretary as the new owner', async () => {
    const retired = await register('retired-secretary', person(), secretaryRole)
    office.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(retired.id)
    const reply = await handOver(worker, { kind: 'agent', id: retired.id }, person())
    expect(reply.statusCode).toBeGreaterThanOrEqual(400)
    expect(typeof reply.json()['error']).toBe('string')
    expect(reply.json()['error'].length).toBeGreaterThan(0)
    expect(row(worker.id).owner_id).toBe(first.id)
  })

  it('refuses a secretary below the agent in its ownership chain', async () => {
    const child = await register('child-secretary', person(), secretaryRole)
    setFixtureOwner(office.client.sqlite, worker.id, child.id, 'id')
    const reply = await handOver(worker, { kind: 'agent', id: child.id }, person())
    expect(reply.statusCode).toBeGreaterThanOrEqual(400)
    expect(typeof reply.json()['error']).toBe('string')
    expect(reply.json()['error'].length).toBeGreaterThan(0)
    expect(row(worker.id).owner_id).toBe(first.id)
  })

  it('moves later run notices through the hand-over door without changing the starter', async () => {
    const owned = await register('notices-through-door', as(first))
    const { tellTheStarterOfTheNotice } = await import('../src/server/lib/launcher-notices.ts')
    const oneNotice = () => {
      const id = office.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A run for the hand-over', data: { state: 'running', runtime: 'claude-code', servingAgent: owned.handle, servingAgentId: owned.id }, actor: office.api.HUMAN }).id
      const result = tellTheStarterOfTheNotice('codex-capacity', null, { data: {} }, office.api.getRecord(id)!)
      expect(result).toHaveProperty('told')
      return office.api.getRecord((result as { told: string }).told)!.data['to']
    }
    expect(oneNotice()).toEqual([{ kind: 'agent', id: first.id }])
    expect((await handOver(owned, { kind: 'agent', id: second.id }, as(first))).statusCode).toBe(200)
    expect(oneNotice()).toEqual([{ kind: 'agent', id: second.id }])
    expect(row(owned.id)).toMatchObject({ started_by_kind: 'agent', started_by_id: first.id, owner_id: second.id })
  })

  it('refuses an owner whose request does not prove its own key', async () => {
    const owned = await register('unproved-owner-worker', as(first))
    const reply = await handOver(owned, { kind: 'agent', id: second.id }, headers('agent', first.handle))
    expect([401, 403]).toContain(reply.statusCode)
    expect(row(owned.id).owner_id).toBe(first.id)
  })

  it('refuses an unrelated raised secretary when the person kept this authority', async () => {
    const delegate = await register('raised-without-grant', person(), secretaryRole)
    const raised = await app.inject({ method: 'POST', url: `/api/roles/elevation/${delegate.handle}`, headers: { ...person(), ...thePersonsKeyHeader() }, payload: { reason: 'A test grant', endsWhen: 'when you say' } })
    expect(raised.statusCode).toBe(201)
    const owned = await register('raised-without-grant-worker', as(first))
    const { setThisOfficesAnswer } = await import('../src/server/lib/what-the-grant-carries.ts')
    setThisOfficesAnswer('agent.owner-move', 'kept', { type: 'human', id: personId })
    try {
      const reply = await app.inject({ method: 'POST', url: `/api/agents/${owned.id}/owner`, headers: as(delegate), payload: { owner: { kind: 'agent', id: second.id }, because: 'A test hand-over', ...FOR_THE_PERSON } })
      expect(reply.statusCode).toBe(403)
      expect(row(owned.id).owner_id).toBe(first.id)
    } finally {
      setThisOfficesAnswer('agent.owner-move', 'default', { type: 'human', id: personId })
    }
  })

  it('lets a secretary acting under the person’s grant hand an agent over', async () => {
    const delegate = await register('person-granted-secretary', person(), secretaryRole)
    const raised = await app.inject({ method: 'POST', url: `/api/roles/elevation/${delegate.handle}`, headers: { ...person(), ...thePersonsKeyHeader() }, payload: { reason: 'A test grant', endsWhen: 'when you say' } })
    expect(raised.statusCode).toBe(201)
    const owned = await register('grant-owned-worker', as(first))
    const reply = await app.inject({ method: 'POST', url: `/api/agents/${owned.id}/owner`, headers: as(delegate), payload: { owner: { kind: 'agent', id: second.id }, because: 'A test hand-over', ...FOR_THE_PERSON } })
    expect(reply.statusCode).toBe(200)
    expect(row(owned.id)).toMatchObject({ started_by_id: first.id, owner_id: second.id })
  })

  it('honours the person’s answer for a raised secretary at the hand-over door', async () => {
    const delegate = await register('grant-limited-secretary', person(), secretaryRole)
    const raised = await app.inject({ method: 'POST', url: `/api/roles/elevation/${delegate.handle}`, headers: { ...person(), ...thePersonsKeyHeader() }, payload: { reason: 'A test grant', endsWhen: 'when you say' } })
    expect(raised.statusCode).toBe(201)
    const owned = await register('grant-limited-worker', as(first))
    const { setThisOfficesAnswer } = await import('../src/server/lib/what-the-grant-carries.ts')
    const answer = (value: 'kept' | 'may-press' | 'default') => setThisOfficesAnswer('agent.owner-move', value, { type: 'human', id: personId })
    const press = () => app.inject({ method: 'POST', url: `/api/agents/${owned.id}/owner`, headers: as(delegate), payload: { owner: { kind: 'agent', id: second.id }, because: 'A test hand-over', ...FOR_THE_PERSON } })
    try {
      answer('kept')
      expect((await press()).statusCode).toBe(403)
      expect(row(owned.id).owner_id).toBe(first.id)
      answer('may-press')
      expect((await press()).statusCode).toBe(200)
      expect(row(owned.id).owner_id).toBe(second.id)
    } finally {
      answer('default')
    }
  })

  it('keeps one hand-over message with its actor, reason and time, and files none for a refusal', async () => {
    const owned = await register('history-worker', as(first))
    const marker = () => (office.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM records').get() as { n: number }).n
    const messagesSince = (n: number) => office.client.sqlite.prepare("SELECT id, data, created_at FROM records WHERE rowid > ? AND kind = 'message' ORDER BY rowid").all(n) as { id: string; data: string; created_at: string }[]
    const before = marker()
    expect((await handOver(owned, { kind: 'agent', id: second.id }, as(first))).statusCode).toBe(200)
    const messages = messagesSince(before)
    expect(messages).toHaveLength(1)
    const saved = messages[0]!
    const data = JSON.parse(saved.data) as { body: string; saidInFull: string; notice: string; to: { kind: string; id: string }[] }
    const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
    const make = (SYSTEM_LINES as unknown as { theOwnerOfAnAgentChanged: (agent: string, from: string | null, to: string, actor: string, because: string, grant: boolean) => { line: string; said: string; notice: string } }).theOwnerOfAnAgentChanged
    const expected = make(owned.handle, first.handle, second.handle, first.handle, 'A test hand-over', false)
    expect(data).toMatchObject({ body: expected.line, saidInFull: expected.said, notice: expected.notice })
    expect(data.to).toEqual(expect.arrayContaining([{ kind: 'agent', id: owned.id }, { kind: 'agent', id: second.id }]))
    expect(data.to).not.toContainEqual({ kind: 'agent', id: first.id })
    expect(saved.created_at).toBeTruthy()
    const change = office.client.sqlite.prepare("SELECT actor_type, actor_id, elevation FROM changes WHERE record_id = ? AND op = 'create'").get(saved.id) as { actor_type: string; actor_id: string; elevation: string | null }
    expect(change).toMatchObject({ actor_type: 'agent', actor_id: first.handle, elevation: null })
    const after = marker()
    expect((await handOver(owned, { kind: 'agent', id: first.id }, as(stranger))).statusCode).toBe(403)
    expect(messagesSince(after)).toHaveLength(0)
  })

  it('records the raised secretary and the grant on its hand-over message', async () => {
    const delegate = await register('history-granted-secretary', person(), secretaryRole)
    const raised = await app.inject({ method: 'POST', url: `/api/roles/elevation/${delegate.handle}`, headers: { ...person(), ...thePersonsKeyHeader() }, payload: { reason: 'A test grant', endsWhen: 'when you say' } })
    expect(raised.statusCode).toBe(201)
    const grant = (raised.json() as { elevation: { id: string } }).elevation.id
    const owned = await register('history-granted-worker', as(first))
    const before = (office.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM records').get() as { n: number }).n
    const reply = await app.inject({ method: 'POST', url: `/api/agents/${owned.id}/owner`, headers: as(delegate), payload: { owner: { kind: 'agent', id: second.id }, because: 'A test hand-over', ...FOR_THE_PERSON } })
    expect(reply.statusCode).toBe(200)
    const messages = office.client.sqlite.prepare("SELECT id, data FROM records WHERE rowid > ? AND kind = 'message' ORDER BY rowid").all(before) as { id: string; data: string }[]
    expect(messages).toHaveLength(1)
    const data = JSON.parse(messages[0]!.data) as { body: string; saidInFull: string; notice: string }
    const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
    const make = (SYSTEM_LINES as unknown as { theOwnerOfAnAgentChanged: (agent: string, from: string | null, to: string, actor: string, because: string, grant: boolean) => { line: string; said: string; notice: string } }).theOwnerOfAnAgentChanged
    const expected = make(owned.handle, first.handle, second.handle, delegate.handle, 'A test hand-over', true)
    expect(data).toMatchObject({ body: expected.line, saidInFull: expected.said, notice: expected.notice })
    const change = office.client.sqlite.prepare("SELECT actor_type, actor_id, elevation FROM changes WHERE record_id = ? AND op = 'create'").get(messages[0]!.id) as { actor_type: string; actor_id: string; elevation: string | null }
    expect(change).toMatchObject({ actor_type: 'agent', actor_id: delegate.handle })
    expect(JSON.parse(change.elevation!)).toMatchObject({ id: grant })
  })

  it('refuses a retired agent without changing its owner or filing a message', async () => {
    const owned = await register('retired-history-worker', as(first))
    office.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(owned.id)
    const before = (office.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM records').get() as { n: number }).n
    expect((await handOver(owned, { kind: 'agent', id: second.id }, person())).statusCode).toBe(409)
    expect(row(owned.id).owner_id).toBe(first.id)
    const messages = office.client.sqlite.prepare("SELECT id FROM records WHERE rowid > ? AND kind = 'message'").all(before)
    expect(messages).toHaveLength(0)
  })

  it('records that there was no former owner when the person chooses the first', async () => {
    const owned = await register('history-without-owner', person())
    setFixtureOwner(office.client.sqlite, null, owned.id, 'id')
    const before = (office.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM records').get() as { n: number }).n
    expect((await handOver(owned, { kind: 'agent', id: first.id }, person())).statusCode).toBe(200)
    const messages = office.client.sqlite.prepare("SELECT data FROM records WHERE rowid > ? AND kind = 'message'").all(before) as { data: string }[]
    expect(messages).toHaveLength(1)
    const data = JSON.parse(messages[0]!.data) as { saidInFull: string }
    const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
    const make = (SYSTEM_LINES as unknown as { theOwnerOfAnAgentChanged: (agent: string, from: string | null, to: string, actor: string, because: string, grant: boolean) => { said: string } }).theOwnerOfAnAgentChanged
    const name = (office.client.sqlite.prepare('SELECT name FROM people WHERE id = ?').get(personId) as { name: string }).name
    expect(data.saidInFull).toBe(make(owned.handle, null, first.handle, name, 'A test hand-over', false).said)
  })

})
