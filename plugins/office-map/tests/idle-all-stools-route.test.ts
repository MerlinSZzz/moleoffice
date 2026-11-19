// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeIdle } from '../src/geometry.ts'
import { sweptBodyHits, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingScale } from '../src/appearance.ts'
import type { RosterView } from '../src/contracts.ts'
import { atlases, sprites as bundled } from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

it('keeps every invented worker route clear of every stool, including its own', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 4 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, pack: any = { sources: { sprites: bundled }, images: new Map(Object.keys(atlases).map(key => [key, {}])) }
  const artwork = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack }); expect(artwork).not.toBeNull()
  const entries = model.occupants.map(o => ({ o, foot: layout.seats[o.key]!.foot, body: visualBodyBounds(o.standing.look, o.agent.scale === null ? .82 : standingScale(o.agent.scale.value))! }))
  const workers = entries.filter(e => e.o.agent.id.startsWith('invented-worker-')), failures: string[] = []
  expect(workers).toHaveLength(4)
  for (const e of workers) {
    const occupied = entries.filter(other => other.o.key !== e.o.key).map(other => translateBody(other.body, other.foot))
    const obstacles = layout.obstacles
    if ([...occupied, ...artwork, ...obstacles].some(o => sweptBodyHits(e.foot, e.foot, e.body, o))) { failures.push(`${e.o.agent.id}: blocked start`); continue }
    const route = (layout.places?.play ?? []).map(target => routeIdle(layout, e.foot, target, occupied, e.o.key, e.body, artwork)).find(candidate => candidate.status === 'found')
    if (!route) { failures.push(`${e.o.agent.id}: no route`); continue }
    for (let i = 1; i < route.points.length; i++) for (const obstacle of [...occupied, ...artwork, ...obstacles])
      expect(sweptBodyHits(route.points[i - 1]!, route.points[i]!, e.body, obstacle), e.o.agent.id).toBe(false)
  }
  expect(failures).toEqual([])
}, 30000)

it('routes around the moving member’s own stool when an open detour exists', () => {
  const stool = { x: 160, y: 150, width: 30, height: 100, kind: 'stool', station: 'invented-mover' }
  const layout: any = { key: 'invented-stool-detour', bounds: { x: 0, y: 0, width: 400, height: 400 }, square: { x: 0, y: 0, width: 400, height: 400 }, houses: [], rooms: [], pieces: [], obstacles: [stool], road: { rings: [], ends: [], faults: [], halfWidth: 20 }, bodyRadius: 10 }
  const start = { x: 100, y: 200 }, target = { x: 260, y: 200 }, body = { x: -10, y: -10, width: 20, height: 20 }
  const route = routeIdle(layout, start, target, [], 'invented-mover', body, [])
  expect(route.status).toBe('found')
  for (let i = 1; i < route.points.length; i++) expect(sweptBodyHits(route.points[i - 1]!, route.points[i]!, body, stool)).toBe(false)
})
