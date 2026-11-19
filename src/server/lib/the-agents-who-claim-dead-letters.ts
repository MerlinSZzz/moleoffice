// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theAgentsWhoClaimDeadLetters` was moved byte for byte out of src/server/lib/deadletters.ts, with no change of behaviour.
 * `DEAD_LETTER_CLAIM_ACT` was moved byte for byte out of src/server/lib/deadletters.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { ParticipantRef } from '@shared/participants.ts'
import { actsRefusedTo, everyActNamed } from '@shared/roles.ts'
import { listParticipants } from '../db/list-participants.ts'
import { theRoleCards } from './roles.ts'
import { named } from './named-timers.ts'

/**
 * Every agent whose card does not refuse the dead-letter act, not retired. Any of them may claim an
 * addressee's letters (the person's words: each claims its own), and the person names one of them to
 * take the sweep's line (lib/dead-letter-secretary.ts asks this same function).
 *
 * WHO A SECRETARY IS COMES FROM THE DECLARATION AND NOT FROM A ROLE NAME WRITTEN HERE. The act is
 * declared once, on the secretary's step, and `actsRefusedTo` answers which roles it is refused to;
 * this keeps the agents whose role it is not. A row with no role reads as a worker and is refused
 * it, and a word no card holds is refused every act. If the declaration stops naming the act, NO
 * agent holds it rather than every agent, because an act nobody declares grants nobody anything.
 */
export function theAgentsWhoClaimDeadLetters(): ParticipantRef[] {
  const cards = theRoleCards()
  const named = everyActNamed(cards).has(DEAD_LETTER_CLAIM_ACT)
  return listParticipants()
    .agents.filter((one) => named && !one.retired && !actsRefusedTo(cards, one.role).has(DEAD_LETTER_CLAIM_ACT))
    .map((one) => ({ kind: 'agent', id: one.id }))
}
/**
 * THE ACT THE DECLARATION DECIDES, NAMED ONCE. `dead-letters.claim` is under `The dead letters` in
 * design/permissions/roles.json, a power only the secretary's step of the tree holds. Nothing here
 * writes the role's own name: an agent holds the act when its card does not refuse it.
 */
export const DEAD_LETTER_CLAIM_ACT = 'dead-letters.claim'
