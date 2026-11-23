// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { agents } from './agents.ts'

/**
 * WHICH REGISTRY AGENT A PROJECT RECORD IS. One row per record of kind `agent`.
 *
 * THE RECORDS ARE KEPT AND LINKED, NEVER DELETED (M2). A record of kind `agent` carries an inbox, a
 * conversation and a work domain that all point at its id, so removing it would strand them. This
 * table is the join, and it is a table rather than a column on `records` because a migration here
 * may not rewrite a stored value — the rule tests/migration.test.ts holds every file in `drizzle/`
 * to — and an added column would have to be filled by rewriting one.
 *
 * MAPPED BY HANDLE, WHICH IS WHAT M2 ASKS FOR AND HAS ONE CONSEQUENCE WORTH KNOWING. A handle is
 * unique within a project, not across the installation. Two projects each holding an agent with the
 * handle `builder` therefore map to ONE registry row, and both records point at it. That is the
 * reading M2 states; if it turns out to be wrong, the fix is a second column here saying which
 * project's record this is, not a silent split.
 */
export const agentRecords = aPartTable(sqliteTable(
  'agent_records',
  {
    /** The `records` row of kind `agent`. One row per record, so the record id is the key. */
    recordId: text('record_id').primaryKey(),
    /** The `agents` row that record is. */
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
  },
  (t) => [index('agent_records_agent_idx').on(t.agentId)],
), { existingArchive: true })
