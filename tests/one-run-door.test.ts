// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE DOOR CREATES A RUN, AND IT IS DISPATCH — checked against the source, not stated in a comment.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHY IT IS A TEST
 * ---------------------------------------------------------------------------------------
 *
 * Review mode collects comments and sends none of them until the person presses Finish review. The
 * owner has to be able to prove that nothing was sent before they pressed it, and the honest way to
 * prove that is that there is no other code path: `dispatchThread` in src/server/lib/agents.ts is
 * the only place a row is ever written into `agent_runs`.
 *
 * A comment saying so would be a promise. This file is the check, and it runs on every commit —
 * the same discipline `tests/by-id-boundary.test.ts` uses for the project boundary.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT CAN AND CANNOT SEE
 * ---------------------------------------------------------------------------------------
 *
 * IT RESOLVES THE TABLE; IT DOES NOT MATCH A WORD. Every `insert(...)` under src/ is found and its
 * argument is resolved through the file's own imports. All four of these name the same table and
 * all four are found: `insert(agentRuns)`; `import { agentRuns as other }` and then
 * `insert(other)`; `import * as schema` and then `insert(schema.agentRuns)`; and
 * `insert(AUTHORED_TABLE_OF.agent_runs)`, through the map db/schema.ts exports.
 *
 * WHY THAT PARAGRAPH IS HERE. Until 19 August 2026 this walk matched the TEXT `insert(agentRuns)`,
 * and a hostile read opened two live doors past it in one afternoon: an aliased import, and the
 * exported map. The same trick against `agentRuns` opened a second way to create a run, which is the
 * thing this file has existed to prevent since one was opened by accident. Both left every test in this file green. It was the third
 * text-matching guard in this campaign found not to guard, so the walk was made to resolve names
 * instead of matching them, and what it still cannot see is written out below rather than implied.
 *
 * AN ARGUMENT IT CANNOT RESOLVE FAILS THIS TEST RATHER THAN PASSING IT. `insert(table)`, where
 * `table` is a local variable, is not "not the watched table" — it is "this walk cannot say", and
 * the fifth engineering rule is that those two may never draw the same.
 *
 * WHAT IS STILL OUTSIDE IT, said plainly:
 *
 *   · a table object chosen at run time, or reached through `eval`;
 *   · raw SQL whose table name is assembled from pieces. A literal `INSERT INTO agent_runs` is
 *     caught; `INSERT INTO ` followed by a variable is not;
 *   · anything outside src/. Checked by hand on 19 August 2026: the migrations under drizzle/
 *     create this table and scripts/restore-check.ts only reads it. Neither is walked here.
 *
 * It is a fence against drift, not against somebody deliberately climbing it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'


/**
 * THE READER BELOW IS DUPLICATED IN tests/one-message-door.test.ts ON PURPOSE.
 *
 * A test file cannot import another test file without running its tests, so the two door guards
 * cannot share a module without one of them running the other. They hold the same block instead, and
 * the last test in each file fails when the two copies stop being identical — which is the third of
 * the fixes CLAUDE.md allows for one fact worked out in two places, and the only one available here.
 * It is not decoration: the hole this block was written to close existed in both files at once,
 * because one was copied from the other and neither knew about the copy.
 */
// ===== THE SHARED READER STARTS HERE =====





















// ===== THE SHARED READER ENDS HERE =====



// ====================================================== and the same rule, exercised

const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** How many runs exist, read from the database rather than from a route. */
function runRows(): number {
  const { n } = t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_runs').get() as { n: number }
  return n
}

describe('nothing but dispatch creates a run, exercised against a real database', () => {
  it('leaves the run table empty through a whole review, and fills it only at Finish review', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Round six, read again', mode: 'review' },
    })
    expect(started.statusCode, started.body).toBe(201)
    const thread = (started.json() as { thread: { id: string } }).thread.id
    expect(runRows(), 'starting a conversation created a run').toBe(0)

    const ids: string[] = []
    for (const body of ['The second table is unlabelled.', 'This claim has no measurement behind it.']) {
      const said = await app.inject({
        method: 'POST',
        url: `/api/agent/threads/${thread}/messages`,
        headers: HUMAN,
        payload: { intent: 'review', body, recipient: { kind: 'new' } },
      })
      expect(said.statusCode, said.body).toBe(201)
      ids.push((said.json() as { message: { id: string } }).message.id)
      expect(runRows(), 'writing a comment created a run').toBe(0)
    }

    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${ids[0] ?? ''}`,
      headers: HUMAN,
      payload: { body: 'The second table has no units on its columns.' },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    expect(runRows(), 'changing a comment created a run').toBe(0)

    const removed = await app.inject({ method: 'DELETE', url: `/api/agent/messages/${ids[1] ?? ''}`, headers: HUMAN })
    expect(removed.statusCode, removed.body).toBe(200)
    expect(runRows(), 'removing a comment created a run').toBe(0)

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/threads/${thread}`,
      headers: HUMAN,
      payload: { title: 'Round six, read again — second pass' },
    })
    expect(renamed.statusCode, renamed.body).toBe(200)
    expect(runRows(), 'renaming a conversation created a run').toBe(0)

    for (const url of [`/api/agent/threads/${thread}`, '/api/agent/threads', '/api/agent/marks', '/api/agent/runs']) {
      const read = await app.inject({ method: 'GET', url, headers: HUMAN })
      expect(read.statusCode, `${url}: ${read.body}`).toBe(200)
    }
    expect(runRows(), 'reading created a run').toBe(0)

    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)
    expect(runRows(), 'Finish review did not create a run').toBe(1)
  })
})
