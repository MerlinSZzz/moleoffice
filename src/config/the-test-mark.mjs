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
