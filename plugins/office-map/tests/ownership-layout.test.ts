// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { mapOffice, roomWords } from '../src/model.ts'
import { portraitOf, standingOf } from '../src/appearance.ts'
import { OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { actorRect, layoutIndexes } from '../src/layout-index.ts'
import { shownOnMap } from '../src/ownership.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import type { FacilityStation } from '../src/ownership-facilities.ts'
import { GeometryRuntime } from '../src/geometry-runtime.ts'
import { GeometryEngine } from '../src/worker-protocol.ts'
import { pointIsClear, routeBetween, type Layout } from '../src/geometry.ts'
import { drawSprite } from '../src/pack.ts'
import type { ArtPack } from '../src/pack.ts'

const identity = (id: string) => JSON.stringify(['agent', id])
const made = '2026-11-17 23:59:59'
export function generatedOwnership() {
  const agents = [
    ...Array.from({ length: 5 }, (_, i) => agent(`s${i}`, { role: 'secretary', startedBy: null })),
    ...Array.from({ length: 28 }, (_, i) => agent(`p${i}`, { role: 'supervisor', startedBy: { kind: 'agent', id: `s${i % 5}` } })),
    ...Array.from({ length: 216 }, (_, i) => agent(`direct-${i}`, { startedBy: { kind: 'agent', id: 's0' } })),
    ...Array.from({ length: 97 }, (_, i) => agent(`team-${i}`, { startedBy: { kind: 'agent', id: 'p0' } })),
    agent('inspector', { role: 'inspector' }), agent('no-role', { role: null }),
    agent('missing-link', { startedBy: { kind: 'agent', id: 'not-returned' } }),
    agent('cycle-a', { startedBy: { kind: 'agent', id: 'cycle-b' } }),
    agent('cycle-b', { startedBy: { kind: 'agent', id: 'cycle-a' } }),
    agent('retired', { retired: true, startedBy: { kind: 'agent', id: 'p0' } }),
  ]
  return { ...people, view: 'roster', agents: agents.map(({ kind, id, handle, name, role, retired, visitor, startedBy, createdAt }) =>
    ({ kind, id, handle, name, role, retired, visitor, startedBy, createdAt })) } as RosterView
}

it('puts five secretary desks in one room and keeps direct workers and every supervisor team distinct', () => {
  const model = mapOffice(generatedOwnership(), null), roster = model.layoutRoster, ownership = roster.ownership!
  expect(ownership.secretaries).toHaveLength(5)
  const room = (kind: string, leader: string | null = null) => ownership.groups.find(g => g.kind === kind && g.leader === leader)!
  const members = (id: string) => roster.people.filter(p => p.group === id).map(p => p.id)
  expect(members(room('secretariat').id)).toEqual(Array.from({ length: 5 }, (_, i) => identity(`s${i}`)))
  expect(ownership.groups.filter(g => g.kind === 'supervisor')).toHaveLength(28)
  expect(members(room('direct', 's0').id)).toHaveLength(216)
  expect(room('direct', 's0').label).toContain('Secretary-direct')
  expect(room('supervisor', 'p0').owner).toBe('s0')
  expect(members(room('supervisor', 'p0').id)).toHaveLength(99) // leader, 97 workers and reserved retired row
  expect(room('inspector').owner).toBeNull(); expect(room('unassigned').label).toBe('Role not stated')
  for (const id of ['missing-link', 'cycle-a', 'cycle-b']) {
    const assigned = ownership.groups.find(g => g.id === roster.people.find(p => p.id === identity(id))!.group)!
    expect(assigned.owner).toBeNull(); expect(assigned.label).toBe('Ownership unknown')
  }
  expect(model.occupants.some(a => a.agent.retired)).toBe(false)
  expect(roster.people.find(p => p.id === identity('retired'))?.retired).toBe(true)
  expect(model.rooms.every(r => !!roomWords(r, 'en') && !!roomWords(r, 'zh'))).toBe(true)
  expect(mapOffice({ ...generatedOwnership(), agents: generatedOwnership().agents.reverse() }, null).layoutRoster).toEqual(roster)
})

it('the single online seam shows every non-retired roster identity regardless of absent heavy facts', () => {
  expect(shownOnMap({ retired: false })).toBe(true); expect(shownOnMap({ retired: true })).toBe(false)
  const model = mapOffice(generatedOwnership(), null), occupant = model.occupants[0]!, id = occupant.agent.id
  const absent = mapOffice(generatedOwnership(), null, null, { [id]: { people: { status: 'absent', error: null, receivedAt: 1 }, work: { status: 'absent', error: null, receivedAt: 1 } } })
  expect(absent.layoutRoster).toEqual(model.layoutRoster)
  expect(absent.occupants.map(a => a.key)).toEqual(model.occupants.map(a => a.key))
})

it('the actual distant actor uses identity fallback even with saved appearance or absent facts', () => {
  const model = mapOffice(generatedOwnership(), null), occupant = model.occupants[0]!, key = occupant.key
  const fake = { occupants: new Map([[key, occupant]]), drawnScale: OfficeMap.prototype.drawnScale, layout: { ownership: true, seats: {} }, individuals: false,
    options: { still: true, wave: null, workAvailable: false }, pack: null }
  // No pack takes the explicit outline path; the sprite path is captured by a
  // pack with this identity's one expected frame and no alternative saved look.
  const fallback = standingOf(portraitOf(null), key, made), calls: unknown[][] = []
  const pack = { sources: { sprites: { [`stand-${fallback.look}`]: { atlas: 'generated', rect: [0, 0, 100, 150], trim: [0, 0], anchor: [50, 150] } } }, images: new Map([['generated', {}]]) }
  const ctx = new Proxy({ drawImage: (...args: unknown[]) => calls.push(args) }, { get: (a, k) => Reflect.get(a, k) ?? (() => {}) })
  ;(OfficeMap.prototype as any).actor.call({ ...fake, pack }, ctx, key, { x: 50, y: 150 })
  expect(calls).toHaveLength(1)
  occupant.agent.retired = true
  ;(OfficeMap.prototype as any).actor.call({ ...fake, pack }, ctx, key, { x: 50, y: 150 })
  expect(calls).toHaveLength(1)
})

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const layoutFor = (roster = generatedOwnership()): Layout => {
  const model = mapOffice(roster, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
it('packs five physical ownership areas, one continuous long-tail hall, all team seats and separate honest independent rooms', () => {
  const layout = layoutFor(), model = mapOffice(generatedOwnership(), null)
  expect(layout.ownership).toBe(true)
  expect(layout.villages!.filter(v => v.owner != null)).toHaveLength(5)
  expect(Object.keys(layout.seats).sort()).toEqual(model.occupants.map(a => a.key).sort())
  const homes = layout.houses, direct = homes.find(h => h.type === 'direct' && h.owner === 's0')!
  expect(direct.occupants).toHaveLength(216)
  expect(homes.filter(h => h.type === 'supervisor')).toHaveLength(28)
  expect(homes.filter(h => h.type === 'secretariat')).toHaveLength(1)
  const secretariat = homes.find(h => h.type === 'secretariat')!
  expect(secretariat.x + secretariat.width / 2).toBe(layout.bounds.width / 2)
  expect(layout.pieces.filter(p => p.sprite === 'worker-desk' && p.group === secretariat.group)).toHaveLength(5)
  for (const [index, a] of homes.entries()) {
    for (const b of homes.slice(index + 1)) expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false)
    for (const id of a.occupants) {
      const seat = layout.seats[id]!
      expect(seat.room).toBe(a.group)
      expect(seat.foot.x).toBeGreaterThanOrEqual(a.x + 48); expect(seat.foot.x).toBeLessThan(a.x + a.width - 48)
      expect(seat.foot.y).toBeGreaterThan(a.y + 78)
      if ((seat as FacilityStation).outdoors) {
        expect(seat.foot.y).toBeGreaterThan(a.y + a.height); expect(seat.foot.y).toBeLessThan(a.y + a.height + 800)
        if ((seat as FacilityStation).activity === 'route') {
          expect(layout.paths!.some(path => path.slice(1).some((b, n) => {
            const a = path[n]!, dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((seat.foot.x - a.x) * dx + (seat.foot.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
            return Math.hypot(seat.foot.x - a.x - t * dx, seat.foot.y - a.y - t * dy) <= 160
          }))).toBe(true)
        } else expect(layout.pieces.some(p => p.group === null && ['tea-table', 'A29'].includes(p.sprite) && Math.hypot(p.x + p.width / 2 - seat.foot.x, p.y + p.height - seat.foot.y) < 400)).toBe(true)
      } else expect(seat.foot.y).toBeLessThan(a.y + a.height)
      expect(pointIsClear(layout, seat.foot, [id]), id).toBe(true)
    }
  }
  // Interior solids are prop bases, never full room-dividing partitions.
  expect(layout.obstacles.filter(o => o.kind === 'wall' && o.x > direct.x + 52 && o.x + o.width < direct.x + direct.width - 52 && o.y > direct.y + 84 && o.y < direct.y + direct.height - 16).every(o => o.width <= 144 && o.height <= 40)).toBe(true)
  expect(new Set(Object.values(layout.seats).map(s => `${s.foot.x},${s.foot.y}`)).size).toBe(model.occupants.length)
})

it('keeps internal identity order and retired reservations through reorder and heavy reads, while the legacy API matches production ownership geometry', () => {
  const source = generatedOwnership(), model = mapOffice(source, null), original = layoutFor(source)
  source.agents.find(a => a.id === 's0')!.retired = true
  source.agents.find(a => a.id === 'p0')!.retired = true
  const changed = mapOffice(source, null), after = layoutFor(source)
  expect(changed.layoutRoster.ownership!.secretaries.find(s => s.id === 's0')!.label).toContain('historical')
  expect(changed.layoutRoster.ownership!.groups.find(g => g.leader === 'p0')!.label).toContain('retired')
  for (const occupant of changed.occupants) expect(after.seats[occupant.key]).toEqual(original.seats[occupant.key])
  expect(after.seats[identity('s0')]).toBeUndefined(); expect(after.seats[identity('p0')]).toBeUndefined()
  expect(layoutFor({ ...source, agents: source.agents.reverse() })).toEqual(after)
  const input = { rooms: model.rooms, roster: model.layoutRoster }
  const legacy = new GeometryEngine(true).receive({ id: 1, kind: 'layout', input })
  const production = new GeometryRuntime(new OwnershipGeometryCache()).receive({ id: 1, kind: 'layout', input })
  expect(production).toEqual(legacy)
  const bad = new GeometryRuntime(new OwnershipGeometryCache()).receive({ id: 1, kind: 'layout', input: { rooms: [] } })
  expect(bad).toMatchObject({ kind: 'error', error: 'Ownership roster required' })
})

it('keeps a cyclic supervisor chain unknown instead of inventing secretary membership', () => {
  const source = generatedOwnership()
  source.agents.find(a => a.id === 'p0')!.startedBy = { kind: 'agent', id: 'p1' }
  source.agents.find(a => a.id === 'p1')!.startedBy = { kind: 'agent', id: 'p0' }
  const model = mapOffice(source, null)
  for (const id of ['p0', 'p1']) {
    expect(model.occupants.find(a => a.agent.id === id)!.relationshipUnavailable).toBe(true)
    const group = model.layoutRoster.ownership!.groups.find(g => g.leader === id)!
    expect(group.owner).toBeNull(); expect(group.label).toContain('Ownership unknown')
  }
  source.agents.find(a => a.id === 'p0')!.startedBy = { kind: 'agent', id: 's0' }
  source.agents.find(a => a.id === 's0')!.startedBy = { kind: 'agent', id: 'p0' }
  const throughSecretary = mapOffice(source, null).layoutRoster.ownership!.groups.find(g => g.leader === 'p0')!
  expect(throughSecretary.owner).toBeNull(); expect(throughSecretary.label).toContain('Ownership unknown')
})

it('routes through the continuous hall and across secretary areas without crossing solid desks or walls', () => {
  const layout = layoutFor()
  for (const [from, to] of [['direct-0', 'direct-215'], ['direct-0', 'team-96'], ['p0', 's0'], ['p0', 'p1']]) {
    const a = identity(from!), b = identity(to!), route = routeBetween(layout, a, b)
    expect(route.status, `${from} to ${to}`).toBe('found')
    expect(route.points[0]).toEqual(layout.seats[a]!.foot)
    expect(route.points.at(-1)).toEqual(layout.seats[b]!.talk)
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1]!, b = route.points[i]!, count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4))
      for (let n = 0; n <= count; n++) expect(pointIsClear(layout, { x: a.x + (b.x - a.x) * n / count, y: a.y + (b.y - a.y) * n / count }, [identity(from!), identity(to!)])).toBe(true)
    }
  }
}, 30000)

it('draws cropped native atlas pieces without stretching or sampling outside the source rectangle', () => {
  const calls: unknown[][] = [], ctx = { drawImage: (...args: unknown[]) => calls.push(args) } as unknown as CanvasRenderingContext2D
  const image = {}, pack = { sources: { sprites: { native: { atlas: 'generated', rect: [10, 20, 100, 80], trim: [20, 30], size: [200, 150], anchor: [100, 140] } } }, images: new Map([['generated', image]]) } as unknown as ArtPack
  expect(drawSprite(ctx, pack, 'native', 400, 500, 1, { x: 40, y: 50, width: 25, height: 35 })).toBe(true)
  expect(calls).toEqual([[image, 30, 40, 25, 35, 400, 500, 25, 35]])
})

class CanvasNode extends EventTarget {
  dataset = {}; style = {}; width = 1440; height = 990; clientWidth = 1440; clientHeight = 990
  scrollLeft = 0; scrollTop = 0; children: CanvasNode[] = []
  append(...nodes: CanvasNode[]) { this.children.push(...nodes) }; replaceChildren(...nodes: CanvasNode[]) { this.children = nodes }
  getContext() { return context }; setAttribute() {}; remove() {}; querySelector() { return null }; querySelectorAll() { return [] }
}
const context = new Proxy({ measureText: (s: string) => ({ width: s.length * 6 }), getImageData: () => ({ data: new Uint8Array(4) }), createPattern: () => null }, { get: (a, k) => Reflect.get(a, k) ?? (() => {}) })
afterEach(() => { releaseMapSurfaces(); vi.unstubAllGlobals() })

it('the actual whole-map and village renderer draws every non-retired identity and emits no heavy screen demand', () => {
  vi.stubGlobal('document', { createElement: () => new CanvasNode() }); vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  const source = generatedOwnership(), model = mapOffice(source, null), layout = layoutFor(source)
  const selections: string[][] = [], drawn: string[] = [], map = new OfficeMap(new CanvasNode() as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {}, ids => selections.push(ids))
  const inner = map as any, camera = { left: layout.bounds.x, top: layout.bounds.y, width: layout.bounds.width, height: layout.bounds.height }
  Object.assign(inner, { layout, model, camera, occupants: new Map(model.occupants.map(a => [a.key, a])), ...finish(layoutIndexes(layout)) })
  const actor = inner.actor
  inner.actor = function (ctx: CanvasRenderingContext2D, key: string, point: { x: number; y: number }) { drawn.push(key); actor.call(inner, ctx, key, point) }
  for (const zoom of [.025, .08]) {
    inner.zoom = zoom; drawn.length = 0
    finish(inner.paintSteps(camera))
    expect(drawn.sort()).toEqual(model.occupants.map(a => a.key).sort())
    expect(new Set(drawn).size).toBe(model.occupants.length)
    expect(selections.at(-1)).toEqual([])
    expect(inner.individuals).toBe(false)
  }
  map.dispose()
})

it('allows own desk contact while protecting other furniture and makes solid furniture block routes', () => {
  const layout = layoutFor(), overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  for (const home of layout.houses.filter(h => h.type !== 'secretariat' && h.occupants.length > 2)) {
    const furniture = layout.pieces.filter(p => p.group === home.group && ['worker-desk', 'bookshelf'].includes(p.sprite))
    expect(furniture.length).toBeGreaterThanOrEqual(2)
    for (const id of home.occupants) for (const piece of furniture) {
      const seat = layout.seats[id]!
      if (piece.sprite === 'worker-desk' && piece.x === seat.desk.x && piece.y === seat.desk.y) {
        expect(seat.foot.y).toBeGreaterThan(piece.y + piece.height); continue
      }
      expect(overlap({ x: seat.foot.x - 59, y: seat.foot.y - 120, width: 118, height: 122 }, piece), `${id} overlaps ${piece.sprite}`).toBe(false)
    }
    for (const piece of furniture) {
      expect(pointIsClear(layout, { x: piece.x + piece.width / 2, y: piece.y + piece.height - 4 })).toBe(false)
      expect(pointIsClear(layout, { x: piece.x + piece.width / 2, y: piece.y + piece.height * .72 + .1 })).toBe(false)
    }
  }
})

it('removes retired interaction targets while the old complete geometry is still retained', () => {
  vi.stubGlobal('document', { createElement: () => new CanvasNode() }); vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  const source = generatedOwnership(), old = layoutFor(source), retired = source.agents[0]!.id
  source.agents[0]!.retired = true
  const model = mapOffice(source, null), map = new OfficeMap(new CanvasNode() as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {})
  const inner = map as any
  Object.assign(inner, { layout: old, model, individuals: true, occupants: new Map(model.occupants.map(a => [a.key, a])) })
  finish(inner.targetSteps(Object.keys(old.seats)))
  expect(inner.targets.children.map((n: CanvasNode & { dataset: Record<string, string> }) => n.dataset.key)).not.toContain(identity(retired))
  expect(inner.targets.children).toHaveLength(model.occupants.length)
  map.dispose()
})

it('localizes retired secretary areas and supervisor rooms without translating proper names', () => {
  const source = generatedOwnership(), secretary = source.agents.find(a => a.id === 's0')!, supervisor = source.agents.find(a => a.id === 'p0')!
  secretary.name = 'Lin 林'; secretary.retired = true; supervisor.name = 'Lead 甲'; supervisor.retired = true
  const model = mapOffice(source, null), layout = layoutFor(source), area = layout.villages!.find(v => v.owner === secretary.id)!
  expect(area.label).toBe('Secretary area · Lin 林 (retired; historical ownership)')
  expect(area.zh).toBe('秘书区域 · Lin 林（已退役；历史归属）')
  const room = model.rooms.find(r => r.id === JSON.stringify(['supervisor', supervisor.id]))!
  expect(roomWords(room, 'en')).toBe('Lin 林 (retired; historical ownership) · Supervisor Lead 甲 (retired)')
  expect(roomWords(room, 'zh')).toBe('Lin 林（已退役；历史归属） · 主管 Lead 甲（已退役）')
  expect(layout.houses.find(h => h.group === room.id)!.zh).toBe(roomWords(room, 'zh'))
  const active = model.layoutRoster.ownership!.secretaries.find(s => s.id === 's1')!
  expect(active.label).toBe('Agent s1'); expect(active.zh).toBe('Agent s1')
})
