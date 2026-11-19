// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THIS PROCESS IS A TEST RUNNER'S.
 * `underATestRunner` was moved byte for byte out of src/server/lib/runtime.ts, with no change of behaviour.
 * That file imports it back and re-exports it. It reads `process.env`, so it has a file of its own.
 */

/**
 * Whether this process is a test runner's.
 *
 * Its own function because two callers need it and only one of them can afford to read the process
 * table to get there: `worldNow()` below runs on the way to a header on every reply and reads
 * nothing from the operating system but git. Written twice it would be two ideas of what a test is.
 *
 * VITEST is set by the runner in every worker; VITEST_WORKER_ID is its per-worker companion.
 */
export function underATestRunner(): boolean {
  return process.env['VITEST'] !== undefined || process.env['VITEST_WORKER_ID'] !== undefined
}
