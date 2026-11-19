// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKER ASKS THE SERVER NOTHING WHILE A MERGE RUNS, AND SEES ITS END AS SOON AS BEFORE. Wave 13y round 21, item 2.
 *
 * MEASURED FIRST. The message worker was seen asking for the merge list every 2 s on live while a merge ran. A merge
 * tool run going kept the pass at two seconds, and one pass asks the server six things (counted on a made-up server
 * in round 21: the runs, the resumes, the waits, the dead-letter sweep, the merge list and the queue). A merge with a
 * suite of an hour cost about 180 requests a minute for that hour. Now a run going keeps no pace of its own: the
 * worker looks on this machine every two seconds whether the run's process is still there, and passes at once when
 * it has gone, or after thirty seconds.
 *
 * WHAT THIS HOLDS, on a made-up minute with a made-up merge run and no server at all:
 *   1. with a merge run going the whole minute, the worker passes twice, and its looks between passes ask nothing;
 *   2. a run that ends at 7 s is passed on at 8 s, which is when the two-second pass saw it before.
 *
 * CONTROL: both pass at the tip. MUTATIONS, each red, then put back: `waitAfterAPass` keeps two seconds while a merge
 * run is going (case 1); `waitForTheNextPass` no longer ends when a run has ended (case 2).
 */
import { afterEach, expect, it, vi } from 'vitest'

import { waitAfterAPass, waitForTheNextPass, type PassReport } from '../src/worker/index.ts'

type Merges = Parameters<typeof waitForTheNextPass>[1]

const QUIET: PassReport = {
  started: [], held: [], answered: [], failed: [], pickedUp: [], waitedLongEnough: [], cutOff: [], resumed: [], deadLetters: null,
  merges: { started: [], ended: [], pickedUp: [], stopped: [], held: [], bounced: [] },
}

/** A made-up merge tool run whose process is there until `endsAtMs` on the made-up clock. */
function aMergeRun(clock: { now: number }, endsAtMs: number): Merges[number] {
  return { adapter: { alive: () => clock.now < endsAtMs } } as unknown as Merges[number]
}

/**
 * The worker's loop over one made-up minute: a pass, then the wait it chooses. Returns the times the passes began.
 * The pass itself changes nothing, as a pass with only a merge run going changes nothing.
 */
async function passesInAMinute(merges: Merges, clock: { now: number }): Promise<number[]> {
  const passes: number[] = []
  const pause = async (ms: number): Promise<void> => {
    clock.now += ms
  }
  while (clock.now < 60_000) {
    passes.push(clock.now)
    const ended = await waitForTheNextPass(waitAfterAPass(QUIET, []), merges, pause)
    if (ended === 'a merge tool run ended') break
  }
  return passes
}

afterEach(() => {
  vi.restoreAllMocks()
})

it('passes twice in a minute while a merge run goes, and asks the server nothing between passes', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  const clock = { now: 0 }
  const passes = await passesInAMinute([aMergeRun(clock, Number.POSITIVE_INFINITY)], clock)
  expect(passes).toEqual([0, 30_000])
  expect(fetch).not.toHaveBeenCalled()
})

it('passes on a merge run that ended at 7 s at 8 s, as the two-second pass did', async () => {
  const clock = { now: 0 }
  const passes = await passesInAMinute([aMergeRun(clock, 7_000)], clock)
  expect(passes).toEqual([0])
  expect(clock.now).toBe(8_000)
})
