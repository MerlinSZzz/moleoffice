// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A line repeated in the same second stores nothing; omitting its sentence or adding one to a write turns it red.
 * A rule mark repeated after it is set stores nothing; omitting its sentence or adding one to a write turns it red.
 * The rule choice is pinned by the existing mark, independently of the clock.
 * Asking for a check of an eligible running run stores nothing; omitting the sentence or using the already-stored
 * cause turns it red. The run is still running, which pins the choice independently of the clock.
 * Clearing an old check is a write even when the running run starts no new one; adding a sentence turns it red.
 * An allowed check retry by another agent counts a gate even with no finish; ignoring that count turns its case red.
 * The caller and gate setting pin that choice independently of the clock.
 * A repeated overdue hand-back leaves all rows unchanged; writing on the repeat turns its case red.
 * Tool start and end repeats name the existing session and ending; dropping their sentences or adding them to a write
 * turns the respective case red. The recorded session and ending pin both choices without a faked clock.
 * Repeating a nobody-started note in the same second stores nothing; removing the sentence or adding it to a write turns it red.
 * A repeated check tool ending uses its stored ending; removing the sentence or adding it to a write turns it red.
 * The stored tool ending pins that choice without a faked clock.
 * A seal waiting for the queue hold is decided once; dropping the repeat sentence or adding it to a write turns it red.
 * A queued seal's stored decision also answers without a write; dropping its sentence turns the case red.
 * A repeated tool ending that settles a waiting seal still writes; deciding from the ending alone turns the case red.
 * The stored waiting decision pins the repeat independently of the clock.
 * Repeating a resolution in the same second stores nothing; omitting its sentence or adding one to a write turns it red.
 * Each changed reply with says uses its nothing-written sentence on a repeat and different words on a write; keeping
 * the old says on the repeat turns its case red.
 * A seal decision whose patch is unchanged can still count a gate; deciding from the patch alone turns its case red.
 * Once that gate is no longer met, the same refused decision stores nothing; removing its sentence turns the case red.
 * Every repeated request is compared against every table, including all rows.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { GATES } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/the-worker-actor.ts'
import { MERGE_TOOL_RUNTIME } from '../src/shared/merge-queue.ts'
import { apiApp, freshDb, thePersonsKeyHeader, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let person: Record<string, string>
beforeAll(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready(); person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() } }, 60_000)
afterAll(async () => { await app?.close(); t?.close() })

async function sentence(kind: string) {
  const mod = await import('../src/server/lib/records/patching.ts') as unknown as { nothingWrittenSentence: (reason: { kind: string }) => string }
  const result = mod.nothingWrittenSentence({ kind })
  expect(result).toEqual(expect.any(String))
  return result
}

function everyTable() {
  const db = t.client.sqlite
  // Every request writes these bookkeeping tables, including a GET; see a-write-can-be-checked-without-writing-it.test.ts.
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
    .map(row => row.name).filter(name => name !== 'api_calls' && name !== 'header_only_calls')
  return Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all().map(row => JSON.stringify(row)).sort()]))
}

async function register(handle: string) {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle, name: 'Synthetic participant', role: 'worker', workArea: ['work'] } })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json().agent.id as string
}

const officeWorker = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': THE_WORKER.type, 'x-mole-office-actor-id': THE_WORKER.id }
async function aMergeEntry(resolving = false) {
  const { asTheMergeQueue } = await import('../src/server/lib/merge-entry-door.ts')
  const { THE_OFFICE } = await import('../src/server/lib/inspection.ts')
  return asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: 'Synthetic merge entry', workspaceId: 'default', origin: 'fixture', actor: THE_OFFICE, data: {
    run: 'synthetic-run', seal: { id: 'synthetic-seal', hash: 'synthetic-hash' },
    changeset: { adapter: 'git', root: '/synthetic/tree', repository: 'synthetic', branch: 'work', commit: 'a', base: 'b' },
    state: resolving ? 'resolving' : 'submitted', submittedBy: { kind: 'person', id: THE_PERSON },
    ...(resolving ? { resolving: { files: ['synthetic.txt'], says: 'Synthetic conflict.', since: '2026-11-16T12:00:00.000Z', timeZone: 'UTC' } } : {}),
  } }))
}

it('answers a repeated nobody-started note and writes at a later second', async () => {
  const entry = await aMergeEntry(true)
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const call = () => app.inject({ method: 'POST', url: `/api/merge-queue/${entry.id}/nobody-started`, headers: person, payload: { status: 409, said: 'Synthetic refusal.' } })
    const first = await call()
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().nothingWritten).toBeUndefined()
    const before = everyTable()
    const again = await call()
    expect(again.statusCode, again.body).toBe(first.statusCode)
    expect(everyTable()).toEqual(before)
    expect(again.json().nothingWritten).toEqual(expect.any(String))
    expect(again.json().nothingWritten).toBe(await sentence('already-stored'))
    expect(again.json().says).toBe(again.json().nothingWritten)
    expect(first.json().says).not.toBe(again.json().nothingWritten)
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const later = await call()
    expect(later.statusCode, later.body).toBe(200)
    expect(later.json().nothingWritten).toBeUndefined()
  } finally { vi.useRealTimers() }
})
function aMergeToolRun() {
  return t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic merge tool', origin: 'fixture', actor: THE_WORKER, data: { state: 'running', runtime: MERGE_TOOL_RUNTIME } })
}

it('answers a repeated resolution and writes it again in a later second', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'resolution-criterion-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    git('init', '-q', '-b', 'main')
    git('config', 'user.name', 'Synthetic fixture')
    git('config', 'user.email', 'fixture@example.invalid')
    writeFileSync(join(dir, 'fixture.txt'), 'Synthetic contents.\n')
    git('add', 'fixture.txt')
    git('commit', '-qm', 'Synthetic fixture')
    const mainAt = git('rev-parse', 'HEAD')
    writeFileSync(join(dir, 'fixture.txt'), 'Synthetic resolution.\n')
    git('add', 'fixture.txt')
    git('commit', '-qm', 'Synthetic resolution')
    const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic resolving run', origin: 'fixture', actor: t.api.HUMAN, data: { state: 'running' } })
    const entry = await aMergeEntry(true)
    writeDataBypassingTheGate(t, entry.id, { ...entry.data, run: run.id, resolving: { ...entry.data.resolving as object, since: '2026-11-16 12:00:00', mainAt } })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const call = () => app.inject({ method: 'POST', url: `/api/merge-queue/${entry.id}/resolution`, headers: person, payload: { workingDirectory: dir } })
    const first = await call()
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().nothingWritten).toBeUndefined()
    const before = everyTable()
    const again = await call()
    expect(again.statusCode, again.body).toBe(first.statusCode)
    expect(everyTable()).toEqual(before)
    expect(again.json().nothingWritten).toEqual(expect.any(String))
    expect(again.json().nothingWritten).toBe(await sentence('already-stored'))
    expect(again.json().says).toBe(again.json().nothingWritten)
    expect(first.json().says).not.toBe(again.json().nothingWritten)
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const later = await call()
    expect(later.statusCode, later.body).toBe(200)
    expect(later.json().nothingWritten).toBeUndefined()
  } finally { vi.useRealTimers(); rmSync(dir, { recursive: true, force: true }) }
})

it('answers a repeated merge tool start', async () => {
  const entry = await aMergeEntry(), tool = aMergeToolRun()
  const call = () => app.inject({ method: 'POST', url: `/api/merge-queue/${entry.id}/tool-started`, headers: officeWorker, payload: { session: tool.id, log: '/synthetic/tool.log' } })
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  const before = everyTable()
  const again = await call()
  expect(again.statusCode, again.body).toBe(first.statusCode)
  expect(everyTable()).toEqual(before)
  expect(again.json().nothingWritten).toEqual(expect.any(String))
  expect(again.json().nothingWritten).toBe(await sentence('already-stored'))
})

it('answers a repeated merge tool ending when no waiting seal is settled', async () => {
  const entry = await aMergeEntry(), tool = aMergeToolRun()
  const started = await app.inject({ method: 'POST', url: `/api/merge-queue/${entry.id}/tool-started`, headers: officeWorker, payload: { session: tool.id, log: '/synthetic/tool.log' } })
  expect(started.statusCode, started.body).toBe(200)
  const call = () => app.inject({ method: 'POST', url: `/api/merge-queue/${entry.id}/tool-ended`, headers: officeWorker, payload: { session: tool.id, reason: 'Synthetic ending.' } })
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  const before = everyTable()
  const again = await call()
  expect(again.statusCode, again.body).toBe(first.statusCode)
  expect(everyTable()).toEqual(before)
  expect(again.json().nothingWritten).toEqual(expect.any(String))
  expect(again.json().nothingWritten).toBe(await sentence('already-stored'))
  expect(again.json().says).toBe(again.json().nothingWritten)
  expect(first.json().says).not.toBe(again.json().nothingWritten)
})

it('answers a repeated check tool ending', async () => {
  const inspector = await register('check-inspector-fixture')
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic checked run', origin: 'fixture', actor: t.api.HUMAN, data: { state: 'running' } })
  const tool = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic check tool', origin: 'fixture', actor: THE_WORKER, data: { state: 'running', runtime: 'inspection-tool' } })
  // A synthetic earlier tool start, kept in the same shape the check reader consumes.
  writeDataBypassingTheGate(t, run.id, { ...run.data, theCheck: { askedAt: '2026-11-16 12:00:00', checkout: { directory: '/synthetic/tree', cutFrom: 'main' }, says: 'Synthetic started check.', askedOf: inspector, execution: { session: tool.id, log: '/synthetic/check.log', model: 'synthetic', minutes: 1 } } })
  const call = () => app.inject({ method: 'POST', url: `/api/checks/${run.id}/tool-ended`, headers: officeWorker, payload: { session: tool.id, reason: 'Synthetic ending.' } })
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  const before = everyTable()
  const again = await call()
  expect(again.statusCode, again.body).toBe(first.statusCode)
  expect(everyTable()).toEqual(before)
  expect(again.json().nothingWritten).toEqual(expect.any(String))
  expect(again.json().nothingWritten).toBe(await sentence('already-stored'))
  expect(again.json().says).toBe(again.json().nothingWritten)
  expect(first.json().says).not.toBe(again.json().nothingWritten)
})

it('answers a repeated seal decision while the queue is held', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'queue-criterion-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    git('init', '-q', '-b', 'main')
    git('config', 'user.name', 'Synthetic fixture')
    git('config', 'user.email', 'fixture@example.invalid')
    writeFileSync(join(dir, 'fixture.txt'), 'Synthetic contents.\n')
    git('add', 'fixture.txt')
    git('commit', '-qm', 'Synthetic fixture')
    const agent = await register('seal-fixture')
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: 'default', name: 'seal-fixture', root: dir, actor: { type: 'human', id: THE_PERSON, provedBy: 'the-person-key' } })
    const line = await app.inject({ method: 'POST', url: '/api/merge-queue/lines', headers: person, payload: { agent, on: true, repository: 'seal-fixture', because: 'Synthetic queue line.' } })
    expect(line.statusCode, line.body).toBe(200)
    const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic sealed run', origin: 'fixture', actor: t.api.HUMAN, data: { state: 'running', servingAgentId: agent, workingDirectory: dir, cutFrom: 'main' } })
    const sealed = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: person, payload: { dataPatch: { state: 'finished', submission: { kind: 'git' } } } })
    expect(sealed.statusCode, sealed.body).toBe(200)
    const changes = ['queue-at-the-seal', 'queue-held'].map(id => ({ name: GATES.find(gate => gate.id === id)!.setting, value: '1' }))
    const settings = await app.inject({ method: 'POST', url: '/api/office/settings', headers: person, payload: { changes, because: 'Synthetic held queue.' } })
    expect(settings.statusCode, settings.body).toBe(200)
    const call = () => app.inject({ method: 'POST', url: '/api/merge-queue/at-the-seal/again', headers: person, payload: { run: run.id } })
    const first = await call()
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().nothingWritten).toBeUndefined()
    const before = everyTable()
    const again = await call()
    expect(again.statusCode, again.body).toBe(first.statusCode)
    expect(everyTable()).toEqual(before)
    expect(again.json().nothingWritten).toEqual(expect.any(String))
    expect(again.json().nothingWritten).toBe(await sentence('already-stored'))
    expect(again.json().says).toBe(again.json().nothingWritten)
    expect(first.json().says).not.toBe(again.json().nothingWritten)
    const endingEntry = await aMergeEntry(), tool = aMergeToolRun()
    const started = await app.inject({ method: 'POST', url: `/api/merge-queue/${endingEntry.id}/tool-started`, headers: officeWorker, payload: { session: tool.id, log: '/synthetic/tool.log' } })
    expect(started.statusCode, started.body).toBe(200)
    const end = () => app.inject({ method: 'POST', url: `/api/merge-queue/${endingEntry.id}/tool-ended`, headers: officeWorker, payload: { session: tool.id, reason: 'Synthetic ending.' } })
    const firstEnding = await end()
    expect(firstEnding.statusCode, firstEnding.body).toBe(200)
    expect(firstEnding.json().nothingWritten).toBeUndefined()
    const endingRecord = t.api.getRecord(endingEntry.id)!
    writeDataBypassingTheGate(t, endingEntry.id, { ...endingRecord.data, state: 'withdrawn', toolWanted: null, occupies: null })
    // Change the fixture setting without its normal hook, so the repeated ending is what settles the waiting seal.
    t.client.sqlite.prepare('UPDATE runtime_settings SET value = ? WHERE name = ?').run('0', GATES.find(gate => gate.id === 'queue-held')!.setting)
    const beforeSettlement = everyTable()
    const settlement = await end()
    expect(settlement.statusCode, settlement.body).toBe(200)
    expect(everyTable().revisions).not.toEqual(beforeSettlement.revisions)
    expect(settlement.json().nothingWritten).toBeUndefined()
    const afterSettlement = everyTable()
    const repeatedEnding = await end()
    expect(repeatedEnding.statusCode, repeatedEnding.body).toBe(200)
    expect(everyTable()).toEqual(afterSettlement)
    expect(repeatedEnding.json().nothingWritten).toBe(await sentence('already-stored'))
    expect(repeatedEnding.json().says).toBe(repeatedEnding.json().nothingWritten)
    const beforeCached = everyTable()
    const cached = await call()
    expect(cached.statusCode, cached.body).toBe(200)
    expect(cached.json().queuedAtTheSeal.entry).toEqual(expect.any(String))
    expect(everyTable()).toEqual(beforeCached)
    expect(cached.json().nothingWritten).toBe(await sentence('already-stored'))
    expect(cached.json().says).toBe(cached.json().nothingWritten)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it('does not say nothing was written when a repeated seal decision counts a gate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'queue-gate-criterion-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    git('init', '-q', '-b', 'main')
    git('config', 'user.name', 'Synthetic fixture')
    git('config', 'user.email', 'fixture@example.invalid')
    writeFileSync(join(dir, 'fixture.txt'), 'Synthetic contents.\n')
    git('add', 'fixture.txt')
    git('commit', '-qm', 'Synthetic fixture')
    const agent = await register('seal-gate-fixture')
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: 'default', name: 'seal-gate-fixture', root: dir, actor: { type: 'human', id: THE_PERSON, provedBy: 'the-person-key' } })
    const off = await app.inject({ method: 'POST', url: '/api/office/settings', headers: person, payload: { changes: [{ name: GATES.find(gate => gate.id === 'queue-at-the-seal')!.setting, value: '0' }], because: 'Synthetic queue setup.' } })
    expect(off.statusCode, off.body).toBe(200)
    const line = await app.inject({ method: 'POST', url: '/api/merge-queue/lines', headers: person, payload: { agent, on: true, repository: 'seal-gate-fixture', because: 'Synthetic queue line.' } })
    expect(line.statusCode, line.body).toBe(200)
    const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic sealed gate run', origin: 'fixture', actor: t.api.HUMAN, data: { state: 'running', servingAgentId: agent, workingDirectory: dir, cutFrom: 'main' } })
    const sealed = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: person, payload: { dataPatch: { state: 'finished', submission: { kind: 'git' } } } })
    expect(sealed.statusCode, sealed.body).toBe(200)
    const other = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic earlier run', origin: 'fixture', actor: t.api.HUMAN, data: { state: 'running', servingAgentId: agent } })
    const entry = await aMergeEntry()
    writeDataBypassingTheGate(t, entry.id, { ...entry.data, run: other.id })
    const changes = [['queue-at-the-seal', '1'], ['queue-held', '0'], ['queue-waits-for-the-line', '0']].map(([id, value]) => ({ name: GATES.find(gate => gate.id === id)!.setting, value }))
    const settings = await app.inject({ method: 'POST', url: '/api/office/settings', headers: person, payload: { changes, because: 'Synthetic queue settings.' } })
    expect(settings.statusCode, settings.body).toBe(200)
    rmSync(dir, { recursive: true, force: true })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const call = () => app.inject({ method: 'POST', url: '/api/merge-queue/at-the-seal/again', headers: person, payload: { run: run.id } })
    const first = await call()
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().nothingWritten).toBeUndefined()
    expect(first.json().queuedAtTheSeal.says).toEqual(expect.any(String))
    const before = everyTable()
    const again = await call()
    expect(again.statusCode, again.body).toBe(first.statusCode)
    const after = everyTable()
    expect(after.revisions).toEqual(before.revisions)
    expect(after.gate_counts).not.toEqual(before.gate_counts)
    expect(again.json().nothingWritten).toBeUndefined()
    const held = t.api.getRecord(entry.id)!
    writeDataBypassingTheGate(t, entry.id, { ...held.data, state: 'withdrawn' })
    const beforeEmpty = everyTable()
    const empty = await call()
    expect(empty.statusCode, empty.body).toBe(200)
    expect(everyTable()).toEqual(beforeEmpty)
    expect(empty.json().nothingWritten).toEqual(expect.any(String))
    expect(empty.json().nothingWritten).toBe(await sentence('already-stored'))
    expect(empty.json().says).toBe(empty.json().nothingWritten)
    expect(first.json().says).not.toBe(empty.json().nothingWritten)
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const later = await call()
    expect(later.statusCode, later.body).toBe(200)
    expect(later.json().nothingWritten).toBeUndefined()
  } finally { vi.useRealTimers(); rmSync(dir, { recursive: true, force: true }) }
})

it('answers a repeated line and writes it again in a later second', async () => {
  const agent = await register('line-fixture')
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const call = () => app.inject({ method: 'POST', url: '/api/merge-queue/lines', headers: person, payload: { agent, on: false, because: 'Synthetic line choice.' } })
    const first = await call()
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().nothingWritten).toBeUndefined()
    const before = everyTable()
    const again = await call()
    expect(again.statusCode, again.body).toBe(first.statusCode)
    expect(everyTable()).toEqual(before)
    expect(again.json().nothingWritten).toEqual(expect.any(String))
    expect(again.json().nothingWritten).toBe(await sentence('already-stored'))
    expect(again.json().says).toBe(again.json().nothingWritten)
    expect(first.json().says).not.toBe(again.json().nothingWritten)
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const later = await call()
    expect(later.statusCode, later.body).toBe(200)
    expect(later.json().nothingWritten).toBeUndefined()
  } finally { vi.useRealTimers() }
})

it('answers an existing office rule mark and omits the sentence on its first write', async () => {
  const copy = await import('../src/server/lib/default-regulations.ts')
  copy.copyTheDefaultRegulationsOnce()
  const rules = await app.inject({ method: 'GET', url: '/api/office-regulations', headers: person })
  expect(rules.statusCode, rules.body).toBe(200)
  const chapter = rules.json().chapters.find((one: { outline: unknown[] }) => one.outline.length > 0)
  const rule = chapter.outline[0].id as string
  const current = chapter.outline[0].onlyThisOffice !== null
  const call = (only: boolean) => app.inject({ method: 'POST', url: '/api/office-regulations/only-this-office', headers: person, payload: { chapter: chapter.id, rule, only } })
  const first = await call(!current)
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  const before = everyTable()
  const again = await call(!current)
  expect(again.statusCode, again.body).toBe(first.statusCode)
  expect(everyTable()).toEqual(before)
  expect(again.json().changed).toBe(false)
  expect(again.json().nothingWritten).toEqual(expect.any(String))
  expect(again.json().nothingWritten).toBe(await sentence('already-stored'))
})

it('answers when a running eligible run has no finish to check', async () => {
  const agent = await register('check-fixture')
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic running check', origin: 'fixture', actor: t.api.HUMAN, data: { state: 'running', servingAgentId: agent, workingDirectory: process.cwd() } })
  const before = everyTable()
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run.id}/ask-again`, headers: person, payload: {} })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(everyTable()).toEqual(before)
  expect(reply.json().theCheck).toBeNull()
  expect(reply.json().nothingWritten).toEqual(expect.any(String))
  expect(reply.json().nothingWritten).toBe(await sentence('no-finish-to-check'))
})

it('does not say nothing was written when an old check was cleared', async () => {
  const agent = await register('check-clear-fixture')
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic running check to clear', origin: 'fixture', actor: t.api.HUMAN, data: { state: 'running', servingAgentId: agent, workingDirectory: process.cwd() } })
  // An earlier stored check on a still-running fixture gives the door something to clear.
  writeDataBypassingTheGate(t, run.id, { ...run.data, theCheck: { askedAt: '2026-11-16 12:00:00', checkout: null, says: 'Synthetic earlier check.' } })
  const before = everyTable()
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run.id}/ask-again`, headers: person, payload: {} })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(everyTable()).not.toEqual(before)
  expect(reply.json().theCheck).toBeNull()
  expect(reply.json().nothingWritten).toBeUndefined()
})

it('does not say nothing was written when a check retry counts the caller gate', async () => {
  const agent = await register('check-gate-fixture')
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic running check with a caller gate', origin: 'fixture', actor: t.api.HUMAN, data: { state: 'running', servingAgentId: agent, workingDirectory: process.cwd() } })
  const setting = GATES.find(gate => gate.id === 'who-asks-for-a-check-again')!.setting
  const settings = await app.inject({ method: 'POST', url: '/api/office/settings', headers: person, payload: { changes: [{ name: setting, value: 'off' }], because: 'Synthetic caller gate.' } })
  expect(settings.statusCode, settings.body).toBe(200)
  const before = everyTable()
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run.id}/ask-again`, headers: officeWorker, payload: {} })
  expect(reply.statusCode, reply.body).toBe(200)
  const after = everyTable()
  expect(after.revisions).toEqual(before.revisions)
  expect(after.gate_counts).not.toEqual(before.gate_counts)
  expect(reply.json().theCheck).toBeNull()
  expect(reply.json().nothingWritten).toBeUndefined()
})

it('leaves every row alone when an overdue hand-back is repeated', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const problem = t.api.createRecord({ workspaceId: 'default', kind: 'problem', title: 'Synthetic overdue hand-back', origin: 'fixture', actor: t.api.HUMAN, data: { state: 'open', extra: { emergencyPushHandBack: { push: 'synthetic-push', line: null, deadline: '2026-11-15 12:00:00', timeZone: 'UTC', dueAt: '2026-11-15T12:00:00.000Z' } } } })
    const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': THE_WORKER.type, 'x-mole-office-actor-id': THE_WORKER.id }
    const call = () => app.inject({ method: 'POST', url: `/api/worker/merges/hand-backs/${problem.id}/a-person-must-look`, headers, payload: {} })
    const before = everyTable()
    const first = await call()
    expect(first.statusCode, first.body).toBe(200)
    const after = everyTable()
    expect(after).not.toEqual(before)
    const again = await call()
    expect(again.statusCode, again.body).toBe(first.statusCode)
    expect(everyTable()).toEqual(after)
    expect(again.json().nothingWritten).toBeUndefined()
  } finally { vi.useRealTimers() }
})
