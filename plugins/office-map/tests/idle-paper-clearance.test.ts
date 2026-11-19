// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import * as walks from '../src/walks.ts'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { agent, people } from './fixtures.ts'

it('requires the full trimmed paper arc to clear walls, furniture and occupied bodies', () => {
  const clear = (walks as any).paperArcClear
  expect(clear).toBeTypeOf('function')
  const frame = { atlas: 'invented', rect: [0, 0, 10, 8], trim: [2, 1], size: [20, 20], anchor: [0, 0] }, point = { x: 100, y: 100 }
  expect(clear(point, frame, [])).toBe(true)
  const wall = { x: 149, y: 51, width: 3, height: 4 }, furniture = { x: 113, y: 70, width: 4, height: 4 }, body = { x: 169, y: 70, width: 5, height: 4 }
  for (const blocker of [wall, furniture, body]) expect(clear(point, frame, [blocker])).toBe(false)
  expect(clear(point, null, [])).toBe(false)
  expect(clear(point, frame, [null])).toBe(false)
  expect(clear(point, frame, [{ x: 10, y: 10, width: 2, height: 2 }])).toBe(true)
})

it('names every blocker in the paper arc, and keeps the clear answer agreeing with it', () => {
  const blockersOf = (walks as any).paperArcBlockers
  expect(blockersOf).toBeTypeOf('function')
  const frame = { atlas: 'invented', rect: [0, 0, 10, 8], trim: [2, 1], size: [20, 20], anchor: [0, 0] }, point = { x: 100, y: 100 }
  const wall = { x: 149, y: 51, width: 3, height: 4 }, furniture = { x: 113, y: 70, width: 4, height: 4 }, body = { x: 169, y: 70, width: 5, height: 4 }
  expect(blockersOf(point, frame, [])).toEqual([])
  expect(blockersOf(point, frame, [wall, furniture, body])).toEqual([wall, furniture, body])
  expect(blockersOf(point, frame, [body, { x: 10, y: 10, width: 2, height: 2 }, wall])).toEqual([body, wall])
  expect(blockersOf(point, null, [])).toBeNull()
  expect(blockersOf(point, frame, [null])).toBeNull()
  const fake: any = Object.assign(Object.create(OfficeMap.prototype), { pack: { sources: { sprites: { 'paper-stack': frame } }, images: new Map([['invented', {}]]) } })
  // The map draws the bundle at PAPER_ARC_SHIFT, so the blocker is placed in that shifted arc.
  const shifted = { x: 160, y: 60, width: 4, height: 4 }
  expect(fake.paperBlockers(point, [shifted])).toEqual([shifted])
  expect(fake.paperClear(point, [shifted])).toBe(false)
  expect(fake.paperClear(point, [])).toBe(true)
})

it('draws the paper only when its meeting arc was approved', () => {
  const occupant = mapOffice({ ...people, agents: [agent('invented')] }, null).occupants[0]!
  occupant.standing = { look: 'tuft', source: 'saved-catalogue' }
  const frame = { atlas: 'invented', rect: [0, 0, 10, 10], trim: [0, 0], size: [10, 10], anchor: [5, 10] }
  const images: any[] = [], ctx: any = { save() {}, restore() {}, translate() {}, scale() {}, drawImage(image: any) { images.push(image) } }
  const mole = {}, paper = {}, fake: any = { occupants: new Map([[occupant.key, occupant]]), drawnScale: OfficeMap.prototype.drawnScale, whereaboutsByKey: new Map(), individuals: true, layout: { ownership: false, seats: {} }, options: { still: false, wave: null, workAvailable: true }, actions: { draw: () => false }, pack: { sources: { sprites: { 'wave-tuft': frame, 'paper-stack': { ...frame, atlas: 'paper' } } }, images: new Map([['invented', mole], ['paper', paper]]) } }
  const actor = (OfficeMap.prototype as any).actor, walk = { from: occupant.key, to: 'other', point: { x: 100, y: 100 }, elapsed: 0, facing: 1, phase: 'play', paper: false }
  actor.call(fake, ctx, occupant.key, walk.point, walk)
  expect(images).toEqual([mole])
  images.length = 0; walk.paper = true
  actor.call(fake, ctx, occupant.key, walk.point, walk)
  expect(images).toEqual([mole, paper])
})
