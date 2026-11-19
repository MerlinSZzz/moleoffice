// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { overlaps } from '../src/nameplates.ts'
import { sceneOrder } from '../src/scene-order.ts'
import { piece, type House, type Piece } from '../src/village.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
function drawn(pieces: Piece[], houses: House[]): Piece[] {
  const order: Piece[] = []
  for (const entry of sceneOrder(pieces, [], houses)) if (entry?.piece) order.push(entry.piece)
  return order
}
function example(count: number) {
  const agents = [agent('floor-order-secretary', { role: 'secretary' }), agent('floor-order-lead', { role: 'supervisor', startedBy: { kind: 'agent', id: 'floor-order-secretary' } }),
    ...Array.from({ length: count - 1 }, (_, i) => agent(`floor-order-member-${i}`, { startedBy: { kind: 'agent', id: 'floor-order-lead' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
function secretaries(count: number) {
  const agents = [...Array.from({ length: count }, (_, i) => agent(`floor-order-secretary-${i}`, { role: 'secretary' })),
    agent('floor-order-secretary-worker', { startedBy: { kind: 'agent', id: 'floor-order-secretary-0' } })]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}

it('draws a rug after the floor tile under it, whichever of the two arrives first', () => {
  const house: House = { x: 0, y: 0, width: 624, height: 416, group: 'floor-order-room', module: 0, style: 'B06', occupants: [], anchor: { x: 312, y: 392 }, doors: [], openings: [], hitArea: [], walkable: [] }
  const tile = piece('B06-floor', 0, 0, 'floor-order-room', 'floor', 0)
  const rug = piece('B28', 300, 200, 'floor-order-room', 'floor')
  for (const pieces of [[tile, rug], [rug, tile]]) {
    const order = drawn(pieces, [house])
    expect(order.indexOf(rug), 'rug hidden by the floor tile').toBeGreaterThan(order.indexOf(tile))
  }
})

it('draws every rug in the furnished rooms after the floor tiles under it, in both arrival orders', () => {
  let checked = 0
  const layouts = [...[1, 2, 3, 4, 5, 6, 7, 8, 13].map(example), ...[1, 2, 3, 4, 5, 6].map(secretaries)]
  for (const layout of layouts) for (const room of layout.houses) {
    const pieces = layout.pieces.filter(p => p.group === room.group)
    const orders = [['as laid out', drawn(pieces, layout.houses)], ['reversed', drawn([...pieces].reverse(), layout.houses)]] as const
    for (const [label, order] of orders) for (const under of pieces.filter(p => p.layer === 'floor' && !p.sprite.endsWith('-floor')))
      for (const tile of pieces.filter(p => p.sprite.endsWith('-floor') && overlaps(under, p))) {
        expect(order.indexOf(under), `${room.id ?? room.group}, ${label}: ${under.sprite} at (${under.x}, ${under.y}) should be drawn after ${tile.sprite} at (${tile.x}, ${tile.y})`).toBeGreaterThan(order.indexOf(tile))
        checked++
      }
  }
  expect(checked).toBeGreaterThan(0)
}, 60000)
