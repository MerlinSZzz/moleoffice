// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
import { createI18n, type WordKey } from './i18n.ts'
import { C_WOODLAND_DEFINITION, type CEnvironmentCatalog } from './c-environments.ts'
import type { MapPoint, MapRoom } from './office-map.ts'
import type { PixelScene, PixelZone } from './pixel-office.ts'
import type { CForestLookId } from './pixel-office.ts'
import { C_FOREST_SCALE_RANGE, placeCForestProp, readCForestStation, readCForestSharedStation, type CForestPlacedProp, type CForestPropsCatalog } from './c-forest.ts'
import { roadContour, roadContains, type RoadContour } from './road-contour.ts'

export const FOREST_TILE = 32
export const FOREST_CELL = 96
export const FOREST_ENVIRONMENT_ERROR = 'environment-unavailable'
const ZONE_WORDS = {
  visitor: 'g6c.pixel.office.zone.visitor', team: 'g6c.pixel.office.zone.team',
  leadership: 'g6c.pixel.office.zone.leadership', secretary: 'g6c.pixel.office.zone.secretary',
  inspector: 'g6c.pixel.office.zone.inspector', unassigned: 'g6c.pixel.office.zone.unassigned',
} satisfies Record<PixelZone, WordKey>
const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
const zoneSchema = z.enum(['visitor', 'team', 'leadership', 'secretary', 'inspector', 'unassigned'])
const regionSchema = z.object({
  id: z.string().min(1), groupKey: z.string().min(1), zone: zoneSchema,
  workspaceId: z.string().nullable(), teamId: z.string().nullable(),
  origin: pointSchema, profile: z.enum(['hub', 'grove', 'court', 'branch']),
  cells: z.array(pointSchema).min(1), slots: z.array(pointSchema).min(1), door: pointSchema,
}).strict()
const assignmentSchema = z.object({
  regionId: z.string().min(1), slot: z.number().int().nonnegative(),
  groupKey: z.string().min(1), workspaceId: z.string().nullable(), active: z.boolean(),
}).strict()
export const forestMapStateSchema = z.object({
  version: z.literal(1), seed: z.string().min(1), grouping: z.enum(['shared', 'workspace']),
  regions: z.array(regionSchema).min(1), assignments: z.record(z.string().min(1), assignmentSchema),
  roads: z.array(z.array(pointSchema).min(1)),
}).strict()
export type ForestMapState = z.infer<typeof forestMapStateSchema>
export type ForestRegion = ForestMapState['regions'][number]
export interface ForestOccupant {
  id: string; name: string; zone: PixelZone; team: string | null; retired?: boolean
  projects: readonly { id: string; name: string }[]; createdAt?: string
  cLook?: CForestLookId | null; cScale?: number | null
}
export interface ForestMapSettings {
  seed: string; grouping: 'shared' | 'workspace'; scene: PixelScene
  workspaceScenes: Record<string, PixelScene>; zh: boolean; decorations: 'sparse' | 'normal' | 'lush'
}
export interface ForestRect { x: number; y: number; width: number; height: number }
export interface ForestGeometry {
  bodyRadius: number; props: CForestPropsCatalog
  sharedFurniture?: readonly string[]
  environments?: Partial<Record<PixelScene, CEnvironmentCatalog>>
  environmentErrors?: Partial<Record<PixelScene, string>>
}
export interface ForestStation {
  id: string; roomId: string; furnitureId: string; seatKey: string | null; foot: MapPoint; stool: CForestPlacedProp; talk: MapPoint
  bodyDepth: number; foregroundDepth: number; facing: 'se' | 'sw' | 'ne' | 'nw'
  actions: { sit: string; work: string; stand: string; pick_book?: string; put_book?: string }
  contactError: MapPoint | null
  bookPoint: MapPoint | null
  contact: 'matched-points' | 'declared-default-offset' | 'measured-fixed-points' | 'measured-shared-points' | 'unmeasured-shared-look'
  geometryFor: 'current-c-look' | 'reserved-furniture'
}
export interface ForestFurniture {
  id: string; roomId: string; desk: CForestPlacedProp; stationIds: string[]; form: 'single' | 'shared'
}
export interface ForestSurface {
  id: string; role: 'road' | 'work-area'; material: 'road' | 'plainWork' | 'sharedWork'; roomId: string | null; polygons: MapPoint[][]
}
/** Accept the older live API's woodland material names during a client/server reload. */
export function forestSurfaceMaterial(surface: { role: ForestSurface['role']; material: ForestSurface['material'] | 'earth' | 'wood' }): ForestSurface['material'] {
  if (surface.material === 'earth') return surface.role === 'road' ? 'road' : 'plainWork'
  if (surface.material === 'wood') return 'sharedWork'
  return surface.material
}
export interface ForestFurnitureDiagnostic {
  roomId: string; propId: string; matchedSlots: number[]; unmatchedSlots: number[]; reason: string
}
export interface ForestSeat { roomId: string; stationId: string; foot: MapPoint; talk: MapPoint }
export interface ForestObstacle extends ForestRect {
  id: string; stationId?: string; kind: 'desk' | 'stool' | 'tree' | 'prop' | 'wall'
}
export interface ForestDecor extends CForestPlacedProp { id: string; kind: 'tree' | 'prop'; roomId: string | null; scene: PixelScene }
export interface ForestRoom extends MapRoom { profile: ForestRegion['profile']; cells: MapPoint[]; environment: 'ready' | 'unavailable'; environmentError: string | null }
export interface ForestBackWall {
  id: string; roomId: string; scene: Exclude<PixelScene, 'woodland'>
  x: number; y: number; width: number; height: number; depth: number; footprint: ForestRect
}
/** Vertical cutaway walls use the same base line for paint, windows, and collision. */
export const FOREST_BACK_WALL_HEIGHT = 224
export function forestBackWalls(room: ForestRoom): ForestBackWall[] {
  if (room.scene === 'woodland' || room.environment !== 'ready') return []
  const north = Math.min(...room.cells.map(cell => cell.y))
  const row = room.cells.filter(cell => cell.y === north).map(cell => cell.x).sort((a, b) => a - b)
  const runs: { left: number; right: number }[] = []
  for (const x of row) {
    const last = runs.at(-1)
    if (last && x - FOREST_CELL / 2 === last.right) last.right = x + FOREST_CELL / 2
    else runs.push({ left: x - FOREST_CELL / 2, right: x + FOREST_CELL / 2 })
  }
  const y = north - FOREST_CELL / 2
  return runs.map(({ left, right }, index) => ({ id: `wall:${room.id}:${index}`, roomId: room.id, scene: room.scene as Exclude<PixelScene, 'woodland'>,
    x: left, y, width: right - left, height: FOREST_BACK_WALL_HEIGHT, depth: y - 8,
    footprint: { x: left, y: y - 8, width: right - left, height: 8 } }))
}
export interface ForestMapLayout {
  version: 1; scene: PixelScene; tileSize: number; cellSize: number; bodyRadius: number
  rooms: ForestRoom[]; seats: Record<string, ForestSeat>; stations: Record<string, ForestStation>; furniture: Record<string, ForestFurniture>
  roads: MapPoint[][]; roadCells: MapPoint[]; groundCells: MapPoint[]
  surfaces: ForestSurface[]
  /** The one road shape the raster and the route both read. Null when this scene has no road surface. */
  roadContour: RoadContour | null
  obstacles: ForestObstacle[]; decor: ForestDecor[]; backWalls: ForestBackWall[]; furnitureDiagnostics: ForestFurnitureDiagnostic[]
  bounds: ForestRect; width: number; height: number; center: MapPoint
  assignment: { newAgents: string[]; movedAgents: string[]; inactiveAgents: string[]; addedRegions: string[] }
}
export interface ForestReconciliation { state: ForestMapState; changed: boolean; assignment: ForestMapLayout['assignment'] }
export interface ForestRoute { points: MapPoint[]; reachable: boolean; reason: string | null }

const key = (p: MapPoint) => `${p.x},${p.y}`
const FOUR = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }] as const
const EIGHT = [...FOUR, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }]
function seedNumber(value: string): number {
  let result = 2166136261
  for (const ch of value) result = Math.imul(result ^ ch.codePointAt(0)!, 16777619)
  return result >>> 0
}
export function forestNoise(seed: number, x: number, y = 0): number {
  let value = (seed ^ Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263)) >>> 0
  value = Math.imul(value ^ value >>> 13, 1274126177)
  return ((value ^ value >>> 16) >>> 0) / 4294967296
}

/** Rowan's three clearing profiles, enlarged to leave real sprite-sized aisles. */
function formRegion(origin: MapPoint, seed: number, central: boolean): Pick<ForestRegion, 'profile' | 'cells' | 'slots' | 'door'> {
  const profile = central ? 'hub' : (['grove', 'court', 'branch'] as const)[Math.floor(forestNoise(seed, 41) * 3)]!
  const cells: MapPoint[] = []
  for (let y = -5; y <= 5; y++) for (let x = -6; x <= 6; x++) {
    const include = profile === 'hub' ? x * x / 48 + y * y / 24 <= 1
      : profile === 'grove' ? x * x / 48 + y * y / 24 <= 1 || (x + 4) ** 2 + (y + 1) ** 2 <= 6
      : profile === 'court' ? Math.abs(x) <= 5 && Math.abs(y) <= 4 && !(Math.abs(x) <= 1 && Math.abs(y) <= 1) && !(Math.abs(x) === 5 && Math.abs(y) === 4)
      : Math.abs(x) <= 5 && Math.abs(y) <= 4 && !(x > 1 && y < -1) && !(x === -5 && y === -4)
    if (include) cells.push({ x: origin.x + x * FOREST_CELL, y: origin.y + y * FOREST_CELL })
  }
  const offsets = profile === 'court' ? [-2, 0, 2].flatMap(y => [{ x: -3, y }, { x: 3, y }])
    : profile === 'branch' ? [{ x: -3, y: -2 }, { x: -3, y: 0 }, { x: -3, y: 2 }, { x: 0, y: 2 }, { x: 3, y: 2 }, { x: 0, y: 0 }]
    : [-1, 2].flatMap(y => [-3, 0, 3].map(x => ({ x, y })))
  const slots = offsets.map(p => ({ x: origin.x + p.x * FOREST_CELL, y: origin.y + p.y * FOREST_CELL }))
  return { profile, cells, slots, door: { x: origin.x, y: Math.max(...cells.map(p => p.y)) + FOREST_CELL } }
}

/**
 * A bounded priority queue search. No route is replaced by a straight line on failure.
 *
 * TWO FAILURES, NOT ONE (wave 13k round 43, from problem zFK7SO7Io1jz): null is "every reachable
 * point was tried and none is the target"; 'ran out' is "the budget of turns ended first", which
 * says nothing about whether a path exists. They were both null, so a long route in a large office
 * was reported as blocked by furniture.
 */
function search(start: MapPoint, target: (p: MapPoint) => boolean, cost: (p: MapPoint) => number | null,
  estimate: (p: MapPoint) => number, step: number, limit = 80000, directions: readonly MapPoint[] = FOUR, edgeClear?: (a: MapPoint, b: MapPoint) => boolean): MapPoint[] | 'ran out' | null {
  type Item = { p: MapPoint; g: number; f: number }
  const heap: Item[] = []
  const push = (item: Item) => {
    let i = heap.push(item) - 1
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent]!.f <= item.f) break; heap[i] = heap[parent]!; i = parent }
    heap[i] = item
  }
  const pop = (): Item => {
    const first = heap[0]!, last = heap.pop()!
    if (heap.length) {
      let i = 0
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1
        if (child + 1 < heap.length && heap[child + 1]!.f < heap[child]!.f) child++
        if (heap[child]!.f >= last.f) break
        heap[i] = heap[child]!; i = child
      }
      heap[i] = last
    }
    return first
  }
  const startKey = key(start), costs = new Map([[startKey, 0]])
  const parents = new Map<string, MapPoint>()
  push({ p: start, g: 0, f: estimate(start) })
  for (let turn = 0; turn < limit && heap.length; turn++) {
    const item = pop()
    if (item.g !== costs.get(key(item.p))) continue
    if (target(item.p)) {
      const path = [item.p]
      while (key(path[0]!) !== startKey) path.unshift(parents.get(key(path[0]!))!)
      return path
    }
    for (const delta of directions) {
      const p = { x: item.p.x + delta.x * step, y: item.p.y + delta.y * step }
      const nextCost = cost(p)
      if (nextCost === null || (edgeClear && !edgeClear(item.p, p))) continue
      const g = item.g + nextCost * Math.hypot(delta.x, delta.y), k = key(p)
      if (g >= (costs.get(k) ?? Infinity)) continue
      costs.set(k, g); parents.set(k, item.p); push({ p, g, f: g + estimate(p) })
    }
  }
  return heap.length ? 'ran out' : null
}

function appendRegion(state: ForestMapState, group: Pick<ForestRegion, 'groupKey' | 'zone' | 'workspaceId' | 'teamId'>): ForestRegion {
  const index = state.regions.length, seed = seedNumber(state.seed) + index * 983
  const used = new Set(state.regions.flatMap(r => r.cells.map(key)))
  const roadSet = new Set(state.roads.flatMap(path => path.map(key)))
  let selected: ForestRegion | null = null, best = Infinity
  for (let attempt = 0; attempt < 2400; attempt++) {
    const parent = state.regions[Math.floor(forestNoise(seed, attempt * 3) * state.regions.length)]!
    const angle = forestNoise(seed, attempt * 3 + 1) * Math.PI * 2
    const distance = 12 + Math.floor(forestNoise(seed, attempt * 3 + 2) * 8) + Math.floor(attempt / 200) * 3
    const origin = { x: parent.origin.x + Math.round(Math.cos(angle) * distance) * FOREST_CELL, y: parent.origin.y + Math.round(Math.sin(angle) * distance) * FOREST_CELL }
    const form = formRegion(origin, seed, false)
    let clear = true
    for (const p of form.cells) {
      for (let y = -2; y <= 2 && clear; y++) for (let x = -2; x <= 2; x++) {
        const k = key({ x: p.x + x * FOREST_CELL, y: p.y + y * FOREST_CELL })
        if (used.has(k) || roadSet.has(k)) { clear = false; break }
      }
      if (!clear) break
    }
    if (!clear || used.has(key(form.door))) continue
    const sectorCount = state.regions.filter(r => r.id !== 'secretary' && Math.sign(r.origin.x) === Math.sign(origin.x) && Math.sign(r.origin.y) === Math.sign(origin.y)).length
    const score = Math.hypot(origin.x, origin.y) + sectorCount * FOREST_CELL * 9 + forestNoise(seed, attempt + 9000) * FOREST_CELL * 8
    if (score < best) { best = score; selected = { id: `region-${index}`, ...group, origin, ...form } }
    if (selected && attempt >= 100) break
  }
  if (!selected) throw new Error('A new forest area could not be placed without moving an existing one.')
  for (const cell of selected.cells) used.add(key(cell))
  const goals = state.roads.flatMap(path => path)
  const path = search(selected.door, p => roadSet.has(key(p)), p => used.has(key(p)) ? null : .7 + forestNoise(seed, p.x / FOREST_CELL, p.y / FOREST_CELL) * 1.8,
    p => Math.min(...goals.map(g => Math.abs(g.x - p.x) + Math.abs(g.y - p.y))) / FOREST_CELL * .7, FOREST_CELL)
  if (path === 'ran out') throw new Error('The road search for a new forest area stopped at its limit before it reached the existing office.')
  if (!path) throw new Error('The new forest area has no road to the existing office.')
  state.regions.push(selected); state.roads.push(path)
  return selected
}

export function forestConfigurationKey(settings: Pick<ForestMapSettings, 'seed' | 'grouping'>): string {
  return JSON.stringify([1, settings.grouping])
}

export function readForestMapState(value: unknown): ForestMapState {
  const state = forestMapStateSchema.parse(value)
  const regions = new Map(state.regions.map(r => [r.id, r]))
  if (regions.size !== state.regions.length || !regions.has('secretary')) throw new Error('Saved forest regions have duplicate ids or no secretary area.')
  const occupied = new Set<string>()
  for (const assignment of Object.values(state.assignments)) {
    const region = regions.get(assignment.regionId)
    if (!region || !region.slots[assignment.slot]) throw new Error('A saved forest seat points to a station that does not exist.')
    const slot = `${assignment.regionId}:${assignment.slot}`
    if (assignment.active && occupied.has(slot)) throw new Error('Two active people were saved in the same forest seat.')
    if (assignment.active) occupied.add(slot)
  }
  return state
}

/** Existing regions, roads and seats stay in world coordinates. Only the affected person moves. */
export function reconcileForestMap(previous: ForestMapState | null, occupants: readonly ForestOccupant[], settings: Pick<ForestMapSettings, 'seed' | 'grouping'>): ForestReconciliation {
  if (new Set(occupants.map(m => m.id)).size !== occupants.length) throw new Error('The forest roster contains the same identity twice.')
  if (previous && previous.grouping !== settings.grouping) throw new Error('A saved forest layout belongs to another grouping.')
  const state: ForestMapState = previous ? structuredClone(readForestMapState(previous)) : {
    version: 1, seed: settings.seed, grouping: settings.grouping,
    regions: [{ id: 'secretary', groupKey: 'secretary', zone: 'secretary', workspaceId: null, teamId: null, origin: { x: 0, y: 0 }, ...formRegion({ x: 0, y: 0 }, seedNumber(settings.seed), true) }],
    assignments: {}, roads: [],
  }
  if (!previous) state.roads.push([state.regions[0]!.door])
  const assignment: ForestMapLayout['assignment'] = { newAgents: [], movedAgents: [], inactiveAgents: [], addedRegions: [] }
  const active = occupants.filter(m => !m.retired)
  const ids = new Set(active.map(m => m.id))
  for (const [id, held] of Object.entries(state.assignments)) if (held.active && !ids.has(id)) { held.active = false; assignment.inactiveAgents.push(id) }
  const ordered = [...active].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id))
  for (const mole of ordered) {
    const held = state.assignments[mole.id]
    const workspaceId = settings.grouping === 'shared' || mole.zone === 'secretary' ? null
      : mole.projects.some(p => p.id === held?.workspaceId) ? held!.workspaceId
      : [...mole.projects].sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? null
    const teamId = mole.zone === 'team' ? mole.team : null
    const groupKey = mole.zone === 'secretary' ? 'secretary' : JSON.stringify([workspaceId, mole.zone, teamId])
    if (held?.active && held.groupKey === groupKey) continue
    const occupied = new Set(Object.entries(state.assignments).filter(([id, a]) => id !== mole.id && a.active).map(([, a]) => `${a.regionId}:${a.slot}`))
    let region = held?.groupKey === groupKey ? state.regions.find(r => r.id === held.regionId && !occupied.has(`${r.id}:${held.slot}`)) : undefined
    let slot = region ? held!.slot : -1
    if (!region) {
      region = state.regions.find(r => r.groupKey === groupKey && r.slots.some((_, i) => !occupied.has(`${r.id}:${i}`)))
      if (region) slot = region.slots.findIndex((_, i) => !occupied.has(`${region!.id}:${i}`))
    }
    if (!region) { region = appendRegion(state, { groupKey, zone: mole.zone, workspaceId, teamId }); slot = 0; assignment.addedRegions.push(region.id) }
    state.assignments[mole.id] = { regionId: region.id, slot, groupKey, workspaceId, active: true }
    if (!held) assignment.newAgents.push(mole.id)
    else if (held.regionId !== region.id || held.slot !== slot) assignment.movedAgents.push(mole.id)
  }
  return { state, changed: previous === null || JSON.stringify(previous) !== JSON.stringify(state), assignment }
}

function overlaps(a: ForestRect, b: ForestRect): boolean { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y }
function cellRect(p: MapPoint, margin = 0): ForestRect { return { x: p.x - FOREST_CELL / 2 - margin, y: p.y - FOREST_CELL / 2 - margin, width: FOREST_CELL + margin * 2, height: FOREST_CELL + margin * 2 } }

/** Pixel centers define every material boundary. Raster masks and navigation call this same reader. */
export function forestPolygonContains(polygon: readonly MapPoint[], point: MapPoint): boolean {
  const x = Math.floor(point.x) + .5, y = Math.floor(point.y) + .5
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
/**
 * A POLYGON'S BOUNDS ARE WORKED OUT ONCE. The woodland's trees ask whether each of tens of thousands of trunks touches
 * a road ring, and the rings' bounds were worked out again for every one: 7.6 of the 27 seconds a large office's scene
 * took (round 9 of wave 13x). A polygon is not changed once it is made, so its bounds are kept beside it.
 */
const boundsOf = new WeakMap<readonly MapPoint[], ForestRect>()
function surfaceBounds(polygon: readonly MapPoint[]): ForestRect {
  const known = boundsOf.get(polygon)
  if (known !== undefined) return known
  const x = Math.min(...polygon.map(p => p.x)), y = Math.min(...polygon.map(p => p.y))
  const box = { x, y, width: Math.max(...polygon.map(p => p.x)) - x, height: Math.max(...polygon.map(p => p.y)) - y }
  boundsOf.set(polygon, box)
  return box
}
/**
 * WHETHER ANY OF THESE CELLS, WIDENED BY `margin`, OVERLAPS A RECTANGLE: the same answer as
 * `cells.some(p => overlaps(rectangle, cellRect(p, margin)))`, found by looking only at the cells near the rectangle.
 * The trees' check walked every ground and road cell for every trunk, about 20,000 cells for each of 27,000 trunks.
 */
function nearCells(cells: readonly MapPoint[]): (rectangle: ForestRect, margin: number) => boolean {
  const columns = new Map<string, MapPoint[]>()
  const at = (cx: number, cy: number) => `${cx},${cy}`
  for (const p of cells) {
    const k = at(Math.floor(p.x / FOREST_CELL), Math.floor(p.y / FOREST_CELL))
    const held = columns.get(k)
    if (held === undefined) columns.set(k, [p])
    else held.push(p)
  }
  return (rectangle, margin) => {
    // A cell overlaps only when its centre is within half a cell and the margin of the rectangle's sides.
    const reach = FOREST_CELL / 2 + margin
    for (let cy = Math.floor((rectangle.y - reach) / FOREST_CELL); cy <= Math.floor((rectangle.y + rectangle.height + reach) / FOREST_CELL); cy++) {
      for (let cx = Math.floor((rectangle.x - reach) / FOREST_CELL); cx <= Math.floor((rectangle.x + rectangle.width + reach) / FOREST_CELL); cx++) {
        if (columns.get(at(cx, cy))?.some(p => overlaps(rectangle, cellRect(p, margin))) === true) return true
      }
    }
    return false
  }
}
function polygonTouchesRect(polygon: readonly MapPoint[], rectangle: ForestRect): boolean {
  if (!overlaps(surfaceBounds(polygon), rectangle)) return false
  const corners = [{ x: rectangle.x, y: rectangle.y }, { x: rectangle.x + rectangle.width, y: rectangle.y },
    { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height }, { x: rectangle.x, y: rectangle.y + rectangle.height }]
  if (corners.some(point => forestPolygonContains(polygon, point)) || polygon.some(point => point.x >= rectangle.x && point.x <= rectangle.x + rectangle.width && point.y >= rectangle.y && point.y <= rectangle.y + rectangle.height)) return true
  const cross = (a: MapPoint, b: MapPoint, c: MapPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  return polygon.some((a, i) => corners.some((c, j) => {
    const b = polygon[(i + 1) % polygon.length]!, d = corners[(j + 1) % corners.length]!
    return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
      && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
      && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0
  }))
}
/**
 * The road centreline the contour is drawn around.
 *
 * The saved roads are Manhattan control points. An isolated elbow is replaced by the straight
 * 45-degree chord between the two cells around it, which is where the map's longer diagonal joins
 * come from and why they are kept. This is the accepted acceptance rule for where a diagonal is;
 * the chord is the shape fact the contour then offsets and rounds.
 */
function roadCentreline(paths: readonly (readonly MapPoint[])[], ground: readonly MapPoint[]): MapPoint[][] {
  const cells = new Map(paths.flat().map(p => [key(p), p])), removed = new Set<string>(), retained = new Set<string>()
  const result: MapPoint[][] = []
  for (const path of paths) {
    const out: MapPoint[] = []
    for (let i = 0; i < path.length; i++) {
      const b = path[i]!
      if (i >= 2 && i < path.length - 2) {
        const a = path[i - 1]!, c = path[i + 1]!, before = path[i - 2]!, after = path[i + 2]!
        const u = { x: b.x - a.x, y: b.y - a.y }, v = { x: c.x - b.x, y: c.y - b.y }
        if (u.x * v.x + u.y * v.y === 0 && a.x - before.x === u.x && a.y - before.y === u.y && after.x - c.x === v.x && after.y - c.y === v.y
          && !retained.has(key(b)) && !removed.has(key(a)) && !removed.has(key(c))
          && FOUR.filter(d => cells.has(key({ x: b.x + d.x * FOREST_CELL, y: b.y + d.y * FOREST_CELL }))).length === 2) {
          const nx = -Math.sign(c.y - a.y) * 34, ny = Math.sign(c.x - a.x) * 34
          const bridge = [{ x: a.x + nx, y: a.y + ny }, { x: c.x + nx, y: c.y + ny }, { x: c.x - nx, y: c.y - ny }, { x: a.x - nx, y: a.y - ny }]
          if (!ground.some(point => polygonTouchesRect(bridge, cellRect(point)))) { removed.add(key(b)); retained.add(key(a)); retained.add(key(c)); continue }
        }
      }
      if (!removed.has(key(b))) out.push(b)
    }
    result.push(out)
  }
  return result
}

function projectForestSurfaces(state: ForestMapState, rooms: readonly ForestRoom[], furniture: Record<string, ForestFurniture>, geometry: ForestGeometry, settings: ForestMapSettings, road: RoadContour | null): ForestSurface[] {
  const result: ForestSurface[] = []
  if (road) {
    // One contour cuts the road: the fill and the edge are both read from these rings, and the
    // route clearance reads the same rings through the same reader. No per-cell square and no
    // resampled second shape.
    result.push({ id: 'connected-roads', role: 'road', material: 'road', roomId: null, polygons: road.rings })
  }
  for (const room of rooms) {
    if (!geometry.environments?.[room.scene]?.surface) continue
    const items = Object.values(furniture).filter(item => item.roomId === room.id)
    if (!items.length) continue
    const l = Math.floor((Math.min(...items.map(item => item.desk.footprint.x)) - 48) / 16) * 16
    const r = Math.ceil((Math.max(...items.map(item => item.desk.footprint.x + item.desk.footprint.width)) + 48) / 16) * 16
    const stationFeet = state.regions.find(region => region.id === room.id)!.slots
    const t = Math.min(...stationFeet.map(point => point.y)) - 80, b = Math.max(...stationFeet.map(point => point.y)) + 112
    const wood = room.zone === 'secretary' || room.occupants.length >= 3, rectangle = wood && seedNumber(room.id) % 6 === 0
    const polygon = rectangle ? [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }]
      : [{ x: l + 32, y: t }, { x: r - 32, y: t }, { x: r, y: t + 32 }, { x: r, y: b - 32 },
        { x: r - 32, y: b }, { x: (l + r) / 2 + 64, y: b }, { x: (l + r) / 2 + 32, y: b - 32 },
        { x: (l + r) / 2 - 32, y: b - 32 }, { x: (l + r) / 2 - 64, y: b }, { x: l + 32, y: b }, { x: l, y: b - 32 }, { x: l, y: t + 32 }]
    result.push({ id: `work-ground:${room.id}`, role: 'work-area', material: wood ? 'sharedWork' : 'plainWork', roomId: room.id, polygons: [polygon] })
  }
  return result
}
export function forestSurfaceIndex(surfaces: readonly ForestSurface[], tileSize = FOREST_TILE): ReadonlyMap<string, { surface: ForestSurface; polygon: MapPoint[] }[]> {
  const result = new Map<string, { surface: ForestSurface; polygon: MapPoint[] }[]>()
  for (const surface of surfaces) for (const polygon of surface.polygons) {
    const box = surfaceBounds(polygon)
    for (let y = Math.floor((box.y + tileSize / 2) / tileSize); y <= Math.floor((box.y + box.height + tileSize / 2) / tileSize); y++) for (let x = Math.floor((box.x + tileSize / 2) / tileSize); x <= Math.floor((box.x + box.width + tileSize / 2) / tileSize); x++) {
      const k = key({ x: x * tileSize, y: y * tileSize }), entries = result.get(k) ?? []
      entries.push({ surface, polygon }); result.set(k, entries)
    }
  }
  return result
}

/**
 * The surface material the ground raster paints at one pixel centre.
 *
 * A road reads the one shared road contour through `roadContains`; every other surface keeps the
 * polygon reader it already had. The caller passes the surfaces it already indexed for this tile,
 * so the raster does not rebuild the index for each pixel.
 */
export function forestSurfaceMaterialAt(layout: Pick<ForestMapLayout, 'roadContour'>, entries: readonly { surface: ForestSurface; polygon: MapPoint[] }[], point: MapPoint): ForestSurface['material'] | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!
    const inside = entry.surface.role === 'road' && layout.roadContour
      ? roadContains(layout.roadContour, point)
      : forestPolygonContains(entry.polygon, point)
    if (inside) return forestSurfaceMaterial(entry.surface)
  }
  return null
}

/** All drawing and collision furniture coordinates are read from the same projection. */
export function forestMapLayout(reconciled: ForestReconciliation, occupants: readonly ForestOccupant[], settings: ForestMapSettings, geometry: ForestGeometry): ForestMapLayout {
  const { state } = reconciled, byId = new Map(occupants.map(m => [m.id, m])), { t } = createI18n(settings.zh ? 'zh' : 'en')
  const furniture: Record<string, ForestFurniture> = {}, furnitureDiagnostics: ForestFurnitureDiagnostic[] = []
  const stations: Record<string, ForestStation> = {}, seats: Record<string, ForestSeat> = {}, obstacles: ForestObstacle[] = []
  const rooms: ForestRoom[] = state.regions.map(region => {
    const activeIds = Object.entries(state.assignments).filter(([, a]) => a.active && a.regionId === region.id).map(([id]) => id)
    const projectName = occupants.flatMap(m => m.projects).find(p => p.id === region.workspaceId)?.name
    const teamName = region.teamId ? byId.get(region.teamId)?.name : undefined
    const title = [projectName, teamName ? t('g6c.pixel.office.teamGroup', { name: teamName }) : t(ZONE_WORDS[region.zone])].filter(Boolean).join(' · ')
    const scene = region.workspaceId ? settings.workspaceScenes[region.workspaceId] ?? settings.scene : settings.scene
    const environment = geometry.environments?.[scene]
    const roomProps = environment?.props ?? geometry.props
    const definition = environment?.definition ?? C_WOODLAND_DEFINITION
    const grouped = new Map<number, { furnitureId: string; seatKey: string }>()
    // A shared table must fit the saved seats exactly. Unmatched seats keep individual furniture.
    for (const propId of definition.furniture?.shared ?? geometry.sharedFurniture ?? []) {
      const prop = roomProps.props[propId]
      if (!prop?.seats || Object.keys(prop.seats).length < 2) throw new Error(`The shared furniture ${propId} has fewer than two seats.`)
      const entries = Object.entries(prop.seats), first = entries[0]![1], matchedSlots: number[] = []
      const unavailableLooks = new Set<string>()
      for (let i = 0; i < region.slots.length; i++) {
        if (grouped.has(i)) continue
        const foot = region.slots[i]!
        const anchor = { x: foot.x - first.actorFoot.x * prop.defaultScale, y: foot.y - first.actorFoot.y * prop.defaultScale }
        const indexes = entries.map(([, seat]) => region.slots.findIndex(point =>
          Math.abs(point.x - anchor.x - seat.actorFoot.x * prop.defaultScale) < .001 && Math.abs(point.y - anchor.y - seat.actorFoot.y * prop.defaultScale) < .001))
        if (indexes.some(index => index < 0 || grouped.has(index)) || new Set(indexes).size !== indexes.length) continue
        const missing = indexes.flatMap((index, seatIndex) => {
          const occupantId = activeIds.find(agentId => state.assignments[agentId]!.slot === index)
          const look = (occupantId ? byId.get(occupantId)?.cLook : null) ?? 'bare'
          return entries[seatIndex]![1].contacts[look] ? [] : [look]
        })
        if (missing.length) { for (const look of missing) unavailableLooks.add(look); continue }
        const id = `${region.id}:furniture:${i}`, desk = placeCForestProp(roomProps, propId, anchor)
        furniture[id] = { id, roomId: region.id, desk, stationIds: indexes.map(index => `${region.id}:seat:${index}`), form: 'shared' }
        if (prop.blocking) obstacles.push({ id: `${id}:desk`, kind: 'desk', ...desk.footprint })
        entries.forEach(([seatKey], n) => grouped.set(indexes[n]!, { furnitureId: id, seatKey }))
        matchedSlots.push(...indexes)
      }
      const unmatchedSlots = region.slots.map((_, index) => index).filter(index => !matchedSlots.includes(index))
      furnitureDiagnostics.push({ roomId: region.id, propId, matchedSlots, unmatchedSlots, reason: unavailableLooks.size
        ? `The shared table has no measured contact or stool for ${[...unavailableLooks].join(', ')}. Those seats retain available individual furniture.`
        : unmatchedSlots.length ? 'The remaining saved feet do not form this table’s fixed seat pattern, or another shared table already uses them. They retain available furniture.'
        : 'Every saved seat matches this table’s fixed seat pattern.' })
    }
    region.slots.forEach((foot, i) => {
      const id = `${region.id}:seat:${i}`
      const occupantId = activeIds.find(agentId => state.assignments[agentId]!.slot === i)
      const occupant = occupantId ? byId.get(occupantId) : undefined
      const hasCGeometry = occupant?.cLook != null && occupant.cScale != null
      // A vacant or unrepresented seat still has furniture. This never supplies a person's look.
      const look = hasCGeometry ? occupant!.cLook! : 'bare'
      const scale = hasCGeometry ? occupant!.cScale! : C_FOREST_SCALE_RANGE.high
      const talk = { x: foot.x + FOREST_CELL, y: foot.y }
      const shared = grouped.get(i)
      if (shared) {
        const table = furniture[shared.furnitureId]!
        const placement = readCForestSharedStation(roomProps, table.desk, shared.seatKey, look, foot, scale)
        stations[id] = { id, roomId: region.id, ...shared, ...placement, talk,
          contact: placement.contactError ? 'measured-shared-points' : 'unmeasured-shared-look', geometryFor: hasCGeometry ? 'current-c-look' : 'reserved-furniture' }
      } else {
        const choices = definition.furniture?.single ?? []
        const deskId = region.zone === 'secretary' ? definition.stations.secretary : choices.length ? choices[seedNumber(`${region.id}:${i}`) % choices.length]! : definition.stations.worker
        const placement = readCForestStation(roomProps, deskId, look, foot, scale)
        const furnitureId = `${region.id}:furniture:${i}`
        furniture[furnitureId] = { id: furnitureId, roomId: region.id, desk: placement.desk, stationIds: [id], form: 'single' }
        stations[id] = { id, roomId: region.id, furnitureId, seatKey: null, foot, stool: placement.stool, foregroundDepth: placement.foregroundDepth,
          bodyDepth: foot.y, contact: placement.contact, contactError: placement.contactError, bookPoint: placement.bookPoint, facing: placement.facing, actions: placement.actions, talk,
          geometryFor: hasCGeometry ? 'current-c-look' : 'reserved-furniture' }
        obstacles.push({ id: `${furnitureId}:desk`, kind: 'desk', ...placement.desk.footprint })
      }
      const station = stations[id]!
      obstacles.push({ id: `${id}:stool`, stationId: id, kind: 'stool', ...station.stool.footprint })
    })
    const x = Math.min(...region.cells.map(p => p.x)) - FOREST_CELL / 2, y = Math.min(...region.cells.map(p => p.y)) - FOREST_CELL / 2
    return { id: region.id, zone: region.zone, title, workspaceId: region.workspaceId, scene, environment: environment || (scene === 'woodland' && !geometry.environments) ? 'ready' : 'unavailable',
      environmentError: environment || (scene === 'woodland' && !geometry.environments) ? null : geometry.environmentErrors?.[scene] ?? FOREST_ENVIRONMENT_ERROR,
      x, y, width: Math.max(...region.cells.map(p => p.x)) + FOREST_CELL / 2 - x, height: Math.max(...region.cells.map(p => p.y)) + FOREST_CELL / 2 - y,
      occupants: activeIds, door: region.door, profile: region.profile, cells: region.cells }
  })
  for (const [agentId, held] of Object.entries(state.assignments)) if (held.active) {
    const stationId = `${held.regionId}:seat:${held.slot}`, station = stations[stationId]!
    seats[agentId] = { roomId: held.regionId, stationId, foot: station.foot, talk: station.talk }
  }
  const roadCells = [...new Map(state.roads.flatMap(path => path.map(p => [key(p), p] as const))).values()]
  const groundCells = state.regions.flatMap(r => r.cells)
  const backWalls = rooms.flatMap(forestBackWalls)
  // Compute the one road contour here, once, and check every fault before a partial road is
  // published. The throw reaches the visible forest layout error path, which is a plain sentence.
  const road = geometry.environments?.[settings.scene]?.surface
    ? roadContour(roadCentreline(state.roads, groundCells), FOREST_CELL / 2)
    : null
  if (road && road.faults.length) throw new Error(`The forest road contour is invalid, so the road cannot be drawn: ${road.faults.join('; ')}.`)
  const surfaces = projectForestSurfaces(state, rooms, furniture, geometry, settings, road)
  const all = [...groundCells, ...roadCells], pad = FOREST_CELL * 3
  const x = Math.min(...all.map(p => p.x)) - pad, y = Math.min(...all.map(p => p.y)) - pad
  const bounds = { x, y, width: Math.max(...all.map(p => p.x)) + pad - x, height: Math.max(...all.map(p => p.y)) + pad - y }
  const decor: ForestDecor[] = []
  const nearAnyCell = nearCells(all)
  const seed = seedNumber(settings.seed)
  const density = { sparse: .18, normal: .38, lush: .55 }[settings.decorations]
  const addDecor = (point: MapPoint, id: string, room: ForestRoom, propId: string): boolean => {
    const roomProps = geometry.environments?.[room.scene]?.props ?? geometry.props
    const tree = placeCForestProp(roomProps, propId, point)
    if (obstacles.some(o => overlaps(tree.footprint, { x: o.x - geometry.bodyRadius, y: o.y - 32,
      width: o.width + geometry.bodyRadius * 2, height: o.height + 64 }))) return false
    decor.push({ ...tree, id, kind: propId === 'tree' ? 'tree' : 'prop', roomId: room.id, scene: room.scene })
    if (roomProps.props[propId]!.blocking) obstacles.push({ id, kind: propId === 'tree' ? 'tree' : 'prop', ...tree.footprint })
    return true
  }
  // Trees behind the first desk in each column keep the work clearings inside the forest.
  // Their visible roots and route obstacles use the same placement as the outer trees.
  for (const region of state.regions) {
    const room = rooms.find(room => room.id === region.id)!
    if (room.environment !== 'ready') continue
    const definition = geometry.environments?.[room.scene]?.definition ?? C_WOODLAND_DEFINITION
    if (room.scene !== 'woodland') {
      // Windows and other boundary props stay at an actual top edge of this room.
      const boundary = definition.decorations.boundary
      if (boundary.length) {
        const point = [...region.cells].sort((a, b) => a.y - b.y || Math.abs(a.x - region.origin.x) - Math.abs(b.x - region.origin.x))[0]!
        addDecor({ x: point.x, y: point.y - FOREST_CELL / 2 }, `boundary:${region.id}`, room, boundary[Math.floor(forestNoise(seed, region.origin.x, region.origin.y) * boundary.length)]!)
      }
      const free = [...definition.decorations.backdrop, ...definition.decorations.ground]
      for (const [index, point] of region.cells.entries()) {
        if (!free.length || forestNoise(seed + 713, point.x, point.y) > density * .25) continue
        const propId = free[Math.floor(forestNoise(seed + 717, point.x, point.y) * free.length)]!
        addDecor(point, `decoration:${region.id}:${index}`, room, propId)
      }
      continue
    }
    const columns = new Map<number, number>()
    for (const slot of region.slots) columns.set(slot.x, Math.min(columns.get(slot.x) ?? Infinity, slot.y))
    for (const [column, firstRow] of columns) {
      const point = { x: column, y: firstRow - FOREST_TILE * 5 }
      if (region.cells.some(p => overlaps(cellRect(p), { ...point, width: 1, height: 1 }))) {
        addDecor(point, `tree:clearing:${region.id}:${column}`, room, 'tree')
      }
    }
    // Side trees frame the desks without taking the central approach or the room door.
    for (const side of [-1, 1]) for (const row of [-2, 1, 3]) {
      // The court and branch use their outer column as an access aisle.
      if (region.profile === 'court' || region.profile === 'branch') continue
      if (settings.decorations === 'sparse' && row === 1) continue
      const point = { x: region.origin.x + side * FOREST_CELL * 5, y: region.origin.y + row * FOREST_CELL }
      if (region.cells.some(p => key(p) === key(point))) addDecor(point, `tree:edge:${region.id}:${side}:${row}`, room, 'tree')
    }
  }
  // Trees are tied to world coordinates. New clearings remove only trees they now occupy.
  if (settings.scene === 'woodland') for (let cy = Math.floor(bounds.y / FOREST_CELL); cy <= Math.ceil((bounds.y + bounds.height) / FOREST_CELL); cy++) {
    for (let cx = Math.floor(bounds.x / FOREST_CELL); cx <= Math.ceil((bounds.x + bounds.width) / FOREST_CELL); cx++) {
      if (forestNoise(seed + 901, cx, cy) > density) continue
      const point = { x: cx * FOREST_CELL, y: cy * FOREST_CELL }
      const tree = placeCForestProp(geometry.props, 'tree', point)
      const trunk = tree.footprint
      if (nearAnyCell(trunk, geometry.bodyRadius + 12)) continue
      const clearance = { x: trunk.x - geometry.bodyRadius, y: trunk.y - geometry.bodyRadius, width: trunk.width + geometry.bodyRadius * 2, height: trunk.height + geometry.bodyRadius * 2 }
      if (surfaces.some(surface => surface.role === 'road' && surface.polygons.some(polygon => polygonTouchesRect(polygon, clearance)))) continue
      const id = `tree:${cx}:${cy}`
      decor.push({ ...tree, id, kind: 'tree', roomId: null, scene: 'woodland' })
      obstacles.push({ id, kind: 'tree', ...trunk })
    }
  }
  // A window occupies its wall. Add wall obstacles after decorative placement so the
  // overlap does not cause the window's own supporting wall to reject it.
  for (const wall of backWalls) obstacles.push({ id: wall.id, kind: 'wall', ...wall.footprint })
  return { version: 1, scene: settings.scene, tileSize: FOREST_TILE, cellSize: FOREST_CELL, bodyRadius: geometry.bodyRadius, rooms, seats, stations, furniture,
    roads: state.roads, roadCells, groundCells, surfaces, roadContour: road, obstacles, decor, backWalls, furnitureDiagnostics, bounds, width: bounds.width, height: bounds.height,
    center: { x: 0, y: 0 }, assignment: reconciled.assignment }
}

/** Room selection is shared by terrain drawing and the check before showing a message walk. */
export function forestRoomIndex(layout: ForestMapLayout): ReadonlyMap<string, ForestRoom> {
  return new Map(layout.rooms.flatMap(room => room.cells.map(point => [key(point), room] as const)))
}
export function forestSceneAt(layout: ForestMapLayout, point: MapPoint, index: ReadonlyMap<string, ForestRoom>) {
  const room = index.get(key({ x: Math.round(point.x / layout.cellSize) * layout.cellSize, y: Math.round(point.y / layout.cellSize) * layout.cellSize })) ?? null
  return { room, scene: room?.scene ?? layout.scene }
}

/** The large saved office has over a thousand obstacles. Search only rectangles touching the body's cells. */
export function forestObstacleIndex(layout: ForestMapLayout): ReadonlyMap<string, readonly ForestObstacle[]> {
  const index = new Map<string, ForestObstacle[]>()
  for (const obstacle of layout.obstacles) {
    for (let y = Math.floor(obstacle.y / FOREST_CELL); y <= Math.floor((obstacle.y + obstacle.height) / FOREST_CELL); y++) {
      for (let x = Math.floor(obstacle.x / FOREST_CELL); x <= Math.floor((obstacle.x + obstacle.width) / FOREST_CELL); x++) {
        const cell = key({ x, y }), held = index.get(cell) ?? []
        held.push(obstacle); index.set(cell, held)
      }
    }
  }
  return index
}

/**
 * Whether a body standing at `point` touches no obstacle. `freeStations` names the stations whose
 * own stools do not count: a route ignores the sender's stool, which it starts on, and the
 * recipient's, beside the point it must reach (from problem zFK7SO7Io1jz: a south-west facing single
 * desk puts its stool 3.6 to 7.2 px into the body at its talk point, so no route could ever end there).
 */
export function forestPointIsClear(layout: ForestMapLayout, point: MapPoint, freeStations?: string | readonly string[], index?: ReadonlyMap<string, readonly ForestObstacle[]>): boolean {
  const radius = layout.bodyRadius
  // The foot anchor is the bottom of the projected feet, not the centre of the standing sprite.
  const body = { x: point.x - radius, y: point.y - radius / 3, width: radius * 2, height: radius / 3 }
  const free: readonly (string | undefined)[] = typeof freeStations === 'string' || freeStations === undefined ? [freeStations] : freeStations
  const blocks = (o: ForestObstacle) => !(o.kind === 'stool' && o.stationId !== undefined && free.includes(o.stationId)) && overlaps(body, o)
  if (!index) return !layout.obstacles.some(blocks)
  for (let y = Math.floor(body.y / FOREST_CELL); y <= Math.floor((body.y + body.height) / FOREST_CELL); y++) {
    for (let x = Math.floor(body.x / FOREST_CELL); x <= Math.floor((body.x + body.width) / FOREST_CELL); x++) {
      if (index.get(key({ x, y }))?.some(blocks)) return false
    }
  }
  return true
}

/** How many turns a route search may take before it says it stopped, rather than that there is no path. */
export const FOREST_ROUTE_TURNS = 80000

export function routeForestMessage(layout: ForestMapLayout, fromAgentId: string, toAgentId: string, turns = FOREST_ROUTE_TURNS): ForestRoute {
  const from = layout.seats[fromAgentId], to = layout.seats[toAgentId]
  if (!from || !to) return { points: [], reachable: false, reason: 'A participant has no saved forest seat.' }
  const start = from.foot, target = to.talk
  if (![start.x, start.y, target.x, target.y].every(n => Number.isInteger(n / FOREST_TILE))) return { points: [], reachable: false, reason: 'A forest station is not on the navigation grid.' }
  const modern = layout.surfaces.some(surface => surface.role === 'road'), step = modern ? 16 : FOREST_TILE
  const coarse = new Set([...layout.groundCells, ...(modern ? [] : layout.roadCells)].map(key))
  const surfaceIndex = forestSurfaceIndex(layout.surfaces.filter(surface => surface.role === 'road'))
  const obstacles = forestObstacleIndex(layout)
  const onGround = (p: MapPoint) => {
    const cx = Math.round(p.x / FOREST_CELL), cy = Math.round(p.y / FOREST_CELL)
    if (coarse.has(key({ x: cx * FOREST_CELL, y: cy * FOREST_CELL }))) return true
    const k = key({ x: Math.floor((p.x + FOREST_TILE / 2) / FOREST_TILE) * FOREST_TILE, y: Math.floor((p.y + FOREST_TILE / 2) / FOREST_TILE) * FOREST_TILE })
    // The route reads the same one road contour the ground raster reads; it does not ask a
    // second shape. Non-road coverage never comes through this index.
    return (surfaceIndex.get(k) ?? []).some(entry => layout.roadContour ? roadContains(layout.roadContour, p) : forestPolygonContains(entry.polygon, p))
  }
  const targetKey = key(target), free = [from.stationId, to.stationId]
  const points = search(start, p => key(p) === targetKey,
    p => onGround(p) && forestPointIsClear(layout, p, free, obstacles) ? 1 : null,
    p => (modern ? Math.hypot(target.x - p.x, target.y - p.y) : Math.abs(target.x - p.x) + Math.abs(target.y - p.y)) / step, step, turns, modern ? EIGHT : FOUR,
    modern ? (a, b) => [0, .25, .5, .75, 1].every(fraction => { const point = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction }; return onGround(point) && forestPointIsClear(layout, point, free, obstacles) }) : undefined)
  if (points === 'ran out') return { points: [], reachable: false, reason: `The route search stopped after ${turns} steps without reaching the recipient, so whether a path exists is unknown.` }
  return points ? { points, reachable: true, reason: null } : { points: [], reachable: false,
    reason: `No path avoids the recorded furniture${layout.backWalls.length ? ', walls and' : ' and'} tree trunks.` }
}
