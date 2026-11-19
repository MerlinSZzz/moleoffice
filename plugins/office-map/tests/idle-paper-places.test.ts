// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { chooseIdleOuting } from '../src/idle-places.ts'
import { PAPER_ARC_SHIFT, paperArcClear, paperArcRect } from '../src/walks.ts'
import { translateBody } from '../src/visual-body.ts'
import type { Layout, Point } from '../src/geometry.ts'
import type { Rect } from '../src/viewport.ts'
import catalog from '../assets/village-catalog.json'

// A flat invented square with no houses, so every candidate in reach is open
// ground and the nearest one is chosen before the paper rule looks at it.
const layout = {
  key: 'invented-paper-places', bounds: { x: 0, y: 0, width: 640, height: 640 },
  rooms: [], seats: {}, obstacles: [], road: { halfWidth: 0, rings: [], ends: [], faults: [] },
  bodyRadius: 1, houses: [], square: { x: 0, y: 0, width: 640, height: 640 }, pieces: [],
  places: { play: [], sleep: [], sleepingHouse: { x: 0, y: 0, width: 0, height: 0 } },
} as unknown as Layout

const body: Rect = { x: -10, y: -20, width: 20, height: 20 }
const walkers = [{ id: 'invented-a', foot: { x: 100, y: 300 }, body }, { id: 'invented-b', foot: { x: 260, y: 300 }, body }]
const frame = (catalog.sprites as any)['paper-stack']
const inside = (point: Point): Rect => paperArcRect(point, frame, PAPER_ARC_SHIFT)!
const paperClear = (places: readonly Point[], bodies: readonly Rect[], blockers: readonly Rect[]): boolean =>
  places.length !== 2 ? true : paperArcClear(places[0]!, frame, [...blockers, ...places.map((place, i) => translateBody(bodies[i]!, place))], PAPER_ARC_SHIFT)

it('prefers a meeting whose whole paper arc is clear over a nearer blocked one', () => {
  const nearest = chooseIdleOuting(layout, walkers, [], () => true, 0)
  expect(nearest).not.toBeNull()
  const blocked = inside(nearest!.places[0]!)
  const blocker: Rect = { x: blocked.x + 2, y: blocked.y + 2, width: 4, height: 4 }

  expect(paperClear(nearest!.places, walkers.map(walker => walker.body), [blocker]), 'the nearer meeting is blocked').toBe(false)
  const chosen = chooseIdleOuting(layout, walkers, [blocker], () => true, 0, paperClear)
  expect(chosen).not.toBeNull()
  expect(chosen!.places).not.toEqual(nearest!.places)
  expect(paperClear(chosen!.places, walkers.map(walker => walker.body), [blocker])).toBe(true)
})

it('keeps the nearest meeting when no candidate has a clear arc, so the page can name the blockers', () => {
  const nearest = chooseIdleOuting(layout, walkers, [], () => true, 0)
  expect(nearest).not.toBeNull()
  const blocked = inside(nearest!.places[0]!)
  const blocker: Rect = { x: blocked.x + 2, y: blocked.y + 2, width: 4, height: 4 }
  const chosen = chooseIdleOuting(layout, walkers, [blocker], () => true, 0, () => false)
  expect(chosen).not.toBeNull()
  expect(chosen!.places).toEqual(nearest!.places)
  expect(paperClear(chosen!.places, walkers.map(walker => walker.body), [blocker])).toBe(false)
})
