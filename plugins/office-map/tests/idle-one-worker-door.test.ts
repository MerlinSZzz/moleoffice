// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeIdle } from '../src/geometry.ts'
import { IDLE_ROUTE_STEP } from '../src/idle-route.ts'
import { bodiesOverlap, sweptBodyHits, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingScale } from '../src/appearance.ts'
import { actorScale } from '../src/action-binding.ts'
import { atDesk } from '../src/desk-things.ts'
import type { RosterView } from '../src/contracts.ts'
import type { Rect } from '../src/viewport.ts'
import * as bundled from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

it('lets an invented single worker reach the room door without crossing any visible furnishing', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), agent('invented-worker-0', { startedBy: { kind: 'agent', id: 'invented-secretary' } })]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let result = build.next(); while (!result.done) result = build.next()
  const layout = result.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack }); expect(art).not.toBeNull()
  const entries = model.occupants.map(o => ({ o, foot: layout.seats[o.key]!.foot, body: visualBodyBounds(o.standing.look, o.agent.scale === null ? .82 : standingScale(o.agent.scale.value))! }))
  const worker = entries.find(e => e.o.agent.id === 'invented-worker-0')!, seat = layout.seats[worker.o.key]!
  const door = layout.houses.find(h => h.group === seat.room)!.doors[0]!
  const occupied = entries.filter(e => e !== worker).map(e => translateBody(e.body, e.foot))
  const route = routeIdle(layout, worker.foot, door, occupied, worker.o.key, worker.body, art)
  expect(route.status).toBe('found')
  const obstacles = layout.obstacles
  for (let i = 1; i < route.points.length; i++) for (const obstacle of [...art, ...obstacles, ...occupied])
    expect(sweptBodyHits(route.points[i - 1]!, route.points[i]!, worker.body, obstacle)).toBe(false)
}, 30000)

// Each figure walks from where it stands, round its own stool, to its room's door
// with its full visible body clear of every stool, furnishing and other figure.
it.each([['worker', 1], ['worker', 2], ['worker', 4], ['worker', 5], ['worker', 8], ['secretary', 1], ['secretary', 2], ['secretary', 3], ['secretary', 4], ['secretary', 5]] as const)('gives every figure of an invented %s room of %i an open walkway to its door', (kind, count) => {
  const agents = kind === 'secretary' ? Array.from({ length: count }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary' }))
    : [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: count }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let result = build.next(); while (!result.done) result = build.next()
  const layout = result.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack }); expect(art).not.toBeNull()
  const entries = model.occupants.map(o => ({ o, foot: layout.seats[o.key]!.foot, body: visualBodyBounds(o.standing.look, o.agent.scale === null ? .82 : standingScale(o.agent.scale.value))! }))
  const failures: string[] = []
  for (const mover of entries) {
    const door = layout.houses.find(h => h.group === layout.seats[mover.o.key]!.room)!.doors[0]!
    const occupied = entries.filter(e => e !== mover).map(e => translateBody(e.body, e.foot))
    const route = routeIdle(layout, mover.foot, door, occupied, mover.o.key, mover.body, art)
    if (route.status !== 'found') { failures.push(`${mover.o.agent.id}: ${route.status}`); continue }
    for (let i = 1; i < route.points.length; i++) for (const obstacle of [...art, ...layout.obstacles, ...occupied])
      if (sweptBodyHits(route.points[i - 1]!, route.points[i]!, mover.body, obstacle)) failures.push(`${mover.o.agent.id}: crosses ${JSON.stringify(obstacle)}`)
  }
  expect(failures).toEqual([])
}, 60000)

// Every secretary of an invented room of `count`, all at one saved size, walks from its foot, round its own stool, to
// its room's door point moved by each offset, with its full visible body clear of every drawn piece, wall and other
// figure: once with the others standing at their feet, and once with them at their desks. The answer lists every walk
// that is not found or crosses something.
function secretaryWalks(count: number, saved: number | null, offsets: readonly (readonly [number, number])[] = [[0, 0]]): string[] {
  const agents = Array.from({ length: count }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary', scale: saved === null ? null : { version: 1, roleAtGeneration: 'secretary', value: saved } }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let result = build.next(); while (!result.done) result = build.next()
  const layout = result.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack }); expect(art).not.toBeNull()
  expect(new Set(model.occupants.map(o => actorScale(o).toFixed(2)))).toEqual(new Set([saved === null ? '0.82' : '0.92']))
  const entries = model.occupants.map(o => ({ o, seat: layout.seats[o.key]!, body: visualBodyBounds(o.standing.look, actorScale(o))! }))
  const failures: string[] = []
  for (const [dx, dy] of offsets) for (const at of ['feet', 'desks'] as const) for (const mover of entries) {
    const door = layout.houses.find(h => h.group === mover.seat.room)!.doors[0]!, target = { x: door.x + dx, y: door.y + dy }
    const occupied = entries.filter(e => e !== mover).map(e => translateBody(e.body, at === 'desks' && e.seat.desk && e.seat.desk.width > 0 ? atDesk(e.seat) : e.seat.foot))
    const route = routeIdle(layout, mover.seat.foot, target, occupied, mover.o.key, mover.body, art), label = `door ${dx},${dy}, others at ${at}, ${mover.o.agent.id}`
    if (route.status !== 'found') { failures.push(`${label}: ${route.status}${route.work?.bound ? `, stopped by its ${route.work.bound} bound after ${route.work.expansions} expansions` : ''}`); continue }
    for (let i = 1; i < route.points.length; i++) for (const obstacle of [...art, ...layout.obstacles, ...occupied])
      if (sweptBodyHits(route.points[i - 1]!, route.points[i]!, mover.body, obstacle)) failures.push(`${label}: crosses ${JSON.stringify(obstacle)}`)
  }
  return failures
}

// A body whose every reading holds the thread, doing no work, for `times` the work done since the last hold, once at
// least 1 ms of work has gone by. The search reads the mover's body inside each of its steps, so the hold falls inside
// them, as a busy machine's does: the clock runs on and the work does not. `totals` says how long the thread was held
// and how long it worked between the holds.
function heldBody(body: Rect, times: number) {
  const cell = new Int32Array(new SharedArrayBuffer(4)), totals = { held: 0, worked: 0 }
  let since = performance.now()
  const hold = () => {
    const at = performance.now(), work = at - since
    if (work < 1) return
    Atomics.wait(cell, 0, 0, times * work)
    since = performance.now(); totals.held += since - at; totals.worked += work
  }
  const held = Object.defineProperties({}, Object.fromEntries((['x', 'y', 'width', 'height'] as const).map(key => [key, { enumerable: true, get: () => { hold(); return body[key] } }]))) as Rect
  return { held, totals }
}

// The walk a plugin check on a busy machine once answered exhausted: in the room of 11 at the largest real size, the
// third secretary to its door, with the others at their feet. Held for 20 times the work of each stretch of its search,
// it is found as it is unheld, with the same points and the same expansions.
it('finds a secretary\'s walk to its door when the thread is held, doing no work, for 20 times the work of its search', () => {
  const agents = Array.from({ length: 11 }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary', scale: { version: 1, roleAtGeneration: 'secretary', value: 1.6 } }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let result = build.next(); while (!result.done) result = build.next()
  const layout = result.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack }); expect(art).not.toBeNull()
  const entries = model.occupants.map(o => ({ o, seat: layout.seats[o.key]!, body: visualBodyBounds(o.standing.look, actorScale(o))! }))
  const mover = entries.find(e => e.o.agent.id === 'invented-secretary-2')!, door = layout.houses.find(h => h.group === mover.seat.room)!.doors[0]!
  const occupied = entries.filter(e => e !== mover).map(e => translateBody(e.body, e.seat.foot))
  const free = routeIdle(layout, mover.seat.foot, door, occupied, mover.o.key, mover.body, art)
  expect(free.status).toBe('found')
  const { held, totals } = heldBody(mover.body, 20), route = routeIdle(layout, mover.seat.foot, door, occupied, mover.o.key, held, art)
  console.log('HELD-WALK', JSON.stringify({ status: route.status, work: route.work, free: free.work, ...totals }))
  expect(totals.held).toBeGreaterThan(10 * totals.worked)
  expect(route).toMatchObject({ status: 'found', points: free.points, work: { expansions: free.work!.expansions } })
}, 120000)

// Every room of 1 to 14 is walked at two sizes: that of a figure with no saved size (.82), and the largest real
// secretary size (saved 1.6, drawn at .92). Each figure keeps its own look. The widest look, at .92, is 86.5 px wide,
// wider than the 86 px between two desks in a row, so no test asks it to pass there.
it.each(([['the default size', null], ['the largest real size', 1.6]] as const).flatMap(([size, saved]) => Array.from({ length: 14 }, (_, i) => [i + 1, size, saved] as const)))('gives every secretary of an invented room of %i an open walkway to its door at %s', (count, _size, saved) => {
  expect(secretaryWalks(count, saved)).toEqual([])
}, 120000)

// In the room of two the left-hand secretary, standing at its foot at the largest real size, covered 6 x 7 px of a
// body on the middle of the entrance, so the door point stands 24 px lower, on the road just outside. A walk ends
// there and a route-search step above, below, left and right of it, at both sizes, so it does not hold only where
// the search's 16 px lattice happens to line up.
it('lets both secretaries of the room of two end a walk a route-search step round its door point at both sizes', () => {
  const step = IDLE_ROUTE_STEP, round = [[0, 0], [0, -step], [0, step], [-step, 0], [step, 0]] as const
  expect([...secretaryWalks(2, null, round), ...secretaryWalks(2, 1.6, round)]).toEqual([])
}, 120000)

// The road of the room of two is drawn from the corners it had before its door point moved. Drawn through that point
// as well, it took two more rings there, and 10 px of its edge came out a shade lighter.
it('draws no road corner on the moved door point of the room of two', () => {
  const agents = Array.from({ length: 2 }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary' }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let result = build.next(); while (!result.done) result = build.next()
  const layout = result.value, door = layout.houses.find(h => h.occupants.length === 2)!.doors[0]!, corners: string[] = []
  for (const packed of layout.roadDrawing ?? []) for (let at = 0; at < packed.length; at += 1 + 2 * packed[at]!)
    for (let k = 0; k < packed[at]!; k++) { const x = packed[at + 1 + 2 * k]!, y = packed[at + 2 + 2 * k]!; if (Math.abs(y - door.y) < 1 && Math.abs(x - door.x) <= 40) corners.push(`${x},${y}`) }
  expect(corners).toEqual([])
})

// The hall of 13 has its doorway in the middle of its front wall. A worker standing on the door point touches
// no drawn piece and no wall, so a walk can end there. The bench left of the doorway once overlapped that
// body by 2 px.
it('keeps the door point of the hall of 13 clear for a standing worker', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 13 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let result = build.next(); while (!result.done) result = build.next()
  const layout = result.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack }); expect(art).not.toBeNull()
  const worker = model.occupants.find(o => o.agent.id === 'invented-worker-0')!
  const body = visualBodyBounds(worker.standing.look, worker.agent.scale === null ? .82 : standingScale(worker.agent.scale.value))!
  const house = layout.houses.find(h => h.group === layout.seats[worker.key]!.room)!, door = house.doors[0]!
  expect([house.width, house.height]).toEqual([1088, 1112])
  expect([...art, ...layout.obstacles].filter(other => bodiesOverlap(translateBody(body, door), other))).toEqual([])
  expect(routeIdle(layout, door, door, [], worker.key, body, art).status).toBe('found')
}, 30000)
