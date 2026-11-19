// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { batchDeliveryState, batchDeliveryStates, BATCH_HELD, acceptNoticeBatch } from '../../holder/notice-batches.ts'
import { aCheckpointRun } from '../../shared/worker-delivery/contract.mjs'
import { takeBacksForProject } from './take-back.ts'
// Shared interface assumption: the reader exports this function from async-take-back.ts.
import { asyncTakeBacksForProject } from './async-take-back.ts'
/**
 * THE QUEUE THE MESSAGE WORKER READS, AND THE FOUR THINGS IT MAY WRITE BACK.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE WORKER IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M9 of `design/messages/ACCEPTANCE.md`: a message to an agent is queued, and a worker the
 * product starts takes the queue and starts a run of that agent's tool with the message as the
 * prompt. The worker itself is `src/worker/index.ts`, a separate process. This file is the server's
 * half: what the worker may read, and what it may write when it has started, held, finished or
 * stopped a run.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORKER IS A SEPARATE PROCESS AND IT COMES IN THROUGH THE API
 * ---------------------------------------------------------------------------------------
 *
 * It does not open the database. Two processes writing one SQLite file is a fault waiting for a
 * migration, and a worker that wrote rows directly would bypass validation. So the worker holds an
 * HTTP address and nothing else, and every route below is one it calls.
 *
 * ---------------------------------------------------------------------------------------
 * WHO IS SAID TO HAVE SPOKEN, WHEN THE WORKER FILES A REPLY
 * ---------------------------------------------------------------------------------------
 *
 * The words came out of a run of one agent's tool, so `sentBy` on the reply is that agent. The
 * write itself was made by the worker, so the change log names the worker. Both are true and both
 * are stored: the reply also carries `fromRun`, the session record of the run its words came out
 * of, so a reader can open the run and check. Nothing is attributed to an agent that did not say
 * it, and nothing pretends the agent made the write.
 *
 * `lib/records.ts` normally refuses a `sentBy` that is not the writer, and it still does for
 * everybody else. The one opening is here: a reply may name the agent as its sender exactly when it
 * also names a run that agent was serving. The check is in `whyThisReplyIsRefused` below.
 */

import { noticeKindsFor, whyPersonalNoticeRuleHolds } from './notice-rules.ts'
import { closeSync, constants, lstatSync, openSync, readFileSync } from 'node:fs'
import { sayInEnglish } from '@shared/i18n.ts'

import { and, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'

import { isUrgent, participantKey, urgentAtTheFront, type DeliveryMark, type RoutedWas } from '@shared/messages.ts'
import type { AMarkedPartOnTheWire } from '@shared/intent-mark.ts'
import type { TheRowAMessageRunKeeps } from '@shared/run-models.ts'
import type { EarlierCastingRoll } from '@shared/casting-roll.ts'
import { SYSTEM_LINES, type AnOfficeLine, type SystemLineKind } from '@shared/groups.ts'
import { theStoredBranchedSummary } from '@shared/branched-agent.ts'
import { kindWord, stateWord } from '@shared/words.ts'
import { inEnglish, saying, type DevSaying } from '@shared/dev-sayings.ts'
import type { WorkerRuns } from '@shared/runtime.ts'
import type { PanelRecord } from '@shared/types.ts'
import { localStamp, parseStoredStamp } from '@shared/time.ts'
import { moleOffice, isMoleOffice, theMoleOfficeTest, whyNameIsRefused, type ParticipantRef } from '@shared/participants.ts'
import {
  nobodyIsAnsweringAsIt,
  routedOf,
  theMessageWentToANewAgent,
  theNewConversationCameFrom,
  thePersonAskedForARun,
  theRoutedLineFor,
} from '@shared/messages.ts'
import { aLiveSessionHasIt, itsSessionStillHasIt, theAlreadyAnsweringOnARow, theLiveSessionTookIt as itReachedTheLiveSession, type AlreadyAnsweringOnARow, type HoldOnTheWire, type WhoIsAnswering, whoIsAnsweringLine, whoIsAnsweringSays } from '@shared/handles.ts'
import { THE_PERSON } from '@shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR } from '@shared/roles.ts'
import { MERGES_ONLY_SAYS, gateNumber, gatePosition, mergedEnvironment, settingValue, settings } from '../../config/settings.mjs'
import type { MessageHold } from '../../config/gates.mjs'
import { theModelARunGets, theOfficeChoseIt } from './run-models.ts'
import { theEarlierCastingRolls, theRollThisAnswerHolds } from './casting-roll.ts'
import { db, sqlite } from '../db/client.ts'
import { keptStatement } from '../db/kept-statement.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { gateMet } from './gate-counts.ts'
import { branchDispatchedComments, theCommentsHeldFor, theCommentsHeldForThese } from './branch-dispatched-comments.ts'
import { ONE_KIND_WRITTEN_OUT, STORED_FIELDS, agentRecords, messageDelivery, records, theWordsOfAStoredField } from '../db/schema.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { everyNameInTheRegistries } from '../db/every-name-in-the-registries.ts'
import { readParticipant } from '../db/read-participant.ts'
import { listParticipants } from '../db/list-participants.ts'
import { theCardOfAgent } from '../db/the-card-of-agent.ts'
import { isAnInspector, whyThisWakesNoWaiter } from './notices.ts'
import { eachAgentsIdentityReadOnce, everyAgentsIdentityReadOnce, theAgentWithThisId, theOneAgentAStringNames, theOneAgentAmong, type AgentIdentity, type TheIdentityOf } from './agent-references.ts'
import { everyAgentAReferenceCouldName } from '../db/agent-references.ts'
import {
  conversationBetween,
  messagesInAGroup,
  theConversationBackTo,
  readMessage,
  readMessageWhereverItIs,
  sayWhereADeliveryStands,
  writeTheCarry,
  theAgentASessionAnswersAs,
  isAComment,
} from './messages.ts'
import { messagesInTheViewOf } from './message-centre.ts'
import { writtenInOf, type TheGroupOfAHandOver } from '@shared/messages.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import type { PoolEntry } from '../../shared/messages.ts'
import { writeASystemLine, writeASystemLineToOne, writeASystemLineToTwo } from './groups.ts'
import { readGroup } from '../db/read-group.ts'
import { theGroupForAHandOver } from './who-sent-it.ts'
import { THE_START_AN_AGENT_DOOR, createLink, createRecord, getRecord, patchRecord, toRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { EVERY_PROJECT, justThisProject } from '@shared/which-projects.ts'
import { listResources, theProcessesAListingReads, type AProcessToRead, type ResourceReport } from './resources.ts'
import { TERMINAL_STATES } from './terminal-states.ts'
import { osProbe } from './os-probe.ts'
import { everythingWaitingFor, projectsWaitingForTheseAgents, theLiveHoldOn } from './handles.ts'
import { aWaitIsHeldFor } from './waiting-hold.ts'
import { theSessionBehindTheHold, type HeldSessionReading } from './answering.ts'
import { theAgentFactsReadOnce, theGreyWordOfAnUnansweredAgent, theRedReasonFor, type AgentFactsReadOnce, type GreyPresenceWord } from './presence.ts'
import { theRunAWriteCameFrom } from '../db/the-run-a-write-came-from.ts'
import { handleGraceSeconds } from './env.ts'
import { theFiledAliasesReadOnce, type TheFiledAliases } from './registry-aliases/runs.ts'
// WHICH COMMENTS A REVIEW HAS NOT SENT YET, and what a person reads when one is held. Read inside
// theQueue and never while this module is being evaluated: lib/reviews.ts reaches back into this
// one through lib/records.ts, and that cycle is safe exactly as long as nothing is called at import.
import { inspectionForMessage, isInspectionForMessage, isInspectionForMessageWithRuns, recordCheckToolEnded, whyAnAskNeedsNoCheck, whyAReplacedAskNeedsNoCheck, theRegistryReadOnce } from './inspection.ts'
import { theChecksStartedInTheLastHour, thePaceOfACheckOf } from './checks-an-hour.ts'
import { type TheHoldOnNewChecks } from './checks-in-merges-only.ts'
import { theHoldOnNewChecks } from './the-hold-on-new-checks.ts'
import { aReviewIsHoldingIt, commentsAReviewHasNotSentYet, theMessagesCarrying } from './reviews.ts'
import { everyOpenSleep, heldWhileItSleeps, theOpenSleepOf, theRemindersOfOpenSleeps } from './resident-sleep.ts'
// THE MERGE QUEUE'S READING FOR THE WORKER (piece P9 of sandbox v1), and the one ending a stop press writes.
import { readMergeEntry, theLastToolRunStillRuns, theMergeToolWork, theNewestEntryIdsOfRuns, theProcessesAToolsOwnRowReads, theToolsOwnProcessRow, whyACheckOfThisRunWaitsForItsReport, whyItsMergeToolShouldStop } from './merge-queue.ts'
import { resolvingEntriesWhoseHourIsOver, theMergeToolRunEnded } from './merge-state-machine.ts'
import { MERGE_ENTRY_KIND, MERGE_TOOL_RUNTIME, type ChangesetAdapter, type MergeState, type ResolutionBounce } from '@shared/merge-queue.ts'
import type { ThePaceOfACheck } from '@shared/checks-an-hour.ts'
import { THE_WORKER } from '@shared/the-worker-actor.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { said } from './the-agent-a-run-serves.ts'
import { theIdentityByItsOwnRead } from './the-agent-a-run-serves.ts'
import { theRunRowsOfOneReach } from './the-run-rows-of-one-reach.ts'
import { aRunMayServe } from './the-run-rows-of-one-reach.ts'
import { theRunRowsOfTheTwoHalves } from './the-run-rows-of-one-reach.ts'
import { runRowsWhere } from './the-run-rows-of-one-reach.ts'
import { ROW } from './the-run-rows-of-one-reach.ts'
import { IS_RUNNING } from './the-run-rows-of-one-reach.ts'
import { HOLDS_A_MESSAGE_TO_HAND_OVER } from './the-run-rows-of-one-reach.ts'

export { THE_WORKER }

/**
 * WHEN THIS SERVER PROCESS LOADED ITS CODE, which is how a restart is told from a run that died.
 *
 * Criterion M24. A run whose session record was filed BEFORE this moment was started by a server
 * that is not this one, so the API restarted while that run was going. A run filed after it was
 * started by this server, and if it is dead now it died on its own. That is a fact and not a guess,
 * which is what lets a line in the conversation name the restart.
 *
 * It is a fact about the past and cannot be worked out again later, so it is kept, exactly as
 * `theWorkerWeStarted` at the foot of this file keeps what this server did about a worker.
 */
const THIS_SERVER_LOADED_AT = localStamp(new Date())

/** When this server process loaded its code. Exported so a test can read what it is comparing against. */
export function thisServerLoadedAt(): string {
  return THIS_SERVER_LOADED_AT
}

/** What the worker is told about one message it may serve. */
export interface Waiting {
  /**
   * THE CHECK THIS MESSAGE STARTS, when it is the office's own check notice. `only` and
   * `needsJudgment` are present on a scoped check the merge queue asked for (sandbox v1, piece P7),
   * and the worker passes them to the tool as `--only` and `--needs-judgment`.
   */
  inspection?: {
    run: string
    checkout: string | null
    only?: string[]
    needsJudgment?: { path: string; why: string }[]
    /**
     * THE MODEL THE CHECK IS GIVEN, when the Settings page or the checking agent's profile names one
     * (criterion U2). Absent means neither does, and the worker's own MOLE_OFFICE_INSPECTION_MODEL
     * decides, as `InspectionAdapter.modelItWouldUse` reads it.
     */
    model?: string
    /**
     * WHY THE CHECK IS HELD AND NOT STARTED: the run's newest merge entry bounced because its report lacked what a check
     * needs, as part 1 of a decision says. Absent when nothing holds it for that. The same
     * field says why a check is held when the login it runs on answered a check that its 5-hour limit is hit and the
     * reset it named is ahead (`theHoldOnNewChecks`, lib/checks-in-merges-only.ts). It is absent only when neither
     * holds it.
     */
    waits?: string
    /**
     * THE CHECK'S PACE UNDER THE HOURLY CAP, as part 2 of a decision says: its lane, how many
     * checks started there in the last hour and how many may, or why no lane can be told, or why the setting cannot be
     * used. The worker holds the check with the sentence @shared/checks-an-hour.ts makes of it.
     */
    pace: ThePaceOfACheck
  }
  /** The message record. */
  messageId: string
  title?: string
  /** This delivery row was already queued when this world was copied. */
  inheritedFromCopy?: boolean
  workspaceId: string
  /** Where the message was written, from its mark, or null when it holds none. */
  writtenIn: { project?: string; page?: string } | null
  /** The agent it is addressed to, as the delivery row names them. */
  to: ParticipantRef
  /** The agent's handle, which becomes the run's actor id. */
  handle: string
  /**
   * The runtime the run goes to: the agent's registry row, then the Settings page's choice for a run
   * answering a message, then MOLE_OFFICE_CHORE_RUNTIME. Null because none of them names one.
   */
  runtime: string | null
  /**
   * THE MODEL AND REASONING EFFORT THE OFFICE CHOSE FOR THIS RUN, criterion U2: the agent's own model
   * on its profile, or the Settings page's choice for a run answering a message, when either is for
   * this run's runtime. Null means neither names one, and the worker's adapter reads its own
   * environment (the chore settings and MOLE_OFFICE_AGENT_MODEL), because a worker's environment is
   * the whole world it answers from. `theModelARunGets` in lib/run-models.ts is the one reader.
   */
  model: string | null
  variant: string | null
  /**
   * THE CASTING ROW THE QUEUE READ FOR THIS RUN, in the project its start reads: the row its selection or its effort
   * comes from, or none, with a sentence. The start reads that row again and takes no other. Left out where the answer
   * is not a message run's.
   */
  kept?: TheRowAMessageRunKeeps
  /** Whether that agent has been retired, in which case nothing is started. */
  retired: boolean
  /**
   * WHAT THE MESSAGE SAYS, WHEN THE CALLER ASKED FOR THE FULL REPLY.
   *
   * A decision has `theQueue` answer narrow and omit this field, because a worker pass starts
   * few runs and was paying the `body` bytes of every message it did not start. The field
   * stays on the type because `{ full: true }` answers exactly what this door has always answered,
   * and a caller that will deliver the words reads them from one message record instead.
   */
  body?: string
  /** Who sent it, so the reply can be addressed back. */
  sentBy: ParticipantRef | null
  /**
   * THE GROUP IT WAS SENT TO, or null because it was sent to no group, as item 5 of a decision
   * says: the run prompt's envelope opens with a line naming the group and asking for
   * the answer there. On the narrow row as well as the full one, because a worker holding a narrow row
   * reads the message record, and the record holds the group's id and not its title.
   */
  fromGroup: TheGroupOfAHandOver | null
  /** When it was sent. */
  sentAt: string
  /** The newest conversation this agent had in this project that a run may pick up, or null. */
  resume: PickUp | null
  /** How many agents have answered each other since a person last said anything, along this reply chain. */
  hops: number
  /**
   * WHY THIS MESSAGE NEEDS NO RUN AT ALL, in one sentence, or null because it may have one.
   *
   * A line Mole Office wrote is the only thing here so far: it says a group was opened, a member was
   * added or two claims are in conflict, and it is for people to read. The worker marks it delivered
   * with this sentence beside it rather than starting a tool to answer the product. The office's ask for
   * a check of a run that is already settled is one too, and its sentence says the run and how it was
   * settled (`whyAnAskNeedsNoCheck`). The checks-only reading marks a settled ask itself only with markDelivered=1.
   */
  needsNoRun: string | null
  /**
   * TRUE WHEN `needsNoRun` IS A SETTLED RUN'S ASK FOR A CHECK. With markDelivered=1 the checks-only reading
   * marks it and names its reason in markedDelivered instead of returning this row. Absent otherwise.
   */
  askOfASettledRun?: true
  /**
   * WHY THIS CONVERSATION HAS GONE AS FAR AS IT MAY WITHOUT A PERSON, in one sentence, or null.
   *
   * The second loop guard, and the one that bounds a whole conversation rather than one chain of
   * replies. It holds what an agent wrote and never what a person wrote, since a person's message is
   * what lets a stopped conversation start again. See `whyThisConversationIsWaiting` below.
   */
  conversationIsWaiting: string | null
  /**
   * SENT AS AN EMERGENCY. Criterion M62.
   *
   * Every urgent message for an agent is at the front of this list, ahead of every ordinary one,
   * and still oldest-first among themselves. This field is on the row as well so that whatever
   * takes the message can say so — the waiter prints the mark, and the worker puts it in front of
   * the words it hands the agent — rather than each of them working out the order's meaning again.
   */
  urgent: boolean
  /**
   * THE ROUTED LINE, WHEN THIS DELIVERY'S RECIPIENT IS ONE THE ROUTING CHOSE.
   * The addressee could not be reached and the office also gave the words to the
   * first reachable participant up its chain of starters; this run is serving that participant, and
   * the prompt says so in the envelope's fourth line.
   *
   * IT IS A WORD, SO IT TRAVELS WITH THE WORDS: present only on a FULL row, beside `body`, and absent
   * from the narrow row the queue answers by default. The narrow row's own rule is ids and small
   * fields and no words. A reader holding only a narrow row builds the line from the record with
   * `theRoutedLineFor`, the same way the waiter does. Null on a full row when this recipient is the
   * addressee, or when nothing was routed.
   */
  routedLine?: string | null
  /**
   * THE SESSION RECORD ALREADY ANSWERING AS THIS AGENT, or null because none is. A run's record or a
   * live session's hold, read the one way `whoIsAnsweringAs` reads it. The type comes from
   * `AlreadyAnsweringOnARow`, which keeps this field and `runningAlreadySays` one answer.
   */
  runningAlready: AlreadyAnsweringOnARow['runningAlready']
  /**
   * THE ONE WAITING SENTENCE FOR WHAT IS ALREADY ANSWERING, or null because nothing is.
   *
   * It is built by `theAlreadyAnsweringOnARow`, the one function that reads who is answering (the
   * same sentence the chat's answering mark reads) and puts it beside what happens to this message.
   * So the queue and the chat cannot describe one agent in two different ways, and a handle held by
   * a live session says that session's sentence rather than a run sentence that says nobody has the
   * agent open in a terminal. It names the sandbox INSTANCE when the run's own record names one. The
   * worker's `whyNotNow` returns it rather than writing its own.
   */
  runningAlreadySays: AlreadyAnsweringOnARow['runningAlreadySays']
  /**
   * WHY NO RUN IS STARTED BECAUSE A LIVE SESSION IS ANSWERING AS THIS AGENT, or null because none is.
   *
   * Criterion H2, and the whole of what a durable agent means: while somebody has the agent open in
   * a terminal, the message goes to that terminal and Mole Office opens nothing beside it. The
   * waiter marks the message delivered as soon as it reads it; this is what keeps the worker's hands
   * off it in between, and off a SECOND message that arrives while the session is answering the
   * first.
   */
  heldByALiveSession: string | null
  /**
   * WHY NO RUN IS STARTED BECAUSE A REVIEW IS HOLDING THIS COMMENT BACK, or null because none is.
   *
   * Criterion M28: when several comments are left for one agent during a review, all of them are shown,
   * each with its state shown as not yet sent, and they can be sent together in one press, from the
   * conversation or from the review column on the right.
   *
   * Without this, naming the agent WAS sending the comment — measured at 1.8 seconds, each one
   * starting its own run, so by the time the person reached the send press there was nothing left to send.
   * Problem `g4M_z6965R5o`. The sentence is built on the server, where the review's membership is
   * read, and it is the same reading the review column draws from.
   */
  heldByAReview: string | null
  /**
   * WHY NO RUN IS STARTED BECAUSE THE PERMANENT RESIDENT IT IS FOR IS ASLEEP, present only then and only on a message
   * that is not urgent, as a decision says: non-urgent messages are held until it wakes. The
   * message stays queued, unchanged and unread; when the resident wakes, the next read of the queue no longer carries
   * this. ABSENT, not null, on every other row, so the narrow row's fields are unchanged for every agent that is
   * not asleep.
   */
  heldWhileAsleep?: string
  noticeBatchAvailable?: true
  heldByNoticeRule?: string
  /**
   * WHY NO RUN IS STARTED BECAUSE NOTHING IS ANSWERING AS THIS AGENT, or null because one may start.
   *
   * Criterion M78: an agent that cannot be reached must not have a new agent started for it straight
   * away. If a new one has to be started because the agent cannot be reached, the person is asked to
   * confirm first.
   *
   * IT IS THE OPPOSITE OF EVERY OTHER REASON ON THIS ROW. The others hold a message because
   * something IS there — a session, a review, a run, a limit. This one holds it because nothing is,
   * which used to be the state a run was started in. What clears it is one press by the person, and
   * the press writes `runWasAskedFor` onto the message itself.
   */
  nobodyIsAnsweringAsIt: string | null
  /**
   * THE HOLDS WHOSE GATE IS OFF THAT WOULD HAVE HELD THIS MESSAGE AT BLOCK, present only when there is one. The worker
   * hands them to the taken door, which counts each one when a run takes the message, or to the needs-no-run door,
   * which counts each one when the line is delivered without a run.
   */
  wouldHaveHeld?: MessageHold[]
}

/**
 * ONE QUEUED DELIVERY THE QUEUE COULD NOT WORK OUT, because a read for it threw. It is not a row of the queue and no run
 * is started for it. `because` names the delivery and the error's own words; the worker writes it on the delivery, which
 * stays queued for the next pass.
 */
export interface QueueFailure {
  messageId: string
  to: ParticipantRef
  handle: string
  workspaceId: string
  /** The sentence for the delivery, at most A_HELD_SENTENCE_AT_MOST characters, which says where it cut the error. */
  because: string
  /** The error's whole words. */
  error: string
}

/** The longest sentence the held door writes on a queued delivery. */
export const A_HELD_SENTENCE_AT_MOST = 500

/** The sentence a delivery the queue could not work out carries: the error's words, cut to fit and said cut where they are. */
function whyTheQueueCouldNotWorkItOut(handle: string, error: string): string {
  const before = `This message could not be worked out for ${handle}, so no run was started for it: `
  const after = ' It stays queued, and the next pass of the message worker tries it again.'
  const room = A_HELD_SENTENCE_AT_MOST - before.length - after.length
  if (error.length <= room) return before + error + after
  const cut = (more: number) => `… (${String(more)} more characters; the whole error is in the failed list of GET /api/worker/queue.)`
  const kept = room - cut(error.length).length
  return before + error.slice(0, kept) + cut(error.length - kept) + after
}

/**
 * What the worker's health row on GET /api/runtime says.
 *
 * EVERY LINE A PERSON READS IS BUILT HERE AND NOT ON THE PAGE. The session's stored state word goes
 * through `stateWord`, which is the one table of readings, so the page never has to know that
 * `crashed` is a stored word with a reading of its own. Criterion M4 says the page never guesses,
 * and this is the same rule applied to the runtime page.
 *
 * THE SHAPE IS DECLARED IN src/shared/runtime.ts AND READ HERE. It used to be written out in both
 * files, which is one fact worked out in two places: a field added to one and forgotten in the other
 * is a type error nowhere and a missing row on the page.
 */
export type { WorkerRuns }

// ============================================================================ reading the queue

/** One record row, read whole enough to answer everything below. */
export interface Row {
  id: string
  workspaceId: string
  kind: string
  title: string
  data: unknown
  createdAt: string
}

export { ROW } from './the-run-rows-of-one-reach.ts'

/** A record's data as an object, or an empty one. */
function dataOf(row: Pick<Row, 'data'>): Record<string, unknown> {
  return typeof row.data === 'object' && row.data !== null && !Array.isArray(row.data)
    ? (row.data as Record<string, unknown>)
    : {}
}

export { said } from './the-agent-a-run-serves.ts'

export { theAgentARunServes } from './the-agent-a-run-serves.ts'

export { theIdentityByItsOwnRead } from './the-agent-a-run-serves.ts'

/**
 * The name a sentence gives the agent a run serves: the handle on its row, else the stored string as
 * it is, else a phrase saying nobody wrote one down.
 */
function theNameOfTheAgentARunServes(data: Record<string, unknown>, identityOf?: TheIdentityOf): string {
  return theAgentARunServes(data, identityOf)?.handle ?? said(data['servingAgent']) ?? 'an agent nobody wrote down'
}

// REUSE THE STATEMENT, NOT ITS ROWS (wave 13y round 41). The queue walks thousands of chains in one ask.
// Building and preparing this same primary-key read at every hop cost more than running it on the made-up database.
const hopRow = keptStatement(() =>
  db.select(ROW).from(records).where(eq(records.id, sql.placeholder('id'))).prepare(),
)

/**
 * HOW MANY AGENTS HAVE ANSWERED EACH OTHER SINCE A PERSON LAST SAID ANYTHING.
 *
 * Walk `inReplyTo` back from this message. Every step where an agent was answering an agent is one
 * hop. The walk stops at a message a person sent, at a message that answers nothing, or at a
 * message that is not there any more.
 *
 * IT IS WORKED OUT AND NOT STORED. A stored count would be a second copy of a fact the chain
 * already holds, free to disagree with it, which is the defect CLAUDE.md names as this codebase's
 * own. The walk is bounded because a chain longer than this cannot change the answer.
 */
export function hopsBehind(messageId: string, limit = 50): number {
  let hops = 0
  let at: string | null = messageId
  const seen = new Set<string>()
  while (at !== null && hops < limit) {
    if (seen.has(at)) break
    seen.add(at)
    const row = hopRow().get({ id: at })
    if (row === undefined || row.kind !== 'message') break
    const data = dataOf(row)
    const from = data['sentBy']
    const kind = typeof from === 'object' && from !== null ? (from as { kind?: unknown }).kind : null
    // A PERSON'S MESSAGE ENDS THE CHAIN. That is the whole rule: agents may answer each other, and a
    // person saying anything sets the count back to nothing.
    if (kind === 'person') break
    if (kind === 'agent' && at !== messageId) hops += 1
    at = said(data['inReplyTo'])
  }
  return hops
}

// ============================================================================ the conversation guard

/**
 * A LINE MOLE OFFICE WROTE STARTS NO RUN, and this sentence is why. Null for anything else.
 *
 * Problem `jN0TdeawNlZZ`. Mole Office is a participant that writes the lines saying a group was
 * opened, a member was added or two claims are in conflict (criterion M11). Those lines go to every
 * member, so until 4 September 2026 every one of them started a run of every agent in the group.
 * Measured on a scratch stack that day: opening one group of two agents and one person wrote four
 * such lines and started eight runs, and all eight answers were refused — *Mole Office itself cannot
 * be written to* — because there is nobody to answer. With a real tool that is eight model calls
 * spent on nothing.
 *
 * THE MARK STILL MOVES AND THE LINE IS STILL DELIVERED. Leaving it queued would put a clock beside a
 * message that is never going anywhere. `theMessageNeedsNoRun` below is the write, and the sentence
 * this returns is what a person reads beside the tick.
 *
 * IT IS ASKED IN TWO PLACES AND ANSWERED IN ONE. `theQueue` asks it to tell the worker, and the door
 * the worker then calls asks it again about the stored message, so nothing can mark a message
 * delivered without a run by simply saying it should be.
 */
export function whyThisMessageNeedsNoRun(sentBy: ParticipantRef | null, officeTest: (who: ParticipantRef) => boolean = isMoleOffice): string | null {
  if (sentBy === null || !officeTest(sentBy)) return null
  return (
    'Mole Office wrote this line to say what happened in this group, and a line like that is for people to read. ' +
    'No run was started for it and nothing was spent. It is here in full.'
  )
}

/**
 * THE SENTENCE A LINE MOLE OFFICE WROTE IS DELIVERED WITH WHEN IT NEEDS NO RUN, or null because Mole Office did not
 * write it. The office's ask for a check that a newer ask replaced has a sentence of its own, because the general one
 * above is not true of an ask. The queue and the needs-no-run door both ask this, so the row and the stored delivery
 * cannot say two different things.
 */
function whyThisOfficeLineNeedsNoRun(messageId: string, sentBy: ParticipantRef | null, workspaceId: string, stored?: Record<string, unknown>, officeTest: (who: ParticipantRef) => boolean = isMoleOffice): string | null {
  const general = whyThisMessageNeedsNoRun(sentBy, officeTest)
  return general === null ? null : (whyAReplacedAskNeedsNoCheck(messageId, workspaceId, stored) ?? general)
}

/** Which conversation a message is in: one group, or one pair of participants. */
export type WhichConversation =
  | { kind: 'group'; id: string }
  | { kind: 'pair'; id: string; between: [ParticipantRef, ParticipantRef] }

/**
 * WHICH CONVERSATION ONE DELIVERY IS IN, or null because it is in none that can be counted.
 *
 * A message to a group is in that group and in no private conversation, which is the rule
 * `isBetween` in lib/messages.ts already holds to. Anything else is the conversation between whoever
 * sent it and whoever this delivery row is for. A message whose sender nothing recorded is in
 * neither: absence beats a guess, and the reply-chain guard below still covers it.
 */
export function conversationOf(
  message: { toGroup: string | null; sentBy: ParticipantRef | null },
  to: ParticipantRef,
): WhichConversation | null {
  if (message.toGroup !== null) return { kind: 'group', id: message.toGroup }
  if (message.sentBy === null) return null
  const two: [ParticipantRef, ParticipantRef] = [message.sentBy, to]
  const key = [participantKey(two[0]), participantKey(two[1])].sort().join('~')
  return { kind: 'pair', id: key, between: two }
}

/**
 * HOW MANY MESSAGES AGENTS HAVE WRITTEN IN ONE CONVERSATION SINCE A PERSON LAST WROTE.
 *
 * Read oldest first, across every agent in it. A person's message sets the count back to nothing —
 * that is the whole rule, and it is the same rule the reply-chain guard has always had, asked of a
 * conversation instead of a chain.
 *
 * SO ONLY THE MESSAGES FROM THE LAST ONE A PERSON WROTE ARE READ, by `theConversationBackTo` in
 * lib/messages.ts, and the whole conversation when no person wrote in it. What came before that
 * message could only be counted and then set back to nothing. This is the guard's one way of
 * reading a conversation's turns, for the whole queue and for one page of it alike. It used to
 * read every message of every project once a reading and sort them into conversations; on the
 * made-up office of 13 November that was about 1.5 seconds for each page of the queue.
 *
 * MOLE OFFICE'S OWN LINES DO NOT COUNT. They sit in the agent registry (note `75hqrbZOlUFm`,
 * decision 1) and they are the product saying what happened, not an agent taking a turn. Counting
 * them would let a group that opened with four lines start out already half way to its limit.
 *
 * A MESSAGE WHOSE SENDER NOTHING RECORDED COUNTS AS NEITHER. It does not raise the count, because
 * nothing says an agent wrote it, and it does not reset it, because nothing says a person did.
 */
export function agentTurnsInTheConversation(
  which: WhichConversation,
  workspaceId: string,
  officeTest: (who: ParticipantRef) => boolean = theMoleOfficeTest(),
): number {
  // A GROUP A REFUSAL OPENED COUNTS NOTHING AT ALL. Criterion M82. It is asked here as well as in
  // `whyThisConversationIsWaiting` because this count is read on its own — by the page that says
  // how far a conversation has gone — and a count that said three in a group nothing can stop would
  // be a number nobody could act on.
  if (aRefusalOpenedThisConversation(which)) return 0
  const said = theConversationBackTo(which, (one) => aPersonWroteIt(one.sentBy), officeTest(moleOffice()) ? 'the count' : 'the guard')
  let turns = 0
  for (const one of said) {
    if (aPersonWroteIt(one.sentBy)) {
      turns = 0
      continue
    }
    if (thisGuardCountsIt(one.sentBy, officeTest)) turns += 1
  }
  return turns
}

/** Whether a person wrote this message, which is what sets the count back to nothing. */
export function aPersonWroteIt(sentBy: ParticipantRef | null): boolean {
  return sentBy !== null && sentBy.kind === 'person'
}

/**
 * WHETHER AN INSPECTOR WROTE THIS. Criterion M82.
 *
 * The cap on how much agents may say without a person is a loop guard: it exists because two agents
 * in one group turned forty messages into seventy-eight in twenty minutes, every hop a model call
 * on the owner's account. A refusal from an inspector is not that. It is the check working, and it
 * is the one message the worker it refused has to receive in order to fix anything.
 *
 * MEASURED, 7 September 2026, problem `S5ouUa6A0rrL`: the inspector's SECOND refusal of a worker
 * sat in message_delivery marked queued with the cap's sentence on it. The check-and-fix loop the
 * owner asked for died quietly on its second round, and nothing said so.
 *
 * A ROW WITH NO ROLE READS AS A WORKER, which is the product's own rule, so an unregistered writer
 * and a worker are both counted. Only a registry row that actually says inspector is not. The test is
 * `isAnInspector` in ./notices.ts, which also decides whose notices may be quiet.
 */
function writtenByAnInspector(sentBy: ParticipantRef | null): boolean {
  return isAnInspector(sentBy)
}

/**
 * WHETHER A REFUSAL OPENED THIS CONVERSATION, so nothing said inside it counts against the cap.
 *
 * Criterion M82, second half: *a refusal from an inspector, and any message inside the group a
 * refusal opened, does not count against the cap*. A refusal opens a group with the worker, its
 * starter and the inspector in it (criterion C26), and that group is where the refusal is talked
 * out. Counting what is said there would stop the conversation the group was
 * opened to have.
 *
 * IT IS ASKED OF THE GROUP AND NOT OF EACH MESSAGE, because the fact is about the conversation: who
 * opened it, which is on the group's own row. A pair is never one of these: a refusal always opens
 * a group.
 */
function aRefusalOpenedThisConversation(which: WhichConversation): boolean {
  if (which.kind !== 'group') return false
  const group = readGroup(which.id, EVERY_PROJECT)
  return group !== null && writtenByAnInspector(group.openedBy)
}

/**
 * WHETHER THIS GUARD IS ABOUT THIS MESSAGE AT ALL: it is about what an agent wrote, and nothing else.
 *
 * Not a person's message, not a line Mole Office wrote, and not a message whose sender nothing
 * recorded.
 *
 * IT ANSWERS FOR BOTH HALVES OF THE GUARD, which is why it is one function. The count above adds up
 * the messages this returns true for, and `whyThisConversationIsWaiting` below holds the messages
 * this returns true for. Until 4 September 2026 the counting half asked who wrote a message and the
 * holding half did not, so the guard held messages it had never counted: problem `Oa-URN8oEQbZ`, the
 * owner's own message into a group held on the ground that agents had said too much without a
 * person.
 */
export function thisGuardCountsIt(sentBy: ParticipantRef | null, officeTest: (who: ParticipantRef) => boolean = isMoleOffice): boolean {
  if (sentBy === null || aPersonWroteIt(sentBy)) return false
  // AND AN INSPECTOR'S WORDS ARE NOT A LOOP. Criterion M82. It is here rather than in one of the two
  // halves because this function answers for both, and a message counted by one half and held by
  // the other is exactly the shape of problem `Oa-URN8oEQbZ`.
  if (writtenByAnInspector(sentBy)) return false
  return !officeTest(sentBy)
}

/** How many messages agents may write in one conversation before a person has to say something. */
export function howFarAConversationMayGo(): number {
  return gateNumber('agent-hops')
}

/**
 * WHY NOTHING MORE IS STARTED IN THIS CONVERSATION UNTIL A PERSON WRITES, or null because it may run.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE ARE TWO LOOP GUARDS AND NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * `hopsBehind` above walks `inReplyTo` back from one message and counts the agents answering each
 * other along that chain. It bounds a chain. It does not bound a conversation, because a message an
 * agent's run writes for itself — into the group it was told about, say — answers nothing, so the
 * walk ends at once and the count is zero however long the group has been talking. Problem
 * `jN0TdeawNlZZ`: two agents in one group, forty messages became seventy-eight in twenty minutes
 * with nobody writing one, and every hop of that would be a model call on the owner's account.
 *
 * This counts the conversation instead, so it holds whether or not anything says what answers what.
 *
 * BOTH ARE KEPT, AND THE CHAIN GUARD STILL ADDS TWO THINGS. It bounds a chain of replies that runs
 * ACROSS conversations — an agent answering in a group a message it was sent privately — which this
 * one does not see, because to this one those are two conversations. And it bounds a message whose
 * sender nothing recorded, which has no conversation to count at all. The stricter of the two
 * decides, which is whichever fires first.
 *
 * ---------------------------------------------------------------------------------------
 * A MESSAGE A PERSON WROTE IS NEVER HELD HERE
 * ---------------------------------------------------------------------------------------
 *
 * Problem `Oa-URN8oEQbZ`, found by the verifier of part 2e on 4 September 2026. This guard used to
 * judge a message by how much the agents had said by the time the queue was read, without asking who
 * had written the message it was judging. The worker starts a bounded number of runs at once, so the
 * person's message routinely waits in the queue while runs started before it are still writing; by
 * the time it was looked at, the agents had said enough to trip the guard, and the person's own message was
 * held with *Nothing more is started here until a person writes something* beside it. A person wrote it.
 * Measured: the person's message was queued for both agents and still queued three minutes later with nothing
 * running.
 *
 * A person's message is the one thing that sets the count back to nothing, so holding it makes the
 * way out of the stopped state unreachable, and the sentence a person then reads on their own row is
 * false about that row. The rule is now the same one the count uses, asked through
 * `thisGuardCountsIt`: what an agent wrote is held, and nothing else is.
 *
 * THE CHAIN GUARD ALREADY ASKED THIS. `whyNotNow` in src/worker/index.ts holds a message on the hop
 * count only when `sentBy.kind === 'agent'`. The two guards disagreed about the same question, and
 * the one that never asked it is the one that was wrong.
 */
export function whyThisConversationIsWaiting(
  message: { toGroup: string | null; sentBy: ParticipantRef | null },
  to: ParticipantRef,
  workspaceId: string,
  // THE INSTALLATION'S ALLOWANCE, read once by a caller that asks many times (problem P-P3huQftq9w).
  allowance?: number,
  officeTest: (who: ParticipantRef) => boolean = theMoleOfficeTest(),
): string | null {
  if (!thisGuardCountsIt(message.sentBy, officeTest)) return null
  const which = conversationOf(message, to)
  if (which === null) return null
  // A GROUP A REFUSAL OPENED IS NEVER STOPPED HERE. Criterion M82: it is the check working, and the
  // group is where the refusal is talked out.
  if (aRefusalOpenedThisConversation(which)) return null
  const allowed = allowance ?? howFarAConversationMayGo()
  const turns = agentTurnsInTheConversation(which, workspaceId, officeTest)
  if (turns < allowed) return null
  return (
    `Agents have written ${String(turns)} messages in this conversation since a person last wrote, and this ` +
    `installation allows ${String(allowed)}. Nothing more is started here until a person writes something. Every ` +
    'message is still here to read.'
  )
}

/**
 * TELL THE GROUP ONCE THAT ITS AGENTS ARE WAITING FOR A PERSON. Nothing is written for a pair.
 *
 * The sentence on a delivery row is read by whoever opens that message. A group that has stopped
 * needs saying in the group, where the people in it are looking, and Mole Office is the participant
 * that says what happened to a group (M11).
 *
 * IT IS SAID ONCE PER PAUSE, and what makes it once is the group's own messages rather than a flag:
 * the line is written only when the group holds no such line since the last message a person wrote.
 * A person writing sets the count back to nothing, so the next time the agents run out the group is
 * told again. A stored flag would be a second copy of a fact the conversation already holds.
 */
export function tellTheGroupTheAgentsAreWaiting(
  messageId: string,
  to: ParticipantRef,
  workspaceId: string,
  by: Actor,
): { written: boolean; because: string } {
  const message = readMessage(messageId, workspaceId)
  const which = conversationOf(message, to)
  if (which === null || which.kind !== 'group') {
    return { written: false, because: 'This message is not in a group, so there is nowhere to write a line about it.' }
  }
  if (whyThisConversationIsWaiting(message, to, workspaceId) === null) {
    return { written: false, because: 'This conversation may still run, so nothing was written into the group.' }
  }
  const line = SYSTEM_LINES.agentsAreWaitingForAPerson
  const since = messagesInAGroup(which.id, EVERY_PROJECT)
  const lastPersonWroteAt = since.reduce(
    (at, one, index) => (one.sentBy !== null && one.sentBy.kind === 'person' ? index : at),
    -1,
  )
  // WHETHER THE GROUP HAS ALREADY BEEN TOLD, read from the conversation and not from a flag stored
  // beside it. It is the LINE that is compared, not the sentence: the line is what is stored as the
  // body. Criterion M34 shortened both, and a line written before that shortening carries the old
  // wording — so a group told once under the old words is told once more under the new ones, and
  // then never again. That is a one-off and it is said here rather than worked around.
  const alreadySaid = since.slice(lastPersonWroteAt + 1).some((one) => one.body === line.line)
  if (alreadySaid) {
    return { written: false, because: 'This group has already been told that its agents are waiting for a person.' }
  }
  const wrote = writeASystemLine(which.id, workspaceId, line, by)
  if (wrote === null) {
    return { written: false, because: 'There is nobody left in this group to read such a line, so none was written.' }
  }
  return { written: true, because: line.said ?? line.line }
}

/** A conversation a run may pick up again: the provider's own id, and the tool that made it. */
export interface PickUp {
  /** The provider's own id for the conversation. */
  id: string
  /**
   * THE RUNTIME WORD OF THE RUN THAT MADE IT, because only the same tool can use it.
   *
   * An id is one tool's name for one conversation and means nothing to another tool. Measured on 4
   * September 2026 (problem `QLYp6AG-Dnbw`): a `claude-code` run was started with an id the fake
   * runtime had made, and Claude Code refused it — *Provided value "fake-neeq7qm2" is not a UUID
   * and does not match any session title* — so the message was marked taken and the run died at its
   * first argument. The worker compares this word with the adapter it is about to start.
   */
  runtime: string
  /**
   * THE SESSION RECORD OF THE NEWEST RUN IN THAT CONVERSATION, which the run that picks it up continues (wave 13s
   * round 43). A resumed Codex thread reports its total so far, so the new run's receipt takes this run's total off its
   * own (src/worker/runtimes/codex.ts). It is the run `theRunItPickedUp` finds for the new run once it is filed.
   */
  run: string
}

/**
 * THE NEWEST CONVERSATION THIS AGENT HAD IN THIS PROJECT THAT A RUN MAY PICK UP, or null.
 *
 * A run record that carries a provider id and no runtime word cannot say which tool made the id, so
 * it supplies none: guessing which tool it was is how the wrong conversation gets resumed. The walk
 * carries on to older runs, which may be able to say.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ONLY A CONVERSATION THAT IS STILL WAITING FOR THE NEXT MESSAGE (criterion M22)
 * ---------------------------------------------------------------------------------------
 *
 * Until 4 September 2026 this returned the newest conversation an agent ever had, however old. A
 * message sent a week after the last one was handed an id from a week ago, so the agent answered
 * inside a conversation nobody remembered starting, and the tool may well have thrown that
 * conversation away in the meantime. How long was settled instead by decision `5k2UP25NnN57`, item 4:
 * the conversation ends after a set wait, such as five or ten minutes.
 *
 * So a run that has answered waits — see `runsWaitingForTheNextMessage` below — and for a worker only
 * a run that is still inside its wait offers its conversation here. When the wait has passed the
 * answer is null, and the worker starts a fresh conversation, which is what the line written into
 * the conversation at that moment says will happen.
 *
 * A SECRETARY'S OR A SUPERVISOR'S CONVERSATION IS PICKED UP AFTER ITS WAIT TOO, as the owner's
 * decision has it. `theConversationAMessagePicksUp` below is where that is decided, and this
 * only asks it.
 */
export function conversationToPickUp(
  agentId: string,
  workspaceId: string,
  // THE WAITING RUNS, READ ONCE BY A CALLER THAT ASKS FOR MANY AGENTS. Reading them means every
  // session row of the project and every goodbye line; the queue reader asked twice per queued
  // message and paid for it on every poll (problem 9Ys6WS23aGXE). A caller with the list hands it in.
  waiting: readonly WaitingRun[] = runsWaitingForTheNextMessage(workspaceId),
  // THE RUN ROWS, READ ONCE BY THE SAME CALLER, for a secretary or a supervisor whose wait is over.
  rows?: readonly Row[],
  messageRows?: MessageRunRows,
  once: ReadOnceForManyAgents = {},
): PickUp | null {
  const picked = theConversationAMessagePicksUp(agentId, workspaceId, waiting, rows, messageRows, once)
  return picked === null ? null : { id: picked.providerSession, runtime: picked.runtime, run: picked.session }
}

/** The conversation a message to one agent picks up, and the run that made it. */
interface TheConversationAMessagePicksUp {
  /** The session record of the newest run in that conversation. */
  session: string
  /** The tool's own id for the conversation, and the runtime word of the tool that made it. */
  providerSession: string
  runtime: string
  /**
   * That run's wait, while the run is still inside it. Null for a secretary's or a supervisor's run
   * whose wait has ended, or that never started one: its conversation is picked up all the same.
   */
  waiting: WaitingRun | null
}

/**
 * WHETHER A MESSAGE PICKS UP THIS AGENT'S OWN CONVERSATION AFTER ITS RUN'S WAIT HAS ENDED.
 *
 * A secretary recommended it, and a decision followed. A secretary and
 * a supervisor can always be resumed by a message; a worker is retired when it finishes (criterion
 * M109) and is not resumed. So it is true for the secretary's and the supervisor's cards and for no
 * other. A row with no card reads as a worker, and the inspector is not named in the decision.
 */
function aMessageAlwaysPicksUpItsConversation(agentId: string, cardOf: (agentId: string) => string | null = theCardOfAgent): boolean {
  const card = cardOf(agentId)
  return card === THE_SECRETARY || card === THE_SUPERVISOR
}

/**
 * WHAT A READING ABOUT MANY AGENTS READ ONCE FOR ALL OF THEM (wave 13y round 46), so each agent's question does not
 * read it again. Each one answers what the reader it stands for answers, read in the same synchronous reading.
 */
export interface ReadOnceForManyAgents {
  /** Which agent an id names, from every agent's identity read once (`everyAgentsIdentityReadOnce`). */
  identityOf?: TheIdentityOf
  /** The card each agent holds, by `theCardOfAgent`, worked out once per agent. */
  cardOf?: (agentId: string) => string | null
  /** Which run the office started a session is, by `theRunAWriteCameFrom`, read for many sessions at once. */
  runOrigin?: (session: string) => { run: string; servingAgent: string } | null
  /**
   * WHAT THE SESSION BEHIND A HOLD SAYS, by `theSessionBehindTheHold`, read once for every project a reading asks in
   * (wave 13y round 81). That read takes every message ever handed to the session, which was 18,552 rows for one live
   * secretary, and the people view read it again in each of 11 projects.
   */
  behindTheHold?: (hold: HoldOnTheWire, workspaceId: string, now: Date, machine?: () => readonly ResourceReport[]) => HeldSessionReading
  /** The filed registry aliases, read at most once for the whole reading (`theFiledAliasesReadOnce`). */
  aliases?: TheFiledAliases
}

/**
 * THE CONVERSATION A MESSAGE TO THIS AGENT PICKS UP, or null because a message would start a new one.
 *
 * THE ONE READER. The queue (`conversationToPickUp`), the chat, the handle door and the routing
 * (`whoIsAnsweringAs`) and the presence dot (`aConversationIsPickedUpAs`) all ask it, so none of them
 * can say an agent will be picked up while another says it will not.
 *
 * FOR A SECRETARY OR A SUPERVISOR it is the newest run the message worker
 * started for the agent that carries a conversation id and a runtime word, whether or not its wait
 * has ended and whether or not the line saying so has been written, as a decision says.
 *
 * FOR EVERY OTHER AGENT it is the run still inside its wait (`theRunWaitingFor`), as before.
 *
 * `rows` is read only for a secretary or a supervisor. They may be every run row or only the message
 * worker's: `runRows` keeps the message worker's either way.
 */
function theConversationAMessagePicksUp(
  agentId: string,
  workspaceId: string,
  waiting: readonly WaitingRun[],
  rows?: readonly Row[],
  messageRows?: MessageRunRows,
  once: ReadOnceForManyAgents = {},
): TheConversationAMessagePicksUp | null {
  if (!aMessageAlwaysPicksUpItsConversation(agentId, once.cardOf)) {
    const run = theRunWaitingFor(agentId, waiting)
    return run === null
      ? null
      : { session: run.session, providerSession: run.providerSession, runtime: run.runtime, waiting: run }
  }
  const candidates = messageRows === undefined ? runRows(workspaceId, rows) : (messageRows().get(agentId) ?? [])
  for (const row of candidates) {
    const data = dataOf(row)
    if (theAgentARunServes(data, once.identityOf)?.id !== agentId) continue
    const providerSession = said(data['providerSession'])
    const runtime = said(data['runtime'])
    if (providerSession === null || runtime === null) continue
    return {
      session: row.id,
      providerSession,
      runtime,
      waiting: theRunWaitingFor(agentId, waiting.filter((one) => one.session === row.id)),
    }
  }
  return null
}

/**
 * THE RUN OF THIS AGENT THAT IS STILL INSIDE ITS WAIT FOR THE NEXT MESSAGE, or null.
 *
 * The one reading of "this agent has a run waiting". `theConversationAMessagePicksUp` asks it, and
 * through that reader the queue decides where the next message goes and `whoIsAnsweringAs` says who
 * answers as the agent (criterion M89). Two readings could disagree about one agent, so there is one.
 */
function theRunWaitingFor(agentId: string, waiting: readonly WaitingRun[]): WaitingRun | null {
  for (const one of waiting) {
    if (one.agentId !== agentId) continue
    if (one.over) continue
    return one
  }
  return null
}

/**
 * THE ANSWERING READING FOR AN AGENT WHOSE OWN CONVERSATION A MESSAGE PICKS UP, or null because a
 * message would start a new one. `whoIsAnsweringAs` and the presence dot both call it, so they name
 * the same run with the same sentence (criterion M89), and both ask `theConversationAMessagePicksUp`,
 * the reader the queue asks.
 *
 * TWO ANSWERS. A run still inside its wait is `a waiting run`, and its sentence says "Mole Office
 * started" only when the run's own record says so, read the way `theOfficeStartedTheRun` reads it. A
 * secretary's or a supervisor's conversation whose run is past its wait is
 * `its own conversation`: no run is waiting, and a message still picks the conversation up.
 */
export function aConversationIsPickedUpAs(
  agentId: string,
  workspaceId: string,
  waiting: readonly WaitingRun[],
  rows?: readonly Row[],
  messageRows?: MessageRunRows,
  once: ReadOnceForManyAgents = {},
): WhoIsAnswering | null {
  const picked = theConversationAMessagePicksUp(agentId, workspaceId, waiting, rows, messageRows, once)
  if (picked === null) return null
  const run = picked.waiting
  if (run === null) {
    return { how: 'its own conversation', session: picked.session, ...whoIsAnsweringLine('its own conversation', null), hold: null }
  }
  return {
    how: 'a waiting run',
    session: run.session,
    ...whoIsAnsweringLine('a waiting run', null, null, (once.runOrigin ?? theRunAWriteCameFrom)(run.session) !== null, run.until),
    hold: null,
  }
}

// ============================================================================ a run waits for the next message

/** How many minutes a run that has answered waits for the next message before its conversation ends. */
export function howLongARunWaits(): number {
  return Math.max(0, Number(settingValue('MOLE_OFFICE_RUN_WAITS_MINUTES')))
}

/** One run that has answered and is holding its conversation open for the next message. */
export interface WaitingRun {
  /** The session record the worker filed for the run. */
  session: string
  /** The agent it served, by registry id, and the handle a person reads. */
  agentId: string
  handle: string
  /** The message it answered. */
  messageId: string
  /** The tool it was a run of, and that tool's own id for the conversation it made. */
  runtime: string
  providerSession: string
  /** When the wait ends, as local wall-clock time. */
  until: string
  /** True when that moment has passed and nothing has said so in the conversation yet. */
  over: boolean
  /** How many whole minutes are left, and zero once the wait is over. */
  minutesLeft: number
}

/**
 * EVERY RUN OF THIS PROJECT THAT IS WAITING FOR THE NEXT MESSAGE, newest first.
 *
 * Criterion M22. A run answers and its process ends, but the conversation the tool made is still
 * there and the tool can pick it up again by its own id. For `MOLE_OFFICE_RUN_WAITS_MINUTES` minutes
 * the next message to that agent goes into that same conversation; after that it ends. For a worker
 * the next message then starts a fresh conversation. For a secretary or a supervisor it still picks
 * this one up, by a decision. `theConversationAMessagePicksUp` reads this from the run
 * rows rather than from this list: a run leaves this list when its wait is said to be over.
 *
 * ---------------------------------------------------------------------------------------
 * THREE WAYS A RUN IS NOT HERE, AND EVERY ONE OF THEM IS READ RATHER THAN STORED
 * ---------------------------------------------------------------------------------------
 *
 * 1. It never started a wait. `waitsUntil` is written by `startTheWait` when the answer is filed,
 *    and only for a run whose tool said an id for the conversation. A run that printed no id cannot
 *    be picked up by anybody, so waiting for a message to pick it up would be a wait for nothing.
 * 2. The next message came. A newer run of the same agent carries the same conversation id, which is
 *    that message being answered inside this conversation. The wait did what it was for.
 * 3. It has already been said. The conversation holds a line naming this run, which is what
 *    `theWaitIsOver` writes. **The line is what makes it once**, exactly as
 *    `tellTheGroupTheAgentsAreWaiting` above uses the group's own messages rather than a flag: a
 *    stored "already said" beside the line would be a second copy of a fact the conversation holds.
 *
 * `over` is the fourth state and it is not an exit: the moment has passed and nothing has said so
 * yet. That is what the worker acts on, and it is honest on the runtime page as well — a wait that
 * ran out while nothing was watching stays here until something writes the line.
 */
export function runsWaitingForTheNextMessage(
  workspaceId?: string,
  rows: readonly Row[] = runRows(workspaceId),
  // HOW TO READ THE GOODBYE LINES, for a caller that asks about many agents one at a time and reads them once for all
  // of them (`theReachOfEachAgentAlone`).
  goodbyes: () => ReadonlySet<string> = theRunsAlreadySaidGoodbyeTo,
  // HOW AN AGENT'S ID IS LOOKED UP; see `theAgentARunServes`.
  identityOf: TheIdentityOf = theIdentityByItsOwnRead,
  // ONLY THE RUNS STILL INSIDE THEIR WAIT (wave 13y round 110, item 43), for a caller that would drop the rest: a run
  // whose wait is over is left out before its goodbye line is asked about, so where no run is inside its wait the goodbye
  // lines are not read. The list is the whole list without the runs it would mark `over`.
  insideTheirWaitOnly = false,
): WaitingRun[] {
  // THE GOODBYE LINES ARE READ ONLY WHEN A RUN IS STILL WAITING. That read looks at every message, and
  // most calls meet no waiting run at all; it is read at most once per call, as before.
  let alreadySaid: ReadonlySet<string> | null = null
  const goodbyeWasSaidTo = (session: string): boolean => (alreadySaid ??= goodbyes()).has(session)
  const now = Date.now()
  const minutes = howLongARunWaits()
  /**
   * ONE CONVERSATION IS WAITED ON BY ITS NEWEST RUN AND BY NOTHING ELSE.
   *
   * `runRows` is newest first, so the first run met carrying a conversation id is the one that is
   * still in it. Every older run carrying the same id is a run whose wait already did what it was
   * for: the next message came and was answered inside that conversation.
   */
  const met = new Set<string>()
  const out: WaitingRun[] = []
  for (const row of rows) {
    const data = dataOf(row)
    const served = theAgentARunServes(data, identityOf)
    const agentId = served?.id ?? null
    const providerSession = said(data['providerSession'])
    if (served === null || agentId === null || providerSession === null) continue
    const conversation = `${agentId}~${providerSession}`
    const theNextMessageCame = met.has(conversation)
    met.add(conversation)
    const until = said(data['waitsUntil'])
    if (until === null) continue
    if (theNextMessageCame) continue
    if (insideTheirWaitOnly && theWaitRanOut(data, now)) continue
    if (goodbyeWasSaidTo(row.id)) continue
    const messageId = said(data['deliveringMessage'])
    const runtime = said(data['runtime'])
    if (messageId === null || runtime === null) continue
    const ends = parseStoredStamp(until)
    // A DEADLINE NOTHING CAN READ IS TREATED AS OVER, and the sentence a person gets says the same
    // thing as any other ending. Leaving it waiting for ever on an unreadable stamp would be a run
    // held open by a fault nobody can see.
    const left = ends === null ? 0 : Math.max(0, Math.ceil((ends - now) / 60_000))
    out.push({
      session: row.id,
      agentId,
      // THE HANDLE ON THE ROW THE RUN WAS FOUND TO SERVE (wave 13y round 46). It was read again by the row's id, which
      // finds that same row, and building the whole participant for it ran two statements per waiting run.
      handle: served.handle,
      messageId,
      runtime,
      providerSession,
      until,
      over: theWaitRanOut(data, now),
      minutesLeft: Math.min(left, minutes),
    })
  }
  return out
}

/**
 * WHETHER A RUN'S WAIT HAS RUN OUT AT `at` (wave 13y round 91, item 24): it carries no wait, or one whose end cannot be
 * read, or `at` is at or after its end. Nothing need have said so yet; `theWaitIsOver` below is what says it.
 * `runsWaitingForTheNextMessage` sets `over` by this at the moment it reads. So a run whose wait ran out at an earlier
 * moment has run out there too, and a caller that keeps only the waits not over need not ask about that run. A clock
 * set back between the two moments is the one way the two could differ.
 */
export function theWaitRanOut(data: Record<string, unknown>, at: number): boolean {
  const until = said(data['waitsUntil'])
  const ends = until === null ? null : parseStoredStamp(until)
  return ends === null || at >= ends
}

/**
 * THE WAITING RUNS AMONG SESSION ROWS A CALLER HAS ALREADY READ: every session record of one project,
 * in the order `NEWEST_SESSION_FIRST`. The presence roster reads its rows once for every agent, and
 * a second read here would be the cost problem 9Ys6WS23aGXE measured.
 * Rows in that order that hold at least every run the message worker filed do as well, because only those are read
 * here (`sessionRecordsTheDotsReadIn` in lib/presence.ts, wave 13y round 66).
 */
export function runsWaitingAmong(workspaceId: string, sessionRows: readonly Row[], identityOf?: TheIdentityOf): WaitingRun[] {
  return runsWaitingForTheNextMessage(workspaceId, runRows(workspaceId, sessionRows), undefined, identityOf)
}

/**
 * THE RUNS AMONG THOSE ROWS STILL INSIDE THEIR WAIT (wave 13y round 110, item 43): `runsWaitingAmong` without the runs
 * whose wait is over, which are left out before the goodbye lines are read. A project where every wait is over reads
 * no goodbye line.
 */
export function runsStillInsideTheirWaitAmong(workspaceId: string, sessionRows: readonly Row[], identityOf?: TheIdentityOf): WaitingRun[] {
  return runsWaitingForTheNextMessage(workspaceId, runRows(workspaceId, sessionRows), undefined, identityOf, true)
}

/**
 * THE RUNS A LINE IN A CONVERSATION HAS ALREADY SAID GOODBYE TO.
 *
 * Every line Mole Office writes about one run carries `aboutRun` in its own data, so this is one
 * read of the messages that carry that word rather than a walk of every conversation. The `LIKE` is
 * a narrowing and not the check: what is counted is the parsed value.
 */
function theRunsAlreadySaidGoodbyeTo(): Set<string> {
  const out = new Set<string>()
  for (const row of theGoodbyeLines().all(JSON.stringify([...ENDING_LINES])) as { data: string }[]) {
    const data = JSON.parse(row.data) as Record<string, unknown> | null
    const about = said(data?.['aboutRun'])
    if (about !== null) out.add(about)
  }
  return out
}

/**
 * THE ENDING LINES, with the body tested in SQLite (wave 13y round 91, item 24). Every message naming a run was handed
 * back and parsed here to test its body, and live about 40 % of the messages name one. The test is the same: the body
 * is text and is one of the ending lines exactly. `json_extract` reads a string as `JSON.parse` reads it, escapes and
 * all, for the data the office writes. Each line's data is still handed back whole and the run it names read from it
 * above, as before.
 *
 * A LINE ABOUT A RUN IS NOT THE SAME AS A LINE SAYING THE RUN IS OVER, and until criterion H3
 * there was only one kind so nothing had to tell them apart. There are three now: a run ended
 * after waiting, a restart cut one off, and A RUN ANSWERED — and the last of those is written
 * the moment the wait STARTS. Counting it here made every run look as though its goodbye had
 * already been said, so no conversation was ever picked up again (criterion M22) and every
 * second message started a fresh one. The two ending lines are read from the declaration, so
 * this cannot drift from what is actually written.
 */
const theGoodbyeLines = keptStatement(() =>
  sqlite.prepare(
    "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
      `AND data LIKE '%"aboutRun"%' AND json_type(data, '$.body') = 'text' ` +
      "AND json_extract(data, '$.body') IN (SELECT value FROM json_each(?))",
  ),
)

/** The lines that mean a run's wait is over. Read from the declaration, never retyped. */
const ENDING_LINES = new Set<string>([
  SYSTEM_LINES.aRunWaitedAndEnded(0).line,
  SYSTEM_LINES.aKeptConversationWaitedAndEnded(0).line,
  SYSTEM_LINES.aRestartCutARunOff.line,
])

/**
 * START THE WAIT ON A RUN THAT HAS JUST ANSWERED, or say why there is none to start.
 *
 * Called from `fileTheReply` below, which is the one moment a run is known to have answered. The
 * deadline is written down rather than worked out later from when the record was last touched: a
 * patch to the record for any other reason would move a worked-out one, and a wait that quietly
 * grows is the kind of fact this project refuses to leave derivable from something unrelated.
 *
 * NOTHING WAITS WITHOUT AN ID FOR THE CONVERSATION. The whole point of the wait is that the next
 * message can be answered inside the same conversation, and that needs the tool's own id for it.
 * A run whose output held none says so on its own record — see `NO_CONVERSATION_ID` in
 * src/worker/runtimes/adapter.ts — and this returns the same answer rather than a wait for nothing.
 */
export function startTheWait(session: string, workspaceId: string): { waitsUntil: string | null; because: string } {
  const row: Row | undefined = db.select(ROW).from(records).where(eq(records.id, session)).get()
  if (row === undefined || row.kind !== 'session' || row.workspaceId !== workspaceId) {
    return { waitsUntil: null, because: `There is no run ${session} in this project, so no wait was started.` }
  }
  const data = dataOf(row)
  const provider = said(data['providerSession'])
  if (provider === null) {
    return {
      waitsUntil: null,
      because:
        'This run said no id for its conversation, so nothing can pick that conversation up and there is nothing ' +
        'to wait for. The next message starts a new run.',
    }
  }
  const minutes = howLongARunWaits()
  if (minutes === 0) {
    return {
      waitsUntil: null,
      because:
        'MOLE_OFFICE_RUN_WAITS_MINUTES is zero on this installation, so a run that has answered ends at once and ' +
        'every message starts a new run.',
    }
  }
  const waitsUntil = localStamp(new Date(Date.now() + minutes * 60_000))
  // THE PROJECT WAS CHECKED ABOVE, on the row this read. `patchRecord` takes a record id and no
  // project, so the check has to be here or nowhere.
  patchRecord(session, { dataPatch: { waitsUntil } }, THE_WORKER)
  return {
    waitsUntil,
    because: `This run waits until ${waitsUntil} for the next message, and answers it in the same conversation.`,
  }
}

/**
 * THE WAIT RAN OUT: say so in the conversation, once.
 *
 * The words are `SYSTEM_LINES.aRunWaitedAndEnded` and they are written here rather than sent in, for
 * the same reason `noRunIsNeeded` above asks the stored message rather than believing its caller: a
 * door that took a caller's sentence would let anything put words in Mole Office's mouth.
 *
 * IT REFUSES A RUN THAT IS NOT WAITING, and that includes one whose wait has not run out yet.
 * Everything it needs is stored, so the caller proves nothing and decides nothing.
 */
/**
 * WHERE A RUN IS, ASKED BEFORE ANYTHING ABOUT WHAT IT IS DOING.
 *
 * A run in another project is not "not waiting" and it is not "not cut off"; it is somewhere else,
 * and saying so is what stops a reader hunting for a record that is right there. `readMessage` in
 * lib/messages.ts refuses in exactly this shape and for this reason. Both worker doors that name a
 * run in their path ask this first.
 */
function theRunRecord(session: string, workspaceId: string): Row {
  const row: Row | undefined = db.select(ROW).from(records).where(eq(records.id, session)).get()
  if (row === undefined) {
    throw new PanelError(`No run has the id ${session}. A run is a record of kind "session".`, 404)
  }
  if (row.kind !== 'session') {
    throw new PanelError(`${session} is not a run. It is a ${kindWord(row.kind).text}.`, 400)
  }
  if (row.workspaceId !== workspaceId) {
    throw new PanelError(
      `Run ${session} is in the project "${row.workspaceId}" and this request is about "${workspaceId}".`,
      404,
    )
  }
  return row
}

/**
 * A CHECK ON THE MESSAGE A RUN WAS DELIVERING, run by the functions below on the id they worked out,
 * after their own refusals and before they write anything. It throws to refuse. The door uses it to
 * refuse a message the caller may not read without reading the run's message a
 * second time.
 */
export type MayTouchTheMessage = (messageId: string) => void

export function theWaitIsOver(
  session: string,
  workspaceId: string,
  mayTouch?: MayTouchTheMessage,
): { messageId: string; line: AnOfficeLine } {
  theRunRecord(session, workspaceId)
  const waiting = runsWaitingForTheNextMessage(workspaceId).find((one) => one.session === session)
  if (waiting === undefined) {
    throw new PanelError(
      `Run ${session} is not waiting for a message in this project, so there is nothing to end. A run is waiting ` +
        'only after it has answered and said an id for its conversation, and only until the next message arrives ' +
        'or a line in the conversation says the wait is over.',
      400,
    )
  }
  if (!waiting.over) {
    throw new PanelError(
      `Run ${session} is still waiting for the next message, until ${waiting.until}. Nothing was written.`,
      400,
    )
  }
  // A SECRETARY'S OR A SUPERVISOR'S CONVERSATION IS KEPT, as one decision settles.
  // So its line says a later message picks it up; a worker's says the next message starts a run that will not remember
  // this one. The same question `theConversationAMessagePicksUp` asks decides which.
  mayTouch?.(waiting.messageId)
  const line = aMessageAlwaysPicksUpItsConversation(waiting.agentId)
    ? SYSTEM_LINES.aKeptConversationWaitedAndEnded(howLongARunWaits())
    : SYSTEM_LINES.aRunWaitedAndEnded(howLongARunWaits())
  sayThisAboutARun(waiting.session, waiting.messageId, waiting.agentId, line, workspaceId)
  return { messageId: waiting.messageId, line }
}

/**
 * WRITE ONE LINE MOLE OFFICE SAYS INTO THE CONVERSATION A RUN WAS SERVING.
 *
 * The conversation is whichever one the message it was delivering is in — a group, or the pair of
 * whoever wrote it and the agent — and `conversationOf` is the same function the queue and the loop
 * guard ask, so nothing here has a second opinion about which conversation a message is in.
 *
 * NOTHING RECORDED WHO SENT THE MESSAGE: the line goes to the agent the run was serving, alone, with
 * `writeASystemLineToOne`. Problem MHcSOsp_u5pY: a message written by an actor id nothing here
 * registered keeps no `sentBy` — the ordinary path, documented on the field itself in
 * src/shared/kinds.ts — and until 16 September 2026 this refused, about 124,375 times in nine days,
 * because there was no conversation to write the line into while the run stayed `over` in the waits
 * list. The agent the run was talking to is where the words belong and where the run's reader can
 * find them: still a line Mole Office says about this run, still carrying `aboutRun`, so the
 * question has the goodbye been said decides from the stored line exactly as before.
 */
function sayThisAboutARun(
  session: string,
  messageId: string,
  agentId: string,
  line: AnOfficeLine,
  workspaceId: string,
): void {
  const message = readMessage(messageId, workspaceId)
  const to: ParticipantRef = { kind: 'agent', id: agentId }
  const which = conversationOf(message, to)
  if (which === null) {
    writeASystemLineToOne(to, workspaceId, line, THE_WORKER, { run: session })
    return
  }
  if (which.kind === 'group') {
    writeASystemLine(which.id, workspaceId, line, THE_WORKER, { run: session })
    return
  }
  writeASystemLineToTwo(which.between, workspaceId, line, THE_WORKER, { run: session })
}

/**
 * WHO IS ANSWERING AS ONE AGENT RIGHT NOW: a live session, a run, a run waiting for the next message,
 * or nobody.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS QUESTION HAS ONE ANSWER AND NOT TWO
 * ---------------------------------------------------------------------------------------
 *
 * Criterion H3 asks the panel to say which mind is answering, and H2 asks the worker not to start a
 * run while a session holds the handle. Those are the same question, and if the page and the worker
 * each worked it out for themselves they could disagree — the defect CLAUDE.md names as this
 * codebase's own. So there is one function and both call it.
 *
 * IT LIVES HERE RATHER THAN IN lib/handles.ts because it needs `runServing` below, and handles.ts
 * is what the worker reads to decide whether to start a run. One direction only: this file reads
 * handles.ts, handles.ts reads nothing of this file.
 *
 * A LIVE SESSION WINS OVER A RUN. While the agent is plainly open, a second one beside it does not
 * make sense. Reading the hold first is what
 * makes that true, and `theLiveHoldOn` releases a hold that went quiet before answering, so a
 * session that has gone never wins over a run that is going.
 */
export function whoIsAnsweringAs(
  agentId: string,
  workspaceId: string,
  rows?: readonly Row[],
  // THE WAITING RUNS, READ ONCE BY THE QUEUE FOR A WHOLE PASS (problem 9Ys6WS23aGXE). A caller
  // without them gets them read from `rows`, the same way the queue reads them.
  waiting?: readonly WaitingRun[],
): WhoIsAnswering {
  return theAnsweringReading(agentId, workspaceId, rows, waiting).answering
}

/**
 * WHETHER `whoIsAnsweringAs` WILL ASK ABOUT A PROCESS, read before it is asked, with no write and no question about a
 * process.
 *
 * On Windows a question about one process is a script, and a read that must not hold the server's thread reads every
 * process first, by the way that waits (`readEveryProcessFirst` in src/config/session-process.mjs). That reading is a
 * script of about a second too, so such a read asks this first and reads every process only when it says yes.
 *
 * `theAnsweringReading` asks about a process in two places: the session behind a hold that is not a run's, and
 * `theRunRowServing`, about a run record that says it is running for this agent. This asks what the reading asks before
 * each, with the same readers. A lapsed hold is not released here: the reading releases it and then finds no hold, as
 * this found none. A new place where the reading asks about a process is a change here too.
 */
export function whoIsAnsweringAsAsksAboutAProcess(agentId: string, workspaceId: string): boolean {
  const hold = theLiveHoldOn(agentId, true)
  if (hold !== null) return theRunAWriteCameFrom(hold.session) === null
  return theRunningRowsByTheAgentTheyServe(runningRunRowsIn(workspaceId)).has(agentId)
}

/**
 * THE ONE READING BEHIND `whoIsAnsweringAs`, with the two facts it read on the way.
 *
 * `hold` is the hold this reading found on the agent's handle, whatever came of it, or null because
 * there was none. `behindTheHold` is what the session named on that hold was read as, or null
 * because there was no hold or the hold is a run's. The presence dot (`participantPresence`) and the
 * queue row (`theQueue`) read these from here, so neither reads the hold a second time and neither
 * can come to a different answer from the chat's "Cannot reach" notice. Problems h1S1MLK-SQ1I and
 * TRR4WT3Kl7b4.
 */
export interface TheAnsweringReading {
  answering: WhoIsAnswering
  hold: HoldOnTheWire | null
  behindTheHold: HeldSessionReading | null
}

/** How a caller may ask for the reading: the machine it already read, whether it may release a hold, and its clock. */
export interface HowTheAnsweringIsRead extends ReadOnceForManyAgents {
  /** The machine's processes, when the caller has read them already. */
  machine?: () => readonly ResourceReport[]
  /**
   * THE MACHINE'S PROCESS ROWS OF ONE PROJECT, when a caller reads them once for each project (wave 13y round 112).
   * Only `theRunRowServing` asks it, for a run row of that project, and only when `machine` is not given. The hold's
   * session is read as before. It gives the same rows as `listResources` for one session of that project.
   */
  machineOfTheProject?: (workspaceId: string) => readonly ResourceReport[]
  /**
   * THE MACHINE'S PROCESS ROWS OF ONE SESSION OF THE CALLER'S PROJECT, when a caller reads them session by session (wave
   * 13y round 118, item 50). The hold's session and `theRunRowServing` ask it in place of `machine`, which is then read
   * only by what reads every row. It gives the rows `machine` gives for that session, in their order.
   */
  machineOfTheSession?: (session: string) => readonly ResourceReport[]
  /** True when this read must not release a hold that has lapsed. */
  readOnly?: boolean
  /** The instant the whole reading is measured against. */
  at?: number
  /**
   * THE RUNNING ROWS OF `rows`, BY THE AGENT EACH ONE SERVES, when a caller asking about many agents has worked them out
   * once with `theRunningRowsByTheAgentTheyServe`. Measured 9 October 2026 on an office of the live shape (round 13 of
   * wave 13y): the presence roster asked `theRunRowServing` for each of 220 agents, and each asked which agent every one
   * of 1,500 running rows serves, which was 207 of the 512 ms the roster took. Only a row this agent's run is can be
   * the answer, so its own rows give the same answer as all of them. They must be worked out from the `rows` handed in.
   */
  runningRows?: () => ReadonlyMap<string, readonly Row[]>
  /** Message-worker run rows grouped once for this pass, from the same project and rows handed in. */
  messageRows?: MessageRunRows
  /**
   * THE HOLD ON THIS AGENT'S HANDLE, when the caller read it already with `theLiveHoldOn` at `at` and the same
   * `readOnly`. Null is an answer here: the caller read it and there is no hold.
   */
  hold?: HoldOnTheWire | null
}

type MessageRunRows = () => ReadonlyMap<string, readonly Row[]>

/**
 * Message runs grouped by their resolved agent, in their original order (wave 13y round 39).
 * The resume reader and the answering reader share this work within a queue pass. Each still selects the conversation
 * through theConversationAMessagePicksUp. Resolve stored ids and old handle references through theAgentARunServes.
 */
export function theMessageRunRowsByTheAgentTheyServe(
  workspaceId: string,
  rows: readonly Row[],
  identityOf?: TheIdentityOf,
): ReadonlyMap<string, readonly Row[]> {
  const byAgent = new Map<string, Row[]>()
  for (const row of runRows(workspaceId, rows)) {
    const agentId = theAgentARunServes(dataOf(row), identityOf)?.id
    if (agentId === undefined) continue
    const held = byAgent.get(agentId)
    if (held === undefined) byAgent.set(agentId, [row])
    else held.push(row)
  }
  return byAgent
}

/**
 * EVERY ROW OF `rows` WHOSE RECORD SAYS `running`, BY THE REGISTRY ID OF THE AGENT IT SERVES, in the order of `rows`.
 * A row that serves nobody the registry knows is left out, because `theRunRowServing` passes it for every agent.
 */
export function theRunningRowsByTheAgentTheyServe(rows: readonly Row[], identityOf?: TheIdentityOf): ReadonlyMap<string, readonly Row[]> {
  const byAgent = new Map<string, Row[]>()
  for (const row of rows) {
    const data = dataOf(row)
    if (said(data['state']) !== 'running') continue
    const agentId = theAgentARunServes(data, identityOf)?.id
    if (agentId === undefined) continue
    const held = byAgent.get(agentId)
    if (held === undefined) byAgent.set(agentId, [row])
    else held.push(row)
  }
  return byAgent
}

export function theAnsweringReading(
  agentId: string,
  workspaceId: string,
  rows?: readonly Row[],
  // THE WAITING RUNS, OR HOW TO READ THEM ONCE. A caller that asks about many agents and may need them for none hands
  // in the reader, so they are read only when a reading comes to them (`theReadingsForOneSend` in superiors.ts).
  waiting?: readonly WaitingRun[] | (() => readonly WaitingRun[]),
  how: HowTheAnsweringIsRead = {},
): TheAnsweringReading {
  /**
   * NOBODY, UNLESS A MESSAGE PICKS UP THIS AGENT'S OWN CONVERSATION (criterion M89).
   *
   * A run that has answered has ended its process and released its hold, but for the length of its
   * wait the queue gives the next message to that run's conversation without asking anybody
   * (criterion M22). A secretary's or a supervisor's conversation is given the next message after the
   * wait as well, under a decision. So the agent can be reached, and this says so. The
   * conversation is read by `theConversationAMessagePicksUp`, the reader the queue uses, so the two
   * cannot disagree. `nobodysSentence` is what the reading says when no conversation is picked up.
   */
  // THE NOBODY LINE CARRIES ITS CODE (wave 13k round 35) so a page draws it in its own language; a sentence that
  // is not the nobody line (`behind.says`) carries none, and a page draws it as it came.
  const nobodyOrAWaitingRun = (nobodysLine: { says: string; said?: WhoIsAnswering['said'] }): WhoIsAnswering => {
    // A CALLER THAT HANDS IN NO ROWS GETS ONLY THE RUNS THAT MAY SERVE THIS AGENT. Both readers below
    // keep only this agent's runs, and a run of another agent cannot change what they say about this
    // one: a conversation waited on is named by its agent as well as its own id.
    // `theRunRowsThatMayServe` says why its rows are enough.
    const runs = rows ?? theRunRowsThatMayServe(agentId, workspaceId, how.aliases ?? theFiledAliasesReadOnce(sqlite))
    return (
      aConversationIsPickedUpAs(agentId, workspaceId, (typeof waiting === 'function' ? waiting() : waiting) ?? runsWaitingForTheNextMessage(workspaceId, runRows(workspaceId, runs), undefined, how.identityOf), runs, how.messageRows, how) ?? {
        how: 'nobody',
        session: null,
        says: nobodysLine.says,
        ...(nobodysLine.said === undefined ? {} : { said: nobodysLine.said }),
        hold: null,
      }
    )
  }
  // ONE INSTANT FOR THE WHOLE READING. The hold's window and the session's transcript are measured
  // against this, so the two cannot disagree because one of them asked a slightly later clock.
  const at = how.at ?? Date.now()
  // THIS AGENT'S RUNNING ROWS ONLY, when the caller worked them out for a roster; see `runningRows` above.
  const itsRunningRows = rows !== undefined && how.runningRows !== undefined ? (how.runningRows().get(agentId) ?? []) : rows
  const hold = how.hold !== undefined ? how.hold : theLiveHoldOn(agentId, how.readOnly ?? false, at)
  const read = (answering: WhoIsAnswering, behindTheHold: HeldSessionReading | null = null): TheAnsweringReading => ({
    answering,
    hold,
    behindTheHold,
  })
  if (hold !== null) {
    /**
     * A RUN HOLDS THE HANDLE TOO, SINCE M79, AND IT IS NOT A LIVE SESSION.
     *
     * A run takes the same hold a terminal does, because the fact is the same fact: this session is
     * the one answering as this agent. What a reader needs is which KIND of mind it is — a terminal
     * somebody has open carries everything said in it, a run is a fresh process that knows only
     * what Mole Office handed it (criterion H3) — so the hold's own session record is asked, and
     * `startedByMoleOffice` on it is the answer.
     */
    const asARun = (how.runOrigin ?? theRunAWriteCameFrom)(hold.session)
    if (asARun !== null) {
      return read({
        how: 'a run',
        session: hold.session,
        ...whoIsAnsweringLine('a run', null, theSandboxNameOfTheRunWithId(hold.session), true),
        hold,
      })
    }
    /**
     * A FRESH BEAT IS NOT ENOUGH. The waiter that beats this hold can outlive the session it
     * speaks for (problem `DyEIJyDCG01X`), so the session named on the row is asked whether it is
     * still there — its own process row, or its own transcript inside the hold's window. When
     * neither can be read this is `nobody` with the reading's own sentence naming what could not be
     * read; the handle door never answers a live session on the heartbeat alone. Criterion M106.
     */
    const ofTheSession = how.machineOfTheSession
    const behind = (how.behindTheHold ?? theSessionBehindTheHold)(hold, workspaceId, new Date(at), ofTheSession === undefined ? how.machine : () => ofTheSession(hold.session))
    if (behind.answering) {
      return read(
        {
          how: 'a live session',
          session: hold.session,
          ...whoIsAnsweringLine('a live session', { machine: hold.machine, runtime: hold.runtime }),
          hold,
        },
        behind,
      )
    }
    // A RUN UNDER A HOLD WHOSE SESSION IS GONE STILL WINS, because the run is what can take a
    // message; the dead session's hold does not hide it.
    const underIt = theRunRowServing(agentId, workspaceId, itsRunningRows, theProcessRowsOfASession(how), how.identityOf, how.machineOfTheProject)
    if (underIt !== null) {
      return read(
        {
          how: 'a run',
          session: underIt.id,
          ...whoIsAnsweringLine('a run', null, theSandboxNameIn(dataOf(underIt)), theOfficeStartedTheRun(underIt)),
          hold: null,
        },
        behind,
      )
    }
    return read(nobodyOrAWaitingRun(behind.says === undefined || behind.says === null ? whoIsAnsweringLine('nobody', null) : { says: behind.says }), behind)
  }
  const run = theRunRowServing(agentId, workspaceId, itsRunningRows, theProcessRowsOfASession(how), how.identityOf, how.machineOfTheProject)
  if (run !== null) {
    return read({
      how: 'a run',
      session: run.id,
      ...whoIsAnsweringLine('a run', null, theSandboxNameIn(dataOf(run)), theOfficeStartedTheRun(run)),
      hold: null,
    })
  }
  return read(nobodyOrAWaitingRun(whoIsAnsweringLine('nobody', null)))
}

/**
 * WHO WOULD ANSWER AS THIS AGENT, READ AS THE MESSAGE WORKER READS IT, from whichever project it is asked (wave 13y round
 * 112, item 46). The chat belongs to no project, and since round 112 the worker takes a message to an agent whose
 * conversation it picks up from whichever project it was written in. So the chat asks what the worker's queue asks: a
 * run going for the agent in any project, and the conversation a message picks up among the runs the worker started in
 * its own project, `settings().workspace`. The "Cannot reach" box then reads the same from every project.
 *
 * THE READING ITSELF IS `theAnsweringReading`, hold first, with only this agent's rows: its running rows of every project
 * and its message runs of the worker's project, each read through its index (`aRunMayServe`).
 */
export function theAnsweringReadingOfTheWorker(agentId: string, aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite)): TheAnsweringReading {
  const workspaceId = settings().workspace
  let mayServe: Row[] | undefined
  const itsMessageRuns = () => (mayServe ??= theRunRowsThatMayServe(agentId, workspaceId, aliases))
  return theAnsweringReading(
    agentId,
    workspaceId,
    runRowsWhere(undefined, and(IS_RUNNING, aRunMayServe(agentId, aliases))),
    () => runsWaitingForTheNextMessage(workspaceId, runRows(workspaceId, itsMessageRuns())),
    { aliases, messageRows: () => theMessageRunRowsByTheAgentTheyServe(workspaceId, itsMessageRuns()) },
  )
}

/**
 * WHY ONE AGENT CANNOT BE REACHED, THAT THE OFFICE COULD NOT TELL, or null because somebody is
 * answering as it.
 *
 * A decision and decision J1Qge4JH87bv: a message to a worker that cannot be
 * contacted — a retired one, or one nothing is answering as — goes up the chain of starters. "Cannot
 * be reached" has one reading and this is it. The retired check comes first, because a retired agent
 * is out of the registry's working set whatever any process says; otherwise this asks the same
 * reader the chat draws as "Cannot reach", `theAnsweringReading`, and nobody answering is unreachable.
 *
 * "COULD NOT TELL" IS NOT "CANNOT BE REACHED" (problem `TOoUy7fMbg1P`). When nobody else is answering
 * as the agent and the session holding its handle has a live process but a transcript the office
 * could not read, the reading behind the hold says `couldNotTell`. That comes back here as its own
 * answer, `was: 'could not tell'`, so a caller cannot route on it by mistake: the routing up the chain
 * takes only a `WhyThisAgentCannotBeReached`, which is the two known answers.
 *
 * NOTHING ELSE DECIDES REACHABILITY. The presence dot, `runServing`, a hold and a run are read
 * second ways, and a second way is a second answer: the chat and the routing would come to say
 * different things about one agent. `rows` is the run rows a caller read, or how to read them, and
 * `waiting` how to read the runs waiting among them. The dead-letter sweep reads the rows any reach
 * reads once (`theRunRowsAnyReachReads`) and hands the same rows to every call. A message hands each
 * agent its own (`theReachOfEachAgentAlone`).
 *
 * The returned `because` is the reading's own full sentence, kept word for word; the short clause a
 * person reads on the routed line is chosen from `was`, never worked out again.
 */
export interface WhyThisAgentCannotBeReached {
  /** Which of the two known readings answered. */
  was: RoutedWas
  /** The reading's own full sentence. */
  because: string
  /**
   * THE GREY WORD OF AN AGENT NOTHING IS ANSWERING AS AND NOTHING HOLDS, asked only when a caller needs it. A person's
   * send to such an agent answers 409 in this word, the word its dot shows. It is non-enumerable, so every comparison
   * and every `JSON.stringify` of a reach reading is exactly what it was; and it is lazy, so the ordinary send path never
   * reads the addressee's latest session rows for a word nobody asked to see. A `retired` answer, a `could not tell`
   * answer and an answer for a handle a session holds have no such field.
   *
   * It is a function so one reading can cache its answer: a caller that asks twice reads the rows once.
   */
  theWordOf?: () => GreyPresenceWord
}

/** The third answer: a process of the agent's session is alive, and the office could not tell whether it is answering. */
export interface TheOfficeCouldNotTell {
  was: 'could not tell'
  /** The reading's own full sentence, which says what could not be read. */
  because: string
}

export function whyThisAgentCannotBeReached(
  agentId: string,
  workspaceId: string,
  rows?: readonly Row[] | (() => readonly Row[]),
  waiting?: () => readonly WaitingRun[],
): WhyThisAgentCannotBeReached | TheOfficeCouldNotTell | null {
  const retired = whyThisAgentIsRetired(agentId)
  if (retired !== null) return retired
  const reading = theAnsweringReading(agentId, workspaceId, typeof rows === 'function' ? rows() : rows, waiting)
  const reach = whatAReadingSaysOfReach(reading)
  if (reach === null || reach.was !== 'nothing answering') return reach
  // A HELD HANDLE GETS NO WORD, SO A PERSON'S SEND TO IT STAYS 201. A waiter holding the handle takes the message when it
  // comes, even when no live session or run is behind its hold, so a send to it is delivered and is not refused. The
  // send is still routed up the chain of starters, as before.
  if (reading.hold !== null) return reach
  // NOR DOES AN AGENT WITH A REQUEST OPEN ON ITS WAITING DOOR. The open request receives the letter: the delivery wakes it,
  // and it answers with the letter. So the send stays 201 and is still routed up the chain, as for a held handle. Once the
  // request has closed, nothing receives for the agent, and the word is attached again.
  if (aWaitIsHeldFor(agentId)) return reach
  // THE WORD IS ATTACHED ONLY HERE, ONLY LAZILY, AND NON-ENUMERABLY. The ordinary send path never calls it.
  let word: GreyPresenceWord | null = null
  Object.defineProperty(reach, 'theWordOf', {
    enumerable: false,
    configurable: true,
    value: (): GreyPresenceWord => (word ??= theGreyWordOfAnUnansweredAgent(agentId, workspaceId)),
  })
  return reach
}

/**
 * THE RETIRED HALF OF `whyThisAgentCannotBeReached`, which it asks first: the registry row alone, and no run. The office's
 * own lines route on retired only, so a send of one asks this and asks the whole reading only of a retired addressee.
 */
export function whyThisAgentIsRetired(agentId: string): WhyThisAgentCannotBeReached | null {
  const who: ParticipantRef = { kind: 'agent', id: agentId }
  const red = theRedReasonFor(who, readParticipant(who))
  return red === null ? null : { was: 'retired', because: red }
}

/**
 * THE THREE-WAY ANSWER FROM ONE ANSWERING READING: null when somebody is answering, 'could not
 * tell', or 'nothing answering'. whyThisAgentCannotBeReached asks it after the retired check, and
 * the chat's conversation door asks it of the same reading it draws the answering from, so the two
 * are decided here once.
 */
export function whatAReadingSaysOfReach(
  reading: TheAnsweringReading,
): { was: 'nothing answering'; because: string } | TheOfficeCouldNotTell | null {
  if (reading.answering.how !== 'nobody') return null
  const behind = reading.behindTheHold
  if (behind !== null && !behind.answering && behind.couldNotTell) {
    return { was: 'could not tell', because: behind.says ?? reading.answering.says }
  }
  return { was: 'nothing answering', because: reading.answering.says }
}

/**
 * THE PROCESS ROWS OF ONE SESSION, AS A CALLER OF THE ANSWERING READING READS THEM: its own reader of one session, else
 * the session's rows of the machine it read whole, else nothing, and `theRunRowServing` reads them itself.
 */
function theProcessRowsOfASession(how: HowTheAnsweringIsRead): ((session: string) => readonly ResourceReport[]) | undefined {
  const { machine, machineOfTheSession } = how
  if (machineOfTheSession !== undefined) return machineOfTheSession
  return machine === undefined ? undefined : (session) => machine().filter((held) => held.sessionRecordId === session)
}

/**
 * THE RUN THIS AGENT ALREADY HAS GOING, by its session record, or null because it has none.
 *
 * A SESSION RECORD SAYING `running` IS NOT ENOUGH, and this is the whole reason there are two
 * questions here. A record is what somebody wrote down; the ledger and the process table are what
 * is true. A worker that is restarted loses track of the runs it started, and their session records
 * stay marked running for ever — measured on 4 September 2026, where one such record blocked every
 * later message to that agent with nothing wrong on any screen. So the ledger is asked too, and
 * only a run whose process is alive NOW counts as one.
 */
export function runServing(
  agentId: string,
  workspaceId: string,
  // THE SESSION ROWS, READ ONCE BY A CALLER THAT ASKS FOR MANY AGENTS (the queue reader, twice per
  // queued row). Problem 9Ys6WS23aGXE. A caller without them gets them read by `theRunRowServing`,
  // which reads EVERY run row and not `runRows`: a run started with `tools/sandbox.mjs exec` carries
  // no `deliveringMessage`, and this question is whether any run is going, not whether the message
  // worker started it. See `everyRunRow` below.
  rows?: readonly Row[],
): string | null {
  return theRunRowServing(agentId, workspaceId, rows)?.id ?? null
}

/**
 * The row of the run this agent already has going, or null because it has none.
 *
 * The same three readings `runServing` makes, but the row comes back whole so a caller can say
 * where the run is going — its sandbox, when its own record names one. `rows` is optional here, and
 * the default is every run row whose record says `running`: a caller that passes nothing still sees a
 * run started in a sandbox. The loop below skips every other row, so the database is asked to leave
 * them out, through the index migration 0199 made. Reading every run row whole was 6,000 session
 * records for one conversation on an office of the live shape (round 33 of wave 13n).
 */
function theRunRowServing(
  agentId: string,
  workspaceId: string,
  // ASKED BY `runningRunRowsIn` BELOW, so every reader of the running rows asks in the one place that
  // writes the index's words.
  rows: readonly Row[] = runningRunRowsIn(workspaceId),
  // THE MACHINE'S PROCESS ROWS OF ONE SESSION, WHEN THE CALLER READS THEM ITSELF (`theProcessRowsOfASession`). The
  // presence roster reads them once for every agent (11 September 2026, `liveProcessesFor` in lib/presence.ts), and its
  // dot asks this for each agent. They are the same live rows `listResources` gives for one session, so the answer is the
  // same either way.
  machineOfTheSession?: (session: string) => readonly ResourceReport[],
  identityOf?: TheIdentityOf,
  // THE MACHINE'S PROCESS ROWS OF EACH PROJECT, when the caller reads them once for each project (`machineOfTheProject`
  // on `HowTheAnsweringIsRead`).
  machineOfTheProject?: (workspaceId: string) => readonly ResourceReport[],
): Row | null {
  for (const row of rows) {
    const data = dataOf(row)
    if (said(data['state']) !== 'running') continue
    if (theAgentARunServes(data, identityOf)?.id !== agentId) continue
    // A RUN THE OFFICE STARTED IS ALIVE WHEN ITS OWN PROCESS IS, never a command it ran. Its commands
    // file rows under the same session (`tools/sandbox.mjs exec --session <run>`), and a live build of
    // a run whose agent has ended is not that agent at work. `theToolsOwnProcessRow` tells the two apart.
    //
    // A RUN STARTED WITH `tools/sandbox.mjs exec` IS STILL READ BY ANY LIVE PROCESS ROW. The launcher
    // registers the agent's own process without `startedByTheProduct`, the same as the rows of the
    // commands the run starts, so nothing on those rows tells the run's own process apart yet. Reading
    // only a marked row would read every such run as not running. Marking that row is the launcher's
    // to do, in tools/sandbox.mjs and tools/sandbox-start.mjs.
    // New checkpoint runs use the marked process the launcher already files. Unmarked legacy runs keep their old reading.
    // ITS PROCESS IS ASKED IN THE RUN'S OWN PROJECT, which is the caller's project unless the caller read the rows of
    // every project (wave 13y round 112).
    const alive =
      data['startedByMoleOffice'] === true || aCheckpointRun(data)
        ? theLastToolRunStillRuns(row.workspaceId, { session: row.id }) !== null
        : (machineOfTheSession !== undefined
            ? machineOfTheSession(row.id)
            : machineOfTheProject !== undefined
              ? machineOfTheProject(row.workspaceId).filter((held) => held.sessionRecordId === row.id)
              : listResources({ workspaceId: row.workspaceId, sessionRecordId: row.id })
          ).some((held) => held.type === 'process' && held.liveness.state === 'alive')
    if (alive) return row
  }
  return null
}

/**
 * Whether a run's own record says Mole Office started it.
 *
 * Read through `theRunAWriteCameFrom`, the same reader that decides a run holds the handle, so the
 * answering sentence and the hold can never disagree about who started a run. A record with no
 * `startedByMoleOffice`, or one whose value is not true, is not a run the office started.
 */
function theOfficeStartedTheRun(row: Row): boolean {
  return theRunAWriteCameFrom(row.id) !== null
}

/**
 * The sandbox a run's own record names, as the INSTANCE a person and `tools/sandbox.mjs` call it, or null
 * for a run on the host.
 *
 * THE TEMPLATE IS NOT THE SANDBOX'S NAME. A run's `sandbox` field always carries the template the sandbox
 * was made from, and every sandbox on this machine comes from one template (`mole-office-dev`). Naming the
 * template would make two different sandboxes, such as `w6` and `inspector-inspector`, read the same, and
 * neither name would be one `node tools/sandbox.mjs exec <instance>` accepts. So the template is never used
 * here. The instance is the last segment of the record's sandbox folder, which is the name the launcher was
 * given; an `instance` field is used when a record one day carries it. Nothing is invented: a run with no
 * sandbox field happened on the host.
 */
function theSandboxNameIn(data: Record<string, unknown>): string | null {
  const sandbox = data['sandbox']
  if (typeof sandbox !== 'object' || sandbox === null || Array.isArray(sandbox)) return null
  const record = sandbox as Record<string, unknown>
  const instance = said(record['instance'])
  if (instance !== null) return instance
  const folder = said(record['folder'])
  if (folder === null) return null
  const lastSegment = folder.replace(/\/+$/, '').split('/').pop()
  return lastSegment === undefined || lastSegment === '' ? null : lastSegment
}

/**
 * The sandbox name of one run, read from its own session record by id.
 *
 * The hold-a-run path already knows the session record's id and needs only this one field, so it
 * reads the row by its primary key rather than scanning every session row.
 */
function theSandboxNameOfTheRunWithId(session: string): string | null {
  const row = db
    .select(ROW)
    .from(records)
    .where(and(eq(records.id, session), eq(records.kind, 'session'), isNull(records.deletedAt)))
    .get()
  return row === undefined ? null : theSandboxNameIn(dataOf(row))
}

/**
 * Every session row that could be a run, newest first, with no test on who started it.
 *
 * THIS IS THE ONE QUERY AND THE ONE ORDERING. `runRows` below is this same list with one more test:
 * a row is kept only when the message worker wrote `deliveringMessage` on it. That test is right for
 * the readers that act on runs the message worker started, and wrong for `runServing`, which asks
 * only whether SOME run is going for an agent. A run started with `tools/sandbox.mjs exec` carries
 * no `deliveringMessage`, so it is in this list and not in `runRows`. Reading the ordering here and
 * filtering this list there means the two cannot drift into different orders.
 *
 * NEWEST FIRST MEANS `rowid` AS WELL AS THE STAMP, and the second half is load-bearing rather than
 * tidy. Stamps here are whole seconds, and two runs of one agent inside one second are ordinary:
 * a message answered in milliseconds and the next one answered in the same second. On the stamp
 * alone those two tie, and SQLite may return either first, so *which run is in this conversation
 * now* would have two answers depending on nothing. `rowid` is the order SQLite appended them in.
 * `messagesSinceTheOwnerRead` in lib/messages.ts and the wake queue in lib/wake.ts break the same
 * tie the same way. Measured on 4 September 2026: a resumed run and the run it resumed both looked
 * newest, and `runsWaitingForTheNextMessage` reported the older one as still waiting.
 */
export { NEWEST_SESSION_FIRST } from '../db/newest-session-first.ts'

export function everyRunRow(workspaceId?: string): Row[] {
  return runRowsWhere(workspaceId, undefined)
}

export { runRowsWhere } from './the-run-rows-of-one-reach.ts'

/**
 * THE RUNNING SESSION ROWS OF ONE PROJECT, newest first.
 *
 * The same reading `runServing` makes by default, given back whole so a caller can say which rows put
 * it there. The condition is asked in the words of the index `records_session_running_idx`, from
 * `STORED_FIELDS`, so SQLite uses that partial index instead of reading every session record of the
 * project. One reader, so the hook's question and the office's own question cannot come to read
 * running rows two ways.
 */
export function runningRunRowsIn(workspaceId: string): Row[] {
  return runRowsWhere(workspaceId, IS_RUNNING)
}

/**
 * THE RUNNING SESSION ROWS OF EVERY PROJECT, newest first, through the same index (wave 13y round 112, item 46). The
 * worker's queue and the chat ask whether a run is going for an agent in any project it works in.
 */
function runningRunRowsInEveryProject(): Row[] {
  return runRowsWhere(undefined, IS_RUNNING)
}

export { IS_RUNNING } from './the-run-rows-of-one-reach.ts'

/**
 * THE RUN ROW WITH THIS ID, or null: the row `everyRunRow(workspaceId)` would hold for it, a session
 * record of the project that is not deleted, read alone, for a reader that needs one run and not the list.
 */
function theRunRowWithId(workspaceId: string, session: string): Row | null {
  return runRowsWhere(workspaceId, eq(records.id, session))[0] ?? null
}

export { HOLDS_A_MESSAGE_TO_HAND_OVER } from './the-run-rows-of-one-reach.ts'

/**
 * THE RUN ROWS OF ONE PROJECT THAT MAY SERVE ONE AGENT, newest first: every row `runRows` would keep
 * whose `servingAgentId` or `servingAgent` holds the agent's id, its handle or the id of one of its
 * agent records somewhere in the text.
 *
 * WHY THESE ROWS ARE ENOUGH. `theAgentARunServes` names this agent only when one of those two fields,
 * trimmed, is the agent's id or handle, or is the id of a record of this agent. Each of those strings
 * is inside the field's text, so each row that serves the agent is kept. A row kept that serves
 * another agent is thrown away by the readers that ask, exactly as before. The order is
 * `everyRunRow`'s.
 *
 * WHY IT EXISTS. The answering reading of one agent read every run row of the project and parsed
 * each one. On an office of the live shape that was 2,400 runs read for one conversation (round 33 of
 * wave 13n). The database now keeps only the few that name the agent.
 */
function theRunRowsThatMayServe(agentId: string, workspaceId: string, aliases: TheFiledAliases): Row[] {
  return runRowsWhere(workspaceId, and(HOLDS_A_MESSAGE_TO_HAND_OVER, aRunMayServe(agentId, aliases)))
}

export { aRunMayServe } from './the-run-rows-of-one-reach.ts'

export { theRunRowsOfOneReach } from './the-run-rows-of-one-reach.ts'

/**
 * THE RUN ROWS OF ONE PROJECT THAT ANY AGENT'S REACH READS, newest first: `theRunRowsOfOneReach` for every agent at once.
 * Each reader keeps only the rows of the agent it asks about, as said above, so another agent's rows change nothing.
 *
 * WHY IT EXISTS. The dead-letter sweep asks the reach of every rung its letters walk past. It read every session record
 * of the project whole for them and kept the rows to the end of the sweep. On the made-up office of the live counts of
 * 11 November 2026 that was 21,970 rows and 3.8 seconds of reading, and each sweep after the first held the server for
 * 13.5 seconds. These rows were 735, read in 78 ms, and each sweep after the first held the server for 3.4 seconds, with
 * the same answer (round 160 of wave 13y).
 */
export function theRunRowsAnyReachReads(workspaceId: string): Row[] {
  return theRunRowsOfTheTwoHalves(workspaceId, undefined)
}

export { theRunRowsOfTheTwoHalves } from './the-run-rows-of-one-reach.ts'

/**
 * EACH AGENT'S REACH IN ONE PROJECT, READ FROM ITS OWN RUN ROWS ONLY (`theRunRowsOfOneReach`). One message's readings
 * (`theReadingsForOneMessage` in superiors.ts) ask it for the addressee and each rung of its walk.
 *
 * THE GOODBYE LINES ARE READ ONCE FOR ALL OF THEM. `runsWaitingForTheNextMessage` reads them when an agent has a run
 * still waiting, and that read looks at every message. Asked of each agent alone it would be read once for each agent
 * with a waiting run, where a read of every run row read it once.
 */
export function theReachOfEachAgentAlone(workspaceId: string): (agentId: string) => ReturnType<typeof whyThisAgentCannotBeReached> {
  let goodbyes: ReadonlySet<string> | null = null
  const theGoodbyes = (): ReadonlySet<string> => (goodbyes ??= theRunsAlreadySaidGoodbyeTo())
  // AND THE FILED ALIASES, read once for every agent of the reading.
  const aliases = theFiledAliasesReadOnce(sqlite)
  return (agentId) => {
    let rows: Row[] | null = null
    const its = (): Row[] => (rows ??= theRunRowsOfOneReach(agentId, workspaceId, aliases))
    return whyThisAgentCannotBeReached(agentId, workspaceId, its, () => runsWaitingForTheNextMessage(workspaceId, runRows(workspaceId, its()), theGoodbyes))
  }
}

/**
 * Every session record the worker filed for a run, newest first.
 *
 * `workspaceId` narrows it to one project, which is what the queue and the resume lookup want. The
 * runtime page passes nothing, because the worker is one process for the whole installation and a
 * count of its runs that left out another project's would be wrong about the machine.
 *
 * THIS IS `everyRunRow` WITH ONE MORE TEST, so the query and the ordering live in one place: a row
 * is kept only when the message worker wrote `deliveringMessage` on it. That is the right set for
 * the readers that act on runs the message worker started. It is the wrong set for `runServing`,
 * which asks whether SOME run is going for an agent.
 *
 * `rows` IS `everyRunRow` ALREADY READ BY A CALLER THAT ALSO NEEDS THE UNFILTERED LIST. The queue
 * reads both in one pass and passes the list here, so the query and its ordering are not run twice.
 * A caller that hands in no rows gets only the rows that hold a message to hand over, read through
 * the index. The filter below keeps no other row, and still drops a value that is not a string, or
 * is only spaces.
 */
function runRows(workspaceId?: string, rows?: readonly Row[]): Row[] {
  return (rows ?? runRowsWhere(workspaceId, HOLDS_A_MESSAGE_TO_HAND_OVER)).filter((row) => said(dataOf(row)['deliveringMessage']) !== null)
}

/**
 * THE RUN THAT THE RUN AT `at` PICKED UP ITS CONVERSATION FROM, or null because it started a new one.
 *
 * A run that picked up a conversation was filed with that conversation's id as its own `providerSession`
 * (src/worker/index.ts), so an OLDER run of the same agent carries the same id. A run that started a new conversation
 * carries an id no earlier run has. `runs` is `runRows`, newest first, so the first such older run is the newest one
 * before this run, which is the one it continues. The line saying a run answered and the restart's pick-up both read it
 * here, and `PickUp.run` names the same run before the new one is filed.
 */
function theRunItPickedUp(runs: readonly Row[], at: number): Row | null {
  const itsData = at === -1 ? null : dataOf(runs[at] as Row)
  const itsConversation = itsData === null ? null : said(itsData['providerSession'])
  const itsAgent = itsData === null ? null : (theAgentARunServes(itsData)?.id ?? null)
  if (itsConversation === null || itsAgent === null) return null
  return (
    runs.slice(at + 1).find((older) => {
      const data = dataOf(older)
      return said(data['providerSession']) === itsConversation && theAgentARunServes(data)?.id === itsAgent
    }) ?? null
  )
}

/**
 * EVERY MESSAGE STILL WAITING FOR A RUN, oldest first.
 *
 * A message is here when its delivery row for an agent is still marked queued. A message to a
 * person is not: nobody starts a process for a person. A message to an agent nothing knows about is
 * not either, and the row says why rather than being left silent.
 *
 * NARROW FIRST, AS A DECISION SAYS. Measured since 27 August 2026: worker.queue answered
 * 26.6 GB in 55,487 calls, about 479 KB each, and nearly all of it `body` — the whole words of
 * every queued message, read again by a worker pass that starts few runs. Without a body the same
 * list carries the ids, the small fields the worker judges on and nothing else, and a caller that
 * will START something asks for the words once, by the message record it is about to deliver.
 * `theQueue(workspaceId)` is the narrow list; `{ full: true }` puts `body` back and answers exactly
 * what this door answered before. Nothing a caller reads today disappears.
 *
 * THE FIRST READ IS JOINED TO `records` AND FILTERED TO THIS WORKSPACE, rather than reading every
 * queued delivery in the installation and dropping the ones that miss inside the loop below.
 * Measured on the idle copy on 11 September 2026 (problem 9UeL9VeVPn33): 670 queued deliveries
 * exist across every project, and a call for one workspace used to read and hold all 670 before
 * the second query narrowed which of them got the expensive per-row work. `messageId` carries a
 * foreign key to `records.id` with foreign keys on, so an inner join drops nothing an outer join
 * would have kept — every delivery row really does have a records row to join to.
 */
export function deliveryIdsInheritedFromTheCopy(): ReadonlySet<string> | null {
  const path = settingValue('MOLE_OFFICE_WORLD_INHERITED_DELIVERIES')
  if (path === null) return null
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(
      `This world could not read the queued deliveries its copy brought from ${path}: ` +
        (error instanceof Error ? error.message : String(error)),
    )
  }
  if (!Array.isArray(value) || !value.every((one) => typeof one === 'string' && one !== '')) {
    throw new Error(`This world has an unreadable list of queued deliveries from its copy at ${path}.`)
  }
  return new Set(value)
}

/** Fields a queue poll needs to decide which deliveries may start. */
export const QUEUE_DECISION_FIELDS = [
  'messageId', 'title', 'to', 'inheritedFromCopy', 'needsNoRun', 'wouldHaveHeld', 'heldByStarterChange',
  'inspection', 'askOfASettledRun', 'retired', 'handle', 'heldByNoticeRule', 'heldWhileAsleep', 'runtime',
  'heldByALiveSession', 'heldByAReview', 'conversationIsWaiting', 'sentBy', 'hops', 'runningAlready',
  'runningAlreadySays', 'nobodyIsAnsweringAsIt',
] as const

/** A settled ask the reading can hand to the explicit marking step without building its full queue row. */
export interface SettledAskDelivery { messageId: string; to: ParticipantRef }

/**
 * The most rows one queue page answers. A paged request reads one candidate more than this at a time, so that one
 * reading usually shows whether there is a next page.
 */
export const QUEUE_PAGE_SIZE = 20

export interface QueueCursor { priority: number; createdAt: string; messageRow: number; deliveryRow: number }
export interface QueueCandidate extends QueueCursor { id: string; messageId: string; recipientId: string; inTheView: number | null }

const QUEUE_SCAN_CHUNK = 512

/**
 * THE NEXT QUEUED DELIVERIES AFTER THE CURSOR, urgent ones first, then in the order the messages were made. An answer
 * holds at most a page and one.
 *
 * THE URGENT ONES ARE FOUND FROM THE DELIVERY ROWS. Whether a message is urgent is inside its data, which no index
 * holds, so a walk of the message index reads every message before it can say that none is urgent. The delivery rows
 * are read instead, QUEUE_SCAN_CHUNK at a time by rowid, and only a delivery queued for an agent reads its message, by
 * id. The urgent ones are then put in the walk's order here.
 *
 * THE OTHERS ARE READ FROM THE MESSAGE INDEX, QUEUE_SCAN_CHUNK messages at a time from the cursor. When fewer than a
 * page and one are urgent, the answer is filled up from the others, so a first page reads the delivery rows once.
 *
 * There is a pause between any two slices. A slice is at most two reads, one after the other: its rows, then the
 * candidates among them.
 *
 * A message whose urgent flag changes while the worker walks the pages can move to before the cursor. It is then on no
 * later page of this pass, and the next pass reads it. Its held sentence is forgotten at the end of this pass, so it may
 * be said once more.
 */
export async function theNextQueueCandidates(workspaceId: string, cursor: QueueCursor | null): Promise<QueueCandidate[]> {
  const view = messagesInTheViewOf(justThisProject(workspaceId))
  const fromOtherProjects = theMessagesFromOtherProjects(workspaceId, undefined)
  const priority = sql<number>`CASE WHEN json_valid(${records.data}) THEN CASE WHEN json_type(${records.data}, '$.urgent') = 'true' THEN 0 ELSE 1 END ELSE 1 END`
  const fields = {
    id: messageDelivery.id, messageId: messageDelivery.messageId, recipientId: messageDelivery.recipientId,
    inTheView: fromOtherProjects === undefined ? sql<number | null>`1` : sql<number | null>`(${view})`,
    priority, createdAt: records.createdAt, messageRow: sql<number>`records.rowid`, deliveryRow: sql<number>`message_delivery.rowid`,
  }
  // A DELIVERY QUEUED FOR AN AGENT, OF A LIVE MESSAGE THE WORKER TAKES, IN ONE PHASE AND AFTER THE CURSOR. Each read
  // asks "for an agent" in its own way, which steers SQLite's choice of index, so each read gives it.
  const queued = (phase: number, forAnAgent: SQL) => and(
    eq(messageDelivery.mark, 'queued'), forAnAgent,
    eq(records.kind, 'message'), isNull(records.deletedAt), sql`${priority} = ${phase}`,
    fromOtherProjects === undefined ? view : or(view, fromOtherProjects),
    cursor === null || phase !== cursor.priority ? undefined : sql`(${records.createdAt}, records.rowid, message_delivery.rowid) > (${cursor.createdAt}, ${cursor.messageRow}, ${cursor.deliveryRow})`,
  )
  const urgent: QueueCandidate[] = []
  if (cursor === null || cursor.priority === 0) {
    let after = 0
    for (;;) {
      const slice = sqlite.prepare('SELECT rowid AS deliveryRow FROM message_delivery WHERE rowid > ? ORDER BY rowid LIMIT ?').all(after, QUEUE_SCAN_CHUNK) as { deliveryRow: number }[]
      if (slice.length === 0) break
      const last = slice[slice.length - 1]!.deliveryRow
      // THE SLICE'S DELIVERY ROWS FIRST, by rowid, each message then found by its id. A CROSS JOIN holds SQLite to that
      // order, and the kind inside `likely`, which tells SQLite it leaves out few rows, keeps it on the rowids. The
      // office holds no planner statistics, because nothing in it runs ANALYZE, and without these SQLite's plan read
      // every delivery for an agent, through the index on the recipient, for each slice.
      // THE LIMIT NEVER CUTS A ROW: the range holds only the rows the slice above read, because a row written later
      // takes a higher rowid, and each row joins at most one message, by its id. It puts the bound that every ordered
      // read of the delivery rows keeps into the statement.
      urgent.push(...db.select(fields).from(messageDelivery).crossJoin(records).where(and(
        sql`message_delivery.rowid > ${after} AND message_delivery.rowid <= ${last}`,
        eq(records.id, messageDelivery.messageId),
        queued(0, sql`likely(${eq(messageDelivery.recipientKind, 'agent')})`),
      )).orderBy(...IN_THE_WALKS_ORDER).limit(QUEUE_SCAN_CHUNK).all())
      after = last
      if (slice.length < QUEUE_SCAN_CHUNK) break
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
    // IN_THE_WALKS_ORDER, across the slices.
    urgent.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.messageRow - b.messageRow || a.deliveryRow - b.deliveryRow))
    if (urgent.length > QUEUE_PAGE_SIZE) return urgent.slice(0, QUEUE_PAGE_SIZE + 1)
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  let moment = cursor?.priority === 1 ? cursor.createdAt : ''
  let messageRow = cursor?.priority === 1 ? cursor.messageRow : 0
  let inclusive = cursor?.priority === 1
  // THE KIND AND THE CENTRE IN THE WORDS OF records_message_moment_idx, a partial index SQLite uses only for a query that
  // names them so. They are written from ONE_KIND_WRITTEN_OUT.message and MESSAGE_CENTRE, as theViewFromAMoment writes
  // them, and the index is named: if the words ever differ from the index's, the read fails and does not come back empty.
  const inTheCentre = sql.raw(`"records"."workspace_id" = '${MESSAGE_CENTRE}'`)
  for (;;) {
    const operator = inclusive ? '>=' : '>'
    const slice = db.all<{ messageRow: number; id: string; createdAt: string }>(sql`SELECT rowid AS messageRow, id, created_at AS createdAt FROM records INDEXED BY records_message_moment_idx WHERE ${ONE_KIND_WRITTEN_OUT.message} AND ${inTheCentre} AND (created_at, rowid) ${sql.raw(operator)} (${moment}, ${messageRow}) ORDER BY created_at, rowid LIMIT ${QUEUE_SCAN_CHUNK}`)
    if (slice.length > 0) {
      // THE SLICE'S DELIVERY ROWS FIRST, from the index on the message, each message then found by its id. A CROSS JOIN
      // holds SQLite to that order. The office holds no planner statistics, because nothing in it runs ANALYZE, and with
      // a plain JOIN SQLite's plan read every live message, through the index on the project and the deletion, for each
      // slice.
      const candidates = db.select(fields).from(messageDelivery).crossJoin(records).where(and(
        eq(records.id, messageDelivery.messageId),
        inArray(messageDelivery.messageId, slice.map((one) => one.id)),
        queued(1, eq(messageDelivery.recipientKind, 'agent')),
      )).orderBy(...IN_THE_WALKS_ORDER).limit(QUEUE_PAGE_SIZE + 1 - urgent.length).all()
      if (candidates.length > 0) return [...urgent, ...candidates]
      const last = slice[slice.length - 1]!
      moment = last.createdAt
      messageRow = last.messageRow
      inclusive = false
    }
    if (slice.length < QUEUE_SCAN_CHUNK) return urgent
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

type QueueOptions = {
  selectedQueued?: QueueCandidate[]
  messageId?: string
  recipientId?: string
  full?: boolean
  only?: 'checks'
  inheritedDeliveryIds?: ReadonlySet<string> | null
  settledAsks?: SettledAskDelivery[]
  /** Where each delivery whose reading threw is named. Without it, the first throw ends the reading, as before. */
  failed?: QueueFailure[]
  /** The filed aliases a caller already read for this request, so the queue's own reading does not read them again. */
  aliases?: TheFiledAliases
}

/** The queue, read in one go. A caller inside a request uses `theQueueWithoutHoldingTheServer`. */
export function theQueue(workspaceId: string, options: QueueOptions = {}): Waiting[] {
  const reading = readingTheQueue(workspaceId, options)
  for (;;) {
    const step = reading.next()
    if (step.done === true) return step.value
  }
}

/**
 * THE SAME QUEUE, WITH THE SERVER FREE TO ANSWER OTHER REQUESTS WHILE IT IS READ.
 *
 * Problem P-P3huQftq9w: one read of GET /api/worker/queue took 52 seconds on an office of the live
 * shape, and in that time the server answered nothing else. Sorting the pool once and reading each
 * recipient once brought it to 1.5 seconds for 4,677 queued deliveries. The read still grows with
 * the queue, so the reading stops at least every 50 milliseconds and lets the server answer what has
 * arrived meanwhile. The rules are the ones `theQueue` uses, because both run `readingTheQueue`.
 *
 * WHAT A PAUSE COSTS. Something written during a pause can be seen by the rest of the pass. The
 * worker already acts on a list some time after it was read, so it already checks a delivery again
 * before it starts a run, and this widens that window by milliseconds.
 */
export async function theQueueWithoutHoldingTheServer(workspaceId: string, options: QueueOptions = {}): Promise<Waiting[]> {
  const reading = readingTheQueue(workspaceId, options)
  for (;;) {
    const step = reading.next()
    if (step.done === true) return step.value
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

/** The longest the queue's reading runs before it lets the server answer something else. */
const A_PAUSE_AT_LEAST_EVERY_MS = 50

/**
 * OLDEST FIRST, the order the queue reads its rows in, and the press to start a new agent its own: by when each message
 * was written, and where two share a second by the record's rowid, which keeps the order they were stored in. The
 * delivery id is random, so it cannot break the tie.
 */
const OLDEST_FIRST = [records.createdAt, sql`records.rowid`] as const

/** THE ORDER OF THE QUEUE'S CANDIDATES in each priority: OLDEST_FIRST, then the delivery's rowid, which settles it. */
const IN_THE_WALKS_ORDER = [...OLDEST_FIRST, sql`message_delivery.rowid`] as const

/**
 * THE MOMENT FROM WHICH THE WORKER TAKES A MESSAGE WRITTEN IN ANOTHER PROJECT (wave 13y round 112, item 46).
 *
 * Until round 112 the worker took only the messages in its own project's view, and a message written in another project
 * to an agent whose conversation the worker picks up stayed queued for ever. The rule since then: only a message written
 * after the worker first ran the new rule is taken, so the messages that waited before it are not handed over all at once.
 * The moment is kept in the one installation row, `other_projects_messages_since` (migration 0312). It is written once,
 * by the first full reading of the worker's queue, and never rewritten. It is not the time a file says the code was
 * put in.
 *
 * NO ROW IS AN ERROR, never a moment guessed: every office has the one installation row.
 */
function theMomentOtherProjectsMessagesAreTakenFrom(): string {
  const read = () =>
    sqlite.prepare('SELECT other_projects_messages_since AS value FROM installation WHERE only_row = 1').get() as { value: string | null } | undefined
  const stored = read()
  if (stored === undefined) {
    throw new PanelError('The worker cannot read when it began to take messages written in another project: this office has no installation row.', 500)
  }
  if (stored.value !== null) return stored.value
  // ONLY WHILE NOTHING IS STORED, so a second reading, or two readings at once, leave the first moment as it is.
  sqlite.prepare('UPDATE installation SET other_projects_messages_since = ? WHERE only_row = 1 AND other_projects_messages_since IS NULL').run(localStamp(new Date()))
  const written = read()?.value
  if (typeof written !== 'string') {
    throw new PanelError('The worker wrote when it began to take messages written in another project, and read nothing back.', 500)
  }
  return written
}

/**
 * THE MESSAGES WRITTEN IN ANOTHER PROJECT THAT THE WORKER'S QUEUE HOLDS AS WELL (wave 13y round 112, item 46), as a
 * condition on a queued message, or undefined for a reading that holds none of them.
 *
 * ONLY THE WORKER'S OWN PROJECT. One message worker serves the office, in `settings().workspace`, and starts its runs
 * there. So only that project's queue holds these messages, and no other project's queue can hand the same message to a
 * second run. A reading of checks only holds none: a check is the office's own line.
 *
 * WHICH MESSAGES. One written in a project (`writtenIn.project`) after the moment above, by a person or an agent. A line
 * the office wrote is left out, a check's ask among them (the same round's rule), and so is a message with no
 * sender, because nothing says who wrote it. A comment on a record is left out: it belongs to the project of its record.
 * The queue then keeps such a message only for an agent whose conversation it picks up (`readingTheQueue`).
 */
function theMessagesFromOtherProjects(workspaceId: string, only: QueueOptions['only']): SQL | undefined {
  if (only === 'checks' || workspaceId !== settings().workspace) return undefined
  const since = theMomentOtherProjectsMessagesAreTakenFrom()
  return and(
    eq(records.workspaceId, MESSAGE_CENTRE),
    sql`${records.createdAt} > ${since}`,
    isNotNull(STORED_FIELDS.messageWrittenInProject(records.data)),
    sql`${STORED_FIELDS.messageSentById(records.data)} <> ${moleOffice().id}`,
    isNull(STORED_FIELDS.messageTargetType(records.data)),
  )
}

function* readingTheQueue(
  workspaceId: string,
  { full = false, only, messageId, recipientId, inheritedDeliveryIds, settledAsks, failed, aliases: aliasesReadByTheCaller, selectedQueued }: QueueOptions,
): Generator<void, Waiting[], void> {
  let since = performance.now()
  // TRUE WHEN THE READING HAS RUN LONG ENOUGH THAT IT SHOULD STOP FOR A MOMENT; THE CALLER DOES THE STOPPING.
  const timeToPause = (): boolean => {
    if (performance.now() - since < A_PAUSE_AT_LEAST_EVERY_MS) return false
    since = performance.now()
    return true
  }
  const view = messagesInTheViewOf(justThisProject(workspaceId))
  const fromOtherProjects = theMessagesFromOtherProjects(workspaceId, only)
  const queued = selectedQueued ?? db
    .select({
      id: messageDelivery.id,
      messageId: messageDelivery.messageId,
      recipientId: messageDelivery.recipientId,
      // WHETHER THIS PROJECT'S VIEW HOLDS THE MESSAGE, or 0 for one the queue holds only as written in another project.
      inTheView: fromOtherProjects === undefined ? sql<number | null>`1` : sql<number | null>`(${view})`,
    })
    .from(messageDelivery)
    .innerJoin(records, eq(records.id, messageDelivery.messageId))
    .where(
      and(
        messageId === undefined ? eq(messageDelivery.mark, 'queued') : undefined,
        eq(messageDelivery.recipientKind, 'agent'),
        messageId === undefined ? undefined : eq(messageDelivery.messageId, messageId),
        recipientId === undefined ? undefined : eq(messageDelivery.recipientId, recipientId),
        // THIS PROJECT'S VIEW OF THE MESSAGE CENTRE: the messages written in it, about it, or
        // commenting on one of its records. The worker's own project holds the messages written in another project too.
        fromOtherProjects === undefined ? view : or(view, fromOtherProjects),
        // Keep every candidate theAskAndItsRun could accept. The existing readers decide whether
        // this recipient has an unstarted check or the ask of a settled run; the notice is not the rule.
        only === 'checks'
          ? sql`exists (
              select 1 from records as check_run
              where check_run.id = json_extract(${records.data}, '$.aboutRun')
                and check_run.workspace_id = ${workspaceId}
                and json_extract(check_run.data, '$.theCheck.message') = ${records.id}
            )`
          : undefined,
      ),
    )
    .orderBy(...OLDEST_FIRST)
    .all()
  if (queued.length === 0) return []
  // One reading for this queue pass, handed to its per-message guards. It is discarded with this
  // iterator; a later request constructs a new pass and reads the current row.
  const officeTest = theMoleOfficeTest()
  // IN PIECES (src/server/db/in-pieces.ts): one id for every queued delivery in the project. The rows go
  // into a map by id, so the order of the pieces does not matter.
  const rows = readInPieces(
    queued.map((one) => one.messageId),
    (piece) =>
      db
        .select(ROW)
        .from(records)
        .where(and(inArray(records.id, piece), isNull(records.deletedAt)))
        .all(),
  )
  const byId = new Map(rows.map((row) => [row.id, row]))
  // WHICH COMMENTS A REVIEW HAS NOT SENT YET, read once for the whole pass rather than once per
  // row. It is the same reading the review column draws from, so what the worker holds and what the person
  // sees in the column cannot be two different lists. Criterion M28, problem `g4M_z6965R5o`.
  //
  // ASKED ONLY ABOUT THE COMMENTS QUEUED (wave 13y round 34), which are the only rows looked up in it: every member a
  // review finds is a record `isAComment` passes, and a pass with none reads no review. Measured on a copy of an
  // office with 4,188 queued rows, this reading took 285 to 304 ms and read 320 MB of the pass's 786 MB, more than any
  // other part, and one of the rows was a comment.
  let reviews: ReturnType<typeof commentsAReviewHasNotSentYet> | undefined
  const reviewsHolding = () => (reviews ??= commentsAReviewHasNotSentYet(workspaceId, new Set(rows.filter(isAComment).map((row) => row.id))))
  // TWO READINGS ONCE PER PASS, NOT ONCE PER ROW. Measured on 11 September 2026 on a copy of the owner's
  // database with 704 queued rows: one pass took 5.7 seconds, and the profile put 9.2 of every
  // 19.6 seconds in reading the waiting runs (every session row and every goodbye line, twice per
  // row) and 5.7 in reading the message pool (every message of every project, once per
  // conversation). Both are the same facts for every row of one pass, so they are read here once
  // and handed down. Problem 9Ys6WS23aGXE.
  // TWO RUN LISTS, BOTH READ ONCE PER PASS, EACH THROUGH ITS OWN INDEX (wave 13y round 44). The queue
  // asks two different questions about runs. "Is any run going for this agent" is asked of
  // `runningRunRowsInEveryProject`, the same reading the chat makes, and a run started with `tools/sandbox.mjs exec`
  // counts. "Which runs did the message worker start and can it continue" is asked of `runRows`, which
  // keeps only the rows carrying `deliveringMessage`. Neither list reads the runs in another state, and
  // together they replace the every-session read that was 87.5 MiB on the made-up database.
  // A check row, and a settled ask the marking form marks, need neither list: they read only their own
  // agent's runs (`itsOwnRuns` below).
  let sessions: ReturnType<typeof runRows> | undefined
  const sessionRows = () => (sessions ??= runRows(workspaceId))
  // THE RUNNING ROWS OF EVERY PROJECT (wave 13y round 112, item 46). An agent may work in several projects, and a run
  // going for it in another one is a run going for it, so the worker starts no second conversation beside it. The
  // index answers the running rows of every project as it answers one project's.
  let runningSessions: ReturnType<typeof runningRunRowsIn> | undefined
  const runningSessionRows = () => (runningSessions ??= runningRunRowsInEveryProject())
  const openSleeps = everyOpenSleep()
  const sleepReminders = theRemindersOfOpenSleeps()
  let waitingRows: ReturnType<typeof runsWaitingForTheNextMessage> | undefined
  const waitingRuns = () => (waitingRows ??= runsWaitingForTheNextMessage(workspaceId, sessionRows()))
  if (timeToPause()) yield
  // NO READ OF THE WHOLE POOL. The conversation guard reads each conversation it is asked about back to the last
  // message a person wrote (`agentTurnsInTheConversation`), once a reading for each sender and conversation.
  let allowance: ReturnType<typeof howFarAConversationMayGo> | undefined
  const conversationAllowance = () => (allowance ??= howFarAConversationMayGo())
  // WHAT IS TRUE OF ONE RECIPIENT, READ ONCE PER PASS. Its registry row, the run its message would get,
  // who is answering as it and the conversation it would pick up are the same for every message queued
  // for it, and reading them again per message was most of the 3 seconds left after the pool was
  // sorted once (problem P-P3huQftq9w).
  const recipients = new Map<string, ReturnType<typeof oneRecipient>>()
  // EVERY QUEUED AGENT'S EARLIER CASTING ROLL IN THIS PROJECT, READ ONCE PER PASS, when the first model is read, and each
  // agent's handed to its model ask. Read for each agent alone, it made a pass over every recipient about a hundred times
  // longer on a made-up office of 18,000 sessions. The one read keeps each agent's answer apart: a roll, none, or the
  // words an unreadable roll is refused in. An unreadable roll throws here, for that agent alone, so it fails that agent's
  // delivery as any ask that throws for it does, and the other agents' rolls are still read.
  // THE FILED ALIASES, READ AT MOST ONCE PER PASS, for each recipient's own reading below. A caller that already
  // read them for this request hands its reading down, so the request reads the table once.
  const aliases = aliasesReadByTheCaller ?? theFiledAliasesReadOnce(sqlite)
  let rolls: ReturnType<typeof theEarlierCastingRolls> | undefined
  const theRollOf = (agentId: string): EarlierCastingRoll | null => {
    rolls ??= theEarlierCastingRolls(workspaceId, [...new Set(queued.map((one) => one.recipientId))], aliases)
    const roll = rolls.get(agentId)
    if (roll === undefined) throw new Error(`The worker's queue read no earlier Casting roll for agent ${agentId}: no message is queued for it.`)
    return theRollThisAnswerHolds(roll)
  }
  // WHICH AGENT EACH RUNNING ROW SERVES, WORKED OUT ONCE PER PASS, as the presence roster does (`runningRows` on
  // `HowTheAnsweringIsRead`). Asked of every run row for each recipient, it was 155 to 158 ms of a 2.5 s pass on
  // the office copy in round 35 of wave 13y, for 422 recipients. Only this agent's own running rows can answer for
  // it, in the order of `runningSessionRows`, so the answer is the same. EACH AGENT'S IDENTITY IS READ ONCE in that one
  // walk (wave 13y round 112): the running rows of every project are about eleven times one project's on the made-up
  // office of 22 October, and many serve the same agent.
  let running: ReturnType<typeof theRunningRowsByTheAgentTheyServe> | null = null
  const runningRows = () => (running ??= theRunningRowsByTheAgentTheyServe(runningSessionRows(), eachAgentsIdentityReadOnce(sqlite)))
  // THE MACHINE'S PROCESS ROWS, READ ONCE PER PASS FOR EACH PROJECT A RUNNING ROW IS IN (wave 13y round 112, item 46).
  // Once the running rows of every project were read, listing them for each running row was 1,714 listings and 138 ms
  // of a 1.08 s pass, in a profile on the made-up office of 22 October. 97 ms of it read the machine's listening ports
  // again for each listing.
  const machines = new Map<string, readonly ResourceReport[]>()
  const machineOfTheProject = (project: string): readonly ResourceReport[] => {
    const read = machines.get(project) ?? listResources({ workspaceId: project, type: 'process' })
    machines.set(project, read)
    return read
  }
  // The same message-run agents were resolved for each supervisor twice per pass (wave 13y round 39).
  // Build their groups only if a secretary or supervisor needs them, and discard them at the end of this pass.
  let messageRuns: ReadonlyMap<string, readonly Row[]> | null = null
  const messageRows = () => (messageRuns ??= theMessageRunRowsByTheAgentTheyServe(workspaceId, sessionRows()))
  // EACH RUN ROW BY ITS ID, so the run an answering names is looked up and not found by walking every row for each
  // recipient: that walk was 58 to 70 ms of the same pass. A session id names one record.
  let runsById: Map<string, Row> | undefined
  // THE TWO NARROW LISTS HOLD THE USUAL ROWS. The getter falls back to a row read by its id, which covers a run still
  // holding its handle after it stopped: that row is the one everyRunRow would have held.
  const runById = () => (runsById ??= new Map([...runningSessionRows(), ...sessionRows()].map((row) => [row.id, row])))
  const registries = new Map<string, ReturnType<typeof readParticipant>>()
  const registryOf = (id: string) => {
    if (!registries.has(id)) registries.set(id, readParticipant({ kind: 'agent', id }))
    return registries.get(id) ?? null
  }
  const oneRecipient = (recipientId: string) => {
    const registry = registryOf(recipientId)
    const onTheRow = registry !== null && 'runtime' in registry ? registry.runtime : null
    let answering: ReturnType<typeof theAnsweringReading> | undefined
    let ownAnswering: ReturnType<typeof theAnsweringReading> | undefined
    let ownRun: Row | null | undefined
    // ITS IDENTITY IS READ ONCE IN THE READING, which asks it of each of its running rows (wave 13y round 112): one agent
    // may have a running row in each project.
    const reading = () => (answering ??= theAnsweringReading(recipientId, workspaceId, runningSessionRows(), waitingRuns(), { runningRows, messageRows, machineOfTheProject, identityOf: eachAgentsIdentityReadOnce(sqlite), aliases }))
    // The handle door uses this same reader without a full roster. Its own narrowed run rows
    // keep the same hold and run precedence, so it needs no whole-project run list.
    const ownReading = () => (ownAnswering ??= theAnsweringReading(recipientId, workspaceId, undefined, undefined, { aliases }))
    let chosen: ReturnType<typeof theModelARunGets> | undefined
    let resume: ReturnType<typeof conversationToPickUp> | undefined
    return {
      registry,
      handle: registry !== null && 'handle' in registry ? registry.handle : recipientId,
      get chosen() {
        return (chosen ??= theModelARunGets(
          { place: 'conversation', agentId: recipientId, runtime: onTheRow !== null && onTheRow !== '' ? onTheRow : null, project: workspaceId, roll: theRollOf(recipientId) },
          environment(),
        ))
      },
      get reading() { return reading() },
      get theRun() {
        const session = reading().answering.session
        if (session === null) return null
        // A HOLD MAY NAME ANY SESSION, not only one of the two lists: a finished session with no
        // message is one of them, and its own row is read by its primary key. Wave 13y round 44.
        return runById().get(session) ?? theRunRowWithId(workspaceId, session)
      },
      get heldByALiveSession() { return whyALiveSessionHasThis(reading()) },
      // THE SAME THREE ANSWERS FROM THIS AGENT'S OWN RUNS ONLY, for a check row and for a settled ask
      // the marking form marks. The run the answering names is looked up by its id alone.
      itsOwnRuns: {
        get reading() { return ownReading() },
        get theRun() {
          if (ownRun === undefined) {
            const session = ownReading().answering.session
            ownRun = session === null ? null : theRunRowWithId(workspaceId, session)
          }
          return ownRun
        },
        get heldByALiveSession() { return whyALiveSessionHasThis(ownReading()) },
      },
      get resume() {
        if (resume === undefined) resume = conversationToPickUp(recipientId, workspaceId, waitingRuns(), sessionRows(), messageRows)
        return resume
      },
      asleepSince: openSleeps.get(recipientId) ?? null,
    }
  }
  const out: Waiting[] = []
  const noticeRuleBlocks = gatePosition('held-by-a-notice-rule') === 'block'
  const personalNoticeRules = new Map<string, ReturnType<typeof noticeKindsFor>>()
  const noticeBatches = new Map<string, ReturnType<typeof batchDeliveryStates>>()
  // ONE ANSWER PER CONVERSATION AND SENDER PER READ. Counting a conversation reads every message in
  // the project once, and a queue of twenty messages in one group would otherwise read them twenty
  // times for one number that cannot have changed in between. WHO SENT A MESSAGE IS PART OF THE KEY
  // because it is part of the answer: a person's message is never held and an agent's may be, so one
  // key per conversation would hand the person's answer to the agents' messages in the same group.
  const waitingByConversation = new Map<string, string | null>()
  // THE ENVIRONMENT, READ ONCE PER PASS rather than once per row: it is the same for every message,
  // and reading `.env` per row would be the queue's cost paid again for nothing. Criterion T7.
  let env: ReturnType<typeof mergedEnvironment> | undefined
  const environment = () => (env ??= mergedEnvironment())
  // The registry supplies the run's agent label, never its settled state. A pause may leave that label
  // older than a registration; the marking transaction reads a fresh registry for the stored sentence.
  const agents = theRegistryReadOnce()
  // THE CHECKS STARTED IN EACH LANE IN THE LAST HOUR, read at the first check row and kept for the pass.
  let startedThisHour: Map<string, number> | undefined
  // EACH CHECK'S RUN'S NEWEST MERGE ENTRY, read at the first check row in one query for the run of every queued message,
  // and handed to both the hold for the run's report and the lane of the hourly cap. A check's run is its message's
  // `aboutRun`, so every check row's run is among those asked. Measured on a narrow copy of the office with 1,152 merge
  // entries in the project and 5 check rows: reading the entry twice for each row was about 71 ms of a 165 ms reading.
  // An entry written during a pause is read at the next reading.
  let newestEntryIds: Map<string, string | null> | undefined
  const newestEntries = new Map<string, PanelRecord | null>()
  const theNewestEntryOf = (run: string): PanelRecord | null => {
    newestEntryIds ??= theNewestEntryIdsOfRuns([...new Set(rows.flatMap((one) => said(dataOf(one)['aboutRun']) ?? []))], workspaceId)
    if (!newestEntries.has(run)) {
      const id = newestEntryIds.get(run)
      if (id === undefined) throw new Error(`The worker's queue read no merge entry for run ${run}: it is not the aboutRun of any queued message.`)
      newestEntries.set(run, id === null ? null : getRecord(id))
    }
    return newestEntries.get(run) ?? null
  }
  let heldForALimit: TheHoldOnNewChecks | undefined
  if (timeToPause()) yield
  // ONE QUEUED DELIVERY, worked out alone. A delivery whose reading throws fails alone, in words (item 49 of wave 13y,
  // round 115): the loop below names it in `failed` and reads the rest of the pass.
  const oneRow = (row: (typeof queued)[number]): void => {
    const message = byId.get(row.messageId)
    if (message === undefined || message.kind !== 'message') return
    const data = dataOf(message)
    const registry = registryOf(row.recipientId)
    const handle = registry !== null && 'handle' in registry ? registry.handle : row.recipientId
    // Ask the existing judges before building a recipient's answering or model reading.
    const settledAsk = whyAnAskNeedsNoCheck(message.id, handle, workspaceId, said(data['aboutRun']), agents)
    const asked = settledAsk === null ? inspectionForMessage(message.id, handle, workspaceId, said(data['aboutRun']), agents) : null
    if (only === 'checks' && asked === null && settledAsk === null) return
    const recipient = recipients.get(row.recipientId) ?? oneRecipient(row.recipientId)
    recipients.set(row.recipientId, recipient)
    // A MESSAGE WRITTEN IN ANOTHER PROJECT IS KEPT ONLY TO PICK UP THE AGENT'S CONVERSATION in this project (wave 13y
    // round 112, item 46). For an agent with no such conversation it starts nothing, and it stays queued.
    if (row.inTheView !== 1 && recipient.resume === null) return
    const to: ParticipantRef = { kind: 'agent', id: row.recipientId }
    const addressed = {
      toGroup: typeof data['toGroup'] === 'string' && data['toGroup'] !== '' ? data['toGroup'] : null,
      sentBy: senderOf(data['sentBy']),
    }
    // A CHECK ALWAYS RUNS ON CLAUDE CODE, inside tools/the-inspector.mjs, so it does not take the
    // runtime above. Its model is the checking agent's own, or the Settings page's choice for the
    // check, and otherwise the worker's MOLE_OFFICE_INSPECTION_MODEL (criterion U2).
    const checkModel = asked === null ? null : theModelARunGets({ place: 'check', agentId: row.recipientId, runtime: null }, environment())
    // A CHECK WHOSE RUN'S ENTRY BOUNCED FOR ITS REPORT IS HELD, as part 1 of a decision says;
    // the worker says the sentence.
    // SO IS A CHECK ON A LOGIN THAT ANSWERED A CHECK WITH ITS 5-HOUR LIMIT, until the reset. Its runtime is read for this
    // project, as the check's own prompt door reads it, and only while some login is held.
    const waits = asked === null ? null : (whyACheckOfThisRunWaitsForItsReport(asked.run, workspaceId, theNewestEntryOf(asked.run)) ?? (() => {
      const hold = (heldForALimit ??= theHoldOnNewChecks())
      if (hold.held.size === 0) return null
      const runtime = theModelARunGets({ place: 'check', agentId: row.recipientId, runtime: null, project: workspaceId }, environment()).runtime
      return runtime === null ? null : (hold.held.get(runtime)?.says ?? null)
    })())
    // AND ITS PACE UNDER THE HOURLY CAP, as part 2 of a decision says, from
    // one count of the last hour read for the pass,
    // and only when the queue holds a check.
    const inspection =
      asked === null
        ? null
        : {
            ...asked,
            ...(checkModel === null || !theOfficeChoseIt(checkModel) || checkModel.model === null ? {} : { model: checkModel.model }),
            ...(waits === null ? {} : { waits }),
            pace: thePaceOfACheckOf(asked.run, workspaceId, environment(), (startedThisHour ??= theChecksStartedInTheLastHour()), theNewestEntryOf(asked.run)),
          }
    // A CHECK ROW READS WHO IS ANSWERING FROM ITS OWN AGENT'S RUNS, in every form of this door, so a
    // check waiting to start does not build the whole project's run lists. Every other row reads them,
    // as before. When one agent has a check row and an ordinary row in one reading, the two rows come
    // from two readings, so a write that lands during a pause can make them disagree.
    const answeredFor = inspection === null ? recipient : recipient.itsOwnRuns
    // THE RUN OR THE HOLD ANSWERING AS THIS AGENT, read the one way the chat reads it. A live
    // session holding the handle wins over a run, and the sentence is then the hold's own sentence —
    // the same one GET /api/handles/<handle> answers with — so a row cannot say "Nobody has this
    // agent open in a terminal" while heldByALiveSession is also set. With no hold the row carries
    // the run and the one waiting sentence wave 6 made. With neither, both fields are null. For an
    // ordinary row the rows are every run row, the same list the chat reads, and for a check row they
    // are its own agent's runs; neither drops a run the message worker did not start.
    // `heldByALiveSession` below is read from this same reading, hold and all.
    // A NOTICE THAT WAKES NO WAITER STAYS QUEUED WHILE A LIVE SESSION HOLDS THE HANDLE (problems
    // tXltdrCOfxsO and rxxoHZ1MXpGY). The waiting door hands it over with the next message that wakes
    // the waiter, so the session reads it without a turn of its own. Marking it delivered here, as every
    // other line the office writes is, would mean the session never reads it. Without a live session it
    // is marked as before, because no waiter will ever hand it over.
    let rules = personalNoticeRules.get(row.recipientId)
    if (rules === undefined) {
      rules = noticeKindsFor(to)
      personalNoticeRules.set(row.recipientId, rules)
    }
    const muted = rules.muted
    let batches = rules.batched.length === 0 ? undefined : noticeBatches.get(row.recipientId)
    if (rules.batched.length !== 0 && batches === undefined) {
      batches = batchDeliveryStates(to)
      noticeBatches.set(row.recipientId, batches)
    }
    const batch = noticeRuleBlocks ? batches?.get(message.id)?.state ?? null : null
    const mutedHere = batches?.get(message.id)?.state === 'held' ? BATCH_HELD : whyPersonalNoticeRuleHolds(addressed.sentBy, data['notice'], muted)
    const heldByNoticeRule = noticeRuleBlocks ? mutedHere : null
    const keptForTheSession = whyThisWakesNoWaiter(addressed.sentBy, data['notice']) !== null &&
      (settledAsks !== undefined && settledAsk !== null ? recipient.itsOwnRuns : answeredFor).heldByALiveSession !== null
    // A RESIDENT ASLEEP KEEPS EVERY MESSAGE THAT IS NOT URGENT, the office's own lines too: they are not marked
    // delivered and no run is started for them, and nothing asks the person to start one, until it wakes. The reminder
    // the office sent when the sleep began is kept the same way, and the waiting door hands it to a session that holds
    // the handle (theRemindersOfOpenSleeps in lib/resident-sleep.ts), so its row says that instead.
    const asleepHere = recipient.asleepSince !== null && !isUrgent(data)
    const heldWhileAsleep =
      asleepHere && gatePosition('held-while-a-resident-sleeps') === 'block'
        ? heldWhileItSleeps(handle, recipient.asleepSince, sleepReminders.has(message.id))
        : null
    // A SETTLED RUN'S ASK IS MARKED EVEN WHEN ITS KIND IS MUTED: that is the office closing its own record, and it wakes
    // nobody. The notice wake rule holds every other line the office writes (message U2YtX3pvw3Dt).
    const needsNoRun = inspection === null && !keptForTheSession && heldWhileAsleep === null ? (settledAsk ?? (batch === null && heldByNoticeRule === null ? whyThisOfficeLineNeedsNoRun(message.id, addressed.sentBy, workspaceId, data, officeTest) : null)) : null
    const askOfASettledRun = settledAsk !== null && needsNoRun === settledAsk
    if (only === 'checks' && inspection === null && !askOfASettledRun) return
    if (settledAsks !== undefined && askOfASettledRun && !inheritedDeliveryIds?.has(row.id)) {
      settledAsks.push({ messageId: message.id, to })
      return
    }
    const { chosen } = recipient
    const { theRun, heldByALiveSession } = answeredFor
    const runtime = chosen.runtime
    const theOfficeChose = theOfficeChoseIt(chosen)
    const retired = registry !== null && 'retired' in registry ? registry.retired : false
    const answering = answeredFor.reading.answering
    const which = conversationOf(addressed, to)
    let waiting: string | null = null
    if (which !== null) {
      const asked = [addressed.sentBy === null ? 'nobody' : participantKey(addressed.sentBy), which.id].join('~')
      const already = waitingByConversation.get(asked)
      waiting =
        already === undefined
          ? whyThisConversationIsWaiting(addressed, to, workspaceId, conversationAllowance(), officeTest)
          : already
      waitingByConversation.set(asked, waiting)
    }
    // THE WORDS ONLY WHEN THEY WERE ASKED FOR. A narrow row is everything here except `body` and the
    // routed line; a full row is exactly the row this door has always answered, body and all. The
    // routed line is words, so it travels here and never on the narrow row.
    const review = reviewsHolding().get(message.id)
    const reviewHere = review === undefined ? null : aReviewIsHoldingIt(review)
    const heldByAReview = gatePosition('held-by-an-unsent-review') === 'block' ? reviewHere : null
    // NOT FOR A LINE MOLE OFFICE WROTE, which needs no run and so waits for no press. Before this,
    // the press's own "branched from another conversation" line to the new agent was read as waiting for
    // a press, so a second press after a reload carried it and made a third agent.
    const nobodyHere =
      inspection === null && heldWhileAsleep === null && whyThisMessageNeedsNoRun(addressed.sentBy, officeTest) === null
        ? whyNobodyIsAnsweringAsIt(handle, data, recipient.resume, answering)
        : null
    const nobodyIsAnsweringAsIt = gatePosition('wait-for-the-persons-start') === 'block' ? nobodyHere : null
    const wouldHaveHeld = ([
      // A SETTLED RUN'S ASK needs no run at both positions, so the notice rule would not have held it at block.
      ['held-by-a-notice-rule', mutedHere !== null && heldByNoticeRule === null && !askOfASettledRun],
      ['held-while-a-resident-sleeps', asleepHere && heldWhileAsleep === null],
      ['held-by-an-unsent-review', reviewHere !== null && heldByAReview === null],
      ['wait-for-the-persons-start', nobodyHere !== null && nobodyIsAnsweringAsIt === null],
    ] as const).filter(([, passed]) => passed).map(([gate]) => gate)
    const words = full
      ? {
          body: typeof data['body'] === 'string' ? data['body'] : '',
          // THE ROUTED LINE FOR THIS RECIPIENT, or null because the routing did not choose it. The
          // matcher lives once in shared/messages.ts, so the queue, the waiter and the dsh hooks all
          // decide "is this recipient a routed `to`" the same way.
          routedLine: theRoutedLineFor({ routed: routedOf(data) }, to),
        }
      : {}
    out.push({
      noticeBatchAvailable: true,
      ...(inspection === null ? {} : { inspection }),
      messageId: message.id,
      ...(!full ? { title: message.title } : {}),
      ...(inheritedDeliveryIds?.has(row.id) ? { inheritedFromCopy: true } : {}),
      // THE PROJECT THIS QUEUE WAS READ FOR, whose runs every lookup above asked: the message itself is in the message
      // centre and belongs to no project, and a run is always in a project.
      workspaceId,
      // WHERE THE MESSAGE WAS WRITTEN, for the envelope's line: the message is in no project.
      writtenIn: writtenInOf(data),
      to,
      handle,
      runtime,
      model: theOfficeChose ? chosen.model : null,
      variant: theOfficeChose ? chosen.variant : null,
      ...(chosen.kept === undefined ? {} : { kept: chosen.kept }),
      retired,
      ...words,
      sentBy: addressed.sentBy,
      fromGroup: theGroupForAHandOver(typeof data['toGroup'] === 'string' ? data['toGroup'] : null),
      sentAt: message.createdAt,
      resume: inspection === null ? recipient.resume : null,
      hops: hopsBehind(message.id),
      needsNoRun,
      ...(askOfASettledRun ? { askOfASettledRun: true as const } : {}),
      conversationIsWaiting: waiting,
      ...theAlreadyAnsweringOnARow(
        answering,
        theRun === null ? null : theSandboxNameIn(dataOf(theRun)),
        theRun !== null && theOfficeStartedTheRun(theRun),
      ),
      heldByALiveSession,
      ...(heldByNoticeRule === null || needsNoRun !== null ? {} : {heldByNoticeRule}),
      heldByAReview,
      urgent: isUrgent(data),
      ...(heldWhileAsleep === null ? {} : { heldWhileAsleep }),
      nobodyIsAnsweringAsIt,
      ...(wouldHaveHeld.length === 0 ? {} : { wouldHaveHeld }),
    })
  }
  for (const row of queued) {
    if (timeToPause()) yield
    try {
      oneRow(row)
    } catch (error) {
      if (failed === undefined) throw error
      const known = registries.get(row.recipientId)
      const handle = known != null && 'handle' in known ? known.handle : row.recipientId
      const words = error instanceof Error ? error.message : String(error)
      failed.push({ messageId: row.messageId, to: { kind: 'agent', id: row.recipientId }, handle, workspaceId, because: whyTheQueueCouldNotWorkItOut(handle, words), error: words })
    }
  }
  // AND AN EMERGENCY GOES FIRST. Criterion M62: it goes to the front of the messages sent to this agent, and nowhere else.
  //
  // A STABLE PARTITION AND NOT A SORT WITH TWO KEYS. `out` is already oldest first, because the
  // delivery rows were read in that order; moving the urgent ones to the front without disturbing
  // anything else leaves both groups oldest first, which is what "first among that agent's
  // messages" means. The press to start a new agent orders its rows by the same `urgentAtTheFront`.
  //
  // WHY IT IS HERE AND NOT IN THE ORDER BY. Urgency is a field of the MESSAGE and the ordering
  // above is of DELIVERY ROWS, which are read before any message is. Ordering there would mean a
  // join and a JSON read inside the query for a fact that is already in hand a few lines later.
  return urgentAtTheFront(out)
}

/**
 * Mark only the readable, non-inherited asks the queue judged settled. The reading owns the hold rule.
 * Re-read the queued mark and the stored ask in one synchronous transaction, with no pause inside it.
 * Announcements wait for this transaction's commit through announce and whenStored.
 */
export function markSettledAsksDelivered(asks: readonly SettledAskDelivery[], workspaceId: string): (SettledAskDelivery & { because: string })[] {
  if (asks.length === 0) return []
  return sqlite.transaction(() => {
    const agents = theRegistryReadOnce()
    const marked: (SettledAskDelivery & { because: string })[] = []
    for (const ask of asks) {
      const delivery = db.select({ mark: messageDelivery.mark }).from(messageDelivery).where(and(
        eq(messageDelivery.messageId, ask.messageId), eq(messageDelivery.recipientKind, ask.to.kind), eq(messageDelivery.recipientId, ask.to.id),
      )).get()
      if (delivery?.mark !== 'queued') continue
      const agent = readParticipant(ask.to)
      if (agent === null || !('handle' in agent)) continue
      const because = whyAnAskNeedsNoCheck(ask.messageId, agent.handle, workspaceId, undefined, agents)
      if (because === null) continue
      const done = sayWhereADeliveryStands(ask.messageId, ask.to, { mark: 'delivered', because })
      if (done.written) marked.push({ ...ask, because })
    }
    return marked
  })()
}

/** One queued delivery whose own message has been deleted, so nothing will ever deliver it. */
export interface DeadLetter {
  deliveryId: string
  messageId: string
  /** The agent it was addressed to. */
  recipientId: string
  /** When the message record was deleted, local wall-clock time. */
  deletedAt: string
}

/**
 * WHAT MAKES A DELIVERY A DEAD LETTER: it is queued, it is for an agent, its message is in this project's view, and
 * that message has been deleted. The whole reading and the paged count both ask this, so they cannot count apart.
 */
function aDeadLetterIn(workspaceId: string): SQL {
  return and(
    eq(messageDelivery.mark, 'queued'),
    eq(messageDelivery.recipientKind, 'agent'),
    messagesInTheViewOf(justThisProject(workspaceId)),
    isNotNull(records.deletedAt),
  )!
}

/**
 * QUEUED DELIVERIES WHOSE OWN MESSAGE HAS BEEN DELETED. THESE CAN NEVER CLEAR.
 *
 * A delivery row stays marked `queued` until something delivers it, and nothing ever delivers a
 * message that is not there any more — deleting the message does not touch the delivery rows it
 * already has. So a row like this sits at `queued` for ever: `theQueue` above already reads past
 * it silently, because `byId` is built from records that are not deleted and a row that misses
 * there is simply not the worker's to pick up. That is the right thing for the worker to do and
 * the wrong thing for a person to never hear about.
 *
 * Problem 9UeL9VeVPn33 found 158 of these across every project on 11 September 2026, nearly all of
 * them in one project. THIS READS ONE PROJECT AT A TIME, like the rest of this door, so a
 * caller in one project sees a smaller number than that total on purpose — the note the route
 * sends back says so, so the smaller number is never mistaken for the problem having shrunk.
 *
 * NOTHING HERE WRITES ANYTHING. Surfacing what exists is this door's job. Deciding what should
 * happen to a message that can never be delivered — leave it, mark the delivery some other way,
 * delete it — is a product question for somebody else to decide.
 */
export function deadLettersInTheQueue(workspaceId: string): DeadLetter[] {
  return db
    .select({
      deliveryId: messageDelivery.id,
      messageId: messageDelivery.messageId,
      recipientId: messageDelivery.recipientId,
      deletedAt: records.deletedAt,
    })
    .from(messageDelivery)
    .innerJoin(records, eq(records.id, messageDelivery.messageId))
    .where(aDeadLetterIn(workspaceId))
    .orderBy(records.createdAt, sql`records.rowid`, sql`message_delivery.rowid`)
    .all()
    .map((row) => ({ ...row, deletedAt: row.deletedAt ?? '' }))
}

/**
 * Count the readable dead letters in one statement, from the deleted messages of the project's view to their delivery
 * rows.
 *
 * THE DELETED MESSAGES ARE THE SMALLER SET, by far, of the two this could start from: the other is every delivery
 * queued for an agent. So the statement reads the deleted messages from the index on the project and the deletion,
 * then each one's delivery rows from the index on the message, and never walks the delivery rows. A CROSS JOIN holds
 * SQLite to that order: the office holds no planner statistics, because nothing in it runs ANALYZE. The rows come out
 * by the delivery's rowid, so their order does not depend on the join's.
 */
export function countReadableDeadLetters(workspaceId: string, mayRead: (ids: string[]) => ReadonlySet<string>): number {
  const dead = db.select({ messageId: messageDelivery.messageId }).from(records).crossJoin(messageDelivery)
    .where(and(eq(messageDelivery.messageId, records.id), aDeadLetterIn(workspaceId)))
    .orderBy(sql`message_delivery.rowid`)
    .all()
  const visible = mayRead(dead.map((one) => one.messageId))
  return dead.filter((one) => visible.has(one.messageId)).length
}

/**
 * TELL THE STARTER OF AN AGENT THAT THE CAP HAS STOPPED A RUN FOR IT. Criteria M82 and M128.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE GROUP IS NOT ENOUGH
 * ---------------------------------------------------------------------------------------
 *
 * `tellTheGroupTheAgentsAreWaiting` writes into the group, where the people IN the group are
 * looking. Whoever started the agent may not be one of them, and the starter is who has to move:
 * problem `S5ouUa6A0rrL` was found by reading a delivery row by hand, because nothing said
 * that the fix loop had stopped. There is no hard limit, and the group
 * is where it is talked out. This is the half that says a person has to move at all.
 *
 * ---------------------------------------------------------------------------------------
 * M128: A NOTICE ABOUT A CONVERSATION IS A SYSTEM LINE IN IT, AND NOT A MESSAGE TO THE AGENT
 * ---------------------------------------------------------------------------------------
 *
 * The case, seen on a picture: the long line appeared
 * as a paragraph in the person's chat with an agent and was addressed to that agent as well. Now the notice names the
 * message it is about (`aboutMessage`), is linked to it, and is addressed only to the side that
 * reads it; `isBetween` draws it in the conversation the message is in, so the agent receives
 * nothing. On a phone the line folds to one line (Chat.tsx).
 *
 * THE PERSON IS TOLD SEPARATELY, in their own conversation with the office, in one short line with
 * the message id that starts the conversation again. That is the line M82's starter case needs.
 *
 * IT IS SAID ONCE PER PAUSE, and what makes it once is the conversation the message is in rather
 * than a flag beside it — the same rule the group's line uses, for the same reason. The check is
 * the notice's own `aboutMessage`, so the two lines here are written together and never once per
 * held call. A person writing sets the count back to nothing, so the next time the agents run out
 * the starter is told again.
 *
 * NOTHING IS WRITTEN WHEN THE STARTER IS THE SENDER. It has just been told by its own message not
 * going anywhere, and a message telling somebody what they have just done is not a message.
 */
export function tellTheStarterTheCapStopped(
  messageId: string,
  to: ParticipantRef,
  workspaceId: string,
  by: Actor,
): { written: boolean; because: string } {
  const message = readMessage(messageId, workspaceId)
  if (whyThisConversationIsWaiting(message, to, workspaceId) === null) {
    return { written: false, because: 'This conversation may still run, so the starter was told nothing.' }
  }
  if (to.kind !== 'agent') {
    return { written: false, because: 'This message is not for an agent, so there is no starter to tell.' }
  }
  const row = readParticipant(to)
  const starter = row !== null && 'startedBy' in row ? row.startedBy : null
  if (starter === null) {
    return {
      written: false,
      because: `Nobody is recorded as having started ${to.id}, so there is no starter to tell. Nothing was written.`,
    }
  }
  if (message.sentBy !== null && message.sentBy.kind === starter.kind && message.sentBy.id === starter.id) {
    return { written: false, because: 'The starter wrote this message, so it already knows it went nowhere.' }
  }
  const agentName = nameOfTheAgent(row)
  const which = conversationOf(message, to)
  if (which === null) {
    return { written: false, because: 'Nothing recorded who sent this message, so there is no conversation to write in.' }
  }
  // WHETHER THIS PAUSE HAS ALREADY BEEN SAID IN THE CONVERSATION, read off the conversation's own
  // messages rather than a flag. The check is the line's own few words, which name the agent and not
  // one message: the cap holds every message in the pause, and the pause is told once. A person
  // writing after it moves the cut and the pause is new again.
  const line = SYSTEM_LINES.aCapStoppedARun(messageId, agentName)
  const said =
    which.kind === 'group'
      ? messagesInAGroup(which.id, EVERY_PROJECT)
      : conversationBetween(which.between[0], which.between[1], EVERY_PROJECT).messages
  const lastPersonWroteAt = said.reduce(
    (at, one, index) => (one.sentBy !== null && one.sentBy.kind === 'person' ? index : at),
    -1,
  )
  if (said.slice(lastPersonWroteAt + 1).some((one) => one.body === line.line)) {
    return { written: false, because: 'This conversation has already been told, and nobody has written since.' }
  }
  if (which.kind === 'group') {
    // THE GROUP GETS THE NOTICE, because that is the conversation it is about, and its members are
    // the readers. `tellTheGroupTheAgentsAreWaiting` has already written the generic group line.
    const wrote = writeASystemLine(which.id, workspaceId, line, by, { message: messageId })
    if (wrote !== null) createLink({ fromId: wrote.id, toId: messageId, type: 'about', actor: by })
  } else {
    // THE PAIR GETS IT WITHOUT THE AGENT RECEIVING IT. It is addressed to the message's sender (or
    // the starter), and `aboutMessage` is what draws it in the pair. The link is what lets a reader
    // open the exact message it names.
    const hearer = message.sentBy ?? starter
    const wrote = writeASystemLineToOne(hearer, workspaceId, line, by, { message: messageId })
    createLink({ fromId: wrote.id, toId: messageId, type: 'about', actor: by })
  }
  // AND THE PERSON IS TOLD, in one short line in their own conversation with the office. Nothing in
  // this line is addressed to the agent whose conversation it is.
  if (starter.kind === 'person') {
    writeASystemLineToOne(starter, workspaceId, SYSTEM_LINES.theCapStoppedForYou(messageId, agentName), by)
  }
  return { written: true, because: line.line }
}

/**
 * WAKE THE PARENT OF A SESSION THAT HAS JUST FINISHED. Problem c3p75p8aALd2; as item 5 of a decision
 * says, when a child session finishes, the office wakes its parent, in every runtime, once for each
 * finished child.
 *
 * WHO IS WOKEN. The child names its parent session in `parentAttachment`. A session is not an address,
 * so the line goes to the agent that parent session answers as, read by `theAgentASessionAnswersAs`,
 * the one reading of that fact. A message to an agent is the one door that reaches a runtime whose turn
 * has ended: a waiting session takes it off the handle, and the chat shows it.
 *
 * ONCE FOR EACH FINISHED CHILD, and what makes it once is the messages already stored rather than a
 * flag: a line from Mole Office about this child (`aboutRun`) with these words is looked for first.
 * A child that finishes, runs again and finishes again is told about once.
 *
 * NOTHING IS WRITTEN, AND THE REASON IS RETURNED, when the child names no parent, the parent is not a
 * session record, nothing records which agent the parent answers as, or the parent answers as the
 * same agent as the child, which would be an agent woken by its own finish.
 *
 * Called from the one place a session's state is written (`patchRecord` in ./records.ts), on the
 * write that moves a session to `finished`, inside that write's transaction.
 */
export function tellTheParentAChildFinished(childId: string, by: Actor): { written: boolean; because: string } {
  const child = getRecord(childId)
  if (child === null || child === undefined || child.kind !== 'session') {
    return { written: false, because: `${childId} is not a session record, so there is no parent to tell.` }
  }
  const data = (child.data ?? {}) as Record<string, unknown>
  const parentId = typeof data['parentAttachment'] === 'string' ? data['parentAttachment'].trim() : ''
  if (parentId === '') return { written: false, because: `The session ${childId} names no parent, so nobody was told it finished.` }
  const parent = getRecord(parentId)
  if (parent === null || parent === undefined || parent.kind !== 'session') {
    return {
      written: false,
      because: `The session ${childId} names ${parentId} as its parent, and no session record has that id, so nobody was told it finished.`,
    }
  }
  const answering = theAgentASessionAnswersAs(parent, parent.workspaceId)
  if (answering === null) {
    return {
      written: false,
      because:
        `Nothing records which agent the parent session ${parentId} answers as, so there is no agent to tell that ` +
        `${childId} finished. Nothing was written.`,
    }
  }
  const itself = theAgentASessionAnswersAs(child, child.workspaceId)
  if (itself !== null && itself.agent.id === answering.agent.id) {
    return { written: false, because: `The session ${childId} answers as the same agent as its parent, so it was not told of its own finish.` }
  }
  const line = SYSTEM_LINES.aChildSessionFinished(childId, child.title)
  // BOTH LOOKUPS ASK THE RUN IN THE WORDS OF ITS INDEX (`STORED_FIELDS.messageAboutRun`), so SQLite reads the few messages
  // about this run and not every message.
  const told = sqlite
    .prepare(
      `SELECT 1 FROM records WHERE kind = 'message' AND deleted_at IS NULL AND ${theWordsOfAStoredField(STORED_FIELDS.messageAboutRun, 'data')} = ? ` +
        "AND json_extract(data, '$.sentBy.id') = ? AND json_extract(data, '$.body') = ? LIMIT 1",
    )
    .get(childId, moleOffice().id, line.line)
  if (told !== undefined) return { written: false, because: `The parent of ${childId} has already been told it finished.` }
  // ONE FINISH, ONE NOTICE, as a decision says; problem 2-AtvZiEfVO9. A run that finishes
  // with a seal tells its starter in the seal's notice, written earlier in the same write (`sealFinishedRun`). When
  // that notice went to the agent this line would go to, it already says the run finished, so this line is
  // not written.
  const sealSaidIt = sqlite
    .prepare(
      `SELECT 1 FROM records r WHERE r.kind = 'message' AND r.deleted_at IS NULL AND ${theWordsOfAStoredField(STORED_FIELDS.messageAboutRun, 'r.data')} = ? ` +
        "AND json_extract(r.data, '$.sentBy.id') = ? AND json_extract(r.data, '$.notice') = ? " +
        "AND EXISTS (SELECT 1 FROM json_each(r.data, '$.to') AS one WHERE json_extract(one.value, '$.id') = ?) LIMIT 1",
    )
    .get(childId, moleOffice().id, 'aRunWasSealed' satisfies SystemLineKind, answering.agent.id)
  if (sealSaidIt !== undefined) {
    return { written: false, because: `The parent of ${childId} was told in the seal's notice that it finished, so no second line was written.` }
  }
  writeASystemLineToOne(answering.agent, parent.workspaceId, line, by, { run: childId })
  return { written: true, because: line.said ?? line.line }
}

/** What a reader calls an agent: its name where the registry holds one, its handle otherwise. */
function nameOfTheAgent(row: ReturnType<typeof readParticipant>): string {
  if (row === null) return 'this agent'
  if ('handle' in row && row.name !== '') return row.name
  return 'handle' in row ? row.handle : 'this agent'
}

/**
 * WHY NO RUN IS STARTED FOR A MESSAGE TO THIS AGENT, because the handle is a session's.
 *
 * Criterion H2, and criterion M81 for the second sentence it can write. `theLiveHoldOn` releases a
 * hold that has been quiet for longer than the grace window before answering, so a session that has
 * closed its terminal never holds a message up for long: the very read that asks this question is
 * the read that lets the hold go.
 *
 * TWO SENTENCES, BECAUSE THEY ARE TWO FACTS. A fresh hold says a session is there right now. A kept
 * one says a session was there a moment ago and has stopped saying so, which for Claude Code is
 * exactly what a session writing an answer looks like. Both mean no run, and a person reading the
 * row acts differently on them, so neither stands in for the other.
 */
function whyALiveSessionHasThis(reading: TheAnsweringReading): string | null {
  // A RUN HOLDING THE HANDLE IS A RUN, NOT A LIVE SESSION (criterion M79, problem TRR4WT3Kl7b4). Every
  // run takes its agent's hold, so the bare hold would name the run here as "a session" while
  // `runningAlreadySays` names it as a run with nobody at a terminal. When the one reading says a run
  // is answering, this is null, and the worker reads `runningAlready` instead: no run is started
  // either way. A hold whose session is not answering and no run under it still holds the message
  // for its session (criterion M81), so that hold keeps its sentence.
  if (reading.answering.how === 'a run') return null
  const hold = reading.hold
  if (hold === null) return null
  if (hold.state === 'kept') {
    return itsSessionStillHasIt(hold.handle, hold.session, hold.quietFor, handleGraceSeconds())
  }
  return aLiveSessionHasIt(hold.handle, hold.session)
}

/**
 * WHY NO RUN IS STARTED BECAUSE NOTHING IS ANSWERING AS THIS AGENT, or null because one may start.
 *
 * Criterion M78. Until now this state was the state a run was started IN: a message to an agent
 * nobody held started a fresh tool, and what the person got back was a run saying "This run cannot reach
 * Mole Office", which is a sentence about a run they never asked to exist. Now the message waits and
 * the chat offers them the press.
 *
 * THE PRESS IS READ OFF THE MESSAGE ITSELF, `runWasAskedFor`, which is written by Mole Office
 * through a door refused to agents. It is on the message rather than beside it because the press is
 * about one message: a press kept per agent would let a message sent an hour later start a run on a
 * press given for a different one.
 *
 * A HELD OR RUNNING AGENT IS NOT ASKED THIS AT ALL. `heldByALiveSession` and `runningAlready` are
 * read first by `whyNotNow`, and both are states where something IS answering; this is the answer
 * only when neither is.
 */
function whyNobodyIsAnsweringAsIt(
  handle: string,
  data: Record<string, unknown>,
  resume: { id: string; runtime: string } | null,
  // WHO IS ANSWERING AS THE AGENT, the queue's own reading for this recipient, so it is read once.
  answering: WhoIsAnswering,
): string | null {
  // A RUN THAT PICKS THIS AGENT'S OWN CONVERSATION UP IS NOT A NEW AGENT, so it is not asked about.
  // This is the whole of what narrowed M78, and `resume` is the fact that tells the two apart: it
  // is the newest conversation this agent had here, and it is null exactly when a run would be a
  // fresh tool that has never heard of the work.
  if (resume !== null) return null
  if (aRunWasAskedFor(data)) return null
  return answering.how === 'nobody' ? nobodyIsAnsweringAsIt(handle) : null
}

function aRunWasAskedFor(data: Record<string, unknown>): boolean {
  const asked = data['runWasAskedFor']
  if (typeof asked !== 'object' || asked === null) return false
  const it = asked as Record<string, unknown>
  return said(it['at']) !== null && said(it['by']) !== null
}

/**
 * WHAT HAPPENS NEXT TO A MESSAGE WAITING FOR THIS AGENT, read from who is answering as it. Criterion M86.
 *
 * The chat draws this under the reader's newest message that still waits for the agent. A tick alone said
 * only *Waiting*, and the sentence behind it was the general one until the message worker had held the
 * message and written its own reason on the delivery row. That reason wins in the chat when there is one,
 * because the worker also reads the cap, a review, the hops and the rest, which nothing here reads.
 *
 * THE THREE REASONS HERE ARE THE THREE A QUEUE ROW TAKES FROM THE ANSWERING READING ALONE, built by the
 * functions `theQueue` builds them with and in the order `whyNotNow` in src/worker/index.ts reads them: a
 * live session holds the handle, a run is already going, or nothing is answering and the person is asked
 * to press. A waiting run and a kept conversation are the answering sentence itself, which says that a run
 * picks the conversation up.
 *
 * NOTHING HERE KNOWS WHETHER A MESSAGE WORKER IS RUNNING. With none, this says what the worker would do,
 * and nothing does it.
 */
export function whatHappensToAWaitingMessage(handle: string, reading: TheAnsweringReading): string {
  const { answering } = reading
  const run = answering.how === 'a run' ? answering.session : null
  const going = theAlreadyAnsweringOnARow(
    answering,
    run === null ? null : theSandboxNameOfTheRunWithId(run),
    run !== null && theRunAWriteCameFrom(run) !== null,
  )
  return (
    whyALiveSessionHasThis(reading) ??
    going.runningAlreadySays ??
    (answering.how !== 'nobody' ? answering.says : gatePosition('wait-for-the-persons-start') === 'block' ? nobodyIsAnsweringAsIt(handle) : aRunStartsWithoutThePress(handle))
  )
}

/** What happens to the message while the gate that waits for the person's start is off. */
function aRunStartsWithoutThePress(handle: string): string {
  return (
    `Nothing is answering as "${handle}": no session holds its handle and no run is going for it. The gate that waits ` +
    'for the person to start an agent is off, so the message worker starts a new run for this message without a press. ' +
    'That run has not heard of the work before.'
  )
}

/**
 * THE PERSON PRESSES TO START AN AGENT FOR ONE MESSAGE, OR A SECRETARY HOLDING THE PERSON'S GRANT PRESSES IT FOR
 * THEM. Criterion M78.
 *
 * AN AGENT WITH NO GRANT IS REFUSED, at the route, because the whole point of this press is that a run starts on a
 * person's press. A secretary the grant carries is named as the one who pressed, and the reason says they pressed
 * under the person's grant.
 *
 * IT STARTS NOTHING ITSELF. It writes down that a run may be started for this message, and says on
 * the delivery row that the press happened. The worker's next pass is what starts the run, exactly
 * as it does for every other message it may take, so there is ONE path that starts a run and this
 * opens the gate on it rather than going round it.
 *
 * A COMMENT A SENT REVIEW'S MESSAGE CARRIES IS PRESSED FOR THROUGH THAT MESSAGE. The send
 * archived the comment's own queued row and named that message on it, so the press asks for the run of the message
 * that carries its words (`theMessagesCarrying` in lib/reviews.ts). The answer names that message and says so.
 */
export function askForARunFor(
  pressed: string,
  workspaceId: string,
  by: string,
  actor: Actor,
  expectedMinutes?: number,
): {
  message: string
  at: string
  by: string
  says: string
  carriedComment?: string
  wrote: boolean
} {
  const carrier = theMessagesCarrying([pressed]).get(pressed)
  const messageId = carrier ?? pressed
  const message = readMessage(messageId, workspaceId)
  const at = localStamp(new Date())
  // THE ACTOR'S OWN MARK SAYS WHETHER A SECRETARY PRESSED UNDER THE PERSON'S GRANT. `aRaiseCarriesIt` set it at the
  // door, so the person's own press keeps writing their id and the old sentence word for word.
  const underTheGrant = actor.elevationUsed === true
  const pressedBy = underTheGrant ? actor.id : by
  // THE EXPECTED TIME, WHEN THE PRESS TYPED ONE, criterion F10. It rides the press the person made
  // and lands on the run's record when the worker files it, which is the one place the reminder
  // reads. Left out when nobody typed one, and then nothing is reminded about the run it starts.
  // THROUGH THE DOOR'S OWN MARK, because the message is usually somebody else's and no request may change
  // another's message (`whatAChangeToAMessageMustCarry` in lib/records.ts). The mark lets this one field by.
  const patched = patchRecord(messageId, {
    dataPatch: { runWasAskedFor: { at, by: pressedBy, ...(expectedMinutes === undefined ? {} : { expectedMinutes }) } },
    [THE_START_AN_AGENT_DOOR]: true,
  }, actor)
  let wrote = patched.newSeq !== null
  for (const one of message.deliveries) {
    if (one.mark !== 'queued' || one.to.kind !== 'agent') continue
    if (sayWhereADeliveryStands(messageId, one.to, { because: thePersonAskedForARun(at, pressedBy, underTheGrant) }).written) wrote = true
  }
  const nothingStarted = 'Nothing was started by this call: the message worker starts it on its next pass, which is the one path that starts a run.'
  if (carrier !== undefined) {
    return {
      message: messageId,
      at,
      by: pressedBy,
      carriedComment: pressed,
      wrote,
      says: `Comment ${pressed} went out in message ${messageId}, which the review's send wrote, so a run may be started for that message now. ${nothingStarted}`,
    }
  }
  return { message: messageId, at, by: pressedBy, wrote, says: `A run may be started for this message now. ${nothingStarted}` }
}

/**
 * THE NAME A NEW AGENT MADE BY THE PRESS IS FILED UNDER. Problems pLvkWo_hQqpm and hqbovBMnTu-z.
 *
 * The registry takes a record's title as the agent's name only when it is a name the registry
 * accepts (`theNameARecordGives` in lib/participants.ts); otherwise the agent is named by its handle.
 * The first of these that the registry accepts and that no registered agent holds is used:
 * "<old name> (started again)", "<old name> (again)", and "<old name> <n>", where n is the number at
 * the end of the new handle. The third is reached when an earlier press already made agents with
 * the first two names.
 *
 * WHEN NONE OF THEM IS FREE, THE NEW AGENT KEEPS THE OLD NAME. That happens for every old name of
 * five words, because a name is at most five words. The name is never cut, because a cut name is one
 * nobody wrote, and never a bare handle, because a conversation headed by a machine name is what
 * pLvkWo_hQqpm fixed. Two agents then share the name, and the difference is drawn beside it: the chat
 * marks the newer of the two (`theAgentsNewerThanASameNamedOne` in lib/participants.ts), and the new
 * conversation's first line says which agent it came from. The decision in message p_04qFPdNmoQ.
 *
 * `held` is every name a registered agent bears.
 */
export function theNameOfANewAgentFor(oldName: string, handle: string, held: ReadonlySet<string>): string {
  const number = /-(\d+)$/.exec(handle)?.[1]
  const tries = [`${oldName} (started again)`, `${oldName} (again)`, ...(number === undefined ? [] : [`${oldName} ${number}`])]
  return tries.find((name) => whyNameIsRefused(name) === null && !held.has(name)) ?? oldName
}

type CarriedChatMessage = Pick<Waiting, 'messageId' | 'workspaceId' | 'writtenIn' | 'to' | 'needsNoRun' | 'sentAt'>

/**
 * THE CHAT MESSAGES THE PRESS TO START A NEW AGENT WOULD CARRY TO A NEW AGENT, read and not written.
 *
 * `startANewAgentFor` carries exactly these, and the conversation door asks `wouldThePressCarryAnything`,
 * which reads them too, so the chat offers the press only where it would carry something. One reading
 * for both, so the offer and the press cannot disagree.
 */
export function whatThePressWouldCarry(agentId: string): CarriedChatMessage[] {
  const old = readParticipant({ kind: 'agent', id: agentId })
  if (old === null || !('startedBy' in old)) return []
  return [...messagesThePressWouldCarry(agentId, old.handle)]
}

/**
 * THE PROJECTS AN AGENT'S WAITING MESSAGES WERE WRITTEN IN, in the order the waiter is handed them
 * (`everythingWaitingFor`), and not only the one the person is standing in.
 *
 * The chat is the person's across projects (criterion M55): the conversation they are looking at when they press draws
 * messages from all of them, so a press that only looked in the project the switcher happens to hold would say nothing
 * is waiting while they look at the thing that is. The runs that answer are in a project, while the message is kept in
 * the message centre, which is in none, so each project's queue says why each message waits. A message in two projects'
 * views is carried from the first.
 *
 * THE WAITER'S ORDER IS READ FROM THE WAITER, not written again here (wave 13y round 34): a copy of it here agreed with
 * it only until one of the two was changed. Measured on a copy of an office whose busiest agent had 2,054 messages
 * queued, `everythingWaitingFor` took 13 to 18 ms of a press reading that took 231 to 261 ms.
 */
function theProjectsWithMessagesWaitingFor(agentId: string): Set<string> {
  return new Set(everythingWaitingFor(agentId).map((one) => one.writtenIn?.project).filter((one): one is string => one !== undefined))
}

/**
 * The queue's carry predicate, without its inspection, conversation-pool or runtime payloads. Each project's rows are
 * read in the queue's order, oldest first (`OLDEST_FIRST`) and then the urgent ones at the front (`urgentAtTheFront`).
 */
type CarryMessage = { recipientId: string; id: string; data: Record<string, unknown>; createdAt: string; urgent: boolean }

type CarryProject = { rows: Map<string, CarryMessage[]>; runs: ReadonlyMap<string, PanelRecord> }

type CarryHistory = {
  identityOf: TheIdentityOf
  projects: Map<string, { runs: Row[]; sessions: Row[]; waiting: WaitingRun[]; messageRows: MessageRunRows; runningRows: () => ReadonlyMap<string, readonly Row[]> }>
  waitingProjects: Map<string, Set<string>>
  queued: Map<string, CarryProject>
  agentIds: readonly string[]
  sleeps: ReadonlyMap<string, string>
  waitsForPress: boolean
  holdsSleeping: boolean
  facts: AgentFactsReadOnce
  officeTest: (who: ParticipantRef) => boolean
}

function carryMessagesIn(project: string, agentIds: readonly string[], bulk = false): CarryProject {
  const query = db.select({ recipientId: sql<string>`${messageDelivery.recipientId}`.as('recipientId'), id: records.id,
      // Only the carry facts; the POST reads the body later, for messages it actually carries. `urgent` is read with
      // `->`, which keeps a JSON true a JSON true, so `isUrgent` reads it here as it reads a whole message.
      data: sql<string>`json_object('sentBy', json_extract(${records.data}, '$.sentBy'),
        'runWasAskedFor', json_extract(${records.data}, '$.runWasAskedFor'),
        'aboutRun', json_extract(${records.data}, '$.aboutRun'),
        'writtenIn', json_extract(${records.data}, '$.writtenIn'),
        'urgent', ${records.data} -> '$.urgent')`.as('data'),
      createdAt: sql<string>`${records.createdAt}`.as('createdAt') })
      .from(messageDelivery).innerJoin(records, eq(records.id, messageDelivery.messageId))
      .where(and(eq(messageDelivery.mark, 'queued'), eq(messageDelivery.recipientKind, 'agent'),
        sql`${messageDelivery.recipientId} IN (SELECT value FROM json_each(${JSON.stringify(agentIds)}))`, eq(records.kind, 'message'), isNull(records.deletedAt),
        messagesInTheViewOf(justThisProject(project))))
      .orderBy(...OLDEST_FIRST)
      .toSQL()
  const oldestFirst = (sqlite.prepare(query.sql).all(...query.params) as { recipientId: string; id: string; data: string; createdAt: string }[]).map((row) => {
      const data = dataOf({ data: JSON.parse(row.data) as Record<string, unknown> })
      return { recipientId: row.recipientId, id: row.id, data, createdAt: row.createdAt, urgent: isUrgent(data) }
    })
  const grouped = new Map<string, CarryMessage[]>()
  for (const row of oldestFirst) {
    const rows = grouped.get(row.recipientId) ?? []
    rows.push(row)
    grouped.set(row.recipientId, rows)
  }
  const runIds = [...new Set(oldestFirst.map((row) => said(row.data['aboutRun'])).filter((id): id is string => id !== null))]
  const found = bulk ? db.select().from(records).where(sql`${records.id} IN (SELECT value FROM json_each(${JSON.stringify(runIds)}))`).all() : []
  const runs = new Map(found.map((row) => [row.id, toRecord(row)]))
  return { rows: grouped, runs }
}

function* messagesThePressWouldCarry(agentId: string, handle: string, shared?: CarryHistory): Generator<CarriedChatMessage> {
  // The gates and the open sleeps are read once when many agents share the reading.
  if (!(shared?.waitsForPress ?? (gatePosition('wait-for-the-persons-start') === 'block'))) return
  const asleep = shared === undefined
    ? theOpenSleepOf(agentId) !== null && gatePosition('held-while-a-resident-sleeps') === 'block'
    : shared.sleeps.has(agentId) && shared.holdsSleeping
  const met = new Set<string>()
  const waitingProjects = shared === undefined ? theProjectsWithMessagesWaitingFor(agentId) : (shared.waitingProjects.get(agentId) ?? [])
  for (const project of waitingProjects) {
    let recipient: { answering: WhoIsAnswering; resume: PickUp | null } | undefined
    let projectRows = shared?.queued.get(project)
    if (projectRows === undefined) {
      projectRows = carryMessagesIn(project, shared?.agentIds ?? [agentId], shared !== undefined)
      shared?.queued.set(project, projectRows)
    }
    const oldestFirst = projectRows.rows.get(agentId) ?? []
    for (const row of urgentAtTheFront(oldestFirst)) {
      if (met.has(row.id)) continue
      const data = row.data
      if (asleep && !row.urgent) continue
      if (whyThisMessageNeedsNoRun(senderOf(data['sentBy']), shared?.officeTest) !== null) continue
      if (aRunWasAskedFor(data)) continue
      const aboutRun = said(data['aboutRun'])
      if (shared === undefined ? isInspectionForMessage(row.id, handle, project, aboutRun) :
        isInspectionForMessageWithRuns(row.id, handle, project, aboutRun, projectRows.runs)) continue
      // Read the run history once, only when a message's own facts have not already ruled it out.
      if (recipient === undefined) {
        let history = shared?.projects.get(project)
        if (history === undefined) {
          const runs = shared === undefined ? everyRunRow(project) : theRunRowsAnyReachReads(project)
          const sessions = runRows(project, runs)
          const waiting = runsWaitingForTheNextMessage(project, sessions, undefined, shared?.identityOf)
          let messages: ReadonlyMap<string, readonly Row[]> | undefined
          let running: ReadonlyMap<string, readonly Row[]> | undefined
          const messageRows = () => (messages ??= theMessageRunRowsByTheAgentTheyServe(project, sessions, shared?.identityOf))
          const runningRows = () => (running ??= theRunningRowsByTheAgentTheyServe(runs, shared?.identityOf))
          history = { runs, sessions, waiting, messageRows, runningRows }
          shared?.projects.set(project, history)
        }
        const { runs, sessions, waiting, messageRows, runningRows } = history
        const once = shared === undefined ? {} : { ...shared.facts, hold: shared.facts.hold(agentId), messageRows, runningRows }
        recipient = { answering: theAnsweringReading(agentId, project, runs, waiting, once).answering,
          resume: conversationToPickUp(agentId, project, waiting, sessions, shared === undefined ? undefined : messageRows, once) }
      }
      if (whyNobodyIsAnsweringAsIt(handle, data, recipient.resume, recipient.answering) === null) break
      met.add(row.id)
      yield { messageId: row.id, workspaceId: project, writtenIn: writtenInOf(data),
        to: { kind: 'agent', id: agentId }, needsNoRun: null, sentAt: row.createdAt }
    }
  }
}

/**
 * TRUE WHEN THE PRESS TO START A NEW AGENT WOULD CARRY SOMETHING FOR THIS AGENT: a chat message waiting
 * for the press (`whatThePressWouldCarry`), or, for a retired agent, comments held for it
 * (`theCommentsHeldFor`, which `branchDispatchedComments` carries). False when the press would make
 * nothing and say so. An id no registry holds is refused with 404, as the press refuses it.
 */
export function wouldThePressCarryAnything(agentId: string, workspaceId: string): boolean {
  const old = readParticipant({ kind: 'agent', id: agentId })
  if (old === null || !('startedBy' in old)) {
    throw new PanelError(`Nothing in the agent registry answers to "${agentId}", so no press can be made for it.`, 404)
  }
  for (const _ of messagesThePressWouldCarry(agentId, old.handle)) return true
  return theCommentsHeldFor(old, workspaceId).length > 0
}

/** The queued candidates for which the same press reading would carry a message or held comment. */
export function agentsThePressWouldCarryFor(agentIds: readonly string[], workspaceId: string): string[] {
  const agents = listParticipants().agents
  const registry = new Map(agents.map((one) => [one.id, one]))
  const identityOf = everyAgentsIdentityReadOnce(sqlite)
  const projects: CarryHistory['projects'] = new Map()
  const facts = theAgentFactsReadOnce(new Date(), true, () => agents, identityOf,
    () => [...projects.values()].flatMap((one) => one.waiting.map((run) => run.session)), agentIds)
  const shared: CarryHistory = {
    identityOf, projects, facts, agentIds, queued: new Map(), officeTest: theMoleOfficeTest(),
    waitingProjects: projectsWaitingForTheseAgents(agentIds), sleeps: everyOpenSleep(),
    waitsForPress: gatePosition('wait-for-the-persons-start') === 'block',
    holdsSleeping: gatePosition('held-while-a-resident-sleeps') === 'block',
  }
  const held = theCommentsHeldForThese(agentIds.filter((id) => registry.get(id)?.retired), workspaceId)
  return agentIds.filter((agentId) => {
    const old = registry.get(agentId)
    if (old === undefined) return false
    for (const _ of messagesThePressWouldCarry(agentId, old.handle, shared)) return true
    return old.retired && (held.get(agentId)?.length ?? 0) > 0
  })
}

/**
 * THE PERSON PRESSES START A NEW AGENT, wherever in the product they pressed it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PRESS DOES
 * ---------------------------------------------------------------------------------------
 *
 * Criteria M78 and M80: keep the old conversation whole and carry its waiting messages to a new
 * agent on the person's press.
 *
 * So it makes a NEW agent. It does not run the old one: the old one is the one that could not be
 * reached, and running it is what the office used to do by itself.
 *
 * Comments queued for a retired dispatch recipient go through `branchDispatchedComments` first.
 * That path copies this project's held comments and the waiting chat messages into one dispatch,
 * with this press's key proof. The retired agent stays retired. With no held comments, the chat path
 * below does four things:
 *
 * 1. A new agent is registered, started by the person it is for, carrying the same runtime word
 *    and saying on its own record which agent and which conversation it was branched from.
 * 2. A line from Mole Office opens the new conversation, saying where it came from and that the old
 *    one is still there. That is the seeding: a reader of the new conversation is told what it is a
 *    branch of, and can open the old one, which is whole.
 * 3. Every message of the person's that was waiting on the press is sent again to the new agent, as
 *    theirs, with their press already on it, because that is what they pressed for. They are new messages
 *    and carry the time the person pressed: they are the person asking the new agent now.
 * 4. M78, round 14: the old conversation keeps its messages. Each carried delivery is marked delivered, with a
 *    sentence naming the new agent. It no longer waits for another press or the old agent's return.
 *    A later press carries only messages that are still waiting.
 *
 * A PRESS ON AN AGENT NOTHING IS WAITING FOR WRITES NOTHING and says so, rather than making an
 * agent nobody asked for.
 */
export function startANewAgentFor(agentId: string, workspaceId: string, by: string, actor: Actor): {
  agent: string
  handle: string
  branchedFrom: string
  moved: string[]
  says: string
} {
  const waiting = whatThePressWouldCarry(agentId)
  const old = readParticipant({ kind: 'agent', id: agentId })
  if (old === null || !('startedBy' in old)) {
    throw new PanelError(
      `Nothing in the agent registry answers to "${agentId}", so there is no conversation to branch. Nothing was ` +
        'written.',
      404,
    )
  }
  const comments = branchDispatchedComments(old, workspaceId, actor, waiting.filter((one) => one.needsNoRun === null))
  if (comments !== null) return comments
  if (waiting.length === 0) {
    return {
      agent: '',
      handle: '',
      branchedFrom: old.handle,
      moved: [],
      says:
        'Nothing is waiting for this press. No message to this agent is being held for one, so no agent was made ' +
        'and nothing was written.',
    }
  }

  const handle = aHandleNobodyHolds(old.handle)
  const made = createRecord({
    workspaceId,
    kind: 'agent',
    title: theNameOfANewAgentFor(old.name, handle, new Set(everyNameInTheRegistries().agents.map((one) => one.name))),
    // WHERE IT CAME FROM, ON THE RECORD ITSELF. A reader meeting this agent in a month has to be
    // able to find out why there are two of them, and that is not something to reconstruct from two
    // handles that look alike. It is the summary and not `notes`, which on an agent is the absolute
    // path of the folder it keeps its own notes in.
    // IN ENGLISH, from the one word a page reads it back by (src/shared/branched-agent.ts), so a page can draw it in
    // its own language from `branchedFrom` below.
    summary: theStoredBranchedSummary(old.handle),
    data: {
      handle,
      state: 'active',
      // THE SAME TOOL THE OLD ONE WAS REGISTERED WITH, because a branch of a Codex conversation is
      // a Codex; a runtime nobody set stays unset rather than being guessed at, and the worker then
      // says so on the row instead of starting the wrong tool.
      ...('runtime' in old && old.runtime !== null ? { runtime: old.runtime } : {}),
      // THE NEW AGENT REPORTS TO THE PERSON, even when a secretary pressed under the grant. Only the moved messages'
      // press names the presser; `startedBy` and the system line below stay the person's.
      startedBy: { kind: 'person', id: by },
      // WHERE IT CAME FROM, AS FACTS, so a page can say it in the reader's language (round 37).
      branchedFrom: { agent: old.id, handle: old.handle },
    },
    actor,
  })
  // THE NEW AGENT IS ADDRESSED BY ITS REGISTRY ID, which since criterion I1 is not its handle. Filing
  // the agent record above is what made the registry row, and `agentForRecord` is the row that record
  // was mapped to. A record with no row is a broken registry, and nothing more is written to it.
  const registered = agentForRecord(made.id)
  if (registered === null) {
    throw new PanelError(
      `The agent record ${made.id} for "${handle}" was filed, and no registry row was made for it, so no message ` +
        'was moved to it and no line was written.',
      500,
    )
  }
  const newAgent: ParticipantRef = { kind: 'agent', id: registered.id }
  const person: ParticipantRef = { kind: 'person', id: by }

  writeASystemLineToTwo(
    [person, newAgent],
    workspaceId,
    {
      ...SYSTEM_LINES.branchedFromAnother,
      said: theNewConversationCameFrom(old.handle, old.name),
    },
    actor,
  )

  const moved: string[] = []
  for (const one of waiting) {
    // THE WORDS OF THE MESSAGE THIS PRESS MOVES, READ FROM THE MESSAGE RECORD ITSELF. A narrow
    // queue row carries no body, so the words are read from the record, and
    // a record with nothing on it is refused rather than seeded with empty words the branch would
    // have to answer.
    const read = getRecord(one.messageId)
    const words = (read?.data as Record<string, unknown> | null)?.['body']
    if (typeof words !== 'string') {
      throw new PanelError(
        `Message ${one.messageId} is queued for ${old.handle} but holds no words on it, so there is nothing to send again to the new agent.`,
        400,
      )
    }
    const again = createRecord({
      workspaceId: one.workspaceId,
      kind: 'message',
      title: words.slice(0, 60),
      data: { body: words, to: [newAgent] },
      actor,
      // THE SAME MARK AS THE MESSAGE IT MOVES: it is the same words, said in the same place.
      writtenIn: { project: one.writtenIn?.project ?? null, page: one.writtenIn?.page ?? null },
    })
    // AND THE PRESS GOES ON IT, through the one writer of that field. Pressing Start a new agent IS
    // the press: asking again about the message just pressed to have answered would be asking a question
    // answered by pressing. It cannot be written with the message, because a writer that could put that
    // field on its own words could start a run in the person's name — so it is dropped at birth and written here, by
    // the door. `askForARunFor` names the secretary under the grant; `by` above stays the person.
    askForARunFor(again.id, one.workspaceId, by, actor)
    // AND WHERE IT WENT, AS FACTS ON THE MESSAGE IT CARRIED, so the old conversation can say it in words in
    // the page's language (problem hqbovBMnTu-z). Through the door's own mark, as `runWasAskedFor` is.
    writeTheCarry(one.messageId, { from: old.id, fromHandle: old.handle, to: registered.id, toHandle: handle, copy: again.id }, actor)
    sayWhereADeliveryStands(one.messageId, one.to, { mark: 'delivered', because: theMessageWentToANewAgent(old.handle, handle) })
    moved.push(again.id)
  }

  return {
    agent: made.id,
    handle,
    branchedFrom: old.handle,
    moved,
    says:
      `A new agent "${handle}" is registered and ${String(moved.length)} message${moved.length === 1 ? '' : 's'} ` +
      `went to it. The conversation with "${old.handle}" is kept whole and is still there for that agent to read if ` +
      'it comes back. Nothing was started by this call: the message worker starts the run on its next pass.',
  }
}

/**
 * A HANDLE LIKE THIS ONE THAT NOBODY HOLDS, so the new agent reads as what it is beside the old.
 *
 * It counts up rather than adding a random tail, because a person reading a contacts list has to be
 * able to see at a glance which of the two came second. It stops at 99 and refuses rather than
 * looping for ever: ninety-eight branches of one conversation is not a state to paper over.
 */
function aHandleNobodyHolds(from: string): string {
  for (let n = 2; n <= 99; n += 1) {
    const asked = `${from}-${String(n)}`
    // FREE MEANS NO LIVE AGENT BEARS IT AND NO AGENT HAS IT AS ITS ID. A retired agent's handle is free
    // again (criterion I3); an agent whose id is this string would make it name two agents.
    if (readParticipant({ kind: 'agent', id: asked }) === null && agentByHandle(asked) === null) return asked
  }
  throw new PanelError(
    `Every handle from "${from}-2" to "${from}-99" is taken, so no new agent was made. Ninety-eight branches of ` +
      'one conversation is not something to add to. Nothing was written.',
    409,
  )
}

/**
 * THE LIVE SESSION SAYS IT HAS BEEN GIVEN A MESSAGE: the clock becomes a tick, and no run ran.
 *
 * Criterion H2: *the delivery row says it reached the live session*. It is the act `aRunTookIt`
 * performs for a run, and like it, it writes the sentence a person reads, the mark and the clock in
 * one write.
 *
 * HANDING THE WORDS OVER MARKS DELIVERED. Read is the recipient's own act through the mark door
 * after reading them. A decision replaces M127: a waiting session being given words
 * does not establish that it read them.
 *
 * ONLY THE SESSION THAT HOLDS THE HANDLE MAY SAY THIS, and that is asked of the stored hold rather
 * than believed from the caller. A door that took the caller's word would let anything mark any
 * message delivered with nothing behind it, which is the one thing `aRunTookIt` is careful about.
 *
 * NO RUN IS NAMED ON THE ROW. `run` on a delivery is the session record of a run Mole Office started,
 * and the session that took this one is not that — nobody started it, and a page offering to open it
 * as a run would be offering the wrong thing. The sentence names the session instead.
 */
export function theLiveSessionTookIt(
  messageId: string,
  to: ParticipantRef,
  session: string,
  workspaceId: string,
  batchTurn?: string,
  prepareOnly = false,
): { mark: DeliveryMark; because: string; writtenIn: { project?: string; page?: string } | null } {
  // WHEREVER THE MESSAGE IS FILED, criterion M76. A waiter is started in one project and holds a
  // handle for an agent the whole chat writes to, so the message it is being given is often filed
  // somewhere else. This used to refuse by project before any mark could be written, which is what
  // left three of the person's messages from another project showing a clock. The project it IS in comes
  // back with it, so the caller can say where an answer belongs.
  const found = readMessageWhereverItIs(messageId)
  const hold = theLiveHoldOn(to.id)
  if (hold === null) {
    throw new PanelError(
      'No session is answering as that agent now, so nothing can say it was given this message. A hold that has ' +
        'gone quiet for longer than it was allowed has already been released, and GET /api/handles says why. ' +
        'Nothing was written.',
      409,
    )
  }
  if (hold.session !== session) {
    throw new PanelError(
      `The handle "${hold.handle}" is held by the session filed as record ${hold.session}, not by ${session}. ` +
        'Only the session that is answering as an agent may say it was given a message. Nothing was written.',
      409,
    )
  }
  const because = itReachedTheLiveSession(session)
  if (prepareOnly) return { mark: 'queued', because: 'The original notice is prepared for handover and remains queued.', writtenIn: found.message.writtenIn ?? null }
  if (batchTurn !== undefined) acceptNoticeBatch(to, batchTurn)
  if (batchDeliveryState(messageId, to) === 'held') throw new PanelError('This notice is held for a later work turn. Nothing was delivered.', 409)
  // ONE WRITE FOR THE MARK, THE SENTENCE AND THE CLOCK, so a second take by another session moves
  // all three (problem JRjR0HGrOpGU).
  const stands = sayWhereADeliveryStands(messageId, to, { because, mark: 'delivered' })
  return { mark: stands.mark, because, writtenIn: found.message.writtenIn ?? null }
}

/** A stored `sentBy` as a participant, or null when it is not one. */
function senderOf(value: unknown): ParticipantRef | null {
  if (typeof value !== 'object' || value === null) return null
  const kind = (value as { kind?: unknown }).kind
  const id = (value as { id?: unknown }).id
  if ((kind !== 'person' && kind !== 'agent') || typeof id !== 'string' || id === '') return null
  return { kind, id }
}

/** A run that was already going, with everything a worker needs to pick it back up. */
export interface RunToPickUp {
  /** An interrupted tool start has no process identity to resume or signal. */
  startupFailed?: { run?: string; reason: string }
  /** Its recorded startup group is present or its liveness is unknown. */
  startupHeld?: string
  /** The session record the worker filed for it. */
  session: string
  /** The message it is delivering. */
  messageId: string
  /** The agent it serves, by registry id. */
  agentId: string
  /** The agent's handle, for the words a person reads. */
  handle: string
  /** The runtime word of the tool it is a run of. */
  runtime: string
  /** The provider's own id for the conversation, when the run said one before it was lost. */
  providerSession: string | null
  /**
   * THE SESSION RECORD OF THE RUN IT PICKED UP ITS CONVERSATION FROM, or null because it started a new one
   * (`theRunItPickedUp`). A worker that restarts gives it back to the run, so a resumed Codex run's receipt still takes
   * that run's total off its own (wave 13s round 43).
   */
  continues: string | null
  /** The process, and the group everything it started in turn is in. */
  pid: number
  pgid: number | null
  /**
   * WHEN THIS RUN BEGAN: the process's start time as the ledger read it, and when the ledger could
   * not read one, the moment its session record was filed. Those are a second or so apart and
   * nothing decides anything on this — it is what a person reads on a handle.
   */
  startedAt: string
  /** What the delivery row says now, so the picking-up worker writes over those words and no others. */
  says: string
  /**
   * WHETHER THIS RUN WAS STARTED BY A SERVER THAT IS NOT THIS ONE (criterion M24).
   *
   * True means the API restarted while this run was going. It is what tells a run that a restart cut
   * off from a run that died on its own, and it is read from two stamps rather than guessed.
   */
  startedBeforeThisServer: boolean
  /** What the message it is delivering says, so a replacement run can be started with it. */
  body: string
  quotes: readonly import('@shared/targets.ts').Context[]
  quotePositions: readonly number[] | null
  sentAt: string
  sentBy: ParticipantRef | null
  /** The group the message was sent to, or null because it was sent to no group, as item 5 of a
   * decision says. */
  fromGroup: TheGroupOfAHandOver | null
  /**
   * THE ROUTED LINE, WHEN THIS RUN'S RECIPIENT IS ONE THE ROUTING CHOSE.
   * Built by the one matcher from the message this run is delivering, so a replacement started by
   * `carryOnFromARestart` is told the same thing the first run was.
   */
  routedLine: string | null
  /** The person's mark on that message, as `WhatARunWasDelivering` read it, or absent for no mark. */
  intent?: unknown
}

/**
 * WHETHER THE WORKER THAT STARTED A TOOL RUN IS KNOWN TO HAVE ENDED, for a tool run that never
 * registered a process: the worker recorded the start, and ended before the process was on the ledger.
 *
 * A worker names its own session as the run's `parentAttachment`. It is known gone when that session
 * has ended, or when every process row it has is gone. A run filed before this server loaded and
 * naming no parent was started by a worker of an earlier server, which is gone too. Anything else —
 * a parent still going, or nothing to tell by — is not known gone, and the start is left alone
 * rather than closed under a worker that may be about to register it.
 *
 * One rule for the check tool (`runsToPickUp`) and the merge tool (`mergesForTheWorker`).
 */
export function theWorkerThatStartedItIsGone(data: Record<string, unknown>, filedAt: string, workspaceId: string): boolean {
  const parentId = said(data['parentAttachment'])
  const priorServerWithNoParent = parentId === null && filedAt < THIS_SERVER_LOADED_AT
  return theRunThatStartedItHasEnded(data, workspaceId) || priorServerWithNoParent
}

/** A session ending is not by itself proof that its worker process has gone. */
function thePreparingWorkerProcessIsGone(parentId: string, workspaceId: string): boolean {
  const processes = listResources({ workspaceId, sessionRecordId: parentId, includeReleased: true, alsoCheckReleasedRows: true })
    .filter((one) => one.type === 'process' && one.startedByTheProduct === true)
  return processes.length > 0 && processes.every((one) => one.liveness.state === 'gone')
}

/**
 * The worker and any waiting gate hold this FIFO. An empty FIFO with matching Linux boot and inode
 * shows that neither can advance this start. A recorded group is checked separately.
 */
function theStartupWitnessIsEmpty(extra: { startupWitness?: unknown; startupBoot?: unknown; startupInode?: unknown; startupGroup?: unknown; messageWorkerStart?: unknown; messageWorker?: unknown }, run: string, workspaceId: string, parent: unknown): boolean {
  if (process.platform !== 'linux' || typeof extra.startupWitness !== 'string' ||
      typeof extra.startupBoot !== 'string' || typeof extra.startupInode !== 'string') return false
  const path = extra.startupWitness
  const sameFifo = (): boolean => {
    const stat = lstatSync(path, { bigint: true })
    return stat.isFIFO() && `${stat.dev}:${stat.ino}:${stat.ctimeNs}` === extra.startupInode
  }
  try {
    const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim().toLowerCase()
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(boot) || boot !== extra.startupBoot || !sameFifo()) return false
    try {
      const fd = openSync(path, constants.O_WRONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
      closeSync(fd)
      return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENXIO' || !sameFifo()) return false
    }
    // The first row may have been read before the worker registered and authorized the probe.
    // Re-read after the FIFO is empty, when the worker and gate can no longer advance the start.
    const current = getRecord(run)
    if (current === null || current.workspaceId !== workspaceId || current.data['state'] !== 'running' ||
        current.data['parentAttachment'] !== parent || theToolsOwnProcessRow(workspaceId, run) !== undefined) return false
    const now = current.data['extra'] as { messageWorker?: unknown; messageWorkerStart?: unknown; startupGroup?: unknown; startupWitness?: unknown; startupBoot?: unknown; startupInode?: unknown } | undefined
    return now !== undefined && now.messageWorker === extra.messageWorker && now.messageWorkerStart === extra.messageWorkerStart && now.startupGroup === extra.startupGroup &&
      now.startupWitness === path && now.startupBoot === extra.startupBoot && now.startupInode === extra.startupInode
  } catch {
    // Missing files, permission failures and unreadable boot identity are all unknown.
    return false
  }
}

/**
 * WHETHER THE RUN A RUN NAMES AS ITS `parentAttachment` IS KNOWN TO HAVE ENDED: that run's record says finished or
 * crashed, or it has process rows and every one of them is gone. False when the run names no parent, and when nothing
 * says the parent ended. `theWorkerThatStartedItIsGone` above and the superseded door (`whetherARunsProcessHasEnded` in
 * lib/inspection.ts) both ask it, so they cannot disagree about when a starter has ended.
 */
export function theRunThatStartedItHasEnded(data: Record<string, unknown>, workspaceId: string): boolean {
  const parentId = said(data['parentAttachment'])
  const parent = parentId === null ? null : getRecord(parentId)
  // `alsoCheckReleasedRows` because this is the one reader that asks whether a RELEASED row's
  // process is still running. A server restart closes the rows of processes it finds gone, so the
  // released rows are exactly the evidence that the worker has ended, and a released row is
  // otherwise reported without a reading of the machine. This asks about one session, so it is a
  // handful of rows.
  const parentProcesses = parentId === null ? [] : listResources({ workspaceId, sessionRecordId: parentId, includeReleased: true, alsoCheckReleasedRows: true }).filter((one) => one.type === 'process')
  const parentEnded = parent !== null && parent.workspaceId === workspaceId && ['finished', 'crashed'].includes(String(parent.data['state']))
  const parentKnownDead = parentProcesses.length > 0 && parentProcesses.every((one) => one.liveness.state === 'gone')
  return parentEnded || parentKnownDead
}

/** What a run was delivering: the message's words and envelope, as a run started for it is told them. */
export interface WhatARunWasDelivering {
  /** The sentence on the agent's delivery row. */
  says: string
  body: string
  quotes: readonly import('@shared/targets.ts').Context[]
  quotePositions: readonly number[] | null
  sentAt: string
  sentBy: ParticipantRef | null
  fromGroup: TheGroupOfAHandOver | null
  routedLine: string | null
  /** The person's mark on the message, as the message read gives it, or absent for no mark. */
  intent?: unknown
  /** The person's own label on the message, as the message read gives it, or absent for no label. */
  label?: unknown
  /** The instruction the office handed over for the mark, or absent because there is none. */
  whatTheMarkAsks?: string
  /** The instruction the office handed over for the person's own label, or absent because there is none. */
  whatTheLabelAsks?: string
  /** The parts of the message the person marked, as the office handed them over, or absent for no parts. */
  markedParts?: readonly AMarkedPartOnTheWire[]
  /** The person's own name for "No mark", beside the parts. */
  noMarkName?: string
}

/**
 * THE MESSAGE A RUN WAS DELIVERING, as a run that picks it up or resumes it is told it, or null because
 * the message is gone or no longer addressed to that agent.
 *
 * One reading for the two callers that start a run for a message another run was already delivering:
 * `runsToPickUp` below, for a run a restart cut off, and `resumesThePersonAsked` in lib/interrupted.ts,
 * for a run the person pressed resume on. Two readings could tell the two runs different things.
 */
export function whatARunWasDelivering(messageId: string, agentId: string, workspaceId: string): WhatARunWasDelivering | null {
  try {
    const message = readMessage(messageId, workspaceId)
    const delivery = message.deliveries.find((one) => one.to.kind === 'agent' && one.to.id === agentId)
    if (delivery === undefined) return null
    return {
      says: delivery.because ?? '',
      body: message.body,
      quotes: message.quotes,
      quotePositions: message.quotePositions,
      sentAt: message.sentAt,
      sentBy: message.sentBy,
      fromGroup: theGroupForAHandOver(message.toGroup),
      // THE FOURTH ENVELOPE LINE, when the routing also gave this message to the agent this run
      // serves. Built by the one matcher from the message's own `routed`, so a replacement run is
      // told the same thing the first run was.
      routedLine: theRoutedLineFor({ routed: message.routed }, { kind: 'agent', id: agentId }),
      intent: message.intent,
      label: message.label,
      whatTheMarkAsks: message.whatTheMarkAsks,
      whatTheLabelAsks: message.whatTheLabelAsks,
      markedParts: message.markedParts,
      noMarkName: message.noMarkName,
    }
  } catch {
    return null
  }
}

/** The runs `runsToPickUp` reads further: going, started by the office, and naming a message, an agent and a tool. */
function* theRunsThatMayBePickedUp(rows: readonly Row[]): Generator<{
  at: number
  row: Row
  data: Record<string, unknown>
  messageId: string
  agentId: string
  runtime: string
}> {
  for (const [at, row] of rows.entries()) {
    const data = dataOf(row)
    if (said(data['state']) !== 'running') continue
    if (data['startedByMoleOffice'] !== true) continue
    const messageId = said(data['deliveringMessage'])
    const agentId = theAgentARunServes(data)?.id ?? null
    const runtime = said(data['runtime'])
    if (messageId === null || agentId === null || runtime === null) continue
    yield { at, row, data, messageId, agentId, runtime }
  }
}

/**
 * The processes `runsToPickUp` reads, for `readFirst`: those of each run's own rows, and, for an inspection start, those
 * of the run that started it, released rows included (`theRunThatStartedItHasEnded`). The second are named even for a
 * start with a row of its own, which `runsToPickUp` does not read them for: one more reading, and none held.
 */
export function theProcessesThePickUpReads(workspaceId: string): AProcessToRead[] {
  return [...theRunsThatMayBePickedUp(runRows(workspaceId))].flatMap(({ row, data, runtime }) => {
    const own = theProcessesAListingReads({ workspaceId, sessionRecordId: row.id, includeReleased: true })
    const parentId = said(data['parentAttachment'])
    const extra = data['extra'] as { messageWorkerStart?: unknown; messageWorker?: unknown; startupWitness?: unknown } | undefined
    const isPreparing = extra?.messageWorkerStart === 'preparing' && extra.messageWorker === parentId
    const gated = typeof extra?.startupWitness === 'string' && extra.messageWorker === parentId
    if ((runtime !== 'inspection-tool' && !isPreparing && !gated) || parentId === null) return own
    return [...own, ...theProcessesAListingReads({ workspaceId, sessionRecordId: parentId, includeReleased: true, alsoCheckReleasedRows: true })]
  })
}

/** Only the kernel's group liveness check can establish absence: the process-table reader
 * may skip inaccessible members. Its count is therefore a lower bound, not a total. */
function startupGroupReading(group: number): { absent: true } | { absent: false; count: number | null } {
  if (!Number.isSafeInteger(group) || group < 2) return { absent: false, count: null }
  try {
    process.kill(-group, 0)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return { absent: true }
  }
  try {
    const count = osProbe().processesInGroup(group).length
    return { absent: false, count: count > 0 ? count : null }
  } catch {
    return { absent: false, count: null }
  }
}

/**
 * EVERY RUN THAT WAS GOING WHEN A WORKER STOPPED, so the next worker can pick it back up.
 *
 * Problem `wrtc5jmjIVpM`, the builder's own, reproduced by the verifier of part 2d on 4 September
 * 2026. The worker keeps the runs it is watching in a list in memory. When it stops, that list goes;
 * the processes carry on, their session records stay marked running, and nothing reads their output.
 * The person who wrote to the agent gets a tick and no answer. The API server restarts on every
 * merge under `tsx watch`, so this is not a rare state.
 *
 * Everything needed was already stored and this reads it: the run's own session record says which
 * agent, which message, which tool and which conversation, and the ledger row says which process.
 *
 * A RUN WHOSE PROCESS HAS ALREADY ENDED IS HERE TOO, and that is the case that matters most: the
 * worker that picks it up reads its output at once and files the answer that was sitting on disk.
 *
 * A run without a process row has no identity to resume or signal. A marked preparation can be
 * closed when its explicitly named worker is known gone, because it cannot yet have spawned a tool.
 * A gated start can close only when its witness is empty and its recorded group is empty. Other launches remain
 * ambiguous. Older inspection starts keep their existing recovery rule.
 */
export function runsToPickUp(workspaceId: string): RunToPickUp[] {
  const out: RunToPickUp[] = []
  const rows = runRows(workspaceId)
  for (const { at, row, data, messageId, agentId, runtime } of theRunsThatMayBePickedUp(rows)) {
    /**
     * THE PROCESS ROW, INCLUDING ONE THAT HAS BEEN RELEASED SINCE.
     *
     * A live row first, and a released one when there is none. Until 4 September 2026 only a live
     * row counted, and that is exactly what a restart takes away: `registerThisServer` closes every
     * process row on this port whose process has gone, so the API coming back up released the row
     * of the run it had just cut off. The run then had no row, so it was not here, so nothing ever
     * read its output or said anything about it. Its session record said `running` for ever and the
     * person who wrote to the agent had a tick and no answer. Measured on a scratch stack on 4
     * September 2026 (problem `Ldq6KsY1S2RW`): row released at 14:23:17 by the next start, liveness
     * "Nothing is running as pid 99459", and `GET /api/worker/runs` empty.
     *
     * The released row still says which process it was, which is all this needs.
     *
     * THE RUN'S OWN ROW, never one a command of the run registered under the same session: a check
     * runs its build and its model through `tools/sandbox.mjs exec --session <this run>`, which files
     * a row of its own for each. `theToolsOwnProcessRow` says how the two are told apart.
     */
    const held = theToolsOwnProcessRow(workspaceId, row.id)
    let startupFailed: { run?: string; reason: string } | undefined
    const startupHold = (group: number, count: number | null): RunToPickUp => ({
      session: row.id, messageId, agentId, handle: handleOfRegistryId(agentId), runtime,
      providerSession: null, continues: null, pid: 0, pgid: group, startedAt: row.createdAt,
      says: '', startedBeforeThisServer: row.createdAt < THIS_SERVER_LOADED_AT, body: '', quotes: [],
      quotePositions: null, sentAt: row.createdAt, sentBy: null, fromGroup: null, routedLine: null,
      startupHeld: count === null
        ? sayInEnglish('startupGate.heldUnknown', { group: String(group), since: row.createdAt })
        : sayInEnglish('startupGate.held', { group: String(group), count: String(count), since: row.createdAt }),
    })
    if (held !== undefined && process.platform === 'linux') {
      const extra = data['extra'] as { messageWorkerStart?: unknown; startupGroup?: unknown } | undefined
      const group = extra?.startupGroup
      if (extra?.messageWorkerStart === 'launching' && typeof group === 'number' && group === held.pgid) {
        const reading = startupGroupReading(group)
        if (!reading.absent) {
          out.push(startupHold(group, reading.count))
          continue
        }
      }
    }
    if (held === undefined) {
      const extra = data['extra'] as { inspectionRun?: string; messageWorkerStart?: string; messageWorker?: string; startupWitness?: unknown; startupGroup?: unknown; startupBoot?: unknown; startupInode?: unknown } | undefined
      const owned = typeof extra?.messageWorker === 'string' && extra.messageWorker === data['parentAttachment']
      const gated = owned && typeof extra?.startupWitness === 'string' && ['preparing', 'probing', 'launching'].includes(extra.messageWorkerStart ?? '')
      const manualProbe = data['parentAttachment'] == null && extra?.messageWorker === undefined && ['preparing', 'probing', 'launching'].includes(extra?.messageWorkerStart ?? '') && typeof extra?.startupWitness === 'string'
      const preparing = extra?.messageWorkerStart === 'preparing' && owned
      const olderCheck = runtime === 'inspection-tool' && !!extra?.inspectionRun && extra.messageWorkerStart === undefined
      if (!gated && !manualProbe && !preparing && !olderCheck) continue
      if (manualProbe || gated) {
        const group = extra!.startupGroup
        if (group != null) {
          if (process.platform !== 'linux' || typeof group !== 'number' || !Number.isSafeInteger(group) || group < 2) continue
          const reading = startupGroupReading(group)
          if (!reading.absent) {
            out.push(startupHold(group, reading.count))
            continue
          }
        }
        if (!theStartupWitnessIsEmpty(extra!, row.id, workspaceId, data['parentAttachment'])) continue
        // Re-read the group after the witness says the starter and waiting gate can no longer advance.
        if (typeof group === 'number') {
          const reading = startupGroupReading(group)
          if (!reading.absent) {
            out.push(startupHold(group, reading.count))
            continue
          }
        }
      } else if (preparing ? !thePreparingWorkerProcessIsGone(extra!.messageWorker!, workspaceId) : !theWorkerThatStartedItIsGone(data, row.createdAt, workspaceId)) continue
      startupFailed = {
        ...(runtime === 'inspection-tool' && extra?.inspectionRun ? { run: extra.inspectionRun } : {}),
        reason: gated || manualProbe ? sayInEnglish('startupGate.interrupted') : preparing
          ? 'The worker ended while preparing this run, before its tool could start. No process was signalled.'
          : 'The worker ended before this check registered its process. No process identity was recorded, so nothing was signalled. Ask for the check again.',
      }
    }
    const pid = held === undefined ? 0 : Number(held.key)
    if (startupFailed === undefined && (!Number.isInteger(pid) || pid < 1)) continue
    // An interrupted preparation still needs closing even if its message was deleted. Other runs
    // need the message to reconstruct the work they were delivering.
    const delivering = whatARunWasDelivering(messageId, agentId, workspaceId) ?? (startupFailed === undefined ? null : {
      says: '', body: '', quotes: [], quotePositions: null, sentAt: row.createdAt, sentBy: null, fromGroup: null, routedLine: null,
    })
    if (delivering === null) continue
    const { says, body, quotes, quotePositions, sentAt, sentBy, fromGroup, routedLine, intent, label, whatTheMarkAsks, whatTheLabelAsks, markedParts, noMarkName } = delivering
    out.push({
      ...(startupFailed === undefined ? {} : { startupFailed }),
      session: row.id,
      messageId,
      agentId,
      handle: handleOfRegistryId(agentId),
      runtime,
      providerSession: said(data['providerSession']),
      continues: theRunItPickedUp(rows, at)?.id ?? null,
      pid,
      pgid: held?.pgid ?? null,
      startedAt: held?.osStartedAt ?? row.createdAt,
      says,
      startedBeforeThisServer: row.createdAt < THIS_SERVER_LOADED_AT,
      body,
      quotes,
      quotePositions,
      sentAt,
      sentBy,
      fromGroup,
      routedLine,
      intent,
      ...(label === undefined ? {} : { label }),
      ...(whatTheMarkAsks === undefined ? {} : { whatTheMarkAsks }),
      ...(whatTheLabelAsks === undefined ? {} : { whatTheLabelAsks }),
      ...(markedParts === undefined ? {} : { markedParts }),
      ...(noMarkName === undefined ? {} : { noMarkName }),
    })
  }
  return out
}

// ============================================================================ the merge tool's work

/** One entry the office wants its merge tool for, as the worker is told it. */
export interface AMergeToStart {
  entry: string
  state: MergeState
  /** The directory it lands in, which is its lane. */
  lane: string
  adapter: ChangesetAdapter
  /** Since when the office has asked for the tool, local wall-clock time. */
  since: string
}

/** One run the worker needs to watch or close, including an ended run with a running session row. */
export interface AMergeToolRun {
  entry: string
  state: MergeState
  /** The run's own session record. */
  session: string
  log: string
  /** The process, from its ledger row, or null because no process row was ever registered for it. */
  pid: number | null
  pgid: number | null
  startedAt: string
  /** Its live ledger row, which the worker releases when the run ends, or null because none is live. */
  resource: string | null
  /** Why the office wants this run stopped now, in the sentence the entry will carry, or null. */
  stop: string | null
  /** The entry already records how the run ended, while its own session row still says running. */
  endedOnTheEntry: string | null
  /**
   * Why this run is closed without a signal, or null. Its worker recorded the start and ended before
   * the process was on the ledger, so there is no process identity to watch or to stop.
   */
  startupFailed: string | null
}

/**
 * WHAT THE MESSAGE WORKER DOES ABOUT THE MERGE QUEUE, READ IN ONE PLACE. Sandbox v1, piece P9, SPEC.md 5.3.
 *
 * The server keeps the entries and decides; the worker starts `tools/the-merger.mjs` and watches it. This
 * is everything the worker reads to do that, and it acts on nothing:
 *
 *   wanted  the entries the office has marked for its merge tool (`toolWanted`) that no tool run holds,
 *           oldest submission first. The worker starts one at a time, in a slot of its own.
 *   going   every merge tool run that has not ended, and an entry-ended run whose session still says
 *           running, with its process, stop reason, entry ending and any failed-start reason.
 *   hourOver          every resolving entry whose own supervisor's time to resolve is over, with the closed word its
 *                     bounce keeps. The worker asks the office to bounce each one, at
 *                     POST /api/worker/merges/<entry>/hour-over (XHY2fVFG3Qq8, answer 2).
 *   hourCannotBeRead  every resolving entry whose time to resolve cannot be read from its record, with the
 *                     sentence that says so. It is named, and nothing is bounced for it.
 *
 * A RUN WHOSE START IS STILL BEING REGISTERED AND NOT YET RECORDED ENDED ON ITS ENTRY is left out, not
 * closed: its worker may register it the next moment. Other runs with no process row are closed only
 * when that worker is known to have ended — the same rule the check tool's starts are held to,
 * `theWorkerThatStartedItIsGone`.
 */
export async function mergesForTheWorker(
  workspaceId: string,
  clock: () => number = () => performance.now(),
): Promise<{ kind: 'stale' } | { kind: 'ok'; wanted: AMergeToStart[]; going: AMergeToolRun[]; hourOver: { entry: string; until: string; resolution: ResolutionBounce }[]; hourCannotBeRead: { entry: string; says: string }[]; takeBacksDue: ReturnType<typeof takeBacksForProject>['due']; takeBacksForAPerson: ReturnType<typeof takeBacksForProject>['forAPerson']; takeBacksCannotBeRead: ReturnType<typeof takeBacksForProject>['cannotBeRead'] }> {
  const started = clock()
  const parts = { theMergeToolWork: 0, takeBacksForProject: 0, resolvingEntriesWhoseHourIsOver: 0, processRowChecks: 0, parentChecks: 0 }
  const measure = <T>(part: keyof typeof parts, read: () => T): T => {
    const start = clock()
    try { return read() } finally { parts[part] += clock() - start }
  }
  try {
    const takeBackStarted = clock()
    let takeBacks: Awaited<ReturnType<typeof asyncTakeBacksForProject>>
    try {
      // Windows keeps the previous reader until the asynchronous process cleanup is available there.
      takeBacks = osProbe().platform === 'win32'
        ? { kind: 'ok', ...takeBacksForProject(workspaceId) }
        : await asyncTakeBacksForProject(workspaceId)
    } finally { parts.takeBacksForProject += clock() - takeBackStarted }
    if (takeBacks.kind === 'stale') return { kind: 'stale' }
    // Other requests may change merge work while the asynchronous reader is waiting.
    const work = measure('theMergeToolWork', () => theMergeToolWork(workspaceId))
    const hour = measure('resolvingEntriesWhoseHourIsOver', () => resolvingEntriesWhoseHourIsOver(workspaceId))
    const theHour = { hourOver: hour.over, hourCannotBeRead: hour.cannotTell }
    const going: AMergeToolRun[] = []
    for (const one of work.going) {
      const tool = one.tool
      if (tool === null) continue
      const endedOnTheEntry = typeof tool.endedAt === 'string' ? (tool.reason ?? null) : null
      // THE TOOL'S OWN ROW, live first and released when there is none, and never the row of a build, a
      // suite or a rerun the tool ran through `tools/sandbox.mjs exec` under the same session: a worker that
      // followed the suite's row closed a run whose tool was still going (finding 80, `theToolsOwnProcessRow`).
      const held = measure('processRowChecks', () => theToolsOwnProcessRow(workspaceId, tool.session))
      let startupFailed: string | null = null
      if (held === undefined && endedOnTheEntry === null) {
        const gone = measure('parentChecks', () => {
          const session = getRecord(tool.session)
          return session === null || session.workspaceId !== workspaceId
            ? true
            : theWorkerThatStartedItIsGone(session.data, session.createdAt, workspaceId)
        })
        if (!gone) continue
        startupFailed =
          `The worker that started merge tool run ${tool.session} ended before the run's process was registered, so ` +
          'no process identity was recorded and nothing was signalled.'
      }
      const pid = held === undefined ? Number.NaN : Number(held.key)
      going.push({
        entry: one.id,
        state: one.state,
        session: tool.session,
        log: tool.log,
        pid: Number.isInteger(pid) && pid > 0 ? pid : null,
        pgid: held?.pgid ?? null,
        startedAt: held?.osStartedAt ?? tool.startedAt,
        resource: held !== undefined && held.releasedAt === null ? held.id : null,
        stop: whyItsMergeToolShouldStop(one),
        endedOnTheEntry,
        startupFailed,
      })
    }
    return {
      kind: 'ok',
      // EVERY WANTED ENTRY HOLDS ITS MARK, by what `theMergeToolWork` reads; the type is narrowed rather than defaulted.
      // AN ENTRY WHOSE LAST TOOL RUN'S OWN PROCESS STILL RUNS IS LEFT OUT until that process ends, even when the
      // entry records the run as ended: the tool records its own ending a moment before it exits. The office
      // would refuse the start (`recordMergeToolStarted`), and the worker files a session record before it asks.
      wanted: work.wanted.flatMap((one) =>
        one.toolWanted === null || measure('processRowChecks', () => theLastToolRunStillRuns(workspaceId, one.tool)) !== null
          ? []
          : [{ entry: one.id, state: one.state, lane: one.lane, adapter: one.changeset.adapter, since: one.toolWanted.since }],
      ),
      going,
      // THE RESOLVING ENTRIES OVER THEIR TIME TO RESOLVE, and the ones whose time cannot be read, read by the one rule
      // (merge-state-machine.ts, `resolvingEntriesWhoseHourIsOver`). Nothing here decides: the worker asks the office to
      // bounce each one, and the office reads its own record again before it writes.
      takeBacksDue: takeBacks.due,
      takeBacksForAPerson: takeBacks.forAPerson,
      takeBacksCannotBeRead: takeBacks.cannotBeRead,
      hourOver: theHour.hourOver,
      hourCannotBeRead: theHour.hourCannotBeRead,
    }
  } finally {
    const total = clock() - started
    if (total > 500) console.info('worker.merges slow parts (ms)', { total, ...parts })
  }
}

/**
 * A PERSON STOPPED A MERGE TOOL RUN, AND ITS MERGE ENTRY SAYS WHO AND WHY.
 *
 * The run is found from its entry's own record of its tool run, never from the caller: only when the
 * entry the session names still has this session as its tool run, not yet ended, is the ending written
 * there. The worker's next pass finds the process gone and records the same ending, which the entry
 * already holds, so the person's sentence is the one that stays.
 *
 * A STOP PRESS STOPS THE RUN, NOT THE ENTRY. What follows is the state machine's, as for any ending
 * (`theMergeToolRunEnded`): an entry the run left where it was has its merge tool asked for again, up to
 * the number of runs the tool-runs-in-one-place row allows. Taking the entry out of the queue is its withdrawal.
 */
function theMergeToolWasStopped(sessionRecordId: string, data: Record<string, unknown>, because: string, workspaceId: string): void {
  const extra = data['extra'] as { mergeEntry?: unknown } | undefined
  const entryId = typeof extra?.mergeEntry === 'string' ? extra.mergeEntry : null
  const record = entryId === null ? null : getRecord(entryId)
  if (record === null || record.kind !== MERGE_ENTRY_KIND || record.workspaceId !== workspaceId) return
  const tool = readMergeEntry(record).tool
  if (tool === null || tool.session !== sessionRecordId || typeof tool.endedAt === 'string') return
  theMergeToolRunEnded({ workspaceId, id: record.id, session: sessionRecordId, reason: because, actor: THE_WORKER })
}

// ============================================================================ what the worker writes

/**
 * THE WORKER SAYS THIS MESSAGE NEEDS NO RUN: the clock becomes a tick with the reason beside it.
 * The checks-only reading with markDelivered=1 marks settled asks in one batch instead of calling this door.
 *
 * The one thing that needs no run is a line Mole Office wrote, and this asks
 * `whyThisMessageNeedsNoRun` about the stored message rather than believing the caller. When the line is
 * the office's ask for a check of a run that is already settled, the reason is `whyAnAskNeedsNoCheck`'s,
 * asked again here about the stored records, and an ask a newer ask replaced has its own sentence from
 * `whyThisOfficeLineNeedsNoRun`, as the queue's row has. A door that
 * took the caller's word for it would let anything mark any message delivered with no run behind it,
 * which is the one thing `aRunTookIt` is careful about.
 */
export function noRunIsNeeded(
  messageId: string,
  to: ParticipantRef,
  workspaceId: string,
): { mark: DeliveryMark; because: string } {
  const message = readMessage(messageId, workspaceId)
  const agent = to.kind === 'agent' ? readParticipant(to) : null
  const settledAsk = agent !== null && 'handle' in agent ? whyAnAskNeedsNoCheck(messageId, agent.handle, workspaceId) : null
  const because = settledAsk ?? whyThisOfficeLineNeedsNoRun(messageId, message.sentBy, workspaceId)
  if (because === null) {
    throw new PanelError(
      `Message ${messageId} was not written by Mole Office, so it is not a message that needs no run. A message ` +
        'that could have a run is either taken by one or held with the reason why. Nothing was written.',
      400,
    )
  }
  const stands = sayWhereADeliveryStands(messageId, to, { because, mark: 'delivered' })
  return { mark: stands.mark, because }
}

// ============================================================================ a restart cuts a run off

/**
 * WHY THIS RUN WAS CUT OFF BY A RESTART OF THE API, or null because it was not.
 *
 * Criterion M24, problem `Ldq6KsY1S2RW`. Every part of this is read from what is stored, so a line
 * in the conversation naming a restart is never a guess about a run that simply failed.
 *
 * FOUR THINGS HAVE TO BE TRUE AT ONCE:
 *
 *   1. it is a run Mole Office started to deliver a message, and its record still says `running`;
 *   2. nothing is alive holding it — the ledger is asked, not the record;
 *   3. its record was filed BEFORE this server process loaded, so a restart really did happen under
 *      it. A run this server started that is now dead died on its own, and saying otherwise would
 *      be invariant 3 of USER.md broken in a sentence a person reads;
 *   4. nobody stopped it on purpose. A press writes the reason on the delivery row AND ends the
 *      session record, so a stopped run fails the first test above and never reaches here.
 */
export function whyThisRunWasCutOff(session: string, workspaceId: string): string | null {
  const row: Row | undefined = db.select(ROW).from(records).where(eq(records.id, session)).get()
  if (row === undefined || row.kind !== 'session' || row.workspaceId !== workspaceId) return null
  const data = dataOf(row)
  if (data['startedByMoleOffice'] !== true) return null
  if (said(data['state']) !== 'running') return null
  if (said(data['deliveringMessage']) === null || said(data['servingAgent']) === null) return null
  // THE RUN'S OWN PROCESS, never a command it ran under the same session (`theToolsOwnProcessRow`):
  // a live build must not keep a run whose agent was cut off from being said to be cut off.
  if (theLastToolRunStillRuns(workspaceId, { session: row.id }) !== null) return null
  if (row.createdAt >= THIS_SERVER_LOADED_AT) return null
  return (
    `This run was started at ${row.createdAt}, the API server answering now loaded its code at ` +
    `${THIS_SERVER_LOADED_AT}, and nothing is running for it. So the API restarted while it was answering.`
  )
}

/**
 * A RESTART CUT THIS RUN OFF: end it, and say so where the person is looking.
 *
 * ---------------------------------------------------------------------------------------
 * RESUMED WHERE THE RUNTIME ALLOWS, AND OTHERWISE ENDED WITH A LINE
 * ---------------------------------------------------------------------------------------
 *
 * That is criterion M24's sentence, and the two halves are told apart by one stored fact: whether a
 * NEWER run of the same agent carries the same conversation id. Claude Code, Codex and OpenCode all
 * pick a conversation up by the provider's own id, so a cut-off run whose id was known can be
 * carried on, and the worker starts that replacement before it presses this door. When one exists,
 * the delivery row says the conversation was picked up again and nothing is written into the
 * conversation: the answer is still coming and a line saying it was lost would be false.
 *
 * When there is none — the run never got an id, or nothing could be started — the conversation gets
 * the line naming the restart. Nothing the person wrote is lost either way: their message is a
 * record, it is untouched, and the line tells them to send it again.
 *
 * WHY THE MARK IS NOT PUT BACK TO `queued`. A run did take this message, and moving the mark back
 * would say nothing had. It would also put the message in the queue, and a second run would then be
 * started for a message a replacement run is already answering. The mark says how far it got; the
 * sentence beside it says what happened.
 */
export function theRunWasCutOff(
  session: string,
  workspaceId: string,
  mayTouch?: MayTouchTheMessage,
): { because: string; carriesOn: string | null; line: AnOfficeLine | null; messageId: string } {
  theRunRecord(session, workspaceId)
  const because = whyThisRunWasCutOff(session, workspaceId)
  if (because === null) {
    throw new PanelError(
      `Run ${session} was not cut off by a restart of this API in this project, so nothing was written. A run is ` +
        'cut off when Mole Office started it to deliver a message, its record still says running, nothing is alive ' +
        'holding it, and it was filed before this server process loaded.',
      400,
    )
  }
  const row = theRunRecord(session, workspaceId)
  const data = dataOf(row)
  const messageId = said(data['deliveringMessage']) ?? ''
  const agentId = theAgentARunServes(data)?.id ?? ''
  const provider = said(data['providerSession'])
  if (messageId !== '') mayTouch?.(messageId)

  /**
   * A NEWER RUN OF THIS AGENT IN THE SAME CONVERSATION IS THE ANSWER STILL COMING.
   *
   * Worked out here rather than sent in, for `noRunIsNeeded`'s reason: a door that took the caller's
   * word for it could be told an answer was on its way when none was.
   */
  const carriesOn =
    provider === null
      ? null
      : (runRows(workspaceId).find(
          (one) =>
            one.id !== session &&
            one.createdAt >= row.createdAt &&
            theAgentARunServes(dataOf(one))?.id === agentId &&
            said(dataOf(one)['providerSession']) === provider,
        )?.id ?? null)

  patchRecord(session, { dataPatch: { state: 'crashed', doing: because } }, THE_WORKER)

  const onTheRow =
    carriesOn === null
      ? `Mole Office restarted and cut off the run answering this message. ${because}`
      : `Mole Office restarted and cut off the run answering this message. Run ${carriesOn} picked the ` +
        'conversation up where it stopped, so the answer is still coming.'
  sayWhereADeliveryStands(messageId, { kind: 'agent', id: agentId }, { because: onTheRow })

  if (carriesOn !== null) return { because, carriesOn, line: null, messageId }
  const line = SYSTEM_LINES.aRestartCutARunOff
  sayThisAboutARun(session, messageId, agentId, line, workspaceId)
  return { because, carriesOn: null, line, messageId }
}

/** The worker says a run has taken this message: the clock becomes a tick, or a mark further on stays. */
export function aRunTookIt(
  messageId: string,
  to: ParticipantRef,
  input: { session: string; runtime: string; because: string },
  workspaceId: string,
): { mark: DeliveryMark; because: string } {
  // WHEREVER THE MESSAGE IS FILED, criterion M76, for the same reason as `theLiveSessionTookIt`
  // above: a run answering as an agent is not a reader standing in a project.
  readMessageWhereverItIs(messageId)
  // ONE WRITE FOR THE MARK, THE SENTENCE, THE RUN AND THE CLOCK. A run resuming a conversation after
  // a restart takes a message that is already delivered: the mark stays, and the run, the sentence
  // and the clock all move to this run.
  const stands = sayWhereADeliveryStands(messageId, to, { because: input.because, run: input.session, mark: 'delivered' })
  acceptNoticeBatch(to, 'run:' + input.session, true)
  return { mark: stands.mark, because: input.because }
}

/**
 * The worker writes down where this delivery stands, and moves no mark.
 *
 * Used when nothing could be started — the tool is not installed, the runs are all busy, the chain
 * of agents has gone far enough — and again when a run has answered. The mark that comes back is
 * the one the row actually holds, never a word this function decided.
 *
 * ---------------------------------------------------------------------------------------
 * `replacing`: THE WORKER SAYS WHICH SENTENCE IT BELIEVES IS THERE, AND KEEPS ANY OTHER
 * ---------------------------------------------------------------------------------------
 *
 * Problem `BGEX4JjSouCL`, measured on 4 September 2026. A person stopped a run from the product.
 * The row said *the agent X stopped the run serving this message: <why>* for about two seconds, and
 * then said *The run ended without answering. The fake run printed nothing where its answer should
 * be.* Both writers write this one field and the later one wins, so the reason a person asked for
 * was replaced by a description of its consequence — and it reads as a fault in the tool.
 *
 * A caller that sends `replacing` is saying: this is the sentence I last wrote, and I am writing
 * over my own words. Where the row says something else, somebody wrote it after that, they knew
 * something this caller does not, and their sentence is kept. Nothing is written and the answer
 * says so with what the row does say. This is the same shape as the `expect` on a resource release,
 * for the same reason: it proves the writer was looking at THIS reading of the row.
 */
export function sayWhereItStands(
  messageId: string,
  to: ParticipantRef,
  because: string,
  workspaceId: string,
  replacing?: string,
): { mark: DeliveryMark; because: string; written: boolean } {
  const message = readMessage(messageId, workspaceId)
  if (replacing !== undefined) {
    const row = message.deliveries.find((one) => one.to.kind === to.kind && one.to.id === to.id)
    const there = row?.because ?? ''
    if (row !== undefined && there !== replacing) {
      return { mark: row.mark, because: there, written: false }
    }
  }
  // AND A SENTENCE THE ROW ALREADY HOLDS IS NOT WRITTEN AGAIN, which `sayWhereADeliveryStands` is
  // what decides. `written` means this call changed the row; `because` always says what it holds now.
  const stands = sayWhereADeliveryStands(messageId, to, { because })
  return { mark: stands.mark, because, written: stands.written }
}

/** What a reply the worker files must carry. */
export interface Reply {
  /** The message being answered. */
  inReplyTo: string
  /** The agent whose run produced these words. */
  agent: ParticipantRef
  /** The session record of that run. */
  fromRun: string
  /** The words. */
  body: string
  /** Who the reply goes to, when it is addressed to participants by name. Empty for a group. */
  to: readonly ParticipantRef[]
  /** The group the reply goes to, or null because it goes to the people named in `to`. */
  toGroup: string | null
}

/**
 * WHERE A RUN'S ANSWER GOES: the group the question was written in, or back to whoever asked.
 *
 * Problem `xjL8PoDabiW8`. Until 4 September 2026 this was one line in the answered door that read
 * `[answered.sentBy]` and never looked at `toGroup`, so a run answering a group message wrote a
 * private message to the one member who had asked. The group's own conversation held the question
 * and none of the answers, and the owner watching two agents in a group saw nothing they said.
 * Criterion M11: a message to a group goes to every subscriber.
 *
 * A GROUP ANSWER NAMES THE GROUP AND NOBODY ELSE. Who it reaches is worked out when it is written —
 * every member at that moment, the sender excepted — by `whoAGroupMessageReaches` in lib/groups.ts,
 * which is the one place that answers it. Naming people here as well would be the same question
 * answered twice, and `whyTheAddressingIsRefused` refuses a message that does both.
 *
 * WHERE THE MESSAGE NAMES NOBODY, THE ANSWER GOES TO THE OWNER. A message whose `sentBy` is null is
 * what a write from an actor no registry knows produces. Until 4 September the answered door gave
 * such a reply an empty recipient list, which record validation refuses — *A message with nobody to
 * send it to is not a message* — so the run's answer was thrown away (problem `4DK_cvyAc5Ri`). The
 * owner is the honest recipient and not a guess: a message that named nobody was addressed to the
 * owner by the door it came in through.
 */
export function whereAnAnswerGoes(answered: {
  toGroup: string | null
  sentBy: ParticipantRef | null
  aboutRun?: string | null
}): {
  to: ParticipantRef[]
  toGroup: string | null
} {
  if (answered.toGroup !== null) return { to: [], toGroup: answered.toGroup }
  // A MESSAGE THE OFFICE WROTE ABOUT A RUN IS ANSWERED TO THAT RUN'S STARTER, NOT TO THE PERSON.
  // Criterion M93, measured on 8 September 2026: 131 messages reached the owner from the inspector
  // in one day, because every check the office asked for was answered here, and a message with
  // nobody recorded as its sender fell through to the person. Nine of them were the session limit's own
  // words. The office's request names the run it is about; whoever started that run's agent is who
  // wants the answer, and the answer is on the run besides.
  if (answered.sentBy === null || isMoleOffice(answered.sentBy)) {
    const starter = theStarterOfTheRunsAgent(answered.aboutRun ?? null)
    if (starter !== null) return { to: [starter], toGroup: null }
  }
  return { to: [answered.sentBy ?? { kind: 'person', id: THE_PERSON }], toGroup: null }
}

/** Who started the agent a run serves, as a participant, or null because nothing says. */
function theStarterOfTheRunsAgent(runId: string | null): ParticipantRef | null {
  if (runId === null) return null
  const run = getRecord(runId)
  if (run === null || run.kind !== 'session' || typeof run.data !== 'object' || run.data === null) return null
  const served = theAgentARunServes(run.data as Record<string, unknown>)
  if (served === null) return null
  const agent = readParticipant({ kind: 'agent', id: served.id })
  const by = agent !== null && 'startedBy' in agent ? agent.startedBy : null
  if (by === null || typeof by !== 'object') return null
  const ref = by as { kind?: unknown; id?: unknown }
  return ref.kind === 'agent' && typeof ref.id === 'string' && ref.id !== '' ? { kind: 'agent', id: ref.id } : null
}

/**
 * WHICH RUN A WRITE CAME OUT OF WHEN tools/agent-worker.mjs STARTED IT, or null. Problem `0WNMf6-hqt1x`.
 *
 * `theRunAWriteCameFrom` in lib/elevation.ts knows only the runs the office started, which carry
 * `startedByMoleOffice`. The agent worker is a tool a person starts, so the office did not start its
 * runs and their records rightly do not say it did. Until 1 October 2026 such a run also sent no
 * session header, so a message it wrote at POST /api/records was not known to be a run's and was not
 * counted against the per-run limit. The worker now tells each run its own session record's id.
 *
 * THE RECORD IS NOT TAKEN AT ITS WORD. A session record names the agent run it served in
 * `extra.agentRun` and the worker that served it in `parentAttachment`, and both are written by the
 * caller. So this asks the office's own agent-run row as well: the run must have been claimed by that
 * same worker session. A record that names an agent run some other worker claimed, or no run at all,
 * is not a run here.
 *
 * IT IS ASKED ONLY FOR THE MESSAGE LIMIT. It is deliberately not folded into `theRunAWriteCameFrom`,
 * which also decides whether an elevation stops at a run and whether a run holds a handle.
 */
export function theAgentWorkerRunAWriteCameFrom(session: string | null | undefined): { run: string } | null {
  if (typeof session !== 'string' || session === '') return null
  const row = sqlite
    .prepare(
      "SELECT id, json_extract(data, '$.extra.agentRun') AS agentRun, json_extract(data, '$.parentAttachment') AS parent " +
        "FROM records WHERE id = ? AND kind = 'session' AND deleted_at IS NULL AND json_valid(data)",
    )
    .get(session) as { id?: unknown; agentRun?: unknown; parent?: unknown } | undefined
  if (row === undefined || typeof row.agentRun !== 'string' || row.agentRun === '') return null
  if (typeof row.parent !== 'string' || row.parent === '') return null
  const claimed = sqlite.prepare('SELECT claimed_by AS claimedBy FROM agent_runs WHERE id = ?').get(row.agentRun) as
    | { claimedBy?: unknown }
    | undefined
  if (claimed === undefined || claimed.claimedBy !== row.parent) return null
  return { run: String(row.id) }
}

/** How many messages one run may file through the answered door before it is refused. */
export function howManyMessagesOneRunMayFile(): number {
  return gateNumber('run-messages')
}

/** How many messages this run has already filed. Every reply carries the run its words came out of. */
export function messagesThisRunHasFiled(fromRun: string, _workspaceId: string): number {
  return db
    .select(ROW)
    .from(records)
    // EVERY MESSAGE, WHATEVER PROJECT IT WAS WRITTEN IN: a run's id is its own, and a message is in no project now
    // . Asked of one project, this would count nothing and the cap would never hold.
    .where(and(eq(records.kind, 'message'), isNull(records.deletedAt), sql`json_extract(${records.data}, '$.fromRun') = ${fromRun}`))
    .all()
    .filter((row) => said(dataOf(row)['fromRun']) === fromRun).length
}

/**
 * WHY THIS RUN MAY FILE NO MORE MESSAGES, in one sentence, or null because it may file this one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS BOUNDS THAT THE CONVERSATION GUARD DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * Problem `JZ2CrNUlVoll`. `whyThisConversationIsWaiting` above bounds how many RUNS are started,
 * because a run is what costs a model call. It bounds nothing a run does once it is going. A run of
 * an agent tool holds the API address and its own name, so one run can file message after message,
 * and every one of them is a stored row that announces itself to every open page — the browser made
 * unusable in the way problem `jN0TdeawNlZZ` describes, with no model call spent on it.
 *
 * So a run may file `MOLE_OFFICE_RUN_MESSAGES` messages through the answered door and the next one
 * is refused. The count is the messages that name this run, which is the only copy of that number:
 * every reply the worker files carries `fromRun`, so nothing has to keep a tally beside it.
 *
 * IT IS ASKED AT EVERY DOOR A RUN'S MESSAGE COMES IN BY. The answered door asks it in `fileTheReply`
 * below. A message a run writes for itself is asked it in `createRecordWithReport` in
 * lib/records.ts, where `fromRun` is written from the session the request names (problem
 * `0WNMf6-hqt1x`). A run tools/agent-worker.mjs started is known there too, by
 * `theAgentWorkerRunAWriteCameFrom` above. A run that sends no session header, or names a session
 * that is neither a run the office started nor one the agent worker started, is not known to be a
 * run there, and is not counted.
 */
export function whyThisRunMayFileNoMore(fromRun: string, workspaceId: string): string | null {
  const allowed = howManyMessagesOneRunMayFile()
  const filed = messagesThisRunHasFiled(fromRun, workspaceId)
  if (filed < allowed) return null
  return (
    `Run ${fromRun} has filed ${String(filed)} messages, and this installation allows one run ${String(allowed)}. ` +
    'Nothing more is filed from this run. What it said is in the run\'s own output and nothing was written into ' +
    'the conversation.'
  )
}

/**
 * WHY A REPLY THE WORKER FILED WOULD BE REFUSED, or null when it may be filed.
 *
 * The one opening in the rule that a message's sender is its writer. It is narrow on purpose: the
 * run named in `fromRun` has to exist, has to be a session record in this project, and has to be a
 * run the worker started to deliver a message to this same agent. A reply that cannot show its run
 * is refused, and then the agent has said nothing rather than having words put in its mouth.
 *
 * HOW MUCH ONE RUN MAY WRITE IS A DIFFERENT QUESTION and it is asked in `fileTheReply` below, after
 * this one has proved the run is there.
 */
export function whyThisReplyIsRefused(reply: Reply, workspaceId: string): string | null {
  if (reply.agent.kind !== 'agent') {
    return 'A reply the worker files is an agent speaking. Only an agent may be named as its sender.'
  }
  const run: Row | undefined = db.select(ROW).from(records).where(eq(records.id, reply.fromRun)).get()
  if (run === undefined || run.kind !== 'session' || run.workspaceId !== workspaceId) {
    return (
      `This reply says it came out of run ${reply.fromRun}, and no session record in this project has that id. ` +
      'A reply that cannot show the run its words came from is refused, because nothing else here says the ' +
      'agent said them.'
    )
  }
  const data = dataOf(run)
  if (said(data['deliveringMessage']) === null) {
    return `Run ${reply.fromRun} is a session record, and it is not a run the worker started to deliver a message.`
  }
  if (theAgentARunServes(data)?.id !== reply.agent.id) {
    return (
      `Run ${reply.fromRun} was serving ${theNameOfTheAgentARunServes(data)}, and this reply says it is from ` +
      `${handleOfRegistryId(reply.agent.id)}.`
    )
  }
  return null
}

/**
 * THE RUN'S OWN RECORD SAYS IT WAS REFUSED, so a run cut short says so where a reader finds the run.
 *
 * The sentence is also written on the delivery row by the worker, which is where a person reading
 * the conversation meets it. This is the other end: somebody opening the run sees why it stopped
 * being able to speak. Nothing else is changed on the record — the run is still going, and how it
 * ends is not this function's business.
 */
export function sayTheRunHasFiledAllItMay(fromRun: string, because: string, workspaceId: string): void {
  const run: Row | undefined = db.select(ROW).from(records).where(eq(records.id, fromRun)).get()
  if (run === undefined || run.kind !== 'session' || run.workspaceId !== workspaceId) return
  // A REFUSED RUN IS RETRIED, SO THIS IS WRITTEN AGAIN AND AGAIN WITH THE SAME WORDS. Nothing here
  // guards against that: `patchRecord` already makes no revision for a patch that changes nothing,
  // and a second guard here would be the same rule in two places, free to disagree with the first.
  patchRecord(fromRun, { dataPatch: { filingRefused: because } }, THE_WORKER)
}

/**
 * FILE WHAT A RUN SAID, AS A MESSAGE FROM THE AGENT THE RUN WAS SERVING.
 *
 * The change log names the worker, because the worker made the write. The message names the agent,
 * because those are its words, and it names the run they came out of so a reader can check.
 *
 * WHO IT REACHED IS READ BACK OFF THE MESSAGE AND NEVER WORKED OUT HERE. A reply to a group is
 * addressed to the group, and the delivery rows written with it are the only list of who that was.
 * Working the membership out a second time to answer the caller would be one fact in two places.
 */
export function fileTheReply(
  reply: Reply,
  workspaceId: string,
): {
  id: string
  to: readonly ParticipantRef[]
  toGroup: string | null
  /** What the run that answered is now doing about the next message: waiting for it, or nothing. */
  waiting: { waitsUntil: string | null; because: string }
} {
  const because = whyThisReplyIsRefused(reply, workspaceId)
  if (because !== null) throw new PanelError(because, 400)
  /**
   * AND A RUN THAT HAS SAID ALL IT MAY IS REFUSED, AFTER ITS RUN HAS BEEN PROVED TO EXIST.
   *
   * Two different questions, asked in this order on purpose. `whyThisReplyIsRefused` above asks
   * whether these words may be attributed to this agent at all. This asks how much one run may
   * write, and it is asked second because it writes on the run's own record, which the check above
   * is what proves is there.
   */
  const tooMany = whyThisRunMayFileNoMore(reply.fromRun, workspaceId)
  if (tooMany !== null) {
    sayTheRunHasFiledAllItMay(reply.fromRun, tooMany, workspaceId)
    gateMet('run-messages')
    throw new PanelError(tooMany, 400)
  }
  const filed = createRecord({
    kind: 'message',
    title: firstLineOf(reply.body),
    workspaceId,
    data: {
      body: reply.body,
      // A GROUP OR NAMES, NEVER BOTH. `whyTheAddressingIsRefused` refuses a message that carries a
      // group and recipients, because who a group message reaches is the membership at the moment
      // it was written and a named list beside it would be a second answer to that question.
      ...(reply.toGroup === null ? { to: [...reply.to] } : { toGroup: reply.toGroup }),
      sentBy: reply.agent,
      inReplyTo: reply.inReplyTo,
      fromRun: reply.fromRun,
    },
    actor: THE_WORKER,
    // The worker is not a participant, so the sender it names is checked here rather than filled in
    // from the actor. `whyThisReplyIsRefused` above is that check.
    senderIsTheRun: true,
  })
  /**
   * AND THE RUN NOW WAITS FOR THE NEXT MESSAGE (criterion M22).
   *
   * This is the one moment a run is known to have answered, so it is where the wait starts. It is
   * here rather than in the route above so that no door can file an answer and forget it, and it is
   * here rather than in the worker because the length of the wait is a setting this server reads —
   * the worker asking the same setting would be the same number worked out in two processes.
   */
  const waiting = startTheWait(reply.fromRun, workspaceId)
  /**
   * AND THE CONVERSATION IS TOLD THAT A RUN ANSWERED, not the agent's live session (criterion H3).
   *
   * It is written AFTER the reply, so a reader meets the answer first and then the line saying where
   * it came from. It is written here rather than in the route above for the reason the wait is: no
   * door may file an answer and forget to say what answered it.
   *
   * IT IS ATTEMPTED AND NEVER ALLOWED TO LOSE THE REPLY. The reply is stored by this point, and a
   * conversation this line cannot be written into — a message nobody recorded a sender for — must
   * not turn a filed answer into a refusal the run then retries. What went wrong goes in the log.
   */
  try {
    /**
     * WHICH OF THE TWO LINES, READ FROM WHAT THE RUNS STORED, NEVER FROM THE AGENT'S CARD.
     *
     * A run that picked up a conversation has an older run of the same agent with the same id
     * (`theRunItPickedUp`). This is the reading `runsWaitingForTheNextMessage` makes when it says the
     * next message was answered inside a conversation. So a worker resumed inside its wait and a
     * secretary or a supervisor resumed after it both get `aRunPickedUpItsConversation`, whose words
     * are true for them, and every other run gets `aRunAnswered`, whose words say it does not
     * remember earlier conversations.
     */
    const runs = runRows(workspaceId)
    const pickedUp = theRunItPickedUp(runs, runs.findIndex((row) => row.id === reply.fromRun)) !== null
    const line = pickedUp ? SYSTEM_LINES.aRunPickedUpItsConversation : SYSTEM_LINES.aRunAnswered
    sayThisAboutARun(reply.fromRun, reply.inReplyTo, reply.agent.id, line, workspaceId)
  } catch (err) {
    console.error(
      `The reply to ${reply.inReplyTo} was filed and the line saying a run answered was not: ${
        (err as Error).message
      }`,
    )
  }
  const written = readMessage(filed.id, workspaceId)
  return { id: filed.id, to: written.to, toGroup: written.toGroup, waiting }
}

/** A title for a message, which is its first line, shortened. */
function firstLineOf(body: string): string {
  const line = (body.split('\n').find((one) => one.trim() !== '') ?? 'a reply').trim()
  return line.length > 120 ? `${line.slice(0, 117)}...` : line
}

// ============================================================================ what the runtime page reads

/**
 * What the worker is doing, worked out from the records and rows it wrote.
 *
 * Across every project, because the worker is one process for the whole installation. A reader of
 * the runtime page is asking what is running on this machine, not what is running in one project.
 */
export function workerRuns(): WorkerRuns {
  const rows = runRows()
  const inFlight = theRunsInFlight(rows)
  /**
   * AND THE RUNS THAT HAVE ANSWERED AND ARE HOLDING THEIR CONVERSATION OPEN (criterion M22).
   *
   * The sentence says how long is left, because that is the thing a reader wants: whether writing
   * now still reaches the same run. A wait whose moment has passed and which nothing has closed yet
   * says exactly that instead of a number, rather than showing "0 minutes left" for something that
   * is no longer waiting at all.
   */
  // THE ROWS ALREADY READ ABOVE, handed on rather than read a second time: they are `runRows()`,
  // which is what the waiting runs would read for themselves.
  const waitingForTheNextMessage: WorkerRuns['waitingForTheNextMessage'] = runsWaitingForTheNextMessage(undefined, rows).map(
    (one) => {
      const waits = one.over
        ? saying('workerRunWaitOver', { handle: one.handle, runtime: one.runtime, until: one.until })
        : saying('workerRunWaiting', { handle: one.handle, runtime: one.runtime, n: one.minutesLeft, until: one.until })
      return { session: one.session, says: inEnglish(waits), said: waits }
    },
  )
  const newest = rows[0]
  // COUNTED BY THE DATABASE. Only the number is drawn, so no row is read to reach it. A count
  // always answers one row; if it answers none, that is a broken assumption and it is said.
  const counted = db
    .select({ n: sql<number>`count(*)` })
    .from(messageDelivery)
    .where(and(eq(messageDelivery.mark, 'queued'), eq(messageDelivery.recipientKind, 'agent')))
    .get()
  if (counted === undefined) throw new Error('Counting the queued deliveries answered no row, so the count is unknown.')
  const waiting = Number(counted.n)
  return {
    inFlight,
    waitingForTheNextMessage,
    last: newest === undefined ? null : theLastRun(newest),
    waiting,
  }
}

/**
 * THE RUNS THE WORKER HAS GOING, each with its line, in the order of `rows` (every run row, newest first).
 *
 * The runtime page's `inFlight`, read alone (wave 13y round 46). The office scene asks only which runs are going, and
 * reading the rest of `workerRuns` for it read every waiting run's agent again and counted the queue.
 */
export function theRunsInFlight(rows: readonly Row[] = runRows(), identityOf?: TheIdentityOf): WorkerRuns['inFlight'] {
  const inFlight: WorkerRuns['inFlight'] = []
  for (const row of theRunsWhoseRecordSaysRunning(rows)) {
    const data = dataOf(row)
    // A RUN IS GOING WHEN ITS PROCESS IS, not when its record says so. The same rule `runServing`
    // keeps, for the same reason: a worker that was restarted leaves records saying running. It is the
    // run's own process, never a command it ran under the same session (`theToolsOwnProcessRow`).
    if (theLastToolRunStillRuns(row.workspaceId, { session: row.id }) === null) continue
    const handle = theNameOfTheAgentARunServes(data, identityOf)
    const runtime = said(data['runtime']) ?? 'a tool nobody wrote down'
    const going = saying('workerRunGoing', { handle, runtime, at: row.createdAt })
    inFlight.push({ session: row.id, says: inEnglish(going), said: going })
  }
  return inFlight
}

/** The runs `theRunsInFlight` asks about: those whose record says running. */
function theRunsWhoseRecordSaysRunning(rows: readonly Row[]): Row[] {
  return rows.filter((row) => said(dataOf(row)['state']) === 'running')
}

/** The processes `theRunsInFlight` reads, for `readFirst` in lib/resources.ts: each such run's own rows, in every project. */
export function theProcessesTheRunsInFlightRead(rows: readonly Row[] = runRows()): AProcessToRead[] {
  return theRunsWhoseRecordSaysRunning(rows).flatMap((row) => theProcessesAToolsOwnRowReads(row.workspaceId, row.id))
}

/**
 * `theRunsInFlight` OF THESE RUNS ONLY, in their order (wave 13y round 51): the ones among them that the whole list holds,
 * for a reading that asks only whether some agents' runs are going. `rows` are session records of the projects read.
 */
export function theRunsInFlightAmong(rows: readonly Row[], identityOf?: TheIdentityOf): WorkerRuns['inFlight'] {
  return theRunsInFlight(runRows(undefined, rows), identityOf)
}

/**
 * THE NEWEST RUN, IN ONE LINE. The state goes as the stored word, and `stateWord` reads it in the
 * language being drawn (`state` in src/shared/dev-sayings.ts).
 */
function theLastRun(newest: Row): { session: string; says: string; said: DevSaying } {
  const data = dataOf(newest)
  const last = saying('workerLastRun', {
    handle: theNameOfTheAgentARunServes(data),
    state: said(data['state']) ?? '',
    at: newest.createdAt,
  })
  return { session: newest.id, says: inEnglish(last), said: last }
}

/** The handle a registry id answers to, or a plain phrase saying nobody wrote one down. */
function handleOfRegistryId(id: string | null): string {
  if (id === null) return 'an agent nobody wrote down'
  const registry = readParticipant({ kind: 'agent', id })
  return registry !== null && 'handle' in registry ? registry.handle : id
}

/** The sentence a delivery row gets when a person stops the run that was serving it. */
export function stoppedBy(who: Actor, why: string): string {
  return `${who.type === 'human' ? who.id : `the agent ${who.id}`} stopped the run serving this message: ${why}`
}

/**
 * WHEN A RUN IS STOPPED FROM THE PRODUCT, THE MESSAGE IT WAS DELIVERING SAYS SO.
 *
 * Otherwise a person looking at the conversation sees a message that stopped moving and nothing
 * saying why, which is the failure criterion M6's sentence beside the clock exists to prevent.
 *
 * Returns null when this session was not a run delivering a message — the API server's own row, a
 * process somebody else registered — because there is then nothing to say it on. It also returns null,
 * after ending the run's record, when the agent the run names is no one agent in the registry: the
 * delivery row is kept under a registry id, so there is then no row to say it on.
 */
export function sayARunWasStopped(
  sessionRecordId: string,
  who: Actor,
  why: string,
  workspaceId: string,
): { messageId: string; because: string } | null {
  const run: Row | undefined = db.select(ROW).from(records).where(eq(records.id, sessionRecordId)).get()
  if (run === undefined || run.kind !== 'session' || run.workspaceId !== workspaceId) return null
  const data = dataOf(run)
  // A MERGE TOOL RUN DELIVERS NO MESSAGE. Its record ends as any stopped run's does, and the entry it was
  // running for says who stopped it and why. Sandbox v1, piece P9.
  if (data['runtime'] === MERGE_TOOL_RUNTIME) {
    const because = `${who.type === 'human' ? who.id : `The agent ${who.id}`} stopped this merge tool run: ${why}`
    patchRecord(sessionRecordId, { dataPatch: { state: 'crashed', doing: because } }, THE_WORKER)
    theMergeToolWasStopped(sessionRecordId, data, because, workspaceId)
    return null
  }
  const messageId = said(data['deliveringMessage'])
  if (messageId === null || said(data['servingAgent']) === null) {
    /**
     * A RUN THAT DELIVERS NO MESSAGE STILL ENDS WHEN IT IS STOPPED. Problem GOYE4Y8okQ-z: the
     * message worker's own row can be stopped from the product, and until 30 September 2026 its
     * record went on saying `running`. Only a record that IS the process (`startedByMoleOffice`)
     * and has not already ended is written; a stop of what an ended session left behind changes
     * nothing on that session's record.
     */
    const state = data['state']
    const ended = typeof state === 'string' && (TERMINAL_STATES as readonly string[]).includes(state)
    if (data['startedByMoleOffice'] === true && !ended) {
      const stopper = who.type === 'human' ? who.id : `The agent ${who.id}`
      patchRecord(sessionRecordId, { dataPatch: { state: 'crashed', doing: `${stopper} stopped this run: ${why}` } }, THE_WORKER)
    }
    return null
  }
  const because = stoppedBy(who, why)
  /**
   * AND THE RUN'S OWN RECORD SAYS IT HAS ENDED, which until 4 September 2026 it never did.
   *
   * A press released the ledger row and wrote on the delivery row, and left the session record
   * saying `running` for ever — the same lie `runsToPickUp` above complains about for a worker that
   * was restarted. It matters more now than it did: criterion M24 asks whether a dead run was cut
   * off by a restart, and a run somebody stopped on purpose must not be able to answer yes. Ending
   * the record here is what keeps those two apart, without anybody reading a sentence to tell them.
   *
   * `crashed` is the word, out of the six a session may hold. It did not finish, and we saw it end.
   * `doing` says who ended it and why, so nothing is hidden behind the word.
   */
  patchRecord(sessionRecordId, { dataPatch: { state: 'crashed', doing: because } }, THE_WORKER)
  if (data['runtime'] === 'inspection-tool') {
    const extra = data['extra'] as { inspectionRun?: string } | undefined
    if (extra?.inspectionRun) recordCheckToolEnded(extra.inspectionRun, sessionRecordId, because, workspaceId)
  }
  // THE DELIVERY ROW IS KEPT UNDER THE AGENT'S REGISTRY ID. A run whose stored name no single agent
  // answers to has no row that can be found, so its record is ended above and nothing more is said.
  const agentId = theAgentARunServes(data)?.id ?? null
  if (agentId === null) return null
  try {
    sayWhereADeliveryStands(messageId, { kind: 'agent', id: agentId }, { because })
  } catch {
    // The message or its delivery row has been deleted since the run started. Stopping the process
    // still happened, and the caller is told about that rather than about a row that is not there.
    return null
  }
  return { messageId, because }
}

// ============================================================================ the worker process itself

/** What this server did about starting a worker, written down once at boot. */
export interface TheWorkerWeStarted {
  started: boolean
  /** One sentence a person reads on the runtime page. */
  says: string
  /** `says` as a code the runtime page draws in its own language, or null for merges-only mode. */
  said: DevSaying | null
  pid: number | null
  pgid: number | null
  sessionRecordId: string | null
  resourceId: string | null
  /** The script answering every message instead of an agent tool, or null because none is. */
  runsAreFaked: string | null
}

/**
 * WHAT THE WORKER'S OWN SESSION ROW SAYS IT IS DOING, by the mode `MOLE_OFFICE_MESSAGE_WORKER` set.
 * The row is filed before the process exists, so this says what the worker is started to do.
 */
export function whatTheWorkerIsStartedToDo(mergesOnly: boolean): string {
  return mergesOnly
    ? `starting the office's merge tool for the merge entries the office marks, and the sandbox launcher for the rounds asked through the next-round door and the worker runs asked through the worker-run door. ${MERGES_ONLY_SAYS}`
    : 'taking the message queue and starting a run of an agent tool for each message to an agent'
}

/**
 * THE LINE THE RUNTIME PAGE CARRIES ABOUT A WORKER THIS SERVER STARTED. In merges-only mode it says so, in
 * the words the worker's own log uses, because "started" alone would read as a worker taking the queue.
 */
export function whatTheStartedWorkerSays(mergesOnly: boolean, child: { pid: number; pgid: number }, logPath: string): string {
  const started = inEnglish(whatTheStartedWorkerSaid(child, logPath))
  return mergesOnly ? `${started}. ${MERGES_ONLY_SAYS}` : started
}

/** The line above as a code. Merges-only mode adds a sentence from src/config/settings.mjs that has none. */
export function whatTheStartedWorkerSaid(child: { pid: number; pgid: number }, logPath: string): DevSaying {
  return saying('workerStarted', { pid: String(child.pid), group: String(child.pgid), log: logPath })
}

/**
 * WHERE ONE WORKER'S LOG GOES, so two stacks on one checkout do not write into one file.
 *
 * Problem `8aHsfRuQ5B8G`, found on 4 September 2026. The path was built from the checkout alone, so
 * every server started from this checkout appended to `.logs/the-message-worker.log`. The lines of
 * two workers were interleaved with nothing saying which wrote which, and a verifier reading it
 * could not find its own worker's lines. Diagnosing a worker means reading its log.
 *
 * THE PORT IS WHAT NAMES IT, because that is what a person knows about a stack: the scratch API on
 * 29940 and the canonical one on the configured port are how anybody here refers to them. A server
 * that has not bound a socket yet has no port to be known by, so its worker's session record id names the file
 * instead; that is unique per worker too, and it is on the runtime page beside the path.
 *
 * @param checkout the repository this server is serving from
 * @param port the port this server answers on, or null because it has bound none
 * @param sessionRecordId the session record filed for this worker
 */
export function theWorkerLogPath(checkout: string, port: number | null, sessionRecordId: string): string {
  const named = port === null ? sessionRecordId : String(port)
  return `${checkout.replace(/\/$/, '')}/.logs/the-message-worker-${named}.log`
}

/**
 * WHAT THE ROW SAYS BEFORE ANYTHING HAS TRIED TO START A WORKER.
 *
 * This is a real state and not a placeholder: `buildApp` builds the API and starts nothing, and the
 * boot path that starts a worker runs only when the server is started as a program. A test that
 * builds the app in place is in exactly this state, and so is a server that failed before it got
 * that far. Saying "no worker" without saying which would be the difference between nothing is
 * there and nobody has looked, thrown away.
 */
const NOTHING_HAS_TRIED_SAID = saying('workerNothingTried', {})
export const NOTHING_HAS_TRIED = inEnglish(NOTHING_HAS_TRIED_SAID)

/**
 * WHAT THIS SERVER DID ABOUT A WORKER, AT BOOT, KEPT.
 *
 * A fact about the past, like the moment this process loaded: it cannot be worked out again later,
 * because by then the worker has either been started or it has not. Whether that process is still
 * ALIVE is never kept — that is read from the machine every time somebody asks.
 */
let started: TheWorkerWeStarted = {
  started: false,
  says: NOTHING_HAS_TRIED,
  said: NOTHING_HAS_TRIED_SAID,
  pid: null,
  pgid: null,
  sessionRecordId: null,
  resourceId: null,
  runsAreFaked: null,
}

/** Write down what happened when this server tried to start a worker. */
export function noteTheWorker(what: TheWorkerWeStarted): void {
  started = what
}

/** What this server did about a worker. */
export function theWorkerWeStarted(): TheWorkerWeStarted {
  return started
}

/** Forget it, for a test that starts a second server in one process. */
export function forgetTheWorker(): void {
  started = {
    started: false,
    says: NOTHING_HAS_TRIED,
    said: NOTHING_HAS_TRIED_SAID,
    pid: null,
    pgid: null,
    sessionRecordId: null,
    resourceId: null,
    runsAreFaked: null,
  }
}
