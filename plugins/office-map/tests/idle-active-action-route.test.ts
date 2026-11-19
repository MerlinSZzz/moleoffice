// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { routeIdle } from '../src/geometry.ts'
import { occupiedBodies } from '../src/walks.ts'
import { sweptBodyHits, translateBody } from '../src/visual-body.ts'
import { data, flush } from './tuft-action-fixture.ts'
import { mapFixture } from './tuft-action-map-fixture.ts'

afterEach(async () => { pageActionPacks.setNeeds([]); await flush(); releaseMapSurfaces(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('reserves the real active Tuft action through every desk stage and refuses pending bounds', async () => {
  const f = mapFixture(true), sprites = f.pack.sources.sprites as Record<string, any>, standing = sprites['stand-tuft']!
  for (const name of ['walk-tuft-A', 'walk-tuft-pass', 'walk-tuft-B']) sprites[name] = standing
  f.update(); await f.drain()
  expect(f.map.motionBounds(f.actor.key)).toBeNull()
  f.paints.turn(); f.paints.turn(); await vi.waitFor(() => expect(pageActionPacks.resident('tuft')).not.toBeNull()); await f.drain()
  const foot = f.layout.seats[f.actor.key]!.foot, body = f.map.motionBounds(f.actor.key)
  expect(body).not.toBeNull()
  const occupied = occupiedBodies([{ id: f.actor.key, home: foot, current: foot, body }], 'moving-fixture')
  expect(occupied).not.toBeNull()
  const mover = { x: -12, y: -24, width: 24, height: 24 }, start = { x: 200, y: 500 }, target = { x: 680, y: 500 }
  const layout: any = { key: 'made-action-route', bounds: { x: 0, y: 0, width: 900, height: 900 }, square: { x: 0, y: 0, width: 900, height: 900 }, rooms: [], houses: [], pieces: [], seats: {}, obstacles: [], road: { rings: [], ends: [], faults: [], halfWidth: 20 }, bodyRadius: 8 }
  const route = routeIdle(layout, start, target, occupied!, 'moving-fixture', mover, [])
  expect(route.status).toBe('found')
  const times = [0, 800, 400, 400, 400], expected = [60, 84, 96, 108, 120]
  for (let i = 0; i < times.length; i++) {
    f.actions.turn(times[i]); await f.drain()
    const episode = f.map.actions.evidence(f.actor.key)
    expect(episode?.sourceIndex).toBe(expected[i])
    const stage = data.stages.find(one => one.first <= expected[i]! && one.last >= expected[i]!)!
    const source = stage.source === 'stand' ? { width: 128, height: 128 } : data.sources[stage.source]!
    const stageBox = translateBody({ x: (stage.origin[0]! - 231) * .82, y: (stage.origin[1]! - 255) * .82, width: source.width * .82, height: source.height * .82 }, foot)
    const reserved = translateBody(body!, foot)
    expect(reserved.x).toBeLessThanOrEqual(stageBox.x); expect(reserved.y).toBeLessThanOrEqual(stageBox.y)
    expect(reserved.x + reserved.width).toBeGreaterThanOrEqual(stageBox.x + stageBox.width)
    expect(reserved.y + reserved.height).toBeGreaterThanOrEqual(stageBox.y + stageBox.height)
    for (let n = 1; n < route.points.length; n++) expect(sweptBodyHits(route.points[n - 1]!, route.points[n]!, mover, stageBox), `stage ${expected[i]}`).toBe(false)
  }
  f.map.dispose()
}, 30000)
