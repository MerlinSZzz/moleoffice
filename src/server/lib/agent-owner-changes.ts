// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HAND-OVERS OF AN AGENT'S OWNER, KEPT AND READ (wave 13s round 281). Migration 0356.
 *
 * The owner door, POST /api/agents/:id/owner, hands an agent to another owner through `writeAnOwnerHandOver`, which
 * changes the registry row and keeps one row of `agent_owner_changes` in the same write. Nothing else writes the table:
 * an import that names another owner writes no row.
 *
 * The rows begin at a moment, `installation.owner_changes_since`. The server's start writes it once, before it serves,
 * through `keepTheDayTheHandOversBeganOnce`, and never again. Until then it is NULL, and the read says no day.
 *
 * GET /api/participants/agent/:id/owner-changes reads them through `theOwnerHandOversOf`: every row of the agent,
 * newest first by its stamp and then by the order the rows were written, with the office name of each owner and maker.
 */
import { sqlite } from '../db/client.ts'
import { giveTheFill } from '../db/part-tables.ts'
import { readParticipant } from '../db/read-participant.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { nowStamp } from '@shared/time.ts'
import { theRecordedOwner } from './agent-owner.ts'
import { anOfficeId } from './ids.ts'
import { theOfficeNameOf } from './inspection.ts'
import { theAgentAStoredIdNames } from './the-agent-a-stored-id-names.ts'

/** One hand-over as the owner door gives it to be kept. `because` is the reason as the door read it, trimmed. */
export interface AnOwnerHandOverToKeep {
  agent: string
  to: ParticipantRef
  by: ParticipantRef
  underTheGrant: string | null
  because: string
}

/** An owner in the three states the read of one agent says its owner in: absent, broken, or held with its office name. */
type AnOwnerOnTheWire =
  | { state: 'absent' }
  | { state: 'broken' }
  | { state: 'held'; kind: ParticipantRef['kind']; id: string; name: string | null }

/** One kept hand-over on the wire. A name is null where the stored id names nobody registered. */
export interface AnOwnerHandOver {
  id: string
  at: string
  before: AnOwnerOnTheWire
  after: Extract<AnOwnerOnTheWire, { state: 'held' }>
  by: ParticipantRef & { name: string | null }
  underTheGrant: string | null
  because: string
}

/** The read of one agent's hand-overs. `since` is null until the office has written the moment the rows begin. */
export interface TheOwnerHandOversOfAnAgent {
  agent: string
  since: string | null
  handOvers: AnOwnerHandOver[]
}

interface AnOwnerChangeRow {
  id: string
  from_kind: string | null
  from_id: string | null
  to_kind: ParticipantRef['kind']
  to_id: string
  made_by_kind: ParticipantRef['kind']
  made_by_id: string
  under_grant: string | null
  because: string
  made_at: string
}

/**
 * HAND THE AGENT TO `to` AND KEEP THE HAND-OVER, in one write. The owner before is read from the registry row inside
 * that write and kept exactly as the row held it. The caller has made every check; nothing is refused here except an
 * agent with no registry row. Returns the new row's id.
 */
export function writeAnOwnerHandOver(handOver: AnOwnerHandOverToKeep): string {
  return sqlite.transaction(() => {
    const before = sqlite.prepare('SELECT owner_kind AS kind, owner_id AS id FROM agents WHERE id = ?').get(handOver.agent) as
      | { kind: string | null; id: string | null }
      | undefined
    if (before === undefined) {
      throw new Error(`No agent in this installation has the id "${handOver.agent}", so its owner was not handed over and nothing was kept.`)
    }
    sqlite.prepare('UPDATE agents SET owner_id = ?, owner_kind = ? WHERE id = ?').run(handOver.to.id, handOver.to.kind, handOver.agent)
    const id = anOfficeId()
    sqlite.prepare(
      'INSERT INTO agent_owner_changes (id, agent_id, from_kind, from_id, to_kind, to_id, made_by_kind, made_by_id, under_grant, ' +
        'because, made_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id, handOver.agent, before.kind, before.id, handOver.to.kind, handOver.to.id, handOver.by.kind, handOver.by.id,
      handOver.underTheGrant, handOver.because, nowStamp(),
    )
    return id
  })()
}

/**
 * THE MOMENT THIS OFFICE BEGAN TO KEEP THE HAND-OVERS, or null when it has not been written. No installation row is an
 * error, never a moment guessed: every office has the one installation row.
 */
export function theDayTheHandOversBegan(): string | null {
  const stored = sqlite.prepare('SELECT owner_changes_since AS since FROM installation WHERE only_row = 1').get() as
    | { since: string | null }
    | undefined
  if (stored === undefined) {
    throw new Error("This office has no installation row, so the moment it began to keep the hand-overs of an agent's owner cannot be read.")
  }
  return stored.since
}

/**
 * WRITE THE MOMENT THE HAND-OVERS BEGIN, ONCE. The server's start calls it before it serves. A moment already written
 * stays. The line says which happened, for the start's log.
 */
export function keepTheDayTheHandOversBeganOnce(): { since: string; line: string } {
  const wrote = sqlite
    .prepare('UPDATE installation SET owner_changes_since = ? WHERE only_row = 1 AND owner_changes_since IS NULL')
    .run(nowStamp()).changes
  const since = theDayTheHandOversBegan()
  if (since === null) throw new Error("The moment this office began to keep the hand-overs of an agent's owner was written and reads back empty.")
  return {
    since,
    line: wrote === 1
      ? `This office keeps the hand-overs of an agent's owner from ${since}, which is now.`
      : `This office has kept the hand-overs of an agent's owner since ${since}.`,
  }
}

/**
 * THE OFFICE NAME OF A PERSON OR AN AGENT A STORED REFERENCE NAMES, or null when its id names nobody registered. An
 * agent is found by its id as criterion I2 reads a stored reference, never by a handle. This is the one place that
 * works it out. The other caller is `theOwnerOnTheWire` in src/server/api/participants.ts, for the owner of one agent.
 */
export function theOfficeNameOfAStoredReference(who: ParticipantRef): string | null {
  if (who.kind === 'agent') {
    const agent = theAgentAStoredIdNames(who.id)
    return agent === null ? null : theOfficeNameOf(agent)
  }
  return readParticipant(who)?.name ?? null
}

function onTheWire(row: AnOwnerChangeRow): AnOwnerHandOver {
  const recorded = theRecordedOwner({ ownerKind: row.from_kind, ownerId: row.from_id })
  const before: AnOwnerOnTheWire =
    recorded.state === 'held' ? { state: 'held', ...recorded.owner, name: theOfficeNameOfAStoredReference(recorded.owner) } : recorded
  const after = { kind: row.to_kind, id: row.to_id }
  const by = { kind: row.made_by_kind, id: row.made_by_id }
  return {
    id: row.id,
    at: row.made_at,
    before,
    after: { state: 'held', ...after, name: theOfficeNameOfAStoredReference(after) },
    by: { ...by, name: theOfficeNameOfAStoredReference(by) },
    underTheGrant: row.under_grant,
    because: row.because,
  }
}

/** EVERY HAND-OVER OF ONE AGENT, newest first by its stamp and then by the order written, and the moment they begin. */
export function theOwnerHandOversOf(agentId: string): TheOwnerHandOversOfAnAgent {
  const rows = sqlite
    .prepare('SELECT * FROM agent_owner_changes WHERE agent_id = ? ORDER BY made_at DESC, rowid DESC')
    .all(agentId) as AnOwnerChangeRow[]
  return { agent: agentId, since: theDayTheHandOversBegan(), handOvers: rows.map(onTheWire) }
}

/**
 * THE RESTORE PROOF'S HAND-OVER, written by the product's own writer: a live agent is handed to the owner it already
 * has, by the person, or to the person where it has no owner that can be read.
 */
export async function fillTheOwnerHandOverProof(): Promise<string> {
  const said = 'A live agent handed by the person to the owner it already had, or to the person where it had none.'
  if (sqlite.prepare('SELECT 1 FROM agent_owner_changes LIMIT 1').get() !== undefined) return said
  const agent = sqlite
    .prepare('SELECT id, owner_kind AS ownerKind, owner_id AS ownerId FROM agents WHERE retired = 0 AND id <> ? ORDER BY id LIMIT 1')
    .get(moleOffice().id) as { id: string; ownerKind: string | null; ownerId: string | null } | undefined
  if (agent === undefined) throw new Error('The restore proof hands a live agent to an owner, and its corpus holds none.')
  const recorded = theRecordedOwner(agent)
  writeAnOwnerHandOver({
    agent: agent.id,
    to: recorded.state === 'held' ? recorded.owner : { kind: 'person', id: THE_PERSON },
    by: { kind: 'person', id: THE_PERSON },
    underTheGrant: null,
    because: 'The restore proof carries a hand-over of an owner.',
  })
  return said
}
// The schema part of agent_owner_changes names this file for its fill, so the database folder imports nothing above
// itself.
giveTheFill('src/server/lib/agent-owner-changes.ts', fillTheOwnerHandOverProof)
