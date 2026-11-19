// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { GeometryClient, type WorkerPort } from '../src/geometry-client.ts'
import { layoutKey, type Layout } from '../src/geometry.ts'
import type { GeometryReply, GeometryRequest } from '../src/worker-protocol.ts'

// Every id here is made up. The worker is a stand-in: the test writes its replies by hand.
const input = { rooms: [{ id: 'invented-room', occupants: ['invented-a', 'invented-b'] }] }
const floor = [[{ x: 0, y: 0 }, { x: 64, y: 0 }, { x: 64, y: 64 }, { x: 0, y: 64 }]]
const stool = { x: 20, y: 20, width: 12, height: 12, kind: 'stool' as const }
const house = { x: 0, y: 0, width: 64, height: 64, group: 'invented-group', module: 0, style: 'invented-style', occupants: ['invented-a', 'invented-b'], anchor: { x: 32, y: 64 }, doors: [], openings: [], hitArea: [], walkable: [] } as Layout['houses'][number]
const final = (): Layout => ({ key: layoutKey(input), bounds: { x: 0, y: 0, width: 64, height: 64 }, rooms: [], seats: {}, obstacles: [], road: { halfWidth: 39, rings: [], ends: [], faults: [] }, bodyRadius: 16, houses: [], square: { x: 0, y: 0, width: 1, height: 1 }, pieces: [] })

class HandWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null
  onerror: WorkerPort['onerror'] = null
  requests: GeometryRequest[] = []
  postMessage(request: GeometryRequest): void { this.requests.push(request) }
  terminate(): void {}
  send(reply: GeometryReply): void { this.onmessage?.({ data: reply } as MessageEvent<GeometryReply>) }
}
function ready(floors: Layout['houses'][number]['walkable'][]) {
  const workers: HandWorker[] = []
  const client = new GeometryClient(() => { const worker = new HandWorker(); workers.push(worker); return worker }, () => {})
  client.setContext('invented-boundary', true); client.update(input)
  const worker = workers[0]!, id = worker.requests[0]!.id
  worker.send({ id, kind: 'drawing', chunk: { houses: [house] } })
  worker.send({ id, kind: 'drawing', chunk: { navigation: { floors } } })
  worker.send({ id, kind: 'drawing', chunk: { navigation: { obstacles: [stool] } } })
  worker.send({ id, kind: 'layout', layout: final() })
  return { client, workers }
}

it('builds the navigation layout from the floors and obstacles the worker sends, and leaves the drawing layout as it was', () => {
  const { client } = ready([floor])
  expect(client.snapshot().status).toBe('ready')
  const drawn = client.snapshot().layout!, ground = client.navigation()!
  expect([drawn.houses[0]!.walkable, drawn.obstacles]).toEqual([[], []])
  expect([ground.houses[0]!.walkable, ground.obstacles, ground.key]).toEqual([floor, [stool], drawn.key])
})

it('fails loudly when the number of floors is not the number of houses', () => {
  const { client } = ready([])
  expect(client.snapshot()).toEqual({ layout: null, status: 'unavailable', failure: { cause: 'worker', message: 'The worker sent 0 walkable floors, and the layout has 1 houses.' } })
  expect(client.navigation()).toBeNull()
})

it('keeps the navigation layout when a visibility change keeps the layout', () => {
  const { client } = ready([floor]), before = client.navigation()
  client.setContext('invented-boundary', false, true); client.setContext('invented-boundary', true, true); client.update(input)
  expect(client.snapshot().status).toBe('ready')
  expect(client.navigation()).toBe(before)
})

it('keeps the navigation layout when an idle route is interrupted', () => {
  const { client } = ready([floor]), before = client.navigation(), answers: unknown[] = []
  client.idleRoute('invented-a', { x: 8, y: 8 }, { x: 40, y: 40 }, [], { x: -6, y: -20, width: 12, height: 20 }, [], route => answers.push(route))
  client.interruptRoute()
  expect([answers, client.snapshot().status]).toEqual([[null], 'ready'])
  expect(client.navigation()).toBe(before)
})

it('takes a layout sent whole, with no drawing message, as its own navigation layout', () => {
  const workers: HandWorker[] = []
  const client = new GeometryClient(() => { const worker = new HandWorker(); workers.push(worker); return worker }, () => {})
  client.setContext('invented-boundary', true); client.update(input)
  const worker = workers[0]!, whole = { ...final(), houses: [{ ...house, walkable: floor }], obstacles: [stool] }
  worker.send({ id: worker.requests[0]!.id, kind: 'layout', layout: whole })
  expect(client.snapshot().status).toBe('ready')
  expect(client.navigation()).toBe(client.snapshot().layout)
  expect([client.navigation()!.houses[0]!.walkable, client.navigation()!.obstacles]).toEqual([floor, [stool]])
})
