// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { compactPlanting } from './compact-scenery.ts'
import art from '../assets/village-catalog.json'
import { layoutKey, type Layout, type LayoutInput, type Obstacle, type Point, type RoomGeometry, type Station } from './geometry.ts'
import { boundsOf, houseCatalog, type House, type Piece } from './village.ts'
import { layoutVillageSteps, villagePieces, VILLAGE, type VillageLayout } from './village-layout.ts'
import { villageWalks, walkRings, WALK_WIDTH } from './village-dressing.ts'
import { packRing, coalesceRoads } from './packed-road.ts'
import type { Rect } from './viewport.ts'
import { OwnershipGeometryCache } from './ownership-layout.ts'

const ring = (r: Rect): Point[] => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }]
const furniture = new Set(['tea-table', 'stool-sw', 'stool-se', 'A62', 'B48', 'B64', 'B54', 'message-board', 'B43', 'B42', 'B52', 'A65', 'A58', 'B59', 'B38', 'B40', 'lantern', 'tree-assembled', 'pine-tree'])

/** One completed generation only. The worker consumes every allocation/art boundary;
 * the synchronous study wrapper never runs on the page or in this adapter. */
export class VillageGeometryCache {
  private ownership = new OwnershipGeometryCache()
  private current: Layout | null = null
  computations = 0;
  *build(input: LayoutInput): Generator<Layout | void, Layout> {
    if (!input.roster) throw Error('Village roster required')
    if (input.roster.ownership) return yield* this.ownership.build(input)
    const key = layoutKey(input)
    if (this.current?.key === key) return this.current
    const village = yield* layoutVillageSteps(input.roster)
    const rooms: RoomGeometry[] = [], houses: House[] = [], pieces: Piece[] = [], obstacles: Obstacle[] = [], paths: Point[][] = [], roadDrawing: Float64Array[] = []
    const seats: Record<string, Station> = Object.create(null) as Layout['seats']
    const square = village.squares[0] ?? { x: 0, y: 0, width: 1, height: 1 }
    const layout: Layout = { key, bounds: { ...village.bounds, width: Math.max(1, village.bounds.width), height: Math.max(1, village.bounds.height) },
      rooms, houses, pieces, planting: [], obstacles, seats, paths, roadDrawing, square, squares: village.squares, villages: village.villages,
      bodyRadius: 16, road: { halfWidth: WALK_WIDTH / 2, rings: [], ends: [], faults: [] } }
    // Preview has bounded metadata only; the final drawing is sent in chunks.
    yield { ...layout, preview: true, villages: [], squares: [], rooms: village.villages.map(v => ({ ...v, id: `V${v.id + 1}`, door: { x: v.x + 845, y: v.y + 897 } })) }
    const byGroup = new Map<string, RoomGeometry>(), modules = new Map<string, number>()
    for (const home of village.homes) {
      if (home.group === null) { yield; continue }
      const meta = houseCatalog[home.style]!, move = (p: number[]): Point => ({ x: home.x + p[0]!, y: home.y + p[1]! })
      const module = modules.get(home.group) ?? 0; modules.set(home.group, module + 1)
      const occupants = home.members.filter((id): id is string => id !== null && !!village.seats[id])
      const house: House = { id: home.id, village: home.village, x: home.x, y: home.y, width: home.width, height: home.height,
        group: home.group, module, style: home.style, occupants, anchor: move(meta.groundAnchor), doors: home.doors,
        openings: meta.openings.map(poly => boundsOf(poly.map(move))), hitArea: [],
        walkable: meta.walkableAreas.map(poly => poly.map(p => ({ x: p[0]!, y: p[1]! }))), walkableOrigin: { x: home.x, y: home.y } }
      houses.push(house)
      for (const poly of meta.collisionPolygons) {
        const polygon = poly.map(p => ({ x: p[0]!, y: p[1]! })), bounds = boundsOf(polygon)
        obstacles.push({ ...bounds, x: home.x + bounds.x, y: home.y + bounds.y, kind: 'wall', polygon, polygonOrigin: { x: home.x, y: home.y } })
      }
      let room = byGroup.get(home.group)
      if (!room) { room = { id: home.group, x: home.x, y: home.y, width: home.width, height: home.height, door: home.doors[0]! }; byGroup.set(home.group, room); rooms.push(room) }
      else {
        const right = Math.max(room.x + room.width, home.x + home.width), bottom = Math.max(room.y + room.height, home.y + home.height)
        room.x = Math.min(room.x, home.x); room.y = Math.min(room.y, home.y); room.width = right - room.x; room.height = bottom - room.y
      }
      // Every drawn desk is solid, including an empty or reserved place. An occupied desk names its station.
      const deskOf = new Map(occupants.map(id => [village.seats[id]!.index, id]))
      meta.deskSlots.forEach((slot, index) => {
        const station = deskOf.get(index)
        obstacles.push({ x: home.x + slot.xy[0]!, y: home.y + Math.min(slot.xy[1]!, home.height - 176), width: slot.size[0]!, height: slot.size[1]!, kind: 'desk', ...(station === undefined ? {} : { station }) })
      })
      for (const id of occupants) {
        const seat = village.seats[id]!, foot = seat.foot, row = Math.floor(seat.index / 2)
        // Local search grids start at the supplied native seat. A village origin
        // need not be a multiple of sixteen; geometry must never snap the home.
        const station: Station = { room: home.group, index: seat.index, row: row + 1, column: seat.index % 2 + 1, mobileRow: seat.index + 1,
          foot, talk: { x: foot.x - 32, y: foot.y - (row === 1 && home.style[0] === 'A' ? 32 : 0) },
          desk: seat.desk, stool: { x: foot.x - 48, y: foot.y - 16, width: 56, height: 24 } }
        seats[id] = station
        obstacles.push({ ...station.stool, kind: 'stool', station: id })
      }
      yield
    }
    for (const v of village.villages) {
      // The approved six-home art is generated one village at a time, not in one
      // whole-office map/filter pass. The returned arrays contain native pieces.
      const local: VillageLayout = { ...village, plots: village.plots.slice(v.id * 6, v.id * 6 + 6), homes: village.plots.slice(v.id * 6, v.id * 6 + 6).filter(h => h.built) }
      const planting: Piece[] = []
      for (const item of villagePieces(local, v.id)) {
        if (item.decoration) planting.push(item)
        else pieces.push(item)
        // Furniture's supplied collision polygons protect walks through squares.
        const collision = (art.sprites as Record<string, { collision?: number[][][] }>)[item.sprite]?.collision
        if (item.layer === 'object' && item.sprite !== 'worker-desk') for (const poly of collision ?? []) {
          const scale = item.scale ?? 1
          const polygon = poly.map(p => ({ x: p[0]! * scale, y: p[1]! * scale })), bounds = boundsOf(polygon)
          obstacles.push({ ...bounds, x: item.x + bounds.x, y: item.y + bounds.y, kind: 'wall', polygon, polygonOrigin: { x: item.x, y: item.y } })
        }
        if (!collision?.length && furniture.has(item.sprite)) obstacles.push({ x: item.x, y: item.y + item.height * .72, width: item.width, height: item.height * .28, kind: 'wall' })
        yield
      }
      layout.planting!.push(...compactPlanting(planting, pieces.length))
      for (const walk of villageWalks(local.plots, v)) {
        paths.push(walk.points)
        for (const polygon of walkRings(walk)) { roadDrawing.push(packRing(polygon)); yield }
      }
      yield
    }
    const cells = new Set(village.villages.map(v => `${v.column},${v.row}`))
    for (const v of village.villages) {
      if (cells.has(`${v.column + 1},${v.row}`)) paths.push([{ x: v.x + 2418, y: v.y + 897 }, { x: v.x + VILLAGE.width + 130, y: v.y + 897 }])
      if (cells.has(`${v.column},${v.row + 1}`)) paths.push([{ x: v.x + 845, y: v.y + 1651 }, { x: v.x + 845, y: v.y + VILLAGE.height + 676 }])
      yield
    }
    // The common square is grass. Only inter-cell ports add earth outside local walks.
    for (const area of village.paths.filter(p => p.id.startsWith('east-') || p.id.startsWith('south-'))) { roadDrawing.push(packRing(ring(area))); yield }
    layout.roadDrawing = yield* coalesceRoads(roadDrawing)
    this.current = layout; this.computations++
    return layout
  }
}
