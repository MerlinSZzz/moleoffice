// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { holdNoticeDeliveries } from '../../holder/notice-batches.ts'
/**
 * THE ONE MESSAGE POOL. The board, a conversation and a page's comments are all read from here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS ONE LIBRARY AND NOT THREE READERS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M1 of design/messages/ACCEPTANCE.md: *The message board, a conversation and a page's
 * comments read the same rows through one library.* Before this file each of the three asked the
 * database its own question, so a message could appear on one and not the others with nothing
 * failing. That is the defect CLAUDE.md names at the top: the same fact worked out in two places.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A COMMENT IS
 * ---------------------------------------------------------------------------------------
 *
 * A comment is a message that says what on a page it is about: a comment a person leaves is only a
 * special kind of message. So `commentsIn` returns two kinds of row and says which each one is:
 *
 *   a record of kind `annotation`  every comment written before this build. They stay exactly as
 *                                  they are, are drawn exactly as they were, and nothing rewrites
 *                                  one.
 *   a record of kind `message`     with a `target`. Every comment written from now on.
 *
 * Nothing here converts one into the other. A reader that wants comments asks this function and
 * gets both, in one order.
 *
 * ---------------------------------------------------------------------------------------
 * WHO A MESSAGE IS TO IS WRITTEN TWICE, AND A TEST IS WHAT KEEPS THE TWO TOGETHER
 * ---------------------------------------------------------------------------------------
 *
 * The record carries `to`, because that is the field an author writes and the field GET /api/kinds
 * publishes. `message_delivery` carries one row per recipient, because a delivery mark changes and
 * a record field cannot change without a revision. `writeTheDeliveries` writes both, in one
 * transaction, and it is the only thing that writes either. `tests/one-message-pool.test.ts` fails
 * when a message's rows and its `to` field name different people, which is the third of CLAUDE.md's
 * three ways to fix one fact in two places.
 */

import { projectsOfAgents } from '../db/projects-of-agents.ts'
import { isAHandOverSentence, isAMessageReadSentence } from '@shared/handles.ts'
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { union } from 'drizzle-orm/sqlite-core'
import { anOfficeId } from './ids.ts'
import { PAIR_SEPARATOR, pairFrom, pairKey } from './message-pairs.ts'
import { hasOriginalUpgradeNoticeForOwner } from './stable-upgrade-notices.ts'
import { db, sqlite } from '../db/client.ts'
import { isOneOfTheIds, theFiledAliasesReadOnce, type TheFiledAliases } from './registry-aliases/runs.ts'
import { theRegistryIdsOf } from './registry-aliases/stamps.ts'
import { piecesOf, readInPieces } from '../db/in-pieces.ts'
import { ONE_KIND_WRITTEN_OUT, STORED_FIELDS, agentRecords, theKindOfARowFoundById, theProjectOfARowFoundById, conversationReads, groupMembers, handleHolds, messageDelivery, records } from '../db/schema.ts'
import { anInstantNamesItsStamp, localStamp, momentOfAStampAndItsInstant, nowStamp, parseStoredStamp } from '@shared/time.ts'
import { theSummaryFactsOf, theSweepFactsOf } from '@shared/dead-letter-lines.ts'
import {
  declaredRuntimeOrNull,
  isMoleOffice,
  theMoleOfficeTest,
  moleOffice,
  participantWord,
  type AgentRuntime,
  type ParticipantKind,
  type ParticipantRef,
} from '@shared/participants.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { theCannotReceiveLine, type CannotReceiveState, type TheCannotReceiveSaid } from '@shared/cannot-receive.ts'
import { kindWord } from '@shared/words.ts'
import { announce, everyPageOpen, type TellOnePage } from './events.ts'
import type { ChannelEvent, DeliveryChanged, SeenLeaves, WhatANewMessageChanges, WhatANewMessageChangesForOneReader } from '@shared/events.ts'
import { theContactsPlacedByHand } from './contacts.ts'
import { tellTheWaitersFor } from './waiting-hold.ts'
import {
  A_GROUP_IS_NAMED_BY_ITS_ID,
  DELIVERY_MARKS,
  NEITHER_SIDE,
  NOBODY_NAMED_AND_NOTHING_POINTED_AT,
  QUOTES_AND_NOBODY_NAMED,
  NOTHING_ANSWERS_FOR_MOLE_OFFICE,
  type ACallersDeliveryMark,
  type DeliveryMark,
  type DeliveryOnTheWire,
  type MessageOnTheWire,
  type PoolEntry,
  type PoolEntryKind,
  type RoutedAddressee,
  type UnregisteredWriter,
  aMarkSaysItWasRead,
  asksThePersonOf,
  deliveryWord,
  isDeliveryMark,
  isUrgent,
  theQuestionsWaitingForTheAnswerOf,
  // WHICH WRITER WORKED A ROW'S RECIPIENT OUT. The door writes the answer on every row it makes,
  // from the one statement of the answer in the shared file, so it cannot drift from what the
  // messages migration later reads. Problem `IhInQ2Mf5BZq`.
  inferredByFor,
  // THE TAG ON A ROW THE ROUTING ADDED, and the reader of the entries that put it there.
  INFERRED_BY_THE_ROUTING,
  carriedToOf,
  type CarriedTo,
  routedCopiesOf,
  routedOf,
  leadOfRecord,
  onlyOnOf,
  picturesOf,
  writtenFromOf,
  editedOf,
  writtenInOf,
  theProjectsOfAConversation,
  theProjectsWithANewerMessage,
  participantFromKey,
  participantKey,
  recordIsAComment,
  targetOfRecord,
  quotesOf,
  quotePositionsOf,
  sameParticipant,
  unregisteredKey,
  unregisteredName,
  whyAddresseesAreRefused,
  // WHO WROTE A MESSAGE. These four moved to the shared file so the Messages page can ask the same
  // question the panel asks: is this row's writer somebody a registry holds, or a writer nobody
  // registered. They read nothing but their arguments, which is what made them movable.
  senderOf,
  theAgentAStoredSenderNames,
  unregisteredWriterOf,
  whoTypedThis,
  type KnownParticipant,
  // WHO A STORED `to` NAMES. See `refFrom` below.
  oneParticipantRef,
  refsOfRecipients,
  theOfficeMarkedItRead,
} from '@shared/messages.ts'
import {
  A_MESSAGE_GOES_TO_A_GROUP_OR_TO_PEOPLE,
  whoAMessageMentions,
  type GroupOnTheWire,
  type Mentionable,
} from '@shared/groups.ts'
import type { ContactToPlace } from './contacts.ts'
import { asAgentIdentity, everyAgentsIdentityWithReferencesReadOnce, type AgentIdentity, type TheIdentityOf } from './agent-references.ts'
import { theRegistryRowsNamedBy } from '../db/registry-aliases/index.ts'
// READ INSIDE A FUNCTION BODY AND NEVER WHILE THIS MODULE IS BEING EVALUATED. lib/groups.ts imports
// lib/records.ts, which imports this file, so the three are a cycle — the same safe shape the
// import of lib/records.ts below already has, and for the same reason.
import { whoAGroupMessageReaches, mentionableMembersOfMany, groupsFor } from './groups.ts'
import { contextKey, type Context } from '@shared/targets.ts'
import { THE_START_AN_AGENT_DOOR, everyAgentAStoredStampCouldName, getRecord, listRecords, patchRecord, type Actor } from './records.ts'
import { toRecord } from './to-record.ts'
import { THE_AGENT_WORKER_ID } from '@shared/agent-ids-that-need-no-registration.ts'
import { PanelError } from './panel-error.ts'
// WHO READS EVERY MESSAGE: the owner, the secretaries and the message worker (`theMessageReader`).
// Read inside a function body only; lib/records.ts already imports lib/worker.ts, so this adds no new cycle.
import { THE_PERSON } from '@shared/person.ts'
import { theFlagsOf, theIntentOnTheWire, theMarkedPartsOnTheWire, whatTheLabelAsks, type TheFlagsOfAPerson } from '@shared/intent-mark.ts'
import { labelOf, theLabelOnTheWire } from '@shared/message-label.ts'
import { theSecretaries } from './secretariat.ts'
import { theRunRowsOfOneReach } from './the-run-rows-of-one-reach.ts'
import { THE_WORKER } from '@shared/the-worker-actor.ts'
import { ranAsIn } from '@shared/ran-as.ts'
import { commentsGoneOut, hasGoneOut, messagesCarrying, type MessageState } from './dispatch.ts'
import { EVERY_PROJECT, justThisProject, type WhichProjects } from '@shared/which-projects.ts'
import { narrowedToProjects } from '@shared/which-projects-sql.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES, carriesALead, whenAPutOffOfferComesBack, type ACommentWithItsWrittenOrder } from '@shared/short-lists.ts'
import { whenAPutOffMessageComesBack, type RemindMeLaterChoice } from '@shared/remind-me-later.ts'
import { aCommentOnARecordOf, messagesInTheViewOf, messagesInTheViewOfAnyOf, theViewFromAMoment, theViewReadOneWayAtATime, theViewsHoldingIt } from './message-centre.ts'
// Re-exported, so a reader that already imports the message library asks the one rule through it.
export { messagesInTheViewOf } from './message-centre.ts'
import { messageEditWindowSeconds, theDoorRefusesAnAgentWithNoSessionAndNoRun } from './env.ts'
/**
 * HOW WIDE A READ OF THE POOL IS, re-exported so that a caller reaching for a conversation has the
 * two words beside the functions that take them. One declaration, in lib/workspaces.ts; this is a
 * name for it and not a second copy.
 */
export { EVERY_PROJECT, justThisProject, type WhichProjects }
import { type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { theAgentRecordsOf } from '../db/the-agent-records-of.ts'
import { theAgentsOfTheseAgentRecords } from '../db/the-agents-of-these-agent-records.ts'
import { theNamesWithThisIdOrHandle } from '../db/the-names-with-this-id-or-handle.ts'
import { theOwnRecordsOfTheAgentsHolding } from '../db/the-own-records-of-the-agents-holding.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { agentsWithTheseIds } from '../db/agents-with-these-ids.ts'
import { everyNameInTheRegistries } from '../db/every-name-in-the-registries.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { recordForAgentIn } from '../db/record-for-agent-in.ts'
import { recordsForAgentsIn } from '../db/records-for-agents-in.ts'
// THE LIVE HOLD A SESSION HOLDS, so a message addressed to a run reaches the agent that run is
// answering as. This is the reader `theAgentASessionAnswersAs` below is built on, and it is the one
// door onto `handle_holds` for resolving a recipient.
import { theLiveHoldOnSession } from './handles.ts'
// WHETHER THE OTHER SIDE CAN BE REACHED, criterion M110. lib/presence.ts already imports
// `hasWrittenTo` from THIS file, so this is the same safe cycle groups.ts/records.ts/messages.ts
// already run: a normal top-of-file import, used only inside a function body and never while this
// module is still being evaluated, exactly as that trio's own header documents.
import { GREY_PRESENCE_WORDS, participantPresence, theRedReasonFor, type GreyPresenceWord } from './presence.ts'
// WHAT A ROW WITH NO ROLE IS READ AS. One statement of that fact, in shared/roles.ts.
import { A_ROW_WITH_NO_ROLE_READS_AS, THE_OFFICE_ROLE } from '@shared/roles.ts'
import { readOrigin, type PanelRecord, type RecordOrigin } from '@shared/types.ts'
import { NOTHING_WAS_SENT, quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import { refFrom } from './message-pool-at-or-after.ts'
import { deliveriesOfMany } from './message-pool-at-or-after.ts'
import { aDeliveryOnTheWire } from './message-pool-at-or-after.ts'
import { theRecipientsOf } from './message-pool-at-or-after.ts'
import { itIsNotSentYet } from './message-pool-at-or-after.ts'
import { nobodyHasBeenHandedIt } from './message-pool-at-or-after.ts'
import { TALK_COLUMNS, talkEntriesOf } from './message-pool-at-or-after.ts'
import { theStoredKindsReadAs } from '../db/their-own-messages.ts'
import type { TheirOwnMessages, AMessageReader } from '../db/types/messages.ts'

/**
 * WHAT THE CONTACTS AND CONVERSATION LIBRARY NEEDS TO KNOW ABOUT ONE REGISTERED PARTICIPANT.
 *
 * Declared in `@shared/messages.ts` and named here as well, because three callers import it from
 * this file. It is one declaration re-exported and not a second one: a copy would be the defect
 * this repository keeps producing.
 */
export type { KnownParticipant, ParticipantRef }

// ============================================================================ reading one message

/** The columns every reader here needs off a record row. */
const MESSAGE_COLUMNS = {
  id: records.id,
  workspaceId: records.workspaceId,
  kind: records.kind,
  title: records.title,
  data: records.data,
  createdAt: records.createdAt,
} as const

export interface MessageRow {
  id: string
  workspaceId: string
  kind: string
  title: string
  data: unknown
  createdAt: string
}

export { refFrom } from './message-pool-at-or-after.ts'
export { refsOfRecipients }

/**
 * THE REGISTRY ROW AN ID NAMES, WHICHEVER OF THE TWO ID SPACES IT IS IN.
 *
 * ---------------------------------------------------------------------------------------
 * THERE ARE TWO, AND THIS ONLY KNEW ONE
 * ---------------------------------------------------------------------------------------
 *
 * A durable agent is written down twice: as a project record of kind `agent`, with a record id
 * like `HFuL81sQ_YaJ`, and as a row in the installation's `agents` registry, whose id is the
 * handle. `agent_records` joins them. A session says which durable agent it ran as in `ranAs`,
 * and what it stores there is the RECORD id.
 *
 * This looked in the registry by id and by handle, and a record id is neither. So every comment
 * addressed by picking a run came back null — addressed to nobody — and appeared in no
 * conversation. Measured on the live database on 4 September 2026: the person's comment written at 16:24 to the
 * POINTING agent stored a `chosenRecipient` naming session
 * `sb5lkfnwYiux`, whose `ranAs` names record `HFuL81sQ_YaJ`, whose registry row has an id of its
 * own, made from the date and the run's title. The record id matched neither column and the
 * message was stored with no `to` at all, and after send it did not appear in the conversation with
 * the agent it was pointed at. Problem `HtITS-9Xk_Vk`, criterion M16.
 *
 * IT IS STILL NULL WHEN NOTHING ANSWERS. A record with no registry row and a handle nobody holds
 * both come back null, and the comment is then addressed to nobody, which is the truth about it.
 */
function theAgentAnIdNames(id: string, identityOf?: TheIdentityOf): ParticipantRef | null {
  const mapped = identityOf?.agentRecord === undefined ? agentForRecord(id) : identityOf.agentRecord(id)
  if (mapped !== null) return { kind: 'agent', id: mapped.id }
  // Only the id is used, and an identity read once is an agents row's own, so its row is not read again.
  const named = identityOf === undefined ? theAgentAStoredReferenceNames(id) : theIdentityAStoredReferenceNames(id, identityOf)
  return named === null ? null : { kind: 'agent', id: named.id }
}

/**
 * THE REGISTRY ROW ONE STORED REFERENCE NAMES, the one reading this file's stored references use.
 *
 * A STORED reference was written earlier and is read back now: a handle hold's agent id, a run's
 * `ranAs`, a session's `servingAgent`, a message's `sentBy`, a contact row's id. It is NEVER
 * resolved by the arriving-reference resolver, which raises a 409 when one string means two
 * agents. It is read by EXACT ID first, and that settles it alone because an id is never reused;
 * failing that, the ONE agent bearing the string as a handle, live or retired; and NO agent where
 * more than one answers, so a record stays readable rather than breaking the page it is on.
 *
 * `everyAgentAStoredStampCouldName` in lib/records.ts is that reading, built on the readers of
 * lib/agent-references.ts (`theAgentWithThisId`, `everyAgentAReferenceCouldName`). This gives it
 * back as a registry row, which is what a caller here needs. The old line here was
 * `SELECT id FROM agents WHERE id = ? OR handle = ?`: one statement with no ordering, so the
 * wrong agent answered silently the day one string became one agent's id and another's name.
 */
function theAgentAStoredReferenceNames(stored: string): RegisteredAgent | null {
  const named = theIdentityAStoredReferenceNames(stored)
  return named === null ? null : readParticipant({ kind: 'agent', id: named.id }) as RegisteredAgent | null
}

/** The identity of the one agent a stored reference names, read from the spellings read once where they are handed in. */
function theIdentityAStoredReferenceNames(stored: string, identityOf?: TheIdentityOf): AgentIdentity | null {
  const named = everyAgentAStoredStampCouldName(stored, identityOf)
  return named.length === 1 ? named[0]! : null
}

/**
 * THE DURABLE AGENT A RUN ANSWERS AS, worked out in one place.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE FUNCTION AND NOT THREE READINGS
 * ---------------------------------------------------------------------------------------
 *
 * A message addressed to a SESSION has to reach that session, and the session is not an address
 * the message pool can use: a delivery row names a durable agent. Three facts on the record could
 * say which agent that is, and until 12 September 2026 three different readers each knew a
 * different one — the message pool read `ranAs`, the door minted a new agent from the run's TITLE
 * when it found none, and the worker wrote `servingAgent`. So a run holding the secretary's handle was
 * sent to an invented agent named after the run's title, and the message never
 * reached the terminal that was answering the whole time. Problem `1QVV5_tLP4ee`.
 *
 * THE ORDER IS THE WHOLE FIX, and it is the order of how directly the fact is held:
 *
 *   1. THE HANDLE THE SESSION HOLDS NOW. `handle_holds` is a live claim written by the session
 *      itself, so it is the strongest statement of which agent is answering. It is read first.
 *   2. THE AGENT RECORD THE SESSION NAMES. `ranAs` is the durable binding a door or the migration
 *      wrote, per project, and it is a record id.
 *   3. THE AGENT THE WORKER WROTE ON THE RUN. `servingAgent` is the registry id the message worker
 *      stamped when it started the run to answer a message.
 *
 * NULL IS THE HONEST ANSWER WHEN NONE OF THE THREE IS THERE, and the caller decides what to do
 * with it.
 *
 * A FOURTH FACT ADDED HERE IS ADDED TO `theRunsWhoseTranscriptThisReaderMayRead` TOO, which asks this
 * function only about the runs one of these three facts ties to the reader. The message door refuses the write; the message pool addresses the comment to nobody.
 * Nothing here invents an agent from a title, which is exactly what the defect was.
 */
export function theAgentASessionAnswersAs(
  session: Pick<PanelRecord, 'id' | 'data' | 'workspaceId'>,
  workspaceId: string,
): { agent: ParticipantRef; record: string | null } | null {
  const found = theWayASessionAnswers(session, workspaceId)
  if (found === null) return null
  // THE AGENT'S RECORD IN THIS PROJECT: the one `ranAs` named, or else the agent's own record here.
  return { agent: found.agent, record: found.ranAs ?? recordForAgentIn(found.agent.id, workspaceId) }
}

/**
 * THE AGENT ALONE, by the rule above, for a caller that does not need the agent's record. Reading the
 * record is most of the cost of the rule, and a caller asking about hundreds of runs at once pays it for
 * every one (`theRunsWhoseTranscriptThisReaderMayRead`).
 */
export function theAgentOnlyASessionAnswersAs(session: Pick<PanelRecord, 'id' | 'data' | 'workspaceId'>, workspaceId: string, lookups?: TheSessionLookups): ParticipantRef | null {
  return theWayASessionAnswers(session, workspaceId, lookups)?.agent ?? null
}

/**
 * THE TWO READS OF THE RULE ABOVE, handed in by a caller that asks it about many runs in one request. Each answers
 * what the one-row reader it stands for answers, so the order of the rule stays here and only its reads are swapped.
 */
export interface TheSessionLookups {
  /** What `theLiveHoldOnSession` answers for this session. */
  liveHoldOn: (sessionRecordId: string) => ReturnType<typeof theLiveHoldOnSession>
  /** The agents, their aliases and their records read once, which `theAgentAnIdNames` reads in place of its own. */
  identityOf: TheIdentityOf
}

/** The three steps of `theAgentASessionAnswersAs`, with the `ranAs` record when step 2 is the one that answered. */
function theWayASessionAnswers(
  session: Pick<PanelRecord, 'id' | 'data' | 'workspaceId'>,
  workspaceId: string,
  lookups?: TheSessionLookups,
): { agent: ParticipantRef; ranAs: string | null } | null {
  const anIdNames = (id: string) => theAgentAnIdNames(id, lookups?.identityOf)
  // 1. THE HANDLE THE SESSION HOLDS NOW.
  const held = (lookups?.liveHoldOn ?? theLiveHoldOnSession)(session.id)
  if (held !== null) {
    const registry = anIdNames(held.agent.id)
    if (registry !== null) return { agent: registry, ranAs: null }
  }
  // 2. THE AGENT RECORD THE SESSION NAMES.
  const named = ranAsIn(session, workspaceId)
  if (named !== null) {
    const registry = anIdNames(named)
    if (registry !== null) return { agent: registry, ranAs: named }
  }
  // 3. THE AGENT THE WORKER WROTE AS `servingAgent`.
  const serving = session.data['servingAgent']
  if (typeof serving === 'string' && serving !== '') {
    const registry = anIdNames(serving)
    if (registry !== null) return { agent: registry, ranAs: null }
  }
  return null
}

/**
 * EVERY AGENT A SESSION'S OWN DATA NAMES: each `ranAs` entry, `servingAgent` and `servingAgentId`. Who may
 * file a session for an agent (`whyThisCallerMayNotFileASessionFor` in lib/records/may-write.ts) asks this, so a write
 * cannot slip past it by carrying only one of the three.
 *
 * Each value is read with `theAgentAnIdNames`, the reader `theWayASessionAnswers` uses for `ranAs` and
 * `servingAgent`: an exact id first, then the one agent bearing the string as a handle. `servingAgentId` is read
 * the same way, so an id finds its agent here as it does in `theAgentARunServes`. Every `ranAs` entry is read,
 * whatever project it names, because a write may carry more than one. A value that names no registered agent
 * adds nobody, because there is no agent for the office to act on. Each agent is listed once.
 */
export function everyAgentASessionsDataNames(data: unknown): ParticipantRef[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return []
  const held = data as Record<string, unknown>
  const said: string[] = []
  const ranAs = held['ranAs']
  if (Array.isArray(ranAs)) {
    for (const entry of ranAs) {
      if (typeof entry !== 'object' || entry === null) continue
      const agentId = (entry as Record<string, unknown>)['agentId']
      if (typeof agentId === 'string' && agentId !== '') said.push(agentId)
    }
  }
  for (const field of ['servingAgent', 'servingAgentId']) {
    const value = held[field]
    if (typeof value === 'string' && value !== '') said.push(value)
  }
  const named: ParticipantRef[] = []
  for (const one of said) {
    const agent = theAgentAnIdNames(one)
    if (agent !== null && !named.some((already) => already.id === agent.id)) named.push(agent)
  }
  return named
}

/**
 * THE DURABLE AGENT A COMPOSER'S CHOICE NAMES, or null because it names none.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The comment composer picks a RUN — a session record — or asks for a fresh one. The message pool
 * addresses a PARTICIPANT. Nothing joined the two, so a comment written to an agent was stored with
 * no recipient at all; the start-up backfill then gave it one delivery row addressed to the owner,
 * and it was never in the conversation with the agent it was written to, and nothing answered it.
 * Criterion M16, problem
 * `Kyr3b1hr3jjR`.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS THE MIDDLE LAYER OF THE EIGHTH RULE AND IT IS KEPT VISIBLE
 * ---------------------------------------------------------------------------------------
 *
 * What the person chose is stored as they chose it, in `chosenRecipient`. What Mole Office made of it is stored
 * beside it, in `to`. Neither replaces the other, so a reader can always see that a message
 * addressed to an agent was addressed there because a run of that agent was picked.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER GUESSES, AND NULL IS A REAL ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * A choice of a NEW agent names no agent that exists yet, and a choice nobody could settle names
 * none either. Both come back null and the comment is then addressed to nobody, which is the truth
 * about it. Nothing here reaches for the owner: a comment addressed to the owner because it could not be
 * addressed to anybody else is the fabrication this criterion is about.
 *
 * A CHOICE THAT NAMES A SESSION IS PUT TO `theAgentASessionAnswersAs`, so the address is the agent
 * the session holds or the agent it names, never a slug of the session's title.
 */
export function theAgentAChoiceNames(chosen: unknown, workspaceId: string): ParticipantRef | null {
  if (chosen === null || typeof chosen !== 'object' || Array.isArray(chosen)) return null
  const said = chosen as Record<string, unknown>
  // A DURABLE AGENT NAMED OUTRIGHT. Nothing in the browser produces this yet; the door has always
  // accepted it and a choice that names one is taken at its word.
  if (said['kind'] === 'agent') {
    const id = said['agentId']
    return typeof id === 'string' && id !== '' ? theAgentAnIdNames(id) : null
  }
  if (said['kind'] !== 'session') return null
  const sessionId = said['sessionId']
  if (typeof sessionId !== 'string' || sessionId === '') return null
  // A MESSAGE KEPT IN THE MESSAGE CENTRE belongs to no project, while the session it names is in
  // one: asked from the message centre, the session is found wherever it is filed and read in its own project.
  const row = db
    .select({ id: records.id, data: records.data, kind: records.kind, workspaceId: records.workspaceId })
    .from(records)
    .where(workspaceId === MESSAGE_CENTRE ? eq(records.id, sessionId) : and(eq(records.id, sessionId), eq(records.workspaceId, workspaceId)))
    .get() as { id: string; data: unknown; kind: string; workspaceId: string } | undefined
  if (row === undefined || row.kind !== 'session') return null
  const data = typeof row.data === 'string' ? (JSON.parse(row.data) as Record<string, unknown>) : row.data
  if (data === null || typeof data !== 'object') return null
  const answered = theAgentASessionAnswersAs(
    { id: row.id, data: data as Record<string, unknown>, workspaceId: row.workspaceId },
    row.workspaceId,
  )
  return answered === null ? null : answered.agent
}

/**
 * ONE DELIVERY MARK, SAID IN THE SIX WORDS A COMMENT'S STATE IS SAID IN.
 *
 * Two vocabularies say how far one set of words got. `message_delivery.mark` has four words and is
 * about one recipient; `agent_messages.state` has six and is about the whole send. Only the two marks
 * that say somebody read the words are said here (`aMarkSaysItWasRead`). `delivered` is the same word
 * in both, and `seen` is the recipient saying they read it themselves, which the six words call
 * `picked_up`. `queued` and `archived` both say nobody read it, so neither is a step a send has made.
 *
 * IT IS NOT A TABLE OF THE SIX WORDS, on purpose. A second list of them, however right today, is
 * the defect `tests/one-table-of-readings.test.ts` exists to catch. Another delivery mark that says
 * somebody read it still fails to compile here, because a word the six do not hold is not a `MessageState`.
 */
function inTheSixWords(mark: 'delivered' | 'seen'): MessageState {
  if (mark === 'seen') return 'picked_up'
  return mark
}

/**
 * WHICH OF THESE COMMENTS HAS SOMETHING ALREADY BEEN HANDED, read from the delivery rows.
 *
 * A comment with a delivery row past `queued` has reached whoever it is addressed to: a live
 * session answering as that agent took it, or the worker started a run for it. That can happen
 * before the review holding the comment is ever sent, and it is written in `message_delivery`
 * rather than in `agent_messages`.
 *
 * ONE READER, FOR THE SCREEN AND FOR THE REPLY. The Organise screen used to work this out from
 * whether a review had carried the words out, and the sentence after the press worked it out from
 * these rows, so the screen said "This goes to the run …" about a comment the reply then called
 * already gone. Problem `-4GypldN_XMS`. Both ask this function now, so they cannot disagree.
 *
 * A comment nobody has been handed is absent from the map rather than present with `queued`,
 * because the question is which ones have gone.
 */
export function alreadyHandedOver(recordIds: readonly string[]): Map<string, MessageState> {
  // IN PIECES (src/server/db/in-pieces.ts): a review carries every comment in it, and nothing caps that.
  const rows = readInPieces(recordIds, (piece) =>
    db
      .select({ messageId: messageDelivery.messageId, mark: messageDelivery.mark })
      .from(messageDelivery)
      .where(and(inArray(messageDelivery.messageId, piece), sql`${messageDelivery.mark} <> 'queued'`))
      .all(),
  )

  // THE FURTHEST MARK WINS, because a comment addressed to two recipients has a row each and its
  // words have gone as far as the one that got furthest. The comparison is done in the delivery
  // vocabulary and translated once, at the end, so there is one translation and no ranking of the
  // six words alongside the ranking of the four.
  const furthest = new Map<string, 'delivered' | 'seen'>()
  for (const row of rows) {
    // A MARK NO TABLE KNOWS IS NOT READ AS PROGRESS. `deliveriesOf` reads an unknown mark as
    // `queued`, and this skips it, which is the same answer: nobody can say these words reached
    // anybody on the strength of a word Mole Office cannot read. AN ARCHIVED ROW IS SKIPPED TOO,
    // because nobody read it.
    if (!isDeliveryMark(row.mark) || !aMarkSaysItWasRead(row.mark)) continue
    const held = furthest.get(row.messageId)
    if (held === undefined || DELIVERY_MARKS.indexOf(row.mark) > DELIVERY_MARKS.indexOf(held)) {
      furthest.set(row.messageId, row.mark)
    }
  }

  const handed = new Map<string, MessageState>()
  for (const [id, mark] of furthest) handed.set(id, inTheSixWords(mark))
  return handed
}

/** The delivery rows of one message, in the order they were written. */
export function deliveriesOf(messageId: string): DeliveryOnTheWire[] {
  const rows = db
    .select()
    .from(messageDelivery)
    .where(eq(messageDelivery.messageId, messageId))
    .orderBy(messageDelivery.at, messageDelivery.id)
    .all()
  return rows.map(aDeliveryOnTheWire)
}

export { aDeliveryOnTheWire } from './message-pool-at-or-after.ts'

export { deliveriesOfMany } from './message-pool-at-or-after.ts'

export { theRecipientOf } from '../db/their-own-messages.ts'

export { theStoredKindsReadAs } from '../db/their-own-messages.ts'

export { nobodyHasBeenHandedIt } from './message-pool-at-or-after.ts'

export { sentWhenWritten } from './message-pool-at-or-after.ts'

/**
 * WHETHER A MESSAGE HAS GONE OUT: the question the edit window and the kind lock ask, on problem
 * FTSKBGVWL_Q8. Writing a message to somebody is sending it, so every message but a comment has
 * gone out. A comment has gone out when it was sent as it was written, or once anybody has been handed its words. That
 * is `notSentYet` below read for one record, by the same `itIsNotSentYet`, so the pool's *Not sent yet* and this
 * cannot disagree.
 */
export function aMessageHasGoneOut(record: { id: string; kind: string; data: unknown; workspaceId: string }): boolean {
  const data = (typeof record.data === 'object' && record.data !== null && !Array.isArray(record.data) ? record.data : {}) as Record<string, unknown>
  if (targetOfRecord({ kind: record.kind, data }) === null) return true
  const carried = hasGoneOut(record.id, record.workspaceId) ? new Set([record.id]) : new Set<string>()
  return !itIsNotSentYet(record, data, deliveriesOf(record.id), carried)
}

/**
 * THE RUNG THE WRITER HOLDS AND THE STARTER THIS MESSAGE WENT ROUND. Criteria P6 and P7.
 *
 * BOTH ARE READ AND NEITHER IS STORED. The role is read off the registry at the moment the message
 * is read, so a message from an agent whose rung changed says what that agent is now. A stored copy
 * would be the same fact in two places and the older one would be on the screen.
 *
 * WENT ROUND MEANS SOMETHING NARROW. The writer has a starter recorded, the message is addressed to
 * a person, and that starter is not also addressed. A report that went to the starter as well went
 * round nobody. Nothing is refused either way: the person's answer 1 allows any registered agent to write to
 * them, and this is the mark rather than a gate.
 */
function theRungAndTheChain(
  sentBy: ParticipantRef | null,
  to: readonly ParticipantRef[],
  sentAt: string,
  said: WhatTheProjectSays,
  officeTest: (who: ParticipantRef) => boolean,
): { sentByRole: string | null; wentRoundItsStarter: ParticipantRef | null } {
  if (sentBy === null || sentBy.kind !== 'agent') return { sentByRole: null, wentRoundItsStarter: null }
  // A MESSAGE THE OFFICE ITSELF SENT SAYS ITS ROLE IS THE OFFICE, at item 6, on problem UJSKqVr6GK96. Its
  // sender row holds no card, and a row with no card would read as the worker card.
  if (officeTest(sentBy)) return { sentByRole: THE_OFFICE_ROLE, wentRoundItsStarter: null }
  // `sentBy` is a STORED reference off the message's own `data`, so it is read the stored way and
  // never through the arriving-reference resolver: `sentBy.id` may be a handle written before the
  // mint or a registry id written after it, and a name two agents could answer means no agent.
  const row = theSenderThisReadLookedUp(sentBy.id, said)
  if (row === null) return { sentByRole: null, wentRoundItsStarter: null }
  // Applied time, not request time: a waiting change has not changed the starter yet.
  let changes = said.starterHistory.get(row.id)
  if (changes === undefined) {
    changes = sqlite.prepare("SELECT from_kind, from_id, to_kind, to_id, applied_at FROM agent_starter_changes WHERE agent_id = ? AND state = 'applied' ORDER BY applied_at, rowid").all(row.id) as StarterHistoryRow[]
    said.starterHistory.set(row.id, changes)
  }
  const ambiguous = changes.some((change) => change.applied_at === sentAt)
  const next = changes.find((change) => change.applied_at > sentAt)
  const last = changes.filter((change) => change.applied_at <= sentAt).at(-1)
  const starter: ParticipantRef | null = next !== undefined
    ? next.from_kind === null || next.from_id === null ? null : { kind: next.from_kind, id: next.from_id }
    : last !== undefined ? { kind: last.to_kind, id: last.to_id } : row.startedBy
  const toAPerson = to.some((one) => one.kind === 'person')
  const starterWasTold =
    starter !== null && to.some((one) => one.kind === starter.kind && one.id === starter.id)
  return {
    sentByRole: row.role ?? A_ROW_WITH_NO_ROLE_READS_AS,
    wentRoundItsStarter: !ambiguous && starter !== null && toAPerson && !starterWasTold ? starter : null,
  }
}

/**
 * BUILD THE SENDER'S FLAGS ONCE FOR THIS READ, from their own row. A message's mark and label take their instructions
 * from here, so a list of a thousand messages from one person reads that person's row once. A sender who is not a
 * person, or whose row no longer answers, gets null: no instruction is handed over rather than a default invented here.
 */
function theSendersFlagsThisRead(sentBy: ParticipantRef | null, said: WhatTheProjectSays): TheFlagsOfAPerson | null {
  if (sentBy === null || sentBy.kind !== 'person') return null
  const known = said.flags.get(sentBy.id)
  if (known !== undefined) return known
  const row = readParticipant(sentBy)
  const flags = row !== null && 'chatLabels' in row ? theFlagsOf(row.shippedFlags, row.chatLabels) : null
  said.flags.set(sentBy.id, flags)
  return flags
}

/**
 * THE REGISTRY ROW A MESSAGE'S STORED SENDER NAMES, looked up once per read and not once per message.
 *
 * A read builds thousands of messages from a few hundred senders. Looking each sender up again for
 * every message it wrote was most of the time the chat doors took: 10.6 of 11.4 seconds spent
 * building messages, in a CPU profile of the person's own pattern on 25 September 2026 (problem
 * `zo_hyUBLSAVJ`). So the first message from a sender looks it up with
 * `theAgentAStoredReferenceNames`, which is the one stored-reference rule, and every later message
 * with the same stored string reuses that answer. A sender stored by its exact id is already in the
 * map when the read begins (`theSendersStoredByTheirIds`), read with every other such sender at once.
 *
 * THE ANSWER IS KEPT BY THE EXACT STRING THE MESSAGE STORED, and "no agent" is kept too, so a name
 * two agents answer to is not looked up again either. It lives on `said`, which one read builds and
 * then drops, so it never outlives the request that made it. The lookup writes nothing, and the read
 * builds its messages in one pass with no pause for another request. So every message from one
 * sender gets the answer the registry gave at that sender's first message in this read. If another
 * process changed the registry during the pass, the next read shows the change.
 */
function theSenderThisReadLookedUp(stored: string, said: WhatTheProjectSays): RegisteredAgent | null {
  const known = said.senders.get(stored)
  if (known !== undefined) return known
  const row = theAgentAStoredReferenceNames(stored)
  said.senders.set(stored, row)
  return row
}

/**
 * WHO THE WRITER ADDRESSED, CARRIED BESIDE THE WIRE SHAPE.
 *
 * A wire entry's `to` is its delivery rows, and the routing writes one more row for every copy it
 * makes (decision `J1Qge4JH87bv` point 12). So `to` is not the writer's addressee list. Decision
 * `-itqp2gPiHHe` says which conversation a message is in is read from what the writer addressed, so
 * `thePartiesOfEveryPair` below needs that list. It is worked out once here, where the stored `data`
 * is, by the one function that states the rule. A symbol keeps it off the JSON the API serves, and no
 * screen asks for it.
 */
const THE_WRITER_ADDRESSED = Symbol('the writer addressed')

/** An entry, whole or as the sort into conversations reads it, that also carries who its writer addressed, on the server only. */
type EntryWithTheWriterAddressed = Pick<MessageOnTheWire, 'to'> & {
  [THE_WRITER_ADDRESSED]?: readonly ParticipantRef[]
}

/**
 * A MESSAGE AS THE SORT INTO CONVERSATIONS READS IT (round 49 of wave 13y): the fields `theConversationsOfOnePool` asks,
 * and nothing else. Its body is null when its words were not read, never an empty body, which would say the message had
 * no words. A whole pool's entry is one of these with its words.
 */
export type AMessageToSort = Pick<MessageOnTheWire, 'id' | 'sentBy' | 'from' | 'to' | 'toGroup' | 'aboutMessage'> & { body: string | null }

/**
 * THE FIELDS OF ONE ROW THAT THE SORT INTO CONVERSATIONS READS, made here and nowhere else (invariant 9). `asMessage`
 * places them in the whole entry, the queue's read builds nothing more (`everyMessageOfTheProjectsForTheQueue`), and
 * the contact read places all of them but the body in its narrow entry (`contactEntriesOf`). So no two of them can come
 * to read one row two ways. `routed` is `routedOf(data)`, which `asMessage` also hands over whole.
 */
function theFieldsTheSortReads(
  row: Pick<MessageRow, 'id' | 'workspaceId'>,
  data: Record<string, unknown>,
  deliveries: readonly DeliveryOnTheWire[],
  routed: readonly RoutedAddressee[],
): AMessageToSort & { body: string } {
  const from = data['from']
  const fields: AMessageToSort & { body: string } = {
    id: row.id,
    sentBy: refFrom(data['sentBy']),
    from: typeof from === 'string' && from.trim() !== '' ? from : null,
    // WHO IT IS TO COMES OFF THE DELIVERY ROWS AND NOT OFF THE FIELD, so a reader is told what the
    // marks are actually about. The two are written together and a test fails when they differ; if
    // one ever did drift, this is the half that can be acted on.
    to: theRecipientsOf(deliveries),
    toGroup: typeof data['toGroup'] === 'string' && data['toGroup'] !== '' ? data['toGroup'] : null,
    // WHICH MESSAGE A NOTICE IS ABOUT, criterion M128, or null because it is about no one message. It
    // is what `isBetween` below reads to draw the notice in the conversation it is about.
    aboutMessage: typeof data['aboutMessage'] === 'string' && data['aboutMessage'] !== '' ? data['aboutMessage'] : null,
    body: typeof data['body'] === 'string' ? data['body'] : '',
  }
  // ONLY A ROUTED MESSAGE NEEDS THE WRITER'S OWN LIST. Every other entry's `to` already is that
  // list, so nothing is worked out and no reading is done for them. The routing never touches a
  // group message, so a routed entry is never a group.
  if (routed.length > 0) {
    ;(fields as EntryWithTheWriterAddressed)[THE_WRITER_ADDRESSED] = whoTheWriterAddressed(data, row.workspaceId)
  }
  return fields
}

/**
 * THE PROJECT A MESSAGE IS MARKED ABOUT, or null because it is marked about none. The whole entry (`asMessage`) and the
 * contact read's narrow entry (`contactEntriesOf`) both read it here, so the two cannot read one row two ways.
 */
function aboutProjectOf(data: Record<string, unknown>): string | null {
  return typeof data['aboutProject'] === 'string' && data['aboutProject'] !== '' ? data['aboutProject'] : null
}

export { theRecipientsOf } from './message-pool-at-or-after.ts'

export { itIsNotSentYet } from './message-pool-at-or-after.ts'

/**
 * THE MOMENT A MESSAGE WAS WRITTEN, as milliseconds, or null when nobody can tell, with the stored words it was read
 * from. The one reading that both the message's `wordsMayChangeUntil` and the record door's edit window
 * (`whatAChangeToAMessageMustCarry` in ./records/patching.ts) ask, so the two cannot disagree.
 *
 * The stamp is read with the moment the record door kept beside it (`data.writtenTime`), by the rule of
 * `momentOfAStampAndItsInstant` in src/shared/time.ts. On the night the clocks go back the stamp alone reads the second
 * pass of the hour from 01:00 as the first, so a message written at 01:10 winter time could be changed until an hour
 * before it was written. A moment that names its stamp and cannot be read is null, as a stamp that cannot be read is. A
 * message written before the door kept its moment, or whose stamp was changed alone, is read from its stamp, as before,
 * and its stamp is the words it was read from.
 */
export function theMomentAMessageWasWritten(createdAt: string, data: unknown): { ms: number | null; readFrom: unknown } {
  const instant = data !== null && typeof data === 'object' ? ((data as Record<string, unknown>)['writtenTime'] as { instant?: unknown } | null | undefined)?.instant : undefined
  return { ms: momentOfAStampAndItsInstant(createdAt, instant, parseStoredStamp), readFrom: anInstantNamesItsStamp(createdAt, instant) ? instant : createdAt }
}

/**
 * UNTIL WHEN A MESSAGE'S WRITER MAY CHANGE ITS WORDS: the time it was written and the edit window, the two facts the
 * record door asks (`whatAChangeToAMessageMustCarry` in ./records.ts). Asked only of a message that has gone out; a
 * comment nobody has been handed has no window, and `asMessage` sends null for it. Null here when nobody may: Mole Office's lines are
 * changed by nobody, a writer nobody could name has nobody to ask, and a stored time Mole Office did not write cannot
 * be added to. AN ISO TIME WITH ITS ZONE, not the stored stamp form, so a browser on another computer in another zone
 * reads the same moment. When it was written is read by `theMomentAMessageWasWritten`.
 */
function theWordsMayChangeUntil(
  createdAt: string,
  data: unknown,
  sentBy: ParticipantRef | null,
  editWindowSeconds: number,
  officeTest: (who: ParticipantRef) => boolean,
): string | null {
  if (sentBy === null || officeTest(sentBy)) return null
  const written = theMomentAMessageWasWritten(createdAt, data).ms
  if (written === null) return null
  return new Date(written + editWindowSeconds * 1000).toISOString()
}

/** One row plus its delivery rows, as everything reads it. */
function asMessage(
  row: MessageRow,
  deliveries: readonly DeliveryOnTheWire[],
  said: WhatTheProjectSays,
  officeTest: (who: ParticipantRef) => boolean = isMoleOffice,
): MessageOnTheWire {
  const data = (row.data ?? {}) as Record<string, unknown>
  const routed = routedOf(data)
  // THE FIELDS THE SORT INTO CONVERSATIONS READS, made by the one builder the queue's read uses too. They are placed
  // below one by one, so the entry's keys keep their order.
  const sorted = theFieldsTheSortReads(row, data, deliveries, routed)
  // THE WRITER, READ ONCE: three fields below are made from it, and this runs for every message of a pool.
  const sentBy = sorted.sentBy
  // THE SENDER'S FLAGS, read once per read and not once per message. The mark and the label take their instructions
  // from here, so a list of a thousand messages from one person reads that person's row once.
  const flags = theSendersFlagsThisRead(sentBy, said)
  // WHETHER ANYBODY HAS BEEN HANDED THESE WORDS YET, read once: the edit window below is asked only of words that went out.
  const notSentYet = itIsNotSentYet(row, data, deliveries, said.goneOut)
  const message: MessageOnTheWire = {
    id: sorted.id,
    workspaceId: row.workspaceId,
    sentBy,
    from: sorted.from,
    to: sorted.to,
    ...theRungAndTheChain(sentBy, sorted.to, row.createdAt, said, officeTest),
    toGroup: sorted.toGroup,
    // A GROUP LINE MOLE OFFICE DELIVERED TO SOME MEMBERS ONLY, or to none (problem 0WUuvB0IhRfb).
    ...(Array.isArray(data['deliveredOnlyTo']) ? { deliveredOnlyTo: refsOfRecipients(data['deliveredOnlyTo']) } : {}),
    // WHAT A DEAD-LETTER SWEEP DID, as facts, so a page says its line in the page's language. Null on every other line.
    deadLetterSweepSaid: theSweepFactsOf(data),
    // WHICH LETTERS FOR RETIRED AGENTS A SWEEP TOLD ONE RECEIVER ABOUT, as facts. Null on every other message.
    deadLetterSummarySaid: theSummaryFactsOf(data),
    aboutRun: typeof data['aboutRun'] === 'string' && data['aboutRun'] !== '' ? data['aboutRun'] : null,
    aboutMessage: sorted.aboutMessage,
    // WHO MADE THE OFFER IT CARRIES: its writer, or for a line Remind me later brought back, the first sender.
    offerMadeBy: whoMadeTheOffer(data, sentBy),
    // THE LINE THIS ONE IS FOLDED INTO, or null. Only the office writes it; the group draws the fold from it.
    foldedInto: typeof data['foldedInto'] === 'string' && data['foldedInto'] !== '' ? data['foldedInto'] : null,
    body: sorted.body,
    title: row.title,
    sentAt: row.createdAt,
    target: data['target'] ?? null,
    // WHAT IT QUOTES ABOVE ITS WORDS, through the one reader.
    quotes: quotesOf({ kind: row.kind, data }),
    quotePositions: quotePositionsOf({ kind: row.kind, data }),
    lead: leadOfRecord({ kind: row.kind, data }),
    // WHETHER ANYBODY HAS BEEN HANDED THESE WORDS YET. A comment only; writing a message is
    // sending it. Criterion M28.
    notSentYet,
    // THE WHOLE SENTENCE BEHIND A LINE MOLE OFFICE WROTE, criterion M34, or null because there is
    // nothing more to say than the few words in the body. Only such a line ever carries it.
    saidInFull: typeof data['saidInFull'] === 'string' && data['saidInFull'] !== '' ? data['saidInFull'] : null,
    // WHICH OF MOLE OFFICE'S OWN LINES THIS IS, by its name in `SYSTEM_LINES`, or null because a
    // person or an agent wrote it. A stored kind that has left the table is handed over as it is.
    notice: typeof data['notice'] === 'string' && data['notice'] !== '' ? data['notice'] : null,
    // WHICH TOOL RAN THE RUN THESE WORDS CAME OUT OF. Read from the run this message names, through
    // the reading the whole page took once, so no screen needs a second request per message.
    ranBy: ranBy(data, said),
    // WHERE IT WAS WRITTEN FROM, criterion M63, or null because nobody recorded it. Read through the
    // one shared reader, so the server and the browser cannot come to disagree about what an absent
    // field means.
    writtenFrom: writtenFromOf(data),
    // WHERE IT WAS WRITTEN, AND THE PROJECT IT IS ABOUT, through the one shared reader.
    writtenIn: writtenInOf(data),
    aboutProject: aboutProjectOf(data),
    // SENT AS AN EMERGENCY, and the one viewer it was narrowed to. Criterion M62.
    urgent: isUrgent(data),
    onlyOn: onlyOnOf(data),
    // WHETHER THE WRITER SAID IT ASKS THE PERSON SOMETHING: true, false, or null because nobody said.
    // Read through the one shared reader, so an absent field is never drawn as false.
    asksThePerson: asksThePersonOf(data),
    // WHAT THE PERSON WANTS BACK, the mark and the person's instruction for it, from the sender's flags this read
    // read once. A message with no mark gains neither field.
    ...theIntentOnTheWire(data, flags),
    // THE PERSON'S OWN LABEL, its word and colour, and the person's instruction for that flag when it has one, through
    // the one reader and the sender's flags this read already read. A message with no label gains no field.
    ...theLabelOnTheWire(data, whatTheLabelAsks(labelOf(data), flags)),
    // THE RUNS OF THE WORDS THE PERSON MARKED, each with its flag's name and the instruction this read handed over, or
    // no field at all when the message carries none. A message with parts gains the person's name for "No mark" too,
    // for the line that says which words carry no flag.
    ...theMarkedPartsOnTheWire(data, flags),
    // THE BROWSER'S OWN ID FOR THE PRESS, handed back as it was stored, or null. Problem
    // KzLydNEm4HYX: the chat finds its own letter by it after an answer was lost.
    sendId: typeof data['sendId'] === 'string' && data['sendId'] !== '' ? data['sendId'] : null,
    // WHETHER ITS WORDS WERE CHANGED, AND UNTIL WHEN THEY STILL MAY BE, at point 2.
    edited: editedOf(data),
    wordsMayChangeUntil: notSentYet ? null : theWordsMayChangeUntil(row.createdAt, data, sentBy, said.editWindowSeconds, officeTest),
    // THE PICTURES IT CARRIES, criterion M64, or an empty list because it carries none. Read through
    // the one shared reader, for the reason `writtenFrom` above is: the server and the browser
    // cannot come to disagree about what a stored row holds.
    pictures: picturesOf(data),
    deliveries,
    // WHO COULD NOT BE REACHED AND WHO GOT THE WORDS INSTEAD. The addressee
    // is still in `to`; this is the office's own record of the copy it also made. Empty on every
    // message nobody had to route.
    routed,
    // WHERE THE PRESS TO START A NEW AGENT CARRIED IT, as the facts it stored. Problem hqbovBMnTu-z.
    carriedTo: carriedToOf(data),
  }
  // WHO THE WRITER ADDRESSED, carried beside the wire shape when the builder above worked it out.
  const addressed = (sorted as EntryWithTheWriterAddressed)[THE_WRITER_ADDRESSED]
  if (addressed !== undefined) (message as EntryWithTheWriterAddressed)[THE_WRITER_ADDRESSED] = addressed
  return message
}

/** One message, or a refusal naming what the id turned out to be. */
export function readMessage(id: string, _workspaceId?: string): MessageOnTheWire {
  // A MESSAGE BELONGS TO NO PROJECT, so it is read from any: the project a request names is not
  // part of the question. Who may read it is the reader rule, which every door asks first.
  return readMessageWhereverItIs(id).message
}

/**
 * ONE MESSAGE AND WHICH PROJECT IT IS IN, WITHOUT ASKING WHICH PROJECT THE CALLER STANDS IN.
 *
 * Criterion M76, on the person's finding of 7 September 2026 at 15:10. Three messages they wrote from their
 * other machine were filed in one project; the waiter answering for the agent they were addressed
 * to had been started in a different one. All three showed a clock for ever and the reply to them
 * was filed on the wrong side of the boundary, because `readMessage` refused every one of them by
 * project before any mark could be written, and the browser could not mark them read either.
 *
 * A DELIVERY MARK AND A READ MARK ARE NOT ABOUT A PROJECT. They are about one message and one
 * recipient — `message_delivery` has no project column at all, and never has — so the project of
 * whoever is asking cannot be part of the question. The person's chat covers every project, and the
 * waiter is a session answering as an agent rather than a reader standing somewhere.
 *
 * EVERY OTHER READER STILL GOES THROUGH `readMessage` ABOVE and is still refused by project, which
 * is right: a page asking about a project should not be answered about another one. This is the
 * narrow door for the acts where the project is not part of the fact, and each caller says so.
 */
export function readMessageWhereverItIs(id: string): { message: MessageOnTheWire; inProject: string } {
  const row = db
    .select(MESSAGE_COLUMNS)
    .from(records)
    .where(and(eq(records.id, id), isNull(records.deletedAt)))
    .get()
  if (row === undefined) {
    throw new PanelError(`No message has the id ${id}. A message is a record of kind "message".`, 404)
  }
  if (row.kind !== 'message') {
    throw new PanelError(`${id} is not a message. It is a ${kindWord(row.kind).text}.`, 400)
  }
  const said = row as MessageRow
  return {
    message: asMessage(said, deliveriesOf(id), whatTheProjectSays(EVERY_PROJECT, [said])),
    inProject: said.workspaceId,
  }
}

/**
 * Which project an event about one message names, so it reaches the pages watching that project: the project the message
 * was written in, or the message centre when it names none. The message itself is in no project;
 * its parties are told in every project by the rule of who is a party (`reaches` in lib/events.ts).
 */
function workspaceOfMessage(messageId: string): string {
  const row = db.select({ workspaceId: records.workspaceId, data: records.data }).from(records).where(eq(records.id, messageId)).get()
  if (row === undefined) return ''
  const data = (row.data ?? {}) as Record<string, unknown>
  return writtenInOf(data)?.project ?? row.workspaceId
}

// ============================================================================ writing the marks

/**
 * WRITE THE DELIVERY ROWS FOR A MESSAGE. The one door, called inside the create transaction.
 *
 * Every recipient starts at `queued`, which means the message is written down and nothing serving
 * that recipient has read it. A message addressed to nobody — a comment left on a page — writes no
 * rows at all, which is honest: there is nobody for a mark to be about.
 *
 * `inferredBy` IS THE ROW'S OWN ANSWER TO WHO WORKED THE RECIPIENT OUT, and it comes from
 * `inferredByFor` in `@shared/messages.ts` rather than being decided here. It is null when the
 * writer named the recipient and the door's tag when the door read one out of what the writer
 * chose. Writing it at the door is what stops the messages migration "repairing" an addressed row
 * and tripping the start guard (problem `IhInQ2Mf5BZq`).
 */
export function writeTheDeliveries(
  messageId: string,
  to: readonly ParticipantRef[],
  inferredBy: string | null,
  at: string = nowStamp(),
): number {
  let wrote = 0
  // WHICH RECIPIENTS REALLY GOT A NEW ROW, so the wake is about a delivery and not about a call.
  const filed: ParticipantRef[] = []
  const aliases = theFiledAliasesReadOnce(sqlite)
  for (const asked of to) {
    // AN AGENT'S ROW IS WRITTEN UNDER ITS CANONICAL REGISTRY ID, and a row under any id it alone answers to is already
    // there. With no alias filed for the agent this is the id it was handed, and nothing more is read.
    const ids = asked.kind === 'agent' ? theRegistryIdsOf(sqlite, asked.id, aliases) : [asked.id]
    const who: ParticipantRef = ids[0] === asked.id ? asked : { kind: asked.kind, id: ids[0]! }
    if (ids.length > 1) {
      const there = db
        .select({ id: messageDelivery.id })
        .from(messageDelivery)
        .where(and(eq(messageDelivery.messageId, messageId), eq(messageDelivery.recipientKind, who.kind), inArray(messageDelivery.recipientId, ids)))
        .get()
      if (there !== undefined) continue
    }
    const done = db
      .insert(messageDelivery)
      .values({
        id: anOfficeId(),
        messageId,
        recipientKind: who.kind,
        recipientId: who.id,
        mark: 'queued',
        at,
        inferredBy,
      })
      .onConflictDoNothing()
      .run()
    // ROWS THAT WERE REALLY WRITTEN, NOT ROWS THAT WERE OFFERED. This counted every recipient it
    // was handed, so a second call about a message whose rows already existed returned the same
    // number as the first and a caller could not tell "one recipient was added" from "nothing
    // changed". `keepTheDeliveryRowsInStep` below is that caller and it announces on the answer.
    wrote += done.changes
    // A ROW THAT WAS ALREADY THERE WAKES NOBODY. A second patch about the same message whose
    // recipient has not changed writes no row, and a wake there would be a hold answering about a
    // delivery that happened long ago. The set is passed to the one wake at the end of the loop.
    if (done.changes > 0) filed.push(who)
  }
  // THE WAKE. This is the one place both record write paths pass through, and the wake only
  // resolves promises: it runs no SQL, so it is safe inside the transaction this runs in. There is
  // no second wake mechanism — see src/server/lib/waiting-hold.ts for the cost that accepts.
  holdNoticeDeliveries(messageId, filed)
  tellTheWaitersFor(filed)
  return wrote
}

/**
 * WHO A MESSAGE IS TO, WORKED OUT FROM WHAT THE RECORD HOLDS RIGHT NOW.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ASKED WHENEVER THE RECORD IS WRITTEN, NOT ONLY WHEN IT IS BORN
 * ---------------------------------------------------------------------------------------
 *
 * Until 5 September 2026 this question was answered once, inside the create door, and nothing ever
 * asked it again. The review column chooses who a comment is for AFTERWARDS — a `PATCH` that writes
 * `chosenRecipient` onto a record that already exists — so a comment addressed that way had no
 * recipient, no delivery row, and appeared in no conversation, while the column said it was sent.
 * Two comments on the verifier's stack, `qvZZMtfziJO8` and `L1oLIBZudcp0`, came back with `to: []`
 * and the conversation with the agent the column named held nothing. Problem `fhxBfI7wb1nz`; it is
 * problem `HtITS-9Xk_Vk` arriving by a second door, and criterion M28 is what it fails.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER, AND WHY IT IS THIS ORDER
 * ---------------------------------------------------------------------------------------
 *
 * 1. A GROUP wins outright. Who a group message reaches is the membership at the moment it is sent,
 *    and `to` is left off such a record on purpose.
 * 2. A `to` SOMEBODY WROTE wins next. A caller that named a recipient outright has said what it
 *    means, and nothing here overrules it.
 * 3. THE AGENT A CHOICE NAMES is last, and it is the layer that used to be missing. What the person
 *    chose stays in `chosenRecipient` exactly as they chose it; this is what Mole Office made of it.
 *
 * NULL IS A REAL ANSWER AND IT IS AN EMPTY LIST HERE. A comment left on a page for nobody in
 * particular is addressed to nobody, and reaching for the owner instead is the fabrication criterion
 * M16 exists about.
 */
export function whoAMessageIsTo(data: Record<string, unknown>, workspaceId: string): ParticipantRef[] {
  const combined = [...whoTheWriterAddressed(data, workspaceId), ...theRoutedRecipients(data)]
  // ONE RECIPIENT, ONE ROW. A routed participant that is already an addressee is named once here, so
  // a reader counting recipients counts the same people the delivery rows hold.
  const seen = new Set<string>()
  return combined.filter((one) => {
    const key = participantKey(one)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Who the writer addressed outright: a group's membership, a named `to`, or a chosen agent. */
function whoTheWriterAddressed(data: Record<string, unknown>, workspaceId: string): ParticipantRef[] {
  const named = typeof data['toGroup'] === 'string' && data['toGroup'] !== '' ? data['toGroup'] : null
  if (named !== null) {
    // AN @ DECIDES WHO IN A GROUP IS TOLD. The words are handed to the one reading in shared/groups.ts
    // so the server's delivery and the page's drawing cannot disagree about who was addressed.
    const body = typeof data['body'] === 'string' ? data['body'] : ''
    const reaches = whoAGroupMessageReaches(named, refFrom(data['sentBy']), body)
    // A LINE THE OFFICE DELIVERS TO SOME MEMBERS ONLY, or to none (problem 0WUuvB0IhRfb). Only Mole Office
    // writes `deliveredOnlyTo`; the create door refuses it from anybody else. A member it names is
    // reached; a name that is not a member reaches nobody, because the line is the group's.
    if (Array.isArray(data['deliveredOnlyTo'])) {
      const only = refsOfRecipients(data['deliveredOnlyTo'])
      return reaches.filter((who) => only.some((one) => sameParticipant(one, who)))
    }
    return reaches
  }
  const listed = refsOfRecipients(data['to'])
  if (listed.length > 0) return listed
  const chosen = theAgentAChoiceNames(data['chosenRecipient'], workspaceId)
  return chosen === null ? [] : [chosen]
}

/**
 * Every participant the routing also gave the message to, in the order it chose them. A receiver the dead-letter
 * sweep told about the letter in one summary is not one of them (`routedCopiesOf`).
 */
function theRoutedRecipients(data: Record<string, unknown>): ParticipantRef[] {
  return routedCopiesOf(data)
}

/**
 * MAKE THE DELIVERY ROWS SAY WHAT THE RECORD SAYS. Called by the create door and the patch door.
 *
 * ONE FACT, WORKED OUT IN ONE PLACE, ASKED TWICE. `whoAMessageIsTo` above is the reader and this is
 * the writer; both doors call this, so a recipient that arrives at birth and one that arrives an
 * hour later travel exactly the same path. That is what CLAUDE.md's recurring defect asks for: not
 * two copies kept in step by hand, but one answer both doors are made of.
 *
 * THE ROUTING'S OWN ROW CARRIES ITS OWN TAG. A recipient the writer named keeps the door's answer,
 * `inferredByFor`; a recipient the routing added is a row the writer did not name, and it says
 * `INFERRED_BY_THE_ROUTING`. A routed participant already in `to` writes
 * no second row, because `writeTheDeliveries` ignores a row that is already there.
 *
 * A ROW IS ADDED AND NEVER TAKEN AWAY. `writeTheDeliveries` ignores a row that is already there, so
 * calling this twice about the same message writes nothing the second time. It also never deletes:
 * a delivery row is the record of somebody having been handed these words, and un-choosing a
 * recipient afterwards does not un-hand them. A person who changes their mind about who a comment
 * is for leaves the first recipient's row standing, and that row says what really happened.
 */
export function keepTheDeliveryRowsInStep(
  messageId: string,
  data: Record<string, unknown>,
  workspaceId: string,
  at: string = nowStamp(),
): { to: ParticipantRef[]; wrote: number } {
  const named = whoTheWriterAddressed(data, workspaceId)
  const routed = theRoutedRecipients(data)
  const to = whoAMessageIsTo(data, workspaceId)
  // THE RECIPIENT'S OWNER, DECIDED IN ONE PLACE. `inferredByFor` is the same answer the messages
  // migration reads over rows written before the column existed, so the door and the migration
  // cannot come to different conclusions about one message.
  let wrote = writeTheDeliveries(messageId, named, inferredByFor(data), at)
  wrote += writeTheDeliveries(messageId, routed, INFERRED_BY_THE_ROUTING, at)
  return { to, wrote }
}

/** One delivery row as it is stored. */
export type DeliveryRow = typeof messageDelivery.$inferSelect

/**
 * THE ONE STATEMENT THAT CHANGES A DELIVERY ROW AFTER IT IS WRITTEN. Every writer below ends here.
 *
 * Problem `JRjR0HGrOpGU`. A row holds a mark, a clock (`at`), a sentence (`because`) and a run, and
 * the message page draws them side by side. The mark and the clock used to be written by one
 * statement and the sentence by another. A second take of a delivered message rewrote the sentence
 * and left the clock, so the row named a session at a time when that session did not exist. Now the
 * mark, the clock and the sentence are written in one UPDATE, or nothing is written.
 *
 * WHAT A CALL CAN CHANGE:
 *
 *   - `mark` moves forward only. A mark that is already there, or one further along, stays.
 *   - `because` is the sentence. A call that names none and moves the mark writes null, so the row
 *     is read with the new mark's own general sentence (`deliveryReading`), except when moving a
 *     hand-over or delivered-read row to `seen`: only that mark moves. Its delivery sentence and clock stay for the
 *     reply reminder. The answering reading also measures from a waiter's hand-over time. When the recipient read
 *     the message is not stored on this row. An old "held because…" sentence is still emptied.
 *   - `run` is written only when the call names one. A mark moved without a run leaves the run that
 *     took the message on the row, because that is still true.
 *   - `carriedIn` is written only when the call names one, and only a sent review's archive names one
 *     (`archiveDeliveries`): the message that carries this row's words to the same recipient.
 *
 * Apart from that read mark on a delivery with either hand-over sentence, `at` is set every time the row is written.
 * When nothing would change, nothing is written and the
 * clock stays where it was. `written` says which of the two happened; `held` is the mark the row had
 * before the call and `mark` is the one it has after it.
 */
function writeTheMarkAndTheSentenceTogether(
  row: DeliveryRow,
  change: { mark?: DeliveryMark; because?: string; run?: string | null; carriedIn?: string },
  at: string,
): { written: boolean; held: DeliveryMark; mark: DeliveryMark } {
  const held: DeliveryMark = isDeliveryMark(row.mark) ? row.mark : 'queued'
  const forward = change.mark !== undefined && DELIVERY_MARKS.indexOf(change.mark) > DELIVERY_MARKS.indexOf(held)
  const mark = forward && change.mark !== undefined ? change.mark : held
  const newSentence = change.because !== undefined && row.because !== change.because
  const newRun = change.run !== undefined && row.run !== change.run
  if (!forward && !newSentence && !newRun) return { written: false, held, mark }
  const keepTheHandOver = forward && mark === 'seen' && change.because === undefined &&
    (isAHandOverSentence(row.because) || isAMessageReadSentence(row.because))
  db.update(messageDelivery)
    .set(keepTheHandOver
      ? { mark }
      : {
          mark,
          at,
          because: change.because ?? null,
          ...(change.run === undefined ? {} : { run: change.run }),
          ...(change.carriedIn === undefined ? {} : { carriedIn: change.carriedIn }),
        })
    .where(eq(messageDelivery.id, row.id))
    .run()
  return { written: true, held, mark }
}

/**
 * MOVE ONE RECIPIENT'S MARK FORWARD. It never moves backwards.
 *
 * A mark that has reached `seen` does not go back to `delivered` because somebody's page loaded
 * again, and one that reached `delivered` does not go back to `queued`. Going backwards would say a
 * message that had been read had not been, which is a worse answer than saying nothing.
 *
 * A MARK MOVED HERE NAMES NO SENTENCE. The writer above empties the sentence and moves the clock,
 * except for a hand-over advancing to `seen`, which keeps its sentence and hand-over time.
 * The run that took the message stays named. `because`, given only by `markReadByTheOffice`, is written with a
 * mark that moves forward and never on its own.
 *
 * `archived` IS NOT A MARK THIS TAKES. It is the office's own, set by `archiveADelivery` below.
 *
 * `askedIn` IS THE PROJECT THE MARK WAS ASKED FROM, or null when no page asked. The mark itself has no project. A mark
 * reaching `seen` is announced with the reader's contact rows as a read in that project, and in each project where the
 * reader has a page open, now gives them (`whereSeenLeavesTheContacts`), and each page is told its own project's rows.
 * `conversations` holds the conversations the same request has read for those rows already (`markManySeen`).
 */
export function markDelivery(
  messageId: string,
  who: ParticipantRef,
  mark: ACallersDeliveryMark,
  askedIn: string | null = null,
  at: string = nowStamp(),
  conversations: ConversationsRead = new Map(),
  because?: string,
): { changed: boolean; mark: DeliveryMark; because: string } {
  const row = db
    .select()
    .from(messageDelivery)
    .where(
      and(
        eq(messageDelivery.messageId, messageId),
        eq(messageDelivery.recipientKind, who.kind),
        isOneOfTheIds(messageDelivery.recipientId, who.kind === 'agent' ? theRegistryIdsOf(sqlite, who.id) : [who.id]),
      ),
    )
    .get()
  if (row === undefined) {
    throw new PanelError(
      `Message ${messageId} was not addressed to ${who.id}, so there is no delivery of it to mark. Nothing was ` +
        'written.',
      404,
    )
  }
  const forward = DELIVERY_MARKS.indexOf(mark) > DELIVERY_MARKS.indexOf(isDeliveryMark(row.mark) ? row.mark : 'queued')
  const done = writeTheMarkAndTheSentenceTogether(row, forward && because !== undefined ? { mark, because } : { mark }, at)
  if (!done.written) {
    return {
      changed: false,
      mark: done.held,
      because:
        `This message is already marked ${done.held} for ${who.id}, and a delivery mark never moves backwards. ` +
        'Nothing was written.',
    }
  }
  // THE ROWS ARE WORKED OUT HERE, AT THE MARK, and not when each page is sent the event, which is after the commit: a
  // screen marked in one request is announced one mark at a time, each with the rows as that one mark leaves them.
  const leaves = mark === 'seen' ? whereSeenLeavesTheContacts([messageId], who, theProjectsTheReaderLooksIn(who, askedIn), conversations) : null
  const event: DeliveryChanged = {
    name: 'delivery.changed',
    workspaceId: workspaceOfMessage(messageId),
    messageIds: [messageId],
    to: who,
    mark,
    rows: theDeliveryRowsOf([messageId], who),
    ...(leaves === null ? {} : { seenLeaves: askedIn === null ? null : (leaves.get(askedIn) ?? null) }),
  }
  const tell: TellOnePage | null =
    leaves === null
      ? null
      : (page) => (page.who !== null && sameParticipant(page.who, who) ? { ...event, seenLeaves: leaves.get(page.workspaceId) ?? null } : event)
  announce(event, tell, thePartiesOf(messageId))
  return { changed: true, mark, because: `Marked ${deliveryWord(mark).word.toLowerCase()} for ${who.id} at ${at}.` }
}

/**
 * MARK ONE LINE READ BY THE OFFICE, because the one matter it asks its reader to answer has been answered by another
 * door. The line then no longer waits for its reader, so its offer ends and does not come back. `why` says who
 * answered and when. Wave 13s round 192.
 *
 * THE ROW SAYS THE OFFICE SET THE MARK (`theOfficeMarkedItRead`), so it never reads as the reader having opened the
 * line. A line its reader has already marked read keeps the reader's own mark and sentence, and nothing is written.
 * Otherwise the mark is written and announced by `markDelivery`, as a reader's own mark is. True when the mark moved.
 */
export function markReadByTheOffice(messageId: string, who: ParticipantRef, why: string, at: string = nowStamp()): boolean {
  return markDelivery(messageId, who, 'seen', null, at, new Map(), theOfficeMarkedItRead(why)).changed
}

/**
 * MARK MANY MESSAGES SEEN FOR ONE RECIPIENT, IN ONE TRANSACTION: the door for what is on a screen.
 *
 * Each message goes through `markDelivery`, in the order given, so each mark is written and
 * announced exactly as the door for one message writes and announces it: one `delivery.changed`
 * for each mark that moved, carrying the contact row as that one mark leaves it. The events wait for
 * the commit (`announce` asks `whenStored`). When one message cannot be marked, its refusal is thrown,
 * nothing in the list is kept and nothing is announced.
 *
 * EACH CONVERSATION IS READ ONCE FOR THE WHOLE LIST (wave 13y round 91, item 23). The rows each mark is announced with
 * are worked out from the person's messages with the other side, and each mark read them again: the person's whole
 * pool once for every mark, about 160 ms each on the made-up office of that round, so a screen of 25 took about 4 s.
 * Now the marks share what the first of them read, and each mark brings it up to date by the one message it marked.
 */
export function markManySeen(
  messageIds: readonly string[],
  who: ParticipantRef,
  askedIn: string,
  at: string = nowStamp(),
): ({ messageId: string } & ReturnType<typeof markDelivery>)[] {
  const conversations: ConversationsRead = new Map()
  return sqlite.transaction(() =>
    messageIds.map((messageId) => ({ messageId, ...markDelivery(messageId, who, 'seen', askedIn, at, conversations) })),
  )()
}

/** The project a mark was asked from, then each other project where `who` has a page open now, each once. */
function theProjectsTheReaderLooksIn(who: ParticipantRef, askedIn: string | null): string[] {
  const projects = new Set(askedIn === null ? [] : [askedIn])
  for (const page of everyPageOpen()) if (page.who !== null && sameParticipant(page.who, who)) projects.add(page.workspaceId)
  return [...projects]
}

/**
 * PUT OFF THE LEAD OFFER ONE MESSAGE CARRIES, FOR ONE RECIPIENT. Not now keeps the message unread, and the offer
 * comes back later, by the person's decision and one more.
 *
 * It writes the moment into `offer_put_off_at` on the recipient's delivery row and nothing else. The
 * mark does not move, so the message stays unread in the chat and on the Messages page. Each press
 * writes a new moment, so each Not now starts the wait again.
 *
 * EVERYTHING IS CHECKED BEFORE ANYTHING IS WRITTEN. A message that carries no lead has no offer to
 * put off (409). A recipient with no delivery row of it is refused as the mark door refuses one (404).
 * A message the recipient has already read writes nothing and says so, because its offer has ended.
 */
export function putOffALeadOffer(
  messageId: string,
  who: ParticipantRef,
  at: string = nowStamp(),
): { changed: boolean; putOffAt: string | null; comesBackInSeconds: number | null; because: string } {
  const message = readMessageWhereverItIs(messageId).message
  if (!carriesALead(message)) {
    throw new PanelError(
      `Message ${messageId} carries no offer to take anybody to a page, so there is no offer to put off. Nothing was ` +
        'written.',
      409,
    )
  }
  const row = db
    .select()
    .from(messageDelivery)
    .where(
      and(
        eq(messageDelivery.messageId, messageId),
        eq(messageDelivery.recipientKind, who.kind),
        eq(messageDelivery.recipientId, who.id),
      ),
    )
    .get()
  if (row === undefined) {
    throw new PanelError(
      `Message ${messageId} was not addressed to ${who.id}, so there is no offer of it to put off. Nothing was ` +
        'written.',
      404,
    )
  }
  if (row.mark === 'seen') {
    return {
      changed: false,
      putOffAt: row.offerPutOffAt,
      comesBackInSeconds: null,
      because: `This message is already read by ${who.id}, so its offer has ended. Nothing was written.`,
    }
  }
  db.update(messageDelivery).set({ offerPutOffAt: at }).where(eq(messageDelivery.id, row.id)).run()
  // EVERY OTHER SCREEN OF THIS PERSON'S HEARS IT NOW, not at its next read (row 65 of report rFBoQG6mAEI0).
  // The mark has not moved, so the event says the offer was put off. The mark it carries is the row as every
  // other reader reads it.
  const rows = theDeliveryRowsOf([messageId], who)
  const mark = rows[0]?.row.mark
  if (mark === undefined) throw new Error(`The delivery row of message ${messageId} for ${who.id} was just written and cannot be read back.`)
  announce(
    {
      name: 'delivery.changed',
      workspaceId: workspaceOfMessage(messageId),
      messageIds: [messageId],
      to: who,
      mark,
      rows,
      offerPutOff: true,
    },
    null,
    thePartiesOf(messageId),
  )
  return {
    changed: true,
    putOffAt: at,
    comesBackInSeconds: A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES * 60,
    because:
      `Put off for ${who.id} at ${at}. The message stays unread, and the offer comes back after ` +
      `${String(A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES)} minutes while it is still unread.`,
  }
}

/**
 * REMIND ME LATER: THE PERSON PUTS ONE MESSAGE OFF UNTIL A CHOSEN TIME, AND THE OFFICE BRINGS IT BACK
 * ONCE.
 *
 * It writes `remind_at` on the person's delivery row and empties `reminded_at`, and nothing else about the message. The
 * mark does not move, so a message not read stays unread. The office's timer (src/server/lib/remind-me-later.ts) reads
 * the row, so the message comes back with no page open and after a restart. Each press writes a new time, so the message
 * comes back once, at the time of the newest press. The times are the three of src/shared/remind-me-later.ts.
 *
 * IT ALSO RECORDS WHO SET THE TIME (migration 0288, wave 13s round 68). `setBy` is the actor that pressed: the person, or
 * the secretary the person's grant carried there. A null `setBy` leaves both columns null, which is NOBODY RECORDED, as
 * every row written before that migration is. The line the office writes when the time comes reads it, so it never says
 * the person asked for a time a secretary set.
 *
 * Who may press is asked by the door, before this runs, and the door decides whose delivery is moved: the person's, never
 * a secretary's own. Everything here is checked before anything is written: a message that carries no offer to take the
 * person to a page is refused (409), because the press stands beside Take me there and nowhere else, and a recipient with
 * no delivery row of it is refused as the mark door refuses one (404).
 */
export function remindMeLater(
  messageId: string,
  who: ParticipantRef,
  choice: RemindMeLaterChoice,
  setBy: { kind: string; id: string } | null = null,
  pressedAt: Date = new Date(),
): { messageId: string; choice: RemindMeLaterChoice; remindAt: string; pressedAt: string; because: string } {
  const message = readMessageWhereverItIs(messageId).message
  if (!carriesALead(message)) {
    throw new PanelError(
      `Message ${messageId} carries no offer to take anybody to a page, and Remind me later stands beside that offer. ` +
        'Nothing was written.',
      409,
    )
  }
  const row = db
    .select()
    .from(messageDelivery)
    .where(
      and(
        eq(messageDelivery.messageId, messageId),
        eq(messageDelivery.recipientKind, who.kind),
        eq(messageDelivery.recipientId, who.id),
      ),
    )
    .get()
  if (row === undefined) {
    throw new PanelError(
      `Message ${messageId} was not addressed to ${who.id}, so there is nothing of it to bring back to them. Nothing ` +
        'was written.',
      404,
    )
  }
  const remindAt = whenAPutOffMessageComesBack(choice, pressedAt)
  db.update(messageDelivery)
    .set({
      remindAt,
      remindedAt: null,
      remindSetByKind: setBy?.kind ?? null,
      remindSetById: setBy?.id ?? null,
    })
    .where(eq(messageDelivery.id, row.id))
    .run()
  // EVERY OTHER SCREEN OF THIS PERSON'S HEARS IT NOW, as it hears Not now: the offer leaves each screen until then.
  const rows = theDeliveryRowsOf([messageId], who)
  const mark = rows[0]?.row.mark
  if (mark === undefined) throw new Error(`The delivery row of message ${messageId} for ${who.id} was just written and cannot be read back.`)
  announce(
    {
      name: 'delivery.changed',
      workspaceId: workspaceOfMessage(messageId),
      messageIds: [messageId],
      to: who,
      mark,
      rows,
      offerPutOff: true,
    },
    null,
    thePartiesOf(messageId),
  )
  return {
    messageId,
    choice,
    remindAt,
    // THE PRESS ON THE OFFICE'S OWN CLOCK, so a page can say "today" or "tomorrow" by the office's date and not its own.
    pressedAt: localStamp(pressedAt),
    because: `The office brings message ${messageId} back to ${who.id} once, at ${remindAt}. Its mark did not move.`,
  }
}

/**
 * THE LEAD OFFERS THIS READER HAS PUT OFF AND THAT ARE STILL PUT OFF AT `nowMs`, with the moment each
 * comes back, keyed by message id.
 *
 * A message the reader has read is not here: its offer has ended, whatever was pressed before. A stored
 * moment that cannot be read as a stamp is not here either, so its offer is drawn rather than hidden
 * on a guess.
 */
export function theOffersPutOffFor(who: ParticipantRef, nowMs: number): Map<string, number> {
  const rows = db
    .select({
      messageId: messageDelivery.messageId,
      putOffAt: messageDelivery.offerPutOffAt,
      remindAt: messageDelivery.remindAt,
      remindedAt: messageDelivery.remindedAt,
    })
    .from(messageDelivery)
    .where(
      and(
        eq(messageDelivery.recipientKind, who.kind),
        eq(messageDelivery.recipientId, who.id),
        ne(messageDelivery.mark, 'seen'),
        or(isNotNull(messageDelivery.offerPutOffAt), isNotNull(messageDelivery.remindAt)),
      ),
    )
    .all()
  const out = new Map<string, number>()
  for (const row of rows) {
    const putOffMs = row.putOffAt === null ? null : parseStoredStamp(row.putOffAt)
    // REMIND ME LATER KEEPS THE OFFER AWAY UNTIL ITS TIME, while the office has not yet brought the message back.
    const remindMs = row.remindAt === null || row.remindedAt !== null ? null : parseStoredStamp(row.remindAt)
    const back = Math.max(putOffMs === null ? 0 : whenAPutOffOfferComesBack(putOffMs), remindMs ?? 0)
    if (back > nowMs) out.set(row.messageId, back)
  }
  return out
}

/**
 * One delivery row to archive: the message, its recipient, and the sentence saying why. `carriedIn` is the message that
 * carries this one's words to the same recipient, which only a sent review's archive names (`carried_in` on the row).
 */
export interface ADeliveryToArchive {
  messageId: string
  who: ParticipantRef
  because: string
  carriedIn?: string
}

/**
 * MARK QUEUED DELIVERY ROWS ARCHIVED, EACH WITH THE SENTENCE SAYING WHY. Problem 0WUuvB0IhRfb.
 *
 * The one writer of `archived`. The dead-letter sweep calls it for office notices whose addressee is
 * retired, and the script that folds the old sweep lines calls the same function (or
 * `archiveADelivery` below, which is this asked about one row). Archived means nobody read the
 * message and nobody will be woken for it. A sent review's send calls it too, for each comment the
 * review's message carries, and names that message on the row (`carriedIn`): that comment's words
 * reach its agent in the review's message.
 *
 * ONLY A QUEUED ROW IS ARCHIVED. A row that was delivered or seen already reached its recipient, so it keeps
 * its mark, and a row already archived is left as it is. The answer names the rows that were
 * archived. A row that does not exist is a 404, and it is asked about before anything is written, so
 * a list naming one is refused whole.
 *
 * WAKING NOBODY. The write moves a mark and wakes no waiter; only a new delivery row wakes one
 * (`writeTheDeliveries`). ONE EVENT PER PROJECT, RECIPIENT AND SET OF PARTIES, as `markManyDelivered`
 * announces, so a sweep that archives hundreds of rows does not send hundreds of events to every
 * open page.
 */
export function archiveDeliveries(
  rows: readonly ADeliveryToArchive[],
  at: string = nowStamp(),
): ADeliveryToArchive[] {
  const found = rows.map((one) => {
    const row = db
      .select()
      .from(messageDelivery)
      .where(
        and(
          eq(messageDelivery.messageId, one.messageId),
          eq(messageDelivery.recipientKind, one.who.kind),
          eq(messageDelivery.recipientId, one.who.id),
        ),
      )
      .get()
    if (row === undefined) {
      throw new PanelError(
        `Message ${one.messageId} was not addressed to ${one.who.id}, so there is no delivery of it to archive. ` +
          'Nothing was written.',
        404,
      )
    }
    return { one, row }
  })
  const archived: ADeliveryToArchive[] = []
  for (const { one, row } of found) {
    if (row.mark !== 'queued') continue
    const change = { mark: 'archived' as const, because: one.because, ...(one.carriedIn === undefined ? {} : { carriedIn: one.carriedIn }) }
    if (writeTheMarkAndTheSentenceTogether(row, change, at).written) archived.push(one)
  }
  const named = new Map<string, ParticipantRef | null>()
  const byGroup = new Map<string, { workspaceId: string; parties: ParticipantRef[]; to: ParticipantRef; ids: string[] }>()
  for (const one of archived) {
    const workspaceId = workspaceOfMessage(one.messageId)
    const parties = thePartiesOf(one.messageId, named)
    const key = `${workspaceId}|${participantKey(one.who)}|${parties.map(participantKey).sort().join(',')}`
    const held = byGroup.get(key)
    if (held === undefined) byGroup.set(key, { workspaceId, parties, to: one.who, ids: [one.messageId] })
    else held.ids.push(one.messageId)
  }
  for (const { workspaceId, parties, to, ids } of byGroup.values()) {
    announce(
      { name: 'delivery.changed', workspaceId, messageIds: ids, to, mark: 'archived', rows: theDeliveryRowsOf(ids, to) },
      null,
      parties,
    )
  }
  return archived
}

/** Archive one queued delivery row: `archiveDeliveries` asked about one. True when it was archived. */
export function archiveADelivery(messageId: string, who: ParticipantRef, because: string, at: string = nowStamp()): boolean {
  return archiveDeliveries([{ messageId, who, because }], at).length === 1
}

/**
 * THE OLD `read` FLAG IS NOT A STORE, AND NOTHING IN THIS PRODUCT WRITES IT ANY MORE.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH OF THE TWO IS THE STORE, AND WHY THE FIELD IS STILL DECLARED
 * ---------------------------------------------------------------------------------------
 *
 * `message_delivery` is the store. `data.read` on a message record is what the twenty-five messages
 * written before delivery marks existed carry, and it is now read by nothing and written by nothing.
 *
 * Until 4 September 2026 they were two stores. The Reports and notes page marked a message read by
 * writing `data.read = true` on the record; the chat panel, the number on the circle and every
 * unread count read the delivery row. Neither moved the other. Measured: the circle said 10 unread,
 * a message was marked read on the notes page, and the circle still said 10. Problem `EGhi5RjLwApr`,
 * and the defect CLAUDE.md names at the top of the file. The notes page now marks through
 * `markDelivery`, which is the door to the store, and no screen reads the field.
 *
 * WHY IT IS NOT DELETED FROM THE DECLARATION. Twenty-five records hold the key, and `validateData`
 * refuses a record whose data carries a key its kind does not declare. `patchRecord` validates the
 * WHOLE of a record's data on every write, so dropping the field would make the next patch of any of
 * those twenty-five fail with "unknown key" — deleting somebody's history by making it unwritable.
 * The field's own description in shared/kinds.ts says it is not the store and that nothing reads it.
 *
 * AND WHY IT IS NOT MIRRORED EITHER, WHICH WAS THE OTHER WAY OUT. Writing the field when a mark
 * becomes `seen` would write a record revision per mark, and migration 0115's own header says why
 * that is wrong: a conversation of ten messages being read would write ten revisions of messages
 * nobody edited, and the record's history would read as ten rewrites of somebody's words.
 * `tests/one-message-pool.test.ts` holds that as a rule — "writes no revision when a mark changes"
 * — and weakening a check to make a fix fit is not one of the ways to fix anything.
 */

/**
 * EVERY MESSAGE THIS PARTICIPANT HAS BEEN SENT AND NOT YET SEEN, marked delivered in one act.
 *
 * Used when a conversation is opened: the messages on the screen have reached the reader, and the
 * ones they have actually read are marked separately by `markDelivery`.
 */
export function markManyDelivered(
  messageIds: readonly string[],
  who: ParticipantRef,
  at: string = nowStamp(),
  delivery?: { because: string; run?: string },
): string[] {
  const moved: string[] = []
  const ids = who.kind === 'agent' ? theRegistryIdsOf(sqlite, who.id) : [who.id]
  for (const id of messageIds) {
    const row = db
      .select()
      .from(messageDelivery)
      .where(
        and(
          eq(messageDelivery.messageId, id),
          eq(messageDelivery.recipientKind, who.kind),
          isOneOfTheIds(messageDelivery.recipientId, ids),
        ),
      )
      .get()
    if (row === undefined || row.mark === 'delivered' || row.mark === 'seen') continue
    // A SECOND READ IS NOT A SECOND DELIVERY. Queued and archived rows can still move forward to
    // delivered. The hook names its delivery sentence and, inside an office-started run, that run.
    // Conversation opens that name neither still empty the sentence.
    if (writeTheMarkAndTheSentenceTogether(row, { mark: 'delivered', ...delivery }, at).written) moved.push(id)
  }
  /*
   * ONE EVENT FOR THE BATCH, NOT ONE PER MESSAGE.
   *
   * This is the read path of a conversation: opening one marks every still-queued message in it
   * delivered in one act. One event per message made that act cost N events, and every open window
   * read its lists N times — the loop that fed itself, measured at eleven to twelve requests per
   * window per event. The marks were moved by one act and they are announced as one.
   *
   * ONE PER PROJECT THE BATCH TOUCHES, and not one for all of them: a conversation is the person's
   * across every project, so a batch can span two, and an event naming one project while moving
   * marks in two would draw the wrong project's mark under a message. Announcing once per project is
   * one event in the ordinary case and never more than the batch's projects.
   *
   * AND ONE PER SET OF PARTIES. An event about a message reaches only that message's parties and the
   * owner, so messages between different people cannot share one event: a
   * party of one would be told the id of the other. Messages of one conversation share their parties,
   * so this is still one event in the ordinary case.
   */
  const byProjectAndParties = new Map<string, { workspaceId: string; parties: ParticipantRef[]; ids: string[] }>()
  const named = new Map<string, ParticipantRef | null>()
  for (const id of moved) {
    const workspaceId = workspaceOfMessage(id)
    const parties = thePartiesOf(id, named)
    const key = `${workspaceId}|${parties.map(participantKey).sort().join(',')}`
    const held = byProjectAndParties.get(key)
    if (held === undefined) byProjectAndParties.set(key, { workspaceId, parties, ids: [id] })
    else held.ids.push(id)
  }
  for (const { workspaceId, parties, ids } of byProjectAndParties.values()) {
    announce(
      { name: 'delivery.changed', workspaceId, messageIds: ids, to: who, mark: 'delivered', rows: theDeliveryRowsOf(ids, who) },
      null,
      parties,
    )
  }
  return moved
}

/**
 * ADDS ONE CARRY TO THE FACTS STORED ON A MESSAGE (`carriedTo`), with the time it is written. Only the
 * press to start a new agent writes these, through the door's own mark; no request may.
 */
export function writeTheCarry(messageId: string, carry: Omit<CarriedTo, 'at'>, actor: Actor): void {
  const read = getRecord(messageId)
  const before = carriedToOf((read?.data as Record<string, unknown> | null) ?? {})
  patchRecord(messageId, {
    dataPatch: { carriedTo: [...before, { ...carry, at: localStamp(new Date()) }] },
    [THE_START_AN_AGENT_DOOR]: true,
  }, actor)
}

/**
 * WRITE DOWN WHERE A DELIVERY STANDS, with the time it was written and, when the caller names one,
 * the mark it has reached.
 *
 * Criterion M6 asks for a sentence beside the clock. The mark says how far a message got; this says
 * why it is there. The worker writes it every time it decides something about a message: the tool
 * is not installed, too many runs are going, this run took it, somebody stopped that run.
 *
 * THE SENTENCE CARRIES ITS OWN CLOCK. A sentence is written with `at` set to the moment it is
 * written, in the same statement (`writeTheMarkAndTheSentenceTogether`), so the time beside it is
 * the time of the event it describes. Problem `JRjR0HGrOpGU`.
 *
 * A mark moves only when the caller names one, and only forward. Reading a message or carrying it
 * to a new agent can name `delivered`; a recipient who read it can name `seen`. A reason alone does
 * not change a queued mark.
 *
 * The change is announced with the mark the row has after the write, so an open page redraws the
 * sentence without asking again.
 *
 * WRITING THE SAME SENTENCE AGAIN WRITES NOTHING AND ANNOUNCES NOTHING, when the run and the mark
 * would stay as they are too. The worker looks at the queue every two seconds and says again, on
 * every pass, why each message it cannot start is still waiting. A message held until a person
 * writes is held for ever, so every one of those passes used to announce a change that had not
 * happened — an open page redrawing its chat panel every two seconds for as long as anything was
 * held. `written: false` says the row already read this way, and its clock did not move.
 */
export function sayWhereADeliveryStands(
  messageId: string,
  who: ParticipantRef,
  note: { because: string; run?: string | null; mark?: ACallersDeliveryMark },
  at: string = nowStamp(),
): { written: boolean; mark: DeliveryMark } {
  const row = db
    .select()
    .from(messageDelivery)
    .where(
      and(
        eq(messageDelivery.messageId, messageId),
        eq(messageDelivery.recipientKind, who.kind),
        isOneOfTheIds(messageDelivery.recipientId, who.kind === 'agent' ? theRegistryIdsOf(sqlite, who.id) : [who.id]),
      ),
    )
    .get()
  if (row === undefined) {
    throw new PanelError(
      `Message ${messageId} was not addressed to ${who.id}, so there is no delivery of it to say anything about.`,
      404,
    )
  }
  const done = writeTheMarkAndTheSentenceTogether(row, note, at)
  if (!done.written) return { written: false, mark: done.mark }
  announce(
    {
      name: 'delivery.changed',
      workspaceId: workspaceOfMessage(messageId),
      messageIds: [messageId],
      to: who,
      mark: done.mark,
      rows: theDeliveryRowsOf([messageId], who),
    },
    null,
    thePartiesOf(messageId),
  )
  return { written: true, mark: done.mark }
}

// ============================================================================ refusals on a write

/**
 * WHY A MESSAGE'S ADDRESSING IS REFUSED, or null when it is usable.
 *
 * Called on the create path in lib/records.ts, so the same rule holds however the message arrives.
 * The shape checks live in shared/messages.ts, because the browser asks the same questions before
 * it sends; this adds the two questions only the database can answer.
 */
export function whyTheAddressingIsRefused(
  data: Record<string, unknown>,
  known: (who: ParticipantRef) => boolean,
  isTheOffice: (who: ParticipantRef) => boolean = isMoleOffice,
): string | null {
  // A GROUP IS A SHAPE HERE AND A ROW SOMEWHERE ELSE. Whether the id names a group in this project,
  // whether anybody is in it and whether the sender is a member are questions only the database can
  // answer, and `whyTheGroupAddressingIsRefused` in lib/groups.ts asks them on the same write.
  const group = data['toGroup']
  if (group !== undefined && group !== null) {
    if (typeof group !== 'string' || group.trim() === '') return A_GROUP_IS_NAMED_BY_ITS_ID
    // AND A GROUP OR NAMES, NEVER BOTH. Who a message to a group reaches is everybody in it at the
    // moment it was sent; naming somebody as well would be two answers to one question.
    const named = data['to']
    if (Array.isArray(named) && named.length > 0) return A_MESSAGE_GOES_TO_A_GROUP_OR_TO_PEOPLE
    return null
  }
  const to = data['to']
  // NOBODY NAMED AND NOTHING POINTED AT IS REFUSED, and it used to be stored as addressed to the
  // owner. The sentence and the whole reason are on NOBODY_NAMED_AND_NOTHING_POINTED_AT in
  // shared/messages.ts. A `to` that is present and empty falls to `whyAddresseesAreRefused` below,
  // which says something different and truer about it: somebody meant to name somebody and named
  // nobody.
  if ((to === undefined || to === null) && (data['target'] === undefined || data['target'] === null)) {
    // A MESSAGE THAT QUOTES THINGS IS REFUSED IN WORDS THAT ARE TRUE OF IT. It points at something,
    // so the sentence below would be false.
    if (Array.isArray(data['quotes']) && data['quotes'].length > 0) return QUOTES_AND_NOBODY_NAMED
    return NOBODY_NAMED_AND_NOTHING_POINTED_AT
  }
  if (to === undefined || to === null) return null
  const because = whyAddresseesAreRefused(to)
  if (because !== null) return because
  for (const one of to as readonly unknown[]) {
    const ref = refFrom(one)
    if (ref === null) continue
    // MOLE OFFICE IS IN THE REGISTRY AND IS NOT WRITEABLE TO. It is checked before `known` so the
    // reader gets the sentence saying why rather than one saying it is not registered, which would
    // be false.
    if (isTheOffice(ref)) return NOTHING_ANSWERS_FOR_MOLE_OFFICE
    if (!known(ref)) {
      return (
        `Nothing is registered as the ${participantWord(ref.kind)} "${ref.id}", so a message addressed to it would ` +
        'reach no recipient. ' +
        'GET /api/participants lists every person and every agent that keeps a standing inbox, with the id of each.'
      )
    }
  }
  return null
}

/**
 * WHY A MESSAGE TO A PERSON FROM A WRITER NOBODY REGISTERED IS REFUSED, or null when it is usable.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On 6 September 2026 at 05:51 the owner got a message in their chat from "bundle-drafter". Nothing
 * had registered an agent by that name. Message record `uKYQZRs6qqtS`, actor
 * `claude-code/bundle-drafter`, addressed to the owner by their person id, one delivery row to
 * them. It is the only message in the owner's chat whose writer no registry holds.
 *
 * THE WRITE PATH ASKED WHO THE WRITER WAS AND THREW THE ANSWER AWAY. `createRecordWithReport` in
 * lib/records.ts calls `participantForActor(actor)`, which answered null, and the only thing that
 * read that answer was `else if (mine !== null) data['sentBy'] = mine`. There was no else. So the
 * message was stored with no sender, delivered, and drawn.
 *
 * THE RECIPIENT WAS CHECKED AND THE WRITER WAS NOT. `whyTheAddressingIsRefused` above walks `to`
 * and refuses a recipient neither registry holds, in those exact words. Nothing walked the writer
 * through the same question. That asymmetry is the whole defect: a message could not be addressed
 * to somebody the registries do not hold, and could be written by them.
 *
 * `assertMayWrite` did not catch it either, and could not: all four of its clauses are behind
 * `HUMAN_ONLY_KINDS.includes(kind)`, and that list holds one word, `decision`.
 *
 * design/messages/ACCEPTANCE.md criterion M14 asked for this in 2026: *"A message from an unknown
 * participant is refused with the sentence saying how to register."* Only the recipient half was
 * built.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE: A WRITER REGISTERS BEFORE IT WRITES, TO AN AGENT AS TO A PERSON
 * ---------------------------------------------------------------------------------------
 *
 * EVERY MESSAGE NEEDS A REGISTERED WRITER. The owner has to be able to see who is writing and who
 * answers for what they wrote. That holds for a message to the person and for a message to an agent
 * alike.
 *
 * THE REPORTING PATH IS WITHDRAWN. Until 24 September 2026 a message to an agent was accepted from
 * an unregistered writer on purpose: a builder nobody had registered reported to the agent that
 * started it, that agent was registered, and the report reached the owner up that chain. A decision
 * withdrew that path. The writer must register
 * first, and until it has, its message is refused in words. Whoever started an agent still manages
 * it and reports on for it, up the chain; it just cannot write as an agent nobody registered.
 *
 * A LINE TO A GROUP IS NOT REFUSED HERE. `whyTheGroupAddressingIsRefused` in lib/groups.ts already
 * asks whether the writer is a member of that group, which is a stronger question than this one.
 */

export function whyAnUnregisteredWriterIsRefused(
  data: Record<string, unknown>,
  writerIsRegistered: boolean,
  actorId: string,
  actorType: Actor['type'],
): string | null {
  if (writerIsRegistered) return null
  const to = data['to']
  if (!Array.isArray(to)) return null
  // A PERSON AND AN AGENT ARE BOTH RECIPIENTS THIS RULE IS ABOUT, and the reporting path no longer
  // exempts an agent. A group is left out: its own membership check is stronger, and it is asked in
  // lib/groups.ts.
  const addressed = (to as readonly unknown[])
    .map((one) => refFrom(one))
    .filter((ref): ref is ParticipantRef => ref !== null && (ref.kind === 'person' || ref.kind === 'agent'))
  if (addressed.length === 0) return null
  const named = addressed.map((ref) => `"${ref.id}"`).join(', ')
  // THE WRITER IS NAMED AS THE KIND IT WROTE AS (line round 50; message 1mDqct4t2suB). A person whose id is no
  // row of the people table reaches this refusal too, because `participantForActor` answers null for it, and the
  // sentence called that person "the agent". A system writer is in no registry at all.
  if (actorType === 'human') {
    return (
      `Nothing is registered as the person "${actorId}", and this message is addressed to ${named}. A message comes ` +
      'from a person or an agent a registry holds, so that a reader can see the writer and the one answerable for it. ' +
      'Nothing was written. A person writes under the id the registry holds for that person, and an agent writes as ' +
      'an agent, under its own handle. GET /api/participants lists every person and every agent that keeps a ' +
      'standing inbox, with the id of each.'
    )
  }
  if (actorType === 'system') {
    return (
      `Nothing is registered as the system writer "${actorId}", and this message is addressed to ${named}. A message ` +
      'comes from a person or an agent a registry holds, so that a reader can see the writer and the one answerable ' +
      'for it, and no registry holds a system writer. Nothing was written. An agent writes as an agent, under its own ' +
      'handle. GET /api/participants lists every person and every agent that keeps a standing inbox, with the id of ' +
      'each.'
    )
  }
  return (
    `Nothing is registered as the agent "${actorId}", and this message is addressed to ${named}. A message comes ` +
    'from an agent a registry holds, to an agent as to a person, so that a reader can see the writer and the one ' +
    'answerable for it. Nothing was written. Register first: file a record of kind `agent` with a handle and send ' +
    'that handle as your actor id with POST /api/agents/register-myself, or ask the agent that started you to ' +
    'register you with POST /api/agents/started. GET /api/participants lists every person and every agent that ' +
    'keeps a standing inbox, with the id of each.'
  )
}

/**
 * WHAT STOPS A MESSAGE TO THIS PARTICIPANT, as facts, or null when nothing does.
 *
 * Criterion M110: before an agent sends,
 * check whether the other side is online, and decide whether to send from that; the premise of
 * sending a message is that the other side really can receive it, or it is not a real message.
 *
 * ---------------------------------------------------------------------------------------
 * THE PERSON IS NEVER REFUSED BY THIS RULE, AND THAT IS WHY THIS RETURNS NULL FOR ONE OUTRIGHT
 * ---------------------------------------------------------------------------------------
 *
 * The criterion says "the other side" without narrowing it, but the brief this criterion shipped
 * under is explicit that the person is never refused by it, and the reason holds on its own: the
 * person is not a process this product starts or stops, presence for a person is their own declared
 * choice rather than a measurement (see `presenceOfAPerson` in lib/presence.ts), and a message to
 * them is never queued waiting for a run — it sits in their chat until they read it. There is nothing here
 * for "cannot receive it" to mean.
 *
 * ---------------------------------------------------------------------------------------
 * THE OFFICE'S OWN PRESENCE READING, NOT A SECOND ONE
 * ---------------------------------------------------------------------------------------
 *
 * `participantPresence` in lib/presence.ts is the one place this product measures whether an agent
 * can be reached right now, in the three colours of criterion M4: green (something is
 * serving it), grey (nothing is, and it could still be woken), red (retired, or nothing in the
 * registry answers to it at all). This asks that function and nothing else, so the door and the dot
 * on the contact row can never disagree about the same agent at the same moment. With the setting
 * off it asks only the red half, `theRedReasonFor`, which that function asks first; with the setting
 * on it hands that function the addressee's own runs (round 37 of wave 13u).
 *
 * GREY MEANS NOTHING IS ANSWERING AS THE AGENT. A terminal, a process, recent output or an open
 * panel alone does not make it reachable. Grey reads Offline, Inactive or In a terminal, and this
 * door treats all three the same way: the setting decides whether to refuse, and the dot's word
 * decides only the clause. RED covers both an agent that is retired (the person used that very word)
 * and one the registry no longer holds at all; the latter should already have been refused
 * earlier, by `whyTheAddressingIsRefused`'s `known()` check, before this is ever asked — this
 * covers it anyway, because a refusal that depends on being asked in one particular order is not a
 * refusal, it is luck.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE SENDER MAY DO INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 * The person's words name three: write to the person, to the agent's starter, or to a secretary. The
 * person is named by the name the registry holds for them, and is always in the list. The agent, its
 * starter and every currently-registered, un-retired secretary are named by the name their row holds,
 * and by the handle only where the row holds no name (wave 13n round 33). A starter or a secretary
 * nobody recorded is left out of the list.
 *
 * ---------------------------------------------------------------------------------------
 * FACTS HERE, WORDS IN ONE BUILDER
 * ---------------------------------------------------------------------------------------
 *
 * `whatStopsAMessageTo` works out the facts once. `theCannotReceiveLine` in src/shared/cannot-receive.ts
 * turns them into the sentence: in English here, for the door's refusal and for an agent, and in the
 * page's language on a page, from the same facts (problem t_ox8XMOvu7a). The sentence names the state
 * in the presence dot's own word, never the reading's inside words. It names no route, no setting
 * variable and no criterion (wave 13n round 31). Where the setting refuses, it names the setting by the
 * plain name the Settings page draws, and the normal-mode place that shows it: Settings, Chat and
 * messages (wave 13n round 32). The picker for a saved comment draws it under the pointer before
 * anything is sent, so it does not say "Nothing was sent"; the record door adds that when it refuses
 * (`NOTHING_WAS_SENT`).
 */
export function whatStopsAMessageTo(
  to: ParticipantRef,
  workspaceId: string,
  now: Date = new Date(),
): TheCannotReceiveSaid | null {
  // THE PERSON IS NEVER REFUSED BY THIS RULE. See the header above.
  if (to.kind !== 'agent') return null
  // RED IS REFUSED WITHOUT A SETTING: an agent that is
  // retired cannot receive, and refusing that is safe and correct today. GREY — nothing is answering
  // — is refused only when the one setting says so, because presence is not yet true for an agent
  // started as a subagent, and until M106 (Cluster B) and F9 make it true, refusing on this reading
  // would refuse the live org chart. The setting defaults to off.
  //
  // SO WITH THE SETTING OFF, ONLY THE REGISTRY ROW IS ASKED (round 37 of wave 13u). Red is the row's own answer,
  // `theRedReasonFor`, which `participantPresence` asks first and answers from before it reads a hold or a run. An agent
  // whose row is not red reads green or grey, and either way nothing stops the message. The check read every running
  // run of the project for that answer. A lapsed hold on the addressee is still released in the same send, by the
  // routing's reading of its reach in lib/records.ts.
  const refusesGrey = theDoorRefusesAnAgentWithNoSessionAndNoRun()
  const registry = readParticipant(to)
  if (!refusesGrey && theRedReasonFor(to, registry) === null) return null
  // WITH THE SETTING ON, THE READING IS ASKED FROM THE ADDRESSEE'S OWN RUNS, the rows of its reach.
  const reading = participantPresence(to, workspaceId, now, null, false, undefined, undefined, undefined, undefined, undefined, undefined, () =>
    theRunRowsOfOneReach(to.id, workspaceId),
  )
  if (reading.colour === 'green') return null
  const gone = reading.colour === 'red'
  if (!gone && !refusesGrey) return null
  const starter = registry !== null && 'startedBy' in registry ? registry.startedBy : null
  // AN AGENT IN THIS SENTENCE IS NAMED BY THE NAME ITS ROW HOLDS, and by the handle on its row only where
  // the row holds no name (wave 13n round 33); never by a minted id nobody chose (wave 13b, rule 5).
  // Where no row answers, the stored string is shown as it is.
  const named = (row: { name: string; handle: string }): string => (row.name.trim() === '' ? row.handle : row.name.trim())
  const starterRow = starter === null ? null : readParticipant(starter)
  const agent = registry === null ? to.id : named(registry)
  const starterName = starter === null ? null : starterRow === null ? starter.id : named(starterRow)
  // A SECRETARY IS NAMED ONCE: not when it is the addressee, and not again when it is the starter.
  const secretaries = listParticipants()
    .agents.filter((one) => one.role === 'secretary' && !one.retired)
    .filter((one) => one.handle !== registry?.handle && one.handle !== starterRow?.handle)
    .map(named)
  // THE STATE IN THE DOT'S OWN WORD. Red is a retired agent, or no row at all (`theRedReasonFor` in
  // lib/presence.ts). Every grey word has its own state, chosen by the one map below; no word is guessed
  // into Offline.
  const state: CannotReceiveState = gone
    ? registry !== null && 'retired' in registry && registry.retired
      ? 'retired'
      : 'not registered'
    : theCannotReceiveStateOfAGreyWord(reading.word)
  // THE PERSON BY THEIR OWN NAME, as the registry holds it. No name recorded is said as such, never guessed.
  const person = readParticipant({ kind: 'person', id: THE_PERSON })
  const personName = person === null || person.name.trim() === '' ? null : person.name.trim()
  return { agent, state, bySetting: !gone, person: personName, starter: starterName, secretaries }
}

/**
 * THE STATE A GREY WORD NAMES, in the words `theCannotReceiveLine` says. One map, used by the agent's send check
 * (`whatStopsAMessageTo`) and by the 409's reason for an agent nothing holds (lib/records.ts), so a new grey word
 * cannot be mapped in one place and guessed in the other. Adding a grey word without mapping it here fails the type
 * check; no word is guessed into Offline.
 */
export function theCannotReceiveStateOfAGreyWord(word: GreyPresenceWord): CannotReceiveState {
  const greyStates = {
    [GREY_PRESENCE_WORDS.offline]: 'offline',
    [GREY_PRESENCE_WORDS.inactive]: 'inactive',
    [GREY_PRESENCE_WORDS.inATerminal]: 'in a terminal',
  } as const satisfies Record<GreyPresenceWord, CannotReceiveState>
  return greyStates[word]
}

/**
 * WHY A MESSAGE TO THIS PARTICIPANT WOULD REACH NOBODY, in English, or null when it would reach somebody.
 * The door's refusal, and what an agent reads. Built by the one builder from `whatStopsAMessageTo`.
 */
export function whyThisAgentCannotReceiveAMessage(
  to: ParticipantRef,
  workspaceId: string,
  now: Date = new Date(),
): string | null {
  const said = whatStopsAMessageTo(to, workspaceId, now)
  return said === null ? null : theCannotReceiveLine(said, sayInEnglish)
}

export { NOTHING_WAS_SENT }

// ============================================================================ the pool

/** Read a row of either kind into one shape. An annotation has no sender, no recipients and no marks. */
function asEntry(row: MessageRow, deliveries: readonly DeliveryOnTheWire[], said: WhatTheProjectSays, officeTest: (who: ParticipantRef) => boolean = isMoleOffice): PoolEntry {
  if (row.kind === 'annotation') {
    const data = (row.data ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      // NOT GUESSED AT. A comment written before the pool existed says who wrote the record in the
      // change log and says nothing about a participant. Reading the ledger here and calling the
      // answer a sender would be this file inventing a fact the row does not hold.
      sentBy: null,
      from: null,
      to: [],
      // A COMMENT OF THE OLDER KIND WAS ADDRESSED TO NO GROUP. Groups arrived with part 2e, so no
      // annotation row carries one and null is what the row says rather than a default.
      toGroup: null,
      body: typeof data['body'] === 'string' ? data['body'] : '',
      title: row.title,
      sentAt: row.createdAt,
      target: data['context'] ?? null,
      // AN ANNOTATION QUOTES THE ONE PLACE IT WAS LEFT ON, read through the same reader as a message.
      quotes: quotesOf({ kind: row.kind, data }),
      quotePositions: null,
      // A COMMENT OF THE OLDER KIND OFFERS TO TAKE NOBODY ANYWHERE. Leading arrived with the message
      // pool, so no annotation row carries one and null is what the row says rather than a default.
      lead: null,
      // AN ANNOTATION IS A COMMENT, so whether its words went out is the same question, answered
      // by the same reader. Many of these went out before Mole Office recorded which conversation
      // carried them, and `commentsGoneOut` knows about that marker too. An annotation has no
      // delivery rows at all — the empty list below is the row's own answer, not a stand-in — so
      // the review's marker is the only thing that can have handed one over.
      notSentYet: nobodyHasBeenHandedIt(row.id, [], said.goneOut),
      // AN ANNOTATION IS SOMEBODY'S OWN WORDS AND NEVER A LINE MOLE OFFICE WROTE, so there is no
      // sentence behind it. Null says that rather than leaving the field off.
      saidInFull: null,
      // AND IT IS NO KIND OF OFFICE LINE EITHER, for the same reason. Null, not the field left off.
      notice: null,
      // AN ANNOTATION CAME OUT OF NO RUN. Comments of the older kind are what a person left on a
      // page, and no run has ever filed one.
      ranBy: null,
      // AND NOBODY RECORDED WHERE ONE WAS WRITTEN FROM. Criterion M63 arrived with the message
      // kind, and no annotation row carries the field. Null says nobody looked rather than that it
      // came from nowhere.
      writtenFrom: null,
      // AND A COMMENT OF THE OLDER KIND IS NEVER AN EMERGENCY. Nothing could have written the flag
      // on one: M62 arrived with the message kind.
      urgent: false,
      onlyOn: null,
      // AND NOBODY SAID WHETHER IT ASKS THE PERSON ANYTHING. The field arrived with the message kind
      // long after these comments, so null is the row's own answer and not "asks nothing".
      asksThePerson: null,
      // AND NO PRESS OF SEND MADE IT, so it carries no id of one. Problem KzLydNEm4HYX.
      sendId: null,
      // AND A COMMENT OF THE OLDER KIND IS CHANGED THROUGH ITS OWN DOOR, which writes no edit mark.
      edited: null,
      wordsMayChangeUntil: null,
      // AND A COMMENT OF THE OLDER KIND CARRIES NO PICTURES. Criterion M64 arrived with the message
      // kind, and no annotation row holds the field. The empty list is the row's own answer.
      pictures: [],
      // AND IT HAS NO SENDER AT ALL, so there is no rung to read and no chain it could have gone
      // round. Null here is the row's own answer and not a stand-in.
      sentByRole: null,
      wentRoundItsStarter: null,
      deliveries: [],
      // AN ANNOTATION WAS ADDRESSED BEFORE THE ROUTING EXISTED, and an old comment carries no routed
      // entries. Empty is the row's own answer, not a stand-in.
      routed: [],
      entry: 'annotation',
    }
  }
  // THE KIND IS ADDED TO THE MESSAGE ITSELF, as its last field, so no second object is made for each message a read builds.
  return Object.assign(asMessage(row, deliveries, said, officeTest), { entry: 'message' as const })
}

/**
 * THE EMERGENCY MESSAGES THIS READER, ON THIS SCREEN, HAS NOT DISMISSED. Criterion M62.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SERVER DECIDES WHO SEES ONE, AND NOT THE PAGE
 * ---------------------------------------------------------------------------------------
 *
 * A message may be narrowed to one viewer — criterion M62 holds the person's words for it. What narrows it
 * is the MACHINE and the PROGRAM, and a browser does not know
 * its own machine: nothing in a page can read the name of the computer it is running on. The server
 * measures it, on the very request that is asking, exactly as it does when a message is written
 * (criterion M63). So the question "is this one for me?" is answered where the measurement is.
 *
 * DISMISSING IS THE DELIVERY MARK, and nothing new is stored. An emergency is waiting while this
 * reader's mark for it is not `seen`, which is the same rule an offer to take somebody somewhere
 * already answers to. One press marks it read, and it is then dismissed on every screen this
 * person has open rather than on the one they pressed.
 *
 * ACROSS EVERY PROJECT, deliberately. An emergency addressed to a person is about the person, and
 * changing project must not make one disappear. The same reading M55 already made of the chat.
 */
export function forcedMessagesFor(
  me: ParticipantRef,
  where: { machine: string | null; program: string | null },
): PoolEntry[] {
  // ONLY THE MESSAGES THAT CAN PASS ARE BUILT: urgent ones, in every project, holding a delivery to this reader that is
  // not `seen`. It read and built the whole pool before, 2,840 statements on an office of 3,206 messages with none
  // urgent (wave 13x round 13), and every sidebar page asks it. The filter below is the rule itself and is unchanged:
  // `json_type` keeps a stored `true` and nothing else, which is what `isUrgent` keeps.
  const rows = db
    .select(MESSAGE_COLUMNS)
    .from(records)
    .where(
      and(
        messagesInTheViewOf(EVERY_PROJECT, true),
        theKindOfARowFoundById('message'),
        isNull(records.deletedAt),
        inArray(records.id, theIdsNotSeenBy(me)),
        sql`json_type(${records.data}, '$.urgent') = 'true'`,
      ),
    )
    .orderBy(records.createdAt, sql`rowid`)
    .all() as MessageRow[]
  return entriesOf(rows, EVERY_PROJECT).filter((one) => {
    if (!one.urgent) return false
    const mine = one.deliveries.find((row) => sameParticipant(row.to, me))
    if (mine === undefined || mine.mark === 'seen') return false
    return thisScreenIsTheOneNamed(one, where)
  })
}

/**
 * IS THIS SCREEN THE ONE THE MESSAGE NAMED? A message that named none is for every screen.
 *
 * BOTH HALVES ARE OPTIONAL AND EACH NARROWS ON ITS OWN. `{machine:'cedar'}` is every program on
 * cedar; `{program:'Chrome'}` is Chrome wherever it is; both together are one browser on one
 * machine. An empty object narrows nothing, which is the same as leaving the field out.
 *
 * A NARROWING NOBODY CAN ANSWER SHOWS THE MESSAGE TO NOBODY, and that is deliberate rather than a
 * gap. If Mole Office could not measure this reader's machine, it cannot say the reader is on
 * cedar, and showing a cedar-only emergency to a screen it could not place would be the silent
 * substitution this product forbids. The message is still in the conversation for them to read.
 */
export function thisScreenIsTheOneNamed(
  said: PoolEntry,
  where: { machine: string | null; program: string | null },
): boolean {
  const data = said.onlyOn
  if (data === null) return true
  if (data.machine !== null && data.machine !== where.machine) return false
  if (data.program !== null && data.program !== where.program) return false
  return true
}

/**
 * THE COMMENTS ON ONE PROJECT'S RECORDS: a message is one when its target names a record of that project. A comment
 * whose target names no project (the older shape) is taken as on the project it was filed in, which the move into the
 * message centre kept as `writtenIn.project`: a target in another project was refused when it was written.
 */
function commentsOnTheRecordsOf(workspaceId: string): SQL {
  // THE KIND AND THE TARGET IN THE WORDS OF MIGRATION 0209'S INDEX, so SQLite reads only the messages that have a
  // target. Every comment has one, so asking for it first keeps the same messages.
  return and(
    eq(records.workspaceId, MESSAGE_CENTRE),
    ONE_KIND_WRITTEN_OUT.message,
    isNotNull(STORED_FIELDS.messageTargetType(records.data)),
    aCommentOnARecordOf(workspaceId),
  ) as SQL
}

/**
 * Every message in one project's view, newest first: what a project's message board draws. The message centre, or
 * `MESSAGE_CENTRE` passed as the project, is every message.
 *
 * ONLY THE MESSAGES OF ONE ORIGIN, when `only` names one. The others are left out before any message is built, so a
 * reader that keeps only authored messages builds no other one. The pixel office's scene read every message of the
 * project a second time to learn which were authored, and built every one with its deliveries: about 0.8 s of a 2.5 s
 * scene on a copy of the office at the live counts, whose messages are all fixtures (wave 13y round 25). A row's origin
 * is read by `readOrigin`, as every record's is, so a message stored as `Authored` is still authored here.
 */
export function messagePool(workspaceId: string, only?: { origin: RecordOrigin }): PoolEntry[] {
  const read = db
    .select({ ...MESSAGE_COLUMNS, origin: records.origin })
    .from(records)
    .where(and(messagesInTheViewOf(justThisProject(workspaceId)), eq(records.kind, 'message'), isNull(records.deletedAt)))
    .orderBy(NEWEST_FIRST)
    .all()
  const rows: MessageRow[] = only === undefined ? read : read.filter((row) => readOrigin(row.origin) === only.origin)
  return entriesOf(rows, EVERY_PROJECT)
}

/**
 * THE POOL'S ORDER, NEWEST FIRST: the moment a message was written, and then the order the rows were stored. SQLite gave
 * messages of one moment in the order stored before round 89 of wave 13y wrote it down, because it sorted rows it had
 * read in that order. A page counted by `thePoolCountedFor` is cut in this order too, so it is that part of the pool.
 */
const NEWEST_FIRST = sql`${records.createdAt} DESC, ${records}.rowid`

/** A message as a page of the Messages page counts it: its id, and the delivery rows to the reader alone. */
export interface ACountedMessage {
  id: string
  entry: 'message'
  deliveries: DeliveryOnTheWire[]
}

/**
 * EVERY LIVE MESSAGE OF THE MESSAGE CENTRE, NEWEST FIRST, AS A PAGE OF THE MESSAGES PAGE COUNTS IT (round 89 of wave
 * 13y). The page shows fifty messages, says how many there are, and says how many this reader has not read. The door
 * built every message whole for that: about 0.8 s on a made-up office of the live size. This reads each message's id,
 * in the pool's order (`NEWEST_FIRST`), and the reader's own delivery rows, read as every pool reads them. The messages
 * on the page are built by `theseMessagesOfThePool`.
 *
 * The ids are read through the index of every message's moment, named, so a missing index is an error and not a slow
 * read. Its WHERE terms are written out as `theViewFromAMoment` writes them, because SQLite uses a partial index only for
 * a query that names them so. The reader's rows are read under every stored kind `theRecipientOf` reads as the reader's.
 */
export function thePoolCountedFor(me: ParticipantRef): ACountedMessage[] {
  const inTheCentre = sql.raw(`"records"."workspace_id" = '${MESSAGE_CENTRE}'`)
  const ids = db.all<{ id: string }>(
    sql`SELECT ${records.id} AS id FROM ${records} INDEXED BY records_message_moment_idx WHERE ${and(ONE_KIND_WRITTEN_OUT.message, inTheCentre, isNull(records.deletedAt))} ORDER BY ${NEWEST_FIRST}`,
  )
  const mine = new Map<string, DeliveryOnTheWire[]>()
  for (const row of db
    .select()
    .from(messageDelivery)
    .where(and(inArray(messageDelivery.recipientKind, theStoredKindsReadAs(me.kind)), isOneOfTheIds(messageDelivery.recipientId, me.kind === 'agent' ? theRegistryIdsOf(sqlite, me.id) : [me.id])))
    .orderBy(messageDelivery.at, messageDelivery.id)
    .all()) {
    mine.set(row.messageId, [...(mine.get(row.messageId) ?? []), aDeliveryOnTheWire(row)])
  }
  return ids.map(({ id }): ACountedMessage => ({ id, entry: 'message', deliveries: mine.get(id) ?? [] }))
}

/**
 * THE POOL, AS THIS READER MAY READ IT: `onlyTheMessagesThisReaderMayRead(reader, messagePool(workspaceId))`, with only
 * the messages kept built (round 143 of wave 13y). An agent's read of the message centre built every message whole and
 * then kept the few it is a party to. In the live office on 7 November 2026, the reads of one project's agents built
 * 96,933 messages each, and those that took over 300 ms took about 2 s on average to answer about 90. This starts
 * from the messages the reader could be a party to (`theNarrowingFor`, which the rule narrows a long list by), keeps
 * those it may read by the same rule, and builds those alone, in the pool's order. A reader who reads every message,
 * and a project's view, still read the pool whole.
 *
 * THE KEPT IDS ARE PUT IN THE POOL'S ORDER BY SQLITE in one statement, as one JSON list, which binds one value however
 * many ids it holds. Read in pieces (src/server/db/in-pieces.ts), each piece would be sorted alone. The narrowing can
 * hold a deleted message or one outside the message centre, and this read leaves those out, as the pool does.
 */
export function thePoolThisReaderMayRead(reader: AMessageReader, workspaceId: string): PoolEntry[] {
  if (reader.readsEveryMessage || workspaceId !== MESSAGE_CENTRE) return onlyTheMessagesThisReaderMayRead(reader, messagePool(workspaceId))
  const me = reader.who
  if (me === null) return []
  const kept = withEachNarrowingWorkedOutOnce(() => theMessagesThisReaderMayRead(reader, [...theNarrowingFor(me)]))
  const inThePoolsOrder = db.all<{ id: string }>(
    sql`SELECT ${records.id} AS id FROM ${records} WHERE ${records.id} IN (SELECT value FROM json_each(${JSON.stringify([...kept])})) AND ${and(theKindOfARowFoundById('message'), theProjectOfARowFoundById(MESSAGE_CENTRE), isNull(records.deletedAt))} ORDER BY ${NEWEST_FIRST}`,
  )
  return theseMessagesOfThePool(inThePoolsOrder.map((row) => row.id))
}

/**
 * THESE MESSAGES, BUILT AS THE POOL BUILDS THEM, IN THE ORDER OF THE IDS (round 89 of wave 13y): the page of the Messages
 * page that `thePoolCountedFor` counted. An id that names no live message is an error. The door reads the ids and then
 * these rows with nothing between them, so a missing one means the two reads disagree, and a page with a message
 * left out would say the message was not there.
 */
export function theseMessagesOfThePool(ids: readonly string[]): PoolEntry[] {
  const rows = readInPieces(ids, (piece) =>
    db
      .select(MESSAGE_COLUMNS)
      .from(records)
      .where(and(inArray(records.id, piece), theKindOfARowFoundById('message'), isNull(records.deletedAt)))
      .all() as MessageRow[],
  )
  const byId = new Map(rows.map((row) => [row.id, row]))
  const inOrder = ids.map((id) => {
    const row = byId.get(id)
    if (row === undefined) throw new Error(`Message ${id} was counted for this page, and no live message has that id to build.`)
    return row
  })
  return entriesOf(inOrder, EVERY_PROJECT)
}

/**
 * A MESSAGE AS THE TALK READS IT (round 76 of wave 13y): who sent it, to whom, when, and whether it went out, and none of
 * its words. The talk and the scene hand back no more than that (src/server/lib/pixel-office.ts). Until this round they
 * built every message whole, with its words, its writer's rung and runs and its edit window, to keep these five fields.
 */
export type ATalkEntry = Pick<PoolEntry, 'id' | 'sentAt' | 'sentBy' | 'to' | 'notSentYet'>

export { TALK_COLUMNS } from './message-pool-at-or-after.ts'

export interface TalkRow {
  id: string
  kind: string
  createdAt: string
  sentBy: string | null
  target: string | null
  to: string | null
  chosenRecipient: string | null
  toGroup: string | null
}

export { talkEntriesOf } from './message-pool-at-or-after.ts'

export { theTalksPool } from './the-talks-pool.ts'

export { theirTalksPool } from './their-talks-pool.ts'

export { theMessagesOf } from '../db/their-own-messages.ts'

export type { TheirOwnMessages, AMessageReader } from '../db/types/messages.ts'

export { theirOwnMessages } from '../db/their-own-messages.ts'

export { onlyTheirs } from './newest-withdrawn-message-pool-first.ts'

/** A message as the talk reads it, with the projects of the list asked whose views hold it, in the list's order. */
export interface ATalkEntryInViews {
  entry: ATalkEntry
  projects: string[]
}

export { messagePoolAtOrAfter } from './message-pool-at-or-after.ts'

export { newestMessagePoolFirst } from './newest-message-pool-first.ts'

/** A withdrawn message of `withdrawnMessagePool`, read as the talk reads a live one (`talkEntriesOf`). */
export interface AWithdrawnMessage {
  entry: ATalkEntry
  /**
   * Whether the record's origin is `authored`, read through readOrigin as a live message's is (src/server/lib/records.ts
   * reads every record so). A row stored as 'Authored' is drawn while it is live, so it is named once it is withdrawn.
   */
  authored: boolean
  /** The append order of the newest `delete` change row of the message. */
  order: number
}

export { withdrawnMessagePool } from './withdrawn-message-pool.ts'

export { withdrawnMessagePoolAfter } from './withdrawn-message-pool-after.ts'

export { newestWithdrawnMessagePoolFirst } from './newest-withdrawn-message-pool-first.ts'

export { withdrawnPoolBetween } from './newest-withdrawn-message-pool-first.ts'

export { withdrawnEntriesOf } from './withdrawn-message-pool.ts'

/**
 * THE IDS OF THE MESSAGES HOLDING A DELIVERY TO THIS READER THAT IS NOT `seen`, as a query a read may use once. The
 * delivery rows carry the reader and the mark and are indexed by recipient, so this is how a read asks for what one
 * reader has not seen without building every message first. `messagesWaitingFor` and `forcedMessagesFor` ask it.
 */
function theIdsNotSeenBy(who: ParticipantRef) {
  return db
    .select({ id: messageDelivery.messageId })
    .from(messageDelivery)
    .where(and(eq(messageDelivery.recipientKind, who.kind), isOneOfTheIds(messageDelivery.recipientId, who.kind === 'agent' ? theRegistryIdsOf(sqlite, who.id) : [who.id]), ne(messageDelivery.mark, 'seen')))
}

/** Select and count one page of a person's waiting leads without building the other messages. */
export function aPageOfWaitingLeads(who: ParticipantRef, workspaceId: string, limit: number, offset: number, putOff: readonly string[], maker?: ParticipantRef | null): { ids: string[]; total: number } {
  // The office's reminder stores the original maker in backAsYouAsked; every other offer uses its writer.
  const makerKind = sql`case when json_type(${records.data}, '$.extra.backAsYouAsked') is null then json_extract(${records.data}, '$.sentBy.kind') else json_extract(${records.data}, '$.extra.backAsYouAsked.from.kind') end`
  const makerId = sql`case when json_type(${records.data}, '$.extra.backAsYouAsked') is null then json_extract(${records.data}, '$.sentBy.id') else json_extract(${records.data}, '$.extra.backAsYouAsked.from.id') end`
  const kept = and(
    messagesInTheViewOf(justThisProject(workspaceId), true),
    theKindOfARowFoundById('message'),
    isNull(records.deletedAt),
    inArray(records.id, theIdsNotSeenBy(who)),
    sql`json_type(${records.data}, '$.lead') = 'object'`,
    sql`${records.id} not in (select value from json_each(${JSON.stringify(putOff)}))`,
    maker === undefined ? undefined : maker === null ? sql`0` : and(eq(makerKind, maker.kind), eq(makerId, maker.id)),
  )
  const total = db.select({ n: sql<number>`count(*)` }).from(records).where(kept).get()?.n ?? 0
  const ids = db.select({ id: records.id }).from(records).where(kept).orderBy(NEWEST_FIRST).limit(limit).offset(offset).all().map((one) => one.id)
  return { ids, total }
}

/**
 * THE MESSAGES THIS READER HAS NOT SEEN, AND ONLY THOSE (acceptance finding 26, 22 September 2026).
 *
 * `GET /api/messages?only=waiting-for-me` used to read the whole pool and filter it. The dsh
 * PostToolUse hook asks that question after every tool call — about eleven times per small task —
 * and the pool on the live office is 7,199 messages, each one built with its deliveries before the
 * filter threw it away. A CPU profile of the office under ten working agents put 21% of its whole
 * time in that walk, and the office serves on one thread.
 *
 * The delivery rows already carry the reader and the mark, and are indexed by recipient. So the
 * question is asked of them: the messages of this project holding a delivery to this reader that is
 * not `seen`. The rule is the same one the door filtered by, and the answer is the same rows in the
 * same order: newest first.
 */
export function messagesWaitingFor(workspaceId: string, who: { kind: 'person' | 'agent'; id: string }): PoolEntry[] {
  // Wave 13y round 38: ties keep the order the rows were stored, as the kind index gave them before.
  // The read by id no longer gives that order by itself, so the rowid tie-break writes it down.
  const rows = db
    .select(MESSAGE_COLUMNS)
    .from(records)
    .where(and(messagesInTheViewOf(justThisProject(workspaceId), true), theKindOfARowFoundById('message'), isNull(records.deletedAt), inArray(records.id, theIdsNotSeenBy(who))))
    .orderBy(NEWEST_FIRST)
    .all() as MessageRow[]
  const deliveries = deliveriesOfMany(rows.map((row) => row.id))
  const said = whatTheProjectSays(EVERY_PROJECT, rows)
  const officeTest = theMoleOfficeTest()
  return rows.map((row) => asEntry(row, deliveries.get(row.id) ?? [], said, officeTest))
}

/**
 * THE MESSAGES WAITING FOR THIS READER'S ANSWER, by id.
 *
 * The rule is `theQuestionsWaitingForTheAnswerOf` in src/shared/messages.ts, and this only hands it
 * the messages it needs: every message the reader was handed or sent, in every project, oldest first
 * and in the order they were stored within one second (`theMessagesOfOneReader`). Every project,
 * because the reader may write back from another project and that still answers the question.
 *
 * EACH SENDER AND EACH RECIPIENT IS NAMED AS THE CONTACTS DOOR NAMES IT IN THE PROJECT ASKED (wave 13y round 91, gap 5).
 * The rule keys a question by its sender and an answer by its recipient. As stored, a question stored under an agent's
 * own record, or an answer whose delivery row stores the agent's handle or own record, was the agent's under another
 * key, so the person's answer to the agent left the question waiting. Each is named by `theWritersOfOnePool`, with the
 * own records of the agents these messages store in `workspaceId`; one nobody answers is kept as stored.
 */
export function theIdsWaitingForTheAnswerOf(who: ParticipantRef, workspaceId: string): Set<string> {
  if (who.kind !== 'person') return new Set()
  const registered = everybodyRegistered()
  const said = theMessagesOfOneReader(who, registered, EVERY_PROJECT)
  const writers = theWritersOfOnePool(withTheRecordsTheseMessagesStore(registered, said, workspaceId))
  return theQuestionsWaitingForTheAnswerOf(
    who,
    said.map((one) => {
      const stored = one.deliveries.map((delivery) => delivery.to)
      const reached = writers.recipientsOf({ to: stored })
      const sentBy = one.sentBy === null ? null : (writers.senderOf(one) ?? one.sentBy)
      if (reached === stored && (sentBy === null || sameParticipant(sentBy, one.sentBy!))) return one
      return { ...one, sentBy, deliveries: one.deliveries.map((delivery, n) => ({ ...delivery, to: reached[n] ?? delivery.to })) }
    }),
  )
}

/**
 * EVERY COMMENT IN ONE PROJECT: the annotations written before the pool, and the messages with a
 * target written since. Oldest first, because a page draws them in the order they were left.
 *
 * This is the function every reader of comments calls. A reader that asks the database for records
 * of kind `annotation` sees half the comments and nothing tells it so.
 */
export function commentsIn(workspaceId: string): PoolEntry[] {
  const rows = db
    .select(MESSAGE_COLUMNS)
    .from(records)
    .where(
      and(
        // AN ANNOTATION IS STILL FILED IN ITS PROJECT; A COMMENT THAT IS A MESSAGE IS IN THE MESSAGE CENTRE, and belongs to
        // the project of the record it points at.
        or(and(eq(records.workspaceId, workspaceId), eq(records.kind, 'annotation')), commentsOnTheRecordsOf(workspaceId)),
        isNull(records.deletedAt),
      ),
    )
    .orderBy(records.createdAt)
    .all() as MessageRow[]
  const kept = rows.filter((row) => row.kind === 'annotation' || targetOf(row) !== null)
  const deliveries = deliveriesOfMany(kept.filter((row) => row.kind === 'message').map((row) => row.id))
  const said = whatTheProjectSays(EVERY_PROJECT, kept)
  const officeTest = theMoleOfficeTest()
  return kept.map((row) => asEntry(row, deliveries.get(row.id) ?? [], said, officeTest))
}

/** The place a row points at, whichever field its kind keeps it in, or null when it points nowhere. */
export function targetOf(row: { kind: string; data: unknown }): Context | null {
  const data = (row.data ?? {}) as Record<string, unknown>
  const held = row.kind === 'annotation' ? data['context'] : data['target']
  if (held === null || held === undefined || typeof held !== 'object') return null
  return held as Context
}

/**
 * EVERY COMMENT IN ONE PROJECT AS A WHOLE RECORD, of both kinds, newest change first.
 *
 * The shape `listRecords` hands back, because every reader of comments already works in it: a
 * review's members, the marks drawn on a page, and the list of comments a review left out. Those
 * readers used to ask the database for records of kind `annotation`, which from this build on is
 * half the comments with nothing saying so.
 */
export function commentRecordsIn(workspaceId: string, includeDeleted = false): PanelRecord[] {
  // THE MESSAGES ARE THE COMMENTS ON THIS PROJECT'S RECORDS, whichever project each was written in.
  const messages = db
    .select()
    .from(records)
    .where(and(commentsOnTheRecordsOf(workspaceId), includeDeleted ? undefined : isNull(records.deletedAt)))
    .all()
    .map(toRecord)
  const both = [...listRecords({ workspaceId, kind: 'annotation', includeDeleted }), ...messages]
  return both
    .filter((record) => isAComment(record))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
}

/**
 * THESE COMMENTS, EACH WITH ITS PLACE IN THE ORDER THEY WERE WRITTEN, 1 for the first (`writtenOrder`).
 *
 * It is the order every conversation is drawn in (`APlace`): the stamp, then the order the rows were
 * stored in. A stamp is kept to the second, so a remark and the person's answer to it are often
 * written in the same second, and only the stored order tells them apart. An agent's card on a page
 * reads this to know which was said first; before, it broke the tie by id, and when the answer's id
 * sorted first the place got no card (wave 13y round 29).
 */
export function withTheOrderWritten(comments: readonly PanelRecord[]): ACommentWithItsWrittenOrder[] {
  const places = readInPieces(comments.map((comment) => comment.id), (piece) =>
    db.select({ id: records.id, createdAt: records.createdAt, rowid: sql<number>`rowid` }).from(records).where(inArray(records.id, piece)).all(),
  ).sort(earlierPlaceFirst)
  const order = new Map(places.map((place, at) => [place.id, at + 1]))
  return comments.map((comment) => {
    const writtenOrder = order.get(comment.id)
    if (writtenOrder === undefined) throw new Error(`Comment ${comment.id} has no stored row, so its place in the order written cannot be read.`)
    return { ...comment, writtenOrder }
  })
}

/**
 * WHETHER A COMMENT BEING WRITTEN NOW ANSWERS SOMEBODY WHO ALREADY SPOKE ABOUT THAT PLACE.
 *
 * ASKED ONLY WHEN THE WRITER DID NOT SAY. A message may name the message it answers, in `inReplyTo`,
 * and the answer a person types into an agent's comment card does. This is what a reader gets when
 * nobody said: has any of the people this one is addressed to already said something about this
 * exact place? True makes it an answer and false makes it a first remark, and the channel carries
 * the two under different names because an agent waiting to be answered cares which it is.
 *
 * A comment and an answer to one are the same kind of row, and this is why nothing was ever
 * required to join them: an answer is a message about the same place, addressed to whoever said the
 * first thing. The reason is that a comment a person leaves is only a special kind of message. What `inReplyTo` adds is
 * WHICH of an agent's remarks on one page was answered, which the place and the addressee cannot
 * say. Problem `Wjb30lfFs62C`.
 */
export function answersSomebodyHere(key: string, to: readonly ParticipantRef[], workspaceId: string): boolean {
  if (to.length === 0) return false
  for (const one of commentsIn(workspaceId)) {
    const target = one.target as Context | null
    if (target === null) continue
    if (contextKey(target) !== key) continue
    if (one.sentBy === null) continue
    if (to.some((who) => sameParticipant(who, one.sentBy as ParticipantRef))) return true
  }
  return false
}

/** Whether one record is a comment: an annotation, or a message that says where it points. */
export function isAComment(row: { kind: string; data: unknown }): boolean {
  return recordIsAComment({ kind: row.kind, data: (row.data ?? {}) as Record<string, unknown> })
}

/**
 * EVERY COMMENT ON ONE RECORD, of both kinds, oldest first.
 *
 * A comment points at a target, and a target names the record it is on in its own `recordId`. This
 * reads that out of the stored place rather than keeping a second column for it.
 */
export function commentsOnRecord(recordId: string, workspaceId: string): PoolEntry[] {
  return commentsIn(workspaceId).filter((one) => {
    const target = one.target as Context | null
    if (target === null) return false
    const ids = target.target as unknown as Record<string, unknown>
    return ids['recordId'] === recordId
  })
}

// ============================================================================ conversations

/** One conversation: two participants and what has been said between them. */
export interface Conversation {
  between: readonly [ParticipantRef, ParticipantRef]
  messages: readonly PoolEntry[]
}

/**
 * True when this message was sent by one of the two and reached the other, or is a line about them both.
 *
 * `aboutParties` maps a message id to the two people that message is between, for the M128 rule
 * below. A caller that has the whole pool builds it once and hands it in; a caller with no M128
 * notice in play leaves it out and the rule is simply not asked.
 *
 * THE RULE ITSELF IS `everyoneElseThisMessageIsBetween` BELOW. This asks it about one pair, and
 * `contactsFor` asks it once per message for every contact at once. One rule, so the two cannot
 * disagree about which messages are between whom.
 *
 * `writers` is `theWritersOfOnePool(everyone)`, made once by a caller that asks about many
 * messages, so each writer and each recipient is looked up in the registry once and not once per message.
 */
function isBetween(
  one: Pick<MessageOnTheWire, 'sentBy' | 'from' | 'to' | 'toGroup' | 'aboutMessage'>,
  a: ParticipantRef,
  b: ParticipantRef,
  everyone: readonly KnownParticipant[],
  aboutParties?: ReadonlyMap<string, readonly [ParticipantRef, ParticipantRef]>,
  writers: Pick<ReturnType<typeof theWritersOfOnePool>, 'senderOf' | 'recipientsOf' | 'participantOf'> = theWritersOfOnePool(everyone),
  officeTest: (who: ParticipantRef) => boolean = isMoleOffice,
): boolean {
  const sender = one.toGroup !== null ? null : writers.senderOf(one)
  const recipients = one.toGroup !== null ? [] : writers.recipientsOf(one)
  return everyoneElseThisMessageIsBetween(one, a, sender, recipients, writers.participantOf, aboutParties, officeTest).some((other) => sameParticipant(other, b))
}

/**
 * EVERY PARTICIPANT `b` FOR WHICH THIS MESSAGE IS BETWEEN `a` AND `b`, possibly with repeats.
 *
 * `sender` is `senderOf(one, everyone)` and `recipients` is `recipientsOf(one)` of `theWritersOfOnePool(everyone)`,
 * each worked out by the caller. A caller reading the whole pool works them out once per stored participant rather
 * than once per message, because each walks the whole registry.
 *
 * WHO A MESSAGE REACHED IS READ AS ITS WRITER IS (wave 13y round 91). A delivery row may store an agent's handle or
 * its own record, in rows written before the door stored the registry id. Compared as stored, such a message was in
 * no conversation of that agent's, read by either side. `recipients` is each stored recipient as
 * `theAgentAStoredSenderNames` reads it, and the recipient as stored when nobody answers it.
 *
 * SO ARE THE TWO SIDES OF THE MESSAGE A NOTICE IS ABOUT (wave 13y round 91, gap 7). `aboutParties` holds them as that
 * message stored them, because one read of a pool may serve several projects, whose own records differ. `participantOf`
 * is `theWritersOfOnePool(everyone)`'s, the same list `sender` and `recipients` were named with. Compared as stored, a
 * notice about a message stored under an agent's handle was in no conversation of that agent's, so the chat drew no
 * offer to bring the message back.
 */
function everyoneElseThisMessageIsBetween(
  one: Pick<MessageOnTheWire, 'toGroup' | 'aboutMessage'>,
  a: ParticipantRef,
  sender: ParticipantRef | null,
  recipients: readonly ParticipantRef[],
  participantOf: (who: ParticipantRef) => ParticipantRef,
  aboutParties?: ReadonlyMap<string, readonly [ParticipantRef, ParticipantRef]>,
  officeTest: (who: ParticipantRef) => boolean = isMoleOffice,
): ParticipantRef[] {
  // A MESSAGE TO A GROUP IS IN THAT GROUP AND IN NO PRIVATE CONVERSATION. It reached several people,
  // and drawing it in each of their one-to-one conversations would show the same words in three
  // places with no sign that everybody else could read them.
  if (one.toGroup !== null) return []
  if (sender === null) return []
  const reached = (who: ParticipantRef): boolean => recipients.some((to) => sameParticipant(to, who))
  /**
   * A LINE MOLE OFFICE WROTE ABOUT THIS CONVERSATION IS IN IT, WHEN IT REACHED BOTH SIDES.
   *
   * Mole Office is a participant that says what happened (criterion M11), and it is nobody's contact,
   * so it is never one of the two sides. Until 4 September 2026 that meant it could speak in a group
   * and nowhere else: a line it addressed to one person was drawn in no conversation at all.
   *
   * Criteria M22 and M24 both ask for a line in a one-to-one conversation — a run waited for the next
   * message and none came, a restart cut a run off before it answered — and this is what draws one.
   *
   * BOTH SIDES, NEVER ONE. A line that reached only one of them is about something else, and drawing
   * it here would put words into a conversation the other half never received.
   *
   * CRITERION M128 ADDS TWO CASES, AND NEITHER IS A BUBBLE IN THE PERSON–AGENT CHAT:
   *
   *   - A NOTICE ABOUT A MESSAGE IS IN THE CONVERSATION THAT MESSAGE IS IN. `aboutMessage` names it,
   *     and `aboutParties` says who that message was between. This is how a line addressed only to
   *     the person is still drawn beside the conversation it is about, without being addressed to the
   *     agent in it.
   *   - A LINE FROM THE OFFICE TO ONE PARTICIPANT IS IN THE OFFICE'S OWN CONVERSATION WITH THEM. It
   *     is the office speaking to that participant, which is a conversation even though the office is
   *     not a contact and has no row in the list.
   */
  if (officeTest(sender)) {
    const out: ParticipantRef[] = []
    // Reached both sides: every other side is someone it reached.
    if (reached(a)) out.push(...recipients)
    const about = one.aboutMessage
    if (about !== undefined && about !== null && aboutParties !== undefined) {
      const stored = aboutParties.get(about)
      if (stored !== undefined) {
        const pair = [participantOf(stored[0]), participantOf(stored[1])] as const
        if (sameParticipant(pair[0], a)) out.push(pair[1])
        if (sameParticipant(pair[1], a)) out.push(pair[0])
      }
      // A NOTICE ABOUT A MESSAGE IS NOT ALSO DRAWN IN THE OFFICE'S OWN CONVERSATION with the reader.
      // The two rules would otherwise put the same long line in two places.
      return out
    }
    if (officeTest(a)) out.push(...recipients)
    if (reached(a)) out.push(sender)
    return out
  }
  const out: ParticipantRef[] = []
  if (sameParticipant(sender, a)) out.push(...recipients)
  if (reached(a)) out.push(sender)
  return out
}

/**
 * WHICH TWO PEOPLE EACH MESSAGE WITH A SINGLE ADDRESSEE WAS BETWEEN, keyed by the message id.
 *
 * Criterion M128 reads it: a notice naming a message is drawn in the conversation that message is
 * in. Decision `-itqp2gPiHHe`: a message is one conversation, the one its writer addressed, and a
 * routed copy does not put it in a second one. So the pair is read from what the writer addressed,
 * never from the wire `to`, which is the delivery rows and holds every copy the routing added. That
 * list is `whoTheWriterAddressed`'s answer; `asMessage` works it out where the stored `data` is and
 * carries it here. Only a message with a recorded sender and exactly one addressee can be a pair; a
 * group message has no pair, and a message addressed to several people is not one conversation.
 * Built once per read from the pool the caller already holds, so a notice never causes a second read
 * of the pool.
 */
function thePartiesOfEveryPair(
  pool: readonly Pick<MessageOnTheWire, 'id' | 'sentBy' | 'to' | 'toGroup'>[],
): Map<string, readonly [ParticipantRef, ParticipantRef]> {
  const out = new Map<string, readonly [ParticipantRef, ParticipantRef]>()
  for (const one of pool) {
    if (one.toGroup !== null) continue
    if (one.sentBy === null) continue
    // A ROUTED ENTRY CARRIES THE WRITER'S LIST BESIDE THE WIRE SHAPE. Every other entry's `to` is
    // that list already, because no copy was ever added to it.
    const addressed = (one as EntryWithTheWriterAddressed)[THE_WRITER_ADDRESSED] ?? one.to
    const first = addressed[0]
    if (first === undefined || addressed.length !== 1) continue
    out.set(one.id, [one.sentBy, first])
  }
  return out
}

/**
 * THE MEMBERS OF EVERY GROUP A POOL'S MESSAGES NAME, read once for the whole pool.
 *
 * The @ reading needs a group's members and the two words that name each of them. Reading that per
 * message would read the membership table once per group message; this reads it once for the whole
 * pool. `mentionableMembersOfMany` is the one reader that does it.
 */
function theMentionableMembersIn(pool: readonly Pick<MessageOnTheWire, 'toGroup'>[]): Map<string, Mentionable[]> {
  const ids = new Set<string>()
  for (const one of pool) {
    if (one.toGroup !== null) ids.add(one.toGroup)
  }
  return mentionableMembersOfMany([...ids])
}

/**
 * TRUE WHEN THIS GROUP MESSAGE IS A REPLY THAT @s THE OTHER SIDE OF A CONVERSATION.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A GROUP MESSAGE IS IN A PRIVATE CHAT AT ALL. Criterion GM2.
 * ---------------------------------------------------------------------------------------
 *
 * A reply in a group that @s the person stays in the group and also appears in the person's own chat with its sender.
 * It is one record and not a copy, so the chat draws the same message the group draws. Only an @ of that person puts
 * it here: a message that @s nobody, or one that says @所有人, reaches them without addressing them, and forwarding
 * every such line would put the whole group discussion in the private chat, which is the noise the decision
 * removes.
 *
 * THE SENDER IS THE OTHER SIDE. A message in the person's own chat with an agent is one the agent
 * sent and the person was addressed by, or the person sent and the agent was addressed by; only the
 * first is a reply to the person, and `other.kind === 'person'` keeps the second out.
 */
function aGroupReplyThatMentionsTheOtherSide(
  one: Pick<MessageOnTheWire, 'toGroup' | 'sentBy' | 'body'>,
  a: ParticipantRef,
  b: ParticipantRef,
  members: ReadonlyMap<string, readonly Mentionable[]>,
): boolean {
  if (one.toGroup === null || one.sentBy === null) return false
  const senderIsA = sameParticipant(one.sentBy, a)
  const senderIsB = sameParticipant(one.sentBy, b)
  if (!senderIsA && !senderIsB) return false
  const other = senderIsA ? b : a
  if (other.kind !== 'person') return false
  const held = members.get(one.toGroup)
  if (held === undefined) return false
  return whoAMessageMentions(one.body, held).who.some((mentioned) => sameParticipant(mentioned, other))
}

/**
 * WHAT TWO PARTICIPANTS HAVE SAID TO EACH OTHER, oldest first.
 *
 * A message with a target is in here too when it was addressed to the other side: a comment sent to
 * an agent is a thing said to that agent, and leaving it out would make the conversation disagree
 * with the page.
 */
export function conversationBetween(
  a: ParticipantRef,
  b: ParticipantRef,
  which: WhichProjects,
  everyone: readonly KnownParticipant[] = [],
  // THE POOL, READ ONCE BY A CALLER THAT ASKS MANY TIMES. The queue reader asks about one
  // conversation per queued message, and reading every message of every project once per question
  // was 5.7 seconds every poll on 11 September 2026 (problem 9Ys6WS23aGXE). A caller that has the
  // pool hands it in. A caller that does not gets only the messages this conversation can hold,
  // read from the rows `theMessagesOfOnePair` reads, which says why they are enough
  // (`theConversationOfOnePairRead`).
  pool?: readonly PoolEntry[],
): Conversation {
  if (pool === undefined) return { between: [a, b], messages: theConversationOfOnePairRead(a, b, everyone, which) }
  return { between: [a, b], messages: pool.filter(theRuleOfOnePair(pool, a, b, everyone)) }
}

/** A message as the rule `conversationBetween` keeps it by reads it: the sort's fields, with its words. */
type AMessageTheRuleReads = AMessageToSort & { body: string }

/** Whether a message of this pool is in the conversation of `a` and `b`: the rule `conversationBetween` keeps it by. */
function theRuleOfOnePair(
  pool: readonly AMessageTheRuleReads[],
  a: ParticipantRef,
  b: ParticipantRef,
  everyone: readonly KnownParticipant[],
): (one: AMessageTheRuleReads) => boolean {
  const officeTest = theMoleOfficeTest()
  // CRITERION M128: the pair each message was between, so a notice naming a message is drawn in the
  // conversation it is about. Read from the same pool, once for the whole conversation.
  const aboutParties = thePartiesOfEveryPair(pool)
  // CRITERION GM2: a group reply that @s the person is in the person's chat with its sender too. The
  // members of every group this pool names are read once, for the reason the pair map above is.
  const groupMembers = theMentionableMembersIn(pool)
  // EACH WRITER IS LOOKED UP ONCE for the whole conversation. `senderOf` walks the whole registry,
  // and doing that for each of 5,400 messages was about 20 ms on an office of 913 agents.
  const writers = theWritersOfOnePool(everyone)
  return (one) => isBetween(one, a, b, everyone, aboutParties, writers, officeTest) || aGroupReplyThatMentionsTheOtherSide(one, a, b, groupMembers)
}

/**
 * THE CONVERSATION OF `a` AND `b` WHEN NO POOL IS HANDED IN, oldest first: of the rows `theMessagesOfOnePair` reads,
 * only the ones in the conversation are built whole.
 *
 * WHICH ROWS ARE IN IT IS DECIDED ON THE FIELDS THE RULE READS, made by `theFieldsTheSortReads`, which is how `asMessage`
 * makes them for the whole entry. So the rule keeps the same messages it would keep among whole entries, in the same
 * order. Every row here is a message, because `theIdsChosenFor` asks for no other kind.
 *
 * Every row was built whole before and then filtered, so the entries of every message the read chose were held beside
 * the conversation's: for the person, every message they sent or were handed, in every conversation and group. Now the
 * rows left out are let go before any message is built whole.
 */
function theConversationOfOnePairRead(a: ParticipantRef, b: ParticipantRef, everyone: readonly KnownParticipant[], which: WhichProjects): PoolEntry[] {
  const members = theRowsOfOnePairsConversation(a, b, everyone, which)
  return entriesOf(members.rows, which, members.deliveries)
}

/** The rows `theConversationOfOnePairRead` builds whole, with the delivery rows read beside them. */
function theRowsOfOnePairsConversation(a: ParticipantRef, b: ParticipantRef, everyone: readonly KnownParticipant[], which: WhichProjects): MessagesJustRead {
  const read = theRowsChosenFor(a, everyone, which, b)
  const sorted = read.rows.map((row) => {
    const data = (row.data ?? {}) as Record<string, unknown>
    return theFieldsTheSortReads(row, data, read.deliveries.get(row.id) ?? [], routedOf(data))
  })
  const isIn = theRuleOfOnePair(sorted, a, b, everyone)
  const rows = read.rows.filter((_, i) => isIn(sorted[i]!))
  // ONLY THE DELIVERY ROWS OF THE MESSAGES KEPT go on, so the others' are let go with their rows.
  return { rows, deliveries: new Map<string, DeliveryOnTheWire[]>(rows.map((row) => [row.id, read.deliveries.get(row.id) ?? []])) }
}

/**
 * Every conversation of one pool, sorted once: what `conversationBetween` and `messagesInAGroup` answer from it. `Entry`
 * is the kind of entry the pool held: the whole pool's, or the queue's, whose words may not have been read.
 */
export interface TheConversationsOfOnePool<Entry extends AMessageToSort = PoolEntry> {
  /** The messages between `a` and `b`, oldest first: `conversationBetween(a, b, …, everyone, pool).messages`. */
  between: (a: ParticipantRef, b: ParticipantRef) => readonly Entry[]
  /** The messages sent to this group, oldest first: `messagesInAGroup(groupId, …, pool)`. */
  inGroup: (groupId: string) => readonly Entry[]
}

/**
 * EVERY CONVERSATION ONE POOL HOLDS, SORTED IN ONE WALK OF THE POOL. Problem P-P3huQftq9w.
 *
 * `conversationBetween` with a pool walks the whole pool for one pair. The queue asked it once per
 * conversation in the queue, so one read cost the queue's conversations times the pool's messages:
 * 52 seconds for 4,677 queued deliveries and 19,500 messages on an office of the live shape (round 36
 * of wave 13n), every caller alike, with nothing else answered meanwhile. On 4 October 2026 the
 * live office's read took 212 seconds.
 *
 * THE SAME TWO RULES, ASKED THE OTHER WAY ROUND. `conversationBetween(a, b)` keeps a message when
 * `everyoneElseThisMessageIsBetween(one, a, …)` names `b`, or when it is a group reply that @s the
 * other side. Here each message is asked once, for every `a` that rule can answer for — its sender,
 * everyone it reached, and the two of the message a notice is about; for any other `a` the rule
 * names nobody — and filed under each pair the rule names. Mole Office needs no place of its own in
 * that list: the rule names somebody for it only when it sent the message or the message reached it,
 * and then it is already there. The group reply is filed under
 * its sender and each person it @s, both ways round, which is every pair that rule is true for. So
 * `between(a, b)` holds exactly the messages `conversationBetween` keeps, in pool order.
 * tests/no-read-of-the-queue-holds-the-office.test.ts compares the two on an office of the live
 * shape: on the pair that holds group lines and notices, and on 300 other pairs.
 *
 * THE ONLY WORDS IT READS ARE A GROUP LINE'S, to find whom the line @s. So the queue's pool, which leaves every other
 * message's words unread and builds only the fields this reads (`everyMessageOfTheProjectsForTheQueue`), sorts into the
 * same conversations. A group line whose
 * words were not read is refused here, by name: sorted as if it had no words, it would be in no person's chat.
 */
export function theConversationsOfOnePool<Entry extends AMessageToSort>(
  pool: readonly Entry[],
  everyone: readonly KnownParticipant[] = [],
): TheConversationsOfOnePool<Entry> {
  const officeTest = theMoleOfficeTest()
  const aboutParties = thePartiesOfEveryPair(pool)
  const groupMembers = theMentionableMembersIn(pool)
  const writers = theWritersOfOnePool(everyone)
  const pairs = new Map<string, Entry[]>()
  const groups = new Map<string, Entry[]>()
  const keyOfAPair = (a: ParticipantRef, b: ParticipantRef): string => `${participantKey(a)}>${participantKey(b)}`
  for (const one of pool) {
    const filed = new Set<string>()
    const file = (a: ParticipantRef, b: ParticipantRef): void => {
      const key = keyOfAPair(a, b)
      if (filed.has(key)) return
      filed.add(key)
      const held = pairs.get(key)
      if (held === undefined) pairs.set(key, [one])
      else held.push(one)
    }
    if (one.toGroup !== null) {
      if (one.body === null) throw new Error(`message ${one.id} was sent to a group, but its words were not read`)
      const held = groups.get(one.toGroup)
      if (held === undefined) groups.set(one.toGroup, [one])
      else held.push(one)
      // CRITERION GM2, as `aGroupReplyThatMentionsTheOtherSide` asks it: the sender and a person it @s.
      const members = groupMembers.get(one.toGroup)
      if (one.sentBy !== null && members !== undefined) {
        for (const mentioned of whoAMessageMentions(one.body, members).who) {
          if (mentioned.kind !== 'person') continue
          file(one.sentBy, mentioned)
          file(mentioned, one.sentBy)
        }
      }
      continue
    }
    const sender = writers.senderOf(one)
    if (sender === null) continue
    const recipients = writers.recipientsOf(one)
    const about = one.aboutMessage === undefined || one.aboutMessage === null ? undefined : aboutParties.get(one.aboutMessage)
    for (const a of [sender, ...recipients, ...(about ?? []).map(writers.participantOf)]) {
      for (const b of everyoneElseThisMessageIsBetween(one, a, sender, recipients, writers.participantOf, aboutParties, officeTest)) file(a, b)
    }
  }
  return {
    between: (a, b) => pairs.get(keyOfAPair(a, b)) ?? [],
    inGroup: (groupId) => groups.get(groupId) ?? [],
  }
}

/** The most messages one page of a conversation may hold. */
export const A_CONVERSATION_PAGE_HOLDS_AT_MOST = 500

/** What a reader asked of a conversation: how many, and where from. */
export interface APageAsked {
  limit: number
  /** The page just older than this message. */
  before?: string | undefined
  /** The messages newer than this message. */
  after?: string | undefined
  /** With `after`: also the messages at or before it that changed at or after this local stamp. */
  since?: string | undefined
  /** With `since`: only the changed messages at or after this one, in the order of the conversation. */
  from?: string | undefined
}

/** What a page of a conversation says about itself, beside its messages. */
export interface AConversationPage {
  /** True when the conversation holds messages older than every message in this reply. */
  olderRemain: boolean
  /**
   * With `before` or `after`: true when this reply carries on from that message, so a page can add it
   * to what it holds. False when the message is not in the conversation, or when more messages came
   * after it than one page holds; the reply is then the newest page, to be drawn in place of what the
   * page held. Null when neither was asked.
   */
  continuesFromTheCursor: boolean | null
  /** The local time this read began, to be sent back as `since` by the next read. */
  readAt: string
  /** With `since`: messages at or before `after` that changed at or after `since`, read again. */
  changed: PoolEntry[]
  /** With `since`: messages concerning the reader that were deleted at or after `since`. */
  gone: string[]
}

/** A message's place in the order every conversation is drawn in: its stamp, then the order it was stored in. */
interface APlace {
  createdAt: string
  rowid: number
}

/** A message row with its place. */
type APlacedRow = MessageRow & { rowid: number }

/** Which of two places comes first: the earlier stamp, and within one stamp the row stored first. */
function earlierPlaceFirst(one: APlace, other: APlace): number {
  return one.createdAt < other.createdAt ? -1 : one.createdAt > other.createdAt ? 1 : one.rowid - other.rowid
}

/** Keeps only the messages the reader may read, as `onlyTheMessagesThisReaderMayRead` does. */
type WhatTheReaderMayRead = (messages: PoolEntry[]) => PoolEntry[]

/**
 * ONE PAGE OF THE CONVERSATION BETWEEN `a` AND `b`, oldest first, built from that page's messages only.
 *
 * The newest `limit` messages; or the `limit` just older than `before`; or every message newer than
 * `after`, when they fit one page, with what changed among the older ones since `since`. A page is
 * the same messages, in the same order, as the same piece of a whole read: it is read through the
 * narrower selection (`theIdsOfOnePair`, which says why it misses none) and decided by the same rule
 * (`conversationBetween`).
 *
 * WHY IT DOES NOT BUILD THE WHOLE CONVERSATION. Before, the door built every message of the
 * conversation and cut a page out of it, so a page cost what the whole did: about 110 ms for 3,125
 * messages on an office of the live shape (round 33 of wave 13n). Now SQLite gives the messages in
 * order from the cursor, a few more than a page at a time, and only those are built and asked about.
 * More are read only when too few of them turn out to be in the conversation.
 */
export function aPageOfTheConversation(
  a: ParticipantRef,
  b: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
  asked: APageAsked,
  mayRead: WhatTheReaderMayRead,
  readAt: string,
): { messages: PoolEntry[]; page: AConversationPage } {
  const page = (messages: PoolEntry[], over: Partial<AConversationPage>): { messages: PoolEntry[]; page: AConversationPage } => ({
    messages,
    page: { olderRemain: false, continuesFromTheCursor: null, readAt, changed: [], gone: [], ...over },
  })
  const newest = (): { messages: PoolEntry[]; page: AConversationPage } => {
    const older = walk(a, b, everyone, which, mayRead, 'older', null, asked.limit + 1)
    return page(older.slice(-asked.limit), {
      olderRemain: older.length > asked.limit,
      continuesFromTheCursor: asked.before === undefined && asked.after === undefined ? null : false,
    })
  }
  const cursorId = asked.before ?? asked.after
  if (cursorId === undefined) return newest()
  // THE CURSOR MUST BE A MESSAGE OF THIS CONVERSATION THE READER MAY READ, as it had to be in a whole
  // read. Otherwise the reply is the newest page, and says it does not carry on.
  const cursorRows = rowsByIds([cursorId], which)
  const cursor = cursorRows[0]
  if (cursor === undefined || membersAmong(a, b, everyone, which, mayRead, cursorRows).length !== 1) return newest()
  const at: APlace = { createdAt: cursor.createdAt, rowid: cursor.rowid }
  if (asked.before !== undefined) {
    const older = walk(a, b, everyone, which, mayRead, 'older', at, asked.limit + 1)
    return page(older.slice(-asked.limit), { olderRemain: older.length > asked.limit, continuesFromTheCursor: true })
  }
  const newer = walk(a, b, everyone, which, mayRead, 'newer', at, asked.limit + 1)
  if (newer.length > asked.limit) return newest()
  const since = asked.since
  if (since === undefined) return page(newer, { olderRemain: true, continuesFromTheCursor: true })
  // FROM THE OLDEST MESSAGE THE PAGE HOLDS ON, when it names one (wave 13y round 146). A changed message before it
  // is not held, and is drawn when the reader scrolls up to it. One from it on that the page does not hold has joined
  // among the held ones. Only this side knows the order of two messages stamped in the same second, so this side
  // says which is which. A `from` that is not a message of this conversation the reader may read places nothing, and
  // the reply is the newest page, as for such a cursor.
  let from: APlace | null = null
  if (asked.from !== undefined) {
    const fromRows = rowsByIds([asked.from], which)
    const fromRow = fromRows[0]
    if (fromRow === undefined || membersAmong(a, b, everyone, which, mayRead, fromRows).length !== 1) return newest()
    from = { createdAt: fromRow.createdAt, rowid: fromRow.rowid }
  }
  const changedRows = theRowsChangedSince(since, at, which).filter((row) => from === null || earlierPlaceFirst(row, from) >= 0)
  return page(newer, {
    olderRemain: true,
    continuesFromTheCursor: true,
    changed: membersAmong(a, b, everyone, which, mayRead, changedRows),
    gone: theMessagesGoneSince(a, since),
  })
}

/**
 * THE MESSAGES OF THE CONVERSATION STILL QUEUED FOR `me`, oldest first, read from `me`'s queued
 * delivery rows and nothing else. A read of one page marks these delivered, so no message to the
 * person stays queued because it sits on a page nobody has scrolled to.
 */
export function theQueuedOnesOfTheConversation(
  me: ParticipantRef,
  them: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
): string[] {
  const queued = db
    .select({ id: messageDelivery.messageId })
    .from(messageDelivery)
    .where(and(eq(messageDelivery.recipientKind, me.kind), isOneOfTheIds(messageDelivery.recipientId, me.kind === 'agent' ? theRegistryIdsOf(sqlite, me.id) : [me.id]), eq(messageDelivery.mark, 'queued')))
  const rows = rowsWhere(inArray(records.id, queued), which, 'newer', null, null)
  return membersAmong(me, them, everyone, which, (list) => list, rows).map((one) => one.id)
}

/**
 * THE COMMENTS `me` WROTE IN THE CONVERSATION THAT NOBODY HAS SENT YET, oldest first, each built as a whole read builds
 * it: the messages of a whole read whose `notSentYet` is true and whose stored sender is `me`, which are the ones the
 * chat's review send compares. Read from `me`'s own messages that are about a page, through the index on the stored
 * sender, and not from the whole conversation.
 */
export function theUnsentOnesOfTheConversationFrom(
  me: ParticipantRef,
  them: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
  mayRead: WhatTheReaderMayRead,
): PoolEntry[] {
  const live = and(messagesInTheViewOf(which), ONE_KIND_WRITTEN_OUT.message, isNull(records.deletedAt))
  const storedAsMe = and(eq(STORED_FIELDS.messageSentById(records.data), me.id), eq(sql`json_extract(${records.data}, '$.sentBy.kind')`, me.kind))
  const mine = db.select(TALK_COLUMNS).from(records).where(and(live, storedAsMe, eq(STORED_FIELDS.messageTargetType(records.data), 'object'))).all()
  const unsent = talkEntriesOf(mine).filter((one) => one.notSentYet && one.sentBy?.kind === me.kind && one.sentBy.id === me.id)
  return membersAmong(me, them, everyone, which, mayRead, rowsByIds(unsent.map((one) => one.id), which))
}

/**
 * THE IDS OF EVERY MESSAGE THAT CAN BE IN THE CONVERSATION OF `a` AND `b`, and of few others, as a
 * query each read may use once. A page is walked through these, so a walk meets few messages of the
 * reader's other conversations.
 *
 * WHY THESE ARE ENOUGH. `conversationBetween` keeps a message when one of these holds, and each is
 * kept here (a "stored sender" below is read the way `senderOf` reads one: by id, or by the handle
 * of the agent bearing it, and "handed to" reads a delivery row the same way, wave 13y round 91):
 *
 *   1. Its stored sender is `a` and it was handed to `b`, or the other way round.
 *   2. Mole Office wrote it and it was handed to `a`: a line that reached both sides, or Mole
 *      Office's own conversation with `a`.
 *   3. It is a group message whose stored sender is `a` or `b`: a group reply naming the other side.
 *   4. It has a typed `from` line, which decides its sender when it stored none. There are few.
 *   5. It is a notice about a message of 1, whose own pair is read from that message.
 *
 * THE GUARD READS FEWER OF THESE (`reader` 'the guard'), because `theConversationBackTo` asks with no list of
 * participants, and then `conversationBetween` keeps fewer messages:
 *
 *   - A message that stored no sender has none, because `senderOf` reads a typed `from` line only through the list.
 *     So the guard leaves out 4.
 *   - A line Mole Office wrote, when neither side is Mole Office, is in the conversation only when it was handed to
 *     both sides, or when it is a notice of 5. So of 2 the guard reads only the lines handed to both sides, each side
 *     read the way 1 reads it, and leaves out a line handed to one side only. When one side is Mole Office, its lines
 *     are in 1.
 *   - A group message is in the conversation only when the other side is a person. So the guard reads 3 only for the
 *     side whose other side is a person.
 *
 * So the guard reads the conversation of two agents through its own messages and Mole Office's lines to both, and not
 * through every line Mole Office wrote to either agent and every group line either agent wrote.
 *
 * THE TURN COUNT LEAVES OUT 2 AND 5. A line found only by either is an office line: for another sender,
 * `conversationBetween` requires the sender to be one side and the recipient the other, found by 1. Even if a
 * message from another sender names `aboutMessage`, that field does not put it into a pair. A group reply to a
 * person is still found by 3. Office lines neither count as agent turns nor reset the count to zero.
 *
 * A message kept here that is not in the conversation is thrown away by `conversationBetween`.
 * tests/the-chat-reads-only-what-it-needs.test.ts compares pages read this way with the same pieces
 * of a whole read, and tests/the-guard-reads-a-conversation-back-to-the-last-person.test.ts compares the guard's read
 * with `conversationBetween`.
 */
function theIdsOfOnePair(a: ParticipantRef, b: ParticipantRef, everyone: readonly KnownParticipant[], which: WhichProjects, way: 'older' | 'newer', from: APlace | null, limit: number, reader: APairReader) {
  // THE KIND INSIDE `likely`, which tells SQLite it leaves out few rows, and the project and the
  // deletion asked as "is it true", which SQLite cannot answer from an index. So SQLite starts from the
  // candidate rowids below, rather than the index on the kind or on the project.
  const live = and(sql`(${and(messagesInTheViewOf(which), isNull(records.deletedAt))}) = 1`, sql`likely(${ONE_KIND_WRITTEN_OUT.message})`)
  const storedAs = (who: ParticipantRef) =>
    and(inArray(sql`+${STORED_FIELDS.messageSentById(records.data)}`, theIdsAMessageMayStoreFor(who, everyone)), eq(sql`json_extract(${records.data}, '$.sentBy.kind')`, who.kind))
  const idOnly = (condition: SQL | undefined) => db.select({ id: records.id }).from(records).where(and(live, condition))
  // EACH MESSAGE COMES WITH ITS PLACE, so a page is ordered and cut from these rows alone and only the
  // messages on it are read whole afterwards.
  const past = from === null ? undefined : way === 'older'
    ? sql`(${records.createdAt} < ${from.createdAt} or (${records.createdAt} = ${from.createdAt} and rowid < ${from.rowid}))`
    : sql`(${records.createdAt} > ${from.createdAt} or (${records.createdAt} = ${from.createdAt} and rowid > ${from.rowid}))`
  const one = (condition: SQL | undefined) =>
    db.select({ id: records.id, createdAt: records.createdAt, place: sql<number>`rowid`.as('place') }).from(records).where(and(live, condition, past))
  // Limit each outer part before merging. The notice's membership subquery still sees the whole direct pair.
  // Forward walks keep the nearest newer rows; backward walks keep the newest older rows, with the same rowid tie.
  const bounded = (query: ReturnType<typeof one>) => {
    const part = query.orderBy(...(way === 'older' ? [desc(records.createdAt), sql`rowid desc`] : [records.createdAt, sql`rowid`])).limit(limit).as('pair_part')
    return db.select({ id: part.id, createdAt: part.createdAt, place: part.place }).from(part)
  }
  // Intersect covered rowid sets before fetching message data. Sender and recipient membership otherwise make
  // SQLite fetch and decode every sender row before discovering which few belong to the pair.
  const sentRows = (who: ParticipantRef) => sql`SELECT ${records}.rowid FROM ${records} INDEXED BY records_message_sent_by_idx
    WHERE ${and(ONE_KIND_WRITTEN_OUT.message, inArray(STORED_FIELDS.messageSentById(records.data), theIdsAMessageMayStoreFor(who, everyone)))}`
  const handedRows = (who: ParticipantRef) => {
    const recipientMatches = and(eq(messageDelivery.recipientKind, who.kind), inArray(messageDelivery.recipientId, theIdsAMessageMayStoreFor(who, everyone)))
    return sql`SELECT ${records}.rowid FROM ${messageDelivery} CROSS JOIN ${records} ON ${records.id} = ${messageDelivery.messageId}
    WHERE ${recipientMatches}`
  }
  const between = (sender: ParticipantRef, recipient: ParticipantRef) => and(storedAs(sender), sql`${records}.rowid IN (${sentRows(sender)} INTERSECT ${handedRows(recipient)})`)
  const groupRows = sql`SELECT ${records}.rowid FROM ${records} INDEXED BY records_message_to_group_idx
    WHERE ${and(ONE_KIND_WRITTEN_OUT.message, sql`${STORED_FIELDS.messageToGroup(records.data)} >= ''`)}`
  const grouped = (who: ParticipantRef) => and(storedAs(who), sql`json_type(${records.data}, '$.toGroup') = 'text'`, sql`${records}.rowid IN (${sentRows(who)} INTERSECT ${groupRows})`)
  const aToB = () => between(a, b)
  const bToA = () => between(b, a)
  const notices = db
    .select({ id: records.id, createdAt: records.createdAt, place: sql<number>`rowid`.as('place') })
    .from(records)
    .where(
      and(
        sql`likely(${ONE_KIND_WRITTEN_OUT.message})`,
        sql`unlikely(${STORED_FIELDS.messageAboutMessage(records.data)} > '')`,
        sql`(${live}) = 1`,
        past,
        sql`(${inArray(STORED_FIELDS.messageAboutMessage(records.data), idOnly(aToB()).union(idOnly(bToA())))}) = 1`,
      ),
    )
  const parts =
    reader === 'the chat'
      ? [aToB(), bToA(), between(moleOffice(), a), grouped(a), grouped(b), eq(STORED_FIELDS.messageTypedFromType(records.data), 'text')]
      : [
          aToB(),
          bToA(),
          ...(reader === 'the count' || isMoleOffice(a) || isMoleOffice(b) ? [] : [and(storedAs(moleOffice()), sql`${records}.rowid IN (${handedRows(a)} INTERSECT ${handedRows(b)})`)]),
          ...(b.kind === 'person' ? [grouped(a)] : []),
          ...(a.kind === 'person' ? [grouped(b)] : []),
        ]
  const [first, ...rest] = [...parts.map((condition) => bounded(one(condition))), ...(reader === 'the count' ? [] : [bounded(notices)])]
  return rest.reduce((all, part) => all.unionAll(part), first!.$dynamic())
}

/** Who reads a pair's candidates: the chat, the full guard read, or the turn count without office-only lines. */
type APairReader = 'the chat' | 'the guard' | 'the count'

/**
 * THE MESSAGES OF THE CONVERSATION FROM `from`, AWAY FROM IT, until `need` are found or none remain,
 * oldest first. `from` itself is left out; null starts at the newest end.
 */
function walk(
  a: ParticipantRef,
  b: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
  mayRead: WhatTheReaderMayRead,
  way: 'older' | 'newer',
  from: APlace | null,
  need: number,
): PoolEntry[] {
  let found: PoolEntry[] = []
  let at = from
  // A FEW MORE THAN ARE NEEDED, because some messages `theIdsOfOnePair` keeps are not in the
  // conversation, such as the agent's group lines. Four times more each time it is not enough.
  let size = need * 2 + 8
  for (;;) {
    const rows = theNextOfThePair(a, b, everyone, which, way, at, size, 'the chat')
    if (rows.length === 0) return found
    const inOrder = way === 'older' ? [...rows].reverse() : rows
    const members = membersAmong(a, b, everyone, which, mayRead, inOrder)
    found = way === 'older' ? [...members, ...found] : [...found, ...members]
    if (found.length >= need) return way === 'older' ? found.slice(-need) : found.slice(0, need)
    if (rows.length < size) return found
    const edge = rows[rows.length - 1]!
    at = { createdAt: edge.createdAt, rowid: edge.rowid }
    size *= 4
  }
}

/** One conversation whose turns are counted: one group, or one pair of participants. */
export type AConversationToCount =
  | { kind: 'group'; id: string }
  | { kind: 'pair'; between: readonly [ParticipantRef, ParticipantRef] }

/** How many messages the first piece of `theConversationBackTo` asks for. Each later piece asks for four times as many. */
export const THE_FIRST_PIECE_READ_BACK_HOLDS = 32

/**
 * ONE CONVERSATION FROM ITS NEWEST MESSAGE BACK TO THE NEWEST ONE `stopAt` IS TRUE OF, that one included, oldest first.
 * The whole conversation when `stopAt` is true of none of it. The conversation guard in lib/worker.ts reads it with
 * `stopAt` true of a message a person wrote, so it counts the turns agents have taken since then without reading what
 * came before.
 *
 * WHICH READ IT MATCHES. A pair's messages are the ones `conversationBetween(a, b, EVERY_PROJECT, [])` keeps, and a
 * group's are `messagesInAGroup(id, EVERY_PROJECT)`, in the same order, ties included. Those are also the lists
 * `theConversationsOfOnePool` gives from the whole pool, and its own comment says why. This read keeps the newest end
 * of those lists.
 *
 * WHY IT IS THE SAME SET. A pair is read in pieces, newest first, by `theNextOfThePair`, through the parts of
 * `theIdsOfOnePair` the guard reads, which keep every message `conversationBetween` can keep with no list of
 * participants, and it says why. Each piece is decided by `membersAmong`, which
 * asks `conversationBetween` itself about the piece, beside the messages its notices name. That is the read
 * `aPageOfTheConversation` makes, with no reader's filter. A group is read with the select `messagesSentToGroups` makes
 * for one group. Every one of these reads asks for the messages of every project, and both orders are the moment and
 * then the order stored (`earlierPlaceFirst`), read from the newest end.
 *
 * IT STOPS ONLY AT A MESSAGE `stopAt` IS TRUE OF, never after a number of rows. A message `stopAt` is false of only
 * makes the read go on. The pieces grow fourfold, so a long conversation takes a few reads.
 *
 * The count may leave out office-only lines: only an office sender can put a line into a pair solely by reaching both
 * sides or by naming a message of that pair. Other senders' messages are found through the direct parts. The caller
 * may ask for the count only when an office line is neither a turn nor a reset under its stopAt and counting rules.
 */
export function theConversationBackTo(conversation: AConversationToCount, stopAt: (one: PoolEntry) => boolean, reader: 'the guard' | 'the count' = 'the guard'): PoolEntry[] {
  const pieces: PoolEntry[][] = []
  let at: APlace | null = null
  let size = THE_FIRST_PIECE_READ_BACK_HOLDS
  for (;;) {
    const rows: APlacedRow[] =
      conversation.kind === 'group'
        ? aGroupsMessagesBefore(conversation.id, at, size)
        : theNextOfThePair(conversation.between[0], conversation.between[1], [], EVERY_PROJECT, 'older', at, size, reader)
    const oldestFirst = [...rows].reverse()
    const members =
      conversation.kind === 'group'
        ? entriesOf(oldestFirst, EVERY_PROJECT)
        : membersAmong(conversation.between[0], conversation.between[1], [], EVERY_PROJECT, (list) => list, oldestFirst)
    for (let i = members.length - 1; i >= 0; i--) {
      if (stopAt(members[i]!)) return [...members.slice(i), ...pieces.flat()]
    }
    pieces.unshift(members)
    if (rows.length < size) return pieces.flat()
    const edge = rows[rows.length - 1]!
    at = { createdAt: edge.createdAt, rowid: edge.rowid }
    size *= 4
  }
}

/**
 * AT MOST `limit` LIVE MESSAGES OF ONE GROUP FROM JUST BEFORE `from`, newest first, or from the newest when `from` is
 * null. The select `messagesSentToGroups` makes for one group, read from the other end.
 */
function aGroupsMessagesBefore(groupId: string, from: APlace | null, limit: number): APlacedRow[] {
  const past = from === null ? undefined : sql`(${records.createdAt} < ${from.createdAt} or (${records.createdAt} = ${from.createdAt} and rowid < ${from.rowid}))`
  return db
    .select({ ...MESSAGE_COLUMNS, rowid: sql<number>`rowid` })
    .from(records)
    .where(
      and(
        sql`${records}.rowid IN (SELECT ${records}.rowid FROM ${records} INDEXED BY records_message_to_group_idx WHERE ${and(ONE_KIND_WRITTEN_OUT.message, inArray(STORED_FIELDS.messageToGroup(records.data), [groupId]))})`,
        messagesInTheViewOf(EVERY_PROJECT, true),
        theKindOfARowFoundById('message'),
        isNull(records.deletedAt),
        past,
      ),
    )
    .orderBy(desc(records.createdAt), sql`rowid desc`)
    .limit(limit)
    .all() as APlacedRow[]
}

/**
 * THE NEXT `limit` MESSAGES OF THE PAIR FROM `from`, AWAY FROM IT, in that order, read whole. They
 * are chosen and ordered by their places alone, and only those `limit` are then read whole.
 */
function theNextOfThePair(
  a: ParticipantRef,
  b: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
  way: 'older' | 'newer',
  from: APlace | null,
  limit: number,
  reader: APairReader,
): APlacedRow[] {
  const pair = theIdsOfOnePair(a, b, everyone, which, way, from, limit, reader).as('pair')
  const past =
    from === null
      ? undefined
      : way === 'older'
        ? sql`(${pair.createdAt} < ${from.createdAt} or (${pair.createdAt} = ${from.createdAt} and ${pair.place} < ${from.rowid}))`
        : sql`(${pair.createdAt} > ${from.createdAt} or (${pair.createdAt} = ${from.createdAt} and ${pair.place} > ${from.rowid}))`
  const chosen = db
    .selectDistinct({ id: pair.id })
    .from(pair)
    .where(past)
    .orderBy(...(way === 'older' ? [desc(pair.createdAt), sql`${pair.place} desc`] : [pair.createdAt, sql`${pair.place}`]))
    .limit(limit)
    .all()
  const whole = new Map(rowsByIds(chosen.map((one) => one.id), which).map((row) => [row.id, row]))
  return chosen.map((one) => whole.get(one.id)).filter((row): row is APlacedRow => row !== undefined)
}

/**
 * Message rows matching `condition`, from `from` away from it, in that order, at most `limit` (all
 * when null). The live test is asked as "is it true", so SQLite starts from the ids in `condition`.
 */
function rowsWhere(condition: SQL, which: WhichProjects, way: 'older' | 'newer', from: APlace | null, limit: number | null): APlacedRow[] {
  const live = and(messagesInTheViewOf(which), eq(records.kind, 'message'), isNull(records.deletedAt))
  const past =
    from === null
      ? undefined
      : way === 'older'
        ? sql`(${records.createdAt} < ${from.createdAt} or (${records.createdAt} = ${from.createdAt} and rowid < ${from.rowid}))`
        : sql`(${records.createdAt} > ${from.createdAt} or (${records.createdAt} = ${from.createdAt} and rowid > ${from.rowid}))`
  const query = db
    .select({ ...MESSAGE_COLUMNS, rowid: sql<number>`rowid` })
    .from(records)
    .where(and(condition, sql`(${live}) = 1`, past))
    .orderBy(...(way === 'older' ? [desc(records.createdAt), sql`rowid desc`] : [records.createdAt, sql`rowid`]))
  return (limit === null ? query.all() : query.limit(limit).all()) as APlacedRow[]
}

/**
 * These live messages, by id, oldest first. Read in pieces (src/server/db/in-pieces.ts), because a
 * conversation's ids grow with it, and put back in the order one read gives: by moment, then by rowid.
 */
function rowsByIds(ids: readonly string[], which: WhichProjects): APlacedRow[] {
  return readInPieces(ids, (piece) => rowsWhere(inArray(records.id, piece), which, 'newer', null, null)).sort(earlierPlaceFirst)
}

/**
 * WHICH OF THESE ROWS ARE IN THE CONVERSATION OF `a` AND `b`, as entries, in the order given.
 *
 * Decided by `conversationBetween`, the rule a whole read uses. A notice is in the conversation of
 * the message it is about, so the messages these rows' notices name are built beside them for the
 * rule to read, and are not answered unless they are among the rows.
 */
function membersAmong(
  a: ParticipantRef,
  b: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
  mayRead: WhatTheReaderMayRead,
  rows: readonly MessageRow[],
): PoolEntry[] {
  if (rows.length === 0) return []
  const here = new Set(rows.map((row) => row.id))
  const entries = entriesOf(rows, which)
  const named = [...new Set(entries.map((one) => one.aboutMessage).filter((id): id is string => typeof id === 'string' && !here.has(id)))]
  const beside = entriesOf(rowsByIds(named, which), which)
  const between = conversationBetween(a, b, which, everyone, [...beside, ...entries]).messages.filter((one) => here.has(one.id))
  return mayRead(between)
}

/**
 * THE ROWS AT OR BEFORE `at` WRITTEN, OR GIVEN A DELIVERY ROW, AT OR AFTER `since`: every message a
 * page holds that may have changed since it was read. Read through the index on when a record was
 * written and the index on when a delivery row was written, so only those are read.
 *
 * A COMMENT WHOSE WORDS WENT OUT AT OR AFTER `since` IS AMONG THEM. Sending a comment moves the word
 * of the message that carries it and writes neither the comment's record nor a delivery row of it,
 * so without this the page kept saying *Not sent yet* until it was reloaded (problem h9yY-r8s3vHZ).
 */
function theRowsChangedSince(since: string, at: APlace, which: WhichProjects): APlacedRow[] {
  // THE IDS FIRST, AND THEN THE ROWS BY ID. Asked as one query, SQLite walked the whole table to
  // match each row against the list.
  const written = db.select({ id: records.id }).from(records).where(sql`${records.updatedAt} >= ${since}`).all()
  const delivered = db.select({ id: messageDelivery.messageId }).from(messageDelivery).where(sql`${messageDelivery.at} >= ${since}`).all()
  const wentOut = messagesCarrying({ comments: null, which, pastQueued: true, movedSince: since }).map((one) => one.commentId)
  const rows = rowsByIds([...new Set([...written.map((one) => one.id), ...delivered.map((one) => one.id), ...wentOut])], which)
  return rows.filter((row) => row.createdAt < at.createdAt || (row.createdAt === at.createdAt && row.rowid <= at.rowid))
}

/**
 * THE MESSAGES CONCERNING THIS READER THAT WERE DELETED AT OR AFTER `since`: handed to them, or
 * stored as sent by them. A page drops each one it holds. Messages of nobody else's are not named.
 */
function theMessagesGoneSince(me: ParticipantRef, since: string): string[] {
  const handedToMe = db
    .select({ id: messageDelivery.messageId })
    .from(messageDelivery)
    .where(and(eq(messageDelivery.recipientKind, me.kind), eq(messageDelivery.recipientId, me.id)))
  const rows = db
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        eq(records.workspaceId, MESSAGE_CENTRE),
        sql`${records.deletedAt} >= ${since}`,
        ONE_KIND_WRITTEN_OUT.message,
        or(
          inArray(records.id, handedToMe),
          and(
            eq(STORED_FIELDS.messageSentById(records.data), me.id),
            eq(sql`(CASE WHEN json_valid(${records.data}) THEN json_extract(${records.data}, '$.sentBy.kind') END)`, me.kind),
          ),
        ),
      ),
    )
    .all()
  return rows.map((row) => row.id)
}

/**
 * THE SAME LIST, WITH THE MESSAGES NAMED IN `ids` READ AGAIN FROM THE DATABASE.
 *
 * A conversation door moves some of its messages' marks after it has read them. It used to read the
 * whole conversation a second time to show the new marks. A mark changes nothing about which
 * conversation a message is in, so only the moved messages need reading again. Each is built by
 * `asEntry`, as the first read built it. A message named here that the database no longer holds is
 * left out, as a second whole read would have left it out.
 */
export function withTheseMessagesReadAgain(
  messages: readonly PoolEntry[],
  ids: readonly string[],
  which: WhichProjects,
): PoolEntry[] {
  if (ids.length === 0) return [...messages]
  const live = and(messagesInTheViewOf(which), eq(records.kind, 'message'), isNull(records.deletedAt))
  // IN PIECES (src/server/db/in-pieces.ts): marking a conversation moves every message still queued in
  // it. The rows go into a map by id, so the order of the pieces does not matter.
  const rows = readInPieces(
    ids,
    (piece) =>
      db
        .select(MESSAGE_COLUMNS)
        .from(records)
        // BY ITS ID ALONE. The other tests are asked as "is it true", which SQLite cannot answer from an
        // index; asked plainly, SQLite chose the index on the kind and walked every message.
        .where(and(inArray(records.id, piece), sql`(${live}) = 1`))
        .all() as MessageRow[],
  )
  const deliveries = deliveriesOfMany(rows.map((row) => row.id))
  const said = whatTheProjectSays(which, rows)
  const officeTest = theMoleOfficeTest()
  const fresh = new Map(rows.map((row) => [row.id, asEntry(row, deliveries.get(row.id) ?? [], said, officeTest)]))
  const named = new Set(ids)
  // ONE PASS, so no list of the messages kept is made beside the list of what is answered.
  const out: PoolEntry[] = []
  for (const one of messages) {
    const again = fresh.get(one.id)
    if (again !== undefined) out.push(again)
    else if (!named.has(one.id)) out.push(one)
  }
  return out
}

/** Every message of the projects asked for, as the conversation readers see them. Read once, then filtered many times. */
export function everyMessageOfTheProjects(which: WhichProjects): PoolEntry[] {
  return poolOf(which)
}

/**
 * EVERY MESSAGE OF THE PROJECTS ASKED FOR, AS THE QUEUE READS THEM (round 47 of wave 13y): the rows of
 * `everyMessageOfTheProjects`, in its order, with the words of every message sent to no group left unread, and each
 * built only as far as the sort into conversations reads it (round 49).
 *
 * The queue sorts the pool into conversations and counts each one's turns by who sent them. The only words it reads are
 * a group line's, to find whom the line @s (`theConversationsOfOnePool`). So this read takes a message's stored data
 * without its body when the message names no group, and its entry says so with a body of null. A row whose data is not
 * JSON is handed over as stored, so it fails here as it fails in the whole pool's read. The rows are still read whole
 * from the disk; what is not kept is the words, which were most of the heap the queue's read took on a made-up office
 * of the live size.
 *
 * NOTHING THE SORT DOES NOT READ IS BUILT (round 49 of wave 13y). The whole entry also reads the runs its messages name,
 * each sender's registry row and the project's edit window (`whatTheProjectSays`), and none of that reaches a
 * conversation. On the made-up office that was about 100 ms of each read of the queue.
 */
export function everyMessageOfTheProjectsForTheQueue(which: WhichProjects): AMessageToSort[] {
  // `toGroup` is asked as `asMessage` reads it: a name that is not empty.
  const theDataWithAGroupLinesWordsOnly = sql`(CASE WHEN NOT json_valid(${records.data}) THEN ${records.data}
    WHEN json_type(${records.data}, '$.toGroup') = 'text' AND json_extract(${records.data}, '$.toGroup') <> '' THEN ${records.data}
    ELSE json_remove(${records.data}, '$.body') END)`
    .mapWith(records.data)
    .as('data')
  const all = theRowsOfThePoolInOrder(which, theDataWithAGroupLinesWordsOnly)
  const deliveries = deliveriesOfMany(all.map((row) => row.id))
  return all.map((row) => {
    const data = (row.data ?? {}) as Record<string, unknown>
    const one: AMessageToSort = theFieldsTheSortReads(row, data, deliveries.get(row.id) ?? [], routedOf(data))
    if (one.toGroup === null) one.body = null
    return one
  })
}

/**
 * WHAT THE WHOLE PROJECT SAYS THAT EVERY MESSAGE ON A PAGE IS READ AGAINST, taken once per read.
 *
 * Two facts, both about the project rather than about one row, and both wanted by every message a
 * page draws. Asking them once here rather than once per row is the only thing this adds; working
 * either of them out a second way in this file would be one fact in two places, which is what the
 * retired `annotation.data.state` field was.
 */
interface StarterHistoryRow {
  from_kind: 'person' | 'agent' | null
  from_id: string | null
  to_kind: 'person' | 'agent'
  to_id: string
  applied_at: string
}

interface WhatTheProjectSays {
  /** Applied starter changes, read once per sender for this message read. */
  starterHistory: Map<string, StarterHistoryRow[]>
  /** One current edit-window choice for this pool, read again for the next pool. */
  editWindowSeconds: number
  /**
   * WHICH COMMENTS IN THIS PROJECT HAVE HAD THEIR WORDS HANDED TO SOMEBODY.
   *
   * `commentsGoneOut` in lib/dispatch.ts already answers this for the whole project in two indexed
   * reads, and the review column already draws from it.
   */
  goneOut: ReadonlySet<string>
  /**
   * WHICH TOOL RAN EACH RUN IN THIS PROJECT, by session record id.
   *
   * A run whose record says nothing about its runtime is absent, and so is one whose word is not
   * one an agent may be served by — `codex-cli` is the one in this corpus. Absent means nobody
   * recorded it, and a mark drawn from a guess would name the wrong tool. Each carries the model id
   * the run's record holds, or null where it holds none (problem 2tbFWxiFyjtv); `theRunsTool` reads both.
   */
  runtimes: Map<string, TheRunsTool>
  /**
   * THE SENDERS THIS READ HAS ALREADY LOOKED UP, by the exact string each message stored, with null
   * for a string that names no agent. Empty when the read starts and filled as it goes by
   * `theSenderThisReadLookedUp`. It belongs to one read and is dropped with it.
   */
  senders: Map<string, RegisteredAgent | null>
  /**
   * THE SENDER'S FLAGS THIS READ HAS ALREADY BUILT, by the person's id. Empty when the read starts and filled as it
   * goes by `theSendersFlagsThisRead`. It belongs to one read and is dropped with it.
   */
  flags: Map<string, TheFlagsOfAPerson | null>
}

/**
 * `messages` ARE THE ROWS THE READ WILL BUILD. Only the runs they name in `fromRun` are read, because
 * `ranBy` asks about no other run. Before, every run of the projects was read for every message read,
 * and on an office of the live shape that was 6,000 session records for a conversation naming a few
 * hundred of them (round 33 of wave 13n).
 */
function whatTheProjectSays(which: WhichProjects, messages: readonly { data: unknown }[], held?: WhatTheProjectSays): WhatTheProjectSays {
  const named = new Set<string>()
  for (const message of messages) {
    const run = ((message.data ?? {}) as Record<string, unknown>)['fromRun']
    if (typeof run === 'string' && run !== '' && !held?.runtimes.has(run)) named.add(run)
  }
  // IN PIECES (src/server/db/in-pieces.ts): a read of the whole pool names thousands of runs. The rows go
  // into a map by id, so the order of the pieces does not matter.
  const rows = readInPieces(named, (piece) =>
    db
      .select({ id: records.id, ...RUN_TOOL_COLUMNS })
      .from(records)
      .where(
        and(
          inArray(records.id, piece),
          narrowedToProjects(records.workspaceId, which),
          // THE `+` KEEPS SQLITE ON THE ID. Without it SQLite chose the index on the kind and read
          // every session record to find a few hundred by id.
          sql`+"records"."kind" = 'session'`,
          isNull(records.deletedAt),
        ),
      )
      .all(),
  )
  const runtimes = held?.runtimes ?? new Map<string, TheRunsTool>()
  for (const row of rows) {
    const tool = theRunsTool(row)
    if (tool !== null) runtimes.set(row.id, tool)
  }
  const senders = held?.senders ?? new Map<string, RegisteredAgent | null>()
  const unknown = held === undefined ? messages : messages.filter((message) => {
    const sentBy = refFrom(((message.data ?? {}) as Record<string, unknown>)['sentBy'])
    return sentBy !== null && sentBy.kind === 'agent' && !senders.has(sentBy.id)
  })
  for (const [id, sender] of theSendersStoredByTheirIds(unknown)) senders.set(id, sender)
  return held ?? { starterHistory: new Map(), goneOut: new Set(commentsGoneOut(which)), runtimes, senders, flags: new Map(), editWindowSeconds: messageEditWindowSeconds() }
}

/**
 * THE SENDERS OF THESE MESSAGES WHOSE STORED STRING IS AN AGENT'S EXACT ID, read in one go, for `theSenderThisReadLookedUp`.
 *
 * An exact id settles the stored-reference rule alone (`theAgentAStoredReferenceNames`), so these answers are the ones it
 * would give. Any other stored string is left out of the map and is looked up by that function when a message needs it.
 * The read asked it once per sender before: five statements each, about 535 for the 107 senders of the person's chat on
 * an office of the live size (wave 13x round 13).
 */
function theSendersStoredByTheirIds(messages: readonly { data: unknown }[]): Map<string, RegisteredAgent | null> {
  const stored = new Set<string>()
  for (const message of messages) {
    const sentBy = refFrom(((message.data ?? {}) as Record<string, unknown>)['sentBy'])
    if (sentBy !== null && sentBy.kind === 'agent' && sentBy.id !== '' && sentBy.id === sentBy.id.trim()) stored.add(sentBy.id)
  }
  return new Map<string, RegisteredAgent | null>(agentsWithTheseIds([...stored]))
}

/**
 * WHO MADE THE OFFER A STORED MESSAGE CARRIES. A message's offer is its writer's. A line Remind me later brought back
 * is written by the office, and it stores the first sender beside it (`backAsYouAsked.from`, written by
 * src/server/lib/remind-me-later.ts); the offer is still that sender's. Null when that mark is there and names nobody
 * this reader can read, because the office does not guess whose offer it is.
 */
function whoMadeTheOffer(data: Record<string, unknown>, writer: ParticipantRef | null): ParticipantRef | null {
  const extra = data['extra']
  const back = extra !== null && typeof extra === 'object' ? (extra as Record<string, unknown>)['backAsYouAsked'] : undefined
  if (back === undefined) return writer
  return back !== null && typeof back === 'object' ? refFrom((back as Record<string, unknown>)['from']) : null
}

/**
 * WHICH RUN A MESSAGE CAME OUT OF AND WHICH TOOL RAN IT, or null because nothing knows.
 *
 * `fromRun` is written by the worker on a reply it files after reading a run's output, and it names
 * that run's session record. A message somebody wrote themselves carries none, and a run whose
 * record never said which tool it was is answered null as well: those are two different absences
 * and neither is a reason to draw a tool's name. See `ranBy` on `MessageOnTheWire`.
 */
function ranBy(data: Record<string, unknown>, said: WhatTheProjectSays): MessageOnTheWire['ranBy'] {
  const run = data['fromRun']
  if (typeof run !== 'string' || run === '') return null
  const tool = said.runtimes.get(run)
  return tool === undefined ? null : { run, ...tool }
}

/** Which tool ran a run and on which model: what `ranBy` carries besides the run's id. */
type TheRunsTool = { runtime: AgentRuntime; model: string | null }

/** The two fields of a run's record that `theRunsTool` reads, for both reads of them below. */
const RUN_TOOL_COLUMNS = {
  runtime: sql<string | null>`json_extract(${records.data}, '$.runtime')`,
  model: sql<unknown>`json_extract(${records.data}, '$.model')`,
}

/**
 * WHAT A RUN'S RECORD SAYS ABOUT ITS TOOL AND MODEL, or null when it names no tool an agent may be
 * served by. The model is the id as the record stores it; the page turns it into a name with the one
 * table, src/shared/model-names.ts. A record with no model, or one that is not a word, says null:
 * nobody recorded it, which is not a model with no name.
 */
function theRunsTool(row: { runtime: string | null; model: unknown }): TheRunsTool | null {
  const runtime = declaredRuntimeOrNull(row.runtime)
  if (runtime === null) return null
  const model = typeof row.model === 'string' && row.model.trim() !== '' ? row.model.trim() : null
  return { runtime, model }
}

/**
 * EVERY MESSAGE THIS READ COVERS, oldest first, read once.
 *
 * ---------------------------------------------------------------------------------------
 * IT TAKES HOW WIDE THE READ IS, AND THAT IS CRITERION M55
 * ---------------------------------------------------------------------------------------
 *
 * It used to take one project's id and there was no other way to call it, so every conversation in
 * the product was one project's. Moving the project switcher therefore changed the contacts, showed
 * messages from writers who had only written in the project moved to, and left a conversation the
 * reader had been having for weeks looking empty — measured on a copy of the owner's corpus on
 * 6 September 2026: with the coordinator, seventeen messages in one project and two in the other.
 *
 * A conversation is the person's, so the chat asks for `EVERY_PROJECT` and the pages that really are
 * about one project — the Messages page, a record's comments — go on asking for theirs. The width is
 * always stated; see `WhichProjects` in lib/workspaces.ts for why there is no way to leave it out.
 */
function poolOf(which: WhichProjects): PoolEntry[] {
  const all = theRowsOfThePoolInOrder(which)
  const deliveries = deliveriesOfMany(all.map((row) => row.id))
  const said = whatTheProjectSays(which, all)
  const officeTest = theMoleOfficeTest()
  return all.map((row) => asEntry(row, deliveries.get(row.id) ?? [], said, officeTest))
}

/**
 * EVERY MESSAGE ROW OF THE PROJECTS ASKED FOR, in the order every conversation is drawn in: the one select of the whole
 * pool and of the queue's (`everyMessageOfTheProjectsForTheQueue`), which takes `data` its own way.
 *
 * SORTED HERE, NOT BY SQLITE (wave 13y round 40). An ORDER BY on the stamp made SQLite sort every whole message row in a
 * temporary B-tree, which it wrote out to a file and read back: 34 MB more read for each read of the queue on a made-up
 * office of the live size. The rows come with their rowid and are put in the order every conversation is drawn in, the
 * stamp and then the order stored (`earlierPlaceFirst`). The sort by the stamp alone met each tie in the order stored and
 * kept it, so the order is the one it gave, now said rather than left to SQLite.
 */
function theRowsOfThePoolInOrder(which: WhichProjects, data: typeof records.data | SQL.Aliased<unknown> = records.data): APlacedRow[] {
  return (
    db
      .select({ ...MESSAGE_COLUMNS, data, rowid: sql<number>`rowid` })
      .from(records)
      .where(and(messagesInTheViewOf(which), eq(records.kind, 'message'), isNull(records.deletedAt)))
      .all() as APlacedRow[]
  ).sort(earlierPlaceFirst)
}

/**
 * THE PART OF THE POOL ONE READER'S CONTACTS CAN BE WORKED OUT FROM, oldest first.
 *
 * The owner chose option 3 of a decision, on 26 September 2026: the contacts list is worked out from the reader's own
 * messages, not from every message of every project, and it gives the same answer byte for
 * byte. `contactsFor` still decides everything. This read only leaves out the messages
 * `contactsFor` would have thrown away. So it keeps every message that has at least one of these:
 *
 *   1. A DELIVERY ROW TO THIS READER. A message's `to` is its delivery rows, so these are all the
 *      messages the reader was handed. That covers a message somebody sent them, a line from Mole
 *      Office that reached them, a writer nobody registered, and every unread count, because a
 *      count only counts a delivery row to the reader.
 *   2. A STORED SENDER THAT CAN BE THIS READER: their own id, or, for an agent, their handle. A
 *      stored sender is read by id and then by handle (`theAgentAStoredSenderNames`), so a message
 *      stored under the handle can be the reader's own.
 *   3. A TYPED `from` LINE. When a message stored no sender that can be read, the typed line
 *      decides who wrote it (`whoTypedThis`), and it may name the reader. Every message with such a
 *      line is kept, whatever it stored, so the rule for a readable stored sender (`refFrom`) is
 *      not written a second time here.
 *   4. A ROUTED COPY. For such a message, who the writer addressed is read from its stored `to`,
 *      not from its delivery rows (`thePartiesOfEveryPair`), so it may name the reader with no
 *      delivery row to them. These are kept whole rather than read a second way here.
 *   5. A NOTICE ABOUT ONE OF THE MESSAGES ABOVE (`aboutMessage`, criterion M128). A notice is drawn
 *      in the conversation of the message it names, which can be the reader's with no delivery row
 *      to them. The message it names is in this read too, by 1 to 4, so the pair it was between is
 *      worked out from the same message the whole pool would have used.
 *
 * Any message `contactsFor` can put in one of this reader's conversations has one of the five, so
 * leaving the rest out changes nothing it can answer. Each of the five keeps more than it needs,
 * and `contactsFor` throws the extra away exactly as it did with the whole pool.
 *
 * THE ORDER IS THE WHOLE POOL'S ORDER. The whole pool is ordered by `createdAt`, and messages
 * written in the same second come out in the order they were stored (their `rowid`): measured on a
 * copy of the office on 26 September 2026, 10,507 messages with 3,358 such ties. This read names
 * that second key outright, so it gets the same order. `contactsFor` compares places in the list,
 * never the numbers, so a list with messages left out sorts the same.
 *
 * WHAT IT STILL COSTS. No index covers a message's stored sender, so SQLite still looks at the
 * stored fields of every message to choose (2 to 4 above). What it saves is the rest: only the
 * chosen messages come back to this program and are built with their delivery rows. On the copy of
 * 26 September that is 2,604 of 10,507 messages for the person.
 */
export function theMessagesOfOneReader(
  me: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
): PoolEntry[] {
  return theMessagesChosenFor(me, everyone, which, null)
}

/**
 * THE PART OF THE POOL ONE CONVERSATION CAN BE WORKED OUT FROM, oldest first: what
 * `theMessagesOfOneReader` keeps for side `a`, and every group message whose stored sender is side `b`.
 *
 * `conversationBetween` reads these rows when no caller hands it a pool, and builds whole only the ones in the
 * conversation (`theConversationOfOnePairRead`). Before, it read every message of
 * every project and kept the few between the two. Round 33 of wave 13n measured that on an office of
 * the live shape (12,500 messages, 3,050 of them in the conversation asked for): the whole read was
 * most of the time the conversation door took.
 *
 * WHY THESE MESSAGES ARE ENOUGH. A message is in the conversation of `a` and `b` in one of three ways,
 * and each is kept here:
 *
 *   - It is between the two (`isBetween`). Then `a` sent it or was handed it, or it is a line Mole
 *     Office wrote that reached `a` or is about a message between them. Those are the five things
 *     `theMessagesOfOneReader` keeps, for the reasons it gives.
 *   - It is a group reply of `a` that names `b`. Its stored sender is `a`, which is kept.
 *   - It is a group reply of `b` that names `a`. Its stored sender is `b` and it went to a group.
 *     Those are the group messages this function adds.
 *
 * Each message left out is one `conversationBetween` would have thrown away, so the conversation is
 * the same messages in the same order. The order is the one `theMessagesOfOneReader` gives.
 */
export function theMessagesOfOnePair(
  a: ParticipantRef,
  b: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
): PoolEntry[] {
  return theMessagesChosenFor(a, everyone, which, b)
}

/**
 * THE ONE READ BEHIND THE TWO ABOVE. `groupLinesFrom` is the other side of a conversation, whose
 * group messages are kept as well, or null for a reader's whole list.
 *
 * EACH KIND OF MESSAGE KEPT IS ITS OWN SMALL READ, AND THE READS ARE JOINED WITH UNION. Each one
 * asks an index: the delivery rows by recipient, and the stored fields of a message by the indexes
 * migration 0199 made. It was one read with the five conditions joined by OR, and SQLite cannot use
 * an index for such an OR, so it parsed the stored fields of every message twice: about 37 ms on an
 * office of 12,500 messages (round 33 of wave 13n). The union keeps the same messages.
 */
function theMessagesChosenFor(
  me: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
  groupLinesFrom: ParticipantRef | null,
): PoolEntry[] {
  const read = theRowsChosenFor(me, everyone, which, groupLinesFrom)
  return entriesOf(read.rows, which, read.deliveries)
}

/**
 * THE ROWS OF LIVE MESSAGES A READ HAS JUST READ, AND THEIR DELIVERY ROWS by message id. `thePartiesOfMany` takes
 * them from the caller that read them and does not read them again.
 */
interface MessagesJustRead {
  rows: readonly MessageRow[]
  deliveries: Map<string, DeliveryOnTheWire[]>
}

/** The rows of the messages `theMessagesChosenFor` keeps, oldest first, and their delivery rows by message id. */
function theRowsChosenFor(
  me: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
  groupLinesFrom: ParticipantRef | null,
): MessagesJustRead {
  // EVERY MESSAGE CHOSEN IS ALREADY LIVE, because each read in `theIdsChosenFor` asks for live messages
  // only. So the rows are read by their ids alone, which SQLite looks up one by one.
  //
  // THE STATEMENT IS DRIZZLE'S OWN, TAKEN WITH `toSQL()`, and run straight through better-sqlite3. Its text and its
  // values come from the same query drizzle would run, so the two cannot drift apart. Each row is built here, because
  // drizzle's mapping of every value of every row is work the list does not need. Every value is the one drizzle gives:
  // the text columns as stored, and `data` through the column's own decoder, which throws on text that is not JSON as
  // drizzle's read throws, and NULL stays null as drizzle leaves it.
  const { sql: statement, params } = db
    .select(MESSAGE_COLUMNS)
    .from(records)
    .where(inArray(records.id, theIdsChosenFor(me, everyone, which, groupLinesFrom)))
    .orderBy(records.createdAt, sql`rowid`)
    .toSQL()
  const stored = sqlite.prepare(statement).all(...params) as { id: string; workspace_id: string; kind: string; title: string; data: string | null; created_at: string }[]
  const rows: MessageRow[] = stored.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    title: row.title,
    data: row.data === null ? null : records.data.mapFromDriverValue(row.data),
    createdAt: row.created_at,
  }))
  return { rows, deliveries: deliveriesOfMany(rows.map((row) => row.id)) }
}

/**
 * Rows of messages built as whole entries, each with its delivery rows, by `asEntry`. `whatTheProjectSays` is asked
 * about these rows alone, and every answer it gives one message comes from that message's own fields.
 */
function entriesOf(
  rows: readonly MessageRow[],
  which: WhichProjects,
  deliveries: Map<string, DeliveryOnTheWire[]> = deliveriesOfMany(rows.map((row) => row.id)),
  shared?: WhatTheProjectSays,
  officeTest: (who: ParticipantRef) => boolean = theMoleOfficeTest(),
): PoolEntry[] {
  const said = whatTheProjectSays(which, rows, shared)
  return rows.map((row) => asEntry(row, deliveries.get(row.id) ?? [], said, officeTest))
}

/**
 * A MESSAGE AS THE CONTACT READ READS IT: the fields its rows, its counts and the reader's rule ask of a pool entry, and
 * nothing else. The fields are named here and nowhere else.
 *
 *   - `id` and `entry`: the reader's rule (`onlyTheMessagesThisReaderMayRead`). `id` also keys the pair a notice
 *     names (`thePartiesOfEveryPair`), and finds the row each last line is built whole from.
 *   - `sentBy` and `from`: who wrote it, read by `theWritersOfOnePool`, and whether Mole Office wrote it
 *     (`isASystemLine`, criterion M33).
 *   - `to`, `toGroup` and `aboutMessage`: which conversation it is in (`everyoneElseThisMessageIsBetween`,
 *     `thePartiesOfEveryPair`, criterion M128), and which group's count it is in (`messagesInAGroup`).
 *   - `deliveries`: whether it is unread (`isUnseenBy`, criteria M19 and M32).
 *   - `writtenIn` and `aboutProject`: a conversation's projects (`theProjectsOfAConversation`).
 *
 * A routed entry also carries the writer's own list beside these fields, as the whole entry does, because
 * `thePartiesOfEveryPair` reads it. It is kept under a symbol, so it is not in the JSON a door serves.
 */
export type AMessageTheContactsRead = Pick<
  PoolEntry,
  'id' | 'entry' | 'sentBy' | 'from' | 'to' | 'toGroup' | 'aboutMessage' | 'deliveries' | 'writtenIn' | 'aboutProject'
>

/**
 * THE ROWS THE CONTACT READ HAS JUST READ, BUILT AS IT READS THEM: one `AMessageTheContactsRead` for each row, in the
 * rows' order, with its delivery rows.
 *
 * EACH FIELD IS MADE BY WHAT MAKES IT IN THE WHOLE ENTRY: `theFieldsTheSortReads`, `writtenInOf` and `aboutProjectOf`,
 * with the delivery rows as they are. So this entry and the whole entry `asEntry` builds from the same row cannot come
 * to disagree about a field.
 *
 * ONLY MESSAGES. Each select in `theIdsChosenFor` names the kind, so every row the contact read chooses is a message. A
 * row of another kind says that a read changed under this one, so it is thrown and the read answers nothing.
 */
function contactEntriesOf(read: MessagesJustRead): AMessageTheContactsRead[] {
  return read.rows.map((row) => {
    if (row.kind !== 'message') throw new Error(`The contact read reads messages only, and record ${row.id} is not a message.`)
    const data = (row.data ?? {}) as Record<string, unknown>
    const deliveries = read.deliveries.get(row.id) ?? []
    const sorted = theFieldsTheSortReads(row, data, deliveries, routedOf(data))
    const entry: AMessageTheContactsRead = {
      id: sorted.id,
      entry: 'message',
      sentBy: sorted.sentBy,
      from: sorted.from,
      to: sorted.to,
      toGroup: sorted.toGroup,
      aboutMessage: sorted.aboutMessage,
      deliveries,
      writtenIn: writtenInOf(data),
      aboutProject: aboutProjectOf(data),
    }
    const addressed = (sorted as EntryWithTheWriterAddressed)[THE_WRITER_ADDRESSED]
    if (addressed !== undefined) (entry as EntryWithTheWriterAddressed)[THE_WRITER_ADDRESSED] = addressed
    return entry
  })
}

/**
 * EVERY ID A MESSAGE MAY STORE FOR THIS PARTICIPANT, as its sender or in a delivery row: a person's id alone; an agent's
 * id, its handle, its own record in the reading project when the list carries one (wave 13y round 89), and its old
 * registry ids when the list carries them, the four ways `theAgentAStoredSenderNames` reads a stored agent.
 */
function theIdsAMessageMayStoreFor(who: ParticipantRef, everyone: readonly KnownParticipant[]): string[] {
  const names = [who.id]
  if (who.kind === 'agent') {
    for (const known of everyone) {
      if (!sameParticipant(known.who, who)) continue
      if (known.handle !== who.id) names.push(known.handle)
      if (typeof known.record === 'string' && known.record !== who.id) names.push(known.record)
      for (const old of known.oldIds ?? []) names.push(old)
    }
  }
  return names
}

/** The ids of the messages `theMessagesChosenFor` keeps, as a query each read may use once. */
function theIdsChosenFor(
  me: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
  groupLinesFrom: ParticipantRef | null,
  // ONLY THE MESSAGES AN AGENT SENT, and the notices about them, for the list between agents (wave 13y round 175).
  // That list keeps no other row, and every read of one agent took every routed message in the office, each sent by
  // the person, with every notice about them: about 2,200 rows dropped in each of 100 reads on a made-up office of
  // the live shape. A notice about a message no agent sent is left out only when this reader neither sent it nor was
  // handed it, and then it is in no pair of this reader's: its message is not among the rows, so the notice is drawn
  // only between the ones it reached, and paired only as its sender with each of them.
  onlyFromAnAgent = false,
) {
  // THE KIND IS WRITTEN OUT AND NOT PASSED AS A VALUE, because SQLite uses an index that holds only
  // messages only for a query that names the kind in the same words.
  const live = and(messagesInTheViewOf(which), ONE_KIND_WRITTEN_OUT.message, isNull(records.deletedAt))
  // Read from valid JSON only, as `STORED_FIELDS` reads a field, since a row found through its delivery row was found
  // through no index on its data.
  const fromAnAgent = onlyFromAnAgent
    ? sql`(CASE WHEN json_valid(${records.data}) THEN json_extract(${records.data}, '$.sentBy.kind') END) = 'agent'`
    : undefined
  // A PERSON'S STORED SENDER IS READ BY ID ONLY; an agent's by id, by handle, and by its own record in the reading
  // project when the list carries one (wave 13y round 90), the three ways `theAgentAStoredSenderNames` reads it.
  const names = theIdsAMessageMayStoreFor(me, everyone)
  // EACH STORED FIELD IS ASKED IN THE WORDS OF ITS INDEX, from `STORED_FIELDS`. A row an index finds
  // has data that is valid JSON, so the plain reads beside it can parse it.
  // ONE READ FOR EACH OF THE NAMES (wave 13y round 91, gap 7). Asked as one `IN` of two or three names, SQLite read
  // every message through the index on the kind and not through the index on the stored sender: 134 ms for one
  // conversation on the made-up office, against 8 ms for one name. Each name asked alone is found through the index.
  const storedAsMe = names.map((name) =>
    and(eq(STORED_FIELDS.messageSentById(records.data), name), eq(sql`json_extract(${records.data}, '$.sentBy.kind')`, me.kind)),
  )
  // ANY MESSAGE WITH A TYPED `from` LINE, whatever it stored as its sender. There are few of them,
  // and keeping them all means this read never has to restate which stored senders `refFrom` accepts.
  const typedFrom = eq(STORED_FIELDS.messageTypedFromType(records.data), 'text')
  const routed = and(eq(STORED_FIELDS.messageRoutedType(records.data), 'array'), sql`json_array_length(${records.data}, '$.routed') > 0`)
  /** The live messages that concern this reader: one of the first four things the header names. */
  const concerning = () => {
    const one = (condition: SQL | undefined) => db.select({ id: records.id }).from(records).where(and(live, condition, fromAnAgent))
    // THE MESSAGES HANDED TO THIS READER ARE READ FROM THEIR DELIVERY ROWS, so SQLite starts from the
    // index on the recipient and looks each message up by its id. A cross join is how SQLite is told
    // to start from the table named first; with an inner join it read every message instead.
    // UNDER EVERY ID IN `names` (wave 13y round 91): a delivery row written before the door stored the registry id may
    // hold an agent's handle or its own record, and the rule reads such a row as the agent's.
    const handed = db
      .select({ id: records.id })
      .from(messageDelivery)
      .crossJoin(records)
      .where(and(eq(messageDelivery.recipientKind, me.kind), inArray(messageDelivery.recipientId, names), eq(records.id, messageDelivery.messageId), live, fromAnAgent))
    return union(handed, one(typedFrom), one(routed), ...storedAsMe.map(one))
  }
  // A NOTICE ABOUT ONE OF THEM. SQLite reads every message that holds an `aboutMessage`, through its
  // index, and then keeps the live ones about a message above. An id is never the empty text, so
  // asking for an `aboutMessage` that sorts after it leaves no notice out, and `unlikely` tells SQLite
  // that few messages hold one. The two other tests are asked as "is it true", which SQLite cannot
  // answer from an index. Asked plainly, SQLite chose another index and read every message.
  const notices = db
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        sql`likely(${ONE_KIND_WRITTEN_OUT.message})`,
        sql`unlikely(${STORED_FIELDS.messageAboutMessage(records.data)} > '')`,
        sql`(${live}) = 1`,
        sql`(${inArray(STORED_FIELDS.messageAboutMessage(records.data), concerning())}) = 1`,
      ),
    )
  // THE OTHER SIDE'S GROUP MESSAGES, compared the way `aGroupReplyThatMentionsTheOtherSide` compares a
  // sender: the stored kind and id exactly as they were written.
  const chosen =
    groupLinesFrom === null
      ? concerning().union(notices)
      : concerning()
          .union(notices)
          .union(
            db
              .select({ id: records.id })
              .from(records)
              .where(
                and(
                  live,
                  eq(STORED_FIELDS.messageSentById(records.data), groupLinesFrom.id),
                  eq(sql`json_extract(${records.data}, '$.sentBy.kind')`, groupLinesFrom.kind),
                  sql`json_type(${records.data}, '$.toGroup') = 'text'`,
                ),
              ),
          )
  return chosen
}

/**
 * WHAT AN UNREGISTERED WRITER HAS SENT THIS READER, oldest first.
 *
 * There is no other side to this conversation. Nobody can write back to a name with no registry row
 * behind it, so this is every message that writer addressed to this reader and nothing else.
 * Criterion M25.
 */
export function conversationWithUnregistered(
  writer: UnregisteredWriter,
  me: ParticipantRef,
  which: WhichProjects,
  everyone: readonly KnownParticipant[],
): PoolEntry[] {
  const wanted = unregisteredKey(writer)
  return poolOf(which).filter((one) => {
    if (one.toGroup !== null) return false
    if (!one.to.some((to) => sameParticipant(to, me))) return false
    const from = unregisteredWriterOf(one, everyone)
    return from !== null && unregisteredKey(from) === wanted
  })
}

/**
 * One line about one contact: who they are, the last thing said either way, and how many are unread.
 *
 * EXACTLY ONE OF `who` AND `unregistered` IS SET. A contact is either somebody in a registry or a
 * writer nobody registered, and the two are different shapes so no reader can treat the second as
 * the first. Criterion M25.
 *
 * `Last` is the shape of the last line. Every row handed out has a whole entry there. Only inside the
 * contact read (`theContactsOfOneReader`) is it the narrow entry, until that read builds it whole.
 */
export interface ContactLine<Last extends AMessageTheContactsRead = PoolEntry> {
  /** The registered participant this row is, or null when nobody registered the writer. */
  who: ParticipantRef | null
  /** The writer nobody registered, or null when this row is a registered participant. */
  unregistered: UnregisteredWriter | null
  /** The newest message either way, or null when nothing has been said. */
  last: Last | null
  /**
   * How many messages from them this reader has not marked seen. A line Mole Office wrote is not one
   * of them, criterion M33: it shows without counting.
   */
  unread: number
  /**
   * WHETHER ANYTHING HERE IS UNREAD AT ALL, a system line included. Criterion M33: this is what makes
   * the row bold, and `unread` above is what puts a number on it. It is true whether only a system line
   * or a real message is unread.
   */
  anythingUnread: boolean
  /**
   * THE STARTER THIS ROW IS FOLDED UNDER, or null because it is a contact of the person's own.
   *
   * Criterion P10: the person's contact list holds the secretary
   * and every agent they have spoken to; every other registered agent is folded under the agent that
   * started it, one press away, and is not a contact.
   *
   * FOUR THINGS MAKE A ROW FOLDED, and each is a reason not to put it in front of the person. It is a
   * registered agent. Something recorded who started it. That starter is an AGENT — an agent the
   * person started is their own contact, which is what keeps the secretary in the list without
   * naming the role anywhere, since only the person appoints one. And the person has never exchanged a
   * message with it: an agent that has written to them becomes a contact, because they can now answer it.
   *
   * FOLDING CHANGES NO COUNT. A folded agent's conversation is between agents, and between-agents
   * has never counted toward the circle: criterion M32 counts only the conversations the person takes
   * part in. The row keeps its own `unread` so that the
   * starter's fold can say how much is inside it.
   */
  foldedUnder: ParticipantRef | null
  /**
   * An agent's own projects, or the projects of the conversation for another kind of contact.
   */
  projects: string[]
}

/** The one key that names a contact row, whether a registry holds it or not. */
export function contactKey(line: Pick<ContactLine, 'who' | 'unregistered'>): string {
  return line.who !== null ? participantKey(line.who) : unregisteredKey(line.unregistered ?? { typed: null, said: null })
}

/**
 * EVERYBODY EITHER REGISTRY HOLDS, with the name and the handle the contacts library needs.
 *
 * One reader for both registries, called from every route that needs the set. Before criterion M25
 * three routes each built their own list of refs; a fourth needing the names as well would have
 * been a fourth copy, and copies of one fact are what this repository keeps finding wrong.
 *
 * IT MOVED HERE FROM THE ROUTE FILE when the profile page needed it too (criterion M51). It was
 * always the contacts library's question — who is registered — and a copy in a second file would
 * have been the fourth copy this note was written to prevent.
 */
export function everybodyRegistered(aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite)): KnownParticipant[] {
  // ONLY THE THREE COLUMNS THIS NEEDS, from the same rows in the same order as `listParticipants`.
  return asKnownParticipants(everyNameInTheRegistries(), aliases)
}

/**
 * EVERYBODY A STORED SENDER COULD NAME: the rows of either registry whose id or handle is its id, or, for an agent's old
 * registry id, its canonical id, in the shape and the order `everybodyRegistered` gives. `senderOf` given these says
 * what it says given everybody, for a message whose sender is stored, because `theAgentAStoredSenderNames` compares a
 * row's id, old ids and handle with the stored id and nothing else. A typed `from` is matched by name too, so a message
 * without a stored sender still needs `everybodyRegistered`.
 */
function everybodyAStoredSenderCouldName(sentBy: ParticipantRef, aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite)): KnownParticipant[] {
  const id = sentBy.kind === 'agent' ? theRegistryIdsOf(sqlite, sentBy.id, aliases)[0]! : sentBy.id
  return asKnownParticipants(theNamesWithThisIdOrHandle(id), aliases)
}

function asKnownParticipants(both: ReturnType<typeof everyNameInTheRegistries>, aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite)): KnownParticipant[] {
  return [
    ...both.people.map((one): KnownParticipant => ({ who: { kind: 'person', id: one.id }, name: one.name, handle: one.handle })),
    ...both.agents.map((one): KnownParticipant => {
      const oldIds = theRegistryIdsOf(sqlite, one.id, aliases).slice(1)
      return { who: { kind: 'agent', id: one.id }, name: one.name, handle: one.handle, ...(oldIds.length > 0 ? { oldIds } : {}) }
    }),
  ]
}

/**
 * EVERYBODY, WITH EACH AGENT'S OWN RECORD IN THE READING PROJECT WHERE A MESSAGE MAY STORE IT (wave 13y round 89).
 *
 * A message may store an agent's own record id as its sender. `theAgentAStoredSenderNames` names that agent only when
 * the list carries the record, and the browser's lists carry it from `GET /api/participants` for the page's project. So
 * the server reads these messages by the same rule, in the project the request names. A list built with no record
 * still matches none, as before.
 *
 * Only the records that can matter are read. `withTheOwnRecordsOf` reads the records of the agents of one pair, and
 * `withTheRecordsOfTheseIds` reads the agents that hold, as a record, one of the stored ids no registry id answers. Each
 * is one statement, and none is made when there is nothing to ask. `withEveryOwnRecordIn` reads every agent's, for a
 * read that names the writers of every message there is.
 */
function withTheirOwnRecords(everyone: KnownParticipant[], own: ReadonlyMap<string, string>): KnownParticipant[] {
  if (own.size === 0) return everyone
  return everyone.map((one) => {
    const record = one.who.kind === 'agent' ? own.get(one.who.id) : undefined
    return record === undefined ? one : { ...one, record }
  })
}

/**
 * Everybody, with every agent's own record in this project, as the browser's list of participants carries them, in one
 * statement (wave 13y round 91, gap 7). For the Between agents list, which names the writers of every message: finding
 * first which agents the messages store, as `withTheRecordsTheseMessagesStore` does, took 6.6 ms on the made-up office,
 * and this took 0.4 ms. The list was the same.
 */
function withEveryOwnRecordIn(everyone: KnownParticipant[], workspaceId: string): KnownParticipant[] {
  return withTheirOwnRecords(everyone, recordsForAgentsIn(workspaceId))
}

/** Everybody, with the own records of the agents among `sides`: the two sides of a conversation. */
export function withTheOwnRecordsOf(everyone: KnownParticipant[], sides: readonly ParticipantRef[], workspaceId: string): KnownParticipant[] {
  const agents = sides.filter((one) => one.kind === 'agent').map((one) => one.id)
  return agents.length === 0 ? everyone : withTheirOwnRecords(everyone, recordsForAgentsIn(workspaceId, agents))
}

/**
 * Everybody, with the own record of each agent that holds one of these stored agent ids as a record. An id that is an
 * agent's registry id is that agent's before any record is read, so it is not asked.
 */
export function withTheRecordsOfTheseIds(everyone: KnownParticipant[], ids: Iterable<string>, workspaceId: string): KnownParticipant[] {
  const registered = new Set(everyone.filter((one) => one.who.kind === 'agent').map((one) => one.who.id))
  const asked = [...new Set(ids)].filter((id) => !registered.has(id))
  return asked.length === 0 ? everyone : withTheirOwnRecords(everyone, theOwnRecordsOfTheAgentsHolding(workspaceId, asked))
}

/**
 * THE MESSAGES PAGE'S NARROWINGS BY SENDER AND BY CONTACT, NAMED AS THE CONTACTS DOOR NAMES PEOPLE (wave 13y round 91,
 * gap 6). The page sends a participant's registry key. A message may store an agent's own record or its handle as its
 * sender or in a delivery row, and compared as stored such a message was missed. Now the participant asked for, the
 * stored sender and each stored recipient are all named by `theAgentAStoredSenderNames`, with own records in
 * `workspaceId`. One that nobody answers is kept as stored, so a key that nobody answers still keeps only the messages
 * that store it. Nothing is read when neither narrowing is asked.
 * ONLY THE OWN RECORDS OF THE ONES ASKED FOR ARE READ. A stored participant names one of them only by its registry id,
 * its handle or its own record there. Reading the own record of every agent the pool stores made the narrowing about
 * 6 ms slower on the made-up office, most of it the walk over every message to find those agents.
 */
export function theNarrowingsByWho(
  workspaceId: string,
  asked: { sender?: string; contact?: string },
): { sentBy: (one: PoolEntry) => boolean; reached: (one: PoolEntry) => boolean } {
  if (asked.sender === undefined && asked.contact === undefined) return { sentBy: () => false, reached: () => false }
  const sender = asked.sender === undefined ? null : participantFromKey(asked.sender)
  const contact = asked.contact === undefined ? null : participantFromKey(asked.contact)
  const agentsAsked = [sender, contact].flatMap((who) => (who !== null && who.kind === 'agent' ? [who.id] : []))
  const registered = withTheRecordsOfTheseIds(everybodyRegistered(), agentsAsked, workspaceId)
  const named = (who: ParticipantRef | null): ParticipantRef | null => (who === null ? null : (theAgentAStoredSenderNames(who, registered) ?? who))
  const theSender = named(sender)
  const theContact = named(contact)
  const theOnesAsked = [theSender, theContact].flatMap((who) => (who === null ? [] : [who]))
  const { participantOf } = theWritersOfOnePool(withTheOwnRecordsOf(registered, theOnesAsked, workspaceId))
  return {
    sentBy: (one) => theSender !== null && one.sentBy !== null && sameParticipant(participantOf(one.sentBy), theSender),
    reached: (one) => theContact !== null && one.deliveries.some((delivery) => sameParticipant(participantOf(delivery.to), theContact)),
  }
}

/**
 * Everybody, with the own record of each agent these messages store as their sender or as a recipient: a delivery row
 * may hold an agent's own record as well (wave 13y round 91).
 */
function withTheRecordsTheseMessagesStore(everyone: KnownParticipant[], messages: readonly AMessageTheContactsRead[], workspaceId: string): KnownParticipant[] {
  return withTheRecordsOfTheseIds(everyone, theAgentIdsTheseMessagesStore(messages), workspaceId)
}

/** Every agent id these messages store, as their sender or as a recipient. */
function theAgentIdsTheseMessagesStore(messages: readonly AMessageTheContactsRead[]): Set<string> {
  const ids = new Set<string>()
  for (const one of messages) {
    if (one.sentBy !== null && one.sentBy.kind === 'agent') ids.add(one.sentBy.id)
    for (const to of one.to) if (to.kind === 'agent') ids.add(to.id)
  }
  return ids
}

/**
 * ONE CONTACT ROW, AS THE ARRANGEMENT NEEDS IT: its key, and what it is.
 *
 * The key comes from `contactKey` above, the one function that names a contact row whether a
 * registry holds it or not — so the panel, the placement rows and the profile page all key a
 * contact the same way.
 */
export function asAContactToPlace(line: ContactLine): ContactToPlace {
  return theContactToPlace(line, (id) => readParticipant({ kind: 'agent', id }) as RegisteredAgent | null)
}

/**
 * EVERY CONTACT ROW AS THE ARRANGEMENT NEEDS IT, reading each agent's registry row from `agents`.
 *
 * The same answer as `asAContactToPlace` on each row. `agents` is `everyAgentById()`, read once by
 * the caller for this request, so a list of 400 agents costs one read of the registry and not one
 * read per row.
 */
export function asContactsToPlace(lines: readonly ContactLine[], agents: ReadonlyMap<string, RegisteredAgent>): ContactToPlace[] {
  return lines.map((line) => theContactToPlace(line, (id) => agents.get(id) ?? null))
}

/**
 * EVERY REGISTERED AGENT BY ITS REGISTRY ID, from one read of the registry.
 *
 * It is `listParticipants`, which reads each row the way `readParticipant` does. It lives for the
 * one request that read it and is never kept.
 */
export function everyAgentById(): Map<string, RegisteredAgent> {
  return new Map(listParticipants().agents.map((one) => [one.id, one]))
}

/** One contact row as the arrangement needs it. `readAgent` reads an agent's registry row by its id. */
function theContactToPlace(line: ContactLine, readAgent: (id: string) => RegisteredAgent | null): ContactToPlace {
  const kind = line.who?.kind ?? null
  const id = line.who?.id ?? null
  // THE CARD THE REGISTRY READS THE AGENT AS, and whether it is retired. Both are read here rather
  // than on the wire, because they belong to the arrangement and not to the row a reader sees: a
  // contact moved to a role group is placed by this, and a retired agent lands in `retired`
  // (criterion M121). A registered row with no card reads as `worker`, which is the one reading in
  // `A_ROW_WITH_NO_ROLE_READS_AS` — used here rather than guessed a second time.
  let role: string | null = null
  let retired = false
  if (kind === 'agent' && id !== null) {
    // `line.who.id` is a REGISTRY ID, built by `everybodyRegistered` from the registry rows, so it
    // is read by id and never by handle: a handle-only lookup would place the wrong agent, or none,
    // once an agent's id is no longer its handle.
    const row = readAgent(id)
    if (row !== null) {
      role = row.role ?? A_ROW_WITH_NO_ROLE_READS_AS
      retired = row.retired
    }
  }
  return { key: contactKey(line), kind, id, role, retired }
}

/**
 * EVERY PARTICIPANT THIS READER COULD WRITE TO, with the last thing said and the unread count.
 *
 * `everyone` is handed in rather than read here, because who is registered is the participants
 * library's question and asking it twice is how two screens end up disagreeing about who exists.
 */
/**
 * WHICH STARTER A CONTACT ROW IS FOLDED UNDER, or null because it is a contact of the person's own.
 *
 * Criterion P10. The four conditions are on the field's own comment; this is the reading. It is
 * asked once per contact and answered from the registry row, which the caller has already loaded
 * for every other reason.
 */
function whoThisRowIsFoldedUnder(
  who: ParticipantRef,
  last: AMessageTheContactsRead | null,
  agents: ReadonlyMap<string, RegisteredAgent>,
): ParticipantRef | null {
  if (who.kind !== 'agent') return null
  // AN AGENT THE PERSON HAS SPOKEN WITH IS A CONTACT, whatever started it. The person's own sentence: an
  // agent that writes to them without having been a contact becomes one, because they can now answer it.
  if (last !== null) return null
  // `who.id` is a REGISTRY ID, because `contactsFor` walks the list `everybodyRegistered` built from
  // the registry rows. Read it by id: a handle-only lookup would fold the row under nobody, or under
  // the wrong starter, the day an agent's id stops being its handle. `agents` is keyed by that id.
  const row = agents.get(who.id) ?? null
  if (row === null || row.startedBy === null) return null
  // AN AGENT THE PERSON STARTED IS THEIR OWN CONTACT, and this is what keeps the secretary in the
  // list without naming the role anywhere. Only the person appoints a secretary, so a secretary's
  // starter is always the person; folding is under an AGENT, and there is nothing to fold a row under
  // when the person started it themselves. The same sentence covers every other agent they start by hand.
  if (row.startedBy.kind !== 'agent') return null
  return row.startedBy
}

/**
 * WHO WROTE EACH MESSAGE OF ONE POOL, worked out once per writer for one call.
 *
 * `senderOf` and `unregisteredWriterOf` each walk the whole registry for one message, and their
 * answer depends only on the message's stored `sentBy` and its typed `from`. Thousands of messages
 * share a few hundred of those. So each distinct pair is asked once, and the answer is used again
 * for every other message that carries the same pair. The answers are kept only by the object this
 * returns, which lives for the one call that made it, with the one `everyone` it was given.
 *
 * `recipientsOf` reads each stored recipient the same way, once per stored participant (wave 13y round 91): by
 * `theAgentAStoredSenderNames`, and as it is stored when nobody answers it. Only an agent's handle, own record or old
 * registry id can name another participant than the one stored, so a message none of whose recipients holds one keeps its own `to`,
 * and nothing is looked up or made for it. Measured on the made-up office, the person's contacts were about 5 ms
 * slower when every message was looked up. `participantOf` is that rule for one stored participant, sender or
 * recipient (wave 13y round 91, gap 6).
 */
function theWritersOfOnePool(everyone: readonly KnownParticipant[]): {
  senderOf: (one: Pick<MessageOnTheWire, 'sentBy' | 'from'>) => ParticipantRef | null
  unregisteredWriterOf: (one: Pick<MessageOnTheWire, 'sentBy' | 'from'>) => UnregisteredWriter | null
  recipientsOf: (one: Pick<MessageOnTheWire, 'to'>) => readonly ParticipantRef[]
  participantOf: (who: ParticipantRef) => ParticipantRef
} {
  const senders = new Map<string, ParticipantRef | null>()
  const unregistered = new Map<string, UnregisteredWriter | null>()
  const recipients = new Map<string, ParticipantRef>()
  const aliases = new Set<string>()
  for (const known of everyone) {
    if (known.who.kind !== 'agent') continue
    aliases.add(known.handle)
    if (typeof known.record === 'string') aliases.add(known.record)
    for (const old of known.oldIds ?? []) aliases.add(old)
  }
  const keyOf = (one: Pick<MessageOnTheWire, 'sentBy' | 'from'>): string => JSON.stringify([one.sentBy?.kind ?? null, one.sentBy?.id ?? null, one.from])
  const recipientOf = (to: ParticipantRef): ParticipantRef => {
    const key = participantKey(to)
    let who = recipients.get(key)
    if (who === undefined) {
      who = theAgentAStoredSenderNames(to, everyone) ?? to
      recipients.set(key, who)
    }
    return who
  }
  return {
    recipientsOf: (one) => (one.to.some((to) => to.kind === 'agent' && aliases.has(to.id)) ? one.to.map(recipientOf) : one.to),
    participantOf: (who) => (who.kind === 'agent' && aliases.has(who.id) ? recipientOf(who) : who),
    senderOf: (one) => {
      const key = keyOf(one)
      if (!senders.has(key)) senders.set(key, senderOf(one, everyone))
      return senders.get(key) ?? null
    },
    unregisteredWriterOf: (one) => {
      const key = keyOf(one)
      if (!unregistered.has(key)) unregistered.set(key, unregisteredWriterOf(one, everyone))
      return unregistered.get(key) ?? null
    },
  }
}

export function contactsFor<Entry extends AMessageTheContactsRead = PoolEntry>(
  me: ParticipantRef,
  everyone: readonly KnownParticipant[],
  which: WhichProjects,
  // THE POOL, READ ONCE BY A CALLER THAT ALSO WANTS IT FOR SOMETHING ELSE. A caller that already
  // read the pool for this same width hands it in, and one that has not gets it read here, whole,
  // exactly as before. The contact read (`theContactsOfOneReader`) is such a caller.
  // IT NEED NOT BE THE WHOLE POOL. That read hands in only the reader's part of it, the messages
  // `theMessagesOfOneReader` reads, and the answer is the same: any list holding every message of that
  // part, in the pool's order, gives the same answer.
  // NOR NEED ITS ENTRIES BE WHOLE. Every field read here is one of `AMessageTheContactsRead`, and each
  // row's `last` is the very entry handed in, so the rows are the same whichever shape the pool has.
  pool: readonly (Entry | PoolEntry)[] = poolOf(which),
  // EVERY AGENT'S REGISTRY ROW, READ ONCE. The folding below reads a row per agent contact, and a
  // caller that also places the rows (`asContactsToPlace`) hands in the one it read for that.
  agents: ReadonlyMap<string, RegisteredAgent> = everyAgentById(),
): ContactLine<Entry | PoolEntry>[] {
  type One = Entry | PoolEntry
  // A RETIRED AGENT IS A CONTACT AGAIN, IN ITS OWN GROUP. Criterion M114 said it was not drawn;
  // criterion M121 replaces that: every group can be folded away, and the retired agents' group is folded by
  // default. So it stays a contact, `asAContactToPlace` puts it in the `retired` group,
  // and the panel folds that group away until somebody opens it. Its conversation is still readable
  // by address, whichever group draws it.

  const out: { line: ContactLine<One>; at: number }[] = []
  // CRITERION M128: the pair each message was between, built once for the whole list, so a notice
  // naming a message makes this contact's row its newest line without a second read of the pool.
  const aboutParties = thePartiesOfEveryPair(pool)
  // WHO WROTE EACH MESSAGE, worked out once per writer and not once per message per contact.
  const writers = theWritersOfOnePool(everyone)
  const officeTest = theMoleOfficeTest()
  // EVERY MESSAGE BETWEEN THIS READER AND EACH CONTACT, in one walk of the pool, keyed by the
  // contact's `participantKey`. Each message is asked once who it is between, rather than once per
  // contact whether it is between the two: the pool times the contacts was 4 to 7 seconds a call on
  // a copy of the person's office on 25 September 2026 (problem zo_hyUBLSAVJ). `at` is where the last of
  // them sits in the pool.
  const withEach = new Map<string, { between: One[]; at: number }>()
  for (const [i, one] of pool.entries()) {
    const sides = new Set<string>()
    const recipients = one.toGroup !== null ? [] : writers.recipientsOf(one)
    for (const other of everyoneElseThisMessageIsBetween(one, me, writers.senderOf(one), recipients, writers.participantOf, aboutParties, officeTest)) {
      const key = participantKey(other)
      if (sides.has(key)) continue
      sides.add(key)
      const held = withEach.get(key)
      if (held === undefined) withEach.set(key, { between: [one], at: i })
      else {
        held.between.push(one)
        held.at = i
      }
    }
  }
  const projectsByAgent = projectsOfAgents()
  const ownerHasUpgradeConversation = me.kind === 'person' && me.id === THE_PERSON &&
    hasOriginalUpgradeNoticeForOwner(me.id, 'oneProject' in which ? which.oneProject : undefined)
  for (const known of everyone) {
    const who = known.who
    if (sameParticipant(who, me)) continue
    // The owner can read approved upgrade notices in Mole Office's conversation.
    // Other readers and offices with no original announcement have no such contact.
    if (officeTest(who) && !ownerHasUpgradeConversation) continue
    const held = withEach.get(participantKey(who))
    const between: readonly One[] = held?.between ?? []
    const last: One | null = between[between.length - 1] ?? null
    // WHERE THE LAST MESSAGE SITS IN THE POOL, not the stamp on it. Stamps here are whole seconds,
    // so two messages written in the same second tie, and a tie would put the conversations in an
    // order that changes for no reason a reader could see. The pool is read oldest first, so a
    // later position is a later message whatever the clock managed to record.
    const at = held?.at ?? -1
    // AND `unreadAmong` COUNTS THEM, because it is the one rule that decides what unread means.
    //
    // This loop used to count its own way — a delivery row to me that does not say seen, from a
    // sender that is this contact — which is the same rule written twice. Decision note
    // `lIeXwxRuKqUQ` said all four counts went through `unreadAmong` and they did not: changing
    // what `unreadAmong` counted left every contact row where it was and no test failed. Problem
    // `gaN4pV3v0wNw`.
    //
    // WHAT CHANGED WITH IT: a line Mole Office wrote into this conversation now counts. It has a
    // delivery row addressed to this reader like any other message here, so leaving it out was the
    // circle and the rows disagreeing about one of them.
    out.push({
      line: {
        who,
        unregistered: null,
        last,
        unread: unreadAmong(between, me, officeTest),
        // AND WHETHER ANYTHING IS UNREAD AT ALL, criterion M33. A conversation holding nothing but a
        // line Mole Office wrote has `unread` 0 and this true, which is exactly what criterion M33 asks for:
        // the row is bold and carries no number.
        anythingUnread: anythingUnreadAmong(between, me),
        foldedUnder: whoThisRowIsFoldedUnder(who, last, agents),
        projects: who.kind === 'agent' ? (projectsByAgent.get(who.id) ?? []) : theProjectsOfAConversation(between),
      },
      at,
    })
  }

  /**
   * AND A ROW FOR EVERY WRITER NOBODY REGISTERED, under the line it typed.
   *
   * ---------------------------------------------------------------------------------------
   * THIS IS WHAT REPLACED THE BOARD
   * ---------------------------------------------------------------------------------------
   *
   * These messages used to be gathered into one section called "The board". That section is gone:
   * every message is drawn in a conversation, and a writer nobody registered
   * gets one of its own under the name it typed. So the same messages are here, one row per writer
   * rather than one row for all of them, and the arithmetic that made the board necessary still
   * holds — what the circle counts is what the panel can open, because both are these rows.
   *
   * A MESSAGE THIS READER SENT IS NOT ONE OF THESE. Its writer is the reader, who is registered.
   */
  const byWriter = new Map<string, { line: ContactLine<One>; at: number }>()
  for (const [i, one] of pool.entries()) {
    if (one.toGroup !== null) continue
    if (!one.to.some((to) => sameParticipant(to, me))) continue
    const writer = writers.unregisteredWriterOf(one)
    if (writer === null) continue
    const key = unregisteredKey(writer)
    const held = byWriter.get(key)
    // ONE RULE HERE TOO. `unreadAmong` counts one message the same way it counts a list of them.
    const unread = (held?.line.unread ?? 0) + unreadAmong([one], me, officeTest)
    const anythingUnread = (held?.line.anythingUnread ?? false) || anythingUnreadAmong([one], me)
    // A WRITER NOBODY REGISTERED IS FOLDED UNDER NOBODY. There is no registry row, so there is no
    // starter to fold it under — which is the state the person's rule of 3 September leaves it in: name it,
    // never stop it. Null is that answer and not a default.
    // AND ITS PROJECTS, one message at a time by the same rule, since the pool is read oldest first.
    const projects = theProjectsWithANewerMessage(held?.line.projects ?? [], one)
    byWriter.set(key, {
      line: { who: null, unregistered: writer, last: one, unread, anythingUnread, foldedUnder: null, projects },
      at: i,
    })
  }
  out.push(...byWriter.values())

  // Newest conversation first, then the ones nobody has written to, by name so the order is stable.
  return out
    .sort((x, y) => y.at - x.at || nameOfContact(x.line).localeCompare(nameOfContact(y.line)))
    .map((one) => one.line)
}

/**
 * ONE READER'S CONTACT ROWS, IN EVERY PROJECT, READ THE ONE WAY EVERY DOOR THAT DRAWS THEM READS THEM.
 *
 * `GET /api/messages/contacts`, `GET /api/messages/contact-list`, `GET /api/messages/circle` and the Embassy's contact
 * column all ask this, so they cannot read the contacts two ways. Only the reader's part of the pool is read, the rows
 * `theMessagesOfOneReader` builds from, which gives the same rows as the whole pool, and every agent's registry row is
 * read once. The pool and the registry rows are handed back too, for a caller that needs them for something else.
 *
 * THE POOL IS BUILT NARROW, AND ONLY EACH ROW'S LAST LINE IS BUILT WHOLE. The rows, their counts and the reader's rule
 * read ten fields of each message (`AMessageTheContactsRead`), and a door hands out only each row's last line, whole.
 * A whole entry has about forty fields, and it needs `whatTheProjectSays` first. In a profile of this read over a
 * made-up office of 35,701 messages, with 2,639 contact rows, one read took about 978 ms. Of that, `whatTheProjectSays`
 * took 50 ms, `asEntry` and `asMessage` 48 ms, and garbage collection 212 ms. Those are times from a profile, not a
 * measure.
 * So every message is built with the ten fields, and the last lines alone are built whole, by `asEntry`, from the rows
 * this read already holds (`withTheLastLinesWhole`). No message row and no delivery row is read twice.
 *
 * The pool handed back is the narrow one. Its one other reader is the group counts of the circle (`unreadInAGroup`),
 * which read only its fields.
 *
 * The Embassy read the whole pool here until 27 September 2026. In a CPU profile on a copy of the person's
 * office, the contact column took about 174 ms of each Embassy call that way and about 138 ms this way.
 */
export function theContactsOfOneReader(
  me: ParticipantRef,
  // WHO IS READING, when a door knows it: then only the messages that reader may read go into the rows
  // so no row's last line is a message it may not read. Left out, as the
  // Embassy leaves it for placing contacts, every message of the reader's part of the pool is used.
  reader: AMessageReader | null = null,
  // THE PROJECT THE READER IS IN, when a door knows it (wave 13y round 89). Then a message stored under an agent's own
  // record in that project is that agent's, as the browser reads it, and since round 90 that is the reader's own record
  // too, so a message it stored under that record is in its own rows. Left out, as the Embassy leaves it, no record is
  // read.
  workspaceId: string | null = null,
  // THE FILED REGISTRY ALIASES, from a door that reads them for something else too, so they are read once for it.
  aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite),
): {
  contacts: ContactLine[]
  pool: AMessageTheContactsRead[]
  agents: Map<string, RegisteredAgent>
  /** Everybody either registry holds, with their names: the chat's filter box finds a row by its name (criterion M124). */
  everyone: KnownParticipant[]
} {
  const registered = everybodyRegistered(aliases)
  const mine = workspaceId === null ? registered : withTheOwnRecordsOf(registered, [me], workspaceId)
  // THE ROWS `theMessagesOfOneReader` READS, AND THEIR DELIVERY ROWS, read once: the reader's rule below and the last
  // lines are both given them and read neither again.
  const read = theRowsChosenFor(me, mine, EVERY_PROJECT, null)
  const narrow = contactEntriesOf(read)
  // THE READER'S RULE IS ASKED OF THE SAME IDS, WITH THE SAME ROWS, as when the pool was whole. It reads only each
  // entry's id and kind and the rows it is given, so it keeps the same messages whichever shape the pool has.
  const pool = reader === null ? narrow : onlyTheMessagesThisReaderMayRead(reader, narrow, new Map(), read)
  const everyone = workspaceId === null ? registered : withTheRecordsTheseMessagesStore(mine, pool, workspaceId)
  const agents = everyAgentById()
  const rows = contactsFor<AMessageTheContactsRead>(me, everyone, EVERY_PROJECT, pool, agents)
  return { contacts: withTheLastLinesWhole(rows, read), pool, agents, everyone }
}

/**
 * THE CONTACT ROWS WITH EACH LAST LINE BUILT WHOLE, by `asEntry` through `entriesOf`, and nothing else changed.
 *
 * Only the rows of the last lines are built, and they are taken from `read`, the rows the narrow entries were built
 * from, with their delivery rows, so no row is read again. `whatTheProjectSays` is asked about those rows alone. Every
 * answer it gives a message comes from that message's own fields: the run its `fromRun` names, its sender's registry row
 * and flags, and what holds for the whole project. So each last line is the entry a whole pool would have held. Each
 * row keeps its keys in their order, so the answer a door serves is the same text.
 */
function withTheLastLinesWhole(rows: readonly ContactLine<AMessageTheContactsRead>[], read: MessagesJustRead): ContactLine[] {
  const lastIds = new Set<string>()
  for (const line of rows) if (line.last !== null) lastIds.add(line.last.id)
  const whole = new Map(entriesOf(read.rows.filter((row) => lastIds.has(row.id)), EVERY_PROJECT, read.deliveries).map((one) => [one.id, one]))
  return rows.map((line) => {
    if (line.last === null) return { ...line, last: null }
    const last = whole.get(line.last.id)
    // EVERY LAST LINE IS ONE OF `read`'S ROWS, because the narrow entries were built from them. One missing says that
    // assumption broke, and no row is handed out without its last line.
    if (last === undefined) throw new Error(`The contact read built no whole entry for its last line ${line.last.id}.`)
    return { ...line, last }
  })
}

/**
 * THE NAME A CONTACT ROW SORTS UNDER, whichever kind of row it is.
 *
 * A registered contact sorts by its id, which is what it sorted by before; an unregistered writer
 * sorts by the line it typed. One function, so the order cannot depend on which branch a row took.
 */
function nameOfContact(line: Pick<ContactLine, 'who' | 'unregistered'>): string {
  return line.who !== null ? line.who.id : unregisteredName(line.unregistered ?? { typed: null, said: null })
}

/**
 * HOW MANY OF THESE MESSAGES THIS READER HAS NOT SAID THEY READ.
 *
 * ONE PLACE DECIDES WHAT UNREAD MEANS, and every count in this product goes through it: a contact's
 * number, a group's and the number on the circle. Criterion M19 asks the circle to agree with the
 * rows under it, and the only way two numbers cannot disagree is for there to be one rule producing
 * both.
 *
 * Unread is `the delivery row addressed to me does not say seen`. A message with no delivery row for
 * this reader is not theirs and is not counted, and a message they sent is not counted either,
 * because there is no row addressed to them on it.
 *
 * A LINE MOLE OFFICE WROTE IS NOT COUNTED, criterion M33, but it is still shown.
 * A group was opened, a run ended, the API restarted —
 * none of those is a message anybody wrote to the person, and a number on the circle that counts them
 * is a number they cannot answer. It still has a delivery row, and `anythingUnreadAmong` below is what
 * reads that row, so the line is still SHOWN: it makes the row bold and it enters no count.
 *
 * IT COUNTED UNTIL NOW, AND THAT WAS DELIBERATE TOO. Decision `VsbQJTWDPQAV` put system lines into
 * the count so that the circle and the rows agreed about them; the person's rule reaches the same agreement
 * by taking them out of both.
 *
 * `officeTest` is `theMoleOfficeTest()` from a caller that counts many times in one pass (wave 13y round 91, gap 4).
 * Left out, Mole Office's registry row is read again for each message an agent sent.
 */
export function unreadAmong(
  messages: readonly AMessageTheContactsRead[],
  me: ParticipantRef,
  officeTest: (who: ParticipantRef) => boolean = isMoleOffice,
): number {
  return messages.filter((one) => !isASystemLine(one, officeTest) && isUnseenBy(one, me)).length
}

/**
 * TRUE WHEN ANYTHING HERE IS UNREAD, INCLUDING A LINE MOLE OFFICE WROTE. Criterion M33.
 *
 * The contact's name is bold when
 * there is something there, whether it is only a system line or a real message. So this is what
 * boldness is drawn from and `unreadAmong` above is what every NUMBER is counted from. Two questions,
 * two functions, both reading the same delivery rows: neither can drift from the other, because
 * `isUnseenBy` is the one rule underneath both.
 */
export function anythingUnreadAmong(messages: readonly AMessageTheContactsRead[], me: ParticipantRef): boolean {
  return messages.some((one) => isUnseenBy(one, me))
}

/** The one rule: there is a delivery row addressed to this reader and it does not say seen. */
function isUnseenBy(one: AMessageTheContactsRead, me: ParticipantRef): boolean {
  const mine = one.deliveries.find((d) => sameParticipant(d.to, me))
  return mine !== undefined && mine.mark !== 'seen'
}

/**
 * TRUE WHEN MOLE OFFICE ITSELF WROTE THIS LINE, which is what makes it a notice and not a message.
 *
 * The same question `isASystemLine` in src/web/components/Chat.tsx asks of the same field, and it is
 * asked here as well rather than sent down as a flag: the sender is already on every entry, and a
 * second field saying what the sender already says is the defect CLAUDE.md names at the top.
 */
function isASystemLine(one: AMessageTheContactsRead, officeTest: (who: ParticipantRef) => boolean = isMoleOffice): boolean {
  return one.sentBy !== null && officeTest(one.sentBy)
}

/**
 * TRUE WHEN THIS PARTICIPANT HAS WRITTEN TO THAT ONE, ever, in this project.
 *
 * It answers exactly one question, and it is the question decision `wvfrwvuzsKF_` asks: an agent may
 * learn the person is here only after the person has written to it. So the direction matters and is
 * not symmetric: an agent
 * writing to them does not open the door. Criterion M20.
 *
 * A GROUP MESSAGE COUNTS WHEN THE OTHER IS ONE OF ITS RECIPIENTS. The person wrote it and the
 * others were handed it, which is the whole of what the person was asked. The delivery rows are
 * what say who was handed it, so a member added later has not been written to and a member who
 * has since left has been.
 */
export function hasWrittenTo(from: ParticipantRef, to: ParticipantRef, workspaceId: string): boolean {
  const rows = db
    .select({ id: records.id })
    .from(messageDelivery)
    .innerJoin(records, eq(records.id, messageDelivery.messageId))
    .where(
      and(
        messagesInTheViewOf(justThisProject(workspaceId)),
        eq(records.kind, 'message'),
        isNull(records.deletedAt),
        eq(messageDelivery.recipientKind, to.kind),
        eq(messageDelivery.recipientId, to.id),
      ),
    )
    .all()
  if (rows.length === 0) return false
  const pool = messagePool(workspaceId)
  const wanted = new Set(rows.map((one) => one.id))
  return pool.some((one) => wanted.has(one.id) && one.sentBy !== null && sameParticipant(one.sentBy, from))
}


/**
 * One conversation between two agents, as the list of them carries it.
 *
 * `newSince` IS NOT THE SAME KIND OF NUMBER AS A CONTACT'S `unread`, and that is why it has its own
 * name. Nothing in a conversation between two agents is addressed to the person reading it, so there
 * are no delivery rows of theirs to be unseen. What there is instead is the time they last opened it
 * — `conversation_reads`, criterion M12 — so this counts the messages written since then. A
 * conversation nobody has opened counts all of them.
 */
export interface BetweenAgents {
  between: [ParticipantRef, ParticipantRef]
  last: PoolEntry
  /**
   * How many messages have been written here since this reader last opened it. A line Mole Office
   * wrote is not one of them, criterion M33: it shows without counting.
   */
  newSince: number
  /** Whether anything at all has been written since then, a system line included. Criterion M33. */
  anythingNew: boolean
  /** The projects its messages were written in or are marked about, latest first. */
  projects: string[]
}

/**
 * WHICH AGENT THE DOOR TO ONE PAIR READS ONE SIDE AS (wave 13y round 129, item 67, option (b)).
 *
 * GET /api/messages/between/:pair reads each side of the pair it is asked for as an arriving reference, criterion I2:
 * an id, a live agent's handle, then a handle exactly one retired agent bore. A string nobody bears is kept as sent. The
 * list of conversations between agents asks the same of each side before it calls two sides one agent, so the list
 * offers no row the door refuses as one agent named twice. It may throw what the resolver throws: a 409 for a string
 * that is one agent's id and another live agent's handle, or a handle several retired agents bore and no live agent bears.
 * `identityOf` is one reading of every agent, for a caller that asks about many sides; left out, each side is read alone.
 */
export function theAgentTheDoorToOnePairReads(one: ParticipantRef, identityOf?: TheIdentityOf): ParticipantRef {
  const found = theAgentAnArrivingReferenceNames(one.id, 'reading', undefined, identityOf)
  return found === null ? one : { kind: 'agent', id: found.agent.id }
}

/**
 * Every pair of agents that has said anything to the other, newest conversation first.
 *
 * `reader` is who is asking, so each conversation can say how much of it is new to them. Null means
 * nobody in either registry is asking, and then nothing is new to anybody: a reader with no row has
 * never opened anything and never will.
 */
export function conversationsBetweenAgents(
  which: WhichProjects,
  reader: ParticipantRef | null = null,
  // THE PROJECT OF THE PAGE ASKING (wave 13y round 91, gap 7). A message stored under an agent's own record there is
  // that agent's, as the page reads it. Left out, no record is read, and a message stored under an agent's handle is
  // still that agent's.
  workspaceId: string | null = null,
): BetweenAgents[] {
  // ONLY A ROW WHOSE STORED `sentBy` HAS THE KIND `agent` CAN BE IN A PAIR, and that is read off the
  // row: an entry's `sentBy` is `refFrom` of the stored field, and this reads it the same way. No
  // registry is asked. A row stored as sent by an agent id that no registry holds is kept, as it was
  // before. The rows left out are the ones whose stored `sentBy` is missing, is not a reference, or
  // names a person; they are left out before their messages and delivery rows are built. The loop
  // below dropped exactly those rows after building them, so the list it makes is the same.
  const rows = (
    db
      .select({ ...MESSAGE_COLUMNS, rowid: sql<number>`rowid` })
      .from(records)
      .where(and(messagesInTheViewOf(which), eq(records.kind, 'message'), isNull(records.deletedAt)))
      .orderBy(records.createdAt, sql`rowid`)
      .all() as APlacedRow[]
  ).filter((row) => refFrom(((row.data ?? {}) as Record<string, unknown>)['sentBy'])?.kind === 'agent')
  return theBetweenAgentsFromRows(rows, which, reader, betweenAgentsContext(which, reader, workspaceId)).map((one) => one.row)
}

/** The place at which the whole-list reader first discovered a pair, used to preserve ties. */
export interface ABetweenAgentsPlace {
  at: string
  rowid: number
  recipient: number
}

export interface APlacedBetweenAgentsRow {
  row: BetweenAgents
  first: ABetweenAgentsPlace
}

function betweenAgentsContext(which: WhichProjects, reader: ParticipantRef | null, workspaceId: string | null) {
  const aliases = theFiledAliasesReadOnce(sqlite)
  const registered = everybodyRegistered(aliases)
  const everyone = workspaceId === null ? registered : withEveryOwnRecordIn(registered, workspaceId)
  const officeTest = theMoleOfficeTest()
  const writers = theWritersOfOnePool(everyone)
  const reads = reader === null ? new Map<string, ConversationRead>() : whenTheyLastReadEach(reader, which, aliases)
  // One page builds several pools, but each sees the same project facts and starter histories.
  const said = whatTheProjectSays(which, [])
  const agentIds = everyone.filter((one) => one.who.kind === 'agent').map((one) => one.who.id)
  for (const id of agentIds) said.starterHistory.set(id, [])
  if (agentIds.length > 0) {
    const changes = sqlite.prepare("SELECT agent_id, from_kind, from_id, to_kind, to_id, applied_at FROM agent_starter_changes WHERE agent_id IN (SELECT value FROM json_each(?)) AND state = 'applied' ORDER BY applied_at, rowid").all(JSON.stringify(agentIds)) as (StarterHistoryRow & { agent_id: string })[]
    for (const change of changes) said.starterHistory.get(change.agent_id)?.push(change)
  }
  // EVERY AGENT READ ONCE FOR THE DOOR'S KEYS (wave 13y round 175). Asked one side at a time, each agent was three
  // statements, and the read of one busy agent reaches nearly every agent it ever wrote to: about 7,900 of the 9,151
  // statements of the first page on a made-up office of 2,640 agents. The reading answers what those statements
  // answered, with the same refusals, and the aliases it validates are the ones `theFiledAliasesReadOnce` reads above.
  const identityOf = everyAgentsIdentityWithReferencesReadOnce(sqlite)
  const asTheDoorReads = new Map<string, string>()
  const theDoorsKey = (one: ParticipantRef): string => {
    let read = asTheDoorReads.get(one.id)
    if (read === undefined) {
      try {
        read = participantKey(theAgentTheDoorToOnePairReads(one, identityOf))
      } catch (err) {
        if (!(err instanceof PanelError && err.status === 409)) throw err
        read = participantKey(one)
      }
      asTheDoorReads.set(one.id, read)
    }
    return read
  }
  return { everyone, officeTest, writers, reads, theDoorsKey, said }
}

function theBetweenAgentsFromRows(
  rows: readonly APlacedRow[],
  which: WhichProjects,
  reader: ParticipantRef | null,
  context: ReturnType<typeof betweenAgentsContext>,
  keep?: (pair: string, between: readonly [ParticipantRef, ParticipantRef], said: readonly PoolEntry[]) => boolean,
): APlacedBetweenAgentsRow[] {
  const deliveries = deliveriesOfMany(rows.map((row) => row.id))
  const said = whatTheProjectSays(which, rows, context.said)
  const { everyone, officeTest, writers, reads, theDoorsKey } = context
  const entries = rows.map((row) => asEntry(row, deliveries.get(row.id) ?? [], said, officeTest))
  // WHAT EACH PAIR HOLDS IS WHAT THE CONVERSATION THE LIST OPENS HOLDS (problem NuuT5VYCgLz3). The list used to pair
  // a sender with each agent it wrote to and call every such message the pair's. The conversation it opens
  // (`conversationBetween`, through GET /api/messages/between/:pair) asks `everyoneElseThisMessageIsBetween`, which
  // puts a notice about a message in the conversation that message is in, criterion M128, and not in the office's own
  // conversation with its reader. So a notice made the list show a conversation with Mole Office whose last line,
  // opened, was not there, and a pair with nothing but such a notice drew nothing at all. `theConversationsOfOnePool`
  // asks that same rule of every message once, so the list and the conversation cannot disagree.
  // EACH SIDE OF A PAIR IS NAMED AS THE PAGE NAMES IT (wave 13y round 91, gap 7), by gap 6's one rule: a message stored
  // under an agent's handle, or its own record in the asking page's project, is that agent's. Paired as stored, it made
  // a second row for the same two agents, and the page had no name for the side stored under the handle.
  const sorted = theConversationsOfOnePool(entries, everyone)
  // AS THE DOOR READS EACH SIDE, asked once for each string (wave 13y round 129, item 67, option (b)). A handle that a
  // live agent and a retired agent both bear names nobody above, so the side is kept as stored, and the door reads it as
  // the live agent. A side the door refuses with 409 is kept as stored: the list has no one agent to call it.
  const found = new Map<string, { between: [ParticipantRef, ParticipantRef]; last: PoolEntry; said: readonly PoolEntry[]; first: ABetweenAgentsPlace }>()
  for (const [index, one] of entries.entries()) {
    // A GROUP IS NOT A PAIR. Reading a message to three people as a conversation between each two of
    // them would invent conversations nobody had.
    if (one.toGroup !== null) continue
    const sender = writers.senderOf(one)
    if (sender === null || sender.kind !== 'agent') continue
    for (const [recipient, to] of writers.recipientsOf(one).entries()) {
      if (to.kind !== 'agent') continue
      // ONE AGENT WITH ITSELF IS NOT A PAIR (wave 13y round 128, item 67). An agent may write to itself, and the door to
      // one pair refuses a pair whose two sides name one agent, so a row for it could not be opened. Both sides are
      // named as above, so a message stored under an agent's handle on one side and its id on the other is left out too.
      // Each side is also read as the door reads it, so a pair the door reads as one agent is left out too (round 129).
      if (theDoorsKey(sender) === theDoorsKey(to)) continue
      const two: [ParticipantRef, ParticipantRef] =
        participantKey(sender) < participantKey(to) ? [sender, to] : [to, sender]
      const key = `${participantKey(two[0])}|${participantKey(two[1])}`
      if (found.has(key)) continue
      // A PAIR WHOSE CONVERSATION HOLDS NOTHING IS NOT LISTED: opened, it would draw nothing.
      const between = sorted.between(two[0], two[1])
      const last = between.at(-1)
      if (last !== undefined) found.set(key, { between: two, last, said: between, first: { at: rows[index]!.createdAt, rowid: rows[index]!.rowid, recipient } })
    }
  }
  // WHEN THIS READER LAST OPENED EACH PAIR, read in one query for every pair rather than one query
  // per pair. When nobody is asking, nothing is read and nothing counts as new.
  return [...found.entries()]
    .sort(([, x], [, y]) => y.last.sentAt.localeCompare(x.last.sentAt))
    .filter(([pair, one]) => keep?.(pair, one.between, one.said) ?? true)
    .map(([, one]) => {
      const since = sinceTheyLastRead(one.said, reader, reads.get(pairKey(one.between[0], one.between[1])) ?? null)
      return { first: one.first, row: {
        between: one.between,
        last: one.last,
        newSince: since.filter((said) => !isASystemLine(said, officeTest)).length,
        anythingNew: since.length > 0,
        projects: theProjectsOfAConversation(one.said),
      } }
    })
}

/** A place in the message-centre's time order, used by the incremental list reader. */
export interface ABetweenAgentsScanPlace {
  at: string
  rowid: number
}

/** The shared identity and read-point lookups for one paged list request. */
export function aBetweenAgentsReader(reader: ParticipantRef | null, workspaceId: string) {
  const which = EVERY_PROJECT
  const context = betweenAgentsContext(which, reader, workspaceId)
  const alreadyRead = new Set<string>()
  const settledSenders = new Set<string>()
  // A PAIR ALREADY FOUND FROM ONE OF ITS OWN TWO SIDES holds every message its conversation holds. A later read drops
  // the row it builds for that pair: a message that also went to a third agent, or a notice about one of the pair's
  // plain messages, would otherwise build a second, partial row for the same pair on a later page.
  const whole = new Set<string>()
  // EVERY PAIR EACH MESSAGE IS IN, as the reads so far found it, and the two sides of each pair. A later read leaves a
  // message out only when every pair of it with the agent being read is already whole. A message to two agents is in
  // two pairs, and leaving it out because one of them was found took it from the other.
  const pairsOf = new Map<string, string[]>()
  const sidesOf = new Map<string, readonly [string, string]>()
  // THE MESSAGES EACH AGENT IS A SIDE OF, as the reads so far found them. Only these can be left out of that agent's
  // read, so the list a read leaves out is made from them and not from every message found so far.
  const ofSide = new Map<string, Set<string>>()
  // MOLE OFFICE'S OWN AGENT IS LEFT UNREAD BY THE SCAN (wave 13y round 175). It writes to nearly every agent, so its read
  // was the whole office's history: about 50,000 rows on a made-up office of the live shape. Each pair a message of the
  // scan is in has a side other than Mole Office that the scan names: a line Mole Office wrote is between it and each
  // agent it reached, or between two agents it reached, and any other message is between its sender and each agent it
  // reached. So each such pair is read from that side, and a pair read from either side is the same row. Mole Office's
  // lines stay in the scan, since only a read settles a sender. The agents of a message a notice names are read, Mole
  // Office too, when that message is between two agents, because the notice is in that message's pair, whose other side
  // the scan may not name.
  // A NOTICE NAMES AGENTS ONLY WHEN ITS MESSAGE IS BETWEEN TWO AGENTS (wave 13y round 175). Through the message it
  // names, a notice is in one pair at most: the pair `thePartiesOfEveryPair` gives that message. For a message between
  // an agent and the person, that pair holds the person, and this list does not show it. A message to a group or to
  // several addressees gets no pair, so the notice joins none. Reading the agents of such a message added no row and
  // changed no value. It read each such agent's whole history and the run each of its messages names, and a busy agent
  // has thousands.
  const agentsNamedBy = (agentRows: APlacedRow[], leaveTheOfficeUnread = false): ParticipantRef[] => {
    const entries = entriesOf(agentRows, which, undefined, context.said, context.officeTest)
    const heldIds = new Set(agentRows.map((row) => row.id))
    const aboutIds = new Set(entries.map((one) => one.aboutMessage).filter((id): id is string => typeof id === 'string'))
    const named = [...aboutIds].filter((id) => !heldIds.has(id))
    const originals = entriesOf(
      rowsByIds(named, which).filter((row) => refFrom(((row.data ?? {}) as Record<string, unknown>)['sentBy'])?.kind === 'agent'),
      which, undefined, context.said, context.officeTest,
    )
    const betweenTwoAgents = new Set(
      [...thePartiesOfEveryPair([...entries.filter((one) => aboutIds.has(one.id)), ...originals])]
        .filter(([, sides]) => sides.every((side) => side.kind === 'agent'))
        .map(([id]) => id),
    )
    const agents = new Map<string, ParticipantRef>()
    const ofANamedMessage = new Set<string>()
    for (const one of [...entries, ...originals.filter((original) => betweenTwoAgents.has(original.id))]) {
      const sender = context.writers.senderOf(one)
      for (const who of [sender, ...context.writers.recipientsOf(one)]) {
        if (who === null || who.kind !== 'agent') continue
        const normalized = context.writers.participantOf(who)
        const key = participantKey(normalized)
        if (betweenTwoAgents.has(one.id)) ofANamedMessage.add(key)
        if (!alreadyRead.has(key)) agents.set(key, normalized)
      }
    }
    return [...agents.entries()]
      .filter(([key, who]) => !leaveTheOfficeUnread || !context.officeTest(who) || ofANamedMessage.has(key))
      .map(([, who]) => who)
  }
  return {
    /** For a sparse project, find its candidate agents without settling every agent in the office. */
    agentsInSparseProject(project: string): ParticipantRef[] | null {
      // These two project marks copy theProjectsWithANewerMessage in src/shared/messages.ts; keep this query in step
      // with that rule if the marks a conversation can carry change.
      const ids = db.all<{ id: string }>(sql`
        SELECT ${records.id} AS id FROM ${records} INDEXED BY records_message_moment_idx
        WHERE ${and(ONE_KIND_WRITTEN_OUT.message, sql`${records.workspaceId} = 'message-centre'`, isNull(records.deletedAt),
          sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent'`,
          sql`(json_extract(${records.data}, '$.aboutProject') = ${project} OR json_extract(${records.data}, '$.writtenIn.project') = ${project})`)}
        LIMIT 513
      `)
      if (ids.length > 512) return null
      const rows = ids.length === 0 ? [] : db.select({ ...MESSAGE_COLUMNS, rowid: sql<number>`rowid` })
        .from(records).where(inArray(records.id, ids.map((one) => one.id))).all() as APlacedRow[]
      return agentsNamedBy(rows.filter((row) => refFrom(((row.data ?? {}) as Record<string, unknown>)['sentBy'])?.kind === 'agent'))
    },
    /** Scan backwards in the indexed message order and name the agents those messages can involve. */
    scan(from: ABetweenAgentsScanPlace | null, beforeOrAt: string | null, limit: number): {
      agents: ParticipantRef[]
      edge: ABetweenAgentsScanPlace | null
      exhausted: boolean
    } {
      const past = from === null
        ? beforeOrAt === null ? undefined : sql`${records.createdAt} <= ${beforeOrAt}`
        : sql`(${records.createdAt}, rowid) < (${from.at}, ${from.rowid})`
      // A settled sender's ordinary messages cannot add a pair: involving() already read them. Keep notices and
      // typed senders, whose pair can be named by another message or by the typed sender instead.
      const unsettled = settledSenders.size === 0 ? undefined : sql`(
        json_type(${records.data}, '$.from') = 'text' OR
        json_type(${records.data}, '$.aboutMessage') = 'text' OR
        coalesce(json_extract(${records.data}, '$.sentBy.id'), '') NOT IN (SELECT value FROM json_each(${JSON.stringify([...settledSenders])}))
      )`
      const ids = db.all<{ id: string }>(sql`
        SELECT ${records.id} AS id FROM ${records} INDEXED BY records_message_moment_idx
        WHERE ${and(ONE_KIND_WRITTEN_OUT.message, sql`${records.workspaceId} = 'message-centre'`, isNull(records.deletedAt),
          sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent'`, past, unsettled)}
        ORDER BY ${records.createdAt} DESC, rowid DESC LIMIT ${limit}
      `)
      const byId = new Map((ids.length === 0 ? [] : db.select({ ...MESSAGE_COLUMNS, rowid: sql<number>`rowid` })
        .from(records).where(inArray(records.id, ids.map((one) => one.id))).all() as APlacedRow[]).map((row) => [row.id, row]))
      const scanned = ids.map((one) => byId.get(one.id)!).filter((one) => one !== undefined)
      const agentRows = scanned.filter((row) => refFrom(((row.data ?? {}) as Record<string, unknown>)['sentBy'])?.kind === 'agent')
      const last = scanned.at(-1)
      return { agents: agentsNamedBy(agentRows, true), edge: last === undefined ? null : { at: last.createdAt, rowid: last.rowid }, exhausted: scanned.length < limit }
    },
    /** Every row involving this agent, decided by the same rules as the whole list. */
    involving(who: ParticipantRef): APlacedBetweenAgentsRow[] {
      const key = participantKey(who)
      if (alreadyRead.has(key)) return []
      alreadyRead.add(key)
      for (const name of theIdsAMessageMayStoreFor(who, context.everyone)) {
        const resolved = context.writers.senderOf({ sentBy: { kind: 'agent', id: name }, from: null })
        if (resolved !== null && participantKey(resolved) === key) settledSenders.add(name)
      }
      const settled = (id: string): boolean =>
        pairsOf.get(id)!.every((pair) => whole.has(pair) || !sidesOf.get(pair)!.includes(key))
      // A SETTLED MESSAGE'S ROW IS NOT READ AT ALL. Read and then dropped, the other side of a busy pair read every
      // message of the pair from the records table a second time.
      const leftOut = [...(ofSide.get(key) ?? [])].filter(settled)
      const rows = (db.select({ ...MESSAGE_COLUMNS, rowid: sql<number>`rowid` })
        .from(records)
        .where(and(
          inArray(records.id, theIdsChosenFor(who, context.everyone, which, null, true)),
          leftOut.length === 0 ? undefined : sql`${records.id} NOT IN (SELECT value FROM json_each(${JSON.stringify(leftOut)}))`,
        ))
        .orderBy(records.createdAt, sql`rowid`)
        .all() as APlacedRow[])
        .filter((row) => refFrom(((row.data ?? {}) as Record<string, unknown>)['sentBy'])?.kind === 'agent')
      return theBetweenAgentsFromRows(rows, which, reader, context, (pair, between, said) => {
        if (whole.has(pair)) return false
        const sides = [participantKey(between[0]), participantKey(between[1])] as const
        sidesOf.set(pair, sides)
        for (const one of said) {
          // A MESSAGE THAT NAMES ANOTHER IS NEVER LEFT OUT. A notice from Mole Office is in the pair of the message it
          // names only when the read holds that message, so the pairs one read found for it may not be all of them.
          if (typeof one.aboutMessage === 'string') continue
          const held = pairsOf.get(one.id)
          if (held === undefined) pairsOf.set(one.id, [pair])
          else if (!held.includes(pair)) held.push(pair)
          for (const side of sides) {
            const mine = ofSide.get(side)
            if (mine === undefined) ofSide.set(side, new Set([one.id]))
            else mine.add(one.id)
          }
        }
        // COUNT A PAIR AS WHOLE ONLY FROM A READ BY ONE OF ITS OWN TWO SIDES. A read that is not a side can build
        // A|B from a message A sent to B and C, and that row is not kept.
        if (!sides.includes(key)) return false
        whole.add(pair)
        return true
      })
    },
  }
}

/**
 * WHICH OF THESE WERE WRITTEN AFTER THIS READER LAST OPENED THE CONVERSATION.
 *
 * A READ IS A TIME AND NOT A MARK, which is the whole difference from `unreadAmong` above. A
 * conversation between two agents leaves this reader no delivery row to move, so the only thing
 * recorded is when they opened it; everything written after that is new to them.
 *
 * NOTHING READ MEANS EVERYTHING IS NEW. That is what a reader who has never opened it is looking at,
 * and calling it none would be a guess dressed as an answer.
 *
 * IT RETURNS THE MESSAGES AND NOT A COUNT, because two questions are asked of them: how many count
 * (criterion M33 leaves a system line out) and whether there is anything at all (a system line is in
 * that one). Counting here would settle one of the two in the wrong place.
 */
function sinceTheyLastRead(
  said: readonly PoolEntry[],
  reader: ParticipantRef | null,
  read: ConversationRead | null,
): PoolEntry[] {
  if (reader === null) return []
  if (read === null) return [...said]
  return said.filter((one) => one.sentAt > read.at)
}

// ============================================================================ what an event carries

/**
 * ONE RECIPIENT'S DELIVERY ROW ON EACH OF THESE MESSAGES, as a pool read reports it now.
 *
 * `delivery.changed` carries these, so a page puts the new row in place of the old one wherever it
 * holds the message and reads nothing. It is read with `deliveriesOfMany`, the reader every pool read
 * uses, so the row on the event is the row a read would return.
 */
export function theDeliveryRowsOf(messageIds: readonly string[], who: ParticipantRef): { messageId: string; row: DeliveryOnTheWire }[] {
  const many = deliveriesOfMany(messageIds)
  return messageIds.flatMap((id) =>
    (many.get(id) ?? []).filter((one) => sameParticipant(one.to, who)).map((row) => ({ messageId: id, row })),
  )
}

/**
 * WHO ONE MESSAGE IS BETWEEN: the pages an event about it may reach, besides the owner's.
 *
 * Every event that names a message goes to the message's parties and the owner, and to nobody else (`reaches` in
 * src/server/lib/events.ts), as a decision says. This is the one place the parties are
 * worked out. They are:
 *
 *   - the sender;
 *   - everybody the message has a delivery row for: whoever it was addressed to, chosen for or routed
 *     to, and for a message to a group the members it was delivered to;
 *   - for a message to a group, every member of the group AT THE MOMENT IT WAS SENT, read from the
 *     memberships' joining and leaving times.
 *
 * WHY A GROUP'S MEMBERS COUNT AS AT THE TIME OF SENDING, AND NOT AS NOW. Who a group message reached
 * is the membership when it was sent: the delivery rows are written then and never taken away, and a
 * member who joins later was never handed the message. So a member who joined later is told nothing
 * about it, and a member who has left since is still told when its marks move, because it still holds
 * the message. For `message.new` itself the two readings are the same, since the event is announced
 * as the message is written.
 *
 * A DELETED MESSAGE IS READ TOO, because deleting one announces that it left the lists, and that
 * announcement goes to its parties like every other.
 *
 * AN AGENT NAMED ON THE MESSAGE IS A STORED REFERENCE, so it is read by exact id first and then by the
 * one agent bearing that string as a handle (`everyAgentAStoredStampCouldName`). A string that could
 * mean two agents names neither, and neither is told. A string no agent has as its id or its handle is
 * then read as the agent whose own record of kind `agent` it is, in any project and deleted or not
 * (`theAgentsOfTheseAgentRecords`, wave 13y round 90). The four places a stored agent string is read
 * below read it this one way.
 *
 * An empty list means the message is not there to read; every event about it then reaches only the
 * owner's pages.
 *
 * `named` keeps what each stored agent string was read as, so a caller asking about many messages at
 * once reads each string once (the conversation read in `markManyDelivered`).
 */
export function thePartiesOf(messageId: string, named: Map<string, ParticipantRef | null> = new Map()): ParticipantRef[] {
  return thePartiesOfMany([messageId], named).get(messageId) ?? []
}

/**
 * THE PARTIES OF SEVERAL MESSAGES AT ONCE, keyed by message id, by the rule `thePartiesOf` states.
 *
 * `thePartiesOf` is this function asked about one message, so the two cannot come apart. A list door
 * asks about every message it holds, so the rows, the delivery rows and each group's memberships are
 * read once for the whole list rather than once per message. An id that is not a message, or is not
 * there, has no entry.
 */
export function thePartiesOfMany(
  messageIds: readonly string[],
  named: Map<string, ParticipantRef | null> = new Map(),
  // THE ROWS AND DELIVERY ROWS OF THESE MESSAGES, when the caller has just read them in the same synchronous work, with
  // no write between. Then they are not read again. Every id asked must be among them.
  read?: MessagesJustRead,
): Map<string, ParticipantRef[]> {
  const out = new Map<string, ParticipantRef[]>()
  if (messageIds.length === 0) return out
  const rows: { id: string; data: unknown; createdAt: string }[] = []
  if (read === undefined) {
    // ONLY THE THREE FIELDS THE RULE BELOW READS: who sent it, where it was routed, and the group it went
    // to. Each comes back as its own JSON text, or not at all when the message does not hold it, so a
    // message's words are never parsed here. Reading `data` whole was most of the time this took.
    const field = (text: string | null): unknown => (text === null ? undefined : JSON.parse(text))
    for (const piece of piecesOf(messageIds)) {
      for (const row of db
        .select({
          id: records.id,
          createdAt: records.createdAt,
          sentBy: sql<string | null>`${records.data} -> '$.sentBy'`,
          routed: sql<string | null>`${records.data} -> '$.routed'`,
          toGroup: sql<string | null>`${records.data} -> '$.toGroup'`,
        })
        .from(records)
        .where(and(inArray(records.id, piece), theKindOfARowFoundById('message')))
        .all()) {
        const data: Record<string, unknown> = {}
        for (const [key, text] of [['sentBy', row.sentBy], ['routed', row.routed], ['toGroup', row.toGroup]] as const) {
          const value = field(text)
          if (value !== undefined) data[key] = value
        }
        rows.push({ id: row.id, createdAt: row.createdAt, data })
      }
    }
  } else {
    // THE SAME THREE FIELDS, taken from the whole `data` the caller read. A field the message does not hold is left
    // out, as the read above leaves it out.
    const held = new Map(read.rows.map((row) => [row.id, row]))
    for (const id of messageIds) {
      const row = held.get(id)
      if (row === undefined) throw new Error(`The parties of message ${id} were asked with the rows of a read that does not hold it.`)
      const whole = (row.data ?? {}) as Record<string, unknown>
      const data: Record<string, unknown> = {}
      for (const key of ['sentBy', 'routed', 'toGroup'] as const) if (whole[key] !== undefined) data[key] = whole[key]
      rows.push({ id: row.id, createdAt: row.createdAt, data })
    }
  }
  const deliveries = read?.deliveries ?? deliveriesOfMany(rows.map((row) => row.id))
  // All memberships are read together; each message still checks the member at its own sending instant.
  const memberships = new Map<string, { kind: string; id: string; joinedAt: string; leftAt: string | null }[]>()
  const groups = [...new Set(rows.flatMap(row => {
    const group = ((row.data ?? {}) as Record<string, unknown>)['toGroup']
    return typeof group === 'string' && group !== '' ? [group] : []
  }))]
  if (groups.length > 0) {
    const members = db.select({ group: groupMembers.groupId, kind: groupMembers.memberKind, id: groupMembers.memberId, joinedAt: groupMembers.joinedAt, leftAt: groupMembers.leftAt })
      .from(groupMembers).where(sql`${groupMembers.groupId} IN (SELECT value FROM json_each(${JSON.stringify(groups)}))`).all()
    for (const { group, ...member } of members) {
      const held = memberships.get(group) ?? []
      held.push(member)
      memberships.set(group, held)
    }
  }
  const foundOf = new Map<string, ParticipantRef[]>()
  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>
    const found: ParticipantRef[] = []
    const sender = refFrom(data['sentBy'])
    if (sender !== null) found.push(sender)
    for (const delivery of deliveries.get(row.id) ?? []) found.push(delivery.to)
    // A RECEIVER THE DEAD-LETTER SWEEP TOLD ABOUT THIS LETTER IN ONE SUMMARY is a party too (problem wN3CEhHxRKO3). It
    // has no delivery row on the letter, and it must still be able to read the letter it was told about.
    for (const entry of routedOf(data)) if (entry.inSummary !== undefined && entry.to !== null) found.push(entry.to)
    const group = data['toGroup']
    if (typeof group === 'string' && group !== '') {
      const sent = row.createdAt
      for (const member of memberships.get(group) ?? []) {
        // A MEMBER AT THE MOMENT OF SENDING: joined at or before it, and not left by then.
        if (member.joinedAt > sent) continue
        if (member.leftAt !== null && member.leftAt <= sent) continue
        found.push({ kind: member.kind === 'person' ? 'person' : 'agent', id: member.id })
      }
    }
    foundOf.set(row.id, found)
  }
  // EACH STORED AGENT STRING IS READ ONCE, before any message's parties are put together. The strings no agent has as
  // its id or its handle are then read together as agent records, in one statement.
  const references = [...new Set([...foundOf.values()].flatMap(found => found
    .filter(one => one.kind === 'agent' && !named.has(one.id)).map(one => one.id.trim()).filter(Boolean)))]
  const byId = theRegistryRowsNamedBy(sqlite, references, 'id, handle, name, retired, retired_at AS retiredAt')
  const byHandle = new Map<string, { live: AgentIdentity | null; retired: AgentIdentity[] }>()
  if (references.length > 0) {
    const matches = sqlite.prepare('SELECT id, handle, name, retired, retired_at AS retiredAt FROM agents WHERE handle IN (SELECT value FROM json_each(?)) ORDER BY created_at, id').all(JSON.stringify(references))
    for (const raw of matches) {
      const agent = asAgentIdentity(raw)!
      const held = byHandle.get(agent.handle) ?? { live: null, retired: [] }
      if (agent.retired) held.retired.push(agent)
      else held.live = agent
      byHandle.set(agent.handle, held)
    }
  }
  const identityOf: TheIdentityOf = id => asAgentIdentity(byId.get(id.trim()))
  identityOf.reference = reference => {
    const said = reference.trim()
    const held = byHandle.get(said)
    const retired = held?.retired ?? []
    return { byId: identityOf(said), liveByHandle: held?.live ?? null, retiredByHandle: retired.length === 1 ? retired[0]! : null, everyRetiredByHandle: retired }
  }
  const unanswered: string[] = []
  for (const found of foundOf.values()) {
    for (const one of found) {
      if (one.kind !== 'agent' || named.has(one.id)) continue
      const could = everyAgentAStoredStampCouldName(one.id, identityOf)
      named.set(one.id, could.length === 1 ? { kind: 'agent', id: could[0]!.id } : could.length === 0 ? one : null)
      if (could.length === 0) unanswered.push(one.id)
    }
  }
  for (const [record, agent] of theAgentsOfTheseAgentRecords(unanswered)) named.set(record, { kind: 'agent', id: agent })
  for (const [id, found] of foundOf) {
    const parties = new Map<string, ParticipantRef>()
    for (const one of found) {
      const who = one.kind === 'agent' ? (named.get(one.id) ?? null) : one
      if (who !== null) parties.set(participantKey(who), who)
    }
    out.set(id, [...parties.values()])
  }
  return out
}

// ============================================================================ who may read which message

/** Who is reading, from the caller as `actorFrom` read it. */
export function theMessageReader(
  actor: { type: string; id: string; keyHolder?: string | undefined },
  isTheOffice: (who: ParticipantRef) => boolean = isMoleOffice,
): AMessageReader {
  if (actor.type === 'human' && actor.id === THE_PERSON) {
    return { readsEveryMessage: true, because: 'the owner', who: { kind: 'person', id: THE_PERSON } }
  }
  if (actor.type === THE_WORKER.type && actor.id === THE_WORKER.id) {
    return { readsEveryMessage: true, because: 'the message worker', who: null }
  }
  if (actor.type === 'agent' && actor.id === THE_AGENT_WORKER_ID) {
    return { readsEveryMessage: true, because: 'the agent worker', who: null }
  }
  // MOLE OFFICE READS THE MESSAGES IT IS A PARTY TO, and the reader is the id it just matched, not a second read of its row.
  if (actor.type === 'system' && isTheOffice({ kind: 'agent', id: actor.id })) return { readsEveryMessage: false, who: { kind: 'agent', id: actor.id } }
  const who = participantForActor(actor)
  if (who !== null && who.kind === 'agent' && theSecretaries().some((one) => sameParticipant(one, who))) {
    return { readsEveryMessage: true, because: 'a secretary', who }
  }
  return { readsEveryMessage: false, who }
}

/**
 * WHICH OF THESE MESSAGES THIS READER MAY READ. The one rule is asked by every door that hands a message's words
 * or title to a caller, directly or through the two below.
 *
 * An id that is not a message, or is not there, is never in the answer for a reader limited to its
 * own messages, because nothing makes it a party to it.
 */
export function theMessagesThisReaderMayRead(
  reader: AMessageReader,
  messageIds: readonly string[],
  named?: Map<string, ParticipantRef | null>,
  read?: MessagesJustRead,
  // FALSE FOR SHORT LISTS ASKED TOGETHER, so the list each one would have been asked alone is still not narrowed.
  narrowLongList = true,
): Set<string> {
  if (reader.readsEveryMessage) return new Set(messageIds)
  const me = reader.who
  if (me === null) return new Set()
  const out = new Set<string>()
  // A LONG LIST IS FIRST NARROWED to the messages this reader could be a party to, so the parties are
  // worked out for those alone. See `theMessagesAReaderCouldBeAPartyTo`.
  const could = narrowLongList && messageIds.length > A_SHORT_LIST ? theNarrowingFor(me) : null
  const asked = could === null ? messageIds : messageIds.filter((id) => could.has(id))
  for (const [id, parties] of thePartiesOfMany(asked, named, read)) {
    if (parties.some((party) => sameParticipant(party, me))) out.add(id)
  }
  return out
}

/**
 * THE LIVE MESSAGES OF ONE PROJECT THAT THIS READER IS A PARTY TO, found from the reader's own messages. It is for a
 * count of how many of a project's messages a reader limited to its own messages may read.
 *
 * It starts from the reader's narrowing (`theMessagesAReaderCouldBeAPartyTo`), and not from every message of the
 * project. It keeps those messages that are filed in the project or in its view and are not deleted. Then it works out
 * their parties as `theMessagesThisReaderMayRead` does. A reader is a party to few of a project's messages, so the ids
 * of the others are not handed back only to be left out.
 *
 * EACH PIECE IS ASKED BY THE RULE FOR A ROW FOUND BY ID: filed in the project, or in its view as `messagesInTheViewOf`
 * asks it for rows found by id. For a message whose data is JSON, these are the same rows as `filedInOrInTheViewOf`.
 * That rule builds the list of rowids of every record of the project and every message in its view, and it built that
 * list once for each piece. On a copy of the made-up office at the live change-log size, a supervisor's narrowing of
 * 2,989 ids in 6 pieces took 755 ms that way and 9 ms by id (wave 14c round 9).
 *
 * It gives the number `theMessagesThisReaderMayRead` gives for every live message of the project's view, as long as
 * the narrowing keeps every message the reader could be a party to, as its own comment promises. A long list given to
 * `theMessagesThisReaderMayRead` already rests on that promise.
 */
export function theLiveMessagesOfAProjectAReaderIsAPartyTo(me: ParticipantRef, workspaceId: string): Set<string> {
  const ofTheProject: string[] = []
  for (const piece of piecesOf(theNarrowingFor(me))) {
    for (const row of db
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          inArray(records.id, piece),
          or(theProjectOfARowFoundById(workspaceId), messagesInTheViewOf(justThisProject(workspaceId), true)),
          theKindOfARowFoundById('message'),
          isNull(records.deletedAt),
        ),
      )
      .all()) {
      ofTheProject.push(row.id)
    }
  }
  const out = new Set<string>()
  for (const [id, parties] of thePartiesOfMany(ofTheProject)) {
    if (parties.some((party) => sameParticipant(party, me))) out.add(id)
  }
  return out
}

/** A list this short has its parties worked out at once, without narrowing it first. */
export const A_SHORT_LIST = 50

/** The narrowings worked out inside `withEachNarrowingWorkedOutOnce`, by reader, and null outside it. */
let theNarrowingsOfThisWork: Map<string, Set<string>> | null = null

/**
 * WORK IN WHICH EACH READER'S NARROWING IS WORKED OUT ONCE (wave 13y round 65). GET /api/where-you-stand
 * and GET /api/brief read the open loops and then the brief, and each asked which messages an agent
 * could be a party to: about 140 ms each time, on a made-up office at the scale of 22 October 2026.
 * Inside `work`, the first answer for a reader is given again.
 *
 * `work` MUST WRITE NOTHING AND BE SYNCHRONOUS: no write of its own and no other request's can then come
 * between two asks, so the first answer is still the answer. The kept answers are dropped when it ends.
 */
export function withEachNarrowingWorkedOutOnce<T>(work: () => T): T {
  if (theNarrowingsOfThisWork !== null) return work()
  theNarrowingsOfThisWork = new Map()
  try {
    return work()
  } finally {
    theNarrowingsOfThisWork = null
  }
}

/** `theMessagesAReaderCouldBeAPartyTo`, given again inside `withEachNarrowingWorkedOutOnce`. */
function theNarrowingFor(me: ParticipantRef): Set<string> {
  if (theNarrowingsOfThisWork === null) return theMessagesAReaderCouldBeAPartyTo(me)
  const key = JSON.stringify([me.kind, me.id])
  const kept = theNarrowingsOfThisWork.get(key)
  if (kept !== undefined) return kept
  const worked = theMessagesAReaderCouldBeAPartyTo(me)
  theNarrowingsOfThisWork.set(key, worked)
  return worked
}

/**
 * JAVASCRIPT'S trim() REMOVES NO CODE POINT FROM U+0021 UP TO U+0080. Every code point it removes is below the first of
 * these two bounds or at or above the second. So an id with white space at its start begins outside them. A test
 * checks this against trim() itself, for every code point.
 */
export const TRIM_KEEPS_EVERY_CODE_POINT_FROM = 0x21
export const TRIM_KEEPS_EVERY_CODE_POINT_BELOW = 0x80

/**
 * THE STORED IDS OF ONE PLACE THAT COULD BE ONE OF THESE NAMES WITH WHITE SPACE AROUND IT, read in one statement. The
 * statement is a UNION of three SELECTs, and each one seeks the place's index by a range:
 *
 *   1. the ids below the first bound;
 *   2. the ids at or above the second bound. An id with white space at its start begins with a character trim()
 *      removes, so it is in one of these two ranges;
 *   3. for each name, the ids greater than the name and below the name followed by U+10FFFF, the highest code point.
 *      An id with white space only at its end begins with the name it trims to, so it is in that name's range.
 *
 * SQLite stores this text as UTF-8 and compares it byte by byte, which is the order of the code points. So the ranges
 * hold every such id. They hold other ids too, and trim() decides which ones are kept. The names come as one JSON list,
 * so the statement has the same words for any number of names. UNION, not UNION ALL, so an id stored on many rows comes
 * back once. For the group membership, the place is the member index joined from the reader's kinds, so each range is
 * sought within one kind at a time.
 *
 * Read whole, the delivery's ids took 3.3 ms and the sender's 2.3 ms of each narrowing for an agent. Read this way, for
 * a reader with 4 names, they took 0.043 ms and 0.072 ms. Both were measured on a made-up office of the 13 November
 * 2026 scale (wave 13y round 175).
 */
function theStoredIdsThatCouldBePadded(place: { from: SQL; stored: SQLWrapper; where: SQL }, names: readonly string[]): { id: unknown }[] {
  const part = (from: SQL, range: SQL): SQL => sql`SELECT ${place.stored} AS id FROM ${from} WHERE ${and(place.where, range)}`
  return db.all<{ id: unknown }>(
    sql.join(
      [
        part(place.from, sql`${place.stored} < char(${TRIM_KEEPS_EVERY_CODE_POINT_FROM})`),
        part(place.from, sql`${place.stored} >= char(${TRIM_KEEPS_EVERY_CODE_POINT_BELOW})`),
        // THE NAMES COME FIRST, by CROSS JOIN, so SQLite seeks the place's index once for each name. For the group
        // membership the reader's kinds come next, so it seeks the member index once for each name and kind.
        part(
          sql`json_each(${JSON.stringify(names)}) AS reader_name CROSS JOIN ${place.from}`,
          sql`${place.stored} > reader_name.value AND ${place.stored} < (reader_name.value || char(${0x10ffff}))`,
        ),
      ],
      sql` UNION `,
    ),
  )
}

/**
 * EVERY KIND STORED IN THE GROUP MEMBERSHIPS, read in one statement that walks group_members_member_idx. The walk
 * starts from the lowest kind and takes each next kind above the last one, so it seeks the index once for each kind and
 * reads no other entry. The kinds are read from the table and not written here, because no door bounds them: an older
 * row could hold any kind, and thePartiesOfMany reads every kind but `person` as an agent's.
 *
 * A KIND STORED AS SOMETHING OTHER THAN TEXT STOPS THE NARROWING WITH AN ERROR. The column is TEXT and no door writes
 * anything else, so only a row written by SQL could hold one. The kinds go to SQLite as a JSON list, which carries only
 * text, so such a kind could not be asked for, and its memberships would be left out with nothing said.
 *
 * With each kind given, the member index is sought by the kind and the member id. Measured raw on a made-up office of
 * the 13 November 2026 scale, this walk took 0.003 ms, the read of the groups 0.004 ms and the read of the membership
 * ids that could be padded 0.004 ms. Asked by every kind but `person` at once, the read of the groups scanned the
 * memberships by group_members_group_idx, in 2.2 to 2.5 ms, and the whole read of the member ids took 1.07 ms more
 * (wave 13y round 175).
 */
function theStoredMemberKinds(): string[] {
  const stored = db.all<{ kind: unknown }>(
    sql`WITH RECURSIVE stored_kind(kind) AS (SELECT min(${groupMembers.memberKind}) FROM ${groupMembers} INDEXED BY group_members_member_idx UNION ALL SELECT (SELECT min(${groupMembers.memberKind}) FROM ${groupMembers} INDEXED BY group_members_member_idx WHERE ${groupMembers.memberKind} > stored_kind.kind) FROM stored_kind WHERE stored_kind.kind IS NOT NULL) SELECT kind FROM stored_kind WHERE kind IS NOT NULL`,
  )
  return stored.map(({ kind }) => {
    if (typeof kind !== 'string') throw new Error('A group membership\'s kind is stored as something other than text, so a long message list cannot be narrowed by the kinds of membership.')
    return kind
  })
}

/**
 * THE IDS OF EVERY MESSAGE THIS READER COULD BE A PARTY TO, and of some it is not.
 *
 * `thePartiesOfMany` makes a reader a party to a message in four ways, and each is kept here:
 *
 *   1. It sent it: the stored sender names the reader, by its id or, for an agent, by its handle, one
 *      of its own records of kind `agent` (`theAgentRecordsOf`, wave 13y round 90) or an old registry id.
 *   2. It was handed it: a delivery row names the reader the same way.
 *   3. A sweep told it about the message in a summary: the message has a `routed` list. Every such
 *      message is kept.
 *   4. It was a member of the group the message went to: every message to a group the reader has
 *      ever been a member of is kept.
 *
 * A DELETED MESSAGE IS KEPT TOO, because `thePartiesOfMany` keeps the parties of a deleted message. If this left
 * deleted messages out, a long list and a short one could get different answers.
 *
 * A stored name means an agent only when it is that agent's id, the handle of that one agent, one of
 * that agent's own records of kind `agent`, or an old registry id that agent alone answers to
 * (`theRegistryIdsOf`), so a message naming the reader any other way does not make it
 * a party. An agent's stored id is trimmed first, as the parties rule trims it, so an id stored with white space
 * around it is kept too. The parties of the messages kept are then worked out exactly, by `thePartiesOfMany`. Working
 * them out for every message in a long list was most of what the brief did for an agent: about 300 ms
 * for the 12,500 messages of an office of the live shape (round 34 of wave 13n).
 *
 * THE SENDER AND THE GROUP ARE FOUND THROUGH THEIR INDEXES, which are named (migrations 0199 and 0292).
 * SQLite did not pick the sender's index, and the group had none, so each read walked every message.
 * On a made-up office at the scale of 22 October 2026, an agent's sent messages took 68 ms that way and
 * 9.4 ms this way, and the messages to its groups 65 ms and 0.6 ms, each the median of 8 warm reads (wave
 * 13y round 65).
 */
function theMessagesAReaderCouldBeAPartyTo(me: ParticipantRef): Set<string> {
  const names = [me.id]
  if (me.kind === 'agent') {
    const handle = readParticipant(me)?.handle
    if (handle !== undefined && handle !== me.id) names.push(handle)
    names.push(...theAgentRecordsOf(me.id))
    for (const id of theRegistryIdsOf(sqlite, me.id)) if (!names.includes(id)) names.push(id)
  }
  const message = ONE_KIND_WRITTEN_OUT.message
  // AN AGENT'S ID STORED WITH WHITE SPACE AROUND IT NAMES THE AGENT ITS trim() NAMES, because thePartiesOfMany trims it
  // before it looks the agent up. The look-ups below compare exactly. So the stored ids that could be padded are read
  // first, and each one whose trim() is one of the reader's names is looked up too. For the sender, the delivery and the
  // group membership, they are read in one statement of seeks on the index each look-up uses
  // (theStoredIdsThatCouldBePadded). The member index begins with the member's kind, so the membership's ids are sought
  // for each of the reader's kinds, and the stored kinds are read first (theStoredMemberKinds). It is JavaScript's
  // trim(), as the parties rule's; SQLite's trim() strips only spaces. A person's stored id is not trimmed there, so a
  // person's look-ups stay exact.
  const namesAsStored = (stored: () => readonly { id: unknown }[]): string[] =>
    me.kind === 'agent'
      ? [...names, ...stored().flatMap(({ id }) => (typeof id === 'string' && id !== id.trim() && names.includes(id.trim()) ? [id] : []))]
      : names
  const out = new Set<string>()
  const keep = (rows: { id: string }[]): void => {
    for (const row of rows) out.add(row.id)
  }
  const recipients = namesAsStored(() =>
    theStoredIdsThatCouldBePadded({ from: sql`${messageDelivery} INDEXED BY message_delivery_recipient_idx`, stored: messageDelivery.recipientId, where: eq(messageDelivery.recipientKind, me.kind) }, names),
  )
  keep(
    db
      .select({ id: messageDelivery.messageId })
      .from(messageDelivery)
      .where(and(eq(messageDelivery.recipientKind, me.kind), inArray(messageDelivery.recipientId, recipients)))
      .all(),
  )
  const senders = namesAsStored(() =>
    theStoredIdsThatCouldBePadded({ from: sql`${records} INDEXED BY records_message_sent_by_idx`, stored: STORED_FIELDS.messageSentById(records.data), where: message }, names),
  )
  keep(db.all<{ id: string }>(sql`SELECT ${records.id} AS id FROM ${records} INDEXED BY records_message_sent_by_idx WHERE ${and(message, inArray(STORED_FIELDS.messageSentById(records.data), senders))}`))
  keep(db.select({ id: records.id }).from(records).where(and(message, eq(STORED_FIELDS.messageRoutedType(records.data), 'array'))).all())
  // A MEMBERSHIP'S KIND IS READ AS thePartiesOfMany READS IT: `person` is the person's, and any other kind is an agent's.
  // Matched to the reader's own kind, an agent's membership of another kind was left out of a long list only. So a
  // person's kinds are `person` alone, and an agent's are every stored kind but `person`. Each kind is given to the
  // member index with each name, so each look-up is a seek. Asked by every kind but `person` at once, SQLite could not
  // seek that index, which begins with the kind.
  const kinds = me.kind === 'person' ? ['person'] : theStoredMemberKinds().filter((kind) => kind !== 'person')
  const ofTheReadersKinds = sql`${groupMembers.memberKind} = reader_kind.value`
  const members = namesAsStored(() =>
    theStoredIdsThatCouldBePadded({ from: sql`json_each(${JSON.stringify(kinds)}) AS reader_kind CROSS JOIN ${groupMembers} INDEXED BY group_members_member_idx`, stored: groupMembers.memberId, where: ofTheReadersKinds }, names),
  )
  const groups = db
    .all<{ id: string }>(
      sql`SELECT DISTINCT ${groupMembers.groupId} AS id FROM json_each(${JSON.stringify(kinds)}) AS reader_kind CROSS JOIN json_each(${JSON.stringify(members)}) AS reader_name CROSS JOIN ${groupMembers} INDEXED BY group_members_member_idx WHERE ${ofTheReadersKinds} AND ${groupMembers.memberId} = reader_name.value`,
    )
    .map((row) => row.id)
  // IN PIECES (src/server/db/in-pieces.ts): every group the reader was ever in. The ids go into a set.
  for (const piece of piecesOf(groups)) {
    keep(db.all<{ id: string }>(sql`SELECT ${records.id} AS id FROM ${records} INDEXED BY records_message_to_group_idx WHERE ${and(message, inArray(STORED_FIELDS.messageToGroup(records.data), piece))}`))
  }
  return out
}

/**
 * THE ROWS OF A LIST THIS READER MAY SEE, in the order they came. A row that is not a message is kept
 * as it is; a message is kept only when `theMessagesThisReaderMayRead` keeps it. Nothing is said about
 * the rows left out, so a list shows neither their ids, their titles nor how many there were.
 */
export function onlyTheMessagesThisReaderMayRead<T extends { id: string } & ({ kind: string } | { entry: PoolEntryKind })>(
  reader: AMessageReader,
  rows: readonly T[],
  named?: Map<string, ParticipantRef | null>,
  read?: MessagesJustRead,
  narrowLongList = true,
): T[] {
  if (reader.readsEveryMessage) return [...rows]
  // A RECORD SAYS WHAT IT IS IN `kind`, AND A POOL ENTRY IN `entry`; both say "message" for a message.
  const isAMessage = (row: T): boolean => ('kind' in row ? row.kind : row.entry) === 'message'
  const kept = theMessagesThisReaderMayRead(reader, rows.filter(isAMessage).map((row) => row.id), named, read, narrowLongList)
  return rows.filter((row) => !isAMessage(row) || kept.has(row.id))
}

/**
 * THE IDS AMONG THESE THAT NAME A MESSAGE THIS READER MAY NOT READ. For a door that hands back ids of
 * other records beside what it was asked for, such as the two ends of a link, so it can leave out
 * every row that would name such a message. An id of another kind, or of nothing, is never in it.
 */
export function theMessagesHiddenFrom(reader: AMessageReader, ids: readonly string[]): Set<string> {
  if (reader.readsEveryMessage || ids.length === 0) return new Set()
  const messages: string[] = []
  for (const piece of piecesOf(ids)) {
    for (const row of db
      .select({ id: records.id })
      .from(records)
      .where(and(inArray(records.id, piece), theKindOfARowFoundById('message')))
      .all()) {
      messages.push(row.id)
    }
  }
  const kept = theMessagesThisReaderMayRead(reader, messages)
  return new Set(messages.filter((id) => !kept.has(id)))
}

/**
 * EVERY MESSAGE IN A PROJECT (or in every project, for null) THAT THIS READER MAY NOT READ, deleted ones
 * included. For a door that reads a table where a message is only an id, such as the change log, and
 * has to leave out every row naming one of these. Empty for a reader who reads every message.
 */
export function everyMessageHiddenFrom(reader: AMessageReader, _workspaceId: string | null): string[] {
  if (reader.readsEveryMessage) return []
  // EVERY MESSAGE, WHATEVER PROJECT THE CALLER ASKED ABOUT. A message belongs to no project now,
  // and one moved into the message centre keeps its older change rows and revisions under the project it was filed in.
  // Asking one project here would stop hiding those rows from a reader who may not read the message.
  // So inside `withEachHiddenListWorkedOutOnce` the list is kept by reader alone.
  const key = JSON.stringify([reader.who?.kind ?? null, reader.who?.id ?? null])
  const kept = theHiddenListsOfThisWork?.get(key)
  if (kept !== undefined) return [...kept]
  const ids = db
    .select({ id: records.id })
    .from(records)
    .where(eq(records.kind, 'message'))
    .all()
    .map((row) => row.id)
  const mayRead = theMessagesThisReaderMayRead(reader, ids)
  const hidden = ids.filter((id) => !mayRead.has(id))
  if (theHiddenListsOfThisWork === null) return hidden
  theHiddenListsOfThisWork.set(key, hidden)
  return [...hidden]
}

/** The lists worked out inside `withEachHiddenListWorkedOutOnce`, by reader, and null outside it. */
let theHiddenListsOfThisWork: Map<string, readonly string[]> | null = null

/**
 * WORK IN WHICH EACH READER'S `everyMessageHiddenFrom` IS WORKED OUT ONCE, whatever projects it is asked for. The
 * attention thread answers the asks waiting at once with one reading for each project, and each reading asked which
 * messages its reader may not read: on a made-up office at the scale of 22 October 2026, 271 ms for an agent who may
 * not read 37,796 of the office's 55,765 messages, asked again for each of the 10 other projects in
 * shape=other-projects. Inside `work`, the first list for a reader is given again, as a copy.
 *
 * `work` MUST WRITE NOTHING AND BE SYNCHRONOUS: no write of its own and no other request's can then come between two
 * asks, so the first list is still the list. The kept lists are dropped when it ends.
 */
export function withEachHiddenListWorkedOutOnce<T>(work: () => T): T {
  if (theHiddenListsOfThisWork !== null) return work()
  theHiddenListsOfThisWork = new Map()
  try {
    return work()
  } finally {
    theHiddenListsOfThisWork = null
  }
}

export { quotedUnlessAMessage }

/**
 * THE SENTENCE A READER IS REFUSED ONE MESSAGE WITH, and the same sentence for an id that names no
 * message, so the refusal does not say whether the message exists. It is a 404 for that reason.
 */
export function noMessageYouMayRead(id: string): string {
  return (
    `No message you may read has the id ${id}. Either there is none, or it is not addressed to you. An agent ` +
    'reads only the messages it sent, the ones addressed to it, and the ones sent to a group it was in when ' +
    'they were sent.'
  )
}

/**
 * REFUSE ONE MESSAGE THIS READER MAY NOT READ, before anything about it is read or written.
 *
 * A reader limited to its own messages is refused when the id names a message it is not a party to.
 * Every other reader, and an id that names a record of another kind, passes, and the door answers as
 * it always did.
 *
 * `missing` says what such a reader is told, so that the answer never says whether the message exists:
 *
 *   - `'refuse'`, from the message doors: `noMessageYouMayRead`, both for a message it may not read
 *     and for an id that names nothing.
 *   - a function, from a door that answers about every kind of record: the refusal that door gives an
 *     id naming nothing. A message this reader may not read is answered with exactly that refusal, the
 *     same words, status and code, and an id naming nothing passes on to the door, which gives it the
 *     same refusal itself. So the door has one refusal for both, and it is built in one place.
 */
export function refuseAMessageThisReaderMayNotRead(
  reader: AMessageReader,
  id: string,
  missing: 'refuse' | (() => PanelError),
): void {
  if (reader.readsEveryMessage) return
  const row = db.select({ kind: records.kind }).from(records).where(eq(records.id, id)).get()
  if (row === undefined && missing !== 'refuse') return
  if (row !== undefined && row.kind !== 'message') return
  if (row !== undefined && theMessagesThisReaderMayRead(reader, [id]).has(id)) return
  throw missing === 'refuse' ? new PanelError(noMessageYouMayRead(id), 404) : missing()
}

/**
 * WHICH OF THESE RUNS' TRANSCRIPTS THIS READER MAY READ: the tail GET /api/sessions/:id reads from disk,
 * and the words a session row reads from it. The answer is a test to put each of
 * the runs to, by its record id, or null for a run nothing has filed.
 *
 * A transcript holds the messages the run was given, word for word, and whatever the run read or quoted
 * while it worked: tool output, a message read through a door, its own thinking. Nothing in those lines
 * says reliably which message a piece of text came from, so the lines cannot be sorted into the messages
 * this reader may read and the rest. The transcript is therefore read whole or not at all: by a reader
 * who reads every message, and by the agent the run answers as (`theAgentASessionAnswersAs`), whose own
 * run it is. Every other reader is refused it. A run no record says anything about (null) is read only by
 * a reader who reads every message, because nothing then says whose run it is.
 *
 * `theAgentASessionAnswersAs` is asked only about the runs that could answer as this reader: one a hold
 * of this reader's is on, or one whose `ranAs` or `servingAgent` holds the reader's registry id, its
 * handle or one of its agent records. Those are the three facts that function reads, in its order, so
 * every run it could say yes about is among them and the answer is the same. The list of every run asks
 * about hundreds of runs at once: asking the function about each took the list from under 2 seconds to
 * over 8 on a copy of the office's data, and narrowing by the whole record's text still took an inspector,
 * whose handle is on every run it checked, to 7. The agent's record is not read either
 * (`theAgentOnlyASessionAnswersAs`): reading it for an inspector's 634 own runs took 5 seconds.
 */
export function theRunsWhoseTranscriptThisReaderMayRead(
  reader: AMessageReader,
  sessionRecordIds: readonly (string | null)[],
  workspaceId: string,
): (sessionRecordId: string | null) => boolean {
  if (reader.readsEveryMessage) return () => true
  const asked = [...new Set(sessionRecordIds.filter((id): id is string => id !== null))]
  const me = reader.who
  if (me === null || me.kind !== 'agent' || asked.length === 0) return () => false
  const agent = readParticipant(me) as RegisteredAgent | null
  const myNames = [
    me.id,
    ...(agent === null ? [] : [agent.handle]),
    ...db.select({ id: agentRecords.recordId }).from(agentRecords).where(eq(agentRecords.agentId, me.id)).all().map((row) => row.id),
  ]
  const held = new Set(
    db
      .select({ session: handleHolds.sessionRecordId })
      .from(handleHolds)
      .where(and(inArray(handleHolds.agentId, myNames), isNull(handleHolds.releasedAt)))
      .all()
      .map((row) => row.session),
  )
  const out = new Set<string>()
  for (const piece of piecesOf(asked)) {
    for (const run of db
      // THE TWO STORED FIELDS READ BELOW, AND NOT THE WHOLE RECORD. A run's other fields hold its notes, and on an office
      // of the live shape reading them for every run of the list was a tenth of what GET /api/sessions cost (round 35 of
      // wave 13n). A field the run does not hold comes back as null, which both readers below take as absent.
      .select({
        id: records.id,
        data: sql<string>`json_object('ranAs', json(${records.data} -> '$.ranAs'), 'servingAgent', json(${records.data} -> '$.servingAgent'))`,
        workspaceId: records.workspaceId,
      })
      .from(records)
      .where(inArray(records.id, piece))
      .all()) {
      const data = JSON.parse(run.data) as PanelRecord['data']
      // THE TWO STORED FACTS `theAgentASessionAnswersAs` READS AFTER THE HOLD, and nothing else of the record.
      const stored = JSON.stringify([data['ranAs'] ?? null, data['servingAgent'] ?? null])
      if (!held.has(run.id) && !myNames.some((name) => stored.includes(JSON.stringify(name)))) continue
      const answers = theAgentOnlyASessionAnswersAs({ id: run.id, data, workspaceId: run.workspaceId }, workspaceId)
      if (answers !== null && sameParticipant(answers, me)) out.add(run.id)
    }
  }
  return (sessionRecordId) => sessionRecordId !== null && out.has(sessionRecordId)
}

/**
 * ONE MESSAGE AS THE POOL READS IT, with its delivery rows and its stored `data`, or null when there is no live message
 * of that id. `whatANewMessageChanges` and `whereSeenLeavesTheContacts` both read a message this way.
 */
function theEntryOf(messageId: string): { entry: PoolEntry; row: MessageRow; data: Record<string, unknown> } | null {
  const row = db
    .select(MESSAGE_COLUMNS)
    .from(records)
    .where(and(eq(records.id, messageId), isNull(records.deletedAt)))
    .get() as MessageRow | undefined
  if (row === undefined || row.kind !== 'message') return null
  const data = (row.data ?? {}) as Record<string, unknown>
  // WHAT THE ENTRY NEEDS FROM ITS PROJECT: whether a comment's words have gone out, and which tool ran
  // the run it came from. Read for this one message rather than for the whole project.
  const runtimes = new Map<string, TheRunsTool>()
  const run = data['fromRun']
  if (typeof run === 'string' && run !== '') {
    const held = db
      .select(RUN_TOOL_COLUMNS)
      .from(records)
      .where(and(eq(records.id, run), eq(records.kind, 'session'), isNull(records.deletedAt)))
      .get()
    const tool = held === undefined ? null : theRunsTool(held)
    if (tool !== null) runtimes.set(run, tool)
  }
  const goneOut = recordIsAComment({ kind: row.kind, data }) ? new Set(commentsGoneOut(EVERY_PROJECT)) : new Set<string>()
  return { entry: asEntry(row, deliveriesOf(messageId), { starterHistory: new Map(), goneOut, runtimes, senders: new Map(), flags: new Map(), editWindowSeconds: messageEditWindowSeconds() }), row, data }
}

/**
 * WHAT ONE NEW MESSAGE CHANGES IN THE CHAT'S LISTS, for `message.new` to carry.
 *
 * Every answer here comes from the function the list doors use for the same question, so the page
 * never works one out by a rule of its own:
 *
 *   - the entry is built by `asEntry`, which every pool read uses;
 *   - the one-to-one conversations it is in are `isBetween`'s answer, the rule `contactsFor` and
 *     `conversationBetween` use, asked about the sender and each recipient. For any writer but Mole
 *     Office that rule is true only between the sender and somebody the message reached, so those are
 *     the only pairs it can be true of;
 *   - the conversations between two agents follow `conversationsBetweenAgents` line for line;
 *   - how it counts for each recipient is `unreadAmong` and `anythingUnreadAmong` on this one entry.
 *
 * A MESSAGE TO A GROUP, A LINE MOLE OFFICE WROTE AND A MESSAGE FROM A WRITER NO REGISTRY HOLDS have
 * `pairs` null. Placing a Mole Office line can need the message it is about and who that message was
 * between, which is the whole pool; the other two are placed by rules that read more than this
 * message. A page reads its contacts for those.
 *
 * `fresh` is false when the patch door announces an older message that has just reached somebody.
 * Null means the message is not there to read, which a caller inside the write that made it does not
 * expect; the event then carries nothing, and a page reads its lists as it always did.
 */
export function whatANewMessageChanges(messageId: string, fresh: boolean): WhatANewMessageChanges | null {
  const read = theEntryOf(messageId)
  if (read === null) return null
  const { entry, row, data } = read
  // ONLY THE NAMES THAT COULD BE ITS SENDER. `everyone` is read for one question, who `senderOf` says sent this message,
  // and `isBetween` asks it again of the same list. A message to a group asks no sender, and a stored sender needs only
  // the rows that hold its id or its handle. On a made-up office of 972 agents, every name was 973 rows for each message
  // written (round 41 of wave 13u).
  const everyone = entry.toGroup !== null ? [] : entry.sentBy === null ? everybodyRegistered() : everybodyAStoredSenderCouldName(entry.sentBy)
  const sender = entry.toGroup !== null ? null : senderOf(entry, everyone)
  let pairs: [ParticipantRef, ParticipantRef][] | null = null
  if (entry.toGroup === null && sender !== null && !isMoleOffice(sender)) {
    pairs = []
    for (const to of entry.to) if (isBetween(entry, sender, to, everyone)) pairs.push([sender, to])
  }
  const agentPairs: [ParticipantRef, ParticipantRef][] = []
  if (refFrom(data['sentBy'])?.kind === 'agent' && entry.sentBy !== null && entry.sentBy.kind === 'agent' && entry.toGroup === null) {
    const from = entry.sentBy
    for (const to of entry.to) {
      if (to.kind !== 'agent') continue
      agentPairs.push(participantKey(from) < participantKey(to) ? [from, to] : [to, from])
    }
  }
  const counts = entry.deliveries.map((one) => ({
    who: one.to,
    unread: unreadAmong([entry], one.to),
    anythingUnread: anythingUnreadAmong([entry], one.to),
  }))
  // ANOTHER MESSAGE WRITTEN IN THE SAME SECOND. A NEW MESSAGE LOOKS FOR ONE AMONG THE RECORDS CHANGED SINCE ITS SECOND,
  // through the index of when a record last changed. A record is written with both stamps the same and is only changed
  // later, so another message made in that second has changed in it or since. On a copy of an office with 25,696
  // messages that read took 0.002 ms, where walking every message through the kind's index took 16 ms and read 55 MB
  // from the file, for each message written (wave 13y round 36). An older message the patch door announces is looked
  // for the old way: for a message a month old, the records changed since came to 82 MB.
  const inTheSameSecond = and(eq(records.kind, 'message'), eq(records.createdAt, row.createdAt), ne(records.id, row.id), isNull(records.deletedAt))
  const anotherInTheSameSecond =
    (fresh
      ? db.all(sql`SELECT ${records.id} FROM ${records} INDEXED BY records_updated_idx WHERE ${and(gte(records.updatedAt, row.createdAt), inTheSameSecond)} LIMIT 1`)
      : db.select({ id: records.id }).from(records).where(inTheSameSecond).limit(1).all()
    ).length > 0
  return { entry, pairs, agentPairs, anotherInTheSameSecond, counts, fresh }
}

/**
 * WHERE A MARK REACHING `seen` LEAVES THE READER'S OWN CONTACT ROWS, IN EACH OF THESE PROJECTS: each row the marked
 * messages are in, with its unread count and its boldness as `GET /api/messages/contacts` asked in that project would now
 * answer them.
 *
 * Round 9 of wave 13x. A person opening a conversation marks what is on screen seen, and the event that said so carried
 * nothing about the counts, so every open page read the whole contact list again: 876 KB on an office of the live size,
 * on every switch from one conversation to another. The rows are worked out here by the rules the contacts door uses
 * (`everyoneElseThisMessageIsBetween`, `unreadAmong`, `anythingUnreadAmong`), over the messages of each one conversation
 * (`theMessagesOfOnePair`), never over the reader's whole list.
 *
 * EACH PROJECT IS WORKED OUT APART (wave 13y round 91, gap 4). The contacts door counts a message stored under an agent's
 * own record as that agent's, by the agent's record in the project it is asked in (`theContactsOfOneReader`), so these
 * rows are worked out with the same records: the records these messages store, to name their senders, and the own
 * records of the agents they are between, to tell which messages of each conversation are theirs. Each conversation is
 * read once, for every project, and only that telling is done for each project. Worked out with no record, a mark on a
 * message stored under a record gave no rows, and a mark beside an unread message stored under a record gave that
 * agent's row one fewer than the door counts.
 *
 * NULL FOR A PROJECT WHEN THOSE RULES NEED MORE THAN THESE MESSAGES, and a page then reads its lists as before: a message
 * to a group (its count is the group's), a line Mole Office wrote about another message (its conversation is that
 * message's), a writer nobody registered (its row is keyed by what it typed), a reader that is not a person (only a
 * person's page draws these rows), and a side no registry holds.
 */
export function whereSeenLeavesTheContacts(
  messageIds: readonly string[],
  to: ParticipantRef,
  workspaceIds: readonly string[],
  conversations: ConversationsRead = new Map(),
): Map<string, SeenLeaves | null> {
  const nowhere = new Map(workspaceIds.map((workspaceId): [string, SeenLeaves | null] => [workspaceId, null]))
  if (to.kind !== 'person' || workspaceIds.length === 0) return nowhere
  const entries: PoolEntry[] = []
  for (const id of messageIds) {
    const read = theEntryOf(id)
    if (read === null) return nowhere
    const entry = read.entry
    // A CONVERSATION READ EARLIER IN THE SAME REQUEST is brought up to this mark before anything below can return: its
    // entry for this message takes the delivery rows just read. A mark changes nothing else these rows are counted from.
    for (const { pool } of conversations.values()) {
      const at = pool.findIndex((one) => one.id === id)
      if (at !== -1) pool[at] = { ...pool[at]!, deliveries: entry.deliveries }
    }
    if (entry.toGroup !== null || (entry.aboutMessage !== undefined && entry.aboutMessage !== null)) return nowhere
    entries.push(entry)
  }
  const registered = everybodyRegistered()
  // EACH CONVERSATION IS READ ONCE, FOR EVERY PROJECT. The person's part of the pool is read by the person's id alone
  // (`theIdsAMessageMayStoreFor`), and the other side's group lines by that side's registry id, so the read is the same
  // whichever project's records the list carries; only which of its messages are between the two depends on the
  // project. Read once for each project, it was one more read of the person's whole pool, on every mark, for each other
  // project the person had a page open in: about 160 ms each on the made-up office of wave 13y round 91. A request that
  // marks many messages hands in what its earlier marks read (`markManySeen`).
  const reader = theMessageReader({ type: 'human', id: to.id })
  const thePairWith = (who: ParticipantRef): OnePairRead => {
    const key = participantKey(who)
    const held = conversations.get(key)
    if (held !== undefined) return held
    const pool = onlyTheMessagesThisReaderMayRead(reader, theMessagesOfOnePair(to, who, registered, EVERY_PROJECT))
    const pair = { pool, aboutParties: thePartiesOfEveryPair(pool), stored: theAgentIdsTheseMessagesStore(pool) }
    conversations.set(key, pair)
    return pair
  }
  // MOLE OFFICE'S ID IS READ ONCE FOR EVERY PROJECT. Counted with `isMoleOffice`, each project read its registry row
  // again for each message of each conversation: about 40 more statements a mark for each other project the person had
  // a page open in, on the made-up office of wave 13y round 91.
  const officeTest = theMoleOfficeTest()
  // THE ROWS WITH NO RECORD ARE WORKED OUT ONCE, for every project whose records no message read here stores. Telling
  // the conversation apart again for each project went through the person's whole pool each time: about 6 ms a mark
  // for each other project the person had a page open in, on the made-up office of wave 13y round 91.
  let writersWithNoRecord: ReturnType<typeof theWritersOfOnePool> | null = null
  const withNoRecord = new Map<string, SeenLeaves>()
  const theRowsWithNoRecord = (sides: readonly ParticipantRef[]): SeenLeaves => {
    const key = sides.map(participantKey).join('\n')
    const held = withNoRecord.get(key)
    if (held !== undefined) return held
    writersWithNoRecord ??= theWritersOfOnePool(registered)
    const rows = theRowsOf(sides, to, registered, writersWithNoRecord, thePairWith, officeTest)
    withNoRecord.set(key, rows)
    return rows
  }
  return new Map(
    workspaceIds.map((workspaceId) => [
      workspaceId,
      whereSeenLeavesTheContactsIn(workspaceId, entries, to, registered, thePairWith, officeTest, theRowsWithNoRecord),
    ]),
  )
}

/**
 * The messages of one conversation of the person's, as `whereSeenLeavesTheContacts` reads them once for every project,
 * with every agent id they store as a sender or a recipient.
 */
type OnePairRead = {
  pool: PoolEntry[]
  aboutParties: ReadonlyMap<string, readonly [ParticipantRef, ParticipantRef]>
  stored: ReadonlySet<string>
}

/** The conversations of the person's that one request has read, by the other side's key (`participantKey`). */
type ConversationsRead = Map<string, OnePairRead>

/** The rows `whereSeenLeavesTheContacts` gives for one project, or null. */
function whereSeenLeavesTheContactsIn(
  workspaceId: string,
  entries: readonly PoolEntry[],
  to: ParticipantRef,
  registered: KnownParticipant[],
  thePairWith: (who: ParticipantRef) => OnePairRead,
  officeTest: (who: ParticipantRef) => boolean,
  theRowsWithNoRecord: (sides: readonly ParticipantRef[]) => SeenLeaves,
): SeenLeaves | null {
  const named = withTheRecordsTheseMessagesStore(registered, entries, workspaceId)
  const namers = theWritersOfOnePool(named)
  const sides = new Map<string, ParticipantRef>()
  for (const entry of entries) {
    const sender = namers.senderOf(entry)
    if (sender === null) return null
    for (const other of everyoneElseThisMessageIsBetween(entry, to, sender, namers.recipientsOf(entry), namers.participantOf, undefined, officeTest)) {
      // MOLE OFFICE IS NOBODY'S CONTACT and the reader is not their own, as `contactsFor` says.
      if (sameParticipant(other, to) || officeTest(other)) continue
      if (!named.some((known) => sameParticipant(known.who, other))) return null
      sides.set(participantKey(other), other)
    }
  }
  const them = [...sides.values()]
  const everyone = withTheOwnRecordsOf(named, them, workspaceId)
  // A RECORD CHANGES NO ROW WHERE NO MESSAGE OF THESE CONVERSATIONS STORES IT. The rows are counted from those messages
  // alone, and `theAgentAStoredSenderNames` names an agent by its record only when a stored id is that record. So a
  // project none of whose records they store gives the rows worked out with no record, which every such project shares.
  const aRecordIsStored = everyone.some((known) => typeof known.record === 'string' && them.some((who) => thePairWith(who).stored.has(known.record as string)))
  if (!aRecordIsStored) return theRowsWithNoRecord(them)
  return theRowsOf(them, to, everyone, everyone === named ? namers : theWritersOfOnePool(everyone), thePairWith, officeTest)
}

/** Each side's contact row of the person's, with these names: its unread count and its boldness. */
function theRowsOf(
  sides: readonly ParticipantRef[],
  to: ParticipantRef,
  everyone: readonly KnownParticipant[],
  writers: ReturnType<typeof theWritersOfOnePool>,
  thePairWith: (who: ParticipantRef) => OnePairRead,
  officeTest: (who: ParticipantRef) => boolean,
): SeenLeaves {
  return sides.map((who) => {
    const { pool, aboutParties } = thePairWith(who)
    const between = pool.filter((one) => isBetween(one, to, who, everyone, aboutParties, writers, officeTest))
    return { key: participantKey(who), unread: unreadAmong(between, to, officeTest), anythingUnread: anythingUnreadAmong(between, to) }
  })
}

/**
 * HOW A `message.new` IS TOLD TO ONE OPEN PAGE: with the part that depends on who is reading.
 *
 * Only a person's page draws the chat's lists, so only a person's page is told the extra part; every
 * other page is sent the event as it is. Worked out when the page is sent the event, and again for a
 * page that reconnects and is sent it from memory.
 */
export function aNewMessageAsToldTo(event: ChannelEvent): TellOnePage | null {
  if (event.name !== 'message.new' || event.lists === null || event.lists === undefined) return null
  const lists: WhatANewMessageChanges = event.lists
  const byReader = new Map<string, WhatANewMessageChangesForOneReader>()
  return (page) => {
    const reader = page.who
    if (reader === null || reader.kind !== 'person') return event
    const key = participantKey(reader)
    let told = byReader.get(key)
    if (told === undefined) {
      told = whatANewMessageChangesForOneReader(lists, reader)
      byReader.set(key, told)
    }
    const withTheReader: ChannelEvent = { ...event, lists: { ...lists, forTheReader: told } }
    return withTheReader
  }
}

/** The part of a new message's change that depends on one reader. */
function whatANewMessageChangesForOneReader(lists: WhatANewMessageChanges, reader: ParticipantRef): WhatANewMessageChangesForOneReader {
  // WHAT IS NEW SINCE THIS READER LAST OPENED EACH CONVERSATION BETWEEN TWO AGENTS, by the rule the
  // between-agents door uses: `sinceTheyLastRead`, and a Mole Office line shows without counting.
  const betweenAgents = lists.agentPairs.map((between) => {
    const read = whenTheyLastRead(reader, pairKey(between[0], between[1]), EVERY_PROJECT)
    const since = sinceTheyLastRead([lists.entry], reader, read)
    return { between, newSince: since.filter((one) => !isASystemLine(one)).length, anythingNew: since.length > 0 }
  })
  const aParty = lists.pairs !== null && lists.pairs.some(([a, b]) => sameParticipant(a, reader) || sameParticipant(b, reader))
  return { reader, betweenAgents, placedByHand: aParty ? theContactsPlacedByHand(reader) : null }
}

// ============================================================================ reading somebody else's

export { whyReadingSomebodyElsesIsRefused } from '@shared/why-reading-somebody-elses-is-refused.ts'

/** A pair's separator, its reader and its writer are in ./message-pairs.ts, which opens nothing, and are given on from here. */
export { PAIR_SEPARATOR, pairFrom, pairKey }

/** One read of a conversation somebody was not part of, as it is stored and as it is read back. */
export interface ConversationRead {
  /** Who read it. */
  reader: ParticipantRef
  /** The two agent ids with a tilde between them. */
  pair: string
  /** The id whose side it was read as, or NEITHER_SIDE. */
  asSide: string
  /** When, as a local wall-clock stamp. */
  at: string
}

/**
 * WHETHER A READ REPLACES THE READ POINT HELD FOR ITS READER, CONVERSATION AND PROJECT, or writes nothing.
 *
 * The one rule both writers of `conversation_reads` keep, so they cannot drift: `recordThatSomebodyRead` below, and
 * the import's fold of an archive written before migration 0278 (`theReadsAnImportLeavesOut` in
 * src/server/lib/import.ts). Migration 0278 folds the rows already stored by the same order, in SQL.
 *
 * A NEWER READ REPLACES IT, AND AN OLDER ONE DOES NOT: the readers ask for the latest `at`. A READ IN THE SAME SECOND
 * FROM ANOTHER SIDE REPLACES IT, because the readers break a tie in one second by the read written last, and this read
 * is written after the one held. A READ AT THE SAME POINT, from the same side in the same second, does not: writing it
 * again would say nothing the row does not, and no reader would answer differently for it (wave 13y round 14).
 */
export function aReadMovesTheReadPoint(held: { asSide: string; at: string } | undefined, read: { asSide: string; at: string }): boolean {
  if (held === undefined) return true
  if (read.at !== held.at) return read.at > held.at
  return read.asSide !== held.asSide
}

/**
 * WRITE DOWN THAT SOMEBODY READ A CONVERSATION THEY WERE NOT PART OF.
 *
 * Criterion M12 says the read is recorded. It was recorded only as an `api_calls` row, which is
 * traffic: `pruneUsage` deletes an untraced one after fourteen days and the browser sends no trace,
 * so after a fortnight nothing said the read had happened. Problem `xdcPntH9rxw_`. This row is kept.
 *
 * IT IS NOT THE SAME FACT AS THE `api_calls` ROW. That one says a request arrived, and it is deleted
 * when the traffic it belongs to stops being counted. This one says a person read a conversation.
 * Nothing derives either from the other.
 *
 * ONE ROW FOR EACH READER IN EACH CONVERSATION IN EACH PROJECT, the newest read, in wave 13s round
 * 64. Every reader of the table asks for that row and no older one, and
 * a row for every read grew the table by about 130,000 rows a day. A newer read deletes the row and
 * inserts itself with an id of its own, so it is written exactly as an insert always wrote it and its
 * rowid is later than every other read's, which is the order the readers break a tie in. Both happen
 * in one transaction, so a read that cannot be written leaves the read point it would have replaced.
 * The unique index of migration 0278 refuses a second row.
 *
 * A READ THAT DOES NOT MOVE THE READ POINT WRITES NOTHING, by `aReadMovesTheReadPoint`. Nobody is told
 * either, because nothing moved, and the read point that stays is what this returns.
 *
 * `asSide` IS WHOSE SIDE IT WAS READ AS: one of the two agents of a pair, or a member of a group, or null for neither
 * side. Its kind is stored beside its id, so the id can be told without a guess (migration 0311).
 */
export function recordThatSomebodyRead(
  reader: ParticipantRef,
  pair: string,
  asSide: ParticipantRef | null,
  workspaceId: string,
  at: string = nowStamp(),
  aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite),
): ConversationRead {
  const { read, moved } = moveTheReadPoint(reader, pair, asSide, workspaceId, at, aliases)
  // AND THIS READER'S OTHER PAGES ARE TOLD. What is new in a conversation between two agents is counted
  // from the last time the reader opened it, so this read moves that count on every page of theirs,
  // and only theirs. The page that made the read reads its lists itself.
  if (moved) {
    announce({
      name: 'list.changed',
      workspaceId,
      lists: ['betweenAgents'],
      about: reader,
      groupId: null,
      because: `${reader.id} opened the conversation ${pair}, so what is new in it counts from now.`,
    })
  }
  return read
}

/**
 * THE WRITE `recordThatSomebodyRead` MAKES, WITHOUT TELLING THE PAGES, and whether the point moved. A hand-over that
 * moves many read points tells each project once (`whatTheGroupsGained`).
 */
function moveTheReadPoint(
  reader: ParticipantRef,
  pair: string,
  asSide: ParticipantRef | null,
  workspaceId: string,
  at: string,
  aliases: TheFiledAliases,
): { read: ConversationRead; moved: boolean } {
  // AN AGENT IS WRITTEN UNDER ITS CANONICAL REGISTRY ID, as the reader, a side of the pair and the side read as, and the
  // read point held under any id it alone answers to is the one this read replaces.
  const readerIds = reader.kind === 'agent' ? theRegistryIdsOf(sqlite, reader.id, aliases) : [reader.id]
  const keys = theKeysAConversationMayBeStoredUnder(pair, aliases)
  const side = asSide === null ? NEITHER_SIDE : asSide.kind === 'agent' ? theRegistryIdsOf(sqlite, asSide.id, aliases)[0]! : asSide.id
  const read = { reader: { kind: reader.kind, id: readerIds[0]! }, pair: keys[0]!, asSide: side, at }
  const newest = theReadsNewestFirst(reader, justThisProject(workspaceId), pair, aliases).get()
  if (newest !== undefined && !aReadMovesTheReadPoint(newest, read)) return { read: asConversationRead(newest), moved: false }
  sqlite.transaction(() => {
    db.delete(conversationReads)
      .where(
        and(
          eq(conversationReads.workspaceId, workspaceId),
          eq(conversationReads.readerKind, reader.kind),
          isOneOfTheIds(conversationReads.readerId, readerIds),
          isOneOfTheIds(conversationReads.pair, keys),
        ),
      )
      .run()
    db.insert(conversationReads)
      .values({ id: anOfficeId(), workspaceId, readerKind: reader.kind, readerId: read.reader.id, pair: read.pair, asSide: read.asSide, asSideKind: asSide?.kind ?? null, at })
      .run()
  })()
  return { read, moved: true }
}

/**
 * THE NEWEST TIME THIS READER OPENED THIS CONVERSATION, or null when they never have.
 *
 * Read BEFORE the read being made now is written, so the conversation's header can say "you read
 * this from that side, then" rather than "you read this just now", which the reader can see for
 * themselves. Null means nobody has looked, which is what the header then says nothing about.
 */
export function whenTheyLastRead(
  reader: ParticipantRef,
  pair: string,
  which: WhichProjects,
  aliases?: TheFiledAliases,
): ConversationRead | null {
  const row = theReadsNewestFirst(reader, which, pair, aliases).get()
  return row === undefined ? null : asConversationRead(row)
}

/**
 * THE NEWEST TIME THIS READER OPENED EACH CONVERSATION THEY HAVE OPENED, by pair, in one query.
 *
 * The same answer `whenTheyLastRead` gives for one pair, for every pair at once: the rows come in the
 * same order, and the first row of a pair is the one that query would have returned. A pair this
 * reader never opened is not in the map.
 */
function whenTheyLastReadEach(reader: ParticipantRef, which: WhichProjects, aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite)): Map<string, ConversationRead> {
  const newest = new Map<string, ConversationRead>()
  for (const row of theReadsNewestFirst(reader, which, null, aliases).all()) {
    // A pair stored under an agent's old id is kept under the pair of canonical ids.
    const pair = theKeysAConversationMayBeStoredUnder(row.pair, aliases)[0]!
    if (!newest.has(pair)) newest.set(pair, asConversationRead(row))
  }
  return newest
}

// NEWEST BY THE ORDER THEY WERE WRITTEN, not by id. A stamp here is whole seconds, so two reads
// in one second tie, and `id` is a nanoid — sorting by it would pick one of the two at random.
// SQLite's own `rowid` rises with every insert, so it is what says which came second. This is
// the same argument `contactsFor` above makes when it orders conversations by their place in the
// pool rather than by their stamp.
const NEWEST_READ_FIRST = [desc(conversationReads.at), sql`rowid desc`]

/**
 * EVERY KEY A CONVERSATION'S READS MAY BE STORED UNDER, the canonical one first: a pair of two agents under each id each
 * side alone answers to (`theRegistryIdsOf`), or a group's id as it is. With no alias filed, the key alone.
 */
function theKeysAConversationMayBeStoredUnder(key: string, aliases: TheFiledAliases): string[] {
  const pair = pairFrom(key)
  if (pair === null) return [key]
  const [one, other] = pair.map((side) => theRegistryIdsOf(sqlite, side.id, aliases))
  const keys: string[] = []
  for (const a of one!) {
    for (const b of other!) {
      const both = [a, b].sort().join(PAIR_SEPARATOR)
      if (a !== b && !keys.includes(both)) keys.push(both)
    }
  }
  return keys
}

/**
 * THE NEWEST TIME THIS READER OPENED EACH OF THESE CONVERSATIONS, by pair, in one statement for each piece of pairs.
 *
 * The same answer `whenTheyLastRead` gives for each pair, from the same index of a reader's reads of one
 * conversation and with no sort: the rows come by pair and then newest first, so the first row of a pair is
 * the one that query would have returned. A pair this reader never opened is not in the map.
 */
function whenTheyLastReadThese(
  reader: ParticipantRef,
  pairs: readonly string[],
  which: WhichProjects,
  aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite),
): Map<string, ConversationRead> {
  const newest = new Map<string, ConversationRead>()
  const readerIds = reader.kind === 'agent' ? theRegistryIdsOf(sqlite, reader.id, aliases) : [reader.id]
  const rows = readInPieces(pairs, (piece) =>
    db
      .select()
      .from(conversationReads)
      .where(
        and(
          narrowedToProjects(conversationReads.workspaceId, which),
          inArray(conversationReads.pair, piece),
          eq(conversationReads.readerKind, reader.kind),
          isOneOfTheIds(conversationReads.readerId, readerIds),
        ),
      )
      .orderBy(desc(conversationReads.pair), ...NEWEST_READ_FIRST)
      .all(),
  )
  for (const row of rows) {
    if (!newest.has(row.pair)) newest.set(row.pair, asConversationRead(row))
  }
  return newest
}

/** This reader's reads, of one pair or of every pair when `pair` is null, newest first. */
function theReadsNewestFirst(reader: ParticipantRef, which: WhichProjects, pair: string | null, aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite)) {
  return (
    db
      .select()
      .from(conversationReads)
      .where(
        and(
          narrowedToProjects(conversationReads.workspaceId, which),
          pair === null ? undefined : isOneOfTheIds(conversationReads.pair, theKeysAConversationMayBeStoredUnder(pair, aliases)),
          eq(conversationReads.readerKind, reader.kind),
          isOneOfTheIds(conversationReads.readerId, reader.kind === 'agent' ? theRegistryIdsOf(sqlite, reader.id, aliases) : [reader.id]),
        ),
      )
      .orderBy(...NEWEST_READ_FIRST)
  )
}

/** One stored read, as it is handed back. */
function asConversationRead(row: typeof conversationReads.$inferSelect): ConversationRead {
  return {
    reader: { kind: row.readerKind === 'person' ? 'person' : 'agent', id: row.readerId },
    pair: row.pair,
    asSide: row.asSide,
    at: row.at,
  }
}

// ============================================================================ a group's conversation

/**
 * EVERYTHING SAID IN ONE GROUP, oldest first.
 *
 * A group's conversation is worked out the same way a pair's is: from the messages themselves, not
 * from a store of its own. What names it is the group id on the message, which is the field an author
 * wrote — so a message stays in the group it was sent to even after the membership changes, and
 * nobody is retrospectively written out of a conversation they took part in.
 *
 * WHICH PROJECTS IS SAID OUT LOUD, and the group routes say `EVERY_PROJECT`. Decision
 * `t5DlN5-uTZoT`: a group follows the conversations, so somebody standing in another project reads
 * the whole of it. Narrowing to one project cut a group's own conversation in half whenever a member
 * wrote from somewhere else. Problem `m1ea9ihnnu9e`.
 */
export function messagesInAGroup<Entry extends AMessageTheContactsRead = PoolEntry>(
  groupId: string,
  which: WhichProjects,
  pool?: readonly Entry[],
): (Entry | PoolEntry)[] {
  // A caller holding the pool gets its own entries back, filtered, instead of the table read again: the whole
  // entries `messagePool` hands out, or the contact read's narrow ones (`AMessageTheContactsRead`). A caller
  // without one is answered from this group's messages alone, by the same select with the group's id added, and
  // not from every message of every project: that read was one statement naming all 34,400 messages of the
  // office on 11 October 2026, which SQLite refused (round 48h of wave 13k).
  if (pool !== undefined) return pool.filter((one) => one.toGroup === groupId)
  return messagesSentToGroups([groupId], which)
}

/**
 * THE SAME RULE AS `messagesInAGroup` WITH A POOL, ASKED ONCE FOR EVERY GROUP: an entry belongs to the group its
 * `toGroup` names, and each group's list keeps the pool's own order. One walk of the pool files every group, so a
 * caller asking for each group's own messages does not walk the pool once per group. A group named with no entries
 * gets an empty list, exactly what `pool.filter` gives it.
 */
export function messagesInEachGroup(groupIds: readonly string[], pool: readonly PoolEntry[]): Map<string, PoolEntry[]> {
  const byGroup = new Map<string, PoolEntry[]>()
  for (const id of groupIds) byGroup.set(id, [])
  for (const one of pool) {
    if (one.toGroup === null) continue
    const held = byGroup.get(one.toGroup)
    if (held !== undefined) held.push(one)
  }
  return byGroup
}

/**
 * ONE GROUP'S MESSAGES STAMPED AFTER A MOMENT, NEWEST FIRST: the same entries `messagesInAGroup` hands out, with the
 * moment narrowing the database statement (`messagesSentToGroups` asks `createdAt > after`, so a message at that very
 * second is left out). It is the pool's order — the moment descending, and two messages of one moment in the order they
 * were stored — which the oldest-first read is turned into by a stable sort.
 *
 * The message centre is the whole pool (`EVERY_PROJECT` reads the centre), so this is exactly the group's messages the
 * whole pool gives, when the reader asks for them from a moment on.
 */
export function messagesInAGroupAfter(groupId: string, after: string): PoolEntry[] {
  return messagesSentToGroups([groupId], EVERY_PROJECT, new Map([[groupId, after]])).sort((one, other) =>
    one.sentAt < other.sentAt ? 1 : one.sentAt > other.sentAt ? -1 : 0,
  )
}

/**
 * EVERY MESSAGE SENT TO ANY OF THESE GROUPS, oldest first: the same entries `messagesInAGroup` hands
 * out, read for several groups at once.
 *
 * WHY A READ OF ITS OWN. `whatTheGroupsGained` is read by the brief, and the brief is read at every
 * start. Building every message of every project to keep only a few groups' messages is the walk
 * acceptance finding 26 measured at 21% of the office's time when one hook asked it after every tool
 * call. This asks the database for the groups' messages alone and builds only those. GET /api/groups
 * reads its list from it too.
 *
 * THE GROUPS' MESSAGES ARE FOUND THROUGH THE INDEX OF THE GROUP (migration 0292), by rowid, and the
 * rest of the conditions are asked of those alone, as `forcedMessagesFor` asks its own. Asked with the
 * rest, SQLite walked every message: 66 ms for an agent's groups on a made-up office at the scale of
 * 22 October 2026, and 2.3 ms this way, each the median of 8 warm reads (wave 13y round 65).
 *
 * THE SAME ORDER AS THE WHOLE POOL: by stamp, and two messages with one stamp in the order they were
 * stored, which is the order the walk of every message read them in before.
 *
 * IN PIECES (src/server/db/in-pieces.ts), because the groups are as many as the office has opened. A
 * group's messages all come from one piece, so each group keeps the order above. The pieces are joined
 * by a stable sort on the stamp; past 500 groups, two messages of different groups with one stamp may
 * then come in another order than the pool's. Every caller takes the groups apart again.
 *
 * `after` LEAVES OUT, IN EACH GROUP, EVERY MESSAGE STAMPED AT OR BEFORE THAT GROUP'S READ POINT, for a reader that
 * keeps only what came after its point in each group. A group it holds no point for is read whole. A message's
 * `sentAt` is its stamp, so this is the test that reader makes, asked of the rows. Each piece is asked for its oldest
 * point, and a CASE names only the groups whose point is newer: a reader whose points are all one moment asks one
 * comparison, as the busiest live reader's 923 points were (wave 13y round 126).
 */
export function messagesSentToGroups(groupIds: readonly string[], which: WhichProjects, after: ReadonlyMap<string, string> | null = null): PoolEntry[] {
  if (groupIds.length === 0) return []
  const rows = readInPieces(
    groupIds,
    (piece) =>
      db
        .select(MESSAGE_COLUMNS)
        .from(records)
        .where(
          and(
            sql`${records}.rowid IN (SELECT ${records}.rowid FROM ${records} INDEXED BY records_message_to_group_idx WHERE ${and(ONE_KIND_WRITTEN_OUT.message, inArray(STORED_FIELDS.messageToGroup(records.data), piece))})`,
            messagesInTheViewOf(which, true),
            theKindOfARowFoundById('message'),
            isNull(records.deletedAt),
            after === null ? undefined : afterEachPoint(piece, after),
          ),
        )
        .orderBy(records.createdAt, sql`rowid`)
        .all() as MessageRow[],
  ).sort((one, other) => (one.createdAt < other.createdAt ? -1 : one.createdAt > other.createdAt ? 1 : 0))
  const deliveries = deliveriesOfMany(rows.map((row) => row.id))
  const said = whatTheProjectSays(which, rows)
  const officeTest = theMoleOfficeTest()
  return rows.map((row) => asEntry(row, deliveries.get(row.id) ?? [], said, officeTest))
}

/** For one piece of `messagesSentToGroups`: only what came after each group's point, and all of a group with none. */
function afterEachPoint(piece: readonly string[], after: ReadonlyMap<string, string>): SQL {
  const point = (id: string): string => after.get(id) ?? ''
  const oldest = piece.map(point).reduce((low, at) => (at < low ? at : low))
  const later = piece.filter((id) => point(id) > oldest)
  if (later.length === 0) return gt(records.createdAt, oldest)
  return sql`${records.createdAt} > CASE ${STORED_FIELDS.messageToGroup(records.data)} ${sql.join(
    later.map((id) => sql`WHEN ${id} THEN ${point(id)}`),
    sql` `,
  )} ELSE ${oldest} END`
}

/** How many messages in one group this reader has not marked seen. A system line is not one. */
export function unreadInAGroup(groupId: string, me: ParticipantRef, which: WhichProjects, pool?: readonly AMessageTheContactsRead[]): number {
  return unreadAmong(messagesInAGroup(groupId, which, pool), me)
}

/**
 * Whether anything in one group is unread for this reader, a line Mole Office wrote included.
 *
 * Criterion M33: a group whose only unread thing is the line saying it was opened is bold and
 * carries no number.
 */
export function anythingUnreadInAGroup(groupId: string, me: ParticipantRef, which: WhichProjects, pool?: readonly PoolEntry[]): boolean {
  return anythingUnreadAmong(messagesInAGroup(groupId, which, pool), me)
}

// ============================================================================ what a member has missed

/** One group, the read point this reader held when it was read, and what came after that point. */
export interface WhatAGroupGained {
  /** The group, with its members as they are now. */
  group: GroupOnTheWire
  /** The moment this reader last moved its point in this group, or null because it never has. */
  since: string | null
  /** The messages written after `since`, oldest first. Everything when `since` is null. */
  messages: PoolEntry[]
}

/**
 * WHAT EVERY GROUP THIS READER BELONGS TO HAS GAINED SINCE THAT READER LAST LOOKED. Criterion GM4.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS DOOR EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A member that was not @'d is told nothing, and reads what its groups gained when it looks.
 * One @ must not be the only way a member learns what was said. So this lists,
 * for the calling reader, the new messages in every group it belongs to, from the reader's own read
 * point, which is the moment it last read their groups. An agent reads it every time it wakes, which
 * is how a member that was not named still sees the discussion and can join it.
 *
 * THE READ POINT IS THE ONE ALREADY KEPT. `conversation_reads` records one reader's last read of
 * one group under the group's id, the same row `whenTheyLastRead` reads, so there is no second store
 * of the same fact. It is a time and not a mark: everything written after it is new.
 *
 * `move` MOVES THE POINT TO NOW in each group that gained a message or held no point, once the answer has been
 * worked out, so what it returns is exactly what came after the point the reader held and the next read starts from
 * this one. It is asked for by the caller and never done silently: an agent that only wants to look is not made to
 * forget.
 *
 * NOTHING READ MEANS EVERYTHING IS NEW, which is what a reader who has never looked is looking at.
 * Calling that none would be a guess dressed as an answer.
 */
export function whatTheGroupsGained(me: ParticipantRef, which: WhichProjects, move: boolean): WhatAGroupGained[] {
  const readAt = nowStamp()
  // THE FILED ALIASES ARE READ ONCE, for the read points and for every move. Each move read them again before:
  // 923 times in a hand-over for the busiest live reader (wave 13y round 114).
  const aliases = theFiledAliasesReadOnce(sqlite)
  // ONLY THE GROUPS THIS READER IS IN NOW, and only their messages are read. A group the reader is
  // not in is never read here.
  const mine = groupsFor(me, which)
  const reads = whenTheyLastReadThese(
    me,
    mine.map((group) => group.id),
    which,
    aliases,
  )
  // A GROUP WITH A READ POINT IS READ FROM ITS OWN POINT, and a group with none is read whole, so the read is the test
  // that decides what is new. The busiest live reader holds a point in every one of its 923 groups and nothing newer,
  // and read all 3,063 of their messages and their deliveries at every hand-over to keep none of them (wave 13y round
  // 114). Read from the oldest point of all its groups, a group whose point had moved past that one gave its older
  // messages back again (wave 13y round 126).
  const neverRead = mine.filter((group) => !reads.has(group.id)).map((group) => group.id)
  const pool = [
    ...messagesSentToGroups(neverRead, which),
    ...messagesSentToGroups(
      mine.filter((group) => reads.has(group.id)).map((group) => group.id),
      which,
      new Map([...reads].map(([id, one]) => [id, one.at])),
    ),
  ]
  // EACH GROUP'S MESSAGES, in the order the pool holds them, taken apart once and not once for each group.
  const byGroup = new Map<string, PoolEntry[]>()
  for (const one of pool) {
    if (one.toGroup === null) continue
    const held = byGroup.get(one.toGroup)
    if (held === undefined) byGroup.set(one.toGroup, [one])
    else held.push(one)
  }
  const out: WhatAGroupGained[] = mine.map((group) => {
    const before = reads.get(group.id) ?? null
    return {
      group,
      since: before === null ? null : before.at,
      messages: byGroup.get(group.id) ?? [],
    }
  })
  // THE POINTS MOVE AFTER THE ANSWER IS WORKED OUT, so a message that arrived between the read and
  // the move is not claimed as read by a read that did not show it. A POINT MOVES ONLY IN A GROUP THAT GAINED A MESSAGE
  // OR HELD NO POINT (wave 13y round 114). A group with nothing new has nothing unread, so its older point is
  // still true, and the next read of it answers the same. The busiest live reader had nothing new in any of its 923
  // groups, and moved 923 points at every hand-over.
  const moving = move ? mine.filter((group, i) => !reads.has(group.id) || out[i]!.messages.length > 0) : []
  // THEY MOVE IN ONE TRANSACTION, so a move that fails part of the way moves no point. THE PAGES ARE TOLD ONCE IN EACH
  // PROJECT WHERE A POINT MOVED, once all of them are stored: one event for each group filled the event ring, which
  // holds 200 by default, at every hand-over of a reader in 923 groups. A move that moves nothing opens no transaction.
  if (moving.length > 0) {
    sqlite.transaction(() => {
      const told = new Set<string>()
      for (const group of moving) {
        if (moveTheReadPoint(me, group.id, me, group.workspaceId, readAt, aliases).moved) told.add(group.workspaceId)
      }
      for (const workspaceId of told) {
        announce({
          name: 'list.changed',
          workspaceId,
          lists: ['betweenAgents'],
          about: me,
          groupId: null,
          because: `${me.id} read its groups, so what is new in them counts from now.`,
        })
      }
    })()
  }
  return out
}

// ============================================================================ Inject, and its two limits

/**
 * WHY AN INJECT IS REFUSED, or null because it may go.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT INJECT IS AND WHY IT IS BOUNDED AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M84, settling proposal `W3FHvHM-apiL`: a press that happens once, and it must not be
 * abused. An injected
 * message goes in front of everything else waiting for its recipient and, where the runtime allows,
 * reaches a session that is already running. That is worth having for an emergency and worth
 * nothing at all if everything is one.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO LIMITS, AND WHY THEY ARE DIFFERENT
 * ---------------------------------------------------------------------------------------
 *
 * A PERSON MAY INJECT WITHOUT LIMIT. It is their product and their attention being spent. Nothing here
 * asks anything of a person.
 *
 * AN AGENT MAY NOT INJECT A SECOND MESSAGE TO THE SAME PERSON WHILE ITS LAST INJECTED ONE IS
 * UNREAD. That is the person's own wording of the bound, and it is self-correcting: the way to send another
 * emergency is for the first one to have been read, which is the thing an emergency is asking for.
 * It is per sender and per recipient, so one agent shouting does not stop another from reaching the person.
 *
 * AND THE PERSON CAN SWITCH INJECTING OFF FOR EVERY AGENT AT ONCE, on the Settings page. Criterion
 * M91 and the person's decision of 25 September 2026: one switch for all agents, not one per
 * agent. `agentsMayInject` is the one reader of that switch, handed in by the write door, and the
 * refusal takes its sentence about where the switch is from the same reading, so the two cannot
 * name different places. A refused inject says which of the two refusals it met, because the two
 * need different things done about them.
 *
 * IT IS ABOUT A MESSAGE TO A PERSON. An agent injecting to another agent is not asking for anybody's
 * attention: it is asking to be first in that agent's queue, which the queue already bounds.
 */
export function whyThisInjectIsRefused(
  data: Record<string, unknown>,
  sender: ParticipantRef | null,
  agentsMayInject: () => { may: boolean; whereItIsSet: string },
): string | null {
  if (data['urgent'] !== true) return null
  if (sender === null || sender.kind !== 'agent') return null
  const to = data['to']
  if (!Array.isArray(to)) return null
  const people = (to as readonly unknown[])
    .map((one) => refFrom(one))
    .filter((ref): ref is ParticipantRef => ref !== null && ref.kind === 'person')
  if (people.length === 0) return null

  const setting = agentsMayInject()
  if (!setting.may) {
    // THE SENDER IS NAMED BY ITS NAME AND HANDLE ON THE REGISTRY ROW (rule 5 of wave 13b). The write
    // door hands in the registry id `participantForActor` answered, and since the mint (criterion I1)
    // that id is a string nobody chose. Where no row answers it, the sentence says so and keeps it.
    const row = readParticipant(sender) as RegisteredAgent | null
    const who =
      row === null
        ? `The agent "${sender.id}", which no registry row answers to,`
        : `The agent ${row.name} ("${row.handle}")`
    return (
      `${who} may not inject, because the switch that lets agents inject is off. ${setting.whereItIsSet} ` +
      'It is the person\'s setting. Nothing was written. Send it as an ordinary message: it is kept and it is read.'
    )
  }

  for (const person of people) {
    const waiting = anInjectOfTheirsThisPersonHasNotRead(sender, person)
    if (waiting !== null) {
      return (
        `"${sender.id}" already has an injected message to "${person.id}" that has not been read: ${waiting.id}, ` +
        `sent ${waiting.at}. An agent may not inject a second one while its last is unread, so an emergency stays ` +
        'an emergency. Nothing was written. Send it as an ordinary message, which is kept and read in its turn.'
      )
    }
  }
  return null
}

/** The newest injected message from this agent to this person that they have not read, or null. */
function anInjectOfTheirsThisPersonHasNotRead(
  sender: ParticipantRef,
  person: ParticipantRef,
): { id: string; at: string } | null {
  const row = sqlite
    .prepare(
      "SELECT r.id AS id, r.created_at AS at FROM records r " +
        "JOIN message_delivery d ON d.message_id = r.id " +
        "WHERE r.kind = 'message' AND r.deleted_at IS NULL AND json_valid(r.data) " +
        "AND json_extract(r.data, '$.urgent') = 1 " +
        "AND json_extract(r.data, '$.sentBy.kind') = ? AND json_extract(r.data, '$.sentBy.id') = ? " +
        "AND d.recipient_kind = ? AND d.recipient_id = ? AND d.mark != 'seen' " +
        'ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1',
    )
    .get(sender.kind, sender.id, person.kind, person.id) as { id?: unknown; at?: unknown } | undefined
  if (row === undefined || typeof row.id !== 'string') return null
  return { id: row.id, at: String(row.at ?? '') }
}

/**
 * HOW MANY MESSAGES EACH SENDER HAS INJECTED TO ONE PERSON, and how many of those are unread.
 *
 * Criterion M84: *every injected message records who injected it and when, and the recipient's page
 * counts them per sender*.
 *
 * WHO AND WHEN ARE THE MESSAGE'S OWN SENDER AND ITS OWN STAMP. Nothing else is stored for this, and
 * that is deliberate: a second copy of who wrote a message and when is one fact worked out in two
 * places, and the two would drift the first time a message was moved or a sender was renamed.
 *
 * IT IS ORDERED BY HOW MANY, most first, because the question a person opens this to ask is which
 * agent is doing it most.
 */
export function whoHasInjectedTo(person: ParticipantRef): { from: ParticipantRef; count: number; unread: number }[] {
  const rows = sqlite
    .prepare(
      // THE COLUMNS ARE NAMED `sender_kind` AND `sender_id`, not `kind` and `id`. Both of those are
      // real columns on both joined tables, so an alias spelled either way is read as the table's
      // column in the WHERE and the GROUP BY, and the answer is silently about something else.
      "SELECT json_extract(r.data, '$.sentBy.kind') AS sender_kind, " +
        "json_extract(r.data, '$.sentBy.id') AS sender_id, " +
        "COUNT(*) AS many, SUM(CASE WHEN d.mark != 'seen' THEN 1 ELSE 0 END) AS unread " +
        'FROM records r JOIN message_delivery d ON d.message_id = r.id ' +
        "WHERE r.kind = 'message' AND r.deleted_at IS NULL AND json_valid(r.data) " +
        "AND json_extract(r.data, '$.urgent') = 1 " +
        'AND d.recipient_kind = ? AND d.recipient_id = ? ' +
        'AND sender_kind IS NOT NULL AND sender_id IS NOT NULL ' +
        'GROUP BY sender_kind, sender_id ORDER BY many DESC, sender_id ASC',
    )
    .all(person.kind, person.id) as {
    sender_kind?: unknown
    sender_id?: unknown
    many?: unknown
    unread?: unknown
  }[]
  return rows
    .filter((row) => typeof row.sender_kind === 'string' && typeof row.sender_id === 'string')
    .map((row) => ({
      from: { kind: String(row.sender_kind) as ParticipantRef['kind'], id: String(row.sender_id) },
      count: Number(row.many ?? 0),
      unread: Number(row.unread ?? 0),
    }))
}
