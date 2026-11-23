// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { agents } from './agents.ts'

/**
 * WHICH LIVE SESSION IS ANSWERING AS ONE DURABLE AGENT. One row per hold.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A HOLD IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion H1 of design/messages/ACCEPTANCE.md section 10: a message to an agent that is open in a
 * terminal is answered by that session, not by a fresh run started beside it.
 *
 * A row here says: this session record, on this machine, running this tool, is answering as this
 * agent. The session's own script says so every few seconds, and that stamp is `last_heard_at`. Nothing
 * else in this database says which of the many processes on a machine is a given agent right now.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A TABLE AND NOT A FIELD ON THE SESSION RECORD
 * ---------------------------------------------------------------------------------------
 *
 * A heartbeat is a write every few seconds. Every write to a record's `data` makes a `changes` row
 * and a `revisions` row, so a single terminal open for a day would add thousands of both, and the
 * change log a person reads would be almost entirely heartbeats. A hold is not authored prose and
 * does not belong in the history of a record.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT A `work_claims` ROW EITHER
 * ---------------------------------------------------------------------------------------
 *
 * A second claim overlapping a live one OPENS A GROUP with the owner in it (criterion M13). H4 asks
 * for the opposite: a second session claiming a held
 * handle is refused naming the holder, and nothing is signalled. Two rules that different cannot
 * share a table without one of them being an exception nobody can see.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW IS ONLY EVER READ AGAINST ITS HEARTBEAT, WHICH IS WHY IT IS SAFE IN A BACKUP
 * ---------------------------------------------------------------------------------------
 *
 * It is an authored table, so an archive carries it, and a restored row would name a session on a
 * machine that may not exist. That is harmless because no reader ever believes a hold on its own:
 * every one asks whether the heartbeat is inside `MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS`, and a
 * restored row is far older than that, so it reads as lapsed and the next reader releases it saying
 * so. `session_resources` carries the same kind of fact for the same reason.
 */
export const handleHolds = aPartTable(sqliteTable(
  'handle_holds',
  {
    /** nanoid, so one hold can be cited. */
    id: text('id').primaryKey(),
    /**
     * The `agents` row whose handle is held.
     *
     * THE HANDLE ITSELF IS NOT STORED HERE. It is on the registry row, one edit away from being
     * renamed, and a copy here would be the same fact in two places with nothing making them agree.
     */
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    /** The `records` row of kind `session` for the session that is answering. */
    sessionRecordId: text('session_record_id').notNull(),
    /** The computer that session is running on, in its own words. */
    machine: text('machine').notNull(),
    /** `claude-code`, `codex` or `opencode`: the tool the session is a session of. */
    runtime: text('runtime').notNull(),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    claimedAt: text('claimed_at').notNull(),
    /** When the session last said it was still there. Local wall clock, set on every beat. */
    lastHeardAt: text('last_heard_at').notNull(),
    /**
     * The same moment as `last_heard_at`, as an instant with its offset, from the same reading of the clock, migration
     * 0358. On the night the clocks go back the stamp alone cannot say which pass of the hour from 01:00 it means. NULL
     * on a row written before the migration, which is read from its stamp as before.
     */
    lastHeardInstant: text('last_heard_instant'),
    /** When the hold ended, or NULL because it has not. */
    releasedAt: text('released_at'),
    /** One plain sentence saying why, when `released_at` is set. NULL otherwise. */
    releasedBecause: text('released_because'),
  },
  (t) => [
    // ONE LIVE HOLD PER AGENT, IN SQL. H4 is refused in the door with a sentence naming the holder;
    // this is what makes the rule true even if a door is ever bypassed.
    uniqueIndex('handle_holds_one_live_per_agent_idx').on(t.agentId).where(sql`released_at IS NULL`),
    index('handle_holds_session_idx').on(t.sessionRecordId),
  ],
), { existingArchive: true })
