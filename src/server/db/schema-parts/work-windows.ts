// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHEN SOMEBODY INTENDS TO WORK ON A PIECE OF WORK: A FIRST DAY AND A LAST DAY.
 *
 * ---------------------------------------------------------------------------------------
 * A WINDOW NEVER CONTRIBUTES HOURS TO ANY TOTAL
 * ---------------------------------------------------------------------------------------
 *
 * A window answers WHEN, not HOW MUCH. "Test tray clamp runs from this Thursday to next Wednesday"
 * says the person means to work on it in those days. It does NOT say the work fills those days, it
 * does not say how many hours it takes, and nothing may add it into a week's load, into capacity,
 * or into anything a person reads as time committed. Hours stay the allocation's job, and every
 * total in `shared/planning.ts` reads `allocations` and reads nothing here.
 *
 * That is the point of the table rather than a limitation of it. The aim is to place a piece
 * of work across a span without first working out how many hours belong on each day, so a window is
 * the coarse answer and an allocation is the fine one. One may exist without the other, in either
 * direction, and neither is derived from the other.
 *
 * ---------------------------------------------------------------------------------------
 * FOUR DIFFERENT FACTS, AND THIS IS ONE OF THEM
 * ---------------------------------------------------------------------------------------
 *
 *     estimate      `records.data.effort_hours`  how much work is this in total?
 *     window        this table                   when do I intend to work on it?
 *     allocation    `allocations`                how many hours does this period give it?
 *     deadline      an obligation's due date     when must it be finished?
 *
 * A task may hold an 8-hour estimate, a window from Tuesday to next Wednesday and a deadline of
 * next Wednesday, with no allocation at all. Nothing here forces the fourth.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS TWO COLUMNS WHEN `allocations.period` IS DELIBERATELY ONE
 * ---------------------------------------------------------------------------------------
 *
 * `allocations` stores one string on purpose, and the reason above it is a good one: two columns
 * can describe a week eight days long and one period key cannot. A WINDOW IS THE OPPOSITE CASE. It
 * IS a start and an end, it may run from a Thursday to the following Wednesday, and no period key
 * can name that. So the two tables answer two different questions and neither shape fits both.
 *
 * Both ends are `YYYY-MM-DD` and BOTH ARE INCLUDED. A window from `2026-08-20` to `2026-08-26` is
 * seven days long. The keys are built and read through `periodKey` and `parsePeriod` in
 * shared/planning.ts, so there is not a second date reader in this product.
 *
 * NO `workspace_id`, like `allocations` and `planning_capacity` and for the settled reason written
 * out with `allocations`: a person's week holds work from every project. `record_id` names a record that
 * stays in its own project and this grants no authority to read it.
 *
 * AUTHORED. A person placed this block on a week and nothing can recreate it.
 */
export const workWindows = aPartTable(sqliteTable(
  'work_windows',
  {
    /** nanoid, assigned by lib/windows.ts. */
    id: text('id').primaryKey(),
    /** The canonical work this window is about. A record id, in whatever project that record is in. */
    recordId: text('record_id').notNull(),
    /** First day of the window, `YYYY-MM-DD`, INCLUDED. Read by `parsePeriod`, never by a second reader. */
    startsOn: text('starts_on').notNull(),
    /** Last day of the window, `YYYY-MM-DD`, INCLUDED. Never before `starts_on`; the write refuses that. */
    endsOn: text('ends_on').notNull(),
    /**
     * What somebody needs to know when they come back to this block, or NULL because nobody wrote one.
     *
     * "Grip starts slipping above 15N; recalibrate before the next test." NULL means nobody wrote a
     * note, which is the ordinary case and is not the same as an empty one.
     */
    note: text('note'),
    /**
     * WINDOW_STATES in shared/planning.ts: planned | done | dropped.
     *
     * `done` completes THIS WINDOW and says nothing about the work, exactly as an allocation's
     * `done` completes that slice of time and nothing else. `dropped` is the span that did not
     * happen, which is a different fact from one that was never planned.
     */
    state: text('state').notNull().default('planned'),
    /** LOCAL wall clock, both. No SQL default, for the reason `reader_anchors` gives. */
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    /** Who wrote it: `${actor.type}:${actor.id}`. */
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    // The two reads there are: every window on one piece of work, and the windows near a date. The
    // second is a range scan over `starts_on`; `ends_on` is then compared row by row, because a
    // window that STARTED before the range may still overlap it and no index can answer that alone.
    index('work_windows_record_idx').on(table.recordId),
    index('work_windows_starts_idx').on(table.startsOn),
  ],
), existingArchive)
