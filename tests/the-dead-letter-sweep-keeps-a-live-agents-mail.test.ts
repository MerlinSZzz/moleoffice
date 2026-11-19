// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Problem CcD2zS8LYfER: session records protect mail, and a sweep leaves its handoff readable. */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { localStamp, parseAnyStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import type { SweptLetterNotice } from '../src/server/lib/deadletters.ts'

let t: TestDb
let app: FastifyInstance
let api: string
let secretary: string
const person = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id,
})

async function post(path: string, body: object, headers: Record<string, string> = person) {
  const reply = await fetch(api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const said = await reply.json()
  expect(reply.status, JSON.stringify(said)).toBe(
    path === '/api/records' ? theAnswerToAWriteInATestOffice(headers, body) : path === '/api/agents/started' ? 201 : 200,
  )
  return said
}

async function register(handle: string): Promise<string> {
  const said = await post('/api/agents/started', { handle, name: handle, role: 'worker' }, asAgent(secretary))
  return said.agent.id as string
}

async function letterTo(id: string): Promise<string> {
  // Send while the addressee is held, then release it before testing the later sweep.
  const handle = (t.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(id) as {handle:string}).handle
  const holder = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A synthetic holder', actor: t.api.HUMAN,
    data: { state: 'running', runtime: 'claude-code' } }).id
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: 'default', sessionRecordId: holder, type: 'process', key: String(process.pid), actor: t.api.HUMAN })
  const held = await app.inject({ method: 'POST', url: `/api/handles/${handle}/hold`, headers: person,
    payload: { session: holder, machine: 'a-synthetic-machine', runtime: 'claude-code' } })
  expect(held.statusCode).toBe(201)
  let messageId: string
  try {
    const reply = await fetch(`${api}/api/records`, { method: 'POST', headers: person, body: JSON.stringify({
      kind: 'message', title: 'A test letter waiting for its addressee',
      data: { body: 'Keep these words for the addressee.', to: [{ kind: 'agent', id }] },
    }) })
    expect(reply.status).toBe(201)
    messageId = (await reply.json()).record.id as string
  } finally {
    const released = await app.inject({ method: 'POST', url: `/api/handles/${handle}/release`, headers: person,
      payload: { session: holder, because: 'The synthetic send is complete.' } })
    expect(released.statusCode).toBe(200)
    // This synthetic hold is fixture setup; the cases begin with an empty hold table.
    t.client.sqlite.prepare('DELETE FROM handle_holds WHERE session_record_id = ?').run(holder)
  }
  const old = localStamp(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000))
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(old, messageId)
  t.client.sqlite.prepare('UPDATE message_delivery SET at = ? WHERE message_id = ?').run(old, messageId)
  return messageId
}

function sessionFor(id: string, data: Record<string, unknown>) {
  return t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: `Test run for ${id}`,
    data, actor: { type: 'agent', id },
  })
}

async function waitingFor(handle: string, messageId: string, wait = '') {
  const reply = await fetch(`${api}/api/handles/${handle}/waiting${wait}`, { headers: asAgent(handle) })
  expect(reply.status).toBe(200)
  const said = await reply.json() as {
    waiting: { messageId: string; sentBy: { kind: string; id: string } | null; swept?: SweptLetterNotice }[]
  }
  return said.waiting.find((one) => one.messageId === messageId)
}

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  // A different configured window proves the sweep reads the session threshold.
  vi.stubEnv('MOLE_OFFICE_IDLE_AFTER', '90s')
  t = await freshDb()
  app = (await apiApp()).app
  api = await app.listen({ host: '127.0.0.1', port: 0 })
  secretary = (await post('/api/agents/started', {
    handle: 'test-secretary', name: 'Test secretary', role: 'secretary',
  })).agent.id as string
})

afterEach(async () => {
  await app?.close()
  t?.close()
  vi.unstubAllEnvs()
})

it('keeps mail for running sessions with no held handle', async () => {
  for (const spelling of ['id', 'handle', 'ranAs'] as const) {
    const handle = `running-${spelling.toLowerCase()}`
    const id = await register(handle)
    const messageId = await letterTo(id)
    const identity = spelling === 'id' ? { servingAgentId: id, servingAgent: handle }
      : spelling === 'handle' ? { servingAgent: handle }
        : { ranAs: [{ workspaceId: 'default', agentId: id }] }
    sessionFor(id, { state: 'running', lastOutputAt: '2020-01-01 00:00:00', ...identity })
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM handle_holds').get()).toEqual({ n: 0 })
    const swept = await post('/api/dead-letters/sweep', {})
    expect(swept.addressees).not.toContain(id)
    expect(swept.groupId).toBeNull()
    expect(await waitingFor(handle, messageId)).toEqual({
      messageId,
      urgent: false,
      // WHERE IT WAS WRITTEN, in place of the project it was filed in.
      writtenIn: { project: 'default' },
      sentBy: { kind: 'person', id: THE_PERSON },
    })
  }
})

it('keeps mail while a non-running session has output within its idle window', async () => {
  const handle = 'recent-output'
  const id = await register(handle)
  const messageId = await letterTo(id)
  const output = localStamp(new Date())
  sessionFor(id, { state: 'idle', servingAgentId: id, servingAgent: handle, lastOutputAt: output })
  expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM handle_holds').get()).toEqual({ n: 0 })
  const swept = await post('/api/dead-letters/sweep', {})
  expect(swept.addressees).not.toContain(id)
  expect(swept.groupId).toBeNull()
  expect(await waitingFor(handle, messageId)).toBeDefined()
  const { deadLettersNow } = await import('../src/server/lib/deadletters.ts')
  const at = parseAnyStamp(output)!.getTime()
  expect(deadLettersNow(new Date(at + 89_000)).map((one) => one.messageId)).not.toContain(messageId)
  expect(deadLettersNow(new Date(at + 90_000)).map((one) => one.messageId)).toContain(messageId)
})

it('sweeps gone mail and keeps its words and handoff at the waiting door', async () => {
  const handle = 'gone-addressee'
  const id = await register(handle)
  const messageId = await letterTo(id)
  sessionFor(id, { state: 'finished', servingAgentId: id, lastOutputAt: '2020-01-01 00:00:00' })
  expect((await waitingFor(handle, messageId))?.swept).toBeUndefined()
  const swept = await post('/api/dead-letters/sweep', {})
  expect(swept.addressees).toContain(id)
  const claim = t.client.sqlite.prepare('SELECT opened_at FROM dead_letter_claims WHERE agent_id = ?').get(id) as { opened_at: string }
  const notice = {
    at: claim.opened_at, groupId: swept.groupId, claimedBy: null, claimedAt: null,
    line: `This addressee's dead letters were swept at ${claim.opened_at} and handed to the secretaries in group ${swept.groupId}.`,
  }
  expect((await waitingFor(handle, messageId))?.swept).toEqual(notice)
  expect((await waitingFor(handle, messageId, '?wait=1'))?.swept).toEqual(notice)
  const letter = await fetch(`${api}/api/records/${messageId}`, { headers: asAgent(handle) })
  expect(letter.status).toBe(200)
  expect((await letter.json()).record.data.body).toBe('Keep these words for the addressee.')
  const claimed = await post('/api/dead-letters/claims', { agentId: id, because: 'I will read the backlog.' }, asAgent(secretary))
  const after = (await waitingFor(handle, messageId))?.swept
  expect(after?.line).toBe(`${notice.line} Claimed at ${claimed.claim.claimedAt} by test-secretary.`)
  expect(after?.claimedBy).toEqual({ kind: 'agent', id: secretary })
  expect(t.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(messageId, id)).toEqual({ mark: 'queued' })
  // A historical claim may still hold the handle used before registry ids were introduced.
  t.client.sqlite.prepare('UPDATE dead_letter_claims SET agent_id = ? WHERE agent_id = ?').run(handle, id)
  expect((await waitingFor(handle, messageId))?.swept).toEqual(after)
})
