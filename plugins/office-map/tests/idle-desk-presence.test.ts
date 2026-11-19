// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { OfficeMap } from '../src/map-view.ts'
import { routeIdle } from '../src/geometry.ts'
import { translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingScale } from '../src/appearance.ts'
import type { RosterView } from '../src/contracts.ts'
import catalog from '../assets/village-catalog.json'
import { agent, people } from './fixtures.ts'

// A placement proxy for review, not a replacement for the reconstructed picture.
it.each([1, 2, 4, 5, 8])('places the invented workers below their own desks in a %i-worker room', count => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: count }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = build.next(); while (!next.done) next = build.next()
  for (const occupant of model.occupants.filter(o => o.agent.id.startsWith('invented-worker-'))) {
    const { foot, desk } = next.value.seats[occupant.key]!
    expect(foot.x, occupant.agent.id).toBeGreaterThanOrEqual(desk.x)
    expect(foot.x, occupant.agent.id).toBeLessThanOrEqual(desk.x + desk.width)
    expect(foot.y, occupant.agent.id).toBeGreaterThanOrEqual(desk.y + desk.height)
    expect(foot.y, occupant.agent.id).toBeLessThanOrEqual(desk.y + desk.height + 85)
  }
})

it.each([1, 2, 5])('places the invented secretaries below their own desks in a %i-secretary room', count => {
  const agents = Array.from({ length: count }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary' }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = build.next(); while (!next.done) next = build.next()
  for (const occupant of model.occupants) {
    const { foot, desk } = next.value.seats[occupant.key]!
    expect(foot.x, occupant.agent.id).toBeGreaterThanOrEqual(desk.x)
    expect(foot.x, occupant.agent.id).toBeLessThanOrEqual(desk.x + desk.width)
    expect(foot.y, occupant.agent.id).toBeGreaterThanOrEqual(desk.y + desk.height)
    expect(foot.y, occupant.agent.id).toBeLessThanOrEqual(desk.y + desk.height + 85)
  }
})

// The route search refuses a walk whose start is off the ground it walks or inside a
// blocker, so asking it for a walk from each seat to the seat itself tests both, with
// every other body and all the furniture in place. The outdoor group's pieces must
// also stand on that ground: the search does not walk the grass.
it.each([13, 14, 100, 151, 1000])('stands every seat and every outdoor group piece on ground the route search walks with %i people', size => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: size - 1 }, (_, i) => agent(`invented-worker-${String(i).padStart(4, '0')}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = build.next(); while (!next.done) next = build.next()
  const layout = next.value, fake: any = { layout, pack: { sources: { sprites: catalog.sprites }, images: new Map(Object.keys(catalog.atlases).map(key => [key, {}])) } }
  const art = (OfficeMap.prototype as any).motionFurniture.call(fake)
  const bodies = model.occupants.map(o => ({ key: o.key, foot: layout.seats[o.key]!.foot, body: visualBodyBounds(o.standing.look, o.agent.scale === null ? .82 : standingScale(o.agent.scale.value))! }))
  for (const one of bodies) {
    const others = bodies.filter(other => other !== one).map(other => translateBody(other.body, other.foot))
    expect(routeIdle(layout, one.foot, one.foot, others, one.key, one.body, art).status, `${one.key} at ${one.foot.x},${one.foot.y}`).toBe('found')
  }
  const checked = ['bookshelf', 'tea-table', 'message-board', 'A29']
  const outside = layout.pieces.filter(p => p.group === null && !layout.squares!.some(s => p.x < s.x + s.width && p.x + p.width > s.x && p.y < s.y + s.height + 64 && p.y + p.height > s.y))
  const outdoor = outside.filter(p => checked.includes(p.sprite))
  expect(outdoor.length).toBeGreaterThan(0)
  // Every other piece outdoors is the tea set on its table, the yard's frame or the
  // woodland, which nobody stands beside. A piece the outdoor group gains goes in one
  // list or the other, as the A29 bench did when it replaced B38 and B54.
  expect(outside.filter(p => !checked.includes(p.sprite) && !['tea-set', 'lantern', 'daisies', 'ground-fern', 'berry-bush', 'B56', 'B57', 'pine-tree', 'tree-assembled'].includes(p.sprite)).map(p => `${p.sprite} at ${p.x},${p.y}`)).toEqual([])
  // A board gathering sits on its A29 bench.
  expect(outdoor.some(p => p.sprite === 'A29'), 'the bench of the board gathering').toBe(outdoor.some(p => p.sprite === 'message-board'))
  for (const p of outdoor) {
    const base = { x: p.x + p.width / 2, y: p.y + p.height + 4 }
    expect(routeIdle(layout, base, base, [], undefined, { x: -1, y: -1, width: 2, height: 2 }, []).status, `${p.sprite} at ${p.x},${p.y}`).toBe('found')
  }
}, 120000)
