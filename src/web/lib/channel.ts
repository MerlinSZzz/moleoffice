// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE CONNECTION THIS PAGE HOLDS OPEN, AND WHAT IT DOES WITH WHAT ARRIVES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS `fetch` AND NOT `EventSource`
 * ---------------------------------------------------------------------------------------
 *
 * `EventSource` cannot set a header. Every request this browser makes says who is asking and which
 * project it is about, and a stream that could say neither would be answered from the default
 * project — a page reading Greenhouse would be told about messages in another project, which is the
 * exact failure the workspace header exists to prevent. So the stream is a `fetch` whose headers
 * come from `moleOfficeHeaders`, the same function every other request uses, and its body is read a
 * line at a time.
 *
 * ---------------------------------------------------------------------------------------
 * A STREAM FROM ANOTHER WORLD IS REFUSED, LIKE ANY OTHER REPLY
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G3 of design/ground/ACCEPTANCE.md does not stop applying to a request that stays open.
 * The world header is on the stream's first reply, and `theWorldThatAnswered` is asked about it
 * before a single event is read. A stream from another world is dropped and the page's own banner
 * goes up, because the check announces the disagreement itself. The check is handed the stream's
 * moved-home header too, as it is every other reply's, so during this page's own move a stream from
 * the moved office is read as the page's new home (criterion DF28).
 *
 * ---------------------------------------------------------------------------------------
 * ONE CONNECTION FOR EVERY TAB, AND IT IS OPEN ON EVERY PAGE
 * ---------------------------------------------------------------------------------------
 *
 * Every component that wants to know reads from the same connection through `useChannel`, and since
 * 26 September 2026 every tab of one person in one browser shares one connection: one tab holds it
 * and hands each other tab the events that tab draws (src/web/lib/onestream.ts says how, and what a
 * browser without the means to share does). Each component says which events it draws, and a tab is
 * handed only the events one of its components draws.
 *
 * ---------------------------------------------------------------------------------------
 * A HIDDEN TAB KEEPS THE STREAM AND APPLIES WHAT IT MISSED WHEN IT IS SHOWN
 * ---------------------------------------------------------------------------------------
 *
 * A tab the reader is not looking at still takes part in the stream, so the person reads as online
 * while any tab is open. Events handed to a hidden tab are kept, in the order they came, and handed to
 * its components when the tab is shown again: nothing is drawn that nobody can see, and nothing is
 * read on coming back. Only when events were lost does a tab read its lists: the server said it had
 * forgotten some, the server restarted, or a tab hidden for a long time was handed more than it keeps
 * (`HIDDEN_KEEPS`). Then the components that hold lists are told once, when the tab is shown.
 *
 * IT USED TO BE OPEN ONLY WHILE THE MESSAGES PANEL WAS OPEN. The reason was that a held connection
 * makes a page never network-idle: Playwright's `networkidle` means no network connections for
 * half a second, a stream is a connection that never ends, and 161 places across the browser tests
 * and the photographing tools waited that way. Measured on 4 September 2026, with the connection
 * open on every page `tools/review.mjs` timed out on every photograph it took.
 *
 * THAT REASON IS GONE, BECAUSE THE WAITING CHANGED. The page now says when it has finished drawing
 * — `data-mole-office-ready` on the `<html>` element, in src/web/lib/ready.ts — and every test and
 * tool waits for that instead of guessing from outside that the network has gone quiet. Nothing is
 * left that a held connection breaks.
 *
 * WHAT IT BUYS. An agent leading a person to a page (criterion M8) has to reach a page whose panel
 * is closed, so the offer arrives wherever the reader happens to be. The number on the circle also
 * moves by itself now, which was the measured cost of the old rule.
 *
 * A PERSON IS THEREFORE ONLINE WHILE ANY MOLE OFFICE PAGE IS OPEN, not only while their messages
 * panel is. The presence reading counts held connections, so the meaning of a person's green dot
 * widened with this change, and that is the honest reading of it: they are there.
 */

import { useEffect, useSyncExternalStore } from 'react'
import {
  CHANNEL_IS_DOWN,
  CONNECTING_FOR_PARAM,
  CONNECTION_TAG_PARAM,
  EVENT_NAMES,
  RUN_PARAM,
  readTheRunLine,
  type ChannelEvent,
  type EventName,
} from '@shared/events.ts'
import { aChangeWasHeard, moleOfficeHeaders } from '../api.ts'
import { currentWorkspace, subscribeWorkspace } from './workspace.ts'
import { HOME_HEADER, HOME_MOVED_HEADER } from '../../config/visit-headers.mjs'
import { PROGRAM_HEADER } from '@shared/messages.ts'
import { theWorldThatAnswered, WORLD_HEADER } from './world.ts'
import { makeBroadcast } from './store.ts'
import { whereRequestsGo } from './visiting.ts'
import { joinTheStream, whatWasMissed, type HowThisTabListens, type MissedWhileConnecting, type StreamState, type WhyEventsWereLost } from './onestream.ts'

/**
 * What the page knows about its own connection.
 *
 * AN EVENT CHANGES NOTHING HERE. Every component that calls `useChannel` draws again when this
 * reading changes, and it used to hold the id of the last event, so every event drew all of them
 * again, whether they drew that event or not. Opening a conversation with 25 unread messages drew
 * the chat panel 25 times more for that alone (wave 13y round 85). A component that draws an event
 * is handed it through its ear.
 */
export interface ChannelReading {
  /** True while the connection is open and events are arriving. */
  open: boolean
  /**
   * How many times this tab was told events were lost: the server forgot some, it restarted, or a tab
   * hidden for a long time was handed more than it keeps. Not zero means the lists were read again.
   */
  missed: number
  /** The sentence a reader sees while the connection is down. Null while it is up. */
  says: string | null
  /** Whether this tab holds the stream, shares another tab's, or holds one of its own. */
  how: HowThisTabListens | null
}

let reading: ChannelReading = { open: false, missed: 0, says: CHANNEL_IS_DOWN, how: null }
const broadcast = makeBroadcast()

/** Everything waiting to be told about an event, with the event names it draws. */
type Ear = (event: ChannelEvent) => void
const ears = new Map<Ear, ReadonlySet<EventName>>()

/** Everything that holds a list and reads it again when events were lost. */
const lostEars = new Set<() => void>()

/** Everything that follows records, and reads them again when only a change to one may have been missed. */
const recordEars = new Set<() => void>()

/** Everything that reads again when the stream comes back after it was down. */
const backEars = new Set<() => void>()
/** Whether the stream has been open on this tab, and whether it went down since. */
let hasBeenOpen = false
let downSinceItWasOpen = false

/**
 * THE STREAM'S STATE, AND WHETHER IT HAS JUST COME BACK. It came back when it opens after it had been
 * open and then went down, which is a reconnect or a move to another project's stream. The first
 * open of a page load is not a coming back: everything on the page has just read for itself.
 */
function theStreamIs(open: boolean, says: string | null): void {
  const cameBack = open && hasBeenOpen && downSinceItWasOpen
  if (open) {
    hasBeenOpen = true
    downSinceItWasOpen = false
  } else if (hasBeenOpen) {
    downSinceItWasOpen = true
  }
  announce({ open, says })
  if (cameBack) for (const ear of backEars) ear()
}

/** The shared stream this tab takes part in, or none. */
let joined: { key: string; leave: () => void; wantsChanged: () => void } | null = null
let connectedTo: string | null = null

function announce(next: Partial<ChannelReading>): void {
  reading = { ...reading, ...next }
  broadcast.announce()
}

/** Every event name some component on this tab draws. */
function whatThisTabWants(): ReadonlySet<EventName> {
  const out = new Set<EventName>()
  for (const names of ears.values()) for (const one of names) out.add(one)
  return out
}

// ============================================================================ a hidden tab

/**
 * HOW MANY EVENTS A HIDDEN TAB KEEPS BEFORE IT STOPS KEEPING THEM AND READS ONCE WHEN SHOWN.
 *
 * The server remembers the same number (`eventRingSize` in src/server/lib/env.ts defaults to 1000),
 * so a tab keeps no more than the server itself would hand back after a break.
 */
export const HIDDEN_KEEPS = 1000

let keptWhileHidden: { id: number; event: ChannelEvent }[] = []
let lostWhileHidden = false
/** Whether only a change to a record may have been missed while this tab connected hidden. */
let recordChangesMissedWhileHidden = false
/** The id of the last event handed to this tab's components, so one handed twice is handed once. */
let lastHanded = 0

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function handToTheComponents(id: number, event: ChannelEvent): void {
  // A READ ASKED AFTER THIS EVENT IS NOT ANSWERED BY ONE ASKED BEFORE IT (`moleOfficeRequest` in api.ts).
  aChangeWasHeard()
  for (const [ear, names] of ears) if (names.has(event.name)) ear(event)
  // THE LAST EVENT THIS TAB'S COMPONENTS WERE HANDED, on the `<html>` element beside the page's other
  // states (`data-mole-office-ready`), so a browser test can see that an event reached a tab.
  if (typeof document !== 'undefined') document.documentElement.dataset['moleOfficeLastEvent'] = `${String(id)} ${event.name}`
}

function eventsWereLost(): void {
  aChangeWasHeard()
  announce({ missed: reading.missed + 1 })
  if (hidden()) {
    lostWhileHidden = true
    keptWhileHidden = []
    return
  }
  for (const ear of lostEars) ear()
}

/** What arrives for this tab, from the stream it holds or from the tab that holds it. */
function handed(id: number, event: ChannelEvent): void {
  // ONE EVENT IS HANDED ONCE. When the tab holding the stream changes, the new holder picks up from the
  // last id it was told of, and a tab may already have been handed the next one.
  if (id > 0 && id <= lastHanded) return
  if (id > 0) lastHanded = id
  if (hidden()) {
    if (lostWhileHidden) return
    keptWhileHidden.push({ id, event })
    if (keptWhileHidden.length > HIDDEN_KEEPS) {
      keptWhileHidden = []
      lostWhileHidden = true
      announce({ missed: reading.missed + 1 })
    }
    return
  }
  handToTheComponents(id, event)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (hidden()) return
    // SHOWN AGAIN: what was kept is handed over in the order it came, or, when events were lost, every
    // component holding a list reads it once.
    if (lostWhileHidden) {
      lostWhileHidden = false
      recordChangesMissedWhileHidden = false
      keptWhileHidden = []
      for (const ear of lostEars) ear()
      return
    }
    const kept = keptWhileHidden
    keptWhileHidden = []
    for (const one of kept) handToTheComponents(one.id, one.event)
    if (recordChangesMissedWhileHidden) {
      recordChangesMissedWhileHidden = false
      for (const ear of recordEars) ear()
    }
  })
}

// ============================================================================ the stream itself

/** How long to wait before trying again: a second, then two, then four, up to thirty. */
function backoffMs(attempts: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5))
}

/**
 * Read one server-sent-events body, calling `onEvent` for each event in it.
 *
 * The format is plain: lines of `id:`, `event:` and `data:`, one blank line between events, and a
 * line starting with a colon is a comment the server sends to keep the connection alive. Only
 * `data:` is parsed, because the event object carries its own name. Two comment lines are read: the
 * first says how many events the server could not give back, the second which run of the server this
 * is and where its events have got to.
 */
async function readTheStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (id: number, event: ChannelEvent) => void,
  onOpen: (missed: number) => void,
  onRun: (run: string, at: number) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let held = ''
  for (;;) {
    const next = await reader.read()
    if (next.done) return
    held += decoder.decode(next.value, { stream: true })
    let at = held.indexOf('\n\n')
    while (at !== -1) {
      const block = held.slice(0, at)
      held = held.slice(at + 2)
      at = held.indexOf('\n\n')
      const opened = /^: open (\d+) missed$/.exec(block.trim())
      if (opened !== null) {
        onOpen(Number(opened[1]))
        continue
      }
      const run = readTheRunLine(block)
      if (run !== null) {
        onRun(run.run, run.at)
        continue
      }
      if (block.startsWith(':')) continue
      let id = 0
      let data: string | null = null
      for (const line of block.split('\n')) {
        if (line.startsWith('id: ')) id = Number(line.slice(4))
        else if (line.startsWith('data: ')) data = line.slice(6)
      }
      if (data === null) continue
      try {
        onEvent(id, JSON.parse(data) as ChannelEvent)
      } catch {
        // A LINE THIS BUILD CANNOT READ IS SKIPPED AND THE REST OF THE STREAM IS KEPT. What is
        // handled here is one unreadable event, and what is done about it is to go on reading —
        // dropping the whole connection over one line would cost the page every later event too.
      }
    }
  }
}

/**
 * THE NAME THIS PAGE GIVES ITS OWN CONNECTION, made once and kept for the life of the page.
 *
 * It is sent on the stream so that a caller can ask how many of THIS page's connections are open,
 * rather than how many are open on the whole server — a number every other page moves. It says which
 * connection and nothing about who: who is asking is the actor headers, as on every other request.
 */
const MY_CONNECTION = `page-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`

/** Where the stream request goes and what it says, which is also what names the shared stream. */
function theStreamRequest(): { where: string; headers: Headers; key: string } {
  const headers = moleOfficeHeaders()
  headers.set('accept', 'text/event-stream')
  // WHERE THIS PAGE'S REQUESTS GO, the same function the one transport uses. A stream opened on the
  // page's own origin while the page is visiting another world would be a second world answering this
  // page — which is exactly what criterion G3's banner is for, and it drew one.
  const where = whereRequestsGo('/api/events')
  // THE SHARED STREAM IS NAMED BY THE ADDRESS AND THE HEADERS, which say who is asking, about which
  // project and on which trip. Two headers are left out: the home world, which the page learns from its
  // first reply, so a tab that opened before that would otherwise name a different stream from a tab
  // that opened after; and the program's name, which is the same for every tab of one browser.
  const said: string[] = []
  headers.forEach((value, name) => {
    if (name !== HOME_HEADER && name !== PROGRAM_HEADER.toLowerCase()) said.push(`${name}=${value}`)
  })
  return { where, headers, key: `${where}|${said.sort().join('|')}` }
}

/**
 * OPEN THE STREAM AND KEEP OPENING IT, until `stop` is aborted. Called only in the tab that holds it.
 *
 * THE SAME HEADERS AND THE SAME COOKIE AS EVERY OTHER REQUEST. The headers come from
 * `moleOfficeHeaders`, and the request carries credentials exactly as the one transport does
 * (src/web/api.ts), so a paired browser's key goes on the stream too. After the person closes the key
 * window, a request with no key under an agent's name is nobody; without the cookie a page served from
 * another origin would hold a stream the server could not place.
 */
function holdTheStream(options: Parameters<Parameters<typeof joinTheStream>[1]>[0]): void {
  let attempts = 0
  let lastEventId = options.lastEventId
  let run = options.run
  const once = async (): Promise<void> => {
    const { headers } = theStreamRequest()
    if (lastEventId > 0) headers.set('last-event-id', String(lastEventId))
    const query = new URLSearchParams({ [CONNECTION_TAG_PARAM]: MY_CONNECTION })
    if (run !== null) query.set(RUN_PARAM, run)
    const control = new AbortController()
    const stop = (): void => control.abort()
    options.stop.addEventListener('abort', stop)
    try {
      const res = await fetch(whereRequestsGo(`/api/events?${query.toString()}`), {
        headers,
        credentials: 'include',
        signal: control.signal,
      })
      // THE WORLD CHECK, ON THE STREAM'S FIRST REPLY. `theWorldThatAnswered` announces the
      // disagreement itself, which is what puts the page's own banner up; this drops the stream so
      // nothing from another world is drawn. IT IS HANDED THE REPLY'S MOVED-HOME HEADER, as the one
      // transport hands it (criterion DF28). So during this page's own move, a reply from the moved
      // office is read as this page's new home, and the stream goes on.
      if (theWorldThatAnswered(res.headers.get(WORLD_HEADER), res.headers.get(HOME_MOVED_HEADER)) !== null) {
        options.onState({ open: false, says: CHANNEL_IS_DOWN })
        return
      }
      if (!res.ok || res.body === null) throw new Error(`the channel answered ${String(res.status)}`)
      attempts = 0
      options.onState({ open: true, says: null })
      let missed = 0
      await readTheStream(
        res.body,
        (id, event) => {
          if (id > 0) lastEventId = Math.max(lastEventId, id)
          options.onEvent(id, event)
        },
        (count) => {
          missed = count
        },
        (said, at) => {
          const sameRun = run === null || run === said
          lastEventId = sameRun ? Math.max(lastEventId, at) : at
          run = said
          options.onRun(said, at, missed)
        },
      )
    } catch {
      // Handled: the connection went away. What is done about it is to say so on the page and try
      // again, which is the whole of what a reader can act on.
    } finally {
      options.stop.removeEventListener('abort', stop)
    }
    if (options.stop.aborted) return
    options.onState({ open: false, says: CHANNEL_IS_DOWN })
    attempts += 1
    const waiting = setTimeout(() => {
      if (!options.stop.aborted) void once()
    }, backoffMs(attempts))
    options.stop.addEventListener('abort', () => clearTimeout(waiting), { once: true })
  }
  void once()
}

/**
 * THIS TAB MAY HAVE MISSED AN EVENT WHILE IT WAS STILL CONNECTING, so every panel holding lists reads
 * them once. src/web/lib/onestream.ts decides when (problem k8n8yOWOzHI1). It is not counted as events
 * lost: nothing the server sent was dropped, the panels read before the stream was listening. When only
 * changes to records may have been missed, only what follows records reads them (wave 13y round 146).
 */
function missedWhileConnecting(what: Exclude<MissedWhileConnecting, false>): void {
  if (hidden()) {
    // A HIDDEN TAB READS WHEN IT IS SHOWN, as it does when events were lost, so nothing is read that
    // nobody can see.
    if (what === 'record changes') {
      recordChangesMissedWhileHidden = true
      return
    }
    lostWhileHidden = true
    keptWhileHidden = []
    return
  }
  for (const ear of what === 'record changes' ? recordEars : lostEars) ear()
}

/**
 * WHAT THIS TAB MAY HAVE MISSED OF THE EVENTS THAT REACH ITS CONNECTION, ANNOUNCED IN THE `ms` MILLISECONDS
 * BEFORE THE SERVER COUNTED IT: nothing, only changes to records, or anything else (`whatWasMissed`). Asked
 * of `GET /api/events/state` with this page's connection tag.
 *
 * ANYTHING WHEN NOBODY CAN SAY: the server forgot some events from that time, it holds no connection with
 * this tag, the question failed, or the names it gave do not add up to its count. Handled that way because
 * the only thing done with the answer is to read once, and reading once too often is the cheap mistake.
 */
async function mayHaveMissed(ms: number): Promise<MissedWhileConnecting> {
  const query = new URLSearchParams({ [CONNECTION_TAG_PARAM]: MY_CONNECTION, [CONNECTING_FOR_PARAM]: String(Math.ceil(ms)) })
  try {
    const res = await fetch(whereRequestsGo(`/api/events/state?${query.toString()}`), {
      headers: moleOfficeHeaders(),
      credentials: 'include',
    })
    if (!res.ok) return true
    const said = (await res.json()) as { whileConnecting?: { reached: number | null; byName?: Record<string, number> | null } | null }
    const reached = said.whileConnecting?.reached
    if (reached === null || reached === undefined) return true
    if (reached === 0) return false
    const byName = Object.entries(said.whileConnecting?.byName ?? {}).filter(([, count]) => count > 0)
    if (byName.reduce((sum, [, count]) => sum + count, 0) !== reached) return true
    return whatWasMissed(byName.map(([name]) => name))
  } catch {
    return true
  }
}

/** Take part in the stream for the project on screen, leaving the one for any other project. */
function connect(workspaceId: string): void {
  connectedTo = workspaceId
  const { key } = theStreamRequest()
  if (joined !== null && joined.key === key) return
  joined?.leave()
  const handedHere = {
    event: handed,
    state: (state: StreamState) => theStreamIs(state.open, state.says),
    lost: (why: WhyEventsWereLost) => {
      void why
      eventsWereLost()
    },
    missedWhileConnecting,
  }
  const taking = joinTheStream(
    key,
    holdTheStream,
    handedHere,
    whatThisTabWants,
    (how) => {
      announce({ how })
      if (typeof document !== 'undefined') document.documentElement.dataset['moleOfficeStream'] = how
    },
    mayHaveMissed,
  )
  joined = { key, ...taking }
}

/**
 * WHAT THIS PAGE'S CONNECTION IS DOING, and a way to be told about the events a component draws.
 *
 * MOUNTING THIS HOOK OPENS THE CONNECTION, or joins the one another tab holds. `names` says which
 * events the component draws; the tab is handed only events some component on it draws. Left out,
 * the component is handed every event.
 *
 * `onEvent` is held in a map rather than being re-registered on every render, so a component that
 * re-renders does not open a second connection, and two components asking share the one connection.
 */
export function useChannel(onEvent?: Ear, names: readonly EventName[] = EVENT_NAMES): ChannelReading {
  const workspace = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const state = useSyncExternalStore(broadcast.subscribe, () => reading, () => reading)
  const namesKey = names.join(',')

  useEffect(() => {
    if (connectedTo !== workspace) connect(workspace)
  }, [workspace])

  useEffect(() => {
    if (onEvent === undefined) return
    ears.set(onEvent, new Set(namesKey.split(',') as EventName[]))
    joined?.wantsChanged()
    return () => {
      ears.delete(onEvent)
      joined?.wantsChanged()
    }
  }, [onEvent, namesKey])

  return state
}

/**
 * BE TOLD WHEN EVENTS WERE LOST, so a component holding lists reads them once.
 *
 * Said when the server says it forgot some, when it restarted, and when a tab hidden for a long time
 * was handed more than it keeps. A hidden tab is told when it is shown again. Returns the way to stop
 * being told.
 */
export function whenEventsWereLost(ear: () => void): () => void {
  lostEars.add(ear)
  return () => {
    lostEars.delete(ear)
  }
}

/**
 * BE TOLD WHEN ONLY A CHANGE TO A RECORD MAY HAVE BEEN MISSED WHILE THE PAGE CONNECTED, so what follows records
 * reads them once (src/web/lib/record-changes.ts). When anything else may have been missed, `whenEventsWereLost`
 * is told instead. A hidden tab is told when it is shown again. Returns the way to stop being told. Wave 13y
 * round 146.
 */
export function whenRecordChangesMayHaveBeenMissed(ear: () => void): () => void {
  recordEars.add(ear)
  return () => {
    recordEars.delete(ear)
  }
}

/**
 * BE TOLD WHEN THE STREAM COMES BACK AFTER IT WAS DOWN, so something read once at page load and
 * kept current by an event reads once more. Events the server still remembers are handed over as
 * well, but a server that looks for a change only while a page is open may not have looked while
 * this one was away. Returns the way to stop being told.
 */
export function whenTheStreamCameBack(ear: () => void): () => void {
  backEars.add(ear)
  return () => {
    backEars.delete(ear)
  }
}

/**
 * BE HANDED THESE EVENTS FOR AS LONG AS THE PAGE IS OPEN, from a module rather than a component. The
 * page cache (src/web/lib/pagecache.ts) marks what an event changed even while no panel holding it is
 * drawn. It opens no connection: a component's `useChannel` does that. Returns the way to stop.
 */
export function hearAlways(ear: Ear, names: readonly EventName[]): () => void {
  ears.set(ear, new Set(names))
  joined?.wantsChanged()
  return () => {
    ears.delete(ear)
    joined?.wantsChanged()
  }
}
