#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAND-IN FOR tools/cloud-suite.mjs, THE DOOR TO THE CLOUD BOX, FOR TESTS ONLY. It takes the door's words, reaches
 * no box and sends nothing anywhere. Every report, log and record of reads it writes is made up. What it does is set by
 * the test, in the environment:
 *
 *   STAND_IN_DOOR_DOES    green or red: it "ran" the suite, hands back the three files and exits 0 or 1. It says it
 *                         ran at 20 workers, the made-up count of the box's runner file, unless --workers is given.
 *                         no-workers: as green, and its answer names no worker count.
 *                         red-in-words: as red, and its report says why, as vitest's does: the second file has one
 *                         failed case, with its name and its error, beside one that passed, and the third file
 *                         did not load, so it has no case and an error of its own. Its log prints their FAIL lines.
 *                         no-load: as green, and its answer gives no load of the box.
 *                         load-partly-read: as green, and its answer says it read the box's load at no time while the
 *                         suite ran, and three times could not read it.
 *                         not-run: it answers {"ran": false, "reason"} and exits 75.
 *                         crash: it throws after its first line. unreadable: its last line is cut off. hang: it never ends.
 *                         exit-not-code, other-commit, report-outside, no-log, no-reads: it says it ran, and one thing
 *                         it exits with or hands back disagrees with that.
 *                         Every answer of a suite it "ran" gives `boxLoad`, a made-up load and available memory of
 *                         the box while the suite ran, unless no-load or load-partly-read says otherwise.
 *   STAND_IN_DOOR_REASON  the reason a not-run answer gives.
 *   STAND_IN_DOOR_CPUS    when set, the made-up box has that many CPUs, as the door says from criterion 24 on: every
 *                         answer that gives a worker count gives `cpus`, `runnerWorkers`, the 20 of the made-up runner
 *                         file, and `workers`, the fewer of the two. Unset, it answers as a door before criterion 24.
 *   STAND_IN_DOOR_INSTALLED_LOCK  when set, every answer of a suite it "ran" gives it as `installedLock`, as it is, the
 *                         sha256 the box takes of the lock its install wrote (tools/cloud-suite.criteria.md, criterion 23).
 *   STAND_IN_DOOR_INSTALLED_PACKAGES  when set, every such answer gives it as `installedPackages`, as it is, the sha256
 *                         of that lock without the root's own name and version.
 *   STAND_IN_DOOR_INSTALLED_PACKAGES_UNREAD  when set, every such answer gives it as `installedPackagesUnread`, as it
 *                         is, the reason the box could not make that hash.
 *   STAND_IN_DOOR_CALLS  a file each call appends its words to, as one JSON line.
 *
 * Its answer is the last line it prints, as the real door's is (the interface, message EHbEfgumQusC).
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
if (process.env.STAND_IN_DOOR_CALLS) appendFileSync(process.env.STAND_IN_DOOR_CALLS, `${JSON.stringify(argv)}\n`)
const options = {}
for (let i = 1; i < argv.length; i += 2) options[argv[i].replace(/^--/u, '')] = argv[i + 1]
const needed = ['clone', 'commit', 'report', 'reads', 'log']
if (argv[0] !== 'run' || needed.some((name) => options[name] === undefined)) {
  process.stderr.write(`stand-in door: run needs --${needed.join(', --')}\n`)
  process.exit(2)
}
const does = process.env.STAND_IN_DOOR_DOES ?? 'green'
const answer = (said, exit) => {
  process.stdout.write(`${JSON.stringify(said)}\n`)
  process.exit(exit)
}

process.stdout.write('stand-in door: a made-up run, no box was reached\n')
if (does === 'not-run') answer({ ran: false, reason: process.env.STAND_IN_DOOR_REASON ?? '' }, 75)
if (does === 'crash') throw new Error('the stand-in door broke on purpose')
if (does === 'unreadable') {
  process.stdout.write('{"ran": true, "code": 0, "wallS\n')
  process.exit(0)
}
if (does === 'hang') setInterval(() => {}, 60_000)
else {
  const inWords = does === 'red-in-words'
  const red = does === 'red' || inWords
  const inTheClone = (file) => (does === 'report-outside' ? join('/made-up-box/checkout', file) : join(options.clone, file))
  const files = [{ file: 'tests/one.test.ts', passed: true }, { file: 'tests/two.test.ts', passed: !red }, ...(inWords ? [{ file: 'tests/three.test.ts', passed: false }] : [])]
  const testResults = files.map((one) => ({ name: inTheClone(one.file), status: one.passed ? 'passed' : 'failed', assertionResults: [{ status: one.passed ? 'passed' : 'failed' }] }))
  const failed = files.filter((one) => !one.passed).map((one) => one.file)
  let log = 'made-up suite log from the stand-in door\n'
  if (inWords) {
    const theAssertionSaid = 'AssertionError: expected 3 to be 4 // Object.is equality'
    const error = `${theAssertionSaid}\n    at ${inTheClone('tests/two.test.ts')}:12:17\n    at made-up-runner.js:1:1`
    testResults[1].assertionResults = [
      { ancestorTitles: ['two'], title: 'counts its rows', fullName: 'two counts its rows', status: 'passed', failureMessages: [] },
      { ancestorTitles: ['two'], title: 'adds the made-up numbers', fullName: 'two adds the made-up numbers', status: 'failed', failureMessages: [error] },
    ]
    testResults[2].assertionResults = []
    testResults[2].message = `Error: Cannot find module './made-up-missing.ts' imported from ${inTheClone('tests/three.test.ts')}`
    log += ` FAIL  tests/two.test.ts > two > adds the made-up numbers\n${theAssertionSaid}\n ❯ tests/two.test.ts:12:17\n FAIL  tests/three.test.ts\n`
  }
  const cases = testResults.flatMap((one) => one.assertionResults)
  const count = (status) => cases.filter((one) => one.status === status).length
  writeFileSync(options.report, `${JSON.stringify({ numTotalTests: cases.length, numPassedTests: count('passed'), numFailedTests: count('failed'), testResults })}\n`)
  if (does !== 'no-log') writeFileSync(options.log, log)
  if (does !== 'no-reads') {
    mkdirSync(options.reads, { recursive: true })
    writeFileSync(join(options.reads, 'made-up-process.txt'), 'R tests/one.test.ts\n')
  }
  const code = red ? 1 : 0
  const runnerWorkers = options.workers === undefined ? 20 : Number(options.workers)
  const cpus = process.env.STAND_IN_DOOR_CPUS === undefined ? null : Number(process.env.STAND_IN_DOOR_CPUS)
  const workers = does === 'no-workers' ? {} : cpus === null ? { workers: runnerWorkers } : { workers: Math.min(runnerWorkers, cpus), cpus, runnerWorkers }
  const boxLoad = does === 'no-load' ? {}
    : does === 'load-partly-read' ? { boxLoad: { everySec: 15, samples: 0, notRead: 3, load: null, availableMemoryMb: null } }
      : { boxLoad: { everySec: 15, samples: 133, notRead: 0, load: { median: 6.4, worst: 11.25 }, availableMemoryMb: { median: 41210, worst: 30577 } } }
  const installedLock = process.env.STAND_IN_DOOR_INSTALLED_LOCK === undefined ? {} : { installedLock: process.env.STAND_IN_DOOR_INSTALLED_LOCK }
  const installedPackages = process.env.STAND_IN_DOOR_INSTALLED_PACKAGES === undefined ? {} : { installedPackages: process.env.STAND_IN_DOOR_INSTALLED_PACKAGES }
  const unread = process.env.STAND_IN_DOOR_INSTALLED_PACKAGES_UNREAD === undefined ? {} : { installedPackagesUnread: process.env.STAND_IN_DOOR_INSTALLED_PACKAGES_UNREAD }
  answer(
    { ran: true, code, wallSec: 1998.4, ...workers, commit: does === 'other-commit' ? 'b'.repeat(40) : options.commit, files: files.length, failed, ...boxLoad, ...installedLock, ...installedPackages, ...unread },
    does === 'exit-not-code' ? 1 - code : code,
  )
}
