// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { routeIdle } from '../src/geometry.ts'
import { sweptBodyHits } from '../src/visual-body.ts'

it('routes the whole body around the visible artwork above its floor footprint', () => {
  const layout: any = { key: 'made-up', bounds: { x: 0, y: 0, width: 900, height: 900 }, square: { x: 0, y: 0, width: 900, height: 900 }, rooms: [], houses: [], pieces: [], seats: {}, obstacles: [], road: { rings: [], ends: [], faults: [], halfWidth: 20 }, bodyRadius: 8 }
  const body = { x: -12, y: -40, width: 24, height: 44 }
  const artwork = { x: 400, y: 320, width: 100, height: 260 }
  const start = { x: 200, y: 450 }, target = { x: 700, y: 450 }
  expect(sweptBodyHits(start, target, body, artwork)).toBe(true)
  const route = routeIdle(layout, start, target, [], 'made-up', body, [artwork])
  expect(route.status).toBe('found')
  expect(route.points.length).toBeGreaterThanOrEqual(2)
  for (let i = 1; i < route.points.length; i++) expect(sweptBodyHits(route.points[i - 1]!, route.points[i]!, body, artwork)).toBe(false)
})
