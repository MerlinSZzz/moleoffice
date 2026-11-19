// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { TREE_CLEARANCE } from '../src/ownership-woodland.ts'
import { isTree } from '../src/village.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
import type { Rect } from '../src/viewport.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
function layoutFor(count: number) {
  const agents = Array.from({ length: count }, (_, i) => agent(`person-${i}`, i === 0 ? { role: 'secretary' } : i < 4 ? { role: 'supervisor', startedBy: { kind: 'agent', id: 'person-0' } } : { startedBy: { kind: 'agent', id: `person-${1 + i % 3}` } }))
  const roster = { ...people, view: 'roster', agents } as RosterView
  const model = mapOffice(roster, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
const gap = (a: Rect, b: Rect) => Math.hypot(Math.max(0, a.x - b.x - b.width, b.x - a.x - a.width), Math.max(0, a.y - b.y - b.height, b.y - a.y - a.height))
for (const count of [1, 16, 120]) it(`keeps trees clear of common places and doors for ${count} agents`, () => {
  const layout = layoutFor(count)
  const protectedPlaces: Rect[] = [...layout.squares ?? [], ...(layout.places ? [layout.places.sleepingHouse] : []), ...layout.houses.flatMap(h => h.doors.map(d => ({ ...d, width: 0, height: 0 })))]
  const trees = layout.pieces.filter(isTree)
  expect(trees.length).toBeGreaterThan(0)
  for (const tree of trees) for (const place of protectedPlaces) expect(gap(tree, place), `${tree.sprite} at ${tree.x},${tree.y}`).toBeGreaterThanOrEqual(TREE_CLEARANCE)
})

it('honours protected common ground even when a grove candidate falls there', async () => {
  const { ownershipWoodland } = await import('../src/ownership-woodland.ts')
  const layout = layoutFor(16), trees = layout.pieces.filter(isTree)
  const first = trees[0]!, second = trees[Math.floor(trees.length / 2)]!
  layout.pieces = layout.pieces.filter(p => !p.decoration)
  layout.squares = [{ x: first.x, y: first.y, width: first.width, height: first.height }]
  layout.places = { play: [], sleep: [], sleepingHouse: { x: second.x, y: second.y, width: second.width, height: second.height } }
  for (const tree of finish(ownershipWoodland(layout)).filter(isTree)) for (const protectedPlace of [...layout.squares, layout.places.sleepingHouse])
    expect(gap(tree, protectedPlace)).toBeGreaterThanOrEqual(TREE_CLEARANCE)
})
