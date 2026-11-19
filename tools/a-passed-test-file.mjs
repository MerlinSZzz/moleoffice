// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RULE FOR A PASSED TEST FILE. The merge tool's red files (tools/merge-tool/red-files.mjs), the cloud suite door's
 * runs alone (tools/cloud-suite.mjs) and the scheduled whole suite's receipt (tools/periodic-main-suite.mjs) all read a
 * file of a vitest JSON report by it, so none of them can call a file passed that another calls red. The merge tool and
 * the scheduled whole suite read a vitest worker exit in a run's log by the one rule here too.
 */

import { readFileSync } from 'node:fs'

/**
 * WHETHER ONE FILE OF A VITEST JSON REPORT PASSED: its own status is `passed`, its `assertionResults` is an array, and
 * every test in it ended `passed`, `skipped` or `todo`. Any other status — `pending`, which vitest gives a test that
 * never ran, or a status vitest does not give — means the file did not pass, and so does a file with no list of tests.
 * This is the one place the rule is written; `redFilesIn` and `passedFilesIn` both read a file by it.
 */
export function aPassedFile(one) {
  if (one.status !== 'passed') return false
  if (!Array.isArray(one.assertionResults)) return false
  return one.assertionResults.every((test) => test.status === 'passed' || test.status === 'skipped' || test.status === 'todo')
}

/** Only Vitest's unhandled-error block is evidence of an exit, never a failed assertion quoting those words. */
export function anUnhandledWorkerExitIn(path) {
  const log = readFileSync(path, 'utf8').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  const blocks = log.split(/^⎯+ Unhandled Error ⎯+\s*$/m).slice(1)
  return blocks.some((block) => {
    const error = block.split(/^⎯+.*$/m)[0]
    return /^Error: \[vitest-pool\]: Worker forks emitted error\.\s*$/m.test(error) && /^Caused by: Error: Worker exited unexpectedly\s*$/m.test(error)
  })
}
