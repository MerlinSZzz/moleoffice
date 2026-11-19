// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THIS FILE PROVES.
 *
 * A server writes one note beside its service lock on every way out that runs code, so that a reader that later finds
 * only the note can tell a server that was stopped from one that ended on its own. The note's module is new, so every
 * case imports it when the case runs.
 *   1. A lock's note path is beside the lock and named after the database file, and a path that is not a service
 *      lock's is refused. A whole note reads back as it was written, for a stop that was asked and for none, and a
 *      lock with no note beside it reads as absent. Text that is not JSON, a note with a field missing and a note
 *      with a field of the wrong type each read as unreadable rather than as a note.
 *   2. A real office started with `mole-office start` and stopped with `mole-office stop` leaves a readable note: the
 *      lock's token and process, a non-empty reason the stop was asked and a numeric exit code.
 *   3. A real office ended by an uncaught error leaves a readable note with no stop asked and with its lock gone. The
 *      error is thrown by a preload of this file's own after SIGUSR2 reaches the lock's process only, and the
 *      service's log carries the preload's own message, so the case shows how the server ended.
 *   4. A stop asked of an installed office while it waits for its update is written as a stop. The office runs from a
 *      bundle, as `mole-office start` runs one, and a note written past every door makes its next start wait for the
 *      press. The note of the stop that ended it keeps the lock's token and process, a reason holding SIGTERM, and
 *      exit code 0.
 *
 * A SIGKILL runs no code and writes no note. Then the note names an older server or is absent, and a reader must take
 * neither for either answer.
 *
 * MUTATIONS, proved after a control run on the commit whose message is "the server writes how it ended: the code":
 *   - `no-note`, the write removed from the exit handler: cases 2 and 3 red;
 *   - `stop-not-said`, the shutdown not recording why a stop was asked: case 2 red;
 *   - `every-end-a-stop`, the exit handler writing a stop for every ending: case 3 red;
 *   - `half-a-note-read`, the reader no longer checking the process number: case 1 red;
 *   - `not-beside`, the note named `.service.json.ended` instead: case 1 red.
 *
 * MUTATIONS of case 4, proved after a control run on the code commit that follows this file's criteria commit:
 *   - `update-stop-unsaid`, the update's stop not telling the server why: case 4 red;
 *   - `index-not-told`, the server not keeping the reason the update told it: case 4 red.
 */

import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, describe, expect, it } from 'vitest'
import { THE_BUILT_PAGE, missingWebBuild } from '../src/config/the-built-page.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { serviceLockPathFrom, serviceLogPathFrom } from '../src/config/settings.mjs'
import { THE_UPDATE_WAITS } from '../src/config/world-address.mjs'
import { TEST_DATABASE_PREFIX, devStackEnvironment } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')
const THE_PRELOAD_MESSAGE = 'the preload this test wrote ended the server on an uncaught error'
/** The note written into an office's file past every door, which the update must give its first revision. */
const PAST_THE_DOOR = 'written-past-the-door'

/** Every process group this file found in a service lock, so `afterAll` can stop each one. */
const groups = new Set<number>()
/** Every folder this file made, so `afterAll` can remove each one. */
const folders = new Set<string>()
/** The folder holding the bundle the installed office runs from, made once. */
let bundleFolder = ''

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

/** Run the `mole-office` command in this world, and record the group the lock names when there is one. */
function theCommand(what: string, env: NodeJS.ProcessEnv, database: string): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    // THE OFFICE RUNS NO AGENT HERE, so its message worker is off and cannot write a rules file into the checkout.
    const child = spawn(process.execPath, [THE_COMMAND, what], { cwd: REPO, env: { ...env, MOLE_OFFICE_MESSAGE_WORKER: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (out += String(chunk)))
    child.on('close', (code) => {
      const lock = readTheServiceLock(serviceLockPathFrom({ MOLE_OFFICE_DB: database }))
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      done({ code, out })
    })
  })
}

interface AWorld {
  dir: string
  database: string
  env: NodeJS.ProcessEnv
  /** The facts this file read from the lock before the server ended. */
  lock: { token: string; pid: number; pgid: number }
}

/** The office needs the built page, because a real start serves it. */
function requireTheBuiltPage(): void {
  const missing = missingWebBuild(THE_BUILT_PAGE)
  if (missing !== null) throw new Error(`This test starts the office in production, which serves the built page. ${missing}`)
}

/** Wait, bounded, until no process runs at the number. */
async function untilTheProcessIsGone(pid: number, what: string): Promise<void> {
  const deadline = Date.now() + 30_000
  while (theProcessAt(pid).here) {
    if (Date.now() > deadline) throw new Error(`Process ${String(pid)} was still running 30 seconds ${what}.`)
    await sleep(100)
  }
}

/** An office of this file's own, started as the service, and what its lock said while it ran. */
async function startTheOffice(name: string, addToEnvironment: (dir: string) => NodeJS.ProcessEnv = () => ({})): Promise<AWorld> {
  requireTheBuiltPage()
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}how-it-ended-${name}-`)
  folders.add(dir)
  const home = join(dir, 'home')
  mkdirSync(home)
  const database = join(dir, 'office.db')
  const port = await aFreePort()
  const env: NodeJS.ProcessEnv = {
    ...devStackEnvironment(dir, port, await aFreePort(), { database }),
    HOME: home,
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
    ...addToEnvironment(dir),
  }
  const started = await theCommand('start', env, database)
  expect(started.code, started.out).toBe(0)
  const there = readTheServiceLock(serviceLockPathFrom({ MOLE_OFFICE_DB: database }))
  if (there.state !== 'read') throw new Error(`the service did not take its lock: ${JSON.stringify(there)}\nThe start said:\n${started.out}`)
  groups.add(there.lock.pgid)
  return {
    dir,
    database,
    env,
    lock: { token: there.lock.token, pid: there.lock.pid, pgid: there.lock.pgid },
  }
}

/**
 * THE BUNDLE A CASE RUNS, made in this file's own folder as tests/the-window-starts-the-bundled-office.test.ts
 * makes it. The Node an installation carries is a copy of this test's own, a file of the bundle.
 */
function theBundle(): string {
  if (bundleFolder !== '') return join(bundleFolder, 'bundle')
  bundleFolder = mkdtempSync(`${TEST_DATABASE_PREFIX}how-it-ended-bundle-`)
  folders.add(bundleFolder)
  const bundle = join(bundleFolder, 'bundle')
  const made = spawnSync(process.execPath, [join(REPO, 'scripts', 'bundle.mjs'), '--out', bundle], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 300_000,
  })
  expect(made.status, `${made.stdout}\n${made.stderr}`).toBe(0)
  const shipped = join(bundle, 'runtime', 'bin', 'node')
  mkdirSync(join(bundle, 'runtime', 'bin'), { recursive: true })
  copyFileSync(process.execPath, shipped)
  chmodSync(shipped, 0o755)
  return bundle
}

/** A home and a port of a case's own, in the bundle's folder, and the environment its office runs in. */
async function aHomeOfItsOwn(name: string): Promise<{ home: string; port: number; env: Record<string, string> }> {
  const home = join(bundleFolder, name)
  mkdirSync(home)
  const port = await aFreePort()
  // THE DISPLAY'S SETTINGS STAY, AND NONE OF THIS SHELL'S MOLE OFFICE SETTINGS DO.
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key.startsWith('MOLE_') || key.startsWith('VITEST') || key === 'XDG_CONFIG_HOME') continue
    env[key] = value
  }
  // THE TERMINAL HOLDER STAYS OFF, so no holder outlives the office, and no window opens here.
  Object.assign(env, {
    HOME: home,
    MOLE_OFFICE_PORT: String(port),
    MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
    MOLE_OFFICE_TERMINAL_HOLDER: 'off',
  })
  return { home, port, env }
}

/** The database an installed office keeps in the per-user data folder under this home. */
const theDatabaseIn = (home: string): string => join(home, '.config', 'mole-office', 'data', 'mole-office.db')

/** The service's log, read again while it may still be written, until it carries the words or the wait ends. */
async function theLogThatNames(database: string, words: string): Promise<string> {
  const logPath = serviceLogPathFrom({ MOLE_OFFICE_DB: database })
  const deadline = Date.now() + 15_000
  for (;;) {
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
    if (log.includes(words) || Date.now() > deadline) return log
    await sleep(100)
  }
}

afterAll(async () => {
  const running = [...groups].filter((group) => theProcessAt(group).here)
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((group) => theProcessAt(group).here) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => theProcessAt(one).here)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}, 40_000)

describe('the server writes how it ended', () => {
  it('1: names the note beside the lock, refuses a path that is not a lock, and reads only a whole note', async () => {
    const { howTheServerEndedPathBeside, readHowTheServerEnded, writeHowTheServerEnded } = await import(
      '../src/config/how-the-server-ended.mjs'
    )
    const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}how-it-ended-shape-`)
    folders.add(dir)
    const lockPath = join(dir, 'office.db.service.json')
    const notePath = join(dir, 'office.db.ended.json')

    // THE NOTE IS BESIDE THE LOCK, NAMED AFTER THE DATABASE FILE AS THE LOCK IS.
    expect(howTheServerEndedPathBeside(lockPath)).toBe(notePath)
    const notALock = join(dir, 'office.db.ended.json')
    let refused: Error | null = null
    try {
      howTheServerEndedPathBeside(notALock)
    } catch (err) {
      refused = err instanceof Error ? err : new Error(String(err))
    }
    expect(refused, 'a path that is not a service lock was not refused').not.toBeNull()
    expect(refused?.message, 'the refusal does not name the path').toContain(notALock)

    // A STOP ASKED FOR READS BACK AS IT WAS WRITTEN.
    const wroteAStop = writeHowTheServerEnded(
      lockPath,
      { token: 'a-made-up-token', pid: 4242, stopAskedFor: 'the person asked the office to stop', exitCode: 0 },
      () => new Date(2026, 0, 2, 3, 4, 5),
    )
    expect(wroteAStop.written, wroteAStop.said).toBe(true)
    expect(wroteAStop.said, 'the sentence does not name the note').toContain(notePath)
    const readAsStop = readHowTheServerEnded(lockPath)
    if (readAsStop.state !== 'read') throw new Error(`the note a stop wrote did not read: ${JSON.stringify(readAsStop)}`)
    expect(readAsStop.note).toEqual({
      token: 'a-made-up-token',
      pid: 4242,
      stopAskedFor: 'the person asked the office to stop',
      exitCode: 0,
      endedAt: '2026-01-02 03:04:05',
    })

    // NO STOP ASKED FOR READS BACK TOO.
    const wroteNoStop = writeHowTheServerEnded(
      lockPath,
      { token: 'another-made-up-token', pid: 4343, stopAskedFor: null, exitCode: 1 },
      () => new Date(2026, 0, 2, 3, 4, 6),
    )
    expect(wroteNoStop.written, wroteNoStop.said).toBe(true)
    const readAsNoStop = readHowTheServerEnded(lockPath)
    if (readAsNoStop.state !== 'read') throw new Error(`the note no stop wrote did not read: ${JSON.stringify(readAsNoStop)}`)
    expect(readAsNoStop.note).toEqual({
      token: 'another-made-up-token',
      pid: 4343,
      stopAskedFor: null,
      exitCode: 1,
      endedAt: '2026-01-02 03:04:06',
    })

    // A LOCK WITH NO NOTE BESIDE IT IS ABSENT, NOT UNREADABLE.
    const untouchedLock = join(dir, 'quiet.db.service.json')
    expect(readHowTheServerEnded(untouchedLock)).toEqual({ state: 'absent' })

    // ANYTHING THAT IS NOT A WHOLE NOTE IS UNREADABLE, NEVER A NOTE.
    const unreadable = (written: string, why: string): void => {
      writeFileSync(notePath, written)
      const read = readHowTheServerEnded(lockPath)
      expect(read.state, `${why}: ${JSON.stringify(read)}`).toBe('unreadable')
    }
    unreadable('this is not a note written as JSON', 'text that is not JSON')
    unreadable(
      JSON.stringify({ token: 'a-made-up-token', pid: 4242, stopAskedFor: null, exitCode: 0 }),
      'a note with no ending time',
    )
    unreadable(
      JSON.stringify({ token: 'a-made-up-token', pid: 0, stopAskedFor: null, exitCode: 0, endedAt: '2026-01-02 03:04:05' }),
      'a note whose process is not a positive whole number',
    )
    unreadable(
      JSON.stringify({ token: 'a-made-up-token', pid: 4242, stopAskedFor: 7, exitCode: 0, endedAt: '2026-01-02 03:04:05' }),
      'a note whose stop reason is not a string or null',
    )
    const unreadableRead = readHowTheServerEnded(lockPath)
    if (unreadableRead.state === 'unreadable') expect(unreadableRead.why, 'an unreadable note says no reason').not.toBe('')
  }, 60_000)

  it('2: a stop is written as a stop, under the lock\'s token and process', async () => {
    const { readHowTheServerEnded } = await import('../src/config/how-the-server-ended.mjs')
    const world = await startTheOffice('stop')
    const stopped = await theCommand('stop', world.env, world.database)
    expect(stopped.code, stopped.out).toBe(0)
    await untilTheProcessIsGone(world.lock.pid, 'after the stop command ended the server')

    const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: world.database })
    const read = readHowTheServerEnded(lockPath)
    if (read.state !== 'read') throw new Error(`the note a stop wrote did not read: ${JSON.stringify(read)}`)
    expect(read.note.token, 'the note names another server\'s token').toBe(world.lock.token)
    expect(read.note.pid, 'the note names another process').toBe(world.lock.pid)
    expect(read.note.stopAskedFor, 'the note does not say a stop was asked').toEqual(expect.any(String))
    expect(read.note.stopAskedFor, 'the note says a stop was asked for nothing').not.toBe('')
    expect(typeof read.note.exitCode, 'the note carries no numeric exit code').toBe('number')
  }, 240_000)

  it('3: a crash is written with no stop asked, and its own error is in the service log', async () => {
    const { readHowTheServerEnded } = await import('../src/config/how-the-server-ended.mjs')
    const world = await startTheOffice('crash', (dir) => {
      const preload = join(dir, 'end-on-an-uncaught-error.mjs')
      writeFileSync(
        preload,
        `process.on('SIGUSR2', () => {\n  setImmediate(() => {\n    throw new Error(${JSON.stringify(THE_PRELOAD_MESSAGE)})\n  })\n})\n`,
      )
      return { NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --import=${pathToFileURL(preload).href}`.trim() }
    })

    // THE SIGNAL REACHES THE LOCK'S PROCESS ONLY, and the preload turns it into an uncaught error.
    process.kill(world.lock.pid, 'SIGUSR2')
    await untilTheProcessIsGone(world.lock.pid, 'after the preload ended the server on an uncaught error')

    const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: world.database })
    expect(existsSync(lockPath), 'the lock of a server that ended on an uncaught error was left behind').toBe(false)
    const read = readHowTheServerEnded(lockPath)
    if (read.state !== 'read') throw new Error(`the note a crash wrote did not read: ${JSON.stringify(read)}`)
    expect(read.note.token, 'the note names another server\'s token').toBe(world.lock.token)
    expect(read.note.pid, 'the note names another process').toBe(world.lock.pid)
    expect(read.note.stopAskedFor, 'the note of an uncaught error says a stop was asked').toBeNull()

    const log = await theLogThatNames(world.database, THE_PRELOAD_MESSAGE)
    expect(log, 'the service log does not carry the error the preload threw').toContain(THE_PRELOAD_MESSAGE)
  }, 240_000)

  it('4: a stop asked while an installed office waits for its update is written as a stop', async () => {
    const { readHowTheServerEnded } = await import('../src/config/how-the-server-ended.mjs')
    const bundle = theBundle()
    const { home, port, env } = await aHomeOfItsOwn('waiting')
    const database = theDatabaseIn(home)
    const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: database })
    const command = (what: 'start' | 'stop', more: Record<string, string> = {}) =>
      spawnSync(join(bundle, 'runtime', 'bin', 'node'), [join(bundle, 'mole-office.mjs'), what], {
        env: { ...env, ...more },
        encoding: 'utf8',
        timeout: 120_000,
      })

    // THE OFFICE AN INSTALLER MAKES, with its owner named as an installer names them, and then stops.
    const made = command('start', { MOLE_OFFICE_OWNER_NAME: 'A made-up owner' })
    const first = readTheServiceLock(lockPath)
    if (first.state === 'read') groups.add(first.lock.pgid)
    expect(made.status, `${made.stdout}\n${made.stderr}`).toBe(0)
    const madeStop = command('stop')
    expect(madeStop.status, `${madeStop.stdout}\n${madeStop.stderr}`).toBe(0)

    // THE NOTE PAST EVERY DOOR: the update would write its first revision to it, so the start check offers the update.
    const file = new Database(database, { fileMustExist: true })
    try {
      const owner = file.prepare('SELECT id FROM people WHERE office_owner IS NOT NULL').get() as { id: string }
      const workspace = file.prepare('SELECT id FROM workspaces ORDER BY id LIMIT 1').get() as { id: string }
      file
        .prepare(
          'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, origin, kind, title, summary, data) ' +
            "VALUES (?, ?, ?, '2026-10-10 09:00:00', '2026-10-10 09:00:00', 'authored', 'note', ?, NULL, ?)",
        )
        .run(PAST_THE_DOOR, workspace.id, owner.id, 'a note nothing filed', '{"body":"made-up test data"}')
    } finally {
      file.close()
    }

    // THE CONTROL: the office waits for its owner's press, and its health says so.
    const waiting = command('start')
    const lock = readTheServiceLock(lockPath)
    if (lock.state !== 'read') {
      throw new Error(`the office that waits took no lock: ${JSON.stringify(lock)}\nThe start said:\n${waiting.stdout}\n${waiting.stderr}`)
    }
    groups.add(lock.lock.pgid)
    expect(waiting.status, `${waiting.stdout}\n${waiting.stderr}`).toBe(0)
    console.log(`the start of an office that waits answered:\n${waiting.stdout}${waiting.stderr}`)
    const health = await fetch(`http://127.0.0.1:${String(port)}/api/health`)
    expect(health.status, 'the office that waits does not answer 503').toBe(503)
    expect(await health.json(), 'the office does not wait for its update').toMatchObject({ [THE_UPDATE_WAITS]: true })

    // THE STOP ASKED WHILE IT WAITS IS WRITTEN AS A STOP, under the lock's token and process.
    const kept = { token: lock.lock.token, pid: lock.lock.pid }
    const stopped = command('stop')
    expect(stopped.status, `${stopped.stdout}\n${stopped.stderr}`).toBe(0)
    await untilTheProcessIsGone(kept.pid, 'after the stop command ended the waiting office')

    const read = readHowTheServerEnded(lockPath)
    if (read.state !== 'read') throw new Error(`the note a stop of a waiting office wrote did not read: ${JSON.stringify(read)}`)
    expect(read.note.token, 'the note names another server\'s token').toBe(kept.token)
    expect(read.note.pid, 'the note names another process').toBe(kept.pid)
    expect(read.note.stopAskedFor, 'the note does not say a stop was asked while the update waits').toEqual(expect.any(String))
    expect(read.note.stopAskedFor, 'the note does not say the stop was a SIGTERM').toContain('SIGTERM')
    expect(read.note.exitCode, 'the note of a stop that exited cleanly carries another exit code').toBe(0)
  }, 480_000)
})
