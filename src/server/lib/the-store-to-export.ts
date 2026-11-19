// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STORE THE EXPORT COMMAND READS, OPENED READ-ONLY.
 *
 * src/server/db/client.ts opens the store to read and to write, and it switches the file to write-ahead logging as it
 * opens it. So an export run through it changed the file it only read: on 1 November 2026 a copy of the store in
 * journal mode delete came back from `scripts/export.ts --no-commit` in WAL mode, with another hash.
 *
 * scripts/export.ts calls `openTheStoreToExport` before it imports lib/export.ts, and lib/export.ts then reads this
 * handle and never loads the client. SQLite refuses every write through a read-only handle, the journal mode included,
 * so nothing the export runs can change the store. The server, the mirror it runs and the tests open nothing here, and
 * the export reads the office's own handle, as before.
 */
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { settings, whyThisCheckoutMayNotOpenTheDatabase } from '../../config/settings.mjs'
import { withTheWayForThisJob } from '../../config/the-office-tool-environment.mjs'
import { refuseADataFolderInAWorktree } from './git-checkout.ts'

let theStore: Database.Database | null = null

/** The handle the export command opened, or null when the export reads the office's own. */
export function theStoreGivenToTheExport(): Database.Database | null {
  return theStore
}

/**
 * Open the store the settings name, read-only, for the export to read.
 *
 * THE CLIENT'S TWO REFUSALS COME FIRST, so the command can export only a store it could open. The file must be there
 * already: a read-only open never makes one, and a new empty file would export as an office that holds nothing.
 */
export function openTheStoreToExport(): Database.Database {
  const file = settings().databasePath
  const refusal = whyThisCheckoutMayNotOpenTheDatabase(file)
  if (refusal !== null) throw Object.assign(new Error(withTheWayForThisJob(refusal)), { code: 'STABLE_OFFICE_DATABASE' })
  refuseADataFolderInAWorktree(file)
  try {
    theStore = new Database(file, { readonly: true })
  } catch (err) {
    throw new Error(
      `The export could not open the store at ${resolve(file)} to read it, and it opens only a file that is there, only ` +
        `to read. What went wrong underneath: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    )
  }
  return theStore
}
