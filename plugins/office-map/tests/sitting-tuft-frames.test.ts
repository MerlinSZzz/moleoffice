// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import catalog from '../assets/sitting-looks/sitting.json'
import villageCatalog from '../assets/village-catalog.json'

type Sprite = { atlas: string; size: number[]; anchor: number[]; trim: number[]; rect: number[]; pixelHash: string }

it('keeps the three sitting tuft frames grounded and intact on their own picture', async () => {
  const sprites = catalog.sprites as Record<string, Sprite>
  const names = ['sit-tuft-down', 'sit-tuft', 'sit-tuft-up']
  expect(Object.keys(sprites).filter(name => name === 'sit-tuft' || name.startsWith('sit-tuft-')).sort()).toEqual([...names].sort())
  expect(Object.keys(villageCatalog.sprites).filter(name => name.startsWith('sit-'))).toEqual([])
  const bytes = readFileSync(new URL('../assets/sitting-looks/tuft-sit.png', import.meta.url))
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const atlas = catalog.atlases['sitting-looks/tuft-sit']
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(atlas.sha256)
  expect(bytes.length).toBe(atlas.bytes)
  expect([info.width, info.height]).toEqual(atlas.size)
  expect(info.width * info.height * 4).toBe(atlas.decodedBytes)
  for (const name of names) {
    const sprite = sprites[name]!
    expect(sprite).toBeDefined()
    expect(sprite.atlas).toBe('sitting-looks/tuft-sit')
    expect(sprite.size).toEqual([128, 128])
    expect(sprite.anchor).toEqual([64, 111])
    const [x, y, w, h] = sprite.rect as [number, number, number, number]
    const [left, top, right, bottom] = sprite.trim as [number, number, number, number]
    expect([right - left, bottom - top]).toEqual([w, h])
    expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0)
    expect(x + w).toBeLessThanOrEqual(info.width); expect(y + h).toBeLessThanOrEqual(info.height)
    expect(left).toBeGreaterThanOrEqual(0); expect(top).toBeGreaterThanOrEqual(0)
    expect(left + w).toBeLessThanOrEqual(128); expect(top + h).toBeLessThanOrEqual(128)
    const canvas = Buffer.alloc(128 * 128 * 4)
    for (let row = 0; row < h; row++) data.copy(canvas, ((top + row) * 128 + left) * 4, ((y + row) * info.width + x) * 4, ((y + row) * info.width + x + w) * 4)
    expect(createHash('sha256').update(canvas).digest('hex')).toBe(sprite.pixelHash)
    let lowest = -1
    for (let pixel = 0; pixel < 128 * 128; pixel++) {
      const alpha = canvas[pixel * 4 + 3]!
      expect(alpha === 0 || alpha === 255).toBe(true)
      if (alpha === 255) lowest = Math.floor(pixel / 128)
    }
    expect(lowest).toBe(111)
  }
})
