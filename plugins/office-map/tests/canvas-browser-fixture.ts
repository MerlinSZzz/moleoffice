// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { OfficeMap, type MapOptions } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import type { Layout } from '../src/geometry.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { agent, people } from './fixtures.ts'

const finish = <T>(g: Generator<unknown, T>): T => { for (;;) { const n = g.next(); if (n.done) return n.value } }

/** Generated world; the production map, scheduler and CSS handle all input and drawing. */
export function installCanvasFixture() {
  const view = document.querySelector<HTMLElement>('.map-viewport')!, selected: string[] = [], facts: string[][] = []
  const model = mapOffice({ ...people, people: [], agents: [agent('generated')] }, null)
  const key = model.occupants[0]!.key
  const layout = { key: 'generated-canvas', bounds: { x: 0, y: 0, width: 5000, height: 4000 }, houses: [], rooms: [],
    square: { x: 0, y: 0, width: 1, height: 1 }, road: { rings: [] }, planting: [],
    pieces: Array.from({ length: 400 }, (_, i) => ({ sprite: 'worker-desk', x: i % 20 * 220, y: Math.floor(i / 20) * 180,
      width: 100, height: 60, group: 'generated', layer: 'floor', depth: i })),
    seats: { [key]: { foot: { x: 1000, y: 900 }, desk: { x: 950, y: 800, width: 100, height: 60 } } },
  } as unknown as Layout
  const world: { layout: Layout | null; model: any } = { layout: null, model: null }
  const options: MapOptions = { project: null, search: '', language: 'en', theme: 'light', selected: null, workAvailable: false, still: true, wave: null }
  const labels: string[] = [], namesLeftOut: boolean[] = []
  const fillText = CanvasRenderingContext2D.prototype.fillText
  CanvasRenderingContext2D.prototype.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
    if (this.canvas === view.querySelector('canvas')) labels.push(text)
    return fillText.call(this, text, x, y, maxWidth)
  }
  const map = new OfficeMap(view, id => selected.push(id), () => {}, () => {}, () => {}, ids => facts.push(ids), { namesChanged: leftOut => namesLeftOut.push(leftOut) })
  map.update(layout, model, options, null)
  let tick = 0, id = 0
  const turns = new Map<number, () => void>()
  const fixture = {
    map, view, selected, facts, layout, key, labels, namesLeftOut, world,
    ownership(roster: any) {
      const owner = mapOffice({ ...roster, interface: 'office-read/1' }, null)
      const built = finish(new OwnershipGeometryCache().build({ rooms: owner.rooms, roster: owner.layoutRoster }))
      world.layout = built; world.model = owner
      map.update(built, owner, { ...options, language: 'en', theme: 'light' }, null)
      map.fit()
    },
    setTheme(theme: 'light' | 'dark') { if (world.layout && world.model) map.update(world.layout, world.model, { ...options, theme }, null) },
    centerOn(x: number, y: number) { (map as any).center({ x, y }) },
    areaNames() { const canvas = view.querySelector('canvas')!; return (map as any).areaNames(canvas.getContext('2d')!) },
    hold() {
      for (const build of ['painting', 'dynamics'] as const) Object.assign((map as any)[build], {
        now: () => (tick += 3), later: (fn: () => void) => { turns.set(++id, fn); return id }, clear: (n: number) => turns.delete(n),
      })
    },
    pending: () => turns.size,
    advance(count = 1) { for (let i = 0; i < count && turns.size; i++) { const [n, fn] = turns.entries().next().value!; turns.delete(n); fn() } },
    flush() { for (let i = 0; i < 20000 && turns.size; i++) fixture.advance() },
    change() { map.animate([]) },
    dense(count: number) {
      const keys = Array.from({ length: count }, (_, i) => 'generated-' + i)
      const occupants = keys.map(key => ({ ...model.occupants[0]!, key, agent: { ...model.occupants[0]!.agent, id: key } }))
      const dense = { ...layout, key: 'dense-' + count, seats: Object.fromEntries(keys.map((key, i) => [key, { ...layout.seats[fixture.key]!, foot: { x: 960 + i % 10, y: 880 + Math.floor(i / 10) } }])) }
      map.update(dense, { ...model, occupants }, options, null)
    },
    sample() {
      const canvas = view.querySelector('canvas')!, ctx = canvas.getContext('2d')!, pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let hash = 2166136261, clear = 0
      for (let i = 0; i < pixels.length; i += 4) { hash = Math.imul(hash ^ pixels[i]!, 16777619); if (pixels[i + 3] !== 255) clear++ }
      return { hash: hash >>> 0, clear, width: canvas.width, height: canvas.height, left: canvas.style.left, top: canvas.style.top }
    },
  }
  return fixture
}
export type CanvasFixture = ReturnType<typeof installCanvasFixture>
