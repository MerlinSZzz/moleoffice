// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

export const legacyUnsealedRuns = aPartTable(sqliteTable('legacy_unsealed_runs', {
  runId: text('run_id').primaryKey().notNull(),
}), existingArchive)
