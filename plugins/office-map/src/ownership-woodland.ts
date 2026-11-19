// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Layout } from './geometry.ts'
import { VisibleIndex } from './render-plan.ts'
import { isTree, piece, stableHash, type Piece } from './village.ts'
import type { Rect } from './viewport.ts'

export const TREE_CLEARANCE = 96

/** Native irregular groves fill free ground, including the unequal area margins.
 * Full crowns, not just trunks, stay clear of houses, stations and roads. */
export function* ownershipWoodland(layout: Layout): Generator<void, Piece[]> {
  const blocks: Rect[] = [...layout.houses.map(h => ({ x: h.x - 12, y: h.y - 32, width: h.width + 24, height: h.height + 44 })),
    ...(layout.squares ?? []).map(r => ({ x: r.x - 134, y: r.y - 134, width: r.width + 268, height: r.height + 268 })),
    ...layout.pieces.filter(p => p.group === null),
    ...Object.values(layout.seats).map(s => ({ x: s.foot.x - 72, y: s.foot.y - 140, width: 180, height: 196 }))]
  for (const path of layout.paths ?? []) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!
    blocks.push({ x: Math.min(a.x, b.x) - 32, y: Math.min(a.y, b.y) - 32, width: Math.abs(a.x - b.x) + 64, height: Math.abs(a.y - b.y) + 64 })
  }
  const index = yield* VisibleIndex.build(blocks.map(rect => ({ value: rect, rect })))
  const clearGround: Rect[] = [...layout.squares ?? [], ...(layout.places ? [layout.places.sleepingHouse] : []),
    ...layout.houses.flatMap(h => h.doors.map(d => ({ x: d.x, y: d.y, width: 0, height: 0 })))]
  const clearIndex = yield* VisibleIndex.build(clearGround.map(r => {
    const rect = { x: r.x - TREE_CLEARANCE, y: r.y - TREE_CLEARANCE, width: r.width + 2 * TREE_CLEARANCE, height: r.height + 2 * TREE_CLEARANCE }
    return { value: rect, rect }
  }))
  const plants: Piece[] = [], seed = stableHash(layout.houses.map(h => h.group).join('|'))
  const add = (sprite: string, x: number, y: number) => {
    const p = piece(sprite, Math.round(x), Math.round(y), null, 'floor')
    if (p.x < 12 || p.y < 12 || p.x + p.width > layout.bounds.width - 12 || p.y + p.height > layout.bounds.height - 12) return
    if (isTree(p) && clearIndex.query({ left: p.x, top: p.y, width: p.width, height: p.height }).length) return
    if (index.query({ left: p.x, top: p.y, width: p.width, height: p.height }).length) return
    p.decoration = true; plants.push(p)
  }
  for (let y = 28, row = 0; y < layout.bounds.height; y += 192, row++) for (let x = 24; x < layout.bounds.width; x += 208) {
    const hash = stableHash(`${seed}:${x}:${y}`), xx = x + hash % 57 - 28 + (row % 2) * 71, yy = y + (hash >>> 8) % 49 - 24
    // Loose gaps and alternating crown sizes keep groves from becoming rows.
    if (hash % 13 !== 0) {
      add(['tree-assembled', 'pine-tree', 'B56'][hash % 3]!, xx, yy)
      if (hash % 3) add(hash % 2 ? 'pine-tree' : 'B56', xx + 100, yy + 46)
    }
    add('berry-bush', xx + 126, yy + 124)
    add('B57', xx + 74, yy + 169)
    add('ground-fern', xx + 25, yy + 155)
    add('daisies', xx + 142, yy + 185)
    yield
  }
  return plants
}
