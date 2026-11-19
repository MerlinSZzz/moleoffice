// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * The worker's merge slot, its endings and its process groups.
 * Real sibling runs prove that stopping one leaves the other's group alive. The take-back case
 * holds its recorded group wiring. Quality cases share a seeded Git tree and use a tool that
 * exits once its ledger registration exists. Every started group is kept for cleanup.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import * as processGroups from '../src/worker/runtimes/os.ts'
import { onePass, waitAfterAPass, type PassReport, type WorkerSettings } from '../src/worker/index.ts'
import { MERGE_STATE_SPECS } from '../src/shared/merge-queue.ts'
import { clockStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

let FAKE_MERGE_TOOL: string
const SOURCE_MERGE_TOOL = fileURLToPath(new URL('./fake-merge-tool.mjs', import.meta.url))
const FAKE_RUNTIME = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const THE_WORKER = 'mole-office/the-message-worker'

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
let queue: typeof import('../src/server/lib/merge-queue.ts')
const made: string[] = []
/** The agent runs and the merge tool runs this file's worker watches, carried between passes as the worker does. */
const watching: Parameters<typeof onePass>[1] = []
const merges: NonNullable<Parameters<typeof onePass>[2]> = []
/**
 * EVERY LIST OF MERGE TOOL RUNS THIS FILE MAKES, so `afterAll` stops whatever is still running in any of
 * them. A test that fails between taking a run out of one list and stopping it would otherwise leave a
 * synthetic tool waiting for ever: a mutation run of this file did exactly that once.
 */
const everyMergeList: (typeof merges)[] = [merges]

const as = (type: 'agent' | 'human', id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asStarter = as('agent', 'ma-starter')
const asSubmitter = as('agent', 'ma-worker')
const asTheOffice = as('agent', THE_WORKER)

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: (r.body === '' ? {} : r.json()) as Record<string, any>, raw: r.body }
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `merge-adapter-${prefix}-`))
  made.push(dir)
  return dir
}

let seedTree: string | undefined
/** Each submission copies one seeded repository and adds its own distinct commit. */
function tree(): string {
  if (seedTree === undefined) {
    seedTree = scratch('seed')
    git(seedTree, 'init', '-q', '-b', 'main')
    git(seedTree, 'config', 'user.email', 'fixture@example.invalid')
    git(seedTree, 'config', 'user.name', 'Synthetic merge adapter fixture')
    mkdirSync(join(seedTree, 'work'), { recursive: true })
    writeFileSync(join(seedTree, 'work', 'a.txt'), 'before\n')
    git(seedTree, 'add', '.')
    git(seedTree, 'commit', '-q', '-m', 'Synthetic baseline')
  }
  const dir = scratch('tree')
  cpSync(seedTree, dir, { recursive: true })
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), `submitted from ${basename(dir)}\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic submission')
  return dir
}

/**
 * Finish a run, which seals it. A second finish writes a second seal. The submission is said to be git
 * work, so the fixture hook for the fake agent runtime (`supplyRuntimeSubmissions`) leaves it alone.
 */
async function finish(run: string): Promise<void> {
  const r = await call('PATCH', `/api/records/${run}`, asSubmitter, { dataPatch: { state: 'finished', submission: { kind: 'git' } } })
  expect(r.status, r.raw).toBe(200)
}

/** A finished, sealed run of `ma-worker` in a fresh tree. */
async function aSealedRun(): Promise<string> {
  const dir = tree()
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic merge adapter run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'ma-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'ma-worker', cutFrom: 'main', workingDirectory: dir },
  }).id
  await finish(run)
  return run
}

/** Submit a run's git changeset. The branch name tells the synthetic tool how to behave. */
async function submit(run: string, branch: string): Promise<{ id: string; body: Record<string, any> }> {
  const r = await call('POST', '/api/merge-queue', asSubmitter, { run, changeset: { adapter: 'git', repository: 'fixture-main', branch } })
  expect(r.status, r.raw).toBe(201)
  return { id: String(r.body['entry'].id), body: r.body }
}

async function entry(id: string): Promise<Record<string, any>> {
  const r = await call('GET', `/api/merge-queue/${id}`, asPerson)
  expect(r.status, r.raw).toBe(200)
  return r.body['entry'] as Record<string, any>
}

async function theWork(): Promise<{ wanted: Record<string, any>[]; going: Record<string, any>[] }> {
  const r = await call('GET', '/api/worker/merges', asTheOffice)
  expect(r.status, r.raw).toBe(200)
  return { wanted: r.body['wanted'], going: r.body['going'] }
}

/**
 * TAKE AN ENTRY OUT OF THE QUEUE ONCE ITS CASE IS OVER. A run that ended without moving its entry has the
 * entry marked again, so an entry left where a case left it would be started again by a later case's pass
 * and take the merge slot from the entry that case is about.
 */
async function withdraw(id: string, because: string): Promise<void> {
  const r = await call('POST', `/api/merge-queue/${id}/withdraw`, asSubmitter, { because })
  expect(r.status, r.raw).toBe(200)
}

async function record(id: string): Promise<Record<string, any>> {
  return (await call('GET', `/api/records/${id}`, asPerson)).body['record'].data as Record<string, any>
}

async function processRowOf(session: string): Promise<Record<string, any>> {
  const r = await call('GET', '/api/resources?includeReleased=true', asPerson)
  return one((r.body['resources'] as Record<string, any>[]).filter((row) => row.sessionRecordId === session && row.type === 'process'), `the ledger row of ${session}`)
}

/** Run passes until something is true, collecting every report, or fail saying it never was. */
async function passUntil(what: string, done: () => Promise<boolean>, use: WorkerSettings = settings, list = merges): Promise<PassReport[]> {
  const reports: PassReport[] = []
  const deadline = Date.now() + 20_000
  for (;;) {
    reports.push(await onePass(use, watching, list))
    if (await done()) return reports
    if (Date.now() >= deadline) throw new Error(`${what} did not happen within 20 seconds. Last pass: ${JSON.stringify(reports.at(-1)?.merges)}`)
    await new Promise((go) => setTimeout(go, 100))
  }
}

/**
 * THE FIRST WHOLE LINE A STARTED TOOL WROTE TO ITS LOG, waited for. The pass that starts the tool returns
 * as soon as the process is started, and the tool writes this line only once node has loaded it, which
 * under load comes later. Fails saying what the log held if the line never comes.
 */
async function firstLineOf(log: string): Promise<string> {
  const deadline = Date.now() + 20_000
  for (;;) {
    const said = readFileSync(log, 'utf8')
    const end = said.indexOf('\n')
    if (end !== -1) return said.slice(0, end)
    if (Date.now() >= deadline) throw new Error(`The merge tool wrote no whole first line to ${log} within 20 seconds. The log held: ${JSON.stringify(said)}`)
    await new Promise((go) => setTimeout(go, 50))
  }
}

const started = (reports: PassReport[]) => reports.flatMap((r) => r.merges.started)
const ended = (reports: PassReport[]) => reports.flatMap((r) => r.merges.ended)
const stillGoing = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  queue = await import('../src/server/lib/merge-queue.ts')
  for (const [by, handle, workArea] of [
    [asPerson, 'ma-starter', undefined],
    [asStarter, 'ma-worker', ['work']],
  ] as const) {
    const r = await call('POST', '/api/agents/started', by, { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) })
    expect(r.status, r.raw).toBe(201)
  }
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-merge-adapter-'))
  FAKE_MERGE_TOOL = join(scratch('tool'), 'registered-tool.mjs')
  const source = readFileSync(SOURCE_MERGE_TOOL, 'utf8')
    .replace("'../src/config/merge-tool.mjs'", JSON.stringify(join(CHECKOUT, 'src/config/merge-tool.mjs')))
    .replace('await new Promise((go) => setTimeout(go, 400))', `await (async () => {
      const deadline = Date.now() + 20_000
      for (;;) {
        const answer = await fetch(api + '/api/resources?sessionRecordId=' + value('--session'), { headers })
        const { resources } = await answer.json()
        if (resources.some(row => row.type === 'process' && row.key === String(process.pid))) return
        if (Date.now() >= deadline) throw new Error('The synthetic tool was never registered.')
        await new Promise(go => setTimeout(go, 10))
      }
    })()`)
  writeFileSync(FAKE_MERGE_TOOL, source)
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 1,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_MERGE_TOOL: FAKE_MERGE_TOOL, MOLE_OFFICE_FAKE_RUNTIME: FAKE_RUNTIME },
  }
}, 60_000)

afterAll(async () => {
  for (const list of everyMergeList) for (const run of list) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle)
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The merge adapter test ended.')
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
  if (outputs !== undefined) rmSync(outputs, { recursive: true, force: true })
}, 30_000)

// ============================================================================ 1. the mark

describe('the server asks for the merge tool by a mark on the entry', () => {
  it('marks a submitted entry, lists it for the worker, and reading the list writes nothing', async () => {
    const { id } = await submit(await aSealedRun(), 'synthetic-moves')
    const before = JSON.stringify(t.api.getRecord(id)!.data)
    expect((await entry(id)).toolWanted).toEqual({ since: expect.any(String) })
    const work = await theWork()
    expect(work.wanted.map((w) => w.entry)).toContain(id)
    expect(work.wanted.find((w) => w.entry === id)).toMatchObject({ state: 'submitted', adapter: 'git' })
    expect(work.going).toEqual([])
    expect(JSON.stringify(t.api.getRecord(id)!.data)).toBe(before)

    // STANDING IN FOR THE STATE MACHINE: the queue's one state writer, called directly.
    const office = { type: 'agent' as const, id: THE_WORKER }
    queue.moveEntry({ id, to: 'pinned', actor: office })
    expect((await entry(id)).toolWanted).toBeNull()
    expect((await theWork()).wanted.map((w) => w.entry)).not.toContain(id)
    queue.moveEntry({ id, to: 'judged', actor: office })
    // THE TOOL TAKES THE LANE FROM JUDGED (its `integrating` step, piece P7), so a judged entry asks for it.
    expect((await entry(id)).toolWanted).toEqual({ since: expect.any(String) })
    expect((await theWork()).wanted.find((w) => w.entry === id)).toMatchObject({ state: 'judged' })
    queue.moveEntry({ id, to: 'integrating', actor: office })
    expect((await entry(id)).toolWanted).toEqual({ since: expect.any(String) })
    expect((await theWork()).wanted.find((w) => w.entry === id)).toMatchObject({ state: 'integrating' })

    // A JUDGED ENTRY WHOSE LANE ANOTHER ENTRY HOLDS keeps its mark, and is not handed to the worker until
    // the lane is let go: started now, its first move would be refused and the start would take the mark.
    const waiting = (await submit(await aSealedRun(), 'synthetic-waits-for-the-lane')).id
    queue.moveEntry({ id: waiting, to: 'pinned', actor: office })
    queue.moveEntry({ id: waiting, to: 'judged', actor: office })
    expect((await entry(waiting)).toolWanted).toEqual({ since: expect.any(String) })
    expect((await theWork()).wanted.map((w) => w.entry)).not.toContain(waiting)

    // A WITHDRAWN ENTRY ASKS FOR NOTHING, and frees the lane for the rest of this file.
    const withdrawn = await call('POST', `/api/merge-queue/${id}/withdraw`, asSubmitter, { because: 'Synthetic: the mark test is done with it.' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    expect(withdrawn.body['entry'].toolWanted).toBeNull()
    expect((await theWork()).wanted.map((w) => w.entry)).not.toContain(id)
    // THE LANE IS LET GO, so the judged entry that waited for it is handed out now, on the mark it kept.
    expect((await theWork()).wanted.find((w) => w.entry === waiting)).toMatchObject({ state: 'judged' })
    const alsoWithdrawn = await call('POST', `/api/merge-queue/${waiting}/withdraw`, asSubmitter, { because: 'Synthetic: the lane test is done with it.' })
    expect(alsoWithdrawn.status, alsoWithdrawn.raw).toBe(200)
  })
})

// ============================================================================ 2 and 3. start and end

describe('the worker starts the merge tool in a slot of its own', () => {
  let id = ''
  let session = ''

  it('holds a marked entry with a sentence, and starts and files nothing, while the checkout has no merge tool', async () => {
    id = (await submit(await aSealedRun(), 'synthetic-ends-well')).id
    // A CHECKOUT WITH NO tools/the-merger.mjs, and no synthetic tool named: the state of every checkout
    // until piece P8 lands. An empty scratch folder rather than this checkout, so this stays true after it does.
    const bare = realpathSync(scratch('no-merge-tool'))
    const { MOLE_OFFICE_FAKE_MERGE_TOOL: _named, ...withoutTheFake } = settings.env
    const sessionsBefore = (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
    const pass = await onePass({ ...settings, checkout: bare, env: withoutTheFake }, watching, merges)
    expect(pass.merges.started).toEqual([])
    expect(one(pass.merges.held.filter((h) => h.entry === id), 'the entry held').because).toBe(
      `The merge tool ${join(bare, 'tools/the-merger.mjs')} is not in this checkout, so nothing was started for merge entry ${id}, and nothing else was started in its place.`,
    )
    expect(merges).toEqual([])
    expect((t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n).toBe(sessionsBefore)
    const read = await entry(id)
    expect(read.tool).toBeNull()
    expect(read.toolWanted).toEqual({ since: expect.any(String) })
  })

  it('starts the tool for a marked entry even when no agent run may start', async () => {
    const pass = await onePass({ ...settings, runs: 0 }, watching, merges)
    const mine = one(pass.merges.started.filter((s) => s.entry === id), 'the merge tool run that was started')
    session = mine.session

    const data = await record(session)
    expect(data['runtime']).toBe('merge-tool')
    expect(data['startedByMoleOffice']).toBe(true)
    expect(data['servingAgent']).toBeUndefined()
    expect(data['extra']).toMatchObject({ purpose: 'merge', mergeEntry: id, fakeMergeTool: FAKE_MERGE_TOOL })

    const read = await entry(id)
    expect(read.tool).toMatchObject({ session })
    expect(read.toolWanted).toBeNull()
    const work = await theWork()
    expect(work.wanted.map((w) => w.entry)).not.toContain(id)
    expect(one(work.going.filter((g) => g.session === session), 'the run going').pgid).toEqual(expect.any(Number))

    const row = await processRowOf(session)
    expect(row.startedByTheProduct).toBe(true)

    const args = (JSON.parse(await firstLineOf(read.tool.log)) as { args: string[] }).args
    expect(args).toEqual(['--entry', id, '--session', session, '--api', api, '--workspace', 'default'])
  })

  it("puts the tool's ending on the entry and on its own record, releases its row, and starts it again while the entry has not moved, until the third run bounces it", async () => {
    const reports = await passUntil('the merge tool ending', async () => typeof (await entry(id)).tool.endedAt === 'string')
    expect(ended(reports).map((e) => e.session)).toContain(session)
    const read = await entry(id)
    expect(read.tool.reason).toContain(`Synthetic merge tool read merge entry ${id}`)
    const data = await record(session)
    expect(data['state']).toBe('finished')
    expect(data['doing']).toBe(read.tool.reason)
    expect((await processRowOf(session)).releasedAt).toBeTruthy()

    // THE RUN ENDED AND THE ENTRY IS STILL SUBMITTED, so the office asks for its tool again (issue 6).
    expect(read.state).toBe('submitted')
    expect(read.toolWanted).toEqual({ since: expect.any(String) })
    expect(read.machine.stalls).toMatchObject({ runs: 1 })
    expect((await theWork()).wanted.map((w) => w.entry)).toContain(id)

    // THE WORKER STARTS IT AGAIN, and after the third run that ends in place the entry bounces with that run's words.
    const more = await passUntil('the entry bouncing as stalled', async () => (await entry(id)).state === 'bounced')
    const again = started(more).filter((s) => s.entry === id)
    expect(again).toHaveLength(2)
    const bounced = await entry(id)
    expect(bounced.machine.bounced).toMatchObject({ reason: 'stalled', files: [] })
    expect(bounced.machine.bounced.says).toContain(`Synthetic merge tool read merge entry ${id}, which is submitted, and merged nothing.`)
    expect(bounced.tool.session).toBe(again.at(-1)!.session)
    expect(bounced.toolWanted).toBeNull()

    const quiet = await passUntil('the last run closed', async () => merges.length === 0)
    expect(quiet.flatMap((r) => r.merges.started)).toEqual([])
    expect((await onePass(settings, watching, merges)).merges.started).toEqual([])
  })

  it('records a tool that did not say how it ended as a failure, never as a success, and asks for it again', async () => {
    const silent = (await submit(await aSealedRun(), 'synthetic-silent')).id
    await passUntil('the silent tool ending', async () => typeof (await entry(silent)).tool?.endedAt === 'string')
    const read = await entry(silent)
    expect(read.tool.reason).toContain('The merge tool ended without saying how it ended')
    expect(read.tool.reason).toContain('Synthetic merge tool exiting without an ending line')
    expect((await record(read.tool.session))['state']).toBe('crashed')
    expect(read.toolWanted).toEqual({ since: expect.any(String) })
    expect(read.machine.stalls).toMatchObject({ runs: 1 })
    // THE PASS THAT CLOSED THE RUN READ ITS LIST BEFORE THE ENDING, so nothing is started yet; the next pass would.
    expect(merges).toEqual([])
    await withdraw(silent, 'Synthetic: the silent case is over.')
  })
})

// ============================================================================ 4 and 5. one slot, and a stop press

describe('one merge tool at a time, and never in the way of an agent run', () => {
  let first = ''
  let second = ''
  let firstSession = ''

  it('holds a second marked entry while the slot is taken, while an agent run still starts', async () => {
    first = (await submit(await aSealedRun(), 'synthetic-hangs-first')).id
    second = (await submit(await aSealedRun(), 'synthetic-ends-well-second')).id
    // THE SECOND IS JUDGED, so it waits for the merge slot: a submitted one would be pinned beside it in the pin slot,
    // which the next section is about. STANDING IN FOR THE STATE MACHINE: the queue's one state writer.
    queue.moveEntry({ id: second, to: 'pinned', actor: { type: 'agent', id: THE_WORKER } })
    queue.moveEntry({ id: second, to: 'judged', actor: { type: 'agent', id: THE_WORKER } })
    const pass = await onePass(settings, watching, merges)
    firstSession = one(pass.merges.started.filter((s) => s.entry === first), 'the first entry starting').session
    expect(pass.merges.started.map((s) => s.entry)).not.toContain(second)
    expect(one(pass.merges.held.filter((h) => h.entry === second), 'the second entry held').because).toContain('1 merge tool at a time')

    // AN AGENT RUN STARTS BESIDE IT, with the agent runs' one place still free.
    await call('POST', '/api/records', asPerson, { kind: 'agent', title: 'ma-builder', data: { handle: 'ma-builder', state: 'active', runtime: 'claude-code' } })
    const agents = (await call('GET', '/api/participants', asPerson)).body['agents'] as { id: string; handle: string }[]
    const builder = one(agents.filter((a) => a.handle === 'ma-builder'), 'the builder').id
    const message = (await call('POST', '/api/records', asPerson, { kind: 'message', title: 'Synthetic question', data: { body: 'Synthetic: say anything.', to: [{ kind: 'agent', id: builder }] } })).body['record'].id as string
    expect((await call('POST', `/api/messages/${message}/start-an-agent`, asPerson, {})).status).toBeLessThan(300)
    const next = await onePass(settings, watching, merges)
    expect(next.started.map((s) => s.messageId)).toContain(message)
    expect(next.merges.held.map((h) => h.entry)).toContain(second)
    expect(merges.map((m) => m.entry)).toEqual([first])
  })

  it('stops the tool by its process group when a person presses stop, and the entry says who and why', async () => {
    const row = await processRowOf(firstSession)
    const pid = Number(row.key)
    expect(stillGoing(pid)).toBe(true)
    const pressed = await call('POST', '/api/runtime/stop', asPerson, { resourceId: row.id, why: 'Synthetic press: the slot test stops the first merge.' })
    expect(pressed.status, pressed.raw).toBe(200)
    const deadline = Date.now() + 10_000
    while (stillGoing(pid) && Date.now() < deadline) await new Promise((go) => setTimeout(go, 50))
    expect(stillGoing(pid)).toBe(false)
    const read = await entry(first)
    expect(read.tool.reason).toContain('stopped this merge tool run: Synthetic press: the slot test stops the first merge.')
    expect((await record(firstSession))['state']).toBe('crashed')
    // A STOP PRESS STOPS THE RUN, NOT THE ENTRY: the entry is asked for again, and withdrawing it takes it out.
    expect(read.toolWanted).toEqual({ since: expect.any(String) })
    expect(read.machine.stalls).toMatchObject({ runs: 1 })
    await withdraw(first, 'Synthetic: the stop-press case is over.')

    const reports = await passUntil('the second entry starting', async () => merges.some((m) => m.entry === second))
    const endedBecause = ended(reports).find((e) => e.session === firstSession)?.because
    expect(endedBecause).toContain('The merge tool ended without a recorded exit code.')
    expect(endedBecause).toContain(`The entry says: ${read.tool.reason}`)
    expect(started(reports).map((s) => s.entry)).toContain(second)
    await passUntil('the second entry ending', async () => typeof (await entry(second)).tool.endedAt === 'string')
    expect(merges).toEqual([])
    await withdraw(second, 'Synthetic: the slot case is over.')
  })
})

// ============================================================================ 4b. the pin slot

describe('a submitted entry is pinned in a slot of its own while the merge slot is busy (problem GS4-3r9FQQCv)', () => {
  // THE CONDITIONS (message yf17WKvB1SCR): a pin-only run beside the one merge run, with a session record of its
  // own, for a submitted entry only, and never for the entry a run already holds. MUTATION PROOFS in the commit message.
  const pinList: typeof merges = []
  everyMergeList.push(pinList)

  it('starts a pin-only run for a submitted entry beside the merge run, and holds a third entry while both slots are taken', async () => {
    const busy = (await submit(await aSealedRun(), 'synthetic-hangs-merging')).id
    const pinning = (await submit(await aSealedRun(), 'synthetic-hangs-pinning')).id
    const third = (await submit(await aSealedRun(), 'synthetic-ends-well-third')).id
    const pass = await onePass(settings, watching, pinList)
    expect(pass.merges.started.map((s) => s.entry)).toEqual([busy, pinning])
    expect(pinList.map((run) => [run.entry, run.pinOnly ?? false])).toEqual([[busy, false], [pinning, true]])
    expect(one(pass.merges.held.filter((h) => h.entry === third), 'the third entry held').because).toContain('1 merge tool at a time')

    const pinSession = pinList[1]!.session
    const data = await record(pinSession)
    expect(data['runtime']).toBe('merge-tool')
    expect(data['extra']).toMatchObject({ purpose: 'merge', mergeEntry: pinning, pinOnly: true })
    const args = (JSON.parse(await firstLineOf((await entry(pinning)).tool.log)) as { args: string[] }).args
    expect(args).toEqual(['--entry', pinning, '--session', pinSession, '--api', api, '--workspace', 'default', '--pin-only'])
    const mergeArgs = (JSON.parse(await firstLineOf((await entry(busy)).tool.log)) as { args: string[] }).args
    expect(mergeArgs).not.toContain('--pin-only')

    for (const run of pinList) run.adapter.stop(run.handle)
    for (const id of [busy, pinning, third]) await withdraw(id, 'Synthetic: the pin slot case is over.')
    await passUntil('both runs closed', async () => pinList.length === 0, settings, pinList)
  })

  it('never starts a pin-only run for the entry the merge slot holds, even when the office asks for it again', async () => {
    const held = (await submit(await aSealedRun(), 'synthetic-hangs-held')).id
    const pass = await onePass(settings, watching, pinList)
    const session = one(pass.merges.started.filter((s) => s.entry === held), 'the merge run').session
    // THE OFFICE ASKS FOR THE ENTRY AGAIN WHILE ITS RUN STILL GOES: the run's ending is recorded, its session closed and
    // its process row released, as a worker that lost track of it would leave them. The office leaves an entry off its
    // list while the row says the process is alive, so the row is released straight in the test's database, and the
    // entry is then on the list of work while its process runs. Only the worker's own list of runs can hold it back.
    const ended = await call('POST', `/api/merge-queue/${held}/tool-ended`, asTheOffice, { session, reason: 'Synthetic: recorded as ended while it runs.' })
    expect(ended.status, ended.raw).toBe(200)
    const closed = await call('PATCH', `/api/records/${session}`, asTheOffice, { dataPatch: { state: 'finished', doing: 'Synthetic: closed while it runs.' } })
    expect(closed.status, closed.raw).toBe(200)
    const row = await processRowOf(session)
    t.client.sqlite.prepare("UPDATE session_resources SET released_at = datetime('now'), released_by = ?, release_note = ? WHERE id = ?")
      .run('synthetic', 'Synthetic: released while the process runs.', row.id)
    expect((await theWork()).wanted.find((w) => w.entry === held)).toMatchObject({ state: 'submitted' })
    expect(pinList.map((run) => run.entry)).toEqual([held])

    const sessionsOf = () => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.extra.mergeEntry') = ?").get(held) as { n: number }).n
    expect(sessionsOf()).toBe(1)
    const next = await onePass(settings, watching, pinList)
    expect(next.merges.started).toEqual([])
    expect(next.merges.held.map((h) => h.entry)).not.toContain(held)
    expect(sessionsOf(), 'a run was filed for the entry the merge slot holds').toBe(1)
    expect(pinList.map((run) => [run.entry, run.pinOnly ?? false])).toEqual([[held, false]])

    for (const run of pinList) run.adapter.stop(run.handle)
    await withdraw(held, 'Synthetic: the held entry case is over.')
    await passUntil('the run closed', async () => pinList.length === 0, settings, pinList)
  })
})

// ============================================================================ 4c. the check of a resolution

describe("a resolution's check runs beside the lane run, in the pin slot and a process group of its own", () => {
  // THE CONDITION (message XHY2fVFG3Qq8, answer 1): the check never collides with the lane run. It takes its own seat, its own process group, and a
  // stop of one run stops only that run's group. MUTATION PROOFS in the commit message.
  const checkList: typeof merges = []
  everyMergeList.push(checkList)
  const office = { type: 'agent' as const, id: THE_WORKER }
  /** A SYNTHETIC RESOLUTION: a commit nobody made, which the synthetic merge tool never reads. */
  const SYNTHETIC_COMMIT = 'c'.repeat(40)
  /** EVERY ENTRY THIS SECTION SUBMITS, taken out of the queue after it however its cases ended, so a case that failed leaves the later sections nothing to start. */
  const submitted: string[] = []
  afterAll(async () => {
    for (const id of submitted) if (!MERGE_STATE_SPECS[(await entry(id)).state as keyof typeof MERGE_STATE_SPECS].final) await withdraw(id, 'Synthetic: the check section is over.')
    await passUntil("the check section's runs closed", async () => checkList.length === 0, settings, checkList)
  }, 30_000)

  async function aSubmittedEntry(branch: string): Promise<string> {
    const id = (await submit(await aSealedRun(), branch)).id
    submitted.push(id)
    return id
  }

  /** An entry holding the lane, moved there by the queue's one state writer, as the first section does. */
  async function aLaneEntry(branch: string): Promise<string> {
    const id = await aSubmittedEntry(branch)
    for (const to of ['pinned', 'judged', 'integrating'] as const) queue.moveEntry({ id, to, actor: office })
    return id
  }

  /** A resolving entry whose resolution waits for its check, moved there by the queue's one state writer. */
  async function aResolvingEntry(branch: string): Promise<string> {
    const id = await aSubmittedEntry(branch)
    const now = clockStamp()
    queue.moveEntry({
      id,
      to: 'resolving',
      actor: office,
      also: {
        resolving: { files: ['work/a.txt'], says: 'Synthetic: a conflict nobody met.', since: now.instant, timeZone: now.timeZone },
        resolution: { commit: SYNTHETIC_COMMIT, at: now.instant, by: { kind: 'agent', id: 'ma-worker' }, files: [] },
      },
    })
    expect((await entry(id)).toolWanted).toEqual({ since: expect.any(String) })
    return id
  }

  const runOf = (id: string) => one(checkList.filter((run) => run.entry === id), `the run for ${id}`)
  const kinds = () => checkList.map((run) => [run.entry, run.pinOnly ?? false, run.checkResolution ?? false])
  const pgidOf = async (session: string): Promise<number> => one((await theWork()).going.filter((g) => g.session === session), `the run ${session} going`).pgid as number

  /** A person's stop press on a run's process row, waited for until the process is gone. */
  async function pressStop(session: string, why: string): Promise<void> {
    const row = await processRowOf(session)
    const pressed = await call('POST', '/api/runtime/stop', asPerson, { resourceId: row.id, why })
    expect(pressed.status, pressed.raw).toBe(200)
    const pid = Number(row.key)
    const deadline = Date.now() + 10_000
    while (stillGoing(pid) && Date.now() < deadline) await new Promise((go) => setTimeout(go, 50))
    expect(stillGoing(pid)).toBe(false)
  }

  let lane = ''
  let checking = ''

  it('starts the check with --check-resolution beside the lane run, as a run of its own in a group of its own', async () => {
    lane = await aLaneEntry('synthetic-hangs-lane')
    checking = await aResolvingEntry('synthetic-hangs-checking')
    const pass = await onePass(settings, watching, checkList)
    expect(pass.merges.started.map((s) => s.entry).sort()).toEqual([lane, checking].sort())
    expect(kinds().sort()).toEqual([[lane, false, false], [checking, false, true]].sort())

    const session = runOf(checking).session
    const data = await record(session)
    expect(data['runtime']).toBe('merge-tool')
    expect(data['extra']).toMatchObject({ purpose: 'merge', mergeEntry: checking, checkResolution: true })
    expect(data['extra']['pinOnly']).toBeUndefined()
    expect(data['doing']).toContain('this run takes no lane and no sandbox')
    const args = (JSON.parse(await firstLineOf((await entry(checking)).tool.log)) as { args: string[] }).args
    expect(args).toEqual(['--entry', checking, '--session', session, '--api', api, '--workspace', 'default', '--check-resolution'])
    const laneArgs = (JSON.parse(await firstLineOf((await entry(lane)).tool.log)) as { args: string[] }).args
    expect(laneArgs).not.toContain('--check-resolution')

    // TWO GROUPS, and the lane is still the lane run's: the check takes none.
    expect(await pgidOf(session)).not.toBe(await pgidOf(runOf(lane).session))
    expect((await entry(lane)).occupies).toEqual(expect.any(String))
    expect((await entry(checking)).occupies).toBeNull()
  })

  it("a stop press on either run stops only that run's group, and the other goes on", async () => {
    const lanePid = runOf(lane).handle.pid
    const stopped = runOf(checking).session
    await pressStop(stopped, 'Synthetic press: the check case stops the check.')
    expect(stillGoing(lanePid)).toBe(true)
    // THE CHECK ENDED WITHOUT A RESULT, so the office asks for it again (the stall rule), and it starts beside the lane run again.
    const read = await entry(checking)
    expect(read.state).toBe('resolving')
    expect(read.toolWanted).toEqual({ since: expect.any(String) })
    expect(read.machine.stalls).toMatchObject({ runs: 1 })
    await passUntil('the check starting again', async () => checkList.some((run) => run.entry === checking && run.session !== stopped), settings, checkList)
    const checkPid = runOf(checking).handle.pid

    await pressStop(runOf(lane).session, 'Synthetic press: the check case stops the lane run.')
    expect(stillGoing(checkPid)).toBe(true)
    await withdraw(lane, 'Synthetic: the lane run case is over.')
    await withdraw(checking, 'Synthetic: the check case is over.')
    await passUntil('both runs closed', async () => checkList.length === 0, settings, checkList)
  })

  it('shares the pin slot with a pin-only run, one at a time, and never takes the merge slot', async () => {
    // A PIN-ONLY RUN HAS THE SLOT, so a check waits for it, with its sentence.
    const busy = await aLaneEntry('synthetic-hangs-lane-again')
    const pinning = await aSubmittedEntry('synthetic-hangs-pinning-beside')
    await onePass(settings, watching, checkList)
    expect(kinds().sort()).toEqual([[busy, false, false], [pinning, true, false]].sort())
    const waiting = await aResolvingEntry('synthetic-hangs-checking-waits')
    const held = await onePass(settings, watching, checkList)
    expect(held.merges.started).toEqual([])
    expect(one(held.merges.held.filter((h) => h.entry === waiting), 'the check held').because).toBe(
      `The office checks a resolution beside the merge slot, 1 run at a time, and run ${runOf(pinning).session} for merge entry ${pinning} is going there. This entry is started when it ends.`,
    )

    // A CHECK HAS THE SLOT, so a submitted entry waits for it.
    await withdraw(pinning, 'Synthetic: the pin-only run gives the slot up.')
    await passUntil('the check starting', async () => checkList.some((run) => run.entry === waiting), settings, checkList)
    const third = await aSubmittedEntry('synthetic-hangs-not-pinned')
    const next = await onePass(settings, watching, checkList)
    expect(next.merges.started).toEqual([])
    expect(one(next.merges.held.filter((h) => h.entry === third), 'the submitted entry held').because).toContain('1 merge tool at a time')
    expect(kinds().sort()).toEqual([[busy, false, false], [waiting, false, true]].sort())

    // WITH THE MERGE SLOT FREE, the check stays beside it, and an entry that needs the merge slot takes it.
    await withdraw(busy, 'Synthetic: the merge slot is let go.')
    await passUntil('the lane run closed', async () => !checkList.some((run) => run.entry === busy), settings, checkList)
    await passUntil('the submitted entry starting in the merge slot', async () => checkList.some((run) => run.entry === third), settings, checkList)
    expect(kinds().sort()).toEqual([[third, false, false], [waiting, false, true]].sort())

    for (const id of [waiting, third]) await withdraw(id, 'Synthetic: the shared slot case is over.')
    await passUntil('every run closed', async () => checkList.length === 0, settings, checkList)
  })
})

// ============================================================================ 6. taken out of the queue

describe('an entry taken out of the queue has its running tool stopped', () => {
  it('stops the tool of a superseded entry, and then of a withdrawn one, by their groups', async () => {
    const run = await aSealedRun()
    const older = (await submit(run, 'synthetic-hangs-older')).id
    const olderSession = one(started(await passUntil('the older entry starting', async () => merges.some((m) => m.entry === older))).filter((s) => s.entry === older), 'its start').session
    const olderPid = merges.find((m) => m.entry === older)!.handle.pid

    await finish(run)
    const newer = await submit(run, 'synthetic-hangs-older')
    expect(newer.body['superseded']).toEqual([older])
    const stopping = await passUntil('the superseded entry ending', async () => typeof (await entry(older)).tool.endedAt === 'string')
    expect(stopping.flatMap((r) => r.merges.stopped).map((s) => s.session)).toContain(olderSession)
    expect((await entry(older)).tool.reason).toBe(`Merge entry ${older} was superseded by ${newer.id}, so its merge tool had nothing left to do and the office stopped it by its process group.`)
    expect(stillGoing(olderPid)).toBe(false)

    await passUntil('the newer entry starting', async () => merges.some((m) => m.entry === newer.id))
    const newerPid = merges.find((m) => m.entry === newer.id)!.handle.pid
    const withdrawn = await call('POST', `/api/merge-queue/${newer.id}/withdraw`, asSubmitter, { because: 'Synthetic: withdrawn while its tool runs' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    await passUntil('the withdrawn entry ending', async () => typeof (await entry(newer.id)).tool.endedAt === 'string')
    expect((await entry(newer.id)).tool.reason).toBe(
      `Merge entry ${newer.id} was withdrawn by the agent ma-worker (Synthetic: withdrawn while its tool runs), so its merge tool had nothing left to do and the office stopped it by its process group.`,
    )
    expect(stillGoing(newerPid)).toBe(false)
  })
})

// ============================================================================ 7. a worker that lost its memory

describe('a worker that lost its memory', () => {
  it('picks a running merge tool back up from its ledger row, and closes it when it ends', async () => {
    const id = (await submit(await aSealedRun(), 'synthetic-hangs-lost')).id
    await passUntil('the entry starting', async () => merges.some((m) => m.entry === id))
    const lost = merges.splice(0, merges.length)
    everyMergeList.push(lost)
    expect(lost).toHaveLength(1)
    const session = lost[0]!.session

    const fresh: typeof merges = []
    everyMergeList.push(fresh)
    const pass = await onePass(settings, watching, fresh)
    expect(pass.merges.pickedUp).toEqual([session])
    expect(pass.merges.started).toEqual([])
    const row = await processRowOf(session)
    expect(fresh[0]).toMatchObject({ entry: id, session, ledgerRow: row.id, handle: { pid: Number(row.key), pgid: row.pgid } })

    fresh[0]!.adapter.stop(fresh[0]!.handle)
    await passUntil('the picked-up run ending', async () => typeof (await entry(id)).tool.endedAt === 'string', settings, fresh)
    expect((await entry(id)).tool.reason).toContain('The merge tool ended without saying how it ended')
    expect((await processRowOf(session)).releasedAt).toBeTruthy()
    expect(fresh).toEqual([])
    await withdraw(id, 'Synthetic: the lost-memory case is over.')
  })

  it('closes a start whose worker ended before registering its process, and leaves one whose worker may still register it', async () => {
    const id = (await submit(await aSealedRun(), 'synthetic-never-ran')).id
    const parent = (await call('POST', '/api/records', asTheOffice, { kind: 'session', title: 'Synthetic worker whose start never registered', data: { state: 'running' } })).body['record'].id as string
    const tool = (await call('POST', '/api/records', asTheOffice, {
      kind: 'session',
      title: 'Synthetic merge tool run that never registered a process',
      data: { state: 'running', runtime: 'merge-tool', startedByMoleOffice: true, parentAttachment: parent, extra: { purpose: 'merge', mergeEntry: id } },
    })).body['record'].id as string
    const took = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session: tool, log: join(outputs, 'never-ran.log') })
    expect(took.status, took.raw).toBe(200)

    expect((await theWork()).going.map((g) => g.session)).not.toContain(tool)
    const quiet = await onePass(settings, watching, merges)
    expect(quiet.merges.ended).toEqual([])

    expect((await call('PATCH', `/api/records/${parent}`, asTheOffice, { dataPatch: { state: 'crashed' } })).status).toBe(200)
    expect(one((await theWork()).going.filter((g) => g.session === tool), 'the start that never registered').startupFailed).toContain('ended before the run')
    const pass = await onePass(settings, watching, merges)
    expect(pass.merges.ended.map((e) => e.session)).toContain(tool)
    expect((await entry(id)).tool).toMatchObject({ session: tool, endedAt: expect.any(String), reason: expect.stringContaining("ended before the run's process was registered") })
    expect((await record(tool))['state']).toBe('crashed')
    expect((await theWork()).going.map((g) => g.session)).not.toContain(tool)
    // A START THAT NEVER REACHED THE LEDGER ENDED WITHOUT MOVING THE ENTRY, so the entry is asked for again.
    expect((await theWork()).wanted.map((w) => w.entry)).toContain(id)
    await withdraw(id, 'Synthetic: the never-ran case is over.')
  })
})

// ============================================================================ 8. the pass cadence

describe('the wait after a pass, with the merge slot', () => {
  const quiet: PassReport = {
    started: [], held: [], answered: [], failed: [], pickedUp: [], waitedLongEnough: [], cutOff: [], resumed: [], deadLetters: null,
    merges: { started: [], ended: [], pickedUp: [], stopped: [], held: [], bounced: [] },
  }

  it('is fast when a merge tool run has just ended, and slow for one only going or an entry only waiting for the slot', () => {
    expect(waitAfterAPass(quiet, [])).toBe(30_000)
    expect(waitAfterAPass({ ...quiet, merges: { ...quiet.merges, held: [{ entry: 'x', because: 'synthetic' }] } }, [])).toBe(30_000)
    expect(waitAfterAPass({ ...quiet, merges: { ...quiet.merges, ended: [{ entry: 'x', session: 'y', because: 'synthetic' }] } }, [])).toBe(2_000)
  })
})

// ============================================================================ 9. the hour of a resolving entry

/**
 * THE WORKER ASKS THE OFFICE TO BOUNCE A RESOLVING ENTRY WHOSE HOUR IS OVER (XHY2fVFG3Qq8, answer 2).
 *
 * GET /api/worker/merges lists it under `hourOver`, and the pass posts to
 * POST /api/worker/merges/<entry>/hour-over with `{}`. The office decides from what it stores and writes the bounce;
 * the pass only reports it. A refused post is said once in the worker's log and the pass goes on.
 *
 * The first case runs against the real server, with the entry put into resolving by the queue's own state writer and
 * its hour started two hours ago, so the real list reads it as over. The second is against a made-up server that
 * refuses the bounce, because a refusal is not something the real server can be made to give on demand.
 */
describe("a resolving entry whose hour is over", () => {
  it('is bounced by the office through the door, and the pass reports it once', async () => {
    const id = (await submit(await aSealedRun(), 'synthetic-hour-over')).id
    const started = clockStamp(() => new Date(Date.now() - 7_200_000))
    queue.moveEntry({
      id,
      to: 'resolving',
      actor: { type: 'agent', id: THE_WORKER },
      also: { resolving: { files: ['work/a.txt'], says: 'Synthetic: its commits conflict with the main world.', since: started.instant, timeZone: started.timeZone } },
    })
    expect((await entry(id)).state).toBe('resolving')

    const pass = await onePass({ ...settings, mergesOnly: true }, watching, merges)
    const read = await entry(id)
    expect(read.state).toBe('bounced')
    expect(pass.merges.bounced).toEqual([{ entry: id, because: read.machine.bounced.says }])
    // THE LIST NO LONGER CARRIES IT, so a later pass asks nothing about it.
    const again = await onePass({ ...settings, mergesOnly: true }, watching, merges)
    expect(again.merges.bounced).toEqual([])
  })

  it('says a refused bounce once, and goes on with the pass', async () => {
    const said: string[] = []
    const write = vi.spyOn(process.stderr, 'write')
    write.mockImplementation(((chunk: unknown) => { said.push(String(chunk)); return true }) as never)
    const paths: string[] = []
    const posts: { path: string; body: string }[] = []
    const ENTRY = 'SyntheticHourOverEntry'
    const POST = `/api/worker/merges/${ENTRY}/hour-over`
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
      const path = new URL(url).pathname
      paths.push(path)
      if (path === '/api/worker/merges') {
        return new Response(JSON.stringify({ wanted: [], going: [], hourOver: [{ entry: ENTRY, until: '2026-10-17 07:00:00', resolution: 'the hour ran out' }], hourCannotBeRead: [] }), { status: 200 })
      }
      if (path === POST) {
        posts.push({ path, body: String(init?.body) })
        return new Response(JSON.stringify({ error: 'Synthetic: the office refused to bounce it.' }), { status: 409 })
      }
      return new Response('{}', { status: 200 })
    })
    try {
      const fake: WorkerSettings = { ...settings, api: 'http://fixture.invalid', mergesOnly: true }
      const first = await onePass(fake, [], [], [])
      expect(posts).toEqual([{ path: POST, body: '{}' }])
      expect(first.merges.bounced).toEqual([])
      // THE PASS WENT ON PAST THE REFUSAL: the next rounds were asked after the refused post.
      expect(paths.indexOf('/api/worker/rounds')).toBeGreaterThan(paths.indexOf(POST))
      await onePass(fake, [], [], [])
      const refusedOnce = said.filter((line) => line.includes('Synthetic: the office refused to bounce it.'))
      expect(refusedOnce).toHaveLength(1)
      expect(refusedOnce[0]).toContain(`Merge entry ${ENTRY} could not be bounced although its time to resolve was over when the list was read:`)
    } finally {
      write.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})

/** Measures the new pass step. Mutations: skip a door; bypass MergeAdapter.script; forget the recorded group bound. */
describe('overdue hand-backs in the worker pass', () => {
  it('posts the person door and runs due problems through the checkout fake tool in order', async () => {
    const calls: string[] = [], script = join(settings.outputRoot, 'synthetic-take-back.mjs')
    writeFileSync(script, "console.log('TAKE-BACK: synthetic ' + process.argv.slice(2).join(' '))\n")
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
      const path = new URL(url).pathname; calls.push(path)
      if (path === '/api/worker/merges') return new Response(JSON.stringify({ wanted: [], going: [], takeBacksForAPerson: [{ problem: 'synthetic-person', says: 'Needs a person.' }], takeBacksCannotBeRead: [], takeBacksDue: [{ problem: 'synthetic-due' }] }), { status: 200 })
      if (path === '/api/records' && init?.method === 'POST') return new Response(JSON.stringify({ record: { id: 'synthetic-check-session' } }), { status: 201 })
      return new Response('{}', { status: 200 })
    })
    try {
      const takeSettings = { ...settings, api: 'http://fixture.invalid', mergesOnly: true, env: { ...settings.env, MOLE_OFFICE_FAKE_MERGE_TOOL: script } }
      let result = await onePass(takeSettings, [], [], [])
      for (let n = 0; n < 100 && result.merges.takenBack?.length === 0; n++) { await new Promise(resolve => setTimeout(resolve, 20)); result = await onePass(takeSettings, [], [], []) }
      expect(calls).toContain('/api/worker/merges/hand-backs/synthetic-person/a-person-must-look')
      expect(result.merges.takenBack).toEqual([{ problem: 'synthetic-due', says: expect.stringContaining('--take-back synthetic-due') }])
    } finally { vi.unstubAllGlobals() }
  })
  it('ends an overlong take-back by its recorded process group and says it once', async () => {
    const os = processGroups, worker = await import('../src/worker/index.ts')
    // The stop is seen at the signal, since the worker's stop calls endGroup inside os.ts, where a spy on it is not seen.
    const stopped = vi.spyOn(process, 'kill').mockReturnValue(true)
    const alive = vi.spyOn(os, 'stillRunning').mockReturnValue(true)
    const start = vi.spyOn(os, 'startInItsOwnGroup').mockReturnValue({ pid: 900001, pgid: 900002, exitCodePath: join(settings.outputRoot, 'no-take-back-exit') })
    const said: string[] = [], write = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => { said.push(String(chunk)); return true }) as never)
    vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify(new URL(url).pathname === '/api/worker/merges' ? { wanted: [], going: [], takeBacksDue: [{ problem: 'synthetic-overlong' }] } : new URL(url).pathname === '/api/records' ? { record: { id: 'synthetic-overlong-session' } } : {}), { status: 200 }))
    vi.useFakeTimers()
    try {
      const takeSettings = { ...settings, api: 'http://fixture.invalid', mergesOnly: true }
      const first = onePass(takeSettings, [], [], [])
      await vi.advanceTimersByTimeAsync(worker.TAKE_BACK_LIMIT_MS + 3_000)
      let result = await first
      if (result.merges.takeBackFailed?.length === 0) {
        const later = onePass(takeSettings, [], [], [])
        await vi.advanceTimersByTimeAsync(3_000)
        result = await later
      }
      expect(start).toHaveBeenCalled(); expect(stopped).toHaveBeenCalledWith(-900002, 'SIGTERM')
      expect(result.merges.takeBackFailed).toEqual([{ problem: 'synthetic-overlong', says: expect.stringContaining('bound') }])
      expect(said.filter(x => x.includes('synthetic-overlong'))).toHaveLength(1)
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); start.mockRestore(); alive.mockRestore(); stopped.mockRestore(); write.mockRestore() }
  })
})

describe('a take-back check owns its session', () => {
  it('files its session before starting, passes it to the tool, and records the ending', async () => {
    const session = randomUUID(), problem = randomUUID(), calls: { path: string; method: string; body: any }[] = []
    const script = join(settings.outputRoot, 'take-back-with-session.mjs')
    writeFileSync(script, "console.log('TAKE-BACK: ' + process.argv.slice(2).join(' '))\n")
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
      const path = new URL(url).pathname, method = init?.method ?? 'GET', body = init?.body ? JSON.parse(init.body) : null
      calls.push({ path, method, body })
      if (path === '/api/worker/merges') return new Response(JSON.stringify({ wanted: [], going: [], takeBacksDue: [{ problem }] }))
      if (path === '/api/records' && method === 'POST') return new Response(JSON.stringify({ record: { id: session } }), { status: 201 })
      return new Response('{}')
    })
    try {
      const takeSettings = { ...settings, session: 'synthetic-parent', api: 'http://fixture.invalid', mergesOnly: true, env: { ...settings.env, MOLE_OFFICE_FAKE_MERGE_TOOL: script } }
      let result = await onePass(takeSettings, [], [], [])
      for (let n = 0; n < 100 && result.merges.takenBack?.length === 0; n++) { await new Promise(resolve => setTimeout(resolve, 20)); result = await onePass(takeSettings, [], [], []) }
      const filed = calls.find(c => c.path === '/api/records' && c.method === 'POST')
      expect(filed?.body).toMatchObject({ kind: 'session', data: { state: 'running', runtime: 'merge-tool', startedByMoleOffice: true, parentAttachment: 'synthetic-parent', extra: { purpose: 'take-back-check', problem } } })
      expect(filed?.body.data.servingAgent).toBeUndefined(); expect(filed?.body.data.servingAgentId).toBeUndefined()
      expect(result.merges.takenBack?.[0]?.says).toContain(`--session ${session}`)
      const closed = calls.find(c => c.path === `/api/records/${session}` && c.method === 'PATCH')
      expect(closed?.body).toMatchObject({ dataPatch: { state: 'finished', doing: expect.stringContaining(`--take-back ${problem}`) } })
    } finally { vi.unstubAllGlobals() }
  })
  it('starts nothing if the office refuses to file its check session', async () => {
    const start = vi.spyOn(processGroups, 'startInItsOwnGroup')
    vi.stubGlobal('fetch', async (url: string) => new URL(url).pathname === '/api/worker/merges'
      ? new Response(JSON.stringify({ wanted: [], going: [], takeBacksDue: [{ problem: 'synthetic-unfiled' }] }))
      : new URL(url).pathname === '/api/records' ? new Response(JSON.stringify({ error: 'Synthetic session refusal.' }), { status: 409 }) : new Response('{}'))
    try {
      const result = await onePass({ ...settings, api: 'http://fixture.invalid', mergesOnly: true }, [], [], [])
      expect(start).not.toHaveBeenCalled()
      expect(result.merges.takeBackFailed?.[0]?.says).toContain('Synthetic session refusal')
    } finally { start.mockRestore(); vi.unstubAllGlobals() }
  })
})

it('delivers a message while a slow take-back is running, watches it once, and closes it on a later pass', async () => {
  const problem = randomUUID(), session = randomUUID(), message = randomUUID(), row = randomUUID()
  const release = join(settings.outputRoot, 'release-take-back'), script = join(settings.outputRoot, 'slow-take-back.mjs')
  writeFileSync(script, `import { existsSync } from 'node:fs'
setInterval(() => { if (existsSync(${JSON.stringify(release)})) { console.log('TAKE-BACK: slow check ended'); process.exit(0) } }, 20)
`)
  const calls: { path: string; method: string; body: any }[] = []
  let delivered = false, closed = false
  vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
    const path = new URL(url).pathname, method = init?.method ?? 'GET', body = init?.body ? JSON.parse(init.body) : null
    calls.push({ path, method, body })
    if (path === '/api/worker/merges') return new Response(JSON.stringify({ wanted: [], going: [], takeBacksDue: closed ? [] : [{ problem }] }))
    if (path === '/api/records' && method === 'POST') return new Response(JSON.stringify({ record: { id: session } }), { status: 201 })
    if (path === '/api/resources' && method === 'POST') return new Response(JSON.stringify({ resource: { id: row } }), { status: 201 })
    if (path === '/api/worker/queue') return new Response(JSON.stringify({ queue: delivered ? [] : [{ messageId: message, to: { kind: 'agent', id: message }, needsNoRun: 'Synthetic office notice.' }], next: null }))
    if (path === `/api/worker/messages/${message}/needs-no-run`) delivered = true
    if (path === `/api/records/${session}` && method === 'PATCH') closed = true
    return new Response('{}')
  })
  const start = vi.spyOn(processGroups, 'startInItsOwnGroup')
  const takeSettings = { ...settings, api: 'http://fixture.invalid', mergesOnly: false, env: { ...settings.env, MOLE_OFFICE_FAKE_MERGE_TOOL: script } }
  const pass = onePass(takeSettings, [], [], [])
  try {
    const first = await Promise.race([pass, new Promise<null>(resolve => setTimeout(() => resolve(null), 2_000))])
    expect(first, 'the pass must return while the fake is held').not.toBeNull()
    expect(delivered).toBe(true); expect(first!.held).toContainEqual({ messageId: message, because: 'Synthetic office notice.' })
    const child = start.mock.results[0]!.value
    expect(processGroups.stillRunning(child.pid)).toBe(true)
    expect(calls.some(c => c.path === `/api/records/${session}` && c.method === 'PATCH')).toBe(false)
    await onePass(takeSettings, [], [], [])
    expect(start).toHaveBeenCalledTimes(1)
    writeFileSync(release, 'go')
    let ended = false
    for (let n = 0; n < 150 && !ended; n++) {
      await new Promise(resolve => setTimeout(resolve, 20))
      const later = await onePass(takeSettings, [], [], [])
      ended = later.merges.takenBack?.some(one => one.problem === problem) ?? false
    }
    expect(ended).toBe(true)
    expect(calls.filter(c => c.path === `/api/records/${session}` && c.method === 'PATCH')).toEqual([expect.objectContaining({ body: { dataPatch: expect.objectContaining({ state: 'finished', doing: expect.stringContaining('slow check ended') }) } })])
    expect(calls.filter(c => c.path === `/api/resources/${row}/release`)).toHaveLength(1)
  } finally {
    writeFileSync(release, 'go'); await pass.catch(() => {})
    for (let n = 0; n < 20 && !closed; n++) { await new Promise(resolve => setTimeout(resolve, 20)); await onePass(takeSettings, [], [], []) }
    for (const result of start.mock.results) if (result.type === 'return' && processGroups.stillRunning(result.value.pid)) processGroups.endGroup(result.value.pgid, 'SIGTERM')
    start.mockRestore(); vi.unstubAllGlobals()
  }
})
