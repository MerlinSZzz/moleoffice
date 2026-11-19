// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theCardOfAgent` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { theCardTheRoleIs } from '@shared/the-card-the-role-is.ts'
import { theRoleOnTheAgentRow } from './the-role-on-the-agent-row.ts'

/**
 * THE CARD ONE AGENT HOLDS, by its registry id, or null because no agent row has that id.
 *
 * It is the role on the agent's row, and the worker's card where the row names none, because
 * `A_ROW_WITH_NO_ROLE_READS_AS` says such a row reads as a worker. The id is a registry id, never a
 * handle: a stored or arriving reference is resolved first, by its own reader.
 *
 * IT READS ONLY THE ROLE, through `theRoleOnTheAgentRow` (wave 13y round 44), so it does not build
 * the whole participant and does not run the record's runtime statement.
 */
export function theCardOfAgent(agentId: string): string | null {
  const held = theRoleOnTheAgentRow(agentId)
  return held.found ? theCardTheRoleIs(held.role) : null
}
