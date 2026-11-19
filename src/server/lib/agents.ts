// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { moleOffice } from '@shared/participants.ts'
/**
 * TALKING TO AN AGENT ABOUT REAL WORK: threads, what was said, and the runs a dispatch writes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS LAYER IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A person points at something in Mole Office — a record, a line of a plan, a block on the week, a
 * span of text — writes what they want, says who it is for, and presses Send. In review mode the
 * comments pile up instead, and one press at the end sends them together.
 *
 * The owner's sentence, from design/ROUND-SEVEN-OWNER-MESSAGE.md: *"PanelX becomes the place
 * where a human can point at real work and communicate with an agent about that exact context."*
 *
 * ---------------------------------------------------------------------------------------
 * THE ARCHITECTURAL BOUNDARY THIS FILE KEEPS: A SERVICE IS NOT A RUN
 * ---------------------------------------------------------------------------------------
 *
 * The durable half is here and it is ordinary bookkeeping: threads, messages, who a message is
 * for, when things were sent, what came back. One attempt to answer a thread — a run — is bounded
 * and replaceable, and Mole Office does not run it.
 *
 * **THE SERVER NEVER STARTS A PROCESS.** So a run is A ROW A WORKER
 * CLAIMS OVER HTTP: `tools/agent-worker.mjs` polls for queued runs, claims one, runs the agent on
 * its own machine and posts the answer back. Four requests, no other integration surface. That is
 * also what makes a worker on another machine the same case as a worker on this one.
 *
 * ---------------------------------------------------------------------------------------
 * DISPATCH IS THE ONLY DOOR THAT CREATES A RUN
 * ---------------------------------------------------------------------------------------
 *
 * `dispatchThread` below holds the only `insert(agentRuns)` in this repository, and
 * `tests/one-run-door.test.ts` walks `src/` and fails if a second one appears. The owner has to be
 * able to prove that nothing was sent before they pressed Finish review, and the only honest way to
 * prove that is that there is no other code path. Writing a comment writes a row in
 * `agent_messages` and nothing else; the run table is untouched until dispatch.
 *
 * ---------------------------------------------------------------------------------------
 * ONE RUN PER RECIPIENT, AND A REVIEW IS STILL ONE ACT
 * ---------------------------------------------------------------------------------------
 *
 * Every message carries its own recipient. At dispatch the queued messages are grouped by
 * recipient and ONE RUN IS WRITTEN PER RECIPIENT, all of them naming the same thread. So one review
 * can be split into work for the right agents, rather than every comment going to one agent, and the
 * review is still one durable human action.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PERSON WROTE IS NEVER LOST, AND THAT RULE OUTRANKS THE REST OF THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * **Message durability must not depend on recipient liveness.** A comment is stored first and
 * always. Who it is for is a property of it that may be unresolved, may be wrong, and may be
 * changed afterwards — it is never a condition of keeping the words.
 *
 * WRITING A COMMENT REFUSES NOTHING ABOUT ITS RECIPIENT. Until 19 August 2026 a comment addressed
 * to a session record that came in through the generated corpus was refused BEFORE it was stored,
 * so the person's words were gone and the screen showed an error where their sentence had been.
 * 66 of the 91 session records in the owner's corpus are fixture rows, so that was the likely case
 * and not the rare one. There is nothing to gain by throwing away a sentence somebody wrote in
 * order to tell them the address on it is wrong.
 *
 * WHETHER IT CAN BE SENT IS READ, NOT ENFORCED. `deliveryOf` below answers "can this go, and if
 * not, why" from the stored columns, on every read. One function answers it for the screen, for the
 * reply to the write, and for dispatch, so the sentence a person read before pressing Send is the
 * same sentence dispatch acts on.
 *
 * DISPATCH SENDS WHAT IT CAN AND SAYS WHAT IT COULD NOT. It used to refuse the whole thread when
 * one comment was unroutable, so a review with four good comments and one bad address sent nothing
 * — and the reasoning written here for that was that sending half would leave the person working
 * out which of their comments had gone. That reasoning was answered rather than overruled: the
 * reply and the conversation NAME every comment that stayed behind and why, each one is still
 * queued, still editable and still marked on the page it is about, and pressing Send again after
 * one correction sends it. The thread is only "dispatched" once nothing is left waiting in it.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT'S ANSWER IS A MESSAGE, AND ONE DOOR WRITES A MESSAGE
 * ---------------------------------------------------------------------------------------
 *
 * A finished run used to write its answer into `agent_runs.result` and insert nothing, so a thread
 * read as things a person said and no reply, and replying was impossible because there was nothing
 * to reply to. `finishRun` now appends the answer as a message with `role: 'agent'` carrying the id
 * of the run that produced it. An agent message is already one of the things a person can point at,
 * so continuing from a few words of a reply needs nothing of its own.
 *
 * `writeMessage` holds the only `insert(agentMessages)` in this repository, and
 * `tests/one-message-door.test.ts` walks `src/` and fails if a second one appears — the same guard
 * `tests/one-run-door.test.ts` puts on the run table, added now that a second thing writes messages.
 *
 * **The thread is provenance, not truth.** A task, a problem or a decision stays canonical where it
 * already lives. The thread says who asked for it and what was said.
 *
 * ---------------------------------------------------------------------------------------
 * THE HONESTY HAZARD, AND WHERE IT IS ANSWERED
 * ---------------------------------------------------------------------------------------
 *
 * Addressing *the agent that wrote this report* must never quietly become *a new agent that has
 * never heard of it*. An agent can only really be picked up again where its transcript lives, and
 * the thing a worker needs to do that is the runtime's own id for the conversation. So:
 *
 *   · a run addressed to a session carries `resume_external_id`, read from what discovery stamped
 *     on that session record — one reader, `pickUpOf` in lib/recipients.ts, which is also what the
 *     recipient list showed the person before they pressed Send, so the two cannot disagree;
 *   · a session Mole Office has no such id for is REFUSED AT DISPATCH, by name, with the two honest
 *     choices said out loud: send it to a new agent on purpose, or leave it;
 *   · a worker that has the id but not the transcript DECLINES the run, and `declined` is a real
 *     state meaning *waiting for a worker that can serve it* rather than a failure.
 *
 * ---------------------------------------------------------------------------------------
 * CONTEXT SCOPE IS NOT ACTION SCOPE
 * ---------------------------------------------------------------------------------------
 *
 * A run writes to Mole Office through the ordinary API with agent headers, so the change log names it
 * and `assertMayWrite` refuses it a `decision` with 403. **There is no new permission system here
 * and no way for a run to write as the person.** A result may SAY what it wrote; the change log is
 * what says who wrote it.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE VOCABULARIES LIVE
 * ---------------------------------------------------------------------------------------
 *
 * The four agent columns that hold a word — a thread's mode and state, a message's role, intent
 * and state, a run's state, a recipient's kind — are plain text columns, and db/schema.ts says
 * which words in prose. The lists below are the one place those words exist as values, and every
 * route validates against them, so a word the schema's prose does not mention cannot be stored by
 * going round a route.
 */

import {
  checkSubtraction,
  MARKS_BUCKET_WORDS,
  type LeftOutCounts,
  type LeftOutGroup,
  type ThreadListBucket,
  type MarksBucket,
  type RunListBucket,
  RUN_LIST_BUCKET_WORDS,
  THREAD_LIST_BUCKET_WORDS,
  leftOutWords,
} from '@shared/disclosure.ts'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { agentMessages, agentRuns, agentThreads } from '../db/schema.ts'
import { aRaiseCarriesIt, createRecord, durableIdentityOfRun, everyAgentAStoredStampCouldName, getRecord, identityForAddressedRun, sameAgent, theTwoHalvesOfAStamp, theWriterAStampNames, throughTheCardDoor, type Actor } from './records.ts'
import { now } from '@shared/now.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { retireThisAgent } from './participants.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { CANNOT_REACH_WORDS, type MessageOnTheWire } from '@shared/messages.ts'
import { THE_PERSON } from '@shared/person.ts'
import { writeTheCardMessageToOne } from './cardmessage.ts'
import { aKeyMadeThisWayIsProved, howThisPressProvesTheKeyItMakes } from './provedkeys.ts'
import { aDispatchedAgentsKey, endADispatchedAgentsKey, keepADispatchedAgentsKey } from './dispatched-agent-keys.ts'
import { withDispatchedAgentKeys } from '../db/with-dispatched-agent-keys.ts'
// THE DELIVERY ROWS OF ONE MESSAGE, so a send can say what it really handed over rather than what
// it was asked about. A review's send once said a comment it had already handed over had just gone,
// and that nobody had picked it up yet; reading the delivery rows is what keeps the reply true.
import { alreadyHandedOver, deliveriesOf, isAComment, theAgentASessionAnswersAs, theMessagesHiddenFrom, type AMessageReader } from './messages.ts'
import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
// WHERE A MESSAGE HAS GOT TO, AND THE ONE THING THAT WRITES IT. Nothing in this file updates
// `agent_messages.state` any more; every move goes through `moveMessageTo`, and a source scan plus
// a runtime trigger in that file fail the build and the request if a second writer appears.
import {
  carriedComments,
  commentsGoneOut,
  deliveryWordOf,
  hasGoneOut,
  moveMessagesForward,
  moveMessageTo,
  refuseAMessageThatOwesAMoment,
  theMomentsOfAMessageWrittenAt,
  type MessageState,
} from './dispatch.ts'
import { pickUpOf } from './recipients.ts'
// WRITING THE CONVERSATION AN ANSWER CAME FROM ONTO THE RUN IT BELONGS TO. One writer of a
// discovery stamp's shape, in the file that owns it, so this cannot come to disagree with what
// `stampOf` reads or with what a sweep writes.
import { stampFinishedRun, type RunStamped } from './sessions.ts'
import { defaultEnv, type AdapterEnv } from './adapters/index.ts'
import { getPlan } from './get-plan.ts'
import { linesOf } from '../db/lines-of.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { justThisProject } from '@shared/which-projects.ts'
// WHAT A PERSON CAN POINT AT, DECLARED ONCE. The vocabulary and the stored shape are in
// src/shared/targets.ts because the browser needs the same words; looking one up needs the
// database, so that half is in lib/targets.ts. Neither is restated here.
import {
  spanNamedBy,
  targetKey,
  targetSpec,
  wordsInNamedSpan,
  type Context,
  type NamedSpan,
  type Target,
} from '@shared/targets.ts'
// WHETHER ONE REGION ID NAMES AN ENTRY OF A LIST BY WHERE IT SITS. `readContext` below asks it of
// a row of a table, which is stored as a region and whose promise about positions is older than
// that spelling. The whole argument is on the function.
import { namesOneEntryByItsPosition } from '@shared/regions.ts'
import {
  checkContext as checkStoredContext,
  contextAsStored,
  readWrittenAgainst,
  resolveTarget,
  type TargetResolution,
  type WrittenAgainst,
} from './targets.ts'

// ============================================================================ the words

// The three lists moved to @shared/types.ts, beside the other stored-word vocabularies, because a
// test that draws a screen was opening the operator's database to read one of them. Re-exported
// under the same names, so every importer of this module is unaffected.
import {
  MESSAGE_ROLES,
  THREAD_MODES,
  THREAD_STATES,
  type ActorType,
  type MessageRole,
  type ThreadMode,
  type ThreadState,
} from '@shared/types.ts'

export { MESSAGE_ROLES, THREAD_MODES, THREAD_STATES }
export type { MessageRole, ThreadMode, ThreadState }

// AND THE FOURTH, for the same reason and to a file that also holds the list it has to agree with.
// `MESSAGE_INTENTS` is what a person picks when they send a comment; `COMMUNICATION_INTENTS` in
// @shared/intent.ts is what a reading of that comment may say they wanted, and the second has to
// contain the first. Both are now in one file, so a reader sees both at once.
//
// IT IS IMPORTED AS WELL AS RE-EXPORTED, and that is not a tidiness point: `export { x } from '…'`
// forwards the name without binding it here, so this module's own code below could not see it.
import { MESSAGE_INTENTS, type MessageIntent } from '@shared/intent.ts'
// THE ONE TABLE BETWEEN WHAT MOLE OFFICE STORES AND WHAT A PERSON READS. A refusal from this file is
// drawn on a screen, so a stored state word may not reach one of them as itself.
import { kindWord, stateWord } from '@shared/words.ts'
import { sayANewAgent, sayTheDispatch, sayTheLine, type DispatchFacts, type PickUpReason, type SendPlanSentence } from '@shared/send-plan-words.ts'

export { MESSAGE_INTENTS }
export type { MessageIntent }

/**
 * WHERE A MESSAGE HAS GOT TO. Six words, declared in `lib/dispatch.ts` and re-exported here.
 *
 * IT MOVED because the file that holds the only writer of a column is the file that should hold the
 * list of words that column may take, and `moveMessageTo` is in dispatch.ts. Re-exported under the
 * name every caller already imports, so there is ONE declaration and no second list.
 *
 * It was `['queued','sent','answered']`. `answered` is gone and `delivered`, `picked_up`, `handled`
 * and `failed` have arrived; dispatch.ts says what each means and what was measured before the word
 * was dropped.
 */
export { MESSAGE_STATES, type MessageState } from './dispatch.ts'

/**
 * `withdrawn` IS A RUN THE OFFICE TOOK BACK BEFORE ANY WORKER TOOK IT, so nothing was tried. Only the data half of
 * migration 0253 writes it (src/server/db/withdraw-review-runs-migration.ts): the runs a sent review wrote before a sent
 * review stopped starting runs (wave 13u round 19). It is not `failed`, which would say something was tried.
 */
export const RUN_STATES = ['queued', 'claimed', 'running', 'finished', 'failed', 'crashed', 'declined', 'withdrawn'] as const
export type RunState = (typeof RUN_STATES)[number]

/**
 * Who a comment is for, in four words.
 *
 * `agent` NAMES A DURABLE IDENTITY and is the one answer that still means something after the
 * process that was serving it has ended. Before it existed, addressing "the agent that wrote this
 * report" meant naming one of its past runs, and a run that had gone made the comment unsendable —
 * so the words a person wrote on Tuesday could not be delivered on Wednesday.
 *
 * `session` names a run. It is kept, and sending one RESOLVES it to that run's durable identity for
 * this project, so the two are not two stores: a session is how a person picks an agent by pointing
 * at what it was doing, and the durable id is what the message is filed under.
 *
 * WHICH IDENTITY A MESSAGE IS FILED UNDER IS A DIFFERENT FACT FROM WHO SOMEBODY CHOSE, and
 * `recipient_agent_id` is the first while `recipient_kind` and `recipient_session_id` are the
 * second. The invariant over the pair, asserted by tests/dispatch-store.test.ts:
 *
 *     `recipient_agent_id` is not null ONLY on a row whose recipient HAS a durable identity —
 *     `agent` or `session`. It is null on `new`, on `unresolved` and on a row nobody has chosen for.
 *
 * IT USED TO SAY `recipient_kind = 'agent'` IF AND ONLY IF `recipient_agent_id` IS NOT NULL, and
 * that sentence was false of this product in both directions. Measured 31 August 2026: a queued
 * message addressed to a durable agent stores `kind = 'agent'` with `recipient_agent_id` NULL,
 * because that column is written at SEND — so the ordinary state of an agent-addressed comment
 * broke it, and `migrateAgentDispatch`'s check of it made a server start THROW rather than refuse
 * as soon as that migration had anything else to write. In the other direction the sentence forbade
 * the only shape that lets a run-addressed comment be filed at the moment somebody chooses the run,
 * which is what problem XFT0NENMhPfz needs.
 */
export const RECIPIENT_KINDS = ['agent', 'session', 'new', 'unresolved'] as const
export type RecipientKind = (typeof RECIPIENT_KINDS)[number]

/**
 * The run states that mean the run is over. Nothing may be posted to one of these again.
 *
 * `declined` is here and it is not a failure: the attempt is over, the request is not. A declined
 * run is still waiting, and `saysOf` below says so in words.
 */
const ENDED: readonly RunState[] = ['finished', 'failed', 'crashed', 'declined', 'withdrawn']

/**
 * The runtime a deliberately new agent is asked for.
 *
 * ONE NAME, NOT A REGISTRY. `tools/agent-worker.mjs` serves `claude-code` and leaves a run asking
 * for anything else alone, which is the whole of runtime neutrality that has a user today: another
 * worker for another runtime is another HTTP client and needs nothing here. A run addressed to an
 * existing session takes the runtime that MADE it instead — see `resumeFor`, and the reason there.
 */
export const DEFAULT_RUNTIME = 'claude-code'

/** At most this many threads, marks or runs come back in one reply, with the rest counted. */
export const MAX_ROWS = 200

// ============================================================================ what a comment is about

/**
 * WHAT A COMMENT POINTS AT: a target, optionally some words inside it, optionally a revision.
 *
 * THE SHAPE IS DECLARED IN src/shared/targets.ts and imported here rather than restated. Round
 * seven declared four shapes in this file, one of which wrapped another in an `inside` field, and
 * that wrapper is why a quoted span could only ever sit inside three things. The thirteen things a
 * person can point at, what identifies each and what to call each are one declaration now, and the
 * browser reads the same one.
 */
export type MessageContext = Context

/**
 * Whether what a comment points at is still there.
 *
 * `there`    — the thing is there, and for a quote the words are still where they were.
 * `changed`  — the thing is there and the words have moved or gone. THE COMMENT IS NOT WRONG;
 *              the text under it moved. Nothing is repaired and nothing is silently re-anchored.
 * `gone`     — what it points at is not there any more, or has been deleted.
 * `unknown`  — MOLE OFFICE CANNOT SAY EITHER WAY, and says which of two reasons.
 *
 * THE FOURTH WORD IS NOT A FOURTH KIND OF ABSENCE. The first three are all claims about the thing;
 * `unknown` is the absence of an ANSWER, and USER.md's fifth invariant is that "nothing is there"
 * and "nobody has looked" may never draw the same. Two things reach it, and `says` names which:
 *
 *   · MOLE OFFICE CANNOT LOOK THIS KIND OF THING UP YET — `resolveTarget` has no reader for it. This one
 *     cannot be reached by writing a comment, because `checkTarget` refuses a kind nothing resolves,
 *     so it appears only on a row written before a reader existed, or by hand.
 *   · THE COMMENT RECORDED NO EVIDENCE ABOUT A TARGET IDENTIFIED BY A POSITION — a row or a cell of
 *     a table, pointed at with nothing quoted. The row is there; whether it is the row somebody
 *     pointed at is a question nothing stored an answer to.
 *
 * Both are one fact: Mole Office has not measured this, so it will not report a state as though it had.
 */
export interface ContextReading {
  state: 'there' | 'changed' | 'gone' | 'unknown'
  /** What it points at, as a sentence a person can read: `the report Round six, LKJQbOhAK3kz`. */
  about: string
  /** How it stands now, in one sentence. */
  says: string
  /** Only when the comment quoted some words. */
  quote?: {
    /** The words stored with the comment, exactly as they were quoted. */
    words: string
    /** Whether those words are still somewhere in the text. */
    stillThere: boolean
    /**
     * Where they start now, or null.
     *
     * NULL MEANS MOLE OFFICE WILL NOT NAME A PLACE, and there are two reasons: the words are nowhere, and
     * the words are in SEVERAL places with nothing saying which one this comment was about. `says`
     * tells them apart, and `stillThere` is the shorter answer to the same question.
     */
    at: number | null
    /** Which part of the object they were found in, or null on the same two readings as `at`. */
    field: string | null
    /** Whether Mole Office was told which field to look in, or looked through all of them. */
    lookedEverywhere: boolean
  }
  /**
   * WHICH REVISION THIS WAS WRITTEN AGAINST, AND WHAT THAT REVISION HELD THERE. Null when the
   * comment named none, which is the ordinary case for anything written before round eight.
   *
   * It is what makes `changed` an honest sentence rather than a guess: a reader is told the words
   * moved AND can see the text they were sitting in when somebody wrote about them.
   */
  writtenAgainst?: WrittenAgainst
}

// ============================================================================ what comes back

export interface AgentThreadView {
  id: string
  workspaceId: string
  title: string
  mode: ThreadMode
  state: ThreadState
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface AgentMessageView {
  id: string
  threadId: string
  position: number
  role: MessageRole
  intent: MessageIntent
  body: string
  context: MessageContext | null
  /** Whether what this points at is still there. Computed on every read, never stored. */
  reading: ContextReading | null
  state: MessageState
  recipient: RecipientView | null
  /**
   * Whether this can be sent as it stands, and where it would go. Computed on every read.
   *
   * IT IS ON EVERY MESSAGE, including one nobody has addressed and one an agent wrote, so a screen
   * never has to work out from a null recipient what Mole Office would do with it.
   */
  delivery: DeliveryReading
  /**
   * The run that produced this, or null because a person wrote it.
   *
   * It is how a reader tells an agent's answer from a person's comment without guessing from
   * `role`, and it is what a reply to that answer can be read against.
   */
  runId: string | null
  /**
   * The comment this message carried, or null because nobody wrote it as one.
   *
   * Sending a review writes each comment into the review's conversation as a message, and this says
   * which comment those words came from — so a reader gets back to the record the person wrote, and
   * a second Send can tell that a comment is already in the conversation rather than writing its
   * words in again.
   */
  fromAnnotationId: string | null
  /**
   * EVERY COMMENT THIS MESSAGE CARRIES, in the order they were written.
   *
   * A sent review writes one message for each recipient, and a message for a recipient given two or
   * more comments carries all of them. This is that list, read by `carriedComments` in
   * lib/dispatch.ts. It is `[fromAnnotationId]` on a message carrying one comment, and empty on a
   * message nobody wrote from a comment.
   */
  carries: string[]
  /**
   * WHAT THIS MESSAGE QUOTES ABOVE ITS WORDS, in order: one quote for each comment it carries, or
   * its own context. The same shape a message record's quotes have, which is
   * `MessageOnTheWire.quotes`; a screen that draws quotes reads one shape.
   * Built by `quotesOfARow`
   * and nowhere else.
   */
  quotes: MessageOnTheWire['quotes']
  quotePositions: null
  createdAt: string
  createdBy: string
}

/**
 * WHETHER A COMMENT CAN BE SENT, AND WHERE IT WOULD GO.
 *
 * ONE ANSWER TO THAT QUESTION IN THIS PRODUCT. The screen shows `says` beside the comment, the
 * reply to a write carries it, and dispatch acts on `canSend` — so the sentence a person read
 * before pressing Send is the sentence dispatch obeyed. Two answers to it is the defect this
 * repository names as its own, and this is the question where being wrong means either losing
 * somebody's words or quietly starting an agent that has never heard of the work.
 *
 * IT IS COMPUTED ON EVERY READ AND NEVER STORED, because it is a fact about the world now: the run
 * this comment names can be deleted, and its transcript can be taken off this machine, between
 * writing the comment and finishing the review.
 */
export interface DeliveryReading {
  /** A retired recipient can be replaced only by the new-agent press. */
  retired?: true
  /** Whether dispatch would send this comment as it stands. */
  canSend: boolean
  /** Where it would go, or why it cannot go, in one sentence a person can act on. */
  says: string
  /**
   * The same sentence as a code, for the review panel to say in the page's language (src/shared/send-plan-words.ts).
   * The office always sends it; a reading built by hand, as a test builds one, may leave it out, and is then drawn as `says`.
   */
  sentence?: SendPlanSentence
  /**
   * WHO IT WOULD GO TO, when it can go: the key dispatch groups by, and a name a person can read.
   * Two comments with the same key go to the same recipient in one run, and a sent review puts them
   * in one message. Absent when it cannot go.
   */
  goesTo?: { key: string; name: string }
}

/**
 * THE ONE KEY FOR "THE SAME RECIPIENT". `dispatchThread` makes one run for each key, and a sent
 * review writes one message for each key, so both group by this and cannot disagree.
 */
function recipientKeyOf(delivery: Extract<Delivery, { canSend: true }>): { key: string; name: string } {
  if (delivery.kind === 'new') return { key: 'new', name: sayANewAgent() }
  if (delivery.kind === 'agent') return { key: `agent:${delivery.agentId}`, name: delivery.sessionTitle }
  return { key: `session:${delivery.sessionId}`, name: delivery.sessionTitle }
}

/**
 * Who a message is for, in the three layers the eighth rule asks for.
 *
 * `said` is the words somebody typed, kept exactly. `why` is the sentence saying how this
 * recipient was arrived at, shown beside the choice and never instead of it. `kind` is what was
 * settled — and `unresolved` is a real answer that stops a dispatch rather than being sent
 * somewhere.
 */
export interface RecipientView {
  kind: RecipientKind
  /**
   * THE RUN this is for, and null for every other kind — including `agent`.
   *
   * It carried a durable agent's id too until 25 August 2026, because one column holds whichever of
   * the two was chosen and this served that column under one name. So GET /api/agent/threads/:id
   * answered `{"kind": "agent", "sessionId": "3QefASxOOpaw"}` about a record that is not a session
   * at all — and the whole point of the wave that added `agent` is that an agent is not a run.
   * Nothing misread it inside this repository; it was a name that would mislead the next reader.
   */
  sessionId: string | null
  /**
   * THE DURABLE AGENT this is for, and null for every other kind.
   *
   * IT IS NOT A SECOND COPY OF `sessionId`. Exactly one of the two is ever filled, and `kind` says
   * which — the stored column is one column, and this is that one column served under the name that
   * is true of what it holds. A message is written with `recipient.agentId` for a durable agent, so
   * what goes in under that name now comes back under it.
   */
  agentId: string | null
  said: string | null
  why: string | null
}

export interface AgentRunView {
  id: string
  threadId: string
  /** Which project this run's thread is about. Read from the thread; no run stores its own. */
  workspaceId: string
  /** What the thread is called, so a list of runs is readable without a second request. */
  threadTitle: string
  runtime: string
  state: RunState
  recipientSessionId: string | null
  /** What a worker needs to pick the agent up again, or null for a deliberately new agent. */
  resume: { externalId: string } | null
  /** The worker's session id, or a label from a worker that did not record its session. */
  claimedBy: string | null
  claimedAt: string | null
  /**
   * WHICH MACHINE TOOK IT, or null because nobody has claimed it or nobody could tell.
   *
   * Criterion P23: *the run's row names the machine, and the conversation says which machine
   * answered.* Once a worker on another machine may claim a run — criterion P21 — `claimedBy` and
   * this are two different questions, and a conversation that could only answer the first would
   * leave a person unable to say where their work went.
   */
  claimedFromMachine: string | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  error: string | null
  result: unknown
  /** Where a result asked Mole Office to look, and whether that thing is really there. Null when none. */
  focus: FocusReading | null
  /** Where this run stands, in one sentence. Never a spinner and never a guess. */
  says: string
}

/**
 * An agent may ask Mole Office to show the person something. This is the whole of that, and it is one
 * shape rather than a framework.
 *
 * `asked` is what the agent said, kept exactly. `resolves` is whether the thing it names is really
 * there. **A focus naming a record nobody has is reported as such and never stored as a working
 * link** — Mole Office performs the navigation, so a link that goes nowhere would be Mole Office's mistake
 * to make and not the agent's.
 */
export interface FocusReading {
  asked: unknown
  resolves: boolean
  says: string
}

export interface ThreadDetail {
  thread: AgentThreadView
  messages: AgentMessageView[]
  runs: AgentRunView[]
  /** Where the conversation stands, in one sentence. */
  says: string
}

// ============================================================================ rows to views

type ThreadRow = typeof agentThreads.$inferSelect
type MessageRow = typeof agentMessages.$inferSelect
type RunRow = typeof agentRuns.$inferSelect

function toThread(row: ThreadRow): AgentThreadView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    mode: row.mode as ThreadMode,
    state: row.state as ThreadState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  }
}

/**
 * The stored context of a message, or null.
 *
 * A column that cannot be read is reported as a fault rather than as "no context": the difference
 * between *this comment pointed at nothing* and *this comment pointed at something Mole Office can no
 * longer read* is the whole subject of this file.
 */
function contextOf(row: MessageRow): MessageContext | null {
  if (row.context === null) return null
  try {
    return JSON.parse(row.context) as MessageContext
  } catch {
    throw new PanelError(
      `Message ${row.id} stores a context that is not readable JSON, so Mole Office cannot say what it was about. ` +
        `Nothing has been guessed. The stored text starts: ${row.context.slice(0, 120)}`,
      500,
    )
  }
}

/**
 * Who a message is for, as a reader gets it.
 *
 * ONE COLUMN, TWO NAMES, AND `kind` SAYS WHICH. `recipient_session_id` holds whichever of the two
 * ids somebody chose — see `recipientColumns`, which writes it — so this hands it back under the
 * name that is true of it rather than under the column's name. The column keeps its spelling; a
 * rename there is a migration and this wave has none.
 */
function recipientOf(row: MessageRow): RecipientView | null {
  if (row.recipientKind === null) return null
  const kind = row.recipientKind as RecipientKind
  const chosen = row.recipientSessionId
  return {
    kind,
    sessionId: kind === 'agent' ? null : chosen,
    agentId: kind === 'agent' ? chosen : null,
    said: row.recipientSaid,
    why: row.recipientWhy,
  }
}

/**
 * THE PROJECT IS A PARAMETER because a message row does not carry one — its thread does — and the
 * delivery reading needs it: a comment addressed to a run in another project is stored and cannot
 * be sent. Every caller already knows which project it is working in.
 */
/**
 * WHAT ONE MESSAGE ROW QUOTES ABOVE ITS WORDS, in order.
 *
 * A message carrying several comments of a sent review quotes each of them, numbered in the order
 * they were written; every other message quotes its own context, or nothing. Read from the stored
 * list by `carriedComments`, so the numbers here and the numbers in the words are the same.
 */
export function quotesOfARow(row: MessageRow): MessageContext[] {
  if (row.carries !== null) {
    return carriedComments(row).map((one) => one.quote).filter((one): one is MessageContext => one !== null)
  }
  const context = contextOf(row)
  return context === null ? [] : [context]
}

function toMessage(row: MessageRow, withReading: boolean, workspaceId: string): AgentMessageView {
  const context = contextOf(row)
  const delivery = deliveryOf(row, workspaceId)
  return {
    id: row.id,
    threadId: row.threadId,
    position: row.position,
    role: row.role as MessageRole,
    intent: row.intent as MessageIntent,
    body: row.body,
    context,
    reading: context === null || !withReading ? null : readContext(context),
    state: row.state as MessageState,
    recipient: recipientOf(row),
    delivery: { canSend: delivery.canSend, says: delivery.says, sentence: delivery.sentence },
    runId: row.runId,
    fromAnnotationId: row.fromAnnotationId,
    carries: carriedComments(row).map((one) => one.commentId),
    quotes: quotesOfARow(row),
    quotePositions: null,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  }
}

// ============================================================================ where a comment goes

/**
 * Where a comment would go, or why it cannot go anywhere, read from what is stored on it.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS THE ONLY PLACE THAT DECIDES
 * ---------------------------------------------------------------------------------------
 *
 * It replaced two functions that both answered it: a `checkRecipient` that REFUSED A WRITE, so a
 * person's words were thrown away to tell them the address was wrong, and a `resumeFor` that
 * refused a dispatch. They agreed on some cases and not on others — a comment addressed to a
 * fixture row was refused at write time and would have been refused again at dispatch, and a
 * comment addressed to a record in another project was refused at write time with a 404 out of the
 * record layer, in words about records rather than about who a comment is for.
 *
 * So there is one function, it REFUSES NOTHING, and everything that wants the answer reads it:
 * the message view a screen draws, the reply to the write, and dispatch.
 *
 * ---------------------------------------------------------------------------------------
 * A SENDABLE ANSWER CARRIES WHAT THE RUN NEEDS
 * ---------------------------------------------------------------------------------------
 *
 * `runtime` and `externalId` are what a worker needs to pick an agent up again, and they are read
 * through `pickUpOf` in lib/recipients.ts — the one place this product decides whether a run can be
 * picked up again, and the same reading the recipient list showed the person before they pressed
 * Send. Measured on 17 August 2026, before that reading was shared: the picker said a run's
 * transcript was gone and dispatch sent to it anyway, so the refusal a person read before pressing
 * Send was advice rather than a rule.
 */
type Delivery =
  | {
      canSend: true
      kind: 'session'
      sessionId: string
      sessionTitle: string
      runtime: string
      externalId: string
      says: string
      /** What `says` says, as a code the review panel says in its own language (src/shared/send-plan-words.ts). */
      sentence: SendPlanSentence
      /**
       * THE DURABLE IDENTITY THIS RUN WORKS AS, or null on a run addressed before doors minted one.
       *
       * It was `agentId?: undefined` — a run had no durable identity, so the run row `dispatchThread`
       * writes carried `agent_id` NULL and the migration had to bind it later. A run addressed today
       * gets its identity at the moment it is addressed, so the value is here to be written.
       */
      agentId: string | null
    }
  | {
      // A DURABLE IDENTITY. `agentId` is what gets written onto the message, and it is the only one
      // of the four kinds that leaves anything behind when the process that served it has ended.
      canSend: true
      kind: 'agent'
      agentId: string
      sessionId: null
      sessionTitle: string
      runtime: string
      externalId: null
      says: string
      /** What `says` says, as a code the review panel says in its own language (src/shared/send-plan-words.ts). */
      sentence: SendPlanSentence
    }
  | {
      canSend: true
      kind: 'new'
      sessionId: null
      sessionTitle: null
      runtime: string
      externalId: null
      says: string
      /** What `says` says, as a code the review panel says in its own language (src/shared/send-plan-words.ts). */
      sentence: SendPlanSentence
      agentId?: undefined
    }
  | { canSend: false; says: string; sentence: SendPlanSentence; retired?: true }

/**
 * Which runtime serves this agent, or the default when nothing has said.
 *
 * IT READS THE AGENT RECORD AND NOT THE REGISTRY ROW. The row's `runtime` column is dead since
 * a decision, which chose option A of proposal nfETNdLvpE5P, made the record the one
 * store. `data.runtime` is that store, and
 * `runtimeOfTheAgentRecord` in lib/participants.ts is the one reader of it for the registry. This
 * one answers the different question a dispatch asks — the default when the record names none —
 * so it keeps its own default and reads the same stored field.
 */
function runtimeOfAgent(record: { data: unknown }): string {
  const data = record.data
  if (typeof data !== 'object' || data === null) return DEFAULT_RUNTIME
  const runtime = (data as Record<string, unknown>)['runtime']
  return typeof runtime === 'string' && runtime !== '' ? runtime : DEFAULT_RUNTIME
}

/** The four stored columns that say who a message is for. */
interface StoredRecipient {
  recipientKind: string | null
  recipientSessionId: string | null
  recipientSaid: string | null
  recipientWhy: string | null
  /** The run that produced this message, when one did. An answer is not addressed to anybody. */
  runId?: string | null
}

/** A sentence of the send plan, and its English, from the one composer of both (src/shared/send-plan-words.ts). */
function said(sentence: SendPlanSentence): { says: string; sentence: SendPlanSentence } {
  return { says: sayTheLine(sentence), sentence }
}

function cannotReachARecipient(name: string): { says: string; sentence: SendPlanSentence } {
  return said({ key: 'cannotReach', values: { who: name } })
}

function deliveryOf(row: StoredRecipient, workspaceId: string): Delivery {
  if (row.runId !== undefined && row.runId !== null) {
    return {
      canSend: false,
      ...said({ key: 'anAnswer', values: { runId: row.runId } }),
    }
  }

  const kind = row.recipientKind as RecipientKind | null

  if (kind === null) {
    return { canSend: false, ...said({ key: 'nobodyChosen' }) }
  }

  if (kind === 'unresolved') {
    const typed = row.recipientSaid ?? ''
    if (typed === '') {
      // NOBODY TYPED ANY WORDS, AND SOMETHING MAY STILL BE KNOWN. `why` is what Mole Office made of who
      // this is for, and a comment written through the API whose recipient could not be read as a
      // recipient at all has one: it holds what was sent. Saying "nothing here to resolve" over the
      // top of that would throw away the one piece of evidence there is.
      if (row.recipientWhy !== null && row.recipientWhy.trim() !== '') {
        return {
          canSend: false,
          ...said({ key: 'unresolvedWhy', values: { why: row.recipientWhy } }),
        }
      }
      return {
        canSend: false,
        ...said({ key: 'unresolvedNothingKept' }),
      }
    }
    return {
      canSend: false,
      ...said(
        row.recipientWhy === null
          ? { key: 'unresolvedSaid', values: { said: typed } }
          : { key: 'unresolvedSaidWhy', values: { said: typed, why: row.recipientWhy } },
      ),
    }
  }

  if (kind === 'agent') {
    // A DURABLE IDENTITY, AND THE ONE ANSWER THAT SURVIVES THE PROCESS. It does not ask `pickUpOf`
    // anything: whether a transcript is on this machine has nothing to do with whether a comment
    // can be recorded and put in an inbox. That question belongs to opening a RUN, which is a
    // separate act.
    const agentId = row.recipientSessionId
    if (agentId === null || agentId === '') {
      return { canSend: false, ...said({ key: 'agentNotSaid' }) }
    }
    const record = getRecord(agentId)
    if (record === null || record.deletedAt !== null) {
      return { canSend: false, ...said({ key: 'agentGone', values: { id: agentId } }) }
    }
    if (record.workspaceId !== workspaceId) {
      return {
        canSend: false,
        ...said({ key: 'agentInAnotherProject', values: { title: record.title, where: getWorkspace(record.workspaceId)?.title ?? record.workspaceId, here: workspaceId } }),
      }
    }
    if (record.kind !== 'agent') {
      return {
        canSend: false,
        ...said({ key: 'agentNotAnAgent', kind: record.kind, values: { id: agentId, quoted: quotedUnlessAMessage(record, ' — ', ' —') } }),
      }
    }
    const registered = agentForRecord(agentId)
    if (registered?.retired || record.data['state'] === 'retired') {
      return { canSend: false, retired: true, ...cannotReachARecipient(registered?.name ?? record.title) }
    }
    return {
      canSend: true,
      kind: 'agent',
      agentId,
      sessionId: null,
      sessionTitle: record.title,
      runtime: runtimeOfAgent(record),
      externalId: null,
      ...said({ key: 'goesToAgent', values: { title: record.title } }),
    }
  }

  if (kind === 'new') {
    return {
      canSend: true,
      kind: 'new',
      sessionId: null,
      sessionTitle: null,
      runtime: DEFAULT_RUNTIME,
      externalId: null,
      ...said({ key: 'goesToNew' }),
    }
  }

  const sessionId = row.recipientSessionId
  if (sessionId === null || sessionId === '') {
    return { canSend: false, ...said({ key: 'runNotSaid' }) }
  }

  const record = getRecord(sessionId)
  if (record === null || record.deletedAt !== null) {
    return { canSend: false, ...said({ key: 'runGone', values: { id: sessionId } }) }
  }
  // A COMMENT MAY NAME A RUN IN ANOTHER PROJECT, AND IT IS STORED, because the words on it are worth
  // keeping either way. It cannot be SENT: a run in another project answering a conversation about
  // this one would put work under a project nobody filed it in. The project is not on the message
  // row — its thread carries it — which is why it is a parameter here.
  if (record.workspaceId !== workspaceId) {
    return {
      canSend: false,
      ...said({ key: 'runInAnotherProject', values: { title: record.title, where: getWorkspace(record.workspaceId)?.title ?? record.workspaceId, here: workspaceId } }),
    }
  }
  if (record.kind !== 'session') {
    return {
      canSend: false,
      ...said({ key: 'runNotARun', kind: record.kind, values: { id: sessionId, quoted: quotedUnlessAMessage(record, ' — ', ' —') } }),
    }
  }

  const agentId = theAgentASessionAnswersAs(record, workspaceId)?.record ?? durableIdentityOfRun(record)
  const registered = agentId === null ? null : agentForRecord(agentId)
  if (registered?.retired) return { canSend: false, retired: true, ...cannotReachARecipient(registered.name) }
  const pick = pickUpOf(record)
  if (pick.answer !== 'yes') {
    return {
      canSend: false,
      ...said(withThePickUp({ key: 'runCannotBePickedUp', values: { title: record.title } }, pick)),
    }
  }

  return {
    canSend: true,
    kind: 'session',
    sessionId,
    sessionTitle: record.title,
    runtime: pick.runtime,
    externalId: pick.conversationId,
    // READ, NEVER MINTED HERE. Minting is what the door that stored the choice did; this is a
    // reading, and a reading that wrote would make sending a comment mint an agent. Null is the
    // honest answer for a choice stored before that door existed.
    agentId,
    ...said(withThePickUp({ key: 'goesToRun', values: { title: record.title } }, pick)),
  }
}

/** A line that quotes why a run can or cannot be picked up: by its code, or as `because` when it carries none. */
function withThePickUp(sentence: SendPlanSentence, pick: { because: string; reason?: PickUpReason }): SendPlanSentence {
  return pick.reason === undefined
    ? { ...sentence, values: { ...sentence.values, because: pick.because } }
    : { ...sentence, pickUp: pick.reason }
}


/** What a run's `result` column holds, or null. Unreadable JSON is a fault, not an absence. */
function resultOf(row: RunRow): unknown {
  if (row.result === null) return null
  try {
    return JSON.parse(row.result) as unknown
  } catch {
    throw new PanelError(
      `Run ${row.id} stores a result that is not readable JSON. Nothing has been guessed. It starts: ` +
        row.result.slice(0, 120),
      500,
    )
  }
}

/**
 * SENTENCES A TEST READS FROM HERE, so that no test copies words that can change (round 132). Each
 * is drawn below: on a run's line, on what a comment was about, or in the conversation's summary.
 */
export const WAITING_FOR_A_WORKER = 'Waiting for a worker.'
export const WHAT_REPLACED_THEM_IS_NOT_GUESSED = 'Mole Office does not guess what replaced them.'
export const WHICH_PART_IS_NOT_RECORDED = 'Which part they came from was not recorded.'
export const THE_ANSWER_IS_ON_THE_RUN = 'That answer is on the run, not in this conversation.'
export const THIS_PART_HAS_MOVED = 'This part of the report has moved.'
export function noLongerThere(about: string): string {
  return `No longer there: ${about}.`
}
export function runsSent(count: number): string {
  return `${String(count)} run${count === 1 ? '' : 's'} sent:`
}

const NO_REASON_RECORDED = 'No reason was recorded.'

/** Where a run stands, in words. `queued` says nobody has picked it up, which is a real answer. */
function saysOf(row: RunRow): string {
  const state = row.state as RunState
  if (state === 'queued') return WAITING_FOR_A_WORKER
  // WHERE A WORKER TOOK IT FROM, IN THE SENTENCE A PERSON READS. Criterion P23: *the conversation
  // says which machine answered.* It is said only where a machine was recorded, because "from an
  // unknown machine" on every run claimed before this column existed would be a sentence about
  // nothing. `at` reads the same for a name and for an address, and `machine` already carries which
  // of the two it is — src/server/lib/machines.ts is where that distinction is kept.
  const at = row.claimedFromMachine === null ? '' : ` at ${row.claimedFromMachine}`
  if (state === 'claimed') return `${row.claimedBy ?? 'A worker'}${at} has taken this and has not finished it.`
  if (state === 'running') return `${row.claimedBy ?? 'A worker'}${at} is running this now.`
  if (state === 'finished') {
    return (
      `Answered${row.endedAt === null ? '' : ` at ${row.endedAt}`}` +
      (row.claimedFromMachine === null ? '' : `, by ${row.claimedBy ?? 'a worker'} at ${row.claimedFromMachine}`) +
      '.'
    )
  }
  if (state === 'failed') return `Failed. ${row.error ?? NO_REASON_RECORDED}`
  if (state === 'crashed') return row.error ?? 'The worker stopped before it sent a result.'
  if (state === 'withdrawn') return row.error ?? `Withdrawn before a worker took it. ${NO_REASON_RECORDED}`
  return `A worker could not serve this. It is still waiting for one that can. ` + (row.error ?? NO_REASON_RECORDED)
}

/**
 * Whether a result's `focus` names something that is really there.
 *
 * Computed on every read and never stored, for the same reason `incomplete` is: a stored answer to
 * "does this link work" is only ever right by accident, and this one is a link Mole Office itself will
 * follow.
 */
function focusOf(result: unknown): FocusReading | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return null
  const asked = (result as Record<string, unknown>)['focus']
  if (asked === undefined || asked === null) return null
  if (typeof asked !== 'object' || Array.isArray(asked)) {
    return { asked, resolves: false, says: 'The result asked to show something Mole Office cannot show.' }
  }
  const focus = asked as Record<string, unknown>

  const recordId = focus['record']
  if (typeof recordId === 'string' && recordId !== '') {
    const record = getRecord(recordId)
    if (record === null || record.deletedAt !== null) {
      return {
        asked,
        resolves: false,
        says:
          `The result asked to open the record ${recordId}, and no record has that id` +
          `${record !== null ? ' any more: it was deleted' : ''}. Nothing is opened.`,
      }
    }
    return { asked, resolves: true, says: `Opens the record "${record.title}", ${recordId}.` }
  }

  const planId = focus['plan']
  if (typeof planId === 'string' && planId !== '') {
    const plan = getPlan(planId)
    if (plan === null) {
      return { asked, resolves: false, says: `The result asked to open the plan ${planId}, and no plan has that id.` }
    }
    const lineId = focus['line']
    if (typeof lineId === 'string' && lineId !== '') {
      const line = linesOf(planId).find((l) => l.id === lineId) ?? null
      if (line === null) {
        return {
          asked,
          resolves: false,
          says: `The result asked to open line ${lineId} of the plan "${plan.title}", which has no such line.`,
        }
      }
      return { asked, resolves: true, says: `Opens the plan "${plan.title}" at the line "${line.text.slice(0, 60)}".` }
    }
    return { asked, resolves: true, says: `Opens the plan "${plan.title}".` }
  }

  return {
    asked,
    resolves: false,
    says: 'The result asked to show something that is not a record or a plan. Mole Office opens only those two.',
  }
}

function toRun(row: RunRow, thread: Pick<ThreadRow, 'workspaceId' | 'title'>): AgentRunView {
  const result = resultOf(row)
  return {
    id: row.id,
    threadId: row.threadId,
    workspaceId: thread.workspaceId,
    threadTitle: thread.title,
    runtime: row.runtime,
    state: row.state as RunState,
    recipientSessionId: row.recipientSessionId,
    resume: row.resumeExternalId === null ? null : { externalId: row.resumeExternalId },
    claimedBy: row.claimedBy,
    claimedAt: row.claimedAt,
    claimedFromMachine: row.claimedFromMachine,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    error: row.error,
    result,
    focus: focusOf(result),
    says: saysOf(row),
  }
}

// ============================================================================ reading a context

/**
 * HOW FAR A REGION MOVED, or null when nobody can say.
 *
 * A DISTANCE IS ONLY REPORTED WHEN SOMETHING MEASURED IT. The obvious answer — subtract the offset
 * the comment named from the start of the region covering it now — is a real distance when the
 * paragraph shifted by a few characters and MEANS NOTHING when the paragraph was deleted and its
 * neighbour grew over the offset. The two are not the same paragraph and subtracting their starts
 * measures nothing. Nothing in the offsets alone tells those cases apart, so answering both with a
 * number is a plausible default in the place of "nobody can say", which is the fifth invariant.
 *
 * So the stored characters are the evidence. If the words the comment quoted are found again inside
 * the region that now covers the place, the distance between where they were and where they are is
 * a measurement. If they are not, this answers null, and the sentence above leaves the distance out
 * rather than printing a zero.
 */
function movedBy(found: Extract<TargetResolution, { answer: 'changed' }>, named: NamedSpan | null): number | null {
  if (named === null || found.what.range === null) return null
  const quote = wordsInNamedSpan(named)
  for (const held of found.text.strings) {
    const at = held.text.indexOf(quote)
    if (at !== -1) return found.what.range.from + at - named.from
  }
  return null
}

/**
 * Given a stored context: is what it points at still there, and does the quote still appear?
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE REPAIRS ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * No offset is moved, no comment is put onto different words, and a near match is never reported as
 * the same words. When the text has changed, SAYING SO IS THE ANSWER — the comment still says what
 * it was about, which is why the quote is stored beside it.
 *
 * WHAT IS NEW IN ROUND EIGHT is the last part of that sentence. A comment may name the revision it
 * was written against, and then `changed` can say WHICH revision and WHAT THAT REVISION HELD THERE,
 * instead of leaving a reader with "these words are gone" and nowhere to look.
 */
export function readContext(context: MessageContext): ContextReading {
  const found = resolveTarget(context.target)
  const writtenAgainst = readWrittenAgainst(context)
  // THE WORDS THIS COMMENT NAMES, ASKED FOR ONCE. A context carries a `place` and the span is
  // worked out from it; older rows carry a bare `span`. Reading the field instead of asking would
  // answer "still there" about every comment written since the place landed, whatever happened to
  // the words — which is this reading telling somebody the opposite of what it measured.
  const named = spanNamedBy(context)
  const quote = named === null ? null : wordsInNamedSpan(named)
  const withRevision = <T extends ContextReading>(reading: T): T =>
    writtenAgainst === null ? reading : { ...reading, writtenAgainst }

  // ---- MOLE OFFICE CANNOT LOOK THIS KIND OF THING UP. Not an absence: the absence of a look.
  if (found.answer === 'unknown') {
    return withRevision({
      state: 'unknown',
      about: found.about,
      says:
        `Not known whether this is still there. ${found.why}` +
        (named === null ? '' : ` Quoted on the comment: "${shownQuote(named.quote)}".`),
      ...(named === null
        ? {}
        : {
            quote: {
              words: named.quote,
              stillThere: false,
              at: null,
              field: null,
              lookedEverywhere: named.field === undefined,
            },
          }),
    })
  }

  // ---- IT IS NOT THERE.
  if (found.answer === 'gone') {
    return withRevision({
      state: 'gone',
      about: found.about,
      says:
        noLongerThere(found.about) +
        (named === null ? '' : ` Quoted on the comment: "${shownQuote(named.quote)}".`),
      ...(named === null
        ? {}
        : {
            quote: {
              words: named.quote,
              stillThere: false,
              at: null,
              field: null,
              lookedEverywhere: named.field === undefined,
            },
          }),
    })
  }

  // ---- IT IS THERE AND IT IS NOT WHERE IT WAS.
  //
  // CALLER THREE OF THREE. Only a region answers this. A region deeper than a block is named by
  // where its characters start, so one character inserted above it means no region starts at the
  // named offset any more. `gone` would be false and `there` would be a lie, so this is its own
  // sentence: the part that covers that place now, named, and the distance it moved WHEN SOMETHING
  // MEASURED THE DISTANCE.
  if (found.answer === 'changed') {
    const moved = movedBy(found, named)
    return withRevision({
      state: 'changed',
      about: found.text.about,
      says:
        `${THIS_PART_HAS_MOVED} That place now holds ${found.text.about}` +
        (moved === null ? '. ' : `, ${String(Math.abs(moved))} character${Math.abs(moved) === 1 ? '' : 's'} ` +
          `${moved < 0 ? 'earlier' : 'later'}. `) +
        (named === null
          ? 'Nothing was quoted, so the words cannot be compared.'
          : `Quoted on the comment: "${shownQuote(named.quote)}".`),
      ...(named === null
        ? {}
        : {
            quote: {
              words: named.quote,
              stillThere: found.text.strings.some((s) => s.text.includes(quote!)),
              at: null,
              field: null,
              lookedEverywhere: named.field === undefined,
            },
          }),
    })
  }

  // ---- IT IS THERE, AND NOTHING WAS QUOTED.
  //
  // WHAT IDENTIFIES IT: A NAME OF ITS OWN, OR WHERE IT SITS. A block of a report carries its own id,
  // so "still there" is a true sentence about one. A row of a table carries a NUMBER — a stored row
  // has no id — so row 2 resolving says only that the table still has a second row. Add a row above
  // and row 2 is a different row, holding something the comment was never about.
  //
  // A COMMENT WITH NO QUOTE ON ONE OF THOSE RECORDED NOTHING TO COMPARE WITH, so Mole Office cannot say
  // either way and says that. It used to answer "Still there" for ever, which is a position being
  // reported as an identity — and src/shared/targets.ts promises the opposite on the `rowKey`
  // identifier in so many words. A text anchor carries its quote for exactly this reason.
  //
  // WHICH KINDS THOSE ARE IS READ OFF THE DECLARATION, where `isPosition` already says which values
  // are positions. A list of kinds kept here would be the same fact in two places, and the copy that
  // went one kind short would be the one drawing the sentence.
  //
  // AND IT IS ASKED OF ONE REGION ID AS WELL AS OF THE KIND, because a row of a table is now STORED
  // as the region it is: `theRegionItNames` in lib/targets.ts spells it that way so that a stored
  // context cannot stop the server coming up. Every region shares one declaration, so the question
  // has to be askable of the id — `namesOneEntryByItsPosition` in src/shared/regions.ts answers it
  // off the id parser's own steps, and its note says why it is not `stabilityOf`.
  const span = named
  if (span === null) {
    const spec = targetSpec(context.target.kind)
    const byWhereItSits =
      spec.identifies.some((field) => field.isPosition === true) ||
      (context.target.kind === 'region' && namesOneEntryByItsPosition(context.target.regionId))
    if (byWhereItSits) {
      return withRevision({
        state: 'unknown',
        about: found.text.about,
        says:
          `Not known whether this is still the same thing. ${found.text.about} is named by its place, not an id, ` +
          `and nothing was quoted to compare. Point at a single cell and Mole Office can answer.`,
      })
    }
    return withRevision({ state: 'there', about: found.text.about, says: `Still there: ${found.text.about}.` })
  }
  const spanQuote = wordsInNamedSpan(span)

  // ---- IT IS THERE AND SOME WORDS WERE QUOTED.
  //
  // THE STORED OFFSET IS EVIDENCE AND IT IS ASKED FIRST. It is still never repaired and never
  // followed. What it does is tell two identical phrases apart, and nothing else can: the words are
  // the same words. This used to look for the FIRST place the quote appears and compare that with
  // the offset, which answered both directions wrongly at once — a comment written on the second of
  // two identical sentences came back `changed` seconds after it was written, in the alarm colour,
  // and a comment whose own copy had been DELETED came back saying the words were still there and
  // that it still pointed at them, naming the surviving copy. Measured 18 August 2026.
  const lookedEverywhere = span.field === undefined
  const looking = lookedEverywhere ? found.text.strings : found.text.strings.filter((s) => s.field === span.field)

  // THE COMMENT CAN NAME A PART THAT IS NOT THERE, AND THAT IS NOT THE TEXT HAVING CHANGED. `field`
  // is whatever the writer put on the comment, and "body" is the natural guess for a record whose
  // stored string is "data.body". A name matching nothing left this list empty, and the empty list
  // fell through to the arm below whose sentence is "The text has changed. These words are no
  // longer in …" — drawn in the alarm colour, about words nobody had looked for. Mole Office did not
  // look, so it says that. Measured 19 August 2026.
  if (!lookedEverywhere && looking.length === 0) {
    const held = found.text.strings.map((s) => s.field)
    const shownHeld = held.slice(0, 6).join(', ')
    return withRevision({
      state: 'unknown',
      about: found.text.about,
      says:
        `Mole Office cannot say whether these words are still there. The comment says they came from "${span.field}" ` +
        `of ${found.text.about}, and there is no such part of it, so nothing was looked at. ` +
        (held.length === 0
          ? 'Nothing on it holds words.'
          : `What it holds is: ${shownHeld}${held.length > 6 ? `, and ${String(held.length - 6)} more` : ''}.`) +
        ` The words on the comment are "${shownQuote(span.quote)}".`,
    })
  }

  const said = lookedEverywhere ? null : (looking.find((s) => s.field === span.field) ?? null)
  if (said !== null && said.text.slice(span.from, span.from + spanQuote.length) === spanQuote) {
    return withRevision({
      state: 'there',
      about: found.text.about,
      says: `Still there, in the same place: "${shownQuote(span.quote)}" in ${found.text.about}.`,
      quote: { words: span.quote, stillThere: true, at: span.from, field: said.field, lookedEverywhere },
    })
  }

  // EVERY PLACE THE WORDS APPEAR, and not the first one. Which of several a comment was about is
  // exactly what Mole Office does not know once they are no longer where it said they were, and picking
  // one is the silent re-attachment this whole shape exists to prevent.
  const places = looking.flatMap((s) => occurrencesOf(s.text, spanQuote).map((at) => ({ field: s.field, at })))
  const first = places[0] ?? null
  const alone = places.length === 1 && first !== null

  if (first === null) {
    return withRevision({
      state: 'changed',
      about: found.text.about,
      says:
        `These words are no longer in ${found.text.about}: "${shownQuote(span.quote)}". ` +
        WHAT_REPLACED_THEM_IS_NOT_GUESSED +
        (writtenAgainst === null ? '' : ` ${writtenAgainst.says}`),
      quote: { words: span.quote, stillThere: false, at: null, field: null, lookedEverywhere },
    })
  }

  // WHERE THE WORDS WERE IS ONLY KNOWN IF SOMETHING RECORDED IT. A comment written without a field
  // never said which part of the object it came from, so Mole Office cannot say the text has changed
  // around it — it never knew where "around it" was. Saying so anyway printed sentences like "now
  // at character 12 of summary, not 12", which is a claim about somebody's text that nothing
  // measured. Measured 18 August 2026, and it fired on every fieldless quote.
  if (lookedEverywhere) {
    return withRevision({
      state: 'there',
      about: found.text.about,
      says:
        `Still there: "${shownQuote(span.quote)}" in ${found.text.about}. ${WHICH_PART_IS_NOT_RECORDED}` +
        (alone
          ? ''
          : ` They are in ${String(places.length)} places in it, so Mole Office cannot say which of them this was about.`),
      quote: {
        words: span.quote,
        stillThere: true,
        at: alone ? first.at : null,
        field: alone ? first.field : null,
        lookedEverywhere,
      },
    })
  }

  // THE WORDS ARE IN THE FIELD THE COMMENT NAMED, AND NOT WHERE IT SAID THEY WERE. Both readings of
  // that are possible from what is stored — the text moved, or these are different words that read
  // the same — and Mole Office cannot tell them apart, so it says both and moves nothing.
  return withRevision({
    state: 'changed',
    about: found.text.about,
    says:
      `The text has changed around it. These words are not at character ${String(span.from)} of ` +
      `${String(span.field)} any more, where this comment said they were. ` +
      (alone
        ? `The same words are at character ${String(first.at)}. `
        : `The same words are at ${String(places.length)} places in it: ${countedOff(places.map((p) => p.at))}. `) +
      `Mole Office cannot tell whether those are the words this was written on, so it has moved nothing.` +
      (writtenAgainst === null ? '' : ` ${writtenAgainst.says}`),
    quote: {
      words: span.quote,
      stillThere: true,
      at: alone ? first.at : null,
      field: alone ? first.field : null,
      lookedEverywhere,
    },
  })
}

/**
 * Every place one run of words appears in one stored string, counted in characters from 0.
 *
 * OVERLAPPING PLACES COUNT SEPARATELY, because the question is where the quoted words could be and
 * not how many times they were typed. An empty quote has no places, and the arm above answers it
 * before this is reached: an empty slice matches wherever the offset says, which is the same answer
 * the offset gives for any other quote.
 */
function occurrencesOf(text: string, quote: string): number[] {
  if (quote === '') return []
  const at: number[] = []
  for (let from = text.indexOf(quote); from !== -1; from = text.indexOf(quote, from + 1)) at.push(from)
  return at
}

/**
 * A list of character positions, as a sentence, with a limit on how long it gets.
 *
 * A COUNT IS THE ANSWER AND THE LIST IS THE DETAIL. Three words quoted out of a long paragraph can
 * appear a hundred times in it, and a hundred numbers in a row is not a sentence anybody reads. The
 * count is always exact and always first, in the sentence that calls this.
 */
const SHOWN_PLACES = 6

function countedOff(places: readonly number[]): string {
  const shown = places.slice(0, SHOWN_PLACES).map((at) => String(at))
  const rest = places.length - shown.length
  return rest === 0 ? shown.join(', ') : `${shown.join(', ')} and ${String(rest)} more`
}

/** How much of a quote a sentence carries. One number, so every sentence here cuts at the same place. */
function shownQuote(quote: string): string {
  return quote.slice(0, 80)
}

// ============================================================================ threads

/** The thread with this id in this project, or a refusal saying where it really is. */
/**
 * ONE CONVERSATION, IN THIS PROJECT, FOR THIS READER, or a refusal.
 *
 * `reader` is who is asking, when a door knows it. A conversation it may not read
 * (`theThreadsThisReaderMayRead`) is refused with `notHere`, the refusal an id naming nothing gets, before
 * anything about it is read or written, in any project. So the refusal does not say it is there, and the
 * other-project refusal below, which quotes its title, is never given to such a reader.
 */
function threadInWorkspace(
  id: string,
  workspaceId: string,
  reader?: AMessageReader,
  notHere: () => PanelError = () => new PanelError(`No agent thread with id ${id}`, 404),
): ThreadRow {
  const row = db.select().from(agentThreads).where(eq(agentThreads.id, id)).get()
  if (row === undefined) throw notHere()
  if (reader !== undefined && !theThreadsThisReaderMayRead(reader, [row]).has(row.id)) throw notHere()
  if (row.workspaceId !== workspaceId) {
    throw new PanelError(
      `No agent thread with id ${id} in the workspace "${workspaceId}". That id names "${row.title}", which is ` +
        `about "${row.workspaceId}" — a different project. Send x-mole-office-workspace: ${row.workspaceId} to work ` +
        `in the project that conversation belongs to.`,
      404,
    )
  }
  return row
}

export function createThread(
  input: { workspaceId: string; title: string; mode: ThreadMode },
  actor: Actor,
): AgentThreadView {
  const title = input.title.trim()
  if (title === '') {
    throw new PanelError('A conversation needs a title. It is what a person reads on the list of them.')
  }
  const stamp = now()
  const row: ThreadRow = {
    id: anOfficeId(),
    workspaceId: input.workspaceId,
    title,
    mode: input.mode,
    state: 'open',
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: `${actor.type}:${actor.id}`,
  }
  db.insert(agentThreads).values(row).run()
  return toThread(row)
}

export interface ThreadListReply {
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<ThreadListBucket>[]

  threads: AgentThreadListView[]
  /** How many there are in each state, so the interesting number needs no walk of the list. */
  counts: Record<string, number>
  leftOut: number
  note: string
}

/** One conversation in the list, with the facts the page needs to order and name it. */
export interface AgentThreadListView extends AgentThreadView {
  /** True when the last stored word in the conversation came from a run's answer. */
  lastWordIsAgent: boolean
  /** True when the person has an answer to read or no run answered the latest request. */
  needsYou: boolean
  /** The newest run's state, or null when this conversation has never been dispatched. */
  lastRunState: RunState | null
  /** Counted here so the developer view does not need a second interpretation of the list. */
  runCount: number
}

export function listThreads(opts: {
  workspaceId: string
  state?: ThreadState
  mode?: ThreadMode
  /** Who is reading: only the conversations it may read are listed or counted. */
  reader?: AMessageReader
}): ThreadListReply {
  const wheres = [eq(agentThreads.workspaceId, opts.workspaceId)]
  if (opts.state !== undefined) wheres.push(eq(agentThreads.state, opts.state))
  if (opts.mode !== undefined) wheres.push(eq(agentThreads.mode, opts.mode))

  const every = db
    .select()
    .from(agentThreads)
    .where(and(...wheres))
    .orderBy(desc(agentThreads.updatedAt))
    .all()
  const mayRead = opts.reader === undefined ? null : theThreadsThisReaderMayRead(opts.reader, every)
  const rows = mayRead === null ? every : every.filter((row) => mayRead.has(row.id))

  const counts: Record<string, number> = {}
  for (const state of THREAD_STATES) counts[state] = 0
  for (const row of rows) counts[row.state] = (counts[row.state] ?? 0) + 1

  const listed = rows.slice(0, MAX_ROWS)
  const leftOutGroups: LeftOutGroup<ThreadListBucket>[] = [{
    cause: 'budget', bucket: 'row_limit', count: rows.length - listed.length,
    ids: rows.slice(MAX_ROWS).map((row) => row.id),
  }]
  const subtraction: LeftOutCounts = { candidates: rows.length, carried: listed.length, leftOut: rows.length - listed.length, shortened: 0 }
  checkSubtraction('listThreads', subtraction, leftOutGroups)

  const ids = listed.map((row) => row.id)
  const messages = ids.length === 0
    ? []
    : db
        .select({ threadId: agentMessages.threadId, role: agentMessages.role, runId: agentMessages.runId, createdAt: agentMessages.createdAt, position: agentMessages.position })
        .from(agentMessages)
        .where(inArray(agentMessages.threadId, ids))
        .orderBy(asc(agentMessages.position))
        .all()
  const runs = ids.length === 0
    ? []
    : db
        .select()
        .from(agentRuns)
        .where(inArray(agentRuns.threadId, ids))
        .orderBy(asc(agentRuns.createdAt), asc(agentRuns.id))
        .all()
  const messagesByThread = new Map<string, typeof messages>()
  for (const message of messages) {
    const inThread = messagesByThread.get(message.threadId) ?? []
    inThread.push(message)
    messagesByThread.set(message.threadId, inThread)
  }
  const runsByThread = new Map<string, RunRow[]>()
  for (const run of runs) {
    const inThread = runsByThread.get(run.threadId) ?? []
    inThread.push(run)
    runsByThread.set(run.threadId, inThread)
  }
  const threadViews: AgentThreadListView[] = listed.map((row) => {
    const threadMessages = messagesByThread.get(row.id) ?? []
    const threadRuns = runsByThread.get(row.id) ?? []
    const lastMessage = threadMessages.at(-1)
    const answerRunIds = new Set(threadMessages.filter((message) => message.role === 'agent' && message.runId !== null).map((message) => message.runId))
    const legacyAnswerAt = threadRuns
      .filter((run) => run.state === 'finished' && !answerRunIds.has(run.id) && run.endedAt !== null)
      .filter((run) => {
        try {
          return answerWordsOf(run.result === null ? null : JSON.parse(run.result)) !== null
        } catch {
          return false
        }
      })
      .map((run) => run.endedAt!)
      .sort()
      .at(-1) ?? null
    // The transcript's position decides between stored messages. A finished run without its
    // answer-message is an older, still-drawn answer, so its end time is compared with the last
    // message only for that legacy shape.
    const lastWordIsAgent =
      (lastMessage?.role === 'agent' && lastMessage.runId !== null) ||
      (legacyAnswerAt !== null && (lastMessage === undefined || legacyAnswerAt > lastMessage.createdAt))
    const lastRun = threadRuns.at(-1)
    const lastRunState = lastRun === undefined ? null : (lastRun.state as RunState)
    const lastRunHasAnswer = lastRun?.state === 'finished' && (() => {
      try {
        return answerWordsOf(lastRun.result === null ? null : JSON.parse(lastRun.result)) !== null
      } catch {
        return false
      }
    })()
    const lastRunStoppedWithoutAnswer =
      lastRunState === 'failed' ||
      lastRunState === 'crashed' ||
      lastRunState === 'declined' ||
      lastRunState === 'withdrawn' ||
      (lastRunState === 'finished' && !lastRunHasAnswer && row.state === 'dispatched')
    const needsYou =
      row.state !== 'abandoned' &&
      (lastWordIsAgent || (lastRun === undefined && row.state === 'open') || lastRunStoppedWithoutAnswer)
    return {
      ...toThread(row),
      lastWordIsAgent,
      needsYou,
      lastRunState,
      runCount: threadRuns.length,
    }
  })

  return {
    threads: threadViews,
    subtraction,
    leftOutGroups,
    counts,
    leftOut: subtraction.leftOut,
    note:
      `Every conversation about "${opts.workspaceId}"` +
      (opts.state === undefined ? '' : ` whose state is ${opts.state}`) +
      (opts.mode === undefined ? '' : ` in ${opts.mode} mode`) +
      `. ${String(rows.length)} in all` +
      (subtraction.leftOut === 0
        ? '.'
        : `. ${leftOutWords(THREAD_LIST_BUCKET_WORDS.row_limit, subtraction.leftOut)}`),
  }
}

/**
 * WHICH OF THESE CONVERSATIONS THIS READER MAY READ, by a decision. Here it is read for the
 * conversations the person has with agents (`agent_threads`), which are not records of kind
 * message.
 *
 * The owner, a secretary and the message worker read every one (`theMessageReader`). Anybody else reads
 * a conversation it is part of: one it started, or one where a message was addressed to it, either by
 * name or to a run that answers as it. Who started it, and the agent a message names, are stored
 * references, read through `agentForRecord` and then `everyAgentAStoredStampCouldName`.
 */
export function theThreadsThisReaderMayRead(reader: AMessageReader, threads: readonly ThreadRow[]): Set<string> {
  if (reader.readsEveryMessage) return new Set(threads.map((one) => one.id))
  const me = reader.who
  if (me === null || threads.length === 0) return new Set()
  const out = new Set<string>()
  // A STORED STRING NAMES THE READER when it is one of its agent records, or when it is the reader's registry
  // id or its handle and names no other agent (`everyAgentAStoredStampCouldName`). A conversation stores who
  // started it as the actor id it was started under, which is an agent's handle, so reading the string only
  // as a registry id left an agent unable to read or write the conversation it had started itself.
  const mine = (who: string | null): boolean => {
    if (who === null || me.kind !== 'agent') return false
    const mapped = agentForRecord(who)
    if (mapped !== null) return mapped.id === me.id
    const could = everyAgentAStoredStampCouldName(who)
    return could.length === 1 && could[0]!.id === me.id
  }
  for (const thread of threads) {
    const [kind, ...rest] = thread.createdBy.split(':')
    const by = rest.join(':')
    if ((kind === 'agent' && mine(by)) || (kind === 'human' && me.kind === 'person' && by === me.id)) {
      out.add(thread.id)
      continue
    }
    for (const message of messagesOf(thread.id)) {
      // AN AGENT CHOSEN BY NAME is in `recipient_session_id` until the message is sent and in
      // `recipient_agent_id` after (`recipientColumns` says why), so both are read.
      if (mine(message.recipientAgentId) || (message.recipientKind === 'agent' && mine(message.recipientSessionId))) {
        out.add(thread.id)
        break
      }
      if (message.recipientKind === 'session' && message.recipientSessionId !== null) {
        const session = getRecord(message.recipientSessionId)
        const answers = session === null ? null : theAgentASessionAnswersAs(session, thread.workspaceId)
        if (answers !== null && answers.agent.kind === me.kind && answers.agent.id === me.id) {
          out.add(thread.id)
          break
        }
      }
    }
  }
  return out
}

/**
 * WHETHER THIS READER MAY READ ONE AGENT'S INBOX, the messages in conversations addressed to that agent
 * . The owner, a secretary and the message worker may read any; an agent reads its
 * own. `agentRecordId` is the agent's record, as `agentByHandle` answers it, read to the registry row.
 */
export function mayReadTheInboxOf(reader: AMessageReader, agentRecordId: string): boolean {
  if (reader.readsEveryMessage) return true
  const me = reader.who
  return me !== null && me.kind === 'agent' && (agentForRecord(agentRecordId)?.id ?? agentRecordId) === me.id
}

/** The sentence an agent is refused another agent's inbox with. */
export function onlyItsOwnInbox(handle: string): string {
  return (
    `An agent reads only its own inbox, and this is the inbox of "${handle}". The messages in it are addressed ` +
    'to that agent. Nothing was read.'
  )
}

/** Every message of a thread, oldest first. */
function messagesOf(threadId: string): MessageRow[] {
  return db.select().from(agentMessages).where(eq(agentMessages.threadId, threadId)).orderBy(asc(agentMessages.position)).all()
}

/** Every run of a thread, oldest first. */
function runsOf(threadId: string): RunRow[] {
  return db.select().from(agentRuns).where(eq(agentRuns.threadId, threadId)).orderBy(asc(agentRuns.createdAt)).all()
}

/**
 * Where a conversation stands, counted rather than asserted.
 *
 * A THREAD CAN BE SEVERAL THINGS AT ONCE. Dispatch sends the comments it can reach and leaves the
 * rest waiting, so a conversation may have runs out AND comments still in it. Saying "nothing has
 * been sent" there was a false sentence about a thread with four runs in it.
 *
 * ---------------------------------------------------------------------------------------
 * EVERYTHING IS COUNTED IN EVERY STATE, AND THAT IS THE FIX OF 19 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * This used to branch on `open` and treat every other state as dispatched. The branch said two
 * false things, both to a person reading the one sentence the conversation pane prints:
 *
 *   · AN ABANDONED CONVERSATION WITH NO RUNS was told "This was dispatched and no run was written,
 *     which should not be possible", while the list row beside it said "Dropped". Nothing had been
 *     dispatched. Two places on one screen disagreed and the false one was the sentence.
 *   · A REPLY TO AN AGENT WAS NEVER MENTIONED. After an answer the thread is `answered`, and the
 *     non-open branch counted runs and never looked at the comments waiting. So the person typed a
 *     reply, it sat there queued, and the pane went on saying "1 run came out of this: 1 answered."
 *     That is the whole point of a reply, said wrongly by the screen it happens on.
 *
 * So there is one reading. The comments waiting are counted whatever the state, the runs are
 * counted whatever the state, and the state adds what only it knows: that somebody walked away.
 */
function threadSays(thread: ThreadRow, messages: readonly MessageRow[], runs: readonly RunRow[]): string {
  const queued = messages.filter((m) => m.state === 'queued').length
  const replies = messages.filter((m) => m.runId !== null).length

  const notBack = runs.filter((r) => !ENDED.includes(r.state as RunState)).length
  const unclaimed = runs.filter((r) => r.state === 'queued').length
  const working = runs.filter((r) => r.state === 'claimed' || r.state === 'running').length
  const done = runs.filter((r) => r.state === 'finished').length
  const failed = runs.filter((r) => r.state === 'failed' || r.state === 'crashed').length
  const declined = runs.filter((r) => r.state === 'declined').length
  const withdrawn = runs.filter((r) => r.state === 'withdrawn').length
  const parts: string[] = []
  if (unclaimed > 0) parts.push(`${String(unclaimed)} not picked up yet`)
  if (working > 0) parts.push(`${String(working)} being worked on`)
  if (done > 0) parts.push(`${String(done)} answered`)
  if (failed > 0) parts.push(`${String(failed)} failed`)
  if (declined > 0) parts.push(`${String(declined)} declined`)
  if (withdrawn > 0) parts.push(`${String(withdrawn)} withdrawn`)

  // AN ANSWER THAT CARRIED NO WORDS LEFT NOTHING HERE TO READ. A finished run writes a message only
  // when its result held words for a person, so a finished run with no message beside it answered
  // onto the run and not into the conversation. Counted from the two stored facts rather than by
  // reading every result again, which would be the same fact worked out in two places.
  const wordless = Math.max(0, done - replies)
  // READ ONLY WHERE A RUN EXISTS: each use below has already asked `runs.length`, so it has no
  // sentence for none.
  const runsSay =
    (notBack > 0
      ? `${runsSent(runs.length)} ${parts.join(', ')}.`
      : `${String(runs.length)} run${runs.length === 1 ? '' : 's'}: ${parts.join(', ')}.`) +
    (wordless === 0
      ? ''
      : wordless === 1 && done === 1
        ? ` ${THE_ANSWER_IS_ON_THE_RUN}`
        : ` ${String(wordless)} of those answers ${wordless === 1 ? 'is' : 'are'} on the runs, not in this conversation.`)

  // SOMEBODY WALKED AWAY FROM THIS ONE. It is the state a person sets by hand, and it is the first
  // thing a reader needs, so it is said first and the counts follow it.
  if (thread.state === 'abandoned') {
    const never =
      queued === 0
        ? ''
        : ` ${String(queued)} comment${queued === 1 ? '' : 's'} ${queued === 1 ? 'was' : 'were'} never sent.`
    return (
      `This conversation was dropped.${never}` +
      (runs.length === 0 ? '' : ` ${runsSay}`) +
      ` Nothing more can be said here until it is reopened.`
    )
  }

  if (queued === 0 && runs.length === 0) {
    if (thread.state === 'open') return 'Nothing has been written here yet.'
    return `This conversation says it is "${thread.state}" and no run was written, which should not be possible.`
  }

  /*
   * WHAT IS HERE AND WHETHER IT HAS GONE. IT DOES NOT NAME THE BUTTON, and it used to.
   *
   * It read "1 comment waiting. **Finish review** is what sends it." Two things were wrong. The
   * button in the review pane is captioned **Finish collecting**, so one control had two names and
   * the sentence taught the wrong one. And finishing collecting does NOT send: the owner drew that
   * line deliberately — finishing stops gathering, sending dispatches — so the sentence said the
   * opposite of the design.
   *
   * The button is on screen. A reader will read its name off the button, which is the interface
   * explaining itself rather than a sentence doing it. What is left is the fact the sentence is
   * really for: how many comments are here, and that none of them has gone anywhere.
   */
  const waiting = whatIsWaitingInAConversation(queued)

  // WHAT WAITS, THE RUNS, OR BOTH. Nothing queued and nothing run has returned above. With nothing
  // queued the runs are the whole answer: "nothing is waiting" would be untrue beside a run still
  // waiting to be picked up. Each waiting comment says on itself why it has not gone.
  if (runs.length === 0) return waiting
  if (queued === 0) return runsSay
  return `${waiting} ${runsSay}`
}

/**
 * How many comments in a conversation are waiting, and that none of them has gone. Exported so that a test
 * reads the words here rather than writing them out (round 130).
 */
export function whatIsWaitingInAConversation(queued: number): string {
  return queued === 0
    ? 'Nothing is waiting here now.'
    : `${queued === 1 ? 'One comment' : `${String(queued)} comments`}, not sent yet.`
}

export function readThread(id: string, workspaceId: string, reader?: AMessageReader): ThreadDetail {
  // A CONVERSATION THIS READER MAY NOT READ IS REFUSED inside `threadInWorkspace`,
  // as one that is not there. Left out by a caller that answers no request.
  const thread = threadInWorkspace(id, workspaceId, reader)
  const messages = messagesOf(id)
  const runs = runsOf(id)
  return {
    thread: toThread(thread),
    messages: messages.map((row) => toMessage(row, true, workspaceId)),
    runs: runs.map((row) => toRun(row, thread)),
    says: threadSays(thread, messages, runs),
  }
}

export interface ThreadPatch {
  title?: string
  state?: ThreadState
}

/**
 * Change a conversation's title, or abandon it.
 *
 * **`dispatched` AND `answered` MAY NOT BE SET BY HAND**, and that refusal is part of how "nothing
 * was sent before Finish review" is provable: a dispatched thread is one that dispatch wrote, and
 * an answered one is one a result answered. A patch that could write either would be a second way
 * to make a thread look sent.
 *
 * IT TAKES NO ACTOR, AND THAT IS A GAP RATHER THAN A DECISION. `agent_threads` has `created_by` and
 * no `updated_by`, and the change log covers records rather than these tables, so there is nowhere
 * to record who renamed a conversation. The route still reads the actor headers, so a request with
 * a broken identity is refused the way every other write is; it simply has nothing to write it to.
 */
export function patchThread(
  id: string,
  workspaceId: string,
  patch: ThreadPatch,
  /** Who is asking: a conversation it may not read is refused as one that is not there. */
  reader?: AMessageReader,
): AgentThreadView {
  const thread = threadInWorkspace(id, workspaceId, reader)
  const write: Partial<ThreadRow> = { updatedAt: now() }

  if (patch.title !== undefined) {
    const title = patch.title.trim()
    if (title === '') throw new PanelError('A conversation needs a title. It is what a person reads on the list of them.')
    write.title = title
  }

  if (patch.state !== undefined && patch.state !== thread.state) {
    if (patch.state === 'dispatched' || patch.state === 'answered') {
      throw new PanelError(
        `A conversation cannot be moved to "${patch.state}" by hand. "dispatched" is written by ` +
          `POST /api/agent/threads/${id}/dispatch, which is the only thing that creates a run, and "answered" is ` +
          `written when a result comes back. Setting either here would make a thread look sent when nothing was.`,
        409,
      )
    }
    if (patch.state === 'open' && thread.state !== 'abandoned') {
      throw new PanelError(
        `This conversation is "${thread.state}" and cannot be reopened from there. Only an abandoned one can be ` +
          `picked up again. Start a new conversation instead; nothing here is lost.`,
        409,
      )
    }
    write.state = patch.state
  }

  db.update(agentThreads).set(write).where(eq(agentThreads.id, id)).run()
  return toThread({ ...thread, ...write })
}

// ============================================================================ messages

export interface MessageInput {
  intent: MessageIntent
  body: string
  context?: MessageContext | null
  recipient?: {
    kind: RecipientKind
    sessionId?: string | null
    /** Which durable agent, when the kind is `agent`. See `recipientColumns` for where it is kept. */
    agentId?: string | null
    said?: string | null
    why?: string | null
  } | null
  /**
   * THE COMMENT THESE WORDS CAME FROM, when they came from one.
   *
   * Set by sending a review, which writes a comment somebody left on something into the review's
   * conversation as a message. It is not on any route: a caller cannot claim its words came from
   * somebody else's comment, because the only thing that says so is the act that made the copy.
   */
  fromAnnotationId?: string | null
  /**
   * THE COMMENTS THESE WORDS CAME FROM, when a sent review puts two or more comments for one
   * recipient into one message.
   *
   * Each entry is one comment and its own quote, in the order the comments were written. It is set
   * only by sending a review and by the new-agent press copying such a message, never by a route,
   * for the reason `fromAnnotationId` is not on one. A message has this or `fromAnnotationId`, never
   * both, and `context` is left out when this is given, because each comment brings its own.
   */
  carries?: readonly { commentId: string; quote: MessageContext }[] | null
}

/**
 * Check that a context points at something that exists, in this project, before it is stored.
 *
 * A comment written against something nobody has is not a comment about anything, and the person
 * writing it is the one who can fix it. What happens LATER — the record is deleted, the words are
 * rewritten — is not this check's business: that is `readContext`, which says so honestly rather
 * than refusing.
 *
 * AND WHO IS WRITING IT, for the one field that is refused by writer rather than by shape. `view`
 * says what was on a screen when the comment was written, and an agent has no screen: it never drew
 * the report and never chose how much of it to show. `checkView` in lib/targets.ts is the whole
 * argument. Every other field on a context means the same thing whoever sent it.
 */
function checkContext(context: MessageContext, workspaceId: string, writtenBy: ActorType): void {
  checkStoredContext(context, workspaceId, writtenBy)
}

/**
 * WHO A MESSAGE IS FOR, AS IT WILL BE STORED, WITH THE RUN'S DURABLE IDENTITY ALREADY FILLED IN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SECOND FUNCTION BESIDE `recipientColumns` RATHER THAN ONE
 * ---------------------------------------------------------------------------------------
 *
 * `recipientColumns` is asked by `readDelivery` about a recipient nobody has stored yet, to show a
 * person where a comment WOULD go before they choose it. That question must write nothing. This one
 * is asked on the way into a write, and it writes: choosing a run mints that run's durable agent
 * identity if it has none. So the reading and the writing are two functions, and the writing one is
 * built out of the reading one so the columns cannot come out differently.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT ADDS, AND WHY THE START-UP GATE IS THE REASON
 * ---------------------------------------------------------------------------------------
 *
 * `recipient_agent_id` is filled in for a run, in the same statement as the choice. That is the
 * write `migrateAgentDispatch` would otherwise have to make — *file 1 under the durable identity
 * their run worked as* — and a database with a migration write waiting in it is one `prepareToServe`
 * REFUSES TO SERVE. Measured on an isolated copy on 31 August 2026: one PATCH choosing a run for one
 * comment, all three requests 200, and the next server start refused.
 *
 * IT DOES NOT PUT ANYTHING IN AN INBOX. The inbox is `recipient_agent_id = ? AND state IN
 * ('sent','delivered','picked_up')`, and a comment nobody has sent is `queued`. What this writes is
 * which identity the choice resolves to, not that anything has gone anywhere.
 *
 * THE KIND STAYS `session` FOR A RUN, because that is what the person chose and it is what makes
 * dispatch pick the run up where it left off. Only two things change it: a choice naming a record
 * that is already a durable agent is stored as the agent it names, and a choice nothing durable can
 * stand behind is stored as `unresolved` with the sentence saying why. The second is not a
 * politeness — the migration REFUSES A WHOLE CORPUS over a recipient naming a run that is not
 * there, and that refusal reaches a server start as a thrown error rather than a readable refusal.
 */
function recipientColumnsForAWrite(recipient: MessageInput['recipient'], actor: Actor): Partial<MessageRow> {
  const columns = recipientColumns(recipient)
  if (recipient === null || recipient === undefined) return { ...columns, recipientAgentId: null }
  if (recipient.kind !== 'session') return columns
  const sessionId = recipient.sessionId ?? null
  if (sessionId === null || sessionId === '') return columns

  const answer = identityForAddressedRun(sessionId, actor)
  if (!answer.addressable) {
    return {
      recipientKind: 'unresolved',
      recipientSessionId: null,
      recipientSaid: recipient.said ?? null,
      recipientWhy: answer.why,
      recipientAgentId: null,
    }
  }
  if (answer.namedKind === 'agent') {
    return {
      ...recipientColumns({ ...recipient, kind: 'agent', sessionId: null, agentId: answer.agentId }),
      recipientAgentId: answer.agentId,
    }
  }
  return { ...columns, recipientAgentId: answer.agentId }
}

function recipientColumns(recipient: MessageInput['recipient']): Partial<MessageRow> {
  if (recipient === null || recipient === undefined) {
    return { recipientKind: null, recipientSessionId: null, recipientSaid: null, recipientWhy: null }
  }
  return {
    recipientKind: recipient.kind,
    // ONE COLUMN CARRIES WHICH ONE, WHATEVER KIND IT IS, and `recipient_kind` says how to read it.
    // A durable agent's id goes here at write time and moves to `recipient_agent_id` at SEND time,
    // once `deliveryOf` has checked that the id really names a live agent in this project. The two
    // are not a copy: this one is what the person chose and can correct, and that one is what the
    // inbox query reads, written only after the choice was checked.
    recipientSessionId:
      recipient.kind === 'session' || recipient.kind === 'agent' ? (recipient.sessionId ?? recipient.agentId ?? null) : null,
    recipientSaid: recipient.said ?? null,
    recipientWhy: recipient.why ?? null,
  }
}

/**
 * WOULD THIS RECIPIENT GO ANYWHERE, ASKED BEFORE A MESSAGE EXISTS TO CARRY IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SECOND CALLER OF `deliveryOf` IS THE POINT RATHER THAN A LEAK
 * ---------------------------------------------------------------------------------------
 *
 * Sending a review shows the person, one line per comment, where each comment is going and which
 * ones are going nowhere — BEFORE they press Send. That question is the one `deliveryOf` already
 * answers for a stored message, and `DeliveryReading` says in its own comment that there is one
 * answer to it in this product. So the preview asks that function, through this, rather than
 * working the same thing out again over the recipient it is about to store.
 *
 * IT ANSWERS ABOUT A RECIPIENT AND NOT ABOUT A MESSAGE, because at preview time there is no
 * message: the comment is a record and the message is what Send would write. The columns are built
 * by the same function that writes them, so what is read here is what would be stored.
 */
export function readDelivery(recipient: MessageInput['recipient'], workspaceId: string): DeliveryReading {
  const columns = recipientColumns(recipient)
  const delivery = deliveryOf(
    {
      recipientKind: columns.recipientKind ?? null,
      recipientSessionId: columns.recipientSessionId ?? null,
      recipientSaid: columns.recipientSaid ?? null,
      recipientWhy: columns.recipientWhy ?? null,
    },
    workspaceId,
  )
  return {
    canSend: delivery.canSend,
    says: delivery.says,
    sentence: delivery.sentence,
    ...(!delivery.canSend && delivery.retired ? { retired: true as const } : {}),
    ...(delivery.canSend ? { goesTo: recipientKeyOf(delivery) } : {}),
  }
}

/**
 * Whether anything more may be said in this conversation, and the refusal when it may not.
 *
 * THE TWO MODES PART COMPANY HERE, AND ONLY HERE. A REVIEW IS ONE ACT: once it has been finished it
 * is a finished human act, and a comment added to it afterwards would be a comment the person never
 * reviewed anything to write. A DIRECT CONVERSATION IS A CONVERSATION: you say a thing, it is sent,
 * an answer comes back, and you say the next thing. Refusing the second message would make `direct`
 * a mode that works exactly once, which is not what the word says.
 *
 * An ABANDONED conversation is closed in both modes. The person walked away from it; picking it up
 * again is `PATCH /api/agent/threads/<id> {"state":"open"}`, which is a thing somebody does on
 * purpose.
 */
function refuseIfClosedToMore(thread: ThreadRow): void {
  if (thread.state === 'abandoned') {
    throw new PanelError(
      `This conversation was abandoned, so nothing more can be added to it. Reopen it, or start a new one.`,
      409,
    )
  }
  if (thread.mode === 'review' && thread.state !== 'open') {
    throw new PanelError(
      `This review has been finished and sent, so nothing more can be added to it. A review is one act: a comment ` +
        `written after it went out is not part of what was reviewed. Start a new review to say something else.`,
      409,
    )
  }
}

/**
 * THE COMMENT A MESSAGE SAYS ITS WORDS CAME FROM, CHECKED. Refuses, and writes nothing, when it is not
 * a comment of this project whose words are still free to be written into a conversation.
 *
 * IT IS NOT THE SAME QUESTION AS WHO THE MESSAGE IS FOR. A recipient is a property of this comment that a person can correct afterwards. This is a claim
 * ABOUT ANOTHER RECORD, and `hasGoneOut` reads it to decide whether that record's words are
 * fixed. So it is refused rather than stored loosely: a claim that points at a `task`, at a
 * deleted record, or at another project's work is not a correctable address, it is a statement
 * that is simply untrue. Nothing about the writer's own words depends on it, so refusing costs
 * them nothing they cannot get back by sending the request again without the key.
 */
function checkTheCommentTheWordsCameFrom(fromAnnotationId: string, workspaceId: string): void {
  const comment = getRecord(fromAnnotationId)
  if (comment === null || comment.deletedAt !== null) {
    throw new PanelError(
      `This says its words came from the comment ${fromAnnotationId}, and no record has that id. Nothing was ` +
        `written. Send the message without fromAnnotationId if the words are your own.`,
      404,
    )
  }
  // A COMMENT IS EITHER KIND (criterion M1). A record of kind `annotation` is every comment
  // written before comments and messages became one thing; a message that says what on a page it
  // is about is every comment written since. A check that named only the first would refuse every
  // new comment being sent to an agent.
  if (!isAComment(comment)) {
    throw new PanelError(
      `This says its words came from the comment ${fromAnnotationId}, which is a ${kindWord(comment.kind).text} — ` +
        `"${comment.title}" — and says nothing about what on a page it is about, so it is not a comment left on ` +
        `something. Nothing was written.`,
      409,
    )
  }
  // A COMMENT THAT IS A MESSAGE IS KEPT IN THE MESSAGE CENTRE and belongs to no project.
  if (comment.workspaceId !== workspaceId && comment.workspaceId !== MESSAGE_CENTRE) {
    throw new PanelError(
      `This says its words came from a comment in "${comment.workspaceId}", and this conversation is about ` +
        `"${workspaceId}". Nothing was written.`,
      409,
    )
  }
  // A COMMENT THAT HAS ALREADY GONE IS NOT WRITTEN INTO A SECOND CONVERSATION.
  //
  // THE REFUSAL MOVED HERE FROM THE BROWSER. `sendOneComment` in src/web/api.ts read the comment's
  // own stored `state` and threw before making anything — which meant it was the browser's rule,
  // over the field that could be wrong, and any other caller of these routes had no rule at all.
  // Two presses on one comment made two conversations, two messages and two runs carrying the
  // identical words, and the second one answered 200.
  //
  // IT REFUSES THE WRITE RATHER THAN THE SEND, so a second press does not leave a conversation
  // behind with nothing in it. Nobody's words are lost by this: the words are the comment record,
  // which is already stored and is not touched.
  if (hasGoneOut(fromAnnotationId, workspaceId)) {
    throw new PanelError(
      `${A_COMMENT_ALREADY_SENT} An ` +
        `agent given the same words twice cannot tell that it is one request. Write a new comment if there is ` +
        `something more to say, and link it with POST /api/links ` +
        `{"fromId":"<the new one>","toId":"${fromAnnotationId}","type":"supersedes"}.`,
      409,
    )
  }
}

/**
 * Say something, about something, to somebody.
 *
 * THIS WRITES NO RUN. In a direct thread the caller dispatches straight afterwards; in a review
 * thread the comments pile up until Finish review. Both go through the same door, which is why
 * there are not two systems here — one grammar, two dispatch times.
 *
 * The role is the actor's own type and is not taken from the body. A message that could claim to
 * be from a person while an agent wrote it is a false name in a durable log, and there is nothing
 * to gain by allowing it.
 */
export function addMessage(
  threadId: string,
  workspaceId: string,
  input: MessageInput,
  actor: Actor,
  /** Who is asking: a conversation it may not read is refused as one that is not there. */
  reader?: AMessageReader,
): AgentMessageView {
  const thread = threadInWorkspace(threadId, workspaceId, reader)
  refuseIfClosedToMore(thread)

  const body = input.body.trim()
  if (body === '') throw new PanelError('A comment with no words says nothing. Write what you want.')

  // WHAT IT POINTS AT IS CHECKED, AND THEN COMPLETED. A comment on something named by where it sits
  // — a cell of a table — keeps what that cell holds as its quote, because that is the only evidence
  // that can answer "is this still about the same thing" later; and a context that named no place at
  // all gets the one it already names, because a stored context with a target and no place is what
  // stops the server coming up at the next restart. `contextAsStored` in lib/targets.ts is the whole
  // argument for both, and neither step touches words somebody selected themselves.
  let context: MessageContext | null = null
  if (input.context !== null && input.context !== undefined) {
    checkContext(input.context, workspaceId, actor.type)
    context = contextAsStored(input.context)
  }
  // WHO IT IS FOR IS STORED AND NOT CHECKED. A recipient that names nobody, names the wrong kind of
  // thing, or names a run whose transcript is not on this machine is a property of this comment that
  // can be corrected. Refusing the write over it threw away the sentence somebody had just typed —
  // see `deliveryOf` and the header. The reply carries the reading, so the answer is not lost either.

  // WHICH COMMENT THESE WORDS CAME FROM IS CHECKED: see `checkTheCommentTheWordsCameFrom`. A message
  // carrying several comments of a sent review has each of them checked the same way, and each of
  // their quotes checked the way a context is, all before anything is written.
  const fromAnnotationId = input.fromAnnotationId ?? null
  const carries = input.carries ?? null
  if (fromAnnotationId !== null && carries !== null) {
    throw new PanelError(
      'This message says its words came from one comment and also from a list of comments. A message carries ' +
        'one or the other. Nothing was written.',
      400,
    )
  }
  if (fromAnnotationId !== null) checkTheCommentTheWordsCameFrom(fromAnnotationId, workspaceId)
  let carried: string | null = null
  if (carries !== null) {
    if (carries.length < 2) {
      throw new PanelError(
        `A list of the comments a message carries is for two or more comments, and this one names ` +
          `${String(carries.length)}. One comment is carried by naming it on its own. Nothing was written.`,
        400,
      )
    }
    const twice = carries.map((one) => one.commentId).filter((id, at, all) => all.indexOf(id) !== at)
    if (twice.length > 0) {
      throw new PanelError(
        `This message names the comment ${twice[0] ?? ''} twice. Each comment is carried once. Nothing was written.`,
        400,
      )
    }
    if (context !== null) {
      throw new PanelError(
        'This message carries several comments and also has a context of its own. Each comment brings its own ' +
          'quote, so the message has none. Nothing was written.',
        400,
      )
    }
    const stored: { commentId: string; quote: MessageContext }[] = []
    for (const one of carries) {
      checkTheCommentTheWordsCameFrom(one.commentId, workspaceId)
      checkContext(one.quote, workspaceId, actor.type)
      stored.push({ commentId: one.commentId, quote: contextAsStored(one.quote) })
    }
    carried = JSON.stringify(stored)
  }

  // ONE TRANSACTION FROM HERE, because choosing a run MINTS ITS DURABLE IDENTITY — two more record
  // writes, made by `recipientColumnsForAWrite` below. A message write that failed after them would
  // leave an agent record and a bound run behind for a comment that was never stored.
  const row: MessageRow = sqlite.transaction((): MessageRow => {
    // ONE MOMENT FOR THE WHOLE ROW, read once. It is what the row was written at, and `queued` owes
    // nothing else — see `theMomentsOfAMessageWrittenAt`, which is handed it and returns the nulls.
    const at = now()
    const written: MessageRow = {
      id: anOfficeId(),
      threadId,
      position: nextPosition(threadId),
      role: actor.type,
      intent: input.intent,
      body,
      context: context === null ? null : JSON.stringify(context),
      ...theMomentsOfAMessageWrittenAt('queued', at),
      recipientKind: null,
      recipientSessionId: null,
      recipientSaid: null,
      recipientWhy: null,
      runId: null,
      // WHERE THESE WORDS CAME FROM, when they came from a comment somebody left on something. Null
      // for everything typed straight into a conversation, which is the ordinary case. Checked above.
      fromAnnotationId,
      // THE COMMENTS A MERGED REVIEW MESSAGE CARRIES, with their quotes, or null. Checked above.
      carries: carried,
      // SEVEN OF THE TEN COLUMNS THE DISPATCH LEDGER AND DURABLE AGENT IDENTITY ADDED. NULL here is
      // "nobody has said", which is what they hold: no message written today coordinates an overlap
      // and no worker has taken one. THE TENTH, `recipient_agent_id`, IS NOW WRITTEN — by the spread
      // at the bottom of this object, when the choice names a run — and this sentence used to say
      // that nothing in this build wrote any of them. `state_at` and `sent_at` are the other two,
      // and the spread above them writes both: a queued message owes neither, and which words owe a
      // moment is decided in ./dispatch.ts rather than here.
      recipientAgentId: null,
      takenByAgentId: null,
      takenAt: null,
      failedBecause: null,
      handledNote: null,
      handledBySession: null,
      writtenByAgentId: null,
      coordination: null,
      // HOW A KEY PROVED THE REQUEST THAT WROTE THESE WORDS, or null when none did. Migration 0178.
      // A warrant written after the key window closed may cite this message only when this says
      // the person's key proved it; `whyTheCitedPlaceMayNotBeCited` in ./warrants.ts reads it.
      provedBy: actor.provedBy ?? null,
      createdAt: at,
      createdBy: `${actor.type}:${actor.id}`,
      // WHO IT IS FOR, AND THE DURABLE IDENTITY BEHIND IT WHERE THERE IS ONE. LAST IN THIS OBJECT, so
      // it beats the five nulls above rather than being overwritten by them — `recipient_agent_id` is
      // one of the ten columns declared null there, and this is the write that fills it in. See
      // `recipientColumnsForAWrite`: a run chosen here gets its durable identity at this moment, so
      // the corpus never holds a choice with a migration write waiting behind it.
      ...recipientColumnsForAWrite(input.recipient, actor),
    }
    writeMessage(written)
    db.update(agentThreads).set({ updatedAt: written.createdAt }).where(eq(agentThreads.id, threadId)).run()
    return written
  })()
  return toMessage(row, true, workspaceId)
}

/**
 * THE ONLY PLACE A MESSAGE ROW IS WRITTEN.
 *
 * `tests/one-message-door.test.ts` walks `src/` and fails if a second `insert(agentMessages)`
 * appears, the way `tests/one-run-door.test.ts` has watched the run table since a second door to it
 * was opened by accident. There was no guard on messages until an agent's answer became one, and a
 * door nobody watches is how the last one appeared.
 *
 * It takes a whole row rather than pieces, so it decides nothing: what a message says, who wrote it
 * and where it sits are the caller's business and this is the write.
 */
function writeMessage(row: MessageRow): void {
  // AND IT REFUSES ONE ROW: a message born past `queued` carrying no moment. That is not this
  // function deciding anything — ./dispatch.ts owns which words owe a moment and says why — it is
  // the one insert door asking, so a row nothing can ever date cannot be written through it. One
  // such row, written by the answer above, stopped the next server start dead.
  refuseAMessageThatOwesAMoment(row)
  db.insert(agentMessages).values(row).run()
}

/** Where the next message in a thread sits: after the last one, or first if there is none. */
function nextPosition(threadId: string): number {
  const last = db
    .select({ position: agentMessages.position })
    .from(agentMessages)
    .where(eq(agentMessages.threadId, threadId))
    .orderBy(desc(agentMessages.position))
    .limit(1)
    .get()
  return last === undefined ? 1 : last.position + 1
}

/** The message with this id whose thread is in this project, plus that thread. */
function messageInWorkspace(id: string, workspaceId: string, reader?: AMessageReader): { message: MessageRow; thread: ThreadRow } {
  // ONE REFUSAL FOR A MESSAGE THAT IS NOT THERE AND FOR ONE IN A CONVERSATION THIS READER MAY NOT READ
  // so the refusal does not say it is there.
  const notHere = (): PanelError => new PanelError(`No agent message with id ${id}`, 404)
  const message = db.select().from(agentMessages).where(eq(agentMessages.id, id)).get()
  if (message === undefined) throw notHere()
  const thread = threadInWorkspace(message.threadId, workspaceId, reader, notHere)
  return { message, thread }
}

/**
 * The refusal a message that has already gone gets, naming where it went.
 *
 * A comment can be changed and removed WHILE IT IS STILL QUEUED and not after. Once it is part of a
 * run, editing it would change the question after the answer was given, and the whole value of
 * writing the request once is that an answer can be read against the question that produced it.
 *
 * AN AGENT'S ANSWER IS REFUSED FOR A DIFFERENT REASON AND SAYS SO. Nothing may rewrite what an
 * agent said, whatever state it is in: it is the record of what came back, and a reply to it is
 * read against it.
 */
/**
 * What to say happened to a comment that is past `queued`.
 *
 * THE WORD IS THE ONE TABLE'S, `stateWord` in `@shared/words.ts`. This was a table of its own until
 * 25 August 2026 — `WHAT_HAPPENED`, six entries, four of them character for character the strings
 * that table already held. That is this repository's named defect and not a convenience: change
 * "dealt with" in the shared table and this refusal goes on saying the old word, with no type error
 * and no failing test. Deleting it is what makes the two unable to disagree.
 *
 * THE COMPLETENESS GUARD IS NOT LOST WITH THE TABLE. It was `Readonly<Record<MessageState, string>>`
 * so that a seventh word could not arrive without a sentence for it. `tests/annotation.test.ts`
 * makes the same charge and makes it wider: every word in `MESSAGE_STATES` must have a reading in
 * `STATE_WORDS`, and that reading may not contain an underscore. A seventh word still cannot arrive
 * unread — it is charged for once now, in the table, rather than once per sentence.
 *
 * `failed` GETS A CLAUSE RATHER THAN A WORD, AND THAT IS GRAMMAR, NOT A SECOND READING. "This
 * comment has already been failed" is not English. Its reading is still the table's and is printed
 * inside the clause, so a change to the table moves this sentence with everything else.
 *
 * `queued` never reaches here: the caller returns before this when nobody has been given the words.
 */
function whatHappenedTo(state: MessageState): string {
  const said = stateWord(state).text
  return state === 'failed' ? `handed over and could not be finished — Mole Office has it stamped "${said}"` : said
}

function refuseIfSent(message: MessageRow): void {
  if (message.runId !== null) {
    throw new PanelError(
      `Those are an agent's words, out of the run ${message.runId}, so they cannot be changed or removed. What came ` +
        `back is the record of what happened, and a reply is read against it. Say something new instead.`,
      409,
    )
  }
  if (message.state === 'queued') return
  const runs = runsOf(message.threadId)
  throw new PanelError(
    `This comment has already been ${whatHappenedTo(deliveryWordOf(message))}, so it cannot be changed or ` +
      `removed. It went out with ${runs.length === 1 ? 'the run' : `one of the ${String(runs.length)} runs`} of this ` +
      `conversation, and a question that changes after the answer was given is a question nobody can check. Say ` +
      `something new instead.`,
    409,
  )
}

/** A comment goes out under its writer's name, so only that writer may change or remove it. */
function refuseIfAnotherWriter(message: MessageRow, changer: Actor, action: 'change' | 'remove'): void {
  const wrote = theTwoHalvesOfAStamp(message.createdBy)
  if (sameAgent(wrote, changer)) return
  const writer = wrote.actorType === 'human'
    ? (wrote.actorId === THE_PERSON ? 'The person' : 'Another person')
    : wrote.actorType === 'system' ? 'Mole Office' : theWriterAStampNames(message.createdBy)
  throw new PanelError(
    `${writer} wrote this comment, and only its writer may ${action} it. Nothing was ${action === 'change' ? 'changed' : 'removed'}. To add words, write a new comment in the conversation.`,
    403,
  )
}

export interface MessagePatch {
  intent?: MessageIntent
  body?: string
  context?: MessageContext | null
  recipient?: MessageInput['recipient']
}

export function patchMessage(
  id: string,
  workspaceId: string,
  patch: MessagePatch,
  /**
   * WHO IS MAKING THIS CHANGE. It was the actor's TYPE alone, which was enough while the only thing
   * this function asked about the writer was whether an agent may store a `view`. Choosing a run for
   * a comment now mints that run's durable identity, and a record written by nobody is not something
   * this repository has a way to file, so the whole actor is needed and not just its type.
   */
  changer: Actor,
  /** Who is asking: a comment in a conversation it may not read is refused as one that is not there. */
  reader?: AMessageReader,
): AgentMessageView {
  const writtenBy: ActorType = changer.type
  const { message } = messageInWorkspace(id, workspaceId, reader)
  refuseIfSent(message)
  refuseIfAnotherWriter(message, changer, 'change')

  // NOT `Partial<MessageRow>`, AND THE SIX MISSING COLUMNS ARE THE REASON. Where a message has got
  // to, when it moved, when it went out, why it failed and what was done with it are written by
  // `moveMessageTo` in lib/dispatch.ts and by nothing else. With the wider type, one line added here
  // would open a second writer of them and nothing would have said so. With this one the tree does
  // not compile.
  const write: Partial<Omit<MessageRow, 'state' | 'stateAt' | 'sentAt' | 'failedBecause' | 'handledNote' | 'handledBySession'>> = {}
  if (patch.intent !== undefined) write.intent = patch.intent
  if (patch.body !== undefined) {
    const body = patch.body.trim()
    if (body === '') throw new PanelError('A comment with no words says nothing. Write what you want.')
    write.body = body
    // THE PROOF FOLLOWS THE WORDS. The row keeps no copy of the words it held before, so the proof
    // stored beside them is the proof of whoever wrote the words it holds now. Migration 0178.
    write.provedBy = changer.provedBy ?? null
  }
  if (patch.context !== undefined) {
    if (patch.context === null) write.context = null
    else {
      checkContext(patch.context, workspaceId, writtenBy)
      // THE SAME DOOR AS `addMessage`, because a rule enforced on one write path is not a rule: a
      // patch that replaced a context with a place-less one would arm the start-up gate exactly as
      // a fresh write would.
      write.context = JSON.stringify(contextAsStored(patch.context))
    }
  }
  // A NEW RECIPIENT IS STORED WITHOUT BEING CHECKED, for the reason `addMessage` stores one without
  // checking: this is how a person corrects an address, and refusing the correction because the new
  // address is also unreachable would leave them nowhere to go. The reply says what Mole Office makes of
  // it, and dispatch is where it counts.
  // NOTHING TO CHANGE IS ASKED BEFORE THE RECIPIENT IS RESOLVED, because resolving one WRITES — it
  // mints the durable identity of a run somebody chose — and a patch that is about to be refused
  // for being empty must not mint anything first.
  if (patch.recipient === undefined && Object.keys(write).length === 0) {
    throw new PanelError('Nothing to change. Send intent, body, context or recipient.')
  }

  // ONE TRANSACTION, for the reason `addMessage` opens one: `recipientColumnsForAWrite` mints an
  // identity and binds a run, and a failure after that must take those two writes back with it.
  sqlite.transaction(() => {
    if (patch.recipient !== undefined) Object.assign(write, recipientColumnsForAWrite(patch.recipient, changer))
    db.update(agentMessages).set(write).where(eq(agentMessages.id, id)).run()
    db.update(agentThreads).set({ updatedAt: now() }).where(eq(agentThreads.id, message.threadId)).run()
  })()
  return toMessage({ ...message, ...write }, true, workspaceId)
}

export interface MessageRemoved {
  removed: AgentMessageView
  /** What is left waiting in that conversation, so the screen need not ask again. */
  stillQueued: number
  note: string
}

export function removeMessage(
  id: string,
  workspaceId: string,
  remover: Actor,
  /** Who is asking: a comment in a conversation it may not read is refused as one that is not there. */
  reader?: AMessageReader,
): MessageRemoved {
  const { message, thread } = messageInWorkspace(id, workspaceId, reader)
  refuseIfSent(message)
  refuseIfAnotherWriter(message, remover, 'remove')
  const view = toMessage(message, true, workspaceId)
  db.delete(agentMessages).where(eq(agentMessages.id, id)).run()
  db.update(agentThreads).set({ updatedAt: now() }).where(eq(agentThreads.id, thread.id)).run()
  const stillQueued = messagesOf(thread.id).filter((m) => m.state === 'queued').length
  return {
    removed: view,
    stillQueued,
    note:
      `That comment is gone and nothing was sent. ${stillQueued === 0 ? 'Nothing is left waiting in' : `${String(stillQueued)} comment${stillQueued === 1 ? ' is' : 's are'} still waiting in`} ` +
      `"${thread.title}".`,
  }
}

// ============================================================================ marks

export interface Mark {
  /**
   * A key for the thing, the same on every message about it, so a page can look one up.
   *
   * IT IS THE SAME STRING AN ELEMENT CARRIES AS `data-target`, built by `targetKey` in
   * src/shared/targets.ts. One spelling of a key in this product, used by both sides. Two spellings
   * is the defect this repository keeps finding, and the failure is silent: every mark simply stops
   * being drawn.
   */
  key: string
  /** What it points at. A quoted span is marked on the thing the words are in. */
  target: Target
  /** How many comments are waiting on it. */
  waiting: number
  /** The conversations they are in. */
  threads: { id: string; title: string; mode: ThreadMode }[]
  /**
   * THE WORDS ANY OF THOSE COMMENTS QUOTED, AND WHERE THEY WERE, so a page can highlight them.
   *
   * It is the whole span and not only the quote, and that is what a light highlight on the exact
   * words needs: which stored string they came out of and where in it they started. A page finds
   * the drawn run holding that stretch of that string and marks the characters. It never searches
   * for the words, because the same words can appear twice in one paragraph.
   *
   * `quotes` used to be here beside this, holding the same strings a second time. One of the two
   * would have gone stale — the defect CLAUDE.md names — so there is one, and a caller wanting the
   * words alone reads `spans[n].quote`.
   */
  spans: NamedSpan[]
}

export interface MarksReply {
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<MarksBucket>[]

  marks: Mark[]
  leftOut: number
  /** What this answer covers, said out loud, so an empty list is an answer rather than a shrug. */
  covers: string
  /**
   * EVERY COMMENT IN THIS PROJECT WHOSE WORDS HAVE GONE TO SOMEBODY, by record id.
   *
   * IT IS HERE BECAUSE THE BROWSER CANNOT ASK THE STORE ITSELF. Where a comment has got to is
   * `agent_messages.state`, written by `moveMessageTo` in src/server/lib/dispatch.ts and by nothing
   * else. The browser draws a comment on the thing it was left on, and it has to know which have
   * gone; until 25 August 2026 it read `annotation.data.state` instead, which is a second store the
   * schema says nothing reads. So the one store answers, once per project, in the request the page
   * was already making.
   *
   * IT IS NOT THE SAME QUESTION AS `marks`. A mark is a comment still WAITING; this is the comments
   * that are not. `commentsGoneOut` in dispatch.ts is the one function that answers it, and
   * `hasGoneOut` — the gate that fixes somebody's words — is the same question about one comment.
   */
  goneOut: string[]
}

/**
 * Which objects have a comment waiting, in one request.
 *
 * The browser draws a mark on every object that has one, and it must not ask once per object. This
 * reads the OPEN threads of one project and the messages still queued in them — nothing else can
 * have a comment waiting — so it is two indexed reads and no scan of the record table.
 *
 * IT DOES NOT SAY WHETHER THE OBJECT IS STILL THERE. That is `readContext`, it costs a read per
 * object, and a mark is drawn on something the page is already showing.
 *
 * IT ALSO CARRIES WHICH COMMENTS HAVE GONE, and that is a different question from a mark rather
 * than a second answer to the same one — see `goneOut` on `MarksReply`. It is read whether or not
 * any conversation is open, because closing a conversation does not un-send what went out of it.
 */
/**
 * WHAT THIS ANSWER COVERS, COUNTED OFF THE ANSWER ITSELF.
 *
 * THE SENTENCE AND THE DATA IN ONE REPLY MUST NOT DISAGREE, and until 25 August 2026 they did. The
 * early way out said *"No conversation about "panelx" is open, so nothing has a comment waiting on
 * it."* — a claim about the whole project — in the same reply whose `goneOut` and whose page drew
 * six comments. It was false as written, and it was false because it was a fixed string: nothing
 * about it was read off what was being sent.
 *
 * SO EVERY NUMBER IN IT IS TAKEN FROM THE ARRAYS IT SHIPS BESIDE. `marks`, `leftOut` and `goneOut`
 * are the only things it counts, and it claims nothing about anything else — in particular it does
 * NOT say whether the project has comments waiting, because this reply does not know that. A
 * comment waiting outside an open conversation is drawn by the browser from the record list, which
 * is a different read.
 *
 * `tests/dispatch-store.test.ts` takes the numbers back out of the sentence and holds them against
 * the arrays in the same reply, so making the two disagree turns it red.
 */
function whatThisCovers(opts: {
  workspaceId: string
  conversations: number
  marks: readonly Mark[]
  leftOut: number
  goneOut: readonly string[]
}): string {
  const waiting = opts.marks.reduce((n, mark) => n + mark.waiting, 0)
  const gone = `${String(opts.goneOut.length)} already went out, named in "goneOut".`
  if (opts.conversations === 0) {
    return (
      `No conversation about "${opts.workspaceId}" is open, so nothing is queued in one and this list is empty. ` +
      `That is all an empty list here means — it is not a count of what this project has waiting. ${gone}`
    )
  }
  const grouped =
    `${String(waiting)} still queued in ${String(opts.conversations)} open ` +
    `conversation${opts.conversations === 1 ? '' : 's'} about "${opts.workspaceId}", grouped by what they point at ` +
    `into ${String(opts.marks.length)} mark${opts.marks.length === 1 ? '' : 's'}` +
    (opts.leftOut === 0
      ? '.'
      : `. ${leftOutWords(MARKS_BUCKET_WORDS.row_limit, opts.leftOut)}`)
  return (
    `${grouped} A comment that has been sent is not one waiting, so it is not here, and neither is a comment that ` +
    `points at nothing in particular. This says nothing about whether the object is still there — read the ` +
    `conversation for that. ${gone}`
  )
}

export function marksIn(
  workspaceId: string,
  /** Who is asking: only the conversations it may read are marked. */
  reader?: AMessageReader,
): MarksReply {
  // A COMMENT THAT IS A MESSAGE THE READER MAY NOT READ is not named among the ones gone out either.
  const everyGoneOut = commentsGoneOut(justThisProject(workspaceId))
  const hiddenGoneOut = reader === undefined ? new Set<string>() : theMessagesHiddenFrom(reader, everyGoneOut)
  const goneOut = hiddenGoneOut.size === 0 ? everyGoneOut : everyGoneOut.filter((id) => !hiddenGoneOut.has(id))
  const open = db
    .select()
    .from(agentThreads)
    .where(and(eq(agentThreads.workspaceId, workspaceId), eq(agentThreads.state, 'open')))
    .all()
  const mayRead = reader === undefined ? null : theThreadsThisReaderMayRead(reader, open)
  const threads = mayRead === null ? open : open.filter((one) => mayRead.has(one.id))
  if (threads.length === 0) {
    const subtraction: LeftOutCounts = { candidates: 0, carried: 0, leftOut: 0, shortened: 0 }
    checkSubtraction('marksIn', subtraction, [])
    return {
      marks: [],
      subtraction,
      leftOutGroups: [],
      leftOut: 0,
      covers: whatThisCovers({ workspaceId, conversations: 0, marks: [], leftOut: 0, goneOut }),
      goneOut,
    }
  }

  const byThread = new Map(threads.map((t) => [t.id, t]))
  // IN PIECES (src/server/db/in-pieces.ts): a conversation stays open until somebody closes it, so they
  // pile up. The statement never had an ORDER BY, so the pieces promise no order the one read did not.
  const rows = readInPieces(
    threads.map((t) => t.id),
    (piece) =>
      db
        .select()
        .from(agentMessages)
        .where(and(inArray(agentMessages.threadId, piece), eq(agentMessages.state, 'queued')))
        .all(),
  )

  const marks = new Map<string, Mark>()
  // ONE MARK FOR EACH QUOTE, so a waiting message carrying three comments of a review marks the
  // three places they were left on, as three single messages did. `quotesOfARow` is the one reader.
  for (const [row, context] of rows.flatMap((one) => quotesOfARow(one).map((quote) => [one, quote] as const))) {
    const key = targetKey(context.target)
    const thread = byThread.get(row.threadId)
    const mark = marks.get(key) ?? { key, target: context.target, waiting: 0, threads: [], spans: [] }
    mark.waiting += 1
    if (thread !== undefined && !mark.threads.some((t) => t.id === thread.id)) {
      mark.threads.push({ id: thread.id, title: thread.title, mode: thread.mode as ThreadMode })
    }
    // THE WORDS THE COMMENT NAMES, WHEREVER THEY ARE WRITTEN DOWN. Reading `context.span` here
    // dropped the span of every comment written since a context started carrying a place, and a
    // mark with no span is a mark that lights nothing.
    const words = spanNamedBy(context)
    if (words !== null) mark.spans.push(words)
    marks.set(key, mark)
  }

  const all = [...marks.values()].sort((a, b) => b.waiting - a.waiting || a.key.localeCompare(b.key))
  const shown = all.slice(0, MAX_ROWS)
  const leftOutGroups: LeftOutGroup<MarksBucket>[] = [{
    cause: 'budget', bucket: 'row_limit', count: all.length - shown.length,
    ids: all.slice(MAX_ROWS).map((mark) => mark.key),
  }]
  const subtraction: LeftOutCounts = { candidates: all.length, carried: shown.length, leftOut: all.length - shown.length, shortened: 0 }
  checkSubtraction('marksIn', subtraction, leftOutGroups)
  const leftOut = subtraction.leftOut
  return {
    marks: shown,
    subtraction,
    leftOutGroups,
    leftOut,
    // COUNTED OFF `shown`, NOT OFF `all`. The sentence describes the reply, and a mark left out of
    // the reply is not in it — `leftOut` is the separate count that says how many those are.
    covers: whatThisCovers({ workspaceId, conversations: threads.length, marks: shown, leftOut, goneOut }),
    goneOut,
  }
}

// ============================================================================ dispatch

/** One recipient's share of a review: who it is for, and every comment addressed to them. */
interface Group {
  key: string
  kind: 'session' | 'new' | 'agent'
  /** The durable identity this group goes to, or null because it is a run or a new agent. */
  agentId: string | null
  sessionId: string | null
  sessionTitle: string | null
  why: string | null
  said: string | null
  runtime: string
  externalId: string | null
  messages: MessageRow[]
}

/**
 * ONE COMMENT THAT STAYED BEHIND, AND THE SENTENCE SAYING WHY.
 *
 * It is still queued, still editable and still marked on the page it is about. `why` is the same
 * sentence the comment itself carries as its delivery reading, so the screen and this list cannot
 * come to say different things about one comment.
 */
export interface Held {
  messageId: string
  /** Enough of what it says to find it on the screen. */
  quotedBody: string
  why: string
  /** `why` as a code, for a page to say in its own language (src/shared/send-plan-words.ts). */
  sentence: SendPlanSentence
}

/**
 * ENOUGH OF WHAT SOMEBODY WROTE TO FIND IT ON THE SCREEN, and never enough to read instead of it.
 *
 * Exported because sending a review quotes a comment the same way in the list of the ones it could
 * not hand over, and two rules about how a person's words are shortened would show the same comment
 * cut in two different places on one screen. The ellipsis is the mark that it is cut.
 */
export function enoughOfIt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length <= 70 ? flat : `${flat.slice(0, 70)}…`
}

/** What a message shows of itself in a refusal: enough to find it on the screen. */
function shortBody(row: MessageRow): string {
  return enoughOfIt(row.body)
}

/** Every comment that stayed behind, as a list a person can read line by line. */
function heldLines(held: readonly Held[]): string {
  return held.map((one) => `  · "${one.quotedBody}" (${one.messageId}) — ${one.why}`).join('\n')
}

/**
 * How the send's refusal begins when a comment's agent has no registry row here. Its three refusals of such a comment
 * begin with these words, and a test reads them from here.
 */
export const A_DISPATCH_WITH_NO_REGISTERED_AGENT = 'This dispatch has no registered agent'

/** The opening of the refusal for a comment sent a second time. Exported so that a test reads it here (round 130). */
export const A_COMMENT_ALREADY_SENT =
  'That comment has already been sent, so its words were not written into a second conversation.'

/** The actor id the agent serving this run writes under. */
function actorIdFor(group: Group): string {
  const registered = group.agentId === null ? null : agentForRecord(group.agentId)
  if (registered !== null) return registered.handle
  throw new PanelError(`${A_DISPATCH_WITH_NO_REGISTERED_AGENT} to hold its key. Nothing was sent.`, 409)
}

/**
 * THE REQUEST, WRITTEN ONCE: what the worker was actually given.
 *
 * Written at dispatch and never rewritten, so an answer can be read against the question that
 * produced it. Rewriting it would destroy the only record of what was asked.
 *
 * **IT CARRIES IDS AND A SENTENCE, NOT CONTENT.** The agent reads Mole Office over the API — that is the
 * boundary, and it is what makes a worker on another machine the same case as one here. Inlining
 * every record would also be a copy of the record taken at dispatch, which is stale by the time the
 * agent reads it and would be believed anyway.
 *
 * The shape is what `tools/agent-worker.mjs` reads: `workspaceId`, `actorId`, `thread.mode`, and a
 * list of messages each with its `intent`, `body`, `context` and `contextSaid`.
 */
function assembleRequest(thread: ThreadRow, group: Group) {
  const workspace = getWorkspace(thread.workspaceId)
  const changed: string[] = []

  const messages = group.messages.map((row) => {
    const context = contextOf(row)
    const reading = context === null ? null : readContext(context)
    if (reading !== null && reading.state !== 'there') changed.push(`· ${reading.says}`)
    // A MESSAGE CARRYING SEVERAL COMMENTS OF A SENT REVIEW has no context of its own. Each comment
    // it carries has its quote, numbered as its words are numbered in `body`, and each quote is
    // read now the way a context is.
    const quotes =
      row.carries === null
        ? null
        : carriedComments(row).map((one) => {
            const said = one.quote === null ? null : readContext(one.quote)
            if (said !== null && said.state !== 'there') changed.push(`· ${String(one.number)}: ${said.says}`)
            return {
              number: one.number,
              commentId: one.commentId,
              context: one.quote,
              contextSaid: said === null ? null : said.about,
              contextState: said === null ? null : said.state,
            }
          })
    return {
      id: row.id,
      intent: row.intent,
      body: row.body,
      context,
      contextSaid: reading === null ? null : reading.about,
      contextState: reading === null ? null : reading.state,
      ...(quotes === null ? {} : { quotes }),
      writtenAt: row.createdAt,
      writtenBy: row.createdBy,
    }
  })

  const note = [
    `This is about the project "${thread.workspaceId}"${workspace === null ? '' : ` (${workspace.title})`}. Read ` +
      `everything it names through the Mole Office API, with x-mole-office-workspace: ${thread.workspaceId} on every ` +
      `request. The ids above are the handle; nothing here is a copy of a record, because a copy taken now is ` +
      `already old by the time you read it.`,
    group.kind === 'session'
      ? `You are being picked up again, not started fresh. What you were working on is the run "${group.sessionTitle ?? group.sessionId ?? ''}".` +
        (group.why === null ? '' : ` Mole Office chose you because: ${group.why}`)
      : group.kind === 'agent'
        ? `This is addressed to the agent "${group.sessionTitle ?? ''}", which is a durable identity rather than ` +
          `any one run. Whether you have seen this work before is not something Mole Office knows; its inbox and its ` +
          `stopping points are where that is written down.` +
          (group.why === null ? '' : ` Mole Office chose you because: ${group.why}`)
        : 'This is a new agent. Nothing here assumes you have seen this work before.',
    changed.length === 0
      ? null
      : `Some of what these comments point at has changed since they were written. Mole Office has not moved any ` +
        `comment onto different words:\n${changed.join('\n')}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n\n')

  return {
    workspaceId: thread.workspaceId,
    workspaceTitle: workspace === null ? null : workspace.title,
    actorId: actorIdFor(group),
    agentId: group.agentId,
    thread: { id: thread.id, title: thread.title, mode: thread.mode },
    recipient: {
      kind: group.kind,
      sessionRecordId: group.sessionId,
      sessionTitle: group.sessionTitle,
      said: group.said,
      why: group.why,
    },
    resume: group.externalId === null ? null : { runtime: group.runtime, externalId: group.externalId },
    messages,
    contextNote: note,
    assembledAt: now(),
  }
}

/** A run's request as it is stored in agent_runs.request: the request and the id of the key the run was given. */
export type ARunRequest = ReturnType<typeof assembleRequest> & { agentKeyId: string }

export interface DispatchOutcome {
  thread: AgentThreadView
  runs: AgentRunView[]
  /** How many comments this act carried out of the review. */
  sent: number
  /**
   * HOW MANY OF THOSE HAD ALREADY REACHED THEIR AGENT BEFORE THIS PRESS.
   *
   * Zero is the ordinary answer. It is not zero when something took a comment before its review was
   * sent — a live session answering as that agent, or a second press of Send. The review really did
   * carry them, so `sent` counts them; this says how many of that number are not news, and the
   * sentence in `note` says the same thing in words. Problem `p9enuTYIC-S6`: without it the reply
   * said two comments had just gone and nobody had read them, about comments answered minutes
   * earlier in the conversation they were looking at.
   */
  alreadyGone: number
  /**
   * Every comment that did NOT go, and why, one line each.
   *
   * Empty when the whole thread went. It is a field rather than a sentence inside `note` because a
   * screen has to be able to put each line beside the comment it is about.
   */
  held: Held[]
  /** What happened, in the words the screen shows: this review went to three agents, and so on. */
  note: string
  /** What `note` says, as facts, for a page to say in its own language (`sayTheDispatch`, src/shared/send-plan-words.ts). */
  told: DispatchFacts
  /**
   * EACH RECIPIENT, BY ITS AGENT RECORD, AND THE MESSAGES OF THIS CONVERSATION THAT WENT TO IT, in the order written.
   * One entry per recipient, in the order of `runs` when runs are written. A review's send reads this to write each
   * recipient its one message in the message pool (problem eCrK1atZOrvA), so the grouping stays here.
   */
  recipients: { agentId: string; messageIds: string[] }[]
}

/**
 * SEND, OR FINISH REVIEW. **The only place a run is ever created.**
 *
 * One run per recipient, every one of them naming this thread, all in one transaction. A review's send asks for no
 * run at all (`runs` below) and is handed back `recipients` instead.
 *
 * ---------------------------------------------------------------------------------------
 * IT SENDS WHAT IT CAN AND SAYS WHAT IT COULD NOT
 * ---------------------------------------------------------------------------------------
 *
 * Until 19 August 2026 one comment nobody could route refused the whole thread, so a review with
 * four good comments and one bad address sent nothing. The reasoning written here was that sending
 * the routable half and keeping the rest would leave the person working out which of their comments
 * had gone. That was a real objection and it is answered rather than ignored:
 *
 *   · every comment that stayed behind is named in `held`, in the reply, with the sentence saying
 *     why — the same sentence the comment itself carries, so the two cannot disagree;
 *   · it is still `queued`, so it is still editable, still removable, and still marked on the page
 *     it is about;
 *   · the thread is only moved to `dispatched` when NOTHING is left waiting in it, so a review that
 *     held something back can still be added to and can be sent again;
 *   · and pressing Send again after one correction sends what stayed.
 *
 * NOTHING AT ALL IS STILL A REFUSAL. When not one comment can be sent there is no half to send, so
 * this answers 409 and writes nothing, naming every comment and its reason — which is what the old
 * behaviour did for every case and what this keeps for the case where it is the honest answer.
 */
export function dispatchThread(
  threadId: string, workspaceId: string, actor?: Actor,
  /** The new-agent press carries these original comments with their copies. */
  copiesOf: ReadonlyMap<string, string> = new Map(),
  /** The new-agent press names the agent the new one was branched from, and the new agent's record keeps it. */
  branchedFrom: { agent: string; handle: string } | null = null,
  /**
   * WHETHER A RUN IS WRITTEN FOR EACH RECIPIENT. A review's send writes none, for problem
   * eCrK1atZOrvA. It gives each recipient one message in the message pool, which the
   * agent's waiter and the message worker read, and a run as well would hand the same comments over a
   * second time. Everything else here is the same:
   * the grouping, what is held back, the new agent, the stamps on the messages and the conversation's state.
   */
  runs: 'one for each recipient' | 'none' = 'one for each recipient',
  /** A recovery may dispatch only the exact queued messages it has proved belong to the review. */
  onlyMessages: ReadonlySet<string> | null = null,
): DispatchOutcome {
  const thread = threadInWorkspace(threadId, workspaceId)
  // The same rule as writing a comment, and it has to be: a review that may not take another
  // comment may not be sent again either, and a direct conversation that may take one may.
  refuseIfClosedToMore(thread)

  const allQueued = messagesOf(threadId).filter((row) => row.state === 'queued')
  const queued = allQueued.filter((row) => onlyMessages === null || onlyMessages.has(row.id))
  if (queued.length === 0) {
    throw new PanelError(
      `There is nothing waiting in "${thread.title}", so nothing was sent. Write a comment first.`,
      409,
    )
  }

  // ---- work out who each comment is for. ONE READING, the one the comment itself carries.
  const groups = new Map<string, Group>()
  const held: Held[] = []

  for (const row of queued) {
    const delivery = deliveryOf(row, workspaceId)
    if (!delivery.canSend) {
      held.push({ messageId: row.id, quotedBody: shortBody(row), why: delivery.says, sentence: delivery.sentence })
      continue
    }

    const key = recipientKeyOf(delivery).key
    const group = groups.get(key) ?? {
      key,
      kind: delivery.kind,
      // WHICHEVER KIND IT IS, THE DURABLE IDENTITY IF THERE IS ONE. A run has one now — its door
      // minted it when the run was addressed — so the run row below and the message both name it,
      // instead of leaving `agent_id` NULL for a migration to bind.
      agentId: delivery.kind === 'new' ? null : delivery.agentId,
      sessionId: delivery.sessionId,
      sessionTitle: delivery.sessionTitle,
      why: row.recipientWhy,
      said: row.recipientSaid,
      runtime: delivery.runtime,
      externalId: delivery.externalId,
      messages: [],
    }
    group.messages.push(row)
    groups.set(key, group)
  }

  if (groups.size === 0) {
    // NOT ONE COMMENT COULD GO, SO THERE IS NO HALF TO SEND. This is the one case that still writes
    // nothing, and the opening sentence names no reason: there are five of them and only the line
    // under each comment knows which one it hit. It used to open "1 of the 1 comment here does not
    // say who it is for", which is one of the five, and a person met it on a comment that named its
    // agent perfectly well and could not be picked up again.
    throw new PanelError(
      `Nothing was sent. Not one of the ${String(queued.length)} comment${queued.length === 1 ? '' : 's'} waiting ` +
        `here can be sent as it stands, and the line under each one says why. Everything is still waiting and ` +
        `nothing is lost:\n` +
        heldLines(held),
      409,
    )
  }

  // ---- one run per recipient, or none, in one transaction.
  const stamp = now()
  const order = [...groups.values()]
  const proof = proofForStartingANewAgent(actor)
  // Validate the groups already addressed before registering the new one.
  for (const group of order) if (group.kind !== 'new') assembleRequest(thread, group)
  const rows: RunRow[] = []
  const recipients: DispatchOutcome['recipients'] = []
  withDispatchedAgentKeys(() => {
    for (const group of order) {
      const id = anOfficeId()
      if (group.kind === 'new' && actor !== undefined) {
        // The run id supplies a lowercase handle. Check every registry row's id and handle for a collision.
        let handle = `run-${id.toLowerCase().replace(/_/g, '-')}-agent`
        while (sqlite.prepare('SELECT 1 FROM agents WHERE id = ? OR handle = ?').get(handle, handle)) {
          handle = `run-${anOfficeId().toLowerCase().replace(/_/g, '-')}-agent`
        }
        const agent = throughTheCardDoor(() => createRecord({
          workspaceId, kind: 'agent', title: handle,
          data: { handle, state: 'active', runtime: group.runtime, startedBy: { kind: 'person', id: THE_PERSON },
            role: 'worker', cardChosenBy: { how: 'the-rule' }, ...(branchedFrom === null ? {} : { branchedFrom }) },
          actor,
        }))
        const registered = agentForRecord(agent.id)
        if (registered === null) throw new PanelError('The new agent has no registry row.', 500)
        group.agentId = agent.id
        writeTheCardMessageToOne({ to: { kind: 'agent', id: registered.id }, workspaceId, role: 'worker', actor })
      }
      const agentId = group.agentId
      const registered = agentId === null ? null : agentForRecord(agentId)
      if (registered === null && runs === 'none') throw new PanelError(`${A_DISPATCH_WITH_NO_REGISTERED_AGENT} to hand its messages to. Nothing was sent.`, 409)
      if (agentId === null || registered === null) throw new PanelError(`${A_DISPATCH_WITH_NO_REGISTERED_AGENT} to hold its key. Nothing was sent.`, 409)
      recipients.push({ agentId, messageIds: group.messages.map((row) => row.id) })
      if (runs === 'none') continue
      const agentKeyId = keepADispatchedAgentsKey(id, registered.id, proof)
      rows.push({
        id, threadId, runtime: group.runtime, state: 'queued', recipientSessionId: group.sessionId,
        resumeExternalId: group.externalId, claimedBy: null, claimedAt: null, claimedFromMachine: null,
        agentId: group.agentId,
        request: JSON.stringify({ ...assembleRequest(thread, group), agentKeyId }),
        result: null, error: null, startedAt: null, endedAt: null, createdAt: stamp,
      })
    }
    // THE ONLY insert(agentRuns) IN THIS REPOSITORY. tests/one-run-door.test.ts walks src/ and
    // fails if a second one appears, because "nothing was sent before Finish review" has to be a
    // property of the code rather than a promise somebody made.
    for (const row of rows) db.insert(agentRuns).values(row).run()
    // ONLY THE COMMENTS THAT WENT ARE MARKED SENT. One held back is still queued, which is what
    // keeps it editable, keeps it marked on its page, and lets a second press send it.
    //
    // ONE AT A TIME, THROUGH THE ONE WRITER. It used to be a single `update ... where id in (…)`,
    // which is a second writer of the column: it could not check that each word was moving forward
    // and it wrote no `sent_at`. `moveMessageTo` writes `state`, `state_at` and `sent_at` together.
    for (const group of order) {
      for (const message of group.messages) {
        // THE DURABLE IDENTITY IS WRITTEN HERE AND NOWHERE ELSE, by the one writer, in the same
        // statement as the word and the two stamps. It is written from what `deliveryOf` resolved
        // — a live agent record in this project — and never from what the caller sent, so the
        // column the inbox query reads cannot name something that was never checked.
        const original = copiesOf.get(message.id)
        const carried = original === undefined ? [message.id] : [message.id, original]
        for (const id of carried) moveMessageTo(id, 'sent', { recipientAgentId: group.agentId })
      }
    }
    db.update(agentThreads)
      .set({ state: held.length === 0 && queued.length === allQueued.length ? 'dispatched' : thread.state, updatedAt: stamp })
      .where(eq(agentThreads.id, threadId))
      .run()
  })

  /**
   * WHAT THIS ACT REALLY HANDED OVER, COUNTED, RATHER THAN WHAT IT WAS ASKED ABOUT.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT WAS WRONG, MEASURED 5 SEPTEMBER 2026
   * ---------------------------------------------------------------------------------------
   *
   * The sentence below was built from the comments in each group and said "Sent: 1 comment … Nobody
   * has picked it up yet" whatever the delivery rows already said. A comment can reach its agent
   * before its review is sent — a live session answering as that agent takes it, and until this
   * morning the message worker took it too — so the reply told them two comments had just gone to an
   * agent and that nobody had read them, about comments that went minutes earlier and had already
   * been answered in the conversation they were looking at. Nothing moved: the delivery rows were the
   * same before and after, and the conversation held 41 messages either side of the press. On the
   * same screen, three lines above, the pane said of one of them *"This comment has already gone to
   * somebody"*. Problem `p9enuTYIC-S6`, and it is invariant 1 of USER.md.
   *
   * ---------------------------------------------------------------------------------------
   * THE DELIVERY ROWS ARE WHAT SAY IT, and they are read BEFORE the write above
   * ---------------------------------------------------------------------------------------
   *
   * A comment whose delivery row has moved past `queued` has been handed to somebody. The write
   * above moves `agent_messages.state` and touches no delivery row, so these rows say what was true
   * when the press happened. `hasGoneOut` is not the reader here: it answers whether a REVIEW
   * carried the words out, which is exactly what this act is doing right now.
   *
   * `alreadyHandedOver` IS THE SAME READER THE ORGANISE SCREEN USES. That screen worked the same
   * question out its own way and the two disagreed — problem `-4GypldN_XMS`.
   */
  //
  // COUNTED IN COMMENTS, NOT IN MESSAGES. A message a sent review wrote for one recipient can carry
  // several comments, and `carriedComments` says which. A message nobody
  // wrote from a comment counts as one comment, which is what it was before messages could carry
  // several: somebody's words, typed into the conversation.
  const commentsOf = (row: MessageRow): string[] => {
    const carried = carriedComments(row).map((one) => one.commentId)
    return carried.length === 0 ? [`message:${row.id}`] : carried
  }
  const handed = alreadyHandedOver(
    order.flatMap((group) => group.messages.flatMap((row) => carriedComments(row).map((one) => one.commentId))),
  )
  const alreadyGone = new Set(
    order.flatMap((group) => group.messages.flatMap(commentsOf)).filter((id) => handed.has(id)),
  )
  const goingComments = order.flatMap((group) => group.messages.flatMap(commentsOf))

  // WHO GOT HOW MANY NEW COMMENTS, in the order the groups were written; a group whose comments had all gone already
  // is left out of the list, and still counted in `agents`.
  const shares = order
    .map((group) => ({
      to: group.kind === 'new' ? ({ newAgent: true } as const) : { run: group.sessionTitle ?? group.sessionId ?? '' },
      comments: group.messages.flatMap(commentsOf).filter((id) => !alreadyGone.has(id)).length,
    }))
    .filter((share) => share.comments > 0)

  /**
   * SAID OF THE ONES THAT HAD ALREADY GONE, plainly, rather than counted in with the rest (`sayTheDispatch` says it).
   *
   * They are still marked sent by the write above — the review really did carry them, and a review
   * that said it held one back would be wrong about its own membership. What changes is only what
   * this sentence claims about them.
   */
  const told: DispatchFacts = {
    total: goingComments.length,
    alreadyGone: alreadyGone.size,
    agents: order.length,
    shares,
    held: held.map((one) => ({ quotedBody: one.quotedBody, messageId: one.messageId, sentence: one.sentence })),
  }

  return {
    thread: toThread({ ...thread, state: held.length === 0 ? 'dispatched' : thread.state, updatedAt: stamp }),
    runs: rows.map((row) => toRun(row, thread)),
    recipients,
    sent: goingComments.length,
    alreadyGone: alreadyGone.size,
    held,
    // THE ENGLISH FROM THE ONE COMPOSER the review panel also says in the page's language, so the two cannot drift.
    note: sayTheDispatch(told),
    told,
  }
}

/** A run needs a proved press before the review writes messages or dispatch makes a key. */
export function proofForStartingANewAgent(actor: Actor | undefined) {
  const proof = actor === undefined ? 'no-key' : howThisPressProvesTheKeyItMakes(actor)
  if (actor === undefined ||
    !(thePersonIsProved(actor) || actor.theOwnersAuthority?.holds === true || aRaiseCarriesIt(actor)) ||
    !aKeyMadeThisWayIsProved(proof)) {
    throw new PanelError(actor?.type === 'human' && proof === 'no-key'
      ? 'Nothing was sent. This request did not prove it comes from the person. If you are using a browser, pair it first on the Pairing page (#/pairing).'
      : 'Nothing was sent. Starting an agent run needs a key that proves you may act for the owner.', 403)
  }
  return proof
}

// ============================================================================ runs

export interface RunListReply {
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<RunListBucket>[]

  runs: AgentRunView[]
  counts: Record<string, number>
  leftOut: number
  note: string
}

/**
 * What a worker may pick up.
 *
 * **IT ANSWERS ABOUT EVERY PROJECT AND TAKES NO WORKSPACE HEADER**, and that is the same decision
 * `/api/work` and the whole planning layer took, for the same kind of reason: a worker serves a
 * MACHINE, not a project, and it has no way of knowing which projects exist. Every row says which
 * project its thread is about, so nothing here hides where a run came from, and it offers no filter
 * by project — it answers about all of them or not at all.
 *
 * It does NOT carry the assembled request. That comes back from the claim, to the worker that took
 * it, so the queue is cheap to poll and reading it is not the same act as taking the work.
 */
export function listRuns(opts: { state?: RunState } = {}): RunListReply {
  const rows =
    opts.state === undefined
      ? db.select().from(agentRuns).orderBy(asc(agentRuns.createdAt)).all()
      : db.select().from(agentRuns).where(eq(agentRuns.state, opts.state)).orderBy(asc(agentRuns.createdAt)).all()

  const counts: Record<string, number> = {}
  for (const state of RUN_STATES) counts[state] = 0
  for (const row of db.select({ state: agentRuns.state }).from(agentRuns).all()) {
    counts[row.state] = (counts[row.state] ?? 0) + 1
  }

  const threads = new Map(db.select().from(agentThreads).all().map((t) => [t.id, t]))
  const runs = rows.slice(0, MAX_ROWS).map((row) => {
    const thread = threads.get(row.threadId)
    if (thread === undefined) {
      throw new PanelError(`Run ${row.id} names a conversation that is not there, ${row.threadId}.`, 500)
    }
    return toRun(row, thread)
  })

  const leftOutGroups: LeftOutGroup<RunListBucket>[] = [{
    cause: 'budget', bucket: 'row_limit', count: rows.length - runs.length,
    ids: rows.slice(MAX_ROWS).map((row) => row.id),
  }]
  const subtraction: LeftOutCounts = { candidates: rows.length, carried: runs.length, leftOut: rows.length - runs.length, shortened: 0 }
  checkSubtraction('listRuns', subtraction, leftOutGroups)
  return {
    runs,
    subtraction,
    leftOutGroups,
    counts,
    leftOut: subtraction.leftOut,
    note:
      `Runs across every project — a worker serves this machine and not one project, so this takes no project ` +
      `header and every row says which project its conversation is about. ` +
      (opts.state === undefined ? 'Every state.' : `State "${opts.state}".`) +
      ` A "declined" run is still waiting: a worker looked at it and could not serve it, and another worker may ` +
      `claim it.` +
      (subtraction.leftOut === 0
        ? ''
        : ` ${leftOutWords(RUN_LIST_BUCKET_WORDS.row_limit, subtraction.leftOut)}`),
  }
}

export interface ClaimedRun {
  /** The run, with the assembled request spread onto it: what this worker was actually given. */
  run: Record<string, unknown>
  /** Only the successful claim carries the key; it is never part of the stored prompt. */
  runKey?: string
  note: string
}

/**
 * A worker takes a run and gets the context.
 *
 * **COMPARE AND SET.** The state is checked and written in ONE statement, so two workers racing
 * cannot both get it: the second one changes no rows and is refused by name. Reading the row,
 * deciding, and then writing would leave exactly the window this is here to close.
 *
 * A DECLINED run may be claimed. It is waiting — a worker looked at it and could not serve it —
 * and the next worker may be on the machine that can.
 */
export function claimRun(id: string, worker: string, fromMachine: string | null = null, actor?: Actor): ClaimedRun {
  const waiting = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()
  const keyId = waiting === undefined ? null : dispatchedKeyId(waiting)
  const runKey = keyId === null || (waiting?.state !== 'queued' && waiting?.state !== 'declined')
    ? null : aDispatchedAgentsKey(id, keyId, actor)
  const stamp = now()
  const changed = Number(
    (
      db
        .update(agentRuns)
        // `started_at` is the same moment as `claimed_at` on purpose. Mole Office cannot see the agent's
        // first word; the moment a worker took the run is the only start it observes, and inventing
        // a different one would be a stamp about nothing.
        //
        // A RUN BEING WORKED ON HAS NOT ENDED AND HAS NOT FAILED. The only way into this statement
        // with either of those written is a DECLINED run being taken by the next worker, and until
        // 19 August 2026 both stayed: the run said it ended before it was started, and when it was
        // answered it carried an answer and the previous worker's failure reason at once. `toRun`
        // put both on the wire, so a run's own row said two contradictory things. The decline is
        // over; the reason it gave belonged to the attempt that is over with it.
        // AND WHICH MACHINE TOOK IT. Criterion P23. It is written in the same statement as the
        // claim because it is part of the claim: two statements would leave a window in which a run
        // was taken by somebody at nowhere, and a declined run taken next by a worker on another
        // machine would otherwise keep the first machine's name.
        .set({
          state: 'claimed',
          claimedBy: worker,
          claimedAt: stamp,
          claimedFromMachine: fromMachine,
          startedAt: stamp,
          endedAt: null,
          error: null,
        })
        .where(and(eq(agentRuns.id, id), inArray(agentRuns.state, ['queued', 'declined'])))
        .run() as { changes?: number }
    ).changes ?? 0,
  )

  const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()
  if (row === undefined) throw new PanelError(`No agent run with id ${id}`, 404)

  if (changed === 0) {
    const state = row.state as RunState
    if (state === 'claimed' || state === 'running') {
      throw new PanelError(
        `${row.claimedBy ?? 'Another worker'} has this run already, since ${row.claimedAt ?? 'an unrecorded moment'}. ` +
          `Nothing was taken. One run is one attempt, so two workers may not both serve it.`,
        409,
      )
    }
    throw new PanelError(
      `This run is "${state}" and cannot be taken. ${saysOf(row)}`,
      409,
    )
  }

  const thread = db.select().from(agentThreads).where(eq(agentThreads.id, row.threadId)).get()
  if (thread === undefined) throw new PanelError(`Run ${id} names a conversation that is not there.`, 500)

  let request: Record<string, unknown>
  try {
    request = JSON.parse(row.request) as Record<string, unknown>
  } catch {
    throw new PanelError(
      `Run ${id} stores a request that is not readable JSON, so Mole Office cannot say what this worker was given. ` +
        `Nothing has been reconstructed.`,
      500,
    )
  }

  const view = toRun(
    { ...row, state: 'claimed', claimedBy: worker, claimedAt: stamp, claimedFromMachine: fromMachine, startedAt: stamp },
    thread,
  )
  return {
    run: { ...request, ...view },
    ...(runKey === null ? {} : { runKey }),
    note:
      `You have this run. It was written when the review was finished and it is not rewritten, so it is exactly ` +
      `what was asked. Post the answer, the failure, or a decline to POST /api/agent/runs/${id}/result. ` +
      (fromMachine === null
        ? 'Nobody could tell which machine took it, so the run says so rather than naming one.'
        : `The run records that ${fromMachine} took it, and the conversation says so.`),
  }
}

export interface ResultInput {
  result?: unknown
  error?: string
  /** A worker looked at this and cannot serve it. The run goes back to waiting. */
  declined?: boolean
  /** How long the agent ran, as the worker measured it. Kept with the result it came with. */
  tookMs?: number
}

export interface RunFinished {
  run: AgentRunView
  thread: AgentThreadView
  /**
   * What was written onto the run's session record so that it can be picked up again, or why
   * nothing was. Null when this result was a failure or a decline, and when the run was to a new
   * agent — neither has a session record of Mole Office's to write onto. `note` says the same thing in
   * one sentence either way.
   */
  pickUpAgain: RunStamped | null
  /**
   * The agent's answer, as a message in the conversation, or null because there was none to write.
   *
   * Null on a failure and on a decline, which produced no words, and null on a result that carries
   * no `answer` — `note` says which of those happened. It is never a message Mole Office made up.
   */
  answer: AgentMessageView | null
  note: string
}

/**
 * The answer, the failure, or a decline.
 *
 * A DECLINE IS NOT A FAILURE and it is the honest half of the whole routing idea. A run addressed
 * to an agent whose transcript is not on this worker's machine cannot be served here, and starting
 * a fresh agent that has never heard of the work would be the second engineering rule broken on
 * the path most likely to break it. So `declined` is a state, the run stays waiting, and another
 * worker may claim it.
 *
 * A run that has already ended is refused rather than overwritten: what came back the first time is
 * the record of what happened.
 */
export function finishRun(
  id: string,
  input: ResultInput,
  /**
   * WHERE TO LOOK FOR THE CONVERSATION THIS ANSWER CAME FROM. The real machine, unless a test says
   * otherwise — the route never passes it, so the ordinary path has exactly one behaviour. It is a
   * parameter at all because the alternative is a test that can only pass on a machine with the
   * right transcript in the right home directory, which is a test nobody can run twice.
   */
  env: AdapterEnv = defaultEnv(),
  /** Only the office's process check uses crashed. A posted error remains failed. */
  failureState: 'failed' | 'crashed' = 'failed',
): RunFinished {
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()
  if (row === undefined) throw new PanelError(`No agent run with id ${id}`, 404)

  const state = row.state as RunState
  if (ENDED.includes(state)) {
    throw new PanelError(
      `This run is already "${state}" and nothing was written. ${saysOf(row)} What came back the first time is ` +
        `the record of what happened, so a second answer would overwrite it.`,
      409,
    )
  }

  const declined = input.declined === true
  const stamp = now()
  const write: Partial<RunRow> = { endedAt: stamp }

  if (declined) {
    if (input.error === undefined || input.error.trim() === '') {
      throw new PanelError(
        'A decline has to say why. "This worker cannot serve this run" with no reason leaves the run waiting and ' +
          'nobody able to tell what would serve it.',
      )
    }
    write.state = 'declined'
    write.error = input.error.trim()
  } else if (input.error !== undefined && input.error.trim() !== '') {
    if (input.result !== undefined && input.result !== null) {
      throw new PanelError(
        'Send a result or an error, not both. A run that produced an answer did not fail, and one that failed has ' +
          'no answer to report.',
      )
    }
    write.state = failureState
    write.error = input.error.trim()
  } else if (input.result !== undefined && input.result !== null) {
    write.state = 'finished'
    write.result = JSON.stringify(
      // `tookMs` is the worker's own measurement and is kept beside the result it came with, under
      // a key of its own, so nothing reads it as something the agent said.
      input.tookMs === undefined ? input.result : { ...(input.result as object), tookMs: input.tookMs },
    )
  } else {
    throw new PanelError(
      'Nothing was sent back. A result posts an answer, an error posts a failure, and declined:true with a reason ' +
        'says this worker cannot serve it. An empty body says a run ended and does not say how, which is the one ' +
        'thing this route may not record.',
    )
  }

  const writer = actorOfRun(row)

  const changed = Number(
    (
      db
        .update(agentRuns)
        .set(write)
        .where(and(eq(agentRuns.id, id), eq(agentRuns.state, state)))
        .run() as { changes?: number }
    ).changes ?? 0,
  )
  if (changed === 0) {
    throw new PanelError(
      `This run moved on while the answer was being written — it is no longer "${state}". Nothing was stored.`,
      409,
    )
  }

  const keyId = dispatchedKeyId(row)
  if (!declined && keyId !== null) endADispatchedAgentsKey(id, keyId)
  // A new recipient with a dispatch key was registered for this run. Older unbound runs carry neither.
  // Existing secretaries, supervisors and workers keep their own lifetimes.
  const request = JSON.parse(row.request) as { recipient?: { kind?: string } }
  if (!declined && keyId !== null && request.recipient?.kind === 'new' && row.agentId !== null) {
    const registered = agentForRecord(row.agentId)
    if (registered !== null) retireThisAgent(registered.id, moleOffice(), `Dispatched run ${id} has ended.`)
  }

  // THE WORDS THIS RESULT CARRIES FOR A PERSON, OR NONE. Worked out here because two things below
  // turn on it: whether the questions this run carried are answered, and whether a message is
  // written into the conversation.
  const answerWords = write.state === 'finished' ? answerWordsOf(input.result) : null

  // ONLY WORDS ANSWER A COMMENT. A run that failed or was declined produced nothing, so the
  // comments it carried stay `sent` — they were sent, and nothing has come back. Marking them
  // answered would make a screen show a question as settled by a run that never ran.
  //
  // AND A FINISHED RUN WHOSE RESULT HELD NO WORDS ANSWERED NOTHING EITHER. It put nothing in the
  // conversation, so a person coming back to the thread would have found their question marked
  // settled with nothing to read. Whatever came back is on the run, and `note` says so.
  //
  // THE UPDATE IS HELD TO THIS RUN'S OWN CONVERSATION. `carried` is read from the run's stored
  // request, and nothing reachable over HTTP writes a request for another thread's messages — but
  // naming ids alone would let anything that ever did mark another conversation's comments
  // answered, and the thread is already known here.
  //
  // AND A RUN THAT FAILED SAYS SO ON THE COMMENTS IT CARRIED, which is new. They used to stay
  // `sent`, so an inbox went on showing them as waiting for an agent that had already tried and
  // could not finish, with nothing anywhere saying why. `failed` is one of the six words and
  // `failed_because` carries the run's own sentence. A DECLINE IS NOT A FAILURE and is left alone:
  // the run is still waiting for a worker that can serve it, so the comments still are too.
  //
  // THE UPDATE IS HELD TO THIS RUN'S OWN CONVERSATION. `carried` is read from the run's stored
  // request, and naming ids alone would let anything that ever wrote a request for another thread's
  // messages move them. The thread is already known here, so the ids are intersected with it.
  const inThisThread = new Set(messagesOf(row.threadId).map((m) => m.id))
  const carried = requestMessageIds(row).filter((id) => inThisThread.has(id))
  if (answerWords !== null) {
    moveMessagesForward(carried, 'handled', { handledNote: answerWords.slice(0, 400) })
  } else if (write.state === 'failed' || write.state === 'crashed') {
    moveMessagesForward(carried, 'failed', {
      failedBecause: write.error ?? 'The run failed and said nothing about why.',
    })
  }

  const thread = db.select().from(agentThreads).where(eq(agentThreads.id, row.threadId)).get()
  if (thread === undefined) throw new PanelError(`Run ${id} names a conversation that is not there.`, 500)

  // ---- THE ANSWER IS A MESSAGE IN THE CONVERSATION, so it can be replied to ---------------------
  //
  // Before this, a finished run wrote its answer into `agent_runs.result` and inserted nothing, so
  // the thread read as things a person said and no reply, and replying was impossible because there
  // was nothing to reply to.
  //
  // ONLY WORDS BECOME A MESSAGE. A result is whatever the worker sent and Mole Office validates none of
  // it, so a result carrying no `answer` string adds nothing and `note` says so. Writing a message
  // that said "this run finished" would be Mole Office putting words in an agent's mouth.
  //
  // IT IS WRITTEN EVEN INTO AN ABANDONED CONVERSATION. The person walked away after the question
  // went out; the answer still came back, and dropping it would lose the only copy of what was said
  // in the place a person reads. THAT DOES NOT REOPEN THE CONVERSATION — see the thread state below.
  let answerMessage: AgentMessageView | null = null
  if (answerWords !== null) {
    const said: MessageRow = {
      id: anOfficeId(),
      threadId: row.threadId,
      position: nextPosition(row.threadId),
      role: 'agent',
      // WHAT AN AGENT MEANT BY ANSWERING IS NOT ONE OF THE FIVE WORDS `intent` HAS, and all five are
      // things a person wants done. The column cannot be null and a sixth word would have to be
      // added in a file this change may not touch, so the nearest of the five is stored and `runId`
      // is what a reader should branch on. This is a known wrong label on a screen that prints the
      // intent of every message, and it is reported with this change rather than left to be found.
      intent: 'discuss',
      body: answerWords,
      context: null,
      // NOT `queued`: a queued message is one waiting to be sent, and would be dispatched to
      // somebody, counted as waiting on the thread, marked on the page it is about, and editable.
      // An answer is none of those. `sent` is the word this vocabulary has for "out, and immutable".
      //
      // AND THE WORD BRINGS ITS MOMENT WITH IT. `sent` means Mole Office durably accepted these words,
      // and `sent_at` is when — the same moment the result came back, which is `stamp` below. The
      // two are one fact and `theMomentsOfAMessageWrittenAt` in ./dispatch.ts is where it is
      // decided; this used to write the word here and leave the moment NULL, which made a row no
      // later reader could date and stopped the next server start dead.
      ...theMomentsOfAMessageWrittenAt('sent', stamp),
      recipientKind: null,
      recipientSessionId: null,
      recipientSaid: null,
      recipientWhy: null,
    // EIGHT OF THE TEN COLUMNS THE DISPATCH LEDGER AND DURABLE AGENT IDENTITY ADDED. NULL here is
    // "nobody has said", which is what they hold: no message that exists today was written to
    // coordinate an overlap, nothing has resolved a durable identity, and no worker has taken one.
    // The waves that build those write them. THE OTHER TWO — `state_at` and `sent_at` — are written
    // by the spread above, because this row is born past `queued`.
    recipientAgentId: null,
    takenByAgentId: null,
    takenAt: null,
    failedBecause: null,
    handledNote: null,
    handledBySession: null,
    writtenByAgentId: null,
    coordination: null,
      // NO PROOF IS CLAIMED FOR A RUN'S ANSWER. `finishRun` is handed no actor: the words are the
      // run's, and the writer is read off the run's stored request. Nothing here says how the
      // request that carried them was proved, so null is written and means no proof was recorded.
      provedBy: null,
      runId: id,
      // AN ANSWER CAME OUT OF A RUN AND NOT OUT OF ANYBODY'S COMMENT. `runId` above is what says
      // where these words came from; this column is for the other direction and is null here.
      fromAnnotationId: null,
      carries: null,
      createdAt: stamp,
      createdBy: `agent:${writer.id}`,
    }
    writeMessage(said)
    answerMessage = toMessage(said, true, thread.workspaceId)
  }

  // The thread is answered only when something was really answered and nothing is still out. A
  // failure and a decline leave it dispatched, because nothing came back.
  //
  // AND NOT WHILE A COMMENT IS STILL WAITING IN IT. Dispatch leaves a comment it could not route
  // queued, and a review that had been moved to `answered` with one still in it would refuse to
  // take the correction and refuse to send it: the comment would be stranded where nothing could
  // reach it.
  //
  // AND NEVER OUT OF `abandoned`. That is the one thread state a person sets by hand, and until 19
  // August 2026 a late answer took it away from them: the conversation they had dropped came back
  // as "Answered", and because only an abandoned thread refuses new comments, it also started
  // accepting them again. `patchThread` refuses a person who tries to write "answered" by hand, in
  // so many words, so a machine writing it over their own decision was the same refusal broken from
  // the other side. Getting back to the conversation is still one step, and it is theirs to take.
  const siblings = runsOf(row.threadId).map((r) => (r.id === id ? { ...r, ...write } : r))
  const outstanding = siblings.filter((r) => !ENDED.includes(r.state as RunState)).length
  const answered = siblings.filter((r) => r.state === 'finished').length
  const stillWaiting = messagesOf(row.threadId).filter((m) => m.state === 'queued').length
  const threadState: ThreadState =
    thread.state !== 'abandoned' && outstanding === 0 && answered > 0 && stillWaiting === 0
      ? 'answered'
      : (thread.state as ThreadState)
  if (threadState !== thread.state) {
    db.update(agentThreads).set({ state: threadState, updatedAt: stamp }).where(eq(agentThreads.id, thread.id)).run()
  }

  // ---- SO THAT YOU CAN REPLY TO THE AGENT THAT JUST ANSWERED YOU ------------------------------
  //
  // Only an ANSWER says anything about a conversation: a failure produced none and a decline never
  // started one. The long reason, and why the transcript path is looked for rather than assembled,
  // is on `stampFinishedRun` in lib/sessions.ts.
  //
  // A RUN TO A NEW AGENT HAS NO SESSION RECORD TO WRITE ONTO, and none is invented here. A record
  // appearing that nobody asked for, naming a conversation, is a write the request did not ask for;
  // discovery files that conversation when it finds its transcript. What this does instead is SAY
  // so, because "you cannot reply to this yet" is the thing the caller most needs and the thing
  // silence hid.
  const conversation = write.state === 'finished' ? runtimeConversationOf(input.result) : null
  let stamped: RunStamped | null = null
  let aboutTheAgent = ''
  if (write.state === 'finished') {
    if (conversation === null) {
      aboutTheAgent =
        ' This answer does not say which conversation it came from, so nothing new was recorded about ' +
        'reaching that agent again.'
    } else if (row.recipientSessionId === null) {
      aboutTheAgent =
        ' This went to a new agent, and Mole Office has no run of its own for that conversation, so there is ' +
        'nothing here to reply to yet. A sweep of this machine files it once it finds the transcript.'
    } else {
      stamped = stampFinishedRun(row.recipientSessionId, row.runtime, conversation, writer, env)
      aboutTheAgent = ` ${stamped.says}`
    }
  }

  const view = toRun({ ...row, ...write }, thread)
  const aboutTheMessage =
    write.state !== 'finished'
      ? ''
      : answerMessage === null
        ? ' This result carries no words for the person, so nothing was added to the conversation. Whatever came ' +
          'back is on the run, and the comments this run carried are still waiting for an answer.'
        : // A DROPPED CONVERSATION TAKES NOTHING MORE, so the sentence that offers a reply would be
          // an offer Mole Office refuses. The answer is kept and a person can read it; saying anything
          // else here would be this route promising what `refuseIfClosedToMore` then denies.
          thread.state === 'abandoned'
          ? ` It is in "${thread.title}" for somebody to read. That conversation was dropped, so nothing more can ` +
            `be said in it until somebody picks it up again.`
          : ` It is in "${thread.title}" as a message you can reply to, and you can point at part of it and carry ` +
            `on from those words.`

  return {
    run: view,
    thread: toThread({ ...thread, state: threadState }),
    /** What was written about reaching that agent again, or why nothing was. Null on a run that did not answer. */
    pickUpAgain: stamped,
    answer: answerMessage,
    note:
      (declined
        ? `Declined, and the run is still waiting for a worker that can serve it. Nobody has been sent a fresh ` +
          `agent in its place.`
        : write.state === 'failed' || write.state === 'crashed'
          ? 'The failure is recorded. Nothing was invented in place of an answer.'
          : `The answer is on this run and on the conversation "${thread.title}".`) +
      aboutTheMessage +
      aboutTheAgent +
      (view.focus === null ? '' : ` ${view.focus.says}`) +
      (outstanding > 0
        ? ` ${String(outstanding)} other run${outstanding === 1 ? '' : 's'} of this review ${outstanding === 1 ? 'has' : 'have'} not come back yet.`
        : ''),
  }
}

/**
 * The words an answer carries for the person, or null when it carries none.
 *
 * `tools/agent-worker.mjs` posts `{answer, wrote, focus, structured, runtime}` and `answer` is what
 * the agent wrote for a person to read — the agent's own words when it ended with a JSON object,
 * and everything it printed when it did not. NOTHING ELSE IN THE RESULT IS READ AS THE ANSWER, for
 * the reason `runtimeConversationOf` reads nothing else as a conversation id: a result is whatever
 * a worker sent, Mole Office validates none of it, and picking some other field to show as the reply
 * would be Mole Office deciding what an agent said.
 *
 * A RESULT WITH NO WORDS PRODUCES NO MESSAGE, and the reply says so. That is the fifth rule: an
 * absent answer is a real answer, and a message saying "this run finished" would be words the agent
 * never wrote.
 */
function answerWordsOf(result: unknown): string | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return null
  const said = (result as Record<string, unknown>)['answer']
  if (typeof said !== 'string') return null
  const words = said.trim()
  return words === '' ? null : words
}

/**
 * The tool's own id for the conversation an answer came from, when the result carries one.
 *
 * `tools/agent-worker.mjs` puts `runtime: {tool, model, sessionId, costUsd, turns}` on every result
 * it posts, and `sessionId` there is the Claude Code conversation id. NOTHING ELSE IN THE RESULT IS
 * READ AS ONE: a result is whatever the worker sent and Mole Office validates none of it, so anything
 * that is not a non-empty string under that exact path is treated as absent rather than coerced.
 */
function runtimeConversationOf(result: unknown): string | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return null
  const runtime = (result as Record<string, unknown>)['runtime']
  if (typeof runtime !== 'object' || runtime === null || Array.isArray(runtime)) return null
  const said = (runtime as Record<string, unknown>)['sessionId']
  if (typeof said !== 'string') return null
  const id = said.trim()
  return id === '' ? null : id
}

/**
 * Who a run's own writes are attributed to: the actor id written into the request at dispatch.
 *
 * READ FROM THE REQUEST rather than worked out again, for the same reason `requestMessageIds`
 * reads it there: the request is what was actually given to the worker and it is never rewritten,
 * so it is the only thing that cannot have drifted since. `actorIdFor` at dispatch is what put it
 * there. A request that does not name one falls back to the same constant that function does,
 * which is what a run to a new agent gets anyway.
 */
function actorOfRun(row: RunRow): Actor {
  let named: unknown
  try {
    const request: unknown = JSON.parse(row.request)
    named = typeof request === 'object' && request !== null ? (request as Record<string, unknown>)['actorId'] : null
  } catch {
    named = null
  }
  if (typeof named !== 'string' || named.trim() === '') {
    throw new PanelError(`Run ${row.id} names no writer.`, 409)
  }
  return { type: 'agent', id: named.trim() }
}

/** Which messages a run carried, read from the request it was given rather than from a second list. */
function requestMessageIds(row: RunRow): string[] {
  let request: unknown
  try {
    request = JSON.parse(row.request)
  } catch {
    return []
  }
  if (typeof request !== 'object' || request === null) return []
  const messages = (request as Record<string, unknown>)['messages']
  if (!Array.isArray(messages)) return []
  return messages
    .map((m) => (typeof m === 'object' && m !== null ? (m as Record<string, unknown>)['id'] : null))
    .filter((id): id is string => typeof id === 'string')
}

/** The non-secret key row id written at dispatch, absent on older runs. */
function dispatchedKeyId(row: RunRow): string | null {
  const request = JSON.parse(row.request) as Record<string, unknown>
  return typeof request['agentKeyId'] === 'string' ? request['agentKeyId'] : null
}
