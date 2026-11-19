// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theCitedPlaceExists` was moved byte for byte out of src/server/lib/warrants.ts, with no change of behaviour.
 * `liveRecordOfKind` was moved byte for byte out of src/server/lib/warrants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { eq, and, isNull } from 'drizzle-orm'
import { db } from './client.ts'
import { agentMessages, records } from './schema.ts'

/**
 * DOES THIS INSTALLATION HOLD THE MESSAGE OR THE COMMENT A WARRANT CITES?
 *
 * Handed to `readWarrant`, which opens no database and names no table. It is asked only of a place
 * written `<word>:<id>`; `terminal` and `ui` name no row and there is nothing to look for.
 *
 * WHAT EACH WORD RESOLVES TO, AND WHY EACH IS TWO QUERIES AT MOST. A message is either a message
 * this product holds in a conversation — an `agent_messages` row — or a record filed as a `message`,
 * and both are things a person can open and read. A comment is an `annotation`: that is the kind
 * this product files a comment somebody wrote as. A deleted record is not held: a citation pointing
 * at something nobody can open leads nowhere, which is the whole fault this check exists to stop.
 */
export function theCitedPlaceExists(where: string): boolean {
  const colon = where.indexOf(':')
  if (colon <= 0) return false
  const word = where.slice(0, colon)
  const id = where.slice(colon + 1).trim()
  if (id === '') return false
  if (word === 'message') {
    const inAConversation = db.select({ id: agentMessages.id }).from(agentMessages).where(eq(agentMessages.id, id)).get()
    if (inAConversation !== undefined) return true
    return liveRecordOfKind(id, 'message')
  }
  if (word === 'comment') return liveRecordOfKind(id, 'annotation')
  return false
}
/** A record this installation still holds, of one kind. A deleted one is not held. */
export function liveRecordOfKind(id: string, kind: string): boolean {
  const row = db
    .select({ id: records.id })
    .from(records)
    .where(and(eq(records.id, id), eq(records.kind, kind), isNull(records.deletedAt)))
    .get()
  return row !== undefined
}
