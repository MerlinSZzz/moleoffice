// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `liveHere` was moved byte for byte out of src/server/lib/project-board.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { PanelRecord } from '@shared/types.ts'

/** Whether a record is live and in this project. */
export function liveHere(record: PanelRecord | undefined, project: string): record is PanelRecord {
  return record !== undefined && record.deletedAt === null && record.workspaceId === project
}
