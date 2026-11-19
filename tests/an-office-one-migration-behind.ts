// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE ONE MIGRATION BEHIND MAIN: the state a live office is in when a landing brings a migration.
 *
 * `oneMigrationBehind` copies drizzle/ into a folder of the test's own and takes the newest entry off the copy's
 * journal. A database migrated with that copy is what the live office was before the landing; migrating it again
 * with drizzle/ itself is the landing. `theNewestMigration` is the hash the landing journals.
 */
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { readMigrationFiles } from 'drizzle-orm/migrator'

export const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url))

/** drizzle/ without its newest migration, copied into `dir`. Returns the copy's path. */
export function oneMigrationBehind(dir: string): string {
  const older = join(dir, 'drizzle-one-behind')
  cpSync(MIGRATIONS, older, { recursive: true })
  const journalFile = join(older, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: unknown[] }
  journal.entries.pop()
  writeFileSync(journalFile, JSON.stringify(journal))
  return older
}

/** The hash the newest migration is journaled under. */
export function theNewestMigration(): string {
  const all = readMigrationFiles({ migrationsFolder: MIGRATIONS })
  const newest = all.at(-1)
  if (newest === undefined) throw new Error(`${MIGRATIONS} holds no migrations`)
  return newest.hash
}
