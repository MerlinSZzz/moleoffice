// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH WORLD A RECORD IS IN: something that happened, or something intended.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS ONE FUNCTION AND NOTHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * A planned thing must never read as something that happened. There are nine mechanisms holding
 * that up and every one of them needs the same question answered — *is this intended?* — so the
 * question is answered in one function, from the record's KIND, and nowhere else.
 *
 * IT IS DERIVED, NEVER STORED AND NEVER A QUERY PARAMETER. A stored `world` column would be a
 * second truth beside the kind, and the day they disagreed a plan would be drawn as a past. A
 * `?world=` parameter would let a caller ask for the wrong one and be given it.
 *
 * ---------------------------------------------------------------------------------------
 * WHO ASKS THIS TODAY, COUNTED FROM THE CODE
 * ---------------------------------------------------------------------------------------
 *
 * ONE THING ASKS IT: the plan canvas, through `familyOfEdge` in
 * `src/web/components/graph/PlanGraph.tsx`, which hands both ends of every line to `linkFamilyOf`
 * so that a relation between two intentions is not drawn in the language of things that happened.
 *
 * NO REPLY CARRIES A `world` KEY. This file used to state as fact that *every reply that describes
 * a SHAPE carries `world: worldOf(subject.kind)`*, and no reply ever has: `grep -rn "world:"
 * src/server/api/` finds none. It also named four readers — the intent line family, the two-lane
 * drawing, the plan read and the divergence read — of which the first is now real and the other
 * three are not built. Both sentences were true of a design and false of the tree, in the file a
 * reader checks first to find out what is true. They are replaced by the count above, which is
 * meant to be re-derived rather than believed: `grep -rn worldOf src/`.
 *
 * **A HISTORY REPLY CARRIES NO `world` AT ALL, and its absence is the design.** A trajectory is an
 * ordinary record whose past is served by the ordinary history route, so a literal `world: 'actual'`
 * there would answer `{subject: {kind: 'trajectory'}, world: 'actual'}` — two fields, one fact,
 * disagreeing on the wire by design. A history is always made of stamps that happened: the plan
 * really did change that day. So the field is not corrected on that route; it is not on it.
 */

import type { RecordKind } from './types.ts'

/** Something that happened, or something intended. There is no third. */
export type World = 'actual' | 'intended'

/**
 * The kinds that are intentions. Written out here so that a kind joining them is one edit in one
 * file, and so a reader can see the whole of the intended world at once — it is three words long.
 *
 * `goal` JOINED THEM ON 16 SEPTEMBER 2026. A goal has not
 * happened: it is what work is FOR, and the `serves` link is already drawn in the intent family for
 * that reason (src/web/components/graph/lines.ts). The header above says this list is the whole of
 * the intended world, and a goal is not a past, so it belongs in the list.
 */
export const INTENDED_KINDS = ['trajectory', 'planned_state', 'goal'] as const satisfies readonly RecordKind[]

/**
 * THE ONE STATEMENT OF WHETHER A THING HAS HAPPENED.
 *
 * Whatever asks whether a record is an intention asks this, and nothing works it out for itself.
 * Today that is the plan canvas and nothing else — see the header for the count and how to check
 * it. If this function is wrong, a plan is drawn as a past.
 *
 * WHAT CATCHES THAT IS A WRITTEN-OUT LIST, NOT A WALK. The plan asked for a walk over every kind,
 * and `tests/a-future-is-never-a-past.test.ts` has one — but `isIntended` is DEFINED as
 * `worldOf(kind) === 'intended'` and `INTENDED_KINDS.includes` is the whole body of `worldOf`, so
 * the walk passes for any implementation that reads the list. What actually fails when the list is
 * wrong is the line in that test asserting `INTENDED_KINDS` is exactly `trajectory` and
 * `planned_state`, and the two literals under it. This file used to claim the opposite.
 */
export function worldOf(kind: RecordKind): World {
  return (INTENDED_KINDS as readonly string[]).includes(kind) ? 'intended' : 'actual'
}

/** True when this record's kind is an intention. The same one statement, said the short way. */
export function isIntended(kind: RecordKind): boolean {
  return worldOf(kind) === 'intended'
}
