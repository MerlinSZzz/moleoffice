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

it('provides secretary-to-square routes for approved looks at maximum scale', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 4 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, sprites: any = bundled
  const art = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack: { sources: { sprites }, images: new Map(Object.keys(atlases).map(key => [key, {}])) } })
  expect(art).not.toBeNull()
  const names = ['tuft', 'fringe', 'bun', 'fan', 'crest', 'helmet', 'waves', 'part', 'beret', 'knit', 'raincoat', 'apron', 'bowtie', 'backpack', 'roll', 'flower', 'gardener', 'mapmaker', 'runner'] as const
  const secretary = model.occupants.find(o => o.agent.role === 'secretary')!, start = layout.seats[secretary.key]!.foot
  const occupied = model.occupants.filter(o => o !== secretary).map(o => translateBody(visualBodyBounds(o.standing.look, o.agent.scale === null ? .82 : standingScale(o.agent.scale.value))!, layout.seats[o.key]!.foot))
  for (const name of names) {
    const mover = visualBodyBounds(name, standingScale(1.6))!
    const route = (layout.places?.play ?? []).map(target => routeIdle(layout, start, target, occupied, secretary.key, mover, art)).find(candidate => candidate.status === 'found')
    expect(route, name).toBeDefined()
    for (let i = 1; i < route!.points.length; i++) for (const obstacle of [...occupied, ...art, ...layout.obstacles]) expect(sweptBodyHits(route!.points[i - 1]!, route!.points[i]!, mover, obstacle), name).toBe(false)
  }
}, 30000)
