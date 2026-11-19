// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { SceneryIndex } from '../src/compact-scenery.ts'
import { VisibleIndex } from '../src/render-plan.ts'
import { mapOffice } from '../src/model.ts'
import { piece, type House } from '../src/village.ts'
import type { Layout } from '../src/geometry.ts'
import { people } from './fixtures.ts'

const draws = vi.hoisted(() => [] as string[])
vi.mock('../src/pack.ts', async original => ({ ...await original<typeof import('../src/pack.ts')>(),
  drawSprite: (_ctx: unknown, _pack: unknown, id: string) => { draws.push(id); return true },
}))
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const context = new Proxy({ measureText: (s: string) => ({ width: s.length * 6 }), getImageData: () => ({ data: new Uint8Array(4) }), createPattern: () => null }, { get: (a, k) => Reflect.get(a, k) ?? (() => {}) })
class Node extends EventTarget {
  dataset = {}; style = {}; width = 800; height = 600; clientWidth = 800; clientHeight = 600
  scrollLeft = 0; scrollTop = 0; children: Node[] = []
  append(...nodes: Node[]) { this.children.push(...nodes) }; replaceChildren(...nodes: Node[]) { this.children = nodes }
  getContext() { return context }; setAttribute() {}; remove() {}; querySelector() { return null }; querySelectorAll() { return [] }
}
afterEach(() => { releaseMapSurfaces(); vi.unstubAllGlobals(); draws.length = 0 })

it.each(['tree-assembled', 'pine-tree', 'B56'])('the actual renderer places the whole %s at its base depth and keeps that order on redraw', sprite => {
  vi.stubGlobal('document', { createElement: () => new Node() }); vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  const model = mapOffice({ ...people, agents: [] }, null)
  const front = piece('B06-front', 100, 100, 'house', 'front', 400)
  const back = piece('B06-back', 100, 100, 'house', 'back', 400)
  const sign = piece('B42', 280, 78, 'house', 'back', 78)
  const tree = { ...piece(sprite, 180, 200, null, 'floor', 500), decoration: true }
  const behind = { ...piece(sprite, 50, 20, null, 'floor', 100), cached: true }
  const home: House = { x: 100, y: 100, width: 624, height: 416, group: 'house', anchor: { x: 412, y: 490 },
    module: 0, style: 'B06', occupants: [], doors: [], openings: [], hitArea: [], walkable: [] }
  const layout = { key: 'generated-tree', bounds: { x: 0, y: 0, width: 800, height: 600 }, rooms: [], houses: [home], seats: {}, pieces: [front, back, sign, tree, behind],
    square: { x: 0, y: 0, width: 1, height: 1 }, obstacles: [], bodyRadius: 16, road: { rings: [], ends: [], faults: [], halfWidth: 26 } } as Layout
  const camera = { left: 0, top: 0, width: 800, height: 600 }
  const map = new OfficeMap(new Node() as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {})
  const inner = map as any
  Object.assign(inner, { layout, model, camera, zoom: 1, occupants: new Map(), seats: new VisibleIndex(), roads: new VisibleIndex(), scenery: finish(SceneryIndex.build(layout.pieces)) })
  finish(inner.paintSteps(camera))
  expect(draws.indexOf(sprite)).toBeLessThan(draws.indexOf('B06-front'))
  expect(draws.indexOf(sprite)).toBeLessThan(draws.indexOf('B06-back'))
  expect(draws.lastIndexOf(sprite)).toBeGreaterThan(draws.lastIndexOf('B06-front'))
  expect(draws.lastIndexOf(sprite)).toBeGreaterThan(draws.lastIndexOf('B06-back'))
  expect(draws.indexOf('B42')).toBeGreaterThan(draws.indexOf('B06-back'))
  draws.length = 0
  finish(inner.dynamicSteps([{ x: 0, y: 0, width: 800, height: 600 }]))
  // The unchanged cached behind-tree pixels come from the restored background.
  // Only the foreground tree is rasterized again with the house layers.
  expect(draws.filter(s => s === sprite)).toHaveLength(1)
  expect(draws.lastIndexOf(sprite)).toBeGreaterThan(draws.indexOf('B06-front'))
  map.dispose()
})
