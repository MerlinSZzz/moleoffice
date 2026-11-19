// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { LayoutCache, pointIsClear, routeBetween } from '../src/geometry.ts'
import { drawingLayout, drawingChunks } from '../src/drawing-layout.ts'
import { appendDrawing, emptyDrawing } from '../src/worker-protocol.ts'
import { packedBounds, inPackedRing, packRing } from '../src/packed-road.ts'
import { inPolygon, boundsOf } from '../src/village.ts'
import { protectedAreas } from '../src/nameplates.ts'

it('transfers exactly the old road vertices and keeps all drawing and nameplate geometry', () => {
  const layout = new LayoutCache().layout({ rooms: Array.from({ length: 20 }, (_, i) => ({ id: `room-${i}`, occupants: [`a-${i}`, `b-${i}`] })) })
  const work = drawingLayout(layout); let last = work.next(), slices = 0
  while (!last.done) { slices++; last = work.next() }
  const page = last.value
  expect(slices).toBeGreaterThan(1)
  expect(page.roadDrawing).toBeDefined()
  const rings: { x: number; y: number }[][] = []
  for (const packed of page.roadDrawing!) for (let at = 0; at < packed.length;) {
    const ring = [], count = packed[at++]!
    for (let i = 0; i < count; i++) ring.push({ x: packed[at++]!, y: packed[at++]! })
    rings.push(ring)
  }
  expect(rings).toEqual(layout.road.rings)
  expect(protectedAreas(page)).toEqual(protectedAreas(layout))
  expect(page.seats).toBe(layout.seats); expect(page.pieces).toBe(layout.pieces)
  expect(page.obstacles).toEqual([]); expect(page.road.rings).toEqual([])
  expect(layout.road.rings.length).toBeGreaterThan(0); expect(layout.obstacles.length).toBeGreaterThan(0)
  const copied = structuredClone(page, { transfer: page.roadDrawing!.map(part => part.buffer as ArrayBuffer) })
  expect(copied.roadDrawing!.some(part => part.byteLength > 0)).toBe(true)
  expect(page.roadDrawing!.every(part => part.byteLength === 0)).toBe(true)
  expect(layout.road.rings).toEqual(rings)
})

it('keeps exact ground, collision and route answers with shared variant polygons and double rings', () => {
  const input = { rooms: Array.from({ length: 12 }, (_, i) => ({ id: `room-${i}`, occupants: Array.from({ length: i % 3 === 0 ? 2 : i % 3 === 1 ? 4 : 8 }, (_, j) => `p-${i}-${j}`) })) }
  const old = new LayoutCache().layout(input), compact = new LayoutCache(true).layout(input)
  expect(compact.seats).toEqual(old.seats); expect(compact.pieces).toEqual(old.pieces); expect(compact.bounds).toEqual(old.bounds)
  expect(compact.road.rings).toEqual([])
  expect(compact.roadDrawing).toEqual(old.road.rings.map(packRing))
  const repeated = compact.houses.find(house => compact.houses.some(other => other !== house && other.style === house.style))!
  const houses = compact.houses.filter(h => h.style === repeated.style)
  expect(houses[0]!.walkable).toBe(houses[1]!.walkable)
  for (let i = 0; i < old.road.rings.length; i++) {
    const ring = old.road.rings[i]!, packed = compact.roadDrawing![i]!
    expect(packedBounds(packed)).toEqual(boundsOf(ring))
    const rect = packedBounds(packed)
    for (let n = 0; n < 30; n++) {
      const point = { x: rect.x + rect.width * n / 29, y: rect.y + rect.height * ((n * 7) % 30) / 29 }
      expect(inPackedRing(point, packed)).toBe(inPolygon(point, ring)); expect(pointIsClear(compact, point)).toBe(pointIsClear(old, point))
    }
  }
  for (const [from, to] of [['p-0-0', 'p-11-7'], ['p-3-0', 'p-3-1'], ['p-7-1', 'p-8-3']]) expect(routeBetween(compact, from!, to!)).toEqual(routeBetween(old, from!, to!))
})

it('splits all 5000 seats and scenery into bounded clones and reconstructs the full drawing', () => {
  const input = { rooms: Array.from({ length: 500 }, (_, i) => ({ id: `r-${i}`, occupants: Array.from({ length: 10 }, (_, j) => `p-${i}-${j}`) })) }
  const layout = new LayoutCache(true).layout(input), work = drawingChunks(layout), drawing = emptyDrawing()
  let chunks = 0
  for (;;) {
    const next = work.next()
    if (next.done) {
      const page = Object.assign(next.value, drawing)
      expect(page.seats).toEqual(layout.seats); expect(page.pieces).toEqual(layout.pieces)
      expect(page.roadDrawing).toEqual(layout.roadDrawing); expect(protectedAreas(page)).toEqual(protectedAreas(layout))
      expect(page.obstacles).toEqual([]); break
    }
    const chunk = next.value
    for (const field of ['rooms', 'houses', 'pieces', 'roadDrawing'] as const) expect(chunk[field]?.length ?? 0).toBeLessThanOrEqual(field === 'roadDrawing' ? 32 : 128)
    expect(Object.keys(chunk.seats ?? {}).length).toBeLessThanOrEqual(128)
    const copy = structuredClone(chunk, { transfer: chunk.roadDrawing?.map(part => part.buffer as ArrayBuffer) ?? [] })
    appendDrawing(drawing, copy); chunks++
  }
  expect(chunks).toBeGreaterThan(100)
  expect(layout.roadDrawing!.every(part => part.byteLength > 0)).toBe(true)
}, 30000)
