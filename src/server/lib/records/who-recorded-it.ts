// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO WROTE A DECISION DOWN, IN A MODULE OF ITS OWN.
 *
 * The two functions were moved whole out of src/server/lib/records.ts with no change of behaviour:
 * the one spelling of the recorded writer, and the refusal of a caller that tries to type it.
 * records.ts hands the names on with `export *`, so no caller changed.
 *
 * This file imports records.ts only for the Actor type. DECISION_KIND and isJsonObject come from the
 * files that declare them, so nothing here is read through records.ts at run time.
 */
import { PanelError } from '../panel-error.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import type { Actor } from '../records.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'

// ================================================ WHO WROTE THE DECISION DOWN, AND WHO DECIDED IT
//
// The owner separated these two on 27 August 2026: *"distinguish MAKING a governance Decision from
// RECORDING a Decision the human already made"*. `decided_by` is the first and a caller states it.
// `recorded_by` is the second and a caller may not, because a caller that could type it could sign
// the person's name to its own choice and nothing on any page would show that it had happened.
//
// IT IS THE SAME ACTOR THE CHANGE ROW GETS, and that is deliberate rather than a second copy. The
// change log already records who wrote every row; this field exists to show it as well
// on the decision itself, where a reader of the decision can see it without opening a history. The
// two cannot drift, because they are written from one actor in one call and this field never
// changes afterwards — `tests/authority-on-a-decision.test.ts` checks the pair against each other.

/** How an actor is written into `recorded_by`. One spelling, so nothing has to parse two. */
export function whoRecordedIt(actor: Actor): string {
  return `${actor.type} ${actor.id}`
}

/**
 * A CALLER MAY NOT MOVE `recorded_by`, ON EITHER WRITE PATH.
 *
 * `stored` is what the record already holds, or null on a create — so on a create any value at all
 * is refused, and on a patch only a value that would CHANGE it is.
 *
 * WHY THE UNCHANGED VALUE IS LET THROUGH, WHICH IS NOT A HOLE. Two of this server's own routes hand
 * a whole stored body back to `patchRecord`: restoring a revision, and the kind change. Neither is a
 * caller typing the field; both are the record's own value going back where it came from. Refusing
 * them would break restoring a decision to an earlier revision, which the browser does, and it would
 * refuse it in words about signing somebody else's name — a refusal that is not about what happened.
 * A write that leaves the field exactly as it was has not moved it, which is the whole of what this
 * guard is protecting.
 */
export function assertNobodyTypesWhoRecordedIt(
  kind: string,
  data: unknown,
  recordId: string | null,
  stored?: unknown,
): void {
  if (kind !== DECISION_KIND) return
  if (!isJsonObject(data) || !Object.hasOwn(data, 'recorded_by')) return
  const sent = data['recorded_by']
  const already = isJsonObject(stored) ? stored['recorded_by'] : undefined
  if (already !== undefined && sent === already) return
  throw new PanelError(
    `\`recorded_by\` says who WROTE THIS DECISION DOWN, and Mole Office fills it in from the actor on the request. It ` +
      `is never accepted from a caller, because a caller that could type it could sign somebody else's name to its ` +
      `own choice. This request sent recorded_by: ${JSON.stringify(sent)}. Nothing was written` +
      `${recordId === null ? ' and no decision was created' : ` and decision ${recordId} is exactly as it was`}.\n\n` +
      `WHAT TO SEND INSTEAD. Take \`recorded_by\` out of the body and send the actor headers — ` +
      `x-mole-office-actor-type and x-mole-office-actor-id — which is where Mole Office reads it from. WHO DECIDED is a ` +
      `different question and it IS yours to state: that is \`decided_by\`, and it takes "the owner" or an agent's ` +
      `handle. The two are different on purpose: recording a decision somebody else made is not making one.`,
    403,
  )
}
