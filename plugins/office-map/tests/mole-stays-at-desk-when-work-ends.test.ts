// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { mapFixture } from './tuft-action-map-fixture.ts'
import { flush } from './tuft-action-fixture.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { atDesk } from '../src/desk-things.ts'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { facilityPlaces } from '../src/ownership.ts'
import type { Occupant } from '../src/model.ts'

afterEach(async () => {
  pageActionPacks.setNeeds([])
  await flush()
  releaseMapSurfaces()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const loaded = <T>(value: T) => ({ status: 'loaded' as const, value, receivedAt: 1, error: null, revision: 1, pending: false })

it.each([false, true])('keeps a mole behind its desk when work ends (reduced motion: %s)', async still => {
  const f = mapFixture(), seat = f.layout.seats[f.actor.key]!
  const key = f.actor.key
  seat.foot = { x: seat.desk.x + seat.desk.width + 76, y: 500 }
  f.layout.pieces = []
  f.layout.facilities = []
  f.options.still = still
  f.map.setMotionActive(!still)
  const actor = f.actor as Occupant
  actor.facts = { people: loaded({} as never), work: loaded([]) }
  const map = f.map as unknown as {
    actors: (keys: string[]) => { key: string; point: { x: number; y: number }; walk?: unknown }[]
    atFacility: Map<string, unknown>
  }
  const drawn = () => map.actors([key]).find(one => one.key === key)
  const desk = atDesk(seat)
  expect(Math.hypot(desk.x - seat.foot.x, desk.y - seat.foot.y)).toBeGreaterThan(50)

  // A mole already idle on the first draw has no remembered working position.
  actor.work[0]!.runStanding = 'closed'
  f.update(); await f.drain()
  expect(drawn()?.point).toEqual(seat.foot)
  expect(f.map.drawnPoint(key)).toEqual(seat.foot)

  // Make a facility available before drawing the working mole and closing its work.
  const facility = { room: seat.room, index: 0, foot: { x: 800, y: 700 }, activity: 'reading' as const, cluster: 'facility', outdoors: false, pose: 'stand' as const }
  f.layout.facilities = [facility]
  expect(facilityPlaces(f.layout, new Set([key])).get(key)).toEqual(facility)
  expect(facility.foot).not.toEqual(desk)
  actor.work[0]!.runStanding = 'open'
  f.update(); await f.drain()
  expect(drawn()?.point).toEqual(desk)
  expect(drawn()?.walk).toBeUndefined()

  actor.work[0]!.runStanding = 'closed'
  f.update(); await f.drain()
  expect(drawn()?.point).toEqual(desk)
  expect(drawn()?.walk).toBeUndefined()
  expect(f.map.drawnPoint(key)).toEqual(desk)
  expect(drawn()?.point).not.toEqual(seat.foot)
  expect(drawn()?.point).not.toEqual(facility.foot)
  expect(map.atFacility.has(key)).toBe(false)
  f.map.dispose()
}, 30000)
