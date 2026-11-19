// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EVENT IS APPLIED TO THE LISTS THE CHAT HOLDS, INSTEAD OF THE LISTS BEING READ AGAIN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS REPLACES, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Until 26 September 2026 an event only said that something had happened, and every open page then
 * read whole lists: the contacts, the conversations between agents, the groups, the presence, the
 * names. Measured on a copy of the owner's office (report VQw5RwL8gbCb), the owner's pages made about 21 requests a
 * minute that way, and most of what they read had not changed. Since a decision of 26 September, an event carries
 * the change and the page applies it.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAGE MOVES ROWS; IT NEVER DECIDES A RULE
 * ---------------------------------------------------------------------------------------
 *
 * Which conversation a message is in, whether it counts as unread for this reader, how much it adds
 * to what is new between two agents and which contacts keep a place given by hand are all worked out
 * on the server with the functions its list doors use, and carried on the event
 * (src/shared/events.ts). What is done here is only moving rows: a new last line, a count going up by
 * what the server said, a delivery row put in place of the old one, a presence reading put in place of
 * the old one, a row moved to the top of its group by the one ordering rule both ends share.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN IT CANNOT, IT SAYS WHICH LIST TO READ, AND NEVER GUESSES
 * ---------------------------------------------------------------------------------------
 *
 * Every function here either gives the list as a fresh read would answer it or names the list to read
 * again. It names one when the event carries nothing (an old server, or the copy remembered for a page
 * that reconnects without the part worked out for its reader), when the rule needs more than one
 * message (a line Mole Office wrote, a message from a writer nobody registered), when a row is one the
 * page does not hold, when two rows would tie in the order, and when a mark reaching `seen` on a
 * message to this reader moves counts over messages the page does not hold. Reading once too often is
 * one request; applying a change the page could not prove is a wrong count nobody can see.
 *
 * `tests/applied-events-equal-a-fresh-read.test.ts` applies a run of real events to real lists with
 * these functions and compares the result with a fresh read of the same lists, field by field.
 */

import type { ChannelEvent, WhatANewMessageChanges } from '@shared/events.ts'
import { aDotSaysOnline, orderInsideOneContactGroup } from '@shared/contacts.ts'
import { participantKey, sameParticipant, theProjectsWithANewerMessage } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { aBetweenAgentsRowForThePage, aParticipantRowForThePage, aContactRowForThePage, aGroupRowForThePage, type TheCircle } from '@shared/short-lists.ts'
import type {
  ConversationReply,
  DeliveryOnTheWire,
  OneGroupReply,
  ParticipantForThePage,
  ParticipantsForThePageReply,
  PoolEntry,
  PresenceOnTheWire,
  ShortBetweenAgentsReply,
  ContactListHeld,
  ShortContactLine,
  ShortContactsReply,
  ShortGroupsReply,
  UnregisteredReply,
} from '../api.ts'
import { listsAnEventChanges, type ChatList, type TheOpenOne } from './chatlists.ts'

/** Every list the chat panel holds that an event can move. Null is a list the page has not read. */
export interface HeldLists {
  /** Who is reading and the number on the circle, which is all a closed panel draws. */
  circle: TheCircle | null
  who: ParticipantsForThePageReply | null
  presence: PresenceOnTheWire[] | null
  /**
   * The contacts, in the short rows of `GET /api/messages/contact-list`: the first rows of the list as it is drawn, as
   * many pages as have been read (src/web/lib/the-contact-list-held.ts).
   */
  contacts: ContactListHeld | null
  /** The conversations between agents, in the short rows the page asks for (`?shape=page`). */
  between: ShortBetweenAgentsReply | null
  /** The groups, in the short rows the page asks for. */
  groups: ShortGroupsReply | null
  /** The open conversation with one participant. */
  talk: ConversationReply | null
  /** The open agent's dot, read with its conversation. */
  talkPresence: PresenceOnTheWire | null
  /** The open group. */
  theGroup: OneGroupReply | null
  /** The open conversation with a writer nobody registered. */
  unregistered: UnregisteredReply | null
}

/** What applying one event did, and what is left for the caller to read or write. */
export interface Applied {
  /** The lists as they are after the event. A list the event did not move is the same object. */
  held: HeldLists
  /** The lists to read again, because this event could not be applied to them. */
  reads: Set<ChatList>
  /** Participants whose presence is to be read, one each, because the event carried no reading. */
  readPresenceOf: ParticipantRef[]
  /** Participants the page has never seen, to be read one each. */
  readParticipants: ParticipantRef[]
  /**
   * Messages to this reader that the open conversation now shows while they are still queued. Reading
   * the conversation marked those delivered; a page that adds them without reading marks them through
   * the mark door instead, so the writer's clock becomes a tick exactly as it did.
   */
  markDelivered: string[]
  /** The lists this event moved or asked to read, so a read already in flight for one is made again. */
  touched: Set<ChatList>
}

/** Who a delivery row, a count or a pair side is, as one comparable word. */
const keyOf = (who: ParticipantRef): string => participantKey(who)

// ============================================================ delivery rows

/** One entry with the recipient's new delivery rows put in place of the old ones. */
function withRows(entry: PoolEntry, rows: readonly { messageId: string; row: DeliveryOnTheWire }[]): PoolEntry {
  const mine = rows.filter((one) => one.messageId === entry.id)
  if (mine.length === 0) return entry
  let deliveries = entry.deliveries
  for (const { row } of mine) {
    const at = deliveries.findIndex((d) => sameParticipant(d.to, row.to))
    deliveries = at < 0 ? [...deliveries, row] : deliveries.map((d, i) => (i === at ? row : d))
  }
  return { ...entry, deliveries }
}

function everyEntryWithRows<T extends { messages: PoolEntry[] }>(
  reply: T | null,
  rows: readonly { messageId: string; row: DeliveryOnTheWire }[],
): T | null {
  if (reply === null) return null
  const ids = new Set(rows.map((one) => one.messageId))
  if (!reply.messages.some((one) => ids.has(one.id))) return reply
  return { ...reply, messages: reply.messages.map((one) => withRows(one, rows)) }
}

// ============================================================ a new message

/** How this message counts for this reader, by the server's own `unreadAmong`. */
function countsFor(lists: WhatANewMessageChanges, me: ParticipantRef): { unread: number; anythingUnread: boolean } {
  const found = lists.counts.find((one) => sameParticipant(one.who, me))
  return found === undefined ? { unread: 0, anythingUnread: false } : { unread: found.unread, anythingUnread: found.anythingUnread }
}

/**
 * THE CONTACTS, WITH A NEW MESSAGE ON THE ROW OF THE CONVERSATION IT IS IN.
 *
 * The row gets the message as its last line and moves to the top of the list, because the contacts
 * door puts the newest conversation first. Inside its group it is placed again by the one ordering
 * rule the door uses (`orderInsideOneContactGroup`): rows placed by hand keep their places, and every
 * other row follows newest first. A row with a last line is never folded under its starter, by the
 * door's own rule, so a row that had never spoken unfolds.
 *
 * A ROW THE PAGE DOES NOT HOLD IS READ. The chat holds the first rows of the list as it is drawn
 * and a row moved to the top of its group stays among them. A row that is
 * not held may now belong among them, and only the server can say where.
 */
export function contactsWithANewMessage<Reply extends ShortContactsReply>(
  reply: Reply,
  lists: WhatANewMessageChanges,
): Reply | 'read' {
  const me = reply.me
  const entry = lists.entry as unknown as PoolEntry
  if (lists.pairs === null) {
    // A GROUP MESSAGE IS IN NO CONTACT ROW. The second half of the circle is moved with the groups.
    if (entry.toGroup !== null) return reply
    // A MOLE OFFICE LINE OR A MESSAGE FROM A WRITER NOBODY REGISTERED: its row is placed by a rule that
    // needs more than this message. Only this reader's rows can move, and only when it reached them or
    // they wrote it.
    const involved = lists.counts.some((one) => sameParticipant(one.who, me)) || (entry.sentBy !== null && sameParticipant(entry.sentBy, me))
    return involved ? 'read' : reply
  }
  const others = new Map<string, ParticipantRef>()
  for (const [a, b] of lists.pairs) {
    if (sameParticipant(a, me) && sameParticipant(b, me)) continue
    if (sameParticipant(a, me)) others.set(keyOf(b), b)
    else if (sameParticipant(b, me)) others.set(keyOf(a), a)
  }
  if (others.size === 0) return reply
  // TWO ROWS WOULD SHARE ONE LAST LINE, and the door breaks that tie by a rule this page does not hold.
  if (others.size > 1) return 'read'
  if (!lists.fresh) return 'read'
  const told = lists.forTheReader
  if (told === undefined || !sameParticipant(told.reader, me) || told.placedByHand === null) return 'read'
  const other = [...others.values()][0] as ParticipantRef
  const at = reply.contacts.findIndex((one) => one.who !== null && sameParticipant(one.who, other))
  const row = reply.contacts[at]
  if (row === undefined) return 'read'
  // HEARD ALREADY: nothing moves twice.
  if (row.last !== null && row.last.id === entry.id) return reply
  if (row.last !== null && entry.sentAt < row.last.sentAt) return 'read'
  const counts = countsFor(lists, me)
  // CUT BY THE FUNCTION THE DOOR CUTS ITS ROWS WITH, so a row moved by an event and a row read from the door are the same.
  const moved: ShortContactLine = aContactRowForThePage({
    ...row,
    last: entry,
    unread: row.unread + counts.unread,
    anythingUnread: row.anythingUnread || counts.anythingUnread,
    foldedUnder: null,
    // Agent projects are membership; other contacts keep the projects of their conversation.
    projects: row.who?.kind === 'agent' ? row.projects : theProjectsWithANewerMessage(row.projects, entry),
  })
  const rest = reply.contacts.filter((_, i) => i !== at)
  const inOrder = [moved, ...rest]
  const byHand = new Set(told.placedByHand)
  const group = inOrder.filter((one) => one.group === moved.group)
  const placed = new Map(
    orderInsideOneContactGroup(group, (one) => (byHand.has(one.key) ? one.at : null), (one) => one.online).map((one, i) => [one.key, i]),
  )
  const contacts = inOrder.map((one) => {
    if (one.group !== moved.group) return one
    const next = placed.get(one.key) ?? one.at
    return next === one.at ? one : { ...one, at: next }
  })
  return { ...reply, contacts, unread: { ...reply.unread, messages: reply.unread.messages + counts.unread } }
}

/**
 * THE CONVERSATIONS BETWEEN TWO AGENTS, WITH A NEW MESSAGE ON THE ONE IT IS IN.
 *
 * The page holds the short rows (`?shape=page`), and the moved row is built by the same function the
 * door cuts its rows with (`aBetweenAgentsRowForThePage` in src/shared/short-lists.ts), so a row made
 * from an event and a row read from the door are cut the same way. What the message adds to what is
 * new since this reader last opened the conversation is the server's answer for this reader. The list
 * is newest first, so the conversation moves to the top; when another message was written in the
 * same second, the door's order is not one this page can tell, and it reads the list.
 */
export function betweenWithANewMessage(reply: ShortBetweenAgentsReply, lists: WhatANewMessageChanges, me: ParticipantRef): ShortBetweenAgentsReply | 'read' {
  if (!reply.mayRead || lists.agentPairs.length === 0) return reply
  const entry = lists.entry as unknown as PoolEntry
  if (lists.agentPairs.length > 1 || !lists.fresh || lists.anotherInTheSameSecond) return 'read'
  const told = lists.forTheReader
  if (told === undefined || !sameParticipant(told.reader, me)) return 'read'
  const pair = lists.agentPairs[0] as [ParticipantRef, ParticipantRef]
  const pairKey = `${keyOf(pair[0])}|${keyOf(pair[1])}`
  const at = reply.conversations.findIndex((one) => `${keyOf(one.between[0])}|${keyOf(one.between[1])}` === pairKey)
  const held = reply.conversations[at]
  // A CONVERSATION THIS PAGE HAS NEVER HELD: how much of it is new is counted over messages it does not hold.
  if (held === undefined) return 'read'
  if (held.last.id === entry.id) return reply
  const adds = told.betweenAgents.find((one) => `${keyOf(one.between[0])}|${keyOf(one.between[1])}` === pairKey)
  if (adds === undefined) return 'read'
  const moved = aBetweenAgentsRowForThePage({
    between: held.between,
    last: entry,
    newSince: held.newSince + adds.newSince,
    anythingNew: held.anythingNew || adds.anythingNew,
    projects: theProjectsWithANewerMessage(held.projects, entry),
  })
  return { ...reply, conversations: [moved, ...reply.conversations.filter((_, i) => i !== at)] }
}

/** The open conversation with one participant, with the message added when it is in it. */
function talkWithANewMessage(talk: ConversationReply, lists: WhatANewMessageChanges): ConversationReply | 'read' {
  const entry = lists.entry as unknown as PoolEntry
  if (lists.pairs === null) {
    // A LINE MOLE OFFICE WROTE may be in this conversation through the message it is about, which is a
    // rule over the whole pool. It is read when it reached either side.
    if (entry.toGroup !== null) {
      // A GROUP REPLY THAT NAMES THE PERSON ON THE OTHER SIDE is in this conversation too
      // (`aGroupReplyThatMentionsTheOtherSide`), which is a rule over the group's members; it is read
      // when one side wrote it and the other side is a person.
      const sender = entry.sentBy
      if (sender === null) return talk
      const other = sameParticipant(sender, talk.me) ? talk.them : sameParticipant(sender, talk.them) ? talk.me : null
      return other !== null && other.kind === 'person' ? 'read' : talk
    }
    const touches = [talk.me, talk.them].some((side) => entry.to.some((to) => sameParticipant(to, side)))
    return touches ? 'read' : talk
  }
  const key = [keyOf(talk.me), keyOf(talk.them)].sort().join('|')
  if (!lists.pairs.some(([a, b]) => [keyOf(a), keyOf(b)].sort().join('|') === key)) return talk
  if (talk.messages.some((one) => one.id === entry.id)) return talk
  if (!lists.fresh) return 'read'
  return { ...talk, messages: [...talk.messages, entry] }
}

/** The groups, with a message to one of them counted for this reader; and the open group with it added. */
function groupsWithANewMessage(
  held: HeldLists,
  lists: WhatANewMessageChanges,
  me: ParticipantRef,
): { groups: ShortGroupsReply | null; contacts: ContactListHeld | null; theGroup: OneGroupReply | null; reads: ChatList[] } {
  const entry = lists.entry as unknown as PoolEntry
  const out = { groups: held.groups, contacts: held.contacts, theGroup: held.theGroup, reads: [] as ChatList[] }
  const groupId = entry.toGroup
  if (groupId === null) return out
  if (!lists.fresh) return { ...out, reads: ['groups', 'contacts', 'theOpenConversation'] }
  const counts = countsFor(lists, me)
  if (held.theGroup !== null && held.theGroup.group.id === groupId && !held.theGroup.messages.some((one) => one.id === entry.id)) {
    out.theGroup = {
      ...held.theGroup,
      messages: [...held.theGroup.messages, entry],
      unread: held.theGroup.unread + counts.unread,
      anythingUnread: held.theGroup.anythingUnread || counts.anythingUnread,
    }
  }
  // A MESSAGE THAT COUNTS FOR NOTHING CAN STILL MARK THE ROW WITH A PROJECT, so the row is
  // moved for either. A row whose projects it leaves as they were and whose counts it does not move is left alone.
  const groupRow = held.groups?.groups.find((one) => one.id === groupId)
  const projectsMove =
    groupRow !== undefined && theProjectsWithANewerMessage(groupRow.projects, entry).join('\n') !== groupRow.projects.join('\n')
  if (counts.unread === 0 && !counts.anythingUnread && !projectsMove) return out
  if (held.groups === null) return { ...out, reads: ['groups', 'contacts'] }
  const at = held.groups.groups.findIndex((one) => one.id === groupId)
  const row = held.groups.groups[at]
  if (row === undefined) return { ...out, reads: ['groups', 'contacts'] }
  // HEARD ALREADY is not something a group row can say: it carries no last line. The open group can,
  // so a message the open group already holds is not counted a second time.
  if (held.theGroup !== null && held.theGroup.group.id === groupId && out.theGroup === held.theGroup) return out
  // BUILT BY THE SAME FUNCTION THE DOOR CUTS ITS ROWS WITH (`aGroupRowForThePage`).
  const next = aGroupRowForThePage({
    ...row,
    unread: row.unread + counts.unread,
    anythingUnread: row.anythingUnread || counts.anythingUnread,
    projects: theProjectsWithANewerMessage(row.projects, entry),
  })
  out.groups = { ...held.groups, groups: held.groups.groups.map((one, i) => (i === at ? next : one)) }
  // THE SECOND HALF OF THE CIRCLE is how many of the reader's groups hold anything unread, one per group.
  if (held.contacts !== null && held.groups.yours.includes(groupId) && row.unread === 0 && next.unread > 0) {
    out.contacts = { ...held.contacts, unread: { ...held.contacts.unread, groups: held.contacts.unread.groups + 1 } }
  }
  return out
}

// ============================================================ one event, every list

/** Everybody a message names who is not in the names this page holds. */
function namesNobodyHere(who: { people: readonly Pick<ParticipantForThePage, 'id'>[]; agents: readonly Pick<ParticipantForThePage, 'id'>[] } | null, named: readonly (ParticipantRef | null)[]): ParticipantRef[] {
  if (who === null) return []
  const known = new Set([
    ...who.people.map((one) => keyOf({ kind: 'person', id: one.id })),
    ...who.agents.map((one) => keyOf({ kind: 'agent', id: one.id })),
  ])
  const out = new Map<string, ParticipantRef>()
  for (const one of named) {
    if (one === null) continue
    const key = keyOf(one)
    if (!known.has(key)) out.set(key, one)
  }
  return [...out.values()]
}

/** Put one participant read by itself into the names this page holds. */
export function namesWithOne(who: ParticipantsForThePageReply, one: ParticipantForThePage): ParticipantsForThePageReply {
  // A profile update keeps the same page fields as the cached list.
  const row = aParticipantRowForThePage(one)
  const side = row.kind === 'person' ? 'people' : 'agents'
  // IN THE ORDER THE REGISTRY IS LISTED IN, which is by handle (`listParticipants` reads `ORDER BY
  // handle`). A handle that changed moves the row.
  const rest = who[side].filter((held) => held.id !== row.id)
  const at = rest.findIndex((held) => held.handle > row.handle)
  const next = at < 0 ? [...rest, row] : [...rest.slice(0, at), row, ...rest.slice(at)]
  return { ...who, [side]: next }
}

/** Put one participant's presence reading into the list this page holds. */
export function presenceWithOne(list: readonly PresenceOnTheWire[], reading: PresenceOnTheWire): PresenceOnTheWire[] {
  const at = list.findIndex((one) => sameParticipant(one.who, reading.who))
  return at < 0 ? [...list, reading] : list.map((one, i) => (i === at ? reading : one))
}

/**
 * WHETHER A DOT JUST READ MOVES A ROW OF THE CONTACTS THE PAGE HOLDS (wave 13y round 91, item 22). The rows that are
 * online come first in each group, and only the server can say where a row goes, so the page reads the contacts again
 * when this is true. It is true when a row the page holds now says the other thing than the dot, and when the dot of a
 * contact whose row the page does not hold says online while rows of the list are left to read, since that row may now
 * belong among the rows held. A page that holds no contacts reads nothing for a dot.
 */
export function aDotMovesAContactRow(contacts: ContactListHeld | null, reading: Pick<PresenceOnTheWire, 'who' | 'colour' | 'word'>): boolean {
  if (contacts === null) return false
  const online = aDotSaysOnline(reading)
  const row = contacts.contacts.find((one) => one.who !== null && sameParticipant(one.who, reading.who))
  if (row !== undefined) return row.online !== online
  return online && contacts.left > 0
}

/**
 * APPLY ONE EVENT TO EVERY LIST THE CHAT HOLDS, for a reader who is `me` with `open` on screen.
 *
 * `me` null means the page does not know who is reading yet (its first contacts read has not
 * answered). Nothing can be applied for such a reader, so it asks for what the event could change as
 * the mapping in chatlists.ts says, and the four lists about the reader.
 *
 * `project` is the project the page's stream watches, which is the project a presence reading on the
 * event was taken in; `talkProject` is the project the open conversation was read in.
 */
export function applyAnEvent(
  held: HeldLists,
  event: ChannelEvent,
  me: ParticipantRef | null,
  open: TheOpenOne,
  where: { project: string; talkProject: string; panelOpen: boolean },
): Applied {
  const out: Applied = {
    held,
    reads: new Set(),
    readPresenceOf: [],
    readParticipants: [],
    markDelivered: [],
    touched: new Set(),
  }
  const asBefore = (): Applied => {
    for (const one of listsAnEventChanges(event, me, open)) out.reads.add(one)
    if (me === null && event.name !== 'presence.changed') for (const one of ['contacts', 'groups'] as const) out.reads.add(one)
    return finish()
  }
  const finish = (): Applied => {
    // THE TWO POOLS OF WHAT IS WAITING FOR THE READER ARE THEIR OWN PANELS' (Forced and Leading).
    out.reads.delete('forced')
    out.reads.delete('waitingForMe')
    for (const one of out.reads) out.touched.add(one)
    return out
  }
  const next = (change: Partial<HeldLists>, lists: ChatList[]): void => {
    out.held = { ...out.held, ...change }
    for (const one of lists) out.touched.add(one)
  }
  function theCircleAlone(): Applied {
    if (event.name === 'presence.changed' || event.name === 'answering.changed' || event.name === 'comment.placed' || event.name === 'comment.replied' || event.name === 'lead.offered') {
      return out
    }
    if (event.name === 'list.changed') {
      // THE NAMES are read only as far as the closed button draws them, which the reads decide.
      for (const one of event.lists) if (one === 'participants' || one === 'contacts' || one === 'groups') out.reads.add(one)
      return finish()
    }
    const circle = held.circle
    if (me === null || circle === null) return asBefore()
    if (event.name === 'delivery.changed') {
      // A MARK REACHING `seen` ON A MESSAGE TO THIS READER lowers the circle by an amount the event
      // does not carry (see the open panel's rule below). No other mark moves it.
      if (event.mark === 'seen' && sameParticipant(event.to, me)) out.reads.add('contacts')
      return finish()
    }
    if (event.name !== 'message.new') return asBefore()
    const lists = event.lists
    if (lists === undefined || lists === null || !lists.fresh) return asBefore()
    const counts = countsFor(lists, me)
    const entry = lists.entry as unknown as PoolEntry
    if (entry.toGroup !== null) {
      // THE GROUPS HALF counts groups holding anything unread, one per group, and whether this group
      // held something unread already is not on the circle. So it is read.
      if (counts.unread > 0) out.reads.add('groups')
      return finish()
    }
    // THE MESSAGES HALF is the sum of the contact rows' unread counts, and a message that is not to a
    // group is on exactly one of this reader's rows, where it adds what the server counted for them.
    if (counts.unread > 0) {
      out.held = { ...out.held, circle: { ...circle, unread: { ...circle.unread, messages: circle.unread.messages + counts.unread } } }
      out.touched.add('contacts')
    }
    return finish()
  }

  /*
   * A CLOSED PANEL DRAWS THE CIRCLE AND NOTHING ELSE (option 2 of a decision), and it reads every
   * list afresh when it opens. So while it is closed an event moves only the
   * circle, and the lists it may still hold from the last time it was open are left alone: changing
   * them would feed a count worked out from old rows back into the circle. Where the event carries
   * what the circle needs, the circle moves by it; where it does not, the circle is read (the closed
   * branch of the reads in Chat.tsx reads GET /api/messages/circle for `contacts` and `groups`).
   */
  // A RECORD STORED AGAIN CHANGES NO LIST OF THE CHAT'S, open or closed (listsAnEventChanges in chatlists.ts).
  if (event.name === 'record.changed') return out
  if (!where.panelOpen) return theCircleAlone()

  if (event.name === 'list.changed') {
    // ONE PARTICIPANT'S REGISTRY ROW CHANGED: that one is read, with their presence, and not the whole
    // registry. Every other list the write named is read.
    const one = event.participant ?? null
    asBefore()
    if (one !== null && out.reads.has('participants')) {
      out.reads.delete('participants')
      out.readParticipants.push(one)
      out.readPresenceOf.push(one)
      out.touched.add('participants')
      out.touched.add('presence')
    }
    return out
  }
  if (event.name === 'comment.placed' || event.name === 'comment.replied' || event.name === 'lead.offered') return asBefore()

  // WHO IS ANSWERING AS THE OPEN AGENT CHANGED: its conversation is read, which carries the answering and the dot
  // together. The event names the project it was read in, which is the one this page's stream watches; the open
  // conversation is read in its own project, so a conversation read in another one is read too, as a hold is the
  // agent's in every project.
  if (event.name === 'answering.changed') {
    for (const one of listsAnEventChanges(event, me, open)) out.reads.add(one)
    return finish()
  }

  if (event.name === 'presence.changed') {
    const reading = event.reading as unknown as PresenceOnTheWire | undefined
    if (reading === undefined) {
      out.readPresenceOf.push(event.who)
      out.touched.add('presence')
      return finish()
    }
    if (held.presence !== null) next({ presence: presenceWithOne(held.presence, reading) }, ['presence'])
    // A DOT THAT MOVES A CONTACT ROW reads the contacts again, since the rows that are online come first.
    if (aDotMovesAContactRow(held.contacts, reading)) out.reads.add('contacts')
    // THE OPEN AGENT'S DOT is the same reading when the conversation was read in the project the
    // stream watches. Read in another project, it is read again with the conversation.
    if (open !== null && open.what === 'contact' && sameParticipant(open.them, event.who)) {
      if (where.talkProject === where.project) next({ talkPresence: reading }, ['theOpenConversation'])
      else out.reads.add('theOpenConversation')
    }
    return finish()
  }

  if (me === null) return asBefore()

  if (event.name === 'delivery.changed') {
    const rows = event.rows
    if (rows === undefined || rows === null) return asBefore()
    const change: Partial<HeldLists> = {}
    // THE CONTACTS AND THE CONVERSATIONS BETWEEN AGENTS ARE HELD AS SHORT ROWS, whose last line carries
    // no delivery rows, so a mark moves nothing there.
    change.talk = everyEntryWithRows(held.talk, rows)
    change.theGroup = everyEntryWithRows(held.theGroup, rows)
    change.unregistered = everyEntryWithRows(held.unregistered, rows)
    next(change, ['contacts', 'theOpenConversation'])
    /*
     * A MARK REACHING `seen` ON A MESSAGE TO THIS READER moves the unread counts: the contact row's,
     * the group's and the circle's. Those count over every message of a conversation, most of which
     * this page does not hold. It happens whenever this reader opens a conversation, in this tab or
     * another one.
     *
     * THE SERVER SAYS WHERE IT LEAVES THE CONTACT ROWS (`seenLeaves`), for a message that is in no group: each row's
     * counts now. A group's count is not moved by such a message. The circle falls by what the rows this page holds
     * fell by, so an event applied to rows a read has already brought up to date moves nothing. Where the server could
     * not say, or a row is one this page does not hold, the lists are read.
     */
    if (event.mark === 'seen' && sameParticipant(event.to, me)) {
      const leaves = event.seenLeaves ?? null
      const lines = out.held.contacts
      const by = new Map((leaves ?? []).map((one) => [one.key, one]))
      if (lines !== null && leaves !== null && leaves.every((one) => lines.contacts.some((row) => row.key === one.key))) {
        let fell = 0
        const rows = lines.contacts.map((row) => {
          const left = by.get(row.key)
          if (left === undefined) return row
          fell += row.unread - left.unread
          return { ...row, unread: left.unread, anythingUnread: left.anythingUnread }
        })
        if (leaves.length > 0) next({ contacts: { ...lines, contacts: rows, unread: { ...lines.unread, messages: lines.unread.messages - fell } } }, ['contacts'])
      } else {
        out.reads.add('contacts')
        out.reads.add('groups')
        if (open !== null && open.what === 'group') out.reads.add('theOpenConversation')
      }
    }
    return finish()
  }

  // A NEW MESSAGE.
  if (event.name !== 'message.new') return asBefore()
  const lists = event.lists
  if (lists === undefined || lists === null) return asBefore()
  const entry = lists.entry as unknown as PoolEntry
  const named = [event.sentBy, ...event.to, entry.sentBy, ...entry.to]
  out.readParticipants.push(...namesNobodyHere(held.who, named))
  // A PARTICIPANT WHOSE PRESENCE THIS PAGE HAS NEVER HELD, whether or not it holds their name (the
  // names may have been read when they registered), has their presence read by itself. Mole Office
  // itself writes lines and has a presence reading like anybody else.
  if (held.presence !== null) {
    const asked = new Set<string>()
    for (const one of named) {
      if (one === null || asked.has(keyOf(one))) continue
      asked.add(keyOf(one))
      if (!held.presence.some((p) => sameParticipant(p.who, one))) out.readPresenceOf.push(one)
    }
  }
  if (out.readParticipants.length > 0) out.touched.add('participants')

  if (held.contacts !== null) {
    const moved = contactsWithANewMessage(held.contacts, lists)
    if (moved === 'read') out.reads.add('contacts')
    else if (moved !== held.contacts) next({ contacts: moved }, ['contacts'])
  }
  if (held.between !== null) {
    const moved = betweenWithANewMessage(held.between, lists, me)
    if (moved === 'read') out.reads.add('betweenAgents')
    else if (moved !== held.between) next({ between: moved }, ['betweenAgents'])
  }
  const grouped = groupsWithANewMessage(out.held, lists, me)
  for (const one of grouped.reads) out.reads.add(one)
  if (grouped.groups !== out.held.groups) next({ groups: grouped.groups }, ['groups'])
  if (grouped.contacts !== out.held.contacts) next({ contacts: grouped.contacts }, ['contacts'])
  if (grouped.theGroup !== out.held.theGroup) next({ theGroup: grouped.theGroup }, ['theOpenConversation'])
  if (held.talk !== null && open !== null && open.what === 'contact') {
    const moved = talkWithANewMessage(held.talk, lists)
    if (moved === 'read') out.reads.add('theOpenConversation')
    else if (moved !== held.talk) {
      next({ talk: moved }, ['theOpenConversation'])
      const mine = entry.deliveries.find((d) => sameParticipant(d.to, moved.me))
      if (mine !== undefined && mine.mark === 'queued') out.markDelivered.push(entry.id)
    }
  }
  // A MESSAGE FROM A WRITER NOBODY REGISTERED, while that writer's conversation is open: which writer
  // it is, is a rule over the typed name that only the server holds.
  if (open !== null && open.what === 'unregistered' && entry.sentBy === null) out.reads.add('theOpenConversation')
  return finish()
}
