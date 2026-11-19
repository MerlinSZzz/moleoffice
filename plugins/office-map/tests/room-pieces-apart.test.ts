// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
function example(count: number) {
  const agents = [agent('sample-secretary', { role: 'secretary' }), agent('sample-lead', { role: 'supervisor', startedBy: { kind: 'agent', id: 'sample-secretary' } }),
    ...Array.from({ length: count - 1 }, (_, i) => agent(`sample-member-${i}`, { startedBy: { kind: 'agent', id: 'sample-lead' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
function secretaries(count: number) {
  const agents = [...Array.from({ length: count }, (_, i) => agent(`sample-secretary-${i}`, { role: 'secretary' })),
    agent('sample-secretary-worker', { startedBy: { kind: 'agent', id: 'sample-secretary-0' } })]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}

const onADesk = new Set(['laptop-back', 'coffee-mug', 'desk-lamp', 'desk-lamp-right', 'paper-stack', 'desk-plant'])

it('keeps every two standing pieces in a furnished room apart, except things on a desk, desks side by side and the tea set on its table', () => {
  const layouts = [...[1, 2, 3, 4, 5, 6, 7, 8, 13].map(count => ({ room: `example ${count}`, layout: example(count) })),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(count => ({ room: `secretaries ${count}`, layout: secretaries(count) }))]
  const overlaps: string[] = []
  let pairs = 0
  for (const { room, layout } of layouts) {
    for (const house of layout.houses) {
      const pieces = layout.pieces.filter(p => p.group === house.group && p.layer === 'object')
      for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
        const a = pieces[i]!, b = pieces[j]!
        pairs++
        const across = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const down = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (across <= 2 || down <= 2) continue
        const onDesk = (a.sprite === 'worker-desk' && onADesk.has(b.sprite)) || (b.sprite === 'worker-desk' && onADesk.has(a.sprite))
        const teaSet = (a.sprite === 'tea-table' && b.sprite === 'tea-set') || (b.sprite === 'tea-table' && a.sprite === 'tea-set')
        const desks = a.sprite === 'worker-desk' && b.sprite === 'worker-desk' && a.y === b.y && across <= 4
        if (onDesk || teaSet || desks) continue
        overlaps.push(`${room}, ${house.type}: ${a.sprite} at ${a.x - house.x},${a.y - house.y} and ${b.sprite} at ${b.x - house.x},${b.y - house.y} overlap ${across} across and ${down} down`)
      }
    }
  }
  expect(pairs).toBeGreaterThan(0)
  expect(overlaps).toEqual([])
})
