// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theOwnRecordsOfTheAgentsHolding` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { theNewestOfEach, theRecordsForAgentsStatements } from './records-for-agents-in.ts'

/**
 * EACH AGENT THAT HOLDS ONE OF THESE RECORDS, WITH ITS OWN RECORD IN ONE PROJECT (wave 13y round 89).
 *
 * A message may store an agent's own record id as its sender. The browser names that agent by the record its list of
 * participants carries, which is `recordsForAgentsIn`'s answer for the page's project, so the server reads such a
 * message by the same rule. Only the agents that hold one of these records are read, in one statement, and each is
 * given its own record as `recordsForAgentsIn` gives it: the newest live one in the project. A message stored under an
 * older record of an agent is matched by no list, here as in the browser.
 */
export function theOwnRecordsOfTheAgentsHolding(workspaceId: string, recordIds: readonly string[]): Map<string, string> {
  if (recordIds.length === 0) return new Map()
  return theNewestOfEach(theRecordsForAgentsStatements().holding.all(workspaceId, JSON.stringify(recordIds)))
}
