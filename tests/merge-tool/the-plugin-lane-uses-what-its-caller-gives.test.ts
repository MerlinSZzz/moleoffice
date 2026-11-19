// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLUGIN LANE USES WHAT ITS CALLER GIVES.
 *
 * tools/merge-tool/plugin-lane.mjs used to import missingWebBuild and THE_BUILT_PAGE from
 * src/config/the-built-page.mjs, which imports src/config/settings.mjs, and inATestBatchSeat, keepTheReport and
 * runInSandbox from office-keeper.mjs, the module that talks to the office. It now takes all five from its caller, as
 * testing.mjs passes office-keeper.mjs's inATestBatchSeat, runInSandbox and keepTheReport and the-built-page.mjs's
 * THE_BUILT_PAGE as builtPage and its missingWebBuild, so the module reaches no office module itself. The guard,
 * tests/the-merge-tool-reaches-the-office-only-through-two-modules.test.ts, reads the imports as its own case.
 *
 * WHAT THIS FILE PROVES:
 * 1. testAPlugin rejects with exactly TEST_A_PLUGIN_NEEDS_WHAT_ITS_CALLER_GIVES when it is given only the old
 *    options (sandbox, clone, reports, tip, scripts, report and list); when it is given all five new ones but one at
 *    a time leaves one out; and when builtPage is ''. No office-keeper mock is reached, and no function the caller
 *    gives is called.
 * 2. theBuiltPageProblem throws exactly THE_BUILT_PAGE_PROBLEM_NEEDS_THE_PAGE_AND_ITS_CHECK when it is given no
 *    second argument, {}, only builtPage, only missingWebBuild, or a missingWebBuild that is not a function. The
 *    missingWebBuild it is given is not called.
 * 3. The given page and check are the ones used, called directly. (a) A missingWebBuild that records its argument
 *    and answers null makes the answer null, and is called once with the clone's dist/web. (b) One that answers a
 *    sentence makes the answer contain the clone, the page, that sentence and red-files.mjs's NOT_RED.
 * 4. The functions the caller gives are the ones testAPlugin uses, run as far as the lane goes. (a) With a
 *    missingWebBuild that answers a sentence, testAPlugin rejects with the integrated-tree sentence after the check
 *    and the secret scan, and calls the given inATestBatchSeat once and the given runInSandbox twice. (b) With one
 *    that answers null, testAPlugin rejects with the privacy gate's no-readable-report sentence after the gates run,
 *    and calls the given inATestBatchSeat twice, the given runInSandbox three times and the given keepTheReport
 *    once. In both, no office-keeper mock is reached and the given report is not called.
 * THE OFFICE-KEEPER MOCK'S inATestBatchSeat, runInSandbox AND keepTheReport RECORD THAT THEY WERE REACHED AND THROW,
 * so the old code is red at once with a plain sentence instead of talking to the office. The log-and-state mock
 * records the log and throws on fail, and gives ACloneNamesAProgram, which what-a-clone-names.mjs takes from it. The
 * arguments mock keeps the module from reading the test runner's own command line, which arguments.mjs would end the
 * process over, and gives every name the modules plugin-lane.mjs loads import from it.
 *
 * CASE 4 MAKES ITS RUNS IN A SCRATCH FOLDER. The given runInSandbox writes a log whose first line is the launcher's
 * own `sandbox-start: started {}` line and whose last line is the answer the lane reads for the check and the scan;
 * the gates run gets no answer line. The given keepTheReport answers a path where no file exists, which is the
 * privacy gate's no-readable-report case.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control, after commit 1 (control-c1.log): the new file red in all six tests, one for each of the five cases and
 *   case 4's two sub-cases, each for its own reason, and the guard green.
 * - after commit 2 (guard-c2-red.log): the guard red in case 1 alone, naming plugin-lane.mjs.
 * - after commit 3 (green-c3.log): the new file, the guard, every-file-of-the-merge-tool-is-the-queues-own-code and
 *   a-merge-tool-library-run-as-a-program-refuses green.
 * - mutation 1 (m1-guard-red.log): the office-keeper import put back in plugin-lane.mjs made the guard red naming
 *   plugin-lane.mjs; the restore was green (m1-guard-green.log).
 * - mutation 2 (m2-guard-red.log): the-built-page import put back in plugin-lane.mjs made the guard red naming
 *   plugin-lane.mjs; the restore was green (m2-guard-green.log).
 * - mutation 3 (m3-case1-red.log): testAPlugin's first-statement check taken out made case 1 red; the restore was
 *   green (m3-green.log).
 * - mutation 4 (m4-case2-red.log): theBuiltPageProblem's first-statement check taken out made case 2 red; the restore
 *   was green (m4-green.log).
 * - mutation 5 (m5-case4-red.log): the call to theBuiltPageProblem made without its second argument made case 4 red;
 *   tests/a-plugin-only-change-is-tested-by-its-own-check.test.ts was run on it (m5-plugin-test.log), and the
 *   restore was green (m5-green.log).
 * - mutation 6 (m6-case4b-red.log): the gates run's keepTheReport given 'plugin-gate.json' instead of
 *   'plugin-gates.json' made case 4(b) red; the restore was green (m6-green.log).
 * - restore: the new file, the guard and the changed neighbours green (restore-green.log).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'

import { NOT_RED } from '../../tools/merge-tool/red-files.mjs'

const reached = vi.hoisted(() => ({ officeKeeper: [] as string[], log: [] as string[] }))

vi.mock('../../tools/merge-tool/arguments.mjs', () => ({
  ABSENT: 'absent',
  GIT_IDENTITY: {
    GIT_AUTHOR_NAME: 'Synthetic queue',
    GIT_AUTHOR_EMAIL: 'synthetic@example.invalid',
    GIT_COMMITTER_NAME: 'Synthetic queue',
    GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
  },
  LOG: 'synthetic-merge.log',
  RERUN_LIMITS: { timeoutMs: 900_000, idleTimeoutMs: 600_000 },
  SCRIPT_TIMEOUT_MS: 900_000,
  THIS_CHECKOUT: '/synthetic-checkout',
  WORKDIR: '/nonexistent',
  chosen: { entry: 'synthetic-entry', sandboxes: '/synthetic/work' },
  theMainMirrorOf: () => '/synthetic/mirror',
}))

vi.mock('../../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (message: string) => {
    throw Error(message)
  },
  log: (line: string) => {
    reached.log.push(line)
  },
  ACloneNamesAProgram: class ACloneNamesAProgram extends Error {},
}))

vi.mock('../../tools/merge-tool/office-keeper.mjs', () => ({
  inATestBatchSeat: async () => {
    reached.officeKeeper.push('inATestBatchSeat')
    throw Error('plugin-lane.mjs reached office-keeper.mjs itself')
  },
  runInSandbox: async () => {
    reached.officeKeeper.push('runInSandbox')
    throw Error('plugin-lane.mjs reached office-keeper.mjs itself')
  },
  keepTheReport: () => {
    reached.officeKeeper.push('keepTheReport')
    throw Error('plugin-lane.mjs reached office-keeper.mjs itself')
  },
}))

import * as thePluginLane from '../../tools/merge-tool/plugin-lane.mjs'

const NEEDED = Reflect.get(thePluginLane, 'TEST_A_PLUGIN_NEEDS_WHAT_ITS_CALLER_GIVES') as unknown
const NEEDED_PAGE = Reflect.get(thePluginLane, 'THE_BUILT_PAGE_PROBLEM_NEEDS_THE_PAGE_AND_ITS_CHECK') as unknown

/** The two functions as this file calls them, so it compiles both before and after the module takes the new arguments. */
type TestAPlugin = (change: Record<string, unknown>, given: Record<string, unknown>) => Promise<unknown>
type TheBuiltPageProblem = (clone: string, given?: Record<string, unknown>) => string | null
const testAPlugin = thePluginLane.testAPlugin as unknown as TestAPlugin
const theBuiltPageProblem = thePluginLane.theBuiltPageProblem as unknown as TheBuiltPageProblem

/** A sentence that is there and not empty, before any case asks an error to match it. */
function aNonEmptyString(said: unknown): string {
  expect(typeof said, 'the sentence is a string').toBe('string')
  expect((said as string).length, 'the sentence is not empty').toBeGreaterThan(0)
  return said as string
}

/** The message a refused call throws, so a case compares the sentence whole rather than its opening words. */
async function theRefusal(call: () => Promise<unknown>): Promise<string> {
  try {
    await call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw Error('the call was accepted with arguments it did not get')
}

/** The message a refused synchronous call throws. */
function theSyncRefusal(call: () => unknown): string {
  try {
    call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw Error('the call was accepted with arguments it did not get')
}

const folder = mkdtempSync(join(tmpdir(), 'the-plugin-lane-'))
afterAll(() => {
  rmSync(folder, { recursive: true, force: true })
})

it('1: testAPlugin refuses with its sentence when its caller leaves any of the five out', async () => {
  const need = aNonEmptyString(NEEDED)
  const inATestBatchSeat = vi.fn(async () => {
    throw Error('the given inATestBatchSeat was called')
  })
  const runInSandbox = vi.fn(async () => {
    throw Error('the given runInSandbox was called')
  })
  const keepTheReport = vi.fn(() => {
    throw Error('the given keepTheReport was called')
  })
  const missingWebBuild = vi.fn(() => 'synthetic: no page here.')
  const builtPage = '/synthetic-checkout/dist/web'
  const allFive = { inATestBatchSeat, runInSandbox, keepTheReport, builtPage, missingWebBuild }
  const change = { id: 'synthetic-plugin', manifest: false }
  const oldOptions = {
    sandbox: { name: 'synthetic-sandbox' },
    clone: folder,
    reports: folder,
    tip: 'a'.repeat(40),
    scripts: { test: 'vitest run' },
    report: () => null,
    list: { why: null, mainAt: 'b'.repeat(40), text: 'export const HOUSE_RULES = {\n}\n' },
  }
  const calls: [string, Record<string, unknown>][] = [['the old options only', oldOptions]]
  for (const name of ['inATestBatchSeat', 'runInSandbox', 'keepTheReport', 'builtPage', 'missingWebBuild']) {
    const left = { ...allFive }
    delete (left as Record<string, unknown>)[name]
    calls.push([`${name} left out`, left])
  }
  calls.push(['builtPage empty', { ...allFive, builtPage: '' }])

  for (const [because, given] of calls) {
    expect(await theRefusal(() => testAPlugin(change, given)), because).toBe(need)
  }

  expect(inATestBatchSeat, 'the given inATestBatchSeat was not called').not.toHaveBeenCalled()
  expect(runInSandbox, 'the given runInSandbox was not called').not.toHaveBeenCalled()
  expect(keepTheReport, 'the given keepTheReport was not called').not.toHaveBeenCalled()
  expect(missingWebBuild, 'the given missingWebBuild was not called').not.toHaveBeenCalled()
  expect(reached.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('2: theBuiltPageProblem refuses with its sentence when its caller gives it no page or no check', () => {
  const need = aNonEmptyString(NEEDED_PAGE)
  const missingWebBuild = vi.fn(() => null)
  const calls: [string, () => unknown][] = [
    ['no second argument', () => theBuiltPageProblem('/synthetic-clone')],
    ['an empty object', () => theBuiltPageProblem('/synthetic-clone', {})],
    ['only builtPage', () => theBuiltPageProblem('/synthetic-clone', { builtPage: '/synthetic-checkout/dist/web' })],
    ['only missingWebBuild', () => theBuiltPageProblem('/synthetic-clone', { missingWebBuild })],
    [
      'a missingWebBuild that is not a function',
      () => theBuiltPageProblem('/synthetic-clone', { builtPage: '/synthetic-checkout/dist/web', missingWebBuild: 'not a function' }),
    ],
  ]

  for (const [because, call] of calls) expect(theSyncRefusal(call), because).toBe(need)

  expect(missingWebBuild, 'the given missingWebBuild was not called').not.toHaveBeenCalled()
})

it('3: theBuiltPageProblem uses the page and check its caller gives', () => {
  const builtPage = '/synthetic-checkout/dist/web'
  const seen: string[] = []
  const noProblem = theBuiltPageProblem('/synthetic-clone', {
    builtPage,
    missingWebBuild: (page: string) => {
      seen.push(page)
      return null
    },
  })

  expect(noProblem, 'a page that is there has no problem').toBeNull()
  expect(seen, 'the given check was called once with the clone\'s page').toEqual(['/synthetic-clone/dist/web'])

  const problem = theBuiltPageProblem('/synthetic-clone', { builtPage, missingWebBuild: () => 'synthetic: no page here.' })
  const said = aNonEmptyString(problem)
  expect(said, 'the sentence names the clone').toContain('/synthetic-clone')
  expect(said, 'the sentence names the page').toContain('/synthetic-clone/dist/web')
  expect(said, 'the sentence carries what the given check said').toContain('synthetic: no page here.')
  expect(said, 'the sentence ends with red-files.mjs\'s NOT_RED').toContain(NOT_RED)
})

/** The list's text: one plain P privacy file, as thePlainPrivacyFiles reads it. */
const THE_LIST_TEXT = ['export const HOUSE_RULES = {', "  'tests/synthetic-privacy.test.ts': { class: 'P', kind: 'other' },", '}'].join('\n')

/**
 * One run of the lane with every function its caller gives recorded, and a missingWebBuild that answers `missing`.
 * The scratch folder is the clone, the reports folder and the place the run logs are written.
 */
function theLane(missing: (page: string) => string | null) {
  const seats: string[] = []
  const runs: { sandbox: unknown; label: string; command: string; args: string[]; options: Record<string, unknown> }[] = []
  const kept: [string, string][] = []
  const pages: string[] = []
  const report = vi.fn(() => {
    throw Error('the report was reached')
  })
  const missingWebBuild = vi.fn((page: string) => {
    pages.push(page)
    return missing(page)
  })
  const inATestBatchSeat = vi.fn(async (label: string, run: () => Promise<unknown>) => {
    seats.push(label)
    return run()
  })
  const runInSandbox = vi.fn(async (sandbox: unknown, label: string, command: string, args: string[], options: Record<string, unknown>) => {
    runs.push({ sandbox, label, command, args, options })
    const outFile = join(folder, `${label}-${String(runs.length)}.log`)
    const answer =
      label === 'plugin-check'
        ? '{"plugin":"synthetic-plugin","steps":[],"passed":true}'
        : label === 'plugin-secrets'
          ? '{"found":{},"couldNotLookAt":[],"files":[],"filesRead":1}'
          : null
    writeFileSync(outFile, ['sandbox-start: started {}', ...(answer === null ? [] : [answer]), ''].join('\n'))
    return { code: 0, signal: null, timedOut: false, outFile, tail: '' }
  })
  const keepTheReport = vi.fn((written: string, name: string) => {
    kept.push([written, name])
    return join(folder, 'no-readable-report.json')
  })

  return {
    seats,
    runs,
    kept,
    pages,
    report,
    missingWebBuild,
    inATestBatchSeat,
    runInSandbox,
    keepTheReport,
    given: {
      sandbox: { name: 'synthetic-sandbox' },
      clone: folder,
      reports: folder,
      tip: 'a'.repeat(40),
      scripts: { test: 'vitest run' },
      report,
      list: { why: null, mainAt: 'b'.repeat(40), text: THE_LIST_TEXT },
      inATestBatchSeat,
      runInSandbox,
      keepTheReport,
      builtPage: '/synthetic-checkout/dist/web',
      missingWebBuild,
    },
  }
}

it('4(a): testAPlugin runs the check and the scan with the given functions, then stops on the given missing page', async () => {
  const lane = theLane(() => 'synthetic: no page here.')
  const message = await theRefusal(() => testAPlugin({ id: 'synthetic-plugin', manifest: false }, lane.given))

  expect(message.startsWith('The integrated tree '), 'the refusal is the integrated-tree sentence').toBe(true)
  expect(message, 'the refusal carries what the given check said').toContain('synthetic: no page here.')
  expect(lane.inATestBatchSeat, 'the given inATestBatchSeat was called once').toHaveBeenCalledTimes(1)
  expect(lane.seats, 'the seat is the plugin\'s own check').toHaveLength(1)
  expect(lane.seats[0], 'the seat label names the plugin').toContain('synthetic-plugin')
  expect(lane.runInSandbox, 'the given runInSandbox was called twice').toHaveBeenCalledTimes(2)
  expect(lane.runs.map((one) => one.label), 'the two runs are the check and the scan').toEqual(['plugin-check', 'plugin-secrets'])
  expect(lane.runs[0]!.command, 'the check is node').toBe('node')
  expect(lane.runs[0]!.args, 'the check is check-a-plugin.mjs').toEqual(['tools/check-a-plugin.mjs', 'synthetic-plugin', '--json'])
  expect(lane.runs[0]!.options['cwd'], 'the check runs in the clone').toBe(folder)
  expect(lane.missingWebBuild, 'the given missingWebBuild was called once').toHaveBeenCalledTimes(1)
  expect(lane.pages, 'the given missingWebBuild was called with the clone\'s page').toEqual([join(folder, 'dist/web')])
  expect(lane.keepTheReport, 'the given keepTheReport was not called').not.toHaveBeenCalled()
  expect(lane.report, 'the given report was not called').not.toHaveBeenCalled()
  expect(reached.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('4(b): testAPlugin runs the gates with the given functions and keeps the report with the given keepTheReport', async () => {
  const lane = theLane(() => null)
  const message = await theRefusal(() => testAPlugin({ id: 'synthetic-plugin', manifest: false }, lane.given))

  expect(
    message.startsWith('The privacy gate could not say whether the plugin passes: it left no readable report at'),
    'the refusal is the privacy gate\'s no-readable-report sentence',
  ).toBe(true)
  expect(lane.inATestBatchSeat, 'the given inATestBatchSeat was called twice').toHaveBeenCalledTimes(2)
  expect(lane.runInSandbox, 'the given runInSandbox was called three times').toHaveBeenCalledTimes(3)
  expect(lane.runs[2]!.label, 'the third run is the gates').toBe('plugin-gates')
  expect(lane.runs[2]!.command, 'the gates run npm').toBe('npm')
  expect(lane.keepTheReport, 'the given keepTheReport was called once').toHaveBeenCalledTimes(1)
  expect(lane.kept, 'the given keepTheReport was called with the gates report').toEqual([[join(folder, 'plugin-gates.json'), 'plugin-gates.json']])
  expect(lane.report, 'the given report was not called').not.toHaveBeenCalled()
  expect(reached.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

