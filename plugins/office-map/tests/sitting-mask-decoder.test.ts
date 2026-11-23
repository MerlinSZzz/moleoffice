// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import sitting from '../assets/sitting-looks/sitting.json'
import { decodeLookPng } from '../src/look-png.ts'

it('decodes every sitting mask using the map decoder', async () => {
  const looks = ['tuft', 'fringe', 'fan', 'helmet', 'waves', 'part', 'beret', 'knit', 'raincoat', 'apron', 'bowtie', 'backpack', 'roll', 'flower', 'gardener', 'mapmaker', 'runner']
  for (const look of looks) {
    const bytes = readFileSync(new URL(`../assets/sitting-looks/${look}-sit-mask.png`, import.meta.url))
    const decoded = await decodeLookPng(bytes)
    const expected = await sharp(bytes).greyscale().raw().toBuffer()
    const atlas = sitting.atlases[`sitting-looks/${look}-sit` as keyof typeof sitting.atlases]
    expect([decoded.width, decoded.height]).toEqual(atlas.size)
    expect(decoded.channels).toBe(1)
    expect(Buffer.from(decoded.data)).toEqual(expected)
    expect([...decoded.data].every(value => value === 0 || value === 255)).toBe(true)
  }
})
