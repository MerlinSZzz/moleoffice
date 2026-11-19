#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE LOGIN PRESS'S POOL PROOF ON THE HOST. Run by the person who keeps the pool, on the machine the pool is on:
 *
 *     node tools/login-press-pool-host-proof.mjs
 *
 * It runs the record's pool tool through the pool adapter, the way the press does, with one difference: the tool is
 * given a home of its own under the system's temporary folder, so the pool it fills is the proof's and never the real
 * one. It adds one invented value, never a login. It does three things and prints what it saw:
 *   1. It refuses to run when CLAUDE_LOGIN_POOL is set. It reads the installation record as the holder does, which
 *      lowers this program's own core limit as it lowers the holder's. It reads the real pool's index.json by size,
 *      time and sha256, and the names, sizes and times of the files beside it, never their content.
 *   2. It makes the home, and in it an empty pool: the folder at 700 and its index.json at 600. It adds the invented
 *      value through the pool as the press does, which must file it under A, and adds it again, which must be refused
 *      PoolDuplicate. It asks the adapter's reconcile three times: with the first operation, which must give A back;
 *      with another operation; and with the first operation and another sha12, which must each give absent. Then it
 *      checks the pool's modes, its index, and that the value is in one file only, inside the pool.
 *   3. It reads the real pool again, which must be unchanged, and removes the home it made.
 * It ends with 0 when every check held, and 1 when one did not.
 *
 * The program that signs a person in is not run here.
 */
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { privatePool } from '../src/server/lib/sandbox-login-addition/pool.mjs'
import { INSTALLATION_RECORD, THE_POOL, theInstalledLogin } from '../src/holder/private-sandbox-login-installed.mjs'
import { POOL_TOOL_BY, thePoolToolAdapter } from '../src/holder/private-sandbox-login-pool-tool.mjs'

let failed = false
/** @param {boolean} held @param {string} line */
const check = (held, line) => {
  if (!held) failed = true
  console.log(`${held ? 'yes' : 'NO '}  ${line}`)
}
const sha256 = (/** @type {Buffer | string} */ value) => createHash('sha256').update(value).digest('hex')
/** @param {Promise<unknown>} promise */
const outcome = (promise) => promise.then((value) => ({ value, error: null }), (/** @type {Error & { reason?: string }} */ error) => ({ value: null, error: error.reason ?? error.message }))

// THE REAL POOL, read by size, time and name only, except index.json, whose sha256 is read as well.
const theRealPool = (/** @type {string} */ pool) => {
  /** @type {Map<string, string>} */
  const files = new Map()
  for (const name of readdirSync(pool)) {
    const info = lstatSync(join(pool, name))
    files.set(name, `${info.isFile() ? 'file' : 'not a file'} ${String(info.size)} ${String(info.mtimeMs)}`)
  }
  const index = lstatSync(join(pool, 'index.json'))
  return { files, index: { size: index.size, mtimeMs: index.mtimeMs, sha256: sha256(readFileSync(join(pool, 'index.json'))) } }
}

console.log('1. THE REAL POOL, BEFORE')
if (process.env.CLAUDE_LOGIN_POOL !== undefined) {
  check(false, 'CLAUDE_LOGIN_POOL is set, so nothing is run')
  process.exit(1)
}
check(true, 'CLAUDE_LOGIN_POOL is not set')
const installed = theInstalledLogin()
check(installed.why === null, installed.why === null ? 'the press would be installed: both adapters are built' : `the press would be unavailable, because ${installed.why}`)
/** @type {Record<string, unknown>} */
let record = {}
try { record = JSON.parse(readFileSync(join(homedir(), INSTALLATION_RECORD), 'utf8')) } catch {}
const { python, tool, toolSha256, pool: realPool } = record
if (typeof python !== 'string' || typeof tool !== 'string' || typeof toolSha256 !== 'string' || typeof realPool !== 'string') {
  check(false, 'the record does not name a python, a tool, its sha256 and a pool, so the tool is not run')
  process.exit(1)
}
const before = theRealPool(realPool)
console.log(`     ${realPool} holds ${String(before.files.size)} files, and is read again at the end`)

console.log(`2. ${tool} THROUGH THE POOL ADAPTER, IN A HOME OF ITS OWN`)
const home = mkdtempSync(join(tmpdir(), 'login-press-pool-proof-'))
const pool = join(home, THE_POOL)
mkdirSync(pool, { recursive: true, mode: 0o700 })
writeFileSync(join(pool, 'index.json'), '{"version": 1, "logins": {}}\n', { mode: 0o600 })
console.log(`     the home is ${home}, and its pool ${pool}`)
try {
  const base = thePoolToolAdapter({ python, tool, toolSha256, home })
  /** @type {string[]} */
  const operations = []
  const adapter = {
    ...base,
    /** @type {typeof base.execute} */
    execute(input) {
      operations.push(input.operationId)
      return base.execute(input)
    },
  }
  const press = privatePool({ tool: adapter })
  check(press.available(), 'the pool is available, as the holder would build it')
  // INVENTED: a value of the shape the tool takes, which no sign-in made.
  const value = `invented-pool-proof-${randomBytes(16).toString('hex')}`
  const sha12 = sha256(value).slice(0, 12)
  const first = await outcome(press.add(Buffer.from(value)))
  check(JSON.stringify(first.value) === JSON.stringify({ letter: 'A', sha12 }), `the invented value was filed under A: ${JSON.stringify(first.value ?? first.error)}`)
  const again = await outcome(press.add(Buffer.from(value)))
  check(again.error === 'PoolDuplicate', `the same value again was refused PoolDuplicate: ${JSON.stringify(again.value ?? again.error)}`)
  check(operations.length === 2 && operations[0] !== operations[1], `the two additions were sent as two operations: ${String(operations.length)}`)
  const asked = (/** @type {string} */ operationId, /** @type {string} */ asSha12) =>
    outcome(base.reconcile({ operationId, sha12: asSha12, deadline: Date.now() + 30_000, signal: new AbortController().signal }))
  const own = await asked(operations[0] ?? '', sha12)
  check(JSON.stringify(own.value) === JSON.stringify({ outcome: 'added', letter: 'A', sha12, confirmed: true }), `reconcile with the first operation gave A back: ${JSON.stringify(own.value ?? own.error)}`)
  const another = await asked(randomBytes(16).toString('hex'), sha12)
  check(JSON.stringify(another.value) === JSON.stringify({ outcome: 'absent' }), `reconcile with another operation gave absent: ${JSON.stringify(another.value ?? another.error)}`)
  const otherSha = await asked(operations[0] ?? '', sha256('another invented value').slice(0, 12))
  check(JSON.stringify(otherSha.value) === JSON.stringify({ outcome: 'absent' }), `reconcile with the first operation and another sha12 gave absent: ${JSON.stringify(otherSha.value ?? otherSha.error)}`)

  const folder = lstatSync(pool)
  check(folder.isDirectory() && folder.uid === process.getuid?.() && (folder.mode & 0o777) === 0o700, `the pool is a folder of this user's at 700: ${(folder.mode & 0o777).toString(8)}`)
  const names = readdirSync(pool)
  const notPrivate = names.filter((name) => {
    const info = lstatSync(join(pool, name))
    return !info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600
  })
  check(notPrivate.length === 0, `every file in it is a file of this user's at 600: ${names.join(', ')}${notPrivate.length ? `; not: ${notPrivate.join(', ')}` : ''}`)
  /** @type {{ logins?: Record<string, { sha12?: string, by?: string, operation?: string }> }} */
  let index = {}
  try { index = JSON.parse(readFileSync(join(pool, 'index.json'), 'utf8')) } catch {}
  const logins = index.logins ?? {}
  check(Object.keys(logins).join(',') === 'A' && logins.A?.sha12 === sha12 && logins.A.by === POOL_TOOL_BY && logins.A.operation === operations[0],
    `its index holds A only, with the value's sha12, by "${POOL_TOOL_BY}" and the first operation: ${Object.keys(logins).join(', ') || 'nothing'}`)
  /** @type {string[]} */
  const holding = []
  const look = (/** @type {string} */ path) => {
    const info = lstatSync(path)
    if (info.isDirectory()) for (const name of readdirSync(path)) look(join(path, name))
    else if (info.isFile() && readFileSync(path).includes(value)) holding.push(path)
  }
  look(home)
  check(holding.length === 1 && holding[0]?.startsWith(pool + '/') === true, `the value is in one file only, inside the pool: ${holding.map((path) => path.slice(home.length + 1)).join(', ') || 'none'}`)

  console.log('3. THE REAL POOL, AFTER')
  const after = theRealPool(realPool)
  check(after.index.size === before.index.size && after.index.mtimeMs === before.index.mtimeMs && after.index.sha256 === before.index.sha256,
    "the real pool's index.json has the same size, time and sha256")
  const changed = [...new Set([...before.files.keys(), ...after.files.keys()])].filter((name) => before.files.get(name) !== after.files.get(name))
  check(changed.length === 0, `the real pool's files have the same names, sizes and times${changed.length ? `; changed: ${changed.join(', ')}` : ''}`)
} finally {
  rmSync(home, { recursive: true, force: true })
}
let gone = false
try { lstatSync(home) } catch { gone = true }
check(gone, 'the home the proof made has gone')
console.log(failed ? 'NOT EVERY CHECK HELD' : 'EVERY CHECK HELD')
process.exit(failed ? 1 : 0)
