// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGISTRY IDS A RUN'S AGENT MAY BE STORED UNDER, for the readers of a run's `servingAgentId` and `servingAgent`.
 *
 * A run's record names the agent it serves by registry id. A record written before an alias was filed may hold the old
 * id, and stored history keeps those bytes. So a reader of runs asks for the canonical id and every alias filed for it,
 * and it compares canonical ids.
 *
 * With no alias filed, `everyIdOf` answers the id it is asked about alone and `canonicalOf` answers the id itself. Each
 * reader then asks exactly what it asked before, in the same words (`isOneOf`, `isOneOfTheIds`) and by the same index.
 */
import type Database from 'better-sqlite3'
import { eq, inArray, type SQL, type SQLWrapper } from 'drizzle-orm'
import { readRegistryAliases } from './index.ts'

/** The test of a stored id against the ids asked: `= ?` for one id, which is what each reader asked before, else `IN`. */
export function isOneOf(ids: readonly string[]): string {
  return ids.length === 1 ? '= ?' : `IN (${ids.map(() => '?').join(', ')})`
}

/** `isOneOf`, for a statement drizzle writes. */
export function isOneOfTheIds(column: SQLWrapper, ids: readonly string[]): SQL {
  return ids.length === 1 ? eq(column, ids[0]) : inArray(column, [...ids])
}

export interface TheFiledAliases {
  /** The canonical registry id of a stored id: the id itself when no alias is filed under it. */
  canonicalOf(id: string): string
  /** The canonical id of the agent an id names, then every alias filed for it, in the order of their ids. */
  everyIdOf(id: string): string[]
  /** Whether any alias is filed at all, for a reader that asks in other words when one is. */
  anyFiled(): boolean
}

/**
 * THE FILED ALIASES, READ IN ONE STATEMENT THE FIRST TIME A READER ASKS, AND KEPT. A reading of many agents or many runs
 * hands one of these down, so the aliases are read once for the reading and not once for each agent or run. Keep it for
 * one synchronous reading only: an alias filed after it was read is not in it.
 */
export function theFiledAliasesReadOnce(db: Database.Database): TheFiledAliases {
  let read: { canonical: Map<string, string>; aliases: Map<string, string[]> } | null = null
  const kept = (): { canonical: Map<string, string>; aliases: Map<string, string[]> } => {
    if (read !== null) return read
    const canonical = new Map<string, string>()
    const aliases = new Map<string, string[]>()
    for (const row of readRegistryAliases(db)) {
      canonical.set(row.aliasId, row.canonicalId)
      const held = aliases.get(row.canonicalId)
      if (held === undefined) aliases.set(row.canonicalId, [row.aliasId])
      else held.push(row.aliasId)
    }
    return (read = { canonical, aliases })
  }
  const canonicalOf = (id: string): string => kept().canonical.get(id) ?? id
  return {
    canonicalOf,
    everyIdOf: (id) => {
      const mine = canonicalOf(id)
      return [mine, ...(kept().aliases.get(mine) ?? [])]
    },
    anyFiled: () => kept().canonical.size > 0,
  }
}
