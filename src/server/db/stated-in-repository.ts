// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `statedInRepository` was moved byte for byte out of src/server/lib/implementation.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { MAP_COLUMNS, toStated } from './stated-for.ts'
import type { StatedRelationship, MapRow } from './types/implementation.ts'

/** Every live relationship somebody stated about one repository. */
export function statedInRepository(repositoryId: string, workspaceId: string): StatedRelationship[] {
  const rows = sqlite
    .prepare(
      `SELECT ${MAP_COLUMNS} FROM implementation_map WHERE workspace_id = ? AND repository_id = ? ` +
        'AND deleted_at IS NULL ORDER BY record_id, pattern',
    )
    .all(workspaceId, repositoryId) as MapRow[]
  return rows.map(toStated)
}
