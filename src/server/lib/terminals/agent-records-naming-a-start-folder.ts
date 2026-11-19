// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH AGENT RECORDS NAME A START FOLDER, and the agent each one is. Wave 13s, round 205b.
 *
 * THE ONE READING OF IT. Two places ask: the session hook's reading of which live agents start in a folder
 * (agentsStartingIn, lib/participants.ts), and the open that refuses a folder another agent's record names
 * (anotherAgentWhoseRecordNames, lib/terminal-agents.ts). Each asked the same records with a query of its own before,
 * so a change to one could leave the other wrong with nothing failing.
 *
 * WHAT IS READ. Every record of kind `agent` that is not deleted, whose data is JSON and names a start folder. The match
 * is theSameStartFolder's (src/config/start-folder.mjs): the exact folder, after trailing slashes go, and no link is
 * followed. Records come in the order the database gives them.
 *
 * RETIRED AGENTS ARE THE CALLER'S CHOICE, said at every call. 'left out' skips a record whose agent is retired, because a
 * retired agent is not live; 'counted' keeps it, because a handle is free again once its agent is retired, and the
 * folder of that name is still the retired agent's.
 *
 * A RECORD NO REGISTRY ROW MAPS comes with the agent null, whichever is asked. The office cannot tell whose it is, so
 * the caller says what it means: the session hook leaves it out, and the open names it.
 *
 * Each agent is read only when the caller comes to its record, so a caller that stops at the first answer reads no more.
 */

import { theSameStartFolder } from '../../../config/start-folder.mjs'
import { sqlite } from '../../db/client.ts'
import { type RegisteredAgent } from '../participants.ts'
import { agentForRecord } from '../../db/agent-for-record.ts'

export function* theAgentRecordsNamingTheStartFolder(
  folder: string,
  asked: { retiredAgents: 'counted' | 'left out' },
): Generator<{ record: string; agent: RegisteredAgent | null }> {
  const rows = sqlite
    .prepare(
      "SELECT id, json_extract(data, '$.startFolder') AS folder FROM records " +
        "WHERE kind = 'agent' AND deleted_at IS NULL AND json_valid(data) " +
        "AND json_extract(data, '$.startFolder') IS NOT NULL",
    )
    .all() as { id: string; folder: unknown }[]
  for (const row of rows) {
    if (typeof row.folder !== 'string' || !theSameStartFolder(row.folder, folder)) continue
    const agent = agentForRecord(row.id)
    if (agent !== null && agent.retired === true && asked.retiredAgents === 'left out') continue
    yield { record: row.id, agent }
  }
}
