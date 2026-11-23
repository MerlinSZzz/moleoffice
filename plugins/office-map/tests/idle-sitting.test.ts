// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { outingChances, seededChances, sittingChances } from '../src/idle-outings.ts'
import { moleSprite } from '../src/mole-state.ts'
import { IdleMotion, type IdleActor, type IdleAgent, type IdleInput, type WalkClock } from '../src/walks.ts'

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
const agents = (n: number): IdleAgent[] => Array.from({ length: n }, (_, i) => ({ id: `made-up-${i}`, foot: { x: i * 80, y: 0 }, idle: true, body: { x: -12, y: -40, width: 24, height: 44 } }))
function outing(count: number, { paper = false, sittingReady = true, sit = .1 } = {}) {
  const clock = new Clock(), group = agents(count), frames: IdleActor[][] = []
  const places = group.map((_, i) => ({ x: i * 80, y: 100 }))
  let choices = 0
  const motion = new IdleMotion(clock, (_id, target, done, start) => done({ status: 'found', points: [start!, target] }), actors => frames.push(actors), () => {}, null,
    { preflight: true, chances: () => .1, sitChances: () => { choices++; return sit } })
  const input: IdleInput = { enabled: true, agents: group, places, paper, sittingReady }
  motion.update(input); clock.advance(2000)
  return { clock, motion, frames, places, choices: () => choices }
}

it('sits a prepared pair at its meeting places for the three poses, then walks home', () => {
  const { clock, motion, places, choices } = outing(2)
  let pair = motion.snapshot().points
  expect(pair.map(one => one.phase)).toEqual(['sit', 'sit'])
  expect(pair.map(one => one.point)).toEqual(places)
  expect(pair.map(one => one.facing)).toEqual([1, -1])
  const sprite = (one: IdleActor) => moleSprite('tuft', [], false, { id: one.id, from: one.id, to: one.partner, point: one.point, elapsed: one.elapsed, facing: one.facing, phase: one.phase })
  expect(pair.map(sprite)).toEqual(['sit-tuft-down', 'sit-tuft-down'])
  const facing = () => expect(motion.snapshot().points.map(one => one.facing)).toEqual([1, -1])
  clock.advance(299); facing(); expect(motion.snapshot().points.map(sprite)).toEqual(['sit-tuft-down', 'sit-tuft-down'])
  clock.advance(1); facing(); expect(motion.snapshot().points.map(sprite)).toEqual(['sit-tuft', 'sit-tuft'])
  clock.advance(8999); facing(); expect(motion.snapshot().points.map(sprite)).toEqual(['sit-tuft', 'sit-tuft'])
  clock.advance(1); facing(); expect(motion.snapshot().points.map(sprite)).toEqual(['sit-tuft-up', 'sit-tuft-up'])
  clock.advance(299); facing(); expect(motion.snapshot().points.map(sprite)).toEqual(['sit-tuft-up', 'sit-tuft-up'])
  clock.advance(1); pair = motion.snapshot().points; expect(pair.every(one => one.phase === 'walk')).toBe(true)
  clock.advance(2000); expect(motion.snapshot().points).toEqual([])
  expect(choices()).toBe(1)
  motion.dispose()
})

it('keeps three-mole outings, unprepared pairs and the other half of pairs playing', () => {
  for (const [count, options] of [[3, {}], [2, { sittingReady: false }], [2, { sit: .9 }]] as const) {
    const { clock, motion } = outing(count, options)
    expect(motion.snapshot().points.every(one => one.phase === 'play')).toBe(true)
    clock.advance(6000); expect(motion.snapshot().points.every(one => one.phase === 'walk')).toBe(true)
    motion.dispose()
  }
})

it('sits without paper when the pair chooses sitting, and otherwise plays with paper', () => {
  const sitting = outing(2, { paper: true, sit: .1 })
  expect(sitting.motion.snapshot().points.every(one => one.phase === 'sit' && !one.paper)).toBe(true)
  sitting.motion.dispose()
  const playing = outing(2, { paper: true, sit: .9 })
  expect(playing.motion.snapshot().points.every(one => one.phase === 'play' && one.paper)).toBe(true)
  playing.motion.dispose()
})

it('draws a sitting choice on its own sequence without moving the seeded group or destination draws', () => {
  function sequence(withSitting: boolean) {
    const clock = new Clock(), group = agents(5), choices = seededChances(9182), sitChoices = seededChances(9182)
    const motion = new IdleMotion(clock, () => {}, () => {}, () => {}, null, { chances: choices, ...(withSitting ? { sitChances: sitChoices } : {}) })
    const before = motion.selection(group).map(one => one.id), offset = motion.destinationOffset
    if (withSitting) void motion.wantsToSit
    motion.update({ enabled: true, agents: group, places: [], sittingReady: withSitting })
    const after = motion.selection(group).map(one => one.id), nextOffset = motion.destinationOffset
    motion.dispose(); return { before, after, offset, nextOffset, next: choices() }
  }
  expect(sequence(true)).toEqual(sequence(false))
})

it('lets some seeded first-turn pairs sit when four moles are eligible', () => {
  let sitting = 0, playing = 0
  for (let seed = 0; seed < 100; seed++) {
    const motion = new IdleMotion(new Clock(), () => {}, () => {}, () => {}, null,
      { chances: outingChances(seed), sitChances: sittingChances(seed) })
    if (motion.selection(agents(4)).length === 2) {
      if (motion.wantsToSit) sitting++; else playing++
    }
    motion.dispose()
  }
  expect(sitting).toBeGreaterThan(0)
  expect(playing).toBeGreaterThan(0)
})
