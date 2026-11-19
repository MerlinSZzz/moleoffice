// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import catalog from '../assets/village-catalog.json'
import type { SpriteFrame } from './pack.ts'
import type { Rect } from './viewport.ts'
import type { StandingLook } from './appearance.ts'

/** Bounds are relative to the foot anchor. Every moving and gesture frame is
 * included in both facings because direction can change at any route vertex. */
export function visualBodyBounds(look: StandingLook, scale: number, sprites: Record<string, SpriteFrame> = catalog.sprites as Record<string, SpriteFrame>): Rect | null {
  if (!Number.isFinite(scale) || scale <= 0) return null
  const names = [`stand-${look}`, `walk-${look}-A`, `walk-${look}-pass`, `walk-${look}-B`, `wave-${look}`, `cheer-${look}`, `carry-${look}`]
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const name of names) {
    const frame = sprites[name]
    if (!frame || !frame.rect || !frame.trim || !frame.anchor) return null
    const [x, y] = frame.trim, [, , width, height] = frame.rect, [ax, ay] = frame.anchor
    if (![x, y, width, height, ax, ay].every(Number.isFinite) || width! <= 0 || height! <= 0) return null
    left = Math.min(left, (x! - ax!) * scale, (ax! - x! - width!) * scale)
    right = Math.max(right, (x! - ax! + width!) * scale, (ax! - x!) * scale)
    top = Math.min(top, (y! - ay!) * scale); bottom = Math.max(bottom, (y! - ay! + height!) * scale)
  }
  const padding = 1e-6
  return { x: left - padding, y: top - padding, width: right - left + 2 * padding, height: bottom - top + 2 * padding }
}
export function validBody(rect: Rect | null | undefined): rect is Rect {
  return !!rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0
}
export const translateBody = (body: Rect, point: { x: number; y: number }): Rect => ({ ...body, x: body.x + point.x, y: body.y + point.y })
export const bodiesOverlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
/** Segment against an open Minkowski-expanded rectangle. This covers every
 * intermediate position, including short segments and both endpoints. */
export function sweptBodyHits(a: { x: number; y: number }, b: { x: number; y: number }, body: Rect, other: Rect): boolean {
  let lo = 0, hi = 1
  for (const [start, end, min, max] of [[a.x, b.x, other.x - body.x - body.width, other.x + other.width - body.x], [a.y, b.y, other.y - body.y - body.height, other.y + other.height - body.y]]) {
    const delta = end! - start!
    if (delta === 0) { if (start! <= min! || start! >= max!) return false; continue }
    const t1 = (min! - start!) / delta, t2 = (max! - start!) / delta
    lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2))
    if (lo >= hi) return false
  }
  return lo < hi || bodiesOverlap(translateBody(body, a), other) || bodiesOverlap(translateBody(body, b), other)
}
