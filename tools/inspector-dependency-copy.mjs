// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A CHECK'S PRIVATE COPY OF node_modules, MADE ON A THREAD OF ITS OWN WHILE THE INSPECTOR CLONES (item 2bb of the
 * requirement list).
 *
 * A check in a sandbox gets a private clone of the run's repository and a physical copy of the worker's node_modules
 * (soATestCanRunThere in tools/the-inspector.mjs). The inspector made the copy after the clone and the checkout, on its
 * own thread, so the check waited for the one and then for the other. On made-up checks of this repository the clone
 * took about 5 seconds and the copy of 23,192 entries 0.4 to 2.5 seconds.
 *
 * The copy does not need the clone. So the inspector begins it before the clone, into a folder of the check's own beside
 * the work tree, and moves it into the work tree where it copied before. The copy is the same: the same `cpSync` with
 * the same options, from the same folder, on a worker thread. The thread goes on while the inspector's own thread waits
 * for git. Nothing is left out, and the view is validated with the copy in place, as before.
 */

import { cpSync } from 'node:fs'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'

/** The job this file does when it is started as a thread. Any other start of it runs nothing. */
const THE_JOB = 'a check copies its node_modules'

/**
 * BEGIN THE COPY of `from` to `to` on a thread of its own, and answer at once. `copied` settles when the thread is done:
 * null when everything was copied, or what the copy threw, in the words `String` gives it, which are the words the
 * inspector said when it copied on its own thread.
 * @param {string} from
 * @param {string} to
 * @returns {{ from: string, to: string, copied: Promise<string | null> }}
 */
export function aDependencyCopyBegun(from, to) {
  const thread = new Worker(new URL(import.meta.url), { workerData: { job: THE_JOB, from, to } })
  /** @type {Promise<string | null>} */
  const copied = new Promise((done) => {
    thread.once('message', (said) => done(typeof said === 'string' ? said : null))
    thread.once('error', (why) => done(`the thread copying node_modules stopped: ${String(why)}`))
    thread.once('exit', (code) => done(`the thread copying node_modules ended with exit code ${String(code)} before it said it was done`))
  })
  return { from, to, copied }
}

if (!isMainThread && workerData?.job === THE_JOB) {
  try {
    cpSync(workerData.from, workerData.to, { recursive: true, verbatimSymlinks: true })
    parentPort?.postMessage(null)
  } catch (why) {
    parentPort?.postMessage(String(why))
  }
}
