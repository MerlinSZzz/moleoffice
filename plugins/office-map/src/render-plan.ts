// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { bitmapSize, overlapsCamera, type Camera, type Rect } from './viewport.ts'

export const SURFACE_BYTES = 20 * 1024 * 1024
/** Count all simultaneous surfaces, including DPR and overscan, before allocating. */
export function surfaceSize(camera: Camera, zoom: number, dpr: number, surfaces = 2): { width: number; height: number; ratio: number; bytes: number } {
  let ratio = Math.min(2, Math.max(.1, dpr), Math.sqrt(SURFACE_BYTES / (4 * surfaces * (camera.width * zoom + 1) * (camera.height * zoom + 1))))
  let size = bitmapSize(camera, zoom, ratio)
  while (size.width * size.height * 4 * surfaces > SURFACE_BYTES) { ratio *= .99; size = bitmapSize(camera, zoom, ratio) }
  return { ...size, ratio, bytes: size.width * size.height * 4 * surfaces }
}

/** Current geometry only. Scroll visits viewport cells, rather than every seat. */
export class VisibleIndex<T> {
  private cells = new Map<string, ({ value: T; rect: Rect } | (T & Rect))[]>()
  private direct: boolean
  constructor(entries: { value: T; rect: Rect }[] = [], private cell = 256, direct = entries.every(entry => (entry.value as unknown) === entry.rect)) {
    this.direct = direct
    const work = this.add(entries)
    while (!work.next().done) { /* Synchronous convenience for small query-time indexes. */ }
  }
  /** A boundary after at most 32 cell insertions, even for a rectangle spanning many cells. */
  *add(entries: Iterable<{ value: T; rect: Rect }>): Generator<void> {
    let inserted = 0
    for (const entry of entries) {
      for (let y = Math.floor(entry.rect.y / this.cell); y <= Math.floor((entry.rect.y + entry.rect.height) / this.cell); y++) {
        for (let x = Math.floor(entry.rect.x / this.cell); x <= Math.floor((entry.rect.x + entry.rect.width) / this.cell); x++) {
          const key = `${x},${y}`, entries = this.cells.get(key) ?? []
          entries.push(this.direct ? entry.value as T & Rect : entry); this.cells.set(key, entries)
          if (++inserted === 32) { inserted = 0; yield }
        }
      }
    }
  }
  static *build<T>(entries: Iterable<{ value: T; rect: Rect }>, direct = false): Generator<void, VisibleIndex<T>> {
    const index = new VisibleIndex<T>([], 256, direct)
    yield* index.add(entries)
    return index
  }
  query(camera: Camera): T[] {
    const work = this.querySteps(camera)
    for (;;) { const next = work.next(); if (next.done) return next.value }
  }
  /** Whole-office queries must also yield while crossing empty cells or dense buckets. */
  *querySteps(camera: Camera): Generator<void, T[]> {
    const found = new Set<T>()
    let cells = 0, entries = 0
    for (let y = Math.floor(camera.top / this.cell); y <= Math.floor((camera.top + camera.height) / this.cell); y++) {
      for (let x = Math.floor(camera.left / this.cell); x <= Math.floor((camera.left + camera.width) / this.cell); x++) {
        for (const entry of this.cells.get(`${x},${y}`) ?? []) {
          const rect = this.direct ? entry as T & Rect : (entry as { rect: Rect }).rect
          if (overlapsCamera(rect, camera)) found.add(this.direct ? entry as T : (entry as { value: T }).value)
          if (++entries === 32) { entries = 0; yield }
        }
        if (++cells === 128) { cells = 0; yield }
      }
    }
    return [...found]
  }
}
/** Dense changes restore the visible surface once. Coordinates remain in world units. */
export function dirtyRegions(before: Rect[], after: Rect[], camera: Camera): Rect[] {
  const rects = before.concat(after).filter(rect => overlapsCamera(rect, camera))
  if (rects.reduce((area, rect) => area + rect.width * rect.height, 0) > camera.width * camera.height * .4) {
    return [{ x: camera.left, y: camera.top, width: camera.width, height: camera.height }]
  }
  return rects
}

/** Stable ordering with at most 64 filtering/comparison/copy operations between yields. */
export function* sortSteps<T>(source: Iterable<T>, compare: (a: T, b: T) => number, accept: (value: T) => boolean = () => true): Generator<void, T[]> {
  let values: T[] = [], steps = 0
  for (const value of source) {
    if (accept(value)) values.push(value)
    if (++steps === 64) { steps = 0; yield }
  }
  let buffer = new Array<T>(values.length)
  for (let width = 1; width < values.length; width *= 2) {
    for (let left = 0; left < values.length; left += width * 2) {
      const middle = Math.min(left + width, values.length), right = Math.min(left + width * 2, values.length)
      let a = left, b = middle, at = left
      while (a < middle || b < right) {
        // Array.sort treats a NaN comparison as equal. Keep the left item on ties.
        buffer[at++] = b === right || (a < middle && !(compare(values[a]!, values[b]!) > 0)) ? values[a++]! : values[b++]!
        if (++steps === 64) { steps = 0; yield }
      }
    }
    const previous = values; values = buffer; buffer = previous
  }
  return values
}

/** Copy in device pixels, preserving exact edges while bounding each native canvas call. */
export function* copySurfaceSteps(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement): Generator<void> {
  let copied = 0
  for (let y = 0; y < source.height; y += 128) for (let x = 0; x < source.width; x += 128) {
    const width = Math.min(128, source.width - x), height = Math.min(128, source.height - y)
    ctx.drawImage(source, x, y, width, height, x, y, width, height)
    if (++copied % 4 === 0) ctx.getImageData(0, 0, 1, 1)
    yield
  }
  ctx.getImageData(0, 0, 1, 1)
}

/** Reuse at most the two drawing contexts and two terrain contexts across visibility resets.
 * Shrinking clears pixels and state before a later authorized model can use them. */
export class CanvasPool {
  private free: HTMLCanvasElement[] = []
  constructor(private readonly create = () => document.createElement('canvas')) {}
  take(): HTMLCanvasElement { return this.free.pop() ?? this.create() }
  release(canvas: HTMLCanvasElement): void {
    canvas.width = canvas.height = 1
    if (this.free.length < 4 && !this.free.includes(canvas)) this.free.push(canvas)
  }
  dispose(): void { for (const canvas of this.free) canvas.width = canvas.height = 1; this.free = [] }
}
