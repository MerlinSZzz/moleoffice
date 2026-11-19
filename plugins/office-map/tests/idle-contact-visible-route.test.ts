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

it('gives one invented worker a visible-body-safe route to another worker’s talk point', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 4 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = build.next(); while (!next.done) next = build.next()
  const layout = next.value, pack: any = { sources: { sprites: bundled }, images: new Map(Object.keys(atlases).map(k => [k, {}])) }
  const art = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack }); expect(art).not.toBeNull()
  const entries = model.occupants.map(o => ({ o, foot: layout.seats[o.key]!.foot, body: visualBodyBounds(o.standing.look, o.agent.scale === null ? .82 : standingScale(o.agent.scale.value))! }))
  const from = entries.find(e => e.o.agent.id === 'invented-worker-0')!, to = entries.find(e => e.o.agent.id === 'invented-worker-1')!
  const occupied = entries.filter(e => e !== from).map(e => translateBody(e.body, e.foot)), target = layout.seats[to.o.key]!.talk
  const route = routeIdle(layout, from.foot, target, occupied, from.o.key, from.body, art)
  expect(route.status).toBe('found')
  const obstacles = layout.obstacles
  for (let i = 1; i < route.points.length; i++) for (const obstacle of [...art, ...obstacles, ...occupied])
    expect(sweptBodyHits(route.points[i - 1]!, route.points[i]!, from.body, obstacle)).toBe(false)
}, 30000)
