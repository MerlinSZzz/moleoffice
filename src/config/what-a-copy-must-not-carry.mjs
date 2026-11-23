// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
import { closeSync, existsSync, openSync, readSync, renameSync, rmSync, statSync } from 'node:fs'

/**
 * WHAT A COPY OF THE OFFICE'S DATABASE MUST NOT CARRY, DECLARED ONCE, AND HOW A COPY IS CHECKED.
 *
 * A copy, a backup and an export carry no key, as the owner decided.
 * These programs make a copy of the whole file, or check one, and must ask about the same tables:
 *
 *   - scripts/backup.ts, the office's own backups (`npm run db:backup`);
 *   - scripts/restore-check.ts, which asserts a restore brings none of these rows back;
 *   - tools/isolated-mole-office.mjs, the copy a test world serves;
 *   - tools/office-copy.mjs, the copy a sandbox is given;
 *   - tools/accept.mjs, the copy its own instance is started from;
 *   - scripts/rewrite-a-backup.ts, which rewrites a backup made before a backup was made this way.
 *
 * IT IS JAVASCRIPT FOR THE SAME REASON src/config/key-header.mjs IS. The tools are plain
 * JavaScript run by node and cannot import src/server/db/schema.ts, so until this file existed
 * tools/isolated-mole-office.mjs typed the table's name itself. A table added to one list and not
 * the other would leave key hashes in one kind of copy with nothing failing. table-name-lists.ts
 * in src/server/db/ re-exports the list from here, and schema.ts re-exports that file, so every
 * TypeScript reader still imports it from the schema.
 *
 * DELETING A ROW DOES NOT TAKE IT OUT OF THE FILE. This build of SQLite does not overwrite deleted
 * content (`secure_delete` is off), so a deleted key hash stays readable in the file's free space
 * until the file is rewritten. A search of the backup made at 18:27 found in its bytes every
 * one of the 346 key hashes made before it, though its `held_keys` had no rows (problem
 * REGoVTuHW1zo). So the programs that copy the file share the functions below:
 * `emptyAndScrub` empties the tables and clears the columns, `keyHashesACopyIsSearchedFor` reads every
 * key hash and token hash the source holds, and `hashesLeftAfterAtMostOneRewrite` looks for each of them
 * in the copy's bytes. A copy in which one is found is not kept. scripts/rewrite-a-backup.ts uses the
 * same functions to rewrite a backup made before they existed.
 *
 * EVERY COPY STARTS WITH `VACUUM INTO` FROM ITS SOURCE, AND IS NOT REWRITTEN AGAIN UNLESS IT HAS TO BE
 * (since 21 October 2026). Until then each copy was rewritten with VACUUM after it
 * was emptied, and VACUUM builds a whole second database in the temporary folder and writes it back
 * through the copy's journal: a backup of a 3.6 GB office peaked at about three databases, 10.9 GB. Now:
 *
 *   - `VACUUM INTO` writes only what the source holds now, into new pages. The source's deleted rows and
 *     free pages, which hold what was deleted there long ago, never reach the copy. An online backup or a
 *     byte copy of the file would carry them (measured: 250 of 300 key hashes deleted in the source were
 *     in such a copy, and none in a copy made with `VACUUM INTO`).
 *   - `emptyAndScrub` deletes and clears on the copy with SQLite's `secure_delete` on, so what it takes out
 *     is overwritten with zeros where it lay. That is not a promise for every page: SQLite as
 *     better-sqlite3 builds it (3.53.4) still left 28 of 50 old values in the bytes after one UPDATE over
 *     500 rows. So the byte search decides: when it finds a hash, the copy is rewritten once more with
 *     `VACUUM INTO`, which leaves nothing deleted behind, and searched again (`hashesLeftAfterAtMostOneRewrite`).
 *   - The sandbox's copy clears every machine name and address of the office in large tables
 *     (`clearTheAddresses`), and is always rewritten with `VACUUM INTO` afterwards (tools/office-copy.mjs).
 *
 * A backup then peaks at one database, or two when the search found something; the sandbox's copy at two.
 */

/**
 * THE TABLES EVERY COPY EMPTIES. `held_keys` holds the SHA-256 of every key the office issued.
 * The schema's comment on this list, in src/server/db/table-name-lists.ts, says why each one is here.
 */
export const NOT_CARRIED_TABLES = /** @type {const} */ (['held_keys', 'run_tokens'])

/**
 * THE ROWS ONLY A COPY THAT BECOMES A WORLD REMOVES, on top of the tables above: the office's own
 * home row.
 *
 * The office is the database that holds a world of kind `home`. `theOfficeIsInThisDatabase()` in
 * src/server/lib/office.ts asks exactly that, and asks nothing else. A world is a copy of the
 * office's database, so the copy carried the office's home row and the world read itself as the
 * office. Its five reports to the office then stopped at their first line ("this world holds the
 * office"), so the key its starter was given for those reports was never sent, and its counters
 * fired the office's own jobs a second time.
 *
 * So a copy that becomes a world deletes every row of `worlds` whose `kind` is `home`, alive or
 * dead. The world is then not the office. Its server writes its own row when it starts, of kind
 * `agent-made` or `test` (`registerThisWorld` in src/server/lib/register-this-server.ts), so the
 * world still has a row that names it.
 *
 * ONLY tools/isolated-mole-office.mjs asks for this, by passing `becomesAWorld` to
 * `emptyAndScrub`. A backup IS the office: a restore of one must be the office again, so
 * scripts/backup.ts keeps the home row. tools/accept.mjs makes a first copy that is never served;
 * the world it starts is served from the copy tools/isolated-mole-office.mjs makes of that one.
 */
export const THE_ROWS_A_WORLDS_COPY_REMOVES = /** @type {const} */ ({ table: 'worlds', column: 'kind', value: 'home' })

/**
 * THE COLUMNS EVERY COPY CLEARS, on top of the tables above.
 *
 * `visitor_credentials.token_hash` is the SHA-256 of a visiting agent's token. The visitor gate
 * answers a request whose token hashes to it (`credentialForToken` in src/server/lib/visitors.ts),
 * so a copy that kept it would let the token work wherever the copy is served, and a restore of a
 * backup that kept it would bring back a visitor ended after the backup was made.
 *
 * A decision says a backup leaves it out, and a restored visitor pairs again. Before it, only a
 * sandbox's copy cleared it and a backup, a test world's copy and accept's copy kept it. Now `emptyAndScrub` clears it
 * in every one of them:
 *
 *   - a backup, because of that decision;
 *   - a test world's copy and accept's copy, because a world does not need it. Its start binds no key
 *     from a copied credential (`giveAlreadyConfirmedCredentialsTheirKeysOnce` in visitors.ts), and a
 *     token the office gave out must not be answered inside a world either;
 *   - a sandbox's copy, which is a backup (tools/office-copy.mjs).
 *
 * A decision extends this rule to exports. src/server/lib/export.ts reads this list and writes
 * the same mark in `tokenHash`. scripts/restore-check.ts requires that mark after an import and compares every other
 * credential field. The restored visitor pairs again.
 *
 * The column is NOT NULL and unique, so it cannot be emptied. Each row gets `REMOVED_MARK` followed
 * by the row's own id. That text is not 64 hexadecimal characters, so it is never the SHA-256 of any
 * token, and it says in the place it appears that the hash was taken out.
 */
export const COLUMNS_A_COPY_CLEARS = /** @type {const} */ ([{ table: 'visitor_credentials', column: 'token_hash' }])

/** What a cleared column holds, before the row's id. */
export const REMOVED_MARK = 'removed from this copy: '

/**
 * THE TWO WAYS A COLUMN IS CLEARED, in the words a copy's marker and log use: `mark` where each value is
 * replaced by REMOVED_MARK and the row's id, and `NULL` where each value is set to NULL. Every copy clears
 * COLUMNS_A_COPY_CLEARS by the mark (`emptyAndScrub`).
 */
export const BY_THE_MARK = 'mark'
export const TO_NULL = 'NULL'

/**
 * THE MACHINE NAMES AND ADDRESSES ONLY A SANDBOX'S COPY CLEARS (problem iCqnLDtfsGzF), on top of
 * everything above, in two lists: the columns it clears by the mark, and the columns it sets to NULL.
 *
 * Each names a machine: one the office trusts (`trusted_machines.address`), one a request came from
 * (`api_calls.client_addr`, `header_only_calls.client_addr`, `visitor_credentials.machine`), one that
 * claimed a run (`agent_runs.claimed_from_machine`) or holds a handle (`handle_holds.machine`), the
 * person's names for machines (`installation.machine_names`), the address browsers are sent to
 * (`installation.address_for_browsers`), or where a world answers (`worlds.address`,
 * `worlds.address_for_other_machines`). A sandbox's copy is given to a run inside the sandbox, and that
 * run has no need to know which machines reach the office.
 *
 * A BACKUP KEEPS THEM, so they are not in COLUMNS_A_COPY_CLEARS, which `emptyAndScrub` clears in every
 * copy. A backup is the office itself: the Vault carries it and a restore reads it, and an office
 * restored without its trusted machines would no longer let them in. Only tools/office-copy.mjs passes
 * these lists, to `clearTheAddresses` below.
 *
 * BY THE MARK: each value is replaced by REMOVED_MARK and the row's id, as a token hash is. The id is
 * needed: `header_only_calls.client_addr` is in a unique index with the day, the caller and the origin,
 * so one mark for every row would make two rows of one caller on one day the same row.
 * `handle_holds.machine` is NOT NULL. In `agent_runs.claimed_from_machine` a NULL after a claim says
 * nobody could tell which machine claimed it, which would not be true. A NULL already there names no
 * machine, so it stays NULL.
 *
 * TO NULL: NULL is what each of these holds when nobody chose or said anything, so an office started on
 * the copy reads them as unset. A mark would not do there. The one reader of `installation.machine_names`
 * reads only JSON, and the one reader of `installation.address_for_browsers` only an address, and each
 * answers 500 to anything else, so Settings would fail. And the office's world check asks
 * `worlds.address` of every live world of another database, which on a sandbox's copy is the office's own
 * home row; NULL there means it asks nobody.
 */
export const ADDRESSES_A_SANDBOX_COPY_MARKS = /** @type {const} */ ([
  { table: 'trusted_machines', column: 'address' },
  { table: 'api_calls', column: 'client_addr' },
  { table: 'header_only_calls', column: 'client_addr' },
  { table: 'agent_runs', column: 'claimed_from_machine' },
  { table: 'handle_holds', column: 'machine' },
])
export const ADDRESSES_A_SANDBOX_COPY_SETS_TO_NULL = /** @type {const} */ ([
  { table: 'installation', column: 'machine_names' },
  { table: 'installation', column: 'address_for_browsers' },
  { table: 'worlds', column: 'address' },
  { table: 'worlds', column: 'address_for_other_machines' },
  { table: 'visitor_credentials', column: 'machine' },
])

/** The column of `held_keys` that holds a key's SHA-256, as 64 hexadecimal characters. */
const KEY_HASHES = { table: 'held_keys', column: 'key_hash' }

/** A SHA-256 in hex, which is how every key hash is stored (keyHash in src/server/lib/keys.ts). */
const HASH_LENGTH = 64

/** One SHA-256 as the office stores it: 64 lowercase hexadecimal characters and nothing else. */
const A_HASH = /^[0-9a-f]{64}$/

/** How much of a file is read at a time when it is searched for a hash. */
const CHUNK = 64 * 1024 * 1024

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 */
function hasTable(db, table) {
  return db.prepare("SELECT 1 AS one FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
}

/**
 * WHAT A COPY'S HANDLE IS SET TO BEFORE ANYTHING IS TAKEN OUT OF IT: a rollback journal, which holds only the
 * pages a statement changes and is removed when it commits, in place of a write-ahead log beside the copy;
 * and `secure_delete`, so what is deleted or overwritten is overwritten with zeros where it lay.
 *
 * @param {import('better-sqlite3').Database} copy
 */
function scrubbing(copy) {
  copy.pragma('journal_mode = DELETE')
  copy.pragma('secure_delete = ON')
}

/**
 * EMPTY THE TABLES A COPY MUST NOT CARRY AND CLEAR THE COLUMNS IT MUST NOT CARRY, OVERWRITING WHAT THEY
 * HELD WITH ZEROS.
 *
 * `copy` is a writable handle on the COPY, which `VACUUM INTO` made from the source. The caller opens it on
 * the copy's path and never on the source. A table the file predates is skipped: an old database has nothing
 * to empty or clear. Nothing here rewrites the file: the caller searches the copy's bytes afterwards with
 * `hashesLeftAfterAtMostOneRewrite`, which rewrites it once only when something is still there. It throws when
 * any step fails, and the caller then deletes the copy. It answers how many rows of each column it cleared, so
 * the caller can say it.
 *
 * With `becomesAWorld`, it also deletes THE_ROWS_A_WORLDS_COPY_REMOVES. Without it, those rows stay.
 *
 * @param {import('better-sqlite3').Database} copy
 * @param {{ becomesAWorld?: boolean }} [how]
 * @returns {{ table: string, column: string, rows: number }[]}  one entry per column of a table the file has
 */
export function emptyAndScrub(copy, how = {}) {
  scrubbing(copy)
  for (const table of NOT_CARRIED_TABLES) {
    if (hasTable(copy, table)) copy.prepare(`DELETE FROM "${table}"`).run()
  }
  /** @type {{ table: string, column: string, rows: number }[]} */
  const cleared = []
  for (const { table, column } of COLUMNS_A_COPY_CLEARS) {
    if (!hasTable(copy, table)) continue
    const rows = copy.prepare(`UPDATE "${table}" SET "${column}" = ? || id`).run(REMOVED_MARK).changes
    cleared.push({ table, column, rows })
  }
  if (how.becomesAWorld === true) {
    const { table, column, value } = THE_ROWS_A_WORLDS_COPY_REMOVES
    if (hasTable(copy, table)) copy.prepare(`DELETE FROM "${table}" WHERE "${column}" = ?`).run(value)
  }
  return cleared
}

/**
 * CLEAR THE MACHINE NAMES AND ADDRESSES OF A SANDBOX'S COPY.
 *
 * `copy` is a writable handle on the COPY, after `emptyAndScrub` has run on it. The clearing runs with
 * `secure_delete` on, but over tables as large as `api_calls` that leaves some of the old values in the
 * bytes (see the note at the top), so THE CALLER ALWAYS REWRITES THE COPY WITH `VACUUM INTO` AFTERWARDS,
 * as tools/office-copy.mjs does, and searches the result. It answers how many rows of each column it
 * cleared, and how.
 *
 * @param {import('better-sqlite3').Database} copy
 * @returns {{ table: string, column: string, how: string, rows: number }[]}  one entry per column of a table the file has
 */
export function clearTheAddresses(copy) {
  scrubbing(copy)
  /** @type {{ table: string, column: string, how: string, rows: number }[]} */
  const cleared = []
  for (const { table, column } of ADDRESSES_A_SANDBOX_COPY_MARKS) {
    if (!hasTable(copy, table)) continue
    const rows = copy.prepare(`UPDATE "${table}" SET "${column}" = ? || id WHERE "${column}" IS NOT NULL`).run(REMOVED_MARK).changes
    cleared.push({ table, column, how: BY_THE_MARK, rows })
  }
  for (const { table, column } of ADDRESSES_A_SANDBOX_COPY_SETS_TO_NULL) {
    if (!hasTable(copy, table)) continue
    const rows = copy.prepare(`UPDATE "${table}" SET "${column}" = NULL WHERE "${column}" IS NOT NULL`).run().changes
    cleared.push({ table, column, how: TO_NULL, rows })
  }
  return cleared
}

/**
 * HOW MANY VALUES OF THE CLEARED COLUMNS A FILE STILL HOLDS, read from an open handle. Zero is what a
 * copy must answer. A value is cleared when it starts with REMOVED_MARK. A NULL is not counted.
 * `columns` is COLUMNS_A_COPY_CLEARS unless a caller names another list.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {readonly { table: string, column: string }[]} [columns]
 * @returns {number}
 */
export function valuesNotCleared(db, columns = COLUMNS_A_COPY_CLEARS) {
  let left = 0
  for (const { table, column } of columns) {
    if (!hasTable(db, table)) continue
    const row = /** @type {{ n: number }} */ (
      db.prepare(`SELECT count(*) AS n FROM "${table}" WHERE substr("${column}", 1, ?) <> ?`).get(REMOVED_MARK.length, REMOVED_MARK)
    )
    left += row.n
  }
  return left
}

/**
 * HOW MANY VALUES OF COLUMNS SET TO NULL A FILE STILL HOLDS, read from an open handle. Zero is what a
 * copy must answer: every value that is not NULL is counted.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {readonly { table: string, column: string }[]} columns
 * @returns {number}
 */
export function valuesNotSetToNull(db, columns) {
  let left = 0
  for (const { table, column } of columns) {
    if (!hasTable(db, table)) continue
    const row = /** @type {{ n: number }} */ (db.prepare(`SELECT count(*) AS n FROM "${table}" WHERE "${column}" IS NOT NULL`).get())
    left += row.n
  }
  return left
}

/**
 * EVERY KEY HASH A DATABASE HOLDS, read from an open handle on the source. None when the file
 * predates `held_keys`. The caller keeps them in memory and never prints or logs one.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {string[]}
 */
export function keyHashesHeldIn(db) {
  if (!hasTable(db, KEY_HASHES.table)) return []
  return db
    .prepare(`SELECT "${KEY_HASHES.column}" AS v FROM "${KEY_HASHES.table}"`)
    .all()
    .map((row) => String(/** @type {{ v: unknown }} */ (row).v))
}

/**
 * EVERY KEY HASH AND TOKEN HASH A COPY IS SEARCHED FOR: every held key hash of the source, and every
 * value of COLUMNS_A_COPY_CLEARS in the source that is a SHA-256.
 *
 * Every copy clears those columns now, so none of these hashes is carried on purpose and the search
 * fails closed on every one of them. Confirming a visitor registers its token's SHA-256 in `held_keys`
 * too (src/server/lib/visitors.ts), so most token hashes are in both lists.
 *
 * READ IT ON BOTH SIDES OF THE COPY by passing the first answer back in as `into`, so a key or a
 * credential made during the copy is searched for as well.
 *
 * The caller keeps the hashes in memory and never prints or logs one; it prints how many there are.
 *
 * @param {import('better-sqlite3').Database} db  a handle on the SOURCE
 * @param {Set<string>} [into]  the answer of an earlier reading
 * @returns {Set<string>}
 */
export function keyHashesACopyIsSearchedFor(db, into = new Set()) {
  for (const hash of keyHashesHeldIn(db)) into.add(hash)
  if (hasTable(db, 'run_tokens')) {
    for (const row of db.prepare('SELECT token_hash AS v FROM run_tokens').all()) {
      const value = String(/** @type {{ v: unknown }} */ (row).v)
      if (A_HASH.test(value)) into.add(value)
    }
  }
  for (const { table, column } of COLUMNS_A_COPY_CLEARS) {
    if (!hasTable(db, table)) continue
    for (const row of db.prepare(`SELECT "${column}" AS v FROM "${table}"`).all()) {
      const value = String(/** @type {{ v: unknown }} */ (row).v)
      if (A_HASH.test(value)) into.add(value)
    }
  }
  return into
}

/**
 * HOW MANY OF THESE HASHES ARE IN ONE BUFFER, adding each one found to `found`.
 *
 * The window search itself, kept in one place: every run of 64 or more lowercase hexadecimal
 * characters is cut into each 64-character window, so a hash beside other hex text is still found.
 * This is what `searchOneFile` calls for every chunk, and what a caller that already holds a file's
 * bytes calls so it does not have to open the file again.
 *
 * THE CALLER MUST NOT PRINT WHAT IS IN `found`. A count is the only thing this family of searches
 * may report; a hash on a screen or in a log is the material the search is about. A caller reports
 * `found.size` and nothing else.
 *
 * @param {Buffer} bytes
 * @param {Set<string>} hashes
 * @param {Set<string>} found  each hash found is added here
 */
export function hashesFoundInTheseBytes(bytes, hashes, found) {
  const text = bytes.toString('latin1')
  for (const run of text.matchAll(/[0-9a-f]{64,}/g)) {
    for (let i = 0; i + HASH_LENGTH <= run[0].length; i++) {
      const piece = run[0].slice(i, i + HASH_LENGTH)
      if (hashes.has(piece)) found.add(piece)
    }
  }
}

/**
 * HOW MANY OF THESE HASHES ARE IN ONE FILE'S BYTES.
 *
 * Read in chunks, never whole: the office's copy was 608 MB on 25 September 2026. Each chunk goes
 * through `hashesFoundInTheseBytes`, and a chunk overlaps the one before it by 63 bytes, so a hash
 * across the border is found as well.
 *
 * @param {string} file
 * @param {Set<string>} hashes
 * @param {Set<string>} found  each hash found is added here
 */
function searchOneFile(file, hashes, found) {
  const fd = openSync(file, 'r')
  try {
    const size = statSync(file).size
    const buffer = Buffer.alloc(CHUNK + HASH_LENGTH - 1)
    let carried = 0
    for (let at = 0; at < size; ) {
      const read = readSync(fd, buffer, carried, CHUNK, at)
      if (read === 0) break
      at += read
      hashesFoundInTheseBytes(buffer.subarray(0, carried + read), hashes, found)
      // Keep the last 63 bytes at the front, so a hash across the border is whole in the next chunk.
      const total = carried + read
      const keep = Math.min(HASH_LENGTH - 1, total)
      buffer.copy(buffer, 0, total - keep, total)
      carried = keep
    }
  } finally {
    closeSync(fd)
  }
}

/**
 * HOW MANY OF THESE HASHES ARE IN A COPY'S BYTES: the file itself, and its write-ahead log when one
 * is beside it, because a copy in WAL mode keeps recent pages there until it is closed. It answers a
 * count and never the hashes, so nothing that reports the answer can print one.
 *
 * @param {string} file
 * @param {Iterable<string>} hashes
 * @returns {number}
 */
export function hashesFoundInTheBytesOf(file, hashes) {
  const wanted = new Set(hashes)
  if (wanted.size === 0) return 0
  const found = new Set()
  for (const one of [file, `${file}-wal`]) {
    if (one === file || existsSync(one)) searchOneFile(one, wanted, found)
  }
  return found.size
}

/**
 * THE BYTE SEARCH OF A COPY, AND AT MOST ONE REWRITE.
 *
 * `file` is the copy, closed, after `emptyAndScrub`. When none of `hashes` is in its bytes, nothing is done.
 * When one is, the copy is rewritten once with `VACUUM INTO` beside it, which writes only the rows it holds
 * into new pages, the rewritten file takes its place, and it is searched again. What the second search finds
 * is in a row the copy keeps, for example a key hash pasted into a record, and no rewrite can take it out: the
 * caller refuses the copy, as before. `openReadOnly` opens a file read only; this module imports no database
 * driver, because pages import its lists.
 *
 * @param {string} file
 * @param {Set<string>} hashes
 * @param {(file: string) => import('better-sqlite3').Database} openReadOnly
 * @returns {{ left: number, rewritten: boolean }}  how many are still found, and whether the copy was rewritten
 */
export function hashesLeftAfterAtMostOneRewrite(file, hashes, openReadOnly) {
  if (hashesFoundInTheBytesOf(file, hashes) === 0) return { left: 0, rewritten: false }
  const fresh = `${file}.rewritten`
  rmSync(fresh, { force: true })
  try {
    const db = openReadOnly(file)
    try {
      db.prepare('VACUUM INTO ?').run(fresh)
    } finally {
      db.close()
    }
    renameSync(fresh, file)
  } finally {
    rmSync(fresh, { force: true })
  }
  return { left: hashesFoundInTheBytesOf(file, hashes), rewritten: true }
}
