// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ONE WRITER THAT SETS ONE LINE IN A `.env` AND KEEPS EVERY OTHER BYTE.
 *
 * The bootstrap's handoff writes MOLE_OFFICE_STABLE_CHECKOUT into the development checkout's `.env`,
 * and the step that moves the data folder writes MOLE_OFFICE_DB. Both call `setTheLine`, so the rules
 * live in one place: the file keeps its owner, its group, its mode and every other line byte for
 * byte, a backup is left beside it, and `putTheBackupBack` puts that backup back for a rollback.
 *
 * EVERY REFUSAL HAPPENS BEFORE THE FILE IS TOUCHED. A missing file, a symbolic link, something that is
 * not an ordinary file, a file this user does not own, a name that is not a setting name, a name the
 * file sets on more than one line, a value that would not read back as itself, and a backup path that
 * already exists are all refused with the file and its folder as they were. A group that cannot be
 * kept on the new file is refused before the rename, and the backup written for this call is removed.
 *
 * WHAT PROVES EVERY OTHER BYTE KEPT. `before.withoutTheLine` and `after.withoutTheLine` are the
 * sha256 of the file's bytes with the one named line dropped: split on `\n`, drop the line, join the
 * rest with `\n`. They must be equal, and so must the mode, the owner and the group. A write that
 * changed anything else throws with the file already written and the backup named.
 *
 * BOTH READERS AGREE, OR NOTHING IS WRITTEN. The office's own `envFileValues` and Node's own parser
 * (`util.parseEnv`, which is the parser `process.loadEnvFile` uses) must both read the line back as
 * exactly the value, on a scratch copy of that one line. A value with a quote, a hash, a newline or
 * surrounding spaces is refused rather than quoted; a value with an inner space is written when both
 * readers keep it.
 */

import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  fchmodSync,
  fchownSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { parseEnv } from 'node:util'

import { envFileValues } from './settings.mjs'
import { THIS_PLATFORM, aFileModeSaysWhoMayRead } from './the-paths-of-a-system.mjs'

/** A setting name: the shape `name` must have. */
const A_SETTING_NAME = /^[A-Z][A-Z0-9_]*$/

/** A label: the shape that may go into a backup's name. */
const A_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** The newline byte that ends a line, and the carriage-return byte a CRLF ending carries. */
const NEWLINE = 0x0a
const RETURN = 0x0d

/**
 * One line of the file: where its text starts, where the byte after its text is (before a `\r` of a
 * CRLF ending, if there is one), and where its own bytes end (the index of its `\n`, or the file's
 * length on a last line with no ending).
 * @typedef {{ start: number, textEnd: number, end: number }} ALine
 */

/**
 * The state of one file this writer speaks about.
 * @typedef {{ sha256: string, withoutTheLine: string, mode: number, uid: number, gid: number }} AFileState
 */

/**
 * What `setTheLine` returns: where the backup is, and the state before and after the write.
 * @typedef {{ backup: string, before: AFileState, after: AFileState }} ALineSet
 */

/**
 * The file's lines, with the position of each.
 * @param {Buffer} bytes
 * @returns {ALine[]}
 */
function itsLines(bytes) {
  /** @type {ALine[]} */
  const lines = []
  let start = 0
  for (let at = 0; at < bytes.length; at += 1) {
    if (bytes[at] !== NEWLINE) continue
    lines.push({ start, end: at, textEnd: at > start && bytes[at - 1] === RETURN ? at - 1 : at })
    start = at + 1
  }
  lines.push({ start, end: bytes.length, textEnd: bytes.length })
  return lines
}

/**
 * Whether the office's own reader takes this one line's text as `name`.
 * @param {string} text
 * @param {string} name
 * @returns {boolean}
 */
function theOfficeReaderTakes(text, name) {
  const trimmed = text.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return false
  const at = trimmed.indexOf('=')
  return at !== -1 && trimmed.slice(0, at).trim() === name
}

/**
 * Whether Node's own parser takes this one line's text as `name`. A line it cannot parse is one it
 * does not take.
 * @param {string} text
 * @param {string} name
 * @returns {boolean}
 */
function nodesOwnParserTakes(text, name) {
  try {
    return Object.prototype.hasOwnProperty.call(parseEnv(`${text}\n`), name)
  } catch {
    return false
  }
}

/**
 * Which lines set `name`, asked of both readers, commented lines excluded by each reader's own rule.
 * @param {ALine[]} lines
 * @param {Buffer} bytes
 * @param {string} name
 * @returns {number[]}
 */
function theLinesSetting(lines, bytes, name) {
  /** @type {number[]} */
  const found = []
  lines.forEach((line, at) => {
    const text = bytes.subarray(line.start, line.end).toString('utf8')
    if (theOfficeReaderTakes(text, name) || nodesOwnParserTakes(text, name)) found.push(at)
  })
  return found
}

/**
 * The bytes with the one named line dropped: split on `\n`, drop that line, join the rest with `\n`.
 * This is what both `withoutTheLine` hashes are made of, and it is equal before and after on every
 * path: a replaced line and an appended line both leave exactly these bytes.
 * @param {Buffer} bytes
 * @param {string} name
 * @returns {Buffer}
 */
function bytesWithoutTheLine(bytes, name) {
  const lines = itsLines(bytes)
  const first = theLinesSetting(lines, bytes, name)[0]
  if (first === undefined) return bytes
  /** @type {Buffer[]} */
  const parts = []
  lines.forEach((line, at) => {
    if (at === first) return
    if (parts.length > 0) parts.push(Buffer.from([NEWLINE]))
    parts.push(bytes.subarray(line.start, line.end))
  })
  return Buffer.concat(parts)
}

/**
 * The state of one file: the whole-file hash, the hash without the named line, the mode and its
 * owner.
 * @param {Buffer} bytes
 * @param {string} name
 * @param {import('node:fs').Stats} stats
 * @returns {AFileState}
 */
function theStateOf(bytes, name, stats) {
  return {
    sha256: theHash(bytes),
    withoutTheLine: theHash(bytesWithoutTheLine(bytes, name)),
    mode: thePermissionPart(stats.mode),
    uid: stats.uid,
    gid: stats.gid,
  }
}

/**
 * @param {Buffer} bytes
 * @returns {string}
 */
function theHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * The permission part of a mode, as `chmod` and the returned state speak of it.
 * @param {number} mode
 * @returns {number}
 */
function thePermissionPart(mode) {
  return mode & 0o7777
}

/**
 * An error's code alone, never its message, for a refusal sentence.
 * @param {unknown} error
 * @returns {string}
 */
function codeOf(error) {
  const code = typeof error === 'object' && error !== null ? /** @type {{ code?: unknown }} */ (error).code : undefined
  return typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'no reason given'
}

/**
 * WHETHER `name=value` AS ONE LINE READS BACK AS EXACTLY `value`: asked of the office's own
 * `envFileValues`, and of Node's own parser, which is the parser `process.loadEnvFile` uses. A
 * scratch copy of that one line stands in the file's place; nothing else is read or written.
 * @param {string} name
 * @param {string} value
 * @returns {boolean}
 */
function theLineReadsBackExactly(name, value) {
  const content = `${name}=${value}\n`
  const scratchFolder = mkdtempSync(join(tmpdir(), 'mole-env-line-'))
  try {
    const scratch = join(scratchFolder, 'the-line.env')
    writeFileSync(scratch, content)
    if (envFileValues(scratch)[name] !== value) return false
    try {
      return parseEnv(content)[name] === value
    } catch {
      return false
    }
  } finally {
    rmSync(scratchFolder, { recursive: true, force: true })
  }
}

/**
 * A NEW FILE WITH THE MODE AND GROUP OF ANOTHER, WRITTEN AND FSYNCED, created with flag `wx` so an
 * existing path is refused rather than overwritten. On any failure the new file is removed and a
 * plain sentence is thrown; a group that cannot be kept is refused before any rename.
 * @param {string} path
 * @param {Buffer} bytes
 * @param {{ mode: number, gid: number }} like
 * @param {string} target the file the caller is changing, named in the refusal
 * @param {string} what 'backup' or 'temporary file'
 */
function aNewFileLike(path, bytes, like, target, what) {
  let fd
  try {
    fd = openSync(path, 'wx')
  } catch (error) {
    if (codeOf(error) === 'EEXIST') {
      throw new Error(`The ${what} for ${target} already exists at ${path}, so nothing was written.`)
    }
    throw new Error(`The ${what} for ${target} could not be created at ${path} (${codeOf(error)}), so nothing was written.`)
  }
  try {
    if (fstatSync(fd).gid !== like.gid) fchownSync(fd, -1, like.gid)
  } catch {
    // The check below turns a group the system refused into the refusal sentence.
  }
  if (fstatSync(fd).gid !== like.gid) {
    closeSync(fd)
    rmSync(path, { force: true })
    throw new Error(`The ${what} for ${target} can not keep the group of ${target}, so ${target} was not changed.`)
  }
  try {
    fchmodSync(fd, like.mode)
    writeFileSync(fd, bytes)
    fsyncSync(fd)
  } catch (error) {
    closeSync(fd)
    rmSync(path, { force: true })
    throw new Error(`The ${what} for ${target} could not be written at ${path} (${codeOf(error)}), so ${target} was not changed.`)
  }
  closeSync(fd)
}

/**
 * A temporary path beside `file`, in the same folder, with a name nothing else is likely to hold.
 * @param {string} file
 * @returns {string}
 */
function aTemporaryPathBeside(file) {
  return join(dirname(file), `.${basename(file)}.writing-${process.pid}-${randomBytes(6).toString('hex')}`)
}

/**
 * The folder's own entry on disk, so a rename that has just happened survives a crash. Windows does not
 * flush a folder, so there a rename is not flushed and the file renamed was flushed before it. `calls` are
 * the file calls, which a test hands in to stand for the platform's.
 * @param {string} folder
 * @param {string} [platform]
 * @param {{ openSync: (path: string, flags: string) => number, fsyncSync: (fd: number) => void, closeSync: (fd: number) => void }} [calls]
 */
export function fsyncTheFolder(folder, platform = THIS_PLATFORM, calls = { openSync, fsyncSync, closeSync }) {
  if (platform === 'win32') return
  const fd = calls.openSync(folder, 'r')
  try {
    calls.fsyncSync(fd)
  } finally {
    calls.closeSync(fd)
  }
}

/**
 * THE FILE'S NEW BYTES. When one line sets `name`, only that line's text changes and its own ending
 * stays, a `\r` included. When none does, the line is appended and the file's final-newline state is
 * kept: a file ending in `\n` gets `name=value\n`, and one that does not gets `\nname=value`.
 * @param {Buffer} bytes
 * @param {ALine[]} lines
 * @param {number} at the line that sets the name, or -1
 * @param {string} name
 * @param {string} value
 * @returns {Buffer}
 */
function theNewBytes(bytes, lines, at, name, value) {
  const theLine = Buffer.from(`${name}=${value}`)
  const held = at === -1 ? undefined : lines[at]
  if (held !== undefined) {
    return Buffer.concat([bytes.subarray(0, held.start), theLine, bytes.subarray(held.textEnd)])
  }
  const endsWithNewline = bytes.length > 0 && bytes[bytes.length - 1] === NEWLINE
  const added = `${endsWithNewline ? '' : '\n'}${name}=${value}${endsWithNewline ? '\n' : ''}`
  return Buffer.concat([bytes, Buffer.from(added)])
}

/**
 * WHY THIS FILE IS NOT THIS USER'S, in one sentence, or null when it is.
 *
 * ON WINDOWS THE FILE'S OWNER IS NOT IN ITS MODE, and Node has no `process.getuid` there, so a file inside this
 * user's home folder is taken as this user's. That rests on the access list Windows gives a home folder by default,
 * which lets in only its user, the administrators and the system. Mole Office does not read a file's access list, so
 * a file inside the home folder whose list was changed is still taken as this user's. The Linux and Mac sentence
 * keeps its words exactly.
 *
 * @param {string} file
 * @param {import('node:fs').Stats} stats
 * @param {string} [platform]
 * @param {string} [home]
 * @returns {string | null}
 */
export function whyTheFileIsNotThisUsers(file, stats, platform = THIS_PLATFORM, home = homedir()) {
  if (aFileModeSaysWhoMayRead(platform)) {
    return stats.uid === (process.getuid?.() ?? -1) ? null : `The file ${file} is not owned by this user, so nothing was written.`
  }
  const inside = relative(realpathSync(home), realpathSync(file))
  if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) return null
  return `The file ${file} is not inside this user's home folder ${home}. On Windows that is how Mole Office tells the file is this user's, so nothing was written.`
}

/**
 * SET ONE LINE IN `file`: `name=value` replaces the line that sets `name`, or is appended. The file
 * keeps its owner, its group, its mode and every other byte; a backup of its original bytes is left
 * at `<file>.before-<label>`. Nothing is written when the file, the name, the value or the backup
 * path is refused.
 * @param {string} file
 * @param {string} name
 * @param {string} value
 * @param {string} label
 * @returns {ALineSet}
 */
export function setTheLine(file, name, value, label) {
  if (!A_LABEL.test(label)) throw new Error(`The label ${label} is not a plain label, so ${file} was not written.`)
  if (!A_SETTING_NAME.test(name)) throw new Error(`The name ${name} is not a setting name, so ${file} was not written.`)

  let stats
  try {
    stats = lstatSync(file)
  } catch {
    throw new Error(`The file ${file} does not exist, so nothing was written.`)
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`The file ${file} is a symbolic link, not an ordinary file, so nothing was written.`)
  }
  if (!stats.isFile()) throw new Error(`The file ${file} is not an ordinary file, so nothing was written.`)
  const notOurs = whyTheFileIsNotThisUsers(file, stats)
  if (notOurs !== null) throw new Error(notOurs)

  let bytes
  try {
    bytes = readFileSync(file)
  } catch (error) {
    throw new Error(`The file ${file} could not be read (${codeOf(error)}), so nothing was written.`)
  }

  const lines = itsLines(bytes)
  const holding = theLinesSetting(lines, bytes, name)
  if (holding.length > 1) {
    throw new Error(`The file ${file} sets ${name} on more than one line, so nothing was written.`)
  }
  if (!theLineReadsBackExactly(name, value)) {
    throw new Error(`The value for ${name} would not read back as itself through both readers, so ${file} was not written.`)
  }

  const mode = thePermissionPart(stats.mode)
  const backup = `${file}.before-${label}`
  aNewFileLike(backup, bytes, { mode, gid: stats.gid }, file, 'backup')

  const newBytes = theNewBytes(bytes, lines, holding[0] ?? -1, name, value)
  const temp = aTemporaryPathBeside(file)
  try {
    aNewFileLike(temp, newBytes, { mode, gid: stats.gid }, file, 'temporary file')
    renameSync(temp, file)
  } catch (error) {
    rmSync(temp, { force: true })
    rmSync(backup, { force: true })
    throw error
  }
  fsyncTheFolder(dirname(file))

  const afterStats = statSync(file)
  const afterBytes = readFileSync(file)
  const before = theStateOf(bytes, name, stats)
  const after = theStateOf(afterBytes, name, afterStats)
  if (
    before.withoutTheLine !== after.withoutTheLine ||
    before.mode !== after.mode ||
    before.uid !== after.uid ||
    before.gid !== after.gid
  ) {
    throw new Error(
      `The file ${file} was written, but not with the same other bytes, mode, owner and group as before, so the backup at ${backup} should be put back.`,
    )
  }
  return { backup, before, after }
}

/**
 * PUT A BACKUP BACK OVER `file`, the same way `setTheLine` writes: a temporary file in the file's
 * folder with the file's own mode and group, renamed over it, the folder fsynced. The backup's
 * whole-file hash must be `expectedSha256`, or nothing is written. The backup is left where it is,
 * and the hash it holds is returned.
 * @param {string} file
 * @param {string} backup
 * @param {string} expectedSha256
 * @returns {string}
 */
export function putTheBackupBack(file, backup, expectedSha256) {
  let bytes
  try {
    bytes = readFileSync(backup)
  } catch (error) {
    throw new Error(`The backup ${backup} could not be read (${codeOf(error)}), so ${file} was not put back.`)
  }
  const found = theHash(bytes)
  if (found !== expectedSha256) {
    throw new Error(`The backup ${backup} does not hold the bytes ${expectedSha256}, so ${file} was not put back.`)
  }

  let stats
  try {
    stats = statSync(file)
  } catch (error) {
    throw new Error(`The file ${file} could not be read (${codeOf(error)}), so the backup ${backup} was not put back.`)
  }

  const temp = aTemporaryPathBeside(file)
  aNewFileLike(temp, bytes, { mode: thePermissionPart(stats.mode), gid: stats.gid }, file, 'temporary file')
  try {
    renameSync(temp, file)
  } catch (error) {
    rmSync(temp, { force: true })
    throw new Error(`The file ${file} could not be replaced (${codeOf(error)}), so it was left as it was.`)
  }
  fsyncTheFolder(dirname(file))

  const afterBytes = readFileSync(file)
  if (theHash(afterBytes) !== expectedSha256) {
    throw new Error(`The file ${file} did not come back with the bytes of the backup ${backup}, so nothing more was done.`)
  }
  return found
}
