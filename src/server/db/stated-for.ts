// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `statedFor` was moved byte for byte out of src/server/lib/implementation.ts, with no change of behaviour.
 * `MAP_COLUMNS` was moved byte for byte out of src/server/lib/implementation.ts, with no change of behaviour.
 * `toStated` was moved byte for byte out of src/server/lib/implementation.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import type { StatedRelationship, MapRow } from './types/implementation.ts'
import { authorityOf, type Provenance, type Relation } from '@shared/implementation.ts'

/** Every live relationship somebody stated about one record. */
export function statedFor(recordId: string, workspaceId: string): StatedRelationship[] {
  const rows = sqlite
    .prepare(
      `SELECT ${MAP_COLUMNS} FROM implementation_map WHERE workspace_id = ? AND record_id = ? ` +
        'AND deleted_at IS NULL ORDER BY repository_id, pattern',
    )
    .all(workspaceId, recordId) as MapRow[]
  return rows.map(toStated)
}
export const MAP_COLUMNS =
  'id, workspace_id, record_id, repository_id, pattern, relation, provenance, note, revision_id, ' +
  'stated_at, stated_by, accepted_at, accepted_by, deleted_at'
/**
 * One stored row as every reader gets it. THE ONE MAPPING — every read here answers through it.
 *
 * `relation` and `provenance` are widened from TEXT the way `records.ts` widens `kind`: the value
 * was written from the closed lists in @shared/implementation.ts, which is the only place either
 * comes from, and the write path refuses anything else.
 */
export function toStated(row: MapRow): StatedRelationship {
  const provenance = row.provenance as Provenance
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    recordId: row.record_id,
    repositoryId: row.repository_id,
    pattern: row.pattern,
    relation: row.relation as Relation,
    provenance,
    note: row.note,
    revisionId: row.revision_id,
    statedAt: row.stated_at,
    statedBy: row.stated_by,
    acceptedAt: row.accepted_at,
    acceptedBy: row.accepted_by,
    deletedAt: row.deleted_at,
    authority: authorityOf(provenance, row.accepted_at, row.accepted_by),
  }
}
