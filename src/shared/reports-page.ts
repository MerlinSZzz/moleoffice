// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE REPORTS PAGE HOLDS AND HOW IT GROUPS IT. The server door and the page both read this file.
 *
 * The Reports page (`#/notes`) lists the reports and the notes of every project. This follows
 * question 9 of report n9Mjk3c_sJRu: Reports lists only reports and
 * notes. Before that, the page listed every kind in the `notes` family of src/shared/work.ts, so
 * agents, flows, counters, incidents, merge entries and submitted tips were on it too (problem
 * nYadrL5AnC-A).
 *
 * THE FAMILY IS NOT CHANGED. The `notes` family also decides the family colour and glyph, the group
 * buttons on the Everything page, and which heading holds a kind. Taking agents or counters out of
 * it would leave those kinds with no family, and Everything would then warn that no heading holds
 * them. So the family stays as it is and the page reads only the two kinds named here.
 *
 * ONE PLACE. `GET /api/records/reports-and-notes` filters and groups with these names and this
 * function, and the page draws the groups the door sent. Nothing else decides which kinds the page
 * holds or which group a row is in.
 */

import { reportReading } from './attention.ts'
import { parseLocalStamp } from './time.ts'
import type { PanelRecord } from './types.ts'

/** The only kinds the Reports page lists. */
export const REPORTS_PAGE_KINDS = ['report', 'note'] as const
export type ReportsPageKind = (typeof REPORTS_PAGE_KINDS)[number]

/** What the page's chooser can show: both kinds, only reports, or only notes. */
export const REPORTS_PAGE_SHOWS = ['both', 'reports', 'notes'] as const
export type ReportsPageShow = (typeof REPORTS_PAGE_SHOWS)[number]

/** The kinds each choice keeps. */
export const KINDS_A_CHOICE_SHOWS: Readonly<Record<ReportsPageShow, readonly ReportsPageKind[]>> = {
  both: REPORTS_PAGE_KINDS,
  reports: ['report'],
  notes: ['note'],
}

/** The groups, in the order the page draws them. */
export const REPORTS_PAGE_GROUPS = ['needs-you', 'this-week', 'earlier'] as const
export type ReportsPageGroup = (typeof REPORTS_PAGE_GROUPS)[number]

/** How many rows one page of the list holds. The Everything and Messages pages hold 50 as well. */
export const REPORTS_PAGE_SIZE = 50

const DAY_MS = 86_400_000

/**
 * WHICH GROUP ONE ROW IS IN.
 *
 * NEEDS YOU: a report nobody has marked read. It reads `reportReading`, the same reader Home and a
 * module's page use, so a report cannot wait on the person here and not there. Both "marked unread"
 * and "nobody has marked it" are in this group; the row says which of the two it is.
 *
 * A NOTE IS NEVER IN IT. A note has no read mark (src/shared/kinds.ts declares none), so nobody can
 * mark one read. If unmarked notes waited on the person, every note ever written would wait for ever.
 *
 * THIS WEEK: filed less than seven days before `now`. EARLIER: everything else, and a row whose filed
 * time cannot be read. The filed time is `createdAt`, not `updatedAt`: marking a report read or
 * writing its short forms changes `updatedAt`, and that is not when the writing was written.
 */
export function reportsPageGroup(
  record: Pick<PanelRecord, 'id' | 'kind' | 'title' | 'data' | 'createdAt' | 'origin'>,
  now: number,
): ReportsPageGroup {
  if (record.kind === 'report' && reportReading(record as PanelRecord, []).waiting) return 'needs-you'
  const filed = parseLocalStamp(record.createdAt)
  if (filed !== null && now - filed < 7 * DAY_MS) return 'this-week'
  return 'earlier'
}
