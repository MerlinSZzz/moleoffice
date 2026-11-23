// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER AN AGENT CAN BE REACHED RIGHT NOW. ONE READING, THREE INPUTS, AND IT NAMES THE ONE IT USED.
 *
 * ---------------------------------------------------------------------------------------
 * PRESENCE IS NEVER STORED. IT IS TAKEN AT THE MOMENT SOMEBODY ASKS
 * ---------------------------------------------------------------------------------------
 *
 * There is no `presence` column, no heartbeat column and no `lastSeen` stamp anywhere, and there
 * must not be one. A stored word is not a reachable agent: `session.data.state` reads `running` on
 * twelve records in this corpus today and nothing is running. A surface that draws a stored word as
 * presence is drawing what somebody wrote down, not what is true now.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE INPUTS ARE OF UNEQUAL STRENGTH, SO THE READING SAYS WHICH ONE ANSWERED
 * ---------------------------------------------------------------------------------------
 *
 * Drawing two different facts under one word is this repository's recurring defect, so the reply
 * carries `from` beside the word, and `inputs` says what each of the three had to offer — including
 * the ones that had nothing, and including the difference between *nothing is there* and *nobody has
 * looked*.
 *
 *   `listen`             A request the server is holding open for this agent. The strongest input
 *                        there could be, because a held connection cannot lie. **IT EXISTS SINCE
 *                        4 SEPTEMBER 2026**: GET /api/events holds one request open per page, and
 *                        src/server/lib/events.ts knows which participant each open one belongs to.
 *                        So this input now answers. It reports `nothing-recorded` when no page is
 *                        open for this agent, which says somebody looked and found nothing — a
 *                        different fact from the `reader-not-built` it used to report, which said
 *                        nobody could look. **IN PRACTICE NO AGENT OPENS ONE TODAY**: the pages
 *                        holding connections are browsers, and a browser says a person is there.
 *
 *   `request`            The newest `api_calls` row whose `session_id` is one of this agent's open
 *                        attachments. Weaker: it says something arrived, not that anybody is there.
 *                        **Nearly empty in fact**, measured 27 August 2026: 21 rows of 10,647 carry
 *                        a session at all, across two distinct values, one of which is not a record
 *                        id. The repair is the write side — an attached agent sending the
 *                        `x-mole-office-session` header — and not a new channel of our own.
 *
 *   `attachment-opened`  The moment the attachment opened, used as the last arrival when nothing
 *                        else answers. The weakest, and it says so. Its honest consequence: an
 *                        attachment that opens and never speaks to Mole Office again goes Stale after the
 *                        threshold and stays there. That is correct — an attachment Mole Office never
 *                        hears from is exactly what Stale means.
 *
 * **`actor_id` IS NOT AN INPUT AND CANNOT BE ONE.** The nearest design said the heartbeat was
 * `max(api_calls.at_ms)` for that actor. Measured: `actor_id` is a free string and names no durable
 * agent — the values in this corpus are the person's id, `claude-code`, `r10-wave-14` and other free strings.
 * The key that works is `session_id`, which is an attachment's record id.
 *
 * **`changes` IS BETTER POPULATED AND IS DELIBERATELY NOT USED HERE.** 1,526 of 2,382 change rows
 * carry a session against 21 of 10,647 api_calls rows. It is the right signal for *did anything
 * meaningful happen*, which is the watchdog's question. It is the wrong signal for *is anybody
 * there*, because an agent that reads for an hour without writing is present and would read as
 * absent. The two questions want opposite signals and merging them would answer both wrongly.
 *
 * ---------------------------------------------------------------------------------------
 * PRESENCE AND WORK STATE ARE TWO DIMENSIONS AND THIS FILE JOINS NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here takes a work state or returns one, and `@shared/lifecycle.ts`'s work-state half is
 * not imported. All fifteen pairs of the two vocabularies can occur. The pair a reader will want to
 * call impossible — **Offline and Working** — is the most important one there is: it is what an API
 * death looks like, and deriving the work state from presence would silently call every one of them
 * a success.
 */

import { PRESENCE, STALE_AFTER_MINUTES, STALE_THRESHOLD_IS_UNMEASURED, type Presence } from '@shared/lifecycle.ts'
import type { PanelRecord } from '@shared/types.ts'
import { IN_A_TERMINAL_WORD } from '@shared/terminals.ts'
import { kindWord } from '@shared/words.ts'
import { and, eq, getTableColumns, isNull, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { minutesSince, newestRequestAmong, newestRequestFor, type NewestRequestOfEachRun } from './arrivals.ts'
import {
  openAttachmentsFor,
  theAttachmentIsOpen,
  theFieldTheOpenRuleReads,
  type AttachmentView,
} from './attachments.ts'
import { ranAsIn } from '@shared/ran-as.ts'
import { getRecord, inTheListedOrder } from './records.ts'
import { toRecord } from './to-record.ts'
import { PanelError } from './panel-error.ts'
// WHICH SESSION STATES MEAN THE RUN IS OVER, so this file and the one that revokes a run's key
// cannot hold two different answers to that question.
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { theNewestUsesWithTheirMomentsOf } from './newest-use.ts'
import { type RegisteredAgent, type RegisteredPerson } from './participants.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { recordForAgentIn } from '../db/record-for-agent-in.ts'
import { recordsForAgentsIn } from '../db/records-for-agents-in.ts'
import { whoIsConnected } from './events.ts'
// WHICH SESSION IS ANSWERING AS AN AGENT, criterion M74. A hold outlives the waiter process that
// made it, which is the whole reason presence reads it.
// AND WHETHER THAT HOLD'S SESSION IS STILL THERE, criterion M106. The same reading the handle door
// uses, so the dot and the handle door cannot disagree about one agent.
import {
  theFactsOfASession,
  theReadingOf,
  theSessionBehindTheHold,
  type HeldSessionReading,
} from './answering.ts'
// WORKER.TS IMPORTS THIS FILE TOO. The two are a cycle of the safe kind: nothing here is called while
// the modules load, only when a reading is asked for.
import { runsStillInsideTheirWaitAmong, theAnsweringReading, theMessageRunRowsByTheAgentTheyServe, theRunningRowsByTheAgentTheyServe, type HowTheAnsweringIsRead, type TheAnsweringReading, type WaitingRun } from './worker.ts'
import { NEWEST_SESSION_FIRST } from '../db/newest-session-first.ts'
import { type theRunRowsOfOneReach } from './the-run-rows-of-one-reach.ts'
import { localStamp, momentOfAStampAndItsInstant, parseAnyStamp } from '@shared/time.ts'
import {
  PRESENCE_BEFORE_ANYBODY_CHOOSES,
  participantWord,
  type ParticipantRef,
  type PresenceChoice,
} from '@shared/participants.ts'
import { ANSWERING_WORD, STATE_IS_STALE, participantKey, theReasonAsOneSentence } from '@shared/messages.ts'
import { aDotSaysOnline } from '@shared/contacts.ts'
import { hasWrittenTo } from './messages.ts'
import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import { everyPermanentResident } from '../db/every-permanent-resident.ts'
import { isAPermanentResident } from '../db/is-a-permanent-resident.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theCardOfAgent } from '../db/the-card-of-agent.ts'
import { theCardTheRoleIs } from '@shared/the-card-the-role-is.ts'
import { eachAgentsIdentityReadOnce, everyAgentsIdentityReadOnce, type TheIdentityOf } from './agent-references.ts'
import { everyLiveHoldReadOnly, theLiveHoldOn } from './handles.ts'
import { theRunAWriteCameFrom } from '../db/the-run-a-write-came-from.ts'
import { theRunsWritesCameFrom } from '../db/the-runs-writes-came-from.ts'
import type { HoldOnTheWire } from '@shared/handles.ts'
import { theSleepLineOf, type TheSleepLine } from './resident-sleep.ts'
import { agentAliveWithinMinutes, personAliveWithinSeconds } from './env.ts'
import { listResources, whoRegisteredIt, type ResourceReport } from './resources.ts'
import { db, sqlite } from '../db/client.ts'
import { keptStatement } from '../db/kept-statement.ts'
import { isOneOfTheIds, theFiledAliasesReadOnce, type TheFiledAliases } from './registry-aliases/runs.ts'
import { records, STORED_FIELDS, theKindOfARowFoundById, theProjectOfARowFoundById, theWordsOfAStoredField } from '../db/schema.ts'
// A CYCLE, and a safe one: lib/worker.ts imports this file too, and neither calls the other at import.
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { theRecordsByAgent } from '../db/these-agents-only.ts'
import { theSessionCandidates } from '../db/these-agents-only.ts'
import { theProcessRowStatements } from '../db/these-agents-only.ts'
import { theCandidateBuckets } from '../db/these-agents-only.ts'
import { theRowCouldBeOneOf } from '../db/these-agents-only.ts'
import type { TheseAgentsOnly } from '../db/types/presence.ts'

/** The three inputs a presence reading may be taken from, strongest first. */
export const PRESENCE_INPUTS = ['listen', 'request', 'attachment-opened'] as const

/** Which input answered. */
export type PresenceInput = (typeof PRESENCE_INPUTS)[number]

/**
 * What one input had to offer.
 *
 * `reader-not-built` and `nothing-recorded` are two different answers on purpose. The first says
 * nobody has looked, because there is nothing to look with; the second says somebody looked and
 * found nothing. Collapsing them is the guess this product refuses.
 */
export type InputAnswer = 'answered' | 'nothing-recorded' | 'reader-not-built'

/** One input, what it said, and the sentence a person reads about it. */
export interface PresenceInputReading {
  input: PresenceInput
  answer: InputAnswer
  /** The arrival moment this input found, as a local wall-clock stamp. Null unless it answered. */
  at: string | null
  says: string
}

/** What presence reads as for one durable agent, right now, and what it was read from. */
export interface PresenceReading {
  agentId: string
  workspaceId: string
  /** Online, Stale, Offline or Inactive. */
  presence: Presence
  /** What a person reads on the screen. */
  word: string
  /** What the product says when they ask what the word means. */
  says: string
  /**
   * Which of the three inputs decided it, or null when no attachment is open.
   *
   * Null is not a missing value. Offline is decided by the attachment roster — there is nothing
   * open — and no arrival input was consulted at all. `whyNoInput` says that in a sentence.
   */
  from: PresenceInput | null
  /** Why `from` is null, or null when an input answered. */
  whyNoInput: string | null
  /** When something last arrived, according to the input named in `from`. */
  lastArrival: string | null
  /** How long it has been quiet, in whole minutes. Null when nothing has arrived to count from. */
  quietForMinutes: number | null
  /** The open attachments this reading was taken over, newest first. */
  openAttachments: string[]
  /** The declared threshold, so a caller never has to know it. */
  staleAfterMinutes: number
  /** The sentence that says nobody has measured the threshold. Drawn wherever the number is. */
  thresholdIsUnmeasured: string
  /** What each of the three inputs said, strongest first. */
  inputs: PresenceInputReading[]
}

/**
 * The sentence the `listen` input reports, every time, until somebody builds a held request.
 *
 * Written out once here rather than at the two call sites, because a reader who meets it twice with
 * two wordings will believe two different things have happened.
 */
const NOBODY_LISTENING = 'Looked and found nothing: this agent holds no connection open at GET /api/events.'

/** What the listen input says when a connection for this agent really is open. */
function listening(ago: number): string {
  return `A connection is held open for this agent; last heard ${String(Math.round(ago / 1000))} seconds ago. The strongest input.`
}

/**
 * Refuse an id that names nothing, names something else, or belongs to another project. `known` is the record when a
 * roster has already read it, so the same three questions are asked of it without reading it again.
 */
function theAgent(agentId: string, workspaceId: string, known?: PanelRecord): void {
  const record = known ?? getRecord(agentId)
  if (record === null || record.deletedAt !== null) {
    throw new PanelError(
      `No agent has the id ${agentId}, so there is nobody whose presence could be read. A durable agent is a ` +
        'record of kind "agent".',
      404,
    )
  }
  if (record.kind !== 'agent') {
    throw new PanelError(
      `${agentId} is a ${kindWord(record.kind).text}${quotedUnlessAMessage(record, ' — ', ' —')} and not a durable agent. Presence is about an ` +
        'agent, and an attachment or a run is not one.',
      400,
    )
  }
  if (record.workspaceId !== workspaceId) {
    throw new PanelError(
      `"${record.title}" is an agent in "${record.workspaceId}" and this request is about "${workspaceId}".`,
      404,
    )
  }
}

/**
 * WHAT A CALLER READING MANY AGENTS AT ONCE HAS ALREADY READ, so `presenceOf` does not read it again
 * for each agent.
 *
 * The roster in src/server/lib/working.ts reads presence for every active agent. Asked one agent at
 * a time, `presenceOf` read every open run in the project once per agent to find that agent's own,
 * and walked `api_calls` once per agent for the newest request. On a copy of the owner's office on
 * 27 September 2026 (177 active agents, 2,982 open runs, 944,834 calls) that was 7.4 seconds of
 * the 7.5 a call took. Read once for the whole roster, the answer is the same and costs about
 * 0.2 seconds; `tests/the-roster-reads-each-run-once.test.ts` compares the two.
 *
 * `openRunsOf` must give what `openAttachmentsFor` would give for that agent, newest first, and
 * `newestRequests` must have been asked about every one of those runs.
 */
export interface WhatARosterReadOnce {
  openRunsOf: (agentId: string) => readonly AttachmentView[]
  newestRequests: NewestRequestOfEachRun
  /**
   * EACH ACTIVE AGENT'S RECORD AND REGISTRY ROW, read once for the roster (wave 13r round 11). Without them `presenceOf`
   * read the record and the registry row again for every agent, two queries an agent, and Home's readiness waited on
   * the roster. `recordOf` answers the record the roster read, or undefined for an agent it did not read, which is
   * then read here as before; `registeredOf` answers what `agentForRecord` would.
   */
  recordOf?: (agentId: string) => PanelRecord | undefined
  registeredOf?: (agentId: string) => RegisteredAgent | null
}

/**
 * WHETHER THIS AGENT CAN BE REACHED RIGHT NOW.
 *
 * The rule, in three sentences. No open attachment is **Offline**. An open attachment with an
 * arrival newer than the threshold is **Online**. An open attachment whose newest arrival is older
 * than the threshold is **Stale**.
 *
 * `now` is injectable so a test can put the clock where it needs it. It defaults to the server's
 * clock and no caller may supply a moment that is stored — nothing here writes anything at all.
 */
export function presenceOf(
  agentId: string,
  workspaceId: string,
  now: Date = new Date(),
  alreadyRead?: WhatARosterReadOnce,
): PresenceReading {
  theAgent(agentId, workspaceId, alreadyRead?.recordOf?.(agentId))

  const open = alreadyRead === undefined ? openAttachmentsFor(agentId, workspaceId) : alreadyRead.openRunsOf(agentId)
  // THE HELD CONNECTION, ASKED FIRST because it is the strongest input there is. The registry row
  // this agent record maps to is what the channel knows a connection by; a record with no registry
  // row has nothing to look up, which is a real answer and not an error.
  const registered = alreadyRead?.registeredOf === undefined ? agentForRecord(agentId) : alreadyRead.registeredOf(agentId)
  const held = registered === null ? null : whoIsConnected({ kind: 'agent', id: registered.id }, now.getTime())
  const inputs: PresenceInputReading[] = [
    held === null
      ? { input: 'listen', answer: 'nothing-recorded', at: null, says: NOBODY_LISTENING }
      : { input: 'listen', answer: 'answered', at: localStamp(new Date(held.heardFrom)), says: listening(held.ago) },
  ]

  if (open.length === 0) {
    // Both remaining inputs are about an attachment, and there is none. Neither is asked, and the
    // reading says which of the two cases that is rather than reporting an empty answer.
    for (const input of ['request', 'attachment-opened'] as const) {
      inputs.push({
        input,
        answer: 'nothing-recorded',
        at: null,
        says: 'No attachment is open.',
      })
    }
    return {
      agentId,
      workspaceId,
      presence: 'offline',
      word: PRESENCE.offline.word,
      says: PRESENCE.offline.sentence,
      from: null,
      whyNoInput: 'No attachment is open, so the word comes from the attachment roster.',
      lastArrival: null,
      quietForMinutes: null,
      openAttachments: [],
      staleAfterMinutes: STALE_AFTER_MINUTES,
      thresholdIsUnmeasured: STALE_THRESHOLD_IS_UNMEASURED,
      inputs,
    }
  }

  const request =
    alreadyRead === undefined
      ? newestRequestFor(open.map((one) => one.id))
      : newestRequestAmong(
          open.map((one) => one.id),
          alreadyRead.newestRequests,
        )
  inputs.push(
    request === null
      ? {
          input: 'request',
          answer: 'nothing-recorded',
          at: null,
          says: "No request has arrived from this agent's open attachments.",
        }
      : {
          input: 'request',
          answer: 'answered',
          at: request,
          says: `Newest request from this agent's open attachments: ${request}.`,
        },
  )

  // The newest opening among the open attachments. `openAttachmentsFor` hands them back newest
  // first, so this is the first one, and it always exists here.
  const newestOpening = open[0]?.openedAt ?? null
  inputs.push(
    newestOpening === null
      ? {
          input: 'attachment-opened',
          answer: 'nothing-recorded',
          at: null,
          says: 'An attachment is open and it does not say when it opened, which should not be possible.',
        }
      : {
          input: 'attachment-opened',
          answer: 'answered',
          at: newestOpening,
          says: `Newest open attachment opened at ${newestOpening}. The weakest input, used only when nothing has arrived since.`,
        },
  )

  const from: PresenceInput = request !== null ? 'request' : 'attachment-opened'
  const lastArrival = request ?? newestOpening
  const quiet = lastArrival === null ? null : minutesSince(lastArrival, now)
  if (quiet === null) {
    // A stamp that cannot be read is never quietly treated as "now" — that reading would make a
    // silence look like an arrival, which is the exact defect a `Z` on a stamp once caused here.
    throw new PanelError(
      `The moment presence would be read from — ${String(lastArrival)} — is not a stamp this product can read, so ` +
        'how long this agent has been quiet cannot be worked out. Nothing has been guessed at.',
      500,
    )
  }

  const quietForMinutes = quiet
  const presence: Presence = quietForMinutes >= STALE_AFTER_MINUTES ? 'stale' : 'online'
  return {
    agentId,
    workspaceId,
    presence,
    word: PRESENCE[presence].word,
    says: PRESENCE[presence].sentence,
    from,
    whyNoInput: null,
    lastArrival,
    quietForMinutes,
    openAttachments: open.map((one) => one.id),
    staleAfterMinutes: STALE_AFTER_MINUTES,
    thresholdIsUnmeasured: STALE_THRESHOLD_IS_UNMEASURED,
    inputs,
  }
}

/**
 * WHAT THIS FILE DELIBERATELY DOES NOT DO, so the next reader does not add it.
 *
 * - **It writes nothing.** Not a column, not a row, not a cache. Presence is a reading and a stored
 *   reading is a stored guess about a later moment.
 * - **It reads no work state and returns none.** The two dimensions meet on a screen, side by side,
 *   and nowhere else.
 * - **It asks the operating system nothing.** Whether a process is alive is a different question
 *   with a different reader.
 * - **It takes no presence word from a caller.** Presence is a measurement, not a claim. An agent
 *   asserting it is Online proves only that it sent a request, which is what `request` already
 *   measures.
 */

// ============================================================================ a participant's dot

/**
 * WHETHER ONE PARTICIPANT CAN BE REACHED RIGHT NOW, IN THREE COLOURS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH COLOUR MEANS
 * ---------------------------------------------------------------------------------------
 *
 * Green is online, grey is offline, red is no longer there. Criterion M4 of design/messages/ACCEPTANCE.md.
 *
 *   green   Something is serving this participant right now.
 *   grey    Nothing is, and they exist and could be woken.
 *   red     They are retired, or no registry row answers to them at all.
 *
 * ---------------------------------------------------------------------------------------
 * ONLINE IS WORKED OUT AND NEVER DECLARED, AND THE STATE BESIDE IT IS THE OPPOSITE
 * ---------------------------------------------------------------------------------------
 *
 * A state — *working*, *away* — is short text somebody writes about themselves and nothing checks
 * it. A colour is a measurement and nobody may write one. So an agent whose run has died goes grey
 * while its state still reads *working*, and the panel draws the state as stale beside the grey dot
 * rather than quietly correcting somebody else's words.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT IS GREEN EXACTLY WHEN SOMETHING IS ANSWERING AS IT, SINCE 27 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The colour is the answer `theAnsweringReading` in lib/worker.ts gives, the reading the chat's
 * "Cannot reach" notice reads (problem h1S1MLK-SQ1I). Four things make an agent green: a run
 * answering as it, a session holding its handle that was read as still there, a run of it waiting
 * for the next message, and a secretary's or a supervisor's own conversation. The reply names which
 * one, so a person reading a green dot can find out what it was read from. An open connection, a
 * live process row and a run with recent output were green inputs until then; they cannot take a
 * message by themselves (criteria M106 and M126), so they are now only said in the words beside a
 * grey dot.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT ARRIVED FROM AN ACTOR ID IS NOT AN INPUT HERE EITHER, SINCE 4 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * It was, and it was the ONLY input that ever answered: `newestArrivalFromAgent` read the newest
 * `api_calls` row whose `actor_id` equalled the agent's id or handle. `presenceOf`'s header above
 * says in capitals that `actor_id` cannot be an input, and this half of the same file was reading
 * it. Two things were wrong with it. It says a request arrived, not that anybody is there. And
 * anybody sending that actor id turns the dot green, so it is a colour a caller can write, which is
 * the one thing presence must never be.
 *
 * The two inputs criterion M4 names — a registered process that answers, and a session record with
 * recent output — read nothing at all until this date. Problems `yyyb4TyGo-6i` and `WrXtovLyiGeW`
 * have the measurements. Both were read from then on, and the arrival input is gone. Since
 * 27 September 2026 both only give the words beside a grey dot, as the section above says.
 */

/** The three colours. */
export const PRESENCE_COLOURS = ['green', 'grey', 'red'] as const

/** One of the three. */
export type PresenceColour = (typeof PRESENCE_COLOURS)[number]

/** Every word a grey participant dot can carry. A new word also needs a refusal clause in messages.ts. */
export const GREY_PRESENCE_WORDS = {
  offline: PRESENCE.offline.word,
  inactive: PRESENCE.inactive.word,
  inATerminal: IN_A_TERMINAL_WORD,
} as const

export type GreyPresenceWord = (typeof GREY_PRESENCE_WORDS)[keyof typeof GREY_PRESENCE_WORDS]

/** What each colour means, on the screen and in a sentence. */
export const COLOUR_WORDS = {
  green: { word: 'Online', sentence: 'Something is serving this participant right now.' },
  grey: { word: GREY_PRESENCE_WORDS.offline, sentence: 'Nothing is serving this participant at the moment. They are still here and can be reached again.' },
  red: { word: 'Gone', sentence: 'This participant is retired or is not in the registry at all, so nothing can reach them.' },
} as const satisfies Readonly<Record<PresenceColour, { word: string; sentence: string }>>

/**
 * THE FACTS ONE GREY DOT'S WORD IS CHOSEN FROM, and the one chooser both the dot and the reach's 409 read.
 *
 * A GREY WORD IS CHOSEN BY ONE FUNCTION AND NEVER COPIED. `participantPresence` reads the facts below and asks
 * `theGreyWordOf`; the reach reading of a send asks the same function through the narrow read of the addressee's own
 * rows (`theGreyWordOfAnUnansweredAgent`). Two choosers would let the dot and the 409's reason choose by different
 * rules, which is the drift this one chooser exists to prevent. The facts the narrow read cannot see are said at that
 * function.
 *
 * THE RUN-RECORDED FACT IS LAZY, because the dot asks `aRunOfThisAgentIsRecorded` only when nothing was seen and
 * `quietForMinutes` is null: a hold, a live process, a recent connection or a quiet run each settle the word before
 * that read. A chooser that asked it eagerly would make every grey dot read a run it never needs.
 */
export interface TheGreyWordFacts {
  /** The dot's first grey branch: a run of the agent names an office terminal, and has not ended. */
  isAtWorkInATerminal: boolean
  /** A session holds this agent's handle, and nothing shows it is answering. */
  hasAHold: boolean
  /** A live process cannot be read, so whether it is answering could not be told. */
  aProcessCannotBeRead: boolean
  /** A live process is registered for this agent and cannot take a message. */
  hasLiveProcess: boolean
  /** A page of this agent's said it was open within the connection window. */
  connectionIsRecent: boolean
  /** Minutes since any run of this agent wrote down output or used a tool, or null when none has. */
  quietForMinutes: number | null
  /** How long a run may be quiet before it stops reading as recently seen. Carried so the facts match the dot's branch. */
  withinMinutes: number
  /** Whether any run of this agent is recorded, ended or not. Asked only where `quietForMinutes` is null. */
  aRunOfThisAgentIsRecorded: () => boolean
}

/**
 * THE WORD BESIDE A GREY DOT, in the dot's own order: In a terminal, then Offline for a hold, an unreadable process, a
 * live process or a recent connection, then the quiet-run branches, with Inactive only when no run of the agent is
 * recorded and Offline otherwise. The sentences are not chosen here; `participantPresence` already has the branch that
 * saw each fact and says it.
 */
export function theGreyWordOf(facts: TheGreyWordFacts): GreyPresenceWord {
  if (facts.isAtWorkInATerminal) return GREY_PRESENCE_WORDS.inATerminal
  if (facts.hasAHold || facts.aProcessCannotBeRead || facts.hasLiveProcess || facts.connectionIsRecent) {
    return GREY_PRESENCE_WORDS.offline
  }
  if (facts.quietForMinutes === null) {
    return facts.aRunOfThisAgentIsRecorded() ? GREY_PRESENCE_WORDS.offline : GREY_PRESENCE_WORDS.inactive
  }
  // A quiet run inside the window and one past it both read Offline; the dot's own branch already chose the sentence
  // from the same two facts, and `withinMinutes` is here so the two readings rest on one set of facts.
  return GREY_PRESENCE_WORDS.offline
}

/** What a colour was read from. Null when nothing answered, which is what grey and red mean. */
export type ParticipantPresenceInput =
  | 'a session answering as it'
  // A RUN ANSWERING AS IT, since criterion M79: a run holding the handle, or a run going for it that
  // holds none (one started with tools/sandbox.mjs). It is its own word and not folded into the one
  // above, because a message reaching a terminal somebody has open and a message reaching a fresh
  // run that knows only what it was handed are different things to a reader.
  | 'a run answering as it'
  // A RUN THAT HAS ANSWERED AND WAITS FOR THE NEXT MESSAGE, criteria M22 and M89. Its process has
  // ended, and the queue gives the next message to its conversation until the wait ends.
  | 'a run waiting for the next message'
  // A SECRETARY OR A SUPERVISOR PAST ITS RUN'S WAIT. No run is going or
  // waiting, and a message to it picks up its own conversation.
  | 'its own conversation, picked up by a message'


/** The office can only produce known grey words. Page readers still preserve unfamiliar words. */
type OfficePresenceReading = Omit<ParticipantPresenceReading, 'colour' | 'word'> & (
  | { colour: 'grey'; word: GreyPresenceWord }
  | { colour: 'green'; word: string }
  | { colour: 'red'; word: string }
)

/** What presence reads as for one participant, right now, and what it was read from. */
export interface ParticipantPresenceReading {
  who: ParticipantRef
  colour: PresenceColour
  /** The word on the screen, preserved by readers even when unfamiliar. */
  word: string
  /** Why it is that colour, in one sentence a person can act on. */
  says: string
  /** Which input answered, or null when none did. */
  from: ParticipantPresenceInput | null
  /** The state this participant last wrote about itself, kept exactly. Null when nobody has said. */
  state: string | null
  /** When they wrote it. Null when there is none. */
  stateAt: string | null
  /**
   * True when the state was written by somebody nothing is serving now.
   *
   * A state is self-set, so nothing but its owner can change it, and an agent whose run died leaves
   * its last words standing. The panel draws them and says this beside them rather than hiding
   * them or correcting them.
   */
  stateMayBeStale: boolean
  /** The sentence drawn beside a stale state. Null when the state is not stale or there is none. */
  stateStaleBecause: string | null
  /** How long a durable agent may be quiet before it stops reading as online. */
  agentAliveWithinMinutes: number
  /** How long since a page said it was open before the person at it stops reading as online. */
  personAliveWithinSeconds: number
  /**
   * WHAT THIS PERSON SAID ABOUT WHETHER THEY ARE HERE, or null because they have never said, or
   * null because this is an agent and an agent has nothing to say about it.
   *
   * IT IS NOT SAID TO EVERYBODY. A reader who is not this person and is not being shown their real
   * answer gets null here, so that `invisible` cannot be read off the reply that is meant to hide
   * it. Criterion M20.
   */
  choice: PresenceChoice | null
  /** When they said it, for a reader who is allowed to know the choice. Null otherwise. */
  choiceAt: string | null
  /**
   * A PERMANENT RESIDENT'S SLEEP: since when it is asleep and until when, when its last sleep ended, and its sleep time.
   * The chat draws from it only a short word while the resident is asleep, such as "Asleep since 14:02", and nothing
   * while it is awake. Absent on every participant that is not a resident that is not retired, which draws no word, as
   * item 1 of a decision says. Read by `theSleepLineOf`, the one reader of `resident_sleeps`.
   */
  residentSleep?: TheSleepLine
}

/**
 * THE LIVE PROCESS ROWS FOR THIS AGENT, as the ledger and the operating system agree.
 *
 * THE COLUMN IS ASKED FOR THE SHAPE IT REALLY HOLDS. `registered_by` never holds a bare id: the
 * ledger writes the actor type, a colon and the actor id, and `whoRegisteredIt` in
 * `src/server/lib/resources.ts` is the one place that builds it. This reader asked for a bare id
 * until 4 September 2026 and therefore matched nothing, for every agent, always — problem
 * `yyyb4TyGo-6i`, measured against a live process the ledger held. Both spellings of the agent are
 * asked for, because a process may be registered under the agent's id or under its handle.
 *
 * IT HANDS BACK THE ROWS, NOT A yes OR no (M126b): each live row names the session it belongs to,
 * and that session's facts are what the one shared judgement reads, so a live process with no
 * transcript the office can read is not answered from the row alone.
 */
function liveProcessesFor(
  id: string,
  handle: string,
  workspaceId: string,
  machine?: () => readonly ResourceReport[],
  // ONE READING OF THE UNRELEASED PROCESS ROWS FOR EVERY AGENT, WHEN A CALLER HANDS ONE IN. Measured
  // 25 September 2026 (problem u_yThQczHiZ8): the office scene asked the two statements this used to
  // run, once for every agent in every project, and they took 7.3 of the 11 seconds left in one scene.
  // Neither names a project, so the rows are the same for every agent within one reading.
  processes?: () => UnreleasedProcessRows,
): ResourceReport[] {
  const read = processes === undefined ? theUnreleasedProcessRows() : processes()
  const mine = new Set([whoRegisteredIt({ type: 'agent', id }), whoRegisteredIt({ type: 'agent', id: handle })])
  const rows = read.rows.filter((one) => one.registeredBy !== null && mine.has(one.registeredBy)).map((one) => ({ id: one.id }))
  /**
   * AND A RUN THE MESSAGE WORKER STARTED FOR THIS AGENT COUNTS, THOUGH THE WORKER REGISTERED IT.
   *
   * The query above asks who wrote the row down. Since 4 September 2026 a run serving an agent is
   * registered by the worker rather than by the agent, so an agent answering a message right now
   * would have read as offline — the exact case criterion M4 is about. What makes such a row this
   * agent's is the session record it belongs to, which names the agent it serves.
   *
   * THE STATEMENT ONLY NARROWS, AND `theAgentARunServes` DECIDES. A run's record names its agent by
   * registry id in `servingAgentId` and by handle in `servingAgent`. A record written before
   * `servingAgentId` existed has only `servingAgent`, and a few runs wrote the id of the agent's own
   * record there. So the statement fetches every run whose record holds this agent's id, its handle
   * or one of its record ids. Each run is kept only when the one reader of a run's agent answers this
   * agent's id. That reader reads `servingAgentId` first and then ignores the handle. It reads a bare
   * `servingAgent` as the one agent bearing that string, and as nobody where two agents do. So a run
   * filed for a retired agent is never counted for a live agent that later bears the same handle.
   *
   * A RUN STORED UNDER AN ALIAS FILED FOR THIS AGENT COUNTS TOO. Its `servingAgentId` holds the old id, and the reader
   * answers the canonical id for it. The aliases are read once for the rows (`read.aliases`), and only when a row is a run.
   */
  const records = read.recordsOf.get(id)
  const canonical = read.rows.some((one) => one.run !== null) ? read.aliases.canonicalOf(id) : id
  const runs = read.rows.filter(
    (one) =>
      one.run !== null &&
      (one.run.servingAgentId === id ||
        (typeof one.run.servingAgentId === 'string' && read.aliases.canonicalOf(one.run.servingAgentId) === canonical) ||
        one.run.servingAgent === id ||
        one.run.servingAgent === handle ||
        (typeof one.run.servingAgent === 'string' && records !== undefined && records.has(one.run.servingAgent))) &&
      theAgentARunServes(JSON.parse(one.run.data) as Record<string, unknown>)?.id === canonical,
  )
  rows.push(...runs.map((one) => ({ id: one.id })))
  if (rows.length === 0) return []
  // AND THE OPERATING SYSTEM AGREES. A row nobody released is not a running process: five
  // orphaned-process incidents in this repository are exactly that state. `listResources` is the one
  // place allowed to ask the machine, so the answer comes from there.
  const held = new Set(rows.map((one) => one.id))
  // THE MACHINE IS ASKED ONCE FOR EVERYBODY WHEN A CALLER HANDS THE READING IN. Measured 11 September
  // 2026 (problem 9UeL9VeVPn33): `GET /api/presence` took 1.2 to 2.6 seconds, and the profile put
  // most of it in reading /proc — every process's links and file descriptors — once for every agent
  // in the registry, because this function asked `listResources` afresh each time. The rows it
  // reads are the same for every agent within one reading, so `everybodysPresence` hands down one
  // reading, made the first time an agent gets this far and not at all when none does (a world
  // with no process rows, which every test world is, never pays for it); a caller asking about one
  // agent still reads once here.
  return (machine === undefined ? theProcessRowsOf(workspaceId) : machine()).filter(
    (one) => held.has(one.id) && one.liveness.state === 'alive',
  )
}

/** Process rows are the only resource kind the presence readers use. */
function theProcessRowsOf(workspaceId: string): ResourceReport[] {
  return listResources({ workspaceId, type: 'process' })
}

/**
 * EVERY UNRELEASED PROCESS ROW, READ ONCE, with what `liveProcessesFor` asks of each one.
 *
 * `liveProcessesFor` asks two things of these rows for one agent: which rows the agent wrote down
 * itself (`registered_by`), and which rows belong to a run whose session record names the agent.
 * It asked both with a statement per agent until 25 September 2026. Now the rows are read here once,
 * and each agent's rows are picked out of them in memory by the same tests those statements made.
 *
 * `run` is there only for a row whose session record is a session and holds valid JSON, the three
 * conditions the per-agent statement joined and filtered on. `servingAgentId` and `servingAgent` are
 * the values `json_extract` gives, compared exactly as SQLite compared them: a string equals only the
 * same string, and a number or a missing value equals no id. `recordsOf` is every agent's own record
 * ids, which is what `IN (SELECT record_id FROM agent_records WHERE agent_id = ?)` asked.
 */
export interface UnreleasedProcessRows {
  rows: { id: string; registeredBy: string | null; run: { servingAgentId: unknown; servingAgent: unknown; data: string } | null }[]
  recordsOf: ReadonlyMap<string, ReadonlySet<string>>
  /** The filed registry aliases, read at most once for the rows, for a run stored under an agent's old id. */
  aliases: TheFiledAliases
}

/**
 * `recordsOf` IS HANDED IN by a reading of some agents only (wave 13y round 51): their own record ids
 * (`theRecordsOfTheseAgents`), which is all `liveProcessesFor` asks of it for them. The rows are still every row.
 */
export function theUnreleasedProcessRows(
  recordsOf?: ReadonlyMap<string, ReadonlySet<string>>,
  aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite),
): UnreleasedProcessRows {
  const statements = theProcessRowStatements()
  const rows = (statements.rows.all() as { id: string; registeredBy: string | null; isRun: number; servingAgentId: unknown; servingAgent: unknown; data: string }[]).map((one) => ({
    id: one.id,
    registeredBy: one.registeredBy,
    run: one.isRun === 1 ? { servingAgentId: one.servingAgentId, servingAgent: one.servingAgent, data: one.data } : null,
  }))
  if (recordsOf !== undefined) return { rows, recordsOf, aliases }
  // Only needed when some row is a run, and a world with no process rows never reads it.
  return { rows, recordsOf: rows.some((one) => one.run !== null) ? theRecordsByAgent(statements.agentRecords.all()) : new Map(), aliases }
}

export { theRecordsByAgent } from '../db/these-agents-only.ts'

export { theRecordsOfTheseAgents } from '../db/these-agents-only.ts'

export { PROCESS_ROWS } from '../db/these-agents-only.ts'

export { theProcessRowStatements } from '../db/these-agents-only.ts'

/**
 * Every session record in one project, read once and shared by every agent that needs it. `couldBeTheirs` keeps only the
 * rows it finds, in the same order: `aSessionThatCouldBeOneOf`, for a reading of some agents only (wave 13y round 51).
 */
export function sessionRecordsIn(workspaceId: string, couldBeTheirs?: SQL): PanelRecord[] {
  return theSessionRowsIn(workspaceId, undefined, couldBeTheirs) as PanelRecord[]
}

/**
 * The one SQL read behind the presence rows and the office's normalised, differently ordered rows. The full and
 * projected readings use this one selection and order.
 */
function theSessionRowsIn(workspaceId: string, alsoWhere?: SQL, candidates?: SQL, data: typeof records.data | SQL<Record<string, unknown>> = records.data) {
  return theSessionRowsRead(workspaceId, alsoWhere, candidates, data).all()
}

/** That read, before it runs, so a caller can prepare it once and keep it. */
function theSessionRowsRead(workspaceId: string, alsoWhere?: SQL, candidates?: SQL, data: typeof records.data | SQL<Record<string, unknown>> = records.data) {
  return theSessionRowsInAnyOrder(workspaceId, alsoWhere, candidates, data)
    // IN THE ORDER THE WAITING RUNS ARE READ IN, so the roster reads those from these same rows.
    .orderBy(...NEWEST_SESSION_FIRST)
}

/** The same rows in no order, for a caller that stops at the first row: with an order, SQLite reads every row first. */
function theSessionRowsInAnyOrder(workspaceId: string, alsoWhere?: SQL, candidates?: SQL, data: typeof records.data | SQL<Record<string, unknown>> = records.data) {
  return db
    .select({ ...getTableColumns(records), data })
    .from(records)
    .where(and(
      candidates === undefined ? eq(records.kind, 'session') : theKindOfARowFoundById('session'),
      candidates === undefined ? eq(records.workspaceId, workspaceId) : theProjectOfARowFoundById(workspaceId),
      candidates === undefined ? isNull(records.deletedAt) : sql`+${records.deletedAt} IS NULL`,
      candidates, alsoWhere,
    ))
}

/**
 * One read for a listed office view, in presence's creation and rowid order. Both readers keep live sessions of the
 * project under the same condition. The scene additionally normalises record content and origin, and orders by the
 * newest change and ascending id. Keep those differences without a second SQL read (round 63 of wave 13y). The rows
 * are the session records that could be a run of one of the agents `needles` names (`aSessionThatCouldBeOneOf`).
 */
export function sessionRecordsForTheOfficeIn(workspaceId: string, needles: readonly string[]): { presence: PanelRecord[]; listed: PanelRecord[] } {
  const rows = THE_SESSIONS_THAT_COULD_BE_THEIRS().all({ project: workspaceId, needles: JSON.stringify(needles) })
  return { presence: rows as PanelRecord[], listed: inTheListedOrder(rows.map(toRecord)) }
}

/**
 * THAT READ, PREPARED ONCE AND KEPT (wave 13y round 67), with the project and the needles as its two values. Built again
 * for every list, it was built and prepared again on every call of the people and work views.
 *
 * THE CHECK OF WHETHER A ROW COULD BE ONE OF THE AGENTS' RUNS RUNS ONLY ON THE FALLBACK BUCKET'S ROWS, and keeps the same
 * rows as when it ran on every candidate. A row found through the `servingAgentId` or the `servingAgent` bucket has valid
 * JSON and that field among the needles, and a row found through the first-binding bucket has its first `ranAs` agent
 * among them as text, so the check holds for each. A row whose data is not valid JSON is found only through the fallback
 * bucket, where the check keeps it. Run on every candidate, the check walked the `ranAs` of each, and an agent's
 * candidates are often thousands of runs. MEASURED, round 67's report gives the measures before and after.
 */
const THE_SESSIONS_THAT_COULD_BE_THEIRS = keptStatement(() => {
  // THE TWO VALUES, bound when it runs. The project's placeholder is typed as a string because the read's helpers take one.
  const project = sql.placeholder('project') as unknown as string
  const among = sql`(select value from json_each(${sql.placeholder('needles')}))`
  // Neither listed view reads a run's notes. Keep every other field, including absent versus explicit null serving
  // references, so the ordinary ownership and standing readers still make their decisions from the stored values.
  const data = sql<Record<string, unknown>>`case when json_valid(${records.data}) then case when json_type(${records.data}) = 'object' then json_remove(${records.data}, '$.notes') else ${records.data} end else ${records.data} end`.mapWith(records.data)
  return theSessionRowsRead(project, undefined, theSessionCandidates(project, among, theRowCouldBeOneOf(among, sql.raw('candidate.data'))), data).prepare()
})

/** How many of an unheld addressee's newest runs the 409's word reads. */
export const THE_LAST_RUNS_READ = 50

/**
 * THE ADDRESSEE'S OWN LATEST SESSION ROWS, AT MOST `limit` OF THEM, for the word the 409's reason names. It is the
 * read behind `theGreyWordOfAnUnansweredAgent`, and it is kept prepared because a send may build one reason per unheld
 * addressee.
 *
 * NARROW, BY THE SAME FOUR INDEXES AS EVERY OWNERSHIP READ (`theSessionCandidates`), and ONLY THE ADDRESSEE'S OWN ROWS:
 * the needles are the agent's registry id, its handle, its agent record and every alias filed for it. The fallback
 * bucket is narrowed by `theRowCouldBeOneOf`, as `THE_SESSIONS_THAT_COULD_BE_THEIRS` narrows its own. `limit` is
 * `THE_LAST_RUNS_READ`, the ceiling that keeps this from reading every run of an agent that has thousands. The word
 * needs the newest run that names a terminal and has not ended. When that run is older than the ceiling, the word
 * differs from the dot's; `theGreyWordOfAnUnansweredAgent` says how.
 *
 * ONLY THE FIELDS THE WORD READS ARE PROJECTED (`thePresenceSessionData`): servingAgentId, extra, state,
 * workingDirectory and startedAt. The run-recorded fact is asked of `aRunRanAsOneOf` for this agent alone, not from
 * these rows.
 */
const THE_LAST_RUNS_OF_ONE_AGENT = keptStatement(() => {
  const project = sql.placeholder('project') as unknown as string
  const among = sql`(select value from json_each(${sql.placeholder('needles')}))`
  const data = thePresenceSessionData(['servingAgentId', 'extra', 'state', 'workingDirectory', 'startedAt'])
  return theSessionRowsRead(project, undefined, theSessionCandidates(project, among, theRowCouldBeOneOf(among, sql.raw('candidate.data'))), data)
    .limit(sql.placeholder('limit'))
    .prepare()
})

export { theSessionCandidates } from '../db/these-agents-only.ts'

export { theCandidateBuckets } from '../db/these-agents-only.ts'

/**
 * ONLY THE DATA THE PRESENCE AND ANSWERING READERS INSPECT. The output and recorded-run signs use ranAs, the field
 * the open rule in attachments.ts reads, state, lastOutputAt and the instant beside it in lastOutputTime. The terminal
 * sign uses servingAgentId, extra, workingDirectory and startedAt. The answering readers use the two serving references,
 * state, deliveringMessage, providerSession, runtime, waitsUntil, startedByMoleOffice and sandbox. The hold and process
 * readers fetch their own session facts separately.
 *
 * The JSON arrow preserves each value's JSON type, including true, arrays and objects. A missing field becomes null;
 * these readers test types or use nullish defaults, so both mean the same absence. Non-objects and malformed JSON are
 * passed through to the ordinary decoder and readers, preserving their failures. No row or reading is kept here.
 */
export const PRESENCE_SESSION_FIELDS = [
  'ranAs', theFieldTheOpenRuleReads(), 'state', 'lastOutputAt', 'lastOutputTime', 'servingAgentId', 'servingAgent', 'extra',
  'workingDirectory', 'startedAt', 'deliveringMessage', 'providerSession', 'runtime', 'waitsUntil',
  'startedByMoleOffice', 'sandbox',
] as const

function thePresenceSessionData(only: readonly string[] = PRESENCE_SESSION_FIELDS): SQL<Record<string, unknown>> {
  const fields = sql.join(only.flatMap((field) => [sql`${field}`, sql`${records.data} -> ${`$.${field}`}`]), sql`, `)
  return sql`case when json_valid(${records.data}) then case when json_type(${records.data}) = 'object' then json_object(${fields}) else ${records.data} end else ${records.data} end`.mapWith(records.data)
}

/**
 * One clock callback's projected session rows, by project: the runs the dots read (`theRunsTheDotsReadForPresence`).
 * Other inputs are still read by each look.
 */
export type PresenceSessionRows = (workspaceId: string) => readonly PanelRecord[]

export function presenceSessionRowsForOneClock(): PresenceSessionRows {
  const changedHere = sqlite.prepare('SELECT total_changes() AS changes')
  const changedElsewhere = sqlite.prepare('PRAGMA data_version')
  // WHY THIS MISSES NO WRITE. total_changes counts every write through this connection, including raw SQL and
  // triggers. data_version changes when another connection commits. Both are checked before each reuse, so either
  // kind of write discards the old rows. A rollback may discard rows needlessly, but cannot hide a write. This map
  // belongs to one look of the clock, which gives the thread back between its parts, so a write between two parts
  // discards the rows as any other write does. It is never kept for the next look. Only session rows are shared:
  // the machine, holds and waiting deadlines can change without a write and are read separately by each look.
  const byProject = new Map<string, { changes: number; version: number; rows: readonly PanelRecord[] }>()
  return (workspaceId) => {
    const { changes } = changedHere.get() as { changes: number }
    const { data_version: version } = changedElsewhere.get() as { data_version: number }
    const before = byProject.get(workspaceId)
    if (before !== undefined && before.changes === changes && before.version === version) return before.rows
    const rows = theRunsTheDotsReadForPresence(workspaceId)
    byProject.set(workspaceId, { changes, version, rows })
    return rows
  }
}

/**
 * THE RUNS THE DOTS READ, WITH ONLY THE FIELDS PRESENCE READS (wave 13y round 143, item 82): the rows of
 * `sessionRecordsTheDotsReadIn`, which says why they give the same dots and the same answering readings as every run,
 * projected as `thePresenceSessionData` projects them. They are not every run, so they cannot say which agents a run
 * ran as, and the word Inactive is asked agent by agent (`aRunRanAsOneOf`). MEASURED on the made-up office with one
 * project of 17,562 runs, 695 of them carrying a message to hand over: a page opening read every run of the project
 * twice, for everybody's presence and for the answering look. Round 143's report gives the measures before and after.
 */
function theRunsTheDotsReadForPresence(workspaceId: string): PanelRecord[] {
  const rows = theSessionRowsIn(workspaceId, undefined, theRunsTheDotsRead(workspaceId), thePresenceSessionData()) as PanelRecord[]
  NOT_EVERY_RUN.add(rows)
  return rows
}

/**
 * THE SESSION ROWS ONE PROJECT'S DOTS READ, for the office scene's reading of every agent (wave 13y round 66), in the order
 * `sessionRecordsIn` reads them: every run that has not ended, and every run the message worker filed, ended or not.
 *
 * WHY THESE ROWS GIVE THE SAME DOTS AS EVERY ROW. The green step keeps a running row of the agent, and a running run has
 * not ended. The waiting runs and the conversation a message picks up are read from the message worker's runs
 * (`theAnsweringReading` in lib/worker.ts), and every one of those is here. The terminal and the output beside a grey dot
 * keep only runs that have not ended (`theTerminalThisAgentWorksIn`, `minutesSinceARunOfThisAgentSpoke`). The order is the
 * same, so each reader takes the same first row. What these rows do not hold is the agent each other ended run ran as, and
 * the word Inactive rests on that (`aRunOfThisAgentIsRecorded`). So the caller hands in those agents from every run of the
 * project, and these rows refuse to be asked for them (`NOT_EVERY_RUN`).
 *
 * WHY IT EXISTS. The people view and the online view read every session record of each project whole, and the people
 * view read them twice. Most of those runs have ended. Round 66's report gives the measures before and after.
 */
export function sessionRecordsTheDotsReadIn(workspaceId: string): PanelRecord[] {
  const rows = theSessionRowsIn(workspaceId, undefined, theRunsTheDotsRead(workspaceId)) as PanelRecord[]
  NOT_EVERY_RUN.add(rows)
  return rows
}

/**
 * The ids of those rows, each half through its own partial index, and the rows then read once by their ids, as
 * `theRunRowsOfOneReach` in lib/worker.ts reads its two halves. The first half is asked in the words of migration 0294's
 * index (`STORED_FIELDS.sessionHasNotEnded`). The second keeps every run whose `deliveringMessage` is a non-empty string,
 * which is every run the worker's `runRows` keeps, and a few it drops; `HOLDS_A_MESSAGE_TO_HAND_OVER` there says why a
 * range is asked. `INDEXED BY` makes a read SQLite cannot answer from its index an error rather than a walk of every run.
 * The rows of every project are read by `theDotRowsOfEveryProjectThatCouldBeOneOf`.
 */
function theRunsTheDotsRead(workspaceId: string): SQL {
  const reads = theDotRowHalves().map(([condition, index]) => sql`SELECT candidate.id FROM records AS candidate INDEXED BY ${sql.raw(index)}
    WHERE candidate.kind = 'session' AND ${condition} AND candidate.workspace_id = ${workspaceId} AND candidate.deleted_at IS NULL`)
  return sql`${records.id} IN (${sql.join(reads, sql` UNION ALL `)})`
}

/** The two halves of the dot rows: each condition, on the row `candidate`, and the partial index that answers it. */
function theDotRowHalves(): readonly (readonly [SQL, string])[] {
  const data = sql.raw('candidate.data')
  return [
    [STORED_FIELDS.sessionHasNotEnded(data), 'records_session_not_ended_idx'],
    [sql`${STORED_FIELDS.sessionDeliveringMessage(data)} > ''`, 'records_session_delivering_message_idx'],
  ]
}

/**
 * THE DOT ROWS OF EVERY PROJECT THAT COULD BE A RUN OF ONE OF THE AGENTS `among` SELECTS (wave 13y round 111): the dot
 * rows of every project, by their rowids from their two indexes (`theDotRowHalves`), that one of the four candidate
 * buckets would find (`theCandidateBuckets`), each tested by its own data. These are the dot rows among a project's
 * candidates, of every project at once (`THE_SESSIONS_THAT_COULD_BE_THEIRS` says why only the fallback bucket is narrowed
 * by `theRowCouldBeOneOf`). MEASURED on the made-up office shaped like the live one, 30 October 2026, with its 832 dot
 * rows: 3.4 to 3.8 ms read alone, for one agent to fifty. Reading the agents' candidates in every project and keeping
 * those that are dot rows was 0.06 to 33 ms there, and testing every dot row by `theRowCouldBeOneOf` 4.7 to 5.1 ms. On the
 * even made-up office this read is 35 to 47 ms, because its builder makes 7,227 dot rows: 2,321 runs that never end and
 * 4,906 ended runs carrying a message with no wait. The halves ask nothing of `deleted_at`, which the second half's index
 * does not hold, and so the caller asks it of the rows.
 */
function theDotRowsOfEveryProjectThatCouldBeOneOf(among: SQL): SQL {
  const dots = theDotRowHalves().map(([condition, index]) => sql`SELECT candidate.rowid FROM records AS candidate INDEXED BY ${sql.raw(index)}
    WHERE candidate.kind = 'session' AND ${condition}`)
  const theirs = theCandidateBuckets(records.data, among, theRowCouldBeOneOf(among, records.data)).map(([test]) => sql`(${test})`)
  return sql`${records}.rowid IN (${sql.join(dots, sql` UNION ALL `)}) AND (${sql.join(theirs, sql` OR `)})`
}

/**
 * THE RUNS OF EVERY PROJECT WHERE ONE OF THESE AGENTS CAN BE REACHED, newest first, for `theHomesOf` in
 * lib/messages/status.ts (wave 13y round 111): a run that has not ended, and a run that carries a message to hand over
 * and is still inside its wait (`runsStillInsideTheirWaitAmong`, the test the dots use since wave 13y round 110, item 43,
 * asked of each project's rows apart as the dots ask it). A run whose message was handed over and whose wait is over is
 * not here. They are found among the rows the dots read in each project, read for every project at once
 * (`theDotRowsOfEveryProjectThatCouldBeOneOf`). THIS NARROWS AND DOES NOT DECIDE: the caller asks whose run each is.
 * Only the fields those two reads use are read of each. A row whose data is not valid JSON is left out, because nobody
 * can say whose run it is.
 */
export function theRunsWhereOneOfTheseCanBeReached(needles: readonly string[], identityOf: TheIdentityOf): Pick<PanelRecord, 'id' | 'workspaceId' | 'data'>[] {
  const among = sql`(select value from json_each(${JSON.stringify(needles)}))`
  const rows = db
    .select({
      id: records.id, workspaceId: records.workspaceId, kind: records.kind, title: records.title, createdAt: records.createdAt,
      data: thePresenceSessionData(['servingAgentId', 'servingAgent', 'ranAs', 'deliveringMessage', 'providerSession', 'waitsUntil', 'runtime']),
      notEnded: sql<number>`${STORED_FIELDS.sessionHasNotEnded(records.data)}`,
    })
    .from(records)
    .where(and(theKindOfARowFoundById('session'), sql`+${records.deletedAt} IS NULL`, sql`json_valid(${records.data})`, theDotRowsOfEveryProjectThatCouldBeOneOf(among)))
    .orderBy(...NEWEST_SESSION_FIRST)
    .all()
  const eachProjects = new Map<string, typeof rows>()
  for (const row of rows) eachProjects.set(row.workspaceId, [...eachProjects.get(row.workspaceId) ?? [], row])
  const waiting = new Set([...eachProjects].flatMap(([project, theirs]) => runsStillInsideTheirWaitAmong(project, theirs, identityOf).map(run => run.session)))
  return rows.filter(row => row.notEnded === 1 || waiting.has(row.id))
}

export { aSessionThatCouldBeOneOf } from '../db/these-agents-only.ts'

export { theRowCouldBeOneOf } from '../db/these-agents-only.ts'

/**
 * THE SESSION RECORDS OF ONE PROJECT THAT COULD BE ONE AGENT'S RUNS, in the order `sessionRecordsIn` reads them, for a
 * caller asking about that agent alone. MEASURED, 18 October 2026 (problem xiv1cwqWTmhb): on an office of the live
 * shape, reading every session of the project for one agent's grey dot was 172 to 183 ms of one profile, and most
 * sessions are other agents' runs. The test in tests/one-agents-presence-reads-the-sessions-that-could-be-its.test.ts
 * holds it. The roster still reads every session once for everybody, through `sessionRecordsIn`.
 *
 * THIS NARROWS AND DOES NOT DECIDE. The three readers of these rows still decide which are this agent's, as they did
 * over every row: `minutesSinceARunOfThisAgentSpoke` and `aRunOfThisAgentIsRecorded` by `ranAsIn` naming the registry
 * id, the handle or the agent's own record, and `theTerminalThisAgentWorksIn` by `servingAgentId` being the registry
 * id. Every row they keep is here: a run bound to one of those ids has the id in its `ranAs` text, and `json_extract`
 * reads `servingAgentId` as the string that is stored. The order is the same, so the terminal reader's first row is the
 * same row. A row whose data is not valid JSON is kept, so the read fails on it as it did. The needles are the ids as
 * JSON writes them inside a string, and they are the ids themselves because no id or handle holds a character JSON
 * escapes (tests/an-agents-id-is-written-into-json-as-itself.test.ts).
 *
 * `servingAgentId` is also asked for every alias filed for the agent, because a run stored before the alias was filed
 * holds the old id, and the terminal reader keeps it (`theTerminalsTheseRunsAreIn`). With no alias filed, the statement
 * is the one it was.
 */
function sessionRecordsThatCouldBeOf(
  agentId: string,
  handle: string,
  itsRecord: string | null,
  workspaceId: string,
  aliases: TheFiledAliases,
): PanelRecord[] {
  const inRanAs = [agentId, handle, ...(itsRecord === null ? [] : [itsRecord])].map(
    (id) => sql`instr(json_extract(${records.data}, '$.ranAs'), ${JSON.stringify(id).slice(1, -1)}) > 0`,
  )
  const servingAgentId = isOneOfTheIds(sql`json_extract(${records.data}, '$.servingAgentId')`, aliases.everyIdOf(agentId))
  const couldBeIts = sql.join([...inRanAs, servingAgentId], sql` or `)
  return db
    .select()
    .from(records)
    .where(
      and(
        eq(records.kind, 'session'),
        eq(records.workspaceId, workspaceId),
        isNull(records.deletedAt),
        sql`(case when json_valid(${records.data}) then (${couldBeIts}) else 1 end)`,
      ),
    )
    .orderBy(...NEWEST_SESSION_FIRST)
    .all() as PanelRecord[]
}

/**
 * THE OFFICE TERMINAL THIS AGENT WORKS IN, from its run's session record in this project, or null because no run of it
 * is in one. The record is the one `openTheAgentInATerminal` in lib/terminal-agents.ts files and keeps in step with the
 * terminal: `data.extra.inATerminal` names the terminal, and the record ends when the terminal does. The session rows
 * are the ones the caller already read for the whole roster, when it hands them in. A run stored under an alias filed
 * for the agent is its run too, so the runs are looked up by canonical id.
 */
function theTerminalThisAgentWorksIn(
  agentId: string,
  workspaceId: string,
  aliases: TheFiledAliases,
  sessions?: () => readonly PanelRecord[],
): TheTerminalOfARun | null {
  const rows = sessions === undefined ? sessionRecordsIn(workspaceId) : sessions()
  const byAgent = theTerminalsTheseRunsAreIn(rows, aliases)
  return byAgent.size === 0 ? null : (byAgent.get(aliases.canonicalOf(agentId)) ?? null)
}

/** The terminal a run works in, and where and since when, as `theTerminalThisAgentWorksIn` answers it. */
interface TheTerminalOfARun {
  session: string
  terminal: string
  folder: string | null
  since: string | null
}

/**
 * THE TERMINAL EACH AGENT WORKS IN, AMONG ONE READING OF SESSION ROWS, worked out once for that reading and not once for
 * each agent (wave 13y round 66). For each registry id a run's `servingAgentId` holds, it is the first run in the rows'
 * order that has not ended and names a terminal. Looking through every row for each agent was a walk of the rows for
 * every agent in every project of the office scene. The id is the canonical one: a run stored under an alias filed for
 * its agent is that agent's run. The aliases are asked only about a run that names a terminal.
 */
const TERMINALS = new WeakMap<readonly PanelRecord[], { aliases: TheFiledAliases; byAgent: ReadonlyMap<string, TheTerminalOfARun> }>()

function theTerminalsTheseRunsAreIn(rows: readonly PanelRecord[], aliases: TheFiledAliases): ReadonlyMap<string, TheTerminalOfARun> {
  const known = TERMINALS.get(rows)
  if (known !== undefined && known.aliases === aliases) return known.byAgent
  const byAgent = new Map<string, TheTerminalOfARun>()
  for (const row of rows) {
    const data = row.data
    const stored = data['servingAgentId']
    if (typeof stored !== 'string' || theRunHasEnded(data['state'])) continue
    const extra = data['extra']
    const held = typeof extra === 'object' && extra !== null ? (extra as { inATerminal?: { terminal?: unknown } }).inATerminal : undefined
    if (typeof held?.terminal !== 'string') continue
    const agentId = aliases.canonicalOf(stored)
    if (byAgent.has(agentId)) continue
    byAgent.set(agentId, {
      session: row.id,
      terminal: held.terminal,
      folder: typeof data['workingDirectory'] === 'string' ? data['workingDirectory'] : null,
      since: typeof data['startedAt'] === 'string' ? data['startedAt'] : null,
    })
  }
  TERMINALS.set(rows, { aliases, byAgent })
  return byAgent
}

/**
 * HOW LONG AGO A RUN SERVING THIS AGENT LAST WROTE DOWN OUTPUT, in minutes, or null when none has.
 *
 * Criterion M4's second input: *a session record with recent output*. Since 27 September 2026 it no
 * longer makes the dot green; it chooses the words beside a grey dot, and whether that grey reads
 * Inactive or Offline. Three things have to be true of the record, and each one is here because
 * leaving it out would make those words lie.
 *
 * 1. **It says it ran as this agent, in this project.** `data.ranAs` is that fact and `ranAsIn` is
 *    the one function that reads it. The run's own actor id is not asked for: an actor id is a free
 *    string and names no durable agent, which is what the header at the top of this file says.
 * 2. **It has not ended.** A run that finished thirty seconds ago has recent output and is serving
 *    nobody. So a closed attachment and the three words that say a run is over are all excluded.
 * 3. **Somebody wrote down when it last produced output, or it used a tool.** `data.lastOutputAt` is
 *    the first clock, and the run's newest use of a tool is the second (lib/newest-use.ts; wave 13s
 *    round 34). A use is one row of `tool_uses` and moves nothing on the record, so without the second
 *    clock a run that only used tools read as quiet here. The newer of the two wins, and the answer says
 *    which it was, so the words beside the dot name the sign that was seen. The record's own
 *    `updatedAt` is NOT used, deliberately: editing a session record's title would then change what the
 *    dot says, and words a person can change by editing a record are not a measurement. A run with
 *    neither clock reads as nobody having said, which is the honest answer and not a green dot.
 *
 * EACH CLOCK'S STAMP IS READ WITH THE INSTANT KEPT BESIDE IT, by the rule of `momentOfAStampAndItsInstant`:
 * `data.lastOutputTime` beside the output, and the use's `at_instant` (migration 0358). On the night the clocks go back a
 * stamp alone reads the second pass of the hour from 01:00 as the first, so output two minutes old read as 62. An
 * instant that names the stamp gives that second in its offset, and one that names it and cannot be read is passed
 * over, as a stamp that cannot be read is. A clock with no instant, or whose stamp was changed without it, is read from
 * its stamp, as before.
 */
function minutesSinceARunOfThisAgentSpoke(
  agentId: string,
  handle: string,
  workspaceId: string,
  now: Date,
  // ONE READING OF EVERY SESSION RECORD FOR THE WHOLE ROSTER, WHEN A CALLER HANDS ONE IN. Measured
  // 11 September 2026 (problem 9UeL9VeVPn33): this queried every session record in the project —
  // about 1,791 rows, JSON-parsed by drizzle with no projection — once for EACH agent this far down
  // the presence ladder, not once for the request. The rows are the same for every agent within one
  // reading, so `everybodysPresence` hands down one reading, made the first time an agent needs it
  // and never at all when none does; a caller asking about one agent still reads here. Same shape as
  // `machine` on `liveProcessesFor`, just above.
  sessions?: () => readonly PanelRecord[],
): { minutes: number; from: 'output' | 'tool-use' } | null {
  const rows = sessions === undefined ? sessionRecordsIn(workspaceId) : sessions()
  let newest: { ms: number; from: 'output' | 'tool-use' } | null = null
  // `instant` is the instant kept beside the stamp, null or undefined when none is kept.
  const keep = (stamp: unknown, instant: unknown, from: 'output' | 'tool-use'): void => {
    const ms = momentOfAStampAndItsInstant(stamp, instant, (alone) => (typeof alone === 'string' && alone !== '' ? (parseAnyStamp(alone)?.getTime() ?? null) : null))
    if (ms === null) return
    if (newest === null || ms > newest.ms) newest = { ms, from }
  }
  const live: string[] = []
  for (const row of rows) {
    const record = row as PanelRecord
    const ranAs = ranAsIn(record, workspaceId)
    if (ranAs !== agentId && ranAs !== handle) continue
    const data = record.data
    if (!theAttachmentIsOpen(data)) continue
    const state = data['state']
    if (theRunHasEnded(state)) continue
    live.push(record.id)
    keep(data['lastOutputAt'], (data['lastOutputTime'] as { instant?: unknown } | null | undefined)?.instant, 'output')
  }
  // ONLY THE RUNS THAT HAVE NOT ENDED ARE ASKED, one indexed lookup each, and an agent with none asks nothing.
  if (live.length > 0) {
    for (const use of theNewestUsesWithTheirMomentsOf(live).values()) keep(use.at, use.atInstant, 'tool-use')
  }
  const found = newest as { ms: number; from: 'output' | 'tool-use' } | null
  if (found === null) return null
  return { minutes: Math.floor((now.getTime() - found.ms) / 60_000), from: found.from }
}

/**
 * WHETHER ANY RUN OF THIS AGENT IS RECORDED IN THIS PROJECT, ended or not, spoken or not.
 *
 * This is the fact the word Inactive rests on: an agent
 * that is registered and has no run recorded is inactive. Until wave 13k round 39 the word rested on
 * `minutesSinceARunOfThisAgentSpoke` being null, and that measures something else: it skips a run that has
 * ended and a run that never said when it spoke. So an agent whose two runs had finished read "Inactive",
 * "Registered, and no run recorded" and 尚未运行 on its profile, beside the list of its two runs.
 *
 * A RUN IS FOUND THE WAY THE PROFILE'S LIST OF RUNS FINDS IT: `ranAsIn` naming the agent's own record
 * (`theAgentsRuns` in lib/agent-runs.ts), which is the id `ranAs` holds. The registry id and the handle are
 * asked as well, because `minutesSinceARunOfThisAgentSpoke` asks them and a run bound by either is a run.
 */
function aRunOfThisAgentIsRecorded(
  agentId: string,
  handle: string,
  workspaceId: string,
  sessions: () => readonly PanelRecord[],
  // EVERY AGENT'S OWN RECORD, READ ONCE FOR THE WHOLE ROSTER when a caller hands it in
  // (tests/the-embassy-reads-once-per-request.test.ts); a caller asking about one agent looks its record up here.
  agentRecords?: () => ReadonlyMap<string, string>,
  // EVERY AGENT A RUN OF THIS PROJECT RAN AS, from every run, when `sessions` are not every run (`PresenceReadOnce`).
  ranAs?: () => ReadonlySet<string | null>,
  // OR, IN ITS PLACE, WHETHER ONE RUN RAN AS ONE OF THESE REFERENCES, asked of this agent alone (`aRunRanAsOneOf`).
  ranAsOneOf?: (references: readonly string[]) => boolean,
): boolean {
  if (ranAsOneOf !== undefined) {
    const itsRecord = theRecordOfThisAgent(agentId, workspaceId, agentRecords)
    return ranAsOneOf([agentId, handle, ...(itsRecord === null ? [] : [itsRecord])])
  }
  const bound = ranAs === undefined ? theAgentsTheseRunsRanAs(sessions(), workspaceId) : ranAs()
  if (bound.has(agentId) || bound.has(handle)) return true
  const itsRecord = theRecordOfThisAgent(agentId, workspaceId, agentRecords)
  return itsRecord !== null && bound.has(itsRecord)
}

/**
 * OF THE RUNS THE DOTS READ (`sessionRecordsTheDotsReadIn` says why they give the same dots as every run), THOSE THAT
 * COULD BE A RUN OF ONE OF THESE AGENTS, with only the fields presence reads (wave 13y round 111). `needles` are those
 * `theseAgentsOnly` names. Each row is tested by its own data (`theRowCouldBeOneOf`), which keeps every row
 * `aSessionThatCouldBeOneOf` keeps, and the readers still decide which rows are whose. Measured on the made-up office
 * shaped like the live one, 30 October 2026: asking those through the four indexes listed every run of fifty contact
 * rows' agents, 9,859 ids and 15 ms, for none; reading every run the dots read was 751 rows and about 560 lookups of
 * other agents.
 */
function theirRunsTheDotsRead(workspaceId: string, needles: readonly string[]): PanelRecord[] {
  const among = sql`(select value from json_each(${JSON.stringify(needles)}))`
  const rows = theSessionRowsIn(workspaceId, theRowCouldBeOneOf(among, records.data), theRunsTheDotsRead(workspaceId), thePresenceSessionData()) as PanelRecord[]
  NOT_EVERY_RUN.add(rows)
  return rows
}

/**
 * WHETHER ONE RUN OF THIS PROJECT RAN AS ONE OF THESE REFERENCES, read from the runs whose bindings could name them
 * (`theSessionCandidates` with the bindings alone), one before the rest, in no order (wave 13y round 111). `ranAsIn`
 * decides, as it does over every run in `theAgentsTheseRunsRanAs`, and every run it would find is among those rows. Only
 * `ranAs` is read of each. Measured on the made-up office shaped like the live one, 30 October 2026: reading every run of
 * fifty contact rows' agents for this was 9,859 rows and 58 ms of one reading of their dots.
 */
export function aRunRanAsOneOf(workspaceId: string, references: readonly string[]): boolean {
  const theirs = (limit: number) => ONE_PROJECTS_RUNS_BOUND_TO_ONE_OF().all({ project: workspaceId, needles: JSON.stringify(references), limit }) as PanelRecord[]
  const oneRanAsThem = (rows: readonly PanelRecord[]) => rows.some((row) => {
    const ranAs = ranAsIn(row, workspaceId)
    return ranAs !== null && references.includes(ranAs)
  })
  const first = theirs(1)
  return oneRanAsThem(first) || (first.length === 1 && oneRanAsThem(theirs(-1)))
}

/**
 * THE SAME QUESTION FOR A READING OF EVERY AGENT, asked of `aRunRanAsOneOf` only where the project's bindings cannot
 * answer it. The first ask reads the bindings, and every later ask of the reading uses them, as it uses the reading's
 * session rows. They are the distinct first bindings of the project's runs, each with one run bound first to it, and
 * `ranAsIn` of each run in the fallback bucket. Every run `aRunRanAsOneOf` reads is in one of those two buckets.
 *   - References that meet a fallback run's `ranAsIn` have a run recorded.
 *   - References that meet a first binding whose run `ranAsIn` names have one, since that run is among those it reads.
 *   - References that meet no first binding and no fallback run's `ranAsIn` have none, since it reads no run for them.
 * Only the rest are asked one agent at a time.
 *
 * MEASURED on the made-up office reshaped to the live counts, with the person's pages on three projects: one look of the
 * presence clock asked `aRunRanAsOneOf` 5,426 times, 309 ms of it. Of the 2,493 agents, 1,767 meet a first binding in
 * the largest project and none in the other two, and no run is in the fallback bucket.
 */
function aRunRanAsOneOfForEveryAgent(workspaceId: string): (references: readonly string[]) => boolean {
  let bound: { first: ReadonlySet<unknown>; named: ReadonlySet<string | null> } | null = null
  return (references) => {
    if (bound === null) {
      const first = ONE_RUN_BOUND_FIRST_TO_EACH_BINDING().all({ project: workspaceId }) as { agentId: unknown; ranAs: string | null }[]
      const named = first.filter((one) => one.ranAs !== null && ranAsIn({ data: { ranAs: JSON.parse(one.ranAs) } }, workspaceId) === one.agentId)
      const fallback = ONE_PROJECTS_FALLBACK_RUNS().all({ project: workspaceId }) as PanelRecord[]
      bound = { first: new Set(first.map((one) => one.agentId)), named: new Set([...named.map((one) => one.agentId as string), ...fallback.map((row) => ranAsIn(row, workspaceId))]) }
    }
    const { first, named } = bound
    if (references.some((one) => named.has(one))) return true
    return references.some((one) => first.has(one)) && aRunRanAsOneOf(workspaceId, references)
  }
}

/**
 * EVERY FIRST BINDING OF ONE PROJECT'S RUNS, once each, read from their index (`records_session_first_binding_agent_idx`),
 * with the `ranAs` of one run bound first to it whose first binding is in the project, or null when no run is. A value
 * is as SQLite reads it, which is what the first-binding bucket compares with an agent's references.
 */
const ONE_RUN_BOUND_FIRST_TO_EACH_BINDING = keptStatement(() => {
  const first = (column: string) => theWordsOfAStoredField(STORED_FIELDS.sessionFirstBindingAgent, column)
  return sqlite.prepare(`SELECT bound.agentId AS agentId, (
      SELECT run.data -> '$.ranAs' FROM records AS run INDEXED BY records_session_first_binding_agent_idx
      WHERE run.kind = 'session' AND ${first('run.data')} = bound.agentId AND run.workspace_id = @project AND run.deleted_at IS NULL
        AND (CASE WHEN json_valid(run.data) THEN json_extract(run.data, '$.ranAs[0].workspaceId') END) = @project
      LIMIT 1) AS ranAs
    FROM (SELECT DISTINCT ${first('candidate.data')} AS agentId FROM records AS candidate INDEXED BY records_session_first_binding_agent_idx
      WHERE candidate.kind = 'session' AND candidate.workspace_id = @project AND candidate.deleted_at IS NULL) AS bound`)
})

/** EVERY RUN OF ONE PROJECT IN THE FALLBACK BUCKET (`theCandidateBuckets`), with only its `ranAs`. */
const ONE_PROJECTS_FALLBACK_RUNS = keptStatement(() => {
  const project = sql.placeholder('project') as unknown as string
  const fallback = sql`${records.id} IN (SELECT candidate.id FROM records AS candidate INDEXED BY records_session_reference_fallback_idx
    WHERE candidate.kind = 'session' AND ${STORED_FIELDS.sessionReferenceNeedsFallback(sql.raw('candidate.data'))} = 1
      AND candidate.workspace_id = ${project} AND candidate.deleted_at IS NULL)`
  return theSessionRowsInAnyOrder(project, undefined, fallback, thePresenceSessionData(['ranAs'])).prepare()
})

/**
 * THE GREY WORD OF AN AGENT NOTHING IS ANSWERING AS AND NOTHING HOLDS, for the 409 a person's send to it answers. The
 * word is chosen by the dot's one chooser, `theGreyWordOf`, from a narrow reading of the addressee's own latest session
 * rows. A handle a session holds never comes here: the reach gives such an agent no word, so a send to it stays 201.
 * So `hasAHold` is false.
 *
 * THE LIMIT: THIS WORD CAN DIFFER FROM THE DOT'S. It is the error path's read, and it does not read the agent's process
 * rows, its open connection or how long its runs have been quiet. It passes the neutral values for those
 * (`aProcessCannotBeRead: false`, `hasLiveProcess: false`, `connectionIsRecent: false`, `quietForMinutes: null`), and it
 * reads at most `THE_LAST_RUNS_READ` of the agent's runs. Two cases follow:
 *   - A live process the agent registered, a process that cannot be read, or a recent connection of the agent's page,
 *     with no run of the agent recorded: the dot says Offline, and this says Inactive.
 *   - A run in one of the office's terminals that has not ended, with `THE_LAST_RUNS_READ` newer runs of the agent after
 *     it: the dot says In a terminal, and this says Offline.
 * Reading those facts here would be a second presence reading of the agent on the send's path. The second case is
 * measured at its edge by tests/the-409-names-the-dots-word.test.ts.
 *
 * THE RUN-RECORDED FACT IS LAZY as it is in the dot: `aRunRanAsOneOf` is asked only where `quietForMinutes` is null,
 * which is always here. It is asked of this agent's references alone, and reads only the runs whose bindings could name
 * them (`ONE_PROJECTS_RUNS_BOUND_TO_ONE_OF`).
 */
export function theGreyWordOfAnUnansweredAgent(agentId: string, workspaceId: string): GreyPresenceWord {
  const row = readParticipant({ kind: 'agent', id: agentId }) as RegisteredAgent | null
  const handle = row?.handle ?? agentId
  const itsRecord = recordForAgentIn(agentId, workspaceId)
  const aliases = theFiledAliasesReadOnce(sqlite)
  // EVERY NAME A RUN OF THIS AGENT MAY BE STORED UNDER: its registry id, its handle, its own record and every alias
  // filed for it. `theTerminalsTheseRunsAreIn` still canonicalises the serving id, so an old id files the same run.
  const needles = [...new Set([...aliases.everyIdOf(agentId), handle, ...(itsRecord === null ? [] : [itsRecord])])]
  const rows = THE_LAST_RUNS_OF_ONE_AGENT().all({ project: workspaceId, needles: JSON.stringify(needles), limit: THE_LAST_RUNS_READ }) as PanelRecord[]
  const atWork = theTerminalsTheseRunsAreIn(rows, aliases).get(aliases.canonicalOf(agentId)) ?? null
  return theGreyWordOf({
    isAtWorkInATerminal: atWork !== null,
    hasAHold: false,
    aProcessCannotBeRead: false,
    hasLiveProcess: false,
    connectionIsRecent: false,
    quietForMinutes: null,
    withinMinutes: agentAliveWithinMinutes(),
    aRunOfThisAgentIsRecorded: () => aRunRanAsOneOf(workspaceId, [agentId, handle, ...(itsRecord === null ? [] : [itsRecord])]),
  })
}

/**
 * THAT READ, PREPARED ONCE AND KEPT, with the project, the needles and the number of rows as its values (-1 is every
 * row). Built again for each agent, building and preparing it was most of the check's time.
 */
const ONE_PROJECTS_RUNS_BOUND_TO_ONE_OF = keptStatement(() => {
  const project = sql.placeholder('project') as unknown as string
  const among = sql`(select value from json_each(${sql.placeholder('needles')}))`
  const bound = theSessionCandidates(project, among, theRowCouldBeOneOf(among, sql.raw('candidate.data')), true)
  return theSessionRowsInAnyOrder(project, undefined, bound, thePresenceSessionData(['ranAs'])).limit(sql.placeholder('limit')).prepare()
})

/**
 * THIS AGENT'S OWN RECORD IN THIS PROJECT, from the roster's one reading when a caller hands it in, else looked up. One
 * place, because the record `aRunOfThisAgentIsRecorded` asks for is the record whose runs `sessionRecordsThatCouldBeOf`
 * must keep.
 */
function theRecordOfThisAgent(agentId: string, workspaceId: string, agentRecords?: () => ReadonlyMap<string, string>): string | null {
  return agentRecords === undefined ? recordForAgentIn(agentId, workspaceId) : (agentRecords().get(agentId) ?? null)
}

/**
 * EVERY AGENT ONE READING OF SESSION ROWS RAN AS IN ONE PROJECT, worked out once for that reading and not once per agent.
 * It is `ranAsIn` of each row and nothing else, so the same rows always give the same set. Measured 9 October 2026 on an
 * office of the live shape: 220 agents each made the set of 6,500 rows again, which was 34 ms of one presence roster.
 */
const RAN_AS = new WeakMap<readonly PanelRecord[], Map<string, ReadonlySet<string | null>>>()

/**
 * Session rows that are not every run of their project (`sessionRecordsTheDotsReadIn`). The agents they ran as are not
 * every agent a run of the project ran as, so `theAgentsTheseRunsRanAs` refuses them rather than call an agent Inactive.
 */
const NOT_EVERY_RUN = new WeakSet<readonly PanelRecord[]>()

function theAgentsTheseRunsRanAs(rows: readonly PanelRecord[], workspaceId: string): ReadonlySet<string | null> {
  if (NOT_EVERY_RUN.has(rows)) {
    throw new Error(
      `These session rows of ${workspaceId} hold only its runs that have not ended and the message worker's runs, so they cannot say ` +
        'every agent a run of it ran as. The caller hands in those agents from every run.',
    )
  }
  let byProject = RAN_AS.get(rows)
  if (byProject === undefined) RAN_AS.set(rows, (byProject = new Map()))
  let bound = byProject.get(workspaceId)
  if (bound === undefined) byProject.set(workspaceId, (bound = new Set(rows.map((row) => ranAsIn(row, workspaceId)))))
  return bound
}

/**
 * THE RED REASON FOR ONE PARTICIPANT, OFF THE REGISTRY ROW ALONE, or null while somebody is there.
 *
 * `participantPresence` answers this before it reads any process row or session record. This is
 * that branch on its own, so a caller that only asks "does anybody hold this handle?" — the message
 * send's `whyNobodyHoldsTheHandle` — does not pay for, or warm, the live-process and session
 * statements the dot reads. RED is a fact about the registry and nothing else, and the two
 * sentences come from here now so the send's reply and the contact row's dot cannot drift.
 */
export function theRedReasonFor(who: ParticipantRef, held: ReturnType<typeof readParticipant>): string | null {
  const retired = held !== null && 'retired' in held && held.retired
  if (held === null) {
    return `Nothing in the ${participantWord(who.kind)} registry answers to "${who.id}", so it cannot be reached.`
  }
  if (retired) {
    const because =
      'retiredBecause' in held && held.retiredBecause !== null ? theReasonAsOneSentence(held.retiredBecause) : null
    return `This agent was retired${because === null ? '.' : `: ${because}`} Nothing new is given to a retired agent.`
  }
  return null
}

/**
 * A permanent resident's sleep line, or null because the agent is not a permanent resident. `isResident` is
 * `isAPermanentResident`, or the same answer read for every agent at once (`theAgentFactsReadOnce`).
 */
function theResidentSleepOf(agentId: string, isResident: (agentId: string) => boolean = isAPermanentResident): TheSleepLine | null {
  return isResident(agentId) ? theSleepLineOf(agentId) : null
}

/**
 * EACH AGENT'S OWN FACTS, READ ONCE FOR A CALLER THAT ASKS ABOUT IT IN SEVERAL PROJECTS (wave 13y round 46).
 *
 * The office scene asks `participantPresence` for every agent in every project. None of these facts names a project,
 * and nothing in that reading writes one, so each was the same answer read again for each project: the agent's registry
 * row and its runtime, its resident mark, the hold on its handle, its card and the two presence settings. Each is read
 * here the first time it is asked and kept for the rest of the reading. Every one is the reader `participantPresence`
 * asks without it, so the answer is worked out in one place.
 *
 * THE HOLD IS READ AT ONE INSTANT AND WITHOUT RELEASING. Only a reading made at `at` with that `readOnly` may use
 * these, and `participantPresence` refuses any other.
 *
 * AND MOST OF THEM ARE READ FOR EVERY AGENT IN ONE STATEMENT (wave 13y round 50): the resident marks, the holds of a
 * read-only reading, the cards from the registry rows, and which of the holds' sessions are runs the office started,
 * and which of the waiting runs'. Each still answers what its reader for one agent answers. Only a resident's sleep line
 * is read one agent at a time, and only for a resident.
 *
 * AND WHAT THE SESSION BEHIND A HOLD SAYS (wave 13y round 81), read at the same instant, once for every project when
 * the session has a record (`behindTheHold` on `ReadOnceForManyAgents` in lib/worker.ts says why).
 */
export interface AgentFactsReadOnce {
  at: number
  readOnly: boolean
  settings: () => { withinMinutes: number; withinSeconds: number }
  participant: (who: ParticipantRef) => RegisteredPerson | RegisteredAgent | null
  residentSleep: (agentId: string) => TheSleepLine | null
  hold: (agentId: string) => HoldOnTheWire | null
  cardOf: (agentId: string) => string | null
  runOrigin: (session: string) => { run: string; servingAgent: string } | null
  identityOf: TheIdentityOf
  behindTheHold: NonNullable<HowTheAnsweringIsRead['behindTheHold']>
}

/**
 * The facts above, for a reading at `now`. `registry` is every agent's registry row as the caller read them with
 * `listParticipants`, which builds each row as `readParticipant` does; an agent not in it is read by its id.
 * `waitingSessions` are the sessions of the runs still inside their wait, whose origin is read together, apart from the
 * holds' sessions; a session not among either is read on its own.
 *
 * `named` IS A READING OF THESE AGENTS ONLY (wave 13y round 51), and `registry` then holds them alone. Only their holds
 * are read, and each one's resident mark by its id, so neither read is of every agent.
 */
export function theAgentFactsReadOnce(
  now: Date,
  readOnly: boolean,
  registry: () => readonly RegisteredAgent[],
  identityOf: TheIdentityOf,
  waitingSessions: () => Iterable<string>,
  named?: readonly string[],
): AgentFactsReadOnce {
  const at = now.getTime()
  const once = <T>(read: (id: string) => T): ((id: string) => T) => {
    const kept = new Map<string, T>()
    return (id) => {
      if (!kept.has(id)) kept.set(id, read(id))
      return kept.get(id) as T
    }
  }
  let settings: { withinMinutes: number; withinSeconds: number } | null = null
  let rows: ReadonlyMap<string, RegisteredAgent> | null = null
  const registryRows = (): ReadonlyMap<string, RegisteredAgent> => (rows ??= new Map(registry().map((one) => [one.id, one])))
  const agent = once((id): RegisteredPerson | RegisteredAgent | null => registryRows().get(id) ?? readParticipant({ kind: 'agent', id }))
  let residents: ReadonlySet<string> | null = null
  // A READING THAT MAY RELEASE A LAPSED HOLD reads each agent's own, because releasing is what `theLiveHoldOn` does.
  let holds: ReadonlyMap<string, HoldOnTheWire> | null = null
  const everyHold = (): ReadonlyMap<string, HoldOnTheWire> => (holds ??= everyLiveHoldReadOnly(at, (id) => registryRows().get(id), named))
  // WHICH SESSIONS ARE RUNS THE OFFICE STARTED, in two batches (wave 13y round 91, item 24): every hold's session, read
  // the first time one of them is asked about, and the waiting runs' sessions, read the first time a session that is not
  // a hold's is asked about. In one batch, the first hold asked about read the waiting runs, and they read every line
  // that names a run, though a hold that is a run answers without them. A reading that may release a hold reads the
  // session of each hold it hands out on its own, as it did. Each batch answers a session as `theRunAWriteCameFrom` does.
  type Origins = { asked: ReadonlySet<string>; runs: ReadonlyMap<string, { run: string; servingAgent: string }> }
  const theOriginsOf = (sessions: Iterable<string>): Origins => {
    const asked = new Set(sessions)
    return { asked, runs: theRunsWritesCameFrom(asked) }
  }
  let holdSessions: ReadonlySet<string> | null = null
  const everyHoldSession = (): ReadonlySet<string> => (holdSessions ??= new Set([...everyHold().values()].map((hold) => hold.session)))
  const handedOut = new Set<string>()
  let holdOrigins: Origins | null = null
  let waitingOrigins: Origins | null = null
  const anOrigin = once(theRunAWriteCameFrom)
  // THE SESSION BEHIND EACH HOLD, READ ONCE FOR EVERY PROJECT (wave 13y round 81). A session with a record has its process
  // rows looked up in its own project whichever project asks (`theFactsOfASession`), and everything else it reads is the
  // session's own, so one reading answers every project. A session with no record has them looked up in the project
  // asking, so each project reads its own.
  const hasARecord = once((session) => getRecord(session) !== null)
  const behind = new Map<string, HeldSessionReading>()
  return {
    at,
    readOnly,
    settings: () => (settings ??= { withinMinutes: agentAliveWithinMinutes(), withinSeconds: personAliveWithinSeconds() }),
    participant: (who) => (who.kind === 'agent' ? agent(who.id) : readParticipant(who)),
    residentSleep: once((id) => (named === undefined ? theResidentSleepOf(id, (one) => (residents ??= everyPermanentResident()).has(one)) : theResidentSleepOf(id))),
    hold: readOnly
      ? (id) => everyHold().get(id) ?? null
      : once((id) => {
          const hold = theLiveHoldOn(id, readOnly, at)
          if (hold !== null) handedOut.add(hold.session)
          return hold
        }),
    cardOf: once((id) => {
      const row = registryRows().get(id)
      return row === undefined ? theCardOfAgent(id) : theCardTheRoleIs(row.role)
    }),
    runOrigin: (session) => {
      if (readOnly && everyHoldSession().has(session)) return (holdOrigins ??= theOriginsOf(everyHoldSession())).runs.get(session) ?? null
      if (!readOnly && handedOut.has(session)) return anOrigin(session)
      waitingOrigins ??= theOriginsOf(waitingSessions())
      return waitingOrigins.asked.has(session) ? (waitingOrigins.runs.get(session) ?? null) : anOrigin(session)
    },
    identityOf,
    behindTheHold: (hold, workspaceId, when, machine) => {
      if (when.getTime() !== at) {
        throw new Error(
          `The session behind a hold was asked about at ${when.toISOString()}, and these facts are read at ${now.toISOString()}. ` +
            'A transcript read at another instant can answer differently.',
        )
      }
      const key = hasARecord(hold.session) ? hold.session : `${hold.session}\n${workspaceId}`
      const kept = behind.get(key) ?? theSessionBehindTheHold(hold, workspaceId, when, machine)
      behind.set(key, kept)
      return kept
    },
  }
}

/** What a caller asking about many agents read once and hands in, beside the rows of the project (wave 13y round 46). */
export interface PresenceReadOnce {
  /** Each agent's own facts, read once for every project (`theAgentFactsReadOnce`). */
  facts?: AgentFactsReadOnce
  /** The message worker's run rows of `sessions`, by the agent each serves. Handed in only with those `sessions`. */
  messageRows?: HowTheAnsweringIsRead['messageRows']
  /** The session rows the grey signs could read for this agent, in their original order. */
  sessionsOf?: OneProjectsPresenceReadings['sessionsOf']
  /**
   * Every agent a run of the project ran as, from every run of it. Handed in with `sessions` that are not every run
   * (`sessionRecordsTheDotsReadIn`), which cannot say it.
   */
  ranAs?: () => ReadonlySet<string | null>
  /**
   * Whether a run of the project ran as one of these references, asked agent by agent (`aRunRanAsOneOf`). Handed in in
   * place of `ranAs` by a caller reading some agents only, which does not read every run.
   */
  ranAsOneOf?: (references: readonly string[]) => boolean
  /** The filed registry aliases, read at most once for every agent of the reading (`theFiledAliasesReadOnce`). */
  aliases?: TheFiledAliases
  /** The process rows of one session of the project, from the project's readings (`OneProjectsPresenceReadings`). */
  machineOfTheSession?: OneProjectsPresenceReadings['machineOfTheSession']
}

/** The facts a caller read once for many agents, when they were read at this reading's instant and in its mode. */
function theFactsOfThisInstant(readOnce: PresenceReadOnce, now: Date, readOnly: boolean): AgentFactsReadOnce | undefined {
  const facts = readOnce.facts
  if (facts !== undefined && (facts.at !== now.getTime() || facts.readOnly !== readOnly)) {
    throw new Error(
      `The agent facts handed to this presence reading were read at ${new Date(facts.at).toISOString()}${facts.readOnly ? ' without releasing' : ''}, ` +
        `and this reading is at ${now.toISOString()}${readOnly ? ' without releasing' : ''}. A hold read at another instant can answer differently.`,
    )
  }
  return facts
}

/** The words of a green dot: the word, the sentence beside it, and what made it green. */
interface TheGreenWords {
  word: string
  says: string
  from: ParticipantPresenceInput
}

/**
 * WHO IS ANSWERING AS THIS AGENT, AND THE WORDS OF ITS GREEN DOT WHEN SOMEBODY IS, or null where its dot is not green.
 * Worked out here once, for the dot (`participantPresence`) and for whether the agent is online (`isThisAgentOnline`), so
 * the online view is green exactly where the dot is.
 */
function whoAnswersAsThisAgent(
  agentId: string,
  workspaceId: string,
  now: Date,
  readOnly: boolean,
  theMachine: () => readonly ResourceReport[],
  rows: Parameters<typeof theAnsweringReading>[2],
  // THE WAITING RUNS, OR HOW TO READ THEM, handed on as they came: `theAnsweringReading` reads them only when neither a
  // hold nor a running run answers (wave 13y round 91, item 24).
  waiting: Parameters<typeof theAnsweringReading>[3],
  runningRows: HowTheAnsweringIsRead['runningRows'] | undefined,
  readOnce: PresenceReadOnce,
): TheAnsweringReading & { green: TheGreenWords | null } {
  const facts = readOnce.facts
  const { answering, hold, behindTheHold } = theAnsweringReading(
    agentId,
    workspaceId,
    rows,
    waiting,
    {
      machine: theMachine,
      ...(readOnce.machineOfTheSession === undefined ? {} : { machineOfTheSession: readOnce.machineOfTheSession }),
      readOnly,
      at: now.getTime(),
      ...(runningRows === undefined ? {} : { runningRows }),
      ...(readOnce.messageRows === undefined ? {} : { messageRows: readOnce.messageRows }),
      ...(readOnce.aliases === undefined ? {} : { aliases: readOnce.aliases }),
      ...(facts === undefined ? {} : { hold: facts.hold(agentId), cardOf: facts.cardOf, runOrigin: facts.runOrigin, identityOf: facts.identityOf, behindTheHold: facts.behindTheHold }),
    },
  )
  const read = { answering, hold, behindTheHold }
  const green = (word: string, says: string, from: ParticipantPresenceInput) => ({ ...read, green: { word, says, from } })
  // A RUN IS ANSWERING (criterion M79). When it holds the handle, the sentence names its record and
  // says so. A run with no hold (one started with tools/sandbox.mjs, or a run under the hold of a
  // session that is gone) gets the reading's own sentence.
  if (answering.how === 'a run') {
    return green(
      ANSWERING_WORD,
      answering.hold !== null
        ? `A run Mole Office started for this agent, filed as record ${answering.hold.session}, is answering and is ` +
            'holding its handle. It reads as answering until that run ends. No terminal has this agent open.'
        : answering.says,
      'a run answering as it',
    )
  }
  // A SESSION HOLDING THE HANDLE IS ANSWERING: its hold beats and no sign turned it, or its hold is
  // kept and the session named on it was read as still there. The reading's own sentence follows,
  // because it says what the answer rests on.
  if (answering.how === 'a live session') {
    const restsOn = behindTheHold !== null && behindTheHold.answering ? behindTheHold.says : null
    return green(
      ANSWERING_WORD,
      `The session filed as record ${String(answering.session)} is answering as this agent and is holding its ` +
        'handle, so a message sent now goes to that session rather than starting a run.' +
        (restsOn === null ? '' : ` ${restsOn}`),
      'a session answering as it',
    )
  }
  // A MESSAGE PICKS UP THIS AGENT'S OWN CONVERSATION, by criterion M89 and a decision: a run of
  // it waits for the next message, or it is a secretary or a supervisor past its run's wait.
  if (answering.how === 'a waiting run' || answering.how === 'its own conversation') {
    return green(
      COLOUR_WORDS.green.word,
      answering.says,
      answering.how === 'a waiting run' ? 'a run waiting for the next message' : 'its own conversation, picked up by a message',
    )
  }
  return { ...read, green: null }
}

/**
 * WHETHER ONE PARTICIPANT CAN BE REACHED RIGHT NOW.
 *
 * `now` is injectable so a test can put the clock where it needs it. Nothing here writes anything.
 */
export function participantPresence(
  who: ParticipantRef,
  workspaceId: string,
  now: Date = new Date(),
  askedBy: ParticipantRef | null = null,
  readOnly = false,
  machine?: () => readonly ResourceReport[],
  sessions?: () => readonly PanelRecord[],
  waiting?: () => readonly WaitingRun[],
  processes?: () => UnreleasedProcessRows,
  agentRecords?: () => ReadonlyMap<string, string>,
  // THE RUNNING ROWS OF `sessions` BY THE AGENT EACH SERVES, worked out once for a roster (`runningRows` on
  // `HowTheAnsweringIsRead` in lib/worker.ts says why). Handed in only with the `sessions` it was worked out from.
  runningRows?: HowTheAnsweringIsRead['runningRows'],
  // THE RUN ROWS THE ANSWERING READING READS, for a caller asking about this agent alone and handing in no `sessions`:
  // the rows of its reach (`theRunRowsOfOneReach` in lib/worker.ts says why they give the same answer as every running
  // run). Only the answering reading reads them. The words beside a grey dot still read the agent's session records.
  answeringRows?: () => ReturnType<typeof theRunRowsOfOneReach>,
  readOnce: PresenceReadOnce = {},
): OfficePresenceReading {
  const facts = theFactsOfThisInstant(readOnce, now, readOnly)
  const { withinMinutes, withinSeconds } = facts?.settings() ?? { withinMinutes: agentAliveWithinMinutes(), withinSeconds: personAliveWithinSeconds() }
  const held = facts === undefined ? readParticipant(who) : facts.participant(who)
  const base = {
    who,
    state: held?.state ?? null,
    stateAt: held?.stateAt ?? null,
    agentAliveWithinMinutes: withinMinutes,
    personAliveWithinSeconds: withinSeconds,
    // AN AGENT HAS NOTHING TO SAY ABOUT WHETHER IT IS HERE (M4), and a row nothing answers to has
    // nobody to say it. The person branch below fills these in for a reader allowed to know.
    choice: null,
    choiceAt: null,
  }

  // RED: nobody answers to this id, or the agent has been retired.
  const red = theRedReasonFor(who, held)
  if (red !== null) {
    return {
      ...base,
      colour: 'red',
      word: COLOUR_WORDS.red.word,
      says: red,
      from: null,
      stateMayBeStale: false,
      stateStaleBecause: null,
    }
  }

  // THE ROW IS THERE. `theRedReasonFor` answered null only for a registry row that exists and is
  // not retired, so every branch below has one. This is that branch said to the type checker once,
  // rather than a second read of the registry or a repeated assertion at each use.
  const present = held as Exclude<typeof held, null>

  const connection = whoIsConnected(who, now.getTime())

  if (who.kind === 'person') {
    return presenceOfAPerson(
      { ...base, who },
      present as RegisteredPerson,
      connection === null ? null : Math.round(connection.ago / 1000),
      withinSeconds,
      askedBy,
      workspaceId,
    )
  }

  // A PERMANENT RESIDENT'S SLEEP LINE, put on every reading below. One indexed read of its own row, and two of
  // `resident_sleeps` only for a resident: no record is read for it.
  const residentSleep = facts === undefined ? theResidentSleepOf(who.id) : facts.residentSleep(who.id)
  if (residentSleep !== null) Object.assign(base, { residentSleep })

  // AN AGENT. ITS COLOUR IS THE ONE ANSWER TO "IS ANYBODY ANSWERING AS IT?", `theAnsweringReading` in
  // lib/worker.ts, the reading behind `whoIsAnsweringAs` that the chat's "Cannot reach" notice, the
  // handle door and the routing all read. Problem h1S1MLK-SQ1I, the secretary's choice of 26 September 2026:
  // until then this function also turned an agent green on an open panel, a live process row or a
  // run with recent output, which that reading does not count, so the dot could be green with the
  // notice drawn under it. Criterion M106: online means a session is answering and can take a message
  // now. Criterion M126: a live process alone is not read as answering. Those three signs are still
  // read below, but only for the words beside a grey dot.
  const handle = 'handle' in present ? present.handle : who.id
  // ONE MACHINE READ FOR THIS PARTICIPANT, whether the caller handed one down or not. The roster
  // hands down one reading for everybody; a single-agent door gets one here. The hold's session, the
  // live-process rows and the session facts below all read this, so a process is checked once.
  let machineRead: readonly ResourceReport[] | null = null
  const theMachine =
    machine ?? ((): readonly ResourceReport[] => (machineRead ??= theProcessRowsOf(workspaceId)))
  // THE FILED ALIASES, READ AT MOST ONCE FOR THIS AGENT: the caller's, else the process rows' when the caller handed those
  // in, else one made here for the answering reading, the process rows and the session rows below.
  const ownAliases = readOnce.aliases ?? (processes === undefined ? theFiledAliasesReadOnce(sqlite) : undefined)
  const { green, answering, hold, behindTheHold } = whoAnswersAsThisAgent(
    who.id, workspaceId, now, readOnly, theMachine, sessions?.() ?? answeringRows?.(), waiting, runningRows,
    ownAliases === undefined ? readOnce : { ...readOnce, aliases: ownAliases },
  )
  if (green !== null) return { ...base, colour: 'green', ...green, stateMayBeStale: false, stateStaleBecause: null }

  // GREY: NOBODY IS ANSWERING AS THIS AGENT. What follows only chooses the words.
  //
  // A LIVE PROCESS ROW IS PUT TO THE ONE JUDGEMENT IN answering.ts, for its sentence (M126b): a bridge
  // can keep running while the session it speaks for has stopped, and a live process with no
  // transcript the office can read says so in the words the handle door uses.
  const theProcesses = processes ?? theUnreleasedProcessRowsOnce(undefined, ownAliases)
  const liveProcesses = liveProcessesFor(who.id, handle, workspaceId, theMachine, theProcesses)
  const aliases = ownAliases ?? theProcesses().aliases
  const processReadings = liveProcesses.map((row) => {
    const { process: processFacts, transcript } = theFactsOfASession(row.sessionRecordId, false, workspaceId, theMachine)
    return theReadingOf(processFacts, transcript, now)
  })
  // THE PROJECT'S SESSION RECORDS, READ ONCE HERE when the caller handed none down: the terminal sign, the output sign
  // and the run that makes this agent Offline rather than Inactive all read them. Only the rows that could be this
  // agent's runs are read (`sessionRecordsThatCouldBeOf`).
  let sessionsRead: readonly PanelRecord[] | null = null
  const sessionsOf = readOnce.sessionsOf
  const theSessions = sessionsOf === undefined
    ? sessions ?? ((): readonly PanelRecord[] =>
        (sessionsRead ??= sessionRecordsThatCouldBeOf(who.id, handle, theRecordOfThisAgent(who.id, workspaceId, agentRecords), workspaceId, aliases)))
    : (): readonly PanelRecord[] => (sessionsRead ??= sessionsOf(who.id, handle))
  const spoke = minutesSinceARunOfThisAgentSpoke(who.id, handle, workspaceId, now, theSessions)
  const quietForMinutes = spoke === null ? null : spoke.minutes
  const hasState = (present.state ?? '') !== ''
  const grey = (word: GreyPresenceWord, says: string): OfficePresenceReading => ({
    ...base,
    colour: 'grey',
    word,
    says,
    from: null,
    stateMayBeStale: hasState,
    stateStaleBecause: hasState ? STATE_IS_STALE : null,
  })
  // A DEAD HOLD IS OFFLINE (criterion M106). A session holds this agent's handle and nothing shows it
  // is answering; the sentence names what the hold's reading could not read, or a limit it ended on
  // (criterion M126). `answering.says` is that same sentence where the reading has one.
  //
  // WHEN THE OFFICE COULD NOT TELL (problem `TOoUy7fMbg1P`), the dot is grey too, because nothing is
  // known to be answering, and the words are the reading's own sentence, which ends "so whether it
  // is still answering could not be read". The dot never turns green on a guess.
  // AN AGENT AT WORK IN ONE OF THE OFFICE'S TERMINALS (wave 13u, round 3; the review of round 2, point 5). Its run's
  // session record says which terminal, and the office keeps that record in step with the terminal: it ends when the
  // terminal ends or is closed, and it moves when the holder restarts (lib/terminal-agents.ts). The dot stays grey,
  // because a terminal alone cannot take a message (criterion M106), and the words say where it is at work, so the
  // page does not call it inactive beside its running terminal. These are the first grey words, and `isThisAgentOnline`
  // below counts on that: a grey branch put before this one must be put there too.
  const atWork = theTerminalThisAgentWorksIn(who.id, workspaceId, aliases, theSessions)
  // A LIVE PROCESS WHOSE SESSION CANNOT BE READ AS ANSWERING (M126b) says what could not be read.
  const cannotBeRead = processReadings.find((one) => !one.answering && one.says !== null)
  const aProcessCannotBeRead = cannotBeRead !== undefined && cannotBeRead.says !== null && !processReadings.some((one) => one.answering)
  const connectionIsRecent = connection !== null && connection.ago <= withinSeconds * 1000
  // THE WORD IS CHOSEN ONCE, BY THE ONE CHOOSER THE 409 ALSO ASKS. The branches below only choose what to say beside
  // it; none of them returns a word of its own.
  const greyWord = theGreyWordOf({
    isAtWorkInATerminal: atWork !== null,
    hasAHold: hold !== null,
    aProcessCannotBeRead,
    hasLiveProcess: liveProcesses.length > 0,
    connectionIsRecent,
    quietForMinutes,
    withinMinutes,
    aRunOfThisAgentIsRecorded: () => aRunOfThisAgentIsRecorded(who.id, handle, workspaceId, theSessions, agentRecords, readOnce.ranAs, readOnce.ranAsOneOf),
  })
  if (atWork !== null) {
    return grey(
      greyWord,
      `This agent is at work in one of the office's terminals, in ${atWork.folder ?? 'a folder its run did not record'}` +
        `${atWork.since === null ? '' : `, since ${atWork.since}`}. Working in a terminal is not the same as taking messages. ` +
        `${answering.says}`,
    )
  }
  if (hold !== null) return grey(greyWord, behindTheHold?.says ?? answering.says)
  if (cannotBeRead !== undefined && cannotBeRead.says !== null && !processReadings.some((one) => one.answering)) {
    return grey(greyWord, cannotBeRead.says)
  }
  // A SIGN THAT SOMETHING OF THIS AGENT IS THERE, WHICH IS NOT SOMETHING ANSWERING AS IT. Each is said
  // first, and the reading's own sentence after it, so the words beside the grey dot agree with the
  // "Cannot reach" notice under it.
  if (liveProcesses.length > 0) return grey(greyWord, `${A_PROCESS_BUT_NOBODY} ${answering.says}`)
  if (connectionIsRecent) {
    return grey(greyWord, `${A_CONNECTION_BUT_NOBODY} ${answering.says}`)
  }
  if (quietForMinutes !== null && quietForMinutes < withinMinutes) {
    return grey(greyWord, `${recentSignButNobody(quietForMinutes, spoke?.from ?? 'output')} ${answering.says}`)
  }
  // NOTHING OF IT IS THERE AT ALL.
  //
  // THE WORD UNDER THE GREY SAYING WHICH FACT IT IS.
  // An agent with no run recorded has never been run: that is `inactive`, and it is a different thing
  // from one that ran before and is quiet now, which reads Offline as it always did. The measurement
  // the word rests on is `aRunOfThisAgentIsRecorded`. Inactive is not a fourth colour: the dot stays
  // grey, the same grey offline draws, and only the word and the sentence change. The words come from the grey
  // vocabulary above and the sentences from `@shared/lifecycle.ts`.
  //
  // NOT `quietForMinutes` ALONE (wave 13k round 39). It is null for a run that has ended and for one that
  // never said when it spoke, so it called an agent with two finished runs inactive. Such an agent ran and
  // is not running now, which is Offline, in the offline sentence.
  if (quietForMinutes === null) {
    return grey(greyWord, greyWord === GREY_PRESENCE_WORDS.inactive ? PRESENCE.inactive.sentence : PRESENCE.offline.sentence)
  }
  return grey(
    greyWord,
    spoke?.from === 'tool-use'
      ? `The newest use of a tool by any run of this agent was ${String(quietForMinutes)} minutes ago, which is longer than the ${String(withinMinutes)} this product waits, and no process of its is running.`
      : `The newest output any run of this agent wrote down was ${String(quietForMinutes)} minutes ago, which is longer than the ${String(withinMinutes)} this product waits, and no process of its is running.`,
  )
}

/**
 * WHETHER AN AGENT IS ONLINE IN THIS PROJECT, for the plugins' online view (wave 13y round 66, item 2): its
 * dot here is green, or grey with the words "In a terminal". A retired agent, and an id no agent has, is not online.
 *
 * THE DOT'S OWN STEPS, IN ITS ORDER, AND NONE OF THE REST. `participantPresence` reads red first, then green, and its
 * first grey words are "In a terminal". This reads those three with the same functions and stops there, so it reads
 * what the green step reads and no more. That is the project's process rows, once, when a hold's session or a run the
 * office did not start is to be checked, and the own process row of each running run the office started, because the
 * dot is green as "a run" only while that process is alive. Every unreleased process row of the office
 * (`theUnreleasedProcessRowsOnce`) and the facts of a session, which only the other grey words read, are not read.
 *
 * `sessions` are the project's session rows, and the terminal is looked for among them, as the dot looks for it.
 */
export function isThisAgentOnline(
  agentId: string,
  workspaceId: string,
  now: Date,
  readOnly: boolean,
  machine: () => readonly ResourceReport[],
  sessions: () => readonly PanelRecord[],
  waiting: () => readonly WaitingRun[],
  runningRows: HowTheAnsweringIsRead['runningRows'],
  readOnce: PresenceReadOnce,
): boolean {
  const facts = theFactsOfThisInstant(readOnce, now, readOnly)
  const who: ParticipantRef = { kind: 'agent', id: agentId }
  if (theRedReasonFor(who, facts === undefined ? readParticipant(who) : facts.participant(who)) !== null) return false
  if (whoAnswersAsThisAgent(agentId, workspaceId, now, readOnly, machine, sessions(), waiting, runningRows, readOnce).green !== null) return true
  return theTerminalThisAgentWorksIn(agentId, workspaceId, readOnce.aliases ?? theFiledAliasesReadOnce(sqlite), sessions) !== null
}

/**
 * WHICH OF THESE CONTACTS ARE ONLINE IN THIS PROJECT, by their participant keys, for the order inside a contact group
 * (wave 13y round 91, item 22). Online is what `aDotSaysOnline` in src/shared/contacts.ts reads a dot as: green, or grey
 * with the words "In a terminal".
 *
 * An agent is read through the dot's own steps (`isThisAgentOnline`), over one reading of the project's rows, as the
 * office scene reads it. The words beside a grey dot are not read, and the project's rows are read only when an agent
 * is among the contacts. A person is read by the whole dot as `askedBy` is told it, so a person is online by their own
 * choice. `registry` is every agent's registry row, read once by the caller.
 */
export function whichContactsAreOnline(
  whos: readonly ParticipantRef[],
  workspaceId: string,
  askedBy: ParticipantRef,
  registry: ReadonlyMap<string, RegisteredAgent>,
  now: Date = new Date(),
  // THE FILED REGISTRY ALIASES, from a door that read them for its contact rows, so they are read once for the request.
  aliases?: TheFiledAliases,
): Set<string> {
  const online = new Set<string>()
  const agents = whos.filter((one) => one.kind === 'agent')
  if (agents.length > 0) {
    const identityOf = everyAgentsIdentityReadOnce(sqlite)
    const read = thePresenceReadingsOf(workspaceId, undefined, identityOf, undefined, false, () => sessionRecordsTheDotsReadIn(workspaceId), undefined, aliases)
    const facts = theAgentFactsReadOnce(now, true, () => [...registry.values()], identityOf, () => read.waiting().map((one) => one.session))
    for (const one of agents) {
      if (isThisAgentOnline(one.id, workspaceId, now, true, read.machine, read.sessions, read.waiting, read.runningRows, { facts, messageRows: read.messageRows, aliases: read.aliases })) online.add(participantKey(one))
    }
  }
  for (const one of whos) {
    if (one.kind === 'person' && aDotSaysOnline(participantPresence(one, workspaceId, now, askedBy, true))) online.add(participantKey(one))
  }
  return online
}

/**
 * THE WORDS BESIDE A GREY DOT WHEN SOMETHING OF THE AGENT IS THERE BUT NOTHING IS ANSWERING AS IT.
 * Each is followed by the answering reading's own sentence, so what the sentence adds is only the
 * sign that was seen and that it is not enough to take a message.
 */
const A_PROCESS_BUT_NOBODY =
  'A process registered for this agent is running on this machine, but a running process alone cannot take a message.'
const A_CONNECTION_BUT_NOBODY =
  'Mole Office is holding a connection open for this agent, but an open connection alone cannot take a message.'
function recentSignButNobody(minutes: number, from: 'output' | 'tool-use'): string {
  const ago = minutes === 0 ? 'less than a minute' : `${String(minutes)} minutes`
  return from === 'tool-use'
    ? `A run of this agent used a tool ${ago} ago, but a use of a tool alone cannot take a message.`
    : `A run of this agent wrote down output ${ago} ago, but output written down alone cannot take a message.`
}

/**
 * WHETHER A PERSON IS HERE, WHICH IS THE PERSON'S OWN ANSWER AND NOT A MEASUREMENT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS ONE IS DECLARED WHEN AN AGENT'S IS WORKED OUT
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M4 says presence is worked out and never declared, and that is still true of an agent:
 * an agent is a process, and whether a process is running is a fact about this machine. A person is
 * not a process. The only thing this product could ever measure about a person is whether a page of theirs
 * is open, which is why the old reading said exactly that.
 *
 * Decision `wvfrwvuzsKF_` of 4 September 2026 settles it for a person: online by default, and the person may set
 * online, offline or invisible. So the colour is the person's answer, and what is measured is still said in the
 * sentence beside it — a reader sees both, and neither stands in for the other.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT INVISIBLE MEANS, AND WHY IT LOOKS EXACTLY LIKE AWAY
 * ---------------------------------------------------------------------------------------
 *
 * Invisible means that only an agent the person has written to may know the person is online. An agent the
 * person has written to is told the person is here. Every other agent is told what an agent that cannot see the
 * person can honestly be told: nothing here says the person is there. It must be word-for-word what being away looks
 * like, including the sentence, because a reading that said "hidden" would be the hiding undone.
 *
 * THIS IS NOT A LIE TOLD TO THE AGENT. The sentence is a claim about what this reply may say, and
 * it is true of the reply. The stored answer is unchanged, the person can see it, and any person
 * reading is shown it.
 *
 * ---------------------------------------------------------------------------------------
 * WHO IS SHOWN THE CHOICE ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * The person is, and so is any other person, because M12 gives a person the right to read what is here.
 * An agent is never shown the word, so `invisible` cannot be read off a field beside the colour
 * that was drawn to hide it.
 */
function presenceOfAPerson(
  base: Omit<ParticipantPresenceReading, 'colour' | 'word' | 'says' | 'from' | 'stateMayBeStale' | 'stateStaleBecause'>,
  held: RegisteredPerson,
  panelOpenSecondsAgo: number | null,
  withinSeconds: number,
  askedBy: ParticipantRef | null,
  workspaceId: string,
): OfficePresenceReading {
  const chosen = held.presenceChoice ?? PRESENCE_BEFORE_ANYBODY_CHOOSES
  const theyChose = held.presenceChoice !== null
  const asking = askedBy === null ? null : askedBy
  const anAgentIsAsking = asking !== null && asking.kind === 'agent'
  const themselves = asking !== null && asking.kind === base.who.kind && asking.id === base.who.id
  // A PERSON MAY SEE THE ANSWER ITSELF; AN AGENT NEVER MAY. A caller nothing can place is treated as
  // an agent would be, because "nobody said who is asking" is not a reason to say more.
  const mayKnowTheChoice = asking !== null && asking.kind === 'person'
  const said = {
    ...base,
    choice: mayKnowTheChoice ? chosen : null,
    choiceAt: mayKnowTheChoice ? held.presenceChoiceAt : null,
  }

  // WHAT IS MEASURED, SAID IN THE SAME WORDS WHATEVER THE CHOICE IS. It never decides the colour any
  // more, and it is never dropped: a reader allowed to see the choice sees the measurement too.
  const panel =
    panelOpenSecondsAgo === null
      ? 'Their messages panel is not open.'
      : panelOpenSecondsAgo <= withinSeconds
        ? `Their messages panel is open and said so ${String(panelOpenSecondsAgo)} seconds ago.`
        : `Their messages panel last said it was open ${String(panelOpenSecondsAgo)} seconds ago, which is longer than the ${String(withinSeconds)} seconds this product waits.`
  const because = theyChose ? 'They set themselves' : 'Not chosen, so this is the default:'

  // AWAY, IN THE ONE SET OF WORDS BOTH THINGS THAT LOOK LIKE IT USE.
  const away = (says: string): OfficePresenceReading => ({
    ...said,
    colour: 'grey',
    word: COLOUR_WORDS.grey.word,
    says,
    from: null,
    stateMayBeStale: false,
    stateStaleBecause: null,
  })

  if (chosen === 'offline') {
    return away(mayKnowTheChoice ? `${because} away. ${panel}` : 'Nothing here says they are there.')
  }

  if (chosen === 'invisible') {
    // HIDDEN FROM AN AGENT THE PERSON HAS NOT WRITTEN TO, and from one this product cannot place.
    if (anAgentIsAsking && !hasWrittenTo(base.who, asking, workspaceId)) {
      return away('Nothing here says they are there.')
    }
    if (asking === null) return away('Nothing here says they are there.')
    return {
      ...said,
      colour: 'green',
      word: COLOUR_WORDS.green.word,
      says: mayKnowTheChoice
        ? `${because} invisible, and they are here. ${panel}`
        : 'They are here. You are told because they have written to you.',
      from: null,
      stateMayBeStale: false,
      stateStaleBecause: null,
    }
  }

  return {
    ...said,
    colour: 'green',
    word: COLOUR_WORDS.green.word,
    says: mayKnowTheChoice ? `${because} here. ${panel}` : 'They are here.',
    from: null,
    stateMayBeStale: false,
    stateStaleBecause: null,
  }
}

/** The readings of one project that every agent's dot shares, as `participantPresence` takes them. */
export interface OneProjectsPresenceReadings {
  machine: () => readonly ResourceReport[]
  /**
   * THE PROCESS ROWS OF ONE SESSION OF THIS PROJECT, from the same reading as `machine` (wave 13y round 118, item 50).
   * `machine` works out whether every process of the project is alive. The online view and a reading of named agents
   * ask this, because their dots ask of a few sessions. A reading of every agent's whole dot reads `machine`, because
   * the words beside a grey dot read every process row of the project for an agent with one.
   */
  machineOfTheSession: (session: string) => readonly ResourceReport[]
  sessions: () => readonly PanelRecord[]
  /**
   * The runs of `sessions` still inside their wait (`runsStillInsideTheirWaitAmong`, wave 13y round 110, item 43). A run
   * whose wait is over is not here, because no reader of these readings answers by one, and so a project where every wait
   * is over reads no goodbye line.
   */
  waiting: () => readonly WaitingRun[]
  processes: () => UnreleasedProcessRows
  /** Every agent's own record in this project, by registry id (`recordsForAgentsIn`). */
  agentRecords: () => ReadonlyMap<string, string>
  /** The running rows of `sessions`, by the agent each serves (`theRunningRowsByTheAgentTheyServe`). */
  runningRows: NonNullable<HowTheAnsweringIsRead['runningRows']>
  /** The message worker's run rows of `sessions`, by the agent each serves (`theMessageRunRowsByTheAgentTheyServe`). */
  messageRows: NonNullable<HowTheAnsweringIsRead['messageRows']>
  /** The grey signs' session rows, grouped by the references those signs ask for. */
  sessionsOf: (agentId: string, handle: string) => readonly PanelRecord[]
  /** Every agent a run of this project ran as (`theAgentsTheseRunsRanAs`), from every run when the caller handed them in, else from `sessions`. */
  ranAs: () => ReadonlySet<string | null>
  /** The filed registry aliases, read at most once for the reading, for runs stored under an agent's old id. */
  aliases: TheFiledAliases
}

/**
 * The unreleased process rows, read the first time an agent needs them and then kept for the request. `recordsOf` and
 * `aliases` are `theUnreleasedProcessRows`'.
 */
export function theUnreleasedProcessRowsOnce(recordsOf?: ReadonlyMap<string, ReadonlySet<string>>, aliases?: TheFiledAliases): () => UnreleasedProcessRows {
  let read: UnreleasedProcessRows | null = null
  return () => (read ??= theUnreleasedProcessRows(recordsOf, aliases))
}

export type { TheseAgentsOnly } from '../db/types/presence.ts'

export { theseAgentsOnly } from '../db/these-agents-only.ts'

/**
 * THE MACHINE, THE SESSION ROWS, THE WAITING RUNS AND THE PROCESS ROWS OF ONE PROJECT, each read the
 * first time an agent needs it and then shared by every agent asked about in the same request. The
 * roster below and the office scene both hand these down. Until the scene did, it read each of them
 * again for every agent in every project, and on 25 September 2026 one scene took 48 seconds, 37 of
 * them here (problem u_yThQczHiZ8).
 *
 * The process rows do not depend on the project, so a caller walking several projects hands in one
 * reading of them for all of them.
 */
export function thePresenceReadingsOf(
  workspaceId: string,
  // THE PROCESS ROWS, from a caller walking several projects; else read once for this reading, with its aliases.
  processesHandedIn?: () => UnreleasedProcessRows,
  // HOW A RUN'S AGENT IS LOOKED UP BY ITS ID, for a caller that read every agent's identity once (wave 13y round 46).
  identityOf?: TheIdentityOf,
  // A READING OF THESE AGENTS ONLY (wave 13y round 51): the session rows that could be theirs and their own records. The
  // waiting runs and the two sets of run rows are worked out from those rows, and each is decided run by run or agent
  // by agent, so what they hold for these agents is what they hold over every row.
  named?: TheseAgentsOnly,
  // Callers that need only presence's session fields opt in; other callers still receive whole session records. Of every
  // agent, such a caller is handed the runs the dots read (`theRunsTheDotsReadForPresence`), and `ranAs` then needs `everyRun`.
  projectSessionData = false,
  // A caller that already read these rows hands them in, in NEWEST_SESSION_FIRST order.
  readSessions?: () => readonly PanelRecord[],
  // EVERY RUN OF THE PROJECT, in any order, from a caller whose `readSessions` are not every run
  // (`sessionRecordsTheDotsReadIn`): only the agents they ran as are read from them (wave 13y round 66).
  everyRun?: () => readonly PanelRecord[],
  // THE FILED REGISTRY ALIASES, from a caller walking several projects, so they are read once for all of them.
  aliasesHandedIn?: TheFiledAliases,
): OneProjectsPresenceReadings {
  const aliases = aliasesHandedIn ?? theFiledAliasesReadOnce(sqlite)
  const processes = processesHandedIn ?? theUnreleasedProcessRowsOnce(undefined, aliases)
  let read: readonly ResourceReport[] | null = null
  let sessionRows: readonly PanelRecord[] | null = null
  let waitingRuns: readonly WaitingRun[] | null = null
  let records: ReadonlyMap<string, string> | null = null
  let running: ReturnType<typeof theRunningRowsByTheAgentTheyServe> | null = null
  let messageRuns: ReturnType<typeof theMessageRunRowsByTheAgentTheyServe> | null = null
  const sessions = (): readonly PanelRecord[] => (sessionRows ??= readSessions?.() ?? (projectSessionData
    ? named === undefined
      ? theRunsTheDotsReadForPresence(workspaceId)
      : theSessionRowsIn(workspaceId, undefined, named.sessions(workspaceId), thePresenceSessionData()) as PanelRecord[]
    : sessionRecordsIn(workspaceId, named?.sessions(workspaceId))))
  const agentRecords = (): ReadonlyMap<string, string> => (records ??= recordsForAgentsIn(workspaceId, named?.ids))
  let signs: { byReference: Map<string, PanelRecord[]>; order: Map<PanelRecord, number> } | null = null
  const sessionsOf = (agentId: string, handle: string): readonly PanelRecord[] => {
    // ONLY FOR THIS READING. The output sign asks ranAsIn for the id or handle; the recorded-run sign also asks for
    // the agent's own record; the terminal sign asks servingAgentId for the id. Index those exact values once, and
    // leave each sign's judgement unchanged. The union keeps the original order, including ties in session stamps.
    // Nothing survives this call to thePresenceReadingsOf, so the next look reads every write afresh. A
    // `servingAgentId` is indexed by its canonical id, as the terminal sign looks it up.
    if (signs === null) {
      const byReference = new Map<string, PanelRecord[]>()
      const order = new Map<PanelRecord, number>()
      for (const row of sessions()) {
        order.set(row, order.size)
        const servingAgentId = row.data['servingAgentId']
        for (const reference of new Set([ranAsIn(row, workspaceId), typeof servingAgentId === 'string' ? aliases.canonicalOf(servingAgentId) : servingAgentId])) {
          if (typeof reference !== 'string') continue
          const held = byReference.get(reference)
          if (held === undefined) byReference.set(reference, [row])
          else held.push(row)
        }
      }
      signs = { byReference, order }
    }
    const own = agentRecords().get(agentId)
    const { byReference, order } = signs
    const rows = new Set([agentId, handle, ...(own === undefined ? [] : [own])].flatMap((reference) => byReference.get(reference) ?? []))
    return [...rows].sort((a, b) => order.get(a)! - order.get(b)!)
  }
  // ONE SESSION'S PROCESS ROWS (wave 13y round 118, item 50). Measured first, on the made-up office shaped to the live
  // counts of 30 October 2026: the office map's people view for 20 agents worked out whether each of the project's 310
  // process rows was alive, and kept two of those rows. Each session is read the first time it is asked, and from
  // `machine` once that is read.
  const bySession = new Map<string, readonly ResourceReport[]>()
  const machineOfTheSession = (session: string): readonly ResourceReport[] => {
    if (read !== null) return read.filter((one) => one.sessionRecordId === session)
    const rows = bySession.get(session) ?? listResources({ workspaceId, sessionRecordId: session, type: 'process' })
    bySession.set(session, rows)
    return rows
  }
  return {
    machine: () => (read ??= theProcessRowsOf(workspaceId)),
    machineOfTheSession,
    sessions,
    // Read from the same session rows, so the rows are read once (tests/the-presence-door-reads-its-rows-once.test.ts).
    waiting: () => (waitingRuns ??= runsStillInsideTheirWaitAmong(workspaceId, sessions(), identityOf)),
    processes,
    agentRecords,
    runningRows: () => (running ??= theRunningRowsByTheAgentTheyServe(sessions(), identityOf)),
    messageRows: () => (messageRuns ??= theMessageRunRowsByTheAgentTheyServe(workspaceId, sessions(), identityOf)),
    // ROWS THAT ARE NOT EVERY RUN STAY MARKED SO (`NOT_EVERY_RUN`), so the recorded-run sign cannot read them as every run.
    sessionsOf: (agentId: string, handle: string): readonly PanelRecord[] => {
      const ofThisAgent = sessionsOf(agentId, handle)
      if (NOT_EVERY_RUN.has(sessions())) NOT_EVERY_RUN.add(ofThisAgent)
      return ofThisAgent
    },
    ranAs: () => theAgentsTheseRunsRanAs(everyRun === undefined ? sessions() : everyRun(), workspaceId),
    aliases,
  }
}

/** Every participant's colour, in one read, for the panel that draws them all. */
export function everybodysPresence(
  workspaceId: string,
  now: Date = new Date(),
  askedBy: ParticipantRef | null = null,
  readOnly = false,
  clockSessions?: PresenceSessionRows,
  // BOTH REGISTRIES, from a caller reading several projects in one synchronous pass, so they are read once for all of them.
  both: ReturnType<typeof listParticipants> = listParticipants(),
): ParticipantPresenceReading[] {
  return thePresenceOf(
    [...both.people.map((one): ParticipantRef => ({ kind: 'person', id: one.id })), ...both.agents.map((one): ParticipantRef => ({ kind: 'agent', id: one.id }))],
    workspaceId,
    now,
    askedBy,
    readOnly,
    both.agents,
    clockSessions,
  )
}

/**
 * THE COLOURS OF THE PARTICIPANTS ASKED ABOUT, in the order asked, with one reading of the machine for all of them.
 *
 * `GET /api/presence?of=` answers it for the rows a page draws (round 9 of wave 13x), and `everybodysPresence` for
 * everybody. A participant no registry holds is the red answer, as `participantPresence` gives it.
 */
export function thePresenceOf(
  whos: readonly ParticipantRef[],
  workspaceId: string,
  now: Date = new Date(),
  askedBy: ParticipantRef | null = null,
  readOnly = false,
  // The full roster already read these rows. A caller without them reads only the participants it asks for.
  registry?: readonly RegisteredAgent[],
  clockSessions?: PresenceSessionRows,
  // THE ASKED AGENTS ONLY, from a caller reading them in several projects (wave 13y round 111: the chat reads each agent's
  // dot in its home project). Of this project only the asked agents' runs the dots read are read, and of their other
  // runs only those whose bindings could name them (`aRunRanAsOneOf`). The filed aliases and the process rows are the
  // caller's, read once for every project. These give the asked agents the colours and words a reading of every row gives
  // (`theirRunsTheDotsRead` and `aRunRanAsOneOf` say why).
  theirRunsOnly?: { named: TheseAgentsOnly & { needles: readonly string[] }; aliases: TheFiledAliases; processes: () => UnreleasedProcessRows },
): ParticipantPresenceReading[] {
  // ONE READING OF THE MACHINE, THE SESSION RECORDS, THE WAITING RUNS AND THE PROCESS ROWS FOR ALL OF THEM, each made
  // when the first agent needs it; see `liveProcessesFor` and `minutesSinceARunOfThisAgentSpoke`.
  const identityOf = registry === undefined ? eachAgentsIdentityReadOnce(sqlite) : everyAgentsIdentityReadOnce(sqlite)
  // OF THE ASKED AGENTS' RUNS, THOSE THE DOTS READ (`theirRunsTheDotsRead`); of every agent, the runs the dots read
  // (`theRunsTheDotsReadForPresence`, wave 13y round 143), and the clock hands in the same rows. Neither is every run, so
  // for the word Inactive each agent is asked whether one run of it is recorded (`aRunRanAsOneOf`).
  const { machine, sessions, waiting, processes, agentRecords, runningRows, messageRows, sessionsOf, aliases } = thePresenceReadingsOf(
    workspaceId, theirRunsOnly?.processes, identityOf, theirRunsOnly?.named, true,
    theirRunsOnly !== undefined
      ? () => theirRunsTheDotsRead(workspaceId, theirRunsOnly.named.needles)
      : clockSessions === undefined ? undefined : () => clockSessions(workspaceId),
    undefined,
    theirRunsOnly?.aliases,
  )
  const registered = () => registry ?? whos.flatMap((who) => {
    if (who.kind !== 'agent') return []
    const held = readParticipant(who)
    return held === null ? [] : [held as RegisteredAgent]
  })
  const facts = theAgentFactsReadOnce(
    now, readOnly, registered, identityOf, () => waiting().map((one) => one.session),
    registry === undefined ? whos.filter((who) => who.kind === 'agent').map((who) => who.id) : undefined,
  )
  // OF EVERY AGENT, the word Inactive asks only the agents a run could have run as (`aRunRanAsOneOfForEveryAgent`).
  const ranAsOneOf = registry === undefined ? (references: readonly string[]) => aRunRanAsOneOf(workspaceId, references) : aRunRanAsOneOfForEveryAgent(workspaceId)
  const readOnce = { facts, messageRows, sessionsOf, aliases, ranAsOneOf }
  return whos.map((who) =>
    who.kind === 'person'
      ? participantPresence(who, workspaceId, now, askedBy, readOnly, machine, sessions, undefined, undefined, undefined, undefined, undefined, readOnce)
      : participantPresence(who, workspaceId, now, askedBy, readOnly, machine, sessions, waiting, processes, agentRecords, runningRows, undefined, readOnce),
  )
}
