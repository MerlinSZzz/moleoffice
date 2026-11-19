// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `requireWorkspace` was moved byte for byte out of src/server/lib/workspaces.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { DEFAULT_WORKSPACE, workspaceIdFault, type Workspace } from '@shared/workspaces.ts'
import { PanelError } from './panel-error.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'

/**
 * The workspace this request means, or a refusal naming every workspace that exists.
 *
 * THE ONE GATE. Every route resolves its workspace through this, so there is exactly one place
 * where an unknown project id can be turned into a write, and it does not turn it into one.
 *
 * `stated` says whether the caller named it or took the default, and it changes the refusal
 * rather than the answer: a caller that sent a header it got wrong is told what the header may
 * say, and a caller that sent none is told that the default workspace is itself missing, which
 * means a database that has never been migrated.
 */
export function requireWorkspace(id: string, stated: boolean): Workspace {
  const fault = workspaceIdFault(id)
  if (fault !== null) throw new PanelError(`${fault} (x-mole-office-workspace: "${id}")`)
  const found = getWorkspace(id)
  if (found !== null) return found

  const existing = listWorkspaces()
  if (!stated) {
    throw new PanelError(
      `This request named no workspace, so it is answered from "${DEFAULT_WORKSPACE}" — and this database has ` +
        `no workspace called that. ${existing.length === 0 ? 'It has none at all' : `It has ${existing.map((w) => w.id).join(', ')}`}. ` +
        `A database that has been migrated always has the default workspace: run \`npm run db:migrate\`. Until ` +
        `then every request has to name one it does have with x-mole-office-workspace.`,
      500,
    )
  }
  throw new PanelError(
    `There is no workspace called "${id}". This installation holds ` +
      `${existing.length === 0 ? 'none at all' : existing.map((w) => `${w.id} ("${w.title}")`).join(', ')}. ` +
      `A workspace is a project boundary and it is refused rather than created on the spot: a misspelt id ` +
      `would file this write into a project nobody has, and nothing spelling it correctly would ever find it ` +
      `again. GET /api/workspaces lists them; POST /api/workspaces establishes a new one.`,
    404,
  )
}
