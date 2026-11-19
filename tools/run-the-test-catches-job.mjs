// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ONE TICK OF THE DAILY TEST CATCHES READING. A timer outside the repository runs this file with --queue, --work
 * and --sandboxes. The counter of src/config/test-catches-job.mjs owns the schedule; its unfinished firings are
 * the work.
 *
 * A tick files the counter when it is missing, answers every older firing as not run, and for the newest runs
 * tools/test-catches-in-the-queue.mjs from the Monday that starts the latest whole week. A day's queue read is
 * kept as queue-<day>.json in the work folder. The week is filed once: week-<from>.json says a report already
 * exists. No folder path ever reaches a sentence, an answer or a report.
 *
 * THE REPORT IS ABOUT TWO RECORDS (chapter 10 rule 2): the counter that asked for it, and the named-tests tool's
 * record, because the line side is that tool's runs of the test files. A project with no such tool record stops
 * the tick before anything is filed, and the firing stays waiting for the next tick. Its short forms are written
 * straight after it is filed, from the revision the filing made (chapter 10 rule 3).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TEST_CATCHES_COUNTER, TEST_CATCHES_JOB } from '../src/config/test-catches-job.mjs'
import { officeHeaders, theAgentKey } from './sandbox-common.mjs'
import { whereIsTheApi } from './where-is-the-api.mjs'
import { stopAnUnpairedStableStart } from '../src/config/the-office-tool-environment.mjs'
import { THE_TEST_FILES_TOOL } from '../src/shared/toolset.ts'
import { aLocalDay, theLatestWholeWeek, theOldCount, theQueueRowsOfTheWeek, theWeek } from './test-catches-of-the-week.mjs'

/** @typedef {import('../src/shared/counters.ts').CounterRowReading} Firing */
/** @typedef {import('../src/shared/counters.ts').CounterReading} Counter */

/** The queue reader this tick starts, as an absolute path, so no working folder can change which file runs. */
const THE_READER = fileURLToPath(new URL('./test-catches-in-the-queue.mjs', import.meta.url))
/** How many characters of the queue reader's error output an answer carries. */
const ERROR_SHOWN = 300

/**
 * THE COMMAND LINE OF ONE TICK: --queue, --work and --sandboxes, each an absolute path, and nothing else.
 * @param {string[]} argv
 * @returns {{queue: string, work: string, sandboxes: string}}
 */
export function readTheTickArguments(argv) {
  /** @type {{queue?: string, work?: string, sandboxes?: string}} */
  const answer = {}
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (word !== '--queue' && word !== '--work' && word !== '--sandboxes') {
      throw new Error(`Unknown argument ${word}: this tick takes only --queue, --work and --sandboxes, each an absolute path.`)
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('-')) throw new Error(`${word} needs an absolute path.`)
    if (!isAbsolute(value)) throw new Error(`${word} needs an absolute path, and ${value} is not one.`)
    answer[/** @type {'queue' | 'work' | 'sandboxes'} */ (word.slice(2))] = value
    i += 1
  }
  for (const flag of ['--queue', '--work', '--sandboxes']) {
    const name = /** @type {'queue' | 'work' | 'sandboxes'} */ (flag.slice(2))
    if (answer[name] === undefined) throw new Error(`${flag} is required, and needs an absolute path.`)
  }
  return /** @type {{queue: string, work: string, sandboxes: string}} */ (answer)
}

/**
 * ONE TICK: install the counter, answer older firings, and read the week for the newest.
 * @param {{ask: (method: string, path: string, body?: unknown) => Promise<any>, exec: (args: readonly string[]) => {status: number | null, stdout: string, stderr: string}}} doors
 * @param {{queue: string, work: string, sandboxes: string}} folders
 * @returns {Promise<string>}
 */
export async function testCatchesTick(doors, folders) {
  const listed = await doors.ask('GET', '/api/counters')
  if (!Array.isArray(listed.counters)) throw new Error('The counters reply holds no counter list.')
  /** @type {Counter[]} */
  const counters = listed.counters.filter((/** @type {Counter} */ one) => one.action.kind === 'job' && one.action.job === TEST_CATCHES_JOB)
  // Installation is repeatable. A paused counter remains paused; it is never replaced.
  if (!counters.some((one) => one.title === TEST_CATCHES_COUNTER.title)) {
    const made = await doors.ask('POST', '/api/counters', TEST_CATCHES_COUNTER)
    counters.push(made.counter)
  }
  /** @type {{counter: Counter, firing: Firing}[]} */
  const pending = []
  for (const counter of counters) {
    let before
    do {
      const page = await doors.ask('GET', `/api/counters/${encodeURIComponent(counter.id)}?limit=25${before === undefined ? '' : `&before=${before}`}`)
      if (!Array.isArray(page.rows)) throw new Error('The counter reply holds no firing rows.')
      for (const firing of page.rows) if (firing.what === 'firing' && firing.answer?.job === TEST_CATCHES_JOB && firing.answer.finished === false) pending.push({ counter, firing })
      if (!page.more) break
      before = Math.min(...page.rows.map((/** @type {Firing} */ row) => row.seq))
      if (!Number.isFinite(before)) throw new Error('The counter page says more rows exist but names no next row.')
    } while (true)
  }
  pending.sort((a, b) => a.firing.at.localeCompare(b.firing.at) || a.firing.seq - b.firing.seq)
  const newest = pending.pop()
  if (newest === undefined) return 'No test catches firing is waiting, so no queue was read.'
  for (const { counter, firing } of pending) {
    await answer(doors, counter, firing, `Not run, because firing ${String(newest.firing.seq)} is newer and one reading answers the day.`)
  }
  const older = pending.length === 0 ? '' : ` ${String(pending.length)} older ${pending.length === 1 ? 'firing was' : 'firings were'} answered as not run.`

  const week = theLatestWholeWeek(new Date())
  const today = aLocalDay(new Date())
  const dailyName = `queue-${today}.json`
  mkdirSync(folders.work, { recursive: true })
  const ran = doors.exec([THE_READER, '--queue', folders.queue, '--since', week.from, '--out', join(folders.work, dailyName)])
  if (ran.status !== 0) {
    const status = ran.status === null ? 'no exit status' : `status ${String(ran.status)}`
    const error = replacingFoldersWithTheirFlags(ran.stderr, folders).trim()
    const shown = error.length > ERROR_SHOWN ? `${error.slice(0, ERROR_SHOWN)} … (cut at ${String(ERROR_SHOWN)} characters)` : error === '' ? '(none)' : error
    await answer(doors, newest.counter, newest.firing, `The queue reader ended with ${status}, so nothing was filed. Its error output: ${shown}`)
    return `Test catches firing ${String(newest.firing.seq)} of counter ${newest.counter.id} was answered: the queue reader ended with ${status}.${older}`
  }
  const alreadyFiled = join(folders.work, `week-${week.from}.json`)
  if (existsSync(alreadyFiled)) {
    await answer(doors, newest.counter, newest.firing, `The queue was read into ${dailyName}, and the week ${week.from} to ${week.to} was filed before.`)
    return `Test catches firing ${String(newest.firing.seq)} of counter ${newest.counter.id} was answered: the queue was read into ${dailyName}, and the week was filed before.${older}`
  }

  const measured = await doors.ask('GET', `/api/toolset/${THE_TEST_FILES_TOOL}`)
  if (typeof measured.tool?.id !== 'string') throw new Error(`The office's page for the ${THE_TEST_FILES_TOOL} tool names no record id, so the report would not be about what it measures.`)
  const door = await doors.ask('GET', `/api/toolset/${THE_TEST_FILES_TOOL}/files?from=${encodeURIComponent(week.from)}&to=${encodeURIComponent(week.to)}`)
  const queue = theQueueRowsOfTheWeek({ work: folders.work, from: week.from, to: week.to })
  const old = theOldCount({ sandboxes: folders.sandboxes, before: door.linesStoredSince ?? null })
  const report = theWeek({ from: week.from, to: week.to, door, queue, old })
  const made = await doors.ask('POST', '/api/records', {
    kind: 'report',
    title: report.title,
    summary: report.summary,
    data: report.data,
    links: [
      { type: 'about', toId: newest.counter.id },
      { type: 'about', toId: measured.tool.id },
    ],
  })
  const id = made.record.id
  writeFileSync(
    alreadyFiled,
    `${JSON.stringify({ report: id, from: week.from, to: week.to, table: report.table, old: old.files }, null, 2)}\n`,
  )
  // A NEW RECORD HAS NO REVISION TO NAME UNTIL IT IS FILED, so the short forms are written second.
  const revisions = await doors.ask('GET', `/api/records/${encodeURIComponent(id)}/revisions?limit=1`)
  const newestRevision = Array.isArray(revisions.revisions) ? revisions.revisions[0] : undefined
  if (typeof newestRevision?.seq !== 'number' || typeof newestRevision.contentHash !== 'string') throw new Error(`Report ${id} was filed, but its revisions name no newest revision, so its short forms were not written.`)
  await doors.ask('POST', `/api/records/${encodeURIComponent(id)}/short-forms`, { madeFrom: { seq: newestRevision.seq, contentHash: newestRevision.contentHash }, forms: report.shortForms })
  await answer(doors, newest.counter, newest.firing, `The queue was read into ${dailyName}. The week ${week.from} to ${week.to} is filed as report ${id}.`, id)
  return `Test catches firing ${String(newest.firing.seq)} of counter ${newest.counter.id} was answered: the queue was read into ${dailyName}, and the week ${week.from} to ${week.to} was filed as report ${id}.${older}`
}

/**
 * The error output with each folder shown by the flag that names it, so no answer holds a path.
 * @param {string} text
 * @param {{queue: string, work: string, sandboxes: string}} folders
 */
function replacingFoldersWithTheirFlags(text, folders) {
  let out = text
  const pairs = /** @type {[string, string][]} */ ([
    [folders.queue, '--queue'],
    [folders.work, '--work'],
    [folders.sandboxes, '--sandboxes'],
  ]).sort((a, b) => b[0].length - a[0].length)
  for (const [path, flag] of pairs) if (path !== '') out = out.split(path).join(flag)
  return out
}

/**
 * @param {{ask: (method: string, path: string, body?: unknown) => Promise<any>}} doors
 * @param {{id: string}} counter
 * @param {{seq: number}} firing
 * @param {string} says
 * @param {string} [result]
 */
async function answer(doors, counter, firing, says, result) {
  await doors.ask('POST', `/api/counters/${encodeURIComponent(counter.id)}/firings/${String(firing.seq)}/answer`, result === undefined ? { says } : { says, result })
}

/**
 * Production asks the office as the runner's own agent and starts the queue reader with node.
 * @returns {{ask: (method: string, path: string, body?: unknown) => Promise<any>, exec: (args: readonly string[]) => {status: number | null, stdout: string, stderr: string}}}
 */
export function productionDoors() {
  const api = process.env['MOLE_OFFICE_API']
  const workspace = process.env['MOLE_OFFICE_WORKSPACE']
  const agent = process.env['MOLE_OFFICE_AGENT']
  const session = process.env['MOLE_OFFICE_SESSION']
  const key = theAgentKey()
  if (!api || !workspace || !agent || !session || key === null) throw new Error('The test catches runner needs its own agent, project, session and key environment.')
  const base = whereIsTheApi(api)
  const headers = officeHeaders({ workspace, agent, session, key })
  return {
    ask: async (method, path, body) => {
      const response = await fetch(`${base}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { ...headers, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const said = await response.json()
      if (!response.ok) throw new Error(`Test catches office ${method} ${path} answered ${String(response.status)}: ${JSON.stringify(said)}`)
      return said
    },
    exec: (args) => {
      const ran = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      if (ran.error) throw ran.error
      return ran
    },
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  // THE START CHECK is in the entry guard, so a file that imports this one is not stopped by it.
  stopAnUnpairedStableStart()
  const folders = readTheTickArguments(process.argv.slice(2))
  testCatchesTick(productionDoors(), folders).then((says) => console.log(says)).catch((error) => {
    console.error(`Test catches could not finish: ${error.message}`)
    process.exitCode = 1
  })
}
