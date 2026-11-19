// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Layout } from './geometry.ts'

/** A loading overview uses the exact current room extents without waiting for desks or paths.
 * Its projection is independent of the interactive camera, so the completed map keeps that camera. */
export function overviewPlan(layout: Layout, width: number, height: number, padding: number) {
  const scale = Math.min(Math.max(1, width - padding * 2) / layout.bounds.width, Math.max(1, height - padding * 2) / layout.bounds.height)
  const left = (width - layout.bounds.width * scale) / 2, top = (height - layout.bounds.height * scale) / 2
  const rect = (r: { x: number; y: number; width: number; height: number }) => ({ x: left + (r.x - layout.bounds.x) * scale, y: top + (r.y - layout.bounds.y) * scale, width: r.width * scale, height: r.height * scale })
  return { square: rect(layout.square), rooms: layout.rooms.map(room => ({ id: room.id, ...rect(room) })) }
}
