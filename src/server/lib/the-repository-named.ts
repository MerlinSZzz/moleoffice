// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theRepositoryNamed` was moved byte for byte out of src/server/lib/merge-queue.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'
import type { Repository } from './repositories.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { repositoryById } from '../db/repository-by-id.ts'
import { repositoryNamed } from '../db/repository-named.ts'

/** The repository a caller named, by id or by name, in this project. */
export function theRepositoryNamed(named: string, workspaceId: string): Repository {
  const found = repositoryById(named, workspaceId) ?? repositoryNamed(named, workspaceId)
  if (found !== null) return found
  const known = listRepositories(workspaceId).map((one) => `${one.name} (${one.id})`)
  throw new PanelError(
    `This project has no repository called or numbered "${named}", so nothing can say where the changes would land. ` +
      (known.length === 0 ? 'It has registered no repository at all.' : `It has: ${known.join(', ')}.`) +
      ' Nothing was written.',
    400,
    'Register one with POST /api/implementation/repositories, naming its root, and submit again.',
  )
}
