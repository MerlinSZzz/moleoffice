// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Ported unchanged from src/shared/road-contour.ts at 83138edb8. Plugin-owned copy. */
/**
 * ONE SHAPE FACT FOR THE C FOREST ROADS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The road used to be worked out twice. The drawing expanded every saved 96-pixel road cell
 * into a 3x3 block of 32-pixel tiles and then picked one of sixteen adjacency sprites by its
 * four neighbours, while the route search walked the same cells as points. Two readings of one
 * road, with nothing making them agree, and no way to say where the road edge really is.
 *
 * This module is the one reading. It turns the saved road control points and the road half
 * width into a single closed contour: the exact straight edges, a tangent pixel arc at every
 * 90-degree and 45-degree turn, and the saved flat end rule. Everything else is cut from it:
 * the fill is the pixel centres inside the contour. The drawing and the route clearance both
 * ask this file through `roadContains`, so one road has one coverage rule.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULES THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * - A road half width is the only width. An end face is exactly twice that width; it is never
 *   narrowed. The prototype that narrowed a 32-pixel end to 28 is a red control, not a source.
 * - A turn is an arc tangent to both offset edges, not a spike and not a chamfer. The convex
 *   side gets the arc; the concave side is where the two offset edges meet.
 * - The texture phase is the tile grid itself: a tile centre is a whole multiple of the tile
 *   size, so the same world pixel always reads the same texture pixel, whatever tile draws it.
 * - A bad join, a reversed segment, a missing piece or a non-finite point is returned as a
 *   fault string. Callers must fail visibly rather than blur over it.
 */

export interface RoadPoint { x: number; y: number }

/** One flat end of a saved road path: where it is and how wide the face is. */
export interface RoadEnd { at: RoadPoint; width: number }

export interface RoadContour {
  halfWidth: number
  /** Closed rings, all wound the same way, so an overlap reads as inside and never as a hole. */
  rings: RoadPoint[][]
  /** One entry per saved path end, in path order. The width is exactly twice the half width. */
  ends: RoadEnd[]
  /** Anything that makes the contour untrustworthy. A non-empty list must be shown, not hidden. */
  faults: string[]
}

/** The largest distance an arc chord may sit from the true circle. Sub-pixel, so a pixel edge is right. */
export const ROAD_CONTOUR_SAGITTA = 0.02

const EPSILON = 1e-9

const add = (a: RoadPoint, b: RoadPoint): RoadPoint => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: RoadPoint, b: RoadPoint): RoadPoint => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: RoadPoint, k: number): RoadPoint => ({ x: a.x * k, y: a.y * k })
const dot = (a: RoadPoint, b: RoadPoint): number => a.x * b.x + a.y * b.y
const cross = (a: RoadPoint, b: RoadPoint): number => a.x * b.y - a.y * b.x
const finite = (p: RoadPoint): boolean => Number.isFinite(p.x) && Number.isFinite(p.y)

/** The left normal of a travel direction. Which side is called left does not matter; consistency does. */
const leftNormal = (direction: RoadPoint): RoadPoint => ({ x: -direction.y, y: direction.x })

function direction(from: RoadPoint, to: RoadPoint): RoadPoint {
  const delta = sub(to, from), length = Math.hypot(delta.x, delta.y)
  return length < EPSILON ? { x: 0, y: 0 } : { x: delta.x / length, y: delta.y / length }
}

/** Where two infinite lines meet, or null when they are parallel. */
function lineIntersection(p: RoadPoint, dp: RoadPoint, q: RoadPoint, dq: RoadPoint): RoadPoint | null {
  const denominator = cross(dp, dq)
  if (Math.abs(denominator) < 1e-12) return null
  const t = cross(sub(q, p), dq) / denominator
  return add(p, scale(dp, t))
}

/** The points of a circular arc, excluding its start and including its end. */
function arc(center: RoadPoint, from: RoadPoint, to: RoadPoint, maxSagitta: number): RoadPoint[] {
  const radius = Math.hypot(from.x - center.x, from.y - center.y)
  if (radius < EPSILON) return [to]
  const start = Math.atan2(from.y - center.y, from.x - center.x)
  const end = Math.atan2(to.y - center.y, to.x - center.x)
  let sweep = end - start
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  while (sweep < -Math.PI) sweep += 2 * Math.PI
  const ratio = Math.max(-1, Math.min(1, 1 - maxSagitta / radius))
  const maxStep = 2 * Math.acos(ratio)
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / maxStep))
  const points: RoadPoint[] = []
  for (let i = 1; i < steps; i++) {
    const angle = start + sweep * i / steps
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius })
  }
  points.push(to)
  return points
}

function signedArea(ring: readonly RoadPoint[]): number {
  let total = 0
  for (let i = 0; i < ring.length; i++) { const a = ring[i]!, b = ring[(i + 1) % ring.length]!; total += a.x * b.y - b.x * a.y }
  return total / 2
}

function removeRepeats(points: readonly RoadPoint[]): RoadPoint[] {
  const kept: RoadPoint[] = []
  for (const point of points) if (!kept.length || Math.hypot(point.x - kept[kept.length - 1]!.x, point.y - kept[kept.length - 1]!.y) > EPSILON) kept.push(point)
  return kept
}

/** A saved path with one point is the whole 96-pixel cell; a path with none holds nothing. */
function square(center: RoadPoint, halfWidth: number): RoadPoint[] {
  return [{ x: center.x - halfWidth, y: center.y - halfWidth }, { x: center.x + halfWidth, y: center.y - halfWidth },
    { x: center.x + halfWidth, y: center.y + halfWidth }, { x: center.x - halfWidth, y: center.y + halfWidth }]
}

interface Segment { a: RoadPoint; b: RoadPoint; direction: RoadPoint }

/**
 * One closed ring around one saved path.
 *
 * The ends are pushed half a width past the last control point, because the saved cell a control
 * point names is a whole cell wide; that is the saved end rule, and it is what keeps a narrow
 * 32-pixel road 32 pixels at its end.
 */
function pathRing(points: readonly RoadPoint[], halfWidth: number, faults: string[]): RoadPoint[] | null {
  const path = removeRepeats(points)
  for (const point of path) if (!finite(point)) { faults.push('a road control point is not a finite number'); return null }
  if (!path.length) return null
  if (path.length === 1) return square(path[0]!, halfWidth)

  const segments: Segment[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const directionOfSegment = direction(path[i]!, path[i + 1]!)
    if (directionOfSegment.x === 0 && directionOfSegment.y === 0) continue
    segments.push({ a: path[i]!, b: path[i + 1]!, direction: directionOfSegment })
  }
  if (!segments.length) return square(path[0]!, halfWidth)

  for (let i = 0; i < segments.length - 1; i++) {
    if (dot(segments[i]!.direction, segments[i + 1]!.direction) < -1 + 1e-9) { faults.push(`the road reverses direction at ${segments[i]!.b.x},${segments[i]!.b.y}`); return null }
  }

  const first = segments[0]!, last = segments[segments.length - 1]!
  const start = add(first.a, scale(first.direction, -halfWidth))
  const finish = add(last.b, scale(last.direction, halfWidth))
  const left: RoadPoint[] = [add(start, scale(leftNormal(first.direction), halfWidth))]
  const right: RoadPoint[] = [add(start, scale(leftNormal(first.direction), -halfWidth))]

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!
    const along = i === segments.length - 1 ? finish : segment.b
    const leftEnd = add(along, scale(leftNormal(segment.direction), halfWidth))
    const rightEnd = add(along, scale(leftNormal(segment.direction), -halfWidth))
    left.push(leftEnd); right.push(rightEnd)
    if (i === segments.length - 1) break
    const next = segments[i + 1]!
    const turn = cross(segment.direction, next.direction)
    if (turn > EPSILON) {
      const leftLine = add(segment.b, scale(leftNormal(segment.direction), halfWidth))
      const nextLeft = add(next.a, scale(leftNormal(next.direction), halfWidth))
      const corner = lineIntersection(leftLine, segment.direction, nextLeft, next.direction) ?? leftEnd
      left[left.length - 1] = corner
      right.push(...arc(segment.b, rightEnd, add(next.a, scale(leftNormal(next.direction), -halfWidth)), ROAD_CONTOUR_SAGITTA))
    } else if (turn < -EPSILON) {
      const rightLine = add(segment.b, scale(leftNormal(segment.direction), -halfWidth))
      const nextRight = add(next.a, scale(leftNormal(next.direction), -halfWidth))
      const corner = lineIntersection(rightLine, segment.direction, nextRight, next.direction) ?? rightEnd
      right[right.length - 1] = corner
      left.push(...arc(segment.b, leftEnd, add(next.a, scale(leftNormal(next.direction), halfWidth)), ROAD_CONTOUR_SAGITTA))
    }
  }

  const ring = [...left, ...right.slice().reverse()]
  if (ring.length < 3) { faults.push('a road path produced no area'); return null }
  return signedArea(ring) < 0 ? ring.slice().reverse() : ring
}

/** The single road contour for every saved path, with one flat end per path end. */
export function roadContour(paths: readonly (readonly RoadPoint[])[], halfWidth: number): RoadContour {
  const faults: string[] = []
  if (!Number.isFinite(halfWidth) || halfWidth <= 0) faults.push('the road half width is not a positive number')
  const rings: RoadPoint[][] = [], ends: RoadEnd[] = []
  for (const path of paths) {
    if (path.some(point => !finite(point))) { faults.push('a road control point is not a finite number'); continue }
    const clean = removeRepeats(path)
    if (clean.length > 1) {
      const startDirection = direction(clean[0]!, clean[1]!), endDirection = direction(clean[clean.length - 2]!, clean[clean.length - 1]!)
      ends.push({ at: add(clean[0]!, scale(startDirection, -halfWidth)), width: halfWidth * 2 })
      ends.push({ at: add(clean[clean.length - 1]!, scale(endDirection, halfWidth)), width: halfWidth * 2 })
    } else if (clean.length === 1) {
      ends.push({ at: clean[0]!, width: halfWidth * 2 }, { at: clean[0]!, width: halfWidth * 2 })
    }
    const ring = pathRing(path, halfWidth, faults)
    if (ring) rings.push(ring)
  }
  return { halfWidth, rings, ends, faults }
}

/**
 * The derived read index for one contour.
 *
 * The raster asks this file once per pixel, so scanning every ring's every edge per call is the
 * cost the 41% profile measured in `roadContains`. The index is exact and derived, and it is kept
 * out of `RoadContour`: a `WeakMap` keys it by the contour object, so the exported shape is
 * unchanged and a contour nobody reads costs nothing.
 *
 * For every non-horizontal edge the winding rule that used to live in `windingAt` contributes
 * `sign` when the point is on the edge's left (upward) or right (downward) side, and only when the
 * point's row centre `row + 0.5` lies in the edge's half-open y span. The index records each edge
 * under exactly those integer rows, with `sign` and the edge's start and delta, so a query reads
 * only the edges that can change its winding. Horizontal edges never contribute and are dropped.
 */
interface IndexedEdge {
  x: number
  y: number
  dx: number
  dy: number
  sign: number
}

interface ContourIndex {
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** Integer pixel rows to the non-horizontal edges whose y span covers that row's centre. */
  rows: Map<number, IndexedEdge[]>
}

const contourIndexes = new WeakMap<RoadContour, ContourIndex>()

function buildContourIndex(contour: RoadContour): ContourIndex {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const rows = new Map<number, IndexedEdge[]>()
  for (const ring of contour.rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!
      if (a.x < minX) minX = a.x
      if (a.x > maxX) maxX = a.x
      if (a.y < minY) minY = a.y
      if (a.y > maxY) maxY = a.y
      const dy = b.y - a.y
      if (dy === 0) continue
      const low = dy > 0 ? a.y : b.y
      const high = dy > 0 ? b.y : a.y
      const firstRow = Math.ceil(low - 0.5)
      const lastRow = Math.ceil(high - 0.5) - 1
      if (firstRow > lastRow) continue
      const edge: IndexedEdge = { x: a.x, y: a.y, dx: b.x - a.x, dy, sign: dy > 0 ? 1 : -1 }
      for (let row = firstRow; row <= lastRow; row++) {
        const list = rows.get(row)
        if (list) list.push(edge)
        else rows.set(row, [edge])
      }
    }
  }
  return { minX, maxX, minY, maxY, rows }
}

/** Whether the pixel centre at a world point is inside the road. Raster and route both call this. */
export function roadContains(contour: RoadContour, point: RoadPoint): boolean {
  const x = Math.floor(point.x) + 0.5, y = Math.floor(point.y) + 0.5
  let index = contourIndexes.get(contour)
  if (index === undefined) { index = buildContourIndex(contour); contourIndexes.set(contour, index) }
  if (x < index.minX || x > index.maxX || y < index.minY || y > index.maxY) return false
  const row = index.rows.get(Math.floor(y))
  if (row === undefined) return false
  let winding = 0
  for (let i = 0; i < row.length; i++) {
    const edge = row[i]!
    if ((edge.dx * (y - edge.y) - edge.dy * (x - edge.x)) * edge.sign > 0) winding += edge.sign
  }
  return winding !== 0
}
