#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT'S VERIFIER. A closed stable upgrade that runs the re-mint runs this on the store after it, and on the store
 * restored from the snapshot when it rolls back. The office opens again only when every check it was asked for passed.
 * The contract is tools/stable/closed-upgrade-verification.mjs. The checks are src/server/db/remint-verification.ts.
 *
 *   node tools/verify-the-remint.mjs --within <milliseconds> --map <staged map> <request file> <result file>
 *
 * The staged map is the file `npm run db:migrate -- --stage-remint <file>` wrote, and the one the upgrade's migrate step
 * applies with --remint. The configuration names this file by its absolute path, in a checkout the upgrade does not move:
 *
 *   "closedVerification": { "command": ["<node>", "<checkout>/tools/verify-the-remint.mjs", "--within", "<ms>", "--map", "<file>"], ... }
 *
 * In the target phase each check compares the store after the re-mint with what the map makes of the snapshot. In the
 * recovery phase the map is not read, and each check compares the store with the snapshot. Each database file is opened
 * read-only and immutable by tools/open-immutable.mjs, which creates, locks and changes nothing beside it. Immutable
 * means SQLite ignores a journal and a write-ahead log, so a file with a rollback journal beside it, or a log with
 * anything in it, is not opened.
 *
 * It prints one line for each check, with how long it took, and one with the count. A check that gives what it read is
 * followed by a line of it as JSON: assets gives each picture's manifest before and after the re-mint, which the closed
 * upgrade keeps in this command's log. It writes the contract's result and nothing else, and exits 0 when every check
 * passed, 1 when one failed, and 2 when it refused the request and wrote nothing. At its limit it stops: a check not
 * started by then, or finished after it, is false. A check that is running is not stopped, because it only reads, so the
 * upgrade's own timeoutMs is what stops it.
 *
 * It has no dry form. The upgrade runs a dry form only of tools/stable/verify-the-target.mjs.
 *
 * The request, the opening of each file and the result are written as tools/stable/verify-the-target.mjs writes them.
 */

import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, writeSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openImmutable } from './open-immutable.mjs'

const USAGE = 'node tools/verify-the-remint.mjs --within <milliseconds, 1 to 1800000> --map <staged map> <request file> <result file>'
const REQUEST_FIELDS = ['version', 'phase', 'commit', 'repository', 'database', 'snapshot', 'servicePort', 'checks', 'stateSha256']

const said = (error) => (error instanceof Error ? error.message : String(error))

function refuse(why) {
  process.stderr.write(`verify-the-remint: refused. ${why} Nothing was checked and no result was written.\nUsage: ${USAGE}\n`)
  process.exit(2)
}

// THE ARGUMENTS AND THE REQUEST. Anything this does not understand is refused before any check runs.
const asked = process.argv.slice(2)
if (asked.length !== 6 || asked[0] !== '--within' || asked[2] !== '--map') refuse('It takes --within and its limit, --map and the staged map, then the request file and the result file, and nothing else.')
if (!/^[1-9][0-9]*$/.test(asked[1]) || Number(asked[1]) > 1_800_000) refuse(`--within takes a whole number of milliseconds from 1 to 1800000, not ${JSON.stringify(asked[1])}.`)
const within = Number(asked[1])
const [mapPath, requestPath, resultPath] = [asked[3], asked[4], asked[5]]
for (const path of [mapPath, requestPath, resultPath]) if (!isAbsolute(path) || resolve(path) !== path) refuse(`The map, request and result files are named by absolute paths, and ${JSON.stringify(path)} is not one.`)
try { lstatSync(resultPath); refuse('The result file already exists, and this writes only a new one.') } catch (error) { if (error?.code !== 'ENOENT') refuse(`The result file could not be looked at: ${said(error)}.`) }

let request
try {
  if (!lstatSync(requestPath).isFile()) refuse('The request is not an ordinary file.')
  const text = readFileSync(requestPath, 'utf8')
  if (text.length > 65_536) refuse('The request is longer than 65536 bytes.')
  request = JSON.parse(text)
} catch (error) { refuse(`The request could not be read as JSON: ${said(error)}.`) }
if (request === null || typeof request !== 'object' || Array.isArray(request)) refuse('The request is not a JSON object.')
const extra = Object.keys(request).filter((key) => !REQUEST_FIELDS.includes(key)), absent = REQUEST_FIELDS.filter((key) => !Object.hasOwn(request, key))
if (extra.length || absent.length) refuse(`The request must hold exactly ${REQUEST_FIELDS.join(', ')}.${extra.length ? ` It also holds ${extra.join(', ')}.` : ''}${absent.length ? ` It lacks ${absent.join(', ')}.` : ''}`)
if (request.version !== 1) refuse(`This reads a request of version 1, not ${JSON.stringify(request.version)}.`)
if (request.phase !== 'target' && request.phase !== 'recovery') refuse('The phase is target or recovery.')
if (typeof request.commit !== 'string' || !/^[0-9a-f]{40}$/.test(request.commit)) refuse('The commit is 40 lowercase hexadecimal characters.')
for (const key of ['repository', 'database', 'snapshot']) if (typeof request[key] !== 'string' || !isAbsolute(request[key]) || resolve(request[key]) !== request[key]) refuse(`The ${key} is an absolute path.`)
if (!Number.isInteger(request.servicePort) || request.servicePort < 1 || request.servicePort > 65_535) refuse('The service port is a whole number from 1 to 65535.')
if (!Array.isArray(request.checks) || !request.checks.length || new Set(request.checks).size !== request.checks.length) refuse('The checks are a nonempty list with no name twice.')
if (typeof request.stateSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(request.stateSha256)) refuse('The state hash is 64 lowercase hexadecimal characters.')

// THE CHECKS are TypeScript in this checkout, so they are loaded through tsx with its configuration. They open nothing.
let checks, databaseDirectoryFrom
try {
  const { register } = await import('tsx/esm/api')
  register({ tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) })
  checks = await import('../src/server/db/remint-verification.ts')
  // The one function that says which folder a database is in, which the office's own uploads are written beside.
  ;({ databaseDirectoryFrom } = await import('../src/config/settings.mjs'))
} catch (error) { refuse(`The checks could not be loaded: ${said(error)}.`) }
const unknown = request.checks.filter((name) => !checks.THE_REMINT_CHECKS.includes(name))
if (unknown.length) refuse(`It knows the checks ${checks.THE_REMINT_CHECKS.join(', ')}, and not ${unknown.map((name) => JSON.stringify(name)).join(', ')}.`)

// THE MAP is read in the target phase only. One that cannot be read is refused, as the migrate step refuses it.
let staged = null
if (request.phase === 'target') {
  try {
    const { readTheStagedRemint } = await import('../src/server/db/remint-migration.ts')
    staged = readTheStagedRemint(mapPath)
  } catch (error) { refuse(`The staged map could not be read: ${said(error)}`) }
}

// A better-sqlite3 that cannot be loaded stops a real run here, before it reads a database.
const { default: Database } = await import('better-sqlite3')

// THE LIMIT counts from the start of this process, which is when the transaction's own clock started too.
const deadline = Date.now() + within - performance.now()
const over = () => Date.now() >= deadline

// THE TWO DATABASE FILES, each opened once, when a check first needs it. One that cannot be opened fails each check
// that needs it, with the same reason.
const opened = new Map()
function theFile(label, path) {
  if (!opened.has(path)) opened.set(path, openImmutable(Database, label, path))
  const file = opened.get(path)
  if (file.why !== undefined) throw new Error(file.why)
  return file.db
}

const stores = {
  snapshot: () => theFile('snapshot', request.snapshot),
  after: () => theFile(request.phase === 'target' ? 'store after the re-mint' : 'restored store', request.database),
  // AN UPLOADED PICTURE'S FILE is read beside the store after, for both stores, because the snapshot is a copy of the
  // database alone and the re-mint writes no file. The office's route reads an upload from the folder beside its database.
  files: databaseDirectoryFrom(request.database),
}
const CHECKS = checks.theRemintChecks(request.phase, stores, staged)

process.stdout.write(
  request.phase === 'target'
    ? `The store after the re-mint is compared with what the staged map ${staged.map.digest} makes of the snapshot.\n`
    : 'The restored store is compared with the snapshot. The staged map is not read.\n',
)
const results = {}
for (const name of request.checks) {
  let outcome
  const began = performance.now()
  if (over()) outcome = { passed: false, why: `Not run: the verifier's limit of ${within} ms was reached before it started.` }
  else {
    try { outcome = CHECKS[name]() } catch (error) { outcome = { passed: false, why: `It could not be done: ${said(error)}.` } }
    if (outcome.passed && over()) outcome = { passed: false, why: `${outcome.why} But it finished after the verifier's limit of ${within} ms, so it does not count.` }
  }
  results[name] = outcome.passed
  process.stdout.write(`${name}: ${outcome.passed ? 'passed' : 'FAILED'} in ${Math.round(performance.now() - began)} ms. ${outcome.why}\n`)
  if (outcome.evidence !== undefined) process.stdout.write(`${name} read, as JSON: ${JSON.stringify(outcome.evidence)}\n`)
}
for (const { db } of opened.values()) db?.close()

const failed = request.checks.filter((name) => !results[name])
process.stdout.write(`verify-the-remint: ${request.checks.length - failed.length} of ${request.checks.length} checks passed${failed.length ? `; failed: ${failed.join(', ')}` : ''}.\n`)

// THE RESULT: a new private file holding exactly what the contract reads.
try {
  const descriptor = openSync(resultPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    writeSync(descriptor, JSON.stringify({ version: 1, phase: request.phase, commit: request.commit, stateSha256: request.stateSha256, checks: results }) + '\n')
    fsyncSync(descriptor)
  } finally { closeSync(descriptor) }
} catch (error) {
  process.stderr.write(`verify-the-remint: the result could not be written: ${said(error)}.\n`)
  process.exit(2)
}
process.exit(failed.length ? 1 : 0)
