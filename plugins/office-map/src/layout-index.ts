// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { SceneryIndex } from './compact-scenery.ts'
import type { Layout, Station } from './geometry.ts'
import { VisibleIndex } from './render-plan.ts'
import { bodyBox, Nameplates } from './nameplates.ts'
import { packedBounds } from './packed-road.ts'
import { atDesk } from './desk-things.ts'
import type { Rect } from './viewport.ts'

export const actorRect = (point: { x: number; y: number }): Rect => ({ x: point.x - 72, y: point.y - 140, width: 180, height: 196 })
/** The box a seat's mole may be drawn in: round its foot, and, at a seat with a desk, round the
 * point where it is drawn at its desk. A mole at its desk is drawn above its foot in a room of 1
 * to 8 and in the hall of 13, and beside it in a room of 9 to 12 or 14 or more. */
export function seatRect(seat: Station): Rect {
  const foot = actorRect(seat.foot)
  if (!(seat.desk.width > 0)) return foot
  const desk = actorRect(atDesk(seat)), x = Math.min(foot.x, desk.x), y = Math.min(foot.y, desk.y)
  return { x, y, width: Math.max(foot.x + foot.width, desk.x + desk.width) - x, height: Math.max(foot.y + foot.height, desk.y + desk.height) - y }
}
export interface RoadEntry { ring: Float64Array; order: number }
export interface LayoutIndexes { seats: VisibleIndex<string>; scenery: SceneryIndex; roads: VisibleIndex<RoadEntry>; nameplates: Nameplates }
/** Preserve insertion and paint order. Bounds and cell insertion are produced lazily. */
export function* layoutIndexes(layout: Layout): Generator<void, LayoutIndexes> {
  const seats = yield* VisibleIndex.build((function* () {
    for (const key in layout.seats) yield { value: key, rect: seatRect(layout.seats[key]!) }
  })())
  const scenery = yield* SceneryIndex.build(layout.pieces, layout.planting)
  const roads = yield* VisibleIndex.build((function* () {
    let order = 0
    for (const packed of layout.roadDrawing ?? []) for (let at = 0; at < packed.length;) {
      const ring = packed.subarray(at, at + 1 + packed[at]! * 2)
      yield { value: { ring, order: order++ }, rect: packedBounds(ring) }; at += ring.length
    }
  })())
  const protectedIndex = yield* VisibleIndex.build((function* () {
    for (const key in layout.seats) {
      const desk = layout.seats[key]!.desk, value = { x: desk.x - 2, y: desk.y + 30, width: desk.width + 4, height: desk.height - 28 }
      yield { value, rect: value }
    }
    for (const house of layout.houses) for (const door of house.openings) {
      const value = { x: door.x - 4, y: door.y - 4, width: door.width + 8, height: door.height + 8 }; yield { value, rect: value }
    }
    for (const key in layout.seats) { const seat = layout.seats[key]!; if (seat.desk.width > 0) continue; const value = bodyBox(seat.foot); yield { value, rect: value } }
  })(), true)
  return { seats, scenery, roads, nameplates: new Nameplates(layout, protectedIndex) }
}

/** A finite idle build: no animation frames, at most 2 ms or 256 generator steps per turn.
 * Cancel releases the generator, completion closure and scheduled timer together. */
export class SlicedBuild<T> {
  private work: Generator<void, T> | null = null
  private done: ((value: T) => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private channel: MessageChannel | null = null
  private running = false
  private stopAfterStep = false
  constructor(private now = () => performance.now(), private later?: (fn: () => void) => ReturnType<typeof setTimeout>, private clear = (id: ReturnType<typeof setTimeout>) => clearTimeout(id)) {}
  start(work: Generator<void, T>, done: (value: T) => void): void {
    this.cancel(); this.stopAfterStep = false; this.work = work; this.done = done
    if (!this.later) { this.channel = new MessageChannel(); this.channel.port1.onmessage = () => this.advance() }
    this.schedule()
  }
  cancel(): void {
    if (this.timer !== null) this.clear(this.timer)
    this.closeChannel()
    this.timer = null
    // Re-entrant from the build's own step: the generator is running, so it cannot be returned yet.
    if (this.running) { this.stopAfterStep = true; this.done = null; return }
    this.releaseWork()
  }
  private releaseWork(): void {
    const work = this.work
    this.work = null; this.done = null; this.timer = null
    work?.return(undefined as T)
  }
  private closeChannel(): void {
    if (this.channel) { this.channel.port1.onmessage = null; this.channel.port1.close(); this.channel.port2.close(); this.channel = null }
  }
  private schedule(): void {
    if (this.later) this.timer = this.later(() => this.advance())
    else this.channel!.port2.postMessage(null)
  }
  private advance(): void {
    this.timer = null
    const start = this.now()
    this.running = true
    try {
      for (let steps = 0; this.work && steps < 256; steps++) {
        const next = this.work.next()
        if (this.stopAfterStep) return
        if (next.done) { const done = this.done; this.work = null; this.done = null; this.closeChannel(); done?.(next.value); return }
        if (this.now() - start >= 2) break
      }
    } finally {
      this.running = false
      if (this.stopAfterStep) { this.stopAfterStep = false; this.releaseWork() }
    }
    if (this.work) this.schedule()
  }
}
