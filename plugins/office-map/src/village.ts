// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import catalog from '../assets/village-catalog.json'
import { sleepSprites } from './sleep-art.ts'
import { plantSprites } from './plant-art.ts'
import { deskSprites } from './desk-art.ts'
import type { Point } from './geometry.ts'
import type { Rect } from './viewport.ts'

export interface HouseMetadata {
  canvasSize: number[]; groundAnchor: number[]; collisionPolygons: number[][][]; walkableAreas: number[][][]
  hitArea: number[][]; floorBounds: number[]; deskSlots: { xy: number[]; size: number[] }[]; openings: number[][][]
  layers: { sprite: string; layer: Piece['layer']; anchor: number[]; depth: number | null }[]
}
export const houseCatalog = { ...catalog.houses } as Record<string, HouseMetadata>
// A03's interior rails are not room boundaries. Keep art and route collision in
// one catalogue so neither the close homes nor the woodland retains the fence.
houseCatalog.A03 = { ...houseCatalog.A03!,
  layers: houseCatalog.A03!.layers.filter(layer => layer.sprite !== 'A03-partition'),
  collisionPolygons: houseCatalog.A03!.collisionPolygons.filter(poly => !poly.every(p => p[1]! >= 246 && p[1]! <= 260)),
}
/** Native source crop and its destination offset from the piece origin. */
export interface PieceFragment { x: number; y: number; crop: Rect }
export interface Piece extends Rect { scale?: number; crop?: Rect; fragments?: readonly PieceFragment[]; decoration?: boolean; cached?: boolean; sprite: string; depth: number; layer: 'floor' | 'back' | 'object' | 'front'; group: string | null }
/** A tree is one depth-sorted object, including its canopy. */
export const isTree = (p: Piece): boolean => p.sprite === 'tree-assembled' || p.sprite === 'pine-tree' || p.sprite === 'B56'
export interface House extends Rect { group: string; module: number; style: string; occupants: string[]; anchor: Point; doors: Point[]; openings: Rect[]; hitArea: Point[]; walkable: Point[][]; walkableOrigin?: Point; village?: number; id?: string; type?: string; owner?: string | null; label?: string; zh?: string }
export const stableHash = (value: string): number => {
  let h = 2166136261
  for (const char of value) { h ^= char.codePointAt(0)!; h = Math.imul(h, 16777619) }
  return h >>> 0
}
export const housePools = { studio: ['A01', 'A02', 'B01', 'B02'], four: ['A03', 'B03', 'B06'], long: ['A04', 'B04'] } as const
/** Stable group preferences, with deterministic ties along each side and across the square.
 * Membership within a size class never changes the preference. Finite pools can collide;
 * the current roster resolves those collisions without randomness or saved history.
 */
export function houseStyles(rooms: readonly { id: string; occupants: readonly string[] }[]): string[] {
  const chosen: string[] = [], neighbours = (i: number) => [i - 2, i + 2, i ^ 1].filter(n => n >= 0 && n < rooms.length)
  // The long-house pool has two members. Each connected component of the village's
  // two-sided ladder is bipartite; start at its lowest group hash to fix its phase.
  const large = rooms.map((r, i) => ({ i, hash: stableHash(r.id) })).filter(r => rooms[r.i]!.occupants.length > 4)
    .sort((a, b) => a.hash - b.hash || (rooms[a.i]!.id < rooms[b.i]!.id ? -1 : 1))
  for (const root of large) {
    if (chosen[root.i]) continue
    chosen[root.i] = housePools.long[root.hash % 2]!
    const queue = [root.i]
    for (let at = 0; at < queue.length; at++) {
      const i = queue[at]!
      for (const n of neighbours(i)) if (rooms[n]!.occupants.length > 4 && !chosen[n]) {
        chosen[n] = chosen[i] === 'A04' ? 'B04' : 'A04'; queue.push(n)
      }
    }
  }
  rooms.forEach((room, i) => {
    if (chosen[i]) return
    const pool = room.occupants.length <= 2 ? housePools.studio : housePools.four, start = stableHash(room.id) % pool.length
    chosen[i] = Array.from({ length: pool.length }, (_, offset) => pool[(start + offset) % pool.length]!)
      .find(style => neighbours(i).every(n => chosen[n] !== style))!
  })
  return chosen
}
const allSprites: Record<string, { size: readonly number[]; anchor: readonly number[] }> = { ...catalog.sprites, ...sleepSprites, ...plantSprites, ...deskSprites }
export const nativeSize = (id: string): readonly number[] => allSprites[id]?.size ?? [0, 0]
export function piece(sprite: string, x: number, y: number, group: string | null, layer: Piece['layer'] = 'object', depth?: number): Piece {
  const [width = 0, height = 0] = nativeSize(sprite)
  const meta = allSprites[sprite]
  return { sprite, x, y, width, height, group, layer, depth: depth ?? y + (meta?.anchor[1] ?? height) }
}
/** Place by the supplied native ground anchor; no mirror, stretch or generated raster. */
export function anchored(sprite: string, ground: Point, group: string | null, layer: Piece['layer'] = 'object'): Piece {
  const anchor = allSprites[sprite]!.anchor
  return piece(sprite, ground.x - anchor[0]!, ground.y - anchor[1]!, group, layer)
}
export const boundsOf = (polygon: readonly Point[]): Rect => {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
  for (const point of polygon) { x = Math.min(x, point.x); y = Math.min(y, point.y); right = Math.max(right, point.x); bottom = Math.max(bottom, point.y) }
  return { x, y, width: right - x, height: bottom - y }
}

export function inPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Exact polygon/foot-box intersection after the spatial bounding-box rejection. */
export function polygonTouchesRect(polygon: readonly Point[], rect: Rect): boolean {
  const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }]
  if (corners.some(p => inPolygon(p, polygon)) || polygon.some(p => p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height)) return true
  const cross = (a: Point, b: Point, p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
  for (let i = 0; i < polygon.length; i++) for (let j = 0; j < corners.length; j++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!, c = corners[j]!, d = corners[(j + 1) % corners.length]!
    if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) || Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) continue
    if (cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) return true
  }
  return false
}
