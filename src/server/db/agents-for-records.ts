// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `agentsForRecords` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { readInPieces } from './in-pieces.ts'
import { asAgent } from './read-participant.ts'
import { everyAgentsRuntime } from './list-participants.ts'
import type { RegisteredAgent } from './types/participants.ts'

/**
 * THE REGISTRY ROWS OF MANY AGENT RECORDS, in one read: what `agentForRecord` answers for each, keyed by the record's id.
 * A record nothing has mapped is absent from the map. The roster asks this once for every active agent, where it asked
 * `agentForRecord` once per agent (wave 13r round 11: Home's readiness waited on that).
 */
export function agentsForRecords(recordIds: readonly string[]): Map<string, RegisteredAgent> {
  const out = new Map<string, RegisteredAgent>()
  // IN PIECES (src/server/db/in-pieces.ts): the roster asks about every active agent's record, and nothing caps how many.
  // Every row of one record is in the piece that names it, so the first row of each record is the one it was before.
  const rows = readInPieces(
    recordIds,
    (piece) =>
      sqlite
        .prepare(
          `SELECT m.record_id AS mapped_record_id, a.* FROM agent_records m JOIN agents a ON a.id = m.agent_id ` +
            `WHERE m.record_id IN (${piece.map(() => '?').join(',')})`,
        )
        .all(...piece) as Record<string, unknown>[],
  )
  // EVERY RUNTIME IN ONE READ FOR EVERY 500 AGENTS (wave 13y round 50), where `asAgent` read one agent's at a time: the
  // office scene asks this for the owner of every run, and an office with more agents read more statements.
  const runtimes = everyAgentsRuntime([...new Set(rows.map((row) => String(row['id'])))])
  for (const row of rows) {
    const recordId = String(row['mapped_record_id'])
    if (!out.has(recordId)) out.set(recordId, asAgent(row, runtimes))
  }
  return out
}
