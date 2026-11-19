// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeIdleSteps, type Layout, type Point, type Route } from '../src/geometry.ts'
import { bodiesOverlap, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingScale } from '../src/appearance.ts'
import { chooseIdlePlaces, occupiedBodies, PAPER_MEETING_SPACING } from '../src/walks.ts'
import { actorRect } from '../src/layout-index.ts'
import type { Rect } from '../src/viewport.ts'
import type { RosterView } from '../src/contracts.ts'
import * as bundled from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

// Independent continuous collision check: intersect the open time intervals
// during which the moving rectangle overlaps on each axis.
function hits(a: Point, b: Point, body: Rect, obstacle: Rect): boolean {
  let begin = 0, end = 1
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height'
    const low = obstacle[axis] - body[axis] - body[size]
    const high = obstacle[axis] + obstacle[size] - body[axis]
    const delta = b[axis] - a[axis]
    if (!delta) { if (a[axis] <= low || a[axis] >= high) return false; continue }
    const p = (low - a[axis]) / delta, q = (high - a[axis]) / delta
    begin = Math.max(begin, Math.min(p, q)); end = Math.min(end, Math.max(p, q))
    if (begin >= end) return false
  }
  return true
}

// The production outing rule lives in src/idle-places.ts. Before that file
// existed, the page offered the square's play places; the red run measures that.
const production: any = await import('../src/idle-places.ts').catch(() => null)
const NEAR = 640
// An invented camera: production selects only agents that are visible, so the
// view holds a 1440 by 1000 window around every selected foot.
const camera = (feet: Point[]) => { const x = Math.min(...feet.map(p => p.x)) - 720, y = Math.min(...feet.map(p => p.y)) - 500; return { x, y, width: Math.max(...feet.map(p => p.x)) + 720 - x, height: Math.max(...feet.map(p => p.y)) + 500 - y } }
const onCamera = (view: Rect, p: Point) => { const r = actorRect(p); return r.x < view.x + view.width && r.x + r.width > view.x && r.y < view.y + view.height && r.y + r.height > view.y }
const length = (points: Point[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0)

type Entry = { key: string; id: string; foot: Point; body: Rect }
const offices = new Map<number, { layout: Layout; artwork: Rect[]; entries: Entry[] }>()
function office(size: number) {
  let kept = offices.get(size)
  if (kept) return kept
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: size - 1 }, (_, i) => agent(`invented-worker-${String(i).padStart(4, '0')}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let n = build.next(); while (!n.done) n = build.next(); const layout = n.value
  const pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const artwork: Rect[] = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack })
  expect(artwork).not.toBeNull()
  const entries = model.occupants.map(o => ({ key: o.key, id: o.agent.id, foot: layout.seats[o.key]!.foot, body: visualBodyBounds(o.standing.look, o.agent.scale === null ? .82 : standingScale(o.agent.scale.value))! }))
  kept = { layout, artwork, entries }; offices.set(size, kept)
  return kept
}

function walkFrom(layout: Layout, start: Point, target: Point, occupied: Rect[], key: string, body: Rect, artwork: Rect[]) {
  const began = performance.now(), work = routeIdleSteps(layout, start, target, occupied, key, body, artwork)
  let yields = 0, step = work.next()
  while (!step.done) { yields++; step = work.next() }
  return { route: step.value as Route & { work?: { expansions: number; yields: number; milliseconds: number } }, yields, elapsedMs: performance.now() - began }
}

/** One outing as production plans it: places from the production rule, then
 * every walker's route found before anybody moves, the second planned with the
 * first standing at its place. */
function outing(size: number, ids: string[], label: string) {
  const { layout, artwork, entries } = office(size)
  const selected = ids.map(id => entries.find(e => e.id === id)!)
  const others = entries.filter(e => !ids.includes(e.id)).map(e => translateBody(e.body, e.foot))
  const furniture = [...artwork, ...layout.obstacles], view = camera(selected.map(e => e.foot))
  const visible = (p: Point) => onCamera(view, p)
  const choosing = performance.now()
  const chosen: { walkers: string[]; places: Point[] } | null = production
    ? production.chooseIdleOuting(layout, selected.map(e => ({ id: e.key, foot: e.foot, body: e.body })), [...others, ...furniture], visible, 0)
    : (() => { const places = chooseIdlePlaces((layout.places?.play ?? []).flatMap(p => [p, { x: p.x + PAPER_MEETING_SPACING, y: p.y }]), [...others, ...furniture], visible, selected.map(e => e.body), 0, PAPER_MEETING_SPACING, selected.map(e => e.foot)); return places.length === selected.length ? { walkers: selected.map(e => e.key), places } : null })()
  const chooseMs = +(performance.now() - choosing).toFixed(3), failures: string[] = []
  console.log('IDLE-CHOICE', JSON.stringify({ size, label, ids, chooseMs, walkers: chosen?.walkers.length ?? 0 }))
  if (!chosen || !chosen.walkers.length || chosen.walkers.length !== chosen.places.length) {
    console.log('IDLE-OUTING', JSON.stringify({ size, label, ids, walkers: [], status: 'no-place' }))
    return { failures: [`${label}: no place`], chosen }
  }
  const walkers = chosen.walkers.map(key => entries.find(e => e.key === key)!)
  const standing: { id: string; point: Point }[] = []
  const rows = entries.map(e => ({ id: e.key, home: e.foot, current: e.foot, body: e.body }))
  for (let i = 0; i < walkers.length; i++) {
    const walker = walkers[i]!, place = chosen.places[i]!
    if (!ids.includes(walker.id)) failures.push(`${label}: ${walker.id} was not selected`)
    // Near, visible and clear, judged here rather than by the production rule.
    const straight = Math.hypot(place.x - walker.foot.x, place.y - walker.foot.y)
    if (straight > NEAR) failures.push(`${label}: ${walker.id} place is ${Math.round(straight)} px away`)
    if (!visible(place)) failures.push(`${label}: ${walker.id} place is off camera`)
    const here = translateBody(walker.body, place)
    const physical = [...entries.filter(e => e !== walker && !standing.some(s => s.id === e.key)).map(e => translateBody(e.body, e.foot)), ...standing.map(s => translateBody(entries.find(e => e.key === s.id)!.body, s.point)), ...furniture]
    if (physical.some(b => bodiesOverlap(here, b))) failures.push(`${label}: ${walker.id} place overlaps a body or furniture`)
    const occupied = (occupiedBodies as any)(rows, walker.key, standing) as Rect[]
    const { route, yields, elapsedMs } = walkFrom(layout, walker.foot, place, occupied, walker.key, walker.body, artwork)
    console.log('IDLE-OUTING', JSON.stringify({ size, label, ids, walker: walker.id, order: i, foot: walker.foot, place, straight: Math.round(straight), status: route.status, points: route.points.length, routeLength: Math.round(length(route.points)), elapsedMs: +elapsedMs.toFixed(3), yieldsCounted: yields, work: route.work ?? 'not exposed' }))
    if (route.status !== 'found') { failures.push(`${label}: ${walker.id} route ${route.status}`); break }
    if (!route.work || ![route.work.expansions, route.work.yields, route.work.milliseconds].every(Number.isFinite)) failures.push(`${label}: ${walker.id} route does not report its work`)
    // Every segment, out and (reversed) back, against everything physically
    // there while this walker moves: the mover's own stool included.
    for (let s = 1; s < route.points.length; s++) for (const blocker of physical) if (hits(route.points[s - 1]!, route.points[s]!, walker.body, blocker)) { failures.push(`${label}: ${walker.id} segment ${s} hits ${JSON.stringify(blocker)}`); break }
    standing.push({ id: walker.key, point: place })
  }
  return { failures, chosen }
}

const sizes = [2, 5, 9, 100, 1000]
const sampled = (size: number) => {
  const workers = size - 1, picks = [...new Set([0, Math.floor((workers - 1) / 4), Math.floor((workers - 1) / 2), Math.floor((workers - 1) * 3 / 4), workers - 1])].filter(i => i >= 0)
  return [{ id: 'invented-secretary', index: 0 }, ...picks.map(i => ({ id: `invented-worker-${String(i).padStart(4, '0')}`, index: i + 1 }))]
}
const order = (size: number) => ['invented-secretary', ...Array.from({ length: size - 1 }, (_, i) => `invented-worker-${String(i).padStart(4, '0')}`)]

for (const size of sizes) for (const { id } of sampled(size)) it(`gives ${id} alone a near, visible, safe idle route in the invented ${size}-person real layout`, () => {
  const { failures, chosen } = outing(size, [id], `solo ${id}`)
  expect(failures).toEqual([])
  expect(chosen?.walkers.length).toBe(1)
}, 120000)

// Production selects consecutive idle occupants as a pair.
for (const size of sizes) for (const { id, index } of sampled(size)) it(`plans both routes of ${id}'s pair before anyone moves in the invented ${size}-person real layout`, () => {
  const all = order(size), partner = all[index + 1] ?? all[index - 1]!
  const ids = index + 1 < all.length ? [id, partner] : [partner, id]
  const { layout, entries } = office(size)
  const { failures, chosen } = outing(size, ids, `pair ${ids.join('+')}`)
  expect(failures).toEqual([])
  // Two occupants of one house, or two on open ground, meet rather than walk alone.
  const feet = ids.map(one => entries.find(e => e.id === one)!.foot)
  const houseOf = (p: Point) => layout.houses.findIndex(h => p.x >= h.x && p.x <= h.x + h.width && p.y >= h.y && p.y <= h.y + h.height)
  if (houseOf(feet[0]!) === houseOf(feet[1]!) && Math.hypot(feet[0]!.x - feet[1]!.x, feet[0]!.y - feet[1]!.y) <= NEAR) expect(chosen?.walkers.length).toBe(2)
}, 120000)

// The view is cut just short of the place chosen with the whole view, so a rule
// that did not check visibility would choose that place again. The secretary and
// the 2-person studio worker have no place even with the whole view, so the
// sampled workers of the larger layouts are used.
for (const size of sizes.filter(size => size > 2)) for (const { id } of sampled(size).filter(one => one.id !== 'invented-secretary')) it(`chooses no idle place off camera for ${id} in the invented ${size}-person real layout`, () => {
  expect(production).not.toBeNull()
  const { layout, artwork, entries } = office(size), walker = entries.find(e => e.id === id)!
  const blockers = [...entries.filter(e => e !== walker).map(e => translateBody(e.body, e.foot)), ...artwork, ...layout.obstacles]
  const choose = (view: Rect) => production.chooseIdleOuting(layout, [{ id: walker.key, foot: walker.foot, body: walker.body }], blockers, (p: Point) => onCamera(view, p), 0) as { walkers: string[]; places: Point[] } | null
  const wide = camera([walker.foot]), first = choose(wide)
  expect(first).not.toBeNull()
  const p = first!.places[0]!, f = walker.foot, r = actorRect(p)
  const cut = p.y > f.y ? { ...wide, height: r.y - wide.y } : p.y < f.y ? { ...wide, y: r.y + r.height, height: wide.y + wide.height - r.y - r.height }
    : p.x > f.x ? { ...wide, width: r.x - wide.x } : { ...wide, x: r.x + r.width, width: wide.x + wide.width - r.x - r.width }
  expect(onCamera(cut, f)).toBe(true)
  expect(onCamera(cut, p)).toBe(false)
  const second = choose(cut)
  console.log('IDLE-CUT', JSON.stringify({ size, id, foot: f, wholeView: p, cutView: cut, chosen: second?.places ?? 'no place' }))
  expect(second === null || second.places.every(place => onCamera(cut, place))).toBe(true)
}, 120000)
