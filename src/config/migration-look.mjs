// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHETHER THE DATABASE HAS CAUGHT UP WITH THE CODE, READ WITHOUT WRITING ANYTHING AND WITHOUT A
 * SERVER.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `nxDRPQ0IZcOU`, 13 September 2026. A merge carried migration 0165 and the server files the
 * dev supervisor watches. The supervisor restarted the API on the merged code before the migration
 * had run; the start guard refused — `REFUSING TO SERVE`, a database behind the code — and the
 * supervisor, built a day earlier for problem `7-lQDWANdVAn`, would not start the server again until
 * a file it is built from changed or a person ran it. The migration then ran (70 applied became 71),
 * but a migration changes no source file, so the API stayed down until a person touched a server
 * file by hand. The office was down for two minutes.
 *
 * The supervisor's rule is still right for a database that is damaged or is not Mole Office's: those
 * are not fixed by waiting. It is wrong for a database that is merely behind, because that is fixed
 * by a migration landing, and the supervisor can tell when it has landed by reading the journal
 * table and the migrations folder, which are already on disk.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT READS
 * ---------------------------------------------------------------------------------------
 *
 * drizzle writes one row into `__drizzle_migrations` for each migration it applies, carrying the hash
 * of that migration's file and its `when` value out of `drizzle/meta/_journal.json`. The database is
 * behind the code while a migration in the folder has not been applied, and which ones have not is
 * worked out here, by `theMigrationsNotYetApplied`, for the migrator, this look and the backup alike.
 *
 * ---------------------------------------------------------------------------------------
 * A MIGRATION IS APPLIED BECAUSE IT IS MISSING, NOT BECAUSE ITS DATE IS LATER
 * ---------------------------------------------------------------------------------------
 *
 * drizzle applies a migration only when its `when` is later than the newest `created_at`, so one with
 * an earlier or equal `when` is skipped without a word. On 10 October 2026 six branches were adding
 * migrations at once, several with the same `when`, and whichever landed first would have made the
 * others skip. So from index 212 on, a migration is applied when its hash is not in the table, in
 * index order, and never because of its `when` (round 17d of wave 13v).
 *
 * UP TO INDEX 211 THE DATE STILL DECIDES, because the hash cannot. On 2 October 2026 commit 1aee76c7b
 * rewrote the comments of 39 migration files that every office had already applied, and the hash is
 * of the whole file, comments included. Those offices hold the old hashes. Judged by hash, all 39
 * would run again. Judged by date, as they always were, none does.
 *
 * EDITING A MIGRATION FROM INDEX 212 ON AFTER IT HAS LANDED RUNS IT AGAIN on every office that has
 * it, because its hash changes. Do not edit a landed migration; write a new one.
 *
 * ---------------------------------------------------------------------------------------
 * READ-ONLY, ON THE SUPERVISOR'S OWN CLOCK
 * ---------------------------------------------------------------------------------------
 *
 * The database is opened read-only and must exist, one value is read, and it is closed. Nothing is
 * written, nothing is started, and no request is made to the office. It is deliberately NOT
 * `MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES`: that setting is about watches missing source changes and
 * keeps its own meaning. This look is about one fact the guard already stated, and it runs only
 * while the supervisor has stopped starting the server because of it.
 *
 * IF THE FILE OR THE TABLE CANNOT BE READ THE ANSWER IS `unreadable`, never `behind: false`. An
 * unreadable database is not a database that has caught up, and starting a server on that guess is
 * the thing this whole file exists to prevent. The caller says so once and keeps looking.
 *
 * IT IS JAVASCRIPT, LIKE `guard-refusal.mjs` AND `settings.mjs`, because `tools/serve-dev.mjs` is
 * run by the bare word `node` and must keep working when the TypeScript in the checkout does not.
 * `src/server/db/migrate.ts` imports the table name from here, so the name is written once for the
 * writer and the reader.
 */

import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { whyThisCheckoutMayNotOpenTheDatabase } from './settings.mjs'

/**
 * THE TABLE DRIZZLE WRITES ONE ROW INTO FOR EVERY MIGRATION IT APPLIES.
 *
 * `src/server/db/migrate.ts` reads this name from here for its own queries, so the name the
 * supervisor looks for and the name the migrator writes cannot drift apart.
 */
export const THE_MIGRATION_JOURNAL_TABLE = '__drizzle_migrations'

/**
 * THE LAST INDEX AT WHICH A MIGRATION IS STILL JUDGED BY ITS DATE: 0211, the newest migration on main
 * before the rule changed. See "A migration is applied because it is missing" above.
 */
export const THE_LAST_INDEX_JUDGED_BY_ITS_DATE = 211

/**
 * drizzle's own marker between two statements in a migration file (drizzle-orm/migrator.js).
 */
export const THE_STATEMENT_BREAKPOINT = '--> statement-breakpoint'

/**
 * ONE MIGRATION IN THE FOLDER, as drizzle reads it.
 *
 * @typedef {object} FolderMigration
 * @property {number} idx its index in the journal
 * @property {string} tag its file's name without `.sql`
 * @property {number} when its `when` in the journal, which drizzle writes into `created_at`
 * @property {string} hash the sha256 of its file, made as drizzle makes it, so the two agree
 * @property {string[]} sql its statements, split where drizzle splits them
 */

/**
 * EVERY MIGRATION IN THE FOLDER, IN INDEX ORDER, or a refusal that names what is wrong.
 *
 * Refuses a journal entry whose file is missing, and two entries that share an index: either one
 * means two branches' migrations met without being renumbered, and applying the folder anyway would
 * apply one of them and not the other.
 *
 * @param {string} folder the migrations folder, holding `meta/_journal.json`
 * @returns {FolderMigration[]}
 */
export function theMigrationsInTheFolder(folder) {
  const journalFile = join(folder, 'meta', '_journal.json')
  const raw = /** @type {any} */ (JSON.parse(readFileSync(journalFile, 'utf8')))
  /** @type {{ idx: number, tag: string, when: number }[]} */
  const entries = Array.isArray(raw?.entries) ? raw.entries : []
  const missing = entries.filter((entry) => !existsSync(join(folder, `${entry.tag}.sql`)))
  if (missing.length > 0) {
    throw new Error(
      `The migration journal ${journalFile} names ${missing.map((entry) => `${entry.tag} (index ${entry.idx})`).join(', ')}, ` +
        `but ${missing.length === 1 ? 'its file is' : 'their files are'} not in ${folder}. No migration was applied.`,
    )
  }
  /** @type {Map<number, string[]>} */
  const byIndex = new Map()
  for (const entry of entries) byIndex.set(entry.idx, [...(byIndex.get(entry.idx) ?? []), entry.tag])
  const shared = [...byIndex].filter(([, tags]) => tags.length > 1)
  if (shared.length > 0) {
    throw new Error(
      `The migration journal ${journalFile} gives one index to two migrations: ` +
        `${shared.map(([idx, tags]) => `${tags.join(' and ')} are both index ${idx}`).join('; ')}. ` +
        'Each migration needs an index of its own. No migration was applied.',
    )
  }
  return entries
    .map((entry) => {
      const text = readFileSync(join(folder, `${entry.tag}.sql`)).toString()
      return {
        idx: entry.idx,
        tag: entry.tag,
        when: entry.when,
        hash: createHash('sha256').update(text).digest('hex'),
        sql: text.split(THE_STATEMENT_BREAKPOINT),
      }
    })
    .sort((a, b) => a.idx - b.idx)
}

/**
 * THE MIGRATIONS A DATABASE HAS NOT TAKEN, in index order: the one rule, for the migrator, the look and
 * the backup.
 *
 * From index 212 on, a migration has been taken when its hash is in the table. Up to index 211 it has
 * been taken when its hash is there, or when the table holds a `created_at` at or after its `when`,
 * which is drizzle's own rule and the one those migrations were always applied by.
 *
 * @param {{ hash: string, created_at: number | string }[]} rows every row of the journal table
 * @param {FolderMigration[]} migrations the folder, from `theMigrationsInTheFolder`
 * @returns {FolderMigration[]}
 */
export function theMigrationsNotYetApplied(rows, migrations) {
  const hashes = new Set(rows.map((row) => row.hash))
  const newest = rows.reduce((most, row) => Math.max(most, Number(row.created_at)), -Infinity)
  return migrations.filter((migration) => {
    if (hashes.has(migration.hash)) return false
    if (migration.idx <= THE_LAST_INDEX_JUDGED_BY_ITS_DATE && newest >= migration.when) return false
    return true
  })
}

/**
 * WHAT THE LOOK FOUND: whether the database is behind the code, and which migrations it lacks.
 *
 * @typedef {object} MigrationReading
 * @property {boolean} behind true while the database has not taken every migration the code has
 * @property {string[]} missing the tags of the migrations it has not taken, in index order
 */

/** @param {unknown} err @returns {string} */
function why(err) {
  return err instanceof Error ? err.message : String(err)
}

/**
 * WHETHER THE DATABASE HAS CAUGHT UP WITH THE CODE, READ READ-ONLY.
 *
 * @param {object} input
 * @param {string} input.database the database the server would open, absolute
 * @param {string} input.checkout the checkout whose journal describes the code
 * @returns {MigrationReading | { unreadable: string }}
 */
export function theDatabaseBehindTheCode({ database, checkout }) {
  const refusal = whyThisCheckoutMayNotOpenTheDatabase(database)
  if (refusal !== null) return { unreadable: refusal }
  const folder = join(checkout, 'drizzle')
  /** @type {FolderMigration[]} */
  let migrations
  try {
    migrations = theMigrationsInTheFolder(folder)
  } catch (err) {
    return { unreadable: `the migrations in ${folder} could not be read (${why(err)})` }
  }
  if (migrations.length === 0) {
    return { unreadable: `the migration journal in ${folder} names no migration, so there is nothing to compare` }
  }

  /** @type {import('better-sqlite3').Database | null} */
  let sqlite = null
  try {
    // READ-ONLY AND IT MUST EXIST. `fileMustExist` keeps this from creating the empty file a plain
    // open would, and `readonly` is the promise that the look cannot put a row anywhere.
    sqlite = new Database(database, { readonly: true, fileMustExist: true })
    const rows = /** @type {{ hash: string, created_at: number | string }[]} */ (
      sqlite.prepare(`SELECT hash, created_at FROM ${THE_MIGRATION_JOURNAL_TABLE}`).all()
    )
    const missing = theMigrationsNotYetApplied(rows, migrations).map((migration) => migration.tag)
    return { behind: missing.length > 0, missing }
  } catch (err) {
    return { unreadable: `the database at ${database} could not be read (${why(err)})` }
  } finally {
    // A CLOSE THAT FAILS IS NOT WORTH SAYING: the value was read, and the next look opens again.
    try {
      sqlite?.close()
    } catch {
      // Nothing to do and nothing to report.
    }
  }
}
