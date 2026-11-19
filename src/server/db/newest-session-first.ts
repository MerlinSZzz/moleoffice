// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `NEWEST_SESSION_FIRST` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { desc, sql } from 'drizzle-orm'
import { records } from './schema.ts'

/**
 * NEWEST SESSION RECORD FIRST, with the row id breaking a tie inside one second. It is the order
 * `runsWaitingForTheNextMessage` needs: the first run met in a conversation is the one still in it.
 * The presence roster reads its session rows in this order too, so it can read the waiting runs from
 * the rows it already has (`runsWaitingAmong`).
 */
export const NEWEST_SESSION_FIRST = [desc(records.createdAt), sql`rowid desc`] as const
