// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theCallersAgentRow` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { readParticipant } from '../../db/read-participant.ts'
import { participantForActor } from '../participant-for-actor.ts'
import type { RegisteredAgent } from '../participants.ts'
import type { Actor } from '../records.ts'

/**
 * THE REGISTRY ROW OF THE AGENT MAKING THIS REQUEST, or null because it is not a registered agent.
 *
 * The actor header is an arriving reference and may carry the agent's id or its handle, so it goes
 * through `participantForActor`, the one resolver (criterion I2). What that answers is a registry
 * id, and the row is read by that id. Asking `agentByHandle(actor.id)` instead found nobody when an
 * agent with a minted id sent its id.
 *
 * Exported because src/server/lib/records/territory.ts reads it too.
 */
export function theCallersAgentRow(actor: Actor): RegisteredAgent | null {
  if (actor.type !== 'agent') return null
  const me = participantForActor(actor)
  if (me === null || me.kind !== 'agent') return null
  return readParticipant(me) as RegisteredAgent | null
}
