// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * A VISIT: A CITIZEN OF ONE WORLD WORKING IN ANOTHER, REGISTERED AT THE OFFICE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion C4 of design/messages/ACCEPTANCE.md section 8. A citizen may work in
 * another world, and what they came to do is written down.
 *
 * A SECOND ANSWER SETS THE SCOPE: a local agent and the person's own curl need no registration, and
 * only a caller from another world is checked. So a caller that names no home is a local and is never
 * refused, a caller whose home is this world is not checked, and only a caller from ANOTHER world
 * needs a visit.
 *
 * ---------------------------------------------------------------------------------------
 * THE OFFICE HOLDS THESE, AND EVERY WORLD CAN READ THEM
 * ---------------------------------------------------------------------------------------
 *
 * The visited world is usually not the office, so it reads the visits out of the mirror the office
 * writes — the same file criterion C2 built, which is what the mirror is for. A world that could not
 * reach the office writes the visit into its OWN copy of this table and reports it when the office
 * answers again, which is criterion C8.
 *
 * ---------------------------------------------------------------------------------------
 * "REGISTERED LATE" IS NOT A COLUMN
 * ---------------------------------------------------------------------------------------
 *
 * It is `registered_at` being later than `since`, which is the same fact and cannot disagree with
 * itself. A flag beside the two stamps would be a third place the same thing is written.
 */
export const visits = aPartTable(sqliteTable(
  'visits',
  {
    /** nanoid. A visit can be cited, and the page carries this id while it is visiting. */
    id: text('id').primaryKey(),
    /** Who is visiting: a person or an agent, named the one way a participant ever is. */
    visitorKind: text('visitor_kind').notNull(),
    visitorId: text('visitor_id').notNull(),
    /** The database identity of the world they live in. */
    fromWorld: text('from_world').notNull(),
    /** The database identity of the world they are visiting. */
    toWorld: text('to_world').notNull(),
    /** When the visit began, in the visitor's own words about its own clock. LOCAL wall clock. */
    since: text('since').notNull(),
    /** When it ended. NULL means it is still open. */
    until: text('until'),
    /** What they came to do, in the caller's own words. Never empty: the criterion asks for it. */
    why: text('why').notNull(),
    /**
     * When the office wrote this row down. Later than `since` for a visit registered late, which is
     * how criterion C8's mark is read rather than stored a second time.
     */
    registeredAt: text('registered_at').notNull(),
    /**
     * When this row reached the office, for a world holding one the office has not seen.
     *
     * NULL in the office's own copy means nothing: the office IS where it reached. In another
     * world's copy it means the visit is still waiting to be reported. `theOfficeIsInThisDatabase()`
     * is what tells a reader which of the two this row is.
     */
    reportedAt: text('reported_at'),
  },
  (t) => [
    index('visits_to_world_idx').on(t.toWorld),
    index('visits_visitor_idx').on(t.visitorKind, t.visitorId),
  ],
), existingArchive)
