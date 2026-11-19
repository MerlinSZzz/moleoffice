// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { bodyBox } from '../src/nameplates.ts'
import { houseCatalog } from '../src/village.ts'
import { whereabouts, whereaboutsPoint } from '../src/ownership.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
import type { Rect } from '../src/viewport.ts'
import type { Point } from '../src/geometry.ts'
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const gap = (p: Point, r: Rect) => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.width), Math.max(r.y - p.y, 0, p.y - r.y - r.height))
for (const sleepingCount of [0, 1, 2, 3, 5]) it(`provides native sleeping houses with a clear place for all ${sleepingCount} made-up sleepers`, () => {
  const agents = Array.from({ length: Math.max(3, sleepingCount) }, (_, i) => agent(`person-${i}`, i === 0 ? { role: 'secretary' } : { startedBy: { kind: 'agent', id: 'person-0' } }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster, ...{ sleepingCount } }))
  const houses = layout.houses.filter(h => h.type === 'sleeping-house'), places = layout.places!
  expect(houses).toHaveLength(Math.max(1, Math.ceil(sleepingCount / 2)))
  expect(places.sleep).toHaveLength(houses.length * 2)
  expect(places.sleepingHouse).toEqual({ x: houses[0]!.x, y: houses[0]!.y, width: houses[0]!.width, height: houses[0]!.height })
  const separation = bodyBox({ x: 0, y: 0 }).width
  for (const house of houses) {
    expect([house.width, house.height]).toEqual(houseCatalog.B03!.canvasSize)
    expect(house.label).toBe('Sleeping house'); expect(house.zh).toBe('睡觉的屋子'); expect(house.occupants).toEqual([])
    const parts = layout.pieces.filter(p => p.group === house.group)
    for (const sprite of ['B03-floor', 'B03-back', 'B03-front']) expect(parts.some(p => p.sprite === sprite), sprite).toBe(true)
    expect(parts.filter(p => p.sprite === 'B03-back' && p.layer === 'back')).toHaveLength(1)
    expect(parts.some(p => p.sprite === 'worker-desk')).toBe(false)
    expect(Object.values(layout.seats).some(s => s.room === house.group)).toBe(false)
    expect(layout.paths!.some(path => path.some(p => p.x === house.doors[0]!.x && p.y === house.doors[0]!.y) && path.some(p => gap(p, layout.squares![0]!) === 0))).toBe(true)
    expect(places.sleep.filter(p => gap(p, house) === 0)).toHaveLength(2)
  }
  for (const [i, point] of places.sleep.entries()) {
    for (const obstacle of layout.obstacles) expect(gap(point, obstacle)).toBeGreaterThanOrEqual(layout.bodyRadius + separation)
    for (const prop of layout.pieces.filter(p => !p.sprite.startsWith('B03-') && !['A27', 'A28', 'B28', 'sleep-bed'].includes(p.sprite))) expect(gap(point, prop), prop.sprite).toBeGreaterThanOrEqual(layout.bodyRadius + separation)
    for (const other of places.sleep.slice(i + 1)) expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThanOrEqual(separation)
  }
  const asleep = new Set(agents.slice(0, sleepingCount).map(a => a.id))
  const found = whereabouts(agents.map(a => ({ id: a.id, retired: a.retired })), null, asleep, { play: places.play.length, sleep: places.sleep.length })
  for (const [index, id] of [...asleep].sort().entries()) {
    const at = found.get(id)!
    expect(at).toEqual({ where: 'sleep', index })
    expect(whereaboutsPoint(layout, JSON.stringify(['agent', id]), at)).toEqual(places.sleep[index])
  }
})
