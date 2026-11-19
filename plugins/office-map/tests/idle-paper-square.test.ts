// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { chooseIdleOuting } from '../src/idle-places.ts'
import { PAPER_ARC_SHIFT, paperArcClear, paperArcRect } from '../src/walks.ts'
import { translateBody, visualBodyBounds } from '../src/visual-body.ts'
import type { RosterView } from '../src/contracts.ts'
import { atlases, sprites as bundled } from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

it('draws visible paper travel at a clear furnished-room meeting', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 4 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null), build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let step = build.next(); while (!step.done) step = build.next()
  const layout = step.value, sprites: any = bundled, images = new Map(Object.keys(atlases).map(key => [key, {}]))
  const pack: any = { sources: { sprites }, images }, fake: any = { layout, pack }
  const furniture = (OfficeMap.prototype as any).motionFurniture.call(fake)
  expect(furniture).not.toBeNull()
  const keys = ['["agent","invented-worker-0"]', '["agent","invented-worker-1"]']
  const participants = keys.map(key => model.occupants.find(occupant => occupant.key === key)!)
  const bodies = participants.map(o => visualBodyBounds(o.standing.look, .92)!)
  const others = model.occupants.filter(o => !keys.includes(o.key)).map(o => translateBody(visualBodyBounds(o.standing.look, .92)!, layout.seats[o.key]!.foot))
  const walkers = participants.map((o, i) => ({ id: o.key, foot: layout.seats[o.key]!.foot, body: bodies[i]! }))
  const blockers = [...others, ...furniture, ...layout.obstacles]
  const clearAt = (places: readonly { x: number; y: number }[], playBodies: readonly any[], extra: readonly any[]): boolean =>
    places.length === 2 && paperArcClear(places[0]!, sprites['paper-stack'], [...extra, ...places.map((place, i) => translateBody(playBodies[i]!, place))], PAPER_ARC_SHIFT)
  const nearest = chooseIdleOuting(layout, walkers, blockers, () => true, 0)?.places ?? null
  expect(nearest).not.toBeNull()
  const blockedArc = paperArcRect(nearest![0]!, sprites['paper-stack'], PAPER_ARC_SHIFT)!
  const blocker = { x: blockedArc.x + 2, y: blockedArc.y + 2, width: 4, height: 4 }
  const paperBlockers = [...blockers, blocker]
  expect(clearAt(nearest!, bodies, paperBlockers), 'the nearest meeting is blocked').toBe(false)
  const chosen = chooseIdleOuting(layout, walkers, paperBlockers, () => true, 0, clearAt)
  expect(chosen).not.toBeNull()
  expect(chosen!.places).not.toEqual(nearest)
  expect(clearAt(chosen!.places, bodies, paperBlockers), 'the chosen meeting has a clear paper arc').toBe(true)
  const meeting = chosen!.places
  const first = participants[0]!, drawn: any[][] = [], ctx: any = { save() {}, restore() {}, translate() {}, scale() {}, drawImage(...args: any[]) { drawn.push(args) } }
  first.standing = { look: first.standing.look, source: 'saved-catalogue' }
  const view: any = { occupants: new Map([[first.key, first]]), drawnScale: OfficeMap.prototype.drawnScale, whereaboutsByKey: new Map(), individuals: true, layout, options: { still: false, wave: null, workAvailable: true }, actions: { draw: () => false }, pack, lookFrames: { draw: () => false } }
  const walk = { id: 'invented-play', from: first.key, to: participants[1]!.key, point: meeting![0]!, elapsed: 0, facing: 1, phase: 'play', paper: true }
  ;(OfficeMap.prototype as any).actor.call(view, ctx, first.key, walk.point, walk)
  expect(drawn.length).toBeGreaterThan(1)
  // The paper is drawn inside the arc the meeting was chosen to keep clear, and starts at its left edge.
  const arc = paperArcRect(meeting![0]!, sprites['paper-stack'], PAPER_ARC_SHIFT)!
  const insideTheArc = ([x, y, width, height]: number[]): boolean =>
    x! >= arc.x - 1e-9 && y! >= arc.y - 1e-9 && x! + width! <= arc.x + arc.width + 1e-9 && y! + height! <= arc.y + arc.height + 1e-9
  const start = drawn.at(-1)!.slice(5, 9)
  expect(start[0]).toBeCloseTo(arc.x)
  expect(insideTheArc(start), 'the paper at the start of the gesture lies inside the clear arc').toBe(true)
  drawn.length = 0; walk.elapsed = 600
  ;(OfficeMap.prototype as any).actor.call(view, ctx, first.key, walk.point, walk)
  expect(drawn.length).toBeGreaterThan(1)
  const later = drawn.at(-1)!.slice(5, 9)
  expect(later.slice(0, 2)).not.toEqual(start.slice(0, 2))
  expect(insideTheArc(later), 'the paper part way through the gesture lies inside the clear arc').toBe(true)
}, 30000)
