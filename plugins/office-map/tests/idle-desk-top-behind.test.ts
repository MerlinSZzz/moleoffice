// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { facilityPlan, type FacilityPlan } from '../src/ownership-facilities.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { OfficeMap } from '../src/map-view.ts'
import { sceneOrder, type Actor } from '../src/scene-order.ts'
import { overlaps } from '../src/nameplates.ts'
import type { Layout } from '../src/geometry.ts'
import type { RosterView } from '../src/contracts.ts'
import type { House, Piece } from '../src/village.ts'
import { agent, people } from './fixtures.ts'

// Every desk has a laptop, a mug, and either a lamp at one end or a paper stack, never both:
// three of these.
const props = ['desk-lamp', 'desk-lamp-right', 'paper-stack', 'laptop-back', 'coffee-mug'] as const
const ids = (count: number) => Array.from({ length: count }, (_, i) => `invented-worker-${String(i).padStart(2, '0')}`)
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const next = work.next(); if (next.done) return next.value } }

it.each([1, 8, 10, 12, 13])('rests every desk lamp or paper stack, laptop and mug on the desktop in a %i-person room', size => {
  const plan = facilityPlan(ids(size), `invented-room-${size}`)
  let checked = 0
  for (const prop of plan.pieces.filter(p => props.some(sprite => sprite === p.sprite))) {
    const supports = plan.pieces.filter(p => p.sprite === 'worker-desk' && overlaps(prop, p))
    expect(supports, `${prop.sprite} at ${prop.x},${prop.y} has one supporting desk`).toHaveLength(1)
    const desk = supports[0]!
    expect(prop.x, `${prop.sprite} left edge`).toBeGreaterThanOrEqual(desk.x)
    expect(prop.x + prop.width, `${prop.sprite} right edge`).toBeLessThanOrEqual(desk.x + desk.width)
    expect(prop.y + prop.height, `${prop.sprite} base`).toBeGreaterThan(desk.y)
    expect(prop.y + prop.height, `${prop.sprite} base`).toBeLessThanOrEqual(desk.y + desk.height * .5)
    checked++
  }
  expect(checked).toBe(plan.pieces.filter(p => p.sprite === 'worker-desk').length * 3)
})

function paintOrder(plan: FacilityPlan) {
  const deskSeats = [...plan.seats].filter(([, seat]) => seat.activity === 'desk'), keys = deskSeats.map(([key]) => key)
  const group = deskSeats[0]![1].room
  const house: House = { x: 0, y: 0, width: plan.width, height: plan.height, group, module: 0, style: 'B06', occupants: keys,
    anchor: { x: plan.width / 2, y: plan.height - 24 }, doors: [], openings: [], hitArea: [], walkable: [] }
  const layout = { ...plan, seats: Object.fromEntries(plan.seats), ownership: true } as unknown as Layout
  const fake: any = {
    camera: null, away: undefined, whereaboutsByKey: new Map(keys.map(key => [key, { where: 'desk' }])),
    occupants: new Map(), options: { still: false, wave: null, workAvailable: true }, moving: [], layout, individuals: true, actionBindings: new Map(), freeToWalk: new Set(), atFacility: new Map(),
  }
  const actors: Actor[] = (OfficeMap.prototype as any).actors.call(fake, keys)
  const painted: (Piece | Actor)[] = []
  for (const entry of sceneOrder(plan.pieces, actors, [house])) {
    if (entry?.piece) painted.push(entry.piece)
    else if (entry?.actor) painted.push(entry.actor)
  }
  return { deskSeats, painted }
}

// Eight people take a room recipe, thirteen the hall, and ten or twelve the larger room that is
// laid out desk by desk, so each way a desk is placed is painted here. Behind its desk means within
// the desk's width: in the larger room a mole's foot is beside its desk and the mole is drawn at the desk.
it.each([8, 10, 12, 13])('paints every worker-desk after the coworker seated behind it in a %i-person room', size => {
  const plan = facilityPlan(ids(size), `invented-room-${size}`)
  const { deskSeats, painted } = paintOrder(plan)
  expect(deskSeats.length).toBeGreaterThan(0)
  for (const [key, seat] of deskSeats) {
    const actor = painted.find((item): item is Actor => 'key' in item && item.key === key), desk = painted.find((item): item is Piece => 'sprite' in item && item.sprite === 'worker-desk' && item.x === seat.desk.x && item.y === seat.desk.y)
    expect(actor, `${key} painted`).toBeDefined()
    expect(desk, `${key} desk painted`).toBeDefined()
    expect(actor!.point.x, `${key} drawn behind its desk`).toBeGreaterThanOrEqual(seat.desk.x)
    expect(actor!.point.x, `${key} drawn behind its desk`).toBeLessThanOrEqual(seat.desk.x + seat.desk.width)
    expect(actor!.point.y, `${key} drawn at the desktop`).toBeGreaterThanOrEqual(seat.desk.y)
    expect(actor!.point.y, `${key} drawn at the desktop`).toBeLessThanOrEqual(seat.desk.y + seat.desk.height / 2)
    expect(painted.indexOf(desk!), `${key}'s desk paints after its worker`).toBeGreaterThan(painted.indexOf(actor!))
  }
})

it('puts a secretary desk behind its worker too', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), agent('invented-worker', { startedBy: { kind: 'agent', id: 'invented-secretary' } })]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
  const entry = Object.entries(layout.seats).find(([, seat]) => layout.houses.find(house => house.group === seat.room)?.type === 'secretariat' && seat.desk.width > 0)
  expect(entry).toBeDefined()
  const [key, seat] = entry!
  const fake: any = {
    camera: null, away: undefined, whereaboutsByKey: new Map([[key, { where: 'desk' }]]),
    occupants: new Map(), options: { still: false, wave: null, workAvailable: true }, moving: [], layout, individuals: true, actionBindings: new Map(), freeToWalk: new Set(), atFacility: new Map(),
  }
  const actor = ((OfficeMap.prototype as any).actors.call(fake, [key]) as Actor[])[0]
  expect(actor).toBeDefined()
  const drawn = actor!
  expect(drawn.point.y).toBeGreaterThanOrEqual(seat.desk.y)
  expect(drawn.point.y).toBeLessThanOrEqual(seat.desk.y + seat.desk.height / 2)
  const painted: (Piece | Actor)[] = []
  for (const item of sceneOrder(layout.pieces, [drawn], layout.houses)) {
    if (item?.piece) painted.push(item.piece)
    else if (item?.actor) painted.push(item.actor)
  }
  const desk = painted.find((item): item is Piece => 'sprite' in item && item.sprite === 'worker-desk' && item.x === seat.desk.x && item.y === seat.desk.y)
  expect(desk).toBeDefined()
  expect(painted.indexOf(desk!)).toBeGreaterThan(painted.indexOf(drawn))
})
