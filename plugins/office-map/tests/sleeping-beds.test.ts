// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const next = work.next(); if (next.done) return next.value } }

it('provides a bed at each made-up sleeping place, including in an extra house', () => {
  const agents = Array.from({ length: 3 }, (_, i) => agent(`person-${i}`, i === 0 ? { role: 'secretary' } : { startedBy: { kind: 'agent', id: 'person-0' } }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster, sleepingCount: 3 }))
  const houses = layout.houses.filter(h => h.type === 'sleeping-house')
  expect(houses).toHaveLength(2)
  for (const house of houses) {
    const beds = layout.pieces.filter(p => p.group === house.group && p.sprite === 'sleep-bed')
    expect(beds).toHaveLength(2)
    for (const bed of beds) {
      expect(bed.width).toBeGreaterThan(0)
      expect(bed.height).toBeGreaterThan(0)
      expect(layout.places!.sleep.some(p => p.x >= bed.x && p.x <= bed.x + bed.width && p.y >= bed.y && p.y <= bed.y + bed.height)).toBe(true)
    }
  }
})
