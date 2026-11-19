// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

it('retains the notice board in the invented single-worker studio', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), agent('invented-worker-0', { startedBy: { kind: 'agent', id: 'invented-secretary' } })]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = build.next(); while (!next.done) next = build.next()
  const layout = next.value, house = layout.houses.find(h => h.type === 'direct')!
  expect(layout.pieces.filter(p => p.group === house.group && p.sprite === 'message-board')).toHaveLength(1)
})
