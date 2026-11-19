// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIX-ROUND WAIT USES WHAT ITS CALLER GIVES.
 *
 * tools/merge-tool/fix-round.mjs used to import sleep and step from office-keeper.mjs, the module that talks to the
 * office. It now takes both from its caller, so the module reaches no office module itself. The guard,
 * tests/the-merge-tool-reaches-the-office-only-through-two-modules.test.ts, reads the imports as its own case.
 *
 * WHAT THIS FILE PROVES:
 * 1. waitForTheFixRound looks again through the sleep and step it is given: it sleeps 10 seconds before each look,
 *    asks with 'fix-round-looked' and no facts, stops when the round opens, and gives back the last entry the step
 *    answered.
 * 2. Given no functions, or only one, it throws the sentence naming what it needs before it calls either given
 *    function, and that function is not called. The sentence is the module's exported constant, and the case first
 *    checks it is a non-empty string, because toThrow(undefined) passes on any error.
 * THE OFFICE-KEEPER MOCK'S sleep AND step THROW, so the old code is red at once with a plain sentence instead of
 * reaching the office. The log-and-state mock records the log and throws on fail.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <files>`, logs kept outside the checkout:
 * - control, after commit 1 (control-c1-red.log): the new file red in all three cases on the old code, case 1 and
 *   case 2 with the office-keeper sentence, case 3 with no matching call line; the guard green; exit 1, 3 failed and
 *   4 passed over the two files.
 * - mutation 1, after commit 3 (m1-guard-red.log): the office-keeper import put back in fix-round.mjs made the guard
 *   red in case 1 alone, naming fix-round.mjs; 1 failed and 3 passed. The restore was green (m1-guard-green.log,
 *   4 passed).
 * - mutation 3 (m3-case1-red.log): the loop calling the given step with 'fix-round-checked' turned case 1 red, 1
 *   failed and 2 passed. The restore was green (m3-green.log, 3 passed).
 * - mutation 4 (m4-case2-red.log): taking out the first-statement check turned case 2 red with `sleep is not a
 *   function`, 1 failed and 2 passed. The restore was green (m4-green.log, 3 passed).
 * - restore: the new file, the guard and tests/the-office-opens-a-fix-round-for-a-few-red-entry.test.ts green
 *   (c3-green.log, exit 0, 3 files and 17 passed).
 *
 * ROUND 203 READS THE SENTENCE RATHER THAN COPYING IT: the case above turns red before commit 2, when the module
 * exports no constant (r203-c1-red.log), and green once it does (r203-c2-green.log).
 */
import { expect, it, vi } from 'vitest'

const said = vi.hoisted(() => ({ log: [] as string[] }))

vi.mock('../../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (message: string) => {
    throw Error(message)
  },
  log: (line: string) => {
    said.log.push(line)
  },
}))

vi.mock('../../tools/merge-tool/office-keeper.mjs', () => ({
  sleep: async () => {
    throw Error('the fix-round wait reached office-keeper.mjs itself')
  },
  step: async () => {
    throw Error('the fix-round wait reached office-keeper.mjs itself')
  },
}))

import { waitForTheFixRound } from '../../tools/merge-tool/fix-round.mjs'
import * as theFixRound from '../../tools/merge-tool/fix-round.mjs'

const NEEDED = Reflect.get(theFixRound, 'THE_FIX_ROUND_WAIT_NEEDS_SLEEP_AND_STEP')

/** The function as this file calls it, so the file compiles before and after the module takes its second argument. */
type TheWait = (entry: unknown, given?: { sleep?: unknown; step?: unknown }) => Promise<unknown>
const theWait = waitForTheFixRound as TheWait

/** An entry waiting for a fix round whose bound is an hour from now, so the wait is inside it. */
function aWaitingEntry(): Record<string, unknown> {
  return {
    id: 'synthetic-entry',
    state: 'testing',
    machine: { waitsForAFixRound: { dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), until: 'synthetic bound' } },
  }
}

it('looks through the given sleep and step until the round opens, and gives back the last entry', async () => {
  const waiting = aWaitingEntry()
  const opened = {
    ...waiting,
    machine: { waitsForAFixRound: { dueAt: (waiting.machine as { waitsForAFixRound: { dueAt: string } }).waitsForAFixRound.dueAt, until: 'synthetic bound', opened: 'synthetic round' } },
  }
  const sleeps: number[] = []
  const steps: Array<[string, unknown]> = []
  const answers = [waiting, opened]
  const sleep = async (milliseconds: number) => {
    sleeps.push(milliseconds)
  }
  const step = async (name: string, facts: unknown) => {
    steps.push([name, facts])
    return answers[steps.length - 1]
  }

  const result = await theWait(waiting, { sleep, step })

  expect(sleeps).toEqual([10000, 10000])
  expect(steps).toEqual([
    ['fix-round-looked', {}],
    ['fix-round-looked', {}],
  ])
  expect(result).toBe(opened)
})

it('refuses with its sentence when given no functions or only one, and calls neither', async () => {
  expect(typeof NEEDED).toBe('string')
  expect(NEEDED).not.toBe('')
  const waiting = aWaitingEntry()
  const sleep = vi.fn(async () => {})
  const step = vi.fn(async () => waiting)

  await expect(theWait(waiting)).rejects.toThrow(NEEDED)
  await expect(theWait(waiting, {})).rejects.toThrow(NEEDED)
  await expect(theWait(waiting, { sleep })).rejects.toThrow(NEEDED)
  await expect(theWait(waiting, { step })).rejects.toThrow(NEEDED)

  expect(sleep).not.toHaveBeenCalled()
  expect(step).not.toHaveBeenCalled()
})

