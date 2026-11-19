// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE GATE AGAINST A NEW IPv4 ADDRESS ANYWHERE IN THE REPOSITORY (18 October 2026, under the address rule). Part of the
 * merge tool, tools/the-merger.mjs. Integrate runs it as its
 * fourth guard, after the owner-content gate: the lines an entry adds, on the rebased entry, before the regeneration; and
 * the whole tree, on the landing commit, after the regeneration and before the commit-address gate, the build and the
 * suite.
 *
 * The owner's rule is that addresses, user names, servers and accounts never leak. The owner-content gate
 * (owner-content.mjs) refuses a shared or tailnet address only in the paths that ship, but an address in a test, a design
 * note, a document or a tool is as public as any other line once the repository is pushed. So this gate reads the lines
 * an entry ADDS (`git diff --unified=0 main...<entry>`, the lines that start with +) in EVERY path, and refuses an IPv4
 * address by its SHAPE, whoever's it is. It lets through only the addresses that name no machine of anybody's:
 *
 *   - loopback, 127/8;
 *   - the unspecified address, all four numbers 0, which a server binds to listen on every interface;
 *   - the three documentation ranges of RFC 5737, for an example or a test: 192.0.2.0/24, 198.51.100.0/24 and
 *     203.0.113.0/24.
 *
 * A line already on main never blocks the added-line screen. The whole-tree scan below reads it. Nothing here rewrites
 * history, so an address an old commit holds stays in that commit. A made-up address in a test is better built at run time, so no
 * file holds one written out. An address the repository truly needs written out goes through an entry of
 * addresses-allowed.mjs, with its key and its reason; a public resolver an isolation test tries to reach is the kind.
 *
 * WHAT THE REFUSAL SAYS: the file, the line, the column and the kind of range, and never the address. The refusal goes
 * to the entry's record and to the merge log, and the address must not go there either; the screen this module returns,
 * which integrate keeps as the guard's log, holds no address for the same reason.
 *
 * WHAT IS AN ADDRESS: four decimal numbers joined by dots, each from 0 to 255, with no digit and no "<digit>." right
 * before them and no digit or ".<digit>" right after them. So a version, an OID and a run of five numbers are not one,
 * and an address inside a host name (`<address>.nip.io`) or right after a host name's dot (`host.<address>`) is. A number
 * written with leading zeros is read by its value.
 *
 * A BINARY FILE the entry adds or changes is read byte by byte, as text of one byte a character, and refused by the file
 * and the byte an address starts at. An address already in the file's copy on main is not new, as a line already on main
 * is not. A compressed file (gzip, zip, zstandard, xz, bzip2, 7z, by the bytes it starts with) says nothing until it is
 * unpacked, so it is named as not read, as every binary file was before. Only the files an entry changes are read; the
 * largest binary on main, an image of 4.1 MB, took about 30 ms to read and search when this was written.
 *
 * THE WHOLE TREE (wave 13u round 167). The added-line screen never read what main already held, so the addresses on
 * main before it stayed. screenTheTree reads every file of one commit's tree, from git's objects and not from a work
 * tree, as the added-line screen reads an added line: a text file by line and column, a binary file by byte, a
 * compressed file and a submodule named as not read. It lets through what the added-line screen lets through, so an
 * entry that leaves a refused address anywhere in the tree bounces at its landing, whichever change wrote the address.
 * tools/merge-tool/the-address-scan.mjs runs it by hand. The tree of 9,564 files and 327 MB took about 2 s to read
 * when this was written.
 *
 * This module imports nothing from the tool but the owner-content gate's git reader and a-library-is-not-a-program.mjs,
 * which does nothing when it is imported, so a test and a dry run use it without starting a run.
 */

import './a-library-is-not-a-program.mjs'
import { spawnSync } from 'node:child_process'
import { ALLOWED } from './addresses-allowed.mjs'
import { gitText, theAddedLines } from './owner-content.mjs'

/** @typedef {import('./addresses-allowed.mjs').AnAllowance} AnAllowance */
/** @typedef {{ first: readonly number[], bits: number }} ARange */
/** @typedef {{ at: number, words: string, kind: string }} AHit */
/** @typedef {{ file: string, line: number, column: number, kind: string } | { file: string, byte: number, kind: string }} AFinding */
/** @typedef {AFinding & { key: string, why: string }} ALetThrough */
/** @typedef {{ files: number, lines: number, notText: string[], binary: string[] }} WhatWasRead */
/** @typedef {{ base: string, head: string, read: WhatWasRead, refused: AFinding[], letThrough: ALetThrough[] }} TheScreen */
/** @typedef {{ commit: string, read: WhatWasRead, refused: AFinding[], letThrough: ALetThrough[] }} TheTreeScreen */

/** The ranges that name no machine of anybody's, which the gate lets through. */
const NO_MACHINES_RANGES = Object.freeze([
  { first: [127], bits: 8 },
  { first: [0, 0, 0, 0], bits: 32 },
  { first: [192, 0, 2], bits: 24 },
  { first: [198, 51, 100], bits: 24 },
  { first: [203, 0, 113], bits: 24 },
])

/** The ranges the gate refuses, each with the words its refusal uses. An address in none of them is the last kind. */
const THE_KINDS = Object.freeze([
  { first: [10], bits: 8, kind: 'a private-network address (10/8)' },
  { first: [172, 16], bits: 12, kind: 'a private-network address (172.16/12)' },
  { first: [192, 168], bits: 16, kind: 'a private-network address (192.168/16)' },
  { first: [100, 64], bits: 10, kind: 'a shared address of a carrier or a tailnet (100.64/10)' },
  { first: [169, 254], bits: 16, kind: 'a link-local address (169.254/16)' },
  { first: [224], bits: 4, kind: 'a multicast address (224/4)' },
  { first: [240], bits: 4, kind: 'a reserved or broadcast address (240/4)' },
  { first: [0], bits: 8, kind: 'an address of this network (0/8)' },
])
const ANY_OTHER = 'an address in no private or special range'

const AN_ADDRESS = /(?<!\d)(?<!\d\.)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?!\d|\.\d)/g

/** The bytes a compressed file starts with: gzip, zip, zstandard, xz, bzip2 and 7z. */
const COMPRESSED = Object.freeze([
  [0x1f, 0x8b],
  [0x50, 0x4b, 0x03, 0x04],
  [0x28, 0xb5, 0x2f, 0xfd],
  [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00],
  [0x42, 0x5a, 0x68],
  [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
])

/** Whether these bytes, one a character, start as a compressed file does. @param {string} bytes */
const isCompressed = (bytes) => COMPRESSED.some((start) => start.every((byte, at) => bytes.charCodeAt(at) === byte))

/** This process's environment without git's own variables, which would point git at another repository. */
function withoutGitsVariables() {
  const env = { ...process.env }
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY']) delete env[name]
  return env
}

/**
 * ONE FILE AT ONE COMMIT, AS BYTES, one byte a character, or null when the file is not there. Read as gitText reads, with
 * no automatic housekeeping and git's own variables left out.
 * @param {string} repo @param {string} commit @param {string} file
 * @returns {string | null}
 */
function theBytesOf(repo, commit, file) {
  const result = spawnSync('git', ['-c', 'gc.auto=0', '-C', repo, 'cat-file', 'blob', `${commit}:${file}`], { env: withoutGitsVariables(), encoding: 'latin1', maxBuffer: 512 * 1024 * 1024 })
  return result.status === 0 ? result.stdout : null
}

/** The four numbers as one unsigned 32-bit number. @param {readonly number[]} four */
const asANumber = (four) => four.reduce((sum, one) => sum * 256 + one, 0)

/** Whether the address `value` is in `range`. @param {number} value @param {ARange} range */
function isIn(value, range) {
  const size = 2 ** (32 - range.bits)
  const start = asANumber([0, 1, 2, 3].map((at) => range.first[at] ?? 0))
  return Math.floor(value / size) === Math.floor(start / size)
}

/**
 * EVERY ADDRESS ON ONE LINE THAT THE GATE REFUSES, with where it starts on the line and the kind of its range. `words`
 * is the address as written, which the gate uses only to see whether an allow-list entry covers it.
 * @param {string} line
 * @returns {AHit[]}
 */
export function theAddressesOn(line) {
  /** @type {AHit[]} */
  const out = []
  for (const hit of line.matchAll(AN_ADDRESS)) {
    const four = hit.slice(1, 5).map(Number)
    if (four.some((one) => one > 255)) continue
    const value = asANumber(four)
    if (NO_MACHINES_RANGES.some((range) => isIn(value, range))) continue
    out.push({ at: hit.index ?? 0, words: hit[0], kind: THE_KINDS.find((range) => isIn(value, range))?.kind ?? ANY_OTHER })
  }
  return out
}

/**
 * Whether one occurrence of `text` on the line holds the whole hit.
 * @param {string} line @param {string} text @param {AHit} hit
 */
function covers(line, text, hit) {
  if (text === '') return false
  for (let at = line.indexOf(text); at !== -1; at = line.indexOf(text, at + 1)) {
    if (at <= hit.at && hit.at + hit.words.length <= at + text.length) return true
  }
  return false
}

/**
 * ONE HIT, REFUSED OR LET THROUGH: let through when an allow-list entry for its file covers it on `text`, the line or
 * the binary file it is on.
 * @param {{ refused: AFinding[], letThrough: ALetThrough[] }} screen @param {readonly AnAllowance[]} allowed
 * @param {AFinding} finding @param {string} text @param {AHit} hit
 */
function judge(screen, allowed, finding, text, hit) {
  const allowance = allowed.find((one) => one.file === finding.file && covers(text, one.text, hit))
  if (allowance === undefined) screen.refused.push(finding)
  else screen.letThrough.push({ ...finding, key: allowance.key, why: allowance.why })
}

/**
 * SCREEN THE LINES AN ENTRY ADDS, in every path: `git diff main...entry`, without renames. A deleted file is not read; a
 * file git does not read as text is named in `read.notText`.
 * @param {{ repo: string, base: string, head: string, allowed?: readonly AnAllowance[] }} what
 * @returns {TheScreen}
 */
export function screenTheAddedLines({ repo, base, head, allowed = ALLOWED }) {
  const range = `${base}...${head}`
  const parts = gitText(repo, ['diff', '--name-status', '-z', '--no-renames', range]).split('\0')
  /** @type {TheScreen} */
  const screen = { base, head, read: { files: 0, lines: 0, notText: [], binary: [] }, refused: [], letThrough: [] }
  /** @type {string | null} the commit both sides grew from, which `base...head` compares with, read once when needed */
  let mergeBase = null
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const status = parts[i] ?? ''
    const file = parts[i + 1] ?? ''
    if (status === 'D') continue
    const diff = gitText(repo, ['diff', '--unified=0', '--no-renames', '--no-color', '--no-ext-diff', '--no-textconv', range, '--', `:(literal)${file}`])
    const added = theAddedLines(diff)
    screen.read.files += 1
    screen.read.lines += added.length
    if (added.length === 0 && /^Binary files /m.test(diff)) {
      const bytes = theBytesOf(repo, head, file)
      if (bytes === null || isCompressed(bytes)) {
        screen.read.notText.push(file)
        continue
      }
      screen.read.binary.push(file)
      mergeBase ??= gitText(repo, ['merge-base', base, head]).trim()
      const before = status === 'A' ? null : theBytesOf(repo, mergeBase, file)
      const onMain = new Set(before === null ? [] : theAddressesOn(before).map((hit) => hit.words))
      for (const hit of theAddressesOn(bytes)) {
        if (!onMain.has(hit.words)) judge(screen, allowed, { file, byte: hit.at + 1, kind: hit.kind }, bytes, hit)
      }
      continue
    }
    for (const { number, text } of added) {
      for (const hit of theAddressesOn(text)) judge(screen, allowed, { file, line: number, column: hit.at + 1, kind: hit.kind }, text, hit)
    }
  }
  return screen
}

/** The most bytes of files one `git cat-file --batch` is asked for; a larger file is asked for alone. */
const A_BATCH = 64 * 1024 * 1024

/** How many bytes from its start a file is looked at to tell binary from text, as git does: a NUL among them is binary. */
const FIRST_FEW_BYTES = 8000

/**
 * EVERY FILE OF ONE COMMIT'S TREE, in git's order, with its bytes, or with null for an entry that is not a file: a
 * submodule's commit. The names come from `git ls-tree -r`, and the bytes from `git cat-file --batch`, a batch at a
 * time, so the whole tree is never held at once.
 * @param {string} repo @param {string} commit a full commit id
 * @returns {Generator<{ file: string, bytes: Buffer | null }>}
 */
function* theFilesOf(repo, commit) {
  /** @type {{ file: string, id: string, size: number }[]} */
  const blobs = []
  for (const entry of gitText(repo, ['ls-tree', '-r', '-z', '-l', '--full-tree', commit]).split('\0')) {
    if (entry === '') continue
    const tab = entry.indexOf('\t')
    const [, type = '', id = '', size = ''] = entry.slice(0, tab).split(/ +/)
    const file = entry.slice(tab + 1)
    if (type === 'blob') blobs.push({ file, id, size: Number(size) })
    else yield { file, bytes: null }
  }
  for (let start = 0; start < blobs.length; ) {
    let end = start + 1
    let size = blobs[start]?.size ?? 0
    while (end < blobs.length && size + (blobs[end]?.size ?? 0) <= A_BATCH) size += blobs[end++]?.size ?? 0
    const batch = blobs.slice(start, end)
    const result = spawnSync('git', ['-c', 'gc.auto=0', '-C', repo, 'cat-file', '--batch'], {
      env: withoutGitsVariables(), input: batch.map((one) => `${one.id}\n`).join(''), maxBuffer: size + batch.length * 128 + 1024,
    })
    if (result.status !== 0) throw new Error(`git cat-file --batch in ${repo} exited ${String(result.status)}: ${String(result.stderr ?? result.error ?? '').trim().slice(-1500)}`)
    let at = 0
    for (const one of batch) {
      const newline = result.stdout.indexOf(10, at)
      const header = result.stdout.toString('latin1', at, newline === -1 ? undefined : newline)
      if (newline === -1 || header !== `${one.id} blob ${String(one.size)}`) {
        throw new Error(`git cat-file read "${header}" for ${one.file} at ${commit}, where the tree names the blob ${one.id} of ${String(one.size)} bytes.`)
      }
      yield { file: one.file, bytes: result.stdout.subarray(newline + 1, newline + 1 + one.size) }
      at = newline + 1 + one.size + 1
    }
    start = end
  }
}

/**
 * SCREEN EVERY FILE OF ONE COMMIT'S TREE, whichever change wrote what is in it. A file with a NUL in its first
 * FIRST_FEW_BYTES bytes is binary and read byte by byte, unless it is compressed; a text file is read by line, and a
 * last newline starts no line. A commit the repository does not have fails loudly.
 * @param {{ repo: string, commit: string, allowed?: readonly AnAllowance[] }} what
 * @returns {TheTreeScreen}
 */
export function screenTheTree({ repo, commit, allowed = ALLOWED }) {
  const resolved = spawnSync('git', ['-c', 'gc.auto=0', '-C', repo, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${commit}^{commit}`], { env: withoutGitsVariables(), encoding: 'utf8' })
  if (resolved.status !== 0) throw new Error(`The repository at ${repo} has no commit "${commit}" for the address scan to read.`)
  /** @type {TheTreeScreen} */
  const screen = { commit: resolved.stdout.trim(), read: { files: 0, lines: 0, notText: [], binary: [] }, refused: [], letThrough: [] }
  for (const { file, bytes } of theFilesOf(repo, screen.commit)) {
    if (bytes === null) {
      screen.read.notText.push(file)
      continue
    }
    if (bytes.subarray(0, FIRST_FEW_BYTES).includes(0)) {
      const text = bytes.toString('latin1')
      if (isCompressed(text)) {
        screen.read.notText.push(file)
        continue
      }
      screen.read.files += 1
      screen.read.binary.push(file)
      for (const hit of theAddressesOn(text)) judge(screen, allowed, { file, byte: hit.at + 1, kind: hit.kind }, text, hit)
      continue
    }
    const lines = bytes.toString('utf8').split('\n')
    if (lines.at(-1) === '') lines.pop()
    screen.read.files += 1
    screen.read.lines += lines.length
    lines.forEach((text, at) => {
      for (const hit of theAddressesOn(text)) judge(screen, allowed, { file, line: at + 1, column: hit.at + 1, kind: hit.kind }, text, hit)
    })
  }
  return screen
}

/** `count` and the noun, in the plural unless it is one. @param {number} count @param {string} noun */
const counted = (count, noun) => `${String(count)} ${noun}${count === 1 ? '' : 's'}`

/** Where one refused address is and the kind of its range, and never the address. @param {AFinding} one */
export const theFindingSaid = (one) =>
  'byte' in one ? `${one.file} byte ${String(one.byte)}, ${one.kind}` : `${one.file} line ${String(one.line)} column ${String(one.column)}, ${one.kind}`

/** How many addresses, as the refusals say it. @param {number} count */
const addressesCounted = (count) => (count === 1 ? 'an IPv4 address' : `${String(count)} IPv4 addresses`)

/** What both refusals say after the places, and what to do instead. */
const THE_WAY_OUT =
  'The address is not repeated here, so this refusal does not spread it. An example or a test takes one from ' +
  '192.0.2.0/24, 198.51.100.0/24 or 203.0.113.0/24, or builds a made-up one at run time; an address the repository ' +
  'truly needs written out takes an entry, with its key and its reason, in tools/merge-tool/addresses-allowed.mjs.'

/**
 * WHY THE GATE REFUSES, for the guard's detail, or null when it does not. It never repeats an address.
 * @param {TheScreen} screen
 */
export function theRefusalSaid(screen) {
  if (screen.refused.length === 0) return null
  return (
    `The entry adds ${addressesCounted(screen.refused.length)} outside loopback, the unspecified address and the ` +
    `documentation ranges: ${screen.refused.map(theFindingSaid).join('; ')}. ${THE_WAY_OUT}`
  )
}

/**
 * WHY THE LANDING IS REFUSED BY THE WHOLE-TREE SCAN, for the guard's detail, or null when it is not. It never repeats an
 * address.
 * @param {TheTreeScreen} screen
 */
export function theTreeRefusalSaid(screen) {
  if (screen.refused.length === 0) return null
  return (
    `The tree at ${screen.commit} holds ${addressesCounted(screen.refused.length)} outside loopback, the unspecified ` +
    `address and the documentation ranges: ${screen.refused.map(theFindingSaid).join('; ')}. The scan reads every file ` +
    `of the tree, so an address main already held is refused as well as one the entry adds. ${THE_WAY_OUT}`
  )
}

/**
 * ONE SENTENCE FOR THE LOG: what the gate read, how many it refused, and which entries let a hit through.
 * @param {TheScreen} screen
 */
export function theScreenSaid(screen) {
  const notText = screen.read.notText.length === 0 ? '' : ` (${counted(screen.read.notText.length, 'file')} not text: ${screen.read.notText.join(', ')})`
  const binary = screen.read.binary.length === 0 ? '' : ` (${counted(screen.read.binary.length, 'binary file')} read byte by byte: ${screen.read.binary.join(', ')})`
  const keys = [...new Set(screen.letThrough.map((one) => `"${one.key}"`))]
  const through = screen.letThrough.length === 0 ? '' : `; ${String(screen.letThrough.length)} let through by ${keys.join(', ')}`
  const refused = screen.refused.length === 0 ? 'none refused' : `${String(screen.refused.length)} refused`
  return `The address gate read ${counted(screen.read.lines, 'added line')} in ${counted(screen.read.files, 'file')}${binary}${notText}: ${refused}${through}.`
}

/**
 * ONE SENTENCE FOR THE LOG OF THE WHOLE-TREE SCAN: what it read at which commit, how many it refused, and which entries
 * let a hit through. The binary files are counted and not named, since a tree holds hundreds.
 * @param {TheTreeScreen} screen
 */
export function theTreeSaid(screen) {
  const binary = screen.read.binary.length === 0 ? '' : ` (${counted(screen.read.binary.length, 'binary file')} read byte by byte)`
  const notText = screen.read.notText.length === 0 ? '' : ` (${counted(screen.read.notText.length, 'file')} not text: ${screen.read.notText.join(', ')})`
  const keys = [...new Set(screen.letThrough.map((one) => `"${one.key}"`))]
  const through = screen.letThrough.length === 0 ? '' : `; ${String(screen.letThrough.length)} let through by ${keys.join(', ')}`
  const refused = screen.refused.length === 0 ? 'none refused' : `${String(screen.refused.length)} refused`
  return `The address scan read ${counted(screen.read.lines, 'line')} in ${counted(screen.read.files, 'file')} at ${screen.commit}${binary}${notText}: ${refused}${through}.`
}
