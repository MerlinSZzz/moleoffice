// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A waiting starter change holds a live run, but a session filed already ended is not a start. */
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
const personKey = randomBytes(32).toString('hex')
let agentId = ''
let newStarterId = ''
let liveRun = ''
let otherRun = ''

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({person: personKey, office: randomBytes(32).toString('hex'), providers: {}}), {mode: 0o600})
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['waited-agent', 'next-starter']) {
    const res = await app.inject({method: 'POST', url: '/api/agents/started', headers: {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey}, payload: {handle, name: `Made-up ${handle}`}})
    expect(res.statusCode).toBe(201)
  }
  const id = (handle: string) => (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as {id: string}).id
  agentId = id('waited-agent'); newStarterId = id('next-starter')
  liveRun = t.api.createRecord({kind: 'session', workspaceId: 'default', origin: 'fixture', actor: {type: 'agent', id: agentId}, title: 'A live made-up run', data: {runtime: 'claude-code', servingAgentId: agentId, state: 'running'}}).id
  t.client.sqlite.prepare("INSERT INTO agent_starter_changes (id, agent_id, from_kind, from_id, to_kind, to_id, asked_by_kind, asked_by_id, because, asked_at, state, runs_not_ended) VALUES (?, ?, 'person', ?, 'agent', ?, 'person', ?, ?, ?, 'waiting', '[]')")
    .run('waiting-change', agentId, THE_PERSON, newStarterId, THE_PERSON, 'A made-up reason', '2026-11-09 10:00:00')
}, 120_000)

afterAll(async () => { await app?.close(); t?.close() })

it('refuses a live session, names the change and new starter, and accepts one filed already ended', async () => {
  const create = (state: string) => t.api.createRecord({kind: 'session', workspaceId: 'default', origin: 'fixture', actor: {type: 'agent', id: agentId}, title: `A made-up ${state} run`, data: {runtime: 'claude-code', servingAgentId: agentId, state}})
  let error: Error | null = null
  try { create('running') } catch (caught) { error = caught as Error }
  expect(error).not.toBeNull()
  expect(error!.message).toContain('waiting-change')
  expect(error!.message).toContain('next-starter')
  expect(error!.message.toLowerCase()).toContain('withdraw')
  otherRun = create('finished').id
  expect(otherRun).toBeTruthy()
})

it('holds the next round while the starter change waits', async () => {
  const next = {state: 'wanted', askedAt: '2026-11-09 10:00:00', askedBy: {as: 'the person', who: {kind: 'person', id: THE_PERSON}}, brief: {path: '/made-up/brief', sha256: 'a'.repeat(64), bytes: 1}, sandbox: {folder: '/made-up', instance: 'made-up', container: 'made-up'}}
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished', '$.nextRound', json(?)) WHERE id = ?").run(JSON.stringify(next), liveRun)
  const {theRoundsToStart} = await import('../src/server/lib/next-round.ts')
  expect(theRoundsToStart('default').some((round) => round.run === liveRun)).toBe(false)
  const row = t.client.sqlite.prepare("SELECT json_extract(data, '$.nextRound.held.says') AS says FROM records WHERE id = ?").get(liveRun) as {says: string | null}
  expect(row.says).toContain('waiting-change')
  t.client.sqlite.prepare("UPDATE records SET data = json_set(json_remove(data, '$.nextRound'), '$.state', 'running') WHERE id = ?").run(liveRun)
})

it('applies the waiting change inside the last run end', () => {
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'running') WHERE id = ?").run(otherRun)
  t.api.patchRecord(liveRun, {dataPatch: {state: 'finished'}}, {type: 'system', id: moleOffice().id})
  expect((t.client.sqlite.prepare('SELECT state FROM agent_starter_changes WHERE id = ?').get('waiting-change') as {state: string}).state).toBe('waiting')
  t.api.patchRecord(otherRun, {dataPatch: {state: 'finished'}}, {type: 'system', id: moleOffice().id})
  const row = t.client.sqlite.prepare('SELECT state, applied_at FROM agent_starter_changes WHERE id = ?').get('waiting-change') as {state: string, applied_at: string | null}
  const agent = t.client.sqlite.prepare('SELECT started_by_id FROM agents WHERE id = ?').get(agentId) as {started_by_id: string}
  expect(row.state).toBe('applied')
  expect(row.applied_at).not.toBeNull()
  expect(agent.started_by_id).toBe(newStarterId)
})

it('lets the person withdraw a waiting change', async () => {
  t.client.sqlite.prepare("INSERT INTO agent_starter_changes (id, agent_id, from_kind, from_id, to_kind, to_id, asked_by_kind, asked_by_id, because, asked_at, state, runs_not_ended) VALUES (?, ?, 'agent', ?, 'person', ?, 'person', ?, ?, ?, 'waiting', '[]')")
    .run('to-withdraw', agentId, newStarterId, THE_PERSON, THE_PERSON, 'A made-up reason', '2026-11-09 10:00:00')
  const {withdrawAWaitingStarterChange} = await import('../src/server/lib/agent-starter.ts')
  expect(() => withdrawAWaitingStarterChange(agentId, {type: 'agent', id: agentId})).toThrow()
  const res = await app.inject({method: 'POST', url: `/api/agents/${agentId}/starter`, headers: {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey}, payload: {withdraw: true}})
  expect(res.statusCode).toBe(200)
  const row = t.client.sqlite.prepare('SELECT state, applied_at FROM agent_starter_changes WHERE id = ?').get('to-withdraw') as {state: string, applied_at: string | null}
  expect(row).toEqual({state: 'withdrawn', applied_at: null})
})

it('counts a live session that holds its filer without naming a serving agent', async () => {
  const run = t.api.createRecord({kind: 'session', workspaceId: 'default', origin: 'fixture', actor: {type: 'agent', id: agentId}, title: 'A made-up held session', data: {runtime: 'claude-code', state: 'running'}}).id
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.heldByItsFiler', json('true')) WHERE id = ?").run(run)
  const now = nowStamp()
  t.client.sqlite.prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('made-up-hold', agentId, run, 'made-up', 'claude-code', now, now)
  const {theRunsOfTheAgentThatHaveNotEnded} = await import('../src/server/lib/agent-move.ts')
  expect(theRunsOfTheAgentThatHaveNotEnded(agentId).map((one) => one.id)).toContain(run)
  t.client.sqlite.prepare("UPDATE handle_holds SET last_heard_at = '2000-01-01 00:00:00' WHERE id = ?").run('made-up-hold')
  expect(theRunsOfTheAgentThatHaveNotEnded(agentId).map((one) => one.id)).not.toContain(run)
  expect((t.client.sqlite.prepare('SELECT released_at FROM handle_holds WHERE id = ?').get('made-up-hold') as {released_at: string | null}).released_at).toBeNull()
})

it('keeps the run end when the new starter is no longer eligible', async () => {
  const res = await app.inject({method: 'POST', url: '/api/agents/started', headers: {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey}, payload: {handle: 'refused-agent', name: 'Made-up refused agent'}})
  expect(res.statusCode).toBe(201)
  const failedAgent = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('refused-agent') as {id: string}).id
  const run = t.api.createRecord({kind: 'session', workspaceId: 'default', origin: 'fixture', actor: {type: 'agent', id: failedAgent}, title: 'A run whose move is refused', data: {runtime: 'claude-code', servingAgentId: failedAgent, state: 'running'}}).id
  t.client.sqlite.prepare("INSERT INTO agent_starter_changes (id, agent_id, from_kind, from_id, to_kind, to_id, asked_by_kind, asked_by_id, because, asked_at, state, runs_not_ended) VALUES (?, ?, 'person', ?, 'agent', ?, 'person', ?, ?, ?, 'waiting', '[]')")
    .run('refused-change', failedAgent, THE_PERSON, newStarterId, THE_PERSON, 'A made-up reason', '2026-11-09 10:00:00')
  t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(newStarterId)
  expect(() => t.api.patchRecord(run, {dataPatch: {state: 'finished'}}, {type: 'system', id: moleOffice().id})).not.toThrow()
  const row = t.client.sqlite.prepare('SELECT state, refused_because FROM agent_starter_changes WHERE id = ?').get('refused-change') as {state: string, refused_because: string | null}
  expect(row.state).toBe('refused')
  expect(row.refused_because).toContain('retired')
  expect((t.client.sqlite.prepare("SELECT json_extract(data, '$.state') AS state FROM records WHERE id = ?").get(run) as {state: string}).state).toBe('finished')
  const told = t.client.sqlite.prepare("SELECT json_extract(data, '$.body') AS body FROM records WHERE kind = 'message' AND json_extract(data, '$.to[0].id') = ? AND json_extract(data, '$.body') LIKE ?").get(THE_PERSON, '%refused-change%') as {body: string} | undefined
  expect(told?.body).toContain(String(row.refused_because))
})

it('answers 404 for an unknown agent at each starter door', async () => {
  const headers = {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey}
  const id = 'an-unregistered-made-up-agent'
  const read = await app.inject({method: 'GET', url: `/api/agents/${id}/starter`, headers})
  const preview = await app.inject({method: 'GET', url: `/api/agents/${id}/starter-preview?to=${THE_PERSON}`, headers})
  const press = await app.inject({method: 'POST', url: `/api/agents/${id}/starter`, headers, payload: {to: THE_PERSON, because: 'A made-up reason'}})
  expect([read.statusCode, preview.statusCode, press.statusCode]).toEqual([404, 404, 404])
})

it('does not roll back the end when an application cannot write its notices', async () => {
  t.client.sqlite.prepare('UPDATE agents SET retired = 0 WHERE id = ?').run(newStarterId)
  const res = await app.inject({method: 'POST', url: '/api/agents/started', headers: {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey}, payload: {handle: 'notice-fails', name: 'Made-up notice failure'}})
  expect(res.statusCode).toBe(201)
  const id = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('notice-fails') as {id: string}).id
  const run = t.api.createRecord({kind: 'session', workspaceId: 'default', origin: 'fixture', actor: {type: 'agent', id}, title: 'A run with a notice failure', data: {runtime: 'claude-code', servingAgentId: id, state: 'running'}}).id
  t.client.sqlite.prepare("INSERT INTO agent_starter_changes (id, agent_id, from_kind, from_id, to_kind, to_id, asked_by_kind, asked_by_id, because, asked_at, state, runs_not_ended) VALUES (?, ?, 'person', ?, 'agent', ?, 'person', ?, ?, ?, 'waiting', '[]')")
    .run('notice-fails-change', id, THE_PERSON, newStarterId, THE_PERSON, 'A made-up reason', '2026-11-09 10:00:00')
  t.client.sqlite.exec("CREATE TRIGGER reject_test_notice BEFORE INSERT ON records WHEN NEW.kind = 'message' BEGIN SELECT RAISE(ABORT, 'made-up notice failure'); END")
  try {
    expect(() => t.api.patchRecord(run, {dataPatch: {state: 'finished'}}, {type: 'system', id: moleOffice().id})).not.toThrow()
    const row = t.client.sqlite.prepare('SELECT state, refused_because FROM agent_starter_changes WHERE id = ?').get('notice-fails-change') as {state: string, refused_because: string | null}
    expect(row.state).toBe('refused')
    expect(row.refused_because).toContain('made-up notice failure')
    expect((t.client.sqlite.prepare('SELECT started_by_id FROM agents WHERE id = ?').get(id) as {started_by_id: string}).started_by_id).toBe(THE_PERSON)
    expect((t.client.sqlite.prepare("SELECT json_extract(data, '$.state') AS state FROM records WHERE id = ?").get(run) as {state: string}).state).toBe('finished')
  } finally { t.client.sqlite.exec('DROP TRIGGER reject_test_notice') }
})
