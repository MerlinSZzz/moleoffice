// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'

it('uses the verified alpha wall segments and retains a safe fallback for unknown art', () => {
  const fake: any = { layout: { pieces: [{ sprite: 'invented-wall', layer: 'back', x: 100, y: 200, width: 64, height: 64 }] }, pack: { sources: { sprites: { 'invented-wall': { atlas: 'invented', pixelHash: 'invented-hash', rect: [0, 0, 64, 64], trim: [0, 0], size: [64, 64], anchor: [32, 60] } } }, images: new Map([['invented', {}]]) } }
  const masks = { 'invented-wall': { pixelHash: 'invented-hash', rects: [[0, 0, 4, 64], [60, 0, 4, 64], [4, 0, 56, 4]] } }
  const pieces = (OfficeMap.prototype as any).motionFurniture.call(fake, masks)
  expect(pieces).toEqual([{ x: 100, y: 200, width: 4, height: 64 }, { x: 160, y: 200, width: 4, height: 64 }, { x: 104, y: 200, width: 56, height: 4 }])
  fake.pack.sources.sprites['invented-wall'].pixelHash = 'invented-other'
  expect((OfficeMap.prototype as any).motionFurniture.call(fake, masks)).toEqual([{ x: 100, y: 200, width: 64, height: 64 }])
})
