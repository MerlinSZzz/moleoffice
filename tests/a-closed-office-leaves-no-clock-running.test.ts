// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLOSED OFFICE LEAVES NONE OF ITS CLOCKS RUNNING. Wave 13s round 61, item 5.
 *
 * MEASURED FIRST: tests/by-id-boundary.test.ts, run alone with the default heap, ran out of memory after 162 of its 171
 * tests, at 4,102 MB. Each of its tests builds an office afresh, and the heap after each test grew by about 22 MB. A
 * heap snapshot taken after seven offices had been built and closed held seven "presence clock" and seven "machine
 * clock" timers (src/server/api/events.ts). All of them were still running, and each held its own copy of the whole
 * server's code. With the two clocks stopped when the office closes, the heap after each of the file's 171 tests stayed
 * between 377 and 535 MB, and the file passed.
 *
 * WHAT THIS HOLDS:
 *   - every interval the office starts while it is built and made ready is cleared when it closes;
 *   - two offices built from one copy of the server's code keep the clocks running until the second of them closes.
 *
 * CONTROL: without the fix, the first test fails and names the two clocks' lines. MUTATIONS, each run and each red:
 *   1. the onClose hook in eventRoutes taken out: both clocks are named.
 *   2. stopTheClocks clears only the presence clock: the machine clock is named.
 *   3. the clocks stopped when any server closes, not the last: the second test fails.
 */
import { expect, it, vi } from 'vitest'
import { apiApp, buildTheFirstOfficeInAHook, freshDb } from './helpers.ts'

buildTheFirstOfficeInAHook()

/** Where in src/server an interval was started, as `file:line`, from the stack at the call. */
function whereItStarted(stack: string | undefined): string {
  const line = (stack ?? '').split('\n').find((frame) => frame.includes('/src/server/'))
  const at = line?.match(/\/(src\/server\/[^:)]+:\d+)/)
  return at?.[1] ?? `outside src/server: ${(stack ?? '').split('\n').slice(2, 4).join(' | ')}`
}

/** Watch every setInterval and clearInterval from now on, and say which intervals are still running. */
function watchTheIntervals(): { started: () => string[]; stillRunning: () => string[]; stop: () => void } {
  const realSet = globalThis.setInterval
  const realClear = globalThis.clearInterval
  const started: string[] = []
  const running = new Map<unknown, string>()
  const set = vi.spyOn(globalThis, 'setInterval').mockImplementation(((...args: Parameters<typeof setInterval>) => {
    const handle = realSet(...args)
    const where = whereItStarted(new Error().stack)
    started.push(where)
    running.set(handle, where)
    return handle
  }) as typeof setInterval)
  const clear = vi.spyOn(globalThis, 'clearInterval').mockImplementation((handle) => {
    running.delete(handle)
    realClear(handle)
  })
  return {
    started: () => [...started].sort(),
    stillRunning: () => [...running.values()].sort(),
    stop: () => {
      set.mockRestore()
      clear.mockRestore()
    },
  }
}

const theClocks = (lines: string[]): string[] => lines.filter((where) => where.startsWith('src/server/api/events.ts:'))

it('every interval the office starts is cleared when it closes', async () => {
  const db = await freshDb()
  const intervals = watchTheIntervals()
  try {
    const { app } = await apiApp()
    await app.ready()
    expect(theClocks(intervals.started()), 'the office did not start its two clocks, so this proves nothing').toHaveLength(2)
    await app.close()
    expect(intervals.stillRunning(), 'these intervals ran on after the office closed').toEqual([])
  } finally {
    intervals.stop()
    db.close()
  }
})

it('two offices from one copy of the code keep the clocks running until the second closes', async () => {
  const db = await freshDb()
  const intervals = watchTheIntervals()
  try {
    const first = (await apiApp()).app
    await first.ready()
    const second = (await apiApp()).app
    await second.ready()
    expect(theClocks(intervals.started()), 'the second office started clocks of its own').toHaveLength(2)
    await first.close()
    expect(theClocks(intervals.stillRunning()), 'the clocks stopped while the second office was still open').toHaveLength(2)
    await second.close()
    expect(intervals.stillRunning(), 'these intervals ran on after both offices closed').toEqual([])
  } finally {
    intervals.stop()
    db.close()
  }
})
