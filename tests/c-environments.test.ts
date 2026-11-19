// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic malformed packs test refusal; adopted forest files test unchanged compatibility. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readCEnvironmentTerrain, C_FOREST_ACTION_MIRRORS_URL, C_FOREST_LOOK_URLS, readCForestOfficeCatalog, readCForestOfficeProps, readCForestProps, readCForestTerrain, readCForestSurfaceCatalog } from '../src/shared/c-forest.ts'
import { C_WOODLAND_DEFINITION, readCEnvironmentCatalog } from '../src/shared/c-environments.ts'
import { forestBackWalls, forestMapLayout, forestPointIsClear, reconcileForestMap, type ForestRoom, type ForestOccupant, type ForestMapSettings } from '../src/shared/forest-map.ts'

const json = (file: string) => JSON.parse(readFileSync('public/office-map/c-forest/' + file, 'utf8'))
const characters = readCForestOfficeCatalog(json('sprites.json'), C_FOREST_LOOK_URLS.map(({ url }) => JSON.parse(readFileSync('public' + url, 'utf8'))), JSON.parse(readFileSync('public' + C_FOREST_ACTION_MIRRORS_URL, 'utf8')))
const props = readCForestProps(json('props.json'), characters.sprites)
const oldTerrain = json('terrain.json')
const floor = () => {
  const { grass, ...rest } = structuredClone(oldTerrain)
  return { ...rest, version: 2, ground: grass }
}
const definition = () => ({ ...structuredClone(C_WOODLAND_DEFINITION), scene: 'cavern' as const })

describe('C environment materials and shared furniture', () => {
  it('keeps cutaway walls on separate real north edges, and leaves forest and unavailable rooms open', () => {
    const room: ForestRoom = { id: 'synthetic-split-wall', zone: 'team', title: 'Synthetic room', workspaceId: null, scene: 'greenhouse', environment: 'ready', environmentError: null,
      profile: 'branch', x: -144, y: -48, width: 576, height: 192, door: { x: 0, y: 192 }, occupants: [],
      cells: [{ x: -96, y: 0 }, { x: 0, y: 0 }, { x: 96, y: 0 }, { x: 384, y: 0 }, { x: 0, y: 96 }] }
    expect(forestBackWalls(room)).toMatchObject([
      { x: -144, y: -48, width: 288, height: 224, depth: -56, footprint: { x: -144, y: -56, width: 288, height: 8 } },
      { x: 336, y: -48, width: 96, height: 224, depth: -56, footprint: { x: 336, y: -56, width: 96, height: 8 } },
    ])
    expect(forestBackWalls({ ...room, scene: 'woodland' })).toEqual([])
    expect(forestBackWalls({ ...room, environment: 'unavailable' })).toEqual([])
  })

  it('uses adopted wall bases as route obstacles, draws windows in front, and preserves saved feet', () => {
    const read = (path: string) => JSON.parse(readFileSync('public/office-map/' + path, 'utf8'))
    const shared = readCForestOfficeProps(json('props.json'), read('c-environments/shared/props.json'), characters.sprites, characters)
    const environment = readCEnvironmentCatalog('high-rise', read('c-environments/high-rise/environment.json'), read('c-environments/high-rise/props.json'), null, shared,
      readCForestSurfaceCatalog(read('c-environments/high-rise/surface.json'), 'high-rise'))
    const settings: ForestMapSettings = { seed: 'synthetic-wall-layout', grouping: 'shared', scene: 'high-rise', workspaceScenes: {}, zh: false, decorations: 'normal' }
    const occupants: ForestOccupant[] = [{ id: 'synthetic-wall-mole', name: 'Synthetic mole', zone: 'secretary', team: null, projects: [], cLook: 'bare', cScale: .86 }]
    const held = reconcileForestMap(null, occupants, settings), before = JSON.stringify(held.state)
    const layout = forestMapLayout(held, occupants, settings, { props: shared, bodyRadius: 48, environments: { 'high-rise': environment } })
    expect(JSON.stringify(held.state)).toBe(before)
    expect(layout.seats['synthetic-wall-mole']!.foot).toEqual(held.state.regions[0]!.slots[held.state.assignments['synthetic-wall-mole']!.slot])
    expect(layout.backWalls.length).toBeGreaterThan(0)
    for (const wall of layout.backWalls) {
      const point = { x: wall.x + 24, y: wall.y - 2 }
      expect(forestPointIsClear({ ...layout, obstacles: layout.obstacles.filter(o => o.kind !== 'wall') }, point)).toBe(true)
      expect(forestPointIsClear(layout, point)).toBe(false)
      const window = layout.decor.find(item => item.id === 'boundary:' + wall.roomId)!
      expect(window.anchor.y).toBe(wall.y)
      expect(window.layers.every(layer => layer.depth > wall.depth)).toBe(true)
      expect(window.anchor.x).toBeGreaterThanOrEqual(wall.x)
      expect(window.anchor.x).toBeLessThanOrEqual(wall.x + wall.width)
    }
  })

  it('reads unchanged v1 forest bytes through the shared grid validator', () => {
    const before = JSON.stringify(oldTerrain)
    expect(readCForestTerrain(oldTerrain)).toBe(oldTerrain)
    const adapted = readCEnvironmentTerrain(oldTerrain)
    expect(adapted.version).toBe(2)
    expect(adapted.ground).toEqual(oldTerrain.grass)
    expect(adapted).not.toHaveProperty('grass')
    expect(adapted.road).toEqual(oldTerrain.road)
    expect(JSON.stringify(oldTerrain)).toBe(before)
  })

  it('refuses incomplete tile connections and a tile with a different actual grid declaration', () => {
    const missing = floor()
    delete missing.road.nesw
    expect(() => readCEnvironmentTerrain(missing)).toThrow('sixteen edge connections')
    const wrongSize = floor()
    wrongSize.sprites[wrongSize.ground[0]].width = 31
    expect(() => readCEnvironmentTerrain(wrongSize)).toThrow('different grid size')
    expect(readCEnvironmentTerrain(floor()).ground).toEqual(oldTerrain.grass)
  })

  it('allows declared reuse, but refuses overwritten furniture and an unavailable decoration', () => {
    const empty = { version: 1, sprites: {}, props: {} }
    const pack = readCEnvironmentCatalog('cavern', definition(), empty, floor(), props)
    expect(pack.props.props['worker-desk']).toEqual(props.props['worker-desk'])
    const overwritten = { version: 1, sprites: {}, props: { 'worker-desk': { ...props.props['worker-desk'], defaultScale: 7 } } }
    expect(() => readCEnvironmentCatalog('cavern', definition(), overwritten, floor(), props)).toThrow('conflicts with a shared prop')
    const unavailable = definition()
    unavailable.decorations.boundary = ['cavern-unmade-window']
    expect(() => readCEnvironmentCatalog('cavern', unavailable, empty, floor(), props)).toThrow('unavailable decoration')
  })

  it('rejects cross-scene declarations, unprefixed new props, and non-local image paths', () => {
    const empty = { version: 1, sprites: {}, props: {} }
    expect(() => readCEnvironmentCatalog('cavern', C_WOODLAND_DEFINITION, empty, floor(), props)).toThrow('another scene')
    expect(() => readCEnvironmentCatalog('cavern', definition(), empty, oldTerrain, props)).toThrow('version 2')
    const unprefixed = { ...empty, props: { newRock: structuredClone(props.props.stone) } }
    expect(() => readCEnvironmentCatalog('cavern', definition(), unprefixed, floor(), props)).toThrow('scene prefix')
    const remote = floor()
    remote.sprites[remote.ground[0]].src = 'https://example.invalid/tile.png'
    expect(() => readCEnvironmentTerrain(remote)).toThrow('valid path')
  })
})
