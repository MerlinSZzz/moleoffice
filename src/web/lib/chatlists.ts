// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH OF THE CHAT'S LISTS ONE EVENT CAN CHANGE, AND HOW THE THREE PANELS READ THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 11 September 2026 against a copy of the owner's database, three browser windows on an address
 * the app does not know — the quietest page that still mounts the chat, 0 API requests in ten quiet
 * seconds: ONE server event cost 11 requests per window, 12 with a conversation open. Nine events
 * inside 85 milliseconds cost 99 per window. The owner's office froze with the chat open in several windows.
 *
 * THREE THINGS PRODUCED THAT NUMBER, and this file answers all three.
 *
 * 1. `Chat.tsx` acted on five of the six event names by reading all six of its lists. It had no name
 *    filter at all: a mark moving on somebody else's message read the registries, the presence, the
 *    contacts, the conversations between agents, the groups and the list of projects.
 * 2. Nothing was coalesced. A run writing nine progress notes in a second announced nine events and
 *    every one of them was read separately.
 * 3. `Chat`, `Forced` and `Leading` are all mounted on every page and each read the registries for
 *    itself — three identical requests for one event — and `Chat` and `Leading` each read the
 *    contacts.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE FOR NARROWING, BECAUSE A WRONG NARROWING HERE IS SILENT
 * ---------------------------------------------------------------------------------------
 *
 * A list that stops being read when it should be read does not fail: the chat simply stops moving,
 * and nothing on the screen says so. So every line below narrows by a NECESSARY condition — one that
 * must hold for the list to have changed — and never by a sufficient one. Where the necessary
 * condition is cheap and exact, the list is skipped; where working it out would mean answering in the
 * browser a question the server already answers, the list is read and the comment says which question
 * and why. `tests/the-chat-asks-for-the-list-an-event-names.test.ts` names the event that must still
 * read each list, so a narrowing that goes too far goes red there.
 *
 * THE ONE PLACE THIS FILE IS DELIBERATELY WIDER THAN THE SCREEN NEEDS: a list is read when the event
 * MIGHT have changed it and the browser cannot tell for sure. Reading one list once too often costs
 * one request inside a coalesced burst. Missing one costs a badge that never falls and nobody can
 * see why.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { ChannelEvent } from '@shared/events.ts'
import { sameParticipant } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'

// ============================================================ which list an event can change

/**
 * The lists the chat panel, the offers pane and the emergency dialogue draw between them.
 *
 * One name per request the three panels make. They are named after what a reader sees rather than
 * after the route that answers, because a route may be renamed and this list is about the screen.
 */
export type ChatList =
  /** Everybody registered, which is where every NAME on every one of these screens comes from. */
  | 'participants'
  /** Who is online, and the colour of the dot beside them. */
  | 'presence'
  /** The conversation rows, their unread counts and the number on the circle. */
  | 'contacts'
  /** The conversations between two agents, and how much has been written since the reader looked. */
  | 'betweenAgents'
  /** The groups, and how much is unread in each. */
  | 'groups'
  /** What each project is called, for the mark saying which project a message was written in. */
  | 'projects'
  /** The emergencies waiting for this reader. `Forced.tsx`. */
  | 'forced'
  /** What is waiting for this reader, which is where an offer to lead them comes from. `Leading.tsx`. */
  | 'waitingForMe'
  /** The conversation the reader has open in the panel. */
  | 'theOpenConversation'

/**
 * WHICH CONVERSATION THE PANEL HAS OPEN, as the mapping needs to know it.
 *
 * A conversation between two agents is left out on purpose, and that is a READ of today's behaviour
 * and not a guess: the between-agents view is read when the reader opens it and not again while it
 * stays open — its effect re-runs when `reading` changes and on nothing else. An event refetching
 * that view would be a NEW behaviour, and this file narrows; it does not add.
 */
export type TheOpenOne =
  | { what: 'contact'; them: ParticipantRef }
  | { what: 'group'; id: string }
  | { what: 'unregistered' }
  | null

/** Everybody this event is about: who it came from and who it was addressed to. */
function everybodyThisEventIsAbout(event: ChannelEvent): readonly ParticipantRef[] {
  switch (event.name) {
    case 'delivery.changed':
      return [event.to]
    case 'message.new':
    case 'comment.placed':
    case 'comment.replied':
    case 'lead.offered':
      return event.sentBy === null ? event.to : [event.sentBy, ...event.to]
    case 'presence.changed':
      return [event.who]
    case 'list.changed':
      return event.about === null ? [] : [event.about]
    case 'machine.changed':
      return []
    case 'answering.changed':
      return [event.who]
    case 'record.changed':
      return []
  }
}

/** True when this participant is one of the people the event is about. */
function isAParty(who: ParticipantRef | null, event: ChannelEvent): boolean {
  if (who === null) return false
  return everybodyThisEventIsAbout(event).some((one) => sameParticipant(one, who))
}

/**
 * True when this participant is among the people the event was ADDRESSED to.
 *
 * The two pools of what is waiting for the reader — the emergencies and the offers — hold messages
 * ADDRESSED to them that they have not seen. A message the reader SENT cannot enter either pool, and
 * a mark moving on a message the reader sent is about somebody else's reading. So these two lists
 * narrow further than the party test: only a recipient can gain or lose an entry.
 */
function isARecipient(who: ParticipantRef | null, event: ChannelEvent): boolean {
  if (who === null) return false
  if (event.name === 'delivery.changed') return sameParticipant(event.to, who)
  if (event.name === 'presence.changed' || event.name === 'list.changed' || event.name === 'machine.changed' || event.name === 'answering.changed' || event.name === 'record.changed') return false
  return event.to.some((one) => sameParticipant(one, who))
}

/**
 * WHICH LISTS THIS EVENT CAN CHANGE, for a reader who is `me` with `open`'s conversation on screen.
 *
 * `me` null means the page's reader answers to no registry row — OR that the contacts have not been
 * read yet, which is the first moment of every page's life and cannot be told apart from it here.
 * The CALLER tells the two apart: Chat holds the contacts and knows whether it has read them. The
 * pure answer below treats a null reader the only way it can afford to: as one the waiting-for-me
 * lists cannot be about, because nothing is addressed to a reader nobody registered. The first
 * contacts read happens on mount, so the gap is the moment a page is still opening.
 *
 * Written as a plain function with no browser in it so that
 * `tests/the-chat-asks-for-the-list-an-event-names.test.ts` can name, for each list, the event that
 * must still read it.
 */
export function listsAnEventChanges(
  event: ChannelEvent,
  me: ParticipantRef | null,
  open: TheOpenOne,
): ReadonlySet<ChatList> {
  const out = new Set<ChatList>()

  /*
   * NOTHING HERE READS `projects`. The list of projects changes when somebody makes or renames one,
   * and no event says that has happened. It is read when the panel mounts and when the reader comes
   * back to the tab, which is what it always was.
   */

  if (event.name === 'list.changed') {
    /*
     * A WRITE NAMED THE LISTS IT CHANGED, so exactly those are read. The open conversation is read only
     * when something is open, and a group view only when the event is about that group or names the
     * open conversation outright (a message deleted or brought back, which may have been in any of
     * them). A message leaving the lists may also leave the two pools of what is waiting for the
     * reader, so those are read with it.
     */
    for (const one of event.lists) {
      // WHAT WAITS ON THE PERSON IS NOT ONE OF THE CHAT'S LISTS. The shell reads it again (App.tsx).
      if (one === 'needsYou') continue
      // NOR ARE THE VISITS. The Embassy reads them again (src/web/pages/EmbassyPage.tsx).
      if (one === 'visits') continue
      // NOR IS WHERE THE TERMINAL HOLDER STANDS. Terminal management reads it again (src/web/pages/TerminalsPage.tsx).
      if (one === 'terminals') continue
      if (one === 'theOpenConversation') {
        if (open !== null) out.add('theOpenConversation')
        out.add('forced')
        out.add('waitingForMe')
      } else {
        out.add(one)
      }
    }
    if (open !== null && open.what === 'group' && event.groupId === open.id) out.add('theOpenConversation')
    return out
  }

  if (event.name === 'answering.changed') {
    /*
     * WHO IS ANSWERING AS AN AGENT CHANGED, and only the open conversation with that agent draws it: the Cannot reach
     * notice and the header's label. No list does.
     */
    if (open !== null && open.what === 'contact' && sameParticipant(open.them, event.who)) out.add('theOpenConversation')
    return out
  }

  if (event.name === 'record.changed') {
    /*
     * A RECORD WAS STORED AGAIN, and no list the chat draws is a list of records. Messages are records too,
     * but they are never announced this way: they have events of their own. A page that shows the record
     * follows it itself (src/web/lib/record-changes.ts).
     */
    return out
  }

  if (event.name === 'presence.changed') {
    /*
     * A DOT CHANGED COLOUR AND NOTHING ELSE DID. The event is announced when a page opens and when
     * one closes — src/server/api/events.ts, either side of the connection joining and leaving the
     * list. The state LINE an agent carries is written through another door and announces nothing at
     * all, so reading the registries here would not be reading them when they change: it would be
     * reading them on an unrelated event.
     */
    out.add('presence')
    return out
  }

  /*
   * FROM HERE ON A MESSAGE IS INVOLVED, and `participants` is read for every event but a mark moving.
   *
   * The reason is the name. A contact row, an offer and an emergency each draw who wrote the thing,
   * and the only place a NAME lives is the registries — `ContactLineOnTheWire` carries a `who` and no
   * name at all. A message may be the first this page has heard of a writer that registered after it
   * loaded, and without this read all three panels would draw that writer's id. An id where a name
   * belongs is what `tests/the-machine-word-gate.test.ts` exists to stop.
   *
   * IT IS NOT READ ON `delivery.changed`. A mark moving cannot introduce anybody: the message it is
   * about was announced as `message.new` when it was written, and that is where a new writer arrives.
   */
  if (event.name !== 'delivery.changed') out.add('participants')

  /*
   * AND THE CONVERSATIONS BETWEEN TWO AGENTS, ON EVERY NEW MESSAGE. THIS IS THE ONE PLACE THAT READS
   * A LIST IT CANNOT PROVE HAS CHANGED, and the reason is worth stating rather than hiding.
   *
   * The grey number on the Between agents tab is how much has been written in each of those
   * conversations since the reader last opened it, counted across every project
   * (`conversationsBetweenAgents(EVERY_PROJECT, me)` in src/server/api/messages.ts). Whether one new
   * message belongs to one of those conversations is `conversationBetween`'s answer, worked out on
   * the server from who is registered as an agent. Working it out here from the event's `sentBy` and
   * `to` would be the same fact answered in two places, which is this repository's own recurring
   * defect, and the half that went wrong would be silent — a grey bubble that stopped moving.
   *
   * It costs one request per burst of events, because the reads below are coalesced.
   *
   * A MARK MOVING NEVER CHANGES IT, and that is not a guess: the reply's own words say so — *nothing
   * in a conversation between two agents is addressed to the person reading it, so there are no
   * delivery marks of theirs to move* (`BetweenAgentsReply` in src/web/api.ts).
   */
  if (event.name !== 'delivery.changed') out.add('betweenAgents')

  /*
   * THE FOUR LISTS THAT ARE ABOUT WHAT IS WAITING FOR THIS READER.
   *
   * Every one of them counts rows that are ADDRESSED to this reader and not marked seen:
   *   - the contact rows' unread counts and the number on the circle — `unreadAmong(between, me)`
   *   - each group's unread count — `unreadInAGroup(id, me, …)`
   *   - the emergencies waiting — messages addressed to this reader and not marked seen
   *   - what is waiting for this reader, which is where an offer to lead comes from
   *
   * So a NEW MESSAGE changes them only when this reader is a party to it: the sender's own contact
   * row's last line moves, and a message addressed to this reader can enter the pools. A mark moving
   * during an agent run — which is most of what the channel carries, one per progress note — moves
   * none of them, because a mark that is not `seen` leaves every "not seen" count where it was.
   *
   * A MARK REACHING `seen` ON A MESSAGE ADDRESSED TO THIS READER is the one mark that can: the
   * message leaves every one of those four lists at once. That is how the badge falls on every other
   * window this person has open when one window reads a conversation. The event says `seen` and the
   * browser believes it; a progress note that rides along on a row already marked seen also says
   * `seen` and changes nothing, and that one-request-too-often is the price of not asking the server
   * which door announced it — a question the event does not carry the answer to.
   */
  if (event.name === 'delivery.changed') {
    if (event.mark === 'seen' && isARecipient(me, event)) {
      out.add('contacts')
      out.add('groups')
      out.add('forced')
      out.add('waitingForMe')
    }
    // NOT NOW moves no mark and leaves every count where it was. It changes only the offers this person
    // is drawn, which come from what is waiting for them (row 65 of report rFBoQG6mAEI0).
    if (event.offerPutOff === true && isARecipient(me, event)) out.add('waitingForMe')
  } else if (isAParty(me, event)) {
    out.add('contacts')
    out.add('groups')
  }
  if (isARecipient(me, event) && event.name !== 'delivery.changed') {
    out.add('forced')
    out.add('waitingForMe')
  }

  /*
   * AND THE CONVERSATION ON SCREEN, when the event could be about a message in it.
   *
   * A CONTACT CONVERSATION is between the reader and `them`, so an event naming neither of them
   * cannot be about a message in it. That is a necessary condition and not a sufficient one: an
   * event naming `them` may be about some other conversation, and this reads the open one again for
   * nothing. Reading it once too often is one request; missing one is a conversation that stops
   * moving.
   *
   * A MARK MOVING FOR `them` IS THE CLOCK UNDER THE READER'S OWN MESSAGE BECOMING A TICK, which is
   * why this is not only about the reader's own marks. THE READER'S OWN MARK MOVING is the other
   * direction and changes nothing on screen: the mark the panel draws is under the reader's own
   * messages and names the OTHER side's mark (`mine && theirMark` in Chat.tsx), so a mark moving for
   * the reader is not drawn anywhere in the conversation they are reading.
   *
   * A GROUP VIEW is drawn from one group's conversation, and the event cannot name a group: a message
   * to a group announces one recipient per member and no group at all (`to` IS LEFT OUT ON A GROUP
   * MESSAGE — the rows are the only copy, records.ts). So while a group is open, any new message in
   * this project could be one of its messages. One read per burst.
   *
   * THE WRITER NOBODY REGISTERED is named by no registry row, so a message from one arrives with
   * `sentBy` null — which is also how a system line arrives. While such a writer's conversation is
   * open, a `message.new` naming nobody could be from them.
   */
  if (open !== null) {
    // At this point the event is one of the four message events: `presence.changed` returned above
    // and the `delivery.changed` lists were settled before this block.
    if (open.what === 'contact' && isAParty(open.them, event)) {
      out.add('theOpenConversation')
    } else if (open.what === 'group') {
      out.add('theOpenConversation')
    } else if (open.what === 'unregistered' && event.name === 'message.new' && event.sentBy === null) {
      out.add('theOpenConversation')
    }
  }

  return out
}

// ============================================================ one read per burst, shared by all three

/**
 * Gather the lists named by a burst of events, and hand the union to `act` once, a quarter of a
 * second after the last call.
 *
 * Two events inside one burst name two sets of lists; one read happens, and it covers both. This is
 * why the caller passes the set and not a flag: a single `act` with no argument would read whatever
 * the LAST event named and quietly drop the first event's lists.
 *
 * IT IS A TRAILING EDGE AND NOT A LEADING ONE. The read has to carry what the LAST event in the burst
 * changed, so it runs after the burst rather than at the start of it. A quarter of a second is under
 * what a person notices and well over the gap between two events from one run.
 */
export const BURST_MS = 250

export interface TheBurstReader {
  add: (lists: ReadonlySet<ChatList>) => void
  /** Stop the timer without reading. For a panel that has gone away. */
  stop: () => void
}

export function makeTheBurstReader(act: (lists: ReadonlySet<ChatList>) => void, ms: number = BURST_MS): TheBurstReader {
  let timer: ReturnType<typeof setTimeout> | null = null
  const waiting = new Set<ChatList>()
  return {
    add(lists) {
      for (const one of lists) waiting.add(one)
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        const toRead = new Set(waiting)
        waiting.clear()
        act(toRead)
      }, ms)
    },
    stop() {
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}

/**
 * The same gathering as a React hook, for a component's channel handler.
 *
 * The timer is stopped when the component goes, so a panel that has been unmounted does not read
 * anything and does not set state on a component that is no longer there.
 */
export function useAfterTheBurst(
  act: (lists: ReadonlySet<ChatList>) => void,
  ms: number = BURST_MS,
): (lists: ReadonlySet<ChatList>) => void {
  const held = useRef<TheBurstReader | null>(null)
  const latest = useRef(act)
  latest.current = act
  useEffect(
    () => () => {
      held.current?.stop()
    },
    [],
  )
  return useCallback(
    (lists: ReadonlySet<ChatList>) => {
      if (held.current === null) held.current = makeTheBurstReader((lists) => latest.current(lists), ms)
      held.current.add(lists)
    },
    [ms],
  )
}

/**
 * ONE READ OF ONE DOOR, HOWEVER MANY PANELS ASK FOR IT.
 *
 * `Chat`, `Forced` and `Leading` are all mounted on every page, and all three want the registries.
 * Before the shared reads, one event was three identical requests and one page load was three more.
 * These are the reads from `src/web/lib/oneread.ts`, which holds one answer for the project on
 * screen — the same idea `src/web/lib/titles.ts` uses for record titles, for the same reason.
 *
 * A CALLER THAT HAS JUST WRITTEN SOMETHING ASKS AGAIN WITH `.again()`. `()` is for drawing:
 * it returns the answer this page already has, or starts the one read if there is none yet. The
 * event paths in `Chat`, `Forced` and `Leading` call `.again()`, and because a burst of events is
 * coalesced and concurrent `.again()` calls join, one event still costs one request.
 */
export { readParticipantsOnce as readTheParticipantsOnce } from './oneread.ts'

/**
 * WHO THIS PAGE'S READER IS, as far as the panels know, and whether anybody has looked yet.
 *
 * `me` comes out of the contacts reply (`ContactsReply.me`), which Chat and Leading read between
 * them. `Forced` needs the same answer and reads no contacts of its own, so it reads it here: a fact
 * with one source, set by whichever panel read the contacts last, and read by the panel that did not.
 *
 * NOT KNOWN YET is not null. Null means the contacts were read and this page's reader answers to no
 * registry row — an honest answer, and one that lets a panel skip the waiting-for-me lists. Not known
 * yet means no panel has read the contacts since this page opened, so nobody can say who is reading.
 * A panel that treats that as null would skip a read it could not prove it may skip, so the caller
 * treats it as a party: reading one pool once too often at page-open costs one request; missing one
 * emergency costs the dialogue the brief warns about.
 */
let theReader: ParticipantRef | null | 'notKnownYet' = 'notKnownYet'

/** Say who this page's reader is, from a contacts reply just read. Call it from every contacts read. */
export function theReaderIs(me: ParticipantRef | null): void {
  theReader = me
}

/** Who is reading, or 'notKnownYet' while no contacts read has answered. */
export function whoIsReading(): ParticipantRef | null | 'notKnownYet' {
  return theReader
}

/**
 * Whether a `delivery.changed` that says `seen` really touches the entries this panel draws from.
 *
 * The mapping says such an event CAN touch the pools, because a message addressed to the reader that
 * becomes seen leaves them. The event names the messages. If none of them is an entry in what THIS
 * panel draws from, the screen did not change — and that check is exact, because an entry leaves
 * exactly when its message's mark reaches `seen`.
 *
 * THE ENTRIES ARE THE PANEL'S OWN CHOICE, and the two panels narrow by different ones. `Forced` holds
 * the emergencies, so an entry leaving is a dialogue going away: it checks its pool. `Leading` draws
 * only the OFFERS out of its pool, so a message with no lead leaving the pool changes nothing it
 * draws: it checks the offers, not the whole pool.
 *
 * This is the one narrowing that works from the panel's own state, which is why it lives beside the
 * panels rather than inside the pure mapping above.
 */
export function aSeenMarkTouchesThisPool(event: ChannelEvent, ids: readonly string[]): boolean {
  if (event.name !== 'delivery.changed') return true
  // AN OFFER PUT OFF WITH NOT NOW leaves the offers the same way, with no mark moving (row 65 of report
  // rFBoQG6mAEI0).
  if (event.mark !== 'seen' && event.offerPutOff !== true) return false
  return event.messageIds.some((one) => ids.includes(one))
}