// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import * as geometry from '../src/geometry.ts'
import type { Layout, Point } from '../src/geometry.ts'

it('keeps a transparent room open while blocking every visible wall pixel', () => {
  const make = (geometry as any).alphaWallSegments
  expect(make).toBeTypeOf('function')
  const width = 64, height = 64, alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (y < 4 || x < 4 || x >= 60 || (y >= 60 && (x < 24 || x >= 40))) alpha[y * width + x] = 255
  }
  const segments = make(alpha, width, height, 4).map((r: any) => ({ ...r, x: r.x + 32, y: r.y + 32 }))
  const map = { key: 'invented-room', bounds: { x: 0, y: 0, width: 180, height: 160 }, square: { x: 0, y: 0, width: 180, height: 160 }, rooms: [], houses: [], pieces: [], seats: {}, obstacles: [], road: { halfWidth: 39, rings: [], ends: [], faults: [] }, bodyRadius: 2 } as Layout
  const mover = { x: -2, y: -4, width: 4, height: 4 }, route = (geometry as any).routeIdle(map, { x: 64, y: 64 }, { x: 140, y: 64 }, [], undefined, mover, segments)
  expect(route.status).toBe('found')
  expect(route.points.some((p: Point) => p.y >= 96)).toBe(true)
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2))
    for (let n = 0; n <= steps; n++) {
      const x = a.x + (b.x - a.x) * n / steps + mover.x, y = a.y + (b.y - a.y) * n / steps + mover.y
      for (let sy = Math.floor(y - 32); sy < Math.ceil(y + mover.height - 32); sy++) for (let sx = Math.floor(x - 32); sx < Math.ceil(x + mover.width - 32); sx++) {
        if (sx >= 0 && sy >= 0 && sx < width && sy < height) expect(alpha[sy * width + sx]).toBe(0)
      }
    }
  }
  expect((geometry as any).routeIdle(map, { x: 64, y: 64 }, { x: 94, y: 64 }, [], undefined, mover, segments).status).not.toBe('found')
})
