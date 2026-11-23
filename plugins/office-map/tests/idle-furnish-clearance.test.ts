// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { furnishingDoorway, OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { bodyBox } from '../src/nameplates.ts'
import { routeBetween } from '../src/geometry.ts'
import { houseCatalog } from '../src/village.ts'
import { WALK_WIDTH } from '../src/village-dressing.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
import type { Rect } from '../src/viewport.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
function example(count: number) {
  const agents = [agent('example-secretary', { role: 'secretary' }), agent('example-lead', { role: 'supervisor', startedBy: { kind: 'agent', id: 'example-secretary' } }),
    ...Array.from({ length: count - 1 }, (_, i) => agent(`example-member-${i}`, { startedBy: { kind: 'agent', id: 'example-lead' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster, sleepingCount: 3 }))
}

it('keeps added solid furniture outside door approaches and member clearances at every small room size', () => {
  for (let count = 1; count <= 8; count++) {
    const layout = example(count), house = layout.houses.find(h => h.type === 'supervisor')!
    if (count === 2) {
      const larger = example(3).houses.find(h => h.type === 'supervisor')!
      expect(house.height).toBeLessThan(larger.height)
    }
    const parts = layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing && p.layer !== 'floor' && p.sprite !== 'tea-set')
    expect(parts.some(p => p.sprite === 'bookshelf')).toBe(true)
    for (const [i, part] of parts.entries()) {
      expect(overlaps(part, furnishingDoorway(house)), `${count} ${part.sprite}: doorway`).toBe(false)
      for (const other of parts.slice(i + 1)) expect(overlaps(part, other), `${count} ${part.sprite}/${other.sprite}`).toBe(false)
      for (const id of house.occupants) {
        const seat = layout.seats[id]!
        expect(overlaps(part, seat.desk), `${count} ${part.sprite}/desk`).toBe(false)
        expect(overlaps(part, seat.stool), `${count} ${part.sprite}/stool`).toBe(false)
      }
      for (const id of house.occupants) expect(overlaps(part, bodyBox(layout.seats[id]!.foot)), `${count} ${part.sprite}: ${id}`).toBe(false)
    }
    const other = Object.keys(layout.seats).find(id => layout.seats[id]!.room !== house.group)!
    for (const id of house.occupants) expect(routeBetween(layout, id, other).status, `${count} ${id}`).toBe('found')
  }
}, 30000)

it('keeps solid furniture outside door approaches and secretary clearances at every hall size', () => {
  for (let count = 1; count <= 14; count++) {
    const agents = Array.from({ length: count }, (_, i) => agent(`example-secretary-${i}`, { role: 'secretary' }))
    agents.push(agent('example-worker', { startedBy: { kind: 'agent', id: 'example-secretary-0' } }))
    const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
    const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
    const house = layout.houses.find(h => h.type === 'secretariat')!
    expect(house.occupants).toHaveLength(count)
    const parts = layout.pieces.filter(p => p.group === house.group && (p as typeof p & { furnishing?: boolean }).furnishing && p.layer !== 'floor' && p.sprite !== 'tea-set')
    for (const [i, part] of parts.entries()) {
      expect(overlaps(part, furnishingDoorway(house)), `${count} ${part.sprite}: doorway`).toBe(false)
      for (const other of parts.slice(i + 1)) expect(overlaps(part, other), `${count} ${part.sprite}/${other.sprite}`).toBe(false)
      for (const id of house.occupants) {
        const seat = layout.seats[id]!
        expect(overlaps(part, seat.desk), `${count} ${part.sprite}/desk`).toBe(false)
        expect(overlaps(part, seat.stool), `${count} ${part.sprite}/stool`).toBe(false)
      }
      for (const id of house.occupants) expect(overlaps(part, bodyBox(layout.seats[id]!.foot)), `${count} ${part.sprite}: ${id}`).toBe(false)
    }
    const other = Object.keys(layout.seats).find(id => layout.seats[id]!.room !== house.group)!
    for (const id of house.occupants) expect(routeBetween(layout, id, other).status, `${count} ${id}`).toBe('found')
  }
}, 30000)

// A room of 300,000 square px or more takes a second, floor bookshelf. The secretary hall is left without it: in the
// hall of 6 to 14 one stood below the front row and shut a secretary in its corner. A team room keeps its own.
it('leaves the floor bookshelf out of the secretary hall of 6 to 14 and keeps it in a team room of 9 or more', () => {
  for (const count of [9, 12, 16, 20]) {
    const layout = example(count), house = layout.houses.find(h => h.type === 'supervisor')!
    expect(house.width * house.height, `team room of ${count}`).toBeGreaterThanOrEqual(300000)
    expect(layout.pieces.filter(p => p.group === house.group && p.sprite === 'bookshelf'), `team room of ${count}`).toHaveLength(2)
  }
  for (let count = 6; count <= 14; count++) {
    const agents = Array.from({ length: count }, (_, i) => agent(`example-secretary-${i}`, { role: 'secretary' }))
    const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
    const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
    const hall = layout.houses.find(h => h.occupants.length === count)!
    expect(hall.width * hall.height, `hall of ${count}`).toBeGreaterThanOrEqual(300000)
    expect(layout.pieces.filter(p => p.group === hall.group && p.sprite === 'bookshelf'), `hall of ${count}`).toHaveLength(1)
  }
}, 30000)

it('furnishes sleeping houses against the back and keeps both bed approaches and the door clear', () => {
  const layout = example(5)
  for (const house of layout.houses.filter(h => h.type === 'sleeping-house')) {
    expect([house.width, house.height]).toEqual(houseCatalog.B03!.canvasSize)
    const pieces = layout.pieces.filter(p => p.group === house.group)
    const board = pieces.find(p => p.sprite === 'message-board')!
    expect(board).toBeDefined()
    expect(board.y + board.height).toBeLessThanOrEqual(house.y + 100)
    const solids = pieces.filter(p => ['bookshelf', 'lantern', 'message-board'].includes(p.sprite))
    const beds = pieces.filter(p => p.sprite === 'sleep-bed')
    expect(beds).toHaveLength(2)
    for (const [i, part] of solids.entries()) {
      expect(overlaps(part, furnishingDoorway(house)), part.sprite).toBe(false)
      for (const other of solids.slice(i + 1)) expect(overlaps(part, other), `${part.sprite}/${other.sprite}`).toBe(false)
      for (const bed of beds) expect(overlaps(part, bed), `${part.sprite}/bed`).toBe(false)
    }
  }
  const destination = Object.keys(layout.seats)[0]!, template = layout.seats[destination]!
  for (const [i, point] of layout.places!.sleep.entries()) {
    const house = layout.houses.find(h => h.type === 'sleeping-house' && point.x >= h.x && point.x <= h.x + h.width)!
    const id = `example-sleeper-${i}`
    house.occupants.push(id)
    layout.seats[id] = { ...template, room: house.group, foot: point, talk: point }
  }
  for (const [i] of layout.places!.sleep.entries()) {
    const id = `example-sleeper-${i}`
    expect(routeBetween(layout, id, destination).status, id).toBe('found')
  }
}, 30000)

it('brings the square edges closer while keeping its centre walk and furnishings clear', () => {
  const layout = example(5), s = layout.square
  expect(s.width).toBeLessThanOrEqual(2 * (houseCatalog.B03!.canvasSize[0]! - WALK_WIDTH))
  const trunk = layout.paths!.find(p => p.length === 2 && p[0]!.y === s.y && p[0]!.x === p[1]!.x)!
  expect(trunk).toBeDefined()
  const walk = { x: trunk[0]!.x - WALK_WIDTH / 2, y: s.y, width: WALK_WIDTH, height: s.height }
  const pieces = layout.pieces.filter(p => p.group === null && p.layer === 'object' && p.sprite !== 'tea-set' && p.x >= s.x && p.y >= s.y && p.y + p.height <= s.y + s.height)
  expect(pieces.some(p => p.sprite === 'B64')).toBe(true)
  expect(pieces.some(p => p.sprite === 'A29')).toBe(true)
  for (const [i, part] of pieces.entries()) {
    expect(part.x + part.width, part.sprite).toBeLessThanOrEqual(s.x + s.width)
    expect(overlaps(part, walk), `${part.sprite}: walk`).toBe(false)
    for (const point of layout.places!.play) expect(overlaps(part, bodyBox(point)), `${part.sprite}: play`).toBe(false)
    for (const other of pieces.slice(i + 1)) expect(overlaps(part, other), `${part.sprite}/${other.sprite}`).toBe(false)
  }
})
