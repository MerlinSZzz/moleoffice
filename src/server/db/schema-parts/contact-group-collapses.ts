// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

export const contactGroupCollapses = aPartTable(sqliteTable(
  'contact_group_collapses',
  {
    /** nanoid, so one fold can be cited. */
    id: text('id').primaryKey(),
    /** `person` or `agent`, and the id in that registry: whose arrangement this is. */
    ownerKind: text('owner_kind').notNull(),
    ownerId: text('owner_id').notNull(),
    /** `human`, `agent`, a role group key, or the key of a group somebody made. */
    groupKey: text('group_key').notNull(),
    /** 1 when folded away, 0 when the person opened it. Never NULL. */
    collapsed: integer('collapsed').notNull(),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    setAt: text('set_at').notNull(),
  },
  (t) => [
    uniqueIndex('contact_group_collapses_one_per_group_idx').on(t.ownerKind, t.ownerId, t.groupKey),
    index('contact_group_collapses_owner_idx').on(t.ownerKind, t.ownerId),
  ],
), existingArchive)
