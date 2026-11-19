// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK ENDS, AND ITS CLOCK RUNS, WHILE THE CHECKS SWITCH IS OFF.
 *
 * THE GAP. In merges-only mode a pass asked the office whether checks run in this mode (GET
 * /api/office/checks-in-merges-only) and, when the reading could not be read or said the switch was off or named no
 * check for this project, returned at once. So while the switch was off a check the worker was watching was not closed
 * when its process ended, the clock that stops a check after its minutes did not run, and the checks another worker
 * left running were not picked up. All three happened only at the first pass after the switch was on again. A check
 * that ended while the switch was off was closed only after it was on again.
 *
 * WHAT IS PROVED HERE, against an office made only for this file and the real worker pass. In each case a merges-only
 * worker is watching a check it started; the check tool is tests/fake-inspection-tool.mjs, whose "Synthetic
 * interrupted" checks wait until they are stopped.
 *
 *   1. The switch is off and the check's process has ended. One pass tells the office the check ended and lets the
 *      check go from the worker's list.
 *   2. The switch is off and the check has run past its minutes. One pass stops its process group, with the sentence
 *      about its minute clock.
 *   3. The switch's reading cannot be read: the office's own reader refuses a value the test stored, and answers 500.
 *      As case 1.
 *   4. limits.checksAtOnce is 0. As case 1.
 *   5. projects names another project only. As case 1, and the worker's stderr carries the sentence that names both
 *      projects once over two passes.
 *   6. The switch is off and the worker's list is empty. One pass picks up the check the office records as running,
 *      and it is in the worker's list after the pass.
 *   7. A GUARD. No pass of cases 1 to 6 reads the queue, and the queued ask is never started. It goes red if the pass
 *      goes on to the queue reading when no check may start, because the queued ask would then be marked delivered
 *      and a check would start.
 *   8. A GUARD. With the switch on, the ended check is closed as before and the queued ask starts a check. It goes red
 *      if the change breaks the path where checks run.
 *
 * WHAT IS NOT REAL. The office cannot hold one of these readings: its writer refuses a checksAtOnce of 0, and its
 * reader refuses it too. So for case 4 the test stands in the office's place and answers the switch's reading on the
 * office's own app; everything else is the real office. Case 3 is the real office answering 500 for a value its
 * reader refuses, and case 5 is the real office switched on for a second project through its own door. The check tool
 * is tests/fake-inspection-tool.mjs, so no model is called. The runs worked in a throwaway git repository under the
 * system's temporary folder.
 *
 * CONTROL: red before the change (cases 1 to 6), green after. MUTATION: in the commit that adds the code.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { outputOf } from '../src/worker/runtimes/common.ts'

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let tree: string
const made: string[] = []
type Watching = Parameters<typeof onePass>[1]
type OneWatching = Watching[number]
/** The checks the ordinary worker started in beforeAll, in the order the cases take them. */
const started: { run: string; session: string; entry: OneWatching }[] = []
/** The checks the worker watches. */
const watching: Watching = []
/** The worker after a restart: the same office, and a list of its own. */
const restarted: Watching = []
/** The ask of the office that must stay queued while no check may start, and starts in case 8. */
let queuedAsk = { run: '', message: '' }

const SWITCH = '/api/office/checks-in-merges-only'
const SECOND = 'elsewhere'
/** This check's own clock, so its minutes have passed: minutes() reads it from the check's target. */
const CHECK_MINUTES = 0.0001
const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const person = as('human', THE_PERSON)
const worker = as('agent', 'worker-w')

/** Every request the office answered, by its path and query. */
const requests: string[] = []
/** The reading the test stands in the office's place for (case 4), or null to let the real office answer. */
let theSwitchAnswer: { status: number; body: unknown } | null = null

interface Check { message: string; execution?: { session: string; endedAt?: string; failed?: string } }

function scratch(what: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `check-ends-${what}-`)))
  made.push(dir)
  return dir
}
function git(...args: string[]): string { return execFileSync('git', ['-C', tree, ...args], { encoding: 'utf8' }).trim() }
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers = person) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}
function check(run: string): Check { return t.api.getRecord(run)!.data['theCheck'] as Check }
const pause = (ms: number) => new Promise((go) => setTimeout(go, ms))
const mergesOnly = (): WorkerSettings => ({ ...settings, mergesOnly: true })
const queueReads = (): number => requests.filter((path) => path.startsWith('/api/worker/queue')).length
const requestsTo = (path: string): number => requests.filter((one) => one === path).length
const holds = (list: Watching, one: OneWatching): boolean => list.some((run) => run.session === one.session)

/** A worker's run, finished, so the office asks for its check. The run and the ask. */
async function sealed(title: string): Promise<{ run: string; message: string }> {
  const run = t.api.createRecord({ kind: 'session', title, workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: 'worker-w' },
    data: { state: 'running', servingAgent: 'worker-w', workingDirectory: tree, cutFrom: 'main', doing: 'Synthetic fixture changes work/a.txt.' } }).id
  const ended = await call('PATCH', `/api/records/${run}`, { dataPatch: { state: 'finished' } }, worker)
  expect(ended.status, ended.raw).toBe(200)
  // A worker's seal may leave its round note instead of an ask, so the person asks explicitly.
  if (!check(run).message) {
    const asked = await call('POST', `/api/checks/${run}/ask-again`, {}, person)
    expect(asked.status, asked.raw).toBe(200)
  }
  expect(check(run).message).toBeTruthy()
  return { run, message: check(run).message }
}

/** One pass over `list`, and how many of its requests went to the queue. */
async function aPass(one: WorkerSettings, list: Watching): Promise<{ pass: Awaited<ReturnType<typeof onePass>>; queueReads: number }> {
  const before = queueReads()
  const pass = await onePass(one, list, [], [])
  return { pass, queueReads: queueReads() - before }
}

/** Stop this check's process group and wait until its process is gone. */
async function stopAndWait(one: OneWatching): Promise<void> {
  if (one.adapter.alive(one.handle)) one.adapter.stop(one.handle, 'Synthetic: the test stops this check.')
  const until = Date.now() + 10_000
  while (one.adapter.alive(one.handle)) {
    if (Date.now() > until) throw new Error(`The synthetic check ${one.session} did not stop.`)
    await pause(50)
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  // THE TEST COUNTS EVERY REQUEST, AND STANDS IN THE OFFICE'S PLACE FOR ONE READING THE OFFICE CANNOT HOLD (case 4).
  app.addHook('onRequest', async (request, reply) => {
    requests.push(request.url)
    if (theSwitchAnswer !== null && request.url.startsWith(SWITCH)) {
      reply.code(theSwitchAnswer.status).send(theSwitchAnswer.body)
      return reply
    }
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: SECOND, title: 'Synthetic second project' })
  for (const [headers, data] of [
    [person, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
    [person, { handle: 'inspector-one', name: 'Synthetic Inspector', role: 'inspector' }],
    [person, { handle: 'super-r', name: 'Synthetic Supervisor', role: 'supervisor' }],
    [as('agent', 'super-r'), { handle: 'worker-w', name: 'Synthetic Worker', role: 'worker', workArea: ['work'] }],
  ] as const) {
    const registered = await call('POST', '/api/agents/started', data, headers)
    expect(registered.status, registered.raw).toBe(201)
  }
  tree = scratch('tree')
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Synthetic check-ends fixture')
  mkdirSync(join(tree, 'work')); writeFileSync(join(tree, 'work/a.txt'), 'Synthetic before.\n')
  git('add', '.'); git('commit', '-q', '-m', 'Synthetic baseline'); git('switch', '-q', '-c', 'work')
  writeFileSync(join(tree, 'work/a.txt'), 'Synthetic after.\n'); git('commit', '-q', '-am', 'Synthetic work')

  settings = { api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`, workspace: 'default', session: null, stopWithPid: null,
    checkout: aCheckoutForATestRun(), runs: 16, hops: 3, outputRoot: scratch('output'), env: { ...withoutInheritedEffort(),
      MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(process.cwd(), 'tests/fake-inspection-tool.mjs'), MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs') } }

  // THE SEVEN CHECKS THE ORDINARY WORKER STARTS: one for each of cases 1 to 6 and 8, each waiting until it is stopped.
  const runs: { run: string; message: string }[] = []
  for (let i = 1; i <= 7; i++) runs.push(await sealed(`Synthetic interrupted check ${String(i)} of 7`))
  const until = Date.now() + 60_000
  const allStarted = () => runs.every((one) => check(one.run).execution?.session !== undefined)
  while (!allStarted()) {
    if (Date.now() > until) throw new Error(`The ordinary worker did not start the checks: ${JSON.stringify(runs.map((one) => check(one.run).execution))}`)
    await onePass(settings, watching, [], [])
    await pause(50)
  }
  for (const one of runs) {
    const session = check(one.run).execution!.session
    const entry = watching.find((run) => run.session === session)!
    while (!outputOf(entry.handle).problems.includes('Synthetic check interrupted')) {
      if (Date.now() > until) throw new Error(`The synthetic check of ${one.run} never started waiting.`)
      await pause(50)
    }
    started.push({ run: one.run, session, entry })
  }
  // AND ONE ASK THAT MUST STAY QUEUED: no ordinary pass runs after this, so nothing starts it before case 8.
  queuedAsk = await sealed('Synthetic interrupted check asked while the switch is off')
}, 180_000)

afterAll(async () => {
  for (const one of [...watching, ...restarted]) if (one.adapter.alive(one.handle)) one.adapter.stop(one.handle, 'The check-ends test ended.')
  // Each one has ended before its output folder is removed, so none writes into a folder that is gone.
  const until = Date.now() + 15_000
  while ([...watching, ...restarted].some((one) => one.adapter.alive(one.handle)) && Date.now() < until) await pause(50)
  await app?.close(); t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('a check the worker watches while the checks switch is off', () => {
  it('1: the switch is off and the check has ended: one pass closes it', async () => {
    const mine = started[0]!
    await stopAndWait(mine.entry)
    const { queueReads: reads } = await aPass(mergesOnly(), watching)
    expect(reads, 'a pass with no check may start read the queue').toBe(0)
    expect(requestsTo(`/api/checks/${mine.run}/tool-ended`)).toBe(1)
    expect(check(mine.run).execution).toMatchObject({ session: mine.session, endedAt: expect.any(String) })
    expect(t.api.getRecord(mine.session)!.data['state']).not.toBe('running')
    expect(holds(watching, mine.entry)).toBe(false)
  })

  it('2: the switch is off and the check is past its minutes: one pass stops it', async () => {
    const mine = started[1]!
    // THIS CHECK'S OWN CLOCK IS TINY, so its minutes have passed; no other check in this pass is affected.
    ;(mine.entry.adapter as unknown as { target: { minutes: number } }).target.minutes = CHECK_MINUTES
    const { queueReads: reads } = await aPass(mergesOnly(), watching)
    expect(reads, 'a pass with no check may start read the queue').toBe(0)
    expect(mine.entry.ended).toEqual({
      endedHow: 'stopped',
      because: `The check exceeded its ${String(CHECK_MINUTES)} minute clock. The worker stopped its process group.`,
      providerSession: null,
    })
    await stopAndWait(mine.entry)
    expect(check(mine.run).execution?.endedAt).toBeUndefined()
    expect(holds(watching, mine.entry)).toBe(true)
  })

  it('3: the switch reading cannot be read: one pass closes the ended check', async () => {
    const mine = started[2]!
    await stopAndWait(mine.entry)
    // THE OFFICE'S OWN READER REFUSES THIS STORED VALUE, so the reading really cannot be read and the office answers 500.
    t.client.sqlite.prepare('UPDATE installation SET checks_in_merges_only = 2 WHERE only_row = 1').run()
    try {
      const { queueReads: reads } = await aPass(mergesOnly(), watching)
      expect(reads, 'a pass with no check may start read the queue').toBe(0)
    } finally {
      t.client.sqlite.prepare('UPDATE installation SET checks_in_merges_only = NULL WHERE only_row = 1').run()
    }
    expect(requestsTo(`/api/checks/${mine.run}/tool-ended`)).toBe(1)
    expect(check(mine.run).execution?.endedAt).toBeDefined()
    expect(holds(watching, mine.entry)).toBe(false)
  })

  it('4: limits.checksAtOnce is 0: one pass closes the ended check', async () => {
    const mine = started[3]!
    await stopAndWait(mine.entry)
    // THE OFFICE'S WRITER REFUSES A checksAtOnce OF 0, so the test answers this reading in the office's place.
    theSwitchAnswer = { status: 200, body: { on: true, nobodyChose: false, projects: null, says: 'Synthetic: the office cannot hold this reading.',
      limits: { checksAtOnce: 0, checksAtOnceFrom: 'set here', loadUnder: 16, freeGibAtLeast: 24, theFirstAlwaysStarts: true },
      machine: { loadOneMinute: 1, freeBytes: 32 * 1024 ** 3 } } }
    try {
      const { queueReads: reads } = await aPass(mergesOnly(), watching)
      expect(reads, 'a pass with no check may start read the queue').toBe(0)
    } finally {
      theSwitchAnswer = null
    }
    expect(requestsTo(`/api/checks/${mine.run}/tool-ended`)).toBe(1)
    expect(check(mine.run).execution?.endedAt).toBeDefined()
    expect(holds(watching, mine.entry)).toBe(false)
  })

  it('5: the reading names another project: one pass closes the ended check, and says why once', async () => {
    const mine = started[4]!
    await stopAndWait(mine.entry)
    const on = await call('POST', SWITCH, { on: true, projects: [SECOND], because: 'Synthetic: only the other project.' })
    expect(on.status, on.raw).toBe(200)
    const said: string[] = []
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => { said.push(String(chunk)); return true })
    try {
      expect((await aPass(mergesOnly(), watching)).queueReads, 'a pass with no check may start read the queue').toBe(0)
      expect((await aPass(mergesOnly(), watching)).queueReads, 'a pass with no check may start read the queue').toBe(0)
    } finally {
      stderr.mockRestore()
    }
    const sentence = `Merges-only mode: the office runs checks in this mode for ${SECOND}, not for default, so no check was started.`
    expect(said.filter((one) => one.includes(sentence)), `the worker did not say why exactly once: ${JSON.stringify(said)}`).toHaveLength(1)
    expect(requestsTo(`/api/checks/${mine.run}/tool-ended`)).toBe(1)
    expect(check(mine.run).execution?.endedAt).toBeDefined()
    expect(holds(watching, mine.entry)).toBe(false)
  })

  it('6: the switch is off and the list is empty: one pass picks up the check the office records', async () => {
    const off = await call('POST', SWITCH, { on: false, because: 'Synthetic: the switch is off for this case.' })
    expect(off.status, off.raw).toBe(200)
    const mine = started[5]!
    expect(restarted).toEqual([])
    const { pass, queueReads: reads } = await aPass(mergesOnly(), restarted)
    expect(reads, 'a pass with no check may start read the queue').toBe(0)
    expect(pass.pickedUp).toContain(mine.session)
    expect(restarted.some((run) => run.session === mine.session)).toBe(true)
  })

  it('7: GUARD: no pass of cases 1 to 6 read the queue, and the queued ask is never started', async () => {
    // A GUARD. It goes red if the pass goes on to the queue reading when no check may start: the queued ask would be
    // marked delivered and a check would start for it.
    const before = queueReads()
    const pass = await onePass(mergesOnly(), watching, [], [])
    expect(queueReads() - before, 'a pass with no check may start read the queue').toBe(0)
    expect(pass.started).toEqual([])
    expect(check(queuedAsk.run).execution).toBeUndefined()
  })

  it('8: GUARD: with the switch on, the ended check is closed and the queued ask starts a check', async () => {
    // A GUARD. It goes red if the change breaks the path where checks run: the ended check would not be closed, or the
    // queued ask would not start.
    const on = await call('POST', SWITCH, { on: true, projects: ['default'], because: 'Synthetic: checks run in this project.' })
    expect(on.status, on.raw).toBe(200)
    const mine = started[6]!
    for (const one of watching) await stopAndWait(one)
    const { pass } = await aPass(mergesOnly(), watching)
    expect(check(mine.run).execution).toMatchObject({ session: mine.session, endedAt: expect.any(String) })
    expect(holds(watching, mine.entry)).toBe(false)
    const startedNow = pass.started.find((one) => one.messageId === queuedAsk.message)
    expect(startedNow, `the queued ask did not start: ${JSON.stringify(pass)}`).toBeDefined()
    expect(startedNow!.runtime).toBe('inspection-tool')
    expect(check(queuedAsk.run).execution?.session).toBe(startedNow!.session)
  })
})
