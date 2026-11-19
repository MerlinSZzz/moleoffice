// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { layoutKey, type LayoutInput, type Layout, type Point, type Route } from './geometry.ts'
import type { Rect } from './viewport.ts'
import type { GeometryReply, GeometryRequest } from './worker-protocol.ts'
import { appendDrawing, emptyDrawing, type DrawingChunk } from './worker-protocol.ts'

export interface WorkerPort {
  onmessage: ((event: MessageEvent<GeometryReply>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage: (request: GeometryRequest) => void
  terminate: () => void
}
/**
 * Why no layout came back, in the program's own words. `layout` is an error the layout code caught
 * and replied with. `roster` is a roster that names `agent` twice. `worker` is the worker program
 * itself failing: it could not start, or it stopped outside the layout code.
 */
export type GeometryFailure = { cause: 'layout' | 'worker'; message: string } | { cause: 'roster'; message: string; agent: string }
export type GeometryState = { layout: Layout | null; status: 'waiting' | 'loading' | 'ready' } | { layout: null; status: 'unavailable'; failure: GeometryFailure }

/** One worker per open context. Termination interrupts even a search still running synchronously. */
export class GeometryClient {
  private worker: WorkerPort | null = null
  private boundary: string | null = null
  private id = 0
  private inputKey: string | null = null
  private input: LayoutInput | null = null
  private closed = false
  private active = false
  private state: GeometryState = { layout: null, status: 'waiting' }
  private routeDone: ((route: Route | null) => void) | null = null
  private waitingRoute: { from: string; to: string; done: (route: Route | null) => void; turns?: number } | null = null
  private retained: Layout | null = null
  private lastRoute: { key: string; route: Route } | null = null
  private drawing: Required<Omit<DrawingChunk, 'navigation'>> | null = null
  private ground: Required<NonNullable<DrawingChunk['navigation']>> | null = null
  private navigations = new WeakMap<Layout, Layout>()
  constructor(private readonly create: () => WorkerPort, private readonly changed: (state: GeometryState) => void) {}

  setContext(boundary: string, active: boolean, visibilityOnly = false): void {
    if (this.closed || (this.boundary === boundary && this.active === active)) return
    const retained = visibilityOnly ? this.state.status === 'ready' ? this.state.layout : this.retained : null
    this.stop(); this.retained = retained
    this.boundary = boundary; this.active = active
  }
  update(input: LayoutInput): void {
    if (this.closed || !this.active) return
    const key = layoutKey(input)
    if (this.inputKey === key) return
    this.cancelRoute(); this.lastRoute = null
    this.drawing = null; this.ground = null
    this.inputKey = key
    this.input = input
    if (this.retained?.key === key) {
      this.state = { layout: this.retained, status: 'ready' }; this.retained = null; this.changed(this.state); return
    }
    this.retained = null
    // Keep the complete occupied map and its camera while a new roster builds.
    // A superseded loading preview is not a completed map to retain.
    this.state = { layout: this.state.layout?.preview ? null : this.state.layout, status: 'loading' }
    const id = ++this.id
    try {
      if (this.worker === null) {
        const worker = this.create(); this.worker = worker
        worker.onmessage = event => this.receive(worker, event.data)
        worker.onerror = event => this.failed(worker, { cause: 'worker', message: event.message ?? '' })
      }
      this.worker.postMessage({ id, kind: 'layout', input })
    } catch (error) { this.failed(this.worker, { cause: 'worker', message: error instanceof Error ? error.message : '' }) }
  }
  route(from: string, to: string, done: (route: Route | null) => void, turns?: number): void {
    this.cancelRoute()
    const layout = this.state.layout
    if (this.closed || !this.active || layout === null || (this.state.status === 'loading' && this.worker !== null)) { done(null); return }
    if (this.worker === null) {
      const input = this.input
      if (!input) { done(null); return }
      this.inputKey = null; this.update(input)
      if (this.state.status !== 'loading') { done(null); return }
      this.state = { layout, status: 'loading' }
      this.waitingRoute = { from, to, done, ...(turns === undefined ? {} : { turns }) }
      return
    }
    const key = JSON.stringify([layout.key, from, to, turns ?? 80000])
    if (this.lastRoute?.key === key) { done(this.lastRoute.route); return }
    this.routeDone = route => { if (route) this.lastRoute = { key, route }; done(route) }
    try { this.worker.postMessage({ id: ++this.id, kind: 'route', layoutKey: layout.key, from, to, ...(turns === undefined ? {} : { turns }) }) }
    catch (error) { this.failed(this.worker, { cause: 'worker', message: error instanceof Error ? error.message : '' }) }
  }
  /** The worker retains collision geometry; a stale or unavailable worker refuses movement. `station`
   * names the station of a mole that leaves its desk from where it worked, so its walk goes round that desk. */
  idleRoute(from: string, start: Point, target: Point, occupied: Rect[], mover: Rect, visible: Rect[], done: (route: Route | null) => void, station?: string): void {
    this.cancelRoute()
    const layout = this.state.layout
    if (this.closed || !this.active || !layout || this.state.status !== 'ready' || !this.worker) { done(null); return }
    this.routeDone = done
    try { this.worker.postMessage({ id: ++this.id, kind: 'idle-route', layoutKey: layout.key, from, start, target, occupied, mover, visible, ...(station === undefined ? {} : { station }) }) }
    catch (error) { this.failed(this.worker, { cause: 'worker', message: error instanceof Error ? error.message : '' }) }
  }
  snapshot(): GeometryState { return this.state }
  /** The current layout with the walkable floors and obstacles the worker's route search uses. A
   * layout sent in drawing chunks leaves them out of `snapshot()`; a layout sent whole is its own
   * navigation layout. Null while no sent layout is current. */
  navigation(): Layout | null { return this.state.layout ? this.navigations.get(this.state.layout) ?? null : null }
  /** Interrupt a synchronous search too, retaining the static layout. Restart only for a later gesture. */
  interruptRoute(): void {
    if (this.routeDone === null && this.waitingRoute === null) return
    const { layout } = this.state, input = this.input, key = this.inputKey
    this.stop()
    this.state = { layout, status: layout ? 'ready' : 'waiting' }; this.input = input; this.inputKey = key
  }
  dispose(): void { if (!this.closed) { this.closed = true; this.active = false; this.stop(); this.retained = null } }

  private receive(worker: WorkerPort, reply: GeometryReply): void {
    if (worker !== this.worker || this.closed || !this.active || reply.id !== this.id) return
    if (reply.kind === 'error') { this.failed(worker, reply.duplicate === undefined ? { cause: 'layout', message: reply.error } : { cause: 'roster', message: reply.error, agent: reply.duplicate }); return }
    if (reply.kind === 'drawing') {
      this.drawing ??= emptyDrawing(); appendDrawing(this.drawing, reply.chunk)
      const sent = reply.chunk.navigation
      if (sent) { this.ground ??= { floors: [], obstacles: [] }; for (const key of ['floors', 'obstacles'] as const) if (sent[key]) (this.ground[key] as unknown[]).push(...sent[key]!) }
      return
    }
    if (reply.kind === 'overview') {
      if (reply.layout.key === this.inputKey && this.state.layout === null) { this.state = { layout: reply.layout, status: 'loading' }; this.changed(this.state) }
      return
    }
    if (reply.kind === 'layout') {
      if (reply.layout.key !== this.inputKey) return
      // A layout that follows no drawing message was sent whole, with its own walkable floors and
      // obstacles. One sent in drawing chunks gets them from the navigation chunks, a floor for every house.
      const chunked = this.drawing !== null
      if (this.drawing) { Object.assign(reply.layout, this.drawing); this.drawing = null }
      const ground = this.ground ?? { floors: [], obstacles: [] }; this.ground = null
      if (chunked && ground.floors.length !== reply.layout.houses.length) { this.failed(worker, { cause: 'worker', message: `The worker sent ${ground.floors.length} walkable floors, and the layout has ${reply.layout.houses.length} houses.` }); return }
      this.navigations.set(reply.layout, chunked ? { ...reply.layout, houses: reply.layout.houses.map((house, i) => ({ ...house, walkable: ground.floors[i]! })), obstacles: ground.obstacles } : reply.layout)
      this.state = { layout: reply.layout, status: 'ready' }
      const waiting = this.waitingRoute; this.waitingRoute = null
      if (waiting) this.route(waiting.from, waiting.to, waiting.done, waiting.turns)
      this.changed(this.state)
    } else {
      const done = this.routeDone; this.routeDone = null; done?.(reply.route)
    }
  }
  private cancelRoute(): void {
    const done = this.routeDone, waiting = this.waitingRoute; this.routeDone = null; this.waitingRoute = null
    done?.(null); waiting?.done(null)
  }
  private failed(worker: WorkerPort | null, failure: GeometryFailure): void {
    if (worker !== this.worker) return
    const failedKey = this.inputKey
    this.stop(); this.inputKey = failedKey
    this.state = { layout: null, status: 'unavailable', failure }; this.changed(this.state)
  }
  private stop(): void {
    this.id++
    if (this.worker) { this.worker.onmessage = null; this.worker.onerror = null; this.worker.terminate(); this.worker = null }
    this.lastRoute = null; this.inputKey = null; this.input = null
    this.drawing = null; this.ground = null
    this.state = { layout: null, status: 'waiting' }
    this.cancelRoute()
  }
}

/** The page policy permits only blob workers, and that worker may load only this plugin's script. */
export function blobWorker(script: string): WorkerPort {
  const address = URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(script)});`], { type: 'text/javascript' }))
  try { return new Worker(address) as WorkerPort }
  finally { URL.revokeObjectURL(address) }
}
