// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN SOMETHING LAST ARRIVED FROM A RUN. ONE READER, USED BY EVERYTHING THAT ASKS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 * ---------------------------------------------------------------------------------------
 *
 * Two things ask this question and they ask it for different reasons. The presence reading asks
 * *can this agent be reached now*. The child sweep asks *has this child run gone quiet long enough
 * to be called gone*. Both compare the same moment against the same declared threshold, and this
 * repository's recurring defect is one fact worked out in two places. So the fact is worked out
 * here, once, and both import it.
 *
 * It is a file rather than a function inside one of them because the other one would then have to
 * import it, and those two already import each other's neighbours — a cycle nobody meant to make
 * and that only shows up when the module order changes.
 *
 * ---------------------------------------------------------------------------------------
 * THE KEY IS `api_calls.session_id` AND IT CANNOT BE `actor_id`
 * ---------------------------------------------------------------------------------------
 *
 * `session_id` is an attachment's own record id, put there by the `x-mole-office-session` header.
 * `actor_id` is a free string and names no durable agent and no run — measured 27 August 2026, the
 * values in this corpus are the owner's own id, `claude-code`, `r10-wave-14`, and one that says in words that it is not the owner's id. A reading
 * keyed on it would answer about whatever the caller typed.
 *
 * **And it is nearly empty today**, measured the same day: 21 rows of 10,647 carry a session at
 * all. So this reader returns null for almost everything, and its callers have to say what they do
 * with a null rather than treating it as silence. The repair is the write side — an attached agent
 * sending the header — and not a signal of our own.
 */

import { desc, inArray } from 'drizzle-orm'

import { localStamp, parseStoredStamp } from '@shared/time.ts'
import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { apiCalls } from '../db/schema.ts'

/**
 * The newest request that named any of these attachments as its run, or null when none ever did.
 *
 * Null is *nobody has sent one*, which is different from *the run is quiet*, and a caller that
 * cannot tell those apart will call a run that never spoke to Mole Office a run that stopped speaking.
 */
export function newestRequestFor(attachmentIds: readonly string[]): string | null {
  if (attachmentIds.length === 0) return null
  // IN PIECES (src/server/db/in-pieces.ts): opening a run does not close the agent's other runs, so nothing caps how
  // many are open. Each piece gives its newest request, and the newest of those is the answer.
  let newest: number | null = null
  for (const row of readInPieces(attachmentIds, (piece) =>
    db
      .select({ atMs: apiCalls.atMs })
      .from(apiCalls)
      .where(inArray(apiCalls.sessionId, piece))
      .orderBy(desc(apiCalls.atMs))
      .limit(1)
      .all(),
  )) {
    if (newest === null || row.atMs > newest) newest = row.atMs
  }
  if (newest === null) return null
  return aRequestStamp(newest)
}

/**
 * `at_ms` is epoch milliseconds — the one departure from this database's local-wall-clock rule —
 * and the human stamp is made here by the one reader in shared/time.ts, so nothing stores a second
 * form of the same moment. Both readers of a newest request below make their stamp with this.
 */
function aRequestStamp(atMs: number): string {
  return localStamp(new Date(atMs))
}

/**
 * THE NEWEST REQUEST OF EACH OF MANY RUNS, READ IN ONE PASS. For a caller that asks
 * `newestRequestFor` about many agents at once, such as the roster in src/server/lib/working.ts.
 *
 * WHY IT EXISTS, MEASURED. `api_calls` had no index on `session_id` then, because every index is
 * bytes on every row of that table (see `api_calls` in src/server/db/schema.ts). So
 * `newestRequestFor` walked the table backwards by time until it met one of its runs, and for a run
 * that had sent nothing it walked the whole table. The roster asked it once per agent. On a copy of
 * the owner's office on 27 September 2026 (944,834 rows, 397 open runs serving agents) that was about
 * 3.5 seconds of every `GET /api/working`. One grouped pass over the table answered every run at once
 * in about 130 ms. Migration 0322 made the index `api_calls_session_at_idx`, by run and then time,
 * and both reads now search it by run (wave 13y round 120).
 *
 * `asked` is every run this read was asked about, so `newestRequestAmong` can refuse a run nobody
 * asked about instead of reading it as a run that never sent anything.
 */
export interface NewestRequestOfEachRun {
  asked: ReadonlySet<string>
  /** Epoch milliseconds of each run's newest request. A run that sent none has no entry. */
  newest: ReadonlyMap<string, number>
}

export function newestRequestOfEachRun(runIds: readonly string[]): NewestRequestOfEachRun {
  const asked = new Set(runIds)
  const newest = new Map<string, number>()
  if (asked.size === 0) return { asked, newest }
  // ONE STATEMENT, WITH THE RUNS BOUND AS ONE JSON LIST. Every open run of every agent is asked about, and nothing caps
  // how many are open, so the ids cannot be one bound value each (src/server/db/in-pieces.ts). They were asked in pieces
  // of 500, and with no index on `session_id` then each piece read the whole table. On the made-up office shaped to the
  // live counts of 31 October 2026 (7,053 open runs, 1,824,980 calls) that was 15 passes and 4.2 of the 5.8 seconds of
  // SQLite in `GET /api/working` (wave 13y round 114). With `api_calls_session_at_idx` the statement searches the index
  // once for each run: 823 ms before it and 90 ms after, for 7,053 runs and 2,526,769 calls (wave 13y round 120).
  // Asking each run for its own maximum changed three warm statement readings on the made-up office from 65.6,
  // 64.4 and 65.3 ms grouped to 193.0, 10.6 and 11.0 ms; the latter has the smaller median.
  const rows = sqlite.prepare(`
    SELECT wanted.value AS sessionId,
           (SELECT max(at_ms) FROM api_calls WHERE session_id = wanted.value) AS atMs
      FROM json_each(?) wanted
  `).all(JSON.stringify([...asked])) as { sessionId: string; atMs: number | null }[]
  for (const row of rows) {
    if (row.sessionId !== null && row.atMs !== null) newest.set(row.sessionId, row.atMs)
  }
  return { asked, newest }
}

/**
 * The same answer as `newestRequestFor(runIds)`, taken from a read made earlier by
 * `newestRequestOfEachRun`: the newest request among these runs, or null when none of them sent one.
 *
 * A run the earlier read was not asked about is refused. Reading it as "sent nothing" would draw a
 * working agent as quiet with nothing to say why.
 */
export function newestRequestAmong(runIds: readonly string[], read: NewestRequestOfEachRun): string | null {
  let newest: number | null = null
  for (const id of runIds) {
    if (!read.asked.has(id)) {
      throw new Error(
        `The newest request of run ${id} was not read: the earlier read of every run was not asked about it. ` +
          'Nothing has been guessed at.',
      )
    }
    const at = read.newest.get(id)
    if (at !== undefined && (newest === null || at > newest)) newest = at
  }
  return newest === null ? null : aRequestStamp(newest)
}

/**
 * How many whole minutes have passed since a stored stamp, or null when it cannot be read.
 *
 * **Null is never quietly treated as zero.** A stamp that cannot be read would then make a long
 * silence look like an arrival that just happened, which is the exact shape of a defect this
 * product has already paid for once — a reader that appended a `Z` and made a fifty-minute silence
 * read as *just now*.
 */
export function minutesSince(stamp: string, now: Date): number | null {
  const at = parseStoredStamp(stamp)
  if (at === null) return null
  return Math.floor((now.getTime() - at) / 60_000)
}
