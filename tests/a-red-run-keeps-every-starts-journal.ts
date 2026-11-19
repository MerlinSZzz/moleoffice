// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RED RUN KEEPS THE STARTUP JOURNAL OF EVERY TEST FILE, WHATEVER ENDED IT.
 *
 * vitest.config.ts names this file under `globalSetup`, after the setup that makes the run's folder
 * (tests/the-test-files-running-are-written-down.ts). vitest ends global setups in the reverse order,
 * so this teardown runs while that folder is still there. Each test process journals its startup
 * stages into that folder (tests/a-start-keeps-its-waits.ts). When the run is red, this copies every
 * journal there into the checkout's `.logs/`, where tools/cloud-suite-journals.mjs looks for them.
 *
 * WHY THE SETUP FILE'S COPY WAS NOT ENOUGH. For merge entry 83ZdRSu2aXsX the merge tool kept three of
 * the suite's journals, and none for a stack that gave up at the health stage (2 November 2026).
 * tests/set-how-long-a-test-may-take.ts copies a file's journal from an `afterAll`, and only when a hook
 * of that file failed. A file whose own `afterAll` threw after its `beforeAll` failed (`app.stop()` on an
 * app that never started) skips the hooks after it, that copy among them. A case that failed, and a test
 * process that was killed, are not hook failures at all. On 4 November 2026 the control run of
 * tests/a-red-run-keeps-the-journal-of-every-start.test.ts kept none of those journals. This copy runs in
 * vitest's own process once every test process has ended, so none of those can stop it.
 *
 * A GREEN RUN KEEPS NOTHING, so `.logs/` does not fill with the journals of runs nobody needs to read.
 *
 * IT NEVER CHANGES THE RUN'S RESULT. A green run returns before anything is read. In a red run, a
 * journal it cannot copy is said on the run's output, with its name and why, and the run stays red
 * for its tests' reasons alone. 13n asked for this on 4 November 2026, since every test run ends here.
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'

const ROOT = join(import.meta.dirname, '..')

/** The name tests/a-start-keeps-its-waits.ts gives a journal, as tools/cloud-suite-journals.mjs reads it. */
const A_JOURNAL = /^setup-waits-[0-9a-f]{64}-[0-9]+\.jsonl$/

/**
 * Copies every journal in `from` into `into`. A journal it cannot copy is said on the run's output
 * with its name and why, and the others are still copied. Nothing here throws, so the run's result
 * stays what its tests made it, and the other global setups still end.
 */
export function keepEveryJournal(from: string, into: string, say: (line: string) => void): void {
  let journals: string[]
  try {
    journals = readdirSync(from).filter((name) => A_JOURNAL.test(name))
  } catch (err) {
    say(`A red run could not read its startup journals in ${from}: ${(err as Error).message}`)
    return
  }
  if (journals.length === 0) return
  try {
    mkdirSync(into, { recursive: true })
  } catch (err) {
    say(`A red run could not keep its startup journals in ${into}: ${(err as Error).message}`)
    return
  }
  for (const name of journals) {
    try {
      copyFileSync(join(from, name), join(into, name))
    } catch (err) {
      say(`A red run could not keep the startup journal ${name} in ${into}: ${(err as Error).message}`)
    }
  }
}

export default function aRedRunKeepsEveryStartsJournal(project: TestProject): () => void {
  const say = (line: string): void => {
    process.stderr.write(`${line}\n`)
  }
  return () => {
    const { state } = project.vitest
    const red = state.getFailedFilepaths().length > 0 || state.getCountOfFailedTests() > 0 || state.getUnhandledErrors().length > 0
    if (!red) return
    const folder = project.getProvidedContext().theTestFilesRunning
    if (typeof folder !== 'string' || folder === '') {
      say('A red run could not keep its startup journals: it was given no test-run folder.')
      return
    }
    keepEveryJournal(folder, join(ROOT, '.logs'), say)
  }
}
