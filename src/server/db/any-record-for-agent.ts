// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `anyRecordForAgent` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * `theFirstRecordForAgentStatement` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { keptStatement } from './kept-statement.ts'

/**
 * THE FIRST-FILED LIVE `agent` RECORD FOR ONE REGISTRY ROW, in any project, or null.
 *
 * `recordForAgentIn` asks about ONE project, because which page a reader is sent to depends on
 * where they are standing. This is the other question: the press writes the grant onto the agent's
 * record, and a person pressing it in one project must not be told the secretary cannot be elevated
 * because its record was filed in another. The route says which project it wrote in.
 *
 * THE OLDEST, NOT THE NEWEST. Any caller may file an agent record under a live handle in another
 * project, and `keepTheAgentRegistryInStep` maps it to that same agent. When this read the newest
 * record, that new record became the one a secretary's broadcast times were read from, and the
 * times the agent held were dropped with nothing said. The record filed first is the one the
 * registry was bound to first, so a record filed later cannot take its place. When it is deleted,
 * the next one filed is read, and the delete says which. Wave 13p round 29.
 *
 * ONE ROAD IS NOT CLOSED BY THIS. A record of another kind filed before the agent's first record,
 * and changed into an agent under its handle later, is older, so it is read from then on. Nothing
 * stores when a record was mapped, so this cannot tell that case apart.
 *
 * A RECORD WHOSE KIND WAS CHANGED AWAY FROM `agent` KEEPS ITS MAPPING, and it is not read here. Its
 * data is written with no agent guard while it is another kind, so reading it would let any writer
 * set what the agent's record says. The broadcast schedule is read through this too. Wave 13p round 27c.
 *
 * `asIfLive` names one deleted record to count as live, so a restore can ask whether the record it would
 * bring back is the one read afterwards, by this one ordering and no copy of it.
 * `asIfDeleted` names one record to leave out, so a delete asks which live agent record would remain.
 */
export function anyRecordForAgent(agentId: string, asIfLive?: string, asIfDeleted?: string): { record: string; workspaceId: string } | null {
  const row = theFirstRecordForAgentStatement().get(agentId, asIfLive ?? null, asIfDeleted ?? null, asIfDeleted ?? null) as
    | { id?: unknown; ws?: unknown }
    | undefined
  if (row === undefined || typeof row.id !== 'string') return null
  return { record: row.id, workspaceId: typeof row.ws === 'string' ? row.ws : '' }
}
/**
 * CROSS JOIN, SO THE WALK STARTS FROM THE AGENT, and kept, because the broadcast schedules are brought into step by
 * asking this once for each agent. MEASURED on the made-up office of 22 October (wave 13s round 144, item 39): with a
 * plain JOIN and no statistics to read, SQLite started from `records` by `records_kind_idx`, walked every agent record
 * and looked each one up in `agent_records`, 0.21 ms a call and 1,460 calls in one start. CROSS JOIN keeps the order as
 * written: the agent's own rows by `agent_records_agent_idx`, then each record by its id. The rows that pass are the
 * same, so the order changes only what is walked, as in `theRecordForAgentStatement` in lib/participants.ts. Held by
 * tests/an-agents-first-record-is-found-from-the-agent.test.ts.
 */
export const theFirstRecordForAgentStatement = keptStatement(() =>
  sqlite.prepare(
    'SELECT r.id AS id, r.workspace_id AS ws FROM agent_records m CROSS JOIN records r ON r.id = m.record_id ' +
      "WHERE m.agent_id = ? AND (r.deleted_at IS NULL OR r.id = ?) AND r.kind = 'agent' " +
      'AND (? IS NULL OR r.id != ?) ORDER BY r.created_at ASC, r.rowid ASC LIMIT 1',
  ),
)
