// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import catalog from '../assets/village-catalog.json'
import standing from '../assets/standing-looks/recipes.json'
import { composeStanding, nativeStanding, type LookData } from '../src/look-frames.ts'
import { decodeLookPng, type NativePixels } from '../src/look-png.ts'

type Pose = { sprite: string; anchor: number[]; mask: [string, number[]] | null; map: number[][] }
const assets = new URL('../assets/', import.meta.url)
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, assets)))
const poseKeys = (name: string) => [`walk-${name}-A`, `walk-${name}-pass`, `walk-${name}-B`, `wave-${name}`, `cheer-${name}`]

it('covers every approved action frame and every standing recipe with exact bounded mask mappings', async () => {
  const poses = JSON.parse(readFileSync(new URL('pose-looks/poses.json', assets), 'utf8')) as Record<string, Pose>
  const keys = standing.sources.flatMap(source => poseKeys(source.sprite.slice(6)))
  expect(Object.keys(poses).sort()).toEqual([...keys].sort())
  const sheets = new Map<string, NativePixels>()
  for (const [index, source] of standing.sources.entries()) for (const key of poseKeys(source.sprite.slice(6))) {
    const pose = poses[key]!, frame = catalog.sprites[key as keyof typeof catalog.sprites]
    expect(pose.sprite).toBe(key)
    expect(pose.anchor).toEqual(frame.anchor)
    expect(frame.size).toEqual([128, 128])
    let atlas = sheets.get(frame.atlas)
    if (!atlas) { atlas = await decodeLookPng(bytes(`${frame.atlas}.png`)); sheets.set(frame.atlas, atlas) }
    const original = nativeStanding(atlas, frame)
    const choices = standing.recipes.filter(recipe => recipe[0] === index)
    const recoloured = choices.some(recipe => recipe[1] !== 0)
    expect(Boolean(pose.mask)).toBe(recoloured)
    const mask = pose.mask ? await decodeLookPng(bytes(`pose-looks/${pose.mask[0]}`)) : undefined
    if (mask) {
      expect(mask.channels).toBe(1)
      expect(mask.data.some(value => value !== 0)).toBe(true)
      expect([...mask.data].every(value => value === 0 || value === 255)).toBe(true)
    }
    const data = { palettes: standing.palettes, sources: [pose], recipes: choices.map(choice => [0, choice[1]]) } as LookData
    for (const [recipe, choice] of choices.entries()) {
      const result = composeStanding(original, mask, data, recipe)
      let changed = 0, alphaChanges = 0, protectedChanges = 0, transparentSelections = 0
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const at = (y * 128 + x) * 4, box = pose.mask?.[1]
        const selected = box && mask && x >= box[0]! && x < box[2]! && y >= box[1]! && y < box[3]! && mask.data[(y - box[1]!) * mask.width + x - box[0]!]
        if (result[at + 3] !== original[at + 3]) alphaChanges++
        if (!selected || !choice[1]) {
          for (let channel = 0; channel < 4; channel++) if (result[at + channel] !== original[at + channel]) protectedChanges++
        } else {
          if (!original[at + 3]) transparentSelections++
          if (result[at] !== original[at] || result[at + 1] !== original[at + 1] || result[at + 2] !== original[at + 2]) changed++
        }
      }
      expect([alphaChanges, protectedChanges, transparentSelections]).toEqual([0, 0, 0])
      if (choice[1]) expect(changed).toBeGreaterThan(0)
    }
  }
}, 60_000)
