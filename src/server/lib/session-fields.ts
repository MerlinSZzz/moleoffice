// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FEW FIELDS OF EVERY SESSION RECORD, KEPT BETWEEN THE MINUTE'S PASSES AND READ AGAIN ONLY WHERE A ROW CHANGED.
 *
 * The flow reminders ask every minute which runs of a project are still going, which went quiet and which stopped with a
 * cause, and the key-file check asks whose run key a file holds. Each question was a scan that parsed every session record of the office, because the state is inside the JSON
 * and only `running` has an index. On a copy at the live counts on 10 October 2026 those scans were about 130 ms of a
 * 300 ms pass, and a row costs about 1.9 times as much on live (wave 13y round 17).
 *
 * WHAT IS KEPT. The first reading after a start reads every session row. Every later reading looks only at the rows whose
 * `updated_at` is at or after a day before the last reading began, through `records_updated_idx`, and reads again the
 * fields of those that changed. The bound counts from the last reading and not from now, so a gap of more than a day
 * between two readings, a host asleep while the server stays up, still reads every row written in the gap. A deleted row leaves the map; a new or changed row replaces what was kept.
 *
 * WHY THAT MISSES NOTHING. Every write a running office makes to a record sets `updated_at` to `now()`, the local stamp:
 * the insert, the data patch, the summary write, the delete and the restore, the move to another project (all in
 * lib/records.ts). The one write that does not is the seal at create, which runs in the same moment as the insert. The
 * raw `UPDATE records` statements are in src/server/db, which runs before any timer starts. Nothing deletes a record row
 * outright. A DAY OF MARGIN, as `activityPerAgent` takes, because a local stamp's order steps back at a clock change. On
 * the live office on 10 October 2026 every record's stamps were in the stored form, which is what the range relies on.
 *
 * ONE FIELD IS ALSO KEPT FOR DELETED ROWS: whether a later resource look is due (`resourcesLookDueAt`, lib/resources.ts).
 * The ended-run look has always looked at a marked run whether or not its record was deleted, so its superset must
 * hold deleted rows too. They are kept apart, in `deletedWithALookDue`, so no other question sees a deleted row.
 *
 * WHAT IT ANSWERS IS A SUPERSET, NEVER THE ANSWER. A caller takes the ids from here and asks the database its own whole
 * question about those rows only. So the database still decides, and a row kept here that no longer holds is dropped by
 * the caller's own condition.
 */

import { sqlite } from '../db/client.ts'
import { ENDED_RUN_LOOK_FIELD } from '@shared/ended-run-resources.ts'
import { localStamp, parseAnyStamp } from '@shared/time.ts'
import { STOP_CAUSE_KIND_IN_SQL } from '../../config/stopped-run-cause.mjs'

/** What is kept of one live session row: the fields the minute's questions select by. */
export interface TheFieldsOfASession {
  workspaceId: string
  /** `json_extract(data, '$.state')`, as SQLite answers it. */
  state: unknown
  closedBecauseIsSet: boolean
  hasALogPath: boolean
  /** The stop cause's kind (`STOP_CAUSE_KIND_IN_SQL`: the field, or an older run's copy in `extra`), as SQLite answers it. */
  stopCause: unknown
  /** `json_extract(data, '$.extra.runKeyId')`, as SQLite answers it. */
  runKeyId: unknown
  /** `json_type(data, '$.resourcesLookDueAt') IS NOT NULL`: a later resource look is due (lib/resources.ts). */
  lookIsDue: boolean
}

/** A local stamp's order can step back at a clock change, so each reading starts a day before the last one began. */
const A_STAMP_CAN_STEP_BACK_BY = 24 * 3_600_000

/** The id and `updated_at` of one row a later reading looks at. */
export interface AChangedRow {
  id: string
  updatedAt: string
}

/**
 * WHICH ROWS A LATER READING READS AGAIN. `changedSince` gives the id and updated_at of the rows changed since a stamp,
 * and is asked from a day before the last reading began, NOT a day before now, so a row written in a gap of more than a
 * day is still read. A row is read again when its updated_at is not the one kept, or when it is stamped in or after the
 * second the last reading began, because a write in that same second leaves the stamp as it was. Every row changed in
 * the range is returned as well. The broadcasts' kept reading asks this too (lib/broadcast.ts).
 */
export function theRowsToReadAgain(
  readAt: ReadonlyMap<string, string>,
  lastReading: string,
  changedSince: (from: string) => readonly AChangedRow[],
): { changed: readonly AChangedRow[]; again: AChangedRow[] } {
  const lastBegan = parseAnyStamp(lastReading)
  if (lastBegan === null) throw new Error(`session-fields: the last reading's stamp ${lastReading} cannot be read back`)
  const changed = changedSince(localStamp(new Date(lastBegan.getTime() - A_STAMP_CAN_STEP_BACK_BY)))
  return { changed, again: changed.filter((row) => readAt.get(row.id) !== row.updatedAt || row.updatedAt >= lastReading) }
}

const THE_FIELDS =
  "id, updated_at AS updatedAt, workspace_id AS workspaceId, deleted_at IS NOT NULL AS deleted, json_extract(data, '$.state') AS state, " +
  "json_extract(data, '$.closedBecause') IS NOT NULL AS closedBecauseIsSet, " +
  "json_extract(data, '$.extra.discovered.logPath') IS NOT NULL AS hasALogPath, " +
  `${STOP_CAUSE_KIND_IN_SQL} AS stopCause, json_extract(data, '$.extra.runKeyId') AS runKeyId, ` +
  `json_type(data, '$.${ENDED_RUN_LOOK_FIELD}') IS NOT NULL AS lookIsDue`

interface ARow {
  id: string
  updatedAt: string
  workspaceId: string
  deleted: number
  state: unknown
  closedBecauseIsSet: number
  hasALogPath: number
  stopCause: unknown
  runKeyId: unknown
  lookIsDue: number
}

interface Kept {
  fields: Map<string, TheFieldsOfASession>
  /** The deleted session rows whose later resource look is still due. */
  deletedWithALookDue: Set<string>
  /** The updated_at each kept row had when its fields were read. */
  readAt: Map<string, string>
  /** The local stamp taken just before the last reading began. */
  lastReading: string
  stamps: { all: (from: string) => unknown[] }
  byIds: { all: (...ids: string[]) => unknown[] }
}

/** ONE MAP PER DATABASE HANDLE, as the registry's statements are kept, so a test's fresh database starts empty. */
const KEPT = new WeakMap<object, Kept>()

/** At most this many ids in one statement. */
const IDS_PER_READING = 500

function keep(kept: Pick<Kept, 'fields' | 'readAt' | 'deletedWithALookDue'>, rows: unknown[]): void {
  for (const row of rows as ARow[]) {
    if (row.deleted === 1 && row.lookIsDue === 1) kept.deletedWithALookDue.add(row.id)
    else kept.deletedWithALookDue.delete(row.id)
    if (row.deleted === 1) {
      kept.fields.delete(row.id)
      kept.readAt.delete(row.id)
      continue
    }
    kept.fields.set(row.id, {
      workspaceId: row.workspaceId,
      state: row.state,
      closedBecauseIsSet: row.closedBecauseIsSet === 1,
      hasALogPath: row.hasALogPath === 1,
      stopCause: row.stopCause,
      runKeyId: row.runKeyId,
      lookIsDue: row.lookIsDue === 1,
    })
    kept.readAt.set(row.id, row.updatedAt)
  }
}

/**
 * The kept fields of every live session row, brought up to date first.
 *
 * A LATER READING TAKES TWO STEPS. It reads only the id and updated_at of the session rows changed since a day before
 * the last reading, which parses no JSON. Then it reads the fields again of the rows whose updated_at is not the one
 * kept, and of the rows stamped in or after the second the last reading began, because a write in that same second
 * leaves the stamp as it was. Every call reads again, so a write earlier in the same pass is seen by the next question.
 */
export function theFieldsOfEverySession(): ReadonlyMap<string, TheFieldsOfASession> {
  const now = Date.now()
  const thisReading = localStamp(new Date(now))
  const kept = KEPT.get(sqlite)
  if (kept === undefined) {
    const made: Kept = {
      fields: new Map(),
      deletedWithALookDue: new Set(),
      readAt: new Map(),
      lastReading: thisReading,
      // `+kind` KEEPS SQLITE OFF THE KIND INDEX, so it takes the changed rows by `records_updated_idx` and not every session.
      stamps: sqlite.prepare("SELECT id, updated_at AS updatedAt FROM records WHERE +kind = 'session' AND updated_at >= ?"),
      byIds: sqlite.prepare(
        `SELECT ${THE_FIELDS} FROM records WHERE id IN (${Array.from({ length: IDS_PER_READING }, () => '?').join(', ')})`,
      ),
    }
    keep(made, sqlite.prepare(`SELECT ${THE_FIELDS} FROM records WHERE kind = 'session'`).all())
    KEPT.set(sqlite, made)
    return made.fields
  }
  const again = theRowsToReadAgain(kept.readAt, kept.lastReading, (from) => kept.stamps.all(from) as AChangedRow[]).again.map((row) => row.id)
  kept.lastReading = thisReading
  for (let at = 0; at < again.length; at += IDS_PER_READING) {
    const chunk = again.slice(at, at + IDS_PER_READING)
    // A SHORT CHUNK IS PADDED WITH AN ID NO ROW HAS, so one prepared statement serves every chunk.
    keep(kept, kept.byIds.all(...chunk, ...Array.from({ length: IDS_PER_READING - chunk.length }, () => '')))
  }
  return kept.fields
}

/** The ids of every live session row whose kept fields pass `holds`, in every project, for the caller to ask about whole. */
export function theSessionIdsAnywhereWhere(holds: (one: TheFieldsOfASession) => boolean): string[] {
  const ids: string[] = []
  for (const [id, one] of theFieldsOfEverySession()) if (holds(one)) ids.push(id)
  return ids
}

/** The ids of one project's live session rows whose kept fields pass `holds`, for the caller to ask about whole. */
export function theSessionIdsWhere(workspaceId: string, holds: (one: TheFieldsOfASession) => boolean): string[] {
  const ids: string[] = []
  for (const [id, one] of theFieldsOfEverySession()) if (one.workspaceId === workspaceId && holds(one)) ids.push(id)
  return ids
}

/**
 * The ids of every session row, live or deleted, in every project, whose kept fields say a later resource look is due,
 * for the ended-run look to ask about whole (lib/resources.ts).
 */
export function theSessionIdsWithALookDue(): string[] {
  const ids = theSessionIdsAnywhereWhere((one) => one.lookIsDue)
  const kept = KEPT.get(sqlite)
  if (kept !== undefined) ids.push(...kept.deletedWithALookDue)
  return ids
}
