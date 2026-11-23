// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * HOW ONE PERSON HAS ARRANGED THEIR CONTACTS LIST: the second-level groups, added by migration
 * 0127 and given a side by 0161.
 *
 * Criteria M119 and M120: the first level is two locked top
 * groups, Human and Agent, and under them sit ordinary groups the person may add, rename and move
 * contacts between. Under Agent the default arrangement is by role.
 *
 * ONLY WHAT SOMEBODY CHANGED IS IN HERE. The second-level defaults are declared in
 * `src/shared/contacts.ts` and are not rows: a fresh installation has the default arrangement
 * with this table empty. A row appears when somebody makes a group, or renames or moves one of the
 * declared ones.
 *
 * NOTHING HERE SAYS WHETHER SOMEBODY MADE THE GROUP, because `key` already does: the product's own
 * groups are keyed `people`, `secretary`, `inspector`, `supervisor`, `worker`, `other` and
 * `retired`, and a group somebody made is keyed by a fresh id. `isABuiltInGroup` in
 * `src/shared/contacts.ts` is the one reader of that. A stored row keyed `human`, `agent` or
 * `special` is a leftover of the arrangement before M119 and is read as naming no group.
 *
 * IT NAMES NO PROJECT. Which group an agent belongs in is a fact about the agent, and the registries
 * this arranges belong to the installation rather than to a project — the same rule `people`,
 * `agents` and `assets` follow. A workspace column would mean making the groups again in every
 * project.
 */
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
