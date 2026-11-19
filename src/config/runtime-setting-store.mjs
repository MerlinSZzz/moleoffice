// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { aTimeHasCome, localStamp } from '../shared/typed-time.mjs'

const runtimeModules = createRequire(import.meta.url)

/** The column is checked once per connection, including an older database without it.
 * @type {WeakMap<import('better-sqlite3').Database, boolean>}
 */
const choicesHaveEnds = new WeakMap()

/** The same end-time rule serves both readers and the run-out pass.
 * @param {{until?:string|null}} choice
 * @param {string} [now]
 */
export function runtimeChoiceHasRunOut(choice, now) {
  return choice.until != null && aTimeHasCome(choice.until, now ?? localStamp(new Date()))
}

/** Read one saved choice without an ended choice taking the place of its fallback.
 * The caller first checks that the table exists. Older databases select only value.
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 * @returns {string | undefined}
 */
export function readRuntimeChoice(db, name) {
  let hasUntil = choicesHaveEnds.get(db)
  if (hasUntil === undefined) {
    hasUntil = db.prepare('PRAGMA table_info(runtime_settings)').all().some(row => /** @type {{name:string}} */ (row).name === 'until')
    choicesHaveEnds.set(db, hasUntil)
  }
  const choice = /** @type {{value:string, until?:string|null}|undefined} */ (db.prepare(hasUntil
    ? 'SELECT value, until FROM runtime_settings WHERE name = ?'
    : 'SELECT value FROM runtime_settings WHERE name = ?').get(name))
  return choice === undefined || runtimeChoiceHasRunOut(choice) ? undefined : choice.value
}

/** A command reads choices from the named office, without creating a database or writing it.
 * A paired development checkout reads here too. The guard (whyThisCheckoutMayNotOpenTheDatabase) keeps its code from
 * changing the stable office's database, and a read-only read of one setting by name changes nothing.
 * A file SQLite cannot read gives a not-read reading with SQLite's words; any other error is thrown.
 * @param {string} file
 * @param {string} name
 * @returns {string | undefined | {notRead:string}}
 */
export function storedRuntimeValue(file, name) {
  if (!existsSync(file)) return undefined
  const Database = /** @type {typeof import('better-sqlite3')} */ (runtimeModules('better-sqlite3'))
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true })
    try {
      const column = name === 'MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS' ? 'dead_letter_after_days'
        : name === 'MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT' ? 'dead_letter_after_count' : null
      if (column !== null && db.prepare('PRAGMA table_info(installation)').all().some((row) => /** @type {{name:string}} */ (row).name === column)) {
        const row = /** @type {{value:number|null}|undefined} */ (db.prepare(`SELECT ${column} AS value FROM installation WHERE only_row = 1`).get())
        return row?.value == null ? undefined : String(row.value)
      }
      // Before migration this table cannot hold choices. The server's migration guard still applies.
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'runtime_settings'").get()) return undefined
      return readRuntimeChoice(db, name)
    } finally { db.close() }
  } catch (error) {
    const code = /** @type {{code?: unknown}} */ (error).code
    if (typeof code !== 'string' || !code.startsWith('SQLITE_')) throw error
    return { notRead: `SQLite could not read the office database at ${file}: ${/** @type {Error} */ (error).message} (${code}).` }
  }
}
