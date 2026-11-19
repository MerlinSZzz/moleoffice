// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { facilityPlan } from '../src/ownership-facilities.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { bindActions, actorScale, type ContactPiece } from '../src/action-binding.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { canonicalFrame } from '../src/action-data.ts'
import { OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { sprites as bundled } from '../src/assets.ts'
import { standingScale } from '../src/appearance.ts'
import { DEFAULT_MOLE_SCALE } from '../src/walks.ts'
import { landing, type SpriteFrame } from '../src/pack.ts'
import { DESK_AREA, DESK_TOP, LAMP_ROW, THING_BASES, WORK_X, atDesk, deskThings, standsOn } from '../src/desk-things.ts'
import type { RosterView } from '../src/contracts.ts'
import type { Point, Station } from '../src/geometry.ts'
import type { Piece } from '../src/village.ts'
import type { Rect } from '../src/viewport.ts'
import { mapFixture } from './tuft-action-map-fixture.ts'
import { data, flush } from './tuft-action-fixture.ts'
// @ts-expect-error The PNG reader is shared with the JS picture tools.
import { pixels } from './png-pixels.mjs'
import { agent, people } from './fixtures.ts'

afterEach(async () => { pageActionPacks.setNeeds([]); await flush(); releaseMapSurfaces(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

type Thing = keyof typeof THING_BASES
const things = Object.keys(THING_BASES) as Thing[]
// The thing at one end of a desk: the lamp at the left end or the right, or a paper stack in
// its place at the left end.
const endThings: readonly Thing[] = ['desk-lamp', 'desk-lamp-right', 'paper-stack']
const lamps: readonly Thing[] = ['desk-lamp', 'desk-lamp-right']
const sprites = bundled as Record<string, SpriteFrame>
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const show = (r: Rect) => `${+r.x.toFixed(2)},${+r.y.toFixed(2)} ${+r.width.toFixed(2)}×${+r.height.toFixed(2)}`
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const inside = (a: Rect, b: Rect) => a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.width <= b.x + b.width + 1e-6 && a.y + a.height <= b.y + b.height + 1e-6
const gap = (a: Rect, b: Rect) => Math.max(b.x - a.x - a.width, a.x - b.x - b.width, b.y - a.y - a.height, a.y - b.y - b.height)
// Where a frame's picture lands in its own canvas: its trim box, or for a frame turned at draw
// time the box drawSprite draws it in, from pack.ts.
const lands = (frame: SpriteFrame): Rect => { if (frame.turned) return landing(frame); const [l, t, r, b] = frame.trim as [number, number, number, number]; return { x: l, y: t, width: r - l, height: b - t } }
// What the picture shows: where it lands, at the piece's scale.
const drawn = (p: Piece): Rect => { const at = lands(sprites[p.sprite]!), s = p.scale ?? 1; return { x: p.x + at.x * s, y: p.y + at.y * s, width: at.width * s, height: at.height * s } }
const base = (p: Piece): Rect => { const b = THING_BASES[p.sprite as Thing], s = p.scale ?? 1; return { x: p.x + b.x * s, y: p.y + b.y * s, width: b.width * s, height: b.height * s } }

// The pictures the page bundles, read with png-pixels. A pixel counts as opaque when its
// alpha is 128 or more.
const OPAQUE = 128
const sheets = new Map<string, ReturnType<typeof pixels>>()
const sheet = (file: string) => { if (!sheets.has(file)) sheets.set(file, pixels(new URL(`../assets/${file}.png`, import.meta.url))); return sheets.get(file)! }
// A catalogue picture as opaque or not at (u, v) of its own size, through its trimmed rectangle in
// the atlas. A turned frame reads that rectangle from its right side.
function opaque(sprite: string): (u: number, v: number) => boolean {
  const frame = sprites[sprite]!, { atlas, rect: [rx, ry] } = frame, at = lands(frame), img = sheet(atlas)
  expect(img.channels, atlas).toBe(4)
  const column = (u: number) => frame.turned ? at.x + at.width - 1 - u : u - at.x
  return (u, v) => u >= at.x && v >= at.y && u < at.x + at.width && v < at.y + at.height && img.data[((ry! + v - at.y) * img.width + rx! + column(u)) * 4 + 3]! >= OPAQUE
}

// A face: the opaque pixels in the upper 40% of a mole's trim box, as drawn on the map.
interface Face { who: string; box: Rect; covers: (x: number, y: number) => boolean }
const looks = Object.keys(sprites).filter(k => k.startsWith('stand-'))
// A standing mole as drawAnchoredSprite draws it: the anchor on `at`, at `scale`, turned
// round the anchor when it faces left.
function standingFace(who: string, sprite: string, at: Point, scale: number, left: boolean): Face {
  const { trim: [l, t, r, b], anchor: [ax, ay] } = sprites[sprite]!, seen = opaque(sprite), bottom = t! + .4 * (b! - t!)
  const box = { x: left ? at.x - (r! - ax!) * scale : at.x + (l! - ax!) * scale, y: at.y + (t! - ay!) * scale, width: (r! - l!) * scale, height: (bottom - t!) * scale }
  return { who: `${who}, ${sprite} at ${scale}${left ? ' facing left' : ''}`, box, covers: (x, y) => {
    const u = Math.floor(left ? ax! + (at.x - x) / scale : ax! + (x - at.x) / scale), v = Math.floor(ay! + (y - at.y) / scale)
    return v < bottom && seen(u, v)
  } }
}
// The working mole, as the action runtime draws a stage: its source picture with the stage's
// origin at the foot, at the mole's scale. Its trim box is the box of its opaque pixels.
function actionFace(source: string, origin: readonly number[], at: Point, scale: number): Face {
  const img = sheet(`tuft-action-${source}`), seen = (u: number, v: number) => u >= 0 && v >= 0 && u < img.width && v < img.height && img.data[(v * img.width + u) * img.channels + 3]! >= OPAQUE
  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity
  for (let v = 0; v < img.height; v++) for (let u = 0; u < img.width; u++) if (seen(u, v)) { top = Math.min(top, v); bottom = Math.max(bottom, v + 1); left = Math.min(left, u); right = Math.max(right, u + 1) }
  const x = at.x + (origin[0]! - 231) * scale, y = at.y + (origin[1]! - 255) * scale, end = top + .4 * (bottom - top)
  return { who: `the working mole, ${source} at ${scale}`, box: { x: x + left * scale, y: y + top * scale, width: (right - left) * scale, height: (end - top) * scale },
    covers: (px, py) => { const u = Math.floor((px - x) / scale), v = Math.floor((py - y) / scale); return v < end && seen(u, v) } }
}
// The map pixels, by their centres, where an opaque pixel of the thing lies on a face pixel.
function covered(p: Piece, face: Face): number {
  const box = drawn(p), s = p.scale ?? 1, seen = opaque(p.sprite)
  if (!overlaps(box, face.box)) return 0
  let count = 0
  for (let y = Math.floor(box.y); y < box.y + box.height; y++) for (let x = Math.floor(box.x); x < box.x + box.width; x++) {
    const cx = x + .5, cy = y + .5
    if (seen(Math.floor((cx - p.x) / s), Math.floor((cy - p.y) / s)) && face.covers(cx, cy)) count++
  }
  return count
}

interface Desk { name: string; room: string; hall: boolean; seat: Station; at: Point; desk: Rect; ratio: number; workX: number; things: Piece[]; over: Piece[]; faces: Face[] }
// A box in the desk picture's own pixels; a redrawn working desk is scaled back by its width.
const local = (r: Rect, d: Desk): Rect => ({ x: (r.x - d.desk.x) / d.ratio, y: (r.y - d.desk.y) / d.ratio, width: r.width / d.ratio, height: r.height / d.ratio })
const centre = (r: Rect): Rect => ({ x: r.x + r.width / 2, y: r.y + r.height / 2, width: 0, height: 0 })
// The smallest and the largest scale a standing mole is drawn at.
const SCALES = [DEFAULT_MOLE_SCALE, standingScale(1.6)]

// Where the page draws each mole at its desk: OfficeMap's own actors(), on a map that has every
// one of them at its desk, none bound to an action and none free to walk.
function drawnAtDesks(seats: readonly (readonly [string, Station])[]): Map<string, Point> {
  const keys = seats.map(([key]) => key), map = {
    camera: null, away: undefined, whereaboutsByKey: new Map(keys.map(key => [key, { where: 'desk' }])), occupants: new Map(),
    options: { still: false, wave: null, workAvailable: true }, moving: [], layout: { seats: Object.fromEntries(seats), ownership: true }, individuals: true, actionBindings: new Map(), freeToWalk: new Set(), atFacility: new Map(),
  }
  const actors = (OfficeMap.prototype as unknown as { actors(this: typeof map, keys: string[]): { key: string; point: Point }[] }).actors.call(map, keys)
  return new Map(actors.map(a => [a.key, a.point]))
}

// Every desk seat's desk, with the things whose picture overlaps it, each given to the nearest
// such desk by the middle of its base. A thing that has left the top but still touches its desk
// is held to that desk's rules. A room's own plants, on the floor or a sill, overlap no desk.
// `over` is every piece of the room whose picture overlaps the desk, a thing or not.
// The mole at a desk is drawn where the page draws it, facing left when that is right of the
// desk, in every standing look. A visitor stands on the seat's talk point, facing either way.
function seated(name: string, seats: Iterable<readonly [string, Station]>, pieces: readonly Piece[], hall = false): Desk[] {
  const entries = [...seats].filter(([, s]) => s.desk.width > 0), stations = entries.map(([, s]) => s), drawnAt = drawnAtDesks(entries)
  const away = (p: Piece, s: Station) => { const c = centre(base(p)), r = s.desk; return Math.hypot(Math.max(r.x - c.x, 0, c.x - r.x - r.width), Math.max(r.y - c.y, 0, c.y - r.y - r.height)) }
  const nearest = (p: Piece) => stations.filter(s => s.room === p.group && overlaps(p, s.desk)).reduce<Station | undefined>((a, b) => a && away(p, a) <= away(p, b) ? a : b, undefined)
  expect(entries.filter(([key]) => !drawnAt.has(key)).map(([key]) => `${name}: ${key} is not drawn at its desk`)).toEqual([])
  return entries.map(([key, s]) => { const at = drawnAt.get(key)!; return {
    name: `${name}, desk ${s.index} at ${s.desk.x},${s.desk.y}`, room: s.room, hall, seat: s, at, desk: s.desk, ratio: 1, workX: at.x - s.desk.x,
    things: pieces.filter(p => p.sprite in THING_BASES && p.group === s.room && nearest(p) === s), over: pieces.filter(p => p.group === s.room && overlaps(p, s.desk)),
    faces: SCALES.flatMap(scale => looks.flatMap(look => [standingFace('the mole at the desk', look, at, scale, at.x > s.desk.x + s.desk.width),
      ...[false, true].map(left => standingFace('a visitor at the talk point', look, s.talk, scale, left))])),
  } })
}

// Every desk has one laptop seen from behind, whose screen faces the mole, and no laptop seen
// from the front, the picture it replaced.
function laptops(d: Desk): string[] {
  const back = d.things.filter(p => p.sprite === 'laptop-back').length, front = d.over.filter(p => p.sprite === 'open-laptop').length
  return back === 1 && front === 0 ? [] : [`${d.name}: has ${back} laptop-back and ${front} open-laptop, not one laptop-back and no open-laptop`]
}
// The lid faces the mole working behind the desk: the middle of the laptop's drawn box is within
// 8 px of the mole's x.
function facing(d: Desk): string[] {
  const lids = d.things.filter(p => p.sprite === 'laptop-back')
  if (lids.length !== 1) return []
  const lid = local(drawn(lids[0]!), d), middle = lid.x + lid.width / 2
  return Math.abs(middle - d.workX) <= 8 + 1e-6 ? [] : [`${d.name}: the laptop drawn ${show(lid)} has its middle at x ${+middle.toFixed(2)}, more than 8 px from the mole at x ${d.workX}`]
}

function check(d: Desk): string[] {
  const out: string[] = [], say = (words: string) => out.push(`${d.name}: ${words}`)
  const counts = things.map(t => d.things.filter(p => p.sprite === t).length)
  const one = (t: Thing) => counts[things.indexOf(t)] === 1
  if (d.things.length !== 4 || !['laptop-back', 'coffee-mug', 'desk-plant'].every(t => one(t as Thing)) || !endThings.some(one)) {
    say(`has ${things.map((t, i) => `${counts[i]} ${t}`).join(', ')}, not a laptop, a mug, a plant and either a lamp or a paper stack`); return out
  }
  const at = (t: Thing) => d.things.find(p => p.sprite === t)!
  for (const p of d.things) {
    const [w, h] = sprites[p.sprite]!.size as [number, number], s = p.scale ?? 1
    if (Math.abs(p.width - w * s) > 1e-6 || Math.abs(p.height - h * s) > 1e-6) say(`${p.sprite} is ${p.width}×${p.height}, not its ${w}×${h} picture at scale ${s}`)
    const b = local(base(p), d), t = local(drawn(p), d)
    if (!inside(b, DESK_AREA)) say(`${p.sprite} base ${show(b)} is not inside the area ${show(DESK_AREA)}`)
    if (t.x < DESK_TOP.left - 1e-6 || t.x + t.width > DESK_TOP.right + 1e-6) say(`${p.sprite} drawn ${show(t)} is not between the back rim's sides ${DESK_TOP.left} and ${DESK_TOP.right}`)
    if (t.y + t.height > DESK_TOP.face + 1e-6) say(`${p.sprite} drawn ${show(t)} does not end by row ${DESK_TOP.face - 1}, above the front face`)
    for (const f of d.faces) { const n = covered(p, f); if (n) say(`${p.sprite} drawn ${show(t)} covers ${n} face pixels of ${f.who}`) }
  }
  for (const [i, p] of d.things.entries()) for (const q of d.things.slice(i + 1)) {
    if (overlaps(drawn(p), drawn(q))) say(`${p.sprite} and ${q.sprite} drawn boxes overlap`)
    const apart = gap(local(base(p), d), local(base(q), d))
    if (apart < 2 - 1e-6) say(`${p.sprite} and ${q.sprite} bases are ${+apart.toFixed(2)} px apart`)
  }
  // The lamp at the left end and the stack stand in the left part: left of every other base,
  // their middle left of the desk's. The lamp at the right end is the mirror of that: right of
  // every other base, its middle right of the desk's, and only behind a mole at the middle. On a
  // hall desk either lamp's foot plate starts on the hall's lamp row, so its head stays out of the
  // walk behind the desk.
  const end = d.things.find(p => endThings.includes(p.sprite as Thing))!, e = local(base(end), d), right = end.sprite === 'desk-lamp-right'
  const others = d.things.filter(p => p !== end).map(p => local(base(p), d))
  if (right ? others.some(o => o.x + o.width >= e.x + e.width - 1e-6) || e.x + e.width / 2 <= DESK_TOP.width / 2 : others.some(o => o.x <= e.x + 1e-6) || e.x + e.width / 2 >= DESK_TOP.width / 2)
    say(`the ${end.sprite} base ${show(e)} is not in the ${right ? 'right' : 'left'} part, ${right ? 'right' : 'left'} of the other things`)
  if (right && !(d.workX === WORK_X.middle)) say(`has the lamp at the right end, with its mole at x ${d.workX}, not behind the middle`)
  if (d.hall && lamps.includes(end.sprite as Thing) && !(Math.abs(e.y - LAMP_ROW) <= 1e-6)) say(`the lamp's foot plate ${show(e)} on a hall desk does not start on row ${LAMP_ROW}`)
  // The laptop under the mole behind the desk; the mug next to the laptop; the plant towards
  // the right.
  const laptop = local(base(at('laptop-back')), d), mug = local(base(at('coffee-mug')), d), plant = local(base(at('desk-plant')), d)
  if (!(laptop.x <= d.workX && d.workX < laptop.x + laptop.width)) say(`the laptop ${show(laptop)} is not in front of the mole at x ${d.workX}`)
  if (Math.max(mug.x - laptop.x - laptop.width, laptop.x - mug.x - mug.width) > 12 + 1e-6) say(`the mug ${show(mug)} is more than 12 px from the laptop ${show(laptop)}`)
  if (plant.x + plant.width / 2 <= DESK_TOP.width / 2) say(`the plant ${show(plant)} is not right of the desk's middle`)
  return out
}

const arrangement = (d: Desk) => new Map(d.things.map(p => [p.sprite, local(base(p), d)]))
// Two arrangements differ when one thing's base moved by 6 px or more along x or y, or one
// desk has a lamp where the other has a paper stack.
const differ = (a: Desk, b: Desk) => { const x = arrangement(a), y = arrangement(b); return things.some(t => x.has(t) !== y.has(t) || x.has(t) && Math.max(Math.abs(x.get(t)!.x - y.get(t)!.x), Math.abs(x.get(t)!.y - y.get(t)!.y)) >= 6) }
const same = (a: Desk, b: Desk) => { const x = arrangement(a), y = arrangement(b); return things.every(t => x.has(t) === y.has(t) && (!x.has(t) || Math.abs(x.get(t)!.x - y.get(t)!.x) < 1e-6 && Math.abs(x.get(t)!.y - y.get(t)!.y) < 1e-6)) }

// The radius of the smallest circle round some points: a place within r of every point
// exists when r is at least that radius. The smallest circle passes through two or three of them.
function spread(points: Point[]): number {
  const fits = (c: Point, r: number) => points.every(p => Math.hypot(p.x - c.x, p.y - c.y) <= r + 1e-9)
  let best = points.length < 2 ? 0 : Infinity
  for (const [i, a] of points.entries()) for (const [j, b] of points.entries()) if (j > i) {
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r = Math.hypot(a.x - c.x, a.y - c.y)
    if (r < best && fits(c, r)) best = r
    for (const e of points.slice(j + 1)) {
      const d = 2 * (a.x * (b.y - e.y) + b.x * (e.y - a.y) + e.x * (a.y - b.y)); if (Math.abs(d) < 1e-9) continue
      const q = (p: Point) => p.x * p.x + p.y * p.y
      const o = { x: (q(a) * (b.y - e.y) + q(b) * (e.y - a.y) + q(e) * (a.y - b.y)) / d, y: (q(a) * (e.x - b.x) + q(b) * (a.x - e.x) + q(e) * (b.x - a.x)) / d }, s = Math.hypot(a.x - o.x, a.y - o.y)
      if (s < best && fits(o, s)) best = s
    }
  }
  return best
}

// The desk side by side with d on its right: in d's room, in one row (more than half their
// height shared) and with no desk of that row between them.
const nextInRow = (d: Desk, desks: Desk[]): Desk | undefined => desks.filter(e => e !== d && e.room === d.room && Math.min(d.desk.y + d.desk.height, e.desk.y + e.desk.height) - Math.max(d.desk.y, e.desk.y) > d.desk.height / 2 && e.desk.x > d.desk.x)
  .sort((a, b) => a.desk.x - b.desk.x)[0]
// In every room of two or more desks the end things are not the same everywhere: some desks
// have a lamp and some a paper stack, or the lamps' foot plates are not all within 6 px of one
// place. Where two or more desks of a room have their mole at the middle, one or more of them has
// a lamp and one or more the paper stack.
function variation(desks: Desk[]): string[] {
  const out: string[] = []
  for (const room of new Set(desks.map(d => d.room))) {
    const here = desks.filter(d => d.room === room)
    if (here.length >= 2 && here.every(d => !differ(d, here[0]!))) out.push(`every desk in ${room} has one arrangement`)
    for (const d of here) {
      const next = nextInRow(d, here)
      if (next && !differ(d, next)) out.push(`${d.name} and ${next.name} side by side have one arrangement`)
    }
    const plates = here.flatMap(d => d.things.filter(p => lamps.includes(p.sprite as Thing)).map(p => local(base(p), d)))
    if (here.length >= 2 && (plates.length === here.length || plates.length === 0) && spread(plates) <= 6 + 1e-9)
      out.push(`every desk in ${room} has ${plates.length ? `a lamp, and every foot plate lies within ${+spread(plates).toFixed(2)} px of one place` : 'a paper stack'}`)
    const middle = here.filter(d => d.workX === WORK_X.middle).map(d => d.things.find(p => endThings.includes(p.sprite as Thing))!.sprite)
    if (middle.length >= 2 && !(middle.includes('paper-stack') && middle.some(sprite => sprite !== 'paper-stack')))
      out.push(`the ${middle.length} desks of ${room} whose mole stands at the middle do not have both a lamp and a paper stack`)
  }
  return out
}

// Desks side by side never both have the lamp at the same end. A desk with the paper stack has
// no lamp: check() holds every desk to one thing at an end.
function ends(desks: Desk[]): string[] {
  const lamp = (d: Desk) => d.things.find(p => lamps.includes(p.sprite as Thing))?.sprite
  return desks.flatMap(d => {
    const next = nextInRow(d, desks), here = lamp(d)
    return next && here && here === lamp(next) ? [`${d.name} and ${next.name} side by side both have the lamp at the ${here === 'desk-lamp' ? 'left' : 'right'} end`] : []
  })
}

// The page draws the mole at its desk where atDesk puts it, behind the desk, at one of the work
// places `at`: on every desk of the office building at the desk's middle.
function behind(d: Desk, at: readonly number[]): string[] {
  const home = atDesk(d.seat)
  return d.at.x === home.x && d.at.y === home.y && at.includes(d.workX) ? []
    : [`${d.name}: the mole is drawn at ${d.at.x - d.desk.x},${d.at.y - d.desk.y} of its desk; atDesk puts it at ${home.x - d.desk.x},${home.y - d.desk.y}, and it works at x ${at.join(' or ')}`]
}

it('measures the usable area from the desk picture: rows 8 to 24, 3 px in from the wood on its narrowest row', () => {
  // A pixel is wood when it is opaque and orange: red at least 96 and at least 40 above blue.
  const { atlas, rect: [rx, ry], size } = sprites['worker-desk']!, img = sheet(atlas)
  expect(size).toEqual([DESK_TOP.width, DESK_TOP.height])
  const wood = (x: number, y: number) => { const [r, , b, a] = img.data.subarray(((ry! + y) * img.width + rx! + x) * 4); return a! >= OPAQUE && r! >= 96 && r! >= b! + 40 }
  let left = 0, right: number = DESK_TOP.width
  for (let y = DESK_AREA.y; y < DESK_AREA.y + DESK_AREA.height; y++) {
    let a = DESK_TOP.width / 2, b = a
    expect(wood(a, y), `row ${y} at the middle`).toBe(true)
    while (wood(a - 1, y)) a--
    while (wood(b + 1, y)) b++
    left = Math.max(left, a); right = Math.min(right, b)
  }
  expect([left, right]).toEqual([14, 129])
  expect(DESK_AREA).toEqual({ x: left + 3, y: 8, width: right - 3 - (left + 3) + 1, height: 24 - 8 + 1 })
})

// The laptop seen from behind is the laptop seen from the front turned round on the same desk, so
// its base is as deep: the lower 14 rows of its drawn box, across the box's whole width. Its
// bottom row is the picture's last row with an opaque pixel, and its sides are the first and last
// columns with one.
it('measures the laptop base from its picture: the drawn box\'s sides and last row, 14 rows deep', () => {
  expect(THING_BASES).toHaveProperty(['laptop-back'])
  const img = sheet('desk/laptop-back'), seen = (x: number, y: number) => img.data[(y * img.width + x) * img.channels + 3]! >= OPAQUE
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (seen(x, y)) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
  expect(sprites['laptop-back']!.trim).toEqual([left, top, right + 1, bottom + 1])
  expect(THING_BASES['laptop-back']).toEqual({ x: left, y: bottom - 14 + 1, width: right - left + 1, height: 14 })
})

// The lid in the desk's own orange did not read as a laptop at the page's size, so it is drawn in
// the colours of the laptop seen from the front, and the colour it has most of, its face, is a
// grey: its red, green and blue lie within 24 of each other.
it('draws the laptop seen from behind in the front laptop\'s colours, with a grey face', () => {
  const lid = sheet('desk/laptop-back'), { atlas, rect: [rx, ry, rw, rh] } = sprites['open-laptop']!, front = sheet(atlas)
  const colour = (img: typeof lid, at: number) => [0, 1, 2].map(k => img.data[at + k]!.toString(16).padStart(2, '0')).join('')
  const palette = new Set<string>()
  for (let y = ry!; y < ry! + rh!; y++) for (let x = rx!; x < rx! + rw!; x++) { const at = (y * front.width + x) * front.channels; if (front.data[at + 3]! >= OPAQUE) palette.add(colour(front, at)) }
  const counts = new Map<string, number>()
  for (let at = 0; at < lid.data.length; at += lid.channels) if (lid.data[at + 3]! >= OPAQUE) counts.set(colour(lid, at), (counts.get(colour(lid, at)) ?? 0) + 1)
  expect([...counts.keys()].filter(c => !palette.has(c))).toEqual([])
  const face = [...counts].sort((a, b) => b[1] - a[1])[0]![0], rgb = [0, 2, 4].map(k => parseInt(face.slice(k, k + 2), 16))
  expect(Math.max(...rgb) - Math.min(...rgb), `the face is #${face}`).toBeLessThanOrEqual(24)
})

// A room's desk n takes entry n of the room's order of a list, round the list, so desks 0 to 99
// of one room take every entry of a list of up to 100. Every entry for a mole behind the desk,
// at its middle or where the second of two secretaries works, faces the lid to the mole, whether
// or not a room checked below draws that entry.
it.each(['middle', 'second'] as const)('faces the laptop to a mole working at the %s work place of its desk, in every arrangement', name => {
  const workX = WORK_X[name], [l, , r] = sprites['laptop-back']?.trim ?? [], far: string[] = []
  expect(workX).toBeTypeOf('number')
  for (let index = 0; index < 100; index++) {
    const lids = deskThings('invented-room', index, workX).filter(t => t.sprite === 'laptop-back')
    if (lids.length !== 1) { far.push(`desk ${index} has ${lids.length} laptop-back`); continue }
    const middle = lids[0]!.x + (l! + r!) / 2
    if (Math.abs(middle - workX) > 8 + 1e-6) far.push(`desk ${index} has the laptop's drawn middle at x ${middle}, more than 8 px from x ${workX}`)
  }
  expect(far).toEqual([])
})

const ids = (count: number) => Array.from({ length: count }, (_, i) => `invented-worker-${String(i).padStart(2, '0')}`)
const roomDesks = (count: number) => { const plan = facilityPlan(ids(count), `invented-room-${count}`); return { plan, desks: seated(`room of ${count}`, plan.seats, plan.pieces, count === 13) } }

const ROOMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 24]
it.each(ROOMS)('stands the four things inside each desk area of a %i-person room, apart, clear of every face and varied, behind its mole', count => {
  const { plan, desks } = roomDesks(count), again = roomDesks(count).desks
  expect(desks.length).toBeGreaterThan(0)
  expect(desks).toHaveLength(plan.pieces.filter(p => p.sprite === 'worker-desk').length)
  expect(desks.flatMap(laptops)).toEqual([])
  expect(desks.flatMap(facing)).toEqual([])
  expect(desks.flatMap(check)).toEqual([])
  expect(desks.filter((d, i) => !same(d, again[i]!)).map(d => `${d.name} changes on a second build`)).toEqual([])
  expect(variation(desks)).toEqual([])
  expect(ends(desks)).toEqual([])
  expect(desks.flatMap(d => behind(d, [WORK_X.middle]))).toEqual([])
}, 60000)

it('has the lamp at the left end of some desks and at the right end of others, across the rooms', () => {
  const desks = ROOMS.flatMap(count => roomDesks(count).desks), on = (sprite: Thing) => desks.filter(d => d.things.some(p => p.sprite === sprite)).length
  expect({ left: on('desk-lamp') > 0, right: on('desk-lamp-right') > 0 }).toEqual({ left: true, right: true })
}, 60000)

// The lamp at the right end is the lamp's own picture turned round at draw time, so its foot
// plate is the lamp's turned round in the same canvas: as far from the right side as the lamp's is
// from the left, on the same rows. Its picture is the lamp's, column for column from the other side.
it('stands the lamp at the right end on the mirror of the lamp\'s foot plate, in the mirror of its picture', () => {
  expect(THING_BASES).toHaveProperty(['desk-lamp-right'])
  const lamp = THING_BASES['desk-lamp'], [width, height] = sprites['desk-lamp']!.size as [number, number]
  expect(sprites['desk-lamp-right']!.size).toEqual([width, height])
  expect(THING_BASES['desk-lamp-right']).toEqual({ x: width - lamp.x - lamp.width, y: lamp.y, width: lamp.width, height: lamp.height })
  const left = opaque('desk-lamp'), right = opaque('desk-lamp-right'), unlike: string[] = []
  for (let v = 0; v < height; v++) for (let u = 0; u < width; u++) if (right(u, v) !== left(width - 1 - u, v)) unlike.push(`${u},${v}`)
  expect(unlike).toEqual([])
})

// A thing whose base ends on the desk area's last row stands on the desk; one row lower, it
// does not.
it('counts a thing whose base ends on the desk area\'s last row as standing on its desk', () => {
  const desk = { x: 300, y: 372 }, foot = THING_BASES['coffee-mug'], last = DESK_AREA.y + DESK_AREA.height - foot.height
  const mug = (row: number) => ({ sprite: 'coffee-mug', x: desk.x + DESK_AREA.x - foot.x, y: desk.y + row - foot.y }) as Piece
  expect([standsOn(mug(last), desk), standsOn(mug(last + 1), desk)]).toEqual([true, false])
})

// Every third desk has the paper stack, counted from desk 0 or from desk 1, so exactly one of
// desks 0 and 1 has it, in every room. The two secretaries of a room of two work at those desks,
// the first at the middle and the second at the second work place, so one of them has the stack.
it('gives the paper stack to exactly one of desks 0 and 1, in every room', () => {
  const not: string[] = []
  for (let n = 0; n < 200; n++) {
    const room = `invented-room-${n}`, stacks = [WORK_X.middle, WORK_X.second].filter((workX, index) => deskThings(room, index, workX).some(t => t.sprite === 'paper-stack')).length
    if (stacks !== 1) not.push(`${room} has ${stacks} paper stacks on desks 0 and 1`)
  }
  expect(not).toEqual([])
})

function secretariat(count: number): Desk[] {
  const agents = Array.from({ length: count }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary' }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
  return seated(`secretariat of ${count}`, Object.entries(layout.seats), layout.pieces)
}

it.each([1, 2, 3, 4, 5, 6])('stands the four things inside each desk area of a secretariat of %i, apart, clear of every face and varied', count => {
  const desks = secretariat(count), again = secretariat(count)
  expect(desks).toHaveLength(count)
  expect(desks.flatMap(laptops)).toEqual([])
  expect(desks.flatMap(facing)).toEqual([])
  expect(desks.flatMap(check)).toEqual([])
  expect(desks.filter((d, i) => !same(d, again[i]!)).map(d => `${d.name} changes on a second build`)).toEqual([])
  expect(variation(desks)).toEqual([])
  expect(ends(desks)).toEqual([])
  expect(desks.flatMap(d => behind(d, Object.values(WORK_X)))).toEqual([])
}, 60000)

// The working desk is redrawn round the mole at the mole's own scale, so its things keep
// their places on the room desk, scaled by the redrawn desk's width. The working mole is
// drawn at its foot in every stage of the desk action.
it.each([[null, DEFAULT_MOLE_SCALE], [1.6, standingScale(1.6)]] as const)('keeps the working desk things where the room desk has them, for a mole saved at %s', (saved, scale) => {
  const frames = { first: canonicalFrame('desk', 0).index, last: canonicalFrame('desk', Infinity).index }
  const stages = data.stages.filter(s => s.last >= frames.first && s.first <= frames.last)
  expect(stages.map(s => s.source)).toEqual(['p2', 'seated', 'seated', 'seated', 'p2'])
  const desks: Desk[] = []
  for (let build = 0; build < 2; build++) {
    const f = mapFixture(), plan = facilityPlan([f.actor.key], 'generated-room')
    if (saved !== null) (f.actor.agent as { scale: unknown }).scale = { version: 1, roleAtGeneration: 'worker', value: saved }
    expect(actorScale(f.actor)).toBeCloseTo(scale, 6)
    f.layout.seats = Object.fromEntries(plan.seats); f.layout.pieces = plan.pieces; f.layout.obstacles = plan.obstacles
    const bound = bindActions(f.layout, f.model), seat = f.layout.seats[f.actor.key]!
    expect(bound.bindings.get(f.actor.key)?.action, bound.rejected.join(', ')).toBe('desk')
    const desk = bound.layout.pieces.find(p => p.sprite === 'worker-desk' && (p as ContactPiece).contactSize)!
    expect(desk, 'the working desk').toBeDefined()
    const room = seated('room desk', plan.seats, plan.pieces)[0]!
    const working: Desk = { name: 'the working desk', room: seat.room, hall: false, seat, at: seat.foot, desk, ratio: desk.width / DESK_TOP.width, workX: seat.foot.x - seat.desk.x,
      things: bound.layout.pieces.filter(p => p.sprite in THING_BASES), over: bound.layout.pieces.filter(p => overlaps(p, desk)), faces: stages.map(s => actionFace(s.source, s.origin, seat.foot, scale)) }
    expect(laptops(working)).toEqual([])
    expect(facing(working)).toEqual([])
    expect(check(working)).toEqual([])
    expect(same(working, room), 'the room desk arrangement').toBe(true)
    desks.push(working)
    f.map.dispose()
  }
  expect(same(desks[0]!, desks[1]!), 'the second build').toBe(true)
}, 60000)
