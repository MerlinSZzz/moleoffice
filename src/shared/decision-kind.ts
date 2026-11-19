// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `DECISION_KIND` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { RecordKind } from '@shared/types.ts'

/** The kind a proposal is settled by, and the one kind only the human may write. */
export const DECISION_KIND: RecordKind = 'decision'
