// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE WHOSE TEST NEVER RAN IS NOT PASSED.
 *
 * tools/merge-tool/red-files.mjs reads a vitest JSON report. Vitest gives a file the status
 * "passed" when none of its tests failed, even when some of them never ran. A test that never ran,
 * for example because the worker running the file died, has the status "pending". So a file whose
 * worker died with tests never run was read as passed, and it had not passed. This file reads
 * made-up reports through `redFilesIn` and `passedFilesIn` and holds them to the rule: a file is
 * passed only when its own "status" is "passed", its "assertionResults" is an array, and every test
 * in it ended "passed", "skipped" or "todo". Any other status, including "pending" and a status
 * vitest does not give, means the file did not pass, and so does a file with no list of tests.
 *
 * THE REPORTS ARE MADE UP BY THIS TEST and written into a fresh folder under the system's temporary
 * folder, never into a home folder. Each one copies the fields of a real vitest JSON report that
 * these two readers use: the top-level "testResults" array; in each entry the file's "name", its
 * "status" and its "assertionResults"; and in each assertion its "status", one of "passed",
 * "failed", "skipped", "todo" or "pending" as vitest's StatusMap gives it. The report's
 * "numTotalTests", "numPassedTests" and "numFailedTests" are copied too, because `redFilesIn`'s
 * "tests" counts read them.
 *
 * THE MUTATION. Put back "one.status === 'passed'" as the whole rule, so a file is read by its own
 * status alone and its tests are never looked at. Cases 1 and 4 go red, because they are the
 * reading that is wrong: a file with a test that never ran, and a file with no list of tests at
 * all. Cases 2 and 3 stay green, because they read the same under either rule.
 *
 * WHY THIS FILE HANDS THE MERGE TOOL A COMMAND LINE. The merge tool reads its own arguments when it
 * loads, and a test runner's arguments are not the merge tool's, so the import below is made with a
 * made-up command line of the tool's own; the reports, not the command line, are what it reads.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const TREE = mkdtempSync(join(tmpdir(), 'a-file-with-a-test-that-never-ran-'))
afterAll(() => {
  rmSync(TREE, { recursive: true, force: true })
})

const THE_TEST_RUNNERS_ARGV = process.argv
process.argv = [THE_TEST_RUNNERS_ARGV[0]!, THE_TEST_RUNNERS_ARGV[1]!, '--entry', 'a-made-up-entry', '--session', 'a-made-up-session', '--workdir', join(TREE, 'work'), '--api', 'http://127.0.0.1:1']
const { passedFilesIn, redFilesIn } = await import('../tools/merge-tool/red-files.mjs')
process.argv = THE_TEST_RUNNERS_ARGV

/** One assertion of a file, with the status vitest's StatusMap gives it. */
function aTest(status: string) {
  return { fullName: `a made-up test (${status})`, status }
}

/** One entry of a report's "testResults", named by a path under the temporary tree. */
function aFile(name: string, status: string, assertionResults?: ReturnType<typeof aTest>[]) {
  return { name: join(TREE, 'tests', name), status, ...(assertionResults === undefined ? {} : { assertionResults }) }
}

/** A made-up vitest JSON report written under the temporary tree, answered by its path. */
function aReport(name: string, testResults: ReturnType<typeof aFile>[]): string {
  const tests = testResults.flatMap((one) => one.assertionResults ?? [])
  const path = join(TREE, name)
  writeFileSync(
    path,
    JSON.stringify({
      numTotalTests: tests.length,
      numPassedTests: tests.filter((one) => one.status === 'passed').length,
      numFailedTests: tests.filter((one) => one.status === 'failed').length,
      testResults,
    }),
  )
  return path
}

describe('a file that vitest calls passed is passed only when its tests ended', () => {
  it("case 1: a file with a test that never ran is not passed, is in redFilesIn's failed list, and is not in passedFilesIn, nor are its tests", () => {
    const report = aReport('a-file-with-a-pending-test.json', [
      aFile('a-file-with-a-pending-test.test.ts', 'passed', [aTest('passed'), aTest('pending'), aTest('passed')]),
    ])
    const red = redFilesIn(report, TREE)
    const passed = passedFilesIn(report, TREE)
    expect(red?.passed).toBe(0)
    expect(red?.failed).toContain('tests/a-file-with-a-pending-test.test.ts')
    expect(passed?.files).not.toContain('tests/a-file-with-a-pending-test.test.ts')
    expect(passed?.tests).toEqual({ total: 0, passed: 0 })
  })

  it('case 2: a file whose tests passed, were skipped or are todo is passed in both', () => {
    const report = aReport('a-file-in-every-allowed-state.json', [
      aFile('a-file-in-every-allowed-state.test.ts', 'passed', [aTest('passed'), aTest('skipped'), aTest('todo')]),
    ])
    expect(redFilesIn(report, TREE)?.passed).toBe(1)
    expect(redFilesIn(report, TREE)?.failed).toEqual([])
    expect(passedFilesIn(report, TREE)?.files).toEqual(['tests/a-file-in-every-allowed-state.test.ts'])
    expect(passedFilesIn(report, TREE)?.tests).toEqual({ total: 3, passed: 1 })
  })

  it('case 3: a file with a failed test is not passed in either, as before', () => {
    const report = aReport('a-file-with-a-failed-test.json', [
      aFile('a-file-with-a-failed-test.test.ts', 'failed', [aTest('passed'), aTest('failed')]),
    ])
    expect(redFilesIn(report, TREE)?.passed).toBe(0)
    expect(redFilesIn(report, TREE)?.failed).toContain('tests/a-file-with-a-failed-test.test.ts')
    expect(passedFilesIn(report, TREE)?.files).toEqual([])
  })

  it('case 4: a file whose assertionResults is missing is not passed in either', () => {
    const report = aReport('a-file-with-no-list-of-tests.json', [aFile('a-file-with-no-list-of-tests.test.ts', 'passed')])
    expect(redFilesIn(report, TREE)?.passed).toBe(0)
    expect(redFilesIn(report, TREE)?.failed).toContain('tests/a-file-with-no-list-of-tests.test.ts')
    expect(passedFilesIn(report, TREE)?.files).toEqual([])
    expect(passedFilesIn(report, TREE)?.tests).toEqual({ total: 0, passed: 0 })
  })
})
