// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whoWroteRecord` was moved byte for byte out of src/server/lib/revisions.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { whoWroteRecords } from './who-wrote-records.ts'

/** The same question about one record. Null means nobody recorded who wrote it. */
export function whoWroteRecord(recordId: string): string | null {
  return whoWroteRecords([recordId]).get(recordId) ?? null
}
