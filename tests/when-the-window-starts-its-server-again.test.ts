// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THIS FILE PROVES.
 *
 * The standalone window starts its server again only when the server ended with no stop asked for, and only so many
 * times. src/desktop/starting-the-server-again.mjs decides both, apart from Electron, so this file asks it with no
 * window. The module is new, so every case imports it when the case runs. Each lock here is a file of this file's own,
 * read with the real lock reader. Each note is written with the server's own writer, beside that lock, and read back
 * with the real note reader. Whether a process is running is a stand-in, except in case 8.
 *   1. A lock that cannot be read cannot tell yet, with the lock reader's own reason, even beside a note that says
 *      the watched server stopped.
 *   2. A lock whose process is running, with no starter, is a running server, with the lock's token and process. A
 *      lock with a starter is not watched, because its starter stops it, even when it names the server watched.
 *   3. With nothing watched, a gone lock is not watched, and the note is not read.
 *   4. While the watched process still runs, a gone lock cannot tell yet, and the note is not read. A server that is
 *      stopped lets its lock go before it writes its note, so a note read then could be an older server's.
 *   5. Once the watched process has gone, a note of its token with a stop asked is a stop, with the stop's own words.
 *      A note of its token with no stop asked is a stop nobody asked for, with the exit code. A note of another
 *      token, no note and a note that cannot be read each say that it stopped and how is unknown, each for a reason
 *      of its own. The unreadable note's reason carries the note reader's own.
 *   6. The same five answers come when the lock is still there and names the gone process, as a SIGKILL leaves it.
 *   7. The first try waits the first wait, and each later try waits the next one. There is no try after as many tries
 *      as there are waits. A try older than the time the tries count within is dropped, and no longer counts. A try
 *      exactly that old still counts, because it is not older than that time.
 *   8. A process is running when it is this one. A child that has exited and been waited for is not running.
 *   9. When the process check cannot answer whether the lock's process runs, the watch cannot tell yet, with the
 *      error's own message, and reads no note.
 *  10. When the process check cannot answer whether the watched process runs, the watch cannot tell yet in the same
 *      way, and reads no note.
 *  11. A try reads the lock on its own: a running process is the server to find; a gone process, an absent lock and
 *      an unreadable lock all say to start; an error from the process check is an answer that says it could not
 *      tell, with the error's own words, and the try goes on to the start command.
 *
 * MUTATIONS, each proved after a control run on the commit its note names. The first six are on the commit whose
 * message is "the window starts its server again: the code"; the last four are on the commit whose message is "the
 * window says when it cannot tell whether its server runs":
 *   - `stop-is-unasked`, a note with a stop asked read as one with none: cases 5 and 6 red;
 *   - `any-token-will-do`, a note of another token trusted as the watched server's: cases 5 and 6 red;
 *   - `no-note-is-unasked`, no note read as a stop nobody asked for: cases 5 and 6 red;
 *   - `starters-watched`, a lock with a starter watched as a running server: case 2 red;
 *   - `not-waiting-for-the-end`, the note read while the watched process still runs: case 4 red;
 *   - `tries-never-forgotten`, a try older than the time the tries count within still counted: case 7 red;
 *   - `throw-from-the-lock-pid`, the catch around the lock's process check removed: case 9 red;
 *   - `throw-from-the-watched-pid`, the catch around the watched process check removed: case 10 red;
 *   - `the-try-throws`, the try's lock check letting the process check's error go: case 11 red;
 *   - `cannot-tell-is-running`, the try's lock check answering running when it could not tell: case 11 red.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { howTheServerEndedPathBeside, readHowTheServerEnded, writeHowTheServerEnded } from '../src/config/how-the-server-ended.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { TEST_DATABASE_PREFIX } from './helpers.ts'

type TheModule = typeof import('../src/desktop/starting-the-server-again.mjs')
type AnAnswer = ReturnType<TheModule['howTheWatchedServerIs']>

/** Every folder this file made, so `afterAll` can remove each one. */
const folders = new Set<string>()

afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

/** The server the window watches in these cases. Its process number is this file's own; no process is asked about it. */
const WATCHED = Object.freeze({ token: 'the-token-of-the-watched-server', pid: 424_242 })
/** Why a stop was asked, in the note of a server that was stopped. */
const A_STOP = 'the stop command asked for it'
/** The exit code of a server that ended on an uncaught error. */
const AN_UNCAUGHT_ERRORS_CODE = 1

/** A folder of this file's own, and the service lock path in it. Nothing is written there yet. */
function aLockPath(name: string): string {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}starting-again-${name}-`)
  folders.add(dir)
  return serviceLockPathFrom({ MOLE_OFFICE_DB: join(dir, 'office.db') })
}

/** Write a lock as a server takes one, and read it back with the real reader. */
function aLock(lockPath: string, server: { token: string; pid: number }, starter?: { pid: number; pgid: number; processStartedAt: string }) {
  const database = lockPath.slice(0, -'.service.json'.length)
  writeFileSync(
    lockPath,
    JSON.stringify({
      about: 'A service lock this test wrote.',
      token: server.token,
      pid: server.pid,
      pgid: server.pid,
      port: 1,
      processStartedAt: '2026-11-09 12:00:00',
      database,
      databaseIdentity: { id: 'unknown', how: 'this test wrote no database' },
      checkout: dirname(lockPath),
      takenAt: new Date().toISOString(),
      ...(starter === undefined ? {} : { starter }),
    }),
  )
  const lock = readTheServiceLock(lockPath)
  if (lock.state !== 'read') throw new Error(`The lock this test wrote did not read back: ${JSON.stringify(lock)}`)
  return lock
}

/** A note written with the server's own writer, which must say it was written. */
function aNote(lockPath: string, ending: { token: string; pid: number; stopAskedFor: string | null; exitCode: number }): void {
  const wrote = writeHowTheServerEnded(lockPath, ending)
  expect(wrote.written, wrote.said).toBe(true)
}

/** The real note reader on this lock's path, counting how often it is asked. */
function aNoteReader(lockPath: string): { read: () => ReturnType<typeof readHowTheServerEnded>; times: () => number } {
  let times = 0
  return {
    read: () => {
      times += 1
      return readHowTheServerEnded(lockPath)
    },
    times: () => times,
  }
}

/**
 * THE FIVE ENDINGS OF THE WATCHED SERVER, once its process has gone: a note of its token with a stop asked and with
 * none, a note of another token, no note, and a note that cannot be read. `ask` asks the module, with the lock as the
 * case left it. The note reader's own reason for the last note comes back with the answers.
 */
function theFiveEndings(lockPath: string, ask: () => AnAnswer) {
  aNote(lockPath, { ...WATCHED, stopAskedFor: A_STOP, exitCode: 0 })
  const stopped = ask()
  aNote(lockPath, { ...WATCHED, stopAskedFor: null, exitCode: AN_UNCAUGHT_ERRORS_CODE })
  const unasked = ask()
  aNote(lockPath, { token: 'the-token-of-another-server', pid: WATCHED.pid, stopAskedFor: null, exitCode: AN_UNCAUGHT_ERRORS_CODE })
  const another = ask()
  rmSync(howTheServerEndedPathBeside(lockPath))
  const none = ask()
  writeFileSync(howTheServerEndedPathBeside(lockPath), 'not a note')
  const theReaders = readHowTheServerEnded(lockPath)
  if (theReaders.state !== 'unreadable') throw new Error(`The note this test spoiled was read as ${theReaders.state}.`)
  const unreadable = ask()
  return { stopped, unasked, another, none, unreadable, theReadersWhy: theReaders.why }
}

/** What the five endings must be answered. */
function expectTheFiveAnswers(answers: ReturnType<typeof theFiveEndings>): void {
  expect(answers.stopped).toEqual({ is: 'stopped', because: A_STOP })
  expect(answers.unasked).toEqual({ is: 'stopped unasked', exitCode: AN_UNCAUGHT_ERRORS_CODE })
  const unknown = { is: 'stopped, how unknown', why: expect.any(String) }
  expect(answers.another).toEqual(unknown)
  expect(answers.none).toEqual(unknown)
  expect(answers.unreadable).toEqual(unknown)
  const whys = [answers.another, answers.none, answers.unreadable].map((answer) => ('why' in answer ? answer.why : ''))
  expect(new Set(whys).size, `the three reasons are not three: ${JSON.stringify(whys)}`).toBe(3)
  expect(whys[2]).toContain(answers.theReadersWhy)
}

describe('when the window starts its server again', () => {
  it("cannot tell yet while the lock cannot be read, and gives the lock reader's own reason", async () => {
    const { howTheWatchedServerIs } = await import('../src/desktop/starting-the-server-again.mjs')
    const lockPath = aLockPath('unreadable-lock')
    writeFileSync(lockPath, 'not a lock')
    const lock = readTheServiceLock(lockPath)
    if (lock.state !== 'unreadable') throw new Error(`The lock this test spoiled was read as ${lock.state}.`)
    // A note beside it says the watched server stopped with none asked, which would be read next.
    aNote(lockPath, { ...WATCHED, stopAskedFor: null, exitCode: AN_UNCAUGHT_ERRORS_CODE })
    const note = aNoteReader(lockPath)
    expect(howTheWatchedServerIs({ watched: { ...WATCHED }, lock, isRunning: () => false, readTheNote: note.read })).toEqual({
      is: 'cannot tell yet',
      why: lock.why,
    })
    expect(note.times()).toBe(0)
  })

  it('watches a running server whose lock has no starter, and does not watch one that has a starter', async () => {
    const { howTheWatchedServerIs } = await import('../src/desktop/starting-the-server-again.mjs')
    const lockPath = aLockPath('running')
    const isRunning = (pid: number) => pid === WATCHED.pid
    const note = aNoteReader(lockPath)
    const unstarted = aLock(lockPath, WATCHED)
    expect(howTheWatchedServerIs({ watched: null, lock: unstarted, isRunning, readTheNote: note.read })).toEqual({ is: 'running', ...WATCHED })
    // A new server under the lock is the one watched from now on, whatever server was watched before.
    expect(howTheWatchedServerIs({ watched: { token: 'the-token-of-an-older-server', pid: 1 }, lock: unstarted, isRunning, readTheNote: note.read })).toEqual({
      is: 'running',
      ...WATCHED,
    })
    // A lock with a starter: the process that started the server stops it, so the window leaves it alone.
    const started = aLock(lockPath, WATCHED, { pid: 434_343, pgid: 434_343, processStartedAt: '2026-11-09 11:59:00' })
    for (const watched of [null, { ...WATCHED }]) {
      expect(howTheWatchedServerIs({ watched, lock: started, isRunning, readTheNote: note.read })).toEqual({ is: 'not watched', why: expect.any(String) })
    }
    expect(note.times()).toBe(0)
  })

  it('watches nothing when nothing was watched and the lock is gone, and reads no note', async () => {
    const { howTheWatchedServerIs } = await import('../src/desktop/starting-the-server-again.mjs')
    const lockPath = aLockPath('nothing-watched')
    aNote(lockPath, { ...WATCHED, stopAskedFor: null, exitCode: AN_UNCAUGHT_ERRORS_CODE })
    const note = aNoteReader(lockPath)
    const lock = readTheServiceLock(lockPath)
    expect(lock.state).toBe('absent')
    expect(howTheWatchedServerIs({ watched: null, lock, isRunning: () => false, readTheNote: note.read })).toEqual({ is: 'not watched', why: expect.any(String) })
    expect(note.times()).toBe(0)
  })

  it('cannot tell yet while the watched process still runs after its lock has gone, and reads no note', async () => {
    const { howTheWatchedServerIs } = await import('../src/desktop/starting-the-server-again.mjs')
    const lockPath = aLockPath('still-ending')
    // An older server's note, which a read now would take for the watched server's.
    aNote(lockPath, { token: 'the-token-of-an-older-server', pid: 1, stopAskedFor: null, exitCode: AN_UNCAUGHT_ERRORS_CODE })
    const note = aNoteReader(lockPath)
    const isRunning = (pid: number) => pid === WATCHED.pid
    const gone = readTheServiceLock(lockPath)
    expect(gone.state).toBe('absent')
    expect(howTheWatchedServerIs({ watched: { ...WATCHED }, lock: gone, isRunning, readTheNote: note.read })).toEqual({
      is: 'cannot tell yet',
      why: expect.any(String),
    })
    // A lock naming a process that has gone, while the watched one still runs, is no answer either.
    const stale = aLock(lockPath, { token: 'the-token-of-an-older-server', pid: 1 })
    expect(howTheWatchedServerIs({ watched: { ...WATCHED }, lock: stale, isRunning, readTheNote: note.read })).toEqual({
      is: 'cannot tell yet',
      why: expect.any(String),
    })
    expect(note.times()).toBe(0)
  })

  it('once the watched process has gone and its lock with it, trusts only a note of its own token', async () => {
    const { howTheWatchedServerIs } = await import('../src/desktop/starting-the-server-again.mjs')
    const lockPath = aLockPath('gone')
    expectTheFiveAnswers(
      theFiveEndings(lockPath, () => {
        const lock = readTheServiceLock(lockPath)
        expect(lock.state).toBe('absent')
        return howTheWatchedServerIs({ watched: { ...WATCHED }, lock, isRunning: () => false, readTheNote: () => readHowTheServerEnded(lockPath) })
      }),
    )
  })

  it('answers the same when the lock is still there and names the gone process, as a SIGKILL leaves it', async () => {
    const { howTheWatchedServerIs } = await import('../src/desktop/starting-the-server-again.mjs')
    const lockPath = aLockPath('killed')
    const lock = aLock(lockPath, WATCHED)
    expectTheFiveAnswers(
      theFiveEndings(lockPath, () => howTheWatchedServerIs({ watched: { ...WATCHED }, lock, isRunning: () => false, readTheNote: () => readHowTheServerEnded(lockPath) })),
    )
  })

  it('waits each wait in turn, makes no try after the last, and forgets a try older than the time the tries count within', async () => {
    const { START_AGAIN_AFTER_MS, TRIES_COUNT_WITHIN_MS, theNextTry } = await import('../src/desktop/starting-the-server-again.mjs')
    const now = Date.parse('2026-11-09T12:00:00Z')
    const attempts = START_AGAIN_AFTER_MS.length
    // Tries a second apart, the last a second ago.
    const recent = (count: number) => Array.from({ length: count }, (_, at) => now - (count - at) * 1_000)
    START_AGAIN_AFTER_MS.forEach((afterMs, made) => {
      expect(theNextTry(recent(made), now), `after ${String(made)} tries`).toEqual({ afterMs, attempt: made + 1, attempts, triedAt: recent(made) })
    })
    expect(theNextTry(recent(attempts), now)).toBeNull()
    // The oldest try is older than the time the tries count within, so it is dropped and the last wait comes again.
    const kept = recent(attempts - 1)
    expect(theNextTry([now - TRIES_COUNT_WITHIN_MS - 1, ...kept], now)).toEqual({
      afterMs: START_AGAIN_AFTER_MS[attempts - 1],
      attempt: attempts,
      attempts,
      triedAt: kept,
    })
    // A try exactly that old is not older than it, so it still counts.
    expect(theNextTry([now - TRIES_COUNT_WITHIN_MS, ...kept], now)).toBeNull()
  })

  it('says this process is running, and a child that has exited and been waited for is not', async () => {
    const { theProcessIsRunning } = await import('../src/desktop/starting-the-server-again.mjs')
    expect(theProcessIsRunning(process.pid)).toBe(true)
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
    const pid = child.pid
    if (pid === undefined) throw new Error('The child was not started.')
    // Node reaps a child before it says the child exited, so its number names no process after this.
    await new Promise<void>((done) => child.once('exit', () => done()))
    expect(theProcessIsRunning(pid)).toBe(false)
  })

  it("cannot tell yet when it cannot ask whether the lock's process runs, and gives the error's own words", async () => {
    const { howTheWatchedServerIs } = await import('../src/desktop/starting-the-server-again.mjs')
    // The process check cannot ask the system, so its own message is the only account of why the watch cannot tell.
    const refused = Object.assign(new Error('the process check was refused with EINVAL'), { code: 'EINVAL' })
    const lockPath = aLockPath('cannot-ask-the-lock')
    const lock = aLock(lockPath, WATCHED)
    const readTheNote = () => {
      throw new Error('the note must not be read when the process check cannot answer')
    }
    // The lock names the process, whether or not a server is watched yet, so the watch asks about it first.
    for (const watched of [null, { ...WATCHED }]) {
      expect(
        howTheWatchedServerIs({
          watched,
          lock,
          isRunning: () => {
            throw refused
          },
          readTheNote,
        }),
      ).toEqual({ is: 'cannot tell yet', why: expect.stringContaining(refused.message) })
    }
  })

  it("cannot tell yet when it cannot ask whether the watched process runs, and gives the error's own words", async () => {
    const { howTheWatchedServerIs } = await import('../src/desktop/starting-the-server-again.mjs')
    // The lock is gone, so the only process left to ask about is the watched server, and its check cannot answer.
    const refused = Object.assign(new Error('the watched process check was refused with EINVAL'), { code: 'EINVAL' })
    const lockPath = aLockPath('cannot-ask-the-watched')
    const lock = readTheServiceLock(lockPath)
    expect(lock.state).toBe('absent')
    const readTheNote = () => {
      throw new Error('the note must not be read when the process check cannot answer')
    }
    expect(
      howTheWatchedServerIs({
        watched: { ...WATCHED },
        lock,
        isRunning: (pid: number) => {
          if (pid === WATCHED.pid) throw refused
          return false
        },
        readTheNote,
      }),
    ).toEqual({ is: 'cannot tell yet', why: expect.stringContaining(refused.message) })
  })

  it('a try reads a running server from its lock, and an error from the process check is an answer, not a throw', async () => {
    const { whatTheTryFindsInTheLock } = await import('../src/desktop/starting-the-server-again.mjs')
    const lockPath = aLockPath('the-trys-lock')
    const lock = aLock(lockPath, WATCHED)
    // A running process is the server the try finds, with the process number its lock names.
    expect(whatTheTryFindsInTheLock({ lock, isRunning: (pid: number) => pid === WATCHED.pid })).toEqual({
      is: 'running',
      pid: WATCHED.pid,
    })
    // A process that has gone sends the try on to the start command.
    expect(whatTheTryFindsInTheLock({ lock, isRunning: () => false })).toEqual({ is: 'start' })
    // An absent or unreadable lock says to start without asking about a process at all.
    const askNoProcess = () => {
      throw new Error('the process check must not be asked about a lock that names no process')
    }
    const absentPath = aLockPath('the-trys-lock-absent')
    const absent = readTheServiceLock(absentPath)
    expect(absent.state).toBe('absent')
    expect(whatTheTryFindsInTheLock({ lock: absent, isRunning: askNoProcess })).toEqual({ is: 'start' })
    writeFileSync(absentPath, 'not a lock')
    const unreadable = readTheServiceLock(absentPath)
    expect(unreadable.state).toBe('unreadable')
    expect(whatTheTryFindsInTheLock({ lock: unreadable, isRunning: askNoProcess })).toEqual({ is: 'start' })
    // An error from the process check is an answer, not a throw, and it says the try goes on to the start command.
    const refused = Object.assign(new Error('the try’s process check was refused with EINVAL'), { code: 'EINVAL' })
    const answer = whatTheTryFindsInTheLock({
      lock,
      isRunning: () => {
        throw refused
      },
    })
    if (answer.is !== 'cannot tell') throw new Error(`The error from the process check was answered as ${answer.is}.`)
    expect(answer.why).toContain(refused.message)
    expect(answer.why).toMatch(/start command/i)
  })
})
