// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { LookId } from './appearance.ts'
import type { Rect } from './viewport.ts'
import { decodeOwner } from './action-resources.ts'

/** A frame marked `turned` is drawn turned round in its own canvas, left for right. */
export interface SpriteFrame { atlas: string; rect: readonly number[]; trim: readonly number[]; size: readonly number[]; anchor: readonly number[]; turned?: boolean }
export interface PackSources { atlases?: Record<string, string>; sprites?: Record<string, SpriteFrame>; scenery: Record<string, string>; portraits: Partial<Record<LookId, string>>; dimensions: Record<string, readonly [number, number]> }
export interface ArtPack { images: Map<string, HTMLImageElement>; sources: PackSources; bytes: number; touched?: Set<string> }
export const ATLAS_BYTES = 24 * 1024 * 1024

/** Only the selected registry entry is imported. Pending image loads are cancelled on close. */
export class SelectedPack {
  private epoch = 0
  private pending = new Set<HTMLImageElement>()
  private decoding = new Set<HTMLImageElement>()
  private pack: ArtPack | null = null
  constructor(private load: (id: string) => Promise<PackSources> = async id => {
    if (id !== 'woodland') throw new Error('Pack unavailable')
    const module = await import('./assets.ts')
    return { scenery: module.woodland, portraits: module.portraits, dimensions: module.dimensions, atlases: module.atlases, sprites: module.sprites }
  }, private create: () => HTMLImageElement = () => new Image()) {}
  async select(id: string): Promise<ArtPack | null> {
    this.release()
    const epoch = this.epoch
    try {
      const sources = await this.load(id)
      if (epoch !== this.epoch) return null
      const pack: ArtPack = { sources, images: new Map(), bytes: 0 }
      // Sequential decode bounds the temporary buffer to one asset.
      for (const [key, src] of Object.entries({ ...sources.scenery, ...sources.portraits, ...sources.atlases })) {
        const size = sources.dimensions[key]
        const expectedBytes = size ? size[0] * size[1] * 4 : 0
        if (!expectedBytes || expectedBytes > 4 * 1024 * 1024 || pack.bytes + expectedBytes > ATLAS_BYTES) throw new Error('Pack exceeds the bitmap budget')
        const image = this.create(); this.pending.add(image)
        // Built plugin files allow anonymous cross-origin reads, including the opaque
        // sandbox origin. Keep the canvas readable for bounded raster materialization.
        image.crossOrigin = 'anonymous'
        image.decoding = 'async'
        const bytes = await decodeOwner.run('native image', async () => {
        try {
        if (epoch !== this.epoch) throw Error('Pack superseded')
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Image unavailable')); image.src = src })
        if (epoch !== this.epoch) { image.src = ''; throw Error('Pack superseded') }
        const bytes = image.naturalWidth * image.naturalHeight * 4
        if (bytes !== expectedBytes) { image.src = ''; throw new Error('Image dimensions differ from the pack') }
        // Finish pixel decoding before a later canvas read can force it synchronously.
        this.decoding.add(image)
        try { await image.decode() } finally { this.decoding.delete(image) }
        if (epoch !== this.epoch) { image.src = ''; throw Error('Pack superseded') }
        return bytes
        } finally { if (epoch !== this.epoch) { image.onload = null; image.onerror = null; image.src = ''; this.pending.delete(image) } }
        })
        if (epoch !== this.epoch) return null
        this.pending.delete(image); image.onload = null; image.onerror = null
        pack.bytes += bytes; pack.images.set(key, image)
        // Keep partial work owned so a failed or superseded load releases every decoded asset.
        this.pack = pack
      }
      this.pack = pack
      return pack
    } catch { if (epoch === this.epoch) this.release(); return null }
  }
  release(): void {
    this.epoch++
    for (const image of this.pending) {
      if (this.decoding.has(image)) continue
      image.onerror?.(new Event('error')); image.onload = null; image.onerror = null; image.src = ''
    }
    this.pending.clear()
    const retired = this.pack; this.pack = null
    if (retired) decodeOwner.acquire('native release', finish => {
      try { for (const image of retired.images.values()) image.src = ''; retired.images.clear() } finally { finish() }
    })
  }
}

/**
 * Pay each image's first canvas use in its own bounded turn, before any paint sees the pack.
 * Chromium copies a whole decoded image on its first draw into a canvas and materializes that
 * copy in the following readback; on a 4 MB atlas that was a 22-25 ms native step inside a
 * painting or index turn. A 1x1 draw followed by a 1x1 read pays the same one-time copy without
 * allocating another decoded atlas, and later draws from the untouched image are cheap. One
 * image per turn: the largest atlas cannot share a turn with another first-use copy.
 */
export function* packTouchSteps(pack: ArtPack, create: () => HTMLCanvasElement = () => document.createElement('canvas')): Generator<void> {
  const touched = pack.touched ?? (pack.touched = new Set<string>())
  let scratch: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null
  for (const [key, image] of pack.images) {
    if (touched.has(key)) { yield; continue }
    if (!scratch) {
      scratch = create(); scratch.width = 1; scratch.height = 1
      ctx = scratch.getContext('2d', { willReadFrequently: true })
    }
    if (!ctx) return
    ctx.clearRect(0, 0, 1, 1)
    ctx.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1)
    ctx.getImageData(0, 0, 1, 1)
    touched.add(key)
    yield
  }
}

/** Where a frame's picture lands in its own canvas, in canvas pixels. A turned frame's picture
 * is turned round in the canvas, so it lands as far from the right side as the trim puts it
 * from the left: its left edge is the canvas width less the trim's left and the picture's width. */
export function landing(frame: SpriteFrame): Rect {
  const [, , width = 0, height = 0] = frame.rect, [tx = 0, ty = 0] = frame.trim, [canvas = 0] = frame.size
  return { x: frame.turned ? canvas - tx - width : tx, y: ty, width, height }
}

/** Draw a native frame, preserving its full-canvas origin after lossless atlas trimming. */
export function drawSprite(ctx: CanvasRenderingContext2D, pack: ArtPack | null, key: string, x: number, y: number, scale = 1, crop?: Rect): boolean {
  const frame = pack?.sources.sprites?.[key]
  if (frame?.turned && crop) throw new Error(`${key} is turned and takes no crop`)
  const image = frame ? pack?.images.get(frame.atlas) : undefined
  if (!frame || !image) return false
  const [sx = 0, sy = 0, width = 0, height = 0] = frame.rect, [tx = 0, ty = 0] = frame.trim
  if (frame.turned) {
    const at = landing(frame)
    ctx.save(); ctx.translate(x + (at.x + at.width) * scale, y + at.y * scale); ctx.scale(-1, 1)
    ctx.drawImage(image, sx, sy, width, height, 0, 0, width * scale, height * scale)
    ctx.restore()
    return true
  }
  if (crop) {
    const left = Math.max(tx, crop.x), top = Math.max(ty, crop.y), right = Math.min(tx + width, crop.x + crop.width), bottom = Math.min(ty + height, crop.y + crop.height)
    if (right > left && bottom > top) ctx.drawImage(image, sx + left - tx, sy + top - ty, right - left, bottom - top, x + (left - crop.x) * scale, y + (top - crop.y) * scale, (right - left) * scale, (bottom - top) * scale)
    return true
  }
  ctx.drawImage(image, sx, sy, width, height, x + tx * scale, y + ty * scale, width * scale, height * scale)
  return true
}

/** A shared native ground origin keeps the head's registered motion intact through an instant flip. */
export function drawAnchoredSprite(ctx: CanvasRenderingContext2D, pack: ArtPack | null, key: string, point: { x: number; y: number }, scale: number, facing: 1 | -1 = 1): boolean {
  const frame = pack?.sources.sprites?.[key]
  if (!frame || !scale) return false
  ctx.save(); ctx.translate(point.x, point.y); ctx.scale(facing, 1)
  const drawn = drawSprite(ctx, pack, key, -frame.anchor[0]! * scale, -frame.anchor[1]! * scale, scale)
  ctx.restore()
  return drawn
}
