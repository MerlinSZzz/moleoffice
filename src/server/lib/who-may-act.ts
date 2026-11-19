// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A WHO-MAY-ACT GATE LETS THROUGH AT OFF. Wave 13r rounds R, S, T, U, V and Y.
 *
 * Gates of the who-may-act group stand at doors that let only some callers through. Round R put five there: the pause of
 * the office's work, the page words and the sidebar, the naming of the dead-letter secretary, the module reminder
 * secretary, and the merge and check switches. Round S put six at the settings doors: the Casting table, the GPU
 * watcher, the owner's settings (what is kept, the goal spans, the price table, the entry, the models runs get and the
 * plugin switches), the switch for urgent messages, the list of quick inputs and the address for browsers. Round T put
 * four at the doors that act on another agent: ending its raise early, retiring it, saying whether it reads a release
 * from the check, and setting how it is addressed. Round U put seven at doors on records, drawings and lists: naming
 * a module's planner, closing an ask on the person or taking the question off it, deleting a row of the implementation
 * map that a person stated, re-pointing a scanned repository, confirming a packaged task finished, arranging the module
 * graph and switching a reminder on another owner's checklist. Round V put two on the role cards: changing a card's
 * words with no warrant, and refusing a role request that another agent answers. Round Y put two on the merge queue:
 * submitting the work of a run outside the caller's own line, and withdrawing an entry the caller did not submit. At
 * off each of them lets one more caller through: an agent its own key proves, which is registered and not retired. The
 * gate counts that agent as one it would have stopped. Any other caller is refused as before, and is not counted.
 */
import { type RegisteredAgent } from './participants.ts'
import { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'
import { readParticipant } from '../db/read-participant.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

/**
 * The registry id of the agent this request's own key proves, or null. A key that proves an agent other than the one
 * the headers named proves nothing here, and nor does the key of a retired agent.
 */
export function anAgentItsOwnKeyProves(actor: Actor): string | null {
  if (actor.type !== 'agent' || actor.provedHolder !== undefined) return null
  const id = theAgentTheKeyProves(actor)
  if (id === null) return null
  const row = readParticipant({ kind: 'agent', id }) as RegisteredAgent | null
  return row !== null && row.retired !== true ? id : null
}

/**
 * The refusal of a caller no key proves to be an agent, while the gate is off. The door's own refusal says only certain
 * callers may, and at off that is not true, so this one says who may.
 */
export function refusedWhileTheGateIsOff(caller: string, gate: string, act: string): PanelError {
  return new PanelError(
    `While the gate "${gate}" is off, any agent proved by its own key may ${act}. This request was made as "${caller}", ` +
      'and no key on it proves a registered agent that is not retired. Nothing was changed.',
    403,
  )
}
