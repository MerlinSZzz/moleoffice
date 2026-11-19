// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import * as walks from '../src/walks.ts'
import { routeIdle } from '../src/geometry.ts'

it('reserves both a displaced participant and its home against the other route', () => {
  const reserve = (walks as any).occupiedBodies
  expect(reserve).toBeTypeOf('function')
  const body = { x: -10, y: -20, width: 20, height: 20 }
  const rows = [
    { id: 'invented-a', home: { x: 100, y: 100 }, current: { x: 200, y: 100 }, body },
    { id: 'invented-b', home: { x: 400, y: 100 }, current: { x: 400, y: 100 }, body },
  ]
  const occupied = reserve(rows, 'invented-b')
  expect(occupied).toEqual([{ x: 190, y: 80, width: 20, height: 20 }, { x: 90, y: 80, width: 20, height: 20 }])
  const layout: any = { bounds: { x: 0, y: 0, width: 500, height: 200 }, square: { x: 0, y: 0, width: 500, height: 200 }, houses: [], pieces: [], obstacles: [], road: { rings: [], faults: [] } }
  expect(routeIdle(layout, rows[1]!.home, rows[0]!.home, occupied, 'invented-b', body, []).status).not.toBe('found')
  expect(reserve([{ ...rows[0], body: null }], 'invented-b')).toBeNull()
})
