// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { IdleMotion, idleMotionForMap, type IdleAgent, type IdleInput, type WalkClock } from '../src/walks.ts'
import { IDLE_OUTINGS, idleOutingsOn, outingChances, seededChances } from '../src/idle-outings.ts'
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
// A small made-up body, so that some walks are proved apart and go together.
const invented = (count: number, idle = (_: number) => true): IdleAgent[] => Array.from({ length: count }, (_, i) => ({ id: `invented-${i}`, foot: p(i * 30, 0), idle: idle(i), body: { x: -4, y: -8, width: 8, height: 8 } }))

/** Runs whole outings the way the page does: on each new turn the page asks for the group and the
 * place offset, and hands back places for the walkers it was given. */
function outings(chances: (() => number) | undefined, agents: IdleAgent[], turns: number) {
  const clock = new Clock(), seen: { group: string[]; offset: number }[] = [], snapshots: any[][] = []
  let motion: IdleMotion
  // Called once at the start and once on each new turn, as the page's cycle is.
  const turn = (): IdleInput => {
    const group = motion.selection(agents)
    seen.push({ group: group.map(agent => agent.id), offset: motion.destinationOffset })
    return { enabled: true, agents, places: group.map((_, i) => p(group[0]!.foot.x + 100 + i * 160, 200)) }
  }
  motion = new IdleMotion(clock, (_id, target, done, start) => done({ status: 'found', points: [start!, target] }), actors => snapshots.push(actors), () => {}, () => motion.update(turn()), { preflight: true, chances })
  motion.update(turn())
  for (let i = 0; i < turns * 200 && seen.length < turns; i++) clock.advance(500)
  motion.dispose()
  return { seen: seen.slice(0, turns), snapshots }
}

it('ships with idle outings on, and only the screen-test switch turns them off', () => {
  expect(IDLE_OUTINGS).toBe(true)
  expect(idleOutingsOn(undefined)).toBe(true)
  expect(idleOutingsOn({})).toBe(true)
  expect(idleOutingsOn({ idleOutings: true })).toBe(true)
  expect(idleOutingsOn({ idleOutings: false })).toBe(false)
})

it('repeats the same groups and places for the same seed, and others for another seed', () => {
  const agents = invented(6)
  const first = outings(seededChances(11), agents, 12).seen, again = outings(seededChances(11), agents, 12).seen, other = outings(seededChances(12), agents, 12).seen
  expect(first).toHaveLength(12)
  expect(again).toEqual(first)
  expect(other).not.toEqual(first)
})

it('groups every idle mole with many partners, in twos and threes, never a working one, rather than a fixed rotation', () => {
  const agents = invented(7, i => i !== 6), { seen } = outings(seededChances(5), agents, 40)
  expect(seen).toHaveLength(40)
  const groups = new Set(seen.map(turn => [...turn.group].sort().join('+'))), walkers = new Set(seen.flatMap(turn => turn.group))
  expect([...walkers].sort()).toEqual(['invented-0', 'invented-1', 'invented-2', 'invented-3', 'invented-4', 'invented-5'])
  // A rotation through six moles only ever makes three pairs.
  expect(groups.size).toBeGreaterThanOrEqual(8)
  expect(seen.every(turn => new Set(turn.group).size === turn.group.length)).toBe(true)
  expect(new Set(seen.map(turn => turn.group.length))).toEqual(new Set([2, 3]))
  expect(new Set(seen.map(turn => turn.offset % 3)).size).toBe(3)
})

it('keeps one group and one place offset for the whole of a turn', () => {
  const motion = new IdleMotion(new Clock(), () => {}, () => {}, () => {}, null, { preflight: true, chances: seededChances(3) }), agents = invented(9)
  const group = motion.selection(agents), offset = motion.destinationOffset
  for (let i = 0; i < 5; i++) {
    expect(motion.selection(agents)).toEqual(group)
    expect(motion.destinationOffset).toBe(offset)
  }
  expect(motion.selection(invented(1))).toHaveLength(1)
  expect(motion.selection(invented(3, () => false))).toEqual([])
})

it('builds the map scheduler with the chances it is given', () => {
  const agents = invented(5)
  const last = idleMotionForMap(new Clock(), () => {}, () => {}, () => {}, null, () => {}, () => .99)
  expect(last.selection(agents)[0]!.id).toBe('invented-4')
  const rotation = idleMotionForMap(new Clock(), () => {}, () => {}, () => {}, null, () => {})
  expect(rotation.selection(agents).map(agent => agent.id)).toEqual(['invented-0', 'invented-1'])
})

it('keeps at most three moles out and three walking in an office of fourteen, ten of them idle, and walks several at once', () => {
  const { seen, snapshots } = outings(seededChances(29), invented(14, i => i % 7 > 1), 30)
  expect(seen).toHaveLength(30)
  expect(new Set(seen.flatMap(turn => turn.group))).toEqual(new Set(invented(14).filter((_, i) => i % 7 > 1).map(agent => agent.id)))
  const walking = snapshots.map(actors => actors.filter(actor => actor.phase === 'walk').length)
  expect(snapshots.every(actors => actors.length <= 3)).toBe(true)
  expect(Math.max(...walking)).toBeLessThanOrEqual(3)
  expect(Math.max(...walking)).toBeGreaterThanOrEqual(2)
  expect(snapshots.some(actors => actors.length === 3)).toBe(true)
  expect(snapshots.some(actors => actors.some(actor => actor.phase === 'play'))).toBe(true)
})

it('draws from a fixed sequence for a seed and from the browser otherwise', () => {
  const a = seededChances(42), b = seededChances(42), values = Array.from({ length: 200 }, () => a())
  expect(values).toEqual(Array.from({ length: 200 }, () => b()))
  expect(values.every(value => value >= 0 && value < 1)).toBe(true)
  expect(new Set(values).size).toBe(200)
  const seeded = outingChances(42)
  expect(Array.from({ length: 5 }, () => seeded())).toEqual(values.slice(0, 5))
  expect(outingChances(undefined)).toBe(Math.random)
  expect(outingChances(1.5)).toBe(Math.random)
})
