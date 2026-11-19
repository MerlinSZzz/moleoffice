// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE `mole-office` COMMAND STARTS ONE SERVICE PER DATABASE, WHICH OUTLIVES IT AND STOPS ONLY WHEN ASKED.
 *
 * Criteria W1, W2(a), W2(c) and W9 of design/window/ACCEPTANCE.md, on real processes. Each world here is
 * made by this test: a folder, a database file in it that does not exist yet, a free port and a home
 * folder of its own. Every server started is recorded by its process group the moment it is known,
 * and `afterAll` stops each group still running, even when a case failed.
 *
 * The server serves the built page in production, and it can only serve this checkout's `dist/web`
 * (`THE_BUILT_PAGE` in src/config/the-built-page.mjs; there is no setting that points it elsewhere).
 * So this test needs `npm run build` to have run, as the worktree recipe in chapter 3 of the office
 * regulations says, and it fails with the build's own sentence when it has not.
 *
 * MUTATION: make `whoHoldsTheLock` in src/config/the-service-lock.mjs answer `{ state: 'gone' }`
 * whatever the process reading says. The second server then takes the lock over instead of being
 * refused, and the cases about one server per database go red.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_BUILT_PAGE, missingWebBuild } from '../src/config/the-built-page.mjs'
import { THE_SERVICE_LOCK_REFUSAL_EXIT_CODE, readTheServiceLock, type ServiceLock } from '../src/config/the-service-lock.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { WORLD_HEADER, parseWorldHeader } from '../src/config/world-header.mjs'
import { TEST_DATABASE_PREFIX, commandThatStopsWithItsOwner, devStackEnvironment } from './helpers.ts'
import { aStampOf, theLinesIn, theSpoolUnder } from './the-gate-count-spool-under-a-home.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')
const THE_SERVER = join(REPO, 'src', 'server', 'index.ts')

/** Every process group this file started or found a server in, so `afterAll` can stop each one. */
const groups = new Set<number>()
/** Every folder this file made. */
const folders = new Set<string>()

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
  return { dir, database, lockPath: serviceLockPathFrom({ MOLE_OFFICE_DB: database }), port, env }
}

/** Run the command to its end, and say how it ended and what it printed. */
function theCommand(world: World, what: string): Promise<{ code: number | null; out: string; pid: number }> {
  const child = spawn(process.execPath, [THE_COMMAND, what], { cwd: REPO, env: world.env, stdio: ['ignore', 'pipe', 'pipe'] })
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

/**
 * The processes running src/server/index.ts on this database, read from each one's own environment.
 * Other workers' servers on this machine name other databases, so they are not counted.
 */
function theServersOf(database: string): number[] {
  const found: number[] = []
  for (const entry of readdirSync('/proc')) { // machine-wide on purpose: a second server on this database is named in no lock or file this test reads, so only a look at every process can show there is none
    if (!/^\d+$/.test(entry)) continue
    try {
      const command = readFileSync(`/proc/${entry}/cmdline`, 'utf8')
      if (!command.includes('src/server/index.ts')) continue
      const environment = readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0')
      if (environment.includes(`MOLE_OFFICE_DB=${database}`)) found.push(Number(entry))
    } catch {
      // Gone between the listing and the read, or not ours to read: not a server of this database.
    }
  }
  return found.sort((a, b) => a - b)
}

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

/** Is any process of that group still running? */
function aGroupIsThere(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw err
  }
}

/**
 * Start the server itself, not through the command, as its own group, and wait for the group to end. It
 * is started without --stop-with-pid, so its lock names no starter, and the watchdog ends its group if
 * this worker dies first. The watchdog is a shell that carries the server's command line, and it leaves
 * up to a second after the server does, so until then theServersOf would count it.
 */
function aServerStartedDirectly(world: World, port: number): Promise<{ code: number | null; out: string }> {
  const watched = commandThatStopsWithItsOwner(process.execPath, ['--import', 'tsx', THE_SERVER])
  const child = spawn(watched.command, watched.args, {
    cwd: REPO,
    env: { ...world.env, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_API: `http://127.0.0.1:${String(port)}`, NODE_ENV: 'production' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (child.pid !== undefined) groups.add(child.pid)
  let out = ''
  child.stdout.on('data', (chunk) => (out += String(chunk)))
  child.stderr.on('data', (chunk) => (out += String(chunk)))
  return new Promise((done) => {
    const bound = setTimeout(() => done({ code: null, out: `${out}\n[the test stopped waiting after 90 seconds]` }), 90_000)
    child.on('close', async (code) => {
      clearTimeout(bound)
      const deadline = Date.now() + 5_000
      while (child.pid !== undefined && aGroupIsThere(child.pid) && Date.now() < deadline) await sleep(100)
      done({ code, out })
    })
  })
}

beforeAll(() => {
  const missing = missingWebBuild(THE_BUILT_PAGE)
  if (missing !== null) throw new Error(`This test starts the server in production, which serves the built page. ${missing}`)
})

afterAll(async () => {
  // Every group still running is asked to stop, by the id recorded when it was found, and given the
  // server's own shutdown time. Only if it is still there after that is it killed.
  const running = [...groups].filter((group) => isRunning(group))
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((group) => isRunning(group)) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => isRunning(one))) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}, 40_000)

describe('one service per database, started by one command and stopped by another', () => {
  let world: World
  let server: number

  beforeAll(async () => {
    world = await aWorld('mole-office-command')
  })

  it('starts the service, and the command ends while the service keeps answering', async () => {
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const lock = theLock(world)
    server = lock.pid
    expect(lock.pgid, 'the service leads a process group of its own').toBe(server)
    expect(lock.port).toBe(world.port)
    // THIS COMMAND STARTS THE SERVER ALONE, WITHOUT --stop-with-pid, so the lock names no starter.
    // A server started under a supervisor records the supervisor instead (round 12, item 1).
    expect(Object.hasOwn(lock, 'starter'), 'a command-started server records no starter').toBe(false)
    expect(started.out).toContain(`process ${String(server)}, in process group ${String(server)}`)
    expect(started.out).toContain(`Mole Office answers on http://127.0.0.1:${String(world.port)}`)
    // The command's own process has ended, and the service is not it and still answers.
    expect(started.pid).not.toBe(server)
    expect(isRunning(started.pid)).toBe(false)
    expect(isRunning(server)).toBe(true)
    expect(await answersFor(world)).toBe(true)
    // Its output went to the log beside the lock.
    expect(readFileSync(join(world.dir, 'office.db.service.log'), 'utf8')).toContain('This server holds the service lock')
  }, 120_000)

  it('says it is running, with its process and its port', async () => {
    const said = await theCommand(world, 'status')
    expect(said.code, said.out).toBe(0)
    expect(said.out).toContain(`Mole Office is running: process ${String(server)} serves the database ${world.database}`)
    // The health and the world come from the one self-check in src/config/the-self-check.mjs.
    expect(said.out).toContain(`The office this checkout declares answers at http://127.0.0.1:${String(world.port)}, and its health check says ok.`)
    expect(said.out).toContain(`http://127.0.0.1:${String(world.port)}`)
  }, 30_000)

  it('finds the running service on a second start and starts nothing', async () => {
    const again = await theCommand(world, 'start')
    expect(again.code, again.out).toBe(0)
    expect(again.out).toContain(`Mole Office is already running: process ${String(server)}`)
    expect(again.out).toContain('Nothing was started.')
    expect(theLock(world).pid).toBe(server)
    expect(theServersOf(world.database)).toEqual([server]) // machine-wide on purpose: the second start must have started no server, and one it started would be named in no lock or file this test reads
  }, 60_000)

  // THE GATE the-office-starts-once IS MET AT EACH START THAT FINDS THE SERVICE RUNNING, and counted in the gate-count
  // spool under this world's home. The start that started it met nothing, so after this third start the spool holds
  // one line for each of the two that found it. Mutation: take the call out before "is already running", or call it on
  // a start that starts the service too.
  it('counts each start that found the service running once, in the spool under its own home', async () => {
    const before = aStampOf(new Date())
    const again = await theCommand(world, 'start')
    const after = aStampOf(new Date())
    expect(again.code, again.out).toBe(0)
    expect(again.out).toContain('Nothing was started.')
    const lines = theLinesIn(theSpoolUnder(world.env.HOME ?? ''))
    expect(lines.map(({ gate, position, sandbox }) => ({ gate, position, sandbox }))).toEqual([
      { gate: 'the-office-starts-once', position: 'block', sandbox: null },
      { gate: 'the-office-starts-once', position: 'block', sandbox: null },
    ])
    expect(lines[1]!.at >= before && lines[1]!.at <= after, lines[1]!.at).toBe(true)
  }, 60_000)

  it('refuses a second server started directly on the same database and another port, by the lock', async () => {
    const otherPort = await aFreePort()
    const second = await aServerStartedDirectly(world, otherPort)
    expect(second.code, second.out).toBe(THE_SERVICE_LOCK_REFUSAL_EXIT_CODE)
    expect(second.out).toContain('This server did not start, because another Mole Office server holds the service lock')
    expect(second.out).toContain(`That server is process ${String(server)}, started for port ${String(world.port)}`)
    expect(second.out).toContain(world.lockPath)
    expect(await portIsFree(otherPort)).toBe(true)
    expect(theLock(world).pid).toBe(server)
    expect(theServersOf(world.database)).toEqual([server]) // machine-wide on purpose: the refused start must leave one server on this database, and a second would be named in no lock or file this test reads
    expect(await answersFor(world)).toBe(true)
  }, 120_000)

  it('stops the service, which lets the lock and the port go', async () => {
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
    expect(stopped.out).toContain(`Mole Office stopped: process ${String(server)} has ended, and the service lock is gone.`)
    expect(isRunning(server)).toBe(false)
    expect(existsSync(world.lockPath)).toBe(false)
    expect(await portIsFree(world.port)).toBe(true)
  }, 60_000)

  it('then says it is not running', async () => {
    const said = await theCommand(world, 'status')
    expect(said.code, said.out).toBe(3)
    expect(said.out).toContain(`There is no service lock at ${world.lockPath}.`)
    expect(said.out).toContain(`Mole Office is not running for the database ${world.database}.`)
  }, 30_000)
})

describe('the lock is taken before the database is opened', () => {
  it('refuses a server whose database is locked by a running process, and the database file is never made', async () => {
    const world = await aWorld('mole-office-lock-first')
    // The lock names this test's own process, which is running and began when the process table says.
    const me = theProcessAt(process.pid)
    if (!me.here || me.startedAt === null || me.pgid === null) throw new Error('this test could not read its own process')
    writeFileSync(
      world.lockPath,
      JSON.stringify({
        token: 'the-test-holds-it',
        pid: process.pid,
        pgid: me.pgid,
        port: 1,
        processStartedAt: me.startedAt,
        database: world.database,
        databaseIdentity: { id: 'unknown', how: 'written by the test' },
        checkout: REPO,
        takenAt: new Date().toISOString(),
      }),
    )
    const refused = await aServerStartedDirectly(world, world.port)
    expect(refused.code, refused.out).toBe(THE_SERVICE_LOCK_REFUSAL_EXIT_CODE)
    expect(refused.out).toContain(`That server is process ${String(process.pid)}`)
    expect(existsSync(world.database), 'the server opened the database before it asked for the lock').toBe(false)
  }, 120_000)
})

describe('stop refuses a service that does not lead its own process group', () => {
  it('leaves it running and says to stop it the way it was started', async () => {
    const world = await aWorld('mole-office-not-a-leader')
    // A shell leads the group and the server is a member of it, as under `npm start` in a terminal.
    const shell = spawn('/bin/sh', ['-c', `"${process.execPath}" --import tsx "${THE_SERVER}" & wait`], {
      cwd: REPO,
      env: { ...world.env, NODE_ENV: 'production' },
      detached: true,
      stdio: 'ignore',
    })
    if (shell.pid === undefined) throw new Error('the shell did not start')
    groups.add(shell.pid)
    const deadline = Date.now() + 90_000
    while (!(await answersFor(world)) && Date.now() < deadline) await sleep(250)
    expect(await answersFor(world)).toBe(true)
    const lock = theLock(world)
    expect(lock.pgid).toBe(shell.pid)
    expect(lock.pid).not.toBe(shell.pid)

    const said = await theCommand(world, 'stop')
    expect(said.code, said.out).toBe(8)
    expect(said.out).toContain(`Process ${String(lock.pid)} serves this database, but it does not lead its own process group`)
    expect(said.out).toContain('Stop it the way it was started.')
    expect(isRunning(lock.pid)).toBe(true)
    expect(await answersFor(world)).toBe(true)
  }, 120_000)
})
