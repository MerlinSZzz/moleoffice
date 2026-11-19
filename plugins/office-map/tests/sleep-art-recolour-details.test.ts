// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { decodeLookPng } from '../src/look-png.ts'

const read = (name: string) => new Uint8Array(readFileSync(new URL(`../assets/round89-sleep-art/${name}`, import.meta.url)))
const data = JSON.parse(new TextDecoder().decode(read('recipes.json')))

it.each([
  ['fan bag', 'fan', [[30, 55]]],
  ['fan shoes', 'fan', [[10, 59], [6, 51]]],
  ['knit shoes', 'knit', [[12, 58], [9, 49]]],
  ['raincoat shoes', 'raincoat', [[12, 58], [7, 50]]],
  ['bowtie shoes', 'bowtie', [[10, 59], [6, 51]]],
  ['roll shoes', 'roll', [[10, 59], [7, 51]]],
] as const)('recolours %s with both supported palettes', async (_label, look, points) => {
  const source = data.sources.find((entry: { sprite: string }) => entry.sprite === `sleep-${look}`)
  const pixels = await decodeLookPng(read(`${look}-sleep.png`))
  const mask = await decodeLookPng(read(source.mask[0]))
  for (const [x, y] of points) {
    const pixel = (y * pixels.width + x) * pixels.channels
    expect(mask.data[y * mask.width + x], `${look} ${x},${y}`).toBeGreaterThan(0)
    const rgb = (pixels.data[pixel]! << 16) | (pixels.data[pixel + 1]! << 8) | pixels.data[pixel + 2]!
    const mapping = source.map.find((row: number[]) => row[0] === rgb)
    expect(mapping).toBeDefined()
    const blue = data.palettes[0][mapping[1]] as number[]
    const green = data.palettes[1][mapping[2]] as number[]
    expect(blue[2]).toBeGreaterThan(blue[0]!)
    expect(green[1]).toBeGreaterThan(green[2]!)
  }
})
