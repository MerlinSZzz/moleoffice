// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import * as walks from '../src/walks.ts'
import { IdleMotion, onRoute, type IdleActor, type IdleAgent, type IdleInput, type WalkClock } from '../src/walks.ts'
import { bodiesOverlap, translateBody } from '../src/visual-body.ts'
import type { Point } from '../src/geometry.ts'
import type { Rect } from '../src/viewport.ts'

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
// A made-up body, drawn above its foot as a mole's is.
const body: Rect = { x: -12, y: -40, width: 24, height: 44 }
const mole = (id: string, foot: Point, known = true): IdleAgent => ({ id, foot, idle: true, ...known ? { body } : {} })
// With every number below a half, a turn takes three out when it can, in the order the moles are listed.
const inOrder = () => .1

/** One outing, run the way the page runs it: each mole has its own place and a straight route there, and
 * every frame the scheduler draws is kept until everybody is home again. */
function outing(agents: IdleAgent[], places: Record<string, Point>, walkers?: string[]) {
  const clock = new Clock(), frames: IdleActor[][] = [], asked: { id: string; target: Point }[] = []
  let motion: IdleMotion
  const turn = (): IdleInput => {
    const group = motion.selection(agents), order = walkers ?? group.map(one => one.id)
    return { enabled: true, agents, places: order.map(id => places[id]!), ...walkers ? { walkers } : {} }
  }
  motion = new IdleMotion(clock, (id, target, done, start) => { asked.push({ id, target }); done({ status: 'found', points: [start!, target] }) }, actors => frames.push(actors), () => {}, () => {}, { preflight: true, chances: inOrder })
  motion.update(turn())
  for (let i = 0; i < 400 && !(frames.length && frames.at(-1)!.length === 0); i++) clock.advance(100)
  motion.dispose()
  const walking = frames.map(actors => actors.filter(actor => actor.phase === 'walk').map(actor => actor.id))
  return { frames, walking, asked, most: Math.max(...walking.map(ids => ids.length)) }
}
/** Every two moles drawn in one frame, where their bodies meet. */
function meetings(frames: IdleActor[][]): string[] {
  return frames.flatMap((actors, n) => actors.flatMap((one, i) => actors.slice(i + 1).filter(other => bodiesOverlap(translateBody(body, one.point), translateBody(body, other.point))).map(other => `frame ${n}: ${one.id} and ${other.id}`)))
}
/** The walkers in the order they set out, each counted once for each walk. */
const setOut = (walking: string[][]) => walking.flatMap((ids, n) => ids.filter(id => !walking[n - 1]?.includes(id)))

it('walks three moles at once when no route comes near another, out and back', () => {
  const agents = [mole('invented-a', p(0, 0)), mole('invented-b', p(200, 0)), mole('invented-c', p(400, 0))]
  const { frames, walking, most } = outing(agents, { 'invented-a': p(0, 300), 'invented-b': p(200, 300), 'invented-c': p(400, 300) })
  expect(most).toBe(3)
  const together = walking.map((ids, n) => ids.length === 3 ? n : -1).filter(n => n >= 0)
  const play = frames.findIndex(actors => actors.some(actor => actor.phase === 'play'))
  // All three walk out together, play, and walk back together.
  expect(together.some(n => n < play)).toBe(true)
  expect(together.some(n => n > play)).toBe(true)
  expect(meetings(frames)).toEqual([])
  expect(frames.at(-1)).toEqual([])
})

it('walks a pair at once when their routes stay apart', () => {
  const { frames, most } = outing([mole('invented-a', p(0, 0)), mole('invented-b', p(200, 0))], { 'invented-a': p(0, 300), 'invented-b': p(200, 300) })
  expect(most).toBe(2)
  expect(meetings(frames)).toEqual([])
})

it('holds the second of two crossing routes until the first has arrived, out and back', () => {
  const routes = { 'invented-a': [p(0, 100), p(200, 100)], 'invented-b': [p(100, 0), p(100, 200)] }
  // The control: walked at the same time, the two bodies meet halfway, where the routes cross.
  expect(bodiesOverlap(translateBody(body, onRoute(routes['invented-a'], .5).point), translateBody(body, onRoute(routes['invented-b'], .5).point))).toBe(true)
  const agents = [mole('invented-a', routes['invented-a'][0]!), mole('invented-b', routes['invented-b'][0]!)]
  const { frames, walking, most } = outing(agents, { 'invented-a': routes['invented-a'][1]!, 'invented-b': routes['invented-b'][1]! })
  expect(most).toBe(1)
  // Out in order and back in reverse, one at a time.
  expect(setOut(walking)).toEqual(['invented-a', 'invented-b', 'invented-b', 'invented-a'])
  expect(meetings(frames)).toEqual([])
})

it('holds back a walker whose place lies on the route of the one before it', () => {
  // The second's place is on the first's way, and its walk is short: walked at the same time, it would be
  // standing there when the first came past.
  const agents = [mole('invented-a', p(0, 0)), mole('invented-b', p(150, 100))]
  const { frames, walking, most } = outing(agents, { 'invented-a': p(300, 0), 'invented-b': p(150, 30) })
  expect(bodiesOverlap(translateBody(body, p(150, 30)), translateBody(body, p(150, 0)))).toBe(true)
  expect(most).toBe(1)
  expect(setOut(walking)).toEqual(['invented-a', 'invented-b', 'invented-b', 'invented-a'])
  expect(meetings(frames)).toEqual([])
})

it('walks one at a time when the bodies are not known, as nothing then proves two walks apart', () => {
  const agents = [mole('invented-a', p(0, 0), false), mole('invented-b', p(200, 0), false), mole('invented-c', p(400, 0), false)]
  const { walking, most } = outing(agents, { 'invented-a': p(0, 300), 'invented-b': p(200, 300), 'invented-c': p(400, 300) })
  expect(most).toBe(1)
  expect(setOut(walking)).toEqual(['invented-a', 'invented-b', 'invented-c', 'invented-c', 'invented-b', 'invented-a'])
})

it('sends each walker to the place named for it when the page names the walkers in another order', () => {
  const agents = [mole('invented-a', p(0, 0)), mole('invented-b', p(200, 0))]
  const { asked } = outing(agents, { 'invented-a': p(0, 300), 'invented-b': p(200, 300) }, ['invented-b', 'invented-a'])
  expect(asked).toEqual([{ id: 'invented-b', target: p(200, 300) }, { id: 'invented-a', target: p(0, 300) }])
})

it('puts walkers into waves in their planned order, at most three to a wave, each wave proved apart', () => {
  const { idleWaves, walksApart, IDLE_WALKING_CAP } = walks as any
  expect(IDLE_WALKING_CAP).toBe(3)
  const down = (x: number) => ({ points: [p(x, 0), p(x, 300)], body })
  // Four routes far apart: the fourth waits, as a wave never holds more than three.
  expect(idleWaves([down(0), down(200), down(400), down(600)])).toEqual([[0, 1, 2], [3]])
  // The middle route crosses both others. The third may not go with the first, as the second was planned between them.
  const across = { points: [p(-100, 150), p(500, 150)], body }
  expect(walksApart(down(0), down(400))).toBe(true)
  expect(walksApart(down(0), across)).toBe(false)
  expect(walksApart(across, down(400))).toBe(false)
  expect(idleWaves([down(0), across, down(400)])).toEqual([[0], [1], [2]])
  expect(idleWaves([down(0), down(400), across])).toEqual([[0, 1], [2]])
  // Two routes side by side: the bodies would touch on the way, though the lines never meet.
  expect(walksApart(down(0), down(20))).toBe(false)
  // A walk with no known body is never proved apart.
  expect(walksApart(down(0), { points: down(400).points })).toBe(false)
  expect(idleWaves([down(0), { points: down(400).points }])).toEqual([[0], [1]])
})
