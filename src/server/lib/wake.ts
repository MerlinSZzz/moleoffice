// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RECORDING THAT SOMEBODY WANTS AN AGENT WOKEN. IT STARTS NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS, IN ONE PARAGRAPH
 * ---------------------------------------------------------------------------------------
 *
 * A wake row says: *this durable agent should be reachable again, this person or agent wants it,
 * for this reason, under this policy.* That is the whole of it. Nothing here starts a process,
 * launches a provider, resumes a session or types into a terminal, and nothing here can.
 *
 * It has the shape `POST /api/export` has. That route writes the files and declines to run git, and
 * says so in the reply on every call. This one writes the row and declines to wake anybody, and
 * says so in the reply on every call.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HALF THAT ACTS IS MISSING, AND WHO DECIDES WHETHER IT IS EVER BUILT
 * ---------------------------------------------------------------------------------------
 *
 * **The question of whether Mole Office may start a process on this machine without asking is the
 * owner's, and it is not settled.** The owner's brief declares a narrow rule in force meanwhile: wake only
 * for a message the owner themselves sent, and never without a press. Building the acting half now would
 * settle the owner's question by shipping one answer to it.
 *
 * So the state a row is written in is always `wanted`, and **nothing in `src/` moves it**. The four
 * later states — `claimed`, `served`, `refused`, `expired` — belong to whatever eventually acts on
 * a row, and that thing does not exist. They are declared here because the column stores them and a
 * reader has to know what the stored word means; declaring a word is not building the thing that
 * writes it.
 *
 * The full account of what is built, what is not, and what would have to be true first is
 * `design/round-eleven/design/the-wake-boundary.md`.
 *
 * ---------------------------------------------------------------------------------------
 * TWO GUARDS, THE SAME PAIR `lifecycle.ts` USES, AND THE SECOND ONE IS THE BOUNDARY
 * ---------------------------------------------------------------------------------------
 *
 * `tests/a-wake-is-wanted-and-nothing-starts.test.ts` reads every file under `src/` and fails if a
 * second place writes `agent_wakes`. A source scan cannot see an alias, so it is paired with
 * triggers that fire when the code RUNS: an INSERT from outside `recordThatAWakeIsWanted` is
 * aborted, and **an UPDATE of any wake row is aborted outright, because moving a wake's state is
 * the acting half and the server does not have it**. `src/server/lib/lifecycle.ts` is the template
 * and the two are deliberately the same shape.
 *
 * A DELETE is not guarded, for the reason it is not guarded there: this is a MEASURED table and
 * `src/server/db/migrate.ts` says in writing that a prune of one must stay allowed.
 *
 * ---------------------------------------------------------------------------------------
 * THE TABLE IS NOT CREATED YET, AND EVERY FUNCTION HERE SAYS SO RATHER THAN FAILING STRANGELY
 * ---------------------------------------------------------------------------------------
 *
 * `agent_wakes` is declared in `src/server/db/lifecycle-tables.ts` and created by a migration that
 * is written, proved and HELD in `held-migrations/`, because this campaign has one
 * announced window and the owner opens it. Until the owner does, every function here refuses with a
 * sentence naming that file rather than with a SQLite error about a missing table.
 */

import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import { and, desc, eq, sql } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'

import { nowStamp } from '@shared/time.ts'
import { actorTypeWord, kindWord } from '@shared/words.ts'
import { db, sqlite } from '../db/client.ts'
import { agentWakes } from '../db/lifecycle-tables.ts'
import { getRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

// ============================================================================ the two vocabularies

/**
 * WHY SOMEBODY WANTS THIS AGENT WOKEN. THREE WORDS, STORED ON THE ROW.
 *
 * Stored per row rather than held as one installation-wide setting, which is section 5.3 of
 * `design/round-eleven/design/agent-lifecycle.md`: the answer to the owner's open question about
 * what may be started without asking is then a setting and not a migration.
 */
export const WAKE_POLICIES = ['owner-message', 'watchdog', 'owner-press'] as const

/** Under which rule this wake was asked for. */
export type WakePolicy = (typeof WAKE_POLICIES)[number]

/** One policy word, what a person reads, and what it means. */
export interface WakePolicyWord {
  value: WakePolicy
  word: string
  sentence: string
}

/**
 * The three policy words with their sentences.
 *
 * Keyed by the value rather than an array, for the reason `WORK_STATE` is: a word added to the list
 * with no sentence does not compile, and the sentence is the only thing that says what the word
 * means to somebody who has not read the design.
 */
export const WAKE_POLICY: Readonly<Record<WakePolicy, WakePolicyWord>> = {
  'owner-message': {
    value: 'owner-message',
    word: 'A message the owner sent',
    sentence:
      'The owner sent this agent a message, so it has to be reachable to read it. This is the narrowest reason there ' +
      'is and it is the one the owner\'s brief has in force today.',
  },
  watchdog: {
    value: 'watchdog',
    word: 'A watchdog reading',
    sentence:
      'A reading found this agent was left in the middle of work. Nothing acts on that reading today: it ' +
      'answers a question and the answer is written down here.',
  },
  'owner-press': {
    value: 'owner-press',
    word: 'The owner pressed it',
    sentence: 'A person asked for this wake themselves. An agent may not record this reason on somebody else\'s behalf.',
  },
}

/** Whether a stored string is one of the three policy words. Anything else is a fault. */
export function isWakePolicy(value: unknown): value is WakePolicy {
  return typeof value === 'string' && (WAKE_POLICIES as readonly string[]).includes(value)
}

/**
 * HOW FAR A WAKE HAS GOT. FIVE WORDS, AND `src/` ONLY EVER WRITES THE FIRST.
 *
 * The other four describe things that happen after somebody acts on a row, and nothing acts on a
 * row. They are declared so that a reader of the column knows what a stored word would mean, and so
 * that a later reading does not have to invent a spelling for a state the schema already names.
 */
export const WAKE_STATES = ['wanted', 'claimed', 'served', 'refused', 'expired'] as const

/** Where a wake stands. */
export type WakeState = (typeof WAKE_STATES)[number]

/** One state word, what a person reads, and what it means. */
export interface WakeStateWord {
  value: WakeState
  word: string
  sentence: string
  /** True when this server writes the word. It writes exactly one of the five. */
  writtenHere: boolean
}

export const WAKE_STATE: Readonly<Record<WakeState, WakeStateWord>> = {
  wanted: {
    value: 'wanted',
    word: 'Wanted',
    sentence: 'Somebody has written down that this agent should be woken. Nothing has been started and nobody has taken it.',
    writtenHere: true,
  },
  claimed: {
    value: 'claimed',
    word: 'Taken by something that can act',
    sentence:
      'Something that is able to start a provider has taken this wake. Nothing in Mole Office can do that, so no row ' +
      'has ever read this.',
    writtenHere: false,
  },
  served: {
    value: 'served',
    word: 'The agent was reached',
    sentence:
      'A new period of participation exists and this wake produced it. Nothing in Mole Office can do that, so no row ' +
      'has ever read this.',
    writtenHere: false,
  },
  refused: {
    value: 'refused',
    word: 'Declined',
    sentence:
      'Whatever was asked to act on this wake declined, in its own words. Nothing in Mole Office asks anything to ' +
      'act, so no row has ever read this.',
    writtenHere: false,
  },
  expired: {
    value: 'expired',
    word: 'Too late to matter',
    sentence: 'The wake stopped being worth serving before anything served it. Nothing in Mole Office writes this.',
    writtenHere: false,
  },
}

/** Whether a stored string is one of the five state words. Anything else is a fault. */
export function isWakeState(value: unknown): value is WakeState {
  return typeof value === 'string' && (WAKE_STATES as readonly string[]).includes(value)
}

/** The only state this server ever writes. Read from the vocabulary rather than typed twice. */
export const THE_ONLY_STATE_WRITTEN_HERE: WakeState = 'wanted'

/**
 * WHAT A WAKE ROW DID NOT DO, SAID ON EVERY WRITE.
 *
 * It is in the reply and not only in a comment because the person or agent reading the reply may
 * believe something is now on its way. Nothing is.
 */
export const A_WAKE_ROW_STARTS_NOTHING =
  'This wrote down that a wake is wanted. IT STARTED NOTHING: no process was launched, no provider session was ' +
  'resumed, no terminal was written to, and nothing is now on its way to this agent. Whether Mole Office may ever ' +
  'start a process on this machine is an open question and it is the owner\'s. Until the owner answers it, a wake is a ' +
  'row somebody reads.'

// ============================================================================ the runtime guard

/** True only while `recordThatAWakeIsWanted` is inside its own write. Read from SQL by the trigger. */
let doorIsOpen = false

/** Whether the triggers are on this connection, and — when they are not — the reason. */
let guardState: { installed: boolean; why: string } = { installed: false, why: 'nothing has tried to install it yet' }

/** What the guard is doing right now. The wake test asserts this says yes once the table exists. */
export function wakeDoorGuard(): { installed: boolean; why: string } {
  return guardState
}

const INSERT_TRIGGER = 'mole_office_one_wake_door'
const UPDATE_TRIGGER = 'mole_office_the_server_never_moves_a_wake'
const GUARD_FUNCTION = 'mole_office_wake_door_is_open'

/** Whether this database has the wake table yet. The held migration is what creates it. */
export function wakeStoreExists(): boolean {
  return (
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_wakes'").get() !== undefined
  )
}

/** The refusal every function here gives when the migration has not been run on this database. */
const NO_STORE_YET =
  'This database has no agent_wakes table, so nothing can be read from it or written to it. The migration that ' +
  'creates it is written and proved and deliberately NOT registered: it is ' +
  'held-migrations/agent-lifecycle-tables.sql, and it runs in the one announced migration window, ' +
  'which the person opens. Nothing was written and nothing was guessed at.'

/**
 * Put the runtime half of the guard on this connection.
 *
 * Idempotent, and safe to call before the table exists — which is the case on every database today.
 * It then says so in `wakeDoorGuard().why` rather than pretending to be on. Silence would be the
 * failure the guard exists to prevent: a guard that is not there looks exactly like a guard that is
 * there and never fired.
 */
export function installWakeDoorGuard(): { installed: boolean; why: string } {
  if (guardState.installed) return guardState

  if (!wakeStoreExists()) {
    guardState = {
      installed: false,
      why:
        'this database has no agent_wakes table yet, so there is nothing to put a trigger on. The migration that ' +
        'creates it is held in held-migrations/ until the announced window.',
    }
    return guardState
  }

  // `deterministic: false` — it answers differently on two identical calls on purpose, because what
  // it reports is whether this process is inside `recordThatAWakeIsWanted` right now. Declaring it
  // deterministic would let SQLite fold the call away and the guard would never fire.
  sqlite.function(GUARD_FUNCTION, { deterministic: false, varargs: false }, () => (doorIsOpen ? 1 : 0))
  sqlite.exec(`DROP TRIGGER IF EXISTS temp.${INSERT_TRIGGER}`)
  sqlite.exec(
    `CREATE TEMP TRIGGER ${INSERT_TRIGGER} BEFORE INSERT ON agent_wakes ` +
      `WHEN ${GUARD_FUNCTION}() = 0 ` +
      `BEGIN SELECT RAISE(ABORT, 'agent_wakes was written from outside recordThatAWakeIsWanted in ` +
      `src/server/lib/wake.ts. That table is where Mole Office keeps who wanted an agent woken and why, and one ` +
      `writer is what makes it impossible for two screens to disagree about it. Nothing was written.'); END`,
  )
  sqlite.exec(`DROP TRIGGER IF EXISTS temp.${UPDATE_TRIGGER}`)
  sqlite.exec(
    `CREATE TEMP TRIGGER ${UPDATE_TRIGGER} BEFORE UPDATE ON agent_wakes ` +
      `BEGIN SELECT RAISE(ABORT, 'Mole Office never moves a wake past "wanted". Claiming a wake, serving it, refusing ` +
      `it or letting it expire are all things that happen after something acts on the row, and nothing under ` +
      `src/ acts on a row. Whether anything ever may is the owner''s open question. Nothing was written.'); END`,
  )
  guardState = { installed: true, why: 'two temporary triggers on this connection refuse the write' }
  return guardState
}

// The guard goes on as soon as anything reaches this file, so a foreign write is refused whether or
// not `recordThatAWakeIsWanted` has ever been called in this process.
installWakeDoorGuard()

// ============================================================================ reading

/** One wake, as it is read back. */
export interface Wake {
  id: string
  workspaceId: string
  agentId: string
  wantedAt: string
  /** Who wanted it. A claim, recorded as a claim. */
  wantedBy: { type: 'human' | 'agent'; id: string }
  /** Why, in the words of whoever asked. */
  because: string
  /** Whatever the writer recorded as evidence, as it was stored. Null when nothing was recorded. */
  evidence: unknown
  policy: WakePolicy
  state: WakeState
  stateAt: string
  /** Null on every row today: nothing has ever taken a wake, because nothing can. */
  claimedBy: string | null
  claimedAt: string | null
  servedAt: string | null
  /** The attachment this wake produced. Null on every row today, for the same reason. */
  attachmentId: string | null
  refusedBecause: string | null
}

/** Read one stored row, refusing a word that is not in the vocabulary rather than passing it on. */
function wakeFrom(row: typeof agentWakes.$inferSelect): Wake {
  if (!isWakePolicy(row.policy)) {
    throw new PanelError(
      `Wake ${row.id} says it was asked for under the policy "${row.policy}", and that is not one of the three ` +
        `policy words (${WAKE_POLICIES.join(', ')}). Nothing has been guessed at.`,
      500,
    )
  }
  if (!isWakeState(row.state)) {
    throw new PanelError(
      `Wake ${row.id} reads "${row.state}", and that is not one of the five wake states ` +
        `(${WAKE_STATES.join(', ')}). Nothing has been guessed at.`,
      500,
    )
  }
  if (row.wantedByType !== 'human' && row.wantedByType !== 'agent') {
    throw new PanelError(
      `Wake ${row.id} says it was wanted by a "${actorTypeWord(row.wantedByType).text}". A wake is wanted by a ` +
        'person or by an agent, and by nothing else. Nothing has been guessed at.',
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
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    wantedAt: row.wantedAt,
    wantedBy: { type: row.wantedByType, id: row.wantedById },
    because: row.because,
    evidence,
    policy: row.policy,
    state: row.state,
    stateAt: row.stateAt,
    claimedBy: row.claimedBy,
    claimedAt: row.claimedAt,
    servedAt: row.servedAt,
    attachmentId: row.attachmentId,
    refusedBecause: row.refusedBecause,
  }
}

/**
 * ONE AGENT'S WAKES, NEWEST FIRST.
 *
 * `wanted_at` THEN `rowid`, and the second half is load-bearing rather than tidy, for the reason
 * `workStateHistory` gives: a stamp has one-second resolution, and these ids are nanoids whose
 * order is random, so `id` as a tie-break would order two wakes wanted in the same second by
 * chance. `rowid` is the order SQLite appended them in, which is the order they were written in,
 * and it only ever grows here because a trigger refuses an UPDATE outright.
 */
export function wakesFor(agentId: string, workspaceId: string, limit = 50): Wake[] {
  // THE AGENT IS CHECKED BEFORE THE STORE IS, and the order is the answer to a question: an id that
  // names no agent in this project must be refused as that, not answered with a migration's
  // refusal, which would tell a caller in the wrong project that the only thing wrong was a
  // migration. `src/server/lib/lifecycle.ts` reads in the same order and for the same reason.
  assertIsAnAgentHere(agentId, workspaceId, 'read')
  if (!wakeStoreExists()) throw new PanelError(NO_STORE_YET, 503)
  const rows = db
    .select()
    .from(agentWakes)
    .where(and(eq(agentWakes.agentId, agentId), eq(agentWakes.workspaceId, workspaceId)))
    .orderBy(desc(agentWakes.wantedAt), sql`rowid desc`)
    .limit(limit)
    .all()
  return rows.map(wakeFrom)
}

// ============================================================================ the one writer

/** What one wake carries beside the agent it is about. */
export interface WantAWake {
  workspaceId: string
  /** Who wants it. Recorded as the claim it is. */
  actor: Actor
  /** Why this agent should be reachable again, in one plain sentence. Empty is refused. */
  because: string
  /** Under which of the three rules it is being asked for. */
  policy: WakePolicy
  /** The message id, the review id, the watchdog reading. Stored as JSON. */
  evidence?: unknown
}

/** What one write did, and what it did not do. */
export interface WakeWanted {
  wake: Wake
  /**
   * The other wakes already written down for this agent and not yet taken by anything.
   *
   * Reported rather than refused. Two people wanting the same agent woken is two facts, and a
   * writer that refused the second would lose one of them.
   */
  alsoWanted: Wake[]
  /** What this call did not do, in one paragraph, on every call. */
  startsNothing: string
}

/**
 * THE ONLY THING IN `src/` THAT WRITES A ROW OF `agent_wakes`. IT STARTS NOTHING.
 *
 * **The state is always `wanted`** and the caller cannot choose it. The other four words describe
 * what happens after something acts on the row, and nothing acts on a row.
 *
 * **A wake with no reason is refused.** The reason is what a person reads when they decide whether
 * the wake should have happened, and it is what a continuation would carry as *why you were woken*.
 *
 * **`owner-press` may not be written by an agent.** That word means a person asked for this
 * themselves. An agent writing it would be recording somebody else's act under their name.
 *
 * **The moment is the server's clock**, never the caller's: a caller-supplied time is an
 * observation nobody made.
 */
export function recordThatAWakeIsWanted(agentId: string, input: WantAWake): WakeWanted {
  // The same order as the read above, and for the same reason.
  assertIsAnAgentHere(agentId, input.workspaceId, 'write')
  if (!wakeStoreExists()) throw new PanelError(NO_STORE_YET, 503)

  if (!isWakePolicy(input.policy)) {
    throw new PanelError(
      `"${String(input.policy)}" is not one of the three reasons a wake may be asked for. They are: ` +
        `${WAKE_POLICIES.join(', ')}. Nothing was written.`,
      400,
    )
  }

  const because = input.because.trim()
  if (because === '') {
    throw new PanelError(
      'Say why this agent should be reachable again, in one plain sentence. A wake with no reason is a row ' +
        'nobody can judge later, and the reason is what the agent would be told when it woke. Nothing was written.',
      400,
    )
  }

  if (input.actor.type !== 'human' && input.actor.type !== 'agent') {
    throw new PanelError(
      `A wake is wanted by a person or by an agent, and this request says it is wanted by a ` +
        `"${input.actor.type}". Nothing was written.`,
      400,
    )
  }

  if (input.policy === 'owner-press' && input.actor.type !== 'human') {
    throw new PanelError(
      `"${WAKE_POLICY['owner-press'].word}" means a person asked for this wake themselves, and this request comes ` +
        'from an agent. An agent recording it would be writing down somebody else\'s act under their name. Use ' +
        `"watchdog" for a wake a reading asked for. Nothing was written.`,
      403,
    )
  }

  const at = nowStamp()
  const row = {
    id: anOfficeId(),
    workspaceId: input.workspaceId,
    agentId,
    wantedAt: at,
    wantedByType: input.actor.type,
    wantedById: input.actor.id,
    because,
    evidence: input.evidence === undefined ? null : JSON.stringify(input.evidence),
    policy: input.policy,
    // NOT A PARAMETER, and that is the boundary rather than a default. A caller that could write
    // `served` could claim a wake had reached an agent that nothing ever went to.
    state: THE_ONLY_STATE_WRITTEN_HERE,
    stateAt: at,
    // Every one of these five is null and stays null: each is something only an act could fill in.
    claimedBy: null,
    claimedAt: null,
    servedAt: null,
    attachmentId: null,
    refusedBecause: null,
  }

  // The runtime guard reads this flag from SQL. It is closed again whatever happens, so a refusal
  // inside the write does not leave the door open for the next statement on this connection.
  installWakeDoorGuard()
  doorIsOpen = true
  try {
    // THE COLUMNS ARE NAMED IN A LITERAL AND NOT HANDED IN THROUGH A VARIABLE, for the source scan
    // rather than for the reader: the wake test reads which table every insert in `src/` names, and
    // `.values(built)` is a write whose table it can see but whose columns it cannot say.
    db.insert(agentWakes)
      .values({
        id: row.id,
        workspaceId: row.workspaceId,
        agentId: row.agentId,
        wantedAt: row.wantedAt,
        wantedByType: row.wantedByType,
        wantedById: row.wantedById,
        because: row.because,
        evidence: row.evidence,
        policy: row.policy,
        state: row.state,
        stateAt: row.stateAt,
        claimedBy: row.claimedBy,
        claimedAt: row.claimedAt,
        servedAt: row.servedAt,
        attachmentId: row.attachmentId,
        refusedBecause: row.refusedBecause,
      })
      .run()
  } finally {
    doorIsOpen = false
  }

  const wake = wakeFrom(row)
  const alsoWanted = wakesFor(agentId, input.workspaceId).filter(
    (other) => other.id !== wake.id && other.state === 'wanted',
  )
  return { wake, alsoWanted, startsNothing: A_WAKE_ROW_STARTS_NOTHING }
}

/**
 * Refuse an agent id that names nothing, names something else, or lives in another project.
 *
 * **This is the same check `assertIsALiveAgent` makes in `src/server/lib/lifecycle.ts`, written out
 * a second time**, because that one is private to its file and this file may not edit it. That is
 * this repository's recurring defect — one fact in two places — and the answer CLAUDE.md gives for
 * it is a test that fails when the two disagree. `tests/a-wake-is-wanted-and-nothing-starts.test.ts`
 * puts the same three bad ids through both doors and asserts the same refusals come back.
 */
function assertIsAnAgentHere(agentId: string, workspaceId: string, act: 'read' | 'write'): void {
  const nothingHappened = act === 'write' ? 'Nothing was written.' : 'Nothing was read.'
  const record = getRecord(agentId)
  if (record === null || record.deletedAt !== null) {
    throw new PanelError(
      `No agent has the id ${agentId}, so there is no wake to want. A durable agent is a record of kind ` +
        `"agent". ${nothingHappened}`,
      404,
    )
  }
  if (record.kind !== 'agent') {
    throw new PanelError(
      `${agentId} is a ${kindWord(record.kind).text}${quotedUnlessAMessage(record, ' — ', ' —')} and not a durable agent. ` +
        `${nothingHappened}`,
      400,
    )
  }
  if (record.workspaceId !== workspaceId) {
    // 404 AND NOT 400: from inside this project that agent does not exist, which is what "not found"
    // means. Every other by-id door in this server answers a cross-project id the same way and
    // `tests/by-id-boundary.test.ts` holds them to it.
    throw new PanelError(
      `"${record.title}" is an agent in "${record.workspaceId}" and this request is about "${workspaceId}". ` +
        `${nothingHappened}`,
      404,
    )
  }
}

// ============================================================================ what is not here

/**
 * WHAT THIS FILE DELIBERATELY DOES NOT DO, so that the next reader does not add it.
 *
 * - **It starts no process and launches no provider.** There is no host, no poller, no daemon and
 *   no scheduler, here or anywhere under `src/`.
 * - **It moves no wake state.** There is no `claimWake`, no `serveWake` and no `refuseWake`, and a
 *   trigger refuses an UPDATE of the table outright so that adding one is not a quiet change.
 * - **It stores no command.** A `command` column would be `exec(command: string)` walked around,
 *   and the owner's section 17 refuses that by name.
 * - **It moves no work state.** An agent becomes Working when execution is actually accepted, which
 *   is a claim only the agent or a person may make — `src/server/lib/lifecycle.ts` is the one door.
 * - **It sends no message and builds no continuation.** A wake row carries a reason, not a payload.
 * - **It does not decide whether a wake should happen.** The reading that answers which agents
 *   would be candidates is `src/server/lib/watchdog.ts`, it writes nothing, and it calls nothing
 *   here.
 */
