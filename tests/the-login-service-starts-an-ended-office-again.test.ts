// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LOGIN SERVICE STARTS AN ENDED OFFICE AGAIN, BY THE WINDOW'S RULE.
 *
 * On Linux the office starts at login through a systemd user unit, and that unit runs `mole-office watch`. Watch starts
 * the office once, then watches its server as the window does, and starts it again after a server that ended with no
 * stop asked for. It never starts a server somebody stopped. On a signal from systemd it stops the office and answers
 * stop's exit code. The step and the watch are apart from systemd, so this file asks them with no user manager.
 *
 * WHAT IS CHECKED.
 *   1. The unit's words: Type=exec, ExecStart running the command with watch, KillMode=process, Restart=on-failure,
 *      RestartSec=30, the start limit, TimeoutStopSec from STOP_TIMEOUT_SECONDS, no ExecStop, no RemainAfterExit, no
 *      Type=oneshot and no TimeoutStartSec, and a stop timeout long enough for a try that runs and then the stop.
 *   2. The pure step, one case per kind of finding: what it keeps watching, when it says something, the first wait,
 *      each later wait, the tries that no longer count, the last try, and the answers that never start.
 *   3. The watch with everything handed in: a first start that fails answers its code and does nothing more; a server
 *      that ended with no stop asked for is started again after the first wait and the watch goes on; a stop asked for,
 *      no note and another server's note start nothing; SIGTERM while it only watches runs stop once; SIGTERM while a
 *      try waits cancels that try; SIGTERM while a try runs waits for it before stop; and three failed tries within the
 *      time stop the tries once, while the watch goes on watching.
 *
 * WHAT ONLY A REAL USER MANAGER SHOWS. Nothing systemd does is run here: whether the unit stays active while watch
 * runs, whether an explicit stop sends SIGTERM, whether Restart=on-failure starts the unit again after watch exits
 * with a failure, and whether a unit whose file changed while it is active keeps the old file until the next login.
 * This file stands the signals in with an EventEmitter, the clock and timers with vitest's fakes, and the process
 * check, lock and note with answers the case changes.
 *
 * MUTATIONS (each after a control run; the commit message names the runs and the logs):
 *   - restarts-an-asked-stop: a stopped server started again: case 2 red;
 *   - restarts-with-no-note: a server with no note started again: case 2 red;
 *   - no-limit: a try after the last one: cases 2 and 3 red;
 *   - stop-before-the-try-ends: stop before a running try ends: case 3 red;
 *   - the-waiting-try-is-not-cancelled: the waiting try not cancelled: case 3 red;
 *   - exec-stop-back: ExecStop written again: case 1 red, and case 1 of the press file red;
 *   - oneshot-back: Type=oneshot written again: case 1 red;
 *   - timeout-too-short: the stop timeout too short: case 1 red.
 */

import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { howTheServerEndedPathBeside, readHowTheServerEnded, writeHowTheServerEnded } from '../src/config/how-the-server-ended.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { HOLDER_START_WAIT_MS, HOLDER_STOP_WAIT_MS, START_WAIT_MS, STOP_WAIT_MS } from '../src/config/the-service-command.mjs'
import { STOP_TIMEOUT_SECONDS, theStartAtLoginUnit } from '../src/config/start-at-login.mjs'
import { quoted } from '../src/config/the-mail-tool.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { theWatchsNextStep, watchForTheLoginService } from '../src/config/the-login-watch.mjs'
import { START_AGAIN_AFTER_MS, TRIES_COUNT_WITHIN_MS, WATCH_EVERY_MS } from '../src/desktop/starting-the-server-again.mjs'
import { TEST_DATABASE_PREFIX } from './helpers.ts'

/** The office the unit is written for in case 1. */
const AN_OFFICE = Object.freeze({
  command: '/usr/local/bin/node',
  args: ['/an/install/src/config/the-service-command.mjs'],
  databasePath: '/a/folder/office.db',
  port: 4_210,
  path: '/usr/bin:/bin',
})

/** The server the watch watches in these cases. Its process number is this file's own; the check is a stand-in. */
const WATCHED = Object.freeze({ token: 'the-token-of-the-login-services-server', pid: 424_242 })
/** The exit code of a server that ended on an uncaught error. */
const AN_UNASKED_END = 37
/** The exit code of a try that could not start the server. */
const A_FAILED_TRY = 41
/** Every folder this file made, so `afterAll` can remove each one. */
const folders = new Set<string>()

afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the unit the login service writes', () => {
  it('1: runs watch as its main process, keeps what it starts, and has no ExecStop, RemainAfterExit or oneshot', () => {
    const unit = theStartAtLoginUnit(AN_OFFICE)
    const lines = unit.split('\n')
    const run = (verb: string) => [AN_OFFICE.command, ...AN_OFFICE.args, verb].map(quoted).join(' ')
    expect(lines).toContain('Type=exec')
    expect(lines).toContain(`ExecStart=${run('watch')}`)
    expect(lines).toContain('KillMode=process')
    expect(lines).toContain('Restart=on-failure')
    expect(lines).toContain('RestartSec=30')
    expect(lines).toContain('StartLimitIntervalSec=600')
    expect(lines).toContain('StartLimitBurst=3')
    expect(lines).toContain(`TimeoutStopSec=${String(STOP_TIMEOUT_SECONDS)}`)
    for (const gone of ['ExecStop=', 'RemainAfterExit=', 'TimeoutStartSec=']) {
      expect(lines.filter((line) => line.startsWith(gone)), gone).toEqual([])
    }
    expect(lines.filter((line) => line.startsWith('Type='))).toEqual(['Type=exec'])
    expect(lines.filter((line) => line.startsWith('Type=oneshot'))).toEqual([])
    // A try that runs when the stop comes, then the stop.
    expect(STOP_TIMEOUT_SECONDS * 1000).toBeGreaterThanOrEqual(HOLDER_START_WAIT_MS + START_WAIT_MS + STOP_WAIT_MS + HOLDER_STOP_WAIT_MS)
  })
})

/** What a step said, or an error when it said nothing. */
function theStepSays(step: ReturnType<typeof theWatchsNextStep>): string {
  const said = step.say
  if (said === null) throw new Error(`The step ${step.do} said nothing, and this case expects a sentence.`)
  return said
}

/** A moment every pure-step case counts from. */
const NOW = Date.parse('2026-11-11T12:00:00Z')

describe('the pure step the login service takes', () => {
  it('2: cannot tell yet keeps watching the server as before and says why', () => {
    const step = theWatchsNextStep({ found: { is: 'cannot tell yet', why: 'the service lock cannot be read' }, triedAt: [], now: NOW })
    expect(step.do).toBe('keep watching')
    if (step.do !== 'keep watching') return
    expect(step.watched).toBe('as before')
    const said = theStepSays(step)
    expect(said.startsWith('The login service cannot tell yet how the server is.')).toBe(true)
    expect(said).toContain('the service lock cannot be read')
  })

  it('2: a running server keeps that server, with its token and process, and says nothing', () => {
    const step = theWatchsNextStep({ found: { is: 'running', ...WATCHED }, triedAt: [], now: NOW })
    expect(step).toEqual({ do: 'keep watching', watched: { ...WATCHED }, say: null })
  })

  it('2: not watched keeps watching nothing and says nothing', () => {
    const step = theWatchsNextStep({ found: { is: 'not watched', why: 'no server was watched' }, triedAt: [], now: NOW })
    expect(step).toEqual({ do: 'keep watching', watched: null, say: null })
  })

  it('2: a stopped server is left stopped and says what asked it to stop', () => {
    const step = theWatchsNextStep({ found: { is: 'stopped', because: 'the stop command asked for it' }, triedAt: [], now: NOW })
    expect(step.do).toBe('keep watching')
    if (step.do !== 'keep watching') return
    expect(step.watched).toBeNull()
    const said = theStepSays(step)
    expect(said).toContain('the stop command asked for it')
    expect(said).toContain('does not start it again')
  })

  it('2: a server whose end is unknown is left stopped, with nothing saying it ended on its own', () => {
    const step = theWatchsNextStep({ found: { is: 'stopped, how unknown', why: 'it left no note beside its lock' }, triedAt: [], now: NOW })
    expect(step.do).toBe('keep watching')
    if (step.do !== 'keep watching') return
    expect(step.watched).toBeNull()
    const said = theStepSays(step)
    expect(said.toLowerCase()).toContain('nothing says')
    expect(said).toContain('it left no note beside its lock')
    expect(said).toContain('does not start it again')
  })

  it('2: a server that ended with no stop asked for is started again after the first wait', () => {
    const step = theWatchsNextStep({ found: { is: 'stopped unasked', exitCode: AN_UNASKED_END }, triedAt: [], now: NOW })
    expect(step).toMatchObject({
      do: 'start again',
      afterMs: START_AGAIN_AFTER_MS[0]!,
      attempt: 1,
      attempts: START_AGAIN_AFTER_MS.length,
      triedAt: [],
    })
    const said = theStepSays(step)
    expect(said).toContain(String(AN_UNASKED_END))
    expect(said).toContain(String(START_AGAIN_AFTER_MS[0]! / 1000))
    expect(said).toContain('1')
    expect(said).toContain(String(START_AGAIN_AFTER_MS.length))
  })

  it('2: once the tries number the waits, a server that ended unasked is not started again and the step says so', () => {
    const triedAt = START_AGAIN_AFTER_MS.map((_, made) => NOW - (made + 1) * 1_000)
    const step = theWatchsNextStep({ found: { is: 'stopped unasked', exitCode: AN_UNASKED_END }, triedAt, now: NOW })
    expect(step.do).toBe('stop trying')
    const said = theStepSays(step)
    expect(said).toContain(String(START_AGAIN_AFTER_MS.length))
    expect(said).toContain(String(TRIES_COUNT_WITHIN_MS / 60_000))
    expect(said).toContain('starts nothing more until the server runs again')
  })

  it('2: a try older than the time the tries count within is dropped, and it no longer counts', () => {
    const recent = [NOW - 2_000, NOW - 1_000]
    const step = theWatchsNextStep({
      found: { is: 'stopped unasked', exitCode: AN_UNASKED_END },
      triedAt: [NOW - TRIES_COUNT_WITHIN_MS - 1, ...recent],
      now: NOW,
    })
    expect(step).toMatchObject({ do: 'start again', attempt: 3, attempts: START_AGAIN_AFTER_MS.length, triedAt: recent })
    // A try exactly that old still counts, because it is not older than that time.
    const stillCounts = theWatchsNextStep({
      found: { is: 'stopped unasked', exitCode: AN_UNASKED_END },
      triedAt: [NOW - TRIES_COUNT_WITHIN_MS, ...recent],
      now: NOW,
    })
    expect(stillCounts.do).toBe('stop trying')
  })

  it('2: a failed try is started again after the next wait, with its code', () => {
    const triedAt = [NOW - 2_000, NOW - 1_000]
    const step = theWatchsNextStep({ found: { is: 'the try failed', code: A_FAILED_TRY }, triedAt, now: NOW })
    expect(step).toMatchObject({
      do: 'start again',
      afterMs: START_AGAIN_AFTER_MS[2],
      attempt: 3,
      attempts: START_AGAIN_AFTER_MS.length,
      triedAt,
    })
    expect(theStepSays(step)).toContain(String(A_FAILED_TRY))
  })

  it('2: a failed try when the waits are numbered stops trying', () => {
    const triedAt = START_AGAIN_AFTER_MS.map((_, made) => NOW - (made + 1) * 1_000)
    const step = theWatchsNextStep({ found: { is: 'the try failed', code: A_FAILED_TRY }, triedAt, now: NOW })
    expect(step.do).toBe('stop trying')
    expect(theStepSays(step)).toContain(String(START_AGAIN_AFTER_MS.length))
  })
})

/** A folder of this file's own, and the service lock path in it. Nothing is written there yet. */
function aLockPath(name: string): string {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}login-watch-${name}-`)
  folders.add(dir)
  return serviceLockPathFrom({ MOLE_OFFICE_DB: join(dir, 'office.db') })
}

/** Write a lock as a server takes one. The real reader reads it back on every pass. */
function writeALock(lockPath: string, server = WATCHED): void {
  const database = lockPath.slice(0, -'.service.json'.length)
  writeFileSync(
    lockPath,
    JSON.stringify({
      about: 'A service lock this test wrote.',
      token: server.token,
      pid: server.pid,
      pgid: server.pid,
      port: 1,
      processStartedAt: '2026-11-11 12:00:00',
      database,
      databaseIdentity: { id: 'unknown', how: 'this test wrote no database' },
      checkout: dirname(lockPath),
      takenAt: new Date(NOW).toISOString(),
    }),
  )
}

/** Let the watched server end: its lock goes first, then its note, as the server does. */
function endTheServer(lockPath: string, ending: { stopAskedFor: string | null; exitCode: number; token?: string }): void {
  rmSync(lockPath, { force: true })
  const wrote = writeHowTheServerEnded(lockPath, {
    token: ending.token ?? WATCHED.token,
    pid: WATCHED.pid,
    stopAskedFor: ending.stopAskedFor,
    exitCode: ending.exitCode,
  })
  expect(wrote.written, wrote.said).toBe(true)
}

type ARun = (verb: 'start' | 'stop') => Promise<number>
interface AHandedInWatch {
  signals: EventEmitter
  runs: string[]
  said: string[]
  answer: Promise<number>
}

/**
 * A watch with everything handed in: the real lock and note readers on this lock's path, the process check the case
 * answers, and vitest's clock and timers. `run` records each verb before it answers.
 */
function aWatch(the: { lockPath: string; isRunning: (pid: number) => boolean; run: ARun }): AHandedInWatch {
  const signals = new EventEmitter()
  const runs: string[] = []
  const said: string[] = []
  const answer = watchForTheLoginService({
    lockPath: the.lockPath,
    signals,
    run: (verb) => {
      runs.push(verb)
      return the.run(verb)
    },
    readTheLock: (path) => readTheServiceLock(path),
    readTheNote: (path) => readHowTheServerEnded(path),
    isRunning: the.isRunning,
    now: () => Date.now(),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (timer) => clearTimeout(timer),
    say: (line) => {
      said.push(line)
    },
  })
  return { signals, runs, said, answer }
}

/** One watch pass, and the microtasks its answer takes. */
const aWatchPass = () => vi.advanceTimersByTimeAsync(WATCH_EVERY_MS)

/** Let the first start and the first watch pass settle. */
async function theFirstLook(watch: AHandedInWatch): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
  expect(watch.runs).toEqual(['start'])
  await aWatchPass()
  expect(watch.runs).toEqual(['start'])
}

/** The sentences that say the tries have ended. */
const theStopTryingSays = (said: readonly string[]) => said.filter((line) => line.includes('starts nothing more until the server runs again'))

describe('the login watch, with everything handed in', () => {
  it('3a: a first start that fails answers its code, and the watch runs nothing more', async () => {
    const lockPath = aLockPath('first-start-fails')
    const watch = aWatch({ lockPath, isRunning: () => false, run: async () => 3 })
    await expect(watch.answer).resolves.toBe(3)
    expect(watch.runs).toEqual(['start'])
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS * 3)
    expect(watch.runs).toEqual(['start'])
    expect(watch.signals.listenerCount('SIGTERM')).toBe(0)
    expect(watch.signals.listenerCount('SIGINT')).toBe(0)
  })

  it('3b: starts the server again after the first wait when its own note says no stop was asked for, and goes on', async () => {
    const lockPath = aLockPath('served-again')
    let serverRuns = true
    writeALock(lockPath)
    const watch = aWatch({ lockPath, isRunning: () => serverRuns, run: async () => 0 })
    await theFirstLook(watch)
    endTheServer(lockPath, { stopAskedFor: null, exitCode: AN_UNASKED_END })
    serverRuns = false
    await aWatchPass()
    expect(watch.runs, 'the try ran before its wait').toEqual(['start'])
    await vi.advanceTimersByTimeAsync(START_AGAIN_AFTER_MS[0]!)
    expect(watch.runs, 'the wait came and the try did not run').toEqual(['start', 'start'])
    // The watch goes on: the server the try started is found and watched.
    serverRuns = true
    writeALock(lockPath)
    await aWatchPass()
    expect(watch.runs).toEqual(['start', 'start'])
    watch.signals.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(0)
    await expect(watch.answer).resolves.toBe(0)
    expect(watch.runs).toEqual(['start', 'start', 'stop'])
  })

  it("3c: a stop asked for, no note, and another server's note each start nothing", async () => {
    for (const ending of ['a stop asked for', 'no note', 'another server'] as const) {
      const lockPath = aLockPath(`stopped-${ending.replaceAll(' ', '-')}`)
      let serverRuns = true
      writeALock(lockPath)
      const watch = aWatch({ lockPath, isRunning: () => serverRuns, run: async () => 0 })
      await theFirstLook(watch)
      serverRuns = false
      if (ending === 'a stop asked for') endTheServer(lockPath, { stopAskedFor: 'the stop command asked for it', exitCode: 0 })
      if (ending === 'another server') endTheServer(lockPath, { stopAskedFor: null, exitCode: AN_UNASKED_END, token: 'the-token-of-another-server' })
      if (ending === 'no note') rmSync(lockPath, { force: true })
      await aWatchPass()
      await vi.advanceTimersByTimeAsync(START_AGAIN_AFTER_MS[0]! + WATCH_EVERY_MS)
      expect(watch.runs, ending).toEqual(['start'])
      watch.signals.emit('SIGTERM')
      await vi.advanceTimersByTimeAsync(0)
      await expect(watch.answer).resolves.toBe(0)
      expect(watch.runs, ending).toEqual(['start', 'stop'])
    }
  })

  it('3d: SIGTERM while it only watches runs stop once, answers stop\'s code, and a second signal does nothing more', async () => {
    const lockPath = aLockPath('signal-while-watching')
    writeALock(lockPath)
    const watch = aWatch({ lockPath, isRunning: (pid) => pid === WATCHED.pid, run: async (verb) => (verb === 'stop' ? 9 : 0) })
    await theFirstLook(watch)
    watch.signals.emit('SIGTERM')
    watch.signals.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(0)
    await expect(watch.answer).resolves.toBe(9)
    expect(watch.runs).toEqual(['start', 'stop'])
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS * 3)
    expect(watch.runs).toEqual(['start', 'stop'])
    expect(watch.signals.listenerCount('SIGTERM')).toBe(0)
    expect(watch.signals.listenerCount('SIGINT')).toBe(0)
  })

  it('3e: SIGTERM while a try waits cancels the try, so only stop runs', async () => {
    const lockPath = aLockPath('signal-while-waiting')
    let serverRuns = true
    writeALock(lockPath)
    let releaseTheStop: (code: number) => void = () => {}
    const theStopRuns = new Promise<number>((done) => {
      releaseTheStop = done
    })
    const watch = aWatch({ lockPath, isRunning: () => serverRuns, run: async (verb) => (verb === 'stop' ? theStopRuns : 0) })
    await theFirstLook(watch)
    endTheServer(lockPath, { stopAskedFor: null, exitCode: AN_UNASKED_END })
    serverRuns = false
    await aWatchPass()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(watch.runs).toEqual(['start'])
    watch.signals.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(0)
    // The try's timer is cancelled before stop is asked, while stop has not answered yet.
    expect(vi.getTimerCount(), 'the waiting try was not cancelled').toBe(0)
    releaseTheStop(0)
    await vi.advanceTimersByTimeAsync(0)
    await expect(watch.answer).resolves.toBe(0)
    expect(watch.runs).toEqual(['start', 'stop'])
    await vi.advanceTimersByTimeAsync(START_AGAIN_AFTER_MS[0]! + WATCH_EVERY_MS)
    expect(watch.runs, 'the cancelled try ran after the stop').toEqual(['start', 'stop'])
  })

  it("3f: SIGTERM while a try's start runs waits for it, then runs stop once and answers stop's code", async () => {
    const lockPath = aLockPath('signal-while-a-try-runs')
    let serverRuns = true
    writeALock(lockPath)
    let releaseTheTry: (code: number) => void = () => {}
    const theTryRuns = new Promise<number>((done) => {
      releaseTheTry = done
    })
    const events: string[] = []
    let starts = 0
    const watch = aWatch({
      lockPath,
      isRunning: () => serverRuns,
      run: async (verb) => {
        if (verb === 'stop') {
          events.push('stop')
          return 11
        }
        starts += 1
        if (starts === 1) {
          events.push('first start')
          return 0
        }
        events.push('try start')
        const code = await theTryRuns
        events.push('try start answered')
        return code
      },
    })
    await theFirstLook(watch)
    endTheServer(lockPath, { stopAskedFor: null, exitCode: AN_UNASKED_END })
    serverRuns = false
    await aWatchPass()
    await vi.advanceTimersByTimeAsync(START_AGAIN_AFTER_MS[0]!)
    expect(starts, 'the try did not run').toBe(2)
    watch.signals.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(0)
    expect(watch.runs, 'stop ran before the try answered').toEqual(['start', 'start'])
    expect(events).not.toContain('stop')
    releaseTheTry(0)
    await vi.advanceTimersByTimeAsync(0)
    await expect(watch.answer).resolves.toBe(11)
    expect(watch.runs).toEqual(['start', 'start', 'stop'])
    expect(events.filter((event) => event === 'stop')).toHaveLength(1)
    expect(events.indexOf('stop')).toBeGreaterThan(events.indexOf('try start answered'))
  })

  it('3g: three failed tries within the time stop the tries once, and a server found later is watched again', async () => {
    const lockPath = aLockPath('three-failed-tries')
    let serverRuns = true
    writeALock(lockPath)
    let starts = 0
    const watch = aWatch({
      lockPath,
      isRunning: () => serverRuns,
      run: async (verb) => {
        if (verb === 'stop') return 0
        starts += 1
        return starts === 1 ? 0 : 1
      },
    })
    await theFirstLook(watch)
    endTheServer(lockPath, { stopAskedFor: null, exitCode: AN_UNASKED_END })
    serverRuns = false
    await aWatchPass()
    for (let made = 0; made < START_AGAIN_AFTER_MS.length; made += 1) {
      await vi.advanceTimersByTimeAsync(START_AGAIN_AFTER_MS[made]!)
      expect(starts, `the try numbered ${String(made + 1)} did not run`).toBe(made + 2)
      const says = theStopTryingSays(watch.said).length
      if (made < START_AGAIN_AFTER_MS.length - 1) expect(says, 'the tries ended before the last one').toBe(0)
    }
    expect(theStopTryingSays(watch.said), 'the watch did not say once that it stops trying').toHaveLength(1)
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS * 3)
    expect(starts, 'a try ran after the tries ended').toBe(START_AGAIN_AFTER_MS.length + 1)
    // The tries are older than the time they count within, and a server the person starts is watched again.
    await vi.advanceTimersByTimeAsync(TRIES_COUNT_WITHIN_MS + WATCH_EVERY_MS)
    serverRuns = true
    writeALock(lockPath)
    await aWatchPass()
    endTheServer(lockPath, { stopAskedFor: null, exitCode: AN_UNASKED_END })
    serverRuns = false
    await aWatchPass()
    await vi.advanceTimersByTimeAsync(START_AGAIN_AFTER_MS[0]!)
    expect(starts, 'the server found later was not watched').toBe(START_AGAIN_AFTER_MS.length + 2)
    watch.signals.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(0)
    await expect(watch.answer).resolves.toBe(0)
    expect(watch.runs.at(-1)).toBe('stop')
  })
})
