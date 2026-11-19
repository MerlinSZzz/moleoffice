// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { ContactWalks, along, DEFAULT_MOLE_SCALE, WALK_PIXELS_PER_SECOND, type WalkClock, type MovingContact } from '../src/walks.ts'
import type { ContactBatch } from '../src/bridge.ts'
import type { Route } from '../src/geometry.ts'

class Clock implements WalkClock {
  time = 1000; id = 0
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
function fixture() {
  const clock = new Clock(), done: ((route: Route | null) => void)[] = [], draws: MovingContact[][] = []
  const allowed = new Set(Array.from({ length: 200 }, (_, i) => JSON.stringify(['agent', String(i)])))
  let cancelled = 0
  const missed: [string, string][] = []
  const walks = new ContactWalks(clock, key => allowed.has(key), (_from, _to, fn) => done.push(fn), points => draws.push(points), () => true, () => { cancelled++ }, undefined, undefined, (from, to) => missed.push([from, to]))
  let sequence = 0
  const batch = (count = 1, patch: Partial<ContactBatch> = {}): ContactBatch => ({
    sequence: ++sequence, receivedAt: clock.now(), withdrawn: [], messages: Array.from({ length: count }, (_, i) => ({
      id: `${sequence}-${i}`, at: '2026-01-01 10:00:00', project: 'garden', from: { kind: 'agent', id: String(i * 2) }, to: [{ kind: 'agent', id: String(i * 2 + 1) }],
    })), ...patch,
  })
  const found: Route = { status: 'found', points: [{ x: 0, y: 0 }, { x: 160, y: 0 }, { x: 160, y: 160 }] }
  walks.setEnabled(true)
  return { clock, walks, done, draws, allowed, batch, found, missed, cancelled: () => cancelled }
}
describe('bounded cosmetic contact lifecycle', () => {
  it('caps active gestures at four and queue at sixteen while routes are slow', () => {
    const f = fixture(); f.walks.accept(f.batch(80))
    expect(f.walks.snapshot()).toMatchObject({ active: 4, queued: 16, frame: false, expiry: true })
    expect(f.done).toHaveLength(1); expect(f.clock.frames.size).toBe(0)
    f.done.shift()!(f.found)
    expect(f.walks.snapshot().frame).toBe(true); expect(f.done).toHaveLength(1)
    f.done.shift()!(f.found); f.done.shift()!(f.found); f.done.shift()!(f.found)
    expect(f.walks.snapshot()).toMatchObject({ active: 4, queued: 16 })
    expect(f.clock.frames.size).toBe(1)
  })
  it('expires queued and routing gestures fifteen seconds after receipt, without route replies', () => {
    const f = fixture(); f.walks.accept(f.batch(80)); f.clock.advance(14999)
    expect(f.walks.snapshot().active).toBe(4)
    f.clock.advance(1)
    expect(f.walks.snapshot()).toMatchObject({ active: 0, queued: 0, frame: false, expiry: false, points: [] })
    expect(f.cancelled()).toBe(1)
    f.done.shift()!(f.found)
    expect(f.clock.frames.size).toBe(0); expect(f.clock.timers.size).toBe(0)
    expect(f.cancelled()).toBe(1)
  })
  it('counts a delayed batch age from receipt rather than when the page finally consumes it', () => {
    const f = fixture(), batch = f.batch(); f.clock.advance(15000); f.walks.accept(batch)
    expect(f.walks.snapshot().active).toBe(0); expect(f.done).toHaveLength(0)
  })
  it.each(['idle', 'hidden', 'off', 'quiet', 'reduced motion', 'unmount'])('%s cancels every frame and timer and rejects late routes', state => {
    const f = fixture(); f.walks.accept(f.batch(8)); f.done.shift()!(f.found)
    expect(f.clock.frames.size).toBe(1)
    if (state === 'unmount') f.walks.dispose(); else f.walks.setEnabled(false)
    expect(f.clock.frames.size).toBe(0); expect(f.clock.timers.size).toBe(0)
    expect(f.cancelled()).toBe(1)
    for (const done of f.done) done(f.found)
    f.clock.advance(20000)
    expect(f.clock.frames.size).toBe(0); expect(f.clock.timers.size).toBe(0)
    expect(f.walks.snapshot()).toMatchObject({ active: 0, queued: 0, points: [] })
    f.walks.setEnabled(true); f.clock.advance(100)
    expect(f.walks.snapshot().active).toBe(0)
  })
  it('withdrawal and removed or offscreen endpoints cancel both active and queued gestures', () => {
    const f = fixture(), batch = f.batch(8); f.walks.accept(batch); f.done.shift()!(f.found)
    f.walks.accept(f.batch(0, { withdrawn: batch.messages.map(message => message.id) }))
    expect(f.walks.snapshot()).toMatchObject({ active: 0, queued: 0, points: [] })
    f.done.shift()!(f.found)
    f.walks.accept(f.batch()); f.allowed.clear(); f.walks.recheck()
    expect(f.walks.snapshot().active).toBe(0); expect(f.clock.frames.size).toBe(0)
  })
  it('an old route cannot disturb the single route request after a new motion session', () => {
    const f = fixture(); f.walks.accept(f.batch()); const old = f.done.shift()!
    f.walks.setEnabled(false); f.walks.setEnabled(true); f.walks.accept(f.batch())
    expect(f.done).toHaveLength(1)
    old(f.found)
    expect(f.done).toHaveLength(1); expect(f.walks.snapshot().frame).toBe(false)
    f.done.shift()!(f.found); expect(f.walks.snapshot().points).toHaveLength(1)
  })
  it('stops frames as soon as the moving body leaves the visible viewport', () => {
    const clock = new Clock(); let done!: (route: Route | null) => void
    const walks = new ContactWalks(clock, () => true, (_a, _b, fn) => { done = fn }, () => {}, point => point.x < 100)
    walks.setEnabled(true)
    walks.accept({ sequence: 1, receivedAt: clock.now(), withdrawn: [], messages: [{ id: 'one', at: 'fixture', project: 'garden', from: { kind: 'agent', id: 'a' }, to: [{ kind: 'agent', id: 'b' }] }] })
    const leave = 100 / (WALK_PIXELS_PER_SECOND * DEFAULT_MOLE_SCALE) * 1000
    done({ status: 'found', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }); clock.advance(leave + 1)
    expect(walks.snapshot()).toMatchObject({ active: 0, frame: false, expiry: false })
  })
  it('does not duplicate a message or a recipient approach and does not replay a batch after quiet', () => {
    const f = fixture(), batch = f.batch(5)
    batch.messages.forEach(message => { message.to = [{ kind: 'agent', id: '99' }] })
    f.walks.accept(batch); f.walks.accept(batch)
    expect(f.walks.snapshot()).toMatchObject({ active: 1, queued: 4 })
    f.walks.setEnabled(false); f.walks.setEnabled(true); f.walks.accept(batch)
    expect(f.walks.snapshot().active).toBe(0)
  })
  it('cancels unknown, no-path and search-exhausted routes without an animation loop', () => {
    for (const status of ['unavailable', 'no-path', 'exhausted'] as const) {
      const f = fixture(); f.walks.accept(f.batch()); f.done.shift()!({ status, points: [] })
      expect(f.walks.snapshot()).toMatchObject({ active: 0, frame: false, expiry: false })
    }
  })
  it('names the two agents of a routed walk it cannot show, and nothing for a walk shown or a reply after clear', () => {
    const pair = [JSON.stringify(['agent', '0']), JSON.stringify(['agent', '1'])]
    for (const reply of [null, { status: 'no-path', points: [] }, { status: 'found', points: [{ x: 0, y: 0 }] }] satisfies (Route | null)[]) {
      const f = fixture(); f.walks.accept(f.batch()); f.done.shift()!(reply)
      expect(f.missed).toEqual([pair])
    }
    const shown = fixture(); shown.walks.accept(shown.batch()); shown.done.shift()!(shown.found)
    expect(shown.missed).toEqual([])
    const cleared = fixture(); cleared.walks.accept(cleared.batch()); const old = cleared.done.shift()!
    cleared.walks.clear(); old(null)
    expect(cleared.missed).toEqual([])
  })
  it('interpolates along the supplied route, completes, and leaves the clock idle', () => {
    const f = fixture()
    const length = f.found.points.slice(1).reduce((total, point, i) => total + Math.hypot(point.x - f.found.points[i]!.x, point.y - f.found.points[i]!.y), 0)
    const half = length / (WALK_PIXELS_PER_SECOND * DEFAULT_MOLE_SCALE) * 1000 / 2
    f.walks.accept(f.batch()); f.done.shift()!(f.found); f.clock.advance(half)
    expect(f.walks.snapshot().points[0]?.point).toEqual({ x: 160, y: 0 })
    f.clock.advance(half)
    expect(f.walks.snapshot()).toMatchObject({ active: 0, points: [], frame: false, expiry: false })
    expect(along(f.found.points, 1)).toEqual({ x: 160, y: 160 })
  })
})
