// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeIdle } from '../src/geometry.ts'
import { IDLE_ROUTE_STEP } from '../src/idle-route.ts'
import { sweptBodyHits, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingScale } from '../src/appearance.ts'
import type { Rect } from '../src/viewport.ts'
import type { RosterView } from '../src/contracts.ts'
import * as bundled from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

// The capture trial's office that idle-desk-talk-route.test.ts walks, built the same way: a
// secretary with two supervisors, nine team workers, an inspector and a direct room of thirteen
// workers, invented-14 to invented-26, of every standing scale.
const made = (id: string, role: string, by: string | null, i: number) => agent(id, { role, startedBy: by ? { kind: 'agent', id: by } : null, scale: { version: 1, roleAtGeneration: role, value: (i % 5) / 4 } } as any)
const trialOffice = () => [made('invented-1', 'secretary', null, 0), made('invented-2', 'supervisor', 'invented-1', 1), made('invented-3', 'supervisor', 'invented-1', 2),
  ...[4, 5, 6, 7, 8].map(n => made(`invented-${n}`, 'worker', 'invented-2', n)), ...[9, 10, 11, 12].map(n => made(`invented-${n}`, 'worker', 'invented-3', n)),
  made('invented-13', 'inspector', 'invented-1', 13), ...Array.from({ length: 13 }, (_, i) => made(`invented-${14 + i}`, 'worker', 'invented-1', 14 + i))]
function office() {
  const model = mapOffice({ ...people, view: 'roster', agents: trialOffice() } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = build.next(); while (!next.done) next = build.next()
  const layout = next.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art: (Rect & { sprite?: string })[] = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack })
  const standing = model.occupants.map(o => ({ key: o.key, id: o.agent.id, seat: layout.seats[o.key]!, body: visualBodyBounds(o.standing.look, o.agent.scale === null ? .82 : standingScale(o.agent.scale.value))! }))
  // Walk between adjacent desks past every other body, including the person at the target desk.
  // The room's current geometry no longer requires the reverse search for this particular pair.
  const walker = standing.find(p => p.id === 'invented-14')!, target = standing.find(p => p.id === 'invented-15')!
  const bodies = standing.filter(p => p !== walker).map(p => ({ name: `body of ${p.id}`, rect: translateBody(p.body, p.seat.foot) }))
  const pieces = [...bodies, ...art.map(r => ({ name: r.sprite ?? 'furniture', rect: r as Rect })), ...layout.obstacles.map(o => ({ name: `${o.kind} obstacle`, rect: o as Rect }))]
  const route = (expansions?: number) => routeIdle(layout, walker.seat.foot, target.seat.talk, bodies.map(b => b.rect), walker.key, walker.body, art, { expansions })
  return { walker, target, pieces, route }
}

// The room has moved since the trial. Keep its real route and collision check, while a narrow
// synthetic passage below exercises the reverse search independently of room coordinates.
it('finds a clear walk to the next desk in the trial office', () => {
  const { walker, target, pieces, route } = office(), found = route()
  expect(found.status).toBe('found')
  expect(found.points[0]).toEqual(walker.seat.foot)
  expect(found.points.at(-1)).toEqual(target.seat.talk)
  const hits = found.points.slice(1).flatMap((b, i) => pieces.filter(q => sweptBodyHits(found.points[i]!, b, walker.body, q.rect)).map(q => q.name))
  expect(hits).toEqual([])
}, 120000)

function narrowPassage() {
  const start = { x: 32, y: 32 }, end = { x: 104, y: 176 }, body = { x: -1, y: -1, width: 2, height: 2 }
  const obstacles: Rect[] = [{ x: 0, y: 96, width: 100, height: 16 }, { x: 108, y: 96, width: 132, height: 16 }]
  const layout = { bounds: { x: 0, y: 0, width: 240, height: 240 }, square: { x: 0, y: 0, width: 240, height: 240 }, pieces: [], houses: [], road: { rings: [], faults: [] }, obstacles } as unknown as Parameters<typeof routeIdle>[0]
  const route = (expansions?: number) => routeIdle(layout, start, end, [], undefined, body, [], { expansions })
  return { start, end, body, obstacles, route }
}

it('finds a passage reachable only on the target lattice by searching back to the walker', () => {
  const { start, end, body, obstacles, route } = narrowPassage(), found = route()
  expect(found.status).toBe('found')
  expect(found.points[0]).toEqual(start)
  expect(found.points.at(-1)).toEqual(end)
  const on = (p: { x: number; y: number }, from: { x: number; y: number }) => (p.x - from.x) % IDLE_ROUTE_STEP === 0 && (p.y - from.y) % IDLE_ROUTE_STEP === 0
  expect(on(start, end)).toBe(false)
  const between = found.points.slice(1, -1)
  expect(between.length).toBeGreaterThan(0)
  expect(between.every(p => on(p, end))).toBe(true)
  expect(found.work!.fromWalker).toBeGreaterThan(0)
  const hits = found.points.slice(1).flatMap((b, i) => obstacles.filter(rect => sweptBodyHits(found.points[i]!, b, body, rect)))
  expect(hits).toEqual([])
}, 120000)

it('counts the search from the talk point against the same expansions, gives it no more than the search from the walker used, and answers exhausted when they run out', () => {
  const { route } = narrowPassage(), found = route(), used = found.work!.expansions
  expect(found.status).toBe('found')
  // The search from the talk point may use as many expansions as the search from the walker used.
  const fromWalker = found.work!.fromWalker!, fromTarget = used - fromWalker
  console.log('TRIAL-WALK-EXPANSIONS', JSON.stringify({ fromWalker, fromTarget, used }))
  expect(fromTarget).toBeGreaterThan(0)
  expect(fromTarget).toBeLessThanOrEqual(fromWalker)
  expect(route(used).status).toBe('found')
  // One expansion fewer than both searches used: the search from the talk point would find the
  // walk on its own count, so only a shared count can stop it.
  const short = route(used - 1)
  expect(short.status).toBe('exhausted')
  expect(short.points).toEqual([])
  expect(short.work).toMatchObject({ expansions: used - 1, bound: 'expansions' })
  expect(route(10)).toMatchObject({ status: 'exhausted', points: [], work: { expansions: 10, bound: 'expansions' } })
}, 120000)
