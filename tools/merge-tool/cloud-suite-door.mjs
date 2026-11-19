// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WHOLE SUITE ON THE CLOUD BOX FIRST, AND HERE WHEN THE BOX CANNOT RUN IT (the cloud-suite rule,
 * wave 13v round 29). The owner rented a machine for the merge queue's tests and wants it used to the
 * full. The cloud box's door, tools/cloud-suite.mjs, runs the suite there on the commit it is given, and hands back the suite's
 * report, its log and what it read, in the formats a run here writes (the door's interface). The
 * last line it prints is its answer, as JSON: {"ran": true, "code", "wallSec", "workers", "commit", "files", "failed"}.
 * It exits with npm test's code. It exits 75 with {"ran": false, "reason"} when the run could not happen: the box could
 * not be reached, was busy, has no runner, or timed out. THE BOX RUNS AT ITS OWN WORKER COUNT, which its runner file
 * names, so the queue passes none and says the count the box's answer gives. A box with
 * fewer CPUs than that runs at its CPUs, and the answer says them (tools/cloud-suite.criteria.md, criterion 24), so the
 * line gives the load for each CPU as well.
 *
 * THE BOX IS NEVER A REASON TO BOUNCE ANYTHING. When the door says the box did not run the suite, or the door fails in
 * any other way, the suite runs here, in the entry's sandbox, as before, and the log says why the box was not used.
 * Every suite, here or on the box, gets one line in the log saying where it ran and how long it took.
 *
 * THIS MODULE IMPORTS NOTHING OF THE MERGE TOOL'S ARGUMENTS, so a test can call it with a stand-in door and its own
 * folders. Part of the merge tool, tools/the-merger.mjs; testing.mjs calls it.
 */

import './a-library-is-not-a-program.mjs'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'

import { carriesTheTestMark } from '../../src/config/the-test-mark.mjs'
import { aBoxLoad } from '../the-box-under-the-suite.mjs'
import { theJournalsBeside, theJournalsKept } from '../cloud-suite-journals.mjs'

/** The door's exit for a suite the box could not run, as the door's interface says it. */
const NOT_RUN = 75
/** How long the door may take after its own --timeout, to hand the files back, before its process group is stopped. */
const AFTER_ITS_TIMEOUT_MS = 10 * 60 * 1000

/**
 * ONE SUITE, ON THE CLOUD BOX WHEN THE BOX RUNS IT, AND HERE OTHERWISE. `label` names the suite in the log. `here()` runs
 * it in the entry's sandbox and answers its run, as runInSandbox does; `hereIs` says where that is. `box` is null for a
 * run the box is not asked to make; `{ why }` when it is not asked for a reason the caller gives; otherwise what the door
 * is given: `clone`, `commit`, `report`, `reads`, `suiteLog` and `timeoutSec`. `door` is the door this run
 * calls and `theRealDoor` is tools/cloud-suite.mjs; `run` and `log` are the merge tool's own (git.mjs, log-and-state.mjs), or a
 * test's. `keepTheLog(file)` keeps the box's log where nothing in the sandbox can change it, and answers its path; the
 * startup journals beside the box's log are then kept beside the kept log (keepTheJournals).
 * `keepTheBoxReport(file)` keeps the box's own report, when the box names red files, where no later run writes, and
 * answers its path; each red file is then written into the log, which a later run only adds to.
 *
 * Answers the run as `here()` answers one, with `where` ('box' or 'here'), `wallSec`, and `box`, which says whether the
 * box ran it and, when it did not, why. A box that ran it and answered `installedLock` has it kept in `box`, and
 * `installedPackages` beside it when the answer gives that too, or `installedPackagesUnread`, why the box could not.
 */
export async function aSuiteOnTheBoxOrHere({ label, box, here, hereIs, door, theRealDoor, run, log, keepTheLog = (file) => file, keepTheBoxReport = (file) => file, env = process.env, clock = Date.now }) {
  let notOnTheBox = null
  if (box !== null) {
    const started = clock()
    const asked = 'why' in box ? { ran: false, why: box.why, doorLog: null } : await askTheBox({ label, box, door, theRealDoor, run, env })
    if (asked.ran) {
      const wallSec = secondsSince(started, clock)
      const outFile = keepTheLog(box.suiteLog)
      const journals = keepTheJournals(label, box.suiteLog, outFile)
      const failed = Array.isArray(asked.said.failed) ? `, ${String(asked.said.failed.length)} file(s) failed` : ''
      const workers = aCount(asked.said.workers) ? asked.said.workers : null
      const cpus = aCount(asked.said.cpus) ? asked.said.cpus : null
      log(
        `${label} ran on the cloud box: npm test exited ${String(asked.said.code)}${failed}, at ${theWorkersOnTheBox(workers, cpus, asked.said.runnerWorkers)}, ` +
          `on commit ${box.commit.slice(0, 12)}; ${String(wallSec)} s from the call to its answer, ${String(asked.said.wallSec)} s by the box's own count; ` +
          `${theBoxWhileTheSuiteRan(asked.said.boxLoad, cpus)} (log ${outFile}, the door's own log ${asked.doorLog})`,
      )
      if (journals !== null) log(journals)
      if (Array.isArray(asked.said.failed) && asked.said.failed.length > 0) {
        const keptReport = keepTheBoxReport(box.report)
        log(`${label}: the cloud box's own report of its ${String(asked.said.failed.length)} red file(s) is kept at ${keptReport}`)
        for (const line of theRedOnTheBox(label, asked.said.failed, keptReport, box.clone)) log(line)
      }
      return {
        code: asked.said.code,
        signal: null,
        timedOut: false,
        stoppedReason: null,
        outFile,
        tail: lastLinesOf(outFile),
        where: 'box',
        wallSec,
        box: { ran: true, wallSec: asked.said.wallSec, workers, doorLog: asked.doorLog, ...(asked.said.installedLock === undefined ? {} : { installedLock: asked.said.installedLock }), ...(asked.said.installedPackages === undefined ? {} : { installedPackages: asked.said.installedPackages }), ...(asked.said.installedPackagesUnread === undefined ? {} : { installedPackagesUnread: asked.said.installedPackagesUnread }) },
      }
    }
    // WHAT THE BOX MAY HAVE LEFT is cleared, so the run here is read from its own files only.
    if (!('why' in box)) {
      rmSync(box.report, { force: true })
      rmSync(box.reads, { recursive: true, force: true })
      rmSync(box.suiteLog, { force: true })
    }
    notOnTheBox = { ran: false, why: asked.why, doorLog: asked.doorLog }
    log(`${label} is not run on the cloud box, so it runs here, ${hereIs}: ${asked.why}${asked.doorLog === null ? '' : ` (the door's own log ${asked.doorLog})`}`)
  }
  const started = clock()
  const ran = await here()
  const wallSec = secondsSince(started, clock)
  log(`${label} ran here, ${hereIs}: ${ran.code === null ? `it ended by ${String(ran.signal)}` : `it exited ${String(ran.code)}`}${ran.timedOut ? ', stopped at its time limit' : ''}; ${String(wallSec)} s from its start to its end (log ${ran.outFile})`)
  return { ...ran, where: 'here', wallSec, ...(notOnTheBox === null ? {} : { box: notOnTheBox }) }
}

/**
 * THE STARTUP JOURNALS ARE KEPT BESIDE THE KEPT LOG (tools/cloud-suite.criteria.md, criterion 22). The door puts them
 * beside the box's log, which for a merge entry is in the entry's sandbox, cleared once the entry is final; so a log
 * kept as `<entry>/suite.log` keeps them in `<entry>/suite-startup-journals`. They are checked against their index as
 * the door checks them, and copied as the door left them, bounded and masked: masking a masked line again changes it.
 * Journals an earlier run kept under the same name are removed first. Answers the line for the log, or null when the
 * box handed back none or the log was kept where it was written.
 */
function keepTheJournals(label, log, keptLog) {
  const from = theJournalsBeside(log), to = theJournalsBeside(keptLog)
  if (from === to) return null
  rmSync(to, { recursive: true, force: true })
  if (!existsSync(from)) return null
  let kept
  try { kept = theJournalsKept(from) } catch (error) { return `${label}: the cloud box's startup journals at ${from} are not kept, because ${error.message}` }
  mkdirSync(to)
  for (const name of readdirSync(from)) copyFileSync(join(from, name), join(to, name))
  return `${label}: the cloud box's startup journals are kept at ${to}: ${String(kept.files)} file(s), ${String(kept.cut)} cut, ${String(kept.notKept)} not kept by the box`
}

/**
 * ONE CALL OF THE DOOR, and what it answered: `{ ran: true, said }` only when its answer, its exit and the files it
 * handed back all agree; otherwise `{ ran: false, why }`, with why in words. `doorLog` is the door's own output.
 */
async function askTheBox({ label, box, door, theRealDoor, run, env }) {
  if (door === theRealDoor && carriesTheTestMark(env)) {
    return { ran: false, why: 'the test suite started this run, and a run the test suite started never calls the door of the real cloud box', doorLog: null }
  }
  if (!existsSync(door)) return { ran: false, why: `there is no door at ${door}`, doorLog: null }
  rmSync(box.suiteLog, { force: true })
  const args = [
    door, 'run', '--clone', box.clone, '--commit', box.commit,
    '--report', box.report, '--reads', box.reads, '--log', box.suiteLog, '--timeout', String(box.timeoutSec),
  ]
  const called = await run(`${label}-door`, process.execPath, args, { cwd: box.clone, timeoutMs: box.timeoutSec * 1000 + AFTER_ITS_TIMEOUT_MS })
  const doorLog = called.outFile
  const no = (why) => ({ ran: false, why, doorLog })
  if (called.error !== undefined) return no(`the door could not be started (${called.error})`)
  if (called.timedOut) return no(`the door gave no answer within ${String(AFTER_ITS_TIMEOUT_MS / 60000)} minutes after its own time limit of ${String(box.timeoutSec)} s, so its process group was stopped`)
  const ended = called.code === null ? `it was ended by ${String(called.signal)}` : `it exited ${String(called.code)}`
  // RUN() WRITES STDOUT AND STDERR INTO ONE FILE, so the answer must be the last line of both: a line printed after it
  // is a door that did not end where its answer says.
  const last = lastLinesOf(doorLog).split('\n').at(-1) ?? ''
  const said = parsedObject(last)
  if (said === null || typeof said.ran !== 'boolean') return no(`the door's last line is not its answer, and ${ended}: ${quoted(last)}`)
  if (said.ran === false) {
    const reason = typeof said.reason === 'string' && said.reason.trim() !== '' ? said.reason.trim() : 'it gave no reason'
    return no(called.code === NOT_RUN ? `the door says the box could not run it: ${reason}` : `the door says it did not run the suite (${reason}), but ${ended}, not 75`)
  }
  if (!Number.isInteger(said.code) || said.code !== called.code) return no(`the door says it ran the suite and npm test exited ${String(said.code)}, but ${ended}`)
  if (said.commit !== box.commit) return no(`the door says it ran commit ${String(said.commit)}, not ${box.commit}, which it was given`)
  const report = whyAReportIsNotReadable(box.report, box.clone)
  if (report !== null) return no(`the door says it ran the suite, but its report ${box.report} ${report}`)
  if (!existsSync(box.suiteLog)) return no(`the door says it ran the suite, but handed back no log at ${box.suiteLog}`)
  if (!existsSync(box.reads) || readdirSync(box.reads).length === 0) return no(`the door says it ran the suite, but handed back no record of what the suite read at ${box.reads}`)
  // AN INSTALLED LOCK, AND THE HASH OF ITS PACKAGES, ARE KEPT ONLY AS SHA256S (tools/cloud-suite.criteria.md, criterion 23).
  for (const field of ['installedLock', 'installedPackages']) {
    const value = said[field]
    if (value !== undefined && (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value))) return no(`the door says it ran the suite, but its ${field} ${quoted(typeof value === 'string' ? value : JSON.stringify(value))} is not the sha256 of a lock`)
  }
  const unread = said.installedPackagesUnread
  if (unread !== undefined && (typeof unread !== 'string' || unread.trim() === '')) return no(`the door says it ran the suite, but its installedPackagesUnread ${quoted(typeof unread === 'string' ? unread : JSON.stringify(unread))} gives no reason`)
  return { ran: true, said, doorLog }
}

/** Why a vitest JSON report cannot be read as a run on `clone` wrote it, or null when it can. */
function whyAReportIsNotReadable(file, clone) {
  if (!existsSync(file)) return 'is not there'
  const report = parsedObject(readFileSync(file, 'utf8'))
  if (report === null || !Array.isArray(report.testResults)) return 'is not a vitest JSON report'
  // A RUN HERE NAMES EACH FILE BY ITS PATH IN THE CLONE, and the red files are read relative to it.
  const outside = report.testResults.map((one) => String(one?.name)).filter((name) => {
    const inTheClone = relative(clone, name)
    return !isAbsolute(name) || inTheClone === '' || inTheClone === '..' || inTheClone.startsWith(`..${sep}`) || isAbsolute(inTheClone)
  })
  if (outside.length > 0) return `names ${String(outside.length)} file(s) outside the clone ${clone}, such as ${outside[0]}`
  return null
}

/**
 * EACH FILE THE BOX NAMED RED, IN ONE LINE, read from the box's own report: how many of its cases failed, the first of
 * them by name, the first line of its error, and the line of the file that error names. A file with no failed case,
 * such as one that did not load, gives the file's own error. What the report does not say is said to be missing.
 */
function theRedOnTheBox(label, failed, reportFile, clone) {
  const report = parsedObject(readFileSync(reportFile, 'utf8'))
  const results = Array.isArray(report?.testResults) ? report.testResults : []
  return failed.map((file) => {
    const result = results.find((one) => relative(clone, String(one?.name)) === file)
    if (result === undefined) return `${label} failed on the cloud box: ${file}, which the box's report does not name`
    const cases = Array.isArray(result.assertionResults) ? result.assertionResults.filter((one) => one?.status === 'failed') : []
    const error = String((cases.length > 0 ? cases[0].failureMessages?.[0] : result.message) ?? '')
    const first = error.split('\n').find((line) => line.trim() !== '')?.trim()
    const after = error.indexOf(`${file}:`)
    const at = after === -1 ? undefined : /^\d+/u.exec(error.slice(after + file.length + 1))?.[0]
    const which = cases.length > 0 ? `${String(cases.length)} case(s) failed, the first "${String(cases[0].fullName)}"` : 'no case failed'
    const why = first === undefined ? 'the box\'s report gives no error for it'
      : `${first} (${at === undefined ? 'its error names no line of the file' : `its error names line ${at} of the file`})`
    return `${label} failed on the cloud box: ${file}, ${which}: ${why}`
  })
}

/** Whether a count in the door's answer is a whole number above zero. */
const aCount = (value) => Number.isInteger(value) && value > 0

/** The line's words for a box whose CPUs the door's answer does not give, exported so a test reads them. */
export const CPUS_NOT_SAID = 'on a box whose CPUs the door did not say'

/**
 * HOW MANY WORKERS THE BOX RAN, and why (criterion 24): the runner file's count, or the box's CPUs when it has fewer.
 * An answer from a door older than criterion 24 gives no CPUs, and the line says so.
 */
function theWorkersOnTheBox(workers, cpus, runnerWorkers) {
  if (workers === null) return 'a worker count the door did not say'
  if (cpus === null) return `${String(workers)} workers, ${CPUS_NOT_SAID}`
  if (aCount(runnerWorkers) && runnerWorkers > workers) return `${String(workers)} workers, one for each of the box's ${String(cpus)} CPUs, where its runner file names ${String(runnerWorkers)}`
  return `${String(workers)} workers, on a box of ${String(cpus)} CPUs`
}

/**
 * WHAT THE BOX WAS DOING WHILE THE SUITE RAN, as the door read it every few seconds (tools/cloud-suite.criteria.md,
 * criterion 21): how many times it read the box's load and memory, how far apart, their median and their worst, and how
 * many times it could not read them. When the door said the box's CPUs (criterion 24), the load is also given for each
 * CPU, to two decimals. A box read at no time has no load, so none is given for each CPU either.
 */
function theBoxWhileTheSuiteRan(said, cpus) {
  if (said === undefined) return 'the door did not say the box\'s load and available memory'
  if (!aBoxLoad(said)) return `the door gave the box's load and available memory in a shape the merge tool does not read: ${quoted(JSON.stringify(said))}`
  const read = `while the suite ran the door read the box ${String(said.samples)} time(s), ${String(said.everySec)} s apart`
  const eachCpu = (load) => String(Math.round((load / cpus) * 100) / 100)
  const perCpu = cpus === null || said.load === null ? '' : `, which is ${eachCpu(said.load.median)} and ${eachCpu(said.load.worst)} for each of its ${String(cpus)} CPUs`
  const measures = said.samples === 0 ? ''
    : `: its 1-minute load was ${String(said.load.median)} at the median and ${String(said.load.worst)} at the worst${perCpu}, ` +
      `its available memory ${String(said.availableMemoryMb.median)} MB at the median and ${String(said.availableMemoryMb.worst)} MB at the worst`
  const missed = said.notRead === 0 ? '' : `; ${String(said.notRead)} other time(s) it could not read it`
  return `${read}${measures}${missed}`
}

function parsedObject(text) {
  try {
    const value = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/** The last twelve lines of a file that are not empty, or nothing when it is not there. */
function lastLinesOf(file) {
  if (!existsSync(file)) return ''
  return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').slice(-12).join('\n')
}

function quoted(line) {
  return line === '' ? 'it printed nothing' : JSON.stringify(line.length > 300 ? `${line.slice(0, 300)}…` : line)
}

function secondsSince(started, clock) {
  return Math.round((clock() - started) / 100) / 10
}
