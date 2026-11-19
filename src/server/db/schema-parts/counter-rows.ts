// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * EVERY ADDITION, FIRING AND HELD-BACK FIRING OF A COUNTER, ONE ROW EACH.
 *
 * Criteria CT2, CT5, CT6 and CT7 of design/counters/ACCEPTANCE.md, added by migration 0172. The
 * migration's own comment carries the arithmetic that put these rows in a table rather than in the
 * counter's `data`.
 *
 * THE COUNT AND THE AMOUNT ARE NOT COLUMNS OF THE COUNTER. They are added up from the rows after the
 * last firing, every time they are read. A stored copy beside them could disagree with the rows and
 * nothing would fail, which is invariant 9.
 */
export const counterRows = aPartTable(sqliteTable(
  'counter_rows',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** The project the counter is in. A counter belongs to one project and so do its rows. */
    workspaceId: text('workspace_id').notNull(),
    /** The counter record this row is about. */
    counterId: text('counter_id').notNull(),
    /** 1-based, per counter, so the rows read oldest first even when several share a moment. */
    seq: integer('seq').notNull(),
    /** `addition`, `firing` or `held back`. The word list is COUNTER_ROW_KINDS in shared/counters.ts. */
    what: text('what').notNull(),
    /** LOCAL wall clock. */
    at: text('at').notNull(),
    /**
     * The same moment as `at`, as an instant with its offset, written in the same write. Migration 0299.
     *
     * `at` CANNOT SAY WHICH 01:30 IT MEANS on the night the clocks go back, and a due time counted
     * from the wrong one comes an hour early. NULL is a row written before migration 0299, which the
     * counter reads as the later of the moments its `at` can name.
     */
    atInstant: text('at_instant'),
    /**
     * Who added, as `${kind}:${id}`, or null.
     *
     * NULL FOR TWO DIFFERENT REASONS, and the row says which: an addition that came from an office
     * event names the event in the three columns below, and a firing or a held-back row is the
     * office's own bookkeeping, which nobody asked for.
     */
    by: text('by'),
    /** Which office event added: `landing`, `run-finished` or `group-message`. Null on a hand addition. */
    eventKind: text('event_kind'),
    /** The event's own id — the merge entry, the change row, the message. Null on a hand addition. */
    eventId: text('event_id'),
    /** When the event happened, which is not when the tick read it. Null on a hand addition. */
    eventAt: text('event_at'),
    /** An addition: what it added. A firing: what was reset. A held-back row: what it stood at then. */
    count: integer('count').notNull(),
    /** The same for the amount, or null because this counter carries none. */
    amount: real('amount'),
    /** The caller's own reason, which trigger held, or why the firing was held back. Never generated. */
    because: text('because').notNull(),
    /** Which trigger held, by its position in the counter's own list. Null on anything but a firing. */
    whichTrigger: integer('which_trigger'),
    /** What the action answered, as stored JSON. Null on anything but a firing. */
    answer: text('answer'),
  },
  (table) => [
    // THE ONE THAT MAKES IT A LEDGER, and the one every read walks.
    uniqueIndex('counter_rows_counter_seq_idx').on(table.counterId, table.seq),
    // AND THE ONE THAT COUNTS AN OFFICE EVENT ONCE. The three events are read by polling, so the
    // same landing is seen by every tick until it falls out of the window; this index is what makes
    // a second row for one event impossible rather than unlikely. It is partial in the migration —
    // only the rows that name an event — and drizzle has no word for that, so the index here is
    // declared over the same three columns and the migration is the authority on the WHERE clause.
    uniqueIndex('counter_rows_one_row_per_event_idx').on(table.counterId, table.eventKind, table.eventId),
  ],
), existingArchive)
