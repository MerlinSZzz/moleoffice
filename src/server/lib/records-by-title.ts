// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `recordsByTitle` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import type { PanelRecord } from '@shared/types.ts'
import { toRecord } from './to-record.ts'

/**
 * EVERY record with this exact title in this project, oldest first. The root title lookup.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS RETURNS A LIST
 * ---------------------------------------------------------------------------------------
 *
 * Because a title names as many records as somebody chose to call by it. **ID is identity. Title
 * is presentation. Titles may repeat.** `records_title_idx` was UNIQUE(workspace_id, title) until
 * the migration `0030_titles_may_repeat`, which drops the uniqueness and keeps the index; the
 * schema comment in src/server/db/schema.ts says the same thing from the other side.
 *
 * The shape of the old lookup was the danger: one `WHERE` ending in `.get()`, which hands back
 * SQLite's first row with no count and no signal that there was a choice. Twenty places in the
 * product turn a title into a record and thirteen of them WRITE; every one of them was safe by
 * luck of an index rather than by its own logic.
 *
 * So the ambiguity is answered by the resolvers below, and every caller either gets one record or
 * gets a refusal naming every candidate. That work came FIRST and the index was dropped after,
 * because reversed it turns a dozen loud refusals into silent wrong writes.
 *
 * DELETED ROWS ARE INCLUDED, for the reasons `getRecordByTitle` in records/record-by-title.ts gives.
 * A caller asking which record a person MEANT wants `liveMatches` of this list — see the next function.
 *
 * THE ORDER IS THE ROW'S OWN, not SQLite's: oldest first, and the id breaks a tie. A refusal that
 * listed the same two records in a different order on two runs would read as two different facts.
 */
export function recordsByTitle(title: string, workspaceId: string): PanelRecord[] {
  return db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.title, title)))
    .orderBy(records.createdAt, records.id)
    .all()
    .map(toRecord)
}
