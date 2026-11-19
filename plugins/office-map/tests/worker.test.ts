// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it, vi } from 'vitest'
import { search, searchSteps } from '../src/search.ts'
import { GeometryClient, type WorkerPort } from '../src/geometry-client.ts'
import { GeometryEngine, type GeometryReply, type GeometryRequest } from '../src/worker-protocol.ts'
import { mountGeometryWorker, type GeometryPort } from '../src/geometry-runner.ts'
import { LayoutCache } from '../src/geometry.ts'

const firstInput = { rooms: [{ id: 'one', occupants: ['a', 'b'] }] }

it('yields within a route search and preserves its exact path and exhaustion result', () => {
  let visited = 0, maximum = 0, before = 0
  const cost = () => { visited++; return 1 }
  const work = searchSteps({ x: 0, y: 0 }, p => p.x === 400, cost, p => 400 - p.x, 1, 1000, [{ x: 1, y: 0 }])
  let next = work.next(), turns = 0
  while (!next.done) { turns++; maximum = Math.max(maximum, visited - before); before = visited; next = work.next() }
  maximum = Math.max(maximum, visited - before)
  expect(turns).toBeGreaterThan(20); expect(maximum).toBeLessThanOrEqual(16)
  expect(next.value).toEqual(search({ x: 0, y: 0 }, p => p.x === 400, () => 1, p => 400 - p.x, 1, 1000, [{ x: 1, y: 0 }]))
  const exhausted = searchSteps({ x: 0, y: 0 }, () => false, () => 1, () => 0, 1, 17, [{ x: 1, y: 0 }])
  let end = exhausted.next(); while (!end.done) end = exhausted.next()
  expect(end.value).toBe('ran out')
})

it('lets the actual worker route request yield before publishing the exact cached result', () => {
  const engine = new GeometryEngine()
  const layout = engine.receive({ id: 1, kind: 'layout', input: firstInput })
  expect(layout?.kind).toBe('layout')
  if (layout?.kind !== 'layout') throw Error('Missing layout')
  const request = { id: 2, kind: 'route' as const, layoutKey: layout.layout.key, from: 'a', to: 'b' }
  const work = engine.work(request)
  let next = work.next(); expect(next.done).toBe(false)
  while (!next.done) next = work.next()
  expect(next.value).toMatchObject({ kind: 'route', route: { status: 'found' } })
  expect(engine.receive({ ...request, id: 3 })).toEqual({ ...next.value, id: 3 })
  expect(engine.routeComputations).toBe(1)
})

it('bounds worker turns even when the clock does not advance', () => {
  let visited = 0
  const work = vi.spyOn(GeometryEngine.prototype, 'work').mockImplementation(function* () { for (let i = 0; i < 1000; i++) { visited++; yield }; return null })
  try {
    const jobs: (() => void)[] = [], port: GeometryPort = { onmessage: null, postMessage: () => {} }
    mountGeometryWorker(port, () => 0, fn => { jobs.push(fn); return jobs.length as unknown as ReturnType<typeof setTimeout> })
    port.onmessage!({ data: { id: 1, kind: 'layout', input: firstInput } } as MessageEvent<GeometryRequest>)
    expect(visited).toBe(64)
    while (jobs.length) { const before = visited; jobs.shift()!(); expect(visited - before).toBeLessThanOrEqual(64) }
    expect(visited).toBe(1000)
  } finally { work.mockRestore() }
})
class FakeWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null
  onerror: WorkerPort['onerror'] = null
  requests: GeometryRequest[] = []
  terminated = false
  readonly engine = new GeometryEngine()
  postMessage(request: GeometryRequest): void { this.requests.push(request) }
  terminate(): void { this.terminated = true }
  answer(index: number): void { const reply = this.engine.receive(this.requests[index]!); if (reply) this.onmessage?.({ data: reply } as MessageEvent<GeometryReply>) }
}
function harness() {
  const workers: FakeWorker[] = [], replies: unknown[] = []
  const client = new GeometryClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker }, reply => replies.push(reply))
  client.setContext('en/light/garden', true)
  return { client, workers, replies }
}
describe('dedicated geometry worker lifecycle', () => {
  it('keeps the occupied map while a changed roster builds and ignores its loading preview', () => {
    const { client, workers } = harness()
    client.update(firstInput); workers[0]!.answer(0)
    const occupied = client.snapshot().layout, next = { rooms: [{ id: 'one', occupants: ['a', 'b', 'c'] }] }
    client.update(next)
    expect(client.snapshot()).toEqual({ layout: occupied, status: 'loading' })
    const worker = workers[0]!, progress = worker.engine.work(worker.requests[1]!).next().value!
    worker.onmessage!({ data: progress } as MessageEvent<GeometryReply>)
    expect(client.snapshot().layout).toBe(occupied)
    client.dispose()
  })
  it('drops an older layout reply and tags every request with an increasing id', () => {
    const { client, workers, replies } = harness()
    client.update(firstInput)
    const second = { rooms: [{ id: 'one', occupants: ['b', 'c'] }] }
    client.update(second)
    const worker = workers[0]!
    expect(worker.requests[0]!.id).toBeLessThan(worker.requests[1]!.id)
    worker.answer(0)
    expect(replies).toEqual([])
    worker.answer(1)
    expect(client.snapshot().layout).toEqual(new LayoutCache().layout(second))
    expect(replies).toHaveLength(1)
  })
  it('sends no work for identical rosters or routes, including cloned payloads', () => {
    const { client, workers } = harness()
    client.update(firstInput); client.update(structuredClone(firstInput))
    expect(workers[0]!.requests).toHaveLength(1)
    workers[0]!.answer(0)
    const routes: unknown[] = []
    client.route('a', 'b', route => routes.push(route)); workers[0]!.answer(1)
    client.route('a', 'b', route => routes.push(route))
    expect(workers[0]!.requests).toHaveLength(2)
    expect(routes).toHaveLength(2)
    expect(routes[0]).toEqual(routes[1])
  })
  it.each(['en/light/library', 'zh/light/garden', 'en/dark/garden'])('terminates on context change to %s, and drops even a captured old callback', context => {
    const { client, workers, replies } = harness()
    client.update(firstInput)
    const old = workers[0]!, listener = old.onmessage!
    const request = old.requests[0]!
    client.setContext(context, true)
    expect(old.terminated).toBe(true)
    expect(client.snapshot().layout).toBeNull()
    listener({ data: { id: request.id, kind: 'layout', layout: new LayoutCache().layout(firstInput) } } as MessageEvent<GeometryReply>)
    expect(replies).toEqual([])
    client.update(firstInput); workers[1]!.answer(0)
    expect(client.snapshot().layout).toEqual(new LayoutCache().layout(firstInput))
  })
  it('terminates on hiding and close, cancels a route callback, and stays quiet while inactive', () => {
    const { client, workers } = harness()
    client.update(firstInput); workers[0]!.answer(0)
    const cancelled: unknown[] = []
    client.route('a', 'b', route => cancelled.push(route))
    client.setContext('en/light/garden', false)
    expect(workers[0]!.terminated).toBe(true)
    expect(cancelled).toEqual([null])
    client.update(firstInput); expect(workers).toHaveLength(1)
    client.setContext('en/light/garden', true); client.update(firstInput)
    client.dispose(); expect(workers[1]!.terminated).toBe(true)
    client.setContext('another', true); client.update(firstInput); expect(workers).toHaveLength(2)
  })
  it('drops superseded route replies, while keeping found/exhausted/no-path results distinct', () => {
    const { client, workers } = harness()
    client.update(firstInput); workers[0]!.answer(0)
    const routes: unknown[] = []
    client.route('a', 'b', route => routes.push(route), 1)
    client.route('a', 'b', route => routes.push(route))
    expect(routes).toEqual([null])
    workers[0]!.answer(1); expect(routes).toEqual([null])
    workers[0]!.answer(2); expect(routes[1]).toMatchObject({ status: 'found' })
    client.route('a', 'b', route => routes.push(route), 1); workers[0]!.answer(3)
    expect(routes[2]).toEqual({ status: 'exhausted', points: [] })
  })
  it('does not restart workers over 300 visibility returns, and requires a fresh equal roster before reuse', () => {
    const { client, workers } = harness()
    client.update(firstInput); workers[0]!.answer(0)
    const layout = client.snapshot().layout
    for (let i = 0; i < 300; i++) {
      client.setContext(`hidden-${i}`, false, true)
      expect(client.snapshot().layout).toBeNull()
      client.setContext(`shown-${i}`, true, true)
      expect(client.snapshot().layout).toBeNull()
      client.update(structuredClone(firstInput))
      expect(client.snapshot().layout).toBe(layout)
      expect(workers).toHaveLength(1)
    }
    client.setContext('hidden-change', false, true); client.setContext('shown-change', true, true)
    client.update({ rooms: [{ id: 'one', occupants: ['a', 'new'] }] })
    expect(workers).toHaveLength(2); expect(client.snapshot().layout).toBeNull()
    client.dispose(); expect(workers[1]!.terminated).toBe(true)
  })
  it('offers a whole-office overview during sliced layout and drops superseded progress', () => {
    const { client, workers } = harness()
    client.update(firstInput)
    const worker = workers[0]!, work = worker.engine.work(worker.requests[0]!)
    const progress = work.next().value!
    worker.onmessage!({ data: progress } as MessageEvent<GeometryReply>)
    expect(client.snapshot()).toMatchObject({ status: 'loading', layout: { rooms: [{ id: 'one' }] } })
    client.setContext('new boundary', true)
    worker.onmessage?.({ data: progress } as MessageEvent<GeometryReply>)
    expect(client.snapshot().layout).toBeNull()
    work.return(null)
  })
  it('fails visibly when the worker cannot start, with no repeated attempts for equal reads', () => {
    let attempts = 0
    const changed: unknown[] = []
    const client = new GeometryClient(() => { attempts++; throw Error('Unavailable') }, state => changed.push(state))
    client.setContext('context', true); client.update(firstInput); client.update(structuredClone(firstInput))
    expect(attempts).toBe(1)
    expect(changed).toEqual([{ layout: null, status: 'unavailable', failure: { cause: 'worker', message: 'Unavailable' } }])
  })
  it('drops partial drawing buffers on context changes and close, and ignores their stale continuations', () => {
    const { client, workers } = harness()
    client.update(firstInput)
    const worker = workers[0]!, listener = worker.onmessage!, id = worker.requests[0]!.id
    const chunk: GeometryReply = { id, kind: 'drawing', chunk: { roadDrawing: [new Float64Array([1, 4, 8])] } }
    listener({ data: chunk } as MessageEvent<GeometryReply>)
    const held = client as unknown as { drawing: { roadDrawing: Float64Array[] } | null }
    expect(held.drawing?.roadDrawing).toHaveLength(1)
    client.setContext('different', true); expect(held.drawing).toBeNull()
    listener({ data: chunk } as MessageEvent<GeometryReply>); expect(held.drawing).toBeNull()
    client.update(firstInput)
    workers[1]!.onmessage!({ data: { ...chunk, id: workers[1]!.requests[0]!.id } } as MessageEvent<GeometryReply>)
    expect(held.drawing).not.toBeNull(); client.dispose(); expect(held.drawing).toBeNull()
    expect(workers.every(worker => worker.terminated)).toBe(true)
  })
  it('interrupts a slow cosmetic route without losing the static layout or restarting work while idle', () => {
    const { client, workers } = harness()
    client.update(firstInput); workers[0]!.answer(0)
    const layout = client.snapshot().layout, routes: unknown[] = []
    client.route('a', 'b', route => routes.push(route)); const old = workers[0]!, listener = old.onmessage!
    client.interruptRoute()
    expect(old.terminated).toBe(true); expect(routes).toEqual([null]); expect(client.snapshot().layout).toBe(layout)
    client.update(firstInput); expect(workers).toHaveLength(1)
    client.route('a', 'b', route => routes.push(route))
    expect(workers).toHaveLength(2); expect(workers[1]!.requests[0]?.kind).toBe('layout')
    listener(new MessageEvent<GeometryReply>('message', { data: { id: old.requests[1]!.id, kind: 'route', route: { status: 'found', points: [] } } }))
    expect(routes).toEqual([null])
    workers[1]!.answer(0); expect(workers[1]!.requests[1]?.kind).toBe('route')
    workers[1]!.answer(1); expect(routes[1]).toMatchObject({ status: 'found' })
  })
  it('keeps the complete static map while a route restart sends a progress overview', () => {
    const { client, workers } = harness()
    client.update(firstInput); workers[0]!.answer(0)
    const layout = client.snapshot().layout
    client.route('a', 'b', () => {}); client.interruptRoute()
    client.route('a', 'b', () => {})
    const worker = workers[1]!, request = worker.requests[0]!, progress = worker.engine.work(request).next().value!
    worker.onmessage!({ data: progress } as MessageEvent<GeometryReply>)
    expect(client.snapshot().layout).toBe(layout)
    expect(Object.keys(client.snapshot().layout!.seats)).toEqual(['a', 'b'])
    client.dispose(); expect(worker.terminated).toBe(true)
  })
  it('cancels an interrupted worker restart on context teardown', () => {
    const { client, workers } = harness(), routes: unknown[] = []
    client.update(firstInput); workers[0]!.answer(0); client.route('a', 'b', route => routes.push(route)); client.interruptRoute()
    client.route('a', 'b', route => routes.push(route)); client.setContext('another', false)
    expect(workers[1]!.terminated).toBe(true); expect(routes).toEqual([null, null]); expect(client.snapshot().layout).toBeNull()
  })
})

it('cancels old scheduled layout slices and ignores stale messages without cancelling the latest work', () => {
  const jobs = new Map<number, () => void>(), replies: GeometryReply[] = []
  let time = 0, id = 0
  const port: GeometryPort = { onmessage: null, postMessage: reply => replies.push(reply as GeometryReply) }
  mountGeometryWorker(port, () => ++time, fn => { jobs.set(++id, fn); return id as unknown as ReturnType<typeof setTimeout> }, job => { jobs.delete(job as unknown as number) })
  const send = (data: GeometryRequest) => port.onmessage!({ data } as MessageEvent<GeometryRequest>)
  send({ id: 1, kind: 'layout', input: { rooms: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, occupants: [`p${i}`] })) } })
  const old = [...jobs.values()][0]!
  expect(jobs.size).toBe(1)
  send({ id: 2, kind: 'layout', input: firstInput })
  const pending = jobs.size
  send({ id: 1, kind: 'layout', input: { rooms: [] } })
  expect(jobs.size).toBe(pending)
  old()
  for (let turns = 0; jobs.size && turns < 1000; turns++) { const [key, fn] = [...jobs.entries()][0]!; jobs.delete(key); fn() }
  expect(jobs.size).toBe(0)
  expect(replies.some(r => r.id === 1 && r.kind === 'layout')).toBe(false)
  expect(replies.at(-1)).toMatchObject({ id: 2, kind: 'layout', layout: { key: JSON.stringify([['one', ['a', 'b']]]) } })
})
