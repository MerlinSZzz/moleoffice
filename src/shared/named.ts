// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `named` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { PanelRecord, RecordKind } from '@shared/types.ts'

/** One record named in a `blocked_by` report, in the three fields a reader needs to choose. */
export function named(record: PanelRecord): { id: string; kind: RecordKind; title: string } {
  return { id: record.id, kind: record.kind, title: record.title }
}
