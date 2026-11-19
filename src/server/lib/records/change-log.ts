// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHANGE LOG'S READ SIDE: WHICH ROWS A FILTER SELECTS, HOW MANY IT SELECTS, A PAGE OF THEM, AND ONE RECORD'S ROWS
 * WITHIN A BUDGET. It was moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts. One word changed in the first move: `changesWhere` is exported, because `whoFiled` calls it.
 * `whoFiled` itself moved in here whole from records.ts, and `whoFiledFromWhichRun` lives in records/filed-from.ts.
 *
 * THIS FILE DOES NOT IMPORT records.ts: it takes `countChanges` from ../../db/count-changes.ts. records.ts imports
 * `changesWhere` and `whoFiled` from here, and every reference this file makes to records.ts is gone, so nothing of
 * this file is read while records.ts is still being evaluated.
 */
import { and, asc, desc, eq, exists, inArray, like, or, sql, type SQL } from 'drizzle-orm'
import { readOrigin, type RecordOrigin } from '@shared/types.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { db } from '../../db/client.ts'
import { changes, records } from '../../db/schema.ts'
import { theMessagesHiddenFrom, type AMessageReader } from '../messages.ts'
import { countChanges } from '../../db/count-changes.ts'
import { ACROSS_WORKSPACES } from '@shared/across-workspaces.ts'
import { aChangeNamingNoneOf } from '../../db/a-change-naming-none-of.ts'
import { THE_HONOUR_KEY } from '../../db/a-change-naming-none-of.ts'

/** Which rows of the change log are being asked about. Shared by the list and by its count. */
export interface ChangeFilter {
  /**
   * Which project's log. REQUIRED, and it is the only field here with no sensible absence.
   *
   * "What happened while I was away" is a question about one project, and until this column existed
   * it could not be asked per project even in principle — measured: GET /api/changes reported 1,047
   * matched rows over two projects in one stream. A row whose `workspace_id` is NULL is excluded by
   * every value except `ACROSS_WORKSPACES`, and that exclusion is not silent: NULL means no record
   * answers to the row's `record_id`, the corpus migration counts them, and `GET /api/changes`
   * reports the number alongside the ones it matched.
   */
  workspaceId: string
  recordId?: string
  since?: string
  until?: string
  /**
   * Every value that means the session being asked about — build it with sessionFilterValues.
   *
   * A list rather than one id because the log can hold both spellings at once: rows written
   * since the session was filed carry its record id, rows written before it existed still carry
   * the run name until they are migrated. Matching only the id would answer "what did this
   * session do" with a short, confident, wrong list.
   */
  session?: readonly string[]
  /**
   * MESSAGES THE READER MAY NOT READ (`everyMessageHiddenFrom`). No row naming one
   * is listed or counted: not a row about the message, and not a row that names it as a value.
   */
  hidden?: readonly string[]
  /**
   * The stored change field to match exactly, such as `data.state`. Sent with `value`, never alone.
   */
  field?: string
  /**
   * The stored new value to match exactly, such as `finished`. Sent with `field`, never alone.
   */
  value?: string
}

export { aChangeNamingNoneOf } from '../../db/a-change-naming-none-of.ts'

export { THE_HONOUR_KEY } from '../../db/a-change-naming-none-of.ts'

/**
 * The rows a filter selects, as one condition.
 *
 * Written once and used by both `listChanges` and `countChangesMatching`, because a count built
 * from a second copy of these four lines is the defect this repository keeps producing: change
 * one, and the other goes on answering, wrongly, with nothing failing.
 */
/** Whether this id names a record kept in the message centre: a message. */
function isInTheMessageCentre(id: string): boolean {
  const row = db.select({ workspaceId: records.workspaceId }).from(records).where(eq(records.id, id)).get()
  return row?.workspaceId === MESSAGE_CENTRE
}

export function changesWhere(opts: ChangeFilter): SQL | undefined {
  const where = []
  const noneHidden = aChangeNamingNoneOf(opts.hidden)
  if (noneHidden !== undefined) where.push(noneHidden)
  // ONE MESSAGE'S ROWS ARE READ WHEREVER THEY ARE FILED: a message belongs to no project, its rows
  // since the move are filed in the message centre, and its older rows under the project it was filed in then.
  const aMessagesOwnRows = opts.recordId !== undefined && opts.recordId !== '' && isInTheMessageCentre(opts.recordId)
  // ONE RECORD'S ROWS ARE FOUND BY ITS OWN INDEX. The database holds no planner statistics, and without them SQLite read
  // `workspace_id = ? AND record_id = ?` through `changes_workspace_at_idx`: every row of the project, newest first,
  // until enough of this record's were found. The unary `+` keeps the project condition and takes that index away.
  const oneRecord = opts.recordId !== undefined && opts.recordId !== ''
  // ONE SESSION'S ROWS ARE FOUND BY THE SESSION'S INDEX, for the same reason. Through `changes_workspace_at_idx` SQLite
  // read the project's rows newest first and kept the session's, and for a session with fewer rows than the limit that
  // is every row of the project.
  const oneSession = opts.session !== undefined
  if (opts.workspaceId !== ACROSS_WORKSPACES && !aMessagesOwnRows) {
    where.push(oneRecord || oneSession ? sql`+${changes.workspaceId} = ${opts.workspaceId}` : eq(changes.workspaceId, opts.workspaceId))
  }
  if (opts.recordId) where.push(eq(changes.recordId, opts.recordId))
  if (opts.session) where.push(inArray(changes.sessionId, [...opts.session]))
  if (opts.since) where.push(sql`${changes.at} >= ${opts.since}`)
  if (opts.until) where.push(sql`${changes.at} <= ${opts.until}`)
  if (opts.field !== undefined) where.push(eq(changes.field, opts.field))
  if (opts.value !== undefined) where.push(eq(changes.newValue, opts.value))
  return where.length ? and(...where) : undefined
}

/**
 * How many rows a filter selects, with no cap on it.
 *
 * The companion to `listChanges`, which returns AT MOST `limit` rows. A caller that reports a
 * number — how much was written today, how many rows still store a run name — has to count with
 * this and not with the length of that list, or it publishes the size of a window as a total.
 */
export function countChangesMatching(opts: ChangeFilter): number {
  return countChanges(changesWhere(opts))
}

/**
 * The change log. Dated views are filters over this, which is why there are no daily pages.
 *
 * BOUNDED, AND THE BOUND IS THE CALLER'S TO DECLARE. This returns the newest `limit` matching
 * rows and 200 when no limit is asked for; it cannot say so itself, because a list has nowhere to
 * put the fact. Every caller that publishes a count or a completeness claim over these rows must
 * take it from `countChangesMatching` with the same filter — that is what `readingSinceAnchor`,
 * `attentionNow`, `placementEvidence` and `sessionWork` all do, each in its own words.
 */
export { changeOrigins } from '../../db/change-origins.ts'

export function listChanges(opts: ChangeFilter & { limit?: number }) {
  return db
    .select()
    .from(changes)
    .where(changesWhere(opts))
    // NEWEST FIRST WITHIN A SECOND, by the order the rows were written. The second was the whole order, and rows of one
    // second came in whatever order the index walked: one record's rows read through its own index put the
    // older of two writes first, and a record page's fold named the run that did not write last.
    .orderBy(desc(changes.at), desc(changes.appendOrder))
    .limit(opts.limit ?? 200)
    .all()
}

/** One change row as `whoWroteWhereNewestFirst` gives it: the session column, the record id and the time. */
export type WhoWroteWhere = [sessionId: string | null, recordId: string, at: string]

/**
 * WHICH RUN WROTE TO WHICH RECORD, AND WHEN: three columns of a project's change rows, newest first.
 *
 * NOT `listChanges`, because the session placement reads a hundred thousand rows and uses no value. On the live
 * project the newest 100,001 rows held 269 MB of old and new values, and each placement turned all of it into
 * strings: about 2 s, with the server answering nobody.
 *
 * EACH ROW IS AN ARRAY, AS SQLITE GIVES IT, in the order the columns are selected here. Drizzle's `.all()` made an
 * object of each row: on the made-up office of the 22 October scale, grown to 542,827 changes in the busiest project,
 * this read took 88 to 92 ms with objects and 62 to 64 ms with arrays, and the placement of one run 114 to 133 ms and
 * 85 to 103 ms, with the same placement by hash (wave 13y round 120). Rows of one `at` come written last first, by
 * `rowid`. That is the order changes_workspace_at_idx holds them in, so SQLite sorts nothing, and the statement says
 * it rather than leaving it to the plan.
 */
export function whoWroteWhereNewestFirst(workspaceId: string, limit: number): WhoWroteWhere[] {
  return db
    .select({ sessionId: changes.sessionId, recordId: changes.recordId, at: changes.at })
    .from(changes)
    .where(changesWhere({ workspaceId }))
    .orderBy(desc(changes.at), sql`rowid desc`)
    .limit(limit)
    .values() as WhoWroteWhere[]
}

/**
 * HOW MANY BYTES OF CHANGE ROWS ONE RECORD'S READ CARRIES, counting the old and the new value of each.
 *
 * A run's record logged its whole tool-use list on every turn, about 95 KB a side. Its read carried the newest 200 rows
 * whole: 28.5 MB, asked 449 times in one afternoon by a waiter that wanted the project id. An intermediate implementation
 * logged only the line a use added (TOOL_USE_APPENDED_FIELD); a use is now a row in
 * `tool_uses` and logs no change row at all. The rows written before that are kept as they were, so a run older than
 * that still has them and this budget still bounds them. A record page
 * draws its history from `GET /api/changes`, not from this, so the budget changes nothing a page shows.
 */
export const ONE_RECORDS_CHANGES_BUDGET = 262_144

/** What the record read says about the change rows it carried. */
export interface ChangesCarried {
  /** How many rows `changes` holds. */
  carried: number
  /** How many rows this reader may see on this record, carried or not. */
  total: number
  /** The bytes of old and new values the rows carried may hold together. */
  budgetBytes: number
  /** The request for the rows left out, or null when none was. */
  next: string | null
}

/**
 * ONE RECORD'S CHANGE ROWS AS THIS READER MAY SEE THEM, newest first, whole, for as long as
 * they fit `budget`: no row naming a message it may not read, by the rule `aChangeNamingNoneOf` states.
 *
 * THE MESSAGES ARE ASKED ABOUT FIRST, AND ONLY THE ONES THIS RECORD'S ROWS NAME. A row names a message when a value it
 * logged is that message's id, or when a honour reading's value quotes it, so SQL finds the first kind by the id and
 * only the honour rows are read here for the second. The same hidden list then decides the rows and the count.
 *
 * THE SIZES ARE ASKED BEFORE THE ROWS. The newest 200 rows are measured in SQL, the newest run of them that fits is
 * read whole, and nothing is cut or replaced: a row that does not fit is left out with every row older than it, and
 * `next` names the request that reads on from it.
 */
export function changesOfOneRecordWithinABudget(
  recordId: string,
  workspaceId: string,
  reader: AMessageReader,
  budget = ONE_RECORDS_CHANGES_BUDGET,
): { rows: (typeof changes.$inferSelect)[]; carried: ChangesCarried } {
  const own = changesWhere({ workspaceId, recordId })
  let hidden: string[] = []
  if (!reader.readsEveryMessage) {
    // A VALUE THAT IS A MESSAGE'S ID, asked of the records table by its key for each row.
    const message = (value: typeof changes.oldValue | typeof changes.newValue) =>
      exists(db.select({ id: records.id }).from(records).where(and(eq(records.id, value), eq(records.kind, 'message'))))
    const named = db
      .select({ oldValue: changes.oldValue, newValue: changes.newValue, field: changes.field })
      .from(changes)
      .where(and(own, or(message(changes.oldValue), message(changes.newValue), like(changes.field, `data.${THE_HONOUR_KEY}%`))))
      .all()
      .flatMap((row) => {
        const values = [row.oldValue, row.newValue].filter((one): one is string => one !== null)
        const quoted = (row.field ?? '').startsWith(`data.${THE_HONOUR_KEY}`)
          ? values.flatMap((one) => [...one.matchAll(/"([^"\\]+)"/g)].map((match) => match[1]!))
          : []
        return [...values, ...quoted]
      })
    hidden = [...theMessagesHiddenFrom(reader, named)]
  }
  const filter: ChangeFilter = hidden.length === 0 ? { workspaceId, recordId } : { workspaceId, recordId, hidden }
  const sizes = db
    .select({
      id: changes.id,
      at: changes.at,
      bytes: sql<number>`coalesce(octet_length(${changes.oldValue}), 0) + coalesce(octet_length(${changes.newValue}), 0)`,
    })
    .from(changes)
    .where(changesWhere(filter))
    // NEWEST FIRST WITHIN A SECOND AS WELL, by the order the rows were written: three writes in one second carried the
    // first of them as the newest, and the budget keeps only the head of this list.
    .orderBy(desc(changes.at), desc(changes.appendOrder))
    .limit(200)
    .all()
  let spent = 0
  let fit = 0
  while (fit < sizes.length && spent + sizes[fit]!.bytes <= budget) spent += sizes[fit++]!.bytes
  const byId = new Map(
    fit === 0
      ? []
      : db.select().from(changes).where(inArray(changes.id, sizes.slice(0, fit).map((one) => one.id))).all().map((row) => [row.id, row]),
  )
  const rows = sizes.slice(0, fit).map((one) => byId.get(one.id)!)
  // THE COUNT LEAVES OUT EVERY ROW THIS READER MAY NOT SEE, so it does not say how many rows name a message it may not read.
  const total = fit === sizes.length && sizes.length < 200 ? rows.length : countChangesMatching(filter)
  const left = sizes[fit]
  return {
    rows,
    carried: {
      carried: rows.length,
      total,
      budgetBytes: budget,
      // ROWS IN THE SAME SECOND AS THE FIRST ONE LEFT OUT MAY COME BACK A SECOND TIME, because `until` is a second.
      next:
        rows.length < total
          ? `GET /api/changes?recordId=${encodeURIComponent(recordId)}&until=${encodeURIComponent((left ?? sizes[sizes.length - 1])!.at)}`
          : null,
    },
  }
}

/**
 * WHO FILED THIS RECORD, from the create row of its own change log.
 *
 * Null when no create row names anybody — every record written before the log existed is one, and
 * so is anything imported. Null is NOT "a person": inventing an author for a row nobody signed is
 * the guess this product refuses, and the surface says nobody recorded it.
 *
 * KEPT HERE, beside the change log it reads, because the guard on ending a run asks it
 * (`assertMayEndARun` in `records/patching.ts`) and records.ts cannot import lib/openloops.ts, which imports it back;
 * lib/openloops.ts hands it on to its own readers unchanged.
 */
export function whoFiled(workspaceId: string, recordId: string): { actorType: string; actorId: string } | null {
  // THE OLDEST CREATE ROW, ASKED FOR BY ITSELF. This read the newest 1,000 rows whole and kept the create rows among
  // them, so a record with more rows than that was answered "nobody recorded", and a run's record carried every
  // tool-use list it had logged into memory to find one row.
  const made = db
    .select({ actorType: changes.actorType, actorId: changes.actorId })
    .from(changes)
    .where(and(changesWhere({ workspaceId, recordId }), eq(changes.op, 'create')))
    .orderBy(asc(changes.at), asc(changes.appendOrder))
    .limit(1)
    .get()
  return made === undefined ? null : { actorType: made.actorType, actorId: made.actorId }
}
