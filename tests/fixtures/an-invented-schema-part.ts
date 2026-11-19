// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MADE-UP SCHEMA PART, AS A LINE WOULD WRITE ONE: five tables in a file of their own, each wrapped
 * in `aPartTable` with what an archive and a restore do with it. It exists only for
 * tests/a-schema-part-table-is-exported-and-restored.test.ts, which names it in place of
 * src/server/db/schema-parts/index.ts, the way a line names a real part there.
 *
 * One table for each answer a part table can give:
 *   - `made_up_part_notes`: exported and compared, with a project column, a boolean and a JSON column;
 *   - `made_up_part_hours`: exported and compared, and belongs to no project;
 *   - `made_up_part_scan`: not exported, and a restore may lose it;
 *   - `made_up_part_retired`: exported, and not in the restore proof;
 *   - `made_up_part_left_out`: not exported, and not in the restore proof.
 *
 * THE FILLS WRITE ROWS WITH SQL, because a made-up table has no writer in the product. A real part
 * table's fill writes through its own writer (src/server/db/part-tables.ts says so).
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { aPartTable } from '../../src/server/db/part-tables.ts'
import { HOURS, LEFT_OUT, NO_PROJECT, NOTES, RETIRED, SCAN } from './an-invented-schema-part-rows.ts'

/** The database the proof is filling, opened only when a fill runs. */
const sqliteNow = async () => (await import('../../src/server/db/client.ts')).sqlite

export const madeUpPartNotes = aPartTable(
  sqliteTable('made_up_part_notes', {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    settled: integer('settled', { mode: 'boolean' }).notNull(),
    shape: text('shape', { mode: 'json' }),
    hours: integer('hours'),
  }),
  {
    exported: true,
    restore: 'compared',
    fillForTheProof: async () => {
      const sqlite = await sqliteNow()
      const insert = sqlite.prepare('INSERT INTO made_up_part_notes (id, workspace_id, settled, shape, hours) VALUES (?, ?, ?, ?, ?)')
      for (const row of NOTES) insert.run(row.id, row.workspace_id, row.settled, row.shape, row.hours)
      return `${NOTES.length} made-up notes, one settled with a shape and one with neither`
    },
  },
)

export const madeUpPartHours = aPartTable(
  sqliteTable('made_up_part_hours', { day: text('day').primaryKey(), hours: integer('hours').notNull() }),
  {
    exported: true,
    restore: 'compared',
    noProjectBecause: NO_PROJECT,
    fillForTheProof: async () => {
      const sqlite = await sqliteNow()
      for (const row of HOURS) sqlite.prepare('INSERT INTO made_up_part_hours (day, hours) VALUES (?, ?)').run(row.day, row.hours)
      return `${HOURS.length} made-up day of hours`
    },
  },
)

export const madeUpPartScan = aPartTable(sqliteTable('made_up_part_scan', { path: text('path').primaryKey() }), {
  exported: false,
  restore: 'may be lost',
  why: SCAN.why,
  repair: SCAN.repair,
  fillForTheProof: async () => {
    const sqlite = await sqliteNow()
    sqlite.prepare('INSERT INTO made_up_part_scan (path) VALUES (?)').run(SCAN.path)
    return 'one made-up scanned path'
  },
})

export const madeUpPartRetired = aPartTable(
  sqliteTable('made_up_part_retired', { id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull() }),
  { exported: true, restore: 'not in this proof', why: RETIRED.why },
)

export const madeUpPartLeftOut = aPartTable(sqliteTable('made_up_part_left_out', { id: text('id').primaryKey() }), {
  exported: false,
  restore: 'not in this proof',
  why: LEFT_OUT.why,
})
