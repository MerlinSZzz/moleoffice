// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import village from '../assets/village-catalog.json'
import sitting from '../assets/sitting-looks/sitting.json'
import { standingLooks } from '../src/appearance.ts'
import { chooseIdleOuting } from '../src/idle-places.ts'
import { IDLE_ROUTE_STEP } from '../src/idle-route.ts'
import { bodiesOverlap, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { DEFAULT_MOLE_SCALE, PAPER_MEETING_SPACING, SITTING_SPACING, sittingSpacing } from '../src/walks.ts'
import type { Layout } from '../src/geometry.ts'
import type { SpriteFrame } from '../src/pack.ts'

const walking = village.sprites as unknown as Record<string, SpriteFrame>
const frames = sitting.sprites as unknown as Record<string, SpriteFrame>
const body = (look: typeof standingLooks[number], scale: number) => visualBodyBounds(look, scale, walking)!
const names = (look: string) => [`sit-${look}-down`, `sit-${look}`, `sit-${look}-up`]
const rightExtent = (frame: SpriteFrame, scale: number) => (frame.trim![2]! - frame.anchor![0]!) * scale

it('fits every pair of looks and every sitting frame at the default scale', () => {
  expect(standingLooks).toHaveLength(19)
  expect(SITTING_SPACING).toBe(80)
  for (const left of standingLooks) for (const right of standingLooks) {
    expect(sittingSpacing(body(left, DEFAULT_MOLE_SCALE), body(right, DEFAULT_MOLE_SCALE)), `${left}, ${right}`).toBe(80)
    for (let frame = 0; frame < 3; frame++) {
      const gap = 80 - rightExtent(frames[names(left)[frame]!]!, DEFAULT_MOLE_SCALE) - rightExtent(frames[names(right)[frame]!]!, DEFAULT_MOLE_SCALE)
      expect(gap, `${left}, ${right}, frame ${frame}`).toBeGreaterThanOrEqual(16)
      expect(gap, `${left}, ${right}, frame ${frame}`).toBeLessThanOrEqual(48)
    }
  }
})

it('rounds up on the route lattice without overlapping walking bodies at any pair of scales', () => {
  for (const left of standingLooks) for (const right of standingLooks) {
    for (let l = 80; l <= 92; l++) for (let r = 80; r <= 92; r++) {
      const a = body(left, l / 100), b = body(right, r / 100), spacing = sittingSpacing(a, b)
      expect(spacing, `${left} ${l}, ${right} ${r}`).toBeGreaterThanOrEqual(80)
      expect(spacing % IDLE_ROUTE_STEP).toBe(0)
      expect(bodiesOverlap(a, translateBody(b, { x: spacing, y: 0 }))).toBe(false)
    }
  }
  expect(sittingSpacing(body('backpack', .92), body('backpack', .92))).toBe(96)
})

it('chooses a close row when asked and retains the paper row by default', () => {
  const layout = {
    key: 'invented-open-square', bounds: { x: 0, y: 0, width: 640, height: 640 },
    rooms: [], seats: {}, obstacles: [], road: { halfWidth: 0, rings: [], ends: [], faults: [] },
    bodyRadius: 1, houses: [], square: { x: 0, y: 0, width: 640, height: 640 }, pieces: [],
    places: { play: [], sleep: [], sleepingHouse: { x: 0, y: 0, width: 0, height: 0 } },
  } as unknown as Layout
  const box = { x: -10, y: -20, width: 20, height: 20 }
  const walkers = [{ id: 'invented-a', foot: { x: 100, y: 300 }, body: box }, { id: 'invented-b', foot: { x: 260, y: 300 }, body: box }]
  for (const [spacing, outing] of [
    [80, chooseIdleOuting(layout, walkers, [], () => true, 0, undefined, SITTING_SPACING)],
    [PAPER_MEETING_SPACING, chooseIdleOuting(layout, walkers, [], () => true, 0)],
  ] as const) {
    expect(outing?.places).toHaveLength(2)
    expect(outing!.places[1]!.y).toBe(outing!.places[0]!.y)
    expect(outing!.places[1]!.x - outing!.places[0]!.x).toBe(spacing)
  }
})
