// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as verdictKinds from '../src/config/verdict-kinds.mjs'
import { THE_FOUR_KINDS, WHAT_A_KIND_IS, theListedFaultsSay } from '../src/config/verdict-kinds.mjs'
import { aReleaseWithoutATraceSays } from '../src/shared/releasing.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

/** Made-up keys, written beside the throwaway database before the server is built. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const WORKSPACE = 'default'
const TIP = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const INSPECTOR = 'inspector-l'
const PARENT = 'supervises-s'
const WORKER = 'works-w'
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }
const A_MADE_UP_CHECK = 'Test: a made-up check; no model judged work.'
/** One made-up change inside the worker's work area, as the check tool hands a change over. */
const A_MADE_UP_CHANGE = { path: 'src/server/lib/a-made-up-file.ts', changes: '+// A made-up line of a made-up change.' }

type Outcome = 'done' | 'part' | 'not'
interface APackage { task: string; title: string; points: string[]; says: string[] }
interface ARun { id: string; key: string; handle: string }
interface AJudgedPoint { pointId: string; judged: Outcome; holds: boolean; why: string }

let t: TestDb
let app: FastifyInstance
let delegation: typeof import('../src/server/lib/delegation.ts')
let inspection: typeof import('../src/server/lib/inspection.ts')
const idOf: Record<string, string> = {}
const keyOf: Record<string, string> = {}

const asThePerson = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-key': A_MADE_UP_PERSON_KEY,
})
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-key': keyOf[handle]!,
})
const asTheOffice = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
})
const asTheRun = (run: ARun): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': run.handle, 'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-session': run.id, 'x-mole-office-key': run.key,
})
/** The inspector as its check tool asks: the office's key, under the inspector's name, in the check's own session. */
const asTheInspectorIn = (session: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': INSPECTOR, 'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-session': session, 'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
})

async function register(handle: string, role: string, headers: Record<string, string>): Promise<void> {
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers,
    payload: { handle, name: handle, role, chapters: ['5:full'], ...(role === 'worker' ? { workArea: ['src/server/lib'] } : {}) },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  idOf[handle] = String(reply.json().agent.id)
  keyOf[handle] = String(reply.json().whatToGiveIt?.key ?? '')
  expect(keyOf[handle], `no key was given to ${handle}`).not.toBe('')
}

async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers = asThePerson()): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? { ...governsTheWholeProject(), replaces: [], ...data } : data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(reply.json().record.id)
}

const post = (task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>) =>
  app.inject({ method: 'POST', url: `/api/delegation/${task}/${door}`, headers, payload })

/** A running run of `handle`, filed by the office, with the run key the office made for it. */
async function aRunOf(handle: string): Promise<ARun> {
  const title = `A made-up run of ${handle}`
  const reply = await app.inject({
    method: 'POST', url: '/api/records', headers: asTheOffice(),
    payload: { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf[handle], doing: title } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const key = String(reply.json().runKey?.key ?? '')
  expect(key, 'the office made no run key').not.toBe('')
  return { id: String(reply.json().record.id), key, handle }
}

/** The run ends with nothing sealed, so its check reads it as a legacy run, as the listed-faults test's runs are read. */
function theRunEnds(run: ARun): void {
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run.id)
  t.api.patchRecord(run.id, { dataPatch: { state: 'finished', cutFrom: 'main', tip: TIP } }, { type: 'agent', id: run.handle })
}

/** A check of `run` is assembled in `session`, as the check tool assembles one before its verdict. */
async function assembled(run: string, session: string, changes: { path: string; changes: string }[] = []): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asTheInspectorIn(session), payload: { changes } })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** An inside package made by the parent agent, with one backlog item per point. */
async function aPackage(title: string, says: string[]): Promise<APackage> {
  const decision = await file('decision', `${title}: the decision above it`)
  const points: string[] = []
  for (const one of says) {
    points.push(await file('backlog_item', one, { line: 'a-made-up-line', number: one, placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo' }))
  }
  const parent = await file('task', `${title}: the parent`, {}, asAgent(PARENT))
  const moduleId = await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))
  const parentPackaged = await post(parent, 'package', { ...WORDS, moduleIds: [moduleId], parent: { kind: 'decision', id: decision }, pointIds: points }, asThePerson())
  expect(parentPackaged.statusCode, parentPackaged.body).toBe(201)
  const task = await file('task', title)
  const packaged = await post(task, 'package', { ...WORDS, moduleIds: [moduleId], parent: { kind: 'task', id: parent }, pointIds: points }, asAgent(PARENT))
  expect(packaged.statusCode, packaged.body).toBe(201)
  return { task, title, points, says }
}

/** Taken, aligned with the parent agent, and handed back by `by`, one outcome and words per point. */
async function handedBack(pkg: APackage, by: Record<string, string>, said: { outcome: Outcome; words: string }[]): Promise<void> {
  for (const [door, payload, headers] of [
    ['take-inside', {}, by],
    ['align', { restated: 'I will do the made-up work.', plan: 'Do it.' }, by],
    ['align-answer', { answer: 'aligned', words: 'Yes.' }, asAgent(PARENT)],
    ['hand-back', { points: pkg.points.map((pointId, at) => ({ pointId, outcome: said[at]!.outcome, words: said[at]!.words })) }, by],
  ] as const) {
    const reply = await post(pkg.task, door, payload, headers)
    expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
  }
}

function packageOf(task: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(task) as { data: string }
  return (JSON.parse(row.data) as Record<string, any>)['package'] as Record<string, any>
}

function runData(run: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  return JSON.parse(row.data) as Record<string, any>
}

function theMessageBody(id: string): string {
  return String(runData(id)['body'])
}

/** A package handed back by a run that has ended, and a check of that run assembled in a session of the inspector. */
async function aRunThatHandedBack(title: string, said: { says: string; outcome: Outcome; words: string }[], changes: { path: string; changes: string }[] = []) {
  const pkg = await aPackage(title, said.map((one) => one.says))
  const run = await aRunOf(WORKER)
  await handedBack(pkg, asTheRun(run), said)
  theRunEnds(run)
  const session = (await aRunOf(INSPECTOR)).id
  await assembled(run.id, session, changes)
  return { pkg, run: run.id, session }
}

async function aVerdict(run: string, session: string, body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asTheInspectorIn(session), payload: { check: A_MADE_UP_CHECK, chaptersRead: ['5:full'], ...body } })
}

function prompt(reads: ReturnType<typeof inspection.whatTheInspectorReads>): string {
  return inspection.assembleTheInspectorsPrompt({ reads, changes: inspection.changesInTheWorkArea([], []), workspaceId: WORKSPACE }).text
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  delegation = await import('../src/server/lib/delegation.ts')
  inspection = await import('../src/server/lib/inspection.ts')
  app = (await apiApp()).app
  await app.ready()
  await register(INSPECTOR, 'inspector', asThePerson())
  await register(PARENT, 'supervisor', asThePerson())
  await register(WORKER, 'worker', asAgent(PARENT))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})


const settingPath = `/api/workspaces/${WORKSPACE}`
async function setting(enabled: boolean) {
  const reply = await app.inject({ method: 'PATCH', url: settingPath, headers: asThePerson(), payload: { packageInspection: enabled } })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json()
}

it('leaves inspection off when chosen, asks no point opinion and releases without one', async () => {
  expect((await setting(false)).packageInspection).toBe(false)
  const said = [{ says: 'A made-up point while inspection is off', outcome: 'done' as const, words: 'Built.' }]
  const { pkg, run, session } = await aRunThatHandedBack('A made-up hand-back with inspection off', said)
  expect(inspection.whatTheInspectorReads(run, WORKSPACE).packages.packages).toEqual([])
  const answer = await post(pkg.task, 'accept', { points: [{ pointId: pkg.points[0]!, answer: 'accepted' }] }, asAgent(PARENT))
  expect(answer.statusCode, answer.body).toBe(201)
  const verdict = await aVerdict(run, session, { verdict: 'released' })
  expect(verdict.statusCode, verdict.body).toBe(201)
  expect(packageOf(pkg.task)['checks']).toBeUndefined()
  expect(packageOf(pkg.task)['acceptances']).toHaveLength(1)
  expect(runData(run)['released']).toBeDefined()
}, 60_000)

it('stores a more-than-asked opinion on its point without waiting to accept', async () => {
  expect((await setting(true)).packageInspection).toBe(true)
  const said = [{ says: 'A made-up point with extra work', outcome: 'done' as const, words: 'Built.' }]
  const { pkg, run, session } = await aRunThatHandedBack('A made-up hand-back with inspection on', said)
  expect(inspection.whatTheInspectorReads(run, WORKSPACE).packages.packages.map((one) => one.task)).toContain(pkg.task)
  const answer = await post(pkg.task, 'accept', { points: [{ pointId: pkg.points[0]!, answer: 'accepted' }] }, asAgent(PARENT))
  expect(answer.statusCode, answer.body).toBe(201)
  expect(packageOf(pkg.task)['checks']).toBeUndefined()
  const judged = { pointId: pkg.points[0]!, judged: 'more_than_asked', holds: true, why: 'A made-up guard was not asked for.', rulesKept: false }
  const verdict = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points: [judged] }] })
  expect(verdict.statusCode, verdict.body).toBe(201)
  expect(packageOf(pkg.task)['checks'].at(-1).points).toEqual([{ ...judged, outcome: 'done' }])
  expect(packageOf(pkg.task)['acceptances'].at(-1).by).toEqual(packageOf(pkg.task)['by'])
  expect(runData(run)['released']).toBeDefined()
}, 60_000)

it('stores an off-target opinion that holds for a point handed back as done', async () => {
  expect((await setting(true)).packageInspection).toBe(true)
  const said = [{ says: 'A made-up point that is off target', outcome: 'done' as const, words: 'Built.' }]
  const { pkg, run, session } = await aRunThatHandedBack('A made-up hand-back with an off-target point', said)
  const answer = await post(pkg.task, 'accept', { points: [{ pointId: pkg.points[0]!, answer: 'accepted' }] }, asAgent(PARENT))
  expect(answer.statusCode, answer.body).toBe(201)
  expect(packageOf(pkg.task)['checks']).toBeUndefined()
  const judged = { pointId: pkg.points[0]!, judged: 'off_target', holds: true, why: 'The made-up work is done but off target.', rulesKept: true }
  const verdict = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points: [judged] }] })
  expect(verdict.statusCode, verdict.body).toBe(201)
  expect(packageOf(pkg.task)['checks'].at(-1).points).toEqual([{ ...judged, outcome: 'done' }])
}, 60_000)

it('still reads a point check stored before the judgment and rules fields changed', async () => {
  const pkg = await aPackage('A made-up package with an older check', ['A made-up earlier point'])
  const held = packageOf(pkg.task)
  const old = { by: { actorType: 'agent', actorId: INSPECTOR }, at: '2026-01-01 12:00:00', answer: 'refused', words: 'Made up.', points: [{ pointId: pkg.points[0]!, judged: 'part', holds: false, why: 'Made up.', outcome: 'not' }] }
  t.api.patchRecord(pkg.task, { dataPatch: { package: { ...held, checks: [old] } } }, { type: 'human', id: THE_PERSON })
  const read = delegation.packageOf({ package: packageOf(pkg.task) })
  expect(read?.checks?.at(-1)).toEqual(old)
}, 60_000)
