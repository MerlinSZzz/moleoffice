// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theKeyProvesASecretary` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import type { Actor } from './records.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'
import type { RegisteredAgent } from './participants.ts'

/**
 * WHETHER THIS REQUEST'S OWN KEY PROVES AN AGENT THAT HOLDS THE SECRETARY CARD AND IS NOT RETIRED. A header
 * that names a secretary proves nothing, so a keyless claim is not a secretary here.
 */
export function theKeyProvesASecretary(actor: Actor): boolean {
  if (actor.type !== 'agent' || actor.provedHolder !== undefined) return false
  const id = theAgentTheKeyProves(actor)
  if (id === null) return false
  const card = theRoleCardsAreRead() ? theRoleCards().elevation.onlyThisCardCanHoldIt : null
  const row = readParticipant({ kind: 'agent', id }) as RegisteredAgent | null
  return card !== null && card !== undefined && row !== null && row.role === card && row.retired !== true
}
