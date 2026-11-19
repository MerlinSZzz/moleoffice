// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE OWNER'S SHUT DOWN LEFT RUNNING, asked once the server has gone.
 *
 * The office page's Shut down ends the server through its own way out (src/server/index.ts). That way out ends the
 * terminal holder too, and it can leave the holder running when its readings disagree. The server stops answering
 * reads at the start of its way out, before the holder is ended, so a window that closed when the server stopped
 * answering said nothing about a holder left running. The server ends the holder before it lets its service lock go,
 * so the window waits for the lock to go and then runs the stop command. With no lock, the stop command ends a holder
 * it can prove, or says why it left one, by the same readings, and its exit code says which.
 *
 * It waits at most as long as the stop command waits for a server to end, and then for its holder. A lock still there
 * after that is the stop command's to read, and it says what it found.
 *
 * WHAT THE WINDOW THEN SAYS names the stop's exit code with its words. A stop that exited HOLDER_NOT_STOPPED left no
 * server running, so the window says that the server stopped and the holder did not, and not that Mole Office was not
 * shut down.
 */
import { readTheServiceLock } from '../config/the-service-lock.mjs'
import { EXIT, STOP_WAIT_MS, THE_HOLDER_ENDS_WITHIN_MS } from '../config/the-service-command.mjs'

/** The longest the window waits for the server's service lock to go after the server stopped answering. */
export const THE_LOCK_GOES_WITHIN_MS = STOP_WAIT_MS + THE_HOLDER_ENDS_WITHIN_MS

/**
 * Wait for the service lock to go, then run the stop command, and say how it ended.
 *
 * @template {{ ok: boolean, said: string }} T
 * @param {{ lockPath: string, runTheStop: () => Promise<T>, within?: number }} how
 * @returns {Promise<T>}
 */
export async function whatTheShutDownLeft({ lockPath, runTheStop, within = THE_LOCK_GOES_WITHIN_MS }) {
  const since = Date.now()
  while (readTheServiceLock(lockPath).state === 'read' && Date.now() - since < within) {
    await new Promise((done) => setTimeout(done, 200))
  }
  return runTheStop()
}

/**
 * What the window says after a stop that did not exit 0, in the window's words for its language.
 *
 * @param {{ code: number | null, said: string }} stopped the stop's exit code, or null when it did not end with one (it
 *   did not run, or a signal ended it), and what it printed or why it did not run
 * @param {Pick<import('../config/the-self-check-words.mjs').WindowWords, 'couldNotStop' | 'holderStillRunning'>} words
 * @returns {string}
 */
export function whatTheWindowSaysOfTheStop(stopped, words) {
  if (stopped.code === EXIT.HOLDER_NOT_STOPPED) return words.holderStillRunning(stopped.code, stopped.said)
  return words.couldNotStop(stopped.code, stopped.said)
}
