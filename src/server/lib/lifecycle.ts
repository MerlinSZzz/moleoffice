// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE AN AGENT'S WORK STATE COMES FROM. ONE STORE, ONE WRITER, NO CACHED CURRENT VALUE.
 *
 * ---------------------------------------------------------------------------------------
 * THE CURRENT WORK STATE IS THE NEWEST ROW, AND NOTHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * `agent_work_transitions` holds one row per move. The agent's work state RIGHT NOW is the newest
 * row for that agent, read at the moment somebody asks. **No column anywhere holds a work state,
 * nothing caches it, and no duration is stored** — *Working duration* is arithmetic over two rows,
 * and storing it would be the same fact in two places.
 *
 * That is cheaper as well as truer. The whole database holds 104 session records, 2,382 change rows
 * and 1 run, and the read is one indexed query on `(agent_id, at)`.
 *
 * **An agent with no rows has no work state.** It does not read `Standing by`, and that is not a
 * technicality: *Standing by* is a claim that availability is INTENTIONAL, so defaulting to it would
 * put a sentence on the screen that nobody said. The honest answer has its own words, in
 * `@shared/lifecycle.ts`, and every agent is in that state on the day this ships.
 *
 * ---------------------------------------------------------------------------------------
 * THE SYSTEM NEVER WRITES A WORK STATE
 * ---------------------------------------------------------------------------------------
 *
 * A work state is written by an agent about itself, or by a person. A process dying is not a
 * decision about the work — round ten's addendum, section 1: *"PanelX may consider an Agent's work
 * unfinished even when its provider process died because of an API error."* So `actor_type` may be
 * `human` or `agent` and never `system`, and the writer refuses anything else by name.
 *
 * An agent saying *I am finished* is a CLAIM, and the product takes it and records who made it. The
 * alternative is Mole Office deciding from a change log whether somebody else's responsibility has
 * ended, which would be wrong often and wrong silently. What a false Finished costs is bounded: the
 * agent stops being a watchdog candidate, and one message reopens it. It closes no attachment,
 * stops no runtime, empties no inbox and retires nobody.
 *
 * ---------------------------------------------------------------------------------------
 * TWO GUARDS, BECAUSE ONE OF THEM CAN BE WALKED PAST
 * ---------------------------------------------------------------------------------------
 *
 * `tests/one-work-state-door.test.ts` reads every file under `src/` and fails if a second place
 * inserts into `agent_work_transitions`. **A SOURCE SCAN CANNOT SEE AN ALIAS**:
 * `const t = agentWorkTransitions; db.insert(t).values(...)` is invisible to it.
 *
 * So the scan is paired with a guard that fires when the code RUNS. `installWorkStateDoorGuard`
 * below puts temporary SQLite triggers on the table: an INSERT from outside `moveWorkStateTo` is
 * aborted, and an UPDATE of any row is aborted outright because a transition is never rewritten.
 * `workStateDoorGuard()` reports WHY it is off when it is off, so a guard that failed to install
 * cannot look like a guard that never fired. `src/server/lib/dispatch.ts` is the template and the
 * two are deliberately the same shape.
 *
 * **A DELETE is not guarded, and that is a decision.** These rows are a MEASURED table, and
 * `src/server/db/migrate.ts` states in writing that a prune of a measured table must stay allowed.
 * A trigger here would refuse the prune the migration guard already permits.
 *
 * ---------------------------------------------------------------------------------------
 * THE TABLE IS NOT CREATED YET, AND THIS FILE SAYS SO RATHER THAN FAILING STRANGELY
 * ---------------------------------------------------------------------------------------
 *
 * The migration that creates it is written, proved and HELD, in
 * `held-migrations/`, because this campaign has one announced window and the owner
 * runs it. Until then every function here answers with a refusal naming that file, rather than a
 * SQLite error about a missing table.
 */

import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import { and, desc, eq, sql } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'

import { nowStamp } from '@shared/time.ts'
import { NOBODY_HAS_SAID, WORK_STATE, WORK_STATES, isWorkState, type WorkState } from '@shared/lifecycle.ts'
import { actorTypeWord, kindWord } from '@shared/words.ts'
import { db, sqlite } from '../db/client.ts'
import { agentWorkTransitions } from '../db/lifecycle-tables.ts'
import { ranAsIn } from '@shared/ran-as.ts'
import { getRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

// ============================================================================ the runtime guard

/** True only while `moveWorkStateTo` is inside its own write. Read from SQL by the triggers below. */
let doorIsOpen = false

/** Whether the triggers are on this connection, and — when they are not — the reason. */
let guardState: { installed: boolean; why: string } = { installed: false, why: 'nothing has tried to install it yet' }

/** What the guard is doing right now. `tests/one-work-state-door.test.ts` asserts this says yes. */
export function workStateDoorGuard(): { installed: boolean; why: string } {
  return guardState
}

const INSERT_TRIGGER = 'mole_office_one_work_state_door'
const UPDATE_TRIGGER = 'mole_office_a_transition_is_never_rewritten'
const GUARD_FUNCTION = 'mole_office_work_state_door_is_open'

/** Whether this database has the transitions table yet. The held migration is what creates it. */
export function transitionStoreExists(): boolean {
  return (
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_work_transitions'")
      .get() !== undefined
  )
}

/** The refusal every function here gives when the migration has not been run on this database. */
const NO_STORE_YET =
  'This database has no agent_work_transitions table, so nothing can be read from it or written to it. The ' +
  'migration that creates it is written and proved and deliberately NOT registered: it is ' +
  'held-migrations/agent-lifecycle-tables.sql, and it runs in the one announced migration ' +
  'window, which the person opens. Nothing was written and nothing was guessed at.'

/**
 * Put the runtime half of the one-work-state-door guard on this connection.
 *
 * Idempotent, and safe to call before the table exists — which is the case on every database today.
 * It then says so in `workStateDoorGuard().why` rather than pretending to be on, and the next call
 * installs it. **Silence would be the failure this guard exists to prevent**: a guard that is not
 * there looks exactly like a guard that is there and never fired.
 */
export function installWorkStateDoorGuard(): { installed: boolean; why: string } {
  if (guardState.installed) return guardState

  if (!transitionStoreExists()) {
    guardState = {
      installed: false,
      why:
        'this database has no agent_work_transitions table yet, so there is nothing to put a trigger on. The ' +
        'migration that creates it is held in held-migrations/ until the announced window.',
    }
    return guardState
  }

  // `deterministic: false` — it answers differently on two identical calls on purpose, because what
  // it reports is whether this process is inside `moveWorkStateTo` right now. Declaring it
  // deterministic would let SQLite fold the call away and the guard would never fire.
  sqlite.function(GUARD_FUNCTION, { deterministic: false, varargs: false }, () => (doorIsOpen ? 1 : 0))
  sqlite.exec(`DROP TRIGGER IF EXISTS temp.${INSERT_TRIGGER}`)
  sqlite.exec(
    `CREATE TEMP TRIGGER ${INSERT_TRIGGER} BEFORE INSERT ON agent_work_transitions ` +
      `WHEN ${GUARD_FUNCTION}() = 0 ` +
      `BEGIN SELECT RAISE(ABORT, 'agent_work_transitions was written from outside moveWorkStateTo in ` +
      `src/server/lib/lifecycle.ts. That table is where Mole Office keeps what an agent said it was doing, and one ` +
      `writer is what makes it impossible for two screens to disagree about it. Nothing was written.'); END`,
  )
  sqlite.exec(`DROP TRIGGER IF EXISTS temp.${UPDATE_TRIGGER}`)
  sqlite.exec(
    `CREATE TEMP TRIGGER ${UPDATE_TRIGGER} BEFORE UPDATE ON agent_work_transitions ` +
      `BEGIN SELECT RAISE(ABORT, 'a work-state transition is never rewritten. What an agent said it was doing at ` +
      `a moment is what it said; a later write would be a rewrite of history rather than a new fact. File another ` +
      `transition instead. Nothing was written.'); END`,
  )
  guardState = { installed: true, why: 'two temporary triggers on this connection refuse the write' }
  return guardState
}

// The guard goes on as soon as anything reaches this file, so a foreign write is refused whether or
// not `moveWorkStateTo` has ever been called in this process.
installWorkStateDoorGuard()

// ============================================================================ reading

/** One work-state move, as it is read back. */
export interface Transition {
  id: string
  agentId: string
  workspaceId: string
  from: WorkState | null
  to: WorkState
  at: string
  because: string
  /** Whatever the writer recorded as evidence, as it was stored. Null when nothing was recorded. */
  evidence: unknown
  actorType: 'human' | 'agent'
  actorId: string
  attachmentId: string | null
  relatedKind: string | null
  relatedId: string | null
}

/** What an agent's work state reads as, including the case where nobody has said. */
export interface WorkStateReading {
  agentId: string
  /** The word, or null when this agent has no transition at all. */
  state: WorkState | null
  /** The sentence a person reads. When `state` is null it is the honest "nobody has said" one. */
  says: string
  /** When it became this, or null when nobody has said. */
  since: string | null
  /** Why, in the words of whoever moved it. Null when nobody has said. */
  because: string | null
  /** Who said so, so the surface can draw *this agent said so* rather than *this is so*. */
  saidBy: { type: 'human' | 'agent'; id: string } | null
  /** The move before this one, when there is one. Two rows, because the envelope asks for two. */
  previous: Transition | null
}

/** Read one stored row into a transition, refusing a word that is not one of the five. */
function transitionFrom(row: typeof agentWorkTransitions.$inferSelect): Transition {
  if (!isWorkState(row.toState)) {
    throw new PanelError(
      `Transition ${row.id} says an agent moved to "${row.toState}", and that is not one of the five work-state ` +
        `words (${WORK_STATES.join(', ')}). Nothing has been guessed at.`,
      500,
    )
  }
  if (row.fromState !== null && !isWorkState(row.fromState)) {
    throw new PanelError(
      `Transition ${row.id} says an agent moved FROM "${row.fromState}", and that is not one of the five ` +
        `work-state words (${WORK_STATES.join(', ')}). Nothing has been guessed at.`,
      500,
    )
  }
  if (row.actorType !== 'human' && row.actorType !== 'agent') {
    throw new PanelError(
      `Transition ${row.id} says it was caused by a "${actorTypeWord(row.actorType).text}". A work state is written by an agent about ` +
        'itself or by a person, and by nothing else. Nothing has been guessed at.',
      500,
    )
  }
  let evidence: unknown = null
  if (row.evidence !== null) {
    try {
      evidence = JSON.parse(row.evidence)
    } catch {
      // The stored text was not JSON. It is handed back as the text it is rather than dropped: what
      // somebody recorded as evidence is evidence about the writer even when it is malformed.
      evidence = row.evidence
    }
  }
  return {
    id: row.id,
    agentId: row.agentId,
    workspaceId: row.workspaceId,
    from: row.fromState,
    to: row.toState,
    at: row.at,
    because: row.because,
    evidence,
    actorType: row.actorType,
    actorId: row.actorId,
    attachmentId: row.attachmentId,
    relatedKind: row.relatedKind,
    relatedId: row.relatedId,
  }
}

/**
 * ONE AGENT'S TRANSITIONS, NEWEST FIRST.
 *
 * `at` THEN `rowid`, AND THE SECOND HALF IS LOAD-BEARING RATHER THAN TIDY. A stamp has one-second
 * resolution, so two moves in the same second are ordinary rather than rare, and then `at` alone
 * cannot say which came second. **The tie-break may not be `id`**: these ids are nanoids, so their
 * order is random, and an agent that moved Working → Reporting inside one second would read back as
 * either — which is how the current work state comes to be a coin toss. It was written that way
 * first and two tests in `tests/one-work-state-door.test.ts` caught it.
 *
 * `rowid` is the order SQLite appended the rows in. `endTimeFromChangeLog` in
 * `src/server/lib/resources.ts` and `whenItWasStamped` in `src/server/db/annotation-state.ts` use
 * the same tie-break. `LIFECYCLE_TABLES` in `src/server/db/lifecycle-tables.ts` names tables left out
 * of archives, so a restore does not give these rows new rowids. `installWorkStateDoorGuard` in this
 * file installs a temporary trigger that refuses UPDATE on the server's own connection.
 */
export function workStateHistory(agentId: string, workspaceId: string, limit = 50): Transition[] {
  // THE AGENT IS CHECKED BEFORE THE STORE IS, AND THE ORDER IS THE ANSWER TO A QUESTION. An id that
  // names no agent in this project must be refused as that, not answered "nobody has said what this
  // agent is doing" — which would be a sentence about an agent that does not exist here — and not
  // answered with the store's own refusal, which would tell a caller in the wrong project that the
  // only thing wrong was a migration. `tests/by-id-boundary.test.ts` is what holds this order.
  assertIsALiveAgent(agentId, workspaceId)
  if (!transitionStoreExists()) throw new PanelError(NO_STORE_YET, 503)
  const rows = db
    .select()
    .from(agentWorkTransitions)
    .where(and(eq(agentWorkTransitions.agentId, agentId), eq(agentWorkTransitions.workspaceId, workspaceId)))
    .orderBy(desc(agentWorkTransitions.at), sql`rowid desc`)
    .limit(limit)
    .all()
  return rows.map(transitionFrom)
}

/**
 * WHAT THIS AGENT'S WORK STATE IS RIGHT NOW, computed from the store and cached nowhere.
 *
 * An agent with no transitions reads *nobody has said what this agent is doing*, which is a real
 * answer and is what the surface draws — not Standing by, not Working, not a blank.
 */
export function workStateOf(agentId: string, workspaceId: string): WorkStateReading {
  const rows = workStateHistory(agentId, workspaceId, 2)
  const newest = rows[0]
  if (newest === undefined) {
    return {
      agentId,
      state: null,
      says: NOBODY_HAS_SAID,
      since: null,
      because: null,
      saidBy: null,
      previous: null,
    }
  }
  return {
    agentId,
    state: newest.to,
    says: WORK_STATE[newest.to].sentence,
    since: newest.at,
    because: newest.because,
    saidBy: { type: newest.actorType, id: newest.actorId },
    previous: rows[1] ?? null,
  }
}

// ============================================================================ the one writer

/** What one move may carry beside the word and the reason. */
export interface MoveWorkState {
  workspaceId: string
  actor: Actor
  /** Why it moved, in one plain sentence. Empty is refused. */
  because: string
  /**
   * The attachment this move was made from. REQUIRED of an agent, optional for a person.
   *
   * It is how *an agent may only move its own work state* is checked: the attachment says which
   * durable agent that run is working as, and the writer compares it with the agent being moved.
   * An `actor_id` cannot answer that — measured, `api_calls.actor_id` holds free strings like
   * `claude-code` and `r10-wave-14`, and not one of them is a record id.
   */
  attachmentId?: string
  /** Anything the writer wants recorded about what this was read from. Stored as JSON. */
  evidence?: unknown
  /** The checkpoint, message, task or report this move was about. */
  relatedKind?: string
  relatedId?: string
}

/** What one move did, so a caller can report it without asking the database again. */
export interface WorkStateMoved {
  transition: Transition
  /** What the agent's work state now reads as, from the same write. */
  now: WorkStateReading
}

/**
 * THE ONLY THING IN `src/` THAT WRITES A ROW OF `agent_work_transitions`.
 *
 * **Every move between two DIFFERENT words is legal.** The work-state graph is not ordered, and
 * that is deliberate: `MESSAGE_STATES` is forward-only and is the right shape for a message, and
 * the wrong shape here, because `Reporting → Working` is required by the owner's own list and an
 * ordering would refuse it. A restricted graph means a real event has nowhere to go, and the writer
 * then lies about it.
 *
 * **A move to the word it already holds is refused.** It carries no information, and a writer that
 * accepts one can be used as a heartbeat — which is the thing the owner's section 15 forbids.
 *
 * **A move with no reason is refused.** The reason is the fact `changes` cannot carry and is the
 * whole argument for a store of its own.
 *
 * **`at` is the server's clock.** A caller-supplied moment is a fabricated observation, and section
 * 15 refuses those by name.
 */
export function moveWorkStateTo(agentId: string, to: WorkState, input: MoveWorkState): WorkStateMoved {
  // The same order as the read above, and for the same reason.
  assertIsALiveAgent(agentId, input.workspaceId)
  if (!transitionStoreExists()) throw new PanelError(NO_STORE_YET, 503)

  if (!isWorkState(to)) {
    throw new PanelError(
      `"${String(to)}" is not one of the five things an agent's work can be doing. They are: ` +
        `${WORK_STATES.join(', ')}. Nothing was written.`,
      400,
    )
  }

  const because = input.because.trim()
  if (because === '') {
    throw new PanelError(
      'Say why the work state moved, in one plain sentence. A move with no reason is a row nobody can act on ' +
        'later, and the reason is the whole point of keeping this history at all. Nothing was written.',
      400,
    )
  }

  if (input.actor.type !== 'human' && input.actor.type !== 'agent') {
    throw new PanelError(
      `A work state is written by an agent about itself, or by a person, and this request says it is a ` +
        `"${input.actor.type}". THE SYSTEM NEVER WRITES A WORK STATE: a process ending is not a decision about ` +
        'the work, and recording one as if it were is how an agent that died mid-task comes to read as finished. ' +
        'Nothing was written.',
      400,
    )
  }

  const attachmentId = assertTheCallerMayMoveThisAgent(agentId, input)

  const before = workStateOf(agentId, input.workspaceId)
  if (before.state === to) {
    throw new PanelError(
      `That agent already reads "${WORK_STATE[to].word}", since ${before.since}, because: ${before.because}. ` +
        'Moving it to the word it already holds records nothing that happened, and a writer that accepted it ' +
        'could be used as a heartbeat. Nothing was written.',
      409,
    )
  }

  const row = {
    id: anOfficeId(),
    workspaceId: input.workspaceId,
    agentId,
    fromState: before.state,
    toState: to,
    at: nowStamp(),
    because,
    evidence: input.evidence === undefined ? null : JSON.stringify(input.evidence),
    actorType: input.actor.type,
    actorId: input.actor.id,
    attachmentId,
    relatedKind: input.relatedKind ?? null,
    relatedId: input.relatedId ?? null,
  }

  // The runtime guard reads this flag from SQL. It is closed again whatever happens, so a refusal
  // inside the write does not leave the door open for the next statement on this connection.
  installWorkStateDoorGuard()
  doorIsOpen = true
  try {
    // THE COLUMNS ARE NAMED IN A LITERAL AND NOT HANDED IN THROUGH A VARIABLE, for the source scan
    // rather than for the reader: tests/one-work-state-door.test.ts reads which table every insert
    // in `src/` names, and `.values(built)` is a write whose table it can see but whose columns it
    // cannot say.
    db.insert(agentWorkTransitions)
      .values({
        id: row.id,
        workspaceId: row.workspaceId,
        agentId: row.agentId,
        fromState: row.fromState,
        toState: row.toState,
        at: row.at,
        because: row.because,
        evidence: row.evidence,
        actorType: row.actorType,
        actorId: row.actorId,
        attachmentId: row.attachmentId,
        relatedKind: row.relatedKind,
        relatedId: row.relatedId,
      })
      .run()
  } finally {
    doorIsOpen = false
  }

  return { transition: transitionFrom(row), now: workStateOf(agentId, input.workspaceId) }
}

/** Refuse an agent id that names nothing, names something else, or lives in another project. */
function assertIsALiveAgent(agentId: string, workspaceId: string): void {
  const record = getRecord(agentId)
  if (record === null || record.deletedAt !== null) {
    throw new PanelError(
      `No agent has the id ${agentId}, so there is no work state to move. A durable agent is a record of kind ` +
        '"agent". Nothing was written.',
      404,
    )
  }
  if (record.kind !== 'agent') {
    throw new PanelError(
      `${agentId} is a ${kindWord(record.kind).text}${quotedUnlessAMessage(record, ' — ', ' —')} and not a durable agent. Nothing was ` +
        'written.',
      400,
    )
  }
  if (record.workspaceId !== workspaceId) {
    // 404 AND NOT 400, and the difference is what the caller is being told. From inside this
    // project that agent does not exist, which is what "not found" means; a 400 would say the
    // request was malformed, and it was not. Every other by-id door in this server answers a
    // cross-project id the same way, and `tests/by-id-boundary.test.ts` holds all of them to it.
    throw new PanelError(
      `"${record.title}" is an agent in "${record.workspaceId}" and this request is about "${workspaceId}". ` +
        'Nothing was written.',
      404,
    )
  }
}

/**
 * AN AGENT MAY ONLY MOVE ITS OWN WORK STATE. A PERSON MAY MOVE ANYBODY'S.
 *
 * The check is the attachment, not the actor id: a run says which durable agent it is working as in
 * `data.ranAs`, and that is a record id. `actor_id` is what the caller typed and names no agent —
 * measured, the values in the corpus are `claude-code`, `r10-wave-14`, and one that says in words that it is not the owner's id.
 *
 * Returns the attachment id to store on the row, or null when a person moved it from the browser.
 */
function assertTheCallerMayMoveThisAgent(agentId: string, input: MoveWorkState): string | null {
  if (input.attachmentId === undefined) {
    if (input.actor.type === 'agent') {
      throw new PanelError(
        'An agent moving a work state has to say which attachment it is moving it from, because that is what ' +
          'says which durable agent this run is working as. An actor name is what the caller typed and names no ' +
          'agent. Nothing was written.',
        400,
      )
    }
    return null
  }

  const record = getRecord(input.attachmentId)
  if (record === null || record.deletedAt !== null || record.kind !== 'session') {
    throw new PanelError(
      `No attachment with id ${input.attachmentId}. An attachment is a record of kind "session". Nothing was ` +
        'written.',
      404,
    )
  }
  if (record.workspaceId !== input.workspaceId) {
    throw new PanelError(
      `That attachment is in "${record.workspaceId}" and this request is about "${input.workspaceId}". Nothing ` +
        'was written.',
      400,
    )
  }

  const ranAs = ranAsIn(record, input.workspaceId)
  if (input.actor.type === 'agent' && ranAs !== agentId) {
    throw new PanelError(
      ranAs === null
        ? `That attachment does not say which durable agent it is working as, so it cannot move ${agentId}'s work ` +
          'state. An agent may only move its own. Nothing was written.'
        : `That attachment is working as ${ranAs} and this move is about ${agentId}. An agent may only move its ` +
          'own work state; a person may move anybody\'s. Nothing was written.',
      403,
    )
  }
  return record.id
}

// ============================================================================ what is not here

/**
 * WHAT THIS FILE DELIBERATELY DOES NOT DO, so that the next reader does not add it.
 *
 * - **It reads no presence.** Presence is a separate reading over separate inputs, in
 *   `src/server/lib/presence.ts`, and nothing here takes one or returns one. All fifteen pairs of
 *   the two vocabularies occur.
 * - **It closes no attachment.** Finished is a statement about a responsibility, not about a run.
 *   Closing is `src/server/lib/attachments.ts`, and it touches no process either.
 * - **It starts nothing and wakes nobody.** The watchdog READING is a later step and lives in the
 *   server; the wake itself is the Agent Host's, outside `src/`, where a process may be started.
 * - **It never writes a transition dated in the past.** There is no backfill and no import.
 */