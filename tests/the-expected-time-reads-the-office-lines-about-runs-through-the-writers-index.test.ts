// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MINUTE'S EXPECTED-TIME STEP READS THE LINES THE OFFICE ALREADY SAID ABOUT RUNS THROUGH THE INDEX OF WHO WROTE A
 * MESSAGE. Wave 13y round 39.
 *
 * Once a minute, when a running run carries an expected time, the step reads which of its two lines the office has
 * already written about each run. The read tested every message of the office for its words and who wrote it. No run
 * on the office's copy carried an expected time, so the step never asked it there; the read itself was timed alone on
 * that copy, and the times are in the round's report.
 *
 * MADE UP. Every agent, run, expected time and line in this file is made up for this test. None is an observation.
 *
 * WHAT THIS HOLDS.
 * - The same lines are said about the same runs. Seven workers each have a running run with an expected time of an
 *   hour, and the tick comes past twice that. One run has the office's first line, and gets the second. One has both,
 *   and gets nothing. The other five get the first line: one has nothing, one has a line from the office in other
 *   words, one has a person's message in the first line's words, one has the office's first line about another run,
 *   and one has the office's first line deleted in the database by hand. The office's own door refuses to delete a
 *   notice from the office, so the last is not a state the office makes, but the read has always left a deleted
 *   message out.
 * - The read gives back each line the office said about a run, with the run, when the tick asks it.
 * - SQLite plans the read from the index of who wrote a message, with the values bound to it. The plan is read from
 *   SQLite itself, as tests/the-idle-reminder-reads-only-the-office-lines-written-since-it-started-watching.test.ts reads it.
 * - The read names that index. In an office without it, the read fails with an error and the minute's step stops,
 *   instead of reading every message of the office another way. SQLite chooses that index for this read even when the
 *   read does not name it, so the plan alone cannot show that it is named; only a missing index shows it.
 *
 * WHAT IT DOES NOT HOLD. How long the read takes. When each line is due, and that each is sent once, which
 * tests/the-office-reminds-idle-agents-and-runs-past-their-expected-time.test.ts holds.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { clockStamp, localStamp } from '../src/shared/time.ts'
import type { Actor } from '../src/server/lib/records.ts'

let t: TestDb

const OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const
const THE_OFFICE: Actor = { type: 'system', id: moleOffice().id }
const R0 = new Date()
const FIRST = SYSTEM_LINES.theExpectedTimeHasArrived('').line
const SECOND = SYSTEM_LINES.twiceTheExpectedTime('').line

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  // THE ROLE CARDS ARE READ ONCE, AS THE SERVER READS THEM WHEN IT STARTS: a reminder names a card's duties.
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
})

afterEach(() => {
  t?.close()
  vi.unstubAllEnvs()
})

/** Every read `work` made with both lines' words bound to it, with the rows it gave back then and SQLite's plan for it. */
function theReadsOfBothLinesDuring(work: () => unknown): { sql: string; values: unknown[]; rows: unknown; plan: string[] }[] {
  const ran: { sql: string; values: unknown[]; rows: unknown }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    if (!/^\s*select\b/i.test(source)) return statement
    for (const method of ['all', 'get', 'iterate'] as const) {
      const real = statement[method].bind(statement) as (...values: unknown[]) => unknown
      ;(statement as unknown as Record<string, unknown>)[method] = (...values: unknown[]) => {
        const rows = real(...values)
        if (values.includes(FIRST) && values.includes(SECOND)) ran.push({ sql: source, values, rows })
        return rows
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

/** One made-up worker, by handle, with one made-up running run of an hour's expected time. */
function aWorkerWithARun(handle: string): { id: string; run: string } {
  t.api.createRecord({
    workspaceId: 'default', kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active', role: 'worker' }, actor: OWNER,
  })
  const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  const run = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'a made-up run',
    data: {
      state: 'running', runtime: 'fake', servingAgent: id, startedAt: localStamp(R0), startedTime: clockStamp(() => R0),
      deliveringMessage: 'none-here', expectedMinutes: 60,
    },
    actor: OWNER,
  }).id
  return { id, run }
}

it("the expected-time step reads the office's lines about runs from who wrote them, and says the same lines about the same runs", async () => {
  const reminders = await import('../src/server/lib/reminders.ts')
  const groups = await import('../src/server/lib/groups.ts')
  const aLineAbout = (worker: { id: string; run: string }, line: typeof FIRST | typeof SECOND, run = worker.run): string =>
    groups.writeASystemLineToOne(
      { kind: 'agent', id: worker.id },
      'default',
      line === FIRST ? SYSTEM_LINES.theExpectedTimeHasArrived('A made-up first line.') : SYSTEM_LINES.twiceTheExpectedTime('A made-up second line.'),
      THE_OFFICE,
      { run },
    ).id

  const toldFirst = aWorkerWithARun('told-the-first-line')
  aLineAbout(toldFirst, FIRST)
  const toldBoth = aWorkerWithARun('told-both-lines')
  aLineAbout(toldBoth, FIRST)
  aLineAbout(toldBoth, SECOND)
  const untold = aWorkerWithARun('never-told')
  const otherWords = aWorkerWithARun('told-in-other-words')
  groups.writeASystemLineToOne({ kind: 'agent', id: otherWords.id }, 'default', SYSTEM_LINES.aRunWaitedAndEnded(5), THE_OFFICE, { run: otherWords.run })
  const byAPerson = aWorkerWithARun('told-its-words-by-a-person')
  t.api.createRecord({
    workspaceId: 'default', kind: 'message', title: 'a made-up message',
    data: { body: FIRST, aboutRun: byAPerson.run, to: [{ kind: 'agent', id: byAPerson.id }] }, actor: OWNER,
  })
  const aboutAnother = aWorkerWithARun('told-about-another-run')
  aLineAbout(aboutAnother, FIRST, 'a-made-up-run-that-is-not-filed')
  const deleted = aWorkerWithARun('told-by-a-deleted-line')
  t.client.sqlite.prepare('UPDATE records SET deleted_at = created_at WHERE id = ?').run(aLineAbout(deleted, FIRST))

  let said: { expectedTimeReached: string[]; twiceExpectedTime: string[] } = { expectedTimeReached: [], twiceExpectedTime: [] }
  const reads = theReadsOfBothLinesDuring(() => {
    said = reminders.sendTheRemindersThatAreDue('default', new Date(R0.getTime() + 121 * 60_000), new Date(R0.getTime() - 60_000))
  })

  // THE SAME LINES ARE SAID ABOUT THE SAME RUNS.
  expect([...said.twiceExpectedTime].sort(), 'the runs told the second line').toEqual([toldFirst.run])
  expect([...said.expectedTimeReached].sort(), 'the runs told the first line').toEqual(
    [untold, otherWords, byAPerson, aboutAnother, deleted].map((one) => one.run).sort(),
  )

  // THE READ IS SEEN, and gives back each line the office said about a run, with the run.
  expect(reads.length, 'the reads of the lines the office has already said about runs').toBeGreaterThan(0)
  const written = [
    [toldFirst.run, FIRST], [toldBoth.run, FIRST], [toldBoth.run, SECOND], ['a-made-up-run-that-is-not-filed', FIRST],
  ].map((pair) => pair.join(' ')).sort()
  for (const one of reads) {
    expect(Array.isArray(one.rows), `the rows of: ${one.sql.slice(0, 200)}`).toBe(true)
    const found = (one.rows as unknown[]).map((row) => (Array.isArray(row) ? row : Object.values(row as object)).join(' '))
    expect(found.sort(), 'each run and the line said about it').toEqual(written)
  }

  // THE PLAN: the office's messages from the index of who wrote them, and nothing else read.
  for (const one of reads) {
    const plan = `${one.plan.join('\n')}\nin: ${one.sql.slice(0, 300)}`
    expect(one.plan, plan).toEqual(['SEARCH records USING INDEX records_message_sent_by_idx (<expr>=?)'])
  }
})

it('in an office without the index of who wrote a message, the read of the lines about runs fails with an error', async () => {
  const reminders = await import('../src/server/lib/reminders.ts')
  aWorkerWithARun('watched-in-an-office-without-the-index')
  t.client.sqlite.exec('DROP INDEX records_message_sent_by_idx')

  // EVERY STATEMENT THAT SQLITE REFUSES TO PREPARE, with its words, so the error is known to come from this read.
  const refused: { sql: string; error: string }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    try {
      return prepare(source)
    } catch (err) {
      refused.push({ sql: source, error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }) as never)
  try {
    // ONE MINUTE IN. The run is watched, so the lines about runs are read. No agent has been idle for an hour, so the
    // idle lines, which are read through the same index, are not read.
    expect(() => reminders.sendTheRemindersThatAreDue('default', new Date(R0.getTime() + 60_000), new Date(R0.getTime() - 60_000)))
      .toThrow(/no such index: records_message_sent_by_idx/)
  } finally {
    spy.mockRestore()
  }
  expect(
    refused.map((one) => `${one.sql.includes("'$.aboutRun'") ? 'the lines about runs' : one.sql.slice(0, 200)}: ${one.error}`),
    'the statements SQLite refused',
  ).toEqual(['the lines about runs: no such index: records_message_sent_by_idx'])
})
