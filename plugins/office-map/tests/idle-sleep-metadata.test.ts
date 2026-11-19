// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it, vi } from 'vitest'
import { LookFrames } from '../src/look-frames.ts'
import { Compositions } from '../src/action-resources.ts'

it.each(['anchor', 'identity'])('refuses a sleep composition with inconsistent %s metadata', async issue => {
  class Canvas { width = 1; height = 1; getContext() { return { putImageData() {} } } }
  const create = () => new Canvas() as unknown as HTMLCanvasElement
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  const standing = { palettes: [], recipes: [[0, 0]], sources: [{ sprite: 'stand-invented', anchor: [64, 110], mask: null, map: [] }] }
  const sleeping = { palettes: [], recipes: [[0, 0]], sources: [{ sprite: issue === 'identity' ? 'sleep-other' : 'sleep-invented', anchor: issue === 'anchor' ? [32, 100] : [64, 110], mask: null, map: [] }] }
  const sprite = (atlas: string) => ({ atlas, rect: [0, 0, 128, 128], trim: [0, 0], size: [128, 128], anchor: [64, 110] })
  const pack: any = { sources: { sprites: { 'stand-invented': sprite('stand'), 'sleep-invented': sprite('sleep'), 'sleep-other': sprite('sleep') } }, images: new Map([['stand', {}], ['sleep', {}]]) }
  try {
    const frames = new (LookFrames as any)(async () => ({ data: standing, masks: {} }), async () => new Uint8Array(), create, async () => new Uint8Array(128 * 128 * 4), new Compositions(create),
      async () => ({ data: sleeping, masks: {} }), async () => ({ width: 128, height: 128, channels: 4, data: new Uint8Array(128 * 128 * 4) }))
    expect(await frames.select(pack)).toBe(true)
    expect(await frames.prepareSleep(pack, [0])).toBe(false)
    frames.release()
  } finally { vi.unstubAllGlobals() }
})
