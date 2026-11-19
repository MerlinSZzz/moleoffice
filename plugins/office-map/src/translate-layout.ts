// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Layout, Point } from './geometry.ts'
import type { Rect } from './viewport.ts'

/** The one shift that puts every room and house found in both layouts back where it was drawn. Null
 * when the layouts have none in common, or when those they share would need different shifts. */
export function sharedShift(drawn: Layout, next: Layout): Point | null {
  const houseKey = (house: Layout['houses'][number]) => JSON.stringify([house.id ?? house.group, house.module])
  const pairs: [Rect, Rect][] = []
  const rooms = new Map(drawn.rooms.map(room => [room.id, room]))
  for (const room of next.rooms) { const old = rooms.get(room.id); if (old) pairs.push([old, room]) }
  const houses = new Map(drawn.houses.map(house => [houseKey(house), house]))
  for (const house of next.houses) { const old = houses.get(houseKey(house)); if (old) pairs.push([old, house]) }
  if (!pairs.length) return null
  const [first, firstNext] = pairs[0]!, shift = { x: first.x - firstNext.x, y: first.y - firstNext.y }
  const same = pairs.every(([old, now]) => Math.abs(old.x - now.x - shift.x) < 1e-6 && Math.abs(old.y - now.y - shift.y) < 1e-6)
  return same && Number.isFinite(shift.x) && Number.isFinite(shift.y) ? shift : null
}

/** Move a scene's coordinate origin without changing the relative positions of its pictures or ground.
 * The original layout stays owned by its cache. Work yields as the scene is copied. */
export function* translateLayout(layout: Layout, delta: Point): Generator<void, Layout> {
  const point = <T extends Point>(p: T): T => ({ ...p, x: p.x + delta.x, y: p.y + delta.y })
  const poly = (points: Point[]) => points.map(point)
  const packed = (source: Float64Array): Float64Array => {
    const copy = source.slice()
    for (let at = 0; at < copy.length;) {
      const end = at + 1 + copy[at]! * 2
      for (let i = at + 1; i < end; i += 2) { copy[i]! += delta.x; copy[i + 1]! += delta.y }
      at = end
    }
    return copy
  }
  const moveRect = <T extends Rect>(rect: T): T => point(rect)
  const rooms: Layout['rooms'] = [], houses: Layout['houses'] = [], pieces: Layout['pieces'] = [], obstacles: Layout['obstacles'] = []
  const seats: Layout['seats'] = Object.create(null) as Layout['seats']
  for (const room of layout.rooms) { rooms.push({ ...moveRect(room), door: point(room.door) }); yield }
  for (const house of layout.houses) {
    houses.push({ ...moveRect(house), anchor: point(house.anchor), doors: house.doors.map(point), openings: house.openings.map(moveRect), hitArea: poly(house.hitArea),
      walkable: house.walkableOrigin ? house.walkable : house.walkable.map(poly), ...(house.walkableOrigin ? { walkableOrigin: point(house.walkableOrigin) } : {}) }); yield
  }
  for (const piece of layout.pieces) { pieces.push({ ...moveRect(piece), depth: piece.depth + delta.y }); yield }
  for (const obstacle of layout.obstacles) {
    obstacles.push({ ...moveRect(obstacle), ...(obstacle.polygonOrigin ? { polygonOrigin: point(obstacle.polygonOrigin) } : {}),
      ...(obstacle.polygon && !obstacle.polygonOrigin ? { polygon: poly(obstacle.polygon) } : {}) }); yield
  }
  for (const [key, seat] of Object.entries(layout.seats)) {
    seats[key] = { ...seat, foot: point(seat.foot), talk: point(seat.talk), desk: moveRect(seat.desk), stool: moveRect(seat.stool) }; yield
  }
  const planting: NonNullable<Layout['planting']> = []
  for (const row of layout.planting ?? []) {
    const positions = row.positions.slice()
    for (let i = 0; i < positions.length; i += 3) { positions[i]! += delta.x; positions[i + 1]! += delta.y }
    planting.push({ ...row, positions }); yield
  }
  const roadDrawing: Float64Array[] = []
  for (const row of layout.roadDrawing ?? []) { roadDrawing.push(packed(row)); yield }
  const paths: Point[][] = []
  for (const path of layout.paths ?? []) { paths.push(poly(path)); yield }
  const rings: Point[][] = []
  for (const ring of layout.road.rings) { rings.push(poly(ring)); yield }
  const facilities: NonNullable<Layout['facilities']> = []
  for (const place of layout.facilities ?? []) { facilities.push({ ...place, foot: point(place.foot) }); yield }
  return { ...layout, bounds: moveRect(layout.bounds), rooms, houses, pieces, obstacles, seats, square: moveRect(layout.square),
    road: { ...layout.road, rings, ends: layout.road.ends.map(end => ({ ...end, at: point(end.at) })) },
    ...(layout.roadDrawing ? { roadDrawing } : {}), ...(layout.paths ? { paths } : {}), ...(layout.planting ? { planting } : {}),
    ...(layout.facilities ? { facilities } : {}), ...(layout.villages ? { villages: layout.villages.map(moveRect) } : {}),
    ...(layout.squares ? { squares: layout.squares.map(moveRect) } : {}), ...(layout.places ? { places: { play: layout.places.play.map(point), sleep: layout.places.sleep.map(point), sleepingHouse: moveRect(layout.places.sleepingHouse) } } : {}) }
}
