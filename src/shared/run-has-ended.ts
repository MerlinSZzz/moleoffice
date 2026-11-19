// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH SESSION STATES MEAN A RUN IS OVER.
 * `RUN_IS_OVER_STATES` and `theRunHasEnded` were moved byte for byte out of src/server/lib/keys.ts, with no
 * change of behaviour. That file imports them back and re-exports them. The comment on the list was moved
 * as it was, so it still says the list is declared in keys.ts.
 */

/**
 * THE SESSION STATES THAT MEAN THE RUN IS OVER, and the one reading of them.
 *
 * A run's key dies when the run does. `finished` and `crashed` are how a run the worker watched
 * ended; `orphaned` is how a session reads once nothing holds it and it never said; `paused` is how a
 * run a shutdown stopped reads (criterion W6). A paused run's process has ended, and resuming it starts
 * a new run with a key of its own, so its key dies with it too. The other three
 * words — `running`, `idle`, `unknown` — all describe a run that may still be alive, so no key is
 * revoked on them: revoking there would take a live run's key away.
 *
 * DECLARED HERE because this file is where a run's key is revoked, and read from here by every
 * caller that has to agree on which words end a run. `presence.ts` asks the same question when it
 * decides whether an agent is answering, and got its own copy before this; two copies of this list
 * are two answers to "is the run over", which is the defect this file keeps finding.
 */
export const RUN_IS_OVER_STATES: readonly string[] = ['finished', 'crashed', 'paused', 'orphaned']

/** Whether a session record's `state` means the run it describes has ended. */
export function theRunHasEnded(state: unknown): boolean {
  return typeof state === 'string' && RUN_IS_OVER_STATES.includes(state)
}
