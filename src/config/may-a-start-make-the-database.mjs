// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * MAY A START MAKE THE DATABASE: whether a start may go on when its database is not there.
 *
 * A data folder may be on a drive that is not connected now: a USB stick that is out, or a mount point
 * that is not mounted. Its path then names an empty folder, or no folder at all. Before this file, a start
 * made a new empty database there and served it, and nothing said so. A start now refuses, and makes
 * nothing, when the database is not there and the office has kept its database at that place before.
 * design/window/the-data-folder-move.criteria.md, DF30, says what the person sees.
 *
 * ---------------------------------------------------------------------------------------
 * THE MARK
 * ---------------------------------------------------------------------------------------
 *
 * The office knows it has kept its database at a place by a mark: one small file for each place, in the
 * per-user folder, under `databases-kept`. Its name is the first 16 hex of the SHA-256 of the database's
 * resolved path, as the terminal holder names its files. The server writes it once it has opened the
 * database (`keepTheMarkOfTheDatabase`, called from src/server/index.ts). So an office that already has its
 * database gets its mark on its first start after an update, with nothing for the person to do. Nothing
 * reads what the file holds; the path and the time in it are for a person who opens it.
 *
 * A first start has no mark, so it makes the database as before. That covers a first start with no `.env`
 * line, the first start after `mole-office data-folder choose`, and a checkout's first start.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT ASKED ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * A database inside the install's own data root: the per-user folder of an installed office, and the
 * checkout of a checkout. The marks are kept on that drive and the code runs from it, so that database
 * cannot be gone because a drive is. Its start makes it as before, and no mark is written for it.
 *
 * Who chose the place does not matter. The `.env` line, the process environment and the default are asked
 * about alike. The Linux login unit names the database through the process environment
 * (src/config/start-at-login.mjs), and a start at login can come before the drive is mounted.
 *
 * ---------------------------------------------------------------------------------------
 * WHO ASKS
 * ---------------------------------------------------------------------------------------
 *
 * `mole-office start`, before it starts the terminal holder or makes the log's folder, and the server's own
 * start, before its lock. The window starts the office through `mole-office start`, so it meets the same
 * refusal.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { DATA_ROOT, thePerUserDataFolder } from './settings.mjs'

/**
 * @typedef {{ env?: Record<string, string | undefined>, platform?: string, dataRoot?: string }} Here
 */

/**
 * Whether a database is inside the install's own data root.
 * @param {string} databasePath @param {string} dataRoot
 */
function isInsideTheDataRoot(databasePath, dataRoot) {
  const path = relative(resolve(dataRoot), resolve(databasePath))
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

/**
 * The mark that says the office has kept its database at this path.
 * @param {string} databasePath @param {Here} [here]
 * @returns {string}
 */
export function theMarkOfTheDatabase(databasePath, here = {}) {
  const name = createHash('sha256').update(resolve(databasePath)).digest('hex').slice(0, 16)
  return join(thePerUserDataFolder(here.env, here.platform), 'databases-kept', `${name}.json`)
}

/**
 * The refusal, in the words DF30 asks for.
 * @param {string} database @param {string} mark
 * @returns {string}
 */
export function theMissingDatabaseWords(database, mark) {
  return [
    `Mole Office did not start. Its database should be at ${database}, and it is not there now.`,
    'Mole Office has kept its database there before, so it made nothing there and changed nothing.',
    'If that folder is on a drive that is not connected, connect the drive and start Mole Office again.',
    `If you removed the database on purpose and want a new, empty office there, delete ${mark} and start Mole Office again.`,
  ].join('\n')
}

/**
 * The words for a mark that the server could not write, after it has opened its database.
 * @param {string} mark @param {string} why
 * @returns {string}
 */
export function theMarkThatCannotBeWrittenWords(mark, why) {
  return [
    `Mole Office did not finish starting. It could not write the mark at ${mark} that says the office keeps its database there.`,
    `The system said: ${why}`,
    'Make the folder that holds the mark writable, or free some space on that disk, and start Mole Office again.',
  ].join('\n')
}

/**
 * THE ONE QUESTION EVERY START ASKS before it makes anything. Null lets the start go on. A sentence is the
 * refusal: the database is not there, and a mark says the office has kept it at that place before.
 * @param {string} databasePath @param {Here} [here]
 * @returns {string | null}
 */
export function whyAStartMayNotMakeTheDatabase(databasePath, here = {}) {
  if (existsSync(databasePath)) return null
  if (isInsideTheDataRoot(databasePath, here.dataRoot ?? DATA_ROOT)) return null
  const mark = theMarkOfTheDatabase(databasePath, here)
  if (!existsSync(mark)) return null
  return theMissingDatabaseWords(resolve(databasePath), mark)
}

/**
 * The server writes the mark once it has opened its database. It writes nothing when the mark is there
 * already, or when the database is inside the install's own data root. Null means the mark is there or
 * needed none. A sentence means the mark could not be written, and the start ends with it.
 * @param {string} databasePath @param {Here} [here]
 * @returns {string | null}
 */
export function keepTheMarkOfTheDatabase(databasePath, here = {}) {
  if (isInsideTheDataRoot(databasePath, here.dataRoot ?? DATA_ROOT)) return null
  const mark = theMarkOfTheDatabase(databasePath, here)
  if (existsSync(mark)) return null
  try {
    mkdirSync(dirname(mark), { recursive: true })
    writeFileSync(mark, `${JSON.stringify({ database: resolve(databasePath), since: new Date().toISOString() }, null, 2)}\n`)
    return null
  } catch (error) {
    return theMarkThatCannotBeWrittenWords(mark, error instanceof Error ? error.message : String(error))
  }
}
