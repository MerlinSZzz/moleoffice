// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Frozen round-7 search, used only as a fixture oracle.
import { obstacleIndex, pointIsClear, type Layout, type Point, type Route } from '../src/geometry.ts'
import { roadContains } from '../src/road-contour.ts'
import { inPolygon } from '../src/village.ts'
import { search } from '../src/search.ts'
const pointKey = (p: Point): string => `${p.x},${p.y}`
const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }]
/** Uses the same contour as the renderer and checks between grid points to avoid cutting corners. */
export function legacyRouteBetween(layout: Layout, from: string, to: string, turns = 80000): Route {
  const sender = layout.seats[from], recipient = layout.seats[to]
  if (!sender || !recipient || !Number.isSafeInteger(turns) || turns < 0 || turns > 80000) return { status: 'unavailable', points: [] }
  const start = sender.foot, target = recipient.talk, step = 16
  if (![start.x, start.y, target.x, target.y].every(n => Number.isInteger(n / step))) return { status: 'unavailable', points: [] }
  if (layout.road.faults.length) return { status: 'unavailable', points: [] }
  const index = obstacleIndex(layout), free = [from, to]
  const onGround = (p: Point) => layout.houses.some(house => house.walkable.some(poly => inPolygon(p, poly))) || roadContains(layout.road, p) || (p.x >= layout.square.x && p.y >= layout.square.y && p.x <= layout.square.x + layout.square.width && p.y <= layout.square.y + layout.square.height)
  const clear = (p: Point) => onGround(p) && pointIsClear(layout, p, free, index)
  if (!clear(start)) return { status: 'no-path', points: [] }
  const result = search(start, p => pointKey(p) === pointKey(target), p => clear(p) ? 1 : null,
    p => Math.hypot(target.x - p.x, target.y - p.y) / step, step, turns, directions,
    (a, b) => [0, .25, .5, .75, 1].every(fraction => clear({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction })))
  return result === 'ran out' ? { status: 'exhausted', points: [] } : result ? { status: 'found', points: result } : { status: 'no-path', points: [] }
}
