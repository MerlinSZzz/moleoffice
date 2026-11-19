// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COUNTER'S COUNT AND ITS ROWS SURVIVE A RESTART, AND A TRIGGER THAT FELL DUE WHILE THE OFFICE WAS
 * DOWN FIRES ONCE.
 *
 * Criterion CT7 of design/counters/ACCEPTANCE.md.
 *
 * WHY THIS NEEDS TWO REAL SERVERS. Everything else about a counter can be proved against a database
 * a test opened. These two claims cannot:
 *
 *   The COUNT is not stored anywhere — it is added up from the rows since the last firing — so
 *   "it survives a restart" is a claim about the rows being on disk and about a second server
 *   reading them the same way. One process that never let go of the file would prove neither.
 *
 *   FIRING ONCE AFTER DOWNTIME is a claim about `startTheCounters`, which only a server start runs.
 *   A test that called the tick itself would be testing the tick and saying nothing about whether
 *   the office runs it when it comes back up.
 *
 * So the first stack files the counter and counts into it, the file outlives it, and a second stack
 * serves the same file. Between the two, this test moves the counter's own filing stamp back by
 * twenty-five hours, which is the office having been down for twenty-five hours: the counter's
 * twelve-hour trigger fell due TWICE while nothing was running, and exactly one firing row is what
 * CT7 asks for.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, TEST_DATABASE_PREFIX, type LiveApp } from './helpers.ts'

let dir = ''
let database = ''
let counterId = ''
/** What the first stack left behind, read back before it was stopped. */
let beforeTheRestart: { count: number; rows: number } = { count: 0, rows: 0 }

const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** One counter as its own door reads it back, from whichever stack is up. */
async function read(api: string): Promise<{
  counter: { count: number; title: string; since: string }
  rows: { seq: number; what: string; count: number; because: string; answer?: { ids: string[] } }[]
}> {
  const r = await fetch(`${api}/api/counters/${counterId}`, { headers: asPerson })
  expect(r.status, await r.clone().text()).toBe(200)
  return (await r.json()) as never
}

beforeAll(async () => {
  dir = mkdtempSync(`${TEST_DATABASE_PREFIX}counter-restart-`)
  database = join(dir, 'panelx.db')

  // ---- the first stack: file a counter, count into it, and stop
  const first: LiveApp = await liveApp({ name: 'counter-restart-first', viewport: { width: 1440, height: 900 }, database })
  try {
    const made = await fetch(`${first.api}/api/counters`, {
      method: 'POST',
      headers: asPerson,
      body: JSON.stringify({
        title: 'Trials since the last look',
        counts: 'Trials run on the gripper since somebody last looked at the numbers.',
        // TWELVE HOURS, AND A COUNT TRIGGER HIGH ENOUGH NOT TO HOLD, so that what fires after the
        // restart is the time trigger and nothing else.
        triggers: [{ kind: 'count', n: 50 }, { kind: 'every', hours: 12 }],
        action: { kind: 'task', title: 'Look at the trials that came in overnight' },
      }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
    counterId = ((await made.json()) as { counter: { id: string } }).counter.id

    for (const because of ['The first trial.', 'The second trial.', 'The third trial.']) {
      const added = await fetch(`${first.api}/api/counters/${counterId}/add`, {
        method: 'POST',
        headers: asPerson,
        body: JSON.stringify({ by: 1, because }),
      })
      expect(added.status, await added.clone().text()).toBe(201)
    }
    const said = await read(first.api)
    beforeTheRestart = { count: said.counter.count, rows: said.rows.length }
    expect(beforeTheRestart, 'the first stack did not count what it was given').toEqual({ count: 3, rows: 3 })
  } finally {
    await first.stop()
  }

  // ---- the office was down for twenty-five hours, which is two of this counter's twelve
  //
  // Written straight into the file, with no server holding it, because that is what being down IS:
  // nothing was running to be told. The counter's own filing stamp is what its twelve hours are
  // counted from, since it has never fired.
  const file = new Database(database)
  try {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000)
    const pad = (n: number): string => String(n).padStart(2, '0')
    const stamp =
      `${String(twentyFiveHoursAgo.getFullYear())}-${pad(twentyFiveHoursAgo.getMonth() + 1)}-${pad(twentyFiveHoursAgo.getDate())} ` +
      `${pad(twentyFiveHoursAgo.getHours())}:${pad(twentyFiveHoursAgo.getMinutes())}:${pad(twentyFiveHoursAgo.getSeconds())}`
    const moved = file.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(stamp, counterId)
    expect(moved.changes, 'the counter was not there to move back').toBe(1)
  } finally {
    file.close()
  }
}, 240_000)

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('a second server on the same database', () => {
  it('reads back the count, the rows and the reasons the first one wrote, and fires the overdue trigger once', async () => {
    const second: LiveApp = await liveApp({ name: 'counter-restart-second', viewport: { width: 1440, height: 900 }, database })
    try {
      const said = await read(second.api)

      // THE ROWS CAME BACK, with the words whoever added them wrote.
      const additions = said.rows.filter((row) => row.what === 'addition')
      expect(additions.length, 'the additions did not survive the restart').toBe(beforeTheRestart.rows)
      expect(additions.map((row) => row.because)).toContain('The second trial.')

      // AND THE OVERDUE TRIGGER FIRED ONCE, not once for each twelve hours that passed while the
      // office was down. The second stack's own start ran the tick.
      const firings = said.rows.filter((row) => row.what === 'firing')
      expect(firings.length, 'twenty-five hours of downtime wrote a firing per missed moment').toBe(1)
      expect(firings[0]?.count, 'the firing did not carry the count the first stack left').toBe(beforeTheRestart.count)
      expect(firings[0]?.because).toContain('12 hours have passed')
      expect(said.counter.count, 'it did not start again from zero after firing').toBe(0)

      // AND WHAT IT DID IS ON RECORD: the task it filed is a record of this project.
      const taskId = firings[0]?.answer?.ids[0] ?? ''
      const task = await fetch(`${second.api}/api/records/${taskId}`, { headers: asPerson })
      expect(task.status, await task.clone().text()).toBe(200)
      expect(((await task.json()) as { record: { title: string } }).record.title).toBe(
        'Look at the trials that came in overnight',
      )

      // AND IT DOES NOT FIRE AGAIN on the next tick, because its next twelve hours are counted from
      // the firing it has just written.
      const again = await read(second.api)
      expect(again.rows.filter((row) => row.what === 'firing').length).toBe(1)
    } finally {
      await second.stop()
    }
  }, 240_000)
})
