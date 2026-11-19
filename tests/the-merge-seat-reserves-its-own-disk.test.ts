// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The full-suite seat waits for the test's own expected disk use above the floor. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const standIn = vi.hoisted(() => ({ free: null as number | null, asks: 0, measured: [] as (number | null)[], waits: 0, logs: [] as string[] }))
vi.mock('../tools/merge-tool/arguments.mjs', () => ({
  API: 'http://seat.invalid', WORKSPACE: 'default', WORKDIR: '/tmp', LOG: '/tmp/seat.log', STATE_FILE: '/tmp/seat-state', STEPS_FILE: '/tmp/seat-steps', THIS_CHECKOUT: '/tmp',
  MIGRATIONS_FOLDER: 'drizzle/', RERUN_LIMITS: {}, GIT_IDENTITY: {}, ABSENT: 'absent',
  chosen: {as: 'test', session: 'test', entry: 'test', officeFor: 1, slotFor: 10, slotEvery: 0},
}))
vi.mock('../tools/merge-tool/cleanup.mjs', () => ({startCleanup: () => {}, keepForCleanup: () => {}}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  MergerFailure: class extends Error {}, fail: (why: string) => { throw new Error(why) }, log: (line: string) => standIn.logs.push(line),
  readState: () => ({}), readStateAt: () => ({}), writeState: () => {}, writeStateAt: () => {}, stamp: () => '',
}))

beforeEach(() => { standIn.free = 0; standIn.asks = 0; standIn.measured = []; standIn.waits = 0; standIn.logs = [] })
afterEach(() => vi.unstubAllGlobals())

it('asks for a seat only after the floor and the expected peak are available', async () => {
  const keeper = await import('../tools/merge-tool/office-keeper.mjs')
  const floor = Reflect.get(keeper, 'FULL_SUITE_DISK_FLOOR_BYTES') as number
  const peak = Reflect.get(keeper, 'FULL_SUITE_EXPECTED_PEAK_BYTES') as number
  expect(floor).toBeGreaterThan(0)
  expect(peak).toBeGreaterThan(0)
  standIn.free = null
  vi.stubGlobal('fetch', vi.fn(async () => {
    standIn.asks++
    standIn.measured.push(standIn.free)
    if (standIn.free === null || standIn.free < floor + peak) throw new Error('The seat was asked for before the disk had room.')
    return new Response(JSON.stringify({slot: {id: 'fake', state: 'granted', seat: 1}}), {status: 200})
  }))
  const slot = await keeper.acquireFullSuiteSeat({
    rootFreeBytes: () => standIn.free,
    wait: async () => { standIn.waits++; expect(standIn.asks).toBe(0); standIn.free = floor + peak - (standIn.waits === 1 ? 1 : 0) },
  })
  expect(standIn.waits).toBe(2)
  expect(standIn.measured).toEqual([floor + peak])
  expect(slot.state).toBe('granted')
  expect(standIn.logs.join(' ')).toContain('disk')
})
