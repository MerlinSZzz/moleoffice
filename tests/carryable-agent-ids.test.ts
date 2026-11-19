// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A throwaway office compares the bulk reading with the selected-agent reading. */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const handles = ['made-up-carry', 'made-up-answer', 'made-up-empty', 'made-up-sleep', 'made-up-asked', 'made-up-retired', 'made-up-reader', 'made-up-inspecting', 'made-up-settled']
const agents = new Map<string, { id: string; record: string }>()
const at = localStamp(new Date())
let serial = 0

function record(id: string, kind: string, data: object, project: string): void {
  db.client.sqlite.prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin)
    VALUES (?, ?, ?, ?, ?, ?, 'made-up record', ?, 'fixture')`).run(id, project, THE_PERSON, at, at, kind, JSON.stringify(data))
}

function message(to: string, extra: Record<string, unknown> = {}, from: { kind: string; id: string } = { kind: 'person', id: THE_PERSON }): string {
  const n = serial++
  const id = `made-up-message-${n}`
  record(id, 'message', { body: 'made-up message', sentBy: from, to: [{ kind: 'agent', id: to }], writtenIn: { project: 'default' }, ...extra }, 'message-centre')
  db.client.sqlite.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)").run(`made-up-delivery-${n}`, id, to, at)
  return id
}

function session(agentId: string, waiting: boolean): string {
  const n = serial++
  const id = `made-up-run-${n}`
  record(id, 'session', {
    state: 'finished', runtime: 'claude-code', servingAgentId: agentId,
    deliveringMessage: `made-up-delivered-${n}`, providerSession: `made-up-conversation-${n}`,
    ...(waiting ? { waitsUntil: localStamp(new Date(Date.now() + 600_000)) } : {}),
  }, 'default')
  return id
}

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of handles) {
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'agent', title: `made-up ${handle}`, data: { handle, state: 'active', runtime: 'claude-code' } } })
    expect(made.statusCode, made.body).toBe(201)
    const row = db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
    agents.set(handle, { id: row.id, record: made.json().record.id as string })
  }
  db.client.sqlite.prepare("UPDATE message_delivery SET mark = 'seen'").run()
  const id = (name: string) => agents.get(`made-up-${name}`)!.id
  message(id('carry'))
  message(id('answer'))
  session(id('answer'), true)
  db.client.sqlite.prepare("INSERT INTO resident_sleeps (id, agent_id, what, began_at, by_kind, by_id) VALUES (?, ?, 'slept', ?, 'human', ?)").run('made-up-sleep-row', id('sleep'), at, THE_PERSON)
  message(id('sleep'), { urgent: true })
  message(id('asked'), { runWasAskedFor: { at, by: THE_PERSON } })
  for (const name of ['inspecting', 'settled']) {
    const run = session(id(name), false)
    const messageId = message(id(name), { aboutRun: run })
    const check = { message: messageId, askedOf: `made-up-${name}`, askedAt: at }
    const released = { by: { kind: 'person', id: THE_PERSON }, at, how: 'an inspector', check: null }
    const data = name === 'settled' ? { theCheck: check, released } : { theCheck: check }
    db.client.sqlite.prepare('UPDATE records SET data = json_patch(data, json(?)) WHERE id = ?').run(JSON.stringify(data), run)
  }
  const retired = agents.get('made-up-retired')!
  db.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(retired.id)
  db.client.sqlite.prepare("INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) VALUES (?, 'default', 'made-up thread', 'direct', 'open', ?, ?, ?)").run('made-up-thread', at, at, THE_PERSON)
  db.client.sqlite.prepare("INSERT INTO agent_messages (id, thread_id, position, role, intent, body, state, created_at, created_by, recipient_kind, recipient_session_id) VALUES (?, ?, 1, 'human', 'discuss', 'made-up comment', 'queued', ?, ?, 'agent', ?)").run('made-up-comment', 'made-up-thread', at, THE_PERSON, retired.record)
  message(retired.id, { runWasAskedFor: { at, by: THE_PERSON } }, { kind: 'agent', id: id('reader') })
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

async function ids(path: string, headers: Record<string, string>): Promise<string[]> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  const body = reply.json() as { agentIds: string[]; narrowedByPermission?: unknown }
  expect(Object.keys(body).filter(key => key !== 'narrowedByPermission')).toEqual(['agentIds'])
  return body.agentIds.sort()
}

it('agrees with each selected-agent reading after applying the reader-visible queued candidates', async () => {
  for (const headers of [person, asAgent(agents.get('made-up-reader')!.id)]) {
    const queued = new Set(await ids('/api/messages/queued-agent-ids', headers))
    const expected: string[] = []
    for (const { id } of agents.values()) {
      const reading = await app.inject({ method: 'GET', url: `/api/agents/${id}/start-a-new-agent`, headers })
      expect(reading.statusCode, reading.body).toBe(200)
      if (queued.has(id) && reading.json().wouldCarry === true) expected.push(id)
    }
    const result = await ids('/api/messages/carryable-agent-ids', headers)
    expect(result).toEqual(expected.sort())
    if (headers === person) {
      expect(result).toContain(agents.get('made-up-carry')!.id)
      expect(result).toContain(agents.get('made-up-sleep')!.id)
      expect(result).toContain(agents.get('made-up-retired')!.id)
      expect(result).toContain(agents.get('made-up-settled')!.id)
      for (const name of ['answer', 'empty', 'asked', 'inspecting']) expect(result).not.toContain(agents.get(`made-up-${name}`)!.id)
    } else {
      expect(result).toContain(agents.get('made-up-retired')!.id)
      expect(result).not.toContain(agents.get('made-up-carry')!.id)
    }
  }
}, 120_000)

it('does not add statements when messages and runs grow for the same candidates', async () => {
  async function reading(): Promise<{ ids: string[]; statements: number }> {
    const reply = await app.inject({ method: 'GET', url: '/api/messages/carryable-agent-ids', headers: person })
    expect(reply.statusCode, reply.body).toBe(200)
    const found = /desc="(\d+) statements"/.exec(String(reply.headers['server-timing']))
    expect(found, 'the response counts statements').not.toBeNull()
    return { ids: (reply.json() as { agentIds: string[] }).agentIds.sort(), statements: Number(found![1]) }
  }
  await reading()
  const before = await reading()
  for (let n = 0; n < 150; n++) {
    message(agents.get('made-up-asked')!.id, { runWasAskedFor: { at, by: THE_PERSON } })
    session(agents.get('made-up-answer')!.id, false)
  }
  const after = await reading()
  expect(after.ids).toEqual(before.ids)
  expect(after.statements, 'queued messages and run history do not add statements').toBe(before.statements)
}, 120_000)

it('keeps statement count fixed when more agents have queued messages', async () => {
  async function statements(): Promise<number> {
    const reply = await app.inject({ method: 'GET', url: '/api/messages/carryable-agent-ids', headers: person })
    expect(reply.statusCode, reply.body).toBe(200)
    const found = /desc="(\d+) statements"/.exec(String(reply.headers['server-timing']))
    expect(found).not.toBeNull()
    return Number(found![1])
  }
  await statements()
  const before = await statements()
  const added = 12
  for (let n = 0; n < added; n++) {
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: {
      kind: 'agent', title: `made-up additional agent ${n}`,
      data: { handle: `made-up-additional-${n}`, state: 'active', runtime: 'claude-code' },
    } })
    expect(made.statusCode, made.body).toBe(201)
    const row = db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(`made-up-additional-${n}`) as { id: string }
    message(row.id, { aboutRun: session(row.id, false) })
  }
  await statements()
  const after = await statements()
  expect(after, 'adding candidates in the same projects adds no statements').toBe(before)
}, 120_000)

it('does not add statements for messages about settled inspections', async () => {
  async function reading(): Promise<{ ids: string[]; statements: number }> {
    const reply = await app.inject({ method: 'GET', url: '/api/messages/carryable-agent-ids', headers: person })
    expect(reply.statusCode, reply.body).toBe(200)
    const found = /desc="(\d+) statements"/.exec(String(reply.headers['server-timing']))
    expect(found).not.toBeNull()
    return { ids: (reply.json() as { agentIds: string[] }).agentIds.sort(), statements: Number(found![1]) }
  }
  await reading()
  const before = await reading()
  for (let n = 0; n < 12; n++) {
    const handle = `made-up-inspection-${n}`
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: {
      kind: 'agent', title: `made-up inspection agent ${n}`,
      data: { handle, state: 'active', runtime: 'claude-code' },
    } })
    expect(made.statusCode, made.body).toBe(201)
    const agent = (db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
    session(agent, true)
    const run = session(agent, false)
    const messageId = `made-up-message-${serial}`
    message(agent, { aboutRun: run })
    const check = { message: messageId, askedOf: handle, askedAt: at }
    const released = { by: { kind: 'person', id: THE_PERSON }, at, how: 'an inspector', check: null }
    db.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.theCheck', json(?), '$.released', json(?)) WHERE id = ?")
      .run(JSON.stringify(check), JSON.stringify(released), run)
  }
  const after = await reading()
  expect(after.ids).toEqual(before.ids)
  expect(after.statements, 'settled inspection messages add no statements').toBe(before.statements)
}, 120_000)
