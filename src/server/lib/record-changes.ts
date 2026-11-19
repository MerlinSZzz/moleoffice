// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TELL THE OPEN PAGES THAT A RECORD CHANGED, so a page showing it can read it again (wave 13y round 145,
 * item 87).
 *
 * The event names the record, its kind and its project, and carries nothing the record holds: a page
 * that shows the record reads it again through the door it read it from, and that door decides what the
 * reader may see. Two places call this, and between them they cover every stored change of a record:
 * `saveRevision`, which every write of a record calls once, and the two link doors, `createLink` and
 * `deleteLink`, for both ends of the link.
 *
 * A MESSAGE IS NEVER ANNOUNCED HERE. A message is the one record some readers may not see, and an event
 * that named one would tell every page in the project that it exists. Messages have events of their own,
 * which go only to their parties (src/server/lib/events.ts).
 *
 * `announce` sends the event once the outermost transaction is stored, and sends nothing for a write that
 * is only checked, so a refused write is never announced.
 */
import { announce } from './events.ts'

/** Say that this record was stored again (`revision`), or that a link to or from it changed (`link`). */
export function aRecordChanged(record: { id: string; kind: string; workspaceId: string }, what: 'revision' | 'link'): void {
  if (record.kind === 'message') return
  announce({ name: 'record.changed', workspaceId: record.workspaceId, recordId: record.id, kind: record.kind, what })
}
