// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/implementation.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

import type { Authority, Provenance, Relation } from '@shared/implementation.ts'

/** One row of `implementation_map`, as every reader gets it. */
export interface StatedRelationship {
  id: string
  workspaceId: string
  recordId: string
  repositoryId: string
  pattern: string
  relation: Relation
  provenance: Provenance
  note: string | null
  revisionId: string | null
  statedAt: string
  statedBy: string
  acceptedAt: string | null
  acceptedBy: string | null
  /** Set when somebody removed it. A soft delete, the way `records` does it. */
  deletedAt: string | null
  /** Computed from the three above it. NEVER a column — see @shared/implementation.ts. */
  authority: Authority
}

export interface MapRow {
  id: string
  workspace_id: string
  record_id: string
  repository_id: string
  pattern: string
  relation: string
  provenance: string
  note: string | null
  revision_id: string | null
  stated_at: string
  stated_by: string
  accepted_at: string | null
  accepted_by: string | null
  deleted_at: string | null
}
