// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE MARK EVERY PROCESS THE TEST SUITE STARTS CARRIES, SAID ONCE (problem `mZdrckWiS8hc`).
 *
 * A server that a test starts must not report its world to the office the declaration names
 * (problem `JTdajUUs23_M`). Some tests start their servers with `VITEST` and `VITEST_WORKER_ID`
 * removed, so that those servers behave like ordinary ones. On Linux the server still finds the
 * runner by reading its parents' starting environments in /proc. On a Mac it cannot: Mole Office has
 * no exact way to read another process's environment there, so the walk answers no.
 *
 * So the runner leaves a mark of its own that a server reads in its OWN environment. vitest.config.ts
 * calls `markEveryProcessAsTheSuites` in the runner's process before any worker starts, so every
 * worker carries the mark and every process a test starts with a copy of its environment carries it
 * too. A test that removes `VITEST` removes only that name, and the mark stays.
 *
 * THE NAME DOES NOT BEGIN WITH MOLE_ OR VITEST. Tests that build a person's environment for the
 * window drop every name beginning with those, and the mark must survive that. It is not a setting:
 * nothing a person writes in .env sets it, and src/config/settings.mjs does not declare it.
 *
 * A SERVER STARTED UNDER A TEST WITHOUT THE MARK IS REFUSED, on Linux, where the walk can still see
 * the runner (`whyATestsServerMayNotStart` in src/server/lib/runtime.ts). That is what keeps every
 * test that starts a server carrying the mark, so a Mac is covered by tests that only ever ran on
 * Linux.
 *
 * WHY JAVASCRIPT. vitest.config.ts imports it, and so does the server, so one file serves both.
 */

/** The environment variable. Its value is the process id of the runner that set it. */
export const THE_TEST_MARK = 'A_MOLE_OFFICE_TEST_STARTED_THIS'

/**
 * Put the mark into this process's environment, so every process started after this carries it.
 * Returns nothing to print: the runner already prints its guard's line.
 *
 * @returns {void}
 */
export function markEveryProcessAsTheSuites() {
  process.env[THE_TEST_MARK] ??= String(process.pid)
}

/**
 * Whether an environment carries the mark. An empty value counts as no mark.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function carriesTheTestMark(env = process.env) {
  const value = env[THE_TEST_MARK]
  return value !== undefined && value !== ''
}

/**
 * THE FLAG THAT TIES AN OFFICE'S PROCESSES TO THE TEST RUN THAT STARTED THEM.
 *
 * The service command starts the server, the terminal holder and serve-dev detached, in groups of their own, so that
 * an office outlives the command that started it. Under a test that left them running when the runner was killed:
 * nothing ran its afterAll, and nothing else tied them to the run. So a start that carries the mark hands each process
 * it starts this flag with the mark's process number, and each of them watches that process and ends when it is gone.
 *
 * It is not --stop-with-pid. The server records that process in the service lock as the one that started it, and stop
 * and restart read that record as serve-dev's. This flag is recorded nowhere, so stop and restart are as they were.
 */
export const THE_TEST_RUN_FLAG = '--end-with-the-test-run'

/** How often a process given the flag looks whether the test run is still there, as the server's watch does. */
export const THE_TEST_RUN_WATCH_PERIOD_MS = 1_000

/**
 * A process number written as text: a whole number above zero in plain digits, or null for anything else. The one
 * rule for the flag's value and for the mark's own, so the two cannot come to differ.
 *
 * @param {string | undefined} text
 * @returns {number | null}
 */
export function theProcessNumberIn(text) {
  if (text === undefined || !/^[1-9][0-9]*$/.test(text)) return null
  const pid = Number(text)
  return Number.isSafeInteger(pid) ? pid : null
}

/**
 * THE TEST RUN A PROCESS WAS TOLD TO END WITH, read from its arguments: the process number, or null when the flag is
 * not there. A flag whose value is not a whole number above zero throws, and the value is not quoted.
 *
 * @param {readonly string[]} argv
 * @returns {number | null}
 */
export function theTestRunToEndWith(argv) {
  const given = argv.find((arg) => arg === THE_TEST_RUN_FLAG || arg.startsWith(`${THE_TEST_RUN_FLAG}=`))
  if (given === undefined) return null
  const pid = theProcessNumberIn(given.slice(THE_TEST_RUN_FLAG.length + 1))
  if (pid === null) {
    throw new Error(
      `${THE_TEST_RUN_FLAG} is given without a process number. It takes a whole number above zero: the process of the ` +
        'test run this process ends with.',
    )
  }
  return pid
}
