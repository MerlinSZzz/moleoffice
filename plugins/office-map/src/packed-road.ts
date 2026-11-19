// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Point } from './geometry.ts'
import type { Rect } from './viewport.ts'

/** One exact double buffer per ring, shared by worker ground tests and contour caches. */
export function packRing(ring: readonly Point[]): Float64Array {
  const packed = new Float64Array(1 + ring.length * 2); packed[0] = ring.length
  for (let i = 0; i < ring.length; i++) { packed[1 + i * 2] = ring[i]!.x; packed[2 + i * 2] = ring[i]!.y }
  return packed
}
export function packedBounds(packed: Float64Array): Rect {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
  for (let at = 1; at < packed.length; at += 2) { x = Math.min(x, packed[at]!); right = Math.max(right, packed[at]!); y = Math.min(y, packed[at + 1]!); bottom = Math.max(bottom, packed[at + 1]!) }
  return { x, y, width: right - x, height: bottom - y }
}
export function inPackedRing(point: Point, ring: Float64Array): boolean {
  let inside = false
  for (let i = 0, j = ring[0]! - 1; i < ring[0]!; j = i++) {
    const ax = ring[1 + i * 2]!, ay = ring[2 + i * 2]!, bx = ring[1 + j * 2]!, by = ring[2 + j * 2]!
    if ((ay > point.y) !== (by > point.y) && point.x < (bx - ax) * (point.y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}

/** At most 32 original rings per backing store, preserving every double and its
 * paint order. Small ring headers no longer need separate buffers in both VMs. */
export function* coalesceRoads(source: readonly Float64Array[]): Generator<void, Float64Array[]> {
  const result: Float64Array[] = []
  for (let start = 0; start < source.length; start += 32) {
    const local = source.slice(start, start + 32), packed = new Float64Array(local.reduce((n, p) => n + p.length, 0))
    let at = 0
    for (const ring of local) { packed.set(ring, at); at += ring.length; yield }
    result.push(packed)
  }
  return result
}
/** Consumers that need one polygon at a time share a view of its batch. */
export function* packedRings(batches: readonly Float64Array[]): Generator<Float64Array> {
  for (const batch of batches) for (let at = 0; at < batch.length;) {
    const end = at + 1 + batch[at]! * 2
    yield at === 0 && end === batch.length ? batch : batch.subarray(at, end)
    at = end
  }
}
