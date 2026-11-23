// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS TOLD ABOUT A WRITE IS TOLD ONLY ONCE THE WRITE IS STORED. Wave 13n's round 39.
 *
 * `announce` (src/server/lib/events.ts) told the open pages about a write at the moment it was called,
 * which is in the middle of the write's transaction. A write refused after that point, or rolled back
 * for any other reason, had already been announced: a page drew a message that was never stored (wave
 * 13s's round 18 found it while building its check doors, report 6o9jgh_SM1C-).
 *
 * HOW. Every transaction in the server is opened by better-sqlite3's `transaction` on the one handle in
 * src/server/db/client.ts; drizzle's `db.transaction` opens its outermost one there too. `holdUntilStored`
 * wraps that method once, so each call of a transaction opens a frame. `whenStored` puts a step in the
 * innermost open frame, or runs it at once when no transaction is open.
 *
 * - When the outermost transaction commits, the steps run, in the order they were asked for.
 * - When a transaction throws, its frame is dropped with what it held. Its writes were rolled back, so
 *   nothing in it was stored. An inner transaction is a savepoint: when it throws and its caller goes
 *   on, the caller's own steps are kept and the inner one's are not, exactly as the rows are.
 * - When an inner transaction returns, its steps join its caller's frame, because nothing is stored
 *   until the outermost one commits.
 *
 * A transaction a program opens with a bare `BEGIN` is not seen. Two do (searched for BEGIN, COMMIT and SAVEPOINT in
 * src/server on 20 November 2026): the export's reading of one moment (src/server/lib/export.ts), which writes
 * nothing, and the write lock of a start (src/server/db/migrate.ts). A start with nothing pending runs the data steps
 * inside that lock and always rolls it back, so `whenStored` refuses while `THE_ROLLED_BACK_RUN` is open.
 */
import type Database from 'better-sqlite3'

/** The steps waiting on each open transaction, outermost first. Empty when none is open. */
const frames: (() => void)[][] = []

/**
 * Open while a start runs the data steps on the served file inside a transaction it always rolls back
 * (src/server/db/migrate.ts). That transaction is a bare `BEGIN IMMEDIATE`, so no frame sees it.
 */
export const THE_ROLLED_BACK_RUN = { open: false }

/** Run `step` once what is being written now is stored: at once outside a transaction, else at the outermost commit. */
export function whenStored(step: () => void): void {
  if (THE_ROLLED_BACK_RUN.open) {
    throw new Error(
      'A data step asked to tell something once its write is stored (whenStored), while the start ran the data steps ' +
        'on this file inside a transaction it always rolls back. Nothing written there is ever stored, so nothing may ' +
        'be told about it.',
    )
  }
  const open = frames[frames.length - 1]
  if (open === undefined) step()
  else open.push(step)
}

/** Make every transaction opened on this handle hold `whenStored` steps until its outermost commit. */
export function holdUntilStored(sqlite: Database.Database): void {
  const open = sqlite.transaction.bind(sqlite)
  sqlite.transaction = ((fn: Parameters<Database.Database['transaction']>[0]) => {
    const made = open(fn)
    const held = <V extends (...args: never[]) => unknown>(variant: V): V =>
      function (this: unknown, ...args: Parameters<V>) {
        frames.push([])
        let result: ReturnType<V>
        try {
          result = variant.apply(this, args) as ReturnType<V>
        } catch (error) {
          frames.pop()
          throw error
        }
        const mine = frames.pop() ?? []
        const caller = frames[frames.length - 1]
        if (caller !== undefined) caller.push(...mine)
        else for (const step of mine) step()
        return result
      } as V
    return Object.assign(held(made), {
      default: held(made.default),
      deferred: held(made.deferred),
      immediate: held(made.immediate),
      exclusive: held(made.exclusive),
    })
  }) as Database.Database['transaction']
}
