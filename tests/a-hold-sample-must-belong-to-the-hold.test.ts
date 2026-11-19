// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it, vi } from 'vitest'
import { theSampleDuring } from '../src/server/lib/a-probe-of-the-main-thread.ts'
import { watchTheLoop } from '../src/server/lib/loop-watch.ts'

it('uses only a sample taken during the hold before the heartbeat moved', () => {
  const valid = { at: 150, requestedBeat: 90, beatAtPause: 90, frames: ['valid'] }
  const late = { at: 151, requestedBeat: 90, beatAtPause: 145, frames: ['late'] }
  const outside = { at: 201, requestedBeat: 90, beatAtPause: 90, frames: ['outside'] }
  expect(theSampleDuring([valid, late, outside], 100, 200)).toEqual(valid)
  expect(theSampleDuring([late], 100, 200)).toBeUndefined()
  expect(theSampleDuring([outside], 100, 200)).toBeUndefined()
  expect(theSampleDuring([{ ...valid, at: 99 }], 100, 200)).toBeUndefined()
  expect(theSampleDuring([{ ...valid, frames: [] }], 100, 200)).toBeUndefined()
})

const standIn = vi.hoisted(() => ({ workers: [] as { emit(event: string, value: unknown): void }[] }))
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  class Worker extends EventEmitter {
    constructor() { super(); standIn.workers.push(this) }
    unref() { return this }
    terminate() { return Promise.resolve(0) }
  }
  return { Worker }
})

for (const kind of ['message', 'error'] as const) {
  it(`reports the probe's ${kind} failure once`, () => {
    const lines: string[] = []
    const failure = new Error('made-up inspector failure')
    const watch = watchTheLoop({ every: 100_000, heldOver: 500, open: () => [], log: line => lines.push(line) })
    try {
      const worker = standIn.workers.at(-1)
      expect(worker).toBeDefined()
      worker!.emit(kind, kind === 'message' ? { error: failure.message } : failure)
      worker!.emit(kind, kind === 'message' ? { error: failure.message } : failure)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain(failure.message)
    } finally { watch.stop() }
  })
}
