// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN WITH NO NAMED TEST FILE REFUSES TO START, UNLESS THE WHOLE SUITE WAS ASKED FOR BY NAME.
 *
 * `vitest run` with no files runs every test file. Only the merge queue may run the whole suite,
 * because the machine is shared. On 25 September 2026 it was started by
 * mistake three times: twice through tools/q.mjs splitting a quoted `-t` pattern into file filters
 * (problem `Lu7-0gPjXnvJ`), and once from a file list a script built empty.
 *
 * The one way to ask for the whole suite is `npm test`. Its script in package.json sets
 * MOLE_OFFICE_WHOLE_SUITE=yes, and the merge queue runs `npm test -- <its flags>`.
 *
 * vitest.config.ts names this file under `globalSetup`. vitest runs it once, after it has read the
 * file filters from the command line and before it starts any test file. So a refusal here means no
 * test file has started. Reading `filenamePattern` relies on a field vitest 4 marks internal. If a
 * later vitest renames it, every run except `npm test` is refused with the sentence below, so the
 * rename shows itself at once rather than letting an empty list through.
 *
 * The refusal prints the sentence and ends the process with exit code 1, rather than throwing. A
 * throw leaves watch mode (`npm run test:watch`) open, and vitest runs this file only once, so
 * pressing "a" there would then run every file with no check. Watch mode started with named files
 * passes the check once, and a filter changed later inside it is not checked.
 */
import type { TestProject } from 'vitest/node'

export const WHOLE_SUITE_VARIABLE = 'MOLE_OFFICE_WHOLE_SUITE'

export const NO_FILE_NAMED =
  'No test file was named, and vitest with no files runs the whole suite, which only the merge queue may run; to run it on purpose, use npm test, which sets MOLE_OFFICE_WHOLE_SUITE=yes.'

export default function theWholeSuiteIsAskedForByName(project: TestProject): void {
  // `vitest list` collects the names of the cases and runs none of them. In that mode vitest does
  // not keep its file filters where this check reads them, so a named `vitest list <file>` would be
  // refused. It lets the list command through, named or not. A `vitest list` with no file still
  // imports every test file to collect its names, but it starts no test.
  if (process.argv[2] === 'list') return
  const filters = (project.vitest as unknown as { filenamePattern?: string[] }).filenamePattern ?? []
  if (filters.length > 0) return
  if (process.env[WHOLE_SUITE_VARIABLE] === 'yes') return
  console.error(NO_FILE_NAMED)
  process.exit(1)
}
