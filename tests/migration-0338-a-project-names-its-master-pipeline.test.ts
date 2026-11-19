// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0338 GIVES A PROJECT A PLACE TO NAME ITS MASTER PIPELINE, AND RE-WRITES NOTHING.
 *
 * OLD: no project could say which pipeline holds its architecture blocks, so a board had nothing to read its rows from
 * but a guess. NEW: `workspaces` has a `master_pipeline` column. NULL, on every project written before the migration,
 * means nobody has marked one. Wave 13u round 216, package BV.
 *
 *   1. the migration only adds: `master_pipeline` is the table's last column, text and nullable, every project written
 *      before it reads NULL, and the other columns are as they were.
 *
 * How the door reads NULL, as "unmarked", is proved in tests/a-project-names-its-master-pipeline.test.ts, case 1.
 *
 * WHAT IS REAL: a scratch office in the temporary folder, built from the real migrations up to just before 0338 and
 * then migrated with the product's own `migrateInPlace`. The project row is made up, and nothing reaches the live
 * office.
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp:
 *   1. in the migration, add DEFAULT '' to the column: case 1 goes red;
 *   2. in the migration, add an UPDATE that writes a value into every row: case 1 goes red.
 *   3. in the migrator, skip writing 0338's journal row: case 1 goes red.
 */
import { describe, expect, it } from 'vitest'
import { columns, journal, MIGRATIONS, migrationsBefore, partialMigrations, scratch } from './migration-fixtures.ts'

const TAG = journal(MIGRATIONS).find((entry) => entry.tag.endsWith('_a_project_names_its_master_pipeline'))?.tag
if (TAG === undefined) throw new Error('The migration journal holds no migration ending _a_project_names_its_master_pipeline.')
const BEFORE_0338 = migrationsBefore(TAG)

/** A scratch office at the migration before 0338, holding one made-up project written then, migrated through 0338 alone, since a later migration may add a column after it. */
async function migrated() {
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  const s = scratch('master-pipeline')
  migrateInPlace(s.db, partialMigrations(BEFORE_0338))
  s.db.prepare("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES ('made-up-project', 'A made-up project', '2026-11-13 09:00:00', '2026-11-13 09:00:00')").run()
  const before = s.db.prepare('SELECT * FROM workspaces ORDER BY id').all() as Record<string, unknown>[]
  const outcome = migrateInPlace(s.db, partialMigrations(BEFORE_0338 + 1))
  return { s, before, outcome }
}

describe('migration 0338', () => {
  it('adds master_pipeline as the last column, text and nullable, and every project written before it reads NULL', async () => {
    const { s, before } = await migrated()
    // 0338 WAS APPLIED: the journal table holds its own row, the hash of its file and its `when`, which the scratch
    // office lacked, since it was built from a folder that ends before 0338. On 14 November 2026 this replaced a check
    // that the run applied exactly one migration, because a later migration made that count wrong.
    const { THE_MIGRATION_JOURNAL_TABLE, theMigrationsInTheFolder } = await import('../src/config/migration-look.mjs')
    const theFile = theMigrationsInTheFolder(MIGRATIONS).find((migration) => migration.tag === TAG)
    expect(theFile?.tag).toBe(TAG)
    expect(s.db.prepare(`SELECT hash, created_at FROM "${THE_MIGRATION_JOURNAL_TABLE}"`).all()).toContainEqual({ hash: theFile?.hash, created_at: theFile?.when })
    expect(columns(s.db, 'workspaces').at(-1)).toMatchObject({ name: 'master_pipeline', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 })
    const after = s.db.prepare('SELECT * FROM workspaces ORDER BY id').all() as Record<string, unknown>[]
    expect(before.map((row) => row['id'])).toContain('made-up-project')
    expect(after.map((row) => row['master_pipeline'])).toEqual(before.map(() => null))
    expect(after.map(({ master_pipeline: _, ...rest }) => rest)).toEqual(before)
  })
})
