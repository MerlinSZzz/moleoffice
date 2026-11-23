// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { standingLooks } from '../src/appearance.ts'
import { routeIdle } from '../src/geometry.ts'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { translateBody, visualBodyBounds } from '../src/visual-body.ts'
import type { RosterView } from '../src/contracts.ts'
import * as bundled from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

// Use the smallest body enclosing all standing looks at each size, for the walker and everyone at their feet.
function bodyFor(size: number) {
  const bodies = standingLooks.map(look => visualBodyBounds(look, size)!)
  const x = Math.min(...bodies.map(body => body.x)), y = Math.min(...bodies.map(body => body.y))
  const right = Math.max(...bodies.map(body => body.x + body.width)), bottom = Math.max(...bodies.map(body => body.y + body.height))
  return { x, y, width: right - x, height: bottom - y }
}

it.each(Array.from({ length: 14 }, (_, i) => i + 1))('lets every secretary in a hall of %i walk to a play place at both sizes', count => {
  const secretaries = Array.from({ length: count }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary' }))
  const worker = agent('invented-worker-0', { startedBy: { kind: 'agent', id: 'invented-secretary-0' } })
  const model = mapOffice({ ...people, view: 'roster', agents: [...secretaries, worker] } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let result = build.next(); while (!result.done) result = build.next()
  const layout = result.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack }); expect(art).not.toBeNull()
  const entries = model.occupants.filter(o => o.agent.role === 'secretary').map(o => ({ o, seat: layout.seats[o.key]! }))
  const hall = layout.houses.find(h => h.group === entries[0]!.seat.room)!
  const failures: string[] = []
  for (const size of [.82, .92]) {
    const body = bodyFor(size)
    for (const mover of entries) {
      const occupied = entries.filter(e => e !== mover).map(e => translateBody(body, e.seat.foot))
      const found = layout.places!.play.some(place => routeIdle(layout, mover.seat.foot, place, occupied, mover.o.key, body, art).status === 'found')
      if (!found) failures.push(`hall ${count}, desk ${mover.seat.desk.x - hall.x},${mover.seat.desk.y - hall.y}, size ${size}`)
    }
  }
  expect(failures).toEqual([])
}, 120000)
