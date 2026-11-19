// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { bindActions } from '../src/action-binding.ts'
import { portraitOf } from '../src/appearance.ts'
import type { Layout } from '../src/geometry.ts'
import type { Occupant, OfficeModel } from '../src/model.ts'
import { OfficeMap, releaseMapSurfaces, type MapOptions } from '../src/map-view.ts'
import { workRow } from './fixtures.ts'

const key = '["agent","made-offline-tuft"]'
const actor = {
  key,
  agent: { id: 'made-offline-tuft', name: 'Made-up offline mole', handle: 'made-offline-tuft', appearance: null, retired: false, scale: null, projects: [] },
  standing: { look: 'tuft', source: 'stable-fallback', recipe: 0 },
  portrait: portraitOf(null), projects: [], work: [],
} as unknown as Occupant
const model = { occupants: [actor], rosterOrder: [actor.agent.id], rooms: [], layoutRoster: { people: [], groups: [] } } as unknown as OfficeModel
actor.work = [workRow('made-completed', { agent: actor.agent.id, detail: 'completed', executing: false, runStanding: 'closed' })]
actor.facts = { people: { status: 'loaded', value: actor.agent, error: null, revision: 1, pending: false }, work: { status: 'loaded', value: actor.work, error: null, revision: 1, pending: false } } as Occupant['facts']
const layout = {
  key: 'made-offline-actions', ownership: true, preview: false, bounds: { x: 0, y: 0, width: 2200, height: 1800 },
  seats: { [key]: { room: 'made-room', index: 0, foot: { x: 420, y: 500 }, talk: { x: 388, y: 516 },
    desk: { x: 300, y: 372, width: 144, height: 73 }, stool: { x: 372, y: 508, width: 24, height: 16 }, activity: 'desk', cluster: 'made-desk' } },
  pieces: [{ sprite: 'worker-desk', x: 300, y: 372, width: 144, height: 73, depth: 445, layer: 'object', group: null }],
  houses: [], rooms: [], road: { rings: [] }, square: { x: 0, y: 0, width: 2200, height: 1800 }, obstacles: [],
} as unknown as Layout

it('binds the desk action for the same Tuft agent at its desk', () => {
  expect(bindActions(layout, model).bindings.has(key)).toBe(true)
})

it('does not bind a desk action for an agent the map draws away from its desk', () => {
  expect(bindActions(layout, model, new Set(), new Set([key])).bindings.has(key)).toBe(false)
})

class Node extends EventTarget {
  dataset: Record<string, string> = {}; style = {}; children: Node[] = []; textContent = ''; className = ''
  append(...nodes: Node[]) { this.children.push(...nodes) }
  replaceChildren(...nodes: Node[]) { this.children = nodes }
  remove() {}
  setAttribute() {}
  getContext() { return null }
  getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 100, left: 0, top: 0, right: 100, bottom: 100 } }
}
function documentStub() {
  vi.stubGlobal('document', { createElement: () => new Node(), createTextNode: (text: string) => Object.assign(new Node(), { textContent: text }) })
  vi.stubGlobal('window', { devicePixelRatio: 1 }); vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
}
const maps: OfficeMap[] = []
afterEach(() => { for (const map of maps.splice(0)) map.dispose(); releaseMapSurfaces(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function mapWith(online: Map<string, boolean>) {
  documentStub()
  const map = new OfficeMap(new Node() as unknown as HTMLElement, () => {}, () => {}, () => {}, () => {}, () => {})
  maps.push(map)
  vi.spyOn(map as unknown as { paint(): void }, 'paint').mockImplementation(() => {})
  map.update(layout, model, { project: null, search: '', language: 'en', theme: 'light', selected: null, workAvailable: true, still: true, wave: null, online, asleep: new Set() } as MapOptions, null)
  return map
}

it('binds the desk action through OfficeMap.update for the same agent when the office says it is online', () => {
  const map = mapWith(new Map([[actor.agent.id, true]]))
  expect((map as unknown as { actionBindings: Map<string, unknown> }).actionBindings.has(key)).toBe(true)
  expect((map as unknown as { bindingLayout: Layout }).bindingLayout.pieces.some(piece => (piece as typeof piece & { contactSize?: unknown }).contactSize)).toBe(true)
  map.dispose()
})

it('binds no desk action or action motion bounds through OfficeMap.update when the office says the agent is offline', () => {
  const map = mapWith(new Map([[actor.agent.id, false]]))
  expect((map as unknown as { actionBindings: Map<string, unknown> }).actionBindings.has(key)).toBe(false)
  expect((map as unknown as { bindingLayout: Layout }).bindingLayout.pieces.some(piece => (piece as typeof piece & { contactSize?: unknown }).contactSize)).toBe(false)
  map.dispose()
})
