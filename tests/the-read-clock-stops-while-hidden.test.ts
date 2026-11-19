// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READ CLOCK: AT MOST EVERY THIRTY SECONDS, AND NEVER WHILE THE PAGE IS HIDDEN.
 *
 * Criterion U7 part 1 of design/settings/ACCEPTANCE.md, and problem 1O_hor2KlyPY. The Home page's
 * Running-now column read three doors every thirty seconds on a `setInterval` anchored at mount,
 * with no `document.hidden` guard: one open tab cost the server about 0.66 MB and four `api_calls`
 * rows every thirty seconds whether or not anybody was looking. The fix was `src/web/lib/oneclock.ts`,
 * one clock for every automatic read, and this file holds that clock's rule on a fake clock.
 *
 * WHO RIDES THE CLOCK NOW. The Running-now column and the home page's sessions panel have both left
 * Home, and the panel's code was removed in wave 13y round 32. Two readers are left: the machine reading of a page the wrong-world sheet
 * blocks (`readTheMachineWhileThePageIsBlocked` in `src/web/lib/onemachine.ts`), and the beat of a
 * conversation read in another project (src/web/components/Chat.tsx). The interval here is the
 * first one's, `WHILE_BLOCKED_READ_EVERY_MS`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A UNIT TEST AND NOT A BROWSER ONE
 * ---------------------------------------------------------------------------------------
 *
 * The subject is arithmetic on a clock: how many times a thirty-second timer fires in an hour, and
 * whether the callback looks at `document.hidden`. Both are exact under a fake clock and neither
 * needs a browser, so this drives the real module with `vi.useFakeTimers()` and a count in place of
 * the read. `tests/the-machine-reading-is-rate-limited.test.ts` is the same shape for the rest of
 * `onemachine`.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE CASES CAN FAIL
 * ---------------------------------------------------------------------------------------
 *
 *   hidden branch deleted       Delete the `document.hidden` branch in `onTheBeat`. The hidden hour
 *                               then reads 120 times and "reads nothing at all while hidden" goes
 *                               red.
 *   hidden branch not rescheduling  Replace the branch's `arm()` with a plain `return`. The page
 *                               never reads again after it comes back, and "reads again once the
 *                               page is visible" goes red.
 *   interval shortened          Set `WHILE_BLOCKED_READ_EVERY_MS` in src/web/lib/onemachine.ts to
 *                               5_000. An hour then holds 720 automatic reads, and the ceiling this
 *                               file works out from the number itself goes red.
 *   settle anchoring deleted    Arm from a fixed `setInterval(read, everyMs)` instead of from the
 *                               settle. The five-second read pushes the next one to 60 s and
 *                               "counts the thirty seconds from when the last read settled" goes
 *                               red.
 *
 * Each is run against a control first and then restored; the report records what was seen.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { aMachineReadClock, type MachineReadClock } from '../src/web/lib/oneclock.ts'

/**
 * THE INTERVAL THE BLOCKED PAGE ACTUALLY USES, read out of the file that declares it so a shortened
 * interval cannot agree with this test and disagree with the page.
 *
 * THE IMPORT HAPPENS BEFORE `document` EXISTS: the browser modules read `window.localStorage` at module scope, and several of them touch
 * `document.documentElement` when there is a document at all. Installing the smallest window first
 * and leaving `document` out until a test needs it keeps those module-scope lines out of the way.
 */
let WHILE_BLOCKED_READ_EVERY_MS: number

/** The page's own clock. `document.hidden` is all of it the module reads outside a test. */
function thePageIs(hidden: boolean): void {
  ;(globalThis as unknown as { document: { hidden: boolean } }).document = { hidden }
}

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => void store.set(k, v),
    removeItem: (k: string): void => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const machine = await import('../src/web/lib/onemachine.ts')
  WHILE_BLOCKED_READ_EVERY_MS = machine.WHILE_BLOCKED_READ_EVERY_MS
})

beforeEach(() => {
  vi.useFakeTimers()
  thePageIs(false)
})

afterEach(() => {
  vi.useRealTimers()
  delete (globalThis as unknown as { document?: unknown }).document
})

/** A read that is counted and settles at once, so the tests are about the clock and not the read. */
interface CountedRead {
  clock: MachineReadClock
  at: number[]
  inFlight: boolean
}

function aCountedRead(settlesAfterMs = 0): CountedRead {
  const at: number[] = []
  const held: CountedRead = { clock: null as unknown as MachineReadClock, at, inFlight: false }
  const start = Date.now()
  held.clock = aMachineReadClock({
    everyMs: WHILE_BLOCKED_READ_EVERY_MS,
    inFlight: () => held.inFlight,
    read: () => {
      at.push(Date.now() - start)
      held.inFlight = true
      setTimeout(() => {
        held.inFlight = false
        held.clock.settled()
      }, settlesAfterMs)
    },
  })
  return held
}

describe('the read clock', () => {
  it('makes at most one hundred and twenty automatic reads in an hour, with no read before the first beat', async () => {
    const read = aCountedRead()
    read.clock.arm()
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(read.at.length, 'an hour at one read every thirty seconds is at most 120').toBeLessThanOrEqual(120)
    // NON-VACUOUS: the timer really ran, rather than the hour passing with nothing scheduled.
    expect(read.at.length, 'no automatic read happened at all, so the ceiling was never tested').toBeGreaterThanOrEqual(119)
    // AND THE CEILING THE BLOCKED PAGE'S OWN CONSTANT NAMES, worked out from the number itself.
    expect(Math.floor((60 * 60 * 1000) / WHILE_BLOCKED_READ_EVERY_MS), 'WHILE_BLOCKED_READ_EVERY_MS is shorter than 30 seconds').toBeLessThanOrEqual(120)
  })

  /**
   * MUTATION. Delete the `document.hidden` branch in `onTheBeat` and this goes red.
   */
  it('reads nothing at all while the page is hidden', async () => {
    const read = aCountedRead()
    read.clock.arm()
    thePageIs(true)
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(read.at, 'the clock read while nobody was looking at the page').toEqual([])
  })

  /**
   * AND A HIDDEN PAGE THAT COMES BACK STILL RESPECTS THE THIRTY SECONDS. A branch that stopped the
   * timer when the page hid would leave a visible page that never reads again.
   *
   * MUTATION. Replace the reschedule in the hidden branch with a plain `return` and no read ever
   * happens after the page comes back, so this goes red.
   */
  it('reads again once the page is visible and the thirty seconds have passed', async () => {
    const read = aCountedRead()
    read.clock.arm()
    thePageIs(true)
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(read.at).toEqual([])

    thePageIs(false)
    await vi.advanceTimersByTimeAsync(WHILE_BLOCKED_READ_EVERY_MS)
    expect(read.at.length, 'the clock never read again after the page came back').toBe(1)
  })

  /**
   * MUTATION. Arm from a fixed `setInterval(read, everyMs)` instead: the five-second read pushes the
   * next one to 60 s and this goes red.
   */
  it('counts the thirty seconds from when the last read settled, not from when the timer was armed', async () => {
    const read = aCountedRead(5_000)
    read.clock.arm()
    await vi.advanceTimersByTimeAsync(WHILE_BLOCKED_READ_EVERY_MS)
    expect(read.at, 'the first beat did not fire at thirty seconds').toEqual([WHILE_BLOCKED_READ_EVERY_MS])

    // The read settled five seconds in, so the next beat is at 65 s. At 60 s there is nothing.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(read.at, 'the next read was counted from the arm, not from the settle').toEqual([WHILE_BLOCKED_READ_EVERY_MS])
    await vi.advanceTimersByTimeAsync(5_000)
    expect(read.at, 'the next read did not land thirty seconds after the settle').toEqual([
      WHILE_BLOCKED_READ_EVERY_MS,
      WHILE_BLOCKED_READ_EVERY_MS + 35_000,
    ])
  })

  it('does not stack a read on one already out', async () => {
    const read = aCountedRead()
    // A read that never settles: a person pressed and the server is slow.
    read.inFlight = true
    read.clock.arm()
    await vi.advanceTimersByTimeAsync(10 * WHILE_BLOCKED_READ_EVERY_MS)
    expect(read.at, 'the clock stacked a second read on one already out').toEqual([])

    read.inFlight = false
    await vi.advanceTimersByTimeAsync(WHILE_BLOCKED_READ_EVERY_MS)
    expect(read.at.length, 'the clock never read once the read in hand finished').toBe(1)
  })

  it('starts the thirty seconds again after a press, which the clock never delayed', async () => {
    const read = aCountedRead()
    read.clock.arm()

    // A PRESS IS NOT THE TIMER: the caller reads at once and then tells the clock it settled.
    read.at.push(0)
    read.clock.settled()
    await vi.advanceTimersByTimeAsync(WHILE_BLOCKED_READ_EVERY_MS - 1)
    expect(read.at, 'the clock read again before the thirty seconds a press restarted').toEqual([0])
    await vi.advanceTimersByTimeAsync(1)
    expect(read.at.length, 'the clock did not read after the thirty seconds a press restarted').toBe(2)
  })
})
