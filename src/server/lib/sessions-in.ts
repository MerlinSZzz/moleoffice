// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `sessionsIn` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `modelOfTheRun` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { resolveSessionRef } from './resolve-session-ref.ts'
import type { SessionInRows } from './records.ts'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'

/**
 * Which sessions a set of change rows names, so a page can say it in words.
 *
 * This is the answer to "which session did this" for any record: ask for that record's changes
 * and read this. Rows with no session at all are simply absent -- a write by a person typing is
 * not an unresolved session, it is no session.
 *
 * A row whose session sits in another project is not dropped and is not blanked. Moving a record
 * carries its history and leaves the session that wrote it where it is (lib/move.ts), so this is an
 * ordinary state rather than damage, and it is reported as itself.
 */
export function sessionsIn(
  rows: readonly { sessionId: string | null }[],
  workspaceId: string,
): SessionInRows[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (row.sessionId === null || row.sessionId === '') continue
    counts.set(row.sessionId, (counts.get(row.sessionId) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([stored, count]): SessionInRows => {
      const ref = resolveSessionRef(stored, workspaceId)
      return {
        stored,
        recordId: ref.recordId,
        title: ref.title,
        matchedBy: ref.matchedBy,
        rows: count,
        unresolved: ref.recordId === null,
        elsewhereIn: ref.elsewhereIn,
        model: ref.recordId === null ? null : modelOfTheRun(ref.recordId),
      }
    })
    .sort((a, b) => b.rows - a.rows || a.stored.localeCompare(b.stored))
}
/** The model a session record says its run was started on, or null when it says none. */
export function modelOfTheRun(recordId: string): string | null {
  const row = db.select({ data: records.data }).from(records).where(eq(records.id, recordId)).get()
  const model = row?.data['model']
  return typeof model === 'string' && model.trim() !== '' ? model : null
}
