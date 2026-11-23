// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/warrants.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

import type { Warrant } from '@shared/warrant.ts'

/** One act an agent made on the person's own words, as every surface reads it. */
export interface ActOnTheirWords {
  /**
   * The record the write was made on.
   *
   * NOT ALWAYS THE RECORD BEING READ. A fork settled on the person's words carries the act on the DECISION
   * that settled it, because that is the record the write was to. See the file header.
   */
  recordId: string
  /** Which revision of that record this act is. Together with `recordId` it names the act. */
  seq: number
  /** create, update, delete or restore — what kind of write it was. */
  op: string
  actorType: string
  actorId: string
  sessionId: string | null
  /** When the act was made, local wall clock. */
  at: string
  /** The person's words, and where and when the person said them. Kept exactly as the request sent them. */
  warrant: Warrant
  /** Who acted and where the words were said, in one sentence. Built in @shared/warrant.ts. */
  said: string
  /** What the write did, in the fewest words that are still true. */
  what: string
  /** Null while the act stands. Otherwise who took it back and when. */
  revoked: { at: string; actorType: string; actorId: string; said: string } | null
}
