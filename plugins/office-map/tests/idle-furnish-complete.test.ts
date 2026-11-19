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
const centre = (p: Rect) => ({ x: p.x + p.width / 2, y: p.y + p.height / 2 })
const apart = (a: Rect, b: Rect) => Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y)
function example(count: number) {
  const agents = [agent('sample-secretary', { role: 'secretary' }), agent('sample-lead', { role: 'supervisor', startedBy: { kind: 'agent', id: 'sample-secretary' } }),
    ...Array.from({ length: count - 1 }, (_, i) => agent(`sample-member-${i}`, { startedBy: { kind: 'agent', id: 'sample-lead' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
function secretaries(count: number) {
  const agents = [...Array.from({ length: count }, (_, i) => agent(`sample-secretary-${i}`, { role: 'secretary' })),
    agent('sample-secretary-worker', { startedBy: { kind: 'agent', id: 'sample-secretary-0' } })]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
function clearOfPeople(layout: ReturnType<typeof example>, house: { group: string; occupants: string[] }, part: Rect, label: string) {
  for (const id of house.occupants) {
    const seat = layout.seats[id]!
    expect(overlaps(part, bodyBox(seat.foot)), `${label}: ${id}`).toBe(false)
    expect(overlaps(part, seat.desk), `${label}: ${id} desk`).toBe(false)
    expect(overlaps(part, seat.stool), `${label}: ${id} stool`).toBe(false)
  }
}
function routeOut(layout: ReturnType<typeof example>, house: { group: string; occupants: string[] }, label: string) {
  const other = Object.keys(layout.seats).find(id => layout.seats[id]!.room !== house.group)!
  for (const id of house.occupants) expect(routeBetween(layout, id, other).status, `${label}: ${id}`).toBe('found')
}

for (const count of [2, 3, 4, 5, 6, 7, 8]) it(`groups a table and bench in a ${count}-person room without consuming a clearance`, () => {
  const layout = example(count), house = layout.houses.find(h => h.type === 'supervisor')!
  const additions = layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
  const table = additions.find(p => p.sprite === 'tea-table'), bench = additions.find(p => p.sprite === 'A29' && p.y >= house.y + house.height / 2)
  expect(table, 'table').toBeDefined()
  expect(bench, 'bench').toBeDefined()
  expect([table!.width, table!.height]).toEqual(nativeSize('tea-table'))
  expect([bench!.width, bench!.height]).toEqual(nativeSize('A29'))
  expect(table!.y + table!.height).toBeGreaterThanOrEqual(house.y + house.height / 2)
  expect(bench!.y).toBeGreaterThanOrEqual(house.y + house.height / 2)
  expect(apart(table!, bench!), 'grouped').toBeLessThanOrEqual(200)
  expect(overlaps(table!, bench!), 'table/bench').toBe(false)
  expect(overlaps(table!, furnishingDoorway(house)), 'table: doorway').toBe(false)
  expect(overlaps(bench!, furnishingDoorway(house)), 'bench: doorway').toBe(false)
  clearOfPeople(layout, house, table!, 'table')
  clearOfPeople(layout, house, bench!, 'bench')
  routeOut(layout, house, 'room')
})

it('keeps the two-person room compact and gives the eight-person room its table', () => {
  const two = example(2), eight = example(8)
  expect(two.houses.find(h => h.type === 'supervisor')!.height).toBeLessThanOrEqual(400)
  const eightHouse = eight.houses.find(h => h.type === 'supervisor')!
  const additions = eight.pieces.filter(p => p.group === eightHouse.group && (p as typeof p & { furnishing?: boolean }).furnishing)
  const table = additions.find(p => p.sprite === 'tea-table'), bench = additions.find(p => p.sprite === 'A29' && p.y >= eightHouse.y + eightHouse.height / 2)
  expect(table, 'eight: table').toBeDefined()
  expect(bench, 'eight: bench').toBeDefined()
  for (const part of [table!, bench!]) {
    expect(overlaps(part, furnishingDoorway(eightHouse)), `${part.sprite}: eight doorway`).toBe(false)
    clearOfPeople(eight, eightHouse, part, `eight ${part.sprite}`)
  }
  routeOut(eight, eightHouse, 'eight')
}, 30000)

it('gives the large secretary house a grouped table and bench', () => {
  const layout = secretaries(3), house = layout.houses.find(h => h.type === 'secretariat')!
  const additions = layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
  const table = additions.find(p => p.sprite === 'tea-table'), bench = additions.find(p => p.sprite === 'A29')
  expect(table, 'table').toBeDefined()
  expect(bench, 'bench').toBeDefined()
  expect(apart(table!, bench!), 'grouped').toBeLessThanOrEqual(200)
  expect(overlaps(table!, furnishingDoorway(house)), 'table: doorway').toBe(false)
  expect(overlaps(bench!, furnishingDoorway(house)), 'bench: doorway').toBe(false)
  clearOfPeople(layout, house, table!, 'table')
  clearOfPeople(layout, house, bench!, 'bench')
  routeOut(layout, house, 'secretariat')
}, 30000)

it('keeps the square tea group together and clear of its walk and play places', () => {
  const layout = example(5), s = layout.square
  const inside = (p: Rect) => p.x >= s.x && p.y >= s.y && p.x + p.width <= s.x + s.width && p.y + p.height <= s.y + s.height
  const pieces = layout.pieces.filter(p => p.group === null && p.layer === 'object' && inside(p))
  const table = pieces.find(p => p.sprite === 'tea-table')!, teaSet = pieces.find(p => p.sprite === 'tea-set')
  expect(table).toBeDefined()
  expect(teaSet).toBeDefined()
  expect(apart(table!, teaSet!), 'tea group').toBeLessThanOrEqual(220)
  const trunk = layout.paths!.find(p => p.length === 2 && p[0]!.y === s.y && p[0]!.x === p[1]!.x)!
  const walk = { x: trunk[0]!.x - 26, y: s.y, width: 52, height: s.height }
  for (const part of pieces) {
    expect(overlaps(part, walk), `${part.sprite}: walk`).toBe(false)
    for (const point of layout.places!.play) expect(overlaps(part, bodyBox(point)), `${part.sprite}: play`).toBe(false)
  }
})
