// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { GeometryEngine } from '../src/worker-protocol.ts'
import { VisibleIndex } from '../src/render-plan.ts'
import { VILLAGE, villageOverview } from '../src/village-layout.ts'
import { villageRoster } from './village-layout-fixtures.ts'
import type { ArtPack } from '../src/pack.ts'

class Element extends EventTarget {
  dataset: Record<string, string> = {}; style = {}; width = 800; height = 600
  clientWidth = 800; clientHeight = 600; scrollLeft = 0; scrollTop = 0; children: Element[] = []; className = ''
  attributes: Record<string, string> = {}
  append(...nodes: Element[]) { this.children.push(...nodes) }; replaceChildren(...nodes: Element[]) { this.children = nodes }
  setAttribute(name: string, value: string) { this.attributes[name] = value }; remove() {}; querySelector() { return null }; querySelectorAll() { return [] }
  getContext() { return context }
}
const earthRectangles: number[][] = []
const atlas = {}, artDraws: boolean[] = [], labels: string[] = [], order: string[] = []
let smoothing = false, font = ''
const textWidths: { text: string; x: number; width: number }[] = []
let matrix = [1, 1, 0, 0], stack: number[][] = [], bottom = 0, labelTop = Infinity, fill = ''
let flags: string[] = []
const context = new Proxy({
  drawImage: (image: object, _sx: number, _sy: number, _sw: number, _sh: number, _dx: number, dy: number, _width: number, height: number) => {
    if (image === atlas) { artDraws.push(smoothing); order.push('art'); bottom = Math.max(bottom, (dy + height) * matrix[1]! + matrix[3]!) }
  },
  fillText: (text: string, x: number) => { labels.push(text); order.push(text); textWidths.push({ text, x, width: text.length * parseFloat(font) * .55 }) },
  measureText: (text: string) => ({ width: text.length * parseFloat(font) * .55 }),
  fillRect: (_x: number, y: number, width: number, height: number) => { if (fill === '#e6c182') earthRectangles.push([width,height]); if (fill === '#fffdf5') labelTop = Math.min(labelTop, y * matrix[1]! + matrix[3]!); if (fill.startsWith('hsl(')) flags.push(fill) },
  setTransform: (a: number, _b: number, _c: number, d: number, e: number, f: number) => { matrix = [a, d, e, f] },
  translate: (x: number, y: number) => { matrix[2]! += matrix[0]! * x; matrix[3]! += matrix[1]! * y },
  scale: (x: number, y: number) => { matrix[0]! *= x; matrix[1]! *= y },
  save: () => stack.push([...matrix]), restore: () => { matrix = stack.pop()! },
}, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => {},
  set: (_target, key, value) => { if (key === 'imageSmoothingEnabled') smoothing = value; if (key === 'fillStyle') fill = value; if (key === 'font') font = value; return true } })
afterEach(() => { releaseMapSurfaces(); vi.useRealTimers(); vi.unstubAllGlobals() })

function fixture(pixels: number) {
  vi.useFakeTimers(); earthRectangles.length = 0; artDraws.length = 0; labels.length = 0; order.length = 0; smoothing = false
  matrix = [1, 1, 0, 0]; stack = []; bottom = 0; labelTop = Infinity; fill = ''; flags = []; textWidths.length = 0
  vi.stubGlobal('document', { createElement: () => new Element() }); vi.stubGlobal('window', { devicePixelRatio: 2 })
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  const reply = new GeometryEngine(true).receive({ id: 1, kind: 'layout', input: { rooms: [], roster: villageRoster(16) } })
  if (reply?.kind !== 'layout') throw Error('Missing village')
  const layout = { ...reply.layout, seats: {} }, view = new Element()
  const map = new OfficeMap(view as unknown as HTMLElement, vi.fn(), vi.fn(), vi.fn(), vi.fn())
  const sprites = Object.fromEntries([...new Set(layout.pieces.map(p => p.sprite))].map(id => [id, { atlas: 'art', rect: [0, 0, 10, 10], trim: [0, 0], size: [10, 10], anchor: [0, 0] }]))
  const pack = { images: new Map([['art', atlas]]), sources: { sprites }, bytes: 0 } as unknown as ArtPack
  Object.assign(map, { layout, model: { rooms: [], occupants: [] }, pack, zoom: pixels / VILLAGE.width, opening: false,
    scenery: new VisibleIndex(layout.pieces.map(value => ({ value, rect: value }))),
    camera: { left: 0, top: 0, width: layout.bounds.width, height: layout.bounds.height } })
  const inner = map as unknown as { paintSteps(camera: object): Generator<void>; targets: Element; canvas: Element; zoom: number; paint(): void }
  const work = inner.paintSteps({ left: 0, top: 0, width: layout.bounds.width, height: layout.bounds.height })
  while (!work.next().done) {}
  return { map, inner, signs: layout.villages![0]!.signs }
}

it.each([96, 180, 299])('draws cached woodland art and named village targets at %i CSS pixels with even nearest scaling', pixels => {
  const { map, inner } = fixture(pixels)
  expect(inner.canvas.dataset.mode).toBe('villages')
  expect(artDraws.length).toBeGreaterThan(30)
  expect(artDraws.every(value => !value)).toBe(true)
  expect(labels).toContain('16 people')
  expect(labels).toContain('Team A +5')
  expect((inner as unknown as {forest:{pieces:{sprite:string}[]}}).forest.pieces.some(p=>['tree-assembled','pine-tree'].includes(p.sprite))).toBe(true)
  expect(labels.some(text => /^V\d|^D\d/.test(text))).toBe(false)
  expect(inner.targets.children).toHaveLength(1)
  const button = inner.targets.children[0]!
  expect(button.attributes['aria-label']).toContain('16 people')
  expect(button.attributes['aria-label']).not.toMatch(/V\d|D\d|group-/)
  vi.spyOn(inner, 'paint').mockImplementation(() => {})
  button.dispatchEvent(new Event('click'))
  expect(inner.zoom * VILLAGE.width).toBeGreaterThanOrEqual(320)
  map.dispose()
})

it('keeps native art sharp at 300 CSS pixels and uses labelled districts below 96', () => {
  const native = fixture(300)
  expect(native.inner.canvas.dataset.mode).toBe('homes')
  expect(artDraws.length).toBeGreaterThan(100)
  expect(artDraws.every(value => !value)).toBe(true)
  native.map.dispose()
  const district = fixture(95)
  expect(district.inner.canvas.dataset.mode).toBe('districts')
  expect(artDraws.length).toBeGreaterThan(0)
  expect(labels).toContain('16 people')
  expect(district.inner.targets.children).toHaveLength(1)
  district.map.dispose()
})

it('keeps the village common square on grass in the actual canvas renderer', () => {
  const result = fixture(800)
  expect(earthRectangles).not.toContainEqual([2340,416])
  result.map.dispose()
})

it('draws every native home team sign after the trees and furniture', () => {
  const native = fixture(800)
  expect(order.indexOf('Team A')).toBeGreaterThan(order.lastIndexOf('art'))
  expect(labels.filter(label => label === 'Team A')).toHaveLength(1)
  expect(labels).toContain('Team B')
  native.map.dispose()
})

it.each([96, 180, 299])('reuses woodland tiles during a second static paint at %i CSS pixels', pixels => {
  const result = fixture(pixels), before = artDraws.length
  const work = result.inner.paintSteps({ left:0,top:0,width:2548,height:1794 })
  while (!work.next().done) {}
  expect(artDraws.length).toBe(before)
  expect(Number(result.inner.canvas.dataset.forestTileBytes)).toBeLessThanOrEqual(8*1024*1024)
  result.map.dispose()
})

it('restores cached woodland pixels without redrawing tree art during actor frames', () => {
  const result=fixture(800),before=artDraws.length
  const p={sprite:'pine-tree',x:100,y:100,width:106,height:143,depth:242,layer:'object' as const,group:null,cached:true}
  const inner=result.inner as unknown as {scenery:VisibleIndex<typeof p>;dynamicSteps(regions:object[]):Generator<void>}
  inner.scenery=new VisibleIndex([{value:p,rect:p}])
  const work=inner.dynamicSteps([{x:0,y:0,width:2548,height:1794}]);while(!work.next().done){}
  expect(artDraws.length).toBe(before)
  result.map.dispose()
})

it('marks every team in a village picture so a later annex keeps its shared sign', () => {
  const result = fixture(180)
  expect(result.signs).toHaveLength(6)
  expect(flags).toEqual(result.signs.map(sign => `hsl(${sign.token % 360} 45% 48%)`))
  expect(result.inner.targets.children[0]!.attributes['aria-label']).toContain('Welcome')
  result.map.dispose()
})

it('keeps the total and drops a team word that cannot fit without cutting it', () => {
  const result = fixture(180)
  const inner = result.inner as unknown as { blockLabel(ctx: object, block: object): void }
  labels.length = 0; textWidths.length = 0
  const width = 78 / (180 / VILLAGE.width)
  inner.blockLabel(context, { x: 0, y: 0, width, height: 1794, id: 'D2:0,0', total: 68, villages: [0, 1], signs: [{ id: 'team', label: 'Inspectors of public works', token: 12, total: 68 }] })
  expect(labels).toEqual(['68 people'])
  const right = width - 11 / (180 / VILLAGE.width)
  expect(textWidths.every(item => item.x + item.width <= right)).toBe(true)
  labels.length=0
  inner.blockLabel(context,{x:0,y:0,width:48/(180/VILLAGE.width),height:1794,id:'D4:4,0',total:68,villages:[0,1],signs:[{id:'private-id',label:'Team North',token:12,total:68},{id:'other',label:'Other',token:18,total:0}]})
  expect(labels).toEqual(['68'])
  result.map.dispose()
})

it('names the largest active teams in each district, combining their annexes', () => {
  const cell = (id: number, signs: { id: string; total: number }[]) => ({ id, column: id, row: 0, x: id * 2548, y: 0, width: 2548, height: 1794,
    total: signs.reduce((sum, s) => sum + s.total, 0), signs: signs.map(s => ({ ...s, label: s.id, token: 0 })) })
  const overview = villageOverview({ villages: [cell(0, [{ id: 'Small', total: 2 }, { id: 'Largest', total: 8 }]), cell(1, [{ id: 'Small', total: 3 }, { id: 'Largest', total: 1 }])] }, 95 / VILLAGE.width)
  expect(overview.blocks[0]!.signs.map(s => [s.id, s.total])).toEqual([['Largest', 9], ['Small', 5]])
})
