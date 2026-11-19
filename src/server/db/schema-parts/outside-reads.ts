// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * ONE ROW PER TIME AN AGENT GOT PROJECT STATE FROM SOMEWHERE OTHER THAN MOLE OFFICE.
 *
 * MEASURED, and every row is a CLAIM. Mole Office did not see it happen; an agent said it did. It is not
 * evidence that Mole Office lacked something — it is evidence that an agent BELIEVED Mole Office lacked
 * something, which is a different and still useful fact, and every surface drawing from this table
 * says so in those words.
 *
 * IT STORES NO ADDRESS. The machine is read through `call_id`, because the same request was already
 * writing an `api_calls` row carrying that value, and two writers of one fact with nothing making
 * them agree is this repository's recurring defect. The five columns that ARE copied are resolved
 * once per request onto one object that both rows read, and `call_id` is the key that makes the
 * copies checkable.
 */
export const outsideReads = aPartTable(sqliteTable(
  'outside_reads',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** Epoch milliseconds, as `api_calls` holds it. */
    atMs: integer('at_ms').notNull(),
    /** So it lands in the trace beside the calls. */
    traceId: text('trace_id'),
    workspaceId: text('workspace_id'),
    workspaceStated: integer('workspace_stated'),
    actorType: text('actor_type'),
    actorId: text('actor_id'),
    sessionId: text('session_id'),
    /** `shell` or `file`. Running a command and reading a file in the checkout are two different things. */
    source: text('source').notNull(),
    /** The path or the command shape. Short, and never the output. Not what any threshold counts. */
    what: text('what').notNull(),
    /** The question the agent had, from the closed list. THIS is what thresholds count. */
    wanted: text('wanted').notNull(),
    /** Required when `wanted` is `other`, forbidden otherwise. Counted separately, and the evidence for extending the list. */
    wantedOther: text('wanted_other'),
    /** `boundary`, `gap` or `unsure`, as the agent judged it. THREE, NOT A BOOLEAN: `unsure` beats a coin toss. */
    verdict: text('verdict').notNull(),
    /**
     * The `api_calls` row of the request that filed this report. Where the machine is read from.
     * NULL only when the call row was not written, which is counted and published.
     */
    callId: text('call_id'),
  },
  (t) => [
    index('outside_reads_trace_idx').on(t.traceId, t.atMs),
    index('outside_reads_wanted_idx').on(t.wanted, t.atMs),
  ],
), { existingMeasured: true })
