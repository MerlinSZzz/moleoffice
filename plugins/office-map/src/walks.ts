// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { ContactBatch } from './bridge.ts'
import { CONTACT_LIMITS, identity } from './model.ts'
import type { Point, Route } from './geometry.ts'
import type { Rect } from './viewport.ts'
import type { SpriteFrame } from './pack.ts'
import { bodiesOverlap, translateBody, validBody } from './visual-body.ts'

export const WALK_PIXELS_PER_SECOND = 70
export const DEFAULT_MOLE_SCALE = .82
export interface Walk { id: string; from: string; to: string; expires: number; points: Point[]; started: number | null; duration: number; labelWait?: number }
export interface MovingContact { id: string; from: string; to: string; point: Point; elapsed: number; facing: 1 | -1; phase?: 'walk' | 'play' | 'wait'; paper?: boolean; labelAtSeat?: boolean }
export const gaitFrame = (elapsed: number): 'A' | 'pass' | 'B' => (['A', 'pass', 'B', 'pass'] as const)[Math.floor(Math.max(0, elapsed) / 200) % 4]!
export interface WalkClock {
  now(): number
  frame(callback: () => void): number
  cancelFrame(id: number): void
  later(callback: () => void, delay: number): number
  cancelLater(id: number): void
}
export const browserClock: WalkClock = {
  now: () => Date.now(), frame: fn => requestAnimationFrame(fn), cancelFrame: id => cancelAnimationFrame(id),
  later: (fn, delay) => window.setTimeout(fn, delay), cancelLater: id => clearTimeout(id),
}

/** One route request at a time; four active gestures including route waits, sixteen queued. A walk
 * whose route came back and could not be shown is named to `notShown`; one cancelled by clear() is not. */
export class ContactWalks {
  private active: Walk[] = []
  private queued: Walk[] = []
  private seen = new Set<string>()
  private enabled = false
  private closed = false
  private frame: number | null = null
  private expiry: number | null = null
  private routing: Walk | null = null
  private epoch = 0
  private sequence = 0
  private points: MovingContact[] = []
  constructor(private clock: WalkClock, private permitted: (key: string) => boolean,
    private route: (from: string, to: string, done: (route: Route | null) => void) => void,
    private changed: (points: MovingContact[]) => void, private visible: (point: Point) => boolean = () => true,
    private cancelRoute: () => void = () => {}, private maxActive: number = CONTACT_LIMITS.active,
    private actorScale: (key: string) => number = () => DEFAULT_MOLE_SCALE,
    private notShown: (from: string, to: string) => void = () => {},
    private labelWait: (id: string, points: readonly Point[]) => number = () => 0) {}

  setEnabled(enabled: boolean): void {
    if (this.closed || this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) this.clear()
  }
  accept(batch: ContactBatch): void {
    if (this.closed || batch.sequence <= this.sequence) return
    this.sequence = batch.sequence
    if (!this.enabled) return
    const withdrawn = new Set(batch.withdrawn)
    this.active = this.active.filter(w => !withdrawn.has(w.id))
    this.queued = this.queued.filter(w => !withdrawn.has(w.id))
    for (const message of batch.messages) {
      if (this.seen.has(message.id) || withdrawn.has(message.id)) continue
      this.seen.add(message.id)
      if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!)
      const from = identity(message.from.kind, message.from.id)
      if (!this.permitted(from)) continue
      const target = message.to.find(to => identity(to.kind, to.id) !== from && this.permitted(identity(to.kind, to.id)))
      if (!target) continue
      const walk: Walk = { id: message.id, from, to: identity(target.kind, target.id),
        expires: batch.receivedAt + CONTACT_LIMITS.cacheAgeMs, points: [], started: null, duration: 0 }
      if (this.active.length < this.maxActive && this.free(walk)) this.active.push(walk)
      else if (this.queued.length < CONTACT_LIMITS.queued) this.queued.push(walk)
    }
    this.advance()
  }
  /** A pan, endpoint withdrawal or new layout cancels invisible gestures rather than replaying them. */
  recheck(): void { if (this.enabled && !this.closed) this.advance() }
  snapshot(): { active: number; queued: number; frame: boolean; expiry: boolean; points: MovingContact[] } {
    return { active: this.active.length, queued: this.queued.length, frame: this.frame !== null, expiry: this.expiry !== null, points: this.points }
  }
  clear(): void {
    const hadRoute = this.routing !== null
    this.epoch++; this.active = []; this.queued = []; this.routing = null; this.seen.clear()
    if (this.frame !== null) this.clock.cancelFrame(this.frame)
    if (this.expiry !== null) this.clock.cancelLater(this.expiry)
    this.frame = null; this.expiry = null; this.points = []; this.changed([])
    if (hadRoute) this.cancelRoute()
  }
  dispose(): void { if (!this.closed) { this.enabled = false; this.clear(); this.closed = true } }
  private free(walk: Walk): boolean {
    return !this.active.some(other => other.from === walk.from || other.to === walk.to || other.from === walk.to || other.to === walk.from)
  }
  private advance(): void {
    if (!this.enabled || this.closed) return
    const now = this.clock.now()
    const keep = (walk: Walk) => walk.expires > now && this.permitted(walk.from) && this.permitted(walk.to) &&
      (walk.started === null || (now < walk.started + walk.duration && this.visible(along(walk.points, Math.min(1, (now - walk.started) / walk.duration)))))
    this.active = this.active.filter(keep); this.queued = this.queued.filter(keep)
    for (let i = 0; i < this.queued.length && this.active.length < this.maxActive;) {
      const walk = this.queued[i]!
      if (this.free(walk)) { this.queued.splice(i, 1); this.active.push(walk) } else i++
    }
    this.points = this.active.flatMap(walk => walk.started === null ? [] : [{ id: walk.id, from: walk.from, to: walk.to,
      ...onRoute(walk.points, Math.min(1, (now - walk.started) / walk.duration)), elapsed: now - walk.started,
      labelAtSeat: distance(walk.points) * Math.min(1, Math.max(0, (now - walk.started) / walk.duration)) < (walk.labelWait ?? 0) }])
    this.changed(this.points)
    if (this.frame !== null) { this.clock.cancelFrame(this.frame); this.frame = null }
    if (this.expiry !== null) { this.clock.cancelLater(this.expiry); this.expiry = null }
    if (this.points.length) this.frame = this.clock.frame(() => { this.frame = null; this.advance() })
    else if (this.active.length || this.queued.length) {
      const expires = Math.min(...this.active.concat(this.queued).map(w => w.expires))
      this.expiry = this.clock.later(() => { this.expiry = null; this.advance() }, Math.max(1, expires - now))
    }
    if (this.routing !== null && !this.active.includes(this.routing)) {
      this.epoch++; this.routing = null; this.cancelRoute()
    }
    if (this.routing !== null) return
    const walk = this.active.find(one => one.started === null)
    if (!walk) return
    this.routing = walk
    const epoch = this.epoch
    this.route(walk.from, walk.to, route => {
      if (epoch !== this.epoch || this.closed || !this.enabled) return
      this.routing = null
      if (this.active.includes(walk)) {
        if (route?.status === 'found' && route.points.length > 1 && walk.expires > this.clock.now()) {
          walk.points = route.points; walk.started = this.clock.now()
          walk.duration = Math.max(1, walkDurationMs(route.points, this.actorScale(walk.from)))
          walk.labelWait = this.labelWait(walk.from, walk.points)
        } else { this.active = this.active.filter(one => one !== walk); this.notShown(walk.from, walk.to) }
      }
      this.advance()
    })
  }
}

const distance = (points: readonly Point[]): number => points.slice(1).reduce((total, point, i) => total + Math.hypot(point.x - points[i]!.x, point.y - points[i]!.y), 0)
export function walkDurationMs(points: readonly Point[], scale: number): number {
  const drawn = Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_MOLE_SCALE
  return distance(points) / (WALK_PIXELS_PER_SECOND * drawn) * 1000
}
export function along(points: Point[], progress: number): Point {
  return onRoute(points, progress).point
}
/** At a vertex the outgoing segment wins, so a reversal flips on that exact frame.
 * Vertical sections retain the last horizontal facing. Distance, never point index, controls speed. */
export function onRoute(points: Point[], progress: number): { point: Point; facing: 1 | -1 } {
  let left = distance(points) * progress
  let facing: 1 | -1 = 1
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, length = Math.hypot(b.x - a.x, b.y - a.y)
    if (b.x !== a.x) facing = b.x > a.x ? 1 : -1
    if (left < length && length > 0) return { point: { x: a.x + (b.x - a.x) * left / length, y: a.y + (b.y - a.y) * left / length }, facing }
    left -= length
  }
  return { point: points.at(-1) ?? { x: 0, y: 0 }, facing }
}

/** Pick every walker's place together, in a row `spacing` apart, so a reserved position never overlaps another body. */
export const PAPER_MEETING_SPACING = 160
export const PAPER_ARC_SHIFT = 32
export function chooseIdlePlaces(places: readonly Point[], occupied: readonly Rect[], visible: (point: Point) => boolean, bodies: readonly Rect[], offset = 0, spacing = 96, starts: readonly Point[] = [], accept: (places: readonly Point[]) => boolean = () => true): Point[] {
  if (bodies.length < 1 || bodies.length > IDLE_WALKING_CAP || !bodies.every(validBody) || !occupied.every(validBody) || !Number.isFinite(spacing) || spacing <= 0) return []
  if (starts.length && (starts.length !== bodies.length || starts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))) return []
  const reserved = starts.map((point, i) => translateBody(bodies[i]!, point))
  for (let i = 0; i < places.length; i++) {
    const point = places[(i + offset) % places.length]!
    const row = bodies.map((_, k) => ({ x: point.x + k * spacing, y: point.y })), drawn = row.map((place, k) => translateBody(bodies[k]!, place))
    if (row.every(visible) && drawn.every((one, k) => drawn.slice(k + 1).every(other => !bodiesOverlap(one, other)) && [...occupied, ...reserved].every(other => !bodiesOverlap(one, other))) && accept(row)) return row
  }
  return []
}
/** `body` is the mole's drawn bounds about its foot. Without it, no walk of this mole is proved
 * apart from another, so it walks alone. */
export interface IdleAgent { id: string; foot: Point; idle: boolean; scale?: number; body?: Rect }
/** Reserve both the current body and its home until an outing is finished.
 * A planned standing place counts as the current position of that body. */
export interface IdleStanding { id: string; point: Point }
export function occupiedBodies(rows: readonly { id: string; home: Point; current: Point; body: Rect | null }[], except: string, standing: readonly IdleStanding[] = []): Rect[] | null {
  const occupied: Rect[] = []
  for (const row of rows) {
    if (row.id === except) continue
    const current = standing.find(one => one.id === row.id)?.point ?? row.current
    if (!validBody(row.body) || ![row.home.x, row.home.y, current.x, current.y].every(Number.isFinite)) return null
    occupied.push(translateBody(row.body, current))
    if (current.x !== row.home.x || current.y !== row.home.y) occupied.push(translateBody(row.body, row.home))
  }
  return occupied
}
/** A rectangle containing every visible point of the paper's complete arc.
 * This conservative envelope includes the native trim and display scale.
 * Null means the frame or the point is not usable, so the paper cannot be judged. */
export function paperArcRect(point: Point, frame: SpriteFrame | null | undefined, shift = 0): Rect | null {
  if (!frame || !frame.rect || !frame.trim) return null
  const [, , width, height] = frame.rect, [x, y] = frame.trim
  if (![point.x, point.y, x, y, width, height, shift].every(Number.isFinite) || width! <= 0 || height! <= 0) return null
  return { x: point.x + 10 + shift + x! * 1.2, y: point.y - 50 + y! * 1.2, width: 48 + width! * 1.2, height: 16 + height! * 1.2 }
}
/** A rectangle containing every visible point of the paper's complete arc.
 * Null means the frame or a blocker is not usable, so the paper cannot be judged. */
export function paperArcBlockers(point: Point, frame: SpriteFrame | null | undefined, blockers: readonly Rect[], shift = 0): Rect[] | null {
  if (!blockers.every(validBody)) return null
  const paper = paperArcRect(point, frame, shift)
  return paper === null ? null : blockers.filter(other => bodiesOverlap(paper, other))
}
/** The paper is drawn only when its whole arc is clear of every blocker. */
export function paperArcClear(point: Point, frame: SpriteFrame | null | undefined, blockers: readonly Rect[], shift = 0): boolean {
  const blocked = paperArcBlockers(point, frame, blockers, shift)
  return blocked !== null && blocked.length === 0
}
export interface IdleActor { id: string; point: Point; phase: 'walk' | 'play' | 'wait'; partner: string; elapsed: number; facing: 1 | -1; paper: boolean; labelAtSeat: boolean }
interface IdleParticipant { agent: IdleAgent; point: Point; target: Point; arrived: boolean }
/** `walkers` names which of the selected group go out, and in which order, when the page chose them.
 * `refusal` says why there are no places; without it, missing places mean "not ready yet". */
export interface IdleInput { enabled: boolean; agents: IdleAgent[]; places: Point[]; walkers?: string[]; refusal?: string; occupancy?: Point[]; paper?: boolean }
export type IdleRouteRequest = (id: string, target: Point, done: (route: Route | null) => void, start?: Point, standing?: readonly IdleStanding[]) => void
/** With `preflight`, every walker's route is found before anybody moves, and the
 * way back is the planned route reversed, last out first back. A refused outing
 * moves nobody; its reason goes to `failure` and stays in the snapshot. With
 * `chances`, numbers in [0, 1), each turn's pair and place offset are drawn from
 * them; without, the pair and the offset follow the turn in order. */
export interface IdleMotionOptions { preflight?: boolean; failure?: (reason: string) => void; chances?: () => number; labelWait?: (id: string, points: readonly Point[]) => number }
export interface IdleRefusal { reason: string; ids: string[] }
/** At most this many idle moles walk at the same time, and an outing takes no more than this many out. */
export const IDLE_WALKING_CAP = 3
/** The longest piece of a route covered by one box when two walks are compared. */
const CORRIDOR_PIECE = 16
/** Boxes that hold every position of `body` along the route: each covers the body at both ends of a
 * piece no longer than CORRIDOR_PIECE, which holds the body anywhere between them. */
function corridor(points: readonly Point[], body: Rect): Rect[] {
  const boxes: Rect[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, pieces = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / CORRIDOR_PIECE))
    for (let k = 0; k < pieces; k++) {
      const from = { x: a.x + (b.x - a.x) * k / pieces, y: a.y + (b.y - a.y) * k / pieces }, to = { x: a.x + (b.x - a.x) * (k + 1) / pieces, y: a.y + (b.y - a.y) * (k + 1) / pieces }
      boxes.push({ x: Math.min(from.x, to.x) + body.x, y: Math.min(from.y, to.y) + body.y, width: Math.abs(to.x - from.x) + body.width, height: Math.abs(to.y - from.y) + body.height })
    }
  }
  return boxes
}
/** True only when the two bodies cannot meet however the two walks are timed: no box of one
 * route's corridor touches a box of the other's. A walk with no known body or no route is never
 * proved apart. */
export function walksApart(a: { points: readonly Point[]; body?: Rect }, b: { points: readonly Point[]; body?: Rect }): boolean {
  if (!validBody(a.body) || !validBody(b.body) || a.points.length < 2 || b.points.length < 2 || ![...a.points, ...b.points].every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return false
  const other = corridor(b.points, b.body)
  return corridor(a.points, a.body).every(box => other.every(one => !bodiesOverlap(box, one)))
}
/** The planned walks, in their planned order, put into waves that walk at the same time. A wave holds
 * consecutive walks only, so each route still meets the scene it was planned in: the walkers before it
 * at their places and those after it at home. A walk joins the wave before it when that wave has fewer
 * than IDLE_WALKING_CAP and every walk in it is proved apart from this one; otherwise it starts a new
 * wave, and walks after the earlier ones have arrived. */
export function idleWaves(walks: readonly { points: readonly Point[]; body?: Rect }[]): number[][] {
  const waves: number[][] = []
  walks.forEach((walk, i) => {
    const last = waves.at(-1)
    if (last && last.length < IDLE_WALKING_CAP && last.every(j => walksApart(walks[j]!, walk))) last.push(i)
    else waves.push([i])
  })
  return waves
}
interface IdleMove { actor: IdleParticipant; points: Point[]; started: number; duration: number; returning: boolean; total: number; labelWait: number }
/** With `preflight`, every route is planned before anybody moves, and the walkers go out in the waves
 * of `idleWaves`: up to IDLE_WALKING_CAP at the same time, only on routes proved apart, and otherwise
 * one after another. The way back takes the waves in reverse, each on its planned routes reversed.
 * Without `preflight`, one body walks at a time and the other participants reserve their places. */
export class IdleMotion {
  private actors: IdleParticipant[] = []
  private enabled = false
  private closed = false
  private signature = ''
  private epoch = 0
  private frame: number | null = null
  private timer: number | null = null
  private moving: IdleMove[] = []
  private playing: number | null = null
  private stage: 'out' | 'play' | 'back' = 'out'
  private lastInput: IdleInput | null = null
  private turn = 0
  private plans: Point[][] = []
  private waves: number[][] = []
  private refusal: IdleRefusal | null = null
  private draws: { turn: number; values: number[] } | null = null
  constructor(private clock: WalkClock,
    private route: IdleRouteRequest,
    private changed: (actors: IdleActor[]) => void,
    private cancelRoute: () => void = () => {}, private cycle: (() => void) | null = null, private options: IdleMotionOptions = {}) {}
  /** A turn draws its numbers once, so its group and its places hold for the whole turn: the group's
   * size, one number for each mole picked, and the place offset. */
  private drawn(chances: () => number): number[] {
    if (this.draws?.turn !== this.turn) this.draws = { turn: this.turn, values: Array.from({ length: IDLE_WALKING_CAP + 2 }, () => chances()) }
    return this.draws.values
  }
  selection(agents: IdleAgent[]): IdleAgent[] {
    const eligible = agents.filter(agent => agent.idle), n = eligible.length, chances = this.options.chances
    if (!n) return []
    if (!chances) return Array.from({ length: Math.min(2, n) }, (_, i) => eligible[(this.turn * 2 + i) % n]!)
    // Half the turns ask for a pair and half for three; each mole is picked from those not yet picked.
    const [size, ...picks] = this.drawn(chances), pool = [...eligible]
    return Array.from({ length: Math.min(n, size! < .5 ? IDLE_WALKING_CAP : 2) }, (_, i) => pool.splice(Math.floor(picks[i]! * pool.length), 1)[0]!)
  }
  get destinationOffset(): number { return this.options.chances ? Math.floor(this.drawn(this.options.chances)[IDLE_WALKING_CAP + 1]! * 2 ** 31) : this.turn }
  update(input: IdleInput): void {
    if (this.closed) return
    const agents = this.selection(input.agents)
    // A page update can arrive while a walk or play is under way before the scene is ready
    // again. It carries no places and no refusal, which means "wait", not "stop": keep the
    // outing so a clear-paper meeting is not cancelled between its route and its paper.
    const sameAgents = agents.length > 0 && agents.length === this.actors.length && agents.every(agent => this.actors.some(actor => actor.agent.id === agent.id))
    if (this.enabled && input.enabled && !input.refusal && input.places.length === 0 && sameAgents) { this.lastInput = { ...input, paper: this.lastInput?.paper }; return }
    this.lastInput = input
    const signature = JSON.stringify([input.enabled, agents, input.places, input.walkers, input.refusal, input.occupancy, input.paper])
    if (signature === this.signature) return
    this.reset(); this.signature = signature; this.enabled = input.enabled
    if (!this.enabled || !agents.length) return
    if (this.options.preflight) { this.plan(agents, input); return }
    if (input.places.length < agents.length) return
    this.actors = agents.map((agent, i) => ({ agent, point: agent.foot, target: input.places[i]!, arrived: false }))
    this.stage = 'out'; this.next()
  }
  snapshot() { return { active: this.actors.length, moving: this.moving.length > 0, frame: this.frame !== null, timer: this.timer !== null, points: this.current(), refusal: this.refusal } }
  private current(): IdleActor[] {
    const now = this.clock.now()
    return this.actors.map((actor, index) => {
      const moving = this.moving.find(move => move.actor === actor) ?? null
      const progress = moving ? Math.min(1, Math.max(0, (now - moving.started) / moving.duration)) : 0
      const at = moving ? onRoute(moving.points, progress) : { point: actor.point, facing: (index ? -1 : 1) as 1 | -1 }
      const walked = moving ? moving.total * progress : 0
      const labelAtSeat = !!moving && (moving.returning ? moving.total - walked < moving.labelWait : walked < moving.labelWait)
      return { id: actor.agent.id, point: at.point, phase: moving ? 'walk' : this.stage === 'play' ? 'play' : 'wait', partner: this.actors[index ? index - 1 : 1]?.agent.id ?? '', elapsed: moving ? now - moving.started : this.playing === null ? 0 : now - this.playing, facing: at.facing, paper: !!this.lastInput?.paper, labelAtSeat }
    })
  }
  private emit(): void { this.changed(this.current()) }
  private rest(): void {
    this.timer = this.clock.later(() => { this.timer = null; this.turn++; this.signature = ''; if (this.cycle) this.cycle(); else if (this.lastInput) this.update(this.lastInput) }, 12000)
  }
  private usable(route: Route | null, start: Point, target: Point): route is Route {
    return !!route && route.status === 'found' && route.points.length >= 2 && Math.hypot(route.points[0]!.x - start.x, route.points[0]!.y - start.y) <= .01 && Math.hypot(route.points.at(-1)!.x - target.x, route.points.at(-1)!.y - target.y) <= .01
  }
  private plan(selected: IdleAgent[], input: IdleInput): void {
    if (input.refusal) { this.refuse(input.refusal, selected); return }
    // In the order the page named them, which is the order their places come in.
    const walkers = input.walkers ? input.walkers.flatMap(id => selected.filter(agent => agent.id === id)) : selected
    if (!walkers.length || walkers.length !== input.places.length || (input.walkers && walkers.length !== input.walkers.length)) return
    this.actors = walkers.map((agent, i) => ({ agent, point: agent.foot, target: input.places[i]!, arrived: false }))
    this.plans = []; this.waves = []; this.stage = 'out'; this.preflight()
  }
  /** Each route is planned with the walkers before it standing at their places. */
  private preflight(): void {
    const actor = this.actors[this.plans.length]
    if (!actor) { this.waves = idleWaves(this.plans.map((points, i) => ({ points, body: this.actors[i]!.agent.body }))); this.next(); return }
    const epoch = this.epoch, standing = this.actors.slice(0, this.plans.length).map(other => ({ id: other.agent.id, point: other.target }))
    this.route(actor.agent.id, actor.target, route => {
      if (epoch !== this.epoch || !this.enabled || this.closed) return
      const reason = !route ? 'unavailable' : route.status === 'found' ? 'unusable' : route.status
      if (!this.usable(route, actor.agent.foot, actor.target)) { this.refuse(reason, this.actors.map(one => one.agent)); return }
      this.plans.push(route.points); this.preflight()
    }, actor.agent.foot, standing)
  }
  private refuse(reason: string, agents: IdleAgent[]): void {
    this.actors = []; this.plans = []; this.waves = []; this.refusal = { reason, ids: agents.map(agent => agent.id) }
    this.options.failure?.(reason); this.changed([]); this.rest()
  }
  private next(): void {
    if (!this.enabled || this.closed || !this.actors.length) return
    if (this.stage === 'play') {
      this.playFrame(); return
    }
    // Planned waves come back last out, first back, so each reversed route
    // meets the scene it was planned in.
    const wave = this.options.preflight ? (this.stage === 'back' ? [...this.waves].reverse() : this.waves).find(indices => indices.some(i => !this.actors[i]!.arrived)) : undefined
    const index = this.options.preflight ? wave?.find(i => !this.actors[i]!.arrived) ?? -1 : this.actors.findIndex(a => !a.arrived)
    const actor = this.actors[index]
    if (!actor) {
      if (this.stage === 'out' && this.actors.length === 1) { this.stage = 'back'; this.actors[0]!.arrived = false; this.next() }
      else if (this.stage === 'out') { this.stage = 'play'; this.playing = this.clock.now(); this.next() }
      else { this.actors = []; this.plans = []; this.waves = []; this.emit(); this.rest() }
      return
    }
    if (this.options.preflight) {
      // The whole wave sets out at once.
      for (const i of wave!) {
        const walker = this.actors[i]!
        if (walker.arrived) continue
        const planned = this.plans[i]!, points = this.stage === 'out' ? planned : [...planned].reverse()
        this.moving.push({ actor: walker, points, started: this.clock.now(), duration: Math.max(1, walkDurationMs(points, walker.agent.scale ?? DEFAULT_MOLE_SCALE)), returning: this.stage === 'back', total: distance(points), labelWait: this.options.labelWait?.(walker.agent.id, planned) ?? 0 })
      }
      this.tick(); return
    }
    const target = this.stage === 'out' ? actor.target : actor.agent.foot, epoch = this.epoch
    if (Math.hypot(target.x - actor.point.x, target.y - actor.point.y) < .01) { actor.arrived = true; this.emit(); this.next(); return }
    this.route(actor.agent.id, target, route => {
      if (epoch !== this.epoch || !this.enabled || this.closed) return
      if (!this.usable(route, actor.point, target)) {
        if (this.stage === 'out') {
          this.stage = 'back'
          for (const participant of this.actors) participant.arrived = Math.hypot(participant.point.x - participant.agent.foot.x, participant.point.y - participant.agent.foot.y) < .01
          this.next()
        } else this.emit() // No safe return: retain the body where it is until the scene changes.
        return
      }
      this.moving = [{ actor, points: route.points, started: this.clock.now(), duration: Math.max(1, walkDurationMs(route.points, actor.agent.scale ?? DEFAULT_MOLE_SCALE)), returning: this.stage === 'back', total: distance(route.points), labelWait: this.options.labelWait?.(actor.agent.id, this.stage === 'back' ? [...route.points].reverse() : route.points) ?? 0 }]
      this.tick()
    }, actor.point)
  }
  private playFrame(): void {
    if (!this.enabled || this.closed || this.stage !== 'play' || this.playing === null) return
    if (this.clock.now() - this.playing >= 6000) { this.stage = 'back'; for (const actor of this.actors) actor.arrived = false; this.next(); return }
    this.emit(); this.frame = this.clock.frame(() => { this.frame = null; this.playFrame() })
  }
  /** A walker who has arrived stands at its place; the next wave sets out only when the whole of this one has arrived. */
  private tick(): void {
    if (!this.moving.length || !this.enabled || this.closed) return
    const now = this.clock.now()
    for (const move of this.moving) if (now - move.started >= move.duration) { move.actor.point = move.points.at(-1)!; move.actor.arrived = true }
    this.moving = this.moving.filter(move => !move.actor.arrived)
    if (!this.moving.length) { this.emit(); this.next(); return }
    this.emit(); this.frame = this.clock.frame(() => { this.frame = null; this.tick() })
  }
  private reset(): void {
    this.epoch++; if (this.frame !== null) this.clock.cancelFrame(this.frame); if (this.timer !== null) this.clock.cancelLater(this.timer)
    this.frame = null; this.timer = null; this.moving = []; this.playing = null; this.actors = []; this.plans = []; this.waves = []; this.refusal = null; this.cancelRoute(); this.changed([])
  }
  dispose(): void { if (!this.closed) { this.enabled = false; this.reset(); this.closed = true } }
}
/** How the map builds its idle motion: every route found before anyone moves, and the group and
 * places drawn from `chances` when it is given. */
export function idleMotionForMap(clock: WalkClock, route: IdleRouteRequest, changed: (actors: IdleActor[]) => void, cancelRoute: () => void, cycle: (() => void) | null, failure: (reason: string) => void, chances?: () => number, labelWait?: (id: string, points: readonly Point[]) => number): IdleMotion {
  return new IdleMotion(clock, route, changed, cancelRoute, cycle, { preflight: true, failure, chances, labelWait })
}
