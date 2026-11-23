// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theirOwnMessages` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `theMessagesOf` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `theStoredKindsReadAs` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `theRecipientOf` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sql, and, eq, inArray, type SQL } from 'drizzle-orm'
import { db } from './client.ts'
import type { ParticipantRef, ParticipantKind } from '@shared/participants.ts'
import type { TheirOwnMessages } from './types/messages.ts'
import { ONE_KIND_WRITTEN_OUT, STORED_FIELDS, messageDelivery, records } from './schema.ts'

export function theirOwnMessages(who: ParticipantRef): TheirOwnMessages {
  const rows = db.all<{ rowid: number }>(sql`SELECT rowid FROM (${theMessagesOf(who)})`)
  return { rowids: JSON.stringify(rows.map((one) => one.rowid)) }
}
/**
 * The rowids of every message whose stored sender has this participant's id, whatever kind it says, and of every record
 * handed to them. The sender's index is named, because SQLite did not pick it (round 65 of wave 13y found the same), and a cross
 * join tells SQLite to start from the delivery rows, through the recipient index.
 */
export function theMessagesOf(who: ParticipantRef): SQL {
  const sent = sql`SELECT ${records}.rowid FROM ${records} INDEXED BY records_message_sent_by_idx WHERE ${and(ONE_KIND_WRITTEN_OUT.message, eq(STORED_FIELDS.messageSentById(records.data), who.id))}`
  const handedToThem = and(inArray(messageDelivery.recipientKind, theStoredKindsReadAs(who.kind)), eq(messageDelivery.recipientId, who.id), eq(records.id, messageDelivery.messageId))
  const handed = sql`SELECT ${records}.rowid FROM ${messageDelivery} CROSS JOIN ${records} WHERE ${handedToThem}`
  return sql`${sent} UNION ${handed}`
}
/**
 * EVERY STORED RECIPIENT KIND THAT `theRecipientOf` READS AS THIS KIND OF PARTICIPANT. SQLite steps through the
 * recipient index from one stored kind to the next, so it reads one index entry for each kind and not every delivery.
 */
export function theStoredKindsReadAs(kind: ParticipantKind): string[] {
  const stored = db.all<{ kind: string }>(
    sql`WITH RECURSIVE k(kind) AS (SELECT min(recipient_kind) FROM message_delivery UNION ALL SELECT (SELECT min(recipient_kind) FROM message_delivery WHERE recipient_kind > k.kind) FROM k WHERE k.kind IS NOT NULL) SELECT kind FROM k WHERE kind IS NOT NULL`,
  )
  return stored.map((one) => one.kind).filter((one) => theRecipientOf({ recipientKind: one, recipientId: '' }).kind === kind)
}
/** WHO A DELIVERY ROW IS TO, as every pool reads it: a row of any stored kind but `person` is read as an agent's. */
export function theRecipientOf(row: { recipientKind: string; recipientId: string }): ParticipantRef {
  return { kind: row.recipientKind === 'person' ? 'person' : 'agent', id: row.recipientId }
}
