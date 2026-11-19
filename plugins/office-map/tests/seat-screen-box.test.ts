// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { OfficeMap } from '../src/map-view.ts'
import { actorRect, layoutIndexes } from '../src/layout-index.ts'
import { sprites as bundled } from '../src/assets.ts'
import { DEFAULT_MOLE_SCALE } from '../src/walks.ts'
import { overlapsCamera, type Camera, type Rect } from '../src/viewport.ts'
import type { SpriteFrame } from '../src/pack.ts'
import type { Layout, Point } from '../src/geometry.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

// Every agent in this file is invented.
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const sprites = bundled as Record<string, SpriteFrame>
const room = (count: number) => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: count }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })), house = layout.houses.find(h => h.type === 'direct')!
  return { layout, keys: house.occupants.filter(key => layout.seats[key]?.desk.width) }
}
// A map with every one of `keys` at its desk, none bound to an action and none free to walk, seen through `camera`.
const mapAt = (layout: Layout, keys: string[], camera: Camera | null) => ({
  camera, away: undefined, whereaboutsByKey: new Map(keys.map(key => [key, { where: 'desk' }])), occupants: new Map(),
  options: { still: false, wave: null, workAvailable: true }, moving: [], layout, individuals: true, actualCamera: () => camera, actionBindings: new Map(), freeToWalk: new Set(), atFacility: new Map(),
})
const view = OfficeMap.prototype as unknown as { actors(this: unknown, keys: string[]): { key: string; point: Point }[]; isVisible(this: unknown, key: string): boolean }
// What every standing look covers of a mole drawn at `at` at the default scale, facing right:
// the overlap of their trim boxes.
const body = (at: Point): Rect => {
  const boxes = Object.keys(sprites).filter(k => k.startsWith('stand-')).map(k => {
    const { trim: [l, t, r, b], anchor: [ax, ay] } = sprites[k]! as { trim: readonly number[]; anchor: readonly number[] }, s = DEFAULT_MOLE_SCALE
    return { left: at.x + (l! - ax!) * s, top: at.y + (t! - ay!) * s, right: at.x + (r! - ax!) * s, bottom: at.y + (b! - ay!) * s }
  })
  const left = Math.max(...boxes.map(b => b.left)), top = Math.max(...boxes.map(b => b.top))
  return { x: left, y: top, width: Math.min(...boxes.map(b => b.right)) - left, height: Math.min(...boxes.map(b => b.bottom)) - top }
}

// The seat's box in the seat index once covered only the mole standing at its foot. A mole at its
// desk is drawn behind the desk: beside its foot in a room of 9 to 12 or 14 or more, and above it
// in a room of 1 to 8 and in the hall of 13. A camera whose edge lies between the drawn mole and
// that old box shows the mole, so the seat index returns the seat and isVisible says true.
it.each([
  ['a room of 4', 4, 'bottom edge, in the band above the foot'],
  ['the hall of 13', 13, 'bottom edge, in the band above the foot'],
  ['a room of 10', 10, 'right edge, in the band beside the foot'],
  ['a room of 24', 24, 'right edge, in the band beside the foot'],
] as const)('finds the seat of every mole at its desk in %s, with the camera\'s %s', (_, count, band) => {
  const { layout, keys } = room(count), seats = finish(layoutIndexes(layout)).seats, side = band.startsWith('right')
  expect(keys.length).toBeGreaterThan(0)
  const drawn = new Map(view.actors.call(mapAt(layout, keys, null), keys).map(a => [a.key, a.point])), missed: string[] = []
  for (const key of keys) {
    const seat = layout.seats[key]!, mole = body(drawn.get(key)!), old = actorRect(seat.foot)
    // The band: the mole's drawn left edge left of the old box's, or its top above the old box's.
    const edge = side ? (mole.x + old.x) / 2 : (mole.y + old.y) / 2
    if (!(side ? mole.x < old.x : mole.y < old.y)) { missed.push(`${key}: the mole drawn at ${show(mole)} has no band ${side ? 'left of' : 'above'} the box ${show(old)} round its foot`); continue }
    const camera: Camera = side ? { left: edge - 40, top: mole.y, width: 40, height: mole.height } : { left: mole.x, top: edge - 40, width: mole.width, height: 40 }
    if (!overlapsCamera(mole, camera) || overlapsCamera(old, camera)) { missed.push(`${key}: the camera ${JSON.stringify(camera)} is not in the band`); continue }
    if (!seats.query(camera).includes(key)) missed.push(`${key}: the seat index does not return the seat for the camera ${JSON.stringify(camera)}`)
    if (!view.isVisible.call(mapAt(layout, [key], camera), key)) missed.push(`${key}: isVisible says false for the camera ${JSON.stringify(camera)}`)
  }
  expect(missed).toEqual([])
}, 60000)
const show = (r: Rect) => `${+r.x.toFixed(2)},${+r.y.toFixed(2)} ${+r.width.toFixed(2)}×${+r.height.toFixed(2)}`
