// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOORS A PAGE'S FRAME AND PAGE BOTH NEED, ASKED ONCE FOR EACH PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On 12 September 2026, on a copy of the owner's database (7,779 records), one home load asked:
 *
 *   GET /api/workspaces                    5 times
 *   GET /api/messages?only=waiting-for-me  4
 *   GET /api/groups                        4
 *   GET /api/participants                  3
 *   GET /api/attention                     1, plus GET /api/attention?machine=omit once
 *
 * They are one question each and every one of them has one answer. The extra requests came from
 * two places: `Chat`, `Forced` and `Leading` are all mounted on every page and each read the
 * registries for itself, and React StrictMode runs every effect twice in the development build. The
 * `useAsync` hook in components/ui.tsx already answers the second cause for a read that goes
 * through it; this answers the first for the reads that do not.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A MODULE AND NOT A HOOK OR A PROP
 * ---------------------------------------------------------------------------------------
 *
 * The frame's read and the page's read cannot be threaded together with a prop when the readers are
 * three floating panels in three different parts of the tree. `src/web/lib/titles.ts` and
 * `src/web/lib/projectlist.ts` already hold one answer for the whole page for exactly this reason;
 * this is the same idea for the five doors those files do not cover. It is NOT a cache with a shelf
 * life: it holds the answer for the project being read, it never hands back an answer for a
 * DIFFERENT project, and `.again()` is how a caller that has just written something asks afresh.
 *
 * KEYED BY PROJECT. A read of any of these doors is answered about one project, so when the reader
 * switches project the old answer is not the new project's, and a slot never hands it back for the
 * new one. The key is `currentWorkspace()`, the same value `useProjectAsync` reads again on.
 *
 * `again()` IS SAFE TO CALL CONCURRENTLY. Three panels acting on one event all call it in the same
 * burst; the first starts the read and the rest join it, so an event still costs one request.
 *
 * `again()` NEVER JOINS A READ THAT BEGAN BEFORE A CHANGE THE PAGE HAS MARKED. Such a read may have
 * been answered before the change, and handing its answer over drew the old line back under a name:
 * the owner set a status in the chat on 25 October 2026 and it did not show (wave 13y round 80). So
 * a call made after a change waits for the read on its way to end and then starts one more, and every
 * call in the same burst joins that one. A change is what `markStale` in src/web/lib/pagecache.ts
 * counts, and every event the chat draws is marked there before any panel hears it. A panel that has
 * just written says so with `.written()` before it reads again, and the read on its way is not joined.
 */

import { api, getActor } from '../api.ts'
import type {
  AttentionHome,
  ShortContactsReply,
  ParticipantsForThePageReply,
  PresenceOnTheWire,
  ShortGroupsReply,
} from '../api.ts'
import type { TheCircle } from '@shared/short-lists.ts'
// The projects reply is declared once, on the server, and read by the frame and by the page.
import type { WorkspacesReply } from '../../server/api/workspaces.ts'
import { currentWorkspace } from './workspace.ts'
import { changesMarked, stamped } from './pagecache.ts'
import { ATTENTION_ASK_FLOOR_MS, READ_COST_FACTOR, oneAsk, type OneAsk } from './oneask.ts'

/**
 * A read that is made once for the project on screen, and made again when a caller says so.
 *
 * `()` gives the answer for this project. The first caller starts the read; every caller in the
 * same burst joins it; a caller after it has answered gets what it answered, without a request.
 * `.again()` drops that answer and starts a new read for this project, or joins one already on its
 * way that began after the last change the page marked. `.held()` gives the answer already read for
 * this project, at once, without starting a read.
 */
export interface OneRead<T> {
  (): Promise<T>
  again(): Promise<T>
  /** Reuse an answer only if no marked change or write came after it began. */
  current(): Promise<T>
  /**
   * THE ANSWER THIS PAGE LOAD ALREADY HOLDS FOR THIS PROJECT, or undefined when it holds none: nothing
   * read yet, a read still in flight, or the last read failed. The slot lives in this module, so a
   * reload of the page starts with none. A band that draws it at once draws no loading state for an
   * answer that `()` would hand back without a request (round 55 of wave 13y).
   */
  held(): { value: T } | undefined
  /**
   * THIS PAGE HAS JUST WRITTEN SOMETHING THIS READ ANSWERS. The read on its way, if there is one, began
   * before the write, so the next `.again()` waits for it and asks once more instead of joining it.
   * A write after an answer also stops `.current()` from reusing that answer.
   */
  written(): void
  /**
   * WHICH PROJECT'S ANSWER THIS READ HOLDS NOW: the project chosen, or 'every project' for a read the
   * server answers the same in every project. `useSharedRead` reads again when this changes, and only then.
   */
  projectKey(): string
}

interface Slot<T> {
  value: T | null
  inFlight: Promise<T> | null
  /** The read `.again()` asked for while another was on its way. It starts when that one ends. */
  next: Promise<T> | null
  /** How many changes the page had marked when the read on its way began. */
  since: number
}

export function oneRead<T>(read: () => Promise<T>, projectKey: () => string = currentWorkspace): OneRead<T> {
  const byProject = new Map<string, Slot<T>>()
  // AND BY WHO IS ASKING. An answer read for one actor is never handed to another after the writer is
  // changed on the Settings page (round 17 of wave 13w): the contacts and the circle are the reader's own.
  const key = (): string => {
    const actor = getActor()
    return `${projectKey()}\n${actor.type}:${actor.id}:${actor.sessionId ?? ''}`
  }

  const slotFor = (project: string): Slot<T> => {
    const held = byProject.get(project)
    if (held !== undefined) return held
    const made: Slot<T> = { value: null, inFlight: null, next: null, since: 0 }
    byProject.set(project, made)
    return made
  }

  const start = (project: string): Promise<T> => {
    const slot = slotFor(project)
    if (slot.inFlight !== null) return slot.inFlight
    slot.since = changesMarked()
    const started: Promise<T> = stamped(read()).then(
      (value) => {
        slot.value = value
        return value
      },
      (err: unknown) => {
        // A FAILED READ IS NOT AN ANSWER. Nothing is stored, so the next caller asks again rather
        // than drawing a failure as a workspace with nothing in it.
        throw err
      },
    )
    slot.inFlight = started
    // BOTH ENDINGS CLEAR THE IN-FLIGHT MARK, and the rejection is handled here so a failed read
    // does not become an unhandled rejection as well as the failure the caller is told about.
    const settled = (): void => {
      if (slot.inFlight === started) slot.inFlight = null
    }
    void started.then(settled, settled)
    return started
  }

  const get = ((): Promise<T> => {
    const project = key()
    const slot = byProject.get(project)
    // A CALLER AFTER `.again()` GETS THE READ IT ASKED FOR, and not the answer of the read before it.
    if (slot !== undefined && slot.next !== null) return slot.next
    if (slot !== undefined && slot.value !== null) return Promise.resolve(slot.value)
    return start(project)
  }) as OneRead<T>

  get.current = (): Promise<T> => {
    const slot = byProject.get(key())
    return slot === undefined || slot.since === changesMarked() ? get() : get.again()
  }

  get.again = (): Promise<T> => {
    const project = key()
    const slot = slotFor(project)
    slot.value = null
    if (slot.inFlight === null) return start(project)
    // THE READ ON ITS WAY BEGAN AFTER THE LAST CHANGE MARKED, so the panels acting on one event share it.
    if (slot.next === null && slot.since === changesMarked()) return slot.inFlight
    if (slot.next === null) {
      // The read on its way clears its own mark first, because it was told to before this was, so
      // `start` here begins a new read. The answer it left is from before the change, so it is not
      // handed to anybody while the new read is on its way.
      const after = (): Promise<T> => {
        slot.next = null
        slot.value = null
        return start(project)
      }
      slot.next = slot.inFlight.then(after, after)
    }
    return slot.next
  }

  get.written = (): void => {
    const slot = byProject.get(key())
    // No count the page reaches is below zero, so the read on its way never matches it again.
    // Remember a write after an answer as well: current() must not reuse that answer. start() resets since;
    // again() uses it only while a read is in flight.
    if (slot !== undefined) slot.since = -1
  }

  get.held = (): { value: T } | undefined => {
    const slot = byProject.get(key())
    return slot === undefined || slot.value === null || slot.next !== null ? undefined : { value: slot.value }
  }

  get.projectKey = projectKey

  return get
}

/**
 * EVERY PROJECT, once. The same door `src/web/lib/projectlist.ts` reads, through the same function,
 * so the frame, the page and the chat panel cannot be three clocks for one list.
 *
 * KEYED BY NOTHING. The list of projects is not answered about one project, so a project change
 * must not make this read again — the list is the same answer whichever project is on screen.
 *
 * EACH REPLY KEEPS THE PROJECT ITS REQUEST WAS SENT UNDER. The reply's `current` field is an answer
 * about that project, and only that project. `currentWorkspace()` is read on the same tick as
 * `api.listWorkspaces()` is called, and the request sets its project header from that same value
 * before it first waits, so the two cannot differ. A caller that joins this read, or is handed it
 * again later, gets the same reply object, so the project stays with it. Read it with
 * `theProjectAProjectListWasSentUnder`.
 */
const projectListSentUnder = new WeakMap<WorkspacesReply, string>()

export const readWorkspacesOnce: OneRead<WorkspacesReply> = oneRead(
  () => {
    const sentUnder = currentWorkspace()
    return api.listWorkspaces().then((reply) => {
      projectListSentUnder.set(reply, sentUnder)
      return reply
    })
  },
  () => 'every project',
)

/**
 * THE PROJECT A REPLY OF `readWorkspacesOnce` WAS SENT UNDER.
 *
 * It throws for a reply that did not come from `readWorkspacesOnce`, because then nobody recorded
 * which project it was asked under, and a guess here is what drew the false warning of problem
 * `bFwKhPWp7V0s`.
 */
export function theProjectAProjectListWasSentUnder(reply: WorkspacesReply): string {
  const sentUnder = projectListSentUnder.get(reply)
  if (sentUnder === undefined) {
    throw new Error('This list of projects did not come from readWorkspacesOnce, so nobody recorded which project it was asked under.')
  }
  return sentUnder
}

/**
 * Home's first page of the ranked answer, once. THE FRAME ASKS THIS IN BOTH MODES.
 *
 * Developer mode asked for the whole answer until round 19 of wave 13w, because it draws the three
 * question lists. On the owner's office on 9 October 2026 that answer was 11,767,705 bytes and Home
 * froze while drawing it. The first page carries those lists as counts, and each list's rows are read a
 * page at a time when a reader opens its fold (`api.attentionPart`).
 *
 * AND IT IS PACED (src/web/lib/oneask.ts). The rule behind this answer reads every record of the
 * project and took 10 s on the live office on 18 November 2026, while the page asked again about
 * every 20 s and kept two asks on the server. One ask at a time for the project on screen, and the
 * next no sooner than the last answer's own cost allows, unless the reader has just moved
 * (`hurryTheAttentionHomeAsk` below). The slot below still shares the answer with everything that
 * draws it.
 *
 * THE KEY CARRIES WHO IS ASKING TOO, because this answer holds the reader's own hidden messages. A
 * delayed ask made after the reader changed is refused rather than sent as the new reader and
 * handed to the old one's callers; the cut before the newline is only the project the door reads.
 */
const attentionAskKey = (): string => {
  const actor = getActor()
  return `${currentWorkspace()}\n${actor.type}:${actor.id}:${actor.sessionId ?? ''}`
}
const theProjectIn = (key: string): string => key.slice(0, key.indexOf('\n'))

const readAttentionHomePaced: OneAsk<AttentionHome> = oneAsk(
  (key) => api.attentionHome(theProjectIn(key)),
  { key: attentionAskKey, floorMs: ATTENTION_ASK_FLOOR_MS, factor: READ_COST_FACTOR },
)

export const readAttentionHomeOnce: OneRead<AttentionHome> = oneRead(() => readAttentionHomePaced())

/**
 * THE READER HAS JUST MOVED OR ACTED, so the next ask of the ranked answer is made at once and not
 * held by its pace. Call it before `readAttentionHomeOnce.again()` or `.current()`.
 */
export function hurryTheAttentionHomeAsk(): void {
  readAttentionHomePaced.hurry()
}

/**
 * The page shape of everybody registered, once for each project. The floating panels read their names here.
 *
 * THE PEOPLE AND AGENTS ARE THE INSTALLATION'S, so every project's answer lists all of them, and a message written in
 * another project still finds its writer's name (see `chatlists.ts`).
 *
 * KEYED BY PROJECT, because each agent's `record` is its record IN THE PROJECT THE REQUEST NAMES. It was keyed by
 * nothing until 4 October 2026, and that was problem IsfgDzJ2yrAB: a browser that read this in one project and then
 * switched to another kept the first project's records, so in the review panel every agent of the second project
 * looked as if it had no record there, and pressing a contact chose nobody. The owner could not send a review on 3 and
 * 4 October.
 */
export const readParticipantsOnce: OneRead<ParticipantsForThePageReply> = oneRead(() => api.participantsForThePage())

/**
 * The conversation rows and the number on the circle, once, each last message cut to what a contact row draws of it
 * (`?shape=page`). No reader of this reads a field of the last message that `aContactRowForThePage` in
 * src/shared/short-lists.ts leaves out.
 */
export const readContactsOnce: OneRead<ShortContactsReply> = oneRead(() => api.contactsForThePage())

/**
 * Who is reading and the number on the circle, without the rows, once. A closed chat panel draws
 * the circle and nothing else, so this is what it reads. The number is the contact list's own.
 */
export const readCircleOnce: OneRead<TheCircle> = oneRead(() => api.messageCircle())

/**
 * The groups, once, each row cut to what the page draws of it (`?shape=page`). The chat's Groups tab
 * and the claims band are the two readers, and neither reads a field the short row leaves out;
 * `aGroupRowForThePage` in src/shared/short-lists.ts names what it keeps.
 */
export const readGroupsOnce: OneRead<ShortGroupsReply> = oneRead(() => api.groupsForThePage())

/**
 * WHY THE ATTENTION FORM KEPT IS `?machine=omit`.
 *
 * The two forms were being asked on every load — the frame asked the plain form and Home asked the
 * one with `machine=omit` — and they are the same answer: the route sweeps the machine only when
 * `machine=include` is written, and BOTH the absent form and `omit` return an unswept reading
 * (`src/server/api/queries.ts`). So one of them had to go, and `omit` is the one to keep because it
 * says out loud which of the two answers this is. The reply's own `machineSweep.note` says the same
 * thing, so nothing reads an unswept machine as a clean one. The sessions block draws the machine
 * from `GET /api/resources/orphans`, on purpose, once.
 */

/**
 * WHO IS REACHABLE, READ AT MOST ONCE A MINUTE FOR EACH PROJECT, for the two contact lists.
 *
 * The comment box's contacts and the review column's contacts read `GET /api/presence` each time they opened. On an
 * office of the owner's size that read is the slowest part of the press (wave 13r round 15: 0.87 s on this machine), and the
 * list waited for it. Both lists now ask here, and draw their rows without waiting: the dot beside a name is drawn
 * once this answers.
 *
 * A READING UP TO A MINUTE OLD IS DRAWN AS THE READING. Presence changes slowly beside a person choosing a contact,
 * and a contact that cannot receive says so from the ranking door, which is read on every open. A read that failed
 * is not kept.
 */
const PRESENCE_KEPT_MS = 60_000
const presenceByProject = new Map<string, { at: number; read: Promise<{ presence: PresenceOnTheWire[] }> }>()

export function readPresenceForAMinute(): Promise<{ presence: PresenceOnTheWire[] }> {
  const project = currentWorkspace()
  const held = presenceByProject.get(project)
  if (held !== undefined && Date.now() - held.at < PRESENCE_KEPT_MS) return held.read
  const read = api.presence()
  const slot = { at: Date.now(), read }
  presenceByProject.set(project, slot)
  read.catch(() => {
    if (presenceByProject.get(project) === slot) presenceByProject.delete(project)
  })
  return read
}
