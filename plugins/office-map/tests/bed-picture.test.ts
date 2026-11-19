// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
// @ts-expect-error The PNG reader is shared with the JS picture tools.
import { pixels } from './png-pixels.mjs'

const bed = new URL('../assets/round89-sleep-art/bed.png', import.meta.url)

it('stores the bed picture with a colour table, every pixel the same as before', () => {
  const png = readFileSync(bed), chunks: string[] = []
  for (let at = 8; at < png.length; at += 12 + png.readUInt32BE(at)) chunks.push(png.subarray(at + 4, at + 8).toString())
  // IHDR: 8 bits a pixel, colour type 3, an index into the PLTE chunk, whose alpha is in tRNS.
  expect({ depth: png[24], type: png[25] }).toEqual({ depth: 8, type: 3 })
  expect(chunks.filter(c => ['PLTE', 'tRNS'].includes(c))).toEqual(['PLTE', 'tRNS'])
  const read = pixels(bed)
  expect([read.width, read.height, read.channels]).toEqual([160, 76, 4])
  // The sha256 of the RGBA pixels of bed.png at commit 9f6821d88, as pixels() reads them,
  // computed from that file, which was stored as 8-bit RGBA without a colour table.
  expect(createHash('sha256').update(read.data).digest('hex')).toBe('c77d3ab1e325546c0a53f88b16df11349b886655a825e3d098234bf8875bc798')
})
