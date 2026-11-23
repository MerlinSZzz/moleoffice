// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE SERVER TELLS AN OPEN PAGE ABOUT, WITHOUT THE PAGE ASKING. The closed list of events.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A CHANNEL AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M5 of `design/messages/ACCEPTANCE.md`. Until this existed the page polled, so a message
 * an agent wrote was seen when the person next reloaded. This channel lets the page update
 * in real time.
 *
 * ---------------------------------------------------------------------------------------
 * WHY SERVER-SENT EVENTS AND NOT A SOCKET
 * ---------------------------------------------------------------------------------------
 *
 * Every write already goes through the API and the page only listens, so the traffic is one way.
 * A socket would add a second write door with its own rules, which is the thing this repository
 * spends most of its refusals preventing. Recorded as an engineering decision under section 7.5.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIST IS CLOSED, AND ANYTHING NOT BUILT SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * `EVENTS_SENT_TODAY` is the ones something in this build actually sends. A name in the list above
 * is not a promise that anything sends it: the page's reader is written against the whole list so
 * that it does not have to be widened later. `lead.offered` (M8) is the one left.
 */

import type { ParticipantRef } from './participants.ts'
import type { DeliveryMark, DeliveryOnTheWire, PoolEntry } from './messages.ts'
import type { AnsweringHow } from './handles.ts'

/** Every event name the channel may carry. */
export const EVENT_NAMES = [
  'message.new',
  'delivery.changed',
  'presence.changed',
  'lead.offered',
  'comment.placed',
  'comment.replied',
  'list.changed',
  'machine.changed',
  'answering.changed',
  'record.changed',
] as const

/** One of the ten. */
export type EventName = (typeof EVENT_NAMES)[number]

/** The event names something in this build actually sends. Leading is the one still to come. */
export const EVENTS_SENT_TODAY: readonly EventName[] = [
  'message.new',
  'delivery.changed',
  'presence.changed',
  'lead.offered',
  'comment.placed',
  'comment.replied',
  'list.changed',
  'machine.changed',
  'answering.changed',
  'record.changed',
]

/** What a person reads when they ask what an event is, one sentence each. */
export const EVENT_WORDS: Readonly<Record<EventName, string>> = {
  'message.new': 'Somebody sent a message.',
  'delivery.changed': 'A message got further with one of the people or agents it was sent to.',
  'presence.changed': 'Somebody came online or went offline.',
  'lead.offered': 'An agent offered to take somebody to a page.',
  'comment.placed': 'Somebody left a comment on a page.',
  'comment.replied': 'Somebody answered a comment that was left on a page.',
  'list.changed': 'Something the messages panel lists changed, such as a group or how the contacts are arranged.',
  'machine.changed': 'Something a page compares or shows of the machine reading changed, such as its addresses or how new its code is.',
  'answering.changed': 'An agent started or stopped answering, or something else answers as it now.',
  'record.changed': 'A record was stored again, or a link to or from it was made or taken away.',
}

/** A message somebody sent. */
export interface MessageNew {
  name: 'message.new'
  /** The project it is in, so a page reading another project ignores it. */
  workspaceId: string
  messageId: string
  sentBy: ParticipantRef | null
  to: readonly ParticipantRef[]
  /** True when it says what on a page it is about, so a page can tell a comment from a line. */
  hasTarget: boolean
  /**
   * WHAT THE CHAT'S LISTS NEED IN ORDER TO SHOW THIS MESSAGE WITHOUT READING THEM AGAIN.
   *
   * Worked out on the server with the functions its own list doors use (`whatANewMessageChanges` in
   * src/server/lib/messages.ts), so the page moves rows and never decides by a rule of its own which
   * conversation a message is in or whether it counts as unread. Null or absent means the server could
   * not say, and a page then reads the lists the event could change, as it did before events carried
   * anything.
   */
  lists?: WhatANewMessageChanges | null
}

/**
 * WHAT ONE NEW MESSAGE CHANGES IN THE CHAT'S LISTS.
 *
 * Everything here is the same for every reader, so it is worked out once when the message is written
 * and kept with the event. The one part that differs by reader is in `forTheReader`, which the server
 * adds for each open page as it sends (see `announce` in src/server/lib/events.ts).
 */
export interface WhatANewMessageChanges {
  /** The message exactly as a pool read reports it, delivery marks included. */
  entry: PoolEntry
  /**
   * EVERY ONE-TO-ONE CONVERSATION IT IS IN, as pairs, by the rule `contactsFor` uses.
   *
   * Null when that rule needs more than this one message to answer: a message to a group, a line
   * Mole Office wrote (it may belong to a conversation through the message it is about), and a
   * message whose writer no registry holds. A page reads its contacts for those.
   */
  pairs: [ParticipantRef, ParticipantRef][] | null
  /** Every conversation between two agents it is in, by the rule `conversationsBetweenAgents` uses. */
  agentPairs: [ParticipantRef, ParticipantRef][]
  /**
   * TRUE WHEN ANOTHER MESSAGE WAS WRITTEN IN THE SAME SECOND. The conversations between agents are
   * ordered by the time of their last message, and times are whole seconds, so two conversations whose
   * last messages share a second are in an order the page cannot tell. A page reads that list then.
   */
  anotherInTheSameSecond: boolean
  /**
   * HOW IT COUNTS FOR EACH PARTICIPANT IT WAS DELIVERED TO, by `unreadAmong` and `anythingUnreadAmong`.
   *
   * `unread` is 1 or 0; `anythingUnread` is what makes a row bold. A participant with no delivery
   * row on this message is not listed, and for them it counts as nothing.
   */
  counts: { who: ParticipantRef; unread: number; anythingUnread: boolean }[]
  /**
   * TRUE WHEN THIS IS A NEW MESSAGE, false when an older message has just reached somebody.
   *
   * The patch door announces a message again when a patch gives it a recipient. Such a message may be
   * older than the last line of the conversation it has joined, so a page cannot put it on top; it
   * reads the lists instead.
   */
  fresh: boolean
  /**
   * THE PART THAT DEPENDS ON WHO IS READING, added for one open page as it is sent to it.
   *
   * Absent on the copy the server remembers for a page that reconnects, and absent for a page whose
   * reader is not a person, because only a person's page draws these lists. A page that gets no
   * `forTheReader` reads the lists the event could change.
   */
  forTheReader?: WhatANewMessageChangesForOneReader
}

/** The part of a new message's change that differs by reader. */
export interface WhatANewMessageChangesForOneReader {
  /** Who it was worked out for. A page whose reader is somebody else ignores it. */
  reader: ParticipantRef
  /**
   * FOR EACH CONVERSATION BETWEEN TWO AGENTS THE MESSAGE IS IN, how much it adds to what is new since
   * this reader last opened that conversation, by the rule `conversationsBetweenAgents` uses.
   */
  betweenAgents: { between: [ParticipantRef, ParticipantRef]; newSince: number; anythingNew: boolean }[]
  /**
   * THE CONTACT ROWS THIS READER PLACED BY HAND, by their keys.
   *
   * The contacts door puts rows placed by hand first in their group and every other row after them,
   * newest first (`placeTheContacts`). A page moving a row to the top of its group needs to know which
   * rows keep their place. Listed only when the message is in a conversation of this reader's.
   */
  placedByHand: string[] | null
}

/** The reader's contact rows a mark reaching `seen` moved: each row's key and its counts now. */
export type SeenLeaves = { key: string; unread: number; anythingUnread: boolean }[]

/** One recipient's mark on one message moved. */
export interface DeliveryChanged {
  name: 'delivery.changed'
  workspaceId: string
  /**
   * THE MESSAGES THE MARK MOVED ON, ONE OR MORE.
   *
   * Plural because a batch arrives as one event: a conversation read marks every still-queued message
   * in it delivered in one act (`markManyDelivered`), and that used to be one event per message, so
   * opening a conversation of ten cost ten events and every open window read its lists ten times.
   * The marks were all moved by one act and they are announced as one act. They may sit in more than
   * one project — a conversation is the person's across every project — so a batch that spans
   * projects is announced once per project it touches, and every event here names the project its
   * messages are in.
   */
  messageIds: readonly string[]
  to: ParticipantRef
  mark: DeliveryMark
  /**
   * THE RECIPIENT'S DELIVERY ROW ON EACH OF THOSE MESSAGES, as a pool read reports it now.
   *
   * A page puts each row in place of the old one wherever it holds that message. Null or absent means
   * the server could not read them, and a page then reads the lists the event could change.
   */
  rows?: { messageId: string; row: DeliveryOnTheWire }[] | null
  /**
   * WHERE A MARK REACHING `seen` LEAVES `to`'S OWN CONTACT ROWS, worked out on the server by the contacts door's rules
   * (`whereSeenLeavesTheContacts` in src/server/lib/messages.ts). A page of `to` puts each row's counts in place, and
   * lowers the circle by what those rows fell by, instead of reading the whole contact list. Null or absent means the
   * server could not say from these messages alone, and a page then reads the lists the event could change.
   */
  seenLeaves?: SeenLeaves | null
  /**
   * TRUE WHEN THE EVENT IS A NOT NOW PRESS, which moves no mark: `to` put off the offer these messages
   * carry, and every other screen of theirs drops it at once rather than at its next read (row 65 of
   * report rFBoQG6mAEI0, left by wave 13n's round 35). Absent on every other event.
   */
  offerPutOff?: true
}

/**
 * WHAT A PAGE DRAWS OF SOMEBODY'S PRESENCE CHANGED: the colour of their dot, its word, their state
 * line or their own choice.
 *
 * It is not announced when a page merely opens or closes and nothing a page draws moved. Before
 * 26 September 2026 it was, and on the owner's office 90 of 95 of these said the same green as the
 * one before (report VQw5RwL8gbCb).
 */
export interface PresenceChanged {
  name: 'presence.changed'
  who: ParticipantRef
  /** The colour as a reader nobody can place is told it, which is what the event always carried. */
  colour: string
  /**
   * THE WHOLE READING AS THIS PAGE'S READER WOULD BE TOLD IT by `GET /api/presence`, added for one
   * open page as it is sent to it. What a person may be told about a person's own choice is not what
   * an agent may, so it is worked out per reader and is absent from the copy the server remembers. A
   * page that gets no reading reads this one participant's presence.
   */
  reading?: PresenceReadingOnTheWire
}

/** One participant's presence reading, as `GET /api/presence` answers it for one participant. */
export interface PresenceReadingOnTheWire {
  who: ParticipantRef
  colour: 'green' | 'grey' | 'red'
  word: string
  says: string
  state: string | null
  [more: string]: unknown
}

/**
 * THE LISTS THE MESSAGES PANEL HOLDS, BY NAME, as a `list.changed` event names them.
 *
 * The same names `ChatList` in src/web/lib/chatlists.ts uses for the lists a page reads. And three that are not the chat's:
 * `needsYou`, what waits on the person (GET /api/waiting), which the popup for one press and Home's Needs you read. A
 * request for one press filed, answered or withdrawn announces it (src/server/lib/one-press.ts, wave 13n round 45).
 * `visits`, the trips to this office (GET /api/office/visits), which the Embassy draws. A visit registered or ended
 * announces it (src/server/lib/visits.ts).
 * `terminals`, where the terminal holder stands (GET /api/terminals), which Terminal management draws. A holder that
 * ends or a new one the office records announces it (src/server/lib/terminals.ts).
 */
export const LISTS_AN_EVENT_CAN_NAME = ['participants', 'contacts', 'betweenAgents', 'groups', 'theOpenConversation', 'needsYou', 'visits', 'terminals'] as const

/** One of those lists. */
export type AListAnEventCanName = (typeof LISTS_AN_EVENT_CAN_NAME)[number]

/**
 * A WRITE CHANGED A LIST THE MESSAGES PANEL HOLDS, and nothing smaller than the list can say how.
 *
 * Announced by the writes that change a list and are not a message or a delivery mark: a group opened
 * or its members changed, the person arranging their contacts, a reader opening a conversation
 * between two agents, a message deleted or brought back, an agent registered or its registry row
 * changed. They are rare, so a page reads the lists named rather than being sent the rows.
 */
export interface ListChanged {
  name: 'list.changed'
  /**
   * The project the write was made in, or null when the list is not one project's: a person's contacts
   * and groups are theirs whichever project is open (criterion M55), so a page reads them whatever
   * project it is watching.
   */
  workspaceId: string | null
  lists: AListAnEventCanName[]
  /**
   * WHOSE LIST IT IS, when only one participant's list changed: the person who arranged their own
   * contacts, the reader who opened a conversation. Null when it is everybody's. Only the pages of
   * that participant are sent an event with a participant here.
   */
  about: ParticipantRef | null
  /** The group it was about, when it was about one, so a page showing that group reads it. */
  groupId: string | null
  /**
   * THE PARTICIPANT WHOSE REGISTRY ROW CHANGED, when that is what changed. A page then reads that one
   * participant and their presence, not the whole registry. Absent or null otherwise.
   */
  participant?: ParticipantRef | null
  /**
   * THE TERMINAL A SECRETARY HAS JUST OPENED FOR THE PERSON WITH A LINE PREPARED IN IT, and that secretary, so a page
   * can bring the terminal up in front of the person at once. The line is not here, because these events reach every
   * page; a page reads it from GET /api/terminals. Absent or null otherwise.
   */
  prepared?: { terminal: string; by: ParticipantRef } | null
  /** Why, in one sentence, for a reader of the stream. */
  because: string
}

/**
 * SOMEBODY LEFT A COMMENT ON A PAGE, or answered one that was already there.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT `message.new` WITH A FLAG
 * ---------------------------------------------------------------------------------------
 *
 * A page open on the record a comment was left on has to draw it, whoever it was addressed to and
 * whether or not the reader is one of them. `message.new` is about a message reaching its
 * recipients; this is about a place on a page changing. The two go to different parts of the page
 * and a page listening for one would have had to read the other's fields to tell which it was.
 *
 * ---------------------------------------------------------------------------------------
 * PLACED AND REPLIED ARE THE SAME SHAPE AND THEY ARE NOT THE SAME EVENT
 * ---------------------------------------------------------------------------------------
 *
 * `comment.placed` is the first thing said about a place. `comment.replied` is an answer to
 * somebody who had already said something about that same place. A page draws them the same way;
 * an agent waiting to be answered does not, and that is the difference the two names carry.
 */
export interface CommentPlaced {
  name: 'comment.placed' | 'comment.replied'
  workspaceId: string
  /** The message that is the comment. */
  messageId: string
  /** Who wrote it, or null when the writer answers to no registry row. */
  sentBy: ParticipantRef | null
  /** The record the comment is on, so a page can tell whether it is about what it is showing. */
  recordId: string | null
  /** The one spelling of the thing pointed at, which is what the page draws the mark on. */
  targetKey: string
  /** Who it was addressed to. Empty on a comment written for nobody in particular. */
  to: readonly ParticipantRef[]
}

/**
 * SOMEBODY OFFERED TO TAKE THE READER TO A PAGE.
 *
 * NOTHING MOVES BECAUSE THIS ARRIVED. The page draws an offer with one button, and it moves only
 * when the reader presses that button or has already said they are following this agent. Criterion
 * M8: leading is by consent.
 *
 * IT IS A SEPARATE EVENT FROM `message.new` for the reason `comment.placed` is: a page has to draw
 * this whether or not its messages panel is open and whether or not the reader is one of the
 * recipients of the message carrying it.
 */
export interface LeadOffered {
  name: 'lead.offered'
  workspaceId: string
  messageId: string
  /** Who is offering, or null when the writer answers to no registry row. */
  sentBy: ParticipantRef | null
  /** Who the message carrying the offer was addressed to. */
  to: readonly ParticipantRef[]
  /** The record it offers to take them to, or null when it names a page rather than a record. */
  recordId: string | null
  /** The one spelling of the thing it would box when the reader gets there. */
  targetKey: string
}

/** The parts of the machine reading a page compares or shows, as `machine.changed` names them. */
export const MACHINE_PARTS_AN_EVENT_CAN_NAME = ['addresses', 'database', 'freshness', 'failedStarts', 'settings'] as const

/** One of those parts. */
export type AMachinePart = (typeof MACHINE_PARTS_AN_EVENT_CAN_NAME)[number]

/**
 * SOMETHING A PAGE COMPARES OR SHOWS OF THE MACHINE READING CHANGED, so a page reads `GET /api/runtime` once.
 *
 * In wave 13w round 25, a page reads the machine when it loads and when its stream reconnects, and after that only
 * when this says so. Before, every page read it every thirty seconds, 1,149 times a day on
 * the owner's office. The server looks for a change while a page is open (src/server/api/events.ts) and announces only
 * when one of the parts below moved since its last look. It carries no workspace, so it reaches every open page: the
 * machine is the same whichever project a page watches. It carries the names and not the reading, because a reading is
 * a large answer and some of it is the reader's to be told.
 */
export interface MachineChanged {
  name: 'machine.changed'
  /** Which parts moved since the server's last look. */
  changed: AMachinePart[]
}

/**
 * WHO IS ANSWERING AS AN AGENT CHANGED, IN ONE PROJECT, in wave 13w round 26.
 *
 * What changed is one of the three parts the chat's Cannot reach notice and its header draw from the
 * conversation door: how the agent is answered (`AnsweringHow` in handles.ts), the session record that
 * answers, and whether the office could not tell. It is announced when a write may have moved one of
 * them (a hold taken or let go, a run's record written, a message taken by a run, a wait started or
 * ended), and by the server's once-a-minute look for a change from time alone, such as a hold that
 * lapsed or a wait that ran out (src/server/lib/answering-told.ts). It reaches the pages watching the
 * project it names. A page with the agent's conversation open reads that conversation again; the
 * agent's dot moves on `presence.changed`, as before.
 */
export interface AnsweringChanged {
  name: 'answering.changed'
  who: ParticipantRef
  /** The project the answering was read in. The conversation door reads it in the page's project. */
  workspaceId: string
  /** How the agent is answered now. */
  how: AnsweringHow
  /** True when nobody is known to answer because the office could not tell, rather than because nothing answers. */
  couldNotTell: boolean
}

/** A record was stored again, or a link to or from it was made or taken away. It carries no content, so a page that shows the record reads it again. It is never sent for a message, which has events of its own. */
export interface RecordChanged {
  name: 'record.changed'
  /** The project the record is in, so a page reading another project ignores it. */
  workspaceId: string
  recordId: string
  kind: string
  /** 'revision' when the record itself was stored, 'link' when a link to or from it changed. */
  what: 'revision' | 'link'
}

/** Anything the channel carries. */
export type ChannelEvent = MessageNew | DeliveryChanged | PresenceChanged | CommentPlaced | LeadOffered | ListChanged | MachineChanged | AnsweringChanged | RecordChanged

/** One event as it goes over the wire, with the id a reconnecting page sends back. */
export interface EventOnTheWire {
  /** Counts from 1 and never repeats within one run of the server. */
  id: number
  event: ChannelEvent
}

/** True when this word is one of the ten. */
export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && (EVENT_NAMES as readonly string[]).includes(value)
}

/**
 * THE HEADER A PAGE SENDS TO SAY WHICH PROJECT IT IS WATCHING.
 *
 * The same header every other request carries. A stream is a request like any other, and a page
 * watching one project must not be handed another project's messages.
 */
export const WATCHING_PARAM = 'watching'

/**
 * THE SENTENCE THE PAGE DRAWS WHILE THE CHANNEL IS DOWN.
 *
 * Not "reconnecting": a reader wants to know what it means for them, which is that what is on the
 * screen may be behind.
 */
/**
 * THE QUERY PARAMETER A PAGE PUTS ITS OWN CONNECTION ID IN.
 *
 * WHY A CONNECTION NEEDS A NAME. `GET /api/events/state` says how many pages are open across the
 * whole server, which is the honest answer to the question it is asked and is useless to anybody who
 * wants to know about their own. A test that opened a stream and then read that number was counting
 * every other page on the machine too, and went red about one run in three when another one closed
 * late (problems `S5otcpQOw0iJ` and `xi0SpPpDxl6j`). With a tag, a caller can ask how many
 * connections carrying THEIR name are open, and nobody else's page can move it.
 *
 * IT IS NOT AN IDENTITY. It says which connection, not who. Who is asking is the actor headers, as
 * on every other request, and nothing here reads a tag as a permission.
 */
export const CONNECTION_TAG_PARAM = 'tag'

/**
 * THE QUERY PARAMETER A PAGE PUTS, IN MILLISECONDS, HOW LONG IT TOOK FROM STARTING TO LOAD TO ITS STREAM
 * LISTENING. Problem k8n8yOWOzHI1.
 *
 * Sent with `GET /api/events/state` beside the page's connection tag. The reply then says how many
 * events that would have reached that connection were announced in that many milliseconds before the
 * server counted it: the events the page may have missed while it was still connecting, because it read
 * its lists before its stream was listening.
 */
export const CONNECTING_FOR_PARAM = 'connectingFor'

/**
 * THE COMMENT LINE THE SERVER WRITES ONCE A CONNECTION IS COUNTED AS OPEN.
 *
 * The first line of the stream is `: open N missed`, and it is written BEFORE the connection joins
 * the list of open pages, because what was missed has to be worked out before anything can arrive.
 * So a reader that got the first line and immediately asked how many pages were open could be told a
 * number taken before its own connection was counted. This line is written after it joins, so a
 * caller that waits for it is asking about a connection the server already holds.
 *
 * A COMMENT AND NOT AN EVENT, so it reaches a reader that logs the stream and is never mistaken for
 * something that happened.
 */
export const CONNECTION_IS_COUNTED = 'counted'

/**
 * THE COMMENT LINE THAT SAYS WHICH RUN OF THE SERVER THIS STREAM IS FROM, AND WHERE ITS EVENTS HAVE GOT TO.
 *
 * Written as `: run <run id> at <last event id>`, right after the first line. Event ids count from 1
 * again every time the server starts, so an id alone cannot tell a page "you missed nothing" from "the
 * server restarted and remembers nothing". A page that sees a run id different from the one it had
 * reads its lists once. `at` is the id of the newest event when the page connected, so a page that has
 * not been sent an event yet still knows where to pick up after a break.
 *
 * A page that sends its run id back as the `run` query parameter, and names a run that is not this
 * one, is sent nothing from memory: the ids it remembers belong to another run.
 */
export const RUN_LINE = 'run'

/** The query parameter a page sends its last known run id in. */
export const RUN_PARAM = 'run'

/** Read a run line, or null when this block is not one. */
export function readTheRunLine(block: string): { run: string; at: number } | null {
  const found = /^: run (\S+) at (\d+)$/.exec(block.trim())
  if (found === null) return null
  return { run: found[1] as string, at: Number(found[2]) }
}

export const CHANNEL_IS_DOWN =
  'This page is not being told about new messages at the moment. What is on it may be out of date until the ' +
  'connection comes back.'
