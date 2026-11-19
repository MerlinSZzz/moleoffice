// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH AGENTS ONE STRING COULD NAME, ASKED AS THREE SEPARATE QUESTIONS, AGAINST ANY DATABASE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE AND NOT PART OF lib/participants.ts
 * ---------------------------------------------------------------------------------------
 *
 * Two callers need this reading and one of them may not reach a connection.
 *
 *   `lib/participants.ts` asks it of the database this process has open, for the resolver every
 *   arriving reference goes through.
 *
 *   `db/message-delivery-migration.ts` asks it of the database it is handed, to decide who a
 *   historical message was from.
 *
 * The second is what forces the split. `db/migrate.ts` says it in its own words: *"importing this
 * module opens no database. db/client.ts reads MOLE_OFFICE_DB the moment IT is imported"* — which is
 * why its own import of the client is dynamic. A migration that imported `lib/participants.ts` would
 * pull `db/client.ts` in at module load, and every test that statically imports the migrate path
 * would open the file `.env` names before `freshDb()` could point it anywhere else. That is not
 * hypothetical: it is what happened when this reading first lived in `lib/participants.ts`, and the
 * guard in `db/client.ts` refused with *"a test opened Mole Office's database without saying which
 * one"*.
 *
 * SO THIS FILE IMPORTS NO CONNECTION. It takes the database as an argument; alias helpers use that same handle.
 * Both callers get one reading, which is what invariant 9 asks for — one fact worked out in one
 * place — without either of them inheriting the other's module-load side effects.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THREE QUESTIONS AND NOT ONE STATEMENT
 * ---------------------------------------------------------------------------------------
 *
 * The thing this replaces is `SELECT id FROM agents WHERE id = ? OR handle = ?`, written seven times
 * across this repository. One statement, no ordering, so SQLite hands back whichever row it reaches
 * first. That is harmless while every agent's id equals its handle and becomes a silent wrong-agent
 * answer the day one string can be one agent's id and another agent's name.
 *
 * Asking the three apart is what makes that difference visible: the caller is told WHICH row
 * answered WHICH question, so it can tell *one agent, said two ways* from *two agents, one string*
 * instead of being handed a row and no way to know which it got.
 */

import type Database from 'better-sqlite3'
import { readRegistryAliases, theRegistryRowNamedBy } from './registry-aliases/index.ts'

/** One agent row, cut down to what resolving a reference needs. */
export interface AgentIdentity {
  id: string
  handle: string
  name: string
  retired: boolean
  /**
   * When it was retired, or null.
   *
   * Null on a live row, and null on a RETIRED row as well: every row retired before the retire door
   * existed was retired by the release of a claim, and nobody recorded the moment. A sentence that
   * printed a date here would be inventing one.
   */
  retiredAt: string | null
}

/**
 * The database a reference is resolved against.
 *
 * It is an argument rather than a module-level connection for the reason the file header gives: one
 * of the two callers runs inside a migration, against whatever database it was handed.
 */
export type AgentRowReader = Database.Database

/** Every agent row one arriving string could mean. */
export interface WhatAReferenceCouldName {
  /** The agent this current or permanently aliased registry id names, or null when neither owns it. */
  byId: AgentIdentity | null
  /** The LIVE agent whose handle this string is, or null because no live agent bears it. */
  liveByHandle: AgentIdentity | null
  /**
   * The ONE retired agent whose handle this string is, or null because none bears it or because more
   * than one does. A handle is unique among live agents only (criterion I3), so any number of retired
   * agents may bear one, and picking one of two would name the wrong agent in silence.
   */
  retiredByHandle: AgentIdentity | null
  /** Every retired agent whose handle this string is, oldest first. Empty because none bears it. */
  everyRetiredByHandle: AgentIdentity[]
}

const IDENTITY_FIELDS = 'id, handle, name, retired, retired_at AS retiredAt'
const IDENTITY_COLUMNS = `SELECT ${IDENTITY_FIELDS} FROM agents `

interface IdentityStatements {
  every: { all: () => unknown[] }
  live: { get: (reference: string) => unknown }
  retired: { all: (reference: string) => unknown[] }
}

/**
 * ONE SET OF PREPARED STATEMENTS PER DATABASE HANDLE, NOT ONE SET PER CALL.
 *
 * The same pattern as `theAgentByHandleStatement` in lib/participants.ts and for the same measured
 * reason: this is on the path of every request, because the actor lookup asks it, and re-preparing
 * the same three statements on every call was a third of that door's time when `listParticipants`
 * did it (problem `9UeL9VeVPn33`). The statements are kept beside the handle they were prepared on,
 * so a test that opens a fresh database gets fresh statements and a statement is never used across
 * two databases. SQLite re-prepares a kept statement by itself when the schema changes under it.
 */
const IDENTITY_STATEMENTS = new WeakMap<object, IdentityStatements>()

function theIdentityStatements(db: AgentRowReader): IdentityStatements {
  const kept = IDENTITY_STATEMENTS.get(db as object)
  if (kept !== undefined) return kept
  const made: IdentityStatements = {
    every: db.prepare(IDENTITY_COLUMNS),
    live: db.prepare(`${IDENTITY_COLUMNS}WHERE handle = ? AND retired = 0`),
    retired: db.prepare(`${IDENTITY_COLUMNS}WHERE handle = ? AND retired = 1 ORDER BY created_at, id`),
  }
  IDENTITY_STATEMENTS.set(db as object, made)
  return made
}

/** One row as this file reads it, or null because there was no row. */
export function asAgentIdentity(row: unknown): AgentIdentity | null {
  if (row === undefined || row === null) return null
  const held = row as { id: string; handle: string; name: string; retired: number; retiredAt: string | null }
  return {
    id: held.id,
    handle: held.handle,
    name: held.name,
    retired: held.retired === 1,
    retiredAt: held.retiredAt,
  }
}

/** The id as it is looked up: trimmed, or null because nothing is left of it. */
function theIdAsAsked(id: string): string | null {
  const said = id.trim()
  return said === '' ? null : said
}

/** The agent this stored registry id or permanent typed alias names; never a current handle. */
export function theAgentWithThisId(db: AgentRowReader, id: string): AgentIdentity | null {
  const said = theIdAsAsked(id)
  if (said === null) return null
  return asAgentIdentity(theRegistryRowNamedBy(db, said, IDENTITY_FIELDS))
}

/** What `theAgentWithThisId` answers for an id, however the rows behind it were read. */
export type TheIdentityOf = ((id: string) => AgentIdentity | null) & {
  /** Optional request-local readings of the other spellings older runs stored. */
  reference?: (reference: string) => WhatAReferenceCouldName
  agentRecord?: (recordId: string) => AgentIdentity | null
}

/**
 * EVERY AGENT'S IDENTITY IN ONE READ, answering for any id what `theAgentWithThisId` answers (wave 13y round 46).
 *
 * The office scene asks which agent each run serves, in three walks over every run, and again for each agent in each
 * project. Each ask was one statement, so one scene ran a statement for every run several times over. This reads the
 * same columns of every row once, the first time an id is asked, and answers from them. Permanent typed aliases name
 * their canonical rows in the same request-local reading; handles retain their separate meaning.
 *
 * Keep it only for one synchronous reading. An agent registered after it was read is not in it.
 */
export function everyAgentsIdentityReadOnce(db: AgentRowReader): TheIdentityOf {
  let byId: ReadonlyMap<string, AgentIdentity> | null = null
  let aliases: ReadonlyMap<string,string> | null = null
  return (id) => {
    const said = theIdAsAsked(id)
    if (said === null) return null
    byId ??= new Map(
      theIdentityStatements(db)
        .every.all()
        .map(asAgentIdentity)
        .filter((one): one is AgentIdentity => one !== null)
        .map((one) => [one.id, one]),
    )
    aliases ??= new Map(readRegistryAliases(db).map(row=>[row.aliasId,row.canonicalId]))
    return byId.get(aliases.get(said) ?? said) ?? null
  }
}

/**
 * EACH AGENT'S IDENTITY READ THE FIRST TIME ITS ID IS ASKED, and kept: what `theAgentWithThisId` answers, one statement
 * for each id asked (wave 13y round 51). A plugin view asked for a list of agents asks about those agents and their
 * runs, and `everyAgentsIdentityReadOnce` would read the whole registry for them.
 *
 * Keep it only for one synchronous reading, as that one.
 */
export function eachAgentsIdentityReadOnce(db: AgentRowReader): TheIdentityOf {
  const kept = new Map<string, AgentIdentity | null>()
  return (id) => {
    const said = theIdAsAsked(id)
    if (said === null) return null
    if (!kept.has(said)) kept.set(said, theAgentWithThisId(db, said))
    return kept.get(said) ?? null
  }
}

/**
 * EVERY AGENT ONE ARRIVING STRING COULD MEAN, READ FROM WHICHEVER DATABASE IS GIVEN.
 *
 * THE LIVE AND THE RETIRED HANDLE ARE ASKED APART because they can be different agents. A handle is
 * unique among live agents only (criterion I3, migration 0174): at most one live row bears it, and
 * any number of retired rows may. So the retired rows are all read and counted, and `retiredByHandle`
 * is filled in only where exactly one bears the handle.
 */
export function everyAgentAReferenceCouldName(db: AgentRowReader, reference: string): WhatAReferenceCouldName {
  const said = reference.trim()
  if (said === '') return { byId: null, liveByHandle: null, retiredByHandle: null, everyRetiredByHandle: [] }
  const statements = theIdentityStatements(db)
  const everyRetiredByHandle = statements.retired
    .all(said)
    .map(asAgentIdentity)
    .filter((one): one is AgentIdentity => one !== null)
  return {
    byId: theAgentWithThisId(db,said),
    liveByHandle: asAgentIdentity(statements.live.get(said)),
    retiredByHandle: everyRetiredByHandle.length === 1 ? everyRetiredByHandle[0]! : null,
    everyRetiredByHandle,
  }
}

/**
 * THE ONE AGENT A STRING NAMES, OR NULL BECAUSE IT NAMES NONE OR MORE THAN ONE.
 *
 * NULL FOR TWO DIFFERENT REASONS ON PURPOSE, and the caller that needs to tell them apart asks
 * `everyAgentAReferenceCouldName` instead and counts for itself. This is for the callers that only
 * need *can this string be trusted to mean one agent* — the key holder, and the migration's stored
 * actor stamp — where "none" and "two" lead to the same answer: do not act on it.
 */
export function theOneAgentAStringNames(db: AgentRowReader, reference: string): AgentIdentity | null {
  return theOneAgentAmong(everyAgentAReferenceCouldName(db, reference))
}

/** The same ambiguity judgement for references read together. */
export function theOneAgentAmong(could: WhatAReferenceCouldName): AgentIdentity | null {
  const named = new Map<string, AgentIdentity>()
  for (const one of [could.byId, could.liveByHandle, ...could.everyRetiredByHandle]) {
    if (one !== null) named.set(one.id, one)
  }
  if (named.size !== 1) return null
  return [...named.values()][0]!
}

/**
 * WHETHER THE KEY A ROW STORES AS ITS HOLDER PROVED THE ROW'S OWN WRITER.
 *
 * A row's writer is stored as the name the headers gave, and its holder as the id the key proved, so the two
 * strings differ even for one agent. Each is read as the office reads any arriving string: an id, an old id
 * through a permanent alias, or a live or retired handle. Yes only where the writer is an agent, the holder
 * came from an agent's key, and both strings name the one same agent. The office's key acting under an
 * agent's name is never the writer's own key, and a string that names no agent or two answers no.
 */
export function theKeyProvedTheRowsOwnWriter(db: AgentRowReader, writer: { type: string; id: string }, holder: unknown): boolean {
  if (writer.type !== 'agent' || holder === null || typeof holder !== 'object') return false
  const { id, how } = holder as { id?: unknown; how?: unknown }
  if (how !== 'an-agent-key' || typeof id !== 'string') return false
  const proved = theOneAgentAStringNames(db, id)
  return proved !== null && theOneAgentAStringNames(db, writer.id)?.id === proved.id
}


/**
 * One reading of each reference kind for a whole-office request. Identity and handle lookups share the same rows;
 * record spellings read only their mapping, since the caller needs the mapped identity rather than its runtime.
 * Nothing survives the request. The ordinary reference judgement still decides whether a spelling is ambiguous.
 */
export function everyAgentsIdentityWithReferencesReadOnce(db: AgentRowReader): TheIdentityOf {
  let agents: ReadonlyMap<string, AgentIdentity> | null = null
  let aliases: ReadonlyMap<string,string> | null = null
  let handles: ReadonlyMap<string, { live: AgentIdentity | null; retired: AgentIdentity[] }> | null = null
  let records: ReadonlyMap<string, string> | null = null
  const every = (): ReadonlyMap<string, AgentIdentity> => (agents ??= new Map(
    db.prepare(`${IDENTITY_COLUMNS}ORDER BY created_at, id`).all().map(asAgentIdentity)
      .filter((one): one is AgentIdentity => one !== null).map(one => [one.id, one]),
  ))
  const identity: TheIdentityOf = id => {
    const said = theIdAsAsked(id)
    if (said === null) return null
    aliases ??= new Map(readRegistryAliases(db).map(row=>[row.aliasId,row.canonicalId]))
    return every().get(aliases.get(said) ?? said) ?? null
  }
  identity.reference = reference => {
    const said = reference.trim()
    if (said === '') return { byId: null, liveByHandle: null, retiredByHandle: null, everyRetiredByHandle: [] }
    if (handles === null) {
      const grouped = new Map<string, { live: AgentIdentity | null; retired: AgentIdentity[] }>()
      for (const agent of every().values()) {
        const held = grouped.get(agent.handle) ?? { live: null, retired: [] }
        if (agent.retired) held.retired.push(agent)
        else held.live = agent
        grouped.set(agent.handle, held)
      }
      handles = grouped
    }
    const held = handles.get(said)
    const retired = held?.retired ?? []
    return { byId: identity(said), liveByHandle: held?.live ?? null, retiredByHandle: retired.length === 1 ? retired[0]! : null, everyRetiredByHandle: retired }
  }
  identity.agentRecord = recordId => {
    records ??= new Map((db.prepare('SELECT record_id AS record, agent_id AS agent FROM agent_records').all() as { record: string; agent: string }[]).map(row => [row.record, row.agent]))
    const agent = records.get(recordId)
    return agent === undefined ? null : identity(agent)
  }
  return identity
}
