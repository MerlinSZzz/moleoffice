// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `listRepositories` was moved byte for byte out of src/server/lib/repositories.ts, with no change of behaviour.
 * `toRepository` was moved byte for byte out of src/server/lib/repositories.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import type { Repository, RepoRow } from './types/repositories.ts'

/** Every repository in one workspace, in name order. */
export function listRepositories(workspaceId: string): Repository[] {
  const rows = sqlite
    .prepare(
      'SELECT id, workspace_id, name, note, root, created_at, updated_at, created_by FROM repositories ' +
        'WHERE workspace_id = ? ORDER BY name',
    )
    .all(workspaceId) as RepoRow[]
  return rows.map(toRepository)
}
export function toRepository(row: RepoRow): Repository {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    note: row.note,
    root: row.root,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  }
}
