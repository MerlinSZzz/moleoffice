// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theNamesWithThisIdOrHandle` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theNamesWithThisIdOrHandleStatements` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `NAMES_BY_ID_OR_HANDLE` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'

/**
 * THE ID, NAME AND HANDLE OF EVERY ROW OF EITHER REGISTRY WHOSE ID OR HANDLE IS `said`, in the order
 * `everyNameInTheRegistries` gives. Retired agents are among them, as they are there.
 *
 * A stored sender is matched by its id, or an agent by its handle (`theAgentAStoredSenderNames` in
 * src/shared/messages.ts), so these are the only rows that can answer one. A new message asks this
 * rather than for every name. On a made-up office of 972 agents that was 973 rows for every message
 * written (round 41 of wave 13u).
 */
export function theNamesWithThisIdOrHandle(said: string): {
  people: { id: string; name: string; handle: string }[]
  agents: { id: string; name: string; handle: string }[]
} {
  const statements = theNamesWithThisIdOrHandleStatements()
  const asNames = (row: Record<string, unknown>) => ({ id: String(row['id']), name: String(row['name']), handle: String(row['handle']) })
  return {
    people: (statements.people.all(said, said) as Record<string, unknown>[]).map(asNames),
    agents: (statements.agents.all(said, said) as Record<string, unknown>[]).map(asNames),
  }
}
export function theNamesWithThisIdOrHandleStatements(): { people: { all: (...said: string[]) => unknown[] }; agents: { all: (...said: string[]) => unknown[] } } {
  const kept = NAMES_BY_ID_OR_HANDLE.get(sqlite)
  if (kept !== undefined) return kept
  const made = {
    people: sqlite.prepare('SELECT id, name, handle FROM people WHERE id = ? OR handle = ? ORDER BY handle'),
    agents: sqlite.prepare('SELECT id, name, handle FROM agents WHERE id = ? OR handle = ? ORDER BY handle'),
  }
  NAMES_BY_ID_OR_HANDLE.set(sqlite, made)
  return made
}
export const NAMES_BY_ID_OR_HANDLE = new WeakMap<object, { people: { all: (...said: string[]) => unknown[] }; agents: { all: (...said: string[]) => unknown[] } }>()
