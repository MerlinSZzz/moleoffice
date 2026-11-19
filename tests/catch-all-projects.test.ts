// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO CATCH-ALL PROJECTS: `Unassigned` KEEPS ITS RECORDS AND `General` ARRIVES EMPTY.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS IS ABOUT
 * ---------------------------------------------------------------------------------------------
 *
 * The owner settled it on 16 August 2026, in Mole Office decision `AtiSHfG00BVV`. Mole Office has two
 * catch-all projects and they mean different things:
 *
 *   `unassigned` — Mole Office knows the item exists and its proper home has not been decided.
 *   `general`    — work that is deliberately miscellaneous and does not deserve its own project.
 *
 * The records in `unassigned` were put there by the corpus migration because the measurement could
 * not place them, which is the first definition and not the second. So `general` is established as
 * a NEW EMPTY PROJECT and nothing is moved into it. Somebody may file a record into it later, one
 * at a time, and that is a judgement no migration may make on their behalf.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS CHECKED, AND WHY EACH ONE WOULD BE MISSED WITHOUT IT
 * ---------------------------------------------------------------------------------------------
 *
 * 1. GENERAL IS ESTABLISHED, EMPTY, AND UNASSIGNED IS UNTOUCHED. A migration that moved the records
 *    would look identical in the workspaces table and would have destroyed the distinction the
 *    owner just drew.
 * 2. IT IS SAFE TO RUN TWICE. The migration command is run by hand against a database holding the
 *    only copy of somebody's work, and a second run is the ordinary case.
 * 3. IT IS ESTABLISHED ONLY WHERE UNASSIGNED IS. General is the second half of a pair; a database
 *    with no Unassigned project is not the corpus this decision is about, and an empty project
 *    appearing in a colleague's Mole Office would be a project they do not have.
 * 4. THE COMMAND SAYS WHAT IT DID, with both counts. An operator reading "established general" has
 *    no way to tell whether the records came with it, and that is the whole of the decision.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE DATABASE IS BUILT AND NOT MOCKED
 * ---------------------------------------------------------------------------------------------
 *
 * Every test below runs the real `migrateWorkspaces` against a real SQLite file built by the real
 * migration folder. The one thing that is arranged by hand is the starting state — an installation
 * that already has an `unassigned` project with records in it — because that is the state of the
 * owner's database and no fresh database is in it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { describeWorkspaces, migrateWorkspaces } from '../src/server/db/workspace-migration.ts'
import { UNASSIGNED_WORKSPACE } from '../src/shared/workspaces.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url))

/** A migrated database on disk, thrown away after each test. */
interface Scratch {
  dir: string
  db: Database.Database
}

function scratch(name: string): Scratch {
  const dir = aTestDatabaseFolder(name)
  const db = new Database(join(dir, 'panelx.db'))
  // The real command, so this test cannot be passing against a schema it invented.
  migrateInPlace(db, MIGRATIONS)
  return { dir, db }
}

/**
 * Put an `unassigned` project with `records` records in it, the way the corpus migration left the
 * owner's database.
 *
 * Written straight into the tables rather than through the API, because the API needs a server and
 * this test is about a migration. The columns are the ones the schema declares NOT NULL.
 */
function asTheCorpusLeftIt(db: Database.Database, records: number): void {
  const at = '2026-08-12 01:44:45'
  db.prepare('INSERT INTO workspaces (id, title, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    UNASSIGNED_WORKSPACE,
    'Unassigned',
    'Records no measurement could place.',
    at,
    at,
  )
  const insert = db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data) ' +
      `VALUES (?, ?, '${THE_TEST_OFFICES_OWNER.id}', ?, ?, 'note', ?, '{}')`,
  )
  for (let i = 0; i < records; i += 1) {
    insert.run(`unplaced-${String(i)}`, UNASSIGNED_WORKSPACE, at, at, `Something nobody could place, ${String(i)}`)
  }
}

const liveIn = (db: Database.Database, id: string): number =>
  (
    db.prepare('SELECT count(*) AS n FROM records WHERE workspace_id = ? AND deleted_at IS NULL').get(id) as {
      n: number
    }
  ).n

const workspace = (db: Database.Database, id: string): { id: string; title: string; note: string | null } | undefined =>
  db.prepare('SELECT id, title, note FROM workspaces WHERE id = ?').get(id) as
    | { id: string; title: string; note: string | null }
    | undefined

// ============================================================================ beside Unassigned

describe('General is established beside Unassigned, and empty', () => {
  let s: Scratch
  beforeEach(() => {
    s = scratch('catch-all')
    asTheCorpusLeftIt(s.db, 92)
  })
  afterEach(() => {
    s.db.close()
    rmSync(s.dir, { recursive: true, force: true })
  })

  it('establishes it as a project with a title, and says it established it', () => {
    const report = migrateWorkspaces(s.db)
    expect(report.established, 'General was not established').toContain('general')
    const general = workspace(s.db, 'general')
    expect(general?.title, 'General has no title, so every screen would print its id').toBe('General')
    // The note is what `GET /api/workspaces` serves and what the switcher shows on hover. It has to
    // say the thing that tells this project from Unassigned, or the reader has two names and no
    // difference.
    expect(general?.note ?? '').toContain('deliberately miscellaneous')
    expect(general?.note ?? '').toContain('Unassigned')
  })

  it('moves not one record into it, and leaves every record where Unassigned had it', () => {
    migrateWorkspaces(s.db)
    expect(liveIn(s.db, 'general'), 'records were moved into General, which is what the owner refused').toBe(0)
    expect(liveIn(s.db, UNASSIGNED_WORKSPACE), 'Unassigned lost records').toBe(92)
  })

  it('leaves Unassigned’s stored title alone, because that title is now what the screen prints', () => {
    migrateWorkspaces(s.db)
    expect(workspace(s.db, UNASSIGNED_WORKSPACE)?.title).toBe('Unassigned')
  })

  it('reports both counts, so an operator can see the records did not come with it', () => {
    const report = migrateWorkspaces(s.db)
    expect(report.catchAll).toEqual({ unassignedRecords: 92, generalRecords: 0 })
    const said = describeWorkspaces(report)
    expect(said).toContain('established general')
    expect(said).toContain('"General" is now a project and it is EMPTY: 0 records')
    expect(said).toContain('"Unassigned" keeps its 92')
    expect(said).toContain('Nothing was moved between them')
  })

  it('is safe to run twice: the second run establishes nothing and moves nothing', () => {
    migrateWorkspaces(s.db)
    const again = migrateWorkspaces(s.db)
    expect(again.established, 'the second run established something again').toEqual([])
    expect(again.alreadyDone, 'the second run found work to do').toBe(true)
    expect(liveIn(s.db, 'general')).toBe(0)
    expect(liveIn(s.db, UNASSIGNED_WORKSPACE)).toBe(92)
    // One row, not two. `ON CONFLICT DO NOTHING` is what makes that true and this is what would
    // notice if the insert lost it.
    expect((s.db.prepare("SELECT count(*) AS n FROM workspaces WHERE id = 'general'").get() as { n: number }).n).toBe(1)
  })
})

// ============================================================================ nowhere else

describe('General is not established on a database that has no Unassigned', () => {
  let s: Scratch
  beforeEach(() => {
    s = scratch('no-catch-all')
  })
  afterEach(() => {
    s.db.close()
    rmSync(s.dir, { recursive: true, force: true })
  })

  it('leaves a fresh installation with its default workspace and nothing else', () => {
    // THE CONTROL FOR THE WHOLE FILE, in a way: `migrateInPlace` in `scratch` has already run the
    // real migration once, so if that run had established General this would be red here rather
    // than in some other agent's suite three days later.
    const report = migrateWorkspaces(s.db)
    expect(report.established).toEqual([])
    expect(workspace(s.db, 'general'), 'an empty General appeared on a database with no Unassigned').toBeUndefined()
    expect(report.catchAll, 'the catch-all counts were reported for an installation that has no pair').toBeNull()
    // And the command says nothing about a pair that is not there.
    expect(describeWorkspaces(report)).not.toContain('General')
  })
})
