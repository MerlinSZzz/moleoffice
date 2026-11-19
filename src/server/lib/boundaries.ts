// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A BOUNDARY KNOWS TO ASK ABOUT RESTRICTIONS.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING POLLS AND NOTHING COUNTS ON A TIMER
 * ---------------------------------------------------------------------------------------
 *
 * The owner: *"Do not annoy users with daily: you have 12 Placeholders. Prefer reminders at
 * meaningful semantic boundaries"* — completing a task or a pipeline, a final review, a decision
 * commit, promoting a result to final evidence, entering an affected work domain.
 *
 * So there is no scanner, no scheduler and no daily job, and NOTHING ON ANY PAGE AT REST SAYS HOW
 * MANY PLACEHOLDERS EXIST. A boundary is an act that already writes something. The route that
 * performs the act calls `boundaryReply` after the write succeeds and puts the answer in its reply.
 *
 * THE ROUTE IS NOT THE BOUNDARY, and two of the six prove it: `task.complete` and `result.promote`
 * are the same route and the same operation, and what separates them is the TRANSITION. That is why
 * `BOUNDARY_ACTS` carries the transition in words and why the test drives transitions.
 *
 * ---------------------------------------------------------------------------------------
 * IT REFUSES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * The act succeeds. Mole Office does not refuse to complete a pipeline because a placeholder is active;
 * deciding that would be Mole Office judging the work. What it does is say so, once, at the moment of
 * the act.
 *
 * AND "SAY SO" MEANS IN THE REPLY, TODAY. Nothing in the browser draws this line yet — that is
 * round ten wave 8's step 10, which was not built. An agent gets the whole object as structure in
 * the reply it was already reading; a person gets nothing until somebody draws it.
 *
 * A LINE WHOSE NUMBERS ARE ALL ZERO IS NOT DRAWN, so `boundaryReply` returns null there and the key
 * is absent from the reply. A reminder that fires every time is a daily count wearing a boundary's
 * clothes.
 *
 * `harmless` IS COUNTED SEPARATELY AND NEVER ADDED IN. Two harmless placeholders must not make a
 * line read *5 active placeholders* beside *1 prevents final validation*: a reader who learns the
 * number is mostly noise stops reading the number.
 */
import { BOUNDARY_ACTS, type BoundaryAct } from '../../shared/restriction.ts'
import { restrictionsInScope, type RestrictionReading, type ScopeCounts } from './restrictions.ts'

export interface BoundaryRestrictions {
  /** Which of the six fired. Two boundaries share a route, so a reply without this cannot say. */
  boundary: string
  scope: { id: string; kind: string; title: string }
  counts: ScopeCounts
  found: RestrictionReading[]
  skippedDeleted: number
  couldNotCheck: { what: string; because: string }[]
}

/** The act by name, or undefined. Exported so a caller cannot spell a boundary that is not one. */
export function boundaryAct(name: string): BoundaryAct | undefined {
  return BOUNDARY_ACTS.find((act) => act.name === name)
}

/**
 * Ask what is restricted in the scope of an act that has just happened.
 *
 * `null` when nothing is worth saying — no active restriction, nothing resolved-and-unchecked, and
 * nothing that stops a thing being final. The `harmless` count alone never makes a line.
 */
export function boundaryReply(
  name: string,
  scope: { id: string; kind: string; title: string; workspaceId: string },
): BoundaryRestrictions | null {
  const act = boundaryAct(name)
  if (act === undefined) {
    // A boundary nothing declares is a caller's mistake and not a quiet no. `BOUNDARY_ACTS` is the
    // one list, and a route naming something else would be a seventh boundary nobody registered.
    throw new Error(`"${name}" is not one of the boundary acts: ${BOUNDARY_ACTS.map((a) => a.name).join(', ')}`)
  }
  const reading = restrictionsInScope({ workspaceId: scope.workspaceId, scopeRecordId: scope.id })
  if (reading.counts.active === 0 && reading.counts.unchecked === 0 && reading.counts.stopsFinal === 0) {
    return null
  }
  return {
    boundary: act.name,
    scope: { id: scope.id, kind: scope.kind, title: scope.title },
    counts: reading.counts,
    found: reading.found,
    skippedDeleted: reading.skippedDeleted,
    couldNotCheck: reading.couldNotCheck,
  }
}

/**
 * The owner's own three lines, built from the counts and never from a second reading.
 *
 * NOTHING CALLS THIS YET. It is the sentence a browser would draw from `boundaryReply`, written
 * here so the words live beside the counts they are built from rather than being invented in a
 * component. When step 10 lands it calls this; until then it is exercised only by its own test.
 *
 * The owner's format, exactly:
 *
 *     Complete Pipeline
 *     3 active Placeholders
 *     1 prevents final performance validation
 *
 * and one more line when anything is resolved and not re-checked. The `harmless` count is not on
 * the line at all; it is inside the list the line opens.
 */
export function boundarySentence(reply: BoundaryRestrictions): string {
  const lines: string[] = []
  if (reply.counts.active > 0) {
    lines.push(
      `${reply.counts.active} active ${reply.counts.active === 1 ? 'restriction' : 'restrictions'} in ${reply.scope.title}`,
    )
  }
  if (reply.counts.stopsFinal > 0) {
    lines.push(
      `${reply.counts.stopsFinal} ${reply.counts.stopsFinal === 1 ? 'stops' : 'stop'} this being called final`,
    )
  }
  if (reply.counts.unchecked > 0) {
    lines.push(`${reply.counts.unchecked} resolved and not re-checked`)
  }
  if (reply.couldNotCheck.length > 0) {
    lines.push(`${reply.couldNotCheck.length} could not be checked`)
  }
  return lines.join(' · ')
}
