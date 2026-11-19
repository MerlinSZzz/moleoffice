// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The start and the seal both remind a run of its direction without adding a seal item. */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { aLabelFor, aReportInForm } from './a-run-in-form.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const OFFICE_KEY = randomBytes(32).toString('hex')
const PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'direction-test-agent'
const START = '2026-01-20 12:00:00'
const BEFORE = '2026-01-19 12:00:00'
const AFTER = '2026-01-21 12:00:00'
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const OFFICE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker', 'x-mole-office-key': OFFICE_KEY }
const actor = { type: 'human' as const, id: THE_PERSON }
type Run = { id: string; key: string }
type Card = { id: string; kind: 'pipeline' | 'module'; title: string; stamp: string }
type Reminder = { purpose?: string; items: unknown[]; line: string; sealed: boolean }
let t: TestDb
let app: FastifyInstance
let agentId = ''

const headers = (run: Run, withSession = true) => ({
  'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE, 'x-mole-office-key': run.key,
  ...(withSession ? { 'x-mole-office-session': run.id } : {}),
})

// Resolve only after a case has proved the reply carries a purpose. The criterion has no stub reader.
async function sentenceExports(): Promise<any> {
  const path = ['..', 'src', 'server', 'lib', 'the-purpose-of-a-round.ts'].join('/')
  return import(/* @vite-ignore */ path)
}

async function newRun(): Promise<Run> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: OFFICE, payload: {
    kind: 'session', title: 'A made-up direction run',
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'a made-up direction round' },
  } })
  expect(reply.statusCode, reply.body).toBe(201)
  const body = reply.json() as { record: { id: string }; runKey: { key: string } }
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(START, body.record.id)
  return { id: body.record.id, key: body.runKey.key }
}

function card(kind: Card['kind'], stamp = BEFORE): Card {
  const title = kind === 'pipeline' ? 'Synthetic kiln direction' : 'Synthetic kiln module'
  const made = t.api.createRecord({ workspaceId: 'default', kind, title, data: {}, actor })
  t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?').run(stamp, made.id)
  return { id: made.id, kind, title, stamp }
}

// A run's direction is its own stored part_of link to the card. The other links are written here to show they are not.
function link(run: Run, direction: Card, how: { type?: 'part_of' | 'about'; reverse?: boolean; inferred?: boolean } = {}): string {
  const { type = 'part_of', reverse = false, inferred = false } = how
  return t.api.createLink({ fromId: reverse ? direction.id : run.id, toId: reverse ? run.id : direction.id, type, inferred, actor }).id
}

function makeWorker(run: Run, parent: Run): void {
  const parentData = t.api.getRecord(parent.id)!.data
  const childData = t.api.getRecord(run.id)!.data
  const entry = {
    state: 'started', askedAt: START, handle: HANDLE,
    askedBy: { who: { kind: 'agent', id: agentId }, session: parent.id },
    brief: { path: '/fixture/brief', sha256: 'a'.repeat(64), bytes: 1 },
    sandbox: { folder: '/fixture', instance: 'fixture', container: 'fixture' },
    started: { at: START, run: run.id, runKeyId: 'fixture-key' },
  }
  const put = t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  put.run(JSON.stringify({ ...parentData, workerRuns: { [agentId]: entry } }), parent.id)
  put.run(JSON.stringify({ ...childData, parentAttachment: parent.id }), run.id)
}

async function brief(run: Run, withSession = true): Promise<{ purpose?: string; head: string }> {
  const reply = await app.inject({ method: 'GET', url: '/api/brief', headers: headers(run, withSession) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { purpose?: string; head: string }
}

async function start(run: Run): Promise<{ purpose?: string; head: string }> {
  const reply = await app.inject({ method: 'GET', url: '/api/where-you-stand', headers: headers(run, false) })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { brief: { purpose?: string; head: string } }).brief
}

async function finish(run: Run): Promise<{ reminder: Reminder; version: string; payload: object }> {
  const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Synthetic hand-back', data: { body: 'Synthetic result.' }, actor })
  await aLabelFor(note.id)
  const payload = { dataPatch: { state: 'finished', submission: { kind: 'records', records: [note.id] } } }
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: headers(run), payload })
  expect(reply.statusCode, reply.body).toBe(200)
  const body = reply.json() as { beforeTheSeal: Reminder; version: string }
  expect(body.beforeTheSeal?.sealed).toBe(false)
  return { reminder: body.beforeTheSeal, version: body.version, payload }
}

function lineFor(reminder: Reminder): string {
  return String(t.api.getRecord(reminder.line)!.data['saidInFull'])
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(made.statusCode, made.body).toBe(201)
  const people = (await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })).json() as { agents: { id: string; handle: string }[] }
  agentId = people.agents.find((one) => one.handle === HANDLE)!.id
}, 60_000)

afterAll(async () => { await app?.close(); t?.close() })

describe('a direction at both moments', () => {
  it('names a linked pipeline and its earlier update at the start and the seal', async () => {
    const run = await newRun()
    const direction = card('pipeline')
    link(run, direction)
    const opening = await brief(run, false)
    const started = await start(run)
    const handback = await finish(run)
    expect(opening.purpose).toEqual(expect.any(String))
    expect(started.purpose).toEqual(expect.any(String))
    expect(handback.reminder.purpose).toEqual(expect.any(String))
    const s = await sentenceExports()
    const expected = [s.directionSentence('round', direction.kind, direction.title, direction.id), s.cardChangedSentence(direction.stamp, 'before', 'round'), s.updateCardSentence()].join(' ')
    expect(opening.purpose).toBe(expected)
    expect(opening.head).toContain(expected)
    expect(started.purpose).toBe(expected)
    expect(started.head).toContain(expected)
    expect(handback.reminder.purpose).toBe(expected)
    expect(lineFor(handback.reminder).endsWith(expected)).toBe(true)
  })

  it('takes no about link and no reverse link as the direction, and reads a module part_of link and its later update', async () => {
    const run = await newRun()
    link(run, card('module'), { type: 'about' })
    link(run, card('pipeline'), { type: 'about', reverse: true })
    link(run, card('module'), { reverse: true })
    const unlinked = await brief(run)
    expect(unlinked.purpose).toEqual(expect.any(String))
    const s = await sentenceExports()
    expect(unlinked.purpose).toBe([s.whichDirectionSentence('round'), s.linkDirectionSentence(run.id)].join(' '))
    const direction = card('module', AFTER)
    link(run, direction)
    const opening = await brief(run)
    const handback = await finish(run)
    const expected = [s.directionSentence('round', direction.kind, direction.title, direction.id), s.cardChangedSentence(direction.stamp, 'after', 'round')].join(' ')
    expect(opening.purpose).toBe(expected)
    expect(handback.reminder.purpose).toBe(expected)
  })

  it('asks an unlinked round and leaves the items and second seal unchanged', async () => {
    const run = await newRun()
    // The run's records are in form, so the second write seals and the items compared are the purpose's alone.
    await aReportInForm(t, run.id, HANDLE)
    const opening = await brief(run)
    const seal = await import('../src/server/lib/before-the-seal.ts')
    const before = t.api.getRecord(run.id)!
    const expectedItems = seal.whatAnInspectorWouldMostLikelyRefuse(seal.theFactsBeforeTheSealOf(before)).items
    const handback = await finish(run)
    expect(handback.reminder.items).toEqual(expectedItems)
    const second = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: headers(run), payload: { ...handback.payload, ifVersion: handback.version } })
    expect(second.statusCode, second.body).toBe(200)
    expect(t.api.getRecord(run.id)!.data['state']).toBe('finished')
    expect(opening.purpose).toEqual(expect.any(String))
    expect(handback.reminder.purpose).toEqual(expect.any(String))
    const s = await sentenceExports()
    const expected = [s.whichDirectionSentence('round'), s.linkDirectionSentence(run.id)].join(' ')
    expect(opening.purpose).toBe(expected)
    expect(handback.reminder.purpose).toBe(expected)
    expect(lineFor(handback.reminder).endsWith(expected)).toBe(true)
  })

  it('tells an unlinked worker its verified supervisor direction and asks for its report', async () => {
    const parent = await newRun()
    const worker = await newRun()
    const direction = card('pipeline')
    link(parent, direction)
    makeWorker(worker, parent)
    const opening = await brief(worker)
    const handback = await finish(worker)
    expect(opening.purpose).toEqual(expect.any(String))
    expect(handback.reminder.purpose).toEqual(expect.any(String))
    const s = await sentenceExports()
    const expected = [s.directionSentence('supervisors-round', direction.kind, direction.title, direction.id), s.cardChangedSentence(direction.stamp, 'before', 'run'), s.reportPieceSentence()].join(' ')
    expect(opening.purpose).toBe(expected)
    expect(handback.reminder.purpose).toBe(expected)
  })

  it('uses a worker’s own link and does not treat inferred links as its direction', async () => {
    const parent = await newRun()
    const worker = await newRun()
    const guess = card('module')
    const direction = card('module')
    makeWorker(worker, parent)
    const inferred = link(worker, guess, { inferred: true })
    const guessed = await brief(worker)
    expect(guessed.purpose).toEqual(expect.any(String))
    const s = await sentenceExports()
    expect(guessed.purpose).toBe([s.whichDirectionSentence('run'), s.linkDirectionSentence(worker.id), s.reportPieceSentence()].join(' '))
    // A record is part of one thing, and an inferred part_of link holds that place too, so it goes before the stored one.
    t.api.deleteLink(inferred, actor, 'default')
    link(worker, direction)
    const linked = await brief(worker)
    expect(linked.purpose).toBe([s.directionSentence('run', direction.kind, direction.title, direction.id), s.cardChangedSentence(direction.stamp, 'before', 'run'), s.reportPieceSentence()].join(' '))
  })
})
