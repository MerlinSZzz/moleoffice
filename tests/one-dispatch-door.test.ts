// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PLACE SAYS A COMMENT HAS GONE OUT — checked against the source AND at run time.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPERTY, AND WHERE IT CAME FROM
 * ---------------------------------------------------------------------------------------
 *
 * *"Nothing was sent before I pressed Finish review."* That sentence used to be the stated property
 * of `tests/one-run-door.test.ts`, proved because the only `insert(agentRuns)` was inside dispatch.
 * Sending no longer creates a run. It moves `agent_messages.state` to `sent`, which is an UPDATE,
 * and a guard that walks insert sites would go green over exactly the write it exists to watch.
 *
 * So the property moved here, and it is three sentences a person can check:
 *
 *   1. Exactly one function in `src/` updates `agent_messages.state`, and it is `moveMessageTo` in
 *      `src/server/lib/dispatch.ts`.
 *   2. Nothing writes that column with raw SQL.
 *   3. Of the functions that move a message to `sent`, there is exactly one.
 *
 * ---------------------------------------------------------------------------------------
 * THE SCAN ALONE IS NOT THE GUARD, AND THIS FILE SAYS SO RATHER THAN IMPLYING IT
 * ---------------------------------------------------------------------------------------
 *
 * A source scan cannot see an alias. `const t = agentMessages; db.update(t).set({state:'sent'})`
 * resolves `t` through the file's own imports and IS seen; but a table object chosen at run time,
 * or a column name assembled from pieces, is not — and neither is a `.set(write)` whose object is
 * built up in a variable.
 *
 * So the scan is PAIRED with a guard that fires when the code runs: a temporary SQLite trigger,
 * installed by `src/server/lib/dispatch.ts`, which aborts any statement setting that column unless
 * `moveMessageTo` opened the door. The last group of tests below drives a foreign write through the
 * real database and asserts it is refused.
 *
 * ---------------------------------------------------------------------------------------
 * THE RUNTIME HALF ONLY FIRES ON A ROW IT ACTUALLY MATCHES, AND THAT NEARLY FOOLED THE PROOF
 * ---------------------------------------------------------------------------------------
 *
 * A `BEFORE UPDATE` trigger runs once per row updated. The first attempt at proving this file
 * planted the aliased mutation in `sendReview` with `where(eq(t.id, threadId))` — a thread id in a
 * message id column, matching nothing — and the whole review suite stayed green while the source
 * scan alone had gone red. Written with `where(eq(t.threadId, threadId))`, so that it matches the
 * rows it was aimed at, ten of the eighteen tests in `tests/review-send.test.ts` fail with the
 * trigger's own sentence. Both were run, and this paragraph is here because the first result looked
 * exactly like a guard that does not work.
 *
 * IT IS NOT A HOLE, and the difference matters: a write that matches no row wrote nothing, so there
 * was nothing for the guard to catch. What it is is a way to take a green that proves nothing, and
 * the fix is to check the mutation reached a row before trusting the result.
 *
 * NEITHER HALF IS THE WHOLE ANSWER AND BOTH ARE KEPT. The scan catches code that no test runs; the
 * trigger catches code the scan cannot read. A mutation planted on a cold branch is seen by the
 * scan alone; one written through a variable on a hot path is seen by the trigger alone.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE SCAN CANNOT READ IS LISTED, NOT LEFT IMPLIED
 * ---------------------------------------------------------------------------------------
 *
 * `CANNOT_READ_THE_COLUMNS` below names every `update(agentMessages)` in `src/` whose `.set(...)`
 * this walk cannot read. It is asserted to be exactly that list, so a new one fails this test and
 * has to be argued for. The one entry is `patchMessage`, whose write object is built up over four
 * conditions — and the six dispatch columns are removed from that variable's TYPE, so a line added
 * there that sets `state` does not compile. Three layers, and each says what it does.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'



/**
 * THE READER BELOW IS DUPLICATED IN THE OTHER FILES NAMED IN `DOOR_GUARDS` ON PURPOSE.
 *
 * A test file cannot import another test file without running its tests, so the door guards cannot
 * share a module without one of them running the others. They hold the same block instead, and the
 * last test in each file fails when the copies stop being identical — which is the third of the
 * fixes CLAUDE.md allows for one fact worked out in two places, and the only one available here.
 */
// ===== THE SHARED READER STARTS HERE =====





















// ===== THE SHARED READER ENDS HERE =====



// ============================================ and the same rule, at run time, on a real database

const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

/** One conversation with one comment in it, addressed to a deliberately new agent. */
async function oneComment(): Promise<string> {
  const thread = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: HUMAN,
    payload: { title: 'The mount tolerance', mode: 'direct' },
  })
  const threadId = (thread.json() as { thread: { id: string } }).thread.id
  const said = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${threadId}/messages`,
    headers: HUMAN,
    payload: { intent: 'ask', body: 'Where did the 0.2 mm come from?', recipient: { kind: 'new' } },
  })
  expect(said.statusCode, said.body).toBe(201)
  return (said.json() as { message: { id: string } }).message.id
}

describe('the runtime half: a write from outside the one door is refused by the database', () => {
  it('has the guard on, and says so rather than leaving it to be assumed', async () => {
    const { dispatchDoorGuard } = await import('../src/server/lib/dispatch.ts')
    const guard = dispatchDoorGuard()
    expect(guard.installed, `the runtime half of this guard is not on: ${guard.why}`).toBe(true)
  })

  it('refuses the mutation a source scan cannot see: the table reached through a local variable', async () => {
    const id = await oneComment()
    const { agentMessages } = await import('../src/server/db/schema.ts')
    const { db } = await import('../src/server/db/client.ts')
    const { eq } = await import('drizzle-orm')

    // THIS IS THE INDIRECT MUTATION, WRITTEN OUT. A source scan resolves `table` through the file's
    // imports and would catch this one; a table object chosen at run time it would not. Either way
    // the database refuses it, which is what makes the pair a guard rather than a fence.
    const table = agentMessages
    expect(() => db.update(table).set({ state: 'sent' }).where(eq(table.id, id)).run()).toThrow(
      /outside moveMessageTo/,
    )

    const after = t.client.sqlite.prepare('SELECT state FROM agent_messages WHERE id = ?').get(id) as {
      state: string
    }
    expect(after.state, 'the refused write changed the row anyway').toBe('queued')
  })

  it('refuses raw SQL that sets the column, with the table name written in full', async () => {
    const id = await oneComment()
    expect(() =>
      t.client.sqlite.prepare('UPDATE agent_messages SET state = ? WHERE id = ?').run('handled', id),
    ).toThrow(/outside moveMessageTo/)
    const after = t.client.sqlite.prepare('SELECT state FROM agent_messages WHERE id = ?').get(id) as {
      state: string
    }
    expect(after.state).toBe('queued')
  })

  it('lets the one door through, and writes the two stamps with the word', async () => {
    const id = await oneComment()
    const { moveMessageTo } = await import('../src/server/lib/dispatch.ts')
    const moved = moveMessageTo(id, 'sent')
    expect(moved.from).toBe('queued')
    expect(moved.to).toBe('sent')

    const row = t.client.sqlite
      .prepare('SELECT state, state_at, sent_at FROM agent_messages WHERE id = ?')
      .get(id) as { state: string; state_at: string | null; sent_at: string | null }
    expect(row.state).toBe('sent')
    expect(row.state_at, 'the word moved and nothing recorded when').not.toBeNull()
    expect(row.sent_at, 'a comment that has gone out has no moment it went out').not.toBeNull()
  })

  it('refuses a move backwards by name, which is what the gate on somebody words rests on', async () => {
    const id = await oneComment()
    const { moveMessageTo } = await import('../src/server/lib/dispatch.ts')
    moveMessageTo(id, 'sent')
    moveMessageTo(id, 'delivered')
    expect(() => moveMessageTo(id, 'sent')).toThrow(/only ever moves forward/)
    expect(() => moveMessageTo(id, 'queued')).toThrow(/only ever moves forward/)
    // AND NOT BETWEEN THE TWO ENDS EITHER. A comment that was dealt with did not later fail.
    moveMessageTo(id, 'handled')
    expect(() => moveMessageTo(id, 'failed')).toThrow(/only ever moves forward/)
  })

  it('leaves the door shut after a refusal inside the write', async () => {
    // The flag the trigger reads is closed in a `finally`, so a throw inside moveMessageTo does not
    // leave the next statement on this connection able to write the column.
    const id = await oneComment()
    const { moveMessageTo } = await import('../src/server/lib/dispatch.ts')
    expect(() => moveMessageTo('nosuchmessage', 'sent')).toThrow()
    const { agentMessages } = await import('../src/server/db/schema.ts')
    const { db } = await import('../src/server/db/client.ts')
    const { eq } = await import('drizzle-orm')
    expect(() => db.update(agentMessages).set({ state: 'sent' }).where(eq(agentMessages.id, id)).run()).toThrow(
      /outside moveMessageTo/,
    )
  })
})
