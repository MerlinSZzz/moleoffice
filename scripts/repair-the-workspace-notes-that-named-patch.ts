// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REWRITE THE STORED NOTES ON `unassigned` AND `general` THAT NAME THE WRONG ROUTE. Run by hand.
 *
 *   npx tsx scripts/repair-the-workspace-notes-that-named-patch.ts --db <path>           # say what it would do
 *   npx tsx scripts/repair-the-workspace-notes-that-named-patch.ts --db <path> --do-it   # do it
 *
 * Problem JwtgCLiccj7N. `GET /api/workspaces` serves each project's note as it is stored. The workspace
 * migration wrote the notes on `unassigned` and `general` once, when it established those rows, and they
 * told a reader to move a record with `PATCH /api/records/:id`, which refuses the move. The migration
 * now writes notes that name `POST /api/records/:id/workspace`, but it inserts a row only when the row
 * is missing, so a database that already has the two rows still serves the old words.
 *
 * WHAT IT CHANGES, AND NOTHING ELSE. At most two rows of `workspaces`: the one whose `id` is
 * `unassigned` and the one whose `id` is `general`, and each only when its `note` is exactly the old
 * sentence. It sets `note` to the sentence the migration writes today and `updated_at` to now. The
 * rule is `repairTheNotesThatNamedPatch` in src/server/db/workspace-migration.ts.
 *
 * WHY `--db` IS REQUIRED. It opens no database it is not told the path of, so it cannot reach the
 * office through a default. Nothing starts it: the server never calls it.
 */

import { whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { repairTheNotesThatNamedPatch } from '../src/server/db/workspace-migration.ts'

const args = process.argv.slice(2)
const doIt = args.includes('--do-it')
const at = args.indexOf('--db')
const path = at === -1 ? undefined : args[at + 1]
if (path === undefined || path.startsWith('--')) {
  console.error('Say which database: --db <path>. Nothing was read and nothing was written.')
  process.exit(2)
}
if (!existsSync(path)) {
  console.error(`No file is at ${path}. Nothing was read and nothing was written.`)
  process.exit(2)
}

const pairingRefusal = whyThisCheckoutMayNotOpenTheDatabase(path)
if (pairingRefusal !== null) throw new Error(pairingRefusal)
const sqlite = new Database(path, { fileMustExist: true })
try {
  const rows = repairTheNotesThatNamedPatch(sqlite, doIt)
  for (const row of rows) {
    const said =
      row.found === 'rewritten'
        ? doIt
          ? 'the old note was rewritten to name POST /api/records/:id/workspace'
          : 'holds the old note exactly; --do-it would rewrite it'
        : row.found === 'left'
          ? 'names PATCH /api/records/:id but is not the old note exactly, so it was not changed; read it yourself'
          : row.found === 'current'
            ? 'already holds the new note; nothing to do'
            : row.found === 'other'
              ? 'holds a note that does not name PATCH /api/records/:id; not changed'
              : 'there is no such row in this database'
    console.log(`${row.id}: ${said}`)
  }
  if (!doIt) console.log('Nothing was written. Run again with --do-it to write.')
} finally {
  sqlite.close()
}
