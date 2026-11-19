// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Produce one original cloud whole-suite receipt for main, or check periodically in the queue's gaps.
 * This tool never lands code, changes main, upgrades an office, or runs tests on this machine.
 * The caller starts it as a registered run. Office calls use the same office_request implementation
 * as the agent tools; cloud children receive none of that caller's credentials.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aPassedFile, anUnhandledWorkerExitIn } from './a-passed-test-file.mjs'
import { askTheOffice, theRunsIdentity, withoutKeys } from './office-request.mjs'
import { readSetting } from '../src/config/settings.mjs'
import { carriesTheTestMark, THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { localStamp } from '../src/shared/time.ts'
import { originalGreenFollowsRepair } from '../src/shared/main-suite-fix-chronology.ts'
import { parseWholeSuiteReceipt, wholeSuiteReceiptIsGreen } from '../src/shared/whole-suite-receipt.ts'
import { readOriginalReceipt, readReceiptEvidenceObject, THE_LONGEST_RECEIPT_REPLY, verifyOriginalReceiptEvidence } from './stable/stable-upgrade-evidence.mjs'
import { requireReadOnlyGitConfig } from './read-only-git-config.mjs'
import { FixRoundPersonStop, readFixRoundPersonStop } from './main-suite-fix-round-person.mjs'
import { stopAnUnpairedStableStart } from '../src/config/the-office-tool-environment.mjs'
import { packTheReads, readsDigestOf } from './reads-archive.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const CLOUD_DOOR = join(HERE, 'cloud-suite.mjs')
export const RECEIPT_KIND = 'whole_suite_receipt'
export const DEFAULT_INTERVAL_SECONDS = 9000
/**
 * HOW LONG EACH OFFICE CALL OF THE PRODUCER, AND OF THE POLL THAT RUNS IT, WAITS FOR ITS ANSWER: 120 s. The live office's
 * run-finishing writes hold its request thread, 12.5 s on average and up to 278 s, and a call waits behind them. At the
 * earlier 15 s, firing 1012 failed at its first call, before any test ran.
 */
export const PRODUCER_OFFICE_ANSWER_WAIT_MS = 120_000
/** How often a producer waiting in the full-suite seat's line asks again: every 10 seconds, as the merge queue does. */
export const SEAT_ASKED_AGAIN_EVERY_MS = 10_000
/** How many asks in a row the office may leave unanswered before the producer stops waiting: its longest known hold, 278 s, costs at most two, because an ask waits PRODUCER_OFFICE_ANSWER_WAIT_MS and the next comes 10 s after it. */
export const SEAT_ASKS_UNANSWERED_IN_A_ROW = 3
const fail = (message) => { throw new Error(message) }
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const within = (root, path) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)) }

function readJson(path) {
  if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) fail(`The evidence at ${path} is not a regular file.`)
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch (error) { fail(`The evidence at ${path} is not readable JSON: ${error.message}`) }
}

function git(repository, words) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'gc.auto=0', '-C', repository, ...words], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: '/nonexistent', LANG: 'C.UTF-8', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1' },
  })
  if (result.error || result.status !== 0) fail(`Git could not ${words.join(' ')} in ${repository}: ${result.error?.message ?? result.stderr.trim()}`)
  return result.stdout.trim()
}

function configuration(options) {
  if (!isAbsolute(options.repository ?? '') || !isAbsolute(options.workdir ?? '')) fail('Name an absolute main repository and a separate absolute work directory.')
  const repository = realpathSync(options.repository)
  const namedWorkdir = resolve(options.workdir)
  let ancestor = namedWorkdir
  while (!existsSync(ancestor)) ancestor = dirname(ancestor)
  const workdir = resolve(realpathSync(ancestor), relative(ancestor, namedWorkdir))
  if (within(repository, workdir) || within(workdir, repository)) fail('The suite work directory and main checkout must be separate folders, with neither inside the other.')
  // null: the caller keeps the spacing itself, as the main-suite job's counter does. Nothing is spaced here then.
  const intervalSeconds = options.intervalSeconds === null ? null : options.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS
  if (intervalSeconds !== null && (!Number.isInteger(intervalSeconds) || intervalSeconds < 7200 || intervalSeconds > 10800)) fail('The periodic interval must be a whole number of seconds between two and three hours.')
  const timeoutSeconds = options.timeoutSeconds ?? 10800
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 10800) fail('The cloud timeout must be a whole number of seconds from 1 to 10800.')
  if (typeof options.processResource !== 'string' || options.processResource.trim() === '') fail('Name the registered process-resource row that will hold the full-suite seat.')
  requireReadOnlyGitConfig(repository)
  if (git(repository, ['rev-parse', '--show-toplevel']) !== repository) fail('The named repository must be the main checkout root.')
  if (git(repository, ['symbolic-ref', '--quiet', 'HEAD']) !== 'refs/heads/main') fail('The named checkout is not on main. Nothing ran.')
  if (git(repository, ['status', '--porcelain', '--untracked-files=normal']) !== '') fail('Main has uncommitted or untracked files. Nothing ran.')
  return { repository, workdir, intervalSeconds, timeoutSeconds, processResource: options.processResource }
}

function save(path, value) {
  const next = `${path}.${process.pid}.new`
  writeFileSync(next, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  renameSync(next, path)
}

function stateAt(path) {
  if (!existsSync(path)) return { version: 1, lastStartedAtMs: null, pending: null }
  const state = readJson(path)
  if (state.version !== 1 || (state.lastStartedAtMs !== null && (!Number.isSafeInteger(state.lastStartedAtMs) || state.lastStartedAtMs < 0)) || !Object.hasOwn(state, 'pending')) fail(`The producer state at ${path} is invalid. Nothing ran.`)
  if (state.pending !== null) fail(`A previous attempt is unfinished at ${state.pending.attempt ?? path}. Inspect its result before starting another suite.`)
  return state
}

/** `longestReply` is handed to the request helper and never sent. */
async function request(io, method, path, body, longestReply) {
  const reply = await io.officeRequest({ method, path, ...(body === undefined ? {} : { body }), ...(longestReply === undefined ? {} : { longestReply }) })
  if (reply.cut) fail(`The office reply for ${method} ${path} was cut. Its contents are unknown; no substitute was used.`)
  let value = reply.body
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { fail(`The office returned unreadable JSON for ${method} ${path}.`) }
  }
  if (!object(value)) fail(`The office returned no object for ${method} ${path}.`)
  if (reply.status < 200 || reply.status >= 300) fail(`The office refused ${method} ${path} (${reply.status}): ${value.error ?? value.message ?? 'no reason was given'}`)
  return value
}

async function existingReceipt(io, repository, commit) {
  const PAGE = io.receiptPageSize ?? 25
  let offset = 0
  const seen = new Set()
  let found = null
  do {
    const path = `/api/records?kind=${RECEIPT_KIND}&shape=narrow&limit=${PAGE}&offset=${offset}`
    const listed = await readReceiptEvidenceObject(io.officeRequest, path)
    if (!Array.isArray(listed.records) || listed.records.length > PAGE || !Number.isInteger(listed.left) || listed.left < 0 || listed.returned !== listed.records.length) fail('The receipt list is not a complete, bounded page. Nothing ran.')
    for (const item of listed.records) {
    if (typeof item.id !== 'string' || item.kind !== RECEIPT_KIND) fail('The receipt list contains an unidentified record. Nothing ran.')
    if (seen.has(item.id)) fail('The receipt pages repeated a record; absence is unverified. Nothing ran.')
    seen.add(item.id)
    const { original, evidence } = await readOriginalReceipt(item.id, io)
    const data = original.content.data
    if (!object(data) || typeof data.commit !== 'string' || typeof data.repository !== 'string') fail('An original receipt identity is unknown. Nothing ran.')
    if (data.commit !== commit || data.repository !== repository) continue
    const verified = await verifyOriginalReceiptEvidence({ repository, commit, evidence }, io)
    if (!verified.complete) fail(`Receipt ${item.id} has incomplete original coverage. Supervised recovery is required; nothing ran.`)
    if (found !== null) fail('More than one original receipt matches this commit. Supervised recovery is required; nothing ran.')
    found = { id: item.id, evidence, green: verified.green, outcome: verified.outcome }
    }
    if (listed.left === 0) {
      if (listed.next !== null) fail('The final receipt page has an unexpected cursor. Nothing ran.')
      return found
    }
    if (listed.records.length === 0 || typeof listed.next !== 'string' || !listed.next.startsWith('GET /api/records?')) fail('The receipt page has no advancing GET cursor. Nothing ran.')
    offset += listed.records.length
    const next = new URL(listed.next.slice(4), 'http://receipt.invalid')
    if (next.origin !== 'http://receipt.invalid' || next.pathname !== '/api/records' || next.searchParams.get('offset') !== String(offset) || next.searchParams.get('limit') !== String(PAGE) || next.searchParams.get('kind') !== RECEIPT_KIND || next.searchParams.get('shape') !== 'narrow' || [...next.searchParams.keys()].some(key => !['offset', 'limit', 'kind', 'shape'].includes(key)) || [...next.searchParams.keys()].length !== 4) fail('The receipt page cursor changed its query or did not advance. Nothing ran.')
  } while (true)
}

/** Whether the office's receipt kind takes version 2: it declares both fields version 2 adds. One without the other is refused. */
async function theReceiptFieldsOfTheOffice(io) {
  const described = await request(io, 'GET', `/api/kinds/${RECEIPT_KIND}`)
  const fields = described.kind?.fields
  if (!Array.isArray(fields) || fields.some((one) => !object(one) || typeof one.key !== 'string')) fail('The office did not describe the fields of its receipt kind. No receipt was filed.')
  const added = ['aloneRuns', 'errorsOutsideTests'].filter((key) => fields.some((one) => one.key === key))
  if (added.length === 1) fail(`The office's receipt kind declares ${added[0]} without the other field version 2 adds. No receipt was filed.`)
  return { allowsVersion2: added.length === 2, allowsWorkerCrashes: fields.some((one) => one.key === 'workerCrashes') }
}

async function releaseSeat(io, seat) {
  await request(io, 'POST', `/api/slots/${encodeURIComponent(seat)}/release`, { note: 'The periodic main suite returned the seat or left its queue position.' })
}

function sleepUnlessStopped(ms, signal) {
  return new Promise((yes) => {
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); yes() }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
    if (signal?.aborted) done()
  })
}

function timeOf(io) {
  const ms = io.clock()
  if (!Number.isSafeInteger(ms) || ms < 0) fail('The producer clock is not a valid time. Nothing ran.')
  return ms
}

/**
 * ASK FOR THE FULL-SUITE SEAT, AND WAIT IN ITS LINE UNTIL line.until (13q item 1j). The office keeps a group's place while
 * the group runs, and answers a second ask with the same row with that place, so the wait asks again and never gives its
 * place back itself. held.id is the row this run holds, its seat or its place; the caller gives it back on every outcome.
 * Without a line the producer does not wait. The answer is { seat }, or { seat: null, says } when no seat was granted.
 * AN ASK THE OFFICE DOES NOT ANSWER IS NOT A REFUSAL: the wait counts it and asks again, because a later ask still learns
 * the row the office filed. SEAT_ASKS_UNANSWERED_IN_A_ROW asks in a row without an answer stop the wait, and nothing ran.
 */
async function waitForTheSeat(io, resource, held, line, signal) {
  const body = { pool: 'full-suite', resource, detail: 'Periodic original main whole suite on the cloud box' }
  const at = (ms) => localStamp(new Date(ms))
  const since = timeOf(io)
  let lastAnswer = null
  let unanswered = 0
  const withLastAnswer = (prefix) => `${prefix} It was number ${lastAnswer.position} in line when it last had an answer, at ${at(lastAnswer.at)}. The asks after it got no answer. It gave its place back.`
  const withNoAnswer = (prefix) => `${prefix} The office answered none of its asks, so the producer does not know whether it had a place in line. It gave none back.`
  const ended = () => `Not run: the time it was given to wait for the full-suite seat has ended. The producer waited in the seat's line from ${at(since)} until ${at(line.until)}, the end of the time it was given.`
  const stopped = () => `Not run: the producer was asked to stop while it waited for the full-suite seat. It waited in the seat's line from ${at(since)} until ${at(timeOf(io))}.`
  const noAnswerSays = (prefix) => lastAnswer === null ? withNoAnswer(prefix) : withLastAnswer(prefix)
  for (;;) {
    let slot
    try {
      slot = (await request(io, 'POST', '/api/slots/acquire', body)).slot
    } catch (error) {
      if (line === undefined || !(error instanceof TheOfficeDidNotAnswer)) throw error
      unanswered += 1
      const askedAt = timeOf(io)
      if (unanswered >= SEAT_ASKS_UNANSWERED_IN_A_ROW) throw new Error(`Not run: the office did not answer ${unanswered} asks in a row for the full-suite seat. The last ask was at ${at(askedAt)} and got no answer (${error.why}). Nothing ran.`)
      if (askedAt >= line.until) return { seat: null, says: noAnswerSays(ended()) }
      await io.sleep(Math.min(SEAT_ASKED_AGAIN_EVERY_MS, line.until - askedAt), signal)
      if (signal?.aborted) return { seat: null, says: noAnswerSays(stopped()) }
      continue
    }
    unanswered = 0
    if (!object(slot) || typeof slot.id !== 'string') fail('The office did not identify the full-suite seat or queue position. Nothing ran.')
    held.id = slot.id
    if (slot.state === 'granted') return { seat: slot }
    if (slot.state !== 'queued' || !Number.isSafeInteger(slot.position) || slot.position < 1) fail('The office did not identify the full-suite seat or queue position. Nothing ran.')
    if (line === undefined) return { seat: null, says: `Not run: the full-suite seat is taken. The producer was number ${slot.position} in line and gave its place back at once, because it was given no time to wait.` }
    const askedAt = timeOf(io)
    lastAnswer = { position: slot.position, at: askedAt }
    const place = `It was number ${slot.position} in line when it last asked, at ${at(askedAt)}. It gave its place back.`
    if (askedAt >= line.until) return { seat: null, says: `Not run: the full-suite seat was taken for the whole wait. The producer waited in the seat's line from ${at(since)} until ${at(line.until)}, the end of the time it was given. ${place}` }
    await io.sleep(Math.min(SEAT_ASKED_AGAIN_EVERY_MS, line.until - askedAt), signal)
    if (signal?.aborted) return { seat: null, says: `Not run: the producer was asked to stop while it waited for the full-suite seat. It waited in the seat's line from ${at(since)} until ${at(timeOf(io))}. ${place}` }
  }
}

function relativeTestFile(clone, absolute) {
  if (typeof absolute !== 'string' || !isAbsolute(absolute) || !within(clone, absolute) || resolve(absolute) === clone) fail('A suite artifact names a test outside its exact clone.')
  const rel = relative(clone, absolute).split(sep).join('/')
  if (rel.includes('\\') || rel.split('/').some((part) => part === '' || part === '.' || part === '..')) fail('A suite artifact contains an unusable test path.')
  return rel
}

function artifact(name, path) {
  if (name !== 'reads') return { name, path, sha256Base64: createHash('sha256').update(readFileSync(path)).digest('base64') }
  return { name, path, sha256Base64: readsDigestOf(path).sha256Base64 }
}

/**
 * Build the stored facts from the original door answer and artifacts, before any attribution. A file is failed by
 * aPassedFile, the merge tool's rule. Version 2, only when the caller says the office takes it: a red whole run whose
 * door answer lists the runs alone, each read from its own files by aloneRunsFrom. The whole run's facts are the same
 * in both versions.
 */
export function receiptFromArtifacts({ repository, commit, tree, clone, paths, result, startedAt, endedAt, allowsVersion2 = false, allowsWorkerCrashes = true, carriedOver = [] }) {
  const said = result.answer
  if (!object(said) || said.ran !== true || said.commit !== commit || said.code !== result.code || !Number.isInteger(said.code) || said.code < 0 || said.code > 255) fail('The cloud result does not identify the requested commit and its actual exit. No receipt was filed.')
  if (!Number.isInteger(said.buildExitCode) || said.buildExitCode < 0 || said.buildExitCode > 255) fail('The cloud result has no original build exit. No receipt was filed.')
  readJsonFileIsRegular(paths.log)
  const data = { version: 1, repository, clone, commit, tree, startedAt, endedAt, where: 'cloud box', buildExitCode: said.buildExitCode, artifacts: [artifact('log', paths.log)] }
  if (said.phase === 'build') {
    if (said.buildExitCode === 0 || said.code !== said.buildExitCode || Object.hasOwn(said, 'suiteExitCode')) fail('The failed-build result contradicts its phase. No receipt was filed.')
    for (const path of [paths.report, paths.manifest, paths.reads]) if (existsSync(path)) fail('A failed build has unexpected test artifacts. No receipt was filed.')
    return parseWholeSuiteReceipt(data)
  }
  if (said.phase !== 'test' || said.buildExitCode !== 0 || said.suiteExitCode !== said.code) fail('The cloud result does not prove that the build preceded the suite. No receipt was filed.')
  const manifest = readJson(paths.manifest)
  const report = readJson(paths.report)
  if (!Array.isArray(manifest) || manifest.length === 0 || !object(report) || !Array.isArray(report.testResults)) fail('The suite manifest or original report is incomplete. No receipt was filed.')
  for (const key of ['numTotalTests', 'numFailedTests', 'numPassedTests', 'numPendingTests', 'numTodoTests']) {
    if (!Number.isInteger(report[key]) || report[key] < 0) fail('The original suite report has no complete test counts. No receipt was filed.')
  }
  const unfinished = report.numTotalTests - report.numFailedTests - report.numPassedTests - report.numPendingTests - report.numTodoTests
  const workerExit = unfinished > 0 && said.code !== 0 && anUnhandledWorkerExitIn(paths.log)
  if (unfinished !== 0 && !workerExit) fail('The original suite report has contradictory test counts. No receipt was filed.')
  for (const key of ['numTotalTestSuites', 'numPassedTestSuites', 'numFailedTestSuites', 'numPendingTestSuites']) {
    if (!Number.isInteger(report[key]) || report[key] < 0) fail('The original suite report has no complete suite counts. No receipt was filed.')
  }
  if (typeof report.success !== 'boolean' || report.numTotalTestSuites !== report.numPassedTestSuites + report.numFailedTestSuites + report.numPendingTestSuites || (said.code === 0 && (!report.success || report.numFailedTestSuites !== 0))) fail('The original suite report contradicts its successful exit or suite totals. No receipt was filed.')
  const expected = manifest.map((row) => {
    if (!object(row) || Object.keys(row).some((key) => key !== 'file') || typeof row.file !== 'string') fail('The suite manifest has an unsupported entry or project. No receipt was filed.')
    return relativeTestFile(clone, row.file)
  }).sort()
  const observed = []
  const answerable = []
  const failedFiles = []
  const failedTests = []
  const workerCrashes = []
  let assertions = 0
  let failedAssertions = 0
  let passedAssertions = 0
  let pendingAssertions = 0
  let todoAssertions = 0
  let unfinishedAssertions = 0
  for (const row of report.testResults) {
    if (!object(row) || !['passed', 'failed'].includes(row.status) || !Array.isArray(row.assertionResults)) fail('A test file in the original report has no complete result. No receipt was filed.')
    const file = relativeTestFile(clone, row.name)
    observed.push(file)
    if (row.assertionResults.some((test) => !object(test) || !['passed', 'failed', 'pending', 'todo', 'skipped', 'disabled'].includes(test.status))) fail('The original suite report has an unknown test outcome. No receipt was filed.')
    assertions += row.assertionResults.length
    const failures = row.assertionResults.filter((test) => test.status === 'failed')
    failedAssertions += failures.length
    passedAssertions += row.assertionResults.filter((test) => test.status === 'passed').length
    pendingAssertions += row.assertionResults.filter((test) => ['pending', 'skipped', 'disabled'].includes(test.status)).length
    const pending = row.assertionResults.filter((test) => test.status === 'pending').length
    if (workerExit && pending > 0) {
      workerCrashes.push({ file, unfinishedTests: pending })
      unfinishedAssertions += pending
    }
    todoAssertions += row.assertionResults.filter((test) => test.status === 'todo').length
    for (const test of failures) {
      if (typeof test.fullName !== 'string' || test.fullName.trim() === '') fail('A failed test has no recorded name. No receipt was filed.')
      failedTests.push({ file, name: test.fullName })
    }
    if (row.status === 'failed' || failures.length > 0) answerable.push(file)
    if (!aPassedFile(row)) failedFiles.push(file)
  }
  observed.sort()
  if (assertions !== report.numTotalTests || failedAssertions !== report.numFailedTests || passedAssertions !== report.numPassedTests || pendingAssertions - unfinishedAssertions !== report.numPendingTests || todoAssertions !== report.numTodoTests || unfinishedAssertions !== unfinished) fail('The original report disagrees with its assertion counts. No receipt was filed.')
  if (new Set(expected).size !== expected.length || new Set(observed).size !== observed.length) fail('The suite manifest or report contains duplicate test files. No receipt was filed.')
  if (said.files !== observed.length || !Array.isArray(said.failed)) fail('The cloud answer and report disagree on file coverage. No receipt was filed.')
  // The door's own failed list names the files vitest called failed; a file with a test that never ran is not in it.
  const answerFailed = [...said.failed].sort()
  const reportFailed = [...answerable].sort()
  if (JSON.stringify(answerFailed) !== JSON.stringify(reportFailed)) fail('The cloud answer and report disagree on failed files. No receipt was filed.')
  data.suiteExitCode = said.suiteExitCode
  data.failedFiles = failedFiles.sort()
  const first = theCarriedFirst(carriedOver, data.failedFiles)
  if (carriedOver.length > 0 && JSON.stringify(said.carriedOverFirst) !== JSON.stringify(first)) fail(`The cloud door did not put first in its runs alone exactly the carried-over files that are red again (${first.length > 0 ? first.join(', ') : 'none'}). No receipt was filed.`)
  if (allowsWorkerCrashes && workerCrashes.length > 0) data.workerCrashes = workerCrashes.sort((a, b) => a.file.localeCompare(b.file))
  data.failedTests = failedTests.filter((test, index) => failedTests.findIndex((one) => one.file === test.file && one.name === test.name) === index).sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))
  data.coverage = { expectedCount: expected.length, observedCount: observed.length, missing: expected.filter((file) => !observed.includes(file)), unexpected: observed.filter((file) => !expected.includes(file)) }
  data.artifacts.push(artifact('manifest', paths.manifest), artifact('report', paths.report), artifact('reads', paths.reads))
  if (allowsVersion2 && said.alone !== undefined && data.failedFiles.length > 0) {
    data.version = 2
    const errors = errorsOutsideTestsIn(paths.log)
    if (errors !== null) data.errorsOutsideTests = errors
    data.aloneRuns = aloneRunsFrom({ said, clone, paths, failedFiles: data.failedFiles, first })
  }
  return parseWholeSuiteReceipt(data)
}

/** The carried-over files that are red again, in their order: the door runs them alone first (criterion 29). */
const theCarriedFirst = (carriedOver, failedFiles) => carriedOver.filter((file) => failedFiles.includes(file))

/**
 * The red files a receipt's original revision left not run alone, in its order. A version 1 receipt ran none alone, and
 * one that ran every red file alone leaves none. The evidence check works the carried-over files out again by this rule.
 */
export const theFilesLeftNotRunAlone = (original) => (parseWholeSuiteReceipt(original.content?.data).aloneRuns ?? []).filter((run) => run.outcome === 'not run').map((run) => run.file)

/**
 * THE FILES CARRIED OVER (criterion 29): the red files the last receipt filed here left not run alone. A last receipt
 * that cannot be read is said with its reason, and nothing is carried over.
 */
async function theCarriedOver(io, recordId) {
  if (recordId === undefined) return { from: null, files: [] }
  try {
    const { original, evidence } = await readOriginalReceipt(recordId, io)
    return { from: evidence, files: theFilesLeftNotRunAlone(original) }
  } catch (error) {
    return { from: { recordId }, files: [], unreadable: (String(error instanceof Error ? error.message : error).trim() || 'it gave no reason').slice(0, 300) }
  }
}

/** What the receipt's summary and the answer say was carried over, and nothing when nothing was. */
function carriedWords(carried, ranFirst, suiteRan) {
  if (carried.unreadable !== undefined) return ` The last receipt filed here, ${carried.from.recordId}, could not be read, so no file was carried over: ${carried.unreadable.replace(/\.?$/, '.')}`
  if (carried.files.length === 0) return ''
  const notRed = carried.files.filter((file) => !ranFirst.includes(file))
  return ` Receipt ${carried.from.recordId} left ${carried.files.join(', ')} not run alone, so ${carried.files.length === 1 ? 'it was' : 'they were'} carried over to this run.` +
    (ranFirst.length > 0 ? ` Put first among the runs alone: ${ranFirst.join(', ')}.` : '') +
    (suiteRan && notRed.length > 0 ? ` Not red in this whole run, so not run alone: ${notRed.join(', ')}.` : '')
}

function workerCrashWords(crashes) {
  return crashes?.length > 0 ? ` Worker exited unexpectedly. ${crashes.map((crash) => `${crash.file}: ${crash.unfinishedTests} tests never finished`).join('; ')}.` : ''
}

/**
 * THE ERRORS VITEST COUNTED OUTSIDE THE TESTS, from the last summary in the whole run's log: the Errors line between
 * its Tests line and its Duration line, and 0 when there is none. null when the log has no summary, or an Errors line
 * that does not read as a count, because then nobody can say.
 */
function errorsOutsideTestsIn(path) {
  const lines = readFileSync(path, 'utf8').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split('\n')
  const start = lines.findLastIndex((line) => /^\s*Test Files\s/.test(line))
  if (start < 0 || !/^\s*Tests\s/.test(lines[start + 1] ?? '')) return null
  const end = lines.findIndex((line, at) => at > start && /^\s*Duration\s/.test(line))
  if (end < 0) return null
  const said = lines.slice(start + 2, end).filter((line) => /^\s*Errors\b/.test(line))
  if (said.length === 0) return 0
  const count = said.length === 1 ? /^\s*Errors\s+(\d+)\s+errors?\b/.exec(said[0]) : null
  return count === null || !Number.isSafeInteger(Number(count[1])) ? null : Number(count[1])
}

/**
 * WHAT EACH FILE RED IN THE WHOLE RUN DID ALONE, from the door's answer and each run's own files in <alone>/<n>/. The
 * door's list must name the failed files in the order it ran them: the carried-over ones red again first, then the
 * others in their order. The runs are given back in the order of the failed files. A run gave no result for the merge tool's reasons, in the
 * order of noResultIn in tools/merge-tool/red-files.mjs: no readable report, a report that does not name the file, a
 * command stopped before its end. It was green as aGreenRun there says: exit 0, and every file its report names passed.
 */
export function aloneRunsFrom({ said, clone, paths, failedFiles, first = [] }) {
  const listed = said.alone
  const order = [...first, ...failedFiles.filter((file) => !first.includes(file))]
  if (!Array.isArray(listed) || listed.length !== failedFiles.length || listed.some((one, at) => !object(one) || one.file !== order[at])) fail('The cloud door\'s runs alone do not match the red files. No receipt was filed.')
  return listed.map((one, at) => {
    const keys = Object.keys(one).sort().join(',')
    if (keys === 'file,notRun' && typeof one.notRun === 'string' && one.notRun.trim() !== '') return { file: one.file, outcome: 'not run', because: one.notRun, artifacts: [] }
    if (keys !== 'code,file,n' || one.n !== at + 1 || !Number.isInteger(one.code) || one.code < 0 || one.code > 255) fail(`The cloud door's run alone of ${one.file} has no run number, exit or reason. No receipt was filed.`)
    const folder = join(paths.alone, String(one.n))
    const log = join(folder, 'run.log')
    const reportPath = join(folder, 'report.json')
    aRegularFile(log, `The log of the run alone of ${one.file}`)
    const artifacts = [artifact('log', log)]
    let rows = null
    if (aRegularFile(reportPath, `The report of the run alone of ${one.file}`, true)) {
      artifacts.push(artifact('report', reportPath))
      try {
        const report = JSON.parse(readFileSync(reportPath, 'utf8'))
        if (object(report)) rows = (Array.isArray(report.testResults) ? report.testResults : []).map((row) => (object(row) ? row : {}))
      } catch { rows = null }
    }
    const noResult = (because) => ({ file: one.file, outcome: 'no result', exitCode: one.code, because, artifacts })
    if (rows === null) return noResult('it left no readable report')
    if (!rows.some((row) => typeof row.name === 'string' && relative(clone, row.name).split(sep).join('/') === one.file)) return noResult('its report does not name the file')
    if ([124, 137, 143].includes(one.code)) return noResult(`the command was stopped before its end (exit ${one.code})`)
    return { file: one.file, outcome: one.code === 0 && rows.every((row) => aPassedFile(row)) ? 'green' : 'red', exitCode: one.code, artifacts }
  }).sort((a, b) => failedFiles.indexOf(a.file) - failedFiles.indexOf(b.file))
}

/** Whether a file is there as a regular file. A symbolic link or another entry is refused; absence too, unless allowed. */
function aRegularFile(path, what, mayBeAbsent = false) {
  let stat
  try { stat = lstatSync(path) } catch (error) {
    if (error.code === 'ENOENT' && mayBeAbsent) return false
    fail(`${what} at ${path} is inaccessible: ${error.message}. No receipt was filed.`)
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${what} at ${path} is not a regular file. No receipt was filed.`)
  return true
}

function readJsonFileIsRegular(path) {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`The artifact at ${path} is not a regular file.`)
}

/** The office did not answer an ask: the fetch threw before an answer came, so whether the ask was stored is unknown. */
class TheOfficeDidNotAnswer extends Error {
  constructor(message, why) {
    super(message)
    this.name = 'TheOfficeDidNotAnswer'
    this.why = why
  }
}

/**
 * The default transport uses office_request, with PRODUCER_OFFICE_ANSWER_WAIT_MS in place of the tool's own wait. A
 * request's `longestReply` is handed to the request helper and never sent.
 */
export async function producerOfficeRequest(asked, env = process.env, fetchImpl = fetch) {
  const { longestReply, ...requested } = asked
  let theFetchThrew = false
  let why = null
  const boundedFetch = async (url, options) => {
    theFetchThrew = false
    why = null
    try {
      return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(PRODUCER_OFFICE_ANSWER_WAIT_MS) })
    } catch (error) {
      theFetchThrew = true
      why = error instanceof Error ? error.message : String(error)
      throw error
    }
  }
  try {
    return await askTheOffice(requested, { env, fetchImpl: boundedFetch, ...(longestReply === undefined ? {} : { longestReply }) })
  } catch (error) {
    if (!theFetchThrew) throw error
    throw new TheOfficeDidNotAnswer(error.message, why)
  }
}

async function runDoor({ clone, commit, paths, timeoutSeconds, attempt, env, signal, io, seat, carriedOver }) {
  const output = join(attempt, 'door-output.log')
  const fd = openSync(output, 'wx', 0o600)
  // The share-a-process switch is kept so the runner can turn it on for the whole run (tools/cloud-suite.criteria.md, 25).
  const safe = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'MOLE_OFFICE_CLOUD_RUNNER_FILE', 'MOLE_OFFICE_CLOUD_TRANSPORT', 'MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS', THE_TEST_MARK].filter((key) => env[key] !== undefined).map((key) => [key, env[key]]))
  // The group exists before registration, but the door cannot run until its ledger row is accepted.
  const gate = "const finishing = () => process.stderr.write('The cloud door will finish its bounded call and cleanup before stopping.\\n'); process.on('SIGTERM', finishing); process.on('SIGINT', finishing); process.stdin.once('data', bytes => { if (bytes.toString().trim() !== 'go') process.exit(111); import(process.argv[1]).catch(error => { process.stderr.write(error.message + '\\n'); process.exitCode = 1 }).finally(() => { process.removeListener('SIGTERM', finishing); process.removeListener('SIGINT', finishing) }) })"
  const child = spawn(process.execPath, ['--input-type=module', '-e', gate, CLOUD_DOOR, 'run', '--clone', clone, '--commit', commit, '--report', paths.report, '--reads', paths.reads, '--log', paths.log, '--manifest', paths.manifest, '--alone', paths.alone, ...(carriedOver === undefined ? [] : ['--carried-over', JSON.stringify(carriedOver)]), '--timeout', String(timeoutSeconds)], { env: safe, detached: false, stdio: ['pipe', fd, fd] })
  closeSync(fd)
  const closed = new Promise((yes, no) => { child.once('error', no); child.once('close', (code, stoppedBy) => yes({ code, stoppedBy })) })
  // A spawn failure can arrive before the registration request returns. It is still awaited below.
  closed.catch(() => {})
  let ended
  let resource = null
  try {
    if (!child.pid) await closed
    const held = await request(io, 'POST', '/api/resources', { type: 'process', key: String(child.pid), sessionRecordId: theRunsIdentity(env).session, detail: `Original cloud suite door for main ${commit}` })
    resource = held.resource?.id ?? held.id
    if (typeof resource !== 'string') fail('The cloud door group could not be registered. The door was not released to run.')
    const groupRows = Number.isInteger(held.resource?.pgid) ? await request(io, 'GET', `/api/resources?pgid=${held.resource.pgid}`) : null
    const seatRow = Array.isArray(groupRows?.resources) ? groupRows.resources.find((row) => row?.id === seat?.id) : undefined
    if (!Number.isInteger(held.resource?.pgid) || seatRow?.type !== 'slot' || seatRow?.pgid !== held.resource.pgid) fail('The suite seat does not identify the recorded producer group that contains this door. Nothing was released to the cloud.')
    if (signal?.aborted) child.stdin.end('stop\n')
    else child.stdin.end('go\n')
    ended = await closed
  } catch (error) {
    if (!child.stdin.destroyed) child.stdin.end('stop\n')
    await closed.catch(() => {})
    throw error
  } finally {
    if (resource !== null) await request(io, 'POST', `/api/resources/${encodeURIComponent(resource)}/release`, { signalNothing: true })
  }
  if (ended.code === null) fail(`The cloud door ended by ${ended.stoppedBy}; its result is unknown at ${output}.`)
  const last = readFileSync(output, 'utf8').trim().split('\n').at(-1)
  let answer
  try { answer = JSON.parse(last) } catch { fail(`The cloud door left no readable final answer at ${output}.`) }
  return { code: ended.code, answer, output }
}

/** One complete attempt. A test supplies its own office and cloud transport, never a live fallback. */
export async function runPeriodicSuiteOnce(options, supplied = {}) {
  return runOriginalSuiteOnce(options, supplied, null)
}

async function runOriginalSuiteOnce(options, supplied = {}, repair = null) {
  const config = configuration(options)
  const io = { officeRequest: (asked) => producerOfficeRequest(asked, options.env ?? process.env), runCloud: runDoor, clock: Date.now, sleep: sleepUnlessStopped, ...supplied }
  const line = options.seatLine
  if (line !== undefined && (!object(line) || !Number.isSafeInteger(line.until) || typeof line.seated !== 'function')) fail('A wait for the full-suite seat needs its end as a whole number of milliseconds and a step to take once seated. Nothing ran.')
  const commit = git(config.repository, ['rev-parse', '--verify', 'refs/heads/main^{commit}'])
  const tree = git(config.repository, ['rev-parse', `${commit}^{tree}`])
  if (repair !== null && repair.targetCommit !== commit) fail('The actual main capture differs from the reserved repair verification.')
  stateAt(join(config.workdir, 'state.json'))
  const existing = await existingReceipt(io, config.repository, commit)
  const already = receipt => ({ status: 'skipped', reason: 'receipt', says: `Main ${commit} already has receipt ${receipt.id}; ${receipt.green ? 'its whole suite passed' : 'it does not authorize an upgrade'}.`, receipt: receipt.id, evidence: receipt.evidence, green: receipt.green, outcome: receipt.outcome, commit })
  if (existing) return already(existing)
  if (repair !== null) await io.beforeExternalAction()
  mkdirSync(config.workdir, { recursive: true, mode: 0o700 })
  const lock = join(config.workdir, 'producer.lock')
  let lockFd
  try { lockFd = openSync(lock, 'wx', 0o600) } catch (error) { if (error.code === 'EEXIST') fail(`Another producer may hold ${lock}. Nothing ran; inspect the recorded holder.`); throw error }
  writeFileSync(lockFd, `${JSON.stringify({ pid: process.pid, repository: config.repository })}\n`)
  closeSync(lockFd)
  const stateFile = join(config.workdir, 'state.json')
  // The slot row this run holds, its seat or its place in line. The finally below gives it back on every outcome.
  const held = { id: null }
  try {
    const state = stateAt(stateFile)
    const checkedMs = timeOf(io)
    if (state.lastStartedAtMs !== null && checkedMs < state.lastStartedAtMs) fail('The producer clock moved backwards. Nothing ran.')
    if (repair === null && config.intervalSeconds !== null && state.lastStartedAtMs !== null && checkedMs - state.lastStartedAtMs < config.intervalSeconds * 1000) return { status: 'skipped', reason: 'interval', says: 'Not run: the next two-to-three-hour suite time has not arrived.' }
    const waited = await waitForTheSeat(io, config.processResource, held, line, options.signal)
    if (waited.seat === null) return { status: 'skipped', reason: 'seat', says: waited.says }
    const seat = waited.seat
    line?.seated()
    // The suite starts when the seat is granted, which may be long after the wait for it began.
    const startedMs = timeOf(io)
    if (startedMs < checkedMs) fail('The producer clock moved backwards while it waited for the full-suite seat. Nothing ran.')
    const underSeat = await existingReceipt(io, config.repository, commit)
    if (underSeat) return already(underSeat)
    const attempt = mkdtempSync(join(config.workdir, 'attempt-'))
    const clone = join(attempt, 'clone')
    const paths = { report: join(attempt, 'report.json'), manifest: join(attempt, 'manifest.json'), reads: join(attempt, 'reads'), log: join(attempt, 'suite.log'), alone: join(attempt, 'alone') }
    const startedAt = localStamp(new Date(startedMs))
    // Every later state keeps the last receipt, so the files it left not run alone are carried over after any end.
    const kept = state.lastReceipt === undefined ? {} : { lastReceipt: state.lastReceipt }
    const carried = await theCarriedOver(io, state.lastReceipt)
    save(join(attempt, 'carried-over.json'), carried)
    save(stateFile, { ...state, pending: { attempt, commit, step: 'preparing' } })
    if (repair !== null) await io.beforeExternalAction()
    git(config.repository, ['clone', '--no-local', '--no-checkout', config.repository, clone])
    git(clone, ['checkout', '--detach', commit])
    if (git(clone, ['rev-parse', 'HEAD']) !== commit || git(clone, ['rev-parse', 'HEAD^{tree}']) !== tree) fail('The suite clone is not the captured main commit and tree.')
    save(stateFile, { ...state, pending: { attempt, commit, step: 'asking the cloud door' } })
    if (repair !== null) await io.beforeExternalAction()
    const result = await io.runCloud({ clone, commit, paths, timeoutSeconds: config.timeoutSeconds, attempt, env: options.env ?? process.env, signal: options.signal, io, seat, ...(carried.files.length > 0 ? { carriedOver: carried.files } : {}) })
    save(join(attempt, 'door-result.json'), result)
    // A whole run the door ended as hung (criterion 30) ends here with its records kept. Its cause is recorded, so
    // nothing is left pending. A report it left was written while tests still ran, and is never filed as counts.
    const hung = result.code === 75 && object(result.answer) && result.answer.ran === false ? result.answer.hung : undefined
    if (object(hung) && Array.isArray(hung.workers) && Array.isArray(hung.leftBehind) && hung.workers.every((one) => object(one))) {
      save(join(attempt, 'hung.json'), hung)
      save(stateFile, { version: 1, lastStartedAtMs: startedMs, pending: null, ...kept })
      const named = hung.workers.length === 0 ? 'no vitest worker was found' : hung.workers.map((one) => `${one.file ?? 'a file nobody could name'} waits in ${one.wait}`).join('; ')
      fail(`The cloud box ended the whole run as hung after ${hung.quietSec} s without a move: ${named}. Its records are at ${join(attempt, 'hung.json')}. No receipt was filed.`)
    }
    if (result.code === 75 && object(result.answer) && result.answer.ran === false && typeof result.answer.reason === 'string' && result.answer.reason.trim() !== '') {
      const knownUnstarted = ['the cloud box is busy with another suite', 'the cloud box could not be reached to receive the commit'].includes(result.answer.reason)
      if (!knownUnstarted || Object.hasOwn(result.answer, 'phase') || Object.hasOwn(result.answer, 'buildExitCode') || Object.hasOwn(result.answer, 'suiteExitCode')) {
        save(stateFile, { version: 1, lastStartedAtMs: startedMs, pending: { attempt, commit, step: 'cloud evidence or cleanup is incomplete' }, ...kept })
        fail(`The cloud run has evidence or cleanup still unverified at ${attempt}. Its cadence and recovery data were kept. No receipt was filed.`)
      }
      save(stateFile, { ...state, pending: null })
      return { status: 'not run', says: `Not run: ${result.answer.reason}. No receipt was filed and there was no local fallback.`, attempt }
    }
    if (result.answer?.ran !== true) fail('The cloud door did not give a defensible run result. No receipt was filed.')
    // A real run consumes the cadence even if its build or tests fail.
    save(stateFile, { version: 1, lastStartedAtMs: startedMs, pending: { attempt, commit, step: 'validating original artifacts' }, ...kept })
    const endedAt = localStamp(new Date(io.clock()))
    const said = result.answer
    const fields = said.phase === 'test' && said.code !== 0 ? await theReceiptFieldsOfTheOffice(io) : { allowsVersion2: false, allowsWorkerCrashes: false }
    const allowsVersion2 = said.alone !== undefined && fields.allowsVersion2
    const data = receiptFromArtifacts({ repository: config.repository, commit, tree, clone, paths, result, startedAt, endedAt, allowsVersion2, carriedOver: carried.files })
    const ranFirst = theCarriedFirst(carried.files, data.failedFiles ?? [])
    const carriedSays = carriedWords(carried, ranFirst, data.failedFiles !== undefined)
    const crashes = workerCrashWords(data.workerCrashes)
    const shared = said.filesShareAProcess === true ? ' Test files shared processes in this run, because MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS was on.' : ''
    if (!fields.allowsWorkerCrashes) delete data.workerCrashes
    // The answer names what each red file did alone even when the receipt is version 1 and keeps none of it.
    const runsAlone = said.alone === undefined ? undefined : data.aloneRuns ?? (data.failedFiles?.length > 0 ? aloneRunsFrom({ said, clone, paths, failedFiles: data.failedFiles, first: ranFirst }) : [])
    save(join(attempt, 'receipt.json'), data)
    const packReads = io.packReads ?? packTheReads
    const packing = data.artifacts.some((artifact) => artifact.name === 'reads') ? await packReads(attempt) : null
    if (packing?.packed) {
      const kept = data.artifacts.find((artifact) => artifact.name === 'reads')
      if (kept === undefined) fail('The receipt has no reads artifact to name the packed record.')
      kept.path = packing.archive
      save(join(attempt, 'receipt.json'), data)
    }
    const packingSays = packing === null ? ''
      : packing.packed
        ? ' The read folder was packed as reads.tar.zst and removed after the unpacked copy matched its sha256.'
        : ` The read folder was not packed and stays at ${packing.folder}: ${packing.why}`
    save(stateFile, { version: 1, lastStartedAtMs: startedMs, pending: { attempt, commit, step: 'filing the receipt' }, ...kept })
    const fixture = carriesTheTestMark(options.env ?? process.env)
    // The office answers with the whole record, so the filing reads as long an answer as every receipt-evidence read.
    // The three calls after it answer with the new revision's header, the short forms and the link, so none carries the receipt.
    const filed = await request(io, 'POST', '/api/records', { kind: RECEIPT_KIND, title: `${fixture ? 'Fixture: ' : ''}Whole suite on main at ${commit}`, summary: (fixture ? 'Made-up cloud evidence from a contract test, filed only in its throwaway office.' : `The cloud box reported the original build result for main ${commit}. The receipt keeps any suite result and manifest coverage it returned.`) + packingSays + shared + crashes + carriedSays, data }, THE_LONGEST_RECEIPT_REPLY)
    const id = filed.record?.id
    if (typeof id !== 'string' || id === '' || filed.record.kind !== RECEIPT_KIND) fail(`The office did not identify the filed receipt. Its filing is unverified; recovery data is at ${attempt}.`)
    save(stateFile, { version: 1, lastStartedAtMs: startedMs, pending: { attempt, commit, receipt: id, step: 'writing its label' }, ...kept })
    const revisions = await request(io, 'GET', `/api/records/${encodeURIComponent(id)}/revisions?limit=1`)
    const revision = revisions.revisions?.[0]
    if (!Number.isInteger(revision?.seq) || typeof revision.contentHash !== 'string') fail(`The receipt ${id} has no readable revision for its label.`)
    await request(io, 'POST', `/api/records/${encodeURIComponent(id)}/short-forms`, { madeFrom: { seq: revision.seq, contentHash: revision.contentHash }, forms: { label: fixture ? 'Fixture suite result' : 'Main suite result' } })
    const session = theRunsIdentity(options.env ?? process.env).session
    if (typeof session === 'string' && session !== '') await request(io, 'POST', '/api/links', { fromId: id, toId: session, type: 'about' })
    save(stateFile, { version: 1, lastStartedAtMs: startedMs, pending: null, lastReceipt: id })
    const green = wholeSuiteReceiptIsGreen(data)
    const verdict = data.version === 2
      ? (green ? 'the whole run was red, and each file red in it passed when it was run alone, which version 2 counts as green' : 'the recorded build, suite, coverage or runs alone do not authorize an upgrade')
      : (green ? 'the complete cloud whole suite passed' : 'the recorded build, suite or coverage does not authorize an upgrade')
    const alone = runsAlone === undefined ? undefined : Object.fromEntries([['green', 'green'], ['red', 'red'], ['noResult', 'no result'], ['notRun', 'not run']].map(([key, outcome]) => [key, runsAlone.filter((run) => run.outcome === outcome).map((run) => run.file)]))
    const why = data.failedFiles?.length > 0 && data.version === 1 ? (runsAlone === undefined ? ' The cloud door returned no runs alone, so the receipt is version 1.' : ' This office takes only version 1 of the receipt, so its runs alone are not in it.') : ''
    const named = alone === undefined ? [] : [['green', 'green alone'], ['red', 'red alone'], ['noResult', 'no result alone'], ['notRun', 'not run alone']].filter(([key]) => alone[key].length > 0).map(([key, words]) => `${words}: ${alone[key].join(', ')}`)
    const olderCrashField = crashes !== '' && !fields.allowsWorkerCrashes ? ' This office has no workerCrashes field; the receipt names the crash in its summary and keeps the original hashed report and log.' : ''
    const says = `${fixture ? 'Fixture receipt' : 'Receipt'} ${id} records main ${commit}: ${verdict}.${why}${crashes}${olderCrashField}${named.length > 0 ? ` The red files, each run alone: ${named.join('; ')}.` : ''}${packingSays}${carriedSays} Main and the office were not moved.`
    // alone is absent when the door returned no runs alone; nothing is put in its place.
    return alone === undefined
      ? { status: 'filed', receipt: id, green, commit, attempt, carried: { ...carried, ranFirst }, says }
      : { status: 'filed', receipt: id, green, commit, attempt, alone, carried: { ...carried, ranFirst }, says }
  } finally {
    try { if (held.id !== null) await releaseSeat(io, held.id) }
    finally { unlinkSync(lock) }
  }
}

/** One reserved repair verification, through the same original writer and cloud door as periodic mode.
 * `attempted` is intent, never a cloud-start claim. A lost attempt is reconciled, never rerun blindly. */
export async function runRepairSuiteOnce(options, supplied = {}) {
  const settingModule = '../src/config/whole-suite-red.mjs'
  const { wholeSuiteFixRoundIsOn } = await import(settingModule)
  if (!wholeSuiteFixRoundIsOn(options.env ?? process.env)) return { status: 'dormant', says: 'The whole-suite fix round is off.' }
  if (typeof supplied.officeRequest !== 'function') fail('Repair verification requires the controller\'s own program transport.')
  const transport = supplied.officeRequest
  const beforeExternalAction = async () => {
    const act = await readFixRoundPersonStop(options.problem, { officeRequest: transport })
    if (act) throw new FixRoundPersonStop(act)
    await supplied.beforeExternalAction?.()
  }
  const io = { clock: Date.now, ...supplied, beforeExternalAction, officeRequest: async request => {
    if (request.method !== 'GET' && !/^\/api\/slots\/[^/]+\/release$/.test(request.path)) await beforeExternalAction()
    return transport(request)
  } }
  const contractModule = '../src/shared/main-suite-fix.ts'
  const { mainSuiteFixSchema, mainSuiteFixPinned } = await import(contractModule)
  const read = path => readReceiptEvidenceObject(io.officeRequest, path)
  const recordPath = `/api/records/${options.problem}`
  let held, ns
  const refresh = async () => {
    held = await read(recordPath); ns = mainSuiteFixSchema.parse(held.record?.data?.mainSuiteFix)
    const original = await read(`${recordPath}/revisions/1`)
    if (JSON.stringify(mainSuiteFixPinned(ns)) !== JSON.stringify(mainSuiteFixPinned(mainSuiteFixSchema.parse(original.content?.data?.mainSuiteFix)))) fail('The repair verification original problem correlation drifted.')
    const own = theRunsIdentity(options.env ?? process.env)
    const run = (await read(`/api/records/${own.session}`)).record
    if (ns.claim.run !== own.session || options.identity?.run !== own.session || run?.data?.servingAgentId !== ns.claim.agent || run.data.state !== 'running') fail('The verification belongs to another controller claim.')
    if (ns.repository !== options.repository || !ns.repair?.entry || ns.outcome) fail('Only a claimed problem\'s landed repair may request verification.')
    const repair = (await read(`/api/records/${ns.repair.entry}`)).record
    const verification = ns.verification
    if (repair?.kind !== 'merge_entry' || repair.data.state !== 'merged' || repair.data.fixRound?.problem !== options.problem || repair.data.fixRound.kind !== 'repair'
      || repair.data.integrated?.mainAfter !== verification?.repairCommit || verification.repairCommit !== options.repairCommit || verification.targetCommit !== options.targetCommit
      || verification.attempt !== options.attempt || !isAbsolute(verification.attempt)) fail('The reserved verification does not match the actual landed repair and one target/attempt.')
    git(options.repository, ['merge-base', '--is-ancestor', verification.repairCommit, verification.targetCommit])
    git(options.repository, ['merge-base', '--is-ancestor', verification.targetCommit, 'refs/heads/main'])
  }
  const patch = async verification => {
    await refresh()
    await request(io, 'PATCH', recordPath, { ifVersion: held.version, dataPatch: { mainSuiteFix: { verification } } })
    await refresh()
  }
  const finish = async found => {
    const readPin = await readOriginalReceipt(found.receipt ?? found.id, { officeRequest: io.officeRequest })
    const verified = await verifyOriginalReceiptEvidence({ repository: options.repository, commit: options.targetCommit, evidence: readPin.evidence }, { officeRequest: io.officeRequest })
    const repair = (await read(`/api/records/${ns.repair.entry}`)).record
    if (verified.green && !originalGreenFollowsRepair({ endedAt: verified.receipt.endedAt, landedAt: repair.data.integrated?.at, originalEndedAtMs: ns.endedAtMs, timeZone: ns.timeZone })) fail(`Original green receipt ${JSON.stringify(readPin.evidence)} does not end after the actual repair landing and original red. Its use for repair verification is unavailable; its original green outcome is preserved.`)
    await patch({ ...ns.verification, state: 'complete', receipt: readPin.evidence, outcome: verified.outcome })
    return { status: 'verified', receipt: readPin.evidence, outcome: verified.outcome, commit: options.targetCommit }
  }
  await refresh()
  await beforeExternalAction()
  if (ns.verification.state === 'complete') return finish({ receipt: ns.verification.receipt.recordId })
  if (ns.verification.state === 'unavailable') return { status: 'unavailable', says: ns.verification.says }
  const found = await existingReceipt(io, options.repository, options.targetCommit)
  if (found) {
    if (ns.verification.state === 'planned') await patch({ ...ns.verification, state: 'attempted' })
    return finish({ receipt: found.id })
  }
  if (ns.verification.state === 'attempted') {
    const says = 'The reserved verification was invoked but no original receipt can be reconciled. Retain its attempt journal; no second cloud run was guessed.'
    await patch({ ...ns.verification, state: 'unavailable', says })
    return { status: 'unavailable', says }
  }
  if (!existsSync(dirname(options.attempt)) || realpathSync(dirname(options.attempt)) !== dirname(options.attempt) || existsSync(options.attempt)
    || within(options.repository, options.attempt)) fail('Name one new canonical external verification-attempt journal.')
  writeFileSync(options.attempt, JSON.stringify({ version: 1, problem: options.problem, repairCommit: options.repairCommit, targetCommit: options.targetCommit, controller: ns.claim, state: 'planned' }) + '\n', { flag: 'wx', mode: 0o600 })
  await patch({ ...ns.verification, state: 'attempted' })
  try {
    const config = configuration(options)
    if (git(config.repository, ['rev-parse', 'refs/heads/main']) !== options.targetCommit) fail('Development main changed before its reserved verification capture.')
    const result = await runOriginalSuiteOnce(options, io, { problem: options.problem, targetCommit: options.targetCommit, attempt: options.attempt })
    if (result.receipt) return await finish(result)
    const says = result.says ?? 'The original verification could not run; no local fallback was used.'
    await patch({ ...ns.verification, state: 'unavailable', says })
    save(options.attempt, { version: 1, problem: options.problem, repairCommit: options.repairCommit, targetCommit: options.targetCommit, state: 'unavailable', says })
    return { status: 'unavailable', says }
  } catch (error) {
    if (error.code === 'MAIN_SUITE_PERSON_STOP') throw error
    // Filing may have succeeded before its response was lost. Reconcile original evidence first.
    const after = await existingReceipt(io, options.repository, options.targetCommit)
    if (after) return await finish({ receipt: after.id })
    const says = withoutKeys(`The original verification is unavailable: ${error.message}`)
    await patch({ ...ns.verification, state: 'unavailable', says })
    save(options.attempt, { version: 1, problem: options.problem, repairCommit: options.repairCommit, targetCommit: options.targetCommit, state: 'unavailable', says })
    return { status: 'unavailable', says }
  }
}


export async function watchPeriodicSuites(options, supplied = {}) {
  const sleep = supplied.sleep ?? ((ms) => sleepUnlessStopped(ms, options.signal))
  const say = supplied.say ?? ((result) => process.stdout.write(`${result.says}\n${JSON.stringify(result)}\n`))
  const checkSeconds = options.checkSeconds ?? 60
  if (!Number.isInteger(checkSeconds) || checkSeconds < 60 || checkSeconds > 3600) fail('Check for a gap at most once a minute, with a check interval of 60 to 3600 seconds.')
  while (!options.signal?.aborted) {
    say(await runPeriodicSuiteOnce(options, supplied))
    if (!options.signal?.aborted) await sleep(checkSeconds * 1000)
  }
}

function argumentsOf(words) {
  const mode = words.shift()
  if (!['once', 'watch'].includes(mode)) fail('Use once or watch with --repository, --workdir and --process-resource. Watch checks every minute and runs at most once every two to three hours.')
  const named = {}
  while (words.length > 0) {
    const key = words.shift()
    if (!['--repository', '--workdir', '--process-resource', '--interval-seconds', '--timeout-seconds', '--check-seconds'].includes(key) || Object.hasOwn(named, key) || words.length === 0) fail('An option is unknown, repeated or missing its value.')
    named[key] = words.shift()
  }
  return { mode, repository: named['--repository'], workdir: named['--workdir'], processResource: named['--process-resource'], ...(named['--interval-seconds'] === undefined ? {} : { intervalSeconds: Number(named['--interval-seconds']) }), ...(named['--timeout-seconds'] === undefined ? {} : { timeoutSeconds: Number(named['--timeout-seconds']) }), ...(named['--check-seconds'] === undefined ? {} : { checkSeconds: Number(named['--check-seconds']) }) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // THE START CHECK (wave 13q) is in the entry guard, so a file that imports this one is not stopped by it.
  stopAnUnpairedStableStart()
  const controller = new AbortController()
  const stop = () => { controller.abort(); process.stdout.write('Stopping after the current bounded cloud run and cleanup finish. The suite seat stays held until then.\n') }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  try {
    const options = { ...argumentsOf(process.argv.slice(2)), signal: controller.signal }
    // The real cloud door has its own test guard. This process never offers a stand-in as a live run.
    if (carriesTheTestMark() && !readSetting('MOLE_OFFICE_CLOUD_TRANSPORT', process.env).value) fail('A test of this producer must name the cloud stand-in transport. The real box was not asked.')
    if (options.mode === 'watch') await watchPeriodicSuites(options)
    else {
      const result = await runPeriodicSuiteOnce(options)
      process.stdout.write(`${result.says}\n${JSON.stringify(result)}\n`)
      if (result.status === 'not run') process.exitCode = 75
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  } finally { process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop) }
}
