// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT AN INSTALLED OFFICE SAYS WHILE IT WAITS FOR "BACK UP AND UPDATE" (wave 13n, round 58).
 *
 * The start check found a database that is not up to date and that holds work, so bringing it up to date
 * would write to it. A checkout refuses to serve it and names the command (src/server/db/migrate.ts,
 * `prepareToServe`). An installed office has no command line to hand anybody, so its service waits in a
 * reduced mode instead (src/server/lib/the-update.ts) and its page offers the owner one press. Nothing is
 * written to the database before that press.
 *
 * GET /api/office/the-update answers `TheUpdateReading`; POST /api/office/the-update is the press.
 */

/** What the start check found, in the migrations' own words. */
export interface TheUpdateOffer {
  /** The database file, absolute. */
  file: string
  /** What it holds, as `describeHoldings` in src/server/db/migrate.ts says it. */
  holds: string
  /** One line for each thing a migration would write, in the migrations' own words. */
  wouldWrite: string[]
  /**
   * How the start check measured that: on a copy when a migration was pending, or on the database itself, inside a
   * transaction it rolled back, when none was. The check says it where it chooses the path; the page says what it did by it.
   */
  measuredOn: 'a copy' | 'this file'
  /** The folder the backup is written to. */
  backups: string
}

/** Where the press is, or how it ended. */
export type TheUpdateState =
  | { state: 'offered' }
  | { state: 'updating' }
  /** Up to date and checked; the office serves as usual in a moment. */
  | {
      state: 'done'
      backup: string
      holdsNow: string
      /**
       * The re-mint's own sentence when it refused to give the agents whose id is still a handle a new id. Every agent
       * kept its id and the update is done. Absent when the re-mint ran, or was not needed.
       */
      remintRefused?: string
    }
  | {
      state: 'failed'
      /** What happened, in sentences, never as a command. */
      said: string[]
      /** Where the backup taken before the update is, or null when none was made. */
      backup: string | null
      /** The database file as the failure left it. */
      file: 'unchanged' | 'restored' | 'not-restored'
    }

export interface TheUpdateReading {
  offer: TheUpdateOffer
  update: TheUpdateState
  /** Whether this request carries the owner's key, so whether it may press. */
  mayPress: boolean
}
