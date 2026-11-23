// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { agents } from './agents.ts'

/**
 * LEAVE TO READ A RESIDENT'S PERSONAL SPACE, one row per grant. By a decision, no other agent reads the
 * space without the resident's leave. The resident gives one named agent leave,
 * with its own key and an end date; the resident or the owner may end it early. A row is never deleted:
 * `ended_at` NULL means nobody ended it, and it holds until `until`. src/server/lib/residents.ts is its
 * one writer.
 */
export const residentReadGrants = aPartTable(sqliteTable(
  'resident_read_grants',
  {
    id: text('id').primaryKey(),
    residentId: text('resident_id')
      .notNull()
      .references(() => agents.id),
    readerId: text('reader_id')
      .notNull()
      .references(() => agents.id),
    /** The end date the resident gave, local time. */
    until: text('until').notNull(),
    givenAt: text('given_at').notNull(),
    givenByKind: text('given_by_kind').notNull(),
    givenById: text('given_by_id').notNull(),
    endedAt: text('ended_at'),
    endedByKind: text('ended_by_kind'),
    endedById: text('ended_by_id'),
  },
  (t) => [index('resident_read_grants_resident_idx').on(t.residentId), index('resident_read_grants_reader_idx').on(t.readerId)],
), { existingArchive: true })
