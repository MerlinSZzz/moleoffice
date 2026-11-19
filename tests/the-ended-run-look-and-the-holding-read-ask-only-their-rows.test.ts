// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ENDED-RUN LOOK AND THE HOLDING-ROW READ ASK SQLITE ONLY FOR THEIR OWN ROWS. Wave 13y round 21, item 3.
 *
 * MEASURED FIRST, on a made-up office of the live size (2.80 GB, 9,424 sessions), with every named timer's run written
 * to the log: the flow reminders took 98 to 231 ms a minute and the ended-run look 55 to 143 ms every thirty seconds.
 * The look asked two questions that parsed the JSON of every session row by the kind index, 31 and 26 ms on that
 * office, to find the runs marked for a later look, which are few. The holding-row read of the flow reminders compared
 * the start of every session title of the project, 7.4 ms.
 *
 * WHAT THIS HOLDS:
 *   1. the look and its list of projects find the marked runs by id, from the kept session fields
 *      (lib/session-fields.ts), and no statement they run reads by the kind index;
 *   2. a marked run whose record was deleted is still looked at, as before round 21: the kept fields hold the deleted
 *      rows with a look due apart from the live ones;
 *   3. the holding-row read finds its rows by the title index, and still closes a holding row whose world is gone.
 *
 * CONTROL: all three pass at the tip. MUTATIONS, each red, then put back:
 *   1. `lookAgainAtTheEndedRuns` asks its old question over every session again (lib/resources.ts): test 1;
 *   2. `theSessionIdsWithALookDue` leaves out the deleted rows (lib/session-fields.ts): test 2;
 *   3. `closeTheHoldingRowsOfWorldsThatAreGone` compares `substr` of the title again (lib/isolated-worlds.ts): test 3.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { ENDED_RUN_LOOK_FIELD } from '../src/shared/ended-run-resources.ts'
import { localStamp } from '../src/shared/time.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let folder: string

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
}, 60_000)

afterAll(() => {
  t.close()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'mole-office-test-worlds-'))
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** A made-up session in the default project, written straight into the throwaway database with this state. */
function aRun(title: string, state: string): string {
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data: {}, actor: t.api.HUMAN })
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', ?) WHERE id = ?").run(state, run.id)
  return run.id
}

/** Mark a made-up finished run for a later look, an hour ago, as the office marks a run whose rows stayed open. */
function marked(id: string): void {
  const anHourAgo = localStamp(new Date(Date.now() - 3_600_000))
  t.client.sqlite.prepare('UPDATE records SET data = json_set(data, ?, ?), updated_at = ? WHERE id = ?')
    .run(`$.${ENDED_RUN_LOOK_FIELD}`, anHourAgo, localStamp(new Date()), id)
}

function theMark(id: string): unknown {
  return (t.client.sqlite.prepare('SELECT json_extract(data, ?) AS mark FROM records WHERE id = ?').get(`$.${ENDED_RUN_LOOK_FIELD}`, id) as { mark: unknown }).mark
}

/** Each statement `work` ran that reads, with its query plan in SQLite's words for the values it was given. */
function thePlansDuring(work: () => unknown): { sql: string; plan: string }[] {
  const ran: { sql: string; values: unknown[] }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    for (const method of ['all', 'get', 'iterate'] as const) {
      const real = statement[method].bind(statement) as (...values: unknown[]) => unknown
      ;(statement as unknown as Record<string, unknown>)[method] = (...values: unknown[]) => {
        ran.push({ sql: source, values })
        return real(...values)
      }
    }
    return statement
  }) as never)
  try {
    work()
  } finally {
    spy.mockRestore()
  }
  return ran
    .filter((one) => /^\s*select/i.test(one.sql))
    .map((one) => ({
      sql: one.sql,
      plan: (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.values) as { detail: string }[])
        .map((step) => step.detail)
        .join('; '),
    }))
}

it('the ended-run look finds its marked runs by id and reads nothing by the kind index', async () => {
  for (let i = 0; i < 20; i++) aRun(`A finished test run ${String(i)}`, 'finished')
  const due = aRun('A marked test run', 'finished')
  marked(due)
  const { startTheEndedRunResourceTimers } = await import('../src/server/lib/resources.ts')
  const logged: string[] = []
  let stop = (): void => undefined
  const plans = thePlansDuring(() => { stop = startTheEndedRunResourceTimers((line) => logged.push(line)) })
  stop()
  expect(logged).toEqual([])
  expect(theMark(due), 'the marked run was looked at and its mark cleared').toBeNull()
  const theLooks = plans.filter((one) => one.sql.includes('json_type(data, ?) IS NOT NULL'))
  expect(theLooks.length, 'the look and its list of projects').toBeGreaterThanOrEqual(2)
  for (const one of theLooks) expect(one.plan, one.sql).not.toContain('records_kind_idx')
})

it('a marked run whose record was deleted is still looked at', async () => {
  const due = aRun('A deleted marked test run', 'finished')
  marked(due)
  t.client.sqlite.prepare('UPDATE records SET deleted_at = ?, updated_at = ? WHERE id = ?').run(localStamp(new Date()), localStamp(new Date()), due)
  const { lookAgainAtTheEndedRuns } = await import('../src/server/lib/resources.ts')
  const logged: string[] = []
  lookAgainAtTheEndedRuns('default', Date.now, (line) => logged.push(line))
  expect(logged).toEqual([])
  expect(theMark(due), 'the deleted run was looked at and its mark cleared').toBeNull()
})

it('the holding-row read finds its rows by the title index and closes a holding row whose world is gone', async () => {
  for (let i = 0; i < 20; i++) aRun(`A running test run ${String(i)}`, 'running')
  const holding = aRun('Holding isolated world made-up-gone', 'running')
  const { closeTheHoldingRowsOfWorldsThatAreGone } = await import('../src/server/lib/isolated-worlds.ts')
  let closed: string[] = []
  const plans = thePlansDuring(() => {
    closed = closeTheHoldingRowsOfWorldsThatAreGone({ workspaceId: 'default', folder, now: new Date(), actor: { type: 'system', id: 'mole-office' } })
  })
  expect(closed).toEqual([holding])
  const theRead = plans.filter((one) => one.sql.includes('"records"."title" >= ?') || one.sql.includes('substr("records"."title"'))
  expect(theRead, 'the holding-row read').toHaveLength(1)
  expect(theRead[0]!.plan).toContain('USING INDEX records_title_idx')
})
