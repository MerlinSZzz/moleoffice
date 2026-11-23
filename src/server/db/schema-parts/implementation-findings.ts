// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingDerived = { existingDerived: true } as const

/**
 * WHAT A RESOLVER WORKED OUT ABOUT WHICH CODE SERVES WHICH RECORD.
 *
 * DERIVED. Every row was produced by a resolver and will be deleted by the next rebuild of its
 * repository, so nothing a person types may live here. An export must not carry it.
 *
 * `record_id` IS NOT A DECLARED FOREIGN KEY, and `source_file_hashes` is the precedent. A rebuild
 * writes hundreds of rows in one transaction; a foreign key on each would make a rebuild's cost
 * depend on the record table, and a finding about a record somebody deleted between the scan and
 * the write should be dropped by the next rebuild rather than fail the whole transaction.
 *
 * `path` IS AN EXACT FILE, NEVER A PATTERN. A resolver knows which file it read. Only a person
 * writes a pattern, because only a person is making a statement about code that does not exist yet.
 *
 * THE EVIDENCE IS TWO FACTS AND IS STORED AS TWO FACTS. `evidence_path` is the file the resolver
 * read; `evidence_detail` is what it read there. The sentence a developer sees — "HomePage.tsx
 * imports ./RecordPage.tsx" — is composed at read. One column holding that sentence would leave
 * nothing able to group findings by importing file or to answer which specifier produced one.
 *
 * NO INDEX ON `evidence_path` YET. The forward read that needs one — from a file back to the
 * records it serves — arrives with the resolver that uses it, and an index nothing reads still has
 * to be written on every rebuild.
 */
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
