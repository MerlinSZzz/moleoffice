// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MINUTE'S REMINDERS AND A RECORD'S DECISIONS FIND THE RUNS AND DECISIONS THEY NAME BY THEIR ID. Wave 13y round 35,
 * item 4.
 *
 * MEASURED FIRST, on 15 October 2026, on a copy of an office with 7,835 runs and 805 decisions. Three reads name their
 * rows by id and ask their kind as well, and SQLite walked every record of that kind through `records_kind_idx` and
 * tested each id against the list:
 * - the runs that went quiet still saying they are running, read by the reminders every minute: 157 ids, 8.8 ms;
 * - the runs a cause stopped, read by the reminders every minute: 4 ids, 8.3 ms;
 * - the decisions about a record, read by its page: 11 ids, 0.15 ms.
 * The kind asked so that no index is chosen for it (`theKindOfARowFoundById`) was not enough for the two runs' reads:
 * SQLite chose the project's index instead, 16 ms. With the project asked the same way, both used the primary key:
 * 0.40 ms and 0.03 ms.
 *
 * WHAT THIS HOLDS. Each of the three reads is planned by SQLite through the primary key and through nothing else on
 * `records`. The plan of each is read from SQLite itself, with the values bound to it, as
 * tests/the-dead-letters-find-their-messages-and-runs-by-id.test.ts reads it. Each read is seen at least once, so a
 * road that stopped reaching one would not pass by reading nothing: the runs and decisions each gives back are the ones
 * written.
 *
 * WHAT IT DOES NOT HOLD. How long a read takes; the times are in the round's report. What the reminders do with a run,
 * which tests/a-stopped-run-tells-the-person-once-as-the-office.test.ts holds, and which decisions a record lists,
 * which tests/a-module-lists-the-decisions-about-it.test.ts holds.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_CAUSES_THEY_MUST_ACT_ON } from '../src/config/stopped-run-cause.mjs'

let t: TestDb
let scratch: string

const OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const
const NOW = new Date()
const TEN_MINUTES_AGO = new Date(NOW.getTime() - 10 * 60_000)

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  scratch = mkdtempSync(join(tmpdir(), 'r35-by-id-'))
  // THE ROLE CARDS ARE READ ONCE, AS THE SERVER READS THEM WHEN IT STARTS: a reminder names a card's duties.
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
})

afterEach(() => {
  t?.close()
  rmSync(scratch, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

/** Every read `work` made that names records by id, with SQLite's plan for it, asked with the values bound to it. */
function theReadsByIdDuring(work: () => unknown): { sql: string; values: unknown[]; plan: string[] }[] {
  const ran: { sql: string; values: unknown[] }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    if (!/^\s*select\b/i.test(source) || !/"records"\."id" in \(/i.test(source)) return statement
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
  return ran.map((one) => ({
    ...one,
    plan: (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.values) as { detail: string }[]).map((step) => step.detail),
  }))
}

/**
 * A plan step on `records` that is not the primary key looking up the ids asked for. The reminders' two reads give
 * their rows in the order they were stored, so a sort of the rows found is not a step on `records`.
 */
const NOT_BY_ITS_ID = (step: string): boolean => /\brecords\b/.test(step) && !/^SEARCH records USING INDEX sqlite_autoindex_records_1 \(id=\?\)$/.test(step)

/** Each plan step on `records`, in each read, that is not the primary key: one line each. */
const notByItsId = (reads: readonly { sql: string; plan: string[] }[]): string =>
  reads.flatMap((one) => one.plan.filter(NOT_BY_ITS_ID).map((step) => `${step} in: ${one.sql.slice(0, 160)}`)).join('\n')

/** A run that still says it is running, last heard ten minutes ago, whose transcript names no cause. */
function aQuietRun(n: number): string {
  const transcript = join(scratch, `quiet-${String(n)}.jsonl`)
  writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Working.' }] } })}\n`, 'utf8')
  return t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: `A quiet test run ${String(n)}`,
    data: { state: 'running', lastOutputAt: localStamp(TEN_MINUTES_AGO), extra: { discovered: { tool: 'claude-code', externalId: `quiet-${String(n)}`, logPath: transcript } } },
    actor: OWNER,
  }).id
}

/** A run a cause the person must act on closed, the way the hook leaves it. */
function aRunStoppedBy(cause: string, n: number): string {
  const said = `A test limit, number ${String(n)}.`
  return t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: `A test run stopped by ${cause}, ${String(n)}`,
    data: { state: 'crashed', closedAt: localStamp(TEN_MINUTES_AGO), closedBecause: said, closedHow: 'provider-event', stopCause: { kind: cause, said, at: null, resetsAt: null } },
    actor: OWNER,
  }).id
}

it("the minute's reminders find the quiet runs and the stopped runs they name through the primary key", async () => {
  const reminders = await import('../src/server/lib/reminders.ts')
  // FOUR OR MORE OF EACH, because SQLite looks one id up by its key whatever else the read asks, and walks an index
  // only for a list of several.
  const quiet = [1, 2, 3, 4, 5].map(aQuietRun)
  const stopped = THE_CAUSES_THEY_MUST_ACT_ON.flatMap((cause) => [1, 2].map((n) => aRunStoppedBy(cause, n)))
  expect(stopped.length).toBeGreaterThanOrEqual(4)

  const reads = theReadsByIdDuring(() => reminders.sendTheRemindersThatAreDue('default', NOW, new Date(NOW.getTime() - 60_000)))

  // EACH OF THE TWO READS IS SEEN, and each gives back the runs this case wrote.
  const ofQuietRuns = reads.filter((one) => one.values.includes('session') && one.sql.includes("'$.extra.discovered.logPath') IS NOT NULL"))
  const ofStoppedRuns = reads.filter((one) => one.values.includes('session') && one.sql.includes("'$.closedBecause') IS NOT NULL"))
  expect(ofQuietRuns.length, 'the reads of the runs that went quiet still saying running').toBeGreaterThan(0)
  expect(ofStoppedRuns.length, 'the reads of the runs a cause stopped').toBeGreaterThan(0)
  for (const [name, asked, written] of [['quiet', ofQuietRuns, quiet], ['stopped', ofStoppedRuns, stopped]] as const) {
    const found = asked.flatMap((one) => t.client.sqlite.prepare(one.sql).all(...one.values) as { id: string }[]).map((row) => row.id)
    expect(found.sort(), `the ${name} runs the read gives back`).toEqual([...written].sort())
  }

  expect(notByItsId([...ofQuietRuns, ...ofStoppedRuns]), 'plan steps on records, in a read that names its runs by id, that are not the primary key').toBe('')
})

it("a record's decisions are found through the primary key", async () => {
  const { decisionsAbout } = await import('../src/server/lib/decisionsabout.ts')
  const module = t.api.createRecord({
    workspaceId: 'default', kind: 'module', title: 'A test module', data: { context: 'Why this module exists.', parts: [] }, actor: OWNER,
  }).id
  const decisions = [1, 2, 3, 4, 5].map((n) => {
    const id = t.api.createRecord({
      workspaceId: 'default', kind: 'decision', title: `A test decision ${String(n)}`,
      data: { because: 'the owner said so', authority: 'the owner said so', decided_by: THE_TEST_OFFICES_OWNER.id },
      actor: OWNER,
    }).id
    t.api.createLink({ fromId: id, toId: module, type: 'about', actor: OWNER })
    return id
  })

  let listed: string[] = []
  const reads = theReadsByIdDuring(() => {
    listed = decisionsAbout({ workspaceId: 'default', recordId: module }).decisions.map((one) => one.id)
  })
  expect(listed.sort(), 'the decisions about the module').toEqual([...decisions].sort())

  const ofDecisions = reads.filter((one) => one.values.includes('decision'))
  expect(ofDecisions.length, 'the reads of the decisions linked to the record').toBeGreaterThan(0)
  expect(notByItsId(ofDecisions), 'plan steps on records, in a read that names its decisions by id, that are not the primary key').toBe('')
})
