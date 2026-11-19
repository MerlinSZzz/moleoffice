// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT NEEDS A PERSON: THE SERVER HALF OF THE ATTENTION RULE, AND THE CHANGE ROWS IT IS GIVEN.
 * It was moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER: this one takes `allLinks` from it. That is safe for the same reason as
 * records/anchors.ts: every reference this file makes to records.ts is inside a function body, so nothing of records.ts
 * is read while it is still being evaluated. `toSharedChange` is imported from @shared/to-shared-change.ts, and
 * records/change-log.ts and records/reading.ts do not import this file.
 */
import { and, desc, eq, gte, isNotNull, or, sql, type SQL } from 'drizzle-orm'
import { computeAttention, type AttentionResult, type MachineResourceRef } from '@shared/attention.ts'
// The end-of-day rule for a bare due date. BORROWED, NOT COPIED: see `attentionNow` below for why
// this file reaches into src/web for one function rather than writing the rule a second time.
import { parseDueStamp } from '@shared/due-stamps.ts'
import { localStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { db } from '../../db/client.ts'
import { changes } from '../../db/schema.ts'
import { everyMessageHiddenFrom, type AMessageReader } from '../messages.ts'
import { allLinks } from '../records.ts'
import { toSharedChange } from '@shared/to-shared-change.ts'
import { aChangeNamingNoneOf } from '../../db/a-change-naming-none-of.ts'
import { listRecordsForTheAttentionRule } from './reading.ts'

// ============================================================ what needs a person, computed here
//
// The rule is in shared/attention.ts and is not restated. This is the part that cannot live there:
// reading the whole workspace out of the database and handing it in. Serving the ANSWER rather
// than the ingredients is the point — the browser drew its own version of this rule from four
// separate fetches, and a second implementation of "what needs me today" is the one piece of
// duplication in this product that would be actively dangerous.

/**
 * The most change rows the attention rule is given.
 *
 * The rule reads them only to date when a record entered the state it is in, so a truncated log
 * costs accuracy on that one number and nothing else — and the row it produces says where its date
 * came from. The cap exists because "read the whole table" is not a promise this can keep on a
 * database that has been written to for a year. Whether it was reached comes back in `read`.
 */
export const ATTENTION_CHANGE_ROWS = 100_000

export interface AttentionReading extends AttentionResult {
  /** The moment the rule was run against, as a stored stamp. */
  at: string
  /** What was read to answer, so a short list can be told from a small database. */
  read: {
    records: number
    links: number
    changes: number
    /** True when the log is longer than ATTENTION_CHANGE_ROWS and the oldest rows were not read. */
    changesCapped: boolean
  }
}

/**
 * Run the shared attention rule over everything in this workspace.
 *
 * WHY `dueMs` IS `parseDueStamp` FROM src/web. A bare "2026-08-03" is due at the END of the 3rd —
 * anything else makes everything due today overdue at one minute past midnight — and that rule
 * exists exactly once in this repository, in src/web/lib/attention.ts, which is a pure module with
 * no browser in it. Writing a second copy here so that the server did not have to reach across is
 * precisely the defect this codebase keeps producing, and the two copies would disagree about what
 * "overdue" means on the same record on the same day. The rule belongs in shared/time.ts beside the
 * other stamp readers; that file is not this phase's to change, so it is borrowed and reported.
 *
 * WHY `resources` IS A PARAMETER. The machine sweep lives in lib/resources.ts, which imports THIS
 * file for `logChange`; importing it back would make a cycle. The caller does the sweep and hands
 * the result in — and a caller that did not sweep passes an empty list and says so in words, which
 * is the difference between "nothing is running unclaimed" and "nobody looked".
 */
export function attentionNow(input: {
  /**
   * Which project needs attention. Required, and there is no all-workspaces reading of it.
   *
   * ATTENTION IS RELATIVE, which is why. The rule ranks what is here against the rest of what is
   * here, so a run over two projects has the busier one deciding the order — and the one screen the
   * product exists for would then be a merge of two days nobody had. Measured before this
   * parameter: GET /api/attention read 397 records, 386 links and 1,047 change rows and named
   * records from both projects in one list.
   */
  workspaceId: string
  resources: readonly MachineResourceRef[]
  /** The clock, in milliseconds. Passed in by tests so the rule has none of its own. */
  now?: number
  /**
   * WHO IS READING. A message this reader may not read is left out of the
   * records, the links and the change rows the rule is worked out from, so it is in no row and no count.
   * Left out by a caller inside the office that answers no request, which reads every message.
   */
  reader?: AMessageReader
}): AttentionReading {
  return attentionWithTheseHidden(input, theMessagesHiddenFromTheAttentionReader(input))
}

/** The messages `attentionNow` leaves out for this input's reader: none when no reader is named. */
export function theMessagesHiddenFromTheAttentionReader(input: Pick<Parameters<typeof attentionNow>[0], 'workspaceId' | 'reader'>): string[] {
  return input.reader === undefined ? [] : everyMessageHiddenFrom(input.reader, input.workspaceId)
}

/**
 * THE READING `attentionNow` GIVES, FOR THE MESSAGES ALREADY WORKED OUT AS HIDDEN FROM ITS READER. The
 * reader is read for nothing else, so two inputs that differ only in a reader who is hidden the same
 * messages have the same reading. The attention thread works out one reading for the asks it holds
 * that are alike in this way (attention-thread-worker.ts).
 *
 * `readTheRecords` gives the records `listRecordsForTheAttentionRule` gives, and is that function unless a caller
 * names another. The attention thread names the records it keeps between asks (attention-kept-records.ts).
 */
export function attentionWithTheseHidden(
  input: Parameters<typeof attentionNow>[0],
  hidden: readonly string[],
  readTheRecords: (workspaceId: string) => readonly PanelRecord[] = listRecordsForTheAttentionRule,
): AttentionReading {
  const nowMs = input.now ?? Date.now()

  const hiddenSet = new Set(hidden)
  // WITH ONLY THE FIELDS THE RULE READS in each record's `data`: see `listRecordsForTheAttentionRule`.
  // WITH NOTHING HIDDEN, the lists as read: a filter that keeps every one was a second list of them.
  const readRecords = readTheRecords(input.workspaceId)
  const allRecords = hiddenSet.size === 0 ? readRecords : readRecords.filter((one) => !hiddenSet.has(one.id))
  const readLinks = allLinks(input.workspaceId)
  const linkRows = hiddenSet.size === 0 ? readLinks : readLinks.filter((one) => !hiddenSet.has(one.fromId) && !hiddenSet.has(one.toId))
  const window = theAttentionChangeWindow(input.workspaceId, aChangeNamingNoneOf(hidden))
  // NO ORIGIN, ON PURPOSE, and the arrow makes it explicit rather than leaning on a default: these
  // rows date a state word and none of them is ever shown, so a provenance lookup here would be a
  // join over the whole log for a field nothing on this path reads.
  const changeList = window.stateRows.map((row) => toSharedChange(row, null))

  const result = computeAttention({
    now: nowMs,
    records: allRecords,
    links: linkRows,
    changes: changeList,
    resources: input.resources,
    dueMs: parseDueStamp,
  })

  return {
    at: localStamp(new Date(nowMs)),
    ...result,
    read: {
      records: allRecords.length,
      links: linkRows.length,
      changes: window.rows,
      changesCapped: window.capped,
    },
  }
}

/**
 * THE CHANGE ROWS THE ATTENTION RULE IS GIVEN: the newest `ATTENTION_CHANGE_ROWS` of this project's
 * log that the reader may see, and of those only the rows that set `data.state` to a value.
 *
 * The rule reads change rows only in `readStateSince` (src/shared/attention.ts), which skips every row
 * whose field is not `data.state` or whose new value is null. Before filtering in SQLite, this read the
 * whole window, every column of every row, and the rule then skipped nearly all of them. On the made-up
 * office the size of the owner's (tests/an-office-with-answers-of-the-live-size.ts) that was 35,867 rows
 * and about half of the reading's time. Now SQLite keeps only the state rows.
 *
 * THE WINDOW IS THE SAME. It is still the newest `ATTENTION_CHANGE_ROWS` rows of every field, so a
 * state row older than that is still not read, and `read.changes` and `read.changesCapped` still
 * count the whole window. `rows` is how many rows the window holds; `capped` says the log was longer.
 */
export function theAttentionChangeWindow(
  workspaceId: string,
  noneHidden: SQL | undefined,
): { stateRows: (typeof changes.$inferSelect)[]; rows: number; capped: boolean } {
  const visible = noneHidden === undefined ? eq(changes.workspaceId, workspaceId) : and(eq(changes.workspaceId, workspaceId), noneHidden)
  // HOW MANY ROWS FIRST, because a log shorter than the window has no edge to find. Looking for it
  // sorted every row of the log by time and id to find none: about 20 ms of 35,867 rows on the made-up
  // office, where the count takes under 1 ms.
  const all = db.select({ n: sql<number>`count(*)` }).from(changes).where(visible).get()?.n ?? 0
  // The oldest row inside the window, and whether one more lies past it, read in the window's order.
  const edge =
    all < ATTENTION_CHANGE_ROWS
      ? []
      : db
          .select({ at: changes.at, id: changes.id })
          .from(changes)
          .where(visible)
          .orderBy(desc(changes.at), desc(changes.id))
          .limit(2)
          .offset(ATTENTION_CHANGE_ROWS - 1)
          .all()
  const capped = edge.length > 1
  const oldest = edge[0]
  const rows = oldest !== undefined ? ATTENTION_CHANGE_ROWS : all
  const inTheWindow =
    oldest === undefined ? undefined : and(gte(changes.at, oldest.at), or(sql`${changes.at} > ${oldest.at}`, gte(changes.id, oldest.id)))
  const stateRows = db
    .select()
    .from(changes)
    .where(and(visible, eq(changes.field, 'data.state'), isNotNull(changes.newValue), inTheWindow))
    .orderBy(desc(changes.at), desc(changes.id))
    .all()
  return { stateRows, rows, capped }
}
