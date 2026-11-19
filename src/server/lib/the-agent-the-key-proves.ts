// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theAgentTheKeyProves` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import type { Actor } from './records.ts'

/** The registry id of the agent this request's own key proves, or null when no agent key proved it. */
export function theAgentTheKeyProves(actor: Actor): string | null {
  return actor.provedBy === 'an-agent-key' && actor.keyHolder !== undefined
    ? (theOneAgentAStringNames(sqlite, actor.keyHolder)?.id ?? null)
    : null
}
