// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER THE SWITCH, A LANDING CHANGES MAIN ONLY (wave 13q round 11). Part of the merge tool,
 * tools/the-merger.mjs. It imports nothing from the tool but a-library-is-not-a-program.mjs, which does nothing when
 * it is imported, so a test can read it without starting a run.
 *
 * Once the office runs from another checkout on the database the main checkout names, the main checkout serves nobody.
 * A landing then moves main and does nothing else: no backup, no migration and no prune of the office's database from
 * the main checkout. The stable office changes only through an upgrade by the handoff.
 *
 * The switch is told from the office's own answer, whatever the layout of the checkout it runs from. The landing asks
 * the office which folder it runs from and which database file it has open (`GET /api/runtime`). It asks the main
 * checkout which database file it names, by running the main checkout's own src/config/settings.mjs there: the
 * `settings().databasePath` that the server (src/server/db/client.ts) and `npm run db:backup` started there would open.
 * Paths are compared as real paths, so a link or a relative path does not make one file two. The cases:
 * - the office runs from the main checkout: the landing is as before, and the main checkout's settings are not asked;
 * - it runs from another folder, on the database the main checkout names: after the switch. The landing changes main only;
 * - it runs from another folder, on another database, as a sandbox's office does: the landing is as before. So it is
 *   when the main checkout names no database file here: it has no settings module, or the file it names does not exist;
 * - the office gives no runtime answer naming its folder and its database, or the database it names is not a file here:
 *   the landing cannot tell which, so it stops before main moves.
 */

import './a-library-is-not-a-program.mjs'
import { realpathSync } from 'node:fs'
import { sep } from 'node:path'

/** Where a checkout keeps the settings its server reads, from the checkout's root. */
export const THE_SETTINGS_MODULE = 'src/config/settings.mjs'

/**
 * The arguments to node that print, as one JSON line, the database file a server started in the working folder would
 * open: `settings().databasePath` from that checkout's own settings module. Its other lines are the module's warnings.
 */
export const THE_DATABASE_QUESTION = [
  '--input-type=module',
  '-e',
  `const { join } = await import('node:path'); const { pathToFileURL } = await import('node:url'); const { settings } = await import(pathToFileURL(join(process.cwd(), ${JSON.stringify(THE_SETTINGS_MODULE)})).href); console.log(JSON.stringify({ databasePath: settings().databasePath }))`,
]

/** The database file in what THE_DATABASE_QUESTION printed, or null when no line of `output` is its answer. */
export function theDatabaseNamedIn(output) {
  for (const line of output.split('\n')) {
    if (!line.startsWith('{"databasePath":')) continue
    let answer
    try {
      answer = JSON.parse(line)
    } catch (err) {
      if (err instanceof SyntaxError) continue
      throw err
    }
    if (typeof answer.databasePath === 'string' && answer.databasePath !== '') return answer.databasePath
  }
  return null
}

/** The real path of `path`, or null when nothing is there. */
function theRealPathOf(path) {
  try {
    return realpathSync(path)
  } catch (err) {
    if (/** @type {any} */ (err)?.code === 'ENOENT') return null
    throw err
  }
}

/**
 * Whether the office's `GET /api/runtime` answer says it runs from `folder`: the one comparison the landing and the wait
 * for health after it make. A path that does not exist here is not `folder`, which does.
 */
export function theOfficeRunsFrom(runtime, folder) {
  const path = runtime?.repository?.path
  if (typeof path !== 'string') return false
  const real = theRealPathOf(path)
  return real !== null && real === realpathSync(folder)
}

/**
 * WHETHER AN ENTRY THAT CHANGES THE QUEUE'S OWN CODE MAY RIDE A BUS (13u round 66), as a driver or a rider. The rule that
 * tests such an entry alone guards an office and a merge tool that run from the checkout the entry lands on: a driver's
 * landing restarts them there with the code it landed, before a rider's borrowed result is judged. When both run from
 * outside that checkout, a landing changes neither. The entry's copy of the queue's code then runs nowhere until an
 * upgrade, and the suite tests it in the tree like any other file, so it may ride.
 *
 * `position` is the value of the switch named `setting`. `runtime` is the office's `GET /api/runtime` answer, the one the
 * landing reads, or null when it gave none. `tool` is the folder the merge tool runs from. The answer has `rides` and
 * `says`. It rides only when the switch is 1 and both folders are outside `root`. When the switch is 0 or anything else,
 * or the office names no folder that is here, it is tested alone, and `says` says why.
 */
export function whetherTheQueuesOwnCodeMayRide({ root, position, setting, runtime, tool }) {
  if (position === '0') return { rides: false, says: `${setting} is 0, so it is tested alone` }
  if (position !== '1') return { rides: false, says: `${setting} is ${JSON.stringify(position)}, which is neither 1 nor 0, so it is tested alone` }
  const folder = runtime?.repository?.path
  if (typeof folder !== 'string') return { rides: false, says: 'the office gave no runtime answer naming the folder it runs from, so it is tested alone' }
  const office = theRealPathOf(folder)
  if (office === null) return { rides: false, says: `the office says it runs from ${folder}, which is not a folder here, so it is tested alone` }
  const lane = realpathSync(root)
  const inTheLane = (path) => path === lane || path.startsWith(lane + sep)
  if (inTheLane(office)) return { rides: false, says: `the office runs from ${folder}, which a landing on ${root} changes, so it is tested alone` }
  const merger = theRealPathOf(tool)
  if (merger === null) return { rides: false, says: `the merge tool runs from ${tool}, which is not a folder here, so it is tested alone` }
  if (inTheLane(merger)) return { rides: false, says: `the merge tool runs from ${tool}, which a landing on ${root} changes, so it is tested alone` }
  return { rides: true, says: `the office runs from ${folder} and the merge tool from ${tool}, and a landing on ${root} changes neither, so it may ride` }
}

/**
 * What a landing on `root` does about the office. `runtime` is the office's runtime answer, or null when it gave none.
 * `askTheRootsDatabase` answers the database file the main checkout's own settings name, or null when it has no
 * settings module; it is called only when the office runs from another folder. The answer has `mainOnly` and `says`,
 * and, when the landing changes main only, the words it writes in place of the backup and the migration. It has
 * `cannotTell` instead when the landing must stop before main moves.
 */
export async function whatTheLandingDoesAboutTheOffice({ root, runtime, askTheRootsDatabase }) {
  const folder = runtime?.repository?.path
  if (typeof folder !== 'string') {
    return { mainOnly: false, cannotTell: `the office gave no runtime answer naming the folder it runs from, so the landing cannot tell whether it runs on the database ${root} names` }
  }
  if (theOfficeRunsFrom(runtime, root)) {
    return { mainOnly: false, says: `the office runs from ${root}, so the landing backs up and migrates as before` }
  }
  const database = runtime?.database?.path
  if (typeof database !== 'string') {
    return { mainOnly: false, cannotTell: `the office runs from ${folder} and names no database file it has open, so the landing cannot tell whether it runs on the database ${root} names` }
  }
  const realDatabase = theRealPathOf(database)
  if (realDatabase === null) {
    return { mainOnly: false, cannotTell: `the office runs from ${folder} on ${database}, which is not a file here, so the landing cannot tell whether it is the database ${root} names` }
  }
  const named = await askTheRootsDatabase()
  if (named === null) {
    return { mainOnly: false, says: `the office runs from ${folder}, and ${root} has no ${THE_SETTINGS_MODULE} to name a database, so the landing backs up and migrates as before` }
  }
  const realNamed = theRealPathOf(named)
  if (realNamed === null) {
    return { mainOnly: false, says: `the office runs from ${folder} on ${database}; ${root} names ${named}, which does not exist, so the landing backs up and migrates as before` }
  }
  if (realNamed !== realDatabase) {
    return { mainOnly: false, says: `the office runs from ${folder} on ${database}, not on ${named}, which ${root} names, so the landing backs up and migrates as before` }
  }
  return {
    mainOnly: true,
    says: `the office runs from ${folder} on ${database}, the database ${root} names, so this landing changes main only: no backup, no migration and no prune from ${root}`,
    noBackup: `no backup: the office runs from ${folder} on the database ${root} names, so the landing changes main only`,
    noMigration: `not migrated: the office runs from ${folder}, which changes only through an upgrade`,
  }
}
