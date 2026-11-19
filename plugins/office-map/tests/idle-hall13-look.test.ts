// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { hall13Bays } from '../src/ownership-facilities.ts'
import { Nameplates, PLATE_BACK_INSET, PLATE_GAP, PLATE_WALL_INSET, PLATE_WIDTH, bodyBox, insideRoom, overlaps } from '../src/nameplates.ts'
import { ownershipAreaLabelsOrSkips } from '../src/ownership-area-labels.ts'
import { routeBetween, type Station } from '../src/geometry.ts'
import { inPolygon } from '../src/village.ts'
import { atDesk } from '../src/desk-things.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

// Every agent, person and project in this file is invented.
type Activity = Station & { activity?: string; outdoors?: boolean }
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const next = work.next(); if (next.done) return next.value } }
const agents = [agent('invented-secretary', { role: 'secretary' }),
  ...Array.from({ length: 13 }, (_, i) => agent(`invented-worker-${String(i).padStart(2, '0')}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
const house = layout.houses.find(h => h.type === 'direct')!
const seats = Object.entries(layout.seats).filter(([, seat]) => seat.room === house.group) as [string, Activity][]
const desks = seats.filter(([, seat]) => seat.activity === 'desk')
const readers = (layout.facilities ?? []).filter(place => place.room === house.group && place.activity === 'reading')

it('furnishes the 13-person hall with a desk for everyone and three reading places', () => {
  expect(house.width).toBe(hall13Bays.width)
  expect(house.height).toBe(hall13Bays.height)
  expect(seats).toHaveLength(13)
  expect(desks).toHaveLength(13)
  expect(readers).toHaveLength(3)
  for (const [, seat] of desks) {
    expect(seat.desk.x).toBeGreaterThanOrEqual(house.x + hall13Bays.work.x)
    expect(seat.desk.x + seat.desk.width).toBeLessThanOrEqual(house.x + hall13Bays.work.x + hall13Bays.work.width)
    expect(seat.foot.y).toBeLessThan(house.y + house.height)
  }
  for (const place of readers) {
    expect(place.outdoors).toBe(true)
    expect(place.foot.y).toBeGreaterThan(house.y + house.height)
  }
  // The room is sized to its desks: the free floor below the front row is one
  // walking band, not the half-room the old 946 px box left bare.
  const frontFeet = Math.max(...desks.map(([, seat]) => seat.foot.y - house.y))
  expect(house.height - frontFeet).toBeLessThanOrEqual(200)
  // The 7c pieces are in the room itself, not in a second lounge.
  const furnishing = layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
  const inside = furnishing.filter(p => p.x >= house.x && p.x + p.width <= house.x + house.width && p.y >= house.y && p.y + p.height <= house.y + house.height)
  expect(inside.map(p => p.sprite)).toEqual(expect.arrayContaining(['tea-table', 'bookshelf', 'message-board', 'A29', 'A27']))
  // The shelf stays inside the hall; the old shelf on the readers' forecourt is gone.
  expect(layout.pieces.filter(p => p.sprite === 'bookshelf' && p.x >= house.x && p.x <= house.x + house.width && p.y >= house.y + house.height && p.y <= house.y + house.height + 700)).toEqual([])
  // The door sits under the workroom centre.
  expect(house.doors[0]!.x).toBe(house.x + hall13Bays.work.x + hall13Bays.work.width / 2)
})

it('routes every hall desk to the secretary', () => {
  const secretary = Object.entries(layout.seats).find(([, seat]) => layout.houses.find(h => h.group === seat.room)?.type === 'secretariat')![0]
  for (const [id] of seats) expect(routeBetween(layout, id, secretary).status, id).toBe('found')
}, 120000)

it('names the one-room hall once at close zoom and keeps its area name at whole zoom', () => {
  const area = layout.villages!.find(a => a.signs.some(s => s.id === house.group))!
  const measure = (text: string) => text.length * 6
  expect(ownershipAreaLabelsOrSkips(layout, 1, 'en', measure).headers.some(header => header.area.id === area.id)).toBe(false)
  expect(ownershipAreaLabelsOrSkips(layout, .1, 'en', measure).headers.some(header => header.area.id === area.id)).toBe(true)
})

it('keeps every hall worker nameplate inside the room and clear of every other plate', () => {
  const indoors = seats.filter(([, seat]) => !seat.outdoors)
  const actors = indoors.map(([key]) => ({ key, point: layout.seats[key]!.foot }))
  const plates = finish(new Nameplates(layout).placeSteps(actors))
  expect(plates.size).toBe(actors.length)
  const origin = house.walkableOrigin ?? { x: 0, y: 0 }
  for (const actor of actors) {
    const rect = plates.get(actor.key)!
    for (const corner of [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x, y: rect.y + rect.height }, { x: rect.x + rect.width, y: rect.y + rect.height }])
      expect(house.walkable.some(poly => inPolygon({ x: corner.x - origin.x, y: corner.y - origin.y }, poly)), actor.key + ' plate outside the hall').toBe(true)
    for (const other of actors.filter(one => one.key !== actor.key)) {
      const spaced = { x: rect.x - PLATE_GAP, y: rect.y - PLATE_GAP, width: rect.width + PLATE_GAP * 2, height: rect.height + PLATE_GAP * 2 }
      expect(overlaps(spaced, plates.get(other.key)!), actor.key + ' plate too close to ' + other.key).toBe(false)
    }
  }
})

it('keeps the plates inside the room on a drawing layout with no walkable polygons', () => {
  // The browser's drawing layout keeps the house rect and its openings but not the walkable
  // polygons or the obstacles, which arrive only with the navigation data.
  const drawing = { ...layout, houses: layout.houses.map(innerHouse => innerHouse.group === house.group ? { ...innerHouse, walkable: [] } : innerHouse), obstacles: [] }
  const actors = seats.filter(([, seat]) => !seat.outdoors).map(([key]) => ({ key, point: layout.seats[key]!.foot }))
  const plates = finish(new Nameplates(drawing).placeSteps(actors))
  expect(plates.size).toBe(actors.length)
  for (const actor of actors) {
    const rect = plates.get(actor.key)!
    expect(rect.x, actor.key + ' left wall').toBeGreaterThanOrEqual(house.x + PLATE_WALL_INSET)
    expect(rect.y, actor.key + ' back wall').toBeGreaterThanOrEqual(house.y + PLATE_BACK_INSET)
    expect(rect.x + rect.width, actor.key + ' right wall').toBeLessThanOrEqual(house.x + house.width - PLATE_WALL_INSET)
    expect(rect.y + rect.height, actor.key + ' front wall').toBeLessThanOrEqual(house.y + house.height)
  }
})

it('keeps the 6 px gap when two plates would otherwise sit 4 px apart', () => {
  // The hall's first choice is half a plate left of the drawn point. The second
  // actor is one plate width plus four pixels to the right, so without the gap
  // check the second plate would start 4 px after the first ends.
  const firstX = 300, secondX = firstX + PLATE_WIDTH + 4
  const room = { x: 0, y: 0, width: hall13Bays.width, height: hall13Bays.height, group: 'invented-room', type: 'direct', walkable: [], walkableOrigin: { x: 0, y: 0 }, openings: [], doors: [], module: 0, style: 'B06', occupants: [], anchor: { x: 0, y: 0 }, hitArea: [] }
  const desk = { x: 0, y: 0, width: 0, height: 0 }
  const seat = (key: string, x: number) => [key, { room: room.group, index: 0, row: 1, column: 1, mobileRow: 1, foot: { x, y: 300 }, talk: { x, y: 300 }, desk, stool: { x: 0, y: 0, width: 0, height: 0 }, activity: 'desk', cluster: key, outdoors: false }]
  const layout = { ownership: true, seats: Object.fromEntries([seat('invented-a', firstX), seat('invented-b', secondX)]), houses: [room], obstacles: [] }
  const plates = finish(new Nameplates(layout as never).placeSteps([{ key: 'invented-a', point: { x: firstX, y: 300 } }, { key: 'invented-b', point: { x: secondX, y: 300 } }]))
  expect(plates.size).toBe(2)
  const first = plates.get('invented-a')!, second = plates.get('invented-b')!
  const spaced = { x: first.x - PLATE_GAP, y: first.y - PLATE_GAP, width: first.width + PLATE_GAP * 2, height: first.height + PLATE_GAP * 2 }
  expect(overlaps(spaced, second), 'the two plates keep the clear gap').toBe(false)
})

it('keeps the 6 px gap on a non-hall room when the first right-hand choice is blocked', () => {
  // The room is 816 x 480, a direct room but not the hall size, with empty walkable
  // polygons. Three invented seats are in the layout, but only two are actors. The
  // third body (x 561..679) rejects actor a's right-hand first choice, so a's left
  // choice (350..450) is placed. Actor b's right-hand first choice (351..451) then
  // misses a's plate by 4 px: only the general spaced check rejects it.
  const room = { x: 0, y: 0, width: 816, height: 480, group: 'invented-room', type: 'direct', walkable: [], walkableOrigin: { x: 0, y: 0 }, openings: [], doors: [], module: 0, style: 'B06', occupants: [], anchor: { x: 0, y: 0 }, hitArea: [] }
  const desk = { x: 0, y: 0, width: 0, height: 0 }
  const seat = (key: string, x: number) => [key, { room: room.group, index: 0, row: 1, column: 1, mobileRow: 1, foot: { x, y: 300 }, talk: { x, y: 300 }, desk, stool: { x: 0, y: 0, width: 0, height: 0 }, activity: 'desk', cluster: key, outdoors: false }]
  const layout = { ownership: true, seats: Object.fromEntries([seat('invented-a', 511), seat('invented-b', 290), seat('invented-blocker', 620)]), houses: [room], obstacles: [] }
  const plates = finish(new Nameplates(layout as never).placeSteps([{ key: 'invented-a', point: { x: 511, y: 300 } }, { key: 'invented-b', point: { x: 290, y: 300 } }]))
  expect(plates.size).toBe(2)
  const first = plates.get('invented-a')!, second = plates.get('invented-b')!
  const spaced = { x: first.x - PLATE_GAP, y: first.y - PLATE_GAP, width: first.width + PLATE_GAP * 2, height: first.height + PLATE_GAP * 2 }
  expect(overlaps(first, second), 'the two plates do not overlap').toBe(false)
  expect(overlaps(spaced, second), 'the two plates keep the clear gap').toBe(false)
})

it('keeps a non-hall plate inside its own room side walls', () => {
  // The actor near the right wall would put the old generic right-hand choice
  // at x 401..501, outside a 420 px room. The plate must stay inside the room,
  // both on the drawing layout's wall inset and on a walkable floor polygon.
  const room = { x: 0, y: 0, width: 420, height: 360, group: 'invented-room', type: 'direct', walkable: [] as { x: number; y: number }[][], walkableOrigin: { x: 0, y: 0 }, openings: [], doors: [], module: 0, style: 'B06', occupants: [], anchor: { x: 0, y: 0 }, hitArea: [] }
  const desk = { x: 0, y: 0, width: 0, height: 0 }
  const seat = (key: string, x: number, y: number) => [key, { room: room.group, index: 0, row: 1, column: 1, mobileRow: 1, foot: { x, y }, talk: { x, y }, desk, stool: { x: 0, y: 0, width: 0, height: 0 }, activity: 'desk', cluster: key, outdoors: false }]
  const floor = [{ x: 0, y: 0 }, { x: 420, y: 0 }, { x: 420, y: 360 }, { x: 0, y: 360 }]
  for (const [name, walkable] of [['wall inset', []], ['walkable floor', [floor]]] as const) {
    const house = { ...room, walkable: walkable.map(poly => poly.map(corner => ({ ...corner }))) }
    const layout = { ownership: true, seats: Object.fromEntries([seat('invented-a', 340, 260)]), houses: [house], obstacles: [] }
    const plates = finish(new Nameplates(layout as never).placeSteps([{ key: 'invented-a', point: { x: 340, y: 260 } }]))
    const rect = plates.get('invented-a')!
    expect(rect, name + ' plate placed').toBeDefined()
    if (walkable.length) {
      const origin = house.walkableOrigin ?? { x: 0, y: 0 }
      for (const corner of [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x, y: rect.y + rect.height }, { x: rect.x + rect.width, y: rect.y + rect.height }])
        expect(house.walkable.some(poly => inPolygon({ x: corner.x - origin.x, y: corner.y - origin.y }, poly)), name + ' plate outside the room').toBe(true)
    } else {
      expect(rect.x, name + ' left wall').toBeGreaterThanOrEqual(house.x + PLATE_WALL_INSET)
      expect(rect.x + rect.width, name + ' right wall').toBeLessThanOrEqual(house.x + house.width - PLATE_WALL_INSET)
    }
  }
})

it('keeps every non-hall desk plate beside its own mole, not in the middle of the room', () => {
  // Five moles sit in a row behind their own desks in a 1032 x 480 room. The
  // right-hand side choice for the last mole is outside the room and the left
  // one crosses the fourth mole's plate, so an expanding search used to push
  // that plate into the room's middle. Each plate must stay nearest its own
  // mole, under its desk front, and keep the clear gap.
  const columns = [48, 192, 456, 600, 808]
  const floor = [{ x: 48, y: 78 }, { x: 984, y: 78 }, { x: 984, y: 480 }, { x: 48, y: 480 }]
  const room = { x: 0, y: 0, width: 1032, height: 480, group: 'invented-room', type: 'supervisor',
    walkable: [floor], walkableOrigin: { x: 0, y: 0 }, openings: [], doors: [], module: 0, style: 'B06', occupants: [], anchor: { x: 0, y: 0 }, hitArea: [] }
  const rows = columns.map((x, i) => ({ key: 'invented-' + String(i + 1).padStart(2, '0'), x }))
  const layout = { ownership: true, seats: Object.fromEntries(rows.map(row => [row.key, { room: room.group, index: 0, row: 1, column: 1, mobileRow: 1,
    foot: { x: row.x + 72, y: 159 }, talk: { x: row.x + 72, y: 159 }, desk: { x: row.x, y: 135, width: 144, height: 73 },
    stool: { x: 0, y: 0, width: 0, height: 0 }, activity: 'desk', cluster: row.key, outdoors: false }])), houses: [room],
    obstacles: columns.map(x => ({ x, y: 135, width: 144, height: 73, kind: 'desk' })) }
  const actors = rows.map(row => ({ key: row.key, point: atDesk(layout.seats[row.key]!) }))
  const plates = finish(new Nameplates(layout as never).placeSteps(actors))
  expect(plates.size).toBe(actors.length)
  const centre = (rect: { x: number; y: number; width: number; height: number }) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
  for (const actor of actors) {
    const rect = plates.get(actor.key)!
    expect(rect, actor.key + ' plate placed').toBeDefined()
    const middle = centre(rect), nearest = actors.reduce((best, other) => {
      const bestAt = best.point, otherAt = other.point
      return Math.hypot(otherAt.x - middle.x, otherAt.y - middle.y) < Math.hypot(bestAt.x - middle.x, bestAt.y - middle.y) ? other : best
    }, actors[0]!)
    expect(nearest.key, actor.key + ' plate is nearest its own mole').toBe(actor.key)
    expect(Math.hypot(middle.x - actor.point.x, middle.y - actor.point.y), actor.key + ' plate too far from its mole').toBeLessThanOrEqual(72)
    expect(overlaps(rect, bodyBox(actor.point)), actor.key + ' plate covers its mole').toBe(false)
    expect(insideRoom(room as never, rect), actor.key + ' plate outside the room').toBe(true)
    for (const other of actors.filter(one => one.key !== actor.key)) {
      const spaced = { x: rect.x - PLATE_GAP, y: rect.y - PLATE_GAP, width: rect.width + PLATE_GAP * 2, height: rect.height + PLATE_GAP * 2 }
      expect(overlaps(spaced, plates.get(other.key)!), actor.key + ' plate too close to ' + other.key).toBe(false)
    }
  }
})

it('keeps every hall desk plate with the mole drawn at its desk', () => {
  const actors = desks.map(([key, seat]) => ({ key, point: atDesk(seat) }))
  const plates = finish(new Nameplates(layout).placeSteps(actors))
  expect(plates.size).toBe(actors.length)
  const origin = house.walkableOrigin ?? { x: 0, y: 0 }
  for (const actor of actors) {
    const rect = plates.get(actor.key)!
    expect(rect, actor.key + ' plate placed').toBeDefined()
    for (const corner of [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x, y: rect.y + rect.height }, { x: rect.x + rect.width, y: rect.y + rect.height }])
      expect(house.walkable.some(poly => inPolygon({ x: corner.x - origin.x, y: corner.y - origin.y }, poly)), actor.key + ' plate outside the hall').toBe(true)
    expect(overlaps(rect, { x: actor.point.x - 59, y: actor.point.y - 120, width: 118, height: 122 }), actor.key + ' plate covers its mole').toBe(false)
    expect(rect.y - actor.point.y, actor.key + ' plate too far below the drawn mole').toBeLessThanOrEqual(80)
  }
})

it('keeps every hall piece that is not on the floor clear of the drawn desk bodies and talk places', () => {
  const furnishing = layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
  const drawnBodies = desks.map(([, seat]) => bodyBox(atDesk(seat)))
    .filter(body => body.y >= house.y)
  const talkBodies = desks.map(([, seat]) => ({ x: seat.talk.x - 59, y: seat.talk.y - 120, width: 118, height: 122 }))
  for (const piece of furnishing.filter(p => p.layer !== 'floor')) {
    for (const body of drawnBodies) expect(overlaps(piece, body), piece.sprite + ' at ' + piece.x + ',' + piece.y + ' covers a drawn mole').toBe(false)
    for (const body of talkBodies) expect(overlaps(piece, body), piece.sprite + ' at ' + piece.x + ',' + piece.y + ' covers a talk place').toBe(false)
  }
})

it('fills the hall band below the front desk row with three pieces and a floor rug', () => {
  const furnishing = layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing)
  const frontDeskBottom = Math.max(...desks.map(([, seat]) => seat.desk.y + seat.desk.height)) - house.y
  const lower = furnishing.filter(piece => piece.y - house.y + piece.height / 2 > frontDeskBottom)
  expect(lower.filter(piece => piece.layer !== 'floor').length, 'pieces below the front desk row').toBeGreaterThanOrEqual(3)
  expect(lower.some(piece => piece.layer === 'floor'), 'floor rug below the front desk row').toBe(true)
  const talkBodies = desks.map(([, seat]) => ({ x: seat.talk.x - 59, y: seat.talk.y - 120, width: 118, height: 122 }))
  for (const piece of lower.filter(piece => piece.layer !== 'floor')) for (const body of talkBodies)
    expect(overlaps(piece, body), piece.sprite + ' at ' + piece.x + ',' + piece.y + ' covers a talk place').toBe(false)
})
