// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MINUTE'S IDLE REMINDER READS ONLY THE LINES THE OFFICE WROTE SINCE A DAY BEFORE IT STARTED WATCHING. Wave 13y round
 * 36, and wave 13q.
 *
 * MEASURED FIRST, on 15 October 2026, on a copy of an office with 35,945 delivery rows to agents. The reminder reads the
 * idle lines the office has written to each agent once a minute. SQLite took every delivery row to an agent through
 * `message_delivery_recipient_idx` and looked its message up by id, then tested who wrote it and its words: 91 ms and
 * 113.7 MB read from the file each minute, for 592 lines to 257 agents. Read the other way, the office's own messages
 * through `records_message_sent_by_idx` and then their delivery rows by message id, it took 15.6 ms and 26.7 MB, and
 * gave the same lines to the same agents. The times on the three copies are in the round's report.
 *
 * MEASURED AGAIN, on 22 October 2026, on an office of that day's shape (tests/the-two-timers-at-the-live-shape.test.ts).
 * Through the index of who wrote a message the read still visited every message the office ever wrote, about 25 ms of
 * every minute once the first agents were past their hour. A line counts only when it was written at or after the
 * agent's newest activity, and an agent whose newest activity is before the watcher started is passed over. So the read
 * now starts from the index of when a record last changed, from a day before the watcher started.
 *
 * WHAT THIS HOLDS.
 * - The same lines are said to the same agents. Nine agents each had a person's message. Five have an idle line from
 *   the office since, and are not reminded. The other four are: one has a line from the office in other words, one has
 *   a person's message in the idle line's words, one has nothing, and one has an idle line deleted in the database by
 *   hand. The office's own door refuses to delete a notice from the office, so the last is not a state the office
 *   makes, but the read has always left a deleted message out.
 * - The read gives back each of the five lines, to the agent it was written to, with its stamp and the moment the record
 *   door kept beside that stamp (`data.writtenTime.instant`), when the tick asks it.
 * - SQLite plans the read from the index of when a record last changed, from a day before the watcher started, with
 *   the values bound to it, and finds each line's delivery rows by the message's id. The plan is read from SQLite
 *   itself, as tests/the-reminders-and-the-decisions-find-their-rows-by-id.test.ts reads it.
 *
 * WHAT IT DOES NOT HOLD. How long the read takes. When an idle reminder is due, and that it is sent once a spell, which
 * tests/the-office-reminds-idle-agents-and-runs-past-their-expected-time.test.ts holds.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { localStamp } from '../src/shared/time.ts'
import type { Actor } from '../src/server/lib/records.ts'

let t: TestDb

const OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const
const THE_OFFICE: Actor = { type: 'system', id: moleOffice().id }
const NOW = new Date()
const IDLE = SYSTEM_LINES.youHaveBeenIdle('').line

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

/**
 * Every read `work` made that joins a message to its delivery rows, with the rows it gave back then and SQLite's plan for
 * it, asked with the values bound.
 */
function theReadsOfDeliveriesDuring(work: () => unknown): { sql: string; values: unknown[]; rows: unknown; plan: string[] }[] {
  const ran: { sql: string; values: unknown[]; rows: unknown }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    if (!/^\s*select\b/i.test(source) || !/"message_delivery"/.test(source)) return statement
    for (const method of ['all', 'get', 'iterate'] as const) {
      const real = statement[method].bind(statement) as (...values: unknown[]) => unknown
      ;(statement as unknown as Record<string, unknown>)[method] = (...values: unknown[]) => {
        const rows = real(...values)
        ran.push({ sql: source, values, rows })
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

/** One agent the office registered as a worker, by handle, with a person's message to it: the activity a spell starts at. */
function aWorkerWithWork(handle: string, body = 'Please read the logs.'): { handle: string; id: string } {
  t.api.createRecord({
    workspaceId: 'default', kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active', role: 'worker' }, actor: OWNER,
  })
  const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'some work', data: { body, to: [{ kind: 'agent', id }] }, actor: OWNER })
  return { handle, id }
}

it("the idle reminder reads the office's lines from who wrote them, and says the same lines to the same agents", async () => {
  const reminders = await import('../src/server/lib/reminders.ts')
  const groups = await import('../src/server/lib/groups.ts')
  const anIdleLineTo = (agent: { id: string }): string =>
    groups.writeASystemLineToOne({ kind: 'agent', id: agent.id }, 'default', SYSTEM_LINES.youHaveBeenIdle('You have been idle for about an hour.'), THE_OFFICE).id

  // FOUR OR MORE AGENTS ALREADY TOLD, so the plan is read for a list of several lines and not one.
  const told = [1, 2, 3, 4, 5].map((n) => aWorkerWithWork(`told-${String(n)}`))
  const toldBy = new Map(told.map((agent) => [anIdleLineTo(agent), agent.id]))
  const otherWords = aWorkerWithWork('told-in-other-words')
  groups.writeASystemLineToOne({ kind: 'agent', id: otherWords.id }, 'default', SYSTEM_LINES.aRunWaitedAndEnded(5), THE_OFFICE)
  const byAPerson = aWorkerWithWork('told-its-words-by-a-person', IDLE)
  const untold = aWorkerWithWork('never-told')
  const deleted = aWorkerWithWork('told-by-a-deleted-line')
  t.client.sqlite.prepare('UPDATE records SET deleted_at = created_at WHERE id = ?').run(anIdleLineTo(deleted))

  let reminded: string[] = []
  const watchingSince = new Date(NOW.getTime() - 60_000)
  const reads = theReadsOfDeliveriesDuring(() => {
    reminded = reminders.sendTheRemindersThatAreDue('default', new Date(NOW.getTime() + 2 * 3_600_000), watchingSince).idleReminded
  })

  // THE SAME AGENTS ARE REMINDED, AND THE SAME ARE LEFT ALONE.
  expect([...reminded].sort(), 'the agents reminded that they are idle').toEqual([otherWords, byAPerson, untold, deleted].map((one) => one.handle).sort())

  // THE READ IS SEEN, and gives back each line the office said to the agent it said it to, with its stamp and its moment.
  const ofIdleLines = reads.filter((one) => one.values.includes(IDLE))
  expect(ofIdleLines.length, 'the reads of the idle lines the office has already said').toBeGreaterThan(0)
  const stampOf = (id: string): string => (t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(id) as { at: string }).at
  const momentOf = (id: string): unknown => ((t.api.getRecord(id)!.data as Record<string, unknown>)['writtenTime'] as { instant?: unknown } | undefined)?.instant
  const written = [...toldBy].map(([line, agent]) => `${agent} ${stampOf(line)} ${String(momentOf(line))}`).sort()
  for (const one of ofIdleLines) {
    expect(Array.isArray(one.rows), `the rows of: ${one.sql.slice(0, 200)}`).toBe(true)
    const found = (one.rows as unknown[]).map((row) => (Array.isArray(row) ? row : Object.values(row as object)).join(' '))
    expect(found.sort(), 'each agent, and the stamp and the moment of the line it was told').toEqual(written)
  }

  // THE PLAN: the records changed since a day before the watcher started, from the index of when a record last changed,
  // then each one's delivery rows by its id.
  const theDayBefore = localStamp(new Date(watchingSince.getTime() - 24 * 3_600_000))
  for (const one of ofIdleLines) {
    const said = `${one.plan.join('\n')}\nin: ${one.sql.slice(0, 200)}`
    expect(one.plan[0], said).toBe('SEARCH records USING INDEX records_updated_idx (updated_at>?)')
    expect(one.values, `the stamp the read starts from, in: ${said}`).toContain(theDayBefore)
    const ofDeliveries = one.plan.filter((step) => /\bmessage_delivery\b/.test(step))
    expect(ofDeliveries.length, said).toBeGreaterThan(0)
    for (const step of ofDeliveries) expect(step, said).toMatch(/^SEARCH message_delivery USING (COVERING )?INDEX \w+ \(message_id=\?/)
  }
})
