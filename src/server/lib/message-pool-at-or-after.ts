// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `messagePoolAtOrAfter` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `TALK_COLUMNS` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `talkEntriesOf` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `refFrom` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `deliveriesOfMany` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `aDeliveryOnTheWire` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `theRecipientsOf` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `itIsNotSentYet` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `nobodyHasBeenHandedIt` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `sentWhenWritten` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { and, desc, gte, sql, inArray } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records, messageDelivery } from '../db/schema.ts'
import { theViewFromAMoment, theViewsHoldingIt } from './message-centre.ts'
import { readOrigin } from '@shared/types.ts'
import { onlyTheirs } from './newest-withdrawn-message-pool-first.ts'
import type { TheirOwnMessages, ATalkEntryInViews, ATalkEntry, TalkRow, DeliveryRow, MessageRow } from './messages.ts'
import { targetOfRecord, oneParticipantRef, type DeliveryOnTheWire, isDeliveryMark, aMarkSaysItWasRead } from '@shared/messages.ts'
import { commentsGoneOut } from './dispatch.ts'
import { EVERY_PROJECT } from '@shared/which-projects.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { theRecipientOf } from '../db/their-own-messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'

/**
 * The authored pool at or after a talk place's moment (round 63 of wave 13y). The stored moment is created_at,
 * written by nowStamp as local whole seconds. SQL keeps the entire boundary moment: ids are compared by JavaScript's
 * localeCompare in pixel-office.ts, whose order differs from SQLite's. These rows are read as the talk reads a message
 * (`talkEntriesOf`).
 * SQLite finds them from the moment through the index of every message's moment (round 66, `theViewFromAMoment`), so
 * it visits no older message.
 *
 * EVERY PROJECT OF THE LIST IN ONE STATEMENT (round 78). Each message comes once, with the projects whose views hold it
 * (`theViewsHoldingIt`), so a message in two projects' views is the talk's twice, as it was when each project was read
 * by a statement of its own.
 *
 * WITH `theirs`, ONLY THE MESSAGES THAT PARTICIPANT SENT OR WAS HANDED, as in `theTalksPool` (round 76).
 */
export function messagePoolAtOrAfter(projects: readonly string[], at: string, theirs?: TheirOwnMessages): ATalkEntryInViews[] {
  const rows = db.select({ ...TALK_COLUMNS, views: theViewsHoldingIt(projects) }).from(records)
    .where(theViewFromAMoment(projects, and(gte(records.createdAt, at), onlyTheirs(theirs))))
    .orderBy(desc(records.createdAt)).all()
    .filter(row => readOrigin(row.origin) === 'authored')
  const entries = talkEntriesOf(rows)
  return rows.map((row, n) => ({
    entry: entries[n]!,
    projects: (JSON.parse(row.views) as number[]).sort((a, b) => a - b).map((place) => projects[place]!),
  }))
}
/**
 * THE COLUMNS THE TALK READS OFF A MESSAGE ROW. The sender and the target are read out of the stored data by SQLite, as
 * JSON text, so no row hands back a message's words. A stored object with one key twice is the one shape SQLite and
 * JSON.parse could read apart (SQLite keeps the first, JSON.parse the last). JSON.stringify never writes one, and the
 * talk's narrowing has read the sender with SQLite since round 75.
 */
export const TALK_COLUMNS = {
  id: records.id,
  kind: records.kind,
  createdAt: records.createdAt,
  origin: records.origin,
  sentBy: sql<string | null>`${records}.data -> '$.sentBy'`,
  target: sql<string | null>`${records}.data -> '$.target'`,
  // WHOM ITS WRITER ADDRESSED, which says whether a comment was sent as it was written (`sentWhenWritten`).
  to: sql<string | null>`${records}.data -> '$.to'`,
  chosenRecipient: sql<string | null>`${records}.data -> '$.chosenRecipient'`,
  toGroup: sql<string | null>`${records}.data -> '$.toGroup'`,
} as const
/**
 * THE TALK'S ENTRIES OF THESE ROWS, in their order. Each field is worked out by what builds a whole entry: the sender by
 * `refFrom`, the recipients by `theRecipientsOf` and whether a comment is unsent by `itIsNotSentYet`, so the talk and the
 * board cannot come to read one message two ways. Only the comments among the rows are asked whether they went out.
 */
export function talkEntriesOf(rows: readonly TalkRow[]): ATalkEntry[] {
  const read = rows.map((row) => {
    // EVERY READ OF THE TALK ASKS FOR MESSAGES, so a row of another kind says that a read changed under it.
    if (row.kind !== 'message') throw new Error(`The talk reads messages only, and record ${row.id} is not a message.`)
    // SQL NULL IS A KEY THE DATA DOES NOT HOLD; a key holding null is the JSON text null.
    const data = {
      sentBy: row.sentBy === null ? undefined : (JSON.parse(row.sentBy) as unknown),
      target: row.target === null ? undefined : (JSON.parse(row.target) as unknown),
      to: row.to === null ? undefined : (JSON.parse(row.to) as unknown),
      chosenRecipient: row.chosenRecipient === null ? undefined : (JSON.parse(row.chosenRecipient) as unknown),
      toGroup: row.toGroup === null ? undefined : (JSON.parse(row.toGroup) as unknown),
    }
    return { row, data }
  })
  const deliveries = deliveriesOfMany(rows.map((row) => row.id))
  const comments = read.filter(({ row, data }) => targetOfRecord({ kind: row.kind, data }) !== null).map(({ row }) => row.id)
  const goneOut = new Set(commentsGoneOut(EVERY_PROJECT, comments))
  return read.map(({ row, data }) => {
    const handed = deliveries.get(row.id) ?? []
    return { id: row.id, sentAt: row.createdAt, sentBy: refFrom(data.sentBy), to: theRecipientsOf(handed), notSentYet: itIsNotSentYet(row, data, handed, goneOut) }
  })
}
/**
 * A PARTICIPANT REFERENCE OFF STORED JSON, AND EVERY ONE IN A STORED `to` LIST. Both live in
 * @shared/messages.ts, which opens no database, so the messages migration reads a stored `to` with
 * the same two functions this door does. They are exported again here under the names every caller
 * already uses. Nothing is guessed at: an entry that is not a reference is left out, and
 * `whyTheAddressingIsRefused` is what refuses one before it is ever stored.
 */
export const refFrom = oneParticipantRef
/**
 * The delivery rows of several messages at once, keyed by message id.
 *
 * READ IN PIECES (src/server/db/in-pieces.ts), because a pool read names every message of the office and one
 * statement cannot bind that many. Every row of one message is in the piece that names it, so each
 * message's list is still in the order of its moment and id. Only the order of the map's keys differs
 * from one read, and every caller looks a message up by its id.
 */
export function deliveriesOfMany(messageIds: readonly string[]): Map<string, DeliveryOnTheWire[]> {
  const out = new Map<string, DeliveryOnTheWire[]>()
  const rows = readInPieces(messageIds, (piece) =>
    db
      .select()
      .from(messageDelivery)
      .where(inArray(messageDelivery.messageId, piece))
      .orderBy(messageDelivery.at, messageDelivery.id)
      .all(),
  )
  for (const row of rows) {
    const list = out.get(row.messageId) ?? []
    list.push(aDeliveryOnTheWire(row))
    out.set(row.messageId, list)
  }
  return out
}
/** ONE DELIVERY ROW AS EVERY POOL HANDS IT OUT. A mark the office does not know is read as `queued`. */
export function aDeliveryOnTheWire(row: DeliveryRow): DeliveryOnTheWire {
  return {
    to: theRecipientOf(row),
    mark: isDeliveryMark(row.mark) ? row.mark : 'queued',
    at: row.at,
    because: row.because,
    run: row.run,
  }
}
/** WHO A MESSAGE IS TO, off its delivery rows: the whole entry's `to` and the talk's (`talkEntriesOf`) alike. */
export function theRecipientsOf(deliveries: readonly DeliveryOnTheWire[]): ParticipantRef[] {
  return deliveries.map((one) => one.to)
}
/**
 * WHETHER A MESSAGE IS A COMMENT NOBODY HAS SENT YET, criterion M28: the whole entry's `notSentYet` and the talk's
 * (`talkEntriesOf`) alike. Writing a message is sending it, so only a comment can be unsent. A comment its writer sent
 * as it was written (`sentWhenWritten`) is sent while its delivery still waits for its reader. Until 7 November 2026 it
 * was *Not sent yet* until then, and the chat's press for the comments not sent offered to send it again.
 */
export function itIsNotSentYet(row: Pick<MessageRow, 'id' | 'kind'>, data: Record<string, unknown>, deliveries: readonly DeliveryOnTheWire[], goneOut: ReadonlySet<string>): boolean {
  return targetOfRecord({ kind: row.kind, data }) !== null && !sentWhenWritten(row.kind, data) && nobodyHasBeenHandedIt(row.id, deliveries, goneOut)
}
/**
 * HAS ANYBODY BEEN HANDED THIS COMMENT'S WORDS YET? Two ways they can have been, and both count.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 5 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * This asked only whether a REVIEW had carried the comment out, which is `commentsGoneOut` in
 * lib/dispatch.ts. A comment written straight to `POST /api/records` with a recipient gets a
 * delivery row from the door and the worker starts a run for it, and neither of those touches the
 * review's marker. So comment `wOMI_XCnbEcu` was delivered at 03:45:49, answered by run
 * `l8pezZ7Imv_j` two blocks below it in the same conversation, and still drawn *Not sent yet* with
 * *Send them* offering to send it again. The screen said the opposite of what happened. Problem
 * `pGNsLwJFMUC1`, and it is the shape of the complaint that produced criterion M28.
 *
 * ---------------------------------------------------------------------------------------
 * QUEUED IS NOT HANDED OVER, AND THAT IS THE WHOLE DISTINCTION
 * ---------------------------------------------------------------------------------------
 *
 * `queued` means the message is written down and nothing serving the recipient has read it. That is
 * a comment nobody has been given, so it stays *Not sent yet* — which is exactly the state
 * criterion M28 asks to be shown while a review collects. A row marked `delivered` or `seen` means
 * something serving that recipient read the words, and after that saying they never went is a lie.
 * A row marked `archived` means nobody read them, so it counts as not handed over, like `queued`.
 */
export function nobodyHasBeenHandedIt(
  messageId: string,
  deliveries: readonly DeliveryOnTheWire[],
  goneOut: ReadonlySet<string>,
): boolean {
  if (goneOut.has(messageId)) return false
  // A ROW MARKED ARCHIVED WAS HANDED TO NOBODY, so only a mark that says somebody read it counts.
  return !deliveries.some((one) => aMarkSaysItWasRead(one.mark))
}
/**
 * WHETHER A MESSAGE WAS SENT WHEN IT WAS WRITTEN: its writer addressed it outright, or wrote it to a group.
 *
 * The comment box writes a comment two ways (src/web/api.ts). Start review and Add to review write a message with a
 * target and no `to`. Send writes the same message with `to` naming the contact. A recipient chosen later is stored in
 * `chosenRecipient`, and the record door then writes the `to` it works out from that choice beside it
 * (`whoAMessageIsTo`). So a `to` with no `chosenRecipient` beside it is a comment its writer addressed outright, and
 * that is sending it. A group message is sent the same way. Such a comment is in no review (`membersOf` in
 * lib/reviews.ts), and it is sent before anybody has read it: it is never *Not sent yet* (`itIsNotSentYet`).
 */
export function sentWhenWritten(kind: string, data: Record<string, unknown>): boolean {
  if (kind !== 'message') return false
  if (typeof data['toGroup'] === 'string' && data['toGroup'] !== '') return true
  const to = data['to']
  const chosen = data['chosenRecipient']
  return Array.isArray(to) && to.length > 0 && (chosen === undefined || chosen === null)
}
