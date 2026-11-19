// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theAgentsOfTheseAgentRecords` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { theAgentRecordStatements } from './the-agent-records-of.ts'

/**
 * THE AGENT EACH OF THESE RECORDS IS, keyed by the record's id (wave 13y round 90). The rule of who may read which
 * message reads a stored agent string that is no agent's id or handle as the agent whose own agent record it is: as a
 * sender, in a delivery row, in a sweep's summary and in a group's membership (`thePartiesOfMany` in
 * src/server/lib/messages.ts).
 *
 * ONLY A RECORD WHOSE KIND IS STILL `agent` COUNTS. A record's kind can be changed after it was filed, and the mapping
 * stays, so a record that is a note now is no agent's here. A DELETED RECORD COUNTS, and a record in any project: a
 * message written under an older record of the agent's is still its own. The pages name a sender by the newest live
 * record in the page's project alone (`recordsForAgentsIn`), so they may not name an agent this reads.
 *
 * A record nothing has mapped is absent from the map.
 */
export function theAgentsOfTheseAgentRecords(recordIds: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  if (recordIds.length === 0) return out
  for (const row of theAgentRecordStatements().agentsOf.all(JSON.stringify(recordIds)) as { record: string; agent: string }[]) {
    out.set(row.record, row.agent)
  }
  return out
}
