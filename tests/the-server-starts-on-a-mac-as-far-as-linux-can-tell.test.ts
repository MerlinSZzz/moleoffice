// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SERVER STARTS WITH ITS PLATFORM SET TO darwin, TAKES THE SERVICE LOCK THROUGH macOS `ps`, AND LETS IT GO.
 *
 * Plan l1RSxzw-j4P7, block b-8, row 2: the server must start on macOS. Until wave 13p round 18 it read
 * /proc/<pid>/stat for its own start time and process group before it opened the database, through
 * src/config/session-process.mjs, so on a Mac it ended at its start. Now every process reading goes through the
 * process reader for the platform (src/config/process-reader.mjs), which on macOS asks `ps`.
 *
 * WHAT THIS PROVES, ON LINUX. The real server is started with tests/fixtures/the-platform-reads-darwin.mjs, so
 * `process.platform` reads 'darwin' in it, and with a `ps` and an `lsof` first on its PATH that answer about this
 * machine's real processes in the macOS formats (tests/fixtures/a-ps-and-lsof-that-answer-as-macos-does.mjs).
 *   1. It starts and answers its health check for its own database.
 *   2. The lock names it, its group, and the start time macOS `ps` gives, to the whole second; and the server
 *      asked `ps` for its own process in the macOS reader's columns.
 *   3. A second server for the same database reads the first one's process through `ps` and is refused by the
 *      lock with its own exit code.
 *   4. Asked to stop, it ends and deletes its lock.
 *
 * WHAT IT DOES NOT PROVE: that macOS answers in these formats, or that nothing else in the server needs Linux on
 * a real Mac. tests/darwin-probe.test.ts lists what only a real Mac can prove.
 *
 * Every server is started in a process group of its own, recorded the moment it is known, and `afterAll` stops
 * each group still running. The world is a folder this test makes under the temporary folder.
 *
 * MUTATION, in the commit message: make `theProcessReaderFor` in src/config/process-reader.mjs give the Linux
 * reader on darwin too. The server still starts (this machine has /proc), but the lock's start time is then the
 * Linux one, not whole seconds from `ps`, and no `ps` call is made, so case 2 goes red.
 */

import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_BUILT_PAGE, missingWebBuild } from '../src/config/the-built-page.mjs'
import { THE_SERVICE_LOCK_REFUSAL_EXIT_CODE, readTheServiceLock, type ServiceLock } from '../src/config/the-service-lock.mjs'
import { aProcessFromAPsLine, PS_COLUMNS } from '../src/config/process-reader.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { WORLD_HEADER, parseWorldHeader } from '../src/config/world-header.mjs'
import { TEST_DATABASE_PREFIX, commandThatStopsWithItsOwner, devStackEnvironment } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_SERVER = join(REPO, 'src', 'server', 'index.ts')
const DARWIN = join(REPO, 'tests', 'fixtures', 'the-platform-reads-darwin.mjs')
const MAC_COMMANDS = join(REPO, 'tests', 'fixtures', 'a-ps-and-lsof-that-answer-as-macos-does.mjs')

/** Every process group this file started, so `afterAll` can stop each one. */
const groups = new Set<number>()
let dir = ''

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

/** Is this group still there? Signal 0 asks without signalling. */
function groupIsThere(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
}

interface World {
  database: string
  lockPath: string
  port: number
  log: string
  env: NodeJS.ProcessEnv
}

let world: World

/**
 * Start the server as a Mac, in its own group, which the watchdog ends if this worker dies first. `ended`
 * settles when it exits, with its code and output.
 */
function aServerOnAMac(port: number): { pid: number; ended: Promise<{ code: number | null; out: string }>; out: () => string } {
  const watched = commandThatStopsWithItsOwner(process.execPath, ['--import', DARWIN, '--import', 'tsx', THE_SERVER])
  const child = spawn(watched.command, watched.args, {
    cwd: REPO,
    env: { ...world.env, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_API: `http://127.0.0.1:${String(port)}`, NODE_ENV: 'production' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (child.pid === undefined) throw new Error('the server was not started')
  groups.add(child.pid)
  let out = ''
  child.stdout.on('data', (chunk) => (out += String(chunk)))
  child.stderr.on('data', (chunk) => (out += String(chunk)))
  const ended = new Promise<{ code: number | null; out: string }>((done) => child.on('close', (code) => done({ code, out })))
  return { pid: child.pid, ended, out: () => out }
}

/** Does the port answer its health check for this world's database? */
async function answers(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${String(port)}/api/health`, { signal: AbortSignal.timeout(3_000) })
    const said = parseWorldHeader(res.headers.get(WORLD_HEADER))
    return said.ok && said.world.database === databaseIdentity(world.database).id
  } catch {
    return false
  }
}

function theLock(): ServiceLock {
  const read = readTheServiceLock(world.lockPath)
  if (read.state !== 'read') throw new Error(`the service lock did not read: ${JSON.stringify(read)}`)
  return read.lock
}

beforeAll(async () => {
  const missing = missingWebBuild(THE_BUILT_PAGE)
  if (missing !== null) throw new Error(`This test starts the server in production, which serves the built page. ${missing}`)
  dir = mkdtempSync(`${TEST_DATABASE_PREFIX}server-on-a-mac-`)
  const home = join(dir, 'home')
  const bin = join(dir, 'bin')
  mkdirSync(home)
  mkdirSync(bin)
  for (const command of ['ps', 'lsof']) {
    writeFileSync(join(bin, command), `#!/bin/sh\nexec "${process.execPath}" "${MAC_COMMANDS}" ${command} "$@"\n`)
    chmodSync(join(bin, command), 0o755)
  }
  const database = join(dir, 'office.db')
  const port = await aFreePort()
  const log = join(dir, 'mac-commands.log')
  writeFileSync(log, '')
  world = {
    database,
    lockPath: serviceLockPathFrom({ MOLE_OFFICE_DB: database }),
    port,
    log,
    env: {
      ...devStackEnvironment(dir, port, await aFreePort(), { database }),
      HOME: home,
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      MOLE_OFFICE_TEST_MAC_COMMANDS_LOG: log,
    },
  }
})

afterAll(async () => {
  const running = [...groups].filter((group) => groupIsThere(group))
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((group) => groupIsThere(group)) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => groupIsThere(one))) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
}, 40_000)

describe('the server on a platform that says darwin', () => {
  let first: ReturnType<typeof aServerOnAMac>

  it('starts, and answers its health check for its own database', async () => {
    first = aServerOnAMac(world.port)
    const deadline = Date.now() + 90_000
    let up = false
    while (!up && Date.now() < deadline) {
      up = await answers(world.port)
      if (!up) await sleep(300)
    }
    expect(up, first.out()).toBe(true)
  }, 120_000)

  it('took the lock with the start time macOS ps gives, after asking ps for its own process', () => {
    const lock = theLock()
    expect(lock.pid).toBe(first.pid)
    expect(lock.pgid, 'the server leads a process group of its own').toBe(first.pid)
    // WHOLE SECONDS, as `lstart` has them. A start read from /proc carries hundredths.
    expect(lock.processStartedAt).toMatch(/\.000Z$/u)
    const asked = readFileSync(world.log, 'utf8').split('\n')
    expect(asked).toContain(`ps -o ${PS_COLUMNS} -p ${String(first.pid)}`)
    // AND IT IS THE TIME THE MAC FORMAT SAYS, read back the way the reader reads it.
    const ran = spawnTheMacPs(first.pid)
    const row = aProcessFromAPsLine(ran.trimEnd())
    expect(row?.startedAt.toISOString()).toBe(lock.processStartedAt)
  })

  it('refuses a second server for the same database, reading the first through ps', async () => {
    const second = aServerOnAMac(await aFreePort())
    const { code, out } = await Promise.race([
      second.ended,
      sleep(90_000).then(() => ({ code: null, out: `${second.out()}\n[the test stopped waiting after 90 seconds]` })),
    ])
    expect(code, out).toBe(THE_SERVICE_LOCK_REFUSAL_EXIT_CODE)
    expect(out).toContain(`That server is process ${String(first.pid)}`)
    expect(theLock().pid).toBe(first.pid)
  }, 120_000)

  it('ends when asked to stop, and deletes its lock', async () => {
    process.kill(-first.pid, 'SIGTERM')
    const { code, out } = await Promise.race([
      first.ended,
      sleep(30_000).then(() => ({ code: null, out: `${first.out()}\n[the test stopped waiting after 30 seconds]` })),
    ])
    expect(code, out).not.toBeNull()
    expect(existsSync(world.lockPath), out).toBe(false)
  }, 60_000)
})

/** What this test's macOS `ps` prints for one process, asked the way the reader asks. */
function spawnTheMacPs(pid: number): string {
  return execFileSync(process.execPath, [MAC_COMMANDS, 'ps', '-o', PS_COLUMNS, '-p', String(pid)], { encoding: 'utf8' })
}
