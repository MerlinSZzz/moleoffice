// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { standingLooks } from '../src/appearance.ts'
import { sleepSprites } from '../src/sleep-art.ts'

it('registers a distinct native sleep image for every approved base look', () => {
  const entries = sleepSprites as Record<string, { atlas: string; size: readonly number[] }>
  const hashes = new Set<string>()
  for (const look of standingLooks) {
    const frame = entries[`sleep-${look}`]
    expect(frame, look).toBeDefined()
    const image = readFileSync(new URL(`../assets/${frame!.atlas}.png`, import.meta.url))
    expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual(frame!.size)
    hashes.add(createHash('sha256').update(image).digest('hex'))
  }
  expect(hashes.size).toBe(standingLooks.length)
  expect(createHash('sha256').update(readFileSync(new URL('../assets/round89-sleep-art/tuft-sleep.png', import.meta.url))).digest('hex')).toBe('e6ce5b004922202cdd6d1471a7517b71b48fb467576d92b53b0f108a50e7d12d')
})

it('provides exact sleep clothing maps for every supported recolour recipe', async () => {
  const { decodeLookPng } = await import('../src/look-png.ts')
  const read = (path: string) => new Uint8Array(readFileSync(new URL('../assets/' + path, import.meta.url)))
  const standing = JSON.parse(new TextDecoder().decode(read('standing-looks/recipes.json')))
  const sleep = JSON.parse(new TextDecoder().decode(read('round89-sleep-art/recipes.json')))
  expect(sleep.recipes).toEqual(standing.recipes)
  expect(sleep.palettes).toEqual(standing.palettes)
  expect(sleep.sources.map((source: { sprite: string }) => source.sprite)).toEqual(standingLooks.map(look => `sleep-${look}`))
  for (const [index, look] of standingLooks.entries()) {
    const source = sleep.sources[index]
    expect(source.sprite).toBe(`sleep-${look}`)
    expect((sleepSprites as Record<string, { anchor: readonly number[] }>)[`sleep-${look}`]!.anchor).toEqual(source.anchor)
  }
  for (const [index, source] of sleep.sources.entries()) {
    const used = sleep.recipes.some(([which, choice]: number[]) => {
      if (choice === undefined) throw new Error('sleep recipe has no choice')
      return which === index && choice > 0
    })
    if (!used) { expect(source.mask).toBeNull(); continue }
    expect(source.mask).not.toBeNull()
    const [name, box] = source.mask as [string, number[]]
    const mask = await decodeLookPng(read(`round89-sleep-art/${name}`))
    const frame = (sleepSprites as Record<string, { atlas: string }>)[source.sprite]!
    const pixels = await decodeLookPng(read(`${frame.atlas}.png`))
    expect([mask.width, mask.height]).toEqual([box[2]! - box[0]!, box[3]! - box[1]!])
    const mappings = new Map<number, number[]>(source.map.map(([rgb, first, second]: number[]) => [rgb, [first, second]]))
    let coloured = 0
    for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
      const m = (y * mask.width + x) * mask.channels
      if (!mask.data[m]) continue
      const p = ((box[1]! + y) * pixels.width + box[0]! + x) * pixels.channels
      expect(pixels.data[p + 3]).toBe(255)
      const rgb = (pixels.data[p]! << 16) | (pixels.data[p + 1]! << 8) | pixels.data[p + 2]!
      const map = mappings.get(rgb)
      expect(map, `${source.sprite} ${x},${y}`).toBeDefined()
      expect(sleep.palettes[0][map![0]!]).toBeDefined()
      expect(sleep.palettes[1][map![1]!]).toBeDefined()
      coloured++
    }
    expect(coloured).toBeGreaterThan(0)
  }
})
