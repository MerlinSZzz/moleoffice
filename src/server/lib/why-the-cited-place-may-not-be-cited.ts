// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whyTheCitedPlaceMayNotBeCited` was moved byte for byte out of src/server/lib/warrants.ts, with no change of behaviour.
 * `whoWroteTheCitedPlace` was moved byte for byte out of src/server/lib/warrants.ts, with no change of behaviour.
 * `aCommentInAConversation` was moved byte for byte out of src/server/lib/warrants.ts, with no change of behaviour.
 * `recordWritten` was moved byte for byte out of src/server/lib/warrants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { parseLocalStamp } from '@shared/time.ts'
import { theKeyWindowSays } from '../db/the-key-window-says.ts'
import { PanelError } from './panel-error.ts'
import type { CitedPlaceWritten, ACommentInAConversation } from './warrants.ts'
import { eq, and, asc, isNull } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { agentMessages, records, revisions } from '../db/schema.ts'

/**
 * MAY A NEW WARRANT CITE THIS MESSAGE OR COMMENT? Null when it may; otherwise one sentence saying
 * what was missing. Keys wave piece 6, finding 82, decision jjfwwrrJy-qV answer D.
 *
 * Handed to `readWarrant`, which asks it only after `theCitedPlaceExists` said the place is held.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * While the key window is open, every held place may be cited, exactly as before this rule. Once
 * it is closed, a place written BEFORE the close may still be cited: it counts as the person's words under
 * the rules of that time, so every warrant already written stands (decision D). A place written at
 * or after the close may be cited only when the person wrote it and their key proved it. The proof is
 * the `proved_by` column migration 0178 added, and `the-person-key` is the word for the person's key and for
 * a device of theirs they confirmed.
 *
 * WHEN THE WINDOW CLOSED IS READ THROUGH `theKeyWindowSays` in ./keywindow.ts, the one reader of
 * that row, and nowhere else.
 *
 * WHAT IS READ FOR EACH PLACE. A message held in a conversation is an `agent_messages` row: its
 * `created_at`, its `role` and its `proved_by`. A queued message's words can be changed, and a
 * change writes `proved_by` again from whoever changed them, so the proof read here is the proof of
 * the words the row holds now. A message or a comment filed as a record is read by the record's
 * `created_at` and by the revision that created it. A later edit does not remove what the
 * person first wrote there, because that revision keeps their words.
 *
 * ONLY THE DOOR ASKS THIS. `checkWarrants` in ./import.ts judges warrants that were accepted when
 * they were written, and does not ask.
 */
export function whyTheCitedPlaceMayNotBeCited(where: string): string | null {
  const window = theKeyWindowSays()
  if (window.open) return null
  const closedAt = window.closedAt
  const closed = closedAt === null ? null : parseLocalStamp(closedAt)
  if (closedAt === null || closed === null) {
    // THE INSTALLATION ROW SAYS CLOSED AND GIVES NO MOMENT THAT CAN BE READ. `readTheKeyWindow`
    // never answers that way, so this is a broken assumption and it stops the write.
    throw new PanelError(
      `The key window is recorded as closed, and the moment it was closed (${JSON.stringify(closedAt)}) cannot be ` +
        `read. So Mole Office cannot tell whether the place this warrant cites was written before it. Nothing was ` +
        `written.`,
      500,
    )
  }
  const cited = whoWroteTheCitedPlace(where)
  if (cited === null) return 'Mole Office does not hold it.'
  const written = parseLocalStamp(cited.at)
  if (written === null) {
    throw new PanelError(
      `The place this warrant cites, ${where}, records the moment it was written as ${JSON.stringify(cited.at)}, ` +
        `which cannot be read. So Mole Office cannot tell whether it was written before the key window was ` +
        `closed. Nothing was written.`,
      500,
    )
  }
  // WRITTEN BEFORE THE CLOSE: the person's words under the rules of that time. Decision D.
  if (written < closed) return null
  // AT OR AFTER THE CLOSE. A stamp has whole seconds, so one written in the second of the close
  // cannot be told to be before it, and it is judged as after.
  if (cited.writer !== null && cited.writer.type === 'human' && cited.writer.provedBy === 'the-person-key') return null
  const when =
    written > closed
      ? `It was written at ${cited.at}, after the key window was closed at ${closedAt}.`
      : `It was written at ${cited.at}, in the same second the key window was closed, so Mole Office cannot tell ` +
        `that it came before the close.`
  if (cited.writer === null) return `${when} Mole Office holds no record of who wrote it.`
  if (cited.writer.type !== 'human') return `${when} The ${cited.writer.type} "${cited.writer.id}" wrote it, not the person.`
  return `${when} It was written under the person's name, and no key of theirs proved it.`
}
/**
 * WHEN AND BY WHOM THE CITED PLACE WAS WRITTEN, read from the same rows `theCitedPlaceExists`
 * accepts, in the same order. Null when none of them is held.
 */
export function whoWroteTheCitedPlace(where: string): CitedPlaceWritten | null {
  const colon = where.indexOf(':')
  if (colon <= 0) return null
  const word = where.slice(0, colon)
  const id = where.slice(colon + 1).trim()
  if (id === '') return null
  if (word === 'message') {
    const comment = aCommentInAConversation(id)
    if (comment !== null) return { at: comment.at, writer: comment.writer }
    return recordWritten(id, 'message')
  }
  if (word === 'comment') return recordWritten(id, 'annotation')
  return null
}
/**
 * A COMMENT IN A CONVERSATION THAT A WARRANT MAY CITE AS `message:<id>`: when it was written, who wrote it and how a
 * key proved them, and the words it holds now. Null when no conversation holds a comment with this id. The one reading
 * of that row for a warrant; `whichDecisionOfTheOwnersTheseWordsStandOn` below reads it too.
 */
export function aCommentInAConversation(id: string): ACommentInAConversation | null {
  const row = db
    .select({
      role: agentMessages.role,
      createdBy: agentMessages.createdBy,
      provedBy: agentMessages.provedBy,
      createdAt: agentMessages.createdAt,
      body: agentMessages.body,
    })
    .from(agentMessages)
    .where(eq(agentMessages.id, id))
    .get()
  if (row === undefined) return null
  // `created_by` is `<type>:<id>`, written by `addMessage`; the id is everything after the first colon.
  const at = row.createdBy.indexOf(':')
  return {
    at: row.createdAt,
    writer: { type: row.role, id: at < 0 ? row.createdBy : row.createdBy.slice(at + 1), provedBy: row.provedBy },
    words: row.body,
  }
}
/** A live record of one kind: when it was made, and who made it according to its create revision. */
export function recordWritten(id: string, kind: string): CitedPlaceWritten | null {
  const row = db
    .select({ createdAt: records.createdAt })
    .from(records)
    .where(and(eq(records.id, id), eq(records.kind, kind), isNull(records.deletedAt)))
    .get()
  if (row === undefined) return null
  const created = db
    .select({ actorType: revisions.actorType, actorId: revisions.actorId, provedBy: revisions.provedBy })
    .from(revisions)
    .where(and(eq(revisions.recordId, id), eq(revisions.op, 'create')))
    .orderBy(asc(revisions.seq))
    .get()
  return {
    at: row.createdAt,
    writer: created === undefined ? null : { type: created.actorType, id: created.actorId, provedBy: created.provedBy },
  }
}
