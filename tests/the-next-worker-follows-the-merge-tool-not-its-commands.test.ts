// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE NEXT WORKER FOLLOWS THE MERGE TOOL'S OWN PROCESS, NOT A COMMAND THE TOOL RAN, AND THE OFFICE
 * STARTS NO SECOND MERGE TOOL BESIDE A LIVE ONE. Finding 80, block f-80 of report EnJvvsDTF_Dx.
 *
 * On 25 September 2026 merge tool run W_b7Dour1ayt ran its build, its suite and its reruns through
 * `tools/sandbox.mjs exec --session W_b7Dour1ayt`, and each filed a process row of its own under the
 * run's session. The office restarted, and the new worker followed the newest live row, which was the
 * suite's. When the suite ended the worker closed the run as crashed while the tool was still running,
 * and then started a second tool for the same entry, which took the first one's sandbox away.
 *
 * WHAT IS PROVED HERE, against a real database, the real server on its own port, and real processes:
 *
 *   1. A worker that picks a merge tool run up (a fresh list of runs, as after a restart) follows the
 *      tool's own process even when a newer row of a shorter command is on the ledger under the same
 *      session. When the command ends it neither closes the run nor starts a second one, and when the
 *      tool ends with its ending line it closes the run as finished.
 *   2. A check run's session is read by the same rule (`runsToPickUp`): a newer row of one of its
 *      commands is not the run's process.
 *   3. While the entry's last run's own process is alive, even when the entry records that run as ended,
 *      the worker is not handed the entry (a pass files no session for it), and `tool-started` for a new
 *      session is refused with 409 and writes nothing. Once that process has ended, the entry is handed
 *      out again and the start is taken. The tool's own call for its own session is answered as before.
 *
 * WHAT IS NOT REAL. The merge tool is `tests/fake-merge-tool.mjs` (MOLE_OFFICE_FAKE_MERGE_TOOL): its
 * "shadow" branch stands in for a tool that runs a command through `sandbox.mjs exec`, and it merges
 * nothing. The check run in case 2 is a session record made here, whose two process rows name this
 * test's own short-lived child processes. The git trees are synthetic, made under `.logs/` and removed.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { onePass, type PassReport, type WorkerSettings } from '../src/worker/index.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'

const FAKE_MERGE_TOOL = fileURLToPath(new URL('./fake-merge-tool.mjs', import.meta.url))
const FAKE_RUNTIME = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const THE_WORKER = 'mole-office/the-message-worker'

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
const made: string[] = []
const children: ChildProcess[] = []
const watching: Parameters<typeof onePass>[1] = []
type MergeList = NonNullable<Parameters<typeof onePass>[2]>
/** Every list of merge tool runs this file makes, so `afterAll` stops whatever is still running in any of them. */
const everyMergeList: MergeList[] = []

const as = (type: 'agent' | 'human', id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asStarter = as('agent', 'fw-starter')
const asSubmitter = as('agent', 'fw-worker')
const asTheOffice = as('agent', THE_WORKER)

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: (r.body === '' ? {} : r.json()) as Record<string, any>, raw: r.body }
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `follows-the-tool-${prefix}-`))
  made.push(dir)
  return dir
}

function tree(): string {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic follows-the-tool fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), 'submitted\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic submission')
  return dir
}

async function aSealedRun(): Promise<string> {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic follows-the-tool run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'fw-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'fw-worker', cutFrom: 'main', workingDirectory: tree() },
  }).id
  const r = await call('PATCH', `/api/records/${run}`, asSubmitter, { dataPatch: { state: 'finished', submission: { kind: 'git' } } })
  expect(r.status, r.raw).toBe(200)
  return run
}

/** Submit a run's git changeset. The branch name tells the synthetic tool how to behave. */
async function submit(branch: string): Promise<string> {
  const r = await call('POST', '/api/merge-queue', asSubmitter, { run: await aSealedRun(), changeset: { adapter: 'git', repository: 'fixture-main', branch } })
  expect(r.status, r.raw).toBe(201)
  return String(r.body['entry'].id)
}

async function entry(id: string): Promise<Record<string, any>> {
  const r = await call('GET', `/api/merge-queue/${id}`, asPerson)
  expect(r.status, r.raw).toBe(200)
  return r.body['entry'] as Record<string, any>
}

async function processRows(session: string): Promise<Record<string, any>[]> {
  const r = await call('GET', `/api/resources?sessionRecordId=${session}&includeReleased=true`, asPerson)
  expect(r.status, r.raw).toBe(200)
  return (r.body['resources'] as Record<string, any>[]).filter((row) => row.type === 'process')
}

async function passUntil(what: string, done: () => Promise<boolean>, list: MergeList): Promise<PassReport[]> {
  const reports: PassReport[] = []
  const deadline = Date.now() + 20_000
  for (;;) {
    reports.push(await onePass(settings, watching, list))
    if (await done()) return reports
    if (Date.now() >= deadline) throw new Error(`${what} did not happen within 20 seconds. Last pass: ${JSON.stringify(reports.at(-1)?.merges)}`)
    await new Promise((go) => setTimeout(go, 100))
  }
}

async function until(what: string, done: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!(await done())) {
    if (Date.now() >= deadline) throw new Error(`${what} did not happen within ${String(ms / 1000)} seconds.`)
    await new Promise((go) => setTimeout(go, 100))
  }
}

const stillGoing = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function theWanted(): Promise<Record<string, any>[]> {
  const r = await call('GET', '/api/worker/merges', asTheOffice)
  expect(r.status, r.raw).toBe(200)
  return r.body['wanted'] as Record<string, any>[]
}

/** The ids of every merge tool run's session record in this office. */
async function mergeToolSessions(): Promise<string[]> {
  const r = await call('GET', '/api/records?kind=session&limit=1000&shape=full', asPerson)
  expect(r.status, r.raw).toBe(200)
  return (r.body['records'] as { id: string; data: Record<string, unknown> }[]).filter((one) => one.data['runtime'] === 'merge-tool').map((one) => one.id).sort()
}

/** A merge tool run's session record, filed as the worker files one. */
async function aMergeToolSession(id: string, title: string): Promise<string> {
  const r = await call('POST', '/api/records', asTheOffice, {
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'merge-tool', startedByMoleOffice: true, extra: { purpose: 'merge', mergeEntry: id } },
  })
  expect(r.status, r.raw).toBe(201)
  return String(r.body['record'].id)
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
    [asPerson, 'fw-starter', undefined],
    [asStarter, 'fw-worker', ['work']],
  ] as const) {
    const r = await call('POST', '/api/agents/started', by, { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) })
    expect(r.status, r.raw).toBe(201)
  }
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-follows-the-tool-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 1,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_MERGE_TOOL: FAKE_MERGE_TOOL, MOLE_OFFICE_FAKE_RUNTIME: FAKE_RUNTIME },
  }
}, 60_000)

afterAll(async () => {
  for (const list of everyMergeList) for (const run of list) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle)
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
  if (outputs !== undefined) rmSync(outputs, { recursive: true, force: true })
}, 30_000)

// ============================================================================ 1. the merge tool

describe('a worker that picks up a merge tool run', () => {
  it('follows the tool, not the newer row of a command it ran, and closes the run only when the tool ends', async () => {
    const id = await submit('synthetic-shadow')
    const first: MergeList = []
    everyMergeList.push(first)
    await passUntil('the tool starting', async () => first.length === 1, first)
    const session = first[0]!.session
    const toolPid = first[0]!.handle.pid

    // THE TOOL'S COMMAND IS ON THE LEDGER, newer than the tool's own row and still running.
    await until('the command registering its row', async () => (await processRows(session)).filter((row) => row.releasedAt === null).length === 2)
    const rows = await processRows(session)
    const own = rows.find((row) => row.startedByTheProduct === true)!
    const command = rows.find((row) => row.startedByTheProduct !== true)!
    expect(own.key).toBe(String(toolPid))
    expect(command.key).not.toBe(String(toolPid))
    expect(rows[0]!.id, 'the ledger lists the command first, as it listed the suite first').toBe(command.id)

    // THE FIRST WORKER IS GONE; A SECOND ONE PICKS THE RUN UP.
    // KEPT ON A LIST `afterAll` READS, so a failing case still stops the tool.
    everyMergeList.push(first.splice(0, first.length))
    const second: MergeList = []
    everyMergeList.push(second)
    const picked = await onePass(settings, watching, second)
    expect(picked.merges.pickedUp).toEqual([session])
    expect(second[0]).toMatchObject({ entry: id, session, ledgerRow: own.id, handle: { pid: toolPid, pgid: own.pgid } })

    // THE COMMAND ENDS. The second worker keeps watching the tool, closes nothing and starts nothing.
    const commandPid = Number(command.key)
    await until('the command ending', () => !stillGoing(commandPid))
    const quiet: PassReport[] = []
    for (let i = 0; i < 5; i += 1) {
      quiet.push(await onePass(settings, watching, second))
      await new Promise((go) => setTimeout(go, 100))
    }
    expect(quiet.flatMap((r) => r.merges.ended)).toEqual([])
    expect(quiet.flatMap((r) => r.merges.started)).toEqual([])
    expect(stillGoing(toolPid)).toBe(true)
    expect((await entry(id)).tool).toMatchObject({ session })
    expect((await entry(id)).tool.endedAt ?? null).toBeNull()
    expect(second.map((run) => run.session)).toEqual([session])

    // THE TOOL ENDS WITH ITS ENDING LINE, and the run is closed as finished.
    process.kill(toolPid, 'SIGTERM')
    await passUntil('the run closing', async () => typeof (await entry(id)).tool.endedAt === 'string', second)
    expect((await entry(id)).tool.reason).toContain('ran one short command beside itself')
    const run = (await call('GET', `/api/records/${session}`, asPerson)).body['record'].data as Record<string, any>
    expect(run['state']).toBe('finished')
    expect((await processRows(session)).find((row) => row.id === own.id)!.releasedAt).toBeTruthy()
    const withdrawn = await call('POST', `/api/merge-queue/${id}/withdraw`, asSubmitter, { because: 'Synthetic: the follows-the-tool case is over.' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
  }, 60_000)
})

// ============================================================================ 2. the check tool

describe('a check run whose session holds a row of one of its commands', () => {
  it('is picked up by its own process, not by the newer row of the command', async () => {
    const { runsToPickUp } = await import('../src/server/lib/worker.ts')
    const { registerResource } = await import('../src/server/lib/resources.ts')
    const listed = (await call('GET', '/api/participants', asPerson)).body['agents'] as { id: string; handle: string }[]
    const agentId = one(listed.filter((a) => a.handle === 'fw-worker'), 'the registry row of fw-worker').id
    const message = await call('POST', '/api/records', asPerson, {
      kind: 'message',
      title: 'Synthetic: a message a check run is delivering',
      data: { body: 'Synthetic: a message a check run is delivering.', to: [{ kind: 'agent', id: agentId }] },
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(message.status, message.raw).toBe(409)
    const messageId = String(message.body['record'].id)
    const check = t.api.createRecord({
      kind: 'session',
      title: 'Synthetic check run whose command registered a row',
      workspaceId: 'default',
      actor: { type: 'agent', id: THE_WORKER },
      origin: 'fixture',
      data: { state: 'running', runtime: 'inspection-tool', startedByMoleOffice: true, deliveringMessage: messageId, servingAgent: 'fw-worker', servingAgentId: agentId, extra: { inspectionRun: 'synthetic' } },
    }).id
    // EACH IN A GROUP OF ITS OWN, so no signal to a row's group can reach this test's own processes.
    const tool = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore', detached: true })
    const command = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore', detached: true })
    children.push(tool, command)
    const office = { type: 'agent' as const, id: THE_WORKER }
    await until('both children running', () => stillGoing(tool.pid!) && stillGoing(command.pid!))
    const own = registerResource({ workspaceId: 'default', sessionRecordId: check, type: 'process', key: String(tool.pid), detail: 'synthetic check tool', startedByTheProduct: true, actor: office })
    // A SECOND LATER, so the command's row is the newest by the ledger's stamp in whole seconds.
    await new Promise((go) => setTimeout(go, 1_100))
    registerResource({ workspaceId: 'default', sessionRecordId: check, type: 'process', key: String(command.pid), detail: 'synthetic command of the check', actor: office })
    const found = runsToPickUp('default').filter((run) => run.session === check)
    expect(found, JSON.stringify(runsToPickUp('default'))).toHaveLength(1)
    expect(found[0]).toMatchObject({ pid: tool.pid, pgid: own.pgid })
    tool.kill('SIGKILL')
    command.kill('SIGKILL')
  }, 30_000)
})

// ============================================================================ 3. the office's refusal

describe('the office starts no second merge tool beside a live one', () => {
  it('refuses a new run while the last run\'s own process is alive, even with that run recorded ended, and takes it once the process has ended', async () => {
    const id = await submit('synthetic-hangs-beside')
    const first: MergeList = []
    everyMergeList.push(first)
    await passUntil('the tool starting', async () => first.some((run) => run.entry === id), first)
    const lost = first.find((run) => run.entry === id)!
    first.splice(first.indexOf(lost), 1)
    everyMergeList.push([lost])
    const session = lost.session
    const toolPid = lost.handle.pid
    const own = (await processRows(session)).find((row) => row.startedByTheProduct === true)!
    expect(own.key).toBe(String(toolPid))

    // THE TOOL'S OWN CALL FOR ITS OWN SESSION is answered as before.
    const itself = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session, log: lost.handle.outputPath })
    expect(itself.status, itself.raw).toBe(200)

    // THE WRONG CLOSING OF FINDING 80: the entry records the run as ended while its tool still runs.
    const closed = await call('POST', `/api/merge-queue/${id}/tool-ended`, asTheOffice, { session, reason: 'Synthetic: a worker that followed the wrong row closed it.' })
    expect(closed.status, closed.raw).toBe(200)
    expect(stillGoing(toolPid)).toBe(true)

    // THE WORKER IS NOT HANDED THE ENTRY while that process lives, so a pass files no session for it.
    expect((await entry(id)).toolWanted).toEqual({ since: expect.any(String) })
    expect((await theWanted()).map((w) => w.entry)).not.toContain(id)
    const sessionsBefore = await mergeToolSessions()
    expect(sessionsBefore, 'the list holds the runs this file started, so an equal list after is a real reading').toContain(session)
    const pass = await onePass(settings, watching, first)
    expect(pass.merges.started).toEqual([])
    expect(await mergeToolSessions()).toEqual(sessionsBefore)

    // A START THAT GETS PAST THAT LIST is refused by the entry itself.
    const next = await aMergeToolSession(id, 'Synthetic second merge tool run')
    const before = JSON.stringify(t.api.getRecord(id)!.data)
    const refused = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session: next, log: join(outputs, 'second.log') })
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.raw).toContain(session)
    expect(refused.raw).toContain(`pid ${String(toolPid)}`)
    expect(refused.raw).toContain('Nothing was written')
    expect(JSON.stringify(t.api.getRecord(id)!.data)).toBe(before)

    // THE TOOL'S PROCESS ENDS, and its row stays open: nobody released it. The start is taken now.
    lost.adapter.stop(lost.handle)
    await until('the tool ending', () => !lost.adapter.alive(lost.handle))
    expect((await processRows(session)).find((row) => row.id === own.id)!.releasedAt).toBeNull()
    const afterTheProcessEnded = await call('GET', '/api/worker/merges', asTheOffice)
    expect(afterTheProcessEnded.status, afterTheProcessEnded.raw).toBe(200)
    expect((afterTheProcessEnded.body['going'] as Record<string, any>[]).find((one) => one.session === session)).toMatchObject({
      endedOnTheEntry: 'Synthetic: a worker that followed the wrong row closed it.',
      startupFailed: null,
    })
    expect((await theWanted()).map((w) => w.entry)).not.toContain(id)
    const recovered = await onePass(settings, watching, first)
    expect(recovered.merges.ended).toContainEqual(expect.objectContaining({ entry: id, session }))
    expect((await call('GET', `/api/records/${session}`, asPerson)).body['record'].data['state']).toBe('crashed')
    expect((await theWanted()).map((w) => w.entry)).toContain(id)
    const taken = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session: next, log: join(outputs, 'second.log') })
    expect(taken.status, taken.raw).toBe(200)
    expect(taken.body['entry'].tool).toMatchObject({ session: next })
    const withdrawn = await call('POST', `/api/merge-queue/${id}/withdraw`, asSubmitter, { because: 'Synthetic: the refusal case is over.' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
  }, 60_000)
})
