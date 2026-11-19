// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STATEMENT PREPARED ONCE PER DATABASE HANDLE AND KEPT, for a read that runs once for each row of a list.
 *
 * A drizzle query built at the moment it runs builds its text again and has SQLite prepare it again, every time. For
 * a read that runs once, that does not matter. For a read that runs once for each fork on the waiting list, it does:
 * on 13 October 2026, on the made copy of the office at scale, one reading of GET /api/waiting took about 350 ms, and
 * about 150 ms of it went on building and preparing about 3,200 statements. They came from nine queries in
 * lib/records.ts, lib/forks.ts, lib/waiting.ts and lib/revisions.ts, each run once for each fork or for each record
 * somebody asked about.
 *
 * WHAT A CALLER WRITES. The same drizzle query as before, with each value that changes between calls written as
 * `sql.placeholder('<name>')`, and `.prepare()` at the end. The value is then given to `.get({ name })` or
 * `.all({ name })`. A value that is the same on every call, such as a link type, stays written into the query.
 *
 * WHY BESIDE THE HANDLE. The statement is kept beside the handle it was prepared on, so a test that opens a fresh
 * database gets a fresh statement, and a statement is never used on a database it was not prepared on. SQLite
 * prepares a kept statement again by itself when the schema changes under it. `getRecord` in lib/records.ts and
 * `agentByHandle` in lib/participants.ts keep theirs the same way, each with its own map.
 *
 * ONLY `.get()` AND `.all()`. Each reads its rows to the end before it returns, so one kept statement can be used
 * again inside the loop over its own rows. An iterator would hold the statement open while the loop ran.
 */
import { sqlite } from './client.ts'

/** The statement `prepare` makes, prepared the first time it is asked for on this handle and kept after that. */
export function keptStatement<T extends object>(prepare: () => T): () => T {
  const kept = new WeakMap<object, T>()
  return () => {
    const held = kept.get(sqlite)
    if (held !== undefined) return held
    const made = prepare()
    kept.set(sqlite, made)
    return made
  }
}
