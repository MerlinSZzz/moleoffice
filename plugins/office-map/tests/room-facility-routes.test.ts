// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { facilityPlaces } from '../src/ownership.ts'
import { routeIdle } from '../src/geometry.ts'
import { sweptBodyHits, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingLooks } from '../src/appearance.ts'
import type { RosterView } from '../src/contracts.ts'
import { atlases, sprites } from '../src/assets.ts'
import { agent, people } from './fixtures.ts'
import { checkDeskRoutes, checkOccupiedFacilities } from './room-route-checks.ts'

const envelope = (scale: number) => {
  const bodies = standingLooks.map(look => visualBodyBounds(look, scale)!)
  const x = Math.min(...bodies.map(b => b.x)), y = Math.min(...bodies.map(b => b.y))
  const right = Math.max(...bodies.map(b => b.x + b.width)), bottom = Math.max(...bodies.map(b => b.y + b.height))
  return { x, y, width: right - x, height: bottom - y }
}
const firstRoute = (layout: Parameters<typeof routeIdle>[0], start: Parameters<typeof routeIdle>[1], occupied: Parameters<typeof routeIdle>[3], key: string, body: NonNullable<Parameters<typeof routeIdle>[5]>, art: NonNullable<Parameters<typeof routeIdle>[6]>) => {
  for (const target of layout.places?.play ?? []) {
    const route = routeIdle(layout, start, target, occupied, key, body, art)
    if (route.status === 'found') return route
  }
}

it('assigns distinct places only to members whose state is idle', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 8 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const workers = model.occupants.filter(o => o.agent.role === 'worker')
  const idle = new Set(workers.slice(0, 2).map(o => o.key)), places = facilityPlaces(next.value, idle)
  expect(places.size).toBe(idle.size)
  expect([...places.keys()].every(key => idle.has(key))).toBe(true)
  expect(new Set([...places.values()].map(place => place.index)).size).toBe(places.size)
  expect(facilityPlaces(next.value, new Set())).toEqual(new Map())
  expect(facilityPlaces(next.value, idle)).toEqual(places)
  const allIdle = facilityPlaces(next.value, new Set(workers.map(o => o.key)))
  const capacity = (next.value.facilities ?? []).filter(place => place.room === next.value.seats[workers[0]!.key]!.room).length
  expect(allIdle.size).toBe(capacity)
  expect(allIdle.size).toBeLessThan(workers.length)
  expect(new Set([...allIdle.values()].map(place => place.index)).size).toBe(allIdle.size)
})

it.each([1, 2, 3, 4, 5])('gives the shared house of %i secretaries a facility place', count => {
  const agents = Array.from({ length: count }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary' }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, idle = facilityPlaces(layout, new Set(model.occupants.map(o => o.key)))
  expect(idle.size).toBeGreaterThan(0)
  const pack: any = { sources: { sprites }, images: new Map(Object.keys(atlases).map(key => [key, {}])) }
  const art: { x: number; y: number; width: number; height: number }[] = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack })
  expect(art).not.toBeNull()
  const largest = envelope(.92)
  for (const mover of model.occupants) {
    const key = mover.key, place = facilityPlaces(layout, new Set([key])).get(key)!
    const occupied = model.occupants.filter(o => o.key !== key).map(o => translateBody(largest, layout.seats[o.key]!.foot))
    const blockers = [...occupied, ...art, ...layout.obstacles]
    expect(blockers.some(blocker => sweptBodyHits(place.foot, place.foot, largest, blocker)), key).toBe(false)
    const routes = [firstRoute(layout, place.foot, occupied, key, largest, art), routeIdle(layout, layout.seats[key]!.foot, place.foot, occupied, key, largest, art)]
    for (const route of routes) {
      expect(route?.status, key).toBe('found')
      if (route) for (let i = 1; i < route.points.length; i++)
        expect(blockers.find(blocker => sweptBodyHits(route.points[i - 1]!, route.points[i]!, largest, blocker)), key + ' route clearance').toBeUndefined()
    }
  }
}, 120000)

it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])('checks all desk routes in a room of %i', checkDeskRoutes, 240000)

it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])('checks occupied facilities in a room of %i', checkOccupiedFacilities, 240000)
