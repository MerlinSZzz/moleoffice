// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TABLE DECLARED IN A SCHEMA PART IS EXPORTED, RESTORED AND COMPARED BY ITS DECLARATION ALONE.
 *
 * Wave 13s round 89, and round 103 for the tables a restore may lose or the proof leaves out. A line
 * adds a table in a file of its own under src/server/db/schema-parts/ and says beside it, with
 * `aPartTable`, whether an archive carries it and what the restore proof does with it. No line is
 * added to lib/export.ts or scripts/restore-check.ts. This file proves that is enough.
 *
 * THE FIVE TABLES ARE MADE UP, AND EXIST ONLY IN THIS TEST. The folder holds no part table yet, so
 * schema-parts/index.ts is replaced here by tests/fixtures/an-invented-schema-part.ts, a part file
 * with one table for each answer: two an archive carries and the proof compares, one with a project
 * column and one that belongs to no project; one no archive carries that a restore may lose; one an
 * archive carries that the proof leaves out; and one no archive carries that the proof leaves out.
 *
 * THE TABLES ARE CREATED WITH THE STATEMENTS DRIZZLE-KIT'S OWN DIFF WRITES for schema.ts with and
 * without its parts, so the same run proves the migration generator sees a part table through
 * schema.ts. No migration is written and none is needed: each test database is a temporary copy.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getTableName, is } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'

import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { HOURS, LEFT_OUT, NO_PROJECT, NOTES, RETIRED, SCAN } from './fixtures/an-invented-schema-part-rows.ts'
import {
  compareThePartTables,
  comparisonOfThePartTable,
  COMPARISON_NAMES,
  countThePartTables,
  DECLARED_LOSSES,
  fillThePartTables,
  NOT_IN_THIS_PROOF,
  outOfThisProof,
  readThePartTables,
  type Snapshot,
} from '../scripts/restore-check.ts'
import { everyPartTable } from '../src/server/db/every-part-table.ts'

vi.mock('../src/server/db/schema-parts/index.ts', () => import('./fixtures/an-invented-schema-part.ts'))

type Schema = typeof import('../src/server/db/schema.ts')
type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

/** What drizzle-kit's own diff writes for schema.ts with its parts, over schema.ts without them. */
async function whatTheGeneratorWritesForTheParts(schema: Schema): Promise<string[]> {
  const kit = await import('drizzle-kit/api')
  const partNames = new Set(everyPartTable().map((t) => t.name))
  const withoutParts = Object.fromEntries(
    Object.entries(schema).filter(([, value]) => !(is(value, SQLiteTable) && partNames.has(getTableName(value)))),
  )
  const before = await kit.generateSQLiteDrizzleJson(withoutParts)
  const after = await kit.generateSQLiteDrizzleJson({ ...schema })
  return kit.generateSQLiteMigration(before, after)
}

function count(t: TestDb, table: string): number {
  return (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
}

/** A snapshot holding only the part tables' counts, which is all a part table's declared loss reads. */
function countsOf(t: TestDb): Snapshot {
  return { partTableCounts: countThePartTables(t.client.sqlite) } as Snapshot
}

let statements: string[]
let fillNotes: string[]
let source: TestDb
let restored: TestDb
let archive: string
let scoped: string
let imported: ReturnType<ImportLib['applyImport']>
let scopedReport: ReturnType<ExportLib['writeExport']>

beforeAll(async () => {
  archive = aTestDatabaseFolder('part-archive')
  scoped = aTestDatabaseFolder('part-archive-scoped')

  source = await freshDb()
  statements = await whatTheGeneratorWritesForTheParts((await import('../src/server/db/schema.ts')) as Schema)
  for (const statement of statements) source.client.sqlite.exec(statement)
  fillNotes = await fillThePartTables()
  // The two tables the proof leaves out hold a row each, written here because the proof fills
  // neither, so "an archive carries it" and "no archive carries it" are measurements.
  source.client.sqlite.prepare('INSERT INTO made_up_part_retired (id, workspace_id) VALUES (?, ?)').run(RETIRED.id, 'default')
  source.client.sqlite.prepare('INSERT INTO made_up_part_left_out (id) VALUES (?)').run(LEFT_OUT.id)
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  exportLib.writeExport(archive)
  scopedReport = exportLib.writeExport(scoped, { workspaceId: 'default' })

  restored = await freshDb()
  for (const statement of statements) restored.client.sqlite.exec(statement)
  const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  imported = importLib.applyImport(archive)
}, 120_000)

afterAll(() => {
  for (const folder of [archive, scoped]) removeThisTestFolder(folder)
  // Either may be missing when the set-up failed before it, and that failure is the one to read.
  restored?.close()
  source?.close()
})

const page = (root: string, table: string) => join(root, 'schema-parts', `${table}.md`)

describe('the migration generator reads a part table through schema.ts', () => {
  it('writes one CREATE TABLE for each made-up part table and nothing else', () => {
    expect(statements.map((s) => /^CREATE TABLE `(\w+)`/.exec(s)?.[1] ?? s).sort()).toEqual([
      'made_up_part_hours',
      'made_up_part_left_out',
      'made_up_part_notes',
      'made_up_part_retired',
      'made_up_part_scan',
    ])
  })
})

describe('an archive carries a part table by its declaration alone', () => {
  it('has a page for each table it carries, and none for a table it does not', () => {
    for (const table of ['made_up_part_notes', 'made_up_part_hours', 'made_up_part_retired']) {
      expect(existsSync(page(archive, table)), `no page for ${table}`).toBe(true)
    }
    for (const table of ['made_up_part_scan', 'made_up_part_left_out']) {
      expect(existsSync(page(archive, table)), `a page for ${table}`).toBe(false)
    }
  })

  it('writes each row as one block, its boolean as true or false and its JSON as the value', () => {
    const text = readFileSync(page(archive, 'made_up_part_notes'), 'utf8')
    expect(text.split('```mole-office made_up_part_notes').length - 1).toBe(NOTES.length)
    expect(text).toContain(`settled: ${JSON.stringify(true)}`)
    expect(text).toContain(`settled: ${JSON.stringify(false)}`)
    expect(text).toContain(`shape: ${JSON.stringify(JSON.parse(NOTES[0].shape))}`)
  })

  it('says on the page of a table that belongs to no project why it belongs to none', () => {
    expect(readFileSync(page(archive, 'made_up_part_hours'), 'utf8')).toContain(NO_PROJECT)
  })

  it('carries the row of a table the proof leaves out, because its declaration says an archive carries it', () => {
    expect(readFileSync(page(archive, 'made_up_part_retired'), 'utf8')).toContain(JSON.stringify(RETIRED.id))
  })

  it('counts each carried table in the manifest, and names each table it does not carry with its reason', () => {
    const manifest = readFileSync(join(archive, 'MANIFEST.md'), 'utf8')
    expect(manifest).toContain(`made_up_part_notes: ${NOTES.length}`)
    expect(manifest).toContain(`made_up_part_hours: ${HOURS.length}`)
    expect(manifest).toContain('made_up_part_retired: 1')
    for (const table of ['made_up_part_scan', 'made_up_part_left_out']) expect(manifest).not.toContain(`${table}:`)
    for (const said of ['made_up_part_scan', SCAN.why, SCAN.repair, 'made_up_part_left_out', LEFT_OUT.why]) {
      expect(manifest, `the manifest does not say ${said}`).toContain(said)
    }
  })

  it('names each table it does not carry in the README, with its reason', () => {
    const readme = readFileSync(join(archive, 'README.md'), 'utf8')
    for (const said of ['`made_up_part_scan`', SCAN.why, SCAN.repair, '`made_up_part_left_out`', LEFT_OUT.why]) {
      expect(readme, `the README does not say ${said}`).toContain(said)
    }
  })

  it('carries a project\'s rows in a project\'s archive, and says the table with no project is not there', () => {
    expect(readFileSync(page(scoped, 'made_up_part_notes'), 'utf8').split('```mole-office made_up_part_notes').length - 1).toBe(NOTES.length)
    const hours = readFileSync(page(scoped, 'made_up_part_hours'), 'utf8')
    expect(hours).not.toContain('```mole-office made_up_part_hours')
    expect(hours).toContain(NO_PROJECT)
    const said = scopedReport.notes.filter((note) => note.includes('made_up_part_hours'))
    expect(said, 'the scoped export does not say the table with no project was left out').toHaveLength(1)
    expect(said[0]).toContain(NO_PROJECT)
  })
})

describe('a restore brings a part table back, and the restore proof compares it', () => {
  it('the restore proof filled each compared table and the table it may lose, through their own declarations', () => {
    expect(fillNotes).toHaveLength(3)
    expect(fillNotes[0]).toContain('made_up_part_notes')
    expect(fillNotes[1]).toContain('made_up_part_hours')
    expect(fillNotes[2]).toContain('made_up_part_scan')
  })

  it('imports every carried row and none of a table no archive carries', () => {
    expect(imported.refusals).toEqual([])
    expect(imported.applied).toBe(true)
    expect(imported.inserts['made_up_part_notes']).toBe(NOTES.length)
    expect(imported.inserts['made_up_part_hours']).toBe(HOURS.length)
    expect(imported.inserts['made_up_part_retired']).toBe(1)
    for (const table of ['made_up_part_scan', 'made_up_part_left_out']) {
      expect(count(source, table), `${table} before`).toBe(1)
      expect(count(restored, table), `${table} after`).toBe(0)
    }
  })

  it('names one comparison for each compared table, after the fixed ones, and none for the other three', () => {
    expect(COMPARISON_NAMES.slice(-2)).toEqual([
      comparisonOfThePartTable('made_up_part_notes'),
      comparisonOfThePartTable('made_up_part_hours'),
    ])
    for (const table of ['made_up_part_scan', 'made_up_part_retired', 'made_up_part_left_out']) {
      expect(COMPARISON_NAMES).not.toContain(comparisonOfThePartTable(table))
    }
  })

  it('holds over the restored rows, differs when a column is changed, and is vacuous over an empty table', () => {
    const before = readThePartTables(source.client.sqlite)
    expect(compareThePartTables(before, readThePartTables(restored.client.sqlite)).map((c) => c.verdict)).toEqual(['held', 'held'])

    restored.client.sqlite.prepare('UPDATE made_up_part_notes SET settled = 1 WHERE id = ?').run(NOTES[1].id)
    const changed = compareThePartTables(before, readThePartTables(restored.client.sqlite))
    expect(changed.map((c) => c.verdict)).toEqual(['differs', 'held'])
    expect(changed[0]?.differences).toHaveLength(1)
    for (const said of [NOTES[1].id, 'settled']) expect(changed[0]?.differences[0]?.where).toContain(said)

    const empty = { made_up_part_notes: [], made_up_part_hours: [] }
    expect(compareThePartTables(empty, empty).map((c) => c.verdict)).toEqual(['vacuous', 'vacuous'])
  })
})

describe('the restore proof lists a part table as a declared loss, or as not in the proof, by its declaration alone', () => {
  it('declares the loss of the table a restore may lose, with the why and the repair its declaration gives', () => {
    const losses = DECLARED_LOSSES.filter((loss) => loss.what.includes('made_up_part_scan'))
    expect(losses).toHaveLength(1)
    expect(losses[0]?.why).toBe(SCAN.why)
    expect(losses[0]?.repair).toBe(SCAN.repair)
    for (const table of ['made_up_part_notes', 'made_up_part_hours', 'made_up_part_retired', 'made_up_part_left_out']) {
      expect(DECLARED_LOSSES.filter((loss) => loss.what.includes(table)), `a loss is declared for ${table}`).toEqual([])
    }
  })

  it('measures that loss: it happened over this restore, and does not when the table comes back with a row', () => {
    const loss = DECLARED_LOSSES.find((l) => l.what.includes('made_up_part_scan'))
    expect(loss?.happened(countsOf(source), countsOf(restored))).toBe(true)
    expect(loss?.happened(countsOf(source), countsOf(source))).toBe(false)
  })

  it('leaves the two tables out of the proof that say so, each with the reason its declaration gives', () => {
    expect(NOT_IN_THIS_PROOF.filter((t) => t.table.startsWith('made_up_part_'))).toEqual([
      { table: 'made_up_part_retired', why: RETIRED.why },
      { table: 'made_up_part_left_out', why: LEFT_OUT.why },
    ])
    expect(outOfThisProof('made_up_part_retired')).toBe(true)
    expect(outOfThisProof('made_up_part_left_out')).toBe(true)
    for (const table of ['made_up_part_notes', 'made_up_part_hours', 'made_up_part_scan']) expect(outOfThisProof(table), table).toBe(false)
  })
})
