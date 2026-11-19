// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Layout, Point, Route } from './geometry.ts'
import type { Rect } from './viewport.ts'
import { validBody, sweptBodyHits } from './visual-body.ts'
import { boundsOf, inPolygon } from './village.ts'
import { inPackedRing, packedBounds, packedRings } from './packed-road.ts'
import { VisibleIndex } from './render-plan.ts'
import { searchSteps } from './search.ts'

const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }]
/** Every idle route has one fixed bound: search expansions. It counts work, so a busy
 * machine, which holds the thread without doing work, cannot stop a walk that would finish.
 * The longest walk measured in an invented office of 160, the most the page draws one by
 * one, took 48,971; a search that cannot be found stops here after about 2 s of work. */
export const IDLE_ROUTE_EXPANSIONS = 80000
/** The search's grid step; idle places are chosen on the same lattice. */
export const IDLE_ROUTE_STEP = 16
export interface IdleRouteBounds { expansions?: number; now?: () => number }
/** The depth, from a room's top edge, of the back wall that a room's back row of desks stands against. The wall's
 * picture, the base strip of the wall and the pictures hung on it all end within it. */
export const BACK_WALL_DEPTH = 88
/** A mole at work is drawn behind its desk, on its sitting line, the one place where its body may overlap its own
 * desk. Its walk leaves the desk by two steps, and comes home by the same steps reversed, ending where it was drawn.
 * It steps along the sitting line to just past one end of its desk (`behind`), then straight down beside that end to
 * the height of its foot (`beside`), where it stands clear of the desk and walks on. On the first step its body may
 * overlap its own desk and the things on it. On both steps, until its point is below the desk's bottom edge, it may
 * overlap the room's back wall, which it is drawn against: a wall or picture of no station that lies wholly above its
 * desk's top edge and within the back wall's depth, where no floor is and so no body stands. It never overlaps its
 * stool, a side wall, another station or another mole. */
export interface DeskWay { drawn: Point; behind: Point; beside: Point }
type Tagged = Rect & { station?: string; kind?: string }
const within = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
/** The way round the desk for a mole drawn at `drawn` at its own `station`, the end nearer where it is drawn
 * first. Undefined when it has no station with a desk, so its walk sets out from where it is drawn. Null when
 * neither end of the desk has room for its body: it does not set out, and never crosses its desk instead.
 * `ground` says whether a point is on ground a body may stand on; each step is checked every 2 px. */
export function deskWay(layout: Layout, station: string | undefined, drawn: Point, mover: Rect, blockers: readonly Rect[], ground: (p: Point) => boolean): DeskWay | null | undefined {
  const seat = station === undefined ? undefined : layout.seats[station]
  if (!seat || !(seat.desk.width > 0)) return undefined
  const desk = seat.desk, house = layout.houses.find(one => within(seat.foot, one))
  const back = house ? Math.min(desk.y, house.y + BACK_WALL_DEPTH) : -Infinity
  const wall = (r: Tagged) => r.station === undefined && r.y + r.height <= back
  const own = (r: Tagged) => r.station === station && r.kind !== 'stool'
  // Just clear of the desk's end: the body's right edge at the desk's left edge, or its left edge at the right edge.
  const ends = [Math.floor(desk.x - mover.x - mover.width), Math.ceil(desk.x + desk.width - mover.x)]
  const top = drawn.y + mover.y, bottom = Math.max(drawn.y, seat.foot.y) + mover.y + mover.height
  const near = blockers.filter(r => r.x < ends[1]! + mover.x + mover.width && r.x + r.width > ends[0]! + mover.x && r.y < bottom && r.y + r.height > top)
  const clear = (a: Point, b: Point, may: (r: Tagged) => boolean): boolean => {
    if (!near.every(r => may(r) || !sweptBodyHits(a, b, mover, r))) return false
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2))
    for (let n = 0; n <= steps; n++) if (!ground({ x: a.x + (b.x - a.x) * n / steps, y: a.y + (b.y - a.y) * n / steps })) return false
    return true
  }
  for (const x of ends.sort((a, b) => Math.abs(a - drawn.x) - Math.abs(b - drawn.x))) {
    // Once its point is below the desk's bottom edge, it may overlap no wall at all.
    const behind = { x, y: drawn.y }, beside = { x, y: Math.max(drawn.y, seat.foot.y) }, below = { x, y: Math.min(beside.y, desk.y + desk.height) }
    if (clear(drawn, behind, r => own(r) || wall(r)) && clear(behind, below, wall) && clear(below, beside, () => false)) return { drawn: { ...drawn }, behind, beside }
  }
  return null
}
/** `bound` names the bound that stopped an exhausted route. `milliseconds` is the time of the
 * route's own steps, a measure and not a bound; time suspended between yields is not counted.
 * `fromWalker`, present when the search from the target ran, is how many of the expansions
 * the search from the walker used. */
export interface IdleRouteWork { expansions: number; yields: number; milliseconds: number; bound?: 'expansions'; fromWalker?: number }
export type IdleRoute = Route & { work?: IdleRouteWork }
export function* routeIdleSteps(layout: Layout, start: Point, target: Point, occupied: readonly Rect[], from?: string, mover?: Rect | null, visible?: readonly Rect[], bounds: IdleRouteBounds = {}, station?: string): Generator<void, IdleRoute> {
  const now = bounds.now ?? (() => performance.now()), meter: { expansions: number; fromWalker?: number } = { expansions: 0 }
  const steps = idleRouteWork(layout, start, target, occupied, mover, visible, bounds.expansions ?? IDLE_ROUTE_EXPANSIONS, meter, station)
  let yields = 0, milliseconds = 0
  for (;;) {
    const began = now(), next = steps.next()
    milliseconds += now() - began
    if (next.done) return { ...next.value, work: { expansions: meter.expansions, yields, milliseconds, ...(next.value.status === 'exhausted' ? { bound: 'expansions' as const } : {}), ...(meter.fromWalker === undefined ? {} : { fromWalker: meter.fromWalker }) } }
    yields++; yield
  }
}
/** The worker declines unknown bounds. Bounding boxes conservatively contain
 * the visible pixels; swept collision covers the whole segment continuously. */
function* idleRouteWork(layout: Layout, start: Point, target: Point, occupied: readonly Rect[], mover: Rect | null | undefined, visible: readonly Rect[] | undefined, limit: number, meter: { expansions: number; fromWalker?: number }, station: string | undefined): Generator<void, Route> {
  if (visible === undefined && layout.pieces.some(piece => piece.layer !== 'floor')) return { status: 'unavailable', points: [] }
  const artwork = visible ?? []
  if (!validBody(mover) || !occupied.every(validBody) || !artwork.every(validBody) || ![start.x, start.y, target.x, target.y].every(Number.isFinite) || occupied.length > 10000 || layout.road.faults.length) return { status: 'unavailable', points: [] }
  // A seat is furniture too: no route passes through a stool, the mover's own as well.
  const blockers: Rect[] = [...occupied, ...artwork, ...layout.obstacles]
  if (!blockers.every(validBody)) return { status: 'unavailable', points: [] }
  const indexed = yield* VisibleIndex.build((function* () { for (const value of blockers) yield { value, rect: value } })())
  const houses = yield* VisibleIndex.build((function* () { for (const value of layout.houses) yield { value, rect: value } })())
  const ground = yield* VisibleIndex.build((function* () { for (const value of layout.road.rings) yield { value, rect: boundsOf(value) } })())
  const packed = yield* VisibleIndex.build((function* () { for (const value of packedRings(layout.roadDrawing ?? [])) yield { value, rect: packedBounds(value) } })())
  const clearGround = (p: Point): boolean => {
    if (p.x + mover.x < layout.bounds.x || p.y + mover.y < layout.bounds.y || p.x + mover.x + mover.width > layout.bounds.x + layout.bounds.width || p.y + mover.y + mover.height > layout.bounds.y + layout.bounds.height) return false
    const camera = { left: p.x, top: p.y, width: .001, height: .001 }, square = layout.square
    return p.x >= square.x && p.x <= square.x + square.width && p.y >= square.y && p.y <= square.y + square.height ||
      houses.query(camera).some(h => h.walkable.some(poly => inPolygon(h.walkableOrigin ? { x: p.x - h.walkableOrigin.x, y: p.y - h.walkableOrigin.y } : p, poly))) ||
      ground.query(camera).some(r => inPolygon(p, r)) || packed.query(camera).some(r => inPackedRing(p, r))
  }
  const segment = (a: Point, b: Point): boolean => {
    const box = { left: Math.min(a.x, b.x) + mover.x, top: Math.min(a.y, b.y) + mover.y, width: Math.abs(b.x - a.x) + mover.width, height: Math.abs(b.y - a.y) + mover.height }
    if (indexed.query(box).some(other => sweptBodyHits(a, b, mover, other))) return false
    const dx = b.x - a.x, dy = b.y - a.y, steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2))
    for (let n = 0; n <= steps; n++) if (!clearGround({ x: a.x + dx * n / steps, y: a.y + dy * n / steps })) return false
    return true
  }
  // A mole at work goes round its desk first, and the search sets out from beside the desk's end. With no way
  // round, there is no walk.
  const way = deskWay(layout, station, start, mover, blockers, clearGround)
  if (way === null) return { status: 'no-path', points: [] }
  if (way) start = way.beside
  const lead = (points: Point[]): Point[] => way ? [way.drawn, way.behind, ...points] : points
  if (!segment(start, start) || !segment(target, target)) return { status: 'no-path', points: [] }
  // A direct route is useful on a large open scene. Check short segments with
  // the same swept-body and ground rules as the search, yielding regularly so
  // the worker can cancel it. Bound the shortcut independently of scene size.
  const distance = Math.hypot(target.x - start.x, target.y - start.y), directSteps = Math.ceil(distance / 16)
  if (directSteps > 0 && directSteps <= 4096) {
    let previous = start, clear = true
    for (let i = 1; i <= directSteps; i++) {
      const next = i === directSteps ? target : { x: start.x + (target.x - start.x) * i / directSteps, y: start.y + (target.y - start.y) * i / directSteps }
      if (!segment(previous, next)) { clear = false; break }
      previous = next
      if (i % 8 === 0) yield
    }
    if (clear) return { status: 'found', points: lead([start, target]) }
  }
  const result = yield* searchSteps(start, p => Math.hypot(p.x - target.x, p.y - target.y) <= 20 && segment(p, target), p => segment(p, p) ? 1 : null,
    p => Math.hypot(p.x - target.x, p.y - target.y) / IDLE_ROUTE_STEP, IDLE_ROUTE_STEP, limit, directions, segment, meter)
  if (result === 'ran out') return { status: 'exhausted', points: [] }
  if (!result) {
    // The lattice is laid from the search's own start, so a walk the forward search misses can
    // lie on the lattice laid from the target. Search once from there, with no more expansions
    // than the search from the walker used and no more than are left. If it runs out at its own
    // bound, the walker's lattice has no walk, and the answer is no-path as before.
    const used = meter.fromWalker = meter.expansions, left = limit - used
    const back = yield* searchSteps(target, p => Math.hypot(p.x - start.x, p.y - start.y) <= 20 && segment(p, start), p => segment(p, p) ? 1 : null,
      p => Math.hypot(p.x - start.x, p.y - start.y) / IDLE_ROUTE_STEP, IDLE_ROUTE_STEP, Math.min(used, left), directions, segment, meter)
    if (back === 'ran out') return { status: left <= used ? 'exhausted' : 'no-path', points: [] }
    if (!back) return { status: 'no-path', points: [] }
    back.reverse()
    if (back[0]!.x !== start.x || back[0]!.y !== start.y) back.unshift(start)
    return { status: 'found', points: lead(back) }
  }
  if (result.at(-1)!.x !== target.x || result.at(-1)!.y !== target.y) result.push(target)
  return { status: 'found', points: lead(result) }
}
export function routeIdle(layout: Layout, start: Point, target: Point, occupied: readonly Rect[], from?: string, mover?: Rect | null, visible?: readonly Rect[], bounds?: IdleRouteBounds, station?: string): IdleRoute {
  const steps = routeIdleSteps(layout, start, target, occupied, from, mover, visible, bounds, station)
  for (;;) { const next = steps.next(); if (next.done) return next.value }
}
