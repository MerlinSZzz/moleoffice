// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { GeometryEngine } from '../src/worker-protocol.ts'
import { houseCatalog, boundsOf } from '../src/village.ts'
import { pointIsClear } from '../src/geometry.ts'
import { villageOverview } from '../src/village-layout.ts'
import { woodlandPlan } from '../src/woodland.ts'
import { villageRoster } from './village-layout-fixtures.ts'

it('F5: native homes have open interiors while square fences, shells and furniture remain', () => {
  const reply = new GeometryEngine(true).receive({ id: 1, kind: 'layout', input: { rooms: [], roster: villageRoster(16) } })
  if (reply?.kind !== 'layout') throw Error('No generated layout')
  const layout = reply.layout
  const interior = layout.pieces.filter(p => p.sprite.endsWith('-partition'))
  expect(interior.map(p => ({ sprite: p.sprite, x: p.x, y: p.y }))).toEqual([])
  expect(layout.pieces.some(p => p.sprite === 'A30')).toBe(true)
  expect(layout.pieces.some(p => p.sprite === 'B30')).toBe(true)
  for (const house of layout.houses) {
    for (const suffix of ['floor', 'back', 'front']) expect(layout.pieces.some(p => p.group === house.group && p.x === house.x && p.y === house.y && p.sprite === house.style + '-' + suffix)).toBe(true)
    expect(layout.pieces.some(p => p.sprite === 'worker-desk' && p.group === house.group)).toBe(true)
    if (house.style === 'A03') {
      // Left-middle former rail, safely away from desk/stool and outer walls.
      expect(pointIsClear(layout, { x: house.x + 230, y: house.y + 252 })).toBe(true)
      expect(houseCatalog.A03!.collisionPolygons.some(poly => { const r = boundsOf(poly.map(p => ({ x: p[0]!, y: p[1]! }))); return r.y === 246 && r.height === 14 })).toBe(false)
    }
  }
  for (const zoom of [.07, .015]) expect(woodlandPlan(layout, villageOverview({ villages: layout.villages! }, zoom), zoom).pieces.some(p => p.sprite.endsWith('-partition'))).toBe(false)
})
