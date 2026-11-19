// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Layout, Point, Station } from './geometry.ts'
import { hall13Bays } from './ownership-facilities.ts'
import { atDesk } from './desk-things.ts'
import { VisibleIndex } from './render-plan.ts'
import type { Rect } from './viewport.ts'
import { inPolygon } from './village.ts'

export const PLATE_WIDTH = 100, PLATE_HEIGHT = 28
/** The least clear space kept between two nameplates, so a plate never reads as stacked on another. */
export const PLATE_GAP = 6
/** The gap kept between a plate and the room's side walls and back wall when no walkable polygon is held. */
export const PLATE_WALL_INSET = 48, PLATE_BACK_INSET = 78
/** The gap between a desk's front edge and the plate under it, and the steps by which a hall plate that a wall would cut moves toward the middle. */
export const PLATE_DESK_GAP = 4, PLATE_STEPS = [8, 16, 24] as const
/** How far, in px, the places tried for a mole away from its desk may move out from its body. With nothing free
 * that near, the mole shows no plate until there is room, rather than a name far from it. */
export const PLATE_AWAY_REACH = 100
/** A walking mole's plate stays under its feet. */
export const PLATE_WALKING_OFFSET = { x: -PLATE_WIDTH / 2, y: 2 } as const
export const walkingPlate = (point: Point): Rect => ({ x: point.x + PLATE_WALKING_OFFSET.x, y: point.y + PLATE_WALKING_OFFSET.y, width: PLATE_WIDTH, height: PLATE_HEIGHT })
export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
/** Distance to the first point clear of the starting seat's row of desks. */
export function labelWait(layout: Layout, key: string, points: readonly Point[]): number {
  const seat = layout.seats[key], desk = seat?.desk
  if (!seat || !desk || desk.width <= 0 || !points.length) return 0
  const row = Object.values(layout.seats).filter(other => other.room === seat.room && other.desk.width > 0 && other.desk.y === desk.y && other.desk.height === desk.height).map(other => other.desk)
  const behind = (point: Point) => row.some(one => point.y < one.y + one.height && overlaps(walkingPlate(point), one))
  if (!behind(points[0]!)) return 0
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, length = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.ceil(length)
    for (let step = 1; step <= steps; step++) {
      const fraction = step / steps
      if (!behind({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction })) return walked + length * fraction
    }
    walked += length
  }
  return walked
}
/** Conservative whole-body boxes also protect every approved face and pose at the largest scale. */
export const bodyBox = (point: Point): Rect => ({ x: point.x - 59, y: point.y - 120, width: 118, height: 122 })
export function protectedAreas(layout: Layout): Rect[] {
  return [
    ...Object.values(layout.seats).map(seat => ({ x: seat.desk.x - 2, y: seat.desk.y + 30, width: seat.desk.width + 4, height: seat.desk.height - 28 })),
    ...layout.houses.flatMap(house => house.openings.map(door => ({ x: door.x - 4, y: door.y - 4, width: door.width + 8, height: door.height + 8 }))),
    // A desk seat is drawn at its desktop, not at its standing foot, so only a
    // seat still drawn at its home foot keeps its home body here. Moving bodies
    // are indexed from the point each actor is drawn at.
    ...Object.values(layout.seats).filter(seat => seat.desk.width === 0).map(seat => bodyBox(seat.foot)),
  ]
}
/** A whole plate's corners sit inside the room's walkable floor, or inside its
 * side and back wall insets when the drawing layout holds no walkable polygons. */
export function insideRoom(house: Layout['houses'][number], rect: Rect): boolean {
  const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x, y: rect.y + rect.height }, { x: rect.x + rect.width, y: rect.y + rect.height }]
  const origin = house.walkableOrigin ?? { x: 0, y: 0 }
  return house.walkable.length
    ? house.walkable.some(poly => corners.every(c => inPolygon({ x: c.x - origin.x, y: c.y - origin.y }, poly)))
    : corners.every(c => c.x >= house.x + PLATE_WALL_INSET && c.x <= house.x + house.width - PLATE_WALL_INSET && c.y >= house.y + PLATE_BACK_INSET && c.y <= house.y + house.height)
}
/** A mole the plates are placed for. `walk` is set from the frame it starts to walk until it stands or sits again. */
export interface PlateActor { key: string; point: Point; walk?: unknown; plate?: Rect }
/** Only current geometry is indexed. Candidates expand beside the body and are rejected against
 * desk fronts, doorways, home bodies, moving bodies and already placed nameplates. */
export class Nameplates {
  private protected: VisibleIndex<Rect>
  constructor(private layout: Layout, prepared?: VisibleIndex<Rect>) { this.protected = prepared ?? new VisibleIndex(protectedAreas(layout).map(value => ({ value, rect: value }))) }
  place(actors: PlateActor[]): Map<string, Rect> {
    const work = this.placeSteps(actors)
    for (;;) { const next = work.next(); if (next.done) return next.value }
  }
  *placeSteps(actors: PlateActor[]): Generator<void, Map<string, Rect>> {
    const moving = new VisibleIndex(actors.filter(actor => !actor.walk).map(actor => ({ value: { key: actor.key, box: bodyBox(actor.point) }, rect: bodyBox(actor.point) })))
    const seated = (actor: PlateActor): boolean => {
      const seat = this.layout.seats[actor.key]
      if (actor.walk || !seat?.desk || seat.desk.width <= 0) return false
      const point = atDesk(seat)
      return actor.point.x === point.x && actor.point.y === point.y
    }
    const seatedActors = actors.filter(seated)
    const seatedBodies = new VisibleIndex(seatedActors.map(actor => ({ value: bodyBox(actor.point), rect: bodyBox(actor.point) })))
    const result = new Map<string, Rect>(), used: Rect[] = []
    const byKey = [...actors].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    // Seated placements see only seated bodies and plates, so passing actors cannot move them.
    for (const phase of ['seated', 'standing', 'walking'] as const) {
      for (const actor of byKey.filter(actor => (seated(actor) ? 'seated' : actor.walk ? 'walking' : 'standing') === phase)) {
        if (!seated(actor) && (actor.walk || actor.plate)) {
          result.set(actor.key, actor.plate ?? walkingPlate(actor.point))
          yield; continue
        }
        const p = actor.point, seat = this.layout.seats[actor.key]
        const atSeat = seated(actor)
        let placed: Rect | undefined
        const house = this.layout.ownership && this.layout.houses.find(h => h.group === seat?.room)
        const desk = seat?.desk && seat.desk.width > 0 ? seat.desk : undefined
        // Only a mole at its own seat keeps its plate in its room. One at play or asleep,
        // and not walking, has its plate placed around it, under its feet or over its head first.
        // A mole at work at a seat with a desk is drawn where atDesk puts it, behind the desk. One
        // free to walk stands at its foot and has its plate placed as for a mole away from that point.
        const home = seat && (desk ? atDesk(seat) : seat.foot), away = !!actor.walk || !!home && (p.x !== home.x || p.y !== home.y)
        const outdoors = away || (seat as (Station & { outdoors?: boolean }) | undefined)?.outdoors === true
        const clear = (rect: Rect): boolean => {
          const camera = { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
          const gap = { x: rect.x - PLATE_GAP, y: rect.y - PLATE_GAP, width: rect.width + PLATE_GAP * 2, height: rect.height + PLATE_GAP * 2 }
          return used.every(other => !overlaps(gap, other)) &&
            !this.protected.query(camera).some(other => overlaps(rect, other)) &&
            (atSeat ? !seatedBodies.query(camera).some(other => overlaps(rect, other)) :
              !moving.query(camera).some(other => (other.key !== actor.key || !actor.plate) && overlaps(rect, other.box)))
        }
        const hall = house && !outdoors && (house.type === 'secretariat' || (house.type === 'direct' && house.width === hall13Bays.width && house.height === hall13Bays.height)) ? house : undefined
        if (hall) {
          // Anchor to the point this body is drawn at. A mole behind its desk keeps
          // its plate just under the desk's front edge, centred on the body, then
          // the floor below/above and the two nearby sides as fallbacks. Never push
          // a plate across the room to make it fit, and keep a clear gap from every
          // plate already placed.
          const candidates = [
            ...(desk && !away ? [{ x: p.x - 50, y: desk.y + desk.height + PLATE_DESK_GAP }] : []),
            { x: p.x - 50, y: p.y + 2 }, { x: p.x - 50, y: p.y - 152 },
            { x: p.x + 61, y: p.y - 56 }, { x: p.x - 161, y: p.y - 56 },
            { x: p.x + 74, y: p.y - 56 }, { x: p.x - 174, y: p.y - 56 }]
          // When none of those places is free, the same places are tried again moved
          // 8, 16 and then 24 px sideways toward the middle of the room, so a plate
          // that a wall would cut by a few px still stands under its own mole.
          const toMiddle = (point: Point) => Math.sign(hall.x + hall.width / 2 - (point.x + PLATE_WIDTH / 2))
          const tries = [...candidates, ...PLATE_STEPS.flatMap(step => candidates.map(point => ({ x: point.x + toMiddle(point) * step, y: point.y })))]
          for (const point of tries) {
            const rect = { ...point, width: PLATE_WIDTH, height: PLATE_HEIGHT }
            // The drawing layout a browser holds carries no walkable polygons; its house rect is
            // the same room, so an inset of the walls stands in for them there.
            const inside = insideRoom(hall, rect)
            if (inside && clear(rect) && !this.layout.obstacles.some(o => (o.kind === 'desk' || o.kind === 'wall') && overlaps(rect, o))) { placed = rect; break }
            yield
          }
          if (placed) { result.set(actor.key, placed); used.push(placed) }
          yield; continue
        }
        // An away mole's plate stays inside the room it stands in, or, out of every room, clear of every house.
        const standing = away && this.layout.ownership ? this.layout.houses.find(h => p.x >= h.x && p.x <= h.x + h.width && p.y >= h.y && p.y <= h.y + h.height) : undefined
        const room = house && !outdoors ? house : standing
        const behindDesk = !!desk && !away
        for (let radius = 0; !placed && (!room || radius <= Math.max(room.width, room.height)) && (!away || radius <= PLATE_AWAY_REACH); radius += 32) {
          yield
          // A mole behind a desk keeps its plate under that desk's front edge,
          // centred on its own body, before the side and floor fallbacks. In a row
          // of desks this stops a plate being pushed across the room to fit. A mole
          // outdoors with no desk keeps its plate under its feet or over its head
          // first, as in a hall, so a view edge never shows the plate beside a body
          // it has cut off.
          const candidates = [
            ...(radius === 0 && behindDesk ? [{ x: p.x - 50, y: desk!.y + desk!.height + PLATE_DESK_GAP }] : []),
            ...(radius === 0 && (away || outdoors && !desk) ? [{ x: p.x - 50, y: p.y + 2 }, { x: p.x - 50, y: p.y - 152 }] : []),
            { x: p.x + 61 + radius, y: p.y - 56 }, { x: p.x - 61 - radius - PLATE_WIDTH, y: p.y - 56 },
            { x: p.x + 61, y: p.y - 56 - radius }, { x: p.x - 61 - PLATE_WIDTH, y: p.y - 56 - radius },
            { x: p.x + 61, y: p.y - 24 + radius }, { x: p.x - 61 - PLATE_WIDTH, y: p.y - 24 + radius },
          ]
          for (const point of candidates) {
            const rect = { ...point, width: PLATE_WIDTH, height: PLATE_HEIGHT }
            const inside = room ? insideRoom(room, rect) : !(away && this.layout.ownership && this.layout.houses.some(h => overlaps(rect, h)))
            if (inside && clear(rect)) { placed = rect; break }
          }
        }
        if (placed) { result.set(actor.key, placed); used.push(placed) }
        yield
      }
      if (phase === 'seated') for (const actor of byKey.filter(actor => seated(actor) && actor.plate)) {
        result.set(actor.key, actor.plate!)
        yield
      }
    }
    return result
  }
}
export const shortName = (name: string): string => {
  const letters = [...name.trim()]
  return letters.length <= 12 ? letters.join('') : letters.slice(0, 11).join('') + '…'
}
