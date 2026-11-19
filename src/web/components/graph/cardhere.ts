// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT ONE READER HAS PRESSED ON ONE CARD OF ONE DRAWING, FOR THIS VISIT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MISSING, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `src/web/lib/drawnat.ts` said it in its own words before this file existed: *a card position has
 * nowhere to be stored*. `Canvas.tsx` hard-coded `sizeWord: null` into the layout key with a note
 * saying the resize affordance was not built, and `card.ts` said the same about the field. So a
 * reader could not make one node say more, and the owner's problem 5 of 28 August 2026 is exactly
 * that: *Users should be able to reveal more meaning through node-level enlargement/focus/detail
 * interactions.*
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS THE READER'S AND NOT THE RECORD'S
 * ---------------------------------------------------------------------------------------
 *
 * There is an arrangement store for a drawing already — `ScopeIntent.nodes` in
 * src/shared/presentation.ts, keyed by record id, holding a lane, an order, a role, an emphasis and
 * whether a group is folded. It is AUTHORED intent: somebody says how this structure should be
 * presented, it is written to the server, and every reader of the drawing gets it.
 *
 * Enlarging a node to read it is not that. It is one person, reading, for as long as they are
 * reading; writing it into authored intent would change the drawing for everybody else and file a
 * reading act as a decision about the structure. It is the same kind of thing as how much a report
 * says for this visit, which this product already keeps per visit and per reader —
 * `machineryRevealedHere` in src/web/lib/detailchoice.ts, with its own note about why a second key
 * was right there.
 *
 * SO IT IS PER VISIT, IN `sessionStorage`, KEYED BY DRAWING AND RECORD. Per visit because it is a
 * way of reading a picture and not a setting somebody made. Keyed by the drawing because the same
 * module is on the module drawing and inside a pipeline's, and a reader who enlarged it in one has
 * said nothing about the other. Keyed by the RECORD and not by the node id, because a record id is
 * what a stored comment names, so a comment written on a card can be taken back to that card at
 * that level.
 *
 * ---------------------------------------------------------------------------------------
 * ONE FAULT CHANNEL, AND IT IS NOT THIS FILE'S
 * ---------------------------------------------------------------------------------------
 *
 * A browser that refuses `sessionStorage` refuses it for every key, so a refusal here is the same
 * refusal the settings panel already draws. `noteStorageFault` is that one channel, exactly as
 * `src/web/lib/markcolours.ts` uses it, and this file adds no second sentence about the same fault.
 */

import { noteStorageFault } from '../../lib/detailchoice.ts'
import { isRung, type Rung } from '@shared/detail.ts'
import { t } from '@shared/i18n.ts'
import { CARD_LEVELS, NOTHING_PRESSED, isCardHeight, isRoom, isSizeWord, type CardChoice } from './card.ts'

/** One place the key is spelled. Exported so a test names the key rather than guessing it. */
export function cardKeyFor(drawing: string, recordId: string): string {
  return `mole-office.here.card.${drawing}.${recordId}`
}

/** What is stored under one key, before anything has been checked. */
interface Stored {
  room?: unknown
  height?: unknown
  rise?: unknown
  width?: unknown
  size?: unknown
  detail?: unknown
  level?: unknown
}

/**
 * WHAT THIS READER HAS PRESSED ON THIS CARD, or the absence of a press.
 *
 * AN UNREADABLE STORED VALUE IS NOT A CHOICE. A word that is not one of the five sizes, or a level
 * that is not a position of the ladder, was written by something this browser cannot place; it is
 * dropped and the field reads as no press, which is what a card nobody has touched reads as.
 * Nothing here invents a value that was never chosen — `sizeOf` in card.ts is the one place an
 * absence becomes a size, and it says there what it takes into account.
 */
export function cardHere(drawing: string, recordId: string): CardChoice {
  const raw = read(cardKeyFor(drawing, recordId))
  if (raw === null) return NOTHING_PRESSED
  let stored: Stored
  try {
    stored = JSON.parse(raw) as Stored
  } catch {
    // A value this browser cannot parse is not a choice. It is dropped rather than reported: it is
    // not a fault in the storage, and the card draws what a card nobody pressed draws.
    return NOTHING_PRESSED
  }
  const level = stored.level
  return {
    // A SHARE OUTSIDE THE FIVE WORDS' RANGE IS NOT A CHOICE EITHER. `isRoom` is the one place that
    // range is checked, and a value from somewhere else is dropped the way an unreadable one is.
    room: isRoom(stored.room) ? stored.room : null,
    // A HEIGHT OUTSIDE WHAT A CARD MAY BE DRAGGED TO IS NOT A CHOICE EITHER, and `isCardHeight` is
    // the one place that range is checked. Criterion D21.
    height: isCardHeight(stored.height) ? stored.height : null,
    // HOW MUCH TALLER THE READER MADE IT — criterion D33. A share like the width's, checked by the
    // same rule; `riseOf` in card.ts reads anything outside that range as no change at all.
    rise: isRoom(stored.rise) ? stored.rise : null,
    // HOW WIDE THE READER DRAGGED A PIPELINE'S BOX — criterion D35. Pixels, like the height beside
    // it, and checked by the same rule: a width outside what a box may be dragged to was written by
    // something this browser cannot place.
    width: isCardHeight(stored.width) ? stored.width : null,
    // WHICH WORD THE CARD SETTLED AT LAST TIME — criterion D38. A word that is not one of the five
    // was written by something this browser cannot place; it reads as no history, which is what a
    // card nobody has dragged reads as, and `sizeOf` then answers from the area alone.
    size: isSizeWord(stored.size) ? stored.size : null,
    detail: stored.detail === true,
    level: isRung(level) && CARD_LEVELS.includes(level) ? level : null,
  }
}

/** Every choice this reader has made on this drawing, keyed by record id. */
export function cardsHere(drawing: string, recordIds: readonly string[]): ReadonlyMap<string, CardChoice> {
  return new Map(recordIds.map((id) => [id, cardHere(drawing, id)]))
}

/**
 * WRITE WHAT A PRESS CHANGED, AND TELL THE SCREEN.
 *
 * The whole choice is written rather than one field, because the three are read back together and a
 * partial write would leave two of them at whatever a previous visit stored.
 */
export function setCardHere(drawing: string, recordId: string, choice: CardChoice): void {
  const key = cardKeyFor(drawing, recordId)
  try {
    window.sessionStorage.setItem(key, JSON.stringify(choice))
  } catch (err: unknown) {
    noteStorageFault(err)
  }
  changed()
}

/** Forget every card's choice on one drawing. What `Put it back` on the card strip presses. */
export function forgetCardHere(drawing: string, recordId: string): void {
  try {
    window.sessionStorage.removeItem(cardKeyFor(drawing, recordId))
  } catch (err: unknown) {
    noteStorageFault(err)
  }
  changed()
}

/**
 * FORGET EVERY SIZE THIS READER HAS CHOSEN ON ONE DRAWING, and say how many went — CRITERION D36.
 *
 * The places a reader gives cards are stored on the server and one request forgets them all. The
 * SIZES are here, in this browser, one key per card, and there was no way to forget them at all: a
 * reader who had enlarged six cards had to shrink six cards by hand. Both halves are one press now.
 *
 * IT WALKS THE KEYS RATHER THAN THE CARDS, so a size stored for a card that is no longer on the
 * drawing goes as well. Those are exactly the ones nobody could reach by hand.
 */
export function forgetEverySizeHere(drawing: string): number {
  const prefix = `${cardKeyFor(drawing, '')}`
  let gone = 0
  try {
    const keys: string[] = []
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i)
      if (key !== null && key.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) {
      window.sessionStorage.removeItem(key)
      gone += 1
    }
  } catch (err: unknown) {
    noteStorageFault(err)
  }
  changed()
  return gone
}

// -------------------------------------------------------------------- telling the screen

/** Capture every saved card in this drawing, including cards currently outside the view. */
export function savedCardsHere(drawing: string): ReadonlyMap<string, string> {
  const prefix = cardKeyFor(drawing, '')
  const saved = new Map<string, string>()
  for (let i = 0; i < window.sessionStorage.length; i += 1) {
    const key = window.sessionStorage.key(i)
    if (key !== null && key.startsWith(prefix)) {
      const value = window.sessionStorage.getItem(key)
      if (value !== null) saved.set(key, value)
    }
  }
  return saved
}

export function restoreCardsHere(saved: ReadonlyMap<string, string>): void {
  for (const [key, value] of saved) window.sessionStorage.setItem(key, value)
  changed()
}

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Every drawing on the screen redraws when a card's choice changes.
 *
 * A `storage` event only fires in OTHER tabs, so a store that relied on one would leave the page
 * the reader is standing on unchanged. That is the same reason `detailchoice.ts` tells its own
 * listeners rather than listening to the browser, and it is written there at length.
 */
export function subscribeToCards(listener: Listener): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function changed(): void {
  for (const listener of [...listeners]) listener()
}

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch (err: unknown) {
    noteStorageFault(err)
    return null
  }
}

// -------------------------------------------------- the card a comment is about, for one visit

/**
 * WHICH CARD THIS READER IS ON THEIR WAY TO, AND AT WHICH LEVEL.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A SECOND KEY AND NOT PART OF THE CHOICE ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * `cardHere` is what a reader has pressed on a card and it stays for the visit. This is a single
 * act — follow this comment to the card it was written on — and it is spent when the drawing opens
 * it. Folding it into `CardChoice` would make "somebody is going here" look like "somebody pressed
 * this", and the drawing would keep re-focusing the card every time it redrew.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE LEVEL GOES THROUGH THE STORE AND NOT THROUGH THE ADDRESS
 * ---------------------------------------------------------------------------------------
 *
 * `#/pipeline/<id>` is the whole of what this product's addresses can say: `parseRoute` splits the
 * hash on slashes and there is no query string anywhere in it, and a third segment is refused as a
 * typo. Adding one for this would be a new grammar for every page. The level is a way of reading,
 * which is what this file already keeps, so it goes here.
 */
export function cardToOpenKeyFor(drawing: string): string {
  return `mole-office.here.open.${drawing}`
}

/** What is stored under that key, before anything has been checked. */
interface Going {
  recordId?: unknown
  level?: unknown
}

/**
 * SAY WHICH CARD TO OPEN ON A DRAWING, AND AT WHAT LEVEL. Written before the drawing is navigated to.
 *
 * The level may be null: a comment written before views were recorded has none, and the card is
 * then focused at whatever the drawing opens it at, which is honest. Nothing is invented.
 */
export function openTheCardOn(drawing: string, recordId: string, level: Rung | null): void {
  try {
    window.sessionStorage.setItem(cardToOpenKeyFor(drawing), JSON.stringify({ recordId, level }))
  } catch (err: unknown) {
    noteStorageFault(err)
  }
}

/** The card this reader is on their way to on this drawing, or null when they are not. */
export function cardToOpenOn(drawing: string): { recordId: string; level: Rung | null } | null {
  const raw = read(cardToOpenKeyFor(drawing))
  if (raw === null) return null
  let going: Going
  try {
    going = JSON.parse(raw) as Going
  } catch {
    return null
  }
  const recordId = going.recordId
  if (typeof recordId !== 'string' || recordId === '') return null
  const level = going.level
  return { recordId, level: isRung(level) && CARD_LEVELS.includes(level) ? level : null }
}

/**
 * FORGET IT, because it has happened. The drawing calls this once it has focused the card.
 *
 * IT IS SPENT RATHER THAN KEPT. A reader who then presses another card, or opens the drawing again
 * tomorrow, is not still being taken to somebody's comment.
 */
export function theCardWasOpened(drawing: string): void {
  try {
    window.sessionStorage.removeItem(cardToOpenKeyFor(drawing))
  } catch (err: unknown) {
    noteStorageFault(err)
  }
}

/**
 * WHAT THE DRAWING SAYS WHEN THE CARD A COMMENT WAS WRITTEN ON IS NOT DRAWN HERE ANY MORE.
 *
 * The comment named a record and this drawing does not draw it: a link was deleted, or a step was
 * taken out of its pipeline. The record is still there, so the record's own page is what can
 * honestly be offered, and this says which of the two happened rather than opening a drawing with
 * nothing focused and no explanation.
 *
 * IT IS HERE AND NOT IN Canvas.tsx because two drawings say it: the canvas, and a pipeline's own
 * lanes, which do not load the canvas (wave 13u round 230).
 */
export const NOT_ON_THIS_DRAWING =
  () => t('g7b.Canvas.the_comment_you_opened_was_written_on') +
  t('g7b.Canvas.take_you_to')
