#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE PATHS THE CODE NAMES: the floor under what the suite is recorded reading. A documentation change that no
 * test reads lands by itself. A hole was closed (message GIxHaLdp_dyo): a test
 * may start a program that is not node (git, cat, a shell), whose reads no recorder sees, so every path that the
 * code of this repository names counts as read. It over-counts, since a comment names paths too, and that errs
 * toward testing, the safe side.
 *
 * What counts as naming a path: a string written in a file under tests/, tools/, src/ or scripts/ that is, after
 * a leading "./" or "/" is dropped, a file or folder of this checkout; and the strings written one after another in
 * a join(...) or resolve(...) call, joined with "/". A named folder names everything under it.
 *
 *     node tools/what-tests-name.mjs [--root <checkout>] [--json]
 *
 * Prints how many files and folders the code names; with --json, the lists. Reads only.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, posix, resolve } from 'node:path'

/** The folders whose files are code, read for the paths they name. */
export const CODE_FOLDERS = ['tests', 'tools', 'for-agents', 'src', 'scripts']

/** A string literal with nothing interpolated: '…', "…" or `…` without ${. */
const A_STRING = /'([^'\\\n]{1,300})'|"([^"\\\n]{1,300})"|`([^`\\$\n]{1,300})`/gu
/** A join(…) or resolve(…) call's argument list, up to its closing parenthesis on the same line. */
const A_JOIN = /\b(?:join|resolve)\(([^()\n]{1,400})\)/gu

/**
 * The strings written one after another at the start of a join's arguments, joined with "/".
 * @param {string} args
 */
function theJoinedPrefix(args) {
  const parts = []
  for (const piece of args.split(',')) {
    const one = piece.trim().match(/^['"`]([^'"`$]+)['"`]$/u)
    if (one === null) {
      if (parts.length === 0) continue
      break
    }
    parts.push(one[1])
  }
  return parts.length === 0 ? null : parts.join('/')
}

/**
 * A candidate as a path relative to the checkout, or null when it cannot be one.
 * @param {string} text
 */
function asAPath(text) {
  let path = text.trim().replace(/^\.\//u, '').replace(/^\/+/u, '').replace(/\/+$/u, '')
  if (path === '' || path.includes(' ') || path.includes('*') || path.startsWith('..') || path.startsWith('http')) return null
  path = posix.normalize(path)
  return path === '.' || path.startsWith('..') ? null : path
}

/**
 * THE FILES AND FOLDERS OF THIS CHECKOUT THAT ITS CODE NAMES.
 * @param {string} root
 * @returns {{ files: string[], folders: string[] }}
 */
export function whatTheCodeNames(root) {
  const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', ...CODE_FOLDERS], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((one) => /\.(?:[cm]?[jt]sx?|json|sh)$/u.test(one))
  const named = new Set()
  for (const file of tracked) {
    let text
    try {
      text = readFileSync(join(root, file), 'utf8')
    } catch {
      continue
    }
    for (const match of text.matchAll(A_STRING)) {
      const path = asAPath(match[1] ?? match[2] ?? match[3] ?? '')
      if (path !== null) named.add(path)
    }
    for (const match of text.matchAll(A_JOIN)) {
      const joined = theJoinedPrefix(match[1] ?? '')
      const path = joined === null ? null : asAPath(joined)
      if (path !== null) named.add(path)
    }
  }
  /** @type {string[]} */
  const files = []
  /** @type {string[]} */
  const folders = []
  for (const path of named) {
    const at = join(root, path)
    if (!existsSync(at)) continue
    ;(statSync(at).isDirectory() ? folders : files).push(path)
  }
  return { files: files.sort(), folders: folders.sort() }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--root')
  const root = resolve(at === -1 ? process.cwd() : String(args[at + 1]))
  const named = whatTheCodeNames(root)
  if (args.includes('--json')) process.stdout.write(`${JSON.stringify(named, null, 2)}\n`)
  else process.stdout.write(`The code of ${root} names ${String(named.files.length)} files and ${String(named.folders.length)} folders.\n`)
}
