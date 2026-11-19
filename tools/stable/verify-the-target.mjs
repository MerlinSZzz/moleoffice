#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CLOSED UPGRADE'S VERIFIER. A closed stable upgrade runs it on the migrated target, and on the old version when it
 * rolls back. The office opens again only when every check it was asked for passed (tools/stable/upgrade-stable.criteria.md,
 * "The closed upgrade's verifier (item 20)"; the contract is tools/stable/closed-upgrade-verification.mjs).
 *
 *   tools/stable/verify-the-target.mjs --within <milliseconds> <request file> <result file>
 *   tools/stable/verify-the-target.mjs --within <milliseconds> --dry <timeoutMs> <check>...
 *
 * The configuration names it by its canonical absolute path, with its own limit set below `timeoutMs`:
 *
 *   "closedVerification": { "command": ["<checkout>/tools/stable/verify-the-target.mjs", "--within", "<ms>"], ... }
 *
 * Name it in a checkout the upgrade does not move. A rollback moves the stable checkout back to the old commit, and an
 * old commit may not hold this file.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT CHECKS
 * ---------------------------------------------------------------------------------------
 *
 *   health      GET /api/health on the service port names the request's commit, repository, database and port, and
 *               the mode release-check: the comparisons the transaction makes itself.
 *   records     the target holds as many records as the snapshot, and the same newest one.
 *   reads       the snapshot's newest decision, message, report and session that are not withdrawn are in the target,
 *               not withdrawn, with the same kind, project, title and creation time, and data that is a JSON object.
 *   migrations  the target has taken every migration in the request's repository, and none newer.
 *   settings    the owner's own preferences, their row of `people`, and the office runtime settings are as in the snapshot.
 *
 * Release-check mode serves only health and runtime, so the last four read the two database files. Each is opened
 * read-only and immutable, which creates, locks and changes nothing beside it. Immutable means SQLite ignores a journal
 * and a write-ahead log, so a file with a rollback journal beside it, or a log with anything in it, is not opened.
 *
 * It prints one line for each check and one with the count. It writes the contract's result and nothing else, and exits
 * 0 when every check passed, 1 when one failed, and 2 when it refused the request and wrote nothing. At its limit it stops
 * waiting: a check not started by then, or finished after it, is false.
 *
 * ---------------------------------------------------------------------------------------
 * THE DRY FORM
 * ---------------------------------------------------------------------------------------
 *
 * The upgrade runs it once before anything closes, with its own timeoutMs and checks after `--dry`
 * (tools/stable/upgrade-stable.criteria.md, "A closed rollback opens the old version (item 24)", (c)). It reads only its
 * arguments and writes nothing. It exits 2 for a check it does not know, a limit not below timeoutMs, or a better-sqlite3
 * that cannot be loaded or cannot open a database in memory. Otherwise it prints one line and exits 0.
 */

import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, readSync, writeSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { apiAddressFrom } from '../../src/config/settings.mjs'
import { THE_MIGRATION_JOURNAL_TABLE, theMigrationsInTheFolder, theMigrationsNotYetApplied } from '../../src/config/migration-look.mjs'
import { localStamp } from '../../src/shared/typed-time.mjs'

// SQLite reads this once, when better-sqlite3 opens its first database. Without it the immutable address below is
// refused as a file name, so a missing setting fails every file check rather than opening the file another way.
process.env.SQLITE_USE_URI = '1'

const USAGE = 'tools/stable/verify-the-target.mjs --within <milliseconds, 1 to 1800000> <request file> <result file>, or --within <milliseconds> --dry <timeoutMs> <check>...'
const REQUEST_FIELDS = ['version', 'phase', 'commit', 'repository', 'database', 'snapshot', 'servicePort', 'checks', 'stateSha256']
const SAMPLE_KINDS = ['decision', 'message', 'report', 'session']
const FILE_CHECKS = ['records', 'reads', 'migrations', 'settings']
const KNOWN_CHECKS = ['health', ...FILE_CHECKS]

const said = (error) => (error instanceof Error ? error.message : String(error))

function refuse(why) {
  process.stderr.write(`verify-the-target: refused. ${why} Nothing was checked and no result was written.\nUsage: ${USAGE}\n`)
  process.exit(2)
}

const asked = process.argv.slice(2)
if (asked[0] === '--within' && asked[2] === '--dry') await theDryForm()

async function theDryForm() {
  const [, withinWord, , timeoutWord, ...checks] = asked
  for (const [name, word] of [['--within', withinWord], ['--dry', timeoutWord]]) if (!/^[1-9][0-9]*$/.test(word ?? '') || Number(word) > 1_800_000) refuse(`${name} takes a whole number of milliseconds from 1 to 1800000, not ${JSON.stringify(word)}.`)
  const [limit, timeoutMs] = [Number(withinWord), Number(timeoutWord)]
  if (limit >= timeoutMs) refuse(`--within ${limit} ms is not below the upgrade's timeoutMs of ${timeoutMs} ms, so the upgrade would stop this verifier before it wrote its result.`)
  if (!checks.length || new Set(checks).size !== checks.length) refuse('The checks are a nonempty list with no name twice.')
  const unknown = checks.filter((name) => !KNOWN_CHECKS.includes(name))
  if (unknown.length) refuse(`It knows the checks ${KNOWN_CHECKS.join(', ')}, and not ${unknown.map((name) => JSON.stringify(name)).join(', ')}.`)
  let Sqlite
  try { ({ default: Sqlite } = await import('better-sqlite3')) } catch (error) { refuse(`better-sqlite3 could not be loaded: ${said(error)}.`) }
  try {
    const db = new Sqlite(':memory:')
    try { db.prepare('SELECT 1').get() } finally { db.close() }
  } catch (error) { refuse(`better-sqlite3 could not open a database in memory: ${said(error)}.`) }
  process.stdout.write(`verify-the-target: the dry form passed. It knows the checks ${checks.join(', ')}; its limit of ${limit} ms is below the upgrade's timeoutMs of ${timeoutMs} ms; better-sqlite3 loads and opens a database in memory. Nothing was written.\n`)
  process.exit(0)
}

// A better-sqlite3 that cannot be loaded stops a real run here, before it reads anything.
const { default: Database } = await import('better-sqlite3')

// THE ARGUMENTS AND THE REQUEST. Anything this does not understand is refused before any check runs.
if (asked.length !== 4 || asked[0] !== '--within') refuse('It takes --within and its limit, then the request file and the result file, and nothing else.')
if (!/^[1-9][0-9]*$/.test(asked[1]) || Number(asked[1]) > 1_800_000) refuse(`--within takes a whole number of milliseconds from 1 to 1800000, not ${JSON.stringify(asked[1])}.`)
const within = Number(asked[1])
const [requestPath, resultPath] = [asked[2], asked[3]]
for (const path of [requestPath, resultPath]) if (!isAbsolute(path) || resolve(path) !== path) refuse(`The request and result files are named by absolute paths, and ${JSON.stringify(path)} is not one.`)
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
const unknown = request.checks.filter((name) => !KNOWN_CHECKS.includes(name))
if (unknown.length) refuse(`It knows the checks ${KNOWN_CHECKS.join(', ')}, and not ${unknown.map((name) => JSON.stringify(name)).join(', ')}.`)
if (typeof request.stateSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(request.stateSha256)) refuse('The state hash is 64 lowercase hexadecimal characters.')

// THE LIMIT counts from the start of this process, which is when the transaction's own clock started too.
const deadline = Date.now() + within - performance.now()
const theLimit = AbortSignal.timeout(Math.max(1, Math.floor(deadline - Date.now())))
const over = () => theLimit.aborted || Date.now() >= deadline

const pass = (why) => ({ passed: true, why })
const fail = (why) => ({ passed: false, why })

// THE TWO DATABASE FILES, each opened once, when a check first needs it. One that cannot be opened fails each check
// that needs it, with the same reason.
const opened = new Map()
function theFile(label, path) {
  if (!opened.has(path)) opened.set(path, openImmutable(label, path))
  const file = opened.get(path)
  if (file.why !== undefined) throw new Error(file.why)
  return file.db
}

function openImmutable(label, path) {
  try {
    if (!lstatSync(path).isFile()) return { why: `the ${label} is not an ordinary file` }
  } catch (error) { return { why: `the ${label} could not be found: ${said(error)}` } }
  const beside = (suffix) => { try { return lstatSync(path + suffix) } catch (error) { if (error?.code === 'ENOENT') return null; throw error } }
  try {
    if (beside('-journal') !== null) return { why: `the ${label} has a rollback journal beside it, so it may hold a write that never finished, and it was not opened` }
    const log = beside('-wal')
    if (log !== null && log.size > 0) return { why: `the ${label}'s write-ahead log holds ${log.size} bytes not yet in the file, which an immutable read would not see, so it was not opened` }
    const header = Buffer.alloc(16), descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try { readSync(descriptor, header, 0, 16, 0) } finally { closeSync(descriptor) }
    if (header.toString('latin1') !== 'SQLite format 3\0') return { why: `the ${label} is not a SQLite database` }
    const address = `file:${path.split('/').map(encodeURIComponent).join('/')}?immutable=1`
    return { db: new Database(address, { readonly: true }) }
  } catch (error) { return { why: `the ${label} could not be opened read-only: ${said(error)}` } }
}

const target = () => theFile('target database', request.database)
const snapshot = () => theFile('snapshot', request.snapshot)
const hasTable = (db, name) => db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) !== undefined
const columnsOf = (db, table) => db.prepare(`SELECT name FROM pragma_table_info(?) ORDER BY cid`).all(table).map((one) => one.name)
const quoted = (name) => `"${name.replaceAll('"', '""')}"`
const same = (a, b) => (Buffer.isBuffer(a) && Buffer.isBuffer(b) ? a.equals(b) : a === b)

async function health() {
  const address = `${apiAddressFrom({ MOLE_OFFICE_PORT: String(request.servicePort) })}/api/health`
  let status, text
  try {
    const response = await fetch(address, { redirect: 'manual', signal: theLimit })
    status = response.status
    text = await response.text()
  } catch (error) {
    if (theLimit.aborted) return fail(`The service on port ${request.servicePort} did not answer health within the verifier's limit of ${within} ms.`)
    return fail(`The service on port ${request.servicePort} could not be asked for health: ${said(error)}.`)
  }
  if (status !== 200) return fail(`The service on port ${request.servicePort} answered health with ${status}, not 200.`)
  let body
  try { body = JSON.parse(text) } catch { return fail(`The service on port ${request.servicePort} did not answer health with JSON.`) }
  const identity = body?.identity
  if (body?.ok !== true || identity === null || typeof identity !== 'object') return fail(`The service on port ${request.servicePort} did not say it is healthy, with its identity.`)
  const expected = { commit: request.commit, repository: request.repository, database: request.database, port: request.servicePort, mode: 'release-check' }
  const differ = Object.keys(expected).filter((key) => identity[key] !== expected[key])
  if (differ.length) {
    const shown = differ.map((key) => (key === 'repository' || key === 'database' ? `another ${key}` : `the ${key} ${JSON.stringify(identity[key])}, not ${JSON.stringify(expected[key])}`))
    return fail(`The service on port ${request.servicePort} names ${shown.join(', ')}.`)
  }
  return pass(`The service on port ${request.servicePort} is healthy in release-check mode, at commit ${request.commit}, with the request's repository and database.`)
}

function records() {
  const count = (db) => db.prepare('SELECT count(*) AS n FROM records').get().n
  const newest = (db) => db.prepare('SELECT id FROM records ORDER BY created_at DESC, id DESC LIMIT 1').get()?.id ?? null
  const there = { count: count(target()), newest: newest(target()) }, before = { count: count(snapshot()), newest: newest(snapshot()) }
  const problems = []
  if (there.count !== before.count) problems.push(`The target holds ${there.count} records and the snapshot ${before.count}.`)
  if (there.newest !== before.newest) problems.push(`${problems.length ? 'And the' : `Both hold ${there.count} records, but the`} newest record in the target is ${there.newest ?? 'none'} and in the snapshot ${before.newest ?? 'none'}.`)
  if (problems.length) return fail(problems.join(' '))
  return pass(`The target and the snapshot both hold ${there.count} records, and the newest of both is ${there.newest ?? 'none'}.`)
}

function reads() {
  const problems = [], read = []
  for (const kind of SAMPLE_KINDS) {
    const sample = snapshot().prepare(`SELECT id, workspace_id, kind, title, created_at FROM records WHERE kind = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1`).get(kind)
    if (sample === undefined) { problems.push(`the snapshot holds no ${kind} that is not withdrawn, so none could be read back`); continue }
    const there = target().prepare(`SELECT id, workspace_id, kind, title, created_at, deleted_at, data FROM records WHERE id = ?`).get(sample.id)
    if (there === undefined) { problems.push(`the ${kind} ${sample.id} is not in the target`); continue }
    const words = { workspace_id: 'project', kind: 'kind', title: 'title', created_at: 'creation time' }
    const differ = Object.keys(words).filter((key) => there[key] !== sample[key]).map((key) => words[key])
    let data
    try { data = JSON.parse(there.data) } catch { data = undefined }
    const before = problems.length
    if (there.deleted_at !== null) problems.push(`the ${kind} ${sample.id} is withdrawn in the target`)
    if (differ.length) problems.push(`the ${kind} ${sample.id} has another ${differ.join(' and ')} in the target`)
    if (data === null || typeof data !== 'object' || Array.isArray(data)) problems.push(`the ${kind} ${sample.id}'s data in the target is not a JSON object`)
    if (problems.length === before) read.push(`${kind} ${sample.id}`)
  }
  if (problems.length) return fail(`${problems.join('; ')}.`.replace(/^./, (first) => first.toUpperCase()))
  return pass(`The snapshot's newest of each sampled kind reads back the same from the target: ${read.join(', ')}.`)
}

function migrations() {
  const folder = join(request.repository, 'drizzle')
  const known = theMigrationsInTheFolder(folder)
  if (!known.length) return fail(`The repository's migration folder names no migration, so there is nothing to compare.`)
  if (!hasTable(target(), THE_MIGRATION_JOURNAL_TABLE)) return fail(`The target database has no migration journal.`)
  const rows = target().prepare(`SELECT hash, created_at FROM ${THE_MIGRATION_JOURNAL_TABLE}`).all()
  const missing = theMigrationsNotYetApplied(rows, known)
  const last = known[known.length - 1]
  if (missing.length) {
    const named = missing.slice(0, 3).map((one) => one.tag).join(', ') + (missing.length > 3 ? ` and ${missing.length - 3} more` : '')
    return fail(`The target has not taken ${missing.length} of the repository's ${known.length} migrations (${named}), so its level is older than the last, ${last.tag}.`)
  }
  const newest = rows.reduce((most, row) => Math.max(most, Number(row.created_at)), -Infinity)
  const latest = known.reduce((most, one) => Math.max(most, one.when), -Infinity)
  if (newest > latest) return fail(`The target's journal holds a migration of ${localStamp(new Date(newest))}, newer than any in the repository, whose last is ${last.tag}. The database is ahead of this checkout.`)
  return pass(`The target has taken all ${known.length} of the repository's migrations, the last being ${last.tag}, and none newer.`)
}

function settings() {
  const problems = []
  // THE OWNER'S OWN PREFERENCES: their row of people, every column the snapshot has.
  if (!hasTable(snapshot(), 'people') || !columnsOf(snapshot(), 'people').includes('office_owner')) return fail('The snapshot has no people table with an office owner mark, so the owner\'s preferences cannot be compared.')
  const owners = snapshot().prepare(`SELECT * FROM people WHERE office_owner IS NOT NULL`).all()
  if (owners.length !== 1) return fail(`The snapshot marks ${owners.length} people as the office owner, not one, so the owner's preferences cannot be compared.`)
  const owner = owners[0], columns = Object.keys(owner)
  const lacking = columns.filter((name) => !columnsOf(target(), 'people').includes(name))
  if (lacking.length) problems.push(`the target's people table lacks ${lacking.join(', ')}`)
  else {
    const there = target().prepare(`SELECT ${columns.map(quoted).join(', ')} FROM people WHERE id = ?`).get(owner.id)
    if (there === undefined) problems.push(`the owner is not in the target's people table`)
    else {
      const differ = columns.filter((name) => !same(there[name], owner[name]))
      if (differ.length) problems.push(`the owner's ${differ.join(', ')} ${differ.length === 1 ? 'differs' : 'differ'} from the snapshot`)
    }
  }
  // THE OFFICE RUNTIME SETTINGS, row for row.
  if (!hasTable(snapshot(), 'runtime_settings')) problems.push('the snapshot has no runtime settings table')
  else if (!hasTable(target(), 'runtime_settings')) problems.push('the target has no runtime settings table')
  else {
    const kept = columnsOf(snapshot(), 'runtime_settings')
    const gone = kept.filter((name) => !columnsOf(target(), 'runtime_settings').includes(name))
    if (gone.length) problems.push(`the target's runtime settings table lacks ${gone.join(', ')}`)
    else {
      const read = (db) => new Map(db.prepare(`SELECT ${kept.map(quoted).join(', ')} FROM runtime_settings ORDER BY name`).all().map((row) => [row.name, row]))
      const before = read(snapshot()), there = read(target())
      const names = [...new Set([...before.keys(), ...there.keys()])].sort()
      const differ = names.filter((name) => !before.has(name) || !there.has(name) || kept.some((column) => !same(before.get(name)[column], there.get(name)[column])))
      if (differ.length) problems.push(`the runtime ${differ.length === 1 ? 'setting' : 'settings'} ${differ.join(', ')} ${differ.length === 1 ? 'differs' : 'differ'} from the snapshot`)
      else if (!problems.length) return pass(`The owner's row in people, all ${columns.length} columns, is as in the snapshot, and ${before.size === 0 ? 'neither file holds a runtime setting' : `so are all ${before.size} runtime settings`}.`)
    }
  }
  return fail(`${problems.join('; ')}. No value is printed.`.replace(/^./, (first) => first.toUpperCase()))
}

const CHECKS = { health, records, reads, migrations, settings }

if (request.checks.some((name) => FILE_CHECKS.includes(name))) {
  process.stdout.write('The office in release-check mode serves no record door, so records, reads, migrations and settings are read from the target and snapshot files, read-only and immutable.\n')
}
const results = {}
for (const name of request.checks) {
  let outcome
  if (over()) outcome = fail(`Not run: the verifier's limit of ${within} ms was reached before it started.`)
  else {
    try { outcome = await CHECKS[name]() } catch (error) { outcome = fail(`It could not be done: ${said(error)}.`) }
    if (outcome.passed && over()) outcome = fail(`${outcome.why} But it finished after the verifier's limit of ${within} ms, so it does not count.`)
  }
  results[name] = outcome.passed
  process.stdout.write(`${name}: ${outcome.passed ? 'passed' : 'FAILED'}. ${outcome.why}\n`)
}
for (const { db } of opened.values()) db?.close()

const failed = request.checks.filter((name) => !results[name])
process.stdout.write(`verify-the-target: ${request.checks.length - failed.length} of ${request.checks.length} checks passed${failed.length ? `; failed: ${failed.join(', ')}` : ''}.\n`)

// THE RESULT: a new private file holding exactly what the contract reads.
try {
  const descriptor = openSync(resultPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    writeSync(descriptor, JSON.stringify({ version: 1, phase: request.phase, commit: request.commit, stateSha256: request.stateSha256, checks: results }) + '\n')
    fsyncSync(descriptor)
  } finally { closeSync(descriptor) }
} catch (error) {
  process.stderr.write(`verify-the-target: the result could not be written: ${said(error)}.\n`)
  process.exit(2)
}
process.exit(failed.length ? 1 : 0)
