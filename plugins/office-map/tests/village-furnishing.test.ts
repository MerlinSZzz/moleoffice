// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { gatheringReserve, OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { bodyBox } from '../src/nameplates.ts'
import { routeBetween } from '../src/geometry.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
import type { Rect } from '../src/viewport.ts'
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
for (const count of [1, 16, 120]) it(`furnishes the halls without covering bodies or closing routes for ${count} agents`, () => {
  const agents = Array.from({ length: count }, (_, i) => agent(`person-${i}`, i === 0 ? { role: 'secretary' } : i < 4 ? { role: 'supervisor', startedBy: { kind: 'agent', id: 'person-0' } } : { startedBy: { kind: 'agent', id: `person-${1 + i % 3}` } }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
  const categories = [['bookshelf'], ['A27', 'A28', 'B28'], ['desk-plant', 'B56'], ['message-board']]
  for (const house of layout.houses.filter(h => h.type !== 'sleeping-house')) {
    const additions = layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
    const groups = new Map<string, { x: number; y: number }[]>()
    for (const id of house.occupants) {
      const seat = layout.seats[id]! as typeof layout.seats[string] & { activity?: string; cluster?: string; outdoors?: boolean }
      if (!seat.outdoors && seat.cluster && (seat.activity === 'reading' || seat.activity === 'garden')) {
        const points = groups.get(seat.cluster) ?? []; points.push(seat.foot); groups.set(seat.cluster, points)
      }
    }
    for (const category of categories) expect(additions.some(p => category.includes(p.sprite)), `${house.group}: ${category.join('/')}`).toBe(true)
    for (const part of additions) {
      expect(part.x).toBeGreaterThanOrEqual(house.x); expect(part.y).toBeGreaterThanOrEqual(house.y)
      expect(part.x + part.width).toBeLessThanOrEqual(house.x + house.width); expect(part.y + part.height).toBeLessThanOrEqual(house.y + house.height)
      for (const id of house.occupants) { const foot = layout.seats[id]!.foot; expect(overlaps(part, bodyBox(foot)), `${house.group} ${part.sprite} ${id}`).toBe(false) }
      for (const points of groups.values()) {
        expect(overlaps(part, gatheringReserve(points)), `${house.group} ${part.sprite} crosses a gathering`).toBe(false)
      }
    }
    const other = Object.keys(layout.seats).find(id => layout.seats[id]!.room !== house.group)
    if (other) for (const id of house.occupants) expect(routeBetween(layout, id, other).status, `${house.group} ${id}`).toBe('found')
  }
}, 30000)
