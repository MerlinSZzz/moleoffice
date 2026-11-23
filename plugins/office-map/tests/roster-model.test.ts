// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mapOffice, OfficeModelCache, projectMatch, searchRoster, searchContacts, type Occupant } from '../src/model.ts'
import { readView } from '../src/read.ts'
import { screenAgents, SCREEN_MARGIN } from '../src/screen-selection.ts'
import type { Facts, AgentFacts } from '../src/contracts.ts'
import { words } from '../src/words.ts'
import { standingClothes } from '../src/appearance.ts'
import { occupantCard } from '../src/details.ts'
import type { BridgeSnapshot } from '../src/bridge.ts'
import { GeometryEngine } from '../src/worker-protocol.ts'
import { OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { VisibleIndex } from '../src/render-plan.ts'
import { actorRect } from '../src/layout-index.ts'
import type { Layout } from '../src/geometry.ts'
import type { Camera } from '../src/viewport.ts'
// @ts-expect-error Central generated adapter shared with browser executor.
import { screenFixture, rosterFrom } from './fixtures/screen-read-fixtures.mjs'
const loaded = <T>(value: T) => ({ status: 'loaded' as const, value, receivedAt: 1, error: null })
const factsFor = (fixture: ReturnType<typeof screenFixture>, ids: string[]): Facts => Object.fromEntries(ids.map(id => [id, {
  people: loaded(fixture.views.people.agents.find((one: { id: string }) => one.id === id)),
  work: loaded(fixture.views.work.work.filter((row: { agent: string }) => row.agent === id)),
}]))
const build = (size = 100) => { const fixture = screenFixture(size), roster = readView('roster', { ...fixture.views.roster, narrowedByPermission: fixture.views.people.narrowedByPermission })!; return { fixture, roster, model: mapOffice(roster, null) } }
afterEach(() => { releaseMapSurfaces(); vi.unstubAllGlobals() })

describe('roster owns every layout input', () => {
  it.each([100, 1000, 5000])('keeps rooms, grouping order and every seat identical to the same whole-people fixture (%i)', size => {
    const { fixture, roster, model } = build(size)
    const whole = mapOffice(fixture.views.people, fixture.views.work)
    for (const field of ['rooms', 'seats', 'layoutRoster', 'rosterOrder'] as const) expect(model[field]).toEqual(whole[field])
    const ids = fixture.views.roster.agents.slice(0, 3).map((row: { id: string }) => row.id)
    const facts = factsFor(fixture, ids)
    const partial = mapOffice(roster, null, null, facts)
    expect(partial.rooms).toEqual(whole.rooms); expect(partial.seats).toEqual(whole.seats)
    expect(partial.layoutRoster).toEqual(whole.layoutRoster)
    expect(partial.occupants[0]!.standing).toEqual(whole.occupants[0]!.standing)
    expect(partial.occupants[0]!.agent.scale).toEqual(whole.occupants[0]!.agent.scale)
    expect(partial.occupants.at(-1)!.facts?.people.status).toBe('unloaded')
  })
  it('keeps geometry, home seats and team signs identical and ignores stale heavy identity/group inputs', () => {
    const { fixture, roster, model } = build()
    const whole = mapOffice(fixture.views.people, fixture.views.work)
    const render = (input: typeof model) => new GeometryEngine(true).receive({ id: 1, kind: 'layout', input: { rooms: input.rooms, roster: input.layoutRoster } })
    expect(render(model)).toEqual(render(whole))
    const id = roster.agents[0]!.id, state = factsFor(fixture, [id])[id]!
    const facts: Facts = { [id]: { ...state, people: loaded({ ...fixture.views.people.agents[0], role: 'inspector', retired: true, startedBy: { kind: 'agent', id: 'unknown' }, createdAt: '2099', name: 'Old name' }) } }
    const updated = mapOffice(roster, null, null, facts)
    expect(updated.rooms).toEqual(model.rooms); expect(updated.layoutRoster).toEqual(model.layoutRoster)
    expect(updated.occupants[0]!.agent.name).toBe(roster.agents[0]!.name)
    const cache = new OfficeModelCache(), first = cache.read(roster, null, null, {})!
    const job = cache.build(roster, null, null, facts); job.next(); job.return(null)
    expect(cache.read(roster, null, null, {})).toBe(first)
    expect(cache.read(roster, null, null, facts)!.occupants[0]!.facts?.people.status).toBe('loaded')
  })
  it('searches the entire unloaded roster by name and handle, and never changes seats for a search or project', () => {
    const { model } = build(1000)
    const last = model.occupants.at(-1)!
    expect(searchRoster(model.occupants, last.agent.handle.toUpperCase()).map(one => one.key)).toContain(last.key)
    expect(searchRoster(model.occupants, last.agent.name).map(one => one.key)).toContain(last.key)
    expect(last.facts?.people.status).toBe('unloaded')
    const person = model.people.at(-1)!
    expect(searchContacts(model.people, person.handle.toUpperCase())).toEqual([person])
    expect(searchContacts(model.people, person.name)).toContain(person)
    const seats = structuredClone(model.seats)
    model.occupants.forEach(one => projectMatch(one, 'synthetic-project-0'))
    expect(model.seats).toEqual(seats)
  })
  it('uses member OR current work only when both facts are loaded; labels unknown in English and Chinese without declaring a match', () => {
    const { fixture, roster, model } = build(), original = model.occupants[0]!, id = original.agent.id
    expect(projectMatch(original, 'synthetic-project-0')).toBe('unknown')
    expect(projectMatch(original, null)).toBe('match')
    const state = factsFor(fixture, [id])[id]!
    const occupant = (facts: AgentFacts): Occupant => mapOffice(roster, null, null, { [id]: facts }).occupants[0]!
    expect(projectMatch(occupant(state), fixture.views.people.agents[0].projects[0])).toBe('match')
    const currentWork = { ...fixture.views.work.work[0], project: 'work-only-project' }
    expect(projectMatch(occupant({ ...state, work: loaded([currentWork]) }), 'work-only-project')).toBe('match')
    expect(projectMatch(occupant(state), 'historical-session-project')).toBe('other')
    expect(projectMatch(occupant({ ...state, work: { status: 'unloaded', error: null } }), 'synthetic-project-0')).toBe('unknown')
    expect(projectMatch(occupant({ ...state, work: { ...state.work, error: 'read' } }), 'synthetic-project-0')).toBe('unknown')
    expect(projectMatch(occupant({ ...state, people: { status: 'absent', receivedAt: 1, error: null } }), 'synthetic-project-0')).toBe('absent')
    expect(words.en.projectUnloaded.toLowerCase()).toContain('unknown'); expect(words.zh.projectUnloaded).toContain('未知')
    const visible = model.occupants.filter(one => projectMatch(one, 'any-project') !== 'other')
    expect(visible).toHaveLength(model.occupants.length)
  })
  it('asks drawn agents plus exactly the fixed margin; overview/no individuals asks none regardless of loaded facts', () => {
    const { model } = build(1000), keys = model.occupants.slice(0, 12).map(one => one.key)
    const selected = screenAgents(model, keys, true)
    expect(SCREEN_MARGIN).toBe(8); expect(selected).toHaveLength(keys.length + SCREEN_MARGIN)
    expect(new Set(selected).size).toBe(selected.length)
    expect(selected.slice(0, 12)).toEqual(model.occupants.slice(0, 12).map(one => one.agent.id))
    expect(selected.slice(12)).toEqual(model.rosterOrder.slice(12, 20))
    expect(screenAgents(model, keys, false)).toEqual([]); expect(screenAgents(model, [], true)).toEqual([])
    expect(screenAgents(model, model.occupants.map(one => one.key), true)).toHaveLength(model.occupants.length)
  })
})

class Node extends EventTarget {
  dataset: Record<string, string> = {}; style = {}; children: Node[] = []; textContent = ''; className = ''
  width = 800; height = 600; scrollLeft = 0; scrollTop = 0; clientWidth = 800; clientHeight = 600
  append(...nodes: Node[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: Node[]) { this.children = nodes }
  attributes: Record<string, string> = {}
  setAttribute(name: string, value: string) { this.attributes[name] = value }; remove() {}; querySelector() { return null }; querySelectorAll() { return [] }
  getContext() { return canvas }
}
const canvas = new Proxy({ measureText: (text: string) => ({ width: text.length * 6 }), getImageData: () => ({ data: new Uint8Array(4) }), createPattern: () => null }, {
  get(target, key) { return Reflect.get(target, key) ?? (() => {}) },
}) as unknown as CanvasRenderingContext2D
function documentStub() {
  vi.stubGlobal('document', { createElement: () => new Node(), createTextNode: (text: string) => Object.assign(new Node(), { textContent: text }) })
  vi.stubGlobal('window', { devicePixelRatio: 1 }); vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
}
const text = (node: Node): string => [node.textContent, ...node.children.map(text)].join(' ')
it('renders unloaded and absent cards honestly, then preserves the normal loaded card and appearance', () => {
  documentStub(); const { fixture, roster, model } = build(), id = model.occupants[0]!.agent.id
  const snapshot = { context: { language: 'en' }, views: { projects: { data: fixture.views.projects }, work: { data: null } } } as unknown as BridgeSnapshot
  expect(text(occupantCard(model.occupants[0]!, snapshot, null) as unknown as Node)).toContain(words.en.factsUnloaded)
  const states = factsFor(fixture, [id]), state = states[id]!
  const absent = mapOffice(roster, null, null, { [id]: { ...state, work: { status: 'absent', receivedAt: 2, error: null } } }).occupants[0]!
  const absentText = text(occupantCard(absent, snapshot, null) as unknown as Node)
  expect(absentText).toContain(words.en.agentAbsent); expect(absentText).not.toContain(words.en.noWork)
  const loadedCard = occupantCard(mapOffice(roster, null, null, states).occupants[0]!, snapshot, null) as unknown as Node
  expect(text(loadedCard)).toContain('Synthetic work'); expect(text(loadedCard)).toContain(words.en.standingLook)
  const emptyWork = mapOffice(roster, null, null, { [id]: { ...state, work: loaded([]) } }).occupants[0]!
  const emptyText = text(occupantCard(emptyWork, snapshot, null) as unknown as Node)
  expect(emptyText).toContain(words.en.noWork); expect(emptyText).not.toContain(words.en.workUnavailable)
})
it('the actual renderer emits zero selection for preview/village/district/low/aggregate views and emits individual candidates', () => {
  documentStub(); const { model } = build()
  const reply = new GeometryEngine(true).receive({ id: 1, kind: 'layout', input: { rooms: model.rooms, roster: model.layoutRoster } })
  if (reply?.kind !== 'layout') throw Error('Missing generated geometry')
  const layout = { ...reply.layout, pieces: [], planting: [], roadDrawing: [], houses: [] }
  const selections: string[][] = [], map = new OfficeMap(new Node() as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {}, ids => selections.push(ids))
  const first = Object.values(layout.seats)[0]!.foot
  const camera = { left: first.x - 1274, top: first.y - 897, width: 2548, height: 1794 }
  const inner = map as unknown as { paintSteps(camera: Camera): Generator<void>; setZoom(value: number): void; layout: Layout; zoom: number; seats: VisibleIndex<string>; individuals: boolean; canvas: Node }
  Object.assign(map, { layout, model, camera, zoom: 1, occupants: new Map(model.occupants.map(one => [one.key, one])) })
  inner.seats = new VisibleIndex(model.occupants.map(one => ({ value: one.key, rect: actorRect(layout.seats[one.key]!.foot) })))
  const paint = () => { const job = inner.paintSteps(camera); while (!job.next().done) {} }
  paint(); expect(selections.at(-1)!.length).toBeGreaterThan(0)
  inner.setZoom(.2); expect(selections.at(-1)).toEqual([])
  for (const zoom of [.2, .08, .02]) { inner.zoom = zoom; paint(); expect(selections.at(-1)).toEqual([]) }
  inner.layout = { ...layout, preview: true }; paint(); expect(selections.at(-1)).toEqual([])
  inner.layout = { ...layout, villages: [] }; inner.zoom = .2; paint(); expect(selections.at(-1)).toEqual([])
  inner.zoom = 1
  for (let i = 0; i < 161; i++) inner.layout.seats[String(i)] = { ...Object.values(layout.seats)[0]!, foot: { x: camera.left, y: camera.top } }
  inner.seats = new VisibleIndex(Array.from({ length: 161 }, (_, i) => ({ value: String(i), rect: { x: camera.left, y: camera.top, width: 1, height: 1 } })))
  paint(); expect(selections.at(-1)).toEqual([])
  map.dispose()
})

it('either view reporting notAgents removes the previously loaded actor and explicitly labels its nameplate and target without a project filter', () => {
  documentStub(); const { fixture, roster } = build(), id = roster.agents[0]!.id, state = factsFor(fixture, [id])[id]!
  const labels: string[] = [], begin = vi.fn()
  const drawing = { fillText: (value: string) => labels.push(value), fillRect: () => {}, beginPath: begin, roundRect: () => {}, fill: () => {}, stroke: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {}, measureText: (_value: string) => ({ width: 0 }) } as unknown as CanvasRenderingContext2D
  const nameplateDrawing = { ...drawing, beginPath: () => {} } as CanvasRenderingContext2D
  for (const view of ['people', 'work'] as const) {
    const model = mapOffice(roster, null, null, { [id]: { ...state, [view]: { status: 'absent', receivedAt: 2, error: null } } })
    const person = model.occupants[0]!, key = person.key, foot = { x: 100, y: 100 }
    expect(projectMatch(person, null)).toBe('absent')
    const map = new OfficeMap(new Node() as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {})
    Object.assign(map, { occupants: new Map([[key, person]]), model, individuals: true, layout: { bounds: { x: 0, y: 0, width: 800, height: 600 }, seats: { [key]: { foot } } } })
    const inner = map as unknown as { actor(ctx: CanvasRenderingContext2D, key: string, point: object): void; nameplate(ctx: CanvasRenderingContext2D, key: string, rect: object): void; targetSteps(keys: string[]): Generator<void>; targets: Node }
    inner.actor(drawing, key, foot); expect(begin).not.toHaveBeenCalled()
    labels.length = 0; inner.nameplate(nameplateDrawing, key, { x: 0, y: 0, width: 180, height: 40 })
    expect(labels).toContain(words.en.agentAbsent)
    const targets = inner.targetSteps([key]); while (!targets.next().done) {}
    expect(inner.targets.children[0]!.attributes['aria-label']).toContain(words.en.agentAbsent)
    map.dispose()
  }
})

it('reads an original-clothing walker from an offscreen seat when motion changes under an unchanged static camera', () => {
  documentStub(); const { model } = build(), stationary = model.occupants[0]!, walker = model.occupants.slice(50).find(one => !standingClothes(one.standing))!
  expect(standingClothes(walker.standing)).toBe(0)
  const selections: string[][] = [], map = new OfficeMap(new Node() as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {}, ids => selections.push(ids))
  const camera = { left: 0, top: 0, width: 800, height: 600 }
  const layout = { key: 'fixed-walker-camera', bounds: { x: 0, y: 0, width: 10000, height: 10000 }, seats: {
    [stationary.key]: { foot: { x: 100, y: 100 } }, [walker.key]: { foot: { x: 9000, y: 9000 } },
  } } as unknown as Layout
  Object.assign(map, { layout, model, camera, zoom: 1, individuals: true, signature: 'static-camera-unchanged', options: { still: false }, occupants: new Map(model.occupants.map(one => [one.key, one])) })
  const inner = map as unknown as { selectFacts(keys: string[]): void; actors(keys: string[]): { key: string }[]; dynamic(regions: object[]): void; individuals: boolean; signature: string; layout: Layout; options: { still: boolean } }
  // Only raster work is replaced; real animate(), drawing actors() and selection all execute.
  vi.spyOn(inner, 'dynamic').mockImplementation(() => {})
  inner.selectFacts([stationary.key]); expect(selections.at(-1)).not.toContain(walker.agent.id)
  const moving = { from: walker.key, to: stationary.key, point: { x: 120, y: 120 } } as unknown as Parameters<OfficeMap['animate']>[0][number]
  map.animate([moving])
  expect(inner.actors([stationary.key]).map(actor => actor.key)).toContain(walker.key)
  expect(selections.at(-1)).toContain(walker.agent.id)
  expect(selections.at(-1)).toHaveLength(2 + SCREEN_MARGIN)
  expect(inner.signature).toBe('static-camera-unchanged')
  const stable = selections.length; map.animate([{ ...moving, point: { x: 140, y: 140 } }])
  expect(selections).toHaveLength(stable)
  inner.individuals = false; map.animate([moving]); expect(selections.at(-1)).toEqual([])
  inner.individuals = true; inner.layout = { ...layout, preview: true }; map.animate([moving]); expect(selections.at(-1)).toEqual([])
  inner.layout = layout; inner.options.still = true; map.animate([moving])
  expect(selections.at(-1)).not.toContain(walker.agent.id)
  map.dispose()
  expect(map).toMatchObject({ bufferedSeats: [], selectionLayout: null, selectionSignature: '' })
})

it('keeps whole-people search results for active unloaded/offscreen agents and people, excluding retired names and handles', () => {
  const fixture = screenFixture(1000), retired = fixture.views.people.agents[10]
  retired.retired = true; retired.name = 'Retired hidden citizen'; retired.handle = 'retired-hidden-exact'
  const roster = readView('roster', { ...rosterFrom(fixture.views.people), narrowedByPermission: fixture.views.people.narrowedByPermission })!
  const first = roster.agents.slice(0, 3).map(agent => agent.id)
  const partial = mapOffice(roster, null, null, factsFor(fixture, first))
  const old = mapOffice(fixture.views.people, fixture.views.work), offscreen = roster.agents.at(-1)!, person = roster.people.at(-1)!
  const queries = ['', retired.name, retired.handle, offscreen.name.toUpperCase(), offscreen.handle, person.name, person.handle.toUpperCase(), 'absent-name-exact']
  for (const query of queries) {
    const needle = query.toLocaleLowerCase()
    // The previous page's whole-people search rule is the independent oracle.
    const expected = fixture.views.people.agents.filter((agent: { retired: boolean; name: string; handle: string }) => !agent.retired && `${agent.name} ${agent.handle}`.toLocaleLowerCase().includes(needle)).map((agent: { id: string }) => JSON.stringify(['agent', agent.id]))
    expect(searchRoster(partial.occupants, query).map(one => one.key)).toEqual(expected)
    expect(searchRoster(old.occupants, query).map(one => one.key)).toEqual(expected)
    const contacts = fixture.views.people.people.filter((one: { name: string; handle: string }) => `${one.name} ${one.handle}`.toLocaleLowerCase().includes(needle))
    expect(searchContacts(partial.people, query)).toEqual(contacts)
    expect(searchContacts(old.people, query)).toEqual(contacts)
  }
  expect(searchRoster(partial.occupants, retired.name)).toEqual([])
  expect(searchRoster(partial.occupants, retired.handle)).toEqual([])
  expect(searchRoster(partial.occupants, offscreen.handle)[0]!.facts?.people.status).toBe('unloaded')
  expect(searchContacts(partial.people, person.handle)).toEqual([person])
})
