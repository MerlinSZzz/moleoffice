// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { VisibleIndex } from '../src/render-plan.ts'
import { mapOffice } from '../src/model.ts'
import type { Layout } from '../src/geometry.ts'
import type { Camera, Rect } from '../src/viewport.ts'
import { people } from './fixtures.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
// The context keeps its transform, so every clear and clip is recorded in device pixels.
let matrix = [1, 0, 0, 1, 0, 0], path: Rect | null = null
const clears: Rect[] = [], clips: Rect[] = []
const device = (x: number, y: number, width: number, height: number): Rect => ({ x: x * matrix[0]! + matrix[4]!, y: y * matrix[3]! + matrix[5]!, width: width * matrix[0]!, height: height * matrix[3]! })
const context = new Proxy({ measureText: (s: string) => ({ width: s.length * 6 }), getImageData: () => ({ data: new Uint8Array(4) }), createPattern: () => null,
  setTransform: (...values: number[]) => { matrix = values }, clearRect: (x: number, y: number, w: number, h: number) => { clears.push(device(x, y, w, h)) },
  rect: (x: number, y: number, w: number, h: number) => { path = device(x, y, w, h) }, clip: () => { clips.push(path!) } }, { get: (a, k) => Reflect.get(a, k) ?? (() => {}) })
class Node extends EventTarget {
  dataset = {}; style = {}; width = 800; height = 600; clientWidth = 800; clientHeight = 600
  scrollLeft = 0; scrollTop = 0; children: Node[] = []
  append(...nodes: Node[]) { this.children.push(...nodes) }; replaceChildren(...nodes: Node[]) { this.children = nodes }
  getContext() { return context }; setAttribute() {}; remove() {}; querySelector() { return null }; querySelectorAll() { return [] }
}
afterEach(() => { releaseMapSurfaces(); vi.unstubAllGlobals() })

// A partial redraw cleared whole device pixels but drew them again only inside the region's own
// edges. Where an edge fell inside a pixel, that pixel was left part clear and the map's floor
// showed through: a faint outline where a plate had been, at 390 px (11 November).
it.each([[.2816666666666667, 1], [.5, 2], [.73, 1.25]])('draws again whole every pixel a partial redraw clears, up to the camera\'s own edges, at zoom %s and pixel ratio %s', (zoom, pixelRatio) => {
  vi.stubGlobal('document', { createElement: () => new Node() }); vi.stubGlobal('window', { devicePixelRatio: pixelRatio })
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  const model = mapOffice({ ...people, agents: [] }, null), asked: Camera[] = []
  const layout = { key: 'partial-redraw', bounds: { x: 0, y: 0, width: 4000, height: 4000 }, rooms: [], houses: [], seats: {}, pieces: [],
    square: { x: 0, y: 0, width: 1, height: 1 }, obstacles: [], bodyRadius: 16, road: { rings: [], ends: [], faults: [], halfWidth: 26 } } as unknown as Layout
  const camera = { left: 695.86, top: 1200.3, width: 1299.43, height: 1398.17 }, right = camera.left + camera.width, bottom = camera.top + camera.height
  const map = new OfficeMap(new Node() as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {})
  const inner = map as any
  Object.assign(inner, { layout, model, camera, zoom, occupants: new Map(), seats: new VisibleIndex(), roads: new VisibleIndex(),
    scenery: { *querySteps(area: Camera) { asked.push(area); return [] } } })
  finish(inner.paintSteps(camera))
  const scale = zoom * inner.ratio
  const regions = { 'a plate cut by the left edge': { x: 614, y: 2319.2, width: 100, height: 28 }, 'a plate inside the view': { x: 1000.3, y: 2000.7, width: 100, height: 28 },
    'a sign cut by the right edge': { x: right - 30.2, y: 1500.15, width: 60, height: 40 }, 'a plate cut by the bottom edge': { x: 1300.45, y: bottom - 9.6, width: 100, height: 28 } }
  for (const [name, region] of Object.entries(regions)) {
    clears.length = 0; clips.length = 0; asked.length = 0
    expect(finish(inner.dynamicSteps([region])), name).toBe(true)
    expect([clears.length, clips.length, asked.length], `${name}: one clear, one clip and one scenery read`).toEqual([1, 1, 1])
    const cleared = clears[0]!, clip = clips[0]!, read = asked[0]!
    // The clip covers every cleared pixel whole, and stops at the camera's own edges.
    const whole = { x: cleared.x, y: cleared.y, right: Math.min(cleared.x + cleared.width, camera.width * scale), bottom: Math.min(cleared.y + cleared.height, camera.height * scale) }
    const drawn = { x: clip.x, y: clip.y, right: clip.x + clip.width, bottom: clip.y + clip.height }
    for (const side of ['x', 'y', 'right', 'bottom'] as const) expect(drawn[side], `${name}: the clip's ${side} in device pixels`).toBeCloseTo(whole[side], 6)
    // The scenery is read for the whole of that area, so a piece in an edge pixel is drawn again too.
    const readArea = { x: (read.left - camera.left) * scale, y: (read.top - camera.top) * scale, right: (read.left + read.width - camera.left) * scale, bottom: (read.top + read.height - camera.top) * scale }
    for (const side of ['x', 'y', 'right', 'bottom'] as const) expect(readArea[side], `${name}: the scenery read's ${side} in device pixels`).toBeCloseTo(whole[side], 6)
  }
  map.dispose()
})
