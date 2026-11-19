// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE STATES IN WHICH THE LEDGER COUNTS A SESSION AS OVER, listed once. A row of a session in one of these may be
 * released without force; in any other state the ledger refuses the release unless it is forced.
 *
 * A `.mjs` so that a JavaScript reader can import it as well as a TypeScript one. src/server/lib/resources.ts gives the
 * list its type as TERMINAL_STATES, and tools/sandbox.mjs reads it before `up` releases a container row another
 * session left. Until this file the launcher had only the wider list of states a run is over in, which holds
 * `orphaned`, and would have asked for a release the ledger refuses.
 *
 * `orphaned` is not in here. The office marks a session orphaned by itself after a long silence, so the word does not
 * say the session's process is gone. `paused` is: a paused run's process was stopped and waited for, and resuming it
 * starts a new session.
 */

/** @type {readonly ['finished', 'crashed', 'paused']} */
export const THE_LEDGER_COUNTS_A_SESSION_OVER_IN = Object.freeze(/** @type {const} */ (['finished', 'crashed', 'paused']))
