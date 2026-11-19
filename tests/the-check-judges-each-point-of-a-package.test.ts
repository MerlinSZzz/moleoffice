// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK JUDGES EACH POINT OF AN INSIDE PACKAGE THE RUN HANDED BACK.
 *
 * Everything here is made up: the agents, the runs, the packages, their points and every word in them. No model,
 * provider or real office is used. `freshDb` makes a throwaway database, and the keys written beside it are random bytes.
 *
 * A run hands an inside package back, and the office stores which run from the run's own key. The inspector of that
 * run's check judges each point: what it found the point to be, whether the hand-back's claim holds, and why. The
 * judgement is written as the package's check, and a point that does not hold is listed for the line's next round. It
 * never refuses the release by itself.
 *
 * WHAT IS PROVED, each case on its own:
 *
 *   1. The prompt lists a package the run handed back, with each point's words, outcome and hand-back words. It says none
 *      for a run that handed back none, and unknown for a reading with no packages. It leaves out a package another
 *      run handed back and one already checked. The prompt door's answer carries the same packages, for the check tool.
 *   2. A release that judges each point is written. The check is the inspector's, with the run, the points and their
 *      outcomes. A point claimed done that is not done does not hold, has outcome not, and is listed under "To fix in the
 *      line's next round" in the stored check. The run is still released.
 *   3. A point handed back as not done with no real reason is listed, with outcome not.
 *   4. A refused verdict still writes the check.
 *   5. A verdict that leaves out a package or a point, or names a stranger, a duplicate or a package the run did not
 *      hand back, gets 400 each, with no verdict and no check written.
 *   6. A point said to hold though it was found in another state than it was handed back gets 400 naming the point, at
 *      the check door and at the verdict door, with nothing written. A point that does not hold, found in the state it
 *      was handed back as, is still taken.
 *   7. An inspector of a different run is refused, at the verdict door and at the check door.
 *   8. The latest taker gets the taker's sentence, even when it is also the inspector.
 *   9. A hand-back sent with no run key is refused at the hand-back door, with nothing stored and no one told. A stored
 *      hand-back that names no run, as one stored before that refusal does, is refused at the check door, and so is
 *      one from a run with no stored check.
 *  10. The person's check and the parent agent's check are written as before.
 *  11. The delegation column shows a package only the inspector has checked as handed back, with no check and no check
 *      words, and the progress card's counts do not move. Once the parent answers, the column shows its answer.
 *  12. The prompt of a run that handed back a package keeps the packages, the changes and the four kinds, and leaves out
 *      the brief, the reports, what the run wrote, its decisions, the list and the trace. The prompt of a run that handed
 *      back none keeps each of those, and none of the package check's words.
 *  13. A release of a run that handed back a package lists only the point that does not hold. A fault the check listed
 *      outside the points is named as left off the list, and is on neither side of it.
 *  14. A release of a run that handed back a package is taken without a trace. A release of a run that handed back
 *      none, with the same change, is still refused for the path it does not trace.
 *
 * Each stored check carries its order number among the package's acts, written by the door, so its exact shape holds
 * `order` beside `by` and `at`.
 *
 * Every expected sentence is read from the exported function or constant that makes it.
 */

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
import { apiApp, freshDb, type TestDb } from './helpers.ts'

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
interface AJudgedPoint { pointId: string; judged: 'done' | 'off_target' | 'narrower' | 'more_than_asked' | 'unfinished'; holds: boolean; why: string; rulesKept: boolean }

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
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? { replaces: [], ...data } : data } })
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
  const enabled = await app.inject({ method: 'PATCH', url: `/api/workspaces/${WORKSPACE}`, headers: asThePerson(), payload: { packageInspection: true } })
  expect(enabled.statusCode, enabled.body).toBe(200)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the prompt lists what the run handed back', () => {
  it('lists each point of a package the run handed back, says none or unknown, and leaves out others', async () => {
    const said = [
      { says: 'A made-up point to build', outcome: 'done' as const, words: 'Built it and ran its made-up test.' },
      { says: 'A made-up point half built', outcome: 'part' as const, words: 'Half of it is built.' },
    ]
    const listed = await aPackage('A made-up package the prompt lists', said.map((one) => one.says))
    const checkedAlready = await aPackage('A made-up package already checked', ['A made-up point already checked'])
    const anothers = await aPackage('A made-up package another run handed back', ['A made-up point of another run'])
    const run = await aRunOf(WORKER)
    await handedBack(listed, asTheRun(run), said)
    await handedBack(checkedAlready, asTheRun(run), [{ outcome: 'done', words: 'Done.' }])
    const answered = await post(checkedAlready.task, 'check', { answer: 'holds', words: 'It holds.' }, asAgent(PARENT))
    expect(answered.statusCode, answered.body).toBe(201)
    const another = await aRunOf(WORKER)
    await handedBack(anothers, asTheRun(another), [{ outcome: 'done', words: 'Done by another run.' }])
    theRunEnds(run)

    const reads = inspection.whatTheInspectorReads(run.id, WORKSPACE)
    const words = prompt(reads)
    expect(words).toContain(listed.task)
    expect(words).toContain(listed.title)
    for (const [at, one] of said.entries()) {
      expect(words).toContain(listed.points[at]!)
      expect(words).toContain(one.says)
      expect(words).toContain(delegation.A_POINTS_STATE_IN_WORDS[one.outcome])
      expect(words).toContain(one.words)
    }
    expect(words).not.toContain(checkedAlready.task)
    expect(words).not.toContain(anothers.task)
    expect(words).not.toContain(inspection.THE_RUN_HANDED_BACK_NO_PACKAGE)

    const asked = await app.inject({ method: 'POST', url: `/api/checks/${run.id}/prompt`, headers: asAgent(INSPECTOR), payload: { changes: [] } })
    expect(asked.statusCode, asked.body).toBe(200)
    expect(asked.json().packages).toEqual(reads.packages)
    expect(asked.json().prompt).toContain(inspection.theInsidePackagesSection(reads.packages))

    const none = await aRunOf(WORKER)
    theRunEnds(none)
    const empty = prompt(inspection.whatTheInspectorReads(none.id, WORKSPACE))
    expect(empty).toContain(inspection.THE_RUN_HANDED_BACK_NO_PACKAGE)
    expect(empty).not.toContain(inspection.THE_PACKAGES_COULD_NOT_BE_READ)

    const older = { ...inspection.whatTheInspectorReads(none.id, WORKSPACE) } as Record<string, unknown>
    delete older['packages']
    const unknown = prompt(older as unknown as ReturnType<typeof inspection.whatTheInspectorReads>)
    expect(unknown).toContain(inspection.THE_PACKAGES_COULD_NOT_BE_READ)
    expect(unknown).not.toContain(inspection.THE_RUN_HANDED_BACK_NO_PACKAGE)
  }, 60_000)
})

describe('the verdict writes each package’s check', () => {
  it('releases the run and writes the inspector’s check, listing a point claimed done that is not', async () => {
    const said = [
      { says: 'A made-up point claimed done', outcome: 'done' as const, words: 'Built and proved.' },
      { says: 'A made-up point really done', outcome: 'done' as const, words: 'Built too.' },
    ]
    const { pkg, run, session } = await aRunThatHandedBack('A made-up package to release', said)
    expect(packageOf(pkg.task)['handedBack'].at(-1).run).toBe(run)
    const judged: AJudgedPoint[] = [
      { pointId: pkg.points[0]!, judged: 'narrower', rulesKept: true, holds: false, why: 'Only half of it is built.' },
      { pointId: pkg.points[1]!, judged: 'done', rulesKept: true, holds: true, why: 'Its made-up test passes.' },
    ]

    const reply = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points: judged }] })
    expect(reply.statusCode, reply.body).toBe(201)

    expect(packageOf(pkg.task)['checks']).toEqual([{
      by: { actorType: 'agent', actorId: INSPECTOR },
      at: expect.any(String),
      order: expect.any(Number),
      run,
      answer: 'refused',
      words: delegation.theInspectorsCheckSays(judged),
      points: [{ ...judged[0], outcome: 'not' }, { ...judged[1], outcome: 'done' }],
    }])
    const sentence = delegation.aPointThatDoesNotHoldSays({
      task: pkg.task, title: pkg.title, pointId: pkg.points[0]!, says: said[0]!.says,
      claimed: 'done', claimedWords: said[0]!.words, judged: 'narrower', why: judged[0]!.why,
    })
    const released = runData(run)['released'] as Record<string, any>
    expect(released, 'the run was not released').toBeDefined()
    expect(released['listed']).toEqual({ nextRound: [sentence], afterLanding: [] })
    expect(theMessageBody(String(released['check']))).toContain(theListedFaultsSay([sentence], []))
  }, 60_000)

  it('lists a point handed back as not done with no real reason, with outcome not', async () => {
    const said = [{ says: 'A made-up point not done', outcome: 'not' as const, words: 'No time.' }]
    const { pkg, run, session } = await aRunThatHandedBack('A made-up package not done', said)
    const judged: AJudgedPoint[] = [{ pointId: pkg.points[0]!, judged: 'unfinished', rulesKept: true, holds: false, why: 'No time names nothing that stopped the work.' }]

    const reply = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points: judged }] })
    expect(reply.statusCode, reply.body).toBe(201)

    expect(packageOf(pkg.task)['checks'].at(-1).points).toEqual([{ ...judged[0], outcome: 'not' }])
    const sentence = delegation.aPointThatDoesNotHoldSays({
      task: pkg.task, title: pkg.title, pointId: pkg.points[0]!, says: said[0]!.says,
      claimed: 'not', claimedWords: said[0]!.words, judged: 'unfinished', why: judged[0]!.why,
    })
    const released = runData(run)['released'] as Record<string, any>
    expect(theMessageBody(String(released['check']))).toContain(theListedFaultsSay([sentence], []))
  }, 60_000)

  it('writes the check with a refused verdict too', async () => {
    const said = [{ says: 'A made-up point of a refused run', outcome: 'done' as const, words: 'Built.' }]
    const { pkg, run, session } = await aRunThatHandedBack('A made-up package of a refused run', said)
    const judged: AJudgedPoint[] = [{ pointId: pkg.points[0]!, judged: 'done', rulesKept: true, holds: true, why: 'Its made-up test passes.' }]

    const reply = await aVerdict(run, session, {
      verdict: 'refused', missing: ['A made-up fault: the made-up office cannot start.'], says: { chapter: 5 },
      packages: [{ task: pkg.task, points: judged }],
    })
    expect(reply.statusCode, reply.body).toBe(201)

    expect(runData(run)['refused'], 'the run was not refused').toBeDefined()
    expect(packageOf(pkg.task)['checks']).toEqual([{
      by: { actorType: 'agent', actorId: INSPECTOR }, at: expect.any(String), order: expect.any(Number), run, answer: 'holds',
      words: delegation.theInspectorsCheckSays(judged), points: [{ ...judged[0], outcome: 'done' }],
    }])
  }, 60_000)
})

describe('a verdict that does not judge every point exactly once is refused', () => {
  let ready: Awaited<ReturnType<typeof aRunThatHandedBack>>
  let anothers: APackage
  const judgedOf = (pointId: string): AJudgedPoint => ({ pointId, judged: 'done', rulesKept: true, holds: true, why: 'Its made-up test passes.' })

  beforeAll(async () => {
    ready = await aRunThatHandedBack('A made-up package judged wrongly', [
      { says: 'A made-up first point', outcome: 'done', words: 'Built.' },
      { says: 'A made-up second point', outcome: 'done', words: 'Built too.' },
    ])
    anothers = await aPackage('A made-up package of another run, named in a verdict', ['A made-up point of the other run'])
    await handedBack(anothers, asTheRun(await aRunOf(WORKER)), [{ outcome: 'done', words: 'Done.' }])
  }, 60_000)

  const cases: [string, () => { task: string; points: AJudgedPoint[] }[], () => string][] = [
    ['leaves out the package', () => [], () => ready.pkg.task],
    ['leaves out a point', () => [{ task: ready.pkg.task, points: [judgedOf(ready.pkg.points[0]!)] }], () => ready.pkg.points[1]!],
    ['names a stranger', () => [{ task: ready.pkg.task, points: [...ready.pkg.points.map(judgedOf), judgedOf(anothers.points[0]!)] }], () => anothers.points[0]!],
    ['names a point twice', () => [{ task: ready.pkg.task, points: [...ready.pkg.points.map(judgedOf), judgedOf(ready.pkg.points[1]!)] }], () => ready.pkg.points[1]!],
    ['names a package the run did not hand back', () => [
      { task: ready.pkg.task, points: ready.pkg.points.map(judgedOf) },
      { task: anothers.task, points: anothers.points.map(judgedOf) },
    ], () => anothers.task],
  ]

  it.each(cases)('a verdict that %s gets 400, and nothing is written', async (_what, given, named) => {
    const packages = given()
    const lacks = delegation.whatAVerdictsPackagesLack(delegation.thePackagesThisRunHandedBack(ready.run, WORKSPACE).packages, packages)
    expect(lacks.join(' ')).toContain(named())

    const reply = await aVerdict(ready.run, ready.session, { verdict: 'released', packages })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.json().error).toContain(delegation.theVerdictsPackagesLack(lacks))
    expect(runData(ready.run)['released']).toBeUndefined()
    expect(runData(ready.run)['refused']).toBeUndefined()
    expect(packageOf(ready.pkg.task)['checks']).toBeUndefined()
  }, 60_000)
})

describe('a point found in another state than it was handed back cannot hold', () => {
  it('keeps the handed-back outcome when an unfinished point holds', async () => {
    const said = [
      { says: 'A made-up partly finished point', outcome: 'part' as const, words: 'Half is done for a made-up reason.' },
      { says: 'A made-up unfinished point', outcome: 'not' as const, words: 'It was blocked for a made-up reason.' },
    ]
    const { pkg, run, session } = await aRunThatHandedBack('A made-up package with unfinished points', said)
    const judged: AJudgedPoint[] = pkg.points.map((pointId) => ({ pointId, judged: 'unfinished', rulesKept: true, holds: true, why: 'The hand-back says what remains.' }))
    const reply = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points: judged }] })
    expect(reply.statusCode, reply.body).toBe(201)
    expect(packageOf(pkg.task)['checks'].at(-1).points).toEqual(judged.map((one, i) => ({ ...one, outcome: said[i]!.outcome })))
  }, 60_000)

  it('refuses holds true with another judged state at the check door and at the verdict door, naming the point', async () => {
    const said = [
      { says: 'A made-up point claimed done and found half built', outcome: 'done' as const, words: 'Built.' },
      { says: 'A made-up point claimed part and found part', outcome: 'part' as const, words: 'Half of it.' },
    ]
    const { pkg, run, session } = await aRunThatHandedBack('A made-up package with a claim that cannot hold', said)
    const judged: AJudgedPoint[] = [
      { pointId: pkg.points[0]!, judged: 'narrower', rulesKept: true, holds: true, why: 'Half of it is built.' },
      { pointId: pkg.points[1]!, judged: 'narrower', rulesKept: true, holds: false, why: 'Half of it names no reason the rest is not built.' },
    ]
    const cannot = [{ pointId: pkg.points[0]!, claimed: 'done' as const, judged: 'narrower' as const }]

    const atTheCheck = await post(pkg.task, 'check', { points: judged }, asTheInspectorIn(session))
    expect(atTheCheck.statusCode, atTheCheck.body).toBe(400)
    expect(atTheCheck.json().error).toBe(delegation.theInspectorsClaimsCannotHold(pkg.title, cannot))
    expect(packageOf(pkg.task)['checks']).toBeUndefined()

    const atTheVerdict = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points: judged }] })
    expect(atTheVerdict.statusCode, atTheVerdict.body).toBe(400)
    expect(atTheVerdict.json().error).toContain(delegation.theClaimsThatCannotHoldSay(cannot))
    expect(atTheVerdict.json().error).toContain(delegation.theVerdictsPackagesLack(
      delegation.whatAVerdictsPackagesLack(delegation.thePackagesThisRunHandedBack(run, WORKSPACE).packages, [{ task: pkg.task, points: judged }])))
    expect(runData(run)['released']).toBeUndefined()
    expect(packageOf(pkg.task)['checks']).toBeUndefined()

    const neither = judged.map((one) => ({ ...one, holds: false }))
    const taken = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points: neither }] })
    expect(taken.statusCode, taken.body).toBe(201)
    expect(packageOf(pkg.task)['checks'].at(-1).points).toEqual(neither.map((one) => ({ ...one, outcome: 'not' })))
  }, 60_000)
})

describe('only the inspector of the run that handed it back may check it', () => {
  it('refuses an inspector of a different run, at the verdict door and at the check door', async () => {
    const said = [{ says: 'A made-up point checked by the wrong check', outcome: 'done' as const, words: 'Built.' }]
    const { pkg, run } = await aRunThatHandedBack('A made-up package and a different check', said)
    const other = await aRunOf(WORKER)
    theRunEnds(other)
    const elsewhere = (await aRunOf(INSPECTOR)).id
    await assembled(other.id, elsewhere)
    const points: AJudgedPoint[] = [{ pointId: pkg.points[0]!, judged: 'done', rulesKept: true, holds: true, why: 'Its made-up test passes.' }]

    const atTheCheck = await post(pkg.task, 'check', { points }, asTheInspectorIn(elsewhere))
    expect(atTheCheck.statusCode, atTheCheck.body).toBe(403)
    expect(atTheCheck.json().error).toContain(delegation.theInspectorOfAnotherRun(run))

    const atTheVerdict = await aVerdict(run, elsewhere, { verdict: 'released', packages: [{ task: pkg.task, points }] })
    expect(atTheVerdict.statusCode, atTheVerdict.body).toBe(403)
    expect(atTheVerdict.json().error).toContain(delegation.theInspectorOfAnotherRun(run))
    expect(runData(run)['released']).toBeUndefined()
    expect(packageOf(pkg.task)['checks']).toBeUndefined()
  }, 60_000)

  it('gives the latest taker the taker’s sentence, even when it is the inspector', async () => {
    const pkg = await aPackage('A made-up package the inspector took', ['A made-up point the inspector built'])
    await handedBack(pkg, asTheRun(await aRunOf(INSPECTOR)), [{ outcome: 'done', words: 'Built.' }])
    const session = (await aRunOf(INSPECTOR)).id

    const reply = await post(pkg.task, 'check', { points: [{ pointId: pkg.points[0]!, judged: 'done', rulesKept: true, holds: true, why: 'I built it.' }] }, asTheInspectorIn(session))
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.json().error).toBe(delegation.THE_TAKER_MAY_NOT_CHECK)
    expect(packageOf(pkg.task)['checks']).toBeUndefined()
  }, 60_000)

  it('refuses a hand-back that carries no run key, and checks no stored hand-back that names no run', async () => {
    const pkg = await aPackage('A made-up package handed back with no run key', ['A made-up point with no run'])
    for (const [door, payload, headers] of [
      ['take-inside', {}, asAgent(WORKER)],
      ['align', { restated: 'I will do the made-up work.', plan: 'Do it.' }, asAgent(WORKER)],
      ['align-answer', { answer: 'aligned', words: 'Yes.' }, asAgent(PARENT)],
    ] as const) {
      const reply = await post(pkg.task, door, payload, headers)
      expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
    }
    const handedBackNotices = () => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'packageHandedBack'").get() as { n: number }).n
    const noticesBefore = handedBackNotices()
    const points = [{ pointId: pkg.points[0]!, outcome: 'done' as const, words: 'Built.' }]

    const refused = await post(pkg.task, 'hand-back', { points }, asAgent(WORKER))
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.json().error).toBe(delegation.A_HAND_BACK_NEEDS_ITS_RUNS_KEY)
    expect(packageOf(pkg.task)['handedBack']).toBeUndefined()
    expect(handedBackNotices()).toBe(noticesBefore)

    // A HAND-BACK STORED BEFORE THE DOOR ASKED FOR A RUN KEY names no run. One is written into the record here, as the door wrote it then.
    const older = { by: { actorType: 'agent', actorId: WORKER }, at: packageOf(pkg.task)['alignmentAnswers'].at(-1).at, points }
    t.api.patchRecord(pkg.task, { dataPatch: { package: { ...packageOf(pkg.task), handedBack: [older] } } }, { type: 'agent', id: WORKER })
    expect(packageOf(pkg.task)['handedBack']).toEqual([older])
    const session = (await aRunOf(INSPECTOR)).id

    const reply = await post(pkg.task, 'check', { points: [{ pointId: pkg.points[0]!, judged: 'done', rulesKept: true, holds: true, why: 'It passes.' }] }, asTheInspectorIn(session))
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.json().error).toBe(delegation.A_HAND_BACK_WITH_NO_RUN)
    expect(packageOf(pkg.task)['checks']).toBeUndefined()
  }, 60_000)

  it('refuses a hand-back from a run with no check recorded', async () => {
    const pkg = await aPackage('A made-up package from a run nobody checked', ['A made-up point nobody checked'])
    const run = await aRunOf(WORKER)
    await handedBack(pkg, asTheRun(run), [{ outcome: 'done', words: 'Built.' }])
    const session = (await aRunOf(INSPECTOR)).id

    const reply = await post(pkg.task, 'check', { points: [{ pointId: pkg.points[0]!, judged: 'done', rulesKept: true, holds: true, why: 'It passes.' }] }, asTheInspectorIn(session))
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.json().error).toBe(delegation.noCheckOfTheRunIsRecorded(run.id))
    expect(packageOf(pkg.task)['checks']).toBeUndefined()
  }, 60_000)
})

describe('the person and the parent agent check as before', () => {
  for (const [who, headers, by] of [
    ['the person', () => asThePerson(), { actorType: 'human', actorId: THE_PERSON }],
    ['the parent agent', () => asAgent(PARENT), { actorType: 'agent', actorId: PARENT }],
  ] as const) {
    it(`writes ${who}’s check, holds, with its words and nothing more`, async () => {
      const pkg = await aPackage(`A made-up package ${who} checks`, [`A made-up point ${who} checks`])
      await handedBack(pkg, asTheRun(await aRunOf(WORKER)), [{ outcome: 'done', words: 'Built.' }])

      const reply = await post(pkg.task, 'check', { answer: 'holds', words: `It holds, as ${who} reads it.` }, headers())
      expect(reply.statusCode, reply.body).toBe(201)
      expect(packageOf(pkg.task)['checks']).toEqual([{ by, at: expect.any(String), order: expect.any(Number), answer: 'holds', words: `It holds, as ${who} reads it.` }])
    }, 60_000)
  }
})

describe('the delegation column shows the parent’s answer, not the inspector’s check', () => {
  /** The package's row, as the inside column's door serves it. */
  async function theColumnRow(task: string): Promise<Record<string, any>> {
    const reply = await app.inject({ method: 'GET', url: '/api/delegation/inside', headers: asThePerson() })
    expect(reply.statusCode, reply.body).toBe(200)
    const row = (reply.json().tasks as Record<string, any>[]).find((one) => one.recordId === task)
    expect(row, `the column has no row for ${task}`).toBeDefined()
    return row!
  }
  /** The inside briefs' counts, as the page's progress card asks for them. */
  async function theBriefCounts(): Promise<Record<string, number>> {
    const reply = await app.inject({ method: 'GET', url: '/api/backlog/progress', headers: asThePerson() })
    expect(reply.statusCode, reply.body).toBe(200)
    return reply.json().briefs as Record<string, number>
  }

  it('shows a package only the inspector has checked as not yet checked, and the parent’s answer once it is given', async () => {
    const said = [{ says: 'A made-up point the column shows', outcome: 'done' as const, words: 'Built.' }]
    const { pkg, session } = await aRunThatHandedBack('A made-up package the column shows', said)
    const before = await theBriefCounts()
    const judged: AJudgedPoint[] = [{ pointId: pkg.points[0]!, judged: 'narrower', rulesKept: true, holds: false, why: 'Only half of it is built.' }]

    const inspected = await post(pkg.task, 'check', { points: judged }, asTheInspectorIn(session))
    expect(inspected.statusCode, inspected.body).toBe(201)
    expect(packageOf(pkg.task)['checks'].at(-1).answer).toBe('refused')
    const onlyTheInspector = await theColumnRow(pkg.task)
    expect(onlyTheInspector['state']).toBe('handed_back')
    expect(onlyTheInspector['inside']).toMatchObject({ handedBack: true, check: 'none', checkWords: null })
    expect(await theBriefCounts()).toEqual(before)

    const words = 'It holds, as the parent agent reads it.'
    const answered = await post(pkg.task, 'check', { answer: 'holds', words }, asAgent(PARENT))
    expect(answered.statusCode, answered.body).toBe(201)
    const theParents = await theColumnRow(pkg.task)
    expect(theParents['state']).toBe('handed_back')
    expect(theParents['inside']).toMatchObject({ handedBack: true, check: 'holds', checkWords: words })
    // A CHECK MOVES NO STATE: the package stays handed back until its maker accepts or returns it, so no count moves.
    expect(await theBriefCounts()).toEqual(before)
  }, 60_000)
})

describe('a check of handed-back packages is asked only for the points and the four kinds', () => {
  it('keeps the packages, the changes and the four kinds and leaves out the rest, and a run that handed back none keeps it all', async () => {
    const said = [{ says: 'A made-up point of the shorter prompt', outcome: 'done' as const, words: 'Built it.' }]
    const pkg = await aPackage('A made-up package of the shorter prompt', said.map((one) => one.says))
    const run = await aRunOf(WORKER)
    await handedBack(pkg, asTheRun(run), said)
    theRunEnds(run)
    const none = await aRunOf(WORKER)
    theRunEnds(none)
    const thePromptOf = (id: string) => {
      const reads = inspection.whatTheInspectorReads(id, WORKSPACE)
      const changes = inspection.changesInTheWorkArea(reads.workArea, [A_MADE_UP_CHANGE])
      return { reads, changes, words: inspection.assembleTheInspectorsPrompt({ reads, changes, workspaceId: WORKSPACE }).text }
    }
    const leftOut = Object.values(inspection.THE_PARTS_A_CHECK_OF_PACKAGES_LEAVES_OUT)
    const itsOwn = [
      inspection.THE_ROLE_IN_A_CHECK_OF_PACKAGES,
      inspection.HOW_A_CHECK_OF_PACKAGES_READS_THE_CHANGE,
      inspection.A_CHECK_OF_PACKAGES_LISTS_ONLY_ITS_POINTS,
    ]
    expect(leftOut.length).toBeGreaterThan(0)

    const packaged = thePromptOf(run.id)
    expect(packaged.words).toContain(inspection.theInsidePackagesSection(packaged.reads.packages))
    expect(packaged.words).toContain(packaged.changes.says)
    expect(packaged.words).toContain(A_MADE_UP_CHANGE.changes)
    for (const kind of THE_FOUR_KINDS) expect(packaged.words).toContain(WHAT_A_KIND_IS[kind as keyof typeof WHAT_A_KIND_IS])
    for (const words of itsOwn) expect(packaged.words).toContain(words)
    for (const words of leftOut) expect(packaged.words).not.toContain(words)

    const unpackaged = thePromptOf(none.id)
    expect(unpackaged.words).toContain(inspection.THE_RUN_HANDED_BACK_NO_PACKAGE)
    for (const words of leftOut) expect(unpackaged.words).toContain(words)
    for (const words of itsOwn) expect(unpackaged.words).not.toContain(words)
  }, 60_000)
})

describe('a release of handed-back packages lists only the points that do not hold', () => {
  it('lists the point that does not hold, and names a fault listed outside the points as left off the list', async () => {
    const said = [{ says: 'A made-up point listed alone', outcome: 'done' as const, words: 'Built and proved.' }]
    const { pkg, run, session } = await aRunThatHandedBack('A made-up package listed alone', said)
    const judged: AJudgedPoint[] = [{ pointId: pkg.points[0]!, judged: 'narrower', rulesKept: true, holds: false, why: 'Only half of it is built.' }]
    const outside = {
      nextRound: ['A made-up fault outside the points: a made-up helper is long.'],
      afterLanding: ['A made-up fault of form: a made-up short form is missing.'],
    }

    const reply = await aVerdict(run, session, {
      verdict: 'released',
      check: `${A_MADE_UP_CHECK}\n\n${theListedFaultsSay(outside.nextRound, outside.afterLanding)}`,
      listed: outside,
      packages: [{ task: pkg.task, points: judged }],
    })
    expect(reply.statusCode, reply.body).toBe(201)

    const sentence = delegation.aPointThatDoesNotHoldSays({
      task: pkg.task, title: pkg.title, pointId: pkg.points[0]!, says: said[0]!.says,
      claimed: 'done', claimedWords: said[0]!.words, judged: 'narrower', why: judged[0]!.why,
    })
    const released = runData(run)['released'] as Record<string, any>
    expect(released, 'the run was not released').toBeDefined()
    expect(released['listed']).toEqual({ nextRound: [sentence], afterLanding: [] })
    const body = theMessageBody(String(released['check']))
    expect(body).toContain(theListedFaultsSay([sentence], []))
    expect(body).not.toContain(theListedFaultsSay(outside.nextRound, outside.afterLanding))
    expect(body).not.toContain(theListedFaultsSay([...outside.nextRound, sentence], outside.afterLanding))
    expect(body).toContain(verdictKinds.theFaultsLeftOffTheListSay([...outside.nextRound, ...outside.afterLanding]))
  }, 60_000)
})

describe('a release of handed-back packages needs no trace', () => {
  it('takes a release with no trace of a run that handed back a package, and still refuses one of a run that handed back none', async () => {
    const said = [{ says: 'A made-up point of a change nobody traced', outcome: 'done' as const, words: 'Built it.' }]
    const { pkg, run, session } = await aRunThatHandedBack('A made-up package released with no trace', said, [A_MADE_UP_CHANGE])
    const judged: AJudgedPoint[] = [{ pointId: pkg.points[0]!, judged: 'done', rulesKept: true, holds: true, why: 'Its made-up test passes.' }]

    const reply = await aVerdict(run, session, { verdict: 'released', packages: [{ task: pkg.task, points: judged }] })
    expect(reply.statusCode, reply.body).toBe(201)
    const released = runData(run)['released'] as Record<string, any>
    expect(released, 'the run was not released').toBeDefined()
    expect(theMessageBody(String(released['check']))).toContain(inspection.A_CHECK_OF_PACKAGES_TRACES_NO_PATH)

    const none = await aRunOf(WORKER)
    theRunEnds(none)
    const itsSession = (await aRunOf(INSPECTOR)).id
    await assembled(none.id, itsSession, [A_MADE_UP_CHANGE])
    const refused = await aVerdict(none.id, itsSession, { verdict: 'released' })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.json().error).toContain(aReleaseWithoutATraceSays([A_MADE_UP_CHANGE.path]))
    expect(runData(none.id)['released']).toBeUndefined()
  }, 60_000)
})
