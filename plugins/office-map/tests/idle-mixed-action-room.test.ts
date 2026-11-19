// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { bindActions } from '../src/action-binding.ts'
import { OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeIdle } from '../src/geometry.ts'
import { sweptBodyHits, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingScale } from '../src/appearance.ts'
import type { RosterView } from '../src/contracts.ts'
import catalog from '../assets/village-catalog.json'
import { atlases, sprites as bundled } from '../src/assets.ts'
import { flush } from './tuft-action-fixture.ts'
import { mapFixture } from './tuft-action-map-fixture.ts'
import { agent, people } from './fixtures.ts'

afterEach(async () => { pageActionPacks.setNeeds([]); await flush(); releaseMapSurfaces(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('routes an idle invented worker around the full active action bounds of the others', async () => {
  const f = mapFixture(true), fixtureSprites = f.pack.sources.sprites as Record<string, any>, standing = fixtureSprites['stand-tuft']!
  for (const name of ['walk-tuft-A', 'walk-tuft-pass', 'walk-tuft-B']) fixtureSprites[name] = standing
  f.update(); await f.drain(); expect(f.map.motionBounds(f.actor.key)).toBeNull(); f.paints.turn(); f.paints.turn()
  await vi.waitFor(() => expect(pageActionPacks.resident('tuft')).not.toBeNull()); await f.drain()
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 4 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  for (const o of model.occupants) if (o.agent.id.startsWith('invented-worker-')) { o.standing = { look: 'tuft', source: 'stable-fallback', recipe: 0 }; o.agent.appearance = null }
  const worker = model.occupants.find(o => o.agent.id === 'invented-worker-0')!, work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let n = work.next(); while (!n.done) n = work.next()
  const result = bindActions(n.value, model, new Set([worker.key])), layout = result.layout
  expect(result.bindings.has(worker.key)).toBe(false)
  const pack: any = { sources: { sprites: bundled }, images: new Map(Object.keys(atlases).map(k => [k, {}])) }
  const fake: any = { layout, pack, individuals: true, occupants: new Map(model.occupants.map(o => [o.key, o])), whereaboutsByKey: new Map(), actionBindings: result.bindings, actions: f.map.actions }
  const entries = model.occupants.map(o => ({ o, foot: layout.seats[o.key]!.foot, body: (OfficeMap.prototype as any).motionBounds.call(fake, o.key) }))
  expect(entries.every(e => e.body)).toBe(true)
  const moving = entries.find(e => e.o === worker)!, scale = worker.agent.scale === null ? .82 : standingScale(worker.agent.scale.value)
  expect(moving.body).toEqual(visualBodyBounds(worker.standing.look, scale, catalog.sprites))
  for (const e of entries.filter(e => result.bindings.has(e.o.key))) expect(e.body.width).toBeGreaterThan(visualBodyBounds(e.o.standing.look, scale, catalog.sprites)!.width)
  const occupied = entries.filter(e => e !== moving).map(e => translateBody(e.body, e.foot)), art = (OfficeMap.prototype as any).motionFurniture.call(fake)
  expect(art).not.toBeNull()
  const found = (layout.places?.play ?? []).map(target => routeIdle(layout, moving.foot, target, occupied, worker.key, moving.body, art)).find(route => route.status === 'found')
  expect(found).toBeDefined()
  const obstacles = layout.obstacles
  for (let i = 1; i < found!.points.length; i++) for (const obstacle of [...art, ...obstacles, ...occupied]) expect(sweptBodyHits(found!.points[i - 1]!, found!.points[i]!, moving.body, obstacle)).toBe(false)
  f.map.dispose()
}, 30000)
