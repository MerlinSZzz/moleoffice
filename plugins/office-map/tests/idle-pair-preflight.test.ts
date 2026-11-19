// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import * as walks from '../src/walks.ts'
import { IdleMotion, type WalkClock } from '../src/walks.ts'
import type { Point, Route } from '../src/geometry.ts'

it('leaves both invented participants at home and records a refusal before any motion', () => {
  let scheduledFrames = 0
  const clock: WalkClock = { now: () => 0, frame: () => ++scheduledFrames, cancelFrame: () => {}, later: () => 1, cancelLater: () => {} }
  const requests: { id: string; target: Point; start: Point; done: (route: Route | null) => void }[] = [], failures: string[] = []
  const frames: any[][] = []
  const motion = new (IdleMotion as any)(clock, (id: string, target: Point, done: (route: Route | null) => void, start: Point) => requests.push({ id, target, start, done }), (actors: any[]) => frames.push(actors), () => {}, null, { preflight: true, failure: (reason: string) => failures.push(reason) })
  motion.update({ enabled: true, agents: [{ id: 'invented-one', foot: { x: 20, y: 20 }, idle: true }, { id: 'invented-two', foot: { x: 180, y: 20 }, idle: true }], places: [{ x: 80, y: 100 }, { x: 240, y: 100 }] })
  const first = requests.shift()!
  first.done({ status: 'found', points: [first.start, first.target] })
  expect(scheduledFrames).toBe(0)
  expect(requests).toHaveLength(1)
  const second = requests.shift()!
  second.done({ status: 'no-path', points: [] })
  expect(scheduledFrames).toBe(0)
  expect(frames.flat().some(actor => actor.phase === 'walk')).toBe(false)
  expect(failures).toEqual(['no-path'])
  motion.dispose()
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
const p = (x: number, y: number): Point => ({ x, y })
const pair = [{ id: 'invented-one', foot: p(20, 20), idle: true }, { id: 'invented-two', foot: p(180, 20), idle: true }]

it('plans the second route with the first standing at its place, then walks both planned routes out and back without searching again', () => {
  const clock = new Clock(), requests: { id: string; target: Point; start: Point; standing: unknown; done: (route: Route | null) => void }[] = [], frames: any[][] = [], failures: string[] = []
  const motion = (walks as any).idleMotionForMap(clock, (id: string, target: Point, done: (route: Route | null) => void, start: Point, standing: unknown) => requests.push({ id, target, start, standing, done }), (actors: any[]) => frames.push(actors), () => {}, null, (reason: string) => failures.push(reason))
  motion.update({ enabled: true, agents: pair, places: [p(80, 100), p(240, 100)] })
  const first = requests.shift()!
  expect(first).toMatchObject({ id: 'invented-one', start: p(20, 20), target: p(80, 100) })
  const firstRoute = [p(20, 20), p(20, 100), p(80, 100)], secondRoute = [p(180, 20), p(240, 20), p(240, 100)]
  first.done({ status: 'found', points: firstRoute })
  expect(frames.flat().some(actor => actor.phase === 'walk')).toBe(false)
  const second = requests.shift()!
  expect(second).toMatchObject({ id: 'invented-two', start: p(180, 20), target: p(240, 100), standing: [{ id: 'invented-one', point: p(80, 100) }] })
  expect(frames.flat().some(actor => actor.phase === 'walk')).toBe(false)
  second.done({ status: 'found', points: secondRoute })
  for (let i = 0; i < 200 && (frames.at(-1)?.length ?? 0) > 0; i++) clock.advance(250)
  expect(requests).toHaveLength(0)
  expect(failures).toEqual([])
  // A frame with nobody walking separates one walk from the next.
  const walking = frames.map(actors => actors.filter(actor => actor.phase === 'walk').map(actor => actor.id).join(','))
  expect(walking.every(ids => !ids.includes(','))).toBe(true)
  // Out in order, back in reverse order: the second returns first.
  expect([...new Set(walking.filter(Boolean))]).toEqual(['invented-one', 'invented-two'])
  const order = walking.filter((id, i) => id && id !== walking[i - 1])
  expect(order).toEqual(['invented-one', 'invented-two', 'invented-two', 'invented-one'])
  // The return follows the planned route reversed: it passes its middle corner.
  const back = frames.slice(frames.findIndex(actors => actors.some(actor => actor.phase === 'play'))).flat().filter(actor => actor.id === 'invented-one' && actor.phase === 'walk')
  expect(back.length).toBeGreaterThan(0)
  expect(back.some(actor => actor.point.x === 20 && actor.point.y > 20 && actor.point.y < 100)).toBe(true)
  expect(frames.at(-1)).toEqual([])
  motion.dispose()
})

it('records a refusal when no near place exists, moves nobody, and tries the next pair after the rest', () => {
  const clock = new Clock(), requests: string[] = [], failures: string[] = []
  let cycles = 0
  const motion = (walks as any).idleMotionForMap(clock, (id: string) => requests.push(id), () => {}, () => {}, () => { cycles++ }, (reason: string) => failures.push(reason))
  motion.update({ enabled: true, agents: [...pair, { id: 'invented-three', foot: p(340, 20), idle: true }], places: [], refusal: 'no-place' })
  expect(requests).toEqual([])
  expect(failures).toEqual(['no-place'])
  expect(motion.snapshot()).toMatchObject({ refusal: { reason: 'no-place', ids: ['invented-one', 'invented-two'] } })
  expect(motion.destinationOffset).toBe(0)
  clock.advance(12000)
  expect(cycles).toBe(1)
  expect(motion.selection([...pair, { id: 'invented-three', foot: p(340, 20), idle: true }]).map((agent: any) => agent.id)).toEqual(['invented-three', 'invented-one'])
  motion.dispose()
})

it('sends one participant of the pair alone when only that one has a near place', () => {
  const clock = new Clock(), requests: { id: string; done: (route: Route | null) => void; start: Point; target: Point }[] = [], frames: any[][] = []
  const motion = (walks as any).idleMotionForMap(clock, (id: string, target: Point, done: (route: Route | null) => void, start: Point) => requests.push({ id, done, start, target }), (actors: any[]) => frames.push(actors), () => {}, null, () => {})
  motion.update({ enabled: true, agents: pair, places: [p(260, 120)], walkers: ['invented-two'] })
  expect(requests.map(r => r.id)).toEqual(['invented-two'])
  requests[0]!.done({ status: 'found', points: [p(180, 20), p(260, 120)] })
  for (let i = 0; i < 20; i++) clock.advance(250)
  expect(requests).toHaveLength(1)
  expect(new Set(frames.flat().map(actor => actor.id))).toEqual(new Set(['invented-two']))
  expect(frames.flat().every(actor => actor.partner === '' && actor.phase !== 'play')).toBe(true)
  motion.dispose()
})

it('reserves a planned standing place and the home it was left from', () => {
  const body = { x: -10, y: -10, width: 20, height: 20 }
  const rows = [{ id: 'invented-one', home: p(20, 20), current: p(20, 20), body }, { id: 'invented-two', home: p(180, 20), current: p(180, 20), body }]
  expect((walks.occupiedBodies as any)(rows, 'invented-two', [{ id: 'invented-one', point: p(80, 100) }])).toEqual([{ x: 70, y: 90, width: 20, height: 20 }, { x: 10, y: 10, width: 20, height: 20 }])
})
