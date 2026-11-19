// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

// Binary database backups retain all three tables. Text archives omit installation
// inventory because their request path materializes exported rows.
const archive = {
  exported: false as const, restore: 'may be lost' as const,
  why: 'Text and project archives omit physical installation inventory and its running summaries to avoid full inventory scans on export requests. Binary database backups retain these rows.',
  repair: 'Restore the physical store folders, review a read-only storage backfill plan, then apply its exact checked digest. Until then the category read is unmeasured and incomplete.',
  fillForTheProof: async () => (await import('../storage/inventory.ts')).fillStorageProof(),
}
export const storageFiles = aPartTable(sqliteTable('storage_files', {
  path: text('path').primaryKey(), category: text('category').notNull(),
  bytes: integer('bytes').notNull(), fingerprint: text('fingerprint').notNull(), seenPlan: text('seen_plan'),
}), archive)
export const storageTotals = aPartTable(sqliteTable('storage_totals', {
  category: text('category').primaryKey(), bytes: integer('bytes').notNull(), files: integer('files').notNull(),
}), archive)
export const storageMeasurement = aPartTable(sqliteTable('storage_measurement', {
  id: integer('id').primaryKey(), generation: integer('generation').notNull(), phase: text('phase').notNull(),
  planDigest: text('plan_digest'), skipped: integer('skipped').notNull().default(0), checkedGeneration: integer('checked_generation'),
}), archive)
