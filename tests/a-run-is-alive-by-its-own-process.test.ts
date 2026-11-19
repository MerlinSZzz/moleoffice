// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN IS ALIVE WHEN ITS OWN PROCESS IS: THE ROW THE OFFICE REGISTERED FOR IT, AND THE PROCESS THAT
 * STARTED WHEN ITS HANDLE SAYS. Block b-8 of report fLO2mRF38b9C, items a and b.
 *
 * a. A run's commands file process rows under the run's session (`tools/sandbox.mjs exec --session
 *    <run>` files one per build, suite or rerun). `runServing`, `whyThisRunWasCutOff` and `workerRuns`
 *    used to count ANY live process row of the session, so a live build kept a run whose agent had
 *    ended reading as going. For a run the office started they now read only its own row, the one
 *    registered with `startedByTheProduct: true` (`theToolsOwnProcessRow`). A run started with
 *    `tools/sandbox.mjs exec` registers its own process without that mark, so for such a run
 *    `runServing` still reads any live row; the second case below holds that.
 *
 * b. The worker's own check (`runIsAlive`) used to ask the kernel about the pid alone, so a pid given
 *    to another program read as the run. It now compares the process's start time with the handle's.
 *
 * WHAT IS NOT REAL. The agent, the message and the session records are synthetic, made in a throwaway
 * database. Every process is this test's own short-lived `node -e` child, each in a group of its own,
 * and each is stopped and seen gone before its case ends.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { localStamp } from '../src/shared/time.ts'
import { endRun, runIsAlive, startRun } from '../src/worker/runtimes/common.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const THE_WORKER = 'mole-office/the-message-worker'
/** On every child's command line, so a look at the process table after the run can find any left over. */
const MARK = 'synthetic-a-run-is-alive-by-its-own-process'

let t: TestDb
let app: FastifyInstance
let outputs: string
let agentId: string
const children: ChildProcess[] = []
const groups: number[] = []

const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

function isGoing(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(what: string, done: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`waited 10 seconds for ${what}`)
    await new Promise((go) => setTimeout(go, 20))
  }
}

/** A child in a group of its own, so no signal to a row's group reaches this test. */
async function aChild(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', MARK], { stdio: 'ignore', detached: true })
  children.push(child)
  groups.push(child.pid!)
  await until('the child running', () => isGoing(child.pid!))
  return child
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const ended = new Promise((go) => child.once('exit', go))
    process.kill(-child.pid!, 'SIGKILL')
    await ended
  }
  expect(isGoing(child.pid!), `child ${String(child.pid)} is still running`).toBe(false)
}

async function aMessage(): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson,
    payload: { kind: 'message', title: 'Synthetic: a message a run is delivering', data: { body: 'Synthetic: a message a run is delivering.', to: [{ kind: 'agent', id: agentId }] } },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(r.statusCode, r.body).toBe(409)
  return String(r.json().record.id)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle: 'ar-worker', name: 'Synthetic ar-worker' } })
  expect(r.statusCode, r.body).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: asPerson })).json().agents as { id: string; handle: string }[]
  agentId = one(listed.filter((a) => a.handle === 'ar-worker'), 'the registry row of ar-worker').id
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-alive-rows-'))
}, 60_000)

afterAll(async () => {
  for (const pgid of groups) {
    try {
      process.kill(-pgid, 'SIGKILL')
    } catch {
      // Already gone, which is what every case left it as.
    }
  }
  await app?.close()
  t?.close()
  if (outputs !== undefined) rmSync(outputs, { recursive: true, force: true })
})

// ============================================================================ a. the run's own row

describe("a run the office started, whose own process has ended while a command's row is alive", () => {
  it('reads as gone to runServing, whyThisRunWasCutOff and workerRuns', async () => {
    const { registerResource } = await import('../src/server/lib/resources.ts')
    const { runServing, whyThisRunWasCutOff, workerRuns, thisServerLoadedAt } = await import('../src/server/lib/worker.ts')
    const session = t.api.createRecord({
      kind: 'session',
      title: 'Synthetic run whose command registered a row',
      workspaceId: 'default',
      actor: { type: 'agent', id: THE_WORKER },
      origin: 'fixture',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, deliveringMessage: await aMessage(), servingAgent: 'ar-worker', servingAgentId: agentId },
    }).id
    // FILED BEFORE THIS SERVER LOADED, which is what `whyThisRunWasCutOff` asks of a run a restart cut off.
    const before = localStamp(new Date(Date.now() - 60 * 60_000))
    expect(before < thisServerLoadedAt()).toBe(true)
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(before, session)

    const agent = await aChild()
    const command = await aChild()
    const office = { type: 'agent' as const, id: THE_WORKER }
    registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(agent.pid), detail: 'synthetic agent run', startedByTheProduct: true, actor: office })
    registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(command.pid), detail: 'synthetic command of the run', actor: office })

    // THE CONTROL: with its own process alive, all three read the run as going.
    expect(runServing(agentId, 'default')).toBe(session)
    expect(whyThisRunWasCutOff(session, 'default')).toBeNull()
    expect(workerRuns().inFlight.map((run) => run.session)).toContain(session)

    await stop(agent)
    expect(isGoing(command.pid!), 'the command must still be running for this to prove anything').toBe(true)

    expect(runServing(agentId, 'default'), 'runServing counted the command as the run').toBeNull()
    expect(whyThisRunWasCutOff(session, 'default'), 'whyThisRunWasCutOff counted the command as the run').not.toBeNull()
    expect(workerRuns().inFlight.map((run) => run.session), 'workerRuns counted the command as the run').not.toContain(session)

    await stop(command)
  }, 30_000)
})

describe('a run started with tools/sandbox.mjs exec, whose one process row carries no mark', () => {
  it('still reads as going to runServing while that process is alive', async () => {
    const { registerResource } = await import('../src/server/lib/resources.ts')
    const { runServing } = await import('../src/server/lib/worker.ts')
    const session = t.api.createRecord({
      kind: 'session',
      title: 'Synthetic run started in a sandbox',
      workspaceId: 'default',
      actor: { type: 'agent', id: 'ar-worker' },
      origin: 'fixture',
      data: { state: 'running', runtime: 'claude-code', servingAgent: 'ar-worker', servingAgentId: agentId },
    }).id
    const agent = await aChild()
    registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(agent.pid), detail: 'synthetic sandbox run', actor: { type: 'agent', id: 'ar-worker' } })
    expect(runServing(agentId, 'default')).toBe(session)
    await stop(agent)
    expect(runServing(agentId, 'default')).toBeNull()
  }, 30_000)
})

it('a checkpoint sandbox worker is alive only by its own marked process, never a surviving command', async () => {
  const { registerResource } = await import('../src/server/lib/resources.ts')
  const { runServing } = await import('../src/server/lib/worker.ts')
  const session = t.api.createRecord({ kind: 'session', title: 'Synthetic checkpoint sandbox run',
    workspaceId: 'default', actor: { type: 'agent', id: 'ar-worker' }, origin: 'fixture',
    data: { state: 'running', runtime: 'codex', servingAgent: 'ar-worker', servingAgentId: agentId,
      extra: { officeCheckpoint: true } },
  }).id
  const model = await aChild()
  const command = await aChild()
  registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(model.pid), startedByTheProduct: true, actor: t.api.HUMAN })
  registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(command.pid), actor: t.api.HUMAN })
  expect(runServing(agentId, 'default')).toBe(session)
  await stop(model)
  expect(isGoing(command.pid!)).toBe(true)
  expect(runServing(agentId, 'default')).toBeNull()
  await stop(command)
})

// ============================================================================ b. the start time

const ANOTHER_PROCESS_STARTED = new Date(Date.now() - 60 * 60_000)

describe("the worker's check that a run is still going", () => {
  it('reads a live pid whose start time is another process\'s as not the run', async () => {
    const child = await aChild()
    const base = { runtime: 'synthetic', pid: child.pid!, pgid: child.pid!, providerSession: null, outputPath: join(outputs, 'other.txt') }
    // The worker's own stamp, to the millisecond, as a run it started carries.
    const { clockStamp } = await import('../src/shared/time.ts')
    const theirs = clockStamp(() => ANOTHER_PROCESS_STARTED)
    expect(runIsAlive({ ...base, startedAt: theirs.stamp, startedTime: theirs }), 'a pid alone was read as the run').toBe(false)
    // The ledger's stamp, in whole local seconds, as a run picked up carries.
    expect(runIsAlive({ ...base, startedAt: localStamp(ANOTHER_PROCESS_STARTED) }), 'a pid alone was read as the run').toBe(false)
    await stop(child)
  }, 30_000)

  it('reads a run the worker started seconds ago as going, by its own stamp and by the ledger\'s, and as ended once it ends', async () => {
    const { registerResource } = await import('../src/server/lib/resources.ts')
    const handle = startRun(
      { runtime: 'synthetic', commandFor: () => ({ command: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)', MARK] }) },
      { cwd: outputs, api: 'http://127.0.0.1:1', workspace: 'default', outputPath: join(outputs, 'started.txt') },
      process.env,
    )
    groups.push(handle.pgid)
    expect(handle.startedTime).toBeDefined()
    expect(runIsAlive(handle)).toBe(true)
    // PICKED UP: the handle carries the ledger's reading of the start and no stamp of the worker's.
    const session = t.api.createRecord({ kind: 'session', title: 'Synthetic run picked up', workspaceId: 'default', actor: { type: 'agent', id: THE_WORKER }, origin: 'fixture', data: { state: 'running' } }).id
    const row = registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(handle.pid), detail: 'synthetic run', startedByTheProduct: true, actor: { type: 'agent', id: THE_WORKER } })
    expect(row.osStartedAt).not.toBeNull()
    const pickedUp = { runtime: handle.runtime, pid: handle.pid, pgid: handle.pgid, startedAt: row.osStartedAt!, providerSession: null, outputPath: handle.outputPath }
    expect(runIsAlive(pickedUp)).toBe(true)
    expect(endRun(handle)).toBe(true)
    await until('the run ending', () => !isGoing(handle.pid))
    expect(runIsAlive(handle)).toBe(false)
    expect(runIsAlive(pickedUp)).toBe(false)
  }, 30_000)
})
