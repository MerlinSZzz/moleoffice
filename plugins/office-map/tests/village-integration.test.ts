// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { GeometryEngine } from '../src/worker-protocol.ts'
import { drawingChunks } from '../src/drawing-layout.ts'
import { appendDrawing, emptyDrawing } from '../src/worker-protocol.ts'
import { layoutKey, pointIsClear, routeBetween, type Layout, type LayoutInput } from '../src/geometry.ts'
import { layoutVillages, VILLAGE } from '../src/village-layout.ts'
import { mapOffice } from '../src/model.ts'
import { mountGeometryWorker, type GeometryPort } from '../src/geometry-runner.ts'
import { agent, people } from './fixtures.ts'
import { villageRoster } from './village-layout-fixtures.ts'

const input = (count = 100): LayoutInput => ({ rooms: [], roster: villageRoster(count) })
function build(source: LayoutInput, engine = new GeometryEngine(true)): Layout {
  const reply = engine.receive({ id: 1, kind: 'layout', input: source })
  if (reply?.kind !== 'layout') throw Error(JSON.stringify(reply))
  return reply.layout
}

it('replays the published retired rows without moving a surviving home or seat, even after reload', () => {
  const agents = Array.from({ length: 40 }, (_, i) => agent(String(i).padStart(3, '0'), { role: i === 0 ? 'supervisor' : 'worker',
    startedBy: i ? { kind: 'agent', id: '000' } : null, createdAt: `2026-01-01 10:00:${String(i).padStart(2, '0')}` }))
  const before = mapOffice({ ...people, agents }, null), original = build({ rooms: before.rooms, roster: before.layoutRoster })
  agents[0]!.retired = true; agents[2]!.retired = true
  const after = mapOffice({ ...people, agents: [...agents].reverse() }, null)
  const current = build({ rooms: after.rooms, roster: after.layoutRoster }), reloaded = build(structuredClone({ rooms: after.rooms, roster: after.layoutRoster }))
  expect(after.occupants).toHaveLength(38)
  expect(after.layoutRoster.people).toHaveLength(40)
  expect(current.houses).toHaveLength(original.houses.length)
  for (const occupant of after.occupants) {
    expect(current.seats[occupant.key]).toEqual(original.seats[occupant.key])
    expect(reloaded.seats[occupant.key]).toEqual(original.seats[occupant.key])
  }
  expect(Object.keys(current.seats)).toHaveLength(38)
  expect(current.villages!.reduce((sum, v) => sum + v.total, 0)).toBe(38)
  expect(current.villages!.flatMap(v => v.signs).reduce((sum, s) => sum + s.total, 0)).toBe(38)
  expect(current.seats['["agent","000"]']).toBeUndefined()
})

it('uses the stepped village plan in the real bounded worker, with exact native homes and seats', () => {
  const source = input(5000), expected = layoutVillages(source.roster!), queue: (() => void)[] = [], replies: unknown[] = []
  const rows = [...source.roster!.people]; let readRows = 0
  Object.defineProperty(source.roster!.people, Symbol.iterator, { value: function* () { for (const row of rows) { readRows++; yield row } } })
  const port: GeometryPort = { onmessage: null, postMessage: reply => replies.push(reply) }
  mountGeometryWorker(port, () => 0, fn => { queue.push(fn); return queue.length as unknown as ReturnType<typeof setTimeout> })
  port.onmessage!({ data: { id: 1, kind: 'layout', input: source } } as MessageEvent)
  expect(queue).toHaveLength(1)
  expect(readRows).toBeLessThanOrEqual(64)
  expect(replies.some((r: any) => r.kind === 'layout')).toBe(false)
  let turns = 0
  while (queue.length) { queue.shift()!(); turns++ }
  expect(turns).toBeGreaterThan(100)
  expect(readRows).toBe(5000)
  const drawing = emptyDrawing()
  for (const reply of replies as any[]) if (reply.kind === 'drawing') appendDrawing(drawing, reply.chunk)
  const end = (replies as any[]).find(r => r.kind === 'layout')
  const layout = Object.assign(end.layout, drawing) as Layout
  expect(layout.key).toBe(layoutKey(source))
  expect(layout.villages).toEqual(expected.villages)
  expect(layout.bounds).toEqual(expected.bounds)
  expect(layout.houses.map(h => [h.id, h.x, h.y, h.style])).toEqual(expected.homes.map(h => [h.id, h.x, h.y, h.style]))
  for (const id in expected.seats) expect(layout.seats[id]!.foot).toEqual(expected.seats[id]!.foot)
  expect(new Set(layout.pieces.map(p => p.sprite))).toContain('tea-table')
}, 30000)

it('chunks village metadata as well as art and preserves exact drawing data after transfer', () => {
  const layout = build(input(1000)), work = drawingChunks(layout), drawing = emptyDrawing()
  let end = work.next()
  while (!end.done) {
    for (const [key, values] of Object.entries(end.value)) expect(Array.isArray(values) ? values.length : Object.keys(values).length).toBeLessThanOrEqual(key === 'roadDrawing' ? 32 : 128)
    appendDrawing(drawing, structuredClone(end.value, { transfer: end.value.roadDrawing?.map(r => r.buffer as ArrayBuffer) ?? [] }))
    end = work.next()
  }
  expect(end.value.villages).toEqual([])
  expect(end.value.squares).toEqual([])
  const page = Object.assign(end.value, drawing)
  expect(page.houses).toHaveLength(layout.houses.length)
  expect(page.villages).toEqual(layout.villages); expect(page.squares).toEqual(layout.squares)
  expect(page.seats).toEqual(layout.seats); expect(page.pieces).toEqual(layout.pieces)
  expect(page.obstacles).toEqual([]); expect(page.paths).toBeUndefined()
  expect(layout.roadDrawing!.every(r => r.byteLength > 0)).toBe(true)
})

it('routes from native off-grid seats through home doors, village squares and adjoining villages', () => {
  const layout = build(input(40)), keys = Object.keys(layout.seats)
  expect(layout.villages!.length).toBeGreaterThan(1)
  expect(keys.some(k => layout.seats[k]!.foot.x % 16 !== 0)).toBe(true)
  for (const [a, b] of [[0, 1], [0, 8], [0, keys.length - 1]]) {
    const from = keys[a!]!, to = keys[b!]!, route = routeBetween(layout, from, to)
    expect(route.status, `${from} to ${to}`).toBe('found')
    expect(route.points[0]).toEqual(layout.seats[from]!.foot)
    expect(route.points.at(-1)).toEqual(layout.seats[to]!.talk)
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1]!, b = route.points[i]!, count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4)
      for (let n = 0; n <= count; n++) expect(pointIsClear(layout, { x: a.x + (b.x - a.x) * n / count, y: a.y + (b.y - a.y) * n / count }, [from, to])).toBe(true)
    }
  }
  expect(layout.houses[0]!.width).toBeLessThan(VILLAGE.width)
}, 30000)

it('keeps an empty drawn desk solid when a visitor walks past it', () => {
  const layout = build(input(1)), desks = layout.pieces.filter(p => p.sprite === 'worker-desk')
  expect(desks).toHaveLength(4)
  const empty = desks.at(-1)!
  expect(pointIsClear(layout, { x: empty.x + empty.width / 2, y: empty.y + empty.height / 2 })).toBe(false)
})

it('keeps the square tea table solid when its native art has no collision polygon', () => {
  const layout = build(input(16)), table = layout.pieces.find(p => p.sprite === 'tea-table')!
  expect(pointIsClear(layout, { x: table.x + table.width / 2, y: table.y + table.height * .85 })).toBe(false)
})
