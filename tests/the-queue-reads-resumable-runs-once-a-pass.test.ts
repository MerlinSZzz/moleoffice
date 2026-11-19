// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The queue resolves the agents served by message runs once per pass (wave 13y round 39).
 * The count is red before the change. The resume answers hold before and after it.
 * All agents, messages and conversations in this file are synthetic test fixtures.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from '../src/shared/roles.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
type Resume = { id: string; runtime: string; run: string } | null
interface QueueRow { messageId: string; resume: Resume }
let t: TestDb
let app: FastifyInstance
let counting = false
const statements: string[] = []
const messages = new Map<string, string>()

async function post(url: string, payload: object, answers: 201 | 409 = 201): Promise<{ record: { id: string } }> {
  const r = await app.inject({ method: 'POST', url, headers: HEADERS, payload })
  expect(r.statusCode, r.body.slice(0, 400)).toBe(answers)
  return r.json()
}

async function agent(handle: string, role: string = THE_WORKER): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, role, state: 'active', runtime: 'claude-code' } })
  const r = await app.inject({ method: 'GET', url: '/api/participants', headers: HEADERS })
  return one(r.json<{ agents: { id: string; handle: string }[] }>().agents.filter((a) => a.handle === handle), handle).id
}

async function message(agentId: string, answers: 201 | 409 = 201): Promise<void> {
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  // A send to an agent whose run is still inside its wait, or whose conversation a supervisor's or secretary's run
  // picks up, answers 201.
  const r = await post('/api/records', { kind: 'message', title: 'Synthetic queue question', data: { body: 'Synthetic question.', to: [{ kind: 'agent', id: agentId }] } }, answers)
  messages.set(agentId, r.record.id)
}

function run(agentId: string, conversation: string, extra: Record<string, unknown> = {}): string {
  return historicalSession(t, { workspaceId: 'default', kind: 'session', title: 'Synthetic answered run',
    data: Object.fromEntries(Object.entries({ state: 'finished', servingAgentId: agentId, deliveringMessage: 'synthetic-answered-message', providerSession: conversation, runtime: 'claude-code', ...extra }).filter(([, value]) => value !== undefined)),
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

async function queue(): Promise<QueueRow[]> {
  const r = await app.inject({ method: 'GET', url: '/api/worker/queue?full=1', headers: HEADERS })
  expect(r.statusCode, r.body.slice(0, 400)).toBe(200)
  return r.json().queue
}

async function resume(agentId: string): Promise<Resume> {
  return one((await queue()).filter((r) => r.messageId === messages.get(agentId)), agentId).resume
}

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  sqlite.prepare = function (sql: string) {
    const statement = prepare.call(this, sql)
    for (const method of ['get', 'all', 'run', 'iterate', 'values']) {
      const original = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof original !== 'function') continue
      statement[method] = function (...args: unknown[]) {
        if (counting) statements.push(`${sql} ${JSON.stringify(args)}`)
        return original.apply(this, args)
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => { await app?.close(); t?.close() })

describe('the conversations offered by the queue', () => {
  it('keeps an old supervisor conversation, skips a newer id with no runtime, and sees the next pass', async () => {
    const id = await agent('resume-supervisor', THE_SUPERVISOR)
    const old = run(id, 'synthetic-old', { waitsUntil: '2000-01-01 00:00:00' })
    run(id, 'synthetic-no-runtime', { runtime: undefined })
    // A run outside the message worker is never a candidate, even when newer.
    run(id, 'synthetic-other-run', { deliveringMessage: undefined })
    await message(id)
    expect(await resume(id)).toEqual({ id: 'synthetic-old', runtime: 'claude-code', run: old })
    const next = run(id, 'synthetic-next', { runtime: 'codex' })
    expect(await resume(id)).toEqual({ id: 'synthetic-next', runtime: 'codex', run: next })
  })

  it('keeps an old secretary conversation whose run names its handle', async () => {
    const id = await agent('resume-secretary', THE_SECRETARY)
    const old = run(id, 'synthetic-secretary', { servingAgentId: undefined, servingAgent: 'resume-secretary' })
    await message(id)
    expect(await resume(id)).toEqual({ id: 'synthetic-secretary', runtime: 'claude-code', run: old })
  })

  it('offers a worker conversation inside its wait, and none after its wait', async () => {
    const inside = await agent('resume-inside')
    const past = await agent('resume-past')
    const old = run(inside, 'synthetic-inside', { waitsUntil: localStamp(new Date(Date.now() + 300_000)) })
    run(past, 'synthetic-past', { waitsUntil: '2000-01-01 00:00:00' })
    await message(inside)
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    await message(past, 409)
    expect(await resume(inside)).toEqual({ id: 'synthetic-inside', runtime: 'claude-code', run: old })
    expect(await resume(past)).toBeNull()
  })

  it('offers no conversation when its only id has no runtime word', async () => {
    const id = await agent('resume-unknown-tool', THE_SUPERVISOR)
    run(id, 'synthetic-unidentified', { runtime: undefined })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    await message(id, 409)
    expect(await resume(id)).toBeNull()
  })
})

