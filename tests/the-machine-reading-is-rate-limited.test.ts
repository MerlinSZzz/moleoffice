// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MACHINE READING IS READ WHEN THE PAGE LOADS AND WHEN SOMETHING SAYS IT CHANGED, AND ON A TIMER ONLY WHILE BLOCKED.
 *
 * Criterion U7 part 1 of design/settings/ACCEPTANCE.md, problem `XKsVmmINput5`, and wave 13w round 25, on a
 * decision. `GET /api/runtime` is a sweep of the machine. Until round 25 every open page read
 * it again every thirty seconds while it was shown: on the owner's office that was 1,149 reads a day, 439 ms each at
 * the median. Now the server looks for a change and announces `machine.changed`, and the page reads once for each thing
 * that says the reading may be old: that event, the stream coming back after it was down, or events lost. None while
 * hidden; one when shown again, if something was said meanwhile. The one timer left runs while the wrong-world sheet
 * blocks the page: every thirty seconds, never while hidden, and not after the sheet is gone.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A UNIT TEST AND NOT A BROWSER ONE
 * ---------------------------------------------------------------------------------------
 *
 * The subject is what the store does with a clock and three signals. Each is exact under a fake clock and with the
 * channel replaced by the signals themselves, so this drives the real store module (`src/web/lib/onemachine.ts`)
 * with `vi.useFakeTimers()`, the real `api.runtime` replaced by a counter, and `src/web/lib/channel.ts` replaced by
 * a record of who asked to be told what. An hour of fake time runs in milliseconds.
 * `tests/the-machine-reading-is-shared.test.ts` is the browser half: the requests one real tab sends.
 * tests/the-machine-changes-are-pushed.test.ts is the server half: what announces `machine.changed`.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE CASES CAN FAIL
 * ---------------------------------------------------------------------------------------
 *
 *   timer    Put a thirty-second timer back: `setInterval(() => void start(), 30_000)` in `readTheMachineOnce`.
 *            The quiet hour then holds 120 reads and case 1 goes red.
 *   joined   Delete the `owedAfterThisRead = true` line in `readBecauseItChanged`. A change heard while a read is
 *            out is then lost, and case 2 goes red.
 *   back     Delete the `whenTheStreamCameBack(readBecauseItChanged)` line. Case 3 goes red.
 *   hidden   Delete the `if (hidden())` branch of `readBecauseItChanged`. A hidden page then reads, and case 4 goes
 *            red.
 *   blocked  Delete `beat.stop()` from what `readTheMachineWhileThePageIsBlocked` returns. The read goes
 *            on after the sheet is gone, and case 5 goes red.
 *
 * Each was run against the control and then restored; the round's report records what was seen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE DOOR, REPLACED BY A COUNTER, AND THE CHANNEL, REPLACED BY THE EARS IT WAS GIVEN. `vi.hoisted` because
 * `vi.mock`'s factory is lifted above the imports, so what it closes over has to be lifted with it.
 */
const { door, channel } = vi.hoisted(() => ({
  door: { reads: 0, record: { readAt: '2026-10-11 09:00:00' } as Record<string, unknown>, answer: null as null | (() => void) },
  channel: {
    heard: new Map<(event: { name: string }) => void, readonly string[]>(),
    back: new Set<() => void>(),
    lost: new Set<() => void>(),
  },
}))

vi.mock('../src/web/api.ts', () => ({
  api: {
    runtime: (): Promise<Record<string, unknown>> => {
      door.reads += 1
      // `door.answer` set means the read is held out until the test lets it answer.
      if (door.answer === null) return Promise.resolve(door.record)
      return new Promise((resolve) => {
        door.answer = () => resolve(door.record)
      })
    },
  },
  errorMessage: (err: unknown): string => String(err),
  faultOf: (): null => null,
}))

vi.mock('../src/web/lib/channel.ts', () => ({
  hearAlways: (ear: (event: { name: string }) => void, names: readonly string[]) => {
    channel.heard.set(ear, names)
    return () => channel.heard.delete(ear)
  },
  whenTheStreamCameBack: (ear: () => void) => {
    channel.back.add(ear)
    return () => channel.back.delete(ear)
  },
  whenEventsWereLost: (ear: () => void) => {
    channel.lost.add(ear)
    return () => channel.lost.delete(ear)
  },
  useChannel: () => undefined,
}))

import {
  forgetTheMachineOnThisPage,
  readTheMachineOnce,
  readTheMachineWhileThePageIsBlocked,
} from '../src/web/lib/onemachine.ts'

/** The page's document: whether it is shown, and who listens for that changing. */
const shownListeners = new Set<() => void>()
let visibility: 'visible' | 'hidden' = 'visible'
function thePageIs(next: 'visible' | 'hidden'): void {
  visibility = next
  for (const listener of [...shownListeners]) listener()
}

/** The server says the machine changed. */
function theServerSaysItChanged(): void {
  for (const [ear, names] of [...channel.heard]) if (names.includes('machine.changed')) ear({ name: 'machine.changed' })
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  shownListeners.clear()
  ;(globalThis as unknown as { document: unknown }).document = {
    get visibilityState() {
      return visibility
    },
    get hidden() {
      return visibility === 'hidden'
    },
    addEventListener: (_name: string, listener: () => void) => shownListeners.add(listener),
    removeEventListener: (_name: string, listener: () => void) => shownListeners.delete(listener),
  }
  door.reads = 0
  door.answer = null
  forgetTheMachineOnThisPage()
})

afterEach(() => {
  forgetTheMachineOnThisPage()
  vi.useRealTimers()
  delete (globalThis as unknown as { document?: unknown }).document
})

describe('the machine reading is read when something says it changed, and on a timer only while blocked', () => {
  it('reads once when the page loads and not again in a quiet hour', async () => {
    await readTheMachineOnce()
    expect(door.reads, 'the page-load read did not happen, so the hour below proves nothing').toBe(1)
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(door.reads, 'the page read the machine with nothing saying it changed').toBe(1)
    // NON-VACUOUS: the store is listening for the event that would make it read.
    expect([...channel.heard.values()].some((names) => names.includes('machine.changed'))).toBe(true)
  })

  it('reads once for each change it is told of, and once more for a change told while a read was out', async () => {
    await readTheMachineOnce()
    theServerSaysItChanged()
    await vi.advanceTimersByTimeAsync(0)
    expect(door.reads, 'a machine.changed did not make the page read').toBe(2)

    // A READ HELD OUT, AND TWO CHANGES TOLD MEANWHILE: the read that was out may have been answered before them, so
    // one more read is owed, and only one.
    door.answer = () => undefined
    theServerSaysItChanged()
    expect(door.reads).toBe(3)
    theServerSaysItChanged()
    theServerSaysItChanged()
    expect(door.reads, 'a change told while a read was out started a second read at once').toBe(3)
    const answer = door.answer as () => void
    door.answer = null
    answer()
    await vi.advanceTimersByTimeAsync(0)
    expect(door.reads, 'the change told while a read was out was never read').toBe(4)
  })

  it('reads once when the stream comes back and once when events were lost', async () => {
    await readTheMachineOnce()
    for (const ear of [...channel.back]) ear()
    await vi.advanceTimersByTimeAsync(0)
    expect(door.reads, 'the stream came back and the page did not read').toBe(2)
    for (const ear of [...channel.lost]) ear()
    await vi.advanceTimersByTimeAsync(0)
    expect(door.reads, 'events were lost and the page did not read').toBe(3)
  })

  it('reads nothing while hidden, and once when it is shown again', async () => {
    await readTheMachineOnce()
    thePageIs('hidden')
    theServerSaysItChanged()
    for (const ear of [...channel.back]) ear()
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(door.reads, 'the page swept the machine while nobody was looking at it').toBe(1)
    thePageIs('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(door.reads, 'the page did not read what it was told while hidden once it was shown').toBe(2)
  })

  /**
   * THE ONE TIMER LEFT. The wrong-world sheet blocks every press, and no event can say another server stopped
   * answering, so while the sheet stands the page reads every thirty seconds. Only then, and not while hidden.
   */
  it('reads every thirty seconds while the page is blocked, and stops when it is not', async () => {
    await readTheMachineOnce()
    const stop = readTheMachineWhileThePageIsBlocked()
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(door.reads, 'a blocked page did not read every thirty seconds').toBe(21)
    thePageIs('hidden')
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(door.reads, 'a blocked page read while hidden').toBe(21)
    thePageIs('visible')
    stop()
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(door.reads, 'the page went on reading after the sheet was gone').toBe(21)
  })
})
