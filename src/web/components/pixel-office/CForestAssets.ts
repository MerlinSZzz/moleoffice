// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useSyncExternalStore } from 'react'
import { C_FOREST_SHARED_PROPS_URL, readCForestSurfaceCatalog, readCForestOfficeProps, C_FOREST_CATALOG_URL, C_FOREST_PROPS_URL, C_FOREST_TERRAIN_URL, cForestFrameAt, mergeCForestSprites, C_FOREST_ACTION_MIRRORS_URL, C_FOREST_LOOK_URLS, readCForestOfficeCatalog, readCForestTerrain, C_FOREST_APRON_CUSTOMISATION_URL, type CForestCatalog, type CForestFrame, type CForestSprite, type CForestPropsCatalog, type CForestTerrainCatalog } from '@shared/c-forest.ts'
import { createI18n, type WordKey, type WordValues } from '@shared/i18n.ts'
import { PIXEL_SCENES, C_APRON_LOOK_ID, type CForestLookId, type PixelLanguage, type PixelScene } from '@shared/pixel-office.ts'
import { readCApronCustomisation, checkCApronCoverage, renderCApronPixels, renderCApronHaloPixels, C_APRON_HALO_CONTAINER, type CApronCustomisation, type CApronRenderOptions } from '@shared/pixel-appearance.ts'
import { C_WOODLAND_ADOPTED_DEFINITION, cEnvironmentUrls, readCEnvironmentCatalog, type CEnvironmentCatalog } from '@shared/c-environments.ts'
import { moleOfficeHeaders } from '../../api.ts'
import { aRequestStarted, aRequestSettled } from '../../lib/ready.ts'

/** Reads map words in the saved language through the shared lists. */
export type SceneLanguage = PixelLanguage | 'xx'
const sceneReaders = {
  en: createI18n('en'),
  zh: createI18n('zh'),
  xx: createI18n('xx'),
}

const sceneWordKeys = {
  cavern: 'settingsPanel.map.scene.cavern',
  'high-rise': 'settingsPanel.map.scene.highRise',
  woodland: 'settingsPanel.map.scene.woodland',
  greenhouse: 'settingsPanel.map.scene.greenhouse',
  'night-library': 'settingsPanel.map.scene.nightLibrary',
} satisfies Record<PixelScene, WordKey>

const sceneLookWordKeys = {
  bare: 'g6c.pixel.look.bare',
  scarf: 'g6c.pixel.look.scarf',
  'sand-apron': 'g6c.pixel.look.sandApron',
  'cocoa-vest': 'g6c.pixel.look.cocoaVest',
  'silver-glasses': 'g6c.pixel.look.silverGlasses',
} satisfies Record<CForestLookId, WordKey>

export function sceneWord(language: SceneLanguage, key: WordKey, values?: WordValues): string {
  return sceneReaders[language].t(key, values)
}

export function sceneName(language: SceneLanguage, scene: PixelScene): string {
  return sceneWord(language, sceneWordKeys[scene])
}

export function sceneLookName(language: SceneLanguage, look: CForestLookId): string {
  return sceneWord(language, sceneLookWordKeys[look])
}

export function sceneWordFallbacks(): { language: SceneLanguage; key: WordKey; count: number }[] {
  return (Object.keys(sceneReaders) as SceneLanguage[]).flatMap(language =>
    sceneReaders[language].check().fallbacks.map(fallback => ({ language, key: fallback.key as WordKey, count: fallback.count })),
  )
}

export interface CEnvironmentAssets {
  status: 'loading' | 'ready' | 'failed'
  catalog: CEnvironmentCatalog | null
  error: string | null
  /** The raw ids of the sprites this pack could not load, for the reader's own language at the
   * display site. Empty except in the one failure this names: images the catalog names but the
   * browser never got. */
  missingImages: readonly string[]
}
const loadingEnvironments = () => Object.fromEntries(PIXEL_SCENES.map(scene => [scene, { status: 'loading', catalog: null, error: null, missingImages: [] as string[] }])) as unknown as Record<PixelScene, CEnvironmentAssets>
export interface CForestAssets {
  status: 'loading' | 'ready' | 'failed'
  catalog: CForestCatalog | null
  customisation: CApronCustomisation | null
  customisationError: string | null
  environments: Record<PixelScene, CEnvironmentAssets>
  props: CForestPropsCatalog | null
  terrain: CForestTerrainCatalog | null
  images: ReadonlyMap<string, HTMLImageElement>
  errors: ReadonlyMap<string, string>
  error: string | null
}
let snapshot: CForestAssets = { status: 'loading', catalog: null, customisation: null, customisationError: null, environments: loadingEnvironments(), props: null, terrain: null, images: new Map(), errors: new Map(), error: null }
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()
function publish(next: CForestAssets) { snapshot = next; for (const listener of listeners) listener() }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function loadCForestAssets(force = false): Promise<void> {
  if (pending) return pending
  if (!force && snapshot.status === 'ready') return Promise.resolve()
  // Catalog fetches and image decodes bypass the API transport. Keep the page waiting until
  // the complete art snapshot is published, including any failures the viewport must show.
  aRequestStarted('office map art')
  publish({ ...snapshot, status: 'loading', environments: loadingEnvironments(), error: null })
  pending = (async () => {
    try {
      const response = await fetch(C_FOREST_CATALOG_URL, { cache: 'no-cache', headers: moleOfficeHeaders() })
      if (!response.ok) throw new Error(`C forest catalog: HTTP ${response.status}`)
      const fragments = await Promise.all(C_FOREST_LOOK_URLS.map(async ({ url }) => {
        const response = await fetch(url, { cache: 'no-cache', headers: moleOfficeHeaders() })
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
        return response.json() as Promise<unknown>
      }))
      const mirrors = await fetch(C_FOREST_ACTION_MIRRORS_URL, { cache: 'no-cache', headers: moleOfficeHeaders() })
      if (!mirrors.ok) throw new Error(`${C_FOREST_ACTION_MIRRORS_URL}: HTTP ${mirrors.status}`)
      const catalog = readCForestOfficeCatalog(await response.json(), fragments, await mirrors.json())
      let customisation: CApronCustomisation | null = null, customisationError: string | null = null
      try {
        const apron = await fetch(C_FOREST_APRON_CUSTOMISATION_URL, { cache: 'no-cache', headers: moleOfficeHeaders() })
        if (!apron.ok) throw new Error(`${C_FOREST_APRON_CUSTOMISATION_URL}: HTTP ${apron.status}`)
        customisation = readCApronCustomisation(await apron.json())
        // A version-3 value is drawn only when every sprite its actions use has regions and a head anchor.
        checkCApronCoverage(customisation, catalog.actions[C_APRON_LOOK_ID])
      } catch (reason) {
        customisation = null
        customisationError = reason instanceof Error ? reason.message : String(reason)
      }
      const images = new Map<string, HTMLImageElement>(), errors = new Map<string, string>()
      const readJson = async (url: string) => { const response = await fetch(url, { cache: 'no-cache', headers: moleOfficeHeaders() }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json() as Promise<unknown> }
      const environmental = await Promise.allSettled([
        Promise.all([readJson(C_FOREST_PROPS_URL), readJson(C_FOREST_SHARED_PROPS_URL)]).then(([base, shared]) => readCForestOfficeProps(base, shared, catalog.sprites, catalog)),
        readJson(C_FOREST_TERRAIN_URL).then(readCForestTerrain),
      ])
      const props = environmental[0].status === 'fulfilled' ? environmental[0].value : null
      const terrain = environmental[1].status === 'fulfilled' ? environmental[1].value : null
      environmental.forEach((result, index) => { if (result.status === 'rejected') errors.set(index === 0 ? C_FOREST_PROPS_URL : C_FOREST_TERRAIN_URL, String(result.reason)) })
      const environments = loadingEnvironments()
      // Each pack is checked separately. An unfinished scene cannot borrow the forest floor.
      await Promise.all(PIXEL_SCENES.map(async scene => {
        try {
          if (!props) throw new Error('The shared furniture catalog is unavailable.')
          const urls = cEnvironmentUrls(scene)
          const values = await Promise.all([
            scene === 'woodland' ? Promise.resolve(C_WOODLAND_ADOPTED_DEFINITION) : readJson(urls.definition),
            scene === 'woodland' ? Promise.resolve(props) : readJson(urls.props),
            scene === 'woodland' ? Promise.resolve(terrain) : Promise.resolve(null), readJson(urls.surface),
          ])
          const surface = readCForestSurfaceCatalog(values[3], scene)
          const pack = readCEnvironmentCatalog(scene, values[0], values[1], values[2], props, surface)
          environments[scene] = { status: 'ready', catalog: pack, error: null, missingImages: [] }
        } catch (reason) {
          environments[scene] = { status: 'failed', catalog: null, error: reason instanceof Error ? reason.message : String(reason), missingImages: [] }
        }
      }))
      const sprites = mergeCForestSprites(catalog.sprites, props?.sprites ?? {}, terrain?.sprites ?? {},
        ...Object.values(environments).flatMap(environment => environment.catalog ? [environment.catalog.props.sprites, environment.catalog.terrain?.sprites ?? {}, environment.catalog.surface?.sprites ?? {}] : []))
      const failedImages = new Map<string, string>()
      await Promise.all(Object.entries(sprites).map(async ([id, sprite]) => {
        const image = new Image(); image.src = sprite.src
        try {
          await image.decode()
          if (image.naturalWidth !== sprite.width || image.naturalHeight !== sprite.height) throw new Error('The actual image dimensions differ from the catalog.')
          images.set(id, image)
        } catch (reason) { failedImages.set(id, reason instanceof Error ? reason.message : String(reason)) }
      }))
      for (const [id, reason] of failedImages) if (catalog.sprites[id] || props?.sprites[id] || terrain?.sprites[id]) errors.set(id, reason)
      for (const [scene, environment] of Object.entries(environments)) {
        if (!environment.catalog) continue
        const needed = [...Object.values(environment.catalog.props.props).flatMap(prop => prop.layers.map(layer => layer.sprite)), ...Object.keys(environment.catalog.terrain?.sprites ?? {}), ...Object.keys(environment.catalog.surface?.sprites ?? {})]
        const missing = [...new Set(needed)].filter(id => failedImages.has(id))
        // No English sentence is built here: the raw ids are kept for the display site, which
        // reads them in the reader's own scene language.
        if (missing.length) environments[scene as PixelScene] = { status: 'failed', catalog: environment.catalog, error: null, missingImages: missing }
      }
      publish({ status: 'ready', catalog, customisation, customisationError, props, terrain, environments, images, errors, error: null })
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : String(reason)
      const environments = loadingEnvironments()
      for (const scene of PIXEL_SCENES) environments[scene] = { status: 'failed', catalog: null, error, missingImages: [] }
      publish({ status: 'failed', catalog: null, customisation: null, customisationError: error, environments, props: null, terrain: null, images: new Map(), errors: new Map(), error })
    } finally { pending = null; aRequestSettled('office map art') }
  })()
  return pending
}
export function useCForestAssets(): CForestAssets {
  const value = useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
  useEffect(() => { void loadCForestAssets() }, [])
  return value
}

/** The one recoloured, halo-drawn sprite canvas the preview and the map share. */
const apronCanvasCache = new WeakMap<CApronCustomisation, Map<string, HTMLCanvasElement>>()
export function cApronSpriteCanvas(assets: CForestAssets, spriteId: string, options: CApronRenderOptions): HTMLCanvasElement | null {
  const customisation = assets.customisation, image = assets.images.get(spriteId), sprite = assets.catalog?.sprites[spriteId]
  if (!customisation || !image || !sprite) return null
  let cache = apronCanvasCache.get(customisation)
  if (!cache) { cache = new Map(); apronCanvasCache.set(customisation, cache) }
  const key = `${spriteId}:${options.fur ? 1 : 0}${options.cloth ? 1 : 0}${options.accessory ? 1 : 0}`
  const held = cache.get(key)
  if (held) return held
  const canvas = document.createElement('canvas'); canvas.width = sprite.width; canvas.height = sprite.height
  const context = canvas.getContext('2d')!
  context.imageSmoothingEnabled = false
  context.drawImage(image, 0, 0)
  const data = context.getImageData(0, 0, sprite.width, sprite.height)
  data.data.set(renderCApronPixels(data.data, sprite.width, sprite.height, spriteId, customisation, options))
  context.putImageData(data, 0, 0)
  cache.set(key, canvas)
  return canvas
}

/** The one code-drawn gold-halo container the preview and the map share. No image file backs it. */
let apronHaloCanvas: HTMLCanvasElement | null = null
export function cApronHaloCanvas(): HTMLCanvasElement {
  if (apronHaloCanvas) return apronHaloCanvas
  const canvas = document.createElement('canvas')
  canvas.width = C_APRON_HALO_CONTAINER.width; canvas.height = C_APRON_HALO_CONTAINER.height
  const context = canvas.getContext('2d')!
  const data = context.createImageData(canvas.width, canvas.height)
  data.data.set(renderCApronHaloPixels())
  context.putImageData(data, 0, 0)
  apronHaloCanvas = canvas
  return canvas
}

export function cForestActionAvailable(assets: CForestAssets, look: CForestLookId, name: string): boolean {
  const action = assets.catalog?.actions[look]?.[name]
  const book = assets.catalog?.looks[look]?.tableBook
  if (book && action?.frames.some(frame => frame.tableBookVisible !== undefined) && !assets.images.has(book.sprite)) return false
  return Boolean(action?.frames.length && action.frames.every(frame => assets.images.has(frame.sprite) && (!frame.foregroundSprite || assets.images.has(frame.foregroundSprite))))
}
export interface CForestFrameReading {
  requested: string
  action: string | null
  frame: CForestFrame | null
  sprite: CForestSprite | null
  frameIndex: number | null
  frameCount: number
  unavailable: boolean
}
/** Reads a frame for drawing; the page chooses translated words for unavailable actions. */
export function readCForestFrame(assets: CForestAssets, look: CForestLookId, requested: string, timeMs: number): CForestFrameReading {
  const supported = cForestActionAvailable(assets, look, requested)
  const name = supported ? requested : cForestActionAvailable(assets, look, 'idle') ? 'idle' : null
  if (!name || !assets.catalog) return { requested, action: null, frame: null, sprite: null, frameIndex: null, frameCount: 0, unavailable: true }
  const action = assets.catalog.actions[look][name]!
  const selected = cForestFrameAt(action, supported ? timeMs : 0)
  return { requested, action: name, frame: selected.frame, sprite: assets.catalog.sprites[selected.frame.sprite]!, frameIndex: selected.index, frameCount: action.frames.length, unavailable: !supported }
}
