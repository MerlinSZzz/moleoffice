// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE LOGIN SERVICE STARTS AN ENDED OFFICE AGAIN, BY THE WINDOW'S RULE. It starts the office once and then watches its
 * server every WATCH_EVERY_MS. When the server ends with no stop asked for, it starts the server again after each wait,
 * and it stops trying once the tries number the waits. Apart from systemd, so a test can ask it with no user manager
 * (tests/the-login-service-starts-an-ended-office-again.test.ts). The window's own rule is in
 * src/desktop/starting-the-server-again.mjs, and this file asks it rather than saying it again.
 *
 * WHAT IT DOES. It runs `start` first. A failed start answers start's code and ends, so systemd's Restart=on-failure
 * tries the unit again as it did before. A good start is watched until a signal comes. It starts a server again only
 * when the note beside the service lock says that the server it watched ended with no stop asked for. No note, a note
 * it cannot read and another server's note all mean that nothing says how the server ended, and nothing is started.
 *
 * WHY THE UNIT HAS NO ExecStop. systemd runs ExecStop whenever a started unit's main process ends, even when it crashed,
 * so an ExecStop would let a crashed watcher stop the office. Instead this process stops the office itself on SIGTERM,
 * which is what systemd sends when the unit is stopped: `systemctl --user stop`, a logout without lingering, or a
 * shutdown.
 *
 * WHY THE STOP COMES FIRST ON A SIGNAL. If it stopped the office before it stopped watching, its next look could see
 * the server it had just stopped and read that stop as a server that ended on its own. So a signal stops the watching
 * first, cancels a waiting try, waits for a try that runs, and only then stops the office.
 *
 * WHAT ONLY A REAL USER MANAGER SHOWS. Everything systemd does is left to systemd and is not run here: whether the
 * unit stays active while this process runs, which signal an explicit stop sends, whether Restart=on-failure starts
 * the unit again, and whether a unit whose file changed while it is active keeps the old file until the next login.
 */

import { readHowTheServerEnded } from './how-the-server-ended.mjs'
import { readTheServiceLock } from './the-service-lock.mjs'
import {
  START_AGAIN_AFTER_MS,
  TRIES_COUNT_WITHIN_MS,
  WATCH_EVERY_MS,
  howTheWatchedServerIs,
  theNextTry,
  theProcessIsRunning,
  whatTheTryFindsInTheLock,
} from '../desktop/starting-the-server-again.mjs'

/** @typedef {ReturnType<typeof readTheServiceLock>} TheLockAsRead */
/** @typedef {ReturnType<typeof readHowTheServerEnded>} TheNoteAsRead */
/** @typedef {import('../desktop/starting-the-server-again.mjs').AWatchedServer} AWatchedServer */

/**
 * What the watch found on one pass: how the watched server is, or a try that failed with its code.
 *
 * @typedef {import('../desktop/starting-the-server-again.mjs').HowTheServerIs | { is: 'the try failed', code: number }} WhatTheWatchFound
 */

/**
 * What the watch does next: keep watching (the server as before, another server, or nothing), start the server again
 * after a wait, or stop trying.
 *
 * @typedef {{ do: 'keep watching', watched: AWatchedServer | null | 'as before', say: string | null }
 *   | { do: 'start again', afterMs: number, attempt: number, attempts: number, triedAt: number[], say: string }
 *   | { do: 'stop trying', say: string }} TheWatchsNextStep
 */

/**
 * THE WATCH'S NEXT STEP, decided apart from the timers and the signals. A server that ended with no stop asked for, and
 * a try that failed, ask theNextTry when the next start may be; null there means the tries have numbered the waits, and
 * nothing more is started. Every other answer keeps watching and says what it found, or nothing.
 *
 * @param {{ found: WhatTheWatchFound, triedAt: readonly number[], now: number }} the
 * @returns {TheWatchsNextStep}
 */
export function theWatchsNextStep({ found, triedAt, now }) {
  if (found.is === 'cannot tell yet') {
    return { do: 'keep watching', watched: 'as before', say: `The login service cannot tell yet how the server is. ${found.why}` }
  }
  if (found.is === 'running') return { do: 'keep watching', watched: { token: found.token, pid: found.pid }, say: null }
  if (found.is === 'not watched') return { do: 'keep watching', watched: null, say: null }
  if (found.is === 'stopped') {
    return {
      do: 'keep watching',
      watched: null,
      say: `The login service's server was asked to stop (${found.because}), so the login service does not start it again.`,
    }
  }
  if (found.is === 'stopped, how unknown') {
    return {
      do: 'keep watching',
      watched: null,
      say: `Nothing says the login service's server ended on its own, so the login service does not start it again. ${found.why}`,
    }
  }
  const next = theNextTry(triedAt, now)
  if (next === null) {
    return {
      do: 'stop trying',
      say:
        `The login service has made all ${String(START_AGAIN_AFTER_MS.length)} tries it makes within ` +
        `${String(TRIES_COUNT_WITHIN_MS / 60_000)} minutes, and starts nothing more until the server runs again.`,
    }
  }
  const ended =
    found.is === 'stopped unasked'
      ? `The login service's server ended with exit code ${String(found.exitCode)} with no stop asked for.`
      : `The login service's try to start its server failed with exit code ${String(found.code)}.`
  return {
    do: 'start again',
    afterMs: next.afterMs,
    attempt: next.attempt,
    attempts: next.attempts,
    triedAt: next.triedAt,
    say: `${ended} The login service starts the server again in ${String(next.afterMs / 1000)} seconds, try ${String(next.attempt)} of ${String(next.attempts)}.`,
  }
}

/**
 * WATCH THE LOGIN SERVICE. It answers the exit code the service command should end with: start's own code when the
 * first start fails, and stop's code when a signal asks it to stop.
 *
 * The first start is run here, in this process, and so is the stop; the service command hands both in. Every other
 * input is handed in too, so a test can answer the process check, move the clock and timers, and send the signals
 * through an EventEmitter. The defaults are the real ones, and the lock path comes with the service.
 *
 * @param {object} the
 * @param {string} the.lockPath the service lock this office's server takes
 * @param {(verb: 'start' | 'stop') => Promise<number>} the.run the service command's own start and stop
 * @param {import('node:events').EventEmitter} [the.signals] where SIGTERM and SIGINT arrive
 * @param {(lockPath: string) => TheLockAsRead} [the.readTheLock]
 * @param {(lockPath: string) => TheNoteAsRead} [the.readTheNote]
 * @param {(pid: number) => boolean} [the.isRunning]
 * @param {() => number} [the.now]
 * @param {(callback: () => void, ms: number) => ReturnType<typeof setTimeout>} [the.setTimer]
 * @param {(timer: ReturnType<typeof setTimeout>) => void} [the.clearTimer]
 * @param {(line: string) => void} [the.say] writes one line for the journal
 * @returns {Promise<number>}
 */
export function watchForTheLoginService({
  lockPath,
  run,
  signals = process,
  readTheLock = readTheServiceLock,
  readTheNote = readHowTheServerEnded,
  isRunning = theProcessIsRunning,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  say = (line) => process.stdout.write(`${line}\n`),
}) {
  return new Promise((done) => {
    /** @type {AWatchedServer | null} */
    let watched = null
    /** @type {number[]} */
    let triedAt = []
    /** @type {ReturnType<typeof setTimeout> | null} */
    let watchTimer = null
    /** @type {ReturnType<typeof setTimeout> | null} */
    let waitingTimer = null
    /** @type {Promise<void> | null} */
    let aTry = null
    let aTryRuns = false
    /** @type {Promise<number> | null} */
    let theFirstStart = null
    let stopping = false
    let finished = false
    /** @type {string | null} */
    let theLastCannotTell = null

    /** A signal that arrives after the first one does nothing more. */
    function ignoreTheSignal() {}

    /**
     * Say what the step said, and say a repeated "cannot tell yet" once, as the window does.
     *
     * @param {TheWatchsNextStep} step
     * @param {boolean} cannotTell
     */
    function sayTheStep(step, cannotTell) {
      if (step.say === null) {
        theLastCannotTell = null
        return
      }
      if (cannotTell) {
        if (step.say !== theLastCannotTell) say(step.say)
        theLastCannotTell = step.say
        return
      }
      theLastCannotTell = null
      say(step.say)
    }

    /** End the watch with this code, with its timers and signal handlers taken off. @param {number} code */
    function finish(code) {
      if (finished) return
      finished = true
      if (watchTimer !== null) clearTimer(watchTimer)
      if (waitingTimer !== null) clearTimer(waitingTimer)
      watchTimer = null
      waitingTimer = null
      signals.removeListener('SIGTERM', onSignal)
      signals.removeListener('SIGINT', onSignal)
      signals.removeListener('SIGTERM', ignoreTheSignal)
      signals.removeListener('SIGINT', ignoreTheSignal)
      done(code)
    }

    /** One look after another, every WATCH_EVERY_MS. */
    function scheduleAWatch() {
      if (stopping || finished) return
      watchTimer = setTimer(aWatchPass, WATCH_EVERY_MS)
    }

    /** One look at the server, which does nothing while a try waits or runs. */
    function aWatchPass() {
      watchTimer = null
      if (stopping || finished) return
      if (waitingTimer !== null || aTryRuns) {
        scheduleAWatch()
        return
      }
      const found = howTheWatchedServerIs({
        watched,
        lock: readTheLock(lockPath),
        isRunning,
        readTheNote: () => readTheNote(lockPath),
      })
      const step = theWatchsNextStep({ found, triedAt, now: now() })
      sayTheStep(step, found.is === 'cannot tell yet')
      if (step.do === 'keep watching') {
        if (step.watched !== 'as before') watched = step.watched
      } else if (step.do === 'start again') {
        watched = null
        triedAt = step.triedAt
        waitingTimer = setTimer(() => {
          waitingTimer = null
          aTry = aTryToStart(step.attempt, step.attempts)
        }, step.afterMs)
      } else {
        watched = null
      }
      scheduleAWatch()
    }

    /**
     * ONE TRY TO START THE SERVER AGAIN, counted as it is made. A running server is left alone, and a process check
     * that cannot tell is said and the start runs anyway, as the window does.
     *
     * @param {number} attempt
     * @param {number} attempts
     */
    async function aTryToStart(attempt, attempts) {
      if (stopping || finished) return
      triedAt.push(now())
      const found = whatTheTryFindsInTheLock({ lock: readTheLock(lockPath), isRunning })
      if (found.is === 'running') {
        say(`The login service's server runs again already, as process ${String(found.pid)}, so the login service starts nothing.`)
        return
      }
      if (found.is === 'cannot tell') say(`The login service could not tell whether its server runs: ${found.why}`)
      say(`The login service starts its server again, try ${String(attempt)} of ${String(attempts)}.`)
      aTryRuns = true
      let code
      try {
        code = await run('start')
      } finally {
        aTryRuns = false
      }
      if (stopping || finished) return
      if (code === 0) return
      const step = theWatchsNextStep({ found: { is: 'the try failed', code }, triedAt, now: now() })
      sayTheStep(step, false)
      if (step.do === 'start again') {
        triedAt = step.triedAt
        waitingTimer = setTimer(() => {
          waitingTimer = null
          aTry = aTryToStart(step.attempt, step.attempts)
        }, step.afterMs)
      } else if (step.do === 'stop trying') {
        watched = null
      }
    }

    /**
     * A SIGNAL ASKS FOR A STOP, and the stop comes after the watch has ended: no more looks, no waiting try, and a try
     * that runs is waited for. The answer is stop's own code.
     */
    async function stopTheWatch() {
      if (stopping || finished) return
      stopping = true
      // The fired listener has gone with `once`; these keep a second signal from reaching the default action.
      signals.once('SIGTERM', ignoreTheSignal)
      signals.once('SIGINT', ignoreTheSignal)
      if (watchTimer !== null) {
        clearTimer(watchTimer)
        watchTimer = null
      }
      if (waitingTimer !== null) {
        clearTimer(waitingTimer)
        waitingTimer = null
      }
      if (theFirstStart !== null) await theFirstStart
      if (aTry !== null) await aTry
      const code = await run('stop')
      finish(code)
    }

    function onSignal() {
      void stopTheWatch()
    }

    /** START FIRST. A start that fails ends the watch with its code. */
    async function begin() {
      theFirstStart = Promise.resolve(run('start'))
      const code = await theFirstStart
      if (stopping || finished) return
      if (code !== 0) {
        finish(code)
        return
      }
      scheduleAWatch()
    }

    signals.once('SIGTERM', onSignal)
    signals.once('SIGINT', onSignal)
    void begin()
  })
}
