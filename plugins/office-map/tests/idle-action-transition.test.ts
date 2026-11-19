// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { visualBodyBounds } from '../src/visual-body.ts'
import { DEFAULT_MOLE_SCALE } from '../src/walks.ts'
import { facilityPlan } from '../src/ownership-facilities.ts'
import { flush } from './tuft-action-fixture.ts'
import { mapFixture } from './tuft-action-map-fixture.ts'

afterEach(async () => { pageActionPacks.setNeeds([]); await flush(); releaseMapSurfaces(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('returns an actor with coherent idle facts to its own static desk before allowing movement', async () => {
  const f = mapFixture(true), sprites = f.pack.sources.sprites as Record<string, any>, standing = sprites['stand-tuft']!
  for (const name of ['walk-tuft-A', 'walk-tuft-pass', 'walk-tuft-B']) sprites[name] = standing
  f.update(); await f.drain(); expect((f.map as any).actionBindings.has(f.actor.key)).toBe(true); f.paints.turn(); f.paints.turn()
  await vi.waitFor(() => expect(pageActionPacks.resident('tuft')).not.toBeNull()); await f.drain()
  expect(f.map.actions.snapshot().actors[f.actor.key]).toBeDefined()
  expect((f.map as any).actionBindings.has(f.actor.key)).toBe(true)
  const active = f.map.motionBounds(f.actor.key); expect(active).not.toBeNull()
  f.actor.work = []
  f.actor.facts = { people: { status: 'loaded', value: f.actor.agent, error: null, revision: 4, pending: false }, work: { status: 'loaded', value: [], error: null, revision: 4, pending: false } } as any
  f.update()
  // While the replacement static scene indexes, routing must not use either stale pose or stale furniture.
  expect(f.map.motionBounds(f.actor.key)).toBeNull()
  expect(f.map.motionFurnitureSnapshot()).toBeNull()
  await f.drain()
  expect((f.map as any).actionBindings.has(f.actor.key)).toBe(false)
  expect((f.map as any).layout).toBe(f.layout)
  expect(f.map.actions.snapshot().actors[f.actor.key]).toBeUndefined()
  expect(f.map.motionBounds(f.actor.key)).toEqual(visualBodyBounds('tuft', DEFAULT_MOLE_SCALE, sprites))
  f.map.dispose()
}, 30000)

it('keeps the other worker’s active action and its full bounds during an idle transition', async () => {
  const f = mapFixture(true), sprites = f.pack.sources.sprites as Record<string, any>, standing = sprites['stand-tuft']!
  for (const name of ['walk-tuft-A', 'walk-tuft-pass', 'walk-tuft-B']) sprites[name] = standing
  f.actor.key = 'generated-departing-worker'
  const other = { ...f.actor, key: 'generated-working-neighbour', agent: { ...f.actor.agent, id: 'generated-working-neighbour' }, work: f.actor.work.map(row => ({ ...row, id: 'generated-other-work' })) }
  f.model.occupants.push(other)
  const plan = facilityPlan([f.actor.key, other.key], 'generated-room')
  f.layout.seats = Object.fromEntries(plan.seats); f.layout.pieces = plan.pieces; f.layout.obstacles = plan.obstacles
  f.update(); await f.drain(); expect((f.map as any).actionBindings.has(f.actor.key)).toBe(true); f.paints.turn(); f.paints.turn()
  await vi.waitFor(() => expect(pageActionPacks.resident('tuft')).not.toBeNull()); await f.drain()
  expect((f.map as any).actionBindings.has(other.key)).toBe(true)
  const otherBounds = f.map.motionBounds(other.key); expect(otherBounds).not.toBeNull()
  const episode = f.map.actions.snapshot().actors[other.key]; expect(episode).toBeDefined()
  f.actor.work = []; f.actor.facts = { people: { status: 'loaded', value: f.actor.agent, error: null, revision: 7, pending: false }, work: { status: 'loaded', value: [], error: null, revision: 7, pending: false } } as any
  f.update(); await f.drain()
  expect((f.map as any).actionBindings.has(f.actor.key)).toBe(false)
  expect((f.map as any).actionBindings.has(other.key)).toBe(true)
  expect(f.map.motionBounds(other.key)).toEqual(otherBounds)
  expect(f.map.actions.snapshot().actors[other.key]?.episodeToken).toBe(episode!.episodeToken)
  f.map.dispose()
}, 30000)

it('finishes a confirmed work action before restoring the desk for an idle actor', async () => {
  const f = mapFixture(true), old = f.actor.key; f.actor.key = 'generated-completed-before-idle'; f.layout.seats[f.actor.key] = f.layout.seats[old]!; delete f.layout.seats[old]
  const row = f.actor.work[0]!; row.detail = 'completed'; row.runStanding = 'closed'; row.executing = false
  f.actor.facts = { people: { status: 'loaded', value: f.actor.agent, error: null, revision: 5, pending: false }, work: { status: 'loaded', value: [row], error: null, revision: 5, pending: false } } as any
  f.update(); await f.drain(); expect((f.map as any).actionBindings.has(f.actor.key)).toBe(true); f.paints.turn(); f.paints.turn()
  await vi.waitFor(() => expect(pageActionPacks.resident('tuft')).not.toBeNull()); await f.drain()
  expect((f.map as any).actionBindings.has(f.actor.key)).toBe(true)
  expect(f.map.actions.snapshot().actors[f.actor.key]).toMatchObject({ terminal: false })
  f.actions.turn(10000); await f.drain()
  // After the last action frame, the normal desk must return before any idle route can start.
  expect((f.map as any).actionBindings.has(f.actor.key)).toBe(false)
  expect((f.map as any).layout).toBe(f.layout)
  f.map.dispose()
}, 30000)

it('withholds route bounds until the changed idle scene is actually presented', async () => {
  const f = mapFixture(true), old = f.actor.key; f.actor.key = 'generated-idle-presentation'; f.layout.seats[f.actor.key] = f.layout.seats[old]!; delete f.layout.seats[old]
  const sprites = f.pack.sources.sprites as Record<string, any>, standing = sprites['stand-tuft']!
  for (const name of ['walk-tuft-A', 'walk-tuft-pass', 'walk-tuft-B']) sprites[name] = standing
  f.update(); await f.drain(); expect((f.map as any).actionBindings.has(f.actor.key)).toBe(true); f.paints.turn(); f.paints.turn()
  await vi.waitFor(() => expect(pageActionPacks.resident('tuft')).not.toBeNull()); await f.drain()
  const present = vi.spyOn(f.map as any, 'present').mockImplementation(() => {})
  f.actor.work = []; f.actor.facts = { people: { status: 'loaded', value: f.actor.agent, error: null, revision: 6, pending: false }, work: { status: 'loaded', value: [], error: null, revision: 6, pending: false } } as any
  f.update(); await f.drain()
  expect(present).toHaveBeenCalled()
  expect(f.map.motionBounds(f.actor.key)).toBeNull()
  expect(f.map.motionFurnitureSnapshot()).toBeNull()
  f.map.dispose()
}, 30000)

it('does not replay an interrupted completed action before restoring an idle desk', async () => {
  const f = mapFixture(true), old = f.actor.key; f.actor.key = 'generated-interrupted-before-idle'; f.layout.seats[f.actor.key] = f.layout.seats[old]!; delete f.layout.seats[old]
  const row = f.actor.work[0]!; row.detail = 'completed'; row.runStanding = 'closed'; row.executing = false
  f.actor.facts = { people: { status: 'loaded', value: f.actor.agent, error: null, revision: 8, pending: false }, work: { status: 'loaded', value: [row], error: null, revision: 8, pending: false } } as any
  f.update(); await f.drain(); expect((f.map as any).actionBindings.has(f.actor.key)).toBe(true); f.paints.turn(); f.paints.turn()
  await vi.waitFor(() => expect(pageActionPacks.resident('tuft')).not.toBeNull()); await f.drain()
  expect(f.map.actions.snapshot().actors[f.actor.key]).toMatchObject({ terminal: false })
  f.map.setMotionActive(false); await f.drain(); f.map.setMotionActive(true); f.update(); await f.drain()
  expect(f.map.actions.snapshot().actors[f.actor.key]).toBeUndefined()
  expect((f.map as any).actionBindings.has(f.actor.key)).toBe(false)
  expect((f.map as any).layout).toBe(f.layout)
  f.map.dispose()
}, 30000)
