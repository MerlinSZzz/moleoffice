// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BACKUP IS A CLAIM ABOUT A FILE YOU HAVE NOT OPENED YET.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Until Wave 4B there was no backup command, and the product told you to take one with `cp` in
 * three places: `.env.example`, the refusal `npm run db:reset` prints before it deletes a database,
 * and the refuse-to-serve message `db/migrate.ts` prints at the moment somebody is about to migrate
 * the only copy of their research record.
 *
 * The database runs in WAL mode, so recent writes live in `<file>-wal` until a checkpoint folds
 * them in, and `cp <file>` copies neither. Measured against the live corpus on 2026-08-12 with the
 * server running: the copy held 423 records whose newest change was 55 minutes old, while the
 * database held 429. Nothing reported anything wrong. The three hand-made backups in
 * `data/backups/` had all been taken that way and all were short — one by 17 hours — and two of
 * them, taken 20 minutes apart under different names, were byte-identical.
 *
 * Mutation proofs for problem EmrByGikzsr- (each applied alone after a control run):
 * - Make --check-only use schema alone again: "checks a backup taken in a migration window"
 *   fails on exit 1 instead of 0.
 * - Print the old shortfall on the copy path for tables absent from the source:
 *   "checks a backup taken in a migration window" fails its "cannot be got back" assertion.
 * - Verify the comparison database again: "reads comparison table names and only counts a table
 *   the checked file lacks" fails because damage in unrelated data triggers a schema fallback.
 * - Take the missing table's count outside the guard again: "reports an unknown row count when
 *   the missing table's comparison data is unreadable" fails with a SQLite stack trace instead
 *   of the complete-file refusal and its unknown count.
 *
 * The first test below is the one that matters: it puts rows in the write-ahead log and proves that
 * `cp` of the database file misses them and that `npm run db:backup` does not. Replace `.backup()`
 * with a file copy and it goes red.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT RUNS THE REAL COMMANDS AS SUBPROCESSES
 * ---------------------------------------------------------------------------------------
 *
 * The subject is a command an operator types, and the parts that were broken were the parts a unit
 * test does not reach: the exit code, what is on stderr, and whether a file is left on disk
 * afterwards. `scripts/backup.ts` runs its work at import, so there is no function to call — which
 * is deliberate, and means the test has to be a process.
 *
 * Every database here is a scratch file under the runner's temporary directory. Nothing in this
 * file names ./data/panelx.db, and `MOLE_OFFICE_DB` is set explicitly on every invocation.
 *
 * ONE PART IS CALLED AS A FUNCTION: `carryTheFiles`, which copies the report files and message
 * pictures or lists new ones as left out, and always copies personal spaces whole outside the line.
 * The line limits the three folders' new bytes to 10 GiB; linked files count
 * nothing. Tests hand the function a smaller line, or leave a sparse synthetic file out. The command itself has no option or variable
 * that changes the line; importing the script runs nothing, because it runs only when it is the
 * command.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { spawnSync } from 'node:child_process'
import {
  closeSync,
  copyFileSync,
  existsSync,
  ftruncateSync,
  linkSync,
  openSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { migrateInPlace } from '../src/server/db/migrate.ts'
import { AUTHORED_TABLES } from '../src/server/db/schema.ts'
import { PERSON_LEVEL_TABLES } from '../src/server/db/authored-table-of.ts'
import { everyPartTable } from '../src/server/db/every-part-table.ts'
import { theMigrationsInTheFolder } from '../src/config/migration-look.mjs'
import { BACKUP_FILES_LINE_BYTES, filesFolderOf, leftOutListOf } from '../src/shared/what-is-kept.ts'
import { carryTheFiles } from '../src/server/lib/backup.ts'
import { fileStamp, readCompleteBackups, timeInBackupName } from '../src/server/lib/complete-backups.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { theGateCountSpoolStep } from '../tools/stable/stable-gate-count-spool-step.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const BACKUP_SCRIPT = join(REPO, 'scripts/backup.ts')
const MIGRATIONS = join(REPO, 'drizzle')

/**
 * THE SQL MIGRATIONS, RUN ONCE FOR THIS FILE AND COPIED FOR EACH DATABASE A CASE MAKES, as `freshDb`
 * does in tests/helpers.ts. The copied file holds only what drizzle's `migrate` writes: the schema, the
 * journal and sqlite_sequence. Each copy is still opened and handed to `migrateInPlace`, which writes
 * the data steps on it as it does on an empty file, so every case starts from a database of its own.
 * No case writes to this file.
 */
let schemaFolder: string
let schema: string

beforeAll(() => {
  schemaFolder = aTestDatabaseFolder('backup-schema')
  schema = join(schemaFolder, 'schema.db')
  const sqlite = new Database(schema)
  try {
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS })
  } finally {
    sqlite.close()
  }
})

afterAll(() => {
  rmSync(schemaFolder, { recursive: true, force: true })
})

let dir: string

beforeEach(() => {
  dir = aTestDatabaseFolder('backup')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/**
 * Run the real command through the tsx program `npm run db:backup` runs, and hand back everything it
 * produced. Node starts tsx's own file, without npx in front of it, because npx is a second Node
 * start of its own in every run.
 */
function backup(args: readonly string[], env: Record<string, string> = {}): {
  status: number
  stdout: string
  stderr: string
} {
  const run = spawnSync(process.execPath, [join(REPO, 'node_modules', '.bin', 'tsx'), BACKUP_SCRIPT, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, MOLE_OFFICE_DB: join(dir, 'no-comparison.db'), ...env },
    timeout: 60_000,
  })
  return { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
}

/**
 * A REAL Mole Office database holding `rows` records, with the last write left IN THE WAL.
 *
 * The connection is returned still open, because that is the whole point: SQLite checkpoints on
 * close, and a closed database has nothing in its write-ahead log to lose. This is a server that is
 * running, which is when a person takes a backup.
 *
 * IT RUNS THE PRODUCT'S OWN MIGRATIONS RATHER THAN CREATING TWO TABLES BY HAND, and it did the
 * latter until 2026-08-12. That fixture was a file with `records` and `links` in it and nothing
 * else — which is not a Mole Office database and would restore as one that had lost ten authored tables
 * — so the test named "passes a real database" was passing over a file the verifier now says is
 * incomplete. A fixture that is not the thing cannot say whether the check is right about it.
 */
function servedDatabase(rows: number, checkpointAfter = 0): { file: string; db: Database.Database } {
  const file = join(dir, 'panelx.db')
  copyFileSync(schema, file)
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  migrateInPlace(db, MIGRATIONS)
  const insert = db.prepare(
    'INSERT INTO records (owner_id, id, kind, title, created_at, updated_at) ' +
      `VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?, 'note', ?, '2026-08-12 09:00:00', '2026-08-12 09:00:00')`,
  )
  for (let i = 0; i < Math.min(checkpointAfter, rows); i++) insert.run(`r${i}`, `record ${i}`)
  // A checkpoint here makes the file on disk a REAL database with real rows in it, so that what
  // follows is the ordinary case — a database that has been running for a while, plus the writes
  // since the last checkpoint. Without it every row written after the schema was copied in is in
  // the write-ahead log, and a cp produces a file with no records at all, which overstates the point.
  if (checkpointAfter > 0) db.pragma('wal_checkpoint(TRUNCATE)')
  for (let i = checkpointAfter; i < rows; i++) insert.run(`r${i}`, `record ${i}`)
  return { file, db }
}

/**
 * A database that SQLite itself calls damaged, and PROVED to be damaged before it is used.
 *
 * The corruption has to land on a page holding data, which is why this writes a lot of rows and
 * then checks. A hole punched into free space leaves a perfectly valid database, and a test built
 * on one would pass whatever the product did — the first version of this did exactly that and
 * reported a clean bill of health for a file it believed it had broken.
 *
 * On a copy of the live corpus the same technique produced `Tree 190 page 199: btreeInitPage()
 * returns error code 11 / wrong # of entries in index links_from_idx` — and `npm run db:migrate`
 * reported `records 429 -> 429` and exit 0 over it.
 */
function damagedDatabase(): { file: string } {
  const file = join(dir, 'damaged.db')
  const db = new Database(file)
  db.exec('CREATE TABLE records (id TEXT PRIMARY KEY, title TEXT)')
  db.exec('CREATE INDEX records_title_idx ON records (title)')
  const insert = db.prepare('INSERT INTO records (id, title) VALUES (?, ?)')
  const many = db.transaction(() => {
    for (let i = 0; i < 4000; i++) insert.run(`r${i}`, `record ${i} ${'x'.repeat(80)}`)
  })
  many()
  db.close()

  // A wide band through the middle, so it cannot all land between pages.
  const size = statSync(file).size
  const fd = openSync(file, 'r+')
  writeSync(fd, Buffer.alloc(8192), 0, 8192, Math.floor(size / 2))
  closeSync(fd)

  // PROVE it is damaged, so this test cannot quietly become vacuous.
  const probe = new Database(file, { readonly: true })
  let damaged = false
  try {
    const check = probe.pragma('integrity_check') as { integrity_check: string }[]
    damaged = check.length !== 1 || check[0]?.integrity_check !== 'ok'
  } catch {
    // The check could not run to the end. That is the worst kind of damaged, and it is the case
    // the product used to answer with a stack trace out of node_modules.
    damaged = true
  } finally {
    probe.close()
  }
  expect(damaged, 'the file was not actually corrupted, so this test would prove nothing').toBe(true)
  return { file }
}

/**
 * How many records a file holds when read on its own, as a restore would read it.
 *
 * `null` when there is no records table, which is a real answer: a copy of a database made in WAL
 * mode, taken before its first checkpoint, has the schema itself still sitting in the write-ahead log.
 */
function recordsIn(file: string): number | null {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='records'").get()
    if (table === undefined) return null
    return (db.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
  } finally {
    db.close()
  }
}

/**
 * The schema-part table whose creating migration is newest in the code, with that migration.
 *
 * Both come from where the code declares them: the part's `aPartTable` declaration gives the table's
 * name, and the migrations folder gives the migration whose SQL creates it.
 */
function theNewestPartTable(): { name: string; migration: ReturnType<typeof theMigrationsInTheFolder>[number] } {
  const migrations = theMigrationsInTheFolder(MIGRATIONS)
  const withMigration = everyPartTable().flatMap((part) => {
    const migration = migrations.find((one) =>
      one.sql.some((statement) => {
        const match =
          /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))/i.exec(
            statement,
          )
        return match !== null && (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5]) === part.name
      }),
    )
    return migration === undefined ? [] : [{ name: part.name, migration }]
  })
  const newest = withMigration.sort((a, b) => b.migration.idx - a.migration.idx)[0]
  if (newest === undefined) throw new Error('No schema part table has a migration that creates it.')
  return newest
}

describe('one complete-backup rule for the floor and the prune', () => {
  /** Mutation: count a SQLite copy with neither companion as complete. This case goes red. */
  it('distinguishes complete, incomplete, text, linked and undatable copies with reasons', () => {
    const folder = join(dir, 'backups')
    mkdirSync(folder)
    const names = [1, 2, 3, 4].map((n) => `mole-office-20260101-00000${n}.db`)
    const [complete, incomplete, text, link] = names as [string, string, string, string]
    const undatable = 'mole-office-20260230-000000.db'
    for (const name of [complete, incomplete, undatable]) writeFileSync(join(folder, name), 'SQLite format 3\u0000synthetic fixture')
    mkdirSync(filesFolderOf(join(folder, complete)))
    writeFileSync(join(folder, text), 'synthetic text file')
    symlinkSync(join(folder, complete), join(folder, link))
    const readings = readCompleteBackups(folder)
    const byName = new Map(readings.backups.map((one) => [one.entry.name, one]))
    expect(byName.get(complete)).toMatchObject({ complete: true, time: new Date(2026, 0, 1, 0, 0, 1).getTime(), ageFrom: 'name' })
    expect(byName.get(incomplete)).toMatchObject({ complete: false, reason: 'incomplete: neither a files folder nor a left-out list is beside it' })
    expect(byName.get(text)).toMatchObject({ complete: false, reason: 'incomplete: it is not a SQLite database' })
    expect(byName.get(link)).toMatchObject({ complete: false, reason: 'a link; it is never followed or removed' })
    expect(byName.get(undatable)).toMatchObject({ complete: false, reason: 'a name that cannot be dated: its stamp does not read back exactly' })
    writeFileSync(leftOutListOf(join(folder, incomplete)), 'Synthetic fixture: files left out')
    expect(readCompleteBackups(folder).backups.find((one) => one.entry.name === incomplete)?.complete).toBe(true)
    for (const stamp of ['20261301-000000', '20260101-240000', 'not-a-stamp']) expect(timeInBackupName(`mole-office-${stamp}.db`)).toBeNull()
    const moment = new Date(2026, 9, 2, 12, 34, 56)
    expect(timeInBackupName(`mole-office-${fileStamp(moment)}.db`)).toBe(moment.getTime())
  })
})

describe('a backup can rely on a recent complete copy', () => {
  /** Synthetic SQLite copies, with the real schema, in this case's scratch folder. */
  function sqliteCopy(file: string): void {
    copyFileSync(schema, file)
    const db = new Database(file)
    try { migrateInPlace(db, MIGRATIONS) } finally { db.close() }
  }

  // MUTATION PROOF: ignore the age (never skip), and this case goes red when the command opens the
  // absent source instead of relying on the recent backup and exiting successfully.
  it('relies on the newest complete backup under the given minutes without writing anything', () => {
    const folder = join(dir, 'backups')
    mkdirSync(folder)
    const old = join(folder, 'mole-office-old.db')
    const recent = join(folder, 'custom-name.db')
    sqliteCopy(old)
    sqliteCopy(recent)
    mkdirSync(filesFolderOf(old))
    mkdirSync(filesFolderOf(recent))
    const contents = readFileSync(recent)
    const now = Date.now()
    utimesSync(old, new Date(now - 90 * 60_000), new Date(now - 90 * 60_000))
    utimesSync(recent, new Date(now - 5 * 60_000), new Date(now - 5 * 60_000))
    symlinkSync(old, join(folder, 'newer-link.db'))
    const before = readdirSync(folder).sort()
    // No source exists: a skip must not even open the source database.
    const run = backup(['--to', join(folder, 'new.db'), '--if-older-than', '60'])
    expect(run.status, run.stderr).toBe(0)
    const answer = JSON.parse(run.stdout.split('\n')[0]!) as { backupSkipped: boolean; backup: string; ageMinutes: number }
    expect(answer).toMatchObject({ backupSkipped: true, backup: recent, ageFrom: 'mtime' })
    expect(answer.ageMinutes).toBeGreaterThanOrEqual(5)
    expect(answer.ageMinutes).toBeLessThan(6)
    expect(run.stdout).toContain(`backup: skipped; relying on ${recent}, ${answer.ageMinutes.toFixed(2)} minutes old.`)
    expect(readdirSync(folder).sort()).toEqual(before)
    expect(readFileSync(recent)).toEqual(contents)
  })

  /** Mutation: treat every mole-office-*.db name as stamped, losing the custom-name mtime fallback. */
  it('keeps the mtime fallback for an unstamped custom --to name with the mole-office prefix', () => {
    const folder = join(dir, 'backups')
    mkdirSync(folder)
    const recent = join(folder, 'mole-office-manual.db')
    sqliteCopy(recent)
    mkdirSync(filesFolderOf(recent))
    const then = new Date(Date.now() - 5 * 60_000)
    utimesSync(recent, then, then)
    const run = backup(['--to', join(folder, 'next.db'), '--if-older-than', '60', '--json'])
    expect(run.status, run.stderr).toBe(0)
    const answer = JSON.parse(run.stdout)
    expect(answer).toMatchObject({ backupSkipped: true, backup: recent, ageFrom: 'mtime' })
    expect(answer.ageMinutes).toBeGreaterThanOrEqual(5)
    expect(answer.ageMinutes).toBeLessThan(6)
  })

  // MUTATION PROOF: remove the SQLite header check. This case goes red on an unexpected skip.
  it('does not rely on a text file named x.db even with its files folder', () => {
    const { file, db } = servedDatabase(3)
    try {
      const folder = join(dir, 'backups')
      mkdirSync(folder)
      const text = join(folder, 'x.db')
      writeFileSync(text, 'synthetic text, not SQLite')
      mkdirSync(filesFolderOf(text))
      const target = join(folder, 'new.db')
      const run = backup(['--to', target, '--if-older-than', '60'], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).not.toContain('backupSkipped')
      expect(recordsIn(target)).toBe(3)
    } finally { db.close() }
  })

  // MUTATION PROOF: remove the companion check. This case goes red on an unexpected skip.
  it('does not rely on a half-written SQLite copy with neither files folder nor left-out list', () => {
    const { file, db } = servedDatabase(3)
    try {
      const folder = join(dir, 'backups')
      mkdirSync(folder)
      sqliteCopy(join(folder, 'half-written.db'))
      const target = join(folder, 'new.db')
      const run = backup(['--to', target, '--if-older-than', '60'], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).not.toContain('backupSkipped')
      expect(recordsIn(target)).toBe(3)
    } finally { db.close() }
  })

  // MUTATION PROOF: use mtime instead of the name's stamp. This case goes red on an unexpected skip.
  //
  // THE ZONE IS SET, NOT THE MACHINE'S. A name's stamp is local time with no offset, so a backup named
  // in the hour a zone repeats when its clocks go back reads as an hour older than it is. In
  // Europe/London, with the clock set to 01:30 GMT on 25 October 2026, the fresh backup below was not
  // taken as fresh and the command went on to back up: exit 1 for 0. In real use that is one backup
  // too many, which is the safe side. So this case, and the command it runs, read the clock in
  // Asia/Shanghai, which has not changed its clocks since 1991.
  it('does not treat a rewritten three-hour-old stamped backup as fresh', () => {
    const zone = process.env.TZ
    process.env.TZ = 'Asia/Shanghai'
    const { file, db } = servedDatabase(3)
    try {
      const folder = join(dir, 'backups')
      mkdirSync(folder)
      const then = new Date(Date.now() - 3 * 60 * 60_000)
      const p = (n: number) => String(n).padStart(2, '0')
      const stamp = `${then.getFullYear()}${p(then.getMonth() + 1)}${p(then.getDate())}-${p(then.getHours())}${p(then.getMinutes())}${p(then.getSeconds())}`
      const old = join(folder, `mole-office-${stamp}.db`)
      sqliteCopy(old)
      mkdirSync(filesFolderOf(old))
      const now = new Date()
      utimesSync(old, now, now)
      const target = join(folder, 'new.db')
      const run = backup(['--to', target, '--if-older-than', '60'], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).not.toContain('backupSkipped')
      expect(recordsIn(target)).toBe(3)
      // A fresh stamp also names the source of the age, even when its mtime is old.
      utimesSync(target, then, then)
      const fresh = join(folder, `mole-office-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.db`)
      sqliteCopy(fresh)
      mkdirSync(filesFolderOf(fresh))
      utimesSync(fresh, then, then)
      const skipped = backup(['--to', join(folder, 'another.db'), '--if-older-than', '60', '--json'])
      expect(skipped.status, skipped.stderr).toBe(0)
      expect(JSON.parse(skipped.stdout)).toMatchObject({ backupSkipped: true, backup: fresh, ageFrom: 'name' })
    } finally {
      db.close()
      if (zone === undefined) delete process.env.TZ
      else process.env.TZ = zone
    }
  })

  // MUTATION PROOF: omit the mtime fallback. This case goes red when the unstamped copy is not used.
  it('uses and reports mtime for a --to name with no stamp and a left-out list', () => {
    const folder = join(dir, 'backups')
    mkdirSync(folder)
    const recent = join(folder, 'custom-name.db')
    sqliteCopy(recent)
    writeFileSync(leftOutListOf(recent), 'Synthetic fixture: no files copied.\n')
    const then = new Date(Date.now() - 5 * 60_000)
    utimesSync(recent, then, then)
    const run = backup(['--to', join(folder, 'new.db'), '--if-older-than', '60', '--json'])
    expect(run.status, run.stderr).toBe(0)
    const answer = JSON.parse(run.stdout)
    expect(answer).toMatchObject({ backupSkipped: true, backup: recent, ageFrom: 'mtime' })
    expect(answer.ageMinutes).toBeGreaterThanOrEqual(5)
    expect(answer.ageMinutes).toBeLessThan(6)
  })

  // MUTATION PROOF: skip regardless of age, and this case goes red on the unexpected skip answer.
  it('does not rely on a backup older than the given minutes', () => {
    const { file, db } = servedDatabase(3)
    try {
      const folder = join(dir, 'backups')
      mkdirSync(folder)
      const old = join(folder, 'old.db')
      sqliteCopy(old)
      mkdirSync(filesFolderOf(old))
      const then = new Date(Date.now() - 90 * 60_000)
      utimesSync(old, then, then)
      const target = join(folder, 'new.db')
      const run = backup(['--to', target, '--if-older-than', '60'], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).not.toContain('backupSkipped')
      expect(recordsIn(target)).toBe(3)
    } finally { db.close() }
  })

  // MUTATION PROOF: count a work-in-progress folder as complete (bypass checks for directories), and this
  // case goes red on the unexpected skip answer instead of making a new database.
  it('backs up when only a work-in-progress folder and WAL/SHM files are found', () => {
    const { file, db } = servedDatabase(3)
    try {
      const folder = join(dir, 'backups')
      mkdirSync(folder)
      const work = join(folder, '.unfinished.db.being-made-synthetic')
      mkdirSync(work)
      writeFileSync(join(work, 'unfinished.db'), 'synthetic unpublished database')
      mkdirSync(join(folder, 'unfinished.db'))
      writeFileSync(join(folder, 'unfinished.db-wal'), 'synthetic WAL')
      writeFileSync(join(folder, 'unfinished.db-shm'), 'synthetic SHM')
      // Exercise the default backups folder as well as --to in the other cases.
      const run = backup(['--if-older-than', '60'], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).not.toContain('backupSkipped')
      const made = readdirSync(folder).filter((name) => name.startsWith('mole-office-') && name.endsWith('.db'))
      expect(made).toHaveLength(1)
      expect(recordsIn(join(folder, made[0]!))).toBe(3)
    } finally { db.close() }
  })

  // MUTATION PROOF: accept bad values (remove the value guard), and this case goes red on the
  // missing positive-whole-number refusal, even with a recent complete backup present.
  it('refuses a bad value before anything is written', () => {
    const folder = join(dir, 'backups')
    mkdirSync(folder)
    sqliteCopy(join(folder, 'recent.db'))
    mkdirSync(filesFolderOf(join(folder, 'recent.db')))
    const before = readdirSync(folder)
    // One bad value for each part of the value guard: missing, not digits alone, not a safe integer, and not above zero.
    for (const value of [undefined, '0', '1.5', '9007199254740992']) {
      const run = backup(['--to', join(folder, 'new.db'), '--if-older-than', ...(value === undefined ? [] : [value])])
      expect(run.status, String(value)).toBe(1)
      expect(run.stderr).toContain('--if-older-than needs a positive whole number of minutes')
      expect(run.stdout).toBe('')
      expect(readdirSync(folder)).toEqual(before)
    }
  })
})

describe('the backup captures what a plain cp of the database file does not', () => {
  it('copies the write-ahead log, which is where the newest work is', () => {
    // 20 rows safely on disk, 20 more written since — the shape of any database that has been in
    // use for a while, and the shape the live corpus was in when this was measured.
    const { file, db } = servedDatabase(40, 20)
    try {
      // The WAL is real and it is where the recent writes are. If this ever came out 0 the test
      // below would pass for the wrong reason — a cp would be complete because there was nothing
      // outstanding to miss.
      const wal = statSync(`${file}-wal`).size
      expect(wal, 'nothing is in the write-ahead log, so this test would prove nothing').toBeGreaterThan(0)

      const copied = join(dir, 'by-cp.db')
      const backedUp = join(dir, 'by-backup.db')

      // What the product used to tell you to do.
      copyFileSync(file, copied)

      // What it tells you to do now.
      const run = backup(['--to', backedUp], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)

      // THE WHOLE POINT, in two numbers: the documented command loses the newest half of the work
      // and says nothing, and the command that replaced it does not.
      expect(recordsIn(copied), 'a plain cp saw everything, so WAL mode is not doing what this test assumes').toBe(20)
      expect(recordsIn(backedUp), 'the online backup missed rows that were in the write-ahead log').toBe(40)
    } finally {
      db.close()
    }
  })

  it('is safe to run against a database that is being written to, and says the source moved', () => {
    const { file, db } = servedDatabase(10)
    try {
      const target = join(dir, 'moving.db')
      const run = backup(['--to', target], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      // The source is untouched by the backup: it is opened read-only, so a database being served
      // cannot be damaged by somebody taking a copy of it.
      expect(recordsIn(file)).toBe(10)
      expect(recordsIn(target)).toBe(10)
    } finally {
      db.close()
    }
  })
})

describe('a copy that cannot be verified is deleted rather than left to be trusted', () => {
  it('refuses a destination that is the source, which would not be a backup', () => {
    const { file, db } = servedDatabase(3)
    try {
      const run = backup(['--to', file], { MOLE_OFFICE_DB: file })
      expect(run.status).toBe(1)
      expect(run.stderr).toContain('would not be a backup')
      expect(recordsIn(file)).toBe(3)
    } finally {
      db.close()
    }
  })

  it('says there is nothing to back up rather than writing an empty file', () => {
    const run = backup(['--to', join(dir, 'out.db')], { MOLE_OFFICE_DB: join(dir, 'no-such.db') })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('nothing to back up')
    expect(existsSync(join(dir, 'out.db')), 'an empty file was left where a backup would go').toBe(false)
  })
})

describe('--check-only answers the question a restore depends on', () => {
  it('passes a real database and names what is in it', () => {
    const { file, db } = servedDatabase(7)
    db.close()
    const run = backup(['--check-only', file], { MOLE_OFFICE_DB: join(dir, 'no-comparison.db') })
    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toContain('usable Mole Office database')
    expect(run.stdout).toContain('7 records')
  })

  it('refuses a zero-byte file, which SQLite would otherwise treat as a working empty database', () => {
    // Measured on 2026-08-12: `npm run db:migrate` against a zero-byte file exits 0 and builds a
    // complete, empty Mole Office. So restoring a zero-length backup gives you a product that works and
    // has lost everything, with nothing anywhere saying so.
    const file = join(dir, 'zero.db')
    writeFileSync(file, '')
    const run = backup(['--check-only', file], { MOLE_OFFICE_DB: join(dir, 'no-comparison.db') })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('EMPTY')
  })

  it('refuses a damaged database, including one too damaged to finish the check', () => {
    const { file } = damagedDatabase()

    const run = backup(['--check-only', file], { MOLE_OFFICE_DB: join(dir, 'no-comparison.db') })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('NOT a usable backup')
    expect(run.stderr, "the refusal must be Mole Office's own words, not a node_modules stack trace").not.toContain(
      'better-sqlite3/lib',
    )
  })

  /**
   * THE ANSWER AN OPERATOR ACTS ON AT THE WORST MOMENT.
   *
   * `databaseObjection` in db/migrate.ts is printed when Mole Office finds a damaged database, and what
   * it tells you to do is: check your most recent backup, then put it in place. Until 2026-08-12
   * `verify()` asked whether the file had a `records` table and nothing else, so it called EVERY
   * backup in `data/backups/` "a usable PanelX database" and exited 0 — measured that day, six of
   * the eight predate the whole planning layer and the other two have half of it, and none of the
   * eight has all four planning tables. Following Mole Office's own instruction restored a database with
   * no plan in it, and the verifier said it was fine.
   */
  /**
   * Take every project-less table out of a database, the way one written before them had none.
   *
   * FOREIGN KEYS ARE TURNED OFF FOR IT, and that is what makes it faithful rather than convenient.
   * A person row names the picture it is drawn with, so dropping `assets` while `people` still
   * points at it is refused — and a database written before either table existed had neither the
   * rows nor the reference. Turning the check off for the drops is how a fixture reaches that state;
   * it is turned straight back on, so nothing the test measures afterwards is measured with the
   * guard down.
   */
  function dropThemAll(db: Database.Database): void {
    db.pragma('foreign_keys = OFF')
    for (const table of PERSON_LEVEL_TABLES) db.exec(`DROP TABLE ${table}`)
    db.pragma('foreign_keys = ON')
  }

  it('will not call a database missing authored tables usable, and says what restoring it costs', () => {
    const { file, db } = servedDatabase(4)
    // A backup taken before the planning layer existed, made the only honest way: drop the tables
    // that a later migration added. The list is the schema's own, so a fifth planning table is
    // covered by this test the day it is declared.
    dropThemAll(db)
    db.close()

    const run = backup(['--check-only', file], { MOLE_OFFICE_DB: join(dir, 'no-comparison.db') })

    expect(run.status, 'a database with no planning layer was reported usable, exit 0').toBe(1)
    expect(run.stderr).toContain('NOT a complete Mole Office database')
    for (const table of PERSON_LEVEL_TABLES) expect(run.stderr).toContain(table)
    // The consequence in words, because "missing tables" is not a sentence somebody can act on.
    expect(run.stderr).toContain('NO ROWS')
    expect(run.stderr).toContain('does not bring the rows back')
    // And what it does hold is still reported: this is the best copy they have if it is the only one.
    expect(run.stderr).toContain('4 records')
    expect(run.stdout).toContain('Compared with the schema alone because')
    expect(run.stdout).toContain('there is no file at')
    expect(run.stdout).toContain(join(dir, 'no-comparison.db'))
  })

  it('backs such a database up anyway, and keeps the copy, because it is a faithful one', () => {
    // THE OTHER HALF, AND THE DANGEROUS ONE. A failed verification DELETES the copy, and the
    // refuse-to-serve message tells an operator to run `npm run db:backup && npm run db:migrate` —
    // so treating an old source as a verification failure would delete the backup taken in the
    // second before the migration that needs it.
    const { file, db } = servedDatabase(3)
    dropThemAll(db)
    const target = join(dir, 'old-schema-backup.db')
    const run = backup(['--to', target], { MOLE_OFFICE_DB: file })
    db.close()

    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(target), 'a faithful copy of an old database was deleted').toBe(true)
    expect(recordsIn(target)).toBe(3)
    // Said out loud rather than smoothed over: the source is old, and so is the copy.
    expect(run.stdout).toContain('Neither this file nor the database at')
    expect(run.stdout).not.toContain('cannot be got back')
    for (const table of PERSON_LEVEL_TABLES) expect(run.stdout).toContain(table)
  })

  it('checks a backup taken in a migration window', () => {
    const { file, db } = servedDatabase(3)
    // Reuse the old-schema fixture technique above, including the migration journal. Migration
    // 0190 creates the Casting tables; 0268 adds the nullable probability columns. No migration is run by
    // either CLI path, and this older source is precisely what a pre-migration backup must keep.
    const notYetCreated = ['casting_rows', 'casting_row_changes']
    expect(notYetCreated.every((table) => AUTHORED_TABLES.includes(table as typeof AUTHORED_TABLES[number]))).toBe(true)
    const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; when: number; tag: string }[]
    }
    const firstPending = journal.entries.find((entry) => entry.tag === '0190_several_castings_for_each_role')!
    db.pragma('foreign_keys = OFF')
    for (const table of notYetCreated) db.exec(`DROP TABLE ${table}`)
    db.pragma('foreign_keys = ON')
    db.prepare('DELETE FROM __drizzle_migrations WHERE created_at >= ?').run(firstPending.when)
    db.close()
    const before = readFileSync(file)
    const target = join(dir, 'before-migration.db')
    const env = { MOLE_OFFICE_DB: file }
    const copied = backup(['--to', target], env)
    expect(copied.status, copied.stderr).toBe(0)
    expect(copied.stdout).not.toContain('cannot be got back')
    expect(copied.stdout).toContain('A migration that creates them has not been applied')

    const checked = backup(['--check-only', target], env)
    expect(checked.status, checked.stderr).toBe(0)
    expect(checked.stdout + checked.stderr).not.toContain('NOT a complete')
    expect(checked.stdout).toContain(`Neither this file nor the database at ${file} has ${notYetCreated.join(', ')} yet`)
    expect(checked.stdout).toContain('expected before migrating')
    expect(checked.stdout).toContain(firstPending.tag)
    const json = backup(['--check-only', target, '--json'], env)
    expect(json.status, json.stderr).toBe(0)
    const said = JSON.parse(json.stdout)
    expect(said.ok).toBe(true)
    expect(said.comparedWith).toEqual({ database: file, reason: null, sameDatabase: false })
    expect(said.missingTables).toEqual([])
    expect(said.notYetCreatedTables).toEqual(notYetCreated)
    // The migration reader applies index order, including entries carried after a newer index in the file.
    expect(said.pendingMigrations).toEqual(journal.entries.filter((entry) => entry.when >= firstPending.when).sort((a, b) => a.idx - b.idx).map((entry) => entry.tag))
    const jsonCopy = backup(['--to', join(dir, 'json-copy.db'), '--json'], env)
    expect(jsonCopy.status, jsonCopy.stderr).toBe(0)
    const copySaid = JSON.parse(jsonCopy.stdout)
    expect(copySaid.ok).toBe(true)
    expect(copySaid.comparedWith).toEqual(said.comparedWith)
    expect(copySaid.missingTables).toEqual(said.missingTables)
    expect(copySaid.notYetCreatedTables).toEqual(said.notYetCreatedTables)
    expect(readFileSync(file).equals(before), 'the source was changed by copying or checking').toBe(true)
  })

  it('names a schema part table a current copy lost as missing', () => {
    // A COPY OF A CURRENT DATABASE WITH ONE PART TABLE DELETED. Its own journal still records the
    // migration that created the table, so the absence is lost work and the check must name it.
    const part = theNewestPartTable()
    const { file, db } = servedDatabase(3)
    db.close()
    const target = join(dir, 'lost-a-part-table.db')
    copyFileSync(file, target)
    const copy = new Database(target)
    copy.pragma('foreign_keys = OFF')
    copy.exec(`DROP TABLE "${part.name}"`)
    copy.pragma('foreign_keys = ON')
    copy.close()

    const env = { MOLE_OFFICE_DB: file }
    const run = backup(['--check-only', target], env)
    expect(run.status, run.stderr).toBe(1)
    expect(run.stderr).toContain(part.name)

    const json = backup(['--check-only', target, '--json'], env)
    expect(json.status, json.stderr).toBe(1)
    const said = JSON.parse(json.stdout) as {
      ok: boolean
      missingTables: string[]
      missingPartTables: string[]
      predatesPartTables: string[]
    }
    expect(said.ok).toBe(false)
    expect(said.missingTables).toContain(part.name)
    expect(said.missingPartTables).toContain(part.name)
    expect(said.predatesPartTables).toEqual([])
  })

  it('calls a backup older than a schema part table older, and keeps it', () => {
    // A BACKUP MADE BEFORE A PART TABLE EXISTED. Its own journal does not record the migration that
    // creates the table, which is what tells it apart from the copy above. The compared database has
    // the table, so deciding by absence alone would call this file missing it and exit 1.
    const part = theNewestPartTable()
    const { file, db } = servedDatabase(3)
    db.close()
    const older = join(dir, 'older-than-a-part-table.db')
    copyFileSync(file, older)
    const old = new Database(older)
    old.pragma('foreign_keys = OFF')
    old.exec(`DROP TABLE "${part.name}"`)
    old.pragma('foreign_keys = ON')
    old.prepare('DELETE FROM __drizzle_migrations WHERE hash = ?').run(part.migration.hash)
    old.close()

    const env = { MOLE_OFFICE_DB: file }
    const run = backup(['--check-only', older, '--json'], env)
    expect(run.status, run.stderr).toBe(0)
    const said = JSON.parse(run.stdout) as {
      ok: boolean
      missingTables: string[]
      predatesPartTables: string[]
      verdict: string
    }
    expect(said.ok).toBe(true)
    expect(said.missingTables).toEqual([])
    expect(said.predatesPartTables).toContain(part.name)
    expect(said.verdict).toBe('older-than-part-tables')

    const human = backup(['--check-only', older], env)
    expect(human.status, human.stderr).toBe(0)
    expect(human.stdout).toContain(part.name)

    // THE COPY PATH IS WHERE A FAILED CHECK DELETES A FILE. This one is not failed, so it is kept.
    const kept = join(dir, 'kept-older-than-a-part-table.db')
    const copied = backup(['--to', kept], { MOLE_OFFICE_DB: older })
    expect(copied.status, copied.stderr).toBe(0)
    expect(existsSync(kept), 'a backup that is only older than a schema part table was deleted').toBe(true)
    expect(copied.stdout).toContain(part.name)
  })

  it('does not call a copy older than a part table when its migration journal cannot be read', () => {
    // NOBODY RECORDED WHICH MIGRATIONS THIS FILE TOOK, so it is not called older. Its absent part
    // table is named missing, and the comparison with the database decides whether it is lost work.
    const part = theNewestPartTable()
    const { file, db } = servedDatabase(3)
    db.close()
    const silent = join(dir, 'no-journal.db')
    copyFileSync(file, silent)
    const copy = new Database(silent)
    copy.pragma('foreign_keys = OFF')
    copy.exec(`DROP TABLE "${part.name}"`)
    copy.exec('DROP TABLE __drizzle_migrations')
    copy.pragma('foreign_keys = ON')
    copy.close()

    const env = { MOLE_OFFICE_DB: file }
    const json = backup(['--check-only', silent, '--json'], env)
    expect(json.status, json.stderr).toBe(1)
    const said = JSON.parse(json.stdout) as {
      missingTables: string[]
      predatesPartTables: string[]
      journalUnreadable: string | null
    }
    expect(said.missingTables).toContain(part.name)
    expect(said.predatesPartTables).toEqual([])
    expect(said.journalUnreadable).toEqual(expect.any(String))

    // THE PLAIN OUTPUT NAMES THE REASON THE CHECK ITSELF GAVE, so this pins no words of its own.
    const run = backup(['--check-only', silent], env)
    expect(run.status, run.stderr).toBe(1)
    expect(run.stderr).toContain(part.name)
    expect(run.stdout + run.stderr).toContain(String(said.journalUnreadable))
  })

  it('refuses only a table the compared database has, and counts the rows a restore would lose', () => {
    const { file, db } = servedDatabase(2)
    // Both lack casting_rows. Only the backup lacks casting_row_changes, so only that table
    // belongs in the refusal even though the schema declares both.
    db.exec('DROP TABLE casting_rows')
    db.prepare("INSERT INTO casting_row_changes (casting_id, role, project, what, at, by_kind, by_id, decisions) VALUES (1, 'worker', '', 'add', '2026-09-30 12:00:00', 'agent', 'fixture', '[]')").run()
    db.close()
    const target = join(dir, 'missing-one.db')
    copyFileSync(file, target)
    const old = new Database(target)
    old.exec('DROP TABLE casting_row_changes')
    old.close()
    const before = readFileSync(file)
    const env = { MOLE_OFFICE_DB: file }
    const run = backup(['--check-only', target], env)
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('NOT a complete Mole Office database')
    expect(run.stderr).toContain('casting_row_changes: 1 row')
    expect(run.stderr).not.toContain('casting_rows')
    expect(run.stdout).toContain('has casting_rows yet')
    const json = backup(['--check-only', target, '--json'], env)
    expect(json.status).toBe(1)
    const said = JSON.parse(json.stdout)
    expect(said.ok).toBe(false)
    expect(said.missingTables).toEqual(['casting_row_changes'])
    expect(said.missingTableRows).toEqual({ casting_row_changes: 1 })
    expect(said.notYetCreatedTables).toEqual(['casting_rows'])
    expect(said.comparedWith.database).toBe(file)
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it('reads comparison table names and only counts a table the checked file lacks', () => {
    const { file, db } = servedDatabase(2)
    db.exec('DROP TABLE casting_rows')
    db.prepare("INSERT INTO casting_row_changes (casting_id, role, project, what, at, by_kind, by_id, decisions) VALUES (1, 'worker', '', 'add', '2026-09-30 12:00:00', 'agent', 'fixture', '[]')").run()
    db.exec("CREATE TABLE comparison_read_trap (value TEXT); INSERT INTO comparison_read_trap VALUES ('fixture')")
    const pageSize = db.pragma('page_size', { simple: true }) as number
    const { rootpage } = db.prepare("SELECT rootpage FROM sqlite_master WHERE name = 'comparison_read_trap'").get() as { rootpage: number }
    db.close()
    const target = join(dir, 'intact-but-missing-one.db')
    copyFileSync(file, target)
    const checked = new Database(target)
    checked.exec('DROP TABLE casting_row_changes')
    checked.close()

    // Break only a data page in the comparison. Its table names and the absent table's rows
    // are readable. Checking that database's integrity is a different command's question:
    // this case goes red if the comparison calls verify() or counts every table again.
    const bytes = readFileSync(file)
    bytes[(rootpage - 1) * pageSize] = 0xff
    writeFileSync(file, bytes)
    const probe = new Database(file, { readonly: true, fileMustExist: true })
    try {
      expect(() => probe.prepare('SELECT count(*) FROM comparison_read_trap').get()).toThrow()
      let intact = false
      try {
        const check = probe.pragma('integrity_check') as { integrity_check: string }[]
        intact = check.length === 1 && check[0]?.integrity_check === 'ok'
      } catch { /* SQLite may throw instead of returning its damage report. */ }
      expect(intact, 'the fixture must fail a full integrity check').toBe(false)
    } finally {
      probe.close()
    }

    const run = backup(['--check-only', target, '--json'], { MOLE_OFFICE_DB: file })
    expect(run.status).toBe(1)
    const said = JSON.parse(run.stdout)
    expect(said.comparedWith).toEqual({ database: file, reason: null, sameDatabase: false })
    expect(said.missingTables).toEqual(['casting_row_changes'])
    expect(said.missingTableRows).toEqual({ casting_row_changes: 1 })
    expect(said.notYetCreatedTables).toEqual(['casting_rows'])
    expect(readFileSync(file).equals(bytes), 'comparison changed its database').toBe(true)
  })

  it('reports an unknown row count when the missing table\'s comparison data is unreadable', () => {
    const { file, db } = servedDatabase(2)
    db.exec('DROP TABLE casting_rows')
    db.prepare("INSERT INTO casting_row_changes (casting_id, role, project, what, at, by_kind, by_id, decisions) VALUES (1, 'worker', '', 'add', '2026-09-30 12:00:00', 'agent', 'fixture', '[]')").run()
    // count(*) can use a covering index. Remove those so it must read the damaged data page.
    db.exec('DROP INDEX casting_row_changes_casting; DROP INDEX casting_row_changes_role')
    const pageSize = db.pragma('page_size', { simple: true }) as number
    const { rootpage } = db.prepare("SELECT rootpage FROM sqlite_master WHERE name = 'casting_row_changes'").get() as { rootpage: number }
    db.close()
    const target = join(dir, 'intact-without-unreadable-table.db')
    copyFileSync(file, target)
    const checked = new Database(target)
    checked.exec('DROP TABLE casting_row_changes')
    checked.close()

    const bytes = readFileSync(file)
    bytes[(rootpage - 1) * pageSize] = 0xff
    writeFileSync(file, bytes)
    const probe = new Database(file, { readonly: true, fileMustExist: true })
    let sqliteReason = ''
    try {
      expect(probe.prepare("SELECT name FROM sqlite_master WHERE name = 'casting_row_changes'").get()).toEqual({ name: 'casting_row_changes' })
      try {
        probe.prepare('SELECT count(*) AS n FROM casting_row_changes').get()
      } catch (err) {
        sqliteReason = (err as Error).message.replace(/\s+/g, ' ').trim()
      }
      expect(sqliteReason, 'the fixture must make the missing table\'s count throw').not.toBe('')
    } finally {
      probe.close()
    }

    const env = { MOLE_OFFICE_DB: file }
    const run = backup(['--check-only', target], env)
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('NOT a complete Mole Office database')
    expect(run.stderr).toContain(`casting_row_changes: row count unknown (SQLite says: ${sqliteReason})`)
    expect(run.stderr).not.toContain('casting_rows')
    expect(run.stdout).toContain('has casting_rows yet')
    expect(run.stdout + run.stderr).not.toContain('node_modules')
    expect(readFileSync(file).equals(bytes), 'human comparison changed its database').toBe(true)

    const json = backup(['--check-only', target, '--json'], env)
    expect(json.status).toBe(1)
    expect(json.stdout + json.stderr).not.toContain('node_modules')
    const said = JSON.parse(json.stdout)
    expect(said.ok).toBe(false)
    expect(said.comparedWith).toEqual({ database: file, reason: null, sameDatabase: false })
    expect(said.missingTables).toEqual(['casting_row_changes'])
    expect(said.missingTableRows).toEqual({ casting_row_changes: null })
    expect(said.missingTableRowsUnknownReason).toEqual({ casting_row_changes: sqliteReason })
    expect(said.missingTableRowsUnknownReason.casting_row_changes).not.toMatch(/[\r\n]/)
    expect(said.notYetCreatedTables).toEqual(['casting_rows'])
    expect(readFileSync(file).equals(bytes), 'JSON comparison changed its database').toBe(true)
  })

  it('uses the schema alone when no comparison database exists, and says why in JSON', () => {
    const { file, db } = servedDatabase(4)
    dropThemAll(db)
    db.close()
    const absent = join(dir, 'absent.db')
    const run = backup(['--check-only', file, '--json'], { MOLE_OFFICE_DB: absent })
    expect(run.status).toBe(1)
    const said = JSON.parse(run.stdout)
    expect(said.ok).toBe(false)
    expect(said.comparedWith).toEqual({ database: null, reason: `the database at ${absent} could not be used for comparison: there is no file at ${absent}`, sameDatabase: false })
    expect(said.missingTables).toEqual(AUTHORED_TABLES.filter((table) => PERSON_LEVEL_TABLES.includes(table)))
    expect(said.notYetCreatedTables).toEqual([])
    expect(existsSync(absent)).toBe(false)
  })

  it.each(['not Mole Office', 'cannot open read-only'])('explains the schema fallback when the comparison database is %s', (kind) => {
    const { file, db } = servedDatabase(2)
    db.exec('DROP TABLE casting_row_changes')
    db.close()
    const other = join(dir, 'other.db')
    if (kind === 'not Mole Office') {
      const foreign = new Database(other)
      foreign.exec('CREATE TABLE recipes (id INTEGER)')
      foreign.close()
    } else mkdirSync(other)
    const run = backup(['--check-only', file, '--json'], { MOLE_OFFICE_DB: other })
    expect(run.status).toBe(1)
    const said = JSON.parse(run.stdout)
    expect(said.comparedWith.database).toBeNull()
    expect(said.comparedWith.reason).toContain(kind === 'not Mole Office' ? 'not a Mole Office database' : 'could not be opened')
    expect(said.missingTables).toEqual(['casting_row_changes'])
    expect(said.notYetCreatedTables).toEqual([])
  })

  it('recognises the checked database itself through a link and reports its unapplied tables', () => {
    const { file, db } = servedDatabase(2)
    db.exec('DROP TABLE casting_row_changes')
    db.close()
    const alias = join(dir, 'alias.db')
    symlinkSync(file, alias)
    const env = { MOLE_OFFICE_DB: file }
    const run = backup(['--check-only', alias], env)
    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toContain('itself (the same real path)')
    expect(run.stdout).toContain('has casting_row_changes yet')
    const json = backup(['--check-only', alias, '--json'], env)
    expect(json.status, json.stderr).toBe(0)
    expect(JSON.parse(json.stdout).comparedWith.sameDatabase).toBe(true)
  })

  it('checks for every authored table, from the schema, and not for a list of its own', () => {
    // The check has to be about the tables that hold work, all of them. Written as an assertion
    // over `AUTHORED_TABLES` so that a table added to the schema is covered without anyone editing
    // this file — which is the whole reason the four tables of the planning layer went unnoticed.
    const { file, db } = servedDatabase(1)
    db.close()
    const run = backup(['--check-only', file, '--json'], { MOLE_OFFICE_DB: file })
    expect(run.status, run.stderr).toBe(0)
    const said = JSON.parse(run.stdout) as { ok: boolean; counts: Record<string, number> }
    expect(said.ok).toBe(true)
    for (const table of AUTHORED_TABLES) {
      expect(Object.keys(said.counts), `${table} is not in a database this called complete`).toContain(table)
    }
  })

  it('refuses a database that is not Mole Office\'s, which is what a typo in MOLE_OFFICE_DB lands on', () => {
    const file = join(dir, 'recipes.db')
    const other = new Database(file)
    other.exec('CREATE TABLE my_recipes (id INTEGER PRIMARY KEY, name TEXT)')
    other.close()

    const run = backup(['--check-only', file], { MOLE_OFFICE_DB: join(dir, 'no-comparison.db') })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('not a Mole Office database')
  })
})

describe('the default destination is a stamped file in the backups directory', () => {
  it('names the file after the moment it was taken, so two backups cannot collide', () => {
    const { file, db } = servedDatabase(5)
    try {
      const target = join(dir, 'backups', 'mole-office-20260812-000000.db')
      const run = backup(['--to', target], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      // The directory is created rather than required to exist: an operator's first backup must
      // not fail because nobody has made a folder.
      expect(readdirSync(join(dir, 'backups'))).toContain('mole-office-20260812-000000.db')
      // And the report ends with the way back, because a backup whose restore nobody has written
      // down is the thing this wave was about.
      expect(run.stdout).toContain('--check-only')
      expect(run.stdout).toContain('To restore it later')
      // A restore that makes a new file gives the office a new world, so the way back says how the gate-count
      // spool is handed to it (wave 13q item 1h). The command runs with this process's home.
      expect(run.stdout).toContain(theGateCountSpoolStep({ database: file, home: homedir(), change: 'restore-later' }).says)
    } finally {
      db.close()
    }
  })
})

/**
 * THE THREE FOLDERS THE OFFICE ITSELF STORES FILES IN, FOR A DATABASE AT `file`.
 *
 * Asked of the office's own functions, `reportFileDirectory`, `messagePictureDirectory` and
 * `avatarDirectory`, with MOLE_OFFICE_DB pointed at the scratch database first. src/server/lib/backup.ts
 * writes the first two names again because it may not import those modules, so this is what fails if
 * the names drift apart.
 */
async function theOfficesFileFolders(file: string): Promise<{ reportFiles: string; messagePictures: string; avatars: string }> {
  const was = process.env.MOLE_OFFICE_DB
  process.env.MOLE_OFFICE_DB = file
  vi.resetModules()
  try {
    const { reportFileDirectory } = await import('../src/server/lib/reportfiles.ts')
    const { messagePictureDirectory } = await import('../src/server/lib/messagepictures.ts')
    const { avatarDirectory } = await import('../src/server/lib/avatars.ts')
    const folders = { reportFiles: reportFileDirectory(), messagePictures: messagePictureDirectory(), avatars: avatarDirectory() }
    ;(await import('../src/server/db/client.ts')).sqlite.close()
    return folders
  } finally {
    if (was === undefined) delete process.env.MOLE_OFFICE_DB
    else process.env.MOLE_OFFICE_DB = was
  }
}

describe('the backup carries files within the new-byte line and links unchanged files for free', () => {
  /** Small, explicitly synthetic files; old times make dropping utimes fail reliably. */
  function smallFiles(): { paths: string[]; first: string } {
    const paths = ['report-files/nested/a1.ts', 'message-pictures/p1.png', 'avatars/u1.png']
    for (const path of paths) {
      const at = join(dir, path)
      mkdirSync(join(at, '..'), { recursive: true })
      writeFileSync(at, 'fixture')
      utimesSync(at, new Date('2026-09-01T01:02:03.456Z'), new Date('2026-09-01T01:02:03.456Z'))
    }
    mkdirSync(join(dir, 'backups'))
    return { paths, first: join(dir, 'backups', 'mole-office-20260901-010203.db') }
  }

  /** Publish the files alongside a synthetic database marker, as main publishes a checked .db. */
  function firstFilesBackup(first: string): ReturnType<typeof carryTheFiles> {
    const carried = carryTheFiles(dir, first, 100)
    writeFileSync(first, 'synthetic database marker for the file-carrying test')
    utimesSync(first, new Date('2026-09-01T01:02:03Z'), new Date('2026-09-01T01:02:03Z'))
    return carried
  }

  /** Patch a filesystem operation only in the real command's test process, before tsx imports it. */
  function withFileOperation(body: string): Record<string, string> {
    const at = join(dir, 'file-operation.mjs')
    writeFileSync(at, `import fs from 'node:fs'\nimport { syncBuiltinESMExports } from 'node:module'\n${body}\nsyncBuiltinESMExports()\n`)
    return { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${pathToFileURL(at).href}` }
  }

  /** A replaceable space, including the old bytes the office moves into .versions/. */
  function smallSpace(): { paths: string[]; bytes: number } {
    const paths = ['personal-spaces/madeUpAgent/memory/notes.md', 'personal-spaces/madeUpAgent/.versions/memory/notes.md/1']
    const contents = ['space memory', 'old memory']
    for (const [i, path] of paths.entries()) {
      mkdirSync(join(dir, path, '..'), { recursive: true })
      writeFileSync(join(dir, path), contents[i]!)
      const time = new Date('2026-09-01T01:02:03.456Z')
      utimesSync(join(dir, path), time, time)
    }
    return { paths, bytes: contents.reduce((sum, content) => sum + Buffer.byteLength(content), 0) }
  }

  /** Mutation a: send personal spaces through the link planner instead of always copying them. */
  it('a: spaces are copied again while unchanged report files are linked and space bytes stay outside newBytes', () => {
    const { file, db } = servedDatabase(1)
    try {
      const { paths, first } = smallFiles()
      const space = smallSpace()
      const initial = backup(['--to', first], { MOLE_OFFICE_DB: file })
      expect(initial.status, initial.stderr).toBe(0)
      const second = join(dir, 'backups', 'spaces-and-links.db')
      const run = backup(['--to', second, '--json'], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      const carried = JSON.parse(run.stdout).files
      expect(carried).toMatchObject({ outcome: 'copied', linked: 3, copied: 0, newBytes: 0, bytesWritten: space.bytes })
      expect(carried.always).toEqual([{ name: 'personal-spaces', present: true, files: 2, bytes: space.bytes }])
      for (const path of paths) {
        expect(statSync(join(filesFolderOf(second), path)).ino).toBe(statSync(join(filesFolderOf(first), path)).ino)
      }
      for (const path of space.paths) {
        expect(statSync(join(filesFolderOf(second), path)).ino).not.toBe(statSync(join(filesFolderOf(first), path)).ino)
        expect(statSync(join(filesFolderOf(second), path)).ino).not.toBe(statSync(join(dir, path)).ino)
        expect(readFileSync(join(filesFolderOf(second), path))).toEqual(readFileSync(join(dir, path)))
      }
      const printed = backup(['--to', join(dir, 'backups', 'printed-spaces.db')], { MOLE_OFFICE_DB: file })
      expect(printed.status, printed.stderr).toBe(0)
      expect(printed.stdout).toContain('Files copied: 0, 0 bytes (0 B), including 0 because a link could not be made (EXDEV or EPERM).')
      expect(printed.stdout).toContain('personal-spaces/: 2 files, 22 B, copied whatever the others total.')
      expect(printed.stdout).toContain('Personal space bytes written: 22 (22 B), always copied whole, outside the line.')
      expect(printed.stdout).toContain('File bytes written: 22 (22 B).')
    } finally { db.close() }
  })

  /** Mutation b: count the personal spaces' bytes in newBytes. The plan and list totals must exclude them. */
  it('b: over the line with an earlier backup carries links, copies spaces and lists only the three folders’ new files', () => {
    const { paths, first } = smallFiles()
    const space = smallSpace()
    firstFilesBackup(first)
    const added = ['report-files/nested/new.txt', 'message-pictures/new.png', 'avatars/new.png']
    for (const path of added) writeFileSync(join(dir, path), 'new')
    const second = join(dir, 'backups', 'over-with-spaces.db')
    const carried = carryTheFiles(dir, second, 8)
    expect(carried).toMatchObject({
      outcome: 'carried with new files left out', linked: 3, copied: 0, newBytes: 9,
      leftOut: 3, leftOutBytes: 9, bytesWritten: space.bytes,
      copiedTo: filesFolderOf(second), leftOutList: leftOutListOf(second),
    })
    for (const path of paths) {
      expect(statSync(join(filesFolderOf(second), path)).ino).toBe(statSync(join(filesFolderOf(first), path)).ino)
    }
    for (const path of space.paths) {
      expect(readFileSync(join(filesFolderOf(second), path))).toEqual(readFileSync(join(dir, path)))
      expect(statSync(join(filesFolderOf(second), path)).ino).not.toBe(statSync(join(filesFolderOf(first), path)).ino)
    }
    const listed = readFileSync(leftOutListOf(second), 'utf8')
    expect(listed).toContain('new bytes total 9 bytes, over the line of 8 bytes')
    expect(listed.split('\n\n')[1]!.trim().split('\n').sort()).toEqual(added.map((path) => `3\t${path}`).sort())
    for (const path of [...paths, ...space.paths]) expect(listed).not.toContain(path)
    for (const path of added) expect(existsSync(join(filesFolderOf(second), path))).toBe(false)
  })

  /** Problem ZxXuR5PBMZqE. Mutation: always print the copied-because clause, including zero. */
  it('over the line with every link working prints some carried without a copied-because clause', () => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    const newPath = 'report-files/new.txt'
    const large = openSync(join(dir, newPath), 'w')
    try { ftruncateSync(large, BACKUP_FILES_LINE_BYTES + 1) } finally { closeSync(large) }
    const { file, db } = servedDatabase(1)
    try {
      const target = join(dir, 'backups', 'all-links-work-printed.db')
      const run = backup(['--to', target], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      const carriedLine = run.stdout.split('\n').find((line) => line.includes('Files: some carried;'))
      expect(carriedLine).toBe(
        `        Files: some carried; new files LEFT OUT. Carried files are in ${filesFolderOf(target)}. ` +
        `The list of new files left out is ${leftOutListOf(target)}.`,
      )
      expect(carriedLine).not.toContain('copied because')
      expect(run.stdout).toContain(`Files linked: 3, 21 bytes (21 B) from ${first}; these count nothing against the line.`)
      expect(run.stdout).toContain('Files copied: 0, 0 bytes (0 B), including 0 because a link could not be made (EXDEV or EPERM).')
      for (const path of paths) {
        expect(statSync(join(filesFolderOf(target), path)).ino).toBe(statSync(join(filesFolderOf(first), path)).ino)
      }
      expect(existsSync(join(filesFolderOf(target), newPath))).toBe(false)
    } finally { db.close() }
  })

  /** Problem ZxXuR5PBMZqE. Mutation: print the plural copied-because clause for one refused link. */
  it('over the line with exactly one EPERM refusal prints one file and its link', () => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    const newPath = 'report-files/new.txt'
    const large = openSync(join(dir, newPath), 'w')
    try { ftruncateSync(large, BACKUP_FILES_LINE_BYTES + 1) } finally { closeSync(large) }
    const { file, db } = servedDatabase(1)
    try {
      const target = join(dir, 'backups', 'one-link-refused-printed.db')
      const injection = withFileOperation(`const link = fs.linkSync\nfs.linkSync = (from, to) => {\n  if (String(from).endsWith('/report-files/nested/a1.ts')) throw Object.assign(new Error('synthetic link refusal'), { code: 'EPERM' })\n  return link(from, to)\n}`)
      const run = backup(['--to', target], { MOLE_OFFICE_DB: file, ...injection })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).toContain(
        `Files: some carried; new files LEFT OUT. Carried files are in ${filesFolderOf(target)}. ` +
        `1 file was copied because its link could not be made (EXDEV or EPERM). ` +
        `The list of new files left out is ${leftOutListOf(target)}.`,
      )
      expect(run.stdout).toContain(`Files linked: 2, 14 bytes (14 B) from ${first}; these count nothing against the line.`)
      expect(run.stdout).toContain('Files copied: 1, 7 bytes (7 B), including 1 because a link could not be made (EXDEV or EPERM).')
      for (const path of paths) {
        expect(readFileSync(join(filesFolderOf(target), path))).toEqual(readFileSync(join(dir, path)))
        if (path === 'report-files/nested/a1.ts') {
          expect(statSync(join(filesFolderOf(target), path)).ino).not.toBe(statSync(join(filesFolderOf(first), path)).ino)
        } else {
          expect(statSync(join(filesFolderOf(target), path)).ino).toBe(statSync(join(filesFolderOf(first), path)).ino)
        }
      }
      expect(existsSync(join(filesFolderOf(target), newPath))).toBe(false)
    } finally { db.close() }
  })

  /** Problem -ZJxLg3DoiJM. Mutation: decide the over-line outcome by said.linked > 0 again. */
  it('over the small line carries every planned link as a copy when EPERM refuses every link', () => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    const newPath = 'report-files/new.txt'
    writeFileSync(join(dir, newPath), 'new bytes')
    const second = join(dir, 'backups', 'all-links-refused.db')
    const makeLink = vi.fn(() => { throw Object.assign(new Error('synthetic link refusal'), { code: 'EPERM' }) })
    const carried = carryTheFiles(dir, second, 8, second, makeLink)
    expect(makeLink).toHaveBeenCalledTimes(paths.length)
    expect(carried).toMatchObject({
      outcome: 'carried with new files left out', linked: 0, copied: 3, copiedBecauseLinkFailed: 3,
      newBytes: 9, leftOut: 1, leftOutBytes: 9, bytesWrittenBeyondPlan: 21,
      copiedTo: filesFolderOf(second), leftOutList: leftOutListOf(second),
    })
    for (const path of paths) {
      expect(readFileSync(join(filesFolderOf(second), path))).toEqual(readFileSync(join(dir, path)))
      expect(statSync(join(filesFolderOf(second), path)).ino).not.toBe(statSync(join(filesFolderOf(first), path)).ino)
    }
    expect(existsSync(join(filesFolderOf(second), newPath))).toBe(false)
    expect(readFileSync(leftOutListOf(second), 'utf8').split('\n\n')[1]!.trim()).toBe(`9\t${newPath}`)
    // Exercise the real printed line too. Only this new file is sparse and over the real line;
    // it is left out, so neither its bytes nor a large copy are allocated.
    const { file, db } = servedDatabase(1)
    try {
      const large = openSync(join(dir, newPath), 'w')
      try { ftruncateSync(large, BACKUP_FILES_LINE_BYTES + 1) } finally { closeSync(large) }
      const printedCopy = join(dir, 'backups', 'all-links-refused-printed.db')
      const injection = withFileOperation(`fs.linkSync = () => { throw Object.assign(new Error('synthetic link refusal'), { code: 'EPERM' }) }`)
      const run = backup(['--to', printedCopy], { MOLE_OFFICE_DB: file, ...injection })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).toContain(
        `Files: some carried; new files LEFT OUT. Carried files are in ${filesFolderOf(printedCopy)}. ` +
        `3 files were copied because links could not be made (EXDEV or EPERM). ` +
        `The list of new files left out is ${leftOutListOf(printedCopy)}.`,
      )
      expect(run.stdout).not.toContain('This backup holds none')
      for (const path of paths) {
        expect(readFileSync(join(filesFolderOf(printedCopy), path))).toEqual(readFileSync(join(dir, path)))
      }
      expect(existsSync(join(filesFolderOf(printedCopy), newPath))).toBe(false)
    } finally { db.close() }
  })

  /** Mutation c: decide the over-line outcome from hasFilesFolder, which may exist only for spaces. */
  it('c: over the line with nothing linked is left out even while its files folder holds a copied space', () => {
    smallFiles()
    const space = smallSpace()
    const target = join(dir, 'backups', 'only-spaces.db')
    const carried = carryTheFiles(dir, target, 20)
    expect(carried).toMatchObject({
      outcome: 'left out', linked: 0, newBytes: 21, leftOut: 3,
      copiedTo: filesFolderOf(target), leftOutList: leftOutListOf(target), bytesWritten: space.bytes,
    })
    expect(existsSync(filesFolderOf(target))).toBe(true)
    expect(existsSync(join(filesFolderOf(target), 'report-files'))).toBe(false)
    for (const path of space.paths) expect(readFileSync(join(filesFolderOf(target), path))).toEqual(readFileSync(join(dir, path)))
    expect(readFileSync(leftOutListOf(target), 'utf8')).not.toContain(space.paths[0]!)
  })

  /** Mutation d: skip personal spaces in the final size check before the backup takes its name. */
  it('d: a space file with a different size at the final check fails the whole backup and leaves nothing at the destination', () => {
    const { file, db } = servedDatabase(1)
    try {
      const space = smallSpace()
      const target = join(dir, 'backups', 'short-space.db')
      const injection = withFileOperation(`const copy = fs.copyFileSync\nfs.copyFileSync = (from, to, ...args) => {\n  copy(from, to, ...args)\n  if (String(to).includes('.files/personal-spaces/') && String(to).endsWith('/memory/notes.md')) fs.truncateSync(to, 1)\n}`)
      const run = backup(['--to', target], { MOLE_OFFICE_DB: file, ...injection })
      expect(run.status, run.stdout).toBe(1)
      expect(run.stderr).toContain("does not have its source's size of 12 bytes")
      expect(run.stderr).toContain('the database copy has been DELETED as well')
      expect(readdirSync(join(dir, 'backups'))).toEqual([])
      expect(readFileSync(join(dir, space.paths[0]!), 'utf8')).toBe('space memory')
    } finally { db.close() }
  })

  /** Mutation: restore the earlier 2 GB constant. */
  it('the new-byte line is exactly 10 GiB', () => {
    expect(BACKUP_FILES_LINE_BYTES).toBe(10737418240)
  })

  /** Mutation: measure total bytes against the line again. All files must still be carried. */
  it.each([3, 4])('carries a total over the line when only 3 new bytes are at or under a %s-byte line', (line) => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    const added = 'report-files/nested/new.txt'
    writeFileSync(join(dir, added), 'new')
    const second = join(dir, 'backups', 'under.db')
    const carried = carryTheFiles(dir, second, line)
    expect(carried).toMatchObject({
      outcome: 'copied', bytes: 24, newBytes: 3, line,
      linked: 3, linkedBytes: 21, copied: 1, copiedBytes: 3,
      leftOut: 0, leftOutBytes: 0, bytesWritten: 3, bytesWrittenBeyondPlan: 0,
    })
    for (const path of paths) {
      expect(statSync(join(filesFolderOf(second), path)).ino).toBe(statSync(join(filesFolderOf(first), path)).ino)
    }
    expect(readFileSync(join(filesFolderOf(second), added), 'utf8')).toBe('new')
    expect(existsSync(leftOutListOf(second))).toBe(false)
  })

  /** Mutation: carry no files at all when over the line, including those planned for linking. */
  it('over the new-byte line carries linked files and lists only the new files left out', () => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    const added = ['report-files/nested/new.txt', 'avatars/new.png']
    writeFileSync(join(dir, added[0]!), 'new')
    writeFileSync(join(dir, added[1]!), 'face')
    const second = join(dir, 'backups', 'over.db')
    const carried = carryTheFiles(dir, second, 6)
    expect(carried).toMatchObject({
      outcome: 'carried with new files left out', files: 5, bytes: 28, newBytes: 7, line: 6,
      linked: 3, linkedBytes: 21, copied: 0, copiedBytes: 0, leftOut: 2, leftOutBytes: 7,
      bytesWritten: 0, copiedTo: filesFolderOf(second), leftOutList: leftOutListOf(second),
    })
    for (const path of paths) {
      expect(statSync(join(filesFolderOf(second), path)).ino).toBe(statSync(join(filesFolderOf(first), path)).ino)
    }
    const listed = readFileSync(leftOutListOf(second), 'utf8')
    for (const path of added) expect(existsSync(join(filesFolderOf(second), path))).toBe(false)
    for (const path of paths) expect(listed).not.toContain(path)
    expect(listed).toContain('3\treport-files/nested/new.txt')
    expect(listed).toContain('4\tavatars/new.png')
    expect(listed).toContain('new bytes total 7 bytes, over the line of 6 bytes')
    expect(listed).toContain('over the line of 6 bytes, so none of the new files was copied')
  })

  /** Mutation: ignore st_dev and treat unchanged files on another device as linkable. */
  it('previous files on another device all count as new before any write', () => {
    const { first } = smallFiles()
    firstFilesBackup(first)
    const second = join(dir, 'backups', 'another-device.db')
    const makeLink = vi.fn(linkSync)
    const deviceOf = vi.fn((path: string) => {
      expect(existsSync(filesFolderOf(second))).toBe(false)
      expect(existsSync(leftOutListOf(second))).toBe(false)
      return path === filesFolderOf(first) ? 1 : 2
    })
    const carried = carryTheFiles(dir, second, 20, second, makeLink, deviceOf)
    expect(carried).toMatchObject({
      outcome: 'left out', newBytes: 21, linked: 0, copied: 0,
      leftOut: 3, leftOutBytes: 21, bytesWritten: 0, copiedTo: null,
    })
    expect(deviceOf.mock.calls.map(([path]) => path)).toEqual([filesFolderOf(first), join(dir, 'backups')])
    expect(makeLink).not.toHaveBeenCalled()
    expect(existsSync(filesFolderOf(second))).toBe(false)
    expect(readFileSync(leftOutListOf(second), 'utf8')).toContain('7\tavatars/u1.png')
  })

  /** Mutations: publish only the files folder, omit the partial outcome, or remove the printed byte counts. */
  it('the command publishes both linked files and the new-file list and reports their bytes and line', () => {
    const { file, db } = servedDatabase(1)
    try {
      mkdirSync(join(dir, 'report-files'))
      writeFileSync(join(dir, 'report-files', 'held.txt'), 'fixture')
      const first = join(dir, 'backups', 'first.db')
      expect(backup(['--to', first], { MOLE_OFFICE_DB: file }).status).toBe(0)
      // Sparse synthetic file: no large allocation or copy; the command must leave it out.
      const large = openSync(join(dir, 'report-files', 'new.bin'), 'w')
      try { ftruncateSync(large, BACKUP_FILES_LINE_BYTES + 1) } finally { closeSync(large) }
      const second = join(dir, 'backups', 'partial.db')
      const run = backup(['--to', second], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).toContain('Files: some carried; new files LEFT OUT.')
      expect(run.stdout).toContain(`Files linked: 1, 7 bytes (7 B) from ${first}; these count nothing against the line.`)
      expect(run.stdout).toContain('Files copied: 0, 0 bytes (0 B), including 0 because a link could not be made (EXDEV or EPERM).')
      expect(run.stdout).toContain('Files left out: 1, 10737418241 bytes (10 GB).')
      expect(run.stdout).toContain('New file bytes planned: 10737418241; line: 10737418240 bytes (10 GB), decision YBUxSiGdDrB_.')
      expect(run.stdout).toContain(`cp -a ${filesFolderOf(second)}/. ${dir}/`)
      expect(run.stdout).toContain(`The files named in ${leftOutListOf(second)} are not in this backup`)
      expect(statSync(join(filesFolderOf(second), 'report-files', 'held.txt')).ino).toBe(statSync(join(filesFolderOf(first), 'report-files', 'held.txt')).ino)
      expect(existsSync(join(filesFolderOf(second), 'report-files', 'new.bin'))).toBe(false)
      expect(readFileSync(leftOutListOf(second), 'utf8')).toContain('10737418241\treport-files/new.bin')
    } finally { db.close() }
  })

  /** Mutation: fail to remove the published files folder when publishing the accompanying list fails. */
  it('a partial carry whose list cannot be published removes its database and already-published files', () => {
    const { file, db } = servedDatabase(1)
    try {
      mkdirSync(join(dir, 'report-files'))
      writeFileSync(join(dir, 'report-files', 'held.txt'), 'fixture')
      const first = join(dir, 'backups', 'first.db')
      expect(backup(['--to', first], { MOLE_OFFICE_DB: file }).status).toBe(0)
      const large = openSync(join(dir, 'report-files', 'new.bin'), 'w')
      try { ftruncateSync(large, BACKUP_FILES_LINE_BYTES + 1) } finally { closeSync(large) }
      const second = join(dir, 'backups', 'partial.db')
      const injection = withFileOperation(`const rename = fs.renameSync\nfs.renameSync = (from, to) => {\n  if (String(to).endsWith('partial.left-out.txt')) throw new Error('fixture list publish failure')\n  return rename(from, to)\n}`)
      const run = backup(['--to', second], { MOLE_OFFICE_DB: file, ...injection })
      expect(run.status, run.stderr).toBe(1)
      expect(run.stderr).toContain('fixture list publish failure')
      expect(existsSync(second)).toBe(false)
      expect(existsSync(filesFolderOf(second))).toBe(false)
      expect(existsSync(leftOutListOf(second))).toBe(false)
      expect(readFileSync(join(filesFolderOf(first), 'report-files', 'held.txt'), 'utf8')).toBe('fixture')
    } finally { db.close() }
  })

  /**
   * Problem 9AwaBTTDUh6H. Mutation: always copy instead of linking. The inode assertions
   * and the linked/copied/bytes-written report go red; the new file still has to be copied.
   */
  it('a second backup links unchanged files and copies a file added since, counting both', () => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    const added = 'report-files/nested/new.txt'
    writeFileSync(join(dir, added), 'new')
    const second = join(dir, 'backups', 'second.db')
    const carried = carryTheFiles(dir, second, 100)
    for (const path of paths) {
      expect(statSync(join(filesFolderOf(second), path)).ino).toBe(statSync(join(filesFolderOf(first), path)).ino)
      expect(statSync(join(filesFolderOf(second), path)).ino).not.toBe(statSync(join(dir, path)).ino)
    }
    expect(readFileSync(join(filesFolderOf(second), added), 'utf8')).toBe('new')
    expect(statSync(join(filesFolderOf(second), added)).ino).not.toBe(statSync(join(dir, added)).ino)
    expect(carried).toMatchObject({ linkedFrom: first, linked: 3, copied: 1, copiedBecauseLinkFailed: 0, bytesWritten: 3, files: 4, bytes: 24 })
  })

  /** Mutation: link on path alone. Either size or time alone must prevent reuse. */
  it.each(['size', 'modification time'])('copies a file whose %s changed instead of linking it', (changed) => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    const path = paths[0]!
    const source = join(dir, path)
    if (changed === 'size') writeFileSync(source, 'fixture with more bytes')
    const time = new Date(changed === 'size' ? '2026-09-01T01:02:03.456Z' : '2026-09-01T01:02:03.457Z')
    utimesSync(source, time, time)
    const second = join(dir, 'backups', 'changed.db')
    const carried = carryTheFiles(dir, second, 100)
    expect(carried).toMatchObject({ linked: 2, copied: 1, bytesWritten: statSync(source).size })
    expect(statSync(join(filesFolderOf(second), path)).ino).not.toBe(statSync(join(filesFolderOf(first), path)).ino)
    expect(readFileSync(join(filesFolderOf(second), path))).toEqual(readFileSync(source))
  })

  /** Mutation: do not set the copied file's time. Its old source time differs and the next backup re-copies it. */
  it('a copied file keeps its source modification time so the next backup links it', () => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    for (const path of paths) {
      expect(statSync(join(filesFolderOf(first), path)).mtimeMs).toBe(statSync(join(dir, path)).mtimeMs)
    }
    const second = join(dir, 'backups', 'second.db')
    const carried = carryTheFiles(dir, second, 100)
    expect(carried).toMatchObject({ linked: 3, copied: 0, bytesWritten: 0 })
    expect(statSync(join(filesFolderOf(second), paths[0]!)).ino).toBe(statSync(join(filesFolderOf(first), paths[0]!)).ino)
  })

  /**
   * Mutation: omit extra fallback byte accounting. A refused link writes beyond the zero-byte plan
   * and line without failing. First-pass mutation: remove the EXDEV/EPERM copy fallback.
   */
  it.each(['EXDEV', 'EPERM'])('copies and counts files when links are refused with %s', (code) => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    const second = join(dir, 'backups', 'refused.db')
    const makeLink = vi.fn(() => { throw Object.assign(new Error('fixture link refusal'), { code }) })
    const carried = carryTheFiles(dir, second, 0, second, makeLink)
    expect(makeLink).toHaveBeenCalledTimes(3)
    expect(carried).toMatchObject({ linkedFrom: first, linked: 0, copied: 3, copiedBecauseLinkFailed: 3, bytesWritten: 21, newBytes: 0, line: 0, bytesWrittenBeyondPlan: 21 })
    for (const path of paths) {
      expect(statSync(join(filesFolderOf(second), path)).ino).not.toBe(statSync(join(filesFolderOf(first), path)).ino)
      expect(readFileSync(join(filesFolderOf(second), path))).toEqual(readFileSync(join(dir, path)))
      expect(statSync(join(filesFolderOf(second), path)).mtimeMs).toBe(statSync(join(dir, path)).mtimeMs)
    }
  })

  /** Mutation: choose a files folder without its published .db, descend into work, or include this backup itself. */
  it('with no earlier backup copies everything and never uses work in progress or its own files folder', () => {
    const { paths, first } = smallFiles()
    // The same backup already has a files folder; madeAt is separate, as in the real command.
    expect(firstFilesBackup(first)).toMatchObject({ linkedFrom: null, linked: 0, copied: 3, copiedBecauseLinkFailed: 0, bytesWritten: 21 })
    const work = join(dir, 'backups', '.second.db.being-made-fixture')
    mkdirSync(work)
    const made = join(work, 'second.db')
    copyFileSync(first, made)
    carryTheFiles(dir, made, 100)
    const orphan = join(dir, 'backups', 'orphan.db')
    carryTheFiles(dir, orphan, 100)
    const outputWork = join(dir, 'backups', '.first.db.being-made-fixture')
    mkdirSync(outputWork)
    const carried = carryTheFiles(dir, first, 100, join(outputWork, 'first.db'))
    expect(carried).toMatchObject({ linkedFrom: null, linked: 0, copied: 3, copiedBecauseLinkFailed: 0, bytesWritten: 21 })
    for (const path of paths) {
      expect(statSync(join(carried.copiedTo!, path)).ino).not.toBe(statSync(join(filesFolderOf(first), path)).ino)
    }
  })

  /** Mutation: choose the first backup instead of the newest complete one, or accept a database-only/orphan folder. */
  it('uses the newest earlier complete backup for stamped and --to names', () => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    const newer = join(dir, 'backups', 'before-a-change.db')
    // Copy independently so the two previous backups have distinct inodes.
    carryTheFiles(dir, newer, 100, newer, () => { throw Object.assign(new Error('fixture'), { code: 'EXDEV' }) })
    writeFileSync(newer, 'synthetic database marker')
    utimesSync(newer, new Date('2026-09-02T01:02:03Z'), new Date('2026-09-02T01:02:03Z'))
    writeFileSync(join(dir, 'backups', 'database-only.db'), 'synthetic database marker')
    carryTheFiles(dir, join(dir, 'backups', 'orphan.db'), 100)
    const second = join(dir, 'backups', 'mole-office-20261001-010203.db')
    const carried = carryTheFiles(dir, second, 100)
    expect(carried.linkedFrom).toBe(newer)
    for (const path of paths) {
      expect(statSync(join(filesFolderOf(second), path)).ino).toBe(statSync(join(filesFolderOf(newer), path)).ino)
      expect(statSync(join(filesFolderOf(second), path)).ino).not.toBe(statSync(join(filesFolderOf(first), path)).ino)
    }
  })

  /** Mutation: treat an earlier symlink as an ordinary file. lstat must make this a copy. */
  it('copies when the earlier path is not an ordinary file', () => {
    const { paths, first } = smallFiles()
    firstFilesBackup(first)
    const path = paths[0]!
    rmSync(join(filesFolderOf(first), path))
    symlinkSync(join(dir, path), join(filesFolderOf(first), path))
    const second = join(dir, 'backups', 'ordinary.db')
    const carried = carryTheFiles(dir, second, 100)
    expect(carried).toMatchObject({ linked: 2, copied: 1, bytesWritten: 7 })
    expect(statSync(join(filesFolderOf(second), path)).ino).not.toBe(statSync(join(dir, path)).ino)
  })

  /** Mutation: swallow every link error. EIO must remove the files folder and fail instead of copying. */
  it('an unexpected link error fails the files copy and removes its folder', () => {
    const { first } = smallFiles()
    firstFilesBackup(first)
    const second = join(dir, 'backups', 'failed.db')
    expect(() => carryTheFiles(dir, second, 100, second, () => {
      throw Object.assign(new Error('fixture I/O failure'), { code: 'EIO' })
    })).toThrow('fixture I/O failure')
    expect(existsSync(filesFolderOf(second))).toBe(false)
    expect(existsSync(filesFolderOf(first))).toBe(true)
  })

  /** Mutation: remove the final size check. The command publishes a short file instead of deleting the whole backup. */
  it('a size difference found by the final check fails the whole backup and leaves nothing at the destination', () => {
    const { file, db } = servedDatabase(1)
    try {
      mkdirSync(join(dir, 'report-files'))
      writeFileSync(join(dir, 'report-files', 'a1.txt'), 'fixture bytes')
      const destination = join(dir, 'backups')
      const target = join(destination, 'short.db')
      const injection = withFileOperation(`const copy = fs.copyFileSync\nfs.copyFileSync = (from, to, ...args) => {\n  copy(from, to, ...args)\n  if (String(to).includes('.files/')) fs.truncateSync(to, 1)\n}`)
      const run = backup(['--to', target], { MOLE_OFFICE_DB: file, ...injection })
      expect(run.status, run.stderr).toBe(1)
      expect(run.stderr).toContain("does not have its source's size of 13 bytes")
      expect(run.stderr).toContain('the database copy has been DELETED as well')
      expect(readdirSync(destination)).toEqual([])
      expect(readFileSync(join(dir, 'report-files', 'a1.txt'), 'utf8')).toBe('fixture bytes')
    } finally { db.close() }
  })

  /** Mutation: omit link/fallback/write counts from the human report. A refused link is reported as a copy. */
  it('the printed lines report refused links, their earlier backup and bytes actually written', () => {
    const { file, db } = servedDatabase(1)
    try {
      mkdirSync(join(dir, 'report-files'))
      writeFileSync(join(dir, 'report-files', 'a1.txt'), 'fixture')
      const first = join(dir, 'backups', 'first.db')
      const initial = backup(['--to', first], { MOLE_OFFICE_DB: file })
      expect(initial.status, initial.stderr).toBe(0)
      expect(initial.stdout).toContain('Files linked: 0, 0 bytes (0 B). No earlier backup has a complete files folder.')
      expect(initial.stdout).toContain('Files copied: 1, 7 bytes (7 B), including 0 because a link could not be made (EXDEV or EPERM).')
      expect(initial.stdout).toContain('File bytes written: 7 (7 B).')
      const injection = withFileOperation(`fs.linkSync = () => { throw Object.assign(new Error('fixture link refusal'), { code: 'EXDEV' }) }`)
      const run = backup(['--to', join(dir, 'backups', 'second.db')], { MOLE_OFFICE_DB: file, ...injection })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).toContain(`Files linked: 0, 0 bytes (0 B) from ${first}; these count nothing against the line.`)
      expect(run.stdout).toContain('Files copied: 1, 7 bytes (7 B), including 1 because a link could not be made (EXDEV or EPERM).')
      expect(run.stdout).toContain('File bytes written: 7 (7 B).')
      expect(run.stdout).toContain('File bytes written beyond the plan because links failed: 7 (7 B).')
    } finally { db.close() }
  })

  it('holds a report file, a message picture and an uploaded picture, byte for byte, in the folder named with the same stamp', async () => {
    const { file, db } = servedDatabase(3)
    try {
      const { reportFiles, messagePictures, avatars } = await theOfficesFileFolders(file)
      mkdirSync(reportFiles, { recursive: true })
      mkdirSync(messagePictures, { recursive: true })
      mkdirSync(avatars, { recursive: true })
      const code = Buffer.from('export const answer = 42\n')
      const picture = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3, 255])
      // AN UPLOADED PICTURE (problem EHB5WorEA5L9): after a restore without it, its row answers 410.
      const face = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7])
      writeFileSync(join(reportFiles, 'a1.ts'), code)
      writeFileSync(join(messagePictures, 'p1.png'), picture)
      writeFileSync(join(avatars, 'u1.png'), face)

      const target = join(dir, 'backups', 'mole-office-20260925-010203.db')
      const run = backup(['--to', target], { MOLE_OFFICE_DB: file })

      expect(run.status, run.stderr).toBe(0)
      const folder = join(dir, 'backups', 'mole-office-20260925-010203.files')
      const copiedCode = join(folder, 'report-files', 'a1.ts')
      const copiedPicture = join(folder, 'message-pictures', 'p1.png')
      const copiedFace = join(folder, 'avatars', 'u1.png')
      expect(existsSync(copiedCode), `the report file is not in the backup:\n${run.stdout}`).toBe(true)
      expect(existsSync(copiedPicture), `the message picture is not in the backup:\n${run.stdout}`).toBe(true)
      expect(existsSync(copiedFace), `the uploaded picture is not in the backup:\n${run.stdout}`).toBe(true)
      expect(readFileSync(copiedCode).equals(code), 'the report file was not copied byte for byte').toBe(true)
      expect(readFileSync(copiedPicture).equals(picture), 'the picture was not copied byte for byte').toBe(true)
      expect(readFileSync(copiedFace).equals(face), 'the uploaded picture was not copied byte for byte').toBe(true)
      expect(existsSync(join(dir, 'backups', 'mole-office-20260925-010203.left-out.txt'))).toBe(false)
      expect(run.stdout).toContain(`linked or copied to ${folder}`)
      expect(run.stdout, 'the restore lines do not say how to put the files back').toContain(`cp -a ${folder}/. ${dir}/`)

      // THE COMMAND COMPARES NEW BYTES AGAINST THE 10 GiB LINE, and says so to a machine as well.
      const json = backup(['--to', join(dir, 'backups', 'second.db'), '--json'], { MOLE_OFFICE_DB: file })
      expect(json.status, json.stderr).toBe(0)
      const said = JSON.parse(json.stdout) as { files: { outcome: string; line: number; files: number; bytes: number } }
      expect(said.files.line).toBe(10737418240)
      expect(said.files.line).toBe(BACKUP_FILES_LINE_BYTES)
      expect(said.files.outcome).toBe('copied')
      expect(said.files.files).toBe(3)
      expect(said.files.bytes).toBe(code.length + picture.length + face.length)
      expect(said.files).toMatchObject({ linkedFrom: target, linked: 3, copied: 0, copiedBecauseLinkFailed: 0, bytesWritten: 0 })
    } finally {
      db.close()
    }
  })

  it('with no earlier backup, over the new-byte line copies none of them and writes a list naming each file left out with its size', () => {
    mkdirSync(join(dir, 'report-files'), { recursive: true })
    mkdirSync(join(dir, 'message-pictures'), { recursive: true })
    mkdirSync(join(dir, 'avatars'), { recursive: true })
    writeFileSync(join(dir, 'report-files', 'big.log'), 'x'.repeat(20))
    writeFileSync(join(dir, 'message-pictures', 'shot.png'), 'y'.repeat(10))
    writeFileSync(join(dir, 'avatars', 'face.png'), 'z'.repeat(5))
    mkdirSync(join(dir, 'backups'))
    const copy = join(dir, 'backups', 'mole-office-20260925-010203.db')

    // One byte under the total: over the line.
    const over = carryTheFiles(dir, copy, 34)

    expect(over.outcome).toBe('left out')
    expect(over.files).toBe(3)
    expect(over.bytes).toBe(35)
    expect(over).toMatchObject({ linkedFrom: null, linked: 0, copied: 0, copiedBecauseLinkFailed: 0, bytesWritten: 0 })
    expect(existsSync(join(dir, 'backups', 'mole-office-20260925-010203.files')), 'files were copied over the line').toBe(false)
    const list = join(dir, 'backups', 'mole-office-20260925-010203.left-out.txt')
    expect(over.leftOutList).toBe(list)
    const listed = readFileSync(list, 'utf8')
    expect(listed).toContain('20\treport-files/big.log')
    expect(listed).toContain('10\tmessage-pictures/shot.png')
    expect(listed).toContain('5\tavatars/face.png')

    // New bytes exactly at the line are copied.
    const other = join(dir, 'backups', 'at-the-line.db')
    const at = carryTheFiles(dir, other, 35)
    expect(at.outcome, 'a total equal to the line was left out').toBe('copied')
    expect(existsSync(join(dir, 'backups', 'at-the-line.files', 'report-files', 'big.log'))).toBe(true)
    expect(existsSync(join(dir, 'backups', 'at-the-line.files', 'avatars', 'face.png'))).toBe(true)
    expect(existsSync(join(dir, 'backups', 'at-the-line.left-out.txt'))).toBe(false)
  })

  it('says a folder that is not there is absent, which is not the same as an empty one', () => {
    const { file, db } = servedDatabase(2)
    try {
      mkdirSync(join(dir, 'report-files'))
      const target = join(dir, 'backups', 'one.db')
      const run = backup(['--to', target], { MOLE_OFFICE_DB: file })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).toContain('report-files/: 0 files')
      expect(run.stdout).toContain('There is no message-pictures/ folder beside the database.')
      expect(run.stdout).toContain('There is no avatars/ folder beside the database.')
      expect(existsSync(join(dir, 'backups', 'one.files', 'report-files'))).toBe(true)
      expect(existsSync(join(dir, 'backups', 'one.files', 'message-pictures'))).toBe(false)
      expect(existsSync(join(dir, 'backups', 'one.files', 'avatars'))).toBe(false)

      rmSync(join(dir, 'report-files'), { recursive: true })
      const none = backup(['--to', join(dir, 'backups', 'two.db')], { MOLE_OFFICE_DB: file })
      expect(none.status, none.stderr).toBe(0)
      expect(none.stdout).toContain('There is no report-files/, message-pictures/, avatars/ or personal-spaces/ folder beside the database')
      expect(none.stdout).toContain('Files linked: 0, 0 bytes (0 B).')
      expect(none.stdout).toContain('Files copied: 0, 0 bytes (0 B), including 0 because a link could not be made (EXDEV or EPERM).')
      expect(none.stdout).toContain('File bytes written: 0 (0 B).')
      expect(existsSync(join(dir, 'backups', 'two.files')), 'a files folder was made for folders that are absent').toBe(false)
      expect(none.stdout, 'a restore line names a files folder that does not exist').not.toContain('cp -a')
    } finally {
      db.close()
    }
  })
})
