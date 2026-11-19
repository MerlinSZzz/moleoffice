// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Proves the three new looks load and draw in every colouring, while older identities stay stable.
// Mutations: omit sleep recipes; restrict new identities to 43; omit a wave mask; duplicate a standing recipe.
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { LookFrames, composeStanding, nativeStanding, type LookData } from '../src/look-frames.ts'
import { decodeLookPng, type NativePixels } from '../src/look-png.ts'
import { Compositions } from '../src/action-resources.ts'
import { standingOf, portraitOf } from '../src/appearance.ts'
import { identityRecipe } from '../src/look-identity.ts'
import { lookOrder } from '../src/look-order.ts'
import { data as standingData, masks as standingMasks } from '../src/look-assets.ts'
import { poses, masks as poseMasks } from '../src/pose-look-assets.ts'
import { data as sleepData, masks as sleepMasks } from '../src/sleep-look-assets.ts'
import { atlases as sleepAtlases } from '../src/sleep-cast-assets.ts'
import { sleepSprites } from '../src/sleep-art.ts'
import catalog from '../assets/village-catalog.json'

const looks = ['gardener', 'mapmaker', 'runner'] as const
const data = standingData as unknown as LookData, sleeping = sleepData as unknown as LookData
const poseData = poses as unknown as Record<string, LookData['sources'][number]>
const png = (path: string) => new Uint8Array(readFileSync(new URL('../assets/' + path, import.meta.url)))
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
class Canvas {
  width = 1; height = 1; pixels: Uint8Array | null = null
  getContext() { return { putImageData: (image: { data: Uint8Array }) => { this.pixels = new Uint8Array(image.data) } } }
}
afterEach(() => vi.unstubAllGlobals())

it('loads each new look whole and draws its seven exact standing and pose colourings', async () => {
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  const sheets: Record<string, NativePixels> = {}
  for (const name of Object.keys(catalog.atlases)) sheets[name] = await decodeLookPng(png(name + '.png'))
  const sprites = { ...catalog.sprites, ...sleepSprites } as Record<string, any>
  const images = new Map(Object.keys(catalog.atlases).concat(Object.keys(sleepAtlases)).map(name => [name, {} as HTMLImageElement]))
  const pack: any = { sources: { sprites }, images }
  const create = () => new Canvas() as unknown as HTMLCanvasElement
  const paths = new Map<string, string>()
  for (const [name, url] of Object.entries(standingMasks)) paths.set(url, 'standing-looks/' + name)
  for (const [name, url] of Object.entries(poseMasks)) paths.set(url, 'pose-looks/' + name)
  for (const [name, url] of Object.entries(sleepMasks)) paths.set(url, 'round89-sleep-art/' + name)
  const read = async (url: string) => { const path = paths.get(url); if (!path) throw Error('Missing mask import'); return png(path) }
  const native = async (_image: HTMLImageElement, frame: any) => nativeStanding(sheets[frame.atlas]!, frame)
  const poseNative = async (_image: HTMLImageElement, frame: any) => ({ width: 128, height: 128, channels: 4, data: await native(_image, frame) })
  const sleepNative = async (_image: HTMLImageElement, frame: any) => decodeLookPng(png(frame.atlas + '.png'))
  const frames = new LookFrames(async () => ({ data, masks: standingMasks }), read, create, native, new Compositions(create),
    async () => ({ data: sleeping, masks: sleepMasks }), sleepNative, decodeLookPng,
    async () => ({ poses: poseData, masks: poseMasks }), poseNative, decodeLookPng)
  expect(await frames.select(pack)).toBe(true)
  const hashes = new Set<string>()
  for (let recipe = 0; recipe < data.recipes.length; recipe++) {
    const [index, choice] = data.recipes[recipe]!, source = data.sources[index!]!
    const original = nativeStanding(sheets[sprites[source.sprite].atlas]!, sprites[source.sprite])
    const mask = source.mask ? await decodeLookPng(png('standing-looks/' + source.mask[0])) : undefined
    const actual = composeStanding(original, mask, data, recipe)
    if (recipe >= 43) {
      const encoded = lookOrder[recipe]!, expectedIndex = Math.floor(encoded / 3), expectedChoice = encoded % 3
      const look = looks[expectedIndex - 16]!
      expect([index, choice, source.sprite]).toEqual([expectedIndex, expectedChoice, 'stand-' + look])
      expect(actual.byteLength).toBe(128 * 128 * 4)
      let alphaChanges = 0, protectedChanges = 0
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const at = (y * 128 + x) * 4, box = source.mask![1]
        const covered = x >= box[0]! && x < box[2]! && y >= box[1]! && y < box[3]! && mask!.data[(y-box[1]!) * mask!.width + x-box[0]!]
        if (actual[at+3] !== original[at+3]) alphaChanges++
        if (!covered || !choice) for (let c = 0; c < 4; c++) if (actual[at+c] !== original[at+c]) protectedChanges++
      }
      expect(alphaChanges).toBe(0); expect(protectedChanges).toBe(0)
    }
    hashes.add(hash(actual))
  }
  expect(hashes.size).toBe(50)
  const ctx: any = { save() {}, restore() {}, translate() {}, scale() {}, drawImage() {} }
  for (const [i, look] of looks.entries()) {
    for (const name of ['stand-' + look, 'walk-' + look + '-A', 'walk-' + look + '-pass', 'walk-' + look + '-B', 'wave-' + look, 'cheer-' + look, 'carry-' + look, 'sleep-' + look]) expect(sprites[name], name).toBeDefined()
    expect((sleepAtlases as Record<string, string>)['round89-sleep-art/' + look + '-sleep']).toBeDefined()
    const sources = [data.sources[16+i]!, sleeping.sources[16+i]!, ...['walk-' + look + '-A', 'walk-' + look + '-pass', 'walk-' + look + '-B', 'wave-' + look, 'cheer-' + look].map(name => poseData[name]!)]
    for (const [j, source] of sources.entries()) {
      expect(source?.mask).toBeTruthy()
      const masks = j === 0 ? standingMasks : j === 1 ? sleepMasks : poseMasks
      const url = masks[source.mask![0]]; expect(url).toBeTruthy()
      const mask = await decodeLookPng(await read(url!)), box = source.mask![1]
      expect([mask.width, mask.height, mask.channels]).toEqual([box[2]! - box[0]!, box[3]! - box[1]!, 1])
    }
    for (const [recipe, encoded] of lookOrder.entries()) {
      if (Math.floor(encoded / 3) !== 16 + i) continue
      const choice = encoded % 3
      expect(sleeping.recipes[recipe]).toEqual([16+i, choice])
      expect(await frames.prepareMotion(pack, [recipe])).toBe(true)
      for (const elapsed of [0, 200, 400]) expect(frames.draw(ctx, recipe, {x:0,y:0}, 1, 'walk', elapsed)).toBe(true)
      for (const elapsed of [0, 1200]) expect(frames.draw(ctx, recipe, {x:0,y:0}, 1, 'play', elapsed)).toBe(true)
      frames.clearMotion()
      expect(await frames.prepareSleep(pack, [recipe])).toBe(true)
      expect(frames.draw(ctx, recipe, {x:0,y:0}, 1, 'sleep')).toBe(true)
      frames.clearSleep()
      expect(frames.frame(recipe)).not.toBeNull()
    }
  }
  frames.release()
}, 60_000)

it('selects all seven new colourings after the cut-off and none before', () => {
  const seen = new Set<number>()
  for (let i = 0; i < 2000; i++) {
    const id = 'made-up-agent-' + i
    const now = standingOf(portraitOf(null), id, '2026-11-18 00:00:00').recipe!
    const before = standingOf(portraitOf(null), id, '2026-11-17 23:59:59').recipe!
    if (now >= 43) seen.add(now)
    expect(before).toBeLessThan(43)
  }
  expect([...seen].sort((a,b) => a-b)).toEqual([43,44,45,46,47,48,49])
})

it('keeps each older identity on its original recipe', () => {
  for (let i = 0; i < 2000; i++) {
    const id = 'made-up-agent-' + i, recipe = identityRecipe(id, 43)
    const standing = standingOf(portraitOf(null), id, '2026-11-17 23:59:59')
    expect(standing.recipe).toBe(recipe)
    expect(standing.look).toBe(data.sources[Math.floor(lookOrder[recipe]! / 3)]!.sprite.slice(6))
  }
})
