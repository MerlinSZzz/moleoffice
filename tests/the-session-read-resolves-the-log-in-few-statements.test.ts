// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION READ RESOLVES THE CHANGE LOG'S SESSION COLUMN IN A FEW STATEMENTS, AND A RUN NAME IS FOUND THROUGH AN INDEX.
 * Wave 13y round 20, item 4.
 *
 * MEASURED FIRST: on 10 October 2026 the live log said GET /api/sessions/awA_lfYhMfBJ and GET /api/sessions/xD4MyQvhMNmn
 * each took about 5.2 s cold, with about 13,700 statements and 4.4 s inside SQLite. One statement took 85 ms each time
 * and found no row: the run-name rung of `resolveSessionRef`. On a made-up office of 8,850 sessions and 400,040 change
 * rows, the read took 5.9 s cold and ran 18,005 statements: `readSessionEvidence` resolved every distinct value of the
 * log's session column one at a time, and each of the sixty run names among them walked the project's whole log.
 *
 * WHAT THIS HOLDS:
 *   - `readSessionEvidence` runs no more statements for a log that names sixty more sessions;
 *   - the run-name rung is planned through `changes_session_name_idx` (migration 0229);
 *   - `theRecordIdsOfSessionRefs` answers, for every kind of value the column holds, what `resolveSessionRef` answers.
 *
 * WHAT IT DOES NOT HOLD. Where a run is placed; tests/the-session-placement-reads-no-value-and-a-hold-is-named.test.ts
 * and the placement tests hold that.
 *
 * CONTROL: every test passes at the tip. MUTATIONS, each run and each red:
 *   1. `readSessionEvidence` resolves each value with `resolveSessionRef` again (src/server/lib/sessions.ts): the
 *      first test counts sixty more statements.
 *   2. migration 0229 creates no index (drizzle/0229_a_run_name_is_found_through_an_index.sql): the second test's plan
 *      walks the project's log.
 *   3. `theRecordIdsOfSessionRefs` no longer tests the project: the third test's session of another project answers.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb

const PERSON = { type: 'human' as const, id: THE_PERSON }

beforeAll(async () => {
  t = await freshDb()
}, 60000)

afterAll(() => {
  t.close()
})

let made = 0

/** One change row in `workspaceId` whose session column holds `stored`, as a write by a run would leave it. */
function aRowWrittenBy(stored: string, workspaceId = 'default'): void {
  made += 1
  t.client.sqlite
    .prepare(
      `INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, new_value, at, workspace_id)
       VALUES (?, 'no-such-record', 'update', 'agent', 'test-agent', ?, 'title', '"x"', ?, ?)`,
    )
    .run(`chg-test-${String(made)}`, stored, `2026-10-10 12:${String(made % 60).padStart(2, '0')}:00`, workspaceId)
}

function aSession(title: string, workspaceId = 'default'): string {
  return t.api.createRecord({ workspaceId, kind: 'session', title, origin: 'fixture', data: { state: 'running' }, actor: PERSON }).id
}

/** Every statement `work` runs, by wrapping what the connection's `prepare` hands back. */
function theStatementsOf(work: () => void): { text: string; args: unknown[] }[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => Record<string, unknown> }
  const original = sqlite.prepare
  const ran: { text: string; args: unknown[] }[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = original.call(this, text)
    for (const method of ['all', 'get', 'run'] as const) {
      const call = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        ran.push({ text, args })
        return call.apply(this, args)
      }
    }
    return statement
  }
  try {
    work()
  } finally {
    sqlite.prepare = original
  }
  return ran
}

it('reads the sessions a log names in a few statements, however many it names', async () => {
  const { readSessionEvidence } = await import('../src/server/lib/sessions.ts')
  for (let i = 0; i < 5; i++) aRowWrittenBy(aSession(`early run ${String(i)}`))
  const before = theStatementsOf(() => readSessionEvidence('default')).length
  for (let i = 0; i < 60; i++) aRowWrittenBy(aSession(`later run ${String(i)}`))
  const after = theStatementsOf(() => readSessionEvidence('default')).length
  expect(after - before, 'statements more for sixty more sessions in the log').toBeLessThan(5)
})

it('finds a run name through the index that holds only the rows binding one', () => {
  const bound = aSession('a bound run')
  t.api.bindSessionName(bound, 'bound-name', PERSON)
  const ran = theStatementsOf(() => {
    expect(t.api.resolveSessionRef('bound-name', 'default').recordId).toBe(bound)
    expect(t.api.resolveSessionRef('a-name-nobody-bound', 'default').recordId).toBeNull()
  })
  const rungs = ran.filter(({ text }) => /from "changes"/.test(text) && /"new_value" = \?/.test(text))
  expect(rungs.length, 'the run-name rung was asked').toBeGreaterThan(0)
  for (const { text, args } of rungs) {
    const plan = (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${text}`).all(...args) as { detail: string }[]).map((s) => s.detail)
    expect(plan.join(' | ')).toMatch(/USING (?:COVERING )?INDEX changes_session_name_idx/)
  }
})

it('answers each kind of value the session column holds as the resolver does', () => {
  const here = aSession('a run of this project')
  const named = aSession('a named run of this project')
  t.api.bindSessionName(named, 'named-run', PERSON)
  const elsewhere = aSession('a run of another project', 'other-project')
  const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'not a run', data: {}, actor: PERSON }).id
  const values = [here, ` ${here} `, 'named-run', 'a run of this project', elsewhere, note, 'nobody-at-all']
  const answered = t.api.theRecordIdsOfSessionRefs(values, 'default')
  expect([...answered.keys()].sort()).toEqual([...values].sort())
  for (const value of values) {
    expect(answered.get(value), value).toBe(t.api.resolveSessionRef(value, 'default').recordId)
  }
  // So the comparison above is not of two nulls everywhere.
  expect(answered.get(here)).toBe(here)
  expect(answered.get('named-run')).toBe(named)
  expect(answered.get(elsewhere)).toBeNull()
})
