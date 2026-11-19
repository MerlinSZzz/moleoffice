// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH DOOR IS WRITING ONE OF THE FIELDS ON A RUN THAT ONLY ITS OWN DOOR WRITES, RIGHT NOW.
 *
 * FIVE GROUPS OF FIELDS, guarded in lib/records.ts:
 *   - THE SETTLEMENTS ON `theCheck` (problem 5Sxsr68-_m8m). `theCheck.superseded` is written by `supersedeARun`
 *     (POST /api/checks/<run>/superseded) and `theCheck.landedByHand` by `recordAHandLanding` (POST
 *     /api/checks/<run>/landed-by-hand),
 *     all in lib/inspection.ts, and by nothing else.
 *   - THE TOP-LEVEL SETTLEMENTS `closedUnchecked`, written by `closeARunUnchecked` through
 *     POST /api/checks/<run>/closed-unchecked, and `superseded`, written by `supersedeARun` on a run that holds no
 *     check (problem FuHKnNDBzrXW). Neither needs a recorded check request.
 *   - THE RUN'S THREE VERDICTS (problem SeAFAnQ145mV). `released` is written by the check door (POST /api/checks/<run>);
 *     `refused` by the check door, and by the office when the worker finishes again after a refusal; `confirmed` by the
 *     confirm door (POST /api/checks/<run>/confirm). All in lib/inspection.ts. The queue's verdict, the superseded
 *     door's proofs, the confirm, the landed-by-hand door and the run's standing all read these fields as the check's
 *     own word, and the standing is also worked out in the browser, which cannot read the change log. So the fields
 *     are guarded where they are written rather than checked by each reader.
 *
 *   - THE OFFICE'S RUN ENDINGS (problem l3vULTAJYUNT). `needsNoCheck` is written when the office files
 *     a secretary's design/-only run; `endedWithItsMergeEntry` when a refused check again bounces its entry.
 *   - WHAT THE REMINDER BEFORE THE SEAL DID (wave 13j round 54). `remindedBeforeTheSeal` is written by the office when
 *     the reminder fires and at the seal, in lib/before-the-seal.ts.
 *   - THE RUN'S METHOD MARK (wave 13s, part 6 of the design-first build). `methodWork` is written once by the mark door
 *     (POST /api/runs/<run>/method-work, lib/design-reminders.ts). Only that mark makes a run method work, and the
 *     reminder of a reviewed design and its count read it, so nothing else may set, change or drop it.
 *
 * Each guard refuses a write that sets, changes or drops its field unless this says the field's own door is the writer.
 * It is the draft send door's pattern (lib/draft-door.ts): the database is written synchronously, so nothing else can
 * write between setting the mark and clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/inspection.ts, which sets it, imports
 * lib/records.ts.
 */

/** The settlements on a run's `theCheck`, each written only by its own door. */
export const SETTLEMENTS_ON_THE_CHECK = ['superseded', 'landedByHand'] as const
export type ASettlementOnTheCheck = (typeof SETTLEMENTS_ON_THE_CHECK)[number]

/** The three verdicts on a run's own data, each written only by its own door. */
export const VERDICTS_ON_A_RUN = ['released', 'refused', 'confirmed'] as const
export type AVerdictOnARun = (typeof VERDICTS_ON_A_RUN)[number]

/** These settlements also close runs for which no check request was recorded. */
export const SETTLEMENTS_ON_A_RUN = ['closedUnchecked', 'superseded'] as const
/** The top-level fields on a run that only their own doors write. */
export const TOP_LEVEL_RUN_FIELDS_OF_THE_DOORS = [...VERDICTS_ON_A_RUN, ...SETTLEMENTS_ON_A_RUN, 'methodWork'] as const

/** A field on a run that only its own door writes. */
export type AFieldOnlyItsDoorWrites = ASettlementOnTheCheck | (typeof TOP_LEVEL_RUN_FIELDS_OF_THE_DOORS)[number] | 'needsNoCheck' | 'endedWithItsMergeEntry' | 'remindedBeforeTheSeal'

/** Each field's own door, for the refusal to name. */
export const THE_DOOR_OF: Readonly<Record<AFieldOnlyItsDoorWrites, string>> = {
  superseded: 'POST /api/checks/<run>/superseded',
  landedByHand: 'POST /api/checks/<run>/landed-by-hand',
  closedUnchecked: 'POST /api/checks/<run>/closed-unchecked',
  released: 'the check door, POST /api/checks/<run>,',
  refused: 'the check door, POST /api/checks/<run>, and the office when the worker finishes again after a refusal,',
  needsNoCheck: "when it files a run for a secretary's design/-only merge entry",
  endedWithItsMergeEntry: "on a merge entry's check-again run when that check refuses and the entry bounces",
  confirmed: 'the confirm door, POST /api/checks/<run>/confirm,',
  remindedBeforeTheSeal: 'when the reminder before the seal fires, and at the seal',
  methodWork: 'POST /api/runs/<run>/method-work',
}

let writing: AFieldOnlyItsDoorWrites | null = null

/** True only while the door that owns `field` is inside its own write. */
export function theDoorOfThisFieldIsWriting(field: AFieldOnlyItsDoorWrites): boolean {
  return writing === field
}

/** Run one write as the door that owns `field`. The mark is cleared whether the write succeeds or throws. */
export function asTheDoorOf<T>(field: AFieldOnlyItsDoorWrites, write: () => T): T {
  const before = writing
  writing = field
  try {
    return write()
  } finally {
    writing = before
  }
}
