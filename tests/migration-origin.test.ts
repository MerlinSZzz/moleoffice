// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ORIGIN STAMP: what it writes, and everything it refuses to write.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE REFUSALS ARE MOST OF THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * `records.origin` says whether a record is part of the project record or is furniture the seed
 * wrote so a layout had something to draw. Both values are cheap to write and one of them is
 * expensive to write wrongly: a `fixture` on a real record hides work, and an `authored` on a seeded
 * one turns fabricated content into evidence, which is the failure the whole field exists to stop.
 *
 * So the interesting claims here are not "it stamps the rows it measured". They are: a row it did
 * not measure comes out NULL and never `authored`; a row whose title or kind has changed is not the
 * row that was measured and is not stamped; a row that already carries a word is left alone; and
 * nothing anywhere infers an origin from a title, a date or a kind.
 *
 * Every test below is proved by breaking the thing it covers and watching it go red — see the report
 * that shipped with this file.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { migrateOrigins, planOriginStamps, type MeasuredOrigin } from '../src/server/db/origin-migration.ts'
import { RECORD_ORIGINS, readOrigin } from '../src/shared/types.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

/**
 * A MADE-UP MEASUREMENT, WRITTEN HERE, ABOUT NO REAL CORPUS.
 *
 * The migration used to read a 385-row measurement of the owner's own corpus out of the source tree,
 * and these tests took their rows from it. That measurement left the repository on 5 September 2026
 * because it was the owner's record ids and record titles written into the product; the migration now takes
 * a measurement from its caller and this repository hands it none.
 *
 * So the machinery is proved here against two invented rows instead. Nothing about these ids or
 * titles is real, which is the point: the migration matches on an id it was handed and infers
 * nothing from what the row says.
 */
const A_MEASUREMENT: readonly MeasuredOrigin[] = [
  { id: 'made-up-fixture-1', origin: 'fixture', kind: 'note', title: 'A made-up seeded note' },
  { id: 'made-up-authored-1', origin: 'authored', kind: 'task', title: 'A made-up task somebody wrote' },
]

const MIGRATIONS = join(fileURLToPath(new URL('..', import.meta.url)), 'drizzle')

const open: { dir: string; db: Database.Database }[] = []

/** A fully migrated, empty database. The origin column exists; nothing is in it. */
function fresh(name: string): Database.Database {
  const dir = aTestDatabaseFolder(`origin-${name}`)
  const db = new Database(join(dir, 'panelx.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  open.push({ dir, db })
  migrateInPlace(db, MIGRATIONS)
  return db
}

afterEach(() => {
  for (const o of open.splice(0)) {
    if (o.db.open) o.db.close()
    rmSync(o.dir, { recursive: true, force: true })
  }
})

interface RowSpec {
  id: string
  kind: string
  title: string
  deletedAt?: string
  origin?: string
}

function write(db: Database.Database, rows: RowSpec[]): void {
  const insert = db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) ' +
      `VALUES (@id, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', @kind, @title, NULL, '{}', @deleted_at, @origin)`,
  )
  for (const r of rows) {
    insert.run({ id: r.id, kind: r.kind, title: r.title, deleted_at: r.deletedAt ?? null, origin: r.origin ?? null })
  }
}

function originOf(db: Database.Database, id: string): string | null {
  const row = db.prepare('SELECT origin FROM records WHERE id = ?').get(id) as { origin: string | null } | undefined
  if (row === undefined) throw new Error(`no record ${id}`)
  return row.origin
}

/**
 * One row of each kind of answer out of the made-up measurement above.
 *
 * Returned WITHOUT the measured word, so writing it into a database produces the state the migration
 * is about — a row the measurement covers that carries no stamp yet. Handing back the whole entry
 * would insert the answer alongside the question.
 */
function anyMeasured(origin: 'fixture' | 'authored'): RowSpec & { measuredTitle: string } {
  const found = A_MEASUREMENT.find((m) => m.origin === origin)
  if (found === undefined) throw new Error(`the made-up measurement holds no ${origin} row`)
  return { id: found.id, kind: found.kind, title: found.title, measuredTitle: found.title }
}

/** Run the migration with the made-up measurement, which is the only measurement in this checkout. */
function stamp(db: Database.Database, opts: { dryRun?: boolean } = {}) {
  return migrateOrigins(db, { ...opts, measurement: A_MEASUREMENT })
}

// ============================================================================ what this repository ships

describe('the measurement this repository ships', () => {
  it('is empty, so a row nobody handed a measurement about keeps its NULL', () => {
    // THE CHANGE OF 5 SEPTEMBER 2026, STATED AS A TEST. The 385-row measurement of the owner's own
    // corpus is no longer in the source tree. Its result is in `records.origin` on the database it
    // was about — measured on a backup of that database the same day: 1,924 records, none with a
    // NULL origin — so nothing was lost by taking it out. What a caller gets now is a migration
    // that says, of every unstamped row, that nobody has recorded how it entered the corpus.
    const db = fresh('shipsnothing')
    const f = anyMeasured('fixture')
    write(db, [f])
    const report = migrateOrigins(db)
    expect(originOf(db, f.id)).toBeNull()
    expect(report.fixture).toBe(0)
    expect(report.authored).toBe(0)
    expect(report.unstamped).toBe(1)
    expect(report.notes.map((n) => n.kind)).toEqual(['not_measured'])
  })

  it('leaves a corpus that already carries its origins exactly as it found it', () => {
    const db = fresh('alreadystamped')
    write(db, [
      { id: 'r1', kind: 'note', title: 'one', origin: 'fixture' },
      { id: 'r2', kind: 'task', title: 'two', origin: 'authored' },
    ])
    const before = db.prepare('SELECT id, origin FROM records ORDER BY id').all()
    const report = migrateOrigins(db)
    expect(report.alreadyDone).toBe(true)
    expect(report.alreadyStamped).toBe(2)
    expect(report.notes).toEqual([])
    expect(db.prepare('SELECT id, origin FROM records ORDER BY id').all()).toEqual(before)
  })
})

// ============================================================================ the measurement handed in

describe('a measurement handed to it', () => {
  it('is used exactly as given, with no row of its own', () => {
    // The migration holds no measurement of its own to fall back on, so a caller who hands one in
    // gets exactly the rows they handed in and nothing else.
    const db = fresh('handedin')
    const f = anyMeasured('fixture')
    write(db, [f, { id: 'not-in-what-was-handed-in', kind: 'note', title: 'somebody else' }])
    const report = stamp(db)
    expect(originOf(db, f.id)).toBe('fixture')
    expect(originOf(db, 'not-in-what-was-handed-in')).toBeNull()
    expect(report.fixture).toBe(1)
    expect(report.unstamped).toBe(1)
  })

  it('uses only the two words shared/types.ts declares', () => {
    for (const m of A_MEASUREMENT) {
      expect(RECORD_ORIGINS, `${m.id} was measured as "${m.origin}"`).toContain(m.origin)
      expect(readOrigin(m.origin)).toBe(m.origin)
    }
  })

  it('names each row once, so no row has two measurements to choose between', () => {
    const ids = new Set(A_MEASUREMENT.map((m) => m.id))
    expect(ids.size).toBe(A_MEASUREMENT.length)
  })

  it('carries a kind and a title for every row, which is what makes it auditable', () => {
    for (const m of A_MEASUREMENT) {
      expect(m.id.length, 'a measured row with no id').toBeGreaterThan(0)
      expect(m.kind.length, `${m.id} has no kind`).toBeGreaterThan(0)
      expect(m.title.length, `${m.id} has no title`).toBeGreaterThan(0)
    }
  })
})

// ============================================================================ what it stamps

describe('stamping a corpus it has a measurement of', () => {
  it('writes the measured word onto the measured row', () => {
    const db = fresh('stamps')
    const f = anyMeasured('fixture')
    const a = anyMeasured('authored')
    write(db, [f, a])
    const report = stamp(db)
    expect(originOf(db, f.id)).toBe('fixture')
    expect(originOf(db, a.id)).toBe('authored')
    expect(report.fixture).toBe(1)
    expect(report.authored).toBe(1)
    expect(report.unstamped).toBe(0)
  })

  it('stamps a soft-deleted record too, because deleting it did not change how it got here', () => {
    const db = fresh('deleted')
    const f = anyMeasured('fixture')
    write(db, [{ ...f, deletedAt: '2026-08-01 12:00:00' }])
    stamp(db)
    expect(originOf(db, f.id)).toBe('fixture')
  })

  it('writes no change-log row, so 385 stamps cannot bury a day of work', () => {
    const db = fresh('nochanges')
    write(db, [anyMeasured('fixture'), anyMeasured('authored')])
    const before = (db.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }).n
    stamp(db)
    expect((db.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }).n).toBe(before)
  })

  it('touches nothing else about the row', () => {
    const db = fresh('onlyorigin')
    const f = anyMeasured('fixture')
    write(db, [f])
    const before = db.prepare('SELECT * FROM records').get() as Record<string, unknown>
    stamp(db)
    const after = db.prepare('SELECT * FROM records').get() as Record<string, unknown>
    for (const key of Object.keys(before)) {
      if (key === 'origin') continue
      expect(after[key], `${key} changed while the origin was being stamped`).toEqual(before[key])
    }
  })
})

// ============================================================================ what it refuses

describe('a row the measurement is not about', () => {
  it('is left NULL rather than being called authored', () => {
    // THE ONE THAT MATTERS. `authored` is the tempting default — it is what most rows are — and
    // writing it here would turn "nobody has looked" into "somebody judged this", in the direction
    // that makes fixture content read as real work.
    const db = fresh('unmeasured')
    write(db, [{ id: 'not-in-the-list', kind: 'note', title: 'a record written after the measurement' }])
    const report = stamp(db)
    expect(originOf(db, 'not-in-the-list')).toBeNull()
    expect(report.authored).toBe(0)
    expect(report.fixture).toBe(0)
    expect(report.unstamped).toBe(1)
    expect(report.notes.map((n) => n.kind)).toEqual(['not_measured'])
  })

  it('is reported by id, so an operator can see which rows nobody has recorded', () => {
    const db = fresh('reported')
    write(db, [{ id: 'unknown-1', kind: 'note', title: 'one' }])
    const report = stamp(db)
    expect(report.notes[0]?.recordId).toBe('unknown-1')
    expect(report.notes[0]?.detail).toContain('nobody')
  })

  it('does not have its origin guessed from a title that looks like seeded content', () => {
    // The title is word for word a measured FIXTURE row's title, on a row with a different id. If
    // anything anywhere matched on titles, this would come out `fixture`. Nothing does.
    const db = fresh('titleguess')
    const f = anyMeasured('fixture')
    write(db, [{ id: 'a-different-row', kind: f.kind, title: f.title }])
    stamp(db)
    expect(originOf(db, 'a-different-row')).toBeNull()
  })
})

describe('a measured id whose row is no longer the row that was measured', () => {
  it('is not stamped when the title has changed, and says so', () => {
    const db = fresh('retitled')
    const f = anyMeasured('fixture')
    write(db, [{ id: f.id, kind: f.kind, title: 'somebody renamed this record' }])
    const report = stamp(db)
    expect(originOf(db, f.id)).toBeNull()
    expect(report.notes.map((n) => n.kind)).toEqual(['title_changed'])
    expect(report.notes[0]?.detail).toContain(f.measuredTitle)
  })

  it('is not stamped when the kind has changed either', () => {
    const db = fresh('rekinded')
    const f = anyMeasured('fixture')
    const other = f.kind === 'note' ? 'task' : 'note'
    write(db, [{ id: f.id, kind: other, title: f.title }])
    const report = stamp(db)
    expect(originOf(db, f.id)).toBeNull()
    expect(report.notes.map((n) => n.kind)).toEqual(['kind_changed'])
  })
})

describe('a row that already carries an origin', () => {
  it('is left exactly as it is, which is what makes a restored archive safe', () => {
    // A restore brings the stamp back with the row. If this migration overwrote what it found, a
    // restore followed by a migration would silently replace a stamp that came out of the archive.
    const db = fresh('restored')
    const f = anyMeasured('fixture')
    write(db, [{ ...f, origin: 'authored' }])
    const report = stamp(db)
    expect(originOf(db, f.id)).toBe('authored')
    expect(report.alreadyStamped).toBe(1)
    expect(report.fixture).toBe(0)
  })

  it('gets its stamp back after a restore that could not carry it', () => {
    // DESTRUCTIVE-RESTORE COMPATIBILITY, WHICH DECISION 13 REQUIRES THIS MIGRATION TO PROVE.
    //
    // The archive does not carry `origin` yet — src/server/lib/export.ts has not been given the
    // column, and tests/export-format.test.ts is failing on exactly that — so a database rebuilt
    // from the archive alone comes back with every origin NULL. What saves such a database is a
    // measurement handed back in: it matches on record ids, which the archive does preserve, so
    // applying the same measurement twice puts every stamp back identically.
    //
    // THIS REPOSITORY NO LONGER HOLDS THE MEASUREMENT THAT WOULD DO THAT for the owner's corpus, and
    // it does not need to: `npm run db:backup` copies the database with the column in it, which is
    // the restore path anybody actually uses. The old measurement is kept in the owner's private data
    // repository under `data/inventories/` for a restore from an archive that predates the column.
    const db = fresh('afterrestore')
    const f = anyMeasured('fixture')
    const a = anyMeasured('authored')
    write(db, [f, a])
    stamp(db)
    const stamped = db.prepare('SELECT id, origin FROM records ORDER BY id').all()
    // What an import from an archive with no origin column produces.
    db.prepare('UPDATE records SET origin = NULL').run()
    stamp(db)
    expect(db.prepare('SELECT id, origin FROM records ORDER BY id').all()).toEqual(stamped)
  })

  it('is left alone even when the word is not one this product knows', () => {
    const db = fresh('unreadable')
    const f = anyMeasured('fixture')
    write(db, [{ ...f, origin: 'imported' }])
    const report = stamp(db)
    expect(originOf(db, f.id)).toBe('imported')
    expect(report.notes.map((n) => n.kind)).toEqual(['unreadable_origin'])
    // And every reader treats it as unstamped, because `readOrigin` will not invent a meaning.
    expect(readOrigin('imported')).toBeNull()
  })
})

// ============================================================================ running it twice

describe('running it twice', () => {
  it('stamps nothing the second time and reports that it had nothing to do', () => {
    const db = fresh('twice')
    write(db, [anyMeasured('fixture'), anyMeasured('authored'), { id: 'x', kind: 'note', title: 'unmeasured' }])
    const first = stamp(db)
    const rows = db.prepare('SELECT id, origin FROM records ORDER BY id').all()
    const second = stamp(db)
    expect(first.alreadyDone).toBe(false)
    expect(second.alreadyDone).toBe(true)
    expect(second.fixture).toBe(0)
    expect(second.authored).toBe(0)
    expect(second.alreadyStamped).toBe(2)
    expect(db.prepare('SELECT id, origin FROM records ORDER BY id').all()).toEqual(rows)
  })

  it('plans without writing when asked to, so an operator can look first', () => {
    const db = fresh('dryrun')
    const f = anyMeasured('fixture')
    write(db, [f])
    const report = stamp(db, { dryRun: true })
    expect(report.fixture).toBe(1)
    expect(originOf(db, f.id)).toBeNull()
  })
})

// ============================================================================ a database without the column

describe('a database that has not had migration 0005 applied', () => {
  it('is reported rather than crashed on, because migrating to an intermediate point is a real thing to do', () => {
    const db = fresh('nocolumn')
    db.prepare('DROP INDEX records_title_idx').run()
    // The one way to take a column off a SQLite table without rebuilding it is not to have it, so
    // this stands in for a database that stopped at 0004 rather than being one.
    db.exec('ALTER TABLE records DROP COLUMN origin')
    const report = stamp(db)
    expect(report.columnMissing).toBe(true)
    expect(report.fixture).toBe(0)
    expect(report.notes).toEqual([])
    expect(planOriginStamps(db, A_MEASUREMENT).stamps).toEqual([])
  })
})
