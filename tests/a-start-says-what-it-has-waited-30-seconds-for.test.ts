// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { chromium } from 'playwright'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { closeTheBrowserThisWorkerShares, liveApp } from './helpers.ts'
const THE_MODULE = './a-start-names-its-wait.ts'

type Waits = { wait(what: string): void; done(): void }
type Module = {
  A_WAIT_IS_NAMED_AFTER_MS: number
  namedWaits(who: string, say?: (line: string) => void, afterMs?: number): Waits
}

/** What liveApp's named waits were asked and what they said, under the shorter threshold the mock below gives them. */
const heard = vi.hoisted(() => ({ soonMs: 1_000, whos: [] as string[], waits: [] as string[], lines: [] as string[], done: 0 }))

vi.mock('./a-start-names-its-wait.ts', async (importOriginal) => {
  const real = await importOriginal<Module>()
  return {
    ...real,
    namedWaits: (who: string): Waits => {
      heard.whos.push(who)
      const waits = real.namedWaits(who, (line) => { heard.lines.push(line) }, heard.soonMs)
      return {
        wait: (what) => {
          heard.waits.push(what)
          waits.wait(what)
        },
        done: () => {
          heard.done += 1
          waits.done()
        },
      }
    },
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('named waits', () => {
  it('1: a wait that lasts 30 seconds writes one line with who waits, the seconds so far and what for, and one that ends sooner writes none', async () => {
    const real = await vi.importActual<Module>(THE_MODULE)
    expect(real.A_WAIT_IS_NAMED_AFTER_MS, 'a wait is named after 30 seconds, as asked').toBe(30_000)
    vi.useFakeTimers()
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const waits = real.namedWaits('the made-up start')
    waits.wait('the first made-up answer')
    await vi.advanceTimersByTimeAsync(29_999)
    expect(warned, 'nothing is said before 30 seconds').not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(warned.mock.calls).toEqual([['the made-up start has waited 30 s so far for the first made-up answer']])
    await vi.advanceTimersByTimeAsync(90_000)
    expect(warned, 'a wait says so once').toHaveBeenCalledTimes(1)

    waits.wait('the second made-up answer')
    await vi.advanceTimersByTimeAsync(10_000)
    waits.wait('the third made-up answer')
    await vi.advanceTimersByTimeAsync(20_000)
    waits.done()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(warned, 'a wait that ended within 30 seconds said nothing, and the next wait counts from its own start').toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount(), 'done leaves no timer behind').toBe(0)
  })

  it('2: liveApp names each stage it waits on, says the one Chromium stalled in, and leaves no wait behind when the start fails', async () => {
    // A browser that an earlier test file in this process started would be taken without a launch, and there would be
    // no launch to stall.
    await closeTheBrowserThisWorkerShares()
    let refuse!: (error: Error) => void
    const blocked = new Promise<Awaited<ReturnType<typeof chromium.launch>>>((_resolve, reject) => { refuse = reject })
    const launch = vi.spyOn(chromium, 'launch').mockImplementationOnce(() => blocked)
    const stages: string[] = []
    const name = 'a-start-names-its-wait'
    const started = liveApp({ name, viewport: { width: 640, height: 480 }, onSetupWait: (what) => { stages.push(what) } })
    let failed: unknown = null
    try {
      await expect.poll(() => heard.lines.find((line) => line.endsWith('for Chromium to launch')), { timeout: 30_000 }).toBeDefined()
      const who = heard.whos.at(-1)!
      expect(who, 'the named waits say which test\'s stack is waiting').toContain(name)
      expect(heard.lines).toContain(`${who} has waited ${String(heard.soonMs / 1000)} s so far for Chromium to launch`)
    } finally {
      refuse(new Error('The test released the stalled Chromium launch.'))
      failed = await started.then(() => null, (error: unknown) => error)
      launch.mockRestore()
    }
    expect(failed).toMatchObject({ message: 'The test released the stalled Chromium launch.' })
    expect(heard.waits, 'every stage liveApp names for onSetupWait is a named wait, in the same order').toEqual(stages)
    expect(heard.done, 'each start ended its named waits').toBe(heard.whos.length)
    const saidSoFar = heard.lines.length
    await new Promise((done) => setTimeout(done, heard.soonMs * 2))
    expect(heard.lines.slice(saidSoFar), 'a failed start leaves no wait that speaks later').toEqual([])
    for (const line of heard.lines) {
      expect(stages.some((stage) => line.endsWith(` so far for ${stage}`)), `"${line}" names a stage of the start`).toBe(true)
    }
  }, 120_000)
})

