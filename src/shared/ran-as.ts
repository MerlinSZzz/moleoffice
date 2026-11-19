// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH AGENT A RUN SAYS IT WORKED AS IN ONE PROJECT.
 * `ranAsIn` was moved byte for byte out of src/server/lib/attachments.ts, with no change of behaviour.
 * That file re-exports it.
 */

import type { PanelRecord } from '@shared/types.ts'

/**
 * WHICH DURABLE AGENT A RUN SAYS IT WORKED AS IN ONE PROJECT, or null when it has never said.
 *
 * `data.ranAs` is a list of `{workspaceId, agentId}` with at most one entry per project. The same
 * shape `src/server/db/agent-identity.ts` writes and `src/server/lib/workdomain.ts` reads. It is
 * read here rather than copied into a second key on the attachment, because *which agent this run
 * worked as* is one fact and it already has a home.
 */
export function ranAsIn(record: Pick<PanelRecord, 'data'>, workspaceId: string): string | null {
  const ranAs = record.data['ranAs']
  if (!Array.isArray(ranAs)) return null
  for (const entry of ranAs) {
    if (typeof entry !== 'object' || entry === null) continue
    const one = entry as Record<string, unknown>
    if (one['workspaceId'] !== workspaceId) continue
    const agentId = one['agentId']
    if (typeof agentId === 'string' && agentId !== '') return agentId
  }
  return null
}
