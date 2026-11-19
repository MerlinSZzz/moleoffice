// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { dirtyRegions, VisibleIndex, CanvasPool, copySurfaceSteps, sortSteps } from '../src/render-plan.ts'
import { SelectedPack, type PackSources } from '../src/pack.ts'

describe('visible rendering plan', () => {
  it('slices filtering and stable ordering, including equal keys and iterator cancellation', () => {
    const values = Array.from({ length: 1200 }, (_, i) => ({ key: (i * 37) % 13, index: i }))
    let filtering = 0, comparing = 0
    const work = sortSteps(values, (a, b) => { comparing++; return a.key - b.key }, value => { filtering++; return value.index % 3 !== 0 })
    let next: IteratorResult<void, typeof values>
    do { const before = filtering + comparing; next = work.next(); expect(filtering + comparing - before).toBeLessThanOrEqual(64) } while (!next.done)
    expect(next.value).toEqual(values.filter(value => value.index % 3 !== 0).sort((a, b) => a.key - b.key))
    const equal = sortSteps(values, () => NaN); let end = equal.next(); while (!end.done) end = equal.next(); expect(end.value).toEqual(values)
    let closed = false
    const source = (function* () { try { yield* values } finally { closed = true } })(), stopped = sortSteps(source, (a, b) => a.key - b.key)
    expect(stopped.next().done).toBe(false); stopped.return([]); expect(closed).toBe(true)
  })
  it('copies every source pixel exactly once in bounded turns, including partial edge tiles', () => {
    const source = { width: 259, height: 131 } as HTMLCanvasElement, covered = new Uint8Array(source.width * source.height)
    const copies: number[][] = [], ctx = { getImageData() {}, drawImage: (image: unknown, ...rect: number[]) => { expect(image).toBe(source); copies.push(rect) } } as unknown as CanvasRenderingContext2D
    const work = copySurfaceSteps(ctx, source)
    expect(copies).toHaveLength(0); expect(work.next().done).toBe(false); expect(copies).toHaveLength(1)
    for (;;) { const before = copies.length, next = work.next(); expect(copies.length - before).toBeLessThanOrEqual(1); if (next.done) break }
    for (const [x, y, width, height, dx, dy, dw, dh] of copies) {
      expect([dx, dy, dw, dh]).toEqual([x, y, width, height]); expect(width).toBeLessThanOrEqual(128); expect(height).toBeLessThanOrEqual(128)
      for (let row = y!; row < y! + height!; row++) for (let col = x!; col < x! + width!; col++) covered[row * source.width + col]!++
    }
    expect(copies).toHaveLength(6); expect(covered.every(count => count === 1)).toBe(true)
    const stopped = copySurfaceSteps(ctx, source); stopped.next(); const before = copies.length; stopped.return(undefined); expect(stopped.next().done).toBe(true); expect(copies).toHaveLength(before)
  })
  it('slices queries through large empty areas and dense buckets without changing result order', () => {
    const camera = { left: 0, top: 0, width: 25600, height: 25600 }
    const empty = new VisibleIndex<string>(), scan = empty.querySteps(camera)
    let next = scan.next(), turns = 0
    while (!next.done) { turns++; next = scan.next() }
    expect(turns).toBeGreaterThanOrEqual(79); expect(next.value).toEqual([])
    const entries = Array.from({ length: 1000 }, (_, i) => ({ value: String(i), rect: { x: 0, y: 0, width: 1, height: 1 } }))
    const dense = new VisibleIndex(entries).querySteps({ left: 0, top: 0, width: 1, height: 1 })
    let end = dense.next(), denseTurns = 0
    while (!end.done) { denseTurns++; end = dense.next() }
    expect(denseTurns).toBeGreaterThanOrEqual(31); expect(end.value).toEqual(entries.map(entry => entry.value))
  })
  it('culls offscreen objects and deduplicates objects crossing index cells', () => {
    const index = new VisibleIndex([
      { value: 'near', rect: { x: 250, y: 250, width: 100, height: 100 } },
      { value: 'edge', rect: { x: 512, y: 300, width: 10, height: 10 } },
      { value: 'far', rect: { x: 4000, y: 4000, width: 20, height: 20 } },
    ])
    expect(index.query({ left: 256, top: 256, width: 256, height: 256 }).sort()).toEqual(['edge', 'near'])
    expect(index.query({ left: 0, top: 0, width: 200, height: 200 })).toEqual([])
  })
  it('indexes scenery bounds without retaining a wrapper for every piece', () => {
    const pieces = Array.from({ length: 50000 }, (_, i) => ({ x: i * 8, y: 0, width: 16, height: 16 }))
    const known = new Set(pieces)
    const index = new VisibleIndex(pieces.map(value => ({ value, rect: value })))
    const held = index as unknown as { cells: Map<string, unknown[]> }
    expect([...held.cells.values()].every(entries => entries.every(entry => known.has(entry as typeof pieces[number])))).toBe(true)
    expect(index.query({ left: 0, top: 0, width: 16, height: 16 })).toEqual(pieces.slice(0, 3))
  })
  it('bounds drawing-context creation across 300 hide/resume cycles and clears all old pixels', () => {
    let created = 0
    const pool = new CanvasPool(() => { created++; return { width: 800, height: 600 } as HTMLCanvasElement })
    for (let cycle = 0; cycle < 300; cycle++) {
      const surfaces = Array.from({ length: 4 }, () => pool.take())
      if (cycle) for (const canvas of surfaces) expect([canvas.width, canvas.height]).toEqual([1, 1])
      for (const canvas of surfaces) { canvas.width = 1440; canvas.height = 1000; pool.release(canvas) }
      expect(created).toBe(4)
    }
    pool.dispose(); pool.take(); expect(created).toBe(5)
  })
  it('restores old and new dirty areas and switches to one visible repaint for dense changes', () => {
    const camera = { left: 0, top: 0, width: 1000, height: 500 }
    const before = { x: 10, y: 10, width: 30, height: 30 }, after = { ...before, x: 50 }
    expect(dirtyRegions([before], [after, { ...after, x: 2000 }], camera)).toEqual([before, after])
    expect(dirtyRegions([{ x: 0, y: 0, width: 900, height: 500 }], [], camera)).toEqual([{ x: 0, y: 0, width: 1000, height: 500 }])
  })
})

class Image {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 128; naturalHeight = 128; decoding = ''; value = ''; crossOrigin: string | null = null; requestedOrigin: string | null = null
  fail = false; slow = false
  get src() { return this.value }
  set src(value: string) { this.value = value; if (value) this.requestedOrigin = this.crossOrigin; if (value && !this.slow) queueMicrotask(() => this.fail ? this.onerror?.() : this.onload?.()) }
  decode(): Promise<void> { return Promise.resolve() }
}
const sources = { scenery: { grass: 'grass', desk: 'desk' }, portraits: { bare: 'bare' }, dimensions: { grass: [128, 128], desk: [128, 128], bare: [128, 128] } } as unknown as PackSources
describe('one selected art pack', () => {
  it('waits for decoded pixels and abandons a decode that finishes after close', async () => {
    const one = { scenery: { grass: 'grass' }, portraits: {}, dimensions: { grass: [128, 128] } } as unknown as PackSources
    const image = new Image(); let finish!: () => void, published = false
    image.decode = () => new Promise<void>(resolve => { finish = resolve })
    const loader = new SelectedPack(async () => one, () => image as unknown as HTMLImageElement)
    const pending = loader.select('woodland').then(pack => { published = true; return pack })
    for (let i = 0; i < 4; i++) await Promise.resolve()
    expect(typeof finish).toBe('function'); expect(published).toBe(false)
    finish(); expect((await pending)?.images.has('grass')).toBe(true)
    const closing = loader.select('woodland')
    for (let i = 0; i < 4; i++) await Promise.resolve()
    loader.release(); finish(); expect(await closing).toBeNull(); expect(image.src).toBe('')
  })
  it('loads only the selected entry, counts decoded bytes and releases every image', async () => {
    const loaded: string[] = [], images: Image[] = []
    const loader = new SelectedPack(async id => { loaded.push(id); return sources }, () => { const image = new Image(); images.push(image); return image as unknown as HTMLImageElement })
    const pack = await loader.select('woodland')
    expect(loaded).toEqual(['woodland']); expect(pack?.images.size).toBe(3); expect(pack?.bytes).toBe(3 * 128 * 128 * 4)
    expect(images.every(image => image.requestedOrigin === 'anonymous')).toBe(true)
    loader.release(); expect(images.every(image => image.src === '')).toBe(true); expect(pack?.images.size).toBe(0)
  })
  it('a missing pack or broken image returns unavailable and releases partial decodes', async () => {
    const missing = new SelectedPack(async () => { throw new Error('Missing') })
    expect(await missing.select('missing')).toBeNull()
    const images: Image[] = [], loader = new SelectedPack(async () => sources, () => {
      const image = new Image(); image.fail = images.length === 1; images.push(image); return image as unknown as HTMLImageElement
    })
    expect(await loader.select('woodland')).toBeNull(); expect(images.every(image => image.src === '')).toBe(true)
  })
  it('rejects an atlas that exceeds its decoded budget without keeping previous images', async () => {
    const image = new Image(); image.naturalWidth = image.naturalHeight = 4096
    const loader = new SelectedPack(async () => sources, () => image as unknown as HTMLImageElement)
    expect(await loader.select('woodland')).toBeNull(); expect(image.src).toBe('')
  })
  it('rejects an oversized temporary decode before creating an image', async () => {
    let made = 0
    const loader = new SelectedPack(async () => ({ ...sources, dimensions: { ...sources.dimensions, grass: [2048, 1024] } }), () => { made++; return new Image() as unknown as HTMLImageElement })
    expect(await loader.select('woodland')).toBeNull(); expect(made).toBe(0)
  })
  it('unmount aborts a pending image load and rejects a superseded registry answer', async () => {
    const image = new Image(); image.slow = true
    const loader = new SelectedPack(async () => sources, () => image as unknown as HTMLImageElement)
    const pending = loader.select('woodland'); await Promise.resolve(); loader.release()
    expect(await pending).toBeNull(); expect(image.src).toBe('')
    let resolve!: (sources: PackSources) => void
    const late = new SelectedPack(() => new Promise(done => { resolve = done }))
    const answer = late.select('woodland'); late.release(); resolve(sources)
    expect(await answer).toBeNull()
  })
})
