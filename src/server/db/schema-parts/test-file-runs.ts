// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'
import { toolUses } from './tool-uses.ts'

const existingArchive = { existingArchive: true } as const


/**
 * ONE TEST FILE'S RESULT IN ONE USE, migration 0279.
 * Authored: a named test run observed this result, and nothing can recreate that observation.
 * The use owns the run and the time; neither is copied here. Tree commit and change repeat on each
 * file of a use because a table was chosen, not a column on tool_uses. Its project follows the use.
 */
export const testFileRuns = aPartTable(sqliteTable(
  'test_file_runs',
  {
    /** anOfficeId(), so one file result can be cited. */
    id: text('id').primaryKey(),
    /** The run's project, the same value its use row gets; this is not a person-level table. */
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
    /** The use whose run and time locate this observation. */
    useId: text('use_id').notNull().references(() => toolUses.id),
    /** The test file's path relative to the checkout in which the tests ran. */
    file: text('file').notNull(),
    /** The file's reported result, or no result when the report gave no usable status. */
    result: text('result').notNull(),
    /** Seconds reported for the file, or NULL when no time was reported. */
    seconds: real('seconds'),
    /** The test file's hash, or NULL when it could not be read or changed during the tests. */
    testFileHash: text('test_file_hash'),
    /** The checkout's commit, or NULL when it was not known. Repeated for every file of this use. */
    treeCommit: text('tree_commit'),
    /** The checkout's change hash, the word for no change, or NULL when unknown. Repeated for this use. */
    treeChange: text('tree_change'),
  },
  (t) => [uniqueIndex('test_file_runs_use_file_idx').on(t.useId, t.file)],
), existingArchive)
