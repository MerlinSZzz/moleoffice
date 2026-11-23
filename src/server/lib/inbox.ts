// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DURABLE AGENT, ITS HANDLE, AND WHAT IS WAITING FOR IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY AN INBOX IS A QUERY AND NOT A TABLE
 * ---------------------------------------------------------------------------------------
 *
 * Every message already says who it is for. An `agent_inbox` table would be a second copy of that,
 * written at the same moment, free to disagree with it the first time a write half-succeeded. So
 * the inbox is `SELECT ... FROM agent_messages WHERE recipient_agent_id = ? AND state IN (...)`,
 * which runs on `agent_messages_inbox_idx` and cannot be stale.
 *
 * ---------------------------------------------------------------------------------------
 * IT SURVIVES THE PROCESS, AND THAT IS THE WHOLE POINT OF THE KIND
 * ---------------------------------------------------------------------------------------
 *
 * A `session` is one run of a tool and it dies with the process. Until the `agent` kind existed,
 * the only way to address an agent was to name one of its past runs — so a comment written on
 * Tuesday to the agent that wrote a report could not be delivered on Wednesday, because the run was
 * gone and `deliveryOf` refused it. The words were stored and had nowhere to go.
 *
 * Nothing here is held in memory and nothing here is a cache. Stop the server, start it again, ask
 * the same handle: the same messages come back, in the same words, with the same stamps.
 * `tests/durable-identity.test.ts` proves that across two processes rather than across a function
 * call, because a test that only proves it survives a function call has not asked the question.
 *
 * ---------------------------------------------------------------------------------------
 * A HANDLE NEVER STOPS RESOLVING
 * ---------------------------------------------------------------------------------------
 *
 * Renaming an agent is allowed. Resolution is: exact match on a live agent's CURRENT handle;
 * failing that, exact match on any handle that agent has EVER had, read from the revision ledger.
 * Revisions hold the whole `data` blob, so the history of the address is already stored and nothing
 * new is written for this. When a request resolves through an old handle the reply says so, in
 * those words, rather than answering as if nothing had changed.
 *
 * The alternative — a rename that stops the old name resolving — strands whatever was addressed to
 * it, silently, which is the one thing this whole area exists to prevent.
 */

import { and, asc, eq, inArray, isNull, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { agentMessages, agentThreads, records, revisions } from '../db/schema.ts'
import { PanelError } from './panel-error.ts'
import { HANDLE_BELONGS_TO_MOLE_OFFICE, MOLE_OFFICE_HANDLE, whyThatIsNotAHandle } from '@shared/participants.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { LoginsWeek } from '@shared/logins-week.ts'
import { carriedComments, deliveryWordOf, WAITING_WORDS, type MessageState } from './dispatch.ts'
import { checkSubtraction, type InboxBucket, type LeftOutCounts, type LeftOutGroup } from '@shared/disclosure.ts'

/** The kind whose records are durable agents. Written out once so a typo cannot widen a query. */
export const AGENT_KIND = 'agent'

/** The columns of a record `isAnActiveAgent` reads: the records table's own, or a subquery's by its alias. */
export interface TheColumnsOfAnAgentRecord {
  kind: SQLWrapper
  data: SQLWrapper
  deletedAt: SQLWrapper
}

/**
 * THE CONDITION THAT A RECORD IS AN ACTIVE AGENT: a live record of the agent kind whose stored state is "active", one
 * that may still be given work. The roster's read of a project's agents and the list of the runs that could serve an
 * active agent both ask it, so one place says who is active (decision srwXywF1oYIs). The kind and the state are
 * handed to SQL as values.
 */
export function isAnActiveAgent(record: TheColumnsOfAnAgentRecord): SQL {
  // ABSENT IS NOT ASSUMED ACTIVE. The kind requires `state`, so an agent without one is a record
  // that was written round the validator, and drawing it as active would be a guess about
  // whether the owner may still give it work. Its state reads as null here, which equals nothing.
  return and(
    eq(record.kind, AGENT_KIND),
    isNull(record.deletedAt),
    eq(sql`json_extract(${record.data}, '$.state')`, 'active'),
  ) as SQL
}

/**
 * Whether a string is a handle at all, said as a sentence rather than as a pattern. The rule is the
 * registry's, written once in src/shared/participants.ts; it is passed on from here for the readers
 * that have always asked this file.
 */
export { whyThatIsNotAHandle }

/** One agent record, read as an agent. */
export interface AgentIdentity {
  id: string
  handle: string
  title: string
  state: string
  runtime: string | null
  /** The handle the caller asked by, when it was not the current one. Null when it was. */
  resolvedThrough: string | null
}

function handleOf(record: PanelRecord): string {
  const data = record.data as Record<string, unknown>
  const handle = data['handle']
  return typeof handle === 'string' ? handle : ''
}

function asIdentity(record: PanelRecord, resolvedThrough: string | null): AgentIdentity {
  const data = record.data as Record<string, unknown>
  const runtime = data['runtime']
  const state = data['state']
  return {
    id: record.id,
    handle: handleOf(record),
    title: record.title,
    state: typeof state === 'string' ? state : 'active',
    runtime: typeof runtime === 'string' && runtime !== '' ? runtime : null,
    resolvedThrough,
  }
}

/** Every live agent record in one project. A scan over a handful of rows; no index and none wanted. */
export function agentsIn(workspaceId: string): PanelRecord[] {
  return db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, AGENT_KIND), sql`${records.deletedAt} IS NULL`))
    .all() as unknown as PanelRecord[]
}

/**
 * EVERY HANDLE ONE AGENT HAS EVER HAD, read from the revision ledger.
 *
 * Nothing new is written for this. A revision holds the whole `data` blob, so the history of the
 * address is already stored, and asking the ledger is what makes a rename safe rather than a
 * promise that nobody renames anything.
 */
export function handlesEverHeldBy(recordId: string): string[] {
  const rows = db.select({ data: revisions.data }).from(revisions).where(eq(revisions.recordId, recordId)).all()
  const seen = new Set<string>()
  for (const row of rows) {
    // `revisions.data` IS DECLARED `mode: 'json'`, so drizzle hands back an object rather than text.
    // The first version of this function tested for a string and skipped every row, so a renamed
    // agent's old handle resolved to nothing and the mail it addressed was stranded — the exact
    // failure this function exists to prevent, written by the function. A row that arrives as text
    // is read as text, because a database written by something else is not this reader's to refuse.
    let data: unknown = row.data
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        // A REVISION MOLE OFFICE CANNOT READ IS NOT AN EMPTY ONE, and repairing it is not this function's
        // business. It contributes no handle, which is the honest answer.
        continue
      }
    }
    if (typeof data !== 'object' || data === null) continue
    const handle = (data as Record<string, unknown>)['handle']
    if (typeof handle === 'string' && handle !== '') seen.add(handle)
  }
  return [...seen]
}

/**
 * THE AGENT RECORD THIS HANDLE NAMES IN ONE PROJECT, by its current handle or by any it has ever
 * had.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS NOT participants.ts's `agentByHandle`, THOUGH BOTH CARRY THE NAME
 * ---------------------------------------------------------------------------------------
 *
 * They answer different questions, and neither is a substitute for the other.
 *
 * THIS ONE works on records of kind `agent` — a durable agent's record inside ONE project — so it is
 * per-project. It matches the record's CURRENT handle first, then any handle that record has EVER
 * held, read from its revisions, because a rename must not strand mail addressed to the old name.
 * Handle uniqueness inside the project is guarded by `assertHandleIsFree` below. The record's own id
 * is what the returned `AgentIdentity.id` carries.
 *
 * `agentByHandle` in lib/participants.ts works on the installation-wide `agents` registry and
 * matches the handle column alone. It knows nothing about a record's history and nothing about a
 * project, and it does not read an agent's id at all. A STORED agent reference — an id written
 * earlier and read back now — goes through neither function: it is read by exact id first and then
 * by the one agent bearing it as a handle, through the readers in lib/agent-references.ts, so a
 * string two agents could answer names nobody rather than picking one.
 *
 * Null here means no agent record in this project has ever had the handle — which is a real answer
 * and is what the route turns into a 404 naming the handles that DO exist. Nothing is created from
 * a handle nobody recognises: a mistyped handle that opened a second inbox would receive, quietly,
 * nothing.
 *
 * ---------------------------------------------------------------------------------------
 * A RETIRED RECORD AND A LIVE ONE MAY SHARE A HANDLE, AND THE LIVE ONE ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * A retired agent's handle is free again (criterion I3), inside a project as well as across the
 * installation: `assertHandleIsFree` below lets a retired record give its handle up. So the records
 * that are not retired are asked first, by current handle and then by any handle they ever had; only
 * where none of them answers are the retired records asked, in the same order. Mail to the name goes
 * to the agent at work under it, and a retired agent is still found by the name it had when no live
 * agent has taken it.
 */
export function agentByHandle(handle: string, workspaceId: string): AgentIdentity | null {
  const every = agentsIn(workspaceId)
  const atWork = every.filter((record) => !isRetired(record))
  const retired = every.filter((record) => isRetired(record))
  for (const group of [atWork, retired]) {
    const current = group.find((record) => handleOf(record) === handle)
    if (current !== undefined) return asIdentity(current, null)
    for (const record of group) {
      if (handlesEverHeldBy(record.id).includes(handle)) return asIdentity(record, handle)
    }
  }
  return null
}

/** Whether an agent record says it is retired. */
function isRetired(record: PanelRecord): boolean {
  return (record.data as Record<string, unknown>)['state'] === 'retired'
}

/** Every handle in use in this project, current and past, with the record that holds each. */
export function handlesInUse(workspaceId: string): Map<string, PanelRecord> {
  const held = new Map<string, PanelRecord>()
  for (const record of agentsIn(workspaceId)) {
    for (const handle of [handleOf(record), ...handlesEverHeldBy(record.id)]) {
      if (handle !== '' && !held.has(handle)) held.set(handle, record)
    }
  }
  return held
}

/**
 * REFUSE A HANDLE ANOTHER LIVE AGENT HOLDS, OR HAS EVER HELD.
 *
 * Two agents sharing a handle would deliver one agent's mail to the other, silently. The refusal is
 * the only enforcement there is — `data` is JSON and the records title index is not unique — which
 * is why it is a test as well as a sentence.
 *
 * A RETIRED RECORD GIVES ITS HANDLES UP. Criterion I3: a handle is unique
 * among live agents and free again after retirement. So only records that are not retired hold a
 * handle here. `agentByHandle` above sends mail for a shared name to the live record.
 */
export function assertHandleIsFree(handle: string, workspaceId: string, exceptRecordId: string | null): void {
  const complaint = whyThatIsNotAHandle(handle)
  if (complaint !== null) throw new PanelError(complaint, 400)
  // AND ONE HANDLE BELONGS TO THE PRODUCT. An agent record holding `mole-office` would be mapped onto
  // Mole Office's own registry row by `keepTheAgentRegistryInStep`, and retiring that record would
  // then retire Mole Office. The rule is declared once, in `whyHandleIsRefused` in
  // shared/participants.ts, which the registry also reads — so the record write is refused here with
  // the sentence, and the mapping never happens there even if a row reached the table another way.
  if (handle === MOLE_OFFICE_HANDLE) throw new PanelError(HANDLE_BELONGS_TO_MOLE_OFFICE, 409)
  const holder = agentsIn(workspaceId).find(
    (record) =>
      record.id !== exceptRecordId &&
      !isRetired(record) &&
      (handleOf(record) === handle || handlesEverHeldBy(record.id).includes(handle)),
  )
  if (holder === undefined) return
  throw new PanelError(
    `The handle "${handle}" already belongs to "${holder.title}" (${holder.id}) in this project, or did once. ` +
      `Two agents sharing a handle would deliver one agent's mail to the other. Nothing was written. Pick ` +
      `another handle, or address that agent instead.`,
    409,
  )
}

// ============================================================================ the inbox

/** One message waiting for an agent, with everything a reader needs to act on it. */
export interface InboxItem {
  messageId: string
  threadId: string
  threadTitle: string
  role: string
  intent: string
  /** WHAT WAS SAID, VERBATIM. Never summarised, never classified away, never replaced. */
  body: string
  wroteAt: string
  wroteBy: string
  dispatch: { state: MessageState; sentAt: string | null; stateAt: string | null }
  /** The comment these words came from, when they came from one. */
  fromAnnotationId: string | null
  /**
   * EVERY COMMENT THESE WORDS CAME FROM, in order: one, several when a sent review put several
   * comments for this agent into one message, or none. Read by
   * `carriedComments` in lib/dispatch.ts.
   */
  carries: string[]
}

export interface InboxReading {
  agent: AgentIdentity
  messages: InboxItem[]
  counts: Record<MessageState, number>
  /** How many were left out by the limit. Named rather than hidden. */
  leftOut: number
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<InboxBucket>[]
  says: string
  /**
   * EACH MODEL LOGIN'S WEEK, on a secretary's inbox only (wave 13p round 29; lib/logins-week.ts). The secretaries are
   * the ones told when a login passes 50% or 80%, and this is the read a secretary makes of its own work, so the
   * figures they are told about are here to look at. Absent for any other agent.
   */
  loginsWeek?: LoginsWeek
}

/** At most this many messages come back in one reading, with the rest counted. */
const MAX_ITEMS = 200

/**
 * THE CONVERSATION MESSAGES FOR THIS AGENT, IN THE STATES ASKED FOR. **It changes no state.**
 *
 * It reads `agent_messages` only: the messages of the conversations a person, a comment or a run
 * starts. A message record, the kind a supervisor sends its worker through POST /api/records, has
 * delivery rows instead, and `everythingWaitingFor` in lib/handles.ts and `messagesWaitingFor` in
 * lib/messages.ts read those. `agent.id` here is the agent RECORD id, which is what
 * `recipient_agent_id` stores for an agent that has a record; a delivery row names the registry id.
 *
 * Reading an inbox is not receiving it. A route that quietly moved a message to `delivered` because
 * somebody looked at a screen would be the first engineering rule broken: the reply would say an
 * agent had been given the words when what happened was that a person opened a page.
 */
export function inboxOf(
  agent: AgentIdentity,
  workspaceId: string,
  opts: { states?: readonly MessageState[]; limit?: number } = {},
): InboxReading {
  const words = opts.states ?? WAITING_WORDS
  const limit = Math.max(1, Math.min(opts.limit ?? MAX_ITEMS, MAX_ITEMS))

  const rows = db
    .select({
      id: agentMessages.id,
      threadId: agentMessages.threadId,
      threadTitle: agentThreads.title,
      role: agentMessages.role,
      intent: agentMessages.intent,
      body: agentMessages.body,
      state: agentMessages.state,
      sentAt: agentMessages.sentAt,
      stateAt: agentMessages.stateAt,
      fromAnnotationId: agentMessages.fromAnnotationId,
      carries: agentMessages.carries,
      context: agentMessages.context,
      createdAt: agentMessages.createdAt,
      createdBy: agentMessages.createdBy,
    })
    .from(agentMessages)
    .innerJoin(agentThreads, eq(agentMessages.threadId, agentThreads.id))
    .where(
      and(
        eq(agentMessages.recipientAgentId, agent.id),
        eq(agentThreads.workspaceId, workspaceId),
        inArray(agentMessages.state, [...words]),
      ),
    )
    .orderBy(asc(agentMessages.sentAt))
    .all()

  const counts = { queued: 0, sent: 0, delivered: 0, picked_up: 0, handled: 0, failed: 0 } as Record<
    MessageState,
    number
  >
  for (const row of rows) counts[deliveryWordOf(row)] += 1

  const messages: InboxItem[] = rows.slice(0, limit).map((row) => ({
    messageId: row.id,
    threadId: row.threadId,
    threadTitle: row.threadTitle,
    role: row.role,
    intent: row.intent,
    body: row.body,
    wroteAt: row.createdAt,
    wroteBy: row.createdBy,
    dispatch: { state: deliveryWordOf(row), sentAt: row.sentAt, stateAt: row.stateAt },
    fromAnnotationId: row.fromAnnotationId,
    carries: carriedComments(row).map((one) => one.commentId),
  }))

  const leftOut = rows.length - messages.length
  const leftOutGroups: LeftOutGroup<InboxBucket>[] = [{
    cause: 'budget',
    bucket: 'message_limit',
    count: leftOut,
    ids: rows.slice(messages.length).map((row) => row.id),
  }]
  const subtraction: LeftOutCounts = {
    candidates: rows.length,
    carried: messages.length,
    leftOut,
    shortened: 0,
  }
  checkSubtraction('inboxOf messages', subtraction, leftOutGroups)
  // IT SAYS WHAT IT COVERS, AND NAMES NO REQUEST. This reading lists messages in conversations only
  // (`agent_messages`). A message filed as a record of kind `message` lives in `records` and
  // `message_delivery`, nothing copies it here, so it is never in this list, whatever its state.
  // Measured 25 September 2026: a supervisor's message to its worker was in no state here
  // (tests/a-worker-reads-its-messages-at-the-waiting-door.test.ts). The sentence names no request
  // because a copy carries it to a reader with no API (criterion B19); the inbox route adds the
  // doors that list those messages.
  const asked = words.join(', ')
  const says =
    (rows.length === 0
      ? `No conversation message for ${agent.handle} is in the states asked for (${asked}).`
      : `${String(rows.length)} conversation message${rows.length === 1 ? '' : 's'} for ${agent.handle} ` +
        `in the states asked for (${asked})` +
        (leftOut === 0 ? '.' : `, and ${String(leftOut)} of them are not in this reading.`) +
        (agent.resolvedThrough === null
          ? ''
          : ` You asked as "${agent.resolvedThrough}", which is now "${agent.handle}".`)) +
    ` This lists only messages in conversations. A message filed as a record of kind message is not in it, ` +
    `even when it is to ${agent.handle}.`

  return { agent, messages, counts, leftOut: subtraction.leftOut, subtraction, leftOutGroups, says }
}

/**
 * HOW MANY MESSAGES ARE WAITING FOR THIS AGENT AND NOBODY HAS FINISHED WITH.
 *
 * Read by the delete guard, which refuses to remove an agent that would strand them. It counts the
 * three waiting words and not the two finished ones: a handled message is nobody's to lose.
 */
export function messagesStillWaitingFor(agentId: string): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(agentMessages)
    .where(and(eq(agentMessages.recipientAgentId, agentId), inArray(agentMessages.state, [...WAITING_WORDS])))
    .get()
  return row?.n ?? 0
}
