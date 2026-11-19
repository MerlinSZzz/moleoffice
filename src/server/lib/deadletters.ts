// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DEAD LETTERS: A MESSAGE THAT REACHES NOBODY, WHAT THE OFFICE DOES WITH IT, AND A CLAIM.
 *
 * Criterion M111 of design/messages/ACCEPTANCE.md, in the section "The retire rule and dead
 * letters": a message nobody receives is a wild message. Wild messages are kept as dead letters,
 * and after a time (for example a week) or a count (for example more than ten) they are broadcast
 * to every secretary, a group is opened, and each secretary claims its own.
 *
 * Settled by the secretary on 11 September 2026: the notice names a group and a count; the group holds the
 * list; a claim is per addressee (the agent the letters were for), not per letter; the first sweep
 * after the build covered the backlog as one group.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED ON 2 OCTOBER 2026 (problem 0WUuvB0IhRfb)
 * ---------------------------------------------------------------------------------------
 *
 * The sweep wrote one line per addressee, and every line woke every secretary: 230 lines and 1,114
 * agent deliveries. In principle the message centre should collect and handle these dead letters
 * itself. The secretary's answers I24sT059xQlk and
 * UEmOvQ6-ptyJ settle how, and this file now does it:
 *
 *   - ONE LINE PER SWEEP, delivered only to the secretary the person named to take the dead letters
 *     (lib/dead-letter-secretary.ts), and to nobody when nobody is named. The counts are in its full
 *     sentence. It is never delivered to every secretary.
 *   - A RETIRED ADDRESSEE'S QUEUED LETTERS are handled by the office: a notice is archived, and a
 *     person's or agent's letter follows the recorded ownership chain. When the chain cannot supply
 *     a recipient, the original remains queued and addressed to the agent.
 *   - A GREY ADDRESSEE THAT IS NOT RETIRED keeps the threshold and the claims below, unchanged.
 *   - ONE MESSAGE PER RECEIVER PER SWEEP (problem wN3CEhHxRKO3). Rule (b) routes an agent's letter by storing its
 *     routed entry on the letter, with no delivery row for the receiver. Each receiver is sent one message that
 *     lists its letters (`tellTheReceiverOnce`). The stored entry keeps the letter from being routed again, after
 *     a restart too.
 *
 * ---------------------------------------------------------------------------------------
 * A DEAD LETTER IS NOT A SECOND STORE OF MESSAGES
 * ---------------------------------------------------------------------------------------
 *
 * A dead letter is a `message_delivery` row already: `mark = 'queued'`, `recipientKind = 'agent'`,
 * whose recipient the office's own presence reading (`participantPresence` in lib/presence.ts — the
 * one measurement M110's send door asks too, asked here directly and NOT behind that door's
 * setting, for the reason written at `deadLettersNow`) says cannot receive it. `at` on that row is
 * already "when", and the recipient is already "to whom" (the person's words: kept as a dead letter
 * with when and to whom). A running session record or output within the session idle window keeps the
 * addressee out of this classification (problem CcD2zS8LYfER). It stores nothing about a letter.
 *
 * `dead_letter_claims` (migration 0160) is the one new table, and it holds one fact only: which
 * ADDRESSEE has been named in a sweep's line, and by whom it was claimed. One row per addressee, ever
 * — never one per letter, exactly as the person's words, settled by the secretary, ask.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS READ GLOBALLY, ACROSS EVERY PROJECT, AND NOT PER WORKSPACE
 * ---------------------------------------------------------------------------------------
 *
 * `agents` is an installation-wide registry, not a per-project one — the same fact
 * `NO_PROJECT_BECAUSE_IT_IS_THE_WHOLE_INSTALLATION` in db/why-no-project.ts states for it — and
 * `message_delivery` carries no project column at all. `theQueue` in lib/worker.ts already reads
 * every queued delivery with no workspace filter before narrowing to one project's messages; this
 * reads the same way, for the same reason: a wild message is wild whichever project queued it.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { onlyTheseFieldsOf } from '../db/only-these-fields-of.ts'
import { ONE_KIND_WRITTEN_OUT, STORED_FIELDS, agents, deadLetterClaims, messageDelivery, records, theKindOfARowFoundById } from '../db/schema.ts'
import { localStamp, nowStamp, parseAnyStamp } from '@shared/time.ts'
import { moleOffice, isMoleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import {
  pastTheThreshold,
  theDeadLetterSummaryInWords,
  whyTheSweepLineWentToNobody,
  type ASummarisedAddressee,
  type TheDeadLetterSummarySaid,
} from '@shared/dead-letter-lines.ts'
import { SYSTEM_LINES, SYSTEM_LINE_TITLE, type ANameAndACount, type TheDeadLetterSweepSaid, type WhyTheSweepLineWentToNobody } from '@shared/groups.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import {
  anEndingASummaryMayTell,
  BROKEN_OWNERS_ROUTING_ENDING, PERSON_OWNER_ROUTING_ENDING,
  NO_REACHABLE_OWNER_ENDING,
  OWNERLESS_ROUTING_ENDING,
  participantKey,
  routedOf,
  sameParticipant,
  theRoutedLine,
  writtenInOf,
  type RoutedAddressee,
  type TheOwnerEnding,
} from '@shared/messages.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { actsRefusedTo, everyActNamed } from '@shared/roles.ts'
import { participantPresence, thePresenceReadingsOf, theUnreleasedProcessRowsOnce, type OneProjectsPresenceReadings } from './presence.ts'
import { handleOf } from './groups.ts'
import { syncTheSecretariatGroup } from './secretariat.ts'
import { type RegisteredAgent } from './participants.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { deadLetterAfterCount, deadLetterAfterDays } from './env.ts'
import { theRoleCards } from './roles.ts'
import { THE_DEAD_LETTER_SWEEP, createRecord, patchRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { archiveDeliveries, type ADeliveryToArchive } from './messages.ts'
import { theReadingsForOneSend, theRoutingOfOneAddressee, type TheReadingsForOneSend } from './superiors.ts'
import { theNameOf } from '@shared/participant-name.ts'
import { theDeadLetterSecretary } from './dead-letter-secretary.ts'
import { aDeadLetterKey } from './dead-letter-key.ts'
import { IDLE_AFTER_SECONDS } from './adapters/index.ts'
import { ranAsIn } from '@shared/ran-as.ts'
import { runServing, runningRunRowsIn, theRunningRowsByTheAgentTheyServe, theRunRowsAnyReachReads } from './worker.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { aCheckpointRun } from '../../shared/worker-delivery/contract.mjs'
import { hasCheckpointBoundary, newCheckpointLetters } from './worker-delivery/letters.ts'
import { named } from './named-timers.ts'
import { theAgentsWhoClaimDeadLetters } from './the-agents-who-claim-dead-letters.ts'
import { theDeadLetterActInWords } from './the-dead-letter-act-in-words.ts'

/** The sender one stored message row says wrote it, or null. The same shape lib/worker.ts reads. */
function senderOf(data: unknown): ParticipantRef | null {
  if (typeof data !== 'object' || data === null) return null
  const said = (data as Record<string, unknown>)['sentBy']
  if (typeof said !== 'object' || said === null) return null
  const kind = (said as { kind?: unknown }).kind
  const id = (said as { id?: unknown }).id
  if ((kind !== 'person' && kind !== 'agent') || typeof id !== 'string' || id === '') return null
  return { kind, id }
}

/** One queued message that cannot reach its recipient right now. */
export interface DeadLetter {
  messageId: string
  workspaceId: string
  to: ParticipantRef
  /** When the message was queued. The person's words: kept as a dead letter with when and to whom. */
  at: string
  /** Why it cannot be received, in the office's own words (from `participantPresence`). */
  because: string
}

/** Runs may read between turns without holding a handle (problem CcD2zS8LYfER). */
function agentsWhoseRunsMayRead(now: Date): Set<string> {
  const protectedAgents = new Set<string>()
  // FIRST THE TWO FIELDS THE TEST READS, FOR EVERY RUN, AND THEN THE FEW RUNS IT KEEPS, WHOLE. SQLite hands back the
  // state and the output stamp, each only when it is text, as the test below reads them; the rest of each record stays
  // where it is. Reading every session record whole was 71 ms of each sweep on a copy at the live counts (wave 13y
  // round 16), and each run the sweep keeps is read whole as before.
  const recentOrRunning = sqlite
    .prepare(
      "SELECT id, CASE WHEN json_type(data, '$.state') = 'text' THEN json_extract(data, '$.state') END AS state, " +
        "CASE WHEN json_type(data, '$.lastOutputAt') = 'text' THEN json_extract(data, '$.lastOutputAt') END AS output " +
        "FROM records WHERE kind = 'session' AND deleted_at IS NULL",
    )
    .all() as { id: string; state: string | null; output: string | null }[]
  const kept = recentOrRunning.filter((one) => {
    const at = one.output === null ? null : parseAnyStamp(one.output)
    const recent = at !== null && now.getTime() - at.getTime() >= 0 && now.getTime() - at.getTime() < IDLE_AFTER_SECONDS * 1000
    return one.state === 'running' || recent
  })
  // IN PIECES (src/server/db/in-pieces.ts): every run that still says it is running is kept, and nothing caps how many
  // do. Each session only adds to a set, so the order of the pieces does not matter.
  const sessions = readInPieces(kept.map((one) => one.id), (piece) =>
    db.select({ data: records.data, workspaceId: records.workspaceId }).from(records)
      .where(and(inArray(records.id, piece), theKindOfARowFoundById('session'), isNull(records.deletedAt))).all(),
  )
  // ONE READING OF EACH PROJECT'S RUNNING RUNS, handed to `runServing` for every checkpoint run kept in it. Asked with
  // none, `runServing` read them again for each such run. A profile of the live office on 12 November 2026 put 2.7 of the
  // 5.5 seconds `deadLettersNow` took there, and on a made-up office shaped like it one sweep read them 458 times, 210,609
  // rows in 2.5 seconds. Nothing is written between the readings, so each run is asked about the same rows as before.
  //
  // BY THE AGENT EACH RUN SERVES, worked out once for each project, and `runServing` is handed the agent's own rows.
  // Handed every running run of the project, it asked of each row which agent the row serves, one statement a row. On
  // that made-up office `deadLettersNow` ran that statement 211,702 times, and a profiled sweep spent 514 ms in the
  // question. Only a row of this agent's can be the answer, so its own rows, in the same order, give the same answer as
  // all of them (`runningRows` in lib/worker.ts says the same).
  const running = new Map<string, ReturnType<typeof theRunningRowsByTheAgentTheyServe>>()
  const theRunningRunsOf = (workspaceId: string, agentId: string) => {
    let held = running.get(workspaceId)
    if (held === undefined) running.set(workspaceId, (held = theRunningRowsByTheAgentTheyServe(runningRunRowsIn(workspaceId))))
    return held.get(agentId) ?? []
  }
  // ONE ANSWER FOR EACH PROJECT AND AGENT. Every checkpoint run of one agent in one project asks `runServing` the same
  // question about the same rows, and each asking read the process of every one of those runs again
  // (`theLastToolRunStillRuns`). On that made-up office 458 checkpoint runs served 206 agents, counted project by project,
  // and a sweep read the process rows of a run 1,072 times, 363 ms. Before, the agent was kept when any of the askings
  // found a live process. Now there is one asking, and it reads each run's process once. The two differ only for a
  // process that ends in the few milliseconds between two askings.
  const served = new Map<string, boolean>()
  const aRunServes = (workspaceId: string, agentId: string): boolean => {
    const key = JSON.stringify([workspaceId, agentId])
    let held = served.get(key)
    if (held === undefined) served.set(key, (held = runServing(agentId, workspaceId, theRunningRunsOf(workspaceId, agentId)) !== null))
    return held
  }
  for (const session of sessions) {
    const serving = theAgentARunServes(session.data)
    if (aCheckpointRun(session.data)) {
      if (serving !== null && aRunServes(session.workspaceId, serving.id)) protectedAgents.add(serving.id)
      continue
    }
    if (serving !== null) protectedAgents.add(serving.id)
    const ranAs = ranAsIn(session, session.workspaceId)
    const attached = ranAs === null ? null : theOneAgentAStringNames(sqlite, ranAs)
    if (attached !== null) protectedAgents.add(attached.id)
  }
  return protectedAgents
}

/**
 * EVERY DEAD LETTER RIGHT NOW, across every project. Read live, never stored.
 *
 * The same shape of reading `theQueue` already does — every queued, agent-addressed delivery row,
 * joined back to the message record for its project — narrowed to the ones the office's own
 * presence reading says cannot be received, unless its agent has a running or recently speaking
 * session record. A row whose message record is gone (deleted) answers no
 * question about presence and is left out: absence beats a guess.
 */
export function deadLettersNow(now: Date = new Date(), protectedRuns: () => Set<string> = () => agentsWhoseRunsMayRead(now)): DeadLetter[] {
  const queued = db
    .select()
    .from(messageDelivery)
    .where(and(eq(messageDelivery.mark, 'queued'), eq(messageDelivery.recipientKind, 'agent')))
    .all()
  if (queued.length === 0) return []
  const protectedAgents = protectedRuns()
  // IN PIECES (src/server/db/in-pieces.ts): every queued letter to an agent names its message here, and a backlog has
  // no cap. The rows go into maps by id, so the order of the pieces does not matter. THE KIND IS ASKED WITHOUT ITS INDEX
  // here, in the read of letters to retired agents and in the read of runs above: asked with `eq`, each piece walked
  // every record of the kind, and the three were 683 MB of the 841 MB one sweep read on a copy at the live counts (wave
  // 13y round 34).
  // The decision below reads only the sender and routing, not the message's body or other stored fields.
  const rows = readInPieces(queued.map((one) => one.messageId), (piece) =>
    db
      .select({ id: records.id, workspaceId: records.workspaceId, data: onlyTheseFieldsOf(['sentBy', 'routed']), createdAt: records.createdAt })
      .from(records)
      .where(and(inArray(records.id, piece), theKindOfARowFoundById('message'), isNull(records.deletedAt)))
      .all(),
  ).map((row) => ({ ...row, data: JSON.parse(row.data) as unknown }))
  const ofMessage = new Map(rows.map((row) => [row.id, row]))
  const workspaceOf = new Map(rows.map((row) => [row.id, row.workspaceId]))
  // ONE READING PER (PROJECT, AGENT) PAIR IN THIS CALL, cached, for the reason `theQueue` caches
  // what it reads once per pass rather than once per row: many dead letters share one addressee.
  const cache = new Map<string, string | null>()
  // ONE READING OF EACH PROJECT'S SESSION ROWS, MACHINE, WAITING RUNS AND AGENT RECORDS, shared by every addressee asked
  // about in it, and one reading of the process rows for all of them: what the roster hands down (`everybodysPresence`).
  // Measured 10 October 2026 on a copy at the live counts (round 16): asked one addressee at a time, each reading read
  // every session row of its project again, and one sweep held the server for 4.1 s every five minutes.
  const processes = theUnreleasedProcessRowsOnce()
  const readings = new Map<string, OneProjectsPresenceReadings>()
  const readingsOf = (workspaceId: string): OneProjectsPresenceReadings => {
    let held = readings.get(workspaceId)
    if (held === undefined) readings.set(workspaceId, (held = thePresenceReadingsOf(workspaceId, processes)))
    return held
  }
  const out: DeadLetter[] = []
  for (const row of queued) {
    if (protectedAgents.has(row.recipientId)) continue
    const workspaceId = workspaceOf.get(row.messageId)
    if (workspaceId === undefined) continue
    // THE OFFICE'S OWN LINES ARE NEVER WILD MAIL. A line the office wrote is delivered by the
    // needs-no-run door without a run (criterion M105), and a message from the office is the
    // office's — its sweep line, its reminder. Without this the sweep would count its own lines as
    // dead letters the moment a secretary's dot was not green, and feed itself. An office notice to
    // a RETIRED addressee is not left queued for ever: rule (a) in `whatTheSweepDoesWithALetter`
    // archives it.
    const message = ofMessage.get(row.messageId)
    if (message === undefined) continue
    const sentBy = senderOf(message.data)
    if (sentBy !== null && isMoleOffice(sentBy)) continue
    // A MESSAGE THE OFFICE ALREADY ROUTED IS NOT ALSO A WILD LETTER, by a decision.
    // When an addressee could not be reached, the office also gave the words to the first reachable
    // participant up its chain of starters, so the letter has a home and the secretaries are not
    // asked to take the same letter too. A routed entry with no `to` (the sender was chosen) made no
    // copy, so it does not skip anything here: nothing reached anybody. The test is on the MESSAGE
    // rather than on the one delivery, because the same letter must not be broadcast as well.
    if (routedOf((message.data ?? {}) as Record<string, unknown>).some((one) => one.to !== null)) continue
    const key = `${workspaceId}~${row.recipientId}`
    let because = cache.get(key)
    if (because === undefined) {
      // THE OFFICE'S OWN PRESENCE READING, ASKED DIRECTLY AND NOT THROUGH THE MESSAGE DOOR. The send
      // door (M110) refuses a grey recipient only when its setting says so, because presence is not
      // yet true for an agent started as a subagent. This classification is a different consumer of
      // the same reading and is NOT gated by that setting: a message that reaches nobody is a dead
      // letter whatever the hour, and the backlog it exists to hand over — measured 11 September as
      // 633 letters whose recipient is retired or holds no live handle — is grey. Gating this on the
      // send-door setting would leave the whole backlog unbroadcast.
      const { machine, sessions, waiting, agentRecords, runningRows } = readingsOf(workspaceId)
      const reading = participantPresence({ kind: 'agent', id: row.recipientId }, workspaceId, now, null, false, machine, sessions, waiting, processes, agentRecords, runningRows)
      because =
        reading.colour === 'green'
          ? null
          : `${reading.says} The message stays queued as a dead letter, kept with when it was sent and to whom.`
      cache.set(key, because)
    }
    if (because === null) continue
    out.push({ messageId: row.messageId, workspaceId, to: { kind: 'agent', id: row.recipientId }, at: message.createdAt, because })
  }
  return out
}

/** One addressee's dead letters, summarised: how many, and the oldest. */
export interface DeadLetterAddressee {
  agentId: string
  count: number
  oldestAt: string
}

/** Group a list of dead letters by addressee. Settled by the secretary: a claim is per addressee, not per letter. */
export function deadLetterAddressees(letters: readonly DeadLetter[]): DeadLetterAddressee[] {
  const byAgent = new Map<string, DeadLetterAddressee>()
  for (const one of letters) {
    const held = byAgent.get(one.to.id)
    if (held === undefined) byAgent.set(one.to.id, { agentId: one.to.id, count: 1, oldestAt: one.at })
    else {
      held.count += 1
      if (one.at < held.oldestAt) held.oldestAt = one.at
    }
  }
  return [...byAgent.values()]
}

/** Every addressee this table has ever named, whether claimed or not. */
function everyNamedAddressee(): Set<string> {
  return new Set(db.select({ agentId: deadLetterClaims.agentId }).from(deadLetterClaims).all().map((row) => row.agentId))
}

/**
 * DEAD LETTERS WHOSE ADDRESSEE HAS NEVER BEEN NAMED IN A BROADCAST. What the threshold is measured
 * against, and what a fresh broadcast would add. An addressee already named — claimed or not — is
 * on the list once; new letters piling up for it are still the same claim's to find.
 */
export function unbroadcastDeadLetters(now: Date = new Date(), protectedRuns?: () => Set<string>): DeadLetter[] {
  const already = everyNamedAddressee()
  return deadLettersNow(now, protectedRuns).filter((one) => !already.has(one.to.id))
}

/** How many whole days separate two local wall-clock stamps, floored. */
function daysBetween(earlier: string, now: Date): number {
  const at = parseAnyStamp(earlier)
  if (at === null) return 0
  return Math.floor((now.getTime() - at.getTime()) / (24 * 60 * 60 * 1000))
}

export { DEAD_LETTER_CLAIM_ACT } from './the-agents-who-claim-dead-letters.ts'

export { theDeadLetterActInWords } from './the-dead-letter-act-in-words.ts'

export { theAgentsWhoClaimDeadLetters } from './the-agents-who-claim-dead-letters.ts'

/** One row of `dead_letter_claims`, as every reader gets it. */
export interface DeadLetterClaimOnTheWire {
  id: string
  workspaceId: string
  groupId: string
  agentId: string
  openedAt: string
  claimedBy: ParticipantRef | null
  claimedAt: string | null
  claimedBecause: string | null
}

function asClaim(row: typeof deadLetterClaims.$inferSelect): DeadLetterClaimOnTheWire {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    groupId: row.groupId,
    agentId: row.agentId,
    openedAt: row.openedAt,
    claimedBy: row.claimedByKind === null || row.claimedById === null ? null : { kind: row.claimedByKind === 'agent' ? 'agent' : 'person', id: row.claimedById },
    claimedAt: row.claimedAt,
    claimedBecause: row.claimedBecause,
  }
}

/** Every dead-letter claim row there is, oldest first. What the group's own list is read from. */
export function deadLetterClaimsIn(): DeadLetterClaimOnTheWire[] {
  return db.select().from(deadLetterClaims).orderBy(deadLetterClaims.openedAt, deadLetterClaims.id).all().map(asClaim)
}

/** The recorded handoff, read without changing the addressee's delivery mark. */
export interface SweptLetterNotice {
  at: string
  groupId: string
  claimedBy: ParticipantRef | null
  claimedAt: string | null
  line: string
}

/** Claims name an addressee's backlog; they do not record a separate history for each letter. */
export function sweptLetterNotice(
  claim: DeadLetterClaimOnTheWire | undefined,
  createdAt: string,
  data: Record<string, unknown>,
): SweptLetterNotice | undefined {
  if (claim === undefined || createdAt > claim.openedAt) return undefined
  const sender = senderOf(data)
  if (sender !== null && isMoleOffice(sender)) return undefined
  if (routedOf(data).some((one) => one.to !== null)) return undefined
  const claimed = claim.claimedBy !== null && claim.claimedAt !== null
    ? ` Claimed at ${claim.claimedAt} by ${handleOf(claim.claimedBy)}.`
    : ''
  return {
    at: claim.openedAt,
    groupId: claim.groupId,
    claimedBy: claim.claimedBy,
    claimedAt: claim.claimedAt,
    line: `This addressee's dead letters were swept at ${claim.openedAt} and handed to the secretaries in group ${claim.groupId}.${claimed}`,
  }
}

// ============================================================================ a retired addressee's letters

/** One queued delivery row to a retired agent, with what the sweep reads of its message. */
export interface ALetterToARetiredAgent {
  messageId: string
  /** The project the letter was written in, where the reach readings are asked, as the send door asks them. */
  workspaceId: string
  /** The retired addressee, by registry id. */
  to: ParticipantRef
  /** The addressee's registry row. */
  addressee: RegisteredAgent
  /** Who the message says sent it, as stored, or null because it names nobody. */
  sentBy: ParticipantRef | null
  /** The message's stored data. */
  data: Record<string, unknown>
}

/** The secretary named to take the dead letters, as the sweep uses it: the participant and its handle. */
export interface TheNamedSecretary {
  who: ParticipantRef
  name: string
}

/**
 * WHAT THE SWEEP DOES WITH ONE QUEUED LETTER TO A RETIRED AGENT. Problem 0WUuvB0IhRfb.
 *
 *   (a) `archive`: an office notice. Its row is marked archived, and nobody is woken.
 *   (b) `route`: a person's or agent's letter follows the owner chain. `wait` means no owner can
 *       receive it yet, so its original delivery stays queued.
 *   `already`: the office routed this letter for this addressee before, so it has a home.
 *   `none`: none of the three covers it. It keeps today's threshold and claims.
 */
export type WhatTheSweepDoes =
  | { rule: 'a'; act: 'archive'; because: string }
  | { rule: 'b'; act: 'route'; entry: RoutedAddressee }
  | { rule: 'b'; act: 'give to the secretary'; entry: RoutedAddressee }
  | { rule: 'b'; act: 'wait'; because: string }
  | { rule: 'c'; act: 'give to the secretary'; entry: RoutedAddressee }
  | { rule: 'c'; act: 'wait'; because: string }
  | { rule: 'already'; because: string }
  | { rule: 'none'; because: string }

/** Whether an ending is one of the owner endings, which are the only ones that carry the owner's name. */
function isAnOwnerEnding(ending: { how: string }): ending is TheOwnerEnding {
  return 'owner' in ending
}

/**
 * THE ONE PLACE THAT SAYS WHICH OF RULES A, B AND C APPLIES TO ONE LETTER, AND WHAT TO DO. Invariant 9.
 * `sweepDeadLetters` acts on the answer, and the Settings panel's count of the person's waiting
 * letters reads the same answer. It writes nothing.
 *
 * `secretary` is who the person named, already checked by `theDeadLetterSecretary`, or null. `sweptAt`
 * is the stamp the routed line says Mole Office looked at, or null because the record door asks as the
 * letter is written (`theSecretarysCopyAsTheLetterIsWritten`); the line then says "when this was sent".
 * `readings` gives what a project's walks read once (`theReadingsForOneSend`). The message id is not
 * read, so the door may ask before the message has one.
 */
export function whatTheSweepDoesWithALetter(
  letter: Omit<ALetterToARetiredAgent, 'messageId'>,
  secretary: TheNamedSecretary | null,
  sweptAt: string | null,
  readings: (workspaceId: string) => TheReadingsForOneSend,
  endedCheckpointWorker = false,
): WhatTheSweepDoes {
  const name = theNameOf(letter.addressee, letter.to.id)
  const swept = sweptAt === null ? {} : { sweptAt }
  // (a) AN OFFICE NOTICE TO A RETIRED ADDRESSEE IS ARCHIVED. Nobody reads it and nobody is woken for it.
  // `deadLettersNow` leaves the office's own lines out, so before this rule they stayed queued for ever.
  if (letter.sentBy !== null && isMoleOffice(letter.sentBy)) {
    return {
      rule: 'a',
      act: 'archive',
      because: `Mole Office archived this notice${sweptAt === null ? '' : ` at ${sweptAt}`}: ${name} is retired, so nobody will read it and nobody is woken for it.`,
    }
  }
  // A MESSAGE TO A GROUP IS NEVER ROUTED, at sending and here: the other members of the group already have it.
  const group = letter.data['toGroup']
  if (typeof group === 'string' && group !== '') {
    return { rule: 'none', because: 'A message to a group is never routed, so none of the three rules covers it.' }
  }
  // A LETTER ALREADY ROUTED FOR THIS ADDRESSEE HAS A HOME: a copy went to somebody at sending, or the sweep
  // handled it before. It is left as it is, so a sweep never routes one letter twice.
  const routed = routedOf(letter.data).filter((one) => sameParticipant(one.for, letter.to))
  if (routed.some((one) => one.to !== null || one.said?.sweptAt !== undefined)) {
    return { rule: 'already', because: `Mole Office already routed this letter for ${name}.` }
  }
  const reach = readings(letter.workspaceId).reachOf(letter.to.id)
  if (reach === null || (reach.was !== 'retired' && !(endedCheckpointWorker && reach.was === 'nothing answering'))) {
    return {
      rule: 'none',
      because: `${name} is marked retired, but the office's reach reading does not say so, so the sweep leaves this letter as it is.`,
    }
  }
  const sender = letter.sentBy
  // Both writers use the same ownership walk. An unclear chain leaves the original delivery waiting.
  if (sender !== null && (sender.kind === 'agent' || sender.kind === 'person')) {
    const registered = sender.kind === 'agent' ? theOneAgentAStringNames(sqlite, sender.id) : null
    const from: ParticipantRef = registered === null ? sender : { kind: 'agent', id: registered.id }
    const walked = theRoutingOfOneAddressee(letter.to, reach, from, readings(letter.workspaceId))
    if (walked.said === undefined) return { rule: 'none', because: walked.line }
    if ([OWNERLESS_ROUTING_ENDING, BROKEN_OWNERS_ROUTING_ENDING, NO_REACHABLE_OWNER_ENDING, PERSON_OWNER_ROUTING_ENDING].some((how) => how === walked.said!.ending.how)) return { rule: 'b', act: 'wait', because: walked.line }
    const said = { ...walked.said, ...swept }
    return { rule: 'b', act: 'route', entry: { ...walked, line: theRoutedLine(said), said } }
  }
  return { rule: 'none', because: 'The letter names no sender the three rules cover, so it keeps the threshold and the claims.' }
}

/** New letters to an ended checkpoint worker use the same ownership walk as the sweep. */
export function aNewCheckpointLetterAsItIsWritten(
  letter: Omit<ALetterToARetiredAgent, 'messageId'>,
  readings: TheReadingsForOneSend,
): WhatTheSweepDoes | null {
  if (!hasCheckpointBoundary(letter.to.id, letter.workspaceId)) return null
  const reach = readings.reachOf(letter.to.id)
  if (reach?.was !== 'nothing answering') return null
  const does = whatTheSweepDoesWithALetter(letter, theNamedSecretary(), null, () => readings, true)
  return does.rule === 'b' || does.rule === 'c' ? does : null
}

/** Every queued delivery row to a retired agent, with its message. A row whose message is gone is left out. */
export function everyQueuedLetterToARetiredAgent(): ALetterToARetiredAgent[] {
  return theQueuedLettersToRetiredAgents(false)
}

/** The sweep needs routing facts, while the public reader also gives callers the whole message data. */
function theQueuedLettersToRetiredAgents(forSweep: boolean): ALetterToARetiredAgent[] {
  const retired = new Map(listParticipants().agents.filter((one) => one.retired).map((one) => [one.id, one]))
  if (retired.size === 0) return []
  // IN PIECES (src/server/db/in-pieces.ts): a retired agent stays in the registry, so this list grows with the office.
  // Each row names one agent and so comes from one piece, and the joined rows are sorted again by moment, then id.
  const queued = readInPieces(retired.keys(), (piece) =>
    db
      .select()
      .from(messageDelivery)
      .where(and(eq(messageDelivery.mark, 'queued'), eq(messageDelivery.recipientKind, 'agent'), inArray(messageDelivery.recipientId, piece)))
      .orderBy(messageDelivery.at, messageDelivery.id)
      .all(),
  ).sort((one, other) => (one.at < other.at ? -1 : one.at > other.at ? 1 : one.id < other.id ? -1 : one.id > other.id ? 1 : 0))
  if (queued.length === 0) return []
  // IN PIECES (src/server/db/in-pieces.ts): every queued letter to a retired agent names its message here, and a
  // backlog has no cap. The rows go into a map by id, so the order of the pieces does not matter.
  const dataForRead = forSweep
    ? onlyTheseFieldsOf(['sentBy', 'toGroup', 'routed', 'writtenIn'])
    : sql<string>`${records.data}`
  const messages = new Map(
    readInPieces(queued.map((one) => one.messageId), (piece) =>
      db
        .select({ id: records.id, workspaceId: records.workspaceId, data: dataForRead })
        .from(records)
        .where(and(inArray(records.id, piece), theKindOfARowFoundById('message'), isNull(records.deletedAt)))
        .all(),
    ).map((row) => [row.id, row]),
  )
  const out: ALetterToARetiredAgent[] = []
  for (const row of queued) {
    const message = messages.get(row.messageId)
    const addressee = retired.get(row.recipientId)
    if (message === undefined || addressee === undefined) continue
    const data = (JSON.parse(message.data) ?? {}) as Record<string, unknown>
    // THE PROJECT IT WAS WRITTEN IN, which is where the send door read who could be reached. A message is kept in
    // the message centre, which holds no runs, so asking there would find nobody reachable.
    const workspaceId = message.workspaceId === MESSAGE_CENTRE ? (writtenInOf(data)?.project ?? MESSAGE_CENTRE) : message.workspaceId
    out.push({ messageId: row.messageId, workspaceId, to: { kind: 'agent', id: row.recipientId }, addressee, sentBy: senderOf(data), data })
  }
  return out
}

/** The secretary the person named, as the sweep uses it, or null because nobody qualifies. */
function theNamedSecretary(): TheNamedSecretary | null {
  const reading = theDeadLetterSecretary()
  return reading.named === null ? null : { who: { kind: 'agent', id: reading.named.id }, name: reading.named.handle }
}

/**
 * What a project's walks read, read once per sweep. `theReadingsForOneSend` says why. The run rows are the ones any reach
 * reads (`theRunRowsAnyReachReads` says why), not every session record of the project.
 */
function theReadingsOnce(): (workspaceId: string) => TheReadingsForOneSend {
  const held = new Map<string, TheReadingsForOneSend>()
  return (workspaceId) => {
    let readings = held.get(workspaceId)
    if (readings === undefined) {
      readings = theReadingsForOneSend(workspaceId, theRunRowsAnyReachReads)
      held.set(workspaceId, readings)
    }
    return readings
  }
}

/**
 * THE LETTERS FROM THE PERSON THAT WAIT BECAUSE NO SECRETARY IS NAMED. Rule (c), read through the one
 * place, for the Settings panel. Empty while a secretary is named: the record door gives a new letter to that
 * secretary as it is written, and the next sweep gives it every letter written before the secretary was named.
 */
export function lettersFromThePersonWaitingForASecretary(): ALetterToARetiredAgent[] {
  const secretary = theNamedSecretary()
  const readings = theReadingsOnce()
  const at = nowStamp()
  return everyQueuedLetterToARetiredAgent().filter((letter) => {
    const does = whatTheSweepDoesWithALetter(letter, secretary, at, readings)
    return does.rule === 'c' && does.act === 'wait'
  })
}

/**
 * THE PERSON'S LETTER TO A RETIRED AGENT, AS IT IS WRITTEN. Problem 0WUuvB0IhRfb, decision tRBkvcsmypi5.
 *
 * The record door asks this while it writes a message. It puts the letter to rule (c) through
 * `whatTheSweepDoesWithALetter`, the one place that holds the rule, with no sweep stamp. It answers the
 * entry to store when the answer is "give to the secretary", and null for every other answer. So a
 * letter from the person reaches the named secretary at once, and does not wait for a sweep or a
 * threshold. With nobody named, rule (c) says "wait", this answers null, and the letter waits as before.
 */
export function theSecretarysCopyAsTheLetterIsWritten(
  letter: Omit<ALetterToARetiredAgent, 'messageId'>,
  readings: TheReadingsForOneSend,
): RoutedAddressee | null {
  const does = whatTheSweepDoesWithALetter(letter, theNamedSecretary(), null, () => readings)
  return does.rule === 'c' && does.act === 'give to the secretary' ? does.entry : null
}

/** Add one entry after a letter's stored routing, through the sweep's own door in `patchRecord`. */
function addToTheRouting(messageId: string, entry: RoutedAddressee, by: Actor): void {
  const row = db.select({ data: records.data }).from(records).where(eq(records.id, messageId)).get()
  const stored = ((row?.data ?? {}) as Record<string, unknown>)['routed']
  const held = Array.isArray(stored) ? stored : []
  patchRecord(messageId, { dataPatch: { routed: [...held, entry] }, [THE_DEAD_LETTER_SWEEP]: true }, by)
}

/** One letter the sweep routes in a summary, with the entry `whatTheSweepDoesWithALetter` gave it. */
interface ALetterToTellAbout {
  letter: ALetterToARetiredAgent
  entry: RoutedAddressee & { said: NonNullable<RoutedAddressee['said']> }
}

/**
 * TELL ONE RECEIVER ABOUT ITS LETTERS IN ONE MESSAGE, AND MARK EACH LETTER WITH THAT MESSAGE. Problem wN3CEhHxRKO3.
 *
 * On 3 October 2026 one sweep gave 476 old letters to one coordinator one by one, and the hand-over of 470 of
 * them ended its waiting loop. So the sweep writes ONE message from Mole Office to the receiver: how many letters,
 * for which retired addressees, and how to read them. Then each letter gets its routed entry, with the id of that
 * message in `inSummary`. The entry is what makes the letter "already routed" to every later sweep, after a
 * restart too, because it is stored on the letter. `inSummary` is why the letter gets no delivery row for the
 * receiver (`routedCopiesOf`). Answers the message's id.
 */
function tellTheReceiverOnce(to: ParticipantRef, letters: readonly ALetterToTellAbout[], sweptAt: string, by: Actor): string {
  const addressees = new Map<string, ASummarisedAddressee>()
  for (const { letter } of letters) {
    const held = addressees.get(letter.to.id)
    if (held === undefined) addressees.set(letter.to.id, { name: theNameOf(letter.addressee, letter.to.id), id: letter.to.id, count: 1 })
    else held.count += 1
  }
  // SORTED BY NAME, so the list reads the same whichever order the letters were queued in.
  const sorted = [...addressees.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const facts: TheDeadLetterSummarySaid = { sweptAt, letters: letters.length, addressees: sorted }
  // THE ENGLISH IS STORED WITH THE SENTENCE ABOUT THE API, because an agent reads the stored sentence. A page draws
  // the same facts in its own language.
  const words = theDeadLetterSummaryInWords(sayInEnglish, facts, true)
  const written = createRecord({
    workspaceId: MESSAGE_CENTRE,
    kind: 'message',
    title: SYSTEM_LINE_TITLE,
    data: { body: words.line, saidInFull: words.said, to: [to], sentBy: moleOffice(), notice: 'lettersForRetiredAgents', deadLetterSweep: { summary: facts } },
    actor: by,
    senderIsMoleOffice: true,
  })
  for (const { letter, entry } of letters) {
    addToTheRouting(letter.messageId, { ...entry, line: theRoutedLine(entry.said, true), inSummary: written.id }, by)
  }
  return written.id
}

/** The keys of the letters the last sweep line said were waiting, or an empty set because there is no line. */
function theWaitingTheLastLineNamed(): Set<string> {
  const row = sqlite
    .prepare(
      "SELECT json_extract(data, '$.deadLetterSweep.waiting') AS waiting FROM records WHERE kind = 'message' " +
        "AND deleted_at IS NULL AND json_extract(data, '$.deadLetterSweep.waiting') IS NOT NULL " +
        'ORDER BY created_at DESC, rowid DESC LIMIT 1',
    )
    .get() as { waiting: string | null } | undefined
  if (row?.waiting === undefined || row.waiting === null) return new Set()
  const said = JSON.parse(row.waiting) as unknown
  return new Set(Array.isArray(said) ? said.filter((one): one is string => typeof one === 'string') : [])
}

/**
 * Why nobody is sent the sweep's line, with the secretary reading's own reason and facts for the page.
 */
function nobodyIsSentIt(
  reading: ReturnType<typeof theDeadLetterSecretary>,
): { nobodyBecause: string; why: WhyTheSweepLineWentToNobody } {
  const why: WhyTheSweepLineWentToNobody = {
    no: 'nobody named', because: reading.nobodyBecause ?? 'nobody chose', storedName: reading.storedName ?? '', act: reading.act,
  }
  return { nobodyBecause: whyTheSweepLineWentToNobody(sayInEnglish, why), why }
}

/** Count letters by a name, in the order each name was first met. */
function countedBy(names: readonly string[]): ANameAndACount[] {
  const out = new Map<string, number>()
  for (const name of names) out.set(name, (out.get(name) ?? 0) + 1)
  return [...out].map(([name, count]) => ({ name, count }))
}

// ============================================================================ the sweep

/** What running the sweep did. */
export interface SweepResult {
  /** The standing group kept for claims, or null because no sweep line was written. */
  groupId: string | null
  /** The sweep's one line, or null because none was written. */
  lineId: string | null
  /** The addressees newly named for a claim in this sweep. Empty when the threshold was not crossed. */
  addressees: string[]
  /** Who the line was delivered to, or null because it was delivered to nobody or not written. */
  deliveredTo: ParticipantRef | null
  /** How many letters rules a, b and c handled in this sweep, and how many wait. */
  archived: number
  routed: number
  givenToTheSecretary: number
  waiting: { fromThePerson: number; fromAgents: number }
  /** The one message each receiver of agents' letters was sent in this sweep, and how many letters it lists. */
  summaries: { to: ParticipantRef; messageId: string; letters: number }[]
  /** What the sweep did, in a sentence a person or a secretary can read. */
  because: string
}

/**
 * HANDLE A RETIRED ADDRESSEE'S LETTERS, CHECK THE THRESHOLD, AND WRITE ONE LINE. The one write in this file.
 *
 * ---------------------------------------------------------------------------------------
 * FIRST, A RETIRED ADDRESSEE'S LETTERS (problem 0WUuvB0IhRfb)
 * ---------------------------------------------------------------------------------------
 *
 * Every queued letter to a retired agent is put to `whatTheSweepDoesWithALetter`, and the sweep does
 * what it answers: it archives, routes, gives to the named secretary, or leaves the letter waiting.
 * This is not held back by the threshold: a retired agent will read nothing, so waiting gains nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THEN THE THRESHOLD, FOR EVERY OTHER DEAD LETTER, IN THE PERSON'S OWN NUMBERS
 * ---------------------------------------------------------------------------------------
 *
 * After a time (the default: one day) OR a count (the default: more than twenty), both
 * owner-decided by a decision. That decision replaced criterion M111's
 * example — dead letters whose addressee has never been named only, so an addressee already
 * named does not keep re-triggering. Both are settings (`deadLetterAfterDays`,
 * `deadLetterAfterCount`). A letter rules a, b and c handled, or one they leave waiting, is not
 * counted here.
 *
 * ---------------------------------------------------------------------------------------
 * One direct notice to the named secretary
 * ---------------------------------------------------------------------------------------
 *
 * The sweep addresses its notice directly to the secretary named for dead letters, without a group
 * address or a membership requirement. With nobody qualified it keeps the explanation as an office
 * message with no recipients. The standing group is still kept for claims; no sweep notice goes there.
 *
 * A LINE IS WRITTEN ONLY WHEN THERE IS SOMETHING NEW TO SAY: a letter was handled, the threshold was
 * crossed, or a letter waits that the last line did not name. The line keeps the waiting letters'
 * keys in `deadLetterSweep.waiting`, so the next sweep can tell.
 *
 * ---------------------------------------------------------------------------------------
 * SAFE TO CALL OFTEN. IT DOES NOTHING WHEN THERE IS NOTHING TO DO.
 * ---------------------------------------------------------------------------------------
 *
 * Each pass reads queued letters and checks routed messages for uncertain owners. It writes no
 * notice when there is nothing new to say. The worker presses it on every pass, and the server's
 * timer calls it through `sweepIfDue`. Every sweep notes when it ran for `sweepIfDue`.
 */
/** Ask for the more costly dead-letter reading only when a waiting owner route exists. */
function someWaitingOwnerRoute(): boolean {
  const agentOwner = eq(agents.ownerKind, 'agent')
  const queuedAgentCopy = and(
    eq(messageDelivery.messageId, records.id),
    eq(messageDelivery.mark, 'queued'),
    eq(messageDelivery.recipientKind, 'agent'),
  )
  return db.select({ id: records.id }).from(records)
    .where(and(
      ONE_KIND_WRITTEN_OUT.message,
      eq(STORED_FIELDS.messageRoutedType(records.data), sql`'array'`),
      isNull(records.deletedAt),
      sql`exists (select 1 from json_each(${records.data}, '$.routed') as route
        where case when route.type = 'object' then json_type(route.value, '$.to') end = 'null'
        and case when route.type = 'object' then json_extract(route.value, '$.said.ending.how') end
          in (${OWNERLESS_ROUTING_ENDING}, ${BROKEN_OWNERS_ROUTING_ENDING}, ${NO_REACHABLE_OWNER_ENDING}, ${PERSON_OWNER_ROUTING_ENDING})
        and exists (select 1 from ${agents} where ${agents.id} =
          case when route.type = 'object' then json_extract(route.value, '$.for.id') end
          and ${agents.ownerId} is not null and ${agentOwner}))`,
      sql`exists (select 1 from ${messageDelivery} where ${queuedAgentCopy})`,
    )).limit(1).get() !== undefined
}

function uncertainOwnerRetryCandidates() {
  const queuedAgentCopy = and(
    eq(messageDelivery.messageId, records.id),
    eq(messageDelivery.mark, 'queued'),
    eq(messageDelivery.recipientKind, 'agent'),
  )
  return db.select({ id: records.id, workspaceId: records.workspaceId, data: records.data }).from(records)
    .where(and(
      ONE_KIND_WRITTEN_OUT.message,
      eq(STORED_FIELDS.messageRoutedType(records.data), sql`'array'`),
      isNull(records.deletedAt),
      sql`exists (select 1 from json_each(${records.data}, '$.routed') as route
        where case when route.type = 'object' then json_extract(route.value, '$.said.ending.how') end = ${'an owner whose reach is uncertain'})`,
      sql`exists (select 1 from ${messageDelivery} where ${queuedAgentCopy})`,
    )).all()
}

export function sweepDeadLetters(by: Actor, now: Date = new Date()): SweepResult {
  lastSweptAt = now
  const sweptAt = nowStamp()
  const secretary = theNamedSecretary()
  const readings = theReadingsOnce()
  // A sweep changes letters, not runs. Reuse the same lazy run protection for all its reads.
  let protectedAgents: Set<string> | undefined
  const protectedRuns = () => protectedAgents ??= agentsWhoseRunsMayRead(now)
  const decided = theQueuedLettersToRetiredAgents(true).map((letter) => ({
    letter,
    does: whatTheSweepDoesWithALetter(letter, secretary, sweptAt, readings),
    checkpoint: false,
  }))
  for (const letter of newCheckpointLetters()) {
    if (letter.sentBy !== null && isMoleOffice(letter.sentBy)) continue
    const reach = readings(letter.workspaceId).reachOf(letter.to.id)
    if (reach?.was !== 'nothing answering') continue
    decided.push({ letter, does: whatTheSweepDoesWithALetter(letter, secretary, sweptAt, readings, true), checkpoint: true })
  }
  // Retry only a previously unresolved route. The dead-letter reading protects a returning
  // addressee and recent session output before any owner is considered.
  const unresolved = someWaitingOwnerRoute() ? deadLettersNow(now, protectedRuns) : []
  if (unresolved.length > 0) {
    const messages = new Map(readInPieces(unresolved.map((one) => one.messageId), (piece) =>
      db.select({ id: records.id, data: records.data }).from(records)
        .where(and(inArray(records.id, piece), theKindOfARowFoundById('message'), isNull(records.deletedAt))).all(),
    ).map((row) => [row.id, row]))
    for (const pending of unresolved) {
      const message = messages.get(pending.messageId)
      if (message === undefined) continue
      const data = (message.data ?? {}) as Record<string, unknown>
      const routes = routedOf(data).filter((route) => sameParticipant(route.for, pending.to))
      if (routes.some((route) => route.to !== null) || !routes.some((route) => route.to === null &&
        [OWNERLESS_ROUTING_ENDING, BROKEN_OWNERS_ROUTING_ENDING, NO_REACHABLE_OWNER_ENDING, PERSON_OWNER_ROUTING_ENDING].some((how) => how === route.said?.ending.how))) continue
      const addressee = readParticipant(pending.to) as RegisteredAgent | null
      if (addressee === null || addressee.retired) continue
      const workspaceId = pending.workspaceId === MESSAGE_CENTRE ? (writtenInOf(data)?.project ?? MESSAGE_CENTRE) : pending.workspaceId
      const letter = { messageId: pending.messageId, workspaceId, to: pending.to, addressee, sentBy: senderOf(data), data }
      const does = whatTheSweepDoesWithALetter(letter, secretary, sweptAt, readings, true)
      if (does.rule === 'b' && does.act === 'route' && does.entry.to !== null) decided.push({ letter, does, checkpoint: true })
    }
  }
  // A copy given to an owner whose reach was uncertain may itself become unavailable.
  // Keep the original addressee first, and revisit only these expressly uncertain copies.
  const messages = uncertainOwnerRetryCandidates()
  if (messages.length > 0) {
    const queuedCopies = readInPieces(messages.map((one) => one.id), (piece) =>
      db.select().from(messageDelivery).where(and(
        inArray(messageDelivery.messageId, piece), eq(messageDelivery.mark, 'queued'), eq(messageDelivery.recipientKind, 'agent'),
      )).all(),
    )
    const queued = new Set(queuedCopies.map((one) => `${one.messageId}~${one.recipientId}`))
    const protectedAgents = protectedRuns()
    for (const message of messages) {
      const data = (message.data ?? {}) as Record<string, unknown>
      const sender = senderOf(data)
      if (sender === null || isMoleOffice(sender)) continue
      const routes = routedOf(data)
      const workspaceId = message.workspaceId === MESSAGE_CENTRE ? (writtenInOf(data)?.project ?? MESSAGE_CENTRE) : message.workspaceId
      for (const route of routes) {
        const owner = route.to
        if (route.said?.ending.how !== 'an owner whose reach is uncertain' || owner?.kind !== 'agent' || route.for.kind !== 'agent') continue
        if (!queued.has(`${message.id}~${route.for.id}`) || !queued.has(`${message.id}~${owner.id}`)) continue
        if (protectedAgents.has(route.for.id) || protectedAgents.has(owner.id)) continue
        if (routes.some((other) => sameParticipant(other.for, owner))) continue
        const originalReach = readings(workspaceId).reachOf(route.for.id)
        if (originalReach?.was !== 'nothing answering' && originalReach?.was !== 'retired') continue
        const ownerReach = readings(workspaceId).reachOf(owner.id)
        if (ownerReach?.was !== 'nothing answering' && ownerReach?.was !== 'retired') continue
        const addressee = readParticipant(owner) as RegisteredAgent | null
        if (addressee === null) continue
        const letter = { messageId: message.id, workspaceId, to: owner, addressee, sentBy: sender, data }
        const does = whatTheSweepDoesWithALetter(letter, secretary, sweptAt, readings, true)
        if (does.rule === 'b' && does.act === 'route' && does.entry.to !== null) decided.push({ letter, does, checkpoint: true })
      }
    }
  }
  const keyOf = aDeadLetterKey

  // ---- (a) ARCHIVE, in one write so one event goes out per addressee.
  const toArchive: ADeliveryToArchive[] = []
  for (const { letter, does } of decided) {
    if (does.rule === 'a') toArchive.push({ messageId: letter.messageId, who: letter.to, because: does.because })
  }
  const archived = archiveDeliveries(toArchive, sweptAt)
  const archivedNames = new Set(archived.map((one) => keyOf(one.messageId, one.who.id)))

  // ---- (b) AND (c) ROUTE, one patch per letter, each adding its entry after the ones stored.
  //
  // AN AGENT'S LETTER THAT GOES UP THE CHAIN IS TOLD ABOUT, NOT HANDED OVER (problem wN3CEhHxRKO3). Rule (b) collects
  // such letters by receiver, and each receiver gets ONE message per sweep (`tellTheReceiverOnce`), never one per
  // letter. A letter from the person, rule (c), still goes to the named secretary one by one, with its own delivery
  // row, because it is the person's letter. The record door already gives each new one at once, so a sweep meets
  // only the ones written before a secretary was named. A letter whose sender keeps it makes no copy either way.
  const routedTo: string[] = []
  let keptBySender = 0
  let givenFromAgents = 0
  let givenFromThePerson = 0
  const toTell = new Map<string, { to: ParticipantRef; name: string; letters: ALetterToTellAbout[]; given: number }>()
  for (const { letter, does, checkpoint } of decided) {
    if (does.rule !== 'b' && does.rule !== 'c') continue
    if (does.act === 'wait') continue
    const said = does.entry.said
    if (!checkpoint && letter.sentBy?.kind !== 'person' && does.rule === 'b' && does.entry.to !== null && said !== undefined && anEndingASummaryMayTell(said.ending)) {
      const key = participantKey(does.entry.to)
      const held = toTell.get(key) ?? { to: does.entry.to, name: handleOf(does.entry.to), letters: [], given: 0 }
      held.letters.push({ letter, entry: { ...does.entry, said } })
      if (does.act === 'give to the secretary') held.given += 1
      toTell.set(key, held)
      continue
    }
    addToTheRouting(letter.messageId, does.entry, by)
    if (does.act === 'route') {
      if (does.entry.to === null) keptBySender += 1
      else routedTo.push(handleOf(does.entry.to))
    } else if (does.rule === 'b') givenFromAgents += 1
    else givenFromThePerson += 1
  }
  const summaries: { to: ParticipantRef; messageId: string; letters: number }[] = []
  for (const one of toTell.values()) {
    summaries.push({ to: one.to, messageId: tellTheReceiverOnce(one.to, one.letters, sweptAt, by), letters: one.letters.length })
  }
  const summarised = [...toTell.values()]
  const summarisedRouted = summarised.reduce((sum, one) => sum + one.letters.length - one.given, 0)
  const summarisedGiven = summarised.reduce((sum, one) => sum + one.given, 0)
  const waitingKeys = decided
    .filter(({ does }) => (does.rule === 'b' || does.rule === 'c') && does.act === 'wait')
    .map(({ letter }) => keyOf(letter.messageId, letter.to.id))
    .sort()
  const waitingLetters = decided.filter(({ does }) => (does.rule === 'b' || does.rule === 'c') && does.act === 'wait')
  const waiting = {
    fromThePerson: waitingLetters.filter(({ letter }) => letter.sentBy?.kind === 'person').length,
    fromAgents: waitingLetters.filter(({ letter }) => letter.sentBy?.kind === 'agent').length,
  }

  // ---- THE THRESHOLD, over every dead letter the three rules did not cover.
  const coveredByTheRules = new Set(decided.filter(({ does }) => does.rule !== 'none').map(({ letter }) => keyOf(letter.messageId, letter.to.id)))
  const fresh = unbroadcastDeadLetters(now, protectedRuns).filter((one) => !coveredByTheRules.has(keyOf(one.messageId, one.to.id)))
  let thresholdSays: string
  let broadcast: { countSentence: string; letters: number; addressees: DeadLetterAddressee[] } | null = null
  if (fresh.length === 0) {
    thresholdSays = 'No dead letter is waiting to be broadcast.'
  } else {
    const addressees = deadLetterAddressees(fresh)
    const oldestAt = addressees.reduce((min, one) => (one.oldestAt < min ? one.oldestAt : min), addressees[0]!.oldestAt)
    const ageDays = daysBetween(oldestAt, now)
    const countLimit = deadLetterAfterCount()
    const daysLimit = deadLetterAfterDays()
    if (fresh.length > countLimit || ageDays >= daysLimit) {
      // THE SAME SENTENCE THE OLD "Dead letters to claim" LINE CARRIED, from the one composer that says it.
      const countSentence = pastTheThreshold(sayInEnglish, fresh.length, addressees.length)
      thresholdSays = countSentence
      broadcast = { countSentence, letters: fresh.length, addressees }
    } else {
      thresholdSays =
        `${String(fresh.length)} dead letter${fresh.length === 1 ? '' : 's'} for ${String(addressees.length)} ` +
        `addressee${addressees.length === 1 ? '' : 's'} waiting, the oldest ${String(ageDays)} day${ageDays === 1 ? '' : 's'} old. ` +
        `That is at or under both this installation's thresholds (more than ${String(countLimit)} letters, or ` +
        `${String(daysLimit)} days), so nothing was broadcast yet.`
    }
  }

  const handled = archived.length + routedTo.length + keptBySender + givenFromAgents + givenFromThePerson + summarisedRouted + summarisedGiven
  const counts = {
    archived: archived.length,
    routed: routedTo.length + keptBySender + summarisedRouted,
    givenToTheSecretary: givenFromAgents + givenFromThePerson + summarisedGiven,
    waiting,
    summaries,
  }

  // ---- ONE LINE, ONLY WHEN THERE IS SOMETHING NEW TO SAY. The cheap path reads no group at all.
  const nothingNew = (): SweepResult => {
    const stillWaiting = [
      waiting.fromThePerson === 0 ? '' : waiting.fromThePerson === 1
        ? sayInEnglish('deadLetterSweep.ownerWaiting.fromThePerson.one')
        : sayInEnglish('deadLetterSweep.ownerWaiting.fromThePerson.many', { n: waiting.fromThePerson }),
      waiting.fromAgents === 0 ? '' : waiting.fromAgents === 1
        ? sayInEnglish('deadLetterSweep.ownerWaiting.fromAgents.one')
        : sayInEnglish('deadLetterSweep.ownerWaiting.fromAgents.many', { n: waiting.fromAgents }),
    ].filter(Boolean).join(' ')
    const waitingPrefix = stillWaiting === '' ? '' : `${stillWaiting} `
    return { groupId: null, lineId: null, addressees: [], deliveredTo: null, ...counts, because: `${waitingPrefix}${thresholdSays}` }
  }
  if (handled === 0 && broadcast === null && waitingKeys.length === 0) return nothingNew()
  const secretariat = syncTheSecretariatGroup()
  const groupId = secretariat.id
  const toldBefore = theWaitingTheLastLineNamed()
  if (handled === 0 && broadcast === null && waitingKeys.every((key) => toldBefore.has(key))) return nothingNew()

  const reading = theDeadLetterSecretary()
  const deliveredTo = secretary?.who ?? null
  const said: TheDeadLetterSweepSaid = {
    archived: countedBy(toArchive.filter((one) => archivedNames.has(keyOf(one.messageId, one.who.id))).map((one) => handleOf(one.who))),
    routed: countedBy(routedTo),
    summarised: summarised.map((one) => ({ name: one.name, count: one.letters.length })),
    keptBySender,
    givenToTheSecretary: secretary === null ? null : { name: secretary.name, fromAgents: givenFromAgents, fromThePerson: givenFromThePerson },
    waiting,
    broadcast:
      broadcast === null
        ? null
        : {
            countSentence: broadcast.countSentence,
            letters: broadcast.letters,
            addressees: broadcast.addressees.map((one) => ({ name: handleOf({ kind: 'agent', id: one.agentId }), count: one.count })),
          },
    deliveredTo: secretary !== null ? { name: secretary.name } : nobodyIsSentIt(reading),
  }
  const line = SYSTEM_LINES.deadLetterSweep(said)
  // THE FACTS ARE STORED BESIDE THE ENGLISH SENTENCE, so a page says the same sentence in its own language.
  const written = createRecord({
    workspaceId: secretariat.workspaceId,
    kind: 'message',
    title: SYSTEM_LINE_TITLE,
    data: {
      body: line.line,
      ...(line.said === null ? {} : { saidInFull: line.said }),
      notice: line.notice,
      to: deliveredTo === null ? [] : [deliveredTo],
      sentBy: moleOffice(),
      deadLetterSweep: { waiting: waitingKeys, said },
    },
    actor: by,
    senderIsMoleOffice: true,
    [THE_DEAD_LETTER_SWEEP]: true,
  })

  // ---- AND THE ADDRESSEES PAST THE THRESHOLD ARE NAMED FOR A CLAIM, once each, ever.
  if (broadcast !== null) {
    const at = nowStamp()
    for (const one of broadcast.addressees) {
      db.insert(deadLetterClaims)
        .values({
          id: anOfficeId(),
          workspaceId: secretariat.workspaceId,
          groupId,
          agentId: one.agentId,
          openedAt: at,
          claimedByKind: null,
          claimedById: null,
          claimedAt: null,
          claimedBecause: null,
        })
        // AN ADDRESSEE ALREADY NAMED IS NEVER NAMED TWICE. `agent_id` is unique across the whole
        // table (not per group), exactly because the person's words say a claim is per addressee, ever.
        .onConflictDoNothing()
        .run()
    }
  }

  return {
    groupId,
    lineId: written.id,
    addressees: broadcast === null ? [] : broadcast.addressees.map((one) => one.agentId),
    deliveredTo,
    ...counts,
    because: line.said ?? line.line,
  }
}

// ============================================================================ the server's own sweep

/**
 * HOW LONG AFTER THE LAST SWEEP THE NEXT ONE IS DUE: five minutes. Decision tRBkvcsmypi5: the
 * server sweeps on its own every five minutes, whatever the worker's mode. The live worker runs in
 * merges-only mode, and a pass in that mode returns before it presses POST /api/dead-letters/sweep.
 */
export const A_SWEEP_IS_DUE_AFTER_MS = 5 * 60 * 1000

/** How often the server's timer asks whether a sweep is due: once a minute, so no gap is longer than six minutes. */
const THE_TIMER_ASKS_EVERY_MS = 60 * 1000

/** When the last sweep in this process ran, or null because none has run since the server started. */
let lastSweptAt: Date | null = null

/** What `sweepIfDue` did: it swept, or it did not because the last sweep was too recent. */
export type WhatSweepIfDueDid =
  | { swept: true; result: SweepResult }
  | { swept: false; lastSweptAt: string; because: string }

/**
 * SWEEP WHEN A SWEEP IS DUE, AND ONLY THEN. The one place that decides when the server sweeps on its own.
 *
 * A sweep is due when none has run in this process in the last five minutes. Every sweep counts, the
 * worker's press of POST /api/dead-letters/sweep included, because `sweepDeadLetters` notes the time
 * itself. So a press and the timer never sweep twice within one five-minute window.
 *
 * THE PRESS STILL SWEEPS EVERY TIME IT IS PRESSED. A press is somebody asking for a sweep now: the
 * worker on its pass, or a person by hand. Turning a press away because the timer swept a minute ago
 * would answer a request with a sweep that did not happen.
 *
 * NO LOCK IS NEEDED. `sweepDeadLetters` is synchronous: it reads and writes the database without
 * waiting on anything. In one Node process two calls cannot run at the same time, so the second call
 * always starts after the first one has finished and noted its time.
 */
export function sweepIfDue(by: Actor, now: Date = new Date()): WhatSweepIfDueDid {
  if (lastSweptAt !== null && now.getTime() - lastSweptAt.getTime() < A_SWEEP_IS_DUE_AFTER_MS) {
    const at = localStamp(lastSweptAt)
    return { swept: false, lastSweptAt: at, because: `The last sweep ran at ${at}, less than five minutes ago, so no sweep is due yet.` }
  }
  return { swept: true, result: sweepDeadLetters(by, now) }
}

/** The office itself, as the actor of the server's own sweep. The same actor the reminders write as. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/**
 * START THE SERVER'S OWN DEAD-LETTER SWEEP. It runs whatever the worker's mode, and with no worker at all.
 *
 * One unref'd interval, so it never holds the server open. Each tick asks `sweepIfDue`. One tick's
 * failure is a line in the log, not a server down. The log gets a line only when the sweep wrote its
 * line or handled a letter. It starts no agent run: the sweep archives, routes, and writes at most one
 * line, delivered only to the named secretary or to nobody. The first tick is a minute after the start.
 *
 * `every` and `clock` are for a test, which drives the timer fast and moves the clock forward. Answers
 * the function that stops the timer.
 */
export function startTheDeadLetterSweep(
  log: (line: string) => void,
  every: number = THE_TIMER_ASKS_EVERY_MS,
  clock: () => Date = () => new Date(),
): () => void {
  const tick = (): void => {
    try {
      const done = sweepIfDue(theOffice(), clock())
      if (!done.swept) return
      const r = done.result
      if (r.lineId !== null || r.archived + r.routed + r.givenToTheSecretary > 0) {
        log(`The dead-letter sweep ran on its own: ${r.because}`)
      }
    } catch (err) {
      log(`The dead-letter sweep could not finish a tick: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // NAMED, so a long run is a line in the log and the loop watch can say whose a hold was (lib/named-timers.ts).
  const watch: NodeJS.Timeout = setInterval(named('the dead-letter sweep', log, tick), every)
  watch.unref()
  return () => clearInterval(watch)
}

/**
 * A SECRETARY CLAIMS ONE ADDRESSEE'S DEAD LETTERS: each secretary claims its own.
 *
 * ONLY A REGISTERED, UN-RETIRED SECRETARY MAY CLAIM. Criterion M111 has secretaries claim; nothing
 * in it widens who may claim to every agent or to the person, so this does not either — a narrower
 * door is easier to widen later than a wider one is to narrow. Any secretary may claim, not only the
 * one named to take the sweep's line: that setting decides who is woken, not who may act.
 */
export function claimDeadLetters(agentId: string, by: ParticipantRef, because: string): DeadLetterClaimOnTheWire {
  // AN AGENT IS NAMED BY ITS HANDLE IN THESE REFUSALS. The ids are stored, so each is read the stored
  // way: by id, then the one agent bearing it as a handle. Where no one agent answers, the string is
  // shown as it is.
  const named = (stored: string): string => theOneAgentAStringNames(sqlite, stored)?.handle ?? stored
  const row = db.select().from(deadLetterClaims).where(eq(deadLetterClaims.agentId, agentId)).get()
  if (row === undefined) {
    throw new PanelError(
      `No dead-letter claim is waiting for the agent "${named(agentId)}". It has not been named in a broadcast — either ` +
        'nothing is queued for it, or the threshold has not been crossed yet. GET /api/dead-letters lists what has.',
      404,
    )
  }
  // WHO MAY CLAIM IS ASKED BEFORE WHETHER IT IS ALREADY CLAIMED, so a worker reaching for an
  // addressee is told the rule it cannot cross rather than somebody else's claim it has never had.
  // AND WHO MAY CLAIM IS THE DECLARATION'S ANSWER, not a role name written here: the refusal names
  // the act in the words design/permissions/roles.json gives it, the way every refusal by role does.
  const claimants = theAgentsWhoClaimDeadLetters()
  if (by.kind !== 'agent' || !claimants.some((one) => one.id === by.id)) {
    throw new PanelError(
      `${theDeadLetterActInWords()} is not something "${by.id}" may do. Only a registered, un-retired secretary ` +
        'may claim dead letters, and this caller does not hold that card. The person\'s words: each secretary claims ' +
        'its own.',
      403,
    )
  }
  if (row.claimedAt !== null) {
    const claimer = row.claimedById === null ? '?' : row.claimedByKind === 'agent' ? named(row.claimedById) : row.claimedById
    throw new PanelError(
      `The dead letters for "${named(agentId)}" were already claimed by the ${row.claimedByKind ?? 'unknown'} ` +
        `"${claimer}" at ${row.claimedAt}. A claim is per addressee, once.`,
      409,
    )
  }
  db.update(deadLetterClaims)
    .set({ claimedByKind: by.kind, claimedById: by.id, claimedAt: nowStamp(), claimedBecause: because.trim() === '' ? null : because.trim() })
    .where(eq(deadLetterClaims.id, row.id))
    .run()
  return asClaim(db.select().from(deadLetterClaims).where(eq(deadLetterClaims.id, row.id)).get()!)
}
