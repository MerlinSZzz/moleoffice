// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHEN THIS PERSON WILL SPEND REAL TIME ON WORK THAT ALREADY EXISTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TABLE HAS NO `workspace_id`, AND IT IS THE ONLY ONE
 * ---------------------------------------------------------------------------------------
 *
 * Every other authored table in this database carries a workspace, because every fact Mole Office stores
 * belongs to exactly one project. A planning period does not, and that is a settled owner decision
 * rather than an omission: **a plan is a person-level time-allocation overlay across
 * workspace-owned canonical work.** The two answer different questions — a workspace answers which
 * project owns the work, planning answers when this person will allocate real time to it — so one
 * week may hold Mole Office work, greenhouse work and a dentist appointment at once.
 *
 * That is NOT a cross-workspace link and must never be read as one:
 *
 *   - `record_id` names a record that stays in its own project. Nothing here moves it, copies it,
 *     or gives it a second home.
 *   - **An allocation carries no authority.** It is an id and a number of hours. Reading the record
 *     it names goes through `workspaceOf` like every other read, so an allocation can name a
 *     greenhouse task without being a way to read greenhouse.
 *   - There is no `links` row involved, so the boundary rules that refuse cross-project links are
 *     untouched and keep meaning exactly what they meant.
 *
 * `explore.md` — *Why a planning period is person-level and not workspace-owned* — has the whole of
 * it, including what happens when Mole Office is ever multi-user: who may SEE an allocation becomes a
 * real question, and project ownership is not part of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH HALF OF CRITERION P8 IS TRUE TODAY, AND WHICH HALF CANNOT BE BUILT YET
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P8 of `design/planning/ACCEPTANCE.md` is half true today and the rest cannot be built
 * yet. TRUE TODAY: no planning table carries a `workspace_id` — not `allocations`,
 * `planning_capacity`, `planning_intents`, `plans`, `plan_lines`, `planning_recurrences` or
 * `work_windows` — so plans and the schedule live outside every workspace, and
 * `tests/an-allocation-reads-back-from-a-second-workspace.test.ts` proves it by reading an
 * allocation back from a second workspace. A test deleted on 13 November 2026 failed if any of the seven gained a
 * column that names a workspace.
 *
 * NOT BUILT, AND NOT BUILDABLE YET. "The schedule per person" is true only because there is one
 * person: no planning table has a person or owner column, each carries a free-text `created_by` of
 * the form `<type>:<id>`, and the multi-user question above is open. Sync between worlds does not
 * exist, so a plan line can name a record in another workspace of this world and cannot name one in
 * another world — a record id is a bare local id, and P8 needs a world-qualified one, and a person
 * on these tables once there is more than one person. P8 keeps the line that is already true; it is
 * not the wave that adds any of those.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT IN THIS TABLE
 * ---------------------------------------------------------------------------------------
 *
 * No title, no summary, no state of the work, no kind, no workspace. **Planning is allocation, not
 * duplication**: every one of those is on the record `record_id` names, and a copy here would be a
 * second place that has to agree with it. What a reader sees is assembled per request.
 *
 * AUTHORED. Somebody committed these hours; nothing rebuilds them from anything.
 */
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
