// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { LookFrames } from '../src/look-frames.ts'
import { Compositions } from '../src/action-resources.ts'

it('refuses a recoloured standing source whose drawing anchor disagrees with collision metadata', async () => {
  const create = () => ({ width: 1, height: 1 }) as HTMLCanvasElement
  const data = { palettes: [], recipes: [[0, 0]], sources: [{ sprite: 'stand-invented', anchor: [10, 20], mask: null, map: [] }] }
  const frame = { atlas: 'invented', rect: [0, 0, 128, 128], trim: [0, 0], size: [128, 128], anchor: [40, 80] }
  const pack: any = { sources: { sprites: { 'stand-invented': frame } }, images: new Map([['invented', {}]]) }
  const frames = new (LookFrames as any)(async () => ({ data, masks: {} }), async () => new Uint8Array(), create, async () => new Uint8Array(128 * 128 * 4), new Compositions(create))
  expect(await frames.select(pack)).toBe(false)
  frames.release()
})
