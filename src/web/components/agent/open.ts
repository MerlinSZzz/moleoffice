// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { openTheChatAt } from '../../lib/open-chat.ts'
/**
 * ONE WAY INTO THE COMPOSER, AND THE ONE PLACE THE GESTURE IS READ.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * `openAbout(node, at)` opens the composer about a thing. Every way in calls it: a right-click, a
 * press while the page is showing what can be pointed at, the keyboard menu, and the control in the
 * rail. There is no second path into the composer, so there is nothing for a second path to drift
 * away from.
 *
 * The state it writes lives in this module and is read with `useSyncExternalStore`, the same way
 * `MarkLayer` reads what is being shown. `PointingLayer` renders what is in here and holds no state
 * of its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS HERE BEFORE, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The four lines that open the composer were written twice in `PointingLayer.tsx`, once in the
 * right-click listener and once in the press listener, and the two copies had already drifted three
 * ways:
 *
 *   1. Only the press copy called `stopShowing()`. So a right-click while the page was showing what
 *      can be pointed at opened the composer and left every element still outlined, with the mode
 *      still swallowing the next press.
 *   2. Only the right-click copy had a branch for a menu raised from the keyboard. So `Enter` on an
 *      outlined element opened the box at the top-left corner of the window: a click raised from the
 *      keyboard reports `clientX 0, clientY 0`, and the press copy used those numbers as a position.
 *   3. Only the press copy exempted a popup.
 *
 * Each drift was one line missing from one copy. None of them failed a test, a type check or a
 * build. That is the defect this repository keeps finding — the same thing worked out in two places
 * — and the fix is that there is now one place.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER THE RIGHT-CLICK IS READ IN, AND WHY THAT ORDER
 * ---------------------------------------------------------------------------------------
 *
 *   1  a box you type in   -> leave it alone. The browser's own menu, so paste, spell-check and
 *                            look-up are reachable in every box in the product. Contract 5.5.
 *   2  `button === -1`      -> a menu raised from the keyboard. Never blocked by Shift.
 *   3  touch or pen        -> a touch hold is handled below; a pen keeps its platform behaviour.
 *   4  `shiftKey`          -> leave it alone. The browser's own menu.
 *   5  otherwise           -> a pointer, and Mole Office takes it wherever it lands.
 *
 * The keyboard test comes ahead of the rest, and that order is measured rather than chosen. Claim
 * `wKR0jkvl_7sz`, three engines, headless and headed, 20 August 2026: Chromium raises `Shift+F10`
 * with `shiftKey === false` and `button === -1`. An engine that reported `shiftKey === true` for the
 * same keys would otherwise fall into rule 4 and the keyboard route would never run at all.
 *
 * The same measurement killed the test this file replaces. `PointingLayer.tsx` detected the keyboard
 * with `clientX === 0 && clientY === 0`. The measured event arrived at `(56, 98)` — the centre of the
 * focused button — so that condition was never true in Chromium and the branch behind it was dead.
 *
 * WHAT IS PROVABLE IN WHICH ENGINE, said rather than glossed. Firefox 153 and WebKit 26.5 raise no
 * `contextmenu` event at all from `Shift+F10` or the menu key: the key presses arrive, nothing
 * follows. So the keyboard route can be proved in Chromium and cannot be exercised in the other two.
 * That is a limit of those engines, not a pass.
 */

import { useSyncExternalStore } from 'react'
import { spanNamedBy, targetKey, wordsInNamedSpan } from '@shared/targets.ts'
import { isTheComposersOwn } from '@shared/surfaces.ts'
import { draftAbout } from '../../lib/drafts.ts'
import { makeBroadcast } from '../../lib/store.ts'
import { clearSubject, setSubject } from './MarkLayer.tsx'
import { addressableAt, isInThePage, pointableInThePage, pointedAt, thePage, type Pointed } from './pointing.ts'
import type { ChangeAsked } from './TalkBox.tsx'

// ============================================================================ where a box hangs

/**
 * HOW THE GESTURE SAID WHERE IT WAS. Two answers, because there are two kinds of gesture.
 *
 * `pointer` is a point in the window, which a mouse gives directly. `element` is a thing, which is
 * what a gesture with no pointer has: the keyboard menu, `Enter` on an outlined element, and a
 * control pressing on somebody's behalf. The box then hangs under the thing itself.
 */
export type At = { at: 'pointer'; x: number; y: number } | { at: 'element'; element: HTMLElement }

/** Under the thing: its left edge, six pixels below it. */
function underneath(element: HTMLElement): { x: number; y: number } {
  const box = element.getBoundingClientRect()
  return { x: box.left, y: box.bottom + 6 }
}

/** The point a box opens at, for either kind of gesture. Exported so a test can put the question. */
export function whereItHangs(at: At): { x: number; y: number } {
  return at.at === 'pointer' ? { x: at.x, y: at.y } : underneath(at.element)
}

/**
 * A GESTURE THAT ARRIVED WITH NO POINTER, in one place because both such gestures need it.
 *
 * The keyboard menu and a keyboard press both arrive on the element that has focus, so that element
 * is where the box hangs. `declaring` is the nearest element that says what it is, and it is used
 * only when the event landed on something that is not an element at all — a text node. Both are
 * elements the person is standing on; neither is a corner of the window, which is what the numbers
 * on these events would give.
 *
 * `declaring` MAY BE NULL, AND THAT IS THE CASE STEP 17 CREATED. The gate that used to stop the
 * listener when nothing said what it was is gone, so a keyboard menu now runs to the end even where
 * the walk found nothing — and the old code read `found.element` on the very line that could not
 * have a `found`. A text node inside something that declares nothing then falls back to its own
 * parent, which is still an element the person is standing on, and only a gesture with no element
 * anywhere above it reaches the body.
 */
export function withoutAPointer(on: EventTarget | null, declaring: HTMLElement | null): At {
  if (on instanceof HTMLElement) return { at: 'element', element: on }
  if (declaring !== null) return { at: 'element', element: declaring }
  const parent = on instanceof Node ? on.parentElement : null
  return { at: 'element', element: parent ?? document.body }
}

// ============================================================================ what is open

/** What the composer is about, and where it was opened. */
export interface Opened {
  pointed: Pointed
  at: { x: number; y: number }
  /**
   * TRUE WHEN `at` IS UNDER AN ELEMENT, from a gesture with no pointer (`At` of 'element'). Such a box stays
   * where it hangs; only a box opened at a pointer is moved off the thing it is about (TalkBox's
   * `placeClearOfTheThing`). Beside `at` and not inside it, so `at` is still only the point.
   */
  underAnElement: boolean
  /**
   * THE ADDRESS THE READER WAS AT WHEN THIS SUBJECT WAS CHOSEN, so there is a way back to it.
   *
   * The composer stays open across a change of page, which is what lets somebody go and check
   * something before they finish writing. A frame naming a block of a report, floating over a page
   * that has no such block, is a claim that page cannot answer — so the composer says the thing is
   * not on this page and draws one press back to where it is. This is that address.
   *
   * IT IS READ BY THE ONE READER OF THE ADDRESS, `thePage` in pointing.ts, which is also what a
   * comment about a whole page is named after. There is no second way of spelling the address here.
   */
  route: string
}

/**
 * THE WHOLE OF THE COMPOSER'S TRANSIENT STATE, as one value.
 *
 * `changing` is held BESIDE `opened` and never instead of it. That is the design of the
 * self-referential case: pointing at a phrase of the instruction you are typing opens a slot inside
 * the composer that is already there, so the thing it is about and the agent it is for cannot be
 * lost by revising a phrase inside it.
 */
interface Composer {
  opened: Opened | null
  changing: ChangeAsked | null
  /**
   * THE PART OF THE COMPOSER SOMEBODY JUST POINTED AT, WHICH IS AN OFFER AND NOT A SUBJECT.
   *
   * A right-click inside the open composer used to replace what the composer was about. Because
   * this browser keeps one instruction per thing, the box then re-read the store under the new
   * subject's name, found nothing, and drew an empty box: the half-written instruction was still
   * kept, but it was not on the screen and nothing said where it had gone. Measured on 20 August
   * 2026 — the chip went from `Block of a report` to `Page Record` and the box emptied on six of
   * the seven regions a person can hit.
   *
   * So a press inside the composer OFFERS the part it landed on and changes nothing else. Taking
   * the offer is a second, deliberate press.
   */
  offered: Pointed | null
  /**
   * WHAT THE COMPOSER WAS ABOUT BEFORE AN OFFER WAS TAKEN, so there is a way back.
   *
   * Exactly one deep. A breadcrumb of subjects inside a 384px popup would be the same problem
   * arriving as a list, and the instruction under every one of them is kept in this browser under
   * its own name either way.
   */
  cameFrom: Opened | null
}

let composer: Composer = { opened: null, changing: null, offered: null, cameFrom: null }
const composerChanged = makeBroadcast()

function readComposer(): Composer {
  return composer
}

function setComposer(next: Composer): void {
  composer = next
  composerChanged.announce()
}

/** What the composer is about right now, for the layer that draws it. */
export function useComposer(): Composer {
  return useSyncExternalStore(composerChanged.subscribe, readComposer, readComposer)
}

/** The composer is closed, any revise slot with it, and the mark on the source goes with both. */
export function closeTheComposer(): void {
  stopFollowingTouchSelection()
  // THE MARK GOES WHEN THE BOX GOES, in the same statement, whatever closed it. It is not owned by
  // a clock and there is nothing for a clock to disagree with.
  clearSubject()
  if (composer.opened === null && composer.changing === null && composer.offered === null) return
  setComposer({ opened: null, changing: null, offered: null, cameFrom: null })
}

/** The revise slot is closed and the composer behind it is left exactly as it was. */
export function stopChanging(): void {
  if (composer.changing === null) return
  setComposer({ ...composer, changing: null })
}

/** What the composer holds, without React. Exported for tests and for nothing else. */
export function whatIsOpen(): Composer {
  return composer
}

// ============================================================================ showing what can be pointed at

/**
 * WHAT THE RAIL CONTROL HAS ASKED FOR, held outside React.
 *
 * Two states. `showing` marks everything on the page that can be talked about and takes the next
 * press as the subject. `off` is everything else.
 *
 * It is deliberately not remembered between visits: it ends at the first press, at Escape, and at a
 * second press of the control. A state that survived a reload would be a mode.
 *
 * A THIRD STATE WAS DELETED HERE. `thePage` was a request the control raised and the layer answered
 * one render later, because the composer's state used to live inside the layer and the control could
 * not reach it. The composer's state is in this file now, so the control calls `openAbout` directly
 * and there is no request to raise, answer, or forget to take back.
 */
type Asked = { state: 'off' } | { state: 'showing'; here: number }

let asked: Asked = { state: 'off' }
const askedChanged = makeBroadcast()

function readAsked(): Asked {
  return asked
}

function setAsked(next: Asked): void {
  if (asked.state === next.state) return
  asked = next
  if (typeof document !== 'undefined') {
    if (next.state === 'showing') document.documentElement.setAttribute('data-pointing', '1')
    else document.documentElement.removeAttribute('data-pointing')
  }
  askedChanged.announce()
}

/**
 * Mark everything on this page that can be talked about, and make the next press on one of them the
 * subject.
 *
 * HOW MANY THERE ARE IS COUNTED HERE AND KEPT, not asked again while the mode is on. It is a fact
 * about the page at the moment the mode was entered, and the mode ends at the first press, so a
 * count that went stale would have to outlive one gesture. Counting it during a render would read
 * the document while React is drawing it.
 */
export function showWhatCanBeTalkedAbout(): void {
  setAsked({ state: 'showing', here: pointableInThePage().length })
}

/** Stop. Called by the first press, by Escape, by the control, and by `openAbout`. Idempotent. */
export function stopShowing(): void {
  setAsked({ state: 'off' })
}

/** What the mode is doing right now, for the control that draws it: off, or on with a count. */
export function usePointMode(): Asked {
  return useSyncExternalStore(askedChanged.subscribe, readAsked, readAsked)
}

/** Whether the page is currently marking what can be talked about. */
export function useShowingWhatCanBeTalkedAbout(): boolean {
  return usePointMode().state === 'showing'
}

/** The same answer without React, for the listeners in this file and for tests. */
export function isShowing(): boolean {
  return asked.state === 'showing'
}

// ============================================================================ the one dispatch

/**
 * WHETHER THIS GESTURE IS ABOUT AN INSTRUCTION NOBODY HAS SENT, and what of it.
 *
 * Null for everything else, which is the ordinary case and opens the composer as it always did.
 *
 * IT IS ONE READING OF THE TARGET AND NOT A SECOND KIND OF POINTING. What comes in is the same
 * `Pointed` every other gesture produces; all this does is notice which of the fourteen kinds it
 * turned out to be. That is the whole of the owner's test for whether the target model is right: if
 * an unsent instruction had needed a mechanism of its own, this function could not have been four
 * lines of reading a field.
 *
 * Exported so a test can put the question without a browser.
 */
export function askedChange(pointed: Pointed, at: { x: number; y: number }): ChangeAsked | null {
  const target = pointed.context.target
  if (target.kind !== 'draft') return null
  const span = spanNamedBy(pointed.context)
  return {
    draftId: target.draftId,
    span: span === null ? null : { quote: wordsInNamedSpan(span), from: span.from, to: span.to },
    at,
  }
}

/**
 * OPEN THE COMPOSER ABOUT A THING. The one function every way in calls.
 *
 * It does four things in this order, and each of them used to be somebody's job to remember:
 *
 *   1. Showing mode ends. A gesture that chooses a subject has answered the question the mode was
 *      asking, so leaving the outlines up would leave the next press swallowed as well.
 *   2. What was pointed at is read, once, by the reader in pointing.ts.
 *   3. Where the box hangs is worked out from how the gesture arrived, not from where it landed.
 *   4. An unsent instruction is handed to the composer already holding it.
 *   5. A press on a part of the composer itself is OFFERED to the composer holding it, and nothing
 *      else moves. Everything else opens or replaces the composer's subject.
 *
 * `node` may be null, which means a press on nothing: `pointedAt` answers with the page.
 */
export function openAbout(node: Node | null, at: At, keepSelection = false): void {
  if (!keepSelection) stopFollowingTouchSelection()
  stopShowing()
  const pointed = pointedAt(node, window.getSelection())
  const where = whereItHangs(at)
  // AN UNSENT INSTRUCTION IS ANSWERED BY THE COMPOSER HOLDING IT, not by a second composer.
  const change = askedChange(pointed, where)
  if (change !== null) {
    setComposer({ ...composer, changing: change })
    return
  }
  // A PRESS INSIDE THE OPEN COMPOSER IS AN OFFER. Nothing about the composer moves: not the
  // subject, not the instruction in the box, not who it is for. See `Composer.offered` above.
  if (composer.opened !== null && pointsInsideTheComposer(pointed)) {
    setComposer({ ...composer, offered: pointed })
    return
  }
  setComposer({
    opened: { pointed, at: where, underAnElement: at.at === 'element', route: thePage().route },
    changing: null,
    offered: null,
    cameFrom: null,
  })
  markTheSource(pointed, keepSelection)
}

/**
 * DID THIS PRESS LAND ON A PART OF THE COMPOSER ITSELF?
 *
 * It asks the registry, not the document and not a class name. `isTheComposersOwn` is derived from
 * the one list that already says which parts of the screen exist only while a composer is open, so
 * there is no second list of composer names to fall out of step with the first.
 *
 * THE INSTRUCTION BOX IS NOT ONE OF THESE and never reaches here: it carries a `draft` target, and
 * `askedChange` above answers it two lines earlier with the panel that revises a phrase.
 *
 * Exported so a test can put the question without a browser.
 */
export function pointsInsideTheComposer(pointed: Pointed): boolean {
  const target = pointed.context.target
  if (target.kind === 'uiSurface') return isTheComposersOwn(target.surfaceId)
  // A PIECE OF THE ORGANISED FORM IS PART OF THE COMPOSER THAT DREW IT.
  //
  // A piece belongs to one unsent instruction and is named after it, so the question "is this piece
  // inside the box that is open" has an exact answer: is it a piece of the instruction that box
  // holds. Without this, pointing at a piece would replace the composer's subject and take the
  // whole organised form off the screen — the loss `Composer.offered` above exists to prevent,
  // arriving from inside the feature instead of from a region of the frame.
  if (target.kind === 'proposedAction') return target.interpretationId === theOpenComposersInstruction()
  return false
}

/**
 * THE UNSENT INSTRUCTION THE OPEN COMPOSER HOLDS, or null because it holds none.
 *
 * It is read from the one store that keeps them rather than remembered here. The composer mints the
 * id and writes the words under the thing they are about, so asking that store with the open
 * composer's subject is the same answer the box itself would give, and there is no second copy to
 * fall out of step with the first.
 */
function theOpenComposersInstruction(): string | null {
  const opened = composer.opened
  if (opened === null) return null
  return draftAbout(targetKey(opened.pointed.context.target))?.id ?? null
}

/**
 * TAKE THE OFFER: the composer becomes about the part that was pointed at, in place.
 *
 * It keeps the box where it is on the screen. The instruction that was being written stays in this
 * browser under the name of what it was about, and it comes back the moment that subject is opened
 * again — including by the one press `goBackToWhatYouWereWriting` draws.
 */
export function talkAboutThatInstead(): void {
  const offered = composer.offered
  const opened = composer.opened
  if (offered === null || opened === null) return
  // THE ADDRESS IS THIS ONE AND NOT THE ONE THE FRAME OPENED AT. The part being taken as the new
  // subject is a part of the composer, and the composer is on the page the reader is on now.
  setComposer({
    opened: { pointed: offered, at: opened.at, underAnElement: opened.underAnElement, route: thePage().route },
    changing: null,
    offered: null,
    cameFrom: opened,
  })
  markTheSource(offered)
}

/** Leave the offer alone. Nothing has changed, so this only takes the offer off the screen. */
export function keepWritingThis(): void {
  if (composer.offered === null) return
  setComposer({ ...composer, offered: null })
}

/** Back to the subject an offer was taken from. One step, which is all there ever is. */
export function goBackToWhatYouWereWriting(): void {
  const back = composer.cameFrom
  if (back === null) return
  setComposer({ opened: back, changing: null, offered: null, cameFrom: null })
  markTheSource(back.pointed)
}

/**
 * DRAW THE SOURCE. A touch selection stays live so its ends can still be moved.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER IS THE WHOLE OF IT, AND IT IS NOT NEGOTIABLE
 * ---------------------------------------------------------------------------------------
 *
 * For other gestures, Mole Office draws first and takes second. A gesture Mole Office cannot draw leaves the browser's own
 * selection exactly where it was: nothing is taken away with nothing put back. The other order —
 * clear the selection, then try to paint — is what leaves somebody looking at a composer with no
 * idea which words it is about, and it is what a guarded `removeAllRanges` on the next animation
 * frame amounts to, because by then the selection has already gone by itself.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY A WASH MAY TAKE THE SELECTION. A RAIL AND A FRAME MAY NOT.
 * ---------------------------------------------------------------------------------------
 *
 * A rail means *a place with no words* and a frame means *no place finer than the thing*. Taking a
 * person's selection away and putting the mark for "no words were chosen" in its place is the
 * silent substitution the second engineering invariant forbids, drawn in pixels. So only a wash —
 * the mark that says THESE characters — is allowed to consume the selection that made it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT BUILT HERE, SAID RATHER THAN LEFT TO BE FOUND
 * ---------------------------------------------------------------------------------------
 *
 * The selection is not put back when the composer closes after another gesture. A touch hold keeps
 * the selection itself instead of drawing a second mark, so its ends can be adjusted and the
 * subject follows it.
 */
function markTheSource(pointed: Pointed, keepSelection = false): void {
  // THE ELEMENT THAT WAS PRESSED GOES WITH THE KEY. The walk has already decided which element IS
  // the thing, and handing over only its key threw that away: the mark layer then looked the key
  // up and took the first element carrying it, which on a record page is one of four rows drawing
  // the same record. See `Subject.pressed` in MarkLayer.tsx.
  const washed = setSubject({
    key: targetKey(pointed.context.target),
    place: pointed.place,
    kept: pointed.kept,
    pressed: pointed.element,
    keepSelection,
  })
  if (keepSelection || !washed) return
  window.getSelection()?.removeAllRanges()
}

/**
 * THE MARK ON THE ONE BOX MOLE OFFICE KEEPS, spread onto an element rather than written as a string.
 *
 * Contract 5.5 gives every box a person types in to the browser, with one exception: the composer's
 * own instruction box, because pointing at a phrase of what you are writing is the gesture that
 * revises it. The attribute is written here and read below, so the mark and the rule that reads it
 * cannot drift apart.
 */
const KEPT_BY_MOLE_OFFICE = 'data-px-menu'

/** Put on the one box Mole Office keeps. See `KEPT_BY_MOLE_OFFICE`. */
export function moleOfficeKeepsTheMenu(): Record<string, string> {
  return { [KEPT_BY_MOLE_OFFICE]: 'mole-office' }
}

/**
 * THE INPUT TYPES A PERSON CANNOT TYPE INTO, and therefore the ones that are not boxes.
 *
 * The rule is about what a person came for: paste, spell-check and look-up all need typed text. A
 * tick box, a choice of one option, a colour well and a slider hold no text, so the browser's menu
 * on one of them offers nothing anybody wanted and Mole Office would have a dead spot instead of an
 * answer. Everything else an `input` can be — text, search, email, url, tel, password, number and
 * the date and time ones — holds characters, and the browser normalises a type it does not know to
 * `text`, so this list is the whole of the exception and cannot go stale.
 */
const NOT_A_BOX_YOU_TYPE_IN = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

/**
 * WHETHER THIS GESTURE LANDED IN A BOX THAT BELONGS TO THE BROWSER. Contract 5.5.
 *
 * The element is read through what it can do rather than through `instanceof`, because this module
 * is also loaded by tests running with no document, where naming `Element` would throw.
 */
function theBrowsersOwnBox(node: unknown): boolean {
  const from = node as { closest?: unknown; parentElement?: Element | null } | null | undefined
  if (from === null || from === undefined) return false
  const el = typeof from.closest === 'function' ? (from as unknown as Element) : (from.parentElement ?? null)
  if (el === null) return false
  const box = el.closest('textarea, input, [contenteditable]')
  if (box === null) return false
  const tag = box.tagName
  if (tag === 'INPUT' && NOT_A_BOX_YOU_TYPE_IN.has((box as HTMLInputElement).type)) return false
  // `contenteditable="false"` is a declaration that this element is NOT one, and an element inside
  // an editable one inherits the answer. Both are what `isContentEditable` reads.
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(box as HTMLElement).isContentEditable) return false
  return box.closest(`[${KEPT_BY_MOLE_OFFICE}="mole-office"]`) === null
}

/**
 * WHAT A RIGHT-CLICK MEANS, as five answers over four fields.
 *
 * Exported, because the order of these tests is the whole of the keyboard route and a test that had
 * to raise a real menu could only ask it in one of the three engines.
 *
 *   1  a box you type in             leave it alone. The browser's own menu, with paste,
 *                                    spell-check and look-up in it. Contract 5.5.
 *   2  `button === -1`               a menu raised from the keyboard. Never blocked by Shift.
 *   3  `pointerType` touch or pen    handled separately: touch holds open the office menu, while a
 *                                    pen keeps its platform behaviour.
 *   4  `shiftKey`                    leave it alone. The browser's own menu.
 *   5  otherwise                     a pointer.
 *
 * THE BOX TEST IS FIRST, and that is the contract's own order rather than a convenience: a person
 * standing in a search box wants Paste however they asked for the menu, including with `Shift+F10`.
 * It is the one place in the product where the keyboard reaches the browser's menu.
 *
 * THE KEYBOARD TEST IS AHEAD OF THE REST and that is measured rather than chosen: Chromium raises
 * `Shift+F10` with `shiftKey === false` and `button === -1` (claim `wKR0jkvl_7sz`), so an engine
 * that reported the shift key as held would otherwise fall into rule 4 and the keyboard route would
 * never run. It is also ahead of the touch test because a gesture with no pointer has no pointer
 * type either, and a missing field must not be read as a mouse.
 *
 * THE POINTER TYPE IS THIS EVENT'S OWN. A module-level note of the last pointer seen anywhere would,
 * on a machine with both a screen and a mouse, swallow a right-click for as long as it took somebody
 * to touch anything. `contextmenu` is a `PointerEvent` in the engines that raise it from a pointer,
 * so the field is on the event that is being decided about.
 */
export function whatTheMenuDoes(e: {
  button: number
  shiftKey: boolean
  pointerType?: string
  target?: unknown
}): 'editable' | 'keyboard' | 'touch' | 'native' | 'pointer' {
  if (theBrowsersOwnBox(e.target)) return 'editable'
  if (e.button === -1) return 'keyboard'
  if (e.pointerType === 'touch' || e.pointerType === 'pen') return 'touch'
  if (e.shiftKey) return 'native'
  return 'pointer'
}

// ============================================================================ the listeners

/** How long a still finger must be held. */
const TOUCH_HOLD_MS = 500

type CalloutStyle = { element: HTMLElement; value: string; priority: string }
type TouchHold = {
  id: number
  x: number
  y: number
  node: Node
  text: boolean
  held: boolean
  timer: number
  callout: CalloutStyle | null
}

let touchHold: TouchHold | null = null
let followingTouchSelection: { within: Element; at: At; callout: CalloutStyle | null } | null = null
let suppressTouchClick = false
let touchPressedTheSelection = false

/** Whether the current opening keeps a touch selection available for adjustment. */
export function touchSelectionIsLive(): boolean {
  return followingTouchSelection !== null
}

/** Whether the current pointerdown is a touch inside the live selection. */
export function touchPressIsInTheSelection(): boolean {
  return followingTouchSelection !== null && touchPressedTheSelection
}

function restoreCallout(style: CalloutStyle | null): void {
  if (style === null) return
  if (style.value === '') style.element.style.removeProperty('-webkit-touch-callout')
  else style.element.style.setProperty('-webkit-touch-callout', style.value, style.priority)
}

function stopFollowingTouchSelection(): void {
  if (followingTouchSelection === null) return
  restoreCallout(followingTouchSelection.callout)
  followingTouchSelection = null
}

function forgetTouchHold(): void {
  if (touchHold === null) return
  window.clearTimeout(touchHold.timer)
  restoreCallout(touchHold.callout)
  touchHold = null
}

/** Find actual text at the finger, rather than treating a paragraph's padding as text. */
function textAt(x: number, y: number): Node | null {
  let range = document.caretRangeFromPoint?.(x, y) ?? null
  if (range === null) {
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
    const position = doc.caretPositionFromPoint?.(x, y)
    if (position) {
      range = document.createRange()
      range.setStart(position.offsetNode, position.offset)
    }
  }
  if (range === null || range.startContainer.nodeType !== Node.TEXT_NODE) return null
  const node = range.startContainer
  const length = node.textContent?.length ?? 0
  if (length === 0) return null
  const offset = Math.min(range.startOffset, length - 1)
  const character = document.createRange()
  character.setStart(node, offset)
  character.setEnd(node, offset + 1)
  const box = character.getBoundingClientRect()
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom ? node : null
}

/** A held control or a drag surface already owns its gesture. */
function touchBelongsElsewhere(element: Element): boolean {
  return element.closest('[data-hold], .px-chat-write, .px-chat-chrome, .px-chat-seam, .px-chat-grip, .gx-card, .gx-grip') !== null
}

function touchBegan(e: TouchEvent): void {
  if (e.touches.length !== 1) {
    forgetTouchHold()
    return
  }
  forgetTouchHold()
  const finger = e.touches[0]
  const element = e.target instanceof Element ? e.target : null
  if (!finger || element === null || theBrowsersOwnBox(element)) return
  const node = textAt(finger.clientX, finger.clientY)
  if (touchBelongsElsewhere(element)) return
  const at = { at: 'pointer', x: finger.clientX, y: finger.clientY } as const
  const styled = element instanceof HTMLElement ? element : null
  const callout = styled === null ? null : {
    element: styled,
    value: styled.style.getPropertyValue('-webkit-touch-callout'),
    priority: styled.style.getPropertyPriority('-webkit-touch-callout'),
  }
  styled?.style.setProperty('-webkit-touch-callout', 'none')
  const hold: TouchHold = {
    id: finger.identifier, x: at.x, y: at.y, node: node ?? element,
    text: node !== null, held: false, timer: 0, callout,
  }
  hold.timer = window.setTimeout(() => {
    if (touchHold !== hold) return
    hold.held = true
    if (!hold.text) openAbout(hold.node, at)
  }, TOUCH_HOLD_MS)
  touchHold = hold
}

function touchMoved(e: TouchEvent): void {
  const hold = touchHold
  if (hold === null) return
  const finger = [...e.touches].find((one) => one.identifier === hold.id)
  if (!finger || Math.hypot(finger.clientX - hold.x, finger.clientY - hold.y) > TOUCH_SLOP_PX) forgetTouchHold()
}

function touchEnded(e: TouchEvent): void {
  const hold = touchHold
  if (hold === null || ![...e.changedTouches].some((one) => one.identifier === hold.id)) return
  window.clearTimeout(hold.timer)
  touchHold = null
  if (!hold.held) {
    restoreCallout(hold.callout)
    return
  }
  e.preventDefault()
  suppressTouchClick = true
  window.setTimeout(() => { suppressTouchClick = false }, 0)
  if (!hold.text) {
    restoreCallout(hold.callout)
    return
  }
  const selection = window.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
    restoreCallout(hold.callout)
    openAbout(hold.node, { at: 'pointer', x: hold.x, y: hold.y })
    return
  }
  stopFollowingTouchSelection()
  const within = addressableAt(hold.node)?.element ?? document.body
  const at = { at: 'pointer', x: hold.x, y: hold.y } as const
  followingTouchSelection = { within, at, callout: hold.callout }
  openAbout(hold.node, at, true)
}

function touchSelectionChanged(): void {
  const following = followingTouchSelection
  if (following === null || composer.opened === null) return
  const selection = window.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (!following.within.contains(range.startContainer) && !following.within.contains(range.endContainer)) return
  const pointed = pointedAt(range.startContainer, selection)
  if (pointsInsideTheComposer(pointed) || pointed.context.target.kind === 'draft') return
  openAbout(range.startContainer, following.at, true)
}

/**
 * THE ONE `contextmenu` LISTENER IN THE PRODUCT.
 *
 * A component that added a second one and called `stopPropagation` would make a dead spot that
 * nothing on screen could show and no type could catch. There is one, it is here, and a test asserts
 * that mounting the whole layer registers exactly one.
 *
 * ONE RULE, AND IT IS THE WHOLE RULE: inside Mole Office a mouse right-click always opens the composer
 * about something, and Shift always gives the browser's menu back. Nothing is refused for being
 * mute any more. It used to take the menu in fewer places, and the exemptions are what made the
 * gesture unusable: a row's title link covers the whole row, so "not on a link" meant "not on the
 * row", and measured at 1440 on 18 August 2026 a 1146px module row answered a right-click only in
 * the 5% strip at each end.
 *
 * WHAT IS STILL LEFT ALONE: a box a person types in that is not the composer's own instruction box,
 * `Shift`, and a pen pointer. A touch hold is handled by the touch listeners below.
 */
function onMenu(e: MouseEvent): void {
  const does = whatTheMenuDoes(e as MouseEvent & { pointerType?: string })
  // A BOX A PERSON TYPES IN IS THE BROWSER'S, AND SO IS ANYTHING WITH SHIFT HELD. Two reasons, one
  // answer: return before `preventDefault`, so the browser draws its own menu and Mole Office does
  // nothing at all. Contract 5.5 and 6.4.
  if (does === 'editable' || does === 'native') return
  // Some browsers omit pointerType from a touch-generated contextmenu.
  if (touchHold !== null && does === 'pointer') {
    e.preventDefault()
    return
  }
  // A TOUCH HOLD HAS ITS OWN LIFETIME. Suppress the browser menu here; the touch listeners decide
  // whether and when to open ours. A pen keeps the platform menu, except on a held control.
  if (does === 'touch') {
    const element = e.target as Element | null
    const pen = (e as MouseEvent & { pointerType?: string }).pointerType === 'pen'
    if (element?.closest?.('[data-hold]') || (!pen && !element?.closest?.('.px-chat-write'))) e.preventDefault()
    return
  }

  // THE GATE THAT USED TO BE HERE IS GONE, AND THIS IS WHAT WENT WITH IT. It read
  // `if (addressableAt(...) === null) return`, so a right-click on any pixel that said nothing about
  // itself gave the browser's menu. Nearly every pixel said nothing. It could only be deleted after
  // emission: with nothing on the screen carrying a page key, ten mute surfaces would have answered
  // one identical string and a comment saved against one of them could never have been drawn again.
  // Emission landed at steps 15 and 16, so the shell now carries `page/<route>` and the walk reaches
  // it from everywhere inside the app. `pointedAt` is total — a press on nothing is a press on the
  // page — so the line below no longer needs an answer from the walk at all.
  e.preventDefault()
  const mole = (e.target as Element | null)?.closest?.<HTMLElement>('[data-office-map-agent]')
  if (mole?.dataset.officeMapAgent) {
    stopShowing()
    closeTheComposer()
    openTheChatAt({kind:'agent',id:mole.dataset.officeMapAgent},mole.dataset.officeMapWorkspace)
    return
  }
  const found = addressableAt(e.target as Node)
  const at = does === 'keyboard' ? withoutAPointer(e.target, found?.element ?? null) : ({ at: 'pointer', x: e.clientX, y: e.clientY } as const)
  openAbout(e.target as Node, at)
}

/**
 * WHILE THE PAGE IS MARKING WHAT CAN BE TALKED ABOUT, a press ON ONE OF THE MARKED THINGS is the
 * subject. A press anywhere else is left entirely alone.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS DELETED HERE, AND WHAT IT COST WHILE IT WAS THERE
 * ---------------------------------------------------------------------------------------
 *
 * This listener used to take EVERY press in the document while the mode was on. Its only exemption
 * was the host every popup is drawn in. Four things were broken by that, all four measured:
 * pressing a rail row filed a comment about the whole page instead of navigating; the Reviews
 * switch did not open the column; dragging across words ended with the selection gone and a
 * composer about whatever the drag ran through; and pressing the mode's own off button opened a
 * composer about the whole page rather than ending the mode. Four ways of asking the mode to stop
 * and all four opened a box.
 *
 * Two more exemptions were written for two of those four — one for the popup host, one for the off
 * button — each naming a class. Both are gone. What replaces all of it is one rule that names no
 * component:
 *
 *   > THE MODE IS OVER THE PAGE. A press is taken when the thing under it is one of the page's own
 *   > declared elements, and never otherwise.
 *
 * The popup host is the last child of the shell and the off button is in the rail, so neither is
 * inside the page and neither needs a rule of its own any more. The rail navigates, the review
 * switch opens the column, the top bar works, and the mode's own control ends it.
 *
 * THE ONE THING THIS RULE DEPENDS ON THAT DID NOT USED TO BE TRUE. Since step 15 the shell itself
 * carries `page/<route>`, so "is there anything addressable under this press" is now yes for every
 * pixel of the window. Left as it was, the mode would have swallowed every press in the product —
 * the document-wide veto back again, wearing emission as a costume.
 *
 * IT STILL LISTENS IN THE CAPTURE PHASE, and that is not the veto. Everything addressable is also
 * something else: a row that navigates, a cell that opens an editor, a block that folds. A press on
 * a subject has to mean one thing, and while the mode is on it means "this one", so it is stopped
 * before the thing's own handler sees it. What was deleted is which presses it takes, not when it
 * runs.
 */
let pressStartedAt: { x: number; y: number; pointerType: string } | null = null

function pressBegan(e: PointerEvent): void {
  pressStartedAt = { x: e.clientX, y: e.clientY, pointerType: e.pointerType }
  touchPressedTheSelection = false
  if (followingTouchSelection === null || e.pointerType !== 'touch' || !(e.target instanceof Node)) return
  const selection = window.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (!range.intersectsNode(e.target)) return
  touchPressedTheSelection = Array.from(range.getClientRects()).some((box) =>
    e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom,
  )
}

/** How far a mouse press may move and still be a press: past this it is a drag across words. */
export const MOUSE_SLOP_PX = 4

/**
 * HOW FAR A TOUCH PRESS MAY MOVE AND STILL BE A TAP. Problem hj-gfm7qV5Uw.
 *
 * A finger is not a mouse. Chromium moves the click of a tap towards the nearest target it can find
 * under the finger, so the click lands away from where the finger came down: measured on 30 September
 * 2026 with a test's synthetic tap beside Home's week bar, 5 pixels at 390 and 7 at 1440. With the
 * mouse's four pixels, such a tap was read as a drag and chose nothing. Sixteen is about the radius
 * of a fingertip's contact on a phone; it is a choice, not a measurement of real fingers. A drag
 * across words on a touch screen is a long press and its handles, which raise no click, so a larger
 * allowance here does not turn a touch selection into a choice. A pen keeps the mouse's allowance,
 * because a pen can drag across words the way a mouse does.
 */
export const TOUCH_SLOP_PX = 16

/** Whether this press chooses a subject: the mode is on, it is not a drag, and it landed on one. */
export function pressChoosesTheSubject(
  showing: boolean,
  landedOn: HTMLElement | null,
  moved: number | null,
  pointerType: string = 'mouse',
): boolean {
  if (!showing) return false
  // A DRAG IS NOT A PRESS. Dragging across words chooses words; it does not choose a subject. A
  // finger's tap is allowed more movement than a mouse's press; see TOUCH_SLOP_PX.
  const slop = pointerType === 'touch' ? TOUCH_SLOP_PX : MOUSE_SLOP_PX
  if (moved !== null && moved > slop) return false
  if (landedOn === null) return false
  return isInThePage(landedOn)
}

function onPress(e: MouseEvent): void {
  // WHERE THE PRESS STARTED, so a drag can be told from a press. Null when no pointer began this
  // click at all — a control driven from the keyboard, or a click a test dispatches — and that is
  // not a drag either. It is read and taken back on every click, whether this mode is on or not, so
  // one stale number cannot decide a later gesture.
  const started = pressStartedAt
  pressStartedAt = null
  if (suppressTouchClick) {
    suppressTouchClick = false
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (!isShowing()) return
  const found = addressableAt(e.target as Node)
  const moved = started === null ? null : Math.max(Math.abs(e.clientX - started.x), Math.abs(e.clientY - started.y))
  // `true` because the line above already returned when the mode was off. The rule takes the state
  // as an argument so that a test can put the question without a document, and the early return is
  // there so that an ordinary press in an ordinary session does not walk the tree for nothing.
  if (!pressChoosesTheSubject(true, found?.element ?? null, moved, started?.pointerType)) return
  e.preventDefault()
  e.stopPropagation()
  // NO POINTER BEGAN THIS PRESS, SO IT HAS NO POSITION. `Enter` and `Space` on an outlined element
  // raise a click reporting `clientX 0, clientY 0`, and this listener used to open the box at those
  // numbers — the top-left corner of the window, nowhere near the thing the person was on.
  const at = started === null ? withoutAPointer(e.target, found?.element ?? null) : ({ at: 'pointer', x: e.clientX, y: e.clientY } as const)
  openAbout(e.target as Node, at)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && isShowing()) stopShowing()
}

/**
 * GOING SOMEWHERE ELSE ENDS THE MODE. It marks what is on THIS page, so the marks mean nothing on
 * the next one, and a mode that survived a navigation would be a mode somebody has to remember they
 * are in. Contract §6.6: reload ends it, navigation ends it.
 */
function onNavigation(): void {
  stopShowing()
}

/**
 * Attach the product's document listeners, and give back the one call that takes them off.
 *
 * The cleanup also ends showing mode, so a page that unmounts mid-gesture cannot leave every
 * addressable element outlined with nothing listening.
 */
export function startDispatch(): () => void {
  document.addEventListener('contextmenu', onMenu)
  document.addEventListener('touchstart', touchBegan, { passive: true })
  document.addEventListener('touchmove', touchMoved, { passive: true })
  document.addEventListener('touchend', touchEnded, { passive: false })
  document.addEventListener('touchcancel', forgetTouchHold, { passive: true })
  document.addEventListener('selectionchange', touchSelectionChanged)
  document.addEventListener('pointerdown', pressBegan, true)
  document.addEventListener('click', onPress, true)
  document.addEventListener('keydown', onKey)
  window.addEventListener('hashchange', onNavigation)
  return () => {
    document.removeEventListener('contextmenu', onMenu)
    document.removeEventListener('touchstart', touchBegan)
    document.removeEventListener('touchmove', touchMoved)
    document.removeEventListener('touchend', touchEnded)
    document.removeEventListener('touchcancel', forgetTouchHold)
    document.removeEventListener('selectionchange', touchSelectionChanged)
    document.removeEventListener('pointerdown', pressBegan, true)
    document.removeEventListener('click', onPress, true)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('hashchange', onNavigation)
    forgetTouchHold()
    stopFollowingTouchSelection()
    stopShowing()
  }
}

/**
 * WHAT IS NOT BUILT HERE YET, AND WHAT EACH ONE IS WAITING FOR.
 *
 * ---------------------------------------------------------------------------------------
 * 1. A RIGHT-CLICK INSIDE AN EDITABLE FIELD DOES NOT YET GIVE THE BROWSER'S OWN MENU
 * ---------------------------------------------------------------------------------------
 *
 * The rule is: a right-click inside an `input`, a `textarea` or anything `contentEditable` yields
 * the browser's own menu, and the composer's draft box is the one exception because revising a
 * phrase of your own instruction is the one interaction that needs the gesture.
 *
 * The exception is marked by an attribute on the draft box, and nothing writes that attribute yet.
 * Switching the rule on before the mark exists would take the gesture away from the draft box, which
 * is the one field that must keep it. That is the producer-before-validator rule in the campaign
 * plan: a check may not land before the thing that produces the value it reads. The mark is written
 * by the emission step; the rule lands with it.
 *
 * ---------------------------------------------------------------------------------------
 * 2. A PHRASE SELECTED IN THE DRAFT BOX IS STILL WIDENED TO THE WHOLE INSTRUCTION IN CHROMIUM
 * ---------------------------------------------------------------------------------------
 *
 * Chromium moves the caret on right-mouse-DOWN, so by the time the menu event arrives the box
 * reports a collapsed caret and the phrase the person selected is gone. The designed repair is a
 * stash: record the box's selection on `pointerdown` when `button === 2`, and use it at
 * `contextmenu` only if the pointer is inside the rectangles of the stashed range.
 *
 * The second half of that cannot be built as written. A `textarea`'s value is not in the document,
 * so there is no `Range` over part of it and no rectangles to test a point against — measured, see
 * `design/round-nine/step13-one-dispatch.md`. Building the stash without the containment test would
 * replace one silent widening with a different silent answer: a phrase selected minutes ago in
 * another part of the box. So neither half is built here, and the interaction keeps the behaviour it
 * has until the step that draws the mark can say on screen which of the two answers it gave.
 */
