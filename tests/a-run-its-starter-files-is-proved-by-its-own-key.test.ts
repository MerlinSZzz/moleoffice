// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN ITS STARTER FILES BY HAND IS PROVED BY ITS OWN KEY, and by no other key.
 *
 * Everything here is made up: the agents, the runs, the packages, their points and every word in them. No model,
 * provider or real office is used. `freshDb` makes a throwaway database, and the keys written beside it are random bytes.
 *
 * A run that stops at a login limit is continued by hand: its agent's starter files a new running run for the agent
 * through POST /api/records, with the starter's own key, derived from the run it continues. The office mints that run a
 * key. Before this file, that key held the run's session header but proved no run of its own, because the mint stored
 * nothing that said the starter's key made it, so every door that reads a run from its key refused it or named no run.
 * Now the create and the mint store the key that proved them, and the run's own key proves the run.
 *
 * WHAT IS PROVED, each case on its own:
 *
 *   1. The new run's own key proves the new run: the take notice names it, and the hand-back is taken and stores it.
 *   2. No other key proves the new run. The old run's key, the starter's run key and another agent's run key each prove
 *      their own run, and an agent's own key proves none. Each of the run keys, the starter's own key and the other
 *      agent's own key is refused when its session header names the new run, with nothing taken. The new run's agent's
 *      own key holds the header, because the run serves that agent, and still proves no run.
 *   3. A later run that copies the new run's key id into its own data is not held by that key: the key naming the later
 *      run in its header is refused, with nothing taken, and the key still proves only the new run.
 *   4. An agent above the run's agent in its chain of starters, but not its registered starter, may file a running run
 *      for it, and gets no run key: nothing it stores says a key proved the run. An agent outside that chain is refused
 *      at the door, and no run and no key are written.
 *   5. What is stored: the create and the mint, on both ledgers, hold the starter's key as the key that proved them, in
 *      the one shape the office already stores. The link rows the create makes, every later write, and a note the
 *      starter files under the same headers hold nothing. The runs the office filed hold the office's own key under the
 *      message worker's name on every row, as such a filing always has, and never the starter's.
 *
 * Every expected sentence is read from the exported function or constant that makes it.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ACTOR_HEADERS } from '../src/shared/request-headers.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** Made-up keys, written beside the throwaway database before the server is built. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const WORKSPACE = 'default'
/** The starter's own starter: above the worker in its chain of starters, and not its registered starter. */
const TOP = 'tops-t'
const STARTER = 'starts-s'
const WORKER = 'works-w'
const OTHER = 'other-o'
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }

interface ARun { id: string; key: string; handle: string }
interface APackage { task: string; points: string[] }

let t: TestDb
let app: FastifyInstance
const idOf: Record<string, string> = {}
const keyOf: Record<string, string> = {}
let starterRun: ARun
let oldRun: ARun
let otherRun: ARun
let newRun: ARun
/** The new run's change rows as they stood right after it was filed, before any other write touched it. */
let rowsAtFiling: AChangeRow[]

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
  [ACTOR_HEADERS.session]: run.id, 'x-mole-office-key': run.key,
})
/** The same caller with its session header naming another run. */
const naming = (headers: Record<string, string>, run: ARun): Record<string, string> => ({ ...headers, [ACTOR_HEADERS.session]: run.id })

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

/** A running run of WORKER filed by hand through the records door, as a run is continued after a login limit. */
function aRunFiledForTheWorker(title: string, headers: Record<string, string>) {
  return app.inject({
    method: 'POST', url: '/api/records', headers,
    payload: {
      kind: 'session', title,
      data: { state: 'running', runtime: 'claude-code', servingAgent: WORKER, servingAgentId: idOf[WORKER], parentAttachment: starterRun.id, doing: title },
      links: [{ type: 'derived_from', toId: oldRun.id }],
    },
  })
}

/** An inside package under a parent task the starter answers for, with one backlog item as its point. */
async function aPackage(title: string): Promise<APackage> {
  const decision = await file('decision', `${title}: the decision above it`)
  const point = await file('backlog_item', `${title}: its point`, { line: 'a-made-up-line', number: title, placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo' })
  const parent = await file('task', `${title}: the parent`, {}, asAgent(STARTER))
  const moduleId = await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))
  const parentPackaged = await post(parent, 'package', { ...WORDS, moduleIds: [moduleId], parent: { kind: 'decision', id: decision }, pointIds: [point] }, asThePerson())
  expect(parentPackaged.statusCode, parentPackaged.body).toBe(201)
  const task = await file('task', title)
  const packaged = await post(task, 'package', { ...WORDS, moduleIds: [moduleId], parent: { kind: 'task', id: parent }, pointIds: [point] }, asThePerson())
  expect(packaged.statusCode, packaged.body).toBe(201)
  return { task, points: [point] }
}

function packageOf(task: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(task) as { data: string }
  return (JSON.parse(row.data) as Record<string, any>)['package'] as Record<string, any>
}

/** Every take notice the office wrote, oldest first: the run each names, as the take's key proved it. */
function theTakeNotices(): { aboutRun: unknown }[] {
  return (t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'packageTaken' ORDER BY rowid").all() as { data: string }[])
    .map((row) => ({ aboutRun: (JSON.parse(row.data) as Record<string, unknown>)['aboutRun'] ?? null }))
}

/** Takes a fresh package inside with `headers`, and answers the run the one new take notice names. */
async function theRunATakeNames(headers: Record<string, string>, title: string): Promise<unknown> {
  const pkg = await aPackage(title)
  const before = theTakeNotices().length
  const taken = await post(pkg.task, 'take-inside', {}, headers)
  expect(taken.statusCode, taken.body).toBe(201)
  const after = theTakeNotices()
  expect(after.length).toBe(before + 1)
  return after.at(-1)!.aboutRun
}

/** A take with `headers` that is refused at the session header, with nothing taken and nobody told. */
async function aTakeRefusedForNaming(headers: Record<string, string>, named: ARun, title: string): Promise<string> {
  const pkg = await aPackage(title)
  const before = theTakeNotices().length
  const refused = await post(pkg.task, 'take-inside', {}, headers)
  expect(refused.statusCode, refused.body).toBe(403)
  const error = String(refused.json().error)
  expect(error).toContain(ACTOR_HEADERS.session)
  expect(error).toContain(`"${named.id}"`)
  expect(packageOf(pkg.task)['takenInside']).toBeUndefined()
  expect(theTakeNotices().length).toBe(before)
  return error
}

interface AChangeRow { op: string; holder: unknown }
function changeRowsOf(record: string): AChangeRow[] {
  return (t.client.sqlite.prepare('SELECT op, proved_holder FROM changes WHERE record_id = ? ORDER BY rowid').all(record) as { op: string; proved_holder: string | null }[])
    .map((row) => ({ op: row.op, holder: row.proved_holder === null ? null : JSON.parse(row.proved_holder) }))
}
function revisionHoldersOf(record: string): { seq: number; holder: unknown }[] {
  return (t.client.sqlite.prepare('SELECT seq, proved_holder FROM revisions WHERE record_id = ? ORDER BY seq').all(record) as { seq: number; proved_holder: string | null }[])
    .map((row) => ({ seq: row.seq, holder: row.proved_holder === null ? null : JSON.parse(row.proved_holder) }))
}
const runs = (): number => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
const heldKeys = (): number => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM held_keys').get() as { n: number }).n
const runKeyIdOf = (run: string): unknown => ((JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as Record<string, any>)['extra'] ?? {})['runKeyId']

/** The key that proved a starter's filing, in the shape the office stores for a key that proved another name. */
const theStartersKey = () => ({ id: idOf[STARTER], how: 'an-agent-key', claimed: STARTER })

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  await register(TOP, 'supervisor', asThePerson())
  await register(STARTER, 'supervisor', asAgent(TOP))
  await register(WORKER, 'worker', asAgent(STARTER))
  await register(OTHER, 'worker', asAgent(STARTER))
  starterRun = await aRunOf(STARTER)
  oldRun = await aRunOf(WORKER)
  otherRun = await aRunOf(OTHER)
  // THE CONTINUED RUN: the starter's own name and key, its own run in the session header, as a hand round is filed.
  const filed = await aRunFiledForTheWorker('A made-up run continued after a login limit', naming(asAgent(STARTER), starterRun))
  expect(filed.statusCode, filed.body).toBe(201)
  const key = String(filed.json().runKey?.key ?? '')
  expect(key, 'the starter was given no run key').not.toBe('')
  newRun = { id: String(filed.json().record.id), key, handle: WORKER }
  rowsAtFiling = changeRowsOf(newRun.id)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe("the new run's own key proves the new run", () => {
  it('names the new run in the take notice', async () => {
    expect(await theRunATakeNames(asTheRun(newRun), 'A made-up package the new run takes')).toBe(newRun.id)
  }, 60_000)

  it('takes the hand-back and stores the new run on it', async () => {
    const pkg = await aPackage('A made-up package the new run hands back')
    for (const [door, payload, headers] of [
      ['take-inside', {}, asTheRun(newRun)],
      ['align', { restated: 'I will do the made-up work.', plan: 'Do it.' }, asTheRun(newRun)],
      ['align-answer', { answer: 'aligned', words: 'Yes.' }, asThePerson()],
    ] as const) {
      const reply = await post(pkg.task, door, payload, headers)
      expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
    }
    const handed = await post(pkg.task, 'hand-back', { points: [{ pointId: pkg.points[0]!, outcome: 'done', words: 'Built it.' }] }, asTheRun(newRun))
    expect(handed.statusCode, handed.body).toBe(201)
    expect(packageOf(pkg.task)['handedBack'].at(-1).run).toBe(newRun.id)
  }, 60_000)
})

describe('no other key proves the new run', () => {
  it('lets each other key prove only its own run, or none', async () => {
    const others: [string, Record<string, string>, string | null][] = [
      ['the old run', asTheRun(oldRun), oldRun.id],
      ["the starter's run", asTheRun(starterRun), starterRun.id],
      ["another agent's run", asTheRun(otherRun), otherRun.id],
      ["the run's agent's own key", asAgent(WORKER), null],
      ["the starter's own key", asAgent(STARTER), null],
      ["the other agent's own key", asAgent(OTHER), null],
    ]
    for (const [who, headers, proves] of others) {
      expect(await theRunATakeNames(headers, `A made-up package ${who} takes`), who).toBe(proves)
    }
  }, 120_000)

  it("refuses each of them when its session header names the new run, except the run's own agent's key, which proves no run", async () => {
    for (const [who, headers] of [
      ['the old run', asTheRun(oldRun)],
      ["the starter's run", asTheRun(starterRun)],
      ["another agent's run", asTheRun(otherRun)],
      ["the starter's own key", asAgent(STARTER)],
      ["the other agent's own key", asAgent(OTHER)],
    ] as const) {
      await aTakeRefusedForNaming(naming(headers, newRun), newRun, `A made-up package ${who} may not take as the new run`)
    }
    expect(await theRunATakeNames(naming(asAgent(WORKER), newRun), "A made-up package the run's agent takes as the new run")).toBeNull()
  }, 120_000)
})

describe("a run that copies the new run's key id", () => {
  it('is not held by that key, and the key still proves only the new run', async () => {
    const later = await aRunFiledForTheWorker('A made-up later run that copies a key id', asTheRun(starterRun))
    expect(later.statusCode, later.body).toBe(201)
    const laterRun: ARun = { id: String(later.json().record.id), key: String(later.json().runKey?.key ?? ''), handle: WORKER }
    t.api.patchRecord(laterRun.id, { dataPatch: { extra: { runKeyId: runKeyIdOf(newRun.id) } } }, { type: 'agent', id: STARTER })
    expect(runKeyIdOf(laterRun.id)).toBe(runKeyIdOf(newRun.id))

    const error = await aTakeRefusedForNaming(naming(asTheRun(newRun), laterRun), laterRun, 'A made-up package the copied key may not take')
    expect(error).toContain(newRun.id)
    expect(await theRunATakeNames(asTheRun(newRun), 'A made-up package the new run takes after the copy')).toBe(newRun.id)
  }, 120_000)
})

describe('an agent that is not the starter', () => {
  it('gets no run key for a run it files for an agent below it, and nothing says a key proved that run', async () => {
    const keysBefore = heldKeys()
    const filed = await aRunFiledForTheWorker("A made-up run filed by the starter's own starter", asAgent(TOP))
    expect(filed.statusCode, filed.body).toBe(201)
    expect(filed.json().runKey).toBeUndefined()
    const run = String(filed.json().record.id)
    expect(heldKeys()).toBe(keysBefore)
    expect(runKeyIdOf(run)).toBeUndefined()
    expect(revisionHoldersOf(run).map((one) => one.holder)).toEqual(revisionHoldersOf(run).map(() => null))
    expect(changeRowsOf(run).map((one) => one.holder)).toEqual(changeRowsOf(run).map(() => null))
  }, 60_000)

  it('is refused a run for an agent outside its chain, with no run and no key written', async () => {
    const keysBefore = heldKeys()
    const runsBefore = runs()
    const refused = await aRunFiledForTheWorker('A made-up run filed by an agent beside the worker', asAgent(OTHER))
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.json().runKey).toBeUndefined()
    expect(heldKeys()).toBe(keysBefore)
    expect(runs()).toBe(runsBefore)
  }, 60_000)
})

describe('what is stored', () => {
  it("stores the starter's key on the create and the mint of both ledgers, and on nothing else", async () => {
    // THE TWO REVISIONS THE CREATE DOOR WROTE: the create, and the mint that binds the key.
    expect(revisionHoldersOf(newRun.id).slice(0, 2)).toEqual([{ seq: 1, holder: theStartersKey() }, { seq: 2, holder: theStartersKey() }])
    // THE SAME TWO WRITES' CHANGE ROWS, and the link rows of the same create, which hold nothing.
    expect(rowsAtFiling[0]!.op).toBe('create')
    expect(rowsAtFiling.some((row) => row.op === 'link')).toBe(true)
    const minted = rowsAtFiling.filter((row) => row.op !== 'create' && row.op !== 'link')
    expect(minted.length).toBeGreaterThan(0)
    expect(rowsAtFiling).toEqual(rowsAtFiling.map((row) => ({ op: row.op, holder: row.op === 'link' ? null : theStartersKey() })))

    // A LATER WRITE, by the run's own key, holds nothing, on either ledger.
    const rowsBefore = changeRowsOf(newRun.id).length
    const patched = await app.inject({ method: 'PATCH', url: `/api/records/${newRun.id}`, headers: asTheRun(newRun), payload: { dataPatch: { doing: 'Made-up later work.' } } })
    expect(patched.statusCode, patched.body).toBe(200)
    const later = changeRowsOf(newRun.id).slice(rowsBefore)
    expect(later.length).toBeGreaterThan(0)
    expect(later.map((row) => row.holder)).toEqual(later.map(() => null))
    expect(revisionHoldersOf(newRun.id).slice(2).map((one) => one.holder)).toEqual(revisionHoldersOf(newRun.id).slice(2).map(() => null))

    // A NOTE THE STARTER FILES UNDER THE SAME HEADERS holds nothing.
    const note = await file('note', 'A made-up note the starter files', {}, naming(asAgent(STARTER), starterRun))
    expect(revisionHoldersOf(note).map((one) => one.holder)).toEqual(revisionHoldersOf(note).map(() => null))
    expect(changeRowsOf(note).map((one) => one.holder)).toEqual(changeRowsOf(note).map(() => null))
    // THE RUNS THE OFFICE FILED hold what such a filing always held: the office's own key, under the message worker's
    // name the headers gave, on every row. Never the starter's key.
    for (const record of [starterRun.id, oldRun.id, otherRun.id]) {
      const holders = [...revisionHoldersOf(record), ...changeRowsOf(record)].map((one) => one.holder)
      expect(holders.length).toBeGreaterThan(0)
      expect(holders, record).toEqual(holders.map(() => expect.objectContaining({ how: 'the-office-key', claimed: THE_MESSAGE_WORKER_ID })))
    }
  }, 60_000)
})
