// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Decision xqEqVk7M-9jE: at full review a supervisor's worker gets no separate ask at its seal.
 * New behavior (red before the build): the stored note, no inspector delivery or queue row, the
 * sandbox account, the API sentence, the page, and replacing the note through ask-again or a scoped ask.
 * Eligibility now answers before the worker rule, so a worker run that could not be checked anyway
 * is refused at its seal with the fact it is missing, and the note it later takes holds no decision.
 * Guards of existing behavior: supervisor/person/secretary runs, unknown starters, light/none,
 * rework after an explicit refusal, the other asking doors, a note written with a decision, a run
 * holding an old note still taking writes, and settlement through a
 * decision. The settlement
 * case also requires the new note, so that complete case is red before the build.
 * The sandbox worker round of the first case writes its supervisor a FEATURE READY: line before its seal, because the
 * office asks for a sandbox round's check only when a whole feature is done.
 * The owner's decision of 12 November 2026 leaves the supervisor out of a held worker's seal and check notices;
 * a line's own held round still tells its starter both.
 * Mutation: the new function answers null always -> the held worker case red.
 * Every record and repository here is synthetic. Only the throwaway app's queue is read.
 * As decided in November 2026, the page draws the worker round's standing word and no longer the note's sentence under
 * it; the sentence stays in the API.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, theOfficesOwnId, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readWorkerCheckNotAsked, workerRoundStanding } from '../src/shared/releasing.ts'
import { FEATURE_READY } from '../src/server/lib/how-a-round-ended-rules.ts'
import type { PanelRecord } from '../src/shared/types.ts'

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle
const SUPERVISOR = 'synthetic-round-supervisor'
const WORKER = 'synthetic-round-worker'
const INSPECTOR = 'synthetic-round-inspector'
const PERSON_KEY = randomBytes(32).toString('hex')
const NOTE = "No check was asked for this worker run. Its work is checked in its supervisor's round. After that round merges, its supervisor, a secretary or the owner closes this run."
const WAITING = "Waiting for the supervisor's round to be checked and merged. Then someone must close this run."
const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const as = (id: string): Record<string, string> => ({ ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
let t: TestDb
let app: FastifyInstance
let secretaryId: string
let supervisorId: string
let inspectorId: string
let inspection: typeof import('../src/server/lib/inspection.ts')
let setWordLanguage: typeof import('../src/shared/i18n.ts').setWordLanguage
let directory: string

function git(folder: string, ...args: string[]): string {
  return execFileSync('git', ['-C', folder, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).trim()
}
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers = as(SECRETARY)) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
}
async function register(handle: string, role: string, headers = as(SECRETARY)): Promise<string> {
  const reply = await call('POST', '/api/agents/started', { handle, name: `Synthetic ${role}`, role, ...(role === 'secretary' ? {} : { workArea: ['work'] }) }, headers)
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json().agent.id as string
}
/** A run that names its sandbox is filed by its agent's starter, as its launcher files it: the secretary for the supervisor, the supervisor for a worker. */
async function makeRun(handle = WORKER, extra: Record<string, unknown> = {}, folder = directory): Promise<string> {
  const reply = await call('POST', '/api/records', { kind: 'session', title: 'Synthetic round check criterion', data: {
    state: 'running', servingAgent: handle, workingDirectory: folder, cutFrom: 'main', ...extra,
  } }, extra.sandbox === undefined ? as(handle) : as(handle === SUPERVISOR ? SECRETARY : SUPERVISOR))
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json().record.id as string
}
async function seal(run: string, handle = WORKER) {
  const reply = await call('PATCH', `/api/records/${run}`, { dataPatch: { state: 'finished' } }, as(handle))
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { theCheck: Record<string, unknown>; howTheRoundEnded?: { theCheck: string; says: string } }
}
/** The worker's last word to its supervisor before the seal: its whole feature is done, so its sandbox seal asks for a check. */
async function theWorkerSaysItsFeatureIsReady(run: string): Promise<void> {
  const body = `${FEATURE_READY} the synthetic worker change is done.\nI seal next.`
  const said = await call('POST', '/api/records', { kind: 'message', title: 'Synthetic word to the supervisor', data: { body, to: [{ kind: 'agent', id: supervisorId }], aboutRun: run } }, { ...as(WORKER), 'x-mole-office-session': run })
  // NOTHING HOLDS THE SUPERVISOR IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
  // message is stored all the same, and the seal reads it.
  expect(said.statusCode, said.body).toBe(409)
}
async function queue(onlyChecks = false) {
  const reply = await call('GET', `/api/worker/queue${onlyChecks ? '?only=checks' : ''}`)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().queue as { messageId: string; inspection?: { run: string } }[]
}
function asksFor(run: string) {
  return t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = 'aCheckWasQueued'").all(run)
}
function expectNote(check: Record<string, unknown>) {
  expect(check.notAsked).toEqual({ why: 'worker-of-a-round', starter: { kind: 'agent', id: supervisorId } })
  expect(check.says).toBe(NOTE)
  for (const key of ['askedOf', 'message', 'eligibility', 'reviewLevel']) expect(check).not.toHaveProperty(key)
}
async function realAsk(run: string, headers = as(supervisorId)) {
  const reply = await call('POST', `/api/checks/${run}/ask-again`, {}, headers)
  expect(reply.statusCode, reply.body).toBe(200)
  const check = reply.json().theCheck as Record<string, unknown>
  expect(check.askedOf).toBe(INSPECTOR)
  expect(check.message).toBeTruthy()
  expect(check).not.toHaveProperty('notAsked')
  expect((await queue(true)).some(row => row.messageId === check.message && row.inspection?.run === run)).toBe(true)
  return check
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'round-check-criterion-'))
  mkdirSync(join(directory, 'work'))
  git(directory, 'init', '-b', 'main')
  git(directory, 'config', 'user.name', 'Synthetic criterion')
  git(directory, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(directory, 'work', 'part.txt'), 'baseline\n')
  git(directory, 'add', '.')
  git(directory, 'commit', '-m', 'Synthetic baseline')
  git(directory, 'switch', '-c', 'worker')
  writeFileSync(join(directory, 'work', 'part.txt'), 'worker change\n')
  git(directory, 'commit', '-am', 'Synthetic worker change')
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  inspection = await import('../src/server/lib/inspection.ts')
  ;({ setWordLanguage } = await import('../src/shared/i18n.ts'))
  secretaryId = await register(SECRETARY, 'secretary', person)
  supervisorId = await register(SUPERVISOR, 'supervisor')
  inspectorId = await register(INSPECTOR, 'inspector', person)
  await register(WORKER, 'worker', as(SUPERVISOR))
  await register('synthetic-person-worker', 'worker', person)
  await register('synthetic-secretary-worker', 'worker')
})
afterAll(async () => { await app?.close(); t?.close(); rmSync(`${directory}-round-tree`, { recursive: true, force: true }); rmSync(directory, { recursive: true, force: true }); setWordLanguage('en') })

it('files no check ask, inspector delivery or queue row at a full worker seal, and keeps the reason', async () => {
  const run = await makeRun(WORKER, { sandbox: { template: 'synthetic', container: 'synthetic', folder: directory } })
  await theWorkerSaysItsFeatureIsReady(run)
  const reply = await seal(run)
  expect(asksFor(run)).toEqual([])
  const deliveries = t.client.sqlite.prepare("SELECT d.id FROM message_delivery d JOIN records r ON r.id = d.message_id WHERE json_extract(r.data, '$.aboutRun') = ? AND d.recipient_id = ?").all(run, inspectorId)
  expect(deliveries).toEqual([])
  for (const checksOnly of [false, true]) expect((await queue(checksOnly)).filter(row => row.inspection?.run === run)).toEqual([])
  expectNote(reply.theCheck)
  expect(t.api.getRecord(run)!.data.theCheck).toEqual(reply.theCheck)
  expect(reply.howTheRoundEnded).toMatchObject({ theCheck: 'not asked', says: expect.stringContaining(NOTE) })
  expect(reply.howTheRoundEnded?.says).not.toContain('eligibility asks none')
  const read = await call('GET', `/api/checks/${run}`)
  expect(read.statusCode, read.body).toBe(200)
  expect(read.json().stands).toMatchObject({ standing: 'inspecting', unreleasedFinish: true, says: NOTE })
  expect(JSON.stringify(read.json().stands)).not.toContain('the office is having it checked')
  expect(read.json().stands.waitingFor).toBe(WAITING)
  const lines = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").all(run) as { data: string }[]
  expect(lines.some(line => JSON.parse(line.data).body?.includes(`Run ${run} sealed`))).toBe(false)
})

it('holds a worker check without telling its supervisor of the hold or seal', async () => {
  const run = await makeRun(WORKER, { sandbox: { template: 'synthetic', container: 'synthetic', folder: directory } })
  const reply = await seal(run)
  expect(reply.howTheRoundEnded).toMatchObject({ theCheck: 'held' })
  const rows = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").all(run) as { data: string }[]
  const lines = rows.map(row => JSON.parse(row.data) as { notice?: string; sentBy?: { id: string }; to?: { kind: string; id: string }[] })
  expect(lines.some(line => line.notice === 'theCheckIsHeld' || line.notice === 'aRunWasSealed')).toBe(false)
  // A held check asks no inspector, so it writes no noInspectorCheckItYourself line either; allow that notice if written.
  const officeToSupervisor = lines.filter(line => line.sentBy?.id === theOfficesOwnId(t) && line.to?.some(to => to.kind === 'agent' && to.id === supervisorId))
  expect(officeToSupervisor.every(line => line.notice === 'noInspectorCheckItYourself')).toBe(true)
})

it('tells the starter of a line’s own held round about both the hold and seal', async () => {
  const run = await makeRun(SUPERVISOR, { sandbox: { template: 'synthetic', container: 'synthetic', folder: directory } })
  const reply = await seal(run, SUPERVISOR)
  expect(reply.howTheRoundEnded).toMatchObject({ theCheck: 'held' })
  const rows = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").all(run) as { data: string }[]
  const lines = rows.map(row => JSON.parse(row.data) as { notice?: string; sentBy?: { id: string }; to?: { kind: string; id: string }[] })
  const toStarter = lines.filter(line => line.sentBy?.id === theOfficesOwnId(t) && line.to?.some(to => to.kind === 'agent' && to.id === secretaryId))
  expect(toStarter.filter(line => line.notice === 'theCheckIsHeld')).toHaveLength(1)
  expect(toStarter.filter(line => line.notice === 'aRunWasSealed')).toHaveLength(1)
})

it('refuses an ineligible worker run at its seal, naming the missing fact', async () => {
  const run = await makeRun(WORKER, { workingDirectory: undefined })
  // HELD AS THE FIELD RUNS WERE: with no submission the seal refuses a run that names no working
  // directory, so the run is marked as one finished before the seal existed, and it is the missing
  // submitted tip that makes it ineligible.
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  const reply = await seal(run)
  expect(reply.theCheck).toMatchObject({
    eligibility: { eligible: false, missing: [{ fact: 'submittedTip', state: 'unknown' }] },
    says: expect.stringContaining('resolvable submitted tip'),
  })
  expect(reply.theCheck).not.toHaveProperty('notAsked')
  expect(t.api.getRecord(run)!.data.theCheck).toEqual(reply.theCheck)
  expect(asksFor(run)).toEqual([])
  const deliveries = t.client.sqlite.prepare("SELECT d.id FROM message_delivery d JOIN records r ON r.id = d.message_id WHERE json_extract(r.data, '$.aboutRun') = ? AND d.recipient_id = ?").all(run, inspectorId)
  expect(deliveries).toEqual([])
})

it('a worker run refused at its first seal takes the round note once it is eligible', async () => {
  const run = await makeRun(WORKER, { workingDirectory: undefined })
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  const refused = await seal(run)
  expect(refused.theCheck).toMatchObject({ eligibility: { eligible: false } })
  expect(refused.theCheck).not.toHaveProperty('notAsked')
  // The worker makes the run eligible: the working directory now holds a repository with a HEAD.
  const reopening = await call('PATCH', `/api/records/${run}`, { dataPatch: { state: 'running' } }, as(WORKER))
  expect(reopening.statusCode, reopening.body).toBe(200)
  const again = await call('PATCH', `/api/records/${run}`, { dataPatch: { workingDirectory: directory, state: 'finished' } }, as(WORKER))
  expect(again.statusCode, again.body).toBe(200)
  expectNote((again.json() as { theCheck: Record<string, unknown> }).theCheck)
})

it('stores a worker note of exactly why and starter, with no decision', async () => {
  const run = await makeRun()
  const reply = await seal(run)
  expect(Object.keys(reply.theCheck.notAsked as object).sort()).toEqual(['starter', 'why'])
  expectNote(reply.theCheck)
})

it.each([SUPERVISOR, 'synthetic-person-worker', 'synthetic-secretary-worker'])('keeps the full inspector ask for %s', async handle => {
  const run = await makeRun(handle)
  const reply = await seal(run, handle)
  expect(reply.theCheck.askedOf).toBe(INSPECTOR)
  expect(reply.theCheck).not.toHaveProperty('notAsked')
  expect(asksFor(run)).toEqual([{ id: reply.theCheck.message }])
})

it('keeps asking when the starter cannot be resolved', async () => {
  const handle = 'synthetic-unknown-starter'
  const id = await register(handle, 'worker', as(SUPERVISOR))
  t.client.sqlite.prepare("UPDATE agents SET started_by_id = 'synthetic-missing' WHERE id = ?").run(id)
  const run = await makeRun(handle)
  expect((await seal(run, handle)).theCheck.askedOf).toBe(INSPECTOR)
})

it('the starter replaces the worker note with a real ask through ask-again', async () => {
  const run = await makeRun()
  expectNote((await seal(run)).theCheck)
  await realAsk(run)
})

it('the starter sending its handle and its own key replaces the worker note with a real ask', async () => {
  const run = await makeRun()
  expectNote((await seal(run)).theCheck)
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  await realAsk(run, { ...as(SUPERVISOR), 'x-mole-office-key': makeAnAgentKey(supervisorId, null) })
})

it('another agent sending its own handle and its own key is still refused', async () => {
  const run = await makeRun()
  expectNote((await seal(run)).theCheck)
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const reply = await call('POST', `/api/checks/${run}/ask-again`, {}, { ...as(INSPECTOR), 'x-mole-office-key': makeAnAgentKey(inspectorId, null) })
  expect(reply.statusCode, reply.body).toBe(403)
  expectNote(t.api.getRecord(run)!.data.theCheck as Record<string, unknown>)
})

it('a refused explicit worker check is asked again at its next seal', async () => {
  const run = await makeRun()
  await seal(run)
  const first = await realAsk(run)
  writeAVerdictAsItsDoorWould(t, run, { refused: { by: { kind: 'agent', id: inspectorId }, at: '2026-10-16 10:00:00', missing: ['Synthetic missing work'], chapter: 5 } })
  const next = await seal(run)
  expect(next.theCheck.askedOf).toBe(INSPECTOR)
  expect(next.theCheck.message).not.toBe(first.message)
  expect(next.theCheck).not.toHaveProperty('notAsked')
  expect(t.api.getRecord(run)!.data.refused).toHaveProperty('reworked')
})

it.each(['light', 'none'])('keeps telling the secretary at review level %s', async level => {
  expect((await call('PATCH', '/api/workspaces/default', { reviewLevel: level }, person)).statusCode).toBe(200)
  try {
    const run = await makeRun()
    const check = (await seal(run)).theCheck
    expect(check).toMatchObject({ reviewLevel: level, askedOf: SECRETARY, message: expect.any(String) })
    expect(check).not.toHaveProperty('notAsked')
    expect(asksFor(run)).toEqual([])
  } finally { expect((await call('PATCH', '/api/workspaces/default', { reviewLevel: 'full' }, person)).statusCode).toBe(200) }
})

it('the scoped ask and held-check release still file real worker asks', async () => {
  const run = await makeRun()
  await seal(run)
  const scoped = inspection.theOfficeStartsTheCheck({ runId: run, workspaceId: 'default', actor: inspection.THE_OFFICE, scope: { only: ['work/part.txt'], needsJudgment: [] } })
  expect(scoped).toMatchObject({ askedOf: INSPECTOR, only: ['work/part.txt'] })
  const held = await makeRun(WORKER, { sandbox: { template: 'synthetic', container: 'synthetic', folder: directory } })
  const said = await call('POST', '/api/records', { kind: 'message', title: 'Synthetic pause', data: { body: 'I will not seal this round.', to: [{ kind: 'agent', id: supervisorId }], aboutRun: held } }, { ...as(WORKER), 'x-mole-office-session': held })
  // NOTHING HOLDS THE SUPERVISOR IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
  // message is stored all the same, and the seal reads it.
  expect(said.statusCode, said.body).toBe(409)
  await seal(held)
  const release = await call('POST', `/api/records/${held}/release-the-held-check`, { because: 'Synthetic round is ready.' }, { ...person, 'x-mole-office-key': PERSON_KEY })
  expect(release.statusCode, release.body).toBe(200)
  expect(release.json().theCheck).toMatchObject({ askedOf: INSPECTOR, message: expect.any(String) })
})

it('gsBc settles the noted worker through the checked merged round holding its commits, then retirement succeeds', async () => {
  const handle = 'synthetic-settled-round-worker'
  await register(handle, 'worker', as(SUPERVISOR))
  const run = await makeRun(handle)
  expectNote((await seal(run, handle)).theCheck)
  const blocked = await call('POST', `/api/participants/agent/${handle}/retire`, { because: 'Synthetic task ended.' }, person)
  expect(blocked.statusCode, blocked.body).toBe(409)
  expect(blocked.body).toContain(run)
  const waveDirectory = `${directory}-round-tree`
  git(directory, 'worktree', 'add', '-b', 'round', waveDirectory, 'worker')
  const later = await makeRun(SUPERVISOR, {}, waveDirectory)
  await seal(later, SUPERVISOR)
  writeAVerdictAsItsDoorWould(t, later, {
    released: { by: { kind: 'agent', id: inspectorId }, at: '2026-10-16 11:00:00', how: 'an inspector' },
    confirmed: { by: { kind: 'agent', id: supervisorId }, at: '2026-10-16 11:01:00', because: 'Synthetic report confirmed.' },
  })
  const { asTheMergeQueue } = await import('../src/server/lib/merge-entry-door.ts')
  const entry = asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: 'Synthetic merged round', workspaceId: 'default', origin: 'fixture', actor: inspection.THE_OFFICE, data: {
    run: later, seal: { id: t.api.getRecord(later)!.data.sealedTip, hash: 'synthetic' },
    changeset: { adapter: 'git', root: directory, repository: 'synthetic', branch: 'round', commit: git(waveDirectory, 'rev-parse', 'HEAD'), base: git(directory, 'rev-parse', 'main') },
    state: 'merged', submittedBy: { kind: 'agent', id: supervisorId },
  } }))
  t.api.patchRecord(later, { dataPatch: { integrated: { entry: entry.id, mainBefore: 'synthetic-before', mainAfter: 'synthetic-after', rebasedTip: null, sealId: 'synthetic', at: '2026-10-16 11:02:00' } } }, inspection.THE_OFFICE)
  const response = await call('POST', `/api/checks/${run}/superseded`, { by: later, because: 'Synthetic round holds the worker commits.' }, as(SUPERVISOR))
  expect(response.statusCode, response.body).toBe(201)
  expect(response.json().stands).toMatchObject({ standing: 'superseded', unreleasedFinish: false })
  expect(t.api.getRecord(run)!.data.theCheck).toMatchObject({ notAsked: { why: 'worker-of-a-round' }, superseded: { by: later, contains: { how: 'ancestor' } } })
  expect((await call('POST', `/api/participants/agent/${handle}/retire`, { because: 'Synthetic round merged.' }, person)).statusCode).toBe(200)
})

it('a note already written with a decision still reads as the worker note', async () => {
  const oldNote = { theCheck: {
    askedAt: '2026-10-16 20:00:00',
    notAsked: { why: 'worker-of-a-round', starter: { kind: 'agent', id: supervisorId }, decision: 'xqEqVk7M-9jE' },
    says: NOTE,
  } }
  expect(readWorkerCheckNotAsked(oldNote)).toMatchObject({ why: 'worker-of-a-round', starter: { kind: 'agent', id: supervisorId } })
  expect(readWorkerCheckNotAsked(oldNote)).not.toHaveProperty('decision')
  expect(workerRoundStanding(oldNote, 'inspecting')).toMatchObject({ word: 'Awaiting the round', sentence: NOTE })
  const freshNote = { theCheck: {
    askedAt: '2026-10-16 20:00:00',
    notAsked: { why: 'worker-of-a-round', starter: { kind: 'agent', id: supervisorId } },
    says: NOTE,
  } }
  expect(readWorkerCheckNotAsked(freshNote)).toMatchObject({ why: 'worker-of-a-round', starter: { kind: 'agent', id: supervisorId } })
})

it('a run holding an old note still takes writes', async () => {
  const run = await makeRun()
  await seal(run)
  // MADE UP: an id of letters only, so it names no decision this office holds.
  const madeUpDecision = 'madeUpNoteDecision'
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.theCheck.notAsked.decision', ?) WHERE id = ?").run(madeUpDecision, run)
  const heldNote = () => (t.api.getRecord(run)!.data.theCheck as { notAsked: Record<string, unknown> }).notAsked
  expect(heldNote()).toMatchObject({
    why: 'worker-of-a-round', starter: { kind: 'agent', id: supervisorId }, decision: madeUpDecision,
  })
  // A PATCH THAT CHANGES ONE FIELD REACHES THE NOTE: the record door merges the patch into the stored
  // data and checks the whole record it will store, so the note's old key is read on this write too.
  const patched = await call('PATCH', `/api/records/${run}`, { dataPatch: { doing: 'Synthetic unrelated edit.' } }, as(WORKER))
  const closed = await call('POST', `/api/checks/${run}/closed-unchecked`, { because: 'Synthetic: the round settled this run, so no separate check is owed.' }, { ...person, 'x-mole-office-key': PERSON_KEY })
  expect(patched.statusCode, patched.body).toBe(200)
  expect(closed.statusCode, closed.body).toBe(201)
  // NOTHING REWROTE THE NOTE: the decision the old note held is still there after both writes.
  expect(heldNote()).toMatchObject({ decision: madeUpDecision })
})

it('the check panel draws the worker round standing word in both languages without a pending inspector or refusal', async () => {
  const run = await makeRun()
  await seal(run)
  const record = t.api.getRecord(run)! as PanelRecord
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage, sessionStorage: storage, location: { hash: '' }, addEventListener: () => {}, removeEventListener: () => {} }
  const { TheCheckOnARun } = await import('../src/web/components/TheCheckOnARun.tsx')
  const { setMode } = await import('../src/web/lib/mode.ts')
  setMode('normal')
  try {
    setWordLanguage('en')
    const html = renderToStaticMarkup(h(TheCheckOnARun, { record }))
    const text = html.replace(/&#x27;/g, "'").replace(/<[^>]*>/g, '')
    expect(text).not.toContain(NOTE)
    expect(text).toContain('Awaiting the round')
    expect(text).not.toMatch(/Nobody holds|Waiting for.*inspector|No verdict|Check not started/)
    setWordLanguage('zh')
    const chinese = renderToStaticMarkup(h(TheCheckOnARun, { record }))
    expect(chinese).toContain('等待轮次完成')
    expect(chinese).not.toContain(NOTE)
  } finally { setWordLanguage('en'); setMode('normal') }
})
