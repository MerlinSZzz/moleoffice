// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { furnishingDoorway, OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { bodyBox } from '../src/nameplates.ts'
import { routeBetween } from '../src/geometry.ts'
import { nativeSize } from '../src/village.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
import type { Rect } from '../src/viewport.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
function example(count: number) {
  const agents = [agent('sample-secretary', { role: 'secretary' }), agent('sample-lead', { role: 'supervisor', startedBy: { kind: 'agent', id: 'sample-secretary' } }),
    ...Array.from({ length: count - 1 }, (_, i) => agent(`sample-member-${i}`, { startedBy: { kind: 'agent', id: 'sample-lead' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}

for (const count of [2, 5]) it(`adds a readable bench to a ${count}-person room without consuming clearances`, () => {
  const layout = example(count), house = layout.houses.find(h => h.type === 'supervisor')!
  const bench = layout.pieces.find(p => p.group === house.group && p.sprite === 'A29' && p.y >= house.y + house.height / 2 && (p as typeof p & { furnishing?: boolean }).furnishing)
  expect(bench).toBeDefined()
  expect([bench!.width, bench!.height]).toEqual(nativeSize('A29'))
  expect(bench!.y).toBeGreaterThanOrEqual(house.y + house.height / 2)
  expect(overlaps(bench!, furnishingDoorway(house))).toBe(false)
  for (const id of house.occupants) {
    const seat = layout.seats[id]!
    for (const area of [bodyBox(seat.foot), seat.desk, seat.stool]) expect(overlaps(bench!, area), id).toBe(false)
    const other = Object.keys(layout.seats).find(key => layout.seats[key]!.room !== house.group)!
    expect(routeBetween(layout, id, other).status, id).toBe('found')
  }
  const additions = layout.pieces.filter(p => p !== bench && p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
  for (const part of additions) expect(overlaps(bench!, part), part.sprite).toBe(false)
})

it('keeps at least two native benches in the common square', () => {
  const layout = example(5), s = layout.square
  const benches = layout.pieces.filter(p => p.group === null && p.sprite === 'A29' && p.x >= s.x && p.y >= s.y && p.x + p.width <= s.x + s.width && p.y + p.height <= s.y + s.height)
  expect(benches.length).toBeGreaterThanOrEqual(2)
  for (const bench of benches) expect([bench.width, bench.height]).toEqual(nativeSize('A29'))
})
