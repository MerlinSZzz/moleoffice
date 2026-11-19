// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it, vi } from 'vitest'
import { LookFrames } from '../src/look-frames.ts'
import { Compositions } from '../src/action-resources.ts'

it('recolours actual gait and play frames, preserves facing, and releases them', async () => {
  class Canvas {
    width = 1; height = 1; pixels: Uint8Array | null = null
    getContext() { return { putImageData: (image: { data: Uint8Array }) => { this.pixels = new Uint8Array(image.data) } } }
  }
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  const canvases: Canvas[] = [], create = () => { const canvas = new Canvas(); canvases.push(canvas); return canvas as unknown as HTMLCanvasElement }
  const data = { palettes: [[[40, 50, 60]]], recipes: [[0, 1]], sources: [{ sprite: 'stand-invented', anchor: [64, 110], mask: null, map: [] }] }
  const names = ['walk-invented-A', 'walk-invented-pass', 'walk-invented-B', 'wave-invented', 'cheer-invented']
  const poses = Object.fromEntries(names.map(name => [name, { sprite: name, anchor: [1, 2], mask: ['invented-mask', [0, 0, 2, 1]], map: [[0x010203, 0]] }]))
  const sprites: Record<string, any> = { 'stand-invented': { atlas: 'stand', rect: [0, 0, 128, 128], trim: [0, 0], size: [128, 128], anchor: [64, 110] } }
  const images = new Map<string, any>([['stand', {}]])
  names.forEach((name, index) => {
    sprites[name] = { atlas: name, rect: [0, 0, 2, 2], trim: [0, 0], size: [2, 2], anchor: [1, 2] }
    images.set(name, { pixels: new Uint8Array([1, 2, 3, 255, index + 10, 8, 9, 255, 0, 0, 0, 0, 0, 0, 0, 0]) })
  })
  const pack: any = { sources: { sprites }, images }
  try {
    const frames = new (LookFrames as any)(async () => ({ data, masks: {} }), async () => new Uint8Array([1]), create,
      async () => new Uint8Array(128 * 128 * 4), new Compositions(create), undefined, undefined, undefined,
      async () => ({ poses, masks: { 'invented-mask': 'data:invented' } }),
      async (image: any) => ({ width: 2, height: 2, channels: 4, data: image.pixels }),
      async () => ({ width: 2, height: 1, channels: 1, data: new Uint8Array([255, 0]) }))
    expect(await frames.select(pack)).toBe(true)
    expect(await frames.prepareMotion(pack, [0])).toBe(true)
    let pixels: Uint8Array | null = null, facing = 0
    const ctx = { save() {}, restore() {}, translate() {}, scale(x: number) { facing = x }, drawImage(canvas: any) { pixels = canvas.pixels } }
    for (const [elapsed, expected] of [[0, 10], [200, 11], [400, 12], [600, 11]] as const) {
      expect(frames.draw(ctx, 0, { x: 20, y: 30 }, 1, 'walk', elapsed, -1)).toBe(true)
      expect([...(pixels as unknown as Uint8Array).slice(0, 8)]).toEqual([40, 50, 60, 255, expected, 8, 9, 255])
      expect(facing).toBe(-1)
    }
    frames.draw(ctx, 0, { x: 20, y: 30 }, 1, 'play', 0, -1)
    expect((pixels as unknown as Uint8Array)[4]).toBe(14)
    frames.release()
    expect(canvases.every(canvas => canvas.width === 1 && canvas.height === 1)).toBe(true)
  } finally { vi.unstubAllGlobals() }
})
