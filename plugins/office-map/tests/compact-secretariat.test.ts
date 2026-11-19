// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { secretariatFor, secretariatAssembly } from '../src/native-assembly.ts'
import { houseCatalog } from '../src/village.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeBetween } from '../src/geometry.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }

it('keeps every native layer of the secretaries\' house, with a desk way for one and a passing lane for two', () => {
  for (const count of [1, 2]) {
    const secretaries = Array.from({ length: count }, (_, i) => agent(`secretary-${i}`, { role: 'secretary' }))
    const worker = agent('worker', { startedBy: { kind: 'agent', id: 'secretary-0' } })
    const input = { ...people, view: 'roster', agents: [...secretaries, worker] } as RosterView
    const model = mapOffice(input, null)
    const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
    const house = layout.houses.find(h => h.type === 'secretariat')!
    // The former fixed native size left no body-wide way beside a desk. Keep
    // every native layer, widen the house for a desk way and add floor, so a
    // body of the largest real size gets round its desk and two pass below both.
    const [width, height] = houseCatalog.B01!.canvasSize
    expect([house.width, house.height]).toEqual([width! + (count === 2 ? 64 : 22), height! + 96])
    expect(house.occupants).toHaveLength(count)
    for (const layer of houseCatalog.B01!.layers) expect(layout.pieces.filter(p => p.group === house.group && p.sprite === layer.sprite)).toHaveLength(1)
    expect(layout.pieces.filter(p => p.group === house.group && p.sprite === 'worker-desk')).toHaveLength(count)
    expect(routeBetween(layout, JSON.stringify(['agent', 'secretary-0']), JSON.stringify(['agent', 'worker'])).status).toBe('found')
  }
  expect(secretariatFor(5)).toBe(secretariatAssembly)
})
