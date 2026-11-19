// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE MIGRATIONS A BUNDLE CARRIES: drizzle/ as the checkout has it, with two differences.
 *
 * - drizzle-kit's snapshots in drizzle/meta/ stay behind. The migrator reads only the journal there and the .sql
 *   files, and a snapshot is drizzle-kit's record of the schema for writing the next migration in a checkout.
 * - The two first migrations made the owner and author columns with a person's user name as their default. In the
 *   copy, those six defaults are a neutral word, THE_NEUTRAL_DEFAULT. No other line changes, and the checkout's
 *   files are not touched, because a landed migration is never edited. The clean version gives the two files the same
 *   neutral word through withTheNeutralDefault (scripts/clean-version.mjs, CHANGED), so the two copies cannot differ.
 *
 * WHY THE COPY BUILDS THE SAME DATABASE. Migration 0195 rebuilt those tables without the
 * defaults. No migration before it writes a row that leaves those columns out. So a fresh
 * database migrated from the copy has the same schema and the same rows as one migrated from the checkout
 * (tests/a-bundles-migrations-name-nobody.test.ts holds that).
 *
 * WHAT DOES DIFFER IS THE HASH an office stores for these two files. A migration before index 212 is taken by its
 * date and not by its hash (src/config/migration-look.mjs), so an office that applied the checkout's files does not
 * take the copy's again. An archive from an office built from a checkout, read into one built from a bundle, says in
 * a note that the two were applied under different hashes, and the import goes on (checkMigrations in
 * src/server/lib/import.ts).
 *
 * A listed migration that does not hold exactly its lines stops the copy, rather than going into a bundle unchanged.
 */

import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { THE_MIGRATIONS_FOLDER } from '../src/config/settings.mjs'

/** The two migrations that gave the owner and author columns a person's user name as their default, with how many lines each. */
export const THE_MIGRATIONS_WITH_A_NAMED_DEFAULT = Object.freeze({
  '0000_uneven_molly_hayes.sql': 3,
  '0004_drop_the_utc_stamp_defaults.sql': 3,
})

/** The default a bundle's copy gives those columns. It names nobody. */
export const THE_NEUTRAL_DEFAULT = 'unknown'

/** One such line: a column of the owner or the author, made with a default of small letters. */
const A_NAMED_DEFAULT = /^(\t`(?:owner_id|created_by)` text DEFAULT ')([a-z]+)(' NOT NULL)/gm

/**
 * One migration THE_MIGRATIONS_WITH_A_NAMED_DEFAULT lists, with the owner and author defaults given as THE_NEUTRAL_DEFAULT.
 * Throws, naming the file, when the text does not hold exactly its lines.
 * @param {keyof typeof THE_MIGRATIONS_WITH_A_NAMED_DEFAULT} file
 * @param {string} text the migration as the checkout has it
 * @returns {string}
 */
export function withTheNeutralDefault(file, text) {
  const expected = THE_MIGRATIONS_WITH_A_NAMED_DEFAULT[file]
  const found = [...text.matchAll(A_NAMED_DEFAULT)].length
  if (found !== expected) {
    throw new Error(`drizzle/${file} has ${String(found)} lines that give the owner or the author a default, not ${String(expected)}, so it was not copied with a neutral default.`)
  }
  return text.replace(A_NAMED_DEFAULT, `$1${THE_NEUTRAL_DEFAULT}$3`)
}

/**
 * Copy the checkout's migrations into `folder`, a bundle's drizzle/, and give the listed defaults the neutral word.
 * Throws, naming the file, when a listed migration does not hold its lines.
 * @param {string} folder
 * @param {string} [from] the checkout's drizzle/
 * @returns {string} what was copied, in one sentence
 */
export function copyTheMigrationsInto(folder, from = THE_MIGRATIONS_FOLDER) {
  cpSync(from, folder, { recursive: true, filter: (path) => !/[\\/]meta[\\/]\d+_snapshot\.json$/.test(path) })
  let lines = 0
  for (const file of /** @type {(keyof typeof THE_MIGRATIONS_WITH_A_NAMED_DEFAULT)[]} */ (Object.keys(THE_MIGRATIONS_WITH_A_NAMED_DEFAULT))) {
    writeFileSync(join(folder, file), withTheNeutralDefault(file, readFileSync(join(from, file), 'utf8')))
    lines += THE_MIGRATIONS_WITH_A_NAMED_DEFAULT[file]
  }
  return `Copied ${from} into ${folder}, without drizzle-kit's snapshots, with the default of ${String(lines)} owner and author columns in ${Object.keys(THE_MIGRATIONS_WITH_A_NAMED_DEFAULT).join(' and ')} given as '${THE_NEUTRAL_DEFAULT}'.`
}
