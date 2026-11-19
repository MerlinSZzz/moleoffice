// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE EVENT STREAM FOR ALL OF A PERSON'S TABS IN ONE BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * A browser keeps at most six HTTP/1.1 connections to one address, and every open Mole Office tab
 * used to hold one of them for its stream. Measured in round 1 of wave 13j: with eight tabs in one
 * browser, the sixth tab never finished loading, because every connection it could use was a stream
 * held by another tab. So all of a person's tabs share one stream, in the page, rather than HTTP/2
 * .
 *
 * ---------------------------------------------------------------------------------------
 * HOW: ONE TAB HOLDS THE STREAM, AND A BROADCAST CHANNEL CARRIES WHAT IT HEARS
 * ---------------------------------------------------------------------------------------
 *
 * Every tab asks the browser for the same lock (`navigator.locks`). The one that gets it holds the
 * stream; the others wait in the browser's queue for the lock. The holder sends each event, by a
 * `BroadcastChannel`, only to the tabs that said they draw it: each tab has a channel of its own and
 * tells the holder, on a channel they all share, which events it wants. When the holder's tab closes,
 * the browser gives the lock to the next tab in the queue, and that tab opens the stream with the id of
 * the last event any tab was told about (`Last-Event-ID`). The server sends everything after that id
 * that it still remembers, so nothing is lost in the change of holder.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NOT A SHARED WORKER
 * ---------------------------------------------------------------------------------------
 *
 * A SharedWorker would do the same job, and Chrome on Android does not have one. The owner's devices include
 * phones. `BroadcastChannel` and `navigator.locks` are in every current browser, Chrome on Android
 * included, so this works the same on every device the owner uses.
 *
 * ---------------------------------------------------------------------------------------
 * A BROWSER WITH NEITHER: ONE STREAM PER TAB, AS BEFORE, AND IT SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * Without both of them, the tab holds a stream of its own, exactly as every tab did before this file.
 * That is not silent: the browser's console says it once, and the page's `<html>` element carries
 * `data-mole-office-stream="this tab alone"`, where a tab sharing the stream carries "holds the
 * stream for every tab" or "shares another tab's stream".
 *
 * WHICH TABS SHARE. Tabs whose stream requests would be the same: the same address and the same
 * headers, which says the same person, the same project and the same world. A tab reading another
 * project needs another project's events, so it shares with the tabs reading that project.
 */

import type { ChannelEvent, EventName } from '@shared/events.ts'
import { aRequestSettled, aRequestStarted } from './ready.ts'

/** What the tab holding the stream says about it, and every other tab mirrors. */
export interface StreamState {
  open: boolean
  says: string | null
}

/** Why the events a tab holds may be missing some. */
export type WhyEventsWereLost = 'the server forgot some' | 'the server restarted' | 'the holding tab forgot some'

/** What the stream itself does: opening it and reading it are the channel's (src/web/lib/channel.ts). */
export interface HoldTheStream {
  /**
   * Open the stream, picking up after `lastEventId` of run `run` when they are known, and keep it open
   * until `stop` is aborted. Each event, the run line and every change of state are handed back.
   */
  (options: {
    lastEventId: number
    run: string | null
    stop: AbortSignal
    onEvent: (id: number, event: ChannelEvent) => void
    onRun: (run: string, at: number, missed: number) => void
    onState: (state: StreamState) => void
  }): void
}

/** What a tab is handed by the shared stream. */
export interface WhatATabIsHanded {
  event: (id: number, event: ChannelEvent) => void
  state: (state: StreamState) => void
  lost: (why: WhyEventsWereLost) => void
  /**
   * THIS TAB MAY HAVE MISSED AN EVENT WHILE IT WAS STILL CONNECTING, so what holds lists reads them once,
   * or, when only changes to records were missed, what follows records reads them once.
   * Said at most once in the life of a page, when it starts listening. Problem k8n8yOWOzHI1.
   */
  missedWhileConnecting: (what: Exclude<MissedWhileConnecting, false>) => void
}

/**
 * WHAT A TAB MAY HAVE MISSED WHILE IT CONNECTED: nothing (false), only changes to records ('record
 * changes'), or anything else, which is also the answer when nobody can say (true). Wave 13y round 146.
 */
export type MissedWhileConnecting = boolean | 'record changes'

/**
 * WHAT A TAB MISSED, BY THE NAMES OF THE EVENTS IT MAY HAVE MISSED. A change to a record is read again only by
 * what follows that record (src/web/lib/record-changes.ts); no list of the chat's or the page's frame reads
 * for it. So when every name is `record.changed`, only what follows records needs to read (wave 13y round
 * 146). Before, every list read again for them, and an office whose agents store runs every few seconds
 * read every list again on almost every page load.
 */
export function whatWasMissed(names: Iterable<string>): MissedWhileConnecting {
  let any = false
  for (const name of names) {
    if (name !== 'record.changed') return true
    any = true
  }
  return any ? 'record changes' : false
}

/** The more of two answers: anything over record changes, and record changes over nothing. */
function theMoreOf(one: MissedWhileConnecting, other: MissedWhileConnecting): MissedWhileConnecting {
  return one === true || other === true ? true : one || other
}

/** How this tab takes part: holding the stream, sharing another tab's, or alone. */
export type HowThisTabListens = 'holds the stream for every tab' | 'shares another tab’s stream' | 'this tab alone'

/** The messages the tabs of one stream say to each other. */
type Said =
  | { type: 'hello' | 'wants'; tab: string; wants: EventName[]; pageStart: number; listening: boolean }
  | { type: 'bye'; tab: string }
  | { type: 'holder'; tab: string }
  | { type: 'state'; state: StreamState }
  | { type: 'tick'; id: number; run: string | null }
  | { type: 'lost'; why: WhyEventsWereLost }
  | { type: 'event'; id: number; event: ChannelEvent }
  | { type: 'listening'; missed: MissedWhileConnecting }

/** True when this browser has both things one shared stream needs. */
export function thisBrowserCanShareAStream(): boolean {
  return (
    typeof BroadcastChannel !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { locks?: unknown }).locks === 'object' &&
    (navigator as Navigator & { locks?: unknown }).locks !== null
  )
}

let saidItOnce = false

// ============================================================================ the gap while a tab connects

/*
 * WHAT A TAB MAY MISS WHILE IT CONNECTS, AND HOW IT FINDS OUT. Problem k8n8yOWOzHI1.
 *
 * The panels read their lists when they are mounted, and the stream opens beside them; neither waits
 * for the other. An event announced after a panel's read and before this tab was listening reached
 * neither, and was not counted until the next read. The problem names two ways out: read the lists
 * once the stream is listening, or reconcile by the last event id the lists carried. The second needs
 * every list door to say which event it had got to; the doors and the panels are not these files. So
 * these files take the first way, and ask first whether the read is needed, because reading every list
 * again on every load is the cost a decision took away
 * (tests/the-home-page-asks-once-and-light.test.ts).
 *
 * WHICH EVENTS COUNT. Every read a panel made was answered after the page started loading, so every
 * event it may have missed was announced after that moment and before this tab was listening.
 *
 *   - A TAB THAT HOLDS A STREAM (for every tab, or alone) is listening once the server has counted its
 *     connection, which the server does before it sends the reply's headers. So the tab asks the server
 *     how many events that reach it were announced in the time from the page starting to load to the
 *     reply arriving, counted back from the moment the server counted the connection
 *     (`GET /api/events/state?connectingFor=`). That window starts no later than the page did.
 *   - A TAB THAT SHARES ANOTHER TAB'S STREAM is listening once the holding tab has added it. The holding
 *     tab looks at what it was handed since that tab's page started loading, and, when that tab started
 *     loading before the holding tab's own stream was counted, asks the server about the time before.
 *
 * When anything counts, or when nobody can say (the server forgot some, a request failed), the tab's
 * panels read their lists once. Reading once too often costs one read of each list; a missed message is
 * a count that is wrong until something else reads. When only changes to records count, only what
 * follows records reads (`whatWasMissed`).
 *
 * ONCE IN THE LIFE OF A PAGE. A stream that drops and comes back asks for everything after the last
 * event it saw, so nothing falls in a gap there. A change of project joins another stream and is not
 * asked about: the chat panel's answer to a read also reads the open conversation again for the new
 * project (tests/switching-the-project-does-not-refresh-the-chat.test.ts). That gap stays until the chat
 * panel itself can close it.
 */

/** Whether this tab has started listening since the page loaded, on any stream. */
let thisTabHasListened = false

/**
 * THE NAME THE PAGE'S READY MARK GIVES THIS WAIT, in the sentence a failed wait prints.
 *
 * WHY THE READY MARK WAITS FOR IT. Problem _PEG8drs25w1. Until a tab has asked what it missed while
 * it connected, it may still read every list once more (`missedWhileConnecting`). Neither the stream
 * nor the question goes through the app's one transport, so src/web/lib/ready.ts did not count them,
 * and the mark could go on first. Forced on 29 September 2026 by answering the question 1.5 seconds
 * late: a record page put the mark on at 721 ms, and at 1,927 ms it asked for
 * `/api/messages/circle` and `/api/messages/forced` and took the mark off again. On a quiet machine
 * the answer came 30 to 100 ms before the first mark, which is why it was seldom seen.
 */
const UNTIL_THIS_TAB_LISTENS = '/api/events, until this tab knows whether it missed anything while it connected'

/** Now, in milliseconds since 1970, on the clock every tab of this browser shares. */
function now(): number {
  return performance.timeOrigin + performance.now()
}

/** How many of the events the holding tab was handed it remembers, with when they came. */
export const ARRIVALS_KEPT = 1000

/**
 * TAKE PART IN THE STREAM FOR `key`, and return how to stop and how to say what this tab wants.
 *
 * `key` names the stream: the address and every header the request sends. `hold` opens it when this
 * tab is the one holding it. `handed` is what this tab is given.
 */
export function joinTheStream(
  key: string,
  hold: HoldTheStream,
  handed: WhatATabIsHanded,
  wants: () => ReadonlySet<EventName>,
  says: (how: HowThisTabListens) => void,
  /**
   * What this tab may have missed of the events that reach the stream it holds, announced in the `ms`
   * milliseconds before the server counted its connection. True when that cannot be said.
   */
  mayHaveMissed: (ms: number) => Promise<MissedWhileConnecting>,
): { leave: () => void; wantsChanged: () => void } {
  const tab = `tab-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`
  let lastEventId = 0
  let run: string | null = null
  let leaving = false
  /** When the reply of the connection this tab holds came back, or null while it holds none open. */
  let replyCameAt: number | null = null

  /**
   * THE READY MARK WAITS WHILE THIS TAB HAS NOT YET LISTENED, and stops waiting exactly once.
   *
   * It stops waiting when the tab has listened and has started any read `missedWhileConnecting`
   * asks for, so those reads are counted before this wait ends. It also stops waiting when the first
   * stream this tab depends on reports itself closed, and when the tab leaves this stream: a page
   * whose stream is refused must still be marked ready.
   */
  let waitingToListen = !thisTabHasListened
  if (waitingToListen) aRequestStarted(UNTIL_THIS_TAB_LISTENS)
  const doneWaitingToListen = (): void => {
    if (!waitingToListen) return
    waitingToListen = false
    aRequestSettled(UNTIL_THIS_TAB_LISTENS)
  }
  /** What a stream this tab depends on said about itself. A closed stream ends the wait. */
  const streamSaid = (state: StreamState): void => {
    if (!state.open) doneWaitingToListen()
  }

  /** The connection this tab holds is open. The first time a tab listens, it asks what it missed. */
  const iHoldAnOpenStream = (): void => {
    replyCameAt = now()
    if (thisTabHasListened) {
      doneWaitingToListen()
      return
    }
    thisTabHasListened = true
    void mayHaveMissed(replyCameAt - performance.timeOrigin).then((missed) => {
      if (missed !== false) handed.missedWhileConnecting(missed)
      doneWaitingToListen()
    })
  }

  // A BROWSER WITH NEITHER: this tab holds a stream of its own, and says so.
  if (!thisBrowserCanShareAStream()) {
    if (!saidItOnce) {
      saidItOnce = true
      console.warn(
        'Mole Office: this browser has no BroadcastChannel or no navigator.locks, so each tab holds its own event ' +
          'stream. More than five tabs of the office in this browser may stop loading.',
      )
    }
    says('this tab alone')
    const stop = new AbortController()
    holdHere(stop.signal, (id, event) => {
      if (wants().has(event.name)) handed.event(id, event)
    }, (state) => {
      handed.state(state)
      streamSaid(state)
      if (state.open) iHoldAnOpenStream()
    }, handed.lost)
    return {
      leave: () => {
        leaving = true
        doneWaitingToListen()
        stop.abort()
      },
      wantsChanged: () => undefined,
    }
  }

  const everybody = new BroadcastChannel(`mole-office-stream|${key}`)
  const mine = new BroadcastChannel(`mole-office-stream|${key}|${tab}`)
  const toTabs = new Map<string, BroadcastChannel>()
  /** Each tab sharing this stream: what it draws, when its page started to load, and whether it listens. */
  const followers = new Map<string, { wants: Set<EventName>; pageStart: number; listening: boolean }>()
  /** Recent payloads, newest last, so a subscription restored after replay can still receive them. */
  let arrivals: { at: number; id: number; event: ChannelEvent }[] = []
  let arrivalsForgotten = false
  let holding = false
  let lastState: StreamState | null = null
  let letGo: (() => void) | null = null

  const tell = (said: Said): void => everybody.postMessage(said)
  const hello = () => ({ type: 'hello' as const, tab, wants: [...wants()], pageStart: performance.timeOrigin, listening: thisTabHasListened })
  const toTab = (other: string, said: Said): void => {
    let channel = toTabs.get(other)
    if (channel === undefined) {
      channel = new BroadcastChannel(`mole-office-stream|${key}|${other}`)
      toTabs.set(other, channel)
    }
    channel.postMessage(said)
  }

  /** The stream is opened here, and what it hears is counted, handed out and said to every tab. */
  function holdHere(
    stop: AbortSignal,
    onEvent: (id: number, event: ChannelEvent) => void,
    onState: (state: StreamState) => void,
    onLost: (why: WhyEventsWereLost) => void,
  ): void {
    hold({
      lastEventId,
      run,
      stop,
      onEvent: (id, event) => {
        // EVERY TAB IS TOLD HOW FAR THE STREAM HAS GOT, whether or not it draws this event, so whichever
        // tab holds the stream next picks up exactly here.
        if (id > 0) lastEventId = Math.max(lastEventId, id)
        onEvent(id, event)
      },
      onRun: (said, at, missed) => {
        const before = run
        run = said
        if (before !== null && before !== said) {
          lastEventId = at
          onLost('the server restarted')
        } else {
          lastEventId = Math.max(lastEventId, at)
          if (missed > 0) onLost('the server forgot some')
        }
      },
      onState,
    })
  }

  everybody.onmessage = (message: MessageEvent<Said>) => {
    const said = message.data
    if (said.type === 'tick') {
      if (said.id > lastEventId) lastEventId = said.id
      if (said.run !== null) run = said.run
      return
    }
    if (said.type === 'state') {
      if (!holding) {
        handed.state(said.state)
        streamSaid(said.state)
      }
      return
    }
    if (said.type === 'lost') {
      if (!holding) handed.lost(said.why)
      return
    }
    if (said.type === 'holder') {
      // A NEW HOLDER KNOWS NOBODY'S WANTS YET, so every tab says its own again.
      if (!holding) tell(hello())
      return
    }
    if (!holding) return
    if (said.type === 'hello' || said.type === 'wants') {
      const known = followers.has(said.tab)
      const theirs = { wants: new Set(said.wants), pageStart: said.pageStart, listening: said.listening || followers.get(said.tab)?.listening === true }
      followers.set(said.tab, theirs)
      // REPLAY CAN ARRIVE BEFORE THIS TAB RESTORES ITS SUBSCRIPTION. A tab already listening needs
      // the retained payloads before later live events; a new page reconciles its initial reads below.
      if (!known && said.listening) {
        if (arrivalsForgotten) toTab(said.tab, { type: 'lost', why: 'the holding tab forgot some' })
        else for (const one of arrivals) {
          if (one.at >= said.pageStart && theirs.wants.has(one.event.name)) toTab(said.tab, { type: 'event', id: one.id, event: one.event })
        }
      }
      if (said.type === 'wants') return
      if (lastState !== null) {
        tell({ type: 'state', state: lastState })
        tell({ type: 'tick', id: lastEventId, run })
      }
      if (lastState?.open === true) tellThatTabItListens(said.tab)
      return
    }
    if (said.type === 'bye') {
      followers.delete(said.tab)
      toTabs.get(said.tab)?.close()
      toTabs.delete(said.tab)
    }
  }

  mine.onmessage = (message: MessageEvent<Said>) => {
    const said = message.data
    if (holding) return
    if (said.type === 'listening') {
      if (thisTabHasListened) {
        doneWaitingToListen()
        return
      }
      thisTabHasListened = true
      if (said.missed !== false) handed.missedWhileConnecting(said.missed)
      doneWaitingToListen()
      return
    }
    if (said.type === 'lost') {
      handed.lost(said.why)
      return
    }
    if (said.type !== 'event') return
    handed.event(said.id, said.event)
  }

  /**
   * TELL A SHARING TAB IT IS LISTENING, once it has been added and this tab's stream is open, and whether
   * it may have missed an event while it connected. Its page started at `pageStart`: an event handed to
   * this tab since then may be one it missed, and so may an event announced before this tab's own
   * connection was counted, which the server is asked about.
   */
  function tellThatTabItListens(other: string): void {
    const it = followers.get(other)
    if (it === undefined || it.listening) return
    it.listening = true
    const since = it.pageStart
    const forgotten = arrivalsForgotten && (arrivals[0]?.at ?? Number.POSITIVE_INFINITY) > since
    const handedSince = whatWasMissed(arrivals.filter((one) => one.at >= since && it.wants.has(one.event.name)).map((one) => one.event.name))
    if (forgotten || handedSince === true) {
      toTab(other, { type: 'listening', missed: true })
      return
    }
    if (replyCameAt === null || since >= replyCameAt) {
      toTab(other, { type: 'listening', missed: handedSince })
      return
    }
    void mayHaveMissed(replyCameAt - since).then((before) => toTab(other, { type: 'listening', missed: theMoreOf(handedSince, before) }))
  }

  says('shares another tab’s stream')
  tell(hello())

  const locks = (navigator as Navigator & { locks: LockManager }).locks
  void locks.request(`mole-office-stream|${key}`, async () => {
    if (leaving) return
    holding = true
    says('holds the stream for every tab')
    tell({ type: 'holder', tab })
    const stop = new AbortController()
    holdHere(
      stop.signal,
      (id, event) => {
        tell({ type: 'tick', id, run })
        arrivals.push({ at: now(), id, event })
        if (arrivals.length > ARRIVALS_KEPT) {
          arrivals = arrivals.slice(-ARRIVALS_KEPT)
          arrivalsForgotten = true
        }
        if (wants().has(event.name)) handed.event(id, event)
        for (const [other, theirs] of followers) {
          if (theirs.wants.has(event.name)) toTab(other, { type: 'event', id, event })
        }
      },
      (state) => {
        lastState = state
        handed.state(state)
        streamSaid(state)
        tell({ type: 'state', state })
        if (state.open) {
          iHoldAnOpenStream()
          for (const other of followers.keys()) tellThatTabItListens(other)
        }
      },
      (why) => {
        if (why === 'the server restarted') {
          arrivals = []
          arrivalsForgotten = false
        }
        handed.lost(why)
        tell({ type: 'lost', why })
      },
    )
    // HELD UNTIL THIS TAB LEAVES. The browser gives the lock to the next tab the moment this promise
    // settles or the tab closes.
    await new Promise<void>((resolve) => {
      letGo = () => {
        stop.abort()
        resolve()
      }
    })
    holding = false
  })

  const goodbye = (): void => {
    tell({ type: 'bye', tab })
  }
  window.addEventListener('pagehide', goodbye)

  return {
    leave: () => {
      leaving = true
      doneWaitingToListen()
      window.removeEventListener('pagehide', goodbye)
      goodbye()
      letGo?.()
      everybody.close()
      mine.close()
      for (const channel of toTabs.values()) channel.close()
    },
    wantsChanged: () => {
      if (!holding) tell({ ...hello(), type: 'wants' })
    },
  }
}
