// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `incompletenessOf` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { Incompleteness } from '../server/lib/validate.ts'
import { recordIncompleteness } from '@shared/kinds.ts'
import type { PanelRecord } from '@shared/types.ts'

/**
 * What a stored record is still missing, computed from the specs. Never throws.
 *
 * The server's one way in to the read-side answer, so that every route gives the same one.
 * It is a thin wrapper over `recordIncompleteness` in @shared/kinds/incompleteness.ts on purpose: that function
 * lives in shared/ because the browser computes the same badge from the same specs without asking
 * the server, and it may not import anything from here. `recordIncompleteness` is what also reads
 * the envelope, so a decision with no `summary` is incomplete on the page and in the reply alike.
 *
 * Safe on every row in the table, including records written before the gate existed and rows
 * whose `data` is not an object at all — those come back with one entry saying so rather than
 * throwing and taking a whole page down.
 */
export function incompletenessOf(record: Pick<PanelRecord, 'kind' | 'data' | 'summary'>): Incompleteness[] {
  return recordIncompleteness(record.kind, record.data, record.summary)
}
