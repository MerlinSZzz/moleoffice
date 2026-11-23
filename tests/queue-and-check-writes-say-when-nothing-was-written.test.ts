// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A rule mark repeated after it is set stores nothing; omitting its sentence or adding one to a write turns it red.
 * The rule choice is pinned by the existing mark, independently of the clock.
 * Asking for a check of an eligible running run stores nothing; omitting the sentence or using the already-stored
 * cause turns it red. The run is still running, which pins the choice independently of the clock.
 * Clearing an old check is a write even when the running run starts no new one; adding a sentence turns it red.
 * An allowed check retry by another agent counts a gate even with no finish; ignoring that count turns its case red.
 * The caller and gate setting pin that choice independently of the clock.
 * A repeated check tool ending uses its stored ending; removing the sentence or adding it to a write turns it red.
 * The stored tool ending pins that choice without a faked clock.
 * Each changed reply with says uses its nothing-written sentence on a repeat and different words on a write; keeping
 * the old says on the repeat turns its case red.
 * Every repeated request is compared against every table, including all rows.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { GATES } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/the-worker-actor.ts'
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
