// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** These synthetic rosters test allocation and collision rules, not real office work. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readCForestTableBook, readCForestCatalog, cSurfaceSpriteAt, mergeCForestSprites, C_FOREST_ACTION_MIRRORS_URL, C_FOREST_LOOK_URLS, readCForestOfficeCatalog, readCForestProps, placeCForestProp, readCForestStation, readCForestSharedStation, readCEnvironmentTerrain, readCForestSurfaceCatalog, readCForestOfficeProps, readCForestScale, cForestActionDuration } from '../src/shared/c-forest.ts'
import { C_NEW_ENVIRONMENTS, C_WOODLAND_ADOPTED_DEFINITION, C_WOODLAND_DEFINITION, readCEnvironmentCatalog, cEnvironmentUrls } from '../src/shared/c-environments.ts'
import {
  forestObstacleIndex, forestConfigurationKey, forestMapLayout, forestPointIsClear, forestPolygonContains, forestSurfaceIndex, forestSurfaceMaterialAt,
  readForestMapState, reconcileForestMap, routeForestMessage,
  type ForestMapSettings, type ForestOccupant, type ForestMapState,
} from '../src/shared/forest-map.ts'
import { roadContains } from '../src/shared/road-contour.ts'
import { resolvePixelAppearance } from '../src/shared/pixel-office.ts'

const characters = readCForestOfficeCatalog(JSON.parse(readFileSync('public/office-map/c-forest/sprites.json', 'utf8')), C_FOREST_LOOK_URLS.map(({ url }) => JSON.parse(readFileSync('public' + url, 'utf8'))), JSON.parse(readFileSync('public' + C_FOREST_ACTION_MIRRORS_URL, 'utf8')))
const props = readCForestProps(JSON.parse(readFileSync('public/office-map/c-forest/props.json', 'utf8')), characters.sprites)
const geometry = { bodyRadius: 48, props }
const settings: ForestMapSettings = { seed: 'synthetic-forest-17', grouping: 'shared', scene: 'woodland', workspaceScenes: {}, zh: false, decorations: 'normal' }
const roster = (count: number): ForestOccupant[] => Array.from({ length: count }, (_, i) => ({
  id: `synthetic-${String(i).padStart(3, '0')}`, name: `Synthetic ${i}`, createdAt: `2026-01-${String(1 + i % 28).padStart(2, '0')}`,
  zone: i === 0 ? 'secretary' : 'team', team: 'synthetic-team',
  projects: [{ id: i % 2 ? 'alpha' : 'beta', name: i % 2 ? 'Alpha' : 'Beta' }], cLook: i % 2 ? 'scarf' : 'bare', cScale: .86,
}))
const coordinates = (state: ForestMapState) => Object.fromEntries(Object.entries(state.assignments).filter(([, a]) => a.active)
  .map(([id, a]) => [id, state.regions.find(r => r.id === a.regionId)!.slots[a.slot]]))
const tileKey = (x: number, y: number) => `${x},${y}`

/** The saved road path the first review receipt measured: 21 cells and one isolated elbow at (-576, 864). */
const SAVED_ROAD_PATH: ForestMapState['roads'][number] = [
  { x: -1152, y: 1248 }, { x: -1056, y: 1248 }, { x: -960, y: 1248 }, { x: -864, y: 1248 }, { x: -768, y: 1248 },
  { x: -672, y: 1248 }, { x: -576, y: 1248 }, { x: -576, y: 1152 }, { x: -576, y: 1056 }, { x: -576, y: 960 },
  { x: -576, y: 864 }, { x: -480, y: 864 }, { x: -384, y: 864 }, { x: -384, y: 768 }, { x: -288, y: 768 },
  { x: -288, y: 672 }, { x: -288, y: 576 }, { x: -192, y: 576 }, { x: -192, y: 480 }, { x: -96, y: 480 }, { x: 0, y: 480 },
]

function woodlandPack() {
  const surface = readCForestSurfaceCatalog(JSON.parse(readFileSync('public/office-map/c-environments/shared/ground.json', 'utf8')), 'woodland')
  const terrain = readCEnvironmentTerrain(JSON.parse(readFileSync('public/office-map/c-forest/terrain.json', 'utf8')))
  return readCEnvironmentCatalog('woodland', C_WOODLAND_DEFINITION, props, terrain, props, surface)
}

/** Two saved seats at the two saved ends of the real road, so a real route has to cross the contour. */
function isolatedElbowFixture() {
  // The scratch world was reconciled from this seed with five unassigned people, which builds the
  // real two regions and their ground. Its saved roads are then put back unchanged, so the ground
  // rule keeps the elbow that touches the clearing and replaces only the isolated one.
  const generated = reconcileForestMap(null, Array.from({ length: 5 }, (_, i) => ({
    id: `synthetic-generated-${i}`, name: `Generated ${i}`, zone: 'unassigned' as const, team: null,
    projects: [], createdAt: `2026-01-0${i + 1}`, cLook: 'bare' as const, cScale: .86,
  })), { ...settings, seed: 'mole-office-scene-1' }).state
  const region = generated.regions.find(item => item.id === 'region-1')!
  const state: ForestMapState = {
    ...generated,
    assignments: {
      'synthetic-start': { regionId: 'region-1', slot: 0, groupKey: region.groupKey, workspaceId: null, active: true },
      'synthetic-finish': { regionId: 'secretary', slot: 0, groupKey: 'secretary', workspaceId: null, active: true },
    },
    roads: [[{ x: 0, y: 480 }], SAVED_ROAD_PATH],
  }
  const occupants: ForestOccupant[] = [
    { id: 'synthetic-start', name: 'Synthetic start', zone: 'unassigned', team: null, projects: [], createdAt: '2026-01-01', cLook: 'bare', cScale: .86 },
    { id: 'synthetic-finish', name: 'Synthetic finish', zone: 'secretary', team: null, projects: [], createdAt: '2026-01-01', cLook: 'bare', cScale: .86 },
  ]
  const layout = forestMapLayout({ state, changed: false, assignment: { newAgents: [], movedAgents: [], inactiveAgents: [], addedRegions: [] } }, occupants, settings,
    { ...geometry, environments: { woodland: woodlandPack() } })
  return { layout, occupants }
}

describe('saved forest map allocation', () => {
  it.each(['synthetic-forest-17', 'synthetic-forest-42', 'synthetic-forest-73'])('adds natural areas without moving existing seats or roads (%s)', seed => {
    let state: ForestMapState | null = null
    for (const count of [6, 12, 36, 72]) {
      const before = state, result = reconcileForestMap(state, roster(count), { ...settings, seed })
      state = result.state
      if (before) {
        expect(state.regions.slice(0, before.regions.length)).toEqual(before.regions)
        expect(state.roads.slice(0, before.roads.length)).toEqual(before.roads)
        const after = coordinates(state)
        for (const [id, point] of Object.entries(coordinates(before))) expect(after[id]).toEqual(point)
      }
      expect(state.regions[0]!.origin).toEqual({ x: 0, y: 0 })
      const cells = state.regions.flatMap(r => r.cells.map(p => `${p.x},${p.y}`))
      expect(new Set(cells).size).toBe(cells.length)
      expect(state.regions.some(r => r.profile !== 'hub')).toBe(true)
      for (const road of state.roads) for (const point of road) expect(cells).not.toContain(`${point.x},${point.y}`)
      expect(Object.keys(coordinates(state))).toHaveLength(count)
      expect(reconcileForestMap(state, roster(count).reverse(), { ...settings, seed }).changed).toBe(false)
    }
  }, 20000)

  it('keeps holes on deletion, fills only a free station, and moves only a regrouped person', () => {
    const original = roster(14), first = reconcileForestMap(null, original, settings).state
    const before = coordinates(first), removed = original[5]!
    const smaller = original.filter(m => m.id !== removed.id)
    const deleted = reconcileForestMap(first, smaller, settings).state
    expect(deleted.regions).toEqual(first.regions)
    expect(deleted.assignments[removed.id]!.active).toBe(false)
    for (const mole of smaller) expect(coordinates(deleted)[mole.id]).toEqual(before[mole.id])
    const added = { ...removed, id: 'synthetic-new', name: 'Synthetic newcomer' }
    const filled = reconcileForestMap(deleted, [...smaller, added], settings).state
    expect(filled.regions).toEqual(first.regions)
    expect(coordinates(filled)[added.id]).toEqual(before[removed.id])
    const changed = [...smaller, added].map(m => m.id === original[2]!.id ? { ...m, team: 'synthetic-other-team' } : m)
    const moved = reconcileForestMap(filled, changed, settings)
    expect(moved.assignment.movedAgents).toEqual([original[2]!.id])
    for (const mole of changed.filter(m => m.id !== original[2]!.id)) expect(coordinates(moved.state)[mole.id]).toEqual(coordinates(filled)[mole.id])
  })

  it('does not rearrange saved seats when decoration seed or project membership order changes', () => {
    const input = roster(12), options = { ...settings, grouping: 'workspace' as const }
    const first = reconcileForestMap(null, input, options).state
    const moreProjects = input.map(m => ({ ...m, projects: [{ id: 'aardvark', name: 'Synthetic added project' }, ...m.projects] }))
    const changed = reconcileForestMap(first, moreProjects, { ...options, seed: 'different-decoration-seed' })
    expect(changed.state).toEqual(first)
    expect(changed.changed).toBe(false)
    expect(forestConfigurationKey(options)).toEqual(forestConfigurationKey({ ...options, seed: 'different-decoration-seed' }))
    const a = forestMapLayout(changed, input, options, geometry)
    const b = forestMapLayout(changed, input, { ...options, seed: 'different-decoration-seed' }, geometry)
    expect(b.seats).toEqual(a.seats)
    expect(b.decor.map(t => t.id)).not.toEqual(a.decor.map(t => t.id))
  })

  it('finds routes through the actual furniture footprint map, including a small office', () => {
    for (const count of [6, 12, 36]) {
      const input = roster(count), result = reconcileForestMap(null, input, settings)
      const map = forestMapLayout(result, input, settings, geometry)
      for (const mole of input.slice(1)) {
        const route = routeForestMessage(map, mole.id, input[0]!.id)
        expect(route.reachable, `${count} people, ${mole.id}: ${route.reason}`).toBe(true)
        expect(route.points[0]).toEqual(map.seats[mole.id]!.foot)
        expect(route.points.at(-1)).toEqual(map.seats[input[0]!.id]!.talk)
        for (let i = 1; i < route.points.length; i++) {
          const a = route.points[i - 1]!, b = route.points[i]!
          for (const fraction of [0, .25, .5, .75, 1]) {
            expect(forestPointIsClear(map, { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction }, [map.seats[mole.id]!.stationId, map.seats[input[0]!.id]!.stationId])).toBe(true)
          }
        }
      }
    }
  }, 30000)

  it('adopts complete stools without rewriting the original source or moving saved people and desks', () => {
    const original = JSON.parse(readFileSync('public/office-map/c-forest/props.json', 'utf8')), beforeJson = JSON.stringify(original)
    const complete = readCForestOfficeProps(original, JSON.parse(readFileSync('public/office-map/c-environments/shared/props.json', 'utf8')), characters.sprites)
    expect(JSON.stringify(original)).toBe(beforeJson)
    const input = roster(12), saved = reconcileForestMap(null, input, settings)
    const old = forestMapLayout(saved, input, settings, geometry), current = forestMapLayout(saved, input, settings, { ...geometry, props: complete })
    expect(current.seats).toEqual(old.seats)
    for (const station of Object.values(current.stations)) {
      expect(station.stool.propId).toBe('shared-complete-stool-se')
      expect(station.stool.anchor).toEqual(old.stations[station.id]!.stool.anchor)
      expect(current.furniture[station.furnitureId]!.desk).toEqual(old.furniture[station.furnitureId]!.desk)
      expect(current.obstacles.find(obstacle => obstacle.id === station.id + ':stool')).toMatchObject(station.stool.footprint)
    }
    expect(current.stations['secretary:seat:0']!.stool.footprint.width).not.toBe(old.stations['secretary:seat:0']!.stool.footprint.width)
  })

  it('reads adopted ground and routes over the exact projected road coverage', () => {
    const surface = readCForestSurfaceCatalog(JSON.parse(readFileSync('public/office-map/c-environments/shared/ground.json', 'utf8')))
    expect(Object.keys(surface.sprites)).toHaveLength(9)
    const triangle = [{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 0, y: 32 }]
    expect(forestPolygonContains(triangle, { x: 0, y: 0 })).toBe(true)
    expect(forestPolygonContains(triangle, { x: 31, y: 31 })).toBe(false)
    const terrain = readCEnvironmentTerrain(JSON.parse(readFileSync('public/office-map/c-forest/terrain.json', 'utf8')))
    const woodland = readCEnvironmentCatalog('woodland', C_WOODLAND_DEFINITION, props, terrain, props, surface)
    const input = roster(18), saved = reconcileForestMap(null, input, settings), before = JSON.stringify(saved.state)
    const map = forestMapLayout(saved, input, settings, { ...geometry, environments: { woodland } })
    expect(JSON.stringify(saved.state)).toBe(before)
    const roads = map.surfaces.filter(area => area.role === 'road')
    expect(roads).toHaveLength(1)
    expect(roads[0]!.polygons.some(polygon => polygon.length > 4)).toBe(true)
    expect(map.surfaces.filter(area => area.role === 'work-area')).toHaveLength(map.rooms.length)
    const onClearGround = (point: { x: number; y: number }) => map.groundCells.some(cell => Math.round(point.x / map.cellSize) * map.cellSize === cell.x && Math.round(point.y / map.cellSize) * map.cellSize === cell.y)
    for (const person of input.slice(1)) {
      const route = routeForestMessage(map, person.id, input[0]!.id)
      expect(route.reachable, `${person.id}: ${route.reason}`).toBe(true)
      for (let i = 1; i < route.points.length; i++) for (const fraction of [0, .25, .5, .75, 1]) {
        const a = route.points[i - 1]!, b = route.points[i]!, point = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction }
        expect(onClearGround(point) || roads.some(area => area.polygons.some(polygon => forestPolygonContains(polygon, point)))).toBe(true)
        expect(forestPointIsClear(map, point, [map.seats[person.id]!.stationId, map.seats[input[0]!.id]!.stationId])).toBe(true)
      }
    }
  }, 30000)

  it('indexes the same collision rectangles across cell edges and keeps the own-stool exception', () => {
    const input = roster(18), saved = reconcileForestMap(null, input, settings)
    const map = forestMapLayout(saved, input, settings, geometry), index = forestObstacleIndex(map)
    let comparisons = 0
    for (const obstacle of map.obstacles) {
      const xs = [obstacle.x - map.bodyRadius, obstacle.x, obstacle.x + obstacle.width, obstacle.x + obstacle.width + map.bodyRadius]
      const ys = [obstacle.y, obstacle.y + obstacle.height, obstacle.y + obstacle.height + map.bodyRadius / 3]
      for (const x of xs) for (const y of ys) for (const delta of [-.01, 0, .01]) {
        const point = { x: x + delta, y: y + delta }
        for (const source of [undefined, obstacle.stationId]) {
          expect(forestPointIsClear(map, point, source, index)).toBe(forestPointIsClear(map, point, source))
          comparisons++
        }
      }
    }
    expect(comparisons).toBeGreaterThan(1000)
    const chair = map.obstacles.find(obstacle => obstacle.kind === 'stool')!
    const chairOnly = { ...map, obstacles: [chair] }, foot = map.stations[chair.stationId!]!.foot
    expect(forestPointIsClear(chairOnly, foot, undefined, forestObstacleIndex(chairOnly))).toBe(false)
    expect(forestPointIsClear(chairOnly, foot, chair.stationId, forestObstacleIndex(chairOnly))).toBe(true)
  })

  it('derives explicit SW body and hand mirrors from the same original action without changing its timing', () => {
    const base = JSON.parse(readFileSync('public/office-map/c-forest/sprites.json', 'utf8'))
    const snapshot = JSON.stringify(base), mirrors = JSON.parse(readFileSync('public' + C_FOREST_ACTION_MIRRORS_URL, 'utf8'))
    const fragments = C_FOREST_LOOK_URLS.map(({ url }) => JSON.parse(readFileSync('public' + url, 'utf8')))
    const catalog = readCForestOfficeCatalog(base, fragments, mirrors)
    for (const look of ['bare', 'scarf'] as const) for (const name of ['idle', 'sit', 'work', 'stand']) {
      const source = base.actions[look][name], derived = catalog.actions[look][name + '_sw']!
      expect(cForestActionDuration(derived)).toBe(cForestActionDuration(source))
      expect(derived.frames).toEqual(source.frames.map((frame: { flipX?: boolean }) => ({ ...frame, flipX: !frame.flipX })))
      expect(catalog.actions[look][name]).toEqual(source)
    }
    expect(JSON.stringify(base)).toBe(snapshot)
    const missing = structuredClone(mirrors)
    missing.fromBase[0].source = 'work_sw'
    expect(() => readCForestOfficeCatalog(base, fragments, missing)).toThrow('fromBase action work_sw is missing')
    const crossLook = structuredClone(mirrors)
    crossLook.fromBase[0].sourceLook = 'scarf'
    expect(() => readCForestOfficeCatalog(base, fragments, crossLook)).toThrow('needs its own look')
    const conflict = structuredClone(mirrors)
    conflict.fromBase[0].action = 'idle'
    expect(() => readCForestOfficeCatalog(base, fragments, conflict)).toThrow('conflicts with an existing declaration')
  })

  it('keeps a declared fixed single table still and refuses missing look actions', () => {
    const original = JSON.parse(readFileSync('public/office-map/c-forest/props.json', 'utf8'))
    const shared = JSON.parse(readFileSync('public/office-map/c-environments/shared/props.json', 'utf8'))
    const candidate = structuredClone(original)
    candidate.props['synthetic-fixed-desk'] = { ...structuredClone(candidate.props['worker-desk']), defaultScale: 1 }
    for (const look of ['bare', 'scarf']) candidate.props['synthetic-fixed-desk'].stations[look] = {
      placement: 'fixed-seat', actorFoot: { x: -30, y: 0 }, foregroundAfter: 'front', stoolProp: 'bare-stool',
      actorContact: { x: 20, y: -30 }, propContact: { x: 0, y: -30 }, facing: 'se', actions: { sit: 'sit', work: 'work', stand: 'stand' },
    }
    const catalog = readCForestOfficeProps(candidate, shared, characters.sprites, characters)
    for (const look of ['bare', 'scarf'] as const) for (const scale of [.80, .86, .92]) {
      const placement = readCForestStation(catalog, 'synthetic-fixed-desk', look, { x: 100, y: 200 }, scale)
      expect(placement.desk.anchor).toEqual({ x: 130, y: 200 })
      expect(placement.foot).toEqual({ x: 100, y: 200 })
      expect(placement.stool.anchor).toEqual(placement.foot)
      expect(placement.contact).toBe('measured-fixed-points')
      expect(placement.contactError!.x).toBeCloseTo(20 * scale - 30)
      expect(placement.contactError!.y).toBeCloseTo(30 - 30 * scale)
      expect(placement.facing).toBe('se')
    }
    candidate.props['synthetic-fixed-desk'].stations.bare.actions.work = 'synthetic-unmade-work'
    expect(() => readCForestOfficeProps(candidate, shared, characters.sprites, characters)).toThrow('requires missing bare action synthetic-unmade-work')
    candidate.props['synthetic-fixed-desk'].stations.scarf.actorFoot.x = 90
    expect(() => readCForestOfficeProps(candidate, shared, characters.sprites, characters)).toThrow('changes its fixed seat when the look changes')
  })

  it('merges complete look fragments before validation and refuses conflicting saved looks or actions', () => {
    const snapshot = JSON.stringify(characters)
    const ids = Object.keys(characters.looks) as (keyof typeof characters.looks)[]
    const first = ids[0]!, remainder = ids.slice(1)
    const base = { version: 1, sprites: characters.sprites, looks: { [first]: characters.looks[first] }, actions: { [first]: characters.actions[first] } }
    const fragments = remainder.map(id => ({ version: 1, sprites: {}, looks: { [id]: characters.looks[id] }, actions: { [id]: characters.actions[id] } }))
    expect(() => readCForestOfficeCatalog(base)).toThrow('same looks')
    const merged = readCForestOfficeCatalog(base, fragments)
    expect(merged.looks).toEqual(characters.looks)
    expect(merged.actions).toEqual(characters.actions)
    expect(JSON.stringify(characters)).toBe(snapshot)
    const identical = { version: 1, sprites: {}, looks: { [first]: characters.looks[first] }, actions: { [first]: characters.actions[first] } }
    expect(() => readCForestOfficeCatalog(merged, [identical])).not.toThrow()
    const changed = structuredClone(identical)
    changed.looks[first]!.label.en += ' changed'
    expect(() => readCForestOfficeCatalog(merged, [changed])).toThrow('conflicting declarations')
    const actionChange = structuredClone(identical)
    actionChange.actions[first]!.idle!.frames[0]!.durationMs = 999
    expect(() => readCForestOfficeCatalog(merged, [actionChange])).toThrow('conflicting declarations')
    const extraAction = { version: 1, sprites: {}, looks: {}, actions: { 'synthetic-unregistered-look': characters.actions[first] } }
    expect(() => readCForestOfficeCatalog(merged, [extraAction])).toThrow('action catalog and look catalog')
  })

  it('loads all five actual ground packs without changing saved geometry or borrowing another scene', () => {
    const raw = JSON.parse(readFileSync('public/office-map/c-environments/shared/ground.json', 'utf8'))
    const before = JSON.stringify(raw), woodlandSurface = readCForestSurfaceCatalog(raw, 'woodland')
    expect(woodlandSurface).toMatchObject({ version: 2, scene: 'woodland', materials: { ground: raw.materials.grass, road: raw.materials.earth, plainWork: raw.materials.earth, sharedWork: raw.materials.wood } })
    expect(JSON.stringify(raw)).toBe(before)
    expect(() => readCForestSurfaceCatalog(raw, 'cavern')).toThrow('does not belong')
    const input = roster(18), saved = reconcileForestMap(null, input, settings)
    const officeProps = readCForestOfficeProps(JSON.parse(readFileSync('public/office-map/c-forest/props.json', 'utf8')), JSON.parse(readFileSync('public/office-map/c-environments/shared/props.json', 'utf8')), characters.sprites, characters)
    const woodland = readCEnvironmentCatalog('woodland', C_WOODLAND_ADOPTED_DEFINITION, officeProps, JSON.parse(readFileSync('public/office-map/c-forest/terrain.json', 'utf8')), officeProps, woodlandSurface)
    const baseline = forestMapLayout(saved, input, settings, { ...geometry, props: officeProps, environments: { woodland } })
    for (const scene of C_NEW_ENVIRONMENTS) {
      const urls = cEnvironmentUrls(scene), read = (url: string) => JSON.parse(readFileSync('public' + url, 'utf8'))
      const surface = readCForestSurfaceCatalog(read(urls.surface), scene)
      const pack = readCEnvironmentCatalog(scene, read(urls.definition), read(urls.props), null, officeProps, surface)
      expect(pack.terrain).toBeNull()
      expect(() => readCEnvironmentCatalog(scene, read(urls.definition), read(urls.props), null, officeProps, woodlandSurface)).toThrow('another scene')
      const map = forestMapLayout(saved, input, { ...settings, scene }, { ...geometry, props: officeProps, environments: { [scene]: pack } })
      expect(map.rooms.every(room => room.environment === 'ready')).toBe(true)
      expect(map.surfaces).toEqual(baseline.surfaces)
      expect(map.surfaces.every(area => ['road', 'plainWork', 'sharedWork'].includes(area.material))).toBe(true)
      expect(map.seats).toEqual(baseline.seats)
      expect(Object.values(map.furniture).some(item => item.desk.propId === 'shared-three-seat-desk')).toBe(true)
      expect(Object.values(map.furniture).every(item => ['shared-three-seat-desk', 'shared-single-desk', 'shared-octagonal-desk', 'secretary-desk'].includes(item.desk.propId))).toBe(true)
      expect(surface.materials.plainWork).toEqual(surface.materials.ground)
      for (let y = -4; y < 4; y++) for (let x = -4; x < 4; x++) {
        expect(cSurfaceSpriteAt(surface, 'plainWork', 'synthetic-surface', x, y)).toBe(cSurfaceSpriteAt(surface, 'ground', 'synthetic-surface', x, y))
        if (scene === 'night-library') expect(cSurfaceSpriteAt(surface, 'sharedWork', 'synthetic-surface', x, y)).toBe(cSurfaceSpriteAt(surface, 'ground', 'synthetic-surface', x, y))
      }
      expect(() => mergeCForestSprites(woodlandSurface.sprites, surface.sprites)).not.toThrow()
      const changed = structuredClone(woodlandSurface.sprites), id = Object.keys(changed)[0]!
      changed[id]!.anchor.x++
      expect(() => mergeCForestSprites(woodlandSurface.sprites, changed)).toThrow('conflicting declarations')
    }
  })

  it('binds every adopted look to its own measured contact without moving the table, stool or saved foot', () => {
    const officeProps = readCForestOfficeProps(JSON.parse(readFileSync('public/office-map/c-forest/props.json', 'utf8')), JSON.parse(readFileSync('public/office-map/c-environments/shared/props.json', 'utf8')), characters.sprites, characters)
    const points = { bare: [22.5, -25], scarf: [32, -21], 'sand-apron': [28, -30], 'cocoa-vest': [16.5, -41], 'silver-glasses': [20, -42] } as const
    const singleFoot = { x: 364, y: 244 }, octagonalFoot = { x: 766, y: 160 }
    const long = placeCForestProp(officeProps, 'shared-three-seat-desk', { x: 550, y: 240 })
    for (const look of Object.keys(points) as (keyof typeof points)[]) for (const scale of [.80, .86, .92]) {
      const single = readCForestStation(officeProps, 'shared-single-desk', look, singleFoot, scale)
      const octagonal = readCForestStation(officeProps, 'shared-octagonal-desk', look, octagonalFoot, scale)
      for (const [station, foot, anchor, propPoint] of [
        [single, singleFoot, { x: 250, y: 270 }, { x: 340, y: 218 }],
        [octagonal, octagonalFoot, { x: 623.7, y: 186 }, { x: 743.36, y: 131.44 }],
      ] as const) {
        expect(station.foot).toEqual(foot)
        expect(station.desk.anchor).toEqual(anchor)
        expect(station.stool).toMatchObject({ propId: 'shared-complete-stool-sw', anchor: foot, scale })
        expect(station.facing).toBe('sw')
        expect(station.contactError!.x).toBeCloseTo(foot.x - points[look][0] * scale - propPoint.x)
        expect(station.contactError!.y).toBeCloseTo(foot.y + points[look][1] * scale - propPoint.y)
      }
      for (const [seat, x] of [['left', 262], ['middle', 550], ['right', 838]] as const) {
        const foot = { x, y: 156 }, station = readCForestSharedStation(officeProps, long, seat, look, foot, scale)
        expect(station.stool).toMatchObject({ propId: 'shared-complete-stool-se', anchor: foot, scale })
        expect(station).toMatchObject({ foot, facing: 'se', bodyDepth: 156 })
        expect(station.actorContact).toEqual({ x: x + points[look][0] * scale, y: 156 + points[look][1] * scale })
        expect(station.contactError).not.toEqual({ x: 0, y: 0 })
        if (look === 'silver-glasses' || look === 'sand-apron') expect(readCForestTableBook(characters.looks[look], station, scale)).toMatchObject({ foot: { x: x + 32, y: 132 }, scale, flipX: false })
        else expect(station.bookPoint).toBeNull()
      }
      if (look === 'silver-glasses' || look === 'sand-apron') {
        expect(readCForestTableBook(characters.looks[look], single, scale)).toMatchObject({ foot: { x: 332, y: 214 }, scale, flipX: true })
        expect(readCForestTableBook(characters.looks[look], octagonal, scale)).toMatchObject({ foot: { x: 730, y: 130 }, scale, flipX: true })
      } else {
        expect(single.bookPoint).toBeNull()
        expect(octagonal.bookPoint).toBeNull()
      }
    }
    // The old desk has no new-look binding. It must remain explicitly unavailable.
    expect(() => readCForestStation(officeProps, 'worker-desk', 'silver-glasses', singleFoot, .86)).toThrow('has no station')
  })

  it('resolves strict v2 and strict v3 sand-apron to the same saved table book as the separate silver-glasses baseline', () => {
    const officeProps = readCForestOfficeProps(JSON.parse(readFileSync('public/office-map/c-forest/props.json', 'utf8')), JSON.parse(readFileSync('public/office-map/c-environments/shared/props.json', 'utf8')), characters.sprites, characters)
    // The preserved real seat: cedar-c-slice at region-12:seat:0, foot (1632,1440), saved pixel_scale 0.8476847333057914.
    const foot = { x: 1632, y: 1440 }, anchor = { x: 1920, y: 1524 }
    const actorScale = readCForestScale({ version: 1, roleAtGeneration: 'supervisor', value: 0.8476847333057914 }).value!
    const table = placeCForestProp(officeProps, 'shared-three-seat-desk', anchor)
    const resolved = {
      'v2-sand-apron': resolvePixelAppearance('cedar-c-slice', { version: 2, style: 'c-forest', lookId: 'sand-apron' }),
      'v3-sand-apron': resolvePixelAppearance('cedar-c-slice', { version: 3, style: 'c-forest', lookId: 'sand-apron', fur: 'grey-brown', cloth: 'blue-grey', body: { x: 1, y: 1 }, accessory: 'gold-halo' }),
      'v2-silver-glasses': resolvePixelAppearance('cedar-c-slice', { version: 2, style: 'c-forest', lookId: 'silver-glasses' }),
    }
    const stations = Object.fromEntries(Object.entries(resolved).map(([name, value]) => [name, readCForestSharedStation(officeProps, table, 'left', value.cLook!, foot, actorScale)]))
    // The same look under strict v2 and strict v3 resolves to one cLook and one whole saved station.
    expect(resolved['v2-sand-apron']!.cLook).toBe('sand-apron')
    expect(resolved['v3-sand-apron']!.cLook).toBe('sand-apron')
    expect(stations['v3-sand-apron']).toEqual(stations['v2-sand-apron'])
    expect(stations['v2-sand-apron']!.bookPoint).toEqual({ x: 1664, y: 1416 })
    for (const name of ['v2-sand-apron', 'v3-sand-apron']) {
      expect(readCForestTableBook(characters.looks['sand-apron'], stations[name]!, actorScale)).toMatchObject({ sprite: 'silver-glasses-closed-book', foot: { x: 1664, y: 1416 } })
    }
    // The fixed seat, desk, stool, foot and measured table contact do not move with the look or the version.
    for (const name of Object.keys(stations)) {
      expect(stations[name]!.foot).toEqual(foot)
      expect(stations[name]!.stool).toMatchObject({ propId: 'shared-complete-stool-se', anchor: foot })
      expect(stations[name]!.propContact).toEqual({ x: 1656, y: 1420 })
      expect(table.anchor).toEqual(anchor)
    }
    // The baseline keeps the same physical table point; only its look-derived contact may differ.
    expect(stations['v2-silver-glasses']!.bookPoint).toEqual(stations['v2-sand-apron']!.bookPoint)
    expect(stations['v2-silver-glasses']!.actorContact).not.toEqual(stations['v2-sand-apron']!.actorContact)
  })

  it('gives sand-apron its own independent table book and real frames, and still fails loudly without a point', () => {
    const look = characters.looks['sand-apron']
    expect(look.tableBook).toEqual({ sprite: 'silver-glasses-closed-book' })
    // Independent: the adopted closed-book image is never a body or hand frame of this look.
    const actionSprites = new Set(Object.values(characters.actions['sand-apron']).flatMap(action => action.frames.flatMap(frame => [frame.sprite, frame.foregroundSprite].filter((id): id is string => typeof id === 'string'))))
    expect(actionSprites.has(look.tableBook!.sprite)).toBe(false)
    // Pickup and return use the real sand-apron frames, with the book on the table only before pickup and after return.
    for (const name of ['pick_book', 'pick_book_sw', 'put_book', 'put_book_sw']) {
      const frames = characters.actions['sand-apron'][name]!.frames
      expect(frames.every(frame => frame.sprite.startsWith('sand-apron-'))).toBe(true)
      expect(frames.map(frame => frame.tableBookVisible)).toEqual(name.startsWith('pick_book') ? [true, false, false, false] : [false, false, false, true, true])
    }
    // One missing measured point on a shared sand-apron seat refuses the whole catalog loudly.
    const baseProps = JSON.parse(readFileSync('public/office-map/c-forest/props.json', 'utf8'))
    const sharedProps = JSON.parse(readFileSync('public/office-map/c-environments/shared/props.json', 'utf8'))
    delete sharedProps.props['shared-three-seat-desk'].seats['left'].contacts['sand-apron'].bookPoint
    expect(() => readCForestOfficeProps(baseProps, sharedProps, characters.sprites, characters)).toThrow('no measured sand-apron table-book point')
    // A pick frame that does not say whether the book is still on the table is refused too.
    const missingFlag = structuredClone(characters)
    delete missingFlag.actions['sand-apron'].pick_book!.frames[0]!.tableBookVisible
    expect(() => readCForestCatalog(missingFlag)).toThrow('does not say whether')
  })

  it('uses each project environment furniture without changing saved seats, and names a missing pack', () => {
    // Synthetic pack: adopted woodland art is reused only to test selection, not presented as cavern art.
    const terrain = readCEnvironmentTerrain(JSON.parse(readFileSync('public/office-map/c-forest/terrain.json', 'utf8')))
    const cavern = readCEnvironmentCatalog('cavern', { ...C_WOODLAND_DEFINITION, scene: 'cavern',
      stations: { worker: 'cavern-synthetic-desk', secretary: 'secretary-desk' }, furniture: { single: ['cavern-synthetic-desk', 'cavern-second-desk'], shared: [] }, decorations: { ground: [], backdrop: [], boundary: [] } },
    { version: 1, sprites: {}, props: { 'cavern-synthetic-desk': props.props['worker-desk'], 'cavern-second-desk': props.props['worker-desk'] } }, terrain, props)
    const woodland = readCEnvironmentCatalog('woodland', C_WOODLAND_DEFINITION, props, terrain, props)
    const input = roster(12), options = { ...settings, grouping: 'workspace' as const, workspaceScenes: { alpha: 'cavern' as const, beta: 'high-rise' as const } }
    const saved = reconcileForestMap(null, input, options)
    const old = forestMapLayout(saved, input, settings, geometry)
    const map = forestMapLayout(saved, input, options, { ...geometry, environments: { woodland, cavern }, environmentErrors: { 'high-rise': 'Synthetic test pack is deliberately absent.' } })
    expect(map.seats).toEqual(old.seats)
    const cavernRooms = map.rooms.filter(room => room.workspaceId === 'alpha')
    expect(cavernRooms.length).toBeGreaterThan(0)
    for (const room of cavernRooms) {
      expect(room.environment).toBe('ready')
      expect(new Set(Object.values(map.furniture).filter(item => item.roomId === room.id).map(item => item.desk.propId))).toEqual(new Set(['cavern-synthetic-desk', 'cavern-second-desk']))
    }
    const chosenFurniture = (layout: ReturnType<typeof forestMapLayout>) => Object.fromEntries(Object.values(layout.furniture).map(item => [item.id, item.desk.propId]))
    for (const seed of ['different-1', 'different-2', 'different-3']) {
      const rearranged = forestMapLayout(saved, input, { ...options, seed }, { ...geometry, environments: { woodland, cavern } })
      expect(chosenFurniture(rearranged)).toEqual(chosenFurniture(map))
    }
    expect(() => readCEnvironmentCatalog('cavern', { ...cavern.definition, stations: C_WOODLAND_DEFINITION.stations, furniture: { single: ['missing'], shared: [] } }, { version: 1, sprites: {}, props: {} }, terrain, props)).toThrow('single-seat')
    expect(() => readCEnvironmentCatalog('cavern', { ...cavern.definition, stations: C_WOODLAND_DEFINITION.stations, furniture: { single: [], shared: ['worker-desk'] } }, { version: 1, sprites: {}, props: {} }, terrain, props)).toThrow('shared')
    for (const room of map.rooms.filter(room => room.workspaceId === 'beta')) {
      expect(room.scene).toBe('high-rise')
      expect(room.environment).toBe('unavailable')
      expect(room.environmentError).toBe('Synthetic test pack is deliberately absent.')
    }
  })

  it('places shared furniture once without moving saved feet or stools when people have different sizes', () => {
    const table = structuredClone(props.props['worker-desk']!)
    const baseStation = table.stations!
    table.seats = Object.fromEntries([-288, 0, 288].map((x, i) => [String(i), {
      actorFoot: { x, y: 0 }, facing: 'se' as const, actions: { sit: 'sit', work: 'work', stand: 'stand' },
      foregroundLayer: 0,
      contacts: Object.fromEntries(['bare', 'scarf'].map(look => [look, {
        actor: { x: 20, y: -24 }, prop: { x: x + 20, y: -24 }, stoolProp: baseStation[look as 'bare' | 'scarf']!.stoolProp,
      }])),
    }]))
    const sharedProps = readCForestProps({ ...props, props: { ...props.props, 'synthetic-shared-table': table } }, {})
    const input = roster(12).map((person, index) => ({ ...person, cScale: index % 2 ? .8 : .92 }))
    const saved = reconcileForestMap(null, input, settings)
    const before = forestMapLayout(saved, input, settings, geometry)
    const after = forestMapLayout(saved, input, settings, { ...geometry, props: sharedProps, sharedFurniture: ['synthetic-shared-table'] })
    expect(after.seats).toEqual(before.seats)
    const tables = Object.values(after.furniture).filter(item => item.form === 'shared')
    expect(tables.length).toBeGreaterThan(0)
    for (const item of tables) {
      expect(item.stationIds).toHaveLength(3)
      expect(after.obstacles.filter(obstacle => obstacle.id === item.id + ':desk')).toHaveLength(1)
      for (const stationId of item.stationIds) {
        const station = after.stations[stationId]!
        expect(station.furnitureId).toBe(item.id)
        expect(station.stool.anchor).toEqual(before.stations[stationId]!.stool.anchor)
        expect(station.foot).toEqual(before.stations[stationId]!.foot)
        expect(station.bodyDepth).toBe(station.foot.y)
        expect(station.contactError).not.toEqual({ x: 0, y: 0 })
      }
    }
    const placed = tables[0]!.desk, first = after.stations[tables[0]!.stationIds[0]!]!
    expect(() => readCForestSharedStation(sharedProps, placed, first.seatKey!, 'bare', { x: first.foot.x + 1, y: first.foot.y }, .86)).toThrow('saved foot point')
    expect(placeCForestProp(sharedProps, placed.propId, placed.anchor)).toEqual(placed)
    expect(after.furnitureDiagnostics.some(item => item.matchedSlots.length > 0)).toBe(true)
    const impossible = structuredClone(table)
    impossible.seats!['1']!.actorFoot.x = 17
    const notFitting = forestMapLayout(saved, input, settings, { ...geometry, props: { ...sharedProps, props: { ...sharedProps.props, 'synthetic-shared-table': impossible } }, sharedFurniture: ['synthetic-shared-table'] })
    expect(notFitting.seats).toEqual(before.seats)
    expect(notFitting.furnitureDiagnostics.every(item => item.matchedSlots.length === 0 && item.unmatchedSlots.length === 6 && item.reason.includes('fixed seat pattern'))).toBe(true)
    const obsolete = structuredClone(table)
    Object.assign(obsolete.seats!['0']!, { bodyDepthOffset: 0 })
    expect(() => readCForestProps({ ...props, props: { ...props.props, 'synthetic-shared-table': obsolete } }, {})).toThrow('bodyDepthOffset')
  })

  it('reports an unreachable route instead of replacing it with a straight line', () => {
    const input = roster(6), map = forestMapLayout(reconcileForestMap(null, input, settings), input, settings, geometry)
    const from = map.seats[input[1]!.id]!.foot
    map.obstacles.push({ id: 'synthetic-wall', kind: 'tree', x: from.x - 150, y: from.y - 150, width: 300, height: 300 })
    expect(routeForestMessage(map, input[1]!.id, input[0]!.id)).toEqual({ points: [], reachable: false, reason: 'No path avoids the recorded furniture and tree trunks.' })
  })

  it('refuses duplicate identities and corrupt saved station references', () => {
    expect(() => reconcileForestMap(null, [roster(1)[0]!, roster(1)[0]!], settings)).toThrow('same identity twice')
    const state = reconcileForestMap(null, roster(6), settings).state
    state.assignments['synthetic-001']!.slot = 999
    expect(() => readForestMapState(state)).toThrow('does not exist')
  })

  it('rejects an invalid saved road in the production projection instead of publishing a partial surface', () => {
    const woodland = woodlandPack()
    const input = roster(6), saved = reconcileForestMap(null, input, settings)
    const control = forestMapLayout(saved, input, settings, { ...geometry, environments: { woodland } })
    expect(control.surfaces.filter(area => area.role === 'road')).toHaveLength(1)
    expect(control.roadContour?.faults).toEqual([])
    const broken: ForestMapState = { ...saved.state, roads: [[{ x: 0, y: 0 }, { x: 96, y: 0 }, { x: 0, y: 0 }]] }
    expect(() => forestMapLayout({ ...saved, state: broken }, input, settings, { ...geometry, environments: { woodland } }))
      .toThrow(/road contour is invalid[\s\S]*reverses/)
  })

  it('cuts the real 32-pixel road grid into full and edge tiles through the shared reader', () => {
    const { layout } = isolatedElbowFixture()
    const index = forestSurfaceIndex(layout.surfaces)
    const coverage = (x: number, y: number) => {
      const entries = index.get(tileKey(x, y)) ?? []
      let covered = 0
      for (let py = 0; py < 32; py++) for (let px = 0; px < 32; px++) {
        if (forestSurfaceMaterialAt(layout, entries, { x: x - 16 + px, y: y - 16 + py }) === 'road') covered++
      }
      return covered
    }
    // A tile wholly inside the straight saved road is full: every one of its 1024 pixel centres.
    expect(coverage(-864, 1248)).toBe(32 * 32)
    let full = 0, edge = 0
    for (let y = 800; y <= 1344; y += 32) for (let x = -1216; x <= 128; x += 32) {
      const covered = coverage(x, y)
      if (covered === 32 * 32) full++
      else if (covered > 0) edge++
    }
    expect(full).toBeGreaterThan(0)
    // The 45-degree chord and the arcs cut through tiles, so at least one tile is neither full nor empty.
    expect(edge).toBeGreaterThan(0)
  })

  it('omits exactly the isolated saved elbow and still routes across the 45-degree chord', () => {
    const { layout } = isolatedElbowFixture()
    const index = forestSurfaceIndex(layout.surfaces)
    const omitted = layout.roadCells.filter(cell => forestSurfaceMaterialAt(layout, index.get(tileKey(cell.x, cell.y)) ?? [], cell) === null)
    expect(layout.roadCells).toHaveLength(21)
    expect(omitted).toEqual([{ x: -576, y: 864 }])
    // The saved path itself is unchanged: the long saved path still stores all 21 of its cells.
    const saved = layout.roads.find(path => path.length > 1)!
    expect(saved.map(point => tileKey(point.x, point.y))).toEqual(SAVED_ROAD_PATH.map(point => tileKey(point.x, point.y)))
    const route = routeForestMessage(layout, 'synthetic-start', 'synthetic-finish')
    expect(route.reachable, route.reason ?? '').toBe(true)
    // The route crosses the 45-degree chord that replaced the removed elbow.
    expect(route.points.some(point => point.x > -576 && point.x < -480 && point.y > 864 && point.y < 960)).toBe(true)
    expect(route.points.some(point => roadContains(layout.roadContour!, point))).toBe(true)
  })
})
