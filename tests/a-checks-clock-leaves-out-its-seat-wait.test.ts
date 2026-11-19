// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK'S CLOCK LEAVES OUT THE TIME IT WAITED FOR A TEST-BATCHES SEAT, AND THE WAIT IS RECORDED.
 *
 * A check asks for a test-batches seat before its model or its standard check starts, and the office may keep it in
 * line. That wait is not time its model has, so the worker leaves it out of the check's clock and writes the wait on
 * the check's session record as waitedForASeatSeconds. The lines that say a wait began and ended come from
 * src/config/a-checks-seat-wait.mjs, and tools/the-inspector.mjs writes them around every seat question.
 *
 * THE CASES, through the worker's real onePass and an office in a scratch database:
 *   1. The check asks, waits past its clock, settles and ends inside the clock. The worker does not stop it, and the
 *      record's wait is the reader's rounded wait.
 *   2. The check settles, then runs past the clock. The worker stops it, its stop words name the wait, and the record
 *      holds it.
 *   3. The wait stays open past the clock. The worker does not stop it while it is open, and records the closed wait
 *      once it settles.
 *   4. The output holds no seat line and the check hangs. The worker stops it with exactly the words it used before
 *      these lines existed, and no wait is recorded: absence is not zero.
 *
 * The reader itself is cased here too: two closed waits add up, an open one names its instant, a later part of the
 * output continues from an earlier one, a line the inspector stamped is read, the words inside a longer line are not,
 * and a line whose instant cannot be read is not read.
 *
 * THE STAND-IN IS tests/fake-inspection-tool-that-waits-for-its-seat.mjs. It runs no model and judges no work, and it
 * prints the two lines from the module. Each of its waits is at least three times the clock. Nothing reaches the live
 * office.
 *
 * MUTATIONS, each after a control run: a closed wait added as zero; an open begin not kept; the clock without the wait
 * subtracted; the stop words without the wait; the field written as zero when no line was read; the field never
 * written; the output read only after the check ends; the offset not advanced; the inspector's finished line left out;
 * the inspector's began line left out. Each turns one of these cases red.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, theClockStopSays, type WorkerSettings } from '../src/worker/index.ts'
import {
  THE_CHECK_BEGAN_ASKING,
  theCheckBeganAsking,
  theCheckFinishedAsking,
  theSeatWaitsIn,
} from '../src/config/a-checks-seat-wait.mjs'

const REPO = process.cwd()
let checkout: string
let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let tree: string
const watching: Parameters<typeof onePass>[1] = []

interface Check { message: string; execution?: { session: string; log: string; minutes: number; endedAt?: string; failed?: string } }

const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const person = as('human', THE_PERSON)
const worker = as('agent', 'worker-w')
const pause = (ms: number) => new Promise((go) => setTimeout(go, ms))

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers = person) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}
function git(...args: string[]): string { return execFileSync('git', ['-C', tree, ...args], { encoding: 'utf8' }).trim() }
function check(run: string): Check { return t.api.getRecord(run)!.data['theCheck'] as Check }

/** The check's output as far as it has been written. */
function theCheckSaid(run: string): string {
  const log = check(run).execution?.log
  if (log === undefined) return ''
  try {
    return readFileSync(log, 'utf8')
  } catch {
    return ''
  }
}

/** The wait the check's own output names. */
function theChecksWait(run: string): ReturnType<typeof theSeatWaitsIn> {
  return theSeatWaitsIn(theCheckSaid(run))
}

/** Drive the worker's own passes until `done` answers true, never a wall-clock wait on its own. */
async function passUntil(done: () => boolean, timeoutMs = 60_000): Promise<void> {
  const until = Date.now() + timeoutMs
  while (!done()) {
    if (Date.now() > until) throw new Error('The passes did not reach the expected state.')
    await onePass(settings, watching)
    await pause(50)
  }
}

/** The environment for one check, with the clock this case gives it. */
function anEnvironmentWithAClock(minutes: string): NodeJS.ProcessEnv {
  return {
    ...withoutInheritedEffort(),
    MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(REPO, 'tests/fake-inspection-tool-that-waits-for-its-seat.mjs'),
    MOLE_OFFICE_FAKE_RUNTIME: join(REPO, 'tests/fake-runtime.mjs'),
    MOLE_OFFICE_INSPECTION_MODEL: 'sonnet',
    MOLE_OFFICE_INSPECTION_MINUTES: minutes,
  }
}

/** A finished run whose check the office asks for, started by one pass, with `minutes` on its clock. */
async function startACheck(title: string, minutes: string): Promise<{ run: string; session: string; entry: Parameters<typeof onePass>[1][number] }> {
  settings.env = anEnvironmentWithAClock(minutes)
  const run = t.api.createRecord({ kind: 'session', title, workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: 'worker-w' },
    data: { state: 'running', servingAgent: 'worker-w', workingDirectory: tree, cutFrom: 'main', doing: 'Synthetic fixture changes work/a.txt.' } }).id
  const ended = await call('PATCH', `/api/records/${run}`, { dataPatch: { state: 'finished' } }, worker)
  expect(ended.status, ended.raw).toBe(200)
  if (!check(run).message) {
    const asked = await call('POST', `/api/checks/${run}/ask-again`, {}, person)
    expect(asked.status, asked.raw).toBe(200)
  }
  const until = Date.now() + 20_000
  while (check(run).execution?.session === undefined) {
    if (Date.now() > until) throw new Error(`The check of ${run} never started.`)
    await onePass(settings, watching)
    await pause(50)
  }
  const session = check(run).execution!.session
  const entry = watching.find((one) => one.session === session)
  if (entry === undefined) throw new Error(`The worker is not watching the check ${session}.`)
  return { run, session, entry }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  for (const [headers, data] of [
    [person, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
    [person, { handle: 'inspector-one', name: 'Synthetic Inspector', role: 'inspector' }],
    [person, { handle: 'super-r', name: 'Synthetic Supervisor', role: 'supervisor' }],
    [as('agent', 'super-r'), { handle: 'worker-w', name: 'Synthetic Worker', role: 'worker', workArea: ['work'] }],
  ] as const) {
    const registered = await call('POST', '/api/agents/started', data, headers)
    expect(registered.status, registered.raw).toBe(201)
  }
  checkout = aCheckoutForATestRun()
  tree = realpathSync(aTestDatabaseFolder('a-checks-seat-clock'))
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Synthetic seat-clock fixture')
  mkdirSync(join(tree, 'work')); writeFileSync(join(tree, 'work/a.txt'), 'Synthetic before.\n')
  git('add', '.'); git('commit', '-q', '-m', 'Synthetic baseline'); git('switch', '-q', '-c', 'work')
  writeFileSync(join(tree, 'work/a.txt'), 'Synthetic after.\n'); git('commit', '-q', '-am', 'Synthetic work')
  settings = { api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`, workspace: 'default', session: null, stopWithPid: null,
    checkout, runs: 9, hops: 3, outputRoot: aTestDatabaseFolder('a-checks-seat-clock-output'), env: anEnvironmentWithAClock('0.05') }
}, 60_000)

afterAll(async () => {
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The seat-clock test ended.')
  await app?.close(); t?.close()
}, 60_000)

describe('the reader of the two seat lines', () => {
  const at = (ms: number): string => new Date(ms).toISOString()

  it('adds the closed waits and names the wait still open', () => {
    const text = [theCheckBeganAsking(at(1_000)), theCheckFinishedAsking(at(3_000)), theCheckBeganAsking(at(5_000))].join('\n')
    expect(theSeatWaitsIn(text)).toEqual({ closedMs: 2_000, openSince: at(5_000), readALine: true })
  })

  it('continues from what an earlier part of the same output said', () => {
    const first = `${theCheckBeganAsking(at(1_000))}\n`
    const second = `${theCheckFinishedAsking(at(4_000))}\n`
    const soFar = theSeatWaitsIn(first)
    expect(soFar).toEqual({ closedMs: 0, openSince: at(1_000), readALine: true })
    expect(theSeatWaitsIn(second, soFar)).toEqual({ closedMs: 3_000, openSince: null, readALine: true })
  })

  it('reads a line the inspector stamped, and not the words inside a longer line', () => {
    expect(theSeatWaitsIn(`${at(9_000)} ${theCheckBeganAsking(at(1_000))}\n`)).toEqual({ closedMs: 0, openSince: at(1_000), readALine: true })
    expect(theSeatWaitsIn(`The model wrote: ${theCheckBeganAsking(at(1_000))}\n`)).toEqual({ closedMs: 0, openSince: null, readALine: false })
    expect(theSeatWaitsIn(`${theCheckBeganAsking(at(1_000))} and more.\n`)).toEqual({ closedMs: 0, openSince: null, readALine: false })
  })

  it('does not read a line whose instant cannot be read, so its time counts as it did before', () => {
    const text = `${THE_CHECK_BEGAN_ASKING}not-an-instant.\n${THE_CHECK_BEGAN_ASKING}2026-13-40T25:61:61.000Z.\n`
    expect(theSeatWaitsIn(text)).toEqual({ closedMs: 0, openSince: null, readALine: false })
  })

  it('reads a finished line with no begin as a seat line and no wait', () => {
    expect(theSeatWaitsIn(`${theCheckFinishedAsking(at(1_000))}\n`)).toEqual({ closedMs: 0, openSince: null, readALine: true })
  })
})

describe("a check's clock and the wait for its seat", () => {
  it('leaves out a wait that outlasts the clock, so the check ends on its own and the wait is recorded', async () => {
    const minutes = '0.05'
    const clockMs = Number(minutes) * 60_000
    const { run, session, entry } = await startACheck('Synthetic check that waits beyond its clock and then settles', minutes)
    await passUntil(() => theCheckSaid(run).includes(THE_CHECK_BEGAN_ASKING), 15_000)
    // TWO CLOCKS OF PASSES WHILE THE WAIT IS OPEN: a clock that counted the wait would have stopped it.
    const until = Date.now() + 2 * clockMs
    while (Date.now() < until) {
      await onePass(settings, watching)
      expect(entry.ended, 'the worker stopped a check whose seat wait was open').toBeUndefined()
      expect(entry.adapter.alive(entry.handle), 'the worker stopped a check whose seat wait was open').toBe(true)
      await pause(100)
    }
    await passUntil(() => t.api.getRecord(session)!.data['state'] !== 'running', 30_000)
    const waits = theChecksWait(run)
    expect(waits.readALine).toBe(true)
    expect(waits.openSince).toBeNull()
    expect(waits.closedMs).toBeGreaterThanOrEqual(3 * clockMs)
    const data = t.api.getRecord(session)!.data
    expect(data['waitedForASeatSeconds']).toBe(Math.round(waits.closedMs / 1000))
    expect(entry.ended?.endedHow).not.toBe('stopped')
  }, 90_000)

  it('stops a check that runs past its clock after it settled, and the stop words name the wait', async () => {
    const minutes = '0.025'
    const clockMs = Number(minutes) * 60_000
    const { run, session, entry } = await startACheck('Synthetic check that settles then runs past its clock', minutes)
    await passUntil(() => entry.ended?.endedHow === 'stopped', 45_000)
    const waits = theChecksWait(run)
    expect(waits.readALine).toBe(true)
    expect(waits.openSince).toBeNull()
    expect(waits.closedMs).toBeGreaterThanOrEqual(3 * clockMs)
    const theWords = theClockStopSays(Number(minutes), waits.closedMs)
    expect(entry.said).toEqual({ text: '', because: theWords })
    expect(entry.ended).toMatchObject({ endedHow: 'stopped', because: theWords })
    await passUntil(() => t.api.getRecord(session)!.data['state'] !== 'running', 30_000)
    expect(t.api.getRecord(session)!.data['waitedForASeatSeconds']).toBe(Math.round(waits.closedMs / 1000))
  }, 90_000)

  it('does not stop a check whose wait is still open past its clock, and records the wait when it closes', async () => {
    const minutes = '0.0125'
    const clockMs = Number(minutes) * 60_000
    const { run, session, entry } = await startACheck('Synthetic check that holds its seat wait open past its clock', minutes)
    await passUntil(() => theCheckSaid(run).includes(THE_CHECK_BEGAN_ASKING), 15_000)
    const until = Date.now() + Math.max(3 * clockMs, 1_000)
    while (Date.now() < until) {
      await onePass(settings, watching)
      expect(entry.ended, 'the worker stopped a check whose seat wait was open').toBeUndefined()
      expect(entry.adapter.alive(entry.handle), 'the worker stopped a check whose seat wait was open').toBe(true)
      await pause(100)
    }
    await passUntil(() => t.api.getRecord(session)!.data['state'] !== 'running', 30_000)
    const waits = theChecksWait(run)
    expect(waits.readALine).toBe(true)
    expect(waits.openSince).toBeNull()
    expect(waits.closedMs).toBeGreaterThanOrEqual(3 * clockMs)
    const data = t.api.getRecord(session)!.data
    expect(data['waitedForASeatSeconds']).toBe(Math.round(waits.closedMs / 1000))
    expect(entry.ended?.endedHow).not.toBe('stopped')
  }, 90_000)

  it('stops a check with no seat line exactly as today, and records no wait', async () => {
    const minutes = '0.005'
    const { session, entry } = await startACheck('Synthetic check with no seat line, waiting to be stopped', minutes)
    await passUntil(() => entry.ended?.endedHow === 'stopped', 20_000)
    const theWords = theClockStopSays(Number(minutes), null)
    expect(entry.said).toEqual({ text: '', because: theWords })
    expect(entry.ended).toMatchObject({ endedHow: 'stopped', because: theWords })
    await passUntil(() => t.api.getRecord(session)!.data['state'] !== 'running', 20_000)
    expect('waitedForASeatSeconds' in t.api.getRecord(session)!.data).toBe(false)
  }, 60_000)
})
