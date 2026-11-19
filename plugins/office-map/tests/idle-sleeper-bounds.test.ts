// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'

it('reserves a visible sleeper and its standing fallback using their actual anchors', () => {
  const stand = { atlas: 'invented', rect: [0, 0, 10, 20], trim: [2, 3], size: [32, 32], anchor: [7, 23] }
  const sleep = { atlas: 'invented', rect: [0, 0, 40, 12], trim: [0, 0], size: [40, 12], anchor: [20, 10] }
  const names = ['stand-invented', 'walk-invented-A', 'walk-invented-pass', 'walk-invented-B', 'wave-invented', 'cheer-invented', 'carry-invented']
  const sprites: Record<string, any> = Object.fromEntries(names.map(name => [name, stand])); sprites['sleep-invented'] = sleep
  const fake: any = { individuals: true, occupants: new Map([['invented', { standing: { look: 'invented' }, agent: { id: 'invented', scale: null } }]]), whereaboutsByKey: new Map([['invented', { where: 'sleep', index: 0 }]]), pack: { sources: { sprites }, images: new Map([['invented', {}]]) }, actionBindings: new Map() }
  const body = (OfficeMap.prototype as any).motionBounds.call(fake, 'invented')
  expect(body).not.toBeNull()
  expect(body.x).toBeLessThanOrEqual(-20 * .82)
  expect(body.x + body.width).toBeGreaterThanOrEqual(20 * .82)
  expect(body.y).toBeLessThanOrEqual(-20 * .82)
  expect(body.y + body.height).toBeGreaterThanOrEqual(2 * .82)
})
