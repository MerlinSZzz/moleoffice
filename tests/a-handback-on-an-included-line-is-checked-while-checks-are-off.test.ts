// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A qualifying hand-back still gets a check when the office switches checks off.
 * Every record, line, agent and reason in this file is made up in a fresh test office.
 * Mutations a reviewer could run: remove the exception at seal, close every waiting
 * run at startup, or report that no check was asked; each breaks a case.
 */
import { execFileSync } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { NEEDS_NO_CHECK_RULES, howARunStands } from '../src/shared/releasing.ts'
import { theRoundNotForACheckSays } from '../src/server/lib/how-a-round-ended-rules.ts'

const WORKSPACE = 'default'
const WORKER = 'synthetic-checks-off-worker'
const SUPERVISOR = 'synthetic-checks-off-supervisor'
const ROUND_WORKER = 'synthetic-checks-off-round-worker'
const INSPECTOR = 'synthetic-checks-off-inspector'
const RULE = NEEDS_NO_CHECK_RULES[1]
const WORDS = "The office's checks were switched off, so the office closed this run with no check, and nothing waits on it."
const REWORK = "The worker said its work was finished again after the refusal. The office's checks were switched off, so no fresh check was asked. The refusal stays on the record: it is what the rework answered."
const OLD_REWORK = 'The worker said its work was finished again after the refusal, so the office asked for a fresh check. The refusal stays on the record: it is what the rework answered.'
const as = (type: 'agent' | 'human', id: string, session?: string): Record<string, string> => ({
  'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const person = as('human', THE_PERSON)
let t: TestDb
let app: FastifyInstance
let checkout: string
let tip: string
let supervisorId: string
let inspection: typeof import('../src/server/lib/inspection.ts')
let minute: typeof import('../src/server/lib/a-check-nothing-starts.ts')
let closeAtStart: typeof import('../src/server/lib/close-waiting-checks-when-off.ts')

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>, headers = person) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, any>, raw: reply.body }
}
async function register(handle: string, role: string, headers = person): Promise<string> {
  const reply = await call('POST', '/api/agents/started', { handle, name: `Synthetic ${role}`, role, ...(role === 'secretary' ? {} : { workArea: ['tests'] }) }, headers)
  expect(reply.status, reply.raw).toBe(201)
  return reply.body['agent']['id'] as string
}
async function switchChecks(on: boolean, projects?: string[]) {
  const reply = await call('POST', '/api/office/checks-in-merges-only', { on, ...(projects === undefined ? {} : { projects }), because: 'Synthetic switch choice.' })
  expect(reply.status, reply.raw).toBe(200)
}
// A RUN WITH A SANDBOX IS FILED BY ITS AGENT'S STARTER, as a launcher files it: the office refuses a run that names its own sandbox.
async function makeRun(handle = WORKER, extra: Record<string, unknown> = {}): Promise<string> {
  const filed = await call('POST', '/api/records', { kind: 'session', title: 'Synthetic checks-off run', data: {
    state: 'running', servingAgent: handle, workingDirectory: checkout, cutFrom: 'main', tip, doing: 'Synthetic work.', ...extra,
  } }, as('agent', extra['sandbox'] === undefined ? handle : handle === SUPERVISOR ? THE_TEST_OFFICES_SECRETARY.handle : SUPERVISOR))
  expect(filed.status, filed.raw).toBe(201)
  const run = filed.body['record']['id'] as string
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  return run
}
async function seal(run: string, handle = WORKER) {
  const reply = await call('PATCH', `/api/records/${run}`, { dataPatch: { state: 'finished' } }, as('agent', handle))
  expect(reply.status, reply.raw).toBe(200)
  return reply.body
}
function messages(run: string, notice: string) {
  return t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = ?").all(run, notice)
}
function messagesToFiler(run: string) {
  const filer = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(THE_TEST_OFFICES_SECRETARY.handle) as { id: string }).id
  return t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND EXISTS (SELECT 1 FROM json_each(data, '$.to') AS recipient WHERE json_extract(recipient.value, '$.id') = ?)").all(run, filer)
}
function assertClosed(run: string) {
  const record = t.api.getRecord(run)!
  expect(record.data['needsNoCheck']).toMatchObject({ rule: RULE, at: expect.any(String), because: expect.any(String) })
  expect(howARunStands(record.data)).toMatchObject({ standing: 'closed', waitingFor: null, unreleasedFinish: false, says: WORDS })
  expect(record.data['aCheckNothingStarts']).toBeUndefined()
  expect(inspection.theCheckAskedFor(record)).toBeNull()
  expect(messages(run, 'aCheckWasQueued')).toEqual([])
}
async function wordToStarter(run: string, line: string): Promise<string> {
  const sent = await call('POST', '/api/records', { kind: 'message', title: 'Synthetic round message', data: {
    body: line, to: [{ kind: 'agent', id: supervisorId }], aboutRun: run,
  } }, as('agent', ROUND_WORKER, run))
  expect(sent.status, sent.raw).toBe(409)
  return sent.body['record']['id'] as string
}
function revisions(run: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(run) as { n: number }).n
}
async function refusedRun(): Promise<string> {
  const run = await makeRun()
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
  const check = await call('POST', '/api/records', { kind: 'session', title: 'Synthetic refusal check', data: {
    state: 'running', servingAgent: INSPECTOR, doing: 'Synthetic check.',
  } }, as('agent', THE_TEST_OFFICES_SECRETARY.handle))
  expect(check.status, check.raw).toBe(201)
  const checkRun = check.body['record']['id'] as string
  const assembled = await call('POST', `/api/checks/${run}/assembled`, { changes: [] }, as('agent', INSPECTOR, checkRun))
  expect(assembled.status, assembled.raw).toBe(201)
  const refusal = await call('POST', `/api/checks/${run}`, { verdict: 'refused', check: 'Synthetic check.', missing: ['Synthetic missing work.'], says: { chapter: 5 }, chaptersRead: [] }, as('agent', INSPECTOR, checkRun))
  expect(refusal.status, refusal.raw).toBe(201)
  return run
}

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'merges-only')
  checkout = process.cwd()
  tip = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  t = await freshDb()
  inspection = await import('../src/server/lib/inspection.ts')
  minute = await import('../src/server/lib/a-check-nothing-starts.ts')
  closeAtStart = await import('../src/server/lib/close-waiting-checks-when-off.ts')
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'second', title: 'Synthetic other project' })
  await register(THE_TEST_OFFICES_SECRETARY.handle, 'secretary')
  await register(INSPECTOR, 'inspector')
  await register(WORKER, 'worker', as('agent', THE_TEST_OFFICES_SECRETARY.handle))
  supervisorId = await register(SUPERVISOR, 'supervisor', as('agent', THE_TEST_OFFICES_SECRETARY.handle))
  await register(ROUND_WORKER, 'worker', as('agent', SUPERVISOR))
}, 60_000)
afterEach(async () => { await app?.close(); t?.close(); vi.unstubAllEnvs() }, 60_000)


async function includeLine(): Promise<void> {
  const reply = await call('POST', '/api/office/settings', { changes: [{ name: 'MOLE_OFFICE_LINES_THE_INSPECTOR_ANSWERS', value: 'line-a' }], because: 'A made-up choice.' })
  expect(reply.status, reply.raw).toBe(200)
}

function attachHandback(run: string, line: string): void {
  const actor = { type: 'human' as const, id: THE_PERSON }
  const point = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'backlog_item', title: 'A made-up point', origin: 'fixture', actor,
    data: { line, number: 'made-up', why: 'Made up.', doneWhen: 'Made up.', state: 'todo' } })
  const task = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'task', title: 'A made-up package', origin: 'fixture', actor, data: {} })
  const pkg = { bundleId: 'made-up-bundle', forTheOutside: 'Made up.', acceptance: 'Made up.',
    parent: { kind: 'decision', id: 'made-up-parent' }, lines: [line], pointIds: [point.id],
    by: { actorType: 'human', actorId: THE_PERSON }, at: '2090-01-01 12:00:00',
    handedBack: [{ by: { actorType: 'agent', actorId: 'made-up-worker' }, at: '2090-01-01 12:00:02', run,
      points: [{ pointId: point.id, outcome: 'done', words: 'Made up.' }] }] }
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.package', json(?)) WHERE id = ?").run(JSON.stringify(pkg), task.id)
}

it('asks and keeps a qualified check open and accounts for the ask', async () => {
  await includeLine()
  await switchChecks(false)
  const sandbox = { template: 'synthetic', container: 'synthetic', folder: checkout }
  const run = await makeRun(SUPERVISOR, { sandbox })
  attachHandback(run, 'line-a')
  const answer = await seal(run, SUPERVISOR)
  expect(t.api.getRecord(run)!.data['needsNoCheck']).toBeUndefined()
  expect(messages(run, 'aCheckWasQueued')).toHaveLength(1)
  expect((answer['howTheRoundEnded'] as { theCheck: string }).theCheck).toBe('asked')
  const sweep = await closeAtStart.closeWaitingRunsWhileChecksAreOff()
  expect(sweep.closed.map(one => one.run)).not.toContain(run)
  expect(t.api.getRecord(run)!.data['needsNoCheck']).toBeUndefined()
  expect(minute.tellTheStartersOfChecksNothingStarts(new Date(Date.now() + 61 * 60_000))).not.toContain(run)
}, 60_000)

it('gives a round worker the same not-asked note with checks off and on', async () => {
  await includeLine()
  const notes = []
  for (const on of [false, true]) {
    await switchChecks(on)
    const run = await makeRun(ROUND_WORKER, { sandbox: { template: 'synthetic', container: 'synthetic', folder: checkout } })
    attachHandback(run, 'line-a')
    const answer = await seal(run, ROUND_WORKER)
    const check = inspection.theCheckAskedFor(t.api.getRecord(run)!)!
    expect(check.notAsked).toEqual({ why: 'worker-of-a-round', starter: { kind: 'agent', id: supervisorId } })
    expect(check.message).toBeUndefined()
    expect(messages(run, 'aCheckWasQueued')).toEqual([])
    expect((answer['howTheRoundEnded'] as { theCheck: string }).theCheck).toBe('not asked')
    notes.push({ notAsked: check.notAsked, says: check.says })
  }
  expect(notes[0]).toEqual(notes[1])
}, 60_000)

it('keeps the prior checks-off closure for a hand-back outside the line set', async () => {
  await includeLine()
  await switchChecks(false)
  const run = await makeRun()
  attachHandback(run, 'line-b')
  await seal(run)
  assertClosed(run)
}, 60_000)

it('still says nothing starts the check when the message worker itself is off', async () => {
  await includeLine()
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  await switchChecks(false)
  const run = await makeRun()
  attachHandback(run, 'line-a')
  await seal(run)
  expect(t.api.getRecord(run)!.data['aCheckNothingStarts']).toBeDefined()
  expect(messages(run, 'aCheckWasQueued')).toHaveLength(1)
}, 60_000)
