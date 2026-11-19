// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW OFTEN THE OFFICE LOOKS WHETHER TO START ITS HOST JOB RUNNER, HOW MANY STARTS IT MAKES IN A WINDOW, AND HOW LONG
 * IT WAITS FOR ONE IT STOPPED (./host-job-runner.ts). They are here alone, with no import, so a test reads them without
 * opening a database, and so are the note the office leaves on the row of a runner it stopped and the two sentences
 * about the runner that hold a time the office chose.
 */

/** How often the office looks whether a runner should be started. */
export const THE_LOOK_MS = 5_000
/** At most this many starts in THE_WINDOW_MS, the first one included. */
export const AT_MOST_STARTS = 3
export const THE_WINDOW_MS = 10 * 60_000
/**
 * HOW LONG THE OFFICE WAITS, WHEN IT STOPS, FOR THE RUNNER IT ASKED TO STOP, before it closes the runner's row. The
 * runner gives a running tool THE_GRACE_MS of tools/run-the-host-jobs.mjs, ten seconds, between TERM and KILL, so this
 * is longer. The office's whole stop has forty seconds (SHUTDOWN_LIMIT_MS in src/config/settings.mjs), and this wait
 * fits inside them. A runner that has not ended within it keeps its row open, and the office says so.
 */
export const THE_STOP_WAIT_MS = 15_000
/** The note on the row of a runner the office stopped, when it stopped itself. */
export const THE_NOTE_OF_A_STOPPED_RUNNER = 'the host job runner was stopped with the office'

/** The words for a runner that runs and is filed in the ledger. `started` is the stamp of the moment it was started. */
export function theRunnerRuns(pid: number, pgid: number, started: string, logPath: string): string {
  return `The host job runner runs as process ${String(pid)}, in a process group of its own (${String(pgid)}), started at ${started}. Its log is ${logPath}.`
}

/** The words once `starts` starts in THE_WINDOW_MS have used up the bound. `next` is the stamp of the next start. */
export function theStartsAreUsedUp(starts: number, next: string): string {
  return (
    `The office has started the host job runner ${String(starts)} times in the last ${String(THE_WINDOW_MS / 60_000)} minutes, ` +
    `which is as many as it starts in that time, so it starts the next at ${next}. An asked host job waits until then.`
  )
}
