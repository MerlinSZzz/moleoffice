// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

export const contactGroups = aPartTable(sqliteTable(
  'contact_groups',
  {
    /** nanoid, so one group can be cited. */
    id: text('id').primaryKey(),
    /** `person` or `agent`, and the id in that registry: whose arrangement this is. */
    ownerKind: text('owner_kind').notNull(),
    ownerId: text('owner_id').notNull(),
    /** `human` or `agent` for one of the two top groups; this row's own id for a group somebody made. */
    key: text('key').notNull(),
    /**
     * WHICH TOP GROUP THIS SECOND-LEVEL GROUP SITS UNDER, fixed when it is made. Criterion M119.
     *
     * NULL IS A ROW WRITTEN BEFORE MIGRATION 0161, and it is read off the key rather than stored:
     * `people` and the six role group keys are defaults with a declared side, and a group somebody
     * made before the column existed was made under Agent, which is where every contact was. A
     * stored value wins once a row has one.
     */
    side: text('side'),
    /** The heading a reader sees. */
    name: text('name').notNull(),
    /** Where it sits, counting from zero. Only ever an order somebody set. */
    at: integer('at').notNull(),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('contact_groups_one_per_owner_idx').on(t.ownerKind, t.ownerId, t.key),
    index('contact_groups_owner_idx').on(t.ownerKind, t.ownerId),
  ],
), existingArchive)
