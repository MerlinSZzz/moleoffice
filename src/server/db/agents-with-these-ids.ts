// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `agentsWithTheseIds` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { readInPieces } from './in-pieces.ts'
import { everyAgentsRuntime } from './list-participants.ts'
import { asAgent } from './read-participant.ts'
import type { RegisteredAgent } from './types/participants.ts'

/**
 * THE REGISTRY ROWS OF THESE AGENT IDS, in two reads for any number: what `readParticipant` answers for each, keyed by the
 * id. An id no agent has is absent. A read of messages asks it for its senders (lib/messages.ts), where it asked
 * `readParticipant` once per sender (wave 13x round 13).
 */
export function agentsWithTheseIds(ids: readonly string[]): Map<string, RegisteredAgent> {
  const wanted = [...new Set(ids)]
  const out = new Map<string, RegisteredAgent>()
  if (wanted.length === 0) return out
  const runtimes = everyAgentsRuntime(wanted)
  // IN PIECES (src/server/db/in-pieces.ts): a read of messages asks about every sender in it, and nothing caps how many.
  // The rows go into a map by id, so the order of the pieces does not matter.
  const rows = readInPieces(
    wanted,
    (piece) => sqlite.prepare(`SELECT * FROM agents WHERE id IN (${piece.map(() => '?').join(',')})`).all(...piece) as Record<string, unknown>[],
  )
  for (const row of rows) out.set(String(row['id']), asAgent(row, runtimes))
  return out
}
