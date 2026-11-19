// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STAMPS AN AGENT'S WRITING MAY BE STORED UNDER, for the readers of the writer stamped on a changes row.
 *
 * A stamp is the handle the request named or the registry id its key proved, and nothing beside it says which. A row
 * written before an alias was filed may hold the agent's old id, and it keeps those bytes. An old id is one of the
 * agent's stamps only where this agent alone answers to it, by its id, an old id or a handle, because another agent's
 * handle may be the same string. The census of the ledgers reads a stamp by the same rule, so the two cannot disagree.
 *
 * With no alias filed for the agent, a reader is given back the names it asked by before, and asks in the same words.
 */
import type Database from 'better-sqlite3'
import { everyAgentAReferenceCouldName } from '../agent-references.ts'
import { theFiledAliasesReadOnce, type TheFiledAliases } from './runs.ts'

/** The registry ids of every agent a stamp could name, by its id, an old id or a handle. */
export function theAgentsAStampCouldName(db: Database.Database, stamp: string): ReadonlySet<string> {
  const could = everyAgentAReferenceCouldName(db, stamp)
  return new Set([could.byId, could.liveByHandle, ...could.everyRetiredByHandle].flatMap((one) => (one === null ? [] : [one.id])))
}

/** The names a reader asks by, then each old id filed for the agent that this agent alone answers to. */
export function theStampsOf(db: Database.Database, agentId: string, names: readonly string[], aliases: TheFiledAliases = theFiledAliasesReadOnce(db)): string[] {
  const [canonical, ...old] = aliases.everyIdOf(agentId)
  const its = old.filter((id) => {
    if (names.includes(id)) return false
    const could = theAgentsAStampCouldName(db, id)
    return could.size === 1 && could.has(canonical!)
  })
  return [...names, ...its]
}

/**
 * THE REGISTRY IDS AN AGENT NAMED BY `id` MAY BE STORED UNDER, the canonical id first, for a reader or writer of rows
 * that name an agent by registry id alone. `id` may itself be an old id. An old id that another agent also answers to is
 * not followed: it is answered alone, as it was asked. With no alias filed for the agent the answer is `[id]`.
 */
export function theRegistryIdsOf(db: Database.Database, id: string, aliases: TheFiledAliases = theFiledAliasesReadOnce(db)): string[] {
  const canonical = aliases.canonicalOf(id)
  const ids = theStampsOf(db, canonical, [canonical], aliases)
  return ids.includes(id) ? ids : [id]
}

/** An agent's stamps as the readers of its writing ask by them: its handle and its id, then its old ids. */
export function theStampsOfAnAgent(db: Database.Database, agent: { id: string; handle: string }, aliases?: TheFiledAliases): string[] {
  return theStampsOf(db, agent.id, [agent.handle, agent.id], aliases)
}

/** The stamps of an agent, as one request's reader gives them. */
export type TheStampsOf = (agent: { id: string; handle: string }) => string[]

/**
 * THE STAMPS OF EACH AGENT ONE REQUEST ASKS ABOUT, with the filed aliases read at most once for the whole request. Each
 * agent's stamps are worked out the first time it is asked about and kept for the rest of the request.
 */
export function theStampsReadOnce(db: Database.Database): TheStampsOf {
  const aliases = theFiledAliasesReadOnce(db)
  const kept = new Map<string, string[]>()
  return (agent) => {
    const key = `${agent.id}\u0000${agent.handle}`
    let stamps = kept.get(key)
    if (stamps === undefined) kept.set(key, (stamps = theStampsOfAnAgent(db, agent, aliases)))
    return stamps
  }
}

/**
 * The test of a stamp column against an agent's stamps. Two are the handle and the id, which each reader asked by
 * before, and they are asked in the words it used. More are asked by `IN`.
 */
export function isOneOfTheStamps(column: string, stamps: readonly string[]): string {
  return stamps.length === 2 ? `(${column} = ? OR ${column} = ?)` : `${column} IN (${stamps.map(() => '?').join(', ')})`
}
