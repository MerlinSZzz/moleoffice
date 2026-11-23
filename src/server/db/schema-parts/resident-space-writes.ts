// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { agents } from './agents.ts'

/**
 * EACH FILE A RESIDENT WROTE INTO ITS SPACE THROUGH THE OFFICE'S DOOR: who, when, how big and its sha256. A file's
 * modified time is not this record, because any program on this machine can change it. A write may replace a file;
 * the office first keeps the old bytes under `.versions/` in the space, and `replacedVersion` names that path. So a
 * path has one row per write.
 */
export const residentSpaceWrites = aPartTable(sqliteTable(
  'resident_space_writes',
  {
    id: text('id').primaryKey(),
    residentId: text('resident_id')
      .notNull()
      .references(() => agents.id),
    path: text('path').notNull(),
    bytes: integer('bytes').notNull(),
    sha256: text('sha256').notNull(),
    writtenAt: text('written_at').notNull(),
    writtenByKind: text('written_by_kind').notNull(),
    writtenById: text('written_by_id').notNull(),
    /** The earlier version this write kept before replacing the file, by its path in the space, or NULL for a new file. */
    replacedVersion: text('replaced_version'),
  },
  (t) => [index('resident_space_writes_path_idx').on(t.residentId, t.path)],
), { existingArchive: true })
