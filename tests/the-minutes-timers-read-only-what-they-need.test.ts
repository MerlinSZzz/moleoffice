// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TIMERS THAT HELD THE SERVER READ ONLY THE RECORDS THEY NEED. Wave 13y round 16, items 2 and 3.
 *
 * MEASURED FIRST, on a copy of the office at the live counts (10 October 2026): the flow reminders held the server
 * 560 to 750 ms every minute and the dead-letter sweep about 4.1 s every five minutes, with a secretary named. Each
 * read every session record whole, and the sweep did so again for every addressee it asked about.
 *
 * WHAT IS COUNTED: records read whole. drizzle turns each stored `data` field into an object with `JSON.parse`, so the
 * count of those calls is the count of records read whole. The second, third and fourth tests count them once without,
 * and once with, forty records the timer has no need to read, and the two counts must be the same. Before the fix each
 * of the forty was read whole at least once more, so the count grew by forty or more. The first counts the statements
 * that read a whole project, which drizzle prepares once for each read. The fifth reads SQLite's query plan for two
 * reads, with the values the pass bound to them.
 *
 * CONTROL: every test passes at the tip. MUTATIONS, each run and each red:
 *   1. `deadLettersNow` asks `thePresenceReadingsOf` again for every addressee (src/server/lib/deadletters.ts).
 *   2. `agentsWhoseRunsMayRead` reads every session whole again: its first read keeps every row.
 *   3. `closeTheOwnRowsWhoseProcessIsGone` passes no `alsoWhere` (src/server/lib/own-rows.ts).
 *   4. `closeTheRunningRowsWhoseDirectoryIsGone` passes no `alsoWhere` (src/server/lib/own-rows.ts).
 *   5. `runsCarryingAnExpectedTime` asks a plain json_extract for the state (src/server/lib/reminders.ts).
 *   6. `theRunsInTheMainWorld` asks a plain json_extract for the state (src/server/lib/main-world.ts).
 *   7. `closeTheHoldingRowsOfWorldsThatAreGone` reads every session row again (src/server/lib/isolated-worlds.ts).
 *
 * NOT HELD HERE, and said so: the cut by date in `activityPerAgent` and the sender index in the stale check's
 * `saidToday` change only what SQLite reads, not what is parsed or prepared, and the pass in this throwaway database
 * does not reach `theStartersOfARunningRun`. Each was measured on the copy, and the reminder tests hold their answers.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let folder: string
/** The records and agents a case filed, so the next case's whole-project readings see only its own. */
const filedRecords: { id: string; actor: { type: 'human' | 'agent' | 'system'; id: string } }[] = []
const filedAgents = new Set<string>()

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  // THE ROLE CARDS ARE READ ONCE, AS THE SERVER READS THEM WHEN IT STARTS: filing a message asks for them.
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
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
  for (const one of filedRecords) t.api.deleteRecord(one.id, one.actor)
  filedRecords.length = 0
  if (filedAgents.size > 0) {
    const ids = [...filedAgents]
    const marks = ids.map(() => '?').join(', ')
    t.client.sqlite.prepare(`DELETE FROM agents WHERE id IN (${marks})`).run(...ids)
    t.client.sqlite.prepare(`DELETE FROM assets WHERE id IN (${marks})`).run(...ids.map((id) => `avatar-default-agent-${id}`))
    filedAgents.clear()
  }
  rmSync(folder, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** How many records `work` read whole: the `JSON.parse` calls it made. */
function readWholeDuring(work: () => unknown): number {
  const parse = vi.spyOn(JSON, 'parse')
  try {
    work()
    return parse.mock.calls.length
  } finally {
    parse.mockRestore()
  }
}

/** The statements `work` prepared, in order: drizzle prepares one for every read it makes. */
function statementsDuring(work: () => unknown): string[] {
  const prepare = vi.spyOn(t.client.sqlite, 'prepare')
  try {
    work()
    return prepare.mock.calls.map((call) => String(call[0]))
  } finally {
    prepare.mockRestore()
  }
}

/**
 * Forty finished runs in `workspaceId`, none running, none speaking lately, none the office's own. Filed with no state
 * and then marked finished straight in the throwaway database: the door that finishes a run asks for a submission,
 * which is not what this test is about.
 */
function fortyFinishedRuns(workspaceId: string): void {
  for (let i = 0; i < 40; i++) {
    const run = t.api.createRecord({
      workspaceId, kind: 'session', title: `A finished test run ${String(i)}`,
      data: { lastOutputAt: '2020-01-01 00:00:00', servingAgent: `finished-${String(i)}` },
      actor: { type: 'agent', id: `finished-${String(i)}` },
    })
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run.id)
  }
}

/** A registry row for one test agent, written straight into the throwaway database. */
function anAgent(id: string): void {
  filedAgents.add(id)
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${id}`, '2026-09-01 08:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) VALUES (?,?,?,?,0,NULL,?)')
    .run(id, id, id, `avatar-default-agent-${id}`, '2026-09-01 08:00:00')
}

function aLetterTo(id: string): void {
  const letter = t.api.createRecord({
    workspaceId: 'default', kind: 'message', title: `A test letter to ${id}`,
    data: { body: 'Words for the addressee.', to: [{ kind: 'agent', id }] },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
  filedRecords.push({ id: letter.id, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
}

it('the dead-letter sweep reads each project once, however many addressees it asks about', async () => {
  fortyFinishedRuns('default')
  const { deadLettersNow } = await import('../src/server/lib/deadletters.ts')
  const addressees = ['ag-four-addressee', 'ag-one-addressee', 'ag-three-addressee', 'ag-two-addressee']
  for (const id of addressees) {
    anAgent(id)
    aLetterTo(id)
  }
  // A READ OF A WHOLE PROJECT: every record of one kind in it, which is how the presence readings begin. Before the fix
  // each addressee began them again, four reads here; at the live counts that was 4.1 s every five minutes.
  const ofAWholeProject = statementsDuring(() => deadLettersNow()).filter(
    (one) => one.includes('"records"."workspace_id" = ?') && !one.includes('"records"."id" in'),
  )
  expect(ofAWholeProject, 'reads of a whole project for four addressees in one project').toHaveLength(1)
  expect(deadLettersNow().map((letter) => letter.to.id).sort()).toEqual(addressees)
})

it('the dead-letter sweep reads whole only the runs that may still read their mail', async () => {
  anAgent('ag-gone-addressee')
  aLetterTo('ag-gone-addressee')
  const { deadLettersNow } = await import('../src/server/lib/deadletters.ts')
  const without = readWholeDuring(() => deadLettersNow())
  fortyFinishedRuns('elsewhere')
  const withThem = readWholeDuring(() => deadLettersNow())
  expect(deadLettersNow()).toHaveLength(1)
  expect(withThem, 'forty finished runs in a project with no letter').toBe(without)
})

it('the closer of the office’s own rows reads only those rows', async () => {
  const { closeTheOwnRowsWhoseProcessIsGone } = await import('../src/server/lib/own-rows.ts')
  const close = (): unknown => closeTheOwnRowsWhoseProcessIsGone({ workspaceId: 'default', actor: { type: 'system', id: 'mole-office' }, now: new Date() })
  const without = readWholeDuring(close)
  fortyFinishedRuns('default')
  expect(readWholeDuring(close), 'forty finished runs that are not the office’s own').toBe(without)
})

it('one pass of the flow reminders reads none of forty finished runs and forty old letters', async () => {
  const { sendTheRemindersThatAreDue } = await import('../src/server/lib/reminders.ts')
  const now = new Date()
  const since = new Date(now.getTime() - 60 * 60_000)
  const pass = (): unknown => sendTheRemindersThatAreDue('default', now, since, folder)
  pass()
  const without = readWholeDuring(pass)
  fortyFinishedRuns('default')
  const threeDaysAgo = localStamp(new Date(now.getTime() - 3 * 24 * 3_600_000))
  anAgent('ag-reader')
  anAgent('ag-writer')
  for (let i = 0; i < 40; i++) {
    const letter = t.api.createRecord({
      workspaceId: 'default', kind: 'message', title: `An old test letter ${String(i)}`,
      data: { body: 'Old words.', to: [{ kind: 'agent', id: 'ag-reader' }] },
      actor: { type: 'agent', id: 'ag-writer' },
    })
    t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run(threeDaysAgo, threeDaysAgo, letter.id)
    filedRecords.push({ id: letter.id, actor: { type: 'agent', id: 'ag-writer' } })
  }
  pass()
  expect(readWholeDuring(pass), 'forty finished runs and forty letters from three days ago').toBe(without)
})

/**
 * The statements `work` ran with the values bound to each, and each one's query plan in SQLite's words. The plan is
 * asked with the same values: whether a partial index applies is decided from the bound `kind`.
 */
function thePlansDuring(work: () => unknown): { sql: string; plan: string }[] {
  const ran: { sql: string; values: unknown[] }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    for (const method of ['all', 'get', 'run', 'iterate'] as const) {
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
    .filter((one) => !/^\s*(insert|update|delete)/i.test(one.sql))
    .map((one) => ({
      sql: one.sql,
      plan: (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.values) as { detail: string }[])
        .map((step) => step.detail)
        .join('; '),
    }))
}

it('one pass of the flow reminders finds the running runs through their index', async () => {
  const { sendTheRemindersThatAreDue } = await import('../src/server/lib/reminders.ts')
  const now = new Date()
  const plans = thePlansDuring(() => sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - 3_600_000), folder))
  // THE RUNS PAST THEIR EXPECTED TIME (lib/reminders.ts) AND THE RUNS IN THE MAIN WORLD (lib/main-world.ts). Asked as a
  // plain json_extract, each read every session record of the project.
  for (const marker of ["'$.expectedMinutes') IS NOT NULL", "'$.sandbox') IS NULL"]) {
    const read = plans.filter((one) => one.sql.includes(marker))
    expect(read, `the read marked ${marker}`).toHaveLength(1)
    expect(read[0]!.plan, `the read marked ${marker}`).toContain('USING INDEX records_session_running_idx')
  }
})
