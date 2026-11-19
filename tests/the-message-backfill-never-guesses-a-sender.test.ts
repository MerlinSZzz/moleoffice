// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE BACKFILL NEVER GUESSES A SENDER: A NAME THAT MEANS TWO AGENTS WRITES NONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `planMessageDelivery` in src/server/db/message-delivery-migration.ts decides who a historical
 * message was from. It reads `changes.actor_id` — a free-text actor stamp, whatever arrived in the
 * header, stored as typed and never resolved before storage — and maps it onto a registry row.
 *
 * It used to do that with `SELECT id FROM agents WHERE id = ? OR handle = ?`. One statement, no
 * ordering, so SQLite hands back whichever row it reaches first. That is harmless while every
 * agent's id equals its handle. The day one string can be one agent's id and another's handle, it
 * puts somebody else's name on somebody's words, permanently, with nothing saying it guessed.
 *
 * PUTTING THE WRONG NAME ON SOMEBODY'S WORDS IS WORSE THAN PUTTING NONE. So the rule this file holds
 * is: where the stamp names more than one agent, no sender is written and the run says so in its own
 * reporting, in its own list, apart from the stamps nothing answers to at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HANDLE HALF STAYS, WHICH IS THE OTHER HALF OF THE ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * The rows this backfill exists for were written before the registry existed, and the handle half is
 * the only reason any of them resolves at all. Dropping it would turn messages that have a findable
 * sender into messages that say nobody sent them — a worse answer, not a truer one. So both halves
 * stay and the guess is what goes.
 *
 * ---------------------------------------------------------------------------------------
 * THIS MIGRATION IS NOT FROZEN HISTORY
 * ---------------------------------------------------------------------------------------
 *
 * It is not run at server start. It runs from `npm run db:migrate`, from scripts/reset.ts and from
 * scripts/restore-check.ts, and `npm run db:migrate` is what a merge runs on the live database. So it
 * will run again, on real data. It is declared safe to run twice and still is: this changes which
 * rows it declines to write, never which rows it rewrites.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Put the single `id = ? OR handle = ?` statement back in `planMessageDelivery` and the
 *     ambiguous case goes red: a sender is written for a name that means two agents.
 *   - Fold `sendersNamingMoreThanOneAgent` into `sendersNotFound` and the reporting case goes red:
 *     an ambiguity is reported as an absence.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type MigrationLib = typeof import('../src/server/db/message-delivery-migration.ts')

const WORKSPACE = 'default'

let t: TestDb
let migration: MigrationLib

/** The rows this case writes straight at the tables, taken away again at its end. */
const madeAgentIds: string[] = []
const madeAssetIds: string[] = []
const madeMessageIds: string[] = []

beforeAll(async () => {
  t = await freshDb()
  migration = await import('../src/server/db/message-delivery-migration.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

afterEach(() => {
  const marks = (count: number): string => Array.from({ length: count }, () => '?').join(', ')
  if (madeMessageIds.length > 0) {
    const which = `(${marks(madeMessageIds.length)})`
    t.client.sqlite.prepare(`DELETE FROM message_delivery WHERE message_id IN ${which}`).run(...madeMessageIds)
    t.client.sqlite.prepare(`DELETE FROM revisions WHERE record_id IN ${which}`).run(...madeMessageIds)
    t.client.sqlite.prepare(`DELETE FROM changes WHERE record_id IN ${which}`).run(...madeMessageIds)
    t.client.sqlite.prepare(`DELETE FROM records WHERE id IN ${which}`).run(...madeMessageIds)
  }
  if (madeAgentIds.length > 0) {
    const which = `(${marks(madeAgentIds.length)})`
    t.client.sqlite.prepare(`DELETE FROM agent_records WHERE agent_id IN ${which}`).run(...madeAgentIds)
    t.client.sqlite.prepare(`DELETE FROM handle_holds WHERE agent_id IN ${which}`).run(...madeAgentIds)
    t.client.sqlite.prepare(`DELETE FROM agents WHERE id IN ${which}`).run(...madeAgentIds)
  }
  if (madeAssetIds.length > 0) {
    t.client.sqlite.prepare(`DELETE FROM assets WHERE id IN (${marks(madeAssetIds.length)})`).run(...madeAssetIds)
  }
  madeAgentIds.length = 0
  madeAssetIds.length = 0
  madeMessageIds.length = 0
})

/**
 * One agent row, written straight at the table.
 *
 * A row whose id is its handle is what the agents registered before the mint hold; a row whose id is
 * not its handle is what one registered after it holds, and what a renamed agent holds today. Both
 * shapes are needed to build a stamp that names two agents.
 */
/**
 * The `assets` row an agent's picture points at.
 *
 * `agents.avatar_asset_id` carries a foreign key into `assets`, and the column is never null, so a
 * row written straight at the table needs its picture row written first. This is the same `default`
 * origin row src/server/db/participants-migration.ts writes for every agent it registers.
 */
function aDrawnPictureRow(assetId: string): void {
  madeAssetIds.push(assetId)
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(assetId, '2026-08-27 10:00:00')
}

function anAgentRow(id: string, handle: string, name: string, retired = false): void {
  madeAgentIds.push(id)
  aDrawnPictureRow(`avatar-default-agent-${id}`)
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, handle, `avatar-default-agent-${id}`, retired ? 1 : 0, '2026-08-27 10:00:00')
}

/**
 * One message record with no delivery row and no sender, and a create row in the change log naming
 * who wrote it. That is the state this backfill exists for, and it cannot be reached through the
 * door: a message written since the pool arrived already has its rows.
 */
function aMessageFromBefore(recordId: string, writtenBy: string): void {
  madeMessageIds.push(recordId)
  t.client.sqlite
    .prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
        `VALUES (?, ?, '${THE_TEST_OFFICES_OWNER.id}', ?, ?, 'message', ?, NULL, ?, 'authored')`,
    )
    .run(
      recordId,
      WORKSPACE,
      '2026-08-28 09:00:00',
      '2026-08-28 09:00:00',
      'A line written before the pool arrived',
      JSON.stringify({ body: 'what it said', from: 'claude-code, before the registry' }),
    )
  t.client.sqlite
    .prepare(
      'INSERT INTO changes (id, record_id, op, actor_type, actor_id, at, workspace_id) ' +
        "VALUES (?, ?, 'create', 'agent', ?, ?, ?)",
    )
    .run(`c-${recordId}`, recordId, writtenBy, '2026-08-28 09:00:00', WORKSPACE)
  t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ?').run(recordId)
}

/** The plan for one message, by its record id. */
function planFor(recordId: string): { sentBy: unknown; namesMoreThanOneAgent: boolean } {
  const plan = migration.planMessageDelivery(t.client.sqlite)
  const one = plan.messages.find((each) => each.recordId === recordId)
  expect(one, `the plan has nothing for ${recordId}`).not.toBeUndefined()
  return one!
}

// =========================================================================== the ordinary answers

describe('the backfill still finds the sender it could always find', () => {
  it('finds an agent by the id its stamp holds', () => {
    anAgentRow('Yh3kQ2mVb8Tz', 'wrote-it', 'Wrote It')
    aMessageFromBefore('msg-by-id-0001', 'Yh3kQ2mVb8Tz')

    expect(planFor('msg-by-id-0001').sentBy).toEqual({ kind: 'agent', id: 'Yh3kQ2mVb8Tz' })
  })

  it('finds an agent by the HANDLE its stamp holds, which is why that half stays', () => {
    // The rows this backfill exists for were written before the registry, under a name. Removing the
    // handle half would turn a message that has a sender into one that says nobody sent it.
    anAgentRow('Yh3kQ2mVb8Tz', 'wrote-it', 'Wrote It')
    aMessageFromBefore('msg-by-name-001', 'wrote-it')

    expect(planFor('msg-by-name-001').sentBy).toEqual({ kind: 'agent', id: 'Yh3kQ2mVb8Tz' })
  })

  it('finds a RETIRED agent by its name, because the message is still its message', () => {
    anAgentRow('Yh3kQ2mVb8Tz', 'wrote-it', 'Wrote It', true)
    aMessageFromBefore('msg-retired-001', 'wrote-it')

    expect(planFor('msg-retired-001').sentBy).toEqual({ kind: 'agent', id: 'Yh3kQ2mVb8Tz' })
  })

  it('writes no sender for a stamp neither registry holds, and does not call that an ambiguity', () => {
    aMessageFromBefore('msg-nobody-0001', 'claude-code/nobody-registered')

    const one = planFor('msg-nobody-0001')
    expect(one.sentBy).toBeNull()
    expect(one.namesMoreThanOneAgent, 'an absence was reported as an ambiguity').toBe(false)
  })
})

// =========================================================================== the refusal to guess

describe('a stamp that names two agents gets no sender at all', () => {
  /**
   * The test secretary's handle, as a stamp, names two agents: one whose id it is, and a live one whose handle it is. That
   * is the state that option 1 of a decision leaves reachable — the agents registered
   * before the mint keep handle-shaped ids, and a freed name can be taken by somebody else.
   */
  function twoAgentsNamedArgus(): void {
    anAgentRow(THE_TEST_OFFICES_SECRETARY.handle, THE_TEST_OFFICES_SECRETARY.name, THE_TEST_OFFICES_SECRETARY.name, true)
    t.client.sqlite.prepare('UPDATE agents SET handle = ? WHERE id = ?').run(`${THE_TEST_OFFICES_SECRETARY.handle}-the-first`, THE_TEST_OFFICES_SECRETARY.handle)
    anAgentRow('Yh3kQ2mVb8Tz', THE_TEST_OFFICES_SECRETARY.handle, `${THE_TEST_OFFICES_SECRETARY.name} Two`)
  }

  it('writes no sender, rather than the row the database happened to reach first', () => {
    twoAgentsNamedArgus()
    aMessageFromBefore('msg-two-agents1', THE_TEST_OFFICES_SECRETARY.handle)

    const one = planFor('msg-two-agents1')
    expect(one.sentBy, 'the migration chose one of two agents').toBeNull()
    expect(one.namesMoreThanOneAgent).toBe(true)
  })

  it('says so in its own reporting, in its own list, naming both agents', () => {
    twoAgentsNamedArgus()
    aMessageFromBefore('msg-two-agents2', THE_TEST_OFFICES_SECRETARY.handle)

    const report = migration.migrateMessageDelivery(t.client.sqlite)

    // ITS OWN LIST. *Nothing answers to this name* and *two agents answer to it* are different facts.
    expect(report.sendersNotFound.map((one) => one.recordId), 'an ambiguity was filed as an absence').not.toContain(
      'msg-two-agents2',
    )
    const said = report.sendersNamingMoreThanOneAgent.find((one) => one.recordId === 'msg-two-agents2')
    expect(said, 'the run did not report the stamp it refused to resolve').not.toBeUndefined()
    expect(said!.actorId).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said!.couldBe.join(' '), 'the report does not name the first agent').toContain(`${THE_TEST_OFFICES_SECRETARY.name} (${THE_TEST_OFFICES_SECRETARY.handle})`)
    expect(said!.couldBe.join(' '), 'the report does not name the second').toContain(`${THE_TEST_OFFICES_SECRETARY.name} Two (Yh3kQ2mVb8Tz)`)

    // AND NO SENDER REACHED THE RECORD.
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get('msg-two-agents2') as {
      data: string
    }
    expect((JSON.parse(row.data) as Record<string, unknown>)['sentBy']).toBeUndefined()
  })

  it('writes the sender the moment the name means one agent again', () => {
    // The refusal is about the ambiguity and nothing else. With one agent bearing the name, the same
    // stamp resolves as it always did.
    anAgentRow('Yh3kQ2mVb8Tz', THE_TEST_OFFICES_SECRETARY.handle, `${THE_TEST_OFFICES_SECRETARY.name} Two`)
    aMessageFromBefore('msg-one-agent01', THE_TEST_OFFICES_SECRETARY.handle)

    expect(planFor('msg-one-agent01').sentBy).toEqual({ kind: 'agent', id: 'Yh3kQ2mVb8Tz' })
  })

  it('is still safe to run twice: the second run has nothing to write and nothing to refuse', () => {
    twoAgentsNamedArgus()
    aMessageFromBefore('msg-two-agents3', THE_TEST_OFFICES_SECRETARY.handle)

    const first = migration.migrateMessageDelivery(t.client.sqlite)
    const second = migration.migrateMessageDelivery(t.client.sqlite)

    expect(first.sendersNamingMoreThanOneAgent.length).toBe(1)
    expect(second.sendersWritten, 'the second run wrote a sender').toBe(0)
    expect(second.deliveriesWritten, 'the second run wrote a delivery row').toBe(0)
  })
})
