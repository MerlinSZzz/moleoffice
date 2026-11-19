// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE WINDOW STARTS ITS SERVER AGAIN WHEN THE SERVER STOPPED ON ITS OWN: WHEN, AND HOW OFTEN. It also says what a
 * try finds in the service lock: a running server to find, a start to run, or a process check that cannot tell.
 * Apart from Electron, so a test can ask it with no window (tests/when-the-window-starts-its-server-again.test.ts).
 *
 * A server can end with nobody asking it to, on an uncaught error for example. Nothing then starts it again, and the
 * window keeps showing an office that no longer answers. So the window watches the server it found, and starts it
 * again when the server ended with no stop asked for. It must not start a server that somebody stopped.
 *
 * WHAT IT DECIDES FROM. The window does not parent the server, so it never sees how the server ended. It reads two
 * files instead: the service lock while the server runs, and the note the server writes beside the lock as it ends
 * (src/config/how-the-server-ended.mjs). A server that is stopped lets its lock go before it writes the note, so the
 * note is read only once the watched process has gone. Only a note with the watched server's token is trusted. An older server's
 * note, no note and a note that cannot be read all mean that nothing says how the server ended. A SIGKILL leaves
 * exactly that, and so may a stop the window did not see, so the window does not start the server again then.
 *
 * WHAT IT LEAVES ALONE. A server whose lock names a starter was started with --stop-with-pid. That process watches it
 * and stops it, so the window does not watch it as well.
 *
 * HOW OFTEN. Each try waits longer than the one before. Once the tries made within TRIES_COUNT_WITHIN_MS number the
 * waits, the window tries no more, and the next start is the person's Check again. Without that, a server that ends
 * at every start would be started for ever.
 */

/** @typedef {ReturnType<typeof import('../config/the-service-lock.mjs').readTheServiceLock>} TheLockAsRead */
/** @typedef {ReturnType<typeof import('../config/how-the-server-ended.mjs').readHowTheServerEnded>} TheNoteAsRead */

/** How often the window reads its server's lock. */
export const WATCH_EVERY_MS = 2_000

/** How long the window waits before each try to start the server again, in order. Their number is the number of tries. */
export const START_AGAIN_AFTER_MS = Object.freeze([5_000, 20_000, 60_000])

/** A try older than this no longer counts against the tries left. */
export const TRIES_COUNT_WITHIN_MS = 600_000

/**
 * The server the window watches: the token and the process its service lock named while it ran.
 *
 * @typedef {{ token: string, pid: number }} AWatchedServer
 */

/**
 * What the window makes of its server on one pass of its watch.
 *
 * @typedef {{ is: 'cannot tell yet', why: string }
 *   | { is: 'not watched', why: string }
 *   | { is: 'running', token: string, pid: number }
 *   | { is: 'stopped', because: string }
 *   | { is: 'stopped unasked', exitCode: number }
 *   | { is: 'stopped, how unknown', why: string }} HowTheServerIs
 */

/**
 * Ask whether a process runs, and answer the error's own words instead of letting it throw.
 *
 * @param {(pid: number) => boolean} isRunning whether a process runs at this number
 * @param {number} pid
 * @returns {{ runs: boolean } | { why: string }}
 */
function askWhetherItRuns(isRunning, pid) {
  try {
    return { runs: isRunning(pid) }
  } catch (err) {
    return { why: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * HOW THE WATCHED SERVER IS, decided in this order:
 *   1. A lock that cannot be read cannot tell yet.
 *   2. If the process check that asks about the lock's process throws, the watch cannot tell yet, with the error's
 *      own words.
 *   3. A lock whose process is running is the server to watch, unless the lock names a starter.
 *   4. With nothing watched, there is nothing to start again.
 *   5. While the watched process still runs, it has not finished ending, and its note may not be written yet. If the
 *      process check that asks about it throws, the watch cannot tell yet, with the error's own words.
 *   6. Then the note. The watched server's own note says whether a stop was asked for. Any other note, or none,
 *      says nothing about it.
 *
 * @param {object} the
 * @param {AWatchedServer | null} the.watched the server watched until now, or null when none is
 * @param {TheLockAsRead} the.lock the service lock as it was just read
 * @param {(pid: number) => boolean} the.isRunning whether a process runs at this number
 * @param {() => TheNoteAsRead} the.readTheNote reads the note beside the same lock
 * @returns {HowTheServerIs}
 */
export function howTheWatchedServerIs({ watched, lock, isRunning, readTheNote }) {
  if (lock.state === 'unreadable') return { is: 'cannot tell yet', why: lock.why }
  if (lock.state === 'read') {
    const asked = askWhetherItRuns(isRunning, lock.lock.pid)
    if ('why' in asked) {
      return {
        is: 'cannot tell yet',
        why: `The service lock names process ${String(lock.lock.pid)}, but the window could not ask whether it runs: ${asked.why}`,
      }
    }
    if (asked.runs) {
      if (lock.lock.starter !== undefined) {
        return {
          is: 'not watched',
          why: `The server, process ${String(lock.lock.pid)}, was started by process ${String(lock.lock.starter.pid)}, which stops it, so this window leaves it alone.`,
        }
      }
      return { is: 'running', token: lock.lock.token, pid: lock.lock.pid }
    }
  }
  if (watched === null) return { is: 'not watched', why: 'No server was running when this window last looked, so it has none to start again.' }
  const asked = askWhetherItRuns(isRunning, watched.pid)
  if ('why' in asked) {
    return {
      is: 'cannot tell yet',
      why: `The server this window watches is process ${String(watched.pid)}, but the window could not ask whether it runs: ${asked.why}`,
    }
  }
  if (asked.runs) {
    return { is: 'cannot tell yet', why: `Process ${String(watched.pid)}, the server this window watches, is still running, so it has not finished ending.` }
  }
  const note = readTheNote()
  if (note.state === 'read' && note.note.token === watched.token) {
    return note.note.stopAskedFor === null ? { is: 'stopped unasked', exitCode: note.note.exitCode } : { is: 'stopped', because: note.note.stopAskedFor }
  }
  if (note.state === 'read') {
    return {
      is: 'stopped, how unknown',
      why: `The note beside the service lock is about another server, process ${String(note.note.pid)}, so nothing says how process ${String(watched.pid)} ended.`,
    }
  }
  if (note.state === 'absent') {
    return { is: 'stopped, how unknown', why: `Process ${String(watched.pid)} left no note beside the service lock, as a server ended by SIGKILL leaves none.` }
  }
  return { is: 'stopped, how unknown', why: `The note beside the service lock cannot be read: ${note.why}` }
}

/**
 * WHAT THE TRY FINDS IN THE SERVICE LOCK: a running server to find, a start to run, or a process check that cannot
 * tell. A try that cannot tell goes on to the start command, which finds a server that already runs.
 *
 * @param {object} the
 * @param {TheLockAsRead} the.lock the service lock as the try just read it
 * @param {(pid: number) => boolean} the.isRunning whether a process runs at this number
 * @returns {{ is: 'running', pid: number } | { is: 'start' } | { is: 'cannot tell', why: string }}
 */
export function whatTheTryFindsInTheLock({ lock, isRunning }) {
  if (lock.state !== 'read') return { is: 'start' }
  const asked = askWhetherItRuns(isRunning, lock.lock.pid)
  if ('why' in asked) {
    return {
      is: 'cannot tell',
      why: `The window could not ask whether process ${String(lock.lock.pid)}, which the service lock names, runs: ${asked.why}. The window runs the start command anyway, which finds a running server itself.`,
    }
  }
  if (asked.runs) return { is: 'running', pid: lock.lock.pid }
  return { is: 'start' }
}

/**
 * THE NEXT TRY, OR NONE. The tries older than TRIES_COUNT_WITHIN_MS are dropped first. A try exactly that old is kept,
 * because it is not older than that. When the tries kept already number the waits, there is no next try.
 *
 * @param {readonly number[]} triedAt when each try was made, in milliseconds as Date.now() gives them, oldest first
 * @param {number} now
 * @returns {{ afterMs: number, attempt: number, attempts: number, triedAt: number[] } | null} the wait before the next
 *   try, which try that is of how many, and the tries that still count
 */
export function theNextTry(triedAt, now) {
  const kept = triedAt.filter((at) => now - at <= TRIES_COUNT_WITHIN_MS)
  const afterMs = START_AGAIN_AFTER_MS[kept.length]
  if (afterMs === undefined) return null
  return { afterMs, attempt: kept.length + 1, attempts: START_AGAIN_AFTER_MS.length, triedAt: kept }
}

/**
 * Whether a process runs at this number. A process this user may not signal is running all the same.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function theProcessIsRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code
    if (code === 'EPERM') return true
    if (code === 'ESRCH') return false
    throw err
  }
}
