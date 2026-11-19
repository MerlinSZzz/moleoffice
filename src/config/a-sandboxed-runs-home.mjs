// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOME FOLDER A SANDBOXED RUN WORKS WITH, as tools/sandbox.mjs makes it, so the office can find the run's
 * conversation there (wave 13u, round 10, way C).
 *
 *   - An ordinary round in sandbox <folder> has HOME <folder>/home, which the container sees at the same path.
 *   - An isolated run (`node tools/sandbox.mjs exec <instance> --isolated --run <id>`) has an empty home of its own,
 *     <folder>/out/isolated/<id>/home, named by its run.
 *
 * tools/sandbox.mjs is another wave's and still writes the isolated path itself (`const itsHome = …`). Until it imports
 * theIsolatedHome from here, the two can drift. Wave 13u's round 10 reported it.
 *
 * Plain JavaScript, so a tool may import it with node and no loader.
 */

import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { SANDBOXES_FOLDER } from './sandbox-folder.mjs'

/**
 * The home of an ordinary round in this sandbox folder.
 * @param {string} folder
 * @returns {string}
 */
export function theSandboxHome(folder) {
  return join(folder, 'home')
}

/**
 * The home of an isolated run in this sandbox folder.
 * @param {string} folder
 * @param {string} run
 * @returns {string}
 */
export function theIsolatedHome(folder, run) {
  return join(folder, 'out', 'isolated', run, 'home')
}

/**
 * @param {string} path
 * @returns {string | null}
 */
function realOrNull(path) {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

/**
 * THE HOME A RUN'S CONVERSATION IS READ FROM, AND THE ONLY ONE (wave 13u, round 10b). A session record is written by its
 * agent, so the sandbox folder it names is checked, not trusted. The folder, links followed, must be an instance folder
 * directly in `sandboxes`, where the sandbox tool makes them. The home in it must be a folder there, not a link to one
 * somewhere else. `missing` is a folder that is not on this computer, which is no conversation yet. `outside` is a record
 * that names a place the office does not read, and the caller refuses it.
 *
 * @param {string} folder the sandbox folder the run's record names
 * @param {string} run the run's record id
 * @param {string} [sandboxes] where instance folders are made; a test's own server has its own
 * @returns {{ home: string } | { home: null, missing: string } | { home: null, outside: string }}
 */
export function theRunsOwnHome(folder, run, sandboxes = SANDBOXES_FOLDER) {
  const real = realOrNull(folder)
  if (real === null) return { home: null, missing: `Its sandbox folder ${folder} is not on this computer.` }
  const root = realOrNull(sandboxes) ?? resolve(sandboxes)
  if (dirname(real) !== root) return { home: null, outside: `Its record names the folder ${folder}, which is not a sandbox folder in ${sandboxes}.` }
  const isolated = theIsolatedHome(real, run)
  const home = existsSync(isolated) ? isolated : theSandboxHome(real)
  const realHome = realOrNull(home)
  if (realHome !== null && realHome !== home) return { home: null, outside: `The home ${home} is a link to ${realHome}, outside its sandbox folder.` }
  return { home }
}

/**
 * Whether a path is inside a run's home, by its name and, when it is there, with its links followed: a name with ..
 * in it, or a link an agent made in its home to a file outside it, is not.
 *
 * @param {string} home a home `theRunsOwnHome` gave
 * @param {string} path
 * @returns {boolean}
 */
export function isInsideTheHome(home, path) {
  const inside = (/** @type {string} */ one) => one.startsWith(home + sep)
  if (!inside(resolve(path))) return false
  const real = realOrNull(path)
  return real === null || inside(real)
}
