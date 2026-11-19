// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it, vi } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'

it('cancels pending artwork bounds when the selected pack disappears', () => {
  let late: ((value: any) => void) | undefined
  const cancelled = vi.fn(), changed = vi.fn(), layout = {}, pack = {}
  const fake: any = { layout, pack, closed: false, furnitureLayout: null, furniturePack: null, furnitureValue: null, furnitureReady: false, furniturePending: false,
    furnitureBuild: { start: (_work: any, done: any) => { late = done }, cancel: cancelled }, motionFurnitureSteps: function* () { yield; return [] } }
  fake.clearMotionFurniture = () => (OfficeMap.prototype as any).clearMotionFurniture.call(fake)
  const ready = (OfficeMap.prototype as any).readyMotionFurniture
  expect(ready.call(fake, changed)).toBe(false)
  expect(fake.furniturePending).toBe(true)
  fake.pack = null
  expect(ready.call(fake, changed)).toBe(false)
  expect(fake.furniturePending).toBe(false)
  expect(cancelled).toHaveBeenCalled()
  late!([{ x: 1, y: 1, width: 1, height: 1 }])
  expect(changed).not.toHaveBeenCalled()
  expect(fake.furnitureValue).toBeNull()
})
