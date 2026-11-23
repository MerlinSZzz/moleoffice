// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `recordsForAgentsIn` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theNewestOfEach` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theRecordsForAgentsStatements` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `RECORDS_FOR_AGENTS` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import type { ReadAll } from './types/participants.ts'

/**
 * EVERY AGENT'S OWN RECORD IN ONE PROJECT, IN ONE QUERY (acceptance finding 26, 22 September 2026).
 *
 * `recordForAgentIn` above answers for one agent, and `GET /api/participants` called it once per
 * registered agent. Measured that day: 388 agents, 2.46 seconds for the one request, and a CPU
 * profile of the office under ten working agents put 54% of its whole time inside that walk. The
 * office serves on one thread, so while it walks, nobody else is answered.
 *
 * The rule is the same one `recordForAgentIn` uses: the agent's newest record in this project that
 * is not deleted. Here the rows come back oldest first and each agent's entry is overwritten, so
 * the newest wins, which is what `ORDER BY created_at DESC, rowid DESC LIMIT 1` gives per agent.
 *
 * `only` KEEPS IT TO THESE AGENTS (wave 13y round 51), for a plugin view asked for a list of them: the same rows of
 * those agents, in the same order. Both reads start from `agent_records` (`CROSS JOIN` keeps SQLite to that order), so
 * the read for a list finds its agents by the mapping's index and the whole read is the same plan with nothing kept out.
 */
export function recordsForAgentsIn(workspaceId: string, only?: readonly string[]): Map<string, string> {
  const statements = theRecordsForAgentsStatements()
  return theNewestOfEach(only === undefined ? statements.every.all(workspaceId) : statements.these.all(workspaceId, JSON.stringify(only)))
}
/** Each agent's record from rows that come oldest first, so the newest overwrites the rest. */
export function theNewestOfEach(rows: readonly unknown[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const row of rows as { agent?: unknown; id?: unknown }[]) {
    if (typeof row.agent === 'string' && typeof row.id === 'string') out.set(row.agent, row.id)
  }
  return out
}
export function theRecordsForAgentsStatements(): { every: ReadAll; these: ReadAll; holding: ReadAll } {
  const kept = RECORDS_FOR_AGENTS.get(sqlite)
  if (kept !== undefined) return kept
  const read = (these: string) =>
    sqlite.prepare(
      'SELECT m.agent_id AS agent, r.id AS id FROM agent_records m CROSS JOIN records r ON r.id = m.record_id ' +
        `WHERE r.workspace_id = ? AND r.deleted_at IS NULL${these} ` +
        'ORDER BY r.created_at ASC, r.rowid ASC',
    ) as unknown as ReadAll
  const made = {
    every: read(''),
    these: read(' AND m.agent_id IN (SELECT value FROM json_each(?))'),
    holding: read(' AND m.agent_id IN (SELECT agent_id FROM agent_records WHERE record_id IN (SELECT value FROM json_each(?)))'),
  }
  RECORDS_FOR_AGENTS.set(sqlite, made)
  return made
}
/** ONE SET OF PREPARED STATEMENTS PER DATABASE HANDLE, as `theRecordForAgentStatement` above. */
export const RECORDS_FOR_AGENTS = new WeakMap<object, { every: ReadAll; these: ReadAll; holding: ReadAll }>()
