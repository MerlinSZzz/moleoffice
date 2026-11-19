// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import type { Point, Route } from '../src/geometry.ts'
import { OfficeMap } from '../src/map-view.ts'
import { IdleMotion, type WalkClock } from '../src/walks.ts'
import catalog from '../assets/village-catalog.json'

class Clock implements WalkClock {
  time = 0; next = 0
  frames = new Map<number, () => void>(); timers = new Map<number, { at: number; run: () => void }>()
  now() { return this.time }
  frame(run: () => void) { const id = ++this.next; this.frames.set(id, run); return id }
  cancelFrame(id: number) { this.frames.delete(id) }
  later(run: () => void, delay: number) { const id = ++this.next; this.timers.set(id, { at: this.time + delay, run }); return id }
  cancelLater(id: number) { this.timers.delete(id) }
  advance(ms: number) {
    this.time += ms
    const frames = [...this.frames.values()]; this.frames.clear(); frames.forEach(run => run())
    for (const [id, timer] of [...this.timers]) if (timer.at <= this.time) { this.timers.delete(id); timer.run() }
  }
}
const point = (x: number, y: number): Point => ({ x, y })
const sprites: any = catalog.sprites, paperAtlas = sprites['paper-stack'].atlas
/** Draw one play actor through the real actor painter and report every image it drew. */
const drawnImages = (paper: boolean): any[] => {
  const key = 'invented-play', at = point(100, 100), calls: any[] = []
  const ctx: any = { save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, drawImage(...args: any[]) { calls.push(args) } }
  const occupant: any = { key, agent: { id: key, name: 'Invented', handle: 'invented', retired: false, projects: [] }, standing: { look: 'tuft' }, work: [], facts: null }
  const images = new Map(Object.keys(catalog.atlases).map(atlas => [atlas, { key: atlas }]))
  const view: any = { occupants: new Map([[key, occupant]]), drawnScale: () => 1, whereaboutsByKey: new Map([[key, { where: 'play' }]]), individuals: true, layout: { seats: {}, ownership: false }, options: { still: true, wave: null, workAvailable: true }, actions: { draw: () => false }, pack: { sources: { sprites }, images }, lookFrames: { draw: () => false } }
  ;(OfficeMap.prototype as any).actor.call(view, ctx, key, at, { id: 'invented-play', from: key, to: 'invented-other', point: at, elapsed: 600, facing: 1, phase: 'play', paper })
  return calls
}
const drawsPaper = (paper: boolean): boolean => drawnImages(paper).some(args => args[0]?.key === paperAtlas)

it('keeps an outing and its paper through a page update that is not ready yet', () => {
  const clock = new Clock(), requests: { id: string; target: Point; done: (route: Route | null) => void }[] = [], frames: any[][] = []
  const motion = new IdleMotion(clock, (id, target, done) => requests.push({ id, target, done }), actors => frames.push(actors))
  const agents = [{ id: 'invented-a', foot: point(20, 20), idle: true }, { id: 'invented-b', foot: point(180, 20), idle: true }]
  const places = [point(80, 100), point(120, 100)]
  motion.update({ enabled: true, agents, places, paper: true })
  for (let tick = 0; tick < 300; tick++) {
    while (requests.length) {
      const request = requests.shift()!, from = agents.find(agent => agent.id === request.id)!.foot
      request.done({ status: 'found', points: [from, request.target] })
    }
    clock.advance(100)
    if ((frames.at(-1) ?? []).filter(actor => actor.phase === 'play').length === 2) break
  }
  expect((frames.at(-1) ?? []).filter(actor => actor.phase === 'play')).toHaveLength(2)
  expect((frames.at(-1) ?? []).every(actor => actor.paper)).toBe(true)
  expect(drawsPaper(true), 'the paper sprite is drawn for a paper play actor').toBe(true)
  expect(drawsPaper(false), 'no paper sprite is drawn without the paper flag').toBe(false)

  // A page update while the pair is playing can arrive before the scene is ready
  // again. It carries no places and no refusal, so it says "wait", not "stop",
  // and it must not replace the pair's paper flag with its own paper:false.
  motion.update({ enabled: true, agents, places: [], paper: false })
  expect(motion.snapshot().active).toBe(2)
  clock.advance(100)
  const waiting = frames.at(-1) ?? []
  expect(waiting.filter(actor => actor.phase === 'play')).toHaveLength(2)
  expect(waiting.every(actor => actor.paper), 'the pair keeps the paper through the not-ready update').toBe(true)
  expect(drawsPaper(waiting[0]!.paper), 'the kept pair draws the paper after the not-ready update').toBe(true)

  // The next ready update changes the places, so it does not return at the
  // signature check. The pair starts the new outing and still keeps its paper.
  const changedPlaces = [point(90, 100), point(130, 100)]
  motion.update({ enabled: true, agents, places: changedPlaces, paper: true })
  for (let tick = 0; tick < 300; tick++) {
    while (requests.length) {
      const request = requests.shift()!, from = agents.find(agent => agent.id === request.id)!.foot
      request.done({ status: 'found', points: [from, request.target] })
    }
    clock.advance(100)
    if ((frames.at(-1) ?? []).filter(actor => actor.phase === 'play').length === 2) break
  }
  const ready = frames.at(-1) ?? []
  expect(ready.filter(actor => actor.phase === 'play')).toHaveLength(2)
  expect(ready.map(actor => actor.point)).toEqual(changedPlaces)
  expect(ready.every(actor => actor.paper)).toBe(true)
  expect(drawsPaper(ready[0]!.paper), 'the play actor draws the paper after the changed ready update').toBe(true)

  // A real stop still stops the pair.
  motion.update({ enabled: false, agents, places: [] })
  expect(motion.snapshot().active).toBe(0)
  motion.dispose()
})
