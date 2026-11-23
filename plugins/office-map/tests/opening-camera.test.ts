// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { OfficeMap, type MapOptions } from '../src/map-view.ts'
import type { Layout } from '../src/geometry.ts'
import type { OfficeModel } from '../src/model.ts'
import { mapOffice } from '../src/model.ts'
import { agent, people } from './fixtures.ts'

class Element extends EventTarget {
  dataset: Record<string, string> = {}; style = {}; className = ''
  clientWidth = 362; clientHeight = 756; scrollLeft = 0; scrollTop = 0
  append() {}; setAttribute() {}; remove() {}
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })
function fixture() {
  vi.useFakeTimers()
  vi.stubGlobal('document', { createElement: () => new Element() })
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  const view = new Element(), map = new OfficeMap(view as unknown as HTMLElement, vi.fn(), vi.fn(), vi.fn(), vi.fn())
  // Rasterization has its own real-browser proof. Here the real update and
  // navigation methods run, including the preview-to-indexed-layout boundary.
  vi.spyOn(map as unknown as { paint(): void }, 'paint').mockImplementation(() => {})
  const layout = { key: 'full', bounds: { x: -252, y: -20320, width: 161904, height: 31158 }, seats: {
    stale: { foot: { x: 90000, y: 9000 } }, first: { foot: { x: 480, y: -224 } }, next: { foot: { x: 1200, y: 800 } },
  }, rooms: [] } as unknown as Layout
  const model = { ...mapOffice({ ...people, agents: [agent('first'), agent('next')] }, null),
    occupants: ['first','next'].map(key => ({ ...mapOffice({ ...people, agents: [agent(key)] }, null).occupants[0]!, key })), rooms: [] } as OfficeModel
  const options = { theme: 'light' } as MapOptions
  function update(next = layout, people = model, settings = options) {
    // An indexed layout is the point at which update may install the camera.
    Object.assign(map, { indexedLayout: next })
    map.update(next, people, settings, null)
  }
  return { map, view, layout, model, options, update }
}
it.each([1388, 938, 608, 362])('opens on the first current person at viewport width %i, after the preview', width => {
  const { view, layout, update } = fixture(); view.clientWidth = width
  update({ ...layout, preview: true, seats: {} })
  expect([view.scrollLeft, view.scrollTop]).toEqual([0, 0])
  update()
  expect(view.scrollLeft).toBe(480 + 252 - width / 2)
  expect(view.scrollTop).toBe(-224 + 20320 - 756 / 2)
})
it.each([[321, 654], [0, 0]])('keeps the reader camera at %i,%i on state, theme or roster updates', (left, top) => {
  const { view, layout, model, options, update } = fixture()
  update(); view.scrollLeft = left; view.scrollTop = top
  update(layout, { ...model }, { ...options, theme: 'dark' })
  update({ ...layout, key: 'next-roster' })
  expect([view.scrollLeft, view.scrollTop]).toEqual([left, top])
})
it.each(['fit', 'scale', 'wheel', 'keyboard', 'locate'])('keeps a reader camera chosen by %s before the first complete layout', action => {
  const { map, view, layout, update } = fixture()
  update({ ...layout, preview: true })
  if (action === 'fit') map.fit()
  if (action === 'scale') map.scale(1.25)
  if (action === 'wheel') { view.dispatchEvent(new Event('wheel')); view.scrollTop = 80 }
  if (action === 'keyboard') view.dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowRight' }))
  if (action === 'locate') map.locate('next')
  const before = [view.scrollLeft, view.scrollTop]
  update()
  expect([view.scrollLeft, view.scrollTop]).toEqual(before)
})
it('waits for an occupied layout when the first full read is empty', () => {
  const { view, layout, model, update } = fixture()
  update({ ...layout, seats: {} }, { ...model, occupants: [] })
  expect([view.scrollLeft, view.scrollTop]).toEqual([0, 0])
  update()
  expect(view.scrollTop).toBeGreaterThan(19000)
})

it('keeps the same world anchor through north and west growth, including the loading preview', () => {
  const { map, view, layout, update } = fixture()
  update(); map.scale(.8); vi.runAllTimers()
  view.scrollLeft = 2000; view.scrollTop = 3000
  const zoom = (map as unknown as { zoom: number }).zoom
  const anchor = () => ({ x: (map as unknown as { layout: Layout }).layout.bounds.x + view.scrollLeft / zoom,
    y: (map as unknown as { layout: Layout }).layout.bounds.y + view.scrollTop / zoom })
  const before = anchor(), grown = { ...layout, key: 'north-west', bounds: { ...layout.bounds, x: layout.bounds.x - 2548, y: layout.bounds.y - 1794, width: layout.bounds.width + 2548, height: layout.bounds.height + 1794 } }
  update({ ...grown, preview: true }); expect(anchor()).toEqual(before)
  update(grown); expect(anchor()).toEqual(before)
})

it('locates a searched person from a village overview at a usable native zoom', () => {
  const { map, view, layout, update } = fixture()
  update({ ...layout, villages: [{}] as Layout['villages'] }); map.fit()
  expect((map as unknown as { zoom: number }).zoom).toBeLessThan(.25)
  map.locate('next')
  expect((map as unknown as { zoom: number }).zoom).toBe(1)
  expect(view.scrollLeft).toBe(1200 - layout.bounds.x - view.clientWidth / 2)
  expect(view.scrollTop).toBe(800 - layout.bounds.y - view.clientHeight / 2)
})

it('opens on an occupied home when the first loading preview is superseded by north-west growth', () => {
  const { view, layout, update } = fixture()
  update({ ...layout, preview: true, seats: {} })
  const grown = { ...layout, bounds: { ...layout.bounds, x: layout.bounds.x - 2548, y: layout.bounds.y - 1794 } }
  update({ ...grown, preview: true, seats: {} }); update(grown)
  expect(view.scrollLeft).toBe(480 - grown.bounds.x - view.clientWidth / 2)
  expect(view.scrollTop).toBe(-224 - grown.bounds.y - view.clientHeight / 2)
})

it.each([[1388, 756, 10000, 10000], [362, 756, 10000, 1000]])('centres fitted world bounds in both directions at %i by %i', (width, height, worldWidth, worldHeight) => {
  const { map, view, layout, update } = fixture()
  view.clientWidth = width; view.clientHeight = height
  const next = { ...layout, bounds: { x: -2548, y: -1794, width: worldWidth, height: worldHeight } }
  const original = structuredClone(next.bounds)
  update(next); map.fit()
  const camera = (map as unknown as { actualCamera(): { left: number; top: number; width: number; height: number } }).actualCamera()
  expect(camera.left + camera.width / 2).toBeCloseTo(next.bounds.x + worldWidth / 2)
  expect(camera.top + camera.height / 2).toBeCloseTo(next.bounds.y + worldHeight / 2)
  expect(next.bounds).toEqual(original)
})

it.each([1388, 938, 608, 362])('keeps the full northern house sign in the fitted ownership viewport at width %i', width => {
  const { map, view, layout, update } = fixture()
  view.clientWidth = width; view.clientHeight = 656
  const next = { ...layout, ownership: true, bounds: { x: 0, y: 0, width: 8272, height: 8080 } }
  const original = structuredClone(next.bounds)
  update(next); map.fit()
  const zoom = (map as unknown as { zoom: number }).zoom
  const camera = (map as unknown as { actualCamera(): { left: number; top: number; width: number; height: number } }).actualCamera()
  // The real homeLabels sign is 20 screen pixels tall, above the house at y=128.
  expect((128 - camera.top) * zoom - 20).toBeGreaterThanOrEqual(0)
  expect((128 - camera.top) * zoom).toBeLessThanOrEqual(view.clientHeight)
  expect(camera.left).toBeLessThanOrEqual(next.bounds.x)
  expect(camera.top).toBeLessThanOrEqual(next.bounds.y)
  expect(camera.left + camera.width).toBeGreaterThanOrEqual(next.bounds.width)
  expect(camera.top + camera.height).toBeGreaterThanOrEqual(next.bounds.height)
  expect(next.bounds).toEqual(original)
})

it.each([.04, .07524752475247524, .24, 1])('draws the full northern sign inside the world canvas at ownership zoom %f', zoom => {
  const { map, layout, update } = fixture()
  const house = { x: 3772, y: 128, width: 728, height: 520, group: 'generated-secretariat', label: 'Secretariat', occupants: ['generated-s1'] }
  const next = { ...layout, ownership: true, bounds: { x: 0, y: 0, width: 8272, height: 8080 }, houses: [house] } as unknown as Layout
  const before = structuredClone(next)
  update(next)
  type Homes = { house: Layout['houses'][number]; box: { x: number; y: number; width: number; height: number } }[]
  const inner = map as unknown as { zoom: number; homeSignBoxes(camera: { left: number; top: number; width: number; height: number }): Homes; homeLabels(ctx: CanvasRenderingContext2D, homes: Homes): Generator<void> }
  inner.zoom = zoom
  const boxes: number[][] = [], text: number[][] = []
  const ctx = { fillRect: (...rect: number[]) => boxes.push(rect), fillText: (_value: string, ...rect: number[]) => text.push(rect), getImageData() {} }
  Object.assign(ctx, { measureText: (_value: string) => ({ width: 0 }) })
  for (const _ of inner.homeLabels(ctx as unknown as CanvasRenderingContext2D, inner.homeSignBoxes({ left: 0, top: 0, width: 8272, height: 8080 }))) { /* actual renderer generator */ }
  expect(boxes).toHaveLength(2); expect(text).toHaveLength(1)
  const top = boxes[0]![1]!, height = boxes[0]![3]!, baseline = text[0]![1]!
  expect(top).toBeGreaterThanOrEqual(next.bounds.y)
  expect(top + height).toBeLessThanOrEqual(next.bounds.y + next.bounds.height)
  expect(boxes[1]![1]).toBe(top)
  expect(baseline - 11 / zoom).toBeGreaterThanOrEqual(top)
  expect(baseline).toBeLessThanOrEqual(top + height)
  if (zoom === 1) expect(top).toBe(house.y - 20)
  expect(next).toEqual(before)
})
