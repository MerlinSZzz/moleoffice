// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * WHEN THE OFFICE STOPS A WITHDRAWN ENTRY'S MERGE TOOL, THE WORKER RELEASES THAT RUN'S OPEN CONTAINERS WHILE THE RUN
 * STILL READS RUNNING, AND ONLY THEN RECORDS THE RUN AS ENDED. Wave 13u, round 185; the secretary's decision rsa_P_w4e0Vm,
 * way A of finding u0kLhexA6_6j.
 *
 * The merge tool's cleanup brings the entry's sandbox down from a process group of its own, after the tool's group has
 * ended. By then the worker had recorded the run as ended, and the ledger lets only the agent a run answers as, its
 * starter, a secretary or the person stop an ended run's container. A merge tool run answers as
 * no agent, so the cleanup's down was refused with 403. The containers of two withdrawn entries stayed up that way, one
 * for 20 hours and one for two days, until a secretary released their rows.
 *
 *   1. An entry withdrawn while its tool runs leaves no open container row. The container is stopped while the run's
 *      record still says running, through the ledger's door with the sentence the door asks for, and the run is then
 *      recorded as crashed.
 *
 * WHAT IS NOT REAL. The merge tool is `tests/fake-merge-tool.mjs` (MOLE_OFFICE_FAKE_MERGE_TOOL), whose "hangs" branch
 * waits until it is signalled. The container row is filed here as the launcher files one for the tool's session, and
 * the container is a made-up one that only this file's stand-in for docker lists: it is "running" until the office asks
 * the stand-in to stop it. The git trees are synthetic, made under `.logs/` and removed.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { onePass, type PassReport, type WorkerSettings } from '../src/worker/index.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'

const FAKE_MERGE_TOOL = fileURLToPath(new URL('./fake-merge-tool.mjs', import.meta.url))
const FAKE_RUNTIME = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const THE_WORKER = 'mole-office/the-message-worker'
const CONTAINER = 'made-up-merge-sandbox'

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
let resources: typeof import('../src/server/lib/resources.ts')
const made: string[] = []
const watching: Parameters<typeof onePass>[1] = []
type MergeList = NonNullable<Parameters<typeof onePass>[2]>
const everyMergeList: MergeList[] = []

/** Whether the made-up container is running, and each stop the office asked of the stand-in, with the run's state then. */
let running = true
let theRunsSession = ''
const stops: { name: string; theRunSaid: unknown }[] = []

const as = (type: 'agent' | 'human', id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asStarter = as('agent', 'sc-starter')
const asSubmitter = as('agent', 'sc-worker')
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
  const dir = mkdtempSync(join(process.cwd(), '.logs', `stopped-containers-${prefix}-`))
  made.push(dir)
  return dir
}

function tree(): string {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic stopped-containers fixture')
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
    title: 'Synthetic stopped-containers run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'sc-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'sc-worker', cutFrom: 'main', workingDirectory: tree() },
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

const stateOf = (session: string): unknown => t.api.getRecord(session)?.data['state']

async function passUntil(what: string, done: () => boolean, list: MergeList): Promise<PassReport[]> {
  const reports: PassReport[] = []
  const deadline = Date.now() + 20_000
  for (;;) {
    reports.push(await onePass(settings, watching, list))
    if (done()) return reports
    if (Date.now() >= deadline) throw new Error(`${what} did not happen within 20 seconds. Last pass: ${JSON.stringify(reports.at(-1)?.merges)}`)
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
    [asPerson, 'sc-starter', undefined],
    [asStarter, 'sc-worker', ['work']],
  ] as const) {
    const r = await call('POST', '/api/agents/started', by, { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) })
    expect(r.status, r.raw).toBe(201)
  }
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  // THE STAND-IN FOR DOCKER: every reading of the machine is the real one, except the containers, which list only the
  // made-up one while it runs.
  resources = await import('../src/server/lib/resources.ts')
  resources.useOsProbe(
    Object.assign(Object.create(resources.LINUX_PROBE) as typeof resources.LINUX_PROBE, {
      containers: () => ({
        available: true as const,
        containers: running ? [{ id: 'made0up0container0id', name: CONTAINER, image: 'made-up-image', status: 'Up 2 minutes' }] : [],
      }),
      stopContainer: (name: string) => {
        stops.push({ name, theRunSaid: stateOf(theRunsSession) })
        running = false
      },
    }),
  )
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-stopped-containers-'))
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
  resources?.useOsProbe(resources.LINUX_PROBE)
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
  if (outputs !== undefined) rmSync(outputs, { recursive: true, force: true })
}, 30_000)

describe('a merge tool the office stops for a withdrawn entry', () => {
  it('1: leaves no open container row, stopped while the run still read running, and the run is then recorded as crashed', async () => {
    const id = await submit('synthetic-hangs-in-a-container')
    const list: MergeList = []
    everyMergeList.push(list)
    await passUntil('the tool starting', () => list.some((run) => run.entry === id), list)
    const run = list.find((one) => one.entry === id)!
    theRunsSession = run.session
    expect(stateOf(run.session)).toBe('running')

    // THE LAUNCHER'S ROW, filed as `up` files it: as the office's worker, for the tool's own session.
    const filed = await call('POST', '/api/resources', { ...asTheOffice, 'x-mole-office-session': run.session }, { type: 'container', key: CONTAINER })
    expect(filed.status, filed.raw).toBe(201)
    const row = String(filed.body['resource'].id)

    const withdrawn = await call('POST', `/api/merge-queue/${id}/withdraw`, asSubmitter, { because: 'Synthetic: the stopped-containers case withdraws it.' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    const passes = await passUntil('the run being recorded as ended', () => stateOf(run.session) !== 'running', list)
    expect(passes.flatMap((pass) => pass.merges.stopped)).toContainEqual(expect.objectContaining({ entry: id, session: run.session }))

    const rows = await call('GET', `/api/resources?sessionRecordId=${run.session}&includeReleased=true`, asPerson)
    expect(rows.status, rows.raw).toBe(200)
    const theRow = (rows.body['resources'] as Record<string, any>[]).find((one) => one.id === row)
    expect(theRow?.releasedAt, `the container row: ${JSON.stringify(theRow)}`).not.toBeNull()
    expect(stops, 'the office stopped the container once, while the run still said running').toEqual([{ name: CONTAINER, theRunSaid: 'running' }])
    expect(String(theRow?.releaseNote), 'the door was sent back the sentence it asked for').toContain(`confirmed: Stop container ${CONTAINER}`)
    expect(stateOf(run.session)).toBe('crashed')
  }, 60_000)
})
