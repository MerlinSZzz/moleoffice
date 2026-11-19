// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * ONE SMALL ROW PER CALLER PER DAY THAT CARRIED A CLAIM AND NO KEY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SUMMARY TABLE AND NOT A QUERY OVER `api_calls`
 * ---------------------------------------------------------------------------------------
 *
 * The Settings list answers "who has called with a header claim and no key". `api_calls` holds a row
 * per request and has no index on `actor_id`. Grouping a large request log for this page would be
 * slow. Each such call folds into one row here, keyed by day and caller, with a count and the first
 * and last time it was seen.
 *
 * IT IS MEASURED, NOT AUTHORED: no backup carries it, and no scan rebuilds it. The empty string is
 * stored for an address or an origin the server could not establish, rather than NULL, because
 * SQLite treats NULLs as distinct in a unique index and the upsert would make a second row for every
 * request with no address.
 */
export const headerOnlyCalls = aPartTable(sqliteTable(
  'header_only_calls',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** The local wall-clock day, `YYYY-MM-DD`, so the list folds by the day the person lived. */
    day: text('day').notNull(),
    /** What the caller said it was: `human`, `agent` or `system`. */
    actorType: text('actor_type').notNull(),
    /** The name the caller gave. Empty string when it named nobody but still sent a header. */
    actorId: text('actor_id').notNull(),
    /** The address the request came from, or the empty string because none could be read. */
    clientAddr: text('client_addr').notNull(),
    /** `local` or `remote`, or the empty string because the request came through no listener. */
    clientOrigin: text('client_origin').notNull(),
    /** Epoch milliseconds, the first time this caller was seen on this day. */
    firstSeen: integer('first_seen').notNull(),
    /** Epoch milliseconds, the last time. */
    lastSeen: integer('last_seen').notNull(),
    /** How many header-only calls this caller made that day. */
    calls: integer('calls').notNull().default(0),
  },
  (t) => [
    uniqueIndex('header_only_calls_caller_idx').on(t.day, t.actorType, t.actorId, t.clientAddr, t.clientOrigin),
    index('header_only_calls_day_idx').on(t.day),
  ],
), { existingMeasured: true })
