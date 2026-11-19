#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RUN ONLY THE TEST FILES YOU NAME, AND CHECK AFTERWARDS THAT ONLY THOSE RAN.
 *
 *     node tools/run-named-tests.mjs tests/a.test.ts tests/b.test.ts
 *     node tools/run-named-tests.mjs tests/a.test.ts --list whole-tree
 *     node tools/run-named-tests.mjs --print a-test-that-starts-nothing-keeps-the-short-budget
 *     node tools/run-named-tests.mjs --list whole-tree --print        then --part 1, --part 2, … one command each
 *     node tools/run-named-tests.mjs --list related --print        then --part 1, --part 2, … one command each
 *
 * Why this exists. vitest keeps a file when its path contains any filter as a plain substring. So an
 * empty list, an empty string, "." or "tests/" each run the whole suite, and a mistyped name given
 * beside other names is dropped without a word. The whole suite was started by mistake five times on
 * 25 September 2026 (report KP0udNekYcAo, block b-5). Only the merge queue may run the whole suite,
 * because the machine is shared.
 *
 * TIMING: --list timing runs alone, keeps .logs/timing-<time>-<8 random hex characters>.json, and exits 3 when
 * the machine is not quiet (load above a quarter of the machine’s cores). No retry.
 *
 * WHAT IT TAKES. Names of test files, and `--list whole-tree`, `--list browser`, `--list window` or `--list timing`,
 * which adds the files that `node --import tsx tests/the-test-lists.ts <list>` prints. A name is one of these:
 *   - a path to a file, from the current folder or from the checkout;
 *   - a file name with no folder in it, with or without `.test.ts`, looked up under tests/ and its
 *     subfolders.
 * --at-most-half is allowed only with --list related --print, changes its quarter bound to half, and emits
 * RELATED_TESTS_FACTS followed by JSON on stderr: related and every counts, and leftOutSlow [{file, seconds}].
 * Over half or every file exits 3 with both counts; every other refusal still exits 2.
 * It takes no other vitest option. `-t` in particular is refused: name the file instead.
 *
 * --list related is the test files the change from the merge-base with origin/main to HEAD can break: every test
 * file that imports a changed file, directly or through other modules, worked out by tools/related-tests.mjs, which
 * says how. The whole-tree list is always added to it, because the files that read the whole tree are the ones that
 * graph cannot follow. A test that reaches the change only by starting the whole server or building the whole page
 * is counted and not run; the merge queue runs it. The timing tests are left to the timing group. Both --list related
 * and --list whole-tree run in parts of at most SECONDS_IN_ONE_PART, so that each part fits in one agent's command.
 * Files named beside either list are packed with it. Run `--print` to see the parts, then `--part <n>` for each. The
 * related list is refused when it would be every test file, and when it would be
 * more than THE_MOST_A_RELATED_LIST_RUNS (a quarter of the test files); then name the files you know the change
 * touches, with --list whole-tree, and leave the rest to the merge queue.
 *
 * WHAT IT REFUSES, before anything runs. It names each thing it refused, and exits 2:
 *   - an empty list;
 *   - an empty string;
 *   - a folder, "." among them;
 *   - a name that matches no file, even beside other names;
 *   - a file name that matches more than one file under tests/;
 *   - a file that is not under tests/, or is not a test file (its name does not end in .test.ts);
 *   - a list whose script exits non-zero, or prints no file;
 *   - `--list window` on a machine where dbus-run-session or xvfb-run is not on PATH;
 *   - `--list related` that cannot be worked out, or would be every test file or more than a quarter of them;
 *   - `--part` without --list related or --list whole-tree, or naming a part that is not there;
 *   - --at-most-half without both --list related and --print;
 *   - an option it does not take.
 * A file named twice, for example your own file that is also on the whole-tree list, is run once,
 * and the tool says so.
 *
 * HOW IT RUNS. It runs no shell. It hands vitest the absolute path of each file, so no name can match
 * another file as a substring. It adds --no-file-parallelism, so one file runs at a time. It removes from
 * the environment of every program it starts every name that starts MOLE_OFFICE_ or SANDBOX_, and every
 * name in THE_OFFICE_VARIABLES, THE_AGENT_CREDENTIALS and the rest of VARIABLES_NOT_PASSED_TO_CHILDREN:
 * the caller's office address and identity, its key and key file, the model logins, the whole-suite and
 * window variables, the timing names, and the pairing. It says one line naming every name it cleared,
 * and never a value. A test can still give its own children fixture credentials and a stand-in office.
 * MOLE_OFFICE_WHOLE_SUITE, the variable that lets vitest start with no file named, is never set.
 * vitest is run through tools/q.mjs, which keeps the whole output in a log under .logs/ and prints the
 * log's path.
 *
 * THE LIVE-OFFICE GUARD'S PORTS. The guard in vitest (tools/live-office-ports.mjs) reads which ports to
 * refuse from MOLE_OFFICE_PORT and from SANDBOX_DIR, and both are cleared. So the tool reads both
 * itself, in its own process, before it clears anything, and hands every program it starts those ports
 * and any it was handed, in LIVE_OFFICE_GUARD_PORTS, which the guard adds to its own. Inside a sandbox
 * that keeps the office the sandbox writes to among the ports every test refuses. A sandbox that cannot
 * say which office it writes to is refused here with the guard's own sentence, and nothing runs.
 *
 * THE WINDOW LIST. With `--list window`, vitest runs inside `dbus-run-session -- xvfb-run -a`, a
 * virtual display and a session bus of its own, and the tool sets MOLE_OFFICE_UNDER_A_VIRTUAL_DISPLAY
 * for it. A window test opens a window only when that variable is set, and the tool removes it from
 * every other run. tests/the-window-display.ts holds the command and the variable for both sides.
 *
 * AFTER THE RUN. vitest writes its JSON report to .logs/named-tests-<time>-<8 random hex characters>.json, beside its
 * default reporter. The tool reads it and compares the files that ran with the files it named. If they are not
 * the same, it fails and names each file added or missing. If there is no report, it fails and says
 * nothing tells which files ran. The exit code is vitest's, or 1 when vitest exited 0 and the check
 * failed.
 *
 * WHAT THE USE LINE CARRIES. Beside its said line, a named run's use carries `files` (one item for each
 * file this call ran, in the order named: vitest's passed, failed or no result, its seconds from the
 * report's own start and end, and the first 16 hex characters of its SHA-256) and `tree` (the HEAD commit
 * and a hash of the uncommitted change). Both are read before the first part and after the last; a tree
 * that changed while the tests ran, or a test file that changed under it, is sent as not known. An office
 * older than migration 0279 refuses them; tools/use-line.mjs then writes the line without them and says
 * the results were not stored.
 *
 * WHEN IT RUNS TESTS, IT REGISTERS ITS OWN PROCESS. Chapter 2 asks that anything which outlives its command be
 * registered on the run that started it. The tool cannot see whether its caller waits for it, so it now registers
 * whenever it is about to run tests and holds a run's key, whether or not it was started in the background. Just before
 * the tests run, the tool writes its own pid and start time on the run whose key it holds, through the ledger door
 * (POST /api/resources, type process). It releases the row, with nothing signalled, after the use line: on a normal
 * end, on a failure, and on SIGTERM, SIGINT and SIGHUP, which then end it as before. A refused registration is said
 * once; the separate seat ask determines whether the tests may run. A release that fails is said on stderr and not asked again.
 * --background is still taken, so every caller that passes it keeps working: it no longer changes what the tool does,
 * and giving it is said in one sentence. --print writes nothing on the ledger. tools/own-process-row.mjs says how, and
 * what it leaves out.
 *
 * A TEST-BATCHES SEAT IS TAKEN BEFORE THE FIRST FILE, and given back after the last, also when a file fails, and on
 * SIGTERM, SIGINT and SIGHUP (tools/test-batch-seat.mjs). The office keeps a few such seats on the machine and holds a
 * new one back while the machine is busy. An unreachable office, a refusal or a missing key stops the tests with a
 * reason. With no office configured outside a sandbox, the tests run without a seat. Inside a sandbox the seat is held
 * by the row the tool wrote for its own process, never by the sandbox's row it inherited, so a sandbox batch whose own
 * row was not written stops. A second batch started in a process group that already has a seat is refused.
 *
 * INSIDE A SANDBOX THE BATCH HOLDS THE TSC LOCK SHARED from its seat to its last part (tools/the-tsc-lock.mjs). A tsc
 * there runs alone, because one takes about 7 GB of the container's 16 GiB, and it waits until no batch holds the lock.
 * The lock is taken once the seat is granted, not before: a batch that waits in line for its seat would otherwise hold
 * it all that time, and every tsc in the sandbox would wait behind a batch that runs nothing. When a tsc holds the lock
 * or waits for it, the batch says so and waits. It takes no second hold in two cases, because each would wait without
 * end: when a batch that started this one holds the lock (TSC_LOCK_HELD_BY, which the tool sets for its own test
 * files), and when the shell that started the tool handed it the lock already. A lock that cannot be taken stops the
 * tests with a reason, and the seat is given back. Outside a sandbox nothing is taken.
 *
 * THE BATCH RUNS IN A PROCESS GROUP OF ITS OWN (tools/a-group-of-its-own.mjs). A tool that is not its group's leader
 * starts itself again in a new group and waits for it, passing on SIGTERM, SIGINT and SIGHUP. The seat, the row and
 * every test process belong to that group. When the process that started the batch ends first, kill -9 included, the
 * batch gives its seat and its row back and stops its group.
 *
 * A WAIT IN LINE HAS NO TIME LIMIT. It ends when the office grants the seat: a seat is given back, a holding group
 * ends, the machine is no longer busy, or the person changes a row on the Gates panel. It also ends when the office
 * stops answering or refuses, and then the tests stop with a reason, and when the tool is stopped. While the machine
 * stays busy, the batch waits. Each time the office's answer or the wait changes, the tool prints "run-named-tests:
 * waits for a test-batches seat, asking again every 10 s." (the wait for its place, at most 60 s) and then the office's
 * words, which name the figure read and its limit.
 *
 * --print resolves the names and prints the absolute paths, one per line, runs nothing and exits 0. With --list
 * related or --list whole-tree it prints every part's files, or only part n's with --part n, and says the parts on
 * stderr.
 * --root <folder> looks names up in another checkout's tests/ folder, and runs vitest there.
 * --base <commit> makes --list related work from that commit to HEAD instead of from the merge-base with origin/main.
 * The merge tool asks it so, from the main an entry was integrated on.
 * --vitest <file> runs that file with this Node instead of this checkout's vitest. The last two are
 * for tests/named-tests-run-only-what-is-named.test.ts, which runs the tool over a folder of its own.
 * --leave-out-slower-than <seconds> leaves out of --list related every file whose longest recorded time is over that,
 * and names how many it left out and how many had no recorded time. A file with no recorded time stays. The merge tool
 * asks it so when the office's related-tests-first setting is on (round 17c), with the bound that setting gives.
 * --times <folder> reads recorded times from the vitest JSON reports in that folder and the folders one level under
 * it, besides .logs here and in this tool's checkout. It may be given more than once. The merge tool names the folder
 * that holds every entry's work folder, where it keeps each suite's report.
 */

import { enWave13u } from '../src/shared/words/en-wave-13u.ts'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fileNameStamp, localStamp } from '../src/shared/time.ts'
import { WHOLE_SUITE_VARIABLE } from '../tests/the-whole-suite-is-asked-for-by-name.ts'
import { THE_VIRTUAL_DISPLAY_COMMAND, WINDOW_DISPLAY_VALUE, WINDOW_DISPLAY_VARIABLE } from '../tests/the-window-display.ts'
import { TOOL_USE_MOST_CHARACTERS, THE_TEST_FILES_TOOL, TEST_FILE_RESULTS, TEST_FILES_IN_A_USE_MOST, TEST_HASH_CHARACTERS, NO_UNCOMMITTED_CHANGE } from '../src/shared/toolset.ts'
import { TIMING_TESTS, TIMING_GROUP_VARIABLE, TIMING_GROUP_VALUE, TIMING_RESULTS_VARIABLE, TIMING_READING_FIXTURE_VARIABLE, TIMING_COMMAND, timingMachineReading, isQuietForTiming } from '../tests/the-timing-tests.ts'
import { theOfficeInThisEnvironment, writeAUseLine } from './use-line.mjs'
import { theToolsOwnRow, THE_BACKGROUND_FLAG_IS_STILL_TAKEN } from './own-process-row.mjs'
import { aTestBatchSeat, THE_BATCH_ENDED, stoppedBy } from './test-batch-seat.mjs'
import { theTscLockShared, HOW_THE_TSC_LOCK_IS_HELD, TSC_LOCK_HELD_BY_VARIABLE } from './the-tsc-lock.mjs'
import { aGroupOfItsOwn, THE_STARTER_ENDED } from './a-group-of-its-own.mjs'
import { PORTS_VARIABLE, THE_AGENT_CREDENTIALS, THE_OFFICE_VARIABLES, theHandedDownPorts } from './live-office-guard.mjs'
import { theLiveOfficesPorts } from './live-office-ports.mjs'
import { stopAnUnpairedStableStart } from '../src/config/the-office-tool-environment.mjs'

// THE START CHECK (wave 13q), before the arguments are read: a stable checkout at a dated stable tag started without the
// pairing would read its own defaults.
stopAnUnpairedStableStart()
// A GROUP OF ITS OWN, before anything else runs, so the tool that is not its group's leader does nothing twice.
const theStarter = await aGroupOfItsOwn()

const THIS_CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_FILE_ENDING = '.test.ts'
/** vitest's three answers for one file, in the office's own words (src/shared/toolset.ts). */
const PASSED = TEST_FILE_RESULTS[0]
const FAILED = TEST_FILE_RESULTS[1]
const NO_RESULT = TEST_FILE_RESULTS[2]
/** Enough for a big diff: a git that runs past it is a failed read, not a truncated hash. */
const GIT_MAX_BUFFER = 256 * 1024 * 1024

/**
 * The variables kept out of every child. The office variables and credentials are declared in
 * tools/live-office-guard.mjs; only the office variables switch that guard off.
 */
const VARIABLES_NOT_PASSED_TO_CHILDREN = [...THE_OFFICE_VARIABLES, ...THE_AGENT_CREDENTIALS, WHOLE_SUITE_VARIABLE, WINDOW_DISPLAY_VARIABLE, TIMING_GROUP_VARIABLE, TIMING_RESULTS_VARIABLE, TIMING_READING_FIXTURE_VARIABLE]
/**
 * The pairing is kept out of every child too. This process keeps it, for its start check above and for the office its
 * settings name. A child runs the code in --root, and the merge queue, which starts this tool paired, names its merge
 * clone there. That clone's settings refuse a development checkout whose .env names another folder as the stable
 * checkout (src/config/settings.mjs).
 */
VARIABLES_NOT_PASSED_TO_CHILDREN.push('MOLE_OFFICE_DEVELOPMENT_CHECKOUT')

/** The lists tests/the-test-lists.ts prints, and `related`, which tools/related-tests.mjs works out here. */
const LISTS = ['whole-tree', 'browser', 'window', 'timing', 'related']

/**
 * HOW LONG ONE PART OF --list related OR --list whole-tree MAY TAKE, as worked out before it runs. An agent's command
 * may take ten minutes.
 * Parts were counted by files first, in round 45: forty files took 675 s, and twenty took more than 580 s, because one
 * file took 287 s and another 171 s. So parts are packed by time. Each file counts the longest time it has ever taken
 * in a report under .logs (the-merger's is 554 s, so it runs in a part of its own), or SECONDS_FOR_A_FILE_WITH_NO_TIME,
 * which is more than nine in ten files took; and SECONDS_TO_START_A_FILE besides, because the reports leave out the
 * time vitest takes to load each file: in round 45 that was 1.1 to 2.7 s a file, and a part of 85 files whose reports
 * said 259 s took 486 s. A part also counts SECONDS_TO_START_A_PART, for this tool working out the list and vitest
 * starting (14 s for a part of one file). Half the ten minutes is left over for a busy machine.
 */
const SECONDS_IN_ONE_PART = 300
const SECONDS_FOR_A_FILE_WITH_NO_TIME = 10
const SECONDS_TO_START_A_FILE = 3
const SECONDS_TO_START_A_PART = 15

/**
 * THE MOST FILES --list related RUNS: a quarter of the checkout's test files, counted each time. Above it the list is
 * refused. Why a quarter: at 4.3 s a file, a quarter of the 2,345 files of 10 October 2026 is about 42 minutes, one
 * at a time, beside the queue's own work; more than that is a second run of the whole suite in all but name, which
 * only the merge queue may run. The three changes replayed in round 45 needed 133 and 457
 * files besides the whole-tree list, and one needed 1,833, because it changed how the server is put together. Measured
 * at nice 19 beside the queue, the 571 files of the second took 55 minutes and the 288 of the first 40.
 */
const THE_MOST_A_RELATED_LIST_RUNS = (testFiles) => Math.floor(testFiles / 4)

// ============================================================================ the arguments

const refused = []
const names = []
const lists = []
let print = false
/** --background: still taken, so every caller that passes it keeps working; it no longer changes what the tool does. */
let background = false
let atMostHalf = false
let halfBoundRefused = false
let halfFacts = null
const halfWords = (key, values = {}) => enWave13u[`queueRelated.${key}`].replace(/\{(\w+)\}/g, (_, name) => String(values[name]))
const printHalfFacts = () => { if (atMostHalf && halfFacts !== null) console.error(`RELATED_TESTS_FACTS ${JSON.stringify(halfFacts)}`) }
/** The one part of --list related to run, counted from 1, or null for every part. */
let part = null
let root = THIS_CHECKOUT
/** The commit --list related works from, or undefined for the merge-base with origin/main. */
let base
let vitestEntry = join(THIS_CHECKOUT, 'node_modules', 'vitest', 'vitest.mjs')
/** --leave-out-slower-than: the longest recorded time, in seconds, a file of --list related may have, or null for no bound. */
let slowerThan = null
/** --times: more folders the recorded times are read from. */
const timesFrom = []

const args = process.argv.slice(2)
for (let i = 0; i < args.length; i += 1) {
  const word = args[i]
  if (word === '--') {
    names.push(...args.slice(i + 1))
    break
  }
  if (word === '--at-most-half') atMostHalf = true
  else if (word === '--print') print = true
  else if (word === '--background') background = true
  else if (word === '--list' || word === '--root' || word === '--vitest' || word === '--part' || word === '--base' || word === '--leave-out-slower-than' || word === '--times') {
    const value = args[i + 1]
    i += 1
    if (value === undefined) refused.push(`${word} needs a value after it.`)
    else if (word === '--list') {
      if (LISTS.includes(value)) lists.push(value)
      else refused.push(`--list ${JSON.stringify(value)} is not a list. The lists are ${LISTS.slice(0, -1).join(', ')} and ${LISTS.at(-1)}.`)
    } else if (word === '--part') {
      if (/^[1-9][0-9]*$/.test(value)) part = Number(value)
      else refused.push(`--part ${JSON.stringify(value)} is not a part: a part is a whole number from 1.`)
    } else if (word === '--leave-out-slower-than') {
      if (/^[1-9][0-9]*$/.test(value)) slowerThan = Number(value)
      else refused.push(`--leave-out-slower-than ${JSON.stringify(value)} is not a number of seconds: it is a whole number from 1.`)
    } else if (word === '--times') timesFrom.push(resolve(value))
    else if (word === '--root') root = resolve(value)
    else if (word === '--base') base = value
    else vitestEntry = resolve(value)
  } else if (word === '-t' || word.startsWith('-t=') || word === '--testNamePattern' || word.startsWith('--testNamePattern=')) {
    refused.push(`${word} picks tests by their names, and this tool does not take it: it runs whole files. Name the file instead.`)
  } else if (word.startsWith('-') && word !== '-') {
    refused.push(`${word} is not an option this tool takes. It takes file names, --at-most-half, --background, --list, --base, --leave-out-slower-than, --part, --print, --root, --times and --vitest.`)
  } else names.push(word)
}

const testsFolder = join(root, 'tests')

// ============================================================================ the environment

/** The words of the line that names every name kept out of the children. A test reads them from here. */
export const THE_NAMES_CLEARED = 'run-named-tests: cleared from every child, by name and never by a value:'

/** The names in this process's environment that no child gets: every MOLE_OFFICE_ and SANDBOX_ name, and the list above. */
function theNamesKeptFromEveryChild() {
  return Object.keys(process.env)
    .filter((name) => name.startsWith('MOLE_OFFICE_') || name.startsWith('SANDBOX_') || VARIABLES_NOT_PASSED_TO_CHILDREN.includes(name))
    .sort()
}

/**
 * THE PORTS THE LIVE-OFFICE GUARD IN EVERY CHILD REFUSES, read here before any name is cleared: the ports
 * theLiveOfficesPorts reads from this process's environment, then any this process was handed. vitest's guard
 * (guardEveryTestProcess) adds each to the ports it reads itself, unless it holds it already with the same sentence.
 * Null when a port cannot be read: then the run is refused with that sentence, and no child is given a list that leaves
 * the port out.
 *
 * @type {import('./live-office-guard.mjs').AGuardedPort[] | null}
 */
const theGuardsPorts = (() => {
  const read = theLiveOfficesPorts()
  const broken = read.ports.find((one) => one.port === null)
  if (broken !== undefined) {
    refused.push(`${broken.said} So the live-office guard cannot be told which ports to refuse, and nothing ran.`)
    return null
  }
  try {
    return [...read.ports, ...(theHandedDownPorts() ?? [])]
  } catch (error) {
    refused.push(`${error instanceof Error ? error.message : String(error)} Nothing ran.`)
    return null
  }
})()

/** A copy of the parent's environment without the names kept from every child, and with the guard's ports. */
function childEnvironment() {
  const env = { ...process.env }
  for (const name of theNamesKeptFromEveryChild()) delete env[name]
  if (theGuardsPorts !== null) env[PORTS_VARIABLE] = JSON.stringify(theGuardsPorts)
  return env
}

// ============================================================================ resolving a name

/** Every test file under `folder` and its subfolders, as absolute paths. */
function everyTestFileUnder(folder) {
  const found = []
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const path = join(folder, entry.name)
    if (entry.isDirectory()) found.push(...everyTestFileUnder(path))
    else if (entry.name.endsWith(TEST_FILE_ENDING)) found.push(path)
  }
  return found
}

let testFilesHeld = null
/** The test files under tests/, read once, and only when a bare file name is given. */
function theTestFiles() {
  if (testFilesHeld === null) testFilesHeld = existsSync(testsFolder) ? everyTestFileUnder(testsFolder) : []
  return testFilesHeld
}

/** Is `path` an existing file that is a test file under tests/? The answer is null, or why not. */
function whyNotATestFile(name, path) {
  if (statSync(path).isDirectory()) return `${JSON.stringify(name)} is a folder (${path}). Name the test files in it one by one.`
  if (!path.startsWith(testsFolder + sep)) return `${JSON.stringify(name)} is ${path}, which is not under ${testsFolder}.`
  if (!path.endsWith(TEST_FILE_ENDING)) {
    return `${JSON.stringify(name)} is ${path}, which is not a test file: a test file's name ends in ${TEST_FILE_ENDING}.`
  }
  return null
}

/**
 * The one test file a name means, as `{ file }`, or `{ refused }` with the sentence that says why not.
 * `from` is the folders a path is read from, in order.
 */
function resolveName(name, from) {
  if (name === '') return { refused: 'An empty name ("") was given. vitest reads an empty name as every file, so it is refused.' }
  for (const folder of from) {
    const path = resolve(folder, name)
    if (existsSync(path)) {
      const why = whyNotATestFile(name, path)
      return why === null ? { file: path } : { refused: why }
    }
  }
  const tried = [...new Set(from.map((folder) => resolve(folder, name)))].join(' or ')
  if (name.includes('/')) return { refused: `${JSON.stringify(name)} matches no file: ${tried} does not exist.` }
  const wanted = name.endsWith(TEST_FILE_ENDING) ? name : `${name}${TEST_FILE_ENDING}`
  const matches = theTestFiles().filter((file) => basename(file) === wanted)
  if (matches.length === 0) {
    return { refused: `${JSON.stringify(name)} matches no file: ${tried} does not exist, and no test file under ${testsFolder} is called ${wanted}.` }
  }
  if (matches.length > 1) {
    return { refused: `${JSON.stringify(name)} matches ${matches.length} files, and a name must mean one: ${matches.join(', ')}. Give its path.` }
  }
  return { file: matches[0] }
}

// ============================================================================ what to run

/** Each file to run, by its absolute path, with the first name that asked for it. */
const files = new Map()
const namedTwice = []

function take(name, result, whose) {
  if ('refused' in result) {
    refused.push(whose === null ? result.refused : `The ${whose} list named ${JSON.stringify(name)}, and it was refused: ${result.refused}`)
  } else if (files.has(result.file)) namedTwice.push(result.file)
  else files.set(result.file, name)
}

for (const name of names) take(name, resolveName(name, [process.cwd(), root]), null)

const relatedList = lists.includes('related')
if (atMostHalf && (!relatedList || !print)) {
  console.error(halfWords('halfNeedsPrint'))
  process.exit(2)
}
// --list related always runs the whole-tree list with it: the files that read the whole tree are the ones its graph
// cannot follow (tools/related-tests.mjs, WHAT IT CANNOT SEE).
if (relatedList && !lists.includes('whole-tree')) lists.splice(lists.indexOf('related'), 0, 'whole-tree')
const wholeTreeList = lists.includes('whole-tree')
const partListName = relatedList ? 'related' : wholeTreeList ? 'whole-tree' : null
const hasParts = partListName !== null
if (base !== undefined && !relatedList) refused.push('--base names where --list related works from, and --list related was not asked for.')
if (part !== null && !hasParts) refused.push('--part picks one part of --list related or --list whole-tree, and neither list was asked for.')
if (slowerThan !== null && !relatedList) refused.push('--leave-out-slower-than bounds the files of --list related, and --list related was not asked for.')

const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
for (const which of lists.filter((list) => list !== 'related')) {
  const ran = spawnSync(process.execPath, ['--import', tsx, join(testsFolder, 'the-test-lists.ts'), which], {
    cwd: root,
    env: childEnvironment(),
    encoding: 'utf8',
  })
  if (ran.error !== undefined || ran.status !== 0) {
    const how = ran.error !== undefined ? `could not be started (${ran.error.message})` : ran.status === null ? `was ended by ${String(ran.signal)}` : `exited ${ran.status}`
    refused.push(`The script for the ${which} list ${how}, so nothing ran. It said: ${`${ran.stdout}${ran.stderr}`.trim() || 'nothing'}`)
    continue
  }
  const lines = ran.stdout.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) refused.push(`The ${which} list printed no file, so nothing ran.`)
  for (const line of lines) take(line, resolveName(line, [root]), which)
}

/** What --list related found and left out, said before the run. */
const relatedSays = []
/** What the whole-tree list found and how its parts are kept. */
const wholeTreeSays = []
/** The range --list related worked from, which names the file its parts are kept in. */
let relatedRange = ''
/** What --list related found, for the sentence that counts the files that run, said once the slow ones are left out. */
let relatedCounted = null
if (relatedList) await takeTheRelatedList()

/**
 * --list related: the test files the change from the merge-base with origin/main to HEAD can break, worked out by
 * tools/related-tests.mjs, with the whole-tree list. Refused when they would be every test file, or more than a
 * quarter of them (THE_MOST_A_RELATED_LIST_RUNS).
 */
async function takeTheRelatedList() {
  const before = files.size
  /** What takeAndCheck worked out after the first walk. */
  let taken
  /**
   * TAKES THE RELATED FILES AND CHECKS THE BOUND after the first walk of tools/related-tests.mjs, which asks it before
   * the second. A refused list runs nothing, so the second walk, which only counts the files that reach the change
   * through a door, is not made (question HPXHSI_b_Tqq).
   */
  const takeAndCheck = ({ change, every, related }) => {
    const timing = [...related.keys()].filter((test) => TIMING_TESTS.some((one) => one.file === test))
    for (const test of [...related.keys()].sort()) {
      if (timing.includes(test)) continue
      const result = resolveName(test, [root])
      // A file on the whole-tree list as well runs once, counted in what is said below rather than named here.
      if (!('file' in result && files.has(result.file))) take(test, result, 'related')
    }
    const all = files.size
    const most = atMostHalf ? Math.floor(every.length / 2) : THE_MOST_A_RELATED_LIST_RUNS(every.length)
    if (atMostHalf) halfFacts = { related: all, every: every.length, leftOutSlow: [] }
    const range = `${change.base.slice(0, 12)}..${change.tip.slice(0, 12)}`
    let refusal = null
    if (atMostHalf && related.size === every.length) {
      halfBoundRefused = true
      refusal = halfWords('halfEvery', { range, related: all, every: every.length })
    } else if (atMostHalf && all > most) {
      halfBoundRefused = true
      refusal = halfWords('halfOver', { range, related: all, every: every.length, most })
    } else if (!atMostHalf && related.size === every.length) {
      // Only the merge queue runs the whole suite.
      refusal = `The change ${range} reaches every one of the ${every.length} test files, so --list related would be the whole suite, which only the merge queue may run. Name the files you know it touches, with --list whole-tree.`
    } else if (!atMostHalf && all > most) {
      refusal = `The change ${range} reaches ${related.size} test files, ${all} with the whole-tree list, and --list related runs at most a quarter of the ${every.length} test files (${most}). Name the files you know it touches, with --list whole-tree; the merge queue runs the rest.`
    }
    taken = { timing, all, range, refusal }
    return refusal !== null
  }
  let found
  try {
    const { theTestsAChangeCanBreak } = await import('./related-tests.mjs')
    found = theTestsAChangeCanBreak(root, base, takeAndCheck)
  } catch (error) {
    refused.push(`The related list could not be worked out, so nothing ran: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const { change, related, throughTheDoors } = found
  const { timing, range, refusal } = taken
  // A COUNT THAT WAS NOT MADE IS NOT SAID: a refused list says the files through a door were not counted.
  if (refusal !== null) {
    refused.push(throughTheDoors === null ? `${refusal} The test files that reach the change only by starting the whole server or building the whole page were not counted, because the list is refused.` : refusal)
  }
  relatedRange = range
  relatedCounted = { range, paths: change.paths.length, reaches: related.size, added: [...files.keys()].slice(before) }
  if (throughTheDoors !== null && throughTheDoors.length > 0) relatedSays.push(`--list related: ${throughTheDoors.length} more reach the change only by starting the whole server or building the whole page, and are not run (THE_DOORS_OF_THE_WHOLE_APP in tools/related-tests.mjs).`)
  if (timing.length > 0) relatedSays.push(`--list related: ${timing.length} of them run only in the timing group and are left to it: ${timing.join(', ')}.`)
}

/** Whether a program of this name is a file in one of the PATH folders. The window list runs only on Linux. */
function isOnThePath(program) {
  return (process.env.PATH ?? '').split(':').some((folder) => folder !== '' && existsSync(join(folder, program)))
}

const underAVirtualDisplay = lists.includes('window')
if (underAVirtualDisplay) {
  for (const program of THE_VIRTUAL_DISPLAY_COMMAND.filter((word) => !word.startsWith('-'))) {
    if (!isOnThePath(program)) {
      refused.push(`--list window runs the window tests inside ${WINDOW_DISPLAY_VALUE}, and ${program} is not on this machine's PATH, so nothing ran.`)
    }
  }
}

const timingGroup = lists.includes('timing')
if (timingGroup && (names.length !== 0 || lists.length !== 1)) refused.push(`The timing group runs alone. Use ${TIMING_COMMAND}, without another name or list.`)
if (!timingGroup) {
  for (const file of files.keys()) {
    if (TIMING_TESTS.some((one) => one.file === relative(root, file))) refused.push(`${relative(root, file)} runs only in the timing group. Use ${TIMING_COMMAND}.`)
  }
}
const readingFixture = process.env[TIMING_READING_FIXTURE_VARIABLE]
if (readingFixture !== undefined && (root === THIS_CHECKOUT || vitestEntry === join(THIS_CHECKOUT, 'node_modules', 'vitest', 'vitest.mjs'))) refused.push('A stand-in machine reading is only allowed with both --root and --vitest test stand-ins. Nothing ran.')

if (names.length === 0 && lists.length === 0) {
  // Only the merge queue runs the whole suite.
  refused.push('No test file was named. vitest with no file runs the whole suite, which only the merge queue may run.')
}

if (refused.length > 0) {
  printHalfFacts()
  console.error(`run-named-tests refused ${refused.length === 1 ? 'one thing' : `${refused.length} things`}, and ran nothing:`)
  for (const sentence of refused) console.error(`  - ${sentence}`)
  process.exit(halfBoundRefused && refused.length === 1 ? 3 : 2)
}

const twice = namedTwice.length === 0 ? '' : ` ${namedTwice.length} named more than once ${namedTwice.length === 1 ? 'is' : 'are'} run once: ${namedTwice.join(', ')}.`

/**
 * THE PARTS. --list related and --list whole-tree run their files in parts of at most SECONDS_IN_ONE_PART, in the
 * order of their paths, each part its own vitest with its own report and its own count; --part <n> runs only part n.
 * Anything else is one part. A related list is kept by range; a whole-tree list is kept by the hash of its ordered
 * files. Each part that runs writes new times, and later parts stay the same on the next call.
 */
/**
 * THE SLOW FILES LEFT OUT, with --leave-out-slower-than. A file whose longest recorded time is over the bound is not
 * run here; whoever asked runs it elsewhere (the merge tool, in the whole suite). Counted after the quarter bound, so
 * the bound never lets a list through that would be refused without it. A file with no recorded time stays, and how
 * many had none is said, so "nothing was left out" is never a guess from a missing record.
 */
let slowLeftOut = 0
if (slowerThan !== null) {
  const longest = theLongestTimes()
  const slow = []
  let noTime = 0
  for (const file of [...files.keys()]) {
    const took = longest.get(relative(root, file))
    if (took === undefined) noTime += 1
    else if (took > slowerThan) {
      slow.push(`${relative(root, file)} (${Math.round(took)} s)`)
      if (atMostHalf) halfFacts.leftOutSlow.push({ file: relative(root, file), seconds: took })
      files.delete(file)
    }
  }
  slowLeftOut = slow.length
  relatedSays.push(
    `--list related: ${slow.length} file${slow.length === 1 ? '' : 's'} left out, whose longest recorded time is over ${slowerThan} s${slow.length === 0 ? '' : `: ${slow.join(', ')}`}. ` +
      `${noTime} of the ${slow.length + files.size} had no recorded time in ${longest.size === 0 ? 'any report, because none was found' : `the reports read (times for ${longest.size} files)`}, and stay.`,
  )
  if (files.size === 0) {
    printHalfFacts()
    console.error(`run-named-tests refused one thing, and ran nothing:\n  - --leave-out-slower-than ${slowerThan} left out every file of --list related.`)
    process.exit(2)
  }
}

/**
 * THE COUNT OF --list related IS SAID AFTER THE SLOW FILES ARE LEFT OUT, so it counts the files that run, and it says how
 * many were left out. Said before, it gave "2 files run" where 1 ran (13u round 67's drill, report wCw2SUcedwab). It
 * comes first among the sentences of --list related. RELATED_TESTS_FACTS keeps its counts from before the cut.
 */
if (relatedCounted !== null) {
  const { range, paths, reaches, added } = relatedCounted
  const notOnTheWholeTreeList = added.filter((file) => files.has(file)).length
  const leftOut = slowLeftOut === 0 ? '' : `, once ${slowLeftOut} slow file${slowLeftOut === 1 ? ' is' : 's are'} left out`
  relatedSays.unshift(`--list related: the change ${range} names ${paths} paths and reaches ${reaches} test files; with the whole-tree list ${files.size} files run (${notOnTheWholeTreeList} of them not on the whole-tree list)${leftOut}.`)
}

printHalfFacts()
const everyFile = [...files.keys()]
let parts = []
if (hasParts) {
  const ordered = everyFile.map((file) => relative(root, file)).sort()
  const wholeTreeHash = createHash('sha256').update(JSON.stringify(ordered)).digest('hex')
  const kept = join(root, '.logs', relatedList ? `related-parts-${relatedRange}.json` : `whole-tree-parts-${wholeTreeHash}.json`)
  const saved = workOutParts(ordered, kept)
  parts = saved.parts
  const says = relatedList ? relatedSays : wholeTreeSays
  const listName = relatedList ? 'related' : 'whole-tree'
  if (saved.reused) {
    says.push(`--list ${listName}: the parts are the ones worked out at ${saved.at}, kept in ${relative(root, kept)}.`)
  } else {
    says.push(`--list ${listName}: ${parts.length} parts of at most ${SECONDS_IN_ONE_PART} s, counting the longest time each file has taken and ${SECONDS_TO_START_A_FILE} s to load it, kept in ${relative(root, kept)}.`)
  }
  parts = parts.map((one) => one.map((file) => join(root, file)))
} else parts.push(everyFile)
function workOutParts(ordered, kept) {
  const before = existsSync(kept) ? JSON.parse(readFileSync(kept, 'utf8')) : null
  const packedBy = { SECONDS_IN_ONE_PART, SECONDS_FOR_A_FILE_WITH_NO_TIME, SECONDS_TO_START_A_FILE, SECONDS_TO_START_A_PART }
  if (before !== null && JSON.stringify(before.files) === JSON.stringify(ordered) && JSON.stringify(before.packedBy) === JSON.stringify(packedBy)) {
    return { parts: before.parts, at: before.at, reused: true }
  }
  const longest = theLongestTimes()
  const packed = []
  let seconds = 0
  for (const file of ordered) {
    const took = (longest.get(file) ?? SECONDS_FOR_A_FILE_WITH_NO_TIME) + SECONDS_TO_START_A_FILE
    if (packed.length === 0 || seconds + took > SECONDS_IN_ONE_PART) {
      packed.push([])
      seconds = SECONDS_TO_START_A_PART
    }
    packed.at(-1).push(file)
    seconds += took
  }
  const at = localStamp(new Date())
  mkdirSync(dirname(kept), { recursive: true })
  writeFileSync(kept, JSON.stringify({ at, packedBy, files: ordered, parts: packed }, null, 2))
  return { parts: packed, at, reused: false }
}
if (part !== null && part > parts.length) {
  console.error(`run-named-tests refused one thing, and ran nothing:\n  - --part ${part} asks for a part that is not there: --list ${partListName} has ${parts.length} part${parts.length === 1 ? '' : 's'}.`)
  process.exit(2)
}

/**
 * The longest time each test file has taken, by its path in the checkout, from the reports under .logs here and in the
 * checkout this tool is in, and from every vitest JSON report in a --times folder and the folders one level under it.
 */
function theLongestTimes() {
  const reports = []
  for (const folder of new Set([join(root, '.logs'), join(THIS_CHECKOUT, '.logs')])) {
    if (!existsSync(folder)) continue
    for (const name of readdirSync(folder).filter((one) => /^named-tests-.*\.json$/.test(one))) reports.push(join(folder, name))
  }
  for (const folder of timesFrom) {
    if (!existsSync(folder)) continue
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.json')) reports.push(join(folder, entry.name))
      else if (entry.isDirectory()) {
        for (const name of readdirSync(join(folder, entry.name)).filter((one) => one.endsWith('.json'))) reports.push(join(folder, entry.name, name))
      }
    }
  }
  const longest = new Map()
  for (const path of reports) {
    let report
    try {
      report = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      continue // a report cut off mid-write has no times to give
    }
    if (!Array.isArray(report?.testResults)) continue // a file that is not a vitest report
    for (const result of report.testResults) {
      const file = result.name.replace(/^.*?\/tests\//, 'tests/')
      const took = (result.endTime - result.startTime) / 1000
      if (Number.isFinite(took) && took > (longest.get(file) ?? 0)) longest.set(file, took)
    }
  }
  return longest
}
const partsToRun = part === null ? parts.map((files, i) => ({ number: i + 1, files })) : [{ number: part, files: parts[part - 1] }]

if (print) {
  for (const one of partsToRun) for (const file of one.files) console.log(file)
  for (const sentence of [...relatedSays, ...wholeTreeSays]) console.error(sentence)
  if (hasParts) console.error(`--list ${partListName}: ${part === null ? 'every part' : `part ${part} of ${parts.length}`}, ${partsToRun.reduce((sum, one) => sum + one.files.length, 0)} files.`)
  if (twice !== '') console.error(twice.trim())
  // Pipe writes may still be queued. Wait for both streams before ending the print-only process.
  await Promise.all([process.stdout, process.stderr].map((stream) => new Promise((resolve, reject) => {
    stream.write('', (error) => error ? reject(error) : resolve())
  })))
  process.exit(0)
}

// ============================================================================ the run

// REGISTERED BEFORE THE TESTS START, and after every refusal and --print, which end at once. A caller that still passes
// --background is told once that the flag no longer changes anything; the row is written either way.
if (background) console.log(THE_BACKGROUND_FLAG_IS_STILL_TAKEN)
const ownRow = await theToolsOwnRow(theOfficeInThisEnvironment())
let seat
theStarter.whenTheStarterEnds(async () => {
  seat?.giveBack(THE_STARTER_ENDED)
  await ownRow.release()
})
mkdirSync(join(root, '.logs'), { recursive: true })
for (const sentence of [...relatedSays, ...wholeTreeSays]) console.log(sentence)
if (underAVirtualDisplay) console.log(`run-named-tests: the window list asked for a virtual display, so vitest runs inside ${WINDOW_DISPLAY_VALUE}.`)

/** The files this call runs, in the order they were named, once each. A --part run names only its part's files. */
const theFilesThisRun = partsToRun.flatMap((one) => one.files)
// A TEST-BATCHES SEAT before the first file, given back after the last and on every way the tool ends (tools/test-batch-seat.mjs).
// Inside a sandbox it is held by the row just written for this process.
try {
  seat = await aTestBatchSeat(theOfficeInThisEnvironment(), `node tools/run-named-tests.mjs: ${theFilesThisRun.map((file) => relative(root, file)).join(' ')}`, undefined, { row: ownRow.row })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  await ownRow.end(1)
}
// THE TSC LOCK, SHARED, once the seat is granted and before the first part (tools/the-tsc-lock.mjs). A lock that cannot
// be taken ends the tool here, and the seat's own exit listener gives the seat back.
let tscLock
try {
  tscLock = await theTscLockShared()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  await ownRow.end(1)
}
const hashesBefore = theTestFileHashes(theFilesThisRun)
const treeBefore = aTreeRead()

/** Named by the moment and eight random hex characters, so two timing runs started in the same millisecond keep two files. */
const timingResult = join(root, '.logs', `timing-${fileNameStamp(new Date())}-${randomBytes(4).toString('hex')}.json`)
let machineBefore
if (timingGroup) {
  machineBefore = timingMachineReading(readingFixture)
  writeFileSync(timingResult, JSON.stringify({ at: localStamp(new Date()), machineBefore, machineAfter: null, quiet: null, measurementSource: readingFixture === undefined ? 'this machine' : 'test stand-in', status: 'running' }, null, 2))
  console.log(`Timing results: ${timingResult}.`)
}
const runEnvironment = childEnvironment()
// A BATCH THAT HOLDS THE LOCK NAMES ITSELF to its test files, so a tool one of them starts takes no second hold. When a
// batch above holds it, the variable is in the environment already and is passed on as it is.
if (tscLock.held === HOW_THE_TSC_LOCK_IS_HELD.takenHere || tscLock.held === HOW_THE_TSC_LOCK_IS_HELD.handedIn) runEnvironment[TSC_LOCK_HELD_BY_VARIABLE] = String(process.pid)
const namesKeptFromEveryChild = theNamesKeptFromEveryChild()
if (namesKeptFromEveryChild.length > 0) console.log(`${THE_NAMES_CLEARED} ${namesKeptFromEveryChild.join(', ')}`)
if (timingGroup) {
  runEnvironment[TIMING_GROUP_VARIABLE] = TIMING_GROUP_VALUE
  runEnvironment[TIMING_RESULTS_VARIABLE] = timingResult
}
if (underAVirtualDisplay) runEnvironment[WINDOW_DISPLAY_VARIABLE] = WINDOW_DISPLAY_VALUE

/** The files the part being run named, for the count after it. */
let named = []
let report = ''
const outcomes = []
/** The signal that ended vitest, when one did; the seat is given back under its name. */
let theSignalThatEndedVitest = null
for (const one of partsToRun) {
  named = one.files
  // A NAME OF ITS OWN FOR EACH RUN'S REPORT: the moment the part starts, then eight random hex characters, so two runs
  // started in the same millisecond write two reports (item 2b of wave 13n; the moment alone let the second write over
  // the first). The name still starts named-tests-<moment>, so it sorts by time and /^named-tests-.*\.json$/ finds it.
  report = join(root, '.logs', `named-tests-${fileNameStamp(new Date())}-${randomBytes(4).toString('hex')}${hasParts ? `-part-${one.number}` : ''}.json`)
  const shown = named.length <= 10 ? `: ${named.map((file) => relative(root, file)).join(', ')}` : ''
  const which = hasParts ? `part ${one.number} of ${parts.length}: ` : ''
  console.log(`run-named-tests: ${which}running ${named.length} test file${named.length === 1 ? '' : 's'}, one at a time${shown}.${twice}`)
  const { code, signal } = await runVitest(named, report)
  if (code === null && signal !== null) theSignalThatEndedVitest = signal
  if (code === -1) await ownRow.end(1)
  const vitestSaid = code === null ? `vitest was ended by ${String(signal)}` : `vitest exited ${code}`
  outcomes.push({ number: one.number, counted: theCount(code, vitestSaid), vitestSaid, results: theResultsIn(named, report) })
}
tscLock.letGo()
seat.giveBack(theSignalThatEndedVitest === null ? THE_BATCH_ENDED : stoppedBy(theSignalThatEndedVitest))

const failed = outcomes.filter((one) => one.counted.code !== 0)
const lastSaid = outcomes.length === 1 ? outcomes[0].vitestSaid : failed.length === 0 ? `vitest exited 0 in each of ${outcomes.length} parts` : `parts ${failed.map((one) => one.number).join(', ')} of ${parts.length} failed`
const ranSays = outcomes.length === 1 ? outcomes[0].counted.ranSays : `${outcomes.length} parts, ${outcomes.filter((one) => one.counted.filesMatch).length} counted exactly`
if (outcomes.length > 1) console.log(`run-named-tests: ${outcomes.length} parts ran; ${failed.length === 0 ? 'each passed and ran exactly its files' : `parts ${failed.map((one) => one.number).join(', ')} failed`}.`)
named = partsToRun.flatMap((one) => one.files)
const hashesAfter = theTestFileHashes(theFilesThisRun)
const treeAfter = aTreeRead()
let treeForTheUse = { commit: null, change: null }
if (treeBefore !== null && treeAfter !== null) {
  if (treeBefore.commit !== treeAfter.commit || treeBefore.change !== treeAfter.change) {
    console.log('run-named-tests: the tree changed while the tests ran, so its commit and its change are sent as not known.')
  } else {
    treeForTheUse = treeAfter
  }
}
const resultsByFile = new Map()
for (const one of outcomes) for (const [file, result] of one.results) resultsByFile.set(file, result)
const theFilesForTheUse = theFilesThisRun.map((file) => {
  const found = resultsByFile.get(file)
  const hashBefore = hashesBefore.get(file)
  return {
    file: relative(root, file).split(sep).join('/'),
    result: found?.result ?? NO_RESULT,
    seconds: found?.seconds ?? null,
    testFileHash: hashBefore !== null && hashBefore === hashesAfter.get(file) ? hashBefore : null,
  }
})
await writeTheUseLine(ranSays, lastSaid, theFilesForTheUse, treeForTheUse)
let resultCode = failed.length === 0 ? 0 : failed[0].counted.code
if (timingGroup) {
  const counted = outcomes[0].counted
  const machineAfter = timingMachineReading(readingFixture)
  const quiet = isQuietForTiming(machineBefore) && isQuietForTiming(machineAfter)
  let rawResults
  let measurements
  try {
    rawResults = readFileSync(timingResult, 'utf8')
    measurements = JSON.parse(rawResults)
  } catch (error) {
    if (rawResults !== undefined) writeFileSync(`${timingResult}.unreadable`, rawResults)
    writeFileSync(timingResult, JSON.stringify({ machineBefore, machineAfter, quiet, vitestExitCode: counted.code, status: 'results unreadable', because: error.message }, null, 2))
    console.error(`Timing results could not be read: ${error.message}. Results: ${timingResult}.`)
    await ownRow.end(counted.code === 0 ? 1 : counted.code)
  }
  const status = !counted.filesMatch ? 'run incomplete' : !quiet ? 'unqualified: machine busy' : counted.code === 0 ? 'passed' : 'failed'
  writeFileSync(timingResult, JSON.stringify({ ...measurements, machineBefore, machineAfter, quiet, vitestExitCode: counted.code, status }, null, 2))
  if (!quiet && counted.filesMatch) {
    console.error(`Timing run is unqualified: machine load was ${machineBefore.load1} before and ${machineAfter.load1} after; quiet means at most a quarter of ${machineBefore.cores} cores. Results: ${timingResult}.`)
    resultCode = 3
  }
}
await ownRow.end(resultCode)

/** One vitest through tools/q.mjs over these files. Answers its exit code and signal, or code -1 when it could not start. */
function runVitest(these, reportPath) {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [
        join(THIS_CHECKOUT, 'tools', 'q.mjs'),
        '--label',
        'named-tests',
        ...(underAVirtualDisplay ? THE_VIRTUAL_DISPLAY_COMMAND : []),
        process.execPath,
        vitestEntry,
        'run',
        '--no-file-parallelism',
        '--reporter=default',
        '--reporter=json',
        `--outputFile.json=${reportPath}`,
        ...these,
      ],
      { cwd: root, env: runEnvironment, stdio: 'inherit' },
    )
    child.on('error', (error) => {
      console.error(`run-named-tests could not start tools/q.mjs: ${error.message}. Nothing ran.`)
      done({ code: -1, signal: null })
    })
    child.on('close', (code, signal) => done({ code, signal }))
  })
}

/**
 * THE CHECK AFTER THE RUN: which files ran, compared with the files named. Prints what it found, and answers the exit
 * code with a few words on what ran, for the use line.
 */
function theCount(code, vitestSaid) {
  const failWith = code === null || code === 0 ? 1 : code
  if (!existsSync(report)) {
    console.log(`FAILED  ${vitestSaid} and wrote no report at ${report}, so nothing says which files ran.`)
    return { code: failWith, filesMatch: false, ranSays: 'no report says which ran' }
  }
  let ran
  try {
    ran = JSON.parse(readFileSync(report, 'utf8')).testResults.map((result) => result.name)
  } catch (error) {
    console.log(`FAILED  ${vitestSaid}, and its report ${report} could not be read: ${error.message}. Nothing says which files ran.`)
    return { code: failWith, filesMatch: false, ranSays: 'its report could not be read' }
  }
  const added = [...new Set(ran)].filter((file) => !named.includes(file))
  const missing = named.filter((file) => !ran.includes(file))
  if (added.length > 0 || missing.length > 0) {
    console.log(`FAILED  The files that ran are not the files named: ${named.length} named, ${new Set(ran).size} ran. ${vitestSaid}.`)
    for (const file of added) console.log(`  added, ran but was not named: ${file}`)
    for (const file of missing) console.log(`  missing, named but did not run: ${file}`)
    console.log(`  [vitest's report: ${report}]`)
    return { code: failWith, filesMatch: false, ranSays: `${new Set(ran).size} ran, not the files named (${added.length} added, ${missing.length} missing)` }
  }
  console.log(`Counted: ${named.length} file${named.length === 1 ? '' : 's'} named, and exactly those ran. ${vitestSaid}. [vitest's report: ${report}]`)
  // A RUN ENDED BY A SIGNAL HAS NO EXIT CODE, and process.exit(null) would exit 0: a stopped run would read as a
  // pass. It fails instead, whatever its report says, because nobody can tell whether its tests finished.
  if (code === null) {
    console.log(`FAILED  ${vitestSaid}, so this run is not a pass, although its report names exactly the files named.`)
    return { code: 1, filesMatch: false, ranSays: `${new Set(ran).size} ran, exactly those, but the run was ended by a signal` }
  }
  return { code, filesMatch: true, ranSays: `${new Set(ran).size} ran, exactly those` }
}

/**
 * EACH FILE'S RESULT AND SECONDS, from the JSON report of the part it ran in, by its absolute path. The item whose
 * `name` is that path gives `passed` or `failed`; any other status, no item, or a report that cannot be read gives
 * `no result`. vitest's times leave out the time it took to load the file: the seconds are its own start and end,
 * rounded to the millisecond, and null when either is not a finite number or the end is before the start.
 */
function theResultsIn(these, reportPath) {
  const found = new Map()
  let items = []
  try {
    const read = JSON.parse(readFileSync(reportPath, 'utf8'))
    if (Array.isArray(read?.testResults)) items = read.testResults
  } catch {
    // No readable report: every file is no result.
  }
  for (const file of these) {
    const item = items.find((one) => one?.name === file)
    const result = item?.status === PASSED ? PASSED : item?.status === FAILED ? FAILED : NO_RESULT
    const timed = item !== undefined && Number.isFinite(item.startTime) && Number.isFinite(item.endTime) && item.endTime >= item.startTime
    found.set(file, { result, seconds: timed ? Math.round(item.endTime - item.startTime) / 1000 : null })
  }
  return found
}

/** THE FIRST TEST_HASH_CHARACTERS OF EACH FILE'S SHA-256, or null where its bytes cannot be read. */
function theTestFileHashes(these) {
  const hashes = new Map()
  for (const file of these) {
    try {
      hashes.set(file, createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, TEST_HASH_CHARACTERS))
    } catch {
      hashes.set(file, null)
    }
  }
  return hashes
}

/**
 * ONE READ OF THE CHECKOUT'S TREE: its HEAD commit and a hash of what is uncommitted, or null when git fails. The change
 * is a hash over the binary diff from HEAD and then, for each untracked path git does not ignore in path order, a NUL,
 * the path, a NUL and the file's bytes. `.logs` is ignored, so the tool's own reports never change it.
 */
function aTreeRead() {
  const commitBytes = gitBytes(['rev-parse', '--verify', 'HEAD^{commit}'])
  if (commitBytes === null) return null
  const commit = commitBytes.toString('utf8').trim()
  if (!/^[0-9a-f]{40}$/.test(commit)) return null
  const diff = gitBytes(['diff', 'HEAD', '--binary', '--no-ext-diff', '--no-color', '--no-textconv'])
  if (diff === null) return null
  const untrackedBytes = gitBytes(['ls-files', '--others', '--exclude-standard', '-z'])
  if (untrackedBytes === null) return null
  const untracked = untrackedBytes.toString('utf8').split('\0').filter((path) => path !== '').sort()
  if (diff.length === 0 && untracked.length === 0) return { commit, change: NO_UNCOMMITTED_CHANGE }
  const hashing = createHash('sha256')
  hashing.update(diff)
  for (const path of untracked) {
    let bytes
    try {
      bytes = readFileSync(resolve(root, path))
    } catch {
      return null
    }
    hashing.update(Buffer.from([0]))
    hashing.update(Buffer.from(path, 'utf8'))
    hashing.update(Buffer.from([0]))
    hashing.update(bytes)
  }
  return { commit, change: hashing.digest('hex').slice(0, TEST_HASH_CHARACTERS) }
}

/** git in the checkout, with no shell, as the bytes it printed; null when it could not start or failed. */
function gitBytes(args) {
  const ran = spawnSync('git', ['-C', root, ...args], { maxBuffer: GIT_MAX_BUFFER })
  if (ran.error !== undefined || ran.status !== 0) return null
  return ran.stdout
}

/**
 * ONE LINE ON THE CALLING RUN, with the slug named-tests (writeAUseLine in tools/use-line.mjs): the files named, the
 * files that ran and vitest's exit code, in at most TOOL_USE_MOST_CHARACTERS characters, with each named file's result,
 * seconds and hash and the tree the run read beside it. The office and the run are read from this process's own
 * environment. childEnvironment removes them only from the copy each child is given, so they are still here. Whether
 * the line was written, or why not, is printed. The exit code is the run's either way.
 */
async function writeTheUseLine(ranSays, vitestSaid, files, tree) {
  if (files.length > TEST_FILES_IN_A_USE_MOST) {
    console.log(`run-named-tests: ${files.length} test files were named, and one use carries at most ${TEST_FILES_IN_A_USE_MOST}, so the test file results were not sent.`)
    files = undefined
    tree = undefined
  }
  const tail = `; ${ranSays}; ${vitestSaid}`
  const head = `named ${named.length} file${named.length === 1 ? '' : 's'} (`
  const which = [...new Set(names.map((name) => basename(name)))].concat(lists.map((list) => `--list ${list}`))
  const room = TOOL_USE_MOST_CHARACTERS - head.length - tail.length - 1
  // AS MANY NAMES AS FIT, then how many more there are.
  let shown = `${which.length} names`
  for (let i = 0; i < which.length; i += 1) {
    const left = which.length - i - 1
    const these = `${which.slice(0, i + 1).join(', ')}${left > 0 ? `, and ${left} more` : ''}`
    if (these.length > room) break
    shown = these
  }
  const said = `${head}${shown})${tail}`
  const { words } = await writeAUseLine({ tool: THE_TEST_FILES_TOOL, said, files, tree, office: theOfficeInThisEnvironment() })
  console.log(`run-named-tests: ${words}`)
}
