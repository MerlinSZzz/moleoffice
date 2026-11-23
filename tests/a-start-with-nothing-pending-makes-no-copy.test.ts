// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START WITH NOTHING PENDING MAKES NO COPY OF THE DATABASE, AND WRITES NOTHING TO IT.
 *
 * When the migration journal shows no migration pending, `prepareToServe` does not measure the data steps against a
 * copy. It runs every data step on the served file itself, inside one transaction that is always rolled back, and
 * judges from three things read inside that transaction: what each step reports, SQLite's count of changed rows
 * (`total_changes()`), and the schema version (`PRAGMA schema_version`). When a migration is pending, the copy is
 * made as before. This file holds:
 *
 *   1. a quiet start serves, and nothing appears beside the database while it checks, even with the copy forced to a
 *      file; no row and no schema moved; the report names the file and the rollback; the timing line names this
 *      path's parts and none of the copy's;
 *   2. a data step that finds work refuses with the line naming that step, and the row it would write is not written;
 *   3. a write no report names refuses as an unexplained write, whether it moves the count (a row) or the schema
 *      version (a table), and it is not written;
 *   4. the judging itself, branch by branch;
 *   5. a step that throws refuses, what the steps before it wrote is rolled back, and no transaction is left open;
 *   6. a pending migration still takes the copy, in the copy's words;
 *   7. a damaged file is still refused as damaged on this path;
 *   8. a step that ends the transaction the steps run in, and returns or throws, is refused with the sentence that
 *      says what it wrote may have been stored, and no transaction is left open;
 *   9. a step that asks `whenStored` to tell something once its write is stored is refused, whether it asks straight
 *      from the step or inside a transaction of its own, and what it asked for never runs, before or after.
 *
 * Cases 2 and 6 also read how the refusal says it measured (`update.measuredOn`): on this file, and on a copy. The
 * update page that says it is tested in tests/the-update-page-says-how-the-start-measured.test.ts.
 *
 * Every database here is a small made-up file in a test folder, built as the start-guard tests build theirs. A write
 * no report names is made through `THE_PREVIEW_SEAM.stepsOnThisFile`: the real steps, then one write of the test's own.
 *
 * Mutations it must go red for, one per new branch: the copy made anyway (cases 1 and 2); the path chosen without
 * reading the pending tags, so always on this file (case 6); the rollback left out (cases 1, 2 and 5); the count of
 * changed rows not read (cases 3 and 4); the schema version not read (cases 3 and 4); the integrity answer not waited
 * for after the rolled-back run (case 7, as long as no data step reads the damaged index and throws first, because a
 * throw is refused through a wait of its own); the refusal given one `measuredOn` on both paths (cases 2 and 6); the
 * open-transaction check left out after the steps return (case 8, "and returns"); the open-transaction check left out
 * when they throw (case 8, "and throws"); the `whenStored` refusal left out (case 9, both ways); the flag left set
 * after the run (case 9, both ways).
 */
import { closeSync, openSync, readdirSync, rmSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import {
  migrateInPlace,
  prepareToServe,
  THE_MIGRATIONS_CHECK_PARTS,
  THE_PREVIEW_SEAM,
  THE_ROLLED_BACK_RUN_ENDED,
  THE_STEPS,
  theCopyAsSaid,
  whatTheRolledBackRunWouldWrite,
  whereTheCopyGoes,
} from '../src/server/db/migrate.ts'
import { holdUntilStored, whenStored } from '../src/server/db/told-when-stored.ts'
import { theMigrationsCheckLine, theMigrationsCheckTiming, type MigrationsCheckTiming } from '../src/server/lib/start-steps.ts'
import { oneMigrationBehind } from './an-office-one-migration-behind.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
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
 * A fully migrated scratch database holding one authored record, with nothing left to migrate: the recipe of the
 * file-copy test's builder. With `behind`, it is migrated with drizzle/ less its newest migration, so that one is
 * pending.
 */
function aSettledDatabase(name: string, behind = false): Database.Database {
  const dir = aTestDatabaseFolder(`no-copy-${name}`)
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

/** The rows of every table in the file, by table name. */
function everyRowCount(db: Database.Database): Record<string, number> {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
  return Object.fromEntries(
    tables.map(({ name }) => [name, (db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n]),
  )
}

const schemaVersionOf = (db: Database.Database): number => db.pragma('schema_version', { simple: true }) as number

/** Counts the copies the copy path makes: its seam is the only way a copy is migrated. */
function countTheCopies(): { made: number } {
  const copies = { made: 0 }
  THE_PREVIEW_SEAM.migrate = (copy, folder, staged, timing) => {
    copies.made += 1
    return migrateInPlace(copy, folder, staged, timing)
  }
  return copies
}

/** Where `part` is said in the line, or -1. */
function whereSaid(line: string, part: string): number {
  return line.indexOf(`${part} `)
}

describe('a start with nothing pending', () => {
  it('1: serves, makes no copy and changes nothing, even with the copy forced to a file', () => {
    const db = aSettledDatabase('quiet')
    const home = dirname(db.name)
    // THE COPY WOULD BE A FILE IN A FOLDER BESIDE THE DATABASE, so a copy made anyway is seen in the folder.
    THE_PREVIEW_SEAM.inMemoryLimit = 0
    expect(whereTheCopyGoes(db)).toBe('file')
    const copies = countTheCopies()

    // THE FOLDER IS READ AT THE START AND END OF EVERY PART OF THE CHECK, so a copy made and removed inside it is seen.
    const there = new Set(readdirSync(home))
    const appeared = new Set<string>()
    const look = (): void => {
      for (const name of readdirSync(home)) if (!there.has(name)) appeared.add(name)
    }
    const timing = theMigrationsCheckTiming()
    const watching: MigrationsCheckTiming = {
      began(part) {
        look()
        timing.began(part)
      },
      ended(part) {
        look()
        timing.ended(part)
      },
      note: (said) => timing.note(said),
      line: () => timing.line(),
    }
    const rows = everyRowCount(db)
    const schema = schemaVersionOf(db)

    const decision = prepareToServe(db, MIGRATIONS, watching)
    look()

    expect(decision.serve, decision.serve ? '' : decision.refusal).toBe(true)
    expect(copies.made, 'a copy was migrated').toBe(0)
    expect([...appeared], 'something appeared beside the database during the check').toEqual([])
    expect(db.inTransaction, 'the check left a transaction open').toBe(false)
    expect(everyRowCount(db)).toEqual(rows)
    expect(schemaVersionOf(db)).toBe(schema)
    if (decision.serve) {
      expect(decision.report).toContain(`nothing to do for ${db.name}`)
      expect(decision.report).toContain('on this file itself, inside one transaction that was rolled back')
      expect(decision.report).toContain('no copy of it was made')
      expect(decision.report).not.toContain(theCopyAsSaid('file'))
      expect(decision.report).not.toContain(theCopyAsSaid('memory'))
    }

    // THE PARTS OF THIS PATH, in the order they begin, and every data step inside the rolled-back run.
    const line = theMigrationsCheckLine(timing)
    const parts = [
      THE_MIGRATIONS_CHECK_PARTS.theIntegrityStarted,
      THE_MIGRATIONS_CHECK_PARTS.thePendingRead,
      THE_MIGRATIONS_CHECK_PARTS.theLeftoversRemoved,
      THE_MIGRATIONS_CHECK_PARTS.theStepsRolledBack,
      THE_MIGRATIONS_CHECK_PARTS.theWriteLockTaken,
      THE_MIGRATIONS_CHECK_PARTS.theStartRead,
      THE_MIGRATIONS_CHECK_PARTS.theSchemaMigrationsApplied,
      THE_MIGRATIONS_CHECK_PARTS.theOutcomeReports,
      THE_MIGRATIONS_CHECK_PARTS.theIntegrityWaited,
    ]
    let before = -1
    for (const part of parts) {
      const at = whereSaid(line, part)
      expect(at, `${part} is not named in:\n${line}`).toBeGreaterThan(-1)
      expect(at, `${part} is named out of order in:\n${line}`).toBeGreaterThan(before)
      before = at
    }
    const ranAt = whereSaid(line, THE_MIGRATIONS_CHECK_PARTS.theStepsRolledBack)
    const reportsAt = whereSaid(line, THE_MIGRATIONS_CHECK_PARTS.theOutcomeReports)
    for (const step of THE_STEPS) {
      const at = whereSaid(line, step.name)
      expect(at, `${step.name} is not inside the rolled-back run in:\n${line}`).toBeGreaterThan(ranAt)
      expect(at, `${step.name} is not inside the rolled-back run in:\n${line}`).toBeLessThan(reportsAt)
    }
    for (const part of [
      THE_MIGRATIONS_CHECK_PARTS.theCopyHeldInMemory,
      THE_MIGRATIONS_CHECK_PARTS.theFileCopied,
      THE_MIGRATIONS_CHECK_PARTS.theCopyMigrated,
      THE_MIGRATIONS_CHECK_PARTS.theFirstFingerprint,
      THE_MIGRATIONS_CHECK_PARTS.theSecondFingerprint,
    ]) {
      expect(whereSaid(line, part), `${part} is a part of the copy, and no copy was made:\n${line}`).toBe(-1)
    }
  })

  it('2: refuses when a data step finds work, names the step, and writes nothing', () => {
    const db = aSettledDatabase('a-step-finds-work')
    // A WRITE THE REVISIONS STEP REPORTS: a record rewritten with no revision kept is a catch-up it names.
    db.prepare("UPDATE records SET summary = 'a summary nothing kept a revision for' WHERE id = 'note-1'").run()
    THE_PREVIEW_SEAM.inMemoryLimit = 0
    const copies = countTheCopies()
    const rows = everyRowCount(db)
    const schema = schemaVersionOf(db)
    const revisionsOfTheNote = (): number =>
      (db.prepare("SELECT count(*) AS n FROM revisions WHERE record_id = 'note-1'").get() as { n: number }).n
    const revisionsBefore = revisionsOfTheNote()

    const decision = prepareToServe(db, MIGRATIONS)

    expect(decision.serve).toBe(false)
    if (!decision.serve) {
      expect(decision.refusal).toContain('REFUSING TO SERVE')
      expect(decision.refusal).toContain('\n  - revisions: ')
      expect(decision.refusal).not.toContain('none of the')
      expect(decision.refusal).toContain('on this file itself, inside one transaction that was rolled back')
      expect(decision.refusal).not.toContain(theCopyAsSaid('file'))
      expect(decision.update?.wouldWrite.some((line) => line.startsWith('revisions:'))).toBe(true)
      expect(decision.update?.measuredOn, 'the refusal says how it measured').toBe('this file')
    }
    expect(copies.made, 'a copy was migrated').toBe(0)
    expect(db.inTransaction, 'the check left a transaction open').toBe(false)
    expect(revisionsOfTheNote(), 'the catch-up revision was written').toBe(revisionsBefore)
    expect(everyRowCount(db)).toEqual(rows)
    expect(schemaVersionOf(db)).toBe(schema)
    expect(db.prepare("SELECT summary FROM records WHERE id = 'note-1'").get()).toEqual({
      summary: 'a summary nothing kept a revision for',
    })
  })

  it.each([
    {
      what: 'a row, which moves the count of changed rows',
      write: (sqlite: Database.Database): void => {
        sqlite
          .prepare("INSERT INTO outside_reads (id, at_ms, source, what, wanted, verdict) VALUES ('r1', 1, 's', 'w', 'x', 'v')")
          .run()
      },
      moved: 'changed row',
    },
    {
      what: 'a table, which moves the schema version',
      write: (sqlite: Database.Database): void => {
        sqlite.exec('CREATE TABLE a_table_no_report_names (x INTEGER)')
      },
      moved: 'schema version',
    },
  ])('3: refuses a write no report names, $what, as unexplained, and writes nothing', ({ write, moved }) => {
    const db = aSettledDatabase(`unexplained-${moved.replace(' ', '-')}`)
    const theRealSteps = AS_SHIPPED.stepsOnThisFile
    THE_PREVIEW_SEAM.stepsOnThisFile = (sqlite, migrations, staged, timing) => {
      const steps = theRealSteps(sqlite, migrations, staged, timing)
      write(sqlite)
      return steps
    }
    const copies = countTheCopies()
    const rows = everyRowCount(db)
    const schema = schemaVersionOf(db)

    const decision = prepareToServe(db, MIGRATIONS)

    expect(decision.serve).toBe(false)
    if (!decision.serve) {
      expect(decision.refusal).toContain(`write something none of the ${String(THE_STEPS.length)} migration reports names`)
      expect(decision.refusal).toContain(moved)
      expect(decision.refusal).not.toContain(theCopyAsSaid('memory'))
    }
    expect(copies.made, 'a copy was migrated').toBe(0)
    expect(db.inTransaction, 'the check left a transaction open').toBe(false)
    expect(everyRowCount(db)).toEqual(rows)
    expect(schemaVersionOf(db)).toBe(schema)
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'a_table_no_report_names'").get()).toEqual({ n: 0 })
  })

  it('5: refuses when a step throws, rolls back what the steps before it wrote, and leaves no transaction open', () => {
    const db = aSettledDatabase('a-step-throws')
    // A RECORD WITH NO REVISION: the revisions step, which runs before the dispatch step, writes its baseline.
    db.prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
        "VALUES ('note-2', 'default', 'owner-1', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'note', 'A second invented note', NULL, '{}', 'authored')",
    ).run()
    // A MESSAGE PAST QUEUED WITH NO MOMENT, which the dispatch step refuses, as in
    // tests/no-door-arms-the-start-up-gate.test.ts.
    db.prepare(
      'INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) ' +
        "VALUES ('th-undatable', 'default', 'Round six', 'direct', 'open', '2026-08-20 09:00:00', '2026-08-20 09:00:00', " +
        `'human:${THE_TEST_OFFICES_OWNER.id}')`,
    ).run()
    db.prepare(
      'INSERT INTO agent_messages (id, thread_id, position, role, intent, body, state, created_at, created_by) ' +
        "VALUES ('m-undatable', 'th-undatable', 1, 'agent', 'discuss', 'Trial 4.', 'sent', '2026-08-20 10:00:00', 'agent:one')",
    ).run()
    const baselinesOfTheSecondNote = (): number =>
      (db.prepare("SELECT count(*) AS n FROM revisions WHERE record_id = 'note-2'").get() as { n: number }).n
    // WHAT THE STEPS HAD WRITTEN WHEN ONE THREW, read inside the transaction before it is rolled back.
    let writtenWhenItThrew: number | null = null
    const theRealSteps = AS_SHIPPED.stepsOnThisFile
    THE_PREVIEW_SEAM.stepsOnThisFile = (sqlite, migrations, staged, timing) => {
      try {
        return theRealSteps(sqlite, migrations, staged, timing)
      } catch (refusal) {
        writtenWhenItThrew = baselinesOfTheSecondNote()
        throw refusal
      }
    }
    const copies = countTheCopies()
    const rows = everyRowCount(db)
    const schema = schemaVersionOf(db)

    const decision = prepareToServe(db, MIGRATIONS)

    expect(decision.serve).toBe(false)
    if (!decision.serve) {
      expect(decision.refusal).toContain('m-undatable')
      expect(decision.refusal).toContain('NO ROW HAS BEEN CHANGED')
      expect(decision.refusal).toContain('on this file itself')
      expect(decision.refusal).not.toContain(theCopyAsSaid('memory'))
    }
    expect(writtenWhenItThrew, 'the revisions step had written nothing before the dispatch step threw').toBe(1)
    expect(copies.made, 'a copy was migrated').toBe(0)
    expect(db.inTransaction, 'the check left a transaction open').toBe(false)
    expect(baselinesOfTheSecondNote(), 'the baseline revision was written').toBe(0)
    expect(everyRowCount(db)).toEqual(rows)
    expect(schemaVersionOf(db)).toBe(schema)
  })

  it('7: refuses a damaged file as damaged, and makes no copy of it', () => {
    const db = aSettledDatabase('damaged')
    // ENOUGH RECORDS TO FILL PAGES, in rollback-journal mode so every page is in the main file, as in
    // tests/the-integrity-check-runs-beside-the-preview.test.ts.
    const add = db.prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
        "VALUES (?, 'default', 'owner-1', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'note', ?, NULL, '{}', 'authored')",
    )
    db.transaction(() => {
      for (let i = 0; i < 400; i++) add.run(`note-${String(i + 10)}`, `An invented note with a title long enough to fill pages ${String(i)}`)
    })()
    migrateInPlace(db, MIGRATIONS)
    db.pragma('journal_mode = DELETE')
    const file = db.name
    const root = (db.prepare("SELECT rootpage FROM sqlite_master WHERE name = 'records_title_idx'").get() as { rootpage: number }).rootpage
    const pageSize = db.pragma('page_size', { simple: true }) as number
    db.close()
    // ZEROS OVER THE CELLS OF THE INDEX'S ROOT PAGE, past its header: the table is whole, the index is not.
    const fd = openSync(file, 'r+')
    writeSync(fd, Buffer.alloc(pageSize - 200), 0, pageSize - 200, (root - 1) * pageSize + 200)
    closeSync(fd)

    const damaged = new Database(file)
    damaged.pragma('foreign_keys = ON')
    scratch.push({ dir: dirname(file), db: damaged })
    const copies = countTheCopies()
    const decision = prepareToServe(damaged, MIGRATIONS)
    expect(decision.serve).toBe(false)
    if (!decision.serve) expect(decision.refusal).toContain('DAMAGED')
    expect(copies.made, 'a copy was migrated').toBe(0)
    expect(damaged.inTransaction, 'the check left a transaction open').toBe(false)
  })

  it.each([
    { how: 'and returns', after: (): void => {} },
    {
      how: 'and throws',
      after: (): void => {
        throw new Error('A made-up step failed after it ended the transaction, for this test.')
      },
    },
  ])('8: refuses when a step ends the transaction $how, says what it wrote may be stored, and leaves none open', ({ how, after }) => {
    const db = aSettledDatabase(`a-step-ends-the-run-${how.replace(' ', '-')}`)
    const theRealSteps = AS_SHIPPED.stepsOnThisFile
    // THE REAL STEPS, THEN A ROW OF THE TEST'S OWN, THEN COMMIT: the transaction the check would roll back is ended.
    THE_PREVIEW_SEAM.stepsOnThisFile = (sqlite, migrations, staged, timing) => {
      const steps = theRealSteps(sqlite, migrations, staged, timing)
      sqlite
        .prepare("INSERT INTO outside_reads (id, at_ms, source, what, wanted, verdict) VALUES ('r-ended', 1, 's', 'w', 'x', 'v')")
        .run()
      sqlite.exec('COMMIT')
      after()
      return steps
    }
    const copies = countTheCopies()

    const decision = prepareToServe(db, MIGRATIONS)

    expect(decision.serve).toBe(false)
    if (!decision.serve) {
      expect(decision.refusal).toContain('REFUSING TO SERVE')
      expect(decision.refusal).toContain(THE_ROLLED_BACK_RUN_ENDED)
      expect(decision.refusal, 'the refusal says nothing was changed, and a row was').not.toContain('NO ROW HAS BEEN CHANGED')
      expect(decision.update, 'an update is offered for a file whose state the check cannot tell').toBeUndefined()
      if (how === 'and throws') expect(decision.refusal).toContain('A made-up step failed after it ended the transaction')
    }
    expect(copies.made, 'a copy was migrated').toBe(0)
    expect(db.inTransaction, 'the check left a transaction open').toBe(false)
    // WHAT THE SENTENCE WARNS OF HAPPENED: the row written before the COMMIT is in the file.
    expect(db.prepare("SELECT count(*) AS n FROM outside_reads WHERE id = 'r-ended'").get()).toEqual({ n: 1 })
  })

  it.each([
    { where: 'straight from the step', inside: false },
    { where: "inside a transaction of the step's own", inside: true },
  ])('9: refuses when a step asks whenStored $where, and what it asked for never runs', ({ where, inside }) => {
    const db = aSettledDatabase(`a-step-asks-when-stored-${inside ? 'inside' : 'straight'}`)
    // THE SERVED HANDLE HOLDS `whenStored` STEPS UNTIL ITS OUTERMOST COMMIT (db/client.ts), so this one does too.
    holdUntilStored(db)
    const theRealSteps = AS_SHIPPED.stepsOnThisFile
    let ran = 0
    // WHAT `whenStored` SAID WHEN IT REFUSED, read from its own throw, so the refusal is checked for it.
    let said: string | null = null
    THE_PREVIEW_SEAM.stepsOnThisFile = (sqlite, migrations, staged, timing) => {
      const steps = theRealSteps(sqlite, migrations, staged, timing)
      const ask = (): void => {
        try {
          whenStored(() => {
            ran += 1
          })
        } catch (refusal) {
          said = refusal instanceof Error ? refusal.message : String(refusal)
          throw refusal
        }
      }
      if (inside) sqlite.transaction(ask)()
      else ask()
      return steps
    }
    const rows = everyRowCount(db)
    const schema = schemaVersionOf(db)

    const decision = prepareToServe(db, MIGRATIONS)

    expect(ran, `what the step asked for ran during the check, asked ${where}`).toBe(0)
    expect(decision.serve).toBe(false)
    const refused = said as string | null
    expect(refused, 'whenStored did not refuse').not.toBeNull()
    if (!decision.serve && refused !== null) expect(decision.refusal).toContain(refused)
    expect(db.inTransaction, 'the check left a transaction open').toBe(false)
    expect(everyRowCount(db)).toEqual(rows)
    expect(schemaVersionOf(db)).toBe(schema)
    // AFTER THE REFUSAL: a commit on the handle runs nothing that was held, and `whenStored` runs a step at once again.
    db.transaction(() => {})()
    expect(ran, 'what the step asked for ran after the check').toBe(0)
    let afterwards = 0
    whenStored(() => {
      afterwards += 1
    })
    expect(afterwards, 'whenStored still refuses after the check').toBe(1)
  })
})

describe('a start with a migration pending', () => {
  it('6: still measures against a copy, in the copy’s words, and writes nothing', () => {
    const db = aSettledDatabase('pending', true)
    const copies = countTheCopies()
    let onThisFile = 0
    THE_PREVIEW_SEAM.stepsOnThisFile = (sqlite, migrations, staged, timing) => {
      onThisFile += 1
      return AS_SHIPPED.stepsOnThisFile(sqlite, migrations, staged, timing)
    }
    const journal = (): number => (db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }).n
    const journaled = journal()

    const decision = prepareToServe(db, MIGRATIONS)

    expect(decision.serve).toBe(false)
    if (!decision.serve) {
      expect(decision.refusal).toContain('apply 1 schema migration that has not run against this database')
      expect(decision.refusal).toContain(`measured by running the real migrations against ${theCopyAsSaid('memory')}`)
      expect(decision.refusal).not.toContain('inside one transaction that was rolled back')
      expect(decision.update?.measuredOn, 'the refusal says how it measured').toBe('a copy')
    }
    expect(copies.made).toBe(1)
    expect(onThisFile, 'the steps ran on the file with a migration pending').toBe(0)
    expect(journal(), 'the pending migration was journaled').toBe(journaled)
    expect(db.inTransaction).toBe(false)
  })
})

describe('the judging of a rolled-back run, branch by branch', () => {
  const still = { before: 5, after: 5 }
  const aStepsLine = 'revisions: write 1 CATCH-UP revision'

  it('serves when no step reports a write and neither count moved', () => {
    expect(whatTheRolledBackRunWouldWrite([], still, still)).toEqual([])
  })

  it("refuses with the steps' own lines when a step reports a write, whether or not the counts moved", () => {
    expect(whatTheRolledBackRunWouldWrite([aStepsLine], still, still)).toEqual([aStepsLine])
    expect(whatTheRolledBackRunWouldWrite([aStepsLine], { before: 5, after: 7 }, { before: 3, after: 4 })).toEqual([aStepsLine])
  })

  it('refuses as unexplained when the count of changed rows moved with every report at 0', () => {
    const said = whatTheRolledBackRunWouldWrite([], { before: 5, after: 7 }, still)
    expect(said).toHaveLength(1)
    expect(said[0]).toContain(`write something none of the ${String(THE_STEPS.length)} migration reports names`)
    expect(said[0]).toContain('2 changed rows')
    expect(said[0]).not.toContain('schema version')
  })

  it('refuses as unexplained when the schema version moved with every report at 0', () => {
    const said = whatTheRolledBackRunWouldWrite([], still, { before: 3, after: 4 })
    expect(said).toHaveLength(1)
    expect(said[0]).toContain(`write something none of the ${String(THE_STEPS.length)} migration reports names`)
    expect(said[0]).toContain('schema version went from 3 to 4')
    expect(said[0]).not.toContain('changed row')
  })

  it('names both when both moved', () => {
    const said = whatTheRolledBackRunWouldWrite([], { before: 5, after: 6 }, { before: 3, after: 4 })
    expect(said).toHaveLength(1)
    expect(said[0]).toContain('1 changed row')
    expect(said[0]).toContain('schema version went from 3 to 4')
  })
})
