// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A WORKER IN MERGES-ONLY MODE STARTS THE OFFICE'S MERGE TOOL AND NO AGENT RUN. Sandbox v1, fix-worker.
 *
 * `MOLE_OFFICE_MESSAGE_WORKER=merges-only` is a third word beside on and off. The server starts its
 * worker, and the worker starts `tools/the-merger.mjs` for the merge entries the office marks, and no run
 * for a message. It exists so the merge queue can run on an office whose queued deliveries to agents must
 * not each start a run of that agent's tool on the machine. Since wave 13j round loop-3 it also starts the
 * rounds asked through the next-round door; tests/the-next-round-door.test.ts proves that part.
 *
 * WHAT IS PROVED HERE, against a real database and the real server listening on its own port:
 *
 *   1. The worker reads the mode from the one declaration, which refuses a word it does not know and
 *      names the three it does. On and off leave the worker as it was.
 *   2. A queued message to an agent, one a pass in the ordinary mode does start (the control in the same
 *      test), starts nothing in merges-only mode, and its delivery row is not written.
 *   3. `startOne`, the one place a run is started from, refuses in that mode and says which mode is on.
 *   4. A ready merge entry starts the merge tool in that mode, and the tool runs to its end, while a
 *      message to an agent waits beside it and nothing is started for it on any pass.
 *   5. The worker's first log line, the runtime page's line and the worker's own row say which mode is on,
 *      and say what they said before when it is not.
 *   6. The two synthetic tools the worker can start are declared settings.
 *   7. A real server started with the setting starts its worker in that mode: the server's line, the
 *      worker's own row and the running worker's first log line all say so. This is the one case with a
 *      real server process and a real worker process. The server is under this test runner, so it
 *      registers no world with the office `.env` names.
 *
 * WHAT IS NOT REAL. The agent tool is `tests/fake-runtime.mjs`, named by MOLE_OFFICE_FAKE_RUNTIME, so a
 * run that did start would spend no model call. The merge tool is `tests/fake-merge-tool.mjs`, named by
 * MOLE_OFFICE_FAKE_MERGE_TOOL: it merges nothing and reports no step. The git trees are synthetic, made
 * under `.logs/` in this checkout and removed after.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MERGES_ONLY_SAYS, readSetting, settingNamed } from '../src/config/settings.mjs'
import { onePass, startOne, whatItWillDo, workerSettingsFrom, type PassReport, type WorkerSettings } from '../src/worker/index.ts'
import { FAKE_INSPECTION_TOOL_SETTING } from '../src/worker/runtimes/inspection.ts'
import { FAKE_MERGE_TOOL_SETTING } from '../src/worker/runtimes/merge.ts'
import { apiServerArguments, apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE_MERGE_TOOL = fileURLToPath(new URL('./fake-merge-tool.mjs', import.meta.url))
const FAKE_RUNTIME = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
/** The worker as it is when MOLE_OFFICE_MESSAGE_WORKER is on, which is what leaving the mode out gives. */
let everything: WorkerSettings
/** The same worker in merges-only mode. */
let mergesOnly: WorkerSettings
let builder = ''
const made: string[] = []
/** The agent runs and merge tool runs this file's worker watches, carried between passes as the worker does. */
const watching: Parameters<typeof onePass>[1] = []
const merges: NonNullable<Parameters<typeof onePass>[2]> = []

const as = (type: 'agent' | 'human', id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asStarter = as('agent', 'mo-starter')
const asSubmitter = as('agent', 'mo-worker')

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
  const dir = mkdtempSync(join(process.cwd(), '.logs', `merges-only-${prefix}-`))
  made.push(dir)
  return dir
}

/** A finished, sealed run of `mo-worker` in a synthetic git tree with one commit on `work` over `main`. */
async function aSealedRun(): Promise<string> {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic merges-only fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), 'submitted\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic submission')
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic merges-only run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'mo-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'mo-worker', cutFrom: 'main', workingDirectory: dir },
  }).id
  const finished = await call('PATCH', `/api/records/${run}`, asSubmitter, { dataPatch: { state: 'finished', submission: { kind: 'git' } } })
  expect(finished.status, finished.raw).toBe(200)
  return run
}

async function entry(id: string): Promise<Record<string, any>> {
  const r = await call('GET', `/api/merge-queue/${id}`, asPerson)
  expect(r.status, r.raw).toBe(200)
  return r.body['entry'] as Record<string, any>
}

/** A message from the person to the builder, pressed so that a run may start for it (criterion M78). */
async function aMessageReadyToStart(words: string): Promise<string> {
  const id = (await call('POST', '/api/records', asPerson, { kind: 'message', title: 'Synthetic question', data: { body: words, to: [{ kind: 'agent', id: builder }] } })).body['record'].id as string
  const pressed = await call('POST', `/api/messages/${id}/start-an-agent`, asPerson, {})
  expect(pressed.status, pressed.raw).toBeLessThan(300)
  return id
}

/** The message's delivery row as stored, every column, so a write of any kind shows. */
function deliveryRow(message: string): Record<string, unknown> {
  return one(t.client.sqlite.prepare('SELECT * FROM message_delivery WHERE message_id = ?').all(message) as Record<string, unknown>[], `the delivery row of ${message}`)
}

/**
 * How many session records serve an agent, found by its registry id. A run the worker starts stores
 * the agent's handle as `servingAgent` and its registry id as `servingAgentId`. The id is what is
 * counted, because the builder's id is not its handle.
 */
function sessionsServing(agentId: string): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgentId') = ?").get(agentId) as { n: number }).n
}

/** Run passes until something is true, collecting every report, or fail saying it never was. */
async function passUntil(what: string, use: WorkerSettings, done: () => Promise<boolean>): Promise<PassReport[]> {
  const reports: PassReport[] = []
  const deadline = Date.now() + 20_000
  for (;;) {
    reports.push(await onePass(use, watching, merges))
    if (await done()) return reports
    if (Date.now() >= deadline) throw new Error(`${what} did not happen within 20 seconds. Last pass: ${JSON.stringify(reports.at(-1))}`)
    await new Promise((go) => setTimeout(go, 100))
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
  for (const [by, handle, workArea] of [
    [asPerson, 'mo-starter', undefined],
    [asStarter, 'mo-worker', ['work']],
  ] as const) {
    const r = await call('POST', '/api/agents/started', by, { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) })
    expect(r.status, r.raw).toBe(201)
  }
  const registered = await call('POST', '/api/records', asPerson, { kind: 'agent', title: 'mo-builder', data: { handle: 'mo-builder', state: 'active', runtime: 'claude-code' } })
  expect(registered.status, registered.raw).toBeLessThan(300)
  const agents = (await call('GET', '/api/participants', asPerson)).body['agents'] as { id: string; handle: string }[]
  builder = one(agents.filter((a) => a.handle === 'mo-builder'), 'the builder').id
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-merges-only-'))
  everything = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_MERGE_TOOL: FAKE_MERGE_TOOL, MOLE_OFFICE_FAKE_RUNTIME: FAKE_RUNTIME },
  }
  mergesOnly = { ...everything, mergesOnly: true }
}, 60_000)

afterAll(async () => {
  for (const run of merges) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle)
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The merges-only test ended.')
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
  if (outputs !== undefined) rmSync(outputs, { recursive: true, force: true })
}, 30_000)

// ============================================================================ 1. the mode is read

describe('the mode is one word of MOLE_OFFICE_MESSAGE_WORKER', () => {
  it('is merges-only for the worker only when the setting says so, and a word it does not know is refused', () => {
    expect(workerSettingsFrom([], { MOLE_OFFICE_MESSAGE_WORKER: 'merges-only' }).mergesOnly).toBe(true)
    expect(workerSettingsFrom([], { MOLE_OFFICE_MESSAGE_WORKER: 'on' }).mergesOnly).toBe(false)
    // OFF IS THE SERVER'S WORD FOR STARTING NO WORKER. A worker started by hand under it serves everything, as before.
    expect(workerSettingsFrom([], { MOLE_OFFICE_MESSAGE_WORKER: 'off' }).mergesOnly).toBe(false)
    expect(readSetting('MOLE_OFFICE_MESSAGE_WORKER', { MOLE_OFFICE_MESSAGE_WORKER: 'merges-only' }).value).toBe('merges-only')
    expect(() => readSetting('MOLE_OFFICE_MESSAGE_WORKER', { MOLE_OFFICE_MESSAGE_WORKER: 'merges' })).toThrow(
      'MOLE_OFFICE_MESSAGE_WORKER is "merges", and it must be on, off, merges-only. No worker setting was inferred.',
    )
  })
})

// ============================================================================ 2 and 3. no agent run

describe('in merges-only mode a message to an agent starts nothing', () => {
  it('leaves a queued message that the ordinary mode starts untouched, run and row alike', async () => {
    const message = await aMessageReadyToStart('Synthetic: say anything.')
    const before = deliveryRow(message)
    expect(before['mark']).toBe('queued')
    const runsBefore = sessionsServing(builder)

    const pass = await onePass(mergesOnly, watching, merges)
    expect(pass.started).toEqual([])
    expect(pass.held).toEqual([])
    expect(pass.failed).toEqual([])
    expect(pass.pickedUp).toEqual([])
    expect(watching).toEqual([])
    expect(sessionsServing(builder)).toBe(runsBefore)
    expect(deliveryRow(message)).toEqual(before)

    // THE CONTROL: the same message, one pass of the ordinary worker, starts a run. So the nothing above
    // was the mode, and not a message that could not have started anyway.
    const ordinary = await onePass(everything, watching, merges)
    expect(ordinary.started.map((s) => s.messageId)).toContain(message)
    expect(sessionsServing(builder)).toBe(runsBefore + 1)
    await passUntil('the ordinary run answering', everything, async () => watching.length === 0)
    expect(deliveryRow(message)['mark']).not.toBe('queued')
  })

  it('is refused at the one place a run is started from, with the sentence that says which mode is on', async () => {
    const row: Parameters<typeof startOne>[0] = {
      messageId: 'synthetic-message',
      workspaceId: 'default',
      to: { kind: 'agent', id: builder },
      handle: 'mo-builder',
      runtime: 'claude-code',
      retired: false,
      body: 'Synthetic: this must never reach a run.',
      sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      sentAt: new Date().toISOString(),
      resume: null,
      hops: 0,
      needsNoRun: null,
      conversationIsWaiting: null,
      runningAlready: null,
      heldByALiveSession: null,
      heldByAReview: null,
      nobodyIsAnsweringAsIt: null,
      urgent: false,
    }
    const runsBefore = sessionsServing(builder)
    const started = await startOne(row, mergesOnly, watching)
    expect(started).toEqual({ ok: false, because: `Nothing was started for this message. ${MERGES_ONLY_SAYS}` })
    expect(watching).toEqual([])
    expect(sessionsServing(builder)).toBe(runsBefore)
  })
})

// ============================================================================ 4. the merge tool

describe('in merges-only mode a ready merge entry starts the merge tool', () => {
  it('starts the tool and sees it to its end, while a message to an agent waits and nothing starts for it', async () => {
    const waiting = await aMessageReadyToStart('Synthetic: this waits while the merge runs.')
    const before = deliveryRow(waiting)
    const runsBefore = sessionsServing(builder)
    const submitted = await call('POST', '/api/merge-queue', asSubmitter, { run: await aSealedRun(), changeset: { adapter: 'git', repository: 'fixture-main', branch: 'synthetic-ends-well' } })
    expect(submitted.status, submitted.raw).toBe(201)
    const id = String(submitted.body['entry'].id)
    expect((await entry(id)).toolWanted).toEqual({ since: expect.any(String) })

    const first = await onePass(mergesOnly, watching, merges)
    const session = one(first.merges.started.filter((s) => s.entry === id), 'the merge tool run that was started').session
    expect((await entry(id)).tool).toMatchObject({ session })
    const run = (await call('GET', `/api/records/${session}`, asPerson)).body['record'].data as Record<string, any>
    expect(run['runtime']).toBe('merge-tool')
    expect(run['extra']).toMatchObject({ purpose: 'merge', mergeEntry: id, fakeMergeTool: FAKE_MERGE_TOOL })

    const rest = await passUntil('the merge tool ending', mergesOnly, async () => typeof (await entry(id)).tool.endedAt === 'string')
    expect(rest.flatMap((r) => r.merges.ended).map((e) => e.session)).toContain(session)
    expect((await entry(id)).tool.reason).toContain(`Synthetic merge tool read merge entry ${id}`)
    expect(merges).toEqual([])

    for (const pass of [first, ...rest]) {
      expect(pass.started).toEqual([])
      expect(pass.held).toEqual([])
    }
    expect(watching).toEqual([])
    expect(sessionsServing(builder)).toBe(runsBefore)
    expect(deliveryRow(waiting)).toEqual(before)
  })
})

// ============================================================================ 5. what it says

describe('every line about the worker says which mode is on', () => {
  it("says merges-only in the worker's first log line, and says what it always said otherwise", () => {
    const said = whatItWillDo(mergesOnly)
    expect(said).toContain(MERGES_ONLY_SAYS)
    expect(said.split('\n')[0]).toBe(`The message worker is watching ${api} in default for merge entries and for the next rounds asked through the next-round door, and in every project on the office's list for the worker runs asked through the worker-run door.`)
    expect(said).not.toContain('messages to agents in')
    expect(MERGES_ONLY_SAYS).toContain('MOLE_OFFICE_MESSAGE_WORKER=merges-only')
    expect(whatItWillDo(everything).split('\n')[0]).toBe(`The message worker is watching ${api} for messages to agents in default.`)
  })

  it("says merges-only on the runtime page's line and on the worker's own row, and what it always said otherwise", async () => {
    const lib = await import('../src/server/lib/worker.ts')
    const child = { pid: 4242, pgid: 4242 }
    expect(lib.whatTheStartedWorkerSays(true, child, '/synthetic/worker.log')).toBe(
      `started as process 4242 in group 4242, writing to /synthetic/worker.log. ${MERGES_ONLY_SAYS}`,
    )
    expect(lib.whatTheStartedWorkerSays(false, child, '/synthetic/worker.log')).toBe('started as process 4242 in group 4242, writing to /synthetic/worker.log')
    expect(lib.whatTheWorkerIsStartedToDo(true)).toContain(MERGES_ONLY_SAYS)
    expect(lib.whatTheWorkerIsStartedToDo(false)).toBe('taking the message queue and starting a run of an agent tool for each message to an agent')
  })
})

// ============================================================================ 6. the synthetic tools

describe('the synthetic tools the worker can start are declared settings', () => {
  it('names each through the declaration, which says what absence means', () => {
    expect(FAKE_MERGE_TOOL_SETTING).toBe('MOLE_OFFICE_FAKE_MERGE_TOOL')
    expect(FAKE_INSPECTION_TOOL_SETTING).toBe('MOLE_OFFICE_FAKE_INSPECTION_TOOL')
    for (const name of [FAKE_MERGE_TOOL_SETTING, FAKE_INSPECTION_TOOL_SETTING]) {
      const declared = settingNamed(name)
      expect(declared.fallback).toBeNull()
      expect(declared.absentMeans).toMatch(/^off: /)
      expect(declared.inTemplate).toBe(false)
    }
  })
})

// ============================================================================ 7. a real server and worker

describe('a real server started with MOLE_OFFICE_MESSAGE_WORKER=merges-only', () => {
  let dir = ''
  let server: ChildProcess | null = null
  let workerGroup: number | null = null
  let workerLog: string | null = null

  const freePort = (): Promise<number> =>
    new Promise((ok, fail) => {
      const probe = createServer()
      probe.on('error', fail)
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address() as AddressInfo
        probe.close(() => ok(address.port))
      })
    })
  const stopGroup = (pgid: number | null | undefined): void => {
    if (pgid === null || pgid === undefined) return
    try {
      process.kill(-pgid, 'SIGTERM')
    } catch {
      // Already gone.
    }
  }

  afterAll(async () => {
    // BY THE GROUP IDS WRITTEN DOWN: the server's from its spawn, the worker's from the server's own answer.
    stopGroup(server?.pid)
    stopGroup(workerGroup)
    await new Promise((go) => setTimeout(go, 500))
    if (workerLog !== null) rmSync(workerLog, { force: true })
    if (dir !== '') rmSync(dir, { recursive: true, force: true })
  }, 30_000)

  it("starts its worker in merges-only mode, and the server's line, the worker's row and its log say so", async () => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-merges-only-server-'))
    // WHERE THE WORKER WILL WRITE, by the server's own rule, known before anything starts so it is removed
    // after even when the server's answer below is wrong. The worker appends to the log of its port, and
    // other tests' servers leave theirs behind, so a port whose log is already there would put an earlier
    // server's first line above this one's. That happened once on 12 October 2026, so the port is one with
    // no log at it.
    const { theWorkerLogPath } = await import('../src/server/lib/worker.ts')
    let port = await freePort()
    for (let tries = 1; existsSync(theWorkerLogPath(CHECKOUT, port, 'unused while the server has a port')); tries += 1) {
      if (tries === 20) throw new Error(`20 free ports in a row each have a worker log in ${CHECKOUT}/.logs already, so no port here is clean.`)
      port = await freePort()
    }
    const address = `http://127.0.0.1:${String(port)}`
    workerLog = theWorkerLogPath(CHECKOUT, port, 'unused while the server has a port')
    const log = openSync(join(dir, 'api.log'), 'a')
    server = spawn(join(CHECKOUT, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: CHECKOUT,
      detached: true,
      stdio: ['ignore', log, log],
      env: {
        ...withoutInheritedEffort(),
        MOLE_OFFICE_PORT: String(port),
        MOLE_OFFICE_WEB_PORT: String(await freePort()),
        MOLE_OFFICE_DB: join(dir, 'own.db'),
        MOLE_OFFICE_WORKSPACE: 'default',
        MOLE_OFFICE_API: address,
        MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
        MOLE_OFFICE_MESSAGE_WORKER: 'merges-only',
        // SYNTHETIC TOOLS ONLY, so that even a worker that broke the mode would start no real tool.
        MOLE_OFFICE_FAKE_RUNTIME: FAKE_RUNTIME,
        MOLE_OFFICE_FAKE_MERGE_TOOL: FAKE_MERGE_TOOL,
        LOG_LEVEL: 'warn',
        // CLEARED SO THE SERVER STARTS A WORKER AT ALL. It still finds this runner among its ancestors,
        // which is what keeps it from registering itself at the office `.env` names.
        VITEST: undefined,
        VITEST_WORKER_ID: undefined,
      } as NodeJS.ProcessEnv,
    })
    closeSync(log)

    const headers = { 'x-mole-office-workspace': 'default' }
    const deadline = Date.now() + 150_000
    let health: { messageWorker?: { started: boolean; says: string } } = {}
    for (;;) {
      try {
        const answered = await fetch(`${address}/api/health`, { headers })
        if (answered.ok) health = (await answered.json()) as typeof health
      } catch {
        // Not answering yet.
      }
      if (health.messageWorker?.started === true) break
      if (Date.now() > deadline) throw new Error(`the server never said it started its worker: ${JSON.stringify(health)} ${readFileSync(join(dir, 'api.log'), 'utf8').slice(-2000)}`)
      await new Promise((go) => setTimeout(go, 300))
    }
    const runtime = (await (await fetch(`${address}/api/runtime`, { headers })).json()) as { worker: { pid: number; pgid: number; sessionRecordId: string; says: string } }
    workerGroup = runtime.worker.pgid
    const says = health.messageWorker!.says
    expect(says).toBe(runtime.worker.says)
    expect(says).toBe(`started as process ${String(runtime.worker.pid)} in group ${String(runtime.worker.pgid)}, writing to ${workerLog}. ${MERGES_ONLY_SAYS}`)

    const row = (await (await fetch(`${address}/api/records/${runtime.worker.sessionRecordId}`, { headers })).json()) as { record: { data: { doing: string } } }
    expect(row.record.data.doing).toContain(MERGES_ONLY_SAYS)

    // THE RUNNING WORKER'S OWN FIRST LINE, which it prints from the settings it read itself.
    const logFile = workerLog
    while (!(existsSync(logFile) && readFileSync(logFile, 'utf8').includes('\n'))) {
      if (Date.now() > deadline) throw new Error(`the worker wrote nothing to ${logFile}`)
      await new Promise((go) => setTimeout(go, 200))
    }
    const lines = readFileSync(logFile, 'utf8').split('\n')
    expect(lines[0]).toBe(`The message worker is watching ${address} in default for merge entries and for the next rounds asked through the next-round door, and in every project on the office's list for the worker runs asked through the worker-run door.`)
    expect(lines[1]).toBe(MERGES_ONLY_SAYS)
  }, 180_000)
})
