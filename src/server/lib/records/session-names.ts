// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S NAMES AND THE SESSIONS A ROW NAMES: binding a name to a run, the stored session references and their
 * record ids, the session filter, and the press written outside the change log. They were moved out of
 * src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import { changes, records } from '../../db/schema.ts'
import { anOfficeId } from '../ids.ts'
import { logChange, theSessionARowNames, writeThePressRow } from '../log-change.ts'
import { noRecordHasThisId } from '../no-record-has-this-id.ts'
import { PanelError } from '../panel-error.ts'
import { boundToName, resolvedSessions, resolveSessionRef, SESSION_NAME_FIELD, sessionCacheKey } from '../resolve-session-ref.ts'
import type { Actor } from './actor.ts'
import { getRecord } from './reading.ts'

/** The reply field an open fork's record read answers its earlier decisions in. */
export const REPLACES_CANDIDATES_FIELD = 'replacesCandidates'

/**
 * How a session reference was matched.
 *
 * `unresolved` means nothing anywhere answers to it. `elsewhere` means something does and it is in
 * ANOTHER PROJECT — see `sessionFiledElsewhere`, and see lib/move.ts for the rule that produces the
 * situation. The two are told apart because they are opposite findings: one is a name nobody ever
 * filed, the other is a session that exists and is out of this project's reach.
 *
 * `ambiguous` is a third finding and is neither of those: SEVERAL session records in this project
 * are titled exactly that, so the reference names too many rather than none. It has its own word
 * because "nothing answers to this" would be false, and because the two are fixed differently — an
 * unresolved name is fixed by filing the session, and an ambiguous one by sending the id.
 */
export type SessionMatch = 'recordId' | 'name' | 'title' | 'unresolved' | 'elsewhere' | 'ambiguous'

/** What a session reference turned out to mean. */
export interface SessionRef {
  /** Exactly what the caller sent. */
  asked: string
  /** The session record it means, or null when nothing in THIS project answers to it. */
  recordId: string | null
  /** That record's title, which a person may have changed since. */
  title: string | null
  matchedBy: SessionMatch
  /** Every run name bound to that record, oldest binding first. */
  names: string[]
  /** True when the session record has been soft-deleted. It still owns its history. */
  deleted: boolean
  /** Why it did not resolve, in one sentence a caller can act on. Null when it did. */
  why: string | null
  /**
   * The project a session record with this exact id is filed in, when that is not this one.
   *
   * Null in every other case, INCLUDING when the reference resolved: this field is not "which
   * project the session is in", it is "which project this reference points out of". `recordId` and
   * `title` stay null beside it on purpose — naming the session would mean reading a row this
   * project may not read, and the honest answer is to say where it is rather than to show it.
   */
  elsewhereIn: string | null
}

/** What binding a run name to a session record did. Every number is a row that really moved. */
export interface SessionBinding {
  name: string
  recordId: string
  /** Whether binding wrote its own change row; absent on a refusal made before binding. */
  bindingWritten?: boolean
  /** Change rows that carried the raw name and now carry the record id. */
  repointed: number
  /**
   * The session that already had the name, when one did. Nothing was bound and no row moved.
   *
   * "Had it" is either of the two ways a reference reaches a session without an id: the name is
   * BOUND to that record, or that record is TITLED exactly that. They are told apart in `note`,
   * because only the first survives a rename, but both mean the same thing here -- the name is
   * spoken for, and taking it would move somebody else's history.
   */
  alreadyBoundTo: string | null
  note: string
}

/**
 * The first sentence of every refusal to take a name: who has it, and that nothing happened.
 *
 * One copy, because there are two places that refuse -- a session filing itself under a name that
 * is spoken for, and a binding asked for by hand -- and two sentences that drifted apart would let
 * a caller learn the rule from one of them and be wrong about the other.
 */
export function nameIsSpokenFor(name: string, holder: Pick<SessionRef, 'recordId' | 'title' | 'matchedBy'>): string {
  const who = `the session "${holder.title ?? holder.recordId}" (${holder.recordId})`
  const how =
    holder.matchedBy === 'title'
      ? `The name "${name}" is the exact title of ${who}, so it already means that session`
      : `The name "${name}" already belongs to ${who}`
  return `${how}, so nothing was bound and no change row was moved.`
}

/**
 * Bind a run name to a session record, and repoint every row still carrying that name.
 *
 * This is the moment the log stops speaking two languages. It writes ONE change row -- the
 * binding, which is what makes the name outlive a rename -- and then a single UPDATE over the
 * rows that were written before the session had a record to point at. Those rows are not
 * rewritten silently: the binding row above them says, dated and attributed, which name they
 * used to carry.
 *
 * A name that already belongs to another session record is NOT taken. Two runs may reuse a name,
 * and quietly moving it would move somebody's history with it; the refusal is reported instead.
 */
export function bindSessionName(recordId: string, name: string, actor: Actor): SessionBinding & { bindingWritten: boolean } {
  const trimmed = name.trim()
  if (trimmed === '') throw new PanelError('A session name must not be blank.')

  const record = db.select().from(records).where(eq(records.id, recordId)).get()
  if (!record) throw noRecordHasThisId(recordId)
  if (record.kind !== 'session') {
    throw new PanelError(
      `Record ${recordId} is a ${record.kind}, not a session. A run name names the session that did the ` +
        `work, so only a session record can answer to one.`,
    )
  }

  // Inside the session record's OWN project. A name bound in another project means another
  // project's run, and refusing this binding because of it would report a clash that does not
  // exist here — two projects may each have a run called `baseline`.
  const existing = boundToName(trimmed, record.workspaceId)
  if (existing !== null && existing !== recordId) {
    const other = getRecord(existing)
    return {
      name: trimmed,
      recordId,
      repointed: 0,
      bindingWritten: false,
      alreadyBoundTo: existing,
      note:
        nameIsSpokenFor(trimmed, { recordId: existing, title: other?.title ?? null, matchedBy: 'name' }) +
        ` If this session really is the one called "${trimmed}", the other binding has to go first — two ` +
        `sessions answering to one name would make "which session did this" unanswerable.`,
    }
  }

  if (existing === null) {
    // Written before the repoint below, so the repoint carries this row too and the log ends up
    // wholly in record ids -- except this row's `newValue`, which is where the name now lives.
    logChange(recordId, 'update', actor, SESSION_NAME_FIELD, null, trimmed)
  }

  // INSIDE THIS SESSION'S OWN PROJECT, and that clause is the whole of it. `sessionId` on a change
  // row holds whatever the writer sent — usually a run name before any session record existed — so
  // an unscoped repoint rewrites every row in the database that used the same word, including
  // another project's. Two projects each having a run called `baseline` is ordinary, and without
  // this clause binding one of them would move the other project's history onto this record and
  // report it as a success, in the number this function returns.
  const result = db
    .update(changes)
    .set({ sessionId: recordId })
    .where(and(eq(changes.sessionId, trimmed), eq(changes.workspaceId, record.workspaceId)))
    .run()
  const repointed = Number(result.changes ?? 0)

  // The name is bound now, whatever it used to match on. Under the SAME key the resolver reads —
  // workspace and name, joined — because a cache written under the bare name is a cache the
  // resolver never finds: `resolveSessionRef` would go on answering `matchedBy: 'title'` for a
  // name that is now bound, which is the difference between a match that survives a rename and
  // one that does not.
  resolvedSessions.set(sessionCacheKey(record.workspaceId, trimmed), { recordId, matchedBy: 'name' })

  return {
    name: trimmed,
    recordId,
    repointed,
    bindingWritten: existing === null,
    alreadyBoundTo: null,
    note:
      `"${trimmed}" now names the session record ${recordId} ("${record.title}")` +
      (repointed > 0
        ? `, and ${repointed} change row${repointed === 1 ? '' : 's'} that carried the raw name now carry ` +
          `the record id.`
        : `. No change row carried the raw name, so nothing was moved.`),
  }
}

/** One value the change log stores in its session column, and how many rows carry it. */
export interface StoredSessionRef {
  stored: string
  rows: number
}

/**
 * The session record each of `refs` means, as `resolveSessionRef(ref, workspaceId).recordId` answers it,
 * or null where that answers none.
 *
 * ONE READ FOR THE VALUES THAT ARE SESSION RECORD IDS OF THIS PROJECT, which is most of what the change
 * log's session column holds. Those are answered by the id rung of `resolveSessionRef`, and it reads one
 * row for each. Every other value is handed to `resolveSessionRef` itself, so the name and title rungs
 * stay in one place. So is a value the cache remembers as meaning another record, and a value with space
 * around it, so that what this answers and what the resolver answers cannot differ.
 *
 * Written for the session read: on a made-up office of 8,850 sessions it resolved
 * every value of the log one at a time, two statements each, before a run's page could be answered.
 */
export function theRecordIdsOfSessionRefs(refs: readonly string[], workspaceId: string): Map<string, string | null> {
  const answered = new Map<string, string | null>()
  const asIds = refs.filter((ref) => ref !== '' && ref === ref.trim())
  // IN PIECES (src/server/db/in-pieces.ts): `refs` is every value the change log's session column holds, which grows
  // with the office; the answers go into a map by id, so the order of the pieces does not matter.
  // BY ID ALONE, and the project and the kind tested here. Asked in the query as well, they led SQLite
  // to walk every session through the kind's index: 137 ms for 8,850 ids on the made-up office, 6 ms so.
  const rows = readInPieces(asIds, (piece) =>
    db
      .select({ id: records.id, workspaceId: records.workspaceId, kind: records.kind })
      .from(records)
      .where(inArray(records.id, piece))
      .all(),
  )
  for (const { id, workspaceId: of, kind } of rows) {
    if (of !== workspaceId || kind !== 'session') continue
    const cached = resolvedSessions.get(sessionCacheKey(workspaceId, id))
    if (cached === undefined || cached.recordId === id) answered.set(id, id)
  }
  for (const ref of refs) {
    if (!answered.has(ref)) answered.set(ref, resolveSessionRef(ref, workspaceId).recordId)
  }
  return answered
}

/**
 * Every distinct value in `changes.session_id`, with its row count.
 *
 * The input to migration: a mixture of record ids (already right) and run names (not yet). It
 * lives here because this is the only file that reaches the tables.
 */
export function storedSessionRefs(workspaceId: string): StoredSessionRef[] {
  return db
    .select({ stored: changes.sessionId, rows: sql<number>`count(*)` })
    .from(changes)
    .where(
      and(
        eq(changes.workspaceId, workspaceId),
        sql`${changes.sessionId} is not null and ${changes.sessionId} <> ''`,
      ),
    )
    .groupBy(changes.sessionId)
    .all()
    .map((r) => ({ stored: r.stored ?? '', rows: Number(r.rows) }))
    .filter((r) => r.stored !== '')
    .sort((a, b) => b.rows - a.rows || a.stored.localeCompare(b.stored))
}

/** Every value stored in `changes.session_id` that means this session. */
export function sessionFilterValues(ref: SessionRef): string[] {
  const values = new Set<string>([ref.asked])
  if (ref.recordId !== null) values.add(ref.recordId)
  // Legacy and in-flight rows still carry names. Filtering on the record id alone would answer
  // "which changes did this session make" with a confident, wrong, short list.
  for (const name of ref.names) values.add(name)
  return [...values]
}

/** One session named by a set of change rows, resolved as far as it can be. */
export interface SessionInRows {
  /** The value stored in the rows. A record id once resolved, a run name when not. */
  stored: string
  recordId: string | null
  title: string | null
  matchedBy: SessionMatch
  rows: number
  /**
   * True when THIS PROJECT has no session record for the stored value.
   *
   * It is not the same question as "nothing wrote these rows", and `elsewhereIn` beside it is what
   * tells the two apart: a value that names a session filed in another project is unresolved here
   * and answered for somewhere, which is a different sentence from a run name nobody ever filed.
   */
  unresolved: boolean
  /**
   * The project the session is filed in, when the stored value names one outside this project.
   *
   * Null otherwise, including when the value resolved. See `sessionFiledElsewhere`: what a surface
   * draws for such a row has to say where the session is rather than "no session record answers to
   * this", which is the one thing that is certainly false about it.
   */
  elsewhereIn: string | null
  /**
   * THE MODEL THE RUN WAS STARTED ON, as its session record stores it, or null when the record holds none or this
   * project holds no record. A page names the model that wrote a change, by its name, from it.
   */
  model: string | null
}

/**
 * WRITE DOWN A PRESS UNDER THE GRANT THAT WROTE NO CHANGE ROW. The route layer calls it after a door
 * answered 2xx (`writeDownEveryPressUnderTheGrant` in lib/for-the-person.ts), so a press whose door keeps what it
 * changed outside the change log, such as whether the office map moves, is written down with its reason as every other press is.
 * Where a change row of the same request wrote the row already, the insert does nothing, so a press is still one row.
 * It is filed in the project the request was answered in, and in none where nothing worked one out.
 */
export function writeDownAPressOutsideTheLog(actor: Actor, workspaceId: string | null): void {
  const grantId = actor.press?.underTheGrant
  if (grantId === undefined) return
  writeThePressRow(actor, grantId, { workspaceId, sessionId: theSessionARowNames(actor, workspaceId) })
}

/**
 * THE ID OF THE PRESS UNDER THE GRANT THIS REQUEST MADE, made now where it has none yet, or undefined where the grant
 * carried nothing. A write that keeps a mark of its press names it by this id (a checklist item marked done under the
 * grant), and the press row written beside the write's first change row takes the same id.
 */
export function thePressUnderTheGrantOf(actor: Actor): string | undefined {
  const press = actor.press
  if (press?.underTheGrant === undefined) return undefined
  press.id ??= anOfficeId()
  return press.id
}
