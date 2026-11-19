// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Layout, Point, Route, Obstacle } from './geometry.ts'
import { pointIsClear } from './geometry.ts'
import { inPolygon, boundsOf, type House } from './village.ts'
import { VisibleIndex } from './render-plan.ts'
import { searchSteps } from './search.ts'
import { packedBounds, inPackedRing, packedRings } from './packed-road.ts'

const key = (p: Point): string => `${p.x},${p.y}`
const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }]
interface Node { point: Point; edges: Map<number, { distance: number; points: Point[] } > }
interface Line { intervals: [number, number][]; stops: Set<number> }

/** Small road graph with bounded house searches. Derived once, never cloned into the renderer. */
export class Navigation {
  private nodes: Node[] = []
  private ids = new Map<string, number>()
  private index = new Map<string, Obstacle[]>()
  private homes = new Map<string, House>()
  private ground!: VisibleIndex<Point[]>
  private packedGround!: VisibleIndex<Float64Array>
  private exhausted = false
  private legs = new Map<string, Point[] | null>()
  private links = new Map<string, { points: Point[] | null; exhausted: boolean }>()
  constructor(private readonly layout: Layout, private previous?: Navigation) {}
  *build(): Generator<void> {
    let count = 0, inserted = 0
    const old = new Map<string, Obstacle>(), dirty: Obstacle[] = []
    if (this.previous) for (const obstacle of this.previous.layout.obstacles) { old.set(JSON.stringify(obstacle), obstacle); if (++count % 128 === 0) yield }
    for (const obstacle of this.layout.obstacles) {
      if (this.previous && !old.delete(JSON.stringify(obstacle))) dirty.push(obstacle)
      for (let y = Math.floor(obstacle.y / 96); y <= Math.floor((obstacle.y + obstacle.height) / 96); y++) for (let x = Math.floor(obstacle.x / 96); x <= Math.floor((obstacle.x + obstacle.width) / 96); x++) {
        const k = `${x},${y}`, entries = this.index.get(k) ?? []; entries.push(obstacle); this.index.set(k, entries)
        if (++inserted === 32) { inserted = 0; yield }
      }
      if (++count % 128 === 0) yield
    }
    dirty.push(...old.values()); old.clear()
    for (const house of this.layout.houses) for (const id of house.occupants) { this.homes.set(id, house); if (++count % 128 === 0) yield }
    const layout = this.layout
    this.ground = yield* VisibleIndex.build((function* () { for (const value of layout.road.rings) yield { value, rect: boundsOf(value) } })())
    this.packedGround = yield* VisibleIndex.build((function* () { for (const value of packedRings(layout.roadDrawing ?? [])) yield { value, rect: packedBounds(value) } })())
    yield
    const horizontal = new Map<number, Line>(), vertical = new Map<number, Line>()
    const line = (map: Map<number, Line>, at: number): Line => {
      let entry = map.get(at); if (!entry) { entry = { intervals: [], stops: new Set() }; map.set(at, entry) } return entry
    }
    for (const path of this.layout.paths ?? []) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!, b = path[i]!, h = a.y === b.y
        if (!h && a.x !== b.x) continue
        const entry = line(h ? horizontal : vertical, h ? a.y : a.x), lo = h ? Math.min(a.x, b.x) : Math.min(a.y, b.y), hi = h ? Math.max(a.x, b.x) : Math.max(a.y, b.y)
        entry.intervals.push([lo, hi]); entry.stops.add(lo); entry.stops.add(hi)
      }
      yield
    }
    // Merge overlapping collinear intervals before intersection tests. A growing room has
    // many paths sharing its stem; testing all original spans made this step quadratic.
    for (const map of [horizontal, vertical]) for (const entry of map.values()) {
      const merged: [number, number][] = []
      for (const span of entry.intervals.sort((a, b) => a[0] - b[0])) {
        const previous = merged.at(-1)
        if (previous && span[0] <= previous[1]) previous[1] = Math.max(previous[1], span[1])
        else merged.push([...span])
      }
      entry.intervals = merged
      yield
    }
    // Split only at actual intersections, including every room's connection to the square.
    for (const [y, h] of horizontal) {
      for (const [x, v] of vertical) if (h.intervals.some(([a, b]) => x >= a && x <= b) && v.intervals.some(([a, b]) => y >= a && y <= b)) { h.stops.add(x); v.stops.add(y) }
      yield
    }
    for (const [map, h] of [[horizontal, true], [vertical, false]] as const) for (const [at, entry] of map) {
      const stops = [...entry.stops].sort((a, b) => a - b)
      for (let i = 1; i < stops.length; i++) {
        const lo = stops[i - 1]!, hi = stops[i]!
        if (!entry.intervals.some(([a, b]) => a <= lo && b >= hi)) continue
        const a = h ? { x: lo, y: at } : { x: at, y: lo }, b = h ? { x: hi, y: at } : { x: at, y: hi }
        const ai = this.node(a), bi = this.node(b), start = this.nodes[ai]!.point, target = this.nodes[bi]!.point
        const linkKey = JSON.stringify([start, target]), kept = this.previous?.links.get(linkKey)
        const left = Math.min(start.x, target.x) - 112, right = Math.max(start.x, target.x) + 112, top = Math.min(start.y, target.y) - 112, bottom = Math.max(start.y, target.y) + 112
        const changed = dirty.some(o => o.x <= right && o.x + o.width >= left && o.y <= bottom && o.y + o.height >= top)
        const wasExhausted = this.exhausted
        const points = kept && !changed ? kept.points : this.segment(start, target, [], undefined, key(start) === key(a) && key(target) === key(b)) ? [start, target] : (yield* this.detour(start, target))
        const exhausted = kept && !changed ? kept.exhausted : !wasExhausted && this.exhausted
        this.exhausted ||= exhausted
        this.links.set(linkKey, { points, exhausted })
        if (points) {
          const distance = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0)
          this.nodes[ai]!.edges.set(bi, { distance, points }); this.nodes[bi]!.edges.set(ai, { distance, points: [...points].reverse() })
        }
        yield
      }
      yield
    }
    this.previous = undefined
  }
  private node(point: Point): number {
    const k = key(point), kept = this.ids.get(k)
    if (kept !== undefined) return kept
    let placed = point
    if (!this.clear(placed, [])) {
      outer: for (let radius = 16; radius <= 64; radius += 16) for (const d of directions) {
        const p = { x: point.x + d.x * radius, y: point.y + d.y * radius }
        if (this.clear(p, [])) { placed = p; break outer }
      }
    }
    const id = this.nodes.length; this.ids.set(k, id); this.nodes.push({ point: placed, edges: new Map() }); return id
  }
  private onGround(p: Point, house?: House): boolean {
    const square = this.layout.square
    if (p.x >= square.x && p.x <= square.x + square.width && p.y >= square.y && p.y <= square.y + square.height) return true
    if (house?.walkable.some(poly => inPolygon(house.walkableOrigin ? { x: p.x - house.walkableOrigin.x, y: p.y - house.walkableOrigin.y } : p, poly))) return true
    const pixel = { x: Math.floor(p.x) + .5, y: Math.floor(p.y) + .5 }
    const camera = { left: pixel.x, top: pixel.y, width: .001, height: .001 }
    return this.ground.query(camera).some(ring => inPolygon(pixel, ring)) || this.packedGround.query(camera).some(ring => inPackedRing(pixel, ring))
  }
  private clear(p: Point, free: string[], house?: House): boolean { return this.onGround(p, house) && pointIsClear(this.layout, p, free, this.index) }
  private segment(a: Point, b: Point, free: string[], house?: House, road = false): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4))
    for (let i = 0; i <= steps; i++) { const p = { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }; if (!(road ? pointIsClear(this.layout, p, free, this.index) : this.clear(p, free, house))) return false }
    return true
  }
  private *detour(start: Point, target: Point): Generator<void, Point[] | null> {
    if (!this.clear(start, []) || !this.clear(target, [])) return null
    const minX = Math.min(start.x, target.x) - 96, maxX = Math.max(start.x, target.x) + 96, minY = Math.min(start.y, target.y) - 96, maxY = Math.max(start.y, target.y) + 96
    const result = yield* searchSteps(start, p => Math.hypot(p.x - target.x, p.y - target.y) <= 24 && this.segment(p, target, []), p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY && this.clear(p, []) ? 1 : null,
      p => Math.hypot(p.x - target.x, p.y - target.y) / 16, 16, 4000, directions, (a, b) => this.segment(a, b, []))
    if (result === 'ran out') { this.exhausted = true; return null }
    if (!result) return null
    result.push(target); return result
  }
  private *local(start: Point, target: Point, free: string[], house: House, budget: { left: number }): Generator<void, Point[] | 'ran out' | null> {
    if (!this.clear(start, free, house) || !this.clear(target, free, house)) return null
    // An ownership team's outdoor group and carry stools stand on a sand yard below
    // its house, walked as road, so the search also reaches a body's step round both
    // ends of the leg. Keep the old physical-room search limits for every other layout.
    const origin = house.walkableOrigin ?? { x: 0, y: 0 }
    const area = this.layout.ownership ? boundsOf([{ x: house.x - 32, y: house.y - 32 }, { x: house.x + house.width + 32, y: house.y + house.height + 80 },
      ...house.walkable.flatMap(poly => poly.map(p => ({ x: p.x + origin.x, y: p.y + origin.y }))),
      ...[start, target].flatMap(p => [{ x: p.x - 96, y: p.y - 96 }, { x: p.x + 96, y: p.y + 96 }])]) : { x: house.x - 32, y: house.y - 32, width: house.width + 64, height: house.height + 112 }
    const result = yield* searchSteps(start, p => Math.hypot(p.x - target.x, p.y - target.y) <= 24 && this.segment(p, target, free, house), p => {
      if (p.x < area.x || p.x > area.x + area.width || p.y < area.y || p.y > area.y + area.height) return null
      return this.clear(p, free, house) ? 1 : null
    }, p => Math.hypot(p.x - target.x, p.y - target.y) / 16, 16, budget.left, directions,
    (a, b) => this.segment(a, b, free, house))
    // Bound all route work, retaining exhaustion as a different answer from a sealed frontier.
    if (result && result !== 'ran out' && key(result.at(-1)!) !== key(target)) result.push(target)
    return result
  }
  route(from: string, to: string, turns: number): Route {
    const work = this.routeSteps(from, to, turns)
    for (;;) { const next = work.next(); if (next.done) return next.value }
  }
  *routeSteps(from: string, to: string, turns: number): Generator<void, Route> {
    const start = this.layout.seats[from]!.foot, target = this.layout.seats[to]!.talk, a = this.homes.get(from), b = this.homes.get(to)
    if (!a || !b || ![start.x, start.y, target.x, target.y].every(Number.isFinite)) return { status: 'unavailable', points: [] }
    const free = [from, to], budget = { left: turns }
    if (a === b) {
      const local = yield* this.local(start, target, free, a, budget)
      return local === 'ran out' ? { status: 'exhausted', points: [] } : local ? { status: 'found', points: local } : { status: 'no-path', points: [] }
    }
    const leg = function* (this: Navigation, id: string, p: Point, house: House, end: string): Generator<void, { node: number; points: Point[] } | 'ran out' | null> {
      for (const door of house.doors) {
        const node = this.ids.get(key(door)); if (node === undefined) continue
        const k = JSON.stringify([id, end, key(door)])
        let points = turns === 80000 ? this.legs.get(k) : undefined
        if (points === undefined) {
          const result = yield* this.local(p, door, [id], house, budget)
          if (result === 'ran out') return result
          points = result
          if (turns === 80000) { if (this.legs.size >= 128) this.legs.delete(this.legs.keys().next().value!); this.legs.set(k, points) }
        }
        if (points) return { node, points }
      }
      return null
    }
    const first = yield* leg.call(this, from, start, a, 'foot'), last = yield* leg.call(this, to, target, b, 'talk')
    if (first === 'ran out' || last === 'ran out') return { status: 'exhausted', points: [] }
    if (!first || !last) return { status: this.exhausted ? 'exhausted' : 'no-path', points: [] }
    // A* over the sparse graph, with a heap and a bounded frontier.
    const frontier: { id: number; g: number; f: number }[] = [], costs = new Map<number, number>([[first.node, 0]]), parents = new Map<number, number>()
    const push = (id: number, g: number): void => {
      const point = this.nodes[id]!.point, finish = this.nodes[last.node]!.point, item = { id, g, f: g + Math.hypot(point.x - finish.x, point.y - finish.y) }
      let at = frontier.push(item) - 1
      while (at > 0) { const parent = (at - 1) >> 1; if (frontier[parent]!.f <= item.f) break; frontier[at] = frontier[parent]!; at = parent } frontier[at] = item
    }
    const pop = () => {
      const item = frontier[0]!, tail = frontier.pop()!
      if (frontier.length) { let at = 0; while (at * 2 + 1 < frontier.length) { let child = at * 2 + 1; if (child + 1 < frontier.length && frontier[child + 1]!.f < frontier[child]!.f) child++; if (frontier[child]!.f >= tail.f) break; frontier[at] = frontier[child]!; at = child } frontier[at] = tail }
      return item
    }
    push(first.node, 0)
    for (let turn = 0; turn < turns && frontier.length; turn++) {
      if (turn % 32 === 0) yield
      const item = pop(); if (item.g !== costs.get(item.id)) continue
      if (item.id === last.node) {
        const ids = [item.id]; let id = item.id
        while (id !== first.node) { id = parents.get(id)!; ids.push(id) }
        ids.reverse()
        const road = [this.nodes[first.node]!.point]
        for (let i = 1; i < ids.length; i++) road.push(...this.nodes[ids[i - 1]!]!.edges.get(ids[i]!)!.points.slice(1))
        return { status: 'found', points: [...first.points, ...road.slice(1), ...last.points.slice(0, -1).reverse()] }
      }
      for (const [next, { distance }] of this.nodes[item.id]!.edges) {
        const g = item.g + distance; if (g >= (costs.get(next) ?? Infinity)) continue
        costs.set(next, g); parents.set(next, item.id); push(next, g)
      }
    }
    return { status: frontier.length || this.exhausted ? 'exhausted' : 'no-path', points: [] }
  }
}
