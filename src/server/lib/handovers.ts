// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HANDOVER DOCUMENT FOR EVERY AGENT. Wave 13k round 46, on point 2 and item 2 of two decisions:
 * handover sessions may be built, and every agent keeps a handover document so work can be handed over
 * quickly.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * Plain text an agent writes for whoever starts its work next: its own next session, a session after a compaction,
 * or whoever takes over its work. It lives in the `handovers` table (migration 0232), one row per handover. A new
 * handover is a new row, and the newest row for an agent in a project is its current handover. This file only
 * inserts: nothing updates or deletes a row, so every earlier handover stays readable as history.
 *
 * ---------------------------------------------------------------------------------------
 * WHO WRITES AND WHO READS
 * ---------------------------------------------------------------------------------------
 *
 * WRITE: the agent itself, proved by its own agent key, or the person (`thePersonIsProved`), or a secretary the
 * person's grant carries where this office says it does (`aRaiseCarriesIt`, wave 13s round 68). Another agent is
 * refused, and so is the agent itself when it sends no key of its own: a handover is read first by the next session
 * as the agent's own words, so a name sent in a header is not enough to write one. A handover written under the grant
 * names the secretary as its writer, by its registry id, and never the person: `whoPressedItUnderTheGrant` works out
 * who pressed, and the press row keeps the grant and the reason.
 *
 * READ: the agent itself (the caller the request resolves to is this agent), the person, and the agent that
 * answers for this agent's keys, its registered starter (`whoAnswersForTheKeysOf`). That is the narrowest rule the
 * existing readers support that still reaches the two readers the decisions name: the agent's next session, and
 * whoever takes over its work, which in this office is the starter that hands the work on. Any other agent is
 * refused, except at the read door itself, GET /api/agents/:id/handover, where the person's grant carries a
 * secretary's read as it carries the write (src/server/api/handovers.ts).
 */
import { and, desc, eq, sql } from 'drizzle-orm'

import { db, sqlite } from '../db/client.ts'
import { handovers } from '../db/schema.ts'
import { HANDOVER_LONGEST_CHARACTERS } from '../../config/settings.mjs'
import { anOfficeId } from './ids.ts'
import { gateMet } from './gate-counts.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { whoAnswersForTheKeysOf } from './newkey.ts'
import { type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { aRaiseCarriesIt, type Actor } from './records.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'
import { now } from '@shared/now.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { whoPressedItUnderTheGrant } from './the-persons-own-words.ts'
import type { AHandover, TheHandoverPart } from '@shared/profile.ts'

/** The most earlier handovers `?history=1` lists. */
export const HANDOVER_HISTORY_LIMIT = 25

export type { AHandover, TheHandoverPart }

type Row = typeof handovers.$inferSelect

function fromTheRow(row: Row): AHandover {
  return {
    id: row.id,
    agentId: row.agentId,
    workspaceId: row.workspaceId,
    text: row.text,
    writtenAt: row.writtenAt,
    writtenByKind: row.writtenByKind === 'person' ? 'person' : 'agent',
    writtenById: row.writtenById,
    sessionId: row.sessionId,
  }
}

/** How many characters a text is, counting a Chinese character or an emoji as one. */
export function charactersIn(text: string): number {
  return [...text].length
}

// ============================================================================ who may

/**
 * Who is writing, in the two words the rows are stored under, or null because this caller may not write it. Asked by
 * the write alone, since it asks the person's grant for the press of agent.handover-write: the person, then the agent's
 * own key, then the grant, and a secretary the grant carries writes as itself.
 */
export function whoMayWriteTheHandoverOf(actor: Actor, agent: RegisteredAgent): { kind: 'agent' | 'person'; id: string } | null {
  if (thePersonIsProved(actor)) return { kind: 'person', id: actor.id }
  if (actor.provedBy === 'an-agent-key' && actor.keyHolder !== undefined) {
    const holder = theOneAgentAStringNames(sqlite, actor.keyHolder)
    if (holder !== null && holder.id === agent.id) return { kind: 'agent', id: agent.id }
  }
  if (!aRaiseCarriesIt(actor)) return null
  const pressed = whoPressedItUnderTheGrant(actor)
  return pressed === null ? null : { kind: 'agent', id: pressed.by.id }
}

/** Whether this caller may read this agent's handover: the agent itself, the person, or its registered starter. */
export function mayReadTheHandoverOf(actor: Actor, agent: RegisteredAgent): boolean {
  if (thePersonIsProved(actor)) return true
  const caller = participantForActor(actor)
  if (caller === null || caller.kind !== 'agent') return false
  if (caller.id === agent.id) return true
  const starter = whoAnswersForTheKeysOf(agent)
  return starter.kind === 'agent' && starter.id === caller.id
}

/** The refusal a read gets, naming who may. */
export function refuseAReaderOfTheHandover(agent: RegisteredAgent): never {
  throw new PanelError(
    `The handover of "${agent.handle}" is read by "${agent.handle}" itself, by the person, and by the agent that ` +
      `started "${agent.handle}". This request is none of them, so nothing was read.`,
    403,
  )
}

// ============================================================================ reading

/** The newest handover of this agent in this project, and how many were written before it. */
export function theCurrentHandover(agentId: string, workspaceId: string): { current: AHandover | null; earlier: number } {
  const row = db
    .select()
    .from(handovers)
    .where(and(eq(handovers.agentId, agentId), eq(handovers.workspaceId, workspaceId)))
    .orderBy(desc(handovers.writtenAt), desc(sql`rowid`))
    .limit(1)
    .get()
  if (row === undefined) return { current: null, earlier: 0 }
  const counted = db
    .select({ n: sql<number>`count(*)` })
    .from(handovers)
    .where(and(eq(handovers.agentId, agentId), eq(handovers.workspaceId, workspaceId)))
    .get()
  return { current: fromTheRow(row), earlier: (counted?.n ?? 1) - 1 }
}

/** This agent's handovers in this project, newest first, at most HANDOVER_HISTORY_LIMIT. */
export function theHandoverHistory(agentId: string, workspaceId: string): AHandover[] {
  return db
    .select()
    .from(handovers)
    .where(and(eq(handovers.agentId, agentId), eq(handovers.workspaceId, workspaceId)))
    .orderBy(desc(handovers.writtenAt), desc(sql`rowid`))
    .limit(HANDOVER_HISTORY_LIMIT)
    .all()
    .map(fromTheRow)
}

/** The sentence for an agent with no handover in this project. */
export function noHandoverHasBeenWritten(handle: string): string {
  return `No handover has been written for "${handle}" in this project. That is nobody having written one, not a handover that says nothing.`
}

/**
 * THIS AGENT'S CURRENT HANDOVER FOR THIS READER, in the one shape the agent's page and the read after a compaction
 * both answer. A reader the read rule refuses is told so, and the door it would ask as the agent.
 */
export function theHandoverPartFor(actor: Actor, agent: RegisteredAgent, workspaceId: string): TheHandoverPart {
  if (!mayReadTheHandoverOf(actor, agent) && gateMet('who-reads-a-handover') === 'block') {
    return {
      read: false,
      current: null,
      earlier: 0,
      says:
        `This request does not come from "${agent.handle}", its starter or the person, so its handover was not read. ` +
        `Asked as one of them, GET /api/agents/${agent.handle}/handover answers it.`,
    }
  }
  return theHandoverPart(agent, workspaceId)
}

/** This agent's current handover, read, for a reader its door has already let through. */
export function theHandoverPart(agent: RegisteredAgent, workspaceId: string): TheHandoverPart {
  const { current, earlier } = theCurrentHandover(agent.id, workspaceId)
  return {
    read: true,
    current,
    earlier,
    says:
      current === null
        ? noHandoverHasBeenWritten(agent.handle)
        : `The current handover of "${agent.handle}" was written at ${current.writtenAt}; ${String(earlier)} earlier ${earlier === 1 ? 'one is' : 'ones are'} kept.`,
  }
}

// ============================================================================ writing

/**
 * WRITE A NEW HANDOVER. Checks everything before it writes, and writes one new row. Nothing earlier is changed.
 *
 * The text is stored as it was sent. It is refused when it is empty or only spaces, and when it is longer than
 * HANDOVER_LONGEST_CHARACTERS, with both numbers; nothing is cut.
 */
export function writeAHandover(input: { agent: RegisteredAgent; text: string; actor: Actor; workspaceId: string }): AHandover {
  const writer = whoMayWriteTheHandoverOf(input.actor, input.agent)
  if (writer === null) {
    throw new PanelError(
      `The handover of "${input.agent.handle}" is written by "${input.agent.handle}" itself, sending its own agent key, ` +
        'or by the person. This request is neither, so nothing was written. Another agent may not write it: a handover ' +
        `is read first by the next session of "${input.agent.handle}" as that agent's own words.`,
      403,
    )
  }
  if (input.text.trim() === '') {
    throw new PanelError('A handover with no words in it says nothing to the next session, so nothing was written.', 400)
  }
  const length = charactersIn(input.text)
  if (length > HANDOVER_LONGEST_CHARACTERS) {
    throw new PanelError(
      `This handover is ${String(length)} characters long, and a handover may be at most ` +
        `${String(HANDOVER_LONGEST_CHARACTERS)} characters. Nothing was written and nothing was cut. Shorten it and send it again.`,
      400,
    )
  }
  const said = input.actor.sessionId ?? null
  const sessionId = said === null || said.trim() === '' ? null : (resolveSessionRef(said, input.workspaceId).recordId ?? said.trim())
  const id = anOfficeId()
  db.insert(handovers)
    .values({
      id,
      agentId: input.agent.id,
      workspaceId: input.workspaceId,
      text: input.text,
      writtenAt: now(),
      writtenByKind: writer.kind,
      writtenById: writer.id,
      sessionId,
    })
    .run()
  const row = db.select().from(handovers).where(eq(handovers.id, id)).get()
  if (row === undefined) throw new Error(`The handover ${id} was inserted and could not be read back.`)
  return fromTheRow(row)
}
