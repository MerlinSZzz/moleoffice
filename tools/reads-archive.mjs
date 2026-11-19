// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE READ RECORD OF ONE SUITE ATTEMPT, in either form it is kept: the folder `reads/`, or beside it the
 * packed `reads.tar.zst`, written as `tar -C <attempt> -cf - reads | zstd`. Every entry of the archive
 * starts with `reads/`.
 *
 * The folder of the recorder is flat, but the digest keeps the producer's old sorted walk so receipts
 * filed before the archive existed still verify. A reader asks for the record by the path its receipt
 * names; when that path is a folder that has been packed away, the reader finds `reads.tar.zst` beside it.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, createWriteStream, existsSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createZstdCompress, zstdDecompressSync } from 'node:zlib'

/** @typedef {{ path: string, folder: boolean }} ReadsForm */
/** @typedef {{ sha256Base64: string, files: number, tarSha256?: string }} ReadsDigest */
/** @typedef {{ path: string, bytes: Uint8Array }} TarEntry */
/** @typedef {{ folders: Map<string, TreeNode>, files: Map<string, Uint8Array> }} TreeNode */
/** @typedef {{ path?: string, size?: string }} PaxRecord */
/** @typedef {{ tamper?: (archive: string) => void | Promise<void> }} PackOptions */
/** @typedef {{ packed: true, archive: string, note?: string, folder?: string, already?: boolean, files?: number, tarSha256?: string } | { packed: false, folder: string, why: string }} PackResult */

export const THE_READS_FOLDER = 'reads'
export const THE_READS_ARCHIVE = 'reads.tar.zst'
export const THE_ARCHIVE_NOTE = 'reads.ARCHIVED.txt'

const BLOCK = 512
/** @param {string} message @returns {never} */
const fail = (message) => { throw new Error(message) }
/** @param {Uint8Array} bytes @returns {string} */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** @param {string} word @returns {string} */
const quote = (word) => `'${String(word).replaceAll("'", `'\\''`)}'`
/** @param {unknown} error @returns {string | undefined} */
const codeOf = (error) => error instanceof Error && 'code' in error ? /** @type {{ code?: string }} */ (error).code : undefined

/**
 * The two forms and their note, beside the attempt's other artifacts.
 * @param {string} attempt
 * @returns {{ folder: string, archive: string, note: string }}
 */
export function readsPaths(attempt) {
  return { folder: join(attempt, THE_READS_FOLDER), archive: join(attempt, THE_READS_ARCHIVE), note: join(attempt, THE_ARCHIVE_NOTE) }
}

/**
 * The record actually on disk at or beside a receipt's read path. A folder is preferred when both forms
 * are there. A named folder that has been packed finds the archive beside it; a named archive is read
 * directly. Anything else, including a symbolic link, is refused.
 * @param {string} path
 * @returns {ReadsForm}
 */
export function readsOnDisk(path) {
  /** @type {import('node:fs').Stats | undefined} */
  let stat
  try { stat = lstatSync(path) } catch (error) { if (codeOf(error) !== 'ENOENT') throw error }
  if (stat !== undefined) {
    if (stat.isSymbolicLink()) fail(`The suite read record at ${path} is a symbolic link.`)
    if (stat.isDirectory()) return { path, folder: true }
    if (stat.isFile()) return { path, folder: false }
    return fail(`The suite read record at ${path} is neither a folder nor a packed file.`)
  }
  const beside = join(dirname(path), THE_READS_ARCHIVE)
  /** @type {import('node:fs').Stats | undefined} */
  let packed
  try { packed = lstatSync(beside) } catch (error) { if (codeOf(error) !== 'ENOENT') throw error }
  if (packed !== undefined) {
    if (packed.isSymbolicLink() || !packed.isFile()) fail(`The packed suite read record at ${beside} is not a regular file.`)
    return { path: beside, folder: false }
  }
  return fail(`The suite read record is missing: neither ${path} nor ${beside} is on disk.`)
}

/**
 * The digest of the folder, in the producer's old sorted walk, with the file count it covered.
 * @param {string} folder
 * @returns {{ sha256Base64: string, files: number }}
 */
export function readsFolderDigest(folder) {
  const digest = createHash('sha256')
  let files = 0
  /** @param {string} at */
  const walk = (at) => {
    const stat = lstatSync(at)
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('The suite read record is not a regular directory.')
    for (const child of readdirSync(at).sort()) {
      const full = join(at, child)
      const childStat = lstatSync(full)
      if (childStat.isSymbolicLink()) fail('The suite read record contains a symbolic link.')
      if (childStat.isDirectory()) walk(full)
      else if (childStat.isFile()) {
        const bytes = readFileSync(full)
        digest.update(JSON.stringify([relativeToReads(folder, full), bytes.length])).update('\n').update(bytes)
        files += 1
      } else fail('The suite read record contains a non-file entry.')
    }
  }
  walk(folder)
  if (files === 0) fail('The suite read record is empty.')
  return { sha256Base64: digest.digest('base64'), files }
}

/** @param {string} folder @param {string} full @returns {string} */
const relativeToReads = (folder, full) => full.slice(folder.length + 1).split(sep).join('/')

/**
 * The digest of a packed record, read without unpacking it to disk. Its paths are put back into the
 * producer's sorted walk before hashing, because the tar stream keeps the folder's readdir order.
 * @param {string} archive
 * @returns {ReadsDigest}
 */
export function readsArchiveDigest(archive) {
  const compressed = readFileSync(archive)
  /** @type {Buffer} */
  let bytes
  try { bytes = zstdDecompressSync(compressed) } catch (error) { return fail(`The packed read record at ${archive} does not decompress: ${error instanceof Error ? error.message : String(error)}`) }
  const entries = tarEntries(bytes, archive)
  const digest = createHash('sha256')
  /** @type {TreeNode} */
  const root = { folders: new Map(), files: new Map() }
  for (const entry of entries) {
    const parts = entry.path.split('/')
    let node = root
    for (const part of parts.slice(0, -1)) {
      if (node.files.has(part)) fail(`The packed read record at ${archive} has a file where a folder belongs: ${entry.path}.`)
      let child = node.folders.get(part)
      if (child === undefined) {
        child = { folders: new Map(), files: new Map() }
        node.folders.set(part, child)
      }
      node = child
    }
    const name = parts.at(-1) ?? fail(`The packed read record at ${archive} has an empty path.`)
    if (node.files.has(name) || node.folders.has(name)) fail(`The packed read record at ${archive} repeats ${entry.path}.`)
    node.files.set(name, entry.bytes)
  }
  let files = 0
  /** @param {TreeNode} node @param {string} prefix */
  const walk = (node, prefix) => {
    for (const name of [...node.folders.keys(), ...node.files.keys()].sort()) {
      const path = prefix === '' ? name : `${prefix}/${name}`
      const folder = node.folders.get(name)
      if (folder !== undefined) walk(folder, path)
      else {
        const entry = node.files.get(name) ?? fail(`The packed read record at ${archive} lost ${path}.`)
        digest.update(JSON.stringify([path, entry.length])).update('\n').update(entry)
        files += 1
      }
    }
  }
  walk(root, '')
  if (files === 0) fail('The packed read record is empty.')
  return { sha256Base64: digest.digest('base64'), files, tarSha256: sha256(bytes) }
}

/**
 * A receipt's read record in either form: its digest and file count, and the tar stream's sha for an archive.
 * @param {string} path
 * @returns {ReadsDigest}
 */
export function readsDigestOf(path) {
  const form = readsOnDisk(path)
  return form.folder ? readsFolderDigest(form.path) : readsArchiveDigest(form.path)
}

/**
 * `tar -C <attempt> -cf - reads` through zstd. The tar stream is hashed as it is written, and the packed
 * copy is read back and compared with the folder before the folder goes. A mismatch, a failed write or a
 * failed read leaves the folder in place and removes the unproven copy. `tamper` is for the proof's test:
 * it is given the temporary archive after it is written, before it is verified.
 * @param {string} attempt
 * @param {PackOptions} [options]
 * @returns {Promise<PackResult>}
 */
export async function packTheReads(attempt, { tamper } = {}) {
  const paths = readsPaths(attempt)
  const form = readsOnDisk(paths.folder)
  if (!form.folder) return { packed: true, already: true, archive: form.path, note: paths.note, folder: paths.folder }
  if (existsSync(paths.archive)) return { packed: false, folder: paths.folder, why: `both ${paths.folder} and ${paths.archive} are present, so neither was chosen` }
  if (existsSync(paths.note)) return { packed: false, folder: paths.folder, why: `${paths.note} is present without the archive it describes` }
  const before = readsFolderDigest(paths.folder)
  const temporaryArchive = `${paths.archive}.${String(process.pid)}.new`
  const temporaryNote = `${paths.note}.${String(process.pid)}.new`
  let movedArchive = false
  let movedNote = false
  try {
    const tar = spawn('tar', ['-C', attempt, '-cf', '-', THE_READS_FOLDER], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    tar.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    const hash = createHash('sha256')
    const hashing = new Transform({ transform(chunk, _encoding, done) { hash.update(chunk); done(null, chunk) } })
    const compressed = createZstdCompress()
    const archive = createWriteStream(temporaryArchive, { flags: 'wx', mode: 0o600 })
    const closed = new Promise((yes) => tar.once('close', yes))
    await pipeline(tar.stdout, hashing, compressed, archive)
    const code = await closed
    if (code !== 0) fail(`tar exited ${String(code)}${stderr.trim() === '' ? '' : `: ${stderr.trim()}`}`)
    fsyncTheFile(temporaryArchive)
    const tarSha256 = hash.digest('hex')
    await tamper?.(temporaryArchive)
    const after = readsArchiveDigest(temporaryArchive)
    if (after.tarSha256 !== tarSha256) fail('the archive unpacked to a different tar stream')
    if (after.files !== before.files) fail(`the archive holds ${String(after.files)} files and the folder holds ${String(before.files)}`)
    if (after.sha256Base64 !== before.sha256Base64) fail('the archive\'s read record differs from the folder\'s')
    const note = [
      'This attempt\'s read record was packed without loss.',
      `archive: ${THE_READS_ARCHIVE}`,
      `sha256 of the tar stream: ${tarSha256}`,
      `files: ${String(before.files)}`,
      `to unpack here: cd ${quote(attempt)} && zstd -dc ${THE_READS_ARCHIVE} | tar -xf -`,
      `where tar has zstd: tar --zstd -C ${quote(attempt)} -xf ${THE_READS_ARCHIVE}`,
      `the writer made it with: tar -C ${quote(attempt)} -cf - ${THE_READS_FOLDER} | zstd`,
      '',
    ].join('\n')
    writeFileSync(temporaryNote, note, { flag: 'wx', mode: 0o600 })
    fsyncTheFile(temporaryNote)
    renameSync(temporaryArchive, paths.archive)
    movedArchive = true
    renameSync(temporaryNote, paths.note)
    movedNote = true
    fsyncTheFile(dirname(paths.archive))
    rmSync(paths.folder, { recursive: true })
    return { packed: true, archive: paths.archive, note: paths.note, folder: paths.folder, files: before.files, tarSha256 }
  } catch (error) {
    for (const temporary of [temporaryArchive, temporaryNote]) { try { unlinkSync(temporary) } catch (ignored) { void ignored } }
    if (movedNote) { try { unlinkSync(paths.note) } catch (ignored) { void ignored } }
    if (movedArchive) { try { unlinkSync(paths.archive) } catch (ignored) { void ignored } }
    return { packed: false, folder: paths.folder, why: error instanceof Error ? error.message : String(error) }
  }
}

/** @param {string} path */
function fsyncTheFile(path) {
  const fd = openSync(path, 'r')
  try { fsyncSync(fd) } finally { closeSync(fd) }
}

/** @param {Uint8Array} bytes @returns {Record<string, string>} */
function paxRecords(bytes) {
  /** @type {Record<string, string>} */
  const records = {}
  let at = 0
  while (at < bytes.length) {
    const space = bytes.indexOf(0x20, at)
    if (space < 0) break
    const length = Number(Buffer.from(bytes.subarray(at, space)).toString('latin1'))
    if (!Number.isInteger(length) || length <= 0 || at + length > bytes.length) fail('The packed read record has a malformed pax header.')
    const record = Buffer.from(bytes.subarray(space + 1, at + length)).toString('utf8').replace(/\n$/u, '')
    const equals = record.indexOf('=')
    if (equals > 0) records[record.slice(0, equals)] = record.slice(equals + 1)
    at += length
  }
  return records
}

/** @param {Uint8Array} header @param {number} at @param {number} length @returns {number} */
function numberField(header, at, length) {
  if ((header[at] ?? 0) & 0x80) {
    let value = (header[at] ?? 0) & 0x7f
    for (let index = at + 1; index < at + length; index++) value = value * 256 + (header[index] ?? 0)
    return value
  }
  const text = Buffer.from(header.subarray(at, at + length)).toString('latin1').replace(/\0.*$/su, '').trim()
  return text === '' ? 0 : Number.parseInt(text, 8)
}

/** @param {Uint8Array} header @param {number} at @param {number} length @returns {string} */
function textField(header, at, length) {
  return Buffer.from(header.subarray(at, at + length)).toString('utf8').replace(/\0.*$/su, '')
}

/** Every regular file in the tar stream, under `reads/`, with its bytes. Links and special files are refused.
 * @param {Buffer} bytes
 * @param {string} archive
 * @returns {TarEntry[]}
 */
function tarEntries(bytes, archive) {
  /** @type {TarEntry[]} */
  const files = []
  let at = 0
  /** @type {PaxRecord | null} */
  let extended = null
  /** @type {string | null} */
  let longName = null
  while (at + BLOCK <= bytes.length) {
    const header = bytes.subarray(at, at + BLOCK)
    if (header.every((byte) => byte === 0)) break
    const stored = numberField(header, 148, 8)
    let sum = 0
    for (let index = 0; index < BLOCK; index++) sum += index >= 148 && index < 156 ? 0x20 : (header[index] ?? 0)
    if (stored !== sum) fail(`The packed read record at ${archive} has a tar header whose checksum does not match.`)
    const type = String.fromCharCode(header[156] ?? 0)
    const headerSize = numberField(header, 124, 12)
    const size = extended?.size === undefined ? headerSize : Number(extended.size)
    if (!Number.isSafeInteger(size) || size < 0) fail(`The packed read record at ${archive} has an unusable file size.`)
    const dataAt = at + BLOCK
    if (dataAt + size > bytes.length) fail(`The packed read record at ${archive} ends inside a file.`)
    const content = bytes.subarray(dataAt, dataAt + size)
    const headerName = textField(header, 0, 100)
    const prefix = textField(header, 345, 155)
    const name = extended?.path ?? longName ?? (prefix === '' ? headerName : `${prefix}/${headerName}`)
    at = dataAt + Math.ceil(size / BLOCK) * BLOCK
    if (type === 'x') { extended = paxRecords(content); continue }
    if (type === 'g') continue
    if (type === 'L') { longName = Buffer.from(content).toString('utf8').replace(/\0.*$/su, ''); continue }
    if (type === 'K') continue
    if (type === '5' || type === '0' || type === '\0' || type === '7') {
      const relative = name.replace(/\/+$/u, '')
      if (relative === THE_READS_FOLDER) {
        if (type !== '5') fail(`The packed read record at ${archive} has a file where the reads folder belongs.`)
      } else {
        if (!relative.startsWith(`${THE_READS_FOLDER}/`)) fail(`The packed read record at ${archive} has an entry outside reads/: ${name}.`)
        const inside = relative.slice(THE_READS_FOLDER.length + 1)
        if (inside.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(`The packed read record at ${archive} has an unusable path: ${name}.`)
        if (type === '5') { /* An empty folder adds no file to the record. */ }
        else files.push({ path: inside, bytes: content })
      }
    } else fail(`The packed read record at ${archive} contains a link or special entry: ${name}.`)
    extended = null
    longName = null
  }
  return files
}
