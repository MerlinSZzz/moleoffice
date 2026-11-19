// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `recordForAgentIn` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theRecordForAgentStatement` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `RECORD_FOR_AGENT` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'

/**
 * THE AGENT RECORD ONE REGISTRY ROW IS JOINED TO IN ONE PROJECT, or null because none is.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT TAKES A PROJECT
 * ---------------------------------------------------------------------------------------
 *
 * A registry row is the installation's and an `agent` record belongs to one project, so one agent
 * may have a record in several. Criterion M36 sends a reader from a conversation to "that
 * participant's record page", and which page that is depends on which project they are looking at —
 * so the project is asked for rather than guessed.
 *
 * NEWEST WHERE THERE ARE SEVERAL, and there is one in the ordinary case. A project holding two
 * records for one agent has them because the same handle was filed twice, and the later one is what
 * a reader has been working with. Returning null there would be refusing to answer a question that
 * has an answer.
 */
export function recordForAgentIn(agentId: string, workspaceId: string): string | null {
  const row = theRecordForAgentStatement().get(agentId, workspaceId) as { id?: unknown } | undefined
  return row === undefined || typeof row.id !== 'string' ? null : row.id
}
export function theRecordForAgentStatement(): { get: (...args: unknown[]) => unknown } {
  const kept = RECORD_FOR_AGENT.get(sqlite)
  if (kept !== undefined) return kept
  const made = sqlite.prepare(
    'SELECT r.id AS id FROM agent_records m CROSS JOIN records r ON r.id = m.record_id ' +
      'WHERE m.agent_id = ? AND r.workspace_id = ? AND r.deleted_at IS NULL ' +
      'ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1',
  )
  RECORD_FOR_AGENT.set(sqlite, made)
  return made
}
/**
 * ONE PREPARED STATEMENT PER DATABASE HANDLE, NOT ONE PER AGENT. Same pattern as
 * `theAgentByHandleStatement` above.
 *
 * MEASURED, 11 September 2026 (problem 9UeL9VeVPn33): `GET /api/participants` calls this once per
 * agent in the registry — 76 of them on this corpus — and each call re-prepared this join from its
 * SQL text rather than keeping the statement it had already parsed. The bind parameters still
 * differ every call, so the query still runs once per agent; only the parsing is shared now.
 *
 * CROSS JOIN, SO THE WALK STARTS FROM THE AGENT. MEASURED, 18 October 2026 (problem xiv1cwqWTmhb):
 * with a plain JOIN and no statistics to read, SQLite started from `records` by
 * `records_live_idx` and walked every live record of the project, looking each one up in
 * `agent_records`. At 20,005 live records that was 9 to 10 ms a call, and one agent's profile calls
 * this six times. CROSS JOIN keeps the order as written: the agent's own rows by
 * `agent_records_agent_idx`, then each record by its id, 0.01 ms for the same answer. The rows
 * that pass are the same, so the order changes only what is walked. Held by
 * tests/an-agents-record-is-looked-up-from-the-agent-and-not-the-project.test.ts.
 */
export const RECORD_FOR_AGENT = new WeakMap<object, { get: (...args: unknown[]) => unknown }>()
