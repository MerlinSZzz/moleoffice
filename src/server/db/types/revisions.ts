// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/revisions.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

import type { ActorType } from '@shared/types.ts'

/** The first and the newest revision of one record, as `theEndsOfTheLedger` reads them. */
export interface TheEndsOfTheLedger {
  /** Who wrote the first revision, as a `"<type>:<id>"` stamp. The same answer `whoWroteRecords` gives. */
  writer: string
  /** The session record of the run that wrote the first revision, or null where that write named no run. */
  writtenIn: string | null
  /** The newest revision's number. A new number means the record changed. */
  newestSeq: number
  /** When the newest revision was written, LOCAL wall clock, as it is stored. */
  newestAt: string
}

/** Who put a value on a record's field, and when. `null` means the ledger cannot say. */
export interface WhoWroteTheValue {
  actorType: ActorType
  actorId: string
  /** When that revision was written, LOCAL wall clock, as it is stored. */
  at: string
  /** Which revision it was. Useful in a refusal, so a reader can go and look at it. */
  seq: number
  /**
   * WAS THAT WRITE MADE ON THE OWNER'S OWN QUOTED WORDS? True when the revision carries a warrant.
   *
   * IT IS ON THE SAME ROW AND IT IS READ WITH THE REST OF IT, rather than looked up again by a
   * caller that has the answer in its hand. `anAgentGaveThisForkItsClassification` needs it: an
   * agent that wrote `who_settles_it` out of its own head wrote its own permission, and an agent
   * that wrote it because the person said so did not — and the two are the same row apart from
   * this column.
   */
  onTheOwnersWords: boolean
}

/** Who put a value on one of a record's own columns, when, and in which run. */
export interface WhoWroteTheColumn {
  actorType: ActorType
  actorId: string
  /** The session record of the run that wrote it, or null where the write named no run. */
  sessionId: string | null
  /** When that revision was written, LOCAL wall clock, as it is stored. */
  at: string
  /** Which revision it was. */
  seq: number
}
