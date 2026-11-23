// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A line setting selects a whole run for a reading-only inspection and its point answers.
 * Every record, participant, line and reason is made up in a fresh test office.
 * Mutations a reviewer could run: ignore a package's lines, permit an outside line, accept a
 * partial hand-back, ignore rulesKept, or return a holding point; each should break a case.
 */
import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_FOUR_KINDS } from '../src/config/verdict-kinds.mjs'
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
const checkKey: Record<string, string> = {}

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
/** The inspector asks in its own check session, with that session’s key. */
const asTheInspectorIn = (session: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': INSPECTOR, 'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-session': session, 'x-mole-office-key': checkKey[session]! ,
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
  const id = String(reply.json().record.id)
  if (handle === INSPECTOR) checkKey[id] = key
  return { id, key, handle }
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

const LINE_SETTING = 'MOLE_OFFICE_LINES_THE_INSPECTOR_ANSWERS'
let qualifies: typeof import('../src/server/lib/inspector-answers-lines.ts').inspectorAnswersRun

beforeAll(async () => {
  qualifies = (await import('../src/server/lib/inspector-answers-lines.ts')).inspectorAnswersRun
  await register('made-up-secretary', 'secretary', asThePerson())
  await setting(true)
}, 60_000)

async function lines(value: string | null, headers = asThePerson()): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/office/settings', headers,
    payload: { changes: [{ name: LINE_SETTING, value }], because: 'A made-up choice for this office.' } })
  expect(reply.statusCode, reply.body).toBe(200)
}

function putLines(pkg: APackage, names: string[]): void {
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.package.lines', json(?)) WHERE id = ?").run(JSON.stringify(names), pkg.task)
}

async function madeRun(title: string, outcomes: Outcome[] = ['done']) {
  const said = outcomes.map((outcome, at) => ({ says: `Made-up point ${title} ${String(at)}`, outcome, words: 'Made-up work.' }))
  const made = await aRunThatHandedBack(title, said)
  putLines(made.pkg, ['line-a'])
  return made
}

function judgments(pkg: APackage, values: { judged: string; holds: boolean; rulesKept: boolean; why: string }[]) {
  return values.map((one, at) => ({ pointId: pkg.points[at]!, ...one }))
}

function makerNotices(task: string): string[] {
  const rows = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL").all() as { data: string }[]
  return rows.map((row) => JSON.parse(row.data) as Record<string, any>)
    .filter((data) => JSON.stringify(data).includes(task) && Array.isArray(data['to']) && data['to'].some((to: { id?: string }) => to.id === idOf[PARENT]))
    .map((data) => String(data['body'] ?? ''))
}

it('the owner and a secretary set, extend and clear the line set with changes read at once', async () => {
  const { run } = await madeRun('setting')
  await lines(null)
  expect(qualifies(run, WORKSPACE)).toBe(false)
  await lines('line-a', asAgent('made-up-secretary'))
  expect(qualifies(run, WORKSPACE)).toBe(true)
  await lines('line-b', asAgent('made-up-secretary'))
  expect(qualifies(run, WORKSPACE)).toBe(false)
  await lines('line-b,line-a')
  expect(qualifies(run, WORKSPACE)).toBe(true)
  await lines(null, asAgent('made-up-secretary'))
  expect(qualifies(run, WORKSPACE)).toBe(false)
}, 60_000)

it('requires at least one hand-back and every package line to be in the set', async () => {
  await lines('line-a,line-b')
  const first = await aPackage('inside line', ['Inside line point'])
  const second = await aPackage('outside line', ['Outside line point'])
  const run = await aRunOf(WORKER)
  expect(qualifies(run.id, WORKSPACE)).toBe(false)
  await handedBack(first, asTheRun(run), [{ outcome: 'done', words: 'Made up.' }])
  putLines(first, [])
  expect(qualifies(run.id, WORKSPACE)).toBe(false)
  putLines(first, ['line-a', 'line-b'])
  expect(qualifies(run.id, WORKSPACE)).toBe(true)
  putLines(first, ['line-a', 'line-outside'])
  expect(qualifies(run.id, WORKSPACE)).toBe(false)
  putLines(first, ['line-a'])
  await handedBack(second, asTheRun(run), [{ outcome: 'done', words: 'Made up.' }])
  putLines(second, ['line-outside'])
  expect(qualifies(run.id, WORKSPACE)).toBe(false)
  putLines(second, ['line-b'])
  expect(qualifies(run.id, WORKSPACE)).toBe(true)
  await lines(null)
  expect(qualifies(run.id, WORKSPACE)).toBe(false)
}, 60_000)

it('asks a qualified inspector to read each point and the four fault kinds without executing work', async () => {
  await lines(null)
  const { run } = await madeRun('reading')
  const ordinary = prompt(inspection.whatTheInspectorReads(run, WORKSPACE))
  await lines('some-other-line')
  expect(prompt(inspection.whatTheInspectorReads(run, WORKSPACE))).toBe(ordinary)
  await lines('line-a')
  const reading = prompt(inspection.whatTheInspectorReads(run, WORKSPACE))
  expect(reading).not.toContain('READ AND TEST THE CHANGE YOURSELF')
  expect(reading).not.toContain('You may make temporary edits')
  expect(reading).not.toContain('Run only that test file')
  expect(reading).not.toContain('run that command yourself')
  expect(reading).not.toContain('which mutations you ran')
  expect(reading).toMatch(/read the diff/i)
  for (const field of ['judged', 'holds', 'why', 'rulesKept']) expect(reading).toContain(field)
  for (const kind of THE_FOUR_KINDS) expect(reading).toContain(kind)
}, 60_000)

it('accepts every done point with the inspector’s own words and identity', async () => {
  await lines('line-a')
  const { pkg, run, session } = await madeRun('accepted', ['done', 'done'])
  const points = judgments(pkg, [
    { judged: 'done', holds: true, rulesKept: true, why: 'First point holds.' },
    { judged: 'done', holds: true, rulesKept: true, why: 'Second point holds.' },
  ])
  const verdict = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points }] })
  expect(verdict.statusCode, verdict.body).toBe(201)
  const answers = packageOf(pkg.task)['acceptances']
  expect(answers).toHaveLength(1)
  expect(answers[0].by).toMatchObject({ actorType: 'agent', actorId: INSPECTOR })
  expect(answers[0].points).toEqual(points.map((point) => ({ pointId: point.pointId, answer: 'accepted', words: point.why })))
  for (const point of pkg.points) expect(t.api.getRecord(point)!.data['state']).toBe('done')
  const repeated = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points }] })
  expect(repeated.statusCode).toBeGreaterThanOrEqual(400)
  expect(packageOf(pkg.task)['acceptances']).toHaveLength(1)
}, 60_000)

it('returns only the nonholding points and accepts no point of the package', async () => {
  await lines('line-a')
  const { pkg, run, session } = await madeRun('returned', ['done', 'done'])
  const points = judgments(pkg, [
    { judged: 'done', holds: true, rulesKept: true, why: 'First point holds.' },
    { judged: 'unfinished', holds: false, rulesKept: true, why: 'The second point is missing.' },
  ])
  const verdict = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points }] })
  expect(verdict.statusCode, verdict.body).toBe(201)
  expect(packageOf(pkg.task)['acceptances']).toHaveLength(1)
  expect(packageOf(pkg.task)['acceptances'][0].points).toEqual([{ pointId: pkg.points[1], answer: 'returned', words: points[1]!.why }])
  expect(t.api.getRecord(pkg.points[0]!)!.data['state']).not.toBe('done')
}, 60_000)

for (const example of [
  { label: 'a part that holds', outcome: 'part' as const, judged: 'unfinished', rulesKept: true },
  { label: 'rules not kept', outcome: 'done' as const, judged: 'done', rulesKept: false },
]) {
  it(`leaves ${example.label} for the maker and sends one reason`, async () => {
    await lines('line-a')
    const { pkg, run, session } = await madeRun(example.label, [example.outcome])
    const before = makerNotices(pkg.task).length
    const points = judgments(pkg, [{ judged: example.judged, holds: true, rulesKept: example.rulesKept, why: 'Made-up reason.' }])
    const verdict = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points }] })
    expect(verdict.statusCode, verdict.body).toBe(201)
    expect(packageOf(pkg.task)['acceptances'] ?? []).toEqual([])
    const notices = makerNotices(pkg.task).slice(before)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatch(/part|rules/i)
  }, 60_000)
}

it('answers after an earlier inspector check waited without answering', async () => {
  await lines('line-a')
  const { pkg, run, session } = await madeRun('earlier check waited')
  const waiting = judgments(pkg, [{ judged: 'done', holds: true, rulesKept: false, why: 'A rule was not kept.' }])
  const first = await aVerdict(run, session, { verdict: 'refused', missing: ['A rule was not kept.'], says: { chapter: 5 }, packages: [{ task: pkg.task, points: waiting }] })
  expect(first.statusCode, first.body).toBe(201)
  expect(packageOf(pkg.task)['checks']).toHaveLength(1)
  expect(packageOf(pkg.task)['acceptances'] ?? []).toEqual([])

  const secondSession = (await aRunOf(INSPECTOR)).id
  await assembled(run, secondSession)
  const holding = judgments(pkg, [{ judged: 'done', holds: true, rulesKept: true, why: 'The point and rules hold.' }])
  const second = await aVerdict(run, secondSession, { verdict: 'released', packages: [{ task: pkg.task, points: holding }] })
  expect(second.statusCode, second.body).toBe(201)
  expect(packageOf(pkg.task)['checks']).toHaveLength(2)
  expect(packageOf(pkg.task)['acceptances']).toHaveLength(1)
  expect(packageOf(pkg.task)['acceptances'][0].points).toEqual([{ pointId: pkg.points[0], answer: 'accepted', words: holding[0]!.why }])
}, 60_000)

it('writes no second answer after an earlier inspector verdict answered', async () => {
  await lines('line-a')
  const { pkg, run, session } = await madeRun('earlier verdict answered')
  const holding = judgments(pkg, [{ judged: 'done', holds: true, rulesKept: true, why: 'The point and rules hold.' }])
  const first = await aVerdict(run, session, { verdict: 'refused', missing: ['Another reason to refuse the run.'], says: { chapter: 5 }, packages: [{ task: pkg.task, points: holding }] })
  expect(first.statusCode, first.body).toBe(201)
  const answers = structuredClone(packageOf(pkg.task)['acceptances'])
  expect(answers).toHaveLength(1)

  const secondSession = (await aRunOf(INSPECTOR)).id
  await assembled(run, secondSession)
  const second = await aVerdict(run, secondSession, { verdict: 'released', packages: [{ task: pkg.task, points: holding }] })
  expect(second.statusCode, second.body).toBe(201)
  expect(packageOf(pkg.task)['checks']).toHaveLength(2)
  expect(packageOf(pkg.task)['acceptances']).toEqual(answers)
}, 60_000)

it('does not answer a hand-back superseded by one from a later run', async () => {
  await lines('line-a')
  const { pkg, run, session } = await madeRun('stale')
  const later = await aRunOf(WORKER)
  const handed = await post(pkg.task, 'hand-back', { points: [{ pointId: pkg.points[0], outcome: 'done', words: 'A later hand-back.' }] }, asTheRun(later))
  expect(handed.statusCode, handed.body).toBe(201)
  const points = judgments(pkg, [{ judged: 'done', holds: true, rulesKept: true, why: 'The earlier point held.' }])
  await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points }] })
  expect(packageOf(pkg.task)['acceptances'] ?? []).toEqual([])
}, 60_000)

it('keeps the maker and person able to answer by hand and refuses the taker', async () => {
  await lines('line-a')
  for (const who of ['maker', 'person'] as const) {
    const { pkg } = await madeRun(`manual ${who}`)
    const refused = await post(pkg.task, 'accept', { points: [{ pointId: pkg.points[0], answer: 'accepted' }] }, asAgent(WORKER))
    expect(refused.statusCode).toBe(403)
    const accepted = await post(pkg.task, 'accept', { points: [{ pointId: pkg.points[0], answer: 'accepted' }] }, who === 'maker' ? asAgent(PARENT) : asThePerson())
    expect(accepted.statusCode, accepted.body).toBe(201)
    expect(packageOf(pkg.task)['acceptances']).toHaveLength(1)
  }
}, 60_000)

it('fails closed when the setting or a latest hand-back cannot be read', async () => {
  await lines('line-a')
  const { pkg, run } = await madeRun('unreadable')
  expect(qualifies(run, WORKSPACE)).toBe(true)
  t.client.sqlite.prepare('UPDATE runtime_settings SET value = ? WHERE name = ?').run('line-a,,line-b', LINE_SETTING)
  expect(qualifies(run, WORKSPACE)).toBe(false)
  await lines('line-a')
  const held = packageOf(pkg.task)
  held['handedBack'][0]['points'] = 'unreadable'
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.package', json(?)) WHERE id = ?").run(JSON.stringify(held), pkg.task)
  expect(qualifies(run, WORKSPACE)).toBe(false)
}, 60_000)

it('rolls the verdict and package check back when writing an answer fails', async () => {
  await lines('line-a')
  const { pkg, run, session } = await madeRun('failed answer')
  t.client.sqlite.exec(`CREATE TRIGGER made_up_answer_failure BEFORE UPDATE ON records
    WHEN NEW.id = '${pkg.task}' AND json_extract(NEW.data, '$.package.acceptances') IS NOT NULL
    BEGIN SELECT RAISE(ABORT, 'made-up failure'); END`)
  try {
    const points = judgments(pkg, [{ judged: 'done', holds: true, rulesKept: true, why: 'Made-up reason.' }])
    const verdict = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points }] })
    expect(verdict.statusCode).toBe(409)
    expect(verdict.json().error).toContain('The database rejected this write')
    expect(runData(run)['released']).toBeUndefined()
    expect(packageOf(pkg.task)['checks'] ?? []).toEqual([])
    expect(packageOf(pkg.task)['acceptances'] ?? []).toEqual([])
  } finally {
    t.client.sqlite.exec('DROP TRIGGER made_up_answer_failure')
  }
}, 60_000)
