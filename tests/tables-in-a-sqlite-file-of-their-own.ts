// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES THAT MAKE TABLES IN A SQLITE FILE OF THEIR OWN, NEVER IN THE OFFICE DATABASE.
 *
 * tests/schema-tables.test.ts and tests/schema-inventory.test.ts refuse every statement outside drizzle/ that makes a
 * table. What that rule guards is the office database: a table there with two definitions disagrees at runtime, a
 * table there made outside the migrations has no way to gain a column, and an export written from schema.ts misses
 * it. A table in a separate sqlite file is outside that purpose, and declaring it in schema.ts instead would put an
 * empty table into the office database that nothing reads.
 *
 * So a file on this list may make tables, and nothing else is let off. Each gate checks every listed file it reads
 * in two ways: the file still makes a table, so the list cannot go stale, and it reaches neither the office
 * database's connection nor its path, so the list cannot hide an office table. This list changes only in a criterion
 * commit, with one reason per file.
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))

export const TABLES_IN_A_FILE_OF_THEIR_OWN: readonly { path: string; reason: string }[] = [
  {
    path: 'src/config/storage/receipts.ts',
    reason:
      "The upload journal: a private sqlite file in the host's upload spool, which the storage command writes " +
      'without the office. It is kept from run to run, so a column added to it later has no migration path. ' +
      'Nothing needs one yet.',
  },
  {
    path: 'tools/storage/folder.ts',
    reason: 'The manifest of a backup pack: a new sqlite file written inside each pack, which a restore reads.',
  },
  {
    path: 'tools/storage/records.ts',
    reason:
      "Three TEMP tables on the pack's own working copy of the database, which hold the pinned history while the " +
      'copy is cut down. They are gone when the connection closes.',
  },
]

/** The one module that opens the office database, without its extension. */
const THE_CONNECTION = 'src/server/db/client'

/**
 * What ties a listed file to the office database, one sentence each; empty when nothing does. `code` is the file with
 * its comments removed. An import of the connection counts however it is written. The path counts by its names:
 * every reader of it is called databasePath or ends in DatabasePath, and its setting is MOLE_OFFICE_DB.
 */
export function whatTiesItToTheOfficeDatabase(path: string, code: string): string[] {
  const said: string[] = []
  const specifiers = [
    ...code.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g),
    ...code.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1/g),
    ...code.matchAll(/\bimport\s*(['"])([^'"]+)\1/g),
    ...code.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1/g),
  ].map((m) => m[2] ?? '')
  for (const one of specifiers) {
    if (!one.startsWith('.')) continue
    const target = resolve(dirname(join(REPO, path)), one).slice(REPO.length).replace(/\.[cm]?[jt]sx?$/, '')
    if (target === THE_CONNECTION) said.push(`${path} imports the office database's connection, ${THE_CONNECTION}.ts`)
  }
  for (const word of new Set(code.match(/\w*[dD]atabasePath\w*|\bMOLE_OFFICE_DB\b/g) ?? [])) {
    said.push(`${path} names the office database's path: ${word}`)
  }
  return said
}
