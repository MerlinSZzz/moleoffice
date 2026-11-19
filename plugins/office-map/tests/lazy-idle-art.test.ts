// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { SelectedPack } from '../src/pack.ts'
import { LookFrames } from '../src/look-frames.ts'
import { Compositions } from '../src/action-resources.ts'
import { OfficeMap } from '../src/map-view.ts'
import { lookOrder } from '../src/look-order.ts'
import { atlases, dimensions } from '../src/assets.ts'

const cast = ['fringe', 'bun', 'fan', 'crest', 'helmet', 'waves', 'part', 'beret', 'knit', 'raincoat', 'apron', 'bowtie', 'backpack', 'roll', 'flower', 'gardener', 'mapmaker', 'runner']

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('opens the actual native pack without requesting any new sleep cast image', async () => {
  const requested: string[] = []
  vi.stubGlobal('Image', class {
    crossOrigin = ''; decoding = ''; onload: (() => void) | null = null; onerror: (() => void) | null = null
    naturalWidth = 0; naturalHeight = 0; private url = ''
    get src() { return this.url }
    set src(value: string) {
      this.url = value
      if (!value) return
      requested.push(value)
      // Each bundled file answers with the size the pack expects of it; a sleep cast image is never bundled.
      const name = Object.keys(atlases).find(id => atlases[id as keyof typeof atlases] === value)
      const size = name ? dimensions[name]! : [114, 68]
      this.naturalWidth = size[0]!; this.naturalHeight = size[1]!
      queueMicrotask(() => this.onload?.())
    }
    async decode() {}
  })
  const selected = new SelectedPack()
  try {
    const pack = await selected.select('woodland')
    expect(pack).not.toBeNull()
    expect(requested.some(url => /village-0/.test(url))).toBe(true)
    for (const name of cast) {
      expect(requested.some(url => url.includes(`${name}-sleep`)), name).toBe(false)
      expect(pack!.images.has(`round89-sleep-art/${name}-sleep`), name).toBe(false)
    }
  } finally { selected.release() }
})

it('waits for a complete first map paint before requesting selected idle poses, then permits the episode', async () => {
  const recipe = lookOrder.findIndex(order => order % 3 !== 0)
  let finish!: (ready: boolean) => void
  const prepareMotion = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve }))
  const changed = vi.fn()
  const fake: any = { pack: {}, occupants: new Map([['invented', { standing: { look: 'invented', recipe } }]]), lookFrames: { ready: true, prepareMotion, clearMotion: vi.fn() }, idleLookRequest: '', idleLookReady: '', lookEpoch: 4, frameLookEpoch: -1, canvas: { dataset: { lookReady: 'false' } } }
  const ready = (OfficeMap.prototype as any).readyIdleLooks
  expect(ready.call(fake, ['invented'], changed)).toBe(false)
  expect(prepareMotion).not.toHaveBeenCalled()
  fake.frameLookEpoch = 4; fake.canvas.dataset.lookReady = 'true'
  expect(ready.call(fake, ['invented'], changed)).toBe(false)
  expect(prepareMotion).toHaveBeenCalledTimes(1)
  finish(true); await Promise.resolve(); await Promise.resolve()
  expect(changed).toHaveBeenCalledTimes(1)
  expect(ready.call(fake, ['invented'], changed)).toBe(true)
})


it('does not prepare an offscreen sleeper, then requests its art on the first draw', async () => {
  const recipe = lookOrder.findIndex(order => order % 3 !== 0)
  const prepareSleep = vi.fn(async () => true), draw = vi.fn(() => true)
  const sleeper = { key: 'invented', standing: { look: 'fan', recipe }, agent: { scale: null }, work: [] }
  const fake: any = {
    closed: false, lookEpoch: 1, occupants: new Map([['invented', sleeper]]),
    drawnScale: OfficeMap.prototype.drawnScale,
    whereaboutsByKey: new Map([['invented', { where: 'sleep', index: 0 }]]),
    layout: { ownership: true, seats: {} }, individuals: true,
    options: { still: true, wave: null, workAvailable: false }, actions: { draw: () => false },
    pack: { sources: { sprites: {} }, images: new Map() },
    lookFrames: { ready: true, prepareSleep, clearSleep: vi.fn(), draw },
    sleepCast: { select: vi.fn(async () => ({ sources: { sprites: {} }, images: new Map(), bytes: 0 })), release: vi.fn() }, sleepGeneration: 0, sleepDemand: false, sleepAttempted: false,
  }
  fake.lookPack = fake.pack
  fake.touchSleepPack = async () => true
  fake.prepareSleepingLooks = (OfficeMap.prototype as any).prepareSleepingLooks.bind(fake)
  fake.startSleepingLooks = () => (OfficeMap.prototype as any).startSleepingLooks?.call(fake)
  fake.prepareSleepingLooks()
  expect(prepareSleep).not.toHaveBeenCalled()
  const ctx = { save() {}, restore() {}, translate() {}, scale() {} }
  ;(OfficeMap.prototype as any).actor.call(fake, ctx, 'invented', { x: 20, y: 30 })
  expect(fake.sleepCast.select).toHaveBeenCalledTimes(1)
  expect(draw).toHaveBeenCalled()
  await vi.waitFor(() => expect(prepareSleep).toHaveBeenCalledTimes(1))
})


it('draws a made-up recoloured sleeper after its deferred images arrive and discards a late completion', async () => {
  class Canvas {
    width = 1; height = 1; pixels: Uint8Array | null = null
    getContext() { return { putImageData: (image: { data: Uint8Array }) => { this.pixels = new Uint8Array(image.data) } } }
  }
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  const create = () => new Canvas() as unknown as HTMLCanvasElement
  const standing = { palettes: [[[40, 50, 60]]], recipes: [[0, 0], [0, 1]], sources: [{ sprite: 'stand-invented', anchor: [64, 110], mask: null, map: [] }] }
  const sleeping = { palettes: standing.palettes, recipes: standing.recipes, sources: [{ sprite: 'sleep-invented', anchor: [1, 2], mask: ['invented-mask', [0, 0, 2, 1]], map: [[0x010203, 0]] }] }
  const original = new Uint8Array([1, 2, 3, 255, 1, 2, 3, 128, 7, 8, 9, 0, 10, 11, 12, 255])
  const standFrame = { atlas: 'stand', rect: [0, 0, 128, 128], trim: [0, 0], size: [128, 128], anchor: [64, 110] }
  const sleepFrame = { atlas: 'sleep', rect: [0, 0, 2, 2], trim: [0, 0], size: [2, 2], anchor: [1, 2] }
  const base: any = { sources: { sprites: { 'stand-invented': standFrame, 'sleep-invented': sleepFrame } }, images: new Map([['stand', {}]]), bytes: 1 }
  const extra: any = { sources: { sprites: {} }, images: new Map([['sleep', {}]]), bytes: 1 }
  const frames = new (LookFrames as any)(async () => ({ data: standing, masks: {} }), async () => new Uint8Array([1]), create,
    async () => new Uint8Array(128 * 128 * 4), new Compositions(create), async () => ({ data: sleeping, masks: { 'invented-mask': 'data:invented' } }),
    async () => ({ width: 2, height: 2, channels: 4, data: original }), async () => ({ width: 2, height: 1, channels: 1, data: new Uint8Array([255, 0]) }))
  expect(await frames.select(base)).toBe(true)
  let resolve!: (value: any) => void
  const sleepCast = { select: vi.fn(() => new Promise<any>(done => { resolve = done })), release: vi.fn() }
  const sleeper = { key: 'invented', standing: { look: 'invented', recipe: 1 }, agent: { scale: null }, work: [] }
  const fake: any = { closed: false, lookEpoch: 1, lookPack: base, pack: base, sleepCast, sleepGeneration: 0, sleepDemand: false, sleepAttempted: false, lookFrames: frames,
    occupants: new Map([['invented', sleeper]]), drawnScale: OfficeMap.prototype.drawnScale, whereaboutsByKey: new Map([['invented', { where: 'sleep', index: 0 }]]),
    layout: { ownership: true, seats: {} }, individuals: true, options: { still: true, wave: null, workAvailable: false }, actions: { draw: () => false }, camera: null }
  fake.touchSleepPack = async () => true
  fake.prepareSleepingLooks = (OfficeMap.prototype as any).prepareSleepingLooks.bind(fake)
  fake.startSleepingLooks = () => (OfficeMap.prototype as any).startSleepingLooks?.call(fake)
  fake.clearSleepingLooks = () => (OfficeMap.prototype as any).clearSleepingLooks?.call(fake)
  let pixels: Uint8Array | null = null
  const ctx: any = { save() {}, restore() {}, translate() {}, scale() {}, drawImage(canvas: Canvas) { pixels = canvas.pixels } }
  const actor = () => (OfficeMap.prototype as any).actor.call(fake, ctx, 'invented', { x: 20, y: 30 })
  try {
    actor(); expect(sleepCast.select).toHaveBeenCalledTimes(1)
    resolve(extra)
    await vi.waitFor(() => { actor(); expect(pixels && [...pixels.slice(0, 8)]).toEqual([40, 50, 60, 255, 1, 2, 3, 128]) })
    fake.clearSleepingLooks(); pixels = null
    actor(); expect(sleepCast.select).toHaveBeenCalledTimes(2)
    fake.clearSleepingLooks(); resolve(extra)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(fake.sleepPack ?? null).toBeNull()
    expect(frames.sourceBytes).toBe(128 * 128 * 4)
  } finally { fake.clearSleepingLooks(); frames.release() }
})

it('prepares and draws the first selected player with recoloured pose pixels after paint', async () => {
  class Canvas {
    width = 1; height = 1; pixels: Uint8Array | null = null
    getContext() { return { putImageData: (image: { data: Uint8Array }) => { this.pixels = new Uint8Array(image.data) } } }
  }
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  const create = () => new Canvas() as unknown as HTMLCanvasElement
  const data = { palettes: [[[40, 50, 60]]], recipes: [[0, 0], [0, 1]], sources: [{ sprite: 'stand-invented', anchor: [64, 110], mask: null, map: [] }] }
  const names = ['walk-invented-A', 'walk-invented-pass', 'walk-invented-B', 'wave-invented', 'cheer-invented']
  const poses = Object.fromEntries(names.map(name => [name, { sprite: name, anchor: [1, 2], mask: ['invented-mask', [0, 0, 2, 1]], map: [[0x010203, 0]] }]))
  const sprites: Record<string, any> = { 'stand-invented': { atlas: 'stand', rect: [0, 0, 128, 128], trim: [0, 0], size: [128, 128], anchor: [64, 110] } }
  const images = new Map<string, any>([['stand', {}]])
  for (const name of names) { sprites[name] = { atlas: name, rect: [0, 0, 2, 2], trim: [0, 0], size: [2, 2], anchor: [1, 2] }; images.set(name, {}) }
  const pack: any = { sources: { sprites }, images }
  const loadPose = vi.fn(async () => ({ poses, masks: { 'invented-mask': 'data:invented' } }))
  const frames = new (LookFrames as any)(async () => ({ data, masks: {} }), async () => new Uint8Array([1]), create,
    async () => new Uint8Array(128 * 128 * 4), new Compositions(create), undefined, undefined, undefined, loadPose,
    async () => ({ width: 2, height: 2, channels: 4, data: new Uint8Array([1, 2, 3, 255, 1, 2, 3, 128, 7, 8, 9, 0, 10, 11, 12, 255]) }),
    async () => ({ width: 2, height: 1, channels: 1, data: new Uint8Array([255, 0]) }))
  expect(await frames.select(pack)).toBe(true)
  const fake: any = { pack, occupants: new Map([['invented', { standing: { look: 'invented', recipe: 1 } }]]), lookFrames: frames, idleLookRequest: '', idleLookReady: '', lookEpoch: 1, frameLookEpoch: -1, canvas: { dataset: { lookReady: 'false' } } }
  const ready = (OfficeMap.prototype as any).readyIdleLooks, changed = vi.fn()
  try {
    expect(ready.call(fake, ['invented'], changed)).toBe(false)
    expect(loadPose).not.toHaveBeenCalled()
    fake.frameLookEpoch = 1; fake.canvas.dataset.lookReady = 'true'
    expect(ready.call(fake, ['invented'], changed)).toBe(false)
    await vi.waitFor(() => expect(changed).toHaveBeenCalled())
    expect(ready.call(fake, ['invented'], changed)).toBe(true)
    let pixels: Uint8Array | null = null
    const ctx = { save() {}, restore() {}, translate() {}, scale() {}, drawImage(canvas: Canvas) { pixels = canvas.pixels } }
    expect(frames.draw(ctx, 1, { x: 20, y: 30 }, 1, 'play', 0, 1)).toBe(true)
    expect([...(pixels as unknown as Uint8Array).slice(0, 8)]).toEqual([40, 50, 60, 255, 1, 2, 3, 128])
  } finally { frames.release() }
})
