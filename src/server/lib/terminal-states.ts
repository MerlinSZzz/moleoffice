// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `TERMINAL_STATES` was moved byte for byte out of src/server/db/the-processes-a-listing-reads.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { SessionState } from '@shared/types.ts'
import { THE_LEDGER_COUNTS_A_SESSION_OVER_IN } from '../../config/the-ledgers-ended-states.mjs'

/**
 * The states that mean the session is over.
 *
 * EXPORTED BECAUSE ANYTHING THAT RELEASES A ROW HAS TO KNOW THIS LIST, and a second copy of it
 * drifts. `releaseResource` refuses while the owning session has not ended, so a caller choosing a
 * session to release against is choosing from exactly these words. scripts/restore-check.ts kept
 * its own wider list — it counted `orphaned` as over — and picked whichever session its own read
 * happened to return first, so the whole restore proof failed one full run in five with nothing
 * wrong: problem XWKLLcnJ2CWF.
 *
 * `orphaned` IS NOT IN HERE, ON PURPOSE (decision P-0jFzJuFC19, 6 September 2026). The office marks
 * a session `orphaned` by itself, after two hours of silence, so the word may name what the session
 * left behind but may not by itself allow killing it. The decision splits the two:
 * - the orphan report lists an orphaned session's live resources as orphans (`orphanReport`, with
 *   `ORPHAN_REPORT_ALSO_COUNTS`);
 * - releasing one still needs force, because this list is what `releaseResource` reads, and
 *   `orphaned` is not on it.
 *
 * `paused` IS IN HERE (criterion W6): a run a shutdown paused has had its process stopped and waited
 * for, so the session is over, and resuming it starts a new run under a new session.
 *
 * The list itself is in src/config/the-ledgers-ended-states.mjs, so the sandbox launcher, which cannot
 * import this module, releases a row on the same states this door does.
 */
export const TERMINAL_STATES: readonly SessionState[] = THE_LEDGER_COUNTS_A_SESSION_OVER_IN
