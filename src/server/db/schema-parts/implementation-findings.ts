// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingDerived = { existingDerived: true } as const

export const implementationFindings = aPartTable(sqliteTable(
  'implementation_findings',
  {
    /** anOfficeId() in src/server/lib/ids.ts. Stable only until the next rebuild. */
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    recordId: text('record_id').notNull(),
    repositoryId: text('repository_id').notNull(),
    /** An exact file path, never a pattern. */
    path: text('path').notNull(),
    relation: text('relation').notNull(),
    /** `structure`, `manifest`, `imports`, `build_graph`, `launch_config` or `analysis`. */
    provenance: text('provenance').notNull(),
    /** The file the resolver read. */
    evidencePath: text('evidence_path').notNull(),
    /** What it read there: the import specifier, a manifest key, a launch-file stanza. */
    evidenceDetail: text('evidence_detail').notNull(),
    /** The build that produced this row; it matches `source_index.built_at`. */
    builtAt: text('built_at').notNull(),
  },
  (t) => [
    index('implementation_findings_record_idx').on(t.workspaceId, t.recordId),
    index('implementation_findings_path_idx').on(t.workspaceId, t.repositoryId, t.path),
  ],
), existingDerived)
