// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { layoutIndexes } from '../src/layout-index.ts'
import { moleMiddle, OfficeMap, releaseMapSurfaces } from '../src/map-view.ts'
import { badges } from '../src/mole-state.ts'
import { shortName } from '../src/nameplates.ts'
import { agent, people, workRow, work } from './fixtures.ts'

const finish = <T>(job: Generator<unknown, T>): T => { for (;;) { const next = job.next(); if (next.done) return next.value } }
type Box = { x: number; y: number; width: number; height: number }
type Text = { value: string; x: number; y: number; font: string; fill: string; alpha: number; maxWidth?: number }
type Round = Box & { fill: string; alpha: number }
const texts: Text[] = [], rounds: Round[] = []
const target = {
  font: '12px system-ui', fillStyle: '', globalAlpha: 1, path: null as Box | null,
  fillText(value: string, x: number, y: number, maxWidth?: number) { texts.push({ value, x, y, font: this.font, fill: this.fillStyle, alpha: this.globalAlpha, maxWidth }) },
  measureText(value: string) { return { width: [...value].reduce((n, c) => n + (c.charCodeAt(0) < 128 ? .5 : 1), 0) * parseFloat(this.font.replace('bold ', '')) } },
  beginPath() { this.path = null },
  roundRect(x: number, y: number, width: number, height: number) { this.path = { x, y, width, height } },
  fill() { if (this.path) rounds.push({ ...this.path, fill: this.fillStyle, alpha: this.globalAlpha }); this.path = null },
  getImageData: () => ({ data: new Uint8Array(4) }), createPattern: () => null,
}
const context = new Proxy(target, { get: (a, k) => Reflect.get(a, k) ?? (() => {}) })
class Node extends EventTarget {
  dataset = {}; style = {}; width = 362; height = 656; clientWidth = 362; clientHeight = 656
  scrollLeft = 0; scrollTop = 0; children: Node[] = []
  append(...nodes: Node[]) { this.children.push(...nodes) }; replaceChildren(...nodes: Node[]) { this.children = nodes }
  getContext() { return context }; setAttribute() {}; remove() {}; querySelector() { return null }; querySelectorAll() { return [] }
}
const details = ['executing', 'waiting_check', 'queued', 'paused', 'blocked', 'completed', 'work_open'] as const
const groups = ['working', 'handoff', 'waiting', 'paused', 'attention', 'completed', 'unknown'] as const
function fixture(count = 7) {
  const agents = Array.from({ length: count }, (_, i) => agent(`member-${i}`, { name: `Member ${i}` }))
  const rows = agents.map((a, i) => workRow(`row-${i}`, { agent: a.id, detail: details[i % details.length], runStanding: details[i % details.length] === 'completed' ? 'closed' : 'working' }))
  const model = mapOffice({ ...people, agents }, { ...work, work: rows })
  return { model, layout: finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })) }
}
function painter(found: ReturnType<typeof fixture>, size = { width: 362, height: 656 }, left?: number, top?: number) {
  vi.stubGlobal('document', { createElement: () => new Node() }); vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  const view = new Node(), map = new OfficeMap(view as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {}), inner = map as any
  const { layout, model } = found, bounds = layout.bounds, camera = { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }
  Object.assign(view, { clientWidth: size.width, clientHeight: size.height, scrollLeft: (left ?? bounds.x) - bounds.x, scrollTop: (top ?? bounds.y) - bounds.y })
  Object.assign(inner, { layout, model, camera, zoom: 1, padding: { x: Math.max(0, (size.width - bounds.width) / 2), y: Math.max(0, (size.height - bounds.height) / 2) }, occupants: new Map(model.occupants.map(o => [o.key, o])), ...finish(layoutIndexes(layout)) })
  inner.options.workAvailable = true
  texts.length = 0; rounds.length = 0
  return { map, inner, view, camera }
}
const within = (t: Text, b: Box) => t.x >= b.x && t.x <= b.x + b.width && t.y >= b.y && t.y <= b.y + b.height
const bubbles = () => rounds.filter(r => r.height === 17 || r.height === 19)
afterEach(() => { releaseMapSurfaces(); vi.unstubAllGlobals(); texts.length = 0; rounds.length = 0 })

it.each([
  ['worker', 'Wo', '工'], ['inspector', 'In', '检'], ['secretary', 'Se', '秘'], ['supervisor', 'Su', '主'], [null, '?', '?'], ['unexpected', '?', '?'],
] as const)('draws a one-line tag for role %s in each language', (role, en, zh) => {
  const found = fixture(1), { map, inner } = painter(found), occupant = found.model.occupants[0]!, key = occupant.key
  try {
    occupant.agent.role = role
    inner.moleMiddles = new Map([[key, [{ x: 150, y: 130 }]]])
    const slot = { x: 100, y: 200, width: 100, height: 28 }
    for (const [language, mark] of [['en', en], ['zh', zh]] as const) {
      inner.options.language = language; texts.length = 0; rounds.length = 0
      inner.nameplate(context, key, slot)
      const tags = rounds.filter(r => r.height === 16)
      expect(tags).toHaveLength(1)
      const tag = tags[0]!
      expect(tag.y).toBe(slot.y + 2); expect(tag.x).toBeGreaterThanOrEqual(slot.x)
      expect(tag.x + tag.width).toBeLessThanOrEqual(slot.x + slot.width)
      expect(tag.x + tag.width / 2).toBeCloseTo(slot.x + slot.width / 2)
      const inside = texts.filter(t => within(t, tag))
      expect(inside.map(t => t.value)).toEqual([mark, shortName(occupant.agent.name)])
      expect(inside[0]!.y).toBe(inside[1]!.y)
      expect(inside.every(t => t.maxWidth === undefined)).toBe(true)
      expect(inside[0]!.font).toBe('9px system-ui'); expect(inside[1]!.font).toBe('11px system-ui')
    }
  } finally { map.dispose() }
})

it('paints one bubble above each shown mole and its state symbol', () => {
  const found = fixture(6), { map, inner, camera } = painter(found, { width: 5000, height: 5000 })
  try {
    finish(inner.paintSteps(camera))
    const shown = [...inner.plates.keys()].filter(key => inner.plateShown(key)) as string[]
    expect(shown).toHaveLength(6); expect(bubbles()).toHaveLength(shown.length)
    for (const key of shown) {
      const o = found.model.occupants.find(o => o.key === key)!, index = Number(o.agent.id.split('-').at(-1))
      const middle = inner.moleMiddles.get(key)[0], head = middle.y - moleMiddle.awake * inner.drawnScale(key) - 3
      const bubble = bubbles().filter(b => Math.abs(b.x + b.width / 2 - middle.x) < 1 && b.y + b.height + 4 <= head + 1).sort((a, b) => (b.y + b.height) - (a.y + a.height))[0]!
      expect(bubble, key).toBeDefined()
      expect(texts.some(t => t.value === badges[groups[index]!].symbol && within(t, bubble))).toBe(true)
    }
  } finally { map.dispose() }
})

it.each(['light', 'dark'] as const)('uses solid attention and waiting bubbles and plain bubbles for the other groups in %s', theme => {
  const found = fixture(), { map, inner } = painter(found)
  try {
    inner.options.theme = theme
    for (let i = 0; i < groups.length; i++) {
      const occupant = found.model.occupants.find(o => o.agent.id === `member-${i}`)!, key = occupant.key, group = groups[i]!
      inner.moleMiddles = new Map([[key, [{ x: 150, y: 130 }]]]); texts.length = 0; rounds.length = 0
      inner.nameplate(context, key, { x: 100, y: 200, width: 100, height: 28 })
      const bubble = bubbles()[0]!, solid = group === 'attention' || group === 'waiting'
      expect(bubble.height).toBe(solid ? 19 : 17)
      expect(bubble.fill).toBe(solid ? badges[group].colour : theme === 'dark' ? '#25372b' : '#fffdf5')
      const symbol = texts.find(t => t.value === badges[group].symbol && within(t, bubble))!
      expect(symbol.fill).toBe(solid ? '#ffffff' : badges[group].colour)
      expect(symbol.font).toBe(`bold ${solid ? 13 : 12}px system-ui`)
    }
  } finally { map.dispose() }
})

it('shows names and symbols without a pointer at the 390 px view', () => {
  const found = fixture(6), seat = Object.values(found.layout.seats)[0]!, { map, inner, camera } = painter(found, undefined, seat.foot.x - 181, seat.foot.y - 328)
  try {
    finish(inner.paintSteps(camera))
    const shown = [...inner.plates.keys()].filter(key => inner.plateShown(key)) as string[]
    expect(shown.length).toBeGreaterThan(0)
    for (const key of shown) {
      const occupant = found.model.occupants.find(o => o.key === key)!, index = Number(occupant.agent.id.split('-').at(-1))
      expect(texts.map(t => t.value)).toContain(shortName(occupant.agent.name))
      expect(texts.map(t => t.value)).toContain(badges[groups[index]!].symbol)
    }
  } finally { map.dispose() }
})

it('repaints the bubble as well as the slot when scrolling hides a tag', () => {
  const found = fixture(1), { map, inner, view, camera } = painter(found)
  try {
    const seat = Object.values(found.layout.seats)[0]!
    view.scrollLeft = seat.foot.x - 181 - found.layout.bounds.x; view.scrollTop = seat.foot.y - 328 - found.layout.bounds.y
    finish(inner.paintSteps(camera))
    const key = found.model.occupants[0]!.key, before = bubbles()[0]!
    expect(inner.plateShown(key)).toBe(true)
    const repaint = vi.spyOn(inner, 'dynamic').mockImplementation(() => {})
    view.scrollLeft += 1000; inner.followPlates()
    const regions = repaint.mock.calls.flatMap(call => call[0] as Box[])
    expect(regions.some((r: Box) => r.x <= before.x && r.y <= before.y && r.x + r.width >= before.x + before.width && r.y + r.height >= before.y + before.height + 4)).toBe(true)
  } finally { map.dispose() }
})

it('keeps a long name inside the slot without squeezing it', () => {
  const found = fixture(1), { map, inner } = painter(found), occupant = found.model.occupants[0]!, key = occupant.key
  try {
    occupant.agent.name = 'WWWWWWWWWWWWWWWW'
    inner.moleMiddles = new Map([[key, [{ x: 150, y: 130 }]]])
    inner.nameplate(context, key, { x: 100, y: 200, width: 100, height: 28 })
    const tag = rounds.find(r => r.height === 16)!, name = texts.filter(t => within(t, tag))[1]!
    target.font = name.font
    expect(name.value).toContain('…'); expect(name.maxWidth).toBeUndefined()
    expect(name.x + target.measureText(name.value).width).toBeLessThanOrEqual(tag.x + tag.width)
  } finally { map.dispose() }
})

it('uses the drawn point for a bound mole away from its seat and the seat foot for its action', () => {
  const found = fixture(1), { map, inner, camera } = painter(found, { width: 5000, height: 5000 }), key = found.model.occupants[0]!.key
  try {
    const seat = found.layout.seats[key]!, place = found.layout.places?.play[0]
    expect(place).toBeDefined()
    inner.actionBindings = new Map([[key, { activity: 'desk', action: 'desk', ownerKey: key, clusterKey: key }]])
    inner.whereaboutsByKey = new Map([[key, { where: 'play', index: 0 }]])
    finish(inner.paintSteps(camera))
    const first = inner.moleMiddles.get(key)
    expect(first).toHaveLength(2); expect(first[0].x).toBe(place!.x)
    expect(first[1].x).toBe(seat.foot.x)
    expect(bubbles().some(b => Math.abs(b.x + b.width / 2 - first[0].x) < 1 && b.y + b.height < first[0].y)).toBe(true)
    inner.whereaboutsByKey = new Map([[key, { where: 'desk' }]]); texts.length = 0; rounds.length = 0
    finish(inner.paintSteps(camera))
    const atDesk = inner.moleMiddles.get(key)
    expect(atDesk[0].x).toBe(seat.foot.x); expect(atDesk[0].y).toBe(atDesk[1].y)
    expect(bubbles().some(b => Math.abs(b.x + b.width / 2 - atDesk[1].x) < 1 && b.y + b.height < atDesk[1].y)).toBe(true)
  } finally { map.dispose() }
})
