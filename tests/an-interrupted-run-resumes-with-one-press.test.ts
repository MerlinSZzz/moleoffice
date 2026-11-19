// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INTERRUPTED RUN IS LISTED, AND ONE PRESS OF THE PERSON'S RESUMES IT IN ITS OWN CONVERSATION.
 *
 * Criterion W7 of design/window/ACCEPTANCE.md (piece H7 of plan hp7Z-IW9JWSX), on the owner's point 5
 * of 6 September 2026. src/server/lib/interrupted.ts says which runs are interrupted and how the press
 * works; src/worker/index.ts `startTheResumesThePersonAsked` starts the resume.
 *
 * THE OFFICES ARE REAL PROCESSES, each this test's own, made the way tests/a-shutdown-pauses-the-runs-
 * at-work.test.ts makes them: its own folder, database, home and port, with its message worker running
 * the fake runtime (tests/fake-runtime.mjs) in place of an agent tool. None of them is the live office.
 *
 *   1. A run that names its conversation and hangs is paused by a shutdown, and the office is started
 *      again. The run is listed with its agent, its message, when it stopped and why, and one press can
 *      resume it. It waits: the worker makes one whole pass after the restart, from its first request to
 *      its read of the queue, and starts nothing for it (criterion M24 leaves a paused run alone). The
 *      test reads that pass from the office's own request log. An agent's press is refused. The person's press is written on the
 *      run, and the worker starts the fake runtime's own resume by the recorded conversation: the new
 *      run carries the same conversation id, which the fake only prints when it is given `--resume`.
 *      The old run says which run took it up, and the list is empty.
 *   2. A run that never named its conversation is stopped by the person mid-turn. It is listed as
 *      unable to resume, saying why, and a press of it is refused.
 *
 * MUTATIONS:
 *   - src/worker/index.ts `startTheResumesThePersonAsked` starts nothing: case 1 red;
 *   - src/server/api/interrupted.ts asks no person-only check: case 1 red, because the agent's press
 *     is taken;
 *   - src/server/lib/interrupted.ts does not check for a missing conversation: case 2 red;
 *   - src/server/lib/worker.ts `runsToPickUp` also picks up a paused run: case 1 red, because the run is
 *     carried on before the press.
 *
 * NO STAND-IN RUNTIME OUTLIVES ITS CASE (wave 13s round 21, piece 3). Each case ends, pass or fail, by stopping every
 * process group it recorded, and then no tests/fake-runtime.mjs whose MOLE_OFFICE_API is one of this file's offices
 * may still be running (tests/the-runtimes-a-test-office-started.ts). Before this round the new run a case makes
 * (the resumed run of case 1) was recorded by asking the worker's door once, which could answer before the run had a group, and the groups
 * were stopped only after the last case; the run was left waiting after its office stopped. Seen before the fix: the
 * resumed run of resume-runner outlived its case, and the check went red. MUTATION: the case's `stopTheGroups` is taken
 * out of afterEach in this file and its sibling: the resume case, the crash case and the case after the resume case go
 * red, each naming the runtime left running.
 *
 * ITS RUNS WORK IN A FOLDER OF THE TEST'S OWN (round 15). The office this test starts starts its own
 * message worker, and until round 15 that worker started every run in this worktree, so the run's
 * rules file was written as AGENTS.md at the worktree's root. Each world now names a folder made by
 * tests/a-checkout-for-a-test-run.ts as MOLE_OFFICE_WORKER_CHECKOUT, and the first case checks that
 * the run's rules file was written there. tests/a-test-leaves-the-worktrees-rules-file-alone.ts fails
 * the case after which the worktree's own file changed.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { aFreePortBelowTheEphemeralRange } from './a-free-port-below-the-ephemeral-range.ts'
import { TEST_DATABASE_PREFIX, devStackEnvironment } from './helpers.ts'
import { aWholePassSince, stopTheGroups, theRuntimesOf } from './the-runtimes-a-test-office-started.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')
const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Every process group this file started or found: offices by their lock, runs by the worker's door. */
const groups = new Set<number>()
const folders = new Set<string>()
/** Every office this file made, so its runs can be found and stopped even when a case fails half way. */
const worlds = new Set<World>()

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

interface World {
  database: string
  api: string
  env: NodeJS.ProcessEnv
  /** The folder the world's worker starts its runs in, outside this worktree. */
  runsWorkIn: string
}

/** An office of this test's own, with its worker running the fake runtime. */
async function aWorld(name: string): Promise<World> {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.add(dir)
  const home = join(dir, 'home')
  mkdirSync(home)
  const database = join(dir, 'office.db')
  // THE PORTS ARE BELOW THE EPHEMERAL RANGE, because a port of that range let go of before the office binds it can be
  // taken by any other program, and the first case starts its office again on the same port after a shutdown. In one
  // queue run the first start was refused because something else held the port.
  const port = await aFreePortBelowTheEphemeralRange()
  const runsWorkIn = aCheckoutForATestRun()
  // THE WORKSPACE IS NAMED, because this office reads the checkout's settings, and in a worktree of
  // the main checkout that is the main checkout's .env, which names another workspace. Its worker
  // then watches that workspace and never starts the run (problem `xpw3NJMWC7jh`).
  const env: NodeJS.ProcessEnv = {
    ...devStackEnvironment(dir, port, await aFreePortBelowTheEphemeralRange([port]), { database, workspace: 'default' }),
    HOME: home,
    MOLE_OFFICE_FAKE_RUNTIME: FAKE,
    MOLE_OFFICE_AGENT_MODEL: 'a-model-this-test-names',
    MOLE_OFFICE_WORKER_CHECKOUT: runsWorkIn,
  }
  // A SERVER UNDER A TEST RUNNER STARTS NO WORKER (`underATestRunner` in src/server/lib/runtime.ts),
  // and the worker is what starts the run a shutdown pauses. So the two marks are taken out, as other
  // tests that start a production server do. The run is still the fake runtime, never an agent tool.
  delete env['VITEST']
  delete env['VITEST_WORKER_ID']
  const world = { database, api: `http://127.0.0.1:${String(port)}`, env, runsWorkIn }
  worlds.add(world)
  return world
}

/** The world's service lock now, recording its group to stop. */
function theLock(world: World) {
  const lock = readTheServiceLock(serviceLockPathFrom({ MOLE_OFFICE_DB: world.database }))
  if (lock.state === 'read') groups.add(lock.lock.pgid)
  return lock.state === 'read' ? lock.lock : null
}

/** Run the mole-office command in a world. */
function theCommand(world: World, what: string): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [THE_COMMAND, what], { cwd: REPO, env: world.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (out += String(chunk)))
    child.on('close', (code) => {
      theLock(world)
      done({ code, out })
    })
  })
}

async function ask(
  world: World,
  path: string,
  init: { method?: string; body?: unknown; asAgent?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const got = await fetch(`${world.api}${path}`, {
    method: init.method ?? 'GET',
    headers: init.asAgent === undefined
      ? AS_THE_OWNER
      : { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': init.asAgent },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await got.text()
  return { status: got.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) }
}

/** Ask again and again for up to `ms`, until `ready` says yes; the last answer either way. */
async function until<T>(what: () => Promise<T>, ready: (value: T) => boolean, ms = 60_000): Promise<T> {
  const deadline = Date.now() + ms
  let last = await what()
  while (!ready(last) && Date.now() < deadline) {
    await sleep(100)
    last = await what()
  }
  return last
}

/** An agent, and a message to it that a run is started for. Answers the message's id. */
async function aMessageTo(world: World, handle: string, body: string): Promise<string> {
  await ask(world, '/api/records', { method: 'POST', body: { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active' } } })
  const listed = (await ask(world, '/api/participants')).body as { agents?: { id: string; handle: string }[] }
  const agentId = (listed.agents ?? []).find((one) => one.handle === handle)?.id
  if (agentId === undefined) throw new Error(`No registry row answers to ${handle}.`)
  const filed = await ask(world, '/api/records', { method: 'POST', body: { kind: 'message', title: `a message to ${handle}`, data: { body, to: [{ kind: 'agent', id: agentId }] } } })
  const messageId = (filed.body['record'] as { id: string }).id
  // Criterion M78: a fresh agent's message waits for the person's press.
  await ask(world, `/api/messages/${messageId}/start-an-agent`, { method: 'POST', body: {} })
  return messageId
}

interface ALiveRun { session: string; agent: { handle: string } | null; message: { id: string } | null; since: string; conversation: string | null; pausable: boolean; says: string }

async function theLiveRuns(world: World): Promise<{ pausable: ALiveRun[]; notPausable: ALiveRun[] }> {
  return (await ask(world, '/api/office/live-runs')).body as unknown as { pausable: ALiveRun[]; notPausable: ALiveRun[] }
}

/** The runs the worker's door lists, recording each run's process group so this file can stop it. */
interface AGoingRun { session: string; messageId: string; pid: number; pgid: number | null; providerSession: string | null; startupHeld?: string }

async function theRunsGoing(world: World): Promise<AGoingRun[]> {
  const runs = ((await ask(world, '/api/worker/runs')).body['runs'] ?? []) as AGoingRun[]
  for (const run of runs) if (run.pgid !== null) groups.add(run.pgid)
  return runs
}

/** A startup hold may name a probe group before the tool has a resource row. */
function isRegisteredRun(run: AGoingRun): boolean {
  return run.startupHeld === undefined && run.pid > 0 && run.pgid !== null
}

async function aRecord(world: World, id: string): Promise<Record<string, unknown>> {
  const read = (await ask(world, `/api/records/${id}`)).body
  return ((read['record'] ?? read) as { data: Record<string, unknown> }).data
}

/** Every run record delivering one message, in the project the test writes to. */
async function theRunsFor(world: World, messageId: string): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const all = ((await ask(world, '/api/records?kind=session&shape=full')).body['records'] ?? []) as { id: string; data: Record<string, unknown> }[]
  return all.filter((one) => one.data['deliveringMessage'] === messageId)
}

/** Wait until the office's server has gone and its lock with it. */
async function closed(world: World, pid: number, ms = 20_000): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (!theProcessAt(pid).here && theLock(world) === null) return true
    await sleep(100)
  }
  return false
}

// EACH CASE STOPS WHAT IT STARTED WHEN IT ENDS, PASS OR FAIL (wave 13s round 21, piece 3). First the runs each office
// still up is watching, recorded by group, since a case that failed half way may have left a run its office started
// after the case last looked; then every group recorded, by its recorded id. Then no stand-in runtime of any office
// this file made may still be running: a run the case never recorded is named here, and the case is red.
afterEach(async () => {
  for (const world of worlds) {
    try {
      await theRunsGoing(world)
    } catch {
      // That office is down, and its runs were recorded while it was up.
    }
  }
  await stopTheGroups(groups)
  const left = [...worlds].flatMap((world) => theRuntimesOf(world, FAKE))
  expect(left, 'a stand-in runtime outlived its case').toEqual([])
}, 60_000)

afterAll(async () => {
  await stopTheGroups(groups)
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}, 60_000)

/** The interrupted runs the page reads. */
interface AnInterruptedRun {
  session: string
  how: string
  agent: { handle: string } | null
  message: { id: string; title: string } | null
  stoppedAt: string
  why: string | null
  conversation: string | null
  resume: { can: boolean; because?: string }
  measured: string
  asked: { at: string } | null
  failed: string | null
}

async function theInterruptedRuns(world: World): Promise<AnInterruptedRun[]> {
  return ((await ask(world, '/api/office/interrupted-runs')).body['runs'] ?? []) as AnInterruptedRun[]
}

describe('an interrupted run', () => {
  it('waits for the press, refuses an agent\'s press, and resumes its own conversation on the person\'s', async () => {
    const world = await aWorld('resume-a-paused-run')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const messageId = await aMessageTo(world, 'resume-runner', 'please name the conversation and hang')
    const live = await until(() => theLiveRuns(world), (runs) => runs.pausable.some((one) => one.conversation !== null))
    await theRunsGoing(world)
    const run = live.pausable[0]!
    const conversation = run.conversation
    // THE RUN WORKS IN THE WORLD'S OWN FOLDER: its rules file was written there, not in this worktree.
    expect(existsSync(join(world.runsWorkIn, 'AGENTS.md')), `the run's rules file is in ${world.runsWorkIn}, the folder this test gave its worker`).toBe(true)

    // PAUSED BY A SHUTDOWN, and the office started again.
    const server = theLock(world)!
    const shut = await ask(world, '/api/office/shut-down', { method: 'POST', body: { why: 'the test needs the run paused' } })
    expect(shut.status, JSON.stringify(shut.body)).toBe(200)
    expect(await closed(world, server.pid), 'the office closed after the shutdown').toBe(true)
    const restartAsked = Date.now()
    const again = await theCommand(world, 'start')
    expect(again.code, again.out).toBe(0)

    // LISTED: which agent, which message, when it stopped and why, and that one press can resume it.
    const listed = await theInterruptedRuns(world)
    expect(listed.map((one) => one.session)).toEqual([run.session])
    const it1 = listed[0]!
    expect(it1.how).toBe('paused')
    expect(it1.agent?.handle).toBe('resume-runner')
    expect(it1.message?.id).toBe(messageId)
    expect(it1.message?.title).toBe('a message to resume-runner')
    expect(it1.stoppedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(it1.why).toContain('the test needs the run paused')
    expect(it1.conversation).toBe(conversation)
    expect(it1.resume).toEqual({ can: true })
    expect(it1.asked).toBeNull()

    // IT WAITS FOR THE PRESS: the worker's first whole pass after the restart picks up nothing and starts nothing for it.
    const pass = await until(async () => aWholePassSince(world, restartAsked), (at) => at !== null, 30_000)
    expect(pass, 'the worker ended a whole pass after the restart').not.toBeNull()
    expect((await theRunsFor(world, messageId)).map((one) => one.id)).toEqual([run.session])
    expect((await aRecord(world, run.session))['state']).toBe('paused')

    // AN AGENT'S PRESS IS REFUSED, and nothing is asked.
    const byAnAgent = await ask(world, `/api/office/interrupted-runs/${run.session}/resume`, { method: 'POST', asAgent: 'resume-runner' })
    expect(byAnAgent.status, JSON.stringify(byAnAgent.body)).toBe(403)
    expect(String(byAnAgent.body['error'])).toContain('Only the person may resume an interrupted run.')
    expect((await aRecord(world, run.session))['resume']).toBeUndefined()

    // THE PERSON'S PRESS: written on the run, and the worker starts the tool's own resume.
    const pressed = await ask(world, `/api/office/interrupted-runs/${run.session}/resume`, { method: 'POST' })
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)
    expect((pressed.body['run'] as AnInterruptedRun).asked).not.toBeNull()
    const runs = await until(() => theRunsFor(world, messageId), (all) => all.length >= 2, 60_000)
    expect(runs.length).toBe(2)
    const resumed = runs.find((one) => one.id !== run.session)!
    // ITS GROUP IS RECORDED BEFORE ANYTHING ELSE IS ASKED, so the case can stop it when it ends. Asked once, the worker's
    // door could answer before the run had a group, and the resumed run was left running after the office stopped.
    const registered = await until(() => theRunsGoing(world), (going) => going.some((one) => one.session === resumed.id && isRegisteredRun(one)), 30_000)
    expect(registered.some((one) => one.session === resumed.id && isRegisteredRun(one)), 'the resumed run registered its own process group').toBe(true)
    // THE SAME CONVERSATION. The fake prints a new random id unless it was given `--resume <id>`.
    const resumedData = await until(() => aRecord(world, resumed.id), (data) => typeof data['providerSession'] === 'string')
    expect(resumedData['providerSession']).toBe(conversation)
    expect(resumedData['deliveringMessage']).toBe(messageId)
    // THE OLD RUN SAYS WHICH RUN TOOK IT UP, and keeps its own state.
    const old = await until(() => aRecord(world, run.session), (data) => typeof (data['resume'] as { startedAs?: unknown } | undefined)?.startedAs === 'string')
    expect((old['resume'] as { startedAs: string }).startedAs).toBe(resumed.id)
    expect(old['state']).toBe('paused')
    expect(await theInterruptedRuns(world)).toEqual([])
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 240_000)

  it('that never named its conversation says why it cannot resume, and a press of it is refused', async () => {
    const world = await aWorld('resume-no-conversation')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const messageId = await aMessageTo(world, 'silent-runner', 'please hang')
    const going = await until(() => theRunsGoing(world), (runs) => runs.some((one) => one.messageId === messageId && isRegisteredRun(one)))
    const found = going.find((one) => one.messageId === messageId && isRegisteredRun(one))
    expect(found, 'the run registered its own process group').toBeDefined()
    const run = found!

    // THE PERSON STOPS IT MID-TURN, through the door the sessions page presses.
    const rows = (await ask(world, `/api/resources?sessionRecordId=${run.session}`)).body['resources'] as { id: string; type: string }[]
    const row = rows.find((one) => one.type === 'process')
    expect(row, 'the registered run has a process resource').toBeDefined()
    const stop = await ask(world, '/api/runtime/stop', { method: 'POST', body: { resourceId: row!.id, why: 'the test stops it mid-turn' } })
    expect(stop.status, JSON.stringify(stop.body)).toBe(200)
    expect((await until(() => aRecord(world, run.session), (data) => data['state'] === 'crashed', 20_000))['state']).toBe('crashed')

    // LISTED, WITH ITS REASON AND NO WAY TO PRESS.
    const listed = await theInterruptedRuns(world)
    expect(listed.map((one) => one.session)).toEqual([run.session])
    expect(listed[0]!.how).toBe('crashed')
    expect(listed[0]!.why).toContain('the test stops it mid-turn')
    expect(listed[0]!.conversation).toBeNull()
    expect(listed[0]!.resume).toEqual({ can: false, because: 'no-conversation' })

    const pressed = await ask(world, `/api/office/interrupted-runs/${run.session}/resume`, { method: 'POST' })
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(409)
    expect(String(pressed.body['error'])).toContain(
      `cannot be resumed, so nothing was asked. ${en['w13t.interrupted.because.no-conversation']}`,
    )
    expect((await aRecord(world, run.session))['resume']).toBeUndefined()
    expect((await theRunsFor(world, messageId)).map((one) => one.id)).toEqual([run.session])
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 180_000)
})
