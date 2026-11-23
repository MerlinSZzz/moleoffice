// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { whereabouts, whereaboutsPoint, type Whereabouts } from '../src/ownership.ts'
import { stableHash } from '../src/village.ts'
import type { Layout, Point } from '../src/geometry.ts'
import { OfficeMap, releaseMapSurfaces, type MapOptions } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { VisibleIndex } from '../src/render-plan.ts'
import { actorRect } from '../src/layout-index.ts'
import { agent, people } from './fixtures.ts'
import type { Rect } from '../src/viewport.ts'
import { words } from '../src/words.ts'

const key = (id: string) => JSON.stringify(['agent', id])
const byId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
const at = (found: Map<string, Whereabouts>, id: string): Whereabouts | undefined => found.get(id)

describe('an offline agent is not drawn unless it is one of the few', () => {
  it('describes the static outdoor figures without claiming an animation, and counts retired agents among those not drawn', () => {
    expect(words.en.offlineOutside).toContain('drawn outside: {count}')
    expect(words.zh.offlineOutside).toContain('画在外面的：{count}')
    expect(words.en.offlineHidden).toContain('Offline or retired, not drawn: {count}')
    expect(words.zh.offlineHidden).toContain('离线或已退役、未画出的：{count}')
  })
  it('draws the three lowest-hash offline agents outside and hides the rest, the same way every time', () => {
    const offline = Array.from({ length: 10 }, (_, index) => `offline-${index}`)
    const onlineIds = ['online-a', 'online-b']
    const agents = [...offline, ...onlineIds].map(id => ({ id, retired: false }))
    const online = new Map<string, boolean>([...offline.map(id => [id, false] as const), ...onlineIds.map(id => [id, true] as const)])
    const expected = [...offline].sort((a, b) => stableHash(a) - stableHash(b) || byId(a, b)).slice(0, 3)
    expect(new Set(expected).size).toBe(3)

    const first = whereabouts(agents, online, new Set(), { play: 3, sleep: 0 })
    expect(first.size).toBe(agents.length)
    for (const [index, id] of expected.entries()) expect(at(first, id)).toEqual({ where: 'play', index })
    for (const id of offline.filter(id => !expected.includes(id))) expect(at(first, id)).toEqual({ where: 'hidden' })
    for (const id of onlineIds) expect(at(first, id)).toEqual({ where: 'desk' })

    const again = whereabouts(agents, online, new Set(), { play: 3, sleep: 0 })
    expect(again).toEqual(first)

    const above = onlineIds.find(id => stableHash(id) > stableHash(expected[2]!))
    expect(above, 'the chosen online agent hashes above the three').toBeDefined()
    const changed = new Map(online)
    changed.set(above!, false)
    const third = whereabouts(agents, changed, new Set(), { play: 3, sleep: 0 })
    for (const [index, id] of expected.entries()) expect(at(third, id)).toEqual({ where: 'play', index })
  })
})

describe('a sleeping agent is in the sleeping house', () => {
  it('puts every sleeper on a sleeping place in id order', () => {
    const sleepingHouse = { x: 100, y: 100, width: 200, height: 120 }
    const sleep = [{ x: 150, y: 160 }, { x: 200, y: 170 }, { x: 250, y: 170 }]
    const layout = {
      key: 'sleeping-house', bounds: { x: 0, y: 0, width: 500, height: 500 }, rooms: [], seats: {},
      obstacles: [], road: { halfWidth: 0, rings: [], ends: [], faults: [] }, bodyRadius: 1,
      houses: [], square: { x: 0, y: 0, width: 1, height: 1 }, pieces: [],
      places: { sleepingHouse, sleep, play: [{ x: 10, y: 10 }] },
    } as unknown as Layout
    const agents = [
      { id: 'sleeper-b', retired: false }, { id: 'sleeper-a', retired: false },
      { id: 'sleeper-c', retired: false }, { id: 'awake', retired: false },
    ]
    const found = whereabouts(agents, new Map([['awake', true]]), new Set(['sleeper-b', 'sleeper-a', 'sleeper-c']), { play: 3, sleep: sleep.length })
    expect(at(found, 'sleeper-a')).toEqual({ where: 'sleep', index: 0 })
    expect(at(found, 'sleeper-b')).toEqual({ where: 'sleep', index: 1 })
    expect(at(found, 'sleeper-c')).toEqual({ where: 'sleep', index: 2 })
    expect(at(found, 'awake')).toEqual({ where: 'desk' })
    for (const id of ['sleeper-a', 'sleeper-b', 'sleeper-c']) {
      const point = whereaboutsPoint(layout, key(id), at(found, id)!)!
      expect(point.x).toBeGreaterThanOrEqual(sleepingHouse.x)
      expect(point.y).toBeGreaterThanOrEqual(sleepingHouse.y)
      expect(point.x).toBeLessThanOrEqual(sleepingHouse.x + sleepingHouse.width)
      expect(point.y).toBeLessThanOrEqual(sleepingHouse.y + sleepingHouse.height)
    }
  })
})

describe('a retired agent is never drawn', () => {
  it('hides a retired agent online, offline with the lowest hash, and asleep', () => {
    const agents = [
      { id: 'retired-online', retired: true }, { id: '0-retired', retired: true },
      { id: 'retired-asleep', retired: true }, { id: 'worker', retired: false },
    ]
    const online = new Map([['retired-online', true], ['0-retired', false], ['retired-asleep', false], ['worker', false]])
    expect(stableHash('0-retired')).toBeLessThan(stableHash('worker'))
    const found = whereabouts(agents, online, new Set(['retired-asleep']), { play: 3, sleep: 3 })
    for (const id of ['retired-online', '0-retired', 'retired-asleep']) expect(at(found, id)).toEqual({ where: 'hidden' })
    expect(at(found, 'worker')).toEqual({ where: 'play', index: 0 })
  })
})

describe('the online read not loaded', () => {
  it('puts every non-retired agent at its desk', () => {
    const agents = [{ id: 'a', retired: false }, { id: 'b', retired: false }, { id: 'retired', retired: true }]
    const found = whereabouts(agents, null, new Set(), { play: 3, sleep: 3 })
    expect(at(found, 'a')).toEqual({ where: 'desk' })
    expect(at(found, 'b')).toEqual({ where: 'desk' })
    expect(at(found, 'retired')).toEqual({ where: 'hidden' })
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
afterEach(() => { releaseMapSurfaces(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('an agent away from its desk is drawn where it is', () => {
  it('draws a sleeper in the sleeping house with both desks off screen, and locates it at its sleep point', () => {
    documentStub()
    const hooks: { hold: boolean; selection: string[]; candidates?: string[] } = { hold: false, selection: [] }
    ;(window as unknown as { __officeMapScreenTest: typeof hooks }).__officeMapScreenTest = hooks
    const sleeper = key('sleeper'), awake = key('awake'), hidden = key('hidden')
    const sleepPoint = { x: 24, y: 36 }, sleepingHouse = { x: 0, y: 0, width: 90, height: 70 }
    const layout = {
      key: 'away-from-desk', bounds: { x: 0, y: 0, width: 2000, height: 2000 }, rooms: [], seats: {
        [sleeper]: { foot: { x: 1200, y: 1200 } },
        [awake]: { foot: { x: 1600, y: 1600 } },
        [hidden]: { foot: { x: 1400, y: 1400 } },
      }, obstacles: [], road: { halfWidth: 0, rings: [], ends: [], faults: [] }, bodyRadius: 1,
      houses: [], square: { x: 0, y: 0, width: 1, height: 1 }, pieces: [],
      places: { sleepingHouse, sleep: [sleepPoint], play: [] },
    } as unknown as Layout
    const model = mapOffice({ ...people, agents: [agent('sleeper'), agent('awake'), agent('hidden')] }, null)
    const options = { project: null, search: '', language: 'en', theme: 'light', selected: null, workAvailable: false, still: true, wave: null, online: new Map([['sleeper', true], ['awake', true], ['hidden', false]]), asleep: new Set(['sleeper']), asleepMadeUp: false } as MapOptions
    const selections: string[][] = [], view = new Node()
    const map = new OfficeMap(view as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {}, ids => { selections.push(ids) })
    const inner = map as unknown as { indexedLayout: Layout; seats: VisibleIndex<string>; frame: HTMLCanvasElement; padding: { x: number; y: number }; zoom: number
      dynamicSteps(regions: Rect[], targets?: boolean): Generator<void, boolean> }
    inner.indexedLayout = layout
    vi.spyOn(map as unknown as { paint(): void }, 'paint').mockImplementation(() => {})
    vi.spyOn(map as unknown as { dynamic(regions: Rect[]): void }, 'dynamic').mockImplementation(() => {})
    map.update(layout, model, options, null)
    const fillText = vi.fn()
    const labelContext = { fillRect: vi.fn(), fillText, beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), measureText: (_value: string) => ({ width: 0 }) } as unknown as CanvasRenderingContext2D
    const plate = map as unknown as { nameplate(ctx: CanvasRenderingContext2D, key: string, rect: Rect): void }
    // A sleeper the office's asleep read named is plainly asleep; only a picture seam's sleeper is made up.
    plate.nameplate(labelContext, sleeper, { x: 0, y: 0, width: 100, height: 32 })
    expect(fillText.mock.calls.map(call => call[0])).toContain(words.en.asleepPlate)
    expect(fillText.mock.calls.map(call => call[0])).not.toContain(words.en.madeUpSleep)
    fillText.mockClear(); map.update(layout, model, { ...options, asleepMadeUp: true }, null)
    plate.nameplate(labelContext, sleeper, { x: 0, y: 0, width: 100, height: 32 })
    expect(fillText.mock.calls.map(call => call[0])).toContain(words.en.madeUpSleep)
    map.update(layout, model, options, null)
    inner.seats = new VisibleIndex([sleeper, awake].map(value => ({ value, rect: actorRect(layout.seats[value]!.foot) })))
    inner.frame = (map as unknown as { canvas: HTMLCanvasElement }).canvas
    Object.assign(map, { camera: { left: 0, top: 0, width: 100, height: 100 }, individuals: true, zoom: 1 })
    const drawn: { key: string; point: Point }[] = []
    vi.spyOn(map as unknown as { actor(ctx: CanvasRenderingContext2D, key: string, point: Point): void }, 'actor').mockImplementation((_ctx, key, point) => { drawn.push({ key, point }) })

    const step = inner.dynamicSteps([{ x: 0, y: 0, width: 100, height: 100 }], true)
    for (;;) if (step.next().done) break

    expect(drawn).toContainEqual({ key: sleeper, point: sleepPoint })
    expect((map as unknown as { targets: Node }).targets.children.filter(node => node.className === 'map-person').map(node => node.dataset['key'])).toEqual([sleeper])
    expect(hooks.candidates).toContain(sleeper)

    expect(map.drawnPoint(hidden)).toBeNull()
    view.scrollLeft = 111; view.scrollTop = 222
    map.locate(hidden)
    expect([view.scrollLeft, view.scrollTop]).toEqual([111, 222])

    expect(map.drawnPoint(sleeper)).toEqual(sleepPoint)
    map.locate(sleeper)
    expect(view.scrollLeft).toBe((sleepPoint.x - layout.bounds.x) * inner.zoom + inner.padding.x - view.clientWidth / 2)
    expect(view.scrollTop).toBe((sleepPoint.y - layout.bounds.y) * inner.zoom + inner.padding.y - view.clientHeight / 2)
    map.dispose()
  })
})
