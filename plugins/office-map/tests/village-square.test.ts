// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
import { inPackedRing } from '../src/packed-road.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
for (const count of [1, 16, 120]) it(`joins one furnished common square to the secretariat and trunk for ${count} agents`, () => {
  const agents = Array.from({ length: count }, (_, i) => agent(`person-${i}`, i === 0 ? { role: 'secretary' } : i < 4 ? { role: 'supervisor', startedBy: { kind: 'agent', id: 'person-0' } } : { startedBy: { kind: 'agent', id: `person-${1 + i % 3}` } }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
  expect(layout.squares).toHaveLength(1)
  const square = layout.squares![0]!, inside = (x: number, y: number) => x >= square.x && x <= square.x + square.width && y >= square.y && y <= square.y + square.height
  for (const sprite of ['B64', 'tea-table', 'tea-set', 'stool-sw', 'stool-se', 'message-board', 'lantern', 'B57'])
    expect(layout.pieces.some(p => p.sprite === sprite && inside(p.x, p.y) && inside(p.x + p.width, p.y + p.height)), sprite).toBe(true)
  for (const sprite of ['A30', 'B30', 'A29'])
    expect(layout.pieces.some(p => p.sprite === sprite && inside(p.x, p.y) && inside(p.x + p.width, p.y + p.height)), sprite).toBe(true)
  expect(layout.roadDrawing!.some(batch => { for (let at = 0; at < batch.length;) { const end = at + 1 + batch[at]! * 2; if (inPackedRing({ x: square.x + 5, y: square.y + 5 }, batch.subarray(at, end))) return true; at = end } return false })).toBe(true)
  const secretariat = layout.houses.find(h => h.type === 'secretariat')!
  expect(secretariat.y + secretariat.height).toBeLessThan(square.y)
  expect(layout.paths!.some(path => path.some(p => inside(p.x, p.y)) && path.some(p => Math.abs(p.x - secretariat.doors[0]!.x) < 1 && Math.abs(p.y - secretariat.doors[0]!.y) < 1))).toBe(true)
  expect(layout.paths!.some(path => path.some(p => inside(p.x, p.y)) && path.some(p => p.y > square.y + square.height))).toBe(true)
})
