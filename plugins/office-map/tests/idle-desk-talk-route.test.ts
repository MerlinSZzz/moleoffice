// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeIdle, type Layout } from '../src/geometry.ts'
import { sweptBodyHits, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingScale } from '../src/appearance.ts'
import type { Rect } from '../src/viewport.ts'
import type { RosterView } from '../src/contracts.ts'
import * as bundled from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

// Every scale from the smallest to the largest standing body takes part.
const made = (id: string, role: string, by: string | null, i: number) => agent(id, { role, startedBy: by ? { kind: 'agent', id: by } : null, scale: { version: 1, roleAtGeneration: role, value: (i % 5) / 4 } } as any)
// The capture trial's office: a secretary with two supervisors, nine team workers, an
// inspector and a direct room of thirteen workers, invented-14 to invented-26.
const trialOffice = () => [made('invented-1', 'secretary', null, 0), made('invented-2', 'supervisor', 'invented-1', 1), made('invented-3', 'supervisor', 'invented-1', 2),
  ...[4, 5, 6, 7, 8].map(n => made(`invented-${n}`, 'worker', 'invented-2', n)), ...[9, 10, 11, 12].map(n => made(`invented-${n}`, 'worker', 'invented-3', n)),
  made('invented-13', 'inspector', 'invented-1', 13), ...Array.from({ length: 13 }, (_, i) => made(`invented-${14 + i}`, 'worker', 'invented-1', 14 + i))]
const directRoom = (workers: number) => [made('invented-secretary', 'secretary', null, 0), ...Array.from({ length: workers }, (_, i) => made(`invented-worker-${String(i).padStart(4, '0')}`, 'worker', 'invented-secretary', i + 1))]

// The page asks for a contact route from the walker's desk foot to the target seat's
// talk point. Its blockers are every body but the walker's own, the person seated at
// the target desk included, with the motion furniture and the obstacles.
it.each([['the capture trial office', trialOffice()], ['a room of 13 workers', directRoom(13)], ['a room of 100 workers', directRoom(100)], ['a room of 151 workers', directRoom(151)]] as const)
('lets a walker stand at and reach every desk talk point in %s', (_, agents) => {
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = build.next(); while (!next.done) next = build.next()
  const layout = next.value, pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
  const art: (Rect & { sprite?: string })[] = (OfficeMap.prototype as any).motionFurniture.call({ layout, pack })
  expect(art).not.toBeNull()
  const standing = model.occupants.map(o => ({ key: o.key, id: o.agent.id, seat: layout.seats[o.key]!, body: visualBodyBounds(o.standing.look, o.agent.scale === null ? .82 : standingScale(o.agent.scale.value))! }))
  const bare: Layout = { ...layout, obstacles: [] }
  // The route search's own end check, split into its ground and its blockers.
  const check = (p: { x: number; y: number }, walker: typeof standing[number], blockers: { name: string; rect: Rect }[]) => {
    const ground = routeIdle(bare, p, p, [], walker.key, walker.body, []).status === 'found'
    const hits = blockers.filter(b => sweptBodyHits(p, p, walker.body, b.rect)).map(b => `${b.name} at ${Math.round(b.rect.x)},${Math.round(b.rect.y)}`)
    return ground && !hits.length ? '' : `${ground ? 'on ground' : 'off the ground the search walks'}${hits.length ? `, touching ${hits.join('; ')}` : ''}`
  }
  const desks = standing.filter(p => (p.seat as { activity?: string }).activity === 'desk' || p.seat.desk.width > 0)
  expect(desks.length).toBeGreaterThan(0)
  const failures: string[] = []
  for (const target of desks) {
    const near = desks.filter(p => p !== target && p.seat.room === target.seat.room).sort((a, b) => Math.hypot(a.seat.foot.x - target.seat.foot.x, a.seat.foot.y - target.seat.foot.y) - Math.hypot(b.seat.foot.x - target.seat.foot.x, b.seat.foot.y - target.seat.foot.y))[0]
    if (!near) continue
    const blockers = [...standing.filter(p => p !== near).map(p => ({ name: `body of ${p.id}`, rect: translateBody(p.body, p.seat.foot) })),
      ...art.map(r => ({ name: r.sprite ?? 'furniture', rect: r })), ...layout.obstacles.map(o => ({ name: `${o.kind} obstacle`, rect: o }))]
    const start = check(near.seat.foot, near, blockers), end = check(target.seat.talk, near, blockers)
    const said = `${near.id} from (${near.seat.foot.x},${near.seat.foot.y}) to the talk point of ${target.id} at (${target.seat.talk.x},${target.seat.talk.y})`
    if (start) failures.push(`${said}: the start check fails, ${start}`)
    if (end) failures.push(`${said}: the target check fails, ${end}`)
    if (start || end) continue
    const route = routeIdle(layout, near.seat.foot, target.seat.talk, blockers.slice(0, standing.length - 1).map(b => b.rect), near.key, near.body, art)
    if (route.status !== 'found') failures.push(`${said}: the route search answers ${route.status}`)
  }
  expect(failures).toEqual([])
}, 120000)
