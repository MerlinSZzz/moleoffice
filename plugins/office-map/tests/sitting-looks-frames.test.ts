// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import village from '../assets/village-catalog.json'
import sitting from '../assets/sitting-looks/sitting.json'
import standingRecipes from '../assets/standing-looks/recipes.json'

const looks = ['tuft', 'fringe', 'bun', 'fan', 'crest', 'helmet', 'waves', 'part', 'beret', 'knit', 'raincoat', 'apron', 'bowtie', 'backpack', 'roll', 'flower', 'gardener', 'mapmaker', 'runner']
const recoloured = looks.filter(look => look !== 'bun' && look !== 'crest')
const names = (look: string) => [`sit-${look}-down`, `sit-${look}`, `sit-${look}-up`]
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const file = (name: string) => readFileSync(new URL(`../assets/sitting-looks/${name}`, import.meta.url))
type Sprite = { atlas: string; size: number[]; anchor: number[]; trim: number[]; rect: number[]; pixelHash: string }
type Source = { sprite: string; anchor: number[]; mask: [string, number[]]; map: number[][] }

// The cut aligns the largest connected figure; detached whiskers and other marks do not set its centre.
function largestBox(canvas: Buffer) {
  const seen = new Uint8Array(128 * 128)
  let best = { count: 0, left: 0, right: 0 }
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || !canvas[start * 4 + 3]) continue
    const stack = [start]; seen[start] = 1
    let count = 0, left = 128, right = 0
    while (stack.length) {
      const at = stack.pop()!, x = at % 128, y = Math.floor(at / 128)
      count++; left = Math.min(left, x); right = Math.max(right, x + 1)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * 128 + nx
        if (nx >= 0 && nx < 128 && ny >= 0 && ny < 128 && !seen[next] && canvas[next * 4 + 3]) {
          seen[next] = 1; stack.push(next)
        }
      }
    }
    if (count > best.count) best = { count, left, right }
  }
  return best
}

it('keeps every sitting look grounded, intact, and recolourable', async () => {
  const atlases = sitting.atlases as Record<string, { size: number[]; bytes: number; decodedBytes: number; sha256: string }>
  const sprites = sitting.sprites as Record<string, Sprite>
  expect(Object.keys(atlases)).toEqual(looks.map(look => `sitting-looks/${look}-sit`))
  expect(Object.keys(sprites)).toEqual(looks.flatMap(names))
  const recipes = JSON.parse(file('recipes.json').toString()) as { palettes: unknown[]; recipes: unknown[]; sources: Source[] }
  expect(recipes.palettes).toEqual(standingRecipes.palettes)
  expect(recipes.recipes).toEqual(standingRecipes.recipes)
  expect(recipes.sources.map(source => source.sprite)).toEqual(recoloured.flatMap(names))
  for (const look of looks) {
    const atlasName = `sitting-looks/${look}-sit`, atlas = atlases[atlasName]!, bytes = file(`${look}-sit.png`)
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(hash(bytes)).toBe(atlas.sha256)
    expect(bytes.length).toBe(atlas.bytes)
    expect([info.width, info.height]).toEqual(atlas.size)
    expect(info.width * info.height * 4).toBe(atlas.decodedBytes)
    const mask = recoloured.includes(look) ? await sharp(file(`${look}-sit-mask.png`)).greyscale().raw().toBuffer({ resolveWithObject: true }) : null
    if (mask) expect([mask.info.width, mask.info.height]).toEqual(atlas.size)
    const stand = (village.sprites as Record<string, Sprite>)[`stand-${look}`]!
    const standBytes = readFileSync(new URL(`../assets/${stand.atlas}.png`, import.meta.url))
    const standImage = await sharp(standBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const [sx, sy, sw, sh] = stand.rect as [number, number, number, number]
    const [sl, st] = stand.trim as [number, number, number, number]
    const standCanvas = Buffer.alloc(128 * 128 * 4)
    for (let row = 0; row < sh; row++) standImage.data.copy(standCanvas, ((st + row) * 128 + sl) * 4, ((sy + row) * standImage.info.width + sx) * 4, ((sy + row) * standImage.info.width + sx + sw) * 4)
    const standBox = largestBox(standCanvas)
    for (const name of names(look)) {
      const sprite = sprites[name]!
      expect(sprite.atlas).toBe(atlasName)
      expect(sprite.size).toEqual([128, 128]); expect(sprite.anchor).toEqual([64, 111])
      const [x, y, w, h] = sprite.rect as [number, number, number, number]
      const [left, top, right, bottom] = sprite.trim as [number, number, number, number]
      expect([right - left, bottom - top]).toEqual([w, h])
      expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0)
      expect(x + w).toBeLessThanOrEqual(info.width); expect(y + h).toBeLessThanOrEqual(info.height)
      expect(left).toBeGreaterThanOrEqual(0); expect(top).toBeGreaterThanOrEqual(0)
      expect(right).toBeLessThanOrEqual(128); expect(bottom).toBeLessThanOrEqual(128)
      const canvas = Buffer.alloc(128 * 128 * 4), colours = new Set<number>()
      for (let row = 0; row < h; row++) data.copy(canvas, ((top + row) * 128 + left) * 4, ((y + row) * info.width + x) * 4, ((y + row) * info.width + x + w) * 4)
      expect(hash(canvas)).toBe(sprite.pixelHash)
      let lowest = -1
      for (let pixel = 0; pixel < 128 * 128; pixel++) {
        const alpha = canvas[pixel * 4 + 3]!
        expect(alpha === 0 || alpha === 255).toBe(true)
        if (alpha) lowest = Math.floor(pixel / 128)
      }
      expect(lowest).toBe(111)
      const figureBox = largestBox(canvas)
      expect([0, 1]).toContain((figureBox.left + figureBox.right) - (standBox.left + standBox.right))
      if (!mask) continue
      const source = recipes.sources.find(s => s.sprite === name)!
      expect(source.anchor).toEqual([64, 111]); expect(source.mask).toEqual([`${look}-sit-mask.png`, sprite.trim])
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const at = ((y + yy) * info.width + x + xx), rgba = at * 4
        if (!mask.data[at]) continue
        expect(data[rgba + 3]).toBe(255)
        colours.add((data[rgba]! << 16) | (data[rgba + 1]! << 8) | data[rgba + 2]!)
      }
      expect(source.map.map(row => row[0]).sort((a, b) => a! - b!)).toEqual([...colours].sort((a, b) => a - b))
      for (const [colour, ...indices] of source.map) {
        expect(colours.has(colour!)).toBe(true)
        for (let i = 0; i < indices.length; i++) expect((recipes.palettes[i] as unknown[])[indices[i]!]).toBeDefined()
      }
    }
    if (mask) for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const at = y * info.width + x
      if (mask.data[at]) expect(data[at * 4 + 3]).toBe(255)
    }
  }
}, 60_000)
