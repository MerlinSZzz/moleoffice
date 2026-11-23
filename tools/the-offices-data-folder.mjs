// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S DATA FOLDER, WHICH NO SANDBOX MOUNTS (the switch procedure's item 3; fPbGHEXq5OfR point 3).
 *
 * The data folder is the folder of the database the settings name: it holds the database, the files beside it and the
 * office's key file. Until 13q's move (round 12; the owner's place, under a decision) it is a
 * checkout's data/, which the template covers with a tmpfs. The move renames it to a folder
 * outside every checkout, which nothing covered,
 * so a --ro or a check view mount could name it. The launcher asks here for every --ro and every check view mount,
 * beside whyAPathIsTheStableCheckout. --from is not asked: a checkout holds its own data/, and the template covers that.
 *
 * IT IS ITS OWN MODULE, NOT A PART OF sandbox-common.mjs, because it reads the settings (src/config/settings.mjs) and
 * sandbox-common.mjs is also imported inside the sandboxes (tools/dsh-hooks/office.mjs) and by the worker's runtimes,
 * which have no business reading the office's settings.
 */
import { homedir } from 'node:os'
import { canonicalDatabasePath, databaseDirectoryFrom, databasePathFrom, theDatabaseTheStableCheckoutNames } from '../src/config/settings.mjs'
import { howAPathMeets } from './sandbox-common.mjs'

/**
 * THE OFFICE'S DATA FOLDERS: the folder of every database the settings may name, read when this is asked. Any of three
 * may be the one the office opens, so all three are read: this checkout's .env, this process's settings, and the
 * stable checkout's .env, whose relative value is that checkout's own. This process's settings are asked through
 * databasePathFrom, never by reading the variable (tests/one-configuration-source.test.ts): with nothing set it
 * answers the declared default, which is this checkout's own data/, so asking it every time costs nothing.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function theOfficesDataFolders(env = process.env) {
  const databases = new Set([canonicalDatabasePath()])
  databases.add(databasePathFrom(env))
  const stable = theDatabaseTheStableCheckoutNames(homedir())
  if (stable !== null) databases.add(stable)
  return [...new Set([...databases].map((database) => databaseDirectoryFrom(database)))]
}

/**
 * WHY A HOST FOLDER MAY NOT GO INTO A SANDBOX AS, IN OR AROUND THE OFFICE'S DATA FOLDER, or null when it may.
 * @param {string} path an absolute host path
 * @returns {string | null}
 */
export function whyAPathIsTheOfficesDataFolder(path) {
  for (const folder of theOfficesDataFolders()) {
    const how = howAPathMeets(path, folder)
    if (how !== null) return `${path} ${how} the office's data folder, ${folder}, which holds the database, the files beside it and the office's key file. No sandbox mounts it, a folder in it or a folder that holds it.`
  }
  return null
}
