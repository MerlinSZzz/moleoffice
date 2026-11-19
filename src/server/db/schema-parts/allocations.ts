// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

export const allocations = aPartTable(sqliteTable(
  'allocations',
  {
    /** nanoid, assigned by lib/planning.ts. */
    id: text('id').primaryKey(),
    /** 'month' | 'week' | 'day' — GRAINS in shared/planning.ts. */
    horizon: text('horizon').notNull(),
    /**
     * The period key: `2026-09`, `2026-W36`, `2026-09-07`. Weeks are ISO-8601.
     *
     * One string rather than a start and an end, because two columns can describe a week eight days
     * long and this cannot. `parsePeriod` computes the range, and refuses a key it cannot place.
     */
    period: text('period').notNull(),
    /** The canonical work this gives time to. A record id, in whatever project that record is in. */
    recordId: text('record_id').notNull(),
    /**
     * Hours committed to this work in this period, or NULL.
     *
     * NULL IS NOT ZERO AND NOT THE WHOLE OF THE WORK. It means somebody planned to work on this
     * here without saying for how long, which is a real and common answer. Filling it in from the
     * record's `effort_hours` would put a twenty-hour estimate into a Monday nobody promised twenty
     * hours to; every total in `shared/planning.ts` reports how many rows it could not count.
     */
    plannedHours: real('planned_hours'),
    /**
     * Hours actually spent, once somebody says. NULL until then, and never inferred from `planned`.
     *
     * It is here rather than on the record because "planned 3, spent 5" is a fact about a Monday,
     * not a correction to how big the task is.
     */
    actualHours: real('actual_hours'),
    /** ALLOCATION_STATES: planned | done | dropped. `done` completes the SLICE, never the work. */
    state: text('state').notNull().default('planned'),
    /** Why this slice, when there is something to say. */
    note: text('note'),
    /**
     * The plan line that put this time here, or NULL because nobody planned it in a document.
     *
     * ONE COLUMN AND NOT TWO: the plan is reachable from the line, so storing the plan id beside it
     * would be the same fact in two places. NULL is the ordinary case — hours added straight onto a
     * week come from nowhere else and say so.
     *
     * It records where this allocation came from and grants nothing. Deleting the line does not
     * delete the hours; the hours were still given.
     */
    fromPlanLine: text('from_plan_line'),
    /** LOCAL wall clock, both. No SQL default, for the reason `reader_anchors` gives. */
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    /** Who wrote it: `${actor.type}:${actor.id}`. */
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    // The two reads there are: everything in a period, and everywhere one record was planned.
    index('allocations_period_idx').on(table.horizon, table.period),
    index('allocations_record_idx').on(table.recordId),
  ],
), existingArchive)
