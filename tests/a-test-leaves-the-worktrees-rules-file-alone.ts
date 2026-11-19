// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO TEST WRITES THE WORKTREE'S RULES FILE: IT IS READ BEFORE A TEST FILE'S FIRST CASE AND AFTER EACH.
 *
 * vitest.config.ts names this under `setupFiles`, so it runs in the process of every test file, before
 * the file is collected. It reads AGENTS.md at the worktree's root once, with its bytes, and writes the
 * file's start into this run's record. After every case, and once more after the file's last hook, it
 * reads the file again with one stat. When the file changed, the case after which it changed fails, and
 * the failure names every test file that was running in that time. The functions and why each reads
 * what it reads are in tests/the-worktrees-rules-file.ts.
 *
 * After a failure the new reading is the one compared next, so one write fails one case, not every case
 * after it. The check after the last hook runs after the test file's own `afterAll` hooks, so a process
 * a test stops in its `afterAll` is still watched while it stops.
 */

import { afterAll, afterEach, expect, inject } from 'vitest'
import {
  THE_WORKTREES_RULES_FILE,
  howTheRulesFileChanged,
  markTheGuardInstalled,
  readTheRulesFile,
  theTestFilesRunningBetween,
  whatTheGuardSays,
  writeItDown,
} from './the-worktrees-rules-file.ts'

const RECORD = inject('theTestFilesRunning')
if (typeof RECORD !== 'string' || RECORD === '') {
  throw new Error(
    'tests/a-test-leaves-the-worktrees-rules-file-alone.ts was given no folder for the record of which test files ran when. ' +
      'tests/the-test-files-running-are-written-down.ts provides it as theTestFilesRunning from the global setup in vitest.config.ts.',
  )
}
const THIS_FILE = expect.getState().testPath ?? 'a test file vitest did not name'

writeItDown(RECORD, { file: THIS_FILE, pid: process.pid, is: 'start', at: Date.now() })
let last = readTheRulesFile(THE_WORKTREES_RULES_FILE, true)
markTheGuardInstalled(THE_WORKTREES_RULES_FILE)

/** Throws when the rules file changed since the last reading, naming who was running; `after` says when. */
function checkTheRulesFile(after: string): void {
  const now = readTheRulesFile(THE_WORKTREES_RULES_FILE)
  const change = howTheRulesFileChanged(last, now, THE_WORKTREES_RULES_FILE)
  if (change === null) return
  const from = last.at
  last = change.after
  throw new Error(whatTheGuardSays(THE_WORKTREES_RULES_FILE, change.words, after, from, now.at, theTestFilesRunningBetween(RECORD as string, from, now.at)))
}

afterEach((context) => {
  checkTheRulesFile(`during the case "${context.task.fullTestName}" or the hooks before it`)
})

afterAll(() => {
  try {
    checkTheRulesFile('after the last case, while the test file\'s own hooks ran')
  } finally {
    writeItDown(RECORD as string, { file: THIS_FILE, pid: process.pid, is: 'end', at: Date.now() })
  }
})
