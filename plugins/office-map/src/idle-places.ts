// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Layout, Point } from './geometry.ts'
import type { Rect } from './viewport.ts'
import type { House } from './village.ts'
import { boundsOf, inPolygon } from './village.ts'
import { inPackedRing, packedBounds, packedRings } from './packed-road.ts'
import { chooseIdlePlaces, IDLE_WALKING_CAP, PAPER_MEETING_SPACING } from './walks.ts'
import { bodiesOverlap, translateBody } from './visual-body.ts'
import { deskWay, IDLE_ROUTE_STEP } from './idle-route.ts'

/** Idle places are worked out from the layout, near the walker. A walker may
 * stand anywhere on its own house's walkable floor, or go out through one of
 * its own house's doors onto open ground: the square, the road and the paths.
 * It never goes into another house. A walker already on open ground stays on
 * open ground. The estimated walk is the straight line, through the door when
 * the walker leaves its house, so the real route is never shorter.
 *
 * A place must also be reachable on the route search's own lattice: a flood
 * from the walker's foot, in the search's eight directions, over points where
 * the body stands on accepted ground and overlaps no blocker. A straight step
 * sweeps no more than the bodies at its two ends, as a body is wider and taller
 * than a step, and a diagonal is taken only between open straight steps. Ground
 * is checked at the points; the route search still checks it along each step. */
export const IDLE_REACH = 640
export const IDLE_LEAST_WALK = 96
const SPAN = Math.ceil(IDLE_REACH / IDLE_ROUTE_STEP), SIDE = 2 * SPAN + 1
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const

const within = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
const touches = (a: Rect, b: Rect) => a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
const onFloor = (house: House, p: Point) => house.walkable.some(poly => inPolygon(house.walkableOrigin ? { x: p.x - house.walkableOrigin.x, y: p.y - house.walkableOrigin.y } : p, poly))

/** The accepted ground near a box: a house's walkable floor, and the open ground of the square, the road and the paths. */
function groundNear(layout: Layout, box: Rect): { house: (p: Point) => House | null; open: (p: Point) => boolean } {
  const houses = layout.houses.filter(house => touches(house, box))
  const rings = layout.road.rings.filter(ring => touches(boundsOf(ring), box))
  const packed = [...packedRings(layout.roadDrawing ?? [])].filter(ring => touches(packedBounds(ring), box))
  return {
    house: p => houses.find(one => within(p, one) && onFloor(one, p)) ?? null,
    open: p => within(p, layout.square) || rings.some(ring => inPolygon(p, ring)) || packed.some(ring => inPackedRing(p, ring)),
  }
}

/** A window of the route search's lattice: cell (i, j) is the point (x + i·step, y + j·step), and
 * ground marks the cells on accepted ground, as groundNear finds it at each point. It is worked out a
 * row at a time, so a window over the whole layout costs little more than its cells. */
interface Lattice { x: number; y: number; cols: number; rows: number; ground: Uint8Array }
function lattice(layout: Layout, x: number, y: number, cols: number, rows: number): Lattice {
  const ground = new Uint8Array(cols * rows), box = { x, y, width: (cols - 1) * IDLE_ROUTE_STEP, height: (rows - 1) * IDLE_ROUTE_STEP }, square = layout.square
  // Every outline groundNear tests near the window: its corners, the point a house's floor is drawn from, and the house a point must be in.
  const shapes: { xs: number[]; ys: number[]; origin?: Point; house?: House }[] = []
  for (const house of layout.houses) if (touches(house, box)) for (const poly of house.walkable) shapes.push({ xs: poly.map(q => q.x), ys: poly.map(q => q.y), house, ...house.walkableOrigin ? { origin: house.walkableOrigin } : {} })
  for (const ring of layout.road.rings) if (touches(boundsOf(ring), box)) shapes.push({ xs: ring.map(q => q.x), ys: ring.map(q => q.y) })
  for (const ring of packedRings(layout.roadDrawing ?? [])) if (touches(packedBounds(ring), box)) {
    const xs: number[] = [], ys: number[] = []
    for (let i = 0; i < ring[0]!; i++) { xs.push(ring[1 + i * 2]!); ys.push(ring[2 + i * 2]!) }
    shapes.push({ xs, ys })
  }
  const crossings: number[] = []
  for (let j = 0; j < rows; j++) {
    const py = y + j * IDLE_ROUTE_STEP, row = j * cols
    if (py >= square.y && py <= square.y + square.height) for (let i = 0; i < cols; i++) { const px = x + i * IDLE_ROUTE_STEP; if (px >= square.x && px <= square.x + square.width) ground[row + i] = 1 }
    for (const { xs, ys, origin, house } of shapes) {
      if (house && !(py >= house.y && py <= house.y + house.height)) continue
      // The row crosses an edge where inPolygon counts a crossing, with the same sum, and a point is
      // inside when an odd number of crossings lie to its right: as their count is even, when an odd
      // number lie at or left of it.
      const qy = origin ? py - origin.y : py
      crossings.length = 0
      for (let a = 0, b = xs.length - 1; a < xs.length; b = a++) if ((ys[a]! > qy) !== (ys[b]! > qy)) crossings.push((xs[b]! - xs[a]!) * (qy - ys[a]!) / (ys[b]! - ys[a]!) + xs[a]!)
      crossings.sort((u, v) => u - v)
      for (let i = 0, k = 0; i < cols && crossings.length; i++) {
        const px = x + i * IDLE_ROUTE_STEP, qx = origin ? px - origin.x : px
        while (k < crossings.length && crossings[k]! <= qx) k++
        if (k % 2 && (!house || px >= house.x && px <= house.x + house.width)) ground[row + i] = 1
      }
    }
  }
  return { x, y, cols, rows, ground }
}
/** The lattice laid through a point, over a box. */
function laidOver(layout: Layout, box: Rect, through: Point): Lattice {
  const i0 = Math.floor((box.x - through.x) / IDLE_ROUTE_STEP), j0 = Math.floor((box.y - through.y) / IDLE_ROUTE_STEP)
  const i1 = Math.ceil((box.x + box.width - through.x) / IDLE_ROUTE_STEP), j1 = Math.ceil((box.y + box.height - through.y) / IDLE_ROUTE_STEP)
  return lattice(layout, through.x + i0 * IDLE_ROUTE_STEP, through.y + j0 * IDLE_ROUTE_STEP, i1 - i0 + 1, j1 - j0 + 1)
}
/** True when a body stays inside the layout. */
const insideBounds = (layout: Layout, r: Rect) => r.x >= layout.bounds.x && r.y >= layout.bounds.y && r.x + r.width <= layout.bounds.x + layout.bounds.width && r.y + r.height <= layout.bounds.y + layout.bounds.height
/** The cell nearest a point, or -1 outside the window. */
function cellAt(at: Lattice, p: Point): number {
  const i = Math.round((p.x - at.x) / IDLE_ROUTE_STEP), j = Math.round((p.y - at.y) / IDLE_ROUTE_STEP)
  return i >= 0 && j >= 0 && i < at.cols && j < at.rows ? j * at.cols + i : -1
}

/** Fixed by the layout for one foot: the ground on the lattice around it, and the estimated walk to any point. */
interface Field { foot: Point; at: Lattice; walk: (p: Point) => number }
const fields = new WeakMap<Layout, Map<string, Field>>()
function field(layout: Layout, foot: Point): Field {
  const key = `${foot.x},${foot.y}`, cache = fields.get(layout) ?? new Map<string, Field>()
  fields.set(layout, cache)
  const known = cache.get(key)
  if (known) return known
  const box = { x: foot.x - IDLE_REACH - PAPER_MEETING_SPACING, y: foot.y - IDLE_REACH - IDLE_ROUTE_STEP, width: 2 * (IDLE_REACH + PAPER_MEETING_SPACING), height: 2 * (IDLE_REACH + IDLE_ROUTE_STEP) }
  const { house, open } = groundNear(layout, box), home = house(foot), outside = !home && open(foot)
  const walk = (p: Point): number => {
    const at = house(p)
    if (home && at === home) return Math.hypot(p.x - foot.x, p.y - foot.y)
    if (at || (!home && !outside) || !open(p)) return Infinity
    if (outside) return Math.hypot(p.x - foot.x, p.y - foot.y)
    return Math.min(...home!.doors.map(door => Math.hypot(door.x - foot.x, door.y - foot.y) + Math.hypot(p.x - door.x, p.y - door.y)))
  }
  if (cache.size >= 16) cache.delete(cache.keys().next().value!)
  const made = { foot, at: lattice(layout, foot.x - SPAN * IDLE_ROUTE_STEP, foot.y - SPAN * IDLE_ROUTE_STEP, SIDE, SIDE), walk }
  cache.set(key, made)
  return made
}

/** Lattice cells the body can reach from the seed cells without overlapping a blocker or leaving the layout. */
function flood(layout: Layout, at: Lattice, body: Rect, blockers: readonly Rect[], seeds: readonly number[]): Uint8Array {
  const { cols, rows } = at, open = at.ground.slice()
  const span = (low: number, high: number, origin: number, count: number) => [Math.max(0, Math.floor((low - origin) / IDLE_ROUTE_STEP) + 1), Math.min(count - 1, Math.ceil((high - origin) / IDLE_ROUTE_STEP) - 1)] as const
  // A body at foot f overlaps b exactly when b.x - body.x - body.width < f.x < b.x + b.width - body.x, and likewise for y.
  for (const b of blockers) {
    const [i0, i1] = span(b.x - body.x - body.width, b.x + b.width - body.x, at.x, cols), [j0, j1] = span(b.y - body.y - body.height, b.y + b.height - body.y, at.y, rows)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) open[j * cols + i] = 0
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (!insideBounds(layout, translateBody(body, { x: at.x + i * IDLE_ROUTE_STEP, y: at.y + j * IDLE_ROUTE_STEP }))) open[j * cols + i] = 0
  const reached = new Uint8Array(cols * rows), queue = seeds.filter(k => k >= 0 && open[k])
  for (const k of queue) reached[k] = 1
  for (let n = 0; n < queue.length; n++) {
    const k = queue[n]!, i = k % cols, j = (k - i) / cols
    for (const [di, dj] of STEPS) {
      const a = i + di, b = j + dj, next = b * cols + a
      if (a < 0 || b < 0 || a >= cols || b >= rows || reached[next] || !open[next]) continue
      // A body swept along a diagonal stays inside the four bodies at its corners, so the step is
      // taken only where both straight steps beside it are open; otherwise it can clip a corner.
      if (di && dj && (!open[j * cols + a] || !open[b * cols + i])) continue
      reached[next] = 1; queue.push(next)
    }
  }
  return reached
}
/** Lattice points the body can reach from the foot. */
const reach = (layout: Layout, at: Field, body: Rect, blockers: readonly Rect[]) => flood(layout, at.at, body, blockers, [cellAt(at.at, at.foot)])

/** `station` names the station a walker is drawn at work at, so its walk leaves by the way round that desk. */
export interface IdleWalker { id: string; foot: Point; body: Rect; station?: string }
/** Where the walker's route sets out from, as the route search finds it, with these blockers: beside the end of its
 * desk for a walker at work, or where it is drawn. Null when its desk has no way round, so it does not set out. */
function setsOut(layout: Layout, walker: IdleWalker, blockers: readonly Rect[]): Point | null {
  const near = groundNear(layout, { x: walker.foot.x - IDLE_REACH, y: walker.foot.y - IDLE_REACH, width: 2 * IDLE_REACH, height: 2 * IDLE_REACH })
  const way = deskWay(layout, walker.station, walker.foot, walker.body, blockers, p => (!!near.house(p) || near.open(p)) && insideBounds(layout, translateBody(walker.body, p)))
  return way === undefined ? walker.foot : way && way.beside
}
/** The reason this walker does not set out, when it does not. */
export const NO_WAY_ROUND = 'no way round the desk'
/** The selected walkers that do not set out, each with its reason, found with the others at home. */
export function idleStays(layout: Layout, selected: readonly IdleWalker[], blockers: readonly Rect[]): Record<string, string> {
  return Object.fromEntries(selected.flatMap(w => setsOut(layout, w, [...blockers, ...atHome(selected, w)]) ? [] : [[w.id, NO_WAY_ROUND]]))
}
const atHome = (walkers: readonly IdleWalker[], walker: IdleWalker) => walkers.filter(o => o !== walker).map(o => translateBody(o.body, o.foot))

/** A contact walker stands within this distance of its partner's seat. */
export const CONTACT_REACH = 160
/** A point this far below a door is outside it, on the open ground the doors open onto. */
const OUTSIDE_DOOR = 48
/** Where a contact walker stands to talk: the seat's talk point when the walker's body is clear there
 * and can reach it, otherwise the nearest reachable point within CONTACT_REACH of the seat's foot, in
 * the seat's house or on the ground just outside its doors when the seat is in a house. Points are tried
 * on the lattice the route search lays from where the walker sets out, flooded from there over the whole
 * layout, so a walk the flood finds is one the search can walk, and ground that drawn pieces or figures
 * shut off from the walker is never offered. The blockers hold every body but the walker's, the
 * partner's too, where each is drawn. Null means the flood reaches no point beside the partner, or the
 * walker's desk has no way round, so the page does not offer the walk. */
export function contactPlace(layout: Layout, walker: IdleWalker, seat: { foot: Point; talk: Point }, blockers: readonly Rect[]): Point | null {
  const house = layout.houses.find(one => within(seat.foot, one))
  const beside = house && { x: house.x, y: house.y, width: house.width, height: house.height + OUTSIDE_DOOR + IDLE_ROUTE_STEP }
  const from = setsOut(layout, walker, blockers)
  if (!from) return null
  const at = laidOver(layout, layout.bounds, from), reached = flood(layout, at, walker.body, blockers, [cellAt(at, from)])
  let best: { p: Point; talk: number; foot: number } | null = null
  for (let k = 0; k < reached.length; k++) {
    if (!reached[k]) continue
    const i = k % at.cols, p = { x: at.x + i * IDLE_ROUTE_STEP, y: at.y + (k - i) / at.cols * IDLE_ROUTE_STEP }
    const foot = Math.hypot(p.x - seat.foot.x, p.y - seat.foot.y), talk = Math.hypot(p.x - seat.talk.x, p.y - seat.talk.y)
    if (foot > CONTACT_REACH || beside && !within(p, beside)) continue
    if (!best || talk < best.talk || talk === best.talk && (foot < best.foot || foot === best.foot && (p.y < best.p.y || p.y === best.p.y && p.x < best.p.x))) best = { p, talk, foot }
  }
  if (!best) return null
  // The search ends at the talk point itself from a lattice point within 20 px when the straight step
  // there is clear. A step that short sweeps no further than the box around both bodies.
  const a = translateBody(walker.body, best.p), b = translateBody(walker.body, seat.talk)
  const swept = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x), height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) }
  const near = groundNear(layout, swept), ground = (p: Point) => !!near.house(p) || near.open(p)
  return best.talk <= 20 && ground(seat.talk) && insideBounds(layout, b) && blockers.every(other => !bodiesOverlap(swept, other)) ? { ...seat.talk } : best.p
}

/** Candidate places 32 px apart, nearest walk first. With more than one walker each
 * later one's place is the one before it moved right by the meeting spacing, and every
 * walk must be within reach and reachable. Each walker's flood treats the others at home. */
export function idlePlaceCandidates(layout: Layout, walkers: readonly IdleWalker[], blockers: readonly Rect[]): Point[] {
  const kept = walkers.map(w => [...blockers, ...atHome(walkers, w)]), from = walkers.map((w, n) => setsOut(layout, w, kept[n]!))
  if (!from.every((p): p is Point => !!p)) return []
  const at = from.map(p => field(layout, p))
  const reached = walkers.map((w, n) => reach(layout, at[n]!, w.body, kept[n]!))
  const reachable = (n: number, p: Point) => { const k = cellAt(at[n]!.at, p); return k >= 0 && reached[n]![k] === 1 }
  const found: { p: Point; cost: number }[] = [], first = from[0]!
  for (let j = 0; j < SIDE; j += 2) for (let i = 0; i < SIDE; i += 2) {
    if (!reached[0]![j * SIDE + i]) continue
    const p = { x: first.x + (i - SPAN) * IDLE_ROUTE_STEP, y: first.y + (j - SPAN) * IDLE_ROUTE_STEP }
    let worst = 0
    for (let n = 0; n < walkers.length && worst <= IDLE_REACH; n++) {
      const q = { x: p.x + n * PAPER_MEETING_SPACING, y: p.y }, cost = at[n]!.walk(q)
      worst = cost >= IDLE_LEAST_WALK && reachable(n, q) ? Math.max(worst, cost) : Infinity
    }
    if (worst <= IDLE_REACH) found.push({ p, cost: worst })
  }
  return found.sort((a, b) => a.cost - b.cost || a.p.y - b.p.y || a.p.x - b.p.x).map(one => one.p)
}

/** Each later walker's route is planned with the walkers before it already standing at their places,
 * their homes still kept, and the walkers after it at home, so its place must be reachable with
 * those bodies where they are. */
function laterReach(layout: Layout, group: readonly IdleWalker[], staying: readonly Rect[], places: readonly Point[]): boolean {
  return group.every((walker, n) => {
    if (n === 0) return true
    const before = group.slice(0, n).flatMap((one, i) => [translateBody(one.body, one.foot), translateBody(one.body, places[i]!)])
    const after = group.slice(n + 1).map(one => translateBody(one.body, one.foot))
    const kept = [...staying, ...before, ...after], from = setsOut(layout, walker, kept)
    if (!from) return false
    const at = field(layout, from), reached = reach(layout, at, walker.body, kept), k = cellAt(at.at, places[n]!)
    return k >= 0 && reached[k] === 1
  })
}

/** A facility of a room where idle moles meet: its round table, a rug on its floor, or one of its places in
 * `layout.facilities`, such as a reading place. `area` is the piece's drawn box, or a small box round the place. */
export interface MeetingFacility { room: string; name: string; kind: 'round table' | 'rug' | 'place'; area: Rect }
const ROUND_TABLES = new Set(['tea-table']), RUGS = new Set(['A27', 'A28', 'B28'])
/** How near a place's foot a mole stands to be at that place, and how far beside a round table a lone mole may stand. */
const AT_PLACE = 48, BESIDE_TABLE = 96
/** How far below a round table's foot a group still stands at it. A pair stands 160 px apart, wider than the table,
 * and each body is about 60 px tall, so two flanking it stand a body's height in front of its foot. */
const IN_FRONT_OF_TABLE = 96
/** The facilities of a room, in the layout's order. A kind the room holds more than once is numbered. */
export function roomFacilities(layout: Layout, room: string): MeetingFacility[] {
  const found: Omit<MeetingFacility, 'name'>[] = []
  for (const piece of layout.pieces) if (piece.group === room && (ROUND_TABLES.has(piece.sprite) || RUGS.has(piece.sprite) && piece.layer === 'floor'))
    found.push({ room, kind: ROUND_TABLES.has(piece.sprite) ? 'round table' : 'rug', area: { x: piece.x, y: piece.y, width: piece.width, height: piece.height } })
  const places = (layout.facilities ?? []).filter(place => place.room === room)
  const named = (kind: string, n: number, of: number) => of > 1 ? `${kind} ${n + 1}` : kind
  const tables = found.filter(one => one.kind === 'round table'), rugs = found.filter(one => one.kind === 'rug')
  return [
    ...tables.map((one, n) => ({ ...one, name: named('round table', n, tables.length) })),
    ...rugs.map((one, n) => ({ ...one, name: named('rug', n, rugs.length) })),
    ...places.map(place => ({ room, kind: 'place' as const, name: `${place.activity} place ${place.index + 1}`, area: { x: place.foot.x - AT_PLACE / 2, y: place.foot.y - AT_PLACE / 2, width: AT_PLACE, height: AT_PLACE } })),
  ]
}
/** True when a row of feet meets at a facility. A group stands on a rug with the middle of the row over it, or at
 * a round table with the middle of the row at the table, so the two either side face each other across it, from the
 * line of its foot to just in front of it. At a place, one of them stands at its foot. A lone mole stands on the rug,
 * beside the table, or at the place. */
export function meetsAt(facility: MeetingFacility, row: readonly Point[]): boolean {
  const a = facility.area, middle = (Math.min(...row.map(p => p.x)) + Math.max(...row.map(p => p.x))) / 2
  if (facility.kind === 'place') return row.some(p => Math.hypot(p.x - (a.x + a.width / 2), p.y - (a.y + a.height / 2)) <= AT_PLACE)
  if (facility.kind === 'rug') return middle >= a.x && middle <= a.x + a.width && row.every(p => p.y >= a.y && p.y <= a.y + a.height + IDLE_ROUTE_STEP)
  const beside = row.length > 1 ? 0 : BESIDE_TABLE
  return middle >= a.x - beside && middle <= a.x + a.width + beside && row.every(p => p.y >= a.y + a.height / 2 && p.y <= a.y + a.height + IN_FRONT_OF_TABLE)
}
/** Where an outing meets: the facility its places are at, or why it meets at none. */
export type IdleMeeting = { room: string; facility: string } | { none: string }
export interface IdleOuting { walkers: string[]; places: Point[]; meeting: IdleMeeting }
/** True when the pair's whole shared-paper arc is clear at these places. The
 * bodies are given relative to their own feet, and the blockers already hold
 * every body except the two walkers. */
export type PaperArcClear = (places: readonly Point[], bodies: readonly Rect[], blockers: readonly Rect[]) => boolean
/** The selected group meets in a row when every one of them has a clear, visible, reachable
 * place near them, each later one's reachable with those before it at their places. A pair is
 * tried in both orders, so the first never takes the place on the second's side when that shuts the
 * second out, and three are tried in their order and reversed. When the whole group has no such
 * places, the first two are tried as a pair, and then each of them alone; the others stay where they
 * are drawn. Null means none of them has a place. When paperClear is given, a pair prefers a place
 * whose paper arc is clear and falls back to the nearest place only when no candidate in reach is
 * clear; three, or a single walker, have no paper and are chosen as before. */
export function chooseIdleOuting(layout: Layout, selected: readonly IdleWalker[], blockers: readonly Rect[], visible: (point: Point) => boolean, offset: number, paperClear?: PaperArcClear): IdleOuting | null {
  if (selected.length < 1 || selected.length > IDLE_WALKING_CAP) return null
  // A blocker further than the reach plus the body's extent cannot touch a body at any candidate.
  const extent = Math.max(...selected.flatMap(w => [Math.abs(w.body.x), Math.abs(w.body.x + w.body.width), Math.abs(w.body.y), Math.abs(w.body.y + w.body.height)])) + IDLE_ROUTE_STEP
  // A walker whose desk has no way round does not set out; the others may go without it.
  const from = selected.map(w => setsOut(layout, w, [...blockers, ...atHome(selected, w)]))
  const feet = selected.flatMap((w, n) => [w.foot, from[n] ?? w.foot]), left = Math.min(...feet.map(p => p.x)), top = Math.min(...feet.map(p => p.y))
  const box = { x: left - IDLE_REACH - extent, y: top - IDLE_REACH - extent, width: Math.max(...feet.map(p => p.x)) - left + 2 * (IDLE_REACH + extent) + Math.max(1, selected.length - 1) * PAPER_MEETING_SPACING, height: Math.max(...feet.map(p => p.y)) - top + 2 * (IDLE_REACH + extent) }
  const near = blockers.filter(blocker => touches(blocker, box))
  const [a, b, c] = selected
  const goes = (w: IdleWalker) => !!from[selected.indexOf(w)]
  const orders = (c ? [[a!, b!, c], [c, b!, a!], [a!, b!], [b!, a!], [a!], [b!]] : b ? [[a!, b], [b, a!], [a!], [b]] : [[a!]]).filter(group => group.every(goes))
  // The facilities of the rooms the walkers work in, the first walker's room first.
  const rooms = [...new Set(selected.flatMap(w => { const room = layout.seats[w.id]?.room; return room === undefined ? [] : [room] }))]
  const facilities = rooms.flatMap(room => roomFacilities(layout, room))
  const tries = orders.map(group => {
    const staying = [...near, ...selected.filter(w => !group.includes(w)).map(w => translateBody(w.body, w.foot))]
    const bodies = group.map(w => w.body), starts = group.map(w => w.foot), candidates = idlePlaceCandidates(layout, group, staying)
    const reaches = (places: readonly Point[]) => group.length < 2 || laterReach(layout, group, staying, places)
    const prefer = paperClear && group.length === 2 ? (places: readonly Point[]) => paperClear(places, bodies, staying) && reaches(places) : undefined
    const row = (p: Point) => group.map((_, n) => ({ x: p.x + n * PAPER_MEETING_SPACING, y: p.y }))
    const atFacility = candidates.filter(p => facilities.some(f => meetsAt(f, row(p))))
    // A place clear and in reach, with a clear paper arc first when the pair has paper; a room where no
    // candidate has a clear arc still plays, and the page records the blockers that made the paper absent.
    const choose = (from: readonly Point[]): Point[] | null => {
      for (const accept of prefer ? [prefer, reaches] : [reaches]) {
        const places = chooseIdlePlaces(from, staying, visible, bodies, offset, PAPER_MEETING_SPACING, starts, accept)
        if (places.length === group.length) return places
      }
      return null
    }
    return { group, atFacility, candidates, choose }
  })
  // A group meets at a facility of its room when one has room for all of it, in either order, before it takes a
  // place on bare floor. A smaller group is tried only when the larger has no place at all, as before.
  for (const size of [3, 2, 1]) {
    const sized = tries.filter(one => one.group.length === size)
    for (const one of sized) {
      const places = one.atFacility.length ? one.choose(one.atFacility) : null
      if (!places) continue
      const facility = facilities.find(f => meetsAt(f, places))!
      return { walkers: one.group.map(w => w.id), places, meeting: { room: facility.room, facility: facility.name } }
    }
    for (const one of sized) {
      const places = one.choose(one.candidates)
      if (!places) continue
      const none = !facilities.length ? 'no facility in the room' : size === 1 ? 'no facility with room' : `no facility with room for ${size === 2 ? 'two' : 'three'}`
      return { walkers: one.group.map(w => w.id), places, meeting: { none } }
    }
  }
  return null
}
