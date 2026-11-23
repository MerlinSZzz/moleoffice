// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * INSIDE A SANDBOX, A BATCH OF NAMED TEST FILES HOLDS THE TSC LOCK SHARED, FROM ITS SEAT TO ITS LAST PART.
 *
 * WHAT THE LOCK IS FOR. In a sandbox, one whole-project tsc takes about 7 GB of the container's 16 GiB. So a tsc must
 * not run beside another tsc or beside a test run. Every tsc in a sandbox runs as
 * `flock /tmp/tsc.gate flock /tmp/tsc.lock node_modules/.bin/tsc --noEmit`, which holds the lock alone. A test run holds
 * the same lock shared. Many test runs may hold it at once, and a tsc waits until none does.
 *
 * THE GATE. A tsc holds the gate while it waits for the lock and while it runs. A shared holder takes the gate only while
 * it takes its shared lock, and lets the gate go at once. So once a tsc waits for the lock, no new shared holder gets in
 * ahead of it. Without the gate, test runs that start one after another could keep the lock shared for ever, and the
 * tsc would never run.
 *
 * AFTER THE SEAT, NOT BEFORE. tools/run-named-tests.mjs asks the office for a test-batches seat first, and it may wait in
 * line for minutes. A batch that took the lock before it asked held the lock all that time, and every tsc in the
 * sandbox waited behind a batch that ran nothing. So the tool takes the lock here once its seat is granted, and lets it
 * go just before it gives the seat back.
 *
 * HOW IT IS HELD. This module opens the gate and the lock file itself, and hands each to flock(1) as descriptor 3. A
 * flock lock belongs to the open file, not to the flock process, so it stays held after flock has ended, for as long as
 * this process keeps the file open. Node opens a file so that no child is given it, so no test process the tool starts
 * holds the lock. The lock ends with the process however the process ends, kill -9 included, because the kernel closes
 * the file. flock(1) runs beside this process and is not waited for in it, so the tool's signal handlers still run
 * while it waits.
 *
 * TWO CASES TAKE NO SECOND HOLD, because in each a wait through the gate could last for ever.
 *   - A batch that started this one holds the lock, and says so in TSC_LOCK_HELD_BY: a test file of that batch started
 *     this tool. A tsc may hold the gate and wait for the lock. It then waits for the batch above, the batch above waits
 *     for this one, and this one would wait at the gate for the tsc.
 *   - The shell that started this process handed it the lock already, in the older form
 *     `sh -c 'exec 8>/tmp/tsc.gate 9>/tmp/tsc.lock; flock 8; flock -s 9; flock -u 8; exec <command>'`. That is read from
 *     /proc/self/fdinfo. A tsc that holds the gate waits for the lock this process holds, and this process would wait at
 *     the gate for the tsc. That shell also held the lock while the batch waited for its seat, so the line says to start
 *     the batch without it.
 * A batch that holds the lock either way names its own pid in TSC_LOCK_HELD_BY for its test files.
 *
 * OUTSIDE A SANDBOX NOTHING IS TAKEN. Inside one means SANDBOX_DIR is set and not empty, as tools/test-batch-seat.mjs
 * reads it. Elsewhere no tsc follows the rule, and a batch would only gain a way to fail.
 *
 * TSC_LOCK_FOLDER names another folder than /tmp for the two files. A test gives a folder of its own, so that it never
 * takes or waits for the sandbox's real lock.
 *
 * A LOCK THAT CANNOT BE TAKEN STOPS THE BATCH: a file that cannot be opened, a flock that cannot start, or a flock that
 * ends in any other way than holding the lock or saying another holds it. The error says why, and nothing stays held.
 */

import { spawn } from 'node:child_process'
import { closeSync, constants, openSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

/** The words that open each line a batch says about the tsc lock. */
const RUN_NAMED_TESTS = 'run-named-tests:'

/** The variable that names another folder than /tmp for the gate and the lock. A test names a folder of its own. */
export const TSC_LOCK_FOLDER_VARIABLE = 'TSC_LOCK_FOLDER'

/** The variable in which a batch that holds the lock names its own pid for its test files. */
export const TSC_LOCK_HELD_BY_VARIABLE = 'TSC_LOCK_HELD_BY'

/** The folder of the gate and the lock when TSC_LOCK_FOLDER is not set. */
export const THE_DEFAULT_TSC_LOCK_FOLDER = '/tmp'

/** The gate's file name. */
export const THE_TSC_GATE = 'tsc.gate'

/** The lock's file name. */
export const THE_TSC_LOCK = 'tsc.lock'

/** How the lock is held when the batch goes on: the four answers of `theTscLockShared`. */
export const HOW_THE_TSC_LOCK_IS_HELD = /** @type {const} */ ({
  /** This process took the lock, and lets it go with letGo. */
  takenHere: 'taken-here',
  /** The shell that started this process handed it the lock. */
  handedIn: 'handed-in',
  /** A batch that started this one holds the lock. */
  heldAbove: 'held-above',
  /** Not in a sandbox, so nothing is taken. */
  outside: 'outside',
})

/** What a batch says when the batch `by` that started it holds the lock. */
export const heldByABatchAbove = (/** @type {string} */ by) =>
  `${RUN_NAMED_TESTS} the tsc lock is held by process ${by}, the batch that started this one, as ${TSC_LOCK_HELD_BY_VARIABLE} says. This batch takes no second hold.`

/** What a batch says when the shell that started it handed it the lock `lock` on `descriptor`. */
export const handedInBy = (/** @type {string} */ lock, /** @type {string} */ descriptor) =>
  `${RUN_NAMED_TESTS} the shell that started this process handed it the tsc lock ${lock} on descriptor ${descriptor}, so this batch takes no second hold. That shell held the lock while the batch waited for its seat, so start the batch without that shell.`

/** What a batch says, once, when a tsc holds or waits for the lock as it comes. */
export const waitsForTheTscLock = (/** @type {string} */ gate, /** @type {string} */ lock) =>
  `${RUN_NAMED_TESTS} waits for the tsc lock: another process holds ${gate} or ${lock}, as a tsc does while it waits and while it runs. The tests start once it lets go.`

/** What a batch says when it holds the lock. */
export const holdsTheTscLock = (/** @type {string} */ lock) =>
  `${RUN_NAMED_TESTS} holds the tsc lock ${lock} shared, so no tsc starts in this sandbox until the batch ends.`

/** What a batch says when it lets the lock go. */
export const letGoOfTheTscLock = (/** @type {string} */ lock) => `${RUN_NAMED_TESTS} let go of the tsc lock ${lock}.`

/** The words that open the sentence of a lock that could not be taken. Why follows. */
export const THE_TSC_LOCK_COULD_NOT_BE_TAKEN = `${RUN_NAMED_TESTS} the batch cannot start, because the tsc lock could not be taken: `

/** The sentence of a lock that could not be taken, and `why`. */
export const cannotTakeTheTscLock = (/** @type {string} */ why) => `${THE_TSC_LOCK_COULD_NOT_BE_TAKEN}${why.trim().replace(/\.$/, '')}.`

/** @param {string | undefined} value */
const unset = (value) => value === undefined || value.trim() === ''

/** The gate and lock paths inside a sandbox, or null outside one, so both readers name the same lock. */
function theTscLockPaths() {
  if (unset(process.env['SANDBOX_DIR'])) return null
  const named = process.env[TSC_LOCK_FOLDER_VARIABLE]
  const folder = named === undefined || unset(named) ? THE_DEFAULT_TSC_LOCK_FOLDER : named
  return { gate: join(folder, THE_TSC_GATE), lock: join(folder, THE_TSC_LOCK) }
}

/** The descriptor that holds the sandbox's tsc lock, or null, so a restart can pass the shell's hold on. */
export function theDescriptorThatHoldsTheTscLock() {
  const paths = theTscLockPaths()
  return paths === null ? null : aDescriptorThatHolds(paths.lock)
}

/**
 * TAKE THE TSC LOCK SHARED, through the gate, inside a sandbox, and answer how it is held and how it is let go.
 * `letGo()` closes the lock file once and says so; it does nothing when nothing was taken here, and nothing the second
 * time. A lock that cannot be taken throws an Error whose message is one sentence saying why, with nothing held.
 *
 * @param {(words: string) => void} [say]
 * @returns {Promise<{ held: (typeof HOW_THE_TSC_LOCK_IS_HELD)[keyof typeof HOW_THE_TSC_LOCK_IS_HELD], letGo: () => void }>}
 */
export async function theTscLockShared(say = (words) => console.error(words)) {
  /** @param {(typeof HOW_THE_TSC_LOCK_IS_HELD)[keyof typeof HOW_THE_TSC_LOCK_IS_HELD]} held */
  const nothingTaken = (held) => ({ held, letGo: () => {} })
  const paths = theTscLockPaths()
  if (paths === null) return nothingTaken(HOW_THE_TSC_LOCK_IS_HELD.outside)
  const { gate, lock } = paths

  const above = process.env[TSC_LOCK_HELD_BY_VARIABLE]
  if (above !== undefined && !unset(above)) {
    say(heldByABatchAbove(above))
    return nothingTaken(HOW_THE_TSC_LOCK_IS_HELD.heldAbove)
  }

  /** @type {number | null} */
  let gateFile = null
  /** @type {number | null} */
  let lockFile = null
  try {
    const handed = aDescriptorThatHolds(lock)
    if (handed !== null) {
      say(handedInBy(lock, handed))
      return nothingTaken(HOW_THE_TSC_LOCK_IS_HELD.handedIn)
    }
    // READ-ONLY, CREATED WHEN MISSING, as flock(1) opens a file it is given by name.
    gateFile = openSync(gate, constants.O_RDONLY | constants.O_CREAT, 0o666)
    lockFile = openSync(lock, constants.O_RDONLY | constants.O_CREAT, 0o666)
    let saidItWaits = false
    for (const [file, how] of /** @type {const} */ ([[gateFile, '-x'], [lockFile, '-s']])) {
      if (await flockOn(file, [how, '-n']) === 0) continue
      if (!saidItWaits) say(waitsForTheTscLock(gate, lock))
      saidItWaits = true
      await flockOn(file, [how])
    }
    // THE GATE IS LET GO at once. The lock stays held by this process's open lock file.
    closeSync(gateFile)
    gateFile = null
  } catch (error) {
    if (gateFile !== null) closeSync(gateFile)
    if (lockFile !== null) closeSync(lockFile)
    throw new Error(cannotTakeTheTscLock(error instanceof Error ? error.message : String(error)))
  }
  say(holdsTheTscLock(lock))
  /** @type {number | null} */
  let held = lockFile
  return {
    held: HOW_THE_TSC_LOCK_IS_HELD.takenHere,
    letGo: () => {
      if (held === null) return
      closeSync(held)
      held = null
      say(letGoOfTheTscLock(lock))
    },
  }
}

/**
 * THE DESCRIPTOR OF THIS PROCESS THAT HOLDS A FLOCK ON `lock`, as /proc/self/fdinfo shows it, or null. A descriptor
 * open on the lock file with no `lock:` line holds nothing. A lock file that is not there is held by no descriptor.
 *
 * @param {string} lock
 * @returns {string | null}
 */
function aDescriptorThatHolds(lock) {
  let real
  try {
    real = realpathSync(lock)
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null
    throw error
  }
  for (const descriptor of readdirSync('/proc/self/fd')) {
    let target
    let info
    try {
      target = readlinkSync(`/proc/self/fd/${descriptor}`)
      if (target !== real) continue
      info = readFileSync(`/proc/self/fdinfo/${descriptor}`, 'utf8')
    } catch (error) {
      // A DESCRIPTOR CLOSED SINCE THE LIST WAS READ, such as the one that read the list, holds nothing.
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') continue
      throw error
    }
    if (info.split('\n').some((line) => line.startsWith('lock:') && line.includes('FLOCK'))) return descriptor
  }
  return null
}

/**
 * RUN flock(1) ON `file`, handed to it as descriptor 3, with `words` before the 3. Answers 0 when it holds the lock, and
 * 1 when `-n` is among the words and another holds it. Anything else throws, with flock's own words or how it ended.
 *
 * @param {number} file
 * @param {string[]} words
 * @returns {Promise<0 | 1>}
 */
function flockOn(file, words) {
  const said = `flock ${words.join(' ')} 3`
  return new Promise((done, failed) => {
    const child = spawn('flock', [...words, '3'], { stdio: ['ignore', 'ignore', 'pipe', file] })
    let stderr = ''
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', (error) => failed(new Error(`${said} could not start (${error.message})`)))
    child.on('close', (code, signal) => {
      if (code === 0) return done(0)
      if (code === 1 && words.includes('-n')) return done(1)
      failed(new Error(stderr.trim() !== '' ? `${said} said: ${stderr.trim()}` : `${said} ended ${code === null ? `by ${String(signal)}` : `with exit code ${String(code)}`}`))
    })
  })
}
