// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { CompactPlanting } from './compact-scenery.ts'
import { roadContour, type RoadContour } from './road-contour.ts'
import art from '../assets/village-catalog.json'
import { anchored, boundsOf, houseCatalog, houseStyles, inPolygon, polygonTouchesRect, piece, stableHash, type House, type Piece } from './village.ts'
import { Navigation } from './navigation.ts'
import type { Rect } from './viewport.ts'
import { VisibleIndex } from './render-plan.ts'
import { packRing, packedBounds, inPackedRing } from './packed-road.ts'
import type { VillageCell, VillageRoster } from './village-layout.ts'
import type { FacilityPose } from './facility-pose.ts'

export interface Point { x: number; y: number }
export interface RoomInput { id: string; occupants: string[] }
export interface LayoutInput { rooms: RoomInput[]; roster?: VillageRoster; sleepingCount?: number }
export interface RoomGeometry extends Rect { id: string; door: Point }
export interface Station { room: string; index: number; row: number; column: number; mobileRow: number; foot: Point; talk: Point; desk: Rect; stool: Rect }
export interface Obstacle extends Rect { kind: 'desk' | 'stool' | 'wall'; station?: string; polygon?: Point[]; polygonOrigin?: Point }
/** Where an agent stands when it is not at its desk: the play places of the common square, for the few offline agents
 * that are drawn, and the places of the sleeping house, for an agent asleep. Both are made with the layout, so they do
 * not move when who is online or asleep changes. */
export interface Places { play: Point[]; sleep: Point[]; sleepingHouse: Rect }
/** A place in a room where an idle agent of that room stands at the room's own furniture, in the place's pose.
 * It belongs to the room, never to an agent: an agent at work is at its desk, and only an idle one is drawn here. */
export interface FacilityPlace { room: string; index: number; foot: Point; activity: 'reading' | 'garden' | 'route'; cluster: string; outdoors: boolean; pose: FacilityPose }
export interface Layout { places?: Places; facilities?: FacilityPlace[]; key: string; bounds: Rect; rooms: RoomGeometry[]; seats: Record<string, Station>; obstacles: Obstacle[]; road: RoadContour; bodyRadius: number; houses: House[]; square: Rect; pieces: Piece[]; planting?: CompactPlanting[]; paths?: Point[][]; roadDrawing?: Float64Array[]; preview?: boolean; villages?: VillageCell[]; squares?: Rect[]; ownership?: boolean }
export type Route = { status: 'found' | 'exhausted' | 'no-path' | 'unavailable'; points: Point[] }
export const layoutKey = (input: LayoutInput): string => {
  const base = input.roster ?? input.rooms.map(room => [room.id, room.occupants])
  return JSON.stringify(input.sleepingCount ? [base, input.sleepingCount] : base)
}

interface Template { style: string; capacity: number }
const variants = new Map<string, { collision: { polygon: Point[]; bounds: Rect }[]; walkable: Point[][] }>()
function variantGeometry(style: string) {
  let kept = variants.get(style)
  if (!kept) {
    const points = (poly: number[][]) => poly.map(p => ({ x: p[0]!, y: p[1]! }))
    kept = { collision: houseCatalog[style]!.collisionPolygons.map(poly => { const polygon = points(poly); return { polygon, bounds: boundsOf(polygon) } }), walkable: houseCatalog[style]!.walkableAreas.map(points) }
    variants.set(style, kept)
  }
  return kept
}
interface RoomFragment {
  key: string; rooms: RoomGeometry[]; houses: House[]; pieces: Piece[]; seats: Record<string, Station>;
  obstacles: Obstacle[]; paths: Point[][]; planting: Piece[]
}
/** Current templates only. Separate outward lanes retain group positions as modules grow. */
export class LayoutCache {
  private templates = new Map<string, { key: string; template: Template }>()
  private current: Layout | null = null
  private contours = new WeakMap<Point[], { road: RoadContour; packed: Float64Array[] }>()
  private loop: { columns: number; path: Point[] } | null = null
  contourComputations = 0
  private fragments = new Map<string, RoomFragment>()
  computations = 0
  roomComputations = 0
  houseComputations = 0
  constructor(private compact = false) {}
  layout(input: LayoutInput): Layout {
    const work = this.build(input)
    for (;;) { const next = work.next(); if (next.done) return next.value }
  }
  /** Each yield is a cancellation/scheduling boundary; no partially built layout is cached. */
  *build(input: LayoutInput): Generator<Layout | void, Layout> {
    const key = layoutKey(input)
    if (this.current?.key === key) return this.current
    const identities = input.rooms.flatMap(room => room.occupants)
    if (new Set(identities).size !== identities.length || new Set(input.rooms.map(room => room.id)).size !== input.rooms.length) throw new Error('The roster supplies a duplicate identity or room.')
    const styles = houseStyles(input.rooms)
    const templates = input.rooms.map((room, i) => {
      const style = styles[i]!, signature = JSON.stringify([room.occupants, style]), kept = this.templates.get(room.id)
      if (kept?.key === signature) return kept.template
      const template: Template = { style, capacity: houseCatalog[style]!.deskSlots.length }
      this.templates.set(room.id, { key: signature, template }); this.roomComputations++
      return template
    })
    const currentRooms = new Set(input.rooms.map(room => room.id))
    for (const id of this.templates.keys()) if (!currentRooms.has(id)) { this.templates.delete(id); this.fragments.delete(id) }
    const rooms: RoomGeometry[] = [], houses: House[] = [], pieces: Piece[] = []
    const seats: Record<string, Station> = Object.create(null) as Record<string, Station>, obstacles: Obstacle[] = [], paths: Point[][] = []
    const columns = Math.max(1, Math.ceil(input.rooms.length / 2)), lane = 768
    // Cover the entire common loop, including its lower 39-pixel shoulder. The former
    // 416-pixel square ended nine pixels before that shoulder and exposed a green seam.
    const square: Rect = { x: 64, y: 0, width: columns * lane, height: 512 }
    const ringTop = 48, ringBottom = 464, left = 96, right = square.x + square.width - 32
    if (this.loop?.columns !== columns) this.loop = { columns, path: [{ x: left, y: ringTop }, { x: right, y: ringTop }, { x: right, y: ringBottom }, { x: left, y: ringBottom }, { x: left, y: ringTop }] }
    paths.push(this.loop.path)
    const add = (item: Piece, solid = false): void => {
      pieces.push(item)
      if (!solid) return
      const meta = (art.sprites as Record<string, { collision?: number[][][] }>)[item.sprite]
      const polygons = meta?.collision
      if (polygons?.length) for (const polygon of polygons) {
        const world = polygon.map(p => ({ x: item.x + p[0]!, y: item.y + p[1]! }))
        obstacles.push({ ...boundsOf(world), kind: 'wall', polygon: world })
      } else obstacles.push({ x: item.x, y: item.y + item.height * .72, width: item.width, height: item.height * .28, kind: 'wall' })
    }
    const planting: Piece[] = []
    yield overview(input, styles, key)
    for (const [roomIndex, room] of input.rooms.entries()) {
      const signature = JSON.stringify([roomIndex, styles[roomIndex], room.occupants])
      const kept = this.fragments.get(room.id)
      if (kept?.key === signature) {
        rooms.push(...kept.rooms); houses.push(...kept.houses); pieces.push(...kept.pieces)
        Object.assign(seats, kept.seats); obstacles.push(...kept.obstacles); paths.push(...kept.paths); planting.push(...kept.planting)
        yield; continue
      }
      const before = { rooms: rooms.length, houses: houses.length, pieces: pieces.length, obstacles: obstacles.length, paths: paths.length, planting: planting.length }
      // Roster changes within a recorded group never resize the square or shift another lane.
      const column = Math.floor(roomIndex / 2), upper = roomIndex % 2 === 0, baseX = 144 + column * lane
      const template = templates[roomIndex]!, seed = stableHash(room.id)
      let first: House | undefined
      const { style, capacity } = template
      for (let start = 0, module = 0; start < room.occupants.length; start += capacity, module++) {
        this.houseComputations++
        const meta = houseCatalog[style]!, width = meta.canvasSize[0]!, height = meta.canvasSize[1]!
        const x = baseX + (624 - width) / 2, y = upper ? -480 - module * 480 + (416 - height) : 544 + module * 480
        const move = (p: number[]): Point => ({ x: x + p[0]!, y: y + p[1]! })
        const openings = meta.openings.map(poly => boundsOf(poly.map(move)))
        const doors = openings.map(o => ({ x: o.x + o.width / 2, y: o.y + o.height / 2 }))
        const occupants = room.occupants.slice(start, start + capacity)
        const origin = { x, y }, variant = this.compact ? variantGeometry(style) : null
        const house: House = { group: room.id, module, style, occupants, x, y, width, height, anchor: move(meta.groundAnchor), doors, openings,
          hitArea: this.compact ? [] : meta.hitArea.map(move), walkable: variant ? variant.walkable : meta.walkableAreas.map(poly => poly.map(move)), ...(variant ? { walkableOrigin: origin } : {}) }
        houses.push(house); first ??= house
        for (const layer of meta.layers) {
          const item = anchored(layer.sprite, move(layer.anchor), room.id, layer.layer)
          if (layer.depth !== null) item.depth = y + layer.depth
          add(item)
        }
        if (variant) for (const { polygon, bounds } of variant.collision) obstacles.push({ ...bounds, x: x + bounds.x, y: y + bounds.y, polygon, polygonOrigin: origin, kind: 'wall' })
        else for (const poly of meta.collisionPolygons) {
          const polygon = poly.map(move); obstacles.push({ ...boundsOf(polygon), polygon, kind: 'wall' })
        }
        // Every supplied doorway connects to the same loop. Lower homes exit to their south lane.
        const roadY = y + height + 48
        for (const door of doors) paths.push([door, { x: door.x, y: roadY }, { x: baseX - 48, y: roadY }, { x: baseX - 48, y: upper ? ringTop : ringBottom }])
        const count = occupants.length, studio = width === 416, long = width === 728
        for (let local = 0; local < count; local++) {
          const index = start + local, identity = room.occupants[index]!, slot = meta.deskSlots[local]!
          const column = local % 2, row = Math.floor(local / 2)
          // Keep the reviewed grid and clear standing bands. Native desk slots vary
          // between houses; front-row moles stand in the aisle, away from the sill.
          const foot = { x: x + slot.xy[0]! + 64, y: y + (studio ? 256 : long ? (style[0] === 'A' ? 256 : 224) : (style[0] === 'A' ? 240 : 208) + row * 128) }
          if (studio && column === 1) foot.x += 36
          if (!studio && !long && row === 1) foot.x = x + (column ? 384 : 240)
          foot.x = Math.round(foot.x / 16) * 16; foot.y = Math.round(foot.y / 16) * 16
          // Source desk slots are proposed art placements. Keep the existing
          // 176-pixel front approach band: A03's lower slots otherwise seal both doors.
          const dx = x + slot.xy[0]!, dy = y + Math.min(slot.xy[1]!, height - 176)
          const station: Station = { room: room.id, index, row: Math.floor(index / 2) + 1, column: index % 2 + 1, mobileRow: index + 1,
            foot, talk: { x: foot.x - 32, y: foot.y - (!long && row === 1 && style[0] === 'A' ? 32 : 0) }, desk: { x: dx, y: dy, width: slot.size[0]!, height: slot.size[1]! }, stool: { x: foot.x - 48, y: foot.y - 16, width: 56, height: 24 } }
          seats[identity] = station
          obstacles.push({ ...station.desk, kind: 'desk', station: identity }, { ...station.stool, kind: 'stool', station: identity })
          add(piece('worker-desk', dx, dy, room.id))
          for (const [sprite, ox, oy] of [['open-laptop', 61, -6], ['paper-stack', 106, 12], ['coffee-mug', 104, -4], ['desk-lamp', 5, -24]] as const) add(piece(sprite, dx + ox, dy + oy, room.id, 'object', dy + 73.1))
        }
        const family = style[0]!
        add(piece(family + (seed % 2 ? '27' : '28'), x + (width - 156) / 2, y + height - 104, room.id, 'floor'))
        add(piece(family + '29', x + width / 2 - 39, y + 16, room.id, 'back'))
        // Four-place homes have a central reference nook; studios keep the floor and entrance clear.
        if (count > 2 && !long) {
          add(piece('bookshelf', x + width / 2 - 44, y + 70, room.id), true)
          add(piece('A42', x + width / 2 - 39, y + 206, room.id), true)
        }
        add(piece('desk-plant', x + width / 2 - 14, y + (count > 2 && !long ? 160 : 86), room.id, 'object'), false)
        // Upright planting sits outside all house, doorway and seat hit rectangles.
        planting.push(piece(seed % 2 ? 'B56' : 'pine-tree', baseX + 636, y + 124, room.id))
        add(piece('B57', x + 12, y + height + 2, room.id, 'floor'))
        yield
      }
      if (first) {
        const own = houses.slice(before.houses), rect = boundsOf(own.flatMap(h => [{ x: h.x, y: h.y }, { x: h.x + h.width, y: h.y + h.height }]))
        rooms.push({ ...rect, id: room.id, door: first.doors[0]! })
      }
      this.fragments.set(room.id, { key: signature, rooms: rooms.slice(before.rooms), houses: houses.slice(before.houses), pieces: pieces.slice(before.pieces),
        seats: Object.fromEntries(room.occupants.map(id => [id, seats[id]!])), obstacles: obstacles.slice(before.obstacles), paths: paths.slice(before.paths), planting: planting.slice(before.planting) })
      yield
    }
    const guards = yield* VisibleIndex.build((function* () {
      for (const value of houses) yield { value: value as Rect, rect: value }
      for (const seat of Object.values(seats)) { const value = { x: seat.foot.x - 72, y: seat.foot.y - 140, width: 180, height: 196 }; yield { value, rect: value } }
    })(), true)
    yield
    for (const item of planting) {
      const overlaps = (r: Rect) => item.x < r.x + r.width && item.x + item.width > r.x && item.y < r.y + r.height && item.y + item.height > r.y
      if (!guards.query({ left: item.x, top: item.y, width: item.width, height: item.height }).some(overlaps)) add(item, true)
      yield
    }
    // A furnished common square repeats in very wide villages; it depends only on the layout.
    // The native pieces retain their size, so small villages use fewer pieces rather than a squeeze.
    for (let column = 0; column < columns; column += 3) {
      const width = Math.min(3, columns - column) * lane, center = square.x + column * lane + width / 2
      yield
      if (width < 1536) {
        for (const [id, offset, y] of [['tea-table', -260, 176], ['tea-set', -242, 169], ['kettle-stand', -124, 189], ['B64', -52, 298], ['message-board', 90, 142], ['B43', 240, 158], ['B54', 126, 340], ['A65', -180, 330], ['B38', 230, 354]] as const) add(piece(id, center + offset, y, null), id !== 'tea-set')
        for (const offset of [-284, 250]) add(piece('lantern', center + offset, 290, null), true)
        continue
      }
      const west = center - 760, east = center + 208
      for (const [family, x] of [['A', west], ['B', east]] as const) {
        for (const dx of [0, 104, 208]) add(piece(family + '30', x + dx, 106, null), true)
        add(piece(family + '32', x + 312, 132, null), true)
        for (const dx of [0, 208]) add(piece(family + '30', x + dx, 414, null), true)
        add(piece(family + '33', x + 104, 388, null), true)
      }
      for (const [id, offset, y, layer] of [
        ['B61', -700, 232, 'floor'], ['A62', -760, 192, 'object'],
        ['tea-table', -702, 246, 'object'], ['kettle-stand', -540, 259, 'object'],
        ['stool-sw', -730, 336, 'object'], ['stool-se', -580, 336, 'object'],
        ['B48', -428, 274, 'object'], ['B65', -634, 350, 'object'],
        ['B64', -52, 250, 'object'], ['B54', 84, 280, 'object'],
        ['message-board', 220, 194, 'object'], ['B43', 420, 208, 'object'],
        ['B42', 220, 328, 'object'], ['B52', 420, 348, 'object'],
        ['A65', -174, 158, 'object'], ['A46', 652, 162, 'object'],
        ['A58', 790, 276, 'object'], ['B59', 852, 366, 'object'],
        ['B38', 790, 188, 'object'], ['B40', 970, 306, 'object'],
        ['B60', 758, 382, 'floor'], ['B60', 832, 410, 'floor'],
      ] as const) add(piece(id, center + offset, y, null, layer), layer !== 'floor')
      // Tea cups share the table's top depth rather than disappearing underneath it.
      add(piece('tea-set', center - 684, 239, null, 'object', 316.1))
      for (const offset of [-804, -330, 140, 708]) add(piece('lantern', center + offset, offset === 140 ? 282 : 382, null), true)
      for (const offset of [-798, -396, 620, 1040]) add(piece('B57', center + offset, 410, null, 'floor'))
    }
    // Habitat at the outside edge never crosses a home, approach or person target.
    add(piece('A63', left - 180, 184, null), true)
    for (const house of houses) {
      add(piece('ground-fern', house.x + house.width - 40, house.y + house.height + 10, house.group, 'floor'))
      add(piece('daisies', house.x + 8, house.y + house.height - 14, house.group, 'floor'))
    }
    const road: RoadContour = { halfWidth: 39, rings: [], ends: [], faults: [] }, roadDrawing: Float64Array[] = []
    for (const path of paths) {
      let part = this.contours.get(path)
      if (!part) {
        const contour = roadContour([path], 39), packed = this.compact ? contour.rings.map(packRing) : []
        part = { road: this.compact ? { ...contour, rings: [], ends: [] } : contour, packed }
        this.contours.set(path, part); this.contourComputations++
      }
      road.rings.push(...part.road.rings); road.ends.push(...part.road.ends); road.faults.push(...part.road.faults); roadDrawing.push(...part.packed)
      yield
    }
    if (road.faults.length) throw new Error(`The road contour is invalid: ${road.faults.join('; ')}`)
    const core = boundsOf([...houses, square].flatMap(r => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y + r.height }]))
    const habitatGuards = guards
    const habitatRoad = yield* VisibleIndex.build((function* () { for (const value of road.rings) yield { value, rect: boundsOf(value) } })())
    const packedHabitat = yield* VisibleIndex.build((function* () { for (const value of roadDrawing) yield { value, rect: packedBounds(value) } })())
    const onRoad = (point: Point): boolean => {
      const pixel = { x: Math.floor(point.x) + .5, y: Math.floor(point.y) + .5 }
      const camera = { left: pixel.x, top: pixel.y, width: .001, height: .001 }
      return habitatRoad.query(camera).some(ring => inPolygon(pixel, ring)) || packedHabitat.query(camera).some(ring => inPackedRing(pixel, ring))
    }
    yield
    const habitat = (id: string, x: number, y: number, solid = false): void => {
      const item = piece(id, x, y, null, solid ? 'object' : 'floor')
      if (habitatGuards.query({ left: item.x - 12, top: item.y - 12, width: item.width + 24, height: item.height + 24 }).length) return
      if (onRoad({ x: item.x + item.width / 2, y: item.y + item.height }) || onRoad({ x: item.x, y: item.y + item.height })) return
      add(item, solid)
    }
    for (const [x, flip] of [[core.x - 252, 0], [core.x + core.width + 28, 1]] as const) {
      for (let y = core.y; y < core.y + core.height; y += 296) {
        const seed = stableHash(`${x}:${y}:${flip}`)
        habitat(seed % 3 === 0 ? 'tree-assembled' : 'pine-tree', x + (seed % 3 === 0 ? 0 : 64), y, true)
        habitat('berry-bush', x + 80, y + 190)
        habitat(seed % 2 ? 'B57' : 'mushroom-cluster', x + 164, y + 248)
        yield
      }
    }
    for (let x = core.x; x < core.x + core.width; x += 224) {
      const seed = stableHash(String(x))
      habitat(seed % 3 ? 'berry-bush' : 'pine-tree', x, core.y - 148, seed % 3 === 0)
      habitat(seed % 4 === 0 ? 'A58' : seed % 4 === 1 ? 'A63' : seed % 4 === 2 ? 'tree-stump' : 'B56', x, core.y + core.height + 46, true)
      habitat('B57', x + 114, core.y + core.height + 106)
      yield
    }
    const all = [...houses, square, ...pieces], bounds = boundsOf(all.flatMap(r => [{ x: r.x - 64, y: r.y - 64 }, { x: r.x + r.width + 64, y: r.y + r.height + 128 }]))
    this.computations++
    const result = { key, bounds, rooms, houses, square, pieces, seats, obstacles, road, bodyRadius: 16, paths, ...(this.compact ? { roadDrawing } : {}) }
    yield* prepareNavigation(result, this.current ?? undefined)
    this.current = result
    return result
  }
}

const cell = 96
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
/** Port of forestObstacleIndex and forestPointIsClear, including BOTH stool exceptions. */
export function obstacleIndex(layout: Layout): Map<string, Obstacle[]> {
  const index = new Map<string, Obstacle[]>()
  for (const obstacle of layout.obstacles) {
    for (let y = Math.floor(obstacle.y / cell); y <= Math.floor((obstacle.y + obstacle.height) / cell); y++) {
      for (let x = Math.floor(obstacle.x / cell); x <= Math.floor((obstacle.x + obstacle.width) / cell); x++) {
        const key = `${x},${y}`, held = index.get(key) ?? []
        held.push(obstacle); index.set(key, held)
      }
    }
  }
  return index
}
export function pointIsClear(layout: Layout, point: Point, free: readonly string[] = [], index?: Map<string, Obstacle[]>): boolean {
  const radius = layout.bodyRadius
  const body = { x: point.x - radius, y: point.y - radius / 3, width: radius * 2, height: radius / 3 }
  const blocks = (o: Obstacle) => !(o.kind === 'stool' && o.station !== undefined && free.includes(o.station)) && overlaps(body, o) && (!o.polygon || polygonTouchesRect(o.polygon, o.polygonOrigin ? { ...body, x: body.x - o.polygonOrigin.x, y: body.y - o.polygonOrigin.y } : body))
  if (!index) return !layout.obstacles.some(blocks)
  for (let y = Math.floor(body.y / cell); y <= Math.floor((body.y + body.height) / cell); y++) {
    for (let x = Math.floor(body.x / cell); x <= Math.floor((body.x + body.width) / cell); x++) {
      if (index.get(`${x},${y}`)?.some(blocks)) return false
    }
  }
  return true
}
/** One derived graph per immutable layout. It is never sent to or retained by the page. */
const navigation = new WeakMap<Layout, Navigation>()
export function* prepareNavigation(layout: Layout, previous?: Layout): Generator<void> {
  const graph = new Navigation(layout, previous ? navigation.get(previous) : undefined)
  yield* graph.build()
  navigation.set(layout, graph)
}
export function routeBetween(layout: Layout, from: string, to: string, turns = 80000): Route {
  const work = routeBetweenSteps(layout, from, to, turns)
  for (;;) { const next = work.next(); if (next.done) return next.value }
}
export function* routeBetweenSteps(layout: Layout, from: string, to: string, turns = 80000): Generator<void, Route> {
  if (!layout.seats[from] || !layout.seats[to] || !Number.isSafeInteger(turns) || turns < 0 || turns > 80000 || layout.road.faults.length) return { status: 'unavailable', points: [] }
  if (!navigation.has(layout)) yield* prepareNavigation(layout)
  return yield* navigation.get(layout)!.routeSteps(from, to, turns)
}

/** Exact room extents, before furniture/contours/navigation finish in later worker tasks. */
function overview(input: LayoutInput, styles: string[], key: string): Layout {
  const rooms: RoomGeometry[] = [], square = { x: 64, y: 0, width: Math.max(1, Math.ceil(input.rooms.length / 2)) * 768, height: 512 }
  input.rooms.forEach((room, i) => {
    const meta = houseCatalog[styles[i]!]!, width = meta.canvasSize[0]!, height = meta.canvasSize[1]!, count = Math.ceil(room.occupants.length / meta.deskSlots.length)
    if (!count) return
    const x = 144 + Math.floor(i / 2) * 768 + (624 - width) / 2, upper = i % 2 === 0
    const y = upper ? -480 - (count - 1) * 480 + 416 - height : 544
    rooms.push({ id: room.id, x, y, width, height: height + (count - 1) * 480, door: { x: x + width / 2, y: upper ? -64 : 544 + height } })
  })
  const bounds = boundsOf([...rooms, square].flatMap(r => [{ x: r.x - 64, y: r.y - 64 }, { x: r.x + r.width + 64, y: r.y + r.height + 128 }]))
  return { key, bounds, rooms, square, preview: true, houses: [], seats: {}, obstacles: [], pieces: [], bodyRadius: 16, road: { halfWidth: 39, rings: [], ends: [], faults: [] } }
}

export { routeIdle, routeIdleSteps } from './idle-route.ts'

export { visualBodyBounds } from "./visual-body.ts"

export { alphaWallSegments } from "./wall-alpha.ts"
