// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { routeIdle, type Point } from '../src/geometry.ts'
import { IdleMotion, type IdleActor, type IdleInput, type WalkClock } from '../src/walks.ts'
import { bodiesOverlap, sweptBodyHits, translateBody } from '../src/visual-body.ts'

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

it('walks three at once on routes found by the real router and keeps their bodies apart', () => {
  const layout: any = { key: 'made-up', bounds: { x: 0, y: 0, width: 900, height: 900 }, square: { x: 0, y: 0, width: 900, height: 900 }, rooms: [], houses: [], pieces: [], seats: {}, obstacles: [], road: { rings: [], ends: [], faults: [], halfWidth: 20 }, bodyRadius: 8 }
  const body = { x: -12, y: -40, width: 24, height: 44 }
  const agents = [120, 360, 600].map((x, i) => ({ id: `made-up-${i}`, foot: { x, y: 120 }, idle: true, body }))
  const places = agents.map(one => ({ x: one.foot.x, y: 600 }))
  const frames: IdleActor[][] = [], routes: Point[][] = [], clock = new Clock()
  let cycles = 0
  let motion: IdleMotion
  const input = (): IdleInput => ({ enabled: true, agents, places, walkers: agents.map(one => one.id) })
  motion = new IdleMotion(clock, (id, target, done, start, standing) => {
    const occupied = agents.filter(one => one.id !== id).map(one => translateBody(body, one.foot))
    occupied.push(...(standing ?? []).map(one => translateBody(body, one.point)))
    const result = routeIdle(layout, start!, target, occupied, id, body, [])
    expect(result.status).toBe('found')
    for (let i = 1; i < result.points.length; i++) for (const other of occupied) expect(sweptBodyHits(result.points[i - 1]!, result.points[i]!, body, other)).toBe(false)
    routes.push(result.points); done(result)
  }, actors => frames.push(actors), () => {}, () => { cycles++ }, { preflight: true, chances: () => .1 })
  motion.update(input())
  for (let i = 0; i < 600 && !(frames.length && frames.at(-1)!.length === 0); i++) clock.advance(100)
  expect(routes.length).toBeGreaterThanOrEqual(3)
  expect(frames.some(frame => frame.filter(one => one.phase === 'walk').length === 3)).toBe(true)
  expect(frames.some(frame => frame.some(one => one.phase === 'play'))).toBe(true)
  expect(frames.at(-1)).toEqual([])
  for (const frame of frames) for (let i = 0; i < frame.length; i++) for (const other of frame.slice(i + 1)) {
    expect(bodiesOverlap(translateBody(body, frame[i]!.point), translateBody(body, other.point))).toBe(false)
  }
  clock.advance(11999)
  expect(cycles).toBe(0)
  clock.advance(1)
  expect(cycles).toBe(1)
  motion.dispose()
})
