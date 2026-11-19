// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { routeIdle } from '../src/geometry.ts'
import { sweptBodyHits } from '../src/visual-body.ts'

it('routes the entire moving body around furniture artwork even above its base', () => {
  const furniture = { x: 190, y: 150, width: 40, height: 100 }
  const floor = { x: 0, y: 0, width: 420, height: 400 }
  const layout: any = { bounds: floor, square: floor, houses: [], rooms: [], pieces: [], seats: {}, obstacles: [], road: { rings: [], ends: [], faults: [], halfWidth: 20 }, bodyRadius: 8 }
  const body = { x: -15, y: -35, width: 30, height: 40 }
  const route = routeIdle(layout, { x: 100, y: 200 }, { x: 320, y: 200 }, [], undefined, body, [furniture])
  expect(route.status).toBe('found')
  for (let i = 1; i < route.points.length; i++)
    expect(sweptBodyHits(route.points[i - 1]!, route.points[i]!, body, furniture)).toBe(false)
})
