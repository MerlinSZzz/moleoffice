// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A COPY OF A DATABASE ANOTHER PROCESS MAY BE WRITING, MADE BY SQLITE (problem E5xPIN9WRI0u).
 *
 * The office writes ahead: what it wrote since the last checkpoint is in the database's -wal file, not yet in the
 * main file. A copy of the main file alone misses all of it, a table made since the checkpoint included; measured on
 * 5 October 2026, a copy by file of a database with 100 rows in its log held no table at all. `VACUUM INTO`, through a
 * read-only connection, writes one file that holds what the database holds, log and all, and changes nothing in it.
 * It is the copy src/server/db/migrate.ts already makes for its preview.
 */
import { whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import Database from 'better-sqlite3'

/**
 * Copy the database at `from` to the new file `to`.
 * @param {string} from @param {string} to
 */
export function aCopyOfALiveDatabase(from, to) {
  const pairingRefusal = whyThisCheckoutMayNotOpenTheDatabase(from)
  if (pairingRefusal !== null) throw new Error(pairingRefusal)
  const targetRefusal = whyThisCheckoutMayNotOpenTheDatabase(to)
  if (targetRefusal !== null) throw new Error(targetRefusal)
  const live = new Database(from, { readonly: true, fileMustExist: true })
  try {
    live.exec(`VACUUM INTO '${to.replace(/'/g, "''")}'`)
  } finally {
    live.close()
  }
}
