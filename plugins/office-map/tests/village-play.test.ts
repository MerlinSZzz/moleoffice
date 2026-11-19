// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { bodyBox } from '../src/nameplates.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
import type { Rect } from '../src/viewport.ts'
import type { Point } from '../src/geometry.ts'
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const gap = (p: Point, r: Rect) => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.width), Math.max(r.y - p.y, 0, p.y - r.y - r.height))
for (const count of [1, 16, 120]) it(`provides three clear and separated places to play for ${count} agents`, () => {
  const agents = Array.from({ length: count }, (_, i) => agent(`person-${i}`, i === 0 ? { role: 'secretary' } : i < 4 ? { role: 'supervisor', startedBy: { kind: 'agent', id: 'person-0' } } : { startedBy: { kind: 'agent', id: `person-${1 + i % 3}` } }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
  const square = layout.squares![0]!, points = layout.places?.play ?? []
  expect(points.length).toBeGreaterThanOrEqual(3)
  // One full body width plus the body radius of a walker passing: two moles can stand at
  // neighbouring places and a third can walk between a place and a piece without overlapping.
  const PLAY_PLACE_CLEARANCE = layout.bodyRadius + bodyBox({ x: 0, y: 0 }).width
  for (const [i, point] of points.entries()) {
    expect(point.x).toBeGreaterThanOrEqual(square.x); expect(point.x).toBeLessThanOrEqual(square.x + square.width)
    expect(point.y).toBeGreaterThanOrEqual(square.y); expect(point.y).toBeLessThanOrEqual(square.y + square.height)
    for (const item of [...layout.pieces, ...layout.obstacles]) expect(gap(point, item)).toBeGreaterThanOrEqual(PLAY_PLACE_CLEARANCE)
    for (const other of points.slice(i + 1)) expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThanOrEqual(PLAY_PLACE_CLEARANCE)
  }
})
