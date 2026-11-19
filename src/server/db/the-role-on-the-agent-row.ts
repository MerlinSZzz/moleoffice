// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theRoleOnTheAgentRow` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theRoleOnTheRow` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { theParticipantByIdStatements } from './read-participant.ts'

/**
 * THE ROLE CARD AN AGENT'S ROW NAMES, read without building the participant (wave 13y round 44).
 *
 * `theCardOf` in lib/run-models.ts asked `readParticipant` for one agent and used only its role, and
 * building the whole participant ran `runtimeOfTheAgentRecord` as a second statement for every card
 * read. The row comes from the same kept statement `readParticipant` reads it with, through the same
 * `theRoleOnTheRow` reader `asAgent` uses, so the role is still worked out in one place. `found`
 * separates a row that names no role from no row at all, which `theCardOfAgent` needs.
 */
export function theRoleOnTheAgentRow(agentId: string): { found: boolean; role: string | null } {
  const row = theParticipantByIdStatements().agents.get(agentId) as Record<string, unknown> | undefined
  if (row === undefined) return { found: false, role: null }
  return { found: true, role: theRoleOnTheRow(row) }
}
/** The word on a registry row's `role` column, or null because the row names none. One reader for the participant and
 * for the two card readers that ask only for the role (wave 13y round 44). */
export function theRoleOnTheRow(row: Record<string, unknown>): string | null {
  return row['role'] === null || row['role'] === undefined ? null : String(row['role'])
}
