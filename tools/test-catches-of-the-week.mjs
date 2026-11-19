// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ONE WEEK OF TEST CATCHES, JOINED FROM THE MERGE QUEUE AND THE LINE ROWS.
 *
 * This module has no command line. tools/run-the-test-catches-job.mjs calls it each day; the office's report
 * page reads what that tick filed. It joins two readers that already exist: the daily queue files written by
 * tools/test-catches-in-the-queue.mjs, and the line rows behind GET /api/toolset/named-tests/files.
 *
 * IT REPORTS AND MOVES NOTHING. The slow files that caught nothing on either side are a list to read, never an
 * instruction. The old red-then-green count is kept in its own block because its cause is not known, so it is
 * not a catch and is never added to one.
 *
 * Every folder it reads is the caller's; it writes no file at all.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { medianOf } from '../src/shared/median.ts'
import { localStamp } from '../src/shared/time.ts'
import { totalsOf } from './test-catches-in-the-queue.mjs'

/** The cell a median gets when there are no seconds to take it from. */
const NOT_KNOWN = 'not known'
/** The class cell until a list of classes is written. */
const NOT_CLASSIFIED = 'not classified yet'
/** The most candidates the report lists; the full table in the work folder keeps every file. */
const CANDIDATES_SHOWN = 50
/** Who the report is for, in the plain words every reader of it needs. */
const FOR_WHOM = 'The owner and the supervisors who decide where each test file runs'
/** The columns of every table here, in this order and no other. */
const THE_COLUMNS = [
  'File',
  'Class',
  'Caught in the queue',
  'Caught before the seal',
  'Runs in the queue',
  'Runs in lines',
  'Queue seconds in the week',
  'Median queue seconds',
  'Median line seconds',
]

/**
 * A local date as `YYYY-MM-DD`, never UTC. The tick names its daily file with it too.
 * @param {Date} at
 */
export function aLocalDay(at) {
  return localStamp(at).slice(0, 10)
}

/** A count and its noun, with the noun's plural when the count is not one. @type {(n: number, one: string, many: string) => string} */
const counted = (n, one, many) => `${String(n)} ${n === 1 ? one : many}`

/**
 * THE LATEST WHOLE WEEK: from the Monday before the current week's Monday, to that Monday, both at local
 * midnight. `to` is the Monday that starts the week `now` is in, so the week is whole as soon as it begins.
 * @param {Date} now
 * @returns {{from: string, to: string}}
 */
export function theLatestWholeWeek(now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sinceMonday = (today.getDay() + 6) % 7
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMonday)
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 7)
  return { from: aLocalDay(from), to: aLocalDay(to) }
}

/**
 * THE QUEUE ROWS OF THE WEEK, merged from the daily files the tick keeps.
 *
 * A row is the same entry, time and file across days. Its seconds come from the earliest daily file where they
 * are not null, and every other field comes from the first file that has it. Only rows whose `at` is in
 * `[from 00:00:00, to 00:00:00)` are kept. Files named `week-*.json` and anything else are ignored.
 * @param {{work: string, from: string, to: string}} folders
 * @returns {{rows: any[], days: string[], since: string | null}}
 */
export function theQueueRowsOfTheWeek({ work, from, to }) {
  const daily = []
  if (existsSync(work)) {
    for (const one of readdirSync(work, { withFileTypes: true })) {
      if (!one.isFile()) continue
      const match = /^queue-(\d{4}-\d{2}-\d{2})\.json$/u.exec(one.name)
      if (match === null) continue
      const day = /** @type {string} */ (match[1])
      if (day < from) continue
      daily.push({ day, name: one.name })
    }
  }
  daily.sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name))
  const merged = new Map()
  const days = []
  /** @type {string | null} */
  let since = null
  for (const file of daily) {
    days.push(file.day)
    let parsed
    try {
      parsed = JSON.parse(readFileSync(join(work, file.name), 'utf8'))
    } catch {
      throw new Error(`The daily queue file ${file.name} cannot be parsed.`)
    }
    const rows = parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.rows) ? parsed.rows : []
    for (const row of rows) {
      if (row === null || typeof row !== 'object') continue
      const key = `${String(row.entry)}\u0000${String(row.at)}\u0000${String(row.file)}`
      const held = merged.get(key)
      if (held === undefined) {
        merged.set(key, { ...row })
      } else if (held.seconds === null && typeof row.seconds === 'number' && Number.isFinite(row.seconds)) {
        held.seconds = row.seconds
      }
    }
    if (parsed !== null && typeof parsed === 'object' && typeof parsed.since === 'string' && (since === null || parsed.since < since)) since = parsed.since
  }
  const rows = [...merged.values()]
    .filter((row) => typeof row.at === 'string' && row.at >= from && row.at < to)
    .sort((a, b) => a.at.localeCompare(b.at) || String(a.entry).localeCompare(String(b.entry)) || a.file.localeCompare(b.file))
  return { rows, days, since }
}

/**
 * Every folder of a checkout's named test logs, in the three shapes a sandbox keeps them.
 * @param {string} sandboxes
 * @returns {string[]}
 */
function theCheckoutLogFolders(sandboxes) {
  /** @type {string[]} */
  const found = []
  if (!existsSync(sandboxes)) return found
  const foldersIn = (/** @type {string} */ at) => {
    try {
      return readdirSync(at, { withFileTypes: true }).filter((one) => one.isDirectory()).map((one) => join(at, one.name))
    } catch {
      return []
    }
  }
  for (const sandbox of foldersIn(sandboxes)) {
    for (const worktree of foldersIn(join(sandbox, 'worktrees'))) found.push(join(worktree, '.logs'))
    for (const worktree of foldersIn(join(sandbox, 'repo', '.claude', 'worktrees'))) found.push(join(worktree, '.logs'))
    found.push(join(sandbox, 'repo', '.logs'))
  }
  return [...new Set(found)]
}

/**
 * THE OLD LINE-SIDE COUNT: a test file that went red in one report and green in a later one, before line rows
 * were stored. It counts once per checkout. The cause is not known, so this is not a catch.
 *
 * It reads only `named-tests-*.json`, only in the three checkout log shapes, and it keeps nothing of a log but
 * the test file's path and a count. It never writes, moves or deletes a file.
 * @param {{sandboxes: string, before: string | null}} where
 * @returns {{total: number, files: Record<string, number>, reports: number, unreadable: number, checkouts: number, first: string | null, last: string | null}}
 */
export function theOldCount({ sandboxes, before }) {
  const files = new Map()
  let reports = 0
  let unreadable = 0
  let checkouts = 0
  let first = null
  let last = null
  for (const folder of theCheckoutLogFolders(sandboxes)) {
    let names
    try {
      names = readdirSync(folder, { withFileTypes: true })
    } catch {
      continue
    }
    const readable = []
    for (const one of names) {
      if (!one.isFile() || !/^named-tests-.+\.json$/u.test(one.name)) continue
      let parsed
      try {
        parsed = JSON.parse(readFileSync(join(folder, one.name), 'utf8'))
      } catch {
        unreadable += 1
        continue
      }
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        typeof parsed.startTime !== 'number' ||
        !Number.isFinite(parsed.startTime) ||
        !Array.isArray(parsed.testResults)
      ) {
        unreadable += 1
        continue
      }
      const stamp = localStamp(new Date(parsed.startTime))
      if (before !== null && !(stamp < before)) continue
      readable.push({ stamp, report: parsed })
    }
    if (readable.length === 0) continue
    checkouts += 1
    reports += readable.length
    readable.sort((a, b) => a.stamp.localeCompare(b.stamp))
    for (const one of readable) {
      if (first === null || one.stamp < first) first = one.stamp
      if (last === null || one.stamp > last) last = one.stamp
    }
    const wentRed = new Set()
    const counted = new Set()
    for (const { report } of readable) {
      for (const item of report.testResults) {
        if (item === null || typeof item !== 'object' || typeof item.name !== 'string') continue
        const inside = item.name.indexOf('/tests/')
        if (inside < 0) continue
        const path = `tests/${item.name.slice(inside + '/tests/'.length)}`
        if (item.status === 'failed') wentRed.add(path)
        else if (item.status === 'passed' && wentRed.has(path) && !counted.has(path)) {
          counted.add(path)
          files.set(path, (files.get(path) ?? 0) + 1)
        }
      }
    }
  }
  /** @type {Record<string, number>} */
  const kept = {}
  let total = 0
  for (const file of [...files.keys()].sort()) {
    const count = files.get(file)
    if (count > 0) {
      kept[file] = count
      total += count
    }
  }
  return { total, files: kept, reports, unreadable, checkouts, first, last }
}

/**
 * THE REPORT OF THE WEEK, and the full table the tick keeps in its work folder.
 *
 * The queue's catches and the lines' catches stand in separate columns. The medians are the middle queue second
 * of the file's own rows and the line reader's own median. The old count stands in its own block and is never
 * added to the catches.
 *
 * THE SHORT FORMS ARE WRITTEN FROM THE SAME NUMBERS AS THE BLOCKS, one part for each block, because chapter 10
 * rule 3 asks every record for a name at reading level 1 in the run that files it. They are returned beside
 * `data` and not inside it: the office refuses a short form on a record that has no revision yet, so the tick
 * files the report first and then writes these, naming the revision they were made from.
 * @param {{from: string, to: string, door: any, queue: any, old: any}} week
 * @returns {{title: string, summary: string, data: {blocks: any[], for: string, date: string}, shortForms: {label: string, parts: {id: string, heading: string, text30: string, text120: string, covers: string[]}[]}, table: any[]}}
 */
export function theWeek({ from, to, door, queue, old }) {
  /** @type {Record<string, {runs: number, secondsTotal: number, caught: number, borrowedCaught: number}>} */
  const queueTotals = totalsOf(queue.rows)
  const lineFiles = new Map((Array.isArray(door.files) ? door.files : []).map((/** @type {any} */ one) => [one.file, one]))
  const queueSeconds = new Map()
  for (const row of queue.rows) {
    if (typeof row.seconds !== 'number' || !Number.isFinite(row.seconds)) continue
    const values = queueSeconds.get(row.file) ?? []
    values.push(row.seconds)
    queueSeconds.set(row.file, values)
  }

  const files = [...new Set([...Object.keys(queueTotals), ...lineFiles.keys()])].sort()
  const rowsOf = (/** @type {string} */ file) => {
    const totals = queueTotals[file] ?? { runs: 0, secondsTotal: 0, caught: 0, borrowedCaught: 0 }
    const line = lineFiles.get(file)
    const median = medianOf(queueSeconds.get(file) ?? [])
    return {
      file,
      caughtInQueue: totals.caught,
      caughtBeforeSeal: typeof line?.catches === 'number' ? line.catches : 0,
      runsInQueue: totals.runs,
      runsInLines: typeof line?.runs === 'number' ? line.runs : 0,
      queueSeconds: totals.secondsTotal,
      medianQueueSeconds: median === null ? NOT_KNOWN : median,
      medianLineSeconds: typeof line?.medianSeconds === 'number' ? line.medianSeconds : NOT_KNOWN,
      borrowedCaught: totals.borrowedCaught,
    }
  }
  const held = files.map(rowsOf)
  const cellsOf = (/** @type {ReturnType<typeof rowsOf>} */ one) => [
    one.file,
    NOT_CLASSIFIED,
    one.caughtInQueue,
    one.caughtBeforeSeal,
    one.runsInQueue,
    one.runsInLines,
    one.queueSeconds,
    one.medianQueueSeconds,
    one.medianLineSeconds,
  ]

  const queueFiles = Object.keys(queueTotals).length
  const lineFileCount = lineFiles.size
  /** @type {<T>(list: T[], pick: (one: T) => number) => number} */
  const sumOf = (list, pick) => list.reduce((total, one) => total + pick(one), 0)
  const queueCatches = sumOf(held, (one) => one.caughtInQueue)
  const lineCatches = sumOf(held, (one) => one.caughtBeforeSeal)
  const borrowedCatches = sumOf(held, (one) => one.borrowedCaught)
  const linePairs = (/** @type {string} */ pick) => sumOf([...lineFiles.values()], (one) => (typeof one[pick] === 'number' ? one[pick] : 0))

  const totals = [
    `The queue ran ${counted(queueFiles, 'test file', 'test files')}, and the lines ran ${String(lineFileCount)}.`,
    `The queue caught ${String(queueCatches)}, and the lines caught ${String(lineCatches)} before the seal.`,
    `Of the line pairs that were not catches, ${String(linePairs('flaky'))} were flaky, ${String(linePairs('testChanged'))} had a changed test, ${String(linePairs('mutationProofs'))} were mutation proofs and ${String(linePairs('notComparable'))} could not be compared.`,
    `${counted(borrowedCatches, 'queue catch', 'queue catches')} came from a result borrowed from another entry, so ${borrowedCatches === 1 ? 'it is' : 'they are'} kept apart and not counted above.`,
    'The candidates are a list to read, and nothing was moved.',
  ].join(' ')

  const caught = held
    .filter((one) => one.caughtInQueue > 0 || one.caughtBeforeSeal > 0)
    .sort((a, b) => b.caughtInQueue + b.caughtBeforeSeal - (a.caughtInQueue + a.caughtBeforeSeal) || a.file.localeCompare(b.file))
  const everyCandidate = held
    .filter((one) => one.runsInQueue > 0 && one.queueSeconds > 0 && one.caughtInQueue === 0 && one.borrowedCaught === 0 && one.caughtBeforeSeal === 0)
    .sort((a, b) => b.queueSeconds - a.queueSeconds || a.file.localeCompare(b.file))
  const candidates = everyCandidate.slice(0, CANDIDATES_SHOWN)

  const blocks = [
    { id: 'totals', type: 'text', heading: 'The week in numbers', text: totals },
    caught.length === 0
      ? { id: 'caught', type: 'text', heading: 'Caught', text: 'No file caught anything in the queue or before the seal this week.' }
      : { id: 'caught', type: 'table', columns: THE_COLUMNS.map((label) => ({ label })), rows: caught.map((one) => ({ cells: cellsOf(one) })) },
    candidates.length === 0
      ? { id: 'candidates', type: 'text', heading: 'Candidates', text: 'No file ran in the queue, took queue seconds and caught nothing, so there is nothing to read and nothing was moved.' }
      : { id: 'candidates', type: 'table', columns: THE_COLUMNS.map((label) => ({ label })), rows: candidates.map((one) => ({ cells: cellsOf(one) })) },
    {
      id: 'old-count',
      type: 'text',
      heading: 'Red then green, cause not known',
      text:
        old.reports === 0
          ? `No named test report from before line rows were stored could be read. ${counted(old.unreadable, 'report', 'reports')} could not be read.`
          : `Before line rows were stored, a test file went red in one report and green in a later report of the same checkout ${counted(old.total, 'time', 'times')}. A file counts once in each checkout. This was read from ${counted(old.reports, 'report', 'reports')} in ${counted(old.checkouts, 'checkout', 'checkouts')}, started from ${old.first ?? 'not known'} to ${old.last ?? 'not known'}. ${counted(old.unreadable, 'report', 'reports')} could not be read. The cause is not known, so these are not catches and are not added to them.`,
    },
    {
      id: 'limits',
      type: 'text',
      heading: 'What this reading could not see',
      text: [
        queue.days.length === 0 ? 'No daily queue file was read.' : `The daily queue files read were those of ${queue.days.join(', ')}.`,
        queue.since === null ? 'No queue read says from which day it read.' : `The queue was read from ${queue.since}.`,
        door.linesStoredSince === null || door.linesStoredSince === undefined
          ? 'No line rows were stored, so no day is known for them.'
          : `Line rows were first stored on ${String(door.linesStoredSince)}.`,
        ...(everyCandidate.length > CANDIDATES_SHOWN ? [`Only the ${String(CANDIDATES_SHOWN)} slowest of ${String(everyCandidate.length)} candidates are listed.`] : []),
        "A file's queue seconds leave out its load time.",
        'The class column waits for a list of classes.',
      ].join(' '),
    },
  ]

  const top = caught[0]
  const slowest = candidates[0]
  const linesStored = door.linesStoredSince === null || door.linesStoredSince === undefined ? null : String(door.linesStoredSince)
  const parts = [
    {
      id: 'p-totals',
      heading: `Queue caught ${String(queueCatches)}, lines caught ${String(lineCatches)} before the seal`,
      text30: `${counted(queueCatches, 'catch', 'catches')} in the merge queue and ${counted(lineCatches, 'catch', 'catches')} on the lines before the seal, kept as two numbers. ${counted(borrowedCatches, 'borrowed queue catch is', 'borrowed queue catches are')} left out.`,
      text120: `Over ${counted(queueFiles, 'file', 'files')} in the merge queue and ${String(lineFileCount)} on the lines, the queue caught ${String(queueCatches)} and the lines caught ${String(lineCatches)} before the seal, counted apart. On the lines, the red then green pairs that were not catches were ${String(linePairs('flaky'))} flaky, ${String(linePairs('testChanged'))} with a changed test, ${counted(linePairs('mutationProofs'), 'mutation proof', 'mutation proofs')} and ${String(linePairs('notComparable'))} that could not be compared. ${counted(borrowedCatches, 'queue catch', 'queue catches')} came from another entry's result and ${borrowedCatches === 1 ? 'is' : 'are'} not counted. Nothing was moved.`,
      covers: ['totals'],
    },
    top === undefined
      ? {
          id: 'p-caught',
          heading: 'No file caught anything this week',
          text30: 'Neither the merge queue nor the lines caught a failure in any test file this week.',
          text120: 'No test file caught a failure in the merge queue, and none caught one on the lines before the seal. So no table of catches is shown this week.',
          covers: ['caught'],
        }
      : {
          id: 'p-caught',
          heading: `${counted(caught.length, 'file', 'files')} caught something this week`,
          text30: `The table lists ${counted(caught.length, 'file', 'files')}, most catches first. ${top.file} caught the most: ${String(top.caughtInQueue)} in the queue and ${String(top.caughtBeforeSeal)} before the seal.`,
          text120: `${counted(caught.length, 'test file', 'test files')} caught at least one failure, in the merge queue or on the lines before the seal. The one with the most catches was ${top.file}: ${String(top.caughtInQueue)} in the queue and ${String(top.caughtBeforeSeal)} before the seal. Each row gives the runs, the queue seconds and both medians. The class column is not filled in yet.`,
          covers: ['caught'],
        },
    slowest === undefined
      ? {
          id: 'p-candidates',
          heading: 'No slow file to read about',
          text30: 'No file took queue seconds while catching nothing on either side, so no file is listed and nothing was moved.',
          text120: 'No test file took queue seconds this week while catching nothing in the merge queue and nothing on the lines before the seal. So there is no candidate to read about running later, and nothing was moved.',
          covers: ['candidates'],
        }
      : {
          id: 'p-candidates',
          heading: `${counted(everyCandidate.length, 'slow file', 'slow files')} caught nothing this week`,
          text30: `${counted(everyCandidate.length, 'file', 'files')} took queue seconds and caught nothing on either side. They are listed to read, slowest first, and nothing was moved.`,
          text120: `${counted(everyCandidate.length, 'test file', 'test files')} cost queue seconds this week and caught nothing in the merge queue or on the lines before the seal. The slowest was ${slowest.file}, with ${String(slowest.queueSeconds)} queue seconds over ${counted(slowest.runsInQueue, 'run', 'runs')}. ${everyCandidate.length > CANDIDATES_SHOWN ? `The table lists the ${String(CANDIDATES_SHOWN)} slowest.` : 'The table lists all of them.'} They are candidates to read about running later, not instructions, and nothing was moved.`,
          covers: ['candidates'],
        },
    old.reports === 0
      ? {
          id: 'p-old-count',
          heading: 'No older named test report was read',
          text30: `There is no older count, because no named test report from before line rows were stored was read. ${counted(old.unreadable, 'report was', 'reports were')} unreadable.`,
          text120: `No named test report from before line rows were stored was read, so this report has no older count. ${counted(old.unreadable, 'report was', 'reports were')} unreadable. An older count, when there is one, is never added to the catches.`,
          covers: ['old-count'],
        }
      : {
          id: 'p-old-count',
          heading: `${String(old.total)} older red then green results, cause not known`,
          text30: `A file went red then green ${counted(old.total, 'time', 'times')} in older reports, at most once per checkout. The cause is not known, so none is a catch.`,
          text120: `${counted(old.total, 'time', 'times')}, a file went red in one older report and green in a later one of the same checkout. The count comes from ${counted(old.reports, 'named test report', 'named test reports')} in ${counted(old.checkouts, 'checkout', 'checkouts')}, started from ${old.first ?? 'not known'} to ${old.last ?? 'not known'}, all before line rows were stored. A file counts at most once in each checkout, and ${counted(old.unreadable, 'report was', 'reports were')} unreadable. Those reports name no run, commit or tree, so the cause is not known. The count stays in its own block and is never added to either side's catches.`,
          covers: ['old-count'],
        },
    {
      id: 'p-limits',
      heading: "Limits of this week's reading",
      text30: `${queue.days.length === 0 ? 'No daily queue file was read' : `The queue side was read from ${counted(queue.days.length, 'daily file', 'daily files')}, ${queue.days[0]} to ${queue.days.at(-1)}`}. ${linesStored === null ? 'No line rows are stored yet' : `Line rows are stored from ${linesStored}`}. Queue seconds leave out load time.`,
      text120: `${queue.days.length === 0 ? 'No daily queue file was read for the queue side' : `${counted(queue.days.length, 'daily queue file was', 'daily queue files were')} read for the queue side, dated ${queue.days[0]} to ${queue.days.at(-1)}${queue.since === null ? '' : `, each reading the queue from ${String(queue.since)}`}`}. ${linesStored === null ? 'No line rows are stored yet, so the line side is empty' : `Line rows are stored from ${linesStored}, so the days before that have no line side`}. ${everyCandidate.length > CANDIDATES_SHOWN ? `Only the ${String(CANDIDATES_SHOWN)} slowest of ${String(everyCandidate.length)} candidates are in the table. ` : ''}A file's queue seconds leave out the time it took to load. The class column waits for a list of classes, so every row says not classified yet.`,
      covers: ['limits'],
    },
  ]

  return {
    title: `Test catches in the week starting Monday ${from}`,
    summary: [
      `In the week from ${from} to ${to}, the merge queue caught ${String(queueCatches)} and the lines caught ${String(lineCatches)} before the seal.`,
      `${counted(candidates.length, 'slow file that caught nothing is', 'slow files that caught nothing are')} listed as ${candidates.length === 1 ? 'a candidate' : 'candidates'} to move down.`,
      'Nothing was moved.',
      'An older red-then-green count, cause not known, is shown on its own.',
    ].join(' '),
    data: { blocks, for: FOR_WHOM, date: from },
    shortForms: { label: `Test catches, week of ${from}`, parts },
    table: held.map((one) => ({ file: one.file, cells: cellsOf(one) })),
  }
}
