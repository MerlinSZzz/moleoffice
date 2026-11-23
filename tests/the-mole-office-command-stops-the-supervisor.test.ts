// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `mole-office stop` STOPS THE SUPERVISOR THAT RUNS THE OFFICE, AND RESTART PUTS IT BACK.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROBLEM THIS HOLDS SHUT
 * ---------------------------------------------------------------------------------------
 *
 * A stable office runs under `node tools/serve-dev.mjs --built --prepared`: the bootstrap publishes it
 * that way, the upgrade restarts it that way, and Part B's `npm run mole-office start` starts it that
 * way. serve-dev starts the server DETACHED, in a process group of its own, and passes it
 * `--stop-with-pid=<serve-dev's pid>`. So a stop that signals only the server's group ends the server,
 * serve-dev reads that exit as a crash, and starts the server again about half a second later.
 *
 * Round 12 fixes it in two parts. The lock records the process that started the server (item 1), and
 * stop signals that process's group when it is serve-dev and safe to signal (item 2). Restart stops
 * and starts the same shape it stopped (item 3).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DRIVES, AND WHICH WORLD EACH CASE USES
 * ---------------------------------------------------------------------------------------
 *
 * 1. The lock's `starter` field, unit level, with a process table the test writes: recorded, recorded
 *    as unread, absent, an old lock file without the field, and a malformed record.
 * 2. One REAL `tools/serve-dev.mjs --built --prepared` office on a made-up database, on a port
 *    reserved first: its lock records the starter; stop refuses a starter with another start time and
 *    a starter that is not serve-dev, signalling nothing; restart brings back a serve-dev office and
 *    refuses a lock naming another checkout, signalling nothing; stop ends serve-dev, the server and
 *    the lock, and nothing starts the server again within serve-dev's restart time.
 * 3. One real serve-dev office started the way the bootstrap and the upgrade start it, through a gate
 *    process that leads the group and holds a `sleep` it did not get from serve-dev: stop refuses to
 *    signal that group and nothing is signalled.
 *
 * THE REAL SUPERVISOR IS USED, not a fixture, because the thing under test is exactly what serve-dev
 * does with its detached child and its own SIGTERM handling. A fixture would be the stand-in for the
 * subject. The refusal cases about a starter with another start time and about a starter that is not
 * serve-dev run against the same real office by editing the lock file between cases and restoring it.
 *
 * MUTATIONS, each to be run after the control run and then restored:
 *   - signal the server's group instead of the starter's (the rc line `process.kill(-starter.pgid, ...)`);
 *   - skip the start-time check in theStarterTheLockNames;
 *   - skip the serve-dev command-line check in theStarterTheLockNames;
 *   - restart starting in lock.checkout without the this-checkout refusal;
 *   - allow a group member that is not the starter, its descendant or its gate;
 *   - keep today's `stop` for a lock with a starter (never signal the starter's group).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  readTheServiceLock,
  takeTheServiceLock,
  type ProcessReading,
  type ServiceLock,
} from '../src/config/the-service-lock.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { WORLD_HEADER, parseWorldHeader } from '../src/config/world-header.mjs'
import {
  TEST_DATABASE_PREFIX, devStackEnvironment, theCheckoutsPageBuiltAtThisCommit,
} from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')
const THE_SUPERVISOR = join(REPO, 'tools', 'serve-dev.mjs')

/** Every process group this file started a server, a supervisor or a gate in, so `afterAll` can stop each. */
const groups = new Set<number>()
/** Every folder this file made. */
const folders = new Set<string>()
/** Every child still recorded, so its own ending can be waited for after its group was signalled. */
const children: ChildProcess[] = []

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const probe = createServer()
    probe.on('error', () => done(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)))
  })
}

interface World {
  dir: string
  home: string
  database: string
  lockPath: string
  port: number
  env: NodeJS.ProcessEnv
}

async function aWorld(name: string): Promise<World> {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.add(dir)
  const home = join(dir, 'home')
  mkdirSync(home)
  const database = join(dir, 'office.db')
  const port = await aFreePort()
  const env: NodeJS.ProcessEnv = {
    ...devStackEnvironment(dir, port, await aFreePort(), { database }),
    HOME: home,
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
  }
  return { dir, home, database, lockPath: serviceLockPathFrom({ MOLE_OFFICE_DB: database }), port, env }
}

/** Run the command to its end, and say how it ended and what it printed. */
function theCommand(world: World, what: string): Promise<{ code: number | null; out: string; pid: number }> {
  // world.env already says 'off'. It is said again here because the rules-file gate
  // (tests/no-test-leaves-a-rules-file-in-the-worktree.test.ts) reads only a literal in the env a start is given.
  const child = spawn(process.execPath, [THE_COMMAND, what], {
    cwd: REPO,
    env: { ...world.env, MOLE_OFFICE_MESSAGE_WORKER: 'off' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  let out = ''
  child.stdout.on('data', (chunk) => (out += String(chunk)))
  child.stderr.on('data', (chunk) => (out += String(chunk)))
  return new Promise((done) => {
    child.on('close', (code) => {
      // RECORDED FIRST, before any assertion can fail: whatever server the lock names now is ours to stop.
      const lock = readTheServiceLock(world.lockPath)
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      done({ code, out, pid: child.pid ?? -1 })
    })
  })
}

/** The lock on disk, or a failure that says what was there instead. */
function theLock(world: World): ServiceLock {
  const read = readTheServiceLock(world.lockPath)
  if (read.state !== 'read') throw new Error(`the service lock did not read: ${JSON.stringify(read)}`)
  return read.lock
}

/** Is that process running, as the process table says? */
function isRunning(pid: number): boolean {
  return theProcessAt(pid).here
}

/** The pids whose `/proc/<pid>/cmdline` names this word and whose environment names this database. */
function theProcessesNaming(word: string, database: string): number[] {
  const found: number[] = []
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const command = readFileSync(`/proc/${entry}/cmdline`, 'utf8')
      if (!command.includes(word)) continue
      const environment = readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0')
      if (environment.includes(`MOLE_OFFICE_DB=${database}`)) found.push(Number(entry))
    } catch {
      // Gone between the listing and the read, or not ours to read: not a process of this database.
    }
  }
  return found.sort((a, b) => a - b)
}

/** The servers running src/server/index.ts on this database. */
const theServersOf = (database: string): number[] => theProcessesNaming('src/server/index.ts', database)
/** The serve-dev supervisors running on this database. */
const theSupervisorsOf = (database: string): number[] => theProcessesNaming('tools/serve-dev.mjs', database)

/** Ask the port, and say whether it answered for this database. */
async function answersFor(world: World): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${String(world.port)}/api/health`, { signal: AbortSignal.timeout(3_000) })
    const said = parseWorldHeader(res.headers.get(WORLD_HEADER))
    return said.ok && said.world.database === databaseIdentity(world.database).id
  } catch {
    return false
  }
}

/**
 * THE GATE THE REAL START USES, as the bootstrap and the upgrade run it (tools/stable/stable-bootstrap-processes.mjs
 * GATE and tools/stable/stable-upgrade-transaction.mjs GATE): a node process started with -e, whose whole job is
 * to start the program it is given and to wait for it. This one also starts a `sleep` in the same group
 * and writes both pids, so a case can prove that another process in the group stops the stop. Its list of
 * arguments for serve-dev is its last argument, as the real gates' is, because that is where the stop looks.
 */
const THE_GATE_WITH_A_STRANGER = `
const { spawn } = require('node:child_process')
const { writeFileSync } = require('node:fs')
const child = spawn(process.argv[1], JSON.parse(process.argv[4]), { stdio: 'inherit' })
const stranger = spawn('sleep', ['300'], { stdio: 'ignore' })
writeFileSync(process.argv[2], String(child.pid))
writeFileSync(process.argv[3], String(stranger.pid))
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
`

interface SupervisorStart {
  supervisor: number
  gate: number | null
  stranger: number | null
}

/**
 * Start the real supervisor, detached in a group of its own, or under a gate process that leads the
 * group and holds a stranger. Returns the pids the cases assert about, once the lock exists.
 */
async function startTheSupervisor(world: World, { throughAGate = false } = {}): Promise<SupervisorStart> {
  const log = openSync(join(world.dir, throughAGate ? 'gate.log' : 'supervisor.log'), 'a')
  const supervisorFile = join(world.dir, 'supervisor.pid')
  const strangerFile = join(world.dir, 'stranger.pid')
  const child = throughAGate
    ? spawn(
        process.execPath,
        [
          '-e',
          THE_GATE_WITH_A_STRANGER,
          process.execPath,
          supervisorFile,
          strangerFile,
          JSON.stringify(['tools/serve-dev.mjs', '--built', '--prepared']),
        ],
        { cwd: REPO, env: world.env, detached: true, stdio: ['ignore', log, log] },
      )
    : spawn(process.execPath, [THE_SUPERVISOR, '--built', '--prepared'], {
        cwd: REPO,
        env: world.env,
        detached: true,
        stdio: ['ignore', log, log],
      })
  closeSync(log)
  children.push(child)
  if (child.pid === undefined) throw new Error('the supervisor did not start')
  groups.add(child.pid)
  await untilTheOfficeAnswers(world)
  if (!throughAGate) return { supervisor: child.pid, gate: null, stranger: null }
  const supervisorPid = await untilThePidIsWritten(supervisorFile)
  const strangerPid = await untilThePidIsWritten(strangerFile)
  return { supervisor: supervisorPid, gate: child.pid, stranger: strangerPid }
}

/** Wait until a writer has written a pid to this file. */
async function untilThePidIsWritten(file: string, within = 30_000): Promise<number> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const pid = Number(readFileSync(file, 'utf8').trim())
      if (Number.isInteger(pid) && pid > 0) return pid
    }
    await sleep(50)
  }
  throw new Error(`no pid was written to ${file} within ${String(within / 1000)}s`)
}

/** Wait until an office answers on this world's port and its lock reads. */
async function untilTheOfficeAnswers(world: World, within = 120_000): Promise<ServiceLock> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    const read = readTheServiceLock(world.lockPath)
    if (read.state === 'read' && (await answersFor(world))) return read.lock
    await sleep(250)
  }
  throw new Error(`the office did not answer on port ${String(world.port)} within ${String(within / 1000)}s`)
}

/** The bytes of the lock file, so a case that edits it can put them back. */
const theLockBytes = (world: World): string => readFileSync(world.lockPath, 'utf8')
const putTheLockBytesBack = (world: World, bytes: string): void => writeFileSync(world.lockPath, bytes)

/** Edit the lock file as JSON and write it back, so a case can make the lock say something else. */
function editTheLock(world: World, edit: (lock: Record<string, unknown>) => void): string {
  const bytes = theLockBytes(world)
  const lock = JSON.parse(bytes) as Record<string, unknown>
  edit(lock)
  writeFileSync(world.lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  return bytes
}

beforeAll(async () => {
  // SERVE-DEV IS STARTED WITH --prepared, WHICH SERVES THE PAGE IN dist/web AND REFUSES WHEN ITS BUILD
  // STAMP IS NOT THIS CHECKOUT'S. `npm run build` writes the page but no stamp, so the page is built
  // with the product's own builder whenever the stamp does not name this checkout's commit, one file
  // at a time (`theCheckoutsPageBuiltAtThisCommit` in tests/helpers.ts says why).
  await theCheckoutsPageBuiltAtThisCommit()
}, 300_000)

afterAll(async () => {
  // Every group still running is asked to stop, by the id recorded when it was found, and given time.
  // Only if it is still there after that is it killed.
  const running = [...groups].filter((group) => isRunning(group))
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 20_000
  while (running.some((group) => isRunning(group)) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => isRunning(one))) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
  }
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}, 60_000)

// ================================================================ the lock records the starter

/** A process table the test writes: each pid is there with a start time and a group, or is not. */
function aTable(rows: Record<number, ProcessReading>): (pid: number) => ProcessReading {
  return (pid) => rows[pid] ?? { here: false }
}

const BEGAN = '2026-10-19T09:00:00.000Z'

describe('the lock records the process that started the server', () => {
  let dir: string
  let database: string
  let lockPath: string

  beforeAll(() => {
    dir = mkdtempSync(`${TEST_DATABASE_PREFIX}stops-the-supervisor-lock-`)
    folders.add(dir)
    database = join(dir, 'office.db')
    lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: database })
  })

  const take = (starter: number | null, readProcess: (pid: number) => ProcessReading) =>
    takeTheServiceLock({ lockPath, databasePath: database, port: 4000, checkout: REPO, pid: 100, readProcess, starter })

  /** The lock on disk, or a failure that says what was there instead. */
  function theLockHere(): ServiceLock {
    const read = readTheServiceLock(lockPath)
    if (read.state !== 'read') throw new Error(`the service lock did not read: ${JSON.stringify(read)}`)
    return read.lock
  }

  it('records the starter, its group and its start time when the server was given --stop-with-pid', async () => {
    const taken = await take(700, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 }, 700: { here: true, startedAt: BEGAN, pgid: 700 } }))
    expect(taken.taken).toBe(true)
    expect(theLockHere().starter).toEqual({ pid: 700, pgid: 700, processStartedAt: BEGAN })
    rmSync(lockPath, { force: true })
  })

  it('records an unread starter rather than a guessed one, and still takes the lock', async () => {
    const gone = await take(700, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 } }))
    expect(gone.taken).toBe(true)
    expect(theLockHere().starter).toEqual({
      pid: 700,
      unread: 'no process with that number is running',
    })
    rmSync(lockPath, { force: true })

    const unreadable = await take(
      700,
      aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 }, 700: { here: true, startedAt: null, pgid: null } }),
    )
    expect(unreadable.taken).toBe(true)
    expect(theLockHere().starter).toEqual({
      pid: 700,
      unread: 'its start time and process group could not be read',
    })
    rmSync(lockPath, { force: true })
  })

  it('records no starter when the server was given no such flag', async () => {
    const taken = await take(null, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 } }))
    expect(taken.taken).toBe(true)
    expect(Object.hasOwn(theLockHere(), 'starter')).toBe(false)
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).not.toHaveProperty('starter')
    rmSync(lockPath, { force: true })
  })

  it('reads a lock file written before the starter field existed', () => {
    const old = {
      about: 'a lock from before this round',
      token: 'an-old-token',
      pid: 100,
      pgid: 100,
      port: 4000,
      processStartedAt: BEGAN,
      database,
      databaseIdentity: { id: 'unknown', how: 'written by the test' },
      checkout: REPO,
      takenAt: new Date().toISOString(),
    }
    writeFileSync(lockPath, JSON.stringify(old))
    const read = readTheServiceLock(lockPath)
    expect(read.state).toBe('read')
    if (read.state !== 'read') return
    expect(read.lock.pid).toBe(100)
    expect(Object.hasOwn(read.lock, 'starter')).toBe(false)
    rmSync(lockPath, { force: true })
  })

  it('reads a lock whose starter record is in no shape this version writes as unreadable', () => {
    const old = {
      token: 'a-token',
      pid: 100,
      pgid: 100,
      port: 4000,
      processStartedAt: BEGAN,
      database,
      databaseIdentity: { id: 'unknown', how: 'written by the test' },
      checkout: REPO,
      takenAt: new Date().toISOString(),
      starter: { pid: 700 },
    }
    writeFileSync(lockPath, JSON.stringify(old))
    const read = readTheServiceLock(lockPath)
    expect(read.state).toBe('unreadable')
    if (read.state !== 'unreadable') return
    expect(read.why).toContain('starter')
    rmSync(lockPath, { force: true })
  })
})

// ================================================================ a real serve-dev office

describe('stop and restart of a real office run by serve-dev', () => {
  let world: World
  let supervisor: number
  let server: number

  beforeAll(async () => {
    world = await aWorld('stops-the-supervisor')
    // A FIRST BACKOFF OF 50 MS, so the last case can watch for a server started again for one second rather than six.
    // A restart keeps it: the restarted supervisor is given this environment.
    world.env['MOLE_OFFICE_TEST_SUPERVISOR_CLOCKS'] = JSON.stringify({ firstBackoff: 50 })
    supervisor = (await startTheSupervisor(world)).supervisor
    server = theLock(world).pid
  }, 180_000)

  it('records the supervisor, its group and its start time as the starter of a real office', async () => {
    const lock = theLock(world)
    const at = theProcessAt(supervisor)
    if (!at.here || at.startedAt === null) throw new Error('the test could not read the supervisor it started')
    expect(lock.starter).toEqual({ pid: supervisor, pgid: supervisor, processStartedAt: at.startedAt })
    expect(server).not.toBe(supervisor)
    expect(server).toBe(lock.pid)
  }, 30_000)

  it('refuses a starter with another start time, and signals nothing', async () => {
    const bytes = editTheLock(world, (lock) => {
      const starter = lock['starter'] as Record<string, unknown>
      starter['processStartedAt'] = new Date(Date.parse(String(starter['processStartedAt'])) + 60_000).toISOString()
    })
    try {
      const said = await theCommand(world, 'stop')
      expect(said.code, said.out).toBe(9)
      expect(said.out).toContain(`The process that started this server, ${String(supervisor)}, cannot be stopped safely`)
      expect(said.out).toContain('a process with that number began at')
      expect(said.out).toContain('Nothing was stopped.')
      expect(isRunning(supervisor)).toBe(true)
      expect(isRunning(server)).toBe(true)
      expect(await answersFor(world)).toBe(true)
    } finally {
      putTheLockBytesBack(world, bytes)
    }
  }, 60_000)

  it('refuses a starter that is not serve-dev, and signals nothing', async () => {
    const stranger = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
    children.push(stranger)
    if (stranger.pid === undefined) throw new Error('the stranger did not start')
    groups.add(stranger.pid)
    const at = theProcessAt(stranger.pid)
    if (!at.here || at.startedAt === null || at.pgid === null) throw new Error('the test could not read the stranger it started')
    const bytes = editTheLock(world, (lock) => {
      lock['starter'] = { pid: stranger.pid, pgid: at.pgid, processStartedAt: at.startedAt }
    })
    try {
      const said = await theCommand(world, 'stop')
      expect(said.code, said.out).toBe(9)
      expect(said.out).toContain('its command line is not node running tools/serve-dev.mjs')
      expect(isRunning(stranger.pid)).toBe(true)
      expect(isRunning(supervisor)).toBe(true)
      expect(isRunning(server)).toBe(true)
      expect(await answersFor(world)).toBe(true)
    } finally {
      putTheLockBytesBack(world, bytes)
    }
  }, 60_000)

  it('refuses to restart after a starter recorded unread, before anything is stopped', async () => {
    const bytes = editTheLock(world, (lock) => {
      const starter = lock['starter'] as Record<string, unknown>
      lock['starter'] = { pid: starter['pid'], unread: 'the test wrote it so' }
    })
    try {
      const said = await theCommand(world, 'restart')
      expect(said.code, said.out).toBe(9)
      expect(said.out).toContain('cannot tell which shape to bring back')
      expect(said.out).toContain('Nothing was stopped.')
      expect(isRunning(supervisor)).toBe(true)
      expect(isRunning(server)).toBe(true)
      expect(await answersFor(world)).toBe(true)
    } finally {
      putTheLockBytesBack(world, bytes)
    }
  }, 60_000)

  it('restart brings back a serve-dev office', async () => {
    const before = theLock(world)
    const restarted = await theCommand(world, 'restart')
    expect(restarted.code, restarted.out).toBe(0)
    expect(restarted.out).toContain(`under tools/serve-dev.mjs in ${REPO}`)
    expect(restarted.out).toContain('Mole Office answers on http://127.0.0.1:')
    expect(await answersFor(world)).toBe(true)
    const after = theLock(world)
    expect(after.pid).not.toBe(before.pid)
    expect(after.starter).toBeDefined()
    const starter = after.starter
    if (starter === undefined || 'unread' in starter) throw new Error(`the restarted office has no readable starter: ${JSON.stringify(starter)}`)
    expect(isRunning(starter.pid)).toBe(true)
    expect(starter.pgid).toBe(starter.pid)
    expect(starter.pid).not.toBe(supervisor)
    supervisor = starter.pid
    server = after.pid
  }, 240_000)

  it('refuses to restart when the lock names another checkout, and signals nothing', async () => {
    // The lock was taken by an office running from another folder: a real path, not this checkout.
    const otherCheckout = join(world.dir, 'a-stable-checkout')
    mkdirSync(otherCheckout)
    const bytes = editTheLock(world, (lock) => {
      lock['checkout'] = otherCheckout
    })
    try {
      const said = await theCommand(world, 'restart')
      expect(said.code, said.out).toBe(10)
      expect(said.out).toContain(`the checkout it names (${otherCheckout}) is not the checkout this command runs from`)
      expect(said.out).toContain('Nothing was stopped.')
      expect(isRunning(supervisor)).toBe(true)
      expect(isRunning(server)).toBe(true)
      expect(await answersFor(world)).toBe(true)
    } finally {
      putTheLockBytesBack(world, bytes)
    }
  }, 60_000)

  it('stops serve-dev, the server and the lock, and nothing starts the server again', async () => {
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
    expect(stopped.out).toContain(`Asked process group ${String(supervisor)} of the process that started this server (${String(supervisor)}) to stop, with SIGTERM.`)
    expect(stopped.out).toContain(`Mole Office stopped: process ${String(server)} has ended, and the service lock is gone.`)
    expect(stopped.out).toContain(`The process that started it (${String(supervisor)}) has ended too.`)
    expect(isRunning(supervisor)).toBe(false)
    expect(isRunning(server)).toBe(false)
    expect(existsSync(world.lockPath)).toBe(false)
    expect(await portIsFree(world.port)).toBe(true)
    // NO SERVER STARTS AGAIN. With the old stop — signal the server's group only — serve-dev counted the
    // exit as a crash and started a new server within its first backoff. This office's first backoff is
    // 50 ms (beforeAll), so one second is four doublings further than that: 50 + 100 + 200 + 400 ms.
    const until = Date.now() + 1_000
    while (Date.now() < until) {
      expect(theSupervisorsOf(world.database), 'a supervisor appeared again').toEqual([])
      expect(theServersOf(world.database), 'a server appeared again').toEqual([])
      expect(existsSync(world.lockPath), 'a lock appeared again').toBe(false)
      expect(await portIsFree(world.port), 'the port was taken again').toBe(true)
      await sleep(100)
    }
  }, 120_000)
})

// ================================================================ a gate that holds a foreign process

describe('stop refuses a group that holds a process serve-dev did not start', () => {
  let world: World
  let started: SupervisorStart
  let server: number

  beforeAll(async () => {
    world = await aWorld('stops-the-supervisor-gated')
    started = await startTheSupervisor(world, { throughAGate: true })
    server = theLock(world).pid
  }, 180_000)

  it('leaves the gate, its stranger, serve-dev and the server running, and signals nothing', async () => {
    const gate = started.gate
    const stranger = started.stranger
    if (gate === null || stranger === null) throw new Error('the gated office did not record its gate and stranger')
    const lock = theLock(world)
    const starter = lock.starter
    if (starter === undefined || 'unread' in starter) throw new Error(`the gated office has no readable starter: ${JSON.stringify(starter)}`)
    expect(starter.pid).toBe(started.supervisor)
    expect(starter.pgid).toBe(gate)
    expect(gate).not.toBe(started.supervisor)
    const said = await theCommand(world, 'stop')
    expect(said.code, said.out).toBe(9)
    expect(said.out).toContain(`process group ${String(gate)} holds process ${String(stranger)}, which is not the starter or one of the processes it began`)
    expect(said.out).toContain('Nothing was stopped.')
    expect(isRunning(gate)).toBe(true)
    expect(isRunning(stranger)).toBe(true)
    expect(isRunning(started.supervisor)).toBe(true)
    expect(isRunning(server)).toBe(true)
    expect(await answersFor(world)).toBe(true)
  }, 60_000)
})
