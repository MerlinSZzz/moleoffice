// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
function roster(count: number): RosterView {
  const agents = Array.from({ length: count }, (_, i) => {
    const n = i + 1, role = n === 1 ? 'secretary' : n <= 3 ? 'supervisor' : n === 12 ? 'inspector' : n === 16 ? null : 'worker'
    const parent = n === 1 || n === 16 ? null : n <= 3 || n >= 12 ? 1 : n <= 7 ? 2 : 3
    return agent(`made-up-${n}`, { role, name: `Neighbour ${String(n).padStart(2, '0')}`, startedBy: parent === null ? (n === 1 ? { kind: 'person', id: 'made-up-person' } : null) : { kind: 'agent', id: `made-up-${parent}` }, createdAt: `2026-08-01 ${String(8 + Math.floor(n / 4)).padStart(2, '0')}:${String((n * 7) % 60).padStart(2, '0')}:00` })
  })
  return { ...people, view: 'roster', agents } as RosterView
}
for (const count of [1, 16, 120]) it(`contains all rooms and seats in finite bounds for ${count} agents`, () => {
  const model = mapOffice(roster(count), null), layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
  expect(Object.keys(layout.seats)).toHaveLength(count)
  for (const room of layout.houses) { expect(room.x).toBeGreaterThanOrEqual(layout.bounds.x); expect(room.y).toBeGreaterThanOrEqual(layout.bounds.y); expect(room.x + room.width).toBeLessThanOrEqual(layout.bounds.x + layout.bounds.width); expect(room.y + room.height).toBeLessThanOrEqual(layout.bounds.y + layout.bounds.height) }
  // The 7c village wins: its 1032-wide 5-person room and 672-wide 3-person room, with the passing
  // aisle beside each moving body, give this area at the tip. The old budget cannot hold that layout
 // (the look the owner named). Do not narrow the rooms or the aisle to meet it.
  // The shared house adds a 500-unit forecourt across the 3,400-unit map width.
  // A mole leaves its desk round one end of it, so every desk needs a body-wide way there. The
  // 3-person room grows to 720 and the 5-person room to 1128 for those ways, and the map grows from
  // 3,400 by 3,684 to 3,544 by 3,694. The rooms win here as well; do not take the ways out to meet it.
  // The one-person room grows to 438 wide and the house of one secretary to 438 by 408, so that a
  // body of the largest real size gets round its desk, and the map grows to 3,588 by 3,793.
  const AREA_BUDGET_16 = 10_825_600 + 500 * 3_400 + 565_936 + 517_748
  if (count === 16) expect(layout.bounds.width * layout.bounds.height).toBeLessThanOrEqual(AREA_BUDGET_16)
})
