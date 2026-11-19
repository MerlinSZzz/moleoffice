// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Version-3 sand-apron appearance: strict shape, save/read/people-view readback, region
 * protection, one shared three-layer composition (body, real foreground, independent
 * accessory) and a visible refusal.
 *
 * Synthetic identities live in a freshDb and are written by the product's own registry writer at
 * the lower level. No human actor header is sent anywhere in this file, no live office database,
 * no browser and no world.
 *
 * Mutation proofs for these criteria are recorded in controls/mutations/: turn the accessory layer
 * off, give it a wrong container anchor, draw one body pixel when the accessory is on, set the
 * preview top space to zero, drop the accessory from the preview draw loop, ignore the accessory
 * in the hit rectangle, drop the real foreground, send a human actor header, or force the save
 * gate closed; each makes the matching case below go red, and each restore is byte-identical.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { theWordListText } from './word-list-files.ts'
import {
  cApronAppearanceSchema, pixelAppearanceSchema, generatePixelAppearance, resolvePixelAppearance,
  C_APRON_X_FACTORS, C_APRON_Y_FACTORS, type CApronAppearance, type PixelAppearance,
} from '../src/shared/pixel-office.ts'
import {
  readCApronCustomisation, checkCApronCoverage, cApronOptions, cApronRefusal, cApronRenderable,
  cApronFrameLayers, cApronFrameRefusal, cApronSaveGate, cApronRasterMetrics, renderCApronPixels,
  renderCApronHaloPixels, cApronLayerRect, cApronCompositeRect, cApronHitRect,
  C_APRON_HALO_CONTAINER, C_APRON_HALO_RADIUS, C_APRON_HALO_SPRITE_ID, C_APRON_PREVIEW_CANVAS,
  type CApronCustomisation, type CApronFrameLayers,
} from '../src/shared/pixel-appearance.ts'
import { readCForestOfficeCatalog, C_FOREST_LOOK_URLS, C_FOREST_ACTION_MIRRORS_URL, type CForestCatalog, type CForestFrame, type CForestSprite } from '../src/shared/c-forest.ts'
import { cApronPreviewDrawPlan } from '../src/web/components/pixel-office/PixelAppearancePreview.tsx'

// No person header: every HTTP request below acts as a synthetic agent, and the two agent rows are
// written by the registry writer directly rather than through POST /api/agents/started.
const HEADERS = { 'x-mole-office-workspace': 'default' }
const actor = (id: string) => ({ ...HEADERS, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const APRON: CApronAppearance = { version: 3, style: 'c-forest', lookId: 'sand-apron', fur: 'grey-brown', cloth: 'blue-grey', body: { x: 1.06, y: 0.97 }, accessory: 'gold-halo' }

let database: TestDb, app: FastifyInstance, self = '', other = ''
beforeAll(async () => {
  database = await freshDb(); app = (await apiApp()).app
  // TEST-ONLY FIXTURE, lower level than the HTTP door: the product's own writer makes the registry
  // rows, with a synthetic agent named as the starter, so no request in this file claims to be a person.
  const { keepTheAgentRegistryInStep } = await import('../src/server/lib/participants.ts')
  for (const handle of ['synthetic-v3-self', 'synthetic-v3-other']) {
    keepTheAgentRegistryInStep(
      { id: 'record-' + handle, title: handle, handle, state: 'active', runtime: undefined, retiredBecause: undefined },
      { kind: 'agent', id: 'synthetic-v3-starter' },
    )
  }
  self = 'synthetic-v3-self'; other = 'synthetic-v3-other'
})
afterAll(async () => { await app?.close(); database?.close() })

// A NEW AGENT'S ID IS MINTED AND IS NOT ITS HANDLE, so the rows are read by handle and an agent id the
// office answers with is compared with `idOf(handle)`.
const row = (handle: string) => database.client.sqlite.prepare('SELECT pixel_appearance,pixel_scale FROM agents WHERE handle=?').get(handle) as { pixel_appearance: string | null; pixel_scale: string }
const idOf = (handle: string) => (database.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as { id: string }).id
const read = async (id = self) => { const r = await app.inject({ url: '/api/office/appearance/' + id, headers: actor(self) }); expect(r.statusCode, r.body).toBe(200); return r.json() }
const put = (appearance: unknown, target = self, by = self) => app.inject({ method: 'PUT', url: '/api/office/appearance/' + target, headers: actor(by), payload: { appearance } })

function customisation(): CApronCustomisation {
  return readCApronCustomisation(JSON.parse(readFileSync('public/office-map/c-environments/shared/characters/sand-apron/appearance.json', 'utf8')))
}
function catalog(): CForestCatalog {
  return readCForestOfficeCatalog(JSON.parse(readFileSync('public/office-map/c-forest/sprites.json', 'utf8')),
    C_FOREST_LOOK_URLS.map(({ url }) => JSON.parse(readFileSync('public' + url, 'utf8'))),
    JSON.parse(readFileSync('public' + C_FOREST_ACTION_MIRRORS_URL, 'utf8')))
}
function actionSpriteIds(look: CApronCustomisation, actions: CForestCatalog['actions']['sand-apron']): { body: string[]; foreground: string[] } {
  const body = new Set<string>(), foreground = new Set<string>()
  for (const action of Object.values(actions)) for (const frame of action.frames) {
    body.add(frame.sprite); if (frame.foregroundSprite) foreground.add(frame.foregroundSprite)
  }
  return { body: [...body].sort(), foreground: [...foreground].sort() }
}
/** Every frame the sand-apron look.json declares, in file order, with its action name. */
function lookFrames(): { action: string; frame: CForestFrame }[] {
  const look = JSON.parse(readFileSync('public/office-map/c-environments/shared/characters/sand-apron/look.json', 'utf8')) as { actions: Record<string, Record<string, { frames: CForestFrame[] }>> }
  return Object.entries(look.actions['sand-apron']!).flatMap(([action, value]) => value.frames.map(frame => ({ action, frame })))
}
/** Describe one frame's three layers with the accessory on, at the preview's own foot. */
function accessoryLayers(custom: CApronCustomisation, frame: CForestFrame, sprites: Record<string, CForestSprite>, overrides: Partial<Parameters<typeof cApronFrameLayers>[0]> = {}): CApronFrameLayers {
  const layers = cApronFrameLayers({
    frame, sprites, customisation: custom, options: { fur: true, cloth: true, accessory: true }, x: 1, y: 1, scale: 1,
    foot: { ...C_APRON_PREVIEW_CANVAS.foot }, flipX: Boolean(frame.flipX), depth: 0, foregroundDepth: 1, accessoryDepth: 2, ...overrides,
  })
  if (!layers) throw new Error(`The ${frame.sprite} frame has no layers.`)
  return layers
}
/** Where a container pixel lands once the accessory layer is drawn, flip included. */
function placeContainerPixel(layer: { foot: { x: number; y: number }; anchor: { x: number; y: number }; width: number; height: number; flipX: boolean }, x: number, y: number) {
  const stepX = layer.width / C_APRON_HALO_CONTAINER.width, stepY = layer.height / C_APRON_HALO_CONTAINER.height
  return layer.flipX
    ? { x: layer.foot.x + layer.anchor.x - x * stepX, y: layer.foot.y - layer.anchor.y + y * stepY }
    : { x: layer.foot.x - layer.anchor.x + x * stepX, y: layer.foot.y - layer.anchor.y + y * stepY }
}
/** The ring pixels the shared container draws, as a set of container coordinates. */
function ringPixels(): { x: number; y: number }[] {
  const data = renderCApronHaloPixels(), pixels: { x: number; y: number }[] = []
  for (let index = 3; index < data.length; index += 4) if (data[index]! > 0) {
    const pixel = (index - 3) / 4
    pixels.push({ x: pixel % C_APRON_HALO_CONTAINER.width, y: Math.floor(pixel / C_APRON_HALO_CONTAINER.width) })
  }
  return pixels
}
const hex = (value: string): [number, number, number] => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)]
const pack = ([r, g, b]: [number, number, number]) => (r << 16) | (g << 8) | b

/** A tiny 8-bit RGBA PNG reader, so the region check runs on the adopted bytes themselves. */
const pngCache = new Map<string, { width: number; height: number; data: Uint8ClampedArray }>()
function readPng(path: string): { width: number; height: number; data: Uint8ClampedArray } {
  const held = pngCache.get(path)
  if (held) return held
  const value = readPngUncached(path)
  pngCache.set(path, value)
  return value
}
function readPngUncached(path: string): { width: number; height: number; data: Uint8ClampedArray } {
  const bytes = readFileSync(path)
  let offset = 8, width = 0, height = 0, bitDepth = 0, colourType = 0
  const idat: Buffer[] = []
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8)
    const chunk = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') { width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); bitDepth = chunk[8]!; colourType = chunk[9]! }
    else if (type === 'IDAT') idat.push(chunk)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  if (bitDepth !== 8 || colourType !== 6) throw new Error('The region check needs an 8-bit RGBA PNG.')
  const raw = inflateSync(Buffer.concat(idat)), bpp = 4, stride = width * bpp
  const out = new Uint8ClampedArray(width * height * 4)
  let previous = new Uint8ClampedArray(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!, line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const current = new Uint8ClampedArray(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? current[x - bpp]! : 0, b = previous[x]!, c = x >= bpp ? previous[x - bpp]! : 0
      let value = line[x]!
      if (filter === 1) value = (value + a) & 255
      else if (filter === 2) value = (value + b) & 255
      else if (filter === 3) value = (value + ((a + b) >> 1)) & 255
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); value = (value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255 }
      else if (filter !== 0) throw new Error('Unsupported PNG filter.')
      current[x] = value
    }
    out.set(current, y * stride); previous = current
  }
  return { width, height, data: out }
}

describe('version-3 sand-apron shape', () => {
  it('accepts every published combination and refuses everything else; v1 and v2 keep their own shape', () => {
    for (const fur of ['original', 'grey-brown'] as const) for (const cloth of ['original', 'blue-grey'] as const)
      for (const x of C_APRON_X_FACTORS) for (const y of C_APRON_Y_FACTORS) for (const accessory of ['none', 'gold-halo'] as const) {
        const value = { version: 3, style: 'c-forest', lookId: 'sand-apron', fur, cloth, body: { x, y }, accessory }
        expect(cApronAppearanceSchema.parse(value)).toEqual(value)
        expect(pixelAppearanceSchema.parse(value)).toEqual(value)
      }
    for (const invalid of [
      { ...APRON, lookId: 'cocoa-vest' }, { ...APRON, lookId: 'bare' }, { ...APRON, version: 4 }, { ...APRON, version: 2 },
      { ...APRON, body: { x: 0.9, y: 1 } }, { ...APRON, body: { x: 1, y: 1.06 } }, { ...APRON, body: { x: 0.94 } },
      { ...APRON, body: { x: 1, y: 1, z: 1 } }, { ...APRON, fur: 'cream' }, { ...APRON, cloth: 'olive' }, { ...APRON, accessory: 'flower' },
      { ...APRON, top: null }, { ...APRON, generation: undefined },
    ]) expect(() => cApronAppearanceSchema.parse(invalid), JSON.stringify(invalid)).toThrow()
    // Version 2 is unchanged and gains no optional customization key.
    const v2 = { version: 2, style: 'c-forest', lookId: 'sand-apron' }
    expect(pixelAppearanceSchema.parse(v2)).toEqual(v2)
    expect(pixelAppearanceSchema.parse({ version: 2, style: 'c-forest', lookId: 'bare' })).toMatchObject({ lookId: 'bare' })
    expect(() => pixelAppearanceSchema.parse({ ...v2, fur: 'grey-brown' })).toThrow()
    expect(() => pixelAppearanceSchema.parse({ ...v2, body: { x: 1, y: 1 } })).toThrow()
    expect(pixelAppearanceSchema.parse(generatePixelAppearance('synthetic-v3-legacy')).version).toBe(1)
    // The published factors sit inside the recorded candidate range, and its unverified edges are not published.
    for (const x of C_APRON_X_FACTORS) { expect(x).toBeGreaterThanOrEqual(0.90); expect(x).toBeLessThanOrEqual(1.10); expect([0.90, 1.10]).not.toContain(x) }
    for (const y of C_APRON_Y_FACTORS) { expect(y).toBeGreaterThanOrEqual(0.94); expect(y).toBeLessThanOrEqual(1.06); expect([0.94, 1.06]).not.toContain(y) }
    const resolved = resolvePixelAppearance('synthetic-v3-identity', APRON)
    expect(resolved).toMatchObject({ chosen: true, source: 'saved-c', cLook: 'sand-apron' })
  })

  it('saves through the existing route, reads back exactly, and reaches the plugin\'s people view', async () => {
    const before = row(self)
    expect((await put(APRON)).statusCode).toBe(200)
    const reading = await read()
    expect(reading).toMatchObject({ chosen: true, source: 'saved-c', cLook: 'sand-apron', agentId: idOf(self) })
    expect(reading.appearance).toEqual(APRON)
    expect((await read()).appearance).toEqual(APRON)
    expect(JSON.parse(row(self).pixel_appearance!)).toEqual(APRON)
    const people = await app.inject({ url: '/api/plugin-read/v1/people', headers: actor(self) })
    expect(people.statusCode, people.body).toBe(200)
    expect(people.json().agents.find((agent: { id: string }) => agent.id === idOf(self)).appearance).toEqual(APRON)
    expect(row(self).pixel_scale).toBe(before.pixel_scale)
  })

  it('refuses another writer and an unpublished look or range, leaving the stored value alone', async () => {
    const saved = row(self), otherBefore = row(other)
    expect((await put(APRON, other, self)).statusCode).toBe(403)
    expect((await put({ ...APRON, lookId: 'cocoa-vest' })).statusCode).toBe(400)
    expect((await put({ ...APRON, body: { x: 0.9, y: 1 } })).statusCode).toBe(400)
    expect((await put({ ...APRON, accessory: 'flower' } as unknown)).statusCode).toBe(400)
    expect(row(self)).toEqual(saved)
    expect(row(other)).toEqual(otherBefore)
  })

  it('keeps a saved version-2 look and a saved version-1 look working beside version 3', async () => {
    const v2 = { version: 2, style: 'c-forest', lookId: 'scarf' }
    expect((await put(v2)).statusCode).toBe(200)
    expect((await read()).appearance).toEqual(v2)
    const v1 = generatePixelAppearance('synthetic-v3-beside')
    expect((await put(v1)).statusCode).toBe(200)
    expect(await read()).toMatchObject({ source: 'saved-legacy', appearance: v1 })
    expect((await put(APRON)).statusCode).toBe(200)
    expect((await read()).appearance).toEqual(APRON)
  })
})

describe('version-3 regions, transform and visible refusal', () => {
  it('covers every body sprite and foreground sprite the sand-apron actions use', () => {
    const custom = customisation(), actions = catalog().actions['sand-apron']!
    expect(() => checkCApronCoverage(custom, actions)).not.toThrow()
    const used = actionSpriteIds(custom, actions)
    expect(used.body.length).toBe(21)
    expect(used.foreground.length).toBe(6)
    for (const spriteId of used.body) {
      expect(custom.bodySprites[spriteId], spriteId).toBeDefined()
      expect(custom.bodySprites[spriteId]!.haloAnchor).toHaveLength(2)
      expect(custom.bodySprites[spriteId]!.protectedShadowProtection.length).toBeGreaterThan(0)
    }
    for (const spriteId of used.foreground) expect(custom.foregroundSprites, spriteId).toContain(spriteId)
    // Removing one frame's region entry is caught by name.
    const missing = structuredClone(custom); delete missing.bodySprites[used.body[0]!]
    expect(() => checkCApronCoverage(missing, actions)).toThrow(used.body[0]!)
  })

  it('recolours only the declared regions and leaves every protected pixel and alpha unchanged', () => {
    const custom = customisation(), actions = catalog().actions['sand-apron']!
    const used = actionSpriteIds(custom, actions)
    const fur = new Set(custom.recolour.fur.sourceColours.map(colour => pack(hex(colour))))
    const cloth = new Set(custom.recolour.cloth.sourceColours.map(colour => pack(hex(colour))))
    const remap = (value: number, reference: string, target: string) => {
      const r = hex(reference), t = hex(target)
      return Math.max(0, Math.min(255, value + t[0] - r[0]))
    }
    let recoloured = 0, furSeen = 0, clothSeen = 0
    for (const spriteId of used.body) {
      const name = spriteId.replace('sand-apron-', '')
      const image = readPng('public/office-map/c-environments/shared/characters/sand-apron/' + name + '.png')
      expect(image.width).toBe(160); expect(image.height).toBe(160)
      // Only this sprite's own declared shadow runs protect the shared brown inside this sprite.
      const protectedShadow = new Set<number>()
      for (const [y, x0, x1] of custom.bodySprites[spriteId]!.protectedShadow) for (let x = x0; x < x1; x++) protectedShadow.add(y * 160 + x)
      const out = renderCApronPixels(image.data, image.width, image.height, spriteId, custom, { fur: true, cloth: true, accessory: false })
      expect(out).not.toBe(image.data)
      let outsideChanged = 0, protectedChanged = 0, alphaChanged = 0, recolouredHere = 0
      for (let index = 0; index < image.data.length; index += 4) {
        if (out[index + 3] !== image.data[index + 3]) alphaChanged++
        const rgb = (image.data[index]! << 16) | (image.data[index + 1]! << 8) | image.data[index + 2]!
        const pixel = index / 4
        const inFur = fur.has(rgb) && !protectedShadow.has(pixel)
        const inCloth = cloth.has(rgb)
        if (inFur) { furSeen++; if (out[index] !== remap(image.data[index]!, custom.recolour.fur.reference, custom.recolour.fur.target)) outsideChanged++ }
        else if (inCloth) { clothSeen++; if (out[index] !== remap(image.data[index]!, custom.recolour.cloth.reference, custom.recolour.cloth.target)) outsideChanged++ }
        else if (out[index] !== image.data[index] || out[index + 1] !== image.data[index + 1] || out[index + 2] !== image.data[index + 2]) outsideChanged++
        if (out[index] !== image.data[index]) recolouredHere++
      }
      // The shared shadow brown inside this sprite's declared runs is never recoloured.
      for (const pixel of protectedShadow) {
        const index = pixel * 4
        if (out[index] !== image.data[index] || out[index + 1] !== image.data[index + 1] || out[index + 2] !== image.data[index + 2]) protectedChanged++
      }
      expect({ spriteId, outsideChanged, protectedChanged, alphaChanged }).toEqual({ spriteId, outsideChanged: 0, protectedChanged: 0, alphaChanged: 0 })
      recoloured += recolouredHere
    }
    expect(recoloured).toBeGreaterThan(0); expect(furSeen).toBeGreaterThan(0); expect(clothSeen).toBeGreaterThan(0)
    // Every foreground sprite is protected in full: the renderer is never handed one, and each is declared.
    for (const spriteId of used.foreground) {
      expect(custom.foregroundSprites).toContain(spriteId)
      expect(custom.bodySprites[spriteId]).toBeUndefined()
      const sprite = catalog().sprites[spriteId]
      expect(sprite, spriteId).toBeDefined()
      expect(cApronRenderable(custom, spriteId)).toBe(false)
    }
  })

  it('describes a real body, foreground and accessory frame with one shared transform and each layer’s own anchor', () => {
    const custom = customisation(), sprites = catalog().sprites
    const frame = catalog().actions['sand-apron']!.sit!.frames[0]!
    expect(frame.foregroundSprite, 'the sit action must declare a hands-and-book layer').toBeTruthy()
    const layers = cApronFrameLayers({
      frame, sprites, customisation: custom, options: cApronOptions(APRON), x: APRON.body.x, y: APRON.body.y, scale: 0.8,
      foot: { x: 400.4, y: 300.6 }, flipX: false, depth: 300, foregroundDepth: 320, accessoryDepth: 330,
    })
    expect(layers).not.toBeNull()
    expect(layers!.missingForeground).toBeNull()
    expect(layers!.missingAccessory).toBeNull()
    // All three layers are present, and the foreground is the frame's own sprite, never the body's.
    expect(layers!.body.spriteId).toBe(frame.sprite)
    expect(layers!.foreground?.spriteId).toBe(frame.foregroundSprite)
    expect(layers!.foreground!.spriteId).not.toBe(layers!.body.spriteId)
    expect(layers!.accessory?.spriteId).toBe(C_APRON_HALO_SPRITE_ID)
    expect(layers!.accessory!.accessory).toBe(true)
    expect(layers!.accessory!.options).toBeNull()
    // One stored x, y and flip for all three layers; the body and foreground share the same foot.
    expect(layers!.foreground).toMatchObject({ x: layers!.body.x, y: layers!.body.y, flipX: layers!.body.flipX, foot: layers!.body.foot, foreground: true })
    expect(layers!.accessory).toMatchObject({ x: layers!.body.x, y: layers!.body.y, flipX: layers!.body.flipX, foreground: false, accessory: true })
    expect(layers!.body.foreground).toBe(false)
    // Each layer's anchor, width and height come from its own source, scaled the same way.
    const bodyMetrics = cApronRasterMetrics(sprites[frame.sprite]!, 0.8, APRON.body.x, APRON.body.y)
    const foregroundMetrics = cApronRasterMetrics(sprites[frame.foregroundSprite!]!, 0.8, APRON.body.x, APRON.body.y)
    const container = { width: C_APRON_HALO_CONTAINER.width, height: C_APRON_HALO_CONTAINER.height, anchor: { ...C_APRON_HALO_CONTAINER.anchor } }
    const containerMetrics = cApronRasterMetrics(container, 0.8, APRON.body.x, APRON.body.y)
    expect(layers!.body.anchor).toEqual(bodyMetrics.anchor)
    expect(layers!.foreground!.anchor).toEqual(foregroundMetrics.anchor)
    expect(layers!.accessory!.anchor).toEqual(containerMetrics.anchor)
    expect(layers!.body.width).toBe(bodyMetrics.width); expect(layers!.foreground!.width).toBe(foregroundMetrics.width)
    expect(layers!.accessory!.width).toBe(containerMetrics.width); expect(layers!.accessory!.height).toBe(containerMetrics.height)
    // The accessory centre is the body's own stored attachment point under the shared transform.
    const attachment = custom.bodySprites[frame.sprite]!.haloAnchor
    expect(layers!.accessory!.foot.x).toBeCloseTo(400.4 - bodyMetrics.anchor.x + attachment[0] * (bodyMetrics.width / 160), 6)
    expect(layers!.accessory!.foot.y).toBeCloseTo(300.6 - bodyMetrics.anchor.y + attachment[1] * (bodyMetrics.height / 160), 6)
    // The body carries the recolour and halo choices; the foreground and accessory carry adopted or code pixels.
    expect(layers!.body.options).toEqual(cApronOptions(APRON))
    expect(layers!.foreground!.options).toBeNull()
    // The flip reaches every layer.
    const flipped = cApronFrameLayers({
      frame, sprites, customisation: custom, options: cApronOptions(APRON), x: APRON.body.x, y: APRON.body.y, scale: 0.8,
      foot: { x: 400.4, y: 300.6 }, flipX: true, depth: 300, foregroundDepth: 320, accessoryDepth: 330,
    })
    expect(flipped!.body.flipX).toBe(true); expect(flipped!.foreground!.flipX).toBe(true); expect(flipped!.accessory!.flipX).toBe(true)
    // A frame whose foreground sprite the catalog cannot draw is reported, never silently dropped.
    const absent = { ...frame, foregroundSprite: 'sand-apron-no-such-hands' }
    const broken = cApronFrameLayers({ frame: absent, sprites, customisation: custom, options: cApronOptions(APRON), x: APRON.body.x, y: APRON.body.y, scale: 0.8, foot: { x: 0, y: 0 }, flipX: false, depth: 0, foregroundDepth: 1, accessoryDepth: 2 })
    expect(broken!.foreground).toBeNull()
    expect(broken!.missingForeground).toBe('sand-apron-no-such-hands')
    // The accessory is refused visibly when its attachment data is not loaded.
    const noData = cApronFrameLayers({ frame, sprites, customisation: null, options: cApronOptions(APRON), x: 1, y: 1, scale: 1, foot: { x: 0, y: 0 }, flipX: false, depth: 0, foregroundDepth: 1, accessoryDepth: 2 })
    expect(noData!.accessory).toBeNull()
    expect(noData!.missingAccessory).toBe(frame.sprite)
    expect(cApronFrameRefusal(custom, absent, sprites), 'an undeclared foreground is a visible refusal').toMatch(/foreground/)
    expect(cApronFrameRefusal(custom, frame, sprites), 'a real body and foreground frame is drawable').toBeNull()
    expect(cApronFrameRefusal(custom, frame, sprites, () => false), 'a missing foreground image is a visible refusal').toMatch(/not loaded/)
  })

  it('draws a complete ring container with no clipped pixel', () => {
    const expected = ringPixels()
    expect(expected.length).toBeGreaterThan(0)
    for (const pixel of expected) {
      expect(pixel.x).toBeGreaterThanOrEqual(0); expect(pixel.x).toBeLessThan(C_APRON_HALO_CONTAINER.width)
      expect(pixel.y).toBeGreaterThanOrEqual(0); expect(pixel.y).toBeLessThan(C_APRON_HALO_CONTAINER.height)
    }
    const data = renderCApronHaloPixels()
    let opaque = 0
    for (let index = 3; index < data.length; index += 4) if (data[index]! > 0) opaque++
    expect(opaque).toBe(expected.length)
    // The container is exactly the ring's bounding square.
    expect(C_APRON_HALO_CONTAINER.width).toBe(2 * C_APRON_HALO_RADIUS + 1)
    expect(C_APRON_HALO_CONTAINER.height).toBe(2 * C_APRON_HALO_RADIUS + 1)
  })

  it('gives every sand-apron action frame an independent accessory layer when the halo is on', () => {
    const custom = customisation(), sprites = catalog().sprites
    const frames = lookFrames()
    expect(frames.length).toBe(60)
    for (const { action, frame } of frames) {
      const layers = accessoryLayers(custom, frame, sprites)
      expect(layers.accessory, `${action} ${frame.sprite}`).not.toBeNull()
      expect(layers.accessory!.spriteId).toBe(C_APRON_HALO_SPRITE_ID)
      expect(layers.accessory!.accessory).toBe(true)
      expect(layers.accessory!.width).toBeGreaterThan(0)
      expect(layers.accessory!.height).toBeGreaterThan(0)
      // With the accessory off the same frame carries no accessory layer.
      const off = cApronFrameLayers({ frame, sprites, customisation: custom, options: { fur: true, cloth: true, accessory: false }, x: 1, y: 1, scale: 1, foot: { ...C_APRON_PREVIEW_CANVAS.foot }, flipX: Boolean(frame.flipX), depth: 0, foregroundDepth: 1, accessoryDepth: 2 })
      expect(off!.accessory, frame.sprite).toBeNull()
    }
  })

  it('keeps the complete expected ring pixel set after placement for every unique body sprite', () => {
    const custom = customisation(), sprites = catalog().sprites
    const expected = ringPixels()
    for (const spriteId of actionSpriteIds(custom, catalog().actions['sand-apron']!).body) {
      const accessory = accessoryLayers(custom, { sprite: spriteId }, sprites).accessory!
      const rect = cApronLayerRect(accessory)
      // Every ring pixel lands inside the accessory layer's own rectangle, so none is clipped away.
      for (const pixel of expected) {
        const point = placeContainerPixel(accessory, pixel.x, pixel.y)
        expect(point.x, spriteId).toBeGreaterThanOrEqual(rect.x - 0.5); expect(point.x, spriteId).toBeLessThanOrEqual(rect.x + rect.width + 0.5)
        expect(point.y, spriteId).toBeGreaterThanOrEqual(rect.y - 0.5); expect(point.y, spriteId).toBeLessThanOrEqual(rect.y + rect.height + 0.5)
      }
      // The transformed ring centre is the layer's own foot.
      const centre = placeContainerPixel(accessory, C_APRON_HALO_RADIUS, C_APRON_HALO_RADIUS)
      expect(centre.x).toBeCloseTo(accessory.foot.x, 6)
      expect(centre.y).toBeCloseTo(accessory.foot.y, 6)
    }
  })

  it('changes no body pixel or alpha when only the accessory toggles', () => {
    const custom = customisation(), actions = catalog().actions['sand-apron']!
    const differences = (left: Uint8ClampedArray, right: Uint8ClampedArray) => {
      if (left.length !== right.length) return left.length + right.length
      let count = 0
      for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) count++
      return count
    }
    for (const spriteId of actionSpriteIds(custom, actions).body) {
      const image = readPng('public/office-map/c-environments/shared/characters/sand-apron/' + spriteId.replace('sand-apron-', '') + '.png')
      const off = renderCApronPixels(image.data, image.width, image.height, spriteId, custom, { fur: true, cloth: true, accessory: false })
      const on = renderCApronPixels(image.data, image.width, image.height, spriteId, custom, { fur: true, cloth: true, accessory: true })
      expect(differences(on, off), spriteId).toBe(0)
      const onPlain = renderCApronPixels(image.data, image.width, image.height, spriteId, custom, { fur: false, cloth: false, accessory: true })
      // The accessory is never baked into the body: the body bytes equal the source when recolour is off.
      expect(differences(onPlain, new Uint8ClampedArray(image.data)), spriteId).toBe(0)
    }
  }, 30000)

  it('keeps the complete accessory inside the preview canvas for every body sprite and published factor', () => {
    const custom = customisation(), sprites = catalog().sprites
    const expected = ringPixels()
    for (const spriteId of actionSpriteIds(custom, catalog().actions['sand-apron']!).body) for (const x of C_APRON_X_FACTORS) for (const y of C_APRON_Y_FACTORS) {
      const accessory = accessoryLayers(custom, { sprite: spriteId }, sprites, { x, y }).accessory!
      const rect = cApronLayerRect(accessory)
      const where = `${spriteId} ${x} ${y}`
      expect(rect.x, where).toBeGreaterThanOrEqual(0)
      expect(rect.y, where).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width, where).toBeLessThanOrEqual(C_APRON_PREVIEW_CANVAS.width)
      expect(rect.y + rect.height, where).toBeLessThanOrEqual(C_APRON_PREVIEW_CANVAS.height)
      for (const pixel of expected) {
        const point = placeContainerPixel(accessory, pixel.x, pixel.y)
        expect(point.x, where).toBeGreaterThanOrEqual(0); expect(point.x, where).toBeLessThanOrEqual(C_APRON_PREVIEW_CANVAS.width)
        expect(point.y, where).toBeGreaterThanOrEqual(0); expect(point.y, where).toBeLessThanOrEqual(C_APRON_PREVIEW_CANVAS.height)
      }
    }
  })

  it('draws the preview from the three-layer composition', () => {
    const preview = readFileSync('src/web/components/pixel-office/PixelAppearancePreview.tsx', 'utf8')
    expect(preview).toContain('cApronFrameLayers')
    expect(preview).toContain('cApronHaloCanvas')
    expect(preview).toContain('layers.accessory')
    // The preview draws the three layers in order.
    expect(preview).toContain('[layers.body, layers.foreground, layers.accessory]')
  })

  it('draws each preview layer at its own foot, so the body foot cannot stand in for the accessory foot', () => {
    const custom = customisation(), sprites = catalog().sprites
    const frame = catalog().actions['sand-apron']!.sit!.frames[0]!
    const foot = { x: 400.4, y: 300.6 }
    const layers = accessoryLayers(custom, frame, sprites, { scale: 0.8, foot, x: 1, y: 1 })
    const plan = cApronPreviewDrawPlan(layers)
    // The plan is the preview's own draw order: body, then the real foreground, then the accessory.
    expect(plan.map(step => step.role)).toEqual(['body', 'foreground', 'accessory'])
    // Every step carries its own layer's placement, not the body's.
    for (const step of plan) {
      const layer = step.role === 'body' ? layers.body : step.role === 'foreground' ? layers.foreground! : layers.accessory!
      expect(step.foot, step.role).toEqual({ x: layer.foot.x, y: layer.foot.y })
      expect(step.flipX, step.role).toBe(layer.flipX)
      expect(step.anchor, step.role).toEqual({ x: layer.anchor.x, y: layer.anchor.y })
      expect(step.width, step.role).toBe(layer.width)
      expect(step.height, step.role).toBe(layer.height)
      expect(step.spriteId, step.role).toBe(layer.spriteId)
    }
    // This real frame gives the accessory a foot the body does not share, so the guard above bites.
    expect(layers.accessory!.foot).not.toEqual(layers.body.foot)
    const accessory = plan.find(step => step.role === 'accessory')!
    expect(accessory.foot).toEqual({ x: layers.accessory!.foot.x, y: layers.accessory!.foot.y })
    // The draw effect consumes this plan and never translates once to the body's foot. A mutation that
    // substitutes that foot for a layer's own is red here and in the layer assertions above.
    const preview = readFileSync('src/web/components/pixel-office/PixelAppearancePreview.tsx', 'utf8')
    expect(preview).toContain('cApronPreviewDrawPlan')
    expect(preview).toContain('context.translate(step.foot.x, step.foot.y)')
    expect(preview).not.toContain('layers.body.foot')
  })

  it('extends the hit rectangle over the accessory without moving the saved foot or body anchor', () => {
    const custom = customisation(), sprites = catalog().sprites
    const frame = catalog().actions['sand-apron']!.sit!.frames[0]!
    const scale = 0.8, foot = { x: 400.4, y: 300.6 }, flipX = false
    const layers = accessoryLayers(custom, frame, sprites, { scale, foot, x: 1, y: 1 })
    const bodyOnly = cApronHitRect(sprites[frame.sprite]!, scale, 1, 1, foot, flipX)
    const accessoryRect = cApronLayerRect(layers.accessory!)
    const withAccessory = cApronHitRect(sprites[frame.sprite]!, scale, 1, 1, foot, flipX, layers.accessory)
    // The union only grows; the body's own rectangle is unchanged.
    expect(withAccessory.x).toBeLessThanOrEqual(bodyOnly.x)
    expect(withAccessory.y).toBeLessThanOrEqual(bodyOnly.y)
    expect(withAccessory.x + withAccessory.width).toBeGreaterThanOrEqual(bodyOnly.x + bodyOnly.width)
    expect(withAccessory.y + withAccessory.height).toBeGreaterThanOrEqual(bodyOnly.y + bodyOnly.height)
    // The complete accessory rectangle lies inside the hit rectangle.
    expect(withAccessory.x).toBeLessThanOrEqual(accessoryRect.x)
    expect(withAccessory.y).toBeLessThanOrEqual(accessoryRect.y)
    expect(withAccessory.x + withAccessory.width).toBeGreaterThanOrEqual(accessoryRect.x + accessoryRect.width)
    expect(withAccessory.y + withAccessory.height).toBeGreaterThanOrEqual(accessoryRect.y + accessoryRect.height)
    // The composite of all three layers is exactly the widened rectangle.
    expect(cApronCompositeRect(layers)).toEqual(withAccessory)
    // The saved foot and the body anchor are untouched by the wider rectangle.
    expect(layers.body.foot).toEqual({ x: foot.x, y: foot.y })
    expect(layers.body.anchor).toEqual(cApronRasterMetrics(sprites[frame.sprite]!, scale, 1, 1).anchor)
  })

  it('composes the real sit-0 and book-3 foreground ids and keeps their green book pixels', () => {
    const custom = customisation(), sprites = catalog().sprites, actions = catalog().actions['sand-apron']!
    const sit = actions.sit!.frames[0]!, put = actions.put_book!.frames[0]!, pick = actions.pick_book!.frames[3]!
    expect(sit.sprite).toBe('sand-apron-sit-0'); expect(sit.foregroundSprite).toBe('sand-apron-sit-0-hands-book')
    expect(put.sprite).toBe('sand-apron-book-3'); expect(put.foregroundSprite).toBe('sand-apron-book-3-hands-book')
    expect(pick.foregroundSprite).toBe('sand-apron-book-3-hands-book')
    const greens = new Set(custom.recolour.bookGreenColours.map(colour => pack(hex(colour))))
    for (const frame of [sit, put, pick]) {
      const layers = accessoryLayers(custom, frame, sprites)
      expect(layers.foreground?.spriteId).toBe(frame.foregroundSprite)
      expect(layers.foreground!.options).toBeNull()
      const image = readPng('public/office-map/c-environments/shared/characters/sand-apron/' + frame.foregroundSprite!.replace('sand-apron-', '') + '.png')
      let green = 0
      for (let index = 0; index < image.data.length; index += 4) if (image.data[index + 3]! > 0 && greens.has((image.data[index]! << 16) | (image.data[index + 1]! << 8) | image.data[index + 2]!)) green++
      expect(green, frame.foregroundSprite).toBeGreaterThan(0)
      // The foreground sprite is never handed to the recolour path, so its green cannot change.
      expect(cApronRenderable(custom, frame.foregroundSprite!)).toBe(false)
    }
    // The corrected board path composes this real foreground after the body, and it draws faithfully.
    expect(cApronFrameRefusal(custom, sit, sprites)).toBeNull()
    expect(cApronFrameRefusal(custom, put, sprites)).toBeNull()
  })

  it('refuses an unavailable version-3 value visibly instead of drawing the plain apron', () => {
    const custom = customisation()
    expect(cApronRefusal(null, 'sand-apron-idle')).toMatch(/not loaded/)
    expect(cApronRefusal(custom, 'sand-apron-not-a-frame')).toMatch(/no fur or cloth regions/)
    expect(cApronRefusal(custom, null)).toMatch(/no frame sprite/)
    expect(cApronRefusal(custom, 'sand-apron-idle')).toBeNull()
    expect(cApronRenderable(custom, 'sand-apron-idle')).toBe(true)
    expect(cApronRenderable(custom, 'sand-apron-sit-0-hands-book')).toBe(false)
    expect(cApronOptions(APRON)).toEqual({ fur: true, cloth: true, accessory: true })
    expect(cApronOptions({ ...APRON, fur: 'original', cloth: 'original', accessory: 'none' })).toEqual({ fur: false, cloth: false, accessory: false })
    for (const malformed of [{ ...custom, bodySprites: {} }, { ...custom, lookId: 'bare' }, { ...custom, version: 2 }, { ...custom, bodySprites: { ...custom.bodySprites, 'sand-apron-idle': { ...custom.bodySprites['sand-apron-idle']!, haloAnchor: [1] as unknown as [number, number] } } }])
      expect(() => readCApronCustomisation(malformed)).toThrow()
  })

  it('disables the version-3 fields and Save only while a version-3 draft has no customisation data', () => {
    const v2: PixelAppearance = { version: 2, style: 'c-forest', lookId: 'sand-apron' }
    const v1 = generatePixelAppearance('synthetic-v3-gate')
    expect(cApronSaveGate(APRON, true)).toEqual({ unavailable: false, fieldsDisabled: false, saveDisabled: false })
    expect(cApronSaveGate(APRON, false)).toEqual({ unavailable: true, fieldsDisabled: true, saveDisabled: true })
    // Version 1 and version 2 keep their own save behaviour with or without the v3 data.
    for (const draft of [v1, v2, null]) expect(cApronSaveGate(draft, false)).toEqual({ unavailable: false, fieldsDisabled: false, saveDisabled: false })
  })

  it('publishes bounded review values and no longer claims a measured fixed-seat contact', () => {
    // The rejected delivery itself said no world measured the table, hand-to-book or stool relation,
    // so the schema comment and the editor must not say the chosen factors passed that contact.
    //
    // CRITERION CHANGE (wave 13k round 14): the editor's sentences moved off the
    // component and into the shared word lists (src/shared/words/en.ts and zh.ts), read with
    // sceneWord(), so the two positive checks below now read the English list instead of the
    // component source. The component no longer has this text to find; the list does, in both
    // languages. This was: `editor.toContain(...)` against the two sentences; it is now: the same
    // two sentences read from `src/shared/words/en.ts`.
    const schema = readFileSync('src/shared/pixel-office.ts', 'utf8')
    const editor = readFileSync('src/web/components/pixel-office/PixelAppearanceEditor.tsx', 'utf8')
    // Every file of the English list, en.ts and every wave's part (wave 13j, round 41).
    const words = theWordListText('en')
    expect(schema).toContain('bounded review values')
    expect(schema).not.toMatch(/was measured for these|fixed-seat contact of the whole action package/)
    expect(words).toContain('Movement with held books and seating contact still needs review for this look.')
    expect(editor).not.toMatch(/Only these tested values can be saved/)
    // The save instruction is the contract: an option change only updates the preview, and the
    // person must press Save appearance. This test fails if the false "saves" note returns, and it
    // also holds the two visible body-size labels plain while their aria-labels stay as they were.
    expect(words).toContain('Choose your options, then select Save appearance.')
    expect(editor).not.toContain('Changing any option saves this sand-apron look.')
    expect(editor).not.toContain('Body width (independent X)')
    expect(editor).not.toContain('Body height (independent Y)')
  })
})
