// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `isAPermanentResident` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'

/**
 * WHETHER THIS AGENT IS A PERMANENT RESIDENT: its row carries the moment the owner confirmed it (migration
 * a_permanent_resident_has_a_space_of_its_own). Here and not in lib/residents.ts because the address rule above asks
 * it, and lib/residents.ts imports this file. A registry id is asked, never a handle.
 */
export function isAPermanentResident(agentId: string): boolean {
  const row = sqlite.prepare('SELECT resident_since FROM agents WHERE id = ?').get(agentId) as { resident_since: string | null } | undefined
  return row !== undefined && row.resident_since !== null
}
