// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { SCENERY_TILE_BYTES } from '../src/scenery-tiles.ts'
import { piece } from '../src/village.ts'

afterEach(() => { releaseMapSurfaces(); vi.unstubAllGlobals() })
it.each(['tree-assembled', 'pine-tree', 'B56'])('caches native %s once and composites the whole object at its scene position', sprite => {
  const atlas = {}, native: unknown[][] = [], composites: unknown[][] = []
  const canvas = () => ({ width: 1, height: 1, getContext: () => ({ drawImage: (...args: unknown[]) => native.push(args), getImageData: () => ({ data: new Uint8Array(4) }) }) })
  vi.stubGlobal('document', { createElement: canvas })
  const pack = { sources: { sprites: { [sprite]: { atlas: 'generated', rect: [10, 20, 78, 156], trim: [0, 0], size: [78, 156], anchor: [39, 153] } } }, images: new Map([['generated', atlas]]) }
  const target = { pack, tiles: new Map() }, ctx = { drawImage: (...args: unknown[]) => composites.push(args) }
  const p = { ...piece(sprite, 100, 200, null), width: 39, height: 78, scale: .5 }
  ;(OfficeMap.prototype as any).drawPiece.call(target, ctx, p)
  ;(OfficeMap.prototype as any).drawPiece.call(target, ctx, { ...p, x: 300 })
  expect(native).toHaveLength(1)
  expect(native[0]![0]).toBe(atlas)
  expect(composites).toHaveLength(2)
  expect(composites.map(a => a.slice(1))).toEqual([[100, 200, 39, 78], [300, 200, 39, 78]])
  expect(composites[0]![0]).toBe(composites[1]![0])
  expect([...target.tiles.values()].reduce((n, c) => n + c.width * c.height * 4, 0)).toBeLessThanOrEqual(SCENERY_TILE_BYTES)
})
