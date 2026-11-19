// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START NAMES ITS WAIT. Hooks that start a browser stack or a server ran out of time on the cloud box, and the
 * suite's log said only that the hook timed out, not which wait inside it was still waiting. A start that uses these
 * names each of its waits as it begins it. A wait that has lasted A_WAIT_IS_NAMED_AFTER_MS writes one line: who is
 * waiting, the seconds so far, and what for. tests/a-start-says-what-it-has-waited-30-seconds-for.test.ts holds the
 * criterion.
 */

/** How long a wait lasts before it is named in the log. */
export const A_WAIT_IS_NAMED_AFTER_MS = 30_000

/** One start's waits, one at a time. */
export interface NamedWaits {
  /** Begin the wait called `what`, ending the one before it. */
  wait(what: string): void
  /** End the wait that is running, if any. */
  done(): void
}

/**
 * The waits of the start called `who`. A wait writes its line once, through `say`, when it has lasted `afterMs`; one
 * that ends sooner writes nothing. The timer does not keep the process running.
 */
export function namedWaits(who: string, say: (line: string) => void = console.warn, afterMs = A_WAIT_IS_NAMED_AFTER_MS): NamedWaits {
  let timer: ReturnType<typeof setTimeout> | null = null
  const done = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  return {
    wait(what) {
      done()
      const began = Date.now()
      timer = setTimeout(() => {
        timer = null
        say(`${who} has waited ${String(Math.round((Date.now() - began) / 1000))} s so far for ${what}`)
      }, afterMs)
      timer.unref()
    },
    done,
  }
}
