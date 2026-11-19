// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHANNEL: ONE PLACE THAT KNOWS WHICH PAGES ARE OPEN AND WHAT TO TELL THEM.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS IN MEMORY, AND THAT IS THE WHOLE DESIGN
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here is stored. A page that is open is a request this process is holding, which cannot
 * outlive the process, so writing it down would leave rows describing connections that are gone.
 * When the server restarts every page reconnects and says where it got to.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A RECONNECTING PAGE GETS BACK, AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * The last `RING` events are kept, and a page that reconnects sends the id of the last one it saw.
 * Everything after that id is sent again. A page that was away longer than the ring is TOLD SO
 * rather than being handed the tail and left believing it saw everything: `missed` on the first
 * event says how many it cannot have, so the page can read the pool again instead of guessing.
 *
 * ---------------------------------------------------------------------------------------
 * WHO IS CONNECTED IS THE PRESENCE READING'S STRONGEST INPUT
 * ---------------------------------------------------------------------------------------
 *
 * A held connection cannot lie: while this process is holding a request open for somebody, somebody
 * is there. `src/server/lib/presence.ts` reads `whoIsConnected` for exactly that, which is why the
 * connection registry lives beside the channel rather than being a second list somewhere else.
 */

import { randomBytes } from 'node:crypto'
import { EVENTS_SENT_TODAY, type ChannelEvent, type EventName, type EventOnTheWire } from '@shared/events.ts'
import { participantKey, sameParticipant } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { nowStamp } from '@shared/time.ts'
import { eventRingSize } from './env.ts'
import { onlyChecking } from './only-checking.ts'
import { whenStored } from '../db/told-when-stored.ts'

// ============================================================================ which run this is

/**
 * THE ID OF THIS RUN OF THE SERVER, made once when the process starts.
 *
 * Event ids count from 1 again every time the server starts, so a page holding id 500 cannot tell
 * from the id alone whether it missed nothing or whether the server restarted and remembers nothing.
 * The stream says this id on its second line (`RUN_LINE` in src/shared/events.ts), and a page that
 * sees a different one reads its lists once.
 */
let run = aNewRunId()

function aNewRunId(): string {
  return randomBytes(6).toString('base64url')
}

/** The id of this run of the server. */
export function thisRun(): string {
  return run
}

// ============================================================================ the ring

/**
 * WHAT ONE OPEN PAGE IS TOLD OF AN EVENT, when that depends on who the page's reader is.
 *
 * A presence reading and the part of a new message that counts what is new to one reader both depend
 * on who is reading, so the server works them out for each open page as it sends. The ring keeps the
 * plain event and this function beside it, so a page that reconnects is told the same thing it would
 * have been streamed.
 */
export type TellOnePage = (page: { who: ParticipantRef | null; workspaceId: string }) => ChannelEvent

/** One remembered event, and how to tell it to one page when that depends on the page. */
interface Remembered extends EventOnTheWire {
  tell: TellOnePage | null
  /**
   * WHO THE MESSAGE THIS EVENT NAMES IS BETWEEN, or null when the event names no message. Kept beside
   * the event so a page that reconnects is given back only what it would have been streamed.
   */
  parties: ParticipantRef[] | null
  /** When it was announced, on this process's steady clock (`performance.now()`), in milliseconds. */
  at: number
}

/** Every event this process has sent, newest last, at most `eventRingSize()` of them. */
let ring: Remembered[] = []

/** The id of the last event sent. Counts from 1 and never repeats within one run. */
let lastId = 0

/** How many events have been dropped off the front of the ring since this process started. */
let dropped = 0

/** One page listening. */
interface Listener {
  id: number
  /** Which project the page is watching. An event about another project is not sent to it. */
  workspaceId: string
  /** Who has this page open, or null when the caller answers to no registry row. */
  who: ParticipantRef | null
  send: (one: EventOnTheWire) => void
  openedAt: string
  /** When this page last said it was still there. */
  heardFrom: number
  /**
   * The name the page gave its own connection, or null when it gave none.
   *
   * It is what lets a caller ask how many of ITS connections are open, rather than how many are open
   * on this machine. Null is not a fault: a page that names no connection is counted in the total
   * like any other, and is in nobody's per-tag count.
   */
  tag: string | null
  /**
   * HOW THE REQUEST THAT OPENED THIS PAGE PROVED WHO IT WAS: `the-person-key` for the person's own
   * key or a paired browser's cookie, another word for an agent's key, or null when it carried no key.
   * Counted by `channelState`, so a test can see that a page's stream carries the same proof as the
   * page's other requests.
   */
  proof: string | null
  /** When the page was counted as open, on the same steady clock as an event's `at`. */
  openedAtMs: number
  /** The id of the last event announced before the page was counted. Every later event may reach it. */
  lastIdBeforeIt: number
}

let listeners: Listener[] = []
let nextListener = 1

// ============================================================================ sending

/**
 * WHO IS TOLD OF AN EVENT. Decided here and nowhere else: `announce` and `since` both ask `reaches`.
 *
 * ---------------------------------------------------------------------------------------
 * AN EVENT ABOUT A MESSAGE REACHES ONLY THE MESSAGE'S PARTIES AND THE OWNER
 * ---------------------------------------------------------------------------------------
 *
 * Delivery already went by party. Each
 * addressee has its own queue and a waiter takes only its own. The live push did not. Until this
 * change a new message's whole body went to every open stream in every project, agents' streams
 * included (problem 9zgmnY3vBvCH). Now an event that names a message is sent only to:
 *
 *   - the pages of the message's PARTIES: its sender, everybody it was addressed or routed to, and for
 *     a message to a group every member of the group when it was sent (`thePartiesOf` in
 *     src/server/lib/messages.ts works the list out, and the caller hands it to `announce`);
 *   - the OWNER's pages, whoever the message is between, so a conversation between two agents the owner has
 *     open moves without a reload. The owner is the one person `THE_PERSON` names.
 *
 * Every other page is sent nothing about that message: not its words, not its id, not a count. A
 * person other than the owner is told as a party, like an agent.
 *
 * The events that name a message are `EVENTS_ABOUT_A_MESSAGE` below. A `list.changed` names one only
 * when a message was deleted or brought back, and its caller then hands the parties too.
 *
 * ---------------------------------------------------------------------------------------
 * AND THEN THE RULES OF PLACE, WHICH ARE OLDER
 * ---------------------------------------------------------------------------------------
 *
 * A page that may be told of an event is still told only where the event belongs:
 *
 *   - `message.new` reaches such a page in every project. Criterion M55: a conversation is the
 *     person's, whichever project is open.
 *   - `delivery.changed` reaches the pages of the participant whose mark moved, in every project, and
 *     the pages watching the message's project (the tick under a message the reader sent).
 *   - `list.changed` reaches the pages of the one participant it is about, in every project, or every
 *     page when it is about nobody in particular.
 *   - every other event reaches only the pages watching the project it names, and an event that names
 *     no project reaches every page.
 */
function reaches(
  one: { event: ChannelEvent; parties: readonly ParticipantRef[] | null },
  listener: { workspaceId: string; who: ParticipantRef | null },
): boolean {
  const event = one.event
  if (one.parties !== null) {
    // OLD OR EXPIRED MESSAGES: a rule about which of them are still pushed would go here, beside the
    // rule of who is a party. Those rules are left to be set later, so none is built.
    if (listener.who === null) return false
    if (!isTheOwner(listener.who) && !one.parties.some((party) => sameParticipant(party, listener.who as ParticipantRef))) {
      return false
    }
  }
  if (event.name === 'list.changed') {
    return event.about === null || (listener.who !== null && sameParticipant(listener.who, event.about))
  }
  if (event.name === 'delivery.changed') {
    return (listener.who !== null && sameParticipant(listener.who, event.to)) || event.workspaceId === listener.workspaceId
  }
  if (event.name === 'message.new') return true
  if (!('workspaceId' in event)) return true
  return event.workspaceId === listener.workspaceId
}

/** True when this reader is the owner: the one person `THE_PERSON` is, read when asked. */
function isTheOwner(who: ParticipantRef): boolean {
  return sameParticipant(who, { kind: 'person', id: THE_PERSON })
}

/**
 * THE EVENTS THAT NAME A MESSAGE, which are never announced without the message's parties.
 *
 * `comment.placed`, `comment.replied` and `lead.offered` are messages too: a comment is a message
 * about a place on a page, and an offer to lead somebody rides on a message.
 */
export const EVENTS_ABOUT_A_MESSAGE: ReadonlySet<ChannelEvent['name']> = new Set([
  'message.new',
  'delivery.changed',
  'comment.placed',
  'comment.replied',
  'lead.offered',
])

/** An event that names a message. */
type AnEventAboutAMessage = Extract<ChannelEvent, { name: 'message.new' | 'delivery.changed' | 'comment.placed' | 'comment.replied' | 'lead.offered' }>

/**
 * TELL EVERY OPEN PAGE THIS EVENT REACHES. The one door: nothing else writes to a connection.
 *
 * `parties` is who a message is between, from `thePartiesOf`. An event that names a message must
 * carry it, and one without it is refused with an error before anything is sent or remembered:
 * sending it to every page would be a broadcast, and that was ended. A `list.changed` may
 * carry it, and does when a message was deleted or brought back. Any other event carries none.
 *
 * A PAGE HEARS ONLY WHAT WAS STORED (wave 13n's round 39). Called inside a transaction, the event is
 * numbered, remembered and sent only when the outermost transaction commits, and never when it rolls
 * back (src/server/db/told-when-stored.ts). Outside a transaction it is sent at once. The check on the
 * parties is made at the call, so a write that leaves them out is refused in its own transaction.
 */
export function announce(event: AnEventAboutAMessage, tell: TellOnePage | null, parties: readonly ParticipantRef[]): void
export function announce(
  event: Exclude<ChannelEvent, AnEventAboutAMessage>,
  tell?: TellOnePage | null,
  parties?: readonly ParticipantRef[] | null,
): void
export function announce(
  event: ChannelEvent,
  tell: TellOnePage | null = null,
  parties: readonly ParticipantRef[] | null = null,
): void {
  if (EVENTS_ABOUT_A_MESSAGE.has(event.name) && parties === null) {
    throw new Error(
      `The event ${event.name} names a message and was announced without the message's parties, so nobody can say ` +
        'which pages it may reach. Nothing was sent. Pass the parties from thePartiesOf in src/server/lib/messages.ts.',
    )
  }
  // A CHECK OF A WRITE TELLS NO PAGE, because the write it checks is taken back (lib/only-a-check.ts).
  // Its rollback would drop the event anyway (whenStored below); the skip is wave 13s's and is kept.
  if (onlyChecking()) return
  const theParties = parties === null ? null : [...parties]
  whenStored(() => tellThePages(event, tell, theParties))
}

/** Number one stored event, remember it, and send it to every open page it reaches. */
function tellThePages(event: ChannelEvent, tell: TellOnePage | null, parties: ParticipantRef[] | null): void {
  lastId += 1
  const one: Remembered = { id: lastId, event, tell, parties, at: performance.now() }
  ring.push(one)
  const size = eventRingSize()
  if (ring.length > size) {
    dropped += ring.length - size
    ring = ring.slice(-size)
  }
  for (const listener of listeners) {
    if (!reaches(one, listener)) continue
    listener.send(toldTo(one, listener))
  }
}

/** One remembered event as one page is told it. */
function toldTo(one: Remembered, page: { who: ParticipantRef | null; workspaceId: string }): EventOnTheWire {
  return { id: one.id, event: one.tell === null ? one.event : one.tell(page) }
}

/** Everything after this id, oldest first, and how many are missing because the ring is finite.
 *
 * `who` is the reader the page would be streamed as — the same participant the connection will carry.
 * The narrowing below asks it, so a page picking up after a break gets back the events about ITSELF
 * from every project, exactly as it would have been streamed them.
 */
export function since(
  lastSeen: number | null,
  workspaceId: string,
  who: ParticipantRef | null = null,
): { events: EventOnTheWire[]; missed: number } {
  if (lastSeen === null) return { events: [], missed: 0 }
  const kept = ring.filter((one) => one.id > lastSeen)
  const oldestKept = ring[0]?.id ?? lastId + 1
  // WHAT THIS PAGE CANNOT BE GIVEN. Everything between the id it last saw and the oldest event still
  // in the ring has gone, and saying nothing about that would let the page believe it saw them.
  const missed = lastSeen + 1 < oldestKept ? oldestKept - (lastSeen + 1) : 0
  return {
    events: kept.filter((one) => reaches(one, { workspaceId, who })).map((one) => toldTo(one, { workspaceId, who })),
    missed,
  }
}

// ============================================================================ the connections

/** One page opened. Returns the id to close it with. */
export function pageOpened(input: {
  workspaceId: string
  who: ParticipantRef | null
  send: (one: EventOnTheWire) => void
  /** The name this page gave its own connection. Absent means it gave none. */
  tag?: string | null
  /** How the request proved who it was, or null when it carried no key. */
  proof?: string | null
}): number {
  const id = nextListener
  nextListener += 1
  listeners.push({
    id,
    workspaceId: input.workspaceId,
    who: input.who,
    send: input.send,
    openedAt: nowStamp(),
    heardFrom: Date.now(),
    openedAtMs: performance.now(),
    lastIdBeforeIt: lastId,
    tag: input.tag ?? null,
    proof: input.proof ?? null,
  })
  return id
}

/** One page closed. Safe to call twice. */
export function pageClosed(id: number): void {
  listeners = listeners.filter((one) => one.id !== id)
}

/**
 * HOW MANY EVENTS THAT WOULD HAVE REACHED A PAGE WERE ANNOUNCED IN THE `ms` MILLISECONDS BEFORE IT WAS
 * COUNTED AS OPEN. Problem k8n8yOWOzHI1.
 *
 * A page reads its lists while its stream is still connecting, so an event announced between that read
 * and the moment the server counted the stream reached neither. The page cannot know when the server
 * read its lists, but it knows how long ago its own loading began. Every read it made was answered after
 * that, and the server counted the stream before the page heard back from it. So every event the page
 * may have missed was announced within `ms` before the stream was counted, where `ms` is the time from
 * the page starting to load to the stream's reply arriving, measured by the page. Counting that window
 * counts every such event, and may count a few the page's reads already held.
 *
 * The page is the newest open connection with this tag whose reader is `who`. Null when there is none,
 * and null when the window starts before the oldest event the ring still holds and some have been
 * forgotten, because then nobody can say. The count is only of events that reach the page, by `reaches`.
 *
 * BY NAME AS WELL (wave 13y round 146), so a page that may have missed only changes to records reads
 * again only what follows them, and not every list.
 */
export function reachedAPageBeforeItWasCounted(
  tag: string,
  who: ParticipantRef | null,
  ms: number,
): { reached: number; byName: Partial<Record<EventName, number>> } | null {
  let page: Listener | null = null
  for (const listener of listeners) {
    if (listener.tag !== tag) continue
    const same = who === null ? listener.who === null : listener.who !== null && sameParticipant(listener.who, who)
    if (!same) continue
    if (page === null || listener.id > page.id) page = listener
  }
  if (page === null) return null
  const from = page.openedAtMs - ms
  const oldest = ring[0]
  if (dropped > 0 && (oldest === undefined || oldest.at > from)) return null
  const it = page
  const reached = ring.filter((one) => one.id <= it.lastIdBeforeIt && one.at >= from && reaches(one, it))
  const byName: Partial<Record<EventName, number>> = {}
  for (const one of reached) byName[one.event.name] = (byName[one.event.name] ?? 0) + 1
  return { reached: reached.length, byName }
}

/** A page said it is still there. */
export function pageIsStillThere(id: number, at: number = Date.now()): void {
  for (const listener of listeners) if (listener.id === id) listener.heardFrom = at
}

/** How many pages are open right now. */
export function pagesOpen(): number {
  return listeners.length
}

/** Every open page's project and reader, one entry per page, for the presence announcements. */
export function everyPageOpen(): { workspaceId: string; who: ParticipantRef | null }[] {
  return listeners.map((one) => ({ workspaceId: one.workspaceId, who: one.who }))
}

/** When this participant's newest open page last said it was there, or null when they have none. */
export function whoIsConnected(who: ParticipantRef, now: number = Date.now()): { heardFrom: number; ago: number } | null {
  let newest: number | null = null
  for (const listener of listeners) {
    if (listener.who === null || !sameParticipant(listener.who, who)) continue
    if (newest === null || listener.heardFrom > newest) newest = listener.heardFrom
  }
  if (newest === null) return null
  return { heardFrom: newest, ago: now - newest }
}

/** Everybody with a page open, newest first. */
export function everybodyConnected(): { who: ParticipantRef; heardFrom: number }[] {
  const byWho = new Map<string, { who: ParticipantRef; heardFrom: number }>()
  for (const listener of listeners) {
    if (listener.who === null) continue
    const key = participantKey(listener.who)
    const held = byWho.get(key)
    if (held === undefined || listener.heardFrom > held.heardFrom) {
      byWho.set(key, { who: listener.who, heardFrom: listener.heardFrom })
    }
  }
  return [...byWho.values()].sort((a, b) => b.heardFrom - a.heardFrom)
}

/**
 * FORGET EVERYTHING. For a test that wants a channel of its own, and for nothing else.
 *
 * The ring, the ids and the connections are all one process's memory, and a test file that ran
 * before this one would otherwise leave events in it.
 */
export function forgetTheChannel(): void {
  ring = []
  lastId = 0
  dropped = 0
  listeners = []
  nextListener = 1
  // A CHANNEL THAT FORGOT EVERYTHING IS A NEW RUN, exactly as a restarted server is, so a test can
  // stand for a restart with this.
  run = aNewRunId()
}

/** What the channel holds right now, for the route that reports on itself and for a test. */
export function channelState(tag?: string | null): {
  lastId: number
  held: number
  dropped: number
  pagesOpen: number
  /**
   * How many open connections carry the tag that was asked about.
   *
   * NULL MEANS NOBODY ASKED, and it is not zero. `pagesOpen` beside it counts every page on this
   * server, which is the honest answer to the question it is asked and is no use to a caller who
   * wants to know about its own connection — another page opening or closing moves it. This number
   * is about the connections the caller named.
   */
  openWithThisTag: number | null
  /** The tag that was asked about, echoed, or null when none was. */
  tag: string | null
  /**
   * HOW MANY OPEN PAGES PROVED WHO THEY WERE WITH A KEY: the person's key, a paired browser's cookie
   * or an agent's key. The rest carried identity headers and no key.
   */
  pagesProvedByAKey: number
  /** The id of this run of the server, as the stream's run line says it. */
  run: string
  sends: readonly string[]
} {
  const asked = tag ?? null
  return {
    lastId,
    held: ring.length,
    dropped,
    pagesOpen: listeners.length,
    openWithThisTag: asked === null ? null : listeners.filter((one) => one.tag === asked).length,
    tag: asked,
    pagesProvedByAKey: listeners.filter((one) => one.proof !== null).length,
    run,
    sends: EVENTS_SENT_TODAY,
  }
}
