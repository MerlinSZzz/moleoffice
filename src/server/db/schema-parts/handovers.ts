// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'

const existingArchive = { existingArchive: true } as const

/**
 * A HANDOVER DOCUMENT FOR AN AGENT, added by migration 0232, by two of the person's decisions.
 * Every agent keeps one, so the next session of the same agent, or whoever takes over its work, can
 * start from it.
 *
 * APPEND-ONLY. A new handover is a new row, and the newest row for an agent is its current handover. Nothing updates
 * or deletes a row: src/server/lib/handovers.ts only inserts.
 *
 * Written by the agent itself, proved by its own key, or by the person. Never by another agent.
 */
export const handovers = aPartTable(sqliteTable(
  'handovers',
  {
    /** nanoid, so one handover can be cited. */
    id: text('id').primaryKey(),
    /** The lasting registry id of the agent the handover is for (`agents.id`), never a handle. */
    agentId: text('agent_id').notNull(),
    /** The project it was written in. */
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    /** Plain text, at most HANDOVER_LONGEST_CHARACTERS characters (src/config/settings.mjs). */
    text: text('text').notNull(),
    /** LOCAL wall clock of the office when the row was written. No SQL default, for the reason `reader_anchors` gives. */
    writtenAt: text('written_at').notNull(),
    /** `agent` or `person`, and the id in that registry. */
    writtenByKind: text('written_by_kind').notNull(),
    writtenById: text('written_by_id').notNull(),
    /** The run the request's session header named, or NULL when it named none. */
    sessionId: text('session_id'),
  },
  (t) => [index('handovers_agent_idx').on(t.agentId, t.writtenAt)],
), existingArchive)
