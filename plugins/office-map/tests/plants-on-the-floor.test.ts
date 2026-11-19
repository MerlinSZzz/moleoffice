// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { furnishingDoorway, OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { bodyBox, insideRoom, overlaps } from '../src/nameplates.ts'
import { routeBetween, type Layout } from '../src/geometry.ts'
import { atDesk } from '../src/desk-things.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

// Every agent in this file is invented.
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const build = (agents: ReturnType<typeof agent>[]): Layout => {
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
const example = (count: number) => build([agent('invented-secretary', { role: 'secretary' }), agent('invented-lead', { role: 'supervisor', startedBy: { kind: 'agent', id: 'invented-secretary' } }),
  ...Array.from({ length: count - 1 }, (_, i) => agent(`invented-member-${i}`, { startedBy: { kind: 'agent', id: 'invented-lead' } }))])
const direct = (count: number) => build([agent('invented-secretary', { role: 'secretary' }),
  ...Array.from({ length: count }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))])
const secretaries = (count: number) => build([...Array.from({ length: count }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary' })),
  agent('invented-secretary-worker', { startedBy: { kind: 'agent', id: 'invented-secretary-0' } })])
const rooms: [string, () => Layout, string][] = [
  ...[6, 7, 8, 13].map(count => [`${count}-person supervisor room`, () => example(count), 'supervisor'] as [string, () => Layout, string]),
  ['13-person hall', () => direct(13), 'direct'],
  ...[9, 10, 11, 12, 13, 14, 15].map(count => [`${count}-secretary room`, () => secretaries(count), 'secretariat'] as [string, () => Layout, string]),
]
const placed = new Set(['plant-planter-front', 'plant-pot-front', 'tea-table'])

it('stands one planter and one pot on the lower floor of each larger room, and a tea corner in each secretary room of nine or more', () => {
  for (const [label, make, type] of rooms) {
    const layout = make(), house = layout.houses.find(h => h.type === type)!
    const pieces = layout.pieces.filter(p => p.group === house.group)
    const count = (sprite: string) => pieces.filter(p => p.sprite === sprite).length
    expect([count('plant-planter-front'), count('plant-pot-front')], label).toEqual([1, 1])
    if (type === 'secretariat') expect([count('tea-table'), count('tea-set')], label).toEqual([1, 1])
    const seats = house.occupants.map(id => layout.seats[id]!).filter(seat => seat && !(seat as { outdoors?: boolean }).outdoors)
    const backDesk = Math.min(...seats.map(seat => seat.desk.y + seat.desk.height))
    for (const piece of pieces.filter(p => placed.has(p.sprite) && (type === 'secretariat' || p.sprite !== 'tea-table'))) {
      const where = `${label}: ${piece.sprite} at ${piece.x - house.x},${piece.y - house.y}`
      expect(insideRoom(house, piece), `${where} is outside the walls`).toBe(true)
      expect(piece.y, `${where} is not below the back desks`).toBeGreaterThanOrEqual(backDesk)
      expect(overlaps(piece, furnishingDoorway(house)), `${where} is in the doorway`).toBe(false)
      for (const seat of seats) {
        expect(overlaps(piece, seat.desk), `${where} covers a desk`).toBe(false)
        expect(overlaps(piece, seat.stool), `${where} covers a stool`).toBe(false)
        expect(overlaps(piece, bodyBox(seat.foot)), `${where} covers a mole`).toBe(false)
        expect(overlaps(piece, bodyBox(atDesk(seat))), `${where} covers a mole at its desk`).toBe(false)
        expect(overlaps(piece, bodyBox(seat.talk)), `${where} covers a talk place`).toBe(false)
      }
    }
  }
}, 60000)

it('keeps every walk inside those rooms, and every walk out of them, open', () => {
  for (const [label, make, type] of rooms) {
    const layout = make(), house = layout.houses.find(h => h.type === type)!
    const inside = house.occupants.filter(id => layout.seats[id] && !(layout.seats[id] as { outdoors?: boolean }).outdoors)
    const outside = Object.keys(layout.seats).find(id => layout.seats[id]!.room !== house.group)!
    for (const from of inside) for (const to of [outside, ...inside.filter(id => id !== from)])
      expect(routeBetween(layout, from, to).status, `${label}: ${from} to ${to}`).toBe('found')
  }
}, 300000)
