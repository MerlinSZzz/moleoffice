// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { furnishingDoorway, OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeBetween } from '../src/geometry.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

it('fits five teammates into a compact room with a clear doorway and their own desks', () => {
  const agents = [agent('secretary', { role: 'secretary' }), agent('supervisor', { role: 'supervisor', startedBy: { kind: 'agent', id: 'secretary' } }),
    ...Array.from({ length: 4 }, (_, i) => agent(`worker-${i}`, { startedBy: { kind: 'agent', id: 'supervisor' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
  const house = layout.houses.find(h => h.type === 'supervisor')!
  expect(house.occupants).toHaveLength(5)
  expect(house.height).toBeLessThan(600)
  expect(house.occupants.every(id => (layout.seats[id]?.desk.width ?? 0) > 0)).toBe(true)
  for (const id of ['worker-0', 'worker-1', 'worker-2', 'worker-3'])
    expect(routeBetween(layout, JSON.stringify(['agent', id]), JSON.stringify(['agent', 'secretary'])).status, id).toBe('found')
  const corridor = furnishingDoorway(house)
  const solid = layout.pieces.filter(p => p.group === house.group && p.layer !== 'floor' && (p as typeof p & { furnishing?: boolean }).furnishing)
  expect(solid.filter(p => overlaps(p, corridor))).toEqual([])
})
