// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { hall13Bays } from '../src/ownership-facilities.ts'
import { Nameplates, walkingPlate, type PlateActor } from '../src/nameplates.ts'
import { routeBetween, type Layout, type Point, type Station } from '../src/geometry.ts'
import { atDesk } from '../src/desk-things.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

// Every agent, person and project in this file is invented.
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const next = work.next(); if (next.done) return next.value } }
const build = (agents: ReturnType<typeof agent>[]) => {
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
const hall13 = build([agent('invented-secretary', { role: 'secretary' }),
  ...Array.from({ length: 13 }, (_, i) => agent(`invented-worker-${String(i).padStart(2, '0')}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))])
const secretaries9 = build([...Array.from({ length: 9 }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary' })),
  agent('invented-secretary-worker', { startedBy: { kind: 'agent', id: 'invented-secretary-0' } })])
const rooms: { name: string; layout: Layout; house: Layout['houses'][number] }[] = [
  { name: 'the hall of 13', layout: hall13, house: hall13.houses.find(h => h.type === 'direct' && h.width === hall13Bays.width && h.height === hall13Bays.height)! },
  { name: "the secretaries' hall of 9", layout: secretaries9, house: secretaries9.houses.find(h => h.type === 'secretariat')! },
]
type Plate = ReturnType<typeof walkingPlate>
const atOwnDesk = (layout: Layout, room: string) => Object.entries(layout.seats).filter(([, seat]) => seat.room === room && seat.desk.width > 0) as [string, Station][]
const at = (rect: Plate | undefined) => rect ? `${rect.x},${rect.y}` : 'none'
const same = (a: Plate | undefined, b: Plate | undefined) => JSON.stringify(a) === JSON.stringify(b)
// The points a mole passes from each desk to the next two, about 24 px apart.
function* walks(layout: Layout, desks: [string, Station][]): Generator<{ from: string; point: Point }> {
  for (const [from] of desks) for (const [to] of desks.filter(([key]) => key !== from).slice(0, 2)) {
    const route = routeBetween(layout, from, to)
    if (route.status !== 'found') continue
    for (const [i, b] of route.points.entries()) {
      const a = route.points[i - 1]
      if (!a) continue
      const steps = Math.max(1, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 24))
      for (let j = 0; j < steps; j++) yield { from, point: { x: Math.round(a.x + (b.x - a.x) * j / steps), y: Math.round(a.y + (b.y - a.y) * j / steps) } }
    }
  }
}

// A walking mole's label hopped to another place, or went missing, whenever its place under the
// feet was taken; before that, a seated mole's label made way for it. A walking label keeps its one
// place under the feet and is drawn with its mole, so what stands in front of the mole covers it;
// a seated label is placed as if no walker were there, and never moves.
it("keeps a walking mole's label at its one place under the feet, and every seated label in its place, all through the walk", () => {
  const hopped: string[] = [], moved: string[] = []
  for (const { name, layout, house } of rooms) {
    expect(house, name).toBeDefined()
    const desks = atOwnDesk(layout, house.group)
    expect(desks.length, `${name}: desks`).toBeGreaterThan(6)
    const still = new Map<string, Map<string, Plate>>()
    let points = 0
    for (const { from, point } of walks(layout, desks)) {
      const others = desks.filter(([key]) => key !== from).map(([key, seat]) => ({ key, point: atDesk(seat) }))
      if (!still.has(from)) still.set(from, finish(new Nameplates(layout).placeSteps(others)))
      const plates = finish(new Nameplates(layout).placeSteps([...others, { key: from, point, walk: true }]))
      points++
      if (!same(plates.get(from), walkingPlate(point))) hopped.push(`${name}: ${from}'s label at ${at(plates.get(from))}, not at ${at(walkingPlate(point))} under its feet`)
      for (const { key } of others) {
        const was = still.get(from)!.get(key), now = plates.get(key)
        if (!same(was, now)) moved.push(`${name}: ${key}'s label went from ${at(was)} to ${at(now)} while ${from} walked at ${point.x},${point.y}`)
      }
    }
    expect(points, `${name}: points walked`).toBeGreaterThan(300)
  }
  expect({ hopped: hopped.length, firstHopped: hopped.slice(0, 4), moved: moved.length, firstMoved: moved.slice(0, 4) })
    .toEqual({ hopped: 0, firstHopped: [], moved: 0, firstMoved: [] })
})

// As a mole stands up its label glides from under its desk to under its feet, and as it sits down
// the glide goes back. A label was withheld for the glide when its way was not clear, so it blinked.
it('keeps a gliding label where the glide puts it as its mole stands up or sits down, and moves no other label', () => {
  const lost: string[] = [], moved: string[] = []
  let glides = 0
  for (const { name, layout, house } of rooms) {
    const desks = atOwnDesk(layout, house.group)
    const everyone = desks.map(([key, seat]) => ({ key, point: atDesk(seat) }))
    const seated = finish(new Nameplates(layout).placeSteps(everyone))
    for (const [from, seat] of desks) {
      const own = seated.get(from), under = walkingPlate(seat.foot)
      expect(own, `${name}: ${from}'s seated label`).toBeDefined()
      const others = everyone.filter(one => one.key !== from)
      for (const progress of [0, 0.25, 0.5, 0.75]) {
        const between = (a: Plate, b: Plate): Plate => ({ ...b, x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress })
        const moments: [string, PlateActor & { plate: Plate }][] = [
          ['stands up', { key: from, point: seat.foot, walk: true, plate: between(own!, under) }],
          ['sits down', { key: from, point: atDesk(seat), plate: between(under, own!) }],
        ]
        for (const [how, actor] of moments) {
          const plates = finish(new Nameplates(layout).placeSteps([...others, actor]))
          glides++
          if (!same(plates.get(from), actor.plate)) lost.push(`${name}: as ${from} ${how}, ${progress * 100}% through the glide, its label was at ${at(plates.get(from))}, not ${at(actor.plate)}`)
          for (const { key } of others) {
            const was = seated.get(key), now = plates.get(key)
            if (!same(was, now)) moved.push(`${name}: ${key}'s label went from ${at(was)} to ${at(now)} as ${from} ${how}, ${progress * 100}% through the glide`)
          }
        }
      }
    }
  }
  expect(glides).toBeGreaterThan(100)
  expect({ lost: lost.length, firstLost: lost.slice(0, 4), moved: moved.length, firstMoved: moved.slice(0, 4) })
    .toEqual({ lost: 0, firstLost: [], moved: 0, firstMoved: [] })
})
