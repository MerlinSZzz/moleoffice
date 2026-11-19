// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `npm run db:backup` — take a copy of the database that is worth having.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS: THE COMMAND MOLE OFFICE PRINTED LOSES WORK
 * ---------------------------------------------------------------------------------------
 *
 * This product told you to back up by copying the file. `.env.example` said "One file; back it up by
 * copying it." `scripts/reset.ts` printed `cp <file> <file>.backup` before deleting a database, and
 * `db/migrate.ts` printed it in the refuse-to-serve message — which is the exact moment somebody is
 * about to migrate the only copy of their research record.
 *
 * The database runs in WAL mode. Recent writes live in `<file>-wal` until a checkpoint folds them
 * back, so `cp <file>` alone copies the database as of the last checkpoint and silently drops
 * everything since. Measured against the live corpus on 2026-08-12, with the server running:
 *
 *     cp data/panelx.db backup.db     →  423 records, newest change 13:06:45
 *     the truth at that moment        →  429 records, newest change 14:02:16
 *
 * Six records and 55 minutes of work, gone, from a backup that reported nothing wrong. The three
 * hand-made copies then sitting in `data/backups/` were all taken that way and all short: one by
 * 17 hours. Two of them, taken 20 minutes apart under different names, are byte-identical — so the
 * one called `before-move` does not contain the state before the move.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 * SQLite's `VACUUM INTO`, through better-sqlite3 — no new dependency and no `sqlite3` binary needed.
 * It reads a database that is being written to in one read transaction, so the copy is a consistent
 * point-in-time snapshot, write-ahead log included, and never a torn file; a writer is not held
 * meanwhile. It writes only what the database holds now, into new pages, so nothing deleted from the
 * database, and nothing left in its free pages, reaches the copy. Until 21 October 2026 this was the
 * online backup API, which copied every page as it was (src/server/lib/backup.ts says why it changed).
 *
 * THEN IT CHECKS THE COPY, because a backup nobody has verified is a promise rather than a backup,
 * and this project has the receipts: `integrity_check` on the result, Mole Office's tables present, and
 * every table's row count compared against the source. A copy that fails is DELETED — an unverified
 * file in a backups directory is worse than no file at all, because it will be trusted on the day
 * it is needed.
 *
 * AND IT CARRIES NO KEY HASHES. The copy holds every table, `held_keys` included, and that table
 * holds the SHA-256 of every key the office ever issued. They decided that a copy, a backup and an
 * export carry no key. So the copy is emptied of those tables on its own path after it
 * is written, with SQLite's `secure_delete` on, so what they held is overwritten where it lay.
 * Emptying alone was not enough: a deleted row stays readable in the file's free space, and the secretary
 * found every key hash made before the 18:27 backup in that backup's bytes (problem REGoVTuHW1zo).
 * Then the copy's bytes are searched for every key hash the source holds. When the search finds one,
 * the copy is rewritten once with `VACUUM INTO`, which leaves nothing deleted behind, and searched
 * again. A copy that cannot be emptied, or still holds one of them, is DELETED: a backup carrying key
 * hashes nobody knows about is worse than no backup, because it will be trusted and moved. Until
 * 21 October 2026 every copy was rewritten with VACUUM, which built a second database in the temporary
 * folder and wrote it back through the copy's journal: about three databases on disk at its peak.
 *
 * AND NO VISITOR TOKEN HASH. By the decision of 26 September 2026, a backup leaves
 * out `visitor_credentials.token_hash`, so a restore cannot bring back a visitor ended after the backup
 * was made. Each credential keeps its row, and its token hash is replaced by `REMOVED_MARK` and
 * the row's id, in the same step as the emptying. After a restore, each visitor pairs again. Those token hashes are
 * searched for in the copy's bytes like every key hash.
 *
 * AND NO PANEL LAYOUT. The decision of 29 September 2026 takes `panel_layouts` out of every backup and export, and
 * keeps the table declared. So the copy keeps the table and its rows are deleted in the copy,
 * in the same step and overwritten where they lay, so they are not in its bytes either. The office's own database keeps
 * them. The list is `LEFT_OUT_OF_BACKUPS_AND_EXPORTS` in src/server/db/table-name-lists.ts, and the report says how
 * many rows were left out.
 *
 * ALL OF THAT HAPPENS BEFORE THE COPY HAS THE BACKUP'S NAME. The copy is written into a folder of work
 * in progress beside the destination, `.<name>.being-made-<random>/`, and is renamed to the
 * destination only once it is emptied, searched and verified. A command killed part-way
 * leaves nothing at the destination. `main` says why the folder is not taken for a backup.
 *
 * `--check-only <file>` runs just that verification against a file that already exists, which is
 * what you want after restoring one, and is the only way to find out that a database is damaged
 * before writing more work into it.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE FILES BESIDE THE DATABASE, WHEN THEY ARE NOT VERY LARGE
 * ---------------------------------------------------------------------------------------
 *
 * A report's file block and a message's picture point at bytes that live beside the database, in
 * `report-files/` and `message-pictures/`, not in it, and so does a picture somebody uploaded for a
 * participant, in `avatars/`. Their decision of 16 September 2026: the backup carries
 * those bytes when they are not very large. Decision `YBUxSiGdDrB_` now measures only new
 * file bytes against `BACKUP_FILES_LINE_BYTES`, 10 GiB; files linked from the previous backup count
 * nothing. The earlier line measured the total against 2 GB. `avatars/` joined the other two on 27 September
 * 2026 (problem EHB5WorEA5L9: an uploaded picture was gone after a restore).
 *
 * So after the database copy is made and verified, `carryTheFiles` (src/server/lib/backup.ts) adds up every file under the three
 * folders and decides which unchanged files it can link on the same device before writing anything.
 * At or under the line it links those and copies the new ones into `mole-office-<stamp>.files/`;
 * over it, it still carries the linkable files and lists only new files in
 * `mole-office-<stamp>.left-out.txt`, one line per file with its size. A folder that does not exist is said to be absent, which is a different answer from a folder
 * that is empty.
 *
 * THE FILES ARE COPIED AFTER THE DATABASE. A file stored between the two copies is in the files copy
 * while no record in the database copy points at it. The other way round cannot happen through the
 * office: a file is stored before any record can name it, and nothing in the server deletes one.
 *
 * A FILES COPY THAT FAILS TAKES THE WHOLE BACKUP WITH IT. The database copy is deleted too, so no
 * backup is left that looks complete and is missing the files it is said to carry.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE PERMANENT RESIDENTS' PERSONAL SPACES, ALWAYS, OUTSIDE THE LINE
 * ---------------------------------------------------------------------------------------
 *
 * A resident's space is kept in the office and backed up with
 * the database. GsGFiDygATd5, answer 2: `personal-spaces/`
 * is always copied whole, whatever the other files total, outside the 10 GiB line on new bytes.
 * The earlier 2 GB line under a decision could have left four full spaces out. YBUxSiGdDrB_
 * now limits the three folders' new bytes, while the spaces remain outside the line.
 * So `carryTheFiles` copies `personal-spaces/` into the files folder on every backup, also when the other
 * three folders are over the line and their new files are listed as left out instead. A backup that cannot copy the
 * spaces fails, and the database copy is deleted with it, as for any failed files copy.
 */

import { backupNameFor, readCompleteBackups } from '../src/server/lib/complete-backups.ts'
// THE BACKUP ITSELF IS src/server/lib/backup.ts, which the update press imports as well; this file is the
// command around it: its options, its report and its exit code.
import {
  compareWithDatabase,
  takeTheBackup,
  verify,
  type Comparison,
  type FilesCarried,
  type Taken,
  type Verification,
} from '../src/server/lib/backup.ts'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { loadPanelEnv } from '../src/server/lib/env.ts'
import {
  REPO_ROOT,
  THE_DEVELOPMENT_CHECKOUT,
  gitDirsOf,
  headFromGitDirs,
  isTheProgramRun,
  settings,
  whyThisCheckoutMayNotOpenTheDatabase,
} from '../src/config/settings.mjs'
import { NothingWasRun, runInTheStableCheckout, stopAnUnpairedStableStart, thePairOfThisProcess } from '../src/config/the-office-tool-environment.mjs'
import { BACKUP_FILES_LINE_BYTES, bytesSaid } from '../src/shared/what-is-kept.ts'
// WHICH TABLES NO BACKUP CARRIES IS THE SCHEMA'S ANSWER. Importing db/schema.ts opens nothing.
import { NOT_CARRIED_TABLES } from '../src/server/db/schema.ts'
import { theGateCountSpoolStep } from '../tools/stable/stable-gate-count-spool-step.mjs'

interface Options {
  to: string | null
  ifOlderThan: number | null
  checkOnly: string | null
  json: boolean
  /** The database alone: the files beside it are not copied and not listed. tools/office-copy.mjs asks for this. */
  databaseOnly: boolean
}

const HELP = `npm run db:backup — take a verified copy of the Mole Office database.

  npm run db:backup                     copy MOLE_OFFICE_DB to data/backups/mole-office-<stamp>.db, then verify it
  npm run db:backup -- --to <file>      write the copy here instead
  npm run db:backup -- --if-older-than <minutes>  rely on a newer complete backup instead of copying
  npm run db:backup -- --check-only <f> verify a file that already exists; copy nothing
  npm run db:backup -- --json           machine-readable report on stdout
  npm run db:backup -- --database-only  copy the database alone, and not the files beside it

It copies with SQLite's VACUUM INTO, in one read transaction, so it is safe to run while the server
is serving, and it captures the write-ahead log. Copying the .db file on its own does not: measured
on this project's own corpus, a plain cp was short by 6 records and 55 minutes of work.

The copy carries no key hashes: the office's key store is emptied in the copy after it is written,
what it held is overwritten where it lay, and the copy's bytes are searched for every key hash the
office holds; when one is found, the copy is rewritten once and searched again. So a copy, a backup and an export carry no key. A copy that cannot be emptied, or
in which a key hash is found, is deleted. --check-only reads the key store's rows and not the bytes.

The copy carries no visitor token hash either. Each visitor credential keeps
its row, but its token hash is replaced by a note saying it was removed, so after a restore each
visitor pairs again.

The copy carries no panel_layouts rows. The table is in the copy, empty; the
office's own database keeps its rows.

The copy is made in a hidden folder beside the destination, .<name>.being-made-<random>/, and is
moved to the destination only after every check has passed. Until then nothing is written at the
destination. The command removes that folder when it ends. If the command is killed, the folder
may be left behind, and it may hold key hashes: delete it.

A copy that fails verification is deleted rather than left to be trusted later.

The backup also carries the files under report-files/, message-pictures/ and avatars/ beside the
database, which is where a report's files, a message's pictures and the pictures somebody uploaded for
a participant are stored. The copy mole-office-<stamp>.db gets a folder mole-office-<stamp>.files/ and/or
a list mole-office-<stamp>.left-out.txt beside it (with --to <name>.db, they are <name>.files/ and
<name>.left-out.txt):
  - unchanged files on the same device are linked from the previous backup and count no new bytes;
  - at or under ${String(BACKUP_FILES_LINE_BYTES)} new bytes (10 GiB), new files are copied too;
  - over that line, only the linkable files are carried, and the list names the new files left out;
  - a refused link (EXDEV or EPERM) is copied and reported as bytes written beyond the plan;
  - a folder that does not exist is reported as absent; when none of the four exists, no files are written.
The permanent residents' personal spaces, under personal-spaces/, are ALWAYS copied whole into the folder,
whatever the other files total; the 10 GiB line on new bytes does not count them.
If the files cannot be copied or listed, the database copy is deleted too, so nothing that looks like
a whole backup is left. If the folder or the list is already there, nothing is written at all.
With --database-only, no files are copied and no list is written, and the report says so.`

function readOptions(argv: readonly string[]): Options | { help: string } | { error: string } {
  const opts: Options = { to: null, ifOlderThan: null, checkOnly: null, json: false, databaseOnly: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { help: HELP }
    else if (arg === '--json') opts.json = true
    else if (arg === '--database-only') opts.databaseOnly = true
    else if (arg === '--if-older-than') {
      const value = argv[++i]
      if (value === undefined || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
        return { error: 'backup: --if-older-than needs a positive whole number of minutes. Nothing was written.' }
      }
      opts.ifOlderThan = Number(value)
    } else if (arg === '--to' || arg === '--check-only') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        return { help: `${arg} needs a file path after it.\n\n${HELP}` }
      }
      if (arg === '--to') opts.to = value
      else opts.checkOnly = value
      i++
    } else return { help: `Unknown option "${arg}".\n\n${HELP}` }
  }
  return opts
}


/** The same comparison evidence accompanies successes, refusals and copies. */
function comparisonLines(comparison: Comparison): string[] {
  const { database, reason, sameDatabase } = comparison.comparedWith
  const lines = [database === null
    ? `Compared with the schema alone because ${reason}.`
    : sameDatabase
      ? `The checked file is the database at ${database} itself (the same real path).`
      : `Compared with the database at ${database}, opened read-only.`]
  if (comparison.notYetCreatedTables.length > 0) {
    lines.push(
      `Neither this file nor the database at ${database} has ${comparison.notYetCreatedTables.join(', ')} yet. ` +
      `A migration that creates them has not been applied. This is expected before migrating.`,
    )
  }
  if (comparison.predatesPartTables.length > 0) {
    const tables = comparison.predatesPartTables
    lines.push(
      `This backup is older than the schema part ${tables.length === 1 ? 'table' : 'tables'} ${tables.join(', ')}: ` +
        `its own migration journal does not record the migration that creates ${tables.length === 1 ? 'it' : 'them'}, ` +
        `so ${tables.length === 1 ? 'it' : 'they'} did not exist when the backup was made. ` +
        `That is not lost work, so the backup is kept and is not called failed.`,
    )
  }
  if (comparison.journalUnreadable !== null && comparison.absentPartTables.length > 0) {
    const tables = comparison.absentPartTables
    lines.push(
      `The file's migration journal could not be read (${comparison.journalUnreadable}), so whether it ` +
        `predates ${tables.join(', ')} could not be told. ${tables.length === 1 ? 'That table is' : 'Those tables are'} ` +
        `named as missing until the comparison with the database decides.`,
    )
  }
  if (comparison.pendingMigrations === null) {
    lines.push(`Pending migration names are unknown: ${comparison.pendingMigrationsUnknownReason}.`)
  } else if (comparison.pendingMigrations.length > 0) {
    lines.push(`Migrations not yet applied: ${comparison.pendingMigrations.join(', ')}.`)
  }
  return lines
}

/** Only actual shortfalls (or explicitly unverified schema absences) get the restore warning. */
function shortfall(comparison: Comparison): string {
  const missing = comparison.missingTables
  const rows = Object.entries(comparison.missingTableRows)
  return (
    `It is intact, and it lacks ${missing.join(', ')}. ` +
    (rows.length === 0 ? '' : `The compared database holds ${rows.map(([table, count]) => count === null
      ? `${table}: row count unknown (SQLite says: ${comparison.missingTableRowsUnknownReason?.[table]})`
      : `${table}: ${count} row${count === 1 ? '' : 's'}`).join(', ')}. `) +
    `Restoring it gives you a database with NO ROWS in ${missing.length === 1 ? 'that table' : 'those tables'}: ` +
    `whatever was in ${missing.length === 1 ? 'it' : 'them'} is not in this file and cannot be got back from ` +
    `it. \`npm run db:migrate\` creates ${missing.length === 1 ? 'the table' : 'the tables'} empty after a ` +
    `restore; it does not bring the rows back.` +
    (comparison.missingPartTables.length === 0 || comparison.journalUnreadable !== null
      ? ''
      : ` The schema parts declare ${comparison.missingPartTables.join(', ')}, and this file's own migration ` +
        `journal says it took the migration that created ${comparison.missingPartTables.length === 1 ? 'it' : 'them'}, ` +
        `so ${comparison.missingPartTables.length === 1 ? 'that part table is' : 'those part tables are'} missing work.`)
  )
}


/** One sentence per folder: what it held, or that it is not there. */
function folderLines(carried: FilesCarried): string[] {
  return [
    ...carried.folders.map((folder) =>
      folder.present
        ? `${folder.name}/: ${String(folder.files)} file${folder.files === 1 ? '' : 's'}, ${bytesSaid(folder.bytes)}.`
        : `There is no ${folder.name}/ folder beside the database.`,
    ),
    ...carried.always.map((folder) =>
      folder.present
        ? `${folder.name}/: ${String(folder.files)} file${folder.files === 1 ? '' : 's'}, ${bytesSaid(folder.bytes)}, copied whatever the others total.`
        : `There is no ${folder.name}/ folder beside the database, so no personal space was there to copy.`,
    ),
  ]
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(0)} KB`

/** WHICH CODE MAKES THIS BACKUP: this checkout as a real path, and its commit, or null with the reason it was not read. */
interface MadeBy {
  checkout: string
  commit: string | null
  couldNotRead?: string
}

function whatMakesIt(): MadeBy {
  const checkout = realpathSync(REPO_ROOT)
  const dirs = gitDirsOf(checkout)
  if (dirs === null) return { checkout, commit: null, couldNotRead: `${checkout} is not a git checkout` }
  const couldNotRead: string[] = []
  const head = headFromGitDirs(dirs, checkout, couldNotRead)
  return head === null ? { checkout, commit: null, couldNotRead: couldNotRead.join('; ') } : { checkout, commit: head.full }
}

/** The first line of a backup's report: which checkout and commit made it, and the development checkout it is paired with. */
function madeByLine(made: MadeBy): string {
  const at = made.commit === null ? ` at a commit that could not be read (${String(made.couldNotRead)})` : ` at commit ${made.commit}`
  const paired = THE_DEVELOPMENT_CHECKOUT === null ? '' : `, paired with the development checkout ${THE_DEVELOPMENT_CHECKOUT}`
  return `backup: made by the code of the checkout ${made.checkout}${at}${paired}.`
}

async function main(): Promise<void> {
  const parsed = readOptions(process.argv.slice(2))
  if ('error' in parsed) {
    console.error(parsed.error)
    process.exitCode = 1
    return
  }
  if ('help' in parsed) {
    console.log(parsed.help)
    return
  }

  // Before the database path is read, and this script reads it itself rather than through
  // db/client.ts: the client opens the file for WRITING and puts it into WAL mode, which is not
  // something a backup command may do to a database it was asked to copy — least of all one it was
  // asked to `--check-only` because it is suspected of being damaged.
  loadPanelEnv()

  const sourceRefusal = whyThisCheckoutMayNotOpenTheDatabase(settings().databasePath)
  // A DEVELOPMENT CHECKOUT WHOSE .env NAMES THE STABLE CHECKOUT backs up through it (wave 13q, part d): the stable
  // checkout's own copy of this command runs, paired, with the same arguments, and its exit is this one's.
  if (sourceRefusal !== null && THE_DEVELOPMENT_CHECKOUT === null && thePairOfThisProcess() !== null) {
    try {
      process.exitCode = runInTheStableCheckout('scripts/backup.ts', process.argv.slice(2), 'backup')
      return
    } catch (error) {
      if (error instanceof NothingWasRun) throw new Error(`${sourceRefusal} ${error.message}`)
      throw error
    }
  }
  if (sourceRefusal !== null) throw new Error(sourceRefusal)

  if (parsed.checkOnly !== null) {
    const checkRefusal = whyThisCheckoutMayNotOpenTheDatabase(resolve(parsed.checkOnly))
    if (checkRefusal !== null) throw new Error(checkRefusal)
    const found = verify(resolve(parsed.checkOnly))
    const comparison = compareWithDatabase(found, settings().databasePath)
    report(found, comparison, null, parsed.json)
    // A SHORTFALL EXITS 1 HERE AND NOT IN THE COPY PATH BELOW. This asks whether a restore
    // would lose a table the compared database holds, not whether the code declares more tables
    // (problem EmrByGikzsr-). With no usable comparison, the schema-only refusal says why.
    // The copy path asks whether the copy captured the source. An absence alone never exits 1
    // there: a faithful old-schema copy is the backup needed immediately before migrating.
    if (!comparison.ok) process.exitCode = 1
    return
  }

  const source = settings().databasePath
  // THE BACKUPS FOLDER IS WORKED OUT IN ONE PLACE, src/config/settings.mjs, and it sits beside the
  // database being copied. `--to` still names a file of the caller's own.
  const backups = settings().backupsDirectory
  const target = resolve(parsed.to ?? join(backups, backupNameFor('the-backup-command')))
  const targetRefusal = whyThisCheckoutMayNotOpenTheDatabase(target)
  if (targetRefusal !== null) throw new Error(targetRefusal)
  // QxRMxHCu89OG and EjcIVl6bmpDL, after problem 9AwaBTTDUh6H linked unchanged files:
  // the floor trades at most an hour of writes without a copy before a landing that changes no
  // schema. A migration always asks for a fresh copy, without this flag. Read only the top level,
  // like previousBackupWithFiles: a published ordinary .db, never a work folder or WAL/SHM file.
  // Inspector refusal lwEVe2a5IVna: a name alone proves nothing. A database without its files
  // folder or left-out list may be a half-written backup, killed between the publishing renames.
  if (parsed.ifOlderThan !== null && existsSync(dirname(target))) {
    const found = readCompleteBackups(dirname(target))
    const candidates = [...found.backups, ...found.unstamped]
      .flatMap((one) => one.complete && one.entry.path !== source
        ? [{ copy: one.entry.path, time: one.time, ageFrom: one.ageFrom }] : [])
      .sort((a, b) => b.time - a.time || b.copy.localeCompare(a.copy))
    const newest = candidates[0]
    if (newest !== undefined) {
      const ageMinutes = (Date.now() - newest.time) / 60_000
      if (ageMinutes < parsed.ifOlderThan) {
        // A JSON line survives npm's extra output and carries the path and age without matching
        // prose. Exit 0 makes the skip a success for npm and for land.mjs.
        console.log(JSON.stringify({ backupSkipped: true, backup: newest.copy, ageMinutes, ageFrom: newest.ageFrom }))
        if (!parsed.json) console.log(`backup: skipped; relying on ${newest.copy}, ${ageMinutes.toFixed(2)} minutes old.`)
        return
      }
    }
  }
  if (target === source) {
    console.error(`backup: the destination is the source (${target}). That would not be a backup.`)
    process.exitCode = 1
    return
  }
  const took = await takeTheBackup(source, target, parsed.databaseOnly)
  if (!took.taken) {
    console.error(took.command === undefined ? took.said : `${took.said} ${took.command}`)
    process.exitCode = 1
    return
  }
  // WHICH CODE MADE THE COPY, on the report's first line and in the JSON. The backup keeps no file of its own about
  // itself, so the report is where this is said.
  const madeBy = whatMakesIt()
  if (!parsed.json) console.log(madeByLine(madeBy))
  report(took.found, took.comparison, took.how, parsed.json, madeBy)
}


/**
 * WHAT THE FILE HOLDS IN THE TABLES A COPY MUST NOT CARRY, as one line a person reads.
 *
 * AN ABSENCE NOBODY PRINTS IS AN ABSENCE NOBODY CHECKS. `held_keys` is not authored, so the count
 * beside the records in every other line here would never mention it, and "no key hashes" would be a
 * silence rather than a statement. A file that predates the table has no row to lose, and that is a
 * different sentence from a table that is there and empty.
 *
 * ROWS ARE NOT BYTES. `searched` is how many key hashes of the source were looked for in the file's
 * bytes and not found, which only the copy path knows. `--check-only` has no source to read them
 * from, so it passes `null` and the line says it read the rows and not the bytes: a backup made
 * before the rewrite was added has an empty `held_keys` and every deleted hash still in its bytes.
 * The visitors' token hashes are among the ones searched for.
 */
function keyHashesLine(found: Verification, searched: number | null, rewritten = false): string {
  for (const table of NOT_CARRIED_TABLES) {
    const rows = found.counts.get(table)
    if (rows === undefined) return `It predates \`${table}\`, so it carries no key hashes.`
    if (rows > 0) return `It carries ${rows} key hash${rows === 1 ? '' : 'es'} in \`${table}\`, which a backup must not.`
  }
  const tables = NOT_CARRIED_TABLES.join(', ')
  if (searched === null) {
    return (
      `\`${tables}\` has no rows. This check reads rows and not the file's bytes, so a key hash deleted ` +
      `from the table may still be in the file.`
    )
  }
  const emptied = rewritten
    ? `It carries no key hashes: \`${tables}\` is empty, and the copy was rewritten once with VACUUM INTO because the byte search still found a hash after the emptying`
    : `It carries no key hashes: \`${tables}\` is empty, and what it held was overwritten where it lay`
  if (searched === 0) return `${emptied}. The source holds no key hash, so there was none to look for in its bytes.`
  return `${emptied}. None of the ${searched} key hash${searched === 1 ? '' : 'es'} the source holds is in its bytes.`
}

/**
 * THE VISITOR TOKEN HASHES A BACKUP LEAVES OUT, in one sentence, never with a
 * hash. `cleared` is what `emptyAndScrub` answered: one entry per cleared column of a table the copy
 * has, so an empty list means the copy predates `visitor_credentials`. The copy path only reaches this
 * after `verify` found no value left uncleared and the byte search found none of the source's hashes.
 */
function visitorTokensLine(cleared: { table: string; column: string; rows: number }[]): string {
  const rows = cleared.reduce((sum, one) => sum + one.rows, 0)
  if (cleared.length === 0) return `It predates \`visitor_credentials\`, so it carries no visitor token hash.`
  if (rows === 0) return `It holds no visitor credential, so it has no visitor token hash to leave out.`
  return (
    `It carries no visitor token hash: its ${rows} visitor credential${rows === 1 ? ' keeps its row' : 's keep their rows'} ` +
    `without ${rows === 1 ? 'its' : 'their'} token hash${rows === 1 ? '' : 'es'}, because a decision leaves ` +
    `them out of every backup, so after a restore each visitor must pair again before it can work.`
  )
}

/** Say what happened. One shape for the machine, one for the person. */
function report(
  found: Verification,
  comparison: Comparison,
  taken: Taken | null,
  json: boolean,
  madeBy: MadeBy | null = null,
): void {
  const records = found.counts.get('records') ?? 0
  if (json) {
    console.log(
      JSON.stringify(
        {
          ...(taken === null ? { checked: found.file } : { from: taken.source, to: found.file, ms: taken.tookMs }),
          ...(madeBy === null ? {} : { madeBy }),
          ...comparison,
          bytes: found.bytes,
          counts: Object.fromEntries(found.counts),
          // THE TABLES A COPY MUST NOT CARRY, named rather than left out. `null` means the file
          // predates the table; a number is what it really holds, and anything above zero is a
          // problem. A machine reading this sees the same answer a person does.
          notCarried: Object.fromEntries(
            NOT_CARRIED_TABLES.map((table) => [table, found.counts.has(table) ? (found.counts.get(table) ?? 0) : null]),
          ),
          // HOW MANY KEY HASHES OF THE SOURCE WERE LOOKED FOR IN THE COPY'S BYTES, none found. Only the
          // copy path has a source to read them from, so `--check-only` leaves it out.
          ...(taken !== null ? { keyHashesSearchedInBytes: taken.keyHashesSearched } : {}),
          // AND WHETHER THE COPY WAS REWRITTEN once with VACUUM INTO, because the byte search still found a
          // hash after the emptying. Only the copy path searches, so `--check-only` leaves it out.
          ...(taken !== null ? { rewrittenAfterTheSearch: taken.rewrittenAfterTheSearch } : {}),
          // AND HOW MANY ROWS OF EACH CLEARED COLUMN WERE CLEARED, by `table.column`. A column of a
          // table the copy predates is not named. tools/office-copy.mjs reads this.
          ...(taken !== null
            ? { cleared: Object.fromEntries(taken.cleared.map((one) => [`${one.table}.${one.column}`, one.rows])) }
            : {}),
          // AND HOW MANY ROWS OF EACH TABLE NO BACKUP CARRIES WERE LEFT OUT of the copy,
          // by table. A table the copy predates is not named.
          ...(taken !== null ? { leftOut: taken.leftOut } : {}),
          ...(taken !== null && taken.moved.length > 0 ? { changedDuringCopy: taken.moved } : {}),
          // THE FILES BESIDE THE DATABASE, on every copy: copied, left out, or none there. `null`
          // with `databaseOnly: true` means nobody asked for them, which is not the same as none there.
          ...(taken !== null ? { files: taken.carried, databaseOnly: taken.carried === null } : {}),
          ...(found.problems.length > 0 ? { problems: found.problems } : {}),
        },
        null,
        2,
      ),
    )
    return
  }

  for (const line of comparisonLines(comparison)) console.log(`        ${line}`)

  if (found.problems.length > 0) {
    console.error(`backup: ${found.file} is NOT a usable backup.\n`)
    for (const p of found.problems) console.error(`  - ${p}`)
    console.error(`\nDo not write work into it and do not restore from it without reading this first.`)
    return
  }

  const links = found.counts.get('links') ?? 0
  const changes = found.counts.get('changes') ?? 0
  if (taken === null) {
    if (comparison.missingTables.length > 0) {
      console.error(
        `backup: ${found.file} is NOT a complete Mole Office database.\n\n  ${shortfall(comparison)}\n\n` +
          `  What it does hold: ${records} records, ${links} links, ${changes} changes, ${kb(found.bytes)}.\n\n` +
          `It is still the best copy you have if it is the only one. Restore it, run \`npm run db:migrate\`, ` +
          `and know that the tables above start empty.`,
      )
      console.error(`  ${keyHashesLine(found, null)}`)
      return
    }
    console.log(
      `backup: ${found.file} is a usable Mole Office database — SQLite's integrity check passes, ` +
        `${records} records, ${links} links, ${changes} changes, ${kb(found.bytes)}.`,
    )
    console.log(`        ${keyHashesLine(found, null)}`)
    return
  }

  // The copy is right and the SOURCE is old: it lacks these tables too, because the migration
  // creating them has not been applied yet (problem EmrByGikzsr-). The shared comparison lines
  // above say that explicitly, without calling absent work lost. The file is KEPT: it is the
  // faithful pre-migration copy the operator will need if `npm run db:migrate` goes wrong.
  console.log(
    `backup: ${taken.source}\n     -> ${found.file}\n` +
      `        ${records} records, ${links} links, ${changes} changes, ${kb(found.bytes)}, in ${taken.tookMs} ms. ` +
      `Verified: integrity check passes and every table it carries matches the source.`,
  )
  console.log(`        ${keyHashesLine(found, taken.keyHashesSearched, taken.rewrittenAfterTheSearch)}`)
  console.log(`        ${visitorTokensLine(taken.cleared)}`)
  for (const [table, rows] of Object.entries(taken.leftOut)) {
    console.log(
      `        It carries no ${table} rows: the owner's decision leaves that table out of every backup. ` +
        `The table is in the copy, empty; ${rows} row${rows === 1 ? ' was' : 's were'} left out, and the office's own database keeps ${rows === 1 ? 'it' : 'them'}.`,
    )
  }
  if (taken.moved.length > 0) {
    // Said out loud rather than smoothed over: the operator now knows this snapshot is of a moving
    // database, and which tables were moving.
    console.log(
      `        The database was being written to while this ran (${taken.moved.join(', ')}), so this is a ` +
        `point-in-time snapshot from somewhere in that range. That is what a copy in one read transaction is for.`,
    )
  }
  const carried = taken.carried
  const line = carried === null ? '' : bytesSaid(carried.line)
  if (carried === null) {
    console.log(
      `        Files: none were copied and none were listed, because --database-only asked for the database alone. ` +
        `A report's files, a message's pictures, uploaded pictures and the residents' personal spaces are not in this copy.`,
    )
  } else if (carried.outcome === 'none there') {
    console.log(`        There is no report-files/, message-pictures/, avatars/ or personal-spaces/ folder beside the database, so there were no files to copy.`)
  } else if (carried.outcome === 'copied') {
    console.log(
      `        Files: ${String(carried.files)} file${carried.files === 1 ? '' : 's'}, ${bytesSaid(carried.bytes)}, ` +
        `linked or copied to ${String(carried.copiedTo)}, because new bytes are at or under the ${line} line.`,
    )
    for (const said of folderLines(carried)) console.log(`          ${said}`)
  } else {
    // Problem -ZJxLg3DoiJM: fallback copies are carried files. Name them in this line too.
    // Problem ZxXuR5PBMZqE, chapter 10: say links failed only when they did, and use the singular for one.
    console.log(carried.outcome === 'carried with new files left out'
      ? `        Files: some carried; new files LEFT OUT. Carried files are in ${String(carried.copiedTo)}. ` +
        (carried.copiedBecauseLinkFailed > 0
          ? carried.copiedBecauseLinkFailed === 1
            ? `1 file was copied because its link could not be made (EXDEV or EPERM). `
            : `${String(carried.copiedBecauseLinkFailed)} files were copied because links could not be made (EXDEV or EPERM). `
          : '') +
        `The list of new files left out is ${String(carried.leftOutList)}.`
      : `        Files: all report files, message pictures and uploaded pictures LEFT OUT. This backup holds none of those files. The list of what was left out is ${String(carried.leftOutList)}.`)
    if (carried.always.some((folder) => folder.present)) {
      console.log(`        The residents' personal spaces were copied to ${String(carried.copiedTo)} all the same: every backup carries them.`)
    }
    for (const said of folderLines(carried)) console.log(`          ${said}`)
  }
  if (carried !== null) {
    console.log(carried.linkedFrom !== null
      ? `        Files linked: ${String(carried.linked)}, ${String(carried.linkedBytes)} bytes (${bytesSaid(carried.linkedBytes)}) from ${carried.linkedFrom}; these count nothing against the line.`
      : carried.outcome === 'copied'
        ? `        Files linked: 0, 0 bytes (0 B). No earlier backup has a complete files folder.`
        : `        Files linked: 0, 0 bytes (0 B).`)
    console.log(
      `        Files copied: ${String(carried.copied)}, ${String(carried.copiedBytes)} bytes (${bytesSaid(carried.copiedBytes)}), including ${String(carried.copiedBecauseLinkFailed)} because a link could not be made (EXDEV or EPERM).`,
    )
    console.log(`        Files left out: ${String(carried.leftOut)}, ${String(carried.leftOutBytes)} bytes (${bytesSaid(carried.leftOutBytes)}).`)
    console.log(`        New file bytes planned: ${String(carried.newBytes)}; line: ${String(carried.line)} bytes (${line}), decision YBUxSiGdDrB_.`)
    const spaceBytes = carried.always.reduce((sum, folder) => sum + folder.bytes, 0)
    console.log(`        Personal space bytes written: ${String(spaceBytes)} (${bytesSaid(spaceBytes)}), always copied whole, outside the line.`)
    console.log(`        File bytes written: ${String(carried.bytesWritten)} (${bytesSaid(carried.bytesWritten)}).`)
    console.log(`        File bytes written beyond the plan because links failed: ${String(carried.bytesWrittenBeyondPlan)} (${bytesSaid(carried.bytesWrittenBeyondPlan)}).`)
  }
  const databaseDirectory = dirname(taken.source)
  console.log(
    `\nTo restore it later, with nothing running against the database:\n` +
      `    npm run db:backup -- --check-only ${found.file}\n` +
      `    cp ${found.file} ${taken.source}\n` +
      (carried !== null && carried.copiedTo !== null
        ? `    cp -a ${carried.copiedTo}/. ${databaseDirectory}/   # puts the copied folders back beside it\n`
        : '') +
      `    npm run db:migrate      # if the backup predates a schema change\n` +
      `    npx tsx scripts/reindex.ts   # only if you use the source-code index; it is not in the archive`,
  )
  if (carried !== null && carried.leftOutList !== null) {
    console.log(
      `The files named in ${String(carried.leftOutList)} are not in this backup, so restoring it does not ` +
        `bring them back.`,
    )
  }
  // A restore that makes a new file gives the office a new world, which then reads nothing from the gate-count spool.
  console.log(`\n${theGateCountSpoolStep({ database: taken.source, home: homedir(), change: 'restore-later' }).says}`)
}

// THE COMMAND RUNS ONLY WHEN IT IS THE COMMAND, through the one rule. Importing this file runs nothing.
// Both sides are real paths, so a checkout reached through a link still runs. The subprocess tests
// in tests/backup.test.ts prove the command still runs: a command that printed nothing would turn them red.
// THE START CHECK (wave 13q) is in the entry guard, before the options are read.
if (isTheProgramRun(import.meta.url, 'scripts/backup.ts')) {
  stopAnUnpairedStableStart()
  await main()
}
