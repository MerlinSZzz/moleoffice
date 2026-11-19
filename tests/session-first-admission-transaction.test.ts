// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let second: Database.Database
const key = randomBytes(32).toString('hex')
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': key }
const ids: Record<string, string> = {}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: key, office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['admission-wait-first', 'admission-file-first', 'admission-starter']) {
    const response = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle } })
    expect(response.statusCode, response.body).toBe(201)
    ids[handle] = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  }
  for (const handle of ['admission-wait-first', 'admission-file-first']) {
    t.api.createRecord({ kind: 'session', workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: ids[handle]! }, title: `Existing run ${handle}`, data: { state: 'running', runtime: 'codex', servingAgentId: ids[handle] } })
  }
  second = new Database(t.file)
}, 120_000)

afterAll(async () => { second?.close(); await app?.close(); t?.close() })

it('rejects a stale second connection after the waiting press commits', async () => {
  const agent = ids['admission-wait-first']!
  second.exec('BEGIN')
  try {
    expect(second.prepare("SELECT count(*) AS n FROM agent_starter_changes WHERE agent_id = ? AND state = 'waiting'").get(agent)).toEqual({ n: 0 })
    const press = await app.inject({ method: 'POST', url: `/api/agents/${agent}/starter`, headers, payload: { to: ids['admission-starter'], because: 'Made-up press' } })
    expect(press.statusCode, press.body).toBe(200)
    expect(press.json().change.state).toBe('waiting')
    expect(() => second.prepare('UPDATE agents SET name = name WHERE id = ?').run(agent)).toThrowError(expect.objectContaining({ code: 'SQLITE_BUSY_SNAPSHOT' }))
  } finally { second.exec('ROLLBACK') }
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'session', title: 'Refused admission', data: { state: 'running', runtime: 'codex', servingAgentId: agent } } })
  expect(filed.statusCode, filed.body).toBe(409)
})

it('rejects a stale second connection after session filing commits, and the later press waits on it', async () => {
  const agent = ids['admission-file-first']!
  second.exec('BEGIN')
  let session: string
  try {
    second.prepare("SELECT id FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgentId') = ?").all(agent)
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'session', title: 'Admitted run', data: { state: 'running', runtime: 'codex', servingAgentId: agent } } })
    expect(filed.statusCode, filed.body).toBe(201)
    session = filed.json().record.id
    expect(() => second.prepare('UPDATE agents SET name = name WHERE id = ?').run(agent)).toThrowError(expect.objectContaining({ code: 'SQLITE_BUSY_SNAPSHOT' }))
  } finally { second.exec('ROLLBACK') }
  const press = await app.inject({ method: 'POST', url: `/api/agents/${agent}/starter`, headers, payload: { to: ids['admission-starter'], because: 'Made-up press' } })
  expect(press.statusCode, press.body).toBe(200)
  expect(press.json().change.state).toBe('waiting')
  expect(press.json().runsNotEnded.map((run: { id: string }) => run.id)).toContain(session!)
})

it('offers only the known-dead worker’s pre-spawn start for cleanup', async () => {
  const actor = { type: 'system' as const, id: moleOffice().id }
  const agent = ids['admission-starter']!
  const message = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title: 'Made-up delivery', data: { body: 'A made-up delivery.', to: [{ kind: 'agent', id: agent }] } } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(message.statusCode, message.body).toBe(409)
  const messageId = message.json().record.id as string
  const parent = (state: string) => t.api.createRecord({ kind: 'session', workspaceId: 'default', origin: 'fixture', actor, title: `Made-up worker ${state}`, data: { state, runtime: 'codex' } }).id
  const gone = parent('crashed'), live = parent('running'), endedWithoutProcess = parent('finished')
  t.client.sqlite.prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, registered_at, registered_by, started_by_the_product) VALUES (?, 'default', ?, 'process', ?, ?, ?, ?, ?, ?, 1)")
    .run('made-up-dead-worker-process', gone, '99999999', 99999999, '2020-01-01 00:00:00', 'Made-up worker process', '2020-01-01 00:00:00', 'fixture')
  const start = (worker: string, phase: string) => {
    const id = t.api.createRecord({ kind: 'session', workspaceId: 'default', origin: 'fixture', actor, title: `Made-up ${phase} start`, data: { state: 'running', runtime: 'codex', servingAgentId: agent, deliveringMessage: messageId, startedByMoleOffice: true } }).id
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.parentAttachment', ?, '$.extra.messageWorker', ?, '$.extra.messageWorkerStart', ?) WHERE id = ?").run(worker, worker, phase, id)
    return id
  }
  const preparing = start(gone, 'preparing')
  const probing = start(gone, 'probing')
  const launching = start(gone, 'launching')
  const livePreparing = start(live, 'preparing')
  const unknownPreparing = start(endedWithoutProcess, 'preparing')
  const { runsToPickUp } = await import('../src/server/lib/worker.ts')
  const found = runsToPickUp('default')
  expect(found.find((run) => run.session === preparing)?.startupFailed?.reason).toContain('before its tool could start')
  expect(found.some((run) => run.session === probing)).toBe(false)
  expect(found.some((run) => run.session === launching)).toBe(false)
  expect(found.some((run) => run.session === livePreparing)).toBe(false)
  expect(found.some((run) => run.session === unknownPreparing)).toBe(false)
})
