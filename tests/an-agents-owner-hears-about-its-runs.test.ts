// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let office: TestDb
let app: FastifyInstance
let person: string
let secretaryRole: string
let starter: { id: string; handle: string; key: string }
let owner: { id: string; handle: string; key: string }
let worker: { id: string; handle: string; key: string }

const headers = (kind: string, id: string, key?: string) => ({
  'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': kind, 'x-mole-office-actor-id': id,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

async function register(handle: string, by: ReturnType<typeof headers>, role?: string) {
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: by,
    payload: { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) },
  })
  expect(reply.statusCode).toBe(201)
  const result = reply.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
  return { id: result.agent.id, handle, key: result.whatToGiveIt.key }
}

function run(served = worker) {
  const id = office.api.createRecord({
    workspaceId: 'default', kind: 'session', title: 'A run for notice routing',
    data: { state: 'running', runtime: 'claude-code', servingAgent: served.handle, servingAgentId: served.id },
    actor: office.api.HUMAN,
  }).id
  return office.api.getRecord(id)!
}

function recipients(id: string): unknown {
  return office.api.getRecord(id)!.data['to']
}

beforeAll(async () => {
  office = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = (await import('../src/shared/person.ts')).THE_PERSON
  secretaryRole = (await import('../src/server/lib/roles.ts')).theRoleCards().elevation.onlyThisCardCanHoldIt
  starter = await register('notice-starter', headers('human', person), secretaryRole)
  owner = await register('notice-owner', headers('human', person), secretaryRole)
  worker = await register('notice-worker', headers('agent', starter.handle, starter.key))
}, 120_000)

afterAll(async () => {
  await app?.close()
  office?.close()
})

describe('notices after a hand-over', () => {
  it('sends the run end notice to the new owner and keeps the starter', async () => {
    setFixtureOwner(office.client.sqlite, owner.id, worker.id, 'id')
    const { tellTheStarterOfTheNotice } = await import('../src/server/lib/launcher-notices.ts')
    const current = run()
    const result = tellTheStarterOfTheNotice('codex-capacity', null, { data: {} }, current)
    expect(result).toHaveProperty('told')
    expect(recipients((result as { told: string }).told)).toEqual([{ kind: 'agent', id: owner.id }])
    const row = office.client.sqlite.prepare('SELECT started_by_id FROM agents WHERE id = ?').get(worker.id) as { started_by_id: string }
    expect(row.started_by_id).toBe(starter.id)
  })

  it('sends a next-round notice to the new owner', async () => {
    setFixtureOwner(office.client.sqlite, owner.id, worker.id, 'id')
    const { tellTheSecretaryTheRoundStarted } = await import('../src/server/lib/the-line-next-round.ts')
    const { readParticipant } = await import('../src/server/db/read-participant.ts')
    const current = run()
    const agent = readParticipant({ kind: 'agent', id: worker.id })
    expect(agent).not.toBeNull()
    if (agent === null || !('startedBy' in agent)) throw new Error('The test worker is missing.')
    tellTheSecretaryTheRoundStarted(current, agent, 'another-test-run', 'a test brief')
    const rows = office.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").all(current.id) as { data: string }[]
    expect(rows).toHaveLength(1)
    expect((JSON.parse(rows[0]!.data) as { to: unknown }).to).toEqual([{ kind: 'agent', id: owner.id }])
  })

  it('sends a person-owned agent’s run notice to its recorded owner', async () => {
    const personStarted = await register('person-started-notice', headers('human', person))
    const { tellTheStarterOfTheNotice } = await import('../src/server/lib/launcher-notices.ts')
    const result = tellTheStarterOfTheNotice('codex-capacity', null, { data: {} }, run(personStarted))
    expect(result).toHaveProperty('told')
    expect(recipients((result as { told: string }).told)).toEqual([{ kind: 'person', id: person }])
    const stored = office.client.sqlite.prepare('SELECT owner_kind, owner_id FROM agents WHERE id = ?').get(personStarted.id) as { owner_kind: string | null; owner_id: string | null }
    expect(stored).toEqual({ owner_kind: 'person', owner_id: person })
  })

})
