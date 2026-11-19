// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MIGRATION RUNS BECAUSE IT IS MISSING, NOT BECAUSE ITS DATE IS LATER. Round 17d of wave 13v.
 *
 * drizzle applies a migration only when its journal `when` is later than the newest one the database holds. On
 * 10 October 2026 six branches were adding migrations at once, several with the same `when`, so whichever landed first
 * would have made the others skip without a word. From index 212 on, a migration is now applied when its hash is not
 * in `__drizzle_migrations`, in index order. The rule is `theMigrationsNotYetApplied` in src/config/migration-look.mjs.
 *
 * WHAT THIS FILE PROVES, each on its own scratch database built from the real migrations up to 0211:
 * 1. Two branches' migrations with the same `when`, landed in either order, are both applied exactly once, and a third
 *    run applies nothing. Under the date rule the second to land is skipped, whichever it is.
 * 2. A journal entry whose file is missing is refused with a sentence naming it, and nothing is applied.
 * 3. Two entries that share an index are refused with a sentence naming both, and nothing is applied.
 * 4. A migration up to 0211 whose file was edited after it was applied is not run again: those are still judged by
 *    date, because commit 1aee76c7b rewrote the comments of 39 of them after every office had applied them.
 * 5. The supervisor's look and the preview name the migration that is missing, not the last one in the journal.
 */

import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrateInPlace, previewMigration } from '../src/server/db/migrate.ts'
import { THE_MIGRATION_JOURNAL_TABLE, theDatabaseBehindTheCode } from '../src/config/migration-look.mjs'

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url))

interface Entry {
  idx: number
  version: string
  when: number
  tag: string
  breakpoints: boolean
}

/** The real journal's entries up to and including index 211, the last one judged by its date. */
const THE_BASE: Entry[] = (
  JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: Entry[] }
).entries.filter((entry) => entry.idx <= 211)

/** Two branches' migrations, the same `when` as four of 10 October's, each making a table of its own. */
const BRANCH_A: Entry = { idx: 212, version: '6', when: 1791368770081, tag: '0212_branch_a', breakpoints: true }
const BRANCH_B: Entry = { idx: 213, version: '6', when: 1791368770081, tag: '0213_branch_b', breakpoints: true }
const SQL_OF: Record<string, string> = {
  [BRANCH_A.tag]: 'CREATE TABLE `branch_a_mark` (`id` integer PRIMARY KEY);',
  [BRANCH_B.tag]: 'CREATE TABLE `branch_b_mark` (`id` integer PRIMARY KEY);',
  '0212_branch_c': 'CREATE TABLE `branch_c_mark` (`id` integer PRIMARY KEY);',
}

const made: string[] = []
const opened: Database.Database[] = []

afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * A checkout whose `drizzle/` holds the base and these extra entries, with a file written for each one whose SQL is
 * known. Returns the checkout and its migrations folder.
 */
function aCheckout(extra: Entry[]): { checkout: string; folder: string } {
  const checkout = mkdtempSync(join(tmpdir(), 'mole-office-by-absence-'))
  made.push(checkout)
  const folder = join(checkout, 'drizzle')
  mkdirSync(join(folder, 'meta'), { recursive: true })
  for (const entry of THE_BASE) copyFileSync(join(MIGRATIONS, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`))
  for (const entry of extra) if (SQL_OF[entry.tag] !== undefined) writeFileSync(join(folder, `${entry.tag}.sql`), SQL_OF[entry.tag]!)
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries: [...THE_BASE, ...extra] }),
  )
  return { checkout, folder }
}

/** A scratch database built from the base alone, as every office was before 10 October's branches. */
function aDatabaseAtTheBase(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-by-absence-db-'))
  made.push(dir)
  const db = new Database(join(dir, 'panelx.db'))
  opened.push(db)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrateInPlace(db, aCheckout([]).folder)
  return db
}

function journalRows(db: Database.Database): { hash: string; created_at: number }[] {
  return db.prepare(`SELECT hash, created_at FROM ${THE_MIGRATION_JOURNAL_TABLE}`).all() as { hash: string; created_at: number }[]
}

function tables(db: Database.Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name)
}

describe('a migration runs because it is missing, not because its date is later', () => {
  for (const [first, second] of [
    [BRANCH_A, BRANCH_B],
    [BRANCH_B, BRANCH_A],
  ] as const) {
    it(`1. ${first.tag} landed before ${second.tag}: both are applied once, and a third run applies nothing`, () => {
      const db = aDatabaseAtTheBase()
      const atTheBase = journalRows(db).length

      const firstLanding = migrateInPlace(db, aCheckout([first]).folder)
      expect(firstLanding.newlyApplied).toBe(1)

      const both = aCheckout([BRANCH_A, BRANCH_B]).folder
      const secondLanding = migrateInPlace(db, both)
      expect(secondLanding.newlyApplied, `${second.tag} was skipped`).toBe(1)
      expect(tables(db)).toEqual(expect.arrayContaining(['branch_a_mark', 'branch_b_mark']))

      const third = migrateInPlace(db, both)
      expect(third.newlyApplied).toBe(0)
      const rows = journalRows(db)
      expect(rows.length).toBe(atTheBase + 2)
      expect(new Set(rows.map((row) => row.hash)).size, 'a hash is journaled twice').toBe(rows.length)
    }, 120_000)
  }

  it('2. a journal entry whose file is missing is refused by name, and nothing is applied', () => {
    const db = aDatabaseAtTheBase()
    const atTheBase = journalRows(db).length
    const gone: Entry = { idx: 214, version: '6', when: 1791368770082, tag: '0214_gone', breakpoints: true }
    expect(() => migrateInPlace(db, aCheckout([BRANCH_A, gone]).folder)).toThrow(
      /names 0214_gone \(index 214\), but its file is not in .* No migration was applied\./,
    )
    expect(journalRows(db).length).toBe(atTheBase)
    expect(tables(db)).not.toContain('branch_a_mark')
  }, 120_000)

  it('3. two entries sharing an index are refused naming both, and nothing is applied', () => {
    const db = aDatabaseAtTheBase()
    const atTheBase = journalRows(db).length
    const c: Entry = { ...BRANCH_A, tag: '0212_branch_c' }
    expect(() => migrateInPlace(db, aCheckout([BRANCH_A, c]).folder)).toThrow(
      /gives one index to two migrations: 0212_branch_a and 0212_branch_c are both index 212\./,
    )
    expect(journalRows(db).length).toBe(atTheBase)
    expect(tables(db)).not.toContain('branch_a_mark')
  }, 120_000)

  it('4. a migration up to 0211 whose comments were edited after it was applied is not run again', () => {
    const db = aDatabaseAtTheBase()
    const atTheBase = journalRows(db).length
    const { folder } = aCheckout([])
    appendFileSync(join(folder, '0005_records_origin.sql'), '\n-- a comment written after every office applied this file\n')
    const again = migrateInPlace(db, folder)
    expect(again.newlyApplied).toBe(0)
    expect(journalRows(db).length).toBe(atTheBase)
  }, 120_000)

  it('5. the look and the preview name the migration that is missing, not the last in the journal', () => {
    const db = aDatabaseAtTheBase()
    migrateInPlace(db, aCheckout([BRANCH_B]).folder)
    const { checkout, folder } = aCheckout([BRANCH_A, BRANCH_B])
    db.pragma('wal_checkpoint(TRUNCATE)')

    expect(theDatabaseBehindTheCode({ database: db.name, checkout })).toEqual({ behind: true, missing: ['0212_branch_a'] })
    const preview = previewMigration(db, folder)
    expect(preview.wouldWrite.join('\n')).toContain('not run against this database: 0212_branch_a.')

    migrateInPlace(db, folder)
    expect(theDatabaseBehindTheCode({ database: db.name, checkout })).toEqual({ behind: false, missing: [] })
  }, 120_000)
})
