// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DISK THE STABLE-BOOTSTRAP TESTS USE: EVERY FOLDER ONE MAKES IS REMOVED BY ITS LITERAL PATH IN
 * THE FILE'S OWN AFTER-HOOK, AND THE FIVE ACTUAL-OFFICE FILES RUN ONLY WHEN ASKED.
 *
 * The check of run nYc1GAO2-Dds refused wave 13q's round 9 (0hYvjhCi8ak0) because these files left
 * every folder they made. One run of tests/the-stable-bootstrap-recovers-each-step.test.ts left 82,
 * one run of tests/the-stable-bootstrap-refuses-unsafe-config.test.ts left 23, and each actual-office
 * fixture left a whole office, about 15 GB by the secretary's measure. That is the failure precedent
 * ToxCUBqVhdPI records.
 *
 * A folder is made by tests/a-test-folder.ts, so it carries the suite's name and the time it was
 * made, and it is removed when the process ends however it ends, except by SIGKILL. The file also
 * removes each of its folders in its own after-hook, by the path written down when it was made, so a
 * test that passed, failed or threw leaves nothing for the next test. Nothing is removed by a pattern.
 */
import { tmpdir } from 'node:os'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

/** Where they are made: the temporary folder, unless STABLE_BOOTSTRAP_TEST_OUTPUT names another place. */
export const BOOTSTRAP_TEST_OUTPUT = process.env.STABLE_BOOTSTRAP_TEST_OUTPUT ?? tmpdir()

/** One file's folders. `make` writes each path down; the file's after-hook calls `removeEveryOne`. */
export function theFoldersThisFileMakes() {
  const made: string[] = []
  return {
    make(what: string): string {
      const folder = aTestDatabaseFolder(`bootstrap-${what}`, BOOTSTRAP_TEST_OUTPUT)
      made.push(folder)
      return folder
    },
    /** Every folder made since the last removal, by its literal path. */
    made: (): readonly string[] => [...made],
    removeEveryOne(): void {
      for (const folder of made.splice(0)) removeThisTestFolder(folder)
    },
  }
}

/**
 * THE FIVE ACTUAL-OFFICE FILES RUN ONLY WHEN ASKED. Each builds a whole development office and a
 * stable one in a fixture: two npm installs, the built pages, the original artifacts and the database
 * images: about 15 GB by the secretary's measure, and 3.1 to 3.2 GB as each was removed when this fix ran
 * each file once on 17 October 2026. The merge queue runs the whole suite on this machine with up to
 * eight workers, and rule bkC5OcNhinuy allows one such fixture at a time. So without this
 * variable each file skips its case, and tests/stable-bootstrap-actual-office-fixture.ts prints the
 * sentence below. The files are tests/the-stable-bootstrap-actual-office.test.ts,
 * -after-stop, -before-stop, -failed-image-restore and -restores-the-actual-image.
 */
export const ACTUAL_OFFICE_VARIABLE = 'STABLE_BOOTSTRAP_ACTUAL_OFFICE'
export const ACTUAL_OFFICE_SKIPPED = `This actual-office test is skipped unless ${ACTUAL_OFFICE_VARIABLE}=1, because it builds a whole office of several gigabytes in the temporary folder and this machine allows one such fixture at a time.`

/** True only for `1`. Unset is false; any other value is refused, so a typing slip does not skip silently. */
export function askedForTheActualOffice(): boolean {
  const value = process.env[ACTUAL_OFFICE_VARIABLE]
  if (value !== undefined && value !== '1') throw new Error(`${ACTUAL_OFFICE_VARIABLE} is ${JSON.stringify(value)}; it is 1 to run the actual-office tests, or unset to skip them.`)
  return value === '1'
}
