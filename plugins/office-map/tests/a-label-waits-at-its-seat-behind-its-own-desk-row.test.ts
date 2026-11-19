// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { hall13Bays } from '../src/ownership-facilities.ts'
import { labelWait, overlaps, walkingPlate } from '../src/nameplates.ts'
import { routeIdle, type Layout, type Point, type Station } from '../src/geometry.ts'
import { atDesk } from '../src/desk-things.ts'
import { translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { IdleMotion, type IdleActor, type WalkClock } from '../src/walks.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

// Every agent, person and project in this file is invented.
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const next = work.next(); if (next.done) return next.value } }
const build = (agents: ReturnType<typeof agent>[]) => {
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
const hall13 = build([agent('invented-secretary', { role: 'secretary' }),
  ...Array.from({ length: 13 }, (_, i) => agent(`invented-worker-${String(i).padStart(2, '0')}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))])
const secretaries9 = build([...Array.from({ length: 9 }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary' })),
  agent('invented-secretary-worker', { startedBy: { kind: 'agent', id: 'invented-secretary-0' } })])
const rooms: { name: string; layout: Layout; house: Layout['houses'][number] }[] = [
  { name: 'the hall of 13', layout: hall13, house: hall13.houses.find(h => h.type === 'direct' && h.width === hall13Bays.width && h.height === hall13Bays.height)! },
  { name: "the secretaries' hall of 9", layout: secretaries9, house: secretaries9.houses.find(h => h.type === 'secretariat')! },
]
const body = visualBodyBounds('tuft', .82)!
const length = (points: readonly Point[]) => points.slice(1).reduce((total, point, i) => total + Math.hypot(point.x - points[i]!.x, point.y - points[i]!.y), 0)
// The point a walk has reached after `distance` along its route.
function reached(points: readonly Point[], distance: number): Point {
  let left = distance
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, piece = Math.hypot(b.x - a.x, b.y - a.y)
    if (left <= piece && piece > 0) return { x: a.x + (b.x - a.x) * left / piece, y: a.y + (b.y - a.y) * left / piece }
    left -= piece
  }
  return points.at(-1)!
}
// A mole is behind its own row of desks while its point is above the row's front edge and its label
// under the feet would lie over one of the row's desks, which are drawn after it and cover it.
const ownRow = (layout: Layout, seat: Station) => Object.values(layout.seats)
  .filter(other => other.room === seat.room && other.desk.width > 0 && other.desk.y === seat.desk.y && other.desk.height === seat.desk.height).map(other => other.desk)
const behindOwnRow = (row: Station['desk'][], point: Point) => row.some(desk => point.y < desk.y + desk.height && overlaps(walkingPlate(point), desk))
const where = (point: Point) => `${Math.round(point.x)},${Math.round(point.y)}`

// While a mole walked behind its own row of desks, from its seat to the desk end and back, its label
// under the feet lay behind the desks, so all that showed was a sliver of it. The label waits at its
// seated place for that first stretch and leaves it as soon as the mole is clear of its row.
it('keeps a walking label at its seated place exactly while the mole leaves from behind its own row of desks', () => {
  const early: string[] = [], late: string[] = [], away: string[] = []
  let routes = 0
  for (const { name, layout, house } of rooms) {
    const desks = Object.entries(layout.seats).filter(([, seat]) => seat.room === house.group && seat.desk.width > 0) as [string, Station][]
    expect(desks.length, `${name}: desks`).toBeGreaterThan(6)
    // The middle of the room's front, and the floor before every third desk.
    const targets = [{ x: house.x + house.width / 2, y: house.y + house.height - 120 }, ...desks.filter((_, i) => i % 3 === 0).map(([, seat]) => ({ x: seat.foot.x + 40, y: seat.foot.y + 48 }))]
    for (const [from, seat] of desks) {
      const occupied = desks.filter(([key]) => key !== from).map(([, other]) => translateBody(body, atDesk(other)))
      const row = ownRow(layout, seat)
      for (const target of targets) {
        if (target.x === seat.foot.x + 40 && target.y === seat.foot.y + 48) continue
        const route = routeIdle(layout, atDesk(seat), target, occupied, from, body, [], {}, from)
        if (route.status !== 'found') continue
        routes++
        const wait = labelWait(layout, from, route.points), total = length(route.points)
        if (!(wait > 0)) { early.push(`${name}: ${from} to ${where(target)}: its label does not wait as it stands up behind its desk (${wait})`); continue }
        for (let distance = 0; distance < wait - 1; distance += 2) {
          const point = reached(route.points, distance)
          if (!behindOwnRow(row, point)) { late.push(`${name}: ${from} to ${where(target)}: its label still waits at ${Math.round(distance)} px, at ${where(point)}, where the mole is clear of its row`); break }
        }
        if (wait + 2 < total && behindOwnRow(row, reached(route.points, wait + 2))) early.push(`${name}: ${from} to ${where(target)}: its label leaves at ${Math.round(wait)} px, at ${where(reached(route.points, wait))}, while the mole is still behind its row`)
        // A walk that does not start behind its own row has no wait.
        const back = [...route.points].reverse()
        if (!behindOwnRow(row, back[0]!) && labelWait(layout, from, back) !== 0) away.push(`${name}: ${from} from ${where(target)}: a walk starting clear of its row waits ${labelWait(layout, from, back)}`)
      }
    }
  }
  expect(routes).toBeGreaterThan(60)
  expect({ early: early.length, firstEarly: early.slice(0, 3), late: late.length, firstLate: late.slice(0, 3), away: away.length, firstAway: away.slice(0, 3) })
    .toEqual({ early: 0, firstEarly: [], late: 0, firstLate: [], away: 0, firstAway: [] })
})

class Clock implements WalkClock {
  time = 0; next = 0
  frames = new Map<number, () => void>(); timers = new Map<number, { at: number; run: () => void }>()
  now() { return this.time }
  frame(run: () => void) { const id = ++this.next; this.frames.set(id, run); return id }
  cancelFrame(id: number) { this.frames.delete(id) }
  later(run: () => void, delay: number) { const id = ++this.next; this.timers.set(id, { at: this.time + delay, run }); return id }
  cancelLater(id: number) { this.timers.delete(id) }
  advance(ms: number) { this.time += ms; const frames = [...this.frames.values()]; this.frames.clear(); frames.forEach(run => run()); for (const [id, timer] of [...this.timers]) if (timer.at <= this.time) { this.timers.delete(id); timer.run() } }
}

// The way home is the way out reversed, so the label goes back to its seated place for the same
// stretch at the end of the walk home, as the mole reaches its desk end and before it goes behind.
it('says of each walker of an outing whether its label waits at its seat, for the first stretch out and the last stretch home', () => {
  const homes = { 'invented-pair-0': { x: 100, y: 100 }, 'invented-pair-1': { x: 500, y: 100 } } as Record<string, Point>
  const places = [{ x: 250, y: 400 }, { x: 350, y: 400 }]
  const routes = new Map<string, Point[]>(), waits = { 'invented-pair-0': 60, 'invented-pair-1': 90 } as Record<string, number>
  const frames: IdleActor[][] = [], clock = new Clock()
  const agents = Object.entries(homes).map(([id, foot]) => ({ id, foot, idle: true, body }))
  const motion = new IdleMotion(clock, (id, target, done, start) => {
    const points = [{ ...start! }, { x: start!.x, y: (start!.y + target.y) / 2 }, { ...target }]
    routes.set(id, points); done({ status: 'found', points })
  }, actors => frames.push(actors), () => {}, null, { preflight: true, chances: () => .1, labelWait: id => waits[id]! })
  motion.update({ enabled: true, agents, places, walkers: Object.keys(homes) })
  for (let i = 0; i < 2000 && !(frames.length > 2 && frames.at(-1)!.length === 0); i++) clock.advance(20)
  motion.dispose()
  const wrong: string[] = []
  let out = 0, home = 0
  const arrived = new Set<string>()
  for (const frame of frames) for (const actor of frame) {
    const route = routes.get(actor.id)!, wait = waits[actor.id]!
    if (Math.hypot(actor.point.x - route.at(-1)!.x, actor.point.y - route.at(-1)!.y) < 1e-6) arrived.add(actor.id)
    if (actor.phase !== 'walk') { if (actor.labelAtSeat) wrong.push(`${actor.id} ${actor.phase}s with its label at its seat`); continue }
    // How far along its way out the walker is, on the way out or on the way back.
    const back = arrived.has(actor.id), along = outDistance(route, actor.point)
    if (Math.abs(along - wait) < 1) continue
    back ? home++ : out++
    if (actor.labelAtSeat !== along < wait) wrong.push(`${actor.id}, ${back ? 'home' : 'out'} at ${Math.round(along)} px of its way out: its label ${actor.labelAtSeat ? 'waits' : 'does not wait'}, and the first ${wait} px wait`)
  }
  expect(out).toBeGreaterThan(20)
  expect(home).toBeGreaterThan(20)
  expect({ wrong: wrong.length, first: wrong.slice(0, 4) }).toEqual({ wrong: 0, first: [] })
})
// The distance along a route of a point on it.
function outDistance(points: readonly Point[], point: Point): number {
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, piece = Math.hypot(b.x - a.x, b.y - a.y)
    const t = piece ? ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (piece * piece) : 0
    if (t >= 0 && t <= 1 && Math.hypot(a.x + (b.x - a.x) * t - point.x, a.y + (b.y - a.y) * t - point.y) < 1e-6) return walked + t * piece
    walked += piece
  }
  return NaN
}
