// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTARTED WORKER IN MERGES-ONLY MODE COUNTS THE CHECKS THE OFFICE RECORDS AS RUNNING, NOT ONLY THE ONES IT REMEMBERS.
 *
 * THE GAP. With checks on in merges-only mode, a pass counted the running checks from its own list of the runs it
 * watches. That list is held in the worker's memory. A restarted worker began with an empty list while the checks it had
 * started went on running, so its first pass started a further check past the office's number at once.
 *
 * WHAT THE OFFICE RECORDS ABOUT A RUNNING CHECK. A session record with state running and runtime inspection-tool, started
 * by Mole Office, with the checked run in extra.inspectionRun and the ask it answers in deliveringMessage. And the check
 * tool's own process row, with its process group. GET /api/worker/runs lists every such run. The ordinary mode already
 * picks those runs up after a restart.
 *
 * WHAT IS PROVED HERE, against an office made only for this file and the real worker pass:
 *
 *   1. As many checks run as the office's number at once, read from the switch's reading, and an agent run for a message
 *      runs beside them. A worker with an empty list, as after a restart, makes one pass in merges-only mode with checks
 *      on. It picks up exactly those checks and starts nothing. It holds a further queued check in the sentence that names
 *      the number. It does not pick up the agent run, because in this mode no agent run is carried on.
 *   2. The checks it picked up are its own to end. Once they are stopped, its passes close each of them, and then start
 *      the check it held.
 *
 * WHY THE CHECKS ARE STARTED BY A WORKER IN THE ORDINARY MODE. In merges-only mode a second check also waits for the
 * machine's one-minute load and free memory, which a test does not control. A check leaves the same records in both
 * modes, and the restarted worker reads only the records.
 *
 * WHAT IS NOT REAL. The check tool is tests/fake-inspection-tool.mjs and the agent's tool is tests/fake-runtime.mjs, so
 * no model is called. The runs worked in a throwaway git repository under the system's temporary folder.
 *
 * CONTROL: red before the change. MUTATION: in the commit that adds the code.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whyNoFurtherCheckNow } from '../src/shared/checks-in-merges-only.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { outputOf } from '../src/worker/runtimes/common.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let tree: string
const made: string[] = []
type Watching = Parameters<typeof onePass>[1]
/** The runs the first worker started and watches. */
const before: Watching = []
/** The worker after a restart: the same office, and an empty list. */
const restarted: Watching = []
const SWITCH = '/api/office/checks-in-merges-only'
const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const person = as('human', THE_PERSON)
const worker = as('agent', 'worker-w')
interface Check { message: string; execution?: { session: string; endedAt?: string; failed?: string } }

/** The office's number of checks at once, as the switch's reading hands it to the worker. */
let atOnce = 0
/** The checks running when the worker restarts: the run each one checks and the check's own session. */
const running: { run: string; session: string }[] = []
let agentRun = ''
let queued = ''
let queuedAsk = ''

function scratch(what: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `restarted-worker-${what}-`)))
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

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  for (const [headers, data] of [
    [person, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
    [person, { handle: 'inspector-one', name: 'Synthetic Inspector', role: 'inspector' }],
    [person, { handle: 'super-r', name: 'Synthetic Supervisor', role: 'supervisor' }],
    [as('agent', 'super-r'), { handle: 'worker-w', name: 'Synthetic Worker', role: 'worker', workArea: ['work'] }],
    [person, { handle: 'builder-b', name: 'Synthetic Builder', runtime: 'claude-code' }],
  ] as const) {
    const registered = await call('POST', '/api/agents/started', data, headers)
    expect(registered.status, registered.raw).toBe(201)
  }
  tree = scratch('tree')
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Synthetic restarted-worker fixture')
  mkdirSync(join(tree, 'work')); writeFileSync(join(tree, 'work/a.txt'), 'Synthetic before.\n')
  git('add', '.'); git('commit', '-q', '-m', 'Synthetic baseline'); git('switch', '-q', '-c', 'work')
  writeFileSync(join(tree, 'work/a.txt'), 'Synthetic after.\n'); git('commit', '-q', '-am', 'Synthetic work')

  // THE NUMBER AT ONCE IS THE OFFICE'S SETTING, read where the worker reads it, so this file names no number of its own.
  const reading = await call('GET', SWITCH)
  expect(reading.status, reading.raw).toBe(200)
  atOnce = reading.body['limits']['checksAtOnce'] as number
  expect(Number.isInteger(atOnce) && atOnce >= 1, reading.raw).toBe(true)
  const on = await call('POST', SWITCH, { on: true, because: 'Synthetic: the test runs checks in merges-only mode.' })
  expect(on.status, on.raw).toBe(200)

  settings = { api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`, workspace: 'default', session: null, stopWithPid: null,
    checkout: aCheckoutForATestRun(), runs: atOnce + 2, hops: 3, outputRoot: scratch('output'), env: { ...withoutInheritedEffort(),
      MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(process.cwd(), 'tests/fake-inspection-tool.mjs'), MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs') } }

  // THE CHECKS THAT ARE RUNNING WHEN THE WORKER RESTARTS. Each one waits until it is stopped.
  const runs: string[] = []
  for (let i = 1; i <= atOnce; i++) runs.push((await sealed(`Synthetic interrupted check ${String(i)} of ${String(atOnce)}`)).run)
  // AND AN AGENT RUN FOR A MESSAGE, which also waits until it is stopped.
  const builder = ((await call('GET', '/api/participants')).body['agents'] as { id: string; handle: string }[]).find((one) => one.handle === 'builder-b')!.id
  const message = (await call('POST', '/api/records', { kind: 'message', title: 'Synthetic question', data: { body: 'Synthetic: please hang until the test stops this run.', to: [{ kind: 'agent', id: builder }] } })).body['record'].id as string
  const pressed = await call('POST', `/api/messages/${message}/start-an-agent`, {})
  expect(pressed.status, pressed.raw).toBeLessThan(300)

  const until = Date.now() + 20_000
  const allStarted = () => runs.every((run) => check(run).execution?.session !== undefined) && before.some((one) => one.messageId === message)
  while (!allStarted()) {
    if (Date.now() > until) throw new Error(`The first worker did not start the checks and the agent run: ${JSON.stringify(before.map((one) => one.session))}`)
    await onePass(settings, before, [], [])
    await pause(50)
  }
  for (const run of runs) {
    const session = check(run).execution!.session
    const processRun = before.find((one) => one.session === session)!
    while (!outputOf(processRun.handle).problems.includes('Synthetic check interrupted')) {
      if (Date.now() > until) throw new Error(`The synthetic check of ${run} never started waiting.`)
      await pause(50)
    }
    running.push({ run, session })
  }
  agentRun = before.find((one) => one.messageId === message)!.session
}, 90_000)

afterAll(async () => {
  for (const one of [...before, ...restarted]) if (one.adapter.alive(one.handle)) one.adapter.stop(one.handle, 'Synthetic: the restart test ended.')
  // Each one has ended before its output folder is removed, so none writes into a folder that is gone.
  const until = Date.now() + 15_000
  while ([...before, ...restarted].some((one) => one.adapter.alive(one.handle)) && Date.now() < until) await pause(50)
  await app?.close(); t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('a worker restarted in merges-only mode with checks on', () => {
  it('picks up the checks the office records as running, starts none past the number at once, and holds the next', async () => {
    ({ run: queued, message: queuedAsk } = await sealed('Synthetic unfinished check asked while the others run'))
    const pass = await onePass({ ...settings, mergesOnly: true }, restarted, [], [])
    expect(pass.started, JSON.stringify(pass)).toEqual([])
    expect(check(queued).execution).toBeUndefined()
    expect([...pass.pickedUp].sort()).toEqual(running.map((one) => one.session).sort())
    expect(restarted.map((one) => one.session).sort()).toEqual(running.map((one) => one.session).sort())
    expect(restarted.some((one) => one.session === agentRun)).toBe(false)
    expect(pass.held.filter((one) => one.messageId === queuedAsk)).toEqual([
      { messageId: queuedAsk, because: whyNoFurtherCheckNow({ checksRunning: atOnce, loadOneMinute: null, freeBytes: null }, atOnce) },
    ])
  })

  it('closes the checks it picked up once they are stopped, and then starts the check it held', async () => {
    for (const one of restarted) one.adapter.stop(one.handle, 'Synthetic: the test stops the checks the restarted worker picked up.')
    const ended = (run: string) => check(run)?.execution?.endedAt !== undefined
    const until = Date.now() + 20_000
    while (!(running.every((one) => ended(one.run)) && ended(queued)) && Date.now() < until) {
      await onePass({ ...settings, mergesOnly: true }, restarted, [], [])
      await pause(100)
    }
    for (const one of running) {
      expect(check(one.run).execution).toMatchObject({ session: one.session, endedAt: expect.any(String) })
      expect(t.api.getRecord(one.session)!.data['state']).not.toBe('running')
    }
    expect(check(queued).execution).toMatchObject({ endedAt: expect.any(String) })
    expect(restarted).toEqual([])
  })
})
