// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { populationLabel, populationLabelsSteps, type PopulationLabel } from '../src/population-labels.ts'
import { mapOffice, roomWords, type OfficeModel } from '../src/model.ts'
import { readView } from '../src/read.ts'
import { GeometryEngine } from '../src/worker-protocol.ts'
import { VILLAGE, villageOverview, type VillageOverview, type VillageRoster } from '../src/village-layout.ts'
import { cameraFor, type Camera, type Rect } from '../src/viewport.ts'
import type { Layout } from '../src/geometry.ts'
import { screenAgents } from '../src/screen-selection.ts'
// @ts-expect-error The unchanged generated adapter is shared with the browser executor.
import { screenFixture } from './fixtures/screen-read-fixtures.mjs'

type Block = VillageOverview['blocks'][number]
function drain<T>(work: Generator<void, T>): T { for (;;) { const next = work.next(); if (next.done) return next.value } }
const overlap = (a: Rect, b: Rect) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-7 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-7
const inside = (a: Rect, b: Rect) => a.x >= b.x - 1e-7 && a.y >= b.y - 1e-7 && a.x + a.width <= b.x + b.width + 1e-7 && a.y + a.height <= b.y + b.height + 1e-7
// Unequal glyph advances catch character-count estimates and digit-length assumptions.
const advance = (text: string, font: number) => [...text].reduce((sum, char) => sum + (char === '1' ? .42 : /[0-9]/.test(char) ? .64 : char === ' ' ? .28 : .57) * font, 0)
class Context {
  font = '11px system-ui'; fillStyle = ''; imageSmoothingEnabled = false
  boxes: Rect[] = []; text: { text: string; x: number; y: number; width: number; font: number }[] = []
  clears: Rect[] = []; copies: { image: Node; rect: number[]; clip: Rect | null }[] = []
  clipArea: Rect | null = null; path: Rect | null = null; stack: (Rect | null)[] = []
  measureText(text: string) { return { width: advance(text, parseFloat(this.font)) } }
  fillText(text: string, x: number, y: number) { this.text.push({ text, x, y, width: this.measureText(text).width, font: parseFloat(this.font) }) }
  fillRect(x: number, y: number, width: number, height: number) { if (['#fffdf5', '#25372b'].includes(this.fillStyle)) this.boxes.push({ x, y, width, height }) }
  clearRect(x: number, y: number, width: number, height: number) { this.clears.push({ x, y, width, height }) }
  drawImage(image: Node, ...rect: number[]) { this.copies.push({ image, rect, clip: this.clipArea && { ...this.clipArea } }) }
  save() { this.stack.push(this.clipArea) }
  restore() { this.clipArea = this.stack.pop() ?? null }
  beginPath() { this.path = null }
  rect(x: number, y: number, width: number, height: number) { this.path = { x, y, width, height } }
  clip() { this.clipArea = this.path }
  setTransform() {}; translate() {}; scale() {}; moveTo() {}; lineTo() {}; closePath() {}; fill() {}; strokeRect() {}
  getImageData() { return { data: new Uint8ClampedArray(4) } }
  createPattern() { return null }
}
class Node extends EventTarget {
  dataset: Record<string, string> = {}; style = {}; width = 1; height = 1; className = ''
  clientWidth = 362; clientHeight = 656; scrollLeft = 0; scrollTop = 0; children: Node[] = []
  attributes: Record<string, string> = {}; context = new Context()
  append(...nodes: Node[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: Node[]) { this.children = nodes }
  setAttribute(key: string, value: string) { this.attributes[key] = value }
  remove() {}; querySelector() { return null }; querySelectorAll() { return [] }
  getContext() { return this.context }
}
interface Inner {
  layout: Layout; zoom: number; camera: Camera; padding: { x: number; y: number }; villagePlan: VillageOverview
  populationLabels: Map<string, PopulationLabel>; background: Node; canvas: Node; frame: Node; targets: Node
  paint(): void; paintSteps(camera: Camera): Generator<void>; dynamicSteps(regions: Rect[]): Generator<void, boolean>
  bufferCamera(): Camera; placePopulationLabels(ctx: CanvasRenderingContext2D, blocks: Block[], homes?: boolean): Generator<void>
  blockLabel(ctx: CanvasRenderingContext2D, block: Block): void
}
let layout: Layout, model: OfficeModel, fixture: ReturnType<typeof screenFixture>
/** These exact Fit/label regressions exercise the legacy fixed-village epoch.
 * The coordinator's agreement before the commit keeps that epoch unchanged; ownership has separate tests.
 * Rebuild its original recorded zone/team input, without ownership metadata. */
function legacyVillageRoster(model: OfficeModel): VillageRoster {
  const groups = new Map<string, VillageRoster['groups'][number]>(), people: VillageRoster['people'][number][] = []
  const names = new Map(model.occupants.map(o => [o.agent.id, o.agent.name]))
  for (const o of model.occupants) {
    const id = JSON.stringify([o.zone, o.team])
    if (!groups.has(id)) groups.set(id, { id, createdAt: o.agent.createdAt, label: roomWords({ id, zone: o.zone, leader: o.team === null ? null : names.get(o.team) ?? null, occupants: [] }, 'en') })
    people.push({ id: o.key, group: id, createdAt: o.agent.createdAt, retired: o.agent.retired })
  }
  return { groups: [...groups.values()], people }
}
beforeAll(() => {
  fixture = screenFixture(5000)
  model = mapOffice(readView('roster', fixture.views.roster)!, null)
  const reply = new GeometryEngine(true).receive({ id: 1, kind: 'layout', input: { rooms: model.rooms, roster: legacyVillageRoster(model) } })
  if (reply?.kind !== 'layout') throw Error('Missing generated geometry')
  layout = reply.layout
})
afterEach(() => { releaseMapSurfaces(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

// Read-only stage1c metadata: outer 390/660, iframe height 1000. These are the
// actual map client sizes, not the outer window or backing bitmap dimensions.
const views = [{ outer: 390, width: 362, height: 656, minimum: .008357189029457937 },
  { outer: 660, width: 608, height: 656, minimum: .014036383784282944 }]
function setup(viewSize = views[0]!, language: 'en' | 'zh' = 'en', theme: 'light' | 'dark' = 'light') {
  vi.stubGlobal('document', { createElement: () => new Node() }); vi.stubGlobal('window', { devicePixelRatio: 2 })
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  const view = Object.assign(new Node(), { clientWidth: viewSize.width, clientHeight: viewSize.height }), selections: string[][] = []
  const map = new OfficeMap(view as unknown as HTMLElement, vi.fn(), vi.fn(), vi.fn(), vi.fn(), ids => selections.push(ids))
  const inner = map as unknown as Inner
  Object.assign(map, { layout, model, opening: false, options: { project: null, search: '', language, theme, selected: null, workAvailable: false, still: true, wave: null } })
  vi.spyOn(inner, 'paint').mockImplementation(() => {})
  map.fit()
  inner.camera = inner.bufferCamera()
  return { map, inner, view, selections }
}
function assertLabels(blocks: Block[], labels: Map<string, PopulationLabel>, zoom: number, word: string) {
  expect(labels.size).toBe(blocks.length)
  for (const block of blocks) {
    const label = labels.get(block.id)!
    expect([String(block.total), `${block.total} ${word}`]).toContain(label.population)
    expect(label.area.width * zoom + 1e-7).toBeGreaterThanOrEqual(advance(label.population, 11) + 8)
    expect(label.area.height * zoom).toBeCloseTo(32)
    expect(inside(label.area, layout.bounds)).toBe(true)
  }
  const areas = [...labels.values()].map(label => label.area)
  for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) expect(overlap(areas[i]!, areas[j]!)).toBe(false)
}

it.each(views)('paints every smallest final-block numeral at actual $outer Fit geometry', viewSize => {
  const before = JSON.stringify({ bounds: layout.bounds, rooms: layout.rooms, houses: layout.houses, seats: layout.seats, villages: layout.villages, roster: model.layoutRoster })
  const whole = mapOffice(fixture.views.people, fixture.views.work)
  expect(model.layoutRoster).toEqual(whole.layoutRoster); expect(model.rooms).toEqual(whole.rooms); expect(model.seats).toEqual(whole.seats)
  const { map, inner, view, selections } = setup(viewSize), camera = { ...inner.camera }
  expect(inner.zoom).toBeCloseTo(viewSize.minimum, 14)
  expect(camera).toEqual(cameraFor(layout.bounds, view, inner.zoom))
  const plan = villageOverview({ villages: layout.villages! }, inner.zoom), untouched = structuredClone(plan)
  const widthOf = (b: Block) => Math.min(b.x + b.width, layout.bounds.x + layout.bounds.width) - Math.max(b.x, layout.bounds.x)
  const smallest = plan.blocks.filter(b => widthOf(b) === Math.min(...plan.blocks.map(widthOf)))
  expect(smallest.length).toBeGreaterThan(0)
  expect(smallest.every(b => widthOf(b) < b.width)).toBe(true)
  drain(inner.paintSteps(camera))
  const ctx = inner.background.context
  expect(ctx.boxes).toHaveLength(plan.blocks.length)
  for (const block of plan.blocks) {
    const { area } = inner.populationLabels.get(block.id)!
    const painted = ctx.text.find(row => Math.abs(row.x - area.x - 4 / inner.zoom) < 1e-7 && Math.abs(row.y - area.y - 12 / inner.zoom) < 1e-7)
    expect(painted, `missing painted population for ${block.id}`).toBeDefined()
    expect([String(block.total), `${block.total} people`]).toContain(painted!.text)
    expect(painted!.font * inner.zoom).toBeCloseTo(11)
    expect(painted!.x + painted!.width).toBeLessThanOrEqual(area.x + area.width - 4 / inner.zoom + 1e-7)
    expect(ctx.boxes).toContainEqual(area)
  }
  for (let i = 0; i < ctx.boxes.length; i++) for (let j = i + 1; j < ctx.boxes.length; j++) expect(overlap(ctx.boxes[i]!, ctx.boxes[j]!)).toBe(false)
  assertLabels(plan.blocks, inner.populationLabels, inner.zoom, 'people')
  expect(inner.camera).toEqual(camera); expect(plan).toEqual(untouched)
  expect(selections.at(-1)).toEqual([]); expect(screenAgents(model, [], false)).toEqual([])
  expect(JSON.stringify({ bounds: layout.bounds, rooms: layout.rooms, houses: layout.houses, seats: layout.seats, villages: layout.villages, roster: model.layoutRoster })).toBe(before)
  map.dispose()
})

it('keeps fixture labels disjoint at overview boundaries and arbitrary intermediate zooms', () => {
  const minimum = views[0]!.minimum
  for (const zoom of [minimum, views[1]!.minimum, .01937, 95 / VILLAGE.width, 96 / VILLAGE.width, 195 / VILLAGE.width, 196 / VILLAGE.width, 299 / VILLAGE.width]) {
    const plan = villageOverview({ villages: layout.villages! }, zoom), before = structuredClone(plan)
    const labels = drain(populationLabelsSteps(plan.blocks, layout.bounds, zoom, text => advance(text, 11) / zoom, 'people'))
    assertLabels(plan.blocks, labels, zoom, 'people'); expect(plan).toEqual(before)
  }
})

it.each(['en', 'zh'] as const)('keeps complete numerals in both themes in %s', language => {
  for (const theme of ['light', 'dark'] as const) {
    const { map, inner } = setup(views[0]!, language, theme)
    drain(inner.paintSteps(inner.camera))
    assertLabels(inner.villagePlan.blocks, inner.populationLabels, inner.zoom, language === 'en' ? 'people' : '人')
    expect(inner.background.context.text.some(row => row.text.includes(language === 'en' ? 'people' : '人'))).toBe(true)
    map.dispose(); releaseMapSurfaces()
  }
})

it('places indivisible numerals beside tiny blocks and avoids adjacent labels and other signs', () => {
  const bounds = { x: -250, y: -100, width: 500, height: 300 }
  for (const zoom of [.4, 1, 2]) {
    const blocks: Block[] = [0, 7, 17, 68, 999, 10000].map((total, i) => ({ id: String(i), total, x: 100 + i * .01, y: 0, width: .01, height: 50, villages: [i], signs: [] }))
    const obstacles = [{ x: 60, y: 0, width: 50, height: 24 }]
    const labels = drain(populationLabelsSteps(blocks, bounds, zoom, text => advance(text, 11) / zoom, 'people', obstacles))
    const areas = [...labels.values()].map(row => row.area)
    for (const block of blocks) {
      const label = labels.get(block.id)!
      expect(label.population).toBe(String(block.total)); expect(label.area.width * zoom).toBeCloseTo(advance(String(block.total), 11) + 8)
      expect(inside(label.area, bounds)).toBe(true); expect(overlap(label.area, obstacles[0]!)).toBe(false)
    }
    for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) expect(overlap(areas[i]!, areas[j]!)).toBe(false)
  }
})

it('retains a readable existing label at its original position and permits cancellation', () => {
  const block: Block = { id: 'roomy', total: 68, x: 0, y: 0, width: 200, height: 100, villages: [0], signs: [] }
  const result = populationLabel(block, block, 1, text => advance(text, 11), 'people')
  expect(result.population).toBe('68 people'); expect(result.area.y).toBe(62)
  expect(result.area.x + result.area.width / 2).toBe(100)
  const job = populationLabelsSteps([block, { ...block, id: 'next', x: 200 }], { ...block, width: 400 }, 1, text => advance(text, 11), 'people')
  expect(job.next().done).toBe(false); job.return(new Map()); expect(job.next().done).toBe(true)
})

it('culls a fixture edge label by its spill and restores a cancelled partial canvas copy', () => {
  const { map, inner, selections } = setup()
  drain(inner.paintSteps(inner.camera))
  const pair = inner.villagePlan.blocks.map(block => ({ block, label: inner.populationLabels.get(block.id)! }))
    .find(({ block, label }) => label.area.x < block.x)
  expect(pair, 'the actual narrow final fixture block must need spill').toBeDefined()
  const { block, label } = pair!, zoom = inner.zoom
  const spill = { x: label.area.x + .1 / zoom, y: label.area.y + 1 / zoom,
    width: Math.min(1 / zoom, block.x - label.area.x - .2 / zoom), height: 2 / zoom }
  expect(spill.width).toBeGreaterThan(0); expect(overlap(spill, block)).toBe(false)
  const stable = structuredClone([...inner.populationLabels]), original = inner.camera
  inner.camera = { left: spill.x, top: spill.y, width: spill.width, height: spill.height }
  inner.background.context.text = []; inner.background.context.boxes = []
  drain(inner.paintSteps(inner.camera))
  expect(inner.populationLabels.get(block.id)).toEqual(label)
  expect(inner.background.context.text.map(row => row.text)).toContain(label.population)
  expect([...inner.populationLabels]).toEqual(stable)
  const visible = inner.frame.context
  visible.copies = []; visible.clears = []
  const cancelled = inner.dynamicSteps([spill])
  while (!visible.copies.length) expect(cancelled.next().done).toBe(false)
  cancelled.return(false); expect(visible.stack).toHaveLength(0)
  visible.copies = []
  expect(drain(inner.dynamicSteps([spill]))).toBe(true)
  expect(visible.copies.length).toBeGreaterThan(0)
  expect(visible.copies.every(copy => copy.image === inner.background && copy.clip && inside(spill, copy.clip))).toBe(true)
  expect(visible.clears.length).toBeGreaterThan(0); expect(visible.stack).toHaveLength(0)
  expect(selections.at(-1)).toEqual([])
  inner.camera = original; map.dispose()
})

it('reserves native home signs when aggregate population labels are drawn', () => {
  const { map, inner } = setup(), zoom = 300 / VILLAGE.width
  inner.zoom = zoom
  const blocks = villageOverview({ villages: layout.villages! }, 299 / VILLAGE.width).blocks
  drain(inner.placePopulationLabels(inner.background.context as unknown as CanvasRenderingContext2D, blocks, true))
  for (const label of inner.populationLabels.values()) for (const home of layout.houses) {
    const sign = { x: home.x, y: home.y - 20 / zoom, width: Math.min(home.width, 160 / zoom), height: 20 / zoom }
    expect(overlap(label.area, sign)).toBe(false)
  }
  map.dispose()
})
