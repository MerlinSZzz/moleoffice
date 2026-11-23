// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theAgentRecordsOf` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theAgentRecordStatements` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `AGENT_RECORDS` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import type { ReadAll } from './types/participants.ts'

/** This agent's own records by the same rule: those of kind `agent`, deleted ones and every project's too. */
export function theAgentRecordsOf(agentId: string): string[] {
  return (theAgentRecordStatements().recordsOf.all(agentId) as { record: string }[]).map((row) => row.record)
}
export function theAgentRecordStatements(): { agentsOf: ReadAll; recordsOf: ReadAll } {
  const kept = AGENT_RECORDS.get(sqlite)
  if (kept !== undefined) return kept
  // THE KIND IS ASKED WITH `+` BEFORE IT, so SQLite finds each row by the mapping and the record's id, and only then
  // looks at the kind (as `theKindOfARowFoundById` in src/server/lib/messages.ts does).
  const read = (these: string) =>
    sqlite.prepare(
      'SELECT m.record_id AS record, m.agent_id AS agent FROM agent_records m CROSS JOIN records r ON r.id = m.record_id ' +
        `WHERE ${these} AND +r.kind = 'agent'`,
    ) as unknown as ReadAll
  const made = {
    agentsOf: read('m.record_id IN (SELECT value FROM json_each(?))'),
    recordsOf: read('m.agent_id = ?'),
  }
  AGENT_RECORDS.set(sqlite, made)
  return made
}
/** ONE PAIR OF PREPARED STATEMENTS PER DATABASE HANDLE, as `theRecordForAgentStatement` above. Both read the same rows. */
export const AGENT_RECORDS = new WeakMap<object, { agentsOf: ReadAll; recordsOf: ReadAll }>()
