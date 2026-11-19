// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { houseCatalog } from '../src/village.ts'
import art from '../assets/village-catalog.json'
import { layoutVillages, villageCells, villageOverview, villagePieces, VILLAGE, type VillageLayout, type VillageRoster } from '../src/village-layout.ts'
import { villageRoster, overflowRoster } from './village-layout-fixtures.ts'

type Box = { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const touches = (a: Box, b: Box) => overlaps(a, b) ||
  (a.x + a.width === b.x || b.x + b.width === a.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) ||
  (a.y + a.height === b.y || b.y + b.height === a.y) && Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
const contains = (b: Box, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height

/** Independent spatial broad phase. Closed edges stay candidates for the
 * graph proof; no planner-supplied connectivity or collision list is trusted.
 */
function pairs(boxes: Box[]) {
  const bins = new Map<string, number[]>(), result: [number, number][] = [], seen = new Set<string>()
  boxes.forEach((b, i) => {
    for (let x = Math.floor(b.x / 512); x <= Math.floor((b.x + b.width) / 512); x++) for (let y = Math.floor(b.y / 512); y <= Math.floor((b.y + b.height) / 512); y++) {
      const key = `${x},${y}`, prior = bins.get(key) ?? []
      for (const j of prior) { const pair = `${j}:${i}`; if (!seen.has(pair)) { seen.add(pair); result.push([j, i]) } }
      prior.push(i); bins.set(key, prior)
    }
  })
  return result
}
const distance = (a: { column: number; row: number }, b: { column: number; row: number }) => Math.abs(a.column - b.column) + Math.abs(a.row - b.row)

function checkConnected(layout: VillageLayout) {
  const boxes = [...layout.paths, ...layout.squares], edges = boxes.map(() => [] as number[])
  for (const [a, b] of pairs(boxes)) if (touches(boxes[a]!, boxes[b]!)) { edges[a]!.push(b); edges[b]!.push(a) }
  const reached = new Set<number>([layout.paths.length]), queue = [...reached]
  for (let i = 0; i < queue.length; i++) for (const next of edges[queue[i]!]!) if (!reached.has(next)) { reached.add(next); queue.push(next) }
  expect(layout.squares.every((_, i) => reached.has(layout.paths.length + i)), 'all squares share one physical path component').toBe(true)
  for (const home of layout.homes) for (const door of home.doors) expect(boxes.some((b, i) => reached.has(i) && contains(b, door)), `${home.id} door ${door.x},${door.y}`).toBe(true)
}

/** Independently replay just the allocation rule, without using the planner's
 * candidate list, team index, distance result or sign list.
 */
function checkAllocation(layout: VillageLayout, input: VillageRoster) {
  const claims = new Map<string, string>(), seats = new Map<string, string[]>(), born = new Set<number>()
  // THE ASSERTION FRAMEWORK IS THE COST, NOT THE GATE: every predicate and input below still runs
  // for every arrival, home and sign; invariant failures are batched so one assertion reports them
  // instead of paying Vitest expect overhead per item, which was most of this case's CPU.
  const violations: string[] = []
  const check = (holds: boolean, message: string) => { if (!holds) violations.push(message) }
  for (const arrival of layout.arrivals) {
    const home = layout.plots.find(h => h.id === arrival.home)!, own = layout.plots.filter(h => claims.get(h.id) === arrival.group)
    const vacancy = own.find(h => (seats.get(h.id)?.length ?? 0) < h.capacity)
    if (vacancy) check(Object.is(home.id, vacancy.id), `reuse a team seat first: ${home.id}, expected ${vacancy.id}`)
    if (arrival.newHome) {
      check(Object.is(vacancy, undefined), 'no new home while an owned seat is free')
      const free = layout.plots.filter(h => born.has(h.village) && !claims.has(h.id))
      const candidates = free.length ? free : layout.plots.filter(h => h.village === born.size)
      const ownedVillages = [...new Set(own.map(h => h.village))]
      const rank = (h: typeof home) => ownedVillages.length ? Math.min(...ownedVillages.map(v => distance(layout.villages[v]!, layout.villages[h.village]!))) : 0
      candidates.sort((a, b) => rank(a) - rank(b) || a.village - b.village || a.slot - b.slot)
      check(Object.is(home.id, candidates[0]!.id), `fewest existing villages, then nearest available village, then ordinal: ${home.id}, expected ${candidates[0]!.id}`)
      born.add(home.village); claims.set(home.id, arrival.group)
    }
    const held = seats.get(home.id) ?? []
    check(Object.is(arrival.index, held.length), `seat index ${arrival.index}, expected ${held.length}`); held.push(arrival.person); seats.set(home.id, held)
  }
  const labels = new Map(input.groups.map(g => [g.id, g.label])), totals = new Map<string, number>()
  for (const seat of Object.values(layout.seats)) {
    const key = `${seat.village}:${seat.group}`; totals.set(key, (totals.get(key) ?? 0) + 1)
  }
  for (const h of layout.homes) if (h.group !== null) {
    const sign = layout.villages[h.village]!.signs.find(s => s.id === h.group)
    const copied = sign === undefined ? null : { id: sign.id, label: sign.label, token: sign.token }
    check(Object.is(copied?.label, labels.get(h.group)), `${h.id}: sign label ${String(copied?.label)}, expected ${String(labels.get(h.group))}`)
    for (const v of layout.villages.filter(v => v.signs.some(s => s.id === h.group))) {
      const other = v.signs.find(s => s.id === h.group)!
      // token is a number in TeamSign; Object.is keeps the deep-equality meaning, type included.
      check(copied !== null && Object.is(other.id, copied.id) && Object.is(other.label, copied.label) && Object.is(other.token, copied.token), `${h.id}: sign copy differs for ${h.group}`)
      check(Object.is(other.total, totals.get(`${v.id}:${h.group}`) ?? 0), `${h.id}: sign total ${other.total}, expected ${totals.get(`${v.id}:${h.group}`) ?? 0}`)
    }
  }
  expect(violations, `independent allocation and sign checks: ${violations.join('; ')}`).toEqual([])
}

describe('the independent village layout', () => {
  it('keeps home, square and path interiors disjoint, with native homes and seats', () => {
    for (const count of [1, 16, 100, 500, 1000, 5000]) {
      const layout = layoutVillages(villageRoster(count)), boxes = [...layout.homes, ...layout.squares, ...layout.paths]
      for (const [a, b] of pairs(boxes)) expect(overlaps(boxes[a]!, boxes[b]!), `overlap ${a}/${b}, ${count} people`).toBe(false)
      expect(Object.keys(layout.seats)).toHaveLength(count)
      for (const h of layout.homes) {
        expect([h.width, h.height]).toEqual(houseCatalog[h.style]!.canvasSize)
        for (const id of h.members) if (id !== null) { const s = layout.seats[id]!; expect(contains(h, s.foot)).toBe(true); expect(contains(h, s.desk)).toBe(true) }
      }
    }
    const reference = layoutVillages(villageRoster(16))
    expect(reference.villages).toHaveLength(1); expect(reference.homes).toHaveLength(6)
    expect(reference.squares[0]).toMatchObject({ width: 2340, height: 416 })
    for (const sprite of ['tea-table', 'tea-set', 'B64', 'message-board', 'B42', 'pine-tree']) expect(villagePieces(reference, 0).some(p => p.sprite === sprite)).toBe(true)
    const joined = layoutVillages(villageRoster(100))
    for (const p of villagePieces(joined, 0).filter(p => p.sprite === 'tree-assembled' || p.sprite === 'pine-tree' || p.sprite === 'berry-bush')) {
      const meta = (art.sprites as Record<string, { anchor: number[] }>)[p.sprite]!
      const ground = { x: p.x + meta.anchor[0]! - 5, y: p.y + meta.anchor[1]! - 5, width: 10, height: 10 }
      expect([...joined.homes, ...joined.paths, ...joined.squares].some(r => overlaps(r, ground)), 'plant feet keep doors and inter-village ports clear').toBe(false)
    }
  })

  it('joins every door to its square and all squares through actual road edges', () => {
    for (const mode of ['mixed', 'singletons', 'one-team'] as const) checkConnected(layoutVillages(villageRoster(5000, mode)))
  })

  it('uses the fewest villages the stable allocation rule allows, marks teams, and bounds worst overflow', () => {
    for (const input of [villageRoster(1000), villageRoster(5000, 'one-team'), overflowRoster()]) checkAllocation(layoutVillages(input), input)
    const maximumVillages = Math.ceil(5000 / VILLAGE.homes), cells = villageCells(maximumVillages)
    let diameter = 0, far: [number, number] = [0, 0]
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) if (distance(cells[a]!, cells[b]!) > diameter) { diameter = distance(cells[a]!, cells[b]!); far = [a, b] }
    expect(diameter).toBe(56)
    // Realise the diameter: three members fill a two-seat studio and need a
    // second home after every earlier plot has been claimed by another team.
    const count = 5000, input = structuredClone(villageRoster(count, 'singletons'))
    const people = [...input.people], first = far[0] * 6 + 2, last = far[1] * 6 + 1
    people[first + 1] = { ...people[first + 1]!, group: people[first]!.group }
    people[last] = { ...people[last]!, group: people[first]!.group }
    const adversarial = layoutVillages({ ...input, people }), held = adversarial.homes.filter(h => h.group === people[first]!.group)
    expect(count).toBeLessThanOrEqual(5000); expect(held).toHaveLength(2)
    expect(distance(adversarial.villages[held[0]!.village]!, adversarial.villages[held[1]!.village]!)).toBe(diameter)
    for (const scale of [1, .1, .03, .005]) {
      const overview = villageOverview(adversarial, scale)
      expect(overview.level).toBe(scale === 1 ? 'homes' : scale === .1 ? 'villages' : 'districts')
      if (overview.level !== 'homes') { expect(overview.blocks.reduce((n, b) => n + b.total, 0)).toBe(count); for (const [a, b] of pairs(overview.blocks)) expect(overlaps(overview.blocks[a]!, overview.blocks[b]!)).toBe(false) }
    }
  })

  it('never moves existing homes or seats during 100 to 5000 arrivals, departures and reuse', () => {
    let previous: VillageLayout | undefined
    for (let count = 100; count <= 5000; count += 100) {
      const input = villageRoster(count), layout = layoutVillages(input)
      if (previous) {
        for (const h of previous.homes) { const next = layout.homes.find(n => n.id === h.id)!; expect([next.x, next.y, next.width, next.height, next.style]).toEqual([h.x, h.y, h.width, h.height, h.style]) }
        for (const [id, seat] of Object.entries(previous.seats)) expect(layout.seats[id], id).toEqual(seat)
      }
      previous = layout
    }
    const input = villageRoster(100)
    const snapshot = structuredClone(input)
    layoutVillages(input); expect(input).toEqual(snapshot)
    expect(layoutVillages({ groups: [...input.groups].reverse(), people: [...input.people].reverse() })).toEqual(layoutVillages(input))
    const tied = { groups: input.groups.map(g => ({ ...g, createdAt: '0' })), people: input.people.map(p => ({ ...p, createdAt: '1' })) }
    expect(layoutVillages({ groups: [...tied.groups].reverse(), people: [...tied.people].reverse() })).toEqual(layoutVillages(tied))
    const lifecycle: VillageRoster = { groups: [{ id: 'team', label: 'Team', createdAt: '0', endedAt: '8' }, { id: 'other', label: 'Other', createdAt: '0' }], people: [
      { id: 'a', group: 'team', createdAt: '1', leftAt: '4' }, { id: 'b', group: 'team', createdAt: '2' }, { id: 'c', group: 'team', createdAt: '5' }, { id: 'd', group: 'other', createdAt: '9' },
    ] }
    const leaving = layoutVillages(lifecycle)
    expect(leaving.arrivals[2]).toMatchObject({ home: leaving.arrivals[0]!.home, index: 0, newHome: false })
    expect(leaving.arrivals[3]).toMatchObject({ home: leaving.arrivals[0]!.home, index: 0 })
    expect(Object.keys(leaving.seats)).toEqual(['d'])
    expect(() => layoutVillages({ groups: input.groups, people: [input.people[0]!, input.people[0]!] })).toThrow('duplicate')
  })

  it('keeps every size inside the stated compact aspect and space bounds', () => {
    // Every possible prefix, including the singleton-group maximum at 5,000.
    // One fixed world serves both widths; it is never reflowed on a phone.
    for (let n = 1; n <= Math.ceil(5000 / 6); n++) {
      const input = villageRoster(Math.min(n * 6, 5000), 'singletons'), layout = layoutVillages(input), b = layout.bounds
      const ratio = b.width / b.height
      expect(ratio).toBeGreaterThanOrEqual(VILLAGE.width / VILLAGE.height / 2)
      expect(ratio).toBeLessThanOrEqual(VILLAGE.width / VILLAGE.height)
      expect(b.width * b.height / (n * VILLAGE.width * VILLAGE.height)).toBeLessThanOrEqual(4 / 3 + 1e-12)
      // Canvas ratios 1440:760 and 390:760: factor at most 2.77 at any size.
      for (const width of [1440, 390]) expect(Math.max(ratio / (width / 760), width / 760 / ratio)).toBeLessThanOrEqual(2.77)
    }
  }, 30000)
})
