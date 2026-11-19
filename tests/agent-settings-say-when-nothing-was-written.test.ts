// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Each repeat compares every database row and reads its sentence from the product.
 * Retirement: removing the sentence or adding it to a write turns the case red. Membership
 * reconciliation also prevents a sentence when the record patch is unchanged. The retired state
 * and reason pin the choice without a clock. When no secretariat group exists, treating that as a
 * write or dereferencing it turns the no-group repeat red.
 * Broadcast, work area, files area and start folder: removing the sentence, adding it to a write,
 * or deciding from the record patch alone when a group opens turns the relevant case red.
 * Broadcast and start folder also say the no-write sentence instead of claiming a change.
 * Model: a repeated model and an empty clear have their own causes; removing or adding a sentence,
 * or using the repeat cause for an empty clear, turns the relevant case red. Stored model and
 * effort values pin the choice without a clock.
 * Keeping: the holder switch and remembered setting pin the choice without a clock; removing or
 * adding a sentence, or ignoring a holder change, turns the case red.
 * Process: the same process is pinned by its pid, start and conversation, so no clock is needed;
 * removing the sentence or adding it to a write turns the case red.
 * Host job: the queue and ended jobs pin the choice without a clock; removing or adding the
 * sentence, ignoring ended jobs, or using the repeat cause turns the case red.
 * Stamped settings use a faked Date and repeat within one second, then write at the next second.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { localStamp } from '../src/shared/time.ts'
import { HOST_JOB_KIND } from '../src/shared/host-jobs.ts'
import { SECRETARIAT_GROUP_KEY } from '../src/shared/groups.ts'
import Database from 'better-sqlite3'
import { aPlace, ask, groups, holder, startAHolder, startAServer, stopEverything } from './terminal-holder-stand.ts'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let serial = 0
const officeKey = randomBytes(32).toString('hex')
beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: randomBytes(32).toString('hex'), office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => { await app?.close(); t?.close() })

async function sentence(kind: string) {
  const mod = await import('../src/server/lib/records/patching.ts') as unknown as { nothingWrittenSentence: (reason: { kind: string }) => string }
  const value = mod.nothingWrittenSentence({ kind })
  expect(value).toEqual(expect.any(String))
  return value
}

function allRows(db = t.client.sqlite) {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
  const result: Record<string, string[]> = {}
  for (const { name } of names) {
    // Every request changes these bookkeeping tables, even a GET: tests/a-write-can-be-checked-without-writing-it.test.ts.
    if (name === 'api_calls' || name === 'header_only_calls') continue
    const quoted = name.replaceAll('"', '""')
    result[name] = db.prepare(`SELECT * FROM "${quoted}"`).all().map(row => JSON.stringify(row)).sort()
  }
  return result
}

async function register(role?: string, runtime?: string) {
  const handle = `case-agent-${++serial}`
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle, name: handle, ...(role ? { role } : {}), ...(runtime ? { runtime } : {}) } })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as { agent: { id: string }; record: string }
}

async function repeat(call: () => Promise<{ statusCode: number; body: string; json: () => { nothingWritten?: unknown; says?: unknown } }>, cause: string, saysNothing = false) {
  const before = allRows()
  const same = await call()
  expect(same.statusCode, same.body).toBe(200)
  expect(allRows()).toEqual(before)
  expect(same.json().nothingWritten).toBe(await sentence(cause))
  if (saysNothing) expect(same.json().says).toBe(same.json().nothingWritten)
}

async function stampedSetting(suffix: string, payload: object, role?: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const { agent } = await register(role)
    const call = () => app.inject({ method: 'POST', url: `/api/participants/agent/${agent.id}/${suffix}`, headers: person, payload })
    const prime = await app.inject({ method: 'POST', url: `/api/participants/agent/${agent.id}/${suffix}`, headers: person, payload: { ...payload, because: 'An earlier reason.' } })
    expect(prime.statusCode, prime.body).toBe(200)
    const first = await call()
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().nothingWritten).toBeUndefined()
    const saysNothing = suffix === 'broadcast-times' || suffix === 'start-folder'
    if (saysNothing) expect(first.json().says).not.toBe(await sentence('already-stored'))
    await repeat(call, 'already-stored', saysNothing)
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const later = await call()
    expect(later.statusCode, later.body).toBe(200)
    expect(later.json().nothingWritten).toBeUndefined()
    if (saysNothing) expect(later.json().says).not.toBe(await sentence('already-stored'))
  } finally { vi.useRealTimers() }
}

it('reports an unchanged broadcast schedule', async () => {
  await stampedSetting('broadcast-times', { times: [], because: 'A change is requested.' }, 'secretary')
})
it('reports an unchanged empty work area', async () => {
  await stampedSetting('work-area', { workArea: [], because: 'A change is requested.' })
})
it('reports an unchanged files area', async () => {
  await stampedSetting('files-area', { filesArea: [], because: 'A change is requested.' })
})
it('reports an unchanged start folder', async () => {
  await stampedSetting('start-folder', { startFolder: process.cwd(), because: 'A change is requested.' })
})
it('reports a retirement repeated by id', async () => {
  const { agent } = await register()
  const call = () => app.inject({ method: 'POST', url: `/api/participants/agent/${agent.id}/retire`, headers: person, payload: { because: 'The work is complete.' } })
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  await repeat(call, 'already-stored')
})
it('reports a repeated retirement when there is no secretariat group', async () => {
  const { syncTheSecretariatGroup } = await import('../src/server/lib/secretariat.ts')
  syncTheSecretariatGroup()
  const { agent } = await register()
  const call = () => app.inject({ method: 'POST', url: `/api/participants/agent/${agent.id}/retire`, headers: person, payload: { because: 'The work is complete.' } })
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  const group = t.client.sqlite.prepare('SELECT id FROM groups WHERE about = ?').get(SECRETARIAT_GROUP_KEY) as { id: string }
  const hidden = t.client.sqlite.prepare('UPDATE groups SET about = ? WHERE id = ?').run('a group set aside for this case', group.id)
  expect(hidden.changes).toBe(1)
  try {
    await repeat(call, 'already-stored')
  } finally {
    t.client.sqlite.prepare('UPDATE groups SET about = ? WHERE id = ?').run(SECRETARIAT_GROUP_KEY, group.id)
  }
})
it('reports a repeated model and an empty clear', async () => {
  const { agent } = await register(undefined, 'opencode')
  const call = (model: string | null, variant: string | null) => app.inject({ method: 'POST', url: `/api/office/run-models/agent/${agent.id}`, headers: person, payload: { model, variant } })
  const first = await call('a-model', 'an-effort')
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  await repeat(() => call('a-model', 'an-effort'), 'already-stored')
  const cleared = await call(null, null)
  expect(cleared.statusCode, cleared.body).toBe(200)
  expect(cleared.json().nothingWritten).toBeUndefined()
  await repeat(() => call(null, null), 'nothing-to-clear')
})

// Closing the person's membership directly makes the reconciliation add it on the next retirement.
it('does not report an unchanged retirement when reconciliation adds a person', async () => {
  const { agent } = await register('secretary')
  const call = () => app.inject({ method: 'POST', url: `/api/participants/agent/${agent.id}/retire`, headers: person, payload: { because: 'The work is complete.' } })
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  await repeat(call, 'already-stored')
  const row = t.client.sqlite.prepare('SELECT id FROM groups WHERE about = ?').get(SECRETARIAT_GROUP_KEY) as { id: string }
  const changed = t.client.sqlite.prepare("UPDATE group_members SET left_at = ? WHERE group_id = ? AND member_kind = 'person' AND member_id = ? AND left_at IS NULL").run('2026-01-01 00:00:00', row.id, THE_PERSON)
  expect(changed.changes).toBe(1)
  const before = allRows()
  const again = await call()
  expect(again.statusCode, again.body).toBe(200)
  expect(allRows()).not.toEqual(before)
  expect(again.json().nothingWritten).toBeUndefined()
})

it('reports the same process without changing its existing answer', async () => {
  const originalTitle = process.title
  try {
    const { agent } = await register(undefined, 'claude-code')
    const row = t.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(agent.id) as { handle: string }
    const conversation = randomBytes(16).toString('hex')
    const logPath = join(dirname(t.file), 'process-transcript.jsonl')
    writeFileSync(logPath, JSON.stringify({ type: 'assistant', timestamp: new Date(Date.now() - 7200000).toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'Earlier work.' }] } }) + '\n')
    const session = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A running session', data: { state: 'running', runtime: 'claude-code', servingAgent: row.handle, extra: { discovered: { tool: 'claude-code', externalId: conversation, logPath } } }, actor: t.api.HUMAN }).id
    const machines = await import('../src/server/lib/machines.ts')
    const machine = machines.thisMachine()
    expect(machine).not.toBeNull()
    const headers = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': row.handle }
    const held = await app.inject({ method: 'POST', url: `/api/handles/${row.handle}/hold`, headers, payload: { session, machine, runtime: 'claude-code' } })
    expect(held.statusCode, held.body).toBe(201)
    process.title = 'claude'
    const started = localStamp(new Date(execFileSync('ps', ['-o', 'lstart=', '-p', String(process.pid)], { encoding: 'utf8' }).trim()))
    const call = () => app.inject({ method: 'POST', url: `/api/handles/${row.handle}/process`, headers, payload: { session, pid: process.pid, pidStartedAt: started, conversation } })
    const first = await call()
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().changed).toBe(true)
    expect(first.json().nothingWritten).toBeUndefined()
    const before = allRows()
    const same = await call()
    expect(same.statusCode, same.body).toBe(200)
    expect(allRows()).toEqual(before)
    expect(same.json().changed).toBe(false)
    expect(same.json().says).toEqual(expect.any(String))
    expect(same.json().nothingWritten).toBe(await sentence('already-stored'))
  } finally { process.title = originalTitle }
})

it('reports no waiting host job, but not a job it ended', async () => {
  const { asTheHostJobWriter } = await import('../src/server/lib/host-job-door.ts')
  asTheHostJobWriter(() => t.api.createRecord({ workspaceId: 'default', kind: HOST_JOB_KIND, title: 'A waiting job', data: { tool: 'absent-tool', sha256: '0'.repeat(64), arguments: {}, askedBy: { kind: 'person', id: THE_PERSON }, state: 'asked', askedAt: localStamp(new Date()) }, actor: t.api.HUMAN }))
  const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': officeKey }
  const call = () => app.inject({ method: 'POST', url: '/api/host-jobs/take', headers, payload: {} })
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().ended).toHaveLength(1)
  expect(first.json().nothingWritten).toBeUndefined()
  await repeat(call, 'no-job-waiting')
  asTheHostJobWriter(() => t.api.createRecord({ workspaceId: 'default', kind: HOST_JOB_KIND, title: 'A running job', data: { tool: 'absent-tool', sha256: '0'.repeat(64), arguments: {}, askedBy: { kind: 'person', id: THE_PERSON }, state: 'running', askedAt: localStamp(new Date()) }, actor: t.api.HUMAN }))
  const lost = await app.inject({ method: 'POST', url: '/api/host-jobs/take', headers, payload: { holding: 'nothing' } })
  expect(lost.statusCode, lost.body).toBe(200)
  expect(lost.json().lost).toHaveLength(1)
  expect(lost.json().nothingWritten).toBeUndefined()
})

// The holder starts with keeping on. The test switches the holder alone back on after recording off,
// so the next press changes the holder while the run's remembered value remains unchanged.
it('reports unchanged terminal keeping only when the holder also changed nothing', async () => {
  const place = aPlace('keeping-answer')
  let db: Database.Database | undefined
  try {
    const runningHolder = await startAHolder(place)
    const server = await startAServer(place)
    db = new Database(place.database, { readonly: true })
    const opened = await ask(server.api, '/api/terminals', { method: 'POST', body: { folder: place.dir, command: '/bin/bash', args: ['--noprofile', '--norc'], cols: 100, rows: 30 } })
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    const terminal = opened.body.terminal as { id: string; pid: number }
    groups.add(terminal.pid)
    const filed = await ask(server.api, '/api/records', { method: 'POST', body: { kind: 'session', title: 'A running terminal', data: { state: 'running', extra: { inATerminal: { terminal: terminal.id, holder: { pid: runningHolder.pid, startedAt: null } } } } } })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const call = () => ask(server.api, `/api/terminals/${terminal.id}/keeping`, { method: 'PUT', body: { on: false } })
    const first = await call()
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.nothingWritten).toBeUndefined()
    const before = allRows(db)
    const same = await call()
    expect(same.status, JSON.stringify(same.body)).toBe(200)
    expect(allRows(db)).toEqual(before)
    expect(same.body.nothingWritten).toBe(await sentence('already-stored'))
    await holder(place, { op: 'keeping', terminal: terminal.id, on: true })
    const changedHolder = await call()
    expect(changedHolder.status, JSON.stringify(changedHolder.body)).toBe(200)
    expect(changedHolder.body.nothingWritten).toBeUndefined()
  } finally { db?.close(); await stopEverything() }
}, 120_000)

it('does not report an unchanged work area when an overlap opens a group', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const target = await register('worker')
    const other = await register('worker')
    const otherRow = t.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(other.agent.id) as { handle: string }
    const targetCall = () => app.inject({ method: 'POST', url: `/api/participants/agent/${target.agent.id}/work-area`, headers: person, payload: { workArea: ['src/overlap'], because: 'The area is needed.' } })
    const otherArea = await app.inject({ method: 'POST', url: `/api/participants/agent/${other.agent.id}/work-area`, headers: person, payload: { workArea: ['src/overlap'], because: 'The area is needed.' } })
    expect(otherArea.statusCode, otherArea.body).toBe(200)
    const prime = await targetCall()
    expect(prime.statusCode, prime.body).toBe(200)
    const marked = await targetCall()
    expect(marked.statusCode, marked.body).toBe(200)
    await repeat(targetCall, 'already-stored')
    const task = t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'The work', data: {}, actor: t.api.HUMAN })
    const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A running worker', data: { state: 'running', runtime: 'claude-code' }, actor: { type: 'agent', id: otherRow.handle } })
    const claim = await app.inject({ method: 'POST', url: '/api/claims', headers: { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': otherRow.handle }, payload: { run: run.id, things: [{ what: 'record', id: task.id }] } })
    expect(claim.statusCode, claim.body).toBe(201)
    const before = allRows()
    const result = await targetCall()
    expect(result.statusCode, result.body).toBe(200)
    expect(allRows()).not.toEqual(before)
    expect(result.json().nothingWritten).toBeUndefined()
  } finally { vi.useRealTimers() }
})
