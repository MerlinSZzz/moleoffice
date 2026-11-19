// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `everyAgentAStoredStampCouldName` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { everyAgentAReferenceCouldName, type AgentIdentity, type TheIdentityOf } from './agent-references.ts'

/**
 * EVERY AGENT ONE STORED STAMP COULD NAME, in the order criterion I2 puts them in.
 *
 * AN EXACT ID FIRST, AND IT SETTLES IT ALONE. An id is never reused, so a stamp that is some agent's
 * id names that agent and no other — even when a second agent bears the same string as its handle,
 * which is exactly what happens after piece I-2 frees a retired agent's name. That is what stops a
 * new agent inheriting the writes of the retired agent whose name it took.
 *
 * FAILING THAT, THE HANDLE, LIVE AND RETIRED BOTH. The writer may have retired since it wrote, and a
 * retired agent still owns what it wrote. Today at most one row bears a handle at all, so at most
 * one of these two is ever filled in; asking them apart is what makes this right on the day I-2
 * makes the index a live-rows-only one.
 *
 * TWO ANSWERS ARE A REAL ANSWER HERE, and the caller below fails closed on them rather than picking.
 */
export function everyAgentAStoredStampCouldName(stamp: string, identityOf?: TheIdentityOf): AgentIdentity[] {
  const said = stamp.trim()
  if (said === '') return []
  // A caller asking about many stamps in one reading hands in the agents' spellings read once, which answer the same.
  const could = identityOf?.reference === undefined ? everyAgentAReferenceCouldName(sqlite, said) : identityOf.reference(said)
  if (could.byId !== null) return [could.byId]
  const byHandle = new Map<string, AgentIdentity>()
  for (const one of [could.liveByHandle, ...could.everyRetiredByHandle]) {
    if (one !== null) byHandle.set(one.id, one)
  }
  return [...byHandle.values()]
}
