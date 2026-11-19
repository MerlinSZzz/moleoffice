// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW COLUMN: whether it is open, which review it is showing, and whether comments collect.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------------
 *
 * Reading a large result, a person wants to look at many places and leave several comments before
 * anything starts changing. Sending each comment as it is written means an agent is rewriting the
 * first thing while the second is still being read. So a comment is written down and waits, and
 * what happens to the collection afterwards is two separate acts: finish collecting, then send.
 *
 * This file holds three small facts: whether the review column is open, which review it is drawing,
 * and which review is collecting. The third is the one the composer asks about, and it is separate
 * from the other two because Mole Office does not ask whether a column is open before it collects.
 * It holds no comment and no draft: **every comment is on the server the moment it is written**, as
 * a record. Review comments must not be lost on navigation or an ordinary reload: they are
 * meaningful human input, and they must be durable enough that a browser accident does not erase
 * an hour of review. A browser store cannot
 * promise that, so what is remembered here is only WHICH review to count the next comment into.
 *
 * ---------------------------------------------------------------------------------------------
 * IT USED TO REMEMBER A CONVERSATION, AND A CONVERSATION IS NOT A REVIEW
 * ---------------------------------------------------------------------------------------------
 *
 * Round seven had no review of its own, so it remembered the conversation the comments were written
 * into. A review is now a thing Mole Office stores — who started collecting, from where, what counts as
 * inside, and the membership once collecting has finished. So what is remembered here is a review
 * id. A conversation is what carries somebody's words to an agent, later, and is a different thing.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY IT LOOKS EXACTLY LIKE src/web/lib/mode.ts
 * ---------------------------------------------------------------------------------------------
 *
 * Because it is the same kind of thing: a setting outside React, read at import time so nothing
 * flashes, applied before it is persisted, and announced to whoever is listening. The shape is
 * copied deliberately — a `const KEY`, a `restore()`, a module-level value, a `makeBroadcast()`
 * pair, a `useSyncExternalStore` hook, and a setter that applies, persists and announces, in that
 * order. Reading and writing goes through `store.ts`, so this is not a third private copy of
 * "remember one thing in this browser".
 *
 * A REMEMBERED REVIEW THAT THE SERVER NO LONGER HAS IS NOT THIS FILE'S PROBLEM TO GUESS AT. This
 * file remembers an id. Whether that review is still collecting is a question only the server can
 * answer, and the pane asks it and says what came back.
 */

import { useSyncExternalStore } from 'react'
import { clearStored, makeBroadcast, readStored, writeStored } from './store.ts'
import { currentWorkspace } from './workspace.ts'

/**
 * Which review is collecting, which one the column is showing, and whether the column is open.
 *
 * THREE SEPARATE FACTS, AND THEY USED TO BE TWO. `on` meant both "the column is open" and
 * "comments are collecting", so a review whose collecting had FINISHED went on telling the composer
 * that the next comment would join it. It joins nothing: membership froze at *Finish collecting*.
 *
 * THE THIRD FACT WAS FOUND ON 19 AUGUST 2026 AND IT WAS THE OPPOSITE LIE. Closing the column, or
 * pressing *Your reviews* to see the list, dropped the collecting review from this browser — so the
 * composer then told a person their comment would not be part of any review. It was: measured in
 * Chromium, a comment written with the column closed came back as a member of the review that was
 * collecting. Mole Office decides membership from where the review collects, when it started and who
 * wrote the comment. Nothing on the server asks whether a column is open, so a browser that made
 * that a condition was answering a question it had no part in.
 */
export interface Review {
  /**
   * TRUE WHEN THIS BROWSER REMEMBERS A REVIEW AS COLLECTING. It is `reviewId !== null` and nothing
   * else. It does not follow whether the column is open, because Mole Office does not.
   *
   * IT IS A MEMORY, NOT THE ANSWER. Only a press in the column corrects it, so a review ended in
   * another browser stays remembered here. Nothing that says whether a review is collecting draws
   * it: the ring and the dot on the sidebar's Reviews control ask Mole Office
   * (`useTheCollectingReview` in components/agent/ReviewBar.tsx, problem 38r1U3Cu6lxc).
   */
  on: boolean
  /**
   * The review that is collecting, or null when none is.
   *
   * NOTHING IS CREATED BY THIS FILE. The pane asks Mole Office to start collecting — or to come back to
   * the review already collecting here — and writes the id it gets back through `openReview`.
   * Mole Office's own answer about that review's state is what turns this off again.
   */
  reviewId: string | null
  /** The project whose review is collecting, or null when no project was saved with an older value. */
  reviewProjectId: string | null
  /**
   * The review the column is drawing, or null when it is drawing the list of them.
   *
   * IT IS NOT `reviewId`. A person can look at a review that finished last week while another one
   * is still collecting, and the two answers must not be the same field.
   */
  showing: string | null
  /** The project the shown review was opened in, or null when an older value did not record it. */
  showingProjectId: string | null
  /**
   * THE THING WHOSE COMMENTS THE COLUMN IS DRAWING, as the key an addressable element carries, or
   * null when it is not drawing one thing's comments.
   *
   * WHY IT EXISTS. Criterion D23, 6 September 2026. Pressing the count on a card used to open the
   * list of REVIEWS, and a comment is not a review — so a press on a "1" on a card of a pipeline
   * opened "Your reviews", and it was empty: the comment itself could not be seen. A press now
   * draws what the count counted.
   *
   * IT IS NOT REMEMBERED ACROSS A RELOAD, and that is deliberate rather than an omission. This is a
   * key belonging to something drawn on one page. Coming back to a different page with the column
   * still open on it would draw comments about a thing that is not on the screen.
   */
  commentsOn: string | null
  /** The review column is open. Closing it draws nothing and changes no review. */
  open: boolean
}

const KEY = 'mole-office.review'

/**
 * What is written in the browser store: whether it is open, then each review id beside its project id.
 *
 * `open|<showing>|<showing project>|<collecting>|<collecting project>`, with an empty part for
 * "none" or a project not recorded by an older value. `shut` in the first place is the column
 * closed. A bar cannot appear in an id, so nothing has to be escaped.
 *
 * IT USED TO BE ONE WORD PER STATE — `off`, `list`, `on:<id>`, `read:<id>` — and one word could
 * not carry two ids at once. That is what made "the column is closed" and "nothing is collecting"
 * the same fact. Those four words are still read back, below, so a browser that remembers one
 * from the build before this does not lose its place.
 */
function stored(review: Review): string {
  // `commentsOn` IS NOT IN HERE, for the reason on the field itself: it names something drawn on one
  // page, and remembering it would reopen the column on a thing the next page does not hold.
  return [
    review.open ? 'open' : 'shut',
    review.showing ?? '',
    review.showingProjectId ?? '',
    review.reviewId ?? '',
    review.reviewProjectId ?? '',
  ].join('|')
}

/** The review a stored word describes, or null when this build has no meaning for it. */
function readWord(word: string): Review | null {
  if (word === 'off') return OFF
  if (word === 'list') return { on: false, reviewId: null, reviewProjectId: null, showing: null, showingProjectId: null, commentsOn: null, open: true }
  // WRITTEN BY THE BUILD BEFORE THIS ONE: collecting was on and the id had not come back yet. There
  // is no such state now — the column asks Mole Office before it collects anything — so the column opens
  // on the list, where the review that browser was collecting into is the first row.
  if (word === 'on') return { on: false, reviewId: null, reviewProjectId: null, showing: null, showingProjectId: null, commentsOn: null, open: true }
  if (word.startsWith('on:') && word.length > 3) {
    const id = word.slice(3)
    return { on: true, reviewId: id, reviewProjectId: null, showing: id, showingProjectId: null, commentsOn: null, open: true }
  }
  if (word.startsWith('read:') && word.length > 5) {
    return { on: false, reviewId: null, reviewProjectId: null, showing: word.slice(5), showingProjectId: null, commentsOn: null, open: true }
  }
  const parts = word.split('|')
  const how = parts[0]
  if (parts.length === 5 && (how === 'open' || how === 'shut')) {
    const showing = parts[1] === '' ? null : (parts[1] ?? null)
    const showingProjectId = showing === null || parts[2] === '' ? null : (parts[2] ?? null)
    const collecting = parts[3] === '' ? null : (parts[3] ?? null)
    const reviewProjectId = collecting === null || parts[4] === '' ? null : (parts[4] ?? null)
    return {
      on: collecting !== null,
      reviewId: collecting,
      reviewProjectId,
      showing,
      showingProjectId,
      commentsOn: null,
      open: how === 'open',
    }
  }
  // Values written before project ids were kept beside review ids remain readable, but their
  // project is unknown. The pane can name that absence without asking any project for this id.
  if (parts.length === 3 && (how === 'open' || how === 'shut')) {
    const showing = parts[1] === '' ? null : (parts[1] ?? null)
    const collecting = parts[2] === '' ? null : (parts[2] ?? null)
    return {
      on: collecting !== null,
      reviewId: collecting,
      reviewProjectId: null,
      showing,
      showingProjectId: null,
      commentsOn: null,
      open: how === 'open',
    }
  }
  return null
}

const broadcast = makeBroadcast()

const OFF: Review = {
  on: false,
  reviewId: null,
  reviewProjectId: null,
  showing: null,
  showingProjectId: null,
  commentsOn: null,
  open: false,
}

/**
 * The review this browser remembers, or none.
 *
 * NOTHING ON A PAGE SAYS WHEN THIS DROPS SOMETHING. A browser that refuses storage, or holds a
 * value this build has no meaning for, starts with the column closed. The sentences that said so
 * were kept in a list that no page drew, and they were removed with it (plan 7FEOshq3mBGG, row F1).
 * That gap is recorded for the review pane's owners.
 */
function restore(): Review {
  if (typeof window === 'undefined') return OFF
  const read = readStored(KEY)
  if (!read.ok || read.value === null) return OFF
  const found = readWord(read.value)
  if (found === null) {
    // A value this build cannot read is cleared from storage.
    clearStored(KEY)
    return OFF
  }
  return found
}

/**
 * Read at import time, before React renders, for the reason `mode.ts` gives: an effect runs after
 * the first paint, so restoring there would draw one frame saying nothing is collecting when
 * something is.
 */
let review: Review = restore()

export function currentReview(): Review {
  return review
}

/**
 * Change it. Applies first, then persists, then announces — the same order as `setMode`.
 *
 * A browser that refuses the write does not stop collecting; it means the review has to be
 * re-opened by hand after a reload. Nothing on a page says so (see `restore` above).
 */
function set(next: Review): void {
  if (
    next.on === review.on &&
    next.reviewId === review.reviewId &&
    next.reviewProjectId === review.reviewProjectId &&
    next.showing === review.showing &&
    next.showingProjectId === review.showingProjectId &&
    next.commentsOn === review.commentsOn &&
    next.open === review.open
  ) {
    return
  }
  review = next
  // The write's answer is not read: a refusal leaves collecting working until the next reload.
  if (typeof window !== 'undefined') writeStored(KEY, stored(next))
  broadcast.announce()
}

/**
 * Open the column on the list of this project's reviews.
 *
 * NOTHING IS CREATED AND NOTHING COLLECTS. Opening the column used to start a review on the spot,
 * so an accidental press wrote a review row that no route can delete. Starting one is now a press
 * inside the column, which is also where a review finished last week is found again.
 */
export function openReviewList(): void {
  set({ ...review, showing: null, showingProjectId: null, commentsOn: null, open: true })
}

/**
 * Open the column on the comments somebody has left on ONE thing.
 *
 * `key` is the string an addressable element carries as its `data-target` — the same string the
 * marks route answers with, built by `targetKey` in shared/targets.ts. There is one spelling of a
 * key in this product and this takes that one.
 *
 * NOTHING IS CREATED AND NOTHING COLLECTS, exactly as with `openReviewList`. This draws what is
 * already there.
 *
 * IT IS ALSO COUNTED AS A PRESS (`useCountPresses` below), and the column takes the window to itself
 * on each one where it is drawn outside the window.
 */
export function openCommentsOn(key: string): void {
  set({ ...review, showing: null, showingProjectId: null, commentsOn: key, open: true })
  presses += 1
  pressBroadcast.announce()
}

/**
 * Show one review in the column.
 *
 * `collecting` IS THE REVIEW'S OWN STATE and this is the only place it is written. The pane passes
 * what Mole Office said on the request it just made, so the flag the composer reads cannot drift from
 * the review: when collecting finishes, the next read turns it off.
 *
 * OPENING A REVIEW THAT IS NOT COLLECTING DOES NOT STOP A DIFFERENT ONE. Looking at last week's
 * review is reading, not a change to anything, and a person doing it while today's review collects
 * must not have today's review switched off under them.
 */
export function openReview(reviewId: string, collecting: boolean, projectId = currentWorkspace()): void {
  const stillCollecting = collecting ? reviewId : review.reviewId === reviewId ? null : review.reviewId
  set({
    on: stillCollecting !== null,
    reviewId: stillCollecting,
    reviewProjectId: stillCollecting === null ? null : collecting ? projectId : review.reviewProjectId,
    showing: reviewId,
    showingProjectId: projectId,
    commentsOn: null,
    open: true,
  })
}

/**
 * Close the column.
 *
 * NOTHING IS SENT, NOTHING IS FINISHED, NOTHING IS DELETED AND COLLECTING DOES NOT STOP. This used
 * to forget which review was collecting, and that was a rule this browser had invented: Mole Office
 * decides membership from where a review collects, when it started and who wrote the comment, and
 * asks nothing about a column. Measured on 19 August 2026 — a comment written with the column
 * closed came back as a member of the review that was collecting, while the composer had just said
 * it would be kept for later and sent by a review some other day.
 *
 * Finishing collecting is the press that ends a review, and it is in the column.
 */
export function leaveReview(): void {
  set({ ...review, showing: null, showingProjectId: null, commentsOn: null, open: false })
}

/** What the column is doing, re-rendering the component when it changes. */
export function useReview(): Review {
  return useSyncExternalStore(broadcast.subscribe, currentReview, currentReview)
}

// ---------------------------------------------------------------------------- a count was pressed

/**
 * HOW MANY TIMES A COMMENT COUNT HAS BEEN PRESSED SINCE THE PAGE WAS LOADED.
 *
 * A COUNT AND NOT THE COLUMN'S STATE, because pressing the same count twice leaves that state as it
 * was, and the second press has to be answered too: a person who read on down the page and pressed
 * it again must be shown the column again (wave 13y round 29).
 */
let presses = 0
const pressBroadcast = makeBroadcast()

function pressCount(): number {
  return presses
}

/** Put this in a dependency list to act on each press of a comment count. */
export function useCountPresses(): number {
  return useSyncExternalStore(pressBroadcast.subscribe, pressCount, pressCount)
}

// ---------------------------------------------------------------------------- something changed

/**
 * A count that goes up whenever a comment is written, changed or removed.
 *
 * WHY A COUNT AND NOT THE COMMENTS. The comments live on the server and the review pane reads them
 * from there. Two places holding a list of them would be two answers to "what is waiting", free to
 * disagree. This says only *go and read again*, which is the smallest thing that lets the composer
 * on one page tell the pane in the frame that there is something new.
 */
let changes = 0
const changeBroadcast = makeBroadcast()

export function reviewChanged(): void {
  changes += 1
  forgetSharedReads()
  changeBroadcast.announce()
}

/**
 * A WRITE WHOSE REPLY IS ALREADY THE NEW ANSWER TO ONE READ. It is a change like any other, and that one read is handed
 * the reply instead of being asked again: `POST /api/reviews/<id>/recipient` answers with the review as it now is,
 * and reading it again straight after was the slowest part of a press on a contact (wave 13r round 15).
 */
export function reviewChangedTo<T>(what: string, answer: T): void {
  changes += 1
  forgetSharedReads()
  sharedReads.set(`${currentWorkspace()}|${String(changes)}|${what}`, Promise.resolve(answer))
  changeBroadcast.announce()
}

function changeCount(): number {
  return changes
}

/** Put this in a dependency list to re-read the review after anything writes to it. */
export function useReviewChanges(): number {
  return useSyncExternalStore(changeBroadcast.subscribe, changeCount, changeCount)
}

// ---------------------------------------------------------------------------- one read per change

/**
 * ONE READ OF ONE THING FOR EACH CHANGE, shared by every part of the screen that asks for it.
 *
 * The frame, the sidebar's Reviews control and the column each read the reviews collecting in this project, and each
 * did so on every change: a press on a contact read the same list three times (wave 13r round 15, measured on an
 * office of the owner's size). They now ask here. The first asker starts the read; the others are handed the same promise.
 *
 * A READ BELONGS TO ONE CHANGE AND ONE PROJECT. `reviewChanged` forgets every read, so nothing drawn after a write is
 * an answer from before it. A read that failed is forgotten too, so the next asker asks again rather than being handed
 * the failure for good.
 */
const sharedReads = new Map<string, Promise<unknown>>()

export function readOnceForThisChange<T>(what: string, read: () => Promise<T>): Promise<T> {
  return readOnceIn(sharedReads, `${currentWorkspace()}|${String(changes)}|${what}`, read)
}

/** The read held under `key` in `reads`, or a new one started and held there. A read that failed is forgotten. */
function readOnceIn<T>(reads: Map<string, Promise<unknown>>, key: string, read: () => Promise<T>): Promise<T> {
  const held = reads.get(key)
  if (held !== undefined) return held as Promise<T>
  const started = read()
  reads.set(key, started)
  started.catch(() => {
    if (reads.get(key) === started) reads.delete(key)
  })
  return started
}

/** Forget every shared read, and every read made for a look. Called by `reviewChanged`, and by nothing else. */
function forgetSharedReads(): void {
  sharedReads.clear()
  lookedReads.clear()
}

// ---------------------------------------------------------------------------- looking again

/**
 * A COUNT THAT GOES UP WHEN THIS TAB LOOKS AGAIN AT WHICH REVIEWS ARE COLLECTING, because a review can be started,
 * written to or ended where this tab cannot see it: in another tab, by an agent, or by a call to the server. The change
 * count above moves only when this tab writes, so a review started elsewhere was drawn by the ring, the sidebar's
 * Reviews dot and the column only after a reload, and leaving the page that held its comments asked nothing (wave 13x
 * round 23).
 *
 * WHEN IT MOVES (wave 13x round 23). On every move inside the app, which the question asked on leaving a
 * page makes before it decides, and when the window comes back into focus. Nothing moves it on a timer. The office's
 * change stream carries no event for a review starting, finishing or being abandoned, so it cannot say when to look.
 *
 * ONLY THE LISTS OF REVIEWS ARE READ AGAIN ON IT, through `readOnceForThisLook`. Everything else stays one read for
 * each change, as wave 13r round 15 decided for speed.
 */
let looks = 0
const lookBroadcast = makeBroadcast()

/**
 * The reads made for each look. Every look empties it, so it holds the reads of one look at most and does not grow
 * with every move.
 */
const lookedReads = new Map<string, Promise<unknown>>()

export function lookAgain(): void {
  looks += 1
  lookedReads.clear()
  lookBroadcast.announce()
}

function lookCount(): number {
  return looks
}

/** Put this in a dependency list, beside `useReviewChanges`, to read a list of reviews again at each look. */
export function useLooks(): number {
  return useSyncExternalStore(lookBroadcast.subscribe, lookCount, lookCount)
}

/** ONE READ OF ONE THING FOR EACH CHANGE AND EACH LOOK, shared by every part of the screen that asks for it. */
export function readOnceForThisLook<T>(what: string, read: () => Promise<T>): Promise<T> {
  return readOnceIn(lookedReads, `${currentWorkspace()}|${String(changes)}|${String(looks)}|${what}`, read)
}
