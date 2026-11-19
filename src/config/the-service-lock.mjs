// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE SERVICE LOCK: ONE SERVER PER DATABASE, AND A WAY TO FIND IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criteria W1, W2(c) and W9 of design/window/ACCEPTANCE.md. The service is a process of its own, and a
 * window or a command that opens finds the service already serving a database instead of starting a
 * second one. So a running server writes down, beside its database, who it is: its process, its
 * process group, its port and when it began. A second server for the same database reads that and
 * does not start. The `mole-office` command reads it to say whether the service is running and to
 * stop the right process.
 *
 * A SECOND SERVER MUST NEVER MIGRATE A DATABASE ANOTHER SERVER SERVES, so the server takes this lock
 * in `start()` before it opens the database or runs a migration.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A LOCK IS TAKEN, AND WHY TWO STARTERS CANNOT BOTH WIN
 * ---------------------------------------------------------------------------------------
 *
 * The whole lock is written to a file of its own first, and then that file is given the lock's name
 * with `linkSync`. A link fails when the name is already there, so of two servers that link at the
 * same moment exactly one succeeds. The lock is never half-written, because the name only ever points
 * at a file that was finished before the link.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN A LOCK IS ALREADY THERE
 * ---------------------------------------------------------------------------------------
 *
 * Its process is read, by number, through `theProcessAt` in src/config/session-process.mjs:
 *
 *   - gone: the lock is stale. The server says so in its log, takes the lock over, and goes on.
 *   - running, with the start time the lock recorded: it is the server that took the lock. The new
 *     server refuses with a sentence naming that process, its port and the lock file, and exits with
 *     `THE_SERVICE_LOCK_REFUSAL_EXIT_CODE`.
 *   - running, with a different start time: the number was given to another process later. The lock
 *     is stale, for the same reason as gone.
 *   - running, and its start time cannot be read: nothing here can tell which of the two it is, so
 *     the server refuses and says it could not tell. It never guesses.
 *
 * A stale lock is moved aside under a name only this taker uses, and the moved file is read again
 * before it is deleted. If it is not the stale lock that was judged, another server took the lock in
 * between, and the moved file is put back.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS LET GO
 * ---------------------------------------------------------------------------------------
 *
 * Each lock carries a token only its taker knows. The server deletes the lock at the end of its
 * shutdown and when its process exits, but only when the file still carries its own token. A server
 * killed with SIGKILL deletes nothing; its lock then names a process that has gone, which is a stale
 * lock, and the next start takes it over.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS JAVASCRIPT, AND WHY THE PROCESS READING IS A PARAMETER
 * ---------------------------------------------------------------------------------------
 *
 * The server (TypeScript, under tsx) and the `mole-office` command (plain `node`) both read it, so it
 * is written once, as src/config/settings.mjs is. The reading of a process is passed in, so that a
 * test can drive every case above with a reading it made. The real reading is
 * `theProcessReading` below. The server cannot use `osProbe()` from src/server/lib/resources.ts for
 * it: importing that file opens the database, and this lock is taken before the database is opened.
 */

import { randomUUID } from 'node:crypto'
import { linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { databaseIdentity } from './database-identity.mjs'
import { readTheProcessAt, theProcessAt } from './session-process.mjs'

/**
 * THE EXIT CODE OF A SERVER THAT DID NOT START BECAUSE OF THE SERVICE LOCK.
 *
 * No other refusal of the server exits with it, so a program that started a server can tell this
 * ending from every other one by the code alone. tools/serve-dev.mjs needs that: starting the server
 * again cannot change who holds the lock.
 */
export const THE_SERVICE_LOCK_REFUSAL_EXIT_CODE = 75

/**
 * What a process reading says.
 *
 * @typedef {{ here: false } | { here: true, startedAt: string | null, pgid: number | null }} ProcessReading
 */

/**
 * What a lock file holds.
 *
 * @typedef {object} ServiceLock
 * @property {string} about One sentence for a person who opens the file.
 * @property {string} token Known only to the server that took the lock.
 * @property {number} pid The server's process.
 * @property {number} pgid The server's group: its process group on Linux and the Mac, and on Windows the
 *   group the system layer's starter put it in, whose Job Object is named after the starter's process.
 * @property {number} port The port the server was started for.
 * @property {string} processStartedAt When the server's process began, as `theProcessAt` reads it.
 * @property {string} database The database file, absolute.
 * @property {{ id: string, how: string }} databaseIdentity The identity of the database when the lock
 *   was taken. A database that did not exist yet has the identity `unknown`, with the reason.
 * @property {string} checkout The checkout the server runs from, absolute.
 * @property {string} takenAt When the lock was taken, as an ISO string.
 * @property {StarterRecord} [starter] The process that started this server, when it was given
 *   `--stop-with-pid`. Absent for a server started without that flag, and absent in old lock files.
 */

/**
 * WHO STARTED THE SERVER, when the server was told a process watches it.
 *
 * `--stop-with-pid=<pid>` names that process. A readable record carries its pid, its process group and
 * when it began, all read at the moment the lock was taken. A record that could not be read says so
 * and carries no values: a lock that guessed would send a later stop to the wrong group. Absence means
 * the server was started without that flag, so nobody is watching it.
 *
 * @typedef {{ pid: number, pgid: number, processStartedAt: string } | { pid: number, unread: string }} StarterRecord
 */

/**
 * The real process reading: `theProcessAt` in src/config/session-process.mjs, which reads through the
 * process reader for this platform (/proc on Linux, `ps` on macOS; src/config/process-reader.mjs).
 *
 * @param {number} pid
 * @returns {ProcessReading}
 */
export function theProcessReading(pid) {
  return theProcessAt(pid)
}

/**
 * The same reading, made without holding the thread where reading a process runs another program
 * (Windows). The server takes its lock with this one.
 *
 * @param {number} pid
 * @returns {Promise<ProcessReading>}
 */
export function readTheProcess(pid) {
  return readTheProcessAt(pid)
}

/**
 * Read a lock file.
 *
 * `absent` when there is no file. `unreadable` with the reason when there is a file this cannot use:
 * it is never treated as no lock, because it might be guarding a database.
 *
 * @param {string} lockPath
 * @returns {{ state: 'absent' } | { state: 'unreadable', why: string } | { state: 'read', lock: ServiceLock }}
 */
export function readTheServiceLock(lockPath) {
  let text
  try {
    text = readFileSync(lockPath, 'utf8')
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return { state: 'absent' }
    return { state: 'unreadable', why: err instanceof Error ? err.message : String(err) }
  }
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { state: 'unreadable', why: 'it is not JSON' }
  }
  const lock = /** @type {Partial<ServiceLock>} */ (parsed)
  const wholeNumber = (/** @type {unknown} */ n) => typeof n === 'number' && Number.isInteger(n) && n > 0
  if (typeof parsed !== 'object' || parsed === null) return { state: 'unreadable', why: 'it is not a JSON object' }
  if (typeof lock.token !== 'string' || lock.token === '') return { state: 'unreadable', why: 'it has no token' }
  if (!wholeNumber(lock.pid)) return { state: 'unreadable', why: 'it names no process' }
  if (!wholeNumber(lock.pgid)) return { state: 'unreadable', why: 'it names no process group' }
  if (!wholeNumber(lock.port)) return { state: 'unreadable', why: 'it names no port' }
  if (typeof lock.processStartedAt !== 'string' || lock.processStartedAt === '') {
    return { state: 'unreadable', why: 'it does not say when its process began' }
  }
  if (lock.starter !== undefined) {
    const said = whyTheStarterRecordIsUnreadable(lock.starter)
    if (said !== null) return { state: 'unreadable', why: said }
  }
  return { state: 'read', lock: /** @type {ServiceLock} */ (lock) }
}

/**
 * Why a lock's starter record is in no shape this version writes, or null when it is one it reads.
 *
 * A record that says it could not be read (`unread`) is a shape, not an error: the lock was written
 * knowing only that the process could not be read. A record with neither a reading nor a reason is no
 * shape at all, and a stop that guessed from it could signal the wrong group.
 *
 * @param {unknown} starter
 * @returns {string | null}
 */
function whyTheStarterRecordIsUnreadable(starter) {
  if (typeof starter !== 'object' || starter === null) return 'its starter record is not an object'
  const record = /** @type {Record<string, unknown>} */ (starter)
  if (typeof record['pid'] !== 'number' || !Number.isInteger(record['pid']) || record['pid'] <= 0) {
    return 'its starter record names no process'
  }
  if (typeof record['unread'] === 'string' && record['unread'] !== '') return null
  if (typeof record['pgid'] !== 'number' || !Number.isInteger(record['pgid']) || record['pgid'] <= 0) {
    return 'its starter record names no process group'
  }
  if (typeof record['processStartedAt'] !== 'string' || record['processStartedAt'] === '') {
    return 'its starter record does not say when the starter began'
  }
  return null
}

/**
 * Is the process a lock names the server that took it?
 *
 * @param {ServiceLock} lock
 * @param {(pid: number) => ProcessReading} readProcess
 * @returns {{ state: 'held' } | { state: 'gone' } | { state: 'reused', startedAt: string } | { state: 'cannot-tell' }}
 */
export function whoHoldsTheLock(lock, readProcess) {
  const now = readProcess(lock.pid)
  if (!now.here) return { state: 'gone' }
  if (now.startedAt === null) return { state: 'cannot-tell' }
  if (now.startedAt !== lock.processStartedAt) return { state: 'reused', startedAt: now.startedAt }
  return { state: 'held' }
}

/**
 * Why a held lock stops a server, in plain words.
 *
 * @param {string} lockPath
 * @param {ServiceLock} lock
 * @returns {string}
 */
export function theLockIsHeldSentence(lockPath, lock) {
  return (
    `This server did not start, because another Mole Office server holds the service lock of the database ${lock.database}. ` +
    `That server is process ${String(lock.pid)}, started for port ${String(lock.port)}, and it took the lock at ${lock.takenAt}. ` +
    `The lock is the file ${lockPath}.`
  )
}

/**
 * What a lock nobody can judge stops, in plain words.
 *
 * @param {string} lockPath
 * @param {string} databasePath
 * @param {string} why
 * @returns {string}
 */
function cannotTellSentence(lockPath, databasePath, why) {
  return (
    `This server did not start. ${why} ` +
    `So it cannot be told whether another Mole Office server serves the database ${databasePath}. ` +
    `If none does, delete ${lockPath} and start again.`
  )
}

/**
 * The outcome of `takeTheServiceLock`.
 *
 * @typedef {{ taken: true, lock: ServiceLock, said: string, tookOver: string | null }
 *   | { taken: false, why: 'held' | 'cannot-tell' | 'unreadable' | 'self-unknown' | 'lost-a-race', said: string }} TakeOutcome
 */

/**
 * WHAT THE LOCK RECORDS OF THE PROCESS THE SERVER WAS TOLD WATCHES IT.
 *
 * The reading is the same one the server makes of itself, taken at the moment the lock is taken: a pid
 * whose process group and start time are read together. A process that cannot be read is recorded as
 * `unread` with the reason, and the lock is still taken: absence beats a guess, and a guessed group
 * could be signalled later.
 *
 * @param {number} pid
 * @param {(pid: number) => ProcessReading | Promise<ProcessReading>} readProcess
 * @returns {Promise<StarterRecord>}
 */
async function theStarterReading(pid, readProcess) {
  /** @type {ProcessReading} */
  let reading
  try {
    reading = await readProcess(pid)
  } catch (err) {
    return { pid, unread: err instanceof Error ? err.message : String(err) }
  }
  if (!reading.here) return { pid, unread: 'no process with that number is running' }
  if (reading.startedAt === null || reading.pgid === null) {
    return { pid, unread: 'its start time and process group could not be read' }
  }
  return { pid, pgid: reading.pgid, processStartedAt: reading.startedAt }
}

/**
 * TAKE THE SERVICE LOCK OF A DATABASE, or say plainly why not.
 *
 * Nothing is thrown for the refusals: each one is a sentence the server prints before it exits with
 * `THE_SERVICE_LOCK_REFUSAL_EXIT_CODE`. A file-system failure other than those (a folder this user
 * cannot write, for example) is thrown, because it is not a lock question and the server stops on it.
 *
 * @param {object} the
 * @param {string} the.lockPath from `serviceLockPathFrom` in src/config/settings.mjs
 * @param {string} the.databasePath the database the lock guards, absolute
 * @param {number} the.port the port the server is started for
 * @param {string} the.checkout the checkout the server runs from
 * @param {number} the.pid the server's own process
 * @param {(pid: number) => ProcessReading | Promise<ProcessReading>} the.readProcess the reading of a process. Each
 *   reading is awaited, so a server that reads with `readTheProcess` does not hold its thread while it reads.
 * @param {{ group: number } | { unknown: string } | null} [the.group] the group this server was started in,
 *   as the system layer answers it where the process table names no group (Windows), or null where the
 *   process group read with the process is the group (Linux and the Mac).
 * @param {() => Date} [the.now]
 * @param {number | null} [the.starter] the pid named by `--stop-with-pid=<pid>`, or null when the
 *   server was given no such flag. It is recorded in the lock so that a later stop can follow the
 *   process that started this server instead of guessing one.
 * @returns {Promise<TakeOutcome>}
 */
export async function takeTheServiceLock({ lockPath, databasePath, port, checkout, pid, readProcess, group = null, now = () => new Date(), starter = null }) {
  if (group !== null && 'unknown' in group) {
    return {
      taken: false,
      why: 'self-unknown',
      said:
        `This server did not start. It could not tell which group it was started in: ${group.unknown} The service ` +
        'lock records that group, so that a stop asks only the group this server runs in.',
    }
  }
  const me = await readProcess(pid)
  const pgid = group === null ? (me.here ? me.pgid : null) : group.group
  if (!me.here || me.startedAt === null || pgid === null) {
    return {
      taken: false,
      why: 'self-unknown',
      said:
        `This server did not start. It could not read its own start time and process group, as process ${String(pid)}, ` +
        `from the process table. The service lock records both, so that a later process given the same number is not ` +
        `taken for this one.`,
    }
  }
  const token = randomUUID()
  /** @type {ServiceLock} */
  const lock = {
    about:
      'The service lock of a Mole Office server. While this file names a running process with this start time, ' +
      'no second server starts on this database. The server deletes it when it stops.',
    token,
    pid,
    pgid,
    port,
    processStartedAt: me.startedAt,
    database: databasePath,
    databaseIdentity: databaseIdentity(databasePath),
    checkout,
    takenAt: now().toISOString(),
  }
  if (starter !== null) lock.starter = await theStarterReading(starter, readProcess)
  mkdirSync(dirname(lockPath), { recursive: true })
  const writing = `${lockPath}.${token}.taking`
  const aside = `${lockPath}.${token}.stale`
  /** @type {string | null} */
  let tookOver = null
  // Three tries: a free lock is taken on the first, a stale one on the second. A third is only needed
  // when another server moved in between, and then the next look says who holds it.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    writeFileSync(writing, `${JSON.stringify(lock, null, 2)}\n`, { flag: 'wx' })
    try {
      linkSync(writing, lockPath)
      return {
        taken: true,
        lock,
        tookOver,
        said: `This server holds the service lock ${lockPath} for the database ${databasePath}.`,
      }
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'EEXIST') throw err
    } finally {
      unlinkSync(writing)
    }

    const there = readTheServiceLock(lockPath)
    // Deleted between the link and this read, by the server that held it stopping. Try again.
    if (there.state === 'absent') continue
    if (there.state === 'unreadable') {
      return {
        taken: false,
        why: 'unreadable',
        said: cannotTellSentence(lockPath, databasePath, `The service lock ${lockPath} is there, but it could not be read: ${there.why}.`),
      }
    }
    // Read first, then judged by the one judge, which the `mole-office` command also asks.
    const reading = await readProcess(there.lock.pid)
    const holder = whoHoldsTheLock(there.lock, () => reading)
    if (holder.state === 'held') {
      return { taken: false, why: 'held', said: theLockIsHeldSentence(lockPath, there.lock) }
    }
    if (holder.state === 'cannot-tell') {
      return {
        taken: false,
        why: 'cannot-tell',
        said: cannotTellSentence(
          lockPath,
          databasePath,
          `The service lock ${lockPath} names process ${String(there.lock.pid)}, and a process with that number is running, ` +
            'but its start time could not be read.',
        ),
      }
    }

    // STALE. Move it aside under this taker's own name, then make sure it was the stale lock judged.
    try {
      renameSync(lockPath, aside)
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') continue
      throw err
    }
    const moved = readTheServiceLock(aside)
    if (moved.state === 'read' && moved.lock.token === there.lock.token) {
      unlinkSync(aside)
      tookOver =
        holder.state === 'gone'
          ? `The service lock ${lockPath} named process ${String(there.lock.pid)}, which has ended, so the lock was stale. ` +
            'This server took it over.'
          : `The service lock ${lockPath} named process ${String(there.lock.pid)}, which began at ${there.lock.processStartedAt}. ` +
            `The process with that number now began at ${holder.startedAt}, so it is a different process and the lock was stale. ` +
            'This server took it over.'
      continue
    }
    // Another server took the lock between the read and the move. Put its lock back.
    try {
      linkSync(aside, lockPath)
      unlinkSync(aside)
    } catch (err) {
      return {
        taken: false,
        why: 'lost-a-race',
        said:
          `This server did not start. While it took over a stale service lock at ${lockPath}, another server took the lock ` +
          `first, and that server's lock could not be put back (${err instanceof Error ? err.message : String(err)}). ` +
          `It is at ${aside}.`,
      }
    }
  }
  // Three tries and the lock changed hands each time. Say who holds it now, if anybody.
  const last = readTheServiceLock(lockPath)
  return {
    taken: false,
    why: 'lost-a-race',
    said:
      last.state === 'read'
        ? theLockIsHeldSentence(lockPath, last.lock)
        : `This server did not start. The service lock ${lockPath} changed hands three times while this server tried to take it.`,
  }
}

/**
 * LET GO OF A LOCK THIS SERVER TOOK, and only that one.
 *
 * Synchronous, because it is also called from the process's `exit` event, where nothing asynchronous
 * runs. Answers what it did, in words, for the log.
 *
 * @param {string} lockPath
 * @param {string} token
 * @returns {{ released: boolean, said: string }}
 */
export function releaseTheServiceLock(lockPath, token) {
  const there = readTheServiceLock(lockPath)
  if (there.state === 'absent') return { released: false, said: `The service lock ${lockPath} was already gone.` }
  if (there.state === 'unreadable') {
    return { released: false, said: `The service lock ${lockPath} could not be read (${there.why}), so it was left where it is.` }
  }
  if (there.lock.token !== token) {
    return { released: false, said: `The service lock ${lockPath} belongs to another server now, so it was left where it is.` }
  }
  unlinkSync(lockPath)
  return { released: true, said: `The service lock ${lockPath} was let go.` }
}
