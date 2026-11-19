// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import {
  ContactWalks, IdleMotion, idleMotionForMap, DEFAULT_MOLE_SCALE, WALK_PIXELS_PER_SECOND,
  along, gaitFrame, type MovingContact, type WalkClock,
} from '../src/walks.ts'
import { standingScale } from '../src/appearance.ts'
import type { ContactBatch } from '../src/bridge.ts'
import type { Point, Route } from '../src/geometry.ts'

class Clock implements WalkClock {
  time = 0; id = 0
  frames = new Map<number, () => void>(); timers = new Map<number, { at: number; fn: () => void }>()
  now() { return this.time }
  frame(fn: () => void) { const id = ++this.id; this.frames.set(id, fn); return id }
  cancelFrame(id: number) { this.frames.delete(id) }
  later(fn: () => void, delay: number) { const id = ++this.id; this.timers.set(id, { at: this.time + delay, fn }); return id }
  cancelLater(id: number) { this.timers.delete(id) }
  advance(ms: number) {
    this.time += ms
    const frames = [...this.frames.values()]; this.frames.clear(); frames.forEach(fn => fn())
    for (const [id, timer] of [...this.timers]) if (timer.at <= this.time) { this.timers.delete(id); timer.fn() }
  }
}

const point = (x: number, y: number): Point => ({ x, y })
const routeLength = (points: readonly Point[]): number => points.slice(1).reduce((total, p, i) => total + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0)
const contactBatch = (clock: Clock): ContactBatch => ({
  sequence: 1, receivedAt: clock.now(), withdrawn: [], messages: [{
    id: 'invented-contact', at: 'invented', project: 'invented',
    from: { kind: 'agent', id: 'invented-from' }, to: [{ kind: 'agent', id: 'invented-to' }],
  }],
})

function contactWalk(clock: Clock, route: Route, actorScale?: (key: string) => number): { walks: ContactWalks; draws: MovingContact[][] } {
  let done: ((route: Route | null) => void) | null = null
  const draws: MovingContact[][] = []
  const walks = new ContactWalks(clock, () => true, (_from, _to, reply) => { done = reply }, points => draws.push(points), () => true, () => {}, 1, actorScale)
  walks.setEnabled(true)
  walks.accept(contactBatch(clock))
  done!(route)
  return { walks, draws }
}

const expectedPoint = (route: Route, milliseconds: number, scale: number): Point =>
  along(route.points, WALK_PIXELS_PER_SECOND * scale * milliseconds / 1000 / routeLength(route.points))

it('moves a contact walk at the approved speed times the drawn scale', () => {
  const clock = new Clock(), scale = standingScale(1.6)
  const route: Route = { status: 'found', points: [point(0, 0), point(160, 0), point(160, 160)] }
  const { draws } = contactWalk(clock, route, () => scale)
  clock.advance(1000)
  const at = expectedPoint(route, 1000, scale), drawn = draws.at(-1)![0]!.point
  expect(drawn.x).toBeCloseTo(at.x)
  expect(drawn.y).toBeCloseTo(at.y)
})

it.each([
  ['a plain route', false],
  ['the preflight route', true],
])('moves an idle walk at the approved speed times the drawn scale through %s', (_name, preflight) => {
  const clock = new Clock(), scale = standingScale(1.6)
  const route: Route = { status: 'found', points: [point(0, 0), point(200, 0)] }
  const frames: { id: string; point: Point }[][] = []
  const request = (_id: string, _target: Point, done: (route: Route | null) => void, start?: Point) =>
    done({ status: 'found', points: [start!, point(200, 0)] })
  const changed = (actors: { id: string; point: Point }[]) => frames.push(actors)
  const motion = preflight ? idleMotionForMap(clock, request, changed, () => {}, null, () => {}) : new IdleMotion(clock, request, changed)
  motion.update({ enabled: true, agents: [{ id: 'invented-idle', foot: point(0, 0), idle: true, scale }], places: [point(200, 0)] })
  clock.advance(1000)
  const at = expectedPoint(route, 1000, scale), drawn = frames.at(-1)![0]!.point
  expect(drawn.x).toBeCloseTo(at.x)
  expect(drawn.y).toBeCloseTo(at.y)
  motion.dispose()
})

it('keeps a long contact walk running at the approved speed past the old six second cap', () => {
  const clock = new Clock()
  const route: Route = { status: 'found', points: [point(0, 0), point(800, 0)] }
  const { walks, draws } = contactWalk(clock, route)
  clock.advance(7000)
  expect(walks.snapshot().points).toHaveLength(1)
  const at = expectedPoint(route, 7000, DEFAULT_MOLE_SCALE), drawn = draws.at(-1)![0]!.point
  expect(drawn.x).toBeCloseTo(at.x)
  expect(drawn.y).toBeCloseTo(at.y)
})

it('holds each gait drawing for 200 ms', () => {
  expect([0, 199].map(gaitFrame)).toEqual(['A', 'A'])
  expect([200, 399].map(gaitFrame)).toEqual(['pass', 'pass'])
  expect([400, 599].map(gaitFrame)).toEqual(['B', 'B'])
  expect([600, 799].map(gaitFrame)).toEqual(['pass', 'pass'])
  expect(gaitFrame(800)).toBe('A')
})
