// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `npm run db:rewrite-a-backup -- <file or folder>...` — rewrite a backup made before a backup carried
 * no key hash and no visitor token hash, the way `npm run db:backup` makes one now.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * By point (c) of the decision of 26 September 2026, each backup made before 02:56
 * that day is rewritten the way a backup is made then, and replaces the old file only when every other
 * table's row count is unchanged and the byte search finds no key hash. The secretary runs it
 * and reports each file. Those old backups carry one or more of:
 *
 *   - rows in `held_keys`, the SHA-256 of every key the office issued (backups before the emptying);
 *   - the same hashes in free pages, where the rows were deleted and the file was not rewritten
 *     (problem REGoVTuHW1zo: every key hash made before the 18:27 backup was in its bytes);
 *   - `visitor_credentials.token_hash`, which a backup kept until that decision.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES TO ONE FILE, IN ORDER
 * ---------------------------------------------------------------------------------------
 *
 *   1. It refuses, before it reads anything, the database this checkout serves: the canonical path
 *      the checkout's `.env` names and the path MOLE_OFFICE_DB names, each compared after resolving
 *      links. It refuses a link, a file that does not start with SQLite's header, and a file with a
 *      write-ahead log holding anything or a rollback journal beside it, because then the file alone is
 *      not the whole database.
 *   2. It makes a folder of work in progress beside the file, `.<name>.being-rewritten-<random>/`, the
 *      same kind of hidden folder `npm run db:backup` makes its copy in, so nothing that lists backups
 *      takes it for one (scripts/backup.ts, `main`, says why). Nothing in it has the backup's name.
 *   3. It copies the file there byte for byte, once: the copy to read the original from. The original is
 *      never opened with SQLite: opening a file in WAL mode, even read-only, writes a write-ahead log and
 *      a shared-memory file beside it (measured 26 September 2026).
 *   4. It checks the reading copy the way `npm run db:backup -- --check-only` does (`verify` in
 *      scripts/backup.ts): SQLite's integrity check, and a `records` table, so it is a Mole Office
 *      database. Key hashes in it are not a problem here: taking them out is the job. If the file and
 *      the office's database both hold an installation row, the two ids must be the same.
 *   5. It works out which hashes to search for (below), and counts how many are in the original's
 *      bytes. `--dry` stops here and says what the rewrite would do.
 *   6. It writes the copy to rewrite with `VACUUM INTO` from the reading copy: only the rows the backup
 *      holds, into new pages, so nothing in the old backup's free pages is carried. On it, it runs
 *      `emptyAndScrub` from src/config/what-a-copy-must-not-carry.mjs, the function a backup runs: it
 *      empties NOT_CARRIED_TABLES and clears COLUMNS_A_COPY_CLEARS, overwriting what they held where it
 *      lay. Then the byte search, which rewrites the copy once more with `VACUUM INTO` when it still finds
 *      a hash (`hashesLeftAfterAtMostOneRewrite`).
 *   7. It checks the rewritten copy: `verify` with key material counted as a problem, no hash of the
 *      search in its bytes, and every table's row count the same as the original's, except the tables
 *      that are emptied on purpose.
 *   8. Only when every check passed does it rename the copy over the original, in one step: the folder
 *      is in the same directory, so the rename happens at once or not at all.
 *
 * ON ANY FAILURE THE ORIGINAL IS LEFT AS IT WAS, byte for byte: nothing before step 8 writes to it. The
 * folder of work in progress is removed on every way out the program sees. A program killed outright
 * runs no code at all, so it leaves that folder behind, and the folder holds copies of the original,
 * key hashes and all: delete it.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH HASHES IT SEARCHES FOR, AND WHAT THAT CAN MISS
 * ---------------------------------------------------------------------------------------
 *
 * An old backup's `held_keys` may have no rows while its free pages hold every hash it once had, and a
 * deleted row cannot be read back as a row. So the search is the union of:
 *
 *   - every held key hash and every visitor token hash in the backup's own rows
 *     (`keyHashesACopyIsSearchedFor` on the reading copy);
 *   - every held key hash and every visitor token hash in the office's own database, the one
 *     MOLE_OFFICE_DB names, opened read-only. `held_keys` keeps a revoked key's row, so this holds
 *     every key the office made that it still has a row for, which covers the hashes an old backup
 *     keeps in its free pages.
 *
 * WHAT IT CAN MISS: a 64-character hash that is in neither list, such as a key whose row was deleted
 * from the office's `held_keys` itself, or a key of another installation. The rewrite does not depend
 * on the search to take those out of free pages: `VACUUM INTO` writes every live row into fresh pages, so
 * no deleted content survives it. What the search can miss after the rewrite is such a hash kept in a live
 * row of a table the backup carries, for example pasted into a record. When the office's database
 * cannot be read, the search is the backup's own rows alone, and the tool says so.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * It never prints a hash or a key: every line gives counts. It never picks a folder by itself: with no
 * path it prints its help and exits 2. It never touches the files folder or the left-out list beside a
 * backup. It never writes to the office's database, which it opens read-only to read its key hashes
 * and its installation.
 */

import Database from 'better-sqlite3'
import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPanelEnv } from '../src/server/lib/env.ts'
import { canonicalDatabasePath, settings, whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import { withTheWayForThisJob } from '../src/config/the-office-tool-environment.mjs'
import { NOT_CARRIED_TABLES } from '../src/server/db/schema.ts'
import { installationOf } from '../src/server/db/citizenship-migration.ts'
import {
  COLUMNS_A_COPY_CLEARS,
  emptyAndScrub,
  hashesFoundInTheBytesOf,
  hashesLeftAfterAtMostOneRewrite,
  keyHashesACopyIsSearchedFor,
  keyHashesHeldIn,
  valuesNotCleared,
} from '../src/config/what-a-copy-must-not-carry.mjs'
import { tableCounts, verify } from '../src/server/lib/backup.ts'

const HELP = `npm run db:rewrite-a-backup -- [--dry] <file or folder>...

Rewrite each backup named the way npm run db:backup makes one now: the key
store emptied, every visitor token hash cleared, and the file written again with VACUUM INTO so nothing
deleted is left in it. The new file replaces the old one only when SQLite's integrity check passes, no key
hash searched for is in its bytes, and every other table holds as many rows as before. On any failure
the old file is left exactly as it was.

  <file>     a backup file
  <folder>   every backup file directly in it (files that start with SQLite's header; hidden names
             are skipped). Nothing is read from a folder you did not name.
  --dry      say, for each file, how many key hashes its bytes hold and what the rewrite would do.
             Nothing beside the backups is written; each file is read through a copy in the system's
             temporary folder, which is removed.

It refuses the database this checkout serves, a link, a file that is not a SQLite database, a file
that is not a Mole Office database, and a backup of another installation.

Each rewrite is made in a hidden folder beside the file, .<name>.being-rewritten-<random>/. If the
command is killed, that folder may be left behind, and it holds copies of the old file: delete it.

It never prints a hash or a key.`

/** SQLite's own first 16 bytes, which every database file starts with. */
const SQLITE_HEADER = 'SQLite format 3\u0000'

/** What happened to one file, as lines a person reads, and whether it went as asked. */
interface Outcome {
  file: string
  ok: boolean
  lines: string[]
}

/** The office's own database, read once: its installation and every hash it holds. */
interface TheOffice {
  path: string
  installation: string | null
  hashes: Set<string>
  /** Why it could not be read, or null because it was. */
  unread: string | null
}

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`

/** Whether a file starts with SQLite's header. Reads 16 bytes and nothing else. */
function startsLikeSQLite(file: string): boolean {
  const fd = openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(16)
    const read = readSync(fd, buffer, 0, 16, 0)
    return read === 16 && buffer.toString('latin1') === SQLITE_HEADER
  } finally {
    closeSync(fd)
  }
}

/** A path with its links resolved when it exists, and resolved as written when it does not. */
function realOrResolved(file: string): string {
  const at = resolve(file)
  return existsSync(at) ? realpathSync(at) : at
}

/**
 * THE DATABASES THIS CHECKOUT SERVES, which are never rewritten: the canonical one the checkout's `.env`
 * names, and the one MOLE_OFFICE_DB names in this environment. Usually they are the same file.
 */
function theServedDatabases(): Set<string> {
  return new Set([realOrResolved(canonicalDatabasePath()), realOrResolved(settings().databasePath)])
}

/** Read the office's database once, read-only: its installation and every key and token hash it holds. */
function readTheOffice(): TheOffice {
  const path = settings().databasePath
  if (!existsSync(path)) return { path, installation: null, hashes: new Set(), unread: 'there is no file there' }
  let db: Database.Database | null = null
  try {
    db = new Database(path, { readonly: true, fileMustExist: true })
    return { path, installation: installationOf(db), hashes: keyHashesACopyIsSearchedFor(db), unread: null }
  } catch (err) {
    return { path, installation: null, hashes: new Set(), unread: (err as Error).message }
  } finally {
    db?.close()
  }
}

/** The files a folder holds that start with SQLite's header, directly in it, and the ones left alone. */
function backupsIn(folder: string): { files: string[]; leftAlone: string[] } {
  const files: string[] = []
  const leftAlone: string[] = []
  for (const name of readdirSync(folder).sort()) {
    if (name.startsWith('.')) continue
    const at = join(folder, name)
    const stat = lstatSync(at)
    if (!stat.isFile()) {
      if (!stat.isDirectory()) leftAlone.push(`${at}: it is not an ordinary file, so it was left alone.`)
      continue
    }
    if (startsLikeSQLite(at)) files.push(at)
    else leftAlone.push(`${at}: it does not start with SQLite's header, so it is not a backup and was left alone.`)
  }
  return { files, leftAlone }
}

/**
 * WHY THIS FILE IS NOT ONE THE TOOL MAY TOUCH, or null. Asked before anything is copied or opened.
 */
function refusalOf(file: string, served: Set<string>): string | null {
  if (served.has(realOrResolved(file))) {
    return 'it is the database this checkout serves, not a backup. This tool never rewrites it. Nothing was read.'
  }
  if (!existsSync(file)) return 'there is no file there.'
  const stat = lstatSync(file)
  if (stat.isSymbolicLink()) return 'it is a link. Name the backup file itself. Nothing was changed.'
  if (!stat.isFile()) return 'it is not an ordinary file. Nothing was changed.'
  if (!startsLikeSQLite(file)) return "it does not start with SQLite's header, so it is not a backup of this office. Nothing was changed."
  const log = `${file}-wal`
  if (existsSync(log) && statSync(log).size > 0) {
    return (
      `its write-ahead log ${log} holds ${plural(statSync(log).size, 'byte', 'bytes')}, so the file alone is not the whole ` +
      'database, and replacing it would lose what the log holds. Nothing was changed.'
    )
  }
  if (existsSync(`${file}-journal`)) {
    return `a rollback journal ${file}-journal is beside it, so a write to it did not finish. Nothing was changed.`
  }
  return null
}

/** Count every table of a file, opened read-only. */
function countsOf(file: string): Map<string, number> {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return tableCounts(db)
  } finally {
    db.close()
  }
}

/** Rewrite one file, or with `dry` only say what the rewrite would do. */
function rewriteOne(file: string, dry: boolean, office: TheOffice, served: Set<string>): Outcome {
  const refused = refusalOf(file, served)
  if (refused !== null) return { file, ok: false, lines: [`REFUSED: ${refused}`] }

  const work = dry
    ? mkdtempSync(join(tmpdir(), 'mole-office-rewrite-dry-'))
    : mkdtempSync(join(dirname(file), `.${basename(file)}.being-rewritten-`))
  const throwAwayTheWork = (): void => rmSync(work, { recursive: true, force: true })
  const unchanged = 'The file was not changed.'
  try {
    // THE READING COPY. Everything the tool learns about the original is read from this, so the
    // original is never opened with SQLite.
    const reading = join(work, 'the-original-as-read.db')
    copyFileSync(file, reading)
    const found = verify(reading, { keyMaterialIsAProblem: false })
    if (found.problems.length > 0) {
      return {
        file,
        ok: false,
        lines: [`REFUSED: it is not a Mole Office database this tool can rewrite. ${unchanged}`, ...found.problems.map((p) => `  - ${p}`)],
      }
    }
    const readDb = new Database(reading, { readonly: true, fileMustExist: true })
    let installation: string | null
    let heldRows: number
    let tokenValues: number
    const hashes = new Set(office.hashes)
    try {
      installation = installationOf(readDb)
      heldRows = keyHashesHeldIn(readDb).length
      tokenValues = valuesNotCleared(readDb)
      keyHashesACopyIsSearchedFor(readDb, hashes)
    } finally {
      readDb.close()
    }
    if (installation !== null && office.installation !== null && installation !== office.installation) {
      return {
        file,
        ok: false,
        lines: [
          `REFUSED: it is a backup of another installation (its installation id is ${installation}; the office's ` +
            `database at ${office.path} says ${office.installation}). ${unchanged}`,
        ],
      }
    }
    const before = found.counts
    const inTheBytes = hashesFoundInTheBytesOf(file, hashes)
    const said: string[] = [
      `It is a Mole Office database: SQLite's integrity check passes, ${plural(before.get('records') ?? 0, 'record', 'records')}, ` +
        `${plural(statSync(file).size, 'byte', 'bytes')}.`,
      ...(found.missing.length === 0
        ? []
        : [`It predates ${found.missing.join(', ')}; the rewrite leaves that as it is and adds no table.`]),
      installation === null
        ? `It holds no installation row, so which installation it belongs to could not be compared.`
        : office.installation === null
          ? `The office's database holds no installation row to compare it with.`
          : `Its installation is the office's own.`,
      `Its bytes hold ${String(inTheBytes)} of the ${plural(hashes.size, 'key hash', 'key hashes')} searched for ` +
        `(the key and visitor token hashes in its own rows and in the office's database).`,
      ...(office.unread === null
        ? []
        : [`The office's database at ${office.path} could not be read (${office.unread}), so only the hashes in this file's own rows were searched for.`]),
      `${NOT_CARRIED_TABLES.map((t) => `\`${t}\``).join(', ')}: ${
        before.has(NOT_CARRIED_TABLES[0]) ? plural(heldRows, 'row', 'rows') : 'not in this file'
      }. Visitor token hashes still in \`${COLUMNS_A_COPY_CLEARS.map((c) => `${c.table}.${c.column}`).join(', ')}\`: ${String(tokenValues)}.`,
    ]

    if (dry) {
      return {
        file,
        ok: true,
        lines: [
          ...said,
          `The rewrite would write the file again with VACUUM INTO, empty ${NOT_CARRIED_TABLES.join(', ')}, clear the visitor ` +
            `token hashes, and replace this file only if the integrity check passes, none of those hashes is left in its bytes, ` +
            `and every other table holds as many rows as now. --dry changed nothing.`,
        ],
      }
    }

    // THE COPY TO REWRITE, written with VACUUM INTO from the reading copy: the rows the backup holds, in new
    // pages, and nothing of its free pages.
    const copy = join(work, basename(file))
    let cleared: { table: string; column: string; rows: number }[]
    let left: number
    try {
      const from = new Database(reading, { readonly: true, fileMustExist: true })
      try {
        from.prepare('VACUUM INTO ?').run(copy)
      } finally {
        from.close()
      }
      const db = new Database(copy, { fileMustExist: true })
      try {
        cleared = emptyAndScrub(db)
      } finally {
        db.close()
      }
      ;({ left } = hashesLeftAfterAtMostOneRewrite(copy, hashes, (one) => new Database(one, { readonly: true, fileMustExist: true })))
    } catch (err) {
      return { file, ok: false, lines: [...said, `FAILED: the copy could not be written, emptied and searched: ${(err as Error).message}. ${unchanged}`] }
    }

    const problems: string[] = []
    if (left > 0) problems.push(`${String(left)} of the ${plural(hashes.size, 'key hash', 'key hashes')} searched for ${left === 1 ? 'is' : 'are'} still in the rewritten copy's bytes`)
    const checked = verify(copy)
    problems.push(...checked.problems)
    // EVERY OTHER TABLE HOLDS AS MANY ROWS AS THE ORIGINAL. The emptied tables are the only ones a
    // rewrite changes on purpose.
    const after = checked.problems.length === 0 ? checked.counts : countsOf(copy)
    const emptied = new Set<string>(NOT_CARRIED_TABLES)
    for (const table of new Set([...before.keys(), ...after.keys()])) {
      if (emptied.has(table)) continue
      const had = before.get(table)
      const has = after.get(table)
      if (had === undefined) problems.push(`the rewritten copy has a table \`${table}\` the original does not`)
      else if (has === undefined) problems.push(`the rewritten copy has no \`${table}\` table and the original has one`)
      else if (has !== had) problems.push(`\`${table}\`: the rewritten copy holds ${String(has)} rows, the original held ${String(had)}`)
    }
    const log = `${copy}-wal`
    if (existsSync(log) && statSync(log).size > 0) {
      problems.push(`the rewritten copy's write-ahead log holds ${plural(statSync(log).size, 'byte', 'bytes')}, so the file alone is not the whole copy`)
    }
    if (problems.length > 0) {
      return { file, ok: false, lines: [...said, `FAILED: the rewritten copy did not pass its checks, so it was thrown away. ${unchanged}`, ...problems.map((p) => `  - ${p}`)] }
    }

    const bytesBefore = statSync(file).size
    // THE ONE STEP THAT CHANGES THE ORIGINAL.
    renameSync(copy, file)
    const clearedRows = cleared.reduce((sum, one) => sum + one.rows, 0)
    return {
      file,
      ok: true,
      lines: [
        ...said,
        `REWRITTEN: ${NOT_CARRIED_TABLES.join(', ')} emptied, ${plural(clearedRows, 'visitor token hash', 'visitor token hashes')} cleared, ` +
          `and the file written again with VACUUM INTO. SQLite's integrity check passes, none of the ` +
          `${plural(hashes.size, 'key hash', 'key hashes')} searched for is in its bytes, and each of the ` +
          `${plural([...before.keys()].filter((t) => !emptied.has(t)).length, 'other table', 'other tables')} holds as many rows as before. ` +
          `${plural(bytesBefore, 'byte', 'bytes')} before, ${plural(statSync(file).size, 'byte', 'bytes')} now.`,
      ],
    }
  } catch (err) {
    return { file, ok: false, lines: [`FAILED: ${(err as Error).message}. ${unchanged}`] }
  } finally {
    throwAwayTheWork()
  }
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    return
  }
  const dry = args.includes('--dry')
  const named = args.filter((a) => a !== '--dry')
  const unknown = named.filter((a) => a.startsWith('--'))
  if (unknown.length > 0 || named.length === 0) {
    console.error(`${unknown.length > 0 ? `Unknown option ${unknown.join(', ')}.` : 'Name at least one backup file or folder.'}\n\n${HELP}`)
    process.exitCode = 2
    return
  }
  loadPanelEnv()
  const refusal = whyThisCheckoutMayNotOpenTheDatabase(settings().databasePath)
  if (refusal !== null) throw new Error(withTheWayForThisJob(refusal))
  const served = theServedDatabases()

  const files: string[] = []
  const notes: string[] = []
  for (const one of named) {
    const at = resolve(one)
    if (existsSync(at) && lstatSync(at).isDirectory()) {
      const { files: found, leftAlone } = backupsIn(at)
      files.push(...found)
      notes.push(...leftAlone)
      if (found.length === 0) notes.push(`${at}: it holds no backup file.`)
    } else files.push(at)
  }
  const office = readTheOffice()

  let failed = 0
  console.log(`rewrite-a-backup${dry ? ' --dry' : ''}: ${plural(files.length, 'file', 'files')}.`)
  for (const file of files) {
    const fileRefusal = whyThisCheckoutMayNotOpenTheDatabase(file)
    if (fileRefusal !== null) throw new Error(fileRefusal)
    const outcome = rewriteOne(file, dry, office, served)
    if (!outcome.ok) failed++
    console.log(`\n${file}`)
    for (const line of outcome.lines) console.log(`  ${line}`)
  }
  for (const note of notes) console.log(`\n${note}`)
  console.log(
    `\n${dry ? 'Would rewrite' : 'Rewrote'} ${String(files.length - failed)} of ${plural(files.length, 'file', 'files')}` +
      `${failed > 0 ? `; ${String(failed)} refused or failed, and each of those is unchanged` : ''}.`,
  )
  if (failed > 0) process.exitCode = 1
}

// THE COMMAND RUNS ONLY WHEN IT IS THE COMMAND, as in scripts/backup.ts.
const invokedAs = process.argv[1]
if (invokedAs !== undefined && realpathSync(invokedAs) === realpathSync(fileURLToPath(import.meta.url))) main()
