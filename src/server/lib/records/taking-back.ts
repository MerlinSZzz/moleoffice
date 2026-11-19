// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TAKING BACK AN ACT: who may revoke an act made on the person's words, the revocation itself, and
 * the two ways an act is undone — a promotion retracted and an earlier revision put back. They were
 * moved out of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`; the governance guards
 * import `assertMayRevokeAnAct` from this file. This file does not import records.ts.
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { db, sqlite } from '../../db/client.ts'
import { records, revisions } from '../../db/schema.ts'
// WHO WRITES A SECRETARY'S DUTIES, AND WHAT THEY HOLD.
import { checkNoDutiesRestOn, theActThatWouldStrandTheDuties } from '../grant/secretary-duties.ts'
import { PanelError } from '../panel-error.ts'
import { restoreRevision } from '../revisions.ts'
import type { Actor } from './actor.ts'
import { deleteRecord } from './delete-restore.ts'
import { actsForThePerson } from './own-words.ts'
import { ARRIVAL_IS_NOT_A_CLAIM, ONE_PERSON_AND_THE_NAME_IS_ITS_OWN, arrivalDetail, isSomebodyMoleOfficeCannotPlace, strangerDetail } from './served-doors.ts'

// ------------------------------------------------------- taking back an act made on the person's own words

/**
 * TAKING BACK AN ACT AN AGENT MADE ON THE PERSON'S WORDS IS THE PERSON'S OWN ACT.
 *
 * It is the other half of the warrant. An agent may act on what the person said; they may say it was not what
 * they meant, and one press puts the record back. So the press is reserved to them in the same four
 * clauses every other governance act is reserved in, and for the same reasons written on each of
 * them: an agent revoking its own act would be an agent deciding when the person's words stop applying.
 */
export function assertMayRevokeAnAct(
  act: { recordId: string; seq: number; title: string },
  actor: Actor,
): void {
  const tail =
    `Nothing was written and the act stands exactly as it was. Revoking is what the person does when an ` +
    `agent read their words wrongly, so it is theirs to press — on the record's own page, at the machine ` +
    `Mole Office runs on. If you think the act was wrong, say so on the record and leave it for them: ` +
    `PATCH /api/records/${act.recordId} {"summary":"<what you found>"}.`
  const detail = `revoke act ${act.recordId}#${String(act.seq)}`

  // AND THE PERSON'S PRESS ANSWERS IT, exactly as their quoted words do. Criterion P59: an elevation gives the
  // person's own acts, and this is one of them — `actKey` on this guard's entry in GOVERNANCE_GUARDS
  // is the act, and the declaration files that act under the power an elevation hands over. The
  // refusal below is unchanged for a request with no warrant and no elevation.
  if (actor.type !== 'human' && actsForThePerson(actor)) return
  if (actor.type !== 'human') {
    throw new PanelError(
      `Revoking an act made on the person's words is their own act, and this request came from ${actor.type} ` +
        `"${actor.id}". ${tail}`,
      403,
    )
  }
  if (actor.stated === false) {
    throw new PanelError(
      `Revoking an act made on the person's words is their own act, and this request sent no actor headers, so ` +
        `nothing said who is asking. Ordinary writes take that as the person typing by hand; this one may not, ` +
        `because an absent header is not evidence that a person made it. ${tail} ` +
        `Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
      403,
    )
  }
  if (isSomebodyMoleOfficeCannotPlace(actor)) {
    throw new PanelError(
      `Revoking an act made on the person's words is their own act, and this request was made in the name ` +
        `"${actor.id}", which is not somebody Mole Office can place. ${tail} ${ONE_PERSON_AND_THE_NAME_IS_ITS_OWN}`,
      403,
      strangerDetail(detail, actor),
    )
  }
  if (actor.from === 'another machine' && !thePersonIsProved(actor)) {
    throw new PanelError(
      `Revoking an act made on the person's words is their own act, and it is done at the machine Mole Office runs ` +
        `on. This request came from another machine. ${tail} ${ARRIVAL_IS_NOT_A_CLAIM}`,
      403,
      arrivalDetail(detail),
    )
  }
}

/** What a revocation did, for the reply and for the reader. */
export interface RevokedAct {
  recordId: string
  /** The revision that WAS the act. It is unchanged; nothing is rewritten. */
  seq: number
  /** The revision the undo wrote, which is what carries the revocation. */
  revokedBySeq: number
  /** What the undo did, in the words a person reads. */
  note: string
}

/**
 * PUT BACK WHAT AN ACT MADE ON THE PERSON'S WORDS DID, AND KEEP EVERY TRACE OF IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS UNDONE, AND HOW
 * ---------------------------------------------------------------------------------------
 *
 * Two shapes, because there are two shapes of act:
 *
 *   A PROMOTION filed a `decision` and linked it to the fork. The undo soft-deletes that decision,
 *   which is what un-settles the fork — `proposalResolution` counts only decisions that are not
 *   deleted, so the fork reads open again and is back on the owner's list. The decision is kept, with every
 *   word in it, because the person is entitled to see what was written in their name.
 *
 *   EVERY OTHER ACT changed fields on a record. The undo puts back exactly what the record held at
 *   the revision before the act, through `restoreRevision`, which is the ordinary restore an
 *   ordinary person makes: it validates, it logs, and it writes its own revision.
 *
 * NOTHING IS REWRITTEN AND NOTHING IS DELETED. The act's own revision is untouched, its warrant is
 * still on it, and its change rows are still in the log. The undo is a NEW write, and it carries
 * `revokes_seq` naming the act it took back — so `GET /api/records/<id>` can say "this was done on
 * the person's words, and they took it back" rather than losing one half of that sentence.
 *
 * WHY `revokes_seq` IS SET AFTER THE UNDO RATHER THAN PASSED INTO IT. The undo goes through
 * `deleteRecord` and `restoreRevision`, the same two functions a person's own hand reaches, and
 * neither takes a ledger label from four callers up. Threading one through both would be a
 * parameter on every write path for the sake of one caller. The column is set on the revision this
 * transaction has just written, inside the same transaction, so no reader ever sees the row without
 * it.
 */
export function revokeAnActOnTheirWords(recordId: string, seq: number, actor: Actor): RevokedAct {
  const act = db
    .select()
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.seq, seq)))
    .get()
  if (act === undefined) {
    throw new PanelError(
      `Record ${recordId} has no version ${String(seq)}, so there is no act to revoke. Nothing was written. ` +
        `GET /api/records/${recordId} lists what was done on the person's words under \`onThePersonsWords\`, each with ` +
        `the version to send here.`,
      404,
    )
  }
  // THE PERSON'S WORDS, OR THE PERSON'S PRESS. An act made under a period the person granted carries the grant
  // (`elevationWritten`) and no warrant, and this door used to answer it 400 as if it stood on nobody. A period is their
  // authority handed over for a while, so taking back what was done on it is the same press as taking back what was
  // done on their quoted words. A write that carries neither is still an ordinary write, refused below.
  const underAPeriod = act.warrant === null && act.elevation !== null
  if (act.warrant === null && act.elevation === null) {
    throw new PanelError(
      `Version ${String(seq)} of record ${recordId} was an ordinary write: it was not made on anybody's words, ` +
        `nor under a period the person granted, so there is nothing to revoke. Nothing was written. An ordinary write is ` +
        `undone by putting an earlier version back: POST /api/records/${recordId}/revisions/${String(seq - 1)}/restore.`,
      400,
    )
  }

  assertMayRevokeAnAct({ recordId, seq, title: act.title }, actor)

  const already = db
    .select({ seq: revisions.seq, at: revisions.at })
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.revokesSeq, seq)))
    .get()
  if (already !== undefined) {
    throw new PanelError(
      `That act was already revoked on ${already.at}, at version ${String(already.seq)}, and nothing was ` +
        `written this time. An act is revoked once: pressing it again would undo a write that is already undone ` +
        `and put a second revocation in the trail for one act.`,
      409,
    )
  }

  return sqlite.transaction((): RevokedAct => {
    const before = db
      .select({ seq: sql<number | null>`max(${revisions.seq})` })
      .from(revisions)
      .where(eq(revisions.recordId, recordId))
      .get()
    const highestBefore = before?.seq ?? 0

    // A PROMOTION IS UNDONE BY RETRACTING THE DECISION IT FILED. `op: 'create'` on a `decision` that
    // is linked to a proposal is exactly what a promotion writes and nothing else writes.
    const isTheDecisionAPromotionFiled = act.op === 'create' && act.kind === DECISION_KIND
    const note = isTheDecisionAPromotionFiled
      ? retract(recordId, act.title, actor)
      : putBack(recordId, seq, act.title, actor, underAPeriod)

    const after = db
      .select({ seq: sql<number | null>`max(${revisions.seq})` })
      .from(revisions)
      .where(eq(revisions.recordId, recordId))
      .get()
    const written = after?.seq ?? 0
    if (written <= highestBefore) {
      throw new PanelError(
        `The revocation was asked for and wrote nothing, so the act still stands. This is raised inside the ` +
          `same transaction as the undo, so nothing has been stored. Report it: an act that cannot be taken ` +
          `back is the half of the warrant the person was promised.`,
        500,
      )
    }
    db.update(revisions)
      .set({ revokesSeq: seq })
      .where(and(eq(revisions.recordId, recordId), eq(revisions.seq, written)))
      .run()

    return { recordId, seq, revokedBySeq: written, note }
  })()
}

/** Retract the decision a promotion filed, which is what puts the fork back on the owner's list. */
function retract(decisionId: string, title: string, actor: Actor): string {
  // NOT WHILE A SECRETARY'S DUTIES REST ON IT. `deleteRecord` refuses it too; this asks
  // first so the refusal says the order at this door: the duties, then the revoke.
  const decision = db
    .select({ title: records.title, workspaceId: records.workspaceId })
    .from(records)
    .where(and(eq(records.id, decisionId), eq(records.kind, DECISION_KIND), isNull(records.deletedAt)))
    .get()
  if (decision !== undefined) checkNoDutiesRestOn({ id: decisionId, ...decision }, 'revoke')
  deleteRecord(decisionId, actor)
  return (
    `The decision "${title}" was retracted, so the fork it settled is open again and back on your list. ` +
    `The decision itself is kept, with every word that was written in your name, and it can be restored.`
  )
}

/** Put back what the record held at the version before the act. */
function putBack(recordId: string, seq: number, title: string, actor: Actor, underAPeriod: boolean): string {
  if (seq <= 1) {
    throw new PanelError(
      `Version ${String(seq)} is the first version of "${title}", so there is nothing before it to put back. ` +
        `Nothing was written. A record that was FILED on somebody's words is undone by deleting it, which is a ` +
        `different act with a different question: DELETE /api/records/${recordId}.`,
      400,
    )
  }
  // NOT WHILE IT WOULD TAKE AWAY WHAT LETS A SECRETARY'S DUTIES REST ON A DECISION. The
  // restore's own patch refuses it too, in the change's sentence, which ends by telling the caller to make the change
  // again; this asks first, of the version it would put back, so the refusal says the order: the duties, then the revoke.
  const now = db
    .select({ kind: records.kind, title: records.title, data: records.data, workspaceId: records.workspaceId })
    .from(records)
    .where(and(eq(records.id, recordId), isNull(records.deletedAt)))
    .get()
  const earlier = db
    .select({ kind: revisions.kind, data: revisions.data })
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.seq, seq - 1)))
    .get()
  if (now !== undefined && earlier !== undefined) {
    const act = theActThatWouldStrandTheDuties(recordId, now, earlier)
    if (act !== null) checkNoDutiesRestOn({ id: recordId, title: now.title, workspaceId: now.workspaceId }, act, new Set(), seq)
  }
  restoreRevision(
    recordId,
    seq - 1,
    actor,
    underAPeriod ? 'It was done under a period you granted and you revoked it.' : 'It was done on your words and you revoked it.',
  )
  return `"${title}" is back to what it held at version ${String(seq - 1)}, before the act.`
}
