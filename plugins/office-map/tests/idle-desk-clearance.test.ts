// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { standingScale } from '../src/appearance.ts'
import type { RosterView } from '../src/contracts.ts'
import { sprites as bundled } from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

type Rect = { x: number; y: number; width: number; height: number }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const sprites: Record<string, any> = bundled
// Match the motion worker's complete two-facing standing, gait and gesture union.
function body(look: string, scale: number, at: { x: number; y: number }): Rect {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (const prefix of ['stand', 'walk', 'wave', 'cheer', 'carry']) {
    const names = prefix === 'walk' ? ['A', 'pass', 'B'].map(frame => `walk-${look}-${frame}`) : [`${prefix}-${look}`]
    for (const name of names) {
      const frame = sprites[name]; expect(frame, name).toBeDefined()
      const [x, y] = frame.trim, [, , w, h] = frame.rect, [ax, ay] = frame.anchor
      left = Math.min(left, (x - ax) * scale, (ax - x - w) * scale)
      right = Math.max(right, (x - ax + w) * scale, (ax - x) * scale)
      top = Math.min(top, (y - ay) * scale); bottom = Math.max(bottom, (y - ay + h) * scale)
    }
  }
  return { x: at.x + left - 1e-6, y: at.y + top - 1e-6, width: right - left + 2e-6, height: bottom - top + 2e-6 }
}
function art(piece: any): Rect {
  const frame = sprites[piece.sprite]; expect(frame, piece.sprite).toBeDefined()
  const [x, y] = frame.trim, [, , width, height] = frame.rect, scale = piece.scale ?? 1
  return { x: piece.x + x * scale, y: piece.y + y * scale, width: width * scale, height: height * scale }
}
function scene() {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 4 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value
  const occupants = model.occupants.map(o => ({ o, seat: layout.seats[o.key]!, scale: o.agent.scale === null ? .82 : standingScale(o.agent.scale.value) }))
  return { layout, occupants }
}
it('keeps each invented desktop body clear of desks, their visible accessories and other bodies', () => {
  const { layout, occupants } = scene()
  expect(occupants).toHaveLength(5)
  const conflicts: string[] = []
  for (const { o, seat, scale } of occupants) {
    const box = body(o.standing.look, scale, seat.foot)
    for (const obstacle of layout.obstacles.filter(p => p.kind === 'desk')) if (overlaps(box, obstacle)) conflicts.push(`${o.agent.id} desk obstacle ${obstacle.station}`)
    for (const piece of layout.pieces.filter(p => ['worker-desk', 'laptop-back', 'coffee-mug'].includes(p.sprite))) if (overlaps(box, art(piece))) conflicts.push(`${o.agent.id} ${piece.sprite}`)
    for (const other of occupants.filter(p => p.o.key !== o.key)) if (overlaps(box, body(other.o.standing.look, other.scale, other.seat.foot))) conflicts.push(`${o.agent.id} / ${other.o.agent.id}`)
  }
  expect(conflicts).toEqual([])
})
it('keeps each invented room door clear of all other stations stools', () => {
  const { layout, occupants } = scene()
  const conflicts: string[] = []
  for (const { o, seat, scale } of occupants) for (const door of layout.houses.filter(h => h.group === seat.room).flatMap(h => h.doors)) {
    const box = body(o.standing.look, scale, door)
    for (const stool of layout.obstacles.filter(p => p.kind === 'stool' && p.station !== o.key)) if (overlaps(box, stool)) conflicts.push(`${o.agent.id} door / ${stool.station}`)
  }
  expect(conflicts).toEqual([])
})

it.each([1, 2, 3, 4, 5, 6, 7, 8, 12, 24, 46])('keeps desk bodies and doors clear in a %i-worker room', count => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: count }, (_, i) => agent(`invented-worker-${String(i).padStart(3, '0')}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value
  const entries = model.occupants.map(o => ({ o, seat: layout.seats[o.key]!, scale: o.agent.scale === null ? .82 : standingScale(o.agent.scale.value) }))
  const conflicts: string[] = []
  for (const { o, seat, scale } of entries.filter(e => (e.seat as any).activity === 'desk')) {
    const box = body(o.standing.look, scale, seat.foot)
    for (const obstacle of layout.obstacles.filter(p => p.kind === 'desk')) if (overlaps(box, obstacle)) conflicts.push(`${o.agent.id} desk ${obstacle.station}`)
    for (const piece of layout.pieces.filter(p => ['worker-desk', 'laptop-back', 'coffee-mug'].includes(p.sprite))) if (overlaps(box, art(piece))) conflicts.push(`${o.agent.id} ${piece.sprite}`)
    for (const other of entries.filter(p => p.o.key !== o.key)) if (overlaps(box, body(other.o.standing.look, other.scale, other.seat.foot))) conflicts.push(`${o.agent.id} body ${other.o.agent.id}`)
    for (const door of layout.houses.filter(h => h.group === seat.room).flatMap(h => h.doors)) {
      const doorBox = body(o.standing.look, scale, door)
      for (const stool of layout.obstacles.filter(p => p.kind === 'stool' && p.station !== o.key)) if (overlaps(doorBox, stool)) conflicts.push(`${o.agent.id} door stool ${stool.station}`)
    }
  }
  expect(conflicts).toEqual([])
})

it.each([2, 3, 5, 6])('keeps the desk bodies and doors clear with %i secretaries', count => {
  const agents = Array.from({ length: count }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary' }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, entries = model.occupants.map(o => ({ o, seat: layout.seats[o.key]!, scale: o.agent.scale === null ? .82 : standingScale(o.agent.scale.value) }))
  const conflicts: string[] = []
  for (const { o, seat, scale } of entries) {
    const box = body(o.standing.look, scale, seat.foot)
    for (const obstacle of layout.obstacles.filter(p => p.kind === 'desk')) if (overlaps(box, obstacle)) conflicts.push(`${o.agent.id} desk ${obstacle.station}`)
    for (const piece of layout.pieces.filter(p => ['worker-desk', 'laptop-back', 'coffee-mug'].includes(p.sprite))) if (overlaps(box, art(piece))) conflicts.push(`${o.agent.id} ${piece.sprite}`)
    for (const other of entries.filter(p => p.o.key !== o.key)) if (overlaps(box, body(other.o.standing.look, other.scale, other.seat.foot))) conflicts.push(`${o.agent.id} body ${other.o.agent.id}`)
    for (const door of layout.houses.filter(h => h.group === seat.room).flatMap(h => h.doors)) {
      const doorBox = body(o.standing.look, scale, door)
      for (const stool of layout.obstacles.filter(p => p.kind === 'stool' && p.station !== o.key)) if (overlaps(doorBox, stool)) conflicts.push(`${o.agent.id} door stool ${stool.station}`)
    }
  }
  expect(conflicts).toEqual([])
})
