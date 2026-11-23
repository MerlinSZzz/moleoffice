// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `repositoryNamed` was moved byte for byte out of src/server/lib/repositories.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { toRepository } from './list-repositories.ts'
import type { Repository, RepoRow } from './types/repositories.ts'

/**
 * One repository by the name a person typed.
 *
 * `id` IS IDENTITY AND `name` IS PRESENTATION — the rule `records.title` already follows. Nothing
 * resolves a repository by its name except a person typing one, and the unique index means that
 * lookup can never be ambiguous.
 */
export function repositoryNamed(name: string, workspaceId: string): Repository | null {
  const row = sqlite
    .prepare(
      'SELECT id, workspace_id, name, note, root, created_at, updated_at, created_by FROM repositories ' +
        'WHERE workspace_id = ? AND name = ?',
    )
    .get(workspaceId, name) as RepoRow | undefined
  return row === undefined ? null : toRepository(row)
}
