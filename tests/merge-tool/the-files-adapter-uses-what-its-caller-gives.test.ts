// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES ADAPTER USES WHAT ITS CALLER GIVES.
 *
 * tools/merge-tool/files.mjs used to import readBackThroughTheOffice, step and theSeal from office-keeper.mjs, the
 * module that talks to the office. It now takes them from its caller, tools/the-merger.mjs, so the module reaches no
 * office module itself. The guard, tests/the-merge-tool-reaches-the-office-only-through-two-modules.test.ts, reads
 * the imports as its own case. This adapter file names what each function needs in THE_FILES_ADAPTER_NEEDS.
 *
 * WHAT THIS FILE PROVES:
 * 1. Each of pinFiles, integrateFiles, testFiles and landFiles refuses, as its first statement, with its own sentence
 *    when it is given nothing, only one of the two functions it needs, or a value that is not a function. The
 *    office-keeper mock is never reached, and no function the caller gave is called.
 * 2. testFiles calls the given step once, with 'tested' and the facts it gives today, and hands back the step's answer.
 *    The `says` sentence is read from files.mjs's A_FILES_CHANGESET_RUNS_NO_TEST_SUITE, so it is copied nowhere.
 * THE OFFICE-KEEPER MOCK'S readBackThroughTheOffice, step AND theSeal THROW and record that they were reached, so the
 * old code is red at once with a plain sentence instead of talking to the office. The log-and-state mock records
 * nothing and throws on fail.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control, after commit 1 (control-c1-red.log): the new file red in all three cases on the old code, case 1 with
 *   THE_FILES_ADAPTER_NEEDS absent, case 2 with the office-keeper sentence and case 3 with the call lines missing;
 *   the guard green; exit 1, 3 failed and 4 passed over the two files.
 * - mutation 1, after commit 3 (m1-guard-red.log): the office-keeper import put back in files.mjs made the guard red
 *   in case 1 alone, naming files.mjs; 1 failed and 3 passed. The restore was green (m1-guard-green.log, 4 passed).
 * - mutation 3 (m3-case1-red.log): taking out the first-statement check of pinFiles turned case 1 red, 1 failed and 2
 *   passed. The restore was green (m3-green.log, 3 passed).
 * - mutation 4 (m4-case2-red.log): making testFiles call the given step with 'tested-files' turned case 2 red, 1
 *   failed and 2 passed. The restore was green (m4-green.log, 3 passed).
 * - mutation 5 (m5-merger-red.log): leaving theSeal out of the call at line 376 turned tests/the-merger.test.ts red,
 *   three of its files-adapter cases failing with the pinFiles sentence, 3 failed and 41 passed; the restore was
 *   green.
 * - restore: the new file, the guard and tests/the-merger.test.ts green (c3-green.log, exit 0, 3 files and 51 passed).
 *
 * ROUND 204 READS THE TESTED SENTENCE FROM files.mjs: case 2 reads A_FILES_CHANGESET_RUNS_NO_TEST_SUITE off the
 * module namespace, so a change to the words in files.mjs cannot turn the test red.
 * - control, after commit 1 (r204-control-c1-red.log): case 2 red at the non-empty-string check, the other two cases
 *   green; 1 failed and 2 passed.
 * - mutation 1, one word of the sentence at line 236 given back as a literal (r204-m1-literal-red.log): case 2 red;
 *   1 failed and 2 passed.
 * - mutation 1 restore (r204-m1-restore-green.log): 3 passed.
 * - mutation 2, `export` taken off the constant (r204-m2-no-export-red.log): case 2 red at the non-empty-string check;
 *   1 failed and 2 passed.
 * - mutation 2 restore (r204-m2-restore-green.log): 3 passed.
 */
import { expect, it, vi } from 'vitest'

const reached = vi.hoisted(() => ({ officeKeeper: [] as string[] }))

vi.mock('../../tools/merge-tool/arguments.mjs', () => ({
  ABSENT: 'absent',
  LOG: 'synthetic-the-merger.log',
  WORKDIR: 'synthetic-workdir',
  chosen: { entry: 'synthetic-entry' },
}))

vi.mock('../../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (message: string) => {
    throw Error(message)
  },
  log: () => {},
}))

vi.mock('../../tools/merge-tool/office-keeper.mjs', () => ({
  readBackThroughTheOffice: async () => {
    reached.officeKeeper.push('readBackThroughTheOffice')
    throw Error('the files adapter reached office-keeper.mjs itself')
  },
  step: async () => {
    reached.officeKeeper.push('step')
    throw Error('the files adapter reached office-keeper.mjs itself')
  },
  theSeal: async () => {
    reached.officeKeeper.push('theSeal')
    throw Error('the files adapter reached office-keeper.mjs itself')
  },
}))

import * as theAdapter from '../../tools/merge-tool/files.mjs'

type TheGiven = { step?: unknown; theSeal?: unknown; readBackThroughTheOffice?: unknown }

/** The four functions as this file calls them, so the file compiles before and after they take a second argument. */
type TheFilesAdapter = {
  pinFiles: (entry: unknown, given?: TheGiven) => Promise<unknown>
  integrateFiles: (entry: unknown, given?: TheGiven) => Promise<unknown>
  testFiles: (given?: TheGiven) => Promise<unknown>
  landFiles: (entry: unknown, given?: TheGiven) => Promise<unknown>
}
const theFilesAdapter = theAdapter as unknown as TheFilesAdapter

type TheNames = 'pinFiles' | 'integrateFiles' | 'testFiles' | 'landFiles'
type TheSentences = Record<TheNames, unknown>

/** The sentences the adapter exports, read off the namespace so the file loads before the constant exists. */
function theSentences(): TheSentences {
  const sentences = Reflect.get(theAdapter, 'THE_FILES_ADAPTER_NEEDS')
  expect(sentences, 'the files adapter names what it needs in THE_FILES_ADAPTER_NEEDS').toBeTypeOf('object')
  return sentences as TheSentences
}

/** A sentence that is there and not empty, before any case asks an error to match it. */
function aNonEmptyString(said: unknown): string {
  expect(typeof said, 'the sentence is a string').toBe('string')
  expect((said as string).length, 'the sentence is not empty').toBeGreaterThan(0)
  return said as string
}

/** The message a refused call throws. */
async function theRefusal(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('the files adapter accepted what it cannot use')
}

/** A small synthetic entry, enough for the first statement of each function to judge the functions it was given. */
function aSyntheticEntry(): Record<string, unknown> {
  return { id: 'synthetic-entry', changeset: { root: '/nonexistent', operations: [] } }
}

it('each function refuses with its own sentence when given nothing, one function, or a value that is not a function', async () => {
  const sentences = theSentences()
  const need: Record<TheNames, string> = {
    pinFiles: aNonEmptyString(sentences.pinFiles),
    integrateFiles: aNonEmptyString(sentences.integrateFiles),
    testFiles: aNonEmptyString(sentences.testFiles),
    landFiles: aNonEmptyString(sentences.landFiles),
  }
  const entry = aSyntheticEntry()
  const step = vi.fn(async () => ({}))
  const theSeal = vi.fn(async () => ({}))
  const readBackThroughTheOffice = vi.fn(async () => ({}))

  const refused: Array<[TheNames, Promise<unknown>]> = [
    ['pinFiles', theFilesAdapter.pinFiles(entry)],
    ['pinFiles', theFilesAdapter.pinFiles(entry, {})],
    ['pinFiles', theFilesAdapter.pinFiles(entry, { step })],
    ['pinFiles', theFilesAdapter.pinFiles(entry, { theSeal })],
    ['pinFiles', theFilesAdapter.pinFiles(entry, { step: 'not a function', theSeal })],
    ['pinFiles', theFilesAdapter.pinFiles(entry, { step, theSeal: 'not a function' })],
    ['integrateFiles', theFilesAdapter.integrateFiles(entry)],
    ['integrateFiles', theFilesAdapter.integrateFiles(entry, {})],
    ['integrateFiles', theFilesAdapter.integrateFiles(entry, { step: 'not a function' })],
    ['testFiles', theFilesAdapter.testFiles()],
    ['testFiles', theFilesAdapter.testFiles({})],
    ['testFiles', theFilesAdapter.testFiles({ step: 'not a function' })],
    ['landFiles', theFilesAdapter.landFiles(entry)],
    ['landFiles', theFilesAdapter.landFiles(entry, {})],
    ['landFiles', theFilesAdapter.landFiles(entry, { step })],
    ['landFiles', theFilesAdapter.landFiles(entry, { readBackThroughTheOffice })],
    ['landFiles', theFilesAdapter.landFiles(entry, { readBackThroughTheOffice, step: 'not a function' })],
    ['landFiles', theFilesAdapter.landFiles(entry, { readBackThroughTheOffice: 'not a function', step })],
  ]
  for (const [name, run] of refused) {
    expect(await theRefusal(run), `the refusal ${name} gives`).toBe(need[name])
  }

  expect(step).not.toHaveBeenCalled()
  expect(theSeal).not.toHaveBeenCalled()
  expect(readBackThroughTheOffice).not.toHaveBeenCalled()
  expect(reached.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

it('testFiles gives the given step the tested facts once and hands back its answer', async () => {
  const answer = { state: 'tested', said: 'synthetic answer' }
  const step = vi.fn(async () => answer)
  // READ OFF THE NAMESPACE, as THE_FILES_ADAPTER_NEEDS is above, so the file loads before the constant exists.
  const says = Reflect.get(theAdapter, 'A_FILES_CHANGESET_RUNS_NO_TEST_SUITE')
  expect(says, 'files.mjs exports A_FILES_CHANGESET_RUNS_NO_TEST_SUITE as a string').toBeTypeOf('string')
  expect((says as string).length, 'the tested sentence is not empty').toBeGreaterThan(0)

  const result = await theFilesAdapter.testFiles({ step })

  expect(step).toHaveBeenCalledTimes(1)
  expect(step).toHaveBeenCalledWith(
    'tested',
    {
      green: true,
      log: 'synthetic-the-merger.log',
      says,
    },
    { ran: {} },
  )
  expect(result).toBe(answer)
  expect(reached.officeKeeper, 'no office-keeper function was reached').toEqual([])
})

