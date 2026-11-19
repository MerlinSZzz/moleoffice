// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { LayoutCache, pointIsClear, routeBetween, type Layout } from '../src/geometry.ts'
import { GeometryEngine } from '../src/worker-protocol.ts'
import { OfficeModelCache, inProject, mapOffice, identity } from '../src/model.ts'
import { bitmapSize, cameraFor, overlapsCamera } from '../src/viewport.ts'
import { boundsOf } from '../src/village.ts'
import { agent, people, projects, work, workRow } from './fixtures.ts'

const input = { rooms: [{ id: 'team', occupants: ['a', 'b'] }, { id: 'other', occupants: ['c'] }] }

describe('current-roster geometry', () => {
  it('adds and removes people without preserving seat history, and recomputes only affected room templates', () => {
    const cache = new LayoutCache()
    const first = cache.layout(input)
    expect(cache.roomComputations).toBe(2)
    const added = { rooms: [{ id: 'team', occupants: ['a', 'b', 'd'] }, input.rooms[1]!] }
    const second = cache.layout(added)
    expect(Object.keys(second.seats)).toEqual(['a', 'b', 'd', 'c'])
    expect(cache.roomComputations).toBe(3)
    expect(cache.layout(structuredClone(added))).toBe(second)
    expect(cache.computations).toBe(2)
    const removed = cache.layout({ rooms: [{ id: 'team', occupants: ['b'] }, input.rooms[1]!] })
    expect(removed.seats['a']).toBeUndefined()
    expect(removed.seats['b']!.index).toBe(0)
    expect(removed.seats['b']!.foot).not.toEqual(first.seats['b']!.foot)
    expect(cache.roomComputations).toBe(4)
    expect(new LayoutCache().layout(input)).toEqual(first)
  })
  it('keeps seats on project regrouping and exposes membership separately from work projects', () => {
    const original = mapOffice(people, work, projects)
    const changedPeople = structuredClone(people)
    changedPeople.agents[0]!.projects = ['library', 'unpublished']
    const changed = mapOffice(changedPeople, work, projects)
    expect(changed.seats).toEqual(original.seats)
    expect(new LayoutCache().layout({ rooms: changed.rooms })).toEqual(new LayoutCache().layout({ rooms: original.rooms }))
    const occupant = changed.occupants.find(one => one.agent.id === 'same')!
    expect(occupant.projects).toEqual([{ id: 'library', name: 'Library' }, { id: 'unpublished', name: null }])
    expect(occupant.work).toEqual(work.work)
    expect(inProject(occupant, 'garden')).toBe(true)
    expect(inProject(occupant, 'unpublished')).toBe(true)
  })
  it('regroups recorded starters, and sorts equal-age identities without locale or input-order dependence', () => {
    const source = { ...people, agents: [agent('z'), agent('a'), agent('supervisor', { role: 'supervisor' })] }
    const first = mapOffice(source, null)
    expect(first.occupants.map(one => one.agent.id)).toEqual(['a', 'supervisor', 'z'])
    expect(mapOffice({ ...source, agents: [...source.agents].reverse() }, null)).toEqual(first)
    const moved = mapOffice({ ...source, agents: source.agents.map(one => one.id === 'a' ? { ...one, startedBy: { kind: 'agent' as const, id: 'supervisor' } } : one) }, null)
    expect(moved.seats[identity('agent', 'a')]!.room).not.toBe(first.seats[identity('agent', 'a')]!.room)
  })
  it('keeps unknown work unmatched, and does no new join for equal read payloads', () => {
    const cache = new OfficeModelCache()
    const first = cache.read(people, work, projects)
    expect(cache.read(structuredClone(people), structuredClone(work), structuredClone(projects))).toBe(first)
    expect(cache.computations).toBe(1)
    const unknown = workRow('unknown', { agent: 'missing', project: 'unpublished', title: 'A message mentions Agent same' })
    const changed = cache.read(people, { ...work, work: [...work.work, unknown] }, projects)!
    expect(changed.unmatchedWorkRows).toEqual([unknown])
    expect(changed.occupants.find(one => one.agent.id === 'same')!.work).toEqual(work.work)
    expect(cache.read(null, work, projects)).toBeNull()
    expect(cache.read(people, work, projects)).not.toBe(first)
  })
  it('invalidates a nested work fact and a removed fact, while accepting reordered object keys', () => {
    const cache = new OfficeModelCache(), source = structuredClone(work)
    source.work[0]!.recordedState = { count: 1, facts: ['a', { value: 'before' }] }
    const first = cache.read(people, source, projects), reordered = structuredClone(source)
    reordered.work[0]!.recordedState = { facts: ['a', { value: 'before' }], count: 1 }
    expect(cache.read(people, reordered, projects)).toBe(first)
    const changed = structuredClone(reordered)
    changed.work[0]!.recordedState = { facts: ['a', { value: 'after' }], count: 1 }
    const second = cache.read(people, changed, projects)
    expect(second).not.toBe(first)
    const removed = structuredClone(changed)
    removed.work[0]!.recordedState = { facts: ['a', { value: 'after' }] }
    expect(cache.read(people, removed, projects)).not.toBe(second)
  })
  it('finds scenery bounds beyond the browser argument limit without a spread-call crash', () => {
    const points = Array.from({ length: 200000 }, (_, i) => ({ x: i - 100000, y: 50000 - i }))
    expect(boundsOf(points)).toEqual({ x: -100000, y: -149999, width: 199999, height: 199999 })
  })
  it('rejects duplicate identities, including an identity in two rooms', () => {
    expect(() => new LayoutCache().layout({ rooms: [{ id: 'a', occupants: ['same'] }, { id: 'b', occupants: ['same'] }] })).toThrow('duplicate')
    expect(new LayoutCache().layout({ rooms: [] }).seats).toEqual({})
  })
})

describe('ported routes and their limits', () => {
  const layout = new LayoutCache().layout(input)
  it('frees the sender AND recipient stools, and ends exactly at the talk point', () => {
    expect(pointIsClear(layout, layout.seats['b']!.talk)).toBe(false)
    expect(pointIsClear(layout, layout.seats['b']!.talk, ['a'])).toBe(false)
    expect(pointIsClear(layout, layout.seats['b']!.talk, ['a', 'b'])).toBe(true)
    const route = routeBetween(layout, 'a', 'b')
    expect(route.status).toBe('found')
    expect(route.points[0]).toEqual(layout.seats['a']!.foot)
    expect(route.points.at(-1)).toEqual(layout.seats['b']!.talk)
    expect(route.points.every(point => pointIsClear(layout, point, ['a', 'b']))).toBe(true)
    expect(routeBetween(layout, 'a', 'c').status).toBe('found')
  })
  it('reports exhaustion separately from an empty search frontier', () => {
    expect(routeBetween(layout, 'a', 'b', 1)).toEqual({ status: 'exhausted', points: [] })
    const at = layout.seats['a']!.foot
    const sealed: Layout = { ...layout, obstacles: [...layout.obstacles,
      { kind: 'wall', x: at.x - 48, y: at.y - 48, width: 96, height: 8 },
      { kind: 'wall', x: at.x - 48, y: at.y + 40, width: 96, height: 8 },
      { kind: 'wall', x: at.x - 48, y: at.y - 48, width: 8, height: 96 },
      { kind: 'wall', x: at.x + 40, y: at.y - 48, width: 8, height: 96 }] }
    expect(routeBetween(sealed, 'a', 'b')).toEqual({ status: 'no-path', points: [] })
    expect(routeBetween(layout, 'a', 'missing')).toEqual({ status: 'unavailable', points: [] })
  })
  it('keeps routes within the latest geometry and a bounded cache', () => {
    const engine = new GeometryEngine()
    const reply = engine.receive({ id: 1, kind: 'layout', input })!
    if (reply.kind !== 'layout') throw Error('Expected layout')
    const request = { id: 2, kind: 'route' as const, layoutKey: reply.layout.key, from: 'a', to: 'b' }
    const first = engine.receive(request)
    expect(engine.receive({ ...request, id: 3 })).toMatchObject({ kind: 'route', route: first?.kind === 'route' ? first.route : null })
    expect(engine.routeComputations).toBe(1)
    expect(engine.receive({ ...request, id: 2 })).toBeNull()
    engine.receive({ id: 4, kind: 'layout', input: { rooms: [{ id: 'new', occupants: ['c'] }] } })
    expect(engine.receive({ ...request, id: 5 })).toMatchObject({ route: { status: 'unavailable' } })
  })
})

describe('ported stepped viewport', () => {
  it('keeps fractional scroll steps covered and clamps at the world edges', () => {
    const bounds = { x: -64, y: -32, width: 3200, height: 2400 }
    const view = { scrollLeft: 128.4, scrollTop: 260, clientWidth: 390, clientHeight: 440 }
    const camera = cameraFor(bounds, view, 2)
    expect(camera.left).toBe(-64)
    expect(camera.top).toBe(32)
    expect(camera.left + camera.width).toBeGreaterThanOrEqual(bounds.x + (view.scrollLeft + view.clientWidth) / 2)
    expect(cameraFor(bounds, { ...view, scrollLeft: 220, scrollTop: 300 }, 2)).toEqual(camera)
    expect(overlapsCamera({ x: camera.left - 10, y: camera.top, width: 20, height: 20 }, camera)).toBe(true)
    const edge = cameraFor(bounds, { ...view, scrollLeft: 6000, scrollTop: 4500 }, 2)
    expect(edge.left + edge.width).toBe(bounds.x + bounds.width)
    expect(edge.top + edge.height).toBe(bounds.y + bounds.height)
  })
  it('does not grow the bitmap from floating-point noise, at either DPR', () => {
    for (const dpr of [1, 2]) expect(bitmapSize({ left: 0, top: 0, width: 100 + 1e-8, height: 80 }, 1, dpr)).toEqual({ width: 100 * dpr, height: 80 * dpr })
  })
})

describe('cancellable model builds', () => {
  const large = () => ({ ...people, agents: Array.from({ length: 5000 }, (_, i) => agent(`person-${String(4999 - i).padStart(4, '0')}`)) })
  it('yields through a large join and stable ordering before publishing exact seats and work', () => {
    const cache = new OfficeModelCache(), source = large(), rows = { ...work, work: [workRow('first', { agent: 'person-0000' }), workRow('second', { agent: 'person-0000' }), workRow('outside', { agent: 'absent' })] }
    const job = cache.build(source, rows, projects)
    let next = job.next(), steps = 0
    while (!next.done) { expect(cache.computations).toBe(0); steps++; next = job.next() }
    expect(steps).toBeGreaterThan(5000)
    expect(cache.computations).toBe(1)
    const model = next.value!
    expect(model.occupants.map(one => one.agent.id)).toEqual(Array.from({ length: 5000 }, (_, i) => `person-${String(i).padStart(4, '0')}`))
    expect(model.occupants[0]!.work.map(row => row.id)).toEqual(['first', 'second'])
    expect(model.unmatchedWorkRows.map(row => row.id)).toEqual(['outside'])
    expect(model.rooms).toHaveLength(1)
    expect(model.seats[identity('agent', 'person-4999')]).toEqual({ room: model.rooms[0]!.id, index: 4999 })
  })
  it('yields through equal refresh comparison and reuses the model without another join', () => {
    const cache = new OfficeModelCache(), source = large(), first = cache.read(source, work, projects)
    const job = cache.build(structuredClone(source), structuredClone(work), structuredClone(projects))
    let next = job.next(), steps = 0
    while (!next.done) { steps++; next = job.next() }
    expect(steps).toBeGreaterThan(100)
    expect(next.value).toBe(first); expect(cache.computations).toBe(1)
  })
  it('keeps the previous cache atomic on cancellation and returns to an empty cache on close', () => {
    const cache = new OfficeModelCache(), first = cache.read(people, work, projects), job = cache.build(large(), work, projects)
    expect(job.next().done).toBe(false)
    job.return(null)
    expect(cache).toMatchObject({ inputs: [people, work, projects, undefined], model: first, computations: 1 })
    cache.clear()
    expect(cache).toMatchObject({ inputs: null, model: null, computations: 1 })
  })
})
