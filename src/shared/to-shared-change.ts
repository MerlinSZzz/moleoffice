// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `toSharedChange` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { changes } from '../server/db/schema.ts'
import type { RecordOrigin, ActorType, Change, ChangeOp } from '@shared/types.ts'

/**
 * Widen a change row into the shared `Change` type.
 *
 * The same widening `toChange` in lib/http.ts does, and for the same reason: SQLite has no enum
 * column, so `op` and `actorType` come back as plain strings and are narrowed on the way in. It is
 * written here rather than imported because http.ts imports this file, and a cycle between the two
 * is a worse trade than one cast that no behaviour depends on.
 */
export function toSharedChange(row: typeof changes.$inferSelect, origin: RecordOrigin | null = null): Change {
  // THE DEFAULT IS NULL AND THE CALLER HAS TO MEAN IT. This widener feeds two paths that could not
  // be more different. The attention rule reads up to a hundred thousand rows to date a state word
  // and shows none of them to anybody, so looking up each row's provenance would be a join over the
  // whole log for a field nothing on that path reads — it passes nothing, deliberately.
  //
  // `readingSinceAnchor` is the other, and it caught me: its rows ARE shown, in the first panel on
  // Home, and it went through here taking the default. So a change row on "Since you last looked"
  // said `origin: null` about a record filed a second earlier and stamped `authored` — the mark
  // reaching the row and being wrong, which is worse than not reaching it. Found by driving the
  // anchor cycle end to end on 2026-08-12, not by a test and not by reading.
  return { ...row, op: row.op as ChangeOp, actorType: row.actorType as ActorType, origin }
}
