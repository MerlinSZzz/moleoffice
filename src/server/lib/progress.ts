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
 * A POINT WITH NO STATE IS A GAP AND NOT `todo`, because counting it as `todo` would put work into the queue that
 * nobody placed there. One statement counts the points, and the rule for each count is written on it below.
 *
 * THE BRIEF IS THE INSIDE DELEGATION ONLY. A package for outside work has no parent and is not a brief; other projects
 * are not read at all. The reply's `says` sentence says which of those were counted and which were not.
 */

import { BACKLOG_ITEM_KIND, BACKLOG_ITEM_STATES, type BacklogItemState } from '@shared/backlog.ts'
import { type SQL, notInArray, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import type {
  ProjectProgress,
  ProjectProgressBriefCounts,
  ProjectProgressPointCounts,
} from '@shared/progress.ts'
import { delegationProgressColumn, type DelegationProgressReading } from './delegation.ts'
import { theRecordsListed } from './records.ts'

/**
 * THE POINTS IN THEIR BUCKETS, COUNTED BY ONE STATEMENT, so the server is handed the counts and not the points
 * (decision OQR0WDVq0FkP). The points are the project's live points, narrowed by line when one is named, chosen by
 * `theRecordsListed` as `listRecords` chooses them.
 *
 * - A point's state is its stored `data.state`. Each of the four buckets counts a point whose state is that word.
 * - `noState` counts every other point: one with no state, a word none of the four, or a value that is not a string,
 *   such as 1 or true. A bound word never equals a number in SQLite, so no such value lands in a bucket.
 * - `inNoBrief` counts a point whose `briefId` is missing or is not a non-empty string. `json_type` tells a string
 *   from an object or a list, which `json_extract` hands back as text.
 * - `carriedThreeBriefs` counts a point whose `briefsCarried` is a number of 3 or more while it is neither done nor
 *   dropped. A point with no state has not moved, so it can be carried: `IS NOT` keeps it, where `<>` would not.
 * - A `data` that is not an object holds none of these fields.
 *
 * The kind and every state word are values, never words in the statement. A key written twice in one stored object is
 * read at its first value here; the office writes `data` by JSON.stringify, which never writes a key twice.
 */
function thePointCounts(workspaceId: string, line: string | null): ProjectProgressPointCounts {
  const theState = sql`json_extract(${records.data}, '$.state')`
  const counted = (where: SQL): SQL<number> => sql<number>`count(*) FILTER (WHERE ${where})`
  const isNot = (word: BacklogItemState): SQL => sql`${theState} IS NOT ${word}`
  const byWord = Object.fromEntries(
    BACKLOG_ITEM_STATES.map((word) => [word, counted(sql`${theState} = ${word}`)]),
  ) as Record<BacklogItemState, SQL<number>>
  const row = db
    .select({
      total: sql<number>`count(*)`,
      ...byWord,
      noState: counted(sql`${theState} IS NULL OR ${notInArray(theState, [...BACKLOG_ITEM_STATES])}`),
      inNoBrief: counted(
        sql`json_type(${records.data}, '$.briefId') IS NOT 'text' OR json_extract(${records.data}, '$.briefId') = ''`,
      ),
      carriedThreeBriefs: counted(
        sql`json_type(${records.data}, '$.briefsCarried') IN ('integer', 'real')
          AND json_extract(${records.data}, '$.briefsCarried') >= 3 AND ${isNot('done')} AND ${isNot('dropped')}`,
      ),
    })
    .from(records)
    .where(theRecordsListed({
      workspaceId,
      kind: BACKLOG_ITEM_KIND,
      ...(line === null ? {} : { alsoWhere: sql`json_extract(${records.data}, '$.line') = ${line}` }),
    }))
    .get()
  if (row === undefined) {
    throw new Error('SQLite answered no row for the point counts, where a count with no GROUP BY answers one.')
  }
  return row
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
  const briefs = delegationProgressColumn(workspaceId)
  const progress: ProjectProgress = {
    line,
    points: thePointCounts(workspaceId, line),
    briefs: theBriefCounts(briefs.rows),
    couldNotRead: briefs.couldNotRead,
    says: '',
  }
  progress.says = theSays(progress)
  return progress
}
