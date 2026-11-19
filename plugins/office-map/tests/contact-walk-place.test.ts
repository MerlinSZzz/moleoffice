// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeIdle } from '../src/geometry.ts'
import { contactPlace, CONTACT_REACH } from '../src/idle-places.ts'
import { IDLE_ROUTE_EXPANSIONS, IDLE_ROUTE_STEP } from '../src/idle-route.ts'
import { atDesk } from '../src/desk-things.ts'
import { translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { actorScale } from '../src/action-binding.ts'
import type { Rect } from '../src/viewport.ts'
import type { Point } from '../src/geometry.ts'
import type { RosterView } from '../src/contracts.ts'
import * as bundled from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

// Every id here is made up. A hall of secretaries at the largest saved size, where a partner's own
// figure covered its talk point, and a room of thirteen workers, with a hall of desks and readers
// seated on open ground outside every house.
const secretaries = (n: number) => Array.from({ length: n }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary', scale: { version: 1, roleAtGeneration: 'secretary', value: 1.6 } }))
const room = (n: number) => [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: n }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
function office(agents: ReturnType<typeof agent>[]) {
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = build.next(); while (!next.done) next = build.next()
  const layout = next.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art: Rect[] = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack })
  const entries = model.occupants.map(o => ({ key: o.key, name: o.agent.id, seat: layout.seats[o.key]!, body: visualBodyBounds(o.standing.look, actorScale(o))! }))
  return { layout, art, entries }
}

// The page sends a contact walker to contactPlace with every other body where it is drawn: at its foot,
// or behind its desk for a figure at work. The walker and its partner are free to walk, so they stand at
// their feet. Each partner gets a walker from the next room and the nearest figure in its own room.
function contactWalks({ layout, art, entries }: ReturnType<typeof office>) {
  const rooms = [...new Set(entries.map(e => e.seat.room))]
  const walks: { said: string; desks: boolean; walker: typeof entries[number]; partner: typeof entries[number]; others: Rect[]; place: Point | null }[] = []
  for (const desks of [false, true]) for (const partner of entries) {
    const next = entries.find(e => e.seat.room === rooms[(rooms.indexOf(partner.seat.room) + 1) % rooms.length] && e !== partner)
    const near = entries.filter(e => e !== partner && e.seat.room === partner.seat.room).sort((a, b) => Math.hypot(a.seat.foot.x - partner.seat.foot.x, a.seat.foot.y - partner.seat.foot.y) - Math.hypot(b.seat.foot.x - partner.seat.foot.x, b.seat.foot.y - partner.seat.foot.y))[0]
    for (const walker of new Set([next, near].filter(one => !!one).map(one => one!))) {
      const drawn = (e: typeof walker) => desks && e !== partner && e.seat.desk && e.seat.desk.width > 0 ? atDesk(e.seat) : e.seat.foot
      const others = entries.filter(e => e !== walker).map(e => translateBody(e.body, drawn(e)))
      const said = `${walker.name} to ${partner.name} with the others ${desks ? 'where drawn at work' : 'at their feet'}`
      walks.push({ said, desks, walker, partner, others, place: contactPlace(layout, { id: walker.key, foot: walker.seat.foot, body: walker.body }, partner.seat, [...others, ...art, ...layout.obstacles]) })
    }
  }
  return walks
}
// Every offered walk must end within reach of the partner and be found within the route bound.
function refused({ layout, art }: ReturnType<typeof office>, walks: ReturnType<typeof contactWalks>) {
  const failures: string[] = []
  for (const { said, walker, partner, others, place } of walks) {
    if (!place) continue
    if (Math.hypot(place.x - partner.seat.foot.x, place.y - partner.seat.foot.y) > CONTACT_REACH) failures.push(`${said}: ${place.x},${place.y} is further than the reach`)
    const route = routeIdle(layout, walker.seat.foot, place, others, walker.key, walker.body, art, { expansions: IDLE_ROUTE_EXPANSIONS })
    if (route.status !== 'found') failures.push(`${said} at ${place.x},${place.y}: ${route.status}`)
  }
  return failures
}

// In these rooms a route reaches a clear point beside every partner, so every walk is offered, and
// every offered walk must be found within the route bound.
it.each([['a hall of 11 secretaries', secretaries(11)], ['a room of 13 workers', room(13)]] as const)
('walks every contact walk it offers in %s', (_, agents) => {
  const built = office([...agents]), walks = contactWalks(built)
  expect([...walks.filter(walk => !walk.place).map(walk => `${walk.said}: not offered`), ...refused(built, walks)]).toEqual([])
  expect(walks.filter(walk => walk.place).length).toBeGreaterThanOrEqual(2 * built.entries.length)
}, 120000)

// The expanded room leaves the secretary's desk reachable from both directions. The old
// fixed room enclosed it; check all offered walks and retain both directions of that case.
it('offers reachable contact walks to and from the secretary in an office of 11', () => {
  const built = office(room(10)), walks = contactWalks(built)
  const secretary = walks.filter(walk => walk.walker.name === 'invented-secretary' || walk.partner.name === 'invented-secretary')
  expect(secretary.some(walk => walk.walker.name === 'invented-secretary')).toBe(true)
  expect(secretary.some(walk => walk.partner.name === 'invented-secretary')).toBe(true)
  expect(walks.filter(walk => !walk.place).map(walk => walk.said)).toEqual([])
  expect(refused(built, walks)).toEqual([])
}, 120000)

// A ring of bodies around the partner, wider than the reach, shuts every point beside it off from the
// walker. The walk is not offered, and no route reaches the partner's talk point.
it('does not offer a walk to a partner nobody can reach', () => {
  const { layout, art, entries } = office(room(13))
  const walker = entries.find(e => e.name === 'invented-secretary')!, partner = entries.find(e => e.name === 'invented-worker-0')!
  const { x, y } = partner.seat.foot, half = CONTACT_REACH + 96, wall = 16
  const ring: Rect[] = [{ x: x - half - wall, y: y - half - wall, width: 2 * (half + wall), height: wall }, { x: x - half - wall, y: y + half, width: 2 * (half + wall), height: wall },
    { x: x - half - wall, y: y - half, width: wall, height: 2 * half }, { x: x + half, y: y - half, width: wall, height: 2 * half }]
  const others = [...entries.filter(e => e !== walker).map(e => translateBody(e.body, e.seat.foot)), ...ring]
  expect(contactPlace(layout, { id: walker.key, foot: walker.seat.foot, body: walker.body }, partner.seat, [...others, ...art, ...layout.obstacles])).toBeNull()
  expect(routeIdle(layout, partner.seat.talk, partner.seat.talk, others, walker.key, walker.body, art).status).toBe('found')
  expect(routeIdle(layout, walker.seat.foot, partner.seat.talk, others, walker.key, walker.body, art, { expansions: IDLE_ROUTE_EXPANSIONS }).status).not.toBe('found')
  // Enumerate every clear candidate within reach on the walker's lattice, not just the talk point.
  const from = walker.seat.foot, step = IDLE_ROUTE_STEP, reached: Point[] = []
  let clear = 0
  for (let qy = from.y + Math.ceil((y - CONTACT_REACH - from.y) / step) * step; qy <= y + CONTACT_REACH; qy += step)
    for (let qx = from.x + Math.ceil((x - CONTACT_REACH - from.x) / step) * step; qx <= x + CONTACT_REACH; qx += step) {
      const q = { x: qx, y: qy }
      if (Math.hypot(qx - x, qy - y) > CONTACT_REACH || routeIdle(layout, q, q, others, walker.key, walker.body, art).status !== 'found') continue
      clear++
      if (routeIdle(layout, from, q, others, walker.key, walker.body, art, { expansions: IDLE_ROUTE_EXPANSIONS }).status === 'found') reached.push(q)
    }
  expect(clear).toBeGreaterThan(0)
  expect(reached).toEqual([])
}, 120000)
