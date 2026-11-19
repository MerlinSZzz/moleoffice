// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CASE THAT IS TAKEN OUT IS SKIPPED, AND THE REPORT SAYS WHY.
 *
 * tests/taken-out.json lists the single cases the runner skips. vitest.config.ts reads and checks the
 * list once and hands the cases to this file through `provide`. vitest.config.ts names this file
 * under `setupFiles`, so it runs in the process of every test file, before the file is collected.
 *
 * Before each case, the case's file and full name are compared with the list. On a match the case is
 * skipped with `ctx.skip(reason)`, and so is not run. Where vitest's reporter prints the case on a line
 * of its own (the verbose reporter does for every case), it prints the reason in brackets after it.
 * vitest's JSON reporter does not write a skip's reason, but it does write the case's `meta`, so the
 * reason is also put there, under `takenOut`.
 *
 * The full name is vitest's own: the titles of the describes and the case, joined by ' > ', as
 * `vitest list --json` prints it.
 */
import { beforeEach, inject } from 'vitest'

/** One case taken out, as vitest.config.ts hands it over. */
interface ACaseTakenOut {
  /** The test file's absolute path. */
  readonly file: string
  /** The case's full name. */
  readonly case: string
  readonly reason: string
}

declare module 'vitest' {
  export interface ProvidedContext {
    takenOutCases: ACaseTakenOut[]
  }
  interface TaskMeta {
    /** Why this case was taken out, copied from tests/taken-out.json. */
    takenOut?: string
    /**
     * Set when a case was taken out because no file of the owner's content was read. A package build
     * reads this in the JSON report to tell that case apart from one taken out for any other reason.
     */
    takenOutWithoutTheOwnersContent?: boolean
  }
}

const TAKEN_OUT = inject('takenOutCases')
if (!Array.isArray(TAKEN_OUT)) {
  throw new Error(
    'tests/skip-what-is-taken-out.ts was given no list of cases taken out. vitest.config.ts provides ' +
      'it as takenOutCases; without it no case on tests/taken-out.json would be skipped.',
  )
}

const HERE = TAKEN_OUT.filter((entry) => entry.file === expect.getState().testPath)

if (HERE.length > 0) {
  beforeEach((ctx) => {
    const entry = HERE.find((one) => one.case === ctx.task.fullTestName)
    if (entry === undefined) return
    ctx.task.meta.takenOut = entry.reason
    ctx.skip(`taken out: ${entry.reason}`)
  })
}
