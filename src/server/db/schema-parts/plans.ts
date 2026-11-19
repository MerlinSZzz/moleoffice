// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

export const plans = aPartTable(sqliteTable(
  'plans',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** What this plan is about, in the writer's words. */
    title: text('title').notNull(),
    /** PLAN_STATES in shared/plandoc.ts: open, done or dropped. Nobody derives it. */
    state: text('state').notNull().default('open'),
    /**
     * When the person who owns this plan last said they had read it, or NULL if they never have.
     *
     * This is what makes "6 lines added, 1 changed since you read this" answerable WITHOUT keeping a
     * second copy of the plan. A changed line is one whose `updated_at` is later than this and whose
     * `updated_by` is somebody else. A stored copy of the body as last seen would be the same words in
     * two places, which is the defect this repository keeps finding.
     */
    readAt: text('read_at'),
    /**
     * WHO MARKED IT READ, WHEN IT WAS NOT A PERSON (migration 0295). The registry id of the secretary that marked the
     * plan as read under the person's grant, and the id of that grant. NULL in both when a person marked it, or nobody
     * has: a person's own mark sets both back to NULL, and every row before the migration was a person's mark.
     */
    readByAgent: text('read_by_agent'),
    readUnderGrant: text('read_under_grant'),
    /** LOCAL wall clock, all three. No SQL default, for the reason `reader_anchors` gives. */
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    createdBy: text('created_by').notNull(),
    movedFromDraft: text('moved_from_draft'),
  },
  (t) => [
    // ONE PLAN PER DRAFT, and the database is what says so: a draft moved twice would be the same
    // words stored twice, which is the defect migration 0196 exists to end. Partial, so every plan
    // written as a plan costs nothing. The same words as the migration.
    uniqueIndex('plans_moved_from_draft_idx').on(t.movedFromDraft).where(sql`${t.movedFromDraft} IS NOT NULL`),
  ],
), existingArchive)
