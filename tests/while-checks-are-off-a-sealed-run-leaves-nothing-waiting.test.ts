// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
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
async function makeRun(handle = WORKER, extra: Record<string, unknown> = {}): Promise<string> {
  const filed = await call('POST', '/api/records', { kind: 'session', title: 'Synthetic checks-off run', data: {
    state: 'running', servingAgent: handle, workingDirectory: checkout, cutFrom: 'main', tip, doing: 'Synthetic work.', ...extra,
  } }, as('agent', extra['sandbox'] === undefined ? handle : SUPERVISOR))
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

it('1. an off-switch seal closes the run and never asks or tells of an unstarted check', async () => {
  await switchChecks(false)
  const run = await makeRun()
  await seal(run)
  assertClosed(run)
  expect(minute.tellTheStartersOfChecksNothingStarts(new Date(Date.now() + 61 * 60_000))).not.toContain(run)
  expect(messages(run, 'theOfficeStartedNoCheck')).toEqual([])
}, 60_000)

it('2. checks on for another project close this project’s sealed run', async () => {
  await switchChecks(true, ['second'])
  const run = await makeRun()
  await seal(run)
  assertClosed(run)
}, 60_000)

it('3. every sandbox case and a worker run has no held check', async () => {
  await switchChecks(false)
  const sandbox = { template: 'synthetic', container: 'synthetic', folder: checkout }
  for (const line of ['FEATURE READY: Synthetic feature.', 'not for a check', '']) {
    const run = await makeRun(ROUND_WORKER, { sandbox })
    const message = line === '' ? null : await wordToStarter(run, line)
    const reply = await seal(run, ROUND_WORKER)
    assertClosed(run)
    const account = reply['howTheRoundEnded'] as { theCheck: string; says: string }
    expect(account.theCheck).toBe('not asked')
    expect(account.says).toBe(line === 'not for a check' ? theRoundNotForACheckSays(run, message!, line) : WORDS)
    expect(account.says).not.toContain('The starter can release the check.')
    expect(messages(run, 'theCheckIsHeld')).toEqual([])
  }
  const worker = await makeRun(ROUND_WORKER)
  await seal(worker, ROUND_WORKER)
  assertClosed(worker)
}, 60_000)

it('4. the check door says the run is closed and nothing waits', async () => {
  await switchChecks(false)
  const run = await makeRun()
  await seal(run)
  const reply = await call('GET', `/api/checks/${run}`)
  expect(reply.status, reply.raw).toBe(200)
  expect(reply.body['stands']).toMatchObject({ standing: 'closed', waitingFor: null, unreleasedFinish: false, says: WORDS })
}, 60_000)

it('5. checks on, nobody choosing and mode off retain their prior asks', async () => {
  const nobody = await makeRun()
  await seal(nobody)
  expect(t.api.getRecord(nobody)!.data['needsNoCheck']).toBeUndefined()
  expect(t.api.getRecord(nobody)!.data['aCheckNothingStarts']).toBeDefined()
  expect(messages(nobody, 'aCheckWasQueued')).toHaveLength(1)
  await switchChecks(true, [WORKSPACE])
  const on = await makeRun()
  await seal(on)
  expect(t.api.getRecord(on)!.data['needsNoCheck']).toBeUndefined()
  expect(t.api.getRecord(on)!.data['aCheckNothingStarts']).toBeUndefined()
  expect(messages(on, 'aCheckWasQueued')).toHaveLength(1)
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  await switchChecks(false)
  const modeOff = await makeRun()
  await seal(modeOff)
  expect(t.api.getRecord(modeOff)!.data['needsNoCheck']).toBeUndefined()
  expect(t.api.getRecord(modeOff)!.data['aCheckNothingStarts']).toBeDefined()
  expect(messages(modeOff, 'aCheckWasQueued')).toHaveLength(1)
}, 60_000)

it('6. the start closes a waiting run, skips a running check and an unfinished merge, and is idempotent', async () => {
  await switchChecks(true, [WORKSPACE])
  const plain = await makeRun(); await seal(plain)
  const running = await makeRun(); await seal(running)
  const merge = await makeRun(); await seal(merge)
  const check = inspection.theCheckAskedFor(t.api.getRecord(running)!)!
  const tool = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title: 'Synthetic running check', origin: 'fixture', actor: inspection.THE_OFFICE,
    data: { state: 'running', runtime: 'inspection-tool', servingAgent: INSPECTOR, deliveringMessage: check.message } }).id
  inspection.recordCheckToolStarted({ run: running, session: tool, log: '/synthetic/check.log', model: 'synthetic', minutes: 30, workspaceId: WORKSPACE })
  const { asTheMergeQueue } = await import('../src/server/lib/merge-entry-door.ts')
  asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', origin: 'fixture', workspaceId: WORKSPACE, actor: inspection.THE_OFFICE,
    title: 'Synthetic pending entry', data: { run: merge, seal: { id: 'synthetic-seal', hash: 'synthetic' },
      changeset: { adapter: 'git', root: checkout, repository: checkout, branch: 'synthetic', commit: tip, base: tip },
      state: 'pinned', submittedBy: { kind: 'agent', id: WORKER } } }))
  await switchChecks(false)
  const first = await closeAtStart.closeWaitingRunsWhileChecksAreOff()
  expect(first.closed).toEqual([expect.objectContaining({ run: plain, why: expect.any(String) })])
  expect(first.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ run: running, why: expect.stringMatching(/running/i) }), expect.objectContaining({ run: merge, why: expect.stringMatching(/merge/i) })]))
  expect(first.skipped).toHaveLength(2)
  expect(t.api.getRecord(plain)!.data['needsNoCheck']).toMatchObject({ rule: RULE })
  const before = [plain, running, merge].map(revisions)
  const second = await closeAtStart.closeWaitingRunsWhileChecksAreOff()
  expect(second.closed).toEqual([])
  expect([plain, running, merge].map(revisions)).toEqual(before)
  await switchChecks(true, [WORKSPACE])
  expect((await closeAtStart.closeWaitingRunsWhileChecksAreOff()).closed).toEqual([])
}, 60_000)

it('7. a refusal is answered before checks-off closure, while checks-on rework keeps its words', async () => {
  await switchChecks(false)
  const off = await refusedRun()
  expect(inspection.aRefusalStandsOn(t.api.getRecord(off)!)).toBe(true)
  const before = messagesToFiler(off)
  await seal(off)
  expect(inspection.aRefusalStandsOn(t.api.getRecord(off)!)).toBe(false)
  expect(howARunStands(t.api.getRecord(off)!.data).refused?.reworked?.because).toBe(REWORK)
  assertClosed(off)
  expect(messagesToFiler(off)).toEqual(before)
  expect(messages(off, 'aResealAsksForACheck')).toEqual([])
  await switchChecks(true, [WORKSPACE])
  const on = await refusedRun()
  await seal(on)
  expect(howARunStands(t.api.getRecord(on)!.data).refused?.reworked?.because).toBe(OLD_REWORK)
  expect(messages(on, 'aCheckWasQueued')).toHaveLength(1)
}, 60_000)

it('8. the start leaves a standing refusal untouched and does not count it', async () => {
  const run = await makeRun()
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
  writeAVerdictAsItsDoorWould(t, run, { refused: { by: { kind: 'agent', id: INSPECTOR }, at: '2090-01-01 12:00:00', missing: ['Synthetic missing work.'] } })
  const before = revisions(run)
  await switchChecks(false)
  const result = await closeAtStart.closeWaitingRunsWhileChecksAreOff()
  expect(result.closed.map(one => one.run)).not.toContain(run)
  expect(result.skipped.map(one => one.run)).not.toContain(run)
  expect(revisions(run)).toBe(before)
  expect(inspection.aRefusalStandsOn(t.api.getRecord(run)!)).toBe(true)
}, 60_000)

/** One turn of the event loop, the same wait the sweep makes before each of its batches. */
const aTurn = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve))
/** The smallest batches, so that three waiting runs take many turns of the loop to close. */
const ONE_AT_A_TIME = { workedOut: 1, closedOrSkipped: 1 }
/** Three runs waiting for a check, made as case 6 makes its plain run: checks on, sealed, then checks off. */
async function threeWaitingRuns(): Promise<string[]> {
  await switchChecks(true, [WORKSPACE])
  const runs: string[] = []
  for (let made = 0; made < 3; made += 1) {
    const run = await makeRun()
    await seal(run)
    runs.push(run)
  }
  await switchChecks(false)
  return runs
}
/** Whether a promise has settled yet, read without waiting for it. */
function whetherItSettled(promise: Promise<unknown>): () => boolean {
  let settled = false
  void promise.then(() => { settled = true }, () => { settled = true })
  return () => settled
}

it('9. the sweep gives the thread back between batches and still closes every waiting run', async () => {
  const runs = await threeWaitingRuns()
  const sweep = closeAtStart.closeWaitingRunsWhileChecksAreOff(ONE_AT_A_TIME)
  const settled = whetherItSettled(sweep)
  expect(runs.map((run) => t.api.getRecord(run)!.data['needsNoCheck'])).toEqual([undefined, undefined, undefined])
  await aTurn()
  expect(settled()).toBe(false)
  // NO REQUEST IS RACED AGAINST THE SWEEP: whether it is answered first would depend on how many turns it takes.
  const result = await sweep
  expect(result.closed.map((one) => one.run).sort()).toEqual([...runs].sort())
  expect(result.skipped).toEqual([])
  // THE FIRST THREE TESTS OF assertClosed: its last two cannot hold, because a seal with checks on asked for the check these runs wait for.
  for (const run of runs) {
    const record = t.api.getRecord(run)!
    expect(record.data['needsNoCheck']).toMatchObject({ rule: RULE, at: expect.any(String), because: expect.any(String) })
    expect(howARunStands(record.data)).toMatchObject({ standing: 'closed', waitingFor: null, unreleasedFinish: false, says: WORDS })
    expect(record.data['aCheckNothingStarts']).toBeUndefined()
  }
}, 60_000)

it('10. checks switched back on between two batches stop the sweep for that project', async () => {
  const runs = await threeWaitingRuns()
  const { setWhetherChecksRunInMergesOnly, whetherThisOfficesChecksAreSwitchedOff } = await import('../src/server/lib/checks-in-merges-only.ts')
  const closedSoFar = (): string[] => runs.filter((run) => t.api.getRecord(run)!.data['needsNoCheck'] !== undefined)
  const sweep = closeAtStart.closeWaitingRunsWhileChecksAreOff(ONE_AT_A_TIME)
  const settled = whetherItSettled(sweep)
  // ONE TURN AT A TIME, until the first closure: the sweep does one batch in each turn, and a batch closes one run at most.
  for (let turns = 0; closedSoFar().length === 0; turns += 1) {
    expect(settled(), 'The sweep ended before it closed any run.').toBe(false)
    expect(turns).toBeLessThan(1_000)
    await aTurn()
  }
  const closedBefore = closedSoFar()
  expect(closedBefore).toHaveLength(1)
  setWhetherChecksRunInMergesOnly(true)
  expect(whetherThisOfficesChecksAreSwitchedOff(WORKSPACE)).toBe(false)
  const result = await sweep
  expect(result.closed.map((one) => one.run)).toEqual(closedBefore)
  const notReached = runs.filter((run) => !closedBefore.includes(run))
  expect(notReached).toHaveLength(2)
  for (const run of notReached) expect(t.api.getRecord(run)!.data['needsNoCheck']).toBeUndefined()
}, 60_000)
