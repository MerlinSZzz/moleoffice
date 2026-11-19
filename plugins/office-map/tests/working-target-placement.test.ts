// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { mapFixture } from './tuft-action-map-fixture.ts'
import { workRow } from './fixtures.ts'
import { atDesk } from '../src/desk-things.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { flush } from './tuft-action-fixture.ts'

afterEach(async () => { pageActionPacks.setNeeds([]); await flush(); releaseMapSurfaces(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

it.each([['waiting_check', false], ['waiting_check', true], ['executing', false], ['executing', true]] as const)('places the interactive target on the drawn working mole: %s, foot beside desk %s', async (detail, beside) => {
  const f = mapFixture()
  try {
    f.actor.work = [workRow('generated-work', { agent: f.actor.agent.id, detail, executing: detail === 'executing', runStanding: 'working' })]
    if (beside) f.layout.seats[f.actor.key]!.foot.x += 100
    f.update(); await f.drain()
    const map = f.map as any
    map.individuals = true
    const steps = map.targetSteps([f.actor.key]); while (!steps.next().done) { /* materialize targets */ }
    const button = map.targets.children[0]
    const point = atDesk(f.layout.seats[f.actor.key]!)
    expect(map.actors([f.actor.key])[0].point).toEqual(point)
    expect.soft(button.style.left).toBe(`${(point.x - f.layout.bounds.x) * map.zoom + map.padding.x - 44}px`)
    expect.soft(button.style.top).toBe(`${(point.y - f.layout.bounds.y) * map.zoom + map.padding.y - 44}px`)
  } finally { f.map.dispose() }
}, 30000)

// Model the browser's focus loss on removal, so a reordered roster must restore the same button.
function focusableTargets(targets: any) {
  let focused: any = null
  targets.querySelector = (selector: string) => selector === ':focus' ? focused : null
  targets.querySelectorAll = () => targets.children
  targets.replaceChildren = (...nodes: any[]) => {
    focused = null
    for (const child of targets.children) child.parent = null
    targets.children = []; targets.append(...nodes)
  }
  return { focus(node: any) { node.focus = () => { focused = node }; node.focus() }, current: () => focused }
}

it('retains focused buttons and follows a changed visible roster order', async () => {
  const f = mapFixture()
  try {
    f.update(); await f.drain()
    const map = f.map as any, a = f.actor.key, b = 'generated-second'
    map.occupants.set(b, { ...f.actor, key: b })
    f.layout.seats[b] = { ...f.layout.seats[a]! }
    map.actors = (keys: string[]) => keys.map(key => ({ key, point: { x: key === a ? 420 : 500, y: 500 } }))
    const focus = focusableTargets(map.targets)
    const render = (keys: string[]) => { const steps = map.targetSteps(keys); while (!steps.next().done) { /* materialize */ } }
    render([a, b]); const first = map.targets.children[0], second = map.targets.children[1]
    focus.focus(first); render([b, a])
    expect.soft(map.targets.children).toEqual([second, first])
    expect(focus.current()).toBe(first)
  } finally { f.map.dispose() }
}, 30000)

it('keeps a focused village block across animation target refreshes', async () => {
  const f = mapFixture()
  try {
    f.update(); await f.drain()
    const map = f.map as any
    map.individuals = false
    map.villagePlan = { level: 'villages', blocks: [{ id: 'generated-block', x: 50, y: 50, width: 100, height: 100, total: 2, signs: [] }] }
    const focus = focusableTargets(map.targets)
    const render = () => { const steps = map.targetSteps([]); while (!steps.next().done) { /* materialize */ } }
    render(); const block = map.targets.children[0]; focus.focus(block)
    render()
    expect.soft(map.targets.children[0]).toBe(block)
    expect(focus.current()).toBe(block)
  } finally { f.map.dispose() }
}, 30000)

it.each([false, true])('keeps the target on the displayed figure through walks, still=%s', async still => {
  const f = mapFixture()
  try {
    f.options.still = still
    f.update(); await f.drain()
    const map = f.map as any
    const key = f.actor.key
    const target = map.targets.children.find((node: any) => node.dataset.key === key)
    expect(target).toBeDefined()
    const stationary = map.actors([key])[0].point
    for (const point of [{ x: stationary.x + 60, y: stationary.y + 50 }, { x: stationary.x + 110, y: stationary.y + 80 }]) {
      f.map.animate([{ id: 'generated-walk', from: key, to: key, point, elapsed: 500, facing: 1, phase: 'walk' }])
      await f.drain()
      const displayed = still ? stationary : point
      const current = map.targets.children.find((node: any) => node.dataset.key === key)
      expect.soft(current).toBe(target)
      expect.soft(current.style.left).toBe(`${(displayed.x - f.layout.bounds.x) * map.zoom + map.padding.x - 44}px`)
      expect.soft(current.style.top).toBe(`${(displayed.y - f.layout.bounds.y) * map.zoom + map.padding.y - 44}px`)
    }
    f.map.animate([]); await f.drain()
    expect(map.targets.children.find((node: any) => node.dataset.key === key)).toBe(target)
    expect.soft(target.style.left).toBe(`${(stationary.x - f.layout.bounds.x) * map.zoom + map.padding.x - 44}px`)
    expect.soft(target.style.top).toBe(`${(stationary.y - f.layout.bounds.y) * map.zoom + map.padding.y - 44}px`)
  } finally { f.map.dispose() }
}, 30000)
