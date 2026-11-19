// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it, vi } from 'vitest'
import { deferStart, onFirstUse } from '../src/startup.ts'

class StartTarget extends EventTarget {
  jobs = new Map<number, () => void>()
  sequence = 0
  setTimeout(callback: () => void, delay: number): number {
    expect(delay).toBe(0)
    const id = ++this.sequence; this.jobs.set(id, callback); return id
  }
  clearTimeout(id: number): void { this.jobs.delete(id) }
  run(): void { const jobs = [...this.jobs.values()]; this.jobs.clear(); for (const job of jobs) job() }
}

it('starts the page in a later task and removes its temporary close listeners', () => {
  const target = new StartTarget(), start = vi.fn(), remove = vi.spyOn(target, 'removeEventListener')
  deferStart(target, start)
  expect(start).not.toHaveBeenCalled(); expect(target.jobs.size).toBe(1)
  target.run(); expect(start).toHaveBeenCalledTimes(1); expect(target.jobs.size).toBe(0)
  expect(remove.mock.calls.map(call => call[0])).toEqual(['pagehide', 'unload'])
  target.dispatchEvent(new Event('unload')); target.run(); expect(start).toHaveBeenCalledTimes(1)
})

it.each(['pagehide', 'unload'])('cancels an unstarted page on %s without leaving a task', event => {
  const target = new StartTarget(), start = vi.fn(), remove = vi.spyOn(target, 'removeEventListener')
  const cancel = deferStart(target, start)
  target.dispatchEvent(new Event(event)); cancel(); target.run()
  expect(start).not.toHaveBeenCalled(); expect(target.jobs.size).toBe(0)
  expect(remove.mock.calls.map(call => call[0])).toEqual(['pagehide', 'unload', 'pagehide', 'unload'])
})

it('builds a first-use value on the first call, and only once', () => {
  const build = vi.fn(() => ({ made: true }))
  const value = onFirstUse(build)
  expect(build).not.toHaveBeenCalled()
  const first = value()
  expect(value()).toBe(first); expect(build).toHaveBeenCalledTimes(1)
})
