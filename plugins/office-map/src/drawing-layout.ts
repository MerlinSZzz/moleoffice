// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Layout } from './geometry.ts'
import type { DrawingChunk } from './worker-protocol.ts'

// The page uses these exact native hall polygons to place secretary labels.
const plateWalkable = (layout: Layout, house: Layout['houses'][number]) => layout.ownership && house.type === 'secretariat' ? house.walkable : []

/** This drawing keeps no navigation polygons; `drawingChunks` sends them apart. The page needs doors, desks and exact road vertices.
 * Transfer road doubles in bounded batches rather than cloning hundreds of thousands of points. */
export function* drawingLayout(layout: Layout): Generator<void, Layout> {
  const roadDrawing: Float64Array[] = []
  for (const ring of layout.roadDrawing ?? []) { roadDrawing.push(ring.slice()); yield }
  for (let start = 0; start < layout.road.rings.length; start += 32) {
    const rings = layout.road.rings.slice(start, start + 32)
    const packed = new Float64Array(rings.reduce((n, ring) => n + 1 + ring.length * 2, 0))
    let at = 0
    for (const ring of rings) { packed[at++] = ring.length; for (const p of ring) { packed[at++] = p.x; packed[at++] = p.y } }
    roadDrawing.push(packed)
    yield
  }
  const houses = []
  for (let start = 0; start < layout.houses.length; start += 128) {
    for (const house of layout.houses.slice(start, start + 128)) houses.push({ ...house, walkable: plateWalkable(layout, house), hitArea: [] })
    yield
  }
  return { ...layout, houses, obstacles: [], paths: undefined, road: { ...layout.road, rings: [], ends: [] }, roadDrawing }
}

/** No final unbounded structured clone. Each message contains at most 128 entries. The drawing keeps
 * no navigation polygons. The `navigation` messages carry every house's walkable floor, in house
 * order, and every obstacle, so that the page chooses idle places on the ground the worker's route
 * search walks. The ownership worker builds no road rings; its roads are walked from `roadDrawing`. */
export function* drawingChunks(layout: Layout): Generator<DrawingChunk, Layout> {
  for (const key of ['villages', 'squares'] as const) for (let at = 0; at < (layout[key]?.length ?? 0); at += 128) yield { [key]: layout[key]!.slice(at, at + 128) }
  for (const key of ['rooms', 'houses', 'pieces'] as const) for (let at = 0; at < layout[key].length; at += 128) {
    const items = layout[key].slice(at, at + 128)
    yield { [key]: key === 'houses' ? (items as Layout['houses']).map(house => ({ ...house, walkable: plateWalkable(layout, house), hitArea: [] })) : items }
  }
  for (const chunk of layout.planting ?? []) yield { planting: [{ ...chunk, positions: chunk.positions.slice(), sprites: chunk.sprites.slice() }] }
  const keys = Object.keys(layout.seats)
  for (let at = 0; at < keys.length; at += 128) yield { seats: Object.fromEntries(keys.slice(at, at + 128).map(key => [key, layout.seats[key]!])) }
  for (let at = 0; at < (layout.roadDrawing?.length ?? 0); at += 32) yield { roadDrawing: layout.roadDrawing!.slice(at, at + 32).map(ring => ring.slice()) }
  for (let at = 0; at < layout.houses.length; at += 128) yield { navigation: { floors: layout.houses.slice(at, at + 128).map(house => house.walkable) } }
  for (let at = 0; at < layout.obstacles.length; at += 128) yield { navigation: { obstacles: layout.obstacles.slice(at, at + 128) } }
  return { ...layout, rooms: [], houses: [], pieces: [], seats: {}, obstacles: [], paths: undefined, road: { ...layout.road, rings: [], ends: [] }, roadDrawing: [], villages: [], squares: [], planting: [] }
}
