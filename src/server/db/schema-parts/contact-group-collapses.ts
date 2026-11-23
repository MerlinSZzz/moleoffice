// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHETHER ONE PERSON HAS FOLDED ONE GROUP AWAY, added by migration 0161. Criteria M120 and M121.
 *
 * Answer 7: the folded state is
 * kept on the server, because it is one person's behaviour rather than one screen's. So it is here
 * rather than in the browser, and the same person sees the same folds on every machine.
 *
 * A SMALL TABLE AND NOT A COLUMN ON `contact_groups`, because the six role groups and the one
 * People group are COMPUTED — a fresh installation has no `contact_groups` row for any of them.
 * Folding `retired`, which starts folded, is somebody's act even though no group row was ever
 * written, so the state needs a home whose key does not require a group row to exist.
 *
 * `group_key` NAMES EITHER A SECOND-LEVEL GROUP (`worker`, `retired`, or a group somebody made) OR
 * ONE OF THE TWO TOP GROUPS (`human`, `agent`), because every group collapses and the two top ones
 * are groups too. `collapsed` is 0 or 1: a row is the person's explicit choice, and its absence
 * means the default. `retired` defaults to folded; everything else defaults to open.
 */
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
