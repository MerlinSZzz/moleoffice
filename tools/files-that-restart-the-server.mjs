// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The files whose changes restart the API and its worker. tools/serve-dev.mjs restarts on them, and the stable bootstrap
 * reads them to tell whether a server started at an older commit runs the code of a newer one. Importing this module
 * loads no SQLite, which importing tools/serve-dev.mjs does.
 */
import { theFilesBuiltFrom } from '../src/config/import-graph.mjs'
import { THE_SERVER_ENTRY, THE_WORKER_ENTRY } from '../src/config/newest-source.mjs'

/**
 * XcXCy5MM-1q5: the worker starts as a separate program, so the server's import graph misses it.
 * Restarting the API stops its worker and starts a fresh one (src/server/index.ts). Both programs
 * therefore decide which edits restart the API, using the entries that also name what is started.
 */
export const THE_PROGRAMS_RESTARTED_WITH_THE_SERVER = [THE_SERVER_ENTRY, THE_WORKER_ENTRY]

/**
 * The files whose changes restart the API and its worker, with shared imports counted once.
 * @param {string} root the checkout
 * @returns {string[]} paths relative to the checkout
 */
export function theFilesThatRestartTheServer(root) {
  return [...new Set(THE_PROGRAMS_RESTARTED_WITH_THE_SERVER.flatMap((entry) => theFilesBuiltFrom(entry, root).files))]
}
