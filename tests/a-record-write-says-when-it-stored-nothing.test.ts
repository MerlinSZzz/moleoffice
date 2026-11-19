// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A keyed agent's handle and id give the same finish, and a PATCH that stored nothing says why.
 *
 * Cases and mutations:
 * 1. First finishes under either spelling are held for the reminder. An exact comparison of the
 *    caller with the run's stored agent on the finish path makes the handle case red.
 * 2. The same finishes after the reminder seal the run. That exact comparison makes the handle case red.
 * 3. With the reminder gate off both spellings seal at once. That comparison makes the handle case red.
 * 4. An unchanged title, unchanged data, and a missing deletion each explain the unchanged record.
 *    Dropping the explanation on the no-write return makes these cases red.
 * 5. A held finish explains why it was held. Dropping the explanation there makes case 1 red.
 * 6. A stored change has no explanation of an unwritten change. Adding one makes the case red.
 * 7. An unchanged value and missing deletion name both lists. Disabling the mixed branch makes it red.
 * 8. The run is filed under the message worker's exported id. Emptying it makes all six
 *    finishes by either name and the held-reminder case red.
 *
 * 9. An empty nested merge reaches the empty cause. Changing that cause at the no-write branch makes it red.
 *
 * Every key, run and repository here is made for this test.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FINISHED_STATES } from '../src/config/finished.mjs'
import { STILL_GOING_STATES } from '../src/config/still-going.mjs'
import { gateNamed } from '../src/config/gates.mjs'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HANDLE = 'test-finisher'
const OFFICE_KEY = randomBytes(32).toString('hex')
const AS_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_OFFICE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-key': OFFICE_KEY }
const FINISHED = FINISHED_STATES[0]
const RUNNING = STILL_GOING_STATES[0]
let t: TestDb
let app: FastifyInstance
let dir = ''
let agentId = ''
let base = ''
let tip = ''
const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: randomBytes(32).toString('hex'), office: OFFICE_KEY, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(registered.statusCode, registered.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(HANDLE) as { id: string }
  agentId = row.id
  expect(agentId).not.toBe(HANDLE)
  dir = mkdtempSync(join(tmpdir(), 'record-finish-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work', 'one.txt'), 'before\n')
  git('add', '.')
  git('commit', '-qm', 'first')
  base = git('rev-parse', 'HEAD')
  git('switch', '-qc', 'worker')
  writeFileSync(join(dir, 'work', 'one.txt'), 'after\n')
  git('add', '.')
  git('commit', '-qm', 'second')
  tip = git('rev-parse', 'HEAD')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

function gate(position: string) {
  t.client.sqlite.prepare('INSERT OR REPLACE INTO runtime_settings (name, value) VALUES (?, ?)').run(String(gateNamed('before-the-seal')?.setting), position)
}
async function run() {
  const r = await app.inject({ method: 'POST', url: '/api/records', headers: AS_OFFICE, payload: { kind: 'session', title: 'A run to finish', data: { state: RUNNING, runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'testing', workingDirectory: dir, cutFrom: 'main', tip: base } } })
  expect(r.statusCode, r.body).toBe(201)
  const b = r.json() as { record: { id: string }; runKey: { key: string } }
  expect(typeof b.runKey?.key).toBe('string')
  return { id: b.record.id, key: b.runKey.key }
}
async function finish(r: { id: string; key: string }, actor: string) {
  return app.inject({ method: 'PATCH', url: `/api/records/${r.id}`, headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': actor, 'x-mole-office-session': r.id, 'x-mole-office-key': r.key }, payload: { dataPatch: { state: FINISHED, tip, submission: { kind: 'git' } } } })
}
/** Reads the sentence from the one product function that words no-write answers. */
async function sentence(reason: { kind: string; fields?: string[]; absent?: string[] }): Promise<string> {
  const mod = await import('../src/server/lib/records/patching.ts') as unknown as { nothingWrittenSentence: (reason: { kind: string; fields?: string[]; absent?: string[] }) => string }
  return mod.nothingWrittenSentence(reason)
}

describe('finishes by either name', () => {
  for (const spelling of ['handle', 'id'] as const) {
    it(`holds the first finish by ${spelling}`, async () => {
      gate('remind')
      const r = await run()
      const first = await finish(r, spelling === 'handle' ? HANDLE : agentId)
      expect(first.statusCode, first.body).toBe(200)
      expect(first.json().newSeq).toBeNull()
      expect(first.json().beforeTheSeal.sealed).toBe(false)
      expect(t.api.getRecord(r.id)?.data['state']).toBe(RUNNING)
      expect(t.api.getRecord(r.id)?.data['sealedTip']).toBeUndefined()
    }, 60_000)
    it(`seals a finish after the reminder by ${spelling}`, async () => {
      gate('remind')
      const r = await run()
      const first = await finish(r, agentId)
      expect(first.statusCode, first.body).toBe(200)
      expect(first.json().newSeq).toBeNull()
      const second = await finish(r, spelling === 'handle' ? HANDLE : agentId)
      expect(second.statusCode, second.body).toBe(200)
      expect(second.json().newSeq).toEqual(expect.any(Number))
      expect(second.json().nothingWritten).toBeUndefined()
      expect(t.api.getRecord(r.id)?.data['state']).toBe(FINISHED)
      expect(t.api.getRecord(r.id)?.data['sealedTip']).toEqual(expect.any(String))
    }, 60_000)
    it(`seals the first finish with the gate off by ${spelling}`, async () => {
      gate('off')
      const r = await run()
      const result = await finish(r, spelling === 'handle' ? HANDLE : agentId)
      expect(result.statusCode, result.body).toBe(200)
      expect(result.json().newSeq).toEqual(expect.any(Number))
      expect(result.json().nothingWritten).toBeUndefined()
      expect(t.api.getRecord(r.id)?.data['state']).toBe(FINISHED)
      expect(t.api.getRecord(r.id)?.data['sealedTip']).toEqual(expect.any(String))
    }, 60_000)
  }
})

it('explains a finish held for its reminder', async () => {
  gate('remind')
  const r = await run()
  const held = await finish(r, HANDLE)
  expect(held.statusCode, held.body).toBe(200)
  expect(held.json().newSeq).toBeNull()
  expect(held.json().nothingWritten).toBe(await sentence({ kind: 'reminder' }))
}, 60_000)

describe('the answer to an ordinary patch', () => {
  async function patch(id: string, payload: unknown) {
    return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_PERSON, payload: payload as never })
  }
  it('explains an empty nested merge', async () => {
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note', data: { extra: {} }, actor: t.api.HUMAN })
    const r = await patch(record.id, { dataPatch: { extra: {} } })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().newSeq).toBeNull()
    expect(r.json().nothingWritten).toBe(await sentence({ kind: 'empty' }))
  })
  it('explains an unchanged title', async () => {
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note', data: { body: 'A body' }, actor: t.api.HUMAN })
    const r = await patch(record.id, { title: record.title })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().newSeq).toBeNull()
    expect(r.json().nothingWritten).toBe(await sentence({ kind: 'unchanged', fields: ['title'] }))
  })
  it('explains unchanged data', async () => {
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note', data: { body: 'A body' }, actor: t.api.HUMAN })
    const r = await patch(record.id, { dataPatch: { body: 'A body' } })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().newSeq).toBeNull()
    expect(r.json().nothingWritten).toBe(await sentence({ kind: 'unchanged', fields: ['data.body'] }))
  })
  it('explains a missing deletion', async () => {
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note', data: { body: 'A body' }, actor: t.api.HUMAN })
    const r = await patch(record.id, { dataPatch: { absent: null } })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().newSeq).toBeNull()
    expect(r.json().nothingWritten).toBe(await sentence({ kind: 'absent', fields: ['data.absent'] }))
  })
  it('explains unchanged data and a missing deletion', async () => {
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note', data: { body: 'A body' }, actor: t.api.HUMAN })
    const r = await patch(record.id, { dataPatch: { body: 'A body', absent: null } })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().newSeq).toBeNull()
    expect(r.json().nothingWritten).toBe(await sentence({ kind: 'mixed', fields: ['data.body'], absent: ['data.absent'] }))
  })
  it('does not say nothing was written when a title changed', async () => {
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Before', data: { body: 'A body' }, actor: t.api.HUMAN })
    const r = await patch(record.id, { title: 'After' })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().newSeq).toEqual(expect.any(Number))
    expect(r.json().nothingWritten).toBeUndefined()
  })
})
