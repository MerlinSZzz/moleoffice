// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { SlicedBuild } from '../src/layout-index.ts'

it('slices a thousand invented pieces and cancels without publishing partial bounds', () => {
  const frame = { atlas: 'invented', rect: [0, 0, 10, 10], trim: [0, 0], size: [10, 10], anchor: [5, 10] }
  const fake: any = { layout: { pieces: Array.from({ length: 1000 }, (_, i) => ({ sprite: 'invented-desk', layer: 'object', x: i * 20, y: 0, width: 10, height: 10 })) }, pack: { sources: { sprites: { 'invented-desk': frame } }, images: new Map([['invented', {}]]) } }
  const make = (OfficeMap.prototype as any).motionFurnitureSteps
  expect(make).toBeTypeOf('function')
  let closed = false, published = false, nextId = 0
  const tasks = new Map<number, () => void>()
  const work = make.call(fake)
  function* tracked(): Generator<void, any> { try { return yield* work } finally { closed = true } }
  const build = new SlicedBuild<any>(() => 0, callback => { const id = ++nextId; tasks.set(id, callback); return id as any }, id => { tasks.delete(id as any) })
  build.start(tracked(), () => { published = true })
  expect(tasks.size).toBe(1)
  const [id, run] = tasks.entries().next().value!; tasks.delete(id); run()
  expect(published).toBe(false)
  expect(tasks.size).toBe(1)
  build.cancel()
  expect(closed).toBe(true)
  expect(tasks.size).toBe(0)
  expect(published).toBe(false)
  const complete = make.call(fake), result = []
  for (;;) { const next = complete.next(); if (next.done) { result.push(...next.value); break } }
  expect(result).toHaveLength(1000)
})
