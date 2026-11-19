// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theAgentAStoredReferenceNamesIn` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `STORED_READERS` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { readRegistryAliases } from './registry-aliases/index.ts'
import type { RegisteredAgent } from './participants.ts'

/**
 * THE STORED READER, THE SAME ONE lib/agent-references.ts USES, over a registry list the caller already holds. A
 * `startedBy` was written earlier and is read back now, so its current or permanently aliased id settles it alone
 * because an id is never reused; failing that, the ONE agent bearing the string as a handle; and NO agent where more
 * than one bears it, so the reading stays readable rather than picking one of two silently.
 *
 * MADE ONCE PER LIST, because the participants list reads every row's chain from one list, and building the two
 * maps for each row was 53 of the roster's 110 ms on an office of 913 agents (wave 13y round 13). A list is
 * read-only to every caller, so a reader made from it stays right for as long as the list is held.
 */
export function theAgentAStoredReferenceNamesIn(everyAgent: readonly RegisteredAgent[]): (id: string) => RegisteredAgent | null {
  const kept = STORED_READERS.get(everyAgent)
  if (kept !== undefined) return kept
  const byId = new Map(everyAgent.map((one) => [one.id, one]))
  const aliases = new Map(readRegistryAliases(sqlite).map(row=>[row.aliasId,row.canonicalId]))
  const byHandle = new Map<string, RegisteredAgent[]>()
  for (const one of everyAgent) {
    const held = byHandle.get(one.handle)
    if (held === undefined) byHandle.set(one.handle, [one])
    else held.push(one)
  }
  const reader = (id: string): RegisteredAgent | null => {
    const alias = aliases.get(id)
    if (alias !== undefined) return byId.get(alias) ?? null
    const exact = byId.get(id)
    if (exact !== undefined) return exact
    const handles = byHandle.get(id)
    return handles !== undefined && handles.length === 1 ? handles[0]! : null
  }
  STORED_READERS.set(everyAgent, reader)
  return reader
}
/** The reader of each registry list, made once per list. */
export const STORED_READERS = new WeakMap<readonly RegisteredAgent[], (id: string) => RegisteredAgent | null>()
