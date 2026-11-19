// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Point } from './geometry.ts'
import { piece, stableHash, type Piece } from './village.ts'
import type { Rect } from './viewport.ts'

/** The worker-desk picture's top, in its own pixels (the picture is 144 × 73), measured from
 * the picture row by row. Each band is named by its first row. Rows 0 to 2 are the back rim, a
 * dark outline; with the top's first row it spans x 13 to x 131. Rows 3 to 24 are the flat wood
 * top. Rows 25 and 26 are the bright lip, the desk's front edge. Rows 27 to 34 are the front
 * face, the top's thickness, and row 35 is the face's outline. Nothing stands on the lip or the
 * face. */
export const DESK_TOP = { width: 144, height: 73, left: 13, right: 131, rim: 0, top: 3, lip: 25, face: 27, outline: 35 } as const

/** Where a thing's base may stand: rows 8 to 24, 5 rows in from the back rim, and x 17 to 126.
 * A pixel is wood when it is opaque and orange (red at least 96 and at least 40 above blue). On
 * rows 8 to 24 the wood is narrowest on rows 8 and 9, from x 14 to x 129, so the sides are at
 * least 3 px in from the wood on every row. */
export const DESK_AREA: Rect = { x: 17, y: 8, width: 110, height: 17 }

/** Where on its desk a mole works, in desk pixels: behind the middle, or, as the second of
 * two secretaries, at x 100, which leaves a body's width between the two secretaries above
 * the doorway of their house. */
export const WORK_X = { middle: DESK_TOP.width / 2, second: 100 } as const

/** Where a mole at its desk is drawn: behind the desk, on row 24 of the desk picture, at the
 * x it works at. A mole whose foot is below its desk works straight above its foot. A mole
 * whose foot is beside its desk, as in a room of 9 to 12 or 14 or more, works behind the
 * desk's middle. The page draws it here, its plate is placed from here, and its desk's
 * laptop faces it here. */
export function atDesk(seat: { desk: Point; foot: Point }): Point {
  const x = seat.foot.x - seat.desk.x
  return { x: seat.desk.x + (x >= 0 && x < DESK_TOP.width ? x : WORK_X.middle), y: seat.desk.y + 24 }
}

/** Where each thing touches the desk, in its own picture's pixels, measured from the
 * picture: the lamp's foot plate, the paper stack's bottom sheet (the stack's outline from
 * row 5, three rows below its back corner, as its pages' edges show it three rows thick, down
 * to its front corner on row 15), the laptop's base, the bottom of the mug and the bottom of
 * the plant's pot. The laptop is seen from behind, so its screen faces the mole. Its drawn box
 * runs from the first to the last column and row with an opaque pixel: x 2 to 32 and rows 2 to
 * 22. Its base is the lower 14 rows of that box, rows 9 to 22, across its whole width: the
 * laptop seen from the front, which it replaces, stands on its 14-row keyboard half, and this
 * is the same laptop on the same desk seen from the other side. The lamp at the right end is
 * the lamp's picture turned round in its 40-px canvas, so its foot plate is the mirror of the
 * lamp's: it starts 40 - 4 - 22 = 14 px in, on the same rows. */
export const THING_BASES = {
  'desk-lamp': { x: 4, y: 36, width: 22, height: 9 },
  'desk-lamp-right': { x: 14, y: 36, width: 22, height: 9 },
  'paper-stack': { x: 2, y: 5, width: 19, height: 11 },
  'laptop-back': { x: 2, y: 9, width: 31, height: 14 },
  'coffee-mug': { x: 2, y: 12, width: 12, height: 4 },
  'desk-plant': { x: 3, y: 9, width: 5, height: 4 },
} as const satisfies Record<string, Rect>
export type DeskThing = keyof typeof THING_BASES

/** The row a lamp's foot plate starts on behind a mole at the middle of its desk, and on
 * every hall desk: the row that keeps the walks behind a hall's front-row desk clear. */
export const LAMP_ROW = 16

/** Where the base of the thing at an end may start, as ranges of its top-left corner. The
 * lamp at the left end leans right, over the desk, and the lamp at the right end leans left.
 * A lamp further back is drawn higher. Behind the middle of a desk, at x 72, the smaller
 * mole's face reaches down to 18 rows above the top, and a lamp at the left end covers none
 * of its pixels, for any look, only on row 16 from x 17 to 19. The lamp at the right end
 * stands on row 16 too, at x 105, where its picture ends on the back rim's last column,
 * x 131, which leaves the laptop, the mug and the plant the most room left of it. A mole at
 * x 100 leaves the lamp free from x 17 to 30 on rows 8 to 16. The paper stack is low and
 * stands anywhere from x 17 to 37 on rows 8 to 14. */
type Range = { left: number; right: number; top: number; bottom: number }
const LAMP_MIDDLE: Range = { left: 17, right: 19, top: LAMP_ROW, bottom: LAMP_ROW }
const LAMP_RIGHT: Range = { left: 105, right: 105, top: LAMP_ROW, bottom: LAMP_ROW }
const LAMP_FREE: Range = { left: 17, right: 30, top: 8, bottom: LAMP_ROW }
const STACK: Range = { left: 17, right: 37, top: 8, bottom: 14 }

/** Each arrangement gives the top-left corner of the laptop's, the mug's and the plant's base,
 * in desk pixels. Every one leaves the thing at the end clear: its picture ends at x 55
 * (a lamp at the left end behind a middle mole), x 66 (a lamp at x 100's desk) or x 58 (a
 * stack, whose drawn box ends at x 56), or starts at x 91 (a lamp at the right end). Side by
 * side, two pictures overlap by 2 px at most and two bases stand 2 px apart or more. The
 * laptop's base is 14 rows deep, so it starts on row 8 to 11. The laptop's middle is within
 * 8 px of where the mole works, so its screen faces the mole. The plant may stand just in
 * front of a mug on row 8, never behind one. Any two arrangements of one list differ by 6 px
 * or more in at least one base. */
type Arrangement = Record<Exclude<DeskThing, 'desk-lamp' | 'desk-lamp-right' | 'paper-stack'>, readonly [number, number]>
/** A mole behind the middle of the desk (x 72) works over the laptop. The mug stands to its
 * right, and the plant at the right end or just in front of the mug. */
const behind: readonly Arrangement[] = [
  { 'laptop-back': [58, 11], 'coffee-mug': [91, 20], 'desk-plant': [112, 10] },
  { 'laptop-back': [60, 8], 'coffee-mug': [94, 9], 'desk-plant': [118, 20] },
  { 'laptop-back': [64, 10], 'coffee-mug': [98, 15], 'desk-plant': [121, 9] },
  { 'laptop-back': [59, 9], 'coffee-mug': [95, 8], 'desk-plant': [100, 21] },
]
/** The second of two secretaries works at x 100. The mug stands left of the laptop, alone or
 * with the plant in front of it, or to the laptop's right with the plant in front of it. */
const behindRight: readonly Arrangement[] = [
  { 'coffee-mug': [68, 18], 'laptop-back': [86, 9], 'desk-plant': [120, 12] },
  { 'coffee-mug': [70, 8], 'desk-plant': [76, 21], 'laptop-back': [88, 11] },
  { 'laptop-back': [77, 10], 'coffee-mug': [110, 8], 'desk-plant': [112, 21] },
]
/** A mole behind the middle of a desk with the lamp at the right end works over the laptop,
 * which stands left of the lamp. The mug stands left of the laptop, and the plant between
 * the laptop and the lamp. */
const behindLampRight: readonly Arrangement[] = [
  { 'coffee-mug': [25, 8], 'laptop-back': [49, 8], 'desk-plant': [83, 21] },
  { 'laptop-back': [49, 11], 'desk-plant': [83, 21], 'coffee-mug': [31, 20] },
  { 'laptop-back': [49, 9], 'coffee-mug': [27, 16], 'desk-plant': [83, 15] },
  { 'desk-plant': [83, 9], 'laptop-back': [49, 10], 'coffee-mug': [31, 12] },
]

function arrangementsFor(workX: number, lampRight: boolean): { list: readonly Arrangement[]; lamp: Range } {
  const laptop = THING_BASES['laptop-back'].width, under = (list: readonly Arrangement[]) => list.every(a => a['laptop-back'][0] <= workX && workX < a['laptop-back'][0] + laptop)
  if (lampRight && under(behindLampRight)) return { list: behindLampRight, lamp: LAMP_RIGHT }
  if (!lampRight && under(behind)) return { list: behind, lamp: LAMP_MIDDLE }
  if (!lampRight && under(behindRight)) return { list: behindRight, lamp: LAMP_FREE }
  throw new Error(`No desk arrangement puts the laptop in front of a mole working at x ${workX} of its desk`)
}

/** A place in a range, from a hash: its column from the hash, its row from what is left. */
const place = (range: Range, hash: number): readonly [number, number] => {
  const across = range.right - range.left + 1
  return [range.left + hash % across, range.top + Math.floor(hash / across) % (range.bottom - range.top + 1)]
}

/** The things on the desk at `index` in `room`, whose mole works at x `workX` of the desk, as
 * picture corners in desk pixels, from the back of the desk to the front. The room orders its
 * list by stableHash and desk n takes entry n of that order, round the list, so desks side by
 * side in a row, whose indices follow each other, never share an arrangement. Every third
 * desk, counted from desk 0 or desk 1 as stableHash of the room says, has a paper stack at
 * the left end and the others a lamp, so desks 0 and 1 have one of each, and every room of
 * two or more desks has both. A desk with `stack` set has the paper stack whatever its index.
 * Behind a mole at the desk's middle, the lamp stands at the left end of every other desk and
 * at the right end of the rest, counted from desk 0 or desk 1 as stableHash of the room says,
 * so two desks side by side never have it at the same end. Behind a mole at x 100 it stands
 * at the left end. The place of the thing at the end comes from stableHash of the room and
 * the index. */
export function deskThings(room: string, index: number, workX: number, stack = false): { sprite: DeskThing; x: number; y: number }[] {
  const end: DeskThing = stack || (index + 2 * (stableHash(`${room}|stack`) % 2)) % 3 === 0 ? 'paper-stack'
    : workX === WORK_X.middle && (index + stableHash(`${room}|lamp`)) % 2 === 1 ? 'desk-lamp-right' : 'desk-lamp'
  const { list, lamp } = arrangementsFor(workX, end === 'desk-lamp-right')
  const order = list.map((_, k) => k).sort((a, b) => stableHash(`${room}|${a}`) - stableHash(`${room}|${b}`) || a - b)
  const corner = place(end === 'paper-stack' ? STACK : lamp, stableHash(`${room}|${index}|${end}`))
  const bases = [[end, corner], ...Object.entries(list[order[index % list.length]!]!)] as [DeskThing, readonly [number, number]][]
  const front = ([sprite, [, y]]: [DeskThing, readonly [number, number]]) => y + THING_BASES[sprite].height
  return bases.sort((a, b) => front(a) - front(b))
    .map(([sprite, [x, y]]) => ({ sprite, x: x - THING_BASES[sprite].x, y: y - THING_BASES[sprite].y }))
}

/** Whether piece `p` is one of the things on the desk whose picture's top-left corner is `desk`:
 * a desk thing whose base lies inside that desk's area. The working desk finds its things this
 * way, so it needs no arrangement for a desk that has none. */
export function standsOn(p: Piece, desk: Point): boolean {
  if (!Object.hasOwn(THING_BASES, p.sprite)) return false
  const base = THING_BASES[p.sprite as DeskThing], x = p.x + base.x - desk.x, y = p.y + base.y - desk.y, a = DESK_AREA
  return x >= a.x && y >= a.y && x + base.width <= a.x + a.width && y + base.height <= a.y + a.height
}

/** Which of a room's desks, given by their pictures' top-left corners, stand in its front row:
 * those that share more than half their height with the frontmost desk, when some desk stands
 * further back. In a secretary room the walk from a back-row desk to the door passes behind
 * the front row, where a lamp's head would stand in its way, so a desk there has the stack. */
export function frontRow(desks: readonly Point[]): boolean[] {
  const front = Math.max(...desks.map(d => d.y)), inFront = desks.map(d => front - d.y < DESK_TOP.height / 2)
  return inFront.every(Boolean) ? inFront.map(() => false) : inFront
}

export function deskThingPieces(desk: Point, room: string, index: number, workX: number, stack = false): Piece[] {
  return deskThings(room, index, workX, stack).map(t => piece(t.sprite, desk.x + t.x, desk.y + t.y, room, 'object', desk.y + 73.1))
}
