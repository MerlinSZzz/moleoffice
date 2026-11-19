// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import { guardEveryTestProcess } from './tools/live-office-ports.mjs'
import { THE_SUITE_WORKERS } from './src/config/the-suite-workers.mjs'
import { TIMING_TESTS, TIMING_GROUP_VARIABLE, TIMING_GROUP_VALUE, TIMING_COMMAND } from './tests/the-timing-tests.ts'
import { markEveryProcessAsTheSuites } from './src/config/the-test-mark.mjs'
import { readSetting } from './src/config/settings.mjs'
import { aPoolThatRetiresAProcessAt, RETIRE_AT_BYTES } from './tests/a-shared-test-process-is-retired-at-a-size.ts'

/**
 * Test runner configuration.
 *
 * The tests exercise src/server/lib/records.ts directly against a real SQLite file, not over
 * HTTP. That means no server has to be running, and a failure points at the function that
 * broke rather than at a route.
 *
 * "Pool" is the test runner's word for how it runs test files in parallel. `forks` means one
 * operating-system process per file, rather than threads sharing one process. That matters
 * here because better-sqlite3 is a compiled C module holding an open file handle; giving each
 * file its own process guarantees each one gets its own database with nothing shared.
 */
/**
 * THE TESTS THAT ARE TAKEN OUT, AND WHY. tests/taken-out.json lists the test files and the single
 * cases that the runner skips, each with its reason, its cost, what still proves the same thing,
 * and the record that decided it, on 25 September 2026. A test on
 * the list is not deleted. Taking its entry off the list brings it back.
 *
 * The list is read and checked here, once, when the runner loads this file. A list that cannot be
 * read, or an entry that is not whole, stops the run with a sentence naming the entry. A missing
 * list stops it too: an empty list is written `[]`, so a missing file is never read as "nothing is
 * taken out".
 *
 * A file named whole goes into `exclude`. A single case is skipped by
 * tests/skip-what-is-taken-out.ts, which reads the checked cases through `provide`.
 */

/** One entry of the list, after it was checked. */
export interface TakenOut {
  /** The test file, relative to the checkout, e.g. `tests/x.test.ts`. */
  readonly file: string
  /** The case's full name as vitest lists it (describe titles and the case title joined by ' > '), or absent for the whole file. */
  readonly case?: string
  readonly reason: string
  readonly cost: string
  readonly provedInstead: string
  readonly decidedBy: string
  readonly since: string
}

/** The fields every entry must have, each a non-empty string. `case` is the one optional field. */
export const THE_REQUIRED_FIELDS = ['file', 'reason', 'cost', 'provedInstead', 'decidedBy', 'since'] as const

/**
 * The environment variable that points the runner at another list. Only
 * tests/a-test-taken-out-says-why.test.ts sets it, to run the runner on a list of its own. The
 * files such a list names are relative to the folder above the one that holds the list, as
 * tests/taken-out.json's are relative to the checkout.
 */
export const A_TESTS_OWN_LIST = 'TAKEN_OUT_LIST_OF_A_TEST'

/** The folder the list's file paths are relative to: the folder above the list's own folder. */
export function theFolderTheListNamesFilesFrom(listPath: string): string {
  return dirname(dirname(resolve(listPath)))
}

/**
 * Every problem with a list that has been parsed from JSON, one sentence each, naming the entry.
 * An empty answer means the list is whole. `root` is the folder the entries' files are relative to.
 */
export function whatIsWrongWithTheTakenOutList(list: unknown, root: string): string[] {
  if (!Array.isArray(list)) return ['The list is not a JSON array. An empty list is written [].']
  const problems: string[] = []
  const known = new Set<string>([...THE_REQUIRED_FIELDS, 'case'])
  list.forEach((entry: unknown, index) => {
    const at = `Entry ${index + 1}`
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      problems.push(`${at} is not an object.`)
      return
    }
    const fields = entry as Record<string, unknown>
    const named = typeof fields.file === 'string' ? `${at} (${fields.file})` : at
    for (const field of THE_REQUIRED_FIELDS) {
      const value = fields[field]
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`${named} has no ${field}. Every entry needs ${THE_REQUIRED_FIELDS.join(', ')}.`)
      }
    }
    // A misspelt "case" would otherwise take the whole file out, so an unknown field is refused.
    for (const field of Object.keys(fields)) {
      if (!known.has(field)) problems.push(`${named} has a field the list does not know: ${field}.`)
    }
    if ('case' in fields && (typeof fields.case !== 'string' || fields.case.trim() === '')) {
      problems.push(`${named} has a case that is empty. Leave case out to take out the whole file.`)
    }
    if (typeof fields.since === 'string' && fields.since !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(fields.since)) {
      problems.push(`${named} has since "${fields.since}", which is not a date written YYYY-MM-DD.`)
    }
    if (typeof fields.file === 'string' && fields.file !== '') {
      const path = resolve(root, fields.file)
      if (isAbsolute(fields.file) || relative(root, path).startsWith('..')) {
        problems.push(`${named} names a file outside the checkout. Write it relative to the checkout, as tests/x.test.ts.`)
      } else if (!existsSync(path) || !statSync(path).isFile()) {
        problems.push(`${named} names a file that does not exist: ${path}.`)
      }
    }
  })
  const wholeFiles = new Set(
    list.filter((entry) => typeof entry?.file === 'string' && !('case' in entry)).map((entry) => entry.file as string),
  )
  list.forEach((entry: unknown, index) => {
    const fields = entry as Record<string, unknown> | null
    if (typeof fields?.file === 'string' && 'case' in fields && wholeFiles.has(fields.file)) {
      problems.push(`Entry ${index + 1} (${fields.file}) takes out one case of a file that another entry takes out whole.`)
    }
  })
  return problems
}

/** Read and check the list at `listPath`. Anything wrong throws, naming the list and each entry. */
export function theTakenOutList(listPath: string): TakenOut[] {
  let list: unknown
  try {
    list = JSON.parse(readFileSync(listPath, 'utf8'))
  } catch (error) {
    throw new Error(`The list of tests taken out, ${listPath}, could not be read as JSON: ${String(error)}`)
  }
  const problems = whatIsWrongWithTheTakenOutList(list, theFolderTheListNamesFilesFrom(listPath))
  if (problems.length > 0) {
    throw new Error(`The list of tests taken out, ${listPath}, is not whole, so no test runs:\n  ${problems.join('\n  ')}`)
  }
  return list as TakenOut[]
}

/** The one line the run prints when anything is taken out, naming each file and case. */
export function whatThisRunLeavesOut(list: readonly TakenOut[], listName: string): string | null {
  if (list.length === 0) return null
  const files = list.filter((entry) => entry.case === undefined).length
  const cases = list.length - files
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
  const names = list.map((entry) => (entry.case === undefined ? entry.file : `${entry.file} > ${entry.case}`))
  return (
    `Taken out of this run and not run: ${count(files, 'test file')} and ${count(cases, 'single case')}. ` +
    `${listName} says why for each: ${names.join('; ')}.`
  )
}

const THE_LIST = process.env[A_TESTS_OWN_LIST] ?? fileURLToPath(new URL('./tests/taken-out.json', import.meta.url))
const TAKEN_OUT = theTakenOutList(THE_LIST)
const THE_LIST_ROOT = theFolderTheListNamesFilesFrom(THE_LIST)
const THE_LIST_NAME = relative(process.cwd(), THE_LIST).startsWith('..') ? THE_LIST : relative(process.cwd(), THE_LIST)
const LEAVES_OUT = whatThisRunLeavesOut(TAKEN_OUT, THE_LIST_NAME)
if (LEAVES_OUT !== null) console.warn(LEAVES_OUT)

/**
 * NO TEST REACHES THE LIVE OFFICE (problem E1SWGJK7wG68). This reads the live office's ports
 * (tools/live-office-ports.mjs), installs tools/live-office-guard.mjs in the runner's own process, and
 * puts the guard and the ports into NODE_OPTIONS and the environment, so vitest's workers and every
 * node process a test starts load it too. The guard refuses a connection to those ports on this
 * machine's own addresses while the four office variables are unset. It is here, and not in the global
 * setup, because every vitest run loads this file first, `vitest list` included, and the workers are
 * started later with this process's environment. The line printed says which ports are guarded and
 * where each came from. A port that cannot be read stops the run here.
 */
console.warn(guardEveryTestProcess())

/**
 * EVERY PROCESS THIS RUN STARTS CARRIES THE SUITE'S MARK (problem `mZdrckWiS8hc`). A server a test
 * starts with `VITEST` removed still finds the mark in its own environment, and so knows it must not
 * report its world to the office, on a Mac as on Linux. src/config/the-test-mark.mjs says why. It is
 * here for the reason the guard above is: the workers are started later with this process's
 * environment.
 */
markEveryProcessAsTheSuites()

const timing = process.env[TIMING_GROUP_VARIABLE]
if (timing !== undefined && timing !== TIMING_GROUP_VALUE) throw new Error(`${TIMING_GROUP_VARIABLE} has an unknown value. Run ${TIMING_COMMAND}.`)
const excludedTiming = timing === TIMING_GROUP_VALUE ? [] : TIMING_TESTS.map((one) => one.file)
for (const file of excludedTiming) console.warn(`${file} runs only in the timing group: ${TIMING_COMMAND}.`)

/**
 * WHETHER TEST FILES SHARE PROCESSES. Off unless this run's environment sets
 * MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS to on: each test file then runs in a process of its own, as it
 * always has. On, a process runs file after file (`isolate: false`) and three files do the rest:
 *   - tests/a-file-in-a-shared-process-starts-clean.ts gives each file the clean start a new process
 *     would give it, and makes a new process wait until enough memory is free;
 *   - tests/a-shared-test-process-is-retired-at-a-size.ts ends a process between files once it holds
 *     RETIRE_AT_BYTES;
 *   - tests/a-test-process-starts-only-while-memory-is-free.ts holds the memory floor.
 * `--expose-gc` lets the clean start collect what the last file left, and ZOD_FOR_EACH_FILE below is
 * loaded again for each file.
 */
const FILES_SHARE_A_PROCESS = readSetting('MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS', process.env).value === 'on'
/**
 * ZOD IS LOADED AGAIN FOR EACH FILE WHEN FILES SHARE A PROCESS. zod keeps the first schema of each
 * kind it builds for as long as it is loaded, and with it everything that schema refers to: a schema
 * the server builds refers to the server's modules, and those to its database. Node loads a package
 * once for the process, so zod kept the first two test files' copies of the server, each about 200
 * MB, for every file after them. The runner loads what is named here itself, and the clean start
 * resets it with the rest of the last file's modules. Only when files share a process: a process of
 * its own ends with its file.
 */
const ZOD_FOR_EACH_FILE = ['zod']
if (FILES_SHARE_A_PROCESS) {
  console.warn(
    `Test files share processes in this run, because MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS is on. ` +
      `A process is retired between files once it holds ${RETIRE_AT_BYTES / 1024 / 1024} MB.`,
  )
}

export default defineConfig({
  resolve: {
    // Same alias the app uses, so records.ts can import '@shared/types.ts' under test.
    alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // A test file taken out whole (tests/taken-out.json) is left out here, beside vitest's own defaults.
    exclude: [...configDefaults.exclude, ...excludedTiming, ...TAKEN_OUT.filter((entry) => entry.case === undefined).map((entry) => entry.file)],
    globals: true,
    pool: FILES_SHARE_A_PROCESS ? aPoolThatRetiresAProcessAt(RETIRE_AT_BYTES) : 'forks',
    isolate: !FILES_SHARE_A_PROCESS,
    ...(FILES_SHARE_A_PROCESS ? { execArgv: ['--expose-gc'] } : {}),
    /**
     * HOW MANY TEST FILES RUN AT ONCE. The number and why it is that number are in
     * src/config/the-suite-workers.mjs, which the merge queue's setting reads too (problem
     * `EQdNjfnfFsXX`), so the two cannot drift.
     */
    maxWorkers: THE_SUITE_WORKERS.plain.count,
    /**
     * HOW LONG ONE TEST MAY TAKE, WHICH IS NOT ONE NUMBER FOR THE WHOLE SUITE.
     *
     * A test that starts a browser or a server gets thirty seconds and its hooks four minutes.
     * Every other test keeps the runner's five-second default, so a pure test that hangs still
     * says so at once. tests/how-long-a-test-may-take.ts holds the rule, the two numbers and what
     * was measured (problem `xi0SpPpDxl6j`). The file named here applies it to each test file just
     * before that file is collected, which is the last moment a budget can still be changed.
     */
    /**
     * FIRST, a plain environment: no test sees an agent's office or identity (findings 34 and 44).
     * SECOND, a home of its own: every test file writes into a fresh directory rather than the home
     * of whoever started the run, and a write under that home fails at the call (problem
     * `hlNgNPM9hGTh`).
     * THIRD, the worktree's rules file is read before a test file's first case and after each, and a
     * case after which it changed fails, naming every test file that was running then (round 15).
     */
    setupFiles: [
      // Only when test files share processes, and before every other setup file: see FILES_SHARE_A_PROCESS.
      ...(FILES_SHARE_A_PROCESS ? ['./tests/a-file-in-a-shared-process-starts-clean.ts'] : []),
      './tests/a-test-sees-no-agents-environment.ts',
      // Whose office a test office is: the person's, through the same two settings their .env carries.
      './tests/every-test-process-is-given-the-test-offices-owner.ts',
      // The models a test office names, because the product ships none, as FLO-05 of a decision
      // says.
      './tests/a-test-office-names-its-models.ts',
      // The test file's path, for the refusal of tools/live-office-guard.mjs to name.
      './tests/a-test-names-its-file.ts',
      './tests/a-test-writes-into-no-home-but-its-own.ts',
      './tests/a-test-leaves-the-worktrees-rules-file-alone.ts',
      './tests/set-how-long-a-test-may-take.ts',
      './tests/skip-what-is-taken-out.ts',
    ],
    // The single cases taken out, for tests/skip-what-is-taken-out.ts, with each file made absolute.
    provide: {
      takenOutCases: TAKEN_OUT.flatMap((entry) =>
        entry.case === undefined ? [] : [{ file: resolve(THE_LIST_ROOT, entry.file), case: entry.case, reason: entry.reason }],
      ),
    },
    /**
     * A run with no named test file refuses to start unless `npm test` asked for the whole
     * suite. The file says why and how. Then the test folders a killed test left
     * behind more than a day ago are swept (problem `lZ7OSjBOhUIO`), in tests/a-test-folder.ts. Last,
     * the folder of this run's record of which test file ran when is made, for the guard of the
     * worktree's rules file. vitest ends these in the reverse order, so a red run copies every startup
     * journal out of that folder before the folder is removed (tests/a-red-run-keeps-every-starts-journal.ts).
     */
    globalSetup: ['./tests/the-whole-suite-is-asked-for-by-name.ts', './tests/the-test-folders-left-behind-are-swept.ts', './tests/the-test-files-running-are-written-down.ts', './tests/a-red-run-keeps-every-starts-journal.ts'],
    /**
     * THE WALK OF THE SOURCE FILES IS DONE ONCE PER TEST FILE, NOT ONCE PER TEST.
     *
     * WHAT THIS DOES. The runner hands src/config/import-graph.mjs to Node's own loader instead of
     * loading it itself. `freshDb()` in tests/helpers.ts calls `vi.resetModules()` before every test.
     * That empties the runner's modules but not Node's, so this one file is loaded once per test
     * process, and its `HELD` walks last as long as the process. Every other file, the server's own
     * included, is still loaded fresh for each test. Unless test files share processes
     * (FILES_SHARE_A_PROCESS above), each test file has a process of its own, so nothing is shared
     * between two test files. When they do, `HELD` lasts across the files of one process as well, and
     * the checks below keep its answer true there too.
     *
     * WHAT IT SAVES. The server works out how new its code is by walking the files it is built from
     * and the files the page is built from, reading each one. `HELD` keeps that walk, and later
     * readings only read the files' modification times. Before this entry, `HELD` started empty for
     * every test, so every test that imported the server walked both trees again.
     *
     * WHY THE ANSWER STAYS TRUE. `HELD` checks the modification time of every file it holds on every
     * reading, and walks again when one is newer than the walk or is missing. It keeps one walk per
     * checkout folder and entry, so a test that works on a copy of the checkout gets a walk of the
     * copy. `forgetTheWalks()` reaches the same `HELD` from every test, because every import of this
     * file goes through Node's loader. Two changes are not noticed until a held file's time moves
     * forward: a file whose imports changed while its time did not, and a missing import target that
     * is made later. The office's own server holds its walk for its whole life and has the same two
     * limits. No test makes either change inside a test process.
     *
     * MEASURED ON 25 SEPTEMBER 2026, in CPU-seconds of the run and every process it
     * waited for, on a shared machine that was busy with other work, before and then after:
     *   tests/by-id-boundary.test.ts alone: 97.2 and 100.6 before, 62.9 and 64.7 after.
     *   the whole-tree list (tests/the-test-lists.ts) at --maxWorkers=2: 695.0 and 640.9 before,
     *   619.9 and 559.7 after.
     */
    server: { deps: { external: [/\/src\/config\/import-graph\.mjs$/], ...(FILES_SHARE_A_PROCESS ? { inline: ZOD_FOR_EACH_FILE } : {}) } },
  },
})
