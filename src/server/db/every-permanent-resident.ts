// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `everyPermanentResident` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'

/**
 * EVERY PERMANENT RESIDENT'S REGISTRY ID, in one statement: the agents `isAPermanentResident` answers true for. The
 * people view asks it once for every agent (wave 13y round 50), where it asked `isAPermanentResident` once per agent.
 */
export function everyPermanentResident(): ReadonlySet<string> {
  const rows = sqlite.prepare('SELECT id FROM agents WHERE resident_since IS NOT NULL').all() as { id: string }[]
  return new Set(rows.map((row) => row.id))
}
