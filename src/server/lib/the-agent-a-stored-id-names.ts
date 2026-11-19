// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theAgentAStoredIdNames` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { theAgentWithThisId, type AgentIdentity } from './agent-references.ts'

/**
 * WHICH AGENT A STORED REFERENCE NAMES: the one its current or permanently aliased registry id owns, never a handle.
 * Null means neither a current id nor a permanent alias owns it.
 *
 * Criterion I2's first sentence. Every column and JSON field that holds an agent reference holds the
 * string that was that agent's id when the row was written. A handle is a name people choose, it can
 * be changed, and after a retirement it can belong to somebody else — so following a stored string
 * to an agent by its handle would answer with an agent that never wrote the row.
 *
 * A RETIRED AGENT ANSWERS HERE. Its id is still its id, and the row it wrote is still its row.
 */
export function theAgentAStoredIdNames(storedId: string): AgentIdentity | null {
  return theAgentWithThisId(sqlite, storedId)
}
