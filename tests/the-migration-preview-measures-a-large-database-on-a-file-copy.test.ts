// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MIGRATION PREVIEW MEASURES A DATABASE TOO LARGE FOR MEMORY AGAINST A COPY IN A TEMPORARY FILE, AND THE
 * FILE PATH KEEPS THE GUARD'S PROMISE: NOTHING IS WRITTEN THAT NO REPORT EXPLAINS.
 *
 * Problem Blt6Dv5ieC3r: on 3 October 2026 the live database passed 2 GiB, `Database.serialize` failed with
 * "Out of memory" in the preview's in-memory copy, and the guard refused to serve. Commit e173b1703 measures a
 * database above the limit against a file made with VACUUM INTO; since wave 13p round 15b that file is in a folder beside
 * the database, not the machine's temporary folder (see measureAgainstAFileCopy). This file holds that path to what the
 * in-memory one promises, on small scratch databases, by lowering the limit through `THE_PREVIEW_SEAM` — never with
 * a real 2 GiB file:
 *
 *   1. the file path is taken above the limit, and the in-memory path at or below it;
 *   2. a migration that writes and reports what it wrote is not flagged as unexplained;
 *   3. a write no report explains is caught, on the file path as on the in-memory one;
 *   4. the copy's folder is beside the database, and is removed after the measurement, even when a migration throws;
 *   5. a migration that switches the journal mode is not counted as a write;
 *   6. the copy is read chunk by chunk, and a difference in any chunk is caught. The chunks exist because
 *      `readFileSync` refuses a file over 2 GiB: measured in wave 13p round 15, a copy over 2 GiB made the first
 *      version of this path throw ERR_FS_FILE_TOO_LARGE. Since wave 13y round 21 each reading is kept as one
 *      fingerprint of all the chunks, not as the chunks (tests/the-start-check-holds-no-spare-copy-of-the-database.test.ts).
 *   7. a folder a crashed preview left beside the database is removed, and nothing else beside it is.
 *
 * A write no report explains is made with the seam's `migrate`: the real `migrateInPlace`, then one row written
 * that no step reports. Every database here is a scratch file in a temporary folder.
 *
 * A START WITH NOTHING PENDING MAKES NO COPY (tests/a-start-with-nothing-pending-makes-no-copy.test.ts), so where
 * case 3 asks the server, it asks it of a database one migration behind, which is still measured on a copy.
 *
 * Mutations, each proved in the commit message: invert the size test; drop `reported.length === 0`; compare only
 * the first chunk; drop the `rmSync` of the folder; drop the second `journal_mode = DELETE`.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { migrateInPlace, prepareToServe, previewMigration, removeLeftoverPreviewCopies, THE_PREVIEW_SEAM, whereTheCopyGoes } from '../src/server/db/migrate.ts'
import { oneMigrationBehind } from './an-office-one-migration-behind.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(REPO, 'drizzle')
const AS_SHIPPED = { ...THE_PREVIEW_SEAM }

const scratch: { dir: string; db: Database.Database }[] = []

afterEach(() => {
  Object.assign(THE_PREVIEW_SEAM, AS_SHIPPED)
  for (const s of scratch.splice(0)) {
    if (s.db.open) s.db.close()
    rmSync(s.dir, { recursive: true, force: true })
  }
})

/**
 * A fully migrated scratch database holding one authored record, with nothing left to migrate. With `behind`, it is
 * migrated with drizzle/ less its newest migration, so that one is pending.
 */
function aSettledDatabase(name: string, behind = false): Database.Database {
  const dir = aTestDatabaseFolder(`file-copy-${name}`)
  const migrations = behind ? oneMigrationBehind(dir) : MIGRATIONS
  const db = new Database(join(dir, 'office.db'))
  // The two pragmas db/client.ts sets, so the fixture is the shape a real start meets.
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  scratch.push({ dir, db })
  migrateInPlace(db, migrations)
  db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
      "VALUES ('note-1', 'default', 'owner-1', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'note', 'An invented note', NULL, '{}', 'authored')",
  ).run()
  // MIGRATED AGAIN, so the record gets its baseline revision and the database genuinely has nothing to do.
  migrateInPlace(db, migrations)
  return db
}

/** Takes the file path for this database: the limit is set one byte below its size. */
function takeTheFilePath(db: Database.Database): void {
  const bytes = (db.pragma('page_count', { simple: true }) as number) * (db.pragma('page_size', { simple: true }) as number)
  THE_PREVIEW_SEAM.inMemoryLimit = bytes - 1
}

/** The real migrations, then one row written that no step reports: the write the guard exists to catch. */
const migrateAndWriteUnreported: typeof migrateInPlace = (copy, folder) => {
  const outcome = migrateInPlace(copy, folder)
  copy.exec('CREATE TABLE a_table_no_report_names (x INTEGER)')
  return outcome
}

describe('the migration preview on a file copy above its limit', () => {
  it('takes the file path above the limit and the in-memory path at or below it', () => {
    const db = aSettledDatabase('which-path')
    const seen: string[] = []
    THE_PREVIEW_SEAM.migrate = (copy, folder) => {
      seen.push(copy.name)
      return migrateInPlace(copy, folder)
    }
    expect(whereTheCopyGoes(db)).toBe('memory')
    expect(previewMigration(db, MIGRATIONS).wouldWrite).toEqual([])
    takeTheFilePath(db)
    expect(whereTheCopyGoes(db)).toBe('file')
    expect(previewMigration(db, MIGRATIONS).wouldWrite).toEqual([])
    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toMatch(/copy\.db$/u)
    // BESIDE THE DATABASE, in a folder named for what it is, not in the machine's temporary folder.
    expect(dirname(dirname(seen[1]!))).toBe(dirname(db.name))
    expect(seen[1]).toMatch(/\/\.migration-preview-[A-Za-z0-9]{6}\/copy\.db$/u)
  })

  it('does not flag a migration that writes and reports what it wrote, on the file path', () => {
    const db = aSettledDatabase('reported')
    // A WRITE THE REVISIONS STEP REPORTS: a record rewritten with no revision kept is a catch-up it names.
    db.prepare("UPDATE records SET summary = 'a summary nothing kept a revision for' WHERE id = 'note-1'").run()
    takeTheFilePath(db)
    const preview = previewMigration(db, MIGRATIONS)
    expect(preview.outcome.revisions.caughtUp).toBe(1)
    expect(preview.wouldWrite.some((line) => line.startsWith('revisions:'))).toBe(true)
    expect(preview.wouldWrite.some((line) => line.includes('none of the'))).toBe(false)
  })

  it('catches a write no report explains, on the file path as on the in-memory one, and the server refuses', () => {
    for (const path of ['memory', 'file'] as const) {
      const db = aSettledDatabase(`unexplained-${path}`)
      if (path === 'file') takeTheFilePath(db)
      THE_PREVIEW_SEAM.migrate = migrateAndWriteUnreported
      const preview = previewMigration(db, MIGRATIONS)
      expect(preview.wouldWrite.some((line) => line.includes('none of the')), `${path}: ${preview.wouldWrite.join('\n')}`).toBe(true)
      // THE SERVER MEASURES ON A COPY ONLY WHILE A MIGRATION IS PENDING, so it is asked of a database one behind.
      const behind = aSettledDatabase(`unexplained-${path}-behind`, true)
      if (path === 'file') takeTheFilePath(behind)
      const decision = prepareToServe(behind, MIGRATIONS)
      expect(decision.serve, path).toBe(false)
      if (!decision.serve && path === 'file') expect(decision.refusal).toContain('in a folder beside the database')
      for (const asked of [db, behind]) {
        expect(asked.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'a_table_no_report_names'").get()).toEqual({ n: 0 })
      }
    }
  })

  it('removes the temporary folder after the measurement, even when a migration throws', () => {
    const db = aSettledDatabase('cleanup')
    takeTheFilePath(db)
    let copyAt = ''
    THE_PREVIEW_SEAM.migrate = (copy) => {
      copyAt = copy.name
      throw new Error('a migration that falls over')
    }
    expect(() => previewMigration(db, MIGRATIONS)).toThrow('a migration that falls over')
    expect(copyAt).toMatch(/copy\.db$/u)
    expect(existsSync(dirname(copyAt))).toBe(false)

    THE_PREVIEW_SEAM.migrate = (copy, folder) => {
      copyAt = copy.name
      return migrateInPlace(copy, folder)
    }
    expect(previewMigration(db, MIGRATIONS).wouldWrite).toEqual([])
    expect(existsSync(dirname(copyAt))).toBe(false)
  })

  it('does not count a migration that switches the journal mode as a write', () => {
    const db = aSettledDatabase('journal')
    takeTheFilePath(db)
    THE_PREVIEW_SEAM.migrate = (copy, folder) => {
      const outcome = migrateInPlace(copy, folder)
      copy.pragma('journal_mode = WAL')
      return outcome
    }
    expect(previewMigration(db, MIGRATIONS).wouldWrite).toEqual([])
  })

  it('compares the copy chunk by chunk, so a write that leaves the length and the first page alone is caught', () => {
    const db = aSettledDatabase('chunks')
    takeTheFilePath(db)
    THE_PREVIEW_SEAM.compareChunkBytes = 4096
    expect(previewMigration(db, MIGRATIONS).wouldWrite).toEqual([])
    // ONE SMALL ROW INTO AN EMPTY TABLE no step reads: it lands in that table's own page, far from page 1, and the
    // file keeps its length, so only a comparison of every chunk sees it.
    THE_PREVIEW_SEAM.migrate = (copy, folder) => {
      const outcome = migrateInPlace(copy, folder)
      copy
        .prepare("INSERT INTO outside_reads (id, at_ms, source, what, wanted, verdict) VALUES ('r1', 1, 's', 'w', 'x', 'v')")
        .run()
      return outcome
    }
    expect(previewMigration(db, MIGRATIONS).wouldWrite.some((line) => line.includes('none of the'))).toBe(true)
  })
  it('removes a folder a crashed preview left beside the database, and nothing else beside it', () => {
    const db = aSettledDatabase('leftovers')
    const home = dirname(db.name)
    const anHourAndMoreAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    /** A folder beside the database holding `files`, last changed `when`. */
    const aFolder = (name: string, files: string[], when: Date): void => {
      const dir = join(home, name)
      mkdirSync(dir)
      for (const file of files) {
        writeFileSync(join(dir, file), 'invented bytes')
        utimesSync(join(dir, file), when, when)
      }
      utimesSync(dir, when, when)
    }
    aFolder('.migration-preview-AbC123', ['copy.db', 'copy.db-journal'], anHourAndMoreAgo) // a crash's leftover
    aFolder('.migration-preview-recent', ['copy.db'], new Date()) // a preview running now
    aFolder('.migration-preview-OtHeR1', ['copy.db', 'notes.txt'], anHourAndMoreAgo) // holds something it never makes
    aFolder('.migration-preview-toolong7', ['copy.db'], anHourAndMoreAgo) // not mkdtemp's six letters
    aFolder('.not-a-preview-AbC123', ['copy.db'], anHourAndMoreAgo) // another prefix
    takeTheFilePath(db)
    expect(previewMigration(db, MIGRATIONS).leftoverCopiesRemoved).toEqual([join(home, '.migration-preview-AbC123')])
    expect(readdirSync(home).filter((name) => name.startsWith('.')).sort()).toEqual([
      '.migration-preview-OtHeR1',
      '.migration-preview-recent',
      '.migration-preview-toolong7',
      '.not-a-preview-AbC123',
    ])
    // And the start report says what it removed, when there was something.
    aFolder('.migration-preview-AgAin9', ['copy.db'], anHourAndMoreAgo)
    const decision = prepareToServe(db, MIGRATIONS)
    expect(decision.serve).toBe(true)
    if (decision.serve) expect(decision.report).toContain(`it removed a copy an earlier preview left behind: ${join(home, '.migration-preview-AgAin9')}`)
    expect(removeLeftoverPreviewCopies(home)).toEqual([])
  })
})
