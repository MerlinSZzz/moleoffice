// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { OfficeMap, releaseMapSurfaces, type MapOptions } from '../src/map-view.ts'
import type { Layout } from '../src/geometry.ts'
import type { OfficeModel } from '../src/model.ts'

class Element extends EventTarget {
  dataset: Record<string, string> = {}
  style = {}
  width = 800
  height = 600
  className = ''
  removed = false
  children: Element[] = []
  append(...children: Element[]) { this.children.push(...children) }
  setAttribute() {}
  remove() { this.removed = true }
}

afterEach(() => { releaseMapSurfaces(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('closes during a partial index build, releases the layout and listeners, and cancels all later work', () => {
  vi.useFakeTimers()
  const elements: Element[] = [], disconnected = vi.fn()
  const ports: { onmessage: (() => void) | null; close: () => void }[] = []
  vi.stubGlobal('MessageChannel', class {
    private timer: ReturnType<typeof setTimeout> | null = null
    port1 = { onmessage: null as (() => void) | null, close: vi.fn(() => { if (this.timer !== null) clearTimeout(this.timer) }) }
    port2 = { postMessage: () => { this.timer = setTimeout(() => this.port1.onmessage?.(), 0) }, close: vi.fn() }
    constructor() { ports.push(this.port1, { onmessage: null, close: this.port2.close }) }
  })
  vi.stubGlobal('document', { createElement: () => { const node = new Element(); elements.push(node); return node } })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnected })
  const view = new Element(), pin = vi.fn(), inspect = vi.fn(), viewport = vi.fn(), manual = vi.fn()
  const map = new OfficeMap(view as unknown as HTMLElement, pin, inspect, viewport, manual)
  const layout = { seats: {}, pieces: [{ x: 0, y: 0, width: 256 * 1000, height: 256 * 1000 }], houses: [], roadDrawing: [] } as unknown as Layout
  map.update(layout, { occupants: [], rooms: [] } as unknown as OfficeModel, {} as MapOptions, null)
  expect(vi.getTimerCount()).toBe(1)
  vi.advanceTimersToNextTimer()
  expect(vi.getTimerCount()).toBe(1)
  map.dispose(); releaseMapSurfaces()
  expect(vi.getTimerCount()).toBe(0)
  expect(disconnected).toHaveBeenCalledOnce()
  expect(map).toMatchObject({ pending: null, indexes: null, indexedLayout: null, layout: null, model: null, pack: null, firstPaint: null })
  expect(map).toMatchObject({ indexBuild: { work: null, done: null, timer: null, channel: null }, releases: [] })
  expect(ports.every(port => vi.mocked(port.close).mock.calls.length === 1 && port.onmessage === null)).toBe(true)
  expect(elements.filter(node => node.width === 1 && node.height === 1)).toHaveLength(2)
  view.dispatchEvent(new Event('scroll')); view.dispatchEvent(new Event('wheel'))
  expect(viewport).not.toHaveBeenCalled(); expect(manual).not.toHaveBeenCalled()
  vi.runAllTimers(); map.dispose()
  expect(disconnected).toHaveBeenCalledOnce()
  const preview = new OfficeMap(view as unknown as HTMLElement, pin, inspect, viewport, manual)
  preview.update({ ...layout, bounds: { x: 0, y: 0, width: 1000, height: 1000 }, preview: true }, { occupants: [], rooms: [] } as unknown as OfficeModel, {} as MapOptions, null)
  expect(vi.getTimerCount()).toBe(1)
  preview.dispose()
  expect(vi.getTimerCount()).toBe(0)
  expect(preview).toMatchObject({ firstPaint: null, preparingPreview: false, layout: null, model: null })
  expect(disconnected).toHaveBeenCalledTimes(2)
})
