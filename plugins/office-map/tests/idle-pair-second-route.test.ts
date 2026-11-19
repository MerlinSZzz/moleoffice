// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeIdle } from '../src/geometry.ts'
import { chooseIdleOuting } from '../src/idle-places.ts'
import { occupiedBodies, paperArcClear, PAPER_ARC_SHIFT } from '../src/walks.ts'
import { translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { actorScale } from '../src/action-binding.ts'
import type { Point } from '../src/geometry.ts'
import type { Rect } from '../src/viewport.ts'
import type { RosterView } from '../src/contracts.ts'
import * as bundled from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

// Every id here is made up. A hall of secretaries at the largest saved size, where the pair's places
// crossed, and a room of thirteen workers, where the first walker stood in the second one's way.
const secretaries = (n: number) => Array.from({ length: n }, (_, i) => agent(`invented-secretary-${i}`, { role: 'secretary', scale: { version: 1, roleAtGeneration: 'secretary', value: 1.6 } }))
const room = (n: number) => [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: n }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]

// The page plans an outing with chooseIdleOuting, then routes the first walker with the others at
// their feet and the second with the first already standing at its place, its home still kept.
// Each turn here selects the pair the page's turn would, and every planned route must be found.
it.each([['a hall of 10 secretaries', secretaries(10)], ['a hall of 11 secretaries', secretaries(11)], ['a room of 13 workers', room(13)]] as const)
('finds both routes of every pair outing planned in %s', (_, agents) => {
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = build.next(); while (!next.done) next = build.next()
  const layout = next.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art: Rect[] = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack }), frame = (bundled.sprites as any)['paper-stack']
  const eligible = model.occupants.map(o => ({ id: o.key, name: o.agent.id, foot: layout.seats[o.key]!.foot, body: visualBodyBounds(o.standing.look, actorScale(o))! }))
  const rows = eligible.map(e => ({ id: e.id, home: e.foot, current: e.foot, body: e.body }))
  const failures: string[] = []
  let pairs = 0
  for (let turn = 0; turn < eligible.length; turn++) {
    const selected = [0, 1].map(i => eligible[(turn * 2 + i) % eligible.length]!)
    const others = eligible.filter(e => !selected.includes(e)).map(e => translateBody(e.body, e.foot))
    const paperClear = (points: readonly Point[], bodies: readonly Rect[], blockers: readonly Rect[]) => points.length !== 2 || paperArcClear(points[0]!, frame, [...blockers, ...points.map((q, i) => translateBody(bodies[i]!, q))], PAPER_ARC_SHIFT)
    const outing = chooseIdleOuting(layout, selected.map(e => ({ id: e.id, foot: e.foot, body: e.body })), [...others, ...art, ...layout.obstacles], () => true, turn, paperClear)
    if (!outing) continue
    const walkers = outing.walkers.map(id => eligible.find(e => e.id === id)!)
    if (walkers.length === 2) pairs++
    const standing: { id: string; point: Point }[] = []
    for (const [i, walker] of walkers.entries()) {
      const route = routeIdle(layout, walker.foot, outing.places[i]!, occupiedBodies(rows, walker.id, standing)!, walker.id, walker.body, art)
      if (route.status !== 'found') { failures.push(`turn ${turn}: ${walker.name} from ${walker.foot.x},${walker.foot.y} to ${outing.places[i]!.x},${outing.places[i]!.y}${standing.length ? ' with the first walker at its place' : ''}: ${route.status}`); break }
      standing.push({ id: walker.id, point: outing.places[i]! })
    }
  }
  expect(failures).toEqual([])
  // The rooms still meet in pairs; a check that refused every pair would pass the routes above.
  expect(pairs).toBeGreaterThanOrEqual(eligible.length - 2)
}, 120000)
