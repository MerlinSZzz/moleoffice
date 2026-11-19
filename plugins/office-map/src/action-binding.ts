// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { standingClothes, standingScale } from './appearance.ts'
import type { Layout } from './geometry.ts'
import type { Occupant, OfficeModel } from './model.ts'
import type { FacilityStation } from './ownership-facilities.ts'
import { standsOn } from './desk-things.ts'
import { anchored, stableHash, type Piece } from './village.ts'
import type { FacilityAction } from './action-data.ts'
import { pixelHash } from './action-pixels.ts'
import { DEFAULT_MOLE_SCALE } from './walks.ts'
export interface ActionBinding { activity: FacilityStation['activity']; action: FacilityAction; ownerKey: string; clusterKey: string }
export interface ContactPiece extends Piece { contactSize?: [number, number] }
export const nativeTuft = (actor: Occupant): boolean => actor.standing.look === 'tuft' && !standingClothes(actor.standing) && (actor.agent.appearance == null || actor.portrait.unavailable === null)
export const actorScale = (actor: Occupant): number => actor.agent.scale === null ? DEFAULT_MOLE_SCALE : standingScale(actor.agent.scale.value)
/** Effective display fields only; never retain the supplied raw appearance JSON. */
export function bindingSignature(model: OfficeModel): string {
  let digest = pixelHash(new TextEncoder().encode('tuft-binding-v1'))
  for (const actor of model.occupants) {
    const fields=JSON.stringify([actor.key.length<=2048?actor.key:null,actor.standing.look,actor.standing.recipe??null,nativeTuft(actor),actorScale(actor),!!actor.agent.retired])
    digest=pixelHash(new TextEncoder().encode(digest+':'+pixelHash(new TextEncoder().encode(fields))))
  }
  return digest
}
const transforms: Record<string, [number, number, number, number]> = { 'worker-desk': [19,-40,86,44], 'stool-se': [-56,-24,41,42], bookshelf: [-11,-134,107,126], 'tea-table': [18,-32,69,42], 'message-board': [-11,-101,144,83] }
/** Presentation only: seats, obstacles, route geometry and unbound pieces retain their identities. */
export function bindActions(layout: Layout, model: OfficeModel, idle: ReadonlySet<string> = new Set(), away: ReadonlySet<string> = new Set()): { layout: Layout; bindings: Map<string, ActionBinding>; rejected: string[] } {
  const bindings = new Map<string, ActionBinding>(), rejected: string[] = [], remove = new Set<Piece>(), added: ContactPiece[] = []
  if (!layout.ownership || layout.preview) return { layout, bindings, rejected }
  const actors = new Map(model.occupants.map(actor => [actor.key, actor]))
  const find = (sprite: string, x: number, y: number): Piece | undefined => layout.pieces.find(p => p.sprite === sprite && Math.abs(p.x-x) < .001 && Math.abs(p.y-y) < .001)
  const commit = (key: string, action: FacilityAction, props: Piece[], extras: Piece[] = []): void => {
    const actor = actors.get(key)!, seat = layout.seats[key] as FacilityStation, scale = actorScale(actor)
    const pieces = props.map(p => { const [x,y,width,height] = transforms[p.sprite]!; return { ...p, x: seat.foot.x+x*scale, y: seat.foot.y+y*scale, width: width*scale, height: height*scale, scale, depth: seat.foot.y-1, contactSize: [width,height] as [number,number] } })
    // The active desk is a native contact resized around the actor. Each thing on it
    // keeps its place on the desk's own top, scaled with the desk's width.
    const attached = action === 'desk' && props[0] && pieces[0] ? extras.map(p => {
      const source = props[0]!, desk = pieces[0]!, ratio = desk.width / source.width
      return { ...p, x: desk.x + (p.x - source.x) * ratio, y: desk.y + (p.y - source.y) * ratio,
        width: p.width * ratio, height: p.height * ratio, scale: (p.scale ?? 1) * ratio, depth: desk.depth + 1 }
    }) : []
    for (const p of [...pieces, ...attached]) {
      const b = layout.bounds
      if (p.x < b.x || p.y < b.y || p.x+p.width > b.x+b.width || p.y+p.height > b.y+b.height) { rejected.push(key+':bounds'); return }
      for (const [other, station] of Object.entries(layout.seats)) {
        if (other === key) continue
        const who = actors.get(other), s = who ? actorScale(who) : DEFAULT_MOLE_SCALE, x = station.foot.x-64*s, y = station.foot.y-111*s
        if (p.x < x+128*s && p.x+p.width > x && p.y < y+128*s && p.y+p.height > y) { rejected.push(key+':actor-overlap'); return }
      }
      if (layout.obstacles.some(w => w.kind === 'wall' && !props.some(old => w.x >= old.x && w.x+w.width <= old.x+old.width+.001 && w.y >= old.y && w.y+w.height <= old.y+old.height+.001) && p.x < w.x+w.width && p.x+p.width > w.x && p.y < w.y+w.height && p.y+p.height > w.y)) { rejected.push(key+':wall'); return }
    }
    props.forEach(p => remove.add(p)); extras.forEach(p => remove.add(p)); added.push(...pieces, ...attached)
    bindings.set(key, { activity: seat.activity, action, ownerKey: key, clusterKey: seat.cluster })
  }
  const clusters = new Map<string, string[]>()
  for (const [key, station] of Object.entries(layout.seats)) {
    const seat = station as FacilityStation, actor = actors.get(key)
    if (!actor || !nativeTuft(actor) || actor.agent.retired || idle.has(key) || away.has(key)) continue
    if (seat.activity === 'desk') {
      if (seat.cluster.includes('/secretary-')) continue
      const desk = find('worker-desk',seat.desk.x,seat.desk.y); if (!desk) continue
      const stool = anchored('stool-se', seat.foot, desk.group)
      const extras = layout.pieces.filter(p => standsOn(p, seat.desk))
      commit(key,'desk',[desk,stool],extras)
    } else if (seat.activity === 'reading' || seat.activity === 'garden') { const list = clusters.get(seat.cluster) ?? []; list.push(key); clusters.set(seat.cluster,list) }
  }
  for (const [cluster, candidates] of clusters) {
    candidates.sort(); const all = Object.entries(layout.seats).filter(([,s]) => (s as FacilityStation).cluster === cluster).sort(([,a],[,b]) => a.index-b.index)
    const first = all[0]![1], center = { x: first.foot.x+140, y: first.foot.y-35 }, seat = first as FacilityStation
    const at = (sprite: string, y: number): Piece | undefined => { const p = anchored(sprite,{ x:center.x,y:center.y+y },null); return find(sprite,p.x,p.y) }
    if (seat.activity === 'garden') { const board = at('message-board',-160); if (board) commit(candidates[0]!,'garden',[board]); continue }
    const roles: FacilityAction[] = candidates.length > 1 ? ['pickup','putdown'] : [stableHash(cluster+'|'+candidates[0]) % 2 ? 'putdown' : 'pickup']
    roles.forEach((role,i) => { const prop = at(role === 'pickup' ? 'bookshelf' : 'tea-table',role === 'pickup' ? -160 : 0), tea = at('tea-set',-35); if (prop) commit(candidates[i]!,role,[prop],role === 'putdown' && tea ? [tea] : []) })
  }
  return { layout: remove.size || added.length ? { ...layout, pieces: [...layout.pieces.filter(p => !remove.has(p)),...added] } : layout, bindings, rejected }
}
