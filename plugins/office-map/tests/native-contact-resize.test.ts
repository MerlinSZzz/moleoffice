// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as pixels from '../src/action-pixels.ts'
import { NativeContacts } from '../src/action-contacts.ts'
import { pageCompositions } from '../src/action-resources.ts'
import type { NativePixels } from '../src/look-png.ts'
import type { ArtPack, SpriteFrame } from '../src/pack.ts'
import type { ContactPiece } from '../src/action-binding.ts'
import fixture from './native-contact-resize-fixture.json'

const require = createRequire(import.meta.url)
const { PNG } = require('playwright-core/lib/utilsBundle')
const hash = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')
const catalog = JSON.parse(readFileSync(new URL('../assets/village-catalog.json', import.meta.url), 'utf8')) as { sprites: Record<string, SpriteFrame> }
afterEach(() => vi.restoreAllMocks())

it('matches every Pillow coordinate index and all straight RGBA bytes by default', () => {
  for (const row of fixture.props) {
    const [sw, sh] = row.nativeSize as [number, number], [width, height] = row.targetSize as [number, number]
    const data = new Uint8Array(sw * sh * 4)
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) data.set([x, y, (17 * x + 31 * y) % 256, [0, 1, 127, 255][(x + y) % 4]!], (y * sw + x) * 4)
    expect(hash(data)).toBe(row.coordinateSourceSHA256)
    const before = data.slice(), expected = new Uint8Array(width * height * 4)
    row.yMap.forEach((sy, y) => row.xMap.forEach((sx, x) => expected.set(data.subarray((sy * sw + sx) * 4, (sy * sw + sx) * 4 + 4), (y * width + x) * 4)))
    expect(hash(expected)).toBe(row.coordinateOutputSHA256)
    expect(pixels.resizeNative({ width: sw, height: sh, channels: 4, data }, width, height)).toEqual(expected)
    expect(data).toEqual(before)
  }
})

it('materializes all five real native contacts with complete accepted RGBA', async () => {
  const atlases = new Map<string, NativePixels>(), originals = new Map<SpriteFrame, NativePixels>()
  for (const row of fixture.props) {
    const frame = catalog.sprites[row.key]!
    expect(frame.size).toEqual(row.nativeSize)
    if (!atlases.has(frame.atlas)) {
      const decoded = PNG.sync.read(readFileSync(new URL('../assets/' + frame.atlas + '.png', import.meta.url)))
      atlases.set(frame.atlas, { width: decoded.width, height: decoded.height, channels: 4, data: new Uint8Array(decoded.data) })
    }
    const atlas = atlases.get(frame.atlas)!, [sx, sy, width, height] = frame.rect as [number, number, number, number]
    const [fullWidth, fullHeight] = frame.size as [number, number], [tx, ty] = frame.trim as [number, number]
    const data = new Uint8Array(fullWidth * fullHeight * 4)
    for (let y = 0; y < height; y++) data.set(atlas.data.subarray(((sy + y) * atlas.width + sx) * 4, ((sy + y) * atlas.width + sx + width) * 4), ((ty + y) * fullWidth + tx) * 4)
    expect(hash(data)).toBe(row.atlasSourceSHA256)
    originals.set(frame, { width: fullWidth, height: fullHeight, channels: 4, data })
  }
  const reads = vi.spyOn(pixels, 'readNativePixels').mockImplementation(async (_image, frame) => originals.get(frame)!)
  const materialized = new Map<string, Uint8Array>()
  vi.spyOn(pageCompositions, 'put').mockImplementation((key, data, width, height, identity = null) => {
    materialized.set(key, data.slice())
    return { canvas: {} as HTMLCanvasElement, pixels: data, width, height, identity }
  })
  const pack: ArtPack = { images: new Map([...atlases.keys()].map(key => [key, {} as HTMLImageElement])), sources: { sprites: catalog.sprites, scenery: {}, portraits: {}, dimensions: {} }, bytes: 0 }
  const contacts = new NativeContacts(), drawImage = vi.fn(), context = { drawImage } as unknown as CanvasRenderingContext2D
  try {
    expect(await contacts.select(pack)).toBe(true)
    expect(reads).toHaveBeenCalledTimes(fixture.props.length)
    for (const row of fixture.props) {
      const [width, height] = row.targetSize as [number, number]
      const piece = { sprite: row.key, contactSize: [width, height], x: 0, y: 0, width, height } as ContactPiece
      expect(contacts.draw(context, piece)).toBe(true)
      const actual = materialized.get('native-contact:' + row.key + ':' + width + ':' + height)!
      expect(actual.length).toBe(width * height * 4)
      expect(hash(actual)).toBe(row.acceptedOutputSHA256)
      expect(hash(originals.get(catalog.sprites[row.key]!)!.data)).toBe(row.atlasSourceSHA256)
    }
    expect(drawImage).toHaveBeenCalledTimes(fixture.props.length)
  } finally { contacts.release() }
})

it('clears hidden RGB only when explicitly requested and retains partial alpha', () => {
  const data = new Uint8Array([17, 24, 31, 0, 29, 83, 127, 1, 207, 43, 19, 127, 9, 17, 251, 255]), before = data.slice()
  const source: NativePixels = { width: 2, height: 2, channels: 4, data }
  expect(pixels.resizeNative(source, 2, 2)).toEqual(before)
  expect(pixels.resizeNative(source, 2, 2, false)).toEqual(before)
  const expected = before.slice(); expected.fill(0, 0, 4)
  expect(pixels.resizeNative(source, 2, 2, true)).toEqual(expected)
  expect(data).toEqual(before)
})
