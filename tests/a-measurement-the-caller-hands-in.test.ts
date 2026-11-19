// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CORPUS MIGRATIONS TAKE THEIR MEASUREMENT FROM THE CALLER, AND THIS REPOSITORY GIVES THEM NONE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT CHANGED, AND WHY THERE IS A TEST FOR IT
 * ---------------------------------------------------------------------------------------------
 *
 * Two files in `src/server/db/` used to hold a measurement of the owner's own corpus, written out
 * one record at a time with the owner's record ids and the owner's record titles: 385 rows saying how each record
 * entered the corpus, and 389 saying which project each belongs to. They were the owner's project data
 * living in the product's source, so they left this repository on 5 September 2026.
 *
 * Taking them out is safe because the rows they describe already carry the answer. The measurements
 * were applied on 11 and 12 August 2026, into `records.origin` and `records.workspace_id`, and a
 * backup carries both columns. Measured on a backup of the owner's live database on 5 September 2026: 1,924
 * records, none with a NULL origin, and every one of the 389 measured records already in the project
 * the measurement names. Neither migration had anything left to do.
 *
 * What is left in the product is the machinery, which still has a job on any database: it says of
 * every row that nobody has recorded how it entered the corpus or which project it is in, and the
 * workspace migration still declares the `default` project and stamps change rows, links and ledger
 * rows from the records they name. A caller who holds a measurement — the owner's is kept in the owner's private
 * data repository under `data/inventories/` — hands it in and gets the behaviour that shipped
 * before.
 *
 * ---------------------------------------------------------------------------------------------
 * THE THIRD TEST IS A NEW REFUSAL, NOT A RESTATEMENT
 * ---------------------------------------------------------------------------------------------
 *
 * A measurement names projects, and the product now knows the names of only its own. When the old
 * measurement lived in `src/`, the project it moved most records into was declared beside it; now
 * that it is handed in, its declaration has to be handed in too.
 *
 * The old code skipped an undeclared project silently and moved the records anyway. Nothing would
 * have caught that: the schema declares no foreign key from `records.workspace_id` to `workspaces`,
 * so the write succeeds, and the symptom arrives later as a server refusing to serve those records
 * with nothing saying why. It now refuses before writing anything, and names the project.
 */

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { migrateWorkspaces, type MeasuredWorkspace } from '../src/server/db/workspace-migration.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url))

const open: { dir: string; db: Database.Database }[] = []

function scratch(name: string): Database.Database {
  const dir = aTestDatabaseFolder(`handedin-${name}`)
  const db = new Database(join(dir, 'panelx.db'))
  open.push({ dir, db })
  // The real command, so this test cannot be passing against a schema it invented.
  migrateInPlace(db, MIGRATIONS)
  return db
}

afterEach(() => {
  for (const o of open.splice(0)) {
    if (o.db.open) o.db.close()
    rmSync(o.dir, { recursive: true, force: true })
  }
})

/** One record, written straight into the table because this is a test about a migration. */
function writeRecord(db: Database.Database, id: string, title: string): void {
  const at = '2026-08-01 09:00:00'
  db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data) ' +
      `VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', ?, ?, 'note', ?, '{}')`,
  ).run(id, at, at, title)
}

const workspaceIdOf = (db: Database.Database, id: string): string =>
  (db.prepare('SELECT workspace_id AS w FROM records WHERE id = ?').get(id) as { w: string }).w

const projectIds = (db: Database.Database): string[] =>
  // THE MESSAGE CENTRE'S ROW IS LEFT OUT: it is where every message is kept, and not a project.
  (db.prepare("SELECT id FROM workspaces WHERE id != 'message-centre' ORDER BY id").all() as { id: string }[]).map((r) => r.id)

/** A made-up measurement about a made-up record. Nothing here describes anybody's real corpus. */
const A_MEASUREMENT: readonly MeasuredWorkspace[] = [
  { id: 'made-up-1', workspace: 'a-made-up-project', by: 'run', kind: 'note', title: 'A made-up note' },
]

const ITS_PROJECT = {
  'a-made-up-project': { title: 'A made-up project', note: 'Invented by a test. Nobody works on it.' },
}

describe('with no measurement, which is what this repository ships', () => {
  it('moves no record and establishes no project but the default one', () => {
    const db = scratch('none')
    writeRecord(db, 'made-up-1', 'A made-up note')
    const report = migrateWorkspaces(db)
    expect(workspaceIdOf(db, 'made-up-1')).toBe('default')
    expect(report.moved).toEqual({})
    expect(report.established).toEqual([])
    expect(report.notMeasured).toBe(1)
    expect(projectIds(db)).toEqual(['default'])
  })

  it('still says out loud that nobody has placed those records', () => {
    const db = scratch('says')
    writeRecord(db, 'made-up-1', 'A made-up note')
    const report = migrateWorkspaces(db)
    const said = report.notes.filter((n) => n.kind === 'not_measured')
    expect(said.length, 'a record nobody placed went unmentioned').toBe(1)
    expect(said[0]?.detail).toContain('nothing here')
  })
})

describe('with a measurement handed in', () => {
  it('establishes the project it names and moves the record into it', () => {
    const db = scratch('handedin')
    writeRecord(db, 'made-up-1', 'A made-up note')
    const report = migrateWorkspaces(db, { measurement: A_MEASUREMENT, projects: ITS_PROJECT })
    expect(report.established).toEqual(['a-made-up-project'])
    expect(workspaceIdOf(db, 'made-up-1')).toBe('a-made-up-project')
    expect(report.moved).toEqual({ 'a-made-up-project': 1 })
  })

  it('leaves a record the measurement is not about exactly where it is', () => {
    const db = scratch('untouched')
    writeRecord(db, 'made-up-1', 'A made-up note')
    writeRecord(db, 'made-up-2', 'Another made-up note')
    migrateWorkspaces(db, { measurement: A_MEASUREMENT, projects: ITS_PROJECT })
    expect(workspaceIdOf(db, 'made-up-2')).toBe('default')
  })
})

describe('a measurement naming a project nobody declared', () => {
  it('is refused by name, before anything is written', () => {
    const db = scratch('undeclared')
    writeRecord(db, 'made-up-1', 'A made-up note')
    expect(() => migrateWorkspaces(db, { measurement: A_MEASUREMENT })).toThrowError(/a-made-up-project/)
    // Nothing moved and no project appeared: the refusal happens while planning, before the write.
    expect(workspaceIdOf(db, 'made-up-1')).toBe('default')
    expect(projectIds(db)).toEqual(['default'])
  })
})
