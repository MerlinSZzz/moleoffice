// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { GeometryRuntime, type GeometryReply, type GeometryRequest } from '../src/geometry-runtime.ts'
import { mountGeometryRuntime, type GeometryPort } from '../src/geometry-scheduler.ts'
import { GeometryClient, type WorkerPort } from '../src/geometry-client.ts'
import { chooseIdleOuting, IDLE_REACH, type IdleOuting } from '../src/idle-places.ts'
import { occupiedBodies, type IdleStanding } from '../src/walks.ts'
import { bodiesOverlap, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import { standingScale } from '../src/appearance.ts'
import { actorRect } from '../src/layout-index.ts'
import { inPolygon } from '../src/village.ts'
import { inPackedRing, packedRings } from '../src/packed-road.ts'
import type { Layout, LayoutInput, Point, Route } from '../src/geometry.ts'
import type { Rect } from '../src/viewport.ts'
import type { RosterView } from '../src/contracts.ts'
import catalog from '../assets/village-catalog.json'
import * as bundled from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

// Every agent, person and project here is made up, and every id starts `invented-`.
type Agent = ReturnType<typeof agent>
const person = { kind: 'person' as const, id: 'invented-person', handle: 'invented-person', name: 'Made-up person' }
const made = (id: string, patch: Partial<Agent> = {}): Agent => agent(id, { name: `Made-up ${id}`, projects: ['invented-project'], presence: [{ project: 'invented-project', colour: 'green', word: 'Made-up' }], ...patch })
const pack: any = { sources: { sprites: bundled.sprites }, images: new Map(Object.keys(bundled.atlases).map(key => [key, {}])) }
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const next = work.next(); if (next.done) return next.value } }

/** A secretary and `count` workers it started, who sit in its direct room. */
const directOffice = (count: number) => [made('invented-secretary', { role: 'secretary', startedBy: { kind: 'person', id: person.id } }),
  ...Array.from({ length: count }, (_, i) => made(worker(i), { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
const worker = (i: number) => `invented-worker-${String(i).padStart(4, '0')}`

/** The trial office of out/office-map/idle-round/visual-safe/fixture.mjs, rebuilt with the same ids,
 * roles, starters, creation times, saved looks and no saved scale: one secretary, two supervisors,
 * nine team workers, one inspector and thirteen direct workers. */
function trialOffice(): Agent[] {
  const looks = ['bare', 'scarf', 'sand-apron', 'cocoa-vest', 'silver-glasses'], agents: Agent[] = []
  const add = (n: number, role: Agent['role'], startedBy: Agent['startedBy']) => agents.push(made(`invented-${n}`, {
    role, startedBy, createdAt: `2026-08-01 ${String(8 + Math.floor(agents.length / 4)).padStart(2, '0')}:${String((agents.length * 7) % 60).padStart(2, '0')}:00`,
    appearance: { version: 2, style: 'c-forest', lookId: looks[agents.length % looks.length]! }, appearanceChosen: true, scale: null,
  }))
  add(1, 'secretary', { kind: 'person', id: person.id })
  add(2, 'supervisor', { kind: 'agent', id: 'invented-1' }); add(3, 'supervisor', { kind: 'agent', id: 'invented-1' })
  for (let n = 4; n <= 8; n++) add(n, 'worker', { kind: 'agent', id: 'invented-2' })
  for (let n = 9; n <= 12; n++) add(n, 'worker', { kind: 'agent', id: 'invented-3' })
  add(13, 'inspector', { kind: 'agent', id: 'invented-1' })
  for (let n = 14; n <= 26; n++) add(n, 'worker', { kind: 'agent', id: 'invented-1' })
  return agents
}

/** What the page receives. The production scheduler and runtime run behind a port that
 * structured-clones every message both ways, each reply with its own transfer list, into the
 * production client. `full` is the worker's own layout, built the same way, to judge against. */
function pageReceives(agents: Agent[]) {
  const model = mapOffice({ ...people, people: [person], view: 'roster', agents } as RosterView, null)
  const input: LayoutInput = { rooms: model.rooms.map(room => ({ id: room.id, occupants: room.occupants })), roster: model.layoutRoster, sleepingCount: 0 }
  const queue: (() => void)[] = [], replies: GeometryReply[] = []
  const port: WorkerPort = { onmessage: null, onerror: null, terminate: () => {}, postMessage: request => { queue.push(() => worker.onmessage!({ data: structuredClone(request) } as MessageEvent<GeometryRequest>)) } }
  const worker: GeometryPort = { onmessage: null, postMessage: (reply, transfer = []) => {
    const copy = structuredClone(reply, { transfer }) as GeometryReply
    // The test keeps its own copy: the client fills the layout reply it receives with the drawing.
    replies.push(structuredClone(copy)); queue.push(() => port.onmessage?.({ data: copy } as MessageEvent<GeometryReply>))
  } }
  mountGeometryRuntime(worker, new GeometryRuntime(new OwnershipGeometryCache()), () => 0, fn => { queue.push(fn); return 0 as unknown as ReturnType<typeof setTimeout> }, () => {})
  const run = () => { while (queue.length) queue.shift()!() }
  const client = new GeometryClient(() => port, () => {})
  client.setContext('invented-boundary', true); client.update(input); run()
  expect(client.snapshot().status).toBe('ready')
  const drawn = client.snapshot().layout!, full = finish(new OwnershipGeometryCache().build(input))
  const artwork: Rect[] = (OfficeMap.prototype as any).motionFurniture.call({ layout: drawn, pack })
  expect(artwork).not.toBeNull()
  // The page's bodies: OfficeMap.motionBounds for an agent with no desk action and no sleep place.
  const entries = model.occupants.filter(o => drawn.seats[o.key]).map(o => ({ key: o.key, id: o.agent.id, foot: drawn.seats[o.key]!.foot,
    body: visualBodyBounds(o.standing.look, o.agent.scale === null ? .82 : standingScale(o.agent.scale.value), catalog.sprites as any)! }))
  return { client, run, replies, drawn, full, artwork, entries }
}
type Office = ReturnType<typeof pageReceives>
const offices = new Map<number, Office>()
const sized = (count: number) => { const kept = offices.get(count) ?? pageReceives(directOffice(count)); offices.set(count, kept); return kept }

// What the page's idle choice reads. Before this round the page chose on the drawing layout the
// client holds, so the red run measures that.
const ground = (client: GeometryClient): Layout | null => typeof (client as any).navigation === 'function' ? (client as any).navigation() : client.snapshot().layout

const inside = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
const floorAt = (layout: Layout, p: Point) => layout.houses.find(h => inside(p, h) && h.walkable.some(poly => inPolygon(h.walkableOrigin ? { x: p.x - h.walkableOrigin.x, y: p.y - h.walkableOrigin.y } : p, poly))) ?? null
const openGround = (layout: Layout, p: Point) => inside(p, layout.square) || layout.road.rings.some(ring => inPolygon(p, ring)) || [...packedRings(layout.roadDrawing ?? [])].some(ring => inPackedRing(p, ring))
const around = (feet: Point[]) => { const x = Math.min(...feet.map(p => p.x)) - 720, y = Math.min(...feet.map(p => p.y)) - 500; return { x, y, width: Math.max(...feet.map(p => p.x)) + 720 - x, height: Math.max(...feet.map(p => p.y)) + 500 - y } }

/** The page's choice, as src/page.ts makes it: the other bodies, the visible furniture and the
 * chosen layout's obstacles block; a place must be on camera. */
function pageOuting(office: Office, ids: string[], camera?: Rect) {
  const selected = ids.map(id => office.entries.find(e => e.id === id)!)
  const others = office.entries.filter(e => !ids.includes(e.id)).map(e => translateBody(e.body, e.foot))
  const view = camera ?? around(selected.map(e => e.foot)), visible = (p: Point) => bodiesOverlap(actorRect(p), view)
  const layout = ground(office.client)
  expect(layout, 'the page holds a layout to choose idle places on').not.toBeNull()
  const walkers = selected.map(e => ({ id: e.key, foot: e.foot, body: e.body }))
  return { selected, walkers, others, visible, layout: layout!, outing: chooseIdleOuting(layout!, walkers, [...others, ...office.artwork, ...layout!.obstacles], visible, 0) }
}

/** Judged against the worker's own layout: each place is on the walker's own floor or on open
 * ground, near, on camera and clear of every obstacle, piece of furniture and body, and the route
 * search, asked through the client as the page asks it, finds every walker's route. */
function failures(office: Office, ids: string[], label: string, camera?: Rect): string[] {
  const { selected, others, visible, outing } = pageOuting(office, ids, camera)
  console.log('PAGE-OUTING', JSON.stringify({ label, ids, outing }))
  if (!outing) return [`${label}: no place`]
  const found: string[] = []
  if (outing.walkers.length !== ids.length) found.push(`${label}: ${outing.walkers.length} of ${ids.length} walk`)
  const rows = office.entries.map(e => ({ id: e.key, home: e.foot, current: e.foot, body: e.body })), standing: IdleStanding[] = []
  outing.walkers.forEach((key, i) => {
    const walker = selected.find(e => e.key === key)!, place = outing.places[i]!, at = floorAt(office.full, place)
    if (at ? at !== floorAt(office.full, walker.foot) : !openGround(office.full, place)) found.push(`${label}: ${walker.id} place ${JSON.stringify(place)} is not on its own floor or on open ground`)
    if (Math.hypot(place.x - walker.foot.x, place.y - walker.foot.y) > IDLE_REACH) found.push(`${label}: ${walker.id} place is out of reach`)
    if (!visible(place)) found.push(`${label}: ${walker.id} place is off camera`)
    const body = translateBody(walker.body, place), hit = office.full.obstacles.find(obstacle => bodiesOverlap(body, obstacle))
    if (hit) found.push(`${label}: ${walker.id} place overlaps a ${hit.kind}`)
    if ([...others, ...office.artwork].some(blocker => bodiesOverlap(body, blocker))) found.push(`${label}: ${walker.id} place overlaps a body or furniture`)
    let route = null as Route | null
    office.client.idleRoute(walker.key, walker.foot, place, occupiedBodies(rows, walker.key, standing)!, walker.body, office.artwork, done => { route = done })
    office.run()
    console.log('PAGE-ROUTE', JSON.stringify({ label, walker: walker.id, place, status: route?.status ?? null, points: route?.points.length ?? 0 }))
    if (route?.status !== 'found') found.push(`${label}: ${walker.id} route ${route?.status ?? 'not answered'}`)
    standing.push({ id: walker.key, point: place })
  })
  return found
}
const houseType = (office: Office, id: string) => floorAt(office.full, office.entries.find(e => e.id === id)!.foot)?.type

for (const size of [2, 5, 9, 100, 1000]) {
  it(`gives a desk pair in the direct room of ${size} workers idle places on walked ground, chosen on what the page receives`, () => {
    const office = sized(size), pairs = [[0, 1], [Math.floor(size / 2) - 1, Math.floor(size / 2)]].filter(([a], n) => n === 0 || a! > 0)
    const found: string[] = []
    for (const [a, b] of pairs) {
      const ids = [worker(a!), worker(b!)]
      expect(ids.map(id => houseType(office, id)), `${ids} sit in the direct room`).toEqual(['direct', 'direct'])
      found.push(...failures(office, ids, `${size} workers`))
    }
    expect(found).toEqual([])
  }, 120000)

  it(`hands the page every floor, road ring and obstacle of the worker's layout at ${size} workers, and leaves the drawing layout as it was`, () => {
    const office = sized(size), layout = ground(office.client)!
    expect(layout.obstacles).toEqual(office.full.obstacles)
    expect(layout.houses.map(h => [h.x, h.y, h.width, h.height, h.walkable, h.walkableOrigin ?? null, h.doors])).toEqual(office.full.houses.map(h => [h.x, h.y, h.width, h.height, h.walkable, h.walkableOrigin ?? null, h.doors]))
    expect(layout.road.rings).toEqual(office.full.road.rings)
    expect([layout.roadDrawing, layout.square, layout.bounds]).toEqual([office.full.roadDrawing, office.full.square, office.full.bounds])
    expect(office.drawn.obstacles).toEqual([])
    expect(office.drawn.houses.filter(h => h.type !== 'secretariat').every(h => !h.walkable.length && !h.hitArea.length)).toBe(true)
  }, 120000)
}

it('gives two secretaries in the secretariat hall idle places on walked ground, chosen on what the page receives', () => {
  const agents = ['a', 'b'].flatMap(s => [made(`invented-secretary-${s}`, { role: 'secretary', startedBy: { kind: 'person', id: person.id } }),
    ...[1, 2].map(n => made(`invented-worker-${s}-${n}`, { startedBy: { kind: 'agent', id: `invented-secretary-${s}` } }))])
  const office = pageReceives(agents), ids = ['invented-secretary-a', 'invented-secretary-b']
  expect(ids.map(id => houseType(office, id))).toEqual(['secretariat', 'secretariat'])
  expect(failures(office, ids, 'secretariat pair')).toEqual([])
})

it('gives the trial pair idle places on walked ground with both actors on camera, chosen on what the page receives', () => {
  const office = pageReceives(trialOffice()), ids = ['invented-14', 'invented-16']
  expect(office.entries).toHaveLength(26)
  expect(ids.map(id => houseType(office, id))).toEqual(['direct', 'direct'])
  const feet = ids.map(id => office.entries.find(entry => entry.id === id)!.foot)
  const camera = { x: (feet[0]!.x + feet[1]!.x) / 2 - 696, y: (feet[0]!.y + feet[1]!.y) / 2 - 425, width: 1392, height: 850 }
  expect(feet.every(foot => inside(foot, camera))).toBe(true)
  expect(failures(office, ids, 'trial pair', camera)).toEqual([])
})

it('keeps a trial pair off a stool that the drawing layout leaves out', () => {
  const office = pageReceives(trialOffice())
  const stools = office.full.obstacles.filter(obstacle => obstacle.kind === 'stool')
  const onStool = (chosen: IdleOuting) => chosen.places.some((place, i) => {
    const body = office.entries.find(e => e.key === chosen.walkers[i])!.body
    return stools.some(stool => bodiesOverlap(translateBody(body, place), stool))
  })
  expect(office.drawn.obstacles).toEqual([])
  // The 13-person hall moved its desk rows, so the old fixed trial pair no longer stands on a
  // stool when the obstacles are left out. Find any trial pair whose clear outing does.
  const direct = office.entries.filter(e => houseType(office, e.id) === 'direct').map(e => e.id)
  let found: { ids: string[]; without: IdleOuting } | null = null
  for (let a = 0; a < direct.length && !found; a++) for (let b = a + 1; b < direct.length && !found; b++) {
    const ids = [direct[a]!, direct[b]!], { walkers, others, visible } = pageOuting(office, ids)
    const without = chooseIdleOuting(office.full, walkers, [...others, ...office.artwork], visible, 0)
    if (without && onStool(without)) found = { ids, without }
  }
  expect(found, 'a trial pair whose clear outing stands on a stool').not.toBeNull()
  // Control: on the worker's layout with its obstacles left out, the chooser stands a walker on a stool.
  expect(onStool(found!.without)).toBe(true)
  const outing = pageOuting(office, found!.ids).outing
  expect(outing).not.toBeNull()
  expect(onStool(outing!)).toBe(false)
}, 120000)

it('sends the navigation data in chunks within the drawing bound at 1000 workers, and never in the final layout message', () => {
  const office = sized(1000), drawings = office.replies.flatMap(reply => reply.kind === 'drawing' ? [reply.chunk] : [])
  let obstacles = 0, floors = 0, navigationChunks = 0
  for (const chunk of drawings) {
    for (const [key, values] of Object.entries(chunk)) if (key !== 'navigation') expect(Array.isArray(values) ? values.length : Object.keys(values).length).toBeLessThanOrEqual(key === 'roadDrawing' ? 32 : 128)
    const navigation = (chunk as any).navigation as Record<string, unknown[]> | undefined
    if (!navigation) continue
    navigationChunks++
    for (const [key, values] of Object.entries(navigation)) expect(values.length, `navigation ${key}`).toBeLessThanOrEqual(key === 'rings' ? 32 : 128)
    obstacles += navigation.obstacles?.length ?? 0; floors += navigation.floors?.length ?? 0
  }
  console.log('NAVIGATION-CHUNKS', JSON.stringify({ drawingMessages: drawings.length, navigationChunks, obstacles, floors, workerObstacles: office.full.obstacles.length, houses: office.full.houses.length }))
  expect([obstacles, floors]).toEqual([office.full.obstacles.length, office.full.houses.length])
  const last = office.replies.find(reply => reply.kind === 'layout')
  expect(last?.kind === 'layout' && [last.layout.obstacles, last.layout.houses, (last.layout as any).navigation]).toEqual([[], [], undefined])
}, 120000)

