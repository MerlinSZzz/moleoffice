// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { agents } from './agents.ts'

/**
 * A RESIDENT'S SLEEPS AND POSTPONED SLEEPS, migration 0233.
 * `what` is 'slept' or 'postponed'. A sleep's `endedAt` is NULL while the resident is asleep and is written once, on
 * waking; a postponement is one moment and its `endedAt` stays NULL. No row is deleted. src/server/lib/resident-sleep.ts
 * is the one writer and the one reader.
 */
export const residentSleeps = aPartTable(sqliteTable(
  'resident_sleeps',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    what: text('what').notNull(),
    beganAt: text('began_at').notNull(),
    endedAt: text('ended_at'),
    because: text('because'),
    byKind: text('by_kind').notNull(),
    byId: text('by_id').notNull(),
    sessionId: text('session_id'),
    /**
     * WHEN THE OFFICE ENDS A SLEEP IT BEGAN AT THE RESIDENT'S SLEEP TIME, and the message it sent the resident when that
     * sleep began, migration 0330. NULL in both is a sleep begun by a press, which only a wake press ends.
     */
    wakesAt: text('wakes_at'),
    reminderId: text('reminder_id'),
  },
  (t) => [index('resident_sleeps_agent_idx').on(t.agentId, t.beganAt)],
), { existingArchive: true })
