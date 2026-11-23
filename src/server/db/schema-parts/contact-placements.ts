// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHERE ONE CONTACT SITS, when somebody has moved it or ordered it by hand. Migration 0127.
 *
 * A contact with no row here is in the group its kind puts it in — `defaultGroupFor` in
 * `src/shared/contacts.ts` — and in the order the list already had. So a new agent lands in `agent`
 * and a new person in `human` with nothing written when they arrive, which is what M29 asks for.
 *
 * `contact` IS THE CONTACT KEY AND NOT A PARTICIPANT REFERENCE, because a contact row is one of two
 * shapes: somebody a registry holds, or a writer nobody registered (criterion M25). One string names
 * either, and it is the same string the panel keys its rows by.
 *
 * BOTH `group_key` AND `at` ARE NULLABLE and at least one is set: somebody may move a contact
 * without ordering it, or order it without moving it.
 */
export const contactPlacements = aPartTable(sqliteTable(
  'contact_placements',
  {
    /** nanoid, so one placement can be cited. */
    id: text('id').primaryKey(),
    /** `person` or `agent`, and the id in that registry: whose arrangement this is. */
    ownerKind: text('owner_kind').notNull(),
    ownerId: text('owner_id').notNull(),
    /** The contact key: `person:<id>`, `agent:<id>`, `unregistered:typed/…`. */
    contact: text('contact').notNull(),
    /** The group somebody moved it to, or NULL because nobody has moved it. */
    groupKey: text('group_key'),
    /** Where it sits in its group, or NULL because nobody has ordered it. */
    at: integer('at'),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    placedAt: text('placed_at').notNull(),
  },
  (t) => [
    uniqueIndex('contact_placements_one_per_contact_idx').on(t.ownerKind, t.ownerId, t.contact),
    index('contact_placements_owner_idx').on(t.ownerKind, t.ownerId),
  ],
), existingArchive)
