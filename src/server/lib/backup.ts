// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TAKING ONE VERIFIED BACKUP, AS A LIBRARY. `npm run db:backup` (scripts/backup.ts) and an installed
 * office's update press (src/server/lib/the-update.ts) both take their backup with `takeTheBackup` here.
 * It lives under src/ because the server imports it, and server code never imports from scripts/: an
 * installed office and a copy of src/ alone have no scripts/ folder (merge entry IUQuMNx9QpOE). What a
 * backup carries, and why, is written in the head of scripts/backup.ts, which prints what this hands back.
 * Importing this file opens nothing.
 */

import { registryAliasesAreRequired, readRegistryAliases } from './registry-aliases/index.ts'
import Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import {
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { REPO_ROOT, settingWasSet, THE_BACKUP_THREAD_ENTRY, THE_INSTALL, THE_THREAD_BUNDLES } from '../../config/settings.mjs'
import {
  THE_MIGRATION_JOURNAL_TABLE,
  theDatabaseBehindTheCode,
  theMigrationsInTheFolder,
  theMigrationsNotYetApplied,
} from '../../config/migration-look.mjs'
import { BACKUP_FILES_LINE_BYTES, filesFolderOf, leftOutListOf } from '../../shared/what-is-kept.ts'
import { localStamp } from '../../shared/time.ts'
import { bytesUnder } from './bytes-under.ts'
import { readCompleteBackups, whatMadeTheBackup, type BackupMaker } from './complete-backups.ts'
// WHERE AN UPLOADED PICTURE LIVES, from the one place that names it. Importing it opens nothing.
import { AVATAR_DIRECTORY } from '../../shared/participants.ts'
// WHERE THE RESIDENTS' PERSONAL SPACES ARE; importing this opens nothing.
import { PERSONAL_SPACE_DIRECTORY } from '../../shared/residents.ts'
// WHICH TABLES A BACKUP HAS TO CARRY, AND WHICH IT MUST NOT, IS THE SCHEMA'S ANSWER. Importing
// db/schema.ts opens nothing.
import { AUTHORED_TABLES, LEFT_OUT_OF_BACKUPS_AND_EXPORTS, NOT_CARRIED_TABLES } from '../db/schema.ts'
// EVERY TABLE A SCHEMA PART DECLARES, read from the declarations themselves. Importing it opens nothing.
import { everyPartTable } from '../db/every-part-table.ts'
// HOW A COPY IS EMPTIED AND SEARCHED, written once for every program that copies the file.
import {
  COLUMNS_A_COPY_CLEARS,
  emptyAndScrub,
  hashesLeftAfterAtMostOneRewrite,
  keyHashesACopyIsSearchedFor,
  valuesNotCleared,
} from '../../config/what-a-copy-must-not-carry.mjs'

/** How many differing tables to name before summarising. Enough to see the pattern. */
const SHOW_TABLES = 8

/** Every table in a database with the number of rows in it. The comparison this verifies by. */
export function tableCounts(db: Database.Database): Map<string, number> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[]
  const counts = new Map<string, number>()
  for (const { name } of tables) {
    // The name comes from sqlite_master, so it is an existing identifier rather than input; quoted
    // anyway, because a table called `order` would otherwise be a syntax error rather than a count.
    const row = db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }
    counts.set(name, row.n)
  }
  return counts
}

/** What a verification found. `problems` empty means the file is a usable Mole Office database. */
export interface Verification {
  file: string
  bytes: number
  counts: Map<string, number>
  problems: string[]
  /**
   * Authored tables and schema-part tables absent from this file that its own migration journal says
   * it has had, in the schema's own order.
   *
   * SEPARATE FROM `problems` ON PURPOSE. A file lacking tables can be intact and still be a
   * Mole Office database from an older schema. The comparison, rather than the schema alone,
   * decides whether an absence is lost work: before a migration the source lacks the tables too
   * (problem EmrByGikzsr-). `--check-only` refuses a table the compared database holds; the copy
   * path keeps a faithful copy of an old source. Deleting it would destroy the backup taken
   * immediately BEFORE migrating. scripts/rewrite-a-backup.ts also preserves old schemas.
   */
  missing: string[]
  /**
   * Schema-part tables absent from this file whose creating migration its own migration journal does
   * not record as applied, in the order the parts declare them.
   *
   * A FILE THAT PREDATES THESE IS NOT MISSING WORK IT ONCE HELD. It is a backup made before the
   * table existed, such as the one the update press takes immediately before the migration that
   * creates it. The file records this in its own `__drizzle_migrations` table: the creating
   * migration's row is absent. The file's date is not read, and an absent table alone is not
   * enough — a current database with one table dropped also lacks the table, but its journal
   * records the migration that created it, so that file is missing the table and is named so.
   */
  predates: string[]
  /**
   * Why this file's own migration journal could not be read, or null when it was read.
   *
   * WHEN IT COULD NOT BE READ, NOBODY RECORDED WHICH MIGRATIONS THIS FILE TOOK. Its absent
   * schema-part tables are named in `missing` instead of `predates`, and the comparison with a
   * database decides between a table it lost and one that was never created. Absence is not
   * evidence that the file predates a table, so this is never added to `problems`: it is a
   * question the comparison can still answer, not a fault in the file.
   */
  journalUnreadable: string | null
}

/** One migration the code has, as the migrator's own reader describes it. */
type FolderMigration = ReturnType<typeof theMigrationsInTheFolder>[number]

/** One row of a database's own migration journal, as the migrator writes it. */
interface MigrationRow {
  hash: string
  created_at: number | string
}

/** Whether one statement of a migration creates `table`, quoted or bare as the migrations write it. */
function createsTable(statement: string, table: string): boolean {
  const match =
    /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))/i.exec(
      statement,
    )
  if (match === null) return false
  return (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5]) === table
}

/**
 * WHAT AN ABSENT SCHEMA-PART TABLE MEANS, read from the file's own record of its schema.
 *
 * The parts declare every table; `everyPartTable()` is the only list read. For each one the file
 * lacks, the migration that creates it is found in the code's migrations, and the file's own
 * `__drizzle_migrations` table says whether that migration was applied. Applied and absent is a
 * table the file has lost; not applied is a table that did not exist when the file was made.
 *
 * A JOURNAL THAT CANNOT BE READ IS NOT A JOURNAL THAT RECORDS NONE: nobody recorded which
 * migrations the file took. Its absent part tables are named missing and the comparison decides
 * between lost and not yet created. The file's date is never read, and absence alone never decides.
 */
function whatAbsentPartTablesMean(
  db: Database.Database,
  counts: ReadonlyMap<string, number>,
): { missing: string[]; predates: string[]; problem: string | null; journalUnreadable: string | null } {
  const absent = everyPartTable()
    .filter((part) => !counts.has(part.name))
    .map((part) => part.name)
  if (absent.length === 0) return { missing: [], predates: [], problem: null, journalUnreadable: null }
  let migrations: FolderMigration[]
  try {
    migrations = theMigrationsInTheFolder(join(REPO_ROOT, 'drizzle'))
  } catch (err) {
    return {
      missing: absent,
      predates: [],
      journalUnreadable: null,
      problem:
        `the migrations that say which schema part tables this file should have could not be read ` +
        `(${(err as Error).message}), so an absent schema part table could not be told apart from one the file predates`,
    }
  }
  let rows: MigrationRow[]
  try {
    rows = db.prepare(`SELECT hash, created_at FROM ${THE_MIGRATION_JOURNAL_TABLE}`).all() as MigrationRow[]
  } catch (err) {
    return {
      missing: absent,
      predates: [],
      problem: null,
      journalUnreadable: (err as Error).message,
    }
  }
  const notYetApplied = new Set(theMigrationsNotYetApplied(rows, migrations).map((migration) => migration.tag))
  const missing: string[] = []
  const predates: string[] = []
  for (const name of absent) {
    const creating = migrations.find((migration) => migration.sql.some((statement) => createsTable(statement, name)))
    if (creating !== undefined && notYetApplied.has(creating.tag)) predates.push(name)
    else missing.push(name)
  }
  return { missing, predates, problem: null, journalUnreadable: null }
}

/**
 * Open a file and ask it the questions a backup has to answer yes to.
 *
 * Read-only, so verifying can never be the thing that changes what it is verifying — and so this
 * works against a file whose directory is not writable.
 */
export function verify(file: string, how: { keyMaterialIsAProblem: boolean } = { keyMaterialIsAProblem: true }): Verification {
  const problems: string[] = []
  const missing: string[] = []
  const predates: string[] = []
  let journalUnreadable: string | null = null
  let counts = new Map<string, number>()
  let bytes = 0
  try {
    bytes = statSync(file).size
  } catch {
    return { file, bytes: 0, counts, problems: [`there is no file at ${file}`], missing, predates, journalUnreadable }
  }
  // A zero-byte file is a valid empty SQLite database as far as SQLite is concerned, and Mole Office
  // will happily build all twelve tables inside one — so restoring a zero-byte backup gives you a
  // working, empty Mole Office. Measured on 2026-08-12. It is caught here by size, before that can start.
  if (bytes === 0) {
    return {
      file,
      bytes,
      counts,
      problems: ['the file is EMPTY (0 bytes). It is not a database, damaged or otherwise.'],
      missing,
      predates,
      journalUnreadable,
    }
  }

  let db: Database.Database
  try {
    db = new Database(file, { readonly: true, fileMustExist: true })
  } catch (err) {
    return {
      file,
      bytes,
      counts,
      problems: [`it could not be opened as a database: ${(err as Error).message}`],
      missing,
      predates,
      journalUnreadable,
    }
  }
  try {
    // The check can THROW rather than answer, on a file damaged badly enough that SQLite cannot
    // walk it — which is the case this command exists for. Catching it is the difference between
    // "SQLite says it is DAMAGED" and a stack trace out of node_modules.
    try {
      const check = db.pragma('integrity_check') as { integrity_check: string }[]
      if (check.length !== 1 || check[0]?.integrity_check !== 'ok') {
        problems.push(
          `SQLite says it is DAMAGED: ${check
            .map((r) => r.integrity_check)
            .slice(0, 3)
            .join('; ')}`,
        )
      }
    } catch (err) {
      problems.push(`SQLite could not even finish checking it: ${(err as Error).message}`)
    }
    // Counting can throw for the same reason, and a file that cannot be counted is not a backup.
    try {
      counts = tableCounts(db)
    } catch (err) {
      problems.push(`its tables could not be read: ${(err as Error).message}`)
      return { file, bytes, counts, problems, missing, predates, journalUnreadable }
    }
    // Mole Office's own marks. A backup that opens cleanly and holds a stranger's tables is not a backup
    // of this product, and the likeliest cause is a `--to` or a `MOLE_OFFICE_DB` pointing somewhere else.
    if (!counts.has('records')) {
      problems.push(
        `it has no \`records\` table, so it is not a Mole Office database — it holds ${counts.size} table` +
          `${counts.size === 1 ? '' : 's'}${counts.size === 0 ? '' : `: ${[...counts.keys()].slice(0, SHOW_TABLES).join(', ')}`}`,
      )
    } else {
      // EVERY AUTHORED TABLE, READ FROM db/schema.ts, and it asked for `records` alone until
      // 2026-08-12. Measured that day: every backup in data/backups/ was taken before some part of
      // the planning layer existed, six of the eight before any of it, and `--check-only` called
      // each one "a usable Mole Office database" and exited 0. That matters because the refusal in
      // db/migrate.ts — printed at the moment somebody's database is found damaged — tells them to
      // check their most recent backup and put it in place, so following Mole Office's own instruction
      // restored a database with no plan in it while the verifier said it was fine.
      //
      // AUTHORED ONLY. A missing DERIVED table is a stale index that `POST /api/source/reindex`
      // rebuilds, so naming it here would put noise beside the tables whose absence is lost work.
      for (const table of AUTHORED_TABLES) if (!counts.has(table)) missing.push(table)
      // AND EVERY TABLE A SCHEMA PART DECLARES, from the declarations rather than a list here. A
      // part table absent from a file whose own journal says it took the creating migration is
      // missing work; one whose journal does not say so is a table the file predates.
      const parts = whatAbsentPartTablesMean(db, counts)
      for (const table of parts.missing) missing.push(table)
      for (const table of parts.predates) predates.push(table)
      if (parts.problem !== null) problems.push(parts.problem)
      if (parts.journalUnreadable !== null) journalUnreadable = parts.journalUnreadable
    }
    // THE ALIASES ARE CHECKED AGAINST THE `agents` TABLE, so a file without that table is not asked about them. It is
    // named above as missing the table, with what restoring it costs. A problem here would call a faithful old copy
    // damaged, and a copy that fails verification is deleted.
    if (!missing.includes('agents')) {
      try {
        if (registryAliasesAreRequired(db)) readRegistryAliases(db)
      } catch(error) {
        problems.push(`The backup's permanent registry aliases could not be verified: ${(error as Error).message}`)
      }
    }
    // THE TABLES A COPY MUST NOT CARRY, COUNTED RATHER THAN ASSUMED ABSENT. `held_keys` is not in
    // AUTHORED_TABLES, so the authored check above and an export both leave it out — but a copy of
    // the whole file (`VACUUM INTO`, an online backup or `cp`) carries it. This is the reading that
    // catches one, and it is why a file that carries key hashes is not called a usable backup. A
    // file that predates the table has none, which is a skip and not a row count of zero.
    //
    // `how.keyMaterialIsAProblem` is false only for scripts/rewrite-a-backup.ts reading a backup it is
    // about to rewrite: that file is expected to carry them, and the rewrite is what takes them out.
    for (const table of how.keyMaterialIsAProblem ? NOT_CARRIED_TABLES : []) {
      const rows = counts.get(table)
      if (rows !== undefined && rows > 0) {
        problems.push(
          `it carries ${rows} key hash${rows === 1 ? '' : 'es'} in \`${table}\`, and a backup must carry no key ` +
            `hash. A copy, a backup and an export carry no key; restoring this ` +
            `file would put them back.`,
        )
      }
    }
    // AND NO VISITOR TOKEN HASH, by a decision. A value that
    // does not start with REMOVED_MARK
    // is one the file still carries.
    const tokens = how.keyMaterialIsAProblem ? valuesNotCleared(db) : 0
    if (tokens > 0) {
      const where = COLUMNS_A_COPY_CLEARS.map((c) => `${c.table}.${c.column}`).join(', ')
      problems.push(
        `it carries ${tokens} visitor token hash${tokens === 1 ? '' : 'es'} in \`${where}\`, and ` +
          `a backup carries none; restoring this file would bring back visitors ended after it was made.`,
      )
    }
  } finally {
    db.close()
  }
  return { file, bytes, counts, problems, missing, predates, journalUnreadable }
}

/** The comparison and its verdict, shared by both CLI paths and both report formats. */
export interface Comparison {
  comparedWith: { database: string | null; reason: string | null; sameDatabase: boolean }
  missingTables: string[]
  /** The tables of `missingTables` that a schema part declares, read from the declarations. */
  missingPartTables: string[]
  missingTableRows: Record<string, number | null>
  missingTableRowsUnknownReason?: Record<string, string>
  notYetCreatedTables: string[]
  /**
   * Schema-part tables this file predates, from its own migration journal. A file that is only older
   * than a part table is not failed and is not deleted.
   */
  predatesPartTables: string[]
  /** Why the checked file's own migration journal could not be read, or null when it was read. */
  journalUnreadable: string | null
  /** Schema-part tables the checked file lacks, whether because it lost them or because it predates them. */
  absentPartTables: string[]
  /**
   * The name of what this comparison found: `usable`; `older-than-part-tables` when the file predates
   * only schema-part tables; `missing-tables` when it lacks a table the compared database holds; or
   * `not-usable` when it has a problem.
   */
  verdict: 'usable' | 'older-than-part-tables' | 'missing-tables' | 'not-usable'
  pendingMigrations: string[] | null
  pendingMigrationsUnknownReason: string | null
  ok: boolean
}

/** Name the migrations a migration run would apply, by the one rule the migrator itself asks (src/config/migration-look.mjs). */
function pendingMigrations(database: string): Pick<Comparison, 'pendingMigrations' | 'pendingMigrationsUnknownReason'> {
  // The install's root holds drizzle/ in a checkout and in a bundle. Inside a bundle this file's own
  // place is the bundle's file, so the root is read from settings.mjs and not from `import.meta.url`.
  const reading = theDatabaseBehindTheCode({ database, checkout: REPO_ROOT })
  if ('unreadable' in reading) {
    return { pendingMigrations: null, pendingMigrationsUnknownReason: reading.unreadable }
  }
  return { pendingMigrations: reading.missing, pendingMigrationsUnknownReason: null }
}

/**
 * A BACKUP IS COMPARED WITH THE DATABASE THAT EXISTS, not the schema waiting to be applied.
 * Problem EmrByGikzsr-: comparing with schema alone rejected faithful pre-migration backups.
 * The office's own database is 1.5 GB: integrity_check and counts of every table take minutes of
 * reading and hold a long read transaction on a live file. Its integrity is not this command's
 * question; check that file with `--check-only <that file>`. Here we open it read-only, require
 * it to exist, read table names, and count only tables the checked file lacks. Never client.ts.
 * Copying already counted the source and reuses those counts. If the comparison cannot be opened
 * or has no `records` table, explicitly fall back to the schema.
 */
export function compareWithDatabase(found: Verification, database: string, sourceCounts?: Map<string, number>): Comparison {
  let tables = sourceCounts === undefined ? undefined : new Set(sourceCounts.keys())
  const counts = new Map<string, number | null>()
  const unknownReasons: Record<string, string> = {}
  let reason: string | null = null
  let db: Database.Database | undefined
  try {
    if (sourceCounts === undefined) {
      try {
        db = new Database(database, { readonly: true, fileMustExist: true })
        const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
        if (names.some(({ name }) => name === 'records')) tables = new Set(names.map(({ name }) => name))
        else reason = `the database at ${database} could not be used for comparison: it has no \`records\` table, so it is not a Mole Office database`
      } catch (err) {
        reason = `the database at ${database} could not be used for comparison: ` +
          (existsSync(database) ? `it could not be opened or its table names read: ${(err as Error).message}` : `there is no file at ${database}`)
      }
    }
    for (const table of found.missing) {
      if (!tables?.has(table)) continue
      try {
        // Names come from sqlite_master; quote them as identifiers anyway.
        const rows = sourceCounts?.get(table) ?? (db!.prepare(`SELECT count(*) AS n FROM "${table.replaceAll('"', '""')}"`).get() as { n: number }).n
        counts.set(table, rows)
      } catch (err) {
        // The table is still absent from the checked file. Unreadable comparison data makes
        // only its row count unknown, not its existence or the refusal (problem EmrByGikzsr-).
        counts.set(table, null)
        unknownReasons[table] = (err as Error).message.replace(/\s+/g, ' ').trim()
      }
    }
  } finally {
    db?.close()
  }
  const missingTables = found.missing.filter((table) => tables === undefined || tables.has(table))
  const notYetCreatedTables = found.missing.filter((table) => tables !== undefined && !tables.has(table))
  const parts = everyPartTable()
  const partTables = new Set(parts.map((part) => part.name))
  const absentPartTables = parts.filter((part) => !found.counts.has(part.name)).map((part) => part.name)
  const missingPartTables = missingTables.filter((table) => partTables.has(table))
  const predatesPartTables = found.predates.filter((table) => partTables.has(table))
  const verdict: Comparison['verdict'] =
    found.problems.length > 0
      ? 'not-usable'
      : missingTables.length > 0
        ? 'missing-tables'
        : predatesPartTables.length > 0
          ? 'older-than-part-tables'
          : 'usable'
  return {
    comparedWith: {
      database: tables === undefined ? null : database,
      reason,
      sameDatabase: tables !== undefined && existsSync(found.file) && realpathSync(found.file) === realpathSync(database),
    },
    missingTables,
    missingPartTables,
    missingTableRows: Object.fromEntries(counts),
    ...(Object.keys(unknownReasons).length > 0 ? { missingTableRowsUnknownReason: unknownReasons } : {}),
    notYetCreatedTables,
    predatesPartTables,
    journalUnreadable: found.journalUnreadable,
    absentPartTables,
    verdict,
    ...(tables === undefined
      ? { pendingMigrations: null, pendingMigrationsUnknownReason: reason }
      : pendingMigrations(database)),
    ok: found.problems.length === 0 && missingTables.length === 0,
  }
}

/**
 * DELETE EVERY ROW FROM THE TABLES A COPY MUST NOT CARRY, ON A HANDLE OPENED ON `copyPath`, OVERWRITING
 * WHAT IT DELETES WHERE IT LAY, SO THE DELETED ROWS ARE NOT LEFT IN THE FILE'S FREE SPACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SECOND CONNECTION, AND WHY IT CANNOT ADDRESS THE OFFICE
 * ---------------------------------------------------------------------------------------
 *
 * The handle below is `new Database(copyPath, { fileMustExist: true })`, and the only path handed to
 * this function is the copy `VACUUM INTO` just wrote in the folder of work in progress. It
 * is a connection of its own on that file. That folder is new, made by `mkdtempSync`, so the copy's
 * path is never the source's, and a statement made here cannot reach the office's own database. The source handle above is a different file opened
 * `readonly: true`. The test in `tests/a-backup-carries-no-key-hashes.test.ts` proves it: after the
 * backup the office still holds every key hash it held and a key that worked still does, and the
 * mutation that opens this handle on the source turns those cases red.
 *
 * A SOURCE THAT PREDATES THE TABLE IS NOT AN ERROR. An old database has no `held_keys`, so there is
 * nothing to empty and the check skips it — and the copy still carries no hash.
 *
 * THE SAME STEP CLEARS THE VISITOR TOKEN HASHES, and answers how many rows it
 * cleared, so the report can say it.
 *
 * THE EMPTYING IS `emptyAndScrub` in src/config/what-a-copy-must-not-carry.mjs, the one function the test
 * world's copy and tools/accept.mjs call as well. It overwrites what it takes out with zeros where it lay and
 * does not rewrite the file: the copy was made with `VACUUM INTO`, and the byte search after it decides whether
 * one rewrite is needed (`hashesLeftAfterAtMostOneRewrite`).
 */
function emptyTheTablesACopyMustNotCarry(copyPath: string): {
  cleared: { table: string; column: string; rows: number }[]
  leftOut: Record<string, number>
} {
  const copy = new Database(copyPath, { fileMustExist: true })
  try {
    const cleared = emptyAndScrub(copy)
    // THE TABLES NO BACKUP CARRIES, emptied after `emptyAndScrub` has set this handle to overwrite what it
    // deletes. A copy that predates a table has nothing to empty and names none.
    const leftOut: Record<string, number> = {}
    for (const table of LEFT_OUT_OF_BACKUPS_AND_EXPORTS) {
      const there = copy.prepare("SELECT 1 AS one FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
      if (there !== undefined) leftOut[table] = copy.prepare(`DELETE FROM "${table}"`).run().changes
    }
    return { cleared, leftOut }
  } finally {
    copy.close()
  }
}

/**
 * Remove a copy that must not be kept, and the write-ahead log and shared-memory sidecars it may
 * have left beside it. A `.db` alone is half of a SQLite database in WAL mode, and a sidecar left
 * behind is a second, half-file somebody finds later with the same name.
 */
function deleteTheCopy(file: string): void {
  rmSync(file, { force: true })
  rmSync(`${file}-wal`, { force: true })
  rmSync(`${file}-shm`, { force: true })
}

/**
 * THE THREE FOLDERS BESIDE THE DATABASE WHOSE FILES A BACKUP CARRIES.
 *
 * The first two are the same names as `REPORT_FILE_DIRECTORY` in src/server/lib/reportfiles.ts and
 * `MESSAGE_PICTURE_DIRECTORY` in src/server/lib/messagepictures.ts. They are written again here
 * because importing either module imports the database client, which opens the database for
 * writing, and this command may only read it. tests/backup.test.ts places its files with those two
 * constants, so it fails if the names here drift from them. The third is `AVATAR_DIRECTORY` itself,
 * imported, because src/shared/participants.ts opens nothing.
 */
export const FOLDERS_A_BACKUP_CARRIES = ['report-files', 'message-pictures', AVATAR_DIRECTORY] as const

/**
 * THE FOLDERS A BACKUP CARRIES ALWAYS, OUTSIDE THE LINE: the residents' personal spaces, at answer 2 of the
 * proposal GsGFiDygATd5. Their bytes are never counted against the line, and they are
 * copied
 * when the three folders above are left out.
 */
export const FOLDERS_A_BACKUP_ALWAYS_CARRIES = [PERSONAL_SPACE_DIRECTORY] as const

/** One file under one of the folders: its path from the database's folder, and its size. */
interface FileBesideTheDatabase {
  path: string
  bytes: number
  atime: Date
  mtime: Date
}

/** What happened to the files beside the database, including a partial carry. */
export interface FilesCarried {
  /**
   * The three folders: all carried, linked files carried with new files left out, or all left out.
   * `none there` means none of the four folders exists, spaces included. Spaces are always copied.
   */
  outcome: 'copied' | 'carried with new files left out' | 'left out' | 'none there'
  /** The line in bytes this run compared against. */
  line: number
  /** Each of the three folders: whether it exists, and how many files and bytes are under it. */
  folders: { name: string; present: boolean; files: number; bytes: number }[]
  /** Files and bytes in the three folders; only newBytes is compared with the line. */
  files: number
  bytes: number
  /** Each folder always copied whole, outside the line. */
  always: { name: string; present: boolean; files: number; bytes: number }[]
  /** The earlier database whose complete files folder was used, or null when none was found. */
  linkedFrom: string | null
  linked: number
  linkedBytes: number
  copied: number
  copiedBytes: number
  leftOut: number
  leftOutBytes: number
  /** Bytes planned for new copies before anything is written, measured against line. */
  newBytes: number
  /** Extra bytes copied because a planned link failed; these can take writes over the line. */
  bytesWrittenBeyondPlan: number
  /** Copies made because linking was refused with EXDEV or EPERM. */
  copiedBecauseLinkFailed: number
  /** File contents written by copying, spaces included; hard links write no file contents. */
  bytesWritten: number
  /** The folder holding carried files or spaces, including any present empty folders. */
  copiedTo: string | null
  /** The list of the files left out, when they were. */
  leftOutList: string | null
}

/**
 * EVERY ORDINARY FILE UNDER A FOLDER, WITH ITS SIZE, READ ONCE.
 *
 * The copy then copies exactly this list, so the count and bytes the report prints are the ones
 * copied. The office stores only ordinary files here, so anything else — a link, a device — is a
 * broken assumption, and it stops the files copy with its path rather than being skipped quietly.
 */
function filesUnder(folder: string, databaseDirectory: string): FileBesideTheDatabase[] {
  const found: FileBesideTheDatabase[] = []
  for (const name of readdirSync(folder).sort()) {
    const at = join(folder, name)
    const stat = lstatSync(at)
    if (stat.isDirectory()) found.push(...filesUnder(at, databaseDirectory))
    else if (stat.isFile()) found.push({ path: relative(databaseDirectory, at), bytes: stat.size, atime: stat.atime, mtime: stat.mtime })
    else throw new Error(`${at} is not an ordinary file or folder, and a backup does not know how to copy it`)
  }
  return found
}

/**
 * Problem 9AwaBTTDUh6H: reuse the newest published backup's files instead of writing them
 * again. A complete files folder has its ordinary .db beside it. Read only the destination's top
 * level, never .<name>.being-made-<random>/, and exclude this backup and its work path. The database's
 * modification time orders both mole-office-<stamp>.db and the arbitrary --to <name>.db names.
 */
function previousBackupWithFiles(copy: string, madeAt: string): string | null {
  const directory = dirname(copy)
  if (!existsSync(directory)) return null
  const candidates: { copy: string; mtime: number }[] = []
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.db')) continue
    const earlier = join(directory, name)
    if (resolve(earlier) === resolve(copy) || resolve(earlier) === resolve(madeAt)) continue
    const db = lstatSync(earlier)
    const folder = filesFolderOf(earlier)
    if (!db.isFile() || !existsSync(folder) || !lstatSync(folder).isDirectory()) continue
    candidates.push({ copy: earlier, mtime: db.mtimeMs })
  }
  candidates.sort((a, b) => b.mtime - a.mtime || b.copy.localeCompare(a.copy))
  return candidates[0]?.copy ?? null
}

/**
 * LINK OR COPY THE THREE FOLDERS UNDER THE NEW-BYTE LINE; ALWAYS COPY THE PERSONAL SPACES.
 *
 * `line` is `BACKUP_FILES_LINE_BYTES` when the command runs; a test hands in a smaller one so it can
 * cross the line without writing 10 GiB. The command has no option or variable that changes it.
 *
 * `copy` is the backup's name: the list names it. `madeAt` is where the database copy is while it is
 * being made, and the folder or the list is written beside that path. `main` passes the path inside
 * its folder of work in progress and moves both out once everything is written. Without `madeAt` they
 * are written beside `copy`, which is what tests/backup.test.ts calls it with.
 *
 * On a failure part-way it removes what it made and throws, so the caller never keeps half a copy.
 * It never touches a files folder or list it did not make: `main` refuses to start when either
 * already exists beside the backup's name, and its folder of work in progress is new.
 */
export function carryTheFiles(
  databaseDirectory: string,
  copy: string,
  line: number,
  madeAt: string = copy,
  makeLink: typeof linkSync = linkSync,
  deviceOf: (path: string) => number = (path) => statSync(path).dev,
): FilesCarried {
  const read = (name: string): { name: string; present: boolean; found: FileBesideTheDatabase[] } => {
    const at = join(databaseDirectory, name)
    const present = existsSync(at)
    const found = present ? filesUnder(at, databaseDirectory) : []
    return { name, present, found }
  }
  const counted = (folder: { name: string; present: boolean; found: FileBesideTheDatabase[] }) => ({
    name: folder.name,
    present: folder.present,
    files: folder.found.length,
    bytes: folder.found.reduce((sum, one) => sum + one.bytes, 0),
  })
  const folders = FOLDERS_A_BACKUP_CARRIES.map(read)
  // Spaces are always copied, never linked or counted against the line. A space file may be
  // replaced: src/server/lib/residents.ts moves old bytes into .versions/ and writes the same
  // path again, so path, size and modification time are a weaker rule than for reports written
  // once. No live office has personal-spaces/ yet, so copying costs nothing today. So (phy_2-RsmVz5):
  // linking spaces, after comparing their bytes, waits until spaces exist and grow.
  const always = FOLDERS_A_BACKUP_ALWAYS_CARRIES.map(read)
  const all = folders.flatMap((folder) => folder.found)
  const bytes = all.reduce((sum, one) => sum + one.bytes, 0)
  const said = {
    line,
    folders: folders.map(counted),
    files: all.length,
    bytes,
    always: always.map(counted),
    linkedFrom: null as string | null,
    linked: 0,
    linkedBytes: 0,
    copied: 0,
    copiedBytes: 0,
    leftOut: 0,
    leftOutBytes: 0,
    newBytes: 0,
    bytesWrittenBeyondPlan: 0,
    copiedBecauseLinkFailed: 0,
    bytesWritten: 0,
  }

  if (folders.every((folder) => !folder.present) && always.every((folder) => !folder.present)) {
    return { outcome: 'none there', ...said, copiedTo: null, leftOutList: null }
  }

  const into = filesFolderOf(madeAt)
  said.linkedFrom = previousBackupWithFiles(copy, madeAt)
  // The new folder does not exist yet. Its nearest existing parent supplies its st_dev without
  // writing anything. main's work folder is already on the destination's device.
  let parent = dirname(into)
  while (!existsSync(parent)) parent = dirname(parent)
  const sameDevice = said.linkedFrom !== null &&
    deviceOf(filesFolderOf(said.linkedFrom)) === deviceOf(parent)
  const plan = all.map((one) => {
    const earlier = sameDevice ? join(filesFolderOf(said.linkedFrom!), one.path) : null
    const held = earlier !== null && existsSync(earlier) ? lstatSync(earlier) : null
    // Report files are named by id and written once; the server neither deletes nor rewrites
    // them. Path, size and modification time decide unchanged files, as rsync's default does.
    // Compare Date times at the same millisecond precision that utimesSync restores below.
    const unchanged = held?.isFile() && held.size === one.bytes && held.mtime.getTime() === one.mtime.getTime()
    return { one, earlier: unchanged ? earlier : null }
  })
  const newFiles = plan.filter(({ earlier }) => earlier === null)
  said.newBytes = newFiles.reduce((sum, { one }) => sum + one.bytes, 0)
  const overLine = said.newBytes > line
  const carried = overLine ? plan.filter(({ earlier }) => earlier !== null) : plan
  const list = overLine ? leftOutListOf(madeAt) : null
  const spaceFiles = always.flatMap((folder) => folder.found)
  const hasFilesFolder = !overLine || carried.length > 0 || always.some((folder) => folder.present)
  try {
    if (!overLine || carried.length > 0) {
      for (const folder of folders) {
        if (folder.present) mkdirSync(join(into, folder.name), { recursive: true })
      }
    }
    for (const { one, earlier } of carried) {
      const destination = join(into, one.path)
      mkdirSync(dirname(destination), { recursive: true })
      if (earlier !== null) {
        try {
          makeLink(earlier, destination)
          said.linked++
          said.linkedBytes += one.bytes
          continue
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code
          if (code !== 'EXDEV' && code !== 'EPERM') throw err
          // A rare refusal writes extra bytes beyond the plan, even when that exceeds the line.
          said.copiedBecauseLinkFailed++
          said.bytesWrittenBeyondPlan += one.bytes
        }
      }
      copyFileSync(join(databaseDirectory, one.path), destination)
      utimesSync(destination, one.atime, one.mtime)
      said.copied++
      said.copiedBytes += one.bytes
      said.bytesWritten += one.bytes
    }
    for (const folder of always) {
      if (folder.present) mkdirSync(join(into, folder.name), { recursive: true })
    }
    for (const one of spaceFiles) {
      const destination = join(into, one.path)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(join(databaseDirectory, one.path), destination)
      said.bytesWritten += one.bytes
    }
    // Check every file carried, including spaces, before publication. YBUxSiGdDrB_ decides which new
    // files are left out, under a decision. A failed files copy still takes its
    // database copy with it.
    for (const one of [...carried.map(({ one }) => one), ...spaceFiles]) {
      const destination = join(into, one.path)
      const got = lstatSync(destination)
      if (!got.isFile() || got.size !== one.bytes) {
        throw new Error(`${destination} does not have its source's size of ${String(one.bytes)} bytes`)
      }
    }
    if (list !== null) {
      said.leftOut = newFiles.length
      said.leftOutBytes = said.newBytes
      writeFileSync(
        list,
        `The new files beside ${databaseDirectory} that the backup ${copy} does not hold.\n` +
          `Their new bytes total ${String(said.newBytes)} bytes, over the line of ${String(line)} bytes` +
          `, so none of the new files was copied.\n` +
          `Files planned for linking are still carried; linked files count nothing against the line.\n` +
          `The residents' personal spaces are not on this list: every backup carries them, outside the line.\n` +
          `Each line is the size in bytes, then the path from that folder.\n\n` +
          newFiles.map(({ one }) => `${String(one.bytes)}\t${one.path}`).join('\n') + '\n',
      )
    }
  } catch (err) {
    if (hasFilesFolder) rmSync(into, { recursive: true, force: true })
    if (list !== null) rmSync(list, { force: true })
    throw err
  }
  return {
    // Problem -ZJxLg3DoiJM: over the line, every planned carry is here, linked or copied when its
    // link was refused; any other failure threw above, and the size check proved each file. So the
    // outcome is whether any carry was planned, not whether a link was made. Personal spaces do
    // not decide the three folders' outcome.
    outcome: overLine ? (carried.length > 0 ? 'carried with new files left out' : 'left out') : 'copied',
    ...said,
    copiedTo: hasFilesFolder ? into : null,
    leftOutList: list,
  }
}

/** How a backup was taken, for the report. */
export interface Taken {
  source: string
  tookMs: number
  moved: string[]
  carried: FilesCarried | null
  /** How many key hashes of the source were looked for in the copy's bytes, none of them found. */
  keyHashesSearched: number
  /** How many rows of each cleared column the copy cleared, from `emptyAndScrub`. */
  cleared: { table: string; column: string; rows: number }[]
  /** Whether the byte search found a hash after the emptying, so the copy was rewritten once with `VACUUM INTO`. */
  rewrittenAfterTheSearch: boolean
  /** How many rows of each table no backup carries the copy had, and no longer has. */
  leftOut: Record<string, number>
}

/**
 * THE COPY ITSELF: `VACUUM INTO` from the source, opened read only, in a thread of its own.
 *
 * `VACUUM INTO` writes what the source holds now into new pages, so nothing the source deleted, and nothing
 * left in its free pages, reaches the copy; the online backup this replaces copied every page as it was
 * (see the note at the top of src/config/what-a-copy-must-not-carry.mjs). It reads the source in one read
 * transaction, as the online backup did, so a server writing meanwhile is not held.
 *
 * IN A THREAD because better-sqlite3 runs `VACUUM INTO` in one call that holds its thread until the copy is
 * written, about 15 seconds for the office's 3.6 GB, and an installed office takes this backup inside its own
 * server (the update press, src/server/lib/the-update.ts), which must go on answering its page meanwhile. The
 * online backup handed the thread back between its steps; this thread does the same for the whole copy.
 */
const VACUUM_INTO_IN_ITS_OWN_THREAD = `
const { parentPort, workerData } = require('node:worker_threads')
const Database = require(workerData.driver)
const db = new Database(workerData.source, { readonly: true, fileMustExist: true })
try { db.prepare('VACUUM INTO ?').run(workerData.target) } finally { db.close() }
parentPort.postMessage('written')
`
const THE_DRIVER = createRequire(import.meta.url).resolve('better-sqlite3')

function copiedWithVacuumInto(source: string, target: string): Promise<void> {
  return new Promise((done, failed) => {
    // NONE OF THE PARENT'S OPTIONS: a worker takes its parent's by default, and a parent started with
    // `--input-type=module` (as `node -e` callers of this library are) would read the code above as a module, where
    // `require` does not exist. The code is plain CommonJS and needs no loader.
    const thread = new Worker(VACUUM_INTO_IN_ITS_OWN_THREAD, { eval: true, execArgv: [], workerData: { driver: THE_DRIVER, source, target } })
    let written = false
    thread.once('message', () => { written = true })
    thread.once('error', failed)
    thread.once('exit', (code) => (written && code === 0 ? done() : failed(new Error(`the copying thread stopped (exit ${String(code)}) before the copy was written`))))
  })
}

/** What `takeTheBackup` did: a verified backup at its own name, or why there is none, in words. */
export type TakenBackup =
  | { taken: true; found: Verification; comparison: Comparison; how: Taken }
  /** `said` holds no command. `command` is the command line's own next step, which the command prints after it. */
  | { taken: false; said: string; command?: string }

/**
 * TAKE ONE VERIFIED BACKUP of `source` at `target`: the copy path of `npm run db:backup`, which calls it
 * and prints what it hands back. It prints nothing itself, so an installed office's update press
 * (src/server/lib/the-update.ts) takes its backup with this same code and says the result in its own
 * page. Every failure deletes what it made and says so; nothing is ever left at `target` unverified.
 */
export async function takeTheBackup(source: string, target: string, databaseOnly: boolean): Promise<TakenBackup> {
  // THE FILES FOLDER AND THE LEFT-OUT LIST ARE THIS BACKUP'S OWN. With one already there, this run
  // would mix its files into it, or delete it on a failure. Refused before anything is written. A
  // copy of the database alone writes neither, so it has nothing to refuse here.
  for (const beside of databaseOnly ? [] : [filesFolderOf(target), leftOutListOf(target)]) {
    if (existsSync(beside)) {
      return { taken: false, said: `backup: ${beside} already exists. This backup would write its files there and mix them with ` +
          `what is there now. Nothing was written.`, command: 'Name another destination with --to.' }
    }
  }
  const databaseDirectory = dirname(source)

  let db: Database.Database
  try {
    db = new Database(source, { readonly: true, fileMustExist: true })
  } catch (err) {
    return { taken: false, said: `backup: there is nothing to back up at ${source} (${(err as Error).message}). ` +
        `That is the file MOLE_OFFICE_DB names${settingWasSet('MOLE_OFFICE_DB') ? '' : ' by default'}.` }
  }

  /**
   * COUNT THE SOURCE ON BOTH SIDES OF THE COPY, so the comparison below can be exact when it can be.
   *
   * The copy takes hundredths of a second and usually nothing writes during it, in which case the
   * backup must match the source row for row and anything else is a failure. If the source DID move
   * — a server writing while the backup ran — then a snapshot taken somewhere in the middle is
   * correct, and the honest check is that every count lands between the two readings. Comparing
   * against one reading only would report a false failure on a busy database, which is exactly when
   * somebody most needs to believe the answer.
   */
  const before = tableCounts(db)
  // THE KEY HASHES THE COPY IS SEARCHED FOR, read on both sides of the copy for the same reason as
  // the counts: a key made or ended while the copy ran is in one reading or the other. The visitors'
  // token hashes are among them, because the copy clears those too. They stay in memory, and only
  // their number is ever printed.
  const keyHashes = keyHashesACopyIsSearchedFor(db)
  /**
   * THE COPY IS MADE IN A FOLDER OF WORK IN PROGRESS, AND IS AT ITS OWN NAME ONLY WHEN IT IS GOOD.
   *
   * `VACUUM INTO` copies every row, `held_keys` included, so for a moment the copy holds every key hash the
   * office holds. Until 26 September 2026 that moment was at `target` itself: a
   * command killed between the write and the end of the rewrite left, at the backup's own name, a file
   * holding every key hash and looking like a backup. So the copy is written to
   * `.<name>.being-made-<random>/<name>` beside `target`, emptied, searched (and rewritten once when the search finds something) and verified
   * there, and its files folder or left-out list is written there too. Only then is each one renamed
   * to its place beside `target`. The folder is in the same directory as `target`, so each rename is on
   * one file system and happens at once or not at all.
   *
   * NOTHING THAT READS THE BACKUPS FOLDER TAKES THE FOLDER OF WORK IN PROGRESS FOR A BACKUP. The panel
   * (`readTheBackupsFolder` in src/server/lib/what-is-kept.ts) counts ordinary files and `.files`
   * folders, and scripts/prune-backups.ts counts files that start with SQLite's header. Both read only
   * the top of the folder. This is a folder whose name does not end in `.files`, so the panel leaves
   * it out and the prune leaves it alone. A file beside the backups, whatever its name, would be
   * counted by both, which is why the copy is not made under a second file name.
   *
   * ANY FAILURE REMOVES THE WHOLE FOLDER OF WORK IN PROGRESS, and the `finally` below removes it on
   * every other way out as well. A command killed outright runs no code at all, so it leaves that
   * folder behind, key hashes and all, and leaves nothing at `target`.
   *
   * THE DATABASE IS RENAMED FIRST AND ITS FILES SECOND. A command killed between the two renames
   * leaves a backup at `target` without its files folder or list, and never a files folder or list
   * beside a name that holds no database.
   */
  mkdirSync(dirname(target), { recursive: true })
  let work: string
  try {
    work = mkdtempSync(join(dirname(target), `.${basename(target)}.being-made-`))
  } catch (err) {
    db.close()
    return { taken: false, said: `backup: the folder to make the copy in could not be made beside ${target}: ${(err as Error).message}. ` +
        `Nothing was written to ${target}.` }
  }
  const made = join(work, basename(target))
  /** Remove the folder of work in progress and everything in it. The failures below call it before they speak. */
  const throwAwayTheWork = (): void => rmSync(work, { recursive: true, force: true })
  try {
    const startedAt = Date.now()
    try {
      await copiedWithVacuumInto(source, made)
    } catch (err) {
      throwAwayTheWork()
      db.close()
      return { taken: false, said: `backup: SQLite could not write the copy to ${made}: ${(err as Error).message}. ` +
          `Nothing was written to ${target}.` }
    }
    const tookMs = Date.now() - startedAt
    const after = tableCounts(db)
    keyHashesACopyIsSearchedFor(db, keyHashes)
    db.close()

    /**
     * THE COPY IS OF THE WHOLE FILE, SO IT CARRIES EVERY TABLE — `held_keys` INCLUDED. A copy, a
     * backup and an export carry no key. The export leaves the table out
     * because it is not authored. `VACUUM INTO` copies every table, so the copy is emptied here, on its own
     * path in the folder of work in progress, BEFORE it is given the backup's name.
     *
     * FAILS CLOSED. A backup carrying key hashes nobody knows about is worse than no backup, because
     * it will be trusted and moved. A copy that cannot be emptied is DELETED with the
     * folder it is in, and the command exits non-zero naming what happened.
     */
    let cleared: { table: string; column: string; rows: number }[]
    let leftOut: Record<string, number>
    try {
      ;({ cleared, leftOut } = emptyTheTablesACopyMustNotCarry(made))
    } catch (err) {
      throwAwayTheWork()
      return { taken: false, said: `backup: the copy of ${source} was written to ${made} but could NOT be emptied of key hashes, ` +
          `so it has been DELETED. Nothing was written to ${target}. Nothing was backed up.\n\n` +
          `  - ${(err as Error).message}\n\n` +
          `The office's own database was only read; it is unchanged and still holds every key it held.` }
    }

    /**
     * AND NO KEY HASH OF THE SOURCE IS ANYWHERE IN THE COPY'S BYTES. The rows are gone and what they held was
     * overwritten, and this is the reading that says the result is what it should be. When it finds a hash, the
     * copy is rewritten once with `VACUUM INTO`, which leaves nothing deleted behind, and searched again; only
     * what the second search finds fails the backup. It also catches a
     * key hash the source holds somewhere other than `held_keys`, for example pasted into a record,
     * and a visitor token hash the clearing missed. FAILS CLOSED like the step above. The message
     * gives a count and never a hash.
     */
    let left: number
    let rewrittenAfterTheSearch: boolean
    try {
      ;({ left, rewritten: rewrittenAfterTheSearch } = hashesLeftAfterAtMostOneRewrite(made, keyHashes, (file) => new Database(file, { readonly: true, fileMustExist: true })))
    } catch (err) {
      throwAwayTheWork()
      return { taken: false, said: `backup: the copy of ${source} could NOT be searched for key hashes or rewritten, so it has been DELETED. ` +
          `Nothing was written to ${target}. Nothing was backed up.\n\n  - ${(err as Error).message}\n\n` +
          `The office's own database was only read; it is unchanged and still holds every key it held.` }
    }
    if (left > 0) {
      throwAwayTheWork()
      const searched = keyHashes.size
      return { taken: false, said: `backup: the copy of ${source} was emptied of key hashes and rewritten once with VACUUM INTO, but ${left} of the ` +
          `${searched} key hash${searched === 1 ? '' : 'es'} it searched for ${left === 1 ? 'is' : 'are'} ` +
          `still in the copy's bytes, so it has been DELETED. Nothing was written to ${target}. Nothing was backed up.\n\n` +
          `The rewrite leaves no deleted row in the file, so each one found is in a row the copy holds, outside ` +
          `\`${NOT_CARRIED_TABLES.join(', ')}\`.\n\n` +
          `The office's own database was only read; it is unchanged and still holds every key it held.` }
    }

    const found = verify(made)
    const notCarried = new Set<string>(NOT_CARRIED_TABLES)
    const leftOutTables = new Set<string>(LEFT_OUT_OF_BACKUPS_AND_EXPORTS)
    const moved: string[] = []
    for (const table of new Set([...before.keys(), ...after.keys(), ...found.counts.keys()])) {
      // THE TABLES A COPY MUST NOT CARRY ARE DELIBERATELY NOT IN THE COPY, so comparing their counts
      // against the source would report every backup as a failure. `verify` is what checks them: it
      // refuses a file that holds a row in one of them.
      if (notCarried.has(table)) continue
      // AND THE TABLES NO BACKUP CARRIES are in the copy with no row. More
      // than none is a problem, because the emptying above did not happen.
      if (leftOutTables.has(table)) {
        const got = found.counts.get(table) ?? 0
        if (got > 0) found.problems.push(`\`${table}\`: the copy holds ${got} row${got === 1 ? '' : 's'}, and no backup carries this table`)
        continue
      }
      const lo = Math.min(before.get(table) ?? 0, after.get(table) ?? 0)
      const hi = Math.max(before.get(table) ?? 0, after.get(table) ?? 0)
      const got = found.counts.get(table)
      if (got === undefined) {
        found.problems.push(`the copy has no \`${table}\` table and the source has one`)
      } else if (got < lo || got > hi) {
        found.problems.push(
          `\`${table}\`: the copy holds ${got} rows, the source held ${lo === hi ? `${lo}` : `${lo}–${hi}`}`,
        )
      } else if (lo !== hi) {
        moved.push(`${table} ${lo}→${hi}`)
      }
    }
    // ONLY THE .db IS MOVED TO THE BACKUP'S NAME. The read-only check above leaves an empty write-ahead
    // log beside the copy (measured 26 September 2026), and it stays in the folder of work in progress.
    // A log holding anything would be part of the copy that the move leaves behind, so it is a problem.
    const log = `${made}-wal`
    if (existsSync(log) && statSync(log).size > 0) {
      found.problems.push(`the copy's write-ahead log holds ${String(statSync(log).size)} bytes, so the .db file alone is not the whole copy`)
    }

    if (found.problems.length > 0) {
      // DELETED, not kept with a warning. A file in data/backups/ with a plausible name is a file
      // somebody will restore from in a hurry a year from now, and whatever this run printed will be
      // long gone from the terminal.
      throwAwayTheWork()
      return { taken: false, said: `backup: the copy of ${source} FAILED verification and has been DELETED. Nothing was written to ${target}. ` +
          `Nothing was backed up.\n\n` +
          found.problems.map((p) => `  - ${p}`).join('\n') +
          `\n\nThe source itself was only read; it is unchanged.`,
        command: `If the source is the damaged one, \`npm run db:backup -- --check-only ${source}\` says so directly.` }
    }

    // THE FILES, ONLY NOW THAT THE DATABASE COPY IS KNOWN GOOD, written beside it in the folder of work
    // in progress. A failure here deletes the database copy as well, so the backups folder never holds
    // a copy that looks whole and lacks its files. --database-only asks for the database alone, so the
    // files are neither copied nor listed, and the report says that in its own words rather than
    // calling them absent.
    let carried: FilesCarried | null = null
    try {
      if (!databaseOnly) carried = carryTheFiles(databaseDirectory, target, BACKUP_FILES_LINE_BYTES, made)
    } catch (err) {
      throwAwayTheWork()
      return { taken: false, said: `backup: the database copy was made and verified, but the files beside the database could NOT be ` +
          `copied, so the database copy has been DELETED as well. Nothing was written to ${target}. ` +
          `Nothing was backed up.\n\n` +
          `  - ${(err as Error).message}\n\n` +
          `The database and the files beside it were only read; they are unchanged.` }
    }

    // THE MOVES. The database first, then its files folder and/or its list.
    try {
      renameSync(made, target)
    } catch (err) {
      throwAwayTheWork()
      return { taken: false, said: `backup: the copy was made and verified, but it could NOT be moved to ${target}, so it has been DELETED. ` +
          `Nothing was backed up.\n\n  - ${(err as Error).message}` }
    }
    if (carried !== null) {
      // Over the line, linked files and/or spaces publish alongside the new-file left-out list. If either move
      // fails, remove any already-published companion as well as the database.
      const companions = [
        { from: carried.copiedTo, to: filesFolderOf(target), what: 'files folder' },
        { from: carried.leftOutList, to: leftOutListOf(target), what: 'list of files left out' },
      ]
      const movedCompanions: string[] = []
      for (const { from, to, what } of companions) {
        if (from === null) continue
        try {
          renameSync(from, to)
          movedCompanions.push(to)
        } catch (err) {
          for (const moved of movedCompanions) rmSync(moved, { recursive: true, force: true })
          deleteTheCopy(target)
          throwAwayTheWork()
          return { taken: false, said: `backup: the database copy was moved to ${target}, but its ${what} ` +
              `could NOT be moved to ${to}, so the database copy has been DELETED as well. Nothing was backed up.\n\n` +
              `  - ${(err as Error).message}` }
        }
      }
      carried = {
        ...carried,
        copiedTo: carried.copiedTo === null ? null : filesFolderOf(target),
        leftOutList: carried.leftOutList === null ? null : leftOutListOf(target),
      }
    }

    return {
      taken: true,
      found: { ...found, file: target },
      comparison: compareWithDatabase(found, source, after),
      how: { source, tookMs, moved, carried, keyHashesSearched: keyHashes.size, cleared, rewrittenAfterTheSearch, leftOut },
    }
  } finally {
    throwAwayTheWork()
  }
}

/**
 * THE SAME BACKUP IN A THREAD OF ITS OWN, for a server that must go on answering while it is taken: the backup door,
 * src/server/api/backups.ts. After the copy, `takeTheBackup` empties the copy, searches its bytes, verifies it and
 * carries the files on the thread that called it. Each of those reads or writes the whole backup, so a server that
 * called it on its own thread would answer nobody until the backup was done.
 *
 * The thread is backup-thread.ts, which calls `takeTheBackup` above, so nothing of it is copied. Loading it took 1.4
 * seconds when it was measured on 8 November 2026.
 *
 * FROM A BUNDLE the thread's own bundled file, which is plain JavaScript and needs no loader, and from a checkout
 * tsx's loader by its file, as the attention thread is started (attention-thread.ts says why). Tsx is looked for only
 * when a backup is taken from a checkout, never when this file is loaded: a bundle carries no tsx, and when this file
 * looked for it as it loaded, an installed office did not start at all (wave 13q round 71's refusal).
 */
/** The `workerData` key that tells backup-thread.ts it is the backup's thread, and holds what to take. */
export const THE_BACKUP_THREAD = 'theBackupThread'
export interface TakeTheBackupAsk { source: string; target: string; databaseOnly: boolean }

export function takeTheBackupInItsOwnThread(source: string, target: string, databaseOnly: boolean): Promise<TakenBackup> {
  return new Promise((done, failed) => {
    const workerData = { [THE_BACKUP_THREAD]: { source, target, databaseOnly } satisfies TakeTheBackupAsk }
    const thread =
      THE_INSTALL.from === 'bundle'
        ? new Worker(join(REPO_ROOT, THE_THREAD_BUNDLES[THE_BACKUP_THREAD_ENTRY]), { execArgv: [], workerData })
        : new Worker(pathToFileURL(join(REPO_ROOT, THE_BACKUP_THREAD_ENTRY)), {
            execArgv: ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href],
            workerData,
          })
    let answer: { taken: TakenBackup } | { failed: string } | null = null
    thread.once('message', (message: { taken: TakenBackup } | { failed: string }) => { answer = message })
    thread.once('error', failed)
    thread.once('exit', (code) => {
      const said = answer as { taken: TakenBackup } | { failed: string } | null
      if (said !== null && 'taken' in said) done(said.taken)
      else failed(new Error(said === null ? `the backup's thread stopped (exit ${String(code)}) before it answered` : said.failed))
    })
  })
}

/** One backup in the backups folder, as the list door shows it. */
export interface ABackupInTheFolder {
  name: string
  /** What made it, read from its name by `whatMadeTheBackup`. Null when the name does not say. */
  madeBy: BackupMaker | null
  complete: boolean
  /** Why it is not a complete backup, in the words the prune and the floor use. Null when it is complete. */
  incomplete: string | null
  /** When it was taken, local time. Null when no time could be read. */
  at: string | null
  /** `name` when the time is the stamp in its name, `file` when it is the time the file was last written. */
  atFrom: 'name' | 'file' | null
  /** The database file with its files folder and its left-out list, in bytes. Null when it is not an ordinary file. */
  bytes: number | null
}

/**
 * EVERY BACKUP IN THE FOLDER: each database file in it, as the prune and the floor read it (`readCompleteBackups`), with
 * what made it, its time and its size. Newest first. A backup that is not complete is listed too, with the reason, and
 * its time is the file's. A folder that is not there is `folderExists: false`, so nothing there is not mistaken for
 * nobody having looked. A folder that cannot be read throws.
 */
export function theBackupsInTheFolder(directory: string): { directory: string; folderExists: boolean; backups: ABackupInTheFolder[] } {
  let found: ReturnType<typeof readCompleteBackups>
  try {
    found = readCompleteBackups(directory)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { directory, folderExists: false, backups: [] }
    throw err
  }
  const companionBytes = (name: string): number => {
    const folder = found.entries.get(filesFolderOf(name))
    const list = found.entries.get(leftOutListOf(name))
    return (folder?.stat?.isDirectory() === true ? bytesUnder(folder.path) : 0) + (list?.stat?.isFile() === true ? list.stat.size : 0)
  }
  const rows = [...found.backups, ...found.unstamped].map((one) => {
    const stat = one.entry.stat
    const time = one.complete ? one.time : stat?.isFile() === true ? stat.mtimeMs : null
    const row: ABackupInTheFolder = {
      name: one.entry.name,
      madeBy: whatMadeTheBackup(one.entry.name),
      complete: one.complete,
      incomplete: one.complete ? null : one.reason,
      at: time === null ? null : localStamp(new Date(time)),
      atFrom: time === null ? null : one.complete && one.ageFrom === 'name' ? 'name' : 'file',
      bytes: stat?.isFile() === true ? stat.size + companionBytes(one.entry.name) : null,
    }
    return { row, time: time ?? -Infinity }
  })
  rows.sort((a, b) => b.time - a.time || a.row.name.localeCompare(b.row.name))
  return { directory, folderExists: true, backups: rows.map((one) => one.row) }
}
