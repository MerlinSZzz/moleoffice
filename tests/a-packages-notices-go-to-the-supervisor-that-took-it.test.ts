// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE'S NOTICES GO TO THE SUPERVISOR THAT TOOK IT, AND THE SECRETARY THAT MADE IT HEARS ONLY ITS OWN THREE.
 *
 * Everything here is made up: the agents, the runs, the packages, their points, the git trees, the check and every word
 * in them. No model, provider or real office is used. `freshDb` makes a throwaway database, and the keys written beside
 * it are random bytes. The git trees and the one transcript are made in the test's own temporary folder.
 *
 * A secretary makes a package. A supervisor the secretary started takes it inside in its run, aligns it with the
 * secretary and hands it back. The person finishes the run, which seals its tip, and the inspector checks it. A released
 * run's merge entry lands. WHAT IS PROVED, each case on its own:
 *
 *   1. About that run, the secretary is handed the package's three notices (taken, aligned and handed back), the
 *      ask to confirm the run that only the run's starter may answer, and the supervisor's own message to it. Nothing
 *      else. The align and the hand-back wake it. The supervisor is handed the rest: the answer to its align, the check's
 *      release, and the secretary's line of the landing, which says on itself which package moved it there. The landing's
 *      answer names the supervisor as the one told. Neither is handed the line that says the run was sealed: its words
 *      are for the run's starter, and the supervisor is the run's own agent. The seal stores why nobody was told.
 *   2. A supervisor started by another supervisor is retired after it hands the package back. The secretary is still
 *      handed only the three notices. The secretary's line of the landing is addressed to the retired supervisor and goes
 *      up that supervisor's own chain of starters, to its starter, whom a session holds.
 *   3. A check refuses the run. The secretary is not handed the refusal's line for the run's starter. The supervisor is
 *      handed both that line and the refusal itself, so it hears of one refusal twice.
 *   4. A supervisor the secretary started retires after it hands the package back, and the check refuses the run. The
 *      check's own two lines, the refusal and its line for the starter, stay with the secretary and say nothing of the
 *      package. The retired supervisor is handed nothing about the run. The seal line is written to nobody, and the seal
 *      says why.
 *
 * Every notice is named by its kind. The kinds of the package's own notices are new with the change, so before it no
 * message carries them.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isMoleOffice, THE_MESSAGE_WORKER_ID, type ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish, type WordKey, type WordValues } from '../src/shared/i18n.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'

/** Made-up keys, written beside the throwaway database before the server is built. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const WORKSPACE = 'default'
const MAKER = 'makes-packages-m'
const SUPERVISOR = 'takes-packages-s'
const MIDDLE = 'starts-supervisors-x'
const RETIRING = 'takes-packages-and-retires'
const RETIRES_UNDER_THE_MAKER = 'takes-packages-for-the-maker-and-retires'
const INSPECTOR = 'checks-packages-i'
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }
const AT = '2026-11-12 21:30:00'
const PERSON = { type: 'human', id: THE_PERSON } as const
const A_MADE_UP_CHECK = 'Made up: read the changes and the package. No model ran.'

interface APackage { task: string; title: string; points: string[] }
interface ARun { id: string; key: string; handle: string; dir: string; mainAt: string; tip: string }
interface AnEntry { id: string; run: string; tip: string; mainAt: string }
interface ANotice { id: string; notice: unknown; data: Record<string, any> }

let t: TestDb
let app: FastifyInstance
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let notices: typeof import('../src/server/lib/notices.ts')
let worker: typeof import('../src/server/lib/worker.ts')
let home: string
const savedHome = process.env.HOME
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

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** The made-up work area of a supervisor whose run is sealed, which the seal reads. */
const WORK_AREA = 'src'

async function register(handle: string, role: string, headers: Record<string, string>, works = false): Promise<void> {
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers,
    payload: { handle, name: handle, role, chapters: ['5:full'], ...(works ? { workArea: [WORK_AREA] } : {}) },
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

/** A running run of `handle`, filed by the office, with the run key the office made for it, in `dir` when one is given. */
async function aSession(handle: string, title: string, dir?: string): Promise<{ id: string; key: string }> {
  const reply = await app.inject({
    method: 'POST', url: '/api/records', headers: asTheOffice(),
    payload: { kind: 'session', title, data: {
      state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf[handle], doing: title,
      ...(dir === undefined ? {} : { workingDirectory: dir, cutFrom: 'main', submission: { kind: 'git' } }),
    } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const key = String(reply.json().runKey?.key ?? '')
  expect(key, 'the office made no run key').not.toBe('')
  return { id: String(reply.json().record.id), key }
}

/** A git tree with a main commit and one commit of work on top, and a running run of `handle` working in it. */
async function aRunOf(handle: string, title: string): Promise<ARun> {
  const dir = mkdtempSync(join(home, 'tree-'))
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.name', 'Synthetic fixture'); git(dir, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(dir, 'baseline'), 'baseline')
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Synthetic main')
  const mainAt = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-q', '-c', 'work')
  mkdirSync(join(dir, WORK_AREA))
  writeFileSync(join(dir, WORK_AREA, 'work.txt'), title)
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Synthetic work')
  const tip = git(dir, 'rev-parse', 'HEAD')
  const session = await aSession(handle, title, dir)
  return { ...session, handle, dir, mainAt, tip }
}

/** A package the maker makes, under a parent task the maker answers for, with one backlog item per point. */
async function aPackage(title: string, says: string[]): Promise<APackage> {
  const decision = await file('decision', `${title}: the decision above it`)
  const points: string[] = []
  for (const one of says) {
    points.push(await file('backlog_item', one, { line: 'a-made-up-line', number: one, placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo' }))
  }
  const parent = await file('task', `${title}: the parent`, {}, asAgent(MAKER))
  const parentPackaged = await post(parent, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'decision', id: decision }, pointIds: points }, asAgent(MAKER))
  expect(parentPackaged.statusCode, parentPackaged.body).toBe(201)
  const task = await file('task', title, {}, asAgent(MAKER))
  const packaged = await post(task, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'task', id: parent }, pointIds: points }, asAgent(MAKER))
  expect(packaged.statusCode, packaged.body).toBe(201)
  return { task, title, points }
}

/** Taken inside by the run, aligned with the maker, and handed back with every point done. */
async function takenAlignedAndHandedBack(pkg: APackage, run: ARun): Promise<void> {
  for (const [door, payload, headers] of [
    ['take-inside', {}, asTheRun(run)],
    ['align', { restated: 'I will do the made-up work.', plan: 'Do it.' }, asTheRun(run)],
    ['align-answer', { answer: 'aligned', words: 'Yes.' }, asAgent(MAKER)],
    ['hand-back', { points: pkg.points.map((pointId) => ({ pointId, outcome: 'done', words: 'Built.' })) }, asTheRun(run)],
  ] as const) {
    const reply = await post(pkg.task, door, payload, headers)
    expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
  }
}

/** The seal the finish made, as the check names it. */
function theSealOf(run: string): { id: string; hash: string; commit: string; forkBase: string; paths: string[] } {
  const id = String(dataOf(run)['sealedTip'])
  const seal = dataOf(id)['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string }[] } }
  return { id, hash: seal.hash, commit: seal.git.commit, forkBase: seal.git.forkBase, paths: seal.git.files.map((one) => one.path) }
}

/**
 * The person finishes the run, which seals its tip, and the inspector checks it in a session of its own: the assembly,
 * then the verdict, which judges every point of the package.
 */
async function checked(run: ARun, pkg: APackage, verdict: 'released' | 'refused'): Promise<void> {
  t.api.patchRecord(run.id, { dataPatch: { state: 'finished' } }, PERSON)
  const seal = theSealOf(run.id)
  const read = { sealId: seal.id, sealHash: seal.hash, worktree: run.dir, tip: seal.commit, ofItsOwn: true, says: 'Made up: a check of its own tree.' }
  const session = (await aSession(INSPECTOR, `A made-up check of ${run.id}`)).id
  const assembled = await app.inject({
    method: 'POST', url: `/api/checks/${run.id}/assembled`, headers: asTheInspectorIn(session),
    payload: { changes: seal.paths.map((path) => ({ path, changes: 'a made-up diff' })), base: { ref: seal.forkBase, how: 'fork point', says: 'Made up: the fork base of the seal.' }, read },
  })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const judged = { task: pkg.task, points: pkg.points.map((pointId) => ({ pointId, judged: 'done', holds: true, why: 'Made up: it holds.', rulesKept: true })) }
  const said = verdict === 'released'
    ? { traced: syntheticTrace(t, seal.paths) }
    : { missing: ['Made up: a case the change needs'], says: { chapter: 5 } }
  const reply = await app.inject({
    method: 'POST', url: `/api/checks/${run.id}`, headers: asTheInspectorIn(session),
    payload: { verdict, check: A_MADE_UP_CHECK, chaptersRead: ['5:full'], read, packages: [judged], ...said },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The released run's merge entry, made as the merge queue makes one, and tested green. */
async function queued(run: ARun): Promise<AnEntry> {
  const seal = theSealOf(run.id)
  const id = door.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: `The entry of ${run.id}`, workspaceId: WORKSPACE, origin: 'fixture', actor: PERSON, data: {
    state: 'testing', run: run.id, seal: { id: seal.id, hash: seal.hash }, submittedBy: { kind: 'person', id: THE_PERSON }, occupies: run.dir,
    changeset: { adapter: 'git', root: run.dir, repository: run.dir, branch: 'main', commit: run.tip, base: run.mainAt },
    integration: { mainAt: run.mainAt, result: run.tip, clone: run.dir, files: {}, at: AT }, judged: {}, reinspected: [],
    verdict: { run: run.id, by: { kind: 'person', id: THE_PERSON }, at: AT, how: 'Synthetic released fixture', message: null },
  } })).id
  const entry = { id, run: run.id, tip: run.tip, mainAt: run.mainAt }
  await step(entry, 'tested', { green: true, tip: entry.tip, log: '/synthetic/suite.log' })
  return entry
}

async function step(entry: AnEntry, step: string, facts: Record<string, unknown>) {
  const machine = await import('../src/server/lib/merge-state-machine.ts')
  return machine.stepAMergeEntry({ id: entry.id, workspaceId: WORKSPACE, step: step as Parameters<typeof machine.stepAMergeEntry>[0]['step'], facts, actor: PERSON })
}

async function land(entry: AnEntry) {
  await step(entry, 'landing', { mainAt: entry.mainAt })
  const landed = await step(entry, 'landed', { mainAfter: entry.tip })
  expect(landed.entry.state).toBe('merged')
  return landed
}

function dataOf(id: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, any>
}

/**
 * Every message one agent was handed, by its delivery rows, in the order they were written: about one run when `run` is
 * given, and all of them when it is not.
 */
function noticesTo(agent: string, run?: string): ANotice[] {
  const rows = t.client.sqlite.prepare(
    `SELECT r.id AS id, r.data AS data FROM message_delivery d JOIN records r ON r.id = d.message_id
      WHERE d.recipient_kind = 'agent' AND d.recipient_id = ? AND r.deleted_at IS NULL
        AND (? IS NULL OR json_extract(r.data, '$.aboutRun') = ?)
      ORDER BY r.rowid`,
  ).all(agent, run ?? null, run ?? null) as { id: string; data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as Record<string, any>
    return { id: row.id, notice: data['notice'], data }
  })
}

const kindsOf = (list: ANotice[]): unknown[] => list.map((one) => one.notice)
const sorted = (list: unknown[]): string[] => list.map(String).sort()
/** A sentence by its word key. The keys this change adds do not exist before it. */
const say = (key: string, values?: WordValues): string => sayInEnglish(key as WordKey, values)

/** The package's own three notices, which stay with the secretary that made it. A landing marks nothing, so it sends none. */
const THE_THREE = ['packageTaken', 'packageAligned', 'packageHandedBack']

/** The one notice of each kind the list holds, and that it holds one. */
function theOne(list: ANotice[], kind: string): ANotice {
  const found = list.filter((one) => one.notice === kind)
  expect(found.map((one) => one.id), `one ${kind}`).toHaveLength(1)
  return found[0]!
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'a-packages-notices-go-to-'))
  process.env.HOME = home
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  door = await import('../src/server/lib/merge-entry-door.ts')
  notices = await import('../src/server/lib/notices.ts')
  worker = await import('../src/server/lib/worker.ts')
  app = (await apiApp()).app
  // The loopback listener takes an unused port chosen by the kernel, never the live office's port.
  await app.listen({ host: '127.0.0.1', port: 0 })
  await register(MAKER, 'secretary', asThePerson())
  await register(INSPECTOR, 'inspector', asThePerson())
  await register(SUPERVISOR, 'supervisor', asAgent(MAKER), true)
  await register(MIDDLE, 'supervisor', asAgent(MAKER))
  await register(RETIRING, 'supervisor', asAgent(MIDDLE), true)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (savedHome === undefined) delete process.env.HOME
  else process.env.HOME = savedHome
  rmSync(home, { recursive: true, force: true })
})

describe("a package's notices go to the supervisor that took it", () => {
  it('hands the secretary only the three notices and the confirm ask, and the supervisor the rest', async () => {
    const run = await aRunOf(SUPERVISOR, 'A made-up run that does a whole package')
    const pkg = await aPackage('A made-up package the supervisor takes', ['A made-up point'])
    await takenAlignedAndHandedBack(pkg, run)
    // THE SUPERVISOR'S OWN MESSAGE ABOUT THE RUN STILL REACHES THE SECRETARY: only the office's and the check's lines move.
    const own = await app.inject({
      method: 'POST', url: '/api/records', headers: asAgent(SUPERVISOR),
      payload: { kind: 'message', title: 'A made-up question', data: { to: [{ kind: 'agent', id: idOf[MAKER] }], aboutRun: run.id, body: 'Made up: may I ask one thing?' } },
    })
    // NOTHING HOLDS THE SECRETARY IN THIS TEST OFFICE, so the office stores the message, routes it and answers 409
    // rather than 201. The message is stored all the same, with its delivery row to the secretary, which is read below.
    expect(own.statusCode, own.body).toBe(409)
    const ownId = String(own.json().record.id)
    await checked(run, pkg, 'released')
    const entry = await queued(run)
    await land(entry)

    const toTheMaker = noticesTo(idOf[MAKER]!, run.id)
    expect(toTheMaker.map((one) => one.id)).toContain(ownId)
    const theOffices = toTheMaker.filter((one) => one.id !== ownId)
    expect(sorted(kindsOf(theOffices))).toEqual(sorted([...THE_THREE, 'checkedAndReleased']))
    // THE ALIGN AND THE HAND-BACK WAKE THE SECRETARY, read by the rule a waiter is woken by.
    for (const kind of ['packageAligned', 'packageHandedBack']) {
      const sentBy = theOne(theOffices, kind).data['sentBy'] as ParticipantRef
      expect(isMoleOffice(sentBy), `${kind} is the office's own line`).toBe(true)
      expect(notices.whyThisWakesNoWaiter(sentBy, kind), kind).toBeNull()
    }

    // THE ANSWER TO THE ALIGN IS ABOUT NO RUN: the restatement it answers records none. It is the supervisor's only one.
    theOne(noticesTo(idOf[SUPERVISOR]!), 'packageAlignAnswered')
    const toTheSupervisor = noticesTo(idOf[SUPERVISOR]!, run.id)
    expect(kindsOf(toTheSupervisor)).toEqual(expect.arrayContaining(['releasedAndTheStarterIsTold', 'anEntryLanded']))
    // THE SEAL LINE IS HANDED TO NEITHER: its words are for the run's starter, and the supervisor is the run's own agent.
    expect(kindsOf(toTheSupervisor)).not.toContain('aRunWasSealed')
    // AND THE SEAL SAYS SO: it names no starter told, and gives the reason.
    expect(dataOf(theSealOf(run.id).id)['starterNotice']).toEqual({ because: say('delegation.seal.nobodyTold', { title: pkg.title, task: pkg.task, agent: SUPERVISOR }) })
    const landedLine = theOne(toTheSupervisor, 'anEntryLanded')
    expect(dataOf(entry.id)['told']['secretary']).toBe(landedLine.id)
    expect(landedLine.data['to']).toEqual([{ kind: 'agent', id: idOf[SUPERVISOR] }])
    expect(landedLine.data['extra']?.['forThePackage']).toEqual({ task: pkg.task, maker: idOf[MAKER], supervisor: idOf[SUPERVISOR] })
    // THE LANDING'S ANSWER NAMES WHO WAS TOLD, and that is the supervisor now.
    expect(dataOf(entry.id)['told']['says']).toContain(SUPERVISOR)
    expect(dataOf(entry.id)['told']['says']).not.toContain(MAKER)
  }, 120_000)

  it("sends the retired supervisor's lines up its own chain, and the secretary still hears only the three", async () => {
    // THE RETIRING SUPERVISOR'S STARTER IS HELD BY A SESSION, so the walk up the chain has a rung it can reach.
    const transcript = join(home, `session-${MIDDLE}.jsonl`)
    writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'Made up.' }] } })}\n`)
    const held = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title: 'A made-up session that holds the middle supervisor', origin: 'fixture', actor: PERSON, data: {
      state: 'running', runtime: 'claude-code', servingAgent: idOf[MIDDLE],
      extra: { discovered: { tool: 'claude-code', externalId: MIDDLE, logPath: transcript, resumeCommand: null, startedAt: null, entryPoint: null } },
    } }).id
    const hold = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(MIDDLE)}/hold`, headers: asThePerson(), payload: { session: held, machine: 'a-made-up-machine', runtime: 'claude-code' } })
    expect(hold.statusCode, hold.body).toBe(201)
    expect(worker.whyThisAgentCannotBeReached(idOf[MIDDLE]!, WORKSPACE), 'the middle supervisor cannot be reached').toBeNull()

    const run = await aRunOf(RETIRING, 'A made-up run whose supervisor retires')
    const pkg = await aPackage('A made-up package whose supervisor retires', ['A made-up point'])
    await takenAlignedAndHandedBack(pkg, run)
    t.client.sqlite.prepare('UPDATE agents SET retired = 1, retired_because = ? WHERE id = ?').run('Made up: its piece of work is done.', idOf[RETIRING])
    await checked(run, pkg, 'released')
    const entry = await queued(run)
    await land(entry)

    expect(sorted(kindsOf(noticesTo(idOf[MAKER]!, run.id)))).toEqual(sorted(THE_THREE))
    const landedLine = theOne(noticesTo(idOf[RETIRING]!, run.id), 'anEntryLanded')
    expect(landedLine.data['to']).toEqual([{ kind: 'agent', id: idOf[RETIRING] }])
    expect(landedLine.data['extra']?.['forThePackage']).toEqual({ task: pkg.task, maker: idOf[MAKER], supervisor: idOf[RETIRING] })
    const routed = (landedLine.data['routed'] ?? []) as { for: ParticipantRef; to: ParticipantRef | null }[]
    expect(routed.map((one) => ({ for: one.for, to: one.to }))).toEqual([{ for: { kind: 'agent', id: idOf[RETIRING] }, to: { kind: 'agent', id: idOf[MIDDLE] } }])
    expect(noticesTo(idOf[MIDDLE]!, run.id).map((one) => one.id)).toContain(landedLine.id)
  }, 120_000)

  it('hands the supervisor, not the secretary, the refusal meant for the run starter', async () => {
    const run = await aRunOf(SUPERVISOR, 'A made-up run that is refused')
    const pkg = await aPackage('A made-up package whose run is refused', ['A made-up point'])
    await takenAlignedAndHandedBack(pkg, run)
    await checked(run, pkg, 'refused')

    expect(kindsOf(noticesTo(idOf[MAKER]!, run.id))).not.toContain('aRefusalForTheStarter')
    const toTheSupervisor = noticesTo(idOf[SUPERVISOR]!, run.id)
    theOne(toTheSupervisor, 'refused')
    const forTheStarter = theOne(toTheSupervisor, 'aRefusalForTheStarter')
    expect(forTheStarter.data['extra']?.['forThePackage']).toEqual({ task: pkg.task, maker: idOf[MAKER], supervisor: idOf[SUPERVISOR] })
  }, 120_000)

  it("keeps the check's lines with the secretary when the supervisor it started retires and the check refuses", async () => {
    await register(RETIRES_UNDER_THE_MAKER, 'supervisor', asAgent(MAKER), true)
    const run = await aRunOf(RETIRES_UNDER_THE_MAKER, 'A made-up run whose supervisor retires and is refused')
    const pkg = await aPackage('A made-up package whose retired supervisor is refused', ['A made-up point'])
    await takenAlignedAndHandedBack(pkg, run)
    t.client.sqlite.prepare('UPDATE agents SET retired = 1, retired_because = ? WHERE id = ?').run('Made up: its piece of work is done.', idOf[RETIRES_UNDER_THE_MAKER])
    await checked(run, pkg, 'refused')

    // THE CHECK'S OWN LINES STAY WITH THE SECRETARY: the check writes them to the run's starter, the reach check passed
    // on it, and the routing would not take the check's lines up the retired supervisor's chain.
    const toTheMaker = noticesTo(idOf[MAKER]!, run.id)
    expect(sorted(kindsOf(toTheMaker))).toEqual(sorted(['packageTaken', 'packageAligned', 'packageHandedBack', 'refused', 'aRefusalForTheStarter']))
    for (const kind of ['refused', 'aRefusalForTheStarter']) {
      const line = theOne(toTheMaker, kind)
      expect(line.data['to'], kind).toEqual([{ kind: 'agent', id: idOf[MAKER] }])
      expect(line.data['extra']?.['forThePackage'], kind).toBeUndefined()
    }
    expect(kindsOf(noticesTo(idOf[RETIRES_UNDER_THE_MAKER]!, run.id))).toEqual([])
    // THE OFFICE'S ONLY LINE ABOUT A REFUSED RUN IS THE SEAL LINE. The redirect would hand it to the retired supervisor,
    // whose run it is, so it is written to nobody, and the seal says why.
    expect(dataOf(theSealOf(run.id).id)['starterNotice']).toEqual({ because: say('delegation.seal.nobodyTold', { title: pkg.title, task: pkg.task, agent: RETIRES_UNDER_THE_MAKER }) })
  }, 120_000)
})
