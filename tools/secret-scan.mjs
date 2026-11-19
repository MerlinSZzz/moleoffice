#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LOOK FOR A KEY IN FILES THAT ARE ABOUT TO LEAVE THIS MACHINE, AND SAY WHAT WAS FOUND.
 *
 * A sensitive-data scan is a dedicated tool in the office for agents to use: one scan any agent can run,
 * so nobody has to write one again, and so a backup, an export or an upload can be looked at before it goes.
 * write one again, and so a backup, an export or an upload can be looked at before it goes.
 *
 * Usage:
 *   node tools/secret-scan.mjs <path>...        walk these files and folders
 *   node tools/secret-scan.mjs <path>... --json the same answer as one JSON line
 *   node tools/secret-scan.mjs <path>... --db <file>   ask that office database about issued keys
 *
 * `--db` names the office database whose `held_keys` the 64-hex strings are looked up in. Without
 * it, the canonical database of this checkout is asked, which is the office's own. A copy, a backup
 * or a test world's database is named with the flag; `canonicalDatabasePath` reads `.env` and
 * ignores the shell on purpose, so there is no environment variable that would move it.
 *
 * IT NEVER PRINTS A KEY. It prints how many of each kind, and which file each was in, and nothing
 * of the value itself — not a prefix, not a length. A scan whose output has to be treated as a
 * secret is a scan nobody can paste into a message, which is most of what this is for.
 *
 * WHAT IT LOOKS FOR, AND WHY EACH ONE
 *
 *   1. THE SHAPES providers use: DeepSeek (`sk-` and 32 hex), OpenRouter (`sk-or-v1-`), Anthropic
 *      (`sk-ant-`), OpenAI (`sk-proj-`), a GitHub token, an AWS access key id, and a PEM private
 *      key block. A shape is a guess, and it is a good one: these prefixes are theirs alone.
 *   2. A KEY THIS OFFICE ISSUED. An office key is 32 random bytes written as 64 hex characters, and
 *      the office keeps only its SHA-256 (`held_keys`). So every 64-hex string in the files is
 *      hashed and looked up in that table. A hit is certain, not a guess: it is a key the office
 *      minted, printed once when an agent registered and then written into a transcript. Nothing
 *      else in the file — and there are many 64-hex hashes in a transcript — is touched.
 *   3. THE EXACT SECRETS THIS MACHINE HOLDS, read from the files that hold them: the office's own
 *      keys (`data/keys.json`), any test world's keys, the agent key headers in the notes folders,
 *      and the `env` files under ~/.config/mole-office and ~/.cache/mole-office. Those values are
 *      read to be searched for, and are never written anywhere.
 *   4. A KEY WRITTEN BESIDE ITS NAME: 64 hex right after "person", "office" or the office's key
 *      header, which is what a key file or a request header looks like when something prints one.
 *
 * WHAT IT SAYS WHEN IT CANNOT LOOK. A sandbox holds none of those files and usually no database. The
 * report names every source it could not read, so a clean answer is never mistaken for a complete
 * one.
 *
 * IT EXITS 1 WHEN ANYTHING WAS FOUND, and 0 when nothing was. So a script can stop a push with it.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { canonicalDatabasePath, keysPathFrom, whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'

/** The checkout this tool was loaded from, which is where its own office's files are. */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The provider key shapes. Each one's prefix belongs to that provider and to nothing else. */
const SHAPES = [
  ['openrouter-key', /sk-or-v1-[a-f0-9]{64}/g],
  ['anthropic-key', /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ['openai-key', /sk-proj-[A-Za-z0-9_-]{20,}/g],
  ['deepseek-key', /(?<![A-Za-z0-9])sk-[a-f0-9]{32}(?![A-Za-z0-9])/g],
  ['github-token', /gh[pousr]_[A-Za-z0-9]{30,}/g],
  ['aws-access-key', /AKIA[0-9A-Z]{16}/g],
  ['private-key-block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['key-beside-its-name', /(?:"person"|"office"|x-mole-office-key)[":\s\\]{1,6}[a-f0-9]{64}(?![a-f0-9])/gi],
]
const HEX64 = /(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])/g

function say(words) {
  process.stdout.write(`${words}\n`)
}

/** Every 64-hex the office has issued a key for, as SHA-256, or null because no database answered. */
function theOfficesKeyHashes(missing, named) {
  const path = named ?? canonicalDatabasePath()
  const refusal = whyThisCheckoutMayNotOpenTheDatabase(path)
  if (refusal !== null) throw new Error(refusal)
  if (!existsSync(path)) {
    missing.push(`the office database at ${path}, so a key this office issued would not be recognised`)
    return null
  }
  try {
    // READ ONLY, AND NEVER THE LIVE FILE'S CONTENT BEYOND THIS ONE TABLE. `held_keys` holds a hash
    // per key and no key, which is why this tool can look a key up without ever holding one.
    const db = new Database(path, { readonly: true, fileMustExist: true })
    try {
      return new Set(db.prepare('SELECT key_hash FROM held_keys').all().map((row) => String(row.key_hash)))
    } finally {
      db.close()
    }
  } catch (error) {
    missing.push(`the office database at ${path} could not be read (${String(error)}), so a key this office issued would not be recognised`)
    return null
  }
}

/** The exact secrets this machine holds, with what each one is, and the sources that were missing. */
function theSecretsThisMachineHolds(missing) {
  const found = new Map()
  const keep = (what, value) => {
    const trimmed = String(value ?? '').trim().replace(/^["']|["']$/g, '')
    if (trimmed.length >= 16) found.set(trimmed, what)
  }
  const home = homedir()
  // THIS CHECKOUT'S OWN KEY FILE, and every test world's, which holds keys of its own for as long as
  // the world is up. A path typed from memory would be one checkout's and nobody else's.
  const worlds = join(REPO, '.logs', 'isolated')
  // WHERE THE KEY FILE IS, AND WHAT IT IS CALLED, ARE ASKED AND NEVER SPELLED. src/config/settings.mjs
  // is the one declaration; a name written out here would be a second one, free to disagree with it the
  // day the file moves, and this scan would then say nothing was found where it did not look.
  const ourKeys = keysPathFrom({})
  const whatAKeyFileIsCalled = basename(ourKeys)
  const keyFiles = [
    ourKeys,
    ...(existsSync(worlds)
      ? readdirSync(worlds)
          .map((name) => join(worlds, name, whatAKeyFileIsCalled))
          .filter((path) => existsSync(path))
      : []),
  ]
  for (const path of keyFiles) {
    if (!existsSync(path)) {
      missing.push(`${path}, so those keys were not searched for`)
      continue
    }
    try {
      const held = JSON.parse(readFileSync(path, 'utf8'))
      for (const [name, value] of Object.entries(held)) if (typeof value === 'string') keep(`office-${name}-key`, value)
    } catch {
      missing.push(`${path} could not be read as JSON, so the office's own keys were not searched for`)
    }
  }
  const envFiles = [
    join(home, '.config', 'mole-office'),
    join(home, '.cache', 'mole-office', 'dsh'),
  ]
  let anyEnv = false
  for (const folder of envFiles) {
    if (!existsSync(folder)) continue
    for (const name of readdirSync(folder)) {
      const path = join(folder, name)
      if (!statSync(path).isFile() || !/\.env$|^env$/.test(name)) continue
      anyEnv = true
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const at = line.indexOf('=')
        if (at > 0 && !/BUCKET|PATH|DIR|HOST|PORT/i.test(line.slice(0, at))) keep(`secret-from-${line.slice(0, at).trim().toLowerCase()}`, line.slice(at + 1))
      }
    }
  }
  if (!anyEnv) missing.push('no env file under ~/.config/mole-office or ~/.cache/mole-office/dsh, so provider keys held there were not searched for')
  const notes = join(home, '.cache', 'mole-office', 'notes')
  if (existsSync(notes)) {
    for (const who of readdirSync(notes)) {
      const folder = join(notes, who)
      if (!statSync(folder).isDirectory()) continue
      for (const name of readdirSync(folder)) {
        if (!/header/i.test(name)) continue
        for (const line of readFileSync(join(folder, name), 'utf8').split('\n')) {
          if (/^x-mole-office-key/i.test(line)) keep('office-agent-key', line.slice(line.indexOf(':') + 1))
        }
      }
    }
  } else {
    missing.push(`${notes}, so agent key headers were not searched for`)
  }
  return found
}

/** Every file under these paths, with a folder walked and a link left alone. */
function filesUnder(paths) {
  const out = []
  const walk = (path) => {
    let held
    try {
      // lstat, NOT stat: a link is left alone, and stat would follow it and read the file twice,
      // once under each name.
      held = lstatSync(path)
    } catch (error) {
      out.push({ path, unreadable: String(error) })
      return
    }
    if (held.isSymbolicLink()) return
    if (held.isDirectory()) {
      for (const name of readdirSync(path)) walk(join(path, name))
      return
    }
    if (held.isFile()) out.push({ path })
  }
  for (const path of paths) walk(path)
  return out
}

/** One file's bytes, with a .zst read through zstd. */
function bytesOf(path) {
  if (!path.endsWith('.zst')) return readFileSync(path, 'utf8')
  try {
    return execFileSync('zstd', ['-dc', path], { maxBuffer: 1024 * 1024 * 1024 }).toString('utf8')
  } catch (error) {
    throw new Error(`zstd could not read it: ${String(error)}`)
  }
}

function main() {
  const asked = process.argv.slice(2)
  const json = asked.includes('--json')
  const at = asked.indexOf('--db')
  const named = at === -1 ? null : asked[at + 1] ?? null
  if (at !== -1 && named === null) {
    process.stderr.write('--db needs the path of an office database after it. Nothing was read.\n')
    process.exit(2)
  }
  // THE VALUE AFTER --db IS NOT A PATH TO SCAN, and when there is no --db there is no such value.
  // Writing `index !== at + 1` on its own dropped argument 0 whenever --db was absent, because
  // indexOf answers -1: the FIRST file named was silently skipped and a leak in it was reported as
  // nothing found, exit 0. A scan that answers "clean" about a file it never opened is the one
  // answer this tool must never give.
  const theDatabaseNamed = at === -1 ? -1 : at + 1
  const paths = asked.filter((one, index) => one !== '--json' && one !== '--db' && index !== theDatabaseNamed)
  if (paths.length === 0) {
    process.stderr.write('node tools/secret-scan.mjs <path>... [--json]\nIt says how many keys are in those files, and never prints one.\n')
    process.exit(2)
  }
  const missing = []
  const hashes = theOfficesKeyHashes(missing, named)
  const secrets = theSecretsThisMachineHolds(missing)
  const perFile = []
  const total = {}
  let read = 0
  let bytes = 0
  for (const one of filesUnder(paths)) {
    if (one.unreadable !== undefined) {
      missing.push(`${one.path} could not be read (${one.unreadable})`)
      continue
    }
    let text
    try {
      text = bytesOf(one.path)
    } catch (error) {
      missing.push(`${one.path}: ${String(error)}`)
      continue
    }
    read += 1
    bytes += text.length
    const counts = {}
    const add = (what, howMany) => {
      if (howMany > 0) {
        counts[what] = (counts[what] ?? 0) + howMany
        total[what] = (total[what] ?? 0) + howMany
      }
    }
    for (const [value, what] of secrets) add(what, text.split(value).length - 1)
    if (hashes !== null) {
      let issued = 0
      for (const hex of text.match(HEX64) ?? []) if (hashes.has(createHash('sha256').update(hex).digest('hex'))) issued += 1
      add('a key this office issued', issued)
    }
    for (const [what, shape] of SHAPES) add(what, (text.match(shape) ?? []).length)
    if (Object.keys(counts).length > 0) perFile.push({ file: one.path, found: counts })
  }
  const answer = { filesRead: read, bytesRead: bytes, found: total, files: perFile, couldNotLookAt: missing }
  if (json) {
    say(JSON.stringify(answer))
  } else {
    say(`read ${String(read)} files, ${String(Math.round(bytes / 1048576))} MB`)
    if (Object.keys(total).length === 0) say('nothing that looks like a key was found')
    else {
      say('found:')
      for (const [what, howMany] of Object.entries(total).sort((a, b) => b[1] - a[1])) say(`  ${String(howMany).padStart(5)}  ${what}`)
      say(`in ${String(perFile.length)} file${perFile.length === 1 ? '' : 's'}:`)
      for (const one of perFile.slice(0, 40)) say(`  ${JSON.stringify(one.found)}  ${one.file}`)
      if (perFile.length > 40) say(`  … and ${String(perFile.length - 40)} more`)
    }
    for (const one of missing) say(`could not look at: ${one}`)
  }
  process.exit(Object.keys(total).length === 0 ? 0 : 1)
}

main()
