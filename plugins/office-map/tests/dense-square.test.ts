// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const agents = Array.from({ length: 16 }, (_, i) => agent(`dense-${i}`, i === 0 ? { role: 'secretary' } : i < 3 ? { role: 'supervisor', startedBy: { kind: 'agent', id: 'dense-0' } } : { startedBy: { kind: 'agent', id: `dense-${1 + i % 2}` } }))
const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))

it('puts three hedge pieces left of the trunk band, three stone-wall pieces right of it, and two level benches in the common square', () => {
  const s = layout.square, inside = layout.pieces.filter(p => p.group === null && p.x >= s.x && p.y >= s.y && p.x + p.width <= s.x + s.width && p.y + p.height <= s.y + s.height)
  const left = inside.filter(p => p.sprite === 'A30'), right = inside.filter(p => p.sprite === 'B30')
  expect(left).toHaveLength(3)
  for (const bench of left) expect(bench.x + bench.width).toBeLessThanOrEqual(s.x + 560)
  expect(right).toHaveLength(3)
  for (const bench of right) expect(bench.x).toBeGreaterThanOrEqual(s.x + 640)
  expect(inside.filter(p => p.sprite === 'A29')).toHaveLength(2)
})

it('gives every occupied desk a small plant on its own surface', () => {
  for (const [id, seat] of Object.entries(layout.seats)) {
    if (!seat.desk.width) continue
    const plants = layout.pieces.filter(p => p.group === seat.room && p.sprite === 'desk-plant' && p.x >= seat.desk.x && p.x + p.width <= seat.desk.x + seat.desk.width && p.y >= seat.desk.y && p.y + p.height <= seat.desk.y + seat.desk.height)
    expect(plants.length, id).toBeGreaterThan(0)
  }
})

it('uses the free space in the large secretary house for more than one shelf and rug', () => {
  const secretaries = Array.from({ length: 3 }, (_, i) => agent(`secretary-${i}`, { role: 'secretary' }))
  const largeModel = mapOffice({ ...people, view: 'roster', agents: secretaries } as RosterView, null)
  const largeLayout = finish(new OwnershipGeometryCache().build({ rooms: largeModel.rooms, roster: largeModel.layoutRoster }))
  const house = largeLayout.houses.find(h => h.type === 'secretariat')!
  const additions = largeLayout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
  expect(additions.filter(p => p.sprite === 'bookshelf').length).toBeGreaterThanOrEqual(2)
  expect(additions.filter(p => ['A27', 'A28', 'B28'].includes(p.sprite)).length).toBeGreaterThanOrEqual(2)
  expect(additions.some(p => p.sprite === 'A29')).toBe(true)
})
