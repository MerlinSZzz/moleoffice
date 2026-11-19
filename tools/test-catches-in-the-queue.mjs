#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EACH TEST FILE RAN, HOW LONG IT TOOK AND WHAT IT CAUGHT, from the merge queue's own records.
 *
 *     node tools/test-catches-in-the-queue.mjs --queue <folder> [--since YYYY-MM-DD] [--out <file>]
 *
 * The queue folder holds one folder per merge entry, and each entry folder holds steps.jsonl: one line per
 * step the merge tool reported. This tool reads only the tested steps and the main-moved-while-testing
 * steps beside them, and it writes nothing into the queue. It imports nothing from tools/merge-tool/:
 * importing that folder's arguments.mjs reads the command line and exits.
 *
 * ONE ROW PER TEST FILE PER TESTED STEP, and a total per file. A row says where the file ran, how long its
 * own vitest report item took, whether it was red in that run, what happened when it was run again alone,
 * whether it was red on main, how its red was cleared, whether it was caught and whether it was flaky.
 *
 * A REPORT IS READ ONLY WHEN IT STILL BELONGS TO THE STEP. The next test of an entry writes the same fixed
 * report name over the last one, so a report is read only when its own startTime is no earlier than the
 * step before it and before this step's second-wide stamp. Otherwise the step is counted under
 * "report written over" and its red rows carry no seconds.
 *
 * TWO THINGS THE RECORDS DO NOT HOLD, SAID HERE RATHER THAN GUESSED: vitest's startTime and endTime leave
 * out the time to load a test file, so a file's seconds are its run and not its load; and a related test
 * that was red first and green alone is not in the step's detail, so this tool cannot see it.
 *
 * Every decision is taken from the step's detail. The tool never reads a step's facts and never parses the
 * words of its "says" sentence.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseStoredStamp } from '../src/shared/time.ts'

/** The first day to read, as the secretary set it (their yes in message Vue3ni42wa94, 21 October 2026). */
const SINCE_AT_FIRST = '2026-10-18'

/** A test file path as vitest's own include writes it. */
const A_TEST_FILE = /^tests\/.+\.test\.ts$/u

/** Every reason a step or a report item can be counted as skipped, in the order the counts are printed. */
const SKIP_REASONS = [
  'before since',
  'borrowed',
  'documentation',
  'plugin',
  'fix round',
  'build red',
  'older shape',
  'report written over',
  'carried count mismatch',
  'a command, not a file',
  'a red the detail does not explain',
  'a file outside the tree',
  'no steps file',
  'unreadable line',
  'unreadable time',
]

/**
 * The reasons above that count something read rather than a step skipped: a borrowed step gives rows, and the others
 * count a report, an item or a red inside a step that was read. The summary line keeps them out of "skipped".
 */
const COUNTED_IN_WHAT_WAS_READ = new Set([
  'borrowed',
  'report written over',
  'carried count mismatch',
  'a command, not a file',
  'a red the detail does not explain',
  'a file outside the tree',
])

const USAGE = `Usage: node tools/test-catches-in-the-queue.mjs --queue <folder> [--since YYYY-MM-DD] [--out <file>]

Reads one merge queue's recorded steps and writes one row per test file per tested step, with totals per file.
The queue's usual place is ~/.cache/mole-office/merge-queue. --queue has no default, because that default
lives in the merge tool's arguments.mjs, which this tool does not import.

  --queue <folder>    the folder that holds one folder per merge entry (required)
  --since YYYY-MM-DD  the first local day to read (default ${SINCE_AT_FIRST})
  --out <file>        write the JSON here instead of stdout
  --help              print this and write nothing
`

function usageError(sentence) {
  process.stderr.write(`${sentence}\n`)
  process.exit(2)
}

/** The local midnight at the start of a written date, or null when the date is not a real one. */
function localMidnight(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const at = new Date(year, month - 1, day)
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) return null
  return at.getTime()
}

function readArguments(argv) {
  let queue = null
  let since = SINCE_AT_FIRST
  let out = null
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--help' || word === '-h') {
      process.stdout.write(USAGE)
      process.exit(0)
    }
    if (word === '--queue' || word === '--since' || word === '--out') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('-')) usageError(`${word} needs a value.`)
      if (word === '--queue') queue = value
      else if (word === '--since') since = value
      else out = value
      i += 1
      continue
    }
    usageError(`Unknown argument ${word}.`)
  }
  if (queue === null) usageError('No --queue was given: name the folder that holds the merge entries.')
  const sinceMs = localMidnight(since)
  if (sinceMs === null) usageError(`--since ${since} is not a real date; write it as YYYY-MM-DD.`)
  return { queue, since, sinceMs, out }
}

/** The lines of a steps file, with the empty line a trailing newline leaves out. */
function linesOf(file) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/u)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function anObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isAnOlderShape(detail) {
  return !(
    typeof detail.commit === 'string' &&
    /^[0-9a-fA-F]{40}$/u.test(detail.commit) &&
    typeof detail.tree === 'string' &&
    isAbsolute(detail.tree) &&
    anObject(detail.ran) &&
    Array.isArray(detail.red) &&
    Array.isArray(detail.stillRed) &&
    Array.isArray(detail.redOnMainToo) &&
    Array.isArray(detail.clearedByThePair) &&
    typeof detail.green === 'boolean'
  )
}

/** A file's path from the tree, with forward slashes, or null when the report item is not inside the tree. */
function aFileIn(tree, name) {
  if (typeof name !== 'string' || !isAbsolute(name)) return null
  const rel = relative(tree, name)
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null
  return rel.split(sep).join('/')
}

/** The report a step names, or null when its file is gone, unreadable, or was written over since this step. */
function theReportOf(entryFolder, named, previousAt, stepAt) {
  if (typeof named !== 'string') return null
  const file = join(entryFolder, basename(named))
  if (!existsSync(file)) return null
  let report
  try {
    if (!statSync(file).isFile()) return null
    report = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  if (!anObject(report)) return null
  const startTime = report.startTime
  if (typeof startTime !== 'number' || !Number.isFinite(startTime)) return null
  if (previousAt !== null && startTime < previousAt) return null
  if (!(startTime < stepAt + 1000)) return null
  return report
}

function secondsOf(item) {
  const start = item.startTime
  const end = item.endTime
  if (typeof start !== 'number' || !Number.isFinite(start)) return null
  if (typeof end !== 'number' || !Number.isFinite(end)) return null
  if (end < start) return null
  return Math.round(((end - start) / 1000) * 1000) / 1000
}

function namesIn(list) {
  return new Set(list.map((one) => (typeof one === 'string' ? one : anObject(one) ? one.file : null)).filter((one) => typeof one === 'string'))
}

/** One row per file of a read step, in file order. */
function rowsOfAReadStep(entry, at, detail, entryFolder, previousAt, stepAt, skipped) {
  const ran = anObject(detail.ran) ? detail.ran : {}
  const suite = anObject(ran.test) ? ran.test : null
  const related = anObject(ran.related) ? ran.related : null
  const suiteRan = suite !== null

  const suiteReport = suite === null ? null : theReportOf(entryFolder, suite.report, previousAt, stepAt)
  const relatedReport = related === null ? null : theReportOf(entryFolder, related.report, previousAt, stepAt)
  if (suite !== null && typeof suite.report === 'string' && suiteReport === null) skipped['report written over'] += 1
  if (related !== null && typeof related.report === 'string' && relatedReport === null) skipped['report written over'] += 1

  const rows = new Map()
  const seenInReports = new Set()
  const suiteNames = new Set()
  if (suiteReport !== null) {
    for (const item of Array.isArray(suiteReport.testResults) ? suiteReport.testResults : []) {
      const file = aFileIn(detail.tree, anObject(item) ? item.name : null)
      if (file === null) {
        skipped['a file outside the tree'] += 1
        continue
      }
      seenInReports.add(file)
      suiteNames.add(file)
      if (!rows.has(file)) rows.set(file, { ranIn: 'suite', seconds: secondsOf(item) })
    }
  }

  const relatedFiles = []
  if (relatedReport !== null) {
    for (const item of Array.isArray(relatedReport.testResults) ? relatedReport.testResults : []) {
      const file = aFileIn(detail.tree, anObject(item) ? item.name : null)
      if (file === null) {
        skipped['a file outside the tree'] += 1
        continue
      }
      seenInReports.add(file)
      relatedFiles.push({ file, seconds: secondsOf(item) })
    }
  }

  const carried = suiteRan ? relatedFiles.filter((one) => !suiteNames.has(one.file)) : relatedFiles
  let keepTheRelated = true
  if (suiteRan && anObject(suite.carried) && typeof suite.carried.files === 'number' && carried.length !== suite.carried.files) {
    skipped['carried count mismatch'] += 1
    keepTheRelated = false
  }
  if (keepTheRelated) {
    for (const one of carried) if (!rows.has(one.file)) rows.set(one.file, { ranIn: 'related', seconds: one.seconds })
  }

  const redItems = Array.isArray(detail.red) ? detail.red : []
  const stillRed = Array.isArray(detail.stillRed) ? detail.stillRed : []
  const stillRedFiles = namesIn(stillRed)
  const redOnMainFiles = namesIn(Array.isArray(detail.redOnMainToo) ? detail.redOnMainToo : [])
  const pairClearedFiles = namesIn(Array.isArray(detail.clearedByThePair) ? detail.clearedByThePair : [])
  const modalClearedFiles = namesIn(Array.isArray(detail.loadTimeouts) ? detail.loadTimeouts : [])
  const redByFile = new Map()
  for (const one of redItems) if (anObject(one) && typeof one.file === 'string') redByFile.set(one.file, one)

  // A RED FILE THE READ REPORTS DO NOT NAME still gets its row, with the place its reds came from and no seconds.
  const fallbackRanIn = suiteRan ? 'suite' : 'related'
  for (const file of [...redByFile.keys(), ...stillRedFiles]) {
    if (seenInReports.has(file) || rows.has(file)) continue
    rows.set(file, { ranIn: fallbackRanIn, seconds: null })
  }

  const out = []
  for (const file of [...rows.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const where = rows.get(file)
    const red = redByFile.get(file)
    const redInRun = red !== undefined
    const alone = red === undefined ? null : typeof red.alone === 'string' ? red.alone : null
    const redOnMain = redOnMainFiles.has(file)
    const isStillRed = stillRedFiles.has(file)
    let cleared = null
    if (pairClearedFiles.has(file)) cleared = 'pair'
    else if (modalClearedFiles.has(file)) cleared = 'modal'
    else if (redInRun && alone === 'red' && !redOnMain && !isStillRed) {
      if (detail.pair !== undefined) cleared = 'bus'
      else {
        cleared = 'not known'
        skipped['a red the detail does not explain'] += 1
      }
    }
    out.push({
      entry,
      at,
      commit: detail.commit,
      file,
      ranIn: where.ranIn,
      seconds: where.seconds,
      redInRun,
      alone,
      redOnMain,
      cleared,
      caught: isStillRed && detail.green === false,
      flaky: redInRun && alone === 'green',
    })
  }
  return out
}

/** The red rows a borrowed result gives: no seconds and no run of its own. */
function rowsOfABorrowedStep(entry, at, detail, skipped) {
  const decided = anObject(detail.decided) ? detail.decided : {}
  const redTests = Array.isArray(decided.redTests) ? decided.redTests : []
  const rows = []
  for (const one of redTests) {
    if (typeof one !== 'string' || !A_TEST_FILE.test(one)) {
      skipped['a command, not a file'] += 1
      continue
    }
    rows.push({
      entry,
      at,
      commit: null,
      file: one,
      ranIn: 'borrowed',
      seconds: null,
      redInRun: null,
      alone: null,
      redOnMain: null,
      cleared: null,
      caught: decided.green === false,
      flaky: null,
    })
  }
  return rows.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

/** Each file's runs, seconds and catches over the rows given. tools/test-catches-of-the-week.mjs reads it too. */
export function totalsOf(rows) {
  const files = new Map()
  for (const row of rows) {
    let one = files.get(row.file)
    if (one === undefined) {
      one = {
        runs: 0,
        secondsTotal: 0,
        secondsKnown: 0,
        redInRun: 0,
        flaky: 0,
        redOnMain: 0,
        cleared: { pair: 0, modal: 0, bus: 0, notKnown: 0 },
        caught: 0,
        borrowedCaught: 0,
      }
      files.set(row.file, one)
    }
    if (row.ranIn !== 'borrowed') one.runs += 1
    if (typeof row.seconds === 'number' && Number.isFinite(row.seconds)) {
      one.secondsTotal += row.seconds
      one.secondsKnown += 1
    }
    if (row.redInRun === true) one.redInRun += 1
    if (row.flaky === true) one.flaky += 1
    if (row.redOnMain === true) one.redOnMain += 1
    if (row.cleared === 'pair') one.cleared.pair += 1
    else if (row.cleared === 'modal') one.cleared.modal += 1
    else if (row.cleared === 'bus') one.cleared.bus += 1
    else if (row.cleared === 'not known') one.cleared.notKnown += 1
    if (row.caught === true) {
      if (row.ranIn === 'borrowed') one.borrowedCaught += 1
      else one.caught += 1
    }
  }
  const out = {}
  for (const file of [...files.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const one = files.get(file)
    out[file] = { ...one, secondsTotal: Math.round(one.secondsTotal * 1000) / 1000 }
  }
  return out
}

function theQueue(argv) {
  const chosen = readArguments(argv)
  if (!existsSync(chosen.queue)) {
    process.stderr.write(`${chosen.queue} is not there, so there is no merge queue to read.\n`)
    process.exit(1)
  }
  if (!statSync(chosen.queue).isDirectory()) {
    process.stderr.write(`${chosen.queue} is not a folder, so there is no merge queue to read.\n`)
    process.exit(1)
  }

  const skipped = Object.fromEntries(SKIP_REASONS.map((reason) => [reason, 0]))
  const read = { entries: 0, lines: 0, testedSteps: 0, rowsFromSteps: 0 }
  const rows = []
  const entries = readdirSync(chosen.queue, { withFileTypes: true })
    .filter((one) => one.isDirectory())
    .map((one) => one.name)
    .sort()

  for (const entry of entries) {
    read.entries += 1
    const entryFolder = join(chosen.queue, entry)
    const stepsFile = join(entryFolder, 'steps.jsonl')
    if (!existsSync(stepsFile) || !statSync(stepsFile).isFile()) {
      skipped['no steps file'] += 1
      continue
    }
    const lines = linesOf(stepsFile)
    read.lines += lines.length
    let previousAt = null
    for (const line of lines) {
      let step
      try {
        step = JSON.parse(line)
      } catch {
        skipped['unreadable line'] += 1
        continue
      }
      if (!anObject(step) || typeof step.step !== 'string') {
        skipped['unreadable line'] += 1
        continue
      }
      const atMs = typeof step.at === 'string' ? parseStoredStamp(step.at) : null
      if (atMs === null) {
        skipped['unreadable time'] += 1
        continue
      }
      if (step.step === 'main-moved-while-testing') {
        previousAt = atMs
        continue
      }
      if (step.step !== 'tested') continue

      const detail = anObject(step.detail) ? step.detail : null
      let rowsHere = null
      if (atMs < chosen.sinceMs) {
        skipped['before since'] += 1
      } else if (detail !== null && typeof detail.borrowedFrom === 'string') {
        skipped.borrowed += 1
        rowsHere = rowsOfABorrowedStep(entry, step.at, detail, skipped)
      } else if (detail !== null && detail.documents !== undefined) {
        skipped.documentation += 1
      } else if (detail !== null && detail.plugin !== undefined) {
        skipped.plugin += 1
      } else if (detail !== null && ((anObject(detail.ran) && detail.ran.affected !== undefined) || detail.wholeSuiteRed !== undefined)) {
        skipped['fix round'] += 1
      } else if (detail !== null && anObject(detail.ran) && anObject(detail.ran.build) && typeof detail.ran.build.exit === 'number' && detail.ran.build.exit !== 0) {
        skipped['build red'] += 1
      } else if (detail === null || isAnOlderShape(detail)) {
        skipped['older shape'] += 1
      } else {
        rowsHere = rowsOfAReadStep(entry, step.at, detail, entryFolder, previousAt, atMs, skipped)
        read.testedSteps += 1
      }
      previousAt = atMs
      if (rowsHere !== null) {
        rows.push(...rowsHere)
        read.rowsFromSteps += rowsHere.length
      }
    }
  }

  return {
    chosen,
    output: {
      queue: chosen.queue,
      since: chosen.since,
      read,
      skipped,
      rows,
      files: totalsOf(rows),
    },
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { chosen, output } = theQueue(process.argv.slice(2))
  const json = `${JSON.stringify(output, null, 2)}\n`
  if (chosen.out === null) process.stdout.write(json)
  else writeFileSync(chosen.out, json)

  const countOf = (keep) => Object.entries(output.skipped).reduce((sum, [reason, one]) => (keep(reason) ? sum + one : sum), 0)
  const stepsSkipped = countOf((reason) => !COUNTED_IN_WHAT_WAS_READ.has(reason))
  const itemsCounted = countOf((reason) => COUNTED_IN_WHAT_WAS_READ.has(reason) && reason !== 'borrowed')
  const catches = output.rows.filter((row) => row.caught === true && row.ranIn !== 'borrowed').length
  const borrowedCatches = output.rows.filter((row) => row.caught === true && row.ranIn === 'borrowed').length
  const counted = itemsCounted === 0 ? 'No item read was counted apart.' : `${String(itemsCounted)} item${itemsCounted === 1 ? ' read was' : 's read were'} counted apart; the reasons are under "skipped" in the JSON.`
  const wrote = chosen.out === null ? 'The JSON is on stdout.' : `It wrote ${chosen.out}.`
  process.stderr.write(
    `Read ${String(output.read.entries)} entries: ${String(output.read.testedSteps)} tested steps read, ${String(output.skipped.borrowed)} borrowed results read, ` +
      `${String(stepsSkipped)} skipped, ${String(catches)} catches and ${String(borrowedCatches)} borrowed catches. ${counted} ${wrote}\n`,
  )
}
