// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START THAT CARRIES THE TEST SUITE'S MARK TIES WHAT IT STARTS TO THE TEST RUN THE MARK NAMES, AND NEVER STARTS THE
 * LIVE OFFICE.
 *
 * The service command starts the server and the terminal holder detached, in groups of their own, so that an office
 * outlives the command that started it. Under a test that left them running when the runner was killed with SIGKILL,
 * because nothing ran the test's afterAll. So a marked start hands each process it starts --end-with-the-test-run with
 * the mark's process number (src/config/the-test-mark.mjs), and each of them ends when that process is gone. Here:
 *
 * - A stand-in for the runner puts its own process number in the mark, runs `start` with the message worker on, and
 *   stays. Its group is sent SIGKILL once the start has answered, and the server, its message worker and the holder
 *   are gone within fifteen seconds. Each is known by its number and its start time, read before the kill, from what
 *   the start printed, the service lock and the server's runtime answer. Before the kill, the server's and the holder's
 *   command lines carry the flag, and the lock records no starter.
 * - A mark that is not a process number, and a mark that names a process that has ended, are refused before anything
 *   starts, in one sentence, and the value of a malformed mark is not printed.
 * - The live office is refused: a checkout that is the made-up home's stable checkout through a link, and a database
 *   that is, through a link, the one the stable checkout's settings name. That .env holds a second, planted value,
 *   and it is printed nowhere.
 * - Two cases run from a checkout copied with a .env of its own (copyBootstrapSettings). One copy's .env pairs it with
 *   the made-up home's stable checkout: its start is refused for the checkout that pairing would put in place, before
 *   anything starts. The other copy pairs with nothing, and its scratch database has a lock beside it that names the
 *   stable checkout and a process that has ended. Nothing but that lock says the database is the live office's, and
 *   the start is refused for it.
 * - A start without the mark, under the runner, hands nobody the flag.
 *
 * IT NEEDS `npm run build`: a real `start` refuses until the page is built (dist/web).
 *
 * ONLY MADE-UP OFFICES. Each has its own folder with a made-up home, its own database and a free port, and every group
 * a start names is recorded the moment it is read and stopped by that group afterwards (tests/terminal-holder-stand.ts).
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { REPO_ROOT, serviceLockPathFrom } from '../src/config/settings.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { theStableCheckoutFolder } from '../src/config/sandbox-folder.mjs'
import { commandLineOf, theProcessAt } from '../src/config/session-process.mjs'
import { THE_TEST_MARK, THE_TEST_RUN_FLAG } from '../src/config/the-test-mark.mjs'
import { REPO, aFreePort, aPlace, aServerEnvironment, ask, groups, stopEverything, until, type Place } from './terminal-holder-stand.ts'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'

const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')

afterAll(stopEverything, 60_000)

const MARKED = `This start carries the test suite's mark ${THE_TEST_MARK}`
const UNTIED = 'so nothing was started or stopped: an office started now could not end with the test run that asked for it.'
const LIVE = 'so nothing was started or stopped: the mark never ties the live office to a test run.'

interface World {
  place: Place
  api: string
  env: NodeJS.ProcessEnv
  lockPath: string
}

async function aWorld(name: string, more: NodeJS.ProcessEnv = {}): Promise<World> {
  const place = aPlace(name)
  const port = await aFreePort()
  const env: NodeJS.ProcessEnv = {
    ...(await aServerEnvironment(place, port)),
    MOLE_OFFICE_TERMINAL_HOLDER: 'on',
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
    ...more,
  }
  const database = String(env['MOLE_OFFICE_DB'])
  return { place, api: `http://127.0.0.1:${String(port)}`, env, lockPath: serviceLockPathFrom({ MOLE_OFFICE_DB: database }) }
}

/** The holder's pid and group in what `start` printed, the group recorded at once to stop. */
function theHolderNamedIn(out: string): { pid: number, pgid: number } | null {
  const found = /The terminal holder is process (\d+), in process group (\d+)\./.exec(out)
  if (found === null) return null
  groups.add(Number(found[2]))
  return { pid: Number(found[1]), pgid: Number(found[2]) }
}

/** The token of a lock a case writes itself. Its group is no process of this test's, so it is never recorded to stop. */
const A_PLANTED_TOKEN = 'a-lock-this-test-wrote'

/** The server's group its lock names, recorded at once to stop. */
function recordTheLocksGroup(world: World): void {
  const lock = readTheServiceLock(world.lockPath)
  if (lock.state === 'read' && lock.lock.token !== A_PLANTED_TOKEN) groups.add(lock.lock.pgid)
}

/**
 * A CHECKOUT OF ITS OWN in the world's folder: the service command and the modules it imports by a static import,
 * copied, with the .env given. Its settings are its own, whatever the .env of this checkout's main checkout says.
 */
function aCopiedCheckout(world: World, name: string, env: string): string {
  const checkout = join(world.place.dir, name)
  copyBootstrapSettings(checkout, ['src/config/the-service-command.mjs'])
  writeFileSync(join(checkout, '.env'), env)
  return checkout
}

/** Run the command, this checkout's or a copied one's, to its end. Every group it names is recorded before anything is asserted. */
function theCommand(world: World, what: string, checkout = REPO): Promise<{ code: number | null, out: string }> {
  const command = join(checkout, 'src', 'config', 'the-service-command.mjs')
  const child = spawn(process.execPath, [command, what], { cwd: checkout, env: world.env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (chunk) => (out += String(chunk)))
  child.stderr.on('data', (chunk) => (out += String(chunk)))
  const timer = setTimeout(() => child.kill('SIGTERM'), 150_000)
  return new Promise((done) => {
    child.on('close', (code) => {
      clearTimeout(timer)
      recordTheLocksGroup(world)
      theHolderNamedIn(out)
      done({ code, out })
    })
  })
}

/**
 * Nothing started: no lock, or the lock the case wrote as it wrote it, no holder socket, no holder named, and nothing
 * answering on the port.
 */
async function expectNothingStarted(world: World, out: string, lockAsWritten: string | null = null): Promise<void> {
  if (lockAsWritten === null) expect(readTheServiceLock(world.lockPath).state, out).toBe('absent')
  else expect(readFileSync(world.lockPath, 'utf8'), out).toBe(lockAsWritten)
  expect(existsSync(world.place.socket), out).toBe(false)
  expect(theHolderNamedIn(out), out).toBeNull()
  const answered = await fetch(`${world.api}/api/health`, { signal: AbortSignal.timeout(3_000) }).then(() => 'answered', () => 'nothing')
  expect(answered, out).toBe('nothing')
}

/**
 * A STAND-IN FOR THE TEST RUNNER: it puts its own process number in the mark, as the runner does, runs `start`, writes
 * the code and what `start` said into `result`, and stays until it is killed.
 */
const A_STAND_IN_RUNNER = `
const { spawn } = require('node:child_process')
const { writeFileSync } = require('node:fs')
const [command, cwd, result, mark] = process.argv.slice(1)
process.env[mark] = String(process.pid)
const start = spawn(process.execPath, [command, 'start'], { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
start.stdout.on('data', (chunk) => { out += String(chunk) })
start.stderr.on('data', (chunk) => { out += String(chunk) })
start.on('close', (code) => writeFileSync(result, JSON.stringify({ code, out })))
setInterval(() => {}, 60_000)
`

/** What the stand-in wrote, or null until it has written it whole. */
function theRunnersResult(file: string): { code: number | null, out: string } | null {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as { code: number | null, out: string }
  } catch {
    return null
  }
}

interface Watched {
  who: string
  pid: number
  startedAt: string | null
}

/** A process read now, by its number and its start time. */
function readNow(who: string, pid: number): Watched {
  const now = theProcessAt(pid)
  expect(now.here, `${who}, process ${String(pid)}, is not running before the kill`).toBe(true)
  return { who, pid, startedAt: now.here ? now.startedAt : null }
}

/** Whether a process read before is still the same process now: the same number, and the same start. */
function stillThere(one: Watched): boolean {
  const now = theProcessAt(one.pid)
  return now.here && now.startedAt === one.startedAt
}

describe("a start that carries the test suite's mark", () => {
  it('hands the flag to the server and the holder, records no starter, and all three end within 15 s of a SIGKILL of the test run', async () => {
    const world = await aWorld('tie-run', {
      MOLE_OFFICE_MESSAGE_WORKER: 'on',
      MOLE_OFFICE_PIXEL_OFFICE: 'off',
      // THE WORKER STARTS ONLY WITHOUT THE RUNNER'S OWN NAMES: under VITEST the server starts none. The mark is put back
      // by the stand-in, with its own process number.
      VITEST: undefined,
      VITEST_WORKER_ID: undefined,
      [THE_TEST_MARK]: undefined,
      MOLE_OFFICE_AGENT: undefined,
      MOLE_OFFICE_SESSION: undefined,
      MOLE_AGENT_KEY: undefined,
    })
    const result = join(world.place.dir, 'the-start.json')
    const runner = spawn(process.execPath, ['-e', A_STAND_IN_RUNNER, THE_COMMAND, REPO, result, THE_TEST_MARK], {
      cwd: REPO,
      env: world.env,
      detached: true,
      stdio: 'ignore',
    })
    const runnerPid = runner.pid
    expect(runnerPid, 'the stand-in runner did not start').toBeTypeOf('number')
    groups.add(runnerPid as number)
    const started = await until(() => theRunnersResult(result), (read) => read !== null, 150_000)
    expect(started, 'the stand-in runner never wrote what start said').not.toBeNull()
    const { code, out } = started as { code: number | null, out: string }
    recordTheLocksGroup(world)
    const holder = theHolderNamedIn(out)
    expect(code, out).toBe(0)
    expect(holder, out).not.toBeNull()
    const lock = readTheServiceLock(world.lockPath)
    expect(lock.state, out).toBe('read')
    if (lock.state !== 'read' || holder === null) return

    // THE MESSAGE WORKER, as the server's runtime answer names it.
    const runtime = await until(
      () => ask(world.api, '/api/runtime').catch(() => ({ status: 0, body: {} as Record<string, unknown> })),
      (read) => (read.body['worker'] as { started?: boolean } | undefined)?.started === true,
      90_000,
    )
    const worker = runtime.body['worker'] as { started?: boolean, pid?: number, pgid?: number, says?: string } | undefined
    expect(worker?.started, JSON.stringify(worker)).toBe(true)
    if (typeof worker?.pgid === 'number') groups.add(worker.pgid)
    expect(worker?.pid, JSON.stringify(worker)).toBeTypeOf('number')

    // THE FLAG IS ON THE SERVER AND ON THE HOLDER, AND THE LOCK RECORDS NO STARTER.
    const flag = `${THE_TEST_RUN_FLAG}=${String(runnerPid)}`
    expect(commandLineOf(lock.lock.pid), 'the server').toContain(flag)
    expect(commandLineOf(holder.pid), 'the holder').toContain(flag)
    expect(lock.lock.starter).toBeUndefined()

    const watched = [readNow('the server', lock.lock.pid), readNow('the message worker', worker?.pid as number), readNow('the terminal holder', holder.pid)]
    process.kill(-(runnerPid as number), 'SIGKILL')
    const left = await until(() => watched.filter(stillThere).map((one) => one.who), (still) => still.length === 0, 15_000)
    expect(left, 'still running 15 s after the test run was killed').toEqual([])
  }, 300_000)

  it('is refused before anything starts when the mark is not a process number, and the value is not printed', async () => {
    const world = await aWorld('tie-nan', { [THE_TEST_MARK]: 'runner-seven' })
    const { code, out } = await theCommand(world, 'start')
    expect(code, out).toBe(1)
    expect(out).toContain(`${MARKED}, but its value is not a process number, ${UNTIED}`)
    expect(out).not.toContain('runner-seven')
    await expectNothingStarted(world, out)
  }, 300_000)

  it('is refused before anything starts when the mark names a process that has ended', async () => {
    const ended = spawnSync(process.execPath, ['-e', ''])
    expect(ended.status).toBe(0)
    const world = await aWorld('tie-gone', { [THE_TEST_MARK]: String(ended.pid) })
    const { code, out } = await theCommand(world, 'start')
    expect(code, out).toBe(1)
    expect(out).toContain(`${MARKED}, but it names process ${String(ended.pid)}, which is not running, ${UNTIED}`)
    await expectNothingStarted(world, out)
  }, 300_000)

  it('is refused when the checkout is, through a link, the stable checkout of its home', async () => {
    const world = await aWorld('tie-co')
    const stable = theStableCheckoutFolder(world.place.home)
    mkdirSync(dirname(stable), { recursive: true })
    symlinkSync(REPO.replace(/\/$/, ''), stable)
    const { code, out } = await theCommand(world, 'start')
    expect(code, out).toBe(1)
    expect(out).toContain(`${MARKED}, but the checkout it would run from, ${REPO_ROOT}, is the stable checkout ${stable}, ${LIVE}`)
    await expectNothingStarted(world, out)
  }, 300_000)

  it("is refused when the database is, through a link, the one the stable checkout's settings name, and prints nothing else of that file", async () => {
    const live = aPlace('tie-live')
    writeFileSync(live.database, '')
    const world = await aWorld('tie-db')
    const linked = join(world.place.dir, 'linked.db')
    symlinkSync(live.database, linked)
    const stable = theStableCheckoutFolder(world.place.home)
    mkdirSync(stable, { recursive: true })
    writeFileSync(join(stable, '.env'), `MOLE_OFFICE_DB=${live.database}\nMOLE_OFFICE_EXAMPLE_KEY=planted-not-a-key\n`)
    world.env['MOLE_OFFICE_DB'] = linked
    world.lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: linked })
    const { code, out } = await theCommand(world, 'start')
    expect(code, out).toBe(1)
    expect(out).toContain(`${MARKED} and would open the live office's database ${linked}, ${LIVE}`)
    expect(out).not.toContain('planted-not-a-key')
    await expectNothingStarted(world, out)
  }, 300_000)

  it("is refused before anything starts when its checkout's settings pair it with the stable checkout of its home", async () => {
    const world = await aWorld('tie-paired')
    const stable = theStableCheckoutFolder(world.place.home)
    mkdirSync(stable, { recursive: true })
    const checkout = aCopiedCheckout(world, 'paired', `MOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`)
    const { code, out } = await theCommand(world, 'start', checkout)
    expect(code, out).toBe(1)
    expect(out).toContain(`${MARKED}, but the checkout it would run from, ${realpathSync(stable)}, is the stable checkout ${stable}, ${LIVE}`)
    await expectNothingStarted(world, out)
  }, 300_000)

  it('is refused when the lock beside its database names the stable checkout, though the process the lock names has ended', async () => {
    const world = await aWorld('tie-lock')
    const stable = theStableCheckoutFolder(world.place.home)
    mkdirSync(stable, { recursive: true })
    const checkout = aCopiedCheckout(world, 'unpaired', '')
    const ended = spawnSync(process.execPath, ['-e', ''])
    expect(ended.status).toBe(0)
    const database = String(world.env['MOLE_OFFICE_DB'])
    const lock = `${JSON.stringify({
      about: 'Written by this test: the lock of a live office that has ended.',
      token: A_PLANTED_TOKEN,
      pid: ended.pid,
      pgid: ended.pid,
      port: Number(world.env['MOLE_OFFICE_PORT']),
      processStartedAt: 'written by this test',
      database,
      databaseIdentity: { id: 'written-by-this-test', how: 'written by this test' },
      checkout: stable,
      takenAt: 'written by this test',
    }, null, 2)}\n`
    writeFileSync(world.lockPath, lock)
    expect(readTheServiceLock(world.lockPath).state).toBe('read')
    const { code, out } = await theCommand(world, 'start', checkout)
    expect(code, out).toBe(1)
    expect(out).toContain(`${MARKED} and would open the live office's database ${database}, ${LIVE}`)
    await expectNothingStarted(world, out, lock)
  }, 300_000)
})

describe('a start without the mark', () => {
  it('hands the flag to nobody', async () => {
    const world = await aWorld('tie-none', { [THE_TEST_MARK]: undefined })
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const holder = theHolderNamedIn(started.out)
    expect(holder, started.out).not.toBeNull()
    const lock = readTheServiceLock(world.lockPath)
    expect(lock.state, started.out).toBe('read')
    if (lock.state === 'read') expect(commandLineOf(lock.lock.pid), 'the server').not.toContain(THE_TEST_RUN_FLAG)
    if (holder !== null) expect(commandLineOf(holder.pid), 'the holder').not.toContain(THE_TEST_RUN_FLAG)
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)
})
