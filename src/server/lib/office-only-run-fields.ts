// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { isDeepStrictEqual } from 'node:util'
import { ENDED_WITH_ITS_MERGE_ENTRY, NEEDS_NO_CHECK } from '@shared/releasing.ts'
import { REMINDED_BEFORE_THE_SEAL } from '@shared/before-the-seal.ts'
import { THE_DOOR_OF, theDoorOfThisFieldIsWriting } from './check-field-doors.ts'
import { aFieldTheQueueWritesThatWouldMove, type AFieldTheQueueWrites } from './merge-queue-fields-the-office-writes.ts'

/** The refusal of `needsNoCheck` at the record door, on a create, on a patch and on a revision restore. */
export const ONLY_THE_OFFICE_WRITES_NEEDS_NO_CHECK =
  `The office writes needsNoCheck ${THE_DOOR_OF.needsNoCheck}. Nothing was written.`

/** The refusal of `endedWithItsMergeEntry` at the record door, on a create, on a patch and on a revision restore. */
export const ONLY_THE_OFFICE_WRITES_ENDED_WITH_ITS_MERGE_ENTRY =
  `The office writes endedWithItsMergeEntry ${THE_DOOR_OF.endedWithItsMergeEntry}. Nothing was written.`

/** The refusal of `remindedBeforeTheSeal` at the record door, on a create, on a patch and on a revision restore. */
export const ONLY_THE_OFFICE_WRITES_REMINDED_BEFORE_THE_SEAL =
  `The office writes remindedBeforeTheSeal ${THE_DOOR_OF.remindedBeforeTheSeal}. Nothing was written.`

/** A field only the office writes, which a whole `data` would add, change or drop. */
export interface AnOfficeOnlyFieldThatWouldMove {
  field: typeof NEEDS_NO_CHECK | typeof ENDED_WITH_ITS_MERGE_ENTRY | typeof REMINDED_BEFORE_THE_SEAL | AFieldTheQueueWrites
  /** What the whole `data` does to it: puts it on, gives it another value, or takes it off. */
  move: 'added' | 'changed' | 'dropped'
  /** The refusal's text, from its constant. It names the field. */
  refusal: string
}

/**
 * WHETHER A WHOLE `data` WOULD MOVE A FIELD ONLY THE OFFICE WRITES, asked of `stored`, the data the
 * record holds now, and `whole`, the data about to replace it. It answers the first such field, or
 * null when both hold the same value of each, including when both leave it out.
 *
 * Every record write asks after its data has been worked out. Revision restores also ask before
 * changing kind. The field's office door may write it while its internal mark is held.
 * An unchanged value may be carried through a whole-data replacement.
 */
export function anOfficeOnlyFieldAWholeDataWouldMove(stored: Record<string, unknown>, whole: Record<string, unknown>): AnOfficeOnlyFieldThatWouldMove | null {
  // THE TWO FIELDS THE OFFICE WRITES AT THE SEAL (wave 13u rounds 93, 94 and 96), asked in their own file.
  const theQueues = aFieldTheQueueWritesThatWouldMove(stored, whole)
  if (theQueues !== null) return theQueues
  const fields = [
    { field: NEEDS_NO_CHECK, refusal: ONLY_THE_OFFICE_WRITES_NEEDS_NO_CHECK },
    { field: ENDED_WITH_ITS_MERGE_ENTRY, refusal: ONLY_THE_OFFICE_WRITES_ENDED_WITH_ITS_MERGE_ENTRY },
    { field: REMINDED_BEFORE_THE_SEAL, refusal: ONLY_THE_OFFICE_WRITES_REMINDED_BEFORE_THE_SEAL },
  ] as const
  for (const { field, refusal } of fields) {
    if (theDoorOfThisFieldIsWriting(field)) continue
    const now = stored[field]
    const then = whole[field]
    if (isDeepStrictEqual(then, now)) continue
    return { field, refusal, move: now === undefined ? 'added' : then === undefined ? 'dropped' : 'changed' }
  }
  return null
}
