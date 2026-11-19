// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable, type ExistingArchive } from '../part-tables.ts'

const existingArchive: ExistingArchive = { existingArchive: true }

export const officeRestartGrants = aPartTable(sqliteTable('office_restart_grants', {
  agentId: text('agent_id').primaryKey().notNull(),
  decisionId: text('decision_id').notNull(),
}), existingArchive)
