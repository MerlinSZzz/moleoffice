// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { routeIdle, type Point } from '../src/geometry.ts'
import { chooseIdleOuting, type IdleOuting } from '../src/idle-places.ts'
import { IdleMotion, type IdleActor, type IdleInput, type WalkClock } from '../src/walks.ts'
import { seededChances } from '../src/idle-outings.ts'
import { bodiesOverlap, sweptBodyHits, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingScale } from '../src/appearance.ts'
import type { Rect } from '../src/viewport.ts'
import type { RosterView } from '../src/contracts.ts'
import { atlases, sprites as bundled } from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

class Clock implements WalkClock {
  time = 0; next = 0
  frames = new Map<number, () => void>(); timers = new Map<number, { at: number; run: () => void }>()
  now() { return this.time }
  frame(run: () => void) { const id = ++this.next; this.frames.set(id, run); return id }
  cancelFrame(id: number) { this.frames.delete(id) }
  later(run: () => void, delay: number) { const id = ++this.next; this.timers.set(id, { at: this.time + delay, run }); return id }
  cancelLater(id: number) { this.timers.delete(id) }
  advance(ms: number) { this.time += ms; const frames = [...this.frames.values()]; this.frames.clear(); frames.forEach(run => run()); for (const [id, timer] of [...this.timers]) if (timer.at <= this.time) { this.timers.delete(id); timer.run() } }
}

function inventedOffice() {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 7 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, sprites: any = bundled
  const fake: any = { layout, pack: { sources: { sprites }, images: new Map(Object.keys(atlases).map(key => [key, {}])) } }
  const art: Rect[] | null = (OfficeMap.prototype as any).motionFurniture.call(fake)
  const walkers = model.occupants.flatMap(occupant => {
    const foot = layout.seats[occupant.key]?.foot
    const body = visualBodyBounds(occupant.standing.look, occupant.agent.scale === null ? .82 : standingScale(occupant.agent.scale.value))
    return foot && body ? [{ id: occupant.key, foot, body }] : []
  })
  return { layout, art, walkers }
}

it('keeps random outings on an invented furnished office clear of the drawn furniture, not only its footprint', () => {
  const { layout, art, walkers } = inventedOffice()
  expect(art).not.toBeNull()
  expect(walkers).toHaveLength(8)
  // A floor obstacle covers only the bottom of a drawn piece; the drawn bounds are the safeguard.
  expect(art!.length).toBeGreaterThan(0)
  const byId = new Map(walkers.map(walker => [walker.id, walker])), agents = walkers.map(walker => ({ id: walker.id, foot: walker.foot, idle: true, body: walker.body }))
  const homes = (but: readonly string[]) => walkers.filter(walker => !but.includes(walker.id)).map(walker => translateBody(walker.body, walker.foot))
  // The same office with nothing to meet at: an outing there takes a place on bare floor, as in a room with no facility.
  const bare = { ...layout, pieces: [], facilities: [] }
  const outings: { outing: IdleOuting; onBareFloor: IdleOuting | null; footprintOnly: IdleOuting | null }[] = [], routes: { id: string; points: Point[]; occupied: Rect[] }[] = []
  const clock = new Clock(), frames: IdleActor[][] = []
  let motion: IdleMotion, turns = 0
  const turn = (): IdleInput => {
    turns++
    const pair = motion.selection(agents), group = pair.map(one => byId.get(one.id)!), others = homes(pair.map(one => one.id))
    const outing = chooseIdleOuting(layout, group, [...others, ...art!, ...layout.obstacles], () => true, motion.destinationOffset)
    if (outing) outings.push({ outing, onBareFloor: chooseIdleOuting(bare, group, [...others, ...art!, ...layout.obstacles], () => true, motion.destinationOffset), footprintOnly: chooseIdleOuting(bare, group, [...others, ...layout.obstacles], () => true, motion.destinationOffset) })
    return { enabled: true, agents, places: outing?.places ?? [], walkers: outing?.walkers, refusal: outing ? undefined : 'no-place' }
  }
  motion = new IdleMotion(clock, (id, target, done, start, standing) => {
    const walker = byId.get(id)!
    const occupied = [...homes([id]), ...(standing ?? []).map(one => translateBody(byId.get(one.id)!.body, one.point))]
    const route = routeIdle(layout, start!, target, occupied, id, walker.body, art!)
    routes.push({ id, points: route.points, occupied }); done(route)
  }, actors => frames.push(actors), () => {}, () => motion.update(turn()), { preflight: true, chances: seededChances(17) })
  motion.update(turn())
  for (let i = 0; i < 4000 && turns < 40; i++) clock.advance(500)
  motion.dispose()
  expect(turns).toBeGreaterThanOrEqual(40)
  expect(outings.length).toBeGreaterThanOrEqual(5)
  expect(new Set(outings.flatMap(one => one.outing.places.map(place => `${place.x},${place.y}`))).size).toBeGreaterThanOrEqual(6)
  expect(outings.filter(one => one.onBareFloor).length).toBeGreaterThanOrEqual(5)
  for (const chosen of outings.flatMap(one => one.onBareFloor ? [one.outing, one.onBareFloor] : [one.outing])) chosen.places.forEach((place, i) => {
    const body = translateBody(byId.get(chosen.walkers[i]!)!.body, place)
    for (const drawn of [...art!, ...layout.obstacles]) expect(bodiesOverlap(body, drawn), `${chosen.walkers[i]} at ${place.x},${place.y}`).toBe(false)
  })
  const walked = routes.filter(route => route.points.length >= 2)
  expect(walked.length).toBeGreaterThanOrEqual(outings.length)
  for (const route of walked) for (let i = 1; i < route.points.length; i++) for (const other of [...route.occupied, ...art!, ...layout.obstacles]) {
    expect(sweptBodyHits(route.points[i - 1]!, route.points[i]!, byId.get(route.id)!.body, other)).toBe(false)
  }
  // Every body drawn in every frame, walking or not, against every other: the moles out and those at home.
  const meetings = frames.flatMap((actors, n) => {
    const drawn = [...actors.map(actor => ({ id: actor.id, rect: translateBody(byId.get(actor.id)!.body, actor.point) })), ...walkers.filter(walker => !actors.some(actor => actor.id === walker.id)).map(walker => ({ id: walker.id, rect: translateBody(walker.body, walker.foot) }))]
    return drawn.flatMap((one, i) => drawn.slice(i + 1).filter(other => bodiesOverlap(one.rect, other.rect)).map(other => `frame ${n}: ${one.id} and ${other.id}`))
  })
  expect(meetings).toEqual([])
  const walking = frames.map(actors => actors.filter(actor => actor.phase === 'walk').length)
  console.log(JSON.stringify({ turns, outings: outings.length, groups: outings.map(one => one.outing.walkers.length), mostWalking: Math.max(...walking), framesWithTwo: walking.filter(n => n === 2).length, framesWithThree: walking.filter(n => n === 3).length }))
  expect(Math.max(...walking)).toBeLessThanOrEqual(3)
  // The control: chosen on bare floor against the footprints alone, some of the same turns would stand a mole on drawn furniture.
  const onArt = outings.some(({ footprintOnly }) => footprintOnly?.places.some((place, i) => art!.some(drawn => bodiesOverlap(translateBody(byId.get(footprintOnly.walkers[i]!)!.body, place), drawn))))
  expect(onArt).toBe(true)
}, 60000)

it('refuses an outing route on the invented office when the drawn furniture bounds are not known', () => {
  const { layout, walkers } = inventedOffice()
  const [walker] = walkers, target = { x: walker!.foot.x + 96, y: walker!.foot.y + 96 }
  expect(layout.pieces.some(piece => piece.layer !== 'floor')).toBe(true)
  expect(routeIdle(layout, walker!.foot, target, [], walker!.id, walker!.body, undefined).status).toBe('unavailable')
}, 60000)
