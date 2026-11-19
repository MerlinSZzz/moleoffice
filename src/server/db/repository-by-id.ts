// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `repositoryById` was moved byte for byte out of src/server/lib/repositories.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { toRepository } from './list-repositories.ts'
import type { Repository, RepoRow } from '../lib/repositories.ts'

/** One repository by id, inside one workspace, or null. */
export function repositoryById(id: string, workspaceId: string): Repository | null {
  const row = sqlite
    .prepare(
      'SELECT id, workspace_id, name, note, root, created_at, updated_at, created_by FROM repositories ' +
        'WHERE id = ? AND workspace_id = ?',
    )
    .get(id, workspaceId) as RepoRow | undefined
  return row === undefined ? null : toRepository(row)
}
