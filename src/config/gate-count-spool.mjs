// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE GATE-COUNT SPOOL, by which the sandbox tools count a gate without a key (wave 13r round O).
 *
 * A tool appends one line per encounter to a day file in `<sandboxes>/.gate-counts/`, a folder at 0700 that is never
 * mounted into a container. The office reads each new line once and counts it (src/server/lib/gate-count-spool.ts).
 * A line it cannot use goes to the rejects file with the reason, and is not counted.
 *
 * This file makes a line, reads one and writes one, so the tools' writer and the office's reader cannot drift. The
 * writer, `spoolAGateMet`, appends what `aGateCountLine` returns to the day file of the line's own day,
 * `<YYYY-MM-DD>.jsonl`, made at 0600.
 */
import { closeSync, constants, mkdirSync, openSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { gateValueIsAllowed, GATES, WHY_A_SPOOL_ROW_WAITS } from './gates.mjs'
import { theSandboxesFolder } from './sandbox-folder.mjs'
import { localStamp, readATypedTime } from '../shared/typed-time.mjs'

/**
 * The spool's place and its one line's fields, in the order a line holds them. `world` is the file in the spool that
 * names the one world whose offices read it. Only the office's reader writes it, so that two offices on one machine
 * never both count a line; a writer never touches it.
 */
export const GATE_COUNT_SPOOL = Object.freeze({
  folder: '.gate-counts',
  folderMode: 0o700,
  fileMode: 0o600,
  dayFile: /^(\d{4}-\d{2}-\d{2})\.jsonl$/,
  rejects: 'rejects.jsonl',
  world: '.world',
  fields: Object.freeze(/** @type {const} */ (['gate', 'position', 'at', 'sandbox'])),
})

/**
 * The spool for a home: the folder `GATE_COUNT_SPOOL.folder` names, in that home's sandboxes folder. A tool handed
 * another home works its spool out here, as theWorktreesFolder works out the worktrees (wave 13r round AE).
 * @param {string} home
 * @returns {string}
 */
export function theGateCountSpoolFolder(home) {
  return join(theSandboxesFolder(process.platform, home, process.env), GATE_COUNT_SPOOL.folder)
}

/** This machine's spool, which the office reads (src/server/lib/gate-count-spool.ts) and every writer appends to. */
export const THE_GATE_COUNT_SPOOL_FOLDER = theGateCountSpoolFolder(homedir())

/**
 * Why a line is not counted, in the order the reader asks. A line goes to the rejects file with the first that holds.
 * @typedef {keyof typeof GATE_COUNT_LINE_REFUSED} GateCountLineRefused
 */
export const GATE_COUNT_LINE_REFUSED = Object.freeze({
  'not-json': 'The line is not one JSON object.',
  fields: 'The line has a field missing or one too many. It holds exactly gate, position, at and sandbox.',
  form: 'A field is not of its form. Gate and position are text, at is a local time written YYYY-MM-DD HH:MM:SS, and sandbox is a name or null.',
  'unknown-gate': 'No gate has this id.',
  'not-a-spool-gate': 'This gate is not counted from the spool.',
  position: 'This gate does not allow this position.',
  day: "The line's time is not on its file's day.",
})

/**
 * @typedef {{gate: string, position: string, at: string, sandbox: string | null}} AGateCountLine
 */

/**
 * One line of the spool, or why it is not counted. `day` is the day of the file it was read from. Nothing is guessed:
 * a gate or a position this release does not have is refused, never matched to a near one.
 * @param {string} text the line without its newline
 * @param {string} day
 * @returns {{line: AGateCountLine} | {refused: GateCountLineRefused}}
 */
export function readAGateCountLine(text, day) {
  /** @type {unknown} */
  let read
  try {
    read = JSON.parse(text)
  } catch {
    return {refused: 'not-json'}
  }
  if (typeof read !== 'object' || read === null || Array.isArray(read)) return {refused: 'not-json'}
  const keys = Object.keys(read)
  if (keys.length !== GATE_COUNT_SPOOL.fields.length || !GATE_COUNT_SPOOL.fields.every(field => keys.includes(field))) return {refused: 'fields'}
  const {gate, position, at, sandbox} = /** @type {Record<string, unknown>} */ (read)
  if (typeof gate !== 'string' || typeof position !== 'string' || typeof at !== 'string' || readATypedTime(at) !== at) return {refused: 'form'}
  if (sandbox !== null && (typeof sandbox !== 'string' || sandbox.trim() === '')) return {refused: 'form'}
  const row = GATES.find(one => one.id === gate)
  if (row === undefined) return {refused: 'unknown-gate'}
  if (row.countedBy !== 'the-sandbox-spool') return {refused: 'not-a-spool-gate'}
  if (!gateValueIsAllowed(row, position)) return {refused: 'position'}
  if (at.slice(0, 10) !== day) return {refused: 'day'}
  return {line: {gate, position, at, sandbox}}
}

/**
 * The exact text of one line, with its newline, for the writer to append in one write. It throws on a line the reader
 * would refuse, so a writer finds its mistake where it makes it.
 * @param {AGateCountLine} line
 * @returns {string}
 */
export function aGateCountLine({gate, position, at, sandbox}) {
  const text = JSON.stringify({gate, position, at, sandbox})
  const read = readAGateCountLine(text, typeof at === 'string' ? at.slice(0, 10) : '')
  if ('refused' in read) throw new Error(`The gate-count line ${text} would not be counted: ${GATE_COUNT_LINE_REFUSED[read.refused]}`)
  return `${text}\n`
}

/**
 * COUNT ONE MEETING OF A GATE IN THE SPOOL, from a tool that runs only on the host (wave 13r round AC). It appends one
 * line, in one write, to the day file of the line's own day, opened to append and made at 0600, in a spool folder made
 * at 0700. It never touches `.world`. `sandbox` is the sandbox the gate is about, or null.
 *
 * A line the reader would refuse throws, from `aGateCountLine`, since that is a mistake in the caller. When the line
 * cannot be written, it writes one line to stderr saying the meeting was not counted and why, and returns, so the
 * check that met the gate goes on as it would have without a count.
 * @param {string} gate
 * @param {string} position
 * @param {string | null} [sandbox]
 */
export function spoolAGateMet(gate, position, sandbox = null) {
  const at = localStamp(new Date())
  const line = aGateCountLine({gate, position, at, sandbox})
  const file = join(THE_GATE_COUNT_SPOOL_FOLDER, `${at.slice(0, 10)}.jsonl`)
  /** @type {number | undefined} */
  let fd
  try {
    mkdirSync(THE_GATE_COUNT_SPOOL_FOLDER, {recursive: true, mode: GATE_COUNT_SPOOL.folderMode})
    fd = openSync(file, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, GATE_COUNT_SPOOL.fileMode)
    writeSync(fd, line)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error)) throw error
    process.stderr.write(`The gate ${gate} was met here and was not counted, because its line could not be written to ${file}: ${error.message}\n`)
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * THE SPOOL ROWS NO SITE COUNTS, each with the code of the reason the spool cannot count it. The reason itself is
 * WHY_A_SPOOL_ROW_WAITS's, in src/config/gates.mjs, and each row's `why` is read from there. A commit that gives a row a
 * site takes the row off this list. A test deleted on 13 November 2026 held each spool row to a site or to this list, not both. A row here gets no first zero row at start (gateCountsBegin), and the Gates
 * page says under it that it is not counted and why, instead of showing a false zero.
 * @typedef {keyof typeof WHY_A_SPOOL_ROW_WAITS} ASpoolRowWaits
 */
export const GATES_THE_SPOOL_WAITS_FOR = Object.freeze(/** @type {{gate: string, because: ASpoolRowWaits}[]} */ ([
  {gate: 'a-codex-command-is-checked', because: 'from-inside'},
  {gate: 'a-handshake-only-for-own-commands', because: 'from-inside'},
  {gate: 'a-run-is-filed-in-one-sandbox', because: 'from-inside'},
  {gate: 'launch-logs-stay-in-the-sandbox', because: 'from-inside'},
  {gate: 'plain-env-strips-the-launchers-variables', because: 'from-inside'},
  {gate: 'profiles-in-use-are-never-written', because: 'from-inside'},
  {gate: 'a-refused-message-is-said-another-way', because: 'at-the-runs-end'},
  {gate: 'a-world-copy-is-a-sound-database', because: 'from-inside'},
]).map(row => Object.freeze({...row, why: WHY_A_SPOOL_ROW_WAITS[row.because]})))

/**
 * THE SPOOL ROWS A CHECK INSIDE A CONTAINER MAY COUNT. Such a check prints a marked line, a fixed marker followed by
 * what `aGateCountLine` returns. The host side, tools/sandbox.mjs, reads it with `readAGateCountLine` and appends it
 * to the spool itself, and only for a gate on this list, since a container could print such a line for a command the
 * host never launched. A gate goes on it only if its check runs only under a command the host launched. None does:
 * each of the eight checks inside a container also runs where the host does not read, and GATES_THE_SPOOL_WAITS_FOR says
 * where. So it is empty.
 * @type {readonly string[]}
 */
export const GATES_COUNTED_FROM_INSIDE = Object.freeze([])
