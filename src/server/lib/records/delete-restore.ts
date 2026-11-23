// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DELETING A RECORD AND BRINGING ONE BACK: THE SOFT DELETE, ITS UNDO, AND WHAT EACH TELLS THE REGISTRY AND THE LISTS.
 * It was moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts. records.ts still calls `deleteRecord` itself, so it imports that one name from here.
 *
 * WHAT STAYED IN records.ts. The guards this code asks, the export and bundle guards above the place it came from, and
 * `DeleteResult`, the shape of a delete's reply. Ten functions gained the export word for the move, because the code here
 * calls them: `isJsonObject`, `checkNobodyIsWritingTheirOwnCredential`, `checkNobodyIsWritingTheirOwnCard`,
 * `checkNobodyIsChangingAStartFolder`, `theOtherAnswersToThisFork`, `refuseAChapterDeletedOrBroughtBackByAnAgent`,
 * `refuseADeleteOfARequestThatWaitsForThePerson` and `refuseADeleteOfAMessageByAnyoneButItsWriter` still in records.ts,
 * and `theBroadcastTimesIn` and `checkNobodyIsChangingBroadcastTimes` now in records/broadcast-settings.ts, which
 * records.ts hands on with `export *`.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER. That is safe for the same reason as records/anchors.ts: every reference
 * this file makes to records.ts is inside a function body, so nothing of records.ts is read while it is still being
 * evaluated. records/reading.ts does not import this file, so `getRecord` is imported from it directly.
 */
import { refuseOrdinaryKnowledgeWrite } from '../../knowledge/guard.ts'
import { and, eq } from 'drizzle-orm'
import { BLOCK_KIND, blockIdsOf } from '@shared/blocks.ts'
import { HANDBOOK_KIND } from '@shared/handbooks.ts'
import { RESOLVES_PROPOSAL, type PanelRecord, type RecordKind } from '@shared/types.ts'
import { theSameStartFolder } from '../../../config/start-folder.mjs'
import { db, sqlite } from '../../db/client.ts'
import { links, records } from '../../db/schema.ts'
import { applyAWaitingStarterChangeForARunEnded, refuseARunEnteringALiveSet } from '../agent-starter.ts'
import { readTheAddedCardsAgainWhenStored } from '../read-the-added-cards-again-when-stored.ts'
import { refuseARestoreThatGivesACardTwoWordRecords } from '../refuse-a-restore-that-gives-a-card-two-word-records.ts'
import { refuseAWriteThatTakesTheWordsOfAnAddedCard } from '../refuse-a-write-that-takes-the-words-of-an-added-card.ts'
import { ROLE_CARD_WORDS_KIND } from '../../db/the-words-records-of-each-card.ts'
import { anyRecordForAgent } from '../../db/any-record-for-agent.ts'
import { announce } from '../events.ts'
import { checkNoDutiesOrDepartmentsRestOn, checkTheDutiesTakenAway, checkTheSecretaryDuties } from '../grant/secretary-duties.ts'
import { SECRETARY_DUTIES_KIND } from '@shared/secretary-duties-record.ts'
import { checkTheDepartment, checkTheDepartmentTakenAway, DEPARTMENT_KIND } from '../grant/departments.ts'
import { checkAHandbookBroughtBack } from '../handbooks.ts'
import { AGENT_KIND } from '../inbox.ts'
import { createRunTokenStore } from '../keyrouter/run-tokens.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { thePartiesOf } from '../messages.ts'
import { PanelError } from '../panel-error.ts'
import { retireThisAgent, whyThisIsNotYoursToRetire } from '../participants.ts'
import { agentForRecord } from '../../db/agent-for-record.ts'
import {
  PROPOSAL_KIND,
  assertMayRemoveAFork,
  assertMayRemoveAnAgent,
  assertMayRemoveAnAsk,
  assertMayRemoveAnExportedBundle,
  assertMayShapeTheFuture,
  assertMayWrite,
  badEntriesOf,
  checkNobodyIsChangingAStartFolder,
  checkNobodyIsChangingBroadcastTimes,
  checkNobodyIsWritingTheirOwnCard,
  checkNobodyIsWritingTheirOwnCredential,
  pipelinesHolding,
  refuseAChapterDeletedOrBroughtBackByAnAgent,
  refuseADeleteOfAMessageByAnyoneButItsWriter,
  refuseADeleteOfARequestThatWaitsForThePerson,
  resolveLinks,
  saveRevision,
  theBroadcastSettingsChangesIn,
  theBroadcastTimesChangeIn,
  theBroadcastTimesIn,
  theForkIsAlreadySettled,
  theOtherAnswersToThisFork,
  type Actor,
  type DeleteResult,
} from '../records.ts'
import { logChange } from '../log-change.ts'
import { noRecordHasThisId } from '../no-record-has-this-id.ts'
import { toRecord } from '../to-record.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { now } from '@shared/now.ts'
import { whatSupersedes } from '../replaced-decisions.ts'
// THE ONE STANDING GROUP FOR THE OWNER AND EVERY SECRETARY. Deleting an agent's record retires its
// registry row directly rather than through the retire door, so this is where that path keeps the
// group in step. `lib/secretariat.ts` imports nothing from here, so there is no loop.
import { bringTheSecretariatGroupInStep } from '../secretariat.ts'
import { TOOL_KIND } from '@shared/tool-kind.ts'
import { refuseARestoreThatWouldShareASlug } from '../refuse-a-restore-that-would-share-a-slug.ts'
import { getRecord } from './reading.ts'

/**
 * RETIRE THE REGISTRY ROW BEHIND AN AGENT RECORD THAT HAS JUST BEEN DELETED, when it was the agent's last live
 * record, and say what happened.
 *
 * IT RETURNS A SENTENCE AND NEVER THROWS. The record is already deleted by the time this runs, and a
 * throw here would report a failed delete for a delete that succeeded — the first invariant read the
 * wrong way round. A row it could not retire is NAMED in the sentence instead, which is the honest
 * answer: the record went and the row did not, and the reader is told which.
 */
function retireTheRowBehind(r: { id: string; title: string; data: unknown }, actor: Actor): string | null {
  const data = r.data
  const handle =
    typeof data === 'object' && data !== null && typeof (data as { handle?: unknown }).handle === 'string'
      ? (data as { handle: string }).handle.trim()
      : ''
  if (handle === '') return 'This agent record names no handle, so there is no registry row to retire.'
  // THE ROW THIS RECORD IS MAPPED TO, read by the record's id. A handle can be borne by a retired row
  // and a live one (criterion I3), so reading by handle could retire an agent this record is not.
  const row = agentForRecord(r.id)
  if (row === null) return `No registry row is joined to this record, so there was none to retire.`
  if (row.retired) return `The registry row "${handle}" was already retired, so nothing was written to it.`
  // AN AGENT WITH ANOTHER LIVE RECORD IS NOT RETIRED. One agent may have a record in several projects, and
  // deleting one of them ends that project's record, not the agent. Retiring it here closed its inbox and its
  // powers while a live record still said it was active.
  const stillHeld = anyRecordForAgent(row.id)
  const other = stillHeld === null ? null : getRecord(stillHeld.record)
  if (other !== null) {
    return (
      `The registry row "${handle}" is not retired, because its agent still has a record that is not deleted: ` +
      `"${other.title}" (${other.id}) in project ${other.workspaceId}. ` +
      'Its broadcast times are read from that record now, and its card and grant are written there. ' +
      'A registry row is retired when the last record of its agent is deleted.'
    )
  }
  try {
    retireThisAgent(row.id, actorAsParticipant(actor), `Its record "${r.title}" was removed.`)
    // AND A SECRETARY WHOSE RECORD WAS REMOVED LEAVES THE SECRETARIAT GROUP. The row above is
    // retired now, so the reconciliation reads it as a non-secretary. It creates no group: the secretariat group is created
    // only at server start or when the first secretary registers.
    bringTheSecretariatGroupInStep()
    return (
      `The registry row "${handle}" is retired with it, so the Embassy folds it away. The row itself is kept, ` +
      'and the handle is free for a new agent.'
    )
  } catch (err: unknown) {
    return `The registry row "${handle}" could not be retired: ${err instanceof Error ? err.message : String(err)}`
  }
}

/** An actor as a participant, or null where it is not one this office can name. */
function actorAsParticipant(actor: Actor): { kind: 'person' | 'agent'; id: string } | null {
  if (actor.type === 'human') return { kind: 'person', id: actor.id }
  if (actor.type === 'agent') return { kind: 'agent', id: actor.id }
  return null
}

export function deleteRecord(id: string, actor: Actor): DeleteResult {
  const r = db.select().from(records).where(eq(records.id, id)).get()
  if (!r) throw noRecordHasThisId(id)
  refuseOrdinaryKnowledgeWrite(r.kind)
  const kind = r.kind as RecordKind
  if (kind === AGENT_KIND && !r.deletedAt) {
    const row = agentForRecord(id)
    if (row !== null && !row.retired) {
      if (anyRecordForAgent(row.id, undefined, id) === null) whyThisIsNotYoursToRetire(row, actor)
    }
  }
  assertMayWrite(kind, 'delete', actor, id)
  // AND IS IT A CHAPTER RECORD. Only the person deletes one, until this door takes a warrant.
  refuseAChapterDeletedOrBroughtBackByAnAgent(r, actor)
  if (kind === SECRETARY_DUTIES_KIND) checkTheDutiesTakenAway({ workspaceId: r.workspaceId, data: r.data, actor, act: 'delete' })
  // A DEPARTMENT IS TAKEN AWAY BY THE WRITERS WHO WRITE IT, and not while another department names it (lib/grant/departments.ts).
  if (kind === DEPARTMENT_KIND) checkTheDepartmentTakenAway({ workspaceId: r.workspaceId, id, data: r.data, actor, act: 'delete' })
  // AND DO A SECRETARY'S DUTIES OR A DEPARTMENT REST ON THIS DECISION. They are changed first, by the person or their
  // secretary, so that none is left naming a decision that is gone (lib/grant/secretary-duties.ts).
  if (kind === DECISION_KIND && !r.deletedAt) checkNoDutiesOrDepartmentsRestOn({ id, title: r.title, workspaceId: r.workspaceId }, 'delete')
  assertMayRemoveAFork({ id, kind, title: r.title }, actor)
  // AND IS IT A MESSAGE SOMEBODY ELSE WROTE, OR A NOTICE FROM THE OFFICE. See the function.
  refuseADeleteOfAMessageByAnyoneButItsWriter(r, actor, 'delete')
  // AND IS IT A REQUEST THAT WAITS FOR THE PERSON. See the function.
  refuseADeleteOfARequestThatWaitsForThePerson(r, actor)
  // AND IS IT AN INTENDED FUTURE. Deleting one takes a future out of the project with one change
  // row and nothing left behind, which is the first of the ten acts. Restoring one is NOT refused,
  // for the same reason restoring a fork is not: it puts the question back in front of the person.
  assertMayShapeTheFuture({ id, kind, title: r.title }, 'delete', actor)
  // AND IS SOMEBODY BEING ASKED SOMETHING ON THIS RECORD. `null` is what says this write is a
  // delete: there is no `data` afterwards, because there is no afterwards.
  assertMayRemoveAnAsk({ id, kind, title: r.title, data: r.data, deletedAt: r.deletedAt }, null, actor)
  // AND IS ANYBODY'S MAIL ADDRESSED TO THIS RECORD. It refuses whoever is asking, because a person
  // deleting an agent with three comments waiting strands them exactly as an agent would.
  assertMayRemoveAnAgent({ id, kind, title: r.title })
  // AND HAS THIS BUNDLE ALREADY HANDED SOMETHING TO AN OUTSIDE AGENT.
  assertMayRemoveAnExportedBundle({ id, kind, title: r.title, data: r.data }, actor)
  // A BLOCK THAT IS STILL IN AN ORDER IS NOT DELETED FROM HERE. Soft-deleting it would leave the
  // pipeline listing an id whose record is gone, which the reader draws as a hole in the order and
  // a person then has to repair by hand. The block route takes it out of one order at a time;
  // the last removal deletes it in the same transaction.
  //
  // EVERY PIPELINE HOLDING IT IS NAMED, because several may list one block since 6 September 2026.
  // A refusal naming one of two would send somebody to take the block out of that one and meet the
  // same refusal again from the other, with no way to see the second coming.
  if (kind === BLOCK_KIND && !r.deletedAt) {
    const holders = pipelinesHolding(id)
    if (holders.length > 0) {
      const where = holders
        .map((one) => `block ${String(blockIdsOf(one).indexOf(id) + 1)} of "${one.title}"`)
        .join(', ')
      throw new PanelError(
        `"${r.title}" is ${where}, and ${holders.length === 1 ? 'that order' : 'each of those orders'} still lists ` +
          `it. Deleting it here would leave a hole that somebody has to repair by hand. Send ` +
          `${holders.map((one) => `DELETE /api/records/${one.id}/blocks/${id}`).join(', ')}. Each takes it out of ` +
          `that pipeline's order; the last one deletes it.`,
      )
    }
  }
  // Every record at the other end of a link, read BEFORE the write, because after it they all
  // point at something deleted and the interesting list is the one this request broke.
  const touched = resolveLinks(id)
    .filter((l) => !l.broken)
    .map((l) => ({ id: l.other.id, kind: l.other.kind, title: l.other.title }))
  const brokenLinksAt = [...new Map(touched.map((t) => [t.id, t])).values()]

  // ALREADY DELETED IS NOT A FAILURE AND IT IS NOT A SUCCESS EITHER. Nothing is written — a second
  // `deletedAt` would move the date of a deletion that happened last week — and the reply says so,
  // the same way a second discharge of one obligation does.
  if (r.deletedAt) {
    const already = toRecord(r)
    return {
      record: already,
      alreadyDeleted: true,
      brokenLinksAt,
      note:
        `"${r.title}" was already deleted, at ${r.deletedAt}, so nothing was written and that date still ` +
        `stands. POST /api/records/${id}/restore brings it back.`,
    }
  }

  // A RECORD THAT HOLDS AN ADDED CARD'S ONLY WORDS GOES ONLY WITH THE CARD. See the function.
  if (kind === ROLE_CARD_WORDS_KIND) refuseAWriteThatTakesTheWordsOfAnAddedCard(r, null)

  // A run keeps tool_uses and test_file_runs as recoverable history: this is a soft delete,
  // so neither the use nor its file results are purged. Restoring the run needs no child writes.
  // ONE TRANSACTION: the stamp, the change row and the revision. A SOFT DELETE WRITES A REVISION and
  // that revision carries `deletedAt` set, because being deleted is a real state of the record —
  // "put this back" needs the state before it, and it needs to be able to say what the deleted state
  // was. Skipping it would leave the one write in the product whose "before" nobody can reach.
  sqlite.transaction(() => {
    db.update(records).set({ deletedAt: now(), updatedAt: now() }).where(eq(records.id, id)).run()
    if (kind === 'session') {
      if (!theRunHasEnded((r.data as Record<string, unknown>)['state'])) applyAWaitingStarterChangeForARunEnded(id, r.data as Record<string, unknown>, r.workspaceId)
      createRunTokenStore(sqlite).revokeRun(id, 'run-deleted')
    }
    logChange(id, 'delete', actor, null, r.title, null)
    saveRevision(id, 'delete', actor)
    if (kind === ROLE_CARD_WORDS_KIND) readTheAddedCardsAgainWhenStored()
  })()
  const after = getRecord(id)
  if (!after) throw new PanelError('The delete did not take effect', 500)
  // A MESSAGE THAT IS DELETED LEAVES EVERY LIST IT WAS IN, so every page is told to read them.
  if (kind === 'message') aMessageLeftOrCameBack(id, r.workspaceId, `The message "${r.title}" was deleted.`)

  /**
   * REMOVING AN AGENT'S RECORD RETIRES ITS REGISTRY ROW.
   *
   * WHAT HAPPENED WITHOUT THIS. An agent's record was removed on the person's instruction on 7 September 2026. The
   * registry row stayed in the Embassy as an active contact, because a record and a
   * registry row are two tables and only the record was touched. The row was meant to go and it
   * was still there, and a reader could not tell a closed test agent from a live one.
   *
   * ONLY WHEN IT WAS THE AGENT'S LAST LIVE RECORD. An agent with a record left in another project is still
   * that agent, and the reply names the record it is read from now.
   *
   * THE ROW IS RETIRED, NOT DELETED, so the handle stays taken and the history stays readable —
   * which is what `retireThisAgent` is for. The reason names the record, so a person reading the row
   * a month from now can see why it went.
   */
  const retired = kind === 'agent' ? retireTheRowBehind(r, actor) : null
  if (kind === 'agent') {
    announce({
      name: 'list.changed',
      workspaceId: r.workspaceId,
      lists: ['participants', 'contacts'],
      about: null,
      groupId: null,
      participant: ((registered) => (registered === null ? null : { kind: 'agent' as const, id: registered.id }))(agentForRecord(r.id)),
      because: `The agent record "${r.title}" was deleted.${retired === null ? '' : ` ${retired}`}`,
    })
  }

  // Named `linkSentence` rather than `links`, because `links` is the table this module imports and
  // a local of that name would shadow it for anyone editing this function later.
  const linkSentence =
    brokenLinksAt.length === 0
      ? `Nothing links to it.`
      : `The ${brokenLinksAt.length} ${brokenLinksAt.length === 1 ? 'link' : 'links'} to it ` +
        `${brokenLinksAt.length === 1 ? 'is' : 'are'} kept and now drawn as broken, on: ` +
        `${brokenLinksAt.slice(0, 10).map((o) => `"${o.title}"`).join(', ')}` +
        `${brokenLinksAt.length > 10 ? `, and ${brokenLinksAt.length - 10} more` : ''}.`
  return {
    record: after,
    alreadyDeleted: false,
    brokenLinksAt,
    note:
      `The ${kind} "${r.title}" is deleted, which in Mole Office means marked and kept: it is out of ` +
      `GET /api/records and every page built from it, and the change log still says it existed. ${linkSentence} ` +
      `POST /api/records/${id}/restore brings it back exactly as it was.` +
      (retired === null ? '' : ` ${retired}`),
  }
}

/**
 * Undo a soft delete.
 *
 * GUARDED FOR THE SAME REASON AS deleteRecord, and it is not the smaller half of the pair.
 * Bringing a decision back is putting it in front of the reader again as current, and a human who
 * deleted one meant it to be gone. An agent that could restore could undo that judgement without
 * being able to argue for it, which is exactly what the human-only rule exists to prevent.
 *
 * THE HTTP ROUTE ASKS THE SAME GUARD FIRST. `POST /api/records/:id/restore` in api/records.ts
 * calls `assertMayWrite` before its own shortcut for a record that was never deleted, so a caller
 * that may not restore the kind, such as an agent asking about a decision with no grant or raise
 * behind it, is refused with a 403 whether or not the record is deleted. When
 * the caller may write the kind and the record is not deleted, the route answers with the record
 * and never calls this function, so no change row is written. The route's own comment gives the
 * reason for that order.
 */
export function restoreRecord(id: string, actor: Actor): PanelRecord {
  const existing = db.select().from(records).where(eq(records.id, id)).get()
  if (!existing) throw noRecordHasThisId(id)
  refuseOrdinaryKnowledgeWrite(existing.kind)
  const kind = existing.kind as RecordKind
  // WHO MAY WRITE THIS KIND, asked through `assertMayWrite` and not restated here. The local copy
  // this replaces asked only about `actor.type`, so a request that sent no actor headers could bring
  // a decision back — owner decision §36 says a governance act needs a person who said so.
  assertMayWrite(kind, 'restore', actor, id)
  // AND IS IT A MESSAGE SOMEBODY ELSE WROTE, OR A NOTICE FROM THE OFFICE. See the function.
  refuseADeleteOfAMessageByAnyoneButItsWriter(existing, actor, 'bring back')
  if (!existing.deletedAt) return toRecord(existing) // already live; nothing to undo
  // AND IS IT A CHAPTER RECORD. Only the person brings one back, as only the person deletes one.
  refuseAChapterDeletedOrBroughtBackByAnAgent(existing, actor)
  // A TOOL COMES BACK ONLY WHILE NO LIVE TOOL HOLDS ITS SLUG. See the function.
  if (kind === TOOL_KIND) refuseARestoreThatWouldShareASlug(existing)
  // A CARD'S WORDS COME BACK ONLY WHILE THE CARD HAS NO LIVE ONES. See the function.
  if (kind === ROLE_CARD_WORDS_KIND) refuseARestoreThatGivesACardTwoWordRecords(existing)
  // AN IN-USE HANDBOOK ON A ROLE CARD COMES BACK UNDER THE CARD RULE. See the function.
  if (kind === HANDBOOK_KIND) checkAHandbookBroughtBack(existing, actor)
  // AN AGENT RECORD COMES BACK ONLY WITH THE CARD AND TIMES ITS AGENT HOLDS NOW. See the function.
  if (kind === AGENT_KIND) refuseARestoreThatBringsBackACardOrTimes(toRecord(existing), actor)
  // DUTIES COME BACK THROUGH THE WHOLE WRITE GUARD, including the check for another live record.
  if (kind === SECRETARY_DUTIES_KIND) checkTheSecretaryDuties({ workspaceId: existing.workspaceId, data: existing.data, before: null, mine: id, actor })
  // A DEPARTMENT COMES BACK THROUGH THE WHOLE WRITE GUARD, so a code or a supervisor taken meanwhile is not held twice.
  if (kind === DEPARTMENT_KIND) checkTheDepartment({ workspaceId: existing.workspaceId, data: existing.data, before: null, mine: id, actor })
  // A PIPELINE COMES BACK ONLY WITH A LIST A WRITE WOULD TAKE: a block it lists may have been deleted or moved while it was gone.
  if (kind === 'pipeline') {
    const [bad] = badEntriesOf(existing.workspaceId, blockIdsOf(toRecord(existing)), (entry) => db.select().from(records).where(eq(records.id, entry)).get())
    if (bad !== undefined) {
      const listing = `Bringing this pipeline back would make it list "${bad.id}"`
      const patch = `PATCH /api/records/${id} {"dataPatch":{"blockIds":[...]}}, then bring the pipeline back.`
      if (bad.wrong === 'twice') throw new PanelError(`${listing} twice. Nothing was written. Take one of the two out of the list first with ${patch}`)
      if (bad.wrong === 'missing') throw new PanelError(`${listing}, an id no record holds. Nothing was written. Take it out of the list first with ${patch}`)
      if (bad.wrong === 'notABlock') throw new PanelError(`${listing}, a record that is not a block. Nothing was written. Take it out of the list first with ${patch}`)
      if (bad.wrong === 'deleted') {
        throw new PanelError(
          `${listing} ("${bad.row.title}"), a block that was deleted on ${bad.row.deletedAt}. Nothing was written. Bring the ` +
            `block back first with POST /api/records/${bad.id}/restore, then bring the pipeline back.`,
        )
      }
      throw new PanelError(
        `${listing} ("${bad.row.title}"), a block of the project "${bad.row.workspaceId}", while this pipeline is in ` +
          `"${existing.workspaceId}". Nothing was written. Move the block back first with POST /api/records/${bad.id}/workspace ` +
          `{"to":"${existing.workspaceId}"}, then bring the pipeline back.`,
        409,
      )
    }
  }
  sqlite.transaction(() => {
    if (kind === 'session') refuseARunEnteringALiveSet(id, null, existing.data)
    db.update(records).set({ deletedAt: null, updatedAt: now() }).where(eq(records.id, id)).run()
    // A DECISION COMES BACK ONLY WHILE NO OTHER DECISION STANDS ON A FORK IT SETTLED. See the function. Asked here, once
    // the row is live again and before anything else is written, so a refusal takes the row back with it.
    if (kind === DECISION_KIND) refuseARestoreThatGivesAForkASecondAnswer(existing)
    logChange(id, 'update', actor, 'deletedAt', existing.deletedAt, null)
    // `update` and not `restore`. `restore` in the ledger means putting an EARLIER REVISION'S
    // CONTENT back; this undoes a soft delete and changes nothing else about the record, which is
    // the ordinary write the change row above already calls an update. Using the same word for both
    // would make "what kind of write was this" unanswerable from the ledger.
    saveRevision(id, 'update', actor)
    if (kind === ROLE_CARD_WORDS_KIND) readTheAddedCardsAgainWhenStored()
  })()
  const restored = getRecord(id)
  if (!restored) throw new PanelError('Restore did not take effect', 500)
  if (kind === 'message') aMessageLeftOrCameBack(id, existing.workspaceId, `The message "${existing.title}" was brought back.`)
  return restored
}

/**
 * A DELETED AGENT RECORD DOES NOT BRING BACK A CARD, A GRANT OR BROADCAST TIMES ITS AGENT NO LONGER HOLDS.
 *
 * The record comes back exactly as it was, and it is its agent's record again at once: the broadcast times are read off
 * the agent's first-filed live record, and the next write to any of its records copies its card and grant to the
 * registry row. So it is measured against the agent's record in use now, by the same two guards a write meets, and
 * refused in their words with a sentence saying why a restore is asked. An agent with no other record left has nothing
 * to measure against, and its record comes back.
 *
 * THE TIMES AND STAMP ARE ASKED OF A RECORD THAT WOULD BE READ, OR HOLDS EITHER VALUE OF ITS OWN.
 * Any other record brings neither back and would not be read.
 *
 * NOR A CREDENTIAL OR A START FOLDER, asked by the same two guards a write meets.
 *
 *   - THE CREDENTIAL IS MEASURED AGAINST THE REGISTRY ROW, which keeps the one the registration came in on. The
 *     next write to the record copies a credential to the row, so a record holding another one would hand the agent
 *     a credential the owner never confirmed for it. The row is there whether or not another record is, so this is
 *     asked with no early return.
 *   - A START FOLDER IS MEASURED AGAINST THE AGENT'S OTHER LIVE RECORDS. Every live record's folder names the agent
 *     in a session that starts there (`agentsStartingIn`), so a restore that brings back a folder none of them holds
 *     adds one, and only the person or the folder's own door may do that. Here THERE IS NO EARLY RETURN EITHER. An
 *     agent with no other live record holds no folder now, and the folder this would bring back is one the delete
 *     took away. The person may bring it back.
 */
function refuseARestoreThatBringsBackACardOrTimes(coming: PanelRecord, actor: Actor): void {
  const agent = agentForRecord(coming.id)
  // A RECORD NO ROW MAPS is nobody's yet, and the handle write that maps it meets every guard.
  if (agent === null) return
  inTheWordsOfARestore('and its registry row holds another credential.', () =>
    checkNobodyIsWritingTheirOwnCredential(coming.data, { credential: agent.credential ?? undefined }),
  )
  const folder = isJsonObject(coming.data) ? coming.data['startFolder'] : undefined
  if (typeof folder === 'string' && folder !== '') {
    const heldElsewhere = theStartFoldersOfTheOtherLiveRecords(agent.id, coming.id).some((one) => theSameStartFolder(one, folder))
    inTheWordsOfARestore('and none of its other live records holds that start folder.', () =>
      checkNobodyIsChangingAStartFolder(coming.data, { startFolder: heldElsewhere ? folder : undefined }, actor),
    )
  }
  const inUse = anyRecordForAgent(agent.id)
  const held = inUse === null ? null : getRecord(inUse.record)
  if (held === null) return
  // Times are read off the first-filed live record. Ask also about any record holding its own times or stamp.
  const readAfter = anyRecordForAgent(agent.id, coming.id)
  const bringsTimes = readAfter?.record === coming.id || theBroadcastTimesIn(coming.data) !== null ||
    theBroadcastTimesChangeIn(coming.data) !== undefined || theBroadcastSettingsChangesIn(coming.data) !== undefined
  inTheWordsOfARestore("and the agent's record in use now holds something else.", () => {
    checkNobodyIsWritingTheirOwnCard(coming.data, held.data, actor)
    if (bringsTimes) checkNobodyIsChangingBroadcastTimes(coming.data, held.data, actor)
  })
}

/**
 * A DECISION BROUGHT BACK IS NOT A SECOND ANSWER TO A FORK IT SETTLED. While it was deleted, another decision may have
 * settled the same fork: a deleted decision stands on nothing, so the links door let that one through. Bringing the
 * first one back would leave two decisions standing on one fork, which the links door refuses. So the restore door
 * refuses it too, in the same words (`theForkIsAlreadySettled`).
 *
 * IT IS ASKED ONCE THE DECISION IS LIVE AGAIN, so its own `supersedes` links count as they will once it is back. A
 * decision filed by choosing again comes back after a delete and replaces the first one again. A decision another one
 * replaced comes back still replaced. Neither is a second answer, because each is on the line of replacements of the
 * one that stands, and `whatSupersedes` reads that line.
 */
function refuseARestoreThatGivesAForkASecondAnswer(decision: { id: string; title: string }): void {
  const stands = whatSupersedes(decision.id)?.id ?? decision.id
  const settled = db
    .select({ fork: records })
    .from(links)
    .innerJoin(records, eq(links.toId, records.id))
    .where(and(eq(links.fromId, decision.id), eq(links.type, RESOLVES_PROPOSAL)))
    .all()
  for (const { fork } of settled) {
    if (fork.kind !== PROPOSAL_KIND) continue
    const standing = theOtherAnswersToThisFork(fork, stands)
    if (standing.length > 0) throw theForkIsAlreadySettled(fork, standing, { by: 'restore', decision })
  }
}

/** Ask one guard for a restore, and say in its refusal why a restore is asked. `why` ends the first sentence. */
function inTheWordsOfARestore(why: string, ask: () => void): void {
  try {
    ask()
  } catch (err) {
    if (!(err instanceof PanelError)) throw err
    throw new PanelError(`Bringing this agent record back would put what it holds back on its agent, ${why} ${err.message}`, err.status)
  }
}

/** The start folders the other live agent records of one registry row hold, as they are stored. */
function theStartFoldersOfTheOtherLiveRecords(agentId: string, exceptRecordId: string): string[] {
  const rows = sqlite
    .prepare(
      "SELECT json_extract(r.data, '$.startFolder') AS folder FROM agent_records m JOIN records r ON r.id = m.record_id " +
        "WHERE m.agent_id = ? AND r.id <> ? AND r.deleted_at IS NULL AND r.kind = 'agent' AND json_valid(r.data)",
    )
    .all(agentId, exceptRecordId) as { folder?: unknown }[]
  return rows.flatMap((row) => (typeof row.folder === 'string' && row.folder !== '' ? [row.folder] : []))
}

/**
 * TELL THE MESSAGE'S PARTIES AND THE OWNER THAT A MESSAGE LEFT THE LISTS OR CAME BACK TO THEM.
 *
 * A deleted message may have been the last line of a contact row, of a conversation between agents or
 * of a group, and it may have been counted as unread. Working out which rows it was in again would be
 * the list doors' work done a second time, and deleting a message is rare, so the pages told read
 * those lists. The sentence names the message, so it goes where every other event about that
 * message goes: to its parties and the owner, and to no other page.
 */
function aMessageLeftOrCameBack(messageId: string, workspaceId: string, because: string): void {
  announce(
    {
      name: 'list.changed',
      workspaceId,
      lists: ['contacts', 'betweenAgents', 'groups', 'theOpenConversation'],
      about: null,
      groupId: null,
      because,
    },
    null,
    thePartiesOf(messageId),
  )
}
