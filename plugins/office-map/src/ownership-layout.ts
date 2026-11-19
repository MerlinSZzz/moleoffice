// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { layoutKey, type Layout, type LayoutInput, type Point, type Station } from './geometry.ts'
import { anchored, piece, houseCatalog, stableHash, type House, type Piece } from './village.ts'
import { nativeTiles, secretariatFor, secretaryRoomFor, studioRoomFor } from './native-assembly.ts'
import type { OwnershipGroup } from './ownership.ts'
import type { VillageCell } from './village-layout.ts'
import { packRing, coalesceRoads } from './packed-road.ts'
import { walkRings, WALK_WIDTH } from './village-dressing.ts'
import type { Rect } from './viewport.ts'
import { ownershipWoodland } from './ownership-woodland.ts'
import { facilityPlan, type FacilityPlan } from './ownership-facilities.ts'
import { deskThingPieces, frontRow, WORK_X } from './desk-things.ts'
import { words } from './words.ts'
import { VisibleIndex } from './render-plan.ts'

const ring = (r: Rect): Point[] => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }]
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
interface Planned { group: OwnershipGroup; members: string[]; active: string[]; box: Rect; allocationHeight: number; columns: number; style: string; rowBottom: number; facilities?: FacilityPlan }
interface Area { id: string; label: string; zh: string; rooms: Planned[]; box: Rect }

function secretaryDesk(assembly: ReturnType<typeof secretariatFor>, index: number): Point {
  return assembly.desks[index] ?? { x: 80 + index % 3 * 288, y: 144 + Math.floor(index / 3) * 176 }
}
// Each secretary stands below the desk and faces it. In the two-person house the
// right-hand figure stands nearer the side wall, which leaves a body's width
// between the two figures above the doorway.
function secretaryFoot(desk: Point, index: number, count: number): Point {
  return { x: desk.x + (count === 2 && index === 1 ? WORK_X.second : WORK_X.middle), y: desk.y + 154 }
}

export function gatheringReserve(points: Point[]): Rect {
  const left = Math.min(...points.map(q => q.x)) - 140, top = Math.min(...points.map(q => q.y)) - 180
  const right = Math.max(...points.map(q => q.x)) + 140, bottom = Math.max(...points.map(q => q.y)) + 80
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function furnishingDoorway(b: Rect): Rect {
  return { x: b.x + b.width / 2 - 64, y: b.y + b.height - 160, width: 128, height: 160 }
}

const SQUARE_WIDTH = 1120
const SQUARE_HEIGHT = 480

export interface SquareFurnishing { sprite: string; x: number; y: number; layer: 'object' | 'floor'; depth?: number }
type SquareFixture = readonly [sprite: string, x: number, y: number, layer: SquareFurnishing['layer']]

// The tea corner and the hedge row stand on the left, the fountain and the stone
// wall on the right, one board on each side, and two level benches below. There
// is no planter box, no round rug and no turned piece. The list is fixed, not
// seeded, so every build draws the same square.
const SQUARE_FIXTURES: readonly SquareFixture[] = [
  ['A30', 124, 64, 'object'], ['A30', 228, 64, 'object'], ['A30', 332, 64, 'object'],
  ['B30', 724, 64, 'object'], ['B30', 828, 64, 'object'], ['B30', 932, 64, 'object'],
  ['message-board', 8, 120, 'object'],
  ['tea-table', 222, 132, 'object'], ['tea-set', 240, 125, 'object'], ['stool-sw', 192, 206, 'object'], ['stool-se', 314, 206, 'object'],
  ['lantern', 520, 140, 'object'], ['lantern', 654, 140, 'object'],
  ['B64', 828, 140, 'object'], ['message-board', 968, 120, 'object'],
  ['A29', 338, 284, 'object'], ['A29', 694, 284, 'object'],
  ['B57', 768, 222, 'floor'], ['B57', 940, 222, 'floor'],
]

/** Fixed square decorations in square-local coordinates, so the square never jumps between builds. */
export function squareFurnishings(): SquareFurnishing[] {
  const placed = SQUARE_FIXTURES.map(([sprite, x, y, layer]): SquareFurnishing => ({ sprite, x, y, layer }))
  const table = placed.find(part => part.sprite === 'tea-table')
  const teaSet = placed.find(part => part.sprite === 'tea-set')
  if (table && teaSet) teaSet.depth = piece('tea-table', table.x, table.y, null, 'object').depth + 2
  return placed
}

/** The roster names one agent twice. An agent has one seat, so no layout is made, and the page names the agent. */
export class DuplicateAgent extends Error {
  constructor(readonly identity: string) { super('Duplicate ownership identity') }
}

/** Current ownership is packed as an epoch (the coordinator agreed before the commit).
 * Each complete team is one room. Retired rows reserve sorted seat positions. */
export class OwnershipGeometryCache {
  private current: Layout | null = null
  computations = 0;
  *build(input: LayoutInput): Generator<Layout | void, Layout> {
    const roster = input.roster, ownership = roster?.ownership
    if (!roster || !ownership) throw Error('Ownership roster required')
    const key = layoutKey(input)
    if (this.current?.key === key) return this.current
    const members = new Map<string, string[]>(), retired = new Set<string>(), identities = new Set<string>()
    let secretaryGroup: string | null = null, secretaryCount = 0
    for (const group of ownership.groups) { if (group.kind === 'secretariat') secretaryGroup = group.id; yield }
    for (const p of roster.people) {
      if (identities.has(p.id)) throw new DuplicateAgent(p.id)
      identities.add(p.id)
      if (p.group === secretaryGroup) secretaryCount++
      const group = members.get(p.group) ?? []; group.push(p.id); members.set(p.group, group)
      if (p.retired || p.leftAt) retired.add(p.id)
      yield
    }
    const secretariatAssembly = secretaryRoomFor(secretaryCount)
    const plans: Planned[] = []
    for (const group of ownership.groups) {
      const held = (members.get(group.id) ?? []).sort(compare), count = held.length
      const columns = Math.min(28, Math.max(2, Math.ceil(Math.sqrt(count * 3))))
      const facilities = group.kind === 'secretariat' ? undefined : facilityPlan(held, group.id)
      const studio = count <= 1 && group.kind !== 'secretariat', style = studio ? 'B01' : 'B06'
      const width = group.kind === 'secretariat' ? secretariatAssembly?.width ?? 1040 : facilities!.width
      const height = group.kind === 'secretariat' ? secretariatAssembly.height : facilities!.height
      // Retain the former allocation for a compact room so its neighbours and
      // area labels do not move merely because the room's interior is denser.
      const allocationHeight = (count === 2 || count === 5) && facilities ? facilityPlan(held, group.id, false).height : height
      plans.push({ group, members: held, active: held.filter(id => !retired.has(id)), box: { x: 0, y: 0, width, height }, allocationHeight, columns, style, facilities, rowBottom: 0 }); yield
    }
    if (plans.reduce((n, p) => n + p.members.length, 0) !== identities.size) throw Error('Ownership identity has no room')
    const secretariat = plans.find(p => p.group.kind === 'secretariat')
    const areas: Area[] = ownership.secretaries.map(s => ({ id: s.id, label: s.label, zh: s.zh, rooms: [], box: { x: 0, y: 0, width: 0, height: 0 } }))
    const independent: Area = { id: 'independent', label: 'Independent / ownership unknown', zh: '独立角色／归属未知', rooms: [], box: { x: 0, y: 0, width: 0, height: 0 } }
    for (const p of plans) {
      if (p === secretariat) continue
      ;(areas.find(a => a.id === p.group.owner) ?? independent).rooms.push(p); yield
    }
    if (independent.rooms.length) areas.push(independent)
    for (const area of areas) {
      area.rooms.sort((a, b) => Number(b.group.kind === 'direct') - Number(a.group.kind === 'direct') || compare(a.group.createdAt, b.group.createdAt) || compare(a.group.id, b.group.id))
      const target = Math.max(2300, Math.sqrt(area.rooms.reduce((n, p) => n + (p.box.width + 80) * (p.allocationHeight + 200), 0)) * 1.35)
      let x = 96, y = 0, rowHeight = 0, right = 0, row: Planned[] = []
      const endRow = () => { for (const p of row) p.rowBottom = y + rowHeight + 72; row = [] }
      for (const p of area.rooms) {
        if (x > 96 && x + p.box.width + 96 > target) { endRow(); x = 96; y += rowHeight + 176; rowHeight = 0 }
        p.box.x = x; p.box.y = y; x += p.box.width + 80; right = Math.max(right, x - 80); rowHeight = Math.max(rowHeight, p.allocationHeight + (p.facilities?.apron ?? 0)); row.push(p); yield
      }
      endRow(); area.box.width = Math.max(768, right + 96); area.box.height = Math.max(400, y + rowHeight + 144)
    }
    const leftWidth = Math.max(768, ...areas.filter((_, i) => i % 2 === 0).map(a => a.box.width))
    const rightWidth = Math.max(768, ...areas.filter((_, i) => i % 2 === 1).map(a => a.box.width))
    const trunk = leftWidth + 160
    const [sleepWidth, sleepHeight] = houseCatalog.B03!.canvasSize as [number, number]
    const sleepingCount = Math.max(0, Math.floor(input.sleepingCount ?? 0))
    const houseCount = Math.max(1, Math.ceil(sleepingCount / 2))
    const leftSleepingX = trunk - 600 - 80 - sleepWidth
    const rightSleepingX = trunk + 600 + 160
    const firstOnLeft = leftSleepingX >= 16
    const sleepingX = firstOnLeft ? leftSleepingX : rightSleepingX
    const sleepStride = sleepWidth + 160
    const rightHouseCount = houseCount - Number(firstOnLeft)
    const width = Math.max(leftWidth + rightWidth + 320, rightHouseCount ? rightSleepingX + (rightHouseCount - 1) * sleepStride + sleepWidth + 128 : 0)
    // At a narrow whole-office view, leave room for a 21-pixel header and its gap.
    const headerPad = Math.max(200, Math.ceil(width * 23 / 338))
    for (const area of areas) { area.box.height += headerPad; for (const p of area.rooms) { p.box.y += headerPad; p.rowBottom += headerPad; yield } }
    // Leave the shared house a forecourt of its own between its door and the square.
    const start = (secretariat?.box.height ?? 0) + 816 + (secretariat ? 500 : 0), bottoms = [start, start]
    for (const [i, area] of areas.entries()) { const side = i % 2; area.box.x = side ? trunk + 80 : 128; area.box.y = bottoms[side]!; bottoms[side] = area.box.y + area.box.height + 128; yield }
    if (secretariat) { secretariat.box.x = width / 2 - secretariat.box.width / 2; secretariat.box.y = 128 }
    const bounds = { x: 0, y: 0, width, height: Math.max(...bottoms, 800) + 128 }
    const layout: Layout = { key, ownership: true, bounds, rooms: [], houses: [], pieces: [], seats: Object.create(null) as Layout['seats'], facilities: [], obstacles: [], paths: [], roadDrawing: [], planting: [], villages: [], squares: [],
      bodyRadius: 16, square: { x: trunk - 26, y: 0, width: 52, height: 1 }, road: { halfWidth: WALK_WIDTH / 2, rings: [], ends: [], faults: [] } }
    const square: Rect = { x: trunk - 600, y: start - 656, width: SQUARE_WIDTH, height: SQUARE_HEIGHT }
    layout.square = square; layout.squares!.push(square)
    layout.places = { play: [[208, 460], [592, 460], [880, 460]].map(([x, y]) => ({ x: square.x + x!, y: square.y + y! })), sleep: [], sleepingHouse: { x: 0, y: 0, width: 0, height: 0 } }
    // Keep the furnished square intact and add a clear apron beneath it for full-body walks. The
    // play row sits 20 px above the square's bottom after the 40 px move, so the apron is 80 px:
    // a body needs that room below the middle place to pass it on the way between the other two.
    layout.roadDrawing!.push(packRing(ring({ x: square.x, y: square.y, width: square.width, height: square.height + 80 })))
    // The fixed list draws the same square every build. Its pieces stand clear of
    // the three play places and the central trunk band.
    for (const furnishing of squareFurnishings()) {
      const part = piece(furnishing.sprite, square.x + furnishing.x, square.y + furnishing.y, null, furnishing.layer)
      if (furnishing.depth !== undefined) part.depth = square.y + furnishing.depth
      layout.pieces.push(part)
      if (furnishing.layer === 'object' && furnishing.sprite !== 'tea-set') layout.obstacles.push({ x: part.x, y: part.y + part.height * .72, width: part.width, height: part.height * .28, kind: 'wall' })
      yield
    }
    // The door point is where a body stands in the doorway. In the small secretary
    // house that is the middle of the entrance, which keeps a body there clear of
    // the left-hand secretary. With two secretaries it is not clear at the largest real
    // secretary size (.92): the left-hand one, standing at its foot, covers 6 x 7 px of
    // a body there. Their door point is 24 px lower, on the road just outside, where a
    // walk ends at either size a route-search step above or below it as well. The road
    // still starts at the middle of the entrance and runs straight through that point.
    // It is drawn from its corners alone, as before: a ring drawn at that point too left
    // 10 px of the road's edge a shade lighter.
    const entranceOf = (p: Planned): Point => ({ x: p.box.x + (p.facilities?.doorX ?? p.box.width / 2), y: p.box.y + p.box.height - (p === secretariat && secretaryCount <= 2 ? 13 : 24) })
    const doorOf = (p: Planned): Point => { const at = entranceOf(p); return p === secretariat && secretaryCount === 2 ? { x: at.x, y: at.y + 24 } : at }
    const forecourts: Rect[] = []
    const addPath = function* (points: Point[], drawn = points): Generator<void> {
      layout.paths!.push(points)
      for (const poly of walkRings({ points: drawn, width: WALK_WIDTH })) { layout.roadDrawing!.push(packRing(poly)); yield }
    }
    if (secretariat) {
      const start = entranceOf(secretariat), door = doorOf(secretariat), corners = [start, { x: width / 2, y: square.y }, { x: trunk, y: square.y }]
      yield* addPath(door.y === start.y ? corners : [start, door, ...corners.slice(1)], corners)
      const court = { x: door.x - 232, y: secretariat.box.y + secretariat.box.height + 38, width: 464, height: 434 }
      forecourts.push(court); layout.roadDrawing!.push(packRing(ring(court)))
      const gathering = { x: door.x, y: secretariat.box.y + secretariat.box.height + 250 }
      const table = anchored('tea-table', gathering, null), tea = anchored('tea-set', { x: gathering.x, y: gathering.y - 35 }, null, 'object')
      tea.depth = table.depth + 1
      layout.pieces.push(table, tea)
      layout.obstacles.push({ x: table.x, y: table.y + table.height * .72, width: table.width, height: table.height * .28, kind: 'wall' })
      layout.facilities!.push({ room: secretariat.group.id, index: 0, foot: { x: gathering.x - 140, y: gathering.y + 35 }, activity: 'reading', cluster: secretariat.group.id + '/gathering', outdoors: true, pose: 'carry' })
    }
    yield* addPath([{ x: trunk, y: square.y }, { x: trunk, y: bounds.height - 128 }])
    for (const [i, area] of areas.entries()) {
      const cell: VillageCell = { ...area.box, id: i, column: i % 2, row: Math.floor(i / 2), total: 0, signs: [], owner: area.id === 'independent' ? null : area.id,
        label: area.id === 'independent' ? area.label : `Secretary area · ${area.label}`, zh: area.id === 'independent' ? area.zh : `秘书区域 · ${area.zh}`, direct: 0 }
      layout.villages!.push(cell)
      const stem = area.box.x + 64, top = area.box.y + 64
      yield* addPath([{ x: trunk, y: top }, { x: stem, y: top }, { x: stem, y: area.box.y + area.box.height - 64 }])
      for (const p of area.rooms) {
        p.box.x += area.box.x; p.box.y += area.box.y; p.rowBottom += area.box.y
        yield* addPath([doorOf(p), { x: doorOf(p).x, y: p.rowBottom }, { x: stem, y: p.rowBottom }])
        cell.total += p.active.length; cell.signs.push({ id: p.group.id, label: p.group.label, token: stableHash(p.group.id), total: p.active.length }); yield
        if (p.group.kind === 'direct') cell.direct! += p.active.length
      }
    }
    if (secretariat) layout.villages!.push({ ...secretariat.box, label: 'Secretariat', zh: '秘书处', id: areas.length, column: 0, row: -1, total: secretariat.active.length, signs: [{ id: secretariat.group.id, label: secretariat.group.label, token: stableHash(secretariat.group.id), total: secretariat.active.length }] })
    yield { ...layout, preview: true, villages: [], pieces: [], rooms: plans.map(p => ({ ...p.box, id: p.group.id, door: { x: p.box.x + p.box.width / 2, y: p.box.y + p.box.height } })) }
    for (let index = 0; index < houseCount; index++) {
      const x = index === 0 ? sleepingX : rightSleepingX + (index - Number(firstOnLeft)) * sleepStride
      const sleeping: Rect = { x, y: square.y, width: sleepWidth, height: sleepHeight }
      const sleepingGroup = index === 0 ? 'sleeping-house' : `sleeping-house-${index + 1}`
      const sleepDoor = { x: sleeping.x + sleeping.width / 2, y: sleeping.y + sleeping.height - 24 }
      if (index === 0) layout.places!.sleepingHouse = sleeping
      const points = [190, sleeping.width - 190].map(x => ({ x: sleeping.x + x, y: sleeping.y + 240 }))
      layout.places!.sleep.push(...points)
      const sleepHouse: House = { ...sleeping, id: sleepingGroup, group: sleepingGroup, module: index, type: 'sleeping-house', owner: null,
        label: words.en.sleepingHouse, zh: words.zh.sleepingHouse, style: 'B03', occupants: [], anchor: sleepDoor, doors: [sleepDoor],
        openings: [{ x: sleepDoor.x - 39, y: sleeping.y + sleeping.height - 26, width: 78, height: 26 }], hitArea: ring(sleeping),
        walkable: [ring({ x: 52, y: 78, width: sleeping.width - 104, height: sleeping.height - 78 })], walkableOrigin: { x: sleeping.x, y: sleeping.y } }
      layout.houses.push(sleepHouse)
      for (const layer of houseCatalog.B03!.layers) { layout.pieces.push(piece(layer.sprite, sleeping.x, sleeping.y, sleepingGroup, layer.layer)); yield }
      for (const wall of [{ x: sleeping.x, y: sleeping.y + 64, width: sleeping.width, height: 20 },
        { x: sleeping.x, y: sleeping.y + 78, width: 48, height: sleeping.height - 94 },
        { x: sleeping.x + sleeping.width - 48, y: sleeping.y + 78, width: 48, height: sleeping.height - 94 },
        { x: sleeping.x, y: sleeping.y + sleeping.height - 16, width: sleeping.width / 2 - 39, height: 16 },
        { x: sleepDoor.x + 39, y: sleeping.y + sleeping.height - 16, width: sleeping.width / 2 - 39, height: 16 }]) { layout.obstacles.push({ ...wall, kind: 'wall' }); yield }
      // Back-wall furnishings leave both beds and the central approach clear.
      for (const [sprite, x] of [['bookshelf', (sleeping.width - piece('bookshelf', 0, 0, sleepingGroup).width) / 2], ['lantern', 0], ['message-board', 64]] as const) {
        const furnishing = piece(sprite, sleeping.x + x, sleeping.y, sleepingGroup)
        layout.pieces.push(furnishing)
        layout.obstacles.push({ x: furnishing.x, y: furnishing.y + furnishing.height * .72, width: furnishing.width, height: furnishing.height * .28, kind: 'wall' }); yield
      }
      for (const point of points) { layout.pieces.push(piece('sleep-bed', point.x - 80, point.y - 38, sleepingGroup, 'floor')); yield }
      yield* addPath([sleepDoor, { x: sleepDoor.x, y: square.y + square.height + 52 }, { x: trunk, y: square.y + square.height + 52 }, { x: trunk, y: square.y + square.height }])
    }
    for (const p of plans) {
      const { box: b, group: g } = p, door = doorOf(p)
      const village = p === secretariat ? areas.length : areas.findIndex(a => a.rooms.includes(p))
      const assembly = p === secretariat ? secretariatAssembly : p.style === 'B01' ? studioRoomFor(b.width) : null
      const entrance = assembly?.entrance ?? null
      const walkable = assembly?.walkable ?? [{ x: 48, y: 78, width: b.width - 96, height: b.height - 78 }]
      const house: House = { ...b, id: g.id, group: g.id, module: 0, type: g.kind, owner: g.owner, label: g.label, zh: g.zh, style: p.style, village,
        occupants: p.active, anchor: door, doors: [door], openings: [{ x: door.x - 64, y: door.y - 24, width: 128, height: 48 }], hitArea: ring(b), walkable: [ring({ x: 48, y: 78, width: b.width - 96, height: b.height - 78 })], walkableOrigin: { x: b.x, y: b.y } }
      house.walkable = walkable.map(ring)
      if (p.facilities?.apron) {
        // The forecourt is drawn and walked as road, and the path joins it to the
        // door and ends where the sand ends. The house's own floor stays inside its
        // rect, where every search looks for it.
        const courts = (p.facilities.forecourt ?? []).map(r => ({ ...r, x: b.x + r.x, y: b.y + r.y }))
        for (const court of courts) { forecourts.push(court); layout.roadDrawing!.push(packRing(ring(court))) }
        yield* addPath([{ x: door.x, y: door.y }, { x: door.x, y: b.y + b.height + 128 }, { x: b.x + 560, y: b.y + b.height + 128 }, { x: b.x + 560, y: Math.max(...courts.map(court => court.y + court.height)) - WALK_WIDTH / 2 }])
      }
      if (entrance) house.openings = [{ ...entrance, x: b.x + entrance.x, y: b.y + entrance.y }]
      layout.houses.push(house); layout.rooms.push({ ...b, id: g.id, door })
      const parts = layout.pieces
      if (assembly) {
        for (const part of assembly.parts) { parts.push({ ...piece(part.sprite, b.x + part.x, b.y + part.y, g.id, part.layer, b.y + part.depth), ...(part.crop ? { crop: part.crop, width: part.crop.width, height: part.crop.height } : {}), ...(part.fragments ? { fragments: part.fragments, width: b.width, height: b.height } : {}), ...(part.scale ? { scale: part.scale } : {}) }); yield }
      } else if (p === secretariat) {
        // Existing house only until the screened distinctive recipe arrives.
        for (const part of houseCatalog.A04!.layers) { parts.push(piece(part.sprite, b.x + (b.width - 728) / 2, b.y, g.id, part.layer)); yield }
      } else {
        const tile = function* (sprite: string, crop: Rect, target: Rect, layer: Piece['layer'], depth: number): Generator<void> {
          for (const part of nativeTiles(sprite, crop, target, g.id, layer, depth)) { parts.push(part); yield }
        }
        yield* tile('B06-floor', { x: 80, y: 104, width: 464, height: 234 }, { x: b.x + 52, y: b.y + 78, width: b.width - 104, height: b.height - 100 }, 'floor', b.y)
        yield* tile('B06-back', { x: 0, y: 0, width: 130, height: 78 }, { x: b.x, y: b.y, width: 130, height: 78 }, 'back', b.y + b.height)
        yield* tile('B06-back', { x: 130, y: 0, width: 364, height: 78 }, { x: b.x + 130, y: b.y, width: b.width - 260, height: 78 }, 'back', b.y + b.height)
        yield* tile('B06-back', { x: 494, y: 0, width: 130, height: 78 }, { x: b.x + b.width - 130, y: b.y, width: 130, height: 78 }, 'back', b.y + b.height)
        for (const x of [0, b.width - 52]) yield* tile('B06-back', { x: x ? 572 : 0, y: 78, width: 52, height: 338 }, { x: b.x + x, y: b.y + 78, width: 52, height: b.height - 78 }, 'front', b.y + b.height)
      }
      const frontY = entrance ? b.y + entrance.y : b.y + b.height - 16, opening = entrance?.width ?? 128
      for (const wall of [{ x: b.x, y: b.y + 64, width: b.width, height: 20 }, { x: b.x, y: b.y + 78, width: 48, height: frontY - b.y - 78 }, { x: b.x + b.width - 48, y: b.y + 78, width: 48, height: frontY - b.y - 78 },
        { x: b.x + 48, y: frontY, width: door.x - opening / 2 - (b.x + 48), height: 16 }, { x: door.x + opening / 2, y: frontY, width: b.x + b.width - 48 - (door.x + opening / 2), height: 16 }]) { layout.obstacles.push({ ...wall, kind: 'wall' }); yield }
      if (p.facilities) {
        for (const part of p.facilities.pieces) { parts.push({ ...part, x: part.x + b.x, y: part.y + b.y, depth: part.depth + b.y }); yield }
        for (const obstacle of p.facilities.obstacles) { layout.obstacles.push({ ...obstacle, x: obstacle.x + b.x, y: obstacle.y + b.y }); yield }
        for (const [id, local] of p.facilities.seats) {
          if (!retired.has(id)) {
            const move = <T extends Point>(point: T): T => ({ ...point, x: point.x + b.x, y: point.y + b.y })
            const station = { ...local, foot: move(local.foot), talk: move(local.talk), desk: move(local.desk), stool: move(local.stool) }
            layout.seats[id] = station; layout.obstacles.push({ ...station.stool, kind: 'stool', station: id })
          }
          yield
        }
        for (const place of p.facilities.places) { layout.facilities!.push({ ...place, foot: { x: place.foot.x + b.x, y: place.foot.y + b.y } }); yield }
        continue
      }
      const front = p === secretariat ? frontRow(p.members.map((_, index) => secretaryDesk(secretariatAssembly, index))) : []
      for (const [index, id] of p.members.entries()) {
        const column = index % p.columns, row = Math.floor(index / p.columns)
        const deskPoint = p === secretariat ? secretaryDesk(secretariatAssembly, index) : null
        const localFoot = deskPoint ? secretaryFoot(deskPoint, index, secretaryCount) : null
        const foot = localFoot ? { x: b.x + localFoot.x, y: b.y + localFoot.y } : { x: b.x + 104 + column * 80, y: b.y + (p.style === 'B01' ? 240 : 368 + row * 96) }
        const desk = deskPoint ? { x: b.x + deskPoint.x, y: b.y + deskPoint.y, width: 144, height: 73 } : { x: foot.x - 64, y: b.y + 104, width: 0, height: 0 }
        if (deskPoint) {
          parts.push(piece('worker-desk', desk.x, desk.y, g.id, 'object', desk.y + desk.height)); layout.obstacles.push({ ...desk, kind: 'desk', station: id })
          parts.push(...deskThingPieces(desk, g.id, index, foot.x - desk.x, front[index]))
        }
        if (retired.has(id)) { yield; continue }
        const visit = p === secretariat ? secretariatAssembly.talks?.[index] : undefined
        const talk = visit ? { x: b.x + visit.x, y: b.y + visit.y } : { x: foot.x - 32, y: foot.y + (p === secretariat ? -16 : 16) }
        const station: Station = { room: g.id, index, row: row + 1, column: column + 1, mobileRow: index + 1, foot, talk, desk, stool: { x: foot.x - (p === secretariat && secretaryCount === 2 && index === 1 ? 72 : 48), y: foot.y + 8, width: 24, height: 16 }, ...{ activity: 'desk', cluster: g.id + '/secretary-' + index, outdoors: false, pose: 'stand' } }
        layout.seats[id] = station; layout.obstacles.push({ ...station.stool, kind: 'stool', station: id }); yield
      }
    }
    // Furnish only free floor and wall space. The reserved identities, including retired
    // ones, protect the same body rectangles on every roster read.
    for (const p of plans) {
      const b = p.box, group = p.group.id
      // A room drawn from a recipe brings its own furniture, and each piece that
      // stands on the floor takes its base as an obstacle.
      const own = p.facilities?.furnishings ?? (p === secretariat ? secretariatAssembly.furnishings : undefined)
      if (own) {
        for (const part of own) {
          const furnished = { ...part, group, x: b.x + part.x, y: b.y + part.y, depth: b.y + part.depth, furnishing: true }
          layout.pieces.push(furnished)
          if (part.layer !== 'floor' && part.sprite !== 'tea-set') layout.obstacles.push({ x: furnished.x, y: furnished.y + part.height * .72, width: part.width, height: part.height * .28, kind: 'wall' })
          yield
        }
        continue
      }
      // In the native secretary hall, the front wall begins above the canvas edge.
      const furnishingBottom = p === secretariat ? secretariatAssembly.entrance.y : b.height - 16
      // A visitor stands at a desk's talk point and an idle agent at a facility place, so both are reserved like a seat.
      const reserved = p.facilities ? [...[...p.facilities.seats.values()].flatMap(s => [s.foot, s.talk]), ...p.facilities.places.map(place => place.foot)].map(at => ({ x: b.x + at.x - 59, y: b.y + at.y - 120, width: 118, height: 122 })) :
        p.members.map((_, index) => { const local = secretaryFoot(secretaryDesk(secretariatAssembly, index), index, secretaryCount); return { x: b.x + local.x - 59, y: b.y + local.y - 120, width: 118, height: 122 } })
      // A stool stands below the body rectangle, so it needs its own reservation:
      // a table placed without it can sit on somebody's seat.
      for (const id of p.members) {
        const seat = layout.seats[id]
        if (seat) { reserved.push(seat.stool); if (seat.desk.width) reserved.push(seat.desk) }
        yield
      }
      const gatherings = new Map<string, Point[]>()
      for (const place of p.facilities?.places ?? []) if (!place.outdoors && (place.activity === 'reading' || place.activity === 'garden')) {
        const points = gatherings.get(place.cluster) ?? []; points.push(place.foot); gatherings.set(place.cluster, points); yield
      }
      for (const points of gatherings.values()) {
        const reserve = gatheringReserve(points)
        reserved.push({ ...reserve, x: b.x + reserve.x, y: b.y + reserve.y }); yield
      }
      const occupied = layout.pieces.filter(part => part.group === group && !/^\w+-(floor|back|front)$/.test(part.sprite))
      const overlap = (a: Rect, c: Rect) => a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height
      const doorway = furnishingDoorway(b)
      const addFurnishing = function* (sprite: string, layer: Piece['layer'], wall: boolean): Generator<void, boolean> {
        const probe = piece(sprite, 0, 0, group, layer), columns = Math.max(1, Math.floor((b.width - 104 - probe.width) / 16) + 1)
        const start = stableHash(group + sprite) % columns, maxY = wall ? 24 : furnishingBottom - probe.height
        for (let y = wall ? 4 : 84; y <= maxY; y += 16) for (let i = 0; i < columns; i++) {
          const x = 52 + ((start + i) % columns) * 16, part = piece(sprite, b.x + x, b.y + y, group, layer)
          if (!(layer !== 'floor' && overlap(doorway, part)) && !reserved.some(r => overlap(r, part)) && !occupied.some(r => overlap(r, part))) {
            const furnished = { ...part, furnishing: true }; layout.pieces.push(furnished); occupied.push(furnished)
            if (layer !== 'floor') layout.obstacles.push({ x: part.x, y: part.y + part.height * .72, width: part.width, height: part.height * .28, kind: 'wall' })
            return true
          }
          yield
        }
        return false
      }
      // The table and its bench are one group, kept off the door corridor and
      // every reserved body. A room with a free side takes them in a row; a room
      // whose only free strip is narrow takes the bench below the table instead.
      const addTeaGroup = function* (): Generator<void, boolean> {
        const table = piece('tea-table', 0, 0, group), bench = piece('A29', 0, 0, group), gap = 16
        const freeAt = (area: Rect) => !overlap(doorway, area) && !reserved.some(r => overlap(r, area)) && !occupied.some(r => overlap(r, area))
        const place = function* (sprite: string, x: number, y: number): Generator<void> {
          const part = piece(sprite, x, y, group)
          if (sprite === 'tea-set') part.depth = y + table.height + 1
          const furnished = { ...part, furnishing: true }; layout.pieces.push(furnished); occupied.push(furnished)
          if (sprite !== 'tea-set') layout.obstacles.push({ x: part.x, y: part.y + part.height * .72, width: part.width, height: part.height * .28, kind: 'wall' })
          yield
        }
        const variants = [
          { width: table.width + gap + bench.width, height: Math.max(table.height, bench.height), pieces: [['tea-table', 0, 0], ['tea-set', 35, 0], ['A29', table.width + gap, 0]] as const },
          { width: Math.max(table.width, bench.width), height: table.height + gap + bench.height, pieces: [['tea-table', 0, 0], ['tea-set', 35, 0], ['A29', 0, table.height + gap]] as const },
        ]
        for (const variant of variants) {
          const columns = Math.max(1, Math.floor((b.width - 104 - variant.width) / 16) + 1), start = stableHash(group + 'tea-group') % columns
          for (let y = furnishingBottom - variant.height; y >= b.height / 2; y -= 16) for (let i = 0; i < columns; i++) {
            const x = 52 + ((start + i) % columns) * 16, area = { x: b.x + x, y: b.y + y, width: variant.width, height: variant.height }
            if (!freeAt(area)) { yield; continue }
            for (const [sprite, dx, dy] of variant.pieces) yield* place(sprite, area.x + dx, area.y + dy)
            return true
          }
        }
        // A five-desk room has a stool in each bottom corner. The table then fits
        // in the central gap above the door, and the bench is placed at the
        // nearest free spot within a readable step of it.
        const tableColumns = Math.max(1, Math.floor((b.width - 104 - table.width) / 16) + 1), tableStart = stableHash(group + 'tea-table') % tableColumns
        const benchColumns = Math.max(1, Math.floor((b.width - 104 - bench.width) / 16) + 1), benchStart = stableHash(group + 'tea-bench') % benchColumns
        for (let y = furnishingBottom - table.height; y >= b.height / 2; y -= 16) for (let i = 0; i < tableColumns; i++) {
          const x = 52 + ((tableStart + i) % tableColumns) * 16, area = { x: b.x + x, y: b.y + y, width: table.width, height: table.height }
          if (!freeAt(area)) { yield; continue }
          const middle = { x: area.x + table.width / 2, y: area.y + table.height / 2 }
          for (let lower = furnishingBottom - bench.height; lower >= b.height / 2; lower -= 16) for (let j = 0; j < benchColumns; j++) {
            const px = 52 + ((benchStart + j) % benchColumns) * 16, around = { x: b.x + px, y: b.y + lower, width: bench.width, height: bench.height }
            if (Math.hypot(around.x + bench.width / 2 - middle.x, around.y + bench.height / 2 - middle.y) > 200 || overlap(around, area) || !freeAt(around)) { yield; continue }
            yield* place('tea-table', area.x, area.y)
            yield* place('tea-set', area.x + 35, area.y)
            yield* place('A29', around.x, around.y)
            return true
          }
        }
        return false
      }
      yield* addFurnishing('message-board', 'back', true)
      yield* addFurnishing('bookshelf', 'object', true)
      // The table group is placed before the optional floor rugs, so a room keeps
      // its table even when that is the only free floor left.
      if (p.members.length >= 2 && p.members.length <= 8) yield* addTeaGroup()
      yield* addFurnishing(['A27', 'A28', 'B28'][stableHash(group) % 3]!, 'floor', false)
      yield* addFurnishing('desk-plant', 'object', false)
      if (b.width * b.height >= 300000) {
        // The secretary hall takes no floor bookshelf: in the hall of 6 to 14 one stood
        // below the front row and shut a secretary in its corner.
        if (p !== secretariat) yield* addFurnishing('bookshelf', 'object', false)
        yield* addFurnishing('B28', 'floor', false)
        yield* addFurnishing('A29', 'object', false)
      }
      // A tea nook is optional: reserve the entire set and the doorway corridor
      // before placing it, rather than squeezing stools into an occupied group.
      let teaPlaced = false
      // A desk's worker walks out past its foot, so the nook also keeps off a body-wide lane 160 px deep below each
      // foot: a nook there can shut the worker in.
      const lanes = [...p.facilities?.seats.values() ?? []].filter(seat => seat.desk.width > 0).map(seat => ({ x: b.x + seat.foot.x - 59, y: b.y + seat.foot.y, width: 118, height: 160 }))
      for (let y = 100; y + 150 <= furnishingBottom - 16 && !teaPlaced; y += 32) for (let x = 52; x + 250 <= b.width - 52; x += 32) {
        const nook = { x: b.x + x, y: b.y + y, width: 250, height: 150 }, middle = b.x + b.width / 2
        if (nook.x < middle + 48 && nook.x + nook.width > middle - 48) { yield; continue }
        if (reserved.some(r => overlap(r, nook)) || occupied.some(r => overlap(r, nook)) || lanes.some(r => overlap(r, nook))) { yield; continue }
        for (const [sprite, dx, dy] of [['tea-table', 67, 0], ['tea-set', 104, 0], ['stool-sw', 0, 90], ['stool-se', 182, 90]] as const) {
          const part = piece(sprite, nook.x + dx, nook.y + dy, group)
          if (sprite === 'tea-set') part.depth = nook.y + 71
          const furnished = { ...part, furnishing: true }; layout.pieces.push(furnished)
          if (sprite !== 'tea-set') layout.obstacles.push({ x: part.x, y: part.y + part.height * .72, width: part.width, height: part.height * .28, kind: 'wall' })
          yield
        }
        teaPlaced = true; break
      }
    }
    // Forecourt decorations are planned before all adjoining roads exist. Keep their
    // full artwork clear of the finished paths, just as the woodland pass does.
    const roadBands: { value: Rect; rect: Rect }[] = []
    for (const path of layout.paths!) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!
      const rect = { x: Math.min(a.x, b.x) - 28, y: Math.min(a.y, b.y) - 28, width: Math.abs(a.x - b.x) + 56, height: Math.abs(a.y - b.y) + 56 }
      roadBands.push({ value: rect, rect })
      yield
    }
    const roadIndex = yield* VisibleIndex.build(roadBands)
    const outdoorPlants = new Set(['berry-bush', 'B57', 'ground-fern', 'daisies'])
    const clearPieces: Piece[] = []
    for (const p of layout.pieces) {
      if (p.group !== null || !outdoorPlants.has(p.sprite) || !(yield* roadIndex.querySteps({ left: p.x, top: p.y, width: p.width, height: p.height })).length) clearPieces.push(p)
      yield
    }
    layout.pieces = clearPieces
    // One push per plant. Spreading tens of thousands of plants into one call passes each as an
    // argument, and a browser worker's stack holds fewer of them than its main thread's.
    // The woodland keeps off the paths; it is kept here off the forecourts, where they
    // are known, and off every body standing at their edge. The largest standing body
    // reaches about 80 px above its foot and 44 px to each side.
    const reach = forecourts.map(court => ({ x: court.x - 48, y: court.y - 96, width: court.width + 96, height: court.height + 104 }))
    for (const plant of yield* ownershipWoodland(layout)) if (!reach.some(court => plant.x < court.x + court.width && plant.x + plant.width > court.x && plant.y < court.y + court.height && plant.y + plant.height > court.y)) layout.pieces.push(plant)
    layout.roadDrawing = yield* coalesceRoads(layout.roadDrawing!)
    this.current = layout; this.computations++
    return layout
  }
}
