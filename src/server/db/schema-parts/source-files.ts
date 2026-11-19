// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingDerived = { existingDerived: true } as const

export const sourceFiles = aPartTable(sqliteTable(
  'source_files',
  {
    workspaceId: text('workspace_id').notNull().default('default'),
    /**
     * Which repository this file is in, from `repositories.id`.
     *
     * IN THE KEY BECAUSE TWO REPOSITORIES MAY BOTH HOLD `src/index.ts`. Before this column the key
     * was (workspace, path), so the second repository's file overwrote the first one's row and
     * nothing said so. Not a declared foreign key, for the reason the whole table is not: a rebuild
     * writes hundreds of rows in one transaction and must not have its cost depend on another
     * table.
     *
     * NULLABLE, AND NULL HAS ONE STATED MEANING: this row was written before repositories had ids,
     * by the one process that scans one root. `file_observations.repository_id` carries the same
     * word for the same reason. Nothing in the product can fill it yet — a repository is registered
     * by a person or an agent, and the rebuild that would name one is rewritten in the wave that
     * builds the map — so the honest value is "nobody has said" rather than an id nobody minted.
     * The rows that hold NULL are replaced wholesale by the first rebuild that can name a
     * repository, and until then they are what they always were: this machine's file list.
     *
     * WHAT NULL COSTS, SAID RATHER THAN DISCOVERED. SQLite does not enforce uniqueness across key
     * columns that are NULL, so while these rows carry NULL the key is not a constraint on them. It
     * cannot bite today: one server points at one checkout, and a rebuild deletes every row of the
     * workspace before it writes. It starts being a real constraint the moment real ids arrive.
     */
    repositoryId: text('repository_id'),
    /** Repository-relative path. */
    path: text('path').notNull(),
    /** One of SOURCE_FILE_EXTENSIONS' languages in lib/sourceindex.ts. */
    language: text('language').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    lines: integer('lines').notNull(),
    /** A JSON array of strings, read with comments stripped from the source. Plain text here. */
    imports: text('imports').notNull(),
    /** A JSON array of strings. Same. */
    exports: text('exports').notNull(),
    /** The file's mtime, LOCAL. */
    modifiedAt: text('modified_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.repositoryId, t.path] }),
  }),
), existingDerived)

export type SourceFileRow = typeof sourceFiles.$inferSelect
