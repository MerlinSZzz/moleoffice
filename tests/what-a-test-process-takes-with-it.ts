// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A TEST PROCESS TAKES WITH IT WHEN IT ENDS, HOWEVER IT ENDS: THE SERVERS tests/helpers.ts STARTED,
 * THEN EVERY FOLDER tests/a-test-folder.ts MADE.
 *
 * IN A FILE OF ITS OWN, WHICH IMPORTS NOTHING BUT tests/a-test-folder.ts, AND THAT ONLY NODE. A handler on
 * `process` lasts as long as the process, and keeps alive the module it was written in, with everything
 * that module imports. When test files share a process, vitest loads tests/helpers.ts again for each
 * file, and the first file to load it puts the handlers in place for the whole process. Written in
 * tests/helpers.ts, they kept that first file's helpers alive for every file after it, and with them
 * that file's copy of the server and its database, about 200 MB. Written here, they keep this file and
 * tests/a-test-folder.ts.
 */
import { removeEveryTestFolderNow } from './a-test-folder.ts'

/** The part of the record tests/helpers.ts keeps of what this process started that its end clears. */
export interface WhatTheEndOfTheProcessClears {
  /** Process group ids. Signalling minus one of these takes the child and its whole tree. */
  groups: Set<number>
  transcripts: string | null
  migratedSchema: string | null
}

/**
 * STOP EVERYTHING, RIGHT NOW, WITHOUT WAITING FOR ANYTHING.
 *
 * SYNCHRONOUS ON PURPOSE. An `exit` handler is the last code that runs in a process and Node does
 * not wait for a promise in one, so anything asynchronous here would simply not happen.
 *
 * SIGKILL RATHER THAN SIGTERM for the same reason: asking politely is only worth it if somebody
 * waits for the answer, and nothing here can. Every database this signals is a throwaway file
 * under the temporary directory, so there is no clean shutdown to lose.
 */
function stopEverythingNow(record: WhatTheEndOfTheProcessClears): void {
  for (const group of record.groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch (err) {
      // ESRCH means the group had already gone, which is the outcome that was wanted. Anything
      // else is said out loud rather than swallowed, because a signal that failed for another
      // reason has left something running.
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ESRCH') console.error(`could not stop test server group ${String(group)}: ${String(err)}`)
    }
  }
  record.groups.clear()
  // After the servers, so that none of them is still writing into a folder while it goes. The two
  // folders this record names go with the rest, and are made again if a case asks after this.
  removeEveryTestFolderNow()
  record.transcripts = null
  record.migratedSchema = null
}

/**
 * THE ENDINGS NODE CAN SEE, ANSWERED ONCE PER WORKER PROCESS, BY THREE HANDLERS: `exit`, SIGINT AND
 * SIGTERM. tests/helpers.ts calls this once, when it makes its record of what the process started,
 * which it keeps on `process`.
 *
 * Each handler puts back what it took away, because adding a listener for a signal REPLACES what
 * that signal did by default. A SIGTERM handler that only tidied up would leave a test worker that
 * cannot be stopped with SIGTERM, which is a worse fault than the one being fixed.
 *
 * NO `uncaughtException` HANDLER. vitest reports an uncaught exception only when its own handler is
 * the only one, so a handler here hid every such exception, and a run with one could pass. Without
 * it, under vitest the runner reports the exception and fails the run, and the process goes on until
 * `afterAll` or its end. Outside vitest Node prints the exception and ends the process with code 1,
 * and the `exit` handler stops everything.
 * tests/a-shared-test-process-gives-each-file-a-clean-start.test.ts holds both.
 */
export function stopEverythingWhenTheProcessEnds(record: WhatTheEndOfTheProcessClears): void {
  process.on('exit', () => { stopEverythingNow(record) })

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    // `once`, so the listener is gone before the line below re-raises the signal. Whatever else was
    // listening then gets it, and if nothing was, the process ends the way it would have.
    process.once(signal, () => {
      stopEverythingNow(record)
      process.kill(process.pid, signal)
    })
  }
}
