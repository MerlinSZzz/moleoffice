// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `resolveSessionRef` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `MIGRATION_ROUTE` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `resolvedSessions` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `sessionCacheKey` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `boundToName` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `SESSION_NAME_FIELD` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `sessionRefFor` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `sessionNamesOf` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `sessionFiledElsewhere` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

// ================================================================ WHAT x-mole-office-SESSION MEANS
//
// THE DEFECT THIS SECTION EXISTS TO REMOVE. An audit ran a real job through the API with
// `x-mole-office-session: checkpoint3` on every write, and afterwards found that all 28 of its change
// rows carried the string "checkpoint3" while the session record it had filed carried a different id. Nought rows matched
// the record. The column LOOKED populated, so nothing
// complained, and the one question Mole Office exists to answer -- which session produced this? --
// was answered wrongly and silently. That is worse than an empty column, which at least admits
// it knows nothing.
//
// THE RULE, AND ITS REASON:
//
//   `x-mole-office-session` carries a REFERENCE to a session: either a session record's id, or the
//   run name a person or an agent actually uses ("checkpoint3", "baseline"). Both are accepted,
//   because an agent naturally has a name for its run and does NOT have a record id -- the
//   record is usually filed minutes into the work, if at all. Refusing the name would mean an
//   agent must file a session record before it may write anything, which is a rule nobody would
//   follow and which would make the header worse than useless.
//
//   Every change row stores the RESOLVED RECORD ID whenever the reference can be resolved, so
//   that `changes.session_id` joins to `records.id` like every other reference in the database
//   (lib/resources.ts already owns its rows by `sessionRecordId`; this makes the change log
//   agree with it instead of speaking a private dialect).
//
//   What the caller SAID is never thrown away. When a session record is filed by a caller
//   writing under a name, that name is bound to the record with one change row -- op `update`,
//   field `sessionName` -- and every row already carrying the raw name is repointed at the
//   record in the same breath. The binding row is the durable record of "this session answers to
//   the name checkpoint3": it survives a rename of the record, it is dated and attributed like
//   every other fact in Mole Office, and it is why `?session=checkpoint3` keeps working forever.
//
//   A reference that resolves to NOTHING is stored exactly as it was sent. It is not dropped
//   (that would lose the only thing known about the writer) and no session record is invented
//   for it. Filing a record as a side effect of an unrelated write would put rows on the alarm
//   panel for a session nobody has described, with no `state` that could honestly be given --
//   and it would mean any script that made up a run name silently grew the session list. Those
//   danglers are not left silent either: GET /api/changes reports them as unresolved, and
//   POST /api/sessions/discover resolves what can be resolved and names what cannot.
//
// WHEN FILING A SESSION SAYS SOMETHING BACK, and when it says nothing. Three cases, because they
// are three different pieces of news and only two of them are news at all:
//
//   * The reference is a RECORD ID and it means a session record. Nothing is claimed, and nothing
//     is reported. The caller said which session it is writing as, in the one spelling that cannot
//     be misread, and its rows are already filed under exactly that record. A report here would be
//     a line of text on every ordinary write saying that nothing happened.
//
//   * The reference is a RUN NAME nothing answers to yet (the ordinary case: an agent works under
//     a name, then files itself). The name is bound, the earlier rows are repointed, and the reply
//     says how many moved -- rows the caller never asked this request to touch.
//
//   * The reference is a RUN NAME that already means ANOTHER session, either because that session
//     is bound to it or because that session is titled exactly that. Nothing is written, and the
//     reply says so: which session holds the name, that the caller's rows -- including this
//     record's own create row -- were filed under that session rather than this one, and what to
//     do next. This case used to be silent, which is the worst of the three to be silent about: an
//     agent walked away with a 201 in hand and its whole history filed under a stranger's session.

import { and, eq, desc } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records, changes } from '../db/schema.ts'
import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import { toRecord } from './to-record.ts'
import { liveMatches } from '@shared/live-matches.ts'
import { titleNamesMoreThanOne } from '@shared/title-names-more-than-one.ts'
import type { SessionRef, SessionMatch } from './records.ts'

/**
 * Work out which session record a reference means.
 *
 * Reads only. The ladder is deliberately short and exact -- an id, a bound name, an exact title
 * -- because this runs on the write path, and a fuzzy match made there would file somebody's work
 * under the wrong session without anyone being asked. The looser matching (a title whose first
 * segment is the name, which is how sessions are titled here: "baseline · transplant replay sweep")
 * belongs to POST /api/sessions/discover, which reports every match it would make, and makes none
 * of them, when it is asked with {"dryRun":true}.
 *
 * A soft-deleted session record still resolves. Deleting a record in Mole Office never removes it, and
 * the work it did is still the work it did.
 */
export function resolveSessionRef(ref: string, workspaceId: string): SessionRef {
  const asked = ref.trim()
  if (asked === '') {
    return {
      asked: ref,
      recordId: null,
      title: null,
      matchedBy: 'unresolved',
      names: [],
      deleted: false,
      why: 'an empty string names no session.',
      elsewhereIn: null,
    }
  }

  const cached = resolvedSessions.get(sessionCacheKey(workspaceId, asked))
  if (cached !== undefined) {
    const row = db.select().from(records).where(eq(records.id, cached.recordId)).get()
    // How it matched is remembered alongside the id rather than re-derived, because the two are
    // different facts: "the caller sent this record's id" and "the record answers to that name"
    // are told apart in the reply, and a cache that flattened them would report a binding that
    // does not exist. Those two are the whole of what is in here — a title match is worked out
    // again every time, for the reason given at the title rung below.
    //
    // THE PROJECT IS CHECKED AGAIN ON EVERY HIT, and that is not belt and braces. The key holds the
    // workspace the answer was WORKED OUT in, and a session record can leave that project after the
    // answer is remembered: `POST /api/records/<session>/workspace` moves one, in this process,
    // between two reads. The cache then hands a reader in the project the session LEFT its id and
    // its title — a session that project can no longer open — which is precisely the boundary the
    // move verb is careful never to walk across. Falling through re-derives it, and the id rung
    // below answers `elsewhere`.
    //
    // THE KIND IS CHECKED AGAIN FOR THE SAME REASON, since 17 August 2026. A record's kind used to
    // be fixed at creation, so "this id named a session when the answer was worked out" and "this
    // id names a session" were one fact. `patchRecord` can change a kind now, so they are two, and
    // a cache that trusted the older one would go on attributing every write of this process to a
    // record that is no longer a session. Falling through re-derives it: the id rung below finds a
    // row that is not a session and says which kind it is instead.
    if (row && row.workspaceId === workspaceId && row.kind === 'session') {
      return sessionRefFor(row, asked, cached.matchedBy)
    }
    // The same composite key it was read under. Deleting the bare name would leave the stale entry
    // in place for ever, so a session record that was deleted and refiled would keep resolving to
    // the row that is gone.
    resolvedSessions.delete(sessionCacheKey(workspaceId, asked))
  }

  const byId = db
    .select()
    .from(records)
    .where(and(eq(records.id, asked), eq(records.workspaceId, workspaceId)))
    .get()
  if (byId && byId.kind === 'session') {
    resolvedSessions.set(sessionCacheKey(workspaceId, asked), { recordId: byId.id, matchedBy: 'recordId' })
    return sessionRefFor(byId, asked, 'recordId')
  }
  if (byId) {
    return {
      asked,
      recordId: null,
      title: null,
      matchedBy: 'unresolved',
      names: [],
      deleted: false,
      why:
        `${asked} is the id of a ${byId.kind}${quotedUnlessAMessage(byId, ' (', ')')}, not a session. A session reference is a ` +
        `session record's id or a run name bound to one; GET /api/sessions lists them.`,
      elsewhereIn: null,
    }
  }

  // THE RUN-NAME RUNG. `boundToName` reads a stored `sessionName` change row, and `bindSessionName`
  // only writes one for a record that was a session AT THE TIME. Since 17 August 2026 a kind can be
  // changed, so the row is history — this id answered to this run name once — and not a standing
  // claim that the record is still a session. The kind is therefore read now rather than trusted
  // from the row. A name whose record is no longer a session falls through to the title rung, which
  // has always asked for `kind = 'session'` in its own query.
  const bound = boundToName(asked, workspaceId)
  if (bound !== null) {
    const row = db.select().from(records).where(eq(records.id, bound)).get()
    if (row && row.kind === 'session') {
      resolvedSessions.set(sessionCacheKey(workspaceId, asked), { recordId: row.id, matchedBy: 'name' })
      return sessionRefFor(row, asked, 'name')
    }
  }

  // THE TITLE RUNG, INSIDE ONE PROJECT. It used to be `WHERE title = ? AND kind = 'session'` with
  // `.get()`, so two sessions with the same title in different projects resolved to whichever row
  // SQLite handed back first — reported as matchedBy: 'title' with no hint that there was a choice.
  // This runs on the WRITE path, so that meant a second project's run having its history filed
  // under a stranger's session: the exact failure this function's own header says it exists to
  // prevent. The workspace clause fixed the cross-project half.
  //
  // THE REST IS FIXED HERE, AND THE FIX IS TO REFUSE. This comment used to end "titles are unique
  // per workspace, so there is at most one row and the ambiguity cannot exist rather than being
  // resolved" — a database index quoted as the reason a write path needs no rule of its own. The
  // owner has settled that titles may repeat, so the index is the wrong thing to lean on and the
  // rows are read with `.all()`. Several of them is a real answer with a word of its own, and
  // nothing is attributed to any of the candidates: a change row is the answer to "which run wrote
  // this", and filing one under a guess would be worse than filing it under a bare name.
  //
  // AMBIGUITY IS JUDGED OVER THE LIVE ROWS, and `liveMatches` further down this file holds the
  // reason in full. A session record that was deleted keeps its title for ever, so once titles may
  // repeat, "the run called baseline, and the one called baseline that was deleted last week" is an
  // ordinary state rather than a puzzle. Refusing it would stop attributing a live session's work
  // because of a record nobody is using. Several LIVE sessions of one name is the real ambiguity
  // and it is refused.
  const titled = db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.title, asked), eq(records.kind, 'session')))
    .orderBy(records.createdAt, records.id)
    .all()
  const liveTitled = liveMatches(titled)
  if (liveTitled.length > 1) {
    // NOTHING IS REMEMBERED HERE. A refusal put in the cache would be handed back for the life of
    // the process, including after somebody renamed one of the candidates and made the reference
    // mean one session again. Only positive answers are ever cached, for the same reason.
    return {
      asked,
      recordId: null,
      title: null,
      matchedBy: 'ambiguous',
      names: [],
      deleted: false,
      elsewhereIn: null,
      why: titleNamesMoreThanOne(
        asked,
        workspaceId,
        liveTitled.map(toRecord),
        `Send x-mole-office-session with the id of the session you mean. Nothing was filed under any of them, ` +
          `and rows written under this name still carry the name.`,
      ),
    }
  }
  // A deleted session still resolves when nothing live answers to the name — this function's own
  // header says why, and `deleted` on the answer says which it is.
  const byTitle = liveTitled[0] ?? titled[0]
  if (byTitle) {
    // A TITLE MATCH IS NOT REMEMBERED, and it used to be. A cache holds an answer that was true
    // when it was worked out, and this is the one rung whose answer can become AMBIGUOUS later:
    // file a second session titled the same and the remembered id would go on being handed back,
    // which is the silent pick the branch above exists to stop. Checking the cached answer was
    // still the only one would mean running this query again, so there is nothing left to cache.
    // The id rung and the name rung are still remembered: an id cannot come to mean two records,
    // and a repeated NAME is already decided by rule — newest binding wins, see `boundToName`.
    return sessionRefFor(byTitle, asked, 'title')
  }

  // THE LAST RUNG BEFORE "NOBODY", and it climbs out of this project rather than further into it.
  // Never cached: this answer changes the moment somebody moves that session, and a cached
  // `elsewhere` would go on saying "over there" about a session that has come home.
  const elsewhere = sessionFiledElsewhere(asked, workspaceId)
  if (elsewhere !== null) return elsewhere

  return {
    asked,
    recordId: null,
    title: null,
    matchedBy: 'unresolved',
    names: [],
    deleted: false,
    elsewhereIn: null,
    why:
      // WHAT WAS ACTUALLY LOOKED AT, said exactly. The id was checked across the whole installation
      // — that is the rung above — and the name and the title only here, because neither is an
      // identifier outside one project and hunting for them in others would be a guess and a way to
      // ask what another project holds.
      `no session record anywhere has the id "${asked}", and none in this project answers to the name ` +
      `"${asked}" or is titled "${asked}". ` +
      `Writes made under this name are still recorded with it. Filing the session that made them — ` +
      `POST /api/records {"kind":"session",...} sent with x-mole-office-session: ${asked} — binds the name and ` +
      `repoints those rows in the same breath; ${MIGRATION_ROUTE} does it afterwards for the rows of a ` +
      `session that has already been filed, and names every value it cannot resolve.`,
  }
}
/** The route that reconciles the change log's session column. It is the only one that does. */
export const MIGRATION_ROUTE = 'POST /api/sessions/discover'
/**
 * Name-to-record lookups, remembered for the life of the process.
 *
 * Only POSITIVE answers are cached, and only to a record id, which never changes. A negative is
 * never cached: "no session answers to this name" stops being true the moment the session files
 * itself, which is a thing that happens in the middle of the very run doing the writing.
 * Cleared whenever a binding is written, because that is the only event that can change an
 * answer this holds.
 */
export const resolvedSessions = new Map<string, { recordId: string; matchedBy: SessionMatch }>()
/**
 * The cache key. THE WORKSPACE IS PART OF IT, because the answer is: two projects may each have a
 * session called `baseline`, and a cache keyed on the name alone would hand the first one asked to
 * whoever asked second. NUL-joined, because it cannot appear in either half.
 */
export const sessionCacheKey = (workspaceId: string, asked: string): string => `${workspaceId}\u0000${asked}`
/**
 * The session record a run name is bound to, or null.
 *
 * The NEWEST binding wins. Run names get reused -- "baseline" this week is a different run from
 * "baseline" a fortnight ago -- and the rows of the earlier run are already repointed at its own
 * record, so the later binding cannot reach back and steal them.
 *
 * Read through `changes_session_name_idx` (migration 0229), which holds only the rows that bind a name.
 * Without it each ask walked the project's whole log: 85 ms an ask on live on 10 October 2026.
 */
export function boundToName(name: string, workspaceId: string): string | null {
  const row = db
    .select({ recordId: changes.recordId })
    .from(changes)
    .where(
      and(
        eq(changes.workspaceId, workspaceId),
        eq(changes.field, SESSION_NAME_FIELD),
        eq(changes.newValue, name),
      ),
    )
    .orderBy(desc(changes.at), desc(changes.id))
    .get()
  return row?.recordId ?? null
}
/** The `field` of the one change row that binds a run name to a session record. */
export const SESSION_NAME_FIELD = 'sessionName'
export function sessionRefFor(record: typeof records.$inferSelect, asked: string, matchedBy: SessionMatch): SessionRef {
  return {
    asked,
    recordId: record.id,
    title: record.title,
    matchedBy,
    names: sessionNamesOf(record.id),
    deleted: record.deletedAt !== null,
    why: null,
    elsewhereIn: null,
  }
}
/** Every run name bound to a session record, oldest binding first. */
export function sessionNamesOf(recordId: string): string[] {
  const rows = db
    .select({ name: changes.newValue })
    .from(changes)
    .where(and(eq(changes.recordId, recordId), eq(changes.field, SESSION_NAME_FIELD)))
    .orderBy(changes.at)
    .all()
  const names: string[] = []
  for (const row of rows) {
    if (row.name !== null && !names.includes(row.name)) names.push(row.name)
  }
  return names
}
/**
 * SESSION ATTRIBUTION IS HISTORICAL PROVENANCE, NOT PROJECT OWNERSHIP — the reading half.
 *
 * The rule is stated once, in lib/move.ts, where it is enforced on the write side: moving a record
 * carries its own history and NEVER the session that wrote it, so a change row can truthfully name
 * a session filed in another project. This is what that row can be told from over here.
 *
 * BY ID AND ONLY BY ID. A change row carries an id it was written with, so a caller asking about
 * one is asking about something already in its hand. A run NAME is not an identifier across the
 * installation — two projects each having a run called `baseline` is ordinary — so looking a name
 * up outside this project would be guessing, and it would also be a way to ask which titles another
 * project holds. This asks about one primary key and reads nothing else.
 *
 * WHAT COMES BACK IS THE SESSION'S OWN PLACE AND NOTHING OF ITS NEIGHBOURS. Not its title, not what
 * it wrote, not the records around it: only that the id names a session and which project it is
 * filed in, which is what turns "no session record answers to this" — false, and the sentence a
 * reader would otherwise get — into "it is over there, and this project will not read into it".
 * `GET /api/workspaces` already lists every project by id, so the place is not a disclosure; the
 * work behind the boundary stays behind it.
 */
export function sessionFiledElsewhere(asked: string, workspaceId: string): SessionRef | null {
  const row = db
    .select({ id: records.id, kind: records.kind, workspaceId: records.workspaceId })
    .from(records)
    .where(eq(records.id, asked))
    .get()
  if (row === undefined || row.kind !== 'session' || row.workspaceId === workspaceId) return null
  return {
    asked,
    recordId: null,
    title: null,
    matchedBy: 'elsewhere',
    names: [],
    deleted: false,
    why:
      `that id names a session record filed in the project "${row.workspaceId}", not in "${workspaceId}". A ` +
      `change row keeps naming the session that wrote it even when the record it is about moves to another ` +
      `project, because attribution is a fact about what happened rather than a claim about where anything ` +
      `belongs. This project will not read into "${row.workspaceId}" to show you that session — send ` +
      `x-mole-office-workspace: ${row.workspaceId} and it is an ordinary session there.`,
    elsewhereIn: row.workspaceId,
  }
}
