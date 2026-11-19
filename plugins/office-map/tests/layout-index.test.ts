// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it, vi } from 'vitest'
import { LayoutCache } from '../src/geometry.ts'
import { layoutIndexes, seatRect, SlicedBuild } from '../src/layout-index.ts'
import { VisibleIndex } from '../src/render-plan.ts'
import { Nameplates } from '../src/nameplates.ts'
import { packedBounds, packRing } from '../src/packed-road.ts'
import { Navigation } from '../src/navigation.ts'
import type { Layout } from '../src/geometry.ts'

describe('idle layout indexes', () => {
  it('slices both worker navigation ground indexes within a single giant ring and preserves queries', () => {
    const ring = [{ x: 0, y: 0 }, { x: 25600, y: 0 }, { x: 25600, y: 25600 }, { x: 0, y: 25600 }], packed = packRing(ring)
    const navigation = new Navigation({ houses: [], obstacles: [], paths: [], road: { rings: [ring] }, roadDrawing: [packed] } as unknown as Layout)
    let slices = 0
    for (const _ of navigation.build()) slices++
    expect(slices).toBeGreaterThanOrEqual(2 * Math.floor(101 * 101 / 32))
    const indexes = navigation as unknown as { ground: VisibleIndex<typeof ring>; packedGround: VisibleIndex<Float64Array> }
    const camera = { left: 25599, top: 25599, width: 1, height: 1 }
    expect(indexes.ground.query(camera)).toEqual([ring]); expect(indexes.packedGround.query(camera)).toEqual([packed])
  })
  it('slices worker navigation obstacle insertion within one giant obstacle', () => {
    const obstacle = { x: 0, y: 0, width: 9600, height: 9600, kind: 'wall' }
    const navigation = new Navigation({ houses: [], obstacles: [obstacle], paths: [], road: { rings: [] } } as unknown as Layout)
    let slices = 0
    for (const _ of navigation.build()) slices++
    expect(slices).toBeGreaterThanOrEqual(Math.floor(101 * 101 / 32))
    expect((navigation as unknown as { index: Map<string, unknown[]> }).index.get('100,100')).toEqual([obstacle])
  })
  it('matches the old synchronous indexes, ordered road rings and protected labels in a large office', () => {
    const layout = new LayoutCache(true).layout({ rooms: Array.from({ length: 420 }, (_, i) => ({ id: `room-${i}`, occupants: Array.from({ length: i < 380 ? 12 : 11 }, (_, j) => `person-${i}-${j}`) })) })
    const work = layoutIndexes(layout)
    let next = work.next(), steps = 0
    while (!next.done) { steps++; next = work.next() }
    expect(steps).toBeGreaterThan(1000)
    const indexes = next.value
    const seats = new VisibleIndex(Object.entries(layout.seats).map(([value, seat]) => ({ value, rect: seatRect(seat) })))
    const scenery = new VisibleIndex(layout.pieces.map(value => ({ value, rect: value })))
    let order = 0
    const roads = new VisibleIndex((layout.roadDrawing ?? []).flatMap(packed => {
      const rings = []
      for (let at = 0; at < packed.length;) { const ring = packed.subarray(at, at + 1 + packed[at]! * 2); rings.push({ value: { ring, order: order++ }, rect: packedBounds(ring) }); at += ring.length }
      return rings
    }))
    const labels = new Nameplates(layout)
    for (const seat of Object.values(layout.seats).filter((_, i) => i % 127 === 0)) {
      const camera = { left: seat.foot.x - 400, top: seat.foot.y - 300, width: 800, height: 600 }
      expect(indexes.seats.query(camera)).toEqual(seats.query(camera))
      expect(indexes.scenery.query(camera)).toEqual(scenery.query(camera))
      expect(indexes.roads.query(camera)).toEqual(roads.query(camera))
      const actors = indexes.seats.query(camera).map(key => ({ key, point: layout.seats[key]!.foot }))
      expect(indexes.nameplates.place(actors)).toEqual(labels.place(actors))
    }
  }, 30000)
  it('cancels re-entrantly from its own step without returning the running generator or completing', () => {
    const pending = new Map<number, () => void>()
    let timer = 0, visited = 0, released = 0, completed = 0
    const job = new SlicedBuild<number>(() => 0, fn => { pending.set(++timer, fn); return timer as unknown as ReturnType<typeof setTimeout> }, id => { pending.delete(id as unknown as number) })
    function* build(): Generator<void, number> {
      try {
        for (let step = 0; step < Number.MAX_SAFE_INTEGER; step++) {
          visited++
          if (step === 0) job.cancel()
          yield
        }
        return 0
      } finally { released++ }
    }
    job.start(build(), () => completed++)
    const turn = () => { const [id, fn] = pending.entries().next().value!; pending.delete(id); fn() }
    expect(() => turn()).not.toThrow()
    expect(visited).toBe(1)
    expect(released).toBe(1)
    expect(completed).toBe(0)
    expect(pending.size).toBe(0)
    expect(job).toMatchObject({ work: null, done: null, timer: null, channel: null })
  })
  it('closes both native message ports and drops the completion closure after the default scheduler finishes', async () => {
    const close = vi.spyOn(MessagePort.prototype, 'close'), job = new SlicedBuild<number>()
    try {
      const value = await new Promise<number>(done => job.start((function* () { yield; return 42 })(), done))
      expect(value).toBe(42); expect(close).toHaveBeenCalledTimes(2)
      expect(job).toMatchObject({ work: null, done: null, timer: null, channel: null })
    } finally { job.cancel(); close.mockRestore() }
  })
})
