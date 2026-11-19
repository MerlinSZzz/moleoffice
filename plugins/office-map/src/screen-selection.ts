// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { OfficeModel } from './model.ts'
export const SCREEN_MARGIN = 8
/** The same buffered individual candidates used by the drawing, before any filter. */
export function screenAgents(model: OfficeModel, keys: string[], individuals: boolean): string[] {
  if (!individuals || !keys.length) return []
  const byKey = new Map(model.occupants.map(one => [one.key, one.agent.id]))
  const drawn = new Set(keys.flatMap(key => byKey.has(key) ? [byKey.get(key)!] : []))
  if (!drawn.size) return []
  const order = model.rosterOrder, last = Math.max(...order.map((id, index) => drawn.has(id) ? index : -1))
  const selected = [...drawn]
  for (let offset = 1, added = 0; offset <= order.length && added < SCREEN_MARGIN; offset++) {
    const id = order[(last + offset) % order.length]!
    if (!drawn.has(id)) { selected.push(id); added++ }
  }
  return selected
}
