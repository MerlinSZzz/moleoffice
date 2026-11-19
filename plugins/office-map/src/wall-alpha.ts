// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Rect } from './viewport.ts'

/** Every tile containing any non-transparent pixel is covered. Adjacent tiles
 * merge into rectangles without filling transparent gaps between rows. */
export function alphaWallSegments(alpha: Uint8Array, width: number, height: number, tile = 4): Rect[] {
  if (![width, height, tile].every(Number.isSafeInteger) || width <= 0 || height <= 0 || width > 1024 || height > 1024 || tile <= 0 || tile > 64 || alpha.length !== width * height) throw Error('Unknown wall alpha')
  const result: Rect[] = []
  let previous = new Map<string, Rect>()
  for (let y = 0; y < height; y += tile) {
    const rowHeight = Math.min(tile, height - y), runs: [number, number][] = []
    let start = -1
    for (let x = 0; x < width; x += tile) {
      const right = Math.min(width, x + tile); let visible = false
      for (let sy = y; sy < y + rowHeight && !visible; sy++) for (let sx = x; sx < right; sx++) if (alpha[sy * width + sx]) { visible = true; break }
      if (visible && start < 0) start = x
      if ((!visible || right === width) && start >= 0) { runs.push([start, visible && right === width ? right : x]); start = -1 }
    }
    const current = new Map<string, Rect>()
    for (const [left, right] of runs) {
      const key = `${left},${right}`, rect = previous.get(key)
      if (rect) { rect.height += rowHeight; current.set(key, rect) }
      else { const next = { x: left, y, width: right - left, height: rowHeight }; result.push(next); current.set(key, next) }
    }
    previous = current
  }
  return result
}
