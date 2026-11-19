// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Point } from "./geometry.ts"
const key = (p: Point) => `${p.x},${p.y}`
/** Port of the bounded heap search in src/shared/forest-map.ts:158. */
export function search(start: Point, target: (p: Point) => boolean, cost: (p: Point) => number | null,
  estimate: (p: Point) => number, step: number, limit = 80000, directions: readonly Point[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }], edgeClear?: (a: Point, b: Point) => boolean): Point[] | 'ran out' | null {

  const work = searchSteps(start, target, cost, estimate, step, limit, directions, edgeClear)
  for (;;) { const next = work.next(); if (next.done) return next.value }
}
/** The meter, when given, counts every expansion, so a caller can report the work done. */
export function* searchSteps(start: Point, target: (p: Point) => boolean, cost: (p: Point) => number | null,
  estimate: (p: Point) => number, step: number, limit = 80000, directions: readonly Point[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }], edgeClear?: (a: Point, b: Point) => boolean, meter?: { expansions: number }): Generator<void, Point[] | 'ran out' | null> {
  type Item = { p: Point; g: number; f: number }
  const heap: Item[] = []
  const push = (item: Item) => {
    let i = heap.push(item) - 1
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent]!.f <= item.f) break; heap[i] = heap[parent]!; i = parent }
    heap[i] = item
  }
  const pop = (): Item => {
    const first = heap[0]!, last = heap.pop()!
    if (heap.length) {
      let i = 0
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1
        if (child + 1 < heap.length && heap[child + 1]!.f < heap[child]!.f) child++
        if (heap[child]!.f >= last.f) break
        heap[i] = heap[child]!; i = child
      }
      heap[i] = last
    }
    return first
  }
  const startKey = key(start), costs = new Map([[startKey, 0]])
  const parents = new Map<string, Point>()
  push({ p: start, g: 0, f: estimate(start) })
  for (let turn = 0; turn < limit && heap.length; turn++) {
    if (turn % 16 === 0) yield
    if (meter) meter.expansions++
    const item = pop()
    if (item.g !== costs.get(key(item.p))) continue
    if (target(item.p)) {
      const path = [item.p]
      while (key(path[0]!) !== startKey) path.unshift(parents.get(key(path[0]!))!)
      return path
    }
    for (const delta of directions) {
      const p = { x: item.p.x + delta.x * step, y: item.p.y + delta.y * step }
      const nextCost = cost(p)
      if (nextCost === null || (edgeClear && !edgeClear(item.p, p))) continue
      const g = item.g + nextCost * Math.hypot(delta.x, delta.y), k = key(p)
      if (g >= (costs.get(k) ?? Infinity)) continue
      costs.set(k, g); parents.set(k, item.p); push({ p, g, f: g + estimate(p) })
    }
  }
  return heap.length ? 'ran out' : null
}
