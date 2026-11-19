// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `titleNamesMoreThanOne` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { PanelRecord } from '@shared/types.ts'

/**
 * The refusal when a typed title names more than one record: one sentence, every candidate id in it.
 *
 * ONE COPY FOR THREE CALLERS — `getRecordByTitle`, `liveRecordByTitle` and `resolveSessionRef`.
 * They refuse in three different ways (a thrown 409, a thrown 409 with the link request spelled
 * out, and a `SessionRef` that resolved to nothing), and if each wrote its own sentence the three
 * would teach the reader three different rules.
 *
 * EVERY CANDIDATE IS NAMED BY ID, and by kind, by when it was filed and by whether it has been
 * deleted. The titles are identical — that is the whole problem — so the title tells the reader
 * nothing about which is which and everything else has to.
 *
 * `nameOneById` is the caller's own last sentence: what to send INSTEAD. A refusal that does not
 * say what to do next leaves the caller with nothing but a second guess.
 */
export function titleNamesMoreThanOne(
  title: string,
  workspaceId: string,
  matches: readonly PanelRecord[],
  nameOneById: string,
): string {
  const each = matches.map((record) => {
    const deleted = record.deletedAt === null ? '' : `, deleted on ${record.deletedAt}`
    return `a ${record.kind} (${record.id}), filed ${record.createdAt}${deleted}`
  })
  return (
    `${matches.length} records in the workspace "${workspaceId}" are called "${title}". A title says what a ` +
    `record is called and an id says which record it is, so Mole Office will not choose one of them for you. ` +
    `They are: ${each.join('; ')}. ${nameOneById}`
  )
}
