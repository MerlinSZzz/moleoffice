// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { bindActions, actorScale } from '../src/action-binding.ts'
import { facilityPlan } from '../src/ownership-facilities.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { mapFixture } from './tuft-action-map-fixture.ts'
import { flush } from './tuft-action-fixture.ts'

afterEach(async () => { pageActionPacks.setNeeds([]); await flush(); releaseMapSurfaces(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('keeps the worker’s lamp or paper stack, laptop and mug attached when its action desk moves', () => {
  const f = mapFixture(), plan = facilityPlan([f.actor.key], 'generated-room')
  f.layout.seats = Object.fromEntries(plan.seats); f.layout.pieces = plan.pieces; f.layout.obstacles = plan.obstacles
  const bound = bindActions(f.layout, f.model), seat = f.layout.seats[f.actor.key]!, scale = actorScale(f.actor)
  expect(bound.bindings.get(f.actor.key)?.action, bound.rejected.join(', ')).toBe('desk')
  const desk = bound.layout.pieces.find(p => p.sprite === 'worker-desk' && Math.abs(p.x - (seat.foot.x + 19 * scale)) < .001)!
  expect(desk, 'action desk').toBeDefined()
  // The desk has a lamp or a paper stack at its left end, never both.
  for (const sprite of [plan.pieces.some(p => p.sprite === 'paper-stack') ? 'paper-stack' : 'desk-lamp', 'laptop-back', 'coffee-mug']) {
    const before = f.layout.pieces.filter(p => p.sprite === sprite), after = bound.layout.pieces.filter(p => p.sprite === sprite)
    expect(before, `${sprite} before`).toHaveLength(1)
    expect(after, `${sprite} after`).toHaveLength(1)
    const p = after[0]!
    expect(p.x).toBeGreaterThanOrEqual(desk.x - 40)
    expect(p.x + p.width).toBeLessThanOrEqual(desk.x + desk.width + 40)
    expect(p.y).toBeGreaterThanOrEqual(desk.y - 50)
    expect(p.y + p.height).toBeLessThanOrEqual(desk.y + desk.height + 40)
  }
  f.map.dispose()
})

it('keeps the desk plant on its own contact desk as the work pose moves and scales it', () => {
  const f = mapFixture(), plan = facilityPlan([f.actor.key], 'generated-room')
  f.layout.seats = Object.fromEntries(plan.seats); f.layout.pieces = plan.pieces; f.layout.obstacles = plan.obstacles
  const originalDesk = plan.pieces.find(p => p.sprite === 'worker-desk')!, originalPlant = plan.pieces.find(p => p.sprite === 'desk-plant')!
  const bound = bindActions(f.layout, f.model), desk = bound.layout.pieces.find(p => p.sprite === 'worker-desk')!, plants = bound.layout.pieces.filter(p => p.sprite === 'desk-plant')
  expect(bound.bindings.get(f.actor.key)?.action, bound.rejected.join(', ')).toBe('desk')
  expect(plants).toHaveLength(1)
  const plant = plants[0]!, ratio = desk.width / originalDesk.width
  expect(plant.x).toBeCloseTo(desk.x + (originalPlant.x - originalDesk.x) * ratio, 6)
  expect(plant.y).toBeCloseTo(desk.y + (originalPlant.y - originalDesk.y) * ratio, 6)
  expect(plant.width).toBeCloseTo(originalPlant.width * ratio, 6)
  expect(plant.height).toBeCloseTo(originalPlant.height * ratio, 6)
  f.map.dispose()
})

it('rests the lamp or paper stack, laptop and mug on the resized contact desktop', () => {
  const f = mapFixture(), plan = facilityPlan([f.actor.key], 'generated-room')
  f.layout.seats = Object.fromEntries(plan.seats); f.layout.pieces = plan.pieces; f.layout.obstacles = plan.obstacles
  const bound = bindActions(f.layout, f.model), desk = bound.layout.pieces.find(p => p.sprite === 'worker-desk')!
  expect(bound.bindings.get(f.actor.key)?.action, bound.rejected.join(', ')).toBe('desk')
  // The desk has a lamp or a paper stack at its left end, never both.
  for (const sprite of [plan.pieces.some(p => p.sprite === 'paper-stack') ? 'paper-stack' : 'desk-lamp', 'laptop-back', 'coffee-mug']) {
    const parts = bound.layout.pieces.filter(p => p.sprite === sprite)
    expect(parts, sprite).toHaveLength(1)
    // Their base belongs to the upper half of the contact sprite, where the tabletop is drawn.
    expect(parts[0]!.y + parts[0]!.height, `${sprite} base`).toBeGreaterThanOrEqual(desk.y)
    expect(parts[0]!.y + parts[0]!.height, `${sprite} base`).toBeLessThanOrEqual(desk.y + desk.height / 2)
  }
  f.map.dispose()
})
