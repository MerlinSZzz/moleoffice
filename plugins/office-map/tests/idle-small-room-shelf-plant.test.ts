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
  const agents = [agent('shelf-secretary', { role: 'secretary' }), agent('shelf-lead', { role: 'supervisor', startedBy: { kind: 'agent', id: 'shelf-secretary' } }),
    ...Array.from({ length: count - 1 }, (_, i) => agent(`shelf-member-${i}`, { startedBy: { kind: 'agent', id: 'shelf-lead' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
function secretaries(count: number) {
  const agents = [...Array.from({ length: count }, (_, i) => agent(`shelf-secretary-${i}`, { role: 'secretary' })),
    agent('shelf-secretary-worker', { startedBy: { kind: 'agent', id: 'shelf-secretary-0' } })]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
function additions(layout: ReturnType<typeof example>, house: { group: string }) {
  return layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
}
function expectClear(layout: ReturnType<typeof example>, house: { group: string; occupants: string[] } & Rect, part: Rect, label: string) {
  expect(part.x).toBeGreaterThanOrEqual(house.x)
  expect(part.y).toBeGreaterThanOrEqual(house.y)
  expect(part.x + part.width).toBeLessThanOrEqual(house.x + house.width)
  expect(part.y + part.height).toBeLessThanOrEqual(house.y + house.height)
  expect(overlaps(part, furnishingDoorway(house)), `${label}: doorway`).toBe(false)
  for (const other of additions(layout, house)) if (other !== part) expect(overlaps(part, other), `${label}: ${other.sprite}`).toBe(false)
  for (const id of house.occupants) {
    const seat = layout.seats[id]!
    expect(overlaps(part, bodyBox(seat.foot)), `${label}: ${id} body`).toBe(false)
    expect(overlaps(part, seat.desk), `${label}: ${id} desk`).toBe(false)
    expect(overlaps(part, seat.stool), `${label}: ${id} stool`).toBe(false)
  }
  const other = Object.keys(layout.seats).find(id => layout.seats[id]!.room !== house.group)!
  for (const id of house.occupants) expect(routeBetween(layout, id, other).status, `${label}: ${id} route`).toBe('found')
}

it('gives a one-person room one bench and no plant without closing it', () => {
  const layout = example(1), house = layout.houses.find(h => h.type === 'supervisor' && h.occupants.length === 1)!
  const furnishings = additions(layout, house), benches = furnishings.filter(p => p.sprite === 'A29')
  expect(benches).toHaveLength(1)
  expect([benches[0]!.width, benches[0]!.height]).toEqual(nativeSize('A29'))
  expectClear(layout, house, benches[0]!, 'bench')
  expect(furnishings.some(p => p.sprite === 'B40'), 'plant').toBe(false)
})

it('gives a one-person direct room the same bench and no plant', () => {
  const layout = secretaries(1), house = layout.houses.find(h => h.type === 'direct' && h.occupants.length === 1)!
  const furnishings = additions(layout, house), benches = furnishings.filter(p => p.sprite === 'A29')
  expect(benches).toHaveLength(1)
  expect([benches[0]!.width, benches[0]!.height]).toEqual(nativeSize('A29'))
  expectClear(layout, house, benches[0]!, 'bench')
  expect(furnishings.some(p => p.sprite === 'B40'), 'plant').toBe(false)
})

it('leaves the two-secretary house without a bench, because no clear floor there takes one whole', () => {
  const layout = secretaries(2), house = layout.houses.find(h => h.type === 'secretariat' && h.occupants.length === 2)!
  expect(layout.pieces.filter(p => p.group === house.group && p.sprite === 'A29'), 'bench').toHaveLength(0)
  expect(additions(layout, house).filter(p => p.sprite === 'desk-plant' && p.y < house.y + 78), 'plant on the back wall').toHaveLength(0)
  const other = Object.keys(layout.seats).find(id => layout.seats[id]!.room !== house.group)!
  for (const id of house.occupants) expect(routeBetween(layout, id, other).status, `${id} route`).toBe('found')
})
