// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { facilityPlan } from '../src/ownership-facilities.ts'
import { sceneOrder } from '../src/scene-order.ts'
import { overlaps } from '../src/nameplates.ts'
import type { House, Piece } from '../src/village.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const ids = Array.from({ length: 40 }, (_, i) => 'generated-' + i)
// One extra odd character in an identity gives both mixed-station orders.
const plans = [ids, ids.map((id, i) => i === ids.length - 1 ? id + 'a' : id)].map((roster, n) => {
  const group = 'generated-room-' + n, plan = facilityPlan(roster, group)
  const house: House = { x: 0, y: 0, width: plan.width, height: plan.height, group, module: 0, style: 'B06', occupants: [...roster], anchor: { x: plan.width / 2, y: plan.height - 24 }, doors: [], openings: [], hitArea: [], walkable: [] }
  const order: Piece[] = []
  for (const entry of sceneOrder(plan.pieces, [], [house])) if (entry?.piece) order.push(entry.piece)
  return { plan, order }
})

it('the actual scene pass paints every laptop, mug and lamp after the desk supporting it', () => {
  const named = ['laptop-back', 'coffee-mug', 'desk-lamp', 'desk-lamp-right'], bySprite = new Map(named.map(sprite => [sprite, 0])), byDesk = new Map<Piece, number>()
  for (const { plan, order } of plans) for (const prop of plan.pieces.filter(p => named.includes(p.sprite))) {
    const supports = plan.pieces.filter(p => p.sprite === 'worker-desk' && overlaps(prop, p))
    expect(supports, prop.sprite + ' has one physical desk').toHaveLength(1)
    expect(order.indexOf(prop), prop.sprite + ' hidden by own desk').toBeGreaterThan(order.indexOf(supports[0]!))
    bySprite.set(prop.sprite, bySprite.get(prop.sprite)! + 1); byDesk.set(supports[0]!, (byDesk.get(supports[0]!) ?? 0) + 1)
  }
  // Each named sprite is checked at least once, and each desk for its laptop, its mug and its
  // lamp, or for the two of them where a paper stack stands in place of the lamp. A sprite that
  // drops out of the drawing, or out of the list, turns this red instead of checking fewer pieces.
  expect([...bySprite].filter(([, n]) => n === 0).map(([sprite]) => `no ${sprite} checked`)).toEqual([])
  expect(plans.flatMap(({ plan }) => plan.pieces.filter(p => p.sprite === 'worker-desk').flatMap(desk => {
    const stack = plan.pieces.some(p => p.sprite === 'paper-stack' && overlaps(p, desk)), n = byDesk.get(desk) ?? 0
    return n === (stack ? 2 : 3) ? [] : [`the desk at ${desk.x},${desk.y} had ${n} pieces checked${stack ? ', beside its paper stack' : ''}`]
  }))).toEqual([])
  expect([...bySprite.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(100)
})

it.each([false, true])('the actual scene pass keeps the tea set on its table outdoors=%s', outdoors => {
  let checked = 0
  for (const { plan, order } of plans) for (const prop of plan.pieces.filter(p => p.sprite === 'tea-set' && (p.group === null) === outdoors)) {
    const supports = plan.pieces.filter(p => p.sprite === 'tea-table' && overlaps(prop, p))
    expect(supports).toHaveLength(1)
    expect(order.indexOf(prop), 'tea set hidden by table').toBeGreaterThan(order.indexOf(supports[0]!))
    checked++
  }
  expect(checked).toBeGreaterThan(0)
})
