// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { furnishingDoorway, OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { bodyBox } from '../src/nameplates.ts'
import { routeBetween } from '../src/geometry.ts'
import { houseCatalog, nativeSize } from '../src/village.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
import type { Rect } from '../src/viewport.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const tables = ['tea-table', 'kettle-stand'] as const

function example(count: number) {
  const agents = [agent('small-secretary', { role: 'secretary' }), agent('small-lead', { role: 'supervisor', startedBy: { kind: 'agent', id: 'small-secretary' } }),
    ...Array.from({ length: count - 1 }, (_, i) => agent(`small-member-${i}`, { startedBy: { kind: 'agent', id: 'small-lead' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
function secretaries(count: number) {
  const agents = [...Array.from({ length: count }, (_, i) => agent(`small-secretary-${i}`, { role: 'secretary' })),
    agent('small-secretary-worker', { startedBy: { kind: 'agent', id: 'small-secretary-0' } })]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
function expectTable(layout: ReturnType<typeof example>, house: { group: string; occupants: string[] } & Rect, label: string) {
  const additions = layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
  const table = additions.find(p => (tables as readonly string[]).includes(p.sprite))
  expect(table, `${label}: table`).toBeDefined()
  expect([table!.width, table!.height]).toEqual(nativeSize(table!.sprite))
  expect(table!.x).toBeGreaterThanOrEqual(house.x)
  expect(table!.y).toBeGreaterThanOrEqual(house.y)
  expect(table!.x + table!.width).toBeLessThanOrEqual(house.x + house.width)
  expect(table!.y + table!.height).toBeLessThanOrEqual(house.y + house.height)
  expect(overlaps(table!, furnishingDoorway(house)), `${label}: doorway`).toBe(false)
  for (const other of additions) if (other !== table) expect(overlaps(table!, other), `${label}: ${other.sprite}`).toBe(false)
  for (const id of house.occupants) {
    const seat = layout.seats[id]!
    expect(overlaps(table!, bodyBox(seat.foot)), `${label}: ${id} body`).toBe(false)
    expect(overlaps(table!, seat.desk), `${label}: ${id} desk`).toBe(false)
    expect(overlaps(table!, seat.stool), `${label}: ${id} stool`).toBe(false)
  }
  const other = Object.keys(layout.seats).find(id => layout.seats[id]!.room !== house.group)!
  for (const id of house.occupants) expect(routeBetween(layout, id, other).status, `${label}: ${id} route`).toBe('found')
}

it('gives a one-person supervisor room its own small table in a studio widened for its desk way', () => {
  const layout = example(1), house = layout.houses.find(h => h.type === 'supervisor')!
  expect(house.occupants).toHaveLength(1)
  expect(house.width).toBe(houseCatalog.B01!.canvasSize[0]! + 22)
  expectTable(layout, house, 'one-person room')
})

it('gives the one- and two-secretary B01 house their own small table with a clear passing lane', () => {
  for (const count of [1, 2]) {
    const layout = secretaries(count), house = layout.houses.find(h => h.type === 'secretariat')!
    expect(house.occupants).toHaveLength(count)
    expect([house.width, house.height]).toEqual([houseCatalog.B01!.canvasSize[0]! + (count === 2 ? 64 : 22), houseCatalog.B01!.canvasSize[1]! + 96])
    expectTable(layout, house, `${count}-secretary house`)
  }
})
