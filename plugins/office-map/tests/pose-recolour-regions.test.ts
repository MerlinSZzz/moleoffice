// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import catalog from '../assets/village-catalog.json'
import poses from '../assets/pose-looks/poses.json'
import { nativeStanding } from '../src/look-frames.ts'
import { decodeLookPng } from '../src/look-png.ts'

// Points were chosen on the original pose art in the named regions. The
// standing recipe keeps the upper cloth native and recolours the named bag or
// feet; these checks pin those distinctions independently of the mask files.
const examples = [
  ['tuft hood', 'walk-tuft-A', 50, 60, [21, 102, 196, 255], false],
  ['waves collar', 'wave-waves', 50, 66, [113, 138, 46, 255], false],
  ['knit collar', 'walk-knit-pass', 60, 68, [252, 229, 183, 255], false],
  ['part upper shirt', 'walk-part-A', 55, 70, [121, 46, 83, 255], false],
  ['raincoat hood', 'walk-raincoat-pass', 50, 61, [255, 186, 31, 255], false],
  ['roll upper shirt', 'walk-roll-A', 55, 70, [254, 179, 25, 255], false],
  ['bowtie shirt', 'walk-bowtie-A', 60, 78, [255, 248, 212, 255], false],
  ['bowtie foot', 'walk-bowtie-A', 40, 102, [253, 186, 92, 255], true],
  ['fan bag', 'walk-fan-A', 40, 84, [248, 162, 44, 255], true],
  ['fan foot', 'walk-fan-A', 40, 102, [249, 162, 56, 255], true],
  ['roll foot', 'walk-roll-A', 40, 102, [246, 176, 76, 255], true],
] as const
const bytes = (name: string) => new Uint8Array(readFileSync(new URL('../assets/' + name, import.meta.url)))
it.each(examples)('keeps the standing colour region on %s', async (_label, key, x, y, rgba, selected) => {
  const frame = catalog.sprites[key], pose = poses[key]
  const pixels = nativeStanding(await decodeLookPng(bytes(frame.atlas + '.png')), frame)
  expect([...pixels.subarray((y * 128 + x) * 4, (y * 128 + x) * 4 + 4)]).toEqual(rgba)
  const [file, box] = pose.mask! as [string, number[]]
  const mask = await decodeLookPng(bytes('pose-looks/' + file))
  const within = x >= box[0]! && x < box[2]! && y >= box[1]! && y < box[3]!
  const marked = within && mask.data[(y - box[1]!) * mask.width + x - box[0]!] !== 0
  expect(marked).toBe(selected)
})
