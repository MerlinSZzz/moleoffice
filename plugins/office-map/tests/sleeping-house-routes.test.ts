// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeBetween } from '../src/geometry.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
it('connects each made-up sleeping place to a desk through its house door', () => {
  const agents = [agent('one', { role: 'secretary' }), agent('two', { startedBy: { kind: 'agent', id: 'one' } })]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster, sleepingCount: 3 }))
  const destination = Object.keys(layout.seats)[0]!
  const template = layout.seats[destination]!
  for (const [i, point] of layout.places!.sleep.entries()) {
    const house = layout.houses.find(h => h.type === 'sleeping-house' && point.x >= h.x && point.x <= h.x + h.width)!
    const id = `made-up-sleep-${i}`
    house.occupants.push(id)
    layout.seats[id] = { ...template, room: house.group, foot: point, talk: point }
  }
  for (const [i] of layout.places!.sleep.entries()) {
    const id = `made-up-sleep-${i}`
    expect(routeBetween(layout, id, destination).status, id).toBe('found')
  }
})

it('rebuilds a cached layout when the known sleeper count changes', () => {
  const model = mapOffice({ ...people, view: 'roster', agents: [agent('one', { role: 'secretary' })] } as RosterView, null)
  const cache = new OwnershipGeometryCache(), input = { rooms: model.rooms, roster: model.layoutRoster }
  const empty = finish(cache.build(input))
  const full = finish(cache.build({ ...input, sleepingCount: 3 }))
  expect(full.key).not.toBe(empty.key)
  expect(full.houses.filter(h => h.type === 'sleeping-house')).toHaveLength(2)
  expect(finish(cache.build(input)).houses.filter(h => h.type === 'sleeping-house')).toHaveLength(1)
})
