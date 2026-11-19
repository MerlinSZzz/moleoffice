// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * AN ENDED ENTRY'S RESOLUTION CLONE GOES A DAY AFTER IT WAS LAST WRITTEN, UNLESS AN OPEN PROBLEM OR A CURRENT FIX BRIEF
 * NAMES THE ENTRY (wave 13u round 153). Part of the merge tool, tools/the-merger.mjs.
 *
 * A check of a resolution (tools/merge-tool/check-a-resolution.mjs) makes <workdir>/resolution/clone, a shared clone of
 * the lane's repository with the resolution replayed in it. Nothing reads it after the check: a passing check points
 * refs/mole-office/resolved/<entry> at the resolution, and the entry's turn replays from that ref. On 2 November 2026
 * each such folder held about 334 MB, 49 of them were kept, and nothing removed them.
 *
 * THE SWEEP REMOVES <workdir>/resolution, the folder the check makes and the only thing in it, when all of these hold:
 *
 *   - the folder, its clone and the clone's git folder were last changed more than a day ago;
 *   - the office says the entry is in a final state (merged, bounced, withdrawn or superseded);
 *   - no fix round the office asked for the entry is current: every ask that names a brief has ended, or the run its
 *     round started is finished or crashed;
 *   - every problem that names the entry is over: each is fixed, worked around or accepted. A problem with no state is
 *     not over, because nobody has said so.
 *
 * The cheap checks come first, so a clone written within the day costs no request, and those two answers are quiet: the
 * log says nothing for an entry with no folder or a folder written within the day. A resolve brief does not keep the
 * folder: an entry that has ended can take no resolution. A link, or a path that leads outside the entry's folder, is
 * refused and never followed. Each reader is given by the caller, so this file sends no request itself.
 */
import './a-library-is-not-a-program.mjs'
import { lstatSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** How long an ended entry's resolution folder is kept after it was last written. */
export const A_RESOLUTION_IS_KEPT_FOR_MS = 24 * 60 * 60 * 1000

/** The problem states that say a problem is over (src/shared/kinds.ts, PROBLEM_STATES). Any other keeps the folder. */
const A_PROBLEM_IS_OVER = new Set(['fixed', 'worked_around', 'accepted'])

/** The run states that say a run has ended (src/shared/types.ts, SESSION_STATES). Any other keeps the folder. */
const A_RUN_IS_OVER = new Set(['finished', 'crashed'])

/** The folder a check of a resolution makes in an entry's workdir. */
export const RESOLUTION_FOLDER = 'resolution'

/**
 * When an entry's resolution folder was last written, in ms: the latest change of the folder, its clone and the clone's
 * git folder, so the last git step of the check counts. Null when the entry has none. A link there is refused.
 *
 * @param {string} workdir
 * @returns {number | null}
 */
export function whenTheResolutionWasLastWritten(workdir) {
  const folder = join(workdir, RESOLUTION_FOLDER)
  const found = lstatOrNull(folder)
  if (found === null) return null
  if (!found.isDirectory()) throw new Error(`${folder} is ${found.isSymbolicLink() ? 'a link' : 'not a folder'}, so it is left as it is`)
  let latest = found.mtimeMs
  for (const part of [join(folder, 'clone'), join(folder, 'clone', '.git')]) {
    const one = lstatOrNull(part)
    if (one !== null) latest = Math.max(latest, one.mtimeMs)
  }
  return latest
}

/** @param {string} path */
function lstatOrNull(path) {
  try {
    return lstatSync(path)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return null
    throw err
  }
}

/**
 * Whether entry `id`'s resolution folder goes now, and the sentence the log says. `ended(entry)` says whether the
 * office's state is final. `readEntry(id)` gives the entry or throws; `readRunState(run)` gives a run's state or throws;
 * `problemsNaming(id)` gives every problem whose words name the entry, or throws when the office cannot give them all.
 *
 * @param {{
 *   id: string,
 *   workdir: string,
 *   nowMs: number,
 *   ended: (entry: any) => boolean,
 *   readEntry: (id: string) => Promise<any>,
 *   readRunState: (run: string) => Promise<any>,
 *   problemsNaming: (id: string) => Promise<any[]>,
 *   keptForMs?: number,
 * }} question
 * @returns {Promise<{ goes: boolean, quiet?: true, says: string }>}
 */
export async function whetherTheResolutionGoes({ id, workdir, nowMs, ended, readEntry, readRunState, problemsNaming, keptForMs = A_RESOLUTION_IS_KEPT_FOR_MS }) {
  const written = whenTheResolutionWasLastWritten(workdir)
  if (written === null) return { goes: false, quiet: true, says: `merge entry ${id} has no resolution folder` }
  const hours = Math.floor((nowMs - written) / 3_600_000)
  if (nowMs - written <= keptForMs) return { goes: false, quiet: true, says: `the resolution folder of merge entry ${id} was last written ${String(hours)} hours ago, within the day it is kept` }
  const entry = await readEntry(id)
  if (!ended(entry)) return { goes: false, says: `merge entry ${id} is ${String(entry.state)}, not ended, so its resolution folder is kept` }
  for (const ask of entry.machine?.waitsForAFixRound?.asks ?? []) {
    if (typeof ask?.brief !== 'string' || ask.ended !== undefined) continue
    if (ask.started === undefined) return { goes: false, says: `the fix brief ${ask.brief} for merge entry ${id} still waits for its round, so the entry's resolution folder is kept` }
    const state = await readRunState(ask.started.run)
    if (!A_RUN_IS_OVER.has(state)) return { goes: false, says: `the fix brief ${ask.brief} for merge entry ${id} is current: its run ${String(ask.started.run)} is ${String(state)}, so the entry's resolution folder is kept` }
  }
  for (const problem of await problemsNaming(id)) {
    const state = problem?.data?.state
    if (!A_PROBLEM_IS_OVER.has(state)) return { goes: false, says: `problem ${String(problem?.id)} names merge entry ${id} and is ${typeof state === 'string' ? state : 'in no state anybody gave'}, so the entry's resolution folder is kept` }
  }
  return { goes: true, says: `merge entry ${id} is ${String(entry.state)}, its resolution folder was last written ${String(hours)} hours ago, and no open problem or current fix brief names it` }
}

/**
 * Remove entry `id`'s resolution folder in `workdirs`, the folder that holds every entry's workdir. Only a real folder
 * at exactly <workdirs>/<id>/resolution goes: a link, or a path that leads elsewhere, is refused.
 *
 * @param {string} workdirs
 * @param {string} id
 */
export function removeTheResolution(workdirs, id) {
  if (id === '' || id === '.' || id === '..' || id.includes('/') || id.includes('\\')) throw new Error(`${JSON.stringify(id)} is not an entry's folder name, so nothing was removed`)
  const folder = join(workdirs, id, RESOLUTION_FOLDER)
  const found = lstatSync(folder)
  if (!found.isDirectory()) throw new Error(`${folder} is ${found.isSymbolicLink() ? 'a link' : 'not a folder'}, so nothing was removed`)
  const real = realpathSync(folder)
  const expected = join(realpathSync(workdirs), id, RESOLUTION_FOLDER)
  if (real !== expected) throw new Error(`${folder} leads to ${real}, not ${expected}, so nothing was removed`)
  rmSync(real, { recursive: true })
}
