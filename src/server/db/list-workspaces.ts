// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `listWorkspaces` was moved byte for byte out of src/server/lib/workspaces.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { db } from './client.ts'
import { workspaces } from './schema.ts'
import { isAProjectOnAList, type Workspace } from '@shared/workspaces.ts'
import { toWorkspace } from './get-workspace.ts'

/**
 * Every project this installation holds, oldest first, so the default reads first.
 *
 * THE MESSAGE CENTRE IS NOT ONE. It is a row in the registry, so a message's `workspace_id` names
 * something real, but it is where messages are kept and not a project: a person does not open it, and a loop over every
 * project reading a project's messages reads each project's view of it (`messagesInTheViewOf`), so reading the message
 * centre as one more project would meet every message a second time. `getWorkspace` still finds it.
 */
export function listWorkspaces(): Workspace[] {
  return db
    .select()
    .from(workspaces)
    .orderBy(workspaces.createdAt, workspaces.id)
    .all()
    .map(toWorkspace)
    .filter((one) => isAProjectOnAList(one.id))
}
