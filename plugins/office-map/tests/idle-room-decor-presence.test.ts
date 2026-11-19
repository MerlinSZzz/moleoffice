// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

it.each([3, 4, 5, 8])('retains the bench and table in the invented %i-worker room', count => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: count }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, house = layout.houses.find(h => h.type === 'direct')!
  const additions = layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
  for (const sprite of ['A29', 'tea-table']) expect(additions.some(p => p.sprite === sprite), `${count}: ${sprite}`).toBe(true)
})
