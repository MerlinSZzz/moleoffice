// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * ONE ROW PER HOUR, PER LISTENER, PER OPERATION, FOR THE CALLS NOBODY NEEDS ONE ROW EACH FOR.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A COUNTED ROW AND NOT A REQUEST ROW
 * ---------------------------------------------------------------------------------------
 *
 * A long-poll hold repeats: the same waiter asks the same question every few seconds, and the same
 * message worker says it is still waiting every time it looks. These repeated requests can make up
 * much of the request log. A row that says only "the same waiter asked the same question again"
 * measures the asking, not the work.
 *
 * The operations that are counted this way are declared once, on the operation itself, by
 * `countedByTheHour` in src/shared/ops.ts. `src/server/lib/usage.ts` reads that declaration at its
 * one insert and writes a row here instead of an `api_calls` row.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A "LISTENER" IS, AND WHY IT IS THE ACTOR
 * ---------------------------------------------------------------------------------------
 *
 * One row per LISTENER, and the listener is the caller's `actor_id`. On these rows it is the handle
 * of the agent whose mail is being waited for: the waiter tool sends `x-mole-office-actor-id: <the
 * handle>` (tools/hold-the-handle.mjs), so it answers "which waiter" directly. The session changes
 * when a waiter restarts and the address names the machine rather than the waiter, so neither is
 * the listener; the actor is. A caller that named nobody folds under the empty string, which is a
 * real listener — the waiter that did not say which agent it was answering as.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS MEASURED, NOT AUTHORED, LIKE header_only_calls BESIDE IT
 * ---------------------------------------------------------------------------------------
 *
 * Nobody wrote a counted row: the server counted requests it was already answering. Nothing can
 * rebuild one, so a durable format may not carry it, and it is in `MEASURED_TABLES`. Like
 * `header_only_calls`, the empty string stands for a listener or a project nobody could read,
 * because SQLite treats NULLs as distinct in a unique index and a NULL key would make the upsert
 * insert a second row for every request instead of counting.
 */
export const hourlyCalls = aPartTable(sqliteTable(
  'hourly_calls',
  {
    /** nanoid, like every other id here, so a finding can cite one row. */
    id: text('id').primaryKey(),
    /** The local wall-clock hour, `YYYY-MM-DD HH`, so the count folds by the hour the person lived. */
    hour: text('hour').notNull(),
    /** The operation, from the closed list. Never null: only a named folded operation reaches here. */
    operation: text('operation').notNull(),
    /** The project the call resolved to, or the empty string because the route resolved none. */
    workspaceId: text('workspace_id').notNull(),
    /** Which waiter: the caller's `actor_id`, or the empty string because it named nobody. */
    listener: text('listener').notNull(),
    /** How many calls this listener made at this operation in this hour. */
    calls: integer('calls').notNull().default(0),
  },
  (t) => [uniqueIndex('hourly_calls_operation_hour_idx').on(t.hour, t.operation, t.workspaceId, t.listener)],
), { existingMeasured: true })
