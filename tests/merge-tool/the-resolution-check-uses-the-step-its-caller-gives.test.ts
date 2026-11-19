// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RESOLUTION CHECK USES THE STEP ITS CALLER GIVES.
 *
 * tools/merge-tool/check-a-resolution.mjs used to import step from office-keeper.mjs, the module that talks to the
 * office. It now takes step from its caller, so the module reaches no office module itself. The guard,
 * tests/the-merge-tool-reaches-the-office-only-through-two-modules.test.ts, reads the imports as its own case.
 *
 * WHAT THIS FILE PROVES:
 * 1. Given no second argument, {}, or a step that is not a function, checkTheResolution rejects with exactly the
 *    exported sentence, THE_RESOLUTION_CHECK_NEEDS_STEP, and the office-keeper step mock is never reached.
 * THE OFFICE-KEEPER MOCK'S step THROWS, so the old code is red at once with a plain sentence instead of reaching the
 * office. The log-and-state mock records the log and throws on fail. The arguments mock keeps the module from reading
 * the test runner's own command line, which arguments.mjs would end the process over.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control, after commit 2 (control-c2-red.log): the new file red in both cases on the old code, case 1 because the
 *   exported sentence is not a non-empty string yet, case 2 because no call line matches; the guard green; exit 1,
 *   2 failed and 4 passed over the two files.
 * - mutation 1 (m1-guard-red.log): the office-keeper import put back in check-a-resolution.mjs made the guard red in
 *   case 1 alone, naming check-a-resolution.mjs; 1 failed and 3 passed. The restore was green (m1-guard-green.log,
 *   4 passed).
 * - mutation 3 (m3-case1-red.log): taking out the first-statement check turned case 1 red, 1 failed and 1 passed. The
 *   restore was green (m3-green.log, 2 passed).
 * - restore: the new file, the guard and tests/merge-tool/one-commit-per-entry.test.ts green (c4-green.log, exit 0,
 *   3 files and 26 passed).
 */
import { expect, it, vi } from 'vitest'

const said = vi.hoisted(() => ({ log: [] as string[], officeStep: 0 }))

vi.mock('../../tools/merge-tool/arguments.mjs', () => ({
  ABSENT: 'absent',
  GIT_IDENTITY: { name: 'Synthetic queue', email: 'synthetic@example.invalid' },
  WORKDIR: '/nonexistent',
  chosen: { entry: 'synthetic-entry' },
}))

vi.mock('../../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (message: string) => {
    throw Error(message)
  },
  log: (line: string) => {
    said.log.push(line)
  },
}))

vi.mock('../../tools/merge-tool/office-keeper.mjs', () => ({
  step: async () => {
    said.officeStep += 1
    throw Error('the resolution check reached office-keeper.mjs itself')
  },
}))

import * as theCheck from '../../tools/merge-tool/check-a-resolution.mjs'

const NEEDED = Reflect.get(theCheck, 'THE_RESOLUTION_CHECK_NEEDS_STEP') as unknown

/** The function as this file calls it, so the file compiles before and after the module takes its second argument. */
type TheCheck = (entry: unknown, given?: { step?: unknown }) => Promise<unknown>
const theResolutionCheck = theCheck.checkTheResolution as TheCheck

const AN_ENTRY = { id: 'synthetic-entry', changeset: { root: '/nonexistent' }, machine: { resolution: { commit: 'synthetic' }, resolving: {} } }

/** The message checkTheResolution rejects with, so the case compares the sentence whole rather than its opening words. */
async function theRefusal(given?: { step?: unknown }): Promise<string> {
  try {
    await theResolutionCheck(AN_ENTRY, given)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw Error('checkTheResolution accepted a step it did not get')
}

it('refuses with its sentence when given no step, an empty object, or a step that is not a function', async () => {
  expect(typeof NEEDED).toBe('string')
  expect((NEEDED as string).length).toBeGreaterThan(0)

  expect(await theRefusal()).toBe(NEEDED)
  expect(await theRefusal({})).toBe(NEEDED)
  expect(await theRefusal({ step: 'not a function' })).toBe(NEEDED)

  expect(said.officeStep).toBe(0)
})

