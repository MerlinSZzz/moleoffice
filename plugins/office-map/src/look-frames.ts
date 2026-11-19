// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { ArtPack, SpriteFrame } from './pack.ts'
import { decodeLookPng, type NativePixels } from './look-png.ts'
import { NativeStandingReader, inlineLookMask } from './look-native.ts'
import { Compositions, decodeOwner } from './action-resources.ts'
import { readNativePixels } from './action-pixels.ts'
export interface LookData {
  palettes: number[][][]
  sources: { sprite: string; anchor: number[]; mask: [string, number[]] | null; map: number[][] }[]
  recipes: number[][]
}
export const LOOK_CACHE_FRAMES = 8
export const LOOK_BITMAP_BYTES = LOOK_CACHE_FRAMES * 128 * 128 * 4
/** Includes source buffers, mask buffers, inflater scanlines, compressed fetch and output scratch. */
export const LOOK_HEAP_BYTES = 8 * 1024 * 1024
export function nativeStanding(atlas: NativePixels, frame: SpriteFrame): Uint8Array {
  if (atlas.channels !== 4 || frame.size[0] !== 128 || frame.size[1] !== 128) throw Error('Invalid standing source')
  const out = new Uint8Array(128 * 128 * 4)
  const [sx, sy, width, height] = frame.rect as [number, number, number, number], [tx, ty] = frame.trim as [number, number]
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = ((sy + y) * atlas.width + sx + x) * 4, to = ((ty + y) * 128 + tx + x) * 4
    if (atlas.data[from + 3]) out.set(atlas.data.subarray(from, from + 4), to)
  }
  return out
}
/** Integer palette indices only, applied exclusively through the study's exact mask. */
export function composePose(original: Uint8Array, mask: NativePixels | undefined, data: LookData, recipe: number, width: number, height: number): Uint8Array {
  if (original.length !== width * height * 4) throw Error('Invalid pose dimensions')
  const [sourceIndex, choice] = data.recipes[recipe]!, source = data.sources[sourceIndex!]!, out = original.slice()
  if (!choice || !source.mask) return out
  if (!mask || mask.channels !== 1) throw Error('Missing exact clothing mask')
  const box = source.mask[1], mapping = new Map(source.map.map(row => [row[0]!, data.palettes[choice - 1]![row[choice]!]!]))
  if (mask.width !== box[2]! - box[0]! || mask.height !== box[3]! - box[1]!) throw Error('Clothing mask dimensions differ')
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    if (!mask.data[y * mask.width + x]) continue
    const at = ((y + box[1]!) * width + x + box[0]!) * 4
    const rgb = mapping.get(original[at]! * 65536 + original[at + 1]! * 256 + original[at + 2]!)
    if (!rgb) throw Error('Native clothing colour missing from exact palette')
    out[at] = rgb[0]!; out[at + 1] = rgb[1]!; out[at + 2] = rgb[2]!
  }
  return out
}
export function composeStanding(original: Uint8Array, mask: NativePixels | undefined, data: LookData, recipe: number): Uint8Array {
  return composePose(original, mask, data, recipe, 128, 128)
}
type Assets = { data: LookData; masks: Record<string, string> }
type PoseAssets = { poses: Record<string, LookData['sources'][number]>; masks: Record<string, string> }
/** One bounded shared cache for every actor in this map. Whole atlas/mask reads are sequential. */
export class LookFrames {
  private epoch = 0
  private abort: AbortController | null = null
  private data: LookData | null = null
  private originals: Uint8Array[] = []
  private masks = new Map<number, NativePixels>()
  private loading: Promise<boolean> | null = null
  private sleepLoading: Promise<boolean> | null = null
  private sleepEpoch = 0
  private sleepAttempted = false
  private sleepKey = ''
  private sleepData: LookData | null = null
  private sleepOriginals: NativePixels[] = []
  private sleepMasks = new Map<number, NativePixels>()
  private motionAssetsData: PoseAssets | null = null
  private motionOriginals = new Map<string, NativePixels>()
  private motionMasks = new Map<string, NativePixels>()
  private motionMaskKeys: number[] = []
  private motionKey = ''
  private motionPendingKey = ''
  private motionLoading: Promise<boolean> | null = null
  private motionAbort: AbortController | null = null
  private motionEpoch = 0
  private reader = new NativeStandingReader()
  ready = false
  constructor(private assets: () => Promise<Assets> = async () => {
    const module = await import('./look-assets.ts')
    return { data: module.data as unknown as LookData, masks: module.masks }
  }, private read: (url: string, signal: AbortSignal) => Promise<Uint8Array> = inlineLookMask,
  private create: () => HTMLCanvasElement = () => document.createElement('canvas'),
  private native: (image: HTMLImageElement, frame: SpriteFrame, signal: AbortSignal) => Promise<Uint8Array> = (image, frame, signal) => this.reader.read(image, frame, signal),
  private cache: Compositions = new Compositions(create),
  private sleepAssets: () => Promise<Assets> = async () => { const module = await import('./sleep-look-assets.ts'); return { data: module.data as unknown as LookData, masks: module.masks } },
  private sleepNative: (image: HTMLImageElement, frame: SpriteFrame, signal: AbortSignal) => Promise<NativePixels> = (image, frame, signal) => readNativePixels(image, frame, signal, () => !signal.aborted),
  private sleepDecode: (bytes: Uint8Array) => Promise<NativePixels> = decodeLookPng,
  private poseAssets: () => Promise<PoseAssets> = async () => { const module = await import('./pose-look-assets.ts'); return { poses: module.poses as unknown as PoseAssets['poses'], masks: module.masks } },
  private poseNative: (image: HTMLImageElement, frame: SpriteFrame, signal: AbortSignal) => Promise<NativePixels> = (image, frame, signal) => readNativePixels(image, frame, signal, () => !signal.aborted),
  private poseDecode: (bytes: Uint8Array) => Promise<NativePixels> = decodeLookPng) {}
  select(pack: ArtPack): Promise<boolean> {
    this.release(); const epoch = this.epoch, previous = this.loading
    const work = (async () => {
      // Supersession cancels fetches, but an inflater already running must finish
      // before another owns a whole-atlas buffer.
      if (previous) await previous
      return epoch === this.epoch ? this.load(pack, epoch) : false
    })()
    this.loading = work
    void work.finally(() => { if (this.loading === work) this.loading = null })
    return work
  }
  private async load(pack: ArtPack, epoch: number): Promise<boolean> {
    const abort = this.abort = new AbortController()
    try {
      const { data, masks } = await this.assets()
      if (epoch !== this.epoch) return false
      this.data = data
      const sources = data.sources.map(source => pack.sources.sprites?.[source.sprite])
      if (sources.some(frame => !frame)) throw Error('Standing sources unavailable')
      for (const [index, frame] of sources.entries()) {
        const anchor = data.sources[index]!.anchor
        if (!frame!.anchor || !anchor || anchor.length < 2 || frame!.anchor.length < 2 || ![...anchor, ...frame!.anchor].every(Number.isFinite) || anchor[0] !== frame!.anchor[0] || anchor[1] !== frame!.anchor[1]) throw Error('Standing anchor differs from sprite')
        const image = pack.images.get(frame!.atlas); if (!image) throw Error('Standing atlas unavailable')
        const raw = await decodeOwner.run('standing image', () => this.native(image, frame!, abort.signal), abort.signal)
        if (epoch !== this.epoch) return false
        if (raw.byteLength !== 128 * 128 * 4) throw Error('Standing pixels differ from native dimensions')
        this.originals[index] = raw
      }
      this.reader.release()
      for (const [index, source] of data.sources.entries()) if (source.mask) {
        const url = masks[source.mask[0]]; if (!url) throw Error('Clothing mask unavailable')
        const bytes = await this.read(url, abort.signal)
        if (epoch !== this.epoch) return false
        const mask = await decodeOwner.run('standing mask', () => decodeLookPng(bytes), abort.signal)
        if (epoch !== this.epoch) return false
        this.masks.set(index, mask)
      }
      this.ready = true; return true
    } catch { if (epoch === this.epoch) this.release(); return false }
    finally { this.reader.release() }
  }
  /** Sleep art is needed only for a supplied sleeping identity. Reads share
   * the decode owner and the existing eight-frame cache and source budget. */
  prepareSleep(pack: ArtPack, recipes?: readonly number[]): Promise<boolean> {
    const key = recipes ? JSON.stringify([...new Set(recipes)].sort((a, b) => a - b)) : '*'
    if (this.sleepKey === key && this.sleepData) return Promise.resolve(true)
    if (this.sleepLoading) {
      const generation = this.sleepEpoch
      return this.sleepLoading.then(() => generation === this.sleepEpoch ? this.prepareSleep(pack, recipes) : false)
    }
    if (this.sleepKey === key && this.sleepAttempted) return Promise.resolve(false)
    if (!this.ready || !this.abort) return Promise.resolve(false)
    this.clearSleep(); this.sleepKey = key
    this.sleepAttempted = true
    const epoch = this.epoch, generation = this.sleepEpoch, signal = this.abort.signal, motionBefore = this.motionLoading
    const work = (async () => {
      try {
        if (motionBefore) await motionBefore
        if (epoch !== this.epoch || generation !== this.sleepEpoch) return false
        const assets = await this.sleepAssets(), originals: NativePixels[] = [], masks = new Map<number, NativePixels>()
        if (epoch !== this.epoch || generation !== this.sleepEpoch || signal.aborted) return false
        let bytes = this.sourceBytes
        const wanted = recipes ? new Set(recipes.map(recipe => assets.data.recipes[recipe]?.[0])) : null
        if (wanted?.has(undefined)) throw Error('Sleep recipe unavailable')
        for (const recipe of recipes ?? assets.data.recipes.map((_, index) => index)) {
          const standingIndex = this.data?.recipes[recipe]?.[0], sleepIndex = assets.data.recipes[recipe]?.[0]
          const standing = standingIndex === undefined ? undefined : this.data?.sources[standingIndex]
          const sleeping = sleepIndex === undefined ? undefined : assets.data.sources[sleepIndex]
          if (!standing?.sprite.startsWith('stand-') || sleeping?.sprite !== 'sleep-' + standing.sprite.slice(6)) throw Error('Sleep identity differs from standing look')
        }
        for (const [index, source] of assets.data.sources.entries()) {
          if (wanted && !wanted.has(index)) continue
          const frame = pack.sources.sprites?.[source.sprite], image = frame && pack.images.get(frame.atlas)
          if (!frame || !image || !frame.anchor || !source.anchor || source.anchor.length < 2 || frame.anchor.length < 2 || ![...source.anchor, ...frame.anchor].every(Number.isFinite) || source.anchor[0] !== frame.anchor[0] || source.anchor[1] !== frame.anchor[1]) throw Error('Sleep source or anchor unavailable')
          const raw = await decodeOwner.run('sleep image', () => this.sleepNative(image, frame, signal), signal)
          if (epoch !== this.epoch || generation !== this.sleepEpoch || raw.channels !== 4 || raw.width !== frame.size[0] || raw.height !== frame.size[1] || raw.data.byteLength !== raw.width * raw.height * 4) throw Error('Sleep pixels unavailable')
          bytes += raw.data.byteLength; if (bytes > 2 * 1024 * 1024) throw Error('Sleep sources exceed budget')
          originals[index] = raw
          if (source.mask) {
            const url = assets.masks[source.mask[0]]; if (!url) throw Error('Sleep mask unavailable')
            const encoded = await this.read(url, signal)
            const mask = await decodeOwner.run('sleep mask', () => this.sleepDecode(encoded), signal)
            if (epoch !== this.epoch || generation !== this.sleepEpoch) throw Error('Sleep load superseded')
            bytes += mask.data.byteLength; if (bytes > 2 * 1024 * 1024) throw Error('Sleep sources exceed budget')
            masks.set(index, mask)
          }
        }
        if (epoch !== this.epoch || generation !== this.sleepEpoch) return false
        this.originals.push(...originals.filter(Boolean).map(original => original.data))
        for (const [index, mask] of masks) this.masks.set(-1000000 - index, mask)
        this.sleepData = assets.data; this.sleepOriginals = originals; this.sleepMasks = masks; this.sleepKey = key
        return true
      } catch { return false }
    })()
    this.sleepLoading = work
    void work.finally(() => { if (this.sleepLoading === work) this.sleepLoading = null })
    return work
  }
  clearSleep(): void {
    this.sleepEpoch++
    const removed = new Set(this.sleepOriginals.filter(Boolean).map(original => original.data))
    this.originals = this.originals.filter(original => !removed.has(original))
    for (const index of this.sleepMasks.keys()) this.masks.delete(-1000000 - index)
    this.sleepOriginals = []; this.sleepMasks.clear(); this.sleepData = null; this.sleepKey = ''; this.sleepAttempted = false
    this.cache.dropPrefix('standing:sleep:')
  }
  private sleepFrame(recipe: number): { canvas: HTMLCanvasElement; source: LookData['sources'][number]; width: number; height: number } | null {
    const data = this.sleepData, index = data?.recipes[recipe]?.[0]
    const source = index === undefined ? undefined : data?.sources[index], original = index === undefined ? undefined : this.sleepOriginals[index]
    if (!data || !source || !original || index === undefined) return null
    const key = 'standing:sleep:' + recipe, existing = this.cache.get(key)
    const canvas = existing?.canvas ?? this.cache.put(key, composePose(original.data, this.sleepMasks.get(index), data, recipe, original.width, original.height), original.width, original.height)?.canvas
    return canvas ? { canvas, source, width: original.width, height: original.height } : null
  }
  /** Load only the two participating recipes, under the standing source cap. */
  prepareMotion(pack: ArtPack, recipes: readonly number[]): Promise<boolean> {
    const ids = [...new Set(recipes)].sort((a, b) => a - b), key = JSON.stringify(ids)
    if (!ids.length) { this.clearMotion(); return Promise.resolve(true) }
    if (this.motionKey === key && this.motionAssetsData) return Promise.resolve(true)
    if (this.motionPendingKey === key && this.motionLoading) return this.motionLoading
    if (!this.ready || !this.data) return Promise.resolve(false)
    this.clearMotion()
    const generation = this.motionEpoch, abort = this.motionAbort = new AbortController(), data = this.data, sleepBefore = this.sleepLoading
    this.motionPendingKey = key
    const work = (async () => {
      try {
        if (sleepBefore) await sleepBefore
        if (generation !== this.motionEpoch) return false
        const assets = await this.poseAssets(), originals = new Map<string, NativePixels>(), masks = new Map<string, NativePixels>(), names = new Set<string>()
        if (generation !== this.motionEpoch || abort.signal.aborted) return false
        for (const recipe of ids) {
          const index = data.recipes[recipe]?.[0], standing = index === undefined ? undefined : data.sources[index]
          if (!standing?.sprite.startsWith('stand-')) throw Error('Motion recipe unavailable')
          const look = standing.sprite.slice(6)
          for (const name of [`walk-${look}-A`, `walk-${look}-pass`, `walk-${look}-B`, `wave-${look}`, `cheer-${look}`]) names.add(name)
        }
        let bytes = this.sourceBytes
        for (const name of names) {
          const source = assets.poses[name], frame = pack.sources.sprites?.[name], image = frame && pack.images.get(frame.atlas)
          if (!source || !frame || !image || source.sprite !== name || source.anchor[0] !== frame.anchor[0] || source.anchor[1] !== frame.anchor[1]) throw Error('Motion source unavailable')
          const raw = await decodeOwner.run('motion image', () => this.poseNative(image, frame, abort.signal), abort.signal)
          if (generation !== this.motionEpoch || raw.channels !== 4 || raw.width !== frame.size[0] || raw.height !== frame.size[1] || raw.data.byteLength !== raw.width * raw.height * 4) throw Error('Motion pixels unavailable')
          bytes += raw.data.byteLength; if (bytes > 2 * 1024 * 1024) throw Error('Motion sources exceed budget')
          originals.set(name, raw)
          if (source.mask) {
            const url = assets.masks[source.mask[0]]; if (!url) throw Error('Motion mask unavailable')
            const encoded = await this.read(url, abort.signal), mask = await decodeOwner.run('motion mask', () => this.poseDecode(encoded), abort.signal)
            if (generation !== this.motionEpoch) throw Error('Motion load superseded')
            bytes += mask.data.byteLength; if (bytes > 2 * 1024 * 1024) throw Error('Motion sources exceed budget')
            masks.set(name, mask)
          }
        }
        if (generation !== this.motionEpoch) return false
        this.originals.push(...[...originals.values()].map(original => original.data))
        let at = 0
        for (const mask of masks.values()) { const index = -2000000 - at++; this.masks.set(index, mask); this.motionMaskKeys.push(index) }
        this.motionAssetsData = assets; this.motionOriginals = originals; this.motionMasks = masks; this.motionKey = key
        return true
      } catch { return false }
    })()
    this.motionLoading = work
    void work.finally(() => { if (this.motionLoading === work) { this.motionLoading = null; this.motionPendingKey = '' } })
    return work
  }
  clearMotion(): void {
    this.motionEpoch++; this.motionAbort?.abort(); this.motionAbort = null
    const removed = new Set([...this.motionOriginals.values()].map(original => original.data))
    this.originals = this.originals.filter(original => !removed.has(original))
    for (const key of this.motionMaskKeys) this.masks.delete(key)
    this.motionMaskKeys = []; this.motionOriginals.clear(); this.motionMasks.clear(); this.motionAssetsData = null
    this.motionKey = ''; this.motionPendingKey = ''; this.motionLoading = null; this.cache.dropPrefix('standing:pose:')
  }
  private motionFrame(recipe: number, name: string): { canvas: HTMLCanvasElement; source: LookData['sources'][number]; width: number; height: number } | null {
    const data = this.data, index = data?.recipes[recipe]?.[0], original = this.motionOriginals.get(name), source = this.motionAssetsData?.poses[name]
    if (!data || index === undefined || !original || !source) return null
    const key = `standing:pose:${recipe}:${name}`, sources = data.sources.slice(); sources[index] = source
    const existing = this.cache.get(key), canvas = existing?.canvas ?? this.cache.put(key, composePose(original.data, this.motionMasks.get(name), { ...data, sources }, recipe, original.width, original.height), original.width, original.height)?.canvas
    return canvas ? { canvas, source, width: original.width, height: original.height } : null
  }
  frame(recipe: number): HTMLCanvasElement | null {
    if (!this.ready || !this.data) return null
    const cached = this.cache.get('standing:' + recipe)
    if (cached) return cached.canvas
    const index = this.data.recipes[recipe]?.[0], original = index === undefined ? undefined : this.originals[index]
    if (index === undefined || !original) return null
    const raw = composeStanding(original, this.masks.get(index), this.data, recipe)
    return this.cache.put('standing:' + recipe, raw, 128, 128)?.canvas ?? null
  }
  draw(ctx: CanvasRenderingContext2D, recipe: number, point: { x: number; y: number }, scale: number, pose: 'stand' | 'walk' | 'play' | 'sleep' = 'stand', elapsed = 0, facing: 1 | -1 = 1): boolean {
    if (pose === 'sleep') {
      const sleep = this.sleepFrame(recipe)
      if (sleep) { ctx.drawImage(sleep.canvas, 0, 0, sleep.width, sleep.height, point.x - sleep.source.anchor[0]! * scale, point.y - sleep.source.anchor[1]! * scale, sleep.width * scale, sleep.height * scale); return true }
    }
    const canvas = this.frame(recipe), source = this.data?.sources[this.data.recipes[recipe]?.[0] ?? -1]
    if (!canvas || !source) return false
    if (pose === 'walk' || pose === 'play') {
      const look = source.sprite.startsWith('stand-') ? source.sprite.slice(6) : ''
      const frame = pose === 'walk' ? (['A', 'pass', 'B', 'pass'] as const)[Math.floor(Math.max(0, elapsed) / 200) % 4] : null
      const gesture = (Math.floor(Math.max(0, elapsed) / 1200) + (facing < 0 ? 1 : 0)) % 2 ? 'cheer' : 'wave'
      const moving = this.motionFrame(recipe, frame ? `walk-${look}-${frame}` : `${gesture}-${look}`)
      if (!moving) return false
      ctx.save(); ctx.translate(point.x, point.y); ctx.scale(facing, 1)
      ctx.drawImage(moving.canvas, 0, 0, moving.width, moving.height, -moving.source.anchor[0]! * scale, -moving.source.anchor[1]! * scale, moving.width * scale, moving.height * scale); ctx.restore()
    } else ctx.drawImage(canvas, 0, 0, 128, 128, point.x - source.anchor[0]! * scale, point.y - source.anchor[1]! * scale, 128 * scale, 128 * scale)
    return true
  }
  original(sprite: string): NativePixels | null { const index = this.data?.sources.findIndex(source => source.sprite === sprite) ?? -1, data = this.originals[index]; return data ? { width: 128, height: 128, channels: 4, data } : null }
  get bytes(): number { return this.cache.snapshot().keys.filter(key => key.startsWith('standing:')).length * 128 * 128 * 4 }
  get sourceBytes(): number { return this.originals.reduce((n, source) => n + source.byteLength, 0) + [...this.masks.values()].reduce((n, mask) => n + mask.data.byteLength, 0) }
  release(): void {
    this.clearSleep(); this.clearMotion(); this.epoch++; this.abort?.abort(); this.abort = null; this.ready = false; this.data = null; this.originals = []; this.masks.clear()
    this.reader.release(); this.sleepAttempted = false; this.sleepKey = ''; this.sleepData = null; this.sleepOriginals = []; this.sleepMasks.clear(); this.sleepLoading = null
    this.cache.dropPrefix('standing:')
  }
}
