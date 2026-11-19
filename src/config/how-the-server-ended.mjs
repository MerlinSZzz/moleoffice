// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW THE SERVER ENDED: ONE NOTE BESIDE THE SERVICE LOCK.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * A standalone window has to start its server again when the server ends on its own, and must
 * not when somebody stopped it. Once the server has gone, nothing else can tell the two apart:
 *
 *   - the server lets its service lock go on every way out that runs code, so a crash and a stop
 *     both leave no lock;
 *   - the exit code does not tell them apart either. A stop exits 0, or the stop command's code
 *     when the terminal holder was left running, or 1 when the stop failed, and an uncaught error
 *     also exits 1;
 *   - the window does not parent the server. It runs `mole-office start`, which starts the server
 *     detached, so the window never sees an exit code at all.
 *
 * So the server writes one note on its way out. The note says which server it was, by the service
 * lock's token and the process; why a stop was asked of it, or null when none was; its exit code;
 * and when it ended. It is written beside the lock and named after the database file, as the lock
 * is.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A NOTE DOES NOT SAY
 * ---------------------------------------------------------------------------------------
 *
 * A SIGKILL runs no code and writes no note. Then the note beside a lock names an older server or
 * is absent, and neither means the server just ended on its own or was just stopped. A reader that
 * finds an old note or no note must not take that for either answer: it has to look at the server
 * it is asking about, and it may only trust a note whose token and process are that server's.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS WRITTEN AND READ
 * ---------------------------------------------------------------------------------------
 *
 * The writer is synchronous, because the server calls it from the process's `exit` event, where
 * nothing asynchronous runs. It writes the whole note to a file of its own beside the note's name
 * and then renames that file to the note's name, so a reader never reads half a note. It never
 * throws: a note that cannot be written is one sentence for the log, and the server still lets its
 * lock go after it.
 *
 * The reader answers that there is no note, that there is a note it cannot use, or the note. A
 * note is only read when every field has its type, so a file that is not JSON, a field that is
 * missing and a field of the wrong type are all unreadable rather than a note that guesses.
 */

import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { localStamp } from '../shared/typed-time.mjs'

/** The end of a service lock's path. A note is only ever derived from a path ending in it. */
const THE_LOCK_SUFFIX = '.service.json'

/** The end of the note's name: the database file's name, then this, in the lock's folder. */
const THE_NOTE_SUFFIX = '.ended.json'

/**
 * What the note says.
 *
 * @typedef {object} HowTheServerEnded
 * @property {string} token The token of the service lock the server held.
 * @property {number} pid The server's process.
 * @property {string | null} stopAskedFor Why a stop was asked, or null when none was.
 * @property {number} exitCode The code the process ended with.
 * @property {string} endedAt When it ended, as `localStamp`.
 */

/**
 * What a server says when it ends, before the note is written.
 *
 * @typedef {object} AnEnding
 * @property {string} token The token of the service lock the server held.
 * @property {number} pid The server's process.
 * @property {string | null} stopAskedFor Why a stop was asked, or null when none was.
 * @property {number} exitCode The code the process is ending with.
 */

/**
 * The one sentence for an error, whether it is an Error or something thrown by a file call.
 *
 * @param {unknown} err
 * @returns {string}
 */
function whyItFailed(err) {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Is this a JSON object, as opposed to null, an array or a value of another type?
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isAnObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * THE NOTE'S PATH BESIDE A SERVICE LOCK: the same folder, named after the database file as the lock
 * is. For `<folder>/<database file>.service.json` it answers `<folder>/<database file>.ended.json`.
 *
 * A path that does not end in `.service.json` is not a service lock's path, so no note can be
 * derived from it. It throws an Error that names the path rather than guessing a note's name.
 *
 * @param {string} lockPath
 * @returns {string}
 */
export function howTheServerEndedPathBeside(lockPath) {
  if (!lockPath.endsWith(THE_LOCK_SUFFIX)) {
    throw new Error(`The path ${lockPath} is not a service lock's path, because it does not end in ${THE_LOCK_SUFFIX}.`)
  }
  return `${lockPath.slice(0, -THE_LOCK_SUFFIX.length)}${THE_NOTE_SUFFIX}`
}

/**
 * WRITE THE NOTE BESIDE A SERVICE LOCK, and answer in one sentence what it said.
 *
 * Synchronous, because the caller is the process's `exit` event. The whole note is written to a
 * file of its own beside the note's name and then renamed to the note's name, so a reader never
 * reads half a note. Nothing here throws: a failure is `written: false` with the reason, so the
 * server's exit handler still lets the service lock go.
 *
 * @param {string} lockPath from `serviceLockPathFrom` in src/config/settings.mjs
 * @param {AnEnding} ending
 * @param {() => Date} [now]
 * @returns {{ written: true, said: string } | { written: false, said: string }}
 */
export function writeHowTheServerEnded(lockPath, { token, pid, stopAskedFor, exitCode }, now = () => new Date()) {
  /** @type {string} */
  let notePath
  try {
    notePath = howTheServerEndedPathBeside(lockPath)
  } catch (err) {
    return { written: false, said: `The note beside ${lockPath} was not written: ${whyItFailed(err)}` }
  }
  // A FILE OF THE NOTE'S OWN BESIDE IT, then the rename: a reader never sees a half-written note.
  const writing = `${notePath}.${String(process.pid)}.writing`
  try {
    const note = { token, pid, stopAskedFor, exitCode, endedAt: localStamp(now()) }
    writeFileSync(writing, `${JSON.stringify(note, null, 2)}\n`, { flag: 'w' })
    renameSync(writing, notePath)
  } catch (err) {
    try {
      unlinkSync(writing)
    } catch {
      // The file was never made, or it has already gone. Either way there is nothing to remove.
    }
    return { written: false, said: `The note ${notePath} was not written: ${whyItFailed(err)}` }
  }
  const asked =
    stopAskedFor === null ? 'no stop was asked for' : `a stop was asked for (${stopAskedFor})`
  return { written: true, said: `The note ${notePath} says this server ended with exit code ${String(exitCode)} and ${asked}.` }
}

/**
 * READ THE NOTE BESIDE A SERVICE LOCK.
 *
 * `absent` when there is no note. `unreadable` with the reason when there is a file this cannot
 * use: it is never treated as no note, because it may be the note of a server that ended. `read`
 * only when every field has its type.
 *
 * @param {string} lockPath
 * @returns {{ state: 'absent' } | { state: 'unreadable', why: string } | { state: 'read', note: HowTheServerEnded }}
 */
export function readHowTheServerEnded(lockPath) {
  /** @type {string} */
  let notePath
  try {
    notePath = howTheServerEndedPathBeside(lockPath)
  } catch (err) {
    return { state: 'unreadable', why: whyItFailed(err) }
  }
  /** @type {string} */
  let text
  try {
    text = readFileSync(notePath, 'utf8')
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return { state: 'absent' }
    return { state: 'unreadable', why: whyItFailed(err) }
  }
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { state: 'unreadable', why: 'it is not JSON' }
  }
  if (!isAnObject(parsed)) return { state: 'unreadable', why: 'it is not a JSON object' }
  if (typeof parsed['token'] !== 'string' || parsed['token'] === '') {
    return { state: 'unreadable', why: 'it does not name a server' }
  }
  if (typeof parsed['pid'] !== 'number' || !Number.isInteger(parsed['pid']) || parsed['pid'] <= 0) return { state: 'unreadable', why: 'it names no process' }
  const asked = parsed['stopAskedFor']
  if (!(typeof asked === 'string' ? asked !== '' : asked === null)) {
    return { state: 'unreadable', why: 'it does not say whether a stop was asked' }
  }
  if (typeof parsed['exitCode'] !== 'number' || !Number.isInteger(parsed['exitCode'])) {
    return { state: 'unreadable', why: 'it does not say its exit code' }
  }
  if (typeof parsed['endedAt'] !== 'string') return { state: 'unreadable', why: 'it does not say when it ended' }
  const note = /** @type {HowTheServerEnded} */ (/** @type {unknown} */ (parsed))
  return { state: 'read', note }
}
