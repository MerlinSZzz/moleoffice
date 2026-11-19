// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT HAS BEEN SAID, IN THREE DIRECTIONS, AND HOW FAR EACH ONE ACTUALLY GETS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * The owner's brief, section 22, asks for a compact count of what has been said between a person
 * and an agent, an agent and a person, and one agent and another — with the states that are useful
 * to the owner: queued, unread, handled, and failed or needing attention. And two instructions on top of
 * it: *"Do not flood Home with every message"* and *"Summarize meaning first."*
 *
 * ---------------------------------------------------------------------------------------
 * A COUNT WITHOUT "HOW FAR IT GETS" IS A NUMBER THAT MISLEADS
 * ---------------------------------------------------------------------------------------
 *
 * Every direction in this product has machinery. Not one of them has been measured going all the
 * way. Human to agent reaches a queued run that no worker has ever claimed. Agent to human has two
 * separate mechanisms and only one of them has ever carried anything. Agent to agent cannot be
 * started from a browser at all, and the sender's durable identity is written by nothing — so a
 * count of zero there says almost nothing about whether anybody has tried.
 *
 * **So every direction carries `howFar` beside its counts.** Drawing `0` for a direction whose door
 * does not exist, next to `0` for a direction that works and nobody used, is two different facts
 * under one number, which is this repository's recurring defect said in arithmetic.
 *
 * ---------------------------------------------------------------------------------------
 * MEANING FIRST, AND THE MEANING IS NOT THE DIRECTIONS
 * ---------------------------------------------------------------------------------------
 *
 * `summary` below is what a person needs first and it is about objects they recognise: comments
 * they wrote, reviews they started, conversations they opened. The direction counts are underneath
 * it, because a number about a mechanism means nothing until you know what is sitting in it.
 *
 * ---------------------------------------------------------------------------------------
 * IT WRITES NOTHING AND IT COUNTS RATHER THAN LISTS
 * ---------------------------------------------------------------------------------------
 *
 * No row of any message body reaches this reply. The one place a body could be wanted is the
 * conversation itself, which has its own page.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { nowStamp } from '@shared/time.ts'
import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { commentRecordsIn } from './messages.ts'
import { messagesInTheViewOf } from './message-centre.ts'
import { agentMessages, agentRuns, agentThreads, records, reviews } from '../db/schema.ts'
import { commentsGoneOut } from './dispatch.ts'
import { justThisProject } from '@shared/which-projects.ts'
import { readFrozen, UNREADABLE } from './frozen-membership.ts'
import { agentsIn } from './inbox.ts'

// ============================================================================ how far it gets

/**
 * HOW FAR ONE DIRECTION ACTUALLY GETS TODAY. Three words, and each one is measured.
 *
 * `completes`   Something has gone the whole way at least once, and the count says how many.
 * `stops-short` The route exists and the door exists, and nothing has ever arrived at the far end.
 *               Where it stops is named in the mechanism's own sentence.
 * `no-door`     A person cannot start one at all from anything Mole Office draws. A count here is a
 *               count of a thing nobody can do, so the number is published with that word beside it
 *               and never alone.
 */
export const HOW_FAR = ['completes', 'stops-short', 'no-door'] as const

/** How far one direction or one mechanism gets. */
export type HowFar = (typeof HOW_FAR)[number]

/** What each of the three words means, in the sentence a person reads. */
export const HOW_FAR_SAYS: Readonly<Record<HowFar, string>> = {
  completes: 'Something has gone all the way in this direction.',
  'stops-short': 'The way is built and nothing has ever arrived at the far end.',
  'no-door': 'There is nothing on any screen that starts one of these.',
}

// ============================================================================ the states

/**
 * THE FOUR STATES THE OWNER'S SCREEN SHOWS, AND WHAT EACH ONE IS OVER THE STORE.
 *
 * They are not the message store's own six words. `MESSAGE_STATES` in `dispatch.ts` holds
 * `queued sent delivered picked_up handled failed`, of which `delivered` and `picked_up` are
 * written by nothing — measured, in the recovery pass, and still true. Publishing six words when
 * two of them can never appear would put two permanent zeroes on the owner's screen and teach the owner
 * a vocabulary the product does not use.
 *
 * `needsAttention` is not a stored word at all. It is a fact about the recipient: nobody was chosen,
 * or the choice cannot be resolved to anything that could receive it. `dispatch.ts` computes the
 * same fact as `delivery.canSend: false`.
 */
export interface SaidCounts {
  /** Written and not sent. Still editable, still removable, and nobody has it. */
  queued: number
  /** Gone, and nothing has come back. This state is called "waiting". */
  waiting: number
  /** Something answered it. */
  handled: number
  /** It failed, and the failure is recorded. */
  failed: number
  /** Nobody was chosen, or the choice resolves to nothing. It cannot be sent as it stands. */
  needsAttention: number
  /** Written by an agent for a person and not yet marked read. Only the message board has this. */
  unread: number
}

const NO_COUNTS: SaidCounts = { queued: 0, waiting: 0, handled: 0, failed: 0, needsAttention: 0, unread: 0 }

// ============================================================================ shapes

/** One way of saying something in one direction: what carries it, and how far it gets. */
export interface Mechanism {
  /** What a person would call it. */
  what: string
  howFar: HowFar
  counts: SaidCounts
  /** Where it stops, or what it did, in one plain sentence. */
  says: string
}

/** One of the three directions. */
export interface Direction {
  key: 'human-to-agent' | 'agent-to-human' | 'agent-to-agent'
  /** What a person reads. Never the key. */
  word: string
  /** The best any of its mechanisms manages. */
  howFar: HowFar
  /** The mechanisms summed. */
  counts: SaidCounts
  mechanisms: Mechanism[]
}

/** The objects a person recognises, counted, so the meaning comes before the mechanism. */
export interface SaidSummary {
  /** Comments written in this project, whatever has become of them. */
  commentsWritten: number
  /** Of those, how many have gone to somebody. */
  commentsGone: number
  /** Of those, how many a review has written down as one of its members. */
  commentsInAReview: number
  /** Written, never sent, and in no review's membership. The ones sitting where nobody sees them. */
  commentsInNothing: number
  /** Reviews in this project, by state, in `REVIEW_STATES` order. */
  reviews: { state: string; count: number }[]
  /** A review that was collected and never sent, oldest first. The one shape that strands words. */
  collectedNeverSent: { id: string; collectedAt: string | null }[]
  /** Conversations with an agent, by state. */
  conversations: { state: string; count: number }[]
  /** Runs made by a dispatch, by state. */
  runs: { state: string; count: number }[]
  /** True when no worker has ever claimed a run on this installation. */
  nobodyHasEverClaimedARun: boolean
  /** Durable agents recorded in this project. Zero means nothing can be addressed by name. */
  agents: number
}

/** What `GET /api/communication` answers. */
export interface WhatHasBeenSaid {
  workspaceId: string
  computedAt: string
  summary: SaidSummary
  directions: Direction[]
  /** The whole reading in one paragraph, meaning first. The page prints this rather than rebuilding it. */
  note: string
}

// ============================================================================ counting

/** The best of a set of `howFar` words, best first. */
function bestOf(words: readonly HowFar[]): HowFar {
  if (words.includes('completes')) return 'completes'
  if (words.includes('stops-short')) return 'stops-short'
  return 'no-door'
}

/** Two count blocks added together. */
function plus(a: SaidCounts, b: SaidCounts): SaidCounts {
  return {
    queued: a.queued + b.queued,
    waiting: a.waiting + b.waiting,
    handled: a.handled + b.handled,
    failed: a.failed + b.failed,
    needsAttention: a.needsAttention + b.needsAttention,
    unread: a.unread + b.unread,
  }
}

/** One row of the message store, as the counting needs it. */
interface StoredMessage {
  state: string
  role: string
  recipientKind: string | null
  recipientAgentId: string | null
  recipientSessionId: string | null
}

/** Every message in one project's conversations. A handful of rows; no index wanted. */
function messagesIn(workspaceId: string): StoredMessage[] {
  return db
    .select({
      state: agentMessages.state,
      role: agentMessages.role,
      recipientKind: agentMessages.recipientKind,
      recipientAgentId: agentMessages.recipientAgentId,
      recipientSessionId: agentMessages.recipientSessionId,
    })
    .from(agentMessages)
    .innerJoin(agentThreads, eq(agentMessages.threadId, agentThreads.id))
    .where(eq(agentThreads.workspaceId, workspaceId))
    .all()
}

/**
 * ONE SET OF MESSAGES, COUNTED INTO THE FOUR STATES.
 *
 * `waiting` is the three words `dispatch.ts` calls WAITING_WORDS, read from that file rather than
 * listed again here. `delivered` and `picked_up` are written by nothing today, so folding them into
 * `waiting` costs a reader nothing and keeps this correct on the day something writes one.
 */
function countMessages(rows: readonly StoredMessage[]): SaidCounts {
  let queued = 0
  let waiting = 0
  let handled = 0
  let failed = 0
  let needsAttention = 0
  for (const row of rows) {
    if (row.state === 'queued') queued += 1
    else if (row.state === 'handled') handled += 1
    else if (row.state === 'failed') failed += 1
    else waiting += 1
    // NOBODY WAS CHOSEN, OR THE CHOICE NAMES NOTHING THAT CAN RECEIVE. It is computed over the
    // recipient columns rather than stored, exactly as the dispatch reading computes `canSend`.
    const unaddressed =
      row.recipientKind === null ||
      row.recipientKind === 'unresolved' ||
      (row.recipientKind === 'agent' && (row.recipientAgentId === null || row.recipientAgentId === '')) ||
      (row.recipientKind === 'session' && (row.recipientSessionId === null || row.recipientSessionId === ''))
    if (unaddressed) needsAttention += 1
  }
  return { queued, waiting, handled, failed, needsAttention, unread: 0 }
}

/** The message board: `message` records, which are what an agent writes for a person to read. */
function messageBoardIn(workspaceId: string): { total: number; unread: number; neverSaid: number } {
  const rows = db
    .select({ data: records.data })
    .from(records)
    // THIS PROJECT'S VIEW OF THE MESSAGE CENTRE.
    .where(and(messagesInTheViewOf(justThisProject(workspaceId)), eq(records.kind, 'message'), isNull(records.deletedAt)))
    .all()
  let unread = 0
  let neverSaid = 0
  for (const row of rows) {
    const data = row.data as Record<string, unknown>
    const read = data['read']
    if (read === false) unread += 1
    // A RECORD WITH NO `read` KEY IS NOT AN UNREAD ONE AND IS NOT A READ ONE. Nobody has said, and
    // guessing either way would either invent an alarm or hide one.
    else if (read !== true) neverSaid += 1
  }
  return { total: rows.length, unread, neverSaid }
}

// ============================================================================ the projection

/**
 * WHAT HAS BEEN SAID IN ONE PROJECT.
 *
 * Computed at read and stored nowhere. Nothing here writes and nothing here is cached.
 */
export function whatHasBeenSaid(workspaceId: string): WhatHasBeenSaid {
  const messages = messagesIn(workspaceId)
  const board = messageBoardIn(workspaceId)
  const agents = agentsIn(workspaceId).length

  // -------------------------------------------------------------- the meaning, before the mechanism

  // BOTH KINDS OF COMMENT. A record of kind `annotation` is every comment written before comments
  // and messages became one thing; a message with a target is every comment written since. Counting
  // only the first would report a falling number as comments moved to the other kind.
  const commentRows = commentRecordsIn(workspaceId).map((record) => ({ id: record.id }))
  const gone = new Set(commentsGoneOut(justThisProject(workspaceId)))
  const reviewRows = db.select().from(reviews).where(eq(reviews.workspaceId, workspaceId)).all()
  const inAReview = new Set<string>()
  for (const row of reviewRows) {
    const frozen = readFrozen(row.frozen)
    // A MEMBERSHIP MOLE OFFICE CANNOT READ IS NOT AN EMPTY ONE. It contributes no comment, which is the
    // honest answer, and repairing it is not this reading's business.
    if (frozen === null || frozen === UNREADABLE) continue
    for (const member of frozen.members) inAReview.add(member.id)
  }
  const inNothing = commentRows.filter((one) => !gone.has(one.id) && !inAReview.has(one.id)).length

  const byReviewState = new Map<string, number>()
  for (const row of reviewRows) byReviewState.set(row.state, (byReviewState.get(row.state) ?? 0) + 1)
  const collectedNeverSent = reviewRows
    .filter((row) => row.sentAt === null && row.collectedAt !== null && row.state !== 'abandoned')
    .map((row) => ({ id: row.id, collectedAt: row.collectedAt }))
    .sort((a, b) => (a.collectedAt ?? '').localeCompare(b.collectedAt ?? ''))

  const threadRows = db
    .select({ id: agentThreads.id, state: agentThreads.state })
    .from(agentThreads)
    .where(eq(agentThreads.workspaceId, workspaceId))
    .all()
  const byThreadState = new Map<string, number>()
  for (const row of threadRows) byThreadState.set(row.state, (byThreadState.get(row.state) ?? 0) + 1)

  // IN PIECES (src/server/db/in-pieces.ts): every thread the project ever had. The rows are only counted.
  const runRows = readInPieces(
    threadRows.map((one) => one.id),
    (piece) => db.select({ state: agentRuns.state, claimedBy: agentRuns.claimedBy }).from(agentRuns).where(inArray(agentRuns.threadId, piece)).all(),
  )
  const byRunState = new Map<string, number>()
  for (const row of runRows) byRunState.set(row.state, (byRunState.get(row.state) ?? 0) + 1)
  // ASKED OF THE WHOLE INSTALLATION AND NOT OF THIS PROJECT, because a worker serves a machine
  // rather than a project — the three run routes take no project header at all. "No worker has ever
  // claimed a run in this project" would be a much weaker sentence than the one that is true.
  const everClaimed =
    db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(sql`${agentRuns.claimedBy} IS NOT NULL AND ${agentRuns.claimedBy} <> ''`)
      .limit(1)
      .get() !== undefined

  const summary: SaidSummary = {
    commentsWritten: commentRows.length,
    commentsGone: commentRows.filter((one) => gone.has(one.id)).length,
    commentsInAReview: commentRows.filter((one) => inAReview.has(one.id)).length,
    commentsInNothing: inNothing,
    reviews: [...byReviewState].map(([state, count]) => ({ state, count })),
    collectedNeverSent,
    conversations: [...byThreadState].map(([state, count]) => ({ state, count })),
    runs: [...byRunState].map(([state, count]) => ({ state, count })),
    nobodyHasEverClaimedARun: !everClaimed,
    agents,
  }

  // ------------------------------------------------------------------------------ the directions

  const fromPeople = messages.filter((one) => one.role === 'human')
  const fromAgents = messages.filter((one) => one.role === 'agent')
  const agentToAgent = fromAgents.filter((one) => one.recipientKind === 'agent')
  const agentToPerson = fromAgents.filter((one) => one.recipientKind !== 'agent')

  const humanToAgentHandled = countMessages(fromPeople).handled
  const humanToAgent: Direction = {
    key: 'human-to-agent',
    word: 'You to an agent',
    howFar: humanToAgentHandled > 0 ? 'completes' : 'stops-short',
    counts: countMessages(fromPeople),
    mechanisms: [
      {
        what: 'A comment sent to an agent',
        howFar: humanToAgentHandled > 0 ? 'completes' : 'stops-short',
        counts: countMessages(fromPeople),
        says:
          humanToAgentHandled > 0
            ? `${String(humanToAgentHandled)} of what you have sent has been answered.`
            : 'Sending writes a queued run and stops. Delivery from there needs a worker to pick the run up, and ' +
              (summary.nobodyHasEverClaimedARun
                ? 'no worker has ever claimed one on this machine.'
                : 'nothing has claimed this project’s.'),
      },
    ],
  }

  const runAnswers = countMessages(agentToPerson)
  const agentToHuman: Direction = {
    key: 'agent-to-human',
    word: 'An agent to you',
    howFar: bestOf([
      agentToPerson.length > 0 ? 'completes' : 'stops-short',
      board.total > 0 ? 'completes' : 'stops-short',
    ]),
    counts: plus(runAnswers, { ...NO_COUNTS, unread: board.unread }),
    mechanisms: [
      {
        what: 'An answer to something you sent',
        howFar: agentToPerson.length > 0 ? 'completes' : 'stops-short',
        counts: runAnswers,
        says:
          agentToPerson.length > 0
            ? `${String(agentToPerson.length)} answer${agentToPerson.length === 1 ? ' has' : 's have'} come back into a conversation.`
            : 'An answer becomes a message in the conversation when a run finishes. No run has ever finished, so ' +
              'nothing has come back this way.',
      },
      {
        what: 'A note an agent left for you',
        howFar: board.total > 0 ? 'completes' : 'stops-short',
        counts: { ...NO_COUNTS, unread: board.unread },
        says:
          board.total === 0
            ? 'No agent has left a note in this project.'
            : `${String(board.total)} note${board.total === 1 ? '' : 's'} an agent wrote for you, ` +
              `${String(board.unread)} still unread` +
              (board.neverSaid === 0
                ? '.'
                : `, and ${String(board.neverSaid)} that nobody has said either way about.`),
      },
    ],
  }

  const agentToAgentDirection: Direction = {
    key: 'agent-to-agent',
    word: 'One agent to another',
    // NO DOOR, AND THE ZERO IS PUBLISHED WITH THAT WORD RATHER THAN ALONE. Two separate facts hold
    // it shut and both are measured: the composer types a recipient as a run or a new run and has
    // no arm for a durable agent, and `agent_messages.written_by_agent_id` is written `null` by both
    // of the two functions that insert a row — so even a message that got through would not record
    // which agent sent it. A bare `0` beside the other two would read as "they have not needed to".
    howFar: 'no-door',
    counts: countMessages(agentToAgent),
    mechanisms: [
      {
        what: 'A message addressed to another agent',
        howFar: 'no-door',
        counts: countMessages(agentToAgent),
        says:
          agents === 0
            ? 'There is nobody to address: no durable agent has been recorded in this project. Nothing on any ' +
              'screen offers another agent as a recipient, and the sender’s own identity is stored by nothing, ' +
              'so this count cannot rise however much two agents talk.'
            : 'Nothing on any screen offers another agent as a recipient, and the sender’s own identity is ' +
              'stored by nothing, so this count cannot rise however much two agents talk.',
      },
    ],
  }

  const directions = [humanToAgent, agentToHuman, agentToAgentDirection]
  return {
    workspaceId,
    computedAt: nowStamp(),
    summary,
    directions,
    note: noteFor(summary, board),
  }
}

/**
 * THE WHOLE READING IN ONE PARAGRAPH, MEANING FIRST.
 *
 * The page prints this rather than assembling its own sentence from the counts. Two places working
 * out one sentence is how a screen comes to disagree with the reply it is drawn from.
 */
export function noteFor(summary: SaidSummary, board: { total: number; unread: number }): string {
  const parts: string[] = []
  // TAKEN OFF AS A SMALL BOOKKEEPING LINE. This function used to open with one sentence
  // about the COMMENTS on their own: how many, whether each went somewhere, or, for one,
  // "2 comments are written, unsent, and in no review." That is a small bookkeeping line
  // a normal reader never needs, and home drew it under
  // "What has been said". The band's own count rows below still say what is sitting where, so the
  // facts behind the sentence are still one press away; the sentence itself is gone.
  const stranded = summary.collectedNeverSent[0]
  if (stranded !== undefined) {
    parts.push(
      `One review was collected${stranded.collectedAt === null ? '' : ` on ${stranded.collectedAt.slice(0, 10)}`} and has never been sent.`,
    )
  }
  const dispatched = summary.conversations.find((one) => one.state === 'dispatched')?.count ?? 0
  const queuedRuns = summary.runs.find((one) => one.state === 'queued')?.count ?? 0
  if (dispatched > 0) {
    parts.push(
      `${String(dispatched)} conversation${dispatched === 1 ? ' has' : 's have'} been sent.` +
        (queuedRuns > 0
          ? ` ${String(queuedRuns)} run${queuedRuns === 1 ? '' : 's'} ${queuedRuns === 1 ? 'is' : 'are'} still queued and ` +
            (summary.nobodyHasEverClaimedARun ? 'no worker has ever claimed one on this machine.' : 'nothing has claimed them.')
          : ''),
    )
  }
  if (board.unread > 0) {
    parts.push(`${String(board.unread)} note${board.unread === 1 ? '' : 's'} an agent left for you ${board.unread === 1 ? 'is' : 'are'} unread.`)
  }
  if (parts.length === 0) parts.push('Nothing has been said in this project yet.')
  return parts.join(' ')
}
