// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A CHECK'S PHOTOGRAPH OF A TREE, AND THE WORKER'S TREE PHOTOGRAPHED ON A THREAD OF ITS OWN.
 *
 * Before and after its model, a check photographs two trees: its own and the worker's (howTheCheckoutStands in
 * tools/the-inspector.mjs says why both). A photograph is the commit a tree is on and every path that differs from it,
 * read by git programs the inspector's thread waits for. The inspector read the two trees one after the other. On
 * made-up checks the two took 0.60 to 0.69 seconds each time.
 *
 * Nothing orders the two reads. Each reads only its own folder: rev-parse, ls-tree, check-attr and ls-files write no
 * index, and the files are hashed in the process that reads them. So the inspector begins the worker's photograph on a
 * thread of its own, then reads its own tree on its own thread, then waits for the worker's. The photograph is the
 * same on either thread: the same function, with the same answers and the same words.
 */

import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { guardedGit, outsideTheCommitInLines } from './sandbox-git.mjs'

/** The job this file does when it is started as a thread. Any other start of it runs nothing. */
const THE_JOB = 'a check photographs a tree'

/**
 * A photograph: the commit and the paths that differ from it, or why the tree was not read. `unread` is said with the
 * verdict. `stops` is what the inspector writes before it stops the check.
 * @typedef {{ head: string | null, dirty: string | null } | { unread: string } | { stops: string }} Photograph
 */

/**
 * WHAT THE TREE AT `at` LOOKS LIKE RIGHT NOW: the commit it is on, and every path that differs from it.
 *
 * `unreadIsSaid` is set for the worker's checkout in a sandbox, which this check does not read (wave 13u round 72): a
 * read that fails there is recorded as `unread` and said with the verdict (whatTheWorkerDidMeanwhile in
 * tools/the-inspector.mjs). Anywhere else a read that fails gives `stops`, because whether the tree stayed unchanged
 * cannot be checked.
 * @param {string} at
 * @param {boolean} [unreadIsSaid]
 * @returns {Photograph}
 */
export function aPhotographOf(at, unreadIsSaid = false) {
  /** @type {{ what: string, why: any } | undefined} */
  let failed
  /** @type {(what: string, read: () => string) => string | null} */
  const said = (what, read) => {
    try {
      return read()
    } catch (why) {
      // A process that could not run has said nothing about the checkout. A missing working
      // directory can produce ENOENT too, so name the read and its error without guessing why.
      // A comparison that could not read a file has not said either.
      if (typeof (/** @type {any} */ (why))?.status !== 'number') {
        failed ??= { what, why }
        return null
      }
      return `git could not answer ${what}: ${String(why)}`
    }
  }
  // THE FILES ARE COMPARED WITH THE COMMIT BY THIS TOOL AND NOT BY `git status`, which would run a
  // filter the repository names (src/config/outside-the-commit.mjs). The lines read as status's do.
  const head = said('rev-parse HEAD', () => guardedGit(at, ['rev-parse', 'HEAD']))
  const dirty = failed === undefined ? said('the files against HEAD', () => outsideTheCommitInLines(at, String(head))) : null
  if (failed === undefined) return { head, dirty }
  const { what, why } = failed
  const words = `${typeof why?.code === 'string' ? 'git could not be run for' : 'nothing could be read for'} ${what}: ${String(why)}`
  if (unreadIsSaid) return { unread: words }
  return {
    stops:
      `This check is not posted, because the checkout could not be read at ${at}: ${words}.\n` +
      (why?.code === 'ENOENT' ? 'ENOENT can mean git is missing or the checkout folder is missing.\n' : '') +
      'Whether the checkout stayed unchanged could not be checked. Restore access to the ' +
      'checkout and git, then run the check again.\n',
  }
}

/**
 * BEGIN A PHOTOGRAPH OF THE TREE AT `at` on a thread of its own, and answer at once. The promise settles with what
 * aPhotographOf gives on that thread. A thread that stops before it answers has not read the tree, and that is said as
 * a read that could not run is: `unread` where `unreadIsSaid` is set, `stops` anywhere else.
 * @param {string} at
 * @param {boolean} [unreadIsSaid]
 * @returns {Promise<Photograph>}
 */
export function aPhotographBegun(at, unreadIsSaid = false) {
  const thread = new Worker(new URL(import.meta.url), { workerData: { job: THE_JOB, at, unreadIsSaid } })
  return new Promise((done) => {
    /** @param {string} words */
    const notRead = (words) =>
      done(unreadIsSaid
        ? { unread: words }
        : { stops: `This check is not posted, because the checkout could not be read at ${at}: ${words}.\nWhether the checkout stayed unchanged could not be checked. Run the check again.\n` })
    thread.once('message', (photograph) => done(photograph))
    thread.once('error', (why) => notRead(`the thread reading it stopped: ${String(why)}`))
    thread.once('exit', (code) => notRead(`the thread reading it ended with exit code ${String(code)} before it answered`))
  })
}

if (!isMainThread && workerData?.job === THE_JOB) parentPort?.postMessage(aPhotographOf(workerData.at, workerData.unreadIsSaid))
