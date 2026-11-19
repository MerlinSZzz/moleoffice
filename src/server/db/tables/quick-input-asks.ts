// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * EVERY ASK FOR A QUICK INPUT THAT NAMED A RUN IN AN OFFICE TERMINAL, typed or refused, migration 0272. `atMs` is the one
 * stored time, in milliseconds since the epoch, because the ten minutes for each agent are counted from it. `outcome`
 * is one of `QUICK_INPUT_OUTCOMES`, and `says` the sentence the asker was answered with. src/server/lib/quick-inputs.ts
 * is the one writer.
 */
export const quickInputAsks = sqliteTable('quick_input_asks', {
  id: text('id').primaryKey().notNull(),
  atMs: integer('at_ms').notNull(),
  /** The registry id of the agent the run serves: whose terminal, and whose ten minutes. */
  agentId: text('agent_id').notNull(),
  /** The session record the ask named, and the office terminal that run works in. */
  run: text('run').notNull(),
  terminal: text('terminal').notNull(),
  input: text('input').notNull(),
  outcome: text('outcome').notNull(),
  says: text('says').notNull(),
  /** Who asked, as the request named itself, and how it proved that, or NULL when it proved nothing. */
  askedByKind: text('asked_by_kind').notNull(),
  askedById: text('asked_by_id').notNull(),
  provedBy: text('proved_by'),
}, table => [
  index('quick_input_asks_agent_at_idx').on(table.agentId, table.atMs),
  check(
    'quick_input_asks_outcome',
    sql`${table.outcome} IN ('typed', 'not-the-agent', 'no-list', 'not-on-the-list', 'too-soon', 'not-typed', 'typed-without-enter', 'unknown')`,
  ),
])
