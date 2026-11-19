// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT'S PROGRESS, COUNTED FROM THE RECORDS ON EVERY READ. Wave 13s round 235, from the design report of round 234.
 *
 * NOTHING HERE IS STORED, and there is no table, column, record kind or stored progress field behind it. The points
 * are the project's live `backlog_item` records, narrowed by line when one is named. The briefs are the inside packages, read through
 * `delegationProgressColumn`, whose state is itself worked out from the package's append-only lists. Every call reads
 * again.
 *
 * A POINT WITH NO STATE IS A GAP AND NOT `todo`, and so is a point whose stored state names a word none of the four
 * does. It is counted in `noState` and in no state bucket, because counting it as `todo` would put work into the queue
 * that nobody placed there. A point whose `briefId` is missing or is not a non-empty string is in `inNoBrief`.
 * `carriedThreeBriefs` counts a point carried through three or more briefs while neither done nor dropped: a point
 * with no state has not moved, so it can be carried.
 *
 * THE BRIEF IS THE INSIDE DELEGATION ONLY. A package for outside work has no parent and is not a brief; other projects
 * are not read at all. The reply's `says` sentence says which of those were counted and which were not.
 */

import { BACKLOG_ITEM_KIND } from '@shared/backlog.ts'
import { sql } from 'drizzle-orm'
import { records } from '../db/schema.ts'
import type {
  ProjectProgress,
  ProjectProgressBriefCounts,
  ProjectProgressPointCounts,
} from '@shared/progress.ts'
import type { PanelRecord } from '@shared/types.ts'
import { delegationProgressColumn, type DelegationProgressReading } from './delegation.ts'
import { listRecordsWithDataAs, onlyTheseFieldsOf } from './records.ts'

/** A record's stored `data` as a plain bag, or an empty one when it is not an object. */
function theDataOf(record: PanelRecord): Record<string, unknown> {
  const data = record.data
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
}

/** "A non-empty string", as the point's `briefId` must be to count as naming a brief. */
function aNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * THE POINTS IN THEIR BUCKETS. A point's state is its stored `data.state`; exactly one of the four words counts in
 * that bucket, and everything else counts in `noState` and nowhere else. The two other counts read their fields from
 * the same stored bag, so a point is read once.
 */
function thePointCounts(points: readonly PanelRecord[]): ProjectProgressPointCounts {
  const counts: ProjectProgressPointCounts = {
    total: 0,
    todo: 0,
    doing: 0,
    done: 0,
    dropped: 0,
    noState: 0,
    inNoBrief: 0,
    carriedThreeBriefs: 0,
  }
  for (const point of points) {
    counts.total += 1
    const data = theDataOf(point)
    const state = data['state']
    switch (state) {
      case 'todo':
        counts.todo += 1
        break
      case 'doing':
        counts.doing += 1
        break
      case 'done':
        counts.done += 1
        break
      case 'dropped':
        counts.dropped += 1
        break
      default:
        counts.noState += 1
    }
    if (!aNonEmptyString(data['briefId'])) counts.inNoBrief += 1
    const carried = data['briefsCarried']
    if (typeof carried === 'number' && carried >= 3 && state !== 'done' && state !== 'dropped') {
      counts.carriedThreeBriefs += 1
    }
  }
  return counts
}

/**
 * THE INSIDE BRIEFS IN THEIR BUCKETS, read from the inside half of `delegationProgressColumn`. Each of the six package
 * states has its own bucket, and `to_do` is counted as waiting. `checkedRefused` reads the latest check of the package,
 * which the column already answers as `inside.check`: a check moves no state, so it is counted beside the state.
 */
function theBriefCounts(rows: DelegationProgressReading['rows']): ProjectProgressBriefCounts {
  const counts: ProjectProgressBriefCounts = {
    total: 0,
    waiting: 0,
    taken: 0,
    aligned: 0,
    handedBack: 0,
    returned: 0,
    done: 0,
    checkedRefused: 0,
  }
  for (const row of rows) {
    counts.total += 1
    switch (row.state) {
      case 'to_do':
        counts.waiting += 1
        break
      case 'taken':
        counts.taken += 1
        break
      case 'aligned':
        counts.aligned += 1
        break
      case 'handed_back':
        counts.handedBack += 1
        break
      case 'returned':
        counts.returned += 1
        break
      case 'done':
        counts.done += 1
        break
    }
    if (row.inside?.check === 'refused') counts.checkedRefused += 1
  }
  return counts
}

/** The one plain-English sentence saying what was counted and what was not. */
function theSays(counts: {
  line: string | null
  points: ProjectProgressPointCounts
  briefs: ProjectProgressBriefCounts
}): string {
  const points = counts.points.total
  const briefs = counts.briefs.total
  const where = counts.line === null ? 'in this project' : `on line "${counts.line}"`
  const gaps = counts.points.noState
  const gapSentence =
    gaps === 0
      ? ''
      : ` ${String(gaps)} point${gaps === 1 ? ' has' : 's have'} no state and ` +
        `${gaps === 1 ? 'is' : 'are'} counted as a gap, not as to do.`
  return (
    `Counted ${String(points)} live point${points === 1 ? '' : 's'} ${where} and ` +
    `${String(briefs)} inside brief${briefs === 1 ? '' : 's'} in this project, read fresh from the records; outside ` +
    `packages and other projects are not counted.${gapSentence}`
  )
}

/**
 * THE WHOLE READING: every live point in the project, or only one line's points, and every inside brief in the
 * project. Nothing is stored, and a line narrows the points alone; the briefs are the project's, as the route's note
 * says. `couldNotRead` is the delegation column's own list, unchanged.
 */
export function theProjectProgress(workspaceId: string, line: string | null): ProjectProgress {
  const points = listRecordsWithDataAs({
    workspaceId,
    kind: BACKLOG_ITEM_KIND,
    ...(line === null ? {} : { alsoWhere: sql`json_extract(${records.data}, '$.line') = ${line}` }),
  }, onlyTheseFieldsOf(['state', 'briefId', 'briefsCarried']))
  const briefs = delegationProgressColumn(workspaceId)
  const progress: ProjectProgress = {
    line,
    points: thePointCounts(points),
    briefs: theBriefCounts(briefs.rows),
    couldNotRead: briefs.couldNotRead,
    says: '',
  }
  progress.says = theSays(progress)
  return progress
}
