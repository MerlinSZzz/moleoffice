// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHAT A PERSON WROTE ABOUT TIME, KEPT EXACTLY AS THEY WROTE IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE EIGHTH RULE, AS A TABLE
 * ---------------------------------------------------------------------------------------
 *
 * The owner set it on 16 August 2026: *humans express intent; agents and parsers translate it;
 * Mole Office validates and commits it.* A person may write `around 5h`, `Tuesday afternoon` or
 * `sometime next week`, and Mole Office must keep what they wrote instead of refusing it for not being
 * canonical. So `said` holds their words, byte for byte, and the columns beside it hold what was
 * made of those words WHEN SOMETHING COULD BE MADE HONESTLY.
 *
 * `state` says which of the three layers this row has reached:
 *
 *     kept        the words are stored and nothing was interpreted. "sometime next week".
 *     offered     an interpretation was made and waits for a person to accept it.
 *     committed   it became an allocation, which is the canonical row.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING BUT `committed` EVER ENTERS ARITHMETIC
 * ---------------------------------------------------------------------------------------
 *
 * A `kept` intent never adds to a week, never makes capacity look used and never counts as work
 * planned. It is a thing somebody wrote down. The arithmetic in shared/planning.ts reads
 * `allocations` and reads nothing here, and `tests/planning-intent.test.ts` fails if that ever
 * changes. A surface that added an interpretation into a total would be claiming the interpretation
 * had happened.
 *
 * `committed` DOES NOT MEAN THE HOURS ARE HERE. They are in `allocations`, and this row keeps the
 * words that produced them. The allocation is found by `record_id` with `horizon` and `period`,
 * which is one allocation by the rule in lib/planning.ts; storing its id here as well would be the
 * same fact in two places.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `plan_line_id` IS NULLABLE AND WHY IT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * A person writes time on a plan line before that line is filed as work. So an intent may belong to
 * a line and to no record at all. `record_id` is nullable for the same reason, and an intent with
 * neither is a note about time with nothing to attach it to, which is allowed: the words are the
 * point.
 *
 * IN `AUTHORED_TABLES`, SO A BACKUP CARRIES THESE ROWS. It was left out when the table was built,
 * which meant a backup, a project archive and a restore held no intent at all and the restore still
 * reported success. Closing that took `REGION_COLUMNS` and a page in src/server/lib/export.ts, the
 * snapshot and its comparison in scripts/restore-check.ts, and the hand-written inventories in
 * tests/schema-tables.test.ts, tests/migration.test.ts and tests/stamp-columns.test.ts. Every one of
 * those is a guard that failed until the table was registered, which is what they are for.
 *
 * Person-level, like the rest of the planning layer: no `workspace_id`, because a week's intentions
 * span projects.
 */
export const planningIntents = aPartTable(sqliteTable(
  'planning_intents',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** What the person wrote, EXACTLY as they wrote it. Never trimmed, parsed away or repaired. */
    said: text('said').notNull(),
    /** The canonical work this is about, or NULL because it is not about a record yet. */
    recordId: text('record_id'),
    /** The plan line this was written on, or NULL because it was not written on one. */
    planLineId: text('plan_line_id'),
    /** 'month' | 'week' | 'day', or NULL when no period was read from the words. */
    horizon: text('horizon'),
    /** The period key that was read, or NULL when none was. Never a guess. */
    period: text('period'),
    /** The hours that were read, or NULL when none were. Null is not zero. */
    hours: real('hours'),
    /** kept | offered | committed. Only `committed` is in any total. */
    state: text('state').notNull().default('kept'),
    /** LOCAL wall clock. Who wrote it: `${actor.type}:${actor.id}`. */
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    // The two reads there are: the intents on one plan line, and the intents about one record.
    index('planning_intents_line_idx').on(table.planLineId),
    index('planning_intents_record_idx').on(table.recordId),
  ],
), existingArchive)
