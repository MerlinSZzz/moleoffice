// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER CUT THE SANDBOX CANNOT USE IS A GATE ROW (wave 13r round N; uuH_OcQ4oI6-). DW-25 of round H's table.
 *
 * EVERYTHING HERE IS MADE UP: the office, its keys, the sandbox folder, its repository and its container row, the agents,
 * their runs and the one Casting row of the worker card. No worker is started, and no launcher runs: the start door is called as the message worker calls it,
 * with a made-up launcher run. tests/a-supervisor-starts-its-own-worker.test.ts proves the doors at block, as they were
 * before the row.
 *
 * `worker-cuts-the-sandbox-cannot-use` is read in src/server/lib/worker-runs.ts where a cut is refused: a commit no branch
 * or tag of the sandbox's repository reaches, at the ask; and a named cut while the worker's worktree is there, at the
 * ask, at the hand start and at the start. At block each is refused as before and counted as stopped. At off each goes
 * on and is counted. A cut git cannot find, or cannot check, is refused at both positions and not counted.
 */

import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { gateNamed } from '../src/config/gates.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheWorkerRun } from '../src/shared/worker-runs.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const THE_WORKER_ID = 'mole-office/the-message-worker'
const GATE = 'worker-cuts-the-sandbox-cannot-use'
const NONE = { would_stop: 0, stopped: 0, reminded: 0 }
/**
 * The choice every ask here names: claude-code with the first model the launcher's compatibility data knows under its
 * provider, named without it. A choice no Casting row of the worker card casts is refused, so beforeAll casts one.
 */
const CHOICE = {
  runtime: 'claude-code',
  model: Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) =>
    !name.includes('/') && Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(THE_PROVIDER_A_RUNTIME_RUNS['claude-code'])}/${name}`)),
}

let t: TestDb
let app: FastifyInstance
let scratch: string
let workerModeBefore: string | undefined

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const AS_THE_WORKER = (session?: string): Record<string, string> => asAgent(THE_WORKER_ID, A_MADE_UP_OFFICE_KEY, session)

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string | null }>()

/** Register an agent through the starter door, and keep its id and the key it was answered, if any. */
async function started(handle: string, by: Record<string, string>, extra: Record<string, unknown> = {}): Promise<void> {
  const r = await call('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...extra })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const key = (r.body['whatToGiveIt'] as { key?: string } | undefined)?.key
  agents.set(handle, { id: (r.body['agent'] as { id: string }).id, key: key ?? null })
}
const asOne = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key!)
const idOf = (handle: string): string => agents.get(handle)!.id

let folder = ''
let brief = ''
let container = ''
let sandbox: ReturnType<typeof aMadeUpSandboxRepo>
let boss = { id: '', key: '' }
let argusTerminal = ''
const AS_BOSS = (): Record<string, string> => asAgent('sw-boss', boss.key, boss.id)
const worktreeOf = (handle: string): string => join(folder, 'worktrees', handle)

/** A run of sw-boss in the sandbox, filed by its starter's key from its own terminal, so the office mints it a key. */
async function aSupervisorsRun(title: string, workingDirectory = CHECKOUT): Promise<{ id: string; key: string }> {
  const r = await call('POST', '/api/records', asAgent('sw-quill', agents.get('sw-quill')!.key!, argusTerminal), {
    kind: 'session',
    title,
    data: {
      state: 'running', servingAgent: 'sw-boss', servingAgentId: idOf('sw-boss'), runtime: 'claude-code', model: 'claude-made-up-boss-0',
      workingDirectory, cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder },
    },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return { id: String(r.body['record'].id), key: String(r.body['runKey']?.key) }
}

/** The message worker's launcher run for one worker run, filed with the office's key as the worker files it. */
async function aLauncherRun(run: string, worker: string): Promise<string> {
  const r = await call('POST', '/api/records', AS_THE_WORKER(), {
    kind: 'session',
    title: `A made-up launcher run for a worker under ${run}`,
    data: { state: 'running', runtime: 'round-launcher', doing: 'starting a made-up worker run; this run runs no model', workingDirectory: CHECKOUT, startedByMoleOffice: true, extra: { purpose: 'worker', run, worker } },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['record'].id)
}

function dataOf(run: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as Record<string, any>
}
const theWorkerRunOf = (handle: string): TheWorkerRun | undefined => (dataOf(boss.id)['workerRuns'] as Record<string, TheWorkerRun> | undefined)?.[idOf(handle)]
const ask = (handle: string, body: Record<string, unknown>) => call('POST', `/api/agents/${idOf(handle)}/worker-run`, AS_BOSS(), { brief, ...CHOICE, ...body })
const start = async (handle: string) => call('POST', `/api/worker/worker-runs/${boss.id}/starting`, AS_THE_WORKER(), { agent: idOf(handle), wrapper: await aLauncherRun(boss.id, idOf(handle)) })
/** A commit of the sandbox repository's own, on top of `main`, which no branch reaches. */
const aCommitOnTop = (message: string): string => sandbox.git(sandbox.repo, 'commit-tree', `${sandbox.head}^{tree}`, '-p', sandbox.head, '-m', message)
const aWorktreeFor = (handle: string): string => {
  const dir = worktreeOf(handle)
  sandbox.git(sandbox.repo, 'worktree', 'add', '--no-checkout', '-q', '--detach', dir, sandbox.head)
  return dir
}

async function position(value: 'block' | 'off'): Promise<void> {
  const saved = await call('POST', '/api/office/settings', { ...AS_THE_PERSON, 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }, { changes: [{ name: gateNamed('worker-cuts-the-sandbox-cannot-use').setting, value }], because: 'Made-up reason for a gate' })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}
/** The gate's row of counts, read past every door. */
function counted(): { would_stop: number; stopped: number; reminded: number } | undefined {
  return t.client.sqlite.prepare('SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = ?').get(GATE) as { would_stop: number; stopped: number; reminded: number } | undefined
}

beforeAll(async () => {
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-worker-cut-gate-'))

  expect(CHOICE.model, 'the compatibility data holds no claude-code model').toBeDefined()
  // THE WORKER CARD'S ONE CASTING ROW, cast by the person: it casts the choice.
  const cast = await call('POST', '/api/casting/worker', AS_THE_PERSON, { program: { value: CHOICE.runtime }, model: { value: CHOICE.model } })
  expect(cast.status, JSON.stringify(cast.body)).toBe(201)
  await started('sw-quill', AS_THE_PERSON, { role: 'secretary' })
  const terminal = await call('POST', '/api/records', asOne('sw-quill'), { kind: 'session', title: 'sw-quill in a terminal', data: { state: 'running', runtime: 'claude-code' } })
  expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
  argusTerminal = String(terminal.body['record'].id)
  await started('sw-boss', asOne('sw-quill'))
  for (const handle of ['sw-loose', 'sw-loose-off', 'sw-there', 'sw-there-off', 'sw-late', 'sw-late-off']) await started(handle, asOne('sw-boss'))

  folder = join(realpathSync(scratch), 'sandboxes', 'sw-boss-sandbox')
  mkdirSync(folder, { recursive: true })
  brief = join(folder, 'brief.md')
  writeFileSync(brief, '# A made-up brief for a worker\n\nDo the made-up work.\n')
  container = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-12 10:00:00', 'agent:fixture')")
    .run(container, 'mole-office-sandbox-sw-boss-sandbox', `Sandbox sw-boss-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  sandbox = aMadeUpSandboxRepo(folder, CHECKOUT)
  boss = await aSupervisorsRun('A made-up supervisor run of sw-boss')
  // A worker with no key of its own, registered by the supervisor's run key, is started by hand.
  await started('sw-hand', AS_BOSS(), { noKey: true })
}, 60_000)

afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

// Mutation: at off, refuse the unreached commit as before; at block, take it; count it as stopped at off, or not at all;
// or let a cut git cannot find or cannot check through at off, or count it.
it('refuses an unreached cut at the ask at block and counts it, and at off keeps it and counts it, while a cut git cannot read is refused at both', async () => {
  await position('block')
  const loose = aCommitOnTop('A made-up commit that no branch of the sandbox reaches')
  const refused = await ask('sw-loose', { cutFrom: loose })
  expect(refused.status, JSON.stringify(refused.body)).toBe(400)
  expect(refused.body['code']).toBe('workerCutNotInTheSandbox')
  expect(theWorkerRunOf('sw-loose')).toBeUndefined()
  expect(counted()).toEqual({ would_stop: 1, stopped: 1, reminded: 0 })

  await position('off')
  const taken = await ask('sw-loose-off', { cutFrom: loose })
  expect(taken.status, JSON.stringify(taken.body)).toBe(202)
  expect(theWorkerRunOf('sw-loose-off')?.cut).toEqual({ commit: loose, named: loose })
  expect(counted()).toEqual({ would_stop: 2, stopped: 1, reminded: 0 })

  // A branch git cannot find is refused at off too, and is not this gate's to count.
  const unknown = await ask('sw-loose', { cutFrom: 'no-such-branch' })
  expect(unknown.status, JSON.stringify(unknown.body)).toBe(400)
  expect(unknown.body['code']).toBe('workerCutNotInTheSandbox')
  // So is a run standing at another repository's commit, which git cannot check against the sandbox's branches.
  const elsewhere = join(realpathSync(scratch), 'another-repository')
  sandbox.git(realpathSync(scratch), 'init', '-q', '-b', 'main', elsewhere)
  sandbox.git(elsewhere, 'commit', '--allow-empty', '-qm', 'A made-up commit of another repository')
  const foreign = await aSupervisorsRun('A made-up supervisor run of sw-boss in another repository', elsewhere)
  const outside = await call('POST', `/api/agents/${idOf('sw-loose')}/worker-run`, asAgent('sw-boss', foreign.key, foreign.id), { brief, ...CHOICE })
  expect(outside.status, JSON.stringify(outside.body)).toBe(409)
  expect(outside.body['code']).toBe('workerCutNotInTheSandbox')
  expect(dataOf(foreign.id)['workerRuns']).toBeUndefined()
  expect(counted()).toEqual({ would_stop: 2, stopped: 1, reminded: 0 })
})

// Mutation: at off, refuse a named cut with the worktree there, at the ask or at the start; at block, take one; or count
// either door as stopped at off, or not at all.
it('refuses a named cut with the worktree there at the ask at block, and at off takes it, counts it, and counts it again at the start, which uses the worktree as it stands', async () => {
  await position('block')
  aWorktreeFor('sw-there')
  const before = counted() ?? NONE
  const refused = await ask('sw-there', { cutFrom: 'main' })
  expect(refused.status, JSON.stringify(refused.body)).toBe(409)
  expect(refused.body['code']).toBe('workerCutWorktreeAlreadyThere')
  expect(theWorkerRunOf('sw-there')).toBeUndefined()
  expect(counted()).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })

  await position('off')
  aWorktreeFor('sw-there-off')
  const taken = await ask('sw-there-off', { cutFrom: 'main' })
  expect(taken.status, JSON.stringify(taken.body)).toBe(202)
  expect(counted()).toEqual({ ...before, would_stop: before.would_stop + 2, stopped: before.stopped + 1 })
  const begun = await start('sw-there-off')
  expect(begun.status, JSON.stringify(begun.body)).toBe(200)
  expect(theWorkerRunOf('sw-there-off')?.starting).toMatchObject({ cutFrom: null })
  expect(counted()).toEqual({ ...before, would_stop: before.would_stop + 3, stopped: before.stopped + 1 })
})

// Mutation: at off, fail the start as before; at block, start it; or count the start as stopped at off, or not at all.
it('fails a start whose worktree appeared after a named cut was asked at block and counts it, and at off starts it in the worktree as it stands and counts it', async () => {
  await position('block')
  expect((await ask('sw-late', { cutFrom: 'main' })).status).toBe(202)
  aWorktreeFor('sw-late')
  const before = counted() ?? NONE
  const failed = await start('sw-late')
  expect(failed.status, JSON.stringify(failed.body)).toBe(409)
  expect(theWorkerRunOf('sw-late')?.state).toBe('failed')
  expect(counted()).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })

  await position('off')
  expect((await ask('sw-late-off', { cutFrom: 'main' })).status).toBe(202)
  expect(counted()).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
  aWorktreeFor('sw-late-off')
  const begun = await start('sw-late-off')
  expect(begun.status, JSON.stringify(begun.body)).toBe(200)
  expect(theWorkerRunOf('sw-late-off')).toMatchObject({ state: 'starting', starting: { cutFrom: null } })
  expect(counted()).toEqual({ ...before, would_stop: before.would_stop + 2, stopped: before.stopped + 1 })
})

// Mutation: at off, refuse the hand start as before; at block, take it; or count it as stopped at off, or not at all.
it('refuses a hand start that names a cut with the worktree there at block and counts it, and at off takes it and counts it', async () => {
  await position('block')
  aWorktreeFor('sw-hand')
  const before = counted() ?? NONE
  const hand = { askedBy: boss.id, brief, cutFrom: 'main' }
  const refused = await call('POST', `/api/agents/sw-hand/hand-run`, AS_BOSS(), hand)
  expect(refused.status, JSON.stringify(refused.body)).toBe(409)
  expect(theWorkerRunOf('sw-hand')).toBeUndefined()
  expect(counted()).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })

  await position('off')
  const taken = await call('POST', `/api/agents/sw-hand/hand-run`, AS_BOSS(), hand)
  expect(taken.status, JSON.stringify(taken.body)).toBe(200)
  expect(taken.body['cut']).toEqual({ commit: sandbox.head, named: null })
  expect(counted()).toEqual({ ...before, would_stop: before.would_stop + 2, stopped: before.stopped + 1 })
})
