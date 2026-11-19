// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `holdsTheSecretaryCard` was moved byte for byte out of src/server/lib/merge-queue.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { ParticipantRef } from '@shared/participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theRoleCards } from './roles.ts'

/**
 * WHETHER A REGISTERED AGENT HOLDS THE SECRETARY CARD AND IS NOT RETIRED. `me` is a registry id that
 * `participantForActor` already resolved, so the row is read by exact id. The one reading of the card for
 * the merge queue: the confirm door (`maySpeakForTheSecretary`) and the secretary's entry both ask it.
 */
export function holdsTheSecretaryCard(me: ParticipantRef): boolean {
  if (me.kind !== 'agent') return false
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  const row = readParticipant({ kind: 'agent', id: me.id })
  if (row === null || !('retired' in row)) return false
  return card !== null && card !== undefined && row.role === card && row.retired !== true
}
