// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { OfficeMap, releaseMapSurfaces, type MapOptions } from '../src/map-view.ts'
import type { Layout } from '../src/geometry.ts'
import type { Occupant, OfficeModel } from '../src/model.ts'
import type { MovingContact } from '../src/walks.ts'
import type { Camera, Rect } from '../src/viewport.ts'
import { Nameplates } from '../src/nameplates.ts'

let draws = 0, saved = 0, readbacks = 0, clips = 0, createPatterns = 0
let pendingScenery = 0, maximumScenery = 0
let clipped: Rect[] = [], imageDraws: { dx: number; dy: number; width: number; height: number }[] = [], fillStyles: unknown[] = []
const context = new Proxy({ save: () => saved++, restore: () => saved--, getImageData: () => { readbacks++; pendingScenery = 0 },
  rect: (x: number, y: number, width: number, height: number) => { clips++; clipped.push({ x, y, width, height }) },
  createPattern: () => { createPatterns++; return { pattern: createPatterns } },
  fill: () => { draws++ },
  fillText: () => { draws++ },
  drawImage: (_image: unknown, _sx: number, _sy: number, _sw: number, _sh: number, dx: number, dy: number, width: number, height: number) => {
    draws++; imageDraws.push({ dx, dy, width, height })
    if (width === 16 && height === 16) { pendingScenery++; maximumScenery = Math.max(maximumScenery, pendingScenery) }
  } }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => {
  draws++
  if (key === 'rect') clips++
}, set: (_target, key, value) => { if (key === 'fillStyle') fillStyles.push(value); return true } })
class Element extends EventTarget {
  dataset: Record<string, string> = {}; style = {}; width = 800; height = 600
  clientWidth = 800; clientHeight = 600; scrollLeft = 0; scrollTop = 0
  children: Element[] = []; className = ''
  attributes: Record<string, string> = {}
  append(...nodes: Element[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: Element[]) { this.children = nodes }
  setAttribute(name: string, value: string) { this.attributes[name] = value }; remove() {}; querySelector() { return null }; querySelectorAll() { return [] }
  getContext() { return context }
}
const fixtureMaps: OfficeMap[] = []
afterEach(() => {
  for (const map of fixtureMaps.splice(0)) map.dispose()
  releaseMapSurfaces(); vi.useRealTimers(); vi.unstubAllGlobals()
})
function fixture(layer = 'floor', pieces = Array.from({ length: 1000 }, () => ({ x: 0, y: 0, width: 8, height: 8, layer, sprite: 'floor', group: null, depth: 0 })), pack: unknown = null) {
  vi.useFakeTimers(); draws = 0; saved = 0; readbacks = 0; clips = 0; createPatterns = 0; pendingScenery = 0; maximumScenery = 0
  clipped = []; imageDraws = []; fillStyles = []
  vi.stubGlobal('MessageChannel', class {
    timer: ReturnType<typeof setTimeout> | null = null
    port1 = { onmessage: null as (() => void) | null, close: () => { if (this.timer !== null) clearTimeout(this.timer) } }
    port2 = { postMessage: () => { this.timer = setTimeout(() => this.port1.onmessage?.(), 0) }, close() {} }
  })
  vi.stubGlobal('document', { createElement: () => new Element() })
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  const view = new Element(), changed = vi.fn()
  const map = new OfficeMap(view as unknown as HTMLElement, () => {}, () => {}, changed, () => {})
  fixtureMaps.push(map)
  // These paint fixtures install an already opened camera without update().
  Object.assign(map, { opening: false, pack, layout: { bounds: { x: 0, y: 0, width: 10000, height: 10000 }, houses: [], rooms: [], road: { rings: [] }, square: { x: 0, y: 0, width: 1, height: 1 }, seats: {} } as unknown as Layout,
    model: { rooms: [], occupants: [] } as unknown as OfficeModel, scenery: { query: () => pieces, *querySteps() { return pieces } } })
  return { map, changed, view, paint: () => (map as unknown as { paint(): void }).paint() }
}
type PaintedStyle = { left: string; top: string; width: string; height: string; visibility?: string }
interface MapInternals {
  layout: Layout; model: OfficeModel; options: MapOptions; pack: null; camera: Camera
  canvas: Element; targets: Element; plates: Map<string, Rect>; occupants: Map<string, Occupant>; indexedLayout: Layout | null
  painting: object; dynamics: object
  dynamic(regions: Rect[], targets?: boolean): void
}
const internals = (map: OfficeMap): MapInternals => map as unknown as MapInternals
/** Runs the sliced repaint turn by turn until it draws its own dynamic layer, the window in which
 * a later request has to wait for the repaint to finish. */
function enteringDynamicLayer(canvas: Element): void {
  for (let turn = 0; turn < 200 && canvas.dataset['dynamicPaints'] !== '1'; turn++) vi.advanceTimersToNextTimer()
  expect(canvas.dataset['dynamicPaints']).toBe('1')
  expect(canvas.dataset['indexReady']).not.toBe('true')
}
const occupant = (key: string): Occupant => ({ key, agent: { scale: null, name: key.toUpperCase(), handle: key, projects: [] },
  standing: { look: 'front' }, work: [] } as unknown as Occupant)
const walking = (from: string, point: { x: number; y: number }): MovingContact => ({ id: from, from, to: 'other', point, elapsed: 0, facing: 1 })
function personFixture() {
  const result = fixture(), inner = internals(result.map)
  Object.assign(inner.layout.seats, { a: { foot: { x: 40, y: 40 } } })
  Object.assign(result.map, { indexedLayout: inner.layout, seats: { *querySteps() { return ['a'] } }, occupants: new Map([['a', occupant('a')]]) })
  return { ...result, inner }
}
function singleSteps(inner: MapInternals): void {
  let tick = 0
  for (const build of [inner.painting, inner.dynamics]) Object.assign(build, { now: () => (tick += 3) })
}
function until(ready: () => boolean): void {
  for (let turn = 0; turn < 10000 && !ready(); turn++) vi.advanceTimersToNextTimer()
  expect(ready()).toBe(true)
}
function selectAndRename(map: OfficeMap, inner: MapInternals): void {
  const renamed = occupant('a'); renamed.agent.name = 'New name'
  map.update(inner.layout, { ...inner.model, occupants: [renamed] }, { ...inner.options, selected: 'a' }, null)
}
it('slices a large repaint, finishes the same drawing, and releases every pending paint on close', () => {
  const { map, paint } = fixture()
  paint(); expect(draws).toBe(0)
  vi.advanceTimersToNextTimer(); expect(draws).toBeGreaterThan(0); expect(draws).toBeLessThan(1000)
  expect(vi.getTimerCount()).toBe(1)
  vi.runAllTimers(); expect(draws).toBeGreaterThanOrEqual(1000); expect(saved).toBe(0)
  Object.assign(map, { signature: '' }); paint(); vi.advanceTimersToNextTimer()
  map.dispose(); expect(vi.getTimerCount()).toBe(0); const before = draws; vi.runAllTimers(); expect(draws).toBe(before)
  expect(map).toMatchObject({ painting: { work: null, done: null, channel: null }, dynamics: { work: null, done: null, channel: null }, zoomTimer: null, pendingZoom: null })
})
it('does constant scroll-event work, coalesces a burst and reads the latest viewport in a later turn', () => {
  const { map, view, changed } = fixture()
  let reads = 0
  Object.defineProperty(view, 'clientWidth', { get: () => { reads++; return 800 } })
  for (let i = 0; i < 1000; i++) { view.scrollLeft = i; view.dispatchEvent(new Event('scroll')) }
  expect(reads).toBe(0); expect(changed).not.toHaveBeenCalled(); expect(draws).toBe(0)
  expect(vi.getTimerCount()).toBe(1)
  vi.advanceTimersToNextTimer()
  expect(reads).toBeGreaterThan(0); expect(changed).toHaveBeenCalledTimes(1)
  expect(internals(map).camera.left).toBe(768)
  vi.runAllTimers(); expect(vi.getTimerCount()).toBe(0)
  map.dispose()
})
it('queues and paints a new turn after the deferred scroll turn has run', () => {
  const { map, view, changed } = fixture()
  view.scrollLeft = 500; view.dispatchEvent(new Event('scroll'))
  expect(vi.getTimerCount()).toBe(1); expect(changed).not.toHaveBeenCalled()
  vi.advanceTimersToNextTimer()
  expect(changed).toHaveBeenCalledTimes(1); expect(internals(map).camera.left).toBe(256)
  vi.runAllTimers(); const painted = draws
  view.scrollLeft = 1500; view.dispatchEvent(new Event('scroll'))
  expect(vi.getTimerCount()).toBe(1); expect(changed).toHaveBeenCalledTimes(1)
  vi.runAllTimers()
  expect(changed).toHaveBeenCalledTimes(2); expect(internals(map).camera.left).toBe(1280)
  expect(draws).toBeGreaterThan(painted)
  map.dispose()
})
it('keeps a complete view in place until a distant scroll has a complete replacement', () => {
  const { map, view, paint } = fixture(), inner = internals(map)
  paint(); vi.runAllTimers()
  const first = inner.canvas
  const screen = () => {
    const canvas = inner.canvas, style = canvas.style as PaintedStyle
    const left = Number.parseFloat(style.left), top = Number.parseFloat(style.top)
    const width = Number.parseFloat(style.width), height = Number.parseFloat(style.height)
    return { canvas, left: left - view.scrollLeft, top: top - view.scrollTop, width, height }
  }
  const before = screen()
  expect(before.left).toBeLessThanOrEqual(0); expect(before.top).toBeLessThanOrEqual(0)
  view.scrollLeft = 4000; view.scrollTop = 5000; view.dispatchEvent(new Event('scroll'))
  let turns = 0
  do {
    const shown = screen()
    if (shown.canvas === first) {
      expect(shown.left).toBe(before.left); expect(shown.top).toBe(before.top)
    } else {
      expect(shown.left).toBeLessThanOrEqual(0); expect(shown.top).toBeLessThanOrEqual(0)
      expect(shown.left + shown.width).toBeGreaterThanOrEqual(view.clientWidth)
      expect(shown.top + shown.height).toBeGreaterThanOrEqual(view.clientHeight)
    }
    if (!vi.getTimerCount()) break
    vi.advanceTimersToNextTimer()
  } while (++turns < 10000)
  expect(turns).toBeLessThan(10000)
  expect(inner.canvas).not.toBe(first)
})
it('lets a small scroll move the already painted map and keeps its targets available', () => {
  const { map, view, paint } = fixture(), inner = internals(map)
  paint(); vi.runAllTimers()
  view.scrollLeft = 40; view.scrollTop = 30; view.dispatchEvent(new Event('scroll'))
  expect(Number.parseFloat((inner.canvas.style as PaintedStyle).left) - view.scrollLeft).toBe(-40)
  expect(Number.parseFloat((inner.canvas.style as PaintedStyle).top) - view.scrollTop).toBe(-30)
  expect((inner.targets.style as PaintedStyle).visibility).not.toBe('hidden')
})
it('does not present an obsolete frame when another distant scroll overtakes its paint', () => {
  const { map, view, paint } = fixture(), inner = internals(map)
  paint(); vi.runAllTimers()
  const first = inner.canvas
  view.scrollLeft = 3000; view.scrollTop = 3000; view.dispatchEvent(new Event('scroll'))
  vi.advanceTimersToNextTimer()
  view.scrollLeft = 6000; view.scrollTop = 6000; view.dispatchEvent(new Event('scroll'))
  for (let turns = 0; turns < 10000 && vi.getTimerCount(); turns++) {
    const canvas = inner.canvas, style = canvas.style as PaintedStyle
    const left = Number.parseFloat(style.left) - view.scrollLeft, top = Number.parseFloat(style.top) - view.scrollTop
    if (canvas === first) { expect(left).toBe(0); expect(top).toBe(0) }
    else {
      expect(left).toBeLessThanOrEqual(0); expect(top).toBeLessThanOrEqual(0)
      expect(left + Number.parseFloat(style.width)).toBeGreaterThanOrEqual(view.clientWidth)
      expect(top + Number.parseFloat(style.height)).toBeGreaterThanOrEqual(view.clientHeight)
    }
    vi.advanceTimersToNextTimer()
  }
  expect(vi.getTimerCount()).toBe(0)
  const final = inner.canvas.style as PaintedStyle
  expect(Number.parseFloat(final.left)).toBeGreaterThan(5000)
  expect(Number.parseFloat(final.top)).toBeGreaterThan(5000)
})
it('keeps a moving layer from presenting its old camera during a distant scroll', () => {
  const { map, view, paint } = fixture(), inner = internals(map)
  paint(); vi.runAllTimers()
  inner.dynamic([{ x: 0, y: 0, width: 800, height: 600 }], true)
  view.scrollLeft = 4000; view.scrollTop = 5000; view.dispatchEvent(new Event('scroll'))
  inner.dynamic([{ x: 0, y: 0, width: 800, height: 600 }], true)
  for (let turns = 0; turns < 10000 && vi.getTimerCount(); turns++) {
    const style = inner.canvas.style as PaintedStyle
    const left = Number.parseFloat(style.left) - view.scrollLeft, top = Number.parseFloat(style.top) - view.scrollTop
    if (left !== 0 || top !== 0) {
      expect(left).toBeLessThanOrEqual(0); expect(top).toBeLessThanOrEqual(0)
      expect(left + Number.parseFloat(style.width)).toBeGreaterThanOrEqual(view.clientWidth)
      expect(top + Number.parseFloat(style.height)).toBeGreaterThanOrEqual(view.clientHeight)
      expect(Number.parseFloat(style.left)).toBeGreaterThan(3000)
      expect(Number.parseFloat(style.top)).toBeGreaterThan(4000)
    }
    vi.advanceTimersToNextTimer()
  }
  expect(vi.getTimerCount()).toBe(0)
  expect(Number.parseFloat((inner.canvas.style as PaintedStyle).left)).toBeGreaterThan(3000)
})
it('holds the last view through zoom and exposes its new targets only with the new frame', () => {
  const { map, view, paint } = fixture(), inner = internals(map)
  paint(); vi.runAllTimers()
  const first = inner.canvas, before = { ...first.style } as PaintedStyle
  map.scale(.5); vi.advanceTimersToNextTimer()
  expect(inner.canvas).toBe(first)
  expect(Number.parseFloat((first.style as PaintedStyle).left) - view.scrollLeft).toBe(Number.parseFloat(before.left))
  expect(Number.parseFloat((first.style as PaintedStyle).top) - view.scrollTop).toBe(Number.parseFloat(before.top))
  expect((inner.targets.style as PaintedStyle).visibility).toBe('hidden')
  vi.runAllTimers()
  expect(inner.canvas).not.toBe(first)
  expect((inner.targets.style as PaintedStyle).visibility).toBe('')
})
it('cancels a queued scroll on close and releases its listener and timer', () => {
  const { map, view, changed } = fixture()
  view.dispatchEvent(new Event('scroll')); expect(vi.getTimerCount()).toBe(1)
  map.dispose(); const before = draws
  view.dispatchEvent(new Event('scroll')); vi.runAllTimers()
  expect(draws).toBe(before); expect(changed).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0); expect(map).toMatchObject({ scrollTimer: null })
})
it('defers zoom steps, skips repeated clamps and cancels the remaining steps on close', () => {
  const { map, changed } = fixture()
  for (let i = 0; i < 60; i++) map.scale(.8)
  expect(changed).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1)
  expect(map).toMatchObject({ zoom: 1, pendingZoom: .04 })
  vi.runAllTimers(); expect(changed.mock.calls.length).toBeGreaterThan(1); expect(changed.mock.calls.length).toBeLessThan(60)
  expect(map).toMatchObject({ zoom: .04, pendingZoom: null })
  const before = changed.mock.calls.length
  map.scale(1.25); map.dispose(); vi.runAllTimers(); expect(changed).toHaveBeenCalledTimes(before)
  expect(vi.getTimerCount()).toBe(0)
})
it('restores saved canvas state when closing during a partially drawn dynamic region', () => {
  const { map, paint } = fixture('object')
  paint()
  // Stop inside the saved drawing region, after the bounded preparation turns.
  for (let turns = 0; turns < 2000 && saved !== 1 && vi.getTimerCount(); turns++) vi.advanceTimersToNextTimer()
  expect(saved).toBe(1)
  map.dispose()
  expect(saved).toBe(0); expect(vi.getTimerCount()).toBe(0)
})
it('yields inside a nameplate search while preserving every selected rectangle', () => {
  const layout = { seats: {}, houses: [] } as unknown as Layout, planner = new Nameplates(layout)
  const actors = Array.from({ length: 100 }, (_, i) => ({ key: String(i), point: { x: i * 300, y: 0 } }))
  const work = planner.placeSteps(actors); let next = work.next(), slices = 0
  while (!next.done) { slices++; next = work.next() }
  expect(slices).toBeGreaterThanOrEqual(200); expect(next.value).toEqual(planner.place(actors))
})
it('draws an animation requested during a repaint once that repaint finishes', () => {
  const { map, paint } = fixture(), inner = internals(map)
  Object.assign(map, { options: { ...inner.options, still: false }, nameplates: new Nameplates(inner.layout) })
  paint(); enteringDynamicLayer(inner.canvas)
  map.animate([walking('walker', { x: inner.camera.left + 100, y: inner.camera.top + 100 })])
  expect(inner.canvas.dataset['dynamicPaints']).toBe('1')
  vi.runAllTimers()
  expect(inner.canvas.dataset['dynamicPaints']).toBe('2')
  expect(inner.plates.has('walker')).toBe(true)
  expect(inner.canvas.dataset['indexReady']).toBe('true'); expect(vi.getTimerCount()).toBe(0)
  map.dispose()
  // A preview has no dynamic layer of its own, even when the request precedes its first turn.
  const preview = fixture(), state = internals(preview.map)
  Object.assign(state.layout, { preview: true })
  preview.paint(); preview.map.animate([]); vi.runAllTimers()
  expect(state.canvas.dataset['dynamicPaints']).toBe('1')
  expect(preview.map).toMatchObject({ pendingDynamic: null }); expect(vi.getTimerCount()).toBe(0)
})
it('draws an update requested during a repaint, with its target refresh, once the repaint finishes', () => {
  const { map, paint } = fixture(), inner = internals(map), keys = ['a']
  const seats = inner.layout.seats as unknown as Record<string, { foot: { x: number; y: number } }>
  seats['a'] = { foot: { x: 40, y: 40 } }
  Object.assign(map, { indexedLayout: inner.layout, seats: { *querySteps() { return keys } }, occupants: new Map([['a', occupant('a')]]) })
  paint(); enteringDynamicLayer(inner.canvas)
  expect(inner.targets.children.length).toBe(1)
  keys.push('b'); seats['b'] = { foot: { x: 120, y: 40 } }; inner.occupants.set('b', occupant('b'))
  map.animate([])
  map.update(inner.layout, inner.model, { ...inner.options, selected: 'b' }, null)
  expect(inner.canvas.dataset['dynamicPaints']).toBe('1')
  const regions = clips
  vi.runAllTimers()
  expect(inner.canvas.dataset['dynamicPaints']).toBe('2')
  expect(clips - regions).toBe(1)
  expect(inner.targets.children.length).toBe(2)
  expect(vi.getTimerCount()).toBe(0)
})
it('keeps a draw requested during a repaint for the newer repaint that replaced it', () => {
  const { map, paint } = fixture(), inner = internals(map)
  paint(); enteringDynamicLayer(inner.canvas)
  map.animate([])
  Object.assign(map, { signature: '' }); paint()
  vi.runAllTimers()
  // The replacement repaint itself covers the pending request; no third blend is needed.
  expect(inner.canvas.dataset['dynamicPaints']).toBe('2')
  expect(map).toMatchObject({ pendingDynamic: null })
  expect(vi.getTimerCount()).toBe(0)
})
it('forgets a draw requested during a repaint when the map closes, and draws nothing later', () => {
  const { map, paint } = fixture(), inner = internals(map)
  paint(); enteringDynamicLayer(inner.canvas)
  map.animate([])
  map.dispose()
  const drawn = inner.canvas.dataset['dynamicPaints']
  vi.runAllTimers()
  expect(inner.canvas.dataset['dynamicPaints']).toBe(drawn)
  expect(vi.getTimerCount()).toBe(0); expect(map).toMatchObject({ pendingDynamic: null, repainting: false })
})
it.each(['construction', 'placement'])('refreshes an update after repaint target %s without blending the canvas twice', stage => {
  const { map, paint, inner } = personFixture(); singleSteps(inner)
  let made = false
  const create = document.createElement
  vi.spyOn(document, 'createElement').mockImplementation((...args: Parameters<typeof create>) => {
    const node = create(...args)
    if ((args[0] as string) === 'button') made = true
    return node
  })
  paint(); until(() => stage === 'construction' ? made : inner.targets.children.length === 1)
  expect(inner.canvas.dataset['dynamicPaints']).toBeUndefined()
  if (stage === 'placement') expect(inner.targets.children[0]!.attributes).toMatchObject({ 'aria-pressed': 'false', 'aria-label': 'A' })
  selectAndRename(map, inner)
  vi.runAllTimers()
  expect(inner.targets.children[0]!.attributes).toMatchObject({ 'aria-pressed': 'true', 'aria-label': 'New name' })
  expect(inner.canvas.dataset['dynamicPaints']).toBe('2'); expect(clips).toBe(1)
  expect(map).toMatchObject({ pendingDynamic: null }); expect(vi.getTimerCount()).toBe(0)
})
it('preserves an update target refresh when animate arrives before the dynamic draw finishes', () => {
  const { map, paint, inner } = personFixture(); paint(); vi.runAllTimers(); singleSteps(inner)
  const target = inner.targets.children[0]!
  expect(target.attributes).toMatchObject({ 'aria-pressed': 'false', 'aria-label': 'A' })
  // Yield after the dynamic paint starts, before it refreshes the reused button.
  Object.assign(map, { seats: { *querySteps() { yield; return ['a'] } } })
  selectAndRename(map, inner); until(() => inner.canvas.dataset['dynamicPaints'] === '2')
  expect(inner.canvas.dataset['dynamicPaints']).toBe('2')
  expect(map).toMatchObject({ drawingDynamic: true })
  expect(inner.targets.children[0]).toBe(target)
  expect(target.attributes).toMatchObject({ 'aria-pressed': 'false', 'aria-label': 'A' })
  map.animate([]); vi.runAllTimers()
  expect(inner.targets.children[0]!.attributes).toMatchObject({ 'aria-pressed': 'true', 'aria-label': 'New name' })
  expect(inner.canvas.dataset['dynamicPaints']).toBe('3')
  expect(map).toMatchObject({ pendingDynamic: null }); expect(vi.getTimerCount()).toBe(0)
})
it('keeps a second target update that arrives while the first dynamic draw builds buttons', () => {
  const { map, paint, inner } = personFixture(); paint(); vi.runAllTimers(); singleSteps(inner)
  selectAndRename(map, inner)
  until(() => inner.canvas.dataset['dynamicPaints'] === '2')
  const third = occupant('a'); third.agent.name = 'Third'
  map.update(inner.layout, { ...inner.model, occupants: [third] }, { ...inner.options, selected: null }, null)
  vi.runAllTimers()
  expect(inner.targets.children[0]!.attributes).toMatchObject({ 'aria-pressed': 'false', 'aria-label': 'Third' })
  expect(map).toMatchObject({ pendingDynamic: null }); expect(vi.getTimerCount()).toBe(0)
})
it('keeps a cancelled request until repaint and treats its off-camera remainder as empty coverage', () => {
  const { map, paint, inner } = personFixture(); paint(); vi.runAllTimers(); singleSteps(inner)
  const edge = inner.camera.left + inner.camera.width, region = { x: edge - 8, y: 40, width: 16, height: 12 }
  inner.dynamic([region], true); until(() => saved === 1)
  Object.assign(map, { signature: '' }); paint()
  expect(saved).toBe(0)
  const before = clipped.length
  vi.runAllTimers()
  expect(clipped.slice(before)).toEqual([
    { x: inner.camera.left, y: inner.camera.top, width: inner.camera.width, height: inner.camera.height },
  ])
  expect(map).toMatchObject({ pendingDynamic: null }); expect(saved).toBe(0); expect(vi.getTimerCount()).toBe(0)
})
it('drops the common pending regions and target refresh on close during a dynamic draw', () => {
  const { map, paint, inner } = personFixture(); paint(); vi.runAllTimers(); singleSteps(inner)
  selectAndRename(map, inner); vi.advanceTimersToNextTimer(); map.animate([])
  expect(map).toMatchObject({ pendingDynamic: { regions: expect.any(Array), targets: expect.any(Number) } })
  map.dispose()
  const before = draws
  vi.runAllTimers(); map.animate([]); selectAndRename(map, inner)
  expect(draws).toBe(before); expect(map).toMatchObject({ pendingDynamic: null, drawingDynamic: false, repainting: false })
  expect(saved).toBe(0); expect(vi.getTimerCount()).toBe(0)
})
it('coalesces requests made before a draw starts, including targets, into one pass', () => {
  const { map, paint, inner } = personFixture(); paint(); vi.runAllTimers()
  const before = clips
  selectAndRename(map, inner); map.animate([]); map.animate([])
  vi.runAllTimers()
  expect(inner.targets.children[0]!.attributes['aria-pressed']).toBe('true')
  expect(inner.canvas.dataset['dynamicPaints']).toBe('2'); expect(clips - before).toBe(1)
  expect(map).toMatchObject({ pendingDynamic: null })
})
it('draws only a newer contained region after completing an older wider draw', () => {
  const { map, paint, inner } = personFixture(); paint(); vi.runAllTimers(); singleSteps(inner)
  const wide = { x: 0, y: 0, width: 200, height: 200 }, small = { x: 20, y: 20, width: 10, height: 10 }
  const queried: Camera[] = []
  Object.assign(map, { scenery: { *querySteps(camera: Camera) { queried.push(camera); return [] } } })
  const before = clipped.length
  inner.dynamic([wide]); until(() => saved === 1)
  inner.dynamic([small]); vi.runAllTimers()
  expect(clipped.slice(before)).toEqual([wide, small])
  expect(queried).toEqual([wide, small].map(area => ({ left: area.x, top: area.y, width: area.width, height: area.height })))
  expect(map).toMatchObject({ pendingDynamic: null }); expect(saved).toBe(0)
})

function spritePack(ids: string[], size = 16) {
  const image = {}
  return { sources: { sprites: Object.fromEntries(ids.map(id => [id, { atlas: 0, rect: [0, 0, size, size], trim: [0, 0], size: [size, size] }])) }, images: new Map([[0, image]]) }
}
it('flushes one scenery sprite per readback and still draws every piece in order', () => {
  const pieces = Array.from({ length: 20 }, (_, i) => ({ x: i * 20, y: 0, width: 16, height: 16, layer: 'floor', sprite: 'tile', group: null, depth: i }))
  const { map, paint } = fixture('floor', pieces, spritePack(['tile']))
  paint(); vi.runAllTimers()
  expect(readbacks).toBeGreaterThan(1); expect(maximumScenery).toBeLessThanOrEqual(1)
  expect(imageDraws.filter(draw => draw.width === 16 && draw.height === 16).map(draw => draw.dx)).toEqual(pieces.map(piece => piece.x))
  map.dispose(); expect(saved).toBe(0); expect(vi.getTimerCount()).toBe(0)
})
it('reuses one pattern for each tile across paints and replaces it with the pack', () => {
  const { map, paint } = fixture('floor', [], spritePack(['grass-0', 'earth-0'], 26))
  paint(); vi.runAllTimers(); expect(createPatterns).toBe(2)
  Object.assign(map, { signature: '' }); paint(); vi.runAllTimers()
  expect(createPatterns).toBe(2); expect(readbacks).toBeGreaterThan(1)
  Object.assign(map, { pack: spritePack(['grass-0', 'earth-0'], 26), signature: '', tiles: new Map(), tileVersion: 1 })
  paint(); vi.runAllTimers(); expect(createPatterns).toBe(4)
  map.dispose(); expect(saved).toBe(0); expect(vi.getTimerCount()).toBe(0)
})
