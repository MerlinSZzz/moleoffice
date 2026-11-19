// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER MEDIA A RECORD POINTS AT ARE LOADED, AS THE PERSON CHOSE, for everything that draws one.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE ANSWER IS KEPT
 * ---------------------------------------------------------------------------------------
 *
 * It is on the person's registry row, so it follows them to every machine, exactly as
 * `lib/messagepictures.ts` does since decision rJphPkCG3l7X. Nothing here writes a browser key: the
 * durable half is a column, `people.media_load`, reached through `PATCH /api/participants`.
 *
 * `components/Chat.tsx` reads that row on every page the shell draws, so it is what tells this file
 * what the person chose; a report's figure then reads it without fetching the row again. That is
 * the same arrangement the message pictures setting uses. The quick note page
 * (`pages/QuickNotePage.tsx`) is drawn in place of the shell, so it reads the row once itself, and
 * only when nothing has read it yet. Both read the same row and tell this same store, so there is
 * still one answer to one question.
 *
 * ---------------------------------------------------------------------------------------
 * TWO PARTS OF THE ANSWER, AND WHY BOTH ARE HERE
 * ---------------------------------------------------------------------------------------
 *
 * `choice` is what the row holds: one of the three, or null because nobody has chosen. Null is a
 * real answer and is not the same fact as having chosen `with-page` — the control draws that
 * difference and so does the criterion.
 *
 * `wasRead` is whether the row has been read at all. IT IS NOT DECORATION: a figure must not fetch
 * before it knows which choice is in force, or a person who chose `never` would have their media
 * fetched once during the moment before the answer arrived. So nothing loads while `wasRead` is
 * false, and the figure says so rather than guessing. `MEDIA_LOAD_BY_DEFAULT` is what a person who
 * has read the row and chosen nothing gets; it is never substituted for the row not having been
 * read.
 */

import { useSyncExternalStore } from 'react'

import { MEDIA_LOAD_BY_DEFAULT, type MediaLoadChoice } from '@shared/mediaload.ts'
import { THE_PERSON } from '@shared/person.ts'
import { api, errorMessage } from '../api.ts'
import { makeBroadcast } from './store.ts'

const broadcast = makeBroadcast()

/** What the row holds: one of the three, or null because nobody has chosen. */
let chosen: MediaLoadChoice | null = null

/** Whether the person's registry row has been read. False until `sayMediaLoad` is called. */
let read = false

/** What went wrong writing the choice down, or null because nothing did. */
let fault: string | null = null

/** What the row holds, or null because nobody has chosen. */
export function mediaLoadChoice(): MediaLoadChoice | null {
  return chosen
}

/** Whether the person's row has been read. Nothing loads until it has. */
export function mediaLoadWasRead(): boolean {
  return read
}

/** What went wrong writing it down, or null because nothing did. */
export function mediaLoadFault(): string | null {
  return fault
}

/**
 * The choice in force for drawing, which is what nobody having chosen is READ as.
 *
 * This is only honest once `wasRead` is true; a caller that draws with it must ask that first.
 */
export function mediaLoadForDrawing(): MediaLoadChoice {
  return chosen ?? MEDIA_LOAD_BY_DEFAULT
}

/**
 * A READ OF THE PERSON'S REGISTRY ROW SAYS WHAT THEY CHOSE, and this holds it for everything that draws.
 *
 * Call it only when the row was really read. A caller that has not read the row must not call it
 * with null, because that would say "the row was read and holds no choice" — the one fact this file
 * exists to keep apart from "nobody has looked yet".
 */
export function sayMediaLoad(said: MediaLoadChoice | null): void {
  if (read && said === chosen) return
  read = true
  chosen = said
  broadcast.announce()
}

/**
 * Choose, and say when the write was refused.
 *
 * IT APPLIES FIRST AND IS WRITTEN SECOND, so what is on the screen never depends on the round trip.
 * When the write fails the panel says so in the server's own words, and the choice on the screen is
 * the one that will be gone after a reload.
 */
export function chooseMediaLoad(next: MediaLoadChoice): void {
  chosen = next
  read = true
  fault = null
  broadcast.announce()
  void api.changeParticipant('person', THE_PERSON, { mediaLoad: next }).catch((err: unknown) => {
    fault = errorMessage(err)
    broadcast.announce()
  })
}

/** What the row holds, re-drawing the component when somebody changes it. */
export function useMediaLoad(): MediaLoadChoice | null {
  return useSyncExternalStore(broadcast.subscribe, mediaLoadChoice, mediaLoadChoice)
}

/** Whether the row has been read, re-drawing the component when that changes. */
export function useMediaLoadWasRead(): boolean {
  return useSyncExternalStore(broadcast.subscribe, mediaLoadWasRead, mediaLoadWasRead)
}

/** The same, with what went wrong writing it — what the settings panel draws. */
export function useMediaLoadWithFault(): {
  choice: MediaLoadChoice | null
  read: boolean
  fault: string | null
} {
  const choice = useSyncExternalStore(broadcast.subscribe, mediaLoadChoice, mediaLoadChoice)
  const wasRead = useSyncExternalStore(broadcast.subscribe, mediaLoadWasRead, mediaLoadWasRead)
  const said = useSyncExternalStore(broadcast.subscribe, mediaLoadFault, mediaLoadFault)
  return { choice, read: wasRead, fault: said }
}
