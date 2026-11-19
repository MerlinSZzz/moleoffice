// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it, vi } from 'vitest'
import { LookFrames } from '../src/look-frames.ts'
import { Compositions } from '../src/action-resources.ts'

it('prepares a needed sleeper and moving pose together without loading unrelated sleepers', async () => {
  class Canvas { width = 1; height = 1; getContext() { return { putImageData() {} } } }
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  const create = () => new Canvas() as unknown as HTMLCanvasElement
  const standing = { palettes: [], recipes: [[0, 1], [1, 1]], sources: Array.from({ length: 16 }, (_, i) => ({ sprite: `stand-invented-${i}`, anchor: [64, 110], mask: null, map: [] })) }
  const sleeping = { palettes: [], recipes: [[0, 1], [1, 1]], sources: Array.from({ length: 16 }, (_, i) => ({ sprite: `sleep-invented-${i}`, anchor: [64, 110], mask: null, map: [] })) }
  const names = [0, 1].flatMap(i => [`walk-invented-${i}-A`, `walk-invented-${i}-pass`, `walk-invented-${i}-B`, `wave-invented-${i}`, `cheer-invented-${i}`])
  const poses = Object.fromEntries(names.map(name => [name, { sprite: name, anchor: [64, 110], mask: null, map: [] }]))
  const sprites: Record<string, any> = {}, images = new Map<string, any>()
  for (const name of [...standing.sources.map(s => s.sprite), ...sleeping.sources.map(s => s.sprite), ...names]) {
    sprites[name] = { atlas: name, rect: [0, 0, 128, 128], trim: [0, 0], size: [128, 128], anchor: [64, 110] }; images.set(name, {})
  }
  const pack: any = { sources: { sprites }, images }, sleepReads: string[] = []
  try {
    const frames = new (LookFrames as any)(async () => ({ data: standing, masks: {} }), async () => new Uint8Array([1]), create,
      async () => new Uint8Array(128 * 128 * 4), new Compositions(create),
      async () => ({ data: sleeping, masks: {} }), async (_image: any, frame: any) => { sleepReads.push(frame.atlas); return { width: 128, height: 128, channels: 4, data: new Uint8Array(128 * 128 * 4) } }, undefined,
      async () => ({ poses, masks: {} }), async () => ({ width: 128, height: 128, channels: 4, data: new Uint8Array(128 * 128 * 4) }))
    expect(await frames.select(pack)).toBe(true)
    expect(await frames.prepareMotion(pack, [0, 1])).toBe(true)
    expect(await frames.prepareSleep(pack, [0])).toBe(true)
    expect(sleepReads).toEqual(['sleep-invented-0'])
    const ctx = { save() {}, restore() {}, translate() {}, scale() {}, drawImage() {} }
    expect(frames.draw(ctx, 0, { x: 0, y: 0 }, 1, 'sleep')).toBe(true)
    expect(frames.draw(ctx, 0, { x: 0, y: 0 }, 1, 'walk', 0, 1)).toBe(true)
    expect(frames.draw(ctx, 1, { x: 0, y: 0 }, 1, 'walk', 400, -1)).toBe(true)
    frames.release()
  } finally { vi.unstubAllGlobals() }
})
