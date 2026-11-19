// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { dressVillage, WALK_WIDTH } from './village-dressing.ts'
import { houseCatalog, piece, stableHash, type Piece } from './village.ts'
import type { Point } from './geometry.ts'
import type { Rect } from './viewport.ts'
import type { Ownership } from './ownership.ts'

/** Pure village allocation, consumed incrementally by the worker.
 * Times are stable, comparable roster timestamps, not the time of this read.
 * Retain departed rows: removing history cannot reproduce an immutable allocation.
 */
export interface VillageGroup { id: string; label: string; createdAt: string; endedAt?: string }
export interface VillagePerson { id: string; group: string; createdAt: string; leftAt?: string; retired?: boolean }
export interface VillageRoster { groups: readonly VillageGroup[]; people: readonly VillagePerson[]; ownership?: Ownership }
export const VILLAGE = { width: 2548, height: 1794, pathWidth: WALK_WIDTH, homes: 6, capacity: 18 } as const
export const VILLAGE_STYLES = ['A03', 'B03', 'A01', 'A03', 'B01', 'B02'] as const
export const LAYOUT_TASK_BUDGET_MS = 50
export interface TeamSign { id: string; label: string; token: number; total: number }
export interface VillagePlot extends Rect {
  id: string; village: number; slot: number; style: string; capacity: number
  group: string | null; built: boolean; members: (string | null)[]; doors: Point[]
}
export interface VillageSeat { person: string; group: string; home: string; village: number; index: number; foot: Point; desk: Rect }
export interface VillageSquare extends Rect { id: string; village: number }
export interface VillagePath extends Rect { id: string }
export interface VillageCell extends Rect { id: number; column: number; row: number; total: number; signs: TeamSign[]; label?: string; zh?: string; owner?: string | null; direct?: number }
export interface Arrival { person: string; group: string; home: string; index: number; newHome: boolean }
export interface VillageLayout {
  villages: VillageCell[]; squares: VillageSquare[]; plots: VillagePlot[]; homes: VillagePlot[]
  seats: Record<string, VillageSeat>; paths: VillagePath[]; bounds: Rect; arrivals: Arrival[]
}

/** Clockwise square spiral, starting south. Every prefix is connected; coordinates
 * depend only on the ordinal. No count, viewport or later arrival can move a cell.
 */
export function villageCells(count: number): { column: number; row: number }[] {
  const result: { column: number; row: number }[] = []
  let column = 0, row = 0, length = 1, direction = 0
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const
  if (count > 0) result.push({ column, row })
  while (result.length < count) {
    for (let twice = 0; twice < 2 && result.length < count; twice++) {
      const [dx, dy] = directions[direction++ % 4]!
      for (let step = 0; step < length && result.length < count; step++) {
        column += dx; row += dy; result.push({ column, row })
      }
    }
    length++
  }
  return result
}

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const squareAt = (x: number, y: number): Rect => ({ x: x + 104, y: y + 650, width: 2340, height: 416 })
const template = VILLAGE_STYLES.map((style, slot) => {
  const meta = houseCatalog[style]!, width = meta.canvasSize[0]!, height = meta.canvasSize[1]!
  const x = 156 + slot % 3 * 780 + (624 - width) / 2
  const y = slot < 3 ? 572 - height : 1560 - height
  const doors = meta.openings.map(poly => ({ x: x + (Math.min(...poly.map(p => p[0]!)) + Math.max(...poly.map(p => p[0]!))) / 2, y: y + height }))
  return { style, x, y, width, height, doors, capacity: meta.deskSlots.length }
})

/** Split the small, fixed village road union once. Output rectangles have disjoint
 * interiors, including at corners and junctions. Touching edges are intentional.
 */
function disjointRoads(rectangles: Rect[]): Rect[] {
  const xs = [...new Set(rectangles.flatMap(r => [r.x, r.x + r.width]))].sort((a, b) => a - b)
  const ys = [...new Set(rectangles.flatMap(r => [r.y, r.y + r.height]))].sort((a, b) => a - b)
  const result: Rect[] = []
  for (let yi = 0; yi + 1 < ys.length; yi++) {
    let start: number | null = null
    for (let xi = 0; xi + 1 < xs.length; xi++) {
      const cell = { x: xs[xi]!, y: ys[yi]!, width: xs[xi + 1]! - xs[xi]!, height: ys[yi + 1]! - ys[yi]! }
      const covered = rectangles.some(r => intersects(r, cell))
      if (covered && start === null) start = cell.x
      if (start !== null && (!covered || xi === xs.length - 2)) {
        const end = covered ? cell.x + cell.width : cell.x
        result.push({ x: start, y: cell.y, width: end - start, height: cell.height }); start = null
      }
    }
  }
  // Adjacent strips with the same horizontal span are one rectangle. Keeping
  // the split at unrelated door heights would add four objects per village.
  const merged: Rect[] = []
  for (const r of result) {
    const prior = merged.find(p => p.x === r.x && p.width === r.width && p.y + p.height === r.y)
    if (prior) prior.height += r.height
    else merged.push(r)
  }
  return merged
}
const unitRoads = disjointRoads([
  { x: 65, y: 1625, width: 2418, height: 52 },
  ...[65, 819, 1599, 2431].map(x => ({ x, y: 1066, width: 52, height: 559 })),
  ...template.flatMap((h, slot) => h.doors.map(d => ({ x: d.x - 26, y: d.y, width: 52, height: (slot < 3 ? 650 : 1625) - d.y }))),
])

/** Replay arrivals and departures, then project fixed plots. All allocation is
 * mechanical decoration; no reporting relationship or group is inferred here.
 * Adding later events is stable. Rewriting old timestamps/membership is a new
 * layout epoch, as is dropping tombstones; neither has a stability promise.
 */
export function layoutVillages(input: VillageRoster): VillageLayout {
  const steps = layoutVillageSteps(input)
  for (;;) { const next = steps.next(); if (next.done) return next.value }
}

/** Pure incremental form for the worker's existing bounded scheduler.
 * Each row, arrival, cell and home is a cancellation/yield boundary. The sync
 * wrapper is useful for tests and drawings; it is not a task-budget guarantee.
 */
export function* layoutVillageSteps(input: VillageRoster): Generator<void, VillageLayout> {
  const groups = new Map<string, VillageGroup>(), people = new Map<string, VillagePerson>()
  const events: { at: string; id: string; kind: 'arrive' | 'leave' | 'end' }[] = []
  for (const group of input.groups) {
    if (!group.id || !group.createdAt || groups.has(group.id) || group.endedAt !== undefined && group.endedAt <= group.createdAt) throw Error('Invalid or duplicate group lifecycle')
    groups.set(group.id, group)
    if (group.endedAt) events.push({ at: group.endedAt, id: group.id, kind: 'end' })
    yield
  }
  for (const person of input.people) {
    const group = groups.get(person.group)
    if (!person.id || !person.createdAt || people.has(person.id) || !group || person.createdAt < group.createdAt || group.endedAt !== undefined && person.createdAt >= group.endedAt || person.leftAt !== undefined && person.leftAt <= person.createdAt) throw Error('Invalid or duplicate person lifecycle')
    people.set(person.id, person); events.push({ at: person.createdAt, id: person.id, kind: 'arrive' })
    if (person.leftAt) events.push({ at: person.leftAt, id: person.id, kind: 'leave' })
    yield
  }
  const phase = { end: 0, leave: 1, arrive: 2 }
  events.sort((a, b) => compare(a.at, b.at) || phase[a.kind] - phase[b.kind] || compare(a.id, b.id))
  yield
  // A precomputed prefix has no reserved land: only claimed cells enter output.
  const coordinates = villageCells(Math.ceil(input.people.length / 6))
  const plots: VillagePlot[] = [], villages: VillageCell[] = [], squares: VillageSquare[] = [], paths: VillagePath[] = []
  const byGroup = new Map<string, VillagePlot[]>(), available = new Map<string, VillagePlot[]>(), groupVillages = new Map<string, Set<number>>()
  // Only a dated departure needs an identity-to-plot index. Current members
  // already live in their home slots; indexing all of them doubled allocations.
  const free = new Set<VillagePlot>(), departures = new Map<string, { home: VillagePlot; index: number }>()
  const arrivals: Arrival[] = []
  const addVillage = () => {
    const id = villages.length, cell = coordinates[id]!, x = cell.column * VILLAGE.width, y = cell.row * VILLAGE.height
    villages.push({ id, ...cell, x, y, width: VILLAGE.width, height: VILLAGE.height, total: 0, signs: [] })
    squares.push({ ...squareAt(x, y), id: `square-${id}`, village: id })
    template.forEach((h, slot) => {
      const home: VillagePlot = { x: h.x + x, y: h.y + y, width: h.width, height: h.height, style: h.style, capacity: h.capacity,
        id: `home-${id}-${slot}`, village: id, slot, group: null, built: false,
        doors: h.doors.map(d => ({ x: d.x + x, y: d.y + y })), members: Array.from({ length: h.capacity }, () => null) }
      plots.push(home); free.add(home)
    })
    unitRoads.forEach((r, i) => paths.push({ x: r.x + x, y: r.y + y, width: r.width, height: r.height, id: `path-${id}-${i}` }))
  }
  for (const event of events) {
    if (event.kind === 'leave') {
      const held = departures.get(event.id)
      if (held) {
        const queue = available.get(held.home.group!)!
        if (!queue.includes(held.home)) {
          const own = byGroup.get(held.home.group!)!
          queue.push(held.home); queue.sort((a, b) => own.indexOf(a) - own.indexOf(b))
        }
        held.home.members[held.index] = null; departures.delete(event.id)
      }
      yield; continue
    }
    if (event.kind === 'end') {
      for (const home of byGroup.get(event.id) ?? []) {
        for (const id of home.members) if (id !== null) departures.delete(id)
        home.members.fill(null); home.group = null; free.add(home)
      }
      byGroup.delete(event.id); available.delete(event.id); groupVillages.delete(event.id); yield; continue
    }
    const person = people.get(event.id)!, own = byGroup.get(person.group) ?? []
    // Reuse the team's earliest vacant seat before claiming any other plot.
    const queue = available.get(person.group) ?? []
    let home = queue[0], newHome = false
    if (!home) {
      if (!free.size) addVillage()
      const ownVillages = groupVillages.get(person.group) ?? new Set<number>()
      let distance = Infinity
      // Set order is not a tie breaker: ended teams may reinsert earlier plots.
      for (const candidate of free) {
        const cell = villages[candidate.village]!
        let d = ownVillages.size ? Infinity : 0
        for (const id of ownVillages) { const other = villages[id]!; d = Math.min(d, Math.abs(cell.column - other.column) + Math.abs(cell.row - other.row)); if (!d) break }
        if (d < distance || d === distance && (!home || candidate.village * 6 + candidate.slot < home.village * 6 + home.slot)) { home = candidate; distance = d }
      }
      home!.group = person.group; home!.built = true; free.delete(home!)
      own.push(home!); byGroup.set(person.group, own); ownVillages.add(home!.village); groupVillages.set(person.group, ownVillages)
      queue.push(home!); available.set(person.group, queue); newHome = true
    }
    const index = home!.members.indexOf(null)
    home!.members[index] = person.id
    if (person.leftAt) departures.set(person.id, { home: home!, index })
    if (!home!.members.includes(null)) queue.shift()
    arrivals.push({ person: person.id, group: person.group, home: home!.id, index, newHome })
    yield
  }
  // Join every occupied grid neighbour. Inter-cell roads use reserved gaps,
  // touching square/road boundaries without painting through a house.
  const cells = new Map(villages.map(v => [`${v.column},${v.row}`, v]))
  for (const v of villages) {
    if (cells.has(`${v.column + 1},${v.row}`)) paths.push({ id: `east-${v.id}`, x: v.x + 2444, y: v.y + 871, width: VILLAGE.width + 104 - 2444, height: 52 })
    if (cells.has(`${v.column},${v.row + 1}`)) paths.push({ id: `south-${v.id}`, x: v.x + 819, y: v.y + 1677, width: 52, height: VILLAGE.height + 650 - 1677 })
    yield
  }
  const seats: Record<string, VillageSeat> = Object.create(null) as Record<string, VillageSeat>
  for (const home of plots) {
    for (let index = 0; index < home.members.length; index++) {
    const person = home.members[index]
    if (person == null) continue
    // The v1 roster has a flag but no departure time. Reserve its historical
    // allocation across reloads; neither a visible person nor an active total.
    if (people.get(person)!.retired) continue
    const slot = houseCatalog[home.style]!.deskSlots[index]!
    const desk = { x: home.x + slot.xy[0]!, y: home.y + Math.min(slot.xy[1]!, home.height - 176), width: slot.size[0]!, height: slot.size[1]! }
    const foot = { x: home.x + (index < 2 ? slot.xy[0]! + 64 : index % 2 ? 384 : 240), y: home.y + (home.width === 416 ? 256 : home.style === 'A03' ? 240 : 208) + Math.floor(index / 2) * 128 }
    seats[person] = { person, group: home.group!, home: home.id, village: home.village, index, foot, desk }
    villages[home.village]!.total++
    }
    yield
  }
  for (const village of villages) {
    const ids: string[] = []
    for (let i = village.id * 6; i < village.id * 6 + 6; i++) { const id = plots[i]!.group; if (id !== null && !ids.includes(id)) ids.push(id) }
    ids.sort(compare)
    village.signs = ids.map(id => ({ id, label: groups.get(id)!.label, token: stableHash(id), total: 0 }))
    for (let i = village.id * 6; i < village.id * 6 + 6; i++) {
      const home = plots[i]!, sign = village.signs.find(s => s.id === home.group)
      if (sign) for (const id of home.members) if (id !== null && !people.get(id)!.retired) sign.total++
    }
    yield
  }
  const left = Math.min(0, ...villages.map(v => v.x)), top = Math.min(0, ...villages.map(v => v.y))
  const right = Math.max(0, ...villages.map(v => v.x + v.width)), bottom = Math.max(0, ...villages.map(v => v.y + v.height))
  return { villages, squares, plots, homes: plots.filter(h => h.built), seats, paths, arrivals, bounds: { x: left, y: top, width: right - left, height: bottom - top } }
}

export interface VillageOverview { level: 'homes' | 'villages' | 'districts'; side: number; blocks: (Rect & { id: string; total: number; villages: number[]; signs: TeamSign[] })[] }
/** Thresholds are CSS pixels per cell; all scaling is uniform. District cells
 * double until their nominal width reaches 96 px and their height reaches 67 px.
 */
export function villageOverview(layout: Pick<VillageLayout, 'villages'>, scale: number): VillageOverview {
  if (!Number.isFinite(scale) || scale <= 0) throw Error('Positive finite scale required')
  if (VILLAGE.width * scale + 1e-9 >= 300) return { level: 'homes', side: 1, blocks: [] }
  let side = 1
  // The authored 1,000-person town map groups 2x2 clearings. Smaller towns
  // retain individual villages; both keep readable names and actual totals.
  const minimum = layout.villages.length >= 48 ? 196 : 96
  while (VILLAGE.width * scale * side + 1e-9 < minimum) side *= 2
  const minColumn = Math.min(...layout.villages.map(v=>v.column)), minRow = Math.min(...layout.villages.map(v=>v.row))
  const buckets = new Map<string, VillageOverview['blocks'][number]>()
  for (const v of layout.villages) {
    const column = Math.floor((v.column-minColumn) / side), row = Math.floor((v.row-minRow) / side), id = side === 1 ? `V${v.id + 1}` : `D${side}:${column},${row}`
    let block = buckets.get(id)
    if (!block) { block = { id, x: (column * side+minColumn) * VILLAGE.width, y: (row * side+minRow) * VILLAGE.height, width: side * VILLAGE.width, height: side * VILLAGE.height, total: 0, villages: [], signs: [] }; buckets.set(id, block) }
    block.total += v.total; block.villages.push(v.id)
    for (const sign of v.signs) {
      const held = block.signs.find(s => s.id === sign.id)
      if (held) held.total += sign.total
      else block.signs.push({ ...sign })
    }
  }
  if (side > 1) for (const block of buckets.values()) block.signs.sort((a, b) => b.total - a.total || compare(a.id, b.id))
  return { level: side === 1 ? 'villages' : 'districts', side, blocks: [...buckets.values()] }
}

/** The exact approved native pieces. The study renderer clips/culls these at
 * draw time; the planner never scales a home or invents raster scenery.
 */
export function villagePieces(layout: VillageLayout, id: number): Piece[] {
  const village = layout.villages[id]
  if (!village) return []
  const pieces: Piece[] = [], add = (sprite: string, x: number, y: number, group: string | null = null, layer: Piece['layer'] = 'object', depth?: number) => pieces.push(piece(sprite, village.x + x, village.y + y, group, layer, depth === undefined ? undefined : village.y + depth))
  for (const plot of layout.plots.filter(p => p.village === id && !p.built)) {
    const x = plot.x - village.x, y = plot.y - village.y
    for (const dx of [104, 208, 312]) add('berry-bush', x + dx, y + 128)
    add('B54', x + 128, y + 230); add('ground-fern', x + 280, y + 244, null, 'floor')
  }
  for (const home of layout.homes.filter(h => h.village === id)) {
    const x = home.x - village.x, y = home.y - village.y, meta = houseCatalog[home.style]!
    for (const layer of meta.layers) add(layer.sprite, x, y, home.group, layer.layer)
    meta.deskSlots.forEach((slot) => {
      const dx = x + slot.xy[0]!, dy = y + Math.min(slot.xy[1]!, home.height - 176)
      add('worker-desk', dx, dy, home.group)
      for (const [sprite, ox, oy] of [['open-laptop', 61, -6], ['paper-stack', 106, 12], ['coffee-mug', 104, -4], ['desk-lamp', 5, -24]] as const) add(sprite, dx + ox, dy + oy, home.group, 'object', dy + 73.1)
    })
    add(home.style[0] + '29', x + home.width / 2 - 39, y + 16, home.group, 'back')
    add('desk-plant', x + home.width / 2 - 14, y + 86, home.group)
    add('ground-fern', x + home.width - 40, y + home.height + 10, home.group, 'floor')
  }
  for (const [sprite, x, y] of [
    ['tea-table', 460, 800], ['tea-set', 478, 793], ['stool-sw', 420, 900], ['stool-se', 610, 900], ['A62', 300, 766], ['B48', 690, 830],
    ['B64', 1118, 800], ['B54', 1280, 850], ['message-board', 1590, 766], ['B43', 1810, 790], ['B42', 1590, 914], ['B52', 1820, 930], ['A65', 966, 742],
    ['A58', 2160, 820], ['B59', 2240, 920], ['B38', 2100, 740], ['B40', 2280, 850],
  ] as const) add(sprite, x, y, null, 'object', sprite === 'tea-set' ? 870.1 : undefined)
  for (const x of [260, 364, 468, 572, 1580, 1684, 1788, 1892]) { add(x < 1000 ? 'A30' : 'B30', x, 704); add(x < 1000 ? 'A30' : 'B30', x, 1000) }
  for (const x of [230, 800, 1380, 2040]) add('lantern', x, 958)
  // Woodland sits outside the home/road bands, using native art and fixed offsets.
  add('tree-assembled', 0, 0); add('tree-assembled', 2320, 0)
  for (const x of [1370, 1540]) add('pine-tree', x, 0)
  // Keep the north/south inter-village port at x=806..884 completely clear.
  for (const x of [28, 1568, 2448]) { add('berry-bush', x, 1720); add('berry-bush', x, 72) }
  return dressVillage(layout, village, pieces)
}
