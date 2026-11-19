// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
import { PIXEL_SCENES, type PixelScene } from './pixel-office.ts'
import { C_FOREST_SURFACE_URL, mergeCForestSprites, readCEnvironmentTerrain, readCForestProps, type CEnvironmentTerrainCatalog, type CForestPropsCatalog, type CForestSurfaceCatalog } from './c-forest.ts'

export const C_NEW_ENVIRONMENTS = ['high-rise', 'cavern', 'greenhouse', 'night-library'] as const
const names = z.array(z.string().min(1))
export const cEnvironmentDefinitionSchema = z.object({
  version: z.literal(1), scene: z.enum(PIXEL_SCENES),
  stations: z.object({ worker: z.string().min(1), secretary: z.string().min(1) }).strict(),
  decorations: z.object({ ground: names, backdrop: names, boundary: names }).strict(),
  furniture: z.object({ single: names, shared: names }).strict().optional(),
}).strict()
export type CEnvironmentDefinition = z.infer<typeof cEnvironmentDefinitionSchema>
export interface CEnvironmentCatalog {
  definition: CEnvironmentDefinition
  props: CForestPropsCatalog
  terrain: CEnvironmentTerrainCatalog | null
  surface?: CForestSurfaceCatalog
}
export function cEnvironmentUrls(scene: PixelScene) {
  const root = scene === 'woodland' ? '/office-map/c-forest' : '/office-map/c-environments/' + scene
  return { props: root + '/props.json', terrain: root + '/terrain.json', definition: root + '/environment.json', surface: scene === 'woodland' ? C_FOREST_SURFACE_URL : root + '/surface.json' }
}
/** The existing forest uses its adopted props and materials without rewriting their files. */
export const C_WOODLAND_DEFINITION: CEnvironmentDefinition = {
  version: 1, scene: 'woodland', stations: { worker: 'worker-desk', secretary: 'secretary-desk' },
  decorations: { ground: ['daisies', 'yellow-flowers', 'ground-fern', 'grass-tuft'], backdrop: ['tree'], boundary: ['tree'] },
}
/** Explicit furniture selection for the review world. The original forest declaration remains a baseline. */
export const C_WOODLAND_ADOPTED_DEFINITION: CEnvironmentDefinition = {
  ...C_WOODLAND_DEFINITION,
  furniture: { single: ['shared-single-desk', 'shared-octagonal-desk'], shared: ['shared-three-seat-desk'] },
}

/** New packs may explicitly reuse old desks. A conflicting prop never replaces an existing one. */
export function readCEnvironmentCatalog(scene: PixelScene, definitionValue: unknown, propsValue: unknown, terrainValue: unknown, sharedProps: CForestPropsCatalog, surface?: CForestSurfaceCatalog): CEnvironmentCatalog {
  const definition = cEnvironmentDefinitionSchema.parse(definitionValue)
  if (definition.scene !== scene) throw new Error(`The ${scene} environment declares another scene.`)
  if (!propsValue || typeof propsValue !== 'object') throw new Error(`The ${scene} props catalog is not an object.`)
  const raw = propsValue as CForestPropsCatalog
  if (raw.version !== 1 || !raw.sprites || !raw.props) throw new Error(`The ${scene} props catalog is incomplete.`)
  const merged = { ...sharedProps.props }
  for (const [id, prop] of Object.entries(raw.props)) {
    if (merged[id] && JSON.stringify(merged[id]) !== JSON.stringify(prop)) throw new Error(`The ${scene} prop ${id} conflicts with a shared prop.`)
    if (scene !== 'woodland' && !merged[id] && !id.startsWith(scene + '-')) throw new Error(`The ${scene} prop ${id} has no scene prefix.`)
    merged[id] = prop
  }
  const props = readCForestProps({ ...raw, sprites: mergeCForestSprites(sharedProps.sprites, raw.sprites), props: merged }, {})
  const terrain = terrainValue === null ? null : readCEnvironmentTerrain(terrainValue)
  if (!terrain && !surface) throw new Error(`The ${scene} environment has no complete ground catalog.`)
  if (surface && surface.scene !== scene) throw new Error(`The ${scene} environment was given another scene’s ground.`)
  if (terrain && scene !== 'woodland' && (terrainValue as { version?: number }).version !== 2) throw new Error(`The ${scene} floor must declare its ground material with version 2.`)
  for (const id of Object.values(definition.stations)) if (!props.props[id]?.stations) throw new Error(`The ${scene} environment has no usable ${id} station.`)
  for (const id of definition.furniture?.single ?? []) if (!props.props[id]?.stations) throw new Error(`The ${scene} environment has no single-seat ${id} station.`)
  for (const id of definition.furniture?.shared ?? []) if (Object.keys(props.props[id]?.seats ?? {}).length < 2) throw new Error(`The ${scene} environment has no shared ${id} seats.`)
  for (const id of Object.values(definition.decorations).flat()) if (!props.props[id]) throw new Error(`The ${scene} environment names unavailable decoration ${id}.`)
  return { definition, props, terrain, ...(surface ? { surface } : {}) }
}
