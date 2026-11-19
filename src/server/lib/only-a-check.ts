// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ASKING WHETHER A WRITE WOULD BE ACCEPTED, BY DOING IT AND TAKING IT BACK. Problem jQayki_gIciU.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE CHECK RUNS THE WRITE ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * A writer learnt the office's rules by being refused: a block too long, a part heading equal to a
 * block heading, a word the count guard reads. A check that copied those rules would drift from them
 * the first time somebody changed one, and would then say "accepted" to a body the write refuses. So
 * there is no copy. The check door calls the write door's own code, inside one SQLite transaction, and
 * throws at the end so SQLite takes every row back: the record, its revision, its change rows, a
 * message's delivery rows, a run's key. A refusal thrown on the way is the write's own refusal, with
 * its status and its code.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A ROLLBACK DOES NOT TAKE BACK, AND WHAT IS DONE ABOUT IT
 * ---------------------------------------------------------------------------------------
 *
 * Three things a write does happen outside the database, and all three are about a message:
 * `announce` tells the open pages (src/server/lib/events.ts), `tellTheWaitersFor` wakes an agent's
 * held wait (src/server/lib/waiting-hold.ts), and a letter from the office or a run logs where it went
 * (`createRecordWithReport` in src/server/lib/records.ts). Each asks `onlyChecking` and does nothing
 * while a check runs. Surveyed on 5 October 2026; nothing on these paths writes a file, opens a second
 * connection or schedules later work. One cache, the session names in lib/records.ts, may keep an
 * entry for a run the check filed, and it re-reads the row and drops a stale entry by itself.
 *
 * THE FLAG IS SAFE ONLY BECAUSE THE WRITE IS SYNCHRONOUS. better-sqlite3 refuses a transaction whose
 * function returns a promise, so no other request runs while the flag is up. That refusal comes after the
 * function returns, and a check never returns from it: it throws to roll back. So a check asks the same
 * question itself, before it throws, and refuses a promise as plainly as a write is refused.
 */
import { sqlite } from '../db/client.ts'
import { onlyChecking, whileChecking } from './only-checking.ts'

/** Thrown at the end of a checked write so SQLite rolls it back; it carries what the write returned. */
class TheCheckIsTakenBack<T> extends Error {
  constructor(readonly made: T) {
    super('A check of a write is taken back here. This should never reach a caller.')
  }
}

/** What a check says when the write it checks returned a promise. Nothing it did is kept. */
export const A_WRITE_RETURNED_A_PROMISE =
  'A checked write returned a promise. A write must finish inside its transaction, so it cannot be checked and taken back. Nothing was written.'

/** Whether `made` is a promise, by the test better-sqlite3 uses for the same refusal. */
function isAPromise(made: unknown): boolean {
  return Boolean(made) && typeof (made as { then?: unknown }).then === 'function'
}

/**
 * Run `write` in one transaction. For a write it is stored. For a check it is run the same way and
 * then rolled back, and what it returned comes back with nothing stored. A refusal is thrown as it is.
 */
export function writeOrCheck<T>(only: 'write' | 'check', write: () => T): T {
  if (only === 'write') return sqlite.transaction(write)()
  if (onlyChecking()) throw new Error('A check of a write was started inside another check.')
  try {
    whileChecking(() =>
      sqlite.transaction(() => {
        const made = write()
        if (isAPromise(made)) throw new TypeError(A_WRITE_RETURNED_A_PROMISE)
        throw new TheCheckIsTakenBack(made)
      })(),
    )
  } catch (taken) {
    if (taken instanceof TheCheckIsTakenBack) return taken.made as T
    throw taken
  }
  throw new Error('A checked write was neither taken back nor refused.')
}

/** What a check door answers when the write would be accepted. A refusal is the write's own and is not this. */
export interface WouldBeAccepted {
  wouldBeAccepted: true
  wroteNothing: true
  /** The status the write door would answer the same body with: 201 or 409 for a record, 200 for short forms. */
  wouldAnswerStatus: number
  note: string
}

/**
 * ANSWER A CHECK, 200, NAMING THE WRITE'S OWN STATUS. No id is given back: the id the write made was
 * taken back with it, and a write sent later is given a different one.
 */
export function wouldBeAccepted<Extra extends object>(
  reply: { status: (code: number) => unknown },
  door: string,
  wouldAnswerStatus: number,
  extra: Extra,
): WouldBeAccepted & Extra {
  reply.status(200)
  return {
    wouldBeAccepted: true,
    wroteNothing: true,
    wouldAnswerStatus,
    note:
      `${door} would accept this body now and answer ${wouldAnswerStatus}. Nothing was written: the write's own ` +
      'checks ran and everything they made was taken back. Send the same body to that door to write it.',
    ...extra,
  }
}
