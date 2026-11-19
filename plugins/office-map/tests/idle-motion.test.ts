// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import * as geometry from '../src/geometry.ts'
import * as walks from '../src/walks.ts'
import * as mole from '../src/mole-state.ts'
import { standingLooks } from '../src/appearance.ts'
import { lookOrder } from '../src/look-order.ts'
import catalog from '../assets/village-catalog.json'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people, workRow } from './fixtures.ts'
import type { Layout, Point } from '../src/geometry.ts'
import type { WalkClock } from '../src/walks.ts'

class Clock implements WalkClock {
  time = 0; next = 0
  frames = new Map<number, () => void>(); timers = new Map<number, { at: number; run: () => void }>()
  now() { return this.time }
  frame(run: () => void) { const id = ++this.next; this.frames.set(id, run); return id }
  cancelFrame(id: number) { this.frames.delete(id) }
  later(run: () => void, delay: number) { const id = ++this.next; this.timers.set(id, { at: this.time + delay, run }); return id }
  cancelLater(id: number) { this.timers.delete(id) }
  advance(ms: number) {
    this.time += ms
    const frames = [...this.frames.values()]; this.frames.clear(); frames.forEach(run => run())
    for (const [id, timer] of [...this.timers]) if (timer.at <= this.time) { this.timers.delete(id); timer.run() }
  }
}
const p = (x: number, y: number): Point => ({ x, y })
const separation = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

// Synthetic topology: both the desk and the wall obstruct the direct line. The
// other occupied body blocks the remaining shortcut. Nothing comes from live data.
const layout = {
  key: 'invented', bounds: { x: 0, y: 0, width: 240, height: 160 },
  square: { x: 0, y: 0, width: 240, height: 160 }, rooms: [], houses: [], pieces: [], seats: {},
  obstacles: [{ x: 55, y: 0, width: 20, height: 90, kind: 'wall' }, { x: 110, y: 60, width: 30, height: 60, kind: 'desk' }],
  road: { halfWidth: 39, rings: [], ends: [], faults: [] }, bodyRadius: 8,
} as Layout

describe('idle movement on the map', () => {
  it('finds a clear route around walls, desks and occupied mole footprints, or refuses a blocked target', () => {
    const routeIdle = (geometry as any).routeIdle
    expect(routeIdle).toBeTypeOf('function')
    const start = p(20, 35), target = p(205, 35), occupied = [p(95, 115)]
    const mover = { x: -8, y: -8, width: 16, height: 16 }, boxes = occupied.map(q => ({ x: q.x - 8, y: q.y - 8, width: 16, height: 16 }))
    const route = routeIdle(layout, start, target, boxes, undefined, mover)
    expect(route.status).toBe('found')
    expect(route.points[0]).toEqual(start); expect(route.points.at(-1)).toEqual(target)
    expect(route.points.length).toBeGreaterThan(2)
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i], steps = Math.ceil(separation(a, b) / 2)
      for (let n = 0; n <= steps; n++) {
        const q = p(a.x + (b.x - a.x) * n / steps, a.y + (b.y - a.y) * n / steps)
        expect(geometry.pointIsClear(layout, q)).toBe(true)
        expect(separation(q, occupied[0]!)).toBeGreaterThanOrEqual(layout.bodyRadius * 2)
      }
    }
    const open = { ...layout, obstacles: [] }, body = p(110, 80), detour = routeIdle(open, p(20, 80), p(200, 80), [{ x: body.x - 8, y: body.y - 8, width: 16, height: 16 }], undefined, mover)
    expect(detour.status).toBe('found')
    for (let i = 1; i < detour.points.length; i++) {
      const a = detour.points[i - 1], b = detour.points[i], steps = Math.max(1, Math.ceil(separation(a, b)))
      for (let n = 0; n <= steps; n++) expect(separation(p(a.x + (b.x - a.x) * n / steps, a.y + (b.y - a.y) * n / steps), body)).toBeGreaterThanOrEqual(open.bodyRadius * 2)
    }
    expect(routeIdle(layout, start, p(65, 30), boxes, undefined, mover).status).not.toBe('found')
  })

  it('reaches an ownership square without cutting ground footprints or seated neighbours', () => {
    const routeIdle = (geometry as any).routeIdle
    expect(routeIdle).toBeTypeOf('function')
    const agents = [agent('invented-secretary', { role: 'secretary' }), agent('invented-a', { startedBy: { kind: 'agent', id: 'invented-secretary' } }), agent('invented-b', { startedBy: { kind: 'agent', id: 'invented-secretary' } })]
    const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
    const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
    let item = build.next(); while (!item.done) item = build.next()
    const map = item.value, id = JSON.stringify(['agent', 'invented-a']), start = map.seats[id]!.foot
    const others = Object.entries(map.seats).filter(([key]) => key !== id).map(([, seat]) => seat.foot)
    const target = map.places!.play[0]!, radius = map.bodyRadius, mover = { x: -radius, y: -radius / 3, width: radius * 2, height: radius / 3 }, boxes = others.map(q => ({ x: q.x - radius, y: q.y - radius, width: radius * 2, height: radius * 2 })), route = routeIdle(map, start, target, boxes, id, mover, [])
    expect(route.status).toBe('found'); expect(route.points[0]).toEqual(start); expect(route.points.at(-1)).toEqual(target)
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i], steps = Math.max(1, Math.ceil(separation(a, b) / 2))
      for (let n = 0; n <= steps; n++) {
        const q = p(a.x + (b.x - a.x) * n / steps, a.y + (b.y - a.y) * n / steps)
        expect(geometry.pointIsClear(map, q, [id])).toBe(true)
        for (const other of others) expect(separation(q, other)).toBeGreaterThanOrEqual(map.bodyRadius * 2)
      }
    }
  }, 30000)

  it('keeps working and unknown agents at their desks, caps movers and cancels all work on disable', () => {
    const IdleMotion = (walks as any).IdleMotion
    expect(IdleMotion).toBeTypeOf('function')
    const clock = new Clock(), drawn: any[][] = [], pending: ((route: geometry.Route | null) => void)[] = []
    const motion = new IdleMotion(clock, (_id: string, _target: Point, done: (route: geometry.Route | null) => void) => pending.push(done), (actors: any[]) => drawn.push(actors))
    const agents = Array.from({ length: 12 }, (_, i) => ({ id: `invented-${i}`, foot: p(10 + i * 20, 10), idle: i > 1 }))
    motion.update({ enabled: true, agents, places: [p(30, 100), p(80, 100), p(130, 100)] })
    expect(motion.snapshot().active).toBeGreaterThan(0)
    expect(motion.snapshot().active).toBeLessThanOrEqual(2)
    expect(pending.length).toBe(1)
    pending.shift()!({ status: 'found', points: [agents[2]!.foot, p(30, 100)] })
    clock.advance(400)
    expect(drawn.at(-1)!.every(a => a.id !== agents[0]!.id && a.id !== agents[1]!.id)).toBe(true)
    motion.update({ enabled: false, agents, places: [] })
    for (const done of pending) done({ status: 'found', points: [p(0, 0), p(100, 0)] })
    clock.advance(60000)
    expect(clock.frames.size).toBe(0); expect(clock.timers.size).toBe(0)
    expect(motion.snapshot().active).toBe(0)
    expect(drawn.at(-1)).toEqual([])
    motion.dispose()
  })

  it('only infers idle from a coherent loaded pair and stops when those facts change', () => {
    const eligible = (mole as any).idleEligible
    expect(eligible).toBeTypeOf('function')
    const occupant = mapOffice({ ...people, agents: [agent('invented')] }, null).occupants[0]!
    expect(eligible(occupant, false)).toBe(false)
    expect(eligible(occupant, true)).toBe(false)
    occupant.work = [workRow('invented-run', { executing: true })]
    expect(eligible(occupant, true)).toBe(false)
    occupant.work = [workRow('invented-run', { executing: false, runStanding: 'working' })]
    expect(eligible(occupant, true)).toBe(false)
    occupant.work = []
    occupant.facts = { people: { status: 'loaded', value: occupant.agent, error: null, revision: 1 }, work: { status: 'loaded', value: [], error: null, revision: 1 } } as any
    expect(eligible(occupant, true)).toBe(true)
    ;(occupant.facts!.work as any).pending = true
    expect(eligible(occupant, true)).toBe(true)
    ;(occupant.facts!.work as any).pending = false
    ;(occupant.facts!.work as any).revision = 2
    expect(eligible(occupant, true)).toBe(false)
    ;(occupant.facts!.work as any).status = 'unloaded'
    expect(eligible(occupant, true)).toBe(false)
  })

  it('brings two idle moles together without overlapping, then visibly interacts', () => {
    const IdleMotion = (walks as any).IdleMotion
    expect(IdleMotion).toBeTypeOf('function')
    const clock = new Clock(), requests: { id: string; target: Point; done: (route: geometry.Route | null) => void }[] = [], frames: any[][] = []
    const feet = new Map([['moss', p(20, 20)], ['fern', p(180, 20)]])
    const motion = new IdleMotion(clock, (id: string, target: Point, done: (route: geometry.Route | null) => void) => requests.push({ id, target, done }), (actors: any[]) => frames.push(actors))
    motion.update({ enabled: true, agents: [...feet].map(([id, foot]) => ({ id, foot, idle: true })), places: [p(80, 100), p(120, 100)] })
    for (let tick = 0; tick < 300; tick++) {
      while (requests.length) {
        const request = requests.shift()!, from = feet.get(request.id)!
        request.done({ status: 'found', points: [from, request.target] })
      }
      clock.advance(100)
      const frame = frames.at(-1) ?? []
      for (let i = 0; i < frame.length; i++) for (const other of frame.slice(i + 1)) expect(separation(frame[i].point, other.point)).toBeGreaterThanOrEqual(16)
      if (frame.filter(a => a.phase === 'play').length === 2) break
    }
    const playing = (frames.at(-1) ?? []).filter(a => a.phase === 'play')
    expect(playing).toHaveLength(2)
    expect(separation(playing[0].point, playing[1].point)).toBeLessThanOrEqual(80)
    expect(playing.every(a => a.partner && a.partner !== a.id)).toBe(true)
    motion.dispose()
  })

  it('uses an actual shared play gesture for every cast look and recoloured recipe', () => {
    const playPose = (mole as any).playPose
    expect(playPose).toBeTypeOf('function')
    for (const look of standingLooks) for (const phase of [0, 1]) {
      const pose = playPose({ look, source: 'saved-catalogue' }, phase)
      expect(pose.kind).toBe('play')
      expect(pose.sprite).toMatch(/^(wave|cheer)-/)
      expect(pose.sprite).toContain(look)
    }
    for (let recipe = 0; recipe < lookOrder.length; recipe++) {
      const pose = playPose({ look: standingLooks[Math.floor(lookOrder[recipe]! / 3)], source: 'stable-fallback', recipe }, 1)
      expect(pose.kind).toBe('play'); expect(pose.recipe).toBe(recipe)
      expect(pose.gesture).toBeTruthy()
    }
  })
})

it('reserves a visible meeting pair clear of other occupied places', () => {
  const choose = (walks as any).chooseIdlePlaces
  expect(choose).toBeTypeOf('function')
  const places = [p(40, 40), p(240, 40)], occupied = [{ x: 128, y: 32, width: 16, height: 16 }], body = { x: -16, y: -16, width: 32, height: 32 }
  expect(choose(places, occupied, () => true, [body, body])).toEqual([p(240, 40), p(336, 40)])
  expect(choose(places, [...occupied, { x: 232, y: 32, width: 16, height: 16 }], () => true, [body, body])).toEqual([])
  expect(choose(places, [], (point: Point) => point.x < 200, [body, body])).toEqual([p(40, 40), p(136, 40)])
  expect(choose(places, [], () => false, [body, body])).toEqual([])
})

it('runs at most one contact route when the map selects the safe cap', () => {
  const clock = new Clock(), pending: ((route: geometry.Route | null) => void)[] = []
  const contact = new walks.ContactWalks(clock, () => true, (_from, _to, done) => pending.push(done), () => {}, () => true, () => {}, 1)
  contact.setEnabled(true)
  contact.accept({ sequence: 1, receivedAt: 0, withdrawn: [], messages: Array.from({ length: 4 }, (_, i) => ({ id: `invented-message-${i}`, at: 'invented', project: 'invented', from: { kind: 'agent', id: `from-${i}` }, to: [{ kind: 'agent', id: `to-${i}` }] })) })
  expect(contact.snapshot().active).toBe(1); expect(contact.snapshot().queued).toBe(3); expect(pending).toHaveLength(1)
  const route = [p(0, 0), p(80, 0)]
  pending.shift()!({ status: 'found', points: route })
  const length = Math.hypot(route[1]!.x - route[0]!.x, route[1]!.y - route[0]!.y)
  const duration = length / (walks.WALK_PIXELS_PER_SECOND * walks.DEFAULT_MOLE_SCALE) * 1000
  clock.advance(duration - 1)
  expect(contact.snapshot().points).toHaveLength(1)
  expect(pending).toHaveLength(0)
  clock.advance(2)
  expect(contact.snapshot().points).toHaveLength(0)
  expect(pending).toHaveLength(1)
  contact.dispose()
})

it('does not teleport a participant home when the second route is refused', () => {
  const IdleMotion = (walks as any).IdleMotion
  expect(IdleMotion).toBeTypeOf('function')
  const clock = new Clock(), requests: { id: string; target: Point; start: Point; done: (route: geometry.Route | null) => void }[] = [], frames: any[][] = []
  const motion = new IdleMotion(clock, (id: string, target: Point, done: (route: geometry.Route | null) => void, start: Point) => requests.push({ id, target, done, start }), (actors: any[]) => frames.push(actors))
  motion.update({ enabled: true, agents: [{ id: 'one', foot: p(20, 20), idle: true }, { id: 'two', foot: p(180, 20), idle: true }], places: [p(80, 100), p(120, 100)] })
  const first = requests.shift()!
  first.done({ status: 'found', points: [first.start, first.target] }); clock.advance(2000)
  const second = requests.shift()!
  expect(second.id).toBe('two'); second.done({ status: 'no-path', points: [] })
  const back = requests.shift()!
  expect(back.id).toBe('one'); expect(back.start).toEqual(p(80, 100)); expect(back.target).toEqual(p(20, 20))
  expect(frames.at(-1)!.find(actor => actor.id === 'one').point).toEqual(p(80, 100))
  back.done({ status: 'found', points: [back.start, back.target] }); clock.advance(2000)
  expect(motion.snapshot().active).toBe(0)
  motion.dispose()
})

it('moves the shared paper between partners and back on a visible arc', () => {
  const exchange = (mole as any).paperExchange
  expect(exchange).toBeTypeOf('function')
  expect(exchange(0)).toEqual({ x: 24, y: -34 })
  expect(exchange(600).x).toBeCloseTo(48); expect(exchange(600).y).toBeCloseTo(-50)
  expect(exchange(1200).x).toBeCloseTo(72); expect(exchange(1200).y).toBeCloseTo(-34)
  expect(exchange(1800).x).toBeCloseTo(48); expect(exchange(2400)).toEqual(exchange(0))
})

it('bounds every native gait and gesture in either facing at the displayed scale', () => {
  const boundsFor = (geometry as any).visualBodyBounds
  expect(boundsFor).toBeTypeOf('function')
  for (const look of standingLooks) {
    const bounds = boundsFor(look, .92)
    for (const name of [`stand-${look}`, `walk-${look}-A`, `walk-${look}-pass`, `walk-${look}-B`, `wave-${look}`, `cheer-${look}`, `carry-${look}`]) {
      const frame = (catalog.sprites as any)[name], [x, y] = frame.trim, [, , width, height] = frame.rect, [ax, ay] = frame.anchor
      for (const facing of [-1, 1]) {
        const left = (facing === 1 ? x - ax : ax - x - width) * .92, top = (y - ay) * .92
        expect(bounds.x, name).toBeLessThanOrEqual(left)
        expect(bounds.y, name).toBeLessThanOrEqual(top)
        expect(bounds.x + bounds.width, name).toBeGreaterThanOrEqual(left + width * .92)
        expect(bounds.y + bounds.height, name).toBeGreaterThanOrEqual(top + height * .92)
      }
    }
  }
})

it('routes around occupied visible rectangles, including blocked endpoints and clear near misses', () => {
  const routeIdle = (geometry as any).routeIdle
  expect(routeIdle).toBeTypeOf('function')
  const map = { ...layout, obstacles: [] }, body = { x: 100, y: 60, width: 40, height: 40 }, mover = { x: -15, y: -30, width: 30, height: 30 }
  const overlap = (a: any, b: any) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  const route = routeIdle(map, p(20, 100), p(220, 100), [body], undefined, mover)
  expect(route.status).toBe('found')
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], steps = Math.max(1, Math.ceil(separation(a, b)))
    for (let n = 0; n <= steps; n++) {
      const q = p(a.x + (b.x - a.x) * n / steps, a.y + (b.y - a.y) * n / steps)
      expect(overlap({ ...mover, x: q.x + mover.x, y: q.y + mover.y }, body)).toBe(false)
    }
  }
  expect(routeIdle(map, p(20, 100), p(120, 90), [body], undefined, mover).status).not.toBe('found')
  expect(routeIdle(map, p(20, 40), p(220, 40), [body], undefined, mover).status).toBe('found')
})

it('does not reserve a meeting place whose visible bounds overlap a stationary body', () => {
  const choose = (walks as any).chooseIdlePlaces
  expect(choose).toBeTypeOf('function')
  const body = { x: -15, y: -30, width: 30, height: 30 }
  const occupied = [{ x: 90, y: 0, width: 60, height: 60 }]
  expect(choose([p(40, 40), p(240, 40)], occupied, () => true, [body, body])).toEqual([p(240, 40), p(336, 40)])
  expect(choose([p(40, 40)], [{ x: 90, y: -100, width: 60, height: 20 }], () => true, [body, body])).toEqual([p(40, 40), p(136, 40)])
})

it('refuses idle when coherent loaded facts are absent, stale or working, and keeps them while a refresh is pending', () => {
  const occupant = mapOffice({ ...people, agents: [agent('invented-coherence')] }, null).occupants[0]!
  expect(mole.idleEligible(occupant, true)).toBe(false)
  const facts = { people: { status: 'loaded', value: occupant.agent, error: null, revision: 4 }, work: { status: 'loaded', value: [], error: null, revision: 4 } }
  occupant.facts = facts as any
  expect(mole.idleEligible(occupant, true)).toBe(true)
  ;(facts.work as any).pending = true
  expect(mole.idleEligible(occupant, true)).toBe(true)
  ;(facts.work as any).pending = false
  facts.work.revision = 3
  expect(mole.idleEligible(occupant, true)).toBe(false)
  facts.work.revision = 4
  occupant.work = [workRow('invented-working', { executing: true })]
  expect(mole.idleEligible(occupant, true)).toBe(false)
})

it('refuses a route if the mover or a visible body has unknown bounds', () => {
  const routeIdle = (geometry as any).routeIdle
  const map = { ...layout, obstacles: [] }, start = p(20, 80), end = p(200, 80)
  expect(routeIdle(map, start, end, [], undefined, null).status).toBe('unavailable')
  expect(routeIdle(map, start, end, [null], undefined, { x: -10, y: -20, width: 20, height: 20 }).status).toBe('unavailable')
})

it('cleans up the capped scheduler with one thousand invented agents and a late route', () => {
  const clock = new Clock(), requests: ((route: geometry.Route | null) => void)[] = [], frames: any[][] = []
  const motion = new walks.IdleMotion(clock, (_id, _target, done) => requests.push(done), actors => frames.push(actors))
  const agents = Array.from({ length: 1000 }, (_, i) => ({ id: `invented-${i}`, foot: p(i * 100, 20), idle: true }))
  motion.update({ enabled: true, agents, places: [p(40, 200), p(136, 200)] })
  expect(motion.snapshot().active).toBeLessThanOrEqual(2)
  expect(requests).toHaveLength(1)
  motion.dispose()
  requests[0]!({ status: 'found', points: [agents[0]!.foot, p(40, 200)] })
  clock.advance(60000)
  expect(motion.snapshot().active).toBe(0)
  expect(clock.frames.size).toBe(0)
  expect(clock.timers.size).toBe(0)
  expect(frames.at(-1)).toEqual([])
})

it('does not cross the visible area of a desk above its narrow ground footprint', () => {
  const desk = { x: 95, y: 30, width: 60, height: 60, layer: 'object', sprite: 'invented-desk', group: null, depth: 90 }
  const map = { ...layout, pieces: [desk], obstacles: [{ x: 95, y: 80, width: 60, height: 10, kind: 'desk' }] }
  const mover = { x: -5, y: -10, width: 10, height: 10 }
  const route = (geometry as any).routeIdle(map, p(20, 50), p(220, 50), [], undefined, mover, [desk])
  expect(route.status).toBe('found')
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], steps = Math.max(1, Math.ceil(separation(a, b)))
    for (let n = 0; n <= steps; n++) {
      const q = p(a.x + (b.x - a.x) * n / steps, a.y + (b.y - a.y) * n / steps)
      expect(q.x + mover.x < desk.x + desk.width && q.x + mover.x + mover.width > desk.x && q.y + mover.y < desk.y + desk.height && q.y + mover.y + mover.height > desk.y).toBe(false)
    }
  }
})

it('does not treat a work row with unknown run standing as idle', () => {
  const occupant = mapOffice({ ...people, agents: [agent('invented-unknown-standing')] }, null).occupants[0]!
  occupant.facts = { people: { status: 'loaded', value: occupant.agent, error: null, revision: 1 }, work: { status: 'loaded', value: [], error: null, revision: 1 } } as any
  occupant.work = [workRow('invented-unknown', { executing: false, runStanding: null })]
  expect(mole.idleEligible(occupant, true)).toBe(false)
})

it('requires a known shared revision before inferring idle', () => {
  const occupant = mapOffice({ ...people, agents: [agent('invented-no-revision')] }, null).occupants[0]!
  occupant.facts = { people: { status: 'loaded', value: occupant.agent, error: null }, work: { status: 'loaded', value: [], error: null } } as any
  expect(mole.idleEligible(occupant, true)).toBe(false)
})

it('refuses a scene with visible furniture when its artwork bounds were not supplied', () => {
  const piece = { x: 90, y: 20, width: 40, height: 40, sprite: 'invented-desk', layer: 'object', depth: 60, group: null }
  const map = { ...layout, obstacles: [], pieces: [piece] }, mover = { x: -5, y: -10, width: 10, height: 10 }
  expect((geometry as any).routeIdle(map, p(20, 80), p(200, 80), [], undefined, mover).status).toBe('unavailable')
})
