// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { batchDeliveryStates, BATCH_HELD, beginNoticeWorkTurn } from '../../holder/notice-batches.ts'
/**
 * WHICH LIVE SESSION IS ANSWERING AS A DURABLE AGENT: claiming a handle, beating, and letting go.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criteria H1 to H4 of design/messages/ACCEPTANCE.md section 10: a message to an agent is received
 * and answered by that agent. When a person writes to an agent that is
 * open in a terminal, that session should be the one that answers. Before this, every message
 * started a fresh run beside the open session, and the two knew nothing about each other.
 *
 * A session says it is answering as an agent by holding that agent's handle. It says it is still
 * there every few seconds. When it stops saying so for longer than the lapse window it stops reading
 * as answering, and the handle is still its own for the grace window after that; past both, the next
 * reader releases the hold with that reason.
 *
 * ---------------------------------------------------------------------------------------
 * THE GRACE WINDOW, AND WHY A LAPSE IS NOT THE END
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M81, on problem `i05BSaUcdfXF`. A Claude Code session is woken by its waiter EXITING, so
 * the beat stops every time a message arrives and starts again when the session has answered. The
 * gap measured on 7 September 2026 was ninety-two seconds against a ninety-second lapse, and a run
 * took the handle and wrote in a group as the secretary while the secretary was writing something
 * else. So a hold past its lapse is `kept` rather than free: the message waits for the session, and
 * past the grace window as well nothing starts silently — the person is asked (M78).
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE EVER SIGNALS A PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * H4: *nothing is signalled*. A refused claim does not touch the session that holds the handle, and
 * releasing a lapsed hold does not touch it either. A hold is a statement about who Mole Office will
 * send messages to; it is not a lock on a process and it cannot stop one.
 *
 * ---------------------------------------------------------------------------------------
 * A HOLD IS NEVER BELIEVED WITHOUT ITS HEARTBEAT
 * ---------------------------------------------------------------------------------------
 *
 * Every read here asks how long ago the session last spoke, and answers `lapsed` rather than
 * `fresh` when that is longer than `MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS`. That is what makes a
 * row safe to carry in a backup, safe across a restart, and safe when a terminal is closed with the
 * lid of a laptop rather than by stopping the waiter.
 */

import { noticeKindsFor, whyPersonalNoticeRuleHolds } from './notice-rules.ts'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { gatePosition } from '../../config/settings.mjs'

import { nowStamp, parseAnyStamp } from '@shared/time.ts'
import {
  HOLD,
  heldBySomebodyElse,
  takenOverBy,
  theLiveSessionTookIt,
  wentQuiet,
  type HoldOnTheWire,
  type HoldState,
} from '@shared/handles.ts'
import { isAgentRuntime, theRuntimeWordsSaid } from '@shared/participants.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { theReasonAsOneSentence, writtenInOf } from '@shared/messages.ts'
import type { VisitorCredential } from '@shared/visitors.ts'
import type { PanelRecord } from '@shared/types.ts'

import { db, sqlite } from '../db/client.ts'
import { theFiledAliasesReadOnce } from './registry-aliases/runs.ts'
import { theRegistryIdsOf } from './registry-aliases/stamps.ts'
import { keptStatement } from '../db/kept-statement.ts'
import { handleHolds, STORED_FIELDS } from '../db/schema.ts'
import { handleGraceSeconds, handleLapsesAfterSeconds } from './env.ts'
import { type RegisteredAgent } from './participants.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { readParticipant } from '../db/read-participant.ts'
import { getRecord, recordInWorkspace, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { stampOf } from './stamp-of.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { whyThisWakesNoWaiter } from './notices.ts'
import { deadLetterClaimsIn, sweptLetterNotice, type SweptLetterNotice } from './deadletters.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { answeringMayHaveChanged } from './answering-told.ts'

// ============================================================================ reading a row

/** One stored row, as SQLite hands it back. */
interface Stored {
  id: string
  agentId: string
  sessionRecordId: string
  machine: string
  runtime: string
  claimedAt: string
  lastHeardAt: string
  releasedAt: string | null
  releasedBecause: string | null
}

/**
 * HOW LONG AGO A SESSION LAST SAID IT WAS THERE, in whole seconds.
 *
 * A stamp nothing can read answers past every window rather than zero, because a hold whose
 * heartbeat cannot be read is one nobody can vouch for, and zero would read as "just now". Until
 * criterion M81 it answered the lapse window exactly, and `stateOf` asked whether the quiet was
 * LONGER than the lapse, so an unreadable stamp read as fresh — the opposite of what this sentence
 * has always said it did. It is one past the longest window now, so the two agree.
 */
function quietFor(lastHeardAt: string, now: number): number {
  const when = parseAnyStamp(lastHeardAt)
  if (when === null) return handleGraceSeconds() + 1
  return Math.max(0, Math.round((now - when.getTime()) / 1000))
}

/**
 * Fresh, kept, lapsed or released, worked out from the row and the clock.
 *
 * KEPT IS THE ONE M81 ADDS. Past the lapse window nobody is saying the session is there, so it is no
 * longer answering; but the handle is still its own until the grace window is up as well, so a
 * message to the agent waits for it and nothing is started. Both windows are measured from the same
 * stamp — the last beat — because the waiter's last beat is the moment it exited.
 */
function stateOf(row: Stored, now: number): HoldState {
  if (row.releasedAt !== null) return 'released'
  const quiet = quietFor(row.lastHeardAt, now)
  if (quiet <= handleLapsesAfterSeconds()) return 'fresh'
  return quiet <= handleGraceSeconds() ? 'kept' : 'lapsed'
}

/**
 * One row as every reader sees it. The handle and the name come from the registry, never from here. `registered` is the
 * agent's registry row when the caller read it already, built as `readParticipant` builds it; undefined reads it here.
 */
function onTheWire(row: Stored, now: number = Date.now(), registered?: RegisteredAgent | null): HoldOnTheWire {
  const registry = registered !== undefined ? registered : readParticipant({ kind: 'agent', id: row.agentId })
  return {
    id: row.id,
    agent: { kind: 'agent', id: row.agentId },
    handle: registry !== null && 'handle' in registry ? registry.handle : row.agentId,
    name: registry === null ? row.agentId : registry.name,
    session: row.sessionRecordId,
    machine: row.machine,
    runtime: row.runtime,
    claimedAt: row.claimedAt,
    lastHeardAt: row.lastHeardAt,
    quietFor: quietFor(row.lastHeardAt, now),
    state: stateOf(row, now),
    releasedAt: row.releasedAt,
    releasedBecause: row.releasedBecause,
  }
}

/** The row a hold id names, or null. */
function rowOf(id: string): Stored | undefined {
  return db.select().from(handleHolds).where(eq(handleHolds.id, id)).get() as Stored | undefined
}

// Keep the prepared read per handle, and read its row afresh on every call (wave 13y round 42).
const liveHoldRow = keptStatement(() =>
  db
    .select()
    .from(handleHolds)
    .where(and(eq(handleHolds.agentId, sql.placeholder('agentId')), isNull(handleHolds.releasedAt)))
    .prepare(),
)

/** The one live row for an agent, released or not yet released, or undefined. */
function liveRowFor(agentId: string): Stored | undefined {
  return liveHoldRow().get({ agentId }) as Stored | undefined
}

// ============================================================================ letting go

/**
 * WRITE THAT A HOLD IS OVER. The one writer of `released_at`, so every ending is written the same way.
 *
 * IT SIGNALS NOTHING. The session named on the row is not touched, is not told, and may still be
 * running: this says only that Mole Office will stop sending it messages.
 */
export function releaseAHold(id: string, because: string): HoldOnTheWire {
  const row = rowOf(id)
  if (row === undefined) {
    throw new PanelError(`No hold on an agent handle is filed as ${id}. Nothing was written.`, 404)
  }
  if (row.releasedAt !== null) return onTheWire(row)
  const at = nowStamp()
  db.update(handleHolds).set({ releasedAt: at, releasedBecause: because }).where(eq(handleHolds.id, id)).run()
  answeringMayHaveChanged([row.agentId])
  return onTheWire({ ...row, releasedAt: at, releasedBecause: because })
}

// ============================================================================ what is answering

/**
 * THE LIVE HOLD ON ONE AGENT'S HANDLE, or null because nothing is answering as it.
 *
 * A LAPSED HOLD IS RELEASED BY THIS READ, which is H1's last sentence: *a claim whose heartbeat
 * lapses is released with the reason by the next reader*. There is no sweeper process and there is
 * not going to be one — a hold only matters when somebody asks who is answering, and that is exactly
 * the moment this runs. So the answer and the tidying are the same act and cannot disagree.
 *
 * A KEPT HOLD IS RETURNED AND NOT RELEASED. Criterion M81: past the lapse window the handle is still
 * that session's until the grace window is up too, so this answers with the hold and the caller
 * reads `state` to tell the two apart. `theHandleIsStillItsSessions` below is the caller that wants
 * only the second of them.
 *
 * `at` IS THE INSTANT THIS IS READ ON. It defaults to the server's clock; a caller that measures
 * other facts of the same reading — `participantPresence` — passes its own instant so the whole
 * reading answers against one clock. Criterion M106's second half: a word must not change while no
 * fact changed, and one of the ways it could was a window measured from two clocks.
 */
export function theLiveHoldOn(agentId: string, readOnly = false, at: number = Date.now()): HoldOnTheWire | null {
  const row = liveRowFor(agentId)
  if (row === undefined) return null
  if (stillHeld(row, at)) return onTheWire(row, at)
  if (!readOnly) releaseAHold(row.id, wentQuiet(quietFor(row.lastHeardAt, at), handleGraceSeconds()))
  return null
}

/** A live row still holds its handle while it is fresh or kept; past both windows it has lapsed. */
function stillHeld(row: Stored, at: number): boolean {
  const state = stateOf(row, at)
  return state === 'fresh' || state === 'kept'
}

/**
 * WHAT `theLiveHoldOn(agentId, true, at)` ANSWERS FOR EVERY AGENT, in one statement, by the agent's registry id (wave
 * 13y round 50). The people view read each agent's live row with its own statement. An agent with no hold, or only a
 * lapsed one, is absent, and nothing is released: this is the read-only reading only. `registered` hands in the
 * registry row the caller already read for an agent, and undefined has it read by the id, as `onTheWire` says.
 *
 * `only` reads the holds of these agents and no others (wave 13y round 51), for a plugin view asked for a list of them.
 */
export function everyLiveHoldReadOnly(at: number, registered: (agentId: string) => RegisteredAgent | undefined, only?: readonly string[]): Map<string, HoldOnTheWire> {
  const out = new Map<string, HoldOnTheWire>()
  const live = isNull(handleHolds.releasedAt)
  const these = only === undefined ? live : and(live, sql`${handleHolds.agentId} in (select value from json_each(${JSON.stringify(only)}))`)
  // AT MOST ONE LIVE ROW AN AGENT: the unique index handle_holds_one_live_per_agent_idx says so.
  for (const row of db.select().from(handleHolds).where(these).all() as Stored[]) {
    if (stillHeld(row, at)) out.set(row.agentId, onTheWire(row, at, registered(row.agentId)))
  }
  return out
}

/**
 * THE LIVE HOLD ONE SESSION HOLDS, or null because it holds none.
 *
 * The same reading as `theLiveHoldOn` above, asked from the other side: a session may hold a
 * handle, and a message addressed to that session has to reach the agent that handle names.
 * A lapsed hold is released by this read exactly as it is there, so the two cannot disagree about
 * whether a session is still holding anything.
 */
export function theLiveHoldOnSession(
  sessionRecordId: string,
  readOnly = false,
  at: number = Date.now(),
): HoldOnTheWire | null {
  const rows = db
    .select()
    .from(handleHolds)
    .where(and(eq(handleHolds.sessionRecordId, sessionRecordId), isNull(handleHolds.releasedAt)))
    .orderBy(desc(handleHolds.claimedAt))
    .all() as Stored[]
  const row = rows[0]
  if (row === undefined) return null
  const state = stateOf(row, at)
  if (state === 'fresh' || state === 'kept') return onTheWire(row, at)
  if (!readOnly) releaseAHold(row.id, wentQuiet(quietFor(row.lastHeardAt, at), handleGraceSeconds()))
  return null
}

/**
 * THE NEWEST HOLD EVER FILED ON ONE AGENT'S HANDLE, as it stands at `at`, or null because none was ever filed.
 *
 * READ ONLY: a lapsed hold is answered as lapsed and is NOT released here. This is the permanent resident's heartbeat
 * the resident's section and its profile show whether its waiter is beating, when it last
 * beat, and whether it lapsed. Reading a page must not end a hold, so the release stays with `theLiveHoldOn`.
 */
export function theNewestHoldOn(agentId: string, at: number = Date.now()): HoldOnTheWire | null {
  const row = db.select().from(handleHolds).where(eq(handleHolds.agentId, agentId)).orderBy(desc(handleHolds.claimedAt)).get() as Stored | undefined
  return row === undefined ? null : onTheWire(row, at)
}

/** Every hold ever filed, newest first, with any lapsed one released by this read. */
export function everyHold(): HoldOnTheWire[] {
  const rows = db.select().from(handleHolds).orderBy(desc(handleHolds.claimedAt)).all() as Stored[]
  const now = Date.now()
  const out: HoldOnTheWire[] = []
  for (const row of rows) {
    if (stateOf(row, now) === 'lapsed') {
      out.push(releaseAHold(row.id, wentQuiet(quietFor(row.lastHeardAt, now), handleGraceSeconds())))
      continue
    }
    out.push(onTheWire(row, now))
  }
  return out
}

// ============================================================================ claiming

/** Everything a session has to say to claim a handle. */
export interface Claiming {
  handle: string
  session: string
  machine: string
  runtime: string
  workspaceId: string
  /** The agent the request's key proved, or absent because it carried no agent key. See `theAgentAHandleDoorNames`. */
  keyHolder?: string | null
}

/**
 * THE AGENT A REQUEST'S OWN KEY PROVED, or null because it carried no agent key.
 *
 * `actorFrom` in lib/http.ts puts it on the actor as `keyHolder` when the request names itself in its
 * headers. A request that sends a key and no actor headers is that agent by construction: its `id`
 * is the key's holder and `provedBy` says an agent's key proved it.
 */
export function theAgentKeyAnActorHolds(actor: Actor): string | null {
  if (actor.keyHolder !== undefined) return actor.keyHolder
  return actor.type === 'agent' && actor.provedBy === 'an-agent-key' ? actor.id : null
}

/**
 * THE AGENT A HANDLE DOOR'S PATH NAMES, read through the one resolver WITH THE CALLER'S KEY.
 *
 * Criterion I3 frees a retired agent's handle, and a legacy agent's id is its handle.
 * So after a new agent takes a retired legacy agent's handle, that one string is the
 * old agent's id and the new agent's handle, and the resolver refuses it naming both. Plan
 * be2Z8l-GArM2, block b9, refuses it only "until the caller sends the id or holds a key", and
 * criterion I9 keeps the waiter working under a handle. So the key the request carries goes into the
 * resolver's step 1, as `participantForActor` does for the caller: a waiter sending its own agent key
 * is resolved to its own agent, and a keyless request with the bare string still gets the 409.
 *
 * Asked as a read: a retired agent's handle still finds it, so each door gives its own sentence for a
 * retired agent.
 */
export function theAgentAHandleDoorNames(handle: string, keyHolder: string | null | undefined): RegisteredAgent | null {
  const found = theAgentAnArrivingReferenceNames(handle, 'reading', keyHolder ?? null)
  return found === null ? null : (readParticipant({ kind: 'agent', id: found.agent.id }) as RegisteredAgent | null)
}

/** A hold, and the one it took over from when it took one over. */
export interface Claimed {
  hold: HoldOnTheWire
  /**
   * THE HOLD THIS ONE TOOK OVER FROM, or null because nothing was holding the handle.
   *
   * Criterion H4. A session that takes over a handle whose holder went quiet is told so, because
   * from its point of view there is otherwise no difference between a free handle and one it has
   * just taken from somebody — and the difference is whether another terminal thinks it is the one
   * answering. Nothing is signalled either way.
   */
  tookOverFrom: HoldOnTheWire | null
  /** What the office did with a run asked for that has ended, or null because it has not ended. See `EndedRunAsked`. */
  endedRunAsked: EndedRunAsked | null
}

// ============================================================================ a run asked for that has ended

/**
 * WHAT A HOLD ASKED FOR A RUN THAT HAS ENDED SAYS (wave 13u round 109).
 *
 * The waiter is given its run record once, when it starts, and sends that id to every door for as long as it runs. A
 * conversation that goes on after its run ended is filed under a new record, so a waiter started with the old id would
 * hold the handle on a run that has ended. The hold is put instead on the one run of the same conversation in the same
 * project that has not ended. With none, or with several, it stays on the run asked for, and `says` gives the reason.
 */
export interface EndedRunAsked {
  /** The run record the hold was asked for. */
  asked: string
  /** Its state: one of the words that end a run. */
  state: string
  /** The conversation its discovery stamp names, or null because it carries no whole stamp. */
  conversation: string | null
  /** The runs of that conversation in the same project that have not ended. */
  liveRuns: string[]
  /** The run the hold is on in its place, or null because the hold is on the run asked for. */
  took: string | null
  /** One sentence saying which run the hold is on, and why. */
  says: string
}

/**
 * THE RUNS OF ONE CONVERSATION IN ONE PROJECT THAT HAVE NOT ENDED, read through the index of runs that have not ended
 * (migration 0294) and narrowed by the conversation, never by reading every run. Each row is then held to its whole
 * discovery stamp, as `stampOf` reads it for every other question about a run's conversation.
 */
function theRunsOfAConversationNotEnded(conversation: string, workspaceId: string): string[] {
  const data = sql.raw('candidate.data')
  const rows = db.all<{ id: string }>(sql`SELECT candidate.id AS id FROM records AS candidate INDEXED BY records_session_not_ended_idx
    WHERE candidate.kind = 'session' AND ${STORED_FIELDS.sessionHasNotEnded(data)} AND candidate.workspace_id = ${workspaceId}
    AND candidate.deleted_at IS NULL AND json_extract(candidate.data, '$.extra.discovered.externalId') = ${conversation}
    ORDER BY candidate.created_at, candidate.rowid`)
  return rows
    .map((row) => getRecord(row.id))
    .filter((one): one is PanelRecord => one !== null && !theRunHasEnded(one.data['state']) && stampOf(one)?.externalId === conversation)
    .map((one) => one.id)
}

/** What a hold asked for this run is told, and the run it is put on, or null because the run has not ended. */
function theLiveRunInstead(record: PanelRecord): EndedRunAsked | null {
  const state = record.data['state']
  if (!theRunHasEnded(state)) return null
  const word = String(state)
  const ended = `Record ${record.id} is a run that has ended (${word})`
  const conversation = stampOf(record)?.externalId ?? null
  if (conversation === null) {
    return {
      asked: record.id,
      state: word,
      conversation: null,
      liveRuns: [],
      took: null,
      says: `${ended}, and it names no conversation, so the office cannot tell which run took its place. The hold is on record ${record.id}, as asked.`,
    }
  }
  const liveRuns = theRunsOfAConversationNotEnded(conversation, record.workspaceId).filter((id) => id !== record.id)
  const took = liveRuns.length === 1 ? liveRuns[0]! : null
  const says =
    took !== null
      ? `${ended}, so this hold is on record ${took}, the one run of the same conversation in this project that has not ended.`
      : liveRuns.length === 0
        ? `${ended}, and no run of the same conversation in this project is still going, so the hold is on record ${record.id}, as asked.`
        : `${ended}, and ${String(liveRuns.length)} runs of the same conversation in this project have not ended ` +
          `(records ${liveRuns.join(', ')}), so the office did not choose one. The hold is on record ${record.id}, as asked.`
  return { asked: record.id, state: word, conversation, liveRuns, took, says }
}

/**
 * WHETHER A SESSION ID A BEAT OR A RELEASE SENDS IS THIS HOLD'S, either as its own run or as a run that has ended whose
 * one live run of the same conversation in its project is the hold's. Any other id is not the hold's.
 */
function isTheHoldsRun(session: string, holdsRun: string): boolean {
  if (session === holdsRun) return true
  const asked = getRecord(session)
  return asked !== null && asked.kind === 'session' && asked.deletedAt === null && theLiveRunInstead(asked)?.took === holdsRun
}

/**
 * CLAIM A HANDLE FOR THIS SESSION.
 *
 * The same session claiming again is not a second claim: it is the waiter starting over, which
 * happens every time the session is woken with a message, and it beats the hold it already has
 * rather than being refused by its own row.
 */
export function holdTheHandle(asked: Claiming): Claimed {
  const agent = theAgentAHandleDoorNames(asked.handle, asked.keyHolder)
  if (agent === null) {
    throw new PanelError(
      `No durable agent in this installation has the handle "${asked.handle}", so there is nothing to answer as. ` +
        'GET /api/participants lists every agent that is registered. Nothing was written.',
      404,
    )
  }
  if (agent.retired) {
    const because = agent.retiredBecause === null ? null : theReasonAsOneSentence(agent.retiredBecause)
    throw new PanelError(
      `The agent "${asked.handle}" is retired${because === null ? '.' : `: ${because}`} ` +
        'A retired agent is given no new work, so no session answers as one. Nothing was written.',
      409,
    )
  }
  if (!isAgentRuntime(asked.runtime)) {
    throw new PanelError(
      `"${asked.runtime}" is not a runtime this product has an adapter for. It is one of ` +
        `${theRuntimeWordsSaid()}. Nothing was written.`,
      400,
    )
  }
  // THE SESSION RECORD IS READ FIRST, so a hold can never name a run nobody can open. A hold whose
  // session cannot be shown would put a record id on a screen that leads nowhere.
  const askedFor = recordInWorkspace(asked.session, asked.workspaceId)
  // A RUN THAT HAS ENDED HANDS THE HOLD TO THE ONE LIVE RUN OF ITS CONVERSATION IN THIS PROJECT (round 109). Everything
  // below is about the run the hold is put on.
  const endedRunAsked = askedFor.kind === 'session' ? theLiveRunInstead(askedFor) : null
  const session = endedRunAsked?.took ?? asked.session

  // A HOLD TAKEN ON THE RUN ASKED FOR, BEFORE THAT RUN ENDED, IS THE ASKING SESSION'S OWN: its waiter, started again,
  // claims with the id it was given. That hold moves to the live run, so it is not refused below as somebody else's.
  const onTheEndedRun = liveRowFor(agent.id)
  if (endedRunAsked !== null && endedRunAsked.took !== null && onTheEndedRun?.sessionRecordId === asked.session) {
    releaseAHold(
      onTheEndedRun.id,
      `Record ${asked.session} has ended and claimed this handle again, so the hold moved to ` +
        `record ${endedRunAsked.took}, the one run of the same conversation in this project that has not ended.`,
    )
  }

  /**
   * A HANDLE WHOSE HOLDER WENT QUIET IS TAKEN OVER, AND THE ROW SAYS BY WHOM (criterion H4).
   *
   * `theLiveHoldOn` would release it saying only that it went quiet, which is true and is half the
   * answer. This releases it first with the whole one. Nothing is signalled: the session named on
   * the old row is not touched and may still be running.
   */
  const standing = liveRowFor(agent.id)
  let tookOverFrom: HoldOnTheWire | null = null
  if (standing !== undefined && standing.sessionRecordId !== session) {
    const now = Date.now()
    if (stateOf(standing, now) === 'lapsed') {
      tookOverFrom = releaseAHold(
        standing.id,
        // THE NUMBER IS THE GRACE WINDOW, because that is the window that was actually exceeded:
        // `stateOf` reads `lapsed` only past both. Criterion M81.
        takenOverBy(quietFor(standing.lastHeardAt, now), handleGraceSeconds(), session),
      )
    }
  }

  const held = theLiveHoldOn(agent.id)
  if (held !== null && held.session !== session) {
    throw new PanelError(
      heldBySomebodyElse({
        handle: held.handle,
        session: held.session,
        machine: held.machine,
        runtime: held.runtime,
        lastHeardAt: held.lastHeardAt,
        // WHEN THIS HANDLE COULD BE TAKEN OVER, which is past the grace window and not past the
        // lapse: a kept hold is still its session's and this refusal is what says so. M81.
        lapsesInSeconds: handleGraceSeconds(),
      }),
      409,
    )
  }
  const at = nowStamp()
  if (held !== null) {
    // THE SAME SESSION, STARTING ITS WAITER AGAIN. Beating the hold it already has, rather than
    // writing a second row, is what keeps "one live hold per agent" true through every wake.
    db.update(handleHolds)
      .set({ lastHeardAt: at, machine: asked.machine, runtime: asked.runtime })
      .where(eq(handleHolds.id, held.id))
      .run()
    answeringMayHaveChanged([agent.id])
    return { hold: onTheWire(rowOf(held.id) as Stored), tookOverFrom, endedRunAsked }
  }
  const id = anOfficeId()
  db.insert(handleHolds)
    .values({
      id,
      agentId: agent.id,
      sessionRecordId: session,
      machine: asked.machine,
      runtime: asked.runtime,
      claimedAt: at,
      lastHeardAt: at,
      releasedAt: null,
      releasedBecause: null,
    })
    .run()
  if (askedFor.kind === 'session' && !theRunHasEnded(askedFor.data['state'])) beginNoticeWorkTurn({ kind: 'agent', id: agent.id }, session)
  answeringMayHaveChanged([agent.id])
  return { hold: onTheWire(rowOf(id) as Stored), tookOverFrom, endedRunAsked }
}

/**
 * SAY THE SESSION HOLDING THIS HANDLE IS STILL THERE.
 *
 * Only the session named on the hold may beat it. A beat from anybody else would be one process
 * keeping another's hold alive, which is the one way a handle could be held by a session that has
 * gone without anybody noticing. A waiter started with a run that has ended sends that run's id,
 * and it is taken only when it resolves to the hold's own run (`isTheHoldsRun`).
 */
export function beatTheHold(handle: string, session: string, keyHolder?: string | null): HoldOnTheWire {
  const agent = theAgentAHandleDoorNames(handle, keyHolder)
  if (agent === null) {
    throw new PanelError(
      `No durable agent in this installation has the handle "${handle}". Nothing was written.`,
      404,
    )
  }
  const held = theLiveHoldOn(agent.id)
  if (held === null) {
    throw new PanelError(
      `Nothing is holding the handle "${handle}" now, so there is no heartbeat to write. A hold that went quiet ` +
        'for longer than it was allowed has already been released, and the reason is on it: GET /api/handles. ' +
        'Claim it again to go on answering as this agent. Nothing was written.',
      409,
    )
  }
  if (!isTheHoldsRun(session, held.session)) {
    throw new PanelError(
      `The handle "${handle}" is held by the session filed as record ${held.session}, not by ${session}. Only the ` +
        'session that holds a handle may say it is still there. Nothing was written and nothing was signalled.',
      409,
    )
  }
  const at = nowStamp()
  db.update(handleHolds).set({ lastHeardAt: at }).where(eq(handleHolds.id, held.id)).run()
  return onTheWire(rowOf(held.id) as Stored)
}

/** Let a handle go, by handle rather than by hold id, which is what the waiter has. An ended run's id is taken as `beatTheHold` takes it. */
export function letTheHandleGo(handle: string, session: string, because: string, keyHolder?: string | null): HoldOnTheWire {
  const agent = theAgentAHandleDoorNames(handle, keyHolder)
  if (agent === null) {
    throw new PanelError(`No durable agent in this installation has the handle "${handle}". Nothing was written.`, 404)
  }
  const row = liveRowFor(agent.id)
  if (row === undefined) {
    throw new PanelError(
      `Nothing is holding the handle "${handle}", so there is nothing to let go of. Nothing was written.`,
      409,
    )
  }
  if (!isTheHoldsRun(session, row.sessionRecordId)) {
    throw new PanelError(
      `The handle "${handle}" is held by the session filed as record ${row.sessionRecordId}, not by ${session}. ` +
        'Only the session that holds a handle may let it go. Nothing was written and nothing was signalled.',
      409,
    )
  }
  return releaseAHold(row.id, because === '' ? HOLD.released.sentence : because)
}

// ============================================================================ a credential's own handle

/**
 * WHETHER THIS CREDENTIAL MAY ACT ON THIS HANDLE, and the sentence naming both when it may not.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE FUNCTION AND NOT A CHECK IN EACH DOOR
 * ---------------------------------------------------------------------------------------
 *
 * A credential is issued to one handle: each agent gets its own (design/permissions/ACCEPTANCE.md
 * section 3.6). A request that carries one and names a handle in its path must name that same handle,
 * or a credential confirmed for one agent could hold, beat, take and release another's. Every handle
 * door that names a handle in its path asks the same question, and asking it six times would be the
 * ninth invariant broken in the one place where drifting apart means a credential acting as somebody
 * else.
 *
 * ---------------------------------------------------------------------------------------
 * THE NARROW READING, AND WHY A REQUEST WITH NO CREDENTIAL IS UNTOUCHED
 * ---------------------------------------------------------------------------------------
 *
 * This fires ONLY when a request carries a credential. A request that carries none — every local
 * waiter, which sends the office's key and no credential — is left exactly as it was, which is
 * deliberate: a rule written one word wider would refuse the office's own waiters. The keyless route
 * from off-loopback callers is not this rule's business and stays where P83 point 6 leaves it.
 *
 * A credential whose handle is its own answers null and the door goes on. The comparison is exact:
 * a handle is not folded by case.
 *
 * ---------------------------------------------------------------------------------------
 * THE CREDENTIAL IS BOUND TO THE AGENT'S ID, NOT TO ITS HANDLE
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I5. A retired agent's handle can be taken by a new agent (criterion I3), so the same
 * handle can name two agents over time. A credential that was never ended must not act for the new
 * agent. So where a registry row carries this credential (the row a confirmation or a registration
 * under the credential wrote), the handle in the path is resolved to an agent and that agent must be
 * one of those rows. Only where no row carries the credential, or the path names nobody, is the
 * credential's handle compared with the path as a string, as before.
 */
export function whyACredentialMayNotActOnThisHandle(
  credential: Pick<VisitorCredential, 'id' | 'handle'>,
  handle: string,
): string | null {
  const itsAgents = sqlite.prepare('SELECT id, name FROM agents WHERE credential = ?').all(credential.id) as {
    id: string
    name: string
  }[]
  const named = itsAgents.length === 0 ? null : theAgentAnArrivingReferenceNames(handle, 'reading')
  if (named === null) {
    if (credential.handle === handle) return null
    return (
      `This credential may act only on its own handle. The credential "${credential.handle}" ` +
      `(${credential.id}) was issued to "${credential.handle}", and this request names "${handle}". Nothing was done.`
    )
  }
  if (itsAgents.some((one) => one.id === named.agent.id)) return null
  return (
    `This credential may act only for the agent it was issued to. The credential "${credential.handle}" ` +
    `(${credential.id}) belongs to ${itsAgents.map((one) => `${one.name} (${one.id})`).join(' and ')}, and ` +
    `"${handle}" names ${named.agent.name} (${named.agent.id}), another agent. Nothing was done.`
  )
}

type WaitingFacts = { urgent: boolean; data: Record<string, unknown>; sentBy: ParticipantRef | null }

function waitingFacts(raw: string | null): WaitingFacts {
  let data: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}')
    if (typeof parsed === 'object' && parsed !== null) data = parsed as Record<string, unknown>
  } catch { /* A stored message may have unreadable data. */ }
  const source = data['sentBy']
  let sentBy: ParticipantRef | null = null
  if (typeof source === 'object' && source !== null && !Array.isArray(source)) {
    const held = source as { kind?: unknown; id?: unknown }
    if ((held.kind === 'person' || held.kind === 'agent') && typeof held.id === 'string' && held.id !== '') {
      sentBy = { kind: held.kind, id: held.id }
    }
  }
  return { urgent: data['urgent'] === true, data, sentBy }
}

function inWaiterOrder<T extends { urgent: boolean; sentBy: ParticipantRef | null }>(said: readonly T[]): T[] {
  return [
    ...said.filter((one) => one.urgent),
    ...said.filter((one) => !one.urgent && one.sentBy?.kind === 'person'),
    ...said.filter((one) => !one.urgent && one.sentBy?.kind !== 'person'),
  ]
}

type WaitingRow = { recipientId: string; messageId: string; data: string | null; createdAt: string }

function waitingRowsFor(ids: readonly string[]): WaitingRow[] {
  return sqlite.prepare(
    "SELECT d.recipient_id AS recipientId, d.message_id AS messageId, r.data AS data, r.created_at AS createdAt " +
    "FROM message_delivery d JOIN records r ON r.id = d.message_id " +
    "WHERE d.mark = 'queued' AND d.recipient_kind = 'agent' AND d.recipient_id IN (SELECT value FROM json_each(?)) " +
    "AND r.kind = 'message' AND r.deleted_at IS NULL ORDER BY r.created_at, r.rowid",
  ).all(JSON.stringify(ids)) as WaitingRow[]
}

/** The projects the waiter names for each agent, in the same order as its full reading. */
export function projectsWaitingForTheseAgents(agentIds: readonly string[]): Map<string, Set<string>> {
  const aliases = theFiledAliasesReadOnce(sqlite)
  const owners = new Map<string, string[]>()
  for (const agentId of agentIds) {
    for (const id of theRegistryIdsOf(sqlite, agentId, aliases)) {
      const agents = owners.get(id) ?? []
      agents.push(agentId)
      owners.set(id, agents)
    }
  }
  const rows = waitingRowsFor([...owners.keys()])
  const byAgent = new Map<string, WaitingFacts[]>()
  for (const row of rows) {
    const fact = waitingFacts(row.data)
    for (const agent of owners.get(row.recipientId) ?? []) {
      const waiting = byAgent.get(agent) ?? []
      waiting.push(fact)
      byAgent.set(agent, waiting)
    }
  }
  const projects = new Map<string, Set<string>>()
  for (const [agent, waiting] of byAgent) {
    projects.set(agent, new Set(inWaiterOrder(waiting).map((one) => writtenInOf(one.data)?.project).filter((one): one is string => one !== undefined)))
  }
  return projects
}

/**
 * EVERYTHING STILL WAITING FOR ONE AGENT, IN EVERY PROJECT, OLDEST FIRST WITH EMERGENCIES IN FRONT.
 *
 * Criterion M74, and criterion M76 with it. The waiter asks this when it starts and when its
 * connection comes back, so a message written while it was away is handed over instead of sitting
 * under a clock: the worker will not start a run for it while this session holds the handle, and
 * nothing else would ever hand it across.
 *
 * WHY IT IS NOT `theQueue`, WHICH THE WAITER USED TO ASK. That is the message WORKER's queue and it
 * is a project's queue by design — a worker started in one project must not start runs in another.
 * The waiter is not the worker. It holds the handle for an agent the whole chat writes to, and the
 * chat is the person's across every project, so a message to that agent filed elsewhere is a message this
 * session has to be given. Their three messages of 7 September were exactly that and never arrived.
 *
 * A DELIVERY ROW HAS NO PROJECT AND NEVER HAS, which is why this can be asked at all: it is one
 * message and one recipient. The project each one is IN comes back on the row, because an answer is
 * filed where the message it answers was filed.
 */
export function everythingWaitingFor(agentId: string): {
  messageId: string
  urgent: boolean
  /** Where it was written, from its mark: the message is in no project, and an answer joins the conversation wherever it is written. */
  writtenIn: { project?: string; page?: string } | null
  sentBy: ParticipantRef | null
  swept?: SweptLetterNotice
  /** Why this row wakes no waiter, when it is one of the office's notices that ask nothing (`whyThisWakesNoWaiter`). Absent on every other row. */
  wakesNoWaiter?: string
  heldForBatch?: boolean
  batchTurn?: string
}[] {
  const recipient = { kind: 'agent' as const, id: agentId }
  const { muted, batched } = noticeKindsFor(recipient)
  const batchStates = batched.length === 0 ? null : batchDeliveryStates(recipient)
  // At off, a notice the recipient's own rules mute is handed over as if no rule muted it.
  const noticeRulesHold = gatePosition('held-by-a-notice-rule') === 'block'
  const ids = theRegistryIdsOf(sqlite, agentId)
  const rows = waitingRowsFor(ids)
  const claim = rows.length === 0 ? undefined : deadLetterClaimsIn().find((one) =>
    theOneAgentAStringNames(sqlite, one.agentId)?.id === agentId,
  )
  const said = rows.map((row) => {
    const { urgent, data, sentBy } = waitingFacts(row.data)
    const swept = sweptLetterNotice(claim, row.createdAt, data)
    const batchInfo = noticeRulesHold ? batchStates?.get(row.messageId) : undefined
    const batch = batchInfo?.state ?? null
    const quiet = batch === 'held' ? BATCH_HELD : batch === 'released' ? null : (noticeRulesHold ? whyPersonalNoticeRuleHolds(sentBy, data['notice'], muted) : null) ?? whyThisWakesNoWaiter(sentBy, data['notice'])
    return {
      messageId: row.messageId,
      ...(batch === 'held' ? { heldForBatch: true } : {}),
      ...(batchInfo?.turn ? { batchTurn: batchInfo.turn } : {}),
      urgent,
      writtenIn: writtenInOf(data),
      sentBy,
      ...(swept === undefined ? {} : { swept }),
      ...(quiet === null ? {} : { wakesNoWaiter: quiet }),
    }
  })
  // Emergencies come first, then the person's messages, then agents' receipts. The original query
  // order keeps each group oldest first.
  return inWaiterOrder(said)
}

export { theFirstMessageHandedToThisSessionAfter } from './the-first-message-handed-to-this-session-after.ts'
