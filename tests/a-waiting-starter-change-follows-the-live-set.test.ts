// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { nowStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const key = randomBytes(32).toString('hex')
const office = {type: 'system' as const, id: moleOffice().id}
let serial = 0
let target = ''

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({person: key, office: randomBytes(32).toString('hex'), providers: {}}), {mode: 0o600})
  app = (await apiApp()).app
  await app.ready()
  target = await agent()
}, 120_000)
afterAll(async () => { await app?.close(); t?.close() })

async function agent(): Promise<string> {
  const handle = `boundary-${++serial}`
  const res = await app.inject({method: 'POST', url: '/api/agents/started', headers: {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': key}, payload: {handle, name: handle}})
  expect(res.statusCode).toBe(201)
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as {id: string}).id
}
function run(agentId: string): string {
  return t.api.createRecord({kind: 'session', workspaceId: 'default', origin: 'fixture', actor: office, title: 'Boundary run', data: {runtime: 'claude-code', servingAgentId: agentId, state: 'running'}}).id
}
function wait(agentId: string): string {
  const id = `boundary-wait-${++serial}`
  t.client.sqlite.prepare("INSERT INTO agent_starter_changes (id, agent_id, from_kind, from_id, to_kind, to_id, asked_by_kind, asked_by_id, because, asked_at, state, runs_not_ended) VALUES (?, ?, 'person', ?, 'agent', ?, 'person', ?, 'test', '2026-11-09 10:00:00', 'waiting', '[]')").run(id, agentId, THE_PERSON, target, THE_PERSON)
  return id
}
function state(id: string): string { return (t.client.sqlite.prepare('SELECT state FROM agent_starter_changes WHERE id = ?').get(id) as {state: string}).state }

it('applies after deletion only when the last live run is removed', async () => {
  const a = await agent(), first = run(a), second = run(a), change = wait(a)
  t.api.deleteRecord(first, office)
  expect(state(change)).toBe('waiting')
  t.api.deleteRecord(second, office)
  expect(state(change)).toBe('applied')
})

it('applies when a live session changes kind away', async () => {
  const a = await agent(), id = run(a), change = wait(a)
  t.api.patchRecord(id, {kind: 'note'}, office)
  expect(state(change)).toBe('applied')
})

it('refuses to restore a live session while its agent waits', async () => {
  const a = await agent(), id = run(a)
  t.api.deleteRecord(id, office)
  const change = wait(a)
  expect(() => t.api.restoreRecord(id, office)).toThrow(change)
})

it('refuses a live record becoming a session for an agent that waits', async () => {
  const a = await agent(), id = run(a)
  t.api.patchRecord(id, {kind: 'note'}, office)
  const change = wait(a)
  expect(() => t.api.patchRecord(id, {kind: 'session'}, office)).toThrow(change)
})

it('gates the destination of a rebind and releases the old agent after a permitted move', async () => {
  const old = await agent(), next = await agent(), id = run(old)
  const oldChange = wait(old), nextChange = wait(next)
  expect(() => t.api.patchRecord(id, {dataPatch: {servingAgentId: next}}, office)).toThrow(nextChange)
  expect(state(oldChange)).toBe('waiting')
  t.client.sqlite.prepare("UPDATE agent_starter_changes SET state = 'withdrawn' WHERE id = ?").run(nextChange)
  t.api.patchRecord(id, {dataPatch: {servingAgentId: next}}, office)
  expect(state(oldChange)).toBe('applied')
})

it('does not release an old agent until its other live run also leaves', async () => {
  const old = await agent(), next = await agent(), first = run(old), second = run(old), change = wait(old)
  t.api.patchRecord(first, {dataPatch: {servingAgentId: next}}, office)
  expect(state(change)).toBe('waiting')
  t.api.patchRecord(second, {dataPatch: {servingAgentId: next}}, office)
  expect(state(change)).toBe('applied')
})

it('gates an already named agent when it becomes the selected serving agent', async () => {
  const old = await agent(), next = await agent(), id = run(old)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.servingAgent', ?) WHERE id = ?").run(next, id)
  const oldChange = wait(old), nextChange = wait(next)
  expect(() => t.api.patchRecord(id, {dataPatch: {servingAgentId: null}}, office)).toThrow(nextChange)
  expect(state(oldChange)).toBe('waiting')
})

it('releases a run bound through an agent record when it moves away', async () => {
  const old = await agent(), next = await agent(), id = run(old)
  const recordId = (t.client.sqlite.prepare('SELECT record_id FROM agent_records WHERE agent_id = ? LIMIT 1').get(old) as {record_id: string}).record_id
  const binding = JSON.stringify([{workspaceId: 'default', agentId: recordId}])
  t.client.sqlite.prepare("UPDATE records SET data = json_set(json_remove(data, '$.servingAgentId'), '$.ranAs', json(?)) WHERE id = ?").run(binding, id)
  const change = wait(old)
  t.api.patchRecord(id, {dataPatch: {servingAgentId: next}}, office)
  expect(state(change)).toBe('applied')
})

it('gates a restored live held session and ignores a stale hold', async () => {
  const a = await agent()
  const id = t.api.createRecord({kind: 'session', workspaceId: 'default', origin: 'fixture', actor: office, title: 'Held boundary', data: {runtime: 'claude-code', state: 'running'}}).id
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.heldByItsFiler', json('true')) WHERE id = ?").run(id)
  const now = nowStamp()
  t.client.sqlite.prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`hold-${serial}`, a, id, 'made-up', 'claude-code', now, now)
  t.api.deleteRecord(id, office)
  const change = wait(a)
  expect(() => t.api.restoreRecord(id, office)).toThrow(change)
  t.client.sqlite.prepare("UPDATE handle_holds SET last_heard_at = '2000-01-01 00:00:00' WHERE session_record_id = ?").run(id)
  expect(() => t.api.restoreRecord(id, office)).not.toThrow()
  expect(state(change)).toBe('waiting')
})

it('keeps the deletion and refused row even when refusal notice delivery fails', async () => {
  const a = await agent(), id = run(a), change = wait(a)
  t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(target)
  t.client.sqlite.exec("CREATE TRIGGER boundary_reject_notice BEFORE INSERT ON records WHEN NEW.kind = 'message' BEGIN SELECT RAISE(ABORT, 'boundary notice failure'); END")
  try {
    expect(() => t.api.deleteRecord(id, office)).not.toThrow()
    expect(state(change)).toBe('refused')
    expect((t.client.sqlite.prepare('SELECT deleted_at FROM records WHERE id = ?').get(id) as {deleted_at: string | null}).deleted_at).not.toBeNull()
  } finally {
    t.client.sqlite.exec('DROP TRIGGER boundary_reject_notice')
    t.client.sqlite.prepare('UPDATE agents SET retired = 0 WHERE id = ?').run(target)
  }
})
