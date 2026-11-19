// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `everyNameInTheRegistries` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theRegistryNameStatements` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `REGISTRY_NAMES` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'

/**
 * THE ID, NAME AND HANDLE OF EVERYBODY IN BOTH REGISTRIES, in the order `listParticipants` gives.
 *
 * The chat's two reads need only these three columns. `listParticipants` builds each agent whole,
 * and that reads the agent's record again for its runtime and more, so it costs about three
 * statements per agent. On an office of 913 agents that was 2,700 statements for one conversation
 * (round 33 of wave 13n). This reads the same rows in the same order, and only the three columns.
 */
export function everyNameInTheRegistries(): {
  people: { id: string; name: string; handle: string }[]
  agents: { id: string; name: string; handle: string }[]
} {
  const statements = theRegistryNameStatements()
  const asNames = (row: Record<string, unknown>) => ({ id: String(row['id']), name: String(row['name']), handle: String(row['handle']) })
  return {
    people: (statements.people.all() as Record<string, unknown>[]).map(asNames),
    agents: (statements.agents.all() as Record<string, unknown>[]).map(asNames),
  }
}
export function theRegistryNameStatements(): { people: { all: () => unknown[] }; agents: { all: () => unknown[] } } {
  const kept = REGISTRY_NAMES.get(sqlite)
  if (kept !== undefined) return kept
  const made = {
    people: sqlite.prepare('SELECT id, name, handle FROM people ORDER BY handle'),
    agents: sqlite.prepare('SELECT id, name, handle FROM agents ORDER BY handle'),
  }
  REGISTRY_NAMES.set(sqlite, made)
  return made
}
export const REGISTRY_NAMES = new WeakMap<object, { people: { all: () => unknown[] }; agents: { all: () => unknown[] } }>()
