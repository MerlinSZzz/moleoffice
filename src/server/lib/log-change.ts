// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `logChange` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `thePressRowOf` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `writeThePressRow` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `provedByWritten` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `warrantWritten` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `elevationWritten` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `signedItemWritten` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `provedHolderWritten` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `attributionFor` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `theProjectARecordsRowsAreFiledIn` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `theSessionARowNames` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { anOfficeId } from './ids.ts'
import { db } from '../db/client.ts'
import { changes, pressesForThePerson, records } from '../db/schema.ts'
import type { ChangeOp, ProvedHolder } from '@shared/types.ts'
import { now } from '@shared/now.ts'
import type { Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import type { HowACallerProvedItself } from './keys.ts'
import { eq } from 'drizzle-orm'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { writtenInOf } from '@shared/messages.ts'
import { isJsonObject } from '../db/the-decision-names-this-fork.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'

/**
 * Write one row into the change log. THE ONLY WRITER — exported so nothing has to copy it.
 *
 * lib/resources.ts had its own copy for a while, and the copy did the one thing this one does
 * that is easy to leave out: resolving `actor.sessionId` to the session RECORD it means. So a
 * registration written under a run name that was already bound stored the raw name, which is
 * the difference between a row that joins to a session and a row that happens to match a string.
 * A second copy of this function is how that comes back, so there is one.
 */
export function logChange(
  recordId: string,
  op: ChangeOp,
  actor: Actor,
  field?: string | null,
  oldValue?: unknown,
  newValue?: unknown,
  /**
   * The project this change happened in, USED ONLY WHEN NO RECORD ANSWERS TO `recordId`.
   *
   * Almost every change row hangs off a record and reads its project off that record — see below,
   * where the derivation is and why it must not be a parameter. This is for the one caller that
   * has no record to hang off: the `structure` presentation scope is anchored on a synthetic id
   * rather than a record id, because it is the arrangement of the whole module graph and no single
   * record owns it. The scope knows its own workspace.
   *
   * IT IS NOT A SECOND PLACE STATING THE SAME FACT. When a record exists, the record's workspace
   * is used and this is not read at all, so the two can never disagree — the only case where it
   * has any effect is the case where the derivation has no answer. Left out, that case stays NULL,
   * which is what it means when nobody can say.
   */
  workspaceIdWhenNoRecord?: string,
  /** The starter's own key, given only to the create and the mint of a run a starter files by hand. See `provedHolderWritten`. */
  startersKey?: ProvedHolder,
) {
  const str = (v: unknown) =>
    v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v)
  const filed = attributionFor(recordId, actor)
  db.insert(changes)
    .values({
      id: anOfficeId(),
      recordId,
      // The record's project when there is a record — always, and whatever the caller passed. The
      // parameter is consulted only where the derivation has no answer at all.
      workspaceId: filed.workspaceId ?? workspaceIdWhenNoRecord ?? null,
      op,
      actorType: actor.type,
      actorId: actor.id,
      sessionId: filed.sessionId,
      field: field ?? null,
      oldValue: str(oldValue),
      newValue: str(newValue),
      // THE PERSON'S OWN WORDS, WHEN A GUARD USED THEM TO LET THIS WRITE THROUGH. Null otherwise,
      // which is every ordinary write. See `warrantWritten` for why an unused warrant stores nothing.
      warrant: warrantWritten(actor),
      elevation: elevationWritten(actor),
      signed_item: signedItemWritten(actor),
      // WHO A KEY PROVED, when that is not the actor named here, or the starter's own key on a starter's run's create
      // and mint. Criterion P83, point 5. See `provedHolderWritten`: on every ordinary write this writes NULL and means it.
      provedHolder: provedHolderWritten(actor, startersKey),
      // HOW A KEY PROVED THIS REQUEST, on every keyed write. Migration 0178. See `provedByWritten`.
      provedBy: provedByWritten(actor),
      // THE PRESS FOR THE PERSON THAT WROTE THIS ROW, where the grant allowed it. Migration 0280. See `thePressRowOf`.
      pressId: thePressRowOf(actor, { workspaceId: filed.workspaceId ?? workspaceIdWhenNoRecord ?? null, sessionId: filed.sessionId }),
      at: now(),
    })
    .run()
}
/**
 * THE PRESS FOR THE PERSON A CHANGE ROW IS WRITTEN BY, its id, or null for every write the grant did not allow.
 * Migration 0280; the flow design's section 7 says every press under the grant is written down with its reason.
 *
 * THE ROW IS WRITTEN HERE, BESIDE THE FIRST CHANGE ROW OF THE PRESS, and inside that row's transaction. So a press that
 * was refused, or that failed and was rolled back, leaves no row, and one that wrote nothing leaves none either. Every
 * later change row of the same request finds the row there, because the press is one object per request (`thePressOf`
 * in lib/http.ts) and the id is made on it once. A row a rollback took away is written again by the next change row.
 * It is filed in the project and under the session of the change row it is written beside.
 *
 * It is read off the same mark `elevationWritten` reads, so a row names a press exactly where it names the grant.
 */
export function thePressRowOf(actor: Actor, filed: { workspaceId: string | null; sessionId: string | null }): string | null {
  if (actor.elevationUsed !== true || actor.elevation === undefined) return null
  return writeThePressRow(actor, actor.elevation.id, filed)
}
/**
 * THE ROW OF ONE PRESS UNDER THE GRANT, written once: its id is made on the press the first time, and the insert does
 * nothing where the row is there already. The one writer of `presses_for_the_person`, for both of its callers above.
 *
 * `aRaiseCarriesIt` marks a press only after `mayPressForThePerson` said yes, and that answer needs a press with its
 * door named. A press marked without one is a broken assumption, and it is refused rather than left unrecorded.
 */
export function writeThePressRow(actor: Actor, grantId: string, filed: { workspaceId: string | null; sessionId: string | null }): string {
  const press = actor.press
  if (press === undefined || press.operation === null) {
    throw new PanelError(
      `"${actor.id}" acted under the person's grant with no door named, so the press cannot be written down. This is ` +
        'a fault in Mole Office: only a press whose door is named may use the grant.',
      500,
    )
  }
  press.id ??= anOfficeId()
  db.insert(pressesForThePerson)
    .values({
      id: press.id,
      workspaceId: filed.workspaceId,
      agentId: actor.id,
      sessionId: filed.sessionId,
      grantId,
      operation: press.operation,
      reason: press.reason,
      at: now(),
    })
    .onConflictDoNothing()
    .run()
  return press.id
}
/**
 * HOW A KEY PROVED THE REQUEST BEHIND A LEDGER ROW, or null when no key proved it.
 *
 * Read off the actor, where `actorFrom` put it, and never worked out again. A warrant written after
 * the key window closed may cite only words the person's key proved, and `whyTheCitedPlaceMayNotBeCited`
 * in ./warrants.ts reads this column to answer that.
 *
 * ONE FUNCTION FOR BOTH LEDGERS, for the reason `warrantWritten` gives.
 */
export function provedByWritten(actor: Actor): HowACallerProvedItself | null {
  return actor.provedBy ?? null
}
/**
 * The warrant to store on a ledger row, as JSON, or null.
 *
 * IT IS THE ACT'S WARRANT AND NOT THE REQUEST'S. A warrant that no guard used opened no door, so
 * writing it here would mark an ordinary edit *on the owner's words* — a claim about the owner that they
 * never made. `theWordsAllowThis` is the only thing that sets the flag this reads.
 *
 * ONE FUNCTION FOR BOTH LEDGERS. `logChange` and `saveRevision` write in the same transaction and
 * must agree about whether this write was made on somebody's words; two copies of this line are two
 * places that could come to disagree, which is this repository's recurring defect.
 */
export function warrantWritten(actor: Actor): string | null {
  return actor.warrantUsed === true && actor.warrant !== undefined ? JSON.stringify(actor.warrant) : null
}
/**
 * THE ELEVATION TO STORE ON A LEDGER ROW, as JSON, or null. Criterion P59.
 *
 * The same rule `warrantWritten` above states, for the other key to the same door: it is stored on
 * the act the elevation ALLOWED and on nothing else. An elevated secretary filing an ordinary note
 * needed no elevation, so that row carries none — writing it there would say the person's authority
 * was spent on a write any worker could have made.
 *
 * ONE PLACE, TWO LEDGERS. `logChange` and `saveRevision` both call it, in one transaction, so a
 * write cannot be made under an elevation in one ledger and not in the other.
 */
export function elevationWritten(actor: Actor): string | null {
  return actor.elevationUsed === true && actor.elevation !== undefined ? JSON.stringify(actor.elevation) : null
}
/** One function for both ledgers: this item's signature, or null for every ordinary write. */
export function signedItemWritten(actor: Actor): string | null {
  return actor.signedItem === undefined ? null : JSON.stringify(actor.signedItem)
}
/**
 * WHO A KEY PROVED, TO STORE ON A LEDGER ROW, or null. One function for both ledgers, as the three above.
 *
 * The actor's own holder, where the key and the headers named different agents. It is read off the actor and never
 * worked out again: `actorFrom` in lib/http.ts is the one place both facts are in hand. Otherwise the starter's own key,
 * which only the create and the mint of a run a starter files by hand are given, so that run's own key proves the run
 * (lib/keys.ts). There the key proved the very agent the row names. Every other write is given nothing and stores null.
 */
export function provedHolderWritten(actor: Actor, startersKey: ProvedHolder | undefined): ProvedHolder | null {
  return actor.provedHolder ?? startersKey ?? null
}
export function attributionFor(recordId: string, actor: Actor): { workspaceId: string | null; sessionId: string | null } {
  const workspaceId = theProjectARecordsRowsAreFiledIn(recordId)
  return { workspaceId, sessionId: theSessionARowNames(actor, workspaceId) }
}
/**
 * THE PROJECT A RECORD'S CHANGE ROWS ARE FILED UNDER, or null when no record has the id. A record's own project, except
 * that A MESSAGE'S ROWS ARE FILED UNDER THE PROJECT IT WAS WRITTEN IN, as they were before
 * messages left projects, so every project's reading of what was written in it still finds them. The message itself is
 * in the message centre, and a read of one message's own rows looks everywhere (`changesWhere`). The message centre is
 * the project only when none was named. Read by every change row written and by lib/move.ts when it refiles them.
 *
 * WHY IT IS ONE FUNCTION AND NOT TWO COPIES
 *
 * Two tables hang a row off a record and each has to answer the same two questions: `changes`, and
 * now `revisions`. They must answer them identically — a change row and the revision written beside
 * it in the same transaction, filed in two different projects or crediting two different sessions,
 * would be the ledger and the daily page disagreeing about the same write. So the derivation is
 * here, once, and both callers read it.
 *
 * THE PROJECT IS READ OFF THE RECORD AND IS NEVER PASSED IN. There is no parameter for it and there
 * must not be one: the project of a row about a record IS the project of that record, which is the
 * same fact rather than a second one that could differ. A caller that could supply it would be a
 * second place stating it, which is this codebase's recurring defect.
 *
 * NULL when no record answers to the id. That is the same NULL the workspace migration leaves on a
 * change row whose record is missing, and it means the same thing: nobody can say. It is not
 * defaulted to the default workspace, which would file the row in a project at random.
 */
export function theProjectARecordsRowsAreFiledIn(recordId: string): string | null {
  const row = db
    .select({ workspaceId: records.workspaceId, data: records.data })
    .from(records)
    .where(eq(records.id, recordId))
    .get()
  if (row === undefined) return null
  return row.workspaceId === MESSAGE_CENTRE
    ? (writtenInOf(isJsonObject(row.data) ? (row.data as Record<string, unknown>) : {})?.project ?? MESSAGE_CENTRE)
    : row.workspaceId
}
/**
 * THE SESSION A LEDGER ROW NAMES: the reference the actor sent, resolved inside the project the row is filed in, or as
 * it was sent where there is no project. Null where it sent none. The change log and the press row read it here.
 *
 * THE SESSION REFERENCE IS RESOLVED INSIDE THAT PROJECT. A run name means a session record of this
 * project or it means nothing here; resolving it anywhere else would file the row under another
 * project's run. When there is no record there is no project to resolve inside, so the reference is
 * stored exactly as the caller sent it — it is the only thing known about who wrote this, and
 * dropping it would turn a row that can still be repaired into one that cannot.
 */
export function theSessionARowNames(actor: Actor, workspaceId: string | null): string | null {
  const sent = actor.sessionId ?? ''
  if (sent === '') return null
  if (workspaceId === null) return sent
  const ref = resolveSessionRef(sent, workspaceId)
  return ref.recordId ?? ref.asked
}
