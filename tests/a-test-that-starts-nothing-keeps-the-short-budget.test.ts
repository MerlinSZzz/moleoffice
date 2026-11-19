// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST THAT STARTS NOTHING KEEPS THE RUNNER'S FIVE-SECOND BUDGET.
 *
 * This is the short half of the rule in tests/how-long-a-test-may-take.ts, and it is a file of its
 * own because the two halves cannot live together: a test file is either on the long side of the
 * rule or on the short side, and the budget is fixed when the file is collected. Its twin,
 * tests/a-test-that-starts-something-gets-the-time-to-do-it.test.ts, is the long half and carries
 * the account of the fault both halves are for.
 *
 * WHY THE SHORT HALF MATTERS. It would be easy to end the timeouts by giving the whole suite thirty
 * seconds. That would also mean a test that only calls functions, and hangs because the function
 * it calls hangs, sits there for thirty seconds before saying so — six times longer, for a fault
 * the long budget does nothing to help. Most of this suite is that kind of test.
 *
 * THIS FILE WRITES NONE OF THE WORDS THE RULE LOOKS FOR, ON PURPOSE. The rule reads a test file's
 * own source and looks for the name of something it starts. So this file says "a browser" and "a
 * process" in words and never names one of the functions that start them. Writing one of those
 * names anywhere in this file, in a comment as much as in the code, would move the file to the
 * long side and the test below would go red — which is the rule working, and is the one thing to
 * know before editing this file.
 *
 * WHAT GOES RED WHEN THE RULE BREAKS. Make the rule answer yes for every file — or give the whole
 * suite thirty seconds in vitest.config.ts — and this test fails.
 */
import { describe, expect, it } from 'vitest'
import { A_TEST_THAT_STARTS_SOMETHING } from './how-long-a-test-may-take.ts'

describe('the budget this file was given', () => {
  it('is not the long one, because this file starts nothing', (ctx) => {
    expect(ctx.task.timeout).toBeLessThan(A_TEST_THAT_STARTS_SOMETHING)
  })

  /**
   * Five seconds is the test runner's own default, not a number this repository sets. It is
   * asserted here so that the day it changes, somebody reads this file and decides whether the
   * short half of the rule still says what it means.
   */
  it('is the five seconds the runner gives a test by default', (ctx) => {
    expect(ctx.task.timeout).toBe(5_000)
  })
})
