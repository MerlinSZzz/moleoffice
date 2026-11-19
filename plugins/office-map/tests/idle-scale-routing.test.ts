// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { IDLE_ROUTE_EXPANSIONS, routeIdleSteps } from '../src/idle-route.ts'
import type { Layout, Point, Route } from '../src/geometry.ts'
import { sweptBodyHits, translateBody, visualBodyBounds } from '../src/visual-body.ts'
import type { Rect } from '../src/viewport.ts'

const body = visualBodyBounds('tuft', .82)!
function scene(obstacles: Layout['obstacles'] = []): Layout {
  const square = { x: 0, y: 0, width: 22000, height: 22000 }
  return { key: 'invented-scale', bounds: square, square, rooms: [], seats: {}, obstacles,
    road: { halfWidth: 0, rings: [], ends: [], faults: [] }, bodyRadius: 16, houses: [], pieces: [] }
}
function run(layout: Layout, start: Point, target: Point, occupied: Rect[], visible: Rect[], from = 'invented-mover') {
  const started = performance.now(), steps = routeIdleSteps(layout, start, target, occupied, from, body, visible)
  let count = 0, result: Route
  for (;;) { const next = steps.next(); if (next.done) { result = next.value; break }; count++ }
  const elapsedMs = performance.now() - started
  console.log('SCALE-ROUTE', JSON.stringify({ status: result.status, points: result.points.length, yields: count, elapsedMs, heapUsedBytes: process.memoryUsage().heapUsed }))
  return { result, count, elapsedMs }
}
function safe(route: Route, start: Point, target: Point, blockers: Rect[]) {
  expect(route.status).toBe('found')
  expect(route.points[0]).toEqual(start)
  expect(route.points.at(-1)).toEqual(target)
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!, b = route.points[i]!
    for (const blocker of blockers) expect(sweptBodyHits(a, b, body, blocker)).toBe(false)
    // The whole sprite must stay within the walkable square, which is convex.
    for (const p of [a, b]) {
      const box = translateBody(body, p)
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(22000); expect(box.y + box.height).toBeLessThanOrEqual(22000)
    }
  }
}

it('finds a long clear path with 999 other visible bodies and thousands of furniture blockers within a bounded search', () => {
  const occupied = Array.from({ length: 999 }, (_, i) => translateBody(body, { x: 100 + (i % 100) * 180, y: 16500 + Math.floor(i / 100) * 200 }))
  const visible = Array.from({ length: 1956 }, (_, i) => ({ x: 40 + (i % 100) * 180, y: 14500 + Math.floor(i / 100) * 50, width: 20, height: 20 }))
  const layout = scene(), start = { x: 128, y: 256 }, target = { x: 18000, y: 7200 }
  const { result, count, elapsedMs } = run(layout, start, target, occupied, visible)
  safe(result, start, target, [...occupied, ...visible])
  expect(count).toBeLessThan(2000)
  expect(elapsedMs).toBeLessThan(1000)
}, 30000)

it('takes a safe detour around the moving occupant’s own stool', () => {
  const stool = { x: 520, y: 150, width: 80, height: 190, kind: 'stool' as const, station: 'invented-mover' }
  const layout = scene([stool]), start = { x: 128, y: 256 }, target = { x: 1024, y: 256 }
  const { result } = run(layout, start, target, [], [])
  safe(result, start, target, [stool])
}, 30000)

// A target sealed by four walls cannot be reached, so the search spends its whole budget.
const sealed = (c: Point): Layout['obstacles'] => [
  { x: c.x - 200, y: c.y - 200, width: 400, height: 40, kind: 'wall' }, { x: c.x - 200, y: c.y + 160, width: 400, height: 40, kind: 'wall' },
  { x: c.x - 200, y: c.y - 200, width: 40, height: 400, kind: 'wall' }, { x: c.x + 160, y: c.y - 200, width: 40, height: 400, kind: 'wall' }]
function bounded(layout: Layout, start: Point, target: Point, bounds: unknown, suspended = () => {}) {
  const steps = (routeIdleSteps as any)(layout, start, target, [], 'invented-mover', body, [], bounds) as Generator<void, Route & { work?: any }>
  let count = 0, next = steps.next()
  while (!next.done) { count++; suspended(); next = steps.next() }
  console.log('BOUNDED-ROUTE', JSON.stringify({ status: next.value.status, yields: count, work: next.value.work ?? 'not exposed' }))
  return { route: next.value, count }
}

// A busy machine holds the thread without doing work, so a step takes longer by the clock and does no more.
it('never stops an idle route by time, however slowly its steps run, stops one that cannot be found at its fixed expansions bound, and reports the time of its own steps', () => {
  // Each reading of the invented clock moves it on 1000 ms, so each step takes 1000 ms; each suspension lasts 1000 ms more.
  let time = 0
  const target = { x: 11000, y: 11000 }, { route, count } = bounded(scene(sealed(target)), { x: 128, y: 256 }, target, { now: () => time += 1000 }, () => { time += 1000 })
  expect(route).toMatchObject({ status: 'exhausted', points: [], work: { bound: 'expansions', expansions: IDLE_ROUTE_EXPANSIONS, yields: count } })
  expect(route.work.milliseconds).toBe(1000 * (count + 1))
}, 30000)

it('stops an idle route at its fixed expansions bound and reports the count', () => {
  const target = { x: 11000, y: 11000 }, { route } = bounded(scene(sealed(target)), { x: 10600, y: 10600 }, target, { expansions: 300 })
  expect(route).toMatchObject({ status: 'exhausted', points: [], work: { bound: 'expansions', expansions: 300 } })
})

it('says no-path, with its work, when the mover is sealed in', () => {
  const start = { x: 2000, y: 2000 }, { route } = bounded(scene(sealed(start)), start, { x: 4000, y: 2000 }, {})
  expect(route.status).toBe('no-path')
  expect(route.work.bound).toBeUndefined()
  expect(route.work.expansions).toBeGreaterThan(0)
})

it('reports its work with every found idle route', () => {
  const { route } = bounded(scene(), { x: 128, y: 256 }, { x: 1024, y: 256 }, undefined)
  expect(route.status).toBe('found')
  expect([route.work?.expansions, route.work?.yields, route.work?.milliseconds].every(Number.isFinite)).toBe(true)
})
