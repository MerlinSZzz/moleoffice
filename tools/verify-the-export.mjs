#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EXPORT'S VERIFIER. A closed stable upgrade that runs the re-mint runs this on the export of the store after it,
 * before the mirror takes that export. The contract is tools/stable/closed-upgrade-verification.mjs. The checks are
 * src/server/db/export-verification.ts, and that file says what each one compares.
 *
 *   node tools/verify-the-export.mjs --within <milliseconds> --map <staged map> --root <root> <request file> <result file>
 *
 * The staged map is the one tools/verify-the-remint.mjs is given. The root is an absolute path to a real folder that
 * holds mirror-before/, export-1/ and export-2/, each a real folder, and nothing else. The store after is the request's
 * database, opened read-only and immutable by tools/open-immutable.mjs, as verify-the-remint opens it.
 *
 * It refuses the recovery phase, because the exports are of a store that was rolled back then. It refuses a request
 * that does not name the four checks. A root holding a link anywhere, or anything else it cannot compare, is refused
 * before any check runs.
 *
 * It prints one line for each check, with how long it took, and each difference on a line of its own after it, by its
 * path under the root. Then it prints one line with the count. It writes the contract's result and nothing else, and
 * exits 0 when every check passed, 1 when one failed, and 2 when it refused the request and wrote nothing. At its limit
 * it stops: a check not started by then, or finished after it, is false.
 *
 * The request, the opening of each file and the result are written as tools/verify-the-remint.mjs writes them.
 */

import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, writeSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openImmutable } from './open-immutable.mjs'

const USAGE = 'node tools/verify-the-export.mjs --within <milliseconds, 1 to 1800000> --map <staged map> --root <root> <request file> <result file>'
const REQUEST_FIELDS = ['version', 'phase', 'commit', 'repository', 'database', 'snapshot', 'servicePort', 'checks', 'stateSha256']

const said = (error) => (error instanceof Error ? error.message : String(error))

function refuse(why) {
  process.stderr.write(`verify-the-export: refused. ${why} Nothing was checked and no result was written.\nUsage: ${USAGE}\n`)
  process.exit(2)
}

// THE ARGUMENTS AND THE REQUEST. Anything this does not understand is refused before any check runs.
const asked = process.argv.slice(2)
if (asked.length !== 8 || asked[0] !== '--within' || asked[2] !== '--map' || asked[4] !== '--root') refuse('It takes --within and its limit, --map and the staged map, --root and the root, then the request file and the result file, and nothing else.')
if (!/^[1-9][0-9]*$/.test(asked[1]) || Number(asked[1]) > 1_800_000) refuse(`--within takes a whole number of milliseconds from 1 to 1800000, not ${JSON.stringify(asked[1])}.`)
const within = Number(asked[1])
const [mapPath, rootPath, requestPath, resultPath] = [asked[3], asked[5], asked[6], asked[7]]
for (const path of [mapPath, rootPath, requestPath, resultPath]) if (!isAbsolute(path) || resolve(path) !== path) refuse(`The map, root, request and result are named by absolute paths, and ${JSON.stringify(path)} is not one.`)
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
if (request.phase === 'recovery') refuse('In the recovery phase the store was rolled back, so its exports are not of the store after the re-mint, and this compares nothing then.')
if (typeof request.commit !== 'string' || !/^[0-9a-f]{40}$/.test(request.commit)) refuse('The commit is 40 lowercase hexadecimal characters.')
for (const key of ['repository', 'database', 'snapshot']) if (typeof request[key] !== 'string' || !isAbsolute(request[key]) || resolve(request[key]) !== request[key]) refuse(`The ${key} is an absolute path.`)
if (!Number.isInteger(request.servicePort) || request.servicePort < 1 || request.servicePort > 65_535) refuse('The service port is a whole number from 1 to 65535.')
if (!Array.isArray(request.checks) || !request.checks.length || new Set(request.checks).size !== request.checks.length) refuse('The checks are a nonempty list with no name twice.')
if (typeof request.stateSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(request.stateSha256)) refuse('The state hash is 64 lowercase hexadecimal characters.')

// THE CHECKS are TypeScript in this checkout, so they are loaded through tsx with its configuration. They open nothing.
let checks
try {
  const { register } = await import('tsx/esm/api')
  register({ tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) })
  checks = await import('../src/server/db/export-verification.ts')
} catch (error) { refuse(`The checks could not be loaded: ${said(error)}.`) }
const unknown = request.checks.filter((name) => !checks.THE_EXPORT_CHECKS.includes(name))
const unasked = checks.THE_EXPORT_CHECKS.filter((name) => !request.checks.includes(name))
if (unknown.length || unasked.length) refuse(`The request names each of the checks ${checks.THE_EXPORT_CHECKS.join(', ')} and no other.${unknown.length ? ` It also names ${unknown.map((name) => JSON.stringify(name)).join(', ')}.` : ''}${unasked.length ? ` It leaves out ${unasked.join(', ')}.` : ''}`)

// THE MAP. One that cannot be read is refused, as the migrate step refuses it.
let staged
try {
  const { readTheStagedRemint } = await import('../src/server/db/remint-migration.ts')
  staged = readTheStagedRemint(mapPath)
} catch (error) { refuse(`The staged map could not be read: ${said(error)}`) }

// THE ROOT, read whole before any check runs, so a link anywhere in it is refused before anything is compared.
let root
try { root = checks.theRootsFolders(rootPath) } catch (error) { refuse(`The root cannot be compared: ${said(error)}`) }

// A better-sqlite3 that cannot be loaded stops a real run here, before it reads a database.
const { default: Database } = await import('better-sqlite3')

// THE LIMIT counts from the start of this process, which is when the transaction's own clock started too.
const deadline = Date.now() + within - performance.now()
const over = () => Date.now() >= deadline

// THE STORE AFTER, opened once, when the aliases check first needs it. One that cannot be opened fails that check.
let opened
function theStoreAfter() {
  opened ??= openImmutable(Database, 'store after the re-mint', request.database)
  if (opened.why !== undefined) throw new Error(opened.why)
  return opened.db
}
const CHECKS = checks.theExportChecks(root, staged, theStoreAfter)

process.stdout.write(`The export of the store after the re-mint is compared with the mirror's last commit before the window, and with the staged map ${staged.map.digest}.\n`)
const results = {}
for (const name of request.checks) {
  let outcome
  const began = performance.now()
  if (over()) outcome = { passed: false, why: `Not run: the verifier's limit of ${within} ms was reached before it started.`, differences: [] }
  else {
    try { outcome = CHECKS[name]() } catch (error) { outcome = { passed: false, why: `It could not be done: ${said(error)}.`, differences: [] } }
    if (outcome.passed && over()) outcome = { ...outcome, passed: false, why: `${outcome.why} But it finished after the verifier's limit of ${within} ms, so it does not count.` }
  }
  results[name] = outcome.passed
  process.stdout.write(`${name}: ${outcome.passed ? 'passed' : 'FAILED'} in ${Math.round(performance.now() - began)} ms. ${outcome.why}\n`)
  for (const difference of outcome.differences) process.stdout.write(`  ${difference}\n`)
}
opened?.db?.close()

const failed = request.checks.filter((name) => !results[name])
process.stdout.write(`verify-the-export: ${request.checks.length - failed.length} of ${request.checks.length} checks passed${failed.length ? `; failed: ${failed.join(', ')}` : ''}.\n`)

// THE RESULT: a new private file holding exactly what the contract reads.
try {
  const descriptor = openSync(resultPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    writeSync(descriptor, JSON.stringify({ version: 1, phase: request.phase, commit: request.commit, stateSha256: request.stateSha256, checks: results }) + '\n')
    fsyncSync(descriptor)
  } finally { closeSync(descriptor) }
} catch (error) {
  process.stderr.write(`verify-the-export: the result could not be written: ${said(error)}.\n`)
  process.exit(2)
}
process.exit(failed.length ? 1 : 0)
