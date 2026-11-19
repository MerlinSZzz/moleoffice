// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { sayTheHold, watchTheLoop } from '../src/server/lib/loop-watch.ts'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function aFunctionThatHoldsTheThread(): void {
  const until = performance.now() + 1_300
  while (performance.now() < until) {
    // Hold this thread so that the watch must read it from another thread.
  }
}

it('names a function that holds the thread for more than half a second', async () => {
  const lines: string[] = []
  const watch = watchTheLoop({ every: 20, heldOver: 500, open: () => [], log: (line) => lines.push(line) })
  try {
    // Let the watcher start before the hold, and then wait for its line instead of assuming a tick time.
    await wait(750)
    aFunctionThatHoldsTheThread()
    const deadline = performance.now() + 1_500
    while (lines.length === 0 && performance.now() < deadline) await wait(10)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.some((line) => line.includes(aFunctionThatHoldsTheThread.name))).toBe(true)
  } finally {
    watch.stop()
  }
})

it('formats the captured function through the hold formatter', () => {
  const line = sayTheHold(600, 1_000, [], [], null, [aFunctionThatHoldsTheThread.name])
  expect(line).toContain(aFunctionThatHoldsTheThread.name)
  expect(sayTheHold(600, 1_000, [], [], null, [])).not.toContain(aFunctionThatHoldsTheThread.name)
})
