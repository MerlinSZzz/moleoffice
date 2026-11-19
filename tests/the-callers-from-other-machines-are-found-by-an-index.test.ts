// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CALLERS FROM OTHER MACHINES ARE COUNTED FROM ONE INDEX, WITHOUT READING THE CALL LOG. Wave 13w, round 25.
 *
 * Every machine reading (`GET /api/runtime`) asks `clientsFromOtherMachines` in src/server/lib/usage-reads.ts which
 * machines have called this API from somewhere else. Without an index SQLite read every row of `api_calls` and sorted
 * the remote ones: about 64 ms a reading on a copy of the made-up office grown to 1,400,252 call rows. Migration 0227
 * adds `api_calls_from_other_machines_idx`, which holds only the remote calls, and the same read took about 2 ms.
 *
 * WHY A PLAN AND NOT A TIME. A plan does not depend on load. This file asks SQLite for the plan of the query the
 * reading actually sends, on a fresh database with the product's own migrations, with the value it actually binds.
 *
 * MUTATIONS (after a green control):
 *   - delete the CREATE INDEX statement from drizzle/0227_the_callers_from_other_machines_are_found_by_an_index.sql:
 *     red, the plan sorts every remote row;
 *   - make `clientsFromOtherMachines` filter with `like` instead of `eq`: red, SQLite can no longer prove the query
 *     asks only for the rows the index holds.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let reads: typeof import('../src/server/lib/usage-reads.ts')

beforeAll(async () => {
  t = await freshDb()
  reads = await import('../src/server/lib/usage-reads.ts')
}, 60_000)

afterAll(() => {
  vi.restoreAllMocks()
  t.close()
})

it('counts the callers from other machines from the partial index alone, with no sort', () => {
  const seen: { sql: string; values: unknown[] }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((sql: string) => {
    const statement = prepare(sql)
    if (!/\bapi_calls\b/.test(sql)) return statement
    // The values the reading binds, so the plan is asked for with the same ones. Drizzle calls `raw()` before `all()`.
    const watched = (target: object): object => new Proxy(target, {
      get: (on, name) => {
        const value = Reflect.get(on, name) as unknown
        if (typeof value !== 'function') return value
        const call = value as (...v: unknown[]) => unknown
        if (name === 'raw') return (...v: unknown[]) => watched(call.apply(on, v) as object)
        if (name !== 'all') return call.bind(on)
        return (...values: unknown[]) => { seen.push({ sql, values }); return call.apply(on, values) }
      },
    })
    return watched(statement)
  }) as typeof t.client.sqlite.prepare)
  reads.clientsFromOtherMachines()
  spy.mockRestore()
  expect(seen, 'clientsFromOtherMachines sent no query over api_calls this file could find').toHaveLength(1)
  const { sql, values } = seen[0]!
  const plan = (t.client.sqlite.prepare(`explain query plan ${sql}`).all(...values) as { detail: string }[]).map((step) => step.detail).join(' | ')
  const why = `The count of the callers from other machines is planned as "${plan}". It has to read ` +
    'api_calls_from_other_machines_idx alone: without it SQLite reads every call row and sorts the remote ones, about ' +
    `64 ms a machine reading at the live office's size. The query:\n${sql}`
  expect(plan, why).toContain('USING COVERING INDEX api_calls_from_other_machines_idx')
  expect(plan, why).not.toContain('TEMP B-TREE')
})
