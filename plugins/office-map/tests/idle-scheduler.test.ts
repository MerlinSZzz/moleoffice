// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { IdleMotion, chooseIdlePlaces, type WalkClock } from '../src/walks.ts'
import type { Point } from '../src/geometry.ts'

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
const p = (x: number, y: number): Point => ({ x, y })

it('walks a lone eligible agent out and safely back without a pretend partner', () => {
  const clock = new Clock(), routes: { id: string; start: Point; target: Point }[] = [], seen: any[][] = []
  const motion = new IdleMotion(clock, (id, target, done, start) => { routes.push({ id, start: start!, target }); done({ status: 'found', points: [start!, target] }) }, actors => seen.push(actors))
  motion.update({ enabled: true, agents: [{ id: 'invented-one', foot: p(0, 0), idle: true }], places: [p(100, 100)] })
  for (let i = 0; i < 80; i++) clock.advance(500)
  expect(routes.length).toBeGreaterThanOrEqual(2)
  expect(routes[0]).toEqual({ id: 'invented-one', start: p(0, 0), target: p(100, 100) })
  expect(routes[1]).toEqual({ id: 'invented-one', start: p(100, 100), target: p(0, 0) })
  expect(seen.flat().some(actor => actor.phase === 'walk')).toBe(true)
  expect(seen.flat().every(actor => !actor.partner && actor.phase !== 'play')).toBe(true)
  motion.dispose()
})

it('rotates eligible participants over successive outings while keeping one moving body', () => {
  const clock = new Clock(), walkers = new Set<string>(), snapshots: any[][] = []
  const motion = new IdleMotion(clock, (id, target, done, start) => { walkers.add(id); done({ status: 'found', points: [start!, target] }) }, actors => snapshots.push(actors))
  motion.update({ enabled: true, agents: Array.from({ length: 5 }, (_, i) => ({ id: `invented-${i}`, foot: p(i * 30, 0), idle: i !== 4 })), places: [p(100, 100), p(196, 100)] })
  for (let i = 0; i < 300; i++) clock.advance(500)
  expect([...walkers].sort()).toEqual(['invented-0', 'invented-1', 'invented-2', 'invented-3'])
  expect(snapshots.every(actors => actors.filter(actor => actor.phase === 'walk').length <= 1)).toBe(true)
  motion.dispose()
})

it('rotates among clear destination pairs', () => {
  const body = { x: -10, y: -10, width: 20, height: 20 }, places = [p(40, 40), p(240, 40), p(440, 40)]
  expect((chooseIdlePlaces as any)(places, [], () => true, [body, body], 0)).toEqual([p(40, 40), p(136, 40)])
  expect((chooseIdlePlaces as any)(places, [], () => true, [body, body], 1)).toEqual([p(240, 40), p(336, 40)])
})
