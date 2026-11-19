// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW IS A COLLECTION, AND THE COLLECTION HAS A BOUNDARY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A REVIEW IS
 * ---------------------------------------------------------------------------------------
 *
 * Somebody started collecting remarks, from somewhere, and these are the ones in it.
 *
 * That is the whole of it. It is not a switch, not a mode, and not a conversation. Round seven
 * stored a review as two values in a browser's own storage — whether review mode was on, and which
 * conversation the comments were going into — with no project in it. So it could not be listed, it
 * could not say where it had been started from, a second browser knew nothing about it, and it went
 * away with the tab. `src/server/db/schema.ts` holds the row that replaces it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT COUNTS AS INSIDE IS DERIVED, NOT CHOSEN FROM A MENU
 * ---------------------------------------------------------------------------------------
 *
 * A person never picks a scope. They start a review from wherever they are standing, and where they
 * were standing is what decides what collects. Started from a module, that module's work collects.
 * Started from a plan line, that plan collects. Started from a page with nothing precise under the
 * pointer, the project collects, because the project is the only thing Mole Office can honestly say that
 * person was looking at.
 *
 * So there is no global review and no local review, and no component of either name. There is ONE
 * mechanism and the entry point is a value: `scopeOf` below turns the entry into a scope, and
 * `insideScope` answers whether one remark is in it.
 *
 * WHAT "RELATED TO THE ENTRY" MEANS HERE, AND WHAT IT DELIBERATELY DOES NOT MEAN, is argued in full
 * on `insideScope`. The short version: containment, and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * TWO BOUNDARIES, AND THE GAP BETWEEN THEM IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 *     remarks -> Finish collecting -> organised -> the person corrects it -> Send -> agent work
 *
 * Round seven had ONE boundary and sent at it. Here, FINISHING COLLECTING FREEZES THE MEMBERSHIP
 * and sends nothing. That matters because membership is otherwise a live question: a `part_of` link
 * written today changes what is inside a collecting review, which is right while somebody is still
 * collecting, and must not be true afterwards. A link made next week cannot change what last week's
 * review contained.
 *
 * NOTHING HERE ORGANISES AND NOTHING HERE SENDS. Both are refused by name, saying what does not
 * exist yet, rather than being quietly accepted into a state nothing can act on.
 *
 * ---------------------------------------------------------------------------------------
 * LEAVING STOPS COLLECTING THERE. IT DOES NOT END THE REVIEW
 * ---------------------------------------------------------------------------------------
 *
 * There is no `pause` here and no `paused` column, and their absence is the design rather than a
 * gap. A review collects what is written INSIDE ITS SCOPE. Walk away from that scope and what you
 * write next is not inside it, so nothing collects; come back and it does again. That is exactly
 * "leaving stops collecting there, and coming back resumes", and it needs no bookkeeping that a
 * browser could crash in the middle of.
 *
 * A review is never deleted here and is never sent by itself.
 */

import {
  checkSubtraction,
  COMMENTS_NOT_IN_BUCKET_WORDS,
  type LeftOutCounts,
  type LeftOutGroup,
  type ReviewListBucket,
  type CommentsNotInBucket,
  REVIEW_LIST_BUCKET_WORDS,
  leftOutWords,
} from '@shared/disclosure.ts'
import { createHash } from 'node:crypto'
import { and, eq, inArray, isNotNull, notInArray, or, sql } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { nothingWrittenSentence } from './records/patching.ts'
import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { agentMessages, agentThreads, links, messageDelivery, records, reviews } from '../db/schema.ts'
import {
  idsOfTarget,
  nameTarget,
  spanNamedBy,
  targetFromAttributeValue,
  targetKey,
  targetSpec,
  type Context,
  type Target,
  type TargetKind,
  WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY,
  WHY_A_DRAFT_IS_NOT_ON_THE_SERVER,
} from '@shared/targets.ts'
import { CONTAINMENT_LINK, MAX_CONTAINMENT_DEPTH, descendantsOf, type ContainmentContext, type ContainmentGap, type ContainmentLink, type WalkStop } from '@shared/containment.ts'
import { storedEntries } from '@shared/blocks.ts'
import type { PanelRecord } from '@shared/types.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { WHAT_THE_NOT_IN_READING_LEAVES_OUT } from '@shared/review-pane-words.ts'
// THE ONE TABLE BETWEEN WHAT MOLE OFFICE STORES AND WHAT A PERSON READS. Every sentence this file writes
// is drawn in the review pane, so a stored state word may not reach one of them as itself.
import { kindWord, stateWord } from '@shared/words.ts'
// TALKING TO AN AGENT, WHICH IS WHAT SENDING A REVIEW IS. Nothing here writes a run, and the send asks
// `dispatchThread` for none: `sendReview` writes the comments into one conversation, has dispatch work
// out who each goes to, and gives each recipient one message in the message pool.
import {
  addMessage,
  createThread,
  dispatchThread,
  proofForStartingANewAgent,
  enoughOfIt,
  readContext,
  readDelivery,
  readThread,
  theThreadsThisReaderMayRead,
  type AgentMessageView,
  type ContextReading,
  type DeliveryReading,
  type Held,
  type MessageInput,
} from './agents.ts'
import { getPlan } from './get-plan.ts'
import { assertMayWrite, createRecord, deleteRecord, getRecord, listRecords, patchRecord, whoFiled, type Actor } from './records.ts'
import { now } from '@shared/now.ts'
import { PanelError } from './panel-error.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentAStoredIdNames } from './the-agent-a-stored-id-names.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theModelOnTheAgentRecord } from '../db/the-model-on-the-agent-record.ts'
import { justThisProject } from '@shared/which-projects.ts'
import { withDispatchedAgentKeys } from '../db/with-dispatched-agent-keys.ts'
import { aMessageHasGoneOut, alreadyHandedOver, archiveDeliveries, commentRecordsIn, isAComment, readMessage, theAgentASessionAnswersAs } from './messages.ts'
import { projectsOfAgent } from '../db/projects-of-agents.ts'
import { theProjectsAReaderMayRead } from '../db/the-projects-a-reader-may-read.ts'
import { sentWhenWritten } from './message-pool-at-or-after.ts'
import { theRegistryIdsOf } from './registry-aliases/stamps.ts'
import { gatePosition } from '../../config/settings.mjs'
// WHO MAY READ WHICH MESSAGE. The one rule is wave 13j's, in lib/messages.ts
// and, for the conversations the person has with agents, lib/agents.ts. This file only asks it.
import { theMessageReader, theMessagesHiddenFrom, type AMessageReader } from './messages.ts'
// WHO A COMMENT'S OWN WORDS NAME. One matcher, in the file that owns the question, and it answers
// "one agent", "several" or "none" rather than picking.
import { resolveRecipient, withOneReadingOfRecipients } from './recipients.ts'
// WHERE A COMMENT HAS GOT TO, from the one store. Nothing in this file reads or writes the record's
// own `state` field any more; both questions — has this gone out, and how far — are answered here.
import { carriedComments, commentsGoneOut, dispatchOf, hasGoneOut } from './dispatch.ts'
import { whoWroteRecords } from '../db/who-wrote-records.ts'
import { checkContext, contextAsStored } from './targets.ts'
// THE ONE READ, called and not re-implemented. See `restrictionsForComment`.
import { restrictionsOn, restrictionsWithinOneRead, type RestrictionReading } from './restrictions.ts'
import {
  TAKEN_OUT_BECAUSE,
  UNREADABLE,
  readFrozen,
  writeFrozen,
  type FrozenExclusion,
  type FrozenMember,
  type FrozenMembership,
  type MemberSource,
  type NotInItClause,
  type TakenOut,
  type TakenOutBecause,
} from './frozen-membership.ts'
// WHAT MOLE OFFICE MADE OF THE COMMENTS. The interpreter's own file holds what is asked, what is
// accepted back and where a reading is kept; this file holds the review it is a reading OF.
import {
  NOTHING_HAS_READ_THEM,
  askedOf,
  checkAnswer,
  keepReadings,
  type CommentToRead,
  type InterpreterRequest,
  type KeptReadings,
} from './interpret.ts'
import { theCommentsYouMayRead, whatOnlyAPersonMayWrite, type Organised, type OrganisedGroup } from '@shared/intent.ts'
// WHETHER A REVIEW CAN BE SENT. Declared in @shared/readiness.ts, because it needs no database and
// because a browser drawing the answer must compute the same one from the same reply rather than
// keeping a second opinion. Re-exported below so every reader keeps one name for it.
import { READINESS, readinessOf, type Readiness, type ReviewReadiness } from '@shared/readiness.ts'
// THE WORD ON THE PRESS, read from the one place that holds it, so a refusal that tells somebody
// what to press names the press they will actually see. These sentences used to name a raw API
// route to a person reading a screen, which is invariant 7 of USER.md.
import { REVIEW_STATES as REVIEW_VOCABULARY } from '@shared/states.ts'
// THE PANEL'S OWN PRESS, named from the one place that holds its label, so a sentence telling
// somebody what to press cannot drift from the press itself.
import { CHAT_WORDS, sameParticipant } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { gateMet } from './gate-counts.ts'
import {
  sayTheKeptReading,
  sayTheLine,
  sayThePlan,
  sayTheSend,
  sayTheTakeOut,
  type KeptReadingFacts,
  type SendFacts,
  type SendPlanFacts,
  type SendPlanSentence,
  type TakeOutFacts,
} from '@shared/send-plan-words.ts'

/**
 * What `createdBy` says when the ledger holds nothing saying who wrote a remark.
 *
 * It is a sentence rather than an empty string, because a blank in that place reads as a person
 * whose name did not render. Nothing is ever a member on the strength of this: membership needs the
 * author to be the person who started the review, and this is not anybody.
 */
const NOBODY_RECORDED = 'nobody recorded who wrote this'

// ============================================================================ the words

/**
 * WHERE A REVIEW STANDS. Five words, and the two boundaries sit between the first four.
 *
 * `collecting` — somebody is collecting. What is inside is a live question.
 * `collected`  — collecting has finished and the membership is written down. Nothing has been sent.
 * `organised`  — something has read the remarks and made an organised reading of them.
 * `sent`       — the review has gone to somebody.
 * `abandoned`  — somebody ended it. The membership is written down, nothing was sent, and nothing
 *                more will be. It is still readable and still listed.
 *
 * EVERY TRANSITION IS BUILT NOW, AND NONE OF THEM IS A WORD SOMEBODY SETS. `finishCollecting`
 * writes `collected`, `keepOrganised` writes `organised` when a reading was stored beside at least
 * one comment, `sendReview` writes `sent` when the comments have gone and nothing was left
 * waiting, and `abandonReview` writes `abandoned`. `setState` refuses all five by name and says
 * which act does the work, because accepting a word and doing nothing would leave a review saying
 * it was sent with nothing having been sent.
 *
 * WHY THERE IS A FIFTH ONE AT ALL. Until 20 August 2026 nothing ended a collecting review except
 * the irreversible finish. That was survivable while collecting was a dot ten pixels across; it
 * stops being survivable the moment collecting draws a frame round the whole application, because
 * then a review started by accident frames Mole Office for ever and the only ways out are an
 * irreversible act or turning the frame off in Settings for every future review as well.
 */
export const REVIEW_STATES = ['collecting', 'collected', 'organised', 'sent', 'abandoned'] as const
export type ReviewState = (typeof REVIEW_STATES)[number]

/**
 * THE STATES IN WHICH A REVIEW HAS ENDED: it will send nothing more. Said here once, and read by
 * `reviewHasEnded` wherever a reading asks whether a review can still send a comment.
 *
 * `sent` has sent what it is going to send, and its send refuses a second press with 409.
 * `abandoned` was ended without sending, and its send refuses too.
 *
 * WHY IT MATTERS. A review in one of these states must not list a comment as `Saved, not sent`, and
 * must not hold one back from the message worker. Before 2 October 2026 a sent review did both: a
 * comment it had left as `Earlier` was listed under it, the column said "Goes with the review", the
 * worker held it for that review, and the review refused to be sent again. So the screen promised a
 * delivery that could never happen (check 9K27DM6LOr_Z, the case of problem 342gEXEpJ20R).
 */
export const ENDED_REVIEW_STATES: readonly ReviewState[] = ['sent', 'abandoned']

/** Whether a review in this state has ended, so that it sends nothing more. See `ENDED_REVIEW_STATES`. */
export function reviewHasEnded(state: string): boolean {
  return (ENDED_REVIEW_STATES as readonly string[]).includes(state)
}

/**
 * HOW WIDE A REVIEW IS: the two answers, and one of them is stored on every review.
 *
 * `local` is what every review in this product was until round ten: what it collects is worked out
 * from `entry`, where the person was standing. `global` is the whole project, and `entry` is not
 * read at all — `scopeOf` answers before it reaches the map of targets.
 *
 * ONE FIELD RATHER THAN TWO KINDS, because a project-wide review has the same members, the same
 * freeze, the same routing and the same pane as a local one. Exactly one predicate differs.
 *
 * AT MOST ONE PROJECT-WIDE REVIEW COLLECTS PER PROJECT, and the database holds that rather than this
 * file: `reviews_one_global_collecting` is a partial unique index created by window B's reach step.
 * `startReview` asks first so the person gets a sentence naming who holds it, and the index is what
 * makes the answer true when two presses land in the same millisecond.
 */
export const REVIEW_REACHES = ['local', 'global'] as const
export type ReviewReach = (typeof REVIEW_REACHES)[number]

/**
 * At most this many REVIEWS come back in one list, and the reply says how many it left out.
 *
 * IT IS NOT A CAP ON WHAT A REVIEW HOLDS, and it was one until 19 August 2026. `membersOf` ended
 * with `slice(0, MAX_ROWS)` and *Finish collecting* wrote that slice down as the membership, so a
 * review of 205 remarks froze holding 200 with nothing said — and because every remark written in
 * one second ties on `created`, the tie-break was the nanoid, so WHICH 200 survived was decided by
 * random bytes. A cap on what a list shows is reasonable. A cap on what a collection CONTAINS is
 * losing somebody's words at the one moment the product promises to keep them.
 */
export const MAX_ROWS = 200

// ============================================================================ what counts as inside

/**
 * The kinds of thing a review can be scoped to.
 *
 * These are NOT the things a person can point at. They are the containers those things live in: a
 * remark on a block of a report, on a cell of its table and on the report itself are all
 * inside the same review, because all three are about one record.
 *
 * `gone` IS NOT A CONTAINER. It is what Mole Office answers when it cannot work the scope out at all —
 * the comment a review was started from has been deleted, say. Nothing is inside it, and the review
 * still reads, still lists and still says what happened. See `scopeOf`.
 */
export type ReviewScopeKind = 'record' | 'plan' | 'window' | 'conversation' | 'project' | 'gone'

/** What counts as inside one review. Worked out from its entry on every read, never stored. */
export interface ReviewScope {
  kind: ReviewScopeKind
  /** The record id, plan id, window id or conversation id. Empty on a whole-project scope. */
  id: string
  /** What is inside, in one sentence a person reads. */
  says: string
  /**
   * Everything this scope could not work out, named. Empty means nothing was left out.
   *
   * A containment walk stops on a loop or at its depth limit, and a module's checklist lines are
   * not records so nothing can be linked to them. Both are reported rather than quietly narrowing
   * what a review collects.
   */
  gaps: string[]
  /**
   * THE SAME GAPS, EACH AS A CODE WITH ITS NUMBERS, so a page draws them in its reader's language (wave 13r round 18).
   *
   * `gaps` is these gaps' `says`, worked out from this list in one place (`scopeOf`). A page shows `says` only in
   * Developer mode (decision z_A0xVMbWOzh). A number is the only value: the ids are in `says`.
   *
   * IT MAY BE MISSING: an answer made before it existed does not carry it, and a page draws `gaps` then, the
   * server's own sentences, rather than no gaps at all.
   */
  gapForms?: ScopeGap[]
  /**
   * `says` AS A CODE WITH ITS NUMBER, so a page draws it in its reader's language (wave 13r round 19). The page's
   * words are `review.scopeSays.<code>` in src/shared/words, and the server's sentence is drawn in Developer mode
   * only (decision z_A0xVMbWOzh). It names no id, and it says nothing about what happened to the record the review
   * was started from: the `recordGone` or `recordDeleted` gap below it says that, once.
   *
   * IT MAY BE MISSING, as `gapForms` may, and a page then draws `says`.
   */
  saysForm?: ScopeSays
}

/**
 * WHAT A SCOPE HOLDS, AS A CODE. `projectAsked` is a project-wide review somebody asked for, and `projectFromPage`
 * one started from a page with nothing more precise under the pointer. `gone` is a scope Mole Office could not work
 * out, and its gap says why. `record` is a record named by its `title`, with `n` records stored as part of it, and
 * `recordAlone` one with none. `recordMissing` is a record Mole Office no longer has, so it has no title to name.
 */
export interface ScopeSays {
  code: 'projectAsked' | 'projectFromPage' | 'gone' | 'plan' | 'window' | 'conversation' | 'record' | 'recordAlone' | 'recordMissing'
  values: { n?: number; title?: string }
}

/**
 * ONE THING ABOUT A REVIEW'S SCOPE MOLE OFFICE COULD NOT WORK OUT: its code, its numbers and the server's own
 * sentence. The page's words for each code are `review.scopeGap.<code>` in src/shared/words.
 *
 * The first eight are why no scope could be worked out at all (the review's scope is `gone`). `recordGone` and
 * `recordDeleted` are what happened to the record it was started from. The last eight are the containment walk's
 * own gaps and stops (src/shared/containment.ts).
 */
export interface ScopeGap {
  code:
    | 'noMessage' | 'noConversation' | 'otherProject' | 'partOfTheScreen' | 'aPage' | 'anAction' | 'aDraft' | 'namesNoRecord'
    | 'recordGone' | 'recordDeleted'
    | ContainmentGap['code'] | WalkStop
  values: { n?: number; position?: number; first?: number }
  says: string
}

/** A refusal to work out a scope, with its code and its sentence. */
const refusal = (code: ScopeGap['code'], says: string): { refused: ScopeGap } => ({ refused: { code, values: {}, says } })

/** Turning one entry into a scope, or saying why Mole Office cannot. */
type ScopeReader<K extends TargetKind> = (
  target: Extract<Target, { kind: K }>,
  workspaceId: string,
) => { scope: Omit<ReviewScope, 'says' | 'gaps'> } | { refused: ScopeGap }

/**
 * DOES THIS TARGET BELONG TO A DIFFERENT PROJECT? Only `true` when something in this database says
 * so.
 *
 * A plan, a block on the week and a page belong to no project at all — `PERSON_LEVEL_TABLES` in
 * src/server/db/schema.ts says which tables those are — so they are never in ANOTHER project and
 * this answers false for them. The two that do carry a project answer from where it is written
 * down: a record carries its own, and a message carries its thread's, one row along.
 */
function inAnotherProject(target: Target, workspaceId: string): boolean {
  // A MESSAGE IS IN NO PROJECT, as a decision says; problem rJzSELmOPUas: it is kept in the
  // message centre, so pointing at one from any project's page is never pointing into another project. Asked first, of
  // the record itself, because a page may still name the project the message used to be filed in.
  const named = recordNamedBy(target)
  const record = named === null ? null : getRecord(named)
  if (record !== null && record.kind === 'message') return false
  // A RECORD TARGET SAYS WHICH PROJECT IT IS IN, and the record itself says so too. Both are asked:
  // the first answers without a lookup, and the second is the one that is actually true.
  if (target.kind === 'record' && target.workspaceId !== workspaceId) return true
  if (named !== null) return record !== null && record.workspaceId !== workspaceId
  if (target.kind === 'agentMessage') {
    const row = db
      .select({ workspaceId: agentThreads.workspaceId })
      .from(agentMessages)
      .innerJoin(agentThreads, eq(agentMessages.threadId, agentThreads.id))
      .where(eq(agentMessages.id, target.messageId))
      .get()
    return row !== undefined && row.workspaceId !== workspaceId
  }
  return false
}

/** The record a target names, read off the declaration rather than from a second list of keys. */
function recordNamedBy(target: Target): string | null {
  const key = targetSpec(target.kind).recordIdentifier
  if (key === null) return null
  const id = (target as unknown as Record<string, string>)[key]
  return id === undefined || id === '' ? null : id
}

/**
 * WHERE A REVIEW STARTED FROM, TURNED INTO WHAT IT COLLECTS. A total map over the vocabulary.
 *
 * It is total for the reason `TARGET_READERS` in ./targets.ts is: a fourteenth thing a person can
 * point at does not compile until somebody has said what starting a review from one would collect.
 * There is no default arm, so no entry can silently fall through to "the whole project" — which is
 * the widest answer there is and the worst one to reach by accident.
 *
 * THE SIX KINDS THAT NAME A RECORD ALL GO THROUGH `recordNamedBy`, which reads the declaration's
 * own `recordIdentifier`. Writing `target.recordId` in each of those arms would be a second copy of
 * a fact the declaration already states.
 */
const SCOPE_READERS: { [K in TargetKind]: ScopeReader<K> } = {
  record: (target) => byRecord(target),
  reportBlock: (target) => byRecord(target),
  // A PART OF A REPORT COLLECTS THE REPORT, exactly as a block of one does. A region is a paragraph,
  // a row or a section of a record's own writing, so the thing the person was reading is the record.
  // Collecting the paragraph alone would be a review of one paragraph, which is not a review of
  // anything anybody can act on.
  region: (target) => byRecord(target),
  // A CHANGE COLLECTS THE RECORD IT WAS MADE TO, for the same reason a part of a report does: the
  // ledger row is where the person was standing and the record is the thing they were reading. A
  // review of one write to one field is not a review of anything anybody can act on.
  change: (target) => byRecord(target),
  tableRow: (target) => byRecord(target),
  tableCell: (target) => byRecord(target),
  graphNode: (target) => byRecord(target),
  annotation: (target) => byRecord(target),

  // A LINE OF A PLAN COLLECTS THE PLAN, for the same reason a block of a report collects the report:
  // the line is where the person was standing and the plan is the thing they were reading.
  plan: (target) => ({ scope: { kind: 'plan', id: target.planId } }),
  planLine: (target) => ({ scope: { kind: 'plan', id: target.planId } }),
  // A FACT BESIDE A LINE COLLECTS THE PLAN TOO: it is drawn on the same row as its line.
  planLineFact: (target) => ({ scope: { kind: 'plan', id: target.planId } }),

  // A BLOCK ON THE WEEK HOLDS NOTHING ELSE, so the scope is that one block. A review started from
  // one collects remarks about it and about nothing else, which is a narrow scope and an honest one.
  scheduleBlock: (target) => ({ scope: { kind: 'window', id: target.windowId } }),

  // A MESSAGE COLLECTS ITS CONVERSATION. The message names no conversation itself, so the row is
  // read; a message nobody has is a refusal rather than a review scoped to nothing.
  //
  // AND THE CONVERSATION SAYS WHICH PROJECT IT IS ABOUT. `agent_messages` has no `workspace_id` —
  // its thread has one, and a copy on the row would be a second place that has to agree. So the
  // project boundary is read one row along, HERE, because nothing else checks it for this kind: a
  // message target names no record, so `checkTarget`'s record boundary never fires on one, and a
  // review of one project could be started from another project's conversation.
  agentMessage: (target, workspaceId) => {
    const row = db
      .select({ threadId: agentMessages.threadId })
      .from(agentMessages)
      .where(eq(agentMessages.id, target.messageId))
      .get()
    if (row === undefined) {
      return refusal(
        'noMessage',
        `There is no message ${target.messageId}, so Mole Office cannot say which conversation a review started ` +
          `from it would collect.`,
      )
    }
    const thread = db
      .select({ workspaceId: agentThreads.workspaceId, title: agentThreads.title })
      .from(agentThreads)
      .where(eq(agentThreads.id, row.threadId))
      .get()
    if (thread === undefined) {
      return refusal(
        'noConversation',
        `The message ${target.messageId} says it was said in the conversation ${row.threadId}, and there is no ` +
          `such conversation, so Mole Office cannot say what a review started from it would collect.`,
      )
    }
    if (thread.workspaceId !== workspaceId) {
      return refusal(
        'otherProject',
        `The message ${target.messageId} was said in "${thread.title}", which is a conversation about ` +
          `"${thread.workspaceId}", and this is a review of "${workspaceId}". A review is of one project's work.`,
      )
    }
    return { scope: { kind: 'conversation', id: row.threadId } }
  },

  // A PAGE AND A PART OF THE SCREEN NO LONGER WIDEN, AND THAT IS THE REPAIR.
  //
  // Both of these used to answer `{scope: {kind: 'project'}}`: a review started from a page
  // collected THE WHOLE PROJECT, silently, because nothing narrower was honestly true of it. That
  // is the widest answer there is and the worst one to reach by accident — a person who right-clicks
  // the background of a page and presses *Review* has said nothing at all about wanting every
  // comment in the project, and the review they get frames everything and sends everything.
  //
  // A PROJECT-WIDE REVIEW IS NOW A THING SOMEBODY ASKS FOR. `reviews.reach` holds the answer,
  // `scopeOf` reads it BEFORE it reads the entry, and a review that says `global` never reaches this
  // map at all. So these two arms are only ever reached by a review that says it is about one place,
  // and for one of those neither of these targets names a place. They refuse, in the shape the map
  // is already total over, and the refusal says what to do instead.
  //
  // WHAT HAPPENS TO THE REVIEWS THAT WERE ALREADY WIDE. Nothing is lost and nothing is narrowed:
  // window B's reach step reads exactly these two kinds and writes `global` on every review that
  // named one, so a review that was project-wide in behaviour keeps collecting the project and now
  // says so. `design/round-ten/migrations/reviews-reach.ts` names this map as its reason.
  uiSurface: () =>
    refusal(
      'partOfTheScreen',
      `A review of a part of the screen would be a review of every page it is on, which is the whole project. ` +
        `Ask for a project-wide review instead — that is one press, and it says so on the review — or point at ` +
        `something on the page first.`,
    ),

  page: () =>
    refusal(
      'aPage',
      `A page is what a comment points at when nothing more precise was under the pointer, so a review started ` +
        `from one would collect the whole project without saying so. Ask for a project-wide review instead ` +
        `— that is one press, and it says so on the review — or point at something on the page first.`,
    ),

  // THE TWO MOLE OFFICE DOES NOT STORE. `checkContext` already refuses an entry naming one of these —
  // its reader answers `unknown` — so neither arm can be reached through the API. They are here
  // because the map is total, and they say the same thing the reader says rather than a second
  // version of it.
  // A READING IS KEPT AS A SENTENCE BESIDE THE COMMENT IT IS ABOUT, and that is all it is kept as.
  // Nothing in this database holds a proposed action as a thing with an id of its own, so there is
  // nothing here for a review to be started from. The refusal says which of the two is missing
  // rather than the older sentence's "Mole Office stores no organised readings", which stopped being
  // true when this file learned to keep one.
  proposedAction: (target) =>
    refusal(
      'anAction',
      `${WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY} So there is nothing holding action ` +
        `${target.actionId} of ${target.interpretationId} to start a review from.`,
    ),
  draft: (target) =>
    refusal(
      'aDraft',
      `${WHY_A_DRAFT_IS_NOT_ON_THE_SERVER} So there is nothing holding draft ${target.draftId} to start a ` +
        `review from.`,
    ),
}

/** The record-named arms, in one place, so the declaration stays the only statement of which key. */
function byRecord(target: Target): { scope: Omit<ReviewScope, 'says' | 'gaps'> } | { refused: ScopeGap } {
  const id = recordNamedBy(target)
  if (id === null) {
    return refusal('namesNoRecord', `${nameTarget(target)} names no record, so there is nothing for a review to collect.`)
  }
  return { scope: { kind: 'record', id } }
}

/**
 * Every record inside a record scope: the one the review was started from, and everything part of
 * it.
 *
 * CONTAINMENT IS READ THROUGH THE ONE READER THIS PRODUCT ALREADY HAS. `descendantsOf` in
 * src/shared/containment.ts joins the two stores that say what is part of what — the `part_of` link
 * and a pipeline's own stored order — and it reports what it could not count instead of narrowing
 * quietly. A second walk written here would be the defect this repository keeps producing.
 */
function recordsInside(rootId: string, workspaceId: string): { ids: Set<string>; gaps: ScopeGap[] } {
  const root = getRecord(rootId)
  if (root === null) return { ids: new Set([rootId]), gaps: [] }

  // ONLY WHAT CAN BE REACHED FROM THE ROOT IS READ. The walk below reads a record's own steps and the `part_of` links
  // into it, and nothing else, so it is handed every record and link it can reach and the answer is the one it gave when it
  // was handed the whole project. Reading the whole project cost about 85 ms per review on an office the size of the owner's,
  // and the list of reviews paid it once for every review still collecting (wave 13r round 15).
  const { records, links: joins } = whatCanBeReachedFrom(root, workspaceId)
  const context: ContainmentContext = { records, links: joins }

  const walk = descendantsOf(root, context)
  const inside = new Set<string>([rootId])
  for (const step of walk.steps) inside.add(step.id)
  const gaps: ScopeGap[] = walk.gaps.map((gap) => ({ code: gap.code, values: gap.values, says: gap.reason }))
  if (!walk.complete) {
    gaps.push({ code: walk.stoppedBy, values: walk.stoppedBy === 'tooDeep' ? { n: MAX_CONTAINMENT_DEPTH } : {}, says: walk.stopped })
  }
  return { ids: inside, gaps }
}

/**
 * EVERY RECORD AND CONTAINMENT LINK THAT CAN BE REACHED GOING DOWN FROM ONE RECORD, as the project reads them.
 *
 * Going down is what `descendantsOf` does: a pipeline's stored steps, and every `part_of` link that points at a
 * record. A record is in the answer only when `listRecords` for this project, deleted ones too, would give it, and a
 * link only when one of its two ends is such a record. Those are the rules `recordsInside` used when it read the whole
 * project, so a walk over this answer and a walk over the whole project reach the same records and stop in the same
 * places.
 *
 * ONLY THE CONTAINMENT LINK IS FOLLOWED, NAMED BY `CONTAINMENT_LINK`, THE CONSTANT `descendantsOf` ITSELF COMPARES WITH.
 * Until round 18 of wave 13y every link was read, whatever its type, and every record at its far end was read too, though
 * `descendantsOf` drops every link that is not `part_of` before it walks. On 10 October 2026 the open reviews of panelx
 * reached about 4,250 records this way, nearly all through `about` links (message dAffBgEVNHkw). A long id list
 * also makes SQLite read `listRecords` by scanning the project and every message instead of by id. Each comments read
 * walked every open review, and took 32 to 48 s. Following only `part_of` gives the same answer, because
 * `descendantsOf` never looked at a record it could reach only through another type.
 *
 * The walk keeps the set of ids it has reached, as it did before, so it stops on a loop. Exported for the test that
 * proves it reads nothing reached only through another type (tests/a-review-reads-only-what-it-can-reach.test.ts).
 */
export function whatCanBeReachedFrom(root: PanelRecord, workspaceId: string): { records: PanelRecord[]; links: ContainmentLink[] } {
  const found = new Map<string, PanelRecord>()
  const seen = new Set<string>([root.id])
  const read: ContainmentLink[] = []
  let frontier = [root.id]
  while (frontier.length > 0) {
    for (const record of listRecords({ workspaceId, includeDeleted: true, ids: frontier })) found.set(record.id, record)
    // IN PIECES (src/server/db/in-pieces.ts): one level of the walk can hold any number of records. Each link
    // is in the one piece that holds its `to` end, and `descendantsOf` sorts what it reads, so the order is not used.
    const into = readInPieces(frontier, (piece) =>
      db
        .select({ id: links.id, fromId: links.fromId, toId: links.toId, type: links.type })
        .from(links)
        .where(and(inArray(links.toId, piece), eq(links.type, CONTAINMENT_LINK)))
        .all(),
    )
    read.push(...into)
    const next: string[] = []
    const reach = (id: string | null) => {
      if (id === null || seen.has(id)) return
      seen.add(id)
      next.push(id)
    }
    for (const id of frontier) {
      // THE ROOT IS WALKED FROM EVEN WHEN THIS PROJECT DOES NOT HOLD IT, as `descendantsOf` walks from it.
      const record = found.get(id) ?? (id === root.id ? root : undefined)
      if (record === undefined) continue
      for (const entry of storedEntries(record)) reach(entry.id)
    }
    for (const link of into) if (found.has(link.toId) || link.toId === root.id) reach(link.fromId)
    frontier = next
  }
  return { records: [...found.values()], links: read.filter((one) => found.has(one.fromId) || found.has(one.toId)) }
}

/**
 * WHAT A REVIEW STARTED HERE COLLECTS. THIS NEVER THROWS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SCOPE MOLE OFFICE CANNOT WORK OUT IS AN ANSWER AND NOT AN ERROR
 * ---------------------------------------------------------------------------------------
 *
 * A review can be started from a comment in a conversation, and `DELETE /api/agent/messages/:id`
 * removes that row for good. This used to throw a 404, and the throw did not stay where it
 * happened: reading that review died, finishing it died, and — because `startReview` walks every
 * collecting review of the project — STARTING ANY NEW REVIEW ANYWHERE IN THAT PROJECT died too,
 * with a message about an id the person had never seen. One deleted comment stopped reviewing
 * working across a whole project, permanently, because no route deletes a review.
 *
 * A review whose entry has been deleted is a real state. It is answered with a `gone` scope that
 * says what is missing and collects nothing, so every read still reads and the list still lists.
 * `startReview` and `finishCollecting` are the two acts that cannot honestly be done against one,
 * and each refuses by name — see `scopeOrRefuse` and `finishCollecting`.
 */
export function scopeOf(entry: Context, workspaceId: string, reach: ReviewReach = 'local'): ReviewScope {
  // THE SENTENCES ARE THE CODED GAPS' OWN, worked out here and nowhere else.
  const { gapForms, ...scope } = scopeAndItsGaps(entry, workspaceId, reach)
  return { ...scope, gaps: gapForms.map((gap) => gap.says), gapForms }
}

/** `scopeOf` with its gaps as codes only; `scopeOf` adds their sentences. */
function scopeAndItsGaps(
  entry: Context,
  workspaceId: string,
  reach: ReviewReach,
): Omit<ReviewScope, 'gaps' | 'gapForms' | 'saysForm'> & { gapForms: ScopeGap[]; saysForm: ScopeSays } {
  // HOW WIDE IT IS IS ASKED FIRST, AND A PROJECT-WIDE REVIEW NEVER READS ITS ENTRY.
  //
  // `reviews.reach` says so in its own declaration: `global` means the whole project and `entry` is
  // not read at all. Asking here rather than inside the map is what lets the `page` and `uiSurface`
  // arms refuse: those two used to be the only way to reach a project scope, so a person got the
  // widest review there is by pointing at nothing, and somebody who WANTED one had no way to say so.
  //
  // The entry is still stored and still drawn — it is where the person was standing when they asked
  // — it just decides nothing about what is collected.
  if (reach === 'global') {
    return {
      kind: 'project',
      id: '',
      says:
        `Everything in this project. A project-wide review was asked for, so where it was started from decides ` +
        `nothing about what it collects.`,
      saysForm: { code: 'projectAsked', values: {} },
      gapForms: [],
    }
  }
  const reader = SCOPE_READERS[entry.target.kind] as ScopeReader<TargetKind>
  const read = reader(entry.target, workspaceId)
  if ('refused' in read) {
    return {
      kind: 'gone',
      id: '',
      says:
        `Mole Office cannot say what this review collects. ${read.refused.says} Nothing joins it while that is true, and ` +
        `nothing has been guessed.`,
      saysForm: { code: 'gone', values: {} },
      gapForms: [read.refused],
    }
  }
  const { kind, id } = read.scope

  if (kind === 'project') {
    return {
      kind,
      id: '',
      says:
        `Everything in this project. This review was started from a page, where nothing more precise was under ` +
        `the pointer, so the project is the smallest thing Mole Office can honestly say it is about.`,
      saysForm: { code: 'projectFromPage', values: {} },
      gapForms: [],
    }
  }
  if (kind === 'plan') {
    return { kind, id, says: `Everything about the plan ${id}, including every line of it.`, saysForm: { code: 'plan', values: {} }, gapForms: [] }
  }
  if (kind === 'window') {
    return { kind, id, says: `The block on the week ${id}, and nothing else.`, saysForm: { code: 'window', values: {} }, gapForms: [] }
  }
  if (kind === 'conversation') {
    return { kind, id, says: `Everything said in the conversation ${id}.`, saysForm: { code: 'conversation', values: {} }, gapForms: [] }
  }

  const { ids, gaps } = recordsInside(id, workspaceId)
  const record = getRecord(id)
  const named = record === null ? `the record ${id}` : `"${record.title}" (${id})`
  const others = ids.size - 1
  // WHAT HAPPENED TO THE RECORD SINCE, SAID RATHER THAN GLOSSED. `getRecord` serves a deleted
  // record, so a review entered from one used to go on describing it by title as though it were
  // still there — while `checkContext` refused to start a review there, so the person could not
  // resume the review they were already in and was told nothing about why.
  const since =
    record === null
      ? ` Mole Office has no record with that id at all now, so this scope holds whatever still names it.`
      : record.deletedAt !== null
        ? ` That record was deleted at ${record.deletedAt}. It is still what this review collects, and a new ` +
          `review cannot be started there while it is deleted.`
        : ''
  const lost: ScopeGap[] =
    record === null
      ? [{ code: 'recordGone', values: {}, says: `There is no record ${id} in this database now, and it is what this review was started from.` }]
      : record.deletedAt !== null
        ? [{ code: 'recordDeleted', values: {}, says: `The record this review was started from, ${id}, was deleted at ${record.deletedAt}.` }]
        : []
  return {
    kind,
    id,
    says:
      `${named}, everything inside it, and any part of any of them — a block of its report, a row or a cell of ` +
      `its table. ` +
      (others === 0
        ? `Nothing is stored as being part of it, so it is the whole of the scope.`
        : `${String(others)} record${others === 1 ? ' is' : 's are'} stored as being part of it.`) +
      since,
    saysForm:
      record === null
        ? { code: 'recordMissing', values: {} }
        : others === 0
          ? { code: 'recordAlone', values: { title: record.title } }
          : { code: 'record', values: { n: others, title: record.title } },
    gapForms: [...lost, ...gaps],
  }
}

/**
 * The same question, for the two acts that cannot honestly be done when the answer is `gone`.
 *
 * Starting a review needs a scope, because the scope is what it will collect and eventually send.
 * Freezing a membership needs one for the same reason. Reading does not, which is why `scopeOf`
 * answers rather than throwing and this is separate from it.
 */
function scopeOrRefuse(entry: Context, workspaceId: string, doing: string, reach: ReviewReach = 'local'): ReviewScope {
  const scope = scopeOf(entry, workspaceId, reach)
  if (scope.kind === 'gone') {
    throw new PanelError(`${scope.gaps.join(' ')} So Mole Office cannot ${doing}. Nothing has been changed.`, 400)
  }
  return scope
}

/**
 * IS THIS REMARK INSIDE THIS REVIEW?
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "RELATED TO THE ENTRY" MEANS, AND THE THREE THINGS IT WAS NOT ALLOWED TO MEAN
 * ---------------------------------------------------------------------------------------
 *
 * CHOSEN: CONTAINMENT. A remark is inside when what it points at IS the thing the review was
 * started from, or something inside that thing. Containment is `part_of` and a pipeline's stored
 * order, which are the two stores Mole Office already keeps for "this is inside that", joined by the one
 * reader in src/shared/containment.ts. A block of a report, a row of its table and a cell of that
 * row are all inside the report they belong to, because all three name it.
 *
 * REJECTED: `about`. It is the most common typed link in the live corpus — 65 of them against 31
 * `part_of`, measured 18 August 2026 — and it says a report is ABOUT a module, not that it is part
 * of one. Sweeping it in would mean a review started from a module collects a remark somebody left
 * on a neighbouring report, and Send would then hand that person's words to the module's agent as
 * part of a review they never meant to make. Narrow is recoverable: the person comments again from
 * inside. Wide is not: the words have gone.
 *
 * REJECTED: `discusses`, for the same reason with one more step of distance — it is a piece of
 * writing pointed at its subject.
 *
 * REJECTED: `relates_to`. Its own declaration in src/shared/types.ts says it means "somebody joined
 * these and did not say how", which is precisely not a statement that one is inside the other. It
 * is also the default a typed name produces, so scoping on it would make almost everything inside
 * almost everything.
 *
 * WHAT WOULD REOPEN THIS: somebody starting a review from a module, commenting on the report about
 * it, and finding the remark outside their review. The fix then is not to widen the rule — it is
 * that the report should be `part_of` the module, which is a fact about that corpus and is written
 * where facts about a corpus belong.
 */
export function insideScope(scope: ReviewScope, target: Target, workspaceId: string): boolean {
  return insideThisScope(scope, workspaceId)(target)
}

/**
 * THE SAME QUESTION AS `insideScope`, ASKED OF MANY TARGETS AGAINST ONE SCOPE.
 *
 * A record scope walks everything inside the record (`recordsInside`), and that walk reads every
 * record and `part_of` link it can reach going down. Asked once per comment, a review over many comments walked
 * once per comment. The answer is the same for every comment of one read, so it is walked the first
 * time a comment needs it and kept for the rest. `insideScope` is this function asked once.
 */
function insideThisScope(scope: ReviewScope, workspaceId: string): (target: Target) => boolean {
  let inside: Set<string> | null = null
  return (target) => {
    // MOLE OFFICE COULD NOT WORK THE SCOPE OUT, so it cannot say anything is inside it. Nothing collects,
    // and `scopeOf` has already said why in words.
    if (scope.kind === 'gone') return false
    if (scope.kind === 'project') {
      // A PROJECT SCOPE IS THE WIDEST THERE IS AND IT STILL STOPS AT THE PROJECT. This returned true
      // for every target without looking at it, so `GET /api/reviews?covers=…` answered with this
      // project's review and a sentence naming another project's record.
      return !inAnotherProject(target, workspaceId)
    }
    if (scope.kind === 'record') {
      const named = recordNamedBy(target)
      if (named === null) return false
      if (named === scope.id) return true
      inside ??= recordsInside(scope.id, workspaceId).ids
      return inside.has(named)
    }
    if (scope.kind === 'plan') {
      if (target.kind !== 'plan' && target.kind !== 'planLine' && target.kind !== 'planLineFact') return false
      return target.planId === scope.id
    }
    if (scope.kind === 'window') {
      return target.kind === 'scheduleBlock' && target.windowId === scope.id
    }
    // A conversation. The message names no conversation, so the row says which one it is in.
    if (target.kind !== 'agentMessage') return false
    const row = db
      .select({ threadId: agentMessages.threadId })
      .from(agentMessages)
      .where(eq(agentMessages.id, target.messageId))
      .get()
    return row !== undefined && row.threadId === scope.id
  }
}

// ============================================================================ what comes back

export interface ReviewView {
  id: string
  workspaceId: string
  /** Where it was started from. */
  entry: Context
  state: ReviewState
  /** LOCAL wall clock. A remark written before this is not in this review. */
  started: string
  startedBy: string
  /** When collecting finished, or null because it has not. */
  collectedAt: string | null
  /**
   * WHEN IT WAS SENT, or null because it has not been. LOCAL wall clock.
   *
   * A review is sent when nothing was left waiting in it, so a Send that handed over four comments
   * and held one back leaves this null and the review sendable again.
   */
  sentAt: string | null
  /**
   * THE CONVERSATION IT WENT OUT IN, or null because it has not been sent.
   *
   * One review, one conversation, however many agents the comments in it are for. It is where the
   * answers come back, and it is what a person opens after pressing Send.
   */
  threadId: string | null
  /**
   * TRUE ONCE THE MEMBERSHIP HAS BEEN WRITTEN DOWN.
   *
   * Read off whether anything is stored, not from the state word. A frozen review that contained
   * nothing stores an empty list, which is a different fact from "nobody has finished collecting"
   * and must not read the same.
   */
  membershipFrozen: boolean
  /** The conversation the remarks in it were written into, before remarks were their own thing. */
  fromThreadId: string | null
  /**
   * HOW WIDE IT IS — `local` or `global`. The one stored answer, and the one `scopeOf` reads first.
   *
   * Every review written before the column existed reads `local`, which is exactly what it was. The
   * ones that were project-wide in all but name — started from a page or from a part of the screen,
   * which `SCOPE_READERS` was already widening — are moved onto `global` by window B's reach step,
   * so nothing about what any of them collects changes.
   */
  reach: ReviewReach
  /**
   * THE AGENT RECORD OF THE AGENT THAT ASKED FOR THIS REVIEW, or null because nobody did.
   *
   * It does one thing: it puts that agent first in the recipient picker for this review. An agent
   * may ASK for a review and may not start one, so only the owner's press writes this.
   */
  startedByAgent: string | null
}

/**
 * Where one remark's words are stored. Two stores, one shape — see `membersOf`.
 *
 * It is declared in lib/frozen-membership.ts, because a frozen review stores it, and re-exported
 * here so that every reader keeps one name for it.
 */
export type { MemberSource } from './frozen-membership.ts'
/** Why a comment was taken out of what a review waits for, re-exported from the same file for the same reason. */
export { TAKEN_OUT_BECAUSE, type TakenOut, type TakenOutBecause }

/** One remark in a review, with everything a list of forty needs to draw a row. */
export interface FoundMember {
  /** Resolved destination name. Null means unaddressed; absent means its name could not be read. */
  recipientName?: string | null
  found: true
  source: MemberSource
  /** The annotation's record id, or the message's id. */
  id: string
  /** WHAT THE PERSON WROTE, exactly. Never rewritten by anything. */
  body: string
  /** What it points at. */
  context: Context
  /**
   * Whether what it points at is still there, and WHETHER THE QUOTED WORDS HAVE GONE STALE.
   *
   * Computed on this request and never stored, because a stored answer to "is this still there" is
   * only ever right by accident. This is what a review list draws beside the quote, so that two
   * stale quotes out of seven do not look like the other five.
   */
  reading: ContextReading
  /**
   * WHERE THIS COMMENT HAS GOT TO: one of the six words in `MESSAGE_STATES`, src/server/lib/
   * dispatch.ts — queued, sent, delivered, picked_up, handled or failed.
   *
   * It said "`queued`, `sent` or `answered` — the same three words on both stores" until 25 August
   * 2026, and both halves of that had stopped being true: there is one store, and it has six words.
   * The browser's word list still had the three, so a row drew `picked_up` at the reader.
   *
   * `queued` IS THE ONLY ONE THAT MEANS NOBODY HAS BEEN GIVEN IT. Every reader that wants "has this
   * gone out" asks that, and never whether the word is exactly `sent`.
   */
  state: string
  created: string
  createdBy: string
  /** The same string an addressable element on screen carries as `data-target`. */
  key: string
  /**
   * WHAT MOLE OFFICE MADE OF THESE WORDS, or null because nothing has. NEVER A REPLACEMENT FOR `body`.
   *
   * Read from the comment's own record, where `annotation.interpretation` is declared to hold it.
   * A comment whose words live in a conversation always answers null: that table has no place to
   * keep a reading beside them, and null there means "there is nowhere to keep one" rather than
   * "nobody read it". `organised` on the review says which.
   */
  interpretation: string | null
  /**
   * WHO SOMEBODY CHOSE THIS COMMENT TO GO TO, or null because nobody has.
   *
   * STORED ON THE COMMENT — `annotation.chosenRecipient` — so it survives a reload, a navigation
   * and a second browser. It lived in the browser and nowhere else until 19 August 2026, and a
   * person who chose agents for two comments lost both to a reload with nothing saying so.
   *
   * `says` IS `readDelivery`'s OWN SENTENCE, the one the send obeys, so the line under a comment
   * and the line in the send list cannot come to disagree. A comment whose words live in a
   * conversation always answers null: there is no record to store a choice on, and the message in
   * the conversation already carries who it is for.
   */
  chosen: {
    recipient: NonNullable<MessageInput['recipient']>
    canSend: boolean
    says: string
    /** `says` as a code, for the review panel to say in the page's language (src/shared/send-plan-words.ts). */
    sentence?: SendPlanSentence
  } | null
  /**
   * ACTIVE PLACEHOLDER RESTRICTIONS REACHING WHAT THIS COMMENT IS ABOUT — AND IT IS `null` TODAY.
   *
   * ---------------------------------------------------------------------------------------
   * WHY A FIELD THAT IS ALWAYS NULL IS HERE AT ALL
   * ---------------------------------------------------------------------------------------
   *
   * A placeholder is a stand-in for something nobody has decided yet, and a restriction is the
   * authored statement of what may not be claimed while it stands. Restrictions propagate along the
   * link graph, so a comment about a record that depends on an unresolved placeholder is a comment
   * about work whose conclusions are limited — and a review that hands those comments to an agent
   * without saying so is asking somebody to act on a result nobody may rely on yet.
   *
   * THE READER LANDED IN ROUND TEN WAVE 8 AND THIS FIELD IS NOW FILLED. It was `null` on every
   * reply from the wave that declared it, with a note saying the reader was a later wave and that
   * `null` meant *nothing has read this* rather than *somebody looked and found none*. That
   * distinction is why the two are still different values here:
   *
   *   an array  — `restrictionsOn` ran against the record this comment points at. An EMPTY array
   *               is a real answer: somebody looked, and nothing restricts it.
   *   null      — the comment points at nothing Mole Office stores as a record, so there was nothing to
   *               ask about. Not an empty list, because an empty list would be a claim about work
   *               nobody identified.
   *
   * WHAT IT IS FOR. A reviewer reading a result has to see what that result may not be used to
   * claim, or a review hands somebody a number and loses *not valid for geometry* on the way.
   */
  restrictions: RestrictionReading[] | null
}

/** A remark a frozen review contained that is not there to read now. */
export interface MissingMember {
  found: false
  source: MemberSource
  id: string
  says: string
}

export type ReviewMember = FoundMember | MissingMember

/**
 * ONE THING ABOUT A REVIEW'S MEMBERSHIP MOLE OFFICE COULD NOT WORK OUT: its code, its values and the
 * server's own sentence. The page's words for each code are `review.gap.<code>` in src/shared/words.
 */
export interface ReviewGap {
  code: 'takenInGone' | 'noWriter' | 'sameSecond' | 'unreadable' | 'conversationGone' | 'conversationShows'
  values: { n?: number }
  says: string
}

export interface ReviewDetail {
  review: ReviewView
  /** Fingerprint of the already-read comments and recipient choice, shared with the collecting list. */
  collectingStamp?: string
  /** What counts as inside, worked out from the entry on this request. */
  rule: ReviewScope
  members: ReviewMember[]
  /**
   * THE COMMENTS SAVED WITHOUT SENDING ON WHAT THIS REVIEW REVIEWS, BEFORE IT STARTED. Not members.
   *
   * The review lists them and its send carries them, each to the recipient chosen for it, and a send
   * that would leave one with nobody chosen is refused and names it. `savedNotSent` says which
   * comments these are and why they are a group of their own. Problem H031xonpPSqa.
   */
  saved: FoundMember[]
  /**
   * THE COMMENTS THE PERSON TOOK OUT OF WHAT THIS REVIEW WAITS FOR: which, why, who pressed and when, from the frozen
   * membership. Each one is still listed in `members` or `saved`. Absent while the review is collecting and after it
   * was abandoned, because neither can wait for anything. Only the comments this reader is shown are in it.
   */
  takenOut?: TakenOut[]
  /**
   * THE COMMENTS THIS REVIEW STILL WAITS FOR, by id, worked out by `whatTheReviewWaitsFor`. Empty means every comment
   * went or was taken out. Absent when `takenOut` is.
   */
  waitsFor?: string[]
  /** How many are in it, including any a frozen review contained that are no longer there. */
  count: number
  /**
   * EVERYTHING ABOUT THIS MEMBERSHIP MOLE OFFICE COULD NOT WORK OUT, named. Empty means nothing was.
   *
   * Not the same list as `rule.gaps`, which is about the scope. This one is about the remarks: a
   * note nobody is recorded as writing, a note written in the same second as the press, a review
   * whose words live in a conversation somebody may have deleted a comment from. Every sentence
   * here is also in `says`, so a screen that draws only the sentence still tells the person.
   */
  gaps: string[]
  /**
   * THE SAME GAPS, EACH AS A CODE WITH ITS VALUES, so a page draws them in its reader's language.
   *
   * `gaps` is these sentences in the server's English, worked out from this list in one place, and a
   * page shows `says` only in Developer mode (decision z_A0xVMbWOzh). A number is the only value: the
   * ids are in `says`, where an agent and Developer mode read them.
   *
   * IT MAY BE MISSING. This server always sends it, but an answer made before it existed does not carry it
   * (a page left open across the update, a review a test writes by hand), and a page that read it unguarded
   * drew an error where the whole review should be (merge entry xf_2jK-_Fjy_). A page draws `gaps` then, the
   * server's own sentences, rather than no gaps at all (problem W5ixFnJb9VWc).
   */
  gapForms?: ReviewGap[]
  /**
   * WHAT MOLE OFFICE MADE OF THE REMARKS, or null because nothing has read them.
   *
   * DERIVED FROM THE COMMENTS THEMSELVES, never from the state word. A reading lives on the comment
   * it is about — `annotation.interpretation` — so this is assembled from what is stored there on
   * every request. There is no second copy on the review to disagree with it, and a person who
   * takes one reading away with an ordinary record patch sees this answer change straight away.
   *
   * There is still no placeholder here. Null means nothing has read them, and a mechanical
   * arrangement of somebody's remarks standing where an interpretation goes would be a claim about
   * their words that nothing made.
   */
  organised: OrganisedView | null
  /**
   * WHETHER THIS REVIEW CAN BE SENT, AND WHY NOT WHERE IT CANNOT. Worked out on this request.
   *
   * NOTHING STORES IT. See `readinessOf`, which lists the four stored facts it is computed from and
   * hands all four back beside the answer.
   */
  readiness: ReviewReadiness
  /** WHO THIS REVIEW GOES TO, and on what ground. `goesToOf` is the one place it is worked out. */
  goesTo: ReviewGoesTo
  says: string
}

/** An agent named the way a comment's `chosenRecipient` names one: by its agent record. */
export interface AgentByRecord {
  kind: 'agent'
  agentId: string
  sessionId: null
  said: null
  why: null
}

/**
 * WHO A REVIEW GOES TO. The owner's second detail (record 9BZZVKQxWV9Z): a review goes by default to the agent
 * that wrote the page, changing it is one press, and with no recorded writer nothing is guessed.
 *
 *   `chosen`          — the person said who the whole review goes to (POST /api/reviews/:id/recipient).
 *   `wrote-the-page`  — nobody said, and an agent is recorded as filing the record the review was started on.
 *   `nobody-recorded` — nobody said, and no agent is recorded as filing that record. It goes to nobody.
 */
export interface ReviewGoesTo {
  ground: 'chosen' | 'wrote-the-page' | 'nobody-recorded'
  recipient: AgentByRecord | null
  /** The agent record's title, or null because there is no recipient or its record cannot be read. */
  name: string | null
  /**
   * The comments in it that go somewhere else, because a choice or a hint on the comment itself says so.
   * Empty when every comment goes to `recipient`.
   */
  elsewhere: string[]
}

export { READINESS, readinessOf }
export type { Readiness, ReviewReadiness }

/**
 * WHETHER THIS REVIEW CAN BE SENT. Declared in src/shared/readiness.ts and re-exported here so that
 * every reader keeps one name for it, the way `MemberSource` is.
 *
 * IT IS IN `src/shared` BECAUSE IT NEEDS NO DATABASE, and because a browser drawing the answer must
 * compute the same one from the same reply rather than keeping a second opinion. Its header says so.
 */



/** What Mole Office made of one review's comments, assembled from what is stored beside each of them. */
export interface OrganisedView {
  /** One entry per comment that carries a reading now, in the order the comments are listed. */
  readings: { id: string; source: MemberSource; interpretation: string }[]
  /** The comments in this review with nothing stored beside them, and what Mole Office can say about it. */
  without: { id: string; source: MemberSource; says: string }[]
  /**
   * WHAT THE READING SAID ABOUT SEVERAL OF THESE COMMENTS AT ONCE. Empty means it found none.
   *
   * READ FROM ONE PLACE — `reviews.read_groups` — and never from the sentences beside the comments.
   * A group is a claim about several comments, so it is stored once and every member's screen draws
   * the same words from the same row. It used to be appended to each member's own reading, and a
   * person correcting one of those left the others announcing a group that member had left.
   */
  groups: OrganisedGroup[]
  says: string
}

export interface ReviewListReply {
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<ReviewListBucket>[]

  reviews: ReviewView[]
  /** How many reviews are in each state, so the interesting number needs no walk of the list. */
  counts: Record<ReviewState, number>
  /** How many there are in total, which may be more than the list when it is truncated. */
  total: number
  /** How many matched and are not in this reply. `says` states it too. */
  leftOut: number
  /**
   * THE RECORDS THESE REVIEWS WERE STARTED ON, NAMED, by record id, so the column names each review without one
   * read per review (wave 13r round 15). A record that is not stored any more is absent, and the column then says
   * the kind of thing, which is what it knows.
   */
  named: Record<string, { kind: string; title: string }>
  /**
   * HOW MANY COMMENTS EACH REVIEW STILL COLLECTING WOULD SEND, by review id: its members and the comments it lists
   * as saved and not sent. Only collecting reviews are counted, because only they can still change.
   */
  collectingHolds: Record<string, number>
  /** Changes when the already-read comments change, including an edit that leaves their count alone. */
  collectingStamps?: Record<string, string>
  says: string
}

// ============================================================================ rows to views

type ReviewRow = typeof reviews.$inferSelect

function entryOf(row: ReviewRow): Context {
  try {
    return JSON.parse(row.entry) as Context
  } catch {
    throw new PanelError(
      `Review ${row.id} stores an entry that is not readable JSON, so Mole Office cannot say where it was started ` +
        `from or what it collects. Nothing has been guessed. The stored text starts: ${row.entry.slice(0, 120)}`,
      500,
    )
  }
}

/**
 * What this review wrote down when collecting finished, or null because it has not.
 *
 * ONE PARSER, IN lib/frozen-membership.ts, and lib/records.ts calls the same one. It answers rather
 * than throwing, so this refusal keeps the sentence it has always said.
 */
function frozenOf(row: ReviewRow): FrozenMembership | null {
  const written = readFrozen(row.frozen)
  if (written !== UNREADABLE) return written
  throw new PanelError(
    `Review ${row.id} stores a frozen membership that is not readable, so Mole Office cannot say what was in ` +
      `it when collecting finished. Nothing has been guessed. It starts: ${(row.frozen ?? '').slice(0, 120)}`,
    500,
  )
}

/**
 * WHAT A REVIEW STILL WAITS FOR, by comment id: every comment in it that has not gone and was not taken out.
 *
 * A comment that can no longer be found waits, because nothing says it went. A comment only the person may answer
 * waits too, because pressing Send never hands it over. Each is taken out by its own press (`takeOutOfTheReview`).
 *
 * THIS IS THE ONE RULE FOR WHETHER A REVIEW READS AS SENT. `sendReview` marks a review sent when it answers an empty
 * list after dispatch, and `takeOutOfTheReview` does the same after a press. The review's detail carries it as
 * `waitsFor`. The pane does not read that list: it reads `sendLeavesWaiting` in the send plan, which
 * `whatSendLeavesWaiting` below works out from this rule.
 */
export function whatTheReviewWaitsFor(comments: readonly ReviewMember[], takenOut: readonly TakenOut[]): string[] {
  const out = new Set(takenOut.map((one) => one.id))
  return comments.filter((one) => !out.has(one.id) && (!one.found || one.state === 'queued')).map((one) => one.id)
}

/**
 * WHAT PRESSING SEND WOULD LEAVE THIS REVIEW WAITING FOR, by comment id: what `whatTheReviewWaitsFor` names, less each
 * comment whose line in the send plan says it will go.
 *
 * IT IS THE PANE'S QUESTION, WHICH IS NARROWER THAN THE RULE'S. Before the first send the review waits for every comment
 * still to go, and a comment that will go waits only for the press of Send. What is left waits for something pressing
 * Send does not do: an address that works, or one of the presses that take a comment out. The send plan carries this
 * as `sendLeavesWaiting`, and the pane says the review waits exactly when it names a comment.
 */
function whatSendLeavesWaiting(planned: readonly Pick<Planned, 'member' | 'line'>[], takenOut: readonly TakenOut[]): string[] {
  const going = new Set(planned.filter((one) => one.line.willGo).map((one) => one.member.id))
  return whatTheReviewWaitsFor(planned.map((one) => one.member), takenOut).filter((id) => !going.has(id))
}

/** The comments taken out of a review, or none for a review that has no frozen membership to keep them in. */
function takenOutOf(row: ReviewRow): TakenOut[] {
  return frozenOf(row)?.takenOut ?? []
}

/**
 * THE COMMENTS A READING IS ASKED ABOUT, by record id, when it is asked about some of a project's comments and not all
 * of them. A reading given these answers for each of them what it answers when it is asked about every comment, and
 * says nothing of any other. The message worker's queue asks about the comments it has queued (wave 13y round 34).
 */
type AskedAbout = ReadonlySet<string>

/**
 * WHAT EVERY REVIEW OF ONE PROJECT READS IN COMMON, READ ONCE AND HANDED DOWN.
 *
 * Reading one review's saved comments needs three things that are the same for every review of the
 * project: the project's review rows, which comments a review that can still send has written down
 * as its members, and the project's comment records. The message worker reads every review in each
 * pass (`commentsAReviewHasNotSentYet`). Until 2 October 2026 each review read all three again, and
 * the review rows were read once more per review, so one pass made a number of database reads that
 * grew with the square of the number of reviews. Now one pass makes one of these and hands it to
 * each review. tests/a-sent-review-holds-no-saved-comment.test.ts counts the reads.
 *
 * EACH PART IS READ THE FIRST TIME IT IS ASKED FOR, and kept. So a single review's read, which
 * makes its own, reads nothing it does not use: a sent review's read never asks for the comments.
 */
interface OneProjectsReviews {
  readonly workspaceId: string
  /** Every review row of the project. */
  rows(): readonly ReviewRow[]
  /** Every comment on the project's records, as `commentRecordsIn` reads them. */
  comments(): readonly PanelRecord[]
  /** Which reviews that can still send name each comment in their written-down membership. */
  stillHolding(): WrittenDownByAReviewThatCanSend
}

interface WrittenDownByAReviewThatCanSend {
  /** Comment id to the ids of the reviews whose written-down membership names it. */
  readonly heldBy: ReadonlyMap<string, readonly string[]>
  /** The reviews whose written-down membership cannot be read. `frozenOf` throws for each. */
  readonly unreadable: readonly ReviewRow[]
}

function oneProjectsReviews(workspaceId: string): OneProjectsReviews {
  let rows: readonly ReviewRow[] | null = null
  let comments: readonly PanelRecord[] | null = null
  let holding: WrittenDownByAReviewThatCanSend | null = null
  const reading: OneProjectsReviews = {
    workspaceId,
    rows() {
      rows ??= db.select().from(reviews).where(eq(reviews.workspaceId, workspaceId)).all()
      return rows
    },
    comments() {
      comments ??= commentRecordsIn(workspaceId)
      return comments
    },
    stillHolding() {
      if (holding !== null) return holding
      const heldBy = new Map<string, string[]>()
      const unreadable: ReviewRow[] = []
      for (const row of reading.rows()) {
        // A REVIEW THAT HAS ENDED SENDS NOTHING MORE, so it holds nothing for another review to leave to it.
        if (reviewHasEnded(row.state)) continue
        if (readFrozen(row.frozen) === UNREADABLE) {
          unreadable.push(row)
          continue
        }
        // WHAT IT WROTE DOWN, AND WHAT IT TOOK IN WHEN IT STARTED. A review still collecting holds what it took in
        // as members, so another review must not list those as saved and not sent.
        const named = new Set([...(frozenOf(row)?.members ?? []).map((member) => member.id), ...takenInOf(row)])
        for (const id of named) {
          const by = heldBy.get(id)
          if (by === undefined) heldBy.set(id, [row.id])
          else by.push(row.id)
        }
      }
      holding = { heldBy, unreadable }
      return holding
    },
  }
  return reading
}

function toReview(row: ReviewRow): ReviewView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    entry: entryOf(row),
    state: row.state as ReviewState,
    started: row.startedAt,
    startedBy: row.startedBy,
    collectedAt: row.collectedAt,
    sentAt: row.sentAt,
    threadId: row.sentThreadId,
    membershipFrozen: row.frozen !== null,
    fromThreadId: row.fromThreadId,
    reach: row.reach as ReviewReach,
    startedByAgent: row.startedByAgent,
  }
}

// ============================================================================ reading the members

/** The context stored on a record of kind `annotation`, or null when it holds none that reads. */
function contextOfAnnotation(record: PanelRecord): Context | null {
  // WHICHEVER KEY THE KIND KEEPS IT UNDER. A comment written before the one message pool is a
  // record of kind `annotation` with a `context`; one written since is a message with a `target`.
  // They are the same fact and this is the one place that knows both spellings.
  const held = record.kind === 'message' ? record.data['target'] : record.data['context']
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return null
  const target = (held as Record<string, unknown>)['target']
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return null
  return held as unknown as Context
}

/**
 * A remark, or WHY IT COULD NOT BE READ AS ONE, in words a person can act on.
 *
 * The reason is the whole point. `memberOfAnnotation` used to answer `null` for every failure, and
 * the frozen list turned every `null` into one sentence: "that note is not in this database now".
 * Measured on 19 August 2026, changing a member's kind from `annotation` to `note` — which leaves
 * the row, its words and its context exactly where they were — produced that sentence. Mole Office was
 * claiming an absence it had not measured.
 */
type ReadMember = { member: FoundMember } | { problem: string }


/**
 * WHAT A COMMENT IS ABOUT, or why Mole Office cannot say: the part of `memberOfAnnotation` that the membership rule
 * reads (`clauseFor`). Finishing a review asks it of every comment in the project, and the rest of a member — where it
 * has got to, who it is for, what may not be claimed of it — is several reads a comment that `clauseFor` never needs
 * (wave 13r round 15).
 */
type WhereACommentIs = { context: Context } | { problem: string }

function whereACommentIs(record: PanelRecord): WhereACommentIs {
  const context = contextOfAnnotation(record)
  if (context !== null) return { context }
  return {
    problem:
      `The comment ${record.id} stores nothing saying what it was left on, so Mole Office cannot say what it is about ` +
      `or which page to open for it. Its words are still in the record: GET /api/records/${record.id}.`,
  }
}

/**
 * One record of kind `annotation`, read as a remark, or why it does not read as one.
 *
 * WHO WROTE IT IS PASSED IN, because it comes from the ledger rather than from the record — a
 * record row has no author column, and `ownerId` is not one. See `whoWroteRecords`.
 */
function memberOfAnnotation(record: PanelRecord, wroteIt: string | undefined): ReadMember {
  const where = whereACommentIs(record)
  if ('problem' in where) return where
  const { context } = where
  const body = record.data['body']
  const interpretation = record.data['interpretation']
  return {
    member: {
      found: true,
      source: 'annotation',
      id: record.id,
      body: typeof body === 'string' ? body : '',
      context,
      reading: readContext(context),
      // WHERE THIS COMMENT HAS GOT TO, WORKED OUT FROM THE ONE STORE AND NOT READ OFF THE RECORD.
      //
      // It used to be `record.data['state']`, which was a second place where "this has gone out"
      // was written down: stamped from the browser after the send, in a `try/catch` that could fail
      // without failing anything, and walkable back to `queued` in one PATCH. `dispatchOf` answers
      // it from the messages that carried these words.
      //
      // IT IS NOT THE SAME QUESTION AS "HAS ANYBODY BEEN HANDED THESE WORDS". A live session can
      // take a comment straight from the door before any review carries it, and this word stays
      // `queued` when that happens — correctly, because the review has still not sent it and still
      // must. `alreadyHandedOver` is that other question, and `plan` below asks it for the sentence
      // under the comment. Problems `-4GypldN_XMS` and `p9enuTYIC-S6` are the two halves of it.
      state: dispatchOf([record.id], record.workspaceId)[record.id]?.word ?? 'queued',
      // WHAT MOLE OFFICE MADE OF THE WORDS, read from the record beside them. An empty string is not a
      // reading and is answered as null, the way `readAnnotation` reads the same field.
      interpretation: typeof interpretation === 'string' && interpretation !== '' ? interpretation : null,
      created: record.createdAt,
      // NOBODY RECORDED IT is a real answer and is said in those words, not left as an empty string
      // and not filled in with the person reading the review.
      createdBy: wroteIt ?? NOBODY_RECORDED,
      key: targetKey(context.target),
      // WHO SOMEBODY CHOSE THIS COMMENT TO GO TO, with the delivery reading `sendReview` obeys. It
      // is read here so the row a person is looking at and the send list below it cannot give two
      // answers: both are `readDelivery` on the same stored choice.
      chosen: chosenFor(record.id, record.workspaceId),
      // WHAT THIS WORK MAY NOT BE USED TO CLAIM, read against the record the comment points at.
      // An empty array means somebody looked; null means the comment points at nothing Mole Office
      // holds a record for, so there was nothing to look at.
      restrictions: restrictionsForComment(context, record.workspaceId),
    },
  }
}

/**
 * WHAT RESTRICTS THE WORK A COMMENT POINTS AT.
 *
 * It calls the ONE reader — `restrictionsOn` in src/server/lib/restrictions.ts — and does not walk
 * anything itself. Three designs named that read three different ways before it existed, and a
 * fourth walk written here would be the thing this campaign is about.
 *
 * `null` WHEN THE COMMENT NAMES NO RECORD. A comment can point at a passage of a report, a picture
 * or a part of the screen; those that name no record have nothing for a restriction to be about,
 * and answering `[]` there would say somebody looked at something.
 */
function restrictionsForComment(context: Context, workspaceId: string): RestrictionReading[] | null {
  const id = recordNamedBy(context.target)
  if (id === null) return null
  if (oneRead === null) return restrictionsOn(id, workspaceId).found
  // BY THE PROJECT ASKED ABOUT, which for a comment is the one its record is kept in, as `restrictionsOn` is asked.
  let on = oneRead.get(workspaceId)
  if (on === undefined) {
    on = restrictionsWithinOneRead(workspaceId)
    oneRead.set(workspaceId, on)
  }
  return on(id).found
}

/**
 * THE READ GOING ON NOW, with the restrictions of its project read from one graph, or null outside one.
 *
 * A review's comments are read one at a time, and each asked for the restrictions on the record it is about, which
 * built the project's whole restriction graph again for every comment: most of the 0.7 s that finishing a review and
 * reading what it did not take each cost on an office the size of the owner's (wave 13r round 15). Every read below is synchronous
 * and writes nothing, so the graph cannot change while it is held, and it is let go when the read returns.
 */
let oneRead: Map<string, ReturnType<typeof restrictionsWithinOneRead>> | null = null

function withinOneRead<T>(read: () => T): T {
  // A READ INSIDE A READ uses the outer one's graphs; it is the same moment.
  if (oneRead !== null) return read()
  oneRead = new Map()
  try {
    // AND ONE READING OF THE PROJECT'S SESSIONS, which every comment's own words about who it is for are matched
    // against.
    return withOneReadingOfRecipients(read)
  } finally {
    oneRead = null
  }
}

/** The stored choice on one comment, read back with what dispatch would make of it. */
function chosenFor(annotationId: string, workspaceId: string): FoundMember['chosen'] {
  const picked = chosenOn(annotationId)
  if (picked === null || picked === undefined) return null
  const delivery = readDelivery(picked, workspaceId)
  return {
    recipient: picked,
    canSend: delivery.canSend,
    says: delivery.says,
    ...(delivery.sentence === undefined ? {} : { sentence: delivery.sentence }),
  }
}

/**
 * One row of `agent_messages`, read as a remark, or why it does not read as one.
 *
 * The project is passed in rather than read off the row: `agent_messages` has no `workspace_id`,
 * and the project a conversation belongs to is its review's. Guessing one here would be reading
 * restrictions from a project this comment is not in.
 */
function memberOfMessage(row: typeof agentMessages.$inferSelect, workspaceId: string): ReadMember {
  const pointsAtNothing = {
    problem:
      `The comment ${row.id} is still in its conversation and points at nothing, so this review cannot say what ` +
      `it was about. Its words are still there: GET /api/agent/threads/${row.threadId}.`,
  }
  if (row.context === null) return pointsAtNothing
  let context: Context
  try {
    context = JSON.parse(row.context) as Context
  } catch {
    return {
      problem:
        `The comment ${row.id} stores what it points at as text nothing can read back, so this review cannot say ` +
        `what it was about. Nothing has been guessed. Its words are still there: ` +
        `GET /api/agent/threads/${row.threadId}.`,
    }
  }
  if (typeof context !== 'object' || context === null || context.target === undefined) return pointsAtNothing
  return {
    member: {
      found: true,
      source: 'conversation',
      id: row.id,
      recipientName: nameOfRecipient(row.recipientKind === null ? null : {
        kind: row.recipientKind as NonNullable<MessageInput['recipient']>['kind'],
        agentId: row.recipientKind === 'agent' ? row.recipientSessionId : null,
        sessionId: row.recipientKind === 'session' ? row.recipientSessionId : null,
        said: row.recipientSaid,
        why: row.recipientWhy,
      }, workspaceId),
      body: row.body,
      context,
      reading: readContext(context),
      state: row.state,
      created: row.createdAt,
      createdBy: row.createdBy,
      key: targetKey(context.target),
      // A CONVERSATION ROW HAS NO PLACE TO KEEP A READING BESIDE THE WORDS, so this is always null
      // for one, and the reason is said in `organised` rather than left as an empty space.
      interpretation: null,
      // NOR ANY PLACE TO KEEP A CHOICE. These words are already a message in the conversation this
      // review is sent in, and that message carries who it is for; a second answer stored here
      // would be a second statement of the same fact.
      chosen: null,
      // As above, read against whatever record these words point at.
      restrictions: restrictionsForComment(context, workspaceId),
    },
  }
}

/**
 * WHICH REMARKS ARE IN A REVIEW.
 *
 * ---------------------------------------------------------------------------------------
 * TWO STORES, ONE SHAPE, AND THE SECOND ONE IS ONLY EVER HISTORY
 * ---------------------------------------------------------------------------------------
 *
 * A remark is a record of kind `annotation`. That is the atomic fact Phase 3 built and it is what
 * everything written from now on is.
 *
 * A review brought forward from round seven ALSO reads the comments of the conversation it was
 * collected in, because that is where its words are. THEY ARE NOT COPIED — the words stay in
 * `agent_messages` and are read from there. Copying them into annotations would put the same
 * sentence in two writable rows, free to disagree, which is the defect this repository keeps
 * producing. `reviews.from_thread_id` is NULL on every review started after this table existed, so
 * this arm serves history and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * THREE CLAUSES, AND WHY THE THIRD IS THERE
 * ---------------------------------------------------------------------------------------
 *
 * A remark is inside a collecting review when
 *
 *   1. what it points at is inside the scope — see `insideScope`;
 *   2. it was written at or after the review started, because a review is somebody starting to
 *      collect and not a query over everything ever written; and
 *   3. THE PERSON WHO STARTED THE REVIEW WROTE IT.
 *
 * The third is not a permission rule and it does not stop anybody writing anything. It is about
 * whose words these are. A review is one person's collection of their own remarks, and Send hands
 * it to an agent as that person's review — so an agent's own annotation on the same module, written
 * while somebody was reviewing it, would put words in that person's mouth. It is measured off
 * `created_by`, which every table in this database already carries in one spelling.
 *
 * ---------------------------------------------------------------------------------------
 * AND A REMARK THIS CANNOT PLACE IS NAMED RATHER THAN DROPPED
 * ---------------------------------------------------------------------------------------
 *
 * The third clause used to be `wroteIt.get(id) !== review.startedBy`, and `undefined` — nobody
 * recorded who wrote it — took the same branch as somebody else wrote it. So a remark the ledger
 * holds no author for vanished from every review with nothing said, and the review read "0 remarks
 * so far": the same sentence as a review nobody has written in. Restoring an archive produces
 * exactly those rows, because the importer writes records with run-time SQL and never reaches the
 * ledger.
 *
 * It is still not a member — a review is one person's own remarks and Mole Office cannot say this is
 * one of theirs — but it is counted and said, in `gaps`.
 */
interface Collected {
  members: ReviewMember[]
  /** Everything about this membership Mole Office could not work out. See `ReviewDetail.gapForms`. */
  gaps: ReviewGap[]
  /** The comments left out because the reader may not read them. Empty for the whole review. */
  hidden: Set<string>
}

/**
 * THE COMMENTS AMONG THESE THAT THIS READER MAY NOT READ, by id, as option A of a decision
 * says.
 *
 * It asks wave 13j's one rule and writes no second one:
 *
 *   - A comment filed as a record (`source` "annotation") is either a record of kind `annotation`,
 *     written before comments became messages, or a message. `theMessagesHiddenFrom` answers for the
 *     messages, and never names a record of another kind, so an old annotation stays readable, as it
 *     is on every record door.
 *   - A comment still in a conversation (`source` "conversation") is a row of `agent_messages`. The
 *     rule for those conversations is `theThreadsThisReaderMayRead`, which answers for the whole
 *     conversation, so the comment is hidden when its conversation is. A row that is not there now
 *     has no conversation to ask about, and is hidden from a reader limited to its own messages.
 *
 * `reader` null is the whole review. Only the office's own acts ask that way (the send, and the check
 * of a reading against every comment); a door that answers a caller passes the caller's reader.
 */
function theCommentsHiddenFrom(
  reader: AMessageReader | null,
  comments: readonly { id: string; source: MemberSource }[],
): Set<string> {
  if (reader === null || reader.readsEveryMessage || comments.length === 0) return new Set()
  const hidden = theMessagesHiddenFrom(
    reader,
    comments.filter((one) => one.source === 'annotation').map((one) => one.id),
  )
  const inConversations = [...new Set(comments.filter((one) => one.source === 'conversation').map((one) => one.id))]
  if (inConversations.length === 0) return hidden
  // IN PIECES (src/server/db/in-pieces.ts): a review can hold any number of comments, and nothing caps that.
  // The rows go into a map by id, so their order is not used.
  const threadOf = new Map(
    readInPieces(inConversations, (piece) =>
      db
        .select({ id: agentMessages.id, threadId: agentMessages.threadId })
        .from(agentMessages)
        .where(inArray(agentMessages.id, piece))
        .all(),
    ).map((row) => [row.id, row.threadId]),
  )
  const threadIds = [...new Set(threadOf.values())]
  // IN PIECES (src/server/db/in-pieces.ts): at worst one conversation for each comment above. Each conversation
  // is answered on its own and the answer is a set of ids, so the order is not used.
  const threads =
    threadIds.length === 0 ? [] : readInPieces(threadIds, (piece) => db.select().from(agentThreads).where(inArray(agentThreads.id, piece)).all())
  const mayRead = theThreadsThisReaderMayRead(reader, threads)
  for (const id of inConversations) {
    const thread = threadOf.get(id)
    if (thread === undefined || !mayRead.has(thread)) hidden.add(id)
  }
  return hidden
}

function membersOf(
  row: ReviewRow,
  scope: ReviewScope,
  reader: AMessageReader | null,
  project: OneProjectsReviews = oneProjectsReviews(row.workspaceId),
  /** THESE COMMENTS ONLY (`AskedAbout`): the members are the whole answer's that are in it, and the gaps say only of them. */
  only?: AskedAbout,
): Collected {
  const asked = (id: string): boolean => only === undefined || only.has(id)
  const frozen = frozenOf(row)
  if (frozen !== null) {
    // A COMMENT THIS READER MAY NOT READ IS LEFT OUT, not reported as missing: a missing row would
    // still say that it was there.
    const hidden = theCommentsHiddenFrom(reader, frozen.members)
    return { members: frozenMembers(frozen.members.filter((one) => !hidden.has(one.id) && asked(one.id)), row.workspaceId), gaps: [], hidden }
  }

  const review = toReview(row)
  const members: FoundMember[] = []
  const gaps: ReviewGap[] = []
  // THE COMMENTS IT TOOK IN WHEN IT STARTED. They are members, read below; the walk over what was written
  // from the second it started skips them, because one written in that same second would be read twice.
  const takenIn = takenInOf(row)
  const taken = new Set(takenIn)
  // NOBODY RECORDED WHO WROTE THESE, so Mole Office cannot say whether they are this person's.
  const unattributed: string[] = []
  // WRITTEN IN THE SAME SECOND AS THE PRESS, so their order against it is not stored anywhere.
  const tied: string[] = []
  // WRITTEN BY THIS PERSON AND NOT READABLE AS A REMARK.
  const unreadable: { id: string; problem: string }[] = []

  if (scope.kind !== 'gone') {
    const written = project.comments().filter(
      (record) => record.createdAt >= review.started && asked(record.id),
    )
    const wroteIt = whoWroteRecords(written.map((record) => record.id))
    const inside = insideThisScope(scope, review.workspaceId)
    for (const record of written) {
      if (taken.has(record.id)) continue
      const wrote = wroteIt.get(record.id)
      // WHERE IT POINTS IS ASKED BEFORE IT IS READ AS A REMARK. Reading one reads its deliveries, its
      // chosen recipient and its restrictions, and none of that is needed for a comment outside the scope.
      // A comment with no context is still read, because its problem is said below.
      const context = contextOfAnnotation(record)
      if (context !== null && !inside(context.target)) continue
      const read = memberOfAnnotation(record, wrote)
      if ('problem' in read) {
        if (wrote === review.startedBy) unreadable.push({ id: record.id, problem: read.problem })
        continue
      }
      if (wrote === undefined) {
        unattributed.push(record.id)
        continue
      }
      if (wrote !== review.startedBy) continue
      // SENT ON ITS OWN. Its writer pressed Send, so it has gone to a contact and is not part of a review.
      if (sentOnItsOwn(record)) continue
      if (record.createdAt === review.started) tied.push(record.id)
      members.push(read.member)
    }

    if (row.fromThreadId !== null) {
      const rows = db.select().from(agentMessages).where(eq(agentMessages.threadId, row.fromThreadId)).all()
      for (const message of rows) {
        if (!asked(message.id)) continue
        if (message.createdAt < review.started) continue
        if (message.createdBy !== review.startedBy) continue
        const read = memberOfMessage(message, review.workspaceId)
        if ('problem' in read) continue
        if (!inside(read.member.context.target)) continue
        members.push(read.member)
      }
    }
  }

  // THE COMMENTS TAKEN IN WHEN IT STARTED, each read as a member, the way a comment written while it collects is.
  // One that has gone to somebody since stays a member and its state says so, as a written one's does; the send
  // does not send it again. One that is no longer stored is not a member any more, and a gap says which.
  if (takenIn.length > 0) {
    const byId = new Map(project.comments().map((record) => [record.id, record]))
    const wroteTaken = whoWroteRecords(takenIn.filter((id) => byId.has(id) && asked(id)))
    const gone: string[] = []
    for (const id of takenIn) {
      if (!asked(id)) continue
      const record = byId.get(id)
      if (record === undefined) {
        gone.push(id)
        continue
      }
      const read = memberOfAnnotation(record, wroteTaken.get(id))
      if ('problem' in read) {
        unreadable.push({ id, problem: read.problem })
        continue
      }
      members.push(read.member)
    }
    if (gone.length > 0) {
      gaps.push({
        code: 'takenInGone',
        values: { n: gone.length },
        says:
        `${String(gone.length)} comment${gone.length === 1 ? '' : 's'} this review took in when it started ` +
          `${gone.length === 1 ? 'is' : 'are'} no longer stored, so ${gone.length === 1 ? 'it is' : 'they are'} not in it: ${gone.join(', ')}.`,
      })
    }
  }

  // WHAT THIS READER MAY NOT READ IS LEFT OUT OF EVERY LIST BELOW, and so out of every count and every
  // sentence built from them: a reader limited to its own messages is told neither the words, the ids
  // nor how many there are. Every id in these four lists is a comment filed as a record, except the
  // members read out of a conversation, which say so in their own `source`.
  const hidden = theCommentsHiddenFrom(reader, [
    ...members.map((one) => ({ id: one.id, source: one.source })),
    ...[...unattributed, ...tied, ...unreadable.map((one) => one.id)].map((id) => ({ id, source: 'annotation' as const })),
  ])
  if (hidden.size > 0) {
    const keep = (id: string): boolean => !hidden.has(id)
    members.splice(0, members.length, ...members.filter((one) => keep(one.id)))
    unattributed.splice(0, unattributed.length, ...unattributed.filter(keep))
    tied.splice(0, tied.length, ...tied.filter(keep))
    unreadable.splice(0, unreadable.length, ...unreadable.filter((one) => keep(one.id)))
  }

  if (unattributed.length > 0) {
    const many = `${String(unattributed.length)} comment${unattributed.length === 1 ? '' : 's'}`
    gaps.push({
      code: 'noWriter',
      values: { n: unattributed.length },
      says:
      unattributed.length === 1
        ? `${many} inside this scope has no recorded writer, so Mole Office cannot say whether it belongs ` +
          `to this review. It is not in it and nothing has been guessed: ${unattributed.join(', ')}.`
        : `${many} inside this scope have no recorded writer, so Mole Office cannot say whether they ` +
          `belong to this review. They are not in it and nothing has been guessed: ${unattributed.join(', ')}.`,
    })
  }
  if (tied.length > 0) {
    const many = `${String(tied.length)} comment${tied.length === 1 ? ' was' : 's were'}`
    gaps.push({
      code: 'sameSecond',
      values: { n: tied.length },
      says:
      `${many} written in the same second this review started. Every stamp here is a local wall clock to the ` +
        `second, so Mole Office cannot say whether ${tied.length === 1 ? 'it was' : 'they were'} written before the ` +
        `press or after it. ${tied.length === 1 ? 'It is' : 'They are'} in this review: ${tied.join(', ')}.`,
    })
  }
  for (const one of unreadable) gaps.push({ code: 'unreadable', values: {}, says: one.problem })
  gaps.push(...conversationGaps(row))

  members.sort((a, b) => (a.created === b.created ? a.id.localeCompare(b.id) : a.created.localeCompare(b.created)))
  // NOT SLICED. What a review holds is not a page of a list — see `MAX_ROWS`.
  return { members, gaps, hidden }
}

/**
 * WAS THIS COMMENT SAVED WITHOUT SENDING, rather than sent by the person who wrote it?
 *
 * A message is, unless its writer sent it as it was written (`sentWhenWritten` in lib/messages.ts, which says how the
 * comment box writes each), and a review must not hand those words over a second time.
 *
 * An old record of kind `annotation` is not one of these. Those are listed under `Not in it` as
 * before, and tests/a-comment-written-before-a-review-is-named-not-dropped.test.ts holds that.
 */
function savedWithoutSending(record: PanelRecord): boolean {
  return record.kind === 'message' && !sentWhenWritten(record.kind, record.data)
}

/**
 * WAS THIS COMMENT SENT ON ITS OWN WHEN IT WAS WRITTEN: a message its writer addressed outright, with Send.
 *
 * Such a comment does not enter a review. The owner's first detail (record 9BZZVKQxWV9Z): the comment box has
 * Send and Start review, and Send goes at once to the chosen contact. So `membersOf` leaves it out and
 * `clauseFor` says why, in the same order. An old record of kind `annotation` is never one of these.
 */
function sentOnItsOwn(record: PanelRecord): boolean {
  return record.kind === 'message' && !savedWithoutSending(record)
}

/**
 * THE COMMENTS THIS REVIEW TOOK IN WHEN IT STARTED, by id, from the `taken_in` column. Empty for a review started
 * before that column existed. A value that cannot be read is said, not skipped, as `frozenOf` says one.
 */
function takenInOf(row: ReviewRow): string[] {
  if (row.takenIn === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(row.takenIn)
  } catch {
    parsed = null
  }
  if (!Array.isArray(parsed) || !parsed.every((one): one is string => typeof one === 'string' && one !== '')) {
    throw new PanelError(
      `Review ${row.id} stores the comments it took in when it started in a form that is not readable, so Mole ` +
        `Office cannot say what is in it. Nothing has been guessed. It starts: ${row.takenIn.slice(0, 120)}`,
      500,
    )
  }
  return parsed
}

/**
 * THE COMMENTS SAVED WITHOUT SENDING ON WHAT THIS REVIEW REVIEWS, which it lists and sends. Problem H031xonpPSqa.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THEY ARE A GROUP OF THEIR OWN AND NOT MEMBERS
 * ---------------------------------------------------------------------------------------
 *
 * The case, from a message: five comments were saved on a report without
 * being sent, the review
 * column was opened, and they could not be found there, so they could not be sent together.
 *
 * A review's members are what was written from the second it started (`membersOf`, contract §6.15).
 * A comment written before is `Earlier`, and once collecting finishes the membership is written down
 * for good. That rule stays as it is. Making the owner's saved comments members would change what a review
 * contained, and the written-down membership would no longer be what the owner collected that afternoon.
 *
 * So the review lists them in a group of their own, `Saved, not sent`, and its send carries them as
 * it carries the members, each to the recipient chosen for it. Nothing about them is written down:
 * the group is worked out on every read, from stamps that cannot move.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH COMMENTS, AND WHY EACH CLAUSE
 * ---------------------------------------------------------------------------------------
 *
 * A comment is in this group when all of these hold:
 *
 *   1. it is a message saved without sending (`savedWithoutSending`);
 *   2. it was written before the review started. One written from that second on is a member;
 *   3. the person who started the review wrote it. A review holds one person's own words;
 *   4. what it points at is inside the scope, the same `insideScope` the members are read with;
 *   5. nobody has been handed its words (`aMessageHasGoneOut`, the reader the chat's *Not sent yet* uses);
 *   6. no other review that has finished collecting, and has not ended, holds it in its
 *      written-down membership. That review is the one that sends it. A review that has ended
 *      (`reviewHasEnded`) sends nothing more, so it is not that review.
 *
 * A collecting review's membership is worked out on every read, so clause 6 does not read it, and
 * says so in the same words `commentsNotIn` uses for the same limit.
 *
 * AND THE REVIEW ITSELF HAS NOT ENDED. A sent or abandoned review lists none, because its send is
 * refused and so it cannot send one. Listing one would put "Goes with the review" in the column and
 * hold the comment back from the worker for a send that never comes (check 9K27DM6LOr_Z).
 *
 * `project` is what every review of the project reads in common (`oneProjectsReviews`). The worker's
 * pass hands one down for all its reviews; a single read makes its own.
 */
function savedNotSent(
  row: ReviewRow,
  scope: ReviewScope,
  reader: AMessageReader | null,
  project: OneProjectsReviews = oneProjectsReviews(row.workspaceId),
  /**
   * `true` ONLY WHEN A REVIEW IS BEING STARTED, to say which comments it takes in. Then a comment written in the
   * same second as the press is taken too: Start review in the comment box writes the comment and starts the
   * review one moment apart, and the stamps are to the second.
   */
  sameSecondToo = false,
  /** THESE COMMENTS ONLY (`AskedAbout`): the whole answer's that are in it. */
  only?: AskedAbout,
): FoundMember[] {
  if (reviewHasEnded(row.state)) return []
  if (scope.kind === 'gone') return []
  const review = toReview(row)
  // WHAT THIS REVIEW TOOK IN WHEN IT STARTED IS A MEMBER, so it is not listed a second time here.
  const takenHere = new Set(takenInOf(row))
  const earlier = project.comments().filter(
    (record) =>
      (sameSecondToo ? record.createdAt <= review.started : record.createdAt < review.started) &&
      savedWithoutSending(record) &&
      !takenHere.has(record.id),
  )
  if (earlier.length === 0) return []
  const holding = project.stillHolding()
  // A WRITTEN-DOWN MEMBERSHIP THAT CANNOT BE READ IS SAID, NOT SKIPPED: Mole Office cannot tell whether
  // that review holds one of these comments. `frozenOf` throws its sentence.
  for (const other of holding.unreadable) if (other.id !== row.id) frozenOf(other)
  // THE COMMENTS ASKED ABOUT ARE TAKEN AFTER THAT CHECK, so a reading of a few throws where the whole reading does.
  const these = only === undefined ? earlier : earlier.filter((record) => only.has(record.id))
  const wroteIt = whoWroteRecords(these.map((record) => record.id))
  const inside = insideThisScope(scope, review.workspaceId)
  const saved: FoundMember[] = []
  for (const record of these) {
    const wrote = wroteIt.get(record.id)
    if (wrote === undefined || wrote !== review.startedBy) continue
    if ((holding.heldBy.get(record.id) ?? []).some((other) => other !== row.id)) continue
    // THE SCOPE IS ASKED BEFORE ANYTHING READS THE DATABASE FOR THIS COMMENT, so a comment on another page
    // costs no read. The order changes no answer: each of these lines only leaves a comment out.
    const context = contextOfAnnotation(record)
    if (context === null || !inside(context.target)) continue
    if (aMessageHasGoneOut(record)) continue
    const read = memberOfAnnotation(record, wrote)
    if ('problem' in read) continue
    saved.push(read.member)
  }
  // WHAT THIS READER MAY NOT READ IS LEFT OUT, as it is from the members.
  const hidden = theCommentsHiddenFrom(reader, saved.map((one) => ({ id: one.id, source: one.source })))
  return saved
    .filter((one) => !hidden.has(one.id))
    .sort((a, b) => (a.created === b.created ? a.id.localeCompare(b.id) : a.created.localeCompare(b.created)))
}

/** The sentence a review's `says` ends with when it lists comments saved without sending. Empty when it lists none. */
function savedSays(saved: readonly FoundMember[]): string {
  if (saved.length === 0) return ''
  const many = `${String(saved.length)} comment${saved.length === 1 ? '' : 's'}`
  return (
    ` It also lists ${many} saved without sending before it started, on what it reviews. Sending the review ` +
    `sends ${saved.length === 1 ? 'it' : 'them'}, each to the agent chosen for it.`
  )
}

/**
 * WHERE A CARRIED-FORWARD REVIEW'S WORDS LIVE, SAID EVERY TIME, BECAUSE MOLE OFFICE CANNOT WATCH THEM.
 *
 * A review brought forward from round seven reads its remarks out of `agent_messages`, and
 * `removeMessage` deletes those rows outright — no tombstone, nothing in `changes`, nothing left to
 * measure. So a comment removed there leaves this review reading "0 remarks so far", which is the
 * sentence a review nobody has written in gets. Mole Office cannot say what was taken. It CAN say, every
 * time, that this is where the words are and that removing one there removes it here, which is the
 * difference between an answer and silence.
 */
function conversationGaps(row: ReviewRow): ReviewGap[] {
  if (row.fromThreadId === null) return []
  const thread = db
    .select({ id: agentThreads.id })
    .from(agentThreads)
    .where(eq(agentThreads.id, row.fromThreadId))
    .get()
  if (thread === undefined) {
    return [
      {
        code: 'conversationGone',
        values: {},
        says:
          `The conversation ${row.fromThreadId} this review's comments were written into is not in this database now, ` +
          `so none of them can be read. Nothing has been reconstructed.`,
      },
    ]
  }
  // THE CONSEQUENCE IS WORTH A SENTENCE. THE MECHANISM IS NOT.
  //
  // This used to name the conversation by its id and explain that the comments are read on every
  // request rather than copied — a database id and an implementation detail, in a paragraph a person
  // reads in the pane. What somebody actually needs to know is that the words live somewhere else
  // and that deleting one there takes it from here. Finding 6 of the language audit. The id is still
  // on the review itself, where an agent and Developer mode read it.
  return [
    {
      code: 'conversationShows',
      values: {},
      says: 'This review shows the comments in one conversation. Delete a comment there and it leaves this review too.',
    },
  ]
}

/**
 * ONE FROZEN MEMBER, READ BACK — OR THE REAL REASON IT CANNOT BE, WHICH IS NEVER "IT IS GONE"
 * UNLESS IT IS GONE.
 *
 * Five things can be true of a record a frozen review named, and they are five different sentences.
 * They were one sentence — "that note is not in this database now" — until 19 August 2026, because
 * every failure arrived here as a `null`. A member whose kind had been changed to `note` read as
 * missing while `GET /api/records/<id>` served it, words and all. That is Mole Office claiming an
 * absence it never measured, which is the fifth rule in `CLAUDE.md` inverted.
 */
function frozenAnnotation(id: string, workspaceId: string, wroteIt: string | undefined): ReadMember {
  const stillThere = `Its words are still in the record: GET /api/records/${id}.`
  const record = getRecord(id)
  if (record === null) {
    return {
      problem:
        `There is no record ${id} in this database now. This review contained it when collecting finished, and ` +
        `nothing has been reconstructed from it.`,
    }
  }
  // A COMMENT THAT IS A MESSAGE IS KEPT IN THE MESSAGE CENTRE and belongs to no project; which
  // review it belongs to is the record it points at, which the review's own rule already asked.
  if (record.workspaceId !== workspaceId && record.workspaceId !== MESSAGE_CENTRE) {
    return {
      problem:
        `The comment ${id} is filed in "${record.workspaceId}" now and this is a review of "${workspaceId}", so it ` +
        `cannot be read here. ${stillThere}`,
    }
  }
  if (record.deletedAt !== null) {
    return {
      problem:
        `The comment ${id} was deleted at ${record.deletedAt}. It was in this review when collecting finished and ` +
        `deleting it did not change that. ${stillThere}`,
    }
  }
  // A COMMENT IS EITHER KIND. A record of kind `annotation` is every comment written before comments
  // and messages became one thing; a message that says what on a page it is about is every comment
  // written since. A frozen review that named only the first would report every new comment it held
  // as gone.
  if (!isAComment(record)) {
    return {
      problem:
        `${id} is a ${kindWord(record.kind).text} now and says nothing about what on a page it is about, so it is ` +
        `not a comment left on something and this review cannot read it as one. It was in this review ` +
        `when collecting finished. ${stillThere}`,
    }
  }
  return memberOfAnnotation(record, wroteIt)
}

/**
 * The members a frozen review was written down as holding, read back.
 *
 * A MEMBER THAT IS NO LONGER THERE IS REPORTED, NEVER DROPPED. The review contained it; that is a
 * fact about what somebody collected, and quietly shortening the list would make a review that has
 * lost a remark look like one that never had it.
 */
function frozenMembers(frozen: FrozenMember[], workspaceId: string): ReviewMember[] {
  const annotationIds = frozen.filter((m) => m.source === 'annotation').map((m) => m.id)
  const messageIds = frozen.filter((m) => m.source === 'conversation').map((m) => m.id)

  const read = new Map<string, ReadMember>()
  const wroteIt = whoWroteRecords(annotationIds)
  for (const id of annotationIds) read.set(`annotation:${id}`, frozenAnnotation(id, workspaceId, wroteIt.get(id)))
  if (messageIds.length > 0) {
    // IN PIECES (src/server/db/in-pieces.ts): a frozen review holds every comment it collected, and nothing caps
    // that. The rows go into a map by id, so their order is not used.
    const rows = readInPieces(messageIds, (piece) => db.select().from(agentMessages).where(inArray(agentMessages.id, piece)).all())
    for (const row of rows) read.set(`conversation:${row.id}`, memberOfMessage(row, workspaceId))
  }

  return frozen.map((m): ReviewMember => {
    const one = read.get(`${m.source}:${m.id}`)
    if (one !== undefined && 'member' in one) return one.member
    return {
      found: false,
      source: m.source,
      id: m.id,
      says:
        one !== undefined
          ? one.problem
          : `This review contained the comment ${m.id} from the conversation it was collected in, and that ` +
            `comment is not there now. Nothing has been reconstructed from it.`,
    }
  })
}

// ================================================================= the comments a review left out

/**
 * WHICH CLAUSE OF THE MEMBERSHIP RULE LEFT A COMMENT OUT. Declared in lib/frozen-membership.ts,
 * because a review writes its clauses into that column, and re-exported here so that every reader
 * and every test keeps one name for them.
 */
export { NOT_IN_IT_CLAUSES } from './frozen-membership.ts'
export type { NotInItClause } from './frozen-membership.ts'

/**
 * THE WORD AN EXCLUDED ROW DRAWS. Seven, closed, and no eighth is invented anywhere.
 *
 * `not-known` is the honest floor and it is a real answer: Mole Office has the row and cannot say which
 * of the other six describes it. It is never a placeholder for a reason nobody looked for.
 */
export const NOT_IN_IT_REASONS = [
  'earlier',
  'later',
  'elsewhere',
  'other-author',
  'sent',
  'in-another-review',
  'not-known',
] as const

export type NotInItReason = (typeof NOT_IN_IT_REASONS)[number]

/**
 * Which word each clause draws. TOTAL over the clause union, so a clause added without a word
 * fails `tsc --noEmit` rather than falling through to `not-known`, which is the answer that hides
 * a missing rule behind the word for honesty.
 */
export const REASON_FOR_CLAUSE: Readonly<Record<NotInItClause, NotInItReason>> = {
  'written-before-it-started': 'earlier',
  'does-not-read-as-a-comment': 'not-known',
  'outside-the-scope': 'elsewhere',
  'nobody-recorded-who-wrote-it': 'not-known',
  'somebody-else-wrote-it': 'other-author',
  'sent-on-its-own': 'sent',
  'written-after-collecting-finished': 'later',
  'not-in-the-frozen-membership': 'not-known',
}

/**
 * What each clause means, in one sentence. Total over the union, for the same reason.
 *
 * These are the sentences a fold, a `title` or Inspect draws. A row draws the word.
 */
export const WHAT_A_CLAUSE_MEANS: Readonly<Record<NotInItClause, string>> = {
  'written-before-it-started': 'This comment was written before the review started collecting.',
  'does-not-read-as-a-comment':
    'Mole Office cannot read this record as a comment, so it cannot say what it is about or whether it belongs here.',
  'outside-the-scope': 'This comment is about something the review does not collect.',
  'nobody-recorded-who-wrote-it': 'No writer is recorded for this comment, so Mole Office cannot say whether it is one of yours.',
  'somebody-else-wrote-it': 'Another writer’s comment. A review holds one person’s own remarks.',
  'sent-on-its-own': 'This comment was sent on its own when it was written, so it does not go with a review.',
  'written-after-collecting-finished': 'This comment was written after collecting finished.',
  'not-in-the-frozen-membership':
    'Collecting finished before this, and the membership Mole Office wrote down does not name this comment. ' +
    'Why it was left out was not written down.',
}

/**
 * THE WORD ONE ROW DRAWS, decided in one place from three facts and nothing else.
 *
 * The precedence is stated rather than left in the order of a chain of ifs. Where the comment went
 * beats why this review did not take it, because "it is in that review" and "it has been sent" are
 * what a person does something about, and the clause is still on the row for anybody who wants the
 * mechanism. Nothing is dropped: the detail sentence names both.
 */
export function reasonToDraw(row: {
  clause: NotInItClause
  alreadySent: boolean
  inAnotherReview: string | null
}): NotInItReason {
  if (row.inAnotherReview !== null) return 'in-another-review'
  if (row.alreadySent) return 'sent'
  return REASON_FOR_CLAUSE[row.clause]
}

/**
 * ONE COMMENT THIS REVIEW DID NOT TAKE. A real row, with everything a working press needs.
 *
 * `context` and `key` are null exactly when Mole Office could not read the record as a comment, which is
 * the one case where there is nothing to take anybody to. Every other row can be pressed.
 */
export interface CommentNotInReview {
  /** The comment's own destination, not the default of a review that does not hold it. */
  recipientName?: string | null
  source: MemberSource
  /** The annotation's record id. */
  id: string
  /** WHAT THE PERSON WROTE, exactly. Never rewritten and never shortened here. */
  body: string
  /** What it points at, or null because this record does not read as a comment. */
  context: Context | null
  /** The same string an addressable element on screen carries as `data-target`, or null. */
  key: string | null
  /**
   * WHAT IT POINTS AT, IN THE SAME SENTENCE A MEMBER ROW DRAWS, or null for the same reason `key`
   * is null.
   *
   * It is here so that the two groups in the pane are the same row drawn twice and not two designs
   * of a row. `memberOfAnnotation` has already worked this out on the line above; taking it is
   * free, and leaving it out would have made the browser invent a second way to name the same
   * thing for the group that most needs to look ordinary.
   */
  about: string | null
  created: string
  createdBy: string
  /** `queued`, `sent` or `answered`, as the comment's own record holds it. */
  state: string
  /** Which clause of the membership rule left it out. */
  clause: NotInItClause
  /** True when the comment's own record says it has been sent. */
  alreadySent: boolean
  /** The id of another review whose written-down membership names it, or null. */
  inAnotherReview: string | null
  /** The word to draw, from `reasonToDraw`. */
  reason: NotInItReason
  /** The whole of it in sentences, for a fold, a `title` or Inspect. Never for the row itself. */
  detail: string
}

/** How many excluded rows one reply carries. The rest are counted, never hidden. */
export const NOT_IN_IT_SHOWN = 20

/** The comments this review did not take, with why, and what the reading looked at. */
export interface CommentsNotInReview {
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<CommentsNotInBucket>[]

  rows: CommentNotInReview[]
  /** How many there are in the population, which may be more than `rows`. */
  total: number
  /** How many are not on this reply. `rows.length + leftOut === total`. */
  leftOut: number
  /** What this reading did NOT look at, named rather than left to be discovered. */
  limits: string[]
  read: {
    /** Comments in this project that were read. */
    comments: number
    /** Other reviews whose written-down membership was read. */
    reviewsRead: number
    /** What this reading took, in milliseconds. Measured, not estimated. */
    tookMs: number
  }
}

/**
 * THE COMMENTS IN THIS PROJECT THAT ARE NOT IN THIS REVIEW, EACH WITH WHY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Measured on the owner's own screen: two comments they had written fell outside a review started
 * three minutes later, and the interface told them "2 other comments in this project are waiting and
 * are not in this review. They are still stored." A count, no ids, and no way through to any of
 * them. Everything needed to draw a row with a working press was on the server and none of it was
 * on the wire.
 *
 * ---------------------------------------------------------------------------------------
 * THE POPULATION, AND WHY IT IS THIS ONE
 * ---------------------------------------------------------------------------------------
 *
 * This project, not in this review, not deleted. It is deliberately NOT "everything waiting to be
 * sent": that population admits comments already sent and comments belonging to another review that
 * has been collected, and neither of those is described by any of the words a row can draw.
 *
 * ---------------------------------------------------------------------------------------
 * THE CLAUSE COMES OUT OF THE MEMBERSHIP RULE, IN THAT RULE'S OWN ORDER
 * ---------------------------------------------------------------------------------------
 *
 * `membersOf` above decides who is in. This decides why somebody is out, and it walks the same
 * branches in the same order, so the two cannot come to disagree about one comment. That is the
 * whole reason the clause list reads like a transcript of that function.
 *
 * A FROZEN REVIEW IS ANSWERED DIFFERENTLY AND SAYS SO. Once collecting has finished, membership is
 * the list that was written down; the five collecting clauses would describe the rule as it would
 * run NOW, which is a claim about the past Mole Office cannot make. So a frozen review answers `later`
 * for anything written after it was collected and `not-known` for everything else, and the sentence
 * says that nobody wrote down why.
 */
function commentsNotInWithinOneRead(
  id: string,
  workspaceId: string,
  shown: number = NOT_IN_IT_SHOWN,
  /**
   * WHO IS ASKING, or null for every comment. See `readReview`. A comment this reader may not read
   * is left out before anything is counted, so `rows`, `total`, `leftOut` and
   * `read.comments` all count only what it may read.
   */
  reader: AMessageReader | null = null,
): CommentsNotInReview {
  const startedAt = performance.now()
  const row = reviewRow(id, workspaceId)
  const review = toReview(row)
  const scope = scopeOf(review.entry, review.workspaceId, review.reach)
  const frozen = frozenOf(row)
  // WHAT EVERY REVIEW OF THE PROJECT READS IN COMMON, read once for this answer.
  const project = oneProjectsReviews(workspaceId)

  // WHAT THIS REVIEW HOLDS, from the same place `readReview` gets it. A frozen review is read as
  // the ids that were written down — `frozenMembers` would also read every one of those records
  // back, and nothing here needs their words.
  const held = new Set(
    frozen === null
      ? membersOf(row, scope, null, project).members.map((member) => member.id)
      : frozen.members.map((member) => member.id),
  )
  // A COMMENT SAVED WITHOUT SENDING THAT THIS REVIEW LISTS IS NOT A ROW HERE. It has its own group in
  // the pane, and the send carries it; a second row calling it `Earlier` would say it is left out.
  for (const one of savedNotSent(row, scope, null, project)) held.add(one.id)

  /**
   * WHY THIS REVIEW LEFT EACH COMMENT OUT, AS IT WROTE IT DOWN. Empty for a review still
   * collecting, where the rule below is the live answer, and empty for a review frozen before
   * Mole Office wrote these down at all.
   */
  const writtenDown = new Map<string, NotInItClause>(
    (frozen?.leftOut ?? []).map((one) => [one.id, one.clause]),
  )

  // WHOSE WRITTEN-DOWN MEMBERSHIP ALREADY NAMES THIS COMMENT. Only reviews that have finished
  // collecting are read: a collecting review's membership is worked out on every read, and running
  // that for every review in the project would be one containment walk per review to answer a
  // question about one. The limit is said on the reply rather than left to be found.
  const otherFrozen = project.rows()
  const inAnother = new Map<string, string>()
  let reviewsRead = 0
  for (const other of otherFrozen) {
    if (other.id === row.id || other.frozen === null) continue
    // AN ABANDONED REVIEW HELD THESE COMMENTS AND DID NOT COLLECT THEM. Its membership is written
    // down so that what it held stops moving, but nothing came of it and nothing ever will, so
    // saying `In another review` about one of its comments would send a person to a review that
    // was ended. Contract §6.18 promises the annotations are untouched and come back to the next
    // review under their own reason, and this line is what makes that true.
    if (other.state === 'abandoned') continue
    reviewsRead += 1
    for (const member of frozenOf(other)?.members ?? []) {
      if (!inAnother.has(member.id)) inAnother.set(member.id, other.id)
    }
  }

  const everyComment = project.comments()
  const hidden = theCommentsHiddenFrom(reader, everyComment.map((record) => ({ id: record.id, source: 'annotation' as const })))
  const comments = everyComment.filter((record) => !hidden.has(record.id))
  const wroteIt = whoWroteRecords(comments.map((record) => record.id))
  const out: CommentNotInReview[] = []

  for (const record of comments) {
    if (held.has(record.id)) continue
    const wrote = wroteIt.get(record.id)
    const read = memberOfAnnotation(record, wrote)
    const clause =
      writtenDown.get(record.id) ??
      clauseFor(record, review, scope, frozen !== null, row.collectedAt, 'member' in read ? read.member : read, wrote)
    const alreadySent = hasGoneOut(record.id, record.workspaceId)
    const inAnotherReview = inAnother.get(record.id) ?? null
    const body = 'member' in read ? read.member.body : typeof record.data['body'] === 'string' ? record.data['body'] : ''
    out.push({
      source: 'annotation',
      id: record.id,
      body,
      context: 'member' in read ? read.member.context : null,
      key: 'member' in read ? read.member.key : null,
      about: 'member' in read ? read.member.reading.about : null,
      created: record.createdAt,
      createdBy: wrote ?? NOBODY_RECORDED,
      // THE SAME ONE READER the pane reads. See `howFarThisCommentHasGot` above.
      // WHERE THIS COMMENT HAS GOT TO, WORKED OUT FROM THE ONE STORE AND NOT READ OFF THE RECORD.
      //
      // It used to be `record.data['state']`, which was a second place where "this has gone out"
      // was written down: stamped from the browser after the send, in a `try/catch` that could fail
      // without failing anything, and walkable back to `queued` in one PATCH. `dispatchOf` answers
      // it from the messages that carried these words.
      //
      // IT IS NOT THE SAME QUESTION AS "HAS ANYBODY BEEN HANDED THESE WORDS". A live session can
      // take a comment straight from the door before any review carries it, and this word stays
      // `queued` when that happens — correctly, because the review has still not sent it and still
      // must. `alreadyHandedOver` is that other question, and `plan` below asks it for the sentence
      // under the comment. Problems `-4GypldN_XMS` and `p9enuTYIC-S6` are the two halves of it.
      state: dispatchOf([record.id], record.workspaceId)[record.id]?.word ?? 'queued',
      clause,
      alreadySent,
      inAnotherReview,
      reason: reasonToDraw({ clause, alreadySent, inAnotherReview }),
      detail:
        `${WHAT_A_CLAUSE_MEANS[clause]}` +
        ('problem' in read ? ` ${read.problem}` : '') +
        (alreadySent ? ' It has already been sent.' : '') +
        (inAnotherReview === null ? '' : ` It is in the review ${inAnotherReview}, and that review's membership is written down.`),
    })
  }

  // NEWEST FIRST. Two comments written in the same second are ordered by id, which is a nanoid and
  // says nothing about either — the same last resort `membersOf` uses, for the same reason.
  out.sort((a, b) => (a.created === b.created ? a.id.localeCompare(b.id) : b.created.localeCompare(a.created)))
  const shownRows = out.slice(0, Math.max(0, shown))
  const recipients = recipientNamesOfComments(shownRows.map((one) => getRecord(one.id)).filter((one): one is PanelRecord => one !== null), workspaceId)
  const rows = shownRows.map((one) => ({ ...one, recipientName: recipients[one.id] }))
  const leftOutGroups: LeftOutGroup<CommentsNotInBucket>[] = [{
    cause: 'budget', bucket: 'row_limit', count: out.length - rows.length,
    ids: out.slice(rows.length).map((row) => row.id),
  }]
  const subtraction: LeftOutCounts = { candidates: out.length, carried: rows.length, leftOut: out.length - rows.length, shortened: 0 }
  checkSubtraction('commentsNotIn', subtraction, leftOutGroups)

  return {
    rows,
    total: out.length,
    subtraction,
    leftOutGroups,
    leftOut: subtraction.leftOut,
    limits: [
      // THE THREE SENTENCES ARE THE WORD LISTS' (shared/review-pane-words.ts), so the column draws them in its language.
      ...WHAT_THE_NOT_IN_READING_LEAVES_OUT.map((key) => sayInEnglish(key)),
      ...(subtraction.leftOut === 0
        ? []
        : [leftOutWords(COMMENTS_NOT_IN_BUCKET_WORDS.row_limit, subtraction.leftOut)]),
    ],
    read: {
      comments: comments.length,
      reviewsRead,
      tookMs: Math.round((performance.now() - startedAt) * 10) / 10,
    },
  }
}

/**
 * Which branch of the membership rule this comment fell out at, in that rule's own order.
 *
 * Split out so the order is one list a person can read against `membersOf`, rather than a chain
 * buried inside a loop that is also building rows.
 *
 * ON A FROZEN REVIEW THIS IS THE FLOOR AND NOT THE ANSWER. `commentsNotIn` reads the clause the
 * review wrote down when collecting finished, and only falls to this when there is none: for a
 * comment written after the freeze, which did not exist to be written down, and for a review frozen
 * before Mole Office wrote these down at all. The five collecting clauses are not run here, because they
 * would describe the rule as it would run NOW — and a record moves, so that is a claim about the
 * past Mole Office cannot make.
 */
function clauseFor(
  record: PanelRecord,
  review: ReviewView,
  scope: ReviewScope,
  membershipFrozen: boolean,
  collectedAt: string | null,
  read: WhereACommentIs,
  wrote: string | undefined,
): NotInItClause {
  if (membershipFrozen) {
    const after = collectedAt ?? review.started
    return record.createdAt > after ? 'written-after-collecting-finished' : 'not-in-the-frozen-membership'
  }
  if (record.createdAt < review.started) return 'written-before-it-started'
  if ('problem' in read) return 'does-not-read-as-a-comment'
  if (!insideScope(scope, read.context.target, review.workspaceId)) return 'outside-the-scope'
  if (wrote === undefined) return 'nobody-recorded-who-wrote-it'
  if (wrote !== review.startedBy) return 'somebody-else-wrote-it'
  if (sentOnItsOwn(record)) return 'sent-on-its-own'
  // EVERY CLAUSE SAYS THIS IS A MEMBER AND THE MEMBERSHIP DOES NOT HOLD IT. That is the two
  // readings having drifted, which is the one thing walking the same branches in the same order is
  // meant to prevent, so it is said out loud rather than labelled with whichever word is nearest.
  throw new PanelError(
    `The comment ${record.id} passes every clause of review ${review.id}'s membership rule and the review does ` +
      `not hold it. Mole Office will not say why it is out, because the two readings disagree. Nothing has been ` +
      `guessed and nothing has been changed.`,
    500,
  )
}

// ============================================================================ reading one review

function reviewRow(id: string, workspaceId: string): ReviewRow {
  const row = db.select().from(reviews).where(eq(reviews.id, id)).get()
  if (row === undefined) {
    throw new PanelError(`There is no review ${id}. GET /api/reviews lists this project's reviews.`, 404)
  }
  if (row.workspaceId !== workspaceId) {
    throw new PanelError(
      `Review ${id} is a review of "${row.workspaceId}" and this request is about "${workspaceId}". A review is ` +
        `of one project's work. Ask again with x-mole-office-workspace: ${row.workspaceId}.`,
      404,
    )
  }
  return row
}

/**
 * How a review's state reads in a sentence, with what is true of it now.
 *
 * THREE OF THESE SENTENCES USED TO BE WRITTEN WITHOUT LOOKING AT THE MEMBERS.
 *
 *   · "Nothing has been sent" was stated unconditionally on a collected review, six inches on one
 *     22rem pane from a heading that read "1 comment, 1 sent."
 *   · The count was a count of what was COLLECTED wearing the name of a count of what is PRESENT,
 *     so a review that had lost one of three still read "holding 3 comments" with a row underneath
 *     saying one of them was not there.
 *   · "Nothing can change it now" was said of a membership while the pane offered a control that
 *     deleted a member. The membership really cannot change. The comments in it are ordinary
 *     records and can be deleted, and this now says which of the two it means.
 */
/**
 * WHAT MOLE OFFICE MADE OF THESE COMMENTS, ASSEMBLED FROM WHAT IS STORED BESIDE EACH OF THEM.
 *
 * NULL WHEN NOTHING HAS READ THEM, and that is read off the comments rather than off the review's
 * state word. The two can part company on purpose: a person may take a reading away with an
 * ordinary record patch — `PATCH /api/records/<id> {"dataPatch":{"interpretation":null}}` — and the
 * review does not go backwards to "collected" because of it. An interpretation is refusable, and a
 * refused one has to be able to leave without rewriting the history of the review.
 *
 * WHY A COMMENT HAS NOTHING BESIDE IT IS TWO DIFFERENT FACTS AND THEY ARE SAID DIFFERENTLY. A
 * comment whose words live in a conversation has nowhere to keep one. A comment record with nothing
 * in the field either was never read or had its reading taken away, and Mole Office cannot tell those
 * apart afterwards, so it says both rather than picking one.
 */
function organisedOf(members: readonly ReviewMember[], groups: readonly OrganisedGroup[]): OrganisedView | null {
  const readings: OrganisedView['readings'] = []
  const without: OrganisedView['without'] = []
  for (const member of members) {
    if (!member.found) continue
    if (member.interpretation !== null) {
      readings.push({ id: member.id, source: member.source, interpretation: member.interpretation })
      continue
    }
    without.push({
      id: member.id,
      source: member.source,
      says:
        member.source === 'conversation'
          ? `This comment is kept in a conversation, which has no place for a reading. A reading of it can be ` +
            `shown, not stored.`
          : `Nothing is stored beside this comment, and Mole Office cannot say whether it was never read or its ` +
            `reading was removed.`,
    })
  }
  if (readings.length === 0) return null
  const many = `${String(readings.length)} of the ${String(readings.length + without.length)} comments`
  return {
    readings,
    without,
    groups: [...groups],
    says:
      `${many} carr${readings.length === 1 ? 'ies' : 'y'} a reading, shown beside the words, never instead of them. ` +
      `Each reading can be changed or removed, and nothing has been filed from them.` +
      (without.length === 0 ? '' : ` ${String(without.length)} ${without.length === 1 ? 'has' : 'have'} none; each row says what Mole Office can tell about it.`) +
      // WHAT WAS TRUE OF SEVERAL AT ONCE, COUNTED FROM THE ROW THAT HOLDS IT. Silence here would
      // make a review whose groups were lost read exactly like one where the reading found none.
      (groups.length === 0
        ? ''
        : ` ${String(groups.length)} reading${groups.length === 1 ? ' covers' : 's cover'} several comments and ` +
          `${groups.length === 1 ? 'is' : 'are'} shown under each; correcting one comment's reading does not change ` +
          `${groups.length === 1 ? 'it' : 'them'}.`),
  }
}

/**
 * WHAT A READING SAID ABOUT SEVERAL OF THIS REVIEW'S COMMENTS AT ONCE, as it is stored.
 *
 * EMPTY IS TWO ANSWERS AND THIS IS ONE OF THEM. A NULL column is "nothing has read these comments"
 * and an empty list is "somebody read them and found nothing true of several at once"; both come
 * back as an empty list here, and which one it is is `organised === null` on the detail — the same
 * question, read from the same place it always was.
 *
 * UNREADABLE JSON IS A FAULT AND IS REPORTED AS ONE. Answering "no groups" for a column Mole Office
 * cannot parse would turn a stored finding into an absence, which is the fifth engineering rule.
 */
function groupsOf(row: ReviewRow): OrganisedGroup[] {
  if (row.readGroups === null) return []
  try {
    const held = JSON.parse(row.readGroups) as unknown
    if (!Array.isArray(held)) throw new Error('not a list')
    return held as OrganisedGroup[]
  } catch {
    throw new PanelError(
      `Review ${row.id} stores what was read of several of its comments at once, and Mole Office cannot read it as ` +
        `JSON, so it will not say either that there are groups or that there are none. Nothing has been guessed. ` +
        `The stored text starts: ${row.readGroups.slice(0, 120)}`,
      500,
    )
  }
}

function saysOf(
  review: ReviewView,
  members: readonly ReviewMember[],
  rule: ReviewScope,
  gaps: readonly string[],
  organisedView: OrganisedView | null,
): string {
  const count = members.length
  const many = `${String(count)} comment${count === 1 ? '' : 's'}`
  const missing = members.filter((m) => !m.found).length
  const sent = members.filter((m) => m.found && m.state !== 'queued').length
  // WHAT WAS MADE OF THEM, OR THAT NOTHING WAS. Both sentences come from what is stored beside the
  // comments; neither is written twice, and the absent one is a sentence this file imports rather
  // than a second copy of the same words.
  const organised = organisedView === null ? NOTHING_HAS_READ_THEM : organisedView.says
  const notThere =
    missing === 0
      ? ''
      : ` ${String(missing)} of them ${missing === 1 ? 'is' : 'are'} not there to read now, and the row for ` +
        `${missing === 1 ? 'it' : 'each'} says why.`
  const handed =
    sent === 0
      ? ' Nothing has been sent.'
      : ` ${String(sent)} of them ${sent === 1 ? 'has' : 'have'} been sent on ${sent === 1 ? 'its' : 'their'} own.`
  const lost = rule.kind === 'gone' ? ` ${rule.says}` : ''
  const said = gaps.length === 0 ? '' : ` ${gaps.join(' ')}`

  if (review.state === 'collecting') {
    const inside =
      rule.kind === 'gone'
        ? lost
        : ` What is inside is still a live question: ${rule.says} Anything written inside that, by ` +
          `${review.startedBy}, joins this review until collecting is finished.`
    return `Collecting since ${review.started}. ${many} so far.${inside}${notThere}${said} ${organised}`
  }
  if (review.state === 'collected') {
    return (
      `Collecting finished ${review.collectedAt ?? 'at a moment nothing recorded'}, holding ${many}. Which comments ` +
      `are in it was written down at that moment and cannot change — a link made next week cannot change what ` +
      `this review contained. A comment in it is still an ordinary record and can still be deleted. This list ` +
      `says when one has been rather than getting shorter.${notThere}${handed}${lost}${said} ${organised}`
    )
  }
  if (review.state === 'organised') {
    // SOMEBODY ORGANISED IT AND THERE IS NOTHING BESIDE THE COMMENTS NOW. That is a real state — a
    // reading is refusable, and taking every one away is allowed — and it must not read as "this
    // was never organised", which is a different thing that happened.
    const nowStands =
      organisedView === null
        ? ` Nothing is stored beside any of these comments now. A reading was made and marked here, and every one ` +
          `of them has since been taken away or could not be kept.`
        : ` ${organisedView.says}`
    return `Organised, holding ${many}.${notThere}${handed}${lost}${said}${nowStands}`
  }
  // ABANDONED IS NOT A KIND OF SENT AND MUST NOT FALL THROUGH TO ONE. This used to be a bare
  // `return` for the fourth state, which is exactly the shape that makes a fifth state read as the
  // fourth: an abandoned review would have said "Sent, holding 4 comments." with nothing sent.
  if (review.state === 'abandoned') {
    return (
      `Abandoned ${review.collectedAt ?? 'at a moment nothing recorded'}, holding ${many}. Nothing in it was ` +
      `sent and nothing more will be. What was in it was written down at that moment, so this list does not ` +
      `change now. The comments themselves are untouched: each is still an ordinary record, and a review ` +
      `started later collects the ones it reaches.${notThere}${lost}${said}`
    )
  }
  return `Sent, holding ${many}.${notThere}${lost}${said}`
}

/**
 * ONE REVIEW, AS THIS READER MAY SEE IT.
 *
 * `reader` is who is asking, as `theMessageReader` reads the caller, or null for the whole review.
 * Null is for the office's own acts only: the send and the check of a reading, which must see every
 * comment. A comment the reader may not read is left out of `members`, and
 * so out of `count`, `gaps`, `organised`, `readiness` and `says`, which are all worked out from what
 * is left. A group of a reading that names such a comment is left out too, because its sentence is
 * about that comment's words. So the answer shows neither the words, the ids nor how many were left
 * out, as wave 13j's lists do.
 *
 * A REVIEW WITH NO COMMENT THIS READER MAY READ STILL ANSWERS, with no comments. The review itself is
 * not a message: its row says who started it, from where and when, and none of that is a comment's
 * words. Every other reader of the review list (GET /api/reviews) is shown that row already.
 */
function readReviewWithinOneRead(id: string, workspaceId: string, reader: AMessageReader | null = null): ReviewDetail {
  return readReviewRow(reviewRow(id, workspaceId), reader, oneProjectsReviews(workspaceId))
}

function collectingStampOf(row: ReviewRow, members: readonly ReviewMember[], saved: readonly FoundMember[]): string {
  // No timestamp rounded to a second: two edits in one second must still differ. These are the
  // filtered members already read for this reader, before adding display-only recipient names.
  return createHash('sha256').update(JSON.stringify([row.goesTo, members, saved])).digest('hex')
}

/**
 * ONE REVIEW, FROM ITS ROW, with what every review of its project reads in common handed in. `readReview`
 * reads the row and makes `project` for one review; the worker's pass reads both once for every review.
 */

function readReviewRow(row: ReviewRow, reader: AMessageReader | null, project: OneProjectsReviews): ReviewDetail {
  const review = toReview(row)
  // ONE SCOPE PER REQUEST, worked out here and handed to the membership. It was worked out twice —
  // once here and once inside `membersOf` — which is the same function on the same input and so
  // cannot disagree, but it does mean two containment walks for one answer.
  const rule = scopeOf(review.entry, review.workspaceId, review.reach)
  const { members, gaps: gapForms, hidden } = membersOf(row, rule, reader, project)
  const gaps = gapForms.map((gap) => gap.says)
  // A GROUP NAMING A COMMENT THIS READER MAY NOT READ IS LEFT OUT. Every other group is shown as before.
  const groups = groupsOf(row).filter((one) => !one.commentIds.some((commentId) => hidden.has(commentId)))
  const organised = organisedOf(members, groups)
  const saved = savedNotSent(row, rule, reader, project)
  const goesTo = goesToOf(row, [...members, ...saved])
  // WHAT IT WAITS FOR IS ASKED ONLY OF A REVIEW THAT CAN WAIT, and only of the comments this reader is shown.
  const shown = new Set([...members, ...saved].map((one) => one.id))
  const takenOut = review.state === 'collecting' || review.state === 'abandoned'
    ? null
    : takenOutOf(row).filter((one) => shown.has(one.id))
  return {
    review,
    collectingStamp: collectingStampOf(row, members, saved),
    rule,
    ...(takenOut === null ? {} : { takenOut, waitsFor: whatTheReviewWaitsFor([...members, ...saved], takenOut) }),
    members: members.map((one) => one.found
      ? { ...one, recipientName: one.source === 'conversation' ? one.recipientName
          : nameOfRecipient(whereOneCommentGoes(one, review.workspaceId, goesTo), review.workspaceId) }
      : one),
    saved: saved.map((one) => ({ ...one, recipientName: nameOfRecipient(whereOneCommentGoes(one, review.workspaceId, goesTo), review.workspaceId) })),
    count: members.length,
    gaps,
    gapForms,
    organised,
    // WHETHER IT CAN BE SENT IS ASKED OF EVERYTHING THE SEND CARRIES, the saved comments too, so the
    // readiness word cannot say "ready" over a saved comment the send would refuse for want of a recipient.
    // A comment nobody chose anybody for is asked about where the review sends it, which is where the send sends it.
    readiness: readinessOf(review, withWhereTheReviewSendsIt([...members, ...saved], goesTo, review.workspaceId)),
    goesTo,
    says: saysOf(review, members, rule, gaps, organised) + savedSays(saved),
  }
}

/**
 * EVERYTHING A REVIEW'S SEND WOULD CARRY: its members and the comments it lists as saved, read as `readReviewRow`
 * reads them and by the same two functions. The message worker asks this on every pass, so it reads nothing else:
 * who the review goes to and its readiness are not part of what it holds back.
 */
function whatItWouldSend(row: ReviewRow, project: OneProjectsReviews, only?: AskedAbout): ReviewMember[] {
  const review = toReview(row)
  const rule = scopeOf(review.entry, review.workspaceId, review.reach)
  const { members } = membersOf(row, rule, null, project, only)
  return [...members, ...savedNotSent(row, rule, null, project, false, only)]
}

// ============================================================================ who it goes to

/** The recipient stored for the whole review, or null because nobody has said. */
function saidGoesTo(row: ReviewRow): AgentByRecord | null {
  if (row.goesTo === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(row.goesTo)
  } catch {
    parsed = null
  }
  const one = parsed as Record<string, unknown> | null
  if (one === null || typeof one !== 'object' || one['kind'] !== 'agent' || typeof one['agentId'] !== 'string' || one['agentId'] === '') {
    throw new PanelError(
      `Review ${row.id} stores its recipient in an unreadable form, so Mole Office cannot say where it ` +
        `goes. Nothing has been guessed. It starts: ${row.goesTo.slice(0, 120)}`,
      500,
    )
  }
  return { kind: 'agent', agentId: one['agentId'], sessionId: null, said: null, why: null }
}

/**
 * THE AGENT RECORDED AS WRITING THE PAGE A REVIEW WAS STARTED ON, by its agent record, or null because none is.
 *
 * It is the create row of that record's change log (`whoFiled`), named by the product's one resolver,
 * `participantForActor`, the same way the recipient ranking names its `filed-this-record` rung. A create row by a
 * person, no create row, or a stamp naming two agents all answer null: nothing is guessed.
 */
function whoWroteThePage(row: ReviewRow): AgentByRecord | null {
  if (row.reach === 'global') return null
  const id = recordNamedBy(entryOf(row).target)
  if (id === null) return null
  const filed = whoFiled(row.workspaceId, id)
  if (filed === null || filed.actorType !== 'agent') return null
  let who: ReturnType<typeof participantForActor> = null
  try {
    who = participantForActor({ type: 'agent', id: filed.actorId })
  } catch (err) {
    if (err instanceof PanelError && err.status === 409) return null
    throw err
  }
  if (who === null || who.kind !== 'agent') return null
  const agentRecord = theModelOnTheAgentRecord(who.id)?.record ?? null
  return agentRecord === null ? null : { kind: 'agent', agentId: agentRecord, sessionId: null, said: null, why: null }
}

/** WHO THIS REVIEW GOES TO, worked out here and only here. See `ReviewGoesTo`. */
function goesToOf(row: ReviewRow, carries: readonly ReviewMember[]): ReviewGoesTo {
  const said = saidGoesTo(row)
  const writer = said === null ? whoWroteThePage(row) : null
  const recipient = said ?? writer
  const ground: ReviewGoesTo['ground'] = said !== null ? 'chosen' : writer !== null ? 'wrote-the-page' : 'nobody-recorded'
  const name = recipient === null ? null : (getRecord(recipient.agentId)?.title ?? null)
  const elsewhere = carries
    .filter((one): one is FoundMember => one.found && one.state === 'queued' && one.source === 'annotation')
    .filter((one) => {
      const own = one.chosen?.recipient ?? null
      if (own !== null) return !(own.kind === 'agent' && recipient !== null && own.agentId === recipient.agentId)
      // A HINT ON THE COMMENT IS FOLLOWED ONLY WHERE NOBODY SAID WHO THE WHOLE REVIEW GOES TO.
      return said === null && hintOn(one.id) !== null
    })
    .map((one) => one.id)
  return { ground, recipient, name, elsewhere }
}

/**
 * WHERE ONE COMMENT OF A REVIEW GOES: the choice on the comment, then who the whole review was said to go to, then
 * the words written on the comment about who it is for, then the agent recorded as writing the page. Null when none
 * of these names anybody. `planSend` asks this, and so does the readiness word, so the two cannot disagree.
 */
function whereOneCommentGoes(member: FoundMember, workspaceId: string, goesTo: ReviewGoesTo): MessageInput['recipient'] {
  const picked = chosenOn(member.id)
  if (picked !== null) return picked
  if (goesTo.ground === 'chosen') return goesTo.recipient
  const hint = hintOn(member.id)
  if (hint !== null) return fromWhatTheyWrote(hint, workspaceId)
  return goesTo.recipient
}

/** The comment's own destination. A review that excludes it supplies no default. */
function nameOfCommentsOwnRecipient(id: string, workspaceId: string): string | null | undefined {
  const record = getRecord(id)
  if (record === null) return undefined
  if (sentOnItsOwn(record)) {
    // A REMARK TO THE PERSON IS NAMED THE WAY THE REST OF THE PAGE NAMES THEM (wave 13y round 41): the
    // registry row a participant is ever named by, which the contact list, the chat and
    // GET /api/participants draw (`readParticipant`). A ref no registry row answers for stays null, so
    // one null still makes the whole answer unnameable rather than naming some of a message's
    // recipients and not others.
    const names = readMessage(id).to.map((who) => who.kind === 'agent'
      ? theAgentAStoredIdNames(who.id)?.name ?? null
      : readParticipant({ kind: 'person', id: who.id })?.name ?? null)
    return names.length === 0 || names.some((name) => name === null) ? undefined : names.join(', ')
  }
  const chosen = chosenOn(id)
  const hint = hintOn(id)
  return nameOfRecipient(chosen ?? (hint === null ? null : fromWhatTheyWrote(hint, workspaceId)), workspaceId)
}

/** Destinations for the comment-only column, including the default of a review holding a comment. */
export function recipientNamesOfComments(records: readonly PanelRecord[], workspaceId: string): Record<string, string | null | undefined> {
  if (records.length === 0) return {}
  return withinOneRead(() => {
    // A sent comment still names its destination. The worker's pending-only projection drops
    // those comments, so read membership itself, with current reviews before completed ones.
    // This is a screen read: an unreadable review must fail rather than invent no recipient.
    const project = oneProjectsReviews(workspaceId)
    const rows = project.rows()
    const held = new Map<string, ReviewRow>()
    for (const row of [...rows.filter((one) => !reviewHasEnded(one.state)), ...rows.filter((one) => one.state === 'sent')]) {
      for (const member of whatItWouldSend(row, project)) {
        if (member.found && !held.has(member.id)) held.set(member.id, row)
      }
    }
    const defaults = new Map<string, ReviewGoesTo>()
    return Object.fromEntries(records.map((record) => {
      const review = held.get(record.id)
      if (review === undefined) return [record.id, nameOfCommentsOwnRecipient(record.id, workspaceId)]
      let goesTo = defaults.get(review.id)
      if (goesTo === undefined) {
        goesTo = goesToOf(review, [])
        defaults.set(review.id, goesTo)
      }
      const read = memberOfAnnotation(record, undefined)
      return [record.id, 'member' in read
        ? nameOfRecipient(whereOneCommentGoes(read.member, workspaceId, goesTo), workspaceId)
        : undefined]
    }))
  })
}

/** Name the same destination the send reads, including a chosen agent that cannot currently receive it. */
function nameOfRecipient(recipient: MessageInput['recipient'], workspaceId: string): string | null | undefined {
  if (recipient == null) return null
  if (recipient?.kind === 'agent' && recipient.agentId) {
    const record = getRecord(recipient.agentId)
    return record?.kind === 'agent' && record.deletedAt === null && record.workspaceId === workspaceId ? record.title : undefined
  }
  return readDelivery(recipient, workspaceId).goesTo?.name
}

/** The members as the readiness word reads them: a comment nobody chose for carries where the review sends it. */
function withWhereTheReviewSendsIt(carries: readonly ReviewMember[], goesTo: ReviewGoesTo, workspaceId: string): ReviewMember[] {
  return carries.map((one) => {
    if (!one.found || one.chosen !== null || one.source !== 'annotation') return one
    const recipient = whereOneCommentGoes(one, workspaceId, goesTo)
    if (recipient === null || recipient === undefined) return one
    const delivery = readDelivery(recipient, workspaceId)
    return { ...one, chosen: { recipient, canSend: delivery.canSend, says: delivery.says } }
  })
}

/**
 * SAY WHO THE WHOLE REVIEW GOES TO, in one write. The owner's second detail: Change, then one contact.
 *
 * It applies to the comments IN the review and to no other (the decision of wave 13r round 16). It stores the
 * recipient on the review, which every comment nobody chose for follows, and it writes the same recipient onto every
 * comment in it that already carries a choice of its own, so no earlier choice sends one somewhere else. A comment
 * sent on its own with Send is not a member (`sentOnItsOwn`), so it keeps its own recipient. All of it is one transaction: either
 * every write lands or none does. Only the person who started the review may say, and a review that has ended
 * sends nothing more, so it is refused.
 */
export function chooseWhoTheReviewGoesTo(
  id: string,
  workspaceId: string,
  agentRecordId: string,
  actor: Actor,
): ReviewDetail {
  const row = reviewRow(id, workspaceId)
  const review = toReview(row)
  const asking = `${actor.type}:${actor.id}`
  if (reviewHasEnded(review.state)) {
    throw new PanelError(`Review ${id} is ${review.state}, so nothing more goes from it. Nothing has been changed.`, 409)
  }
  if (review.startedBy !== asking && gateMet('who-acts-on-a-review') === 'block') {
    throw new PanelError(
      `${review.startedBy} started this review, and only they may choose its recipients. You are ${asking}. Nothing has been changed.`,
      403,
    )
  }
  const record = getRecord(agentRecordId)
  if (record === null || record === undefined || record.kind !== 'agent') {
    throw new PanelError(
      `${agentRecordId} is not an agent's record, so a review cannot go to it. Nothing has been changed. ` +
        `GET /api/participants lists the agents and their records.`,
      400,
    )
  }
  const stored = { kind: 'agent' as const, agentId: agentRecordId }
  const detail = readReview(id, workspaceId)
  let wrote = review.startedBy !== asking
  db.transaction(() => {
    const result = db.update(reviews).set({ goesTo: JSON.stringify(stored) }).where(and(eq(reviews.id, id), sql`${reviews.goesTo} IS NOT ${JSON.stringify(stored)}`)).run()
    wrote = wrote || result.changes > 0
    for (const one of [...detail.members, ...detail.saved]) {
      if (!one.found || one.source !== 'annotation' || one.state !== 'queued') continue
      if (chosenOn(one.id) === null) continue
      const result = patchRecord(one.id, { dataPatch: { chosenRecipient: stored } }, actor)
      wrote = wrote || result.newSeq !== null
    }
  })
  return { ...readReview(id, workspaceId), ...(wrote ? {} : { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) }) }
}

/** What discarding a review's comments did. */
export interface DiscardOutcome {
  review: ReviewDetail
  /** The comments deleted, by id. */
  deleted: string[]
  says: string
}

/**
 * DISCARD THE COMMENTS A COLLECTING REVIEW HOLDS: every one it would send. The owner's fourth detail, the Discard
 * answer to the question asked on leaving the page.
 *
 * Each comment is deleted through the ordinary delete, `deleteRecord`, in one transaction. That delete marks a
 * record as deleted; it does not erase it, and POST /api/records/<id>/restore brings one back. The reply says so,
 * because "cannot be undone" would be false here. The review itself stays collecting, with nothing in it.
 */
export function discardTheComments(id: string, workspaceId: string, actor: Actor): DiscardOutcome {
  const row = reviewRow(id, workspaceId)
  const review = toReview(row)
  const asking = `${actor.type}:${actor.id}`
  if (review.state !== 'collecting') {
    throw new PanelError(`Review ${id} is ${review.state}, not collecting, so its comments are not discarded here. Nothing has been changed.`, 409)
  }
  if (review.startedBy !== asking && gateMet('who-acts-on-a-review') === 'block') {
    throw new PanelError(
      `${review.startedBy} started this review and only they may discard its comments. You are ${asking}. Nothing has been changed.`,
      403,
    )
  }
  const detail = readReview(id, workspaceId)
  const deleted = [...detail.members, ...detail.saved]
    .filter((one): one is FoundMember => one.found && one.source === 'annotation' && one.state === 'queued')
    .map((one) => one.id)
  const gone = new Set(deleted)
  db.transaction(() => {
    for (const one of deleted) deleteRecord(one, actor)
    db.update(reviews)
      .set({ takenIn: JSON.stringify(takenInOf(row).filter((one) => !gone.has(one))) })
      .where(eq(reviews.id, id))
      .run()
  })
  return {
    review: readReview(id, workspaceId),
    deleted,
    says:
      deleted.length === 0
        ? 'This review held no comment that had not gone, so nothing was deleted.'
        : `Deleted ${String(deleted.length)} comment${deleted.length === 1 ? '' : 's'}. ${deleted.length === 1 ? 'It' : 'They'} will not ` +
          `be sent. Each is kept as a deleted record, and POST /api/records/<id>/restore brings one back.`,
  }
}

// ============================================================================ starting one

/**
 * START COLLECTING HERE — OR COME BACK TO THE REVIEW THAT IS ALREADY COLLECTING HERE.
 *
 * ---------------------------------------------------------------------------------------
 * COMING BACK IS THE SAME ACT AS STARTING, AND THAT IS WHY THERE IS ONE ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * "Leaving the context stops collecting there. It does not end the review. The review stays, paused
 * and visible, and resumes when the person comes back." Coming back is somebody standing in the same
 * place again and saying "collect this". If that started a SECOND review the first would be
 * stranded, holding half of one afternoon's remarks, and the person would have no way of knowing.
 *
 * So this answers with the review already collecting in this scope when there is one, and says so.
 * `started` in the reply is what tells the caller which happened; a 201 and a 200 say the same thing
 * over HTTP.
 *
 * THE COMPARISON IS ON THE SCOPE, NOT ON THE ENTRY. Two entries pointing at different blocks of one
 * report derive the same scope, and a person who comments on one block, walks away, comes back and
 * comments on another is plainly in the same review. Comparing the entries would give them two.
 */
export function startReview(
  input: { workspaceId: string; entry: Context; reach?: ReviewReach; startedByAgent?: string | null },
  actor: Actor,
): { review: ReviewView; started: boolean; rule: ReviewScope; says: string } {
  const { workspaceId, entry } = input
  const reach: ReviewReach = input.reach ?? 'local'

  // IT HAS TO BE SOMETHING A SCOPE CAN BE WORKED OUT FROM. This is asked FIRST, of every caller,
  // because the scope is what decides whether they are already collecting here.
  //
  // It is not the same question `checkContext` asks. `checkContext` never asks which project a
  // conversation is about — a message target names no record, so its record boundary never fires on
  // one — and a review of one project could therefore be started from another project's
  // conversation, with a rule reading "Everything said in the conversation <id>".
  const rule = scopeOrRefuse(entry, workspaceId, 'start collecting here', reach)
  const startedBy = `${actor.type}:${actor.id}`

  const open = db
    .select()
    .from(reviews)
    .where(and(eq(reviews.workspaceId, workspaceId), eq(reviews.state, 'collecting')))
    .all()

  // ONE PROJECT-WIDE REVIEW COLLECTS AT A TIME, AND THE REFUSAL NAMES WHO HOLDS IT.
  //
  // ASKED HERE FOR THE SENTENCE, HELD BY THE DATABASE FOR THE FACT. `reviews_one_global_collecting`
  // is a partial unique index created by window B's reach step, so two presses landing in the same
  // millisecond cannot both win. What an index cannot do is say WHOSE review is in the way, and a
  // person who presses *Review the whole project* and is told "UNIQUE constraint failed" has been
  // told nothing. So this asks first and answers in words, and the index stands behind it.
  //
  // IT IS NOT THE SAME QUESTION AS "you were already collecting here", below. That one is about the
  // person asking and comes back with THEIR review; this one is about everybody, because a
  // project-wide review collects the comments of whoever writes them.
  if (reach === 'global') {
    const held = open.find((row) => row.reach === 'global')
    if (held !== undefined && held.startedBy !== startedBy) {
      throw new PanelError(
        `${held.startedBy} is already reviewing the whole of this project — that review started at ` +
          `${held.startedAt} and is still collecting, so a second one would split every comment written now ` +
          `between two reviews with nothing saying which. Nothing has been created. Join that review, or wait ` +
          `until whoever started it has finished collecting.`,
        409,
      )
    }
  }

  for (const row of open) {
    const existing = toReview(row)
    if (existing.startedBy !== startedBy) continue
    // A REVIEW WHOSE OWN ENTRY HAS GONE ANSWERS `gone` HERE AND MATCHES NOTHING, which is why this
    // walk no longer carries one broken review's problem out to everybody starting a new one.
    const theirs = scopeOf(existing.entry, workspaceId, existing.reach)
    if (theirs.kind === 'gone') continue
    if (theirs.kind !== rule.kind || theirs.id !== rule.id) continue
    return {
      review: existing,
      started: false,
      rule: theirs,
      says:
        `You were already collecting here. This is the review you started at ${existing.started}, not a new one — ` +
        `${theirs.says} Nothing was created.`,
    }
  }

  // EVERYTHING A STORED CONTEXT HAS TO SATISFY, through the one call both write paths use: the
  // thing has to be one Mole Office can look up, in this project, and still there.
  //
  // ASKED HERE AND NOT ABOVE, because it guards what is about to be WRITTEN. Coming back writes
  // nothing, and this check refuses a deleted record — so asking it of everybody meant that
  // deleting the module a review was started from locked its owner out of the review they were
  // still collecting into, with a refusal about the module rather than a word about the review.
  //
  // AND WHO IS STARTING IT. A review's entry is a Context like any other, and `view` on one is
  // evidence about a screen: refused from an agent, which has none. Said here rather than assumed,
  // because an agent starting a review is an ordinary thing and this is the field it may not send.
  checkContext(entry, workspaceId, actor.type)

  // AND WHAT IS STORED CARRIES THE PLACE IT NAMES. A review entry is a Context like any other, and
  // a stored context with a target and no place is counted as pending migration work — after which
  // `prepareToServe` refuses to serve the file at the next start, which under `tsx watch` is the
  // next time anybody saves a server file. This door wrote one every time somebody pressed *Review
  // this* at a part of a record, and regions became pointable everywhere in round ten, so it was
  // reachable from any record page by one press. Measured on a copy of the live corpus on 31 August
  // 2026: three doors, three place-less rows, and the copy would not start.
  //
  // `contextAsStored` is the SAME completion the comment door and the message door run, in
  // src/server/lib/targets.ts, rather than a third answer written here. It is run after
  // `checkContext` for the reason that function gives.
  const stored = contextAsStored(entry)

  const at = now()
  const row: ReviewRow = {
    id: anOfficeId(),
    workspaceId,
    entry: JSON.stringify(stored),
    state: 'collecting',
    startedAt: at,
    startedBy,
    collectedAt: null,
    frozen: null,
    fromThreadId: null,
    sentThreadId: null,
    // NOBODY HAS READ THESE COMMENTS, which is not the same as a reading that found nothing true of
    // several at once. That answer is an empty list and it is written when a reading is kept.
    readGroups: null,
    sentAt: null,
    // HOW WIDE THIS REVIEW IS, as the caller asked for it. `local` is what every review in this
    // product was until round ten: the scope is worked out from `entry`, where the person was
    // standing. `global` is the whole project, and it is a press behind Advanced rather than
    // something a person can reach by pointing at nothing.
    reach,
    // WHICH AGENT ASKED FOR THIS REVIEW, or null because nobody did. It does one thing: it puts that
    // agent first in the recipient picker. An agent may ASK for a review and may not start one, so
    // only the owner's press writes this — and `actor.type` is what holds that.
    startedByAgent: actor.type === 'human' ? (input.startedByAgent ?? null) : null,
    takenIn: null,
    // NOBODY HAS SAID WHO THE WHOLE REVIEW GOES TO. It goes to the agent recorded as writing the page until somebody does.
    goesTo: null,
  }

  // THE COMMENTS KEPT BEFORE IT STARTED JOIN IT NOW, IN THIS SAME INSERT. The owner's third detail (record
  // 9BZZVKQxWV9Z): comments kept before the review started, unsent and in no review, join it when it starts.
  // They are the ones `savedNotSent` lists — saved without sending, by this person, inside this scope, not gone to
  // anybody, and held by no other review that can still send — less any that a review still collecting has as a
  // member. A comment written in the same second as the press is taken too, because Start review in the comment
  // box writes it a moment before this.
  const project = oneProjectsReviews(workspaceId)
  const inAnotherCollecting = new Set<string>()
  for (const other of open) {
    const theirs = scopeOf(toReview(other).entry, workspaceId, other.reach as ReviewReach)
    for (const member of membersOf(other, theirs, null, project).members) inAnotherCollecting.add(member.id)
  }
  const taken = savedNotSent(row, rule, null, project, true)
    .map((one) => one.id)
    .filter((id) => !inAnotherCollecting.has(id))
  row.takenIn = JSON.stringify(taken)

  db.insert(reviews).values(row).run()
  return {
    review: toReview(row),
    started: true,
    rule,
    says:
      `Collecting from ${nameTarget(entry.target)}. ${rule.says}` +
      (taken.length === 0
        ? ''
        : ` It took in ${String(taken.length)} comment${taken.length === 1 ? '' : 's'} you kept here before it started.`) +
      ` Nothing has been sent, and nothing will be until the review is sent.`,
  }
}

// ============================================================================ the first boundary

/**
 * WHAT A REVIEW WRITES DOWN AT THE MOMENT IT STOPS COLLECTING: who was in it, and why everybody
 * else was out.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SECOND HALF IS WRITTEN NOW AND NOT WORKED OUT LATER
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 20 August 2026: two comments read `Earlier` while a review collected and `Not known`
 * the moment it finished. Freezing wrote down the members and nothing else, so the reason was gone.
 *
 * The reason cannot be recovered afterwards. `outside-the-scope` is a fact about where a record sat
 * at this moment, and records move; `somebody-else-wrote-it` is a fact about the attribution as it
 * read at this moment. Running the collecting rule over next week's world and calling the answer a
 * fact about today is the silent substitution invariant 2 of USER.md forbids. This moment is the only
 * moment the answer is true, so this is where it is written.
 *
 * IT WALKS THE SAME BRANCHES `commentsNotIn` WALKS, through the same `clauseFor`, with
 * `membershipFrozen` false — because the membership is not frozen yet. That is what makes the word
 * a person reads the same word on both sides of the press.
 *
 * A COMMENT WRITTEN AFTER THIS IS NOT IN THE LIST, because it does not exist yet. `clauseFor`
 * answers `written-after-collecting-finished` for those, from two stamps that cannot move.
 */
function whatItHeld(
  row: ReviewRow,
  review: ReviewView,
  scope: ReviewScope,
  members: readonly ReviewMember[],
): FrozenMembership {
  const held = new Set(members.map((member) => member.id))
  const comments = commentRecordsIn(review.workspaceId)
  const wroteIt = whoWroteRecords(comments.map((record) => record.id))
  const leftOut: FrozenExclusion[] = []
  for (const record of comments) {
    if (held.has(record.id)) continue
    const wrote = wroteIt.get(record.id)
    leftOut.push({
      id: record.id,
      clause: clauseFor(record, review, scope, false, row.collectedAt, whereACommentIs(record), wrote),
    })
  }
  return { members: members.map((m): FrozenMember => ({ source: m.source, id: m.id })), leftOut, takenOut: [] }
}

/**
 * FINISH COLLECTING: write the membership down, and send nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE MEMBERSHIP IS WRITTEN AND NOT LEFT DERIVED
 * ---------------------------------------------------------------------------------------
 *
 * While a review collects, what is inside it is a live question and depends on relationships that
 * are still being written. That is right: somebody who files a task as part of the module they are
 * reviewing expects their remark on it to join.
 *
 * Afterwards it is exactly wrong. A `part_of` link written next week would change what last week's
 * review contained, and a review is a record of what somebody collected on a particular afternoon.
 * So the answer is worked out once, at this boundary, and stored.
 *
 * ---------------------------------------------------------------------------------------
 * THE ANNOTATIONS ARE NOT CONSUMED BY THIS
 * ---------------------------------------------------------------------------------------
 *
 * Nothing is moved, marked or hidden. An annotation belongs to the person who wrote it and not to
 * the collection, so it stays individually discoverable, and another review that was collecting when it
 * was written may contain it too. A review started after it was written does not: `membersOf` takes
 * only what is written from the second a review starts, and lists the rest as `Earlier`.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY THE PERSON WHO STARTED IT MAY FINISH IT
 * ---------------------------------------------------------------------------------------
 *
 * This is the narrowest rule that could be written and it is not a permission system. Freezing is
 * the one irreversible act here: once the membership is written down it is what the review
 * contained, for good. An agent finishing somebody's review mid-afternoon would cut their
 * collection in half with nothing to undo it. Writing a remark is unaffected, and so is reading.
 */
export function finishCollecting(id: string, workspaceId: string, actor: Actor): ReviewDetail {
  const row = reviewRow(id, workspaceId)
  const review = toReview(row)
  const asking = `${actor.type}:${actor.id}`

  if (review.state !== 'collecting') {
    throw new PanelError(
      `Review ${id} is not collecting — it is ${review.state}, and its membership was written down at ` +
        `${review.collectedAt ?? 'a moment nothing recorded'}. Finishing again would rewrite what it contained. ` +
        `Nothing has been changed.`,
      409,
    )
  }
  if (review.startedBy !== asking && gateMet('who-acts-on-a-review') === 'block') {
    throw new PanelError(
      `${review.startedBy} started this review and only they may finish collecting it, because writing the ` +
        `membership down cannot be undone. You are ${asking}. Nothing has been changed.`,
      403,
    )
  }

  // WHAT IT COLLECTS HAS TO BE WORKABLE BEFORE IT CAN BE WRITTEN DOWN.
  //
  // A review started from a comment that has since been deleted can be read, listed and left alone,
  // and it cannot be frozen: freezing it would write down an EMPTY membership, and an empty frozen
  // membership means "this review contained nothing", which is a measurement nobody took. The
  // refusal says which comment is missing. That leaves such a review collecting for good, which is
  // a real cost and the smaller one — see `scopeOf`.
  const rule = scopeOrRefuse(review.entry, workspaceId, 'write down what this review contains', review.reach)
  // WHAT IT HELD IS READ IN FULL BEFORE ANYTHING IS WRITTEN, so the one graph of restrictions it is read with is the
  // project as it stood when the press was made.
  const held = withinOneRead(() => whatItHeld(row, review, rule, membersOf(row, rule, null).members))
  const at = now()
  db.update(reviews)
    .set({ state: 'collected', collectedAt: at, frozen: writeFrozen(held) })
    .where(eq(reviews.id, id))
    .run()

  return readReview(id, workspaceId)
}

/**
 * END A REVIEW WITHOUT SENDING ANYTHING AND WITHOUT CLAIMING IT WAS FINISHED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT OPTIONAL
 * ---------------------------------------------------------------------------------------
 *
 * Nothing else stops a review collecting. `finishCollecting` cannot be undone and says the review
 * contained what was in it at that moment, which is a claim about somebody's work; `setState`
 * refuses every word by name; no route deletes a review. So a review started by accident collected
 * for ever, and from 20 August 2026 it also frames every page of the application for ever. The
 * escape offered before this existed was to turn the frame off in Settings, which weakens the
 * signal for every later review to get out of one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES, AND THE ONE THING IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * It writes the membership down, exactly as finishing does, and stamps the moment. That is what
 * makes an abandoned review still readable: the list of what it held is what it held, and a link
 * written next week cannot change it. What it does NOT do is let those comments count as collected
 * by anybody. `commentsNotIn` skips abandoned reviews when it asks "is this comment in another
 * review", so the comments of an abandoned review come back to the next review as ordinary
 * comments with their own reason, which is what contract §6.18 promises: the annotations are
 * untouched.
 *
 * THE COMMENTS ARE NOT TOUCHED AT ALL. No record is written, no state is changed on any of them,
 * and nothing is deleted. An abandoned review is a review nobody wants; it is not a retraction of
 * what somebody wrote.
 */
export function abandonReview(id: string, workspaceId: string, actor: Actor): ReviewDetail {
  const row = reviewRow(id, workspaceId)
  const review = toReview(row)
  const asking = `${actor.type}:${actor.id}`

  if (review.state !== 'collecting') {
    throw new PanelError(
      `Review ${id} is not collecting — it is ${review.state} — so there is nothing to abandon. Its membership ` +
        `was written down at ${review.collectedAt ?? 'a moment nothing recorded'}. Nothing has been changed.`,
      409,
    )
  }
  if (review.startedBy !== asking && gateMet('who-acts-on-a-review') === 'block') {
    throw new PanelError(
      `${review.startedBy} started this review and only they may abandon it, because ending it cannot be undone. ` +
        `You are ${asking}. Nothing has been changed.`,
      403,
    )
  }

  // THE SAME REFUSAL FINISHING GETS, FOR THE SAME REASON. A review whose entry has been deleted
  // cannot say what it held, and writing an empty membership down would say it held nothing.
  const rule = scopeOrRefuse(review.entry, workspaceId, 'write down what this review held before ending it', review.reach)
  const { members } = membersOf(row, rule, null)
  db.update(reviews)
    .set({
      state: 'abandoned',
      collectedAt: now(),
      frozen: writeFrozen(whatItHeld(row, review, rule, members)),
    })
    .where(eq(reviews.id, id))
    .run()

  return readReview(id, workspaceId)
}

// ============================================================================ the second boundary

/**
 * WHAT AN INTERPRETER IS ASKED ABOUT THIS REVIEW'S COMMENTS. Writes nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS THE WHOLE SET AND WHY IT IS AFTER THE FIRST BOUNDARY
 * ---------------------------------------------------------------------------------------
 *
 * The interesting things about a review are between its comments — the same complaint written
 * twice, three symptoms of one cause, two comments meant for different people — and a reader given
 * one comment at a time can see none of them.
 *
 * A REVIEW THAT IS STILL COLLECTING IS REFUSED, because what is inside it is a live question until
 * somebody finishes collecting. Reading a set that can change underneath the reading would produce
 * an answer about comments that are no longer the ones in the review, and the answer names the
 * comments by id, so it would then be refused on the way back in for naming a stranger.
 *
 * ONE FUNCTION BUILDS THIS AND `keepOrganised` CALLS IT, so what was asked and what is accepted back
 * are worked out in one place. Two lists of "which comments are in this reading" would be free to
 * disagree, and the way that shows up is a reading refused for naming a comment Mole Office had itself
 * handed over a moment earlier.
 */
export function organiseRequest(id: string, workspaceId: string, reader: AMessageReader | null = null): InterpreterRequest {
  // AS THIS READER MAY SEE IT (see `readReview`): the request holds only the comments it may read, and
  // `keepOrganised` asks with null, so a reading is always checked against every comment.
  const detail = readReview(id, workspaceId, reader)
  const state = detail.review.state
  if (state === 'collecting') {
    throw new PanelError(
      `Review ${id} is still collecting, so what is in it can still change and nothing can honestly be read yet. ` +
        `Press ${REVIEW_VOCABULARY.finishCollecting.word} first, in the review column, which writes down what is ` +
        `in it and sends nothing.`,
      409,
    )
  }
  if (state === 'sent') {
    throw new PanelError(
      `Review ${id} has already been sent. Organising it now would put a reading beside words that were ` +
        `read without it. Nothing has been changed.`,
      409,
    )
  }
  if (state === 'abandoned') {
    throw new PanelError(
      `Review ${id} was abandoned at ${detail.review.collectedAt ?? 'a moment nothing recorded'} and nothing more ` +
        `happens to it. Organising it would ask for a reading of a collection that was ended. The comments ` +
        `themselves are untouched and a review started now collects the ones it reaches. Nothing has been changed.`,
      409,
    )
  }

  const comments: CommentToRead[] = []
  for (const member of detail.members) {
    if (!member.found) continue
    comments.push({
      id: member.id,
      source: member.source,
      body: member.body,
      about: nameTarget(member.context.target),
      quote: spanNamedBy(member.context)?.quote ?? null,
      // WHO THEY SAID IT WAS FOR, IN THEIR OWN WORDS. Read from the comment's own record rather
      // than carried on the member row, because the row is what a list of forty draws and this is
      // only wanted by the one act that hands the words over. A conversation comment has no such
      // field, so it answers null — nobody said, rather than nobody meant anybody.
      theySaidItWasFor: member.source === 'annotation' ? hintOn(member.id) : null,
    })
  }
  if (comments.length === 0) {
    // CODED, so the review column draws it in the page's language. The English an agent reads is unchanged.
    throw new PanelError(`There is nothing in review ${id} that can be read. ${detail.says}`, 409, undefined, undefined, undefined, {
      code: 'reviewNothingToRead',
      values: {},
    })
  }
  const unreadable = detail.members.filter((m): m is MissingMember => !m.found).map((m) => ({ id: m.id, says: m.says }))
  return askedOf({ reviewId: id, workspaceId, comments, unreadable })
}

/** Who the person said a comment was for, in their own words, or null because they said nothing. */
function hintOn(annotationId: string): string | null {
  const record = getRecord(annotationId)
  const held = record?.data['recipientHint']
  return typeof held === 'string' && held !== '' ? held : null
}

/**
 * WHO SOMEBODY CHOSE THIS COMMENT TO GO TO, or null because nobody has.
 *
 * READ FROM THE COMMENT'S OWN RECORD, where `annotation.chosenRecipient` is declared to hold it and
 * where the write path checks its shape. It used to live in the browser and nowhere else: a person
 * chose agents for four comments, reloaded, and the pane said nobody had been chosen for any of
 * them, with no mark anywhere saying the choices were not stored. Measured 19 August 2026.
 *
 * A DECISION BEATS A HINT. `recipientHint` is the words somebody wrote about who they meant; this
 * is the agent they picked. `whoTheySaid` below reads this first for that reason.
 *
 * A STORED VALUE THAT IS NOT AN OBJECT IS IGNORED RATHER THAN GUESSED AT, and it cannot get there
 * through any route Mole Office offers — `validateData` checks the shape on every write.
 */
function chosenOn(annotationId: string): MessageInput['recipient'] {
  const record = getRecord(annotationId)
  const held = record?.data['chosenRecipient']
  if (held === undefined || held === null || typeof held !== 'object' || Array.isArray(held)) return null
  const one = held as Record<string, unknown>
  const kind = one['kind']
  // A DURABLE AGENT, CHOSEN FROM THE CHAT'S CONTACTS. The review pane offers the same contacts as the
  // chat and the right-click panel (problem sLyxTMlvze6A), so a choice names an agent by its id.
  if (kind === 'agent') {
    const agentId = one['agentId']
    if (typeof agentId !== 'string' || agentId === '') return null
    return {
      kind,
      agentId,
      sessionId: null,
      said: typeof one['said'] === 'string' ? one['said'] : null,
      why: typeof one['why'] === 'string' ? one['why'] : null,
    }
  }
  if (kind !== 'session' && kind !== 'new' && kind !== 'unresolved') return null
  return {
    kind,
    sessionId: typeof one['sessionId'] === 'string' ? one['sessionId'] : null,
    said: typeof one['said'] === 'string' ? one['said'] : null,
    why: typeof one['why'] === 'string' ? one['why'] : null,
  }
}

/** What happened when a reading came back: what was accepted, what was stored, and what was not. */
export interface OrganiseOutcome {
  review: ReviewDetail
  /** The reading as Mole Office accepted it, including the parts it has nowhere to keep. */
  organised: Organised
  kept: KeptReadings
  /** True when at least one sentence is now stored beside the words it is about. */
  stored: boolean
  says: string
  /** What `says` says, as facts, for the review panel to say in the page's language (`sayTheKeptReading`). */
  told: KeptReadingFacts
}

/**
 * A READING COMES BACK. MOLE OFFICE CHECKS IT, KEEPS WHAT IT CAN KEEP, AND SAYS WHAT IT COULD NOT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES NOT DO, WHICH IS THE POINT OF THE PHASE
 * ---------------------------------------------------------------------------------------
 *
 * It writes no task, no problem, no finding and no decision. A reading may say *this looks like a
 * decision somebody has to make*; nothing here writes one, and `decision` is the one human-only
 * kind in this product. Naming a thing that could exist is not making it exist, and the difference
 * is what a person is reading the reading for.
 *
 * It never touches anybody's words. The only field written is `interpretation`, which the
 * `annotation` kind declares as what Mole Office made of the words, shown beside them.
 *
 * ---------------------------------------------------------------------------------------
 * ANYBODY MAY SEND ONE, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * There is no rule here about who may organise a review, unlike finishing collecting, which only
 * the person who started it may do. Freezing cannot be undone; a reading can be changed and taken
 * away by anybody who can patch a record, and every write is attributed in the change log like any
 * other. An interpretation is a claim about somebody's words, so what matters is that it is visible
 * and attributed, not that it is rationed.
 *
 * ---------------------------------------------------------------------------------------
 * A READING THAT COULD NOT BE KEPT AT ALL DOES NOT MARK THE REVIEW ORGANISED
 * ---------------------------------------------------------------------------------------
 *
 * The comments of a review carried forward from round seven live in `agent_messages`, which has no
 * place for a reading. So one of those can be read and shown and not stored, and marking that
 * review organised would leave the word standing over an empty space. `stored` says which happened
 * and `says` says it in a sentence.
 */
export function keepOrganised(id: string, workspaceId: string, raw: unknown, actor: Actor): OrganiseOutcome {
  const request = organiseRequest(id, workspaceId)
  // THE READING IS CHECKED AGAINST EVERY COMMENT, and a refusal names only the ones the caller may
  // read.
  const hiddenFromTheCaller = theCommentsHiddenFrom(
    theMessageReader(actor),
    request.comments.map((one) => ({ id: one.id, source: one.source })),
  )
  const checked = checkAnswer(raw, request, hiddenFromTheCaller)
  if ('problem' in checked) {
    throw new PanelError(`${checked.problem} Nothing has been stored, and no words have been changed.`, 400)
  }
  const where = new Map<string, MemberSource>(request.comments.map((one) => [one.id, one.source]))
  const { wrote: readingsWrote, ...kept } = keepReadings(checked.organised, where, workspaceId, actor)
  const stored = kept.kept > 0

  const before = reviewRow(id, workspaceId)
  let groupsWrote = false
  if (stored) {
    // WHAT WAS TRUE OF SEVERAL COMMENTS AT ONCE IS WRITTEN ONCE, HERE, AND ONLY WHEN A READING WAS
    // ACTUALLY KEPT. A review holding groups and no readings would say something was true of
    // several comments while nothing was stored beside any of them.
    //
    // AN EMPTY LIST IS WRITTEN TOO. It says "somebody read them and found nothing true of several
    // at once", which the NULL this column starts at does not say. A reading sent again replaces
    // what is here, exactly as it replaces the sentences beside the words.
    const result = db.update(reviews)
      .set({
        readGroups: JSON.stringify(checked.organised.groups),
        ...(before.state === 'collected' ? { state: 'organised' as const } : {}),
      })
      .where(and(eq(reviews.id, id), or(sql`${reviews.readGroups} IS NOT ${JSON.stringify(checked.organised.groups)}`, eq(reviews.state, 'collected'))))
      .run()
    groupsWrote = result.changes > 0
  }

  // THE REVIEW IN THE REPLY IS AS THE CALLER MAY SEE IT. Anybody may send a reading, and the reply
  // must not hand an agent the words of comments it may not read.
  const review = readReview(id, workspaceId, theMessageReader(actor))
  const told: KeptReadingFacts = {
    comments: checked.organised.comments.length,
    groups: checked.organised.groups.length,
    kept: kept.kept,
    notKept: kept.notKept,
  }
  const nothingWritten = stored && !readingsWrote && !groupsWrote ? nothingWrittenSentence({ kind: 'already-stored' }) : undefined
  return {
    ...(nothingWritten === undefined ? {} : { nothingWritten }),
    review,
    organised: checked.organised,
    kept,
    stored,
    // THE ENGLISH FROM THE ONE COMPOSER the panel says in the page's language (src/shared/send-plan-words.ts).
    says: nothingWritten ?? sayTheKeptReading(told),
    told,
  }
}

// ============================================================================ the third boundary

/**
 * SENDING A REVIEW: THE COMMENTS BECOME MESSAGES IN ONE CONVERSATION, THAT CONVERSATION IS
 * DISPATCHED, AND EACH RECIPIENT IS GIVEN ONE MESSAGE.
 *
 * ---------------------------------------------------------------------------------------
 * IT BUILDS ON THE ONE PLACE THAT WORKS OUT WHO EACH COMMENT GOES TO, AND WRITES NO RUN
 * ---------------------------------------------------------------------------------------
 *
 * `dispatchThread` in lib/agents.ts groups a conversation's messages by recipient, and it holds the
 * only `insert(agentRuns)` in this repository. Sending a review writes each comment into ONE
 * conversation as a message carrying who that comment is for, and has dispatch work out who each
 * goes to. As the file that does it says, one review may be split into the right work for each agent
 * rather than every comment being forced on one agent, and the review stays one durable human action.
 *
 * DISPATCH IS ASKED FOR NO RUN. Each recipient is given one message in the message pool instead
 * (`writeTheMessageTo`), from the person, holding every comment that went to them, numbered. That
 * pool is what the agent's waiter, the message worker and the person's chat read. Until wave 13u
 * round 19 the send wrote one run per recipient, which nothing in the office picks up, and what was
 * sent never showed in the person's chat, as problem eCrK1atZOrvA records.
 *
 * So: ONE REVIEW, ONE CONVERSATION, AND ONE MESSAGE IN THE POOL FOR EACH RECIPIENT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS COPIED, AND WHY THAT IS NOT THE DEFECT IT LOOKS LIKE
 * ---------------------------------------------------------------------------------------
 *
 * A comment's words are a record — `annotation.body` — and the message written here holds those
 * words too. Two rows with one sentence in them is the defect this repository names as its own, so
 * this needs an answer rather than a shrug, and the answer is that BOTH ROWS ARE FROZEN AT THE
 * MOMENT THE COPY IS TAKEN. `annotation.body` is immutable once the comment is stamped `sent`,
 * which this does; a message is immutable once it has gone, which `refuseIfSent` enforces. Neither
 * can drift afterwards, and what the agent was given is what the person wrote. The message in the
 * pool holds the same words a third time, written in the same transaction as the conversation is
 * dispatched, from the same members.
 *
 * A REVIEW BROUGHT FORWARD FROM ROUND SEVEN COPIES NOTHING AT ALL. Its comments are already
 * messages, in the conversation `from_thread_id` names, so that conversation IS the one it is sent
 * in and dispatch finds them already there.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT ACCEPTS A REVIEW THAT WAS NEVER ORGANISED
 * ---------------------------------------------------------------------------------------
 *
 * The chain asked for is *comments → Finish collecting → organised → the person corrects
 * it → Send*, so requiring `organised` would be a defensible reading of it. It is not what this
 * does, for one reason that outranks the shape of the chain: MOLE OFFICE CANNOT READ THE WORDS ITSELF.
 * Nothing under `src/` may start a process, so a reading only exists when a runtime somewhere else
 * answered — and requiring one would turn Mole Office's own inability into a wall in front of somebody
 * else's work. A person with no worker running could then never send their own review.
 *
 * WHAT IS GIVEN UP BY SKIPPING IT IS SAID RATHER THAN HIDDEN. The reading is what tells a comment
 * asking for work from a comment asking for a decision — see `yoursToAnswerIn` — so a comment
 * nothing has read goes as the words the person wrote, and the reply counts how many did.
 *
 * `collecting` IS STILL REFUSED. What is inside a collecting review is a live question, and handing
 * over a set that can still change would hand over something nobody collected.
 *
 * ---------------------------------------------------------------------------------------
 * HUMAN GOVERNANCE STAYS HUMAN
 * ---------------------------------------------------------------------------------------
 *
 * A comment whose reading names something only a person may write — a decision — is NOT handed to
 * an agent. `assertMayWrite` in lib/records/may-write.ts is the one statement of that rule and this ASKS it
 * rather than restating it: if it stops refusing, this stops holding. The comment stays queued,
 * stays in the review, stays on the page it is about, and the reply names it and says why.
 *
 * NOTHING IS FILED FOR IT EITHER. Phase 6 files no task, no problem and no decision from a reading,
 * and this is the same gate: naming a thing that could exist is not making it exist. Whether Send
 * should offer to file the fork as a `proposal` is a question for the owner and is written down in
 * design/ROUND-EIGHT-OPEN-QUESTIONS.md rather than answered here.
 */

/** Who one comment is for, as the person said it when they chose by hand. */
export interface ChoiceForOneComment {
  commentId: string
  recipient: MessageInput['recipient']
}

/** Where one comment in a review would go, or why it would go nowhere. */
export interface WhereOneCommentGoes {
  id: string
  source: MemberSource
  /** Enough of what it says to find it on the screen. */
  quotedBody: string
  /** True when this comment would be handed to an agent as it stands. */
  willGo: boolean
  /** True when nothing may hand this comment to an agent, because it is the person's to answer. */
  yoursToAnswer: boolean
  /** Where it goes, or why it does not, in one sentence a person can act on. */
  says: string
  /**
   * THE SAME SENTENCE AS A CODE, for the review panel to say in the page's language (src/shared/send-plan-words.ts).
   * Absent on a comment that is not there to read: its sentence is the membership reader's, and is drawn as `says`.
   * Such a comment taken out of the review has one, because the sentence is then about the press.
   */
  sentence?: SendPlanSentence
  /**
   * PRESENT WHEN THE PERSON TOOK THIS COMMENT OUT OF WHAT THE REVIEW WAITS FOR: why, who pressed, and when. Such a
   * comment never goes, and the review does not wait for it.
   */
  takenOut?: { because: TakenOutBecause; by: string; at: string }
  /**
   * PRESENT ON A COMMENT THIS REVIEW WAITS FOR THAT PRESSING SEND NEVER SENDS: which press takes it out of what the
   * review waits for. Worked out here once, so the press the pane draws is the press `takeOutOfTheReview` accepts.
   * Absent while the review cannot have a comment taken out of it.
   */
  wayOut?: TakenOutBecause
  /**
   * PRESENT, AND TRUE, ON A COMMENT SAVED WITHOUT SENDING THAT NOBODY HAS BEEN CHOSEN FOR. Sending the review is
   * refused while one is (problem H031xonpPSqa), so the pane keeps its Send press off and says why.
   */
  needsARecipient?: true
  /** The durable identity and its live-record projects that this reader may read. */
  resolvedAgent?: { agent: string; projects: string[] } | null
}

/**
 * ONE MESSAGE PRESSING SEND WOULD WRITE FOR ONE RECIPIENT, holding every comment going to them.
 */
export interface OneMessageToOneRecipient {
  /** Who it goes to, named the way the line under each comment names them. */
  to: string
  /** Present, and true, when it goes to a new agent, whose name the review panel says in the page's language. */
  toANewAgent?: true
  /**
   * The comments it would carry, in the order they were written, numbered from 1 as the message
   * numbers them: each with what it was left on (`quote`) and enough of its words to find it. For a
   * reader limited to its own messages, the comments it may not read are left out and the numbers
   * count only the ones left in (see `whereTheCommentsWouldGo`).
   *
   * `quote` is the line the message itself carries, in words and with no id (problem F6-GRSXrBMtJ).
   * `ids` are the ids of the thing it was left on, for the pane to show in developer mode only.
   */
  comments: { id: string; number: number; quote: string; ids: string[]; words: string }[]
}

/** What pressing Send would do, worked out without writing anything. */
export interface WhereTheyGo {
  review: ReviewView
  /** One line per comment in the review, in the order the review lists them. */
  comments: WhereOneCommentGoes[]
  /**
   * THE NEW MESSAGES THIS PRESS WOULD WRITE THAT CAN GO, one for each recipient, in the order of the
   * first comment of each. A comment that would stay, or that is already in the conversation, is
   * in no message here; the line under it says why.
   */
  messages: OneMessageToOneRecipient[]
  going: number
  staying: number
  says: string
  /** What `says` counts, for the review panel to say it in the page's language (`sayThePlan`). */
  facts: SendPlanFacts
  /** A sent review has a readable frozen member still waiting. */
  recoveryAvailable: boolean
  /**
   * THE COMMENTS PRESSING SEND WOULD LEAVE THIS REVIEW WAITING FOR, by id, worked out by `whatSendLeavesWaiting` from the
   * comments this reader is shown. The pane says the review waits exactly when this names one. Absent while the review
   * is collecting and after it was abandoned, as `waitsFor` is on the review.
   */
  sendLeavesWaiting?: string[]
}

/** What happened when a review was sent. */
export interface SendOutcome {
  review: ReviewDetail
  /** The conversation this review went out in. One review, one conversation. */
  threadId: string
  /**
   * THE ONE MESSAGE EACH RECIPIENT WAS GIVEN, in the message pool: its record id, and the agent it went to by its
   * registry id, as a decision says; problem eCrK1atZOrvA. The send writes no run.
   */
  messages: { id: string; to: string }[]
  /** How many comments this review carried out. */
  sent: number
  /**
   * HOW MANY OF THOSE HAD ALREADY REACHED THEIR AGENT BEFORE THIS PRESS. Zero is the ordinary
   * answer. See `alreadyGone` on `DispatchOutcome` in lib/agents.ts, and problem `p9enuTYIC-S6`.
   */
  alreadyGone: number
  /**
   * Every comment that stayed behind because it could not be delivered, and why — dispatch's own
   * list, so the sentence here and the sentence on the comment cannot disagree.
   */
  held: Held[]
  /**
   * Every comment Mole Office would not hand to an agent at all, because it is the person's to answer. `takenOut` marks
   * one the person took out of what the review waits for: the review does not wait for it.
   */
  yoursToAnswer: { id: string; quotedBody: string; why: string; takenOut?: true }[]
  says: string
  /** What `says` says, as facts, for the review panel to say in the page's language (`sayTheSend`). */
  told: SendFacts
}

/** What one comment would be written into the conversation as, once everything has been decided. */
interface Planned {
  member: ReviewMember
  line: WhereOneCommentGoes
  /**
   * The message to write, or null when nothing is to be written for this comment. `goesTo` is who
   * dispatch would give it to, or null when it cannot go as it stands; comments with the same
   * `goesTo.key` are written as one message.
   */
  write: { recipient: MessageInput['recipient']; goesTo: { key: string; name: string } | null } | null
  /**
   * TRUE FOR A COMMENT SAVED WITHOUT SENDING THAT THIS PRESS WOULD SEND AND NOBODY HAS BEEN CHOSEN FOR.
   * `sendReview` refuses while any is, and names each one (problem H031xonpPSqa).
   */
  savedWithNobody?: true
}

/** One comment that is going: it was readable, and Mole Office is about to write it into the thread. */
type Going = Planned & { member: FoundMember; write: NonNullable<Planned['write']> }

/**
 * THE MESSAGES A SEND WRITES, ONE FOR EACH RECIPIENT.
 *
 * Every comment that can go is put with the others going to the same recipient — the same key
 * `dispatchThread` makes one run for — in the order they were written. A comment that cannot go as
 * it stands (nobody chosen, an address nothing can reach, a retired agent) is its own message, as it
 * was before, so its address can be corrected on its own and nothing is guessed about it.
 */
function oneMessageForEachRecipient(going: readonly Going[]): Going[][] {
  const byKey = new Map<string, Going[]>()
  const messages: Going[][] = []
  for (const one of going) {
    const key = one.write.goesTo?.key ?? null
    if (key === null) {
      messages.push([one])
      continue
    }
    const held = byKey.get(key)
    if (held !== undefined) {
      held.push(one)
      continue
    }
    const fresh = [one]
    byKey.set(key, fresh)
    messages.push(fresh)
  }
  const inTheOrderWritten = (a: Going, b: Going): number =>
    a.member.created === b.member.created ? a.member.id.localeCompare(b.member.id) : a.member.created.localeCompare(b.member.created)
  return messages.map((one) => [...one].sort(inTheOrderWritten))
}

/**
 * THE WORDS OF ONE MESSAGE CARRYING SEVERAL COMMENTS: each comment numbered, its quote above its words.
 *
 * The number is the comment's place in the message, so a recipient can answer "on 2, …". The quote
 * line says what the comment was left on and, when the person selected words, those words. The
 * same quotes are stored with the message in order, so a screen can draw them from the list.
 */
function wordsOfOneMessage(comments: readonly FoundMember[], workspaceId: string): string {
  return comments
    .map((one, at) => `${String(at + 1)}. ${quoteLineOf(one, workspaceId)}\n${one.body.trim()}`)
    .join('\n\n')
}

/**
 * THE ONE MESSAGE A SENT REVIEW GIVES ONE RECIPIENT, in the message pool, from the person who sent it.
 * It is the answer to round 18's question (message yMYX20nfBuep): option B.
 *
 * WHY IT IS A MESSAGE IN THE POOL. Problem eCrK1atZOrvA: what the person sent from the review pane did not show in
 * their chat with the agent it went to. The chat, the agent's waiter, the agent's own list and the message worker all
 * read the message pool, and the review's own conversation is not in it. Until round 19 of wave 13u the send queued a
 * run in that conversation, which nothing in the office picks up, and round 18 gave each comment a delivery row of its
 * own, which the waiter read and the chat did not draw. Now the recipient is given one message, the chat draws it as
 * the person's, and nothing else hands the same comments over.
 *
 * WHAT IT HOLDS. Every comment that went to this recipient, in the order the review's conversation holds them: its
 * words numbered 1, 2, 3 when there are several, and its quote in `quotes` at the same place in the list, so the
 * chat's quote numbered 2 is the second comment's. One comment goes as its own words with its one quote.
 * The words are the comment's own, read from the review's members; the quote is what it was left on. No id is put
 * into the words: the quotes carry them, where a program reads them (problem F6-GRSXrBMtJ).
 *
 * EACH COMMENT STAYS ITS OWN RECORD, and nothing is handed over twice. This message names the comments it carries in
 * `carries`. A comment that names its own agent has a delivery row to that agent, which the review held. The send
 * archives that row, names this message on it (`carried_in`) and writes a sentence saying so. The waiting list then
 * leaves the comment out, and a press on it asks for this message's run (`theMessagesCarrying`). Which message of the
 * review's conversation carried which comment is still written there.
 *
 * WHAT A HAND-OVER PRINTS IS THE WORDS. The waiter, the message worker's prompt and the dsh hook print a message's
 * words and not its `quotes`, for this message as for every message that quotes something. The quotes are in the
 * record the agent is handed, and nothing here copies them into the words a second time.
 */
function writeTheMessageTo(
  recipient: { agentId: string; messageIds: readonly string[] },
  members: ReadonlyMap<string, FoundMember>,
  reviewId: string,
  workspaceId: string,
  actor: Actor,
): { id: string; to: string } {
  const comments = recipient.messageIds.flatMap((messageId): FoundMember[] => {
    const row = db
      .select({ id: agentMessages.id, fromAnnotationId: agentMessages.fromAnnotationId, carries: agentMessages.carries, context: agentMessages.context })
      .from(agentMessages)
      .where(eq(agentMessages.id, messageId))
      .get()
    if (row === undefined) {
      throw new PanelError(`Review ${reviewId} was sent, and its message ${messageId} cannot be read. Nothing was sent.`, 500)
    }
    // A MESSAGE NOBODY WROTE FROM A COMMENT IS THE COMMENT, as `commentsOf` in `dispatchThread` counts it.
    const carried = carriedComments(row)
    const ids = carried.length === 0 ? [row.id] : carried.map((one) => one.commentId)
    return ids.map((commentId) => {
      const member = members.get(commentId)
      if (member === undefined) {
        throw new PanelError(
          `Review ${reviewId} was sent, and comment ${commentId} in its message ${messageId} is not one of its comments. ` +
            'Nothing was sent, and nothing was guessed.',
          500,
        )
      }
      return member
    })
  })
  const [only] = comments
  if (only === undefined) {
    throw new PanelError(`Review ${reviewId} was sent, and agent ${recipient.agentId} was given no comment. Nothing was sent.`, 500)
  }
  const registered = agentForRecord(recipient.agentId)
  if (registered === null) {
    throw new PanelError(
      `Review ${reviewId} was sent to agent ${recipient.agentId}, and no agent answers to that id. Nothing was sent, and nothing was guessed.`,
      500,
    )
  }
  const body =
    comments.length === 1 ? only.body : comments.map((one, at) => `${String(at + 1)}. ${one.body.trim()}`).join('\n\n')
  const message = createRecord({
    kind: 'message',
    title: enoughOfIt(body),
    data: { body, to: [{ kind: 'agent', id: registered.id }], quotes: comments.map((one) => one.context) },
    workspaceId,
    actor,
    carries: comments.map((one) => one.id),
  })
  // EACH COMMENT'S OWN QUEUED ROW TO THIS AGENT IS ARCHIVED, naming this message and with a sentence saying so, so the
  // agent is given the words once. A comment that names its agent has a row of its own, and a review holds it until the
  // send.
  const ids = theRegistryIdsOf(sqlite, registered.id)
  const queued = readInPieces(
    comments.map((one) => one.id),
    (piece) =>
      db
        .select({ messageId: messageDelivery.messageId, recipientId: messageDelivery.recipientId })
        .from(messageDelivery)
        .where(and(inArray(messageDelivery.messageId, piece), eq(messageDelivery.recipientKind, 'agent'), eq(messageDelivery.mark, 'queued'), inArray(messageDelivery.recipientId, ids)))
        .all(),
  )
  archiveDeliveries(
    queued.map((one) => ({ messageId: one.messageId, who: { kind: 'agent', id: one.recipientId }, because: aReviewsMessageCarriesIt(message.id), carriedIn: message.id })),
  )
  return { id: message.id, to: registered.id }
}

/** WHY A SENT REVIEW ARCHIVED A COMMENT'S OWN DELIVERY: the message it names carries the comment to the same agent. */
export function aReviewsMessageCarriesIt(messageId: string): string {
  return (
    `The review was sent, and its message ${messageId} carries this comment to the same agent. The agent is given ` +
    'the words in that message, so this delivery hands nothing over and wakes nobody.'
  )
}

/**
 * The line that stands above one comment's words: what it was left on, and the words the person
 * selected there, read by `spanNamedBy`, the one reader of which words a comment names.
 *
 * WHAT IT WAS LEFT ON IS NAMED IN WORDS, WITH NO ID (problem F6-GRSXrBMtJ). The line is stored in
 * the message's words, and a person reads those words in the chat in whichever mode they are in, so
 * an id in them would be shown in Normal mode. `whatItWasLeftOn` says how each thing is named.
 *
 * THE IDS STAY WHERE A PROGRAM READS THEM: the message's `carries` list, and each quote in the
 * request an agent is handed (`assembleRequest` in lib/agents.ts gives `commentId`, `context` and
 * `contextSaid`, and `contextSaid` keeps the id). The review pane shows them beside this line in
 * developer mode, from `ids` on the preview.
 */
function quoteLineOf(comment: FoundMember, workspaceId: string): string {
  const words = spanNamedBy(comment.context)
  return `On ${whatItWasLeftOn(comment, workspaceId)}${words === null ? '' : `: “${words.quote}”`}`
}

/**
 * WHAT ONE COMMENT WAS LEFT ON, IN WORDS A PERSON READS AND WITH NO ID.
 *
 * IT IS BUILT FROM THE KIND AND THE TITLE, TAKEN WHOLE, AND NEVER BY TAKING IDS OUT OF A SENTENCE.
 * It used to be the reading's own sentence with every id the target names removed, and a record
 * target's ids include the project's workspace id, which is an ordinary word: in project robotics
 * the note "robotics bench plan" became the note " bench plan", stored in the message both the
 * agent and the owner read (check Sn7v_9uljg7T). So the record, or the plan, is read here and named
 * by its kind and its whole title, with the part of it the comment is on said in words before it:
 * *a block of the report "Pump notes"*. A thing that holds no title is named by what kind of thing
 * it is. The ids go only into developer mode, which the preview draws from the context.
 *
 * A PAGE IS NAMED BY THE RECORD IT SHOWS, OR NOT AT ALL. The server holds no list of page names (the
 * names live in the browser's pages), so for most addresses it cannot name the page and says
 * *a page*. The one address it can read is a record's own page, `/r/<id>`: when that id is a record
 * of this project that is not deleted, the line says *the page of the note "Pump notes"*. The
 * address itself is an id to a person and goes only into developer mode.
 */
/** The words before the record's name for a comment on one part of it. A whole record has none. */
const THE_PART_A_COMMENT_IS_ON: Partial<Record<TargetKind, string>> = {
  reportBlock: 'a block of',
  region: 'a part of',
  change: 'a change to',
  tableRow: 'a row of a table in',
  tableCell: 'a cell of a table in',
  graphNode: 'a node in the drawing of',
}

/**
 * ONE TARGET NAMED BY ITS KIND AND ITS WHOLE TITLE, with no id. See `whatItWasLeftOn`.
 *
 * A record of this project, or a plan, is read and named by its title. One that cannot be found now
 * says so rather than naming a guess. Anything else is named by the kind of thing it is.
 */
function whatATargetIsInWords(target: Target, workspaceId: string): string {
  const spec = targetSpec(target.kind)
  const ids = target as unknown as Record<string, string | undefined>
  const recordId = ids['recordId']
  if (recordId !== undefined) {
    const record = getRecord(recordId)
    if (record === null || record.deletedAt !== null || (record.workspaceId !== workspaceId && record.workspaceId !== MESSAGE_CENTRE)) {
      return `a ${spec.noun} Mole Office cannot find now`
    }
    const named = `the ${kindWord(record.kind).text} "${record.title}"`
    const part = THE_PART_A_COMMENT_IS_ON[target.kind]
    return part === undefined ? named : `${part} ${named}`
  }
  const planId = ids['planId']
  if (planId !== undefined) {
    const plan = getPlan(planId)
    if (plan === null) return `a ${spec.noun} Mole Office cannot find now`
    const named = `the plan "${plan.title}"`
    if (target.kind === 'planLine') return `a line of ${named}`
    if (target.kind === 'planLineFact') return `the ${target.fact} of a line of ${named}`
    return named
  }
  return `a ${spec.noun}`
}

function whatItWasLeftOn(comment: FoundMember, workspaceId: string): string {
  const target = comment.context.target
  if (target.kind !== 'page') return whatATargetIsInWords(target, workspaceId)
  const own = /^\/r\/([^/]+)$/.exec(target.route)
  const record = own === null ? null : getRecord(decodeURIComponent(own[1] ?? ''))
  if (record === null || record.deletedAt !== null || (record.workspaceId !== workspaceId && record.workspaceId !== MESSAGE_CENTRE)) return 'a page'
  return `the page of the ${kindWord(record.kind).text} "${record.title}"`
}

/**
 * IS THIS COMMENT THE PERSON'S OWN TO ANSWER? The reading is what says so, and `assertMayWrite` is
 * what decides.
 *
 * The reading kept beside a comment says, in a sentence, what could exist afterwards — and when
 * that names a thing only a person may write, the sentence carries the one line `intent.ts` writes
 * for it. This looks for exactly that line, then ASKS the rule whether an agent may write the thing
 * it names. Two questions, and only the second one is a rule: the first is reading what Mole Office
 * already kept.
 *
 * WHAT A PERSON READS IS NOT THE REFUSAL `assertMayWrite` THROWS. That refusal is written for an
 * agent — it names routes, a request body and headers — and `PanelError` says in its own comment
 * that a message with the wire in it in front of a person is the defect it exists to prevent. So
 * the rule is asked, and the sentence is written here from the declaration's own words.
 *
 * A COMMENT NOTHING HAS READ ANSWERS NULL, and that is not "Mole Office looked and it is ordinary". It
 * is "nobody has read this", which `sendReview` counts and says out loud.
 */
function yoursToAnswerIn(member: FoundMember): SendPlanSentence | null {
  if (member.interpretation === null) return null
  const named = whatOnlyAPersonMayWrite(member.interpretation)
  for (const artefact of named) {
    if (artefact.refused === null) continue
    try {
      // ASKED, NOT RESTATED. The actor is the agent this comment would otherwise be handed to; who
      // in particular does not change the answer, because the rule is about the TYPE of the writer
      // and about there being an explicit one. If this ever stops refusing, Send stops holding.
      assertMayWrite(artefact.refused.kind, 'create', { type: 'agent', id: 'the agent this would go to' }, member.id)
    } catch (err) {
      if (!(err instanceof PanelError)) throw err
      // THE KIND, NOT THE WORD: the composer says the kind in the reader's language, so a Chinese line carries 决定 and
      // not "decision". The English is the same word as before, because the kind's English word is the artefact's word.
      return { key: 'yoursToAnswer', kind: artefact.refused.kind, values: { why: artefact.refused.why } }
    }
  }
  return null
}

/** Who a comment's own words name, or the refusal saying they name nobody in particular. */
function fromWhatTheyWrote(hint: string, workspaceId: string): MessageInput['recipient'] {
  // NO CONTEXT IS HANDED OVER, and that changes nothing about the matching: `resolveRecipient` says
  // so itself — the context it takes only decorates the sentence a resolved candidate comes back
  // with. A comment can point at a plan line or at a page, and neither is one of the three shapes
  // that reader takes, so handing over the ones that fit and nothing for the ones that do not would
  // make the answer depend on what the comment happened to be about.
  const said = resolveRecipient(hint, null, workspaceId)
  if (said.outcome === 'one') {
    return { kind: 'session', sessionId: said.recipient.sessionId, said: hint, why: said.note }
  }
  return { kind: 'unresolved', said: hint, why: said.note }
}

/** The conversation this review is sent in, or null because it has none yet. */
function conversationOf(row: ReviewRow): string | null {
  // TWO COLUMNS, TWO FACTS, AND THE SECOND IS ONLY EVER READ WHEN THE FIRST IS EMPTY. `sentThreadId`
  // is where it went; `fromThreadId` is where its remarks were written, which for a review brought
  // forward from round seven is the conversation those remarks are STILL in — so that is the
  // conversation it is sent in, and sending it writes the same id into `sentThreadId`.
  return row.sentThreadId ?? row.fromThreadId
}

/** Every message in this review's conversation. Empty when it has none. */
function messagesIn(row: ReviewRow): AgentMessageView[] {
  const threadId = conversationOf(row)
  if (threadId === null) return []
  const thread = db.select().from(agentThreads).where(eq(agentThreads.id, threadId)).get()
  if (thread === undefined) return []
  return readThread(threadId, row.workspaceId).messages
}

/**
 * THE MESSAGE THAT ALREADY CARRIES EACH COMMENT, BY THE COMMENT'S ID.
 *
 * A comment is written into the conversation ONCE. Without this a review holding one comment
 * nobody could deliver wrote that comment's words in again on the next press — two messages, one
 * sentence, and an agent with no way to tell it was one request. Measured 19 August 2026.
 *
 * IT IS READ FROM THE COLUMN THE MESSAGE CARRIES rather than by comparing words. Two comments can
 * say the same thing, and matching on content is the guess this whole layer refuses.
 */
function carrying(messages: readonly AgentMessageView[]): Map<string, AgentMessageView> {
  const found = new Map<string, AgentMessageView>()
  // EVERY COMMENT A MESSAGE CARRIES, one or several: a message carrying
  // three comments carries each of them.
  for (const one of messages) {
    for (const commentId of one.carries) found.set(commentId, one)
  }
  return found
}

/**
 * WHERE A COMMENT WENT WITH THIS REVIEW, named from the reading of the message that carried it: a new agent, the agent
 * or run by its title, or, where that reading names nobody, only that it went with this review.
 */
function sentWithThisReview(message: AgentMessageView): SendPlanSentence {
  const reading = message.delivery.sentence
  if (reading?.key === 'goesToNew') return { key: 'sentWithThisReviewToNew' }
  const title = reading?.key === 'goesToAgent' || reading?.key === 'goesToRun' ? reading.values?.['title'] : undefined
  return title === undefined ? { key: 'sentWithThisReview' } : { key: 'sentWithThisReviewTo', values: { to: String(title) } }
}

/** Resolve only the stored address, using the message pool's session identity reader. */
function resolvedAgentFor(recipient: MessageInput['recipient'] | AgentMessageView['recipient'], readableProjects: ReadonlySet<string> | null): WhereOneCommentGoes['resolvedAgent'] {
  if (recipient == null) return null
  const id = recipient.kind === 'agent' ? recipient.agentId : recipient.kind === 'session' ? recipient.sessionId : null
  if (id === null || id === undefined || id === '') return null
  const record = getRecord(id)
  if (record === null || record.deletedAt !== null || (readableProjects !== null && !readableProjects.has(record.workspaceId))) return null
  const agent = recipient.kind === 'agent'
    ? record.kind === 'agent' ? agentForRecord(record.id) : null
    : record.kind === 'session' ? theAgentASessionAnswersAs(record, record.workspaceId)?.agent ?? null : null
  if (agent === null) return null
  const projects = projectsOfAgent(agent.id).filter((project) => readableProjects === null || readableProjects.has(project))
  return projects.length === 0 ? null : { agent: agent.id, projects }
}

/**
 * WHAT PRESSING SEND WOULD DO, WORKED OUT ONCE AND USED TWICE.
 *
 * The preview a person reads before pressing and the act itself run this same function, so the line
 * they read under a comment is the line the send obeyed. Two answers to "where is this comment
 * going" is the defect this repository names as its own, and this is the question where being wrong
 * means handing somebody's words to an agent they did not choose.
 */
function planSend(
  row: ReviewRow,
  choices: readonly ChoiceForOneComment[],
  only: readonly string[] | null,
  readableProjects: ReadonlySet<string> | null = null,
): {
  detail: ReviewDetail
  planned: Planned[]
} {
  const workspaceId = row.workspaceId
  const detail = readReview(row.id, workspaceId)
  const messages = messagesIn(row)
  const waiting = new Map(messages.map((one) => [one.id, one]))
  const already = carrying(messages)
  const chosen = new Map(choices.map((one) => [one.commentId, one.recipient]))
  /**
   * WHICH OF THESE COMMENTS SOMETHING HAS ALREADY BEEN HANDED, read once for the whole review.
   *
   * A live session answering as the agent can take a comment straight from the door, before the
   * review holding it is ever sent. The review still carries it — that is problem `p9enuTYIC-S6`'s
   * answer and a review that held it back would be wrong about its own membership — but the line
   * under it must not go on saying the words are about to go somewhere they have already reached.
   *
   * IT IS THE SAME READER THE SENTENCE AFTER THE PRESS USES. `alreadyGone` in lib/agents.ts calls
   * `alreadyHandedOver` too, so the screen and the reply cannot say opposite things about one
   * comment, which is what they did. Problem `-4GypldN_XMS`.
   */
  // THE COMMENTS SAVED WITHOUT SENDING ARE PLANNED AFTER THE MEMBERS, the same way. They are not
  // members (see `savedNotSent`), and the send carries them all the same.
  // THE ONES THE REVIEW TOOK IN WHEN IT STARTED ARE MEMBERS, but they were saved without sending all the same, so the
  // send refuses over one with nobody to go to exactly as it does over a saved one (problem H031xonpPSqa): taking
  // them in (wave 13r round 15) did not make a half-sent review acceptable for them.
  const saved = new Set([...detail.saved.map((one) => one.id), ...takenInOf(row)])
  const carries: ReviewMember[] = [...detail.members, ...detail.saved]
  const handedOver = alreadyHandedOver(carries.filter((one) => one.found).map((one) => one.id))
  const takenOut = new Map((detail.takenOut ?? []).map((one) => [one.id, one]))
  // A COMMENT CAN BE TAKEN OUT ONLY OF A REVIEW THAT WAITS AND WROTE DOWN WHAT IT HOLDS, which is what the press refuses.
  const canTakeOut = row.state !== 'collecting' && row.state !== 'abandoned' && detail.review.membershipFrozen
  /** The same plan with the press that takes its comment out, when one can. */
  const withAWayOut = (one: Planned, wayOut: TakenOutBecause): Planned => (canTakeOut ? { ...one, line: { ...one.line, wayOut } } : one)
  /** The line of a comment taken out of what the review waits for: it does not go, and it says which press took it out. */
  const outOfIt = (one: TakenOut): Pick<WhereOneCommentGoes, 'yoursToAnswer' | 'says' | 'sentence' | 'takenOut'> => {
    const sentence: SendPlanSentence = { key: one.because === 'the-person-answers-it' ? 'answeredByThePerson' : 'removedFromTheReview' }
    return {
      yoursToAnswer: one.because === 'the-person-answers-it',
      says: sayTheLine(sentence),
      sentence,
      takenOut: { because: one.because, by: one.by, at: one.at },
    }
  }

  const planned: Planned[] = carries.map((member): Planned => {
    if (!member.found) {
      const out = takenOut.get(member.id)
      return {
        member,
        line: {
          id: member.id,
          source: member.source,
          quotedBody: '',
          willGo: false,
          yoursToAnswer: false,
          says: member.says,
          ...(out !== undefined ? outOfIt(out) : canTakeOut ? { wayOut: 'it-cannot-be-found' as const } : {}),
        },
        write: null,
      }
    }
    const quotedBody = enoughOfIt(member.body)
    const nothingToWrite = (sentence: SendPlanSentence, yoursToAnswer = false): Planned => ({
      member,
      line: { id: member.id, source: member.source, quotedBody, willGo: false, yoursToAnswer, says: sayTheLine(sentence), sentence },
      write: null,
    })

    // TAKEN OUT OF WHAT THE REVIEW WAITS FOR, by a press on the pane. Nothing is written for it and nothing hands it over.
    // IT IS ASKED BEFORE WHETHER THE PRESS ASKED FOR IT, because a comment taken out is not waiting to be asked for. One
    // that has gone since is not asked about here, and its line says where it went.
    const out = takenOut.get(member.id)
    if (out !== undefined && member.state === 'queued') {
      return { member, line: { id: member.id, source: member.source, quotedBody, willGo: false, ...outOfIt(out) }, write: null }
    }

    // NOT THE ONE THAT WAS ASKED FOR. A person pressing Send on ONE comment's row is sending that
    // comment, and every other comment in the review stays exactly where it was — including ones
    // whose address would resolve. It says so on the row rather than leaving a person to notice
    // that three other comments went out with the one they pressed.
    //
    // IT IS ASKED BEFORE ANY OTHER REASON BUT A TAKE-OUT, because a comment nobody asked to send
    // has not been refused for any of the others: reporting "this has already gone" about a comment
    // this press was never about would be an answer to a question nobody put.
    if (only !== null && !only.includes(member.id)) {
      return nothingToWrite(
        only.length === 1 ? { key: 'notAskedForOne' } : { key: 'notAskedForMany', values: { n: only.length } },
      )
    }

    // ALREADY GONE. A comment sent on its own, from its own row, is not sent again here: an agent
    // given the same words twice cannot tell that it is one request.
    //
    // THE WORD IN THIS SENTENCE IS THE READER'S, NOT THE STORED ONE. It printed `member.state`
    // straight through until 25 August 2026, so a person read *PanelX has it stamped "handled"*
    // two lines under a row that said "Dealt with" — one fact, one screen, two words, and the
    // second of them named after the mechanism that produced it. `stateWord` is the same table the
    // row above reads, in `src/shared/words.ts`. A word it has no reading for comes back as
    // "unknown state: wibble" rather than as itself, which is that table's rule 3 and is why this
    // is one call rather than a branch on the six words.
    if (member.state !== 'queued') {
      // SENT WITH THIS REVIEW. A comment a message of this review's own conversation carries went with this review,
      // so after the press its line says where it went, not that it had "already gone" before (report
      // cu3k8UH1DiRT: the two lines read as a contradiction one above the other).
      const went = already.get(member.id)
      // ITS STATE STAYS ON THE LINE, so a comment a run has since dealt with says so (tests/one-table-of-readings.test.ts).
      if (went !== undefined) return nothingToWrite({ ...sentWithThisReview(went), state: member.state })
      return nothingToWrite({ key: 'alreadyGone', state: member.state })
    }

    // ALREADY IN THE CONVERSATION. An earlier Send wrote it there and it could not be delivered, so
    // it is still waiting with the address on it. Writing it again would put the same sentence in
    // the conversation twice; what happens instead is that dispatch tries it again, and the line
    // under it is the message's own delivery reading rather than a second answer worked out here.
    const carried = already.get(member.id)
    if (carried !== undefined) {
      return {
        member,
        line: {
          id: member.id,
          source: member.source,
          quotedBody,
          willGo: carried.delivery.canSend,
          yoursToAnswer: false,
          says: carried.delivery.says,
          resolvedAgent: resolvedAgentFor(carried.recipient, readableProjects),
          ...(carried.delivery.sentence === undefined ? {} : { sentence: carried.delivery.sentence }),
        },
        write: null,
      }
    }

    // ITS WORDS ARE ALREADY A MESSAGE. A review brought forward from round seven reads its comments
    // out of the conversation they were written into, and that conversation is the one this review
    // is sent in. Writing them again would be the same sentence in two rows.
    if (member.source === 'conversation') {
      const message = waiting.get(member.id)
      if (message === undefined) {
        return withAWayOut(nothingToWrite({ key: 'notReadableInConversation' }), 'it-cannot-be-found')
      }
      return {
        member,
        line: {
          id: member.id,
          source: member.source,
          quotedBody,
          willGo: message.delivery.canSend,
          yoursToAnswer: false,
          says: message.delivery.says,
          resolvedAgent: resolvedAgentFor(message.recipient, readableProjects),
          ...(message.delivery.sentence === undefined ? {} : { sentence: message.delivery.sentence }),
        },
        // NOTHING TO WRITE AND SOMETHING TO SEND. The message is already in the conversation, so
        // dispatch will find it; this row is here so the person can read where it is going.
        write: null,
      }
    }

    const yours = yoursToAnswerIn(member)
    if (yours !== null) return withAWayOut(nothingToWrite(yours, true), 'the-person-answers-it')

    const recipient = chosen.get(member.id) ?? whereOneCommentGoes(member, workspaceId, detail.goesTo)
    // A SAVED COMMENT WITH NOBODY CHOSEN IS NOT WRITTEN INTO THE CONVERSATION. The send refuses while
    // there is one and names it, so a person chooses who it is for first and nothing goes half-sent.
    if (recipient === null && saved.has(member.id)) {
      const waits = nothingToWrite({ key: 'savedWithNobody' })
      return { ...waits, line: { ...waits.line, needsARecipient: true }, savedWithNobody: true }
    }
    const delivery: DeliveryReading = readDelivery(recipient, workspaceId)
    return {
      member,
      line: {
        id: member.id,
        source: member.source,
        quotedBody,
        willGo: delivery.canSend,
        yoursToAnswer: false,
        resolvedAgent: resolvedAgentFor(recipient, readableProjects),
        // WHAT THE DELIVERY ROWS SAY BEATS WHERE THE COMMENT IS ADDRESSED. A comment something has
        // already been handed used to read "This goes to the run …, picked up where it left off",
        // and the reply one press later said it had already reached its agent. The words go with
        // the review either way; what changes is what this line claims about them.
        ...(delivery.canSend && handedOver.has(member.id)
          ? { says: sayTheLine({ key: 'alreadyReached' }), sentence: { key: 'alreadyReached' } satisfies SendPlanSentence }
          : { says: delivery.says, ...(delivery.sentence === undefined ? {} : { sentence: delivery.sentence }) }),
      },
      // Plan a message even when its address cannot be delivered. sendReview writes it only after
      // checking the review, the choices, whether anything can go, and any proof a new agent needs.
      // If those checks pass, a message dispatch cannot deliver stays queued and can be re-addressed.
      write: { recipient, goesTo: delivery.goesTo ?? null },
    }
  })

  return { detail, planned }
}

/**
 * Who a comment is for, as it is STORED: the agent somebody chose, or the words they wrote.
 *
 * THE CHOICE COMES FIRST BECAUSE IT IS A DECISION. `chosenRecipient` is the agent a person picked
 * from the list; `recipientHint` is what they wrote about who they meant. A hint that resolved to
 * somebody else would be Mole Office overruling a choice with a guess, which is the fifth rule broken at
 * the one step where being wrong means handing somebody's words to an agent they did not pick.
 */
function whoTheySaid(member: FoundMember, workspaceId: string): MessageInput['recipient'] {
  const picked = chosenOn(member.id)
  if (picked !== null) return picked
  const hint = hintOn(member.id)
  // NOBODY SAID. `null` is what a message carries when nobody has been chosen for it, and the
  // delivery reading says exactly that. Guessing the strongest connected agent here would be the
  // one thing the recipient layer was built to refuse — see `RECIPIENT_RULE` in lib/recipients.ts.
  if (hint === null) return null
  return fromWhatTheyWrote(hint, workspaceId)
}

/**
 * WHETHER THIS CALLER STARTED THE REVIEW. It is the one check of who may act on a review stored as sent: send what is
 * left of it, or take a comment out of what it waits for.
 */
function startedIt(row: ReviewRow, actor: Actor): boolean {
  return `${actor.type}:${actor.id}` === row.startedBy
}

/** The refusals a review gets before anything is worked out about its comments. */
function refuseIfItCannotBeSent(review: ReviewView, id: string): void {
  if (review.state === 'collecting') {
    throw new PanelError(
      `Review ${id} is still collecting, so what is in it can still change and handing it over would hand over an ` +
        `unfinished collection. Press ${REVIEW_VOCABULARY.finishCollecting.word} first — in the review ` +
        `column, or on the press that sends a conversation's comments — which writes down what is in it and ` +
        `sends nothing. Review ${id} is unchanged.`,
      409,
    )
  }
  if (review.state === 'sent') {
    throw new PanelError(
      `Review ${id} was sent at ${review.sentAt ?? 'a moment nothing recorded'} and every comment in it went. ` +
        `Sending it again would hand the same words to the same agents a second time, and nothing could tell that ` +
        `it was one request. The conversation ${review.threadId ?? 'it went out in'} is where the answers come ` +
        `back. Review ${id} is unchanged.`,
      409,
    )
  }
  if (review.state === 'abandoned') {
    throw new PanelError(
      `Review ${id} was abandoned at ${review.collectedAt ?? 'a moment nothing recorded'}. Sending it would hand ` +
        `over a collection that was ended without sending. The comments in it are untouched and each can still be ` +
        `sent on its own or collected by a new review. Review ${id} is unchanged.`,
      409,
    )
  }
}

/**
 * WHY A COMMENT SOMEBODY NAMED IS NOT IN THIS REVIEW, as the sentence its `Not in it` row carries, or
 * an empty string when there is no such row to read it from.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REFUSAL SAYS IT
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 11 September 2026 (problem 342gEXEpJ20R): a comment written one second before a review
 * started, then named in that review's send, was refused with "that is not one of the comments in
 * this review. The comments in it are: ." The comment was kept and the review had written down why it
 * left it out, as `written-before-it-started`, but the refusal said neither. So the person read it as
 * a comment that had been lost.
 *
 * IT READS `commentsNotIn` AND WORKS NOTHING OUT ITSELF. That is the one place that says why a comment
 * is out, so this sentence and the pane's `Not in it` row say the same thing. A comment the reader may
 * not read has no row there, so nothing more is said about it here either.
 */
function whyItIsNotIn(row: ReviewRow, commentId: string, reader: AMessageReader | null): string {
  const out = commentsNotIn(row.id, row.workspaceId, Number.MAX_SAFE_INTEGER, reader).rows.find((one) => one.id === commentId)
  return out === undefined ? '' : ` ${out.detail}`
}

/**
 * Every comment named by a choice really is a comment in this review.
 *
 * `hidden` is the comments the caller may not read. The refusal lists the
 * comments in the review and leaves those out, because it answers whoever sent the request.
 * `whyOut` says why a named comment is not in it; see `whyItIsNotIn`.
 */
function checkChoices(
  choices: readonly ChoiceForOneComment[],
  detail: ReviewDetail,
  hidden: ReadonlySet<string>,
  whyOut: (commentId: string) => string,
): void {
  const inIt = new Set([...detail.members, ...detail.saved].map((one) => one.id))
  for (const choice of choices) {
    if (inIt.has(choice.commentId)) continue
    throw new PanelError(
      `You chose an agent for ${choice.commentId}, and that is not one of the comments in this review.` +
        `${whyOut(choice.commentId)} Nothing has been sent. ${theCommentsInIt([...inIt], hidden)}`,
    )
  }
  const twice = choices.map((one) => one.commentId).filter((id, at, all) => all.indexOf(id) !== at)
  if (twice.length > 0) {
    throw new PanelError(
      `Two agents were chosen for the comment${twice.length === 1 ? '' : 's'} ${[...new Set(twice)].join(', ')}. ` +
        `One comment goes to one agent. Nothing has been sent.`,
    )
  }
}

/**
 * The sentence the two refusals above end with. A caller who may read every comment gets the whole
 * list, as before; a caller who may not gets `theCommentsYouMayRead`, which says the others are not
 * named rather than calling a part of the list the whole of it.
 */
function theCommentsInIt(inIt: readonly string[], hidden: ReadonlySet<string>): string {
  // AN EMPTY REVIEW IS SAID IN WORDS. The list used to be joined whatever it held, so an empty one read
  // "The comments in it are: ." (problem 342gEXEpJ20R).
  if (inIt.length === 0) return 'This review holds no comments.'
  return inIt.some((one) => hidden.has(one)) ? theCommentsYouMayRead(inIt, hidden) : `The comments in it are: ${inIt.join(', ')}.`
}

/** Every comment named as the only one to send really is a comment in this review. `hidden` and `whyOut` as in `checkChoices`. */
function checkOnly(
  only: readonly string[] | null,
  detail: ReviewDetail,
  hidden: ReadonlySet<string>,
  whyOut: (commentId: string) => string,
): void {
  if (only === null) return
  if (only.length === 0) {
    throw new PanelError(
      `You asked to send none of the comments in this review. Nothing has been sent. Leave the list out to send ` +
        `every comment that can go, or name the comments you mean.`,
    )
  }
  const inIt = new Set([...detail.members, ...detail.saved].map((one) => one.id))
  for (const id of only) {
    if (inIt.has(id)) continue
    throw new PanelError(
      `You asked to send ${id}, and that is not one of the comments in this review.${whyOut(id)} Nothing has been ` +
        `sent. ${theCommentsInIt([...inIt], hidden)}`,
    )
  }
}

/** One line per comment, as a list a person reads. */
function goingLines(lines: readonly WhereOneCommentGoes[]): string {
  return lines.map((one) => `  · "${one.quotedBody}" (${one.id}) — ${one.says}`).join('\n')
}

/**
 * WHAT PRESSING SEND WOULD DO. Writes nothing at all.
 *
 * A person has to be able to see who each comment is going to, and which comments are going
 * nowhere and why, BEFORE they hand their afternoon's work to anybody. This is that answer, and it
 * is the same function the send itself runs.
 */
export function whereTheCommentsWouldGo(
  id: string,
  workspaceId: string,
  choices: readonly ChoiceForOneComment[] = [],
  /**
   * WHO IS ASKING, or null for the whole review. See `readReview`. The send is planned for every
   * comment, because that is what pressing Send would do; then every line, message and count below
   * is worked out from the comments this reader may read, so a comment it may not read is left out
   * and not counted. The comments of one message are numbered among the ones left in.
   */
  reader: AMessageReader | null = null,
): WhereTheyGo {
  const row = reviewRow(id, workspaceId)
  const review = toReview(row)
  // THE PREVIEW IS ABOUT THE WHOLE REVIEW. Sending one comment is a press on that comment's own
  // row, and the row already draws where that comment would go; a preview that answered about one
  // would leave the pane with no list of the others.
  const readableProjects = reader === null ? null : new Set(theProjectsAReaderMayRead(reader).map((project) => project.id))
  const whole = planSend(row, choices, null, readableProjects)
  checkChoices(choices, whole.detail, new Set(), (commentId) => whyItIsNotIn(row, commentId, reader))
  const hidden = theCommentsHiddenFrom(reader, whole.planned.map((one) => ({ id: one.member.id, source: one.member.source })))
  const planned = whole.planned.filter((one) => !hidden.has(one.member.id))
  const conversationMessages = messagesIn(row)
  const carried = carrying(conversationMessages)
  // A COMMENT ONLY THE PERSON MAY ANSWER, OR ONE TAKEN OUT, IS NOTHING PRESSING SEND COULD SEND AGAIN.
  const recoveryAvailable = review.state === 'sent' && review.membershipFrozen && planned.some((one) => {
    if (!one.member.found || one.member.state !== 'queued' || one.line.yoursToAnswer || one.line.takenOut !== undefined) return false
    const message = one.member.source === 'conversation' ? conversationMessages.find((item) => item.id === one.member.id) : carried.get(one.member.id)
    return message === undefined ? one.member.source === 'annotation' : message.state === 'queued'
  })
  const comments = planned.map((one) => one.line)
  // THE SAME GROUPING THE SEND WRITES, from the same function, so the preview's messages are the
  // messages the press writes.
  const messages = oneMessageForEachRecipient(
    planned.filter((one): one is Going => one.write !== null && one.member.found),
  )
    // ONLY THE MESSAGES THAT CAN GO. A comment that cannot go is its own message and stays; the line
    // under it says why.
    .flatMap((one) => {
      const goesTo = one[0]?.write.goesTo ?? null
      return goesTo === null ? [] : [{ goesTo, one }]
    })
    .map(({ goesTo, one }) => ({
      to: goesTo.name,
      ...(goesTo.key === 'new' ? { toANewAgent: true as const } : {}),
      comments: one.map((each, at) => ({
        id: each.member.id,
        number: at + 1,
        quote: quoteLineOf(each.member, workspaceId),
        ids: idsOfTarget(each.member.context.target),
        words: each.line.quotedBody,
      })),
    }))
  const going = comments.filter((one) => one.willGo).length
  const yours = comments.filter((one) => one.yoursToAnswer).length
  const unread = planned.filter(
    (one) => one.line.willGo && one.member.found && one.member.interpretation === null,
  ).length

  // THE PLAN'S OWN SENTENCE, FROM WHAT IT COUNTED. The panel says the same facts in the page's language (`sayThePlan`).
  // THE STORED STATE, AND THE RECOVERY AS A FACT OF ITS OWN. A sent review that can send what is left is still sent.
  const facts: SendPlanFacts = { state: review.state, going, total: comments.length, yours, unread, ...(recoveryAvailable ? { recovery: true as const } : {}) }
  const takenOut = whole.detail.takenOut
  return {
    review,
    comments,
    messages,
    going,
    staying: comments.length - going,
    says: sayThePlan(facts),
    facts,
    recoveryAvailable,
    ...(takenOut === undefined ? {} : { sendLeavesWaiting: whatSendLeavesWaiting(planned, takenOut) }),
  }
}

/**
 * Send the review after checking its state, the choices, whether anything can go, and the person's
 * proof, which dispatch asks for because it may start a new agent. A refusal at those
 * checks writes nothing; the comments already exist. A review whose comments are held only for a
 * retired agent passes the "anything can go" check, so its words are stored for the new-agent press.
 *
 * Then store the planned messages in the review's conversation in one transaction. Existing
 * messages are reused. These messages remain if the later dispatch fails.
 *
 * Dispatch, the one message each recipient is given in the message pool, and the review's sent state
 * share a second transaction. Dispatch records which messages went and writes no run; the comment's
 * state is read from its message. Mark the whole review sent only when the
 * request leaves no planned comment out, including comments for the person, and dispatch holds nothing back.
 */
export function sendReview(
  id: string,
  workspaceId: string,
  choices: readonly ChoiceForOneComment[],
  actor: Actor,
  /**
   * SEND ONLY THESE COMMENTS OF THE REVIEW, or null to send every comment that can go.
   *
   * THIS IS WHAT "SEND THIS COMMENT" IS. The review pane has a press on each comment's own row, and
   * until 19 August 2026 that press made its own conversation through the agent routes: a comment
   * went out in a thread nothing tied to the review, the review's own conversation went on listing
   * it as not sent, and the pane's heading said "4 comments, 3 sent" over it. Two authoritative
   * screens, two answers about one comment.
   *
   * So there is one send, and this says how much of the review it is about. One review, one
   * conversation, whichever press a person uses.
   */
  only: readonly string[] | null = null,
): SendOutcome {
  const before = reviewRow(id, workspaceId)
  const recovering = before.state === 'sent'
  if (!recovering || before.frozen === null) refuseIfItCannotBeSent(toReview(before), id)

  const { detail, planned } = planSend(before, choices, only)
  const takenOut = takenOutOf(before)
  // A sent review can be recovered only from its frozen members. Saved comments were never
  // frozen and readReview deliberately does not infer them for an ended review.
  const selected = new Set(planned.filter((one) => one.member.found && one.member.state === 'queued' && one.line.willGo).map((one) => one.member.id))
  const existing = recovering ? messagesIn(before) : []
  const recoveryMessages = new Set<string>()
  if (recovering) {
    if (selected.size === 0) refuseIfItCannotBeSent(toReview(before), id)
    if (!startedIt(before, actor)) {
      throw new PanelError(sayInEnglish('review.delivery.recoveryStarter'), 403)
    }
    const seen = new Set<string>()
    for (const message of existing) {
      const ids = message.carries.length === 0 ? [message.id] : message.carries
      if (!ids.some((comment) => selected.has(comment))) continue
      // A duplicate or previously sent carrier is not safe to dispatch again.
      if (message.state !== 'queued' || ids.some((comment) => selected.has(comment) && seen.has(comment))) {
        throw new PanelError(sayInEnglish('review.delivery.recoveryHanded'), 409)
      }
      for (const comment of ids) if (selected.has(comment)) seen.add(comment)
      // A shared message is indivisible: never send another comment through a one-row press.
      if (ids.some((comment) => !selected.has(comment))) {
        throw new PanelError(sayInEnglish('review.delivery.recoveryShared'), 409)
      }
      if (message.carries.length > 0) {
        const comments = ids.map((comment) => planned.find((one) => one.member.id === comment)?.member)
        if (comments.some((comment) => comment === undefined || !comment.found)) {
          throw new PanelError(sayInEnglish('review.delivery.recoveryChanged'), 409)
        }
        const found = comments as FoundMember[]
        const words = found.length === 1 ? found[0]!.body.trim() : wordsOfOneMessage(found, workspaceId)
        if (message.body !== words) throw new PanelError(sayInEnglish('review.delivery.recoveryWords'), 409)
      }
      recoveryMessages.add(message.id)
    }
  }
  // WHAT THE CALLER MAY NOT READ. The send itself is about every comment. The
  // refusals below, which answer before the proof that the caller acts for the owner, name only the
  // comments the caller may read and count only those.
  const hiddenFromTheCaller = theCommentsHiddenFrom(
    theMessageReader(actor),
    planned.map((one) => ({ id: one.member.id, source: one.member.source })),
  )
  const whyOut = (commentId: string): string => whyItIsNotIn(before, commentId, theMessageReader(actor))
  checkChoices(choices, detail, hiddenFromTheCaller, whyOut)
  checkOnly(only, detail, hiddenFromTheCaller, whyOut)

  // A SAVED COMMENT THIS PRESS WOULD SEND, WITH NOBODY CHOSEN FOR IT. Refused before anything is
  // written, naming each one the caller may read, so nothing is sent while one would be left behind.
  // Problem H031xonpPSqa: the review is where the person sends their saved comments together.
  const withNobody = recovering ? [] : planned.filter((one) => one.savedWithNobody === true)
  if (withNobody.length > 0) {
    const named = withNobody.filter((one) => !hiddenFromTheCaller.has(one.line.id))
    throw new PanelError(
      `Nothing was sent. ${named.length === 1 ? 'A comment' : 'Comments'} saved without sending ` +
        `${named.length === 1 ? 'has' : 'have'} no recipient chosen yet. Choose one for each on its row, ` +
        `then send the review again. Everything is still here and nothing is lost.\n` +
        named.map((one) => `  · "${one.line.quotedBody}" (${one.line.id})`).join('\n'),
      409,
    )
  }

  const toWrite = planned.filter((one): one is Going => one.write !== null && one.member.found && (!recovering || selected.has(one.member.id)))
  /** Every comment this review carries, by id: what each recipient's one message is written from. */
  const members = new Map(planned.flatMap((one) => (one.member.found ? [[one.member.id, one.member] as const] : [])))
  const yoursToAnswer = planned
    .filter((one) => one.line.yoursToAnswer)
    .map((one) => ({ id: one.line.id, quotedBody: one.line.quotedBody, why: one.line.says, ...(one.line.takenOut === undefined ? {} : { takenOut: true as const }) }))

  // Keep a retired recipient's address with its queued words so the new-agent press can find them.
  // Other wholly unsendable reviews are refused before a conversation is written.
  const heldForRetiredAgent = toWrite.some(({ write }) => readDelivery(write.recipient, workspaceId).retired === true)
  if (!planned.some((one) => one.line.willGo) && !heldForRetiredAgent) {
    // NO COUNT, because the caller may not read every comment, and the list names only the ones it may.
    const named = planned.filter((one) => !hiddenFromTheCaller.has(one.line.id))
    throw new PanelError(
      `Nothing was sent. None of the comments in review ${id} can be handed over as it stands. Everything ` +
        `is still here and nothing is lost. Why, for each comment you may read:\n` +
        goingLines(named.map((one) => one.line)),
      409,
    )
  }

  proofForStartingANewAgent(actor)

  /** The comments nobody asked to send, when the press was about particular ones. One taken out is not waiting to be asked for. */
  const notAskedFor = only === null ? [] : planned.filter((one) => !only.includes(one.line.id) && !takenOut.some((out) => out.id === one.line.id))
  // Recovery wraps both steps in one transaction so another delivery cannot overtake it.
  const perform = () => {
  // Store the planned messages after the checks above, before attempting dispatch.
  const threadId = sqlite.transaction((): string => {
    if (recovering) {
      const current = reviewRow(id, workspaceId)
      const currentMessages = messagesIn(current)
      const relevant = (items: AgentMessageView[]) => JSON.stringify(items.filter((message) =>
        selected.has(message.id) || message.carries.some((comment) => selected.has(comment))))
      if (current.state !== 'sent' || current.sentAt !== before.sentAt || relevant(currentMessages) !== relevant(existing)) {
        throw new PanelError(sayInEnglish('review.delivery.recoveryChanged'), 409)
      }
      const fresh = planSend(current, choices, only).planned
      const snapshot = (items: Planned[]) => JSON.stringify(items.map((one) => [one.member, one.line, one.write]))
      if (snapshot(fresh) !== snapshot(planned)) {
        throw new PanelError(sayInEnglish('review.delivery.recoveryChanged'), 409)
      }
      if (alreadyHandedOver([...selected]).size > 0) {
        throw new PanelError(sayInEnglish('review.delivery.recoveryHanded'), 409)
      }
      // The outer recovery transaction restores sent or rolls this back before any other reader sees it.
      db.update(reviews).set({ state: 'collected', sentAt: null }).where(eq(reviews.id, id)).run()
      const conversation = conversationOf(current)
      if (conversation !== null) {
        const thread = db.select().from(agentThreads).where(eq(agentThreads.id, conversation)).get()
        if (thread === undefined || thread.workspaceId !== workspaceId || thread.state === 'abandoned') {
          throw new PanelError(sayInEnglish('review.delivery.recoveryChanged'), 409)
        }
        if (thread.mode === 'review' && thread.state !== 'open') {
          db.update(agentThreads).set({ state: 'open' }).where(eq(agentThreads.id, conversation)).run()
        }
      }
    }
    const already = conversationOf(before)
    const thread =
      already ??
      createThread(
        { workspaceId, title: `Review started ${before.startedAt} — ${nameTarget(entryOf(before).target)}`, mode: 'review' },
        actor,
      ).id
    // ONE MESSAGE FOR EACH RECIPIENT, holding all their comments in the order written, as a decision
    // says. A recipient given one comment gets it exactly as before: its words, its
    // context, and `fromAnnotationId`. Two or more go as one message whose words number them and
    // whose `carries` lists each comment with its quote, so each is still its own record.
    for (const group of oneMessageForEachRecipient(toWrite)) {
      const [first] = group
      if (first === undefined) continue
      const added = addMessage(
        thread,
        workspaceId,
        group.length === 1
          ? {
              // WHAT THEY WERE DOING, IN THE ONE WORD THE COLUMN TAKES. They were reviewing: that is
              // what a review is, and it is not read out of anybody's words.
              intent: 'review',
              body: first.member.body,
              context: first.member.context,
              recipient: first.write.recipient,
              // WHICH COMMENT THESE WORDS CAME FROM. It is what keeps one sentence in two rows from
              // being two facts: a reader gets back to the record the person wrote, and a second
              // press can tell that this comment is already in the conversation.
              fromAnnotationId: first.member.id,
            }
          : {
              intent: 'review',
              body: wordsOfOneMessage(group.map((one) => one.member), workspaceId),
              recipient: first.write.recipient,
              carries: group.map((one) => ({ commentId: one.member.id, quote: one.member.context })),
            },
        actor,
      )
      if (recovering) recoveryMessages.add(added.id)
    }
    db.update(reviews).set({ sentThreadId: thread }).where(eq(reviews.id, id)).run()
    return thread
  })()

  // Dispatch, give each recipient its one message, and mark the review sent when appropriate, in one transaction. A
  // key file written inside it is removed if the transaction rolls back.
  const done = withDispatchedAgentKeys((): { outcome: ReturnType<typeof dispatchThread>; at: string; messages: SendOutcome['messages'] } => {
    // NO RUN. Each recipient is given one message in the message pool instead, which the agent's waiter, the message
    // worker and the person's chat all read, as a decision says; problem eCrK1atZOrvA. The
    // conversation's messages are still stamped sent by dispatch, to the agent it worked out, and a comment's state
    // is still read from them.
    const outcome = dispatchThread(threadId, workspaceId, actor, new Map(), null, 'none', recovering ? recoveryMessages : null)
    if (recovering && outcome.held.length > 0) throw new PanelError(sayInEnglish('review.delivery.recoveryChanged'), 409)
    const at = now()
    const messages = outcome.recipients.map((one) => writeTheMessageTo(one, members, id, workspaceId, actor))
    // MARK THE WHOLE REVIEW SENT WHEN IT WAITS FOR NOTHING, asked of what it holds after dispatch by the one rule
    // (`whatTheReviewWaitsFor`). A comment held back, one nobody asked to send, one only the person may answer and one
    // that cannot be found all still wait, unless the person took it out.
    const afterDispatch = readReview(id, workspaceId)
    const complete = recovering ||
      whatTheReviewWaitsFor([...afterDispatch.members, ...afterDispatch.saved], takenOut).length === 0
    if (complete) {
      db.update(reviews).set({ state: 'sent', sentAt: recovering ? before.sentAt : at }).where(eq(reviews.id, id)).run()
    } else {
      // A review conversation must stay writable while the review still has comments to send.
      db.update(agentThreads).set({ state: 'open' }).where(and(eq(agentThreads.id, threadId), eq(agentThreads.mode, 'review'))).run()
    }
    return { outcome, at, messages }
  })
  return { threadId, done }
  }
  const { threadId, done } = recovering ? withDispatchedAgentKeys(perform) : perform()

  const outcome = done.outcome
  const after = readReview(id, workspaceId)
  const told: SendFacts = {
    dispatch: outcome.told,
    yours: yoursToAnswer.map((one) => ({ quotedBody: one.quotedBody, id: one.id, ...(one.takenOut === true ? { takenOut: true as const } : {}) })),
    askedFor: only === null ? null : only.length,
    notAskedFor: notAskedFor.length,
    reviewSent: after.review.state === 'sent',
  }
  return {
    review: after,
    threadId,
    messages: done.messages,
    sent: outcome.sent,
    // HOW MANY OF THOSE HAD ALREADY REACHED THEIR AGENT. See `alreadyGone` on DispatchOutcome:
    // `sent` counts what this review carried, and this says how much of that is not news.
    alreadyGone: outcome.alreadyGone,
    held: outcome.held,
    yoursToAnswer,
    // THE ENGLISH FROM THE ONE COMPOSER the panel says in the page's language (src/shared/send-plan-words.ts). It names the
    // comments that are the person's to answer and leaves the reason to each comment, so the pane does not print one long
    // sentence twice; it says what this press was not about, so the comments that did not go are not left to a count.
    says: sayTheSend(told),
    told,
  }
}

/** What a press that took a comment out of what a review waits for did. */
export interface TakeOutOutcome {
  review: ReviewDetail
  /** The entry the press wrote: which comment, why, who pressed and when. */
  takenOut: TakenOut
  /** Whether the review reads as sent now. */
  reviewSent: boolean
  says: string
  /** What `says` says, as facts, for the review panel to say in the page's language (`sayTheTakeOut`). */
  told: TakeOutFacts
}

/**
 * TAKE ONE COMMENT OUT OF WHAT A REVIEW WAITS FOR, by one of the two presses on the review pane.
 *
 * "I answer this myself" (`the-person-answers-it`) is for a comment only the person may answer. Pressing Send never
 * hands one over, so without this press the review waited for it for ever. "Remove from this review"
 * (`it-cannot-be-found`) is for a comment the review contained that can no longer be found. Each press takes out only
 * its own kind of comment. A comment that went, or one taken out already, is refused. Every refusal changes nothing.
 *
 * THE COMMENT STAYS. Its record, its words and its line in the review are not touched. The frozen membership gains one
 * entry that says which comment, why, who pressed and when.
 *
 * WHO MAY PRESS IS WHO MAY SEND THIS REVIEW. That is a caller `proofForStartingANewAgent` passes, the check `sendReview`
 * makes before it writes anything. On a review stored as sent it is also only the review's starter, as only the
 * starter may send what is left of one.
 *
 * WHEN NOTHING ELSE WAITS, THE REVIEW IS MARKED SENT, by the rule `sendReview` uses (`whatTheReviewWaitsFor`). A
 * review already stored as sent keeps the time it was first sent.
 */
export function takeOutOfTheReview(
  id: string,
  workspaceId: string,
  press: { comment: string; because: TakenOutBecause },
  actor: Actor,
): TakeOutOutcome {
  const row = reviewRow(id, workspaceId)
  if (row.state === 'collecting') throw new PanelError(sayInEnglish('review.takeOut.collecting'), 409)
  if (row.state === 'abandoned') throw new PanelError(sayInEnglish('review.takeOut.abandoned'), 409)
  const frozen = frozenOf(row)
  if (frozen === null) throw new PanelError(sayInEnglish('review.takeOut.notFrozen'), 409)
  if (row.state === 'sent' && !startedIt(row, actor)) throw new PanelError(sayInEnglish('review.takeOut.starter'), 403)
  try {
    proofForStartingANewAgent(actor)
  } catch (err) {
    // ITS OWN SENTENCE, because the proof's says that nothing was sent, and this press does not send.
    if (err instanceof PanelError && err.status === 403) throw new PanelError(sayInEnglish('review.takeOut.notProved'), 403)
    throw err
  }

  // WHAT THE PRESS IS ABOUT IS READ FROM THE PLAN, the same lines the pane draws its presses from.
  const { planned } = planSend(row, [], null)
  const one = planned.find((each) => each.member.id === press.comment)
  if (one === undefined) throw new PanelError(sayInEnglish('review.takeOut.notInIt'), 400)
  if (one.line.takenOut !== undefined) throw new PanelError(sayInEnglish('review.takeOut.already'), 409)
  if (one.member.found && one.member.state !== 'queued') throw new PanelError(sayInEnglish('review.takeOut.gone'), 409)
  // EACH PRESS TAKES OUT ONLY ITS OWN KIND OF COMMENT, read from the line the pane draws the press from.
  if (one.line.wayOut !== press.because) {
    throw new PanelError(sayInEnglish(press.because === 'the-person-answers-it' ? 'review.takeOut.notThePersons' : 'review.takeOut.stillFound'), 409)
  }

  const at = now()
  const takenOut: TakenOut = { id: press.comment, because: press.because, by: `${actor.type}:${actor.id}`, at }
  const out = [...frozen.takenOut, takenOut]
  const waiting = whatTheReviewWaitsFor(planned.map((each) => each.member), out)
  // ONE WRITE: the entry, and the state when nothing else waits.
  db.update(reviews)
    .set({
      frozen: writeFrozen({ ...frozen, takenOut: out }),
      ...(waiting.length === 0 && row.state !== 'sent' ? { state: 'sent' as const, sentAt: at } : {}),
    })
    .where(eq(reviews.id, id))
    .run()

  const after = readReview(id, workspaceId)
  const told: TakeOutFacts = { press: press.because === 'the-person-answers-it' ? 'answered' : 'removed', waiting: waiting.length }
  return { review: after, takenOut, reviewSent: after.review.state === 'sent', says: sayTheTakeOut(told), told }
}

/**
 * The states nothing sets by hand, refused by name.
 *
 * A review may not be moved to `organised` or `sent` here, and the refusal says which act does the
 * work rather than 400-ing with a shrug. Accepting the word and doing nothing would leave a review
 * that says it was sent with nothing having been sent, which is the first rule broken in the place
 * it costs most.
 */
export function setState(id: string, workspaceId: string, state: ReviewState): never {
  reviewRow(id, workspaceId)
  if (state === 'organised') {
    throw new PanelError(
      `A review becomes organised by something reading its comments, not by being told it was read. ` +
        `GET /api/reviews/${id}/organise says what an interpreter is asked, and POST /api/reviews/${id}/organise ` +
        `takes the reading that comes back — it is checked against the comments in this review, and the review is ` +
        `marked organised only when at least one sentence was stored beside the words it is about. Review ${id} is ` +
        `unchanged.`,
      409,
    )
  }
  if (state === 'sent') {
    throw new PanelError(
      `A review is sent by sending it, not by being told it went. POST /api/reviews/${id}/send writes every ` +
        `comment, with its recipient, into one conversation, gives each recipient one message holding ` +
        `their comments, and marks the review sent only when nothing was left waiting in it. ` +
        `GET /api/reviews/${id}/send says where each comment would go first, and writes nothing. Marking it sent ` +
        `here would say work had been handed over when none had. Review ${id} is unchanged.`,
      409,
    )
  }
  if (state === 'abandoned') {
    throw new PanelError(
      `A review is abandoned by abandoning it — POST /api/reviews/${id}/abandon — which writes down what it held, ` +
        `stops it collecting and sends nothing. Marking it abandoned here would leave a review that is still ` +
        `collecting wearing the word for one that is not. Review ${id} is unchanged.`,
      409,
    )
  }
  throw new PanelError(
    `A review is set to "collected" by finishing collecting — POST /api/reviews/${id}/finish-collecting — which ` +
      `writes down what was in it. "collecting" is where a review starts and nothing returns it there, because a ` +
      `frozen membership cannot be unfrozen. Review ${id} is unchanged.`,
    409,
  )
}

// ============================================================================ the list

/**
 * This project's reviews, newest first.
 *
 * `covers` narrows the list to the reviews whose scope includes one particular thing — the same
 * string an addressable element on screen carries as `data-target`. That is what answers "is
 * anything collecting where I am standing right now", and it is answered HERE rather than in the
 * browser so that there is one statement of what a scope includes.
 */
function listReviewsWithinOneRead(opts: {
  workspaceId: string
  state?: ReviewState
  /** A `data-target` attribute value. */
  covers?: string
  /** Who is asking, so a count leaves out the comments they may not read. Null counts every comment. */
  reader?: AMessageReader | null
}): ReviewListReply {
  const rows = db.select().from(reviews).where(eq(reviews.workspaceId, opts.workspaceId)).all()

  // COUNTED OVER EVERY REVIEW OF THIS PROJECT, never over what the filters left. `counts` exists so
  // a screen can say how many are collecting without asking again, and a count that changed when
  // somebody narrowed the list would answer a different question under the same name.
  const counts: Record<ReviewState, number> = {
    collecting: 0,
    collected: 0,
    organised: 0,
    sent: 0,
    abandoned: 0,
  }
  for (const row of rows) counts[row.state as ReviewState] += 1

  let listed = rows.map(toReview)
  if (opts.state !== undefined) listed = listed.filter((review) => review.state === opts.state)
  let narrowed = ''
  if (opts.covers !== undefined) {
    const read = targetFromAttributeValue(opts.covers)
    if ('problem' in read) throw new PanelError(`\`covers\` is not usable: ${read.problem}`)
    const target = read.target
    listed = listed.filter((review) =>
      insideScope(scopeOf(review.entry, review.workspaceId, review.reach), target, review.workspaceId),
    )
    narrowed = ` Narrowed to the ones collecting ${nameTarget(target)}.`
  }
  listed.sort((a, b) => (a.started === b.started ? a.id.localeCompare(b.id) : b.started.localeCompare(a.started)))

  const carried = listed.slice(0, MAX_ROWS)
  const leftOutGroups: LeftOutGroup<ReviewListBucket>[] = [{
    cause: 'budget', bucket: 'row_limit', count: listed.length - carried.length,
    ids: listed.slice(MAX_ROWS).map((review) => review.id),
  }]
  const subtraction: LeftOutCounts = { candidates: listed.length, carried: carried.length, leftOut: listed.length - carried.length, shortened: 0 }
  checkSubtraction('listReviews', subtraction, leftOutGroups)
  const total = listed.length
  const leftOut = subtraction.leftOut
  // THE RECORDS THESE REVIEWS WERE STARTED ON, named in one read.
  const recordIds = [...new Set(carried.map((review) => recordNamedBy(review.entry.target)).filter((one): one is string => one !== null))]
  const named: Record<string, { kind: string; title: string }> = {}
  if (recordIds.length > 0) {
    const rows = db
      .select({ id: records.id, kind: records.kind, title: records.title, deletedAt: records.deletedAt })
      .from(records)
      .where(and(inArray(records.id, recordIds), eq(records.workspaceId, opts.workspaceId)))
      .all()
    for (const one of rows) if (one.deletedAt === null) named[one.id] = { kind: one.kind, title: one.title }
  }
  // WHAT EACH REVIEW STILL COLLECTING WOULD SEND, read with what every review of the project reads in common.
  const collectingHolds: Record<string, number> = {}
  const collectingStamps: Record<string, string> = {}
  const collectingRows = rows.filter((row) => row.state === 'collecting' && carried.some((review) => review.id === row.id))
  if (collectingRows.length > 0) {
    const project = oneProjectsReviews(opts.workspaceId)
    for (const row of collectingRows) {
      const scope = scopeOf(toReview(row).entry, row.workspaceId, row.reach as ReviewReach)
      const { members } = membersOf(row, scope, opts.reader ?? null, project)
      const saved = savedNotSent(row, scope, opts.reader ?? null, project)
      collectingHolds[row.id] = [...members, ...saved].filter((one) => one.found && one.state === 'queued').length
      collectingStamps[row.id] = collectingStampOf(row, members, saved)
    }
  }
  return {
    reviews: carried,
    subtraction,
    leftOutGroups,
    counts,
    total,
    leftOut,
    named,
    collectingHolds,
    collectingStamps,
    says:
      (total === 0
        ? `No review of this project matches.`
        : `${String(total)} review${total === 1 ? '' : 's'} of this project, newest first.`) +
      narrowed +
      // WHAT IS NOT IN THE REPLY IS SAID. A list that quietly stops at 200 tells a caller comparing
      // lengths only that something is odd.
      (leftOut === 0
        ? ''
        : ` ${leftOutWords(REVIEW_LIST_BUCKET_WORDS.row_limit, leftOut)}`) +
      ` A review that is collecting stays collecting until it is finished; walking away from where it was ` +
      `started stops it collecting there and ends nothing.`,
  }
}

// ============================================================ what a review is still holding back

/**
 * EVERY COMMENT A REVIEW HAS NOT SENT YET, by record id, with the review holding it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M28: several comments left for one agent during a review are all shown, marked unsent, and
 * can be sent together in one press, in the conversation or in the review column.
 *
 * From 5 September 2026 a comment gets its delivery rows the moment its recipient is known — which
 * is the fix for problem `fhxBfI7wb1nz`, and it is what puts the comment in the conversation. But
 * `theQueue` in lib/worker.ts takes every delivery row still marked queued, so naming the agent WAS
 * sending the comment: measured at 1.8 seconds, each one starting its own run, and by the time the person
 * reached the send press there was nothing left to send. Problem `g4M_z6965R5o`.
 *
 * This is what the worker asks so that it does not. The rows stay queued, the comment stays in the
 * conversation marked *Not sent yet*, and the review's send — which is the panel's send, one act —
 * is what lets it go.
 *
 * ---------------------------------------------------------------------------------------
 * ASKED OF EACH COMMENT, NOT OF THE REVIEW'S STATE
 * ---------------------------------------------------------------------------------------
 *
 * A review passes through `collecting`, `collected` and `organised` before it is `sent`, and in the
 * review column those are three presses minutes apart. A hold that lifted at *finish collecting*
 * would send the person's comments between two presses they had not finished making. And a send that hands
 * over four comments and holds one back leaves the review not `sent` at all, while four of its
 * comments really have gone.
 *
 * So the question is asked of the comment: has anybody been handed these words yet?
 * `commentsGoneOut` in lib/dispatch.ts is the one reader of that, the same one the unsent mark is
 * built from — so what the worker holds and what the panel draws as *Not sent yet* are the same
 * list by construction, rather than two lists kept in step by hand.
 *
 * A REVIEW THAT HAS ENDED HOLDS NOTHING (`reviewHasEnded`). `abandoned` releases everything in it:
 * a review nobody is going to send must not swallow the words for ever. `sent` releases everything
 * too: its send refuses a second press, so a comment it held would wait for a send that never comes.
 * That happened to a comment a sent review had left as `Earlier` (check 9K27DM6LOr_Z).
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ASKED ABOUT A WHOLE PROJECT AT ONCE, like `commentsGoneOut`
 * ---------------------------------------------------------------------------------------
 *
 * The caller is draining a queue, not asking about one row, and a whole-project answer cannot be
 * wrong about a comment the caller forgot to name. Each review is read the way the review column
 * reads it, and what every review of the project reads in common (`oneProjectsReviews`) is read
 * once for the whole pass, so the reads grow with the number of reviews and not with its square.
 *
 * THE QUEUE NAMES THE COMMENTS IT HAS QUEUED (`only`, wave 13y round 34), and it looks up no other row in the answer,
 * so it cannot forget one. Measured on a copy of an office with seven reviews still able to send and one queued
 * comment, the whole reading took 255 to 281 ms and read 320 MB on each pass; most of that was the comments' places,
 * readers and senders, read for every comment of the project, and the markers of words already gone out.
 */
function commentsAReviewHasNotSentYetWithinOneRead(workspaceId: string, only?: AskedAbout): Map<string, ReviewView> {
  const held = new Map<string, ReviewView>()
  if (only !== undefined && only.size === 0) return held
  const gone = new Set(commentsGoneOut(justThisProject(workspaceId), only === undefined ? undefined : [...only]))
  const project = oneProjectsReviews(workspaceId)
  for (const row of project.rows()) {
    const review = toReview(row)
    if (reviewHasEnded(review.state)) continue
    // READ THE WAY THE COLUMN READS IT, so what the worker holds and what the column draws cannot
    // be two different lists. A review whose scope cannot be worked out at all holds nothing, and
    // it says so by throwing where the column would; the queue must not fall over on it, so the
    // refusal is caught here and the review is skipped with nothing claimed about it.
    let members: ReviewMember[]
    try {
      // AND THE COMMENTS IT LISTS AS SAVED WITHOUT SENDING, which its send carries too. Without them,
      // choosing who a saved comment is for in the review column would hand it over at once, which
      // is problem g4M_z6965R5o again by another way in (problem H031xonpPSqa).
      members = whatItWouldSend(row, project, only)
    } catch {
      continue
    }
    for (const member of members) {
      if (!('found' in member) || !member.found) continue
      if (gone.has(member.id)) continue
      if (!held.has(member.id)) held.set(member.id, review)
    }
  }
  return held
}

/**
 * WHAT A PERSON READS WHEN A REVIEW IS HOLDING THEIR COMMENT BACK.
 *
 * It says what happened, what will let it go, and that nothing is lost — the three things somebody
 * looking at an unsent comment needs. It names the press rather than a route, which is invariant 7
 * of USER.md, and it names the review by its own title so a reader with two open can tell which one
 * has it.
 */
export function aReviewIsHoldingIt(review: ReviewView): string {
  return (
    `This comment is in the review of ${nameTarget(review.entry.target)} started at ${review.started}, and that ` +
    'review has not been sent, so the comment is written down and waiting rather than on its way. Sending the ' +
    `review sends this with everything else in it, in one act: press ${CHAT_WORDS.sendThemAll} at the foot of the ` +
    'conversation, or send the review from its own column. Nothing is lost meanwhile.'
  )
}

/** `readReview`, with the restrictions on what its comments are about read from one graph (`withinOneRead`). */
export function readReview(...args: Parameters<typeof readReviewWithinOneRead>): ReturnType<typeof readReviewWithinOneRead> {
  return withinOneRead(() => readReviewWithinOneRead(...args))
}

/** `listReviews`, with the restrictions on what its comments are about read from one graph (`withinOneRead`). */
export function listReviews(...args: Parameters<typeof listReviewsWithinOneRead>): ReturnType<typeof listReviewsWithinOneRead> {
  return withinOneRead(() => listReviewsWithinOneRead(...args))
}

/** `commentsNotIn`, with the restrictions on what its comments are about read from one graph (`withinOneRead`). */
export function commentsNotIn(...args: Parameters<typeof commentsNotInWithinOneRead>): ReturnType<typeof commentsNotInWithinOneRead> {
  return withinOneRead(() => commentsNotInWithinOneRead(...args))
}

/** `commentsAReviewHasNotSentYet`, with the restrictions on what its comments are about read from one graph (`withinOneRead`). */
export function commentsAReviewHasNotSentYet(...args: Parameters<typeof commentsAReviewHasNotSentYetWithinOneRead>): ReturnType<typeof commentsAReviewHasNotSentYetWithinOneRead> {
  return withinOneRead(() => commentsAReviewHasNotSentYetWithinOneRead(...args))
}

/**
 * WHICH OF THESE MESSAGES A REVIEW NOT YET ENDED HOLDS, IN EVERY PROJECT.
 *
 * The worker holds a comment a review has not sent while the gate `held-by-an-unsent-review` is at block, and asks
 * `commentsAReviewHasNotSentYet` about its own project's queue. The waiting list, the waiter and the hook that reads
 * the waiting list hold it the same way. They ask about one agent's messages, which are kept in the message centre,
 * so each project with a review that has not ended is asked about the comments among them, by the same reading. At
 * off, the worker hands the comment over and these readers list it too. A list with no comment reads no review.
 */
export function theCommentsAReviewIsHolding(ids: readonly string[]): Map<string, ReviewView> {
  const held = new Map<string, ReviewView>()
  if (ids.length === 0 || gatePosition('held-by-an-unsent-review') !== 'block') return held
  const rows = readInPieces(ids, (piece) => db.select({ id: records.id, kind: records.kind, data: records.data }).from(records).where(inArray(records.id, piece)).all())
  const comments: AskedAbout = new Set(rows.filter(isAComment).map((row) => row.id))
  if (comments.size === 0) return held
  const projects = db.selectDistinct({ workspaceId: reviews.workspaceId }).from(reviews).where(notInArray(reviews.state, [...ENDED_REVIEW_STATES])).all()
  for (const { workspaceId } of projects) {
    for (const [id, review] of commentsAReviewHasNotSentYet(workspaceId, comments)) if (!held.has(id)) held.set(id, review)
  }
  return held
}

/**
 * WHICH MESSAGE CARRIES EACH OF THESE COMMENTS, to `to` when it is named and to anybody when it is not. A sent review's
 * send archives a comment's own row to its agent and names the review's message on it (`carried_in`), and nothing else
 * names one. The rows are found by the comment, by `message_delivery_message_idx`, so no other message is read. A
 * comment no message carries is not in the answer. Of two rows of one comment, the one written first answers.
 */
export function theMessagesCarrying(commentIds: readonly string[], to?: ParticipantRef): Map<string, string> {
  const carrying = new Map<string, string>()
  if (commentIds.length === 0) return carrying
  const recipient =
    to === undefined
      ? []
      : [eq(messageDelivery.recipientKind, to.kind), inArray(messageDelivery.recipientId, to.kind === 'agent' ? theRegistryIdsOf(sqlite, to.id) : [to.id])]
  const rows = readInPieces(commentIds, (piece) =>
    db
      .select({ commentId: messageDelivery.messageId, carriedIn: messageDelivery.carriedIn })
      .from(messageDelivery)
      .where(and(inArray(messageDelivery.messageId, piece), isNotNull(messageDelivery.carriedIn), ...recipient))
      .orderBy(messageDelivery.at, messageDelivery.id)
      .all(),
  )
  for (const row of rows) if (row.carriedIn !== null && !carrying.has(row.commentId)) carrying.set(row.commentId, row.carriedIn)
  return carrying
}

/**
 * WHAT THE WAITING LIST LEAVES OUT FOR ONE AGENT, of the messages waiting for it.
 *
 * A comment a review not yet ended holds (`theCommentsAReviewIsHolding`), and a comment whose own delivery to this
 * agent a sent review archived because the review's message carries it (`theMessagesCarrying`). The second is still
 * not seen, so without this the agent would be handed the same words twice: once as the comment, once in the
 * review's message. A person's list is left as it is: the worker holds only what is queued for an agent.
 */
export function whatAReviewKeepsFromTheWaitingList(
  reader: ParticipantRef,
  waiting: readonly { id: string; deliveries: readonly { to: ParticipantRef; mark: string }[] }[],
): { held: Map<string, ReviewView>; carried: Map<string, string> } {
  if (reader.kind !== 'agent') return { held: new Map(), carried: new Map() }
  const held = theCommentsAReviewIsHolding(waiting.map((one) => one.id))
  const archived = waiting.filter((one) => !held.has(one.id) && one.deliveries.some((d) => sameParticipant(d.to, reader) && d.mark === 'archived'))
  return { held, carried: theMessagesCarrying(archived.map((one) => one.id), reader) }
}

/** WHAT A WAITING LIST OR A WAITER SAYS IT LEFT OUT FOR A REVIEW, or null when it left out nothing. */
export function whatAReviewKeptBack(held: number, carried = 0): { held: number; carried: number; says: string } | null {
  if (held === 0 && carried === 0) return null
  const sentences: string[] = []
  if (held > 0) {
    sentences.push(
      `${String(held)} comment${held === 1 ? ' is' : 's are'} for you and left out here: a review that has not been ` +
        `sent holds ${held === 1 ? 'it' : 'them'}. The person's send gives you ${held === 1 ? 'it' : 'them'} in one message.`,
    )
  }
  if (carried > 0) {
    sentences.push(
      `${String(carried)} comment${carried === 1 ? ' is' : 's are'} left out here because a sent review's message ` +
        `carries ${carried === 1 ? 'it' : 'them'} to you. That message gives you the words.`,
    )
  }
  return { held, carried, says: sentences.join(' ') }
}
