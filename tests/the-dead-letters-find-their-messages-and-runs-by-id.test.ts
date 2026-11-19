// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEAD-LETTER LIST AND THE SWEEP FIND EACH LETTER'S MESSAGE AND EACH KEPT RUN BY ITS ID. Wave 13y round 34, item 1.
 *
 * MEASURED FIRST, on 15 October 2026, on a copy of an office with 25,696 messages and 4,901 letters queued to agents:
 * one `GET /api/dead-letters` took 0.32 to 0.39 s and read 645 MB, and one press of `POST /api/dead-letters/sweep` with
 * nothing new to say took 0.42 to 0.44 s and read 841 MB. Three reads in src/server/lib/deadletters.ts were 683 MB of
 * that. Each names its rows by id and asks their kind as well, and SQLite chose to walk every record of that kind
 * through `records_kind_idx` and test each id against the list, once for each piece of ids: the letters' messages in
 * `deadLettersNow` (495 MB), the letters to retired agents in `everyQueuedLetterToARetiredAgent` (165 MB), and the
 * runs that may still read in `agentsWhoseRunsMayRead` (23 MB).
 *
 * WHAT THIS HOLDS. Every read of records by id that the list, the letters to retired agents and one sweep make is
 * planned by SQLite through the primary key and through nothing else on `records`. The plan of each is read from SQLite
 * itself, with the values bound to it. Each of the three reads is seen at least once, so a road that stopped reaching one
 * would not pass by reading nothing: the letters the list and the retired agents' read give back are the ones written.
 *
 * WHAT IT DOES NOT HOLD. How long a read takes; the times are in the round's report. What the sweep does with a letter,
 * which tests/the-message-centre-handles-the-dead-letters-itself.test.ts,
 * tests/a-wild-message-is-kept-and-broadcast-to-the-secretaries.test.ts and
 * tests/the-dead-letter-sweep-keeps-a-live-agents-mail.test.ts hold. The reads the sweep's one line makes when it is
 * written, which go through the record door that every write uses.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  // THE ROLE CARDS ARE READ ONCE, AS THE SERVER READS THEM WHEN IT STARTS: filing a message asks for them.
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
})

afterEach(() => {
  t?.close()
  vi.unstubAllEnvs()
})

/** A registry row for one test agent, written straight into the throwaway database. */
function anAgent(id: string): void {
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

/** A letter from the person to one agent, which the record door queues for it. */
function aLetterTo(id: string): string {
  return t.api.createRecord({
    workspaceId: 'default', kind: 'message', title: `A test letter to ${id}`,
    data: { body: 'Words for the addressee.', to: [{ kind: 'agent', id }] },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  }).id
}

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

/** A plan step on `records` that is not the primary key looking up the ids asked for. */
const NOT_BY_ITS_ID = (step: string): boolean => /\brecords\b/.test(step) && !/^SEARCH records USING INDEX sqlite_autoindex_records_1 \(id=\?\)$/.test(step)

it('the list, the letters to retired agents and one sweep find every record they name by id through its primary key', async () => {
  const deadletters = await import('../src/server/lib/deadletters.ts')
  // FOUR OF EACH, because SQLite looks one id up by its key whatever else the read asks, and walks the kind's index
  // only for a list of several.
  const gone = ['ag-gone-1', 'ag-gone-2', 'ag-gone-3', 'ag-gone-4']
  const running = ['ag-running-1', 'ag-running-2', 'ag-running-3', 'ag-running-4']
  const retired = ['ag-retired-1', 'ag-retired-2', 'ag-retired-3', 'ag-retired-4']
  for (const id of [...gone, ...running, ...retired]) anAgent(id)
  const toTheGone = gone.map(aLetterTo)
  running.forEach(aLetterTo)
  const toTheRetired = retired.map(aLetterTo)
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_at = '2026-10-01 08:00:00' WHERE id LIKE 'ag-retired-%'").run()
  // RUNS THAT SAY THEY ARE RUNNING, so `agentsWhoseRunsMayRead` reads each whole by its id and its agent's letter is kept.
  for (const id of running) {
    t.api.createRecord({
      workspaceId: 'default', kind: 'session', title: `A running test run for ${id}`,
      data: { state: 'running', servingAgentId: id, servingAgent: id },
      actor: { type: 'agent', id },
    })
  }

  const reads = theReadsByIdDuring(() => {
    expect(deadletters.deadLettersNow().map((one) => one.messageId).sort(), 'the dead letters').toEqual([...toTheGone, ...toTheRetired].sort())
    expect(deadletters.everyQueuedLetterToARetiredAgent().map((one) => one.messageId).sort(), 'the letters to retired agents').toEqual([...toTheRetired].sort())
    deadletters.sweepDeadLetters({ type: 'system', id: 'mole-office' })
  })

  // EACH OF THE THREE READS IS SEEN: the messages with when each was written, the messages without, and the runs.
  const messagesWithTheirMoment = reads.filter((one) => one.values.includes('message') && one.sql.includes('"created_at"'))
  const messagesWithout = reads.filter((one) => one.values.includes('message') && !one.sql.includes('"created_at"'))
  const runs = reads.filter((one) => one.values.includes('session'))
  expect(messagesWithTheirMoment.length, 'the reads of the letters\' messages in deadLettersNow').toBeGreaterThan(0)
  expect(messagesWithout.length, 'the reads of the messages of letters to retired agents').toBeGreaterThan(0)
  expect(runs.length, 'the reads of the runs that may still read their mail').toBeGreaterThan(0)

  const notByItsId = reads.flatMap((one) => one.plan.filter(NOT_BY_ITS_ID).map((step) => `${step} in: ${one.sql.slice(0, 160)}`))
  // ONE LINE EACH, so a failure names every read and not the first two.
  expect(notByItsId.join('\n'), 'plan steps on records, in a read that names its records by id, that are not the primary key').toBe('')
})
