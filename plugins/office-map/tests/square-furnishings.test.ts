// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { bodyBox } from '../src/nameplates.ts'
import { inPackedRing } from '../src/packed-road.ts'
import { agent, people } from './fixtures.ts'
import { turned } from './turned-pieces.ts'
import type { RosterView } from '../src/contracts.ts'
import type { Rect } from '../src/viewport.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
const roundRugs = ['A27', 'A28', 'B28']
function layoutFor(count: number) {
  const agents = Array.from({ length: count }, (_, i) => agent(`square-${i}`, i === 0 ? { role: 'secretary' } : i < 4 ? { role: 'supervisor', startedBy: { kind: 'agent', id: 'square-0' } } : { startedBy: { kind: 'agent', id: `square-${1 + i % 3}` } }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  return finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
}
const layout = layoutFor(5), square = layout.square
const band = { x: square.x + 560, y: square.y, width: 80, height: square.height }
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const partlyInside = (part: Rect, area: Rect): boolean => part.x < area.x + area.width && part.x + part.width > area.x && part.y < area.y + area.height && part.y + part.height > area.y
const squarePieces = (built = layout) => built.pieces.filter(part => part.group === null && partlyInside(part, built.square))
const local = (part: { sprite: string; x: number; y: number; layer: string }, area = square) =>
  ({ sprite: part.sprite, x: part.x - area.x, y: part.y - area.y, layer: part.layer })
const grown = (area: Rect, by: number): Rect => ({ x: area.x - by, y: area.y - by, width: area.width + by * 2, height: area.height + by * 2 })

it('draws at most 19 pieces in the square, none of them turned and no round rug', () => {
  const pieces = squarePieces()
  expect(pieces.length).toBeLessThanOrEqual(19)
  for (const part of pieces) {
    expect(turned, `${part.sprite} at ${part.x},${part.y}`).not.toContain(part.sprite)
    expect(roundRugs, `${part.sprite} at ${part.x},${part.y}`).not.toContain(part.sprite)
  }
})

it('puts the hedge row and the tea corner on the left of the square, the B64 fountain and the stone wall on the right, and one message board on each side', () => {
  const middle = square.x + square.width / 2
  const sides = (sprite: string) => squarePieces().filter(part => part.sprite === sprite).map(part => part.x + part.width / 2 < middle ? 'left' : 'right').sort()
  expect(sides('A30'), 'hedge row').toEqual(['left', 'left', 'left'])
  expect(sides('tea-table'), 'tea table').toEqual(['left'])
  expect(sides('tea-set'), 'tea set').toEqual(['left'])
  expect(sides('B64'), 'fountain').toEqual(['right'])
  expect(sides('B30'), 'stone wall').toEqual(['right', 'right', 'right'])
  expect(sides('message-board'), 'message boards').toEqual(['left', 'right'])
})

// Square B, as the square's decision of 10 Nov chose it: two gardens either side of the trunk band, with a lantern
// on each side of the band as its gateway and a bench below each garden. The tea corner (the table, the tea set and
// two stools), the three A30 hedge pieces and a message board stand on the left. The B64 fountain, the three B30
// stone-wall pieces, a message board and the two B57 flower patches are on the right.
it('draws square B: its 19 pieces of 11 kinds each on its own side of the trunk band, a lantern either side of the band and a bench below each garden', () => {
  const pieces = squarePieces()
  const side = (part: Rect) => part.x + part.width <= band.x ? 'left' : part.x >= band.x + band.width ? 'right' : 'on the band'
  const garden = (which: string) => pieces.filter(part => side(part) === which)
  expect(pieces.length, 'pieces').toBe(19)
  expect(new Set(pieces.map(part => part.sprite)).size, 'kinds').toBe(11)
  expect(garden('left').map(part => part.sprite).sort(), 'left garden').toEqual(['A29', 'A30', 'A30', 'A30', 'lantern', 'message-board', 'stool-se', 'stool-sw', 'tea-set', 'tea-table'])
  expect(garden('right').map(part => part.sprite).sort(), 'right garden').toEqual(['A29', 'B30', 'B30', 'B30', 'B57', 'B57', 'B64', 'lantern', 'message-board'])
  for (const part of pieces.filter(part => part.sprite === 'B57')) expect(part.layer, `B57 at ${part.x},${part.y}`).toBe('floor')
  const gap = (part: Rect) => side(part) === 'left' ? band.x - part.x - part.width : part.x - band.x - band.width
  const lanterns = ['left', 'right'].map(which => garden(which).find(part => part.sprite === 'lantern')!)
  expect(gap(lanterns[0]!), 'the two lanterns stand as far from the band').toBe(gap(lanterns[1]!))
  expect(lanterns[0]!.y, 'the two lanterns stand level').toBe(lanterns[1]!.y)
  for (const [index, which] of ['left', 'right'].entries()) {
    const lantern = lanterns[index]!, bench = garden(which).find(part => part.sprite === 'A29')!
    for (const part of garden(which).filter(part => part !== lantern)) expect(gap(part), `${which}: ${part.sprite} at ${part.x},${part.y} is nearer the band than the lantern`).toBeGreaterThan(gap(lantern))
    for (const part of garden(which).filter(part => part !== bench)) expect(part.y + part.height, `${which}: ${part.sprite} at ${part.x},${part.y} reaches below the top of the bench`).toBeLessThanOrEqual(bench.y)
  }
})

it('keeps every square piece wholly inside the square', () => {
  for (const part of squarePieces()) {
    const x = part.x - square.x, y = part.y - square.y
    expect(x, part.sprite).toBeGreaterThanOrEqual(0)
    expect(y, part.sprite).toBeGreaterThanOrEqual(0)
    expect(x + part.width, part.sprite).toBeLessThanOrEqual(square.width)
    expect(y + part.height, part.sprite).toBeLessThanOrEqual(square.height)
  }
})

it('keeps every square piece clear of the play bodies and the trunk band', () => {
  for (const part of squarePieces()) {
    for (const point of layout.places!.play) expect(overlaps(part, grown(bodyBox(point), 16)), `${part.sprite} at ${part.x},${part.y}: play body`).toBe(false)
    expect(overlaps(part, band), `${part.sprite} at ${part.x},${part.y}: trunk band`).toBe(false)
  }
})

it('stands the tea set on its table', () => {
  const pieces = squarePieces(), table = pieces.find(part => part.sprite === 'tea-table'), set = pieces.find(part => part.sprite === 'tea-set')
  expect(table, 'tea table').toBeDefined()
  expect(set, 'tea set').toBeDefined()
  expect(set!.x).toBeGreaterThanOrEqual(table!.x)
  expect(set!.x + set!.width).toBeLessThanOrEqual(table!.x + table!.width)
  expect(set!.y + set!.height).toBeGreaterThanOrEqual(table!.y)
  expect(set!.y + set!.height).toBeLessThanOrEqual(table!.y + table!.height / 2)
  expect(set!.depth!).toBeGreaterThan(table!.depth!)
})

it('keeps the square pieces from overlapping, except the tea set and its table', () => {
  const pieces = squarePieces()
  for (const [index, part] of pieces.entries()) for (const other of pieces.slice(index + 1)) {
    if (part.sprite === 'tea-set' && other.sprite === 'tea-table') continue
    if (part.sprite === 'tea-table' && other.sprite === 'tea-set') continue
    expect(overlaps(part, other), `${part.sprite} at ${part.x},${part.y} / ${other.sprite} at ${other.x},${other.y}`).toBe(false)
  }
})

it('draws the same square for 1, 5 and 120 agents', () => {
  const expected = squarePieces(layout).map(part => local(part))
  for (const count of [1, 5, 120]) {
    const built = layoutFor(count)
    expect(squarePieces(built).map(part => local(part, built.square)), `${count} agents`).toEqual(expected)
  }
})

it('walks the square and the 80 px strip below it as one ring', () => {
  const top = { x: square.x + 5, y: square.y + 5 }, bottom = { x: square.x + 5, y: square.y + square.height + 75 }
  const oneRing = layout.roadDrawing!.some(batch => {
    for (let at = 0; at < batch.length;) {
      const end = at + 1 + batch[at]! * 2, ring = batch.subarray(at, end)
      if (inPackedRing(top, ring) && inPackedRing(bottom, ring)) return true
      at = end
    }
    return false
  })
  expect(oneRing).toBe(true)
})
