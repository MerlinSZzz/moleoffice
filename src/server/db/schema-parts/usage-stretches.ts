// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * WHAT ONE STRETCH OF WORK COST, KEPT AFTER THE ROWS UNDER IT ARE DELETED.
 *
 * MEASURED. The prune deletes old rows; without this table a before-and-after comparison would
 * return "before = 0" six months after a fix and read as though the change had created the problem.
 * That is a fabricated conclusion produced by a window that moved silently.
 *
 * THE ONE RULE THAT STOPS THIS BEING A SECOND COPY OF A FACT. A summary is written BY THE PRUNE, in
 * the same transaction that deletes the rows it summarises, and by nothing else. So a trace is in
 * exactly one of two states: its rows exist and no summary does, or a summary exists and no rows do.
 * The fact moves; it is never in two places at once.
 *
 * THREE COUNTS OF WHERE THE CALLS CAME FROM, NOT ONE WORD. A stretch of 39 local calls and 2 remote
 * reads and a stretch of 20 and 21 would both be "mixed", so every stretch that moved machines would
 * drop out of the comparison and how many did would be unrecoverable. And a word frozen at prune
 * time carries whatever rule was in force that day, while counts summed from a stored per-row fact
 * let a later change reprice the reading instead of leaving old summaries wrong.
 */
export const usageStretches = aPartTable(sqliteTable('usage_stretches', {
  /** nanoid. */
  id: text('id').primaryKey(),
  /** Which stretch of which trace. Distinct-trace counts survive the prune because this column does. */
  traceId: text('trace_id').notNull(),
  stretchSeq: integer('stretch_seq').notNull(),
  /** Why the work was being done, when the caller said. NULL means it did not. */
  purpose: text('purpose'),
  startedMs: integer('started_ms').notNull(),
  endedMs: integer('ended_ms').notNull(),
  /** What ended the stretch. */
  endedBecause: text('ended_because').notNull(),
  actorType: text('actor_type'),
  actorId: text('actor_id'),
  sessionId: text('session_id'),
  workspaceId: text('workspace_id'),
  /** How many rows of this stretch arrived on each listener. `unknown_calls` is rows written before Mole Office could tell. */
  localCalls: integer('local_calls').notNull(),
  remoteCalls: integer('remote_calls').notNull(),
  unknownCalls: integer('unknown_calls').notNull(),
  /** Counts, from the effect and the status on the rows. */
  calls: integer('calls').notNull(),
  reads: integer('reads').notNull(),
  writes: integer('writes').notNull(),
  refused: integer('refused').notNull(),
  failed: integer('failed').notNull(),
  /** What it cost. */
  bytes: integer('bytes').notNull(),
  msTotal: real('ms_total').notNull(),
  distinctOperations: integer('distinct_operations').notNull(),
  /** Counts, from the outside-read table. */
  outsideReads: integer('outside_reads').notNull(),
  gapVerdicts: integer('gap_verdicts').notNull(),
  /** `wrote`, `did-not-write` or `cannot-tell`. */
  thenWrote: text('then_wrote').notNull(),
  /**
   * JSON, operation to `{calls, refused, bytes_total, bytes_median, ms_median}`.
   *
   * THE STATISTICS THE PATTERNS ARE DEFINED ON, not a convenient approximation of them. A refusal
   * count per operation cannot be split back out of a stretch total, and a median of bytes cannot be
   * recovered from a sum — so keeping only the totals would change which statistic a six-month
   * series was made of, silently, at the window's edge.
   */
  perOperation: text('per_operation').notNull(),
  /** JSON, question to `{gap, boundary, unsure}`. Counting by question is what keeps one named case readable. */
  perQuestion: text('per_question').notNull(),
}), { existingMeasured: true })
