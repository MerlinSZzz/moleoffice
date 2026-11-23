// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A MIGRATION IS WRITTEN, IN THE WORDS A FAILING TEST GIVES.
 *
 * A migration is written by hand. The project has no script that generates one. Its SQL and its journal entry go in
 * one commit, and the coordinator gives its number, so that two branches do not take the same one.
 *
 * tests/schema-inventory.test.ts and tests/migration-numbering.test.ts both give this instruction when they fail, and
 * both read it from here, so the two cannot say different things. It is kept out of a test file because importing a
 * test file runs its cases.
 */

/** The instruction, as one sentence a failure message can carry. */
export const A_MIGRATION_IS_WRITTEN_BY_HAND =
  "Write the migration's SQL by hand in drizzle/, with `IF NOT EXISTS` on every CREATE TABLE and CREATE INDEX, add " +
  'its entry to drizzle/meta/_journal.json in the same commit, dated after the entry before it, and ask the ' +
  'coordinator for its number before you commit it.'

/**
 * What to do about a table nobody declared, written so the failure is an instruction.
 *
 * A bare `toEqual([])` diff tells whoever broke this that two arrays differ, at which point they
 * have to find this file, read it, and work out what the project's rule is. The rule is four
 * sentences and it fits in the failure.
 */
export function fixUndeclared(tables: readonly string[], where: string): string {
  const named = tables.map((t) => `"${t}"`).join(', ')
  return (
    `${named} ${tables.length === 1 ? 'is a table' : 'are tables'} in ${where}, and ` +
    `${tables.length === 1 ? 'it is' : 'they are'} not declared in src/server/db/schema.ts. ` +
    'EVERY table Mole Office has is declared there and created by a migration in drizzle/, and nothing ' +
    'anywhere else may create one. To fix this: add the sqliteTable declaration to schema.ts, and add ' +
    'the name to AUTHORED_TABLES or DERIVED_TABLES in the same file. ' +
    `${A_MIGRATION_IS_WRITTEN_BY_HAND} ` +
    'Delete whatever was creating the table outside the migration system. Two definitions of one ' +
    'table fail at runtime on INSERT, in production, with nothing failing at compile time.'
  )
}

/** The other direction: schema.ts says a table exists and no migration ever makes it. */
export function fixUnbuilt(tables: readonly string[]): string {
  const named = tables.map((t) => `"${t}"`).join(', ')
  return (
    `${named} ${tables.length === 1 ? 'is' : 'are'} declared in src/server/db/schema.ts and no ` +
    'migration in drizzle/ creates it. A declaration with no migration is a table that exists in ' +
    'TypeScript and not in SQLite: every read of it fails at runtime with "no such table". ' +
    A_MIGRATION_IS_WRITTEN_BY_HAND
  )
}
