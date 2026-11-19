// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it, vi } from 'vitest'
import { LookFrames } from '../src/look-frames.ts'
import { Compositions } from '../src/action-resources.ts'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { lookOrder } from '../src/look-order.ts'
import { standingLooks } from '../src/appearance.ts'
import { agent, people } from './fixtures.ts'

// The fake images encode their colour in one pixel; this exercises the actual
// actor's canvas draw, without loading a browser or any real office data.
function draw(standing: any, where: 'desk' | 'sleep', phase: 'stand' | 'play' | 'sleep') {
  const model = mapOffice({ ...people, agents: [agent('invented')] }, null), occupant = model.occupants[0]!
  occupant.standing = standing
  const colours = { stand: [40, 30, 20, 255], play: [10, 80, 30, 255], sleep: [20, 30, 90, 255] }
  let pixel: number[] = []
  const ctx = { save() {}, restore() {}, translate() {}, scale() {}, drawImage(image: any) { pixel = [...image.pixel] }, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {} } as unknown as CanvasRenderingContext2D
  const sprites: Record<string, any> = {}, images = new Map<string, any>()
  for (const pose of ['stand', 'walk', 'wave', 'cheer', 'sleep']) {
    const name = pose === 'walk' ? `walk-${standing.look}-A` : `${pose}-${standing.look}`
    sprites[name] = { atlas: name, rect: [0, 0, 1, 1], trim: [0, 0, 1, 1], size: [1, 1], anchor: [0, 0] }
    images.set(name, { pixel: pose === 'sleep' ? colours.sleep : pose === 'wave' || pose === 'cheer' ? colours.play : colours.stand })
  }
  const fake: any = {
    startSleepingLooks: () => {}, occupants: new Map([[occupant.key, occupant]]), drawnScale: OfficeMap.prototype.drawnScale, whereaboutsByKey: new Map([[occupant.key, where === 'sleep' ? { where, index: 0 } : { where: 'desk' }]]),
    layout: { ownership: true, seats: {} }, individuals: true,
    options: { still: false, wave: null, workAvailable: true }, actions: { draw: () => false },
    pack: { sources: { sprites }, images },
    lookFrames: { draw: (target: CanvasRenderingContext2D, recipe: number, _point: unknown, _scale: number, pose = 'stand') => { target.drawImage({ pixel: [...(colours[pose as keyof typeof colours] ?? colours.stand).slice(0, 3), recipe + 1] } as any, 0, 0); return true } },
  }
  const activity = phase === 'play' ? { id: 'play', from: occupant.key, to: 'other', point: { x: 30, y: 40 }, elapsed: 0, facing: 1, phase: 'play', partner: 'other' } : undefined
  ;(OfficeMap.prototype as any).actor.call(fake, ctx, occupant.key, { x: 30, y: 40 }, activity)
  return pixel
}

it('paints play and sleep with each saved look and each recoloured recipe', () => {
  for (const look of standingLooks) {
    const standing = { look, source: 'saved-catalogue' }
    expect(draw(standing, 'desk', 'play'), look).toEqual([10, 80, 30, 255])
    expect(draw(standing, 'sleep', 'sleep'), look).toEqual([20, 30, 90, 255])
  }
  for (const [recipe, order] of lookOrder.entries()) {
    if (order % 3 === 0) continue
    const standing = { look: standingLooks[Math.floor(order / 3)], source: 'stable-fallback', recipe }
    expect(draw(standing, 'desk', 'play'), `play recipe ${recipe}`).toEqual([10, 80, 30, recipe + 1])
    expect(draw(standing, 'sleep', 'sleep'), `sleep recipe ${recipe}`).toEqual([20, 30, 90, recipe + 1])
  }
})

it('recolours only the mapped clothing pixels of a native pose', async () => {
  const frames = await import('../src/look-frames.ts')
  const composePose = (frames as any).composePose
  expect(composePose).toBeTypeOf('function')
  const original = new Uint8Array([1, 2, 3, 255, 1, 2, 3, 170, 7, 8, 9, 0, 10, 11, 12, 255])
  const mask = { width: 2, height: 1, channels: 1, data: new Uint8Array([255, 0]) }
  const data = { palettes: [[[40, 50, 60]]], sources: [{ sprite: 'sleep-invented', anchor: [1, 1], mask: ['invented', [0, 0, 2, 1]], map: [[0x010203, 0]] }], recipes: [[0, 1]] }
  const output = composePose(original, mask, data, 0, 2, 2)
  expect([...output]).toEqual([40, 50, 60, 255, 1, 2, 3, 170, 7, 8, 9, 0, 10, 11, 12, 255])
  expect([...original]).toEqual([1, 2, 3, 255, 1, 2, 3, 170, 7, 8, 9, 0, 10, 11, 12, 255])
  expect(() => composePose(original, undefined, data, 0, 2, 2)).toThrow()
})

it('reserves the rendered trimmed and cropped furniture bounds and refuses unknown art', () => {
  const frame = { atlas: 'invented-atlas', rect: [10, 20, 40, 30], trim: [4, 5], size: [60, 50], anchor: [30, 45] }
  const fake: any = {
    layout: { pieces: [
      { sprite: 'invented-desk', layer: 'object', x: 100, y: 200, width: 120, height: 100, scale: 2 },
      { sprite: 'invented-wall', layer: 'front', x: 300, y: 400, width: 20, height: 20, crop: { x: 10, y: 10, width: 20, height: 20 } },
      { sprite: 'invented-floor', layer: 'floor', x: 0, y: 0, width: 500, height: 500 },
    ] },
    pack: { sources: { sprites: { 'invented-desk': frame, 'invented-wall': frame } }, images: new Map([['invented-atlas', {}]]) },
  }
  const bounds = (OfficeMap.prototype as any).motionFurniture.call(fake)
  expect(bounds).toEqual([{ x: 108, y: 210, width: 80, height: 60 }, { x: 300, y: 400, width: 20, height: 20 }])
  fake.layout.pieces.push({ sprite: 'invented-missing', layer: 'object', x: 0, y: 0, width: 10, height: 10 })
  expect((OfficeMap.prototype as any).motionFurniture.call(fake)).toBeNull()
})


it('draws a prepared recoloured sleep pose at its own anchor and releases it', async () => {
  class Canvas {
    width = 1; height = 1; pixels: Uint8Array | null = null
    getContext() { return { putImageData: (image: { data: Uint8Array }) => { this.pixels = new Uint8Array(image.data) } } }
  }
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  const canvases: Canvas[] = [], create = () => { const canvas = new Canvas(); canvases.push(canvas); return canvas as unknown as HTMLCanvasElement }
  const standing = { palettes: [[[40, 50, 60]]], recipes: [[0, 1]], sources: [{ sprite: 'stand-invented', anchor: [64, 110], mask: null, map: [] }] }
  const sleeping = { palettes: standing.palettes, recipes: standing.recipes, sources: [{ sprite: 'sleep-invented', anchor: [1, 2], mask: ['invented-mask', [0, 0, 2, 1]], map: [[0x010203, 0]] }] }
  const original = new Uint8Array([1, 2, 3, 255, 1, 2, 3, 128, 7, 8, 9, 0, 10, 11, 12, 255])
  const pack: any = { sources: { sprites: {
    'stand-invented': { atlas: 'standing', rect: [0, 0, 128, 128], trim: [0, 0], size: [128, 128], anchor: [64, 110] },
    'sleep-invented': { atlas: 'sleeping', rect: [0, 0, 2, 2], trim: [0, 0], size: [2, 2], anchor: [1, 2] },
  } }, images: new Map([['standing', {}], ['sleeping', {}]]) }
  try {
    const frames = new (LookFrames as any)(async () => ({ data: standing, masks: {} }), async () => new Uint8Array([1]), create,
      async () => new Uint8Array(128 * 128 * 4), new Compositions(create),
      async () => ({ data: sleeping, masks: { 'invented-mask': 'data:invented' } }),
      async () => ({ width: 2, height: 2, channels: 4, data: original }),
      async () => ({ width: 2, height: 1, channels: 1, data: new Uint8Array([255, 0]) }))
    expect(await frames.select(pack)).toBe(true)
    expect(await frames.prepareSleep(pack)).toBe(true)
    let args: any[] = []
    expect(frames.draw({ drawImage: (...values: any[]) => { args = values } }, 0, { x: 20, y: 30 }, 1, 'sleep')).toBe(true)
    expect([...args[0].pixels]).toEqual([40, 50, 60, 255, 1, 2, 3, 128, 7, 8, 9, 0, 10, 11, 12, 255])
    expect(args.slice(-4)).toEqual([19, 28, 2, 2])
    expect([...original]).toEqual([1, 2, 3, 255, 1, 2, 3, 128, 7, 8, 9, 0, 10, 11, 12, 255])
    frames.release()
    expect(canvases.every(canvas => canvas.width === 1 && canvas.height === 1)).toBe(true)
  } finally { vi.unstubAllGlobals() }
})
