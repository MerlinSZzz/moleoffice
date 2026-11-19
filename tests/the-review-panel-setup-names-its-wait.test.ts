// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chromium } from 'playwright'
import { closeTheBrowserThisWorkerShares, liveApp } from './helpers.ts'
import { reviewPanelSetup } from './review-panel-setup.ts'

afterEach(() => vi.useRealTimers())

describe('a review panel setup wait', () => {
  it('refuses a stalled start at its own deadline and names the stage', async () => {
    vi.useFakeTimers()
    const waiting = reviewPanelSetup('launching Chromium', 30_000, () => new Promise<never>(() => {}))
    let refused: unknown
    void waiting.catch((error: unknown) => { refused = error })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refused).toMatchObject({
      message: 'Review panel setup failed while launching Chromium.',
      cause: { message: 'Review panel setup: launching Chromium did not finish within 30000 ms.' },
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('names the current wait when startup moved to a different resource', async () => {
    vi.useFakeTimers()
    let resource = 'the API server'
    const waiting = reviewPanelSetup('starting the browser stack', 30_000, () => new Promise<never>(() => {}), undefined, () => resource)
    let refused: unknown
    void waiting.catch((error: unknown) => { refused = error })
    await vi.advanceTimersByTimeAsync(10_000)
    resource = 'Chromium to launch'
    await vi.advanceTimersByTimeAsync(20_000)
    expect(refused).toMatchObject({ cause: { message: 'Review panel setup: starting the browser stack did not finish within 30000 ms. Last startup wait: Chromium to launch.' } })
  })

  it('checks synchronous fixture work without waiting for a timer to run', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(300_001)
    try {
      await expect(reviewPanelSetup('building the synthetic database', 300_000, async (checkpoint) => {
        checkpoint()
        return 'unfinished'
      })).rejects.toMatchObject({ cause: { message: 'Review panel setup: building the synthetic database did not finish within 300000 ms.' } })
    } finally { clock.mockRestore() }
  })

  it('disposes of a resource that arrives after its start was refused', async () => {
    vi.useFakeTimers()
    let answer!: (value: string) => void
    const dispose = vi.fn(async () => {})
    const waiting = reviewPanelSetup('starting the API', 30_000, () => new Promise<string>((resolve) => { answer = resolve }), dispose)
    let refused: unknown
    void waiting.catch((error: unknown) => { refused = error })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refused).toMatchObject({ message: 'Review panel setup failed while starting the API.' })
    answer('late server')
    await vi.advanceTimersByTimeAsync(0)
    expect(dispose).toHaveBeenCalledWith('late server')
  })

  it('disposes of a synchronous result that arrives past the deadline', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(31_000)
    const dispose = vi.fn(async () => {})
    try {
      await expect(reviewPanelSetup('copying the synthetic database', 30_000, async () => 'late copy', dispose)).rejects.toThrow('copying the synthetic database')
      expect(dispose).toHaveBeenCalledWith('late copy')
    } finally { clock.mockRestore() }
  })

  it('identifies a Chromium launch that stalls after the real API and page server started', async () => {
    // A browser that an earlier test file in this process started would be taken without a launch, and
    // there would be no launch to stall.
    await closeTheBrowserThisWorkerShares()
    let refuse!: (error: Error) => void
    const blocked = new Promise<Awaited<ReturnType<typeof chromium.launch>>>((_resolve, reject) => { refuse = reject })
    const launch = vi.spyOn(chromium, 'launch').mockImplementationOnce(() => blocked)
    let resource = 'the browser stack to begin'
    const started = liveApp({ name: 'review-setup-stalled-browser', viewport: { width: 640, height: 480 }, onSetupWait: (what) => { resource = what } })
    try {
      await expect.poll(() => resource, { timeout: 60_000 }).toBe('Chromium to launch')
      await expect(reviewPanelSetup('starting the browser stack', 3000, () => started, (late) => late.stop(), () => resource)).rejects.toMatchObject({
        cause: { message: 'Review panel setup: starting the browser stack did not finish within 3000 ms. Last startup wait: Chromium to launch.' },
      })
      expect(launch).toHaveBeenCalledOnce()
    } finally {
      refuse(new Error('The test released the stalled Chromium launch.'))
      await expect(started).rejects.toThrow('The test released the stalled Chromium launch.')
      launch.mockRestore()
    }
  }, 60_000)

  it('returns a completed stage and removes its deadline timer', async () => {
    vi.useFakeTimers()
    await expect(reviewPanelSetup('pairing the browser', 30_000, async () => 'paired')).resolves.toBe('paired')
    expect(vi.getTimerCount()).toBe(0)
  })
})
