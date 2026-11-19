// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The shared road contour. These tests prove one shape fact is cut into the fill, that the reader
 * uses pixel centres rather than tile corners, that a 90-degree and a 45-degree join are tangent
 * arcs and not spikes, that a narrow saved end is not narrowed, and that a bad contour is a
 * visible fault rather than a smooth lie.
 *
 * Every case is synthetic geometry, chosen so a wrong answer is a different number rather than a
 * different opinion. The real saved layouts are exercised in tests/forest-map.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { roadContour, roadContains, type RoadContour, type RoadPoint } from '../src/shared/road-contour.ts'

const HALF = 48
const inside = (contour: ReturnType<typeof roadContour>, x: number, y: number) => roadContains(contour, { x, y })

describe('the shared road contour', () => {
  it('reads coverage per pixel centre, so a concave tile can have four inside corners and a missing centre', () => {
    // A square with a deep V notch cut from its top edge. All four corners of the 32-pixel tile are
    // inside, and the pixel centre under the notch is not. A reader that inferred a tile from its
    // four corners would call this tile full.
    const notch = { halfWidth: 16, rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 16, y: 20 }, { x: 22, y: 0 },
      { x: 32, y: 0 }, { x: 32, y: 32 }, { x: 0, y: 32 }]], ends: [], faults: [] }
    for (const corner of [{ x: 0, y: 0 }, { x: 31, y: 0 }, { x: 31, y: 31 }, { x: 0, y: 31 }]) {
      expect(roadContains(notch, corner), `corner ${corner.x},${corner.y}`).toBe(true)
    }
    expect(roadContains(notch, { x: 16, y: 16 })).toBe(false)
  })

  it('gives a 90-degree convex turn a tangent arc, not a spike', () => {
    const contour = roadContour([[{ x: 0, y: 0 }, { x: 192, y: 0 }, { x: 192, y: 192 }]], HALF)
    expect(contour.faults).toEqual([])
    const vertex = { x: 192, y: 0 }
    // The outer side of this turn is the upper right. The arc is tangent to both straight edges,
    // so every pixel centre within the half width of the vertex is inside, and the sharp corner
    // that a per-cell union would leave at (240, -48) is outside.
    for (const degrees of [-80, -65, -45, -25, -10]) {
      const angle = degrees * Math.PI / 180
      expect(inside(contour, vertex.x + Math.cos(angle) * 44, vertex.y + Math.sin(angle) * 44), `${degrees} degrees at 44`).toBe(true)
      expect(inside(contour, vertex.x + Math.cos(angle) * 60, vertex.y + Math.sin(angle) * 60), `${degrees} degrees at 60`).toBe(false)
    }
    expect(inside(contour, 240, -47)).toBe(false)
    // The two straight edges the arc is tangent to are unchanged: just inside each, far from the corner.
    expect(inside(contour, 100, -47)).toBe(true)
    expect(inside(contour, 100, -49)).toBe(false)
    expect(inside(contour, 239, 100)).toBe(true)
    expect(inside(contour, 241, 100)).toBe(false)
  })

  it('keeps a 90-degree concave turn where the two offset edges meet', () => {
    const contour = roadContour([[{ x: 0, y: 0 }, { x: 192, y: 0 }, { x: 192, y: 192 }]], HALF)
    // The inner side of this turn is the lower left; the two offset edges meet at (144, 48).
    expect(inside(contour, 150, 54)).toBe(true)
    expect(inside(contour, 143, 47)).toBe(true)
    // Beyond the meeting point is the notch outside the road, and it must not be filled.
    expect(inside(contour, 140, 52)).toBe(false)
    expect(inside(contour, 100, 70)).toBe(false)
  })

  it('gives a 45-degree-to-straight join a tangent arc and keeps the 45-degree straight edge', () => {
    const contour = roadContour([[{ x: 0, y: 0 }, { x: 96, y: 96 }, { x: 192, y: 96 }]], HALF)
    expect(contour.faults).toEqual([])
    const unit = Math.SQRT1_2
    // Along the 45-degree segment, the offset edge is straight: 40 inside, 56 outside.
    for (const t of [16, 32, 48]) {
      expect(inside(contour, t - 40 * unit, t + 40 * unit), `45 edge at ${t}`).toBe(true)
      expect(inside(contour, t - 56 * unit, t + 56 * unit), `beyond 45 edge at ${t}`).toBe(false)
    }
    // At the join the boundary is the tangent arc around (96, 96): inside at 44, outside at 56.
    const join = { x: 96, y: 96 }
    for (const degrees of [75, 90, 105, 120, 135, 150]) {
      const angle = degrees * Math.PI / 180
      expect(inside(contour, join.x + Math.cos(angle) * 44, join.y + Math.sin(angle) * 44), `${degrees} degrees at 44`).toBe(true)
      expect(inside(contour, join.x + Math.cos(angle) * 56, join.y + Math.sin(angle) * 56), `${degrees} degrees at 56`).toBe(false)
    }
    // The straight edge after the join is unchanged.
    expect(inside(contour, 150, 96 - 47)).toBe(true)
    expect(inside(contour, 150, 96 - 49)).toBe(false)
  })

  it('keeps a narrow saved end at its saved width instead of narrowing it', () => {
    const narrow = roadContour([[{ x: 0, y: 0 }, { x: 192, y: 0 }]], 16)
    expect(narrow.faults).toEqual([])
    expect(narrow.ends).toHaveLength(2)
    for (const end of narrow.ends) expect(end.width).toBe(32)
    // The pixels across the end face are 32, not the 28 the rejected prototype produced.
    const across: number[] = []
    for (let y = -20; y <= 20; y++) if (inside(narrow, 207.5, y + 0.5)) across.push(y)
    expect(across.length).toBe(32)
    expect(across[0]).toBe(-16)
    expect(across.at(-1)).toBe(15)
  })

  it('pushes a saved end exactly half a width past the last control point', () => {
    const contour = roadContour([[{ x: 0, y: 0 }, { x: 192, y: 0 }]], HALF)
    expect(contour.ends[0]).toEqual({ at: { x: -48, y: 0 }, width: 96 })
    expect(contour.ends[1]).toEqual({ at: { x: 240, y: 0 }, width: 96 })
    expect(inside(contour, 239.5, 0)).toBe(true)
    expect(inside(contour, 240.5, 0)).toBe(false)
    expect(inside(contour, -48.5, 0)).toBe(false)
  })

  it('reads the same pixel a whole number of 32-pixel tiles apart', () => {
    const contour = roadContour([[{ x: -320, y: 0 }, { x: 320, y: 0 }]], HALF)
    for (const y of [-47, -16, 0, 16, 47]) for (const x of [-100, -33, 5, 71]) {
      expect(inside(contour, x, y), `${x},${y}`).toBe(inside(contour, x + 32, y))
    }
  })

  it('reports a bad join, a reversal, a missing width and a non-finite point as faults', () => {
    expect(roadContour([[{ x: 0, y: 0 }, { x: 96, y: 0 }, { x: 0, y: 0 }]], HALF).faults.join(' ')).toMatch(/reverses/)
    expect(roadContour([[{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }]], HALF).faults.join(' ')).toMatch(/finite/)
    expect(roadContour([[{ x: 0, y: 0 }, { x: 96, y: 0 }]], 0).faults.join(' ')).toMatch(/half width/)
    expect(roadContour([], HALF).rings).toEqual([])
  })

  it('does not use a distance field: a point far from every control point is outside', () => {
    const contour = roadContour([[{ x: 0, y: 0 }, { x: 192, y: 0 }]], HALF)
    const far: RoadPoint[] = [{ x: 96, y: 96 }, { x: 96, y: -96 }, { x: -96, y: 0 }, { x: 288, y: 0 }]
    for (const point of far) expect(inside(contour, point.x, point.y)).toBe(false)
  })

  it('reads the same pixels as the retained slow winding scan over several rings on a dense grid', () => {
    // The reader roadContains followed before the derived index, kept here as the equivalence
    // reference. It scans every ring's every edge and is not exported anywhere.
    const slow = (contour: RoadContour, px: number, py: number): boolean => {
      const x = Math.floor(px) + 0.5, y = Math.floor(py) + 0.5
      let winding = 0
      for (const ring of contour.rings) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!, b = ring[(i + 1) % ring.length]!
          const side = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
          if (a.y <= y) { if (b.y > y && side > 0) winding++ }
          else if (b.y <= y && side < 0) winding--
        }
      }
      return winding !== 0
    }
    // Four saved paths with negative coordinates: a hump, a second hump that crosses a long
    // straight road, and one single-cell square. The two crossing rings make an overlap, so a
    // reader that caches one ring, drops a row or stops at a bound disagrees on this grid.
    const contour = roadContour([
      [{ x: -240, y: -64 }, { x: -160, y: -96 }, { x: -80, y: -128 }, { x: 0, y: -128 }, { x: 80, y: -96 }, { x: 160, y: -64 }],
      [{ x: -160, y: 96 }, { x: -80, y: 32 }, { x: 0, y: 32 }, { x: 80, y: 96 }],
      [{ x: -128, y: 160 }],
      [{ x: -240, y: 0 }, { x: 160, y: 0 }],
    ], 24)
    expect(contour.faults).toEqual([])
    expect(contour.rings).toHaveLength(4)

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const ring of contour.rings) for (const point of ring) {
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
    }
    // Every whole pixel over the bounding box, plus the boundary-adjacent half steps around every
    // ring vertex, so an off-by-one row or a dropped edge has somewhere to show.
    const queries: RoadPoint[] = []
    for (let y = Math.floor(minY) - 2; y <= Math.ceil(maxY) + 2; y++) for (let x = Math.floor(minX) - 2; x <= Math.ceil(maxX) + 2; x++) queries.push({ x, y })
    for (const ring of contour.rings) for (const point of ring) for (const dx of [-0.5, 0, 0.5]) for (const dy of [-0.5, 0, 0.5]) queries.push({ x: point.x + dx, y: point.y + dy })

    let mismatches = 0, insideCount = 0
    for (const query of queries) {
      const fast = roadContains(contour, query), reference = slow(contour, query.x, query.y)
      if (fast) insideCount++
      if (fast !== reference) mismatches++
    }
    expect(mismatches).toBe(0)
    expect(insideCount).toBeGreaterThan(1000)
    // The overlap between the second hump and the long road is inside, and the far corner is not.
    expect(roadContains(contour, { x: 0, y: 0 })).toBe(true)
    expect(roadContains(contour, { x: 400, y: 400 })).toBe(false)
  })
})
