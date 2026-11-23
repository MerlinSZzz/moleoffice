// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it, vi } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { lookOrder } from '../src/look-order.ts'

it('waits for the selected recoloured pose frames and clears them on disable', async () => {
  const recipe = lookOrder.findIndex(order => order % 3 !== 0)
  let finish: ((ready: boolean) => void) | undefined
  const prepareMotion = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve })), clearMotion = vi.fn(), clearSitting = vi.fn(), release = vi.fn(), changed = vi.fn()
  const fake: any = { pack: {}, occupants: new Map([['invented', { standing: { look: 'invented', recipe } }]]), lookFrames: { ready: true, prepareMotion, clearMotion, clearSitting }, idleLookRequest: '', idleLookReady: '', lookEpoch: 1, frameLookEpoch: 1, canvas: { dataset: { lookReady: 'true' } }, sittingVersion: 0, sittingRequest: '', sittingState: 'loading', sittingPack: null, sittingCast: { release }, clearSittingLooks: (OfficeMap.prototype as any).clearSittingLooks }
  const ready = (OfficeMap.prototype as any).readyIdleLooks, clear = (OfficeMap.prototype as any).clearIdleLooks
  expect(ready.call(fake, ['invented'], changed)).toBe(false)
  expect(ready.call(fake, ['invented'], changed)).toBe(false)
  expect(prepareMotion).toHaveBeenCalledTimes(1)
  finish!(true); await Promise.resolve(); await Promise.resolve()
  expect(changed).toHaveBeenCalledTimes(1)
  expect(ready.call(fake, ['invented'], changed)).toBe(true)
  clear.call(fake)
  expect(clearMotion).toHaveBeenCalledTimes(1)
  expect(clearSitting).toHaveBeenCalledTimes(1)
  expect(release).toHaveBeenCalledTimes(1)
  expect(ready.call(fake, ['invented'], changed)).toBe(false)
})
