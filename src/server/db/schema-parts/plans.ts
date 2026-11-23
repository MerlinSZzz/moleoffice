// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/*
 * ROUGH PLANNING TEXT, BEFORE IT IS ANYTHING — THE TABLE `planning_drafts`, WHICH IS NO LONGER DECLARED HERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT WENT
 * ---------------------------------------------------------------------------------------
 *
 * Migration 0196 moved every stored draft into `plans` and `plan_lines`, at item 6 of a
 * decision. That decision carried out a report on one problem:
 * rough thinking was kept in two stores. The data step is
 * src/server/db/drafts-into-plans-migration.ts. It drops the
 * table once it is empty. A draft it refused, because its title or a line does not meet a plan's
 * limits, stays in the table as it was, and the table stays with it; nothing in the product reads
 * or writes it any more, so it is not declared here. That file says how such a row is reported and
 * what a person does next.
 *
 * The reasons the table was written with are kept below, because they are why `plans` has no
 * workspace and is not a record kind either.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A TABLE AND NOT A RECORD KIND
 * ---------------------------------------------------------------------------------------
 *
 * The aim is to let a person think messily first — to write
 *
 *     Trial report
 *     target: September
 *     Must
 *     - baseline
 *     - experiment design
 *     Maybe
 *     - leaf area
 *
 * and have it kept, without a schema form in the way and without any of it becoming project truth.
 *
 * A new RECORD KIND would have been the obvious place and is exactly wrong twice over. It is a
 * governance decision the owner has not been asked (a new kind changes what future data means), and
 * it would put rough thinking into the canonical graph — linkable, rankable, exportable as project
 * truth — which is the thing this surface must not do. Saving text here mutates nothing: the draft
 * becomes structure only through a proposal the human approves.
 *
 * NO `workspace_id`, like the rest of the planning layer and for the settled reason: a week's
 * thinking spans projects — "trial report" is greenhouse work and Mole Office work and a deadline — and
 * a draft forced into one project would be false about what it is. It names no record, so it grants
 * nothing.
 *
 * THE TEXT IS STORED EXACTLY AS TYPED. No re-wrapping, no normalising, no parsing on the way in.
 * What a person wrote is what comes back, and the browser owns ordinary wrapping.
 */

/**
 * A PLAN: A DOCUMENT SOMEBODY WRITES, HOLDING LINES THEY WROTE.
 *
 * This is `planning_drafts` grown up. A plan's text is one row per line in `plan_lines`, so a line
 * can carry the id of the record it was filed as. A draft's single `body` column could not: the link
 * would have had to be typed inside the text, where deleting one character breaks it silently.
 *
 * THE DRAFTS HAVE BEEN MOVED IN. Migration 0010 deliberately left them where they were, and the head
 * of drizzle/0010_plans.sql says why the move and the removal of the drafts routes belong in one
 * change. Migration 0196 is that change: each draft became one open plan, and
 * `moved_from_draft` below says which draft a plan was.
 *
 * ---------------------------------------------------------------------------------------
 * PLANNING IS WRITING. SCHEDULING IS GIVING HOURS. THEY ARE NOT THE SAME ACT
 * ---------------------------------------------------------------------------------------
 *
 * Nothing in a plan is project truth. Nothing in it is parsed for meaning. Nothing in it becomes a
 * record because Mole Office read it. A line crosses into the canonical graph only when a person presses
 * "File as work", which creates the record and binds the line to it in one transaction. A line gets
 * hours only when a person presses "Give it time", which writes one ordinary allocation.
 *
 * NO `workspace_id`, and this is not an omission. A plan spans projects — one week of thinking is
 * greenhouse work and Mole Office work and a deadline — and every record belongs to exactly one project,
 * so a plan cannot be a record and cannot be forced into one project either. That is the same
 * settled reason `allocations` gives above, and the reason `planning_drafts` gives below it.
 *
 * A PLAN CAN END. `state` is `open`, `done` or `dropped`, so a finished plan leaves the list instead
 * of sitting there going stale. Nothing computes it; a person sets it.
 *
 * AUTHORED. Somebody wrote these words and they exist nowhere else.
 */
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
    /**
     * THE ROUGH DRAFT THIS PLAN WAS, or NULL because it was written as a plan.
     *
     * Written once, by migration 0196, when it moved each `planning_drafts` row into a plan.
     * It is two facts in one column, and both are about where the plan came from:
     *
     *   - WHERE IT CAME FROM. The plan's lines were not typed on a plan; they are the draft's body,
     *     split on the newline, and their `updated_by` is the move's own stamp rather than a person's.
     *   - THE MAPPING FROM AN OLD DRAFT ID. The move keeps the draft's id as the plan's id when no plan
     *     already holds it. When one does, the plan gets a new id and this column is the only place
     *     that says so. A proposal filed about a draft names it in `Delta.fromDraft`, and
     *     `planOfDraft` in src/server/lib/planreview.ts reads this column to find the plan it became.
     *     A reader never assumes the draft id is the plan id: a colliding id names a different plan.
     *
     * Set on every moved plan, not only on the ones whose id changed, so one reader answers both cases
     * and "this plan was never a draft" is a NULL rather than an absence of a row somewhere else.
     */
    movedFromDraft: text('moved_from_draft'),
  },
  (t) => [
    // ONE PLAN PER DRAFT, and the database is what says so: a draft moved twice would be the same
    // words stored twice, which is the defect migration 0196 exists to end. Partial, so every plan
    // written as a plan costs nothing. The same words as the migration.
    uniqueIndex('plans_moved_from_draft_idx').on(t.movedFromDraft).where(sql`${t.movedFromDraft} IS NOT NULL`),
  ],
), existingArchive)
