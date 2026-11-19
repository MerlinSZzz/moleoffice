// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { layoutKey, routeBetweenSteps, routeIdleSteps, type LayoutInput, type Layout, type Point, type Route } from './geometry.ts'
import type { Rect } from './viewport.ts'
import { DuplicateAgent } from './ownership-layout.ts'
import { sharedShift, translateLayout } from './translate-layout.ts'

export type GeometryRequest = { id: number; kind: 'layout'; input: LayoutInput } |
  { id: number; kind: 'route'; layoutKey: string; from: string; to: string; turns?: number } |
  { id: number; kind: 'idle-route'; layoutKey: string; from: string; start: Point; target: Point; occupied: Rect[]; mover: Rect; visible: Rect[]; station?: string }
export type GeometryReply = { id: number; kind: 'layout'; layout: Layout } |
  { id: number; kind: 'drawing'; chunk: DrawingChunk } |
  { id: number; kind: 'overview'; layout: Layout } |
  { id: number; kind: 'route'; route: Route } | { id: number; kind: 'error'; error: string; duplicate?: string }

/** All geometry lives here. Only the current layout and at most 64 route results are kept. */
export type DrawingChunk = Partial<Pick<Layout, 'rooms' | 'houses' | 'pieces' | 'seats' | 'roadDrawing' | 'villages' | 'squares' | 'planting'>> & { navigation?: { floors?: Layout['houses'][number]['walkable'][]; obstacles?: Layout['obstacles'] } }
export const emptyDrawing = (): Required<Omit<DrawingChunk, 'navigation'>> => ({ rooms: [], houses: [], pieces: [], seats: Object.create(null) as Layout['seats'], roadDrawing: [], villages: [], squares: [], planting: [] })
export function appendDrawing(target: Required<Omit<DrawingChunk, 'navigation'>>, chunk: DrawingChunk): void {
  for (const key of ['rooms', 'houses', 'pieces', 'roadDrawing', 'villages', 'squares', 'planting'] as const) if (chunk[key]) (target[key] as unknown[]).push(...chunk[key]!)
  if (chunk.seats) Object.assign(target.seats, chunk.seats)
}
export interface GeometryBuilder { build(input: LayoutInput): Generator<Layout | void, Layout> }
export class GeometryRuntime {
  constructor(private builder: GeometryBuilder) {}
  private latest = 0
  private layout: Layout | null = null
  private routes = new Map<string, Route>()
  routeComputations = 0
  receive(request: GeometryRequest): GeometryReply | null {
    const work = this.work(request)
    for (;;) { const next = work.next(); if (next.done) return next.value }
  }
  *work(request: GeometryRequest): Generator<GeometryReply | void, GeometryReply | null> {
    if (!Number.isSafeInteger(request.id) || request.id <= this.latest) return null
    this.latest = request.id
    try {
      if (request.kind === 'layout') {
        if (this.layout?.key !== layoutKey(request.input)) this.routes.clear()
        const work = this.builder.build(request.input)
        for (;;) {
          const next = work.next()
          if (next.done) { this.layout = yield* this.aligned(next.value); break }
          yield next.value ? { id: request.id, kind: 'overview', layout: next.value } : undefined
        }
        return { id: request.id, kind: 'layout', layout: this.layout }
      }
      if (this.layout === null || this.layout.key !== request.layoutKey) return { id: request.id, kind: 'route', route: { status: 'unavailable', points: [] } }
      if (request.kind === 'idle-route') return { id: request.id, kind: 'route', route: yield* routeIdleSteps(this.layout, request.start, request.target, request.occupied, request.from, request.mover, request.visible, {}, request.station) }
      const key = JSON.stringify([request.from, request.to, request.turns ?? 80000])
      let route = this.routes.get(key)
      if (route === undefined) {
        route = yield* routeBetweenSteps(this.layout, request.from, request.to, request.turns)
        this.routeComputations++
        if (this.routes.size >= 64) this.routes.delete(this.routes.keys().next().value!)
        this.routes.set(key, route)
      }
      return { id: request.id, kind: 'route', route }
    } catch (error) {
      return { id: request.id, kind: 'error', error: error instanceof Error ? error.message : 'Geometry failed.', ...(error instanceof DuplicateAgent ? { duplicate: error.identity } : {}) }
    }
  }
  /** A new layout keeps the drawn place of every room and house it shares with the last one, when one
   * shift can do that. Shifted here, the drawing, the routes and the page share one set of coordinates.
   * When no single shift fits, the layout is kept as it was built. */
  private *aligned(built: Layout): Generator<void, Layout> {
    const shift = this.layout && !built.preview ? sharedShift(this.layout, built) : null
    return shift && (shift.x !== 0 || shift.y !== 0) ? yield* translateLayout(built, shift) : built
  }
}
