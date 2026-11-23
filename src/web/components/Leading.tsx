// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT OFFERS TO TAKE THE READER TO A PAGE, AND NOTHING MOVES WITHOUT CONSENT.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, IN ONE SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M8: nothing navigates a person unless they press the offer, or unless they have said
 * they are following that agent — and while they are following, a control that stops it is on
 * screen the whole time. Leading needs consent, and a right-click anywhere can ask an agent to lead to a report.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRAWN, AND WHEN
 * ---------------------------------------------------------------------------------------
 *
 * NOT FOLLOWING: a card on the page saying who wants to take the reader where, with one press that
 * goes and one that leaves it. The page does not move. The same offer is in the messages panel,
 * because a card can be dismissed and the message is still there.
 *
 * FOLLOWING: the page goes at once, the thing the agent named is boxed, and a control saying whose
 * lead this is and how to stop sits on the screen until it is pressed. The agent's words and that
 * control are ONE card, because they are one state.
 *
 * ON A NARROW SCREEN, ONE LINE. The box is fixed to the screen, so what it covers it covers for as
 * long as it is there. At 390 by 972 the pair of cards was 90 per cent of the width and a fifth of
 * the height (problem O184ESMBfKbN). Under 60rem the following state is one line — the agent's name
 * and the press that stops it — and everything else folds behind one press. The stop press is never
 * what folds away, because M8 says it is on screen the whole time.
 *
 * ---------------------------------------------------------------------------------------
 * AN OFFER IS PENDING UNTIL IT IS READ, AND NOT NOW PUTS IT OFF WITHOUT READING IT
 * ---------------------------------------------------------------------------------------
 *
 * A lead is a message, and a message already carries how far it got with each recipient. So an
 * offer is waiting while its mark for this reader is not `seen`.
 *
 *   · TAKE ME THERE marks the message read. The offer ends, and it ends on every screen this reader
 *     has open, because the mark moving is announced.
 *   · NOT NOW leaves the message unread, so it still counts as unread in the chat and on the Messages
 *     page. This rests on two of the person's decisions. It stores
 *     one thing: the moment of the press, on the reader's delivery row (`POST /api/messages/:id/not-now`). The
 *     offers read leaves the message out for `A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES` after that moment, and
 *     then offers it again while it is still unread. Another screen of the same reader drops the offer the next
 *     time it reads the offers.
 *   · OPENING THE MESSAGE marks it read too, so the offer ends.
 *
 * ---------------------------------------------------------------------------------------
 * AN ANSWERED OFFER LEAVES THE SCREEN AT THE PRESS
 * ---------------------------------------------------------------------------------------
 *
 * Problem 2JUcu1Sg9eg1: an offer sometimes stayed on screen after either press. Only a read of the
 * offers took an offer away, and the read after a press could hand back an answer from before the
 * press: `readWaitingForMeOnce()` returned the answer held since the page loaded, and `.again()`
 * joins a read already in flight, which may have started before the write. The offer then stayed
 * until something else made the panel read again, and if nothing did, it stayed.
 *
 * So the press itself takes the offer off the screen (`answered` below), before anything is
 * written, and keeps it off whatever an older read says: for good after Take me there, and until it
 * comes back after Not now. If the write fails, the offer is drawn again with the reason.
 *
 * Each offer card draws when its message was sent, so when two offers from one agent to one place
 * wait, the person can tell the one left on screen from the one they answered.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { LEADING, participantKey, sameParticipant, theAgentAStoredSenderNames, type KnownParticipant } from '@shared/messages.ts'
import { t } from '@shared/i18n.ts'
import { whenAPutOffOfferComesBack } from '@shared/short-lists.ts'
import { drawnStamp } from '@shared/time.ts'
import type { ParticipantKind, ParticipantRef } from '@shared/participants.ts'
import {
  contextKey,
  nameTarget,
  pageNamedByTarget,
  projectNamedByTarget,
  recordNamedByTarget,
  type Context,
} from '@shared/targets.ts'
import { api, errorMessage, getActor, subscribeActor, type ParticipantForThePage, type PoolEntry } from '../api.ts'
import { useChannel, whenEventsWereLost } from '../lib/channel.ts'
import type { EventName } from '@shared/events.ts'
import {
  aSeenMarkTouchesThisPool,
  listsAnEventChanges,
  readTheParticipantsOnce,
  theReaderIs,
  useAfterTheBurst,
  whoIsReading,
} from '../lib/chatlists.ts'
import { readCircleOnce } from '../lib/oneread.ts'
import {
  knownTitleOf,
  recordInProject,
  useRecordTitles,
  useWhatRecordsAre,
  type WhatARecordIs,
} from '../lib/titles.ts'
import { startFollowing, stopFollowing, useFollowing } from '../lib/following.ts'
import { useLanguage } from '../lib/language.ts'
import { stillOnThisPage } from '../lib/pagechoice.ts'
import { thePageScroller } from '../lib/page-scroll.ts'
import { NARROW_QUERY } from './ui.tsx'
import { showMeThat } from './agent/MarkLayer.tsx'
import { navigate, parseRoute, recordPath } from './router.tsx'
// WHAT A PAGE IS CALLED: the name the sidebar and the top bar draw for it, in the page language.
import { pageTitle } from './Sidebar.tsx'
// WHAT A KIND OF RECORD IS CALLED, in the page language.
import { kindWord } from '../lib/words.ts'
import { useInspect } from '../lib/mode.ts'
import type { RecordKind } from '@shared/types.ts'
// READING AND CHANGING THE PROJECT THIS BROWSER IS IN. A lead may name another project, and taking
// it moves the reader there without a second press. See `goToTheLead`.
import { currentWorkspace, subscribeWorkspace } from '../lib/workspace.ts'
// WHAT EACH PROJECT IS CALLED. One read for the whole browser, so a card naming another project
// prints its title rather than its id. See lib/projectlist.ts.
import { nameOfProject, useProjects } from '../lib/projectlist.ts'

/** The events this panel draws: an offer, a message that may carry one, a mark that may end one. */
const LEADING_DRAWS: readonly EventName[] = ['message.new', 'delivery.changed', 'lead.offered', 'comment.placed', 'comment.replied']

// A press belongs to this browser's reader, across project changes and panel remounts. Keeping it
// in component state let an offer already taken here lead again while its seen write was pending.
const answersByReader = new Map<string, ReadonlyMap<string, number>>()
const automaticAttemptsByReader = new Map<string, Set<string>>()
// An offer whose read crossed a page choice may still be read or taken by a press. Retrying
// its read must not give following permission to override the page the reader chose meanwhile.
const leftForAPressByReader = new Map<string, Set<string>>()
let presses = 0
if (typeof document !== 'undefined') {
  document.addEventListener('click', () => { ++presses }, true)
  document.addEventListener('keydown', () => { ++presses }, true)
}

function leaveOffersForAPress(reader: string, messages: readonly PoolEntry[]): void {
  const left = leftForAPressByReader.get(reader) ?? new Set<string>()
  for (const message of messages) left.add(message.id)
  leftForAPressByReader.set(reader, left)
}
const noAnswers: ReadonlyMap<string, number> = new Map()
const answerListeners = new Set<() => void>()

function readerKey(): string {
  const actor = getActor()
  return `${actor.type}:${actor.id}:${actor.sessionId ?? ''}`
}

function subscribeAnswers(listener: () => void): () => void {
  answerListeners.add(listener)
  return () => { answerListeners.delete(listener) }
}

function answerForReader(reader: string, messageId: string, until: number | null): void {
  const next = new Map(answersByReader.get(reader) ?? noAnswers)
  if (until === null) next.delete(messageId)
  else next.set(messageId, until)
  answersByReader.set(reader, next)
  for (const listener of answerListeners) listener()
}


/** One offer waiting for this reader: the message, who sent it, and where it would take them. */
export interface Offer {
  messageId: string
  from: ParticipantRef
  where: Context
  /** The record it would go to, or null when it names something outside a record. */
  recordId: string | null
  /** What the agent said in the same message. Empty when it said nothing. */
  words: string
  /** When the message was sent, as a stored local stamp. Each card draws it. */
  sentAt: string
}

/**
 * The offers waiting for this reader, oldest first.
 *
 * An entry is an offer when it carries a lead, was sent by somebody, and this reader has not yet
 * said they read it. A message this reader sent themselves is not an offer to them.
 */
export function offersWaitingFor(me: ParticipantRef | null, pool: readonly PoolEntry[]): Offer[] {
  if (me === null) return []
  const out: Offer[] = []
  for (const entry of pool) {
    if (entry.lead === null || typeof entry.lead !== 'object') continue
    // WHOSE OFFER IT IS, read from the one field the chat reads too: a line Remind me later brought back is the
    // office's, and the offer in it is still the first sender's. An offer nobody recorded the maker of is not drawn.
    const from = entry.offerMadeBy === undefined ? entry.sentBy : entry.offerMadeBy
    if (from === null || sameParticipant(from, me)) continue
    const mine = entry.deliveries.find((one) => sameParticipant(one.to, me))
    if (mine === undefined || mine.mark === 'seen') continue
    const where = entry.lead as Context
    out.push({
      messageId: entry.id,
      from,
      where,
      recordId: recordNamedByTarget(where.target),
      words: entry.body,
      sentAt: entry.sentAt,
    })
  }
  return out.reverse()
}

/**
 * THE OFFERS STILL TO DRAW: every offer except the ones this screen has answered and that are still
 * answered at `nowMs`.
 *
 * `answered` holds, for each message id, the moment until which its offer stays off this screen:
 * `Infinity` after Take me there, because a read message never waits again, and the moment it comes
 * back after Not now (`whenAPutOffOfferComesBack`).
 */
export function theOffersStillToDraw(
  offers: readonly Offer[],
  answered: ReadonlyMap<string, number>,
  nowMs: number,
): Offer[] {
  return offers.filter((one) => (answered.get(one.messageId) ?? -Infinity) <= nowMs)
}

/**
 * THE MOMENT ON THIS SCREEN'S CLOCK THAT IS `seconds` FROM NOW, or null for null. The offers read says
 * how long until a put-off offer comes back in seconds, so the server's clock and this screen's clock
 * never have to agree.
 */
function theMomentItComesBack(seconds: number | null): number | null {
  return seconds === null ? null : Date.now() + seconds * 1000
}

/**
 * WHICH RECORD A PAGE'S ADDRESS SHOWS, or null when the address names no record.
 *
 * Seven addresses carry a record id: a record's own page (`/r/<id>`, `/report/<id>`), a message's,
 * a problem's, a run's, an incident's, one counter opened on the counters page, and a pipeline's
 * drawing (`/pipeline/<id>`). `kind` is the kind the address says, and null for `/r/<id>`, which says
 * none. `drawing` is true for the pipeline's drawing, which shows the record as a drawing rather than
 * as its page. The address is read by `parseRoute`, the one reader of addresses.
 */
export function theRecordAPageShows(route: string): { id: string; kind: RecordKind | null; drawing: boolean } | null {
  const read = parseRoute(`#${route}`)
  switch (read.name) {
    case 'record':
      return { id: read.id, kind: read.kind ?? null, drawing: false }
    case 'message':
    case 'problem':
    case 'session':
    case 'incident':
      return { id: read.id, kind: read.name, drawing: false }
    case 'counters':
      return read.id === undefined ? null : { id: read.id, kind: 'counter', drawing: false }
    case 'pipeline':
      return read.id === undefined ? null : { id: read.id, kind: 'pipeline', drawing: true }
    default:
      return null
  }
}

/**
 * WHAT TO CALL A PAGE A LEAD GOES TO, in the words the offer draws. Problem 30fVQwjGa3Qb.
 *
 * THE ADDRESS IS NOT A NAME A PERSON READS, so it is drawn only in developer mode, after the name.
 *
 *   · An address that names a record: the record's kind and its title, read in the project the page
 *     is in (`read`). A pipeline's drawing says it is the drawing. The kind is the one the address
 *     says, and where it says none, the one the read says.
 *   · The same, when no title is known here: not read yet, not found, the read failed, or the read
 *     found a record of another kind than the address says. Then the kind alone, and a sentence
 *     saying the title is not known here. No title is guessed.
 *   · Any other address: the page's own name, the one the sidebar and the top bar draw (`pageTitle`).
 */
function nameAPage(route: string, read: WhatARecordIs | null, developer: boolean): string {
  const shows = theRecordAPageShows(route)
  let name: string
  if (shows === null) {
    name = pageTitle(parseRoute(`#${route}`))
  } else {
    const known = read !== null && (shows.kind === null || read.kind === shows.kind) && read.title.trim() !== ''
    const kind = known ? read.kind : shows.kind
    const word = kind === null ? LEADING.aRecord : kindWord(kind).text
    if (known) name = shows.drawing ? LEADING.theDrawingOf(word, read.title) : LEADING.theRecord(word, read.title)
    else name = shows.drawing ? LEADING.aDrawingWithNoTitle(word) : LEADING.aRecordWithNoTitle(word)
  }
  return developer ? LEADING.withAddress(name, route) : name
}

/**
 * WHAT TO CALL THE PLACE A LEAD GOES, in the words the offer draws before anybody presses it.
 *
 * THREE ANSWERS. A record: its own title, read in the project the lead names. A page: what the page
 * shows, from `nameAPage` above, with its address only in developer mode. Anything else: the
 * target's own name for itself.
 *
 * THE RECORD'S TITLE IS READ IN ITS OWN PROJECT. A lead may name a record in another project, and
 * reading that record in the reader's project answered "somewhere this project does not hold" where
 * the destination belonged (item 113). `page.read` is that
 * read; `title` is the title this project already knows, used only until the read comes back and
 * never when it is the sentence for a record nothing answers to.
 *
 * AND THE PROJECT, WHENEVER IT IS NOT THE ONE THE READER IS IN. Taking the offer moves the project
 * too, with no second press (see `goToTheLead`), so the offer has to say so before it is pressed.
 * `nameOfTheProject` is passed in rather than read here, because this runs in a test with no
 * browser as well as on a screen. `page` is passed in for the same reason: `useWhatALeadsPageShows`
 * below reads the record a page shows or a record the lead names, and the caller knows whether the
 * reader is in developer mode.
 */
export function whereALeadGoes(
  where: Context,
  title: string | null,
  here: string,
  nameOfTheProject: (id: string) => string,
  page: { read: WhatARecordIs | null; developer: boolean },
): string {
  const recordId = recordNamedByTarget(where.target)
  // A RECORD IS NAMED BY ITS TITLE, AND THE READ IN ITS OWN PROJECT IS THE ONE THAT COUNTS. The
  // title this project knows is a first frame; the sentence for a record nothing answers to is not
  // a title, and the read's answer replaces it as soon as it comes. A record nobody can read is
  // still named as what it is, so the offer never says the destination is a place this project has
  // no name for.
  const read = page.read
  const place =
    recordId !== null
      ? read !== null && read.title.trim() !== ''
        ? read.title
        : title !== null && title.trim() !== ''
          ? title
          : LEADING.aRecord
      : where.target.kind === 'page'
        ? nameAPage(where.target.route, page.read, page.developer)
        : nameTarget(where.target)
  const project = projectNamedByTarget(where.target)
  if (project === null || project === here) return place
  return LEADING.inAnotherProject(place, nameOfTheProject(project))
}

/**
 * THE RECORDS THESE LEADS' PAGES SHOW, each read once, and a reader that hands back the one a lead's
 * page shows, or null where nothing is known.
 *
 * Each record is read in the project its lead names, or in the reader's own project where the lead
 * names none. Both screens that draw an offer call this, so the two say one thing about one lead.
 */
export function useWhatALeadsPageShows(
  leads: readonly Context[],
  here: string,
): (lead: Context) => WhatARecordIs | null {
  const ask = (lead: Context): { id: string; workspaceId: string } | null => {
    // A LEAD THAT NAMES A RECORD IS READ IN THE PROJECT THE LEAD NAMES. This is the read that used
    // to be missing: a record in another project was looked for here, and the offer said the project
    // held no such place.
    const recordId = recordNamedByTarget(lead.target)
    if (recordId !== null) return { id: recordId, workspaceId: projectNamedByTarget(lead.target) ?? here }
    if (lead.target.kind !== 'page') return null
    const shows = theRecordAPageShows(lead.target.route)
    if (shows === null) return null
    return { id: shows.id, workspaceId: projectNamedByTarget(lead.target) ?? here }
  }
  const asks = leads.map(ask).filter((one): one is { id: string; workspaceId: string } => one !== null)
  const read = useWhatRecordsAre(asks)
  return (lead) => {
    const one = ask(lead)
    return one === null ? null : (read.get(recordInProject(one.id, one.workspaceId)) ?? null)
  }
}

/**
 * GO WHERE A LEAD POINTS, FLASH WHAT IT NAMES ONCE, AND MARK IT READ. Returns a refusal, or null.
 *
 * It is a plain function and not part of a component because two screens press it: the offer card
 * on the page and the same offer drawn in the messages panel. Two copies of "what taking an offer
 * does" would be the defect this repository keeps finding.
 *
 * IT IS ONLY EVER CALLED FROM A PRESS, OR FROM FOLLOWING. Nothing else in this file moves a page.
 */
export async function goToTheLead(where: Context, messageId: string): Promise<string | null> {
  // Both the floating offer and the chat press come here. Remember the acceptance before a
  // project change can rebuild the panel, even while the server's seen write is still pending.
  const reader = readerKey()
  answerForReader(reader, messageId, Infinity)
  // One acceptance chooses both the page and its project (criterion M60). navigate publishes the
  // address before notifying project readers, so the old report is never re-read in the new project.
  //
  // A LEAD THAT NAMES NO PROJECT MOVES NOBODY BETWEEN PROJECTS. `projectNamedByTarget` answers null
  // for every target that does not say, and null here means "stay where you are" rather than a
  // guess about which project the thing is in.
  const project = projectNamedByTarget(where.target)

  // WHERE TO GO: a page target IS an address; anything inside a record goes to that record's page.
  // A lead naming neither moves nobody, which is what it did before pages could be led to.
  const route = pageNamedByTarget(where.target)
  const recordId = recordNamedByTarget(where.target)
  if (route !== null) navigate(route, project)
  else if (recordId !== null) navigate(recordPath(recordId), project)
  showMeThat({ key: contextKey(where), context: where, annotationId: messageId, lead: true })
  try {
    await api.markMessage(messageId, 'seen')
    return null
  } catch (err: unknown) {
    // The page has moved and the offer is still marked as waiting. Said rather than swallowed: the
    // reader would otherwise be offered the same thing again with no way to tell why.
    answerForReader(reader, messageId, null)
    return errorMessage(err)
  }
}

export function Leading() {
  useLanguage()
  const followed = useFollowing()
  const here = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const reader = useSyncExternalStore(subscribeActor, readerKey, readerKey)
  const readAnswers = useCallback(() => answersByReader.get(reader) ?? noAnswers, [reader])
  const answered = useSyncExternalStore(subscribeAnswers, readAnswers, readAnswers)
  const readNumber = useRef(0)
  const mounted = useRef(true)
  const isCurrent = useCallback((number: number): boolean =>
    mounted.current && number === readNumber.current && here === currentWorkspace() && reader === readerKey(),
  [here, reader])
  const [pool, setPool] = useState<readonly PoolEntry[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [askingMore, setAskingMore] = useState(false)
  const [me, setMe] = useState<ParticipantRef | null>(null)
  const [who, setWho] = useState<Pick<ParticipantForThePage, 'kind' | 'id' | 'name' | 'handle' | 'record'>[]>([])
  const [fault, setFault] = useState<string | null>(null)
  /**
   * WHY THE LAST PRESS ON AN OFFER WROTE NOTHING, or null. It is apart from `fault`, which a read that
   * succeeds empties: until 4 October 2026 a press's refusal was drawn in `fault` and the read after
   * the press emptied it at once, so nobody saw it (problem 2JUcu1Sg9eg1). The next press empties this.
   */
  const [refused, setRefused] = useState<string | null>(null)
  /** The offer this reader has just been taken to, so its words are on the page they arrived at. */
  const [brought, setBrought] = useState<Offer | null>(null)
  /**
   * WHEN THE FIRST PUT-OFF OFFER COMES BACK, as a moment on this screen's clock, from the offers read's
   * `offersComeBackInSeconds`. Null when the last read said none is put off.
   */
  const [nextBack, setNextBack] = useState<number | null>(null)
  /** This screen's clock when the offers were last drawn against it. */
  const [now, setNow] = useState(() => Date.now())
  /**
   * WHETHER WHAT IS FOLDED AWAY IS UNFOLDED, on a screen too narrow to draw all of it at once.
   *
   * It starts folded, because the cost this closes is the one a reader pays for as long as they are
   * following: a fixed box over a fifth of a narrow screen, whatever they scroll to. The press is
   * drawn only where there is something behind it, so its being there is how a reader knows the
   * agent said something. On a wide screen nothing is folded and the press is not drawn at all.
   */
  const [unfolded, setUnfolded] = useState(false)
  /** The box this draws, measured for the room it takes at the window's foot on a narrow screen. */
  const box = useRef<HTMLDivElement>(null)

  /**
   * CLOSING THE PANE THE LEAD OPENED. Criterion M95, from a message: a lead that pops up has a
   * close button, and no reload is needed to close it.
   *
   * IT CLOSES THE PANE AND DOES NOTHING ELSE. `brought` holds what the reader was taken here to
   * read, and `goToTheLead` marked it read at the moment they pressed to come. So closing writes
   * nothing, sends nothing and unmarks nothing: the chat is exactly as it was, which is what the
   * criterion asks for. Following is untouched — the stop press is M8's, and closing the words the
   * agent said does not stop the reader being led.
   */
  const closeThePane = useCallback(() => {
    setBrought(null)
    setUnfolded(false)
  }, [])

  /**
   * ESCAPE CLOSES IT TOO, and the listener exists only while there is something to close.
   *
   * It is on `window` rather than on the card, because the reader's hands are wherever they were
   * reading — being stuck with the pane while doing something else is the whole of the complaint.
   */
  useEffect(() => {
    if (brought === null) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      closeThePane()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [brought, closeThePane])

  const readOffers = useCallback(async () => {
    const [read, following] = await Promise.all([
      api.offersWaitingForMe(),
      followed === null ? Promise.resolve(null) : api.offersWaitingForMe(0, participantKey(followed)),
    ])
    const held = new Set(read.messages.map((one) => one.id))
    return { ...read, messages: [...read.messages, ...(following?.messages.filter((one) => !held.has(one.id)) ?? [])] }
  }, [followed])

  const readThePool = useCallback(async function readPool(): Promise<void> {
    if (!mounted.current || here !== currentWorkspace() || reader !== readerKey()) return
    const number = ++readNumber.current
    const stillHere = stillOnThisPage()
    const askedAtPress = presses
    try {
      // ONLY WHAT CAN BE AN OFFER: a message with a delivery to this reader not marked seen. The
      // whole pool was read here on every delivery change, 2.4 MB for a handful of offers.
      //
      // AN EVENT ASKS AGAIN. The answer this page holds was read before the event, so drawing it
      // would be drawing what the event just changed.
      // Navigation must not use a held answer, or join a read started before the press.
      const read = await readOffers()
      if (!isCurrent(number)) return
      // A reply begun before a page press cannot revive an offer on the new page. Ask afresh
      // only for this crossing read; a settled offer stays on screen across ordinary page moves.
      if (!stillHere()) {
        if (askedAtPress !== presses) leaveOffersForAPress(reader, read.messages)
        void readPool()
        return
      }
      setPool(read.messages)
      setNextOffset(read.next === null ? null : read.returned)
      setNextBack(theMomentItComesBack(read.offersComeBackInSeconds))
      setFault(null)
    } catch (err: unknown) {
      if (isCurrent(number)) setFault(errorMessage(err))
    }
  }, [here, reader, isCurrent, readOffers])

  const readMore = useCallback(async () => {
    if (nextOffset === null || askingMore) return
    const number = readNumber.current
    setAskingMore(true)
    try {
      const read = await api.offersWaitingForMe(nextOffset)
      if (!isCurrent(number)) return
      setPool((held) => {
        const ids = new Set(held.map((one) => one.id))
        return [...held, ...read.messages.filter((one) => !ids.has(one.id))]
      })
      setNextOffset(read.next === null ? null : nextOffset + read.returned)
      setFault(null)
    } catch (err: unknown) {
      if (isCurrent(number)) setFault(errorMessage(err))
    } finally {
      setAskingMore(false)
    }
  }, [askingMore, isCurrent, nextOffset])

  /** The names an offer is drawn with, read once for every panel that asks at the same moment. */
  const readTheNames = useCallback(async () => {
    const registries = await readTheParticipantsOnce.again()
    setWho([...registries.people, ...registries.agents])
  }, [])

  /** Who is reading, from the circle's shared read, which the chat panel asks for too (GET /api/messages/circle). */
  const readTheContacts = useCallback(async () => {
    const lines = await readCircleOnce.again()
    setMe(lines.me)
    theReaderIs(lines.me)
  }, [])

  const readAgain = useCallback(async function readPanel(): Promise<void> {
    const number = ++readNumber.current
    const stillHere = stillOnThisPage()
    const askedAtPress = presses
    try {
      // ONLY WHAT CAN BE AN OFFER: a message with a delivery to this reader not marked seen. The
      // whole pool was read here on every delivery change, 2.4 MB for a handful of offers.
      //
      // The names may use the shared read. Offers must be asked afresh at every mount and project
      // change: a held unseen answer may have been marked seen since it was read. Who is reading
      // is not asked here: it is needed only to pick the
      // offers out of a pool that holds some, and the effect below asks it then (wave 13x round 13).
      const [held, registries] = await Promise.all([readOffers(), readTheParticipantsOnce()])
      // A newer offer read supersedes these offers, not the names. Keep the names for this
      // mounted reader and project even when connection recovery read the offers meanwhile.
      if (!mounted.current || here !== currentWorkspace() || reader !== readerKey()) return
      setWho([...registries.people, ...registries.agents])
      if (!isCurrent(number)) return
      if (!stillHere()) {
        if (askedAtPress !== presses) leaveOffersForAPress(reader, held.messages)
        void readPanel()
        return
      }
      setPool(held.messages)
      setNextOffset(held.next === null ? null : held.returned)
      setNextBack(theMomentItComesBack(held.offersComeBackInSeconds))
      setFault(null)
    } catch (err: unknown) {
      if (isCurrent(number)) setFault(errorMessage(err))
    }
  }, [isCurrent, here, reader, readOffers])

  /**
   * WHO IS READING, ONCE THE POOL HOLDS SOMETHING TO PICK FROM. An empty pool draws no offer whoever reads it, so every
   * page with no offer waiting asks nothing for it. The chat panel says who is reading from its own read on every
   * page, and that answer is taken when it is there. Otherwise the circle's shared read is asked, as before. Both are
   * the server's `whoIsAsking`, so they are the same answer. It asked GET /api/messages/circle on every page before,
   * beside the chat panel's own read of the same `me` (wave 13x round 13).
   */
  useEffect(() => {
    if (pool.length === 0 || me !== null) return
    const known = whoIsReading()
    if (known !== 'notKnownYet') {
      setMe(known)
      return
    }
    void readCircleOnce().then(
      (lines) => {
        setMe(lines.me)
        theReaderIs(lines.me)
      },
      (err: unknown) => setFault(errorMessage(err)),
    )
  }, [pool, me])


  const allOffers = useMemo(() => offersWaitingFor(me, pool), [me, pool])
  const offers = useMemo(() => theOffersStillToDraw(allOffers, answered, now), [allOffers, answered, now])

  /*
   * WHEN AN OFFER PUT OFF WITH NOT NOW COMES BACK, the panel reads the offers again. The moment is the
   * earlier of two: when the last offers read said the first put-off offer comes back, and when an
   * offer this screen put off comes back. At that moment the clock this panel draws against moves on
   * too, so an offer this screen put off is drawn again if the read still holds it. A second past the
   * moment, so the server's wait has ended when the read reaches it.
   */
  useEffect(() => {
    const here = [...answered.values()].filter((one) => one !== Infinity && one > now)
    const moments = nextBack === null ? here : [...here, nextBack]
    if (moments.length === 0) return undefined
    const wait = Math.max(0, Math.min(...moments) - Date.now()) + 1000
    const timer = window.setTimeout(() => {
      setNow(Date.now())
      void readThePool()
    }, wait)
    return () => {
      window.clearTimeout(timer)
    }
  }, [answered, nextBack, now, readThePool])

  /*
   * WHAT IS WAITING FOR THIS READER, read when an event can move it and nothing else.
   *
   * The pool holds messages addressed to this reader and not marked seen, so it narrows by the
   * mapping's own rule for it: a new message or an offer addressed to the reader, or a mark reaching
   * `seen` on one addressed to the reader — which is how taking an offer on one screen takes it off
   * every other screen this person has open. A mark moving on somebody else's message during a run —
   * most of what the channel carries — reads nothing here.
   *
   * THE MARK'S OWN MESSAGE IS CHECKED AGAINST THE POOL THIS PANEL HOLDS (`aSeenMarkTouchesThisPool`):
   * a message that is not an entry in the pool cannot leave it.
   *
   * NOBODY CAN SAY WHO IS READING YET — the contacts have not landed in the first moment of a page —
   * so the pool is read then too. Reading it once too often at page-open is one request; missing one
   * offer is a way in that never appears.
   *
   * THE CONTACTS AND THE NAMES ride the same mapping through the shared reads, so they cost nothing
   * extra and arrive when the event names them.
   *
   * Reads of one burst are gathered into one (`useAfterTheBurst`), as in the chat panel.
   */
  const readAfterTheBurst = useAfterTheBurst((lists) => {
    if (lists.has('waitingForMe')) void readThePool()
    if (lists.has('contacts')) void readTheContacts()
    if (lists.has('participants')) void readTheNames()
  })
  useChannel(
    useCallback(
      (event) => {
        // A MESSAGE THAT OFFERS TO TAKE NOBODY ANYWHERE CANNOT BE AN OFFER, and offers are all this panel
        // draws; the event carries the message now, so it says which it is. An event that carries
        // nothing is read as before.
        if (event.name === 'message.new' && event.lists !== undefined && event.lists !== null && event.lists.entry.lead === null) return
        // `me` above is what the contacts said; this is what the panels know right now, which may
        // still be nobody-has-looked-yet in the first moment of a page.
        const reader = whoIsReading()
        const lists = listsAnEventChanges(event, reader === 'notKnownYet' ? null : reader, null)
        if (!lists.has('waitingForMe') && reader !== 'notKnownYet') return
        if (event.name === 'delivery.changed' && lists.has('waitingForMe') && (event.mark === 'seen' || event.offerPutOff === true)) {
          const key = readerKey()
          const next = new Map(answersByReader.get(key) ?? noAnswers)
          for (const id of event.messageIds) next.set(id, event.mark === 'seen' ? Infinity : whenAPutOffOfferComesBack(Date.now()))
          answersByReader.set(key, next)
          ++readNumber.current
          for (const listener of answerListeners) listener()
        }
        if (!aSeenMarkTouchesThisPool(event, allOffers.map((one) => one.messageId))) return
        readAfterTheBurst(lists)
      },
      [readAfterTheBurst, allOffers],
    ),
    LEADING_DRAWS,
  )
  // AND WHEN EVENTS WERE LOST, the pool is read once, because what it holds may be missing some.
  useEffect(() => whenEventsWereLost(() => {
    void readThePool()
  }), [readThePool])

  // WHICH PROJECT THIS BROWSER IS READING, AND WHAT THE OTHERS ARE CALLED. An offer that would move
  // the reader to another project says so before it is pressed — criterion M60 and `whereALeadGoes`.
  const projects = useProjects()
  const nameOfProjectHere = useCallback((id: string): string => nameOfProject(projects, id), [projects])

  /**
   * THE OFFERS GO WHEN THE READER DOES, IN THE SAME RENDER. A SWITCH OF PROJECT KEEPS THEM.
   *
   * Everything this clears belongs to the reader, not to one project. The offers are read from the
   * message centre, which answers the same in every project. The same is true of who is reading, of
   * the reason a press wrote nothing, and of the words that brought the reader here. Until round
   * 171 of wave 13y they were cleared at a switch of project as well. An offer on screen then
   * vanished until the next read came back, and a lead into another project lost the words that
   * brought the reader there, because the switch the lead makes cleared them just after the press
   * had set them.
   *
   * What does depend on the project is worked out again at every render, from `here`: the words
   * "in another project" (`whereALeadGoes`), and the project in which the record of a lead that
   * names no project is looked up (`useWhatALeadsPageShows`). Until that record is read there, the
   * offer says only what its address says. The offers and the names are still read again after a
   * switch, because `readAgain` depends on `here`. The header of src/web/App.tsx states the rule.
   *
   * Settled offers and the words that brought the reader here survive ordinary page moves.
   * Only a read that crosses a page press must ask again before drawing or navigating.
   */
  const [readFor, setReadFor] = useState(reader)
  if (readFor !== reader) {
    setReadFor(reader)
    setPool([])
    setMe(null)
    setBrought(null)
    setFault(null)
    setRefused(null)
  }
  useEffect(() => {
    mounted.current = true
    void readAgain()
    return () => {
      mounted.current = false
      ++readNumber.current
    }
  }, [readAgain])

  // WHAT EACH RECORD AN OFFER POINTS AT IS CALLED. An id is a machine word and never goes on a
  // screen where a name belongs; lib/titles.ts is the one reader of them.
  const titles = useRecordTitles(offers.map((one) => one.recordId ?? ''))
  // WHAT EACH PAGE AN OFFER POINTS AT SHOWS, and whether the reader is in developer mode, where the
  // page's address is drawn too.
  const pageShows = useWhatALeadsPageShows(
    offers.map((one) => one.where),
    here,
  )
  const developer = useInspect()

  /**
   * THE NAME OF THE PARTICIPANT A REFERENCE NAMES, or null because nobody the page read answers to it.
   *
   * A REFERENCE IS READ AS A STORED SENDER IS (wave 13y round 83): by its id, then by an agent's own
   * record, then by an agent's handle, in `theAgentAStoredSenderNames`. A reader may follow an agent
   * by its record's id or by its handle, and the pane matched the registry's id only. It then drew
   * the string it was given where the agent's name belongs. Null is drawn as a sentence that says the
   * page has no name for the agent.
   */
  const everyone: KnownParticipant[] = who.map((one) => ({
    who: { kind: one.kind as ParticipantKind, id: one.id },
    name: one.name,
    handle: one.handle,
    record: one.record,
  }))
  const nameOf = (ref: ParticipantRef): string | null => {
    const answers = theAgentAStoredSenderNames(ref, everyone)
    if (answers === null) return null
    return who.find((one) => one.kind === answers.kind && one.id === answers.id)?.name ?? null
  }

  /** Keep one offer off this screen until `until`, or draw it again when `until` is null. */
  const answer = useCallback((messageId: string, until: number | null): void => {
    answerForReader(reader, messageId, until)
  }, [reader])

  /** Go where an offer points, box what it names, and mark the offer read. */
  const goThere = useCallback(
    async (offer: Offer): Promise<void> => {
      // WHAT THE READER WAS BROUGHT HERE FOR, KEPT SO IT CAN BE DRAWN. Taking an offer marks it
      // read, so it leaves the list of offers; without this the words that brought somebody here
      // would go off the screen at the moment they arrived at it.
      setBrought(offer)
      const why = await goToTheLead(offer.where, offer.messageId)
      setRefused(why)
      void readThePool()
    },
    [readThePool],
  )

  const leaveIt = useCallback(
    async (offer: Offer): Promise<void> => {
      // THE OFFER LEAVES THE SCREEN AT THE PRESS, until it comes back. The message stays unread.
      answer(offer.messageId, whenAPutOffOfferComesBack(Date.now()))
      try {
        await api.putOffALeadOffer(offer.messageId)
        setRefused(null)
      } catch (err: unknown) {
        // NOTHING WAS PUT OFF, so the offer is drawn again, with the reason.
        answer(offer.messageId, null)
        setRefused(errorMessage(err))
      }
      void readThePool()
    },
    [answer, readThePool],
  )

  /**
   * WHILE FOLLOWING, AN OFFER FROM THAT AGENT IS TAKEN AT ONCE.
   *
   * This is the whole of what following does, and it is the only path in this file that moves the
   * page without a press. An offer from anybody else is drawn as an offer, exactly as it would be
   * if nobody were being followed.
   */
  useEffect(() => {
    if (followed === null) return
    const attempts = automaticAttemptsByReader.get(reader) ?? new Set<string>()
    automaticAttemptsByReader.set(reader, attempts)
    const mine = offers.find((one) => sameParticipant(one.from, followed) && !attempts.has(one.messageId) && !leftForAPressByReader.get(reader)?.has(one.messageId))
    if (mine === undefined) return
    const number = readNumber.current
    const stillHere = stillOnThisPage()
    const askedAtPress = presses
    let live = true
    // Even a pool freshly read on mount can be older than starting to follow. Check that this
    // very offer still waits before navigation; a held pool is never authority to move the page.
    void api.offersWaitingForMe(0, participantKey(followed)).then((read) => {
      if (!live || !isCurrent(number)) return
      if (!stillHere()) {
        if (askedAtPress !== presses) leaveOffersForAPress(reader, read.messages)
        void readThePool()
        return
      }
      const fresh = offersWaitingFor(me, read.messages).find((one) => one.messageId === mine.messageId)
      if (fresh === undefined || (answersByReader.get(reader)?.get(fresh.messageId) ?? -Infinity) > Date.now()) return
      attempts.add(fresh.messageId)
      void goThere(fresh)
    }, (err: unknown) => { if (live) setFault(errorMessage(err)) })
    return () => { live = false }
  }, [followed, offers, goThere, isCurrent, reader, me, readThePool])

  const end = async (): Promise<void> => {
    if (followed === null) return
    stopFollowing()
    try {
      await api.sendMessage(followed, LEADING.stoppedFollowing)
    } catch (err: unknown) {
      setFault(errorMessage(err))
    }
  }

  // A failed automatic mark may be retried by a press, but may never start a navigation loop.
  const toOffer = followed === null ? offers : offers.filter((one) =>
    !sameParticipant(one.from, followed) || automaticAttemptsByReader.get(reader)?.has(one.messageId) || leftForAPressByReader.get(reader)?.has(one.messageId),
  )

  const drawn = !(followed === null && toOffer.length === 0 && brought === null && fault === null && refused === null && nextOffset === null)
  useTheLeadIsRoomAtTheFoot(box, drawn)
  if (!drawn) return null

  const said = brought === null || brought.words === '' ? null : brought
  /**
   * WHILE FOLLOWING, THE AGENT'S WORDS AND THE STOP CONTROL ARE ONE CARD AND NOT TWO.
   *
   * They were two, and on a narrow screen the pair was 90 per cent of the width and a fifth of the
   * height, fixed, for as long as the reader was following — measured at 390 by 972 on 4 September
   * 2026, problem `O184ESMBfKbN`. They are one state: this reader is being led by this agent, and
   * this is the last thing it said. So they are one card. When nobody is being followed, the words
   * that brought somebody here still stand on their own, because there is no stop control to join.
   */
  const onItsOwn = followed === null ? said : null

  /** The press that unfolds the words. One state for the whole box, because it is one box. */
  const foldPress = (
    <button
      type="button"
      className="px-lead-fold"
      onClick={() => {
        setUnfolded(!unfolded)
      }}
    >
      {unfolded ? LEADING.foldItAway : LEADING.whatItSaid}
    </button>
  )

  /**
   * THE PRESS THAT CLOSES THE PANE. Criterion M95.
   *
   * DRAWN AT EVERY WIDTH, which is the whole point of it. The fold press beside it is `display:
   * none` above 60rem, so until 9 September 2026 the pane a lead opened carried NO press at all at a
   * desk — they had to reload the page to be rid of it. This one is never folded away and never
   * narrowed to nothing.
   */
  const closePress = (who: ParticipantRef) => (
    <button
      type="button"
      className="px-lead-close"
      aria-label={LEADING.closeThePaneSaid(nameOf(who))}
      onClick={closeThePane}
    >
      {LEADING.closeThePane}
    </button>
  )

  return (
    <>
      <style href="mole-office-leading" precedence="default">
        {CSS_RULES}
      </style>
      <div ref={box} className="px-lead-here" data-unfolded={unfolded ? 'yes' : 'no'}>
        {onItsOwn === null ? null : (
          <div className="px-lead-brought">
            <p className="px-lead-words px-lead-one-line">{LEADING.broughtYouHere(nameOf(onItsOwn.from))}</p>
            <p className="px-lead-said">{onItsOwn.words}</p>
            <div className="px-lead-acts">
              {foldPress}
              {closePress(onItsOwn.from)}
            </div>
          </div>
        )}
        {followed === null ? null : (
          <div className="px-lead-following">
            {said === null ? null : (
              // THE WORDS KEEP THE NAME THEY HAD WHEN THEY WERE A CARD OF THEIR OWN: this is still
              // what brought the reader here, and it is what anything reading the page looks for.
              <div className="px-lead-brought px-lead-folds">
                <p className="px-lead-words">{LEADING.broughtYouHere(nameOf(said.from))}</p>
                <p className="px-lead-said">{said.words}</p>
              </div>
            )}
            {/* THE ONE LINE A NARROW SCREEN GETS. Everything above it folds away; this does not. */}
            <div className="px-lead-line">
              <p className="px-lead-short">{LEADING.following(nameOf(followed))}</p>
              {said === null ? null : (
                <span className="px-lead-dot-and-fold">
                  <span className="px-lead-dot" aria-hidden="true">·</span>
                  {foldPress}
                </span>
              )}
              {/* AND THE CLOSE PRESS IS ON THIS LINE TOO, so the words an agent left are closable
                  while the reader goes on being led. Criterion M95. Closing them does not stop the
                  following — the press beside it is what does that, and M8 says it is never folded
                  away. */}
              {said === null ? null : closePress(said.from)}
              <button
                type="button"
                className="px-lead-stop"
                aria-label={LEADING.stopFollowing(nameOf(followed))}
                onClick={() => {
                  void end()
                }}
              >
                {/* WHAT THE PRESS IS CALLED IS THE SAME EITHER WAY: the whole sentence is its
                    accessible name at every width, and the short word is what a narrow screen has
                    room to draw. */}
                <span className="px-lead-wide-word">{LEADING.stopFollowing(nameOf(followed))}</span>
                <span className="px-lead-narrow-word">{LEADING.stop}</span>
              </button>
            </div>
          </div>
        )}
        {toOffer.length === 0 && nextOffset === null ? null : <div className="px-lead-offers">
        {toOffer.map((offer) => {
          // THE WHOLE SENTENCE, ONCE, so the line and the hover text cannot say different things.
          // On a narrow screen it wraps to two lines (`px-lead-two-lines`), so the project, which
          // comes first, and the place after it are both read; past two lines the rest is cut, and
          // the hover text still holds all of it. Their order of 6 September 2026, as the review of
          // wave 13n's round 29 applies it.
          const place = whereALeadGoes(offer.where, knownTitleOf(titles, offer.recordId), here, nameOfProjectHere, {
            read: pageShows(offer.where),
            developer,
          })
          const says = LEADING.offer(nameOf(offer.from), place)
          return (
          <div
            className="px-lead-offer"
            key={offer.messageId}
            data-lead-from={participantKey(offer.from)}
            data-lead-message={offer.messageId}
          >
            <p className="px-lead-words px-lead-two-lines" title={says}>
              {says}
            </p>
            {/* WHEN ITS MESSAGE WAS SENT, so two offers that say the same thing can be told apart. */}
            <p className="px-lead-when">{drawnStamp(offer.sentAt)}</p>
            {offer.words === '' ? null : <p className="px-lead-said">{offer.words}</p>}
            <div className="px-lead-acts">
              {offer.words === '' ? null : foldPress}
              <button
                type="button"
                className="px-lead-go"
                onClick={() => {
                  void goThere(offer)
                }}
              >
                {LEADING.takeMe}
              </button>
              <button
                type="button"
                className="px-lead-not"
                onClick={() => {
                  void leaveIt(offer)
                }}
              >
                {LEADING.notNow}
              </button>
            </div>
          </div>
          )
        })}
        {nextOffset === null ? null : (
          <button type="button" className="px-lead-more" disabled={askingMore} onClick={() => { void readMore() }}>
            {t('messagePages.moreOffers')}
          </button>
        )}
        </div>}
        {fault === null ? null : <p className="px-lead-fault">{fault}</p>}
        {refused === null ? null : <p className="px-lead-fault">{refused}</p>}
      </div>
    </>
  )
}

/**
 * ON A NARROW SCREEN THE LEAD'S BAND IS ROOM AT THE PAGE'S FOOT. Under the lead's narrow line the box is a band across
 * the window's foot, and the page's last line was drawn under it. The band's height is written on the root as
 * `--lead-room` whenever its size changes, and the shell's foot adds it to the room it keeps there, so the last line
 * can be scrolled clear of the band. Above the line the box is a card in the corner; the room extends from
 * its top to the window's foot, so the last content can be scrolled clear of the card too.
 * When the box goes, so does the room.
 *
 * THE READER'S PLACE MOVES ONCE, when the window's scroll becomes the page box's. A later measure,
 * after the band changes height, keeps whatever place the reader has reached; it must not put them
 * back at the place measured when the band first took its room.
 */
function useTheLeadIsRoomAtTheFoot(box: { current: HTMLElement | null }, drawn: boolean): void {
  useLayoutEffect(() => {
    const band = box.current
    if (!drawn || band === null) return
    const root = document.documentElement
    const narrow = window.matchMedia(THE_LEAD_IS_NARROW)
    let inFlow = false
    let fromTheWindow = false
    let wasAt = 0
    const measure = () => {
      if (narrow.matches) {
        const entering = !inFlow
        if (entering) {
          const before = thePageScroller()
          fromTheWindow = before === (document.scrollingElement ?? document.documentElement)
          wasAt = before.scrollTop
          inFlow = true
        }
        root.setAttribute('data-lead-band', 'yes')
        root.style.setProperty('--lead-room', `${String(Math.ceil(band.getBoundingClientRect().height))}px`)
        if (entering && fromTheWindow) {
          const main = document.getElementById('main')
          if (main !== null && main.scrollTop !== wasAt) main.scrollTop = wasAt
        }
        return
      }
      const main = document.getElementById('main')
      const at = main?.scrollTop ?? 0
      root.removeAttribute('data-lead-band')
      root.style.setProperty('--lead-room', `${String(Math.ceil(window.innerHeight - band.getBoundingClientRect().top))}px`)
      if (inFlow && fromTheWindow) {
        document.body.getBoundingClientRect()
        window.scrollTo(0, at)
      }
      inFlow = false
      fromTheWindow = false
    }
    measure()
    const follow = new ResizeObserver(measure)
    follow.observe(band)
    narrow.addEventListener('change', measure)
    return () => {
      follow.disconnect()
      narrow.removeEventListener('change', measure)
      const main = document.getElementById('main')
      const at = main?.scrollTop ?? 0
      root.style.removeProperty('--lead-room')
      root.removeAttribute('data-lead-band')
      if (inFlow && fromTheWindow) {
        document.body.getBoundingClientRect()
        window.scrollTo(0, at)
      }
    }
  }, [box, drawn])
}

/**
 * THE RIGHT-CLICK ENTRY THAT STARTS FOLLOWING ONE AGENT, drawn inside the composer.
 *
 * Any right-click can start following an agent to a report. A right-click anywhere in Mole Office opens the
 * composer about whatever is under the pointer, so this is where that entry belongs — there is one
 * right-click menu in the product and this is it.
 *
 * WHICH AGENTS ARE OFFERED. The ones something is serving right now, and the ones with an offer
 * already waiting. An agent that is neither cannot take anybody anywhere until it is woken, and a
 * press that did nothing would be a press that lied.
 */
export function FollowFromHere({ onDone }: { onDone?: () => void }) {
  useLanguage()
  const followed = useFollowing()
  const [agents, setAgents] = useState<{ who: ParticipantRef; name: string }[]>([])
  const [catalog, setCatalog] = useState<{ who: ParticipantRef; name: string }[]>([])
  const [me, setMe] = useState<ParticipantRef | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [askingMore, setAskingMore] = useState(false)
  const [fault, setFault] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [registries, seen, pool, contacts] = await Promise.all([
          api.participants(),
          api.presence(),
          api.offersWaitingForMe(),
          api.messageContacts(),
        ])
        const waiting = new Set(
          offersWaitingFor(contacts.me, pool.messages).map((one) => participantKey(one.from)),
        )
        const online = new Set(
          seen.presence.filter((one) => one.colour === 'green').map((one) => participantKey(one.who as ParticipantRef)),
        )
        const everyone = registries.agents.map((one): { who: ParticipantRef; name: string } => ({ who: { kind: 'agent', id: one.id }, name: one.name }))
        setCatalog(everyone)
        setMe(contacts.me)
        setNextOffset(pool.next === null ? null : pool.returned)
        setAgents(everyone.filter((one) => waiting.has(participantKey(one.who)) || online.has(participantKey(one.who))))
      } catch (err: unknown) {
        setFault(errorMessage(err))
      }
    })()
  }, [])

  const readMore = async (): Promise<void> => {
    if (nextOffset === null || askingMore) return
    setAskingMore(true)
    try {
      const pool = await api.offersWaitingForMe(nextOffset)
      const waiting = new Set(offersWaitingFor(me, pool.messages).map((one) => participantKey(one.from)))
      setAgents((held) => {
        const ids = new Set(held.map((one) => participantKey(one.who)))
        return [...held, ...catalog.filter((one) => waiting.has(participantKey(one.who)) && !ids.has(participantKey(one.who)))]
      })
      setNextOffset(pool.next === null ? null : nextOffset + pool.returned)
      setFault(null)
    } catch (err: unknown) {
      setFault(errorMessage(err))
    } finally {
      setAskingMore(false)
    }
  }

  const start = async (who: ParticipantRef): Promise<void> => {
    startFollowing(who)
    try {
      await api.sendMessage(who, LEADING.startedFollowing)
    } catch (err: unknown) {
      setFault(errorMessage(err))
    }
    onDone?.()
  }

  const offer = agents.filter((one) => !sameParticipant(one.who, followed ?? { kind: 'person', id: '' }))
  if (offer.length === 0 && fault === null && nextOffset === null) return null

  return (
    <div className="px-lead-from-here">
      <style href="mole-office-leading" precedence="default">
        {CSS_RULES}
      </style>
      {offer.map((one) => (
        <button
          key={participantKey(one.who)}
          type="button"
          className="px-lead-follow"
          onClick={() => {
            void start(one.who)
          }}
        >
          {LEADING.followWith(one.name)}
        </button>
      ))}
      {nextOffset === null ? null : <button type="button" className="px-lead-follow" disabled={askingMore} onClick={() => { void readMore() }}>{t('messagePages.moreAgents')}</button>}
      {fault === null ? null : <p className="px-lead-fault">{fault}</p>}
    </div>
  )
}

/** This app's own wide-and-narrow line, at which the lead's box becomes a band across the window's foot. */
const THE_LEAD_IS_NARROW = '(max-width: 60rem)'

/**
 * The rules for the offer and the stop control.
 *
 * They sit at the bottom right, above the messages circle. Every value is a token.
 *
 * ---------------------------------------------------------------------------------------
 * ON A NARROW SCREEN THE WHOLE THING IS ONE LINE
 * ---------------------------------------------------------------------------------------
 *
 * This box is fixed to the screen, so whatever it covers it covers for as long as it is there,
 * whatever the reader scrolls to. At 390 by 972 that was 352 pixels wide and 208 tall while
 * following: 90 per cent of the width and a fifth of the height, measured on 4 September 2026.
 * Problem O184ESMBfKbN.
 *
 * So under 60rem it is one line — the name of the agent being followed and the press that stops it
 * — and everything else folds away behind one press. The stop press is never folded: criterion M8
 * says it is on screen the whole time. Above 60rem the card remains in the corner, and the page keeps
 * enough room at its foot to scroll its last content above the card.
 *
 * AND UNDER 60REM THE BOX IS A BAND ACROSS THE FOOT OF THE WINDOW, its height given to the page as
 * room at the page's foot (`useTheLeadIsRoomAtTheFoot`). As a card in the corner it covered the
 * page's last line at 660, and at 390 it cut the guide's name, in round 166's pictures. Now the name
 * wraps instead of being cut, and the page's last line can be scrolled clear of the band. A line in
 * the middle of the page still scrolls under the band, as it does under the bar at the top.
 */
const CSS_RULES = `
/* AT THE BOTTOM RIGHT, ABOVE THE MESSAGES CIRCLE. It was at the bottom left and it covered the
   rail: the last four rows of the navigation went under it, measured at 1440 on 4 September 2026.
   The circle is 3rem tall at 1rem from the bottom, so 5rem clears it. */
.px-lead-here {
  position: fixed;
  right: 1rem;
  bottom: 5rem;
  z-index: var(--z-drawer);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: min(22rem, calc(100vw - 2rem));
  /* NEVER TALLER THAN THE WINDOW. Criterion M96: a message that pops up beside the chat with too many
     lines must not lose its top lines out of sight, where they cannot be selected. This box is fixed
     by its BOTTOM edge, so a card taller than the window grew upward past the top of it — an agent's
     message on the morning of 9 September 2026 was 69 lines of
     paths meant to be copied, and the first of them could not be reached or selected at any scroll
     position, because a fixed box does not scroll with the page.
     THE CAP IS THE CHAT PANEL'S OWN, out of components/Chat.tsx, written the same way for the same
     reason. 80dvh is the design: some of the page stays readable above the box. The floor under it
     is a hundred dvh less 6rem, which is the 5rem this box sits at plus 1rem of window above it.
     WHY IT IS NOT JUST THE FLOOR, measured on 9 September 2026 at 1440 by 900: with eleven offers
     waiting the box became 804 pixels of a 900-pixel window, from y=16 to y=820, and swallowed the
     whole right-hand column of the page — including the press in the record's own header, which a
     browser then refused to click because this box was over it. A box a reader cannot see past is a
     different way of losing the page from the one M96 is about, and the same number closes both.
     A min-height of nought on the cards is what lets the words inside them scroll rather than
     pushing this box open again: a flex item's default floor is its own content. */
  max-height: min(80dvh, calc(100dvh - 6rem));
}

/* WIDE: nothing is folded, so there is nothing to press and no short form to draw. */
.px-lead-short,
.px-lead-dot,
.px-lead-narrow-word,
.px-lead-fold { display: none; }

.px-lead-line { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
.px-lead-dot-and-fold { display: inline-flex; align-items: center; gap: 0.5rem; }

.px-lead-here > .px-lead-following,
.px-lead-here > .px-lead-brought,
.px-lead-offers > .px-lead-offer {
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  padding: var(--pad);
  box-shadow: var(--elev-2);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* A CARD MAY BE SHORTER THAN ITS WORDS, so the cap above holds and the words scroll. Without this
     a flex item is at least as tall as its content and the box grows off the top of the window
     again, which is exactly what M96 is about. */
  min-height: 0;
}

/* Offers share a scrollable space; the following and close controls stay outside it. */
.px-lead-offers {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.px-lead-offers > .px-lead-offer {
  flex: none;
  max-height: min(80dvh, calc(100dvh - 6rem));
}
.px-lead-more { flex: none; }

/* WHILE FOLLOWING, THE WORDS SIT IN A CARD INSIDE THE FOLLOWING CARD, and the two rules above do not
   reach it. So that inner card scrolls itself, and the line with the stop press under it stays
   inside the window. Problem PVQI-FTYDRNG: eighty lines pushed that line below the bottom of the
   window. A box that scrolls may be shorter than its content, so no min-height is needed here. It
   scrolls whether a narrow screen draws it as a block or not, which is why the scrolling is on this
   card and not on the words alone. */
.px-lead-following > .px-lead-brought {
  overflow-y: auto;
  overscroll-behavior: contain;
}

.px-lead-words { margin: 0; font-size: var(--fs-2); color: var(--text); }
/* A CHINESE LINE BREAKS AT ITS SPACES AND MARKS, NOT BETWEEN TWO CHINESE CHARACTERS, so the last word of
   the offer stays with what comes before it: the last Chinese character of an offer never stands alone on
   a line (a review of wave 13n's round 29). A word too long for the line still breaks, so nothing runs out of the
   box. English breaks at its spaces either way. */
.px-lead-offer .px-lead-words { word-break: keep-all; overflow-wrap: anywhere; }

/* THE WORDS ARE THE PART THAT SCROLLS, AND THE PRESSES STAY PUT. Criterion M96. Scrolling the whole
   box instead would carry the close press out of sight, which is criterion M95's problem back. */
.px-lead-said {
  margin: 0;
  font-size: var(--fs-2);
  color: var(--text-2);
  white-space: pre-wrap;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.px-lead-acts { display: flex; gap: 0.5rem; }

/* WHEN AN OFFER'S MESSAGE WAS SENT. Small and quiet: it is there to tell two offers apart. */
.px-lead-when { margin: 0; font-size: var(--fs-1); color: var(--text-2); }

.px-lead-go,
.px-lead-stop {
  font: inherit;
  font-size: var(--fs-2);
  color: var(--accent-text);
  background: var(--accent);
  border: var(--border-w) solid transparent;
  border-radius: var(--radius-sm);
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

/* THE PRESS IS SHORT, so it stays on one line beside Not now. The place is named in the sentence above it,
   which wraps on its own. */
.px-lead-go { white-space: nowrap; }

.px-lead-not {
  font: inherit;
  font-size: var(--fs-2);
  color: var(--text-2);
  background: none;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.25rem 0.75rem;
  cursor: pointer;
  /* TWO WORDS ON ONE LINE, beside a press that names a place and so takes the room it needs. */
  white-space: nowrap;
}

.px-lead-fault {
  margin: 0;
  font-size: var(--fs-1);
  color: var(--alarm-urgent-ink);
  /* A REFUSAL IS A CARD, NOT LOOSE TEXT. This paragraph is a direct child of the fixed box, so
     without a background and a border its words sit straight on whatever the page has underneath
     them; at 660 and 390 that was Home's clock and Today lines, and neither could be read. */
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  padding: calc(var(--pad) * 0.5);
  box-shadow: var(--elev-2);
}

.px-lead-from-here { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }

.px-lead-follow, .px-lead-more {
  font: inherit;
  font-size: var(--fs-2);
  color: var(--text);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

.px-lead-follow:hover { border-color: var(--border-strong); }

.px-lead-fold {
  font: inherit;
  font-size: var(--fs-1);
  color: var(--text-2);
  background: none;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.125rem 0.5rem;
  cursor: pointer;
  white-space: nowrap;
}

.px-lead-fold:hover { color: var(--text); border-color: var(--border-strong); }

/* THE CLOSE PRESS. Criterion M95. It is drawn at every width — the rule below that folds things
   away on a narrow screen does not name it, and must not: a pane with no way out is what this
   press exists to stop. */
.px-lead-close {
  font: inherit;
  font-size: var(--fs-1);
  color: var(--text-2);
  background: none;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.125rem 0.5rem;
  cursor: pointer;
  white-space: nowrap;
  margin-inline-start: auto;
}

.px-lead-close:hover { color: var(--text); border-color: var(--border-strong); }

/* NARROW: ONE LINE, AND THE REST BEHIND A PRESS. 60rem is this app's own wide-and-narrow line. */
@media ${THE_LEAD_IS_NARROW} {
  /* A BAND ACROSS THE FOOT OF THE WINDOW, above the strip a failed re-read draws there. Its right end keeps clear of the
     corner chat button, as that strip's does. */
  .px-lead-here {
    left: 0;
    right: 0;
    bottom: var(--reread-room, 0px);
    width: auto;
    padding-right: calc(var(--fab-size) + 2 * var(--fab-inset));
    background: var(--panel);
    border-top: var(--border-w) solid var(--border-strong);
    box-shadow: var(--elev-2);
  }

  /* THE BAND TAKES ITS OWN ROOM, AND THE PAGE KEEPS THE ROOM ABOVE IT. A fixed band covers whatever
     the page draws under it, at the first view and at every scroll position; room at the page's foot
     only clears the last line once the reader scrolls there. So the shell becomes a column of the
     page and the band, and the page scrolls in the box that is left. The band is then in ordinary
     flow and no page word is ever drawn under it. */
  :root[data-lead-band='yes'] body { height: 100dvh; overflow: hidden; }
  :root[data-lead-band='yes'] body .shell { flex-direction: column; height: 100dvh; min-height: 0; }
  :root[data-lead-band='yes'] body .shell-body { flex: 1 1 auto; min-height: 0; }
  :root[data-lead-band='yes'] body .shell-main { flex: 1 1 auto; min-height: 0; padding-bottom: 0; }
  :root[data-lead-band='yes'] body .shell-main > .page {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: var(--page-end-room);
  }
  :root[data-lead-band='yes'] body .px-lead-here { position: static; flex: none; }

  .px-lead-here > .px-lead-following,
  .px-lead-here > .px-lead-brought,
  .px-lead-offers > .px-lead-offer {
    padding: calc(var(--pad) * 0.5);
    gap: 0.375rem;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  /* The one line comes first, whatever order the folded parts are written in above it. The presses go under the name
     when the two do not fit on one line. */
  .px-lead-line { order: -1; flex-wrap: wrap; gap: 0.375rem; }

  /* THE GUIDE'S WHOLE NAME, on as many lines as it needs. */
  .px-lead-short {
    display: block;
    margin: 0;
    min-width: 0;
    font-size: var(--fs-2);
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .px-lead-dot { display: inline; color: var(--text-2); font-size: var(--fs-2); }
  @media ${NARROW_QUERY} { .px-lead-dot { display: none; } }

  .px-lead-fold { display: inline-flex; }

  .px-lead-wide-word { display: none; }
  .px-lead-narrow-word { display: inline; }

  .px-lead-stop,
  .px-lead-not { padding: 0.125rem 0.5rem; white-space: nowrap; }
  .px-lead-go { padding: 0.125rem 0.5rem; }

  /* WHAT FOLDS AWAY. The stop press is not in here, and it never will be: M8 says it is on screen
     the whole time somebody is being followed. */
  .px-lead-folds,
  .px-lead-offer > .px-lead-said,
  .px-lead-brought > .px-lead-said { display: none; }

  .px-lead-one-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* THE OFFER WRAPS TO TWO LINES, project first, so the place is read as well as the project. A
     third line and more is cut with an ellipsis; the hover text holds the whole sentence. */
  .px-lead-two-lines {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .px-lead-here[data-unfolded="yes"] .px-lead-folds,
  .px-lead-here[data-unfolded="yes"] .px-lead-offer > .px-lead-said,
  .px-lead-here[data-unfolded="yes"] .px-lead-brought > .px-lead-said { display: block; }

  .px-lead-here[data-unfolded="yes"] .px-lead-one-line { white-space: normal; overflow: visible; }
  .px-lead-here[data-unfolded="yes"] .px-lead-two-lines { display: block; overflow: visible; }
}
`
