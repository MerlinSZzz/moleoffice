// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FacilityPlace, Obstacle, Station } from './geometry.ts'
import { anchored, piece, stableHash, type Piece } from './village.ts'
import { atDesk, deskThingPieces, WORK_X } from './desk-things.ts'
import type { Rect } from './viewport.ts'

export type FacilityPose = 'stand' | 'carry' | 'cheer' | 'wave'
export interface FacilityStation extends Station { activity: 'desk' | 'reading' | 'garden' | 'route'; cluster: string; outdoors: boolean; pose: FacilityPose }
export const facilityPose = (station: Station | undefined): FacilityPose => (station as FacilityStation | undefined)?.pose ?? 'stand'
/** Every agent of the room has a desk seat. `places` are the room's facility places, in room coordinates, where an
 * idle agent of the room may stand. `furnishings` are the room's own furniture, in room coordinates, for the
 * furnishing pass to place. `forecourt` is the sand ground below the room, in room coordinates, where the outdoor
 * places stand. */
export interface FacilityPlan { width: number; height: number; apron: number; pieces: Piece[]; obstacles: Obstacle[]; seats: Map<string, FacilityStation>; places: FacilityPlace[]; furnishings?: Piece[]; forecourt?: Rect[]; doorX?: number }

// Rooms of one to eight people are drawn like the round 7c village rooms: desks
// in pairs against the back wall, a front row from six people, and a shelf, board,
// table or plants between the pairs. Each figure stands below its own desk and
// faces it, so a lane 96 px below each row of feet takes every body past the
// stools to the door column. The last desk in a row leaves its work desk room
// before the side wall. A mole leaves its desk by a way at one end, from its
// sitting line down to its foot. The one-person room's way is 66 px, beside its
// desk's right end. The two desks of a pair share the 88 px way between them. In
// the two-person room the shelf stands on the right wall for it, and the tea table
// 18 px further right with its bench above it, so the second desk's talk place is
// clear. A large room is 1120 wide, so its last back desk has 88 px before the
// plant on the side wall, and its last front desk has a way past the plants.
// In the rooms of three to five people the shelf stands on the left wall above the
// tea table. The room of four is 896 wide, and its desks share two 88 px ways in
// pairs. The rooms of three and five are 720 and 1128 wide: their first desk has an
// 88 px way at the left wall and the others share theirs in pairs. The room of
// five's lantern stays in the back row, beside its last desk.
type Furnishing = readonly [sprite: string, x: number, y: number, layer?: Piece['layer']]
// A compact room's facility places are feet beside its shelf or tea table, found on made-up rooms. At a place, the
// box round every look at the largest size stays in the room and clear of the drawn furniture and desks.
// Route checks use the full moving-body bounds for every look, including occupied places.
interface CompactRoom { width: number; height: number; desks: readonly (readonly [number, number])[]; furnishings: readonly Furnishing[]; places?: readonly (readonly [number, number])[] }
// The back row stands 94 px down, so a body of the largest size that comes down beside a desk clears the board and
// the back wall's strip.
const backRow = (...xs: number[]) => xs.map(x => [x, 94] as const), frontRow = (...xs: number[]) => xs.map(x => [x, 432] as const)
// Group the tea table with the lower bench without blocking the passage between desk rows,
// including when facility places are occupied by full-size figures. The lower place stands
// far enough right of the second front desk that a body there clears its mole.
const largeRoom = (front: number[], extra: readonly Furnishing[], table: readonly [number, number], height = 728): CompactRoom => ({ width: 1120, height, desks: [...backRow(60, 292, 684, 824), ...frontRow(...front)], furnishings: [
  ['message-board', 132, 4, 'back'], ['bookshelf', 465, 4], ['A29', 477, 176], ['tea-table', table[0], table[1]], ['tea-set', table[0] + 35, table[1]], ['A29', 606, 436],
  ['A27', 180, 300, 'floor'], ['desk-plant', 1058, 150], ...extra], places: [[608, 280], [451, 394]] })
const roomRecipes: Record<number, CompactRoom> = {
  // The desk against the left wall, an 88 px way at its right end and the 102 px shelf need 334 px of floor, and the
  // doorway leaves 92 px either side below it, so this room is 22 px wider than the B01 studio.
  1: { width: 438, height: 408, desks: [[52, 94]], furnishings: [
    ['message-board', 148, 4, 'back'], ['bookshelf', 284, 104], ['A29', 304, 320], ['kettle-stand', 64, 286], ['A28', 156, 290, 'floor'], ['desk-plant', 120, 300]], places: [[334, 308]] },
  2: { width: 656, height: 400, desks: backRow(52, 284), furnishings: [
    ['message-board', 148, 4, 'back'], ['bookshelf', 502, 100], ['A29', 526, 46], ['tea-table', 434, 296], ['tea-set', 469, 296], ['A29', 531, 244],
    ['A27', 90, 300, 'floor'], ['desk-plant', 60, 340]], places: [[150, 350]] },
  3: { width: 720, height: 480, desks: backRow(140, 284, 516), furnishings: [
    ['message-board', 132, 4, 'back'], ['bookshelf', 52, 250], ['tea-table', 60, 378], ['tea-set', 95, 378], ['A29', 191, 408], ['A29', 513, 396],
    ['A28', 284, 290, 'floor'], ['desk-plant', 164, 352]], places: [[232, 330]] },
  4: { width: 896, height: 480, desks: backRow(78, 310, 454, 686), furnishings: [
    ['message-board', 132, 4, 'back'], ['bookshelf', 52, 272], ['tea-table', 60, 400], ['tea-set', 95, 400], ['A29', 191, 408], ['A29', 520, 380],
    ['A27', 330, 300, 'floor'], ['desk-plant', 834, 150]], places: [[200, 302]] },
  5: { width: 1128, height: 480, desks: backRow(140, 284, 516, 660, 892), furnishings: [
    ['message-board', 132, 4, 'back'], ['bookshelf', 52, 250], ['lantern', 1036, 100], ['tea-table', 60, 378], ['tea-set', 95, 378], ['A29', 191, 408], ['A29', 760, 380],
    ['A27', 300, 300, 'floor'], ['B28', 600, 290, 'floor'], ['desk-plant', 1064, 150]], places: [[232, 330]] },
  // The seven- and eight-person rooms leave a wider lane below their front desks.
  // It gives a full moving body room to pass the planter and the people at their feet.
  6: largeRoom([60, 292], [['A29', 712, 392], ['A28', 840, 420, 'floor'], ['plant-planter-front', 720, 556], ['plant-pot-front', 900, 556]], [688, 448]),
  7: largeRoom([60, 292, 684], [['A29', 928, 392], ['plant-planter-front', 592, 560], ['plant-pot-front', 916, 556]], [560, 488], 824),
  8: largeRoom([60, 292, 684, 916], [['plant-planter-front', 580, 488], ['plant-pot-front', 300, 612]], [544, 544], 824),
}

/** The 13-person hall is one 7c room, sized to its 13 desks. The desk rows are
 * the 8-person room's two rows with five desks each and a third row of three;
 * the hall's outdoor gathering on its own forecourt is the place of three idle
 * agents. There is no second lounge or bare lower half: the room is the size of
 * the work it holds. */
export const hall13Bays = { width: 1088, height: 1112, work: { x: 0, width: 1088 } }

function hall13Plan(ids: readonly string[], group: string): FacilityPlan {
  const plan: FacilityPlan = { width: hall13Bays.width, height: hall13Bays.height, apron: 600, pieces: [], obstacles: [], seats: new Map(), places: [], furnishings: [], doorX: hall13Bays.work.x + hall13Bays.work.width / 2 }
  let index = 0
  for (const [row, y, xs] of [[0, 94, [48, 280, 432, 664, 896]], [1, 432, [48, 284, 428, 664, 896]], [2, 776, [60, 292, 556]]] as const) for (const x of xs) {
    const desk = { x: hall13Bays.work.x + x, y, width: 144, height: 73 }, foot = { x: desk.x + WORK_X.middle, y: desk.y + 154 }
    const id = ids[index]!
    plan.pieces.push(piece('worker-desk', desk.x, desk.y, group, 'object', desk.y + desk.height), ...deskThingPieces(desk, group, index, atDesk({ desk, foot }).x - desk.x))
    plan.seats.set(id, { room: group, index, row: index + 1, column: 1, mobileRow: index + 1, foot,
      talk: x === 896 ? { x: foot.x - 96, y: foot.y + 64 } : { x: foot.x + 48, y: foot.y + 104 }, desk, stool: { x: foot.x - 48, y: foot.y + 8, width: 24, height: 16 },
      activity: 'desk', cluster: `${group}/desks-${row}`, outdoors: false, pose: 'stand' })
    plan.obstacles.push({ ...desk, kind: 'desk', station: id })
    index++
  }
  // The hall's own outdoor gathering, on the sand below it, has three reading places.
  const gathering = { x: 300, y: plan.height + 250 }
  const table = anchored('tea-table', gathering, null), tea = anchored('tea-set', { x: gathering.x, y: gathering.y - 35 }, null, 'object')
  tea.depth = table.depth + 1
  plan.pieces.push(table, tea)
  for (const [i, [dx, dy]] of ([[-140, 35], [140, 35], [-70, 174]] as const).entries()) {
    plan.places.push({ room: group, index: i, foot: { x: gathering.x + dx, y: gathering.y + dy }, activity: 'reading', cluster: `${group}/gathering-0`, outdoors: true, pose: 'carry' })
  }
  const top = plan.height + 38, bottom = plan.height + 472
  plan.forecourt = [{ x: 96, y: top, width: 464, height: bottom - top }]
  const frame: Furnishing[] = [['lantern', 64, top + 72, 'object'], ['daisies', 60, top + 152, 'floor'], ['ground-fern', 72, top + 222, 'floor'],
    ['daisies', 58, top + 292, 'floor'], ['ground-fern', 70, top + 362, 'floor'], ['berry-bush', 56, bottom + 80, 'object'],
    ['daisies', 150, bottom + 20, 'floor'], ['ground-fern', 210, bottom + 28, 'floor'], ['berry-bush', 290, bottom + 80, 'object'],
    ['daisies', 370, bottom + 22, 'floor'], ['ground-fern', 420, bottom + 26, 'floor'], ['lantern', 470, bottom + 76, 'object']]
  for (const [sprite, x, y, layer] of frame) plan.pieces.push(anchored(sprite, { x, y }, null, layer))
  for (const p of plan.pieces.filter(p => ['bookshelf', 'tea-table', 'message-board', 'A29'].includes(p.sprite)))
    plan.obstacles.push({ x: p.x, y: p.y + p.height * .72, width: p.width, height: p.height * .28, kind: 'wall' })
  // The room uses the same 7c pieces as the small rooms: a board on the back wall,
  // the tea corner at the free end of the third desk row, the shelf on the side
  // wall beside it, just below the second row's last talk place, and two
  // benches, a flower patch, the planter and the pot in the band below the third
  // desk row. Each lower piece stands in a gap between the reserved talk-point
  // bodies, and a floor rug softens the same band. The pot stands low, beside the
  // planter, so the walk from the fourth front desk to the fifth desk's talk place
  // stays open. The wide gap of the second row stays empty: it is the back row's
  // only way down. The right-hand bench ends left of the door opening, so the
  // opening is wider than a figure of any look by more than the route search's
  // 16 px step. It stands low, below the second third-row desk's talk place and
  // 90 px below that row's stools, so a body of the largest size passes between
  // them on the route search's steps. Nothing in the hall is turned. The third
  // row's first two desks stand 88 px apart, and the third keeps 120 px from the
  // second. Each of the upper rows has three body-wide ways. The second row's
  // two 92 px openings also let the route lattice pass between the occupied desks.
  // The plant stands against the left wall, clear of the desk ways.
  const furn: Furnishing[] = [
    ['message-board', 132, 4, 'back'], ['bookshelf', 878, 692],
    ['tea-table', 740, 780], ['tea-set', 775, 780],
    ['A27', 180, 300, 'floor'], ['A29', 60, 1050], ['A29', 388, 1044], ['B57', 980, 1048],
    ['A28', 180, 1018, 'floor'],
    ['desk-plant', 48, 300],
    ['plant-planter-front', 640, 1036], ['plant-pot-front', 808, 1048],
  ]
  const tableHeight = piece('tea-table', 0, 0, group).height
  for (const [sprite, x, y, layer = 'object'] of furn)
    plan.furnishings!.push(piece(sprite, x, y, group, layer, sprite === 'tea-set' ? y + tableHeight + 1 : undefined))
  return plan
}

/** Inputs are sorted reserved roster identities only. Retiring a person does not
 * change a slot, desk, gathering, route or seed. No activity/presence is read.
 * Every identity has a desk; the gatherings and routes are the room's facility places. */
export function facilityPlan(ids: readonly string[], group: string, compactRooms = true): FacilityPlan {
  const room = compactRooms ? roomRecipes[ids.length] : undefined
  // The former layout remains only for nine or more people and for the allocation of rooms of two and five.
  if (room) return compactPlan(ids, group, room)
  if (compactRooms && ids.length === 13) return hall13Plan(ids, group)
  const count = ids.length, seed = stableHash(ids.join('|')), columns = count > 45 ? 4 : count > 8 ? 2 : 1
  const plan: FacilityPlan = { width: count <= 1 ? 416 : count <= 8 ? (count === 2 ? 656 : count <= 4 ? 768 : count === 5 ? 1032 : 1296) : columns * 720 + 260 + 160, height: 312, apron: count >= 12 ? 600 : 0, pieces: [], obstacles: [], seats: new Map(), places: [] }
  // The room keeps the gatherings and routes it had when a quarter of its people stood at them instead of at a
  // desk; they are now places for its idle agents, and every identity has a desk.
  let standing = count < 9 ? count : Math.ceil(count * .76)
  const routes = count >= 24 ? Math.max(1, Math.floor(count * .02)) : 0
  if (count - standing - routes === 1) standing++
  const desks = count, gather = count - standing - routes, groups = Math.ceil(gather / 4), sizes = Array.from({ length: groups }, (_, i) => Math.floor(gather / groups) + Number(i < gather % groups))
  const islandCount = Math.ceil(desks / 4), islands = Array.from({ length: islandCount }, (_, i) => Math.floor(desks / islandCount) + Number(i < desks % islandCount))
  const cursor = Array.from({ length: columns }, (_, i) => count <= 1 ? 112 : 130 + [0, 85, 35, 140][i]!), feet: FacilityStation[] = []
  const addSeat = (x: number, y: number, cluster: string, desk: Rect) => {
    const index = feet.length
    feet.push({ room: group, index, row: index + 1, column: 1, mobileRow: index + 1, foot: { x, y }, talk: { x: x - 32, y: y - 16 }, desk, stool: { x: x - 48, y: y + 8, width: 24, height: 16 }, activity: 'desk', cluster, outdoors: false, pose: 'stand' })
  }
  const addPlace = (x: number, y: number, activity: FacilityPlace['activity'], cluster: string, outdoors: boolean, pose: FacilityPose) =>
    plan.places.push({ room: group, index: plan.places.length, foot: { x, y }, activity, cluster, outdoors, pose })
  // Wide two-column rooms leave a body-wide passing aisle beside the right-hand
  // desks, including when the full desk artwork and neighboring people are present.
  const origin = (col: number) => 80 + col * 720 + (col >= columns / 2 ? 260 : 0) - (count >= 24 && columns === 2 && col === 1 ? 64 : 0)
  const gatherings: { n: number; col: number; y: number; outside: boolean; serial: number }[] = []
  let nextGathering = 0
  for (const [i, n] of islands.entries()) {
    // An eight-desk room gives up thirteen pixels on the right so its table and
    // plant can stand beside the last desk without tightening any desk spacing.
    const col = i % columns, x = count <= 1 ? 80 : origin(col) + [-8, 10, -14, 6][Math.floor(i / columns) % 4]! - (count === 8 ? 13 : 0), y = cursor[col]!
    // Leave a passing aisle beside each stationary full-size moving envelope.
    // In rooms of more than eight, the lower desks stand 184 px below the upper
    // ones so the stool above clears the band a mole walks along as it leaves.
    const offsets = count >= 5 && count <= 8 ? [[0, 0], [264, 0], [528, 0], [792, 0]] : count === 2 ? [[0, 0], [262, 0]] : count > 1 && count <= 4 ? [[0, 0], [264, 0], [10, 220], [274, 220]] : [[0, 0], [352, 0], [10, 184], [362, 184]]
    for (const [dx, dy] of offsets.slice(0, n)) {
      const desk = { x: x + dx!, y: y + dy! - (count <= 1 ? 24 : 0), width: 144, height: 73 }, foot = { x: desk.x + (count <= 1 ? 190 : count <= 8 ? 188 : 190), y: desk.y + (count <= 1 ? 121 : 74) }
      plan.pieces.push(piece('worker-desk', desk.x, desk.y, group, 'object', desk.y + desk.height), ...deskThingPieces(desk, group, feet.length, atDesk({ desk, foot }).x - desk.x))
      addSeat(foot.x, foot.y, `${group}/desks-${i}`, desk)
    }
    cursor[col] = y + (n > 2 ? (count >= 5 && count <= 8 ? 220 : count <= 4 ? 280 : 404) : count <= 1 ? 156 : 220)
    if (nextGathering < sizes.length && (i % columns === col && i >= columns - 1)) {
      const serial = nextGathering++, outside = serial === 0 && plan.apron > 0
      gatherings.push({ n: sizes[serial]!, col, y: cursor[col]!, outside, serial })
      // Leave enough room below an occupied gathering for a full moving body to
      // pass its neighbors before reaching the next island's desk artwork.
      if (!outside) cursor[col]! += 636
    }
  }
  while (nextGathering < sizes.length) {
    const serial = nextGathering++, col = serial % columns, outside = serial === 0 && plan.apron > 0
    gatherings.push({ n: sizes[serial]!, col, y: cursor[col]!, outside, serial }); if (!outside) cursor[col]! += 636
  }
  plan.height = count <= 1 ? 408 : count >= 3 && count <= 8 ? 624 : Math.max(560, ...cursor.map(y => y + 96))
  // A visitor approaches from the open space between desk rows, not through
  // the desktop or the stationary worker's body. The two rows of a hall's island
  // are too close for a body between them, so there the visitor stands beside
  // the worker, in the gap before the next desk, where the island's walkers pass.
  for (const seat of feet) {
    seat.talk = count <= 8 ? { x: seat.foot.x, y: seat.foot.y + (count === 1 || seat.foot.y >= 260 ? -96 : 96) } : { x: seat.foot.x + 100, y: seat.foot.y }
  }
  for (const g of gatherings) {
    const reading = (seed + g.serial) % 2 === 0, x = g.outside ? 300 : origin(g.col) + 160, y = g.outside ? plan.height + 250 : g.y + 290
    const cluster = `${group}/gathering-${g.serial}`, propGroup = g.outside ? null : group
    if (reading) {
      const table = anchored('tea-table', { x, y }, propGroup), tea = anchored('tea-set', { x, y: y - 35 }, propGroup, 'object')
      tea.depth = table.depth + 1; plan.pieces.push(table, tea)
      plan.pieces.push(anchored('bookshelf', { x, y: y - 160 }, propGroup))
    } else {
      plan.pieces.push(anchored('message-board', { x, y: y - 160 }, propGroup), anchored('A29', { x, y: y - 85 }, propGroup))
    }
    for (const [i, [dx, dy]] of [[-140, 35], [140, 35], [-70, 174], [70, 174]].slice(0, g.n).entries())
      addPlace(x + dx!, y + dy!, reading ? 'reading' : 'garden', cluster, g.outside, reading ? 'carry' : i % 2 ? 'cheer' : 'wave')
  }
  // A few static carry stills on the side approach to the outdoor group.
  for (let i = 0; i < routes; i++) addPlace(560 + (i % 2) * 140, plan.height + 424 + Math.floor(i / 2) * 140, 'route', `${group}/approach`, true, 'carry')
  if (routes > 2) plan.apron = Math.max(plan.apron, 500 + Math.ceil(routes / 2) * 140)
  // The outdoor group and the carry stools stand on a sand yard sized to the group,
  // never on the grass: its pieces and seats with a lattice step round them, from
  // the door path down to the lowest stool, joined to the apron path on the right.
  // Two columns of stools add a lane round both, with room for a full body beside
  // each column, across the top and below the last stool, where a pair from the two
  // bottom rows meets. Flowers, bushes and lanterns frame the open edges on the
  // grass, clear of the joins, the lane and every path.
  if (plan.apron) {
    const top = plan.height + 38, bottom = plan.height + (routes ? 600 : 472), frameBottom = plan.height + 472, lane = Math.max(bottom, plan.height + 400 + Math.ceil(routes / 2) * 140)
    // The left edge leaves a full-body passing lane around occupied outdoor places.
    plan.forecourt = [{ x: routes ? 32 : 96, y: top, width: routes ? 528 : 464, height: bottom - top }, ...routes ? [{ x: 448, y: top, width: 348, height: lane - top }] : []]
    const frame: Furnishing[] = [['lantern', 64, top + 72, 'object'], ['daisies', 60, top + 152, 'floor'], ['ground-fern', 72, top + 222, 'floor'],
      ...bottom - top > 400 ? [['daisies', 58, top + 292, 'floor'], ['ground-fern', 70, top + 362, 'floor']] as const : [],
      ['berry-bush', routes ? 32 : 56, frameBottom + 80, 'object'], ['daisies', 150, frameBottom + 20, 'floor'], ['ground-fern', 210, frameBottom + 28, 'floor'], ['berry-bush', routes ? 1050 : 290, frameBottom + 80, 'object'],
      ['daisies', 370, frameBottom + 22, 'floor'], ['ground-fern', 420, frameBottom + 26, 'floor']]
    if (routes > 1) {
      for (let y = plan.height + 600; y < lane; y += 280) frame.push(['lantern', 400, y, 'object'], ['lantern', 848, y, 'object'])
      frame.push(['daisies', 500, lane + 20, 'floor'], ['ground-fern', 640, lane + 24, 'floor'], ['daisies', 760, lane + 20, 'floor'])
    } else frame.push(['lantern', routes ? 840 : 470, frameBottom + 76, 'object'])
    for (const [sprite, x, y, layer] of frame) plan.pieces.push(anchored(sprite, { x, y }, null, layer))
  }
  feet.forEach((seat, i) => {
    const id = ids[i]!
    plan.seats.set(id, seat)
    plan.obstacles.push({ ...seat.desk, kind: 'desk', station: id })
  })
  // Solid native prop bases, with full visual crowns protected from planting.
  for (const p of plan.pieces.filter(p => ['bookshelf', 'tea-table', 'message-board', 'A29'].includes(p.sprite)))
    plan.obstacles.push({ x: p.x, y: p.y + p.height * .72, width: p.width, height: p.height * .28, kind: 'wall' })
  return plan
}

function compactPlan(ids: readonly string[], group: string, room: CompactRoom): FacilityPlan {
  const plan: FacilityPlan = { width: room.width, height: room.height, apron: 0, pieces: [], obstacles: [], seats: new Map(), furnishings: [],
    places: (room.places ?? []).map(([x, y], index) => ({ room: group, index, foot: { x, y }, activity: 'reading', cluster: `${group}/facility-${index}`, outdoors: false, pose: 'carry' })) }
  for (const [index, [x, y]] of room.desks.entries()) {
    const desk = { x, y, width: 144, height: 73 }, foot = { x: x + WORK_X.middle, y: y + 154 }, id = ids[index]!
    plan.pieces.push(piece('worker-desk', desk.x, desk.y, group, 'object', desk.y + desk.height), ...deskThingPieces(desk, group, index, atDesk({ desk, foot }).x - desk.x))
    // A visitor stands in the lane below the desk row, beside the worker's way out.
    const talk = room.desks.length === 1 ? { x: room.width / 2, y: foot.y + 80 } : { x: foot.x + 48, y: foot.y + 104 }
    plan.seats.set(id, { room: group, index, row: index + 1, column: 1, mobileRow: index + 1, foot, talk, desk, stool: { x: foot.x - 48, y: foot.y + 8, width: 24, height: 16 },
      activity: 'desk', cluster: `${group}/desks-${y > 94 ? 1 : 0}`, outdoors: false, pose: 'stand' })
    plan.obstacles.push({ ...desk, kind: 'desk', station: id })
  }
  const table = piece('tea-table', 0, 0, group)
  for (const [sprite, x, y, layer = 'object'] of room.furnishings)
    plan.furnishings!.push(piece(sprite, x, y, group, layer, sprite === 'tea-set' ? y + table.height + 1 : undefined))
  return plan
}
