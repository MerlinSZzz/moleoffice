// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { LayoutCache, pointIsClear, routeBetween } from '../src/geometry.ts'
import { GeometryEngine } from '../src/worker-protocol.ts'
import { houseCatalog, housePools, houseStyles, inPolygon } from '../src/village.ts'
import { roadContains } from '../src/road-contour.ts'
import { legacyRouteBetween } from './legacy-route.ts'

describe('small graph routes and incremental layouts', () => {
  it('reaches the old endpoints through every variant on both sides, with clear continuous legs', () => {
    for (const style of Object.keys(houseCatalog)) for (const side of [0, 1]) {
      const n = housePools.studio.some(s => s === style) ? 2 : housePools.four.some(s => s === style) ? 4 : 8
      const own = (id: string) => ({ id, occupants: Array.from({ length: n }, (_, i) => `seat-${i}`) }), other = { id: 'outside', occupants: ['outside'] }
      const rooms = (id: string) => side ? [other, own(id)] : [own(id), other]
      let id = ''; for (let i = 0; i < 1000; i++) if (houseStyles(rooms(`oracle-${i}`))[side] === style) { id = `oracle-${i}`; break }
      const layout = new LayoutCache().layout({ rooms: rooms(id) })
      for (const [from, to] of [['seat-0', 'outside'], ['outside', `seat-${n - 1}`]]) {
        const before = legacyRouteBetween(layout, from!, to!), after = routeBetween(layout, from!, to!)
        expect(after.status, `${style} ${side} ${from}`).toBe(before.status)
        expect(after.status).toBe('found')
        expect(after.points[0]).toEqual(before.points[0]); expect(after.points.at(-1)).toEqual(before.points.at(-1))
        for (let i = 1; i < after.points.length; i++) {
          const a = after.points[i - 1]!, b = after.points[i]!, steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4)
          for (let t = 0; t <= steps; t++) {
            const p = { x: a.x + (b.x - a.x) * t / steps, y: a.y + (b.y - a.y) * t / steps }
            expect(pointIsClear(layout, p, [from!, to!])).toBe(true)
            expect(layout.houses.some(h => h.walkable.some(poly => inPolygon(p, poly))) || roadContains(layout.road, p) || p.x >= layout.square.x && p.x <= layout.square.x + layout.square.width && p.y >= 0 && p.y <= 512).toBe(true)
          }
        }
      }
    }
  }, 30000)
  it('slices a 5000-seat first layout, invalidates endpoint routes, and abandons partial work', () => {
    const engine = new GeometryEngine(), input = { rooms: Array.from({ length: 500 }, (_, i) => ({ id: `room-${i}`, occupants: Array.from({ length: 10 }, (_, j) => `person-${i}-${j}`) })) }
    const work = engine.work({ id: 1, kind: 'layout', input }), first = work.next()
    expect(first.value).toMatchObject({ kind: 'overview', layout: { rooms: expect.any(Array) } })
    let slices = 1, last = work.next(); while (!last.done) { slices++; last = work.next() }
    expect(slices).toBeGreaterThan(500)
    expect(last.value?.kind).toBe('layout')
    if (last.value?.kind !== 'layout') throw Error('Expected complete layout')
    expect(Object.keys(last.value.layout.seats)).toHaveLength(5000)
    expect(engine.receive({ id: 2, kind: 'route', layoutKey: last.value.layout.key, from: 'person-0-0', to: 'person-499-9' })).toMatchObject({ route: { status: 'found' } })
    const partial = engine.work({ id: 3, kind: 'layout', input: { rooms: [{ id: 'only', occupants: ['new'] }] } }); partial.next(); partial.return(null)
    const changed = engine.receive({ id: 4, kind: 'layout', input: { rooms: [{ id: 'only', occupants: ['new'] }] } })!
    expect(changed.kind).toBe('layout')
    expect(engine.receive({ id: 5, kind: 'route', layoutKey: last.value.layout.key, from: 'person-0-0', to: 'person-499-9' })).toMatchObject({ route: { status: 'unavailable' } })
  }, 30000)
})
