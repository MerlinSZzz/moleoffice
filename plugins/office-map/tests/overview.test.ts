// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { LayoutCache } from '../src/geometry.ts'
import { overviewPlan } from '../src/overview.ts'

it('fits every room and the square into the loading overview at all four widths and both DPRs', () => {
  const input = { rooms: Array.from({ length: 500 }, (_, i) => ({ id: `room-${i}`, occupants: Array.from({ length: 10 }, (_, j) => `agent-${i}-${j}`) })) }
  const work = new LayoutCache().build(input), first = work.next().value!
  expect(first).toMatchObject({ preview: true })
  if (!first) throw Error('Expected early overview')
  for (const width of [1440, 990, 660, 390]) for (const dpr of [1, 2]) {
    const height = 760 * dpr, pixels = width * dpr, plan = overviewPlan(first, pixels, height, 16 * dpr)
    expect(plan.rooms.map(room => room.id)).toEqual(input.rooms.map(room => room.id))
    for (const rect of [...plan.rooms, plan.square]) {
      expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(pixels); expect(rect.y + rect.height).toBeLessThanOrEqual(height)
      expect(rect.width).toBeGreaterThan(0); expect(rect.height).toBeGreaterThan(0)
    }
    expect(plan.rooms[0]!.y).not.toBe(plan.rooms[1]!.y)
    expect(plan.rooms[0]!.x).not.toBe(plan.rooms.at(-1)!.x)
  }
  work.return(first)
})
