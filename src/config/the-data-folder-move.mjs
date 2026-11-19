// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE DATA FOLDER: ONE `.env` LINE, AND A MOVE THAT STOPS, COPIES, CHECKS, SWITCHES AND STARTS.
 *
 * A person chooses where the office keeps its data at install, and may move it later from
 * Settings. The place is the database's folder, and the record of it is one line in the per-user `.env`:
 * `MOLE_OFFICE_DB=<data folder>/mole-office.db`. With no line the folder is the per-user folder's `data` folder, as
 * before. Nothing else records it (DF1).
 *
 * THIS MODULE IS THE ENGINE OF A MOVE. `mole-office data-folder move <place>` asks `whyAMoveThereIsRefused` first,
 * with the facts `theFactsOfAMove` gathers on this machine, and changes nothing on a refusal (DF4). Then it writes the
 * mark `data-folder-move.json` beside the `.env` before every step (DF5), stops the office, stopping the login unit
 * first when it runs (DF6), copies the folder with its hard links and without the service lock or the custom
 * portraits (DF7), makes and compares a SHA-256 list and runs SQLite's integrity check (DF8), switches the one `.env`
 * line (DF9), starts the office and waits until the runtime names the new database (DF10), and puts the line back and
 * starts the old folder if that start fails, when the stop before that start worked (DF11). Nothing in the old folder
 * changes before confirmation (DF12).
 *
 * THE START CHECKS ARE HERE TOO. While the mark says `stopping`, `copying`, `checking` or `switching` and the mover it
 * names is alive, `whyADataFolderMoveKeepsTheOfficeClosed` keeps the service command's start and the server's own start
 * out (DF13); a dead mover lets the start through because nothing was switched (DF14); and an unreadable mark keeps
 * the office closed, because it might be guarding a move (DF15). `confirmTheMove` removes only the old names whose
 * bytes still match and then the folders left empty, keeping and naming a folder it cannot remove (DF16), and it ends
 * a move stuck at `switched` when the mover it names has ended (DF21); `theEarlierDataFoldersOfTheMark` in
 * src/server/lib/the-earlier-data-folders.ts reads the mark's earlier data folders for `whereStoredFilesAreNow` in
 * src/server/api/files.ts, so no record is rewritten (DF17).
 *
 * IT OPENS NO DATABASE WHEN IT IS IMPORTED. A database is opened read-only, and only inside `whatTheCopyGotWrong`,
 * to run `PRAGMA integrity_check` on the copied file.
 *
 * THE CUSTOM PORTRAITS' FOLDER IS WRITTEN HERE AS A CONSTANT. It is `PORTRAITS_KEPT_HERE` in src/shared/portraits.ts,
 * and a `.ts` file cannot be imported by the service command's plain-node start. Keep the two spellings equal.
 */

import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statfsSync,
  statSync,
  writeSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, win32 } from 'node:path'

import { fsyncTheFolder, putTheBackupBack, setTheLine } from './env-file-line.mjs'
import { theRowIsAboutThisProcess } from './process-reader.mjs'
import { readTheProcessAt, theProcessAt } from './session-process.mjs'
import {
  DATA_ROOT,
  ENV_FILE,
  REPO_ROOT,
  databaseDirectoryFrom,
  databasePathFrom,
  envFileValues,
  serviceLockPathFrom,
  theEnvFileSuppliedThis,
} from './settings.mjs'
import { localStampOf } from './stopped-run-cause.mjs'
import { theRealWindowsCommands } from './systems/windows-commands.mjs'
import { THIS_PLATFORM, howAFullPathIsWritten, isAnAbsolutePath, thePathsOf, theSameSpelling } from './the-paths-of-a-system.mjs'

/** The mark's name, in the per-user folder, beside the `.env`. */
export const THE_MOVE_MARK = 'data-folder-move.json'

/** The states in which a move has not switched the line yet, so a start must stay out. */
/** @type {readonly MoveState[]} */
export const THE_STATES_THAT_KEEP_THE_OFFICE_CLOSED = ['stopping', 'copying', 'checking', 'switching']

/**
 * @typedef {'stopping' | 'copying' | 'checking' | 'switching' | 'switched' | 'started' | 'confirmed'
 *   | 'stopped-before-the-switch' | 'switched-back'} MoveState
 */

/**
 * @typedef {{ version: 1, from: string, to: string, database: string, state: MoveState,
 *   mover: { pid: number, startedAt: string }, earlier: string[], manifest: Record<string, string> | null,
 *   says: string | null, at: string }} TheMoveMark
 */

/** @typedef {{ relative: string, path: string, identity: string }} AName */
/** @typedef {{ path: string, links: number, size: number, found: number }} AFile */
/** @typedef {{ names: AName[], files: Map<string, AFile>, bytes: number }} AWalk */

/** @typedef {{ state: 'absent' } | { state: 'unreadable', why: string } | { state: 'read', mark: TheMoveMark }} AMarkRead */

/**
 * The start-at-login reading's type, read from its own file by this JSDoc import only. This file is loaded by the
 * service command, which the reading's file imports, so a run-time import here would be a cycle.
 * @typedef {import('./start-at-login.mjs').StartAtLoginReading} StartAtLoginReading
 */

/**
 * What the stop is given about the login unit: the word systemd says for enabled and the word it says for active.
 * @typedef {Pick<StartAtLoginReading, 'enabledWord' | 'activeWord'>} UnitReading
 */

/**
 * What the move's refusal reads about the login unit: its file, the word systemd says for enabled, and the word for
 * active.
 * @typedef {Pick<StartAtLoginReading, 'unit' | 'unitPath' | 'startsAtLogin' | 'activeWord'>} LoginUnit
 */

/**
 * The folder the custom portraits are kept in, relative to `DATA_ROOT`. It is `PORTRAITS_KEPT_HERE` in
 * src/shared/portraits.ts, repeated here because that `.ts` file cannot be imported by the service command's
 * plain-node start.
 */
const THE_CUSTOM_PORTRAITS_FOLDER = 'data/portraits/custom'

/** One MiB, the piece a file is hashed in, because a database can be over 2 GiB. */
const A_PIECE = 1024 * 1024

/** The names this move refuses to walk, or refuses a place for, whose words a person reads. */

// ============================================================ paths and files

/**
 * Flush one copied file. Windows flushes a file only through a handle opened for writing, so the handle is
 * opened for reading and writing there. On Linux and the Mac a handle opened for reading is enough, and a
 * read-only copy allows it. `calls` are the file calls, which a test hands in to stand for the platform's.
 * @param {string} path
 * @param {string} [platform]
 * @param {{ openSync: (path: string, flags: string) => number, fsyncSync: (fd: number) => void, closeSync: (fd: number) => void }} [calls]
 */
export function syncTheFile(path, platform = THIS_PLATFORM, calls = { openSync, fsyncSync, closeSync }) {
  const fd = calls.openSync(path, platform === 'win32' ? 'r+' : 'r')
  try { calls.fsyncSync(fd) } finally { calls.closeSync(fd) }
}

/**
 * A folder and every folder above it that does not exist, each made with mode 700 on Linux and the Mac, then flushed.
 * @param {string} folder
 * @param {boolean} [flush] false when the caller flushes later
 */
function makeTheFolder(folder, flush = true) {
  if (existsSync(folder)) return
  makeTheFolder(dirname(folder), flush)
  mkdirSync(folder, { mode: 0o700 })
  if (THIS_PLATFORM !== 'win32') chmodSync(folder, 0o700)
  if (flush) fsyncTheFolder(folder)
}

/** An error's own words, for a sentence. @param {unknown} error */
function saysOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/** An error's code alone, or its words when it has no code. @param {unknown} error */
function codeOf(error) {
  const code = typeof error === 'object' && error !== null ? /** @type {{ code?: unknown }} */ (error).code : undefined
  return typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? code : saysOf(error)
}

/** @param {string} path */
function theHashOfBytes(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * One file's SHA-256, read one MiB at a time, so a database over 2 GiB is read without being held whole.
 * @param {string} path
 * @returns {string}
 */
function theHashOfAFile(path) {
  const hash = createHash('sha256')
  const piece = Buffer.allocUnsafe(A_PIECE)
  const fd = openSync(path, 'r')
  try {
    for (;;) {
      const count = readSync(fd, piece, 0, A_PIECE, null)
      if (count <= 0) break
      hash.update(piece.subarray(0, count))
    }
  } finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

/**
 * Whether `child` is `parent` or is inside it, written the way that system writes paths.
 * @param {string} child
 * @param {string} parent
 * @param {string} platform
 * @returns {boolean}
 */
function isAtOrInside(child, parent, platform) {
  const paths = thePathsOf(platform)
  const from = paths.resolve(parent)
  const at = paths.resolve(child)
  if (theSameSpelling(from, at, platform)) return true
  const rest = paths.relative(from, at)
  return rest !== '' && rest !== '..' && !rest.startsWith(`..${paths.sep}`) && !paths.isAbsolute(rest)
}

/** The database's folder and file name, and the folder holding the custom portraits, for one environment. */

/**
 * The names a walk does not enter: the service lock, and the custom portraits folder when it is inside `folder`.
 * @param {string} folder
 * @param {string} database
 * @param {string} [dataRoot] the folder the custom portraits are kept in
 * @returns {string[]}
 */
export function theLeaveOutOf(folder, database, dataRoot = DATA_ROOT) {
  const leaveOut = [basename(serviceLockPathFrom({ MOLE_OFFICE_DB: join(folder, database) }))]
  const portraits = join(dataRoot, THE_CUSTOM_PORTRAITS_FOLDER)
  const inside = relative(folder, portraits)
  if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) leaveOut.push(inside)
  return leaveOut
}

// ============================================================ the mark

/**
 * Where the move's mark is: beside the `.env` the place is read from.
 * @param {string} [envFile]
 * @returns {string}
 */
export function theMoveMarkPath(envFile = ENV_FILE) {
  return join(dirname(envFile), THE_MOVE_MARK)
}

/** The name of the file the mover's own output goes to, beside the mark in the per-user folder. */
export const THE_MOVER_LOG = 'data-folder-move.log'

/**
 * WHERE THE MOVER'S OUTPUT GOES: beside the mark, in the per-user folder.
 *
 * It is not the service log, which is beside the database: the mover copies that folder, and a log written into a
 * folder while it is copied is a file that can differ between the old folder and the copy.
 * @param {string} [markPath]
 * @returns {string}
 */
export function theMoverLogPath(markPath = theMoveMarkPath()) {
  return join(dirname(markPath), THE_MOVER_LOG)
}

/**
 * Whether a value read from the mark file is a mark this version writes.
 * @param {unknown} value
 * @returns {TheMoveMark | null}
 */
function aMarkVersionOne(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  /** @type {Record<string, unknown>} */
  const mark = /** @type {Record<string, unknown>} */ (value)
  if (mark['version'] !== 1) return null
  for (const field of ['from', 'to', 'database', 'state', 'at']) {
    if (typeof mark[field] !== 'string' || mark[field] === '') return null
  }
  if (!THE_STATES_THAT_KEEP_THE_OFFICE_CLOSED.concat(['switched', 'started', 'confirmed', 'stopped-before-the-switch', 'switched-back']).includes(/** @type {MoveState} */ (mark['state']))) return null
  const mover = mark['mover']
  if (mover === null || typeof mover !== 'object' || Array.isArray(mover)) return null
  const held = /** @type {Record<string, unknown>} */ (mover)
  if (!Number.isSafeInteger(held['pid']) || Number(held['pid']) <= 0 || typeof held['startedAt'] !== 'string') return null
  const earlier = mark['earlier']
  if (!Array.isArray(earlier) || earlier.some((one) => typeof one !== 'string')) return null
  const manifest = mark['manifest']
  if (manifest !== null && (typeof manifest !== 'object' || Array.isArray(manifest)
    || Object.values(manifest).some((one) => typeof one !== 'string'))) return null
  if (mark['says'] !== null && typeof mark['says'] !== 'string') return null
  return /** @type {TheMoveMark} */ (mark)
}

/**
 * READ THE MARK, or say it is absent or cannot be read.
 * @param {string} markPath
 * @returns {AMarkRead}
 */
export function readTheMoveMark(markPath) {
  if (!existsSync(markPath)) return { state: 'absent' }
  let value
  try {
    value = JSON.parse(readFileSync(markPath, 'utf8'))
  } catch (error) {
    return { state: 'unreadable', why: saysOf(error) }
  }
  const mark = aMarkVersionOne(value)
  return mark === null ? { state: 'unreadable', why: 'it is not a mark this version writes' } : { state: 'read', mark }
}

/**
 * WRITE THE MARK WHOLE: a new file beside it with mode 600, flushed, renamed over the name a start reads, and the
 * folder flushed. A start sees the old mark or the new one, never half of one.
 * @param {string} markPath
 * @param {Omit<TheMoveMark, 'version'> & { version?: 1 }} mark
 * @returns {string}
 */
export function writeTheMoveMark(markPath, mark) {
  const writing = `${markPath}.writing-${process.pid}`
  const fd = openSync(writing, 'w', 0o600)
  try {
    writeSync(fd, `${JSON.stringify({ version: 1, ...mark })}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  chmodSync(writing, 0o600)
  renameSync(writing, markPath)
  fsyncTheFolder(dirname(markPath))
  return markPath
}

/**
 * THE EARLIER DATA FOLDERS A MARK NAMES, without the folder the office runs from at that state (DF16). From `switched`
 * on that is the new folder. Before it, and after a switch back, it is the old one. Without this, a move back to an
 * earlier folder would list the folder in use among the earlier ones.
 * @param {string[]} earlier
 * @param {MoveState} state
 * @param {{ from: string, to: string }} move
 * @returns {string[]}
 */
export function theEarlierFoldersOf(earlier, state, move) {
  const paths = thePathsOf(THIS_PLATFORM)
  const inUse = paths.resolve(state === 'switched' || state === 'started' || state === 'confirmed' ? move.to : move.from)
  return earlier.filter((one) => !theSameSpelling(paths.resolve(one), inUse, THIS_PLATFORM))
}

// ============================================================ where the data is

/**
 * WHERE THE DATA IS, and which of the three chose it: the process environment, the `.env` line, or the default.
 * A name a `.env` load put into `process.env` is the `.env` line and not the process environment.
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [envFile]
 * @returns {{ folder: string, database: string, chosenBy: 'the process environment' | 'the .env line' | 'the default' }}
 */
export function whereTheDataIs(processEnv = process.env, envFile = ENV_FILE) {
  const inTheProcess = processEnv['MOLE_OFFICE_DB'] !== undefined
  const theFilePutItThere = theEnvFileSuppliedThis('MOLE_OFFICE_DB', envFile)
  if (inTheProcess && !theFilePutItThere) {
    const database = databasePathFrom(processEnv)
    return { folder: databaseDirectoryFrom(database), database: basename(database), chosenBy: 'the process environment' }
  }
  const values = envFileValues(envFile)
  if (Object.hasOwn(values, 'MOLE_OFFICE_DB') || theFilePutItThere) {
    const database = databasePathFrom(theFilePutItThere ? processEnv : values)
    return { folder: databaseDirectoryFrom(database), database: basename(database), chosenBy: 'the .env line' }
  }
  const database = databasePathFrom({})
  return { folder: databaseDirectoryFrom(database), database: basename(database), chosenBy: 'the default' }
}

/**
 * The second line of `data-folder where`: which of the three chose the place.
 * @param {'the process environment' | 'the .env line' | 'the default'} chosenBy
 * @returns {string}
 */
export function theChosenByWords(chosenBy) {
  if (chosenBy === 'the process environment') return 'The process environment chose it.'
  if (chosenBy === 'the .env line') return 'The .env line chose it.'
  return 'Nothing chose it, so it is the default.'
}

// ============================================================ the mover's environment

/**
 * THE ENVIRONMENT THE MOVER IS HANDED: a copy of this process's environment without every name the `.env` load
 * supplied. Nothing is merged back in.
 *
 * IT IS NOT `theEnvironmentTheRestartHandsTheService`, which merges the current `.env` back in. That one is right for
 * a restart, which starts a server that reads the file itself. The mover is the process that switches the line, and
 * the merge would hand it the old `MOLE_OFFICE_DB` as a process variable: the move's own check refuses a place when
 * the process environment decides the database, and every start the mover made would be handed the old database
 * whatever the line said.
 *
 * A name the shell set, which no `.env` load supplied, is kept as it is.
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {Record<string, string | undefined>}
 */
export function theEnvironmentTheMoverIsHanded(processEnv = process.env, file = ENV_FILE) {
  /** @type {Record<string, string | undefined>} */
  const handed = {}
  for (const [name, value] of Object.entries(processEnv)) {
    if (!theEnvFileSuppliedThis(name, file)) handed[name] = value
  }
  return handed
}

// ============================================================ is the mover alive

/**
 * When the process under a pid began, written the way a mark writes its mover's own start.
 * @param {number} pid
 * @returns {string}
 */
function theStartOfTheProcessAt(pid) {
  const at = theProcessAt(pid)
  if (!at.here || at.startedAt === null) throw new Error(theProcessStartCannotBeReadWords(pid))
  return localStampOf(new Date(at.startedAt))
}

/**
 * Whether the process a mark names is still the one that wrote the mark: the same pid, started at the same moment.
 * @param {{ pid: number, startedAt: string }} mover
 * @returns {boolean}
 */
export function theMoverIsAlive(mover) {
  if (mover === null || typeof mover !== 'object' || !Number.isSafeInteger(mover.pid) || mover.pid <= 0
    || typeof mover.startedAt !== 'string') return false
  const at = theProcessAt(mover.pid)
  if (!at.here || at.startedAt === null) return false
  return theRowIsAboutThisProcess(mover.startedAt, { startedAt: localStampOf(new Date(at.startedAt)) }).same === true
}

/**
 * The same answer, read without holding the thread where the reader has a way to (Windows: `readProcessAt`).
 * @param {{ pid: number, startedAt: string }} mover
 * @returns {Promise<boolean>}
 */
export async function readWhetherTheMoverIsAlive(mover) {
  if (mover === null || typeof mover !== 'object' || !Number.isSafeInteger(mover.pid) || mover.pid <= 0
    || typeof mover.startedAt !== 'string') return false
  const at = await readTheProcessAt(mover.pid)
  if (!at.here || at.startedAt === null) return false
  return theRowIsAboutThisProcess(mover.startedAt, { startedAt: localStampOf(new Date(at.startedAt)) }).same === true
}

// ============================================================ sentences a person reads

/** @param {unknown} to @param {string} platform */
export function thePlaceIsNotAFullPathWords(to, platform) {
  return `The place ${JSON.stringify(to)} is not a full path written the way this system writes one (${howAFullPathIsWritten('data-folder', platform)}), so the move was refused and nothing was changed.`
}

/** @param {string} to */
export function thePlaceIsNotEmptyWords(to) {
  return `The place ${to} is there and is not an empty folder, so the move was refused and nothing was changed.`
}

/** @param {string} to @param {string} from @param {'same' | 'inside' | 'holds'} relation */
export function thePlaceIsAroundTheDataFolderWords(to, from, relation) {
  if (relation === 'same') return `The place ${to} is the data folder, so the move was refused and nothing was changed.`
  if (relation === 'inside') return `The place ${to} is inside the data folder ${from}, so the move was refused and nothing was changed.`
  return `The place ${to} holds the data folder ${from}, so the move was refused and nothing was changed.`
}

/** @param {string} to @param {string} installFolder */
export function thePlaceIsInTheInstallFolderWords(to, installFolder) {
  return `The place ${to} is inside the install folder ${installFolder}, which an update deletes, so the move was refused and nothing was changed.`
}

/** @param {string} to */
export function thePlaceHasNoFolderWords(to) {
  return `The folder that would hold ${to} does not exist, so the move was refused and nothing was changed.`
}

/** @param {string} to @param {number} freeBytes @param {number} folderBytes */
export function thePlaceHasTooLittleRoomWords(to, freeBytes, folderBytes) {
  return `The drive of ${to} has ${String(freeBytes)} free bytes and the data folder holds ${String(folderBytes)} bytes, so the move was refused and nothing was changed.`
}

export function theProcessEnvironmentDecidesWords() {
  return 'MOLE_OFFICE_DB is set by the process environment, so a .env line would not decide where the data folder is; the move was refused and nothing was changed.'
}

/** @param {string} markPath @param {TheMoveMark} mark */
export function theMoveIsStillRunningWords(markPath, mark) {
  return `A data folder move is still running: the mark ${markPath} says ${mark.state} and the process ${String(mark.mover.pid)} that is moving the data folder from ${mark.from} to ${mark.to} is still alive, so the move was refused and nothing was changed.`
}

/** @param {string} markPath @param {TheMoveMark} mark */
export function theMoveIsNotConfirmedWords(markPath, mark) {
  return `A data folder move switched the office to ${mark.to} and has not been confirmed: the mark ${markPath} says ${mark.state}, so the move was refused and nothing was changed.`
}

/** @param {string} markPath @param {string} why */
export function theUnreadableMarkWords(markPath, why) {
  return `The data folder move mark ${markPath} cannot be read (${why}), so whether a move is running is not known; remove it when no move is running.`
}

/** @param {string} markPath @param {string} why */
export function theOfficeStaysClosedForAnUnreadableMarkWords(markPath, why) {
  return `The office stays closed because the data folder move mark ${markPath} cannot be read (${why}); remove it when no move is running.`
}

/** @param {string} to @param {string} folder @param {string} variable */
export function theWindowsPlaceIsInTheTemporaryFolderWords(to, folder, variable) {
  return `The place ${to} is in this user's temporary folder ${folder}, which ${variable} names; Disk Cleanup and Storage Sense delete files there, so the move was refused and nothing was changed.`
}

/**
 * The sentence a network place is refused with (DF4).
 * @param {string} to
 * @param {string | null} drive the drive Windows reports as a network drive, or null for a UNC path
 */
export function theWindowsPlaceIsOnANetworkWords(to, drive) {
  const where = drive === null ? `The place ${to} is a network path.` : `The place ${to} is on ${drive}, which Windows reports as a network drive.`
  return `${where} The office's database keeps a write-ahead log, which does not work on a network share, so the move was refused and nothing was changed.`
}

/**
 * The sentence a place is refused with when Windows cannot tell what kind of drive it is on (DF4).
 * @param {string} to
 * @param {string} drive
 * @param {string} why what Windows answered, or why it could not be asked
 */
export function theWindowsDriveCannotBeToldWords(to, drive, why) {
  return `The place ${to} is on ${drive}, and Windows could not tell what kind of drive that is (${why}). It may be a network drive, where the office's database cannot keep its write-ahead log, so the move was refused and nothing was changed.`
}

/**
 * THE SENTENCE A MOVE IS REFUSED WITH WHILE THE LOGIN UNIT WOULD START THE OLD FOLDER (DF4). It says what systemd says
 * of the unit, that the unit names the database it opens so an office it starts would open the old folder's database,
 * that the move was refused and nothing was changed, and what to do. A unit that runs says so, because the office runs
 * from it now and the person has to start the computer again to have the window start the office without it.
 * @param {LoginUnit} loginUnit
 * @returns {string}
 */
export function theLoginUnitKeepsTheOldFolderWords(loginUnit) {
  const running = theLoginUnitIsRunning(loginUnit.activeWord)
  const systemdSays =
    loginUnit.startsAtLogin === true
      ? 'Start at login is on.'
      : loginUnit.startsAtLogin === null
        ? 'systemd does not say that start at login is off.'
        : null
  const theUnitNamesTheDatabase = `The login unit ${loginUnit.unitPath} names the database it opens, so an office it starts after the move would open the database in the old folder.`
  const whatToDo = running
    ? 'The office runs from that unit now, so turn start at login off in Settings, then start the computer again and open Mole Office, because the window then starts the office without the unit; then move the data folder, and turn start at login on again, which writes the unit for the new folder.'
    : 'Turn start at login off in Settings, move the data folder, and then turn start at login on again, which writes the unit for the new folder.'
  return `${systemdSays === null ? '' : `${systemdSays} `}${theUnitNamesTheDatabase} The move was refused and nothing was changed. ${whatToDo}`
}

/** @param {string} folder @param {string} name @param {string} path */
export function theFolderHoldsASymbolicLinkWords(folder, name, path) {
  return `The data folder ${folder} holds the symbolic link ${name} (${path}), so it cannot be moved whole and nothing was changed.`
}

/** @param {string} folder @param {string} name */
export function theFolderHoldsASpecialFileWords(folder, name) {
  return `The data folder ${folder} holds ${name}, which is not an ordinary file or a folder, so it cannot be moved whole and nothing was changed.`
}

/** @param {string} path @param {number} links @param {number} found */
export function theFileHasMoreNamesWords(path, links, found) {
  return `The file ${path} has ${String(links)} names and the walk met ${String(found)} of them inside the folder, so the folder cannot be moved whole and nothing was changed.`
}

/** @param {string} from @param {string} to @param {string} name @param {string} code */
export function theCopyFailedWords(from, to, name, code) {
  return `The file ${name} could not be copied from ${from} into ${to} (${code}), so the move stopped and nothing was switched.`
}

/** @param {string} from @param {string} to @param {string} name */
export function theCopyIsMissingWords(from, to, name) {
  return `The copy of ${from} into ${to} is missing ${name}, so the move stopped before the switch and nothing was switched.`
}

/** @param {string} from @param {string} to @param {string} name */
export function theCopyDiffersWords(from, to, name) {
  return `The copy of ${from} into ${to} holds different bytes for ${name}, so the move stopped before the switch and nothing was switched.`
}

/** @param {string} from @param {string} to @param {string} name */
export function theCopySplitAFileWords(from, to, name) {
  return `The old folder ${from} held ${name} as one file with several names, and the copy in ${to} holds them as separate files, so the move stopped before the switch and nothing was switched.`
}

/** @param {string} from @param {string} to @param {string} name */
export function theCopyHasAnExtraNameWords(from, to, name) {
  return `The copy of ${from} into ${to} holds ${name}, which the old folder did not, so the move stopped before the switch and nothing was switched.`
}

/** @param {string} database @param {string} why */
export function theCopiedDatabaseCouldNotBeCheckedWords(database, why) {
  return `The copied database ${database} could not be checked (${why}), so the move stopped before the switch and nothing was switched.`
}

/** @param {string} database @param {string} says */
export function theCopiedDatabaseIsNotIntactWords(database, says) {
  return `The copied database ${database} did not pass SQLite's integrity check (${says}), so the move stopped before the switch and nothing was switched.`
}

/** @param {string} database @param {string} envFile */
export function theDataFolderWasChosenWords(database, envFile) {
  return `The data folder was chosen as ${dirname(database)}, and ${envFile} now names ${database}.`
}

/** @param {unknown} place @param {string} platform */
export function theChoosePlaceIsNotAFullPathWords(place, platform) {
  return `The place ${JSON.stringify(place)} is not a full path written the way this system writes one (${howAFullPathIsWritten('data-folder', platform)}), so nothing was written.`
}

/** @param {string} place */
export function theChoosePlaceIsNotAFolderWords(place) {
  return `The place ${place} is not a folder, so nothing was written.`
}

/** @param {string} folder @param {string} database */
export function theChooseAlreadyHasADatabaseWords(folder, database) {
  return `A database is already at ${join(folder, database)}, so this is not a first install and nothing was written.`
}

/** @param {string} place */
export function theChoosePlaceHoldsFilesWords(place) {
  return `The place ${place} holds files and no mole-office.db, so nothing was written.`
}

/** @param {string} markPath @param {TheMoveMark} mark */
export function theOfficeStaysClosedWords(markPath, mark) {
  return `The office stays closed because the data folder move recorded in ${markPath} is ${mark.state}: it is moving the data folder from ${mark.from} to ${mark.to}, and the process that is moving it is still running.`
}

/** @param {string} markPath @param {string} state */
export function theConfirmNeedsAStartedMoveWords(markPath, state) {
  return `The old data folder can be removed only after the move is confirmed, and the mark ${markPath} says ${state} rather than started, so nothing was removed.`
}

/** @param {string} markPath @param {string} from @param {string} why */
export function theOldFolderCannotBeReadWords(markPath, from, why) {
  return `The old data folder ${from} cannot be read, so nothing was removed and the move recorded in ${markPath} is not confirmed: ${why}`
}

/** @param {string} markPath @param {string} wanted @param {string} inUse */
export function theConfirmNeedsTheNewDatabaseWords(markPath, wanted, inUse) {
  return `The mark ${markPath} moved the data folder to ${wanted}, and the office in use names ${inUse}, so nothing was removed.`
}

/**
 * THE CONFIRM'S REFUSAL WHILE THE MOVER THAT SWITCHED THE OFFICE IS STILL ALIVE (DF21). It says the mover is still
 * running and may still switch the office back, so nothing was removed, and the confirm can be pressed again once
 * the mover has ended.
 * @param {string} markPath
 * @param {number} pid
 * @returns {string}
 */
export function theConfirmWaitsForTheMoverWords(markPath, pid) {
  return `The data folder move recorded in ${markPath} says switched and the process ${String(pid)} that is moving the data folder is still running, so it may still switch the office back; nothing was removed, and the confirm can be pressed again once that process has ended.`
}

/**
 * WHY THE START ON THE NEW DATA FOLDER WAS NOT TAKEN: the reason the switch-back sentence puts in its brackets. It
 * says the office named another database, or that it named none before the wait ran out.
 * @param {string | null} runtime the database the office named, or null when it named none before the wait ran out
 * @param {string} newDatabase the database the move switched the `.env` to
 * @returns {string}
 */
export function whyTheNewStartWasNotTaken(runtime, newDatabase) {
  if (runtime === null) return 'the office did not say which database it uses before the wait ran out'
  return `the office names ${String(runtime)} rather than ${newDatabase}`
}

/**
 * THE SWITCH-BACK'S SENTENCE, built from what happened after the start on the new folder was not taken. It says the
 * `.env` was put back only when it was, and that the office was started only when that start answered.
 * @param {string} markPath
 * @param {string} from the old data folder
 * @param {string} reasons why the start on the new data folder was not taken
 * @param {string | null} notPutBack why the `.env` backup could not be put back, or null when it was put back
 * @param {{ ok: boolean, says: string }} started the start after the switch-back
 * @returns {string}
 */
export function theMoveWasSwitchedBackWords(markPath, from, reasons, notPutBack, started) {
  const theLine = theEnvWasPutBackWords(notPutBack)
  if (notPutBack === null && started.ok) {
    return `The office did not start on the new data folder (${reasons}), so the .env was put back and the office was started from ${from}; the mark ${markPath} says switched-back and the old folder is kept.`
  }
  const theOffice = started.ok ? 'The office was started again from the folder the .env names.' : theOfficeDidNotStartAgainWords(started.says)
  return `The office did not start on the new data folder (${reasons}), ${theLine}. ${theOffice} The mark ${markPath} says switched-back and the old folder is kept.`
}

/**
 * THE PIECE OF BOTH SWITCH-BACK SENTENCES that says what happened to the `.env`: put back, or not and why.
 * @param {string | null} notPutBack why the `.env` backup could not be put back, or null when it was put back
 * @returns {string}
 */
function theEnvWasPutBackWords(notPutBack) {
  return notPutBack === null ? 'so the .env was put back' : `and the .env could not be put back (${notPutBack})`
}

/**
 * THE SWITCH-BACK'S SENTENCE WHEN THE STOP BEFORE THE OLD START FAILED (DF11). It says the office did not start on
 * the new folder, what happened to the `.env`, that the office could not be stopped so nothing was started, that an
 * office may still be running from `to`, and that the mark says switched-back with the old folder kept.
 * @param {string} markPath
 * @param {string} to the new data folder
 * @param {string} reasons why the start on the new data folder was not taken
 * @param {string | null} notPutBack why the `.env` backup could not be put back, or null when it was put back
 * @param {string} stopSays the failed stop's own words
 * @returns {string}
 */
export function theSwitchBackCouldNotStopWords(markPath, to, reasons, notPutBack, stopSays) {
  return `The office did not start on the new data folder (${reasons}), ${theEnvWasPutBackWords(notPutBack)}. The office could not be stopped to start it from the old folder (${stopSays}), so nothing was started, and an office may still be running from ${to}. The mark ${markPath} says switched-back and the old folder is kept.`
}

/**
 * WHAT A MOVE THAT ENDED EARLY ADDS when the office's start after it fails.
 * @param {string} why the start's own words
 * @returns {string}
 */
export function theOfficeDidNotStartAgainWords(why) {
  return `Then the office did not start again, so it is stopped. ${why}`
}

/** @param {string} envFile @param {string} database */
export function theOfficeWasSwitchedWords(envFile, database) {
  return `The .env ${envFile} now names ${database}. The old data folder is kept until the move is confirmed.`
}

/** @param {string} markPath @param {string} database */
export function theMoveWasStartedWords(markPath, database) {
  return `The office is running from the new data folder and names ${database}; the mark ${markPath} says started and the old folder is kept until the move is confirmed.`
}

/** @param {string} markPath @param {string} from */
export function theMoveWasConfirmedWords(markPath, from) {
  return `The old data folder ${from} was confirmed and is now one of the earlier data folders; the mark ${markPath} says confirmed.`
}

/** @param {string} state */
export function theMoveDidNotFinishWords(state) {
  return `The data folder move did not finish: its mark says ${state}, so nothing more was done.`
}

/** @param {number} pid */
export function theProcessStartCannotBeReadWords(pid) {
  return `The start time of process ${String(pid)} could not be read, so the data folder move did not begin and nothing was changed.`
}

/** @param {number} code */
export function theServiceStopFailedWords(code) {
  return `The office did not stop: mole-office stop answered ${String(code)}, so the data folder was not moved and nothing was changed.`
}

/** @param {number} code */
export function theServiceStartFailedWords(code) {
  return `The office did not start: mole-office start answered ${String(code)}.`
}

// ============================================================ the walk, the manifest and the copy

/**
 * EVERY NAME UNDER A FOLDER, each with its file's identity, and each file once. A symbolic link or a special file is
 * refused in a sentence, and so is a file whose link count is more than the names the walk met, because the move
 * cannot carry it whole. `leaveOut` names relative paths the walk does not enter.
 * @param {string} folder
 * @param {string[]} [leaveOut]
 * @returns {AWalk}
 */
export function theFilesOf(folder, leaveOut = []) {
  /** @type {AName[]} */
  const names = []
  /** @type {Map<string, AFile>} */
  const files = new Map()
  const leftOut = (/** @type {string} */ relativeName) => leaveOut.some((one) => relativeName === one || relativeName.startsWith(`${one}/`))

  /** @param {string} folderAt @param {string} prefix */
  function visit(folderAt, prefix) {
    for (const name of readdirSync(folderAt).sort()) {
      const relativeName = prefix + name
      if (leftOut(relativeName)) continue
      const path = join(folderAt, name)
      const stats = lstatSync(path)
      if (stats.isSymbolicLink()) throw new Error(theFolderHoldsASymbolicLinkWords(folder, relativeName, path))
      if (stats.isDirectory()) {
        visit(path, `${relativeName}/`)
        continue
      }
      if (!stats.isFile()) throw new Error(theFolderHoldsASpecialFileWords(folder, relativeName))
      const identity = `${String(stats.dev)}:${String(stats.ino)}`
      const file = files.get(identity) ?? { path, links: stats.nlink, size: stats.size, found: 0 }
      file.found += 1
      files.set(identity, file)
      names.push({ relative: relativeName, path, identity })
    }
  }

  visit(folder, '')
  for (const file of files.values()) {
    if (file.found !== file.links) throw new Error(theFileHasMoreNamesWords(file.path, file.links, file.found))
  }
  return { names, files, bytes: [...files.values()].reduce((sum, file) => sum + file.size, 0) }
}

/**
 * THE SHA-256 OF EVERY NAME, by relative name. A file with several names is read once.
 * @param {string} folder
 * @param {AWalk} walk
 * @returns {Record<string, string>}
 */
export function theManifestOf(folder, walk) {
  /** @type {Map<string, string>} */
  const hashes = new Map()
  /** @type {Record<string, string>} */
  const manifest = {}
  for (const name of walk.names) {
    let hash = hashes.get(name.identity)
    if (hash === undefined) {
      hash = theHashOfAFile(join(folder, name.relative))
      hashes.set(name.identity, hash)
    }
    manifest[name.relative] = hash
  }
  return manifest
}

/**
 * COPY THE FOLDER WHOLE: each file once, its other names made as hard links to the copy, every file and folder
 * flushed, and each new folder mode 700 on Linux and the Mac. The lock and the custom portraits are not in `walk`.
 * @param {string} from
 * @param {string} to
 * @param {AWalk} walk
 */
export function copyTheFolder(from, to, walk) {
  makeTheFolder(to)
  /** @type {Map<string, string>} */
  const firstCopy = new Map()
  for (const name of walk.names) {
    const source = join(from, name.relative)
    const target = join(to, name.relative)
    makeTheFolder(dirname(target), false)
    const already = firstCopy.get(name.identity)
    try {
      if (already === undefined) {
        copyFileSync(source, target, constants.COPYFILE_EXCL)
        firstCopy.set(name.identity, target)
      } else {
        linkSync(already, target)
      }
      syncTheFile(target)
    } catch (error) {
      throw new Error(theCopyFailedWords(from, to, name.relative, codeOf(error)))
    }
  }
  const folders = new Set([to])
  for (const name of walk.names) {
    let folder = dirname(join(to, name.relative))
    while (folder.startsWith(to) && !folders.has(folder)) {
      folders.add(folder)
      const up = dirname(folder)
      if (up === folder) break
      folder = up
    }
  }
  for (const folder of folders) fsyncTheFolder(folder)
}

/**
 * WHAT THE COPY GOT WRONG, or null when it is whole. The first name missing, differing or split from a file that was
 * one file is named; then SQLite's integrity check on the copied database must answer `ok`.
 * @param {string} from
 * @param {string} to
 * @param {Record<string, string>} manifest
 * @param {AWalk} walk
 * @param {string} database
 * @returns {string | null}
 */
export function whatTheCopyGotWrong(from, to, manifest, walk, database) {
  /** @type {AWalk} */
  let copied
  try {
    copied = theFilesOf(to, [])
  } catch (error) {
    return saysOf(error)
  }
  /** @type {Map<string, AName>} */
  const byName = new Map()
  for (const name of copied.names) byName.set(name.relative, name)
  /** @type {Map<string, string[]>} */
  const oldGroups = new Map()
  for (const name of walk.names) {
    const group = oldGroups.get(name.identity) ?? []
    group.push(name.relative)
    oldGroups.set(name.identity, group)
  }
  /** @type {Map<string, string>} */
  const hashes = new Map()
  for (const [name, expected] of Object.entries(manifest)) {
    const found = byName.get(name)
    if (found === undefined) return theCopyIsMissingWords(from, to, name)
    let hash = hashes.get(found.identity)
    if (hash === undefined) {
      hash = theHashOfAFile(found.path)
      hashes.set(found.identity, hash)
    }
    if (hash !== expected) return theCopyDiffersWords(from, to, name)
  }
  for (const name of byName.keys()) {
    if (!Object.hasOwn(manifest, name)) return theCopyHasAnExtraNameWords(from, to, name)
  }
  for (const group of oldGroups.values()) {
    if (group.length < 2) continue
    const identities = new Set(group.map((name) => byName.get(name)?.identity))
    if (identities.size !== 1) return theCopySplitAFileWords(from, to, group[0] ?? '')
  }
  const copiedDatabase = join(to, database)
  try {
    // Loaded here, not at the top: the service command imports this module, and the service command must load from a checkout with no packages installed.
    const Database = /** @type {typeof import('better-sqlite3')} */ (createRequire(import.meta.url)('better-sqlite3'))
    const db = new Database(copiedDatabase, { readonly: true })
    try {
      const rows = /** @type {unknown} */ (db.pragma('integrity_check'))
      const first = Array.isArray(rows) && rows.length > 0 ? Object.values(/** @type {Record<string, unknown>} */ (rows[0]))[0] : null
      if (first !== 'ok') return theCopiedDatabaseIsNotIntactWords(copiedDatabase, String(first))
    } finally {
      db.close()
    }
  } catch (error) {
    return theCopiedDatabaseCouldNotBeCheckedWords(copiedDatabase, saysOf(error))
  }
  return null
}

// ============================================================ the facts a refusal is handed

/**
 * The free bytes of the drive the nearest folder above `path` is on.
 * @param {string} path
 * @returns {number}
 */
function theFreeBytesAbove(path) {
  let folder = path === '' ? '.' : path
  for (;;) {
    if (existsSync(folder)) break
    const up = dirname(folder)
    if (up === folder) break
    folder = up
  }
  const stats = statfsSync(folder)
  return Number(stats.bavail) * Number(stats.bsize)
}

// ============================================================ the folders a place may not be in on Windows

/** The variables that name this user's temporary folder on Windows. */
export const THE_TEMPORARY_FOLDER_VARIABLES = ['TEMP', 'TMP']

/**
 * A folder a data folder may not be in on Windows, the variable that names it, and the names it is
 * compared by: the folder the variable writes and, when it differs, its long name.
 * @typedef {{ kind: 'temporary', variable: string, folder: string, names: string[] }} ARefusedFolder
 */

/**
 * THE FOLDERS A DATA FOLDER IS REFUSED IN ON WINDOWS (DF4): the temporary folder,
 * as this user's environment names it. A variable that is not set, or whose value does not begin with a
 * drive letter, a colon and a backslash, names no folder. A variable may name a folder in short 8.3 names,
 * so a folder is compared by the name its variable writes and by the long name too when that differs. Two
 * variables that name one folder give the first entry, because one refusal is enough for it.
 * @param {Record<string, string | undefined>} processEnv
 * @param {(folder: string) => string | null} longNameOf
 * @returns {ARefusedFolder[]}
 */
export function theFoldersADataFolderIsRefusedIn(processEnv, longNameOf) {
  /** @type {ARefusedFolder[]} */
  const folders = []
  /**
   * @param {'temporary'} kind
   * @param {string} variable
   */
  const add = (kind, variable) => {
    const value = processEnv[variable]
    if (typeof value !== 'string' || !/^[A-Za-z]:\\/.test(value)) return
    const folder = win32.resolve(value)
    if (folders.some((one) => theSameSpelling(one.folder, folder, 'win32'))) return
    const names = [folder]
    const longName = longNameOf(folder)
    if (typeof longName === 'string' && !theSameSpelling(longName, folder, 'win32')) names.push(longName)
    folders.push({ kind, variable, folder, names })
  }
  for (const variable of THE_TEMPORARY_FOLDER_VARIABLES) add('temporary', variable)
  return folders
}

// ============================================================ the drive a place is on, on Windows

/**
 * WHAT WINDOWS SAID OF THE DRIVE A PLACE IS ON (DF4). `type` is the name .NET's `DriveInfo.DriveType` gives it, which
 * Windows's GetDriveType answers. `unread` says why Windows could not be asked, or what it answered that is not a
 * type. Null means no drive was asked about: off Windows, or for a place that does not begin with a drive letter.
 * @typedef {{ root: string, type: string } | { root: string, unread: string } | null} ADriveReading
 */

/** The names .NET gives the types of a drive. */
const THE_DRIVE_TYPES = ['Unknown', 'NoRootDirectory', 'Removable', 'Fixed', 'Network', 'CDRom', 'Ram']

/** The types of a drive of this computer itself, which a data folder may be on. A removable drive is one of them. */
export const THE_LOCAL_DRIVE_TYPES = ['Removable', 'Fixed', 'CDRom', 'Ram']

/**
 * WHETHER A WINDOWS PLACE IS A UNC PATH (DF4): it begins with two backslashes, as `\\server\share` does. `\\?\`
 * and `\\.\` can begin a drive path too, so after one of them only `UNC\` makes it a network path.
 * @param {string} to
 * @returns {boolean}
 */
export function isAWindowsNetworkPath(to) {
  if (!to.startsWith('\\\\')) return false
  const device = to.slice(2, 4)
  if (device === '?\\' || device === '.\\') return to.slice(4, 8).toUpperCase() === 'UNC\\'
  return true
}

/** The PowerShell script that writes the type of the drive at `root`, such as `D:\`. @param {string} root */
export function theScriptThatReadsADrive(root) {
  return `[Console]::Out.Write((New-Object System.IO.DriveInfo '${root}').DriveType.ToString())`
}

/**
 * THE DRIVE A PLACE IS ON, as Windows reads it (DF4). It starts PowerShell with no window, and waits for it without
 * holding the thread. Off Windows, and for a place that does not begin with a drive letter, nothing is started and
 * the answer is null.
 * @param {string} to
 * @param {string} [platform]
 * @param {import('./systems/windows-commands.mjs').WindowsCommands} [commands]
 * @returns {Promise<ADriveReading>}
 */
export async function theDriveOfAPlace(to, platform = THIS_PLATFORM, commands = theRealWindowsCommands()) {
  if (platform !== 'win32' || typeof to !== 'string' || !/^[A-Za-z]:[\\/]/.test(to)) return null
  const root = `${to.slice(0, 2).toUpperCase()}\\`
  const did = await commands.startPowerShell(theScriptThatReadsADrive(root))
  if (!did.ran) return { root, unread: did.reason }
  if (did.status !== 0) {
    const firstLine = did.stderr.split(/\r?\n/).find((line) => line.trim() !== '')
    return { root, unread: firstLine === undefined ? `PowerShell ended with ${String(did.status)}` : firstLine.trim() }
  }
  const said = did.stdout.trim()
  if (!THE_DRIVE_TYPES.includes(said)) return { root, unread: `PowerShell answered ${JSON.stringify(said)}, which is not a type of drive` }
  return { root, type: said }
}

/**
 * A FOLDER'S LONG NAME ON WINDOWS, with its links followed, or null when the folder is not there: its real
 * path throws ENOENT or ENOTDIR then. Any other error is thrown, so a move that cannot read the folder
 * fails with it. Windows writes a variable such as `TEMP` as it was given it, so a folder written in short
 * 8.3 names is compared by this name too.
 * @param {string} folder
 * @returns {string | null}
 */
function theLongNameOf(folder) {
  try {
    return realpathSync.native(folder)
  } catch (error) {
    const code = codeOf(error)
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
}

/**
 * THE FACTS A MOVE'S CHECK USES on this machine: the folders, the environment, the mark, the free bytes, the current
 * folder's size, and the walk of it or the sentence that walk refused with. The start-at-login reading is handed in
 * because this file cannot import the reading without a cycle: the reading's file imports the service command, which
 * imports this file.
 * The drive's reading is handed in too, because Windows answers it only after a wait, and this function does not wait.
 * @param {string} to
 * @param {LoginUnit} loginUnit
 * @param {string} [envFile]
 * @param {ADriveReading} [drive]
 * @returns {{
 *   from: string, database: string, installFolder: string, perUserFolder: string,
 *   processEnv: Record<string, string | undefined>, envFile: string, mark: AMarkRead, platform: string,
 *   freeBytes: number, folderBytes: number, walk: AWalk | string, loginUnit: LoginUnit,
 *   placeExists: boolean, placeIsAFolder: boolean, placeEmpty: boolean, holderExists: boolean, leaveOut: string[],
 *   refusedFolders: ARefusedFolder[], drive?: ADriveReading
 * }}
 */
export function theFactsOfAMove(to, loginUnit, envFile = ENV_FILE, drive = null) {
  const where = whereTheDataIs(process.env, envFile)
  const leaveOut = theLeaveOutOf(where.folder, where.database)
  /** @type {AWalk | string} */
  let walk
  try {
    walk = theFilesOf(where.folder, leaveOut)
  } catch (error) {
    walk = saysOf(error)
  }
  const place = typeof to === 'string' ? to : ''
  const placeExists = place !== '' && existsSync(place)
  const placeIsAFolder = placeExists && lstatSync(place).isDirectory()
  const placeEmpty = placeIsAFolder && readdirSync(place).length === 0
  const holder = dirname(place === '' ? '.' : place)
  const holderExists = existsSync(holder) && statSync(holder).isDirectory()
  return {
    from: where.folder,
    database: where.database,
    installFolder: REPO_ROOT,
    perUserFolder: dirname(envFile),
    processEnv: process.env,
    envFile,
    mark: readTheMoveMark(theMoveMarkPath(envFile)),
    platform: THIS_PLATFORM,
    freeBytes: theFreeBytesAbove(place),
    folderBytes: typeof walk === 'string' ? 0 : walk.bytes,
    walk,
    placeExists,
    placeIsAFolder,
    placeEmpty,
    holderExists,
    leaveOut,
    loginUnit,
    refusedFolders: THIS_PLATFORM === 'win32' ? theFoldersADataFolderIsRefusedIn(process.env, theLongNameOf) : [],
    drive,
  }
}

// ============================================================ what a move refuses

/**
 * WHETHER THE LOGIN UNIT WOULD START THE OFFICE FROM THE OLD FOLDER AFTER A MOVE (DF4). A unit that is there and that
 * systemd does not say is disabled may start the office at the next login. A unit that systemd says is disabled but
 * that is running holds the office now, and the move's start after the switch would start it again from the old
 * folder. A unit that systemd says is disabled and that is not running starts nothing, so it does not refuse.
 * @param {LoginUnit} loginUnit
 * @returns {boolean}
 */
export function theLoginUnitWouldStartTheOldFolder(loginUnit) {
  if (loginUnit.unit === 'none') return false
  return loginUnit.startsAtLogin !== false || theLoginUnitIsRunning(loginUnit.activeWord)
}

/**
 * WHY A MOVE THERE IS REFUSED, in one sentence, or null when it may go on. The checks are asked in the order DF4
 * lists them. It reads nothing from the disk: every fact it uses is handed to it, so a test can describe any machine.
 * @param {string} to
 * @param {ReturnType<typeof theFactsOfAMove>} facts
 * @returns {string | null}
 */
export function whyAMoveThereIsRefused(to, facts) {
  const platform = facts.platform
  const paths = thePathsOf(platform)
  if (typeof to !== 'string' || to === '' || /[\r\n\0]/.test(to) || !isAnAbsolutePath(to, platform) || paths.resolve(to) !== to) {
    // A UNC PATH IS REFUSED AS A NETWORK PLACE, though it is not a full path that begins with a drive letter either.
    if (platform === 'win32' && typeof to === 'string' && isAWindowsNetworkPath(to)) return theWindowsPlaceIsOnANetworkWords(to, null)
    return thePlaceIsNotAFullPathWords(to, platform)
  }
  if (facts.placeExists && !(facts.placeIsAFolder && facts.placeEmpty)) return thePlaceIsNotEmptyWords(to)
  if (theSameSpelling(paths.resolve(to), paths.resolve(facts.from), platform)) {
    return thePlaceIsAroundTheDataFolderWords(to, facts.from, 'same')
  }
  if (isAtOrInside(to, facts.from, platform)) return thePlaceIsAroundTheDataFolderWords(to, facts.from, 'inside')
  if (isAtOrInside(facts.from, to, platform)) return thePlaceIsAroundTheDataFolderWords(to, facts.from, 'holds')
  if (isAtOrInside(to, facts.installFolder, platform)) return thePlaceIsInTheInstallFolderWords(to, facts.installFolder)
  if (!facts.holderExists) return thePlaceHasNoFolderWords(to)
  if (facts.freeBytes < facts.folderBytes) return thePlaceHasTooLittleRoomWords(to, facts.freeBytes, facts.folderBytes)
  if (platform === 'linux' && theLoginUnitWouldStartTheOldFolder(facts.loginUnit)) {
    return theLoginUnitKeepsTheOldFolderWords(facts.loginUnit)
  }
  if (whereTheDataIs(facts.processEnv, facts.envFile).chosenBy === 'the process environment') {
    return theProcessEnvironmentDecidesWords()
  }
  const markPath = theMoveMarkPath(facts.envFile)
  if (facts.mark.state === 'unreadable') return theUnreadableMarkWords(markPath, facts.mark.why)
  if (facts.mark.state === 'read') {
    const mark = facts.mark.mark
    if (THE_STATES_THAT_KEEP_THE_OFFICE_CLOSED.includes(mark.state) && theMoverIsAlive(mark.mover)) {
      return theMoveIsStillRunningWords(markPath, mark)
    }
    if (mark.state === 'switched' || mark.state === 'started') return theMoveIsNotConfirmedWords(markPath, mark)
  }
  if (typeof facts.walk === 'string') return facts.walk
  if (platform === 'win32') {
    // A DRIVE NOBODY ASKED WINDOWS ABOUT IS NOT TAKEN AS LOCAL.
    const drive = facts.drive ?? { root: to.slice(0, 3), unread: 'nobody asked Windows' }
    if ('unread' in drive) return theWindowsDriveCannotBeToldWords(to, drive.root, drive.unread)
    if (drive.type === 'Network') return theWindowsPlaceIsOnANetworkWords(to, drive.root)
    if (!THE_LOCAL_DRIVE_TYPES.includes(drive.type)) return theWindowsDriveCannotBeToldWords(to, drive.root, `Windows answered ${drive.type}`)
    const refused = facts.refusedFolders.find((one) => one.names.some((name) => isAtOrInside(to, name, platform)))
    if (refused !== undefined) return theWindowsPlaceIsInTheTemporaryFolderWords(to, refused.folder, refused.variable)
  }
  return null
}

// ============================================================ the move

/**
 * @typedef {{ ok: boolean, says: string }} AStep
 * @typedef {{
 *   envFile?: string,
 *   markPath?: string,
 *   stop: () => Promise<AStep>,
 *   start: () => Promise<AStep>,
 *   theRuntimeDatabase: () => Promise<string | null>,
 *   theLoginUnit: () => LoginUnit | Promise<LoginUnit>,
 *   now?: () => Date,
 *   leaveOut?: string[],
 *   copy?: (from: string, to: string, walk: AWalk) => void | Promise<void>,
 *   theDrive?: (to: string) => Promise<ADriveReading>,
 * }} MoveWays
 */

/**
 * WHETHER THE LINUX LOGIN UNIT IS RUNNING, from what `systemctl --user is-active` answered: anything but `inactive`
 * or `failed` is running, and no answer (no unit, or no systemd) is not. Whether the unit is enabled does not decide
 * it (DF6).
 * @param {string | null} activeWord
 * @returns {boolean}
 */
export function theLoginUnitIsRunning(activeWord) {
  if (typeof activeWord !== 'string' || activeWord === '') return false
  return activeWord !== 'inactive' && activeWord !== 'failed'
}

/**
 * THE STOP AND THE START A MOVE USES (DF6 and DF10). The stop reads whether the login unit runs at each call. A
 * running unit is stopped first, and a unit stop that fails is answered at once without running the service stop;
 * then the service command's stop runs in every case, because an office started another way, beside the unit, would
 * otherwise run on. The service lock is free when that stop answers 0, except a stale lock, which the start after the
 * move takes over: stop in src/config/the-service-command.mjs reads the lock again after it asks the group, answers
 * only once the lock is gone, and answers 0 with a stale lock when no server answers on its port.
 *
 * The start starts the unit only when the last stop stopped it, and otherwise runs the service start. A start before
 * any stop runs the service start.
 *
 * THE STOP IS GIVEN THE WHOLE READING, so that the choice of the running word, and not the enabled one, is made here,
 * where the tests reach it (DF6).
 * @param {{
 *   theUnitsReading: () => UnitReading | null | Promise<UnitReading | null>,
 *   stopTheUnit: () => AStep | Promise<AStep>,
 *   startTheUnit: () => AStep | Promise<AStep>,
 *   stopTheService: () => Promise<AStep>,
 *   startTheService: () => Promise<AStep>,
 * }} how
 * @returns {{ stop: () => Promise<AStep>, start: () => Promise<AStep> }}
 */
export function theStopAndStartOfAMove(how) {
  let aStopRan = false
  let theUnitWasStopped = false
  const stop = async () => {
    aStopRan = true
    theUnitWasStopped = false
    const reading = await how.theUnitsReading()
    const activeWord = reading === null ? null : reading.activeWord
    if (theLoginUnitIsRunning(activeWord)) {
      const unitStopped = await how.stopTheUnit()
      if (!unitStopped.ok) return unitStopped
      theUnitWasStopped = true
    }
    return await how.stopTheService()
  }
  const start = async () => {
    if (aStopRan && theUnitWasStopped) return await how.startTheUnit()
    return await how.startTheService()
  }
  return { stop, start }
}

/**
 * MOVE THE DATA FOLDER to `to`, by DF5 to DF12, and answer the last mark. A refusal writes no mark and answers the
 * sentence as `{ refused }`. The old folder is not changed; a copy is left in place when a step after it stops.
 * @param {string} to
 * @param {MoveWays} ways
 * @returns {Promise<TheMoveMark | { refused: string }>}
 */
export async function moveTheDataFolder(to, ways) {
  const envFile = ways.envFile ?? ENV_FILE
  const markPath = ways.markPath ?? theMoveMarkPath(envFile)
  const now = ways.now ?? (() => new Date())
  const loginUnit = await ways.theLoginUnit()
  const drive = await (ways.theDrive ?? theDriveOfAPlace)(to)
  const facts = theFactsOfAMove(to, loginUnit, envFile, drive)
  const refusal = whyAMoveThereIsRefused(to, facts)
  if (refusal !== null) return { refused: refusal }

  const from = facts.from
  const database = facts.database
  const newDatabase = join(to, database)
  const leaveOut = [...new Set([...facts.leaveOut, ...(ways.leaveOut ?? [])])]
  const earlier = facts.mark.state === 'read' ? [...facts.mark.mark.earlier] : []
  const mover = { pid: process.pid, startedAt: theStartOfTheProcessAt(process.pid) }
  const base = { from, to, database, mover, earlier, manifest: /** @type {Record<string, string> | null} */ (null), says: /** @type {string | null} */ (null) }

  /**
   * Write the mark before a step, and answer it.
   * @param {MoveState} state
   * @param {Partial<Pick<TheMoveMark, 'manifest' | 'says'>>} [more]
   * @returns {TheMoveMark}
   */
  const write = (state, more = {}) => {
    const mark = /** @type {TheMoveMark} */ ({ version: 1, ...base, ...more, earlier: theEarlierFoldersOf(base.earlier, state, base), state, at: localStampOf(now()) })
    writeTheMoveMark(markPath, mark)
    return mark
  }

  /** @param {string} says @param {Record<string, string> | null} [manifest] */
  const stoppedBefore = (says, manifest = null) => write('stopped-before-the-switch', { says, manifest })

  /**
   * End before the switch, then start the office again. The mark is written before the start, so a mover stopped
   * during it leaves a mark that lets a start through, and it is written again when the start fails.
   * @param {string} says @param {Record<string, string> | null} [manifest]
   * @returns {Promise<TheMoveMark>}
   */
  const stoppedBeforeAndStartedAgain = async (says, manifest = null) => {
    const mark = stoppedBefore(says, manifest)
    const started = await ways.start()
    return started.ok ? mark : stoppedBefore(`${says} ${theOfficeDidNotStartAgainWords(started.says)}`, manifest)
  }

  write('stopping')
  const stopped = await ways.stop()
  if (!stopped.ok) return stoppedBefore(stopped.says)

  write('copying')
  /** @type {AWalk} */
  let walk
  /** @type {Record<string, string>} */
  let manifest
  try {
    walk = theFilesOf(from, leaveOut)
    manifest = theManifestOf(from, walk)
    write('copying', { manifest })
    await (ways.copy ?? copyTheFolder)(from, to, walk)
  } catch (error) {
    return await stoppedBeforeAndStartedAgain(saysOf(error))
  }

  write('checking', { manifest })
  const wrong = whatTheCopyGotWrong(from, to, manifest, walk, database)
  if (wrong !== null) return await stoppedBeforeAndStartedAgain(wrong, manifest)

  write('switching', { manifest })
  const label = `data-folder-move-${String(process.pid)}`
  const backup = `${envFile}.before-${label}`
  /** @type {{ backup: string, before: { sha256: string } }} */
  let env
  try {
    if (!existsSync(envFile)) makeTheEnvFile(envFile)
    env = setTheLine(envFile, 'MOLE_OFFICE_DB', newDatabase, label)
  } catch (error) {
    // The line was not switched, or it was and a backup from this move remains. Put that backup back when it is ours.
    const reasons = [saysOf(error)]
    if (existsSync(backup)) {
      try {
        putTheBackupBack(envFile, backup, theHashOfBytes(backup))
      } catch (putBack) {
        reasons.push(saysOf(putBack))
      }
    }
    return await stoppedBeforeAndStartedAgain(reasons.join(' '), manifest)
  }

  write('switched', { manifest, says: theOfficeWasSwitchedWords(envFile, newDatabase) })
  const started = await ways.start()
  const runtime = started.ok ? await ways.theRuntimeDatabase() : null
  if (started.ok && runtime === newDatabase) {
    return write('started', { manifest, says: theMoveWasStartedWords(markPath, newDatabase) })
  }

  const reasons = started.ok ? whyTheNewStartWasNotTaken(runtime, newDatabase) : started.says
  /** @type {string | null} */
  let notPutBack = null
  // The stop finds the office by the lock beside the database the .env names, and the .env still names the new folder.
  const stoppedAgain = await ways.stop()
  try {
    putTheBackupBack(envFile, env.backup, env.before.sha256)
  } catch (error) {
    notPutBack = saysOf(error)
  }
  if (!stoppedAgain.ok) {
    return write('switched-back', {
      manifest,
      says: theSwitchBackCouldNotStopWords(markPath, to, reasons, notPutBack, stoppedAgain.says),
    })
  }
  const oldStarted = await ways.start()
  return write('switched-back', { manifest, says: theMoveWasSwitchedBackWords(markPath, from, reasons, notPutBack, oldStarted) })
}

/**
 * MAKE THE `.env` when the office has never had one: an empty file with mode 600 on Linux and the Mac, which
 * `setTheLine` then writes by rename. Its folder is made when it is not there.
 * @param {string} envFile
 */
function makeTheEnvFile(envFile) {
  makeTheFolder(dirname(envFile))
  const fd = openSync(envFile, 'wx', 0o600)
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  if (THIS_PLATFORM !== 'win32') chmodSync(envFile, 0o600)
  fsyncTheFolder(dirname(envFile))
}

// ============================================================ after the move

/**
 * CONFIRM THE MOVE: remove from the old folder only the names in the mark's SHA-256 list whose bytes still match,
 * then the folders left empty; anything else stays and is named. A folder left empty that cannot be removed is kept
 * and named by its relative name with `/` after it, and the confirm goes on. The old folder joins the mark's earlier
 * folders.
 * The folder the office runs from, the new one, is left out of them, so a move back does not list it.
 *
 * A mark that says `started` is confirmed, and so is one that says `switched` when the mover it names has ended: the
 * `.env` names the new folder, so an office started since runs from it, and nothing else ends that move. While that
 * mover is alive the confirm is refused, because it may still switch the office back. Every other state is refused
 * as before.
 *
 * A confirm the mark does not allow is answered as `{ refused }` with its sentence, and nothing is removed. A fault
 * after that, such as a mark that cannot be written, is thrown: it is not a refusal, and the files it removed are gone.
 * @param {string} markPath
 * @param {string} theDatabaseInUse
 * @param {(mover: { pid: number, startedAt: string }) => boolean} [isAlive]
 * @returns {{ removed: string[], kept: string[] } | { refused: string }}
 */
export function confirmTheMove(markPath, theDatabaseInUse, isAlive = theMoverIsAlive) {
  const read = readTheMoveMark(markPath)
  if (read.state === 'absent') return { refused: theNoMoveToConfirmWords(markPath) }
  if (read.state === 'unreadable') return { refused: theUnreadableMarkWords(markPath, read.why) }
  const mark = read.mark
  const mayConfirm = mark.state === 'started' || (mark.state === 'switched' && !isAlive(mark.mover))
  if (!mayConfirm) {
    return {
      refused:
        mark.state === 'switched'
          ? theConfirmWaitsForTheMoverWords(markPath, mark.mover.pid)
          : theConfirmNeedsAStartedMoveWords(markPath, mark.state),
    }
  }
  const wanted = join(mark.to, mark.database)
  if (!theSameSpelling(thePathsOf(THIS_PLATFORM).resolve(theDatabaseInUse), thePathsOf(THIS_PLATFORM).resolve(wanted), THIS_PLATFORM)) {
    return { refused: theConfirmNeedsTheNewDatabaseWords(markPath, wanted, theDatabaseInUse) }
  }

  // THE OLD FOLDER ITSELF IS READ FIRST. When it cannot be read, every name in it looks absent: nothing would be removed,
  // the answer would say nothing was kept while all of it still is, and the mark would say confirmed. A folder that is
  // gone holds nothing, and its confirm goes on.
  try {
    readdirSync(mark.from)
  } catch (error) {
    if (codeOf(error) !== 'ENOENT') return { refused: theOldFolderCannotBeReadWords(markPath, mark.from, saysOf(error)) }
  }

  const manifest = mark.manifest ?? {}
  /** @type {string[]} */
  const removed = []
  for (const name of Object.keys(manifest)) {
    const path = join(mark.from, name)
    if (!existsSync(path)) continue
    // A NAME THAT CANNOT BE READ OR REMOVED STAYS where it is, and the walk below names it among the kept.
    try {
      if (!lstatSync(path).isFile() || theHashOfAFile(path) !== manifest[name]) continue
      rmSync(path, { force: true })
    } catch {
      continue
    }
    removed.push(name)
  }
  const leftEmpty = removeTheEmptyFolders(mark.from, theLeaveOutOf(mark.from, mark.database))
  const removedSet = new Set(removed)
  const kept = [...everyFileUnder(mark.from).filter((name) => !removedSet.has(name)), ...leftEmpty]
  const agreed = { ...mark, state: /** @type {MoveState} */ ('confirmed'), earlier: theEarlierFoldersOf([...new Set([...mark.earlier, mark.from])], 'confirmed', mark), says: theMoveWasConfirmedWords(markPath, mark.from), at: localStampOf(new Date()) }
  writeTheMoveMark(markPath, agreed)
  return { removed: removed.sort(), kept: [...new Set(kept)].sort() }
}

/** The sentence a confirm gives when no mark is there at all. @param {string} markPath */
export function theNoMoveToConfirmWords(markPath) {
  return `There is no data folder move mark at ${markPath}, so there is no old data folder to remove and nothing was removed.`
}

/**
 * EVERY FILE UNDER A FOLDER, as relative names, reading no kind of entry with anything but `lstat`. It is used after a
 * confirm, when a person may have put anything in the old folder and a walk that refuses is not wanted. A folder
 * inside it that cannot be read is named by its own name ending in `/`, because whatever it holds stays.
 * @param {string} folder
 * @returns {string[]}
 */
function everyFileUnder(folder) {
  /** @type {string[]} */
  const files = []
  /** @param {string} at @param {string} prefix */
  function visit(at, prefix) {
    let entries
    try {
      entries = readdirSync(at, { withFileTypes: true })
    } catch {
      if (prefix !== '') files.push(prefix)
      return
    }
    for (const entry of entries.sort((one, other) => one.name.localeCompare(other.name))) {
      const relativeName = prefix + entry.name
      if (entry.isDirectory()) visit(join(at, entry.name), `${relativeName}/`)
      else files.push(relativeName)
    }
  }
  visit(folder, '')
  return files
}

/**
 * REMOVE THE FOLDERS INSIDE `folder` THAT ARE LEFT EMPTY, never the folder itself and never a name in `leaveOut`.
 * A folder left empty that cannot be removed is answered by its relative name with `/` after it, and the walk goes
 * on; the folder that holds it is not empty then, so it is not tried.
 * @param {string} folder
 * @param {string[]} leaveOut
 * @returns {string[]}
 */
function removeTheEmptyFolders(folder, leaveOut) {
  /** @type {string[]} */
  const notRemoved = []
  const leftOut = (/** @type {string} */ name) => leaveOut.some((one) => name === one || name.startsWith(`${one}/`))
  /** @param {string} at @param {string} prefix @returns {boolean} whether it is empty now */
  function visit(at, prefix) {
    let entries
    try {
      entries = readdirSync(at, { withFileTypes: true })
    } catch {
      return false
    }
    let empty = true
    for (const entry of entries) {
      const relativeName = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (!entry.isDirectory() || leftOut(relativeName)) {
        empty = false
        continue
      }
      if (!visit(join(at, entry.name), relativeName)) empty = false
    }
    if (empty && prefix !== '') {
      try {
        rmdirSync(at)
      } catch {
        notRemoved.push(`${prefix}/`)
        return false
      }
      return true
    }
    return empty
  }
  visit(folder, '')
  return notRemoved
}

// ============================================================ the installer's choose

/**
 * CHOOSE THE DATA FOLDER for a first install, by DF3: make the `.env` when there is none, with mode 600 on Linux and
 * the Mac, and write the one line. It refuses a relative place, a current data folder that already holds a database,
 * and a place that holds files and no `mole-office.db`, and writes nothing on a refusal.
 * @param {string} place
 * @param {string} [envFile]
 * @returns {{ envFile: string, database: string, backup: string, made: boolean }}
 */
export function chooseTheDataFolder(place, envFile = ENV_FILE) {
  const platform = THIS_PLATFORM
  const paths = thePathsOf(platform)
  if (typeof place !== 'string' || place === '' || /[\r\n\0]/.test(place) || !isAnAbsolutePath(place, platform) || paths.resolve(place) !== place) {
    throw new Error(theChoosePlaceIsNotAFullPathWords(place, platform))
  }
  if (existsSync(place) && !statSync(place).isDirectory()) throw new Error(theChoosePlaceIsNotAFolderWords(place))
  const where = whereTheDataIs(process.env, envFile)
  if (existsSync(join(where.folder, where.database))) {
    throw new Error(theChooseAlreadyHasADatabaseWords(where.folder, where.database))
  }
  /** @type {string[]} */
  let files = []
  try {
    files = readdirSync(place)
  } catch {
    // A place that is not there yet holds no files. The office makes it when it first opens the database.
  }
  if (files.length > 0 && !existsSync(join(place, 'mole-office.db'))) throw new Error(theChoosePlaceHoldsFilesWords(place))

  const made = !existsSync(envFile)
  if (made) makeTheEnvFile(envFile)
  const database = join(place, 'mole-office.db')
  try {
    const written = setTheLine(envFile, 'MOLE_OFFICE_DB', database, 'data-folder-choose')
    return { envFile, database, backup: written.backup, made }
  } catch (error) {
    if (made) {
      rmSync(envFile, { force: true })
      fsyncTheFolder(dirname(envFile))
    }
    throw error
  }
}

// ============================================================ the start check

/**
 * WHY A START MAY NOT OPEN THE OFFICE NOW, in one sentence, or null when no move holds it closed. A mark that cannot
 * be read keeps the office closed because it might be guarding a move (DF15). A mark in one of the closed states
 * keeps it closed only while the mover it names is alive (DF13 and DF14).
 * @param {string} [markPath]
 * @param {(mover: { pid: number, startedAt: string }) => boolean} [isAlive]
 * @returns {string | null}
 */
export function whyADataFolderMoveKeepsTheOfficeClosed(markPath = theMoveMarkPath(), isAlive = theMoverIsAlive) {
  const read = readTheMoveMark(markPath)
  if (read.state === 'absent') return null
  if (read.state === 'unreadable') return theOfficeStaysClosedForAnUnreadableMarkWords(markPath, read.why)
  const mark = read.mark
  if (!THE_STATES_THAT_KEEP_THE_OFFICE_CLOSED.includes(mark.state)) return null
  return isAlive(mark.mover) ? theOfficeStaysClosedWords(markPath, mark) : null
}
