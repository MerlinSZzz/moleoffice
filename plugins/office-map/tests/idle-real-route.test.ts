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

it('finds a visible-body-safe route from an invented furnished roster to the square', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 4 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, sprites: any = bundled
  const fake: any = { layout, pack: { sources: { sprites }, images: new Map(Object.keys(atlases).map(key => [key, {}])) } }
  const art = (OfficeMap.prototype as any).motionFurniture.call(fake)
  expect(art).not.toBeNull()
  let found: { points: { x: number; y: number }[]; mover: any; occupied: any[] } | null = null
  for (const occupant of model.occupants) {
    const start = layout.seats[occupant.key]?.foot
    const mover = visualBodyBounds(occupant.standing.look, occupant.agent.scale === null ? .82 : standingScale(occupant.agent.scale.value))
    if (!start || !mover) continue
    const occupied = model.occupants.filter(other => other.key !== occupant.key).flatMap(other => {
      const foot = layout.seats[other.key]?.foot, body = visualBodyBounds(other.standing.look, other.agent.scale === null ? .82 : standingScale(other.agent.scale.value))
      return foot && body ? [translateBody(body, foot)] : []
    })
    for (const target of layout.places?.play ?? []) {
      const route = routeIdle(layout, start, target, occupied, occupant.key, mover, art)
      if (route.status === 'found') { found = { points: route.points, mover, occupied }; break }
    }
    if (found) break
  }
  expect(found).not.toBeNull()
  for (let i = 1; i < found!.points.length; i++) for (const obstacle of [...found!.occupied, ...art, ...layout.obstacles]) {
    expect(sweptBodyHits(found!.points[i - 1]!, found!.points[i]!, found!.mover, obstacle)).toBe(false)
  }
}, 30000)
