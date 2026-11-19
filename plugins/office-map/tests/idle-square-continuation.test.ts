// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { standingLooks } from '../src/appearance.ts'
import { chooseIdlePlaces } from '../src/walks.ts'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeIdle } from '../src/geometry.ts'
import { bodiesOverlap, sweptBodyHits, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import type { RosterView } from '../src/contracts.ts'
import * as bundled from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

it('provides distinct outdoor starting places and routes clear of native scenery and other bodies', () => {
  const agents = [agent('fictional-secretary', { role: 'secretary' }), ...Array.from({ length: 7 }, (_, i) => agent(`fictional-worker-${i}`, { startedBy: { kind: 'agent', id: 'fictional-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let step = work.next(); while (!step.done) step = work.next()
  const layout = step.value, points = layout.places!.play
  const fake: any = { layout, pack: { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) } }
  const furniture = (OfficeMap.prototype as any).motionFurniture.call(fake)
  expect(furniture).not.toBeNull()
  const bodies = model.occupants.slice(0, 3).map(o => visualBodyBounds(o.standing.look, .92)!)
  const blockers = [...furniture, ...layout.obstacles]
  console.log("square diagnostics", JSON.stringify({ square: layout.square, points, bodies, collisions: points.map((p, i) => blockers.filter(o => bodiesOverlap(translateBody(bodies[i]!, p), o))), pairRoutes: points.map((start, i) => points.map((target, j) => i === j ? "same" : routeIdle(layout, start, target, [], undefined, bodies[i], furniture).status)) }))
  for (let y = 80; y <= 480; y += 32) { let row = ""; for (let x = 32; x <= 1088; x += 32) { const point = { x: layout.square.x + x, y: layout.square.y + y }; row += blockers.some(o => bodiesOverlap(translateBody(bodies[0]!, point), o)) ? "#" : "." } console.log(y, row) }
  for (let i = 0; i < 3; i++) {
    const body = bodies[i]!, start = points[i]!
    const others = points.flatMap((p, j) => i === j ? [] : [translateBody(bodies[j]!, p)])
    expect(blockers.filter(obstacle => bodiesOverlap(translateBody(body, start), obstacle)), `start ${i}`).toEqual([])
    for (let j = 0; j < 3; j++) {
      if (i === j) continue
      const occupied = others.filter((_, index) => index !== (j < i ? j : j - 1))
      const route = routeIdle(layout, start, points[j]!, occupied, undefined, body, furniture)
      expect(route.status, `route ${i} -> ${j}`).toBe('found')
      for (let k = 1; k < route.points.length; k++) for (const obstacle of [...blockers, ...occupied]) {
        expect(sweptBodyHits(route.points[k - 1]!, route.points[k]!, body, obstacle)).toBe(false)
      }
    }
  }
}, 30000)

// A destination cannot be a no-op or another participant's reserved home.
it('chooses destinations away from both participants and all other bodies', () => {
  const body = { x: -34, y: -78, width: 68, height: 80 }
  const starts = [{ x: 120, y: 560 }, { x: 520, y: 560 }]
  const candidates = [{ x: 120, y: 560 }, { x: 280, y: 560 }, { x: 680, y: 560 }]
  const result = (chooseIdlePlaces as any)(candidates, [], () => true, [body, body], 0, 160, starts)
  expect(result).toEqual([{ x: 280, y: 560 }, { x: 440, y: 560 }])
  const single = (chooseIdlePlaces as any)(candidates, [], () => true, [body], 0, 160, starts.slice(0, 1))
  expect(single).toEqual([{ x: 280, y: 560 }])
})

it('routes every approved look around scenery and a third reserved outdoor body', () => {
  const agents = [agent('made-secretary', { role: 'secretary' }), ...Array.from({ length: 6 }, (_, i) => agent(`made-worker-${i}`, { startedBy: { kind: 'agent', id: 'made-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let step = work.next(); while (!step.done) step = work.next()
  const layout = step.value, points = layout.places!.play
  const fake: any = { layout, pack: { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) } }
  const scenery = (OfficeMap.prototype as any).motionFurniture.call(fake)
  const other = visualBodyBounds('backpack', .92)!
  for (const look of standingLooks) {
    const mover = visualBodyBounds(look, .92)!
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      if (i === j) continue
      const remaining = 3 - i - j, occupied = [translateBody(other, points[remaining]!)]
      const route = routeIdle(layout, points[i]!, points[j]!, occupied, undefined, mover, scenery)
      if (route.status !== 'found') console.log(JSON.stringify({ look, i, j, mover, points, startHits: [...scenery, ...layout.obstacles, ...occupied].filter(o => bodiesOverlap(translateBody(mover, points[i]!), o)), targetHits: [...scenery, ...layout.obstacles, ...occupied].filter(o => bodiesOverlap(translateBody(mover, points[j]!), o)) }))
      expect(route.status, `${look}: ${i} to ${j}`).toBe('found')
      for (let n = 1; n < route.points.length; n++) for (const block of [...scenery, ...layout.obstacles, ...occupied])
        expect(sweptBodyHits(route.points[n - 1]!, route.points[n]!, mover, block)).toBe(false)
    }
  }
}, 30000)
