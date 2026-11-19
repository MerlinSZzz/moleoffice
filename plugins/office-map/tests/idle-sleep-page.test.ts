// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it, vi } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'

it('clears sleep sources when the last recoloured sleeper leaves the scene', () => {
  const clearSleep = vi.fn(), prepareSleep = vi.fn()
  const fake: any = { pack: {}, lookEpoch: 1, lookFrames: { ready: true, clearSleep, prepareSleep }, whereaboutsByKey: new Map([['invented', { where: 'desk' }]]), occupants: new Map([['invented', { standing: { look: 'invented', recipe: 1 } }]]) }
  fake.sleepCast = { release: vi.fn() }; fake.sleepGeneration = 0
  fake.clearSleepingLooks = (OfficeMap.prototype as any).clearSleepingLooks.bind(fake)
  ;(OfficeMap.prototype as any).prepareSleepingLooks.call(fake)
  expect(clearSleep).toHaveBeenCalledOnce()
  expect(prepareSleep).not.toHaveBeenCalled()
})
