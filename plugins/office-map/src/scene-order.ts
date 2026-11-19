// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { isTree, type House, type Piece } from './village.ts'
import { sortSteps } from './render-plan.ts'
import type { Point } from './geometry.ts'
import type { MovingContact } from './walks.ts'

export interface Actor { key: string; point: Point; walk?: MovingContact; depth?: number }
interface Entry { depth: number; piece?: Piece; actor?: Actor; inside?: Entry[] }
const contains = (h: House, p: Point) => p.x >= h.x && p.x < h.x + h.width && p.y >= h.y && p.y < h.y + h.height
const plane = (e: Entry) => e.piece?.layer === 'floor' ? (e.piece.sprite.endsWith('-floor') ? 0 : 1) : e.piece?.layer === 'back' ? 2 : 3
/** Trees behind every intersecting house already belong in the ground cache.
 * Only an overlapping foreground base needs the whole-house depth pass. */
export const depthSortedTree = (p: Piece, houses: House[]): boolean => isTree(p) && houses.some(h => p.depth > h.anchor.y && p.x < h.x + h.width && h.x < p.x + p.width && p.y < h.y + h.height && h.y < p.y + p.height)

/** Outdoors, whole houses and trees compare at their ground bases. Indoors, a
 * house's floor tiles come first, then its other floor pieces such as rugs, then
 * its back wall, then furniture, moles and the front. Floor pieces otherwise keep
 * the order the scenery index returns them in, which is not a drawing order.
 * A behind-house canopy stays behind the back wall without putting indoor moles
 * behind that wall. */
export function* sceneOrder(pieces: Piece[], actors: Actor[], houses: House[]): Generator<Entry | void> {
  const outer: Entry[] = [], groups = new Map<House, Entry>(), byGroup = new Map<string, House[]>()
  for (const house of houses) { const own = byGroup.get(house.group) ?? []; own.push(house); byGroup.set(house.group, own); yield }
  const add = (entry: Entry, home?: House) => {
    if (!home) { outer.push(entry); return }
    let group = groups.get(home)
    if (!group) { group = { depth: home.anchor.y, inside: [] }; groups.set(home, group); outer.push(group) }
    group.inside!.push(entry)
  }
  for (const p of pieces) {
    if (isTree(p) && (p.decoration || p.cached) && !depthSortedTree(p, houses)) { yield; continue }
    if (isTree(p) || p.group !== null || !p.decoration && !p.cached && (p.layer === 'object' || p.layer === 'front')) {
      const own = p.group === null ? undefined : byGroup.get(p.group)
      const home = isTree(p) ? undefined : own?.find(h => contains(h, p)) ?? (own?.length === 1 ? own[0] : undefined)
      add({ depth: p.depth, piece: p }, home)
    }
    yield
  }
  for (const actor of actors) { add({ depth: actor.depth ?? actor.point.y, actor }, houses.find(h => contains(h, actor.point))); yield }
  for (const entry of yield* sortSteps(outer, (a, b) => a.depth - b.depth)) {
    if (entry.inside) for (const inside of yield* sortSteps(entry.inside, (a, b) => plane(a) - plane(b) || (plane(a) === 3 ? a.depth - b.depth : 0))) yield inside
    else yield entry
  }
}
