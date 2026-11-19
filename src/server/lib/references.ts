// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Reference } from '@shared/reference.ts'
import { getRecord } from './records.ts'

/**
 * TURN A RECORD ID INTO A REFERENCE — kind, id, title and what it means here. ONE LOOKUP, ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A LOOKUP AND NOT A FIELD
 * ---------------------------------------------------------------------------------------------
 *
 * The readings that say what they LEFT OUT carry ids rather than names, and that is measured rather
 * than lazy: `openLoopsFor` is held to 16,384 bytes and its buckets hold about six hundred records
 * on the owner's corpus, where an id each is about eight kilobytes and a title each is about
 * thirty-six. Carrying names in the reading made it drop every loop it had.
 *
 * A COPY NAMES AS MANY AS THE ROOM ALLOWS AND SAYS HOW MANY IT COULD NOT. So the name is looked up
 * at the point something prints one, which is a handful of records rather than six hundred, and
 * this is where that lookup lives so there is only one of it. Criterion B18 of
 * `design/bundle/ACCEPTANCE.md`; the shape itself is `src/shared/reference.ts`.
 *
 * ---------------------------------------------------------------------------------------------
 * A RECORD THAT IS GONE IS NAMED AS GONE
 * ---------------------------------------------------------------------------------------------
 *
 * Not dropped, and not printed as a bare id. The readings check that every candidate is either
 * carried or in exactly one left-out bucket, so a record deleted between the membership rule and
 * this line still has to be named; naming it by its id alone is the thing this criterion exists to
 * stop, and dropping it would make an arithmetic check pass on a shorter list.
 */
export function referenceTo(id: string, meansHere: string | null): Reference {
  const record = getRecord(id)
  return record === null
    ? { recordId: id, kind: null, title: `a record that is no longer here, id ${id}`, meansHere }
    : { recordId: record.id, kind: record.kind, title: record.title, meansHere }
}
