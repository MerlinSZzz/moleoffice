// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SHUTDOWN OF MOLE OFFICE PAUSES THE RUNS AT WORK, AND A PAUSED RUN IS NEVER CARRIED ON BY ITSELF.
 *
 * Criterion W6 of design/window/ACCEPTANCE.md, the server side (piece H6 of plan hp7Z-IW9JWSX), and
 * question 2 of the plan, answered from the owner's point 5 of 6 September 2026: a run stopped half
 * way is stopped for something urgent, so it waits for a press. A crash still resumes by itself
 * (criterion M24). src/server/lib/pausing.ts says how.
 *
 * THE OFFICES ARE REAL PROCESSES, each this test's own: its own folder, database, home and port,
 * started and stopped with the `mole-office` command, with its message worker running the fake
 * runtime (tests/fake-runtime.mjs) in place of an agent tool. None of them is the live office. A
 * shutdown is the act under test, and only a real server can be shown to close.
 *
 *   1. A run that names its conversation and hangs is at work. The live-runs door lists it with its
 *      agent, its message and since when, beside a session the office did not start, which it says
 *      cannot be paused. An agent's press of the shutdown door is refused. The person's press pauses
 *      the run, says so, and the office closes. Started
 *      again, the run's record says `paused`, with who asked, when, why and its conversation, and no
 *      run is started for its message again.
 *   2. A crash is not a pause: the server and the run are killed outright, and the next start carries
 *      the run on by itself, resuming its own conversation.
 *   3. A separate pause keeps the API up, holds the worker through a restart, and its resume starts
 *      only new work.
 *
 * A shutdown with no run at work is not a case of its own (wave 13n round F): case 1 already proves
 * that the shutdown closes the office.
 *
 * ONLY THE OWNER PRESSES THE SHUTDOWN: in case 1 an agent's press and a secretary's press
 * with its own key are refused first with the code shutDownOnlyTheOwner, and nothing is done. Then the owner's press
 * that confirmed an empty list is refused with the code shutDownRunsChanged, and nothing is done either (wave 13n
 * round 58). Then the owner's press that names the run pauses it and shuts down.
 *
 * MUTATIONS:
 *   - src/server/api/shutdown.ts asks no person-only check: case 1 red, because the agent's press shuts
 *     the office down;
 *   - src/server/api/shutdown.ts does not compare `seen` with the runs at work: case 1 red, because the press that
 *     confirmed an empty list shuts the office down (wave 13n round 58);
 *   - src/server/lib/pausing.ts writes `crashed` instead of `paused`: case 1 red;
 *   - src/server/lib/worker.ts `runsToPickUp` also picks up a paused run: case 1 red, because the run
 *     is carried on after the restart;
 *   - src/server/api/shutdown.ts never starts the way out: case 1 red, because the office stays up;
 *   - src/server/lib/pausing.ts lists no session the office did not start: case 1 red;
 *   - src/server/lib/pausing.ts lists the office's own parts as sessions it did not start: case 1 red;
 *   - src/worker/index.ts `carryOnFromARestart` carries nothing on: case 2 red.
 *
 * NO STAND-IN RUNTIME OUTLIVES ITS CASE (wave 13s round 21, piece 3). Each case ends, pass or fail, by stopping every
 * process group it recorded, and then no tests/fake-runtime.mjs whose MOLE_OFFICE_API is one of this file's offices
 * may still be running (tests/the-runtimes-a-test-office-started.ts). Before this round the new run a case makes
 * (the carried-on run of case 3) was recorded by asking the worker's door once, which could answer before the run had a group, and the groups
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
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { aFreePortBelowTheEphemeralRange } from './a-free-port-below-the-ephemeral-range.ts'
import { TEST_DATABASE_PREFIX, devStackEnvironment, theCheckoutsPageBuiltAtThisCommit } from './helpers.ts'
import { aWholePassSince, stopTheGroups, theRuntimesOf } from './the-runtimes-a-test-office-started.ts'

beforeAll(async () => {
  // This test starts an office with the mole-office command, which runs in production and serves the built page, so the page must be built at this commit first.
  await theCheckoutsPageBuiltAtThisCommit()
}, 300_000)

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
  // THE PORTS ARE BELOW THE EPHEMERAL RANGE, because each case starts its office again on the same port after a stop,
  // and a port of that range let go of in between can be taken by any other program (problem TwxvC6hW0dY2).
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

describe('a shutdown of Mole Office', () => {
  it('lists the run at work, pauses it with its conversation, closes, and the run stays paused after a restart', async () => {
    const world = await aWorld('shutdown-pauses')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const messageId = await aMessageTo(world, 'shut-runner', 'please name the conversation and hang')

    // A SESSION THE OFFICE DID NOT START, with a live process under it: a terminal, as far as the
    // office can tell. The process is this test's own, in a group of its own.
    const terminal = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
    terminal.unref()
    if (terminal.pid !== undefined) groups.add(terminal.pid)
    const filed = await ask(world, '/api/records', { method: 'POST', body: { kind: 'session', title: 'A terminal somebody is working in', data: { state: 'running', runtime: 'claude-code' } } })
    const terminalSession = (filed.body['record'] as { id: string }).id
    const registered = await ask(world, '/api/resources', { method: 'POST', body: { type: 'process', key: String(terminal.pid), sessionRecordId: terminalSession, detail: 'A terminal this test started.' } })
    expect(registered.status, JSON.stringify(registered.body)).toBeLessThan(300)

    // THE RUN IS AT WORK, and the list says which agent, which message, since when, and its conversation.
    const live = await until(() => theLiveRuns(world), (runs) => runs.pausable.some((one) => one.conversation !== null))
    await theRunsGoing(world)
    expect(live.pausable).toHaveLength(1)
    // THE RUN WORKS IN THE WORLD'S OWN FOLDER: its rules file was written there, not in this worktree.
    expect(existsSync(join(world.runsWorkIn, 'AGENTS.md')), `the run's rules file is in ${world.runsWorkIn}, the folder this test gave its worker`).toBe(true)
    const run = live.pausable[0]!
    expect(run.agent?.handle).toBe('shut-runner')
    expect(run.message?.id).toBe(messageId)
    expect(run.since).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(run.conversation).toMatch(/^fake-[a-z0-9]+$/)
    // AND THE SESSION THE OFFICE DID NOT START IS NAMED AS STILL RUNNING, AND AS NOT ITS TO PAUSE.
    const notOurs = live.notPausable.find((one) => one.session === terminalSession)
    expect(notOurs?.says).toMatch(/did not start .* so it cannot pause it\. It keeps running after the shutdown\./)
    // AND ONLY THAT ONE: the office's own parts (its API server's row) are not said to be somebody else's.
    expect(live.notPausable.map((one) => one.session)).toEqual([terminalSession])

    // AN AGENT'S PRESS IS REFUSED, AND A SECRETARY'S WITH ITS OWN KEY TOO: only the owner shuts the office down
    // . Each refusal carries its code, so a page says it in its own language. Nothing is done:
    // the run is still at work and the office still answers. The list says neither may press.
    const byAnAgent = await ask(world, '/api/office/shut-down', { method: 'POST', body: { why: 'an agent tries' }, asAgent: 'shut-runner' })
    expect(byAnAgent.status, JSON.stringify(byAnAgent.body)).toBe(403)
    expect(byAnAgent.body['code']).toBe('shutDownOnlyTheOwner')
    expect(String(byAnAgent.body['error'])).toContain("Only the owner may shut the office down, or a secretary holding the owner's grant where this office's list of what the grant carries says so. Any other agent is refused.")
    const secretary = await ask(world, '/api/agents/started', { method: 'POST', body: { handle: 'shut-secretary', name: 'Synthetic secretary', role: 'secretary' } })
    expect(secretary.status, JSON.stringify(secretary.body)).toBe(201)
    const secretaryKey = String((secretary.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? '')
    expect(secretaryKey).not.toBe('')
    const asTheSecretary = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'shut-secretary', 'x-mole-office-key': secretaryKey }
    const bySecretary = await fetch(`${world.api}/api/office/shut-down`, { method: 'POST', headers: asTheSecretary, body: JSON.stringify({ seen: [run.session] }) })
    const bySecretaryBody = (await bySecretary.json()) as Record<string, unknown>
    expect(bySecretary.status, JSON.stringify(bySecretaryBody)).toBe(403)
    expect(bySecretaryBody['code']).toBe('shutDownOnlyTheOwner')
    const secretarysList = (await (await fetch(`${world.api}/api/office/live-runs`, { headers: asTheSecretary })).json()) as { mayPress: boolean }
    expect(secretarysList.mayPress, 'the list tells the secretary it may not press').toBe(false)
    expect(((await ask(world, '/api/office/live-runs')).body)['mayPress'], 'the list tells the owner it may').toBe(true)
    expect((await theLiveRuns(world)).pausable.map((one) => one.session)).toEqual([run.session])

    // THE OWNER'S PRESS CONFIRMED A LIST THAT DID NOT SHOW THIS RUN (criterion W6: the shutdown lists the runs and
    // asks once more), so it is refused with its code and nothing is stopped: the run is at work, the office answers.
    const unseen = await ask(world, '/api/office/shut-down', { method: 'POST', body: { seen: [] } })
    expect(unseen.status, JSON.stringify(unseen.body)).toBe(409)
    expect(unseen.body['code']).toBe('shutDownRunsChanged')
    expect(unseen.body['values']).toEqual({ count: 1 })
    expect(String(unseen.body['error'])).toContain('nothing was stopped and Mole Office is still running')
    expect((await theLiveRuns(world)).pausable.map((one) => one.session)).toEqual([run.session])
    expect((await theRunsGoing(world)).map((one) => one.session)).toContain(run.session)

    // THE SHUTDOWN: the run is paused, and the office closes after answering.
    const server = theLock(world)!
    const shut = await ask(world, '/api/office/shut-down', { method: 'POST', body: { why: 'the test is shutting the office down', seen: [run.session] } })
    expect(shut.status, JSON.stringify(shut.body)).toBe(200)
    const paused = shut.body['paused'] as { session: string; conversation: string | null }[]
    expect(paused.map((one) => one.session)).toEqual([run.session])
    expect(paused[0]?.conversation).toBe(run.conversation)
    expect(shut.body['notPaused']).toEqual([])
    expect(await closed(world, server.pid), 'the office closed after the shutdown').toBe(true)
    // The terminal the office did not start is still running.
    expect(terminal.pid !== undefined && theProcessAt(terminal.pid).here).toBe(true)

    // STARTED AGAIN: the record says paused, who asked, when and why, and keeps its conversation.
    const restartAsked = Date.now()
    const again = await theCommand(world, 'start')
    expect(again.code, again.out).toBe(0)
    const record = await aRecord(world, run.session)
    expect(record['state']).toBe('paused')
    const pause = record['paused'] as { at: string; by: unknown; because: string }
    expect(pause.by).toEqual({ kind: 'person', id: THE_PERSON })
    expect(pause.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(pause.because).toContain('the test is shutting the office down')
    expect(record['providerSession']).toBe(run.conversation)

    // AND IT IS NOT CARRIED ON BY ITSELF: the worker's first whole pass after the restart starts nothing for it.
    const pass = await until(async () => aWholePassSince(world, restartAsked), (at) => at !== null, 30_000)
    expect(pass, 'the worker ended a whole pass after the restart').not.toBeNull()
    const runs = await theRunsFor(world, messageId)
    expect(runs.map((one) => one.id)).toEqual([run.session])
    expect((await aRecord(world, run.session))['state']).toBe('paused')
    expect((await theLiveRuns(world)).pausable).toEqual([])
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 180_000)

  it('is not a crash: a run a crash cut off is carried on by itself at the next start', async () => {
    const world = await aWorld('a-crash-resumes')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const messageId = await aMessageTo(world, 'crash-runner', 'please name the conversation and hang')
    const going = await until(() => theRunsGoing(world), (runs) => runs.some((one) => one.messageId === messageId && one.providerSession !== null && one.pgid !== null))
    const run = going.find((one) => one.messageId === messageId)!
    const conversation = (await until(() => aRecord(world, run.session), (data) => typeof data['providerSession'] === 'string'))['providerSession']
    expect(conversation).toMatch(/^fake-[a-z0-9]+$/)

    // THE CRASH: the server and the run both killed outright, as the machine going down would.
    const server = theLock(world)!
    const rows = (await ask(world, '/api/resources')).body['resources'] as { type: string; key: string; detail: string | null }[]
    const workers = rows.filter((r) => r.type === 'process' && r.detail?.includes('message worker') && theProcessAt(Number(r.key)).here).map((r) => Number(r.key))
    if (workers.length === 0) throw new Error(`No live message worker is on the ledger: ${JSON.stringify(rows)}`)
    process.kill(-server.pgid, 'SIGKILL')
    process.kill(-run.pgid!, 'SIGKILL')
    await until(async () => theProcessAt(server.pid).here || theProcessAt(run.pgid!).here, (here) => !here, 10_000)
    // The worker of the killed server stops by itself once its server is gone (--stop-with-pid), and is waited for.
    await until(async () => workers.some((pid) => theProcessAt(pid).here), (here) => !here, 10_000)

    const again = await theCommand(world, 'start')
    expect(again.code, again.out).toBe(0)
    // CARRIED ON BY ITSELF: a second run for the same message, resuming the same conversation.
    const runs = await until(() => theRunsFor(world, messageId), (all) => all.length >= 2, 60_000)
    expect(runs.length).toBe(2)
    const carriedOn = runs.find((one) => one.id !== run.session)!
    expect(carriedOn.data['providerSession']).toBe(conversation)
    // ITS GROUP IS RECORDED, waited for rather than asked once, so the case can stop it when it ends.
    const registered = await until(() => theRunsGoing(world), (going) => going.some((one) => one.session === carriedOn.id && isRegisteredRun(one)), 30_000)
    expect(registered.some((one) => one.session === carriedOn.id && isRegisteredRun(one)), 'the carried-on run registered its own process group').toBe(true)
    // The carry-on starts the new run first and ends the old record a moment later (`carryOnFromARestart`
    // in src/worker/index.ts says why that order), so the old record is waited for, not read once.
    expect((await until(() => aRecord(world, run.session), (data) => data['state'] === 'crashed', 20_000))['state']).toBe('crashed')
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 180_000)
})

it('a separate pause keeps the API alive, survives a restart, and resumes only new worker work',async()=>{
  const world=await aWorld('separate-pause')
  world.env['MOLE_OFFICE_MESSAGE_WORKER']='on'
  const start=await theCommand(world,'start');expect(start.code,start.out).toBe(0)
  const message=await aMessageTo(world,'pause-runner','please name the conversation and hang')
  const live=await until(()=>theLiveRuns(world),r=>r.pausable.some(x=>x.conversation!==null));await theRunsGoing(world)
  const run=live.pausable.find(x=>x.message?.id===message)!
  expect(run?.conversation).toMatch(/^fake-/)
  const activeWorkerRows=(await ask(world,'/api/resources')).body['resources'] as {type:string;key:string;detail:string|null}[]
  expect(activeWorkerRows.some(r=>r.type==='process'&&r.detail?.includes('message worker')&&theProcessAt(Number(r.key)).here),JSON.stringify(activeWorkerRows)).toBe(true)
  const instance=(await ask(world,'/api/office/restart')).body['instance']
  const pause=await ask(world,'/api/office/pause',{method:'POST',body:{why:'Made-up quiet office'}})
  expect(pause.status,JSON.stringify(pause.body)).toBe(200)
  expect((pause.body['paused'] as {session:string}[]).map(r=>r.session)).toContain(run.session)
  expect((await ask(world,'/api/office/restart')).body['instance']).toBe(instance)
  expect((await aRecord(world,run.session))['state']).toBe('paused')
  expect((await aRecord(world,run.session))['providerSession']).toBe(run.conversation)
  const stop=await theCommand(world,'stop');expect(stop.code,stop.out).toBe(0)
  const again=await theCommand(world,'start');expect(again.code,again.out).toBe(0)
  expect((await ask(world,'/api/office/pause')).body['paused']).toBe(true)
  const workerRows=(await ask(world,'/api/resources')).body['resources'] as {type:string;key:string;detail:string|null}[]
  const liveWorkers=workerRows.filter(r=>r.type==='process'&&r.detail?.includes('message worker')&&theProcessAt(Number(r.key)).here)
  expect(liveWorkers).toEqual([])
  const nextMessage=await aMessageTo(world,'after-pause-runner','please name the conversation and hang')
  await sleep(1200)
  expect(await theRunsGoing(world)).toEqual([])
  const resume=await ask(world,'/api/office/resume',{method:'POST',body:{why:'Made-up resume office'}})
  expect(resume.status,JSON.stringify(resume.body)).toBe(200)
  const going=await until(()=>theRunsGoing(world),r=>r.some(x=>x.messageId===nextMessage&&isRegisteredRun(x)))
  expect(going.some(x=>x.messageId===nextMessage&&isRegisteredRun(x))).toBe(true)
  expect(going.some(x=>x.session===run.session)).toBe(false)
  expect((await aRecord(world,run.session))['state']).toBe('paused')
},180_000)
