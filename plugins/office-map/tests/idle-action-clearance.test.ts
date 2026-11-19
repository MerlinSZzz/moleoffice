// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { ActionRuntime } from '../src/action-runtime.ts'
import { routeIdle } from '../src/geometry.ts'

it('reserves the bound action canvas and contact props through departure', () => {
  const sprite = { atlas: 'invented', rect: [0, 0, 10, 10], trim: [0, 0], size: [20, 20], anchor: [5, 10] }
  const names = ['stand-invented', 'walk-invented-A', 'walk-invented-pass', 'walk-invented-B', 'wave-invented', 'cheer-invented', 'carry-invented']
  const sprites: any = Object.fromEntries(names.map(name => [name, sprite]))
  const pack: any = { sources: { sprites }, images: new Map([['invented', {}]]) }
  const action: any = { packs: { resident: () => ({ data: { stages: [{ source: 'invented', origin: [191, 205] }], sources: { invented: { width: 80, height: 50 } } } }) } }
  const occupant = { standing: { look: 'invented' }, agent: { id: 'invented', scale: null } }
  const point = { x: 100, y: 100 }, target = { x: 400, y: 100 }
  const contact = { layer: 'object', sprite: 'invented-desk', x: 125, y: 80, width: 30, height: 30, contactSize: [30, 30], depth: 110, group: null }
  const layout: any = { bounds: { x: 0, y: 0, width: 500, height: 200 }, square: { x: 0, y: 0, width: 500, height: 200 }, rooms: [], houses: [], pieces: [contact], obstacles: [], seats: {}, road: { rings: [], ends: [], faults: [], halfWidth: 20 }, bodyRadius: 8 }
  const fake: any = { layout, pack, individuals: true, occupants: new Map([['invented', occupant]]), whereaboutsByKey: new Map(), actionBindings: new Map([['invented', {}]]), actions: { collisionBounds: () => (ActionRuntime.prototype as any).collisionBounds.call(action) } }
  const body = (OfficeMap.prototype as any).motionBounds.call(fake, 'invented')
  const artwork = (OfficeMap.prototype as any).motionFurniture.call(fake)
  expect(body).not.toBeNull(); expect(artwork).toEqual([{ x: 125, y: 80, width: 30, height: 30 }])
  expect(body.x).toBeLessThanOrEqual(-40 * .82)
  expect(routeIdle(layout, point, target, [], 'invented', body, artwork).status).not.toBe('found')
  fake.actionBindings.clear()
  const standing = (OfficeMap.prototype as any).motionBounds.call(fake, 'invented')
  expect(routeIdle(layout, point, target, [], 'invented', standing, artwork).status).toBe('found')
  fake.actionBindings.set('invented', {}); fake.actions.collisionBounds = () => null
  expect((OfficeMap.prototype as any).motionBounds.call(fake, 'invented')).toBeNull()
})
