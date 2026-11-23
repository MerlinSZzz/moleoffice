// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { actorScale } from '../src/action-binding.ts'
import { standingLooks } from '../src/appearance.ts'
import { atDesk } from '../src/desk-things.ts'
import { idleStays } from '../src/idle-places.ts'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { translateBody, visualBodyBounds } from '../src/visual-body.ts'
import type { RosterView } from '../src/contracts.ts'
import * as bundled from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

// Each worker starts at its desk; every other mole is drawn at its own desk in
// its own look and size. The page asks whether the worker can set out with the
// drawn furniture, walls and other moles in place.
it.each(Array.from({ length: 24 }, (_, i) => i + 1))('lets every desk in a direct room of %i workers set out', count => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: count }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let result = build.next(); while (!result.done) result = build.next()
  const layout = result.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack }); expect(art).not.toBeNull()
  const entries = model.occupants.map(o => ({ o, seat: layout.seats[o.key]!, body: visualBodyBounds(o.standing.look, actorScale(o))! }))
  const workers = entries.filter(e => e.o.agent.id.startsWith('invented-worker-'))
  expect(workers).toHaveLength(count)
  const failures: string[] = []
  for (const mover of workers) {
    const house = layout.houses.find(h => h.group === mover.seat.room)!
    const occupied = entries.filter(e => e !== mover).map(e => translateBody(e.body, atDesk(e.seat)))
    for (const look of standingLooks) for (const size of [.82, .92]) {
      const walker = { id: mover.o.key, foot: atDesk(mover.seat), body: visualBodyBounds(look, size)!, station: mover.o.key }
      const stays = idleStays(layout, [walker], [...occupied, ...art, ...layout.obstacles])
      if (stays[walker.id]) failures.push(`room of ${count}, desk ${mover.seat.desk.x - house.x},${mover.seat.desk.y - house.y}, ${look}, ${size}: ${stays[walker.id]}`)
    }
  }
  expect(failures).toEqual([])
}, 120000)
