// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { drawSprite, landing, type ArtPack, type SpriteFrame } from '../src/pack.ts'
import { deskSprites } from '../src/desk-art.ts'
import { dimensions, sprites as bundled } from '../src/assets.ts'
import catalog from '../assets/village-catalog.json'
// @ts-expect-error The PNG reader is shared with the JS picture tools.
import { pixels } from './png-pixels.mjs'

type Picture = { width: number; height: number; channels: number; data: Uint8Array }
const sprites = bundled as Record<string, SpriteFrame>

// A canvas that keeps what it is given: drawImage fills every map pixel whose centre lies in the
// drawn box, under the current translate and scale, with the source pixel that centre falls on.
class Recording {
  readonly pixels = new Map<string, string>()
  private matrix = [1, 1, 0, 0]
  private saved: number[][] = []
  save() { this.saved.push([...this.matrix]) }
  restore() { this.matrix = this.saved.pop()! }
  translate(x: number, y: number) { const [a, d, e, f] = this.matrix as [number, number, number, number]; this.matrix = [a, d, e + a * x, f + d * y] }
  scale(x: number, y: number) { const [a, d, e, f] = this.matrix as [number, number, number, number]; this.matrix = [a * x, d * y, e, f] }
  drawImage(img: Picture, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
    const [a, d, e, f] = this.matrix as [number, number, number, number], xs = [e + a * dx, e + a * (dx + dw)], ys = [f + d * dy, f + d * (dy + dh)]
    for (let y = Math.floor(Math.min(...ys)); y < Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++) {
      const ux = (x + .5 - e) / a, uy = (y + .5 - f) / d
      if (ux < dx || ux >= dx + dw || uy < dy || uy >= dy + dh) continue
      this.pixels.set(`${x},${y}`, colour(img, Math.floor(sx + (ux - dx) * sw / dw), Math.floor(sy + (uy - dy) * sh / dh)))
    }
  }
  box() {
    const at = [...this.pixels.keys()].map(k => k.split(',').map(Number) as [number, number]), xs = at.map(([x]) => x), ys = at.map(([, y]) => y)
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 }
  }
}
const colour = (img: Picture, u: number, v: number) => { const at = (v * img.width + u) * img.channels; return [...img.data.subarray(at, at + 4)].join(' ') }
const draw = (pack: ArtPack, key: string, x: number, y: number, scale = 1) => { const ctx = new Recording(); return { drawn: drawSprite(ctx as unknown as CanvasRenderingContext2D, pack, key, x, y, scale), ctx } }
const packOf = (frames: Record<string, SpriteFrame>, images: Record<string, Picture>) =>
  ({ sources: { sprites: frames, scenery: {}, portraits: {}, dimensions: {} }, images: new Map(Object.entries(images)), bytes: 0 }) as unknown as ArtPack

const lamp = catalog.sprites['desk-lamp'], atlas = pixels(new URL(`../assets/${lamp.atlas}.png`, import.meta.url)) as Picture

it('registers the lamp at the right end as the lamp\'s own place in its atlas, marked to be turned at draw time', () => {
  expect(deskSprites).toHaveProperty(['desk-lamp-right'])
  expect(deskSprites['desk-lamp-right']).toEqual({ atlas: lamp.atlas, rect: lamp.rect, trim: lamp.trim, size: lamp.size, anchor: [lamp.size[0]! - lamp.anchor[0]!, lamp.anchor[1]], turned: true })
  expect(sprites['desk-lamp-right']).toBe(deskSprites['desk-lamp-right'])
  // It is no picture of its own: its atlas keeps the size the catalogue gives it.
  expect(dimensions[lamp.atlas]).toEqual(catalog.atlases[lamp.atlas as keyof typeof catalog.atlases].size)
})

// Map column x + u of the lamp at the right end shows column 39 - u of the lamp, the lamp's
// picture being 40 columns wide; at scale 2, map column x + u shows column 39 - floor(u / 2).
it.each([1, 2])('draws the lamp at the right end as the lamp turned round, column for column, at scale %i', scale => {
  const pack = packOf(sprites, { [lamp.atlas]: atlas }), [rx, ry, width, height] = lamp.rect as [number, number, number, number], x = 10, y = 20
  const left = draw(pack, 'desk-lamp', x, y, scale), right = draw(pack, 'desk-lamp-right', x, y, scale)
  expect([left.drawn, right.drawn]).toEqual([true, true])
  const unlike: string[] = []
  for (let v = 0; v < height * scale; v++) for (let u = 0; u < width * scale; u++) {
    const want = colour(atlas, rx + width - 1 - Math.floor(u / scale), ry + Math.floor(v / scale)), got = right.ctx.pixels.get(`${x + u},${y + v}`)
    if (got !== want) unlike.push(`${u},${v} is ${got}, not ${want}`)
    // The recording itself: the lamp drawn unturned shows its own column there.
    if (left.ctx.pixels.get(`${x + u},${y + v}`) !== colour(atlas, rx + Math.floor(u / scale), ry + Math.floor(v / scale))) unlike.push(`the lamp at ${u},${v}`)
  }
  expect(unlike.slice(0, 5)).toEqual([])
  expect(right.ctx.pixels.size).toBe(width * height * scale * scale)
})

// An invented frame, trimmed on every side, in an invented picture of distinct pixels: turned,
// it shows each pixel where the unturned frame shows it mirrored in its own canvas, and it lands
// where landing() says, the box the desk measurements read.
it('draws a trimmed frame turned round inside its own canvas, where landing() says it lands', () => {
  const picture: Picture = { width: 12, height: 6, channels: 4, data: new Uint8Array(12 * 6 * 4).map((_, i) => i % 4 === 3 ? 255 : (i * 7) % 251) }
  const plain: SpriteFrame = { atlas: 'invented-sheet', rect: [5, 3, 4, 2], trim: [1, 1, 5, 3], size: [8, 4], anchor: [4, 3] }, turned: SpriteFrame = { ...plain, turned: true }
  const pack = packOf({ plain, turned }, { 'invented-sheet': picture }), x = 30, y = 40
  const a = draw(pack, 'plain', x, y), b = draw(pack, 'turned', x, y), [w] = plain.size as [number]
  expect([a.drawn, b.drawn]).toEqual([true, true])
  const mirrored = new Map([...a.ctx.pixels].map(([k, c]) => { const [px, py] = k.split(',').map(Number) as [number, number]; return [`${x + w - 1 - (px - x)},${py}`, c] }))
  expect(new Map([...b.ctx.pixels].sort())).toEqual(new Map([...mirrored].sort()))
  const box = b.ctx.box()
  expect(landing(turned)).toEqual({ x: box.x - x, y: box.y - y, width: box.width, height: box.height })
  // Its 4-column picture starts 1 column in from the left of an 8-column canvas, so turned it
  // starts 8 - 1 - 4 = 3 columns in.
  expect(landing(turned)).toEqual({ x: 3, y: 1, width: 4, height: 2 })
})

// A crop is a box of the unturned canvas, and drawSprite cannot say which part of a turned
// frame it means, so it refuses, even before the picture has loaded, rather than draw nothing.
it('refuses to draw a turned frame with a crop, with an error that says so', () => {
  const crop = { x: 0, y: 0, width: 20, height: 20 }
  for (const pack of [packOf(sprites, { [lamp.atlas]: atlas }), packOf(sprites, {})]) {
    const ctx = new Recording()
    expect(() => drawSprite(ctx as unknown as CanvasRenderingContext2D, pack, 'desk-lamp-right', 0, 0, 1, crop)).toThrow(/desk-lamp-right.*turned.*crop/)
    expect(ctx.pixels.size).toBe(0)
  }
})
