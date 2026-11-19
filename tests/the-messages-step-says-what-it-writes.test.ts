// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGES STEP SAYS WHAT IT WRITES, AND THE DOOR WRITES THE SHAPE THE STEP EXPECTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, 12 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * From 12:15 to 12:29 the live office would not start. The guard in src/server/index.ts ran the
 * real migrations against an in-memory copy of the database and refused because the copy came out
 * byte-different while every step's report said nothing to do. The difference was one row, the delivery row of one
 * message:
 *
 *     message_delivery DmZt_mqEn8ft, mark queued, inferred_by NULL
 *
 * The messages step `stampWhatWasInferred` matched it, wrote
 * `inferred_by = '0115_how_far_a_message_got'`, and printed *Nothing to do: the delivery rows exist
 * for all 2942 of the 2943 message(s) in this database, so nothing was written.* 4283 other rows
 * whose `inferred_by` was NULL were left alone, so an empty column was not what singled it out.
 *
 * TWO THINGS WERE WRONG AND BOTH ARE HERE.
 *
 * 1. THE STEP WROTE AND SAID IT HAD NOT. `stampWhatWasInferred` returned a count `migrateInPlace`
 *    never added to the step's report, so `THE_STEPS`' `wrote` read zero while the bytes had moved.
 *    The guard saw a write no report named and refused. The step now reports every stamped row by
 *    id and what changed, and `wrote` counts it (problem `IhInQ2Mf5BZq`, invariant 1, no fake
 *    success).
 *
 * 2. THE DOOR WROTE A ROW THE STEP THOUGHT IT HAD TO REPAIR. A message whose writer chose a run
 *    has a recipient the OFFICE worked out: the writer named a session, and the door turned it into
 *    the agent that run worked as. The door wrote that on the message but left `inferred_by` null,
 *    so the migration read the null as *nobody said anything* and stamped it. The door now writes
 *    the answer `inferredByFor` gives, in one place shared with the step, so the next start after
 *    such a message writes nothing (invariant 9, one fact worked out in one place).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Remove the `lines.push` that names the stamped rows in `describeMessageDelivery` and case 1
 *     goes red: the step writes a row and the report no longer names it.
 *   - Put the door's row shape back to what it was — `writeTheDeliveries` writing null — and case 2
 *     goes red: the step stamps the row again and `prepareToServe` refuses.
 *   - Restore both, and the file is byte-identical.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { prepareToServe } from '../src/server/db/migrate.ts'
import { INFERRED_BY_THE_DOOR } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'default'
const HANDLE = 'a-run-somebody-chose'
const HUMAN = { type: 'human', id: THE_PERSON } as const

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})

afterEach(() => {
  t?.close()
})

/** A durable agent, the run it worked as, and a page a comment can point at. */
function aRunAndAPage(): { session: string; about: string; agent: string } {
  const agent = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'agent',
    title: 'The agent a person chose',
    data: { handle: HANDLE, runtime: 'claude-code', state: 'active' },
    actor: HUMAN,
  })
  const session = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'A run of that agent',
    data: { state: 'running', runtime: 'claude-code', ranAs: [{ workspaceId: WORKSPACE, agentId: agent.id }] },
    actor: HUMAN,
  })
  const about = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'note',
    title: 'A page a comment can point at',
    data: { body: 'The claim this is about.' },
    actor: HUMAN,
  })
  return { session: session.id, about: about.id, agent: agent.id }
}

/**
 * A QUEUED DELIVERY ROW ADDRESSED BY CHOOSING A RUN, in the stored shape the live row
 * `DmZt_mqEn8ft` had: a `chosenRecipient`, a `target`, and no `to`.
 *
 * It is written through the product's own doors and then read back off the row, so this is the
 * shape the worker really makes and not a shape typed out in the test. The choice is patched on
 * afterwards, which is the review column's own act and the path that does not write the resolved
 * agent into `to`.
 */
function aChosenMessage(): { messageId: string; deliveryId: string; inferredBy: string | null; mark: string } {
  const { session, about, agent } = aRunAndAPage()
  const message = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'message',
    title: 'hi',
    data: {
      body: 'hi\n',
      target: { target: { kind: 'record', recordId: about, workspaceId: WORKSPACE }, place: { at: 'surface' } },
    },
    actor: HUMAN,
  })
  t.api.patchRecord(
    message.id,
    { dataPatch: { chosenRecipient: { kind: 'session', sessionId: session, why: 'It was active.', agentId: agent } } },
    HUMAN,
  )
  const row = t.client.sqlite
    .prepare('SELECT id, mark, inferred_by AS inferredBy FROM message_delivery WHERE message_id = ?')
    .get(message.id) as { id: string; mark: string; inferredBy: string | null } | undefined
  expect(row, 'the door wrote no delivery row for a message addressed by choosing a run').toBeDefined()
  return { messageId: message.id, deliveryId: row!.id, inferredBy: row!.inferredBy, mark: row!.mark }
}

describe('the messages step names every row it stamps', () => {
  it('reports the row by id and what changed, instead of saying nothing was written', async () => {
    const made = aChosenMessage()
    expect(made.mark, 'this test is about a queued row').toBe('queued')
    // THE EXACT SHAPE THE LIVE DATABASE HAD: written before the door wrote the stamp, so its
    // `inferred_by` was null. Put this row back to that shape, and the step still stamps it.
    t.client.sqlite.prepare('UPDATE message_delivery SET inferred_by = NULL WHERE id = ?').run(made.deliveryId)

    const { migrateMessageDelivery, describeMessageDelivery } = await import(
      '../src/server/db/message-delivery-migration.ts'
    )
    const report = migrateMessageDelivery(t.client.sqlite)

    // IT WRITES, AND THE WRITE IS NAMED. The historical shape is one the step still stamps; what is
    // proved here is that it can no longer do so silently.
    expect(report.stamped, 'the step did not stamp the historical shape this test is about').toBe(1)
    expect(report.stampedRows.map((one) => one.deliveryId)).toEqual([made.deliveryId])
    expect(report.stampedRows[0]?.now, 'the migration claimed the door\u2019s own reading as its own').toBe(
      INFERRED_BY_THE_DOOR,
    )

    const said = describeMessageDelivery(report)
    expect(said, 'the step wrote a row and did not name it').toContain(made.deliveryId)
    expect(said, 'the step wrote a row and still said nothing was written').not.toContain('Nothing to do')
  })
})

describe('a queued delivery row the door wrote does not refuse a start', () => {
  it('serves a database holding that row, and the guard is not weakened', async () => {
    const made = aChosenMessage()
    expect(made.mark, 'this test is about a queued row').toBe('queued')

    // THE GUARD SERVES, and this is the assertion the mutation is about: with the door put back to
    // writing null, the step stamps the row and this comes back false with the row named.
    const decision = prepareToServe(t.client.sqlite)
    expect(decision.serve, decision.serve ? '' : decision.refusal).toBe(true)

    // AND THE SHAPE THAT MADE IT SERVE, read off the row rather than recited. A chosen run is a
    // recipient the office worked out, so the row says so and the step has nothing to repair.
    expect(made.inferredBy, 'the door did not write the shape this test is about').toBe(INFERRED_BY_THE_DOOR)
  })
})
