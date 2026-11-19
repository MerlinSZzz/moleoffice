// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { PixelScale } from './pixel-scale.ts'
import { C_FOREST_LOOK_IDS, LEGACY_C_DEFAULT_LOOK_IDS, PIXEL_SCENES, pixelRandom, type CForestLookId, type PixelScene } from './pixel-office.ts'

export interface CForestPoint { x: number; y: number }
export interface CForestSprite {
  src: string
  width: number
  height: number
  anchor: CForestPoint
  sha256?: string
}
export interface CForestFrame {
  sprite: string
  durationMs?: number
  foregroundSprite?: string
  offsetX?: number
  offsetY?: number
  flipX?: boolean
  tableBookVisible?: boolean
}
export interface CForestAction { fps?: number; loop?: boolean; frames: CForestFrame[] }
export type CForestActionId = 'idle' | 'walk_se' | 'walk_sw' | 'walk_ne' | 'walk_nw' | 'pick_book' | 'sit' | 'work' | 'stand' | 'put_book' | 'talk'
export interface CForestLook {
  label: { en: string; zh: string }
  idleSprite: string
  tableBook?: { sprite: string }
}
export interface CForestCatalog {
  version: 1
  sprites: Record<string, CForestSprite>
  looks: Record<CForestLookId, CForestLook>
  actions: Record<CForestLookId, Record<string, CForestAction>>
  provenance?: Record<string, unknown>
}
export const C_FOREST_CATALOG_URL = '/office-map/c-forest/sprites.json'
export const C_FOREST_ACTION_MIRRORS_URL = '/office-map/c-environments/shared/character-actions.json'
export const C_FOREST_LOOK_URLS = C_FOREST_LOOK_IDS.filter(id => !(LEGACY_C_DEFAULT_LOOK_IDS as readonly string[]).includes(id))
  .map(lookId => ({ lookId, url: `/office-map/c-environments/shared/characters/${lookId}/look.json` }))
/** The one validated place the sand-apron region coverage, head anchors and palettes live. */
export const C_FOREST_APRON_CUSTOMISATION_URL = '/office-map/c-environments/shared/characters/sand-apron/appearance.json'
export const C_FOREST_PROPS_URL = '/office-map/c-forest/props.json'
export const C_FOREST_SHARED_PROPS_URL = '/office-map/c-environments/shared/props.json'
export const C_FOREST_TERRAIN_URL = '/office-map/c-forest/terrain.json'

export interface CForestRect extends CForestPoint { width: number; height: number }
export interface CForestPropLayer { sprite: string; role: 'back' | 'front' | 'trunk' | 'canopy'; offset?: CForestPoint; depthOffset?: number }
export interface CForestPropStation {
  actorFoot: CForestPoint
  foregroundAfter: 'front'
  stoolProp: string
  actorContact?: CForestPoint
  propContact?: CForestPoint
  bookPoint?: CForestPoint
  placement?: 'fixed-seat'
  facing?: CForestSharedSeat['facing']
  actions?: CForestSharedSeat['actions']
}
/** Coordinates belong to the fixed table. They never move a saved chair or foot point. */
export interface CForestSharedSeat {
  actorFoot: CForestPoint
  facing: 'se' | 'sw' | 'ne' | 'nw'
  actions: { sit: string; work: string; stand: string; pick_book?: string; put_book?: string }
  foregroundLayer: number
  contacts: Partial<Record<CForestLookId, { actor: CForestPoint; prop: CForestPoint; stoolProp: string; bookPoint?: CForestPoint }>>
}
export interface CForestProp {
  defaultScale: number
  blocking: boolean
  footprint: CForestRect
  layers: CForestPropLayer[]
  stations?: Partial<Record<CForestLookId, CForestPropStation>>
  seats?: Record<string, CForestSharedSeat>
}
export interface CForestPropsCatalog { version: 1; sprites: Record<string, CForestSprite>; props: Record<string, CForestProp>; provenance?: Record<string, unknown> }
export interface CForestPlacedProp {
  propId: string; anchor: CForestPoint; scale: number; footprint: CForestRect; depth: number
  layers: (CForestPropLayer & { anchor: CForestPoint; depth: number })[]
}
const finitePoint = (value: CForestPoint | undefined): value is CForestPoint => value !== undefined && Number.isFinite(value.x) && Number.isFinite(value.y)
function readSprites(sprites: Record<string, CForestSprite>) {
  for (const [id, sprite] of Object.entries(sprites)) {
    const localPath = /^\/office-map\/(?:c-forest|c-environments\/(?:high-rise|cavern|greenhouse|night-library|shared))\/[\w/-]+\.png$/.test(sprite.src)
    if (!localPath || !Number.isInteger(sprite.width) || !Number.isInteger(sprite.height) || sprite.width <= 0 || sprite.height <= 0 || !finitePoint(sprite.anchor)) throw new Error(`C forest image ${id} has no valid path, dimensions or ground anchor.`)
  }
}
export function mergeCForestSprites(...sources: Readonly<Record<string, CForestSprite>>[]): Record<string, CForestSprite> {
  const sprites: Record<string, CForestSprite> = {}
  for (const source of sources) for (const [id, sprite] of Object.entries(source)) {
    if (sprites[id] && JSON.stringify(sprites[id]) !== JSON.stringify(sprite)) throw new Error(`C forest sprite ${id} has conflicting declarations.`)
    sprites[id] = sprite
  }
  return sprites
}
export function readCForestProps(value: unknown, sharedSprites: Readonly<Record<string, CForestSprite>>): CForestPropsCatalog {
  if (!value || typeof value !== 'object') throw new Error('The C forest props catalog is not an object.')
  const raw = value as CForestPropsCatalog
  if (raw.version !== 1 || !raw.sprites || !raw.props) throw new Error('The C forest props catalog is incomplete.')
  const catalog = { ...raw, sprites: mergeCForestSprites(sharedSprites, raw.sprites) }
  readSprites(catalog.sprites)
  for (const [id, prop] of Object.entries(catalog.props)) {
    const box = prop.footprint
    if (!(prop.defaultScale > 0) || !Number.isFinite(prop.defaultScale) || typeof prop.blocking !== 'boolean' || !finitePoint(box) || !(box.width > 0 && box.height > 0) || !Number.isFinite(box.width) || !Number.isFinite(box.height) || !prop.layers?.length) throw new Error(`C forest prop ${id} has no scale, footprint or layers.`)
    for (const layer of prop.layers) if (!catalog.sprites[layer.sprite] || !['back', 'front', 'trunk', 'canopy'].includes(layer.role)
      || (layer.offset !== undefined && !finitePoint(layer.offset)) || (layer.depthOffset !== undefined && !Number.isFinite(layer.depthOffset))) throw new Error(`C forest prop ${id} names an unavailable layer.`)
    for (const [look, station] of Object.entries(prop.stations ?? {})) {
      if (!C_FOREST_LOOK_IDS.includes(look as CForestLookId) || !catalog.props[station.stoolProp] || !finitePoint(station.actorFoot) || station.foregroundAfter !== 'front' || Boolean(station.actorContact) !== Boolean(station.propContact) || (station.actorContact && (!finitePoint(station.actorContact) || !finitePoint(station.propContact)))) throw new Error(`C forest prop ${id} has an invalid ${look} station.`)
      if (station.bookPoint !== undefined && !finitePoint(station.bookPoint)) throw new Error(`C forest prop ${id} has no valid ${look} table-book point.`)
      if (station.placement !== undefined && station.placement !== 'fixed-seat') throw new Error(`C forest prop ${id} has an unsupported ${look} placement.`)
      if (station.placement === undefined && (station.facing !== undefined || station.actions !== undefined)) throw new Error(`C forest prop ${id} must declare fixed-seat before adding ${look} facing or actions.`)
      if (station.placement === 'fixed-seat' && (!station.actorContact || !station.propContact || !station.facing || !['se', 'sw', 'ne', 'nw'].includes(station.facing)
        || !station.actions || !(['sit', 'work', 'stand'] as const).every(name => typeof station.actions![name] === 'string' && station.actions![name].length))) throw new Error(`C forest prop ${id} has no measured fixed ${look} station and actions.`)
      for (const name of ['pick_book', 'put_book'] as const) if (station.actions?.[name] !== undefined && (typeof station.actions[name] !== 'string' || !station.actions[name]!.length)) throw new Error(`C forest prop ${id} has an invalid ${look} ${name} action.`)
    }
    const fixed = Object.values(prop.stations ?? {}).filter(station => station.placement === 'fixed-seat')
    if (fixed.some(station => station.actorFoot.x !== fixed[0]!.actorFoot.x || station.actorFoot.y !== fixed[0]!.actorFoot.y)) throw new Error(`C forest prop ${id} changes its fixed seat when the look changes.`)
    for (const [seatId, seat] of Object.entries(prop.seats ?? {})) {
      if ('bodyDepthOffset' in seat) throw new Error(`C forest prop ${id} seat ${seatId} still declares bodyDepthOffset. People sort by their saved feet; declare the table layer depths instead.`)
      if (!seatId || !finitePoint(seat.actorFoot) || !['se', 'sw', 'ne', 'nw'].includes(seat.facing)
        || !Number.isInteger(seat.foregroundLayer) || !prop.layers[seat.foregroundLayer]
        || !seat.actions || !(['sit', 'work', 'stand'] as const).every(action => typeof seat.actions[action] === 'string' && seat.actions[action].length)
        || !seat.contacts || !Object.keys(seat.contacts).length) throw new Error(`C forest prop ${id} has an invalid shared seat ${seatId}.`)
      for (const name of ['pick_book', 'put_book'] as const) if (seat.actions[name] !== undefined && (typeof seat.actions[name] !== 'string' || !seat.actions[name]!.length)) throw new Error(`C forest prop ${id} seat ${seatId} has an invalid ${name} action.`)
      for (const [look, contact] of Object.entries(seat.contacts)) {
        if (!C_FOREST_LOOK_IDS.includes(look as CForestLookId) || !contact || !finitePoint(contact.actor) || !finitePoint(contact.prop) || !catalog.props[contact.stoolProp]) throw new Error(`C forest prop ${id} seat ${seatId} has an invalid ${look} contact.`)
        if (contact.bookPoint !== undefined && !finitePoint(contact.bookPoint)) throw new Error(`C forest prop ${id} seat ${seatId} has no valid ${look} table-book point.`)
      }
    }
  }
  return catalog
}

/** Preserve the old source files while adopting complete chairs in their single-seat stations. */
export function readCForestOfficeProps(baseValue: unknown, sharedValue: unknown, characterSprites: Readonly<Record<string, CForestSprite>>, characters?: CForestCatalog): CForestPropsCatalog {
  const base = readCForestProps(baseValue, characterSprites), shared = readCForestProps(sharedValue, {})
  const props = { ...base.props }
  for (const [id, prop] of Object.entries(shared.props)) {
    if (props[id] && JSON.stringify(props[id]) !== JSON.stringify(prop)) throw new Error(`The shared furniture ${id} conflicts with an existing prop.`)
    props[id] = prop
  }
  const replacements: Record<string, string> = { 'bare-stool': 'shared-complete-stool-se', 'scarf-stool': 'shared-complete-stool-se' }
  for (const [id, prop] of Object.entries(props)) if (prop.stations) {
    props[id] = { ...prop, stations: Object.fromEntries(Object.entries(prop.stations).map(([look, station]) =>
      [look, { ...station, stoolProp: replacements[station.stoolProp] ?? station.stoolProp }])) }
  }
  const result = readCForestProps({ version: 1, sprites: mergeCForestSprites(base.sprites, shared.sprites), props,
    provenance: { base: base.provenance ?? null, shared: shared.provenance ?? null,
      stoolAdoption: 'Existing bare/scarf single-seat stations use the complete SE stool. Original PNGs and source declarations remain unchanged. No sprite is mirrored again.' } }, {})
  if (characters) {
    const check = (propId: string, look: CForestLookId, station: Pick<CForestSharedSeat, 'facing' | 'actions'>, bookPoint?: CForestPoint) => {
      const actions = characters.actions[look], required = [cForestIdleActionName(station.facing), station.actions.sit, station.actions.work, station.actions.stand]
      if (characters.looks[look].tableBook && !bookPoint) throw new Error(`The ${propId} station has no measured ${look} table-book point.`)
      const pick = cForestBookActionName(station, 'pick_book'), put = cForestBookActionName(station, 'put_book')
      if (actions.pick_book || actions.put_book || actions[pick] || actions[put] || station.actions.pick_book || station.actions.put_book) required.push(pick, put)
      for (const name of required) if (!actions[name]?.frames.length) throw new Error(`The ${propId} station requires missing ${look} action ${name}.`)
    }
    for (const [id, prop] of Object.entries(result.props)) {
      for (const [look, station] of Object.entries(prop.stations ?? {})) check(id, look as CForestLookId, { facing: station.facing ?? 'se', actions: station.actions ?? { sit: 'sit', work: 'work', stand: 'stand' } }, station.bookPoint)
      for (const [seatId, seat] of Object.entries(prop.seats ?? {})) for (const [look, contact] of Object.entries(seat.contacts)) check(`${id}:${seatId}`, look as CForestLookId, seat, contact?.bookPoint)
    }
  }
  return result
}
export function cForestBookActionName(station: Pick<CForestSharedSeat, 'facing' | 'actions'>, name: 'pick_book' | 'put_book'): string {
  return station.actions[name] ?? name + (station.facing === 'se' ? '' : '_' + station.facing)
}
export function cForestIdleActionName(facing: CForestSharedSeat['facing']): string { return facing === 'se' ? 'idle' : 'idle_' + facing }
/** A person's book stays at its declared table point, even while that person walks elsewhere. */
export function readCForestTableBook(look: CForestLook, station: { bookPoint: CForestPoint | null; facing: CForestSharedSeat['facing']; foregroundDepth: number }, actorScale: number) {
  if (!look.tableBook || !station.bookPoint) throw new Error('This seat has no independent book or recorded table-book point.')
  return { sprite: look.tableBook.sprite, foot: station.bookPoint, scale: actorScale, depth: station.foregroundDepth - .25, flipX: station.facing === 'sw' }
}
/** Footprints and sort depth are derived from the same recorded prop anchor. */
export function placeCForestProp(catalog: CForestPropsCatalog, propId: string, anchor: CForestPoint, scale?: number): CForestPlacedProp {
  const prop = catalog.props[propId]
  if (!prop) throw new Error(`No C forest prop is named ${propId}.`)
  const actualScale = scale ?? prop.defaultScale
  const footprint = { x: anchor.x + prop.footprint.x * actualScale, y: anchor.y + prop.footprint.y * actualScale, width: prop.footprint.width * actualScale, height: prop.footprint.height * actualScale }
  const depth = footprint.y + footprint.height / 2
  return { propId, anchor, scale: actualScale, footprint, depth, layers: prop.layers.map(layer => ({ ...layer,
    anchor: { x: anchor.x + (layer.offset?.x ?? 0) * actualScale, y: anchor.y + (layer.offset?.y ?? 0) * actualScale },
    depth: depth + (layer.depthOffset ?? (layer.role === 'back' ? -1 : layer.role === 'front' || layer.role === 'canopy' ? 1 : 0)),
  })) }
}
/** One placement for layout, collisions, rendering and front-of-desk hands. */
export function readCForestStation(catalog: CForestPropsCatalog, deskId: string, look: CForestLookId, foot: CForestPoint, actorScale: number): {
  foot: CForestPoint; desk: CForestPlacedProp; stool: CForestPlacedProp; foregroundDepth: number; contact: 'matched-points' | 'declared-default-offset' | 'measured-fixed-points'
  facing: CForestSharedSeat['facing']; actions: CForestSharedSeat['actions']; contactError: CForestPoint | null
  bookPoint: CForestPoint | null
} {
  const deskProp = catalog.props[deskId], station = deskProp?.stations?.[look]
  if (!deskProp || !station) throw new Error(`The ${deskId} prop has no station for the ${look} look.`)
  const matched = station.actorContact && station.propContact
  const fixed = station.placement === 'fixed-seat'
  const anchor = matched && !fixed ? {
    x: foot.x + station.actorContact!.x * actorScale - station.propContact!.x * deskProp.defaultScale,
    y: foot.y + station.actorContact!.y * actorScale - station.propContact!.y * deskProp.defaultScale,
  } : { x: foot.x - station.actorFoot.x * deskProp.defaultScale, y: foot.y - station.actorFoot.y * deskProp.defaultScale }
  const desk = placeCForestProp(catalog, deskId, anchor)
  const stool = placeCForestProp(catalog, station.stoolProp, foot, actorScale * catalog.props[station.stoolProp]!.defaultScale)
  const front = desk.layers.find(layer => layer.role === station.foregroundAfter)
  if (!front) throw new Error(`The ${deskId} station has no front layer for hands to clear.`)
  const contactError = fixed ? { x: foot.x + station.actorContact!.x * actorScale - (desk.anchor.x + station.propContact!.x * desk.scale),
    y: foot.y + station.actorContact!.y * actorScale - (desk.anchor.y + station.propContact!.y * desk.scale) } : null
  return { foot, desk, stool, foregroundDepth: front.depth + .5, contact: fixed ? 'measured-fixed-points' : matched ? 'matched-points' : 'declared-default-offset',
    facing: station.facing ?? 'se', actions: station.actions ?? { sit: 'sit', work: 'work', stand: 'stand' }, contactError,
    bookPoint: station.bookPoint ? { x: desk.anchor.x + station.bookPoint.x * desk.scale, y: desk.anchor.y + station.bookPoint.y * desk.scale } : null }
}

/** Read one seat against an already placed table. A mismatch is evidence, never a pose correction. */
export function readCForestSharedStation(catalog: CForestPropsCatalog, table: CForestPlacedProp, seatId: string, look: CForestLookId, foot: CForestPoint, actorScale: number) {
  const seat = catalog.props[table.propId]?.seats?.[seatId]
  if (!seat) throw new Error(`The ${table.propId} prop has no shared seat ${seatId}.`)
  const expected = { x: table.anchor.x + seat.actorFoot.x * table.scale, y: table.anchor.y + seat.actorFoot.y * table.scale }
  if (Math.abs(expected.x - foot.x) > .001 || Math.abs(expected.y - foot.y) > .001) throw new Error(`The ${table.propId} seat ${seatId} does not match the saved foot point.`)
  const contact = seat.contacts[look]
  if (!contact) throw new Error(`The ${table.propId} seat ${seatId} has no measured ${look} contact or stool.`)
  const actorContact = contact ? { x: foot.x + contact.actor.x * actorScale, y: foot.y + contact.actor.y * actorScale } : null
  const propContact = contact ? { x: table.anchor.x + contact.prop.x * table.scale, y: table.anchor.y + contact.prop.y * table.scale } : null
  const contactError = actorContact && propContact ? { x: actorContact.x - propContact.x, y: actorContact.y - propContact.y } : null
  const stool = placeCForestProp(catalog, contact.stoolProp, foot, actorScale * catalog.props[contact.stoolProp]!.defaultScale)
  return { foot, stool, facing: seat.facing, actions: seat.actions,
    bodyDepth: foot.y, foregroundDepth: table.layers[seat.foregroundLayer]!.depth + .5,
    actorContact, propContact, contactError,
    bookPoint: contact.bookPoint ? { x: table.anchor.x + contact.bookPoint.x * table.scale, y: table.anchor.y + contact.bookPoint.y * table.scale } : null }
}

export type CSurfaceMaterial = 'ground' | 'road' | 'plainWork' | 'sharedWork'
export interface CForestSurfaceCatalog {
  version: 2; scene: PixelScene; tileSize: 32; sprites: Record<string, CForestSprite>
  materials: Record<CSurfaceMaterial, { sprite: string; weight: number }[]>
  provenance?: Record<string, unknown>
}
interface LegacySharedSurface {
  version: 1; tileSize: 32; sprites: Record<string, CForestSprite>
  materials: Record<'grass' | 'earth' | 'wood', { sprite: string; weight: number }[]>
  provenance?: Record<string, unknown>
}
export const C_FOREST_SURFACE_URL = '/office-map/c-environments/shared/ground.json'
/** Equal material lists choose the same tile, so a level work area does not invent a second floor pattern. */
export function cSurfaceSpriteAt(catalog: CForestSurfaceCatalog, material: CSurfaceMaterial, seed: string, tileX: number, tileY: number): string {
  const variants = catalog.materials[material]
  const signature = variants.map(variant => `${variant.sprite}:${variant.weight}`).join('|')
  let remainder = pixelRandom(`${seed}:surface:${signature}:${tileX}:${tileY}`)() * variants.reduce((sum, variant) => sum + variant.weight, 0)
  for (const variant of variants) { remainder -= variant.weight; if (remainder < 0) return variant.sprite }
  return variants.at(-1)!.sprite
}
/** The unchanged v1 shared file is woodland grass/earth/wood. New scenes name their actual ground. */
export function readCForestSurfaceCatalog(value: unknown, expectedScene?: PixelScene): CForestSurfaceCatalog {
  if (!value || typeof value !== 'object') throw new Error('The ground catalog is not an object.')
  const raw = value as CForestSurfaceCatalog | LegacySharedSurface
  const allowed = raw.version === 1 ? ['version', 'tileSize', 'sprites', 'materials', 'provenance'] : ['version', 'scene', 'tileSize', 'sprites', 'materials', 'provenance']
  const unknown = Object.keys(raw).filter(name => !allowed.includes(name))
  if (unknown.length) throw new Error(`The ground catalog contains unused fields: ${unknown.join(', ')}.`)
  if (raw.tileSize !== 32 || !raw.sprites || !raw.materials) throw new Error('The ground catalog is incomplete.')
  let catalog: CForestSurfaceCatalog
  if (raw.version === 1) {
    if (Object.keys(raw.materials).sort().join('|') !== 'earth|grass|wood') throw new Error('The legacy shared ground must name grass, earth and wood.')
    catalog = { version: 2, scene: 'woodland', tileSize: 32, sprites: raw.sprites,
      materials: { ground: raw.materials.grass, road: raw.materials.earth, plainWork: raw.materials.earth, sharedWork: raw.materials.wood },
      provenance: { ...raw.provenance, normalizedFrom: 'Shared v1 woodland: grass becomes ground; earth becomes road/plainWork; wood becomes sharedWork.' } }
  } else if (raw.version === 2) catalog = raw
  else throw new Error('The ground catalog version is unsupported.')
  if (!PIXEL_SCENES.includes(catalog.scene) || (expectedScene !== undefined && catalog.scene !== expectedScene)) throw new Error(`The ground catalog does not belong to ${expectedScene ?? 'a supported scene'}.`)
  readSprites(catalog.sprites)
  const ownRoot = catalog.scene === 'woodland' ? '/office-map/c-forest/' : '/office-map/c-environments/' + catalog.scene + '/'
  for (const [id, sprite] of Object.entries(catalog.sprites)) {
    const shared = id.startsWith('shared-') && sprite.src.startsWith('/office-map/c-environments/shared/')
    const own = raw.version === 2 && (catalog.scene === 'woodland' || id.startsWith(catalog.scene + '-')) && sprite.src.startsWith(ownRoot)
    if ((!shared && !own) || sprite.width !== 32 || sprite.height !== 32) throw new Error(`Ground image ${id} has no matching scene/shared path or 32 pixel grid.`)
  }
  if (Object.keys(catalog.materials).sort().join('|') !== 'ground|plainWork|road|sharedWork') throw new Error('The ground catalog must name ground, road, plainWork and sharedWork.')
  const used = new Set<string>()
  for (const [name, variants] of Object.entries(catalog.materials)) {
    if (!Array.isArray(variants) || !variants.length || variants.some(variant => !catalog.sprites[variant.sprite] || !Number.isSafeInteger(variant.weight) || variant.weight <= 0)) throw new Error(`The ${name} material has no valid images and weights.`)
    for (const variant of variants) used.add(variant.sprite)
  }
  const unused = Object.keys(catalog.sprites).filter(id => !used.has(id))
  if (unused.length) throw new Error(`The ground catalog contains images no material uses: ${unused.join(', ')}.`)
  return catalog
}

export interface CForestTerrainCatalog {
  version: 1; tileSize: 32; connectionOrder: 'nesw'
  sprites: Record<string, CForestSprite>; grass: string[]; road: Record<string, string>; platform: Record<string, string>; earthFill?: string
  adjacencyMeaning?: string
  provenance?: Record<string, unknown>
}
export interface CEnvironmentTerrainCatalog extends Omit<CForestTerrainCatalog, 'version' | 'grass'> {
  version: 2
  ground: string[]
}
/** All environments use the same grid check. The old forest file retains its v1 grass field. */
export function readCEnvironmentTerrain(value: unknown): CEnvironmentTerrainCatalog {
  if (!value || typeof value !== 'object') throw new Error('The C environment terrain catalog is not an object.')
  const raw = value as CEnvironmentTerrainCatalog | CForestTerrainCatalog
  let catalog: CEnvironmentTerrainCatalog
  if (raw.version === 1) {
    const { grass, ...rest } = raw
    catalog = { ...rest, version: 2, ground: grass }
  } else if (raw.version === 2) catalog = raw
  else throw new Error('The C environment terrain catalog has an unsupported version.')
  if (catalog.tileSize !== 32 || catalog.connectionOrder !== 'nesw' || !catalog.sprites || !Array.isArray(catalog.ground) || !catalog.ground.length || !catalog.road || !catalog.platform) throw new Error('The C environment terrain catalog lacks its tile size, connection order or materials.')
  readSprites(catalog.sprites)
  const keys = Array.from({ length: 16 }, (_, mask) => ['n', 'e', 's', 'w'].filter((_, bit) => mask & 1 << bit).join('')).sort()
  for (const family of [catalog.road, catalog.platform]) {
    if (Object.keys(family).sort().join('|') !== keys.join('|')) throw new Error('A C environment terrain material does not declare all sixteen edge connections.')
  }
  const used = [...catalog.ground, ...Object.values(catalog.road), ...Object.values(catalog.platform), ...(catalog.earthFill ? [catalog.earthFill] : [])]
  for (const id of used) if (!catalog.sprites[id] || catalog.sprites[id]!.width !== catalog.tileSize || catalog.sprites[id]!.height !== catalog.tileSize) throw new Error(`C environment terrain tile ${id} is absent or has a different grid size.`)
  return catalog
}
export function readCForestTerrain(value: unknown): CForestTerrainCatalog {
  if (!value || typeof value !== 'object') throw new Error('The C forest terrain catalog is not an object.')
  const catalog = value as CForestTerrainCatalog
  if (catalog.version !== 1) throw new Error('The C forest terrain catalog has an unsupported version.')
  readCEnvironmentTerrain(catalog)
  return catalog
}

/** These are candidate display values for the first side-by-side review. Stored v1 scales do not change. */
export const C_FOREST_SCALE_RANGE = { low: .80, high: .92 } as const
// The approved 5544a28a demonstration crossed 289 world pixels in 2100 ms.
export const C_FOREST_WALK_SPEED = 289 / 2.1
export function readCForestScale(saved: PixelScale | null): { value: number | null; saved: number | null; source: 'c-display-conversion' | 'not-recorded' } {
  if (saved === null) return { value: null, saved: null, source: 'not-recorded' }
  const fraction = (saved.value - .3) / (1.6 - .3)
  return { value: C_FOREST_SCALE_RANGE.low + fraction * (C_FOREST_SCALE_RANGE.high - C_FOREST_SCALE_RANGE.low), saved: saved.value, source: 'c-display-conversion' }
}

export function cForestFrameDuration(action: CForestAction, frame: CForestFrame): number {
  return frame.durationMs ?? 1000 / (action.fps ?? 8)
}
export function cForestActionDuration(action: CForestAction): number {
  return action.frames.reduce((sum, frame) => sum + cForestFrameDuration(action, frame), 0)
}
export function cForestFrameAt(action: CForestAction, timeMs: number): { frame: CForestFrame; index: number } {
  const duration = cForestActionDuration(action)
  let cursor = action.loop === false ? Math.min(Math.max(0, timeMs), duration - .001) : ((timeMs % duration) + duration) % duration
  for (const [index, frame] of action.frames.entries()) {
    if (cursor < cForestFrameDuration(action, frame)) return { frame, index }
    cursor -= cForestFrameDuration(action, frame)
  }
  return { frame: action.frames.at(-1)!, index: action.frames.length - 1 }
}

export interface CForestRasterMetrics { width: number; height: number; anchor: CForestPoint }
/** Art, hand overlays, shadows and hit rectangles all use this integer world-pixel conversion. */
export function cForestRasterMetrics(sprite: Pick<CForestSprite, 'width' | 'height' | 'anchor'>, scale: number): CForestRasterMetrics {
  return { width: Math.max(1, Math.round(sprite.width * scale)), height: Math.max(1, Math.round(sprite.height * scale)), anchor: { x: Math.round(sprite.anchor.x * scale), y: Math.round(sprite.anchor.y * scale) } }
}
export function cForestHitRect(sprite: Pick<CForestSprite, 'width' | 'height' | 'anchor'>, scale: number, foot: CForestPoint, flipX = false): CForestRasterMetrics & CForestPoint {
  const raster = cForestRasterMetrics(sprite, scale)
  if (flipX) raster.anchor.x = raster.width - raster.anchor.x
  return { ...raster, x: Math.round(foot.x) - raster.anchor.x, y: Math.round(foot.y) - raster.anchor.y }
}

/** The old two-look file stays intact. Each adopted look contributes a separate, conflict-checked file. */
export function readCForestOfficeCatalog(base: unknown, fragments: readonly unknown[] = [], mirrorValue?: unknown): CForestCatalog {
  const merged: Record<'sprites' | 'looks' | 'actions', Record<string, unknown>> = { sprites: {}, looks: {}, actions: {} }
  const sources: unknown[] = []
  for (const value of [base, ...fragments]) {
    if (!value || typeof value !== 'object') throw new Error('A C look catalog fragment is not an object.')
    const fragment = value as CForestCatalog
    if (fragment.version !== 1) throw new Error('A C look catalog fragment has an unsupported version.')
    for (const field of ['sprites', 'looks', 'actions'] as const) {
      if (!fragment[field] || typeof fragment[field] !== 'object' || Array.isArray(fragment[field])) throw new Error(`A C look catalog fragment has no ${field}.`)
      for (const [id, entry] of Object.entries(fragment[field])) {
        if (id in merged[field] && JSON.stringify(merged[field][id]) !== JSON.stringify(entry)) throw new Error(`C look catalog ${field}.${id} has conflicting declarations.`)
        merged[field][id] = entry
      }
    }
    if (fragment.provenance) sources.push(fragment.provenance)
  }
  if (mirrorValue !== undefined) {
    if (!mirrorValue || typeof mirrorValue !== 'object') throw new Error('The fromBase action catalog is not an object.')
    const mirrors = mirrorValue as { version: number; fromBase: { look: string; action: string; source: string; flipX: boolean }[]; provenance?: unknown }
    if (mirrors.version !== 1 || !Array.isArray(mirrors.fromBase) || Object.keys(mirrors).some(key => !['version', 'fromBase', 'provenance'].includes(key))) throw new Error('The fromBase action catalog is incomplete or contains unsupported fields.')
    for (const mirror of mirrors.fromBase) {
      if (!mirror || Object.keys(mirror).sort().join('|') !== 'action|flipX|look|source' || ![mirror.look, mirror.action, mirror.source].every(value => typeof value === 'string' && value.length > 0) || mirror.flipX !== true) throw new Error('A fromBase action needs its own look, action, source and flipX=true.')
      const source = (base as CForestCatalog).actions[mirror.look as CForestLookId]?.[mirror.source]
      if (!source?.frames.length) throw new Error(`The ${mirror.look} fromBase action ${mirror.source} is missing. Mirrors cannot reference another look or another mirror.`)
      const actions = merged.actions[mirror.look] as Record<string, CForestAction> | undefined
      if (!actions || mirror.action in actions) throw new Error(`The ${mirror.look} mirrored action ${mirror.action} conflicts with an existing declaration.`)
      merged.actions[mirror.look] = { ...actions, [mirror.action]: { ...source, frames: source.frames.map(frame => ({ ...frame, flipX: !frame.flipX,
        ...(frame.offsetX === undefined ? {} : { offsetX: -frame.offsetX }) })) } }
    }
    sources.push({ fromBase: mirrors.fromBase, provenance: mirrors.provenance ?? null })
  }
  return readCForestCatalog({ version: 1, ...merged, provenance: { sources } })
}

/** A C catalog is usable only when its images, looks and frame references agree. */
export function readCForestCatalog(value: unknown): CForestCatalog {
  if (!value || typeof value !== 'object') throw new Error('The C forest asset catalog is not an object.')
  const catalog = value as CForestCatalog
  if (catalog.version !== 1 || !catalog.sprites || !catalog.actions || !catalog.looks) throw new Error('The C forest asset catalog has no supported version, sprites, actions or looks.')
  readSprites(catalog.sprites)
  const looks = Object.keys(catalog.looks).sort()
  if (looks.join('|') !== [...C_FOREST_LOOK_IDS].sort().join('|')) throw new Error('The C forest catalog and saved appearance version do not name the same looks.')
  if (Object.keys(catalog.actions).sort().join('|') !== looks.join('|')) throw new Error('The C forest action catalog and look catalog do not name the same looks.')
  for (const lookId of C_FOREST_LOOK_IDS) {
    const look = catalog.looks[lookId]
    const actions = catalog.actions[lookId]
    if (!look?.label?.en || !look.label.zh || !catalog.sprites[look.idleSprite] || !actions?.idle?.frames.length) throw new Error(`The ${lookId} look has no readable name or idle pose.`)
    if (actions.idle.frames[0]!.sprite !== look.idleSprite) throw new Error(`The ${lookId} idle image differs between its look and action.`)
    if (look.tableBook && (!catalog.sprites[look.tableBook.sprite] || !actions.pick_book?.frames.length || !actions.put_book?.frames.length)) throw new Error(`The ${lookId} table book has no independent image or complete pick/put actions.`)
    if (look.tableBook && Object.values(actions).some(action => action.frames.some(frame => frame.sprite === look.tableBook!.sprite || frame.foregroundSprite === look.tableBook!.sprite))) throw new Error(`The ${lookId} table book must use an independent image, not a body or hand frame.`)
    for (const [name, action] of Object.entries(actions)) {
      if (!action.frames?.length) throw new Error(`The ${lookId} ${name} action has no frames.`)
      for (const frame of action.frames) {
        const duration = cForestFrameDuration(action, frame)
        if (!catalog.sprites[frame.sprite] || !Number.isFinite(duration) || duration <= 0 || (frame.foregroundSprite && !catalog.sprites[frame.foregroundSprite])) throw new Error(`The ${lookId} ${name} action names an unavailable frame or duration.`)
        if (frame.tableBookVisible !== undefined && (typeof frame.tableBookVisible !== 'boolean' || !look.tableBook)) throw new Error(`The ${lookId} ${name} frame has no valid independent table-book declaration.`)
        if (look.tableBook && /^(pick_book|put_book)(?:_(?:se|sw|ne|nw))?$/.test(name) && typeof frame.tableBookVisible !== 'boolean') throw new Error(`The ${lookId} ${name} frame does not say whether its book is still on the table.`)
      }
    }
  }
  return catalog
}
