// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RENDERER AND ONE TRANSFORM FOR THE VERSION-3 SAND-APRON APPEARANCE.
 *
 * The Appearance preview and the office map both call this module. It reads the region
 * facts from the validated JSON beside the sand-apron look, recolours only the declared
 * fur and apron palette pixels, protects the warm hands and feet, the book green, the eyes
 * and nose, the dark outline and the whole alpha channel, and draws the gold halo in its
 * own transparent container. The body, the foreground hands and book, the halo, the foot
 * anchor and the hit rectangle all read the same stored version-3 values.
 *
 * The halo is its own layer, not a pixel drawn into the 160x160 body. Its radius, band
 * palette and container live here once; the per-frame attachment point (the ring centre in
 * the body sprite's own pixels) stays in the sand-apron appearance JSON. Because the
 * container is exactly the ring's bounding square, no ring pixel is dropped when a body
 * sprite's halo sits at the top edge of its own 160x160 canvas.
 *
 * Nothing here decides which options are allowed: the schema in pixel-office.ts does that.
 * These are the drawing and geometry rules, kept in one place so the two callers cannot drift.
 */
import type { CForestAction, CForestFrame, CForestPoint, CForestSprite } from './c-forest.ts'
import { C_APRON_LOOK_ID, type CApronAppearance } from './pixel-office.ts'

export interface CApronPalette { sourceColours: string[]; reference: string; target: string }
export interface CApronBodySprite {
  /** The centre of the floating halo, in this sprite's own pixels. It sits above the opaque crown. */
  haloAnchor: [number, number]
  protectedShadowColour: string
  protectedShadowProtection: string
  protectedShadow: [number, number, number][]
}
export interface CApronCustomisation {
  version: 1
  lookId: typeof C_APRON_LOOK_ID
  recolour: {
    fur: CApronPalette
    cloth: CApronPalette
    skinColours: string[]
    bookGreenColours: string[]
    darkOutlineMaxChannel: number
  }
  sharedShadowColour: string
  bodySprites: Record<string, CApronBodySprite>
  foregroundSprites: string[]
  provenance?: unknown
}

const HEX = /^#[0-9a-f]{6}$/
function readColour(value: unknown, where: string): [number, number, number] {
  if (typeof value !== 'string' || !HEX.test(value)) throw new Error(`${where} is not a #rrggbb colour.`)
  return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)]
}
function readPalette(value: unknown, where: string): CApronPalette {
  const palette = value as CApronPalette | undefined
  if (!palette || typeof palette !== 'object') throw new Error(`${where} is not an object.`)
  if (!Array.isArray(palette.sourceColours) || !palette.sourceColours.length) throw new Error(`${where} names no source colours.`)
  for (const [index, colour] of palette.sourceColours.entries()) readColour(colour, `${where}.sourceColours[${index}]`)
  readColour(palette.reference, `${where}.reference`)
  readColour(palette.target, `${where}.target`)
  return palette
}
function readColourList(value: unknown, where: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${where} is not a list of colours.`)
  for (const [index, colour] of value.entries()) readColour(colour, `${where}[${index}]`)
  return value as string[]
}

/** Read the one validated place the sand-apron region and attachment facts live. */
export function readCApronCustomisation(value: unknown): CApronCustomisation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The sand-apron customisation file is not an object.')
  const raw = value as CApronCustomisation
  if (raw.version !== 1) throw new Error('The sand-apron customisation file has an unsupported version.')
  if (raw.lookId !== C_APRON_LOOK_ID) throw new Error('The sand-apron customisation file belongs to another look.')
  if (!raw.recolour || typeof raw.recolour !== 'object') throw new Error('The sand-apron customisation file declares no recolour regions.')
  const recolour = {
    fur: readPalette(raw.recolour.fur, 'recolour.fur'),
    cloth: readPalette(raw.recolour.cloth, 'recolour.cloth'),
    skinColours: readColourList(raw.recolour.skinColours, 'recolour.skinColours'),
    bookGreenColours: readColourList(raw.recolour.bookGreenColours, 'recolour.bookGreenColours'),
    darkOutlineMaxChannel: raw.recolour.darkOutlineMaxChannel,
  }
  if (!Number.isInteger(recolour.darkOutlineMaxChannel) || recolour.darkOutlineMaxChannel < 0 || recolour.darkOutlineMaxChannel > 255) throw new Error('The sand-apron customisation file has no dark-outline limit.')
  readColour(raw.sharedShadowColour, 'sharedShadowColour')
  if (!raw.bodySprites || typeof raw.bodySprites !== 'object' || Array.isArray(raw.bodySprites) || !Object.keys(raw.bodySprites).length) throw new Error('The sand-apron customisation file declares no body sprites.')
  for (const [spriteId, sprite] of Object.entries(raw.bodySprites)) {
    if (!sprite || typeof sprite !== 'object') throw new Error(`The ${spriteId} customisation is not an object.`)
    const haloAnchor = sprite.haloAnchor
    if (!Array.isArray(haloAnchor) || haloAnchor.length !== 2 || !haloAnchor.every(value => Number.isInteger(value))) throw new Error(`The ${spriteId} customisation has no integer halo anchor.`)
    readColour(sprite.protectedShadowColour, `${spriteId}.protectedShadowColour`)
    if (typeof sprite.protectedShadowProtection !== 'string' || !sprite.protectedShadowProtection.length) throw new Error(`The ${spriteId} customisation does not say how its protected shadow was decided.`)
    if (!Array.isArray(sprite.protectedShadow)) throw new Error(`The ${spriteId} customisation has no protected-shadow runs.`)
    for (const run of sprite.protectedShadow) {
      if (!Array.isArray(run) || run.length !== 3 || !run.every(value => Number.isInteger(value)) || run[0] < 0 || run[1] < 0 || run[2] <= run[1]) throw new Error(`The ${spriteId} customisation has an invalid protected-shadow run.`)
    }
  }
  if (!Array.isArray(raw.foregroundSprites) || raw.foregroundSprites.some(id => typeof id !== 'string' || !id.length)) throw new Error('The sand-apron customisation file declares no protected foreground sprites.')
  for (const id of raw.foregroundSprites) if (raw.bodySprites[id]) throw new Error(`The ${id} is declared as both a body and a foreground sprite.`)
  return { ...raw, recolour }
}

/** Every body sprite the look's actions use needs a region entry and a halo anchor. */
export function checkCApronCoverage(customisation: CApronCustomisation, actions: Record<string, CForestAction>): void {
  const missingBodies = new Set<string>(), missingForeground = new Set<string>()
  for (const action of Object.values(actions)) for (const frame of action.frames) {
    if (!customisation.bodySprites[frame.sprite]) missingBodies.add(frame.sprite)
    if (frame.foregroundSprite && !customisation.foregroundSprites.includes(frame.foregroundSprite)) missingForeground.add(frame.foregroundSprite)
  }
  if (missingBodies.size) throw new Error(`The sand-apron customisation has no region or halo anchor for: ${[...missingBodies].sort().join(', ')}.`)
  if (missingForeground.size) throw new Error(`The sand-apron customisation does not declare these foreground sprites protected: ${[...missingForeground].sort().join(', ')}.`)
}

export interface CApronRenderOptions { fur: boolean; cloth: boolean; accessory: boolean }
export function cApronOptions(appearance: CApronAppearance): CApronRenderOptions {
  return { fur: appearance.fur === 'grey-brown', cloth: appearance.cloth === 'blue-grey', accessory: appearance.accessory === 'gold-halo' }
}
export function cApronRenderable(customisation: CApronCustomisation | null, spriteId: string): boolean {
  return customisation !== null && Object.prototype.hasOwnProperty.call(customisation.bodySprites, spriteId)
}
/** A stored version-3 value that cannot be drawn must fail loudly, never fall back to the plain look. */
export function cApronRefusal(customisation: CApronCustomisation | null, spriteId: string | null): string | null {
  if (!customisation) return 'The sand-apron region and attachment data is not loaded.'
  if (!spriteId) return 'This action declares no frame sprite to draw.'
  if (!cApronRenderable(customisation, spriteId)) return `The ${spriteId} frame has no fur or cloth regions and no head anchor.`
  return null
}

interface PackedFacts {
  fur: Map<number, [number, number, number]>
  cloth: Map<number, [number, number, number]>
  protectedShadow: Map<string, Set<number>>
  halo: Map<string, [number, number]>
}
const packedCache = new WeakMap<CApronCustomisation, PackedFacts>()
const pack = ([r, g, b]: [number, number, number]) => (r << 16) | (g << 8) | b
function facts(customisation: CApronCustomisation): PackedFacts {
  const held = packedCache.get(customisation)
  if (held) return held
  const limits = (palette: CApronPalette) => {
    const reference = readColour(palette.reference, 'reference'), target = readColour(palette.target, 'target')
    const delta: [number, number, number] = [target[0] - reference[0], target[1] - reference[1], target[2] - reference[2]]
    return new Map(palette.sourceColours.map(colour => [pack(readColour(colour, 'sourceColour')), delta]))
  }
  const protectedShadow = new Map<string, Set<number>>()
  const halo = new Map<string, [number, number]>()
  const width = 160
  for (const [spriteId, sprite] of Object.entries(customisation.bodySprites)) {
    halo.set(spriteId, [sprite.haloAnchor[0], sprite.haloAnchor[1]])
    const pixels = new Set<number>()
    // A protected run belongs to this sprite only; the same pixel number in another sprite is not protected.
    for (const [y, x0, x1] of sprite.protectedShadow) for (let x = x0; x < x1; x++) pixels.add(y * width + x)
    protectedShadow.set(spriteId, pixels)
  }
  const value = { fur: limits(customisation.recolour.fur), cloth: limits(customisation.recolour.cloth), protectedShadow, halo }
  packedCache.set(customisation, value)
  return value
}

/**
 * Recolour one body sprite. The alpha channel is never touched and the halo is never drawn here:
 * the halo is an independent accessory layer, so switching it on changes no body pixel.
 */
export function renderCApronPixels(source: Uint8ClampedArray, width: number, height: number, spriteId: string, customisation: CApronCustomisation, options: CApronRenderOptions): Uint8ClampedArray {
  const out = new Uint8ClampedArray(source)
  const known = facts(customisation)
  const protectedShadow = known.protectedShadow.get(spriteId)
  const remap = (index: number, delta: [number, number, number]) => {
    out[index] = Math.max(0, Math.min(255, out[index]! + delta[0]))
    out[index + 1] = Math.max(0, Math.min(255, out[index + 1]! + delta[1]))
    out[index + 2] = Math.max(0, Math.min(255, out[index + 2]! + delta[2]))
  }
  for (let index = 0; index < out.length; index += 4) {
    if (out[index + 3] === 0) continue
    const rgb = (out[index]! << 16) | (out[index + 1]! << 8) | out[index + 2]!
    if (options.cloth) { const delta = known.cloth.get(rgb); if (delta) { remap(index, delta); continue } }
    if (options.fur) {
      const delta = known.fur.get(rgb)
      if (delta && !protectedShadow?.has(index / 4)) remap(index, delta)
    }
  }
  return out
}

/** The synthetic sprite id the accessory layer uses. No image file exists under it. */
export const C_APRON_HALO_SPRITE_ID = 'sand-apron-halo'
/** The halo's shared geometry: one radius, one band palette and one container for every frame. */
export const C_APRON_HALO_RADIUS = 14
export const C_APRON_HALO_THICKNESS = 4.5
export const C_APRON_HALO_BANDS: readonly { inner: number; colour: readonly [number, number, number] }[] = [
  { inner: C_APRON_HALO_RADIUS - 1.5, colour: [247, 224, 143] },
  { inner: C_APRON_HALO_RADIUS - 3, colour: [227, 192, 74] },
  { inner: C_APRON_HALO_RADIUS - C_APRON_HALO_THICKNESS, colour: [138, 100, 16] },
]
/**
 * The halo's own transparent container is exactly the ring's bounding square, so every ring pixel
 * fits with no clip. The anchor is the ring centre inside the container.
 */
export const C_APRON_HALO_CONTAINER = {
  width: 2 * C_APRON_HALO_RADIUS + 1,
  height: 2 * C_APRON_HALO_RADIUS + 1,
  anchor: { x: C_APRON_HALO_RADIUS, y: C_APRON_HALO_RADIUS },
} as const
/**
 * The transparent top space the fixed preview canvas adds so the complete ring is visible above the
 * body. It is larger than the measured worst overhang of the ring centre across every body sprite
 * and every published x and y factor.
 */
export const C_APRON_PREVIEW_TOP_SPACE = 16
/** The fixed preview canvas: the same 160-wide body with transparent room above the head. */
export const C_APRON_PREVIEW_CANVAS = { width: 160, height: 160 + C_APRON_PREVIEW_TOP_SPACE, foot: { x: 80, y: 156 + C_APRON_PREVIEW_TOP_SPACE } } as const

/**
 * Draw the gold ring into its own container. The return is a complete transparent RGBA square
 * with a 255 alpha on every ring pixel; nothing outside the ring is touched.
 */
export function renderCApronHaloPixels(): Uint8ClampedArray {
  const { width, height, anchor } = C_APRON_HALO_CONTAINER
  const out = new Uint8ClampedArray(width * height * 4)
  for (let dy = -C_APRON_HALO_RADIUS; dy <= C_APRON_HALO_RADIUS; dy++) for (let dx = -C_APRON_HALO_RADIUS; dx <= C_APRON_HALO_RADIUS; dx++) {
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance > C_APRON_HALO_RADIUS || distance < C_APRON_HALO_RADIUS - C_APRON_HALO_THICKNESS) continue
    const x = anchor.x + dx, y = anchor.y + dy
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const band = C_APRON_HALO_BANDS.find(candidate => distance >= candidate.inner) ?? C_APRON_HALO_BANDS[C_APRON_HALO_BANDS.length - 1]!
    const index = (y * width + x) * 4, colour = band.colour
    out[index] = colour[0]; out[index + 1] = colour[1]; out[index + 2] = colour[2]; out[index + 3] = 255
  }
  return out
}

/** The display transform one body and its foreground share. */
export interface CApronTransform { x: number; y: number; flipX: boolean }
export function cApronRasterMetrics(sprite: Pick<CForestSprite, 'width' | 'height' | 'anchor'>, scale: number, x: number, y: number) {
  return {
    width: Math.max(1, Math.round(sprite.width * scale * x)),
    height: Math.max(1, Math.round(sprite.height * scale * y)),
    anchor: { x: Math.round(sprite.anchor.x * scale * x), y: Math.round(sprite.anchor.y * scale * y) },
  }
}
export interface CApronRect { x: number; y: number; width: number; height: number }
/** The one place a layer's drawn rectangle is worked out, flip included. */
export function cApronLayerRect(layer: Pick<CApronFrameLayer, 'foot' | 'width' | 'height' | 'anchor' | 'flipX'>): CApronRect {
  const anchorX = layer.flipX ? layer.width - layer.anchor.x : layer.anchor.x
  return { x: Math.round(layer.foot.x) - anchorX, y: Math.round(layer.foot.y) - layer.anchor.y, width: layer.width, height: layer.height }
}
/** The union of every layer's rectangle, so a hit area covers the complete visible accessory. */
export function cApronCompositeRect(layers: Pick<CApronFrameLayers, 'body' | 'foreground' | 'accessory'>): CApronRect {
  const rects = [layers.body, layers.foreground, layers.accessory].filter((layer): layer is CApronFrameLayer => layer !== null).map(cApronLayerRect)
  const left = Math.min(...rects.map(rect => rect.x)), top = Math.min(...rects.map(rect => rect.y))
  const right = Math.max(...rects.map(rect => rect.x + rect.width)), bottom = Math.max(...rects.map(rect => rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}
/**
 * The body rectangle, optionally widened to hold an accessory layer. The saved foot and the body's
 * own anchor are untouched: only the returned rectangle grows.
 */
export function cApronHitRect(sprite: Pick<CForestSprite, 'width' | 'height' | 'anchor'>, scale: number, x: number, y: number, foot: { x: number; y: number }, flipX = false, accessory: Pick<CApronFrameLayer, 'foot' | 'width' | 'height' | 'anchor' | 'flipX'> | null = null) {
  const raster = cApronRasterMetrics(sprite, scale, x, y)
  if (flipX) raster.anchor.x = raster.width - raster.anchor.x
  const body: CApronRect = { width: raster.width, height: raster.height, x: Math.round(foot.x) - raster.anchor.x, y: Math.round(foot.y) - raster.anchor.y }
  if (!accessory) return body
  const outer = cApronLayerRect(accessory)
  const left = Math.min(body.x, outer.x), top = Math.min(body.y, outer.y)
  const right = Math.max(body.x + body.width, outer.x + outer.width), bottom = Math.max(body.y + body.height, outer.y + outer.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}
export function cApronVariantKey(spriteId: string, transform: CApronTransform, options: CApronRenderOptions): string {
  return `${spriteId}:${transform.x}:${transform.y}:${transform.flipX ? 1 : 0}:${options.fur ? 1 : 0}${options.cloth ? 1 : 0}${options.accessory ? 1 : 0}`
}

/**
 * ONE LAYER OF ONE ANIMATION FRAME, DESCRIBED ONCE.
 *
 * The Appearance preview and the office map both consume this description, so neither can draw the
 * body alone, and neither can give the foreground hands and book a different x, y, flip or foot.
 * The `anchor`, `width` and `height` come from this layer's own source sprite, scaled by the same x
 * and y the body uses; the foreground is never given the body's anchor.
 */
export interface CApronFrameLayer {
  spriteId: string
  /** Null means the adopted pixels, unchanged. The foreground always, and every look but version 3. */
  options: CApronRenderOptions | null
  /** The stored version-3 body factors, shared by the body and by the foreground hands and book. */
  x: number
  y: number
  flipX: boolean
  /** The foot point this layer's anchor is placed at, with the frame's own offset applied. */
  foot: CForestPoint
  /** This layer's own source anchor, scaled by the same x and y. Not the other layer's anchor. */
  anchor: CForestPoint
  width: number
  height: number
  depth: number
  foreground: boolean
  /** True only for the code-drawn halo container, whose spriteId is C_APRON_HALO_SPRITE_ID. */
  accessory: boolean
}
export interface CApronFrameLayers {
  body: CApronFrameLayer
  /** The frame's declared foreground hands-and-book layer, drawn after the body. Null when there is none. */
  foreground: CApronFrameLayer | null
  /** The code-drawn gold-halo container, drawn after the body and foreground. Null when it is off. */
  accessory: CApronFrameLayer | null
  /** The foreground sprite the frame declares but the sprite catalog cannot draw. Null when nothing is missing. */
  missingForeground: string | null
  /** The body sprite whose stored halo attachment is missing while the accessory is on. Null when nothing is missing. */
  missingAccessory: string | null
}
export interface CApronFrameInput {
  frame: Pick<CForestFrame, 'sprite' | 'foregroundSprite' | 'offsetX' | 'offsetY' | 'flipX'>
  sprites: Readonly<Record<string, CForestSprite>>
  /** The loaded region and attachment facts. The halo attachment point comes from here, never from the frame. */
  customisation?: CApronCustomisation | null
  options: CApronRenderOptions | null
  x: number
  y: number
  scale: number
  foot: CForestPoint
  flipX: boolean
  depth: number
  foregroundDepth: number
  /** The depth the accessory layer draws at. Defaults to the body's depth. */
  accessoryDepth?: number
}
/** Describe the body, the foreground and the accessory of one frame with one transform. Null when the body sprite is unknown. */
export function cApronFrameLayers(input: CApronFrameInput): CApronFrameLayers | null {
  const bodySprite = input.sprites[input.frame.sprite]
  if (!bodySprite) return null
  const foot = { x: input.foot.x + (input.frame.offsetX ?? 0), y: input.foot.y + (input.frame.offsetY ?? 0) }
  const layer = (spriteId: string, sprite: Pick<CForestSprite, 'width' | 'height' | 'anchor'>, options: CApronRenderOptions | null, depth: number, foreground: boolean, accessory: boolean, layerFoot: CForestPoint = foot): CApronFrameLayer => {
    const metrics = cApronRasterMetrics(sprite, input.scale, input.x, input.y)
    return { spriteId, options, x: input.x, y: input.y, flipX: input.flipX, foot: layerFoot, anchor: metrics.anchor, width: metrics.width, height: metrics.height, depth, foreground, accessory }
  }
  const body = layer(input.frame.sprite, bodySprite, input.options, input.depth, false, false)
  const result: CApronFrameLayers = { body, foreground: null, accessory: null, missingForeground: null, missingAccessory: null }
  if (input.frame.foregroundSprite) {
    const foregroundSprite = input.sprites[input.frame.foregroundSprite]
    if (!foregroundSprite) result.missingForeground = input.frame.foregroundSprite
    else result.foreground = layer(input.frame.foregroundSprite, foregroundSprite, null, input.foregroundDepth, true, false)
  }
  if (input.options?.accessory) {
    // The attachment point is the per-frame fact in appearance.json. The body sprite's own pixels
    // are transformed by the same x, y and flip, so the ring centre lands on the same body point.
    const attachment = input.customisation ? facts(input.customisation).halo.get(input.frame.sprite) : undefined
    if (!attachment) result.missingAccessory = input.frame.sprite
    else {
      const bodyMetrics = cApronRasterMetrics(bodySprite, input.scale, input.x, input.y)
      const stepX = bodySprite.width ? bodyMetrics.width / bodySprite.width : 0
      const stepY = bodySprite.height ? bodyMetrics.height / bodySprite.height : 0
      const centre = {
        x: input.flipX ? foot.x + bodyMetrics.anchor.x - attachment[0] * stepX : foot.x - bodyMetrics.anchor.x + attachment[0] * stepX,
        y: foot.y - bodyMetrics.anchor.y + attachment[1] * stepY,
      }
      result.accessory = layer(C_APRON_HALO_SPRITE_ID, C_APRON_HALO_CONTAINER, null, input.accessoryDepth ?? input.depth, false, true, centre)
    }
  }
  return result
}

/** Why a version-3 frame cannot be drawn faithfully. Null means it can, both layers included. */
export function cApronFrameRefusal(customisation: CApronCustomisation | null, frame: Pick<CForestFrame, 'sprite' | 'foregroundSprite'> | null, sprites: Readonly<Record<string, CForestSprite>>, hasImage: (spriteId: string) => boolean = () => true): string | null {
  const body = cApronRefusal(customisation, frame?.sprite ?? null)
  if (body) return body
  if (!frame?.foregroundSprite) return null
  if (!customisation!.foregroundSprites.includes(frame.foregroundSprite)) return `The ${frame.foregroundSprite} foreground layer is not declared protected.`
  if (!sprites[frame.foregroundSprite]) return `The ${frame.foregroundSprite} foreground image is not declared.`
  if (!hasImage(frame.foregroundSprite)) return `The ${frame.foregroundSprite} foreground image is not loaded.`
  return null
}

export interface CApronSaveGate {
  /** The current draft is version 3 and its customisation data is not loaded, so it cannot be drawn or saved. */
  unavailable: boolean
  fieldsDisabled: boolean
  saveDisabled: boolean
}
/** The editor gate: a version-3 draft is unrenderable and unsaveable while its data is absent. */
export function cApronSaveGate(draft: { version: number } | null, customisationLoaded: boolean): CApronSaveGate {
  const unavailable = draft?.version === 3 && !customisationLoaded
  return { unavailable, fieldsDisabled: unavailable, saveDisabled: unavailable }
}
