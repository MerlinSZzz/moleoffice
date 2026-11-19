// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE WORKER'S ENTRY IN A RUN'S `workerRuns`, FOUND BY THE WORKER'S CANONICAL ID.
 *
 * The map's keys are registry ids, and a key stored before an alias was filed may be the old spelling.
 * The stored key is history and is never renamed. An entry is found by the canonical id and the finite
 * list of its filed aliases, so the old key and the new id find the same entry. Two stored keys that
 * reach one canonical id are refused, because either answer would hide the other entry.
 *
 * With no aliases filed, the canonical id is the id asked about and these behave exactly as an
 * exact-key lookup does.
 */
import type Database from 'better-sqlite3'
import { theWorkerRunOn, WORKER_RUNS, type TheWorkerRun } from '@shared/worker-runs.ts'
import { AGENT_REGISTRY_NAMESPACE, RegistryAliasError, registryAliasesOf, registryAliasTarget } from './index.ts'

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The canonical registry id for an id, which is the id itself when it is not an alias. */
export function theCanonicalAgentId(db: Database.Database, agentId: string): string {
  return registryAliasTarget(db, { namespace: AGENT_REGISTRY_NAMESPACE, id: agentId }) ?? agentId
}

function twoKeys(keys: readonly string[], canonical: string): never {
  throw new RegistryAliasError(
    `the stored worker-run keys ${keys.map((key) => JSON.stringify(key)).join(' and ')} both name agent ${canonical}, so neither entry can be chosen; nothing was read or written`,
  )
}

/** The one stored key of `all` that names this agent, or null when none does. */
export function theStoredWorkerRunKey(db: Database.Database, all: Record<string, unknown>, agentId: string): string | null {
  const canonical = theCanonicalAgentId(db, agentId)
  const spellings = new Set([canonical, ...registryAliasesOf(db, canonical)])
  const held = Object.keys(all).filter((key) => spellings.has(key))
  if (held.length > 1) twoKeys(held, canonical)
  return held[0] ?? null
}

/** The key a write of this agent's entry goes under: the stored one when there is one, else the canonical id. */
export function theWorkerRunKeyToWrite(db: Database.Database, all: Record<string, unknown>, agentId: string): string {
  return theStoredWorkerRunKey(db, all, agentId) ?? theCanonicalAgentId(db, agentId)
}

/** The entry a run's data keeps for one worker, found by its canonical id, or null when it keeps none that reads. */
export function theWorkerRunOf(db: Database.Database, data: Record<string, unknown>, agentId: string): TheWorkerRun | null {
  const all = data[WORKER_RUNS]
  if (!isPlain(all)) return null
  const key = theStoredWorkerRunKey(db, all, agentId)
  return key === null ? null : theWorkerRunOn(data, key)
}

/** How many other workers' entries wait to start, compared by canonical id. */
export function theOtherWorkerRunsWanted(db: Database.Database, data: Record<string, unknown>, agentId: string): number {
  const all = isPlain(data[WORKER_RUNS]) ? data[WORKER_RUNS] : {}
  const mine = theCanonicalAgentId(db, agentId)
  const seen = new Map<string, string>()
  let waiting = 0
  for (const key of Object.keys(all)) {
    const canonical = theCanonicalAgentId(db, key)
    const other = seen.get(canonical)
    if (other !== undefined) twoKeys([other, key], canonical)
    seen.set(canonical, key)
    if (canonical !== mine && theWorkerRunOn(data, key)?.state === 'wanted') waiting += 1
  }
  return waiting
}
