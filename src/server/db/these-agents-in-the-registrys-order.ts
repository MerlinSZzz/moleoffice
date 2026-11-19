// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theseAgentsInTheRegistrysOrder` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { asAgent } from './read-participant.ts'
import { everyAgentsRuntime, theRegistryListStatements } from './list-participants.ts'
import type { RegisteredAgent } from '../lib/participants.ts'

/**
 * THE AGENTS WITH THESE IDS, built as `listParticipants` builds them and in its order (wave 13y round 51): what that
 * list holds of these ids, without reading every agent. A plugin view asked for a list of agents reads this. An id no
 * agent has is absent.
 */
export function theseAgentsInTheRegistrysOrder(ids: readonly string[]): RegisteredAgent[] {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return []
  const runtimes = everyAgentsRuntime(wanted)
  return (theRegistryListStatements().these.all(JSON.stringify(wanted)) as Record<string, unknown>[]).map((row) => asAgent(row, runtimes))
}
