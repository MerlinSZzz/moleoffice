// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RED FILES: which files a vitest JSON report says were red, one test file run alone, and whether a run in the sandbox
 * gave a result at all, with what it said. The testing and the pairs modules both use them. Part of the merge tool,
 * tools/the-merger.mjs.
 */

import './a-library-is-not-a-program.mjs'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'

import { aPassedFile, anUnhandledWorkerExitIn } from '../a-passed-test-file.mjs'
import { RERUN_LIMITS } from './arguments.mjs'
import { theInstalledLock } from './installed-lock.mjs'
import { fail } from './log-and-state.mjs'

/** The end of every sentence with which this tool stops on a run that gave no result. */
export const NOT_RED = 'A run with no result is not counted as red, so nothing was reported as tested.'

/** What runAlone says when its caller gives it no runInSandbox or keepTheReport. */
export const RUN_ALONE_NEEDS_RUN_IN_SANDBOX_AND_KEEP_THE_REPORT = "runAlone needs runInSandbox and keepTheReport from its caller, as testing.mjs, pairs.mjs and the-merger.mjs pass office-keeper.mjs's, so that red-files.mjs reaches no office module itself."

/**
 * THE FILES A VITEST JSON REPORT SAYS WERE RED, as paths relative to the tree. A file passed only when `aPassedFile`
 * says so: its own status is `passed` and every test in it ended `passed`, `skipped` or `todo`. So a file vitest calls
 * passed, but one of whose tests never ran, is not passed. `passed` counts the files that passed, and `failed` names
 * every other file. `unfinished` names each file vitest calls passed that has no failed test and some tests `pending`,
 * with how many, for theFilesAWorkerExitLeftUnfinished.
 */
export function redFilesIn(reportFile, tree) {
  if (!existsSync(reportFile)) return null
  let report
  try {
    report = JSON.parse(readFileSync(reportFile, 'utf8'))
  } catch {
    return null
  }
  const results = Array.isArray(report.testResults) ? report.testResults : []
  const files = results.map((one) => ({ file: relative(tree, one.name), passed: aPassedFile(one), unfinished: theUnfinishedTestsOf(one) }))
  const count = (value) => (Number.isInteger(value) && value >= 0 ? value : null)
  return {
    passed: files.filter((one) => one.passed).length,
    failed: files.filter((one) => !one.passed).map((one) => one.file).sort(),
    names: files.map((one) => one.file).sort(),
    unfinished: files.filter((one) => one.unfinished > 0).map(({ file, unfinished }) => ({ file, tests: unfinished })).sort((a, b) => (a.file < b.file ? -1 : 1)),
    tests: { total: count(report.numTotalTests), failed: count(report.numFailedTests), passed: count(report.numPassedTests) },
  }
}

/** How many tests of one file vitest left `pending`, when it calls the file passed and no test in it failed; else 0. */
function theUnfinishedTestsOf(one) {
  if (one.status !== 'passed' || !Array.isArray(one.assertionResults) || one.assertionResults.some((test) => test.status === 'failed')) return 0
  return one.assertionResults.filter((test) => test.status === 'pending').length
}

/**
 * THE FILES A VITEST WORKER EXIT LEFT UNFINISHED IN ONE RUN, each with how many of its tests
 * never finished, or none. When a worker dies, vitest 4.1.10 prints its unhandled "Worker exited unexpectedly" error,
 * exits 1, and calls the file that worker held passed, with every test it had not reported `pending` (measured 7
 * November 2026). Such a file gave the run no answer: it neither failed nor passed. So a file counts only when `read`
 * names it in `unfinished`, the run exited non-zero, and the run's log holds that error as vitest prints it. A file
 * with a failed test answered red, whatever else happened. A run with no readable report or no log names none.
 */
export function theFilesAWorkerExitLeftUnfinished(read, run) {
  if (read === null || read.unfinished.length === 0 || run.code === 0) return []
  if (typeof run.outFile !== 'string' || !existsSync(run.outFile) || !anUnhandledWorkerExitIn(run.outFile)) return []
  return read.unfinished
}

/**
 * THE FILES A VITEST JSON REPORT SAYS PASSED, with the tests in them, or null when there is no readable report. A file
 * passed only when `aPassedFile` says so: its own status is `passed` and every test in it ended `passed`, `skipped` or
 * `todo`. `files` names only the files that passed, and `tests` counts the tests in those files: `total` every test in
 * them, and `passed` those that passed.
 */
export function passedFilesIn(reportFile, tree) {
  if (!existsSync(reportFile)) return null
  let report
  try {
    report = JSON.parse(readFileSync(reportFile, 'utf8'))
  } catch {
    return null
  }
  const passed = (Array.isArray(report.testResults) ? report.testResults : []).filter((one) => aPassedFile(one))
  const tests = passed.flatMap((one) => one.assertionResults)
  return {
    files: passed.map((one) => relative(tree, one.name)).sort(),
    tests: { total: tests.length, passed: tests.filter((one) => one.status === 'passed').length },
  }
}

/**
 * WHY A RUN OF ONE TEST FILE GAVE NO RESULT, or null when it gave one: a result is a readable report that names the
 * file after a command ran to its own end. A stopped command gives no result, including when it
 * left a partial report. A file that did not load, or whose hook threw, is named in a readable report as failed, so that is a result,
 * and it is red.
 */
export function noResultIn(reportFile, tree, file, run = null) {
  const read = redFilesIn(reportFile, tree)
  if (read === null) return 'it left no readable report'
  if (!read.names.includes(file)) return 'its report does not name the file'
  if (run?.error !== undefined) return 'the launcher could not be started'
  if (run !== null && (run.timedOut || run.code === null || CUT_OFF_EXITS.includes(run.code))) return `the command was stopped before its end (${run.stoppedReason ?? whatTheRunSaid(run)})`
  return null
}

/**
 * WHETHER A RUN OF ONE TEST FILE WAS GREEN: the command exited 0, and its report, as `redFilesIn` reads it, names no
 * red file and at least one that passed. runAlone and the merge tool's runs alone on main judge a run by this one rule.
 */
export function aGreenRun(run, read) {
  return run.code === 0 && read.failed.length === 0 && read.passed >= 1
}

/**
 * THE EXITS OF A COMMAND CUT OFF BEFORE ITS OWN END, as tools/sandbox-start.mjs and docker give them: the launcher's
 * time limit (124), SIGKILL or a container stopped under the command (137), and SIGTERM (143).
 */
const CUT_OFF_EXITS = [124, 137, 143]

/**
 * WHY A COMMAND RUN IN THE SANDBOX GAVE NO RESULT, or null when it ran to its own end. The helper inside the container
 * prints "sandbox-start: started {...}" as it lets the command go, and the launcher on the host reads that same line
 * to find the command's process group. Every refusal before it — the sandbox not running, the ledger not answering,
 * the helper giving up — ends without that line. A command that started and was then cut off ends with one of
 * CUT_OFF_EXITS, a signal, or this tool's own time limit. A build is read by this one function, in testGit and in
 * whatThePairDecides, so the two cannot disagree; a test run is read by its report instead (runAlone).
 */
export function whyARunGaveNoResult(run) {
  if (run.error !== undefined) return 'the launcher could not be started'
  const output = existsSync(run.outFile) ? readFileSync(run.outFile, 'utf8') : ''
  if (!/^sandbox-start: started \{/mu.test(output)) return 'the launcher never started the command'
  if (run.timedOut || run.code === null || CUT_OFF_EXITS.includes(run.code)) return 'the command was cut off before its end'
  return null
}

/**
 * WHAT A RUN IN THE SANDBOX ENDED WITH, in words: how it ended, and the last line the launcher or its helper printed,
 * when either printed one. A run whose sandbox was not running ends with the launcher's own sentence, such as
 * "sandbox: The sandbox <name> is not running (...). Start it with node tools/sandbox.mjs up."; a run stopped at the
 * launcher's time limit ends with the helper's "sandbox-start: the command ended: it was stopped at its limit of <s> s.
 * This helper exits 124."; a run whose container was stopped under it ends with docker's exit, 137, and no line; a run
 * the helper gave up on, because the ledger did not answer, ends with its "sandbox-start: ... The command never ran."
 */
export function whatTheRunSaid(run) {
  const how = run.error !== undefined ? `it could not be started (${run.error})` : run.timedOut ? `the merge tool stopped it at its own time limit (${run.signal === null ? `exit ${String(run.code)}` : String(run.signal)})` : run.code === null ? `it was ended by ${String(run.signal)}` : `the launcher exited ${String(run.code)}`
  const launcher = String(run.tail ?? '')
    .split('\n')
    .filter((line) => /^sandbox(-start)?: /u.test(line) && !line.startsWith('sandbox-start: started {'))
    .at(-1)
  return launcher === undefined ? how : `${how} and said "${launcher}"`
}

/**
 * ONE TEST FILE RUN ALONE ON A TREE: red or green, or absent from that tree, which is not red there. The rerun of
 * ACCEPTANCE item 23, and the runs a file still red in a pair's suite gets on each side (the secretary's item 4).
 *
 * A RUN THAT GAVE NO RESULT IS NOT RED (finding 80). A run gives a result only when it leaves a
 * readable report that names the file; one that could not start, was cut off (vitest writes no report when it is
 * stopped by a signal, measured 25 September 2026) or left no report says nothing about the file. Such a run stops
 * the tool with the file and what the run said, unless the caller asks for `{ noResult: 'answer' }`: then it
 * answers `noResult`, the reason in words, and `red` is null.
 *
 * EVERY ANSWER KEEPS `lock`, the installed package lock of the tree it ran in (installed-lock.mjs), so a file green alone
 * can be said to have run on the suite's packages or on others.
 * The caller passes office-keeper.mjs's runInSandbox and keepTheReport.
 */
export async function runAlone(sandbox, cwd, file, label, reports, { noResult = 'fail', rerunLimits = RERUN_LIMITS, runInSandbox, keepTheReport } = {}) {
  if (typeof runInSandbox !== 'function' || typeof keepTheReport !== 'function') throw new Error(RUN_ALONE_NEEDS_RUN_IN_SANDBOX_AND_KEEP_THE_REPORT)
  const lock = theInstalledLock(cwd)
  if (!existsSync(join(cwd, file))) return { red: false, absent: true, log: null, report: null, noResult: null, lock }
  const name = `${label}.json`
  const written = join(reports, name)
  rmSync(written, { force: true })
  const run = await runInSandbox(sandbox, label, 'npm', ['test', '--', '--no-file-parallelism', '--reporter=default', '--reporter=json', `--outputFile.json=${written}`, file], {
    cwd,
    singleFile: file, rerunLimits,
  })
  const kept = keepTheReport(written, name)
  const why = noResultIn(kept, cwd, file, run)
  if (why !== null) {
    const said = `${why}; ${whatTheRunSaid(run)}`
    if (noResult !== 'answer') fail(`${file} was run alone (${label}, log ${run.outFile}) and the run gave no result, so nothing says whether it is red: ${said}. A run with no result is not counted as red, so nothing was reported as tested.`)
    return { red: null, absent: false, log: run.outFile, report: kept, noResult: said, lock }
  }
  return { red: !aGreenRun(run, redFilesIn(kept, cwd)), absent: false, log: run.outFile, report: kept, noResult: null, lock }
}
