// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Rect } from './viewport.ts'
import type { VillageOverview } from './village-layout.ts'

type Block = VillageOverview['blocks'][number]
export interface PopulationLabel { area: Rect; population: string }
type Measure = (text: string) => number
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
const intersects = (a: Rect, b: Rect, gap: number) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y

/** Measure in world units at the renderer's existing 11 CSS pixel font. The
 * numeral is indivisible; only its optional word can disappear. */
export function populationLabel(block: Block, bounds: Rect, zoom: number, measure: Measure, word: string): PopulationLabel {
  const left = Math.max(block.x, bounds.x), right = Math.min(block.x + block.width, bounds.x + bounds.width)
  const bottom = Math.min(block.y + block.height, bounds.y + bounds.height)
  const first = block.signs[0], suffix = block.signs.length > 1 ? ` +${block.signs.length - 1}` : ''
  const full = `${block.total} ${word}`, numeral = String(block.total)
  const minimum = measure(numeral) + 8 / zoom
  const desired = Math.max(measure(full), measure((first?.label ?? '') + suffix)) + 12 / zoom
  const width = Math.max(minimum, Math.min(right - left - 14 / zoom, desired))
  const area = { x: clamp(left + (right - left - width) / 2, bounds.x, bounds.x + bounds.width - width),
    y: clamp(bottom - 38 / zoom, bounds.y, bounds.y + bounds.height - 32 / zoom), width, height: 32 / zoom }
  return { area, population: measure(full) <= width - 8 / zoom ? full : numeral }
}

/** Find the nearest free rectangle without moving geometry or camera. Candidate
 * rows are the preferred row and occupied edges; each row has free x intervals. */
function* nearest(area: Rect, bounds: Rect, occupied: Rect[], gap: number): Generator<void, Rect | null> {
  let blocked = false, checked = 0
  for (const other of occupied) {
    if (intersects(area, other, gap)) { blocked = true; break }
    if (++checked % 64 === 0) yield
  }
  if (!blocked && area.width <= bounds.width && area.height <= bounds.height) return area
  const ys = new Set([area.y, bounds.y, bounds.y + bounds.height - area.height])
  for (const other of occupied) { ys.add(other.y - area.height - gap); ys.add(other.y + other.height + gap); if (++checked % 64 === 0) yield }
  let best: Rect | null = null, distance = Infinity
  for (const y of ys) {
    if (y < bounds.y || y + area.height > bounds.y + bounds.height) continue
    let free = [{ left: bounds.x, right: bounds.x + bounds.width }]
    for (const other of occupied) {
      if (y < other.y + other.height + gap && y + area.height + gap > other.y) {
        free = free.flatMap(span => {
          const left = Math.max(span.left, other.x - gap), right = Math.min(span.right, other.x + other.width + gap)
          return left >= right ? [span] : [{ left: span.left, right: left }, { left: right, right: span.right }].filter(one => one.right > one.left)
        })
      }
      if (++checked % 64 === 0) yield
    }
    for (const span of free) {
      if (span.right - span.left < area.width) continue
      const x = clamp(area.x, span.left, span.right - area.width), d = (x - area.x) ** 2 + (y - area.y) ** 2
      if (d < distance) { best = { ...area, x, y }; distance = d }
    }
    yield
  }
  return best
}

/** Global, camera-independent placement keeps partially culled neighbours stable.
 * Yield boundaries retain the canvas scheduler's cancellation. */
export function* populationLabelsSteps(blocks: readonly Block[], bounds: Rect, zoom: number, measure: Measure,
  word: string, obstacles: Rect[] = []): Generator<void, Map<string, PopulationLabel>> {
  const labels = new Map<string, PopulationLabel>(), occupied = obstacles.slice(), gap = 2 / zoom
  for (const block of blocks) {
    const label = populationLabel(block, bounds, zoom, measure, word)
    let area = yield* nearest(label.area, bounds, occupied, gap)
    if (!area) {
      // Retain the numeral if optional words leave no free slot.
      const width = measure(String(block.total)) + 8 / zoom
      area = yield* nearest({ ...label.area, width }, bounds, occupied, gap)
    }
    if (!area) throw Error('Overview population labels have no readable space')
    const full = `${block.total} ${word}`
    labels.set(block.id, { area, population: measure(full) <= area.width - 8 / zoom ? full : String(block.total) })
    occupied.push(area)
    yield
  }
  return labels
}
