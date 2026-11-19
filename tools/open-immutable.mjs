// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DATABASE FILE OPENED READ-ONLY AND IMMUTABLE, for a tool that reads a store and must change nothing beside it.
 * tools/verify-the-remint.mjs and tools/the-writers-on-record.mjs open each store with this. It is the reading
 * tools/stable/verify-the-target.mjs uses.
 *
 * Immutable means SQLite creates, locks and changes nothing beside the file, and ignores a journal and a write-ahead log.
 * So a file with a rollback journal beside it, or a log with anything in it, is not opened.
 */

import { closeSync, constants, lstatSync, openSync, readSync } from 'node:fs'

// SQLite reads this once, when better-sqlite3 opens its first database. Without it the immutable address below is
// refused as a file name, so a missing setting fails every opening rather than opening the file another way.
process.env.SQLITE_USE_URI = '1'

const said = (error) => (error instanceof Error ? error.message : String(error))

/**
 * @param {typeof import('better-sqlite3')} Database  better-sqlite3, which the caller loads when it is ready to read
 * @param {string} label  what the file is, in the reason it was not opened
 * @param {string} path  the file's absolute path
 * @returns {{ db: import('better-sqlite3').Database, why?: undefined } | { why: string }}
 */
export function openImmutable(Database, label, path) {
  try {
    if (!lstatSync(path).isFile()) return { why: `the ${label} is not an ordinary file` }
  } catch (error) { return { why: `the ${label} could not be found: ${said(error)}` } }
  const beside = (suffix) => { try { return lstatSync(path + suffix) } catch (error) { if (error?.code === 'ENOENT') return null; throw error } }
  try {
    if (beside('-journal') !== null) return { why: `the ${label} has a rollback journal beside it, so it may hold a write that never finished, and it was not opened` }
    const log = beside('-wal')
    if (log !== null && log.size > 0) return { why: `the ${label}'s write-ahead log holds ${log.size} bytes not yet in the file, which an immutable read would not see, so it was not opened` }
    const header = Buffer.alloc(16), descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try { readSync(descriptor, header, 0, 16, 0) } finally { closeSync(descriptor) }
    if (header.toString('latin1') !== 'SQLite format 3\0') return { why: `the ${label} is not a SQLite database` }
    const address = `file:${path.split('/').map(encodeURIComponent).join('/')}?immutable=1`
    return { db: new Database(address, { readonly: true }) }
  } catch (error) { return { why: `the ${label} could not be opened read-only: ${said(error)}` } }
}
