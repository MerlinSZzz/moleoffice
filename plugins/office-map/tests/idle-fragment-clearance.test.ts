// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'

it('maps each wall alpha fragment to the same cropped destination as drawing', () => {
  const frame = { atlas: 'invented', rect: [0, 0, 100, 50], trim: [0, 0], size: [100, 50], anchor: [0, 0], pixelHash: 'invented-hash' }
  const fragments = [{ x: 0, y: 0, crop: { x: 0, y: 0, width: 25, height: 40 } }, { x: 125, y: 0, crop: { x: 75, y: 0, width: 25, height: 40 } }]
  const piece: any = { sprite: 'invented-wall', layer: 'front', x: 100, y: 200, width: 300, height: 100, scale: 2, fragments }
  const fake: any = { layout: { pieces: [piece] }, pack: { sources: { sprites: { 'invented-wall': frame } }, images: new Map([['invented', {}]]) } }
  const masks = { 'invented-wall': { pixelHash: 'invented-hash', rects: [[0, 0, 10, 10], [80, 0, 20, 10]] } }
  const furniture = (OfficeMap.prototype as any).motionFurniture
  expect(furniture.call(fake, masks)).toEqual([{ x: 100, y: 200, width: 20, height: 20 }, { x: 360, y: 200, width: 40, height: 20 }])
  piece.fragments = []
  expect(furniture.call(fake, masks)).toBeNull()
  piece.fragments = [{ x: 0, y: 0, crop: { x: 95, y: 0, width: 20, height: 10 } }]
  expect(furniture.call(fake, masks)).toBeNull()
})
