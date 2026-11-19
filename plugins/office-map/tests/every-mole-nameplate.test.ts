// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { Nameplates, PLATE_AWAY_REACH, PLATE_DESK_GAP, PLATE_GAP, PLATE_HEIGHT, PLATE_STEPS, PLATE_WIDTH, bodyBox, insideRoom, overlaps } from '../src/nameplates.ts'
import { routeBetween, type Station } from '../src/geometry.ts'
import { atDesk } from '../src/desk-things.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
function example(count: number) {
  const agents = [agent('sample-secretary', { role: 'secretary' }), agent('sample-lead', { role: 'supervisor', startedBy: { kind: 'agent', id: 'sample-secretary' } }),
    ...Array.from({ length: count - 1 }, (_, i) => agent(`sample-member-${i}`, { startedBy: { kind: 'agent', id: 'sample-lead' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
function direct(count: number) {
  const agents = [agent('sample-secretary', { role: 'secretary' }),
    ...Array.from({ length: count }, (_, i) => agent(`sample-worker-${i}`, { startedBy: { kind: 'agent', id: 'sample-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
function secretaries(count: number) {
  const agents = [...Array.from({ length: count }, (_, i) => agent(`sample-secretary-${i}`, { role: 'secretary' })),
    agent('sample-secretary-worker', { startedBy: { kind: 'agent', id: 'sample-secretary-0' } })]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
type Seated = Station & { outdoors?: boolean }
const drawn = (seat: Station) => seat.desk.width > 0 ? atDesk(seat) : seat.foot
const drawing = (layout: ReturnType<typeof example>) => ({ ...layout, houses: layout.houses.map(house => ({ ...house, walkable: [] })), obstacles: [] })
const step = Math.max(...PLATE_STEPS)

it('gives every seated mole in every furnished room a nameplate, on the full layout and on a drawing layout with no walkable floor', () => {
  const layouts = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 13].map(count => ({ name: `example ${count}`, layout: example(count) })),
    ...[1, 2, 3, 4, 5, 6].map(count => ({ name: `secretaries ${count}`, layout: secretaries(count) })),
  ]
  const missing: string[] = []
  let seen = 0
  for (const { name, layout } of layouts) {
    const housed = Object.entries(layout.seats).filter(([, seat]) => layout.houses.some(house => house.group === seat.room) && (seat as Seated).outdoors !== true)
    const actors = housed.map(([key, seat]) => ({ key, point: drawn(seat) }))
    seen += actors.length
    for (const [which, theLayout] of [['full', layout], ['drawing', drawing(layout)]] as const) {
      const plates = finish(new Nameplates(theLayout).placeSteps(actors))
      for (const actor of actors) {
        if (plates.has(actor.key)) continue
        const seat = layout.seats[actor.key]!
        const house = layout.houses.find(h => h.group === seat.room)!
        missing.push(`${name}, ${which} layout: ${actor.key} in the ${house.type} at ${actor.point.x - house.x},${actor.point.y - house.y}`)
      }
    }
  }
  expect(missing).toEqual([])
  expect(seen).toBeGreaterThan(0)
})

it("puts the second secretary's plate in the room of two under its own desk, moved at most one plate step toward the middle", () => {
  const layout = secretaries(2)
  const house = layout.houses.find(h => h.type === 'secretariat' && h.occupants.length === 2)
  expect(house).toBeDefined()
  const actors = house!.occupants.map(key => ({ key, point: drawn(layout.seats[key]!) }))
  for (const [which, theLayout] of [['full', layout], ['drawing', drawing(layout)]] as const) {
    const plates = finish(new Nameplates(theLayout).placeSteps(actors))
    for (const actor of actors) {
      const seat = layout.seats[actor.key]!
      const plate = plates.get(actor.key)
      expect(plate, `${which} layout: ${actor.key}`).toBeDefined()
      if (!plate) continue
      expect(plate.y, `${which} layout: ${actor.key}`).toBe(seat.desk.y + seat.desk.height + PLATE_DESK_GAP)
      expect(Math.abs(plate.x - (actor.point.x - 50)), `${which} layout: ${actor.key}`).toBeLessThanOrEqual(step)
    }
  }
})

it("puts every secretary's plate under its own desk, moved at most one plate step toward the middle, in each secretary room of 1 to 24", () => {
  const away: string[] = []
  for (let count = 1; count <= 24; count++) {
    const layout = secretaries(count)
    const house = layout.houses.find(h => h.type === 'secretariat')!
    expect(house.occupants, `secretaries ${count}`).toHaveLength(count)
    const actors = house.occupants.map(key => ({ key, point: drawn(layout.seats[key]!) }))
    for (const [which, theLayout] of [['full', layout], ['drawing', drawing(layout)]] as const) {
      const plates = finish(new Nameplates(theLayout).placeSteps(actors))
      for (const actor of actors) {
        const desk = layout.seats[actor.key]!.desk, plate = plates.get(actor.key)
        if (plate && plate.y === desk.y + desk.height + PLATE_DESK_GAP && Math.abs(plate.x - (actor.point.x - 50)) <= step) continue
        away.push(`secretaries ${count}, ${which} layout: ${actor.key} has ${plate ? `its plate at ${plate.x - house.x},${plate.y - house.y}` : 'no plate'}, not under its desk at ${desk.x - house.x},${desk.y - house.y}`)
      }
    }
  }
  expect(away).toEqual([])
})

// In a room of 9 to 12, or of 14 or more, a mole's foot stands beside its desk, and the mole
// is drawn behind the desk at atDesk(seat), far from that foot. Its plate still goes under its
// own desk, centred on the mole as it is drawn. Where the mole at the desk in front covers that
// place, the plate stands beside the mole instead, level with its body.
it('puts the plate of a mole that works away from its foot under its own desk, or beside it where the mole in front covers that place', () => {
  const wrong: string[] = []
  let under = 0, beside = 0
  for (const { name, layout } of [10, 14].flatMap(count => [{ name: `example ${count}`, layout: example(count) }, { name: `direct ${count}`, layout: direct(count) }])) {
    const housed = Object.entries(layout.seats).filter(([, seat]) => layout.houses.some(house => house.group === seat.room) && (seat as Seated).outdoors !== true && seat.desk.width > 0)
    const actors = housed.map(([key, seat]) => ({ key, point: drawn(seat) }))
    for (const [which, theLayout] of [['full', layout], ['drawing', drawing(layout)]] as const) {
      const plates = finish(new Nameplates(theLayout).placeSteps(actors))
      for (const actor of actors) {
        const seat = layout.seats[actor.key]!, desk = seat.desk, plate = plates.get(actor.key), body = bodyBox(actor.point)
        if (actor.point.x === seat.foot.x) continue
        const place = { x: actor.point.x - PLATE_WIDTH / 2, y: desk.y + desk.height + PLATE_DESK_GAP, width: PLATE_WIDTH, height: PLATE_HEIGHT }
        const covered = actors.some(other => other.key !== actor.key && overlaps(place, bodyBox(other.point)))
        if (covered) beside++; else under++
        if (plate && !covered && plate.y === place.y && Math.abs(plate.x - place.x) <= step) continue
        const gap = plate && Math.max(body.x - plate.x - plate.width, plate.x - body.x - body.width)
        if (plate && covered && gap! >= 0 && gap! <= PLATE_AWAY_REACH && plate.y >= body.y && plate.y + plate.height <= body.y + body.height) continue
        wrong.push(`${name}, ${which} layout: ${actor.key} drawn at ${actor.point.x},${actor.point.y} has ${plate ? `its plate at ${plate.x},${plate.y}` : 'no plate'}, not ${covered ? 'beside it' : `under its desk at ${place.x},${place.y}`}`)
      }
    }
  }
  expect({ under: under > 0, beside: beside > 0 }, 'moles drawn away from their foot, with the place under the desk free and covered').toEqual({ under: true, beside: true })
  expect(wrong).toEqual([])
})

// An actor away at an outdoor play place must keep its plate close enough that a
// view edge cannot show the plate beside the actor while the actor is out of view.
it("keeps every outdoor mole's plate under its feet or over its head, so a view's side edge never shows the plate without its mole", () => {
  const beside: string[] = [], seen = new Map<string, number>()
  for (const { name, layout } of [12, 13].flatMap(count => [{ name: `example ${count}`, layout: example(count) }, { name: `direct ${count}`, layout: direct(count) }])) {
    const housed = Object.entries(layout.seats).filter(([, seat]) => layout.houses.some(house => house.group === seat.room))
    const places = layout.places!.play
    const actors = housed.map(([key, seat], index) => ({ key, point: places[index] ?? drawn(seat) }))
    const outside = actors.slice(0, places.length)
    seen.set(name, outside.length)
    for (const [which, theLayout] of [['full', layout], ['drawing', drawing(layout)]] as const) {
      const plates = finish(new Nameplates(theLayout).placeSteps(actors))
      for (const actor of outside) {
        const plate = plates.get(actor.key), body = bodyBox(actor.point)
        if (plate && plate.x >= body.x && plate.x + plate.width <= body.x + body.width) continue
        beside.push(`${name}, ${which} layout: ${actor.key} at ${actor.point.x},${actor.point.y} has ${plate ? `its plate at x ${plate.x} to ${plate.x + plate.width}` : 'no plate'}, beyond its body at x ${body.x} to ${body.x + body.width}`)
      }
    }
  }
  expect([...seen.values()].every(count => count > 0)).toBe(true)
  expect(beside).toEqual([])
})

// A mole at its own desk keeps its plate inside its room. Only a mole away from its
// desk has its plate placed around it, wherever it stands.
it("keeps the plate of every mole at its own desk inside its room's walls, on the full layout and on a drawing layout", () => {
  const outside: string[] = []
  let seen = 0
  for (const { name, layout } of [...[1, 4, 6, 8, 13].map(count => ({ name: `example ${count}`, layout: example(count) })), { name: 'direct 13', layout: direct(13) },
    ...[2, 5, 9, 15, 24].map(count => ({ name: `secretaries ${count}`, layout: secretaries(count) }))]) {
    const housed = Object.entries(layout.seats).filter(([, seat]) => layout.houses.some(house => house.group === seat.room) && (seat as Seated).outdoors !== true)
    const actors = housed.map(([key, seat]) => ({ key, point: drawn(seat) }))
    seen += actors.length
    for (const [which, theLayout] of [['full', layout], ['drawing', drawing(layout)]] as const) {
      const plates = finish(new Nameplates(theLayout).placeSteps(actors))
      for (const actor of actors) {
        const house = theLayout.houses.find(h => h.group === layout.seats[actor.key]!.room)!, plate = plates.get(actor.key)
        if (plate && insideRoom(house, plate)) continue
        outside.push(`${name}, ${which} layout: ${actor.key} in the ${house.type} has ${plate ? `its plate at ${plate.x - house.x},${plate.y - house.y}, across the walls` : 'no plate'}`)
      }
    }
  }
  expect(seen).toBeGreaterThan(0)
  expect(outside).toEqual([])
})

// An agent the online reading calls offline stands at one of the play places on the
// square, and a picture tool may lay a mole at a sleeping place. The plate of such a
// mole with an indoor desk was put in its desk room, up to 842 px away, or nowhere.
it('gives a mole at a play or sleeping place its plate under its feet or over its head, never across a house wall', () => {
  const away: string[] = []
  let cases = 0
  for (const { name, layout } of [{ name: 'example 13', layout: example(13) }, { name: 'direct 13', layout: direct(13) }, { name: 'example 4', layout: example(4) }]) {
    const keys = Object.keys(layout.seats), places = layout.places!
    for (const [where, list] of [['play', places.play], ['sleeping', places.sleep]] as const) for (const [index, point] of list.entries()) for (const key of keys) {
      cases++
      const actors = [...keys.filter(other => other !== key).map(other => ({ key: other, point: drawn(layout.seats[other]!) })), { key, point }], body = bodyBox(point)
      for (const [which, theLayout] of [['full', layout], ['drawing', drawing(layout)]] as const) {
        const plate = finish(new Nameplates(theLayout).placeSteps(actors)).get(key)
        if (!plate) { away.push(`${name}, ${which} layout: ${key} at ${where} place ${index} has no plate`); continue }
        const under = plate.y >= body.y + body.height && plate.y <= body.y + body.height + PLATE_GAP, over = plate.y + plate.height <= body.y && plate.y + plate.height >= body.y - PLATE_GAP
        const wall = layout.houses.find(h => overlaps(plate, h) && !(plate.x >= h.x && plate.x + plate.width <= h.x + h.width && plate.y >= h.y && plate.y + plate.height <= h.y + h.height))
        if (plate.x >= body.x && plate.x + plate.width <= body.x + body.width && (under || over) && !wall) continue
        away.push(`${name}, ${which} layout: ${key} at ${where} place ${index} (${point.x},${point.y}) has its plate at ${plate.x},${plate.y}${wall ? `, across the walls of the ${wall.type}` : ''}; its body box is ${body.x},${body.y} to ${body.x + body.width},${body.y + body.height}`)
      }
    }
  }
  expect(cases, 'every mole of the three offices at each of the 3 play and 2 sleeping places').toBe(165)
  expect(away).toEqual([])
})

// A walking mole's plate was put in its desk room, across a house wall, or up to 582 px
// from it. Its plate now stays near it, on the floor of the room it walks through, or
// clear of every house outdoors, and the mole shows no plate while nothing that near
// is free (message ZmEpFA2lJmjm).
it('keeps a walking mole\'s plate near it, on the floor of the room it walks through or clear of every house outdoors', () => {
  expect(PLATE_AWAY_REACH, 'about 100 px at most, the limit asked for').toBeLessThanOrEqual(100)
  const wrong: string[] = [], seldom: string[] = []
  for (const { name, layout } of [{ name: 'example 6', layout: example(6) }, { name: 'example 13', layout: example(13) }, { name: 'secretaries 9', layout: secretaries(9) }]) {
    const keys = Object.keys(layout.seats)
    let points = 0, shown = 0
    for (const from of keys) for (const to of keys.filter(key => key !== from).slice(0, 2)) {
      const route = routeBetween(layout, from, to)
      if (route.status !== 'found') continue
      for (const [i, b] of route.points.entries()) {
        const a = route.points[i - 1]
        if (!a) continue
        const steps = Math.max(1, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 24))
        for (let j = 0; j < steps; j++) {
          const point = { x: Math.round(a.x + (b.x - a.x) * j / steps), y: Math.round(a.y + (b.y - a.y) * j / steps) }
          const actors = [...keys.filter(key => key !== from).map(key => ({ key, point: drawn(layout.seats[key]!) })), { key: from, point }]
          const plate = finish(new Nameplates(layout).placeSteps(actors)).get(from)
          points++
          if (!plate) continue
          shown++
          const body = bodyBox(point), gap = Math.max(body.x - plate.x - plate.width, plate.x - body.x - body.width, body.y - plate.y - plate.height, plate.y - body.y - body.height, 0)
          const room = layout.houses.find(h => point.x >= h.x && point.x <= h.x + h.width && point.y >= h.y && point.y <= h.y + h.height)
          const placed = room ? insideRoom(room, plate) : !layout.houses.some(h => overlaps(plate, h))
          if (gap <= PLATE_AWAY_REACH && placed) continue
          wrong.push(`${name}: ${from} walking to ${to} at ${point.x},${point.y} has its plate at ${plate.x},${plate.y}, ${gap} px from its body${placed ? '' : room ? `, off the floor of the ${room.type}` : ', across a house wall'}`)
        }
      }
    }
    expect(points, `${name}: points sampled`).toBeGreaterThan(500)
    // A walking mole may lose its plate for a moment, but not for most of its walk.
    if (shown < points * 0.9) seldom.push(`${name}: a plate at ${shown} of ${points} points`)
  }
  expect({ wrong: wrong.length, first: wrong.slice(0, 6), seldom }).toEqual({ wrong: 0, first: [], seldom: [] })
})
