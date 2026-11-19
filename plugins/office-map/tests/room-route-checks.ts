// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { facilityPlaces } from '../src/ownership.ts'
import { routeIdle } from '../src/geometry.ts'
import { atDesk } from '../src/desk-things.ts'
import { sweptBodyHits, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingLooks } from '../src/appearance.ts'
import type { RosterView } from '../src/contracts.ts'
import { atlases, sprites } from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

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

export const checkDeskRoutes = (count: number) => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: count }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, pack: any = { sources: { sprites }, images: new Map(Object.keys(atlases).map(key => [key, {}])) }
  const art = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack })
  expect(art).not.toBeNull()
  const body = envelope(.92)
  const entries = model.occupants.map(o => ({ o, seat: layout.seats[o.key]!, body }))
  const workers = entries.filter(e => e.o.agent.role === 'worker')
  for (const mover of workers) {
    const occupied = entries.filter(other => other !== mover).map(other => translateBody(other.body, other.seat.foot))
    expect([...occupied, ...art, ...layout.obstacles].some(blocker => sweptBodyHits(mover.seat.foot, mover.seat.foot, mover.body, blocker)), mover.o.key + ' foot clearance').toBe(false)
  }
  for (const mover of workers) {
    expect(mover.seat.desk.width, mover.o.key + ' desk').toBeGreaterThan(0)
    for (const atFoot of [true, false]) {
      const occupied = entries.filter(other => other !== mover).map(other => translateBody(other.body, atFoot ? other.seat.foot : atDesk(other.seat)))
      const blockers = [...occupied, ...art, ...layout.obstacles]
      const route = firstRoute(layout, mover.seat.foot, occupied, mover.o.key, mover.body, art)
      expect(route, mover.o.key + (atFoot ? ' at feet' : ' at desks')).toBeDefined()
      if (route) for (let i = 1; i < route.points.length; i++)
        expect(blockers.find(blocker => sweptBodyHits(route.points[i - 1]!, route.points[i]!, mover.body, blocker)), mover.o.key + ' route clearance').toBeUndefined()
    }
  }
}

export const checkOccupiedFacilities = (count: number) => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: count }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, pack: any = { sources: { sprites }, images: new Map(Object.keys(atlases).map(key => [key, {}])) }
  const art: { x: number; y: number; width: number; height: number }[] = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack })
  expect(art).not.toBeNull()
  const workers = model.occupants.filter(o => o.agent.role === 'worker')
  const placements = facilityPlaces(layout, new Set(workers.map(o => o.key)))
  expect(placements.size).toBeGreaterThan(0)
  const largest = envelope(.92)
  for (const [key, place] of placements) {
    // Any other member can become busy while this place remains occupied.
    // Check both the standing foot and the working position independently of
    // the particular all-idle assignment used for the route checks below.
    for (const other of model.occupants.filter(o => o.key !== key)) {
      const seat = layout.seats[other.key]!
      for (const point of [seat.foot, atDesk(seat)])
        expect(sweptBodyHits(place.foot, place.foot, largest, translateBody(largest, point)), key + ' beside ' + other.key).toBe(false)
    }
    const otherPeople = model.occupants.filter(o => o.key !== key).map(o => {
      const seat = layout.seats[o.key]!, there = placements.get(o.key)?.foot ?? (o.agent.role === 'worker' ? seat.foot : atDesk(seat))
      return translateBody(largest, there)
    })
    expect([...otherPeople, ...art, ...layout.obstacles].some(blocker => sweptBodyHits(place.foot, place.foot, largest, blocker)), key + ' facility').toBe(false)
  }
  const entries = model.occupants.map(o => {
    const seat = layout.seats[o.key]!, facility = placements.get(o.key)
    return { key: o.key, foot: facility?.foot ?? (o.agent.role === 'worker' ? seat.foot : atDesk(seat)), start: facility?.foot ?? seat.foot,
      body: largest }
  })
  const memberEntries = entries.filter(e => workers.some(o => o.key === e.key))
  for (const mover of memberEntries) {
    const occupied = entries.filter(other => other !== mover).map(other => translateBody(other.body, other.foot))
    expect([...occupied, ...art, ...layout.obstacles].some(o => sweptBodyHits(mover.start, mover.start, mover.body, o)), mover.key + ' start').toBe(false)
  }
  for (const mover of memberEntries) {
    const occupied = entries.filter(other => other !== mover).map(other => translateBody(other.body, other.foot))
    const blockers = [...occupied, ...art, ...layout.obstacles]
    const route = firstRoute(layout, mover.start, occupied, mover.key, mover.body, art)
    expect(route, mover.key + ' route').toBeDefined()
    if (route) for (let i = 1; i < route.points.length; i++)
      expect(blockers.find(blocker => sweptBodyHits(route.points[i - 1]!, route.points[i]!, mover.body, blocker)), mover.key + ' route clearance').toBeUndefined()
  }
}
