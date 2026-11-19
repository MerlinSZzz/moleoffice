// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { layoutIndexes } from '../src/layout-index.ts'
import { moleMiddle, OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { sleepSprites } from '../src/sleep-art.ts'
import { houseSign } from '../src/ownership-area-labels.ts'
import { overlaps } from '../src/nameplates.ts'
import { agent, people } from './fixtures.ts'
import { data as actionData, png } from './tuft-action-fixture.ts'
import catalog from '../assets/village-catalog.json'
import type { RosterView } from '../src/contracts.ts'
import type { Layout } from '../src/geometry.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
function example(count: number) {
  const agents = [agent('sample-secretary', { role: 'secretary' }), agent('sample-lead', { role: 'supervisor', startedBy: { kind: 'agent', id: 'sample-secretary' } }),
    ...Array.from({ length: count - 1 }, (_, i) => agent(`sample-member-${i}`, { startedBy: { kind: 'agent', id: 'sample-lead' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return { model, layout: finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })) }
}
type Box = { x: number; y: number; width: number; height: number }
const texts: { value: string; x: number; y: number; maxWidth?: number; width: number }[] = [], boxes: Box[] = [], plates: Box[] = []
const target = { font: '12px system-ui', fillStyle: '',
  fillText(value: string, x: number, y: number, maxWidth?: number) { texts.push({ value, x, y, maxWidth, width: this.measureText(value).width }) },
  fillRect(x: number, y: number, width: number, height: number) { if (this.fillStyle === '#fffdf5') boxes.push({ x, y, width, height }); if (this.fillStyle === '#f5f0dc') plates.push({ x, y, width, height }) },
  measureText(value: string) { return { width: [...value].reduce((n, c) => n + (c.charCodeAt(0) < 128 ? .5 : 1), 0) * parseFloat(this.font) } },
  getImageData: () => ({ data: new Uint8Array(4) }), createPattern: () => null }
const context = new Proxy(target, { get: (a, k) => Reflect.get(a, k) ?? (() => {}) })
class Node extends EventTarget {
  dataset = {}; style = {}; width = 362; height = 656; clientWidth = 362; clientHeight = 656
  scrollLeft = 0; scrollTop = 0; children: Node[] = []
  append(...nodes: Node[]) { this.children.push(...nodes) }; replaceChildren(...nodes: Node[]) { this.children = nodes }
  getContext() { return context }; setAttribute() {}; remove() {}; querySelector() { return null }; querySelectorAll() { return [] }
}
let resized = () => {}
/** The page at 390 px: the map's view is 362 by 656. At 1440 px it is 1388 by 756. */
function painter(found: ReturnType<typeof example>, zoom: number, scrollLeft: number, language: 'en' | 'zh' = 'en', size = { width: 362, height: 656 }, scrollTop = 0, prepare: (inner: any) => void = () => {}) {
  const { model, layout } = found
  vi.stubGlobal('document', { createElement: () => new Node() }); vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('ResizeObserver', class { constructor(changed: () => void) { resized = changed }; observe() {}; disconnect() {} })
  const view = new Node(), map = new OfficeMap(view as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {}), inner = map as any
  const bounds = layout.bounds, camera = { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }
  view.clientWidth = size.width; view.clientHeight = size.height; view.scrollLeft = scrollLeft; view.scrollTop = scrollTop
  Object.assign(inner, { layout, model, camera, zoom, padding: { x: Math.max(0, (size.width - bounds.width * zoom) / 2), y: Math.max(0, (size.height - bounds.height * zoom) / 2) },
    occupants: new Map(model.occupants.map(o => [o.key, o])), ...finish(layoutIndexes(layout)) })
  inner.options.language = language; prepare(inner)
  texts.length = 0; boxes.length = 0; plates.length = 0
  finish(inner.paintSteps(camera))
  return { map, inner, view, camera }
}
/** Timers stand in for the message channel that schedules a drawing pass. */
function fakeChannel() {
  vi.useFakeTimers()
  vi.stubGlobal('MessageChannel', class {
    timer: ReturnType<typeof setTimeout> | null = null
    port1 = { onmessage: null as (() => void) | null, close: () => { if (this.timer !== null) clearTimeout(this.timer) } }
    port2 = { postMessage: () => { this.timer = setTimeout(() => this.port1.onmessage?.(), 0) }, close() {} }
  })
}
afterEach(() => { releaseMapSurfaces(); vi.useRealTimers(); vi.unstubAllGlobals(); texts.length = 0; boxes.length = 0; plates.length = 0 })
/** The 390 px view at zoom 1, placed by its left and top edges in map px. */
const viewAt = (found: ReturnType<typeof example>, left: number, top: number, prepare?: (inner: any) => void) =>
  painter(found, 1, left - found.layout.bounds.x, 'en', undefined, top - found.layout.bounds.y, prepare)
const reaches = (rect: Box, view: { left: number; top: number; width: number; height: number }) =>
  rect.x < view.left + view.width && view.left < rect.x + rect.width && rect.y < view.top + view.height && view.top < rect.y + rect.height
const inside = (point: { x: number; y: number }, view: { left: number; top: number; width: number; height: number }) =>
  point.x >= view.left && point.x < view.left + view.width && point.y >= view.top && point.y < view.top + view.height
const drawnAt = (rect: Box) => plates.some(p => p.x === rect.x && p.y === rect.y)
const awayActor = (layout: Layout) => Object.keys(layout.seats)[0]!

for (const language of ['en', 'zh'] as const) it(`names the sleeping house in ${language} on the fitted map at 390 px, where no house sign is drawn`, () => {
  const found = example(13), { layout } = found, bounds = layout.bounds
  const zoom = Math.min((362 - 48) / bounds.width, (656 - 48) / bounds.height)
  expect(zoom).toBeLessThan(.18)
  const { map } = painter(found, zoom, 0, language)
  try {
    const house = layout.houses.find(h => h.type === 'sleeping-house')!, name = language === 'en' ? house.label : house.zh
    const drawn = texts.filter(t => t.value === name)
    expect(drawn, `${name} drawn once`).toHaveLength(1)
    const box = boxes.find(b => b.x <= drawn[0]!.x && drawn[0]!.x <= b.x + b.width && b.y <= drawn[0]!.y && drawn[0]!.y <= b.y + b.height)!
    expect(box, 'the name stands on its own box').toBeDefined()
    const gap = 2 / zoom
    expect(box.x + box.width >= house.x - gap && box.x <= house.x + house.width + gap && box.y + box.height >= house.y - gap && box.y <= house.y + house.height + gap, 'the box touches the house').toBe(true)
    expect(overlaps(box, house), 'the box leaves the house drawing clear').toBe(false)
    expect(layout.rooms.filter(room => overlaps(box, room)).map(room => room.id)).toEqual([])
  } finally { map.dispose() }
})

it('keeps the hall of 13\'s whole name in view, and its sign above its own house, in the square view at 390 px, where the view starts inside the hall', () => {
  const found = example(13), { layout } = found, bounds = layout.bounds, square = layout.square
  const zoom = Math.min(1, (362 - 24) / (square.width + 80))
  const scrollLeft = (square.x + square.width / 2 - bounds.x) * zoom - 362 / 2
  const { map, inner } = painter(found, zoom, scrollLeft)
  try {
    const left = inner.actualCamera().left, hall = layout.houses.find(h => h.occupants.length === 13)!
    expect(hall.x < left && left < hall.x + hall.width, 'the view starts inside the hall').toBe(true)
    const sign = texts.filter(t => t.value.endsWith(' · 13'))
    expect(sign, 'the hall sign drawn once').toHaveLength(1)
    expect(sign[0]!.x, 'the sign text starts inside the view').toBeGreaterThanOrEqual(left)
    expect(sign[0]!.value, 'the sign holds the hall\'s whole name and its count').toBe(`${hall.label} · 13`)
    // A canvas narrows a text wider than the width it is given, so the name ends within that width.
    expect(sign[0]!.maxWidth, 'the sign gives its text a width').toBeDefined()
    expect(sign[0]!.x + Math.min(sign[0]!.width, sign[0]!.maxWidth!), 'the hall\'s whole name ends inside the view').toBeLessThanOrEqual(left + 362 / zoom)
    const box = boxes.find(b => b.y < sign[0]!.y && sign[0]!.y <= b.y + b.height && b.x <= sign[0]!.x && sign[0]!.x <= b.x + b.width)!
    expect(box.x, 'the sign stays above its own house').toBeGreaterThanOrEqual(hall.x)
    expect(box.x + box.width, 'the sign stays above its own house').toBeLessThanOrEqual(hall.x + hall.width + 1e-9)
    // The sign starts in view, unless the end of its house pushes it out, as here by 13 of 568 px.
    if (box.x < left) expect(box.x + box.width).toBeCloseTo(hall.x + hall.width, 6)
  } finally { map.dispose() }
})

it('moves the hall sign with a scroll that the drawn surface still holds, and draws it again', () => {
  fakeChannel()
  const found = example(13), { layout } = found, bounds = layout.bounds, square = layout.square
  const zoom = Math.min(1, (362 - 24) / (square.width + 80))
  const { map, inner, view, camera } = painter(found, zoom, 0)
  try {
    const hall = layout.houses.find(h => h.occupants.length === 13)!
    expect(texts.filter(t => t.value.endsWith(' · 13'))[0]!.x, 'first drawn at the left end of the hall').toBeCloseTo(hall.x + 8 / zoom, 6)
    // The surface holds the whole map, so the scroll below needs no new surface.
    Object.assign(inner, { signature: JSON.stringify([camera, zoom, 1]), camera })
    texts.length = 0; boxes.length = 0
    view.scrollLeft = (square.x + square.width / 2 - bounds.x) * zoom - 362 / 2
    view.dispatchEvent(new Event('scroll'))
    vi.runAllTimers()
    const left = inner.actualCamera().left
    expect(hall.x < left && left < hall.x + hall.width, 'the view starts inside the hall').toBe(true)
    const sign = texts.filter(t => t.value.endsWith(' · 13'))
    expect(sign.length, 'the hall sign drawn again').toBeGreaterThan(0)
    expect(sign.at(-1)!.x, 'the sign text starts inside the view').toBeGreaterThanOrEqual(left)
  } finally { map.dispose() }
})

it('draws no blank house sign in the square view at 1440 px, where the view starts near the right end of the sleeping house', () => {
  const found = example(13), { layout } = found, bounds = layout.bounds, square = layout.square, size = { width: 1388, height: 756 }
  const zoom = Math.min(1, (size.width - 24) / (square.width + 80))
  const scrollLeft = (square.x + square.width / 2 - bounds.x) * zoom - size.width / 2
  const { map, inner } = painter(found, zoom, scrollLeft, 'en', size)
  try {
    const left = inner.actualCamera().left, house = layout.houses.find(h => h.type === 'sleeping-house')!
    expect(house.x < left && house.x + house.width - left < houseSign(layout, house, zoom).width, 'less of the house is in view than its sign is wide').toBe(true)
    // A sign box that reaches into the view carries a name that starts inside the view.
    const blank = boxes.filter(b => b.x < left && left < b.x + b.width && !texts.some(t => left <= t.x && t.x <= b.x + b.width && b.y < t.y && t.y <= b.y + b.height))
    expect(blank, 'sign boxes in view with no name in view').toEqual([])
  } finally { map.dispose() }
})

it('takes the sleeping house sign away when a scroll that the drawn surface still holds leaves its name out of view', () => {
  fakeChannel()
  const found = example(13), { layout } = found, bounds = layout.bounds, size = { width: 1388, height: 756 }, zoom = 1
  const house = layout.houses.find(h => h.type === 'sleeping-house')!, sign = houseSign(layout, house, zoom)
  // The view starts 2 px before the name of the sign at the right end of the house.
  const { map, inner, view, camera } = painter(found, zoom, house.x + house.width - sign.width + 8 / zoom - 2 - bounds.x, 'en', size)
  try {
    expect(texts.filter(t => t.value === house.label), 'the sign drawn first').toHaveLength(1)
    Object.assign(inner, { signature: JSON.stringify([camera, zoom, 1]), camera })
    const box = { ...sign, x: house.x + house.width - sign.width }, redrawn = vi.spyOn(inner, 'dynamic')
    texts.length = 0; boxes.length = 0
    view.scrollLeft += 100
    view.dispatchEvent(new Event('scroll'))
    vi.runAllTimers()
    const covered = redrawn.mock.calls.some(([regions]) => (regions as typeof box[]).some(r => r.x <= box.x && box.x + box.width <= r.x + r.width && r.y <= box.y && box.y + box.height <= r.y + r.height))
    expect(covered, 'the place of the sign drawn again').toBe(true)
    expect(texts.filter(t => t.value === house.label), 'the sign not drawn again').toEqual([])
  } finally { map.dispose() }
})

it('draws the middle of every mole frame solid, so a plate drawn while that middle is in view shows some of its mole', () => {
  // A frame is drawn with its anchor at the mole's point, and the middle is that many frame px above the point. The column is the
  // anchor's, or the one before it when the frame is mirrored; the row is either one the scale may round to.
  const solid = (alpha: (x: number, y: number) => number, [ax, ay]: readonly number[], height: number) =>
    [ax! - 1, ax!, ax! + 1].every(x => [ay! - height - 1, ay! - height].every(y => alpha(x, y) >= 128))
  const read = (file: string) => { const p = png(readFileSync(new URL(`../assets/${file}.png`, import.meta.url))); return (x: number, y: number) => x < 0 || y < 0 || x >= p.width || y >= p.height ? 0 : p.data[(y * p.width + x) * 4 + 3]! }
  const atlases = new Map<string, (x: number, y: number) => number>(), thin: string[] = []
  let frames = 0
  for (const [name, f] of Object.entries(catalog.sprites as Record<string, { atlas: string; rect: number[]; trim: number[]; anchor: number[] }>)) {
    if (!/^(stand|walk|wave|cheer|carry)-/.test(name)) continue
    const atlas = atlases.get(f.atlas) ?? read(f.atlas), [x0, y0, x1, y1] = f.trim as [number, number, number, number]; atlases.set(f.atlas, atlas)
    frames++; if (!solid((x, y) => x < x0 || y < y0 || x >= x1 || y >= y1 ? 0 : atlas(f.rect[0]! + x - x0, f.rect[1]! + y - y0), f.anchor, moleMiddle.awake)) thin.push(name)
  }
  for (const [name, f] of Object.entries(sleepSprites)) if (name !== 'sleep-bed') { frames++; if (!solid(read(f.atlas), f.anchor, moleMiddle.asleep)) thin.push(name) }
  // An action draws its source with the point at 231, 255 of its stage, less the stage's origin.
  for (const at of new Set(actionData.stages.filter(s => s.source !== 'stand').map(s => `${s.source} ${s.origin.join(' ')}`))) {
    const [source, x, y] = at.split(' ')
    frames++; if (!solid(read(`tuft-action-${source}`), [231 - Number(x), 255 - Number(y)], moleMiddle.awake)) thin.push(at)
  }
  expect(thin).toEqual([])
  expect(frames, 'stand, three walks, wave, cheer and carry for 19 looks; 19 sleeping looks; 7 action sources').toBe(133 + 19 + 7)
})

it('draws a plate only while the middle of its mole is in view, at each edge of the view', () => {
  const found = example(13), { layout } = found, reader = awayActor(layout), foot = layout.places!.play[0]!
  const away = (inner: any) => { inner.whereaboutsByKey = new Map([[reader, { where: 'play', index: 0 }]]) }
  let { map, inner } = viewAt(found, foot.x - 181, foot.y - 328, away)
  const middle = { x: foot.x, y: foot.y - moleMiddle.awake * inner.drawnScale(reader) }, plate: Box = inner.plates.get(reader)
  map.dispose()
  // An outdoor plate is under the feet or over the head, so an edge can fall between the plate and the middle of the mole.
  const views: [string, number, number, boolean][] = [['the whole reader in view', foot.x - 181, foot.y - 328, true],
    ['the left edge just past the middle', middle.x + 1, middle.y - 328, false], ['the right edge just before the middle', middle.x - 1 - 362, middle.y - 328, false],
    plate.y > middle.y ? ['the top edge just under the middle', middle.x - 181, middle.y + 1, false] : ['the bottom edge just over the middle', middle.x - 181, middle.y - 1 - 656, false]]
  for (const [label, left, top, readerDrawn] of views) {
    ({ map, inner } = viewAt(found, left, top, away))
    try {
      const view = inner.actualCamera()
      const middles = new Map<string, { x: number; y: number }>(inner.actors(Object.keys(layout.seats)).map((a: { key: string; point: { x: number; y: number } }) => [a.key, { x: a.point.x, y: a.point.y - moleMiddle.awake * inner.drawnScale(a.key) }]))
      const wrong = ([...inner.plates] as [string, Box][]).filter(([key, rect]) => reaches(rect, view) && drawnAt(rect) !== inside(middles.get(key)!, view)).map(([key, rect]) => `${key} ${drawnAt(rect) ? 'drawn' : 'not drawn'}`)
      expect(wrong, `${label}: plates in view drawn exactly while the middle of their mole is in view`).toEqual([])
      expect(reaches(plate, view), `${label}: the reader's plate reaches into the view`).toBe(true)
      expect(drawnAt(plate), `${label}: the reader's plate drawn`).toBe(readerDrawn)
    } finally { map.dispose() }
  }
})

it('takes a plate away when a scroll or a resize that the drawn surface still holds leaves the middle of its mole out of view, and draws it again when it comes back', () => {
  fakeChannel()
  const found = example(13), { layout } = found, bounds = layout.bounds, reader = awayActor(layout), foot = layout.places!.play[0]!
  const away = (inner: any) => { inner.whereaboutsByKey = new Map([[reader, { where: 'play', index: 0 }]]) }
  const { map, inner, view, camera } = viewAt(found, foot.x - 181, foot.y - 328, away)
  try {
    const plate: Box = inner.plates.get(reader)
    expect(drawnAt(plate), 'the plate drawn first').toBe(true)
    // The surface holds the whole map, so neither change below needs a new surface.
    Object.assign(inner, { signature: JSON.stringify([camera, 1, 1]), camera })
    const redrawn = vi.spyOn(inner, 'dynamic')
    const step = (label: string, change: () => void, drawn: boolean) => {
      plates.length = 0; redrawn.mockClear(); change(); vi.runAllTimers()
      expect(redrawn.mock.calls.some(([regions]) => (regions as Box[]).some(r => r.x <= plate.x && plate.x + plate.width <= r.x + r.width && r.y <= plate.y && plate.y + plate.height <= r.y + r.height)), `${label}: the place of the plate drawn again`).toBe(true)
      expect(drawnAt(plate), `${label}: the plate drawn`).toBe(drawn)
    }
    step('scrolled until the middle of the mole is just out on the left', () => { view.scrollLeft = foot.x + 1 - bounds.x; view.dispatchEvent(new Event('scroll')) }, false)
    step('scrolled back', () => { view.scrollLeft = foot.x - 181 - bounds.x; view.dispatchEvent(new Event('scroll')) }, true)
    step('narrowed until the middle is just out on the right', () => { view.clientWidth = 180; resized() }, false)
    step('widened again', () => { view.clientWidth = 362; resized() }, true)
  } finally { map.dispose() }
})

it('draws the plate of a mole bound to an action only while its middle at its foot is in view', () => {
  const found = example(13), { layout } = found
  // An action draws the mole at its seat's foot, and a mole bound to one stands there when the action is not drawing it.
  const key = Object.keys(layout.seats).find(key => { const seat = layout.seats[key]!; return seat.desk.width > 0 && !(seat as { cluster?: string }).cluster?.includes('/secretary-') })!
  expect(key, 'a worker at a desk').toBeDefined()
  const seat = layout.seats[key]!, first = viewAt(found, 0, 0), scale = first.inner.drawnScale(key); first.map.dispose()
  const footMiddle = seat.foot.y - moleMiddle.awake * scale, left = seat.foot.x - 181, middle = { x: seat.foot.x, y: footMiddle }
  const bind = (inner: any) => { inner.actionBindings = new Map([[key, { activity: 'desk', action: 'desk', ownerKey: key, clusterKey: key }]]) }
  let below = false
  {
    const { map, inner } = viewAt(found, left, footMiddle - 328, bind)
    try {
      const plate: Box = inner.plates.get(key), view = inner.actualCamera()
      expect(!!plate && reaches(plate, view) && inside(middle, view), 'the plate and the middle at the foot in view').toBe(true)
      expect(drawnAt(plate), 'the middle in view').toBe(true)
      below = plate.y >= footMiddle
    } finally { map.dispose() }
  }
  // The view's edge falls between the plate and the middle at the foot.
  const { map, inner } = viewAt(found, left, below ? footMiddle + 1 : footMiddle - 656, bind)
  try {
    const plate: Box = inner.plates.get(key), view = inner.actualCamera()
    expect(!!plate && reaches(plate, view) && !inside(middle, view), 'the plate in view, the middle at the foot not').toBe(true)
    expect(drawnAt(plate), 'the middle out of view').toBe(false)
  } finally { map.dispose() }
})

it('takes the middle of a sleeping mole 18 frame px above its feet', () => {
  const found = example(13), { layout } = found, place = layout.places?.sleep[0]
  expect(place, 'a sleeping place').toBeDefined()
  // A sleeping actor is away from its desk and keeps its plate near its sleeping place.
  const key = awayActor(layout), asleep = (inner: any) => { inner.whereaboutsByKey = new Map([[key, { where: 'sleep', index: 0 }]]) }
  const first = viewAt(found, 0, 0), scale = first.inner.drawnScale(key); first.map.dispose()
  // The view's top edge falls between the middles of a sleeping mole and of a standing one.
  const { map, inner } = viewAt(found, place!.x - 181, place!.y - (moleMiddle.asleep + moleMiddle.awake) / 2 * scale, asleep)
  try {
    const plate: Box = inner.plates.get(key), view = inner.actualCamera()
    expect(reaches(plate, view) && inside({ x: place!.x, y: place!.y - moleMiddle.asleep * scale }, view) && !inside({ x: place!.x, y: place!.y - moleMiddle.awake * scale }, view), 'the plate and the sleeping middle in view, the standing middle not').toBe(true)
    expect(drawnAt(plate), 'the plate drawn').toBe(true)
  } finally { map.dispose() }
})
