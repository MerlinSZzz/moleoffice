// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE REMINDER WHEN A PERSON'S MESSAGE TO AN AGENT HAS HAD NO REPLY.
 *
 * Wave 13y round 11, messages zFcMF9J8smC5 and KIixAOdCDGfh. A person's message to an agent is handed to the
 * agent's live session, by the waiter or a delivered message read. Even after the agent marks it read, the person still waits
 * for a reply: when the agent has written nothing to that person in that conversation within
 * MOLE_OFFICE_REPLY_REMINDER_MINUTES of the delivery, Mole Office wakes the agent once more for that message.
 *
 * WHAT COUNTS:
 *
 * - THE DELIVERY is a row marked delivered with no run. The took door and the agent's delivered read write different
 *   sentences, both recognised in @shared/handles.ts. When either is later marked seen, its sentence and delivery time
 *   stay. Those seen rows still count as deliveries. A seen mark alone is a known gap: it carries no evidence of an
 *   earlier delivery and gets no reminder. Rows naming a run stay out, including hook reads inside office-started runs.
 * - ONLY A PERSON'S MESSAGE. A message from an agent, Mole Office's own lines among them, gets no reminder.
 * - A REPLY is any message from that agent, written at or after the delivery, that has a delivery row for that person,
 *   in the same conversation: the same group when the message went to a group, otherwise a message to no group. A reply
 *   in another conversation does not count, and the reminder that follows it is harmless.
 * - ONCE FOR EACH MESSAGE AND AGENT. What was already said is read from the office's own lines, by their fixed words and
 *   the message each is about, so no flag is stored that could disagree with them.
 *
 * NOTHING SWEEPS, for the reason ./reminders.ts gives. Current deliveries count from watcher start. One bounded catch-up
 * also covers the reminder minutes plus one tick before the old server's stop. ./reminders.ts captures that stop once
 * at start from the newest indexed call-log row before start, or the newest delivery row if the log has none. The
 * window is kept across ticks so a delivery not yet due can become due. Already-said lines are read back to its start,
 * so a delivery reminded before the stop is never reminded again. Older deliveries outside that window stay out.
 *
 * THE LINE WAKES ITS READER: its row in ./notices.ts says so, because a person's message needs its
 * reader.
 *
 * WHAT A PASS READS. Every delivery in the window is asked about again each minute, because a reply or a reminder can
 * be deleted. So each question about one delivery reads a few rows by an index, and none reads every message:
 * - whether it was already said, by the index on the message a line is about;
 * - whether the agent has replied, by the index on a message's sender, once. The reply found is kept, and each later
 *   pass asks only whether that one message still counts. A reply that no longer counts sends the search again.
 * Before wave 13q each of those questions read every message of the office, or every one written since the start.
 * On an office of the live shape the reply search alone took about 20 ms for each delivery in the window, every minute,
 * and the window grows for as long as the server runs: 961 ms of a minute after two hours.
 *
 * A MESSAGE WHOSE DATA IS NOT VALID JSON cannot say who sent it, who it was to or what it is about, and it is in neither
 * index. Counted as no reply, it could send a false reminder. So the pass sends no reminder for such a message, and none
 * for a delivery whose answer it could change. One that reached the person at or after the delivery could be the reply.
 * One that reached the agent could be the reminder already said. Who a message reached is read from its delivery rows,
 * which were written when its data could still be read. The pass gives such messages to its caller, which logs them.
 * Before wave 13q such a message stopped the whole pass with an error.
 */

import { SYSTEM_LINES } from '@shared/groups.ts'
import { isAHandOverSentence, isAMessageReadSentence } from '@shared/handles.ts'
import { moleOffice } from '@shared/participants.ts'
import { localStamp, parseAnyStamp } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { replyReminderMinutes } from './env.ts'
import { writeASystemLineToOne } from './groups.ts'
import { readParticipant } from '../db/read-participant.ts'
import type { Actor } from './records.ts'
import { whoSentItInWords } from './who-sent-it.ts'

/** The kind the reminder carries, as stored in the line's `data.notice`. */
const THE_NOTICE = 'aPersonWaitsForAReply'

/** The bounded deliveries before a restart, captured once by the watcher. */
export interface ReplyReminderCatchUp {
  since: Date
  until: Date
}

/** One person's message delivered to one agent's live session in the watcher's window. */
interface ADelivery {
  messageId: string
  agentId: string
  at: string
  sentAt: string
  sentBy: string
  person: string
  toGroup: string | null
  mark: string
  because: string | null
}

/**
 * Every delivery of a person's message to an agent's live session in the current or catch-up window.
 *
 * THE `+` SIGNS MAKE SQLITE START FROM THE DELIVERIES SINCE THEN, by `message_delivery_at_idx`. It started from every
 * delivery to an agent, about 9 ms of every minute on a copy at the live counts (wave 13y round 17).
 */
function theDeliveriesSince(since: string, watchingSince: string, stoppedAt: string): ADelivery[] {
  return sqlite
    .prepare(
      'SELECT d.message_id AS messageId, d.recipient_id AS agentId, d.at AS at, d.mark AS mark, d.because AS because, r.created_at AS sentAt, ' +
        "json_extract(r.data, '$.sentBy') AS sentBy, json_extract(r.data, '$.sentBy.id') AS person, " +
        "NULLIF(json_extract(r.data, '$.toGroup'), '') AS toGroup " +
        'FROM message_delivery d JOIN records r ON r.id = d.message_id ' +
        "WHERE +d.recipient_kind = 'agent' AND d.mark IN ('delivered', 'seen') AND d.run IS NULL AND d.at >= ? " +
        'AND (d.at >= ? OR d.at <= ?) ' +
        "AND +r.kind = 'message' AND r.deleted_at IS NULL AND CASE WHEN json_valid(r.data) THEN json_extract(r.data, '$.sentBy.kind') = 'person' END",
    )
    .all(since, watchingSince, stoppedAt) as ADelivery[]
}

/** A message whose data is not valid JSON, and one participant its delivery rows name. */
interface AnUnreadableMessage {
  id: string
  createdAt: string
  kind: string
  recipient: string
}

/** A local stamp, a message id and an agent id, as a statement takes them. */
type AStatement = { get: (params: Record<string, string>) => unknown; all: (params: Record<string, string>) => unknown[] }

/** The statements a pass asks with, prepared once for each database handle. */
interface TheStatements {
  said: AStatement
  /** The reply search and the re-check of a reply found, with the group or without one. */
  search: { inAGroup: AStatement; alone: AStatement }
  stillCounts: { inAGroup: AStatement; alone: AStatement }
  /** The messages written since the window began whose data is not valid JSON, once for each delivery row. */
  unreadable: AStatement
}

const STATEMENTS = new WeakMap<object, TheStatements>()

/** The reply found for each delivery, kept for each database handle as the statements are. */
const REPLIES_FOUND = new WeakMap<object, Map<string, string>>()

/** Everything a reply must be once its row is found: from the agent, to the person, at or after the delivery, in the conversation. */
function aReplyIs(inAGroup: boolean): string {
  return (
    "r.kind = 'message' AND r.deleted_at IS NULL AND r.created_at >= @at " +
    "AND json_extract(r.data, '$.sentBy.kind') = 'agent' AND json_extract(r.data, '$.sentBy.id') = @agent " +
    (inAGroup ? "AND json_extract(r.data, '$.toGroup') = @group" : "AND NULLIF(json_extract(r.data, '$.toGroup'), '') IS NULL")
  )
}

/**
 * THE STATEMENTS. The CROSS JOIN keeps the message first, and its delivery row to the person is then looked up by its id.
 *
 * THE KIND IS WRITTEN OUT and each stored field is in the words of its index (migration 0199), because SQLite uses those
 * indexes only for a query that asks in the same words.
 */
function theStatements(): TheStatements {
  const kept = STATEMENTS.get(sqlite)
  if (kept !== undefined) return kept
  const toThePerson = "CROSS JOIN message_delivery d ON d.message_id = r.id AND d.recipient_kind = 'person' AND d.recipient_id = @person "
  const sentBy = theWordsOfAStoredField(STORED_FIELDS.messageSentById, 'r.data')
  const about = theWordsOfAStoredField(STORED_FIELDS.messageAboutMessage, 'data')
  const made: TheStatements = {
    // `updated_at` STILL NARROWS WHAT `created_at` ASKS, because every write sets it to the local stamp after the creation's.
    said: sqlite.prepare(
      `SELECT 1 FROM records WHERE kind = 'message' AND ${about} = @message AND updated_at >= @since AND deleted_at IS NULL ` +
        "AND created_at >= @since AND json_extract(data, '$.notice') = @notice AND json_extract(data, '$.sentBy.id') = @office " +
        "AND json_extract(data, '$.to[0].id') = @agent LIMIT 1",
    ),
    search: {
      inAGroup: sqlite.prepare(`SELECT r.id AS id FROM records r ${toThePerson}WHERE ${sentBy} = @agent AND ${aReplyIs(true)} LIMIT 1`),
      alone: sqlite.prepare(`SELECT r.id AS id FROM records r ${toThePerson}WHERE ${sentBy} = @agent AND ${aReplyIs(false)} LIMIT 1`),
    },
    stillCounts: {
      inAGroup: sqlite.prepare(`SELECT r.id AS id FROM records r ${toThePerson}WHERE r.id = @found AND ${aReplyIs(true)} LIMIT 1`),
      alone: sqlite.prepare(`SELECT r.id AS id FROM records r ${toThePerson}WHERE r.id = @found AND ${aReplyIs(false)} LIMIT 1`),
    },
    // FROM THE DELIVERY ROWS SINCE THE WINDOW BEGAN, by `message_delivery_at_idx`, as `theDeliveriesSince` reads them. A
    // message's rows are written with its `created_at` and only ever moved later, so every message written since then
    // that reached anybody is among them.
    unreadable: sqlite.prepare(
      'SELECT r.id AS id, r.created_at AS createdAt, d.recipient_kind AS kind, d.recipient_id AS recipient ' +
        'FROM message_delivery d CROSS JOIN records r ON r.id = d.message_id ' +
        "WHERE d.at >= @since AND +r.kind = 'message' AND r.deleted_at IS NULL AND r.created_at >= @since AND NOT json_valid(r.data)",
    ),
  }
  STATEMENTS.set(sqlite, made)
  return made
}

/** Whether the office has already reminded the agent about this message since `since`, by its fixed words and the message it is about. */
function theReminderWasSaid(one: ADelivery, since: string): boolean {
  return theStatements().said.get({ message: one.messageId, since, notice: THE_NOTICE, office: moleOffice().id, agent: one.agentId }) !== undefined
}

function aKey(messageId: string, agentId: string): string {
  return JSON.stringify([messageId, agentId])
}

/** What a kept reply is kept under: everything the question asks. */
function aReplyKey(one: ADelivery): string {
  return JSON.stringify([one.person, one.at, one.agentId, one.toGroup])
}

/**
 * Whether the agent has written to the person in the same conversation at or after delivery.
 *
 * THE REPLY FOUND IS KEPT, for each delivery time, person, agent and conversation, which is all the question asks. A
 * later pass first asks whether that one message still counts, and searches again only when it does not.
 */
function theAgentHasReplied(one: ADelivery): boolean {
  const statements = theStatements()
  const inAGroup = one.toGroup !== null
  const asked = { person: one.person, at: one.at, agent: one.agentId, ...(inAGroup ? { group: one.toGroup as string } : {}) }
  let found = REPLIES_FOUND.get(sqlite)
  if (found === undefined) {
    found = new Map()
    REPLIES_FOUND.set(sqlite, found)
  }
  const key = aReplyKey(one)
  const before = found.get(key)
  const stillCounts = inAGroup ? statements.stillCounts.inAGroup : statements.stillCounts.alone
  if (before !== undefined && stillCounts.get({ ...asked, found: before }) !== undefined) return true
  const row = (inAGroup ? statements.search.inAGroup : statements.search.alone).get(asked) as { id: string } | undefined
  if (row === undefined) {
    found.delete(key)
    return false
  }
  found.set(key, row.id)
  return true
}

/**
 * Whether a message the pass cannot read could change this delivery's answer. One that reached the person at or after
 * the delivery could be the agent's reply, and one that reached the agent could be the reminder already said.
 */
function anUnreadableMessageCouldAnswer(one: ADelivery, unreadable: readonly AnUnreadableMessage[]): boolean {
  return unreadable.some(
    (message) =>
      (message.kind === 'person' && message.recipient === one.person && message.createdAt >= one.at) ||
      (message.kind === 'agent' && message.recipient === one.agentId),
  )
}

/** What the reminder says to the agent. */
function theReminder(one: ADelivery, minutes: number): string {
  const who = whoSentItInWords(JSON.parse(one.sentBy) as unknown)
  return (
    `${who} wrote to you at ${one.sentAt} (message ${one.messageId}), and it was handed to your session at ${one.at}. ` +
    `At least ${String(minutes)} minutes have passed, and you have written nothing to them in that conversation. Read it with ` +
    `GET /api/records/${one.messageId} and answer them there. If you answered somewhere else, nothing more is needed. ` +
    'This is the only reminder for this message.'
  )
}

/**
 * ONE PASS OF THE REPLY REMINDER. Called by the office's reminder tick, `sendTheRemindersThatAreDue` in ./reminders.ts,
 * with its clock, the moment it started watching, and the bounded catch-up captured at start.
 * It returns the messages it reminded an agent about. `unreadable` is given each message in the window whose data is not
 * valid JSON, with the time it was written, so the tick can say them.
 */
export function sendTheReplyRemindersThatAreDue(
  workspaceId: string, now: Date, watchingSince: Date, by: Actor, catchUp?: ReplyReminderCatchUp,
  unreadable: { id: string; createdAt: string }[] = [],
): string[] {
  const minutes = replyReminderMinutes()
  const since = localStamp(new Date(Math.min(watchingSince.getTime(), catchUp?.since.getTime() ?? watchingSince.getTime())))
  const unreadableRows = theStatements().unreadable.all({ since }) as AnUnreadableMessage[]
  for (const row of unreadableRows) if (!unreadable.some((one) => one.id === row.id)) unreadable.push({ id: row.id, createdAt: row.createdAt })
  const due = theDeliveriesSince(since, localStamp(watchingSince), localStamp(catchUp?.until ?? watchingSince)).filter((one) => {
    if (one.mark === 'seen' && !isAHandOverSentence(one.because) && !isAMessageReadSentence(one.because)) return false
    const at = parseAnyStamp(one.at)
    if (at === null) {
      throw new Error(
        `The delivery of message ${one.messageId} to agent ${one.agentId} carries the time "${one.at}", which cannot be ` +
          'read, so whether it is due a reply reminder cannot be worked out.',
      )
    }
    return now.getTime() - at.getTime() >= minutes * 60_000
  })
  // THE LINES WRITTEN IN THIS PASS, so each message and agent is said once even before the line can be read back.
  const said = new Set<string>()
  const reminded: string[] = []
  for (const one of due) {
    if (anUnreadableMessageCouldAnswer(one, unreadableRows)) continue
    if (said.has(aKey(one.messageId, one.agentId)) || theReminderWasSaid(one, since)) continue
    const agent = readParticipant({ kind: 'agent', id: one.agentId })
    if (agent === null || !('retired' in agent) || agent.retired) continue
    if (theAgentHasReplied(one)) continue
    writeASystemLineToOne(
      { kind: 'agent', id: one.agentId },
      workspaceId,
      SYSTEM_LINES.aPersonWaitsForAReply(theReminder(one, minutes)),
      by,
      { message: one.messageId },
    )
    said.add(aKey(one.messageId, one.agentId))
    reminded.push(one.messageId)
  }
  // A REPLY KEPT FOR A DELIVERY THAT IS NO LONGER DUE IS FORGOTTEN, so no more is kept than a pass asks about.
  const asked = new Set(due.map(aReplyKey))
  const found = REPLIES_FOUND.get(sqlite)
  if (found !== undefined) for (const key of found.keys()) if (!asked.has(key)) found.delete(key)
  return reminded
}
