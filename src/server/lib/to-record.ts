// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `toRecord` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { records } from '../db/schema.ts'
import { readOrigin, type PanelRecord } from '@shared/types.ts'
import { contentOf } from './version.ts'

/**
 * One stored row as every reader gets it. THE ONE MAPPING — every route answers through this.
 *
 * `origin` IS CARRIED, and it was not for one wave. `PanelRecord` declared the field and this
 * function did not fill it, so `records.origin` existed on disk, held 290 `fixture` stamps, and was
 * absent from every single API reply. Nothing failed: the field is optional on the type, so no
 * compiler saw it, and the screens that had learnt to draw provenance drew "not served" for a
 * corpus that was fully stamped. That is the recurring defect exactly — two places that must agree
 * about what a record is, with nothing making them agree. `tests/vocab-provenance.test.ts` now
 * fails if a served record loses the field again.
 *
 * `readOrigin` rather than a cast, because the column is text and a hand-edited row can hold a word
 * that is not one of the two. An unreadable stamp reads as null — nobody has said — and never as
 * `authored`, which is the one direction this field must never guess in.
 */
export const toRecord = (r: typeof records.$inferSelect): PanelRecord => ({
  id: r.id,
  workspaceId: r.workspaceId,
  ownerId: r.ownerId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  origin: readOrigin(r.origin),
  // THE FIVE THINGS A WRITE CAN CHANGE, normalised in the one place that says what an absent `data`
  // means. `versionOf` hashes exactly these five and the revision ledger stores exactly these five,
  // so the served record, the version served with it and the revision written beside it are all
  // about the same object. Spelling `data: r.data ?? {}` out again here is how they come apart.
  ...contentOf(r),
})
