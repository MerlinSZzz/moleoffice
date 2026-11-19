// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECOND OPINION USES WHAT ITS CALLER GIVES.
 *
 * tools/merge-tool/second-opinion.mjs used to import settingValue from src/config/settings.mjs and nine names from
 * tools/modal-tests.mjs, which reads that module too. It now takes the parts of the runner it uses, and the two
 * settings reads, from its caller, as testing.mjs passes arguments.mjs's THE_MODAL_PARTS (decision BxtP4m3YkTOQ,
 * option (a)). The guard, tests/the-merge-tool-reaches-the-office-only-through-two-modules.test.ts, reads the imports
 * as its own case.
 *
 * WHAT THIS FILE PROVES:
 * 1. aSecondOpinion rejects with exactly A_SECOND_OPINION_NEEDS_THE_MODAL_PARTS when it is given no modal, an empty
 *    object, or every member left out one at a time, once with a non-empty stillRed and once with stillRed empty.
 *    The run, git, log, now and every function it was given are not called.
 * 2. whetherASecondOpinionCanBeTaken throws exactly that sentence when it is given no modal, an empty object, or every
 *    member left out one at a time. Nothing it was given is called.
 * 3. The reads are the given ones, made at the moment of use. (a) With the test mark and the real runner named, the
 *    answer is the test-mark off sentence read from the module, and neither runnerFiles nor capAsWritten is called.
 *    (b) runnerFiles answers a token
 *    path and a Python path, validateToken and executable record their argument, and capAsWritten answers 12.34: the
 *    answer is { off: null, cap: 12.34 }, runnerFiles is called before capAsWritten, each once, and the two checks get
 *    those paths. (c) capAsWritten answers 'lots' with capSetting A_MADE_UP_CAP: off begins A_MADE_UP_CAP is "lots".
 * 4. aSecondOpinion uses the given budget and runner parts, as far as one runner call. (a) With receipts that, with
 *    the given estimate, pass the cap, run is not called, says names the cap, receiptsFile is called once and its
 *    answer reaches readMonthReceipts, and estimateUSD gets the given limit, grace, cpu and memory. (b) With receipts
 *    that do not pass, run is called once with the given timeout, and the report it writes, naming the given
 *    VM_CHECKOUT, is read back as green and the file is cleared.
 * EVERY MADE-UP PART RECORDS ITS CALLS, and the cases use only those, so nothing here reads a real setting and no
 * Modal runner, token, Python or receipt is touched. CASE 4 MAKES ITS REPORTS IN A SCRATCH FOLDER, removed after the
 * file; each sub-case gives its own tree and commit, because the module keeps each answer by tree, commit and file.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control, after commit 1 (run2-control-c1.log): this file red in all five cases, each for its own reason, and the
 *   guard green.
 * - after commit 2 (run3-guard-c2-red.log): the guard red in case 1 alone, naming second-opinion.mjs.
 * - after commit 3 (run4-pinning-c3-red.log): the pinning test red, saying the arguments.mjs forwarding is no longer
 *   found and naming second-opinion.mjs's reader uses.
 * - after commit 7 (run5-green-c7.log): this file, the guard, the pinning test and the changed neighbours green.
 * - mutation 1 (m1-guard-red.log): putting the settings import back in second-opinion.mjs made the guard red, naming
 *   second-opinion.mjs; the restore was green (m1-guard-green.log).
 * - mutation 2 (m2-guard-red.log): importing receiptsFile from modal-tests.mjs in second-opinion.mjs made the guard
 *   red, naming second-opinion.mjs; the restore was green (m2-guard-green.log).
 * - mutation 3 (m3-case1-red.log): taking the first-statement check out of aSecondOpinion made case 1 red; the restore
 *   was green (m3-green.log).
 * - mutation 4 (m4-case2-red.log): taking the first-statement check out of whetherASecondOpinionCanBeTaken made case 2
 *   red; the restore was green (m4-green.log).
 * - mutation 5 (m5-case3a-red.log): moving capAsWritten above the test-mark check made case 3(a) red; the restore was
 *   green (m5-green.log).
 * - mutation 6 (m6-case4b-red.log): making theRunsOf read results under modal-tests.mjs's own checkout made case 4(b)
 *   red; the restore was green (m6-green.log).
 * - mutation 7 (m7-pinning-red.log): making arguments.mjs's runnerFiles call modalRunnerFiles with no argument made
 *   the pinning test red; the restore was green (m7-green.log).
 * - this round's control, after commit 1 (r207-control-c1.log): this file red in case 3 alone, because the module
 *   exports no A_RUN_THE_SUITE_STARTED_TAKES_NO_SECOND_OPINION yet.
 * - this round's green run after commit 4 (r207-five-files-green.log): this file, the modal-runner test, the pinning
 *   test and the two neighbours green.
 * - mutation 1 (r207-m1-second-opinion-literal-red.log): returning the sentence written out at line 62, with one word
 *   changed, made case 3 red; the restore was green (r207-m1-restore-green.log).
 * - mutation 2 (r207-m2-second-opinion-constant-green.log): changing one word of the exported constant kept this file
 *   green, because case 3 reads the constant.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'

import { THE_TEST_MARK } from '../../src/config/the-test-mark.mjs'
import * as secondOpinion from '../../tools/merge-tool/second-opinion.mjs'

const NEEDED = Reflect.get(secondOpinion, 'A_SECOND_OPINION_NEEDS_THE_MODAL_PARTS') as unknown
const THE_TEST_MARK_OFF = Reflect.get(secondOpinion, 'A_RUN_THE_SUITE_STARTED_TAKES_NO_SECOND_OPINION') as unknown

/** The two functions as this file calls them, so it compiles both before and after the module takes its modal parts. */
type TheSecondOpinion = (options: Record<string, unknown>) => Promise<unknown>
type WhetherASecondOpinionCanBeTaken = (options: Record<string, unknown>) => unknown
const aSecondOpinion = secondOpinion.aSecondOpinion as unknown as TheSecondOpinion
const whetherASecondOpinionCanBeTaken =
  secondOpinion.whetherASecondOpinionCanBeTaken as unknown as WhetherASecondOpinionCanBeTaken

type Mock = ReturnType<typeof vi.fn>
type Answer = { cleared: { file: string }[]; kept: { file: string }[]; says: string }
type Can = { off: string | null; cap?: number }

const THE_MEMBERS = [
  'VM_CHECKOUT',
  'VM_DEFAULTS',
  'VM_SANDBOX_GRACE_SECONDS',
  'estimateUSD',
  'readMonthReceipts',
  'receiptsFile',
  'validateToken',
  'executable',
  'runnerFiles',
  'capAsWritten',
  'capSetting',
] as const

/** A sentence that is there and not empty, before any case asks an error to match it. */
function aNonEmptyString(said: unknown): string {
  expect(typeof said, 'the sentence is a string').toBe('string')
  expect((said as string).length, 'the sentence is not empty').toBeGreaterThan(0)
  return said as string
}

/** The message a refused asynchronous call throws, so a case compares the sentence whole. */
async function theRefusal(call: () => Promise<unknown>): Promise<string> {
  try {
    await call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw Error('the call was accepted with parts it did not get')
}

/** The message a refused synchronous call throws. */
function theSyncRefusal(call: () => unknown): string {
  try {
    call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw Error('the call was accepted with parts it did not get')
}

const folder = mkdtempSync(join(tmpdir(), 'the-second-opinion-'))
afterAll(() => {
  rmSync(folder, { recursive: true, force: true })
})

/** Everything the second opinion takes from its caller, made up, each function answering what a case needs. */
function theModalParts(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    VM_CHECKOUT: '/a-made-up-checkout',
    VM_DEFAULTS: { limitSeconds: 1234, cpu: 7, memoryMiB: 2048 },
    VM_SANDBOX_GRACE_SECONDS: 56,
    estimateUSD: vi.fn(() => 0.1),
    readMonthReceipts: vi.fn(() => 0),
    receiptsFile: vi.fn(() => '/a-made-up-receipts.jsonl'),
    validateToken: vi.fn(),
    executable: vi.fn(),
    runnerFiles: vi.fn(() => ({
      token: { path: '/a-made-up-token.toml', source: 'the setting' },
      python: { path: '/a-made-up-python', source: 'the setting' },
    })),
    capAsWritten: vi.fn(() => '12.34'),
    capSetting: 'A_MADE_UP_CAP',
    ...over,
  }
}

/** The function at `name` in a set of parts, as a mock this file can read. */
function mockOf(parts: Record<string, unknown>, name: string): Mock {
  return parts[name] as Mock
}

it('1: aSecondOpinion rejects with exactly its sentence when its caller gives it no modal parts', async () => {
  const need = aNonEmptyString(NEEDED)
  const valid = theModalParts()
  const run = vi.fn()
  const git = vi.fn()
  const log = vi.fn()
  const now = vi.fn(() => new Date(2026, 6, 15))
  const calls: [string, Record<string, unknown>][] = [
    ['no modal', {}],
    ['an empty object', { modal: {} }],
  ]
  for (const name of THE_MEMBERS) {
    const left = { ...valid }
    delete left[name]
    calls.push([`${name} left out`, { modal: left }])
  }
  const stillRed = [{ file: 'tests/a-made-up-file.test.ts', pair: null }]

  for (const [because, given] of calls) {
    for (const red of [stillRed, []]) {
      const options = {
        tree: '/a-made-up-tree',
        M: 'b'.repeat(40),
        stillRed: red,
        runner: 'a-made-up-runner',
        theRealRunner: 'a-made-up-real-runner',
        outFolder: folder,
        run,
        git,
        log,
        env: {},
        now,
        ...given,
      }
      expect(await theRefusal(() => aSecondOpinion(options)), because).toBe(need)
    }
  }

  expect(run, 'the given run was not called').not.toHaveBeenCalled()
  expect(git, 'the given git was not called').not.toHaveBeenCalled()
  expect(log, 'the given log was not called').not.toHaveBeenCalled()
  expect(now, 'the given now was not called').not.toHaveBeenCalled()
  for (const [name, value] of Object.entries(valid)) {
    if (value instanceof Function) expect(value, `the given ${name} was not called`).not.toHaveBeenCalled()
  }
})

it('2: whetherASecondOpinionCanBeTaken throws exactly its sentence when its caller gives it no modal parts', () => {
  const need = aNonEmptyString(NEEDED)
  const valid = theModalParts()
  const calls: [string, Record<string, unknown>][] = [
    ['no modal', {}],
    ['an empty object', { modal: {} }],
  ]
  for (const name of THE_MEMBERS) {
    const left = { ...valid }
    delete left[name]
    calls.push([`${name} left out`, { modal: left }])
  }

  for (const [because, given] of calls) {
    const options = {
      runner: 'a-made-up-runner',
      theRealRunner: 'a-made-up-real-runner',
      env: {},
      ...given,
    }
    expect(theSyncRefusal(() => whetherASecondOpinionCanBeTaken(options)), because).toBe(need)
  }

  for (const [name, value] of Object.entries(valid)) {
    if (value instanceof Function) expect(value, `the given ${name} was not called`).not.toHaveBeenCalled()
  }
})

it('3: the reads are the given ones, made at the moment of use', () => {
  const ask = (parts: Record<string, unknown>, runner = 'a-made-up-runner', env: Record<string, string> = {}) =>
    whetherASecondOpinionCanBeTaken({
      runner,
      theRealRunner: 'a-made-up-real-runner',
      env,
      modal: parts,
    }) as Can

  // (a) THE TEST MARK IS READ FIRST, AS IT IS TODAY, so a run the suite started reads no setting.
  const marked = theModalParts()
  const off = ask(marked, 'a-made-up-real-runner', { [THE_TEST_MARK]: '1' })
  const sentence = aNonEmptyString(THE_TEST_MARK_OFF)
  expect(off).toEqual({ off: sentence })
  expect(mockOf(marked, 'runnerFiles'), 'runnerFiles was not called').not.toHaveBeenCalled()
  expect(mockOf(marked, 'capAsWritten'), 'capAsWritten was not called').not.toHaveBeenCalled()

  // (b) THE GIVEN FILES AND THE GIVEN CAP ARE THE ONES USED, in that order.
  const given = theModalParts()
  const answer = ask(given)
  expect(answer).toEqual({ off: null, cap: 12.34 })
  const runnerFiles = mockOf(given, 'runnerFiles')
  const capAsWritten = mockOf(given, 'capAsWritten')
  expect(runnerFiles, 'the given runnerFiles was called once').toHaveBeenCalledTimes(1)
  expect(capAsWritten, 'the given capAsWritten was called once').toHaveBeenCalledTimes(1)
  expect(runnerFiles.mock.invocationCallOrder[0]!, 'runnerFiles is called before capAsWritten').toBeLessThan(
    capAsWritten.mock.invocationCallOrder[0]!,
  )
  const files = runnerFiles.mock.results[0]!.value as { token: { path: string }; python: { path: string } }
  expect(mockOf(given, 'validateToken'), 'validateToken got the given token path').toHaveBeenCalledWith(files.token.path)
  expect(mockOf(given, 'executable'), 'executable got the given Python path').toHaveBeenCalledWith(files.python.path)

  // (c) THE CAP SENTENCE NAMES THE GIVEN SETTING, NOT A NAME THE MODULE HOLDS.
  const word = theModalParts({ capAsWritten: vi.fn(() => 'lots'), capSetting: 'A_MADE_UP_CAP' })
  const refused = ask(word)
  expect(String(refused.off).startsWith('A_MADE_UP_CAP is "lots"'), 'off begins with the given setting and value').toBe(true)
})

it('4(a): aSecondOpinion uses the given budget parts and starts no run that could pass the given cap', async () => {
  const modal = theModalParts({
    readMonthReceipts: vi.fn(() => 5),
    estimateUSD: vi.fn(() => 100),
    receiptsFile: vi.fn(() => '/a-made-up-receipts.jsonl'),
    capAsWritten: vi.fn(() => '12.34'),
  })
  const run = vi.fn(async () => {
    throw Error('the given run was called')
  })
  const git = vi.fn(() => 'c'.repeat(40))
  const answer = (await aSecondOpinion({
    tree: '/a-made-up-tree-a',
    M: 'd'.repeat(40),
    stillRed: [{ file: 'tests/a-made-up-a.test.ts', pair: { main: { failing: [] }, entry: { failing: ['is slow here'] } } }],
    runner: 'a-made-up-runner',
    theRealRunner: 'a-made-up-real-runner',
    outFolder: folder,
    run,
    git,
    log: () => {},
    env: {},
    modal,
    now: () => new Date(2026, 6, 15),
  })) as Answer

  expect(run, 'the given run was not called').not.toHaveBeenCalled()
  expect(answer.kept.map((one) => one.file), 'the file is kept red').toEqual(['tests/a-made-up-a.test.ts'])
  expect(answer.says, 'the sentence names the cap').toContain('cap of 12.34 dollars')
  expect(mockOf(modal, 'receiptsFile'), 'the given receiptsFile was called once').toHaveBeenCalledTimes(1)
  expect(mockOf(modal, 'readMonthReceipts'), 'its answer reached readMonthReceipts').toHaveBeenCalledWith(
    '/a-made-up-receipts.jsonl',
    expect.stringMatching(/^\d{4}-\d{2}$/u),
  )
  expect(mockOf(modal, 'estimateUSD'), 'estimateUSD got the given limits, cpu and memory').toHaveBeenCalledWith(
    1234 + 56,
    7,
    2048,
  )
})

it('4(b): aSecondOpinion runs once with the given parts and reads its report under the given checkout', async () => {
  const modal = theModalParts({
    readMonthReceipts: vi.fn(() => 0),
    estimateUSD: vi.fn(() => 0.1),
    receiptsFile: vi.fn(() => '/a-made-up-receipts.jsonl'),
    capAsWritten: vi.fn(() => '12.34'),
  })
  const wrote: { report: string; timeoutMs: number; files: string[] }[] = []
  const run = vi.fn(async (label: string, _command: string, args: string[], options: { timeoutMs: number }) => {
    const report = args[6]!
    const files = args.slice(8)
    writeFileSync(
      report,
      JSON.stringify({
        success: true,
        testResults: files.map((file) => ({
          name: `${String(modal['VM_CHECKOUT'])}/${file}`,
          status: 'passed',
          assertionResults: [],
        })),
      }),
    )
    wrote.push({ report, timeoutMs: options.timeoutMs, files })
    return { code: 0, signal: null, timedOut: false, outFile: join(folder, `${label}.log`) }
  })
  const git = vi.fn(() => 'e'.repeat(40))
  const answer = (await aSecondOpinion({
    tree: '/a-made-up-tree-b',
    M: 'f'.repeat(40),
    stillRed: [{ file: 'tests/brought.test.ts', pair: null }],
    runner: 'a-made-up-runner',
    theRealRunner: 'a-made-up-real-runner',
    outFolder: folder,
    run,
    git,
    log: () => {},
    env: {},
    modal,
    now: () => new Date(2026, 6, 15),
  })) as Answer

  expect(run, 'the given run was called once').toHaveBeenCalledTimes(1)
  expect(wrote, 'one report was written').toHaveLength(1)
  expect(wrote[0]!.timeoutMs, 'the timeout is the given limit, grace and an hour').toBe((1234 + 56 + 3600) * 1000)
  expect(wrote[0]!.files, 'the file was the one asked about').toEqual(['tests/brought.test.ts'])
  expect(readFileSync(wrote[0]!.report, 'utf8'), 'the report names the given checkout').toContain(
    '/a-made-up-checkout/tests/brought.test.ts',
  )
  expect(answer.cleared.map((one) => one.file), 'the file is cleared').toEqual(['tests/brought.test.ts'])
  expect(answer.kept, 'nothing is kept red').toEqual([])
})

