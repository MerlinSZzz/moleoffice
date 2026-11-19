// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHICH WORK A RESTRICTION REACHED, AND WHETHER ANYBODY HAS RE-CHECKED IT.
 *
 * AUTHORED. `state`, `note` and `decided_by` are somebody's judgement and exist nowhere else.
 *
 * WHY A TABLE AND NOT A RECORD, in the three words `reader_anchors` uses. It would flood the change
 * log, because one resolution writes one row per affected record and the change log IS the daily
 * page. It would appear on the Records page as something researched, and a re-validation row is a
 * bookmark on somebody's judgement rather than a piece of research. And nothing will ever link to
 * one by name.
 *
 * `reached_by` AND `distance` ARE FROZEN WHEN THE ROW IS WRITTEN. The graph moves. A row written on
 * 3 September must say what was true on 3 September, or a re-check six weeks later is a check
 * against a question nobody asked. `written_by` says which moment that is: most rows are written by
 * the resolution, but a record can become a dependent afterwards — somebody draws a link next week —
 * and the judgement that first names it creates its row, whose path is the graph at the judgement.
 *
 * `state` IS THREE WORDS. `needs_review` is what the machine writes. `checked` and `not_affected`
 * are what a person or an agent records afterwards, and they are different answers: "I looked and
 * the work still stands" against "this one was never really affected". Both are authored. Neither is
 * ever inferred.
 *
 * THERE IS NO FOURTH STATE AND NO COLUMN POINTING AT AN OUTCOME. If a re-check finds the work does
 * not stand, the fault is a `problem` filed the ordinary way and linked to the affected record.
 */
export const revalidations = aPartTable(sqliteTable(
  'revalidations',
  {
    /** anOfficeId() in src/server/lib/ids.ts, the way changes.id is made. */
    id: text('id').primaryKey(),
    /** Read off the restriction record in the same statement. NULL where nothing could say. */
    workspaceId: text('workspace_id'),
    /** The placeholder or stand-in record whose resolution reached this work. */
    restrictionId: text('restriction_id').notNull(),
    /** The affected record. */
    recordId: text('record_id').notNull(),
    /** JSON `[{linkId, type, recordId}]`: the path AS IT WAS WHEN THIS ROW WAS WRITTEN. */
    reachedBy: text('reached_by').notNull(),
    /** 0 for the declared scope, n for n links away. */
    distance: integer('distance').notNull(),
    /** `resolution` or `judgement` — which act made this row, and so which moment `reached_by` is. */
    writtenBy: text('written_by').notNull(),
    /** LOCAL wall clock, written through now(). No SQL default, for the reason migration 0004 exists. */
    at: text('at').notNull(),
    /** `needs_review`, `checked` or `not_affected`. */
    state: text('state').notNull(),
    /** Actor id. NULL until somebody says. */
    decidedBy: text('decided_by'),
    /**
     * `person` or `agent`: whose id `decided_by` is, written with it. NULL while `decided_by` is NULL, and on a row
     * written before migration 0311 that its data half could not tell.
     */
    decidedByKind: text('decided_by_kind'),
    /**
     * The `api_calls` row of the request that wrote the judgement, so WHICH MACHINE is answerable by
     * a join and is not stored twice. NULL means the call row was not written, or this corpus was
     * restored from an archive. It is never read as `local`.
     */
    callId: text('call_id'),
    decidedAt: text('decided_at'),
    /** Why, in the person's own words. NULL means nobody said. */
    note: text('note'),
  },
  (t) => [
    uniqueIndex('revalidations_pair_idx').on(t.restrictionId, t.recordId),
    index('revalidations_record_idx').on(t.recordId, t.state),
    index('revalidations_workspace_idx').on(t.workspaceId, t.state),
  ],
), existingArchive)
