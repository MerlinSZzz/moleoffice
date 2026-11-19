// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { behaviorForJump, washJumpTarget } from '../../lib/motion.ts'
/**
 * TAKING A READER FROM A PROJECTION TO THE PARTS OF THE REPORT IT STANDS FOR.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT WAS MISSING
 * ---------------------------------------------------------------------------------------
 *
 * Acceptance Act 3 (design/problem-03/ACCEPTANCE.md:538) asks for this:
 *
 *   At the shortest level, a right-click on the summary itself names which parts of the full
 *   report it stands for, and View original lands on those parts rather than on a new object.
 *
 * Measured on 1 September 2026: there was no *View original* control anywhere in the product. The
 * only place the phrase appeared was a comment in src/web/components/agent/marks.ts, about
 * restoring a READING LENGTH somebody had written a comment at — a different thing, about a
 * different object, and never drawn as a control either.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT CHANGES THE READING LENGTH FIRST
 * ---------------------------------------------------------------------------------------
 *
 * A projection is read at a short reading length, and at a short reading length the parts it stands
 * for are the parts the page is not drawing — that is what the length means. So a press that only
 * scrolled would scroll to nothing on the ordinary case, which is every case that matters. The
 * length is put to Full, through `setDetailHere`, which is the one place that choice is written,
 * and the page redraws with the parts on it.
 *
 * AND WHETHER IT REALLY DID IS LOOKED AT AFTERWARDS — the eighth door, below.
 *
 * ---------------------------------------------------------------------------------------
 * IT LANDS ON THE PART AND NEVER ON A NEW OBJECT
 * ---------------------------------------------------------------------------------------
 *
 * WHICH ELEMENT ON THIS PAGE IS THIS PART is asked of `elementDrawing` in src/web/lib/drawnhere.ts
 * and of nothing else, so a landing and a mark cannot answer differently about one part. This file
 * spelled the key itself until 1 September 2026 and was wrong about every block on the page: a
 * top-level block is drawn under its older `reportBlock` word, an exact compare against the region
 * key matched none of them, and the press said "not drawn on this page" about twelve blocks in
 * front of the reader. The whole argument, with the measurement, is in that file's own note.
 *
 * ---------------------------------------------------------------------------------------
 * AND IT SAYS WHERE IT WENT — FOUR ANSWERS, BECAUSE THE PAGE HAS FOUR STATES TO BE IN
 * ---------------------------------------------------------------------------------------
 *
 *   the part      this drawing draws the part itself. Land on it and say so.
 *   what holds it this drawing draws no element for the part — a stored row of a table, an item of
 *                 a list — but it draws the thing containing it, and the reader can see the words.
 *                 Land on the holder and say plainly that it is the holder and not the part.
 *   a part of it  this drawing draws no element for the part and nothing above it either, and yet
 *                 the page is covered in it: the body of a report has no element of its own and
 *                 twelve blocks of that body are on the screen. Land on the biggest piece of it
 *                 the page has and say plainly it is a piece and not the whole.
 *   nowhere       this drawing draws none of it, above or below. Only then is "there is nowhere
 *                 here to go to" true.
 *
 * THE MIDDLE TWO ARE THE COMMON ONES AND USED TO BE CALLED THE LAST. Measured on OOOt4Kouc5dT drawn
 * at "All of it", 1 September 2026: of the 488 part ids the write door accepts, 134 have an element
 * of their own and 351 more are drawn inside one — 84 stored table rows, 260 cells and 7 list items
 * whose holders are all on the screen. The last three are `data`, `section.summary` and
 * `data.blocks`, which nothing holds because they are near the top of the tree, and which the page
 * was drawing 37,246 characters of. Calling any of those absent is the false sentence this whole
 * file exists to avoid, told about the entire report.
 *
 * `nearestDrawn` and `firstDrawnInside` in ./marks.ts are the two walks, up and down, and they take
 * the same tree and the same drawn set. One tree, so the mark on a table row and the landing on a
 * table row are about the same element.
 *
 * ---------------------------------------------------------------------------------------
 * AND IT NEVER CLAIMS TO HAVE SHOWN SOMETHING IT DID NOT SHOW
 * ---------------------------------------------------------------------------------------
 *
 * `section.links` lives inside a closed `<details class="rd-fold">` — the state the links panel is
 * in on every record until somebody opens it. An element exists for it, so the press used to answer
 * *"Showing the section “Links” these words stand for, with the whole report drawn."* Measured at
 * that instant on 1 September 2026: `window.scrollY` 0 before the press and 0 three and a half
 * seconds after it, the element's rect top 13,079 in a 1,200-tall window, `checkVisibility()` false,
 * `innerText` empty, and `elementFromPoint` at its own centre returning something else. Nothing had
 * moved and nothing was on the screen, and the product said it was.
 *
 * So `goTo` OPENS THE FOLD — that is the kinder answer and a `<details>` is opened by saying so —
 * then scrolls, then WAITS FOR THE SCROLL TO STOP, then LOOKS. What it finds is the second half of
 * the answer: on the screen, still inside a fold nothing could open, off the screen, or gone
 * because the page redrew underneath it. The sentence follows the looking rather than the intention.
 *
 * The answers are a sentence rather than a press that appears to do nothing, which is the fifth
 * invariant on the smallest surface it has: *nobody looked* is not *nothing is there*.
 *
 * ---------------------------------------------------------------------------------------
 * THE EIGHTH DOOR: AND IT NO LONGER ASSERTS HOW MUCH OF THE REPORT IS DRAWN EITHER
 * ---------------------------------------------------------------------------------------
 *
 * Every landed sentence used to end *"with the whole report drawn."* That was the intention of the
 * `setDetailHere` two paragraphs up, written down as though it were a fact about the screen, and
 * nothing looked at the screen to check. Measured on 1 September 2026 with `sessionStorage` writes
 * refused, which is what Safari in private browsing and some locked-down profiles do: the report
 * body was 4,525 characters before the press and 4,525 after it — Full is 30,297 — 34 of 141
 * regions were drawn, no preset was drawn as chosen, and the composer said the whole report was
 * drawn. At the card length it called `section.summary` absent while sitting at 8,647 of 30,297.
 *
 * `theReportsLengthNow` is the looking. It reads the length off the drawing the page really made,
 * after the scroll has settled, and `aboutTheLength` turns that into the second sentence — the
 * whole report is drawn, or the report is still at some shorter length, and where the browser
 * refused to keep the choice it says that as the reason. `setDetailHere` answers whether the write
 * took, which is what makes the reason sayable instead of guessable.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE SCROLL IS NOT CALLED ARRIVED BEFORE IT DEPARTS
 * ---------------------------------------------------------------------------------------
 *
 * The wait sampled `window.scrollY` and read two equal readings as arrival, which is also what a
 * scroll that has not started yet looks like. 19 of 488 presses printed "is on this page but this
 * press could not bring it onto the screen" about parts the same press put at rect top 32 three and
 * a half seconds later — the same 19 ids in two independent passes, and `offScreen` printed
 * truthfully zero times out of 19. `whenTheScrollHasStopped` and `SCROLL_SETTLES_IN_MS` below say
 * what the moment is now and why that moment is the right one.
 */

import { namesOfPartsOnThisPage } from './context.ts'
import { type Rung } from '@shared/detail.ts'
import { content, t } from '@shared/i18n.ts'
import { setDetailHere } from '../../lib/detailchoice.ts'
import { readingLengthAbove } from '../../lib/drawnat.ts'
import { elementDrawing, regionsDrawnOnHere } from '../../lib/drawnhere.ts'
import { firstDrawnInside, nearestDrawn } from './marks.ts'

/** How long the part stays lit after the page has been taken to it. */
const LIT_FOR_MS = 4000

/**
 * HOW LONG TO GO ON LOOKING FOR THE PART, and why it is a wait at all.
 *
 * Putting the reading length to Full re-renders the report, and the element carrying the part does
 * not exist until React has drawn it. Looking once would answer "not on this page" about a part
 * that arrives four milliseconds later, which is the false sentence this whole file exists to
 * avoid. `MarkLayer` waits on a `MutationObserver` for the same reason and this is the same wait.
 */
const WAIT_FOR_MS = 1200

/**
 * WHEN TO MEASURE WHETHER THE READER CAN SEE IT, AND WHY IT IS NOT THE MOMENT OF THE PRESS.
 *
 * `getBoundingClientRect` is a fact about one instant and a smooth scroll is not an instant. Asking
 * straight after `scrollIntoView` would say "off the screen" about every part the page is on its
 * way to, which is the same false sentence in the opposite direction from the one this file was
 * built to end.
 *
 * ---------------------------------------------------------------------------------------
 * TWO EQUAL SAMPLES OF `window.scrollY` CANNOT TELL AN ARRIVAL FROM A DEPARTURE THAT HAS NOT
 * HAPPENED, AND THAT IS WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * This used to sample `window.scrollY` every `SCROLL_SAMPLE_MS` and call two equal readings an
 * arrival. A smooth scroll does not begin in the first hundred milliseconds, so the first two
 * readings of a scroll that had not started yet are equal for the same reason the first two
 * readings of a page already in place are: nothing has moved. The press then measured the rect
 * before the page had gone anywhere and printed "is on this page but this press could not bring it
 * onto the screen" about a part it was on its way to. Measured over 488 presses on the owner's
 * report OOOt4Kouc5dT, twice, on 1 September 2026: the same 19 ids said it both times, and all 19
 * sat at rect top 32 three and a half seconds later. `offScreen` was printed truthfully zero times
 * out of 19.
 *
 * SO THE MOMENT IS THE FIRST ONE AT WHICH THE ELEMENT HAS STOPPED MOVING **AND** IS SOMEWHERE A
 * FINISHED SCROLL WOULD HAVE LEFT IT. The thing sampled is the element's own rect, not the window,
 * because the element is what the sentence is about — a page that scrolls a different scroller, or
 * that reflows underneath the press, moves the element without moving `window.scrollY`. A rect that
 * has not moved AND is on the screen is a scroll that has finished; a rect that has not moved and
 * is off the screen is a scroll that has not begun, and waiting is the only way to tell those two
 * apart. That is the whole of the fix and it is why the condition is a conjunction.
 *
 * `SCROLL_SETTLES_IN_MS` IS THE END OF THE ARGUMENT, and it is 5,000 rather than the 1,200 it was,
 * because the 19 arrived at three and a half seconds. A deadline shorter than the journey turns
 * "wait for it" back into "say it did not arrive". A press that answers late is worse than a press
 * that answers wrong only if it never answers, and this one always does: a landing that has
 * arrived leaves after two samples, so the only press that pays the deadline is the one whose part
 * genuinely never comes onto the screen.
 */
const SCROLL_SAMPLE_MS = 100
const SCROLL_SETTLES_IN_MS = 5000

/** The class the part carries while it is lit. The rule is in agent-css.ts. */
export const LANDED_ON = 'px-original-here'

/**
 * WHERE A PRESS PUT THE READER. Four words for four states of the page, and never a boolean:
 * *the page is showing the part*, *the page is showing what holds it* and *the page is showing one
 * piece of it* are different facts and a reader acts on them differently, so collapsing them into
 * one flag would be the silent substitution this repository's second invariant forbids.
 */
export type Landing = 'thePart' | 'whatHoldsIt' | 'aPartOfIt' | 'nowhere'

/**
 * WHETHER THE READER CAN ACTUALLY SEE WHAT THE PRESS LANDED ON, measured after the scroll stopped.
 *
 * A separate fact from `Landing` and not a shade of it. *We found an element for it* and *you can
 * see it* were one word until 1 September 2026, and that is exactly how a part folded away inside a
 * closed panel came to be reported as shown.
 */
export type Showing = 'onTheScreen' | 'insideAFold' | 'offScreen' | 'gone' | 'noPlace'

/** What a press did, in the words the surface that made it prints. */
export interface Landed {
  /** Which of the four places. */
  landing: Landing
  /** What the reader can see of it, looked at rather than assumed. */
  showing: Showing
  /** The sentence to draw. Never empty, in any of them. */
  says: string
}

/**
 * THE ELEMENT ON THIS PAGE THAT IS ONE PART OF ONE RECORD, or null when this page is not drawing it.
 *
 * The one answer, read and not re-derived. See the note at the top of this file, and the longer one
 * in src/web/lib/drawnhere.ts, for what it cost to have two.
 */
function elementFor(recordId: string, regionId: string): Element | null {
  return elementDrawing({ kind: 'region', recordId, regionId })
}

/**
 * THE NEAREST THING ON THIS PAGE THAT HOLDS A PART THE PAGE DOES NOT DRAW, or the biggest piece of
 * that part the page does draw, with the word for whichever it is — or null because this page has
 * neither.
 *
 * ONE FUNCTION FOR BOTH WALKS BECAUSE BOTH ASK ONE QUESTION OF ONE TREE. The tree is the one this
 * page's own drawing derived and the drawn set is read off the document once, both through
 * `regionsDrawnOnHere` — the same pair the comment layer's `whereItIsInstead` asks for, so the
 * surfaces walk one tree and not three.
 *
 * UP FIRST, THEN DOWN. What holds a part shows the reader the part's own words in place; a piece of
 * it shows some of the part and none of its surroundings. Where the page has both, the holder is
 * the closer answer to "take me to it".
 *
 * WHICH PART IT FOUND IS `namesOfParts`'s ANSWER AND IS NOT WRITTEN HERE. It used to answer with
 * `wordForRegion`, which says what KIND of part something is — fourteen role words over a whole
 * record. Measured in a browser on 2 September 2026: a press against the record root landed and
 * said *"Showing the section inside it"*, while the one namer had *the section “The short answer”*
 * for that very element. That is the defect the review pane had had one day earlier, one branch
 * away in this same function, and it is the same fix: the sentence says WHICH part, not what kind.
 *
 * IT IS THE SAME MAP THE SERVER'S SENTENCES ARE BUILT FROM, asked of the tree this page announced,
 * so the row's *Stands for the section “…”* and the landing's *Showing the section “…”* are one
 * answer read twice rather than two namers agreeing by luck. It is said in the page language:
 * `namesOfPartsOnThisPage` hands the one namer the page's words (problem t_ox8XMOvu7a).
 */
function insteadOf(
  recordId: string,
  regionId: string,
): { at: Element; name: string; landing: 'whatHoldsIt' | 'aPartOfIt' } | null {
  const here = regionsDrawnOnHere(recordId)
  if (here === null) return null
  const drawn = new Set(here.drawn.keys())
  const above = nearestDrawn(here.report.root, regionId, drawn)
  const found = above === null
    ? { id: firstDrawnInside(here.report.root, regionId, drawn), landing: 'aPartOfIt' as const }
    : { id: above, landing: 'whatHoldsIt' as const }
  if (found.id === null) return null
  const at = here.drawn.get(found.id)
  // WHICH PART IT IS, OUT OF THE TREE THIS PAGE ANNOUNCED AND THE RECORD IT ANNOUNCED IT FOR.
  // `namesOfParts` is total over the tree it was asked of, and this id came out of that tree.
  const name = namesOfPartsOnThisPage(here.report.root, here.report.kind, here.report.title).get(found.id)
  // THE ID CAME OUT OF THIS MAP AND THIS TREE, so both are there. `undefined` would mean two
  // readings of one page disagreed, and the honest answer then is the one with no landing in it.
  if (at === undefined || name === undefined) return null
  return { at, name, landing: found.landing }
}

/**
 * Put the light out on whatever is carrying it. One place, so two presses cannot leave two lit.
 *
 * IT STOPS THE KEEPER FIRST, AND THAT IS NOT HOUSEKEEPING. `keepLit` below puts the class back
 * whenever something writes over it, and a keeper left running from the previous press does exactly
 * that to this function: the class comes off and goes straight back on. Measured over 488 presses
 * on OOOt4Kouc5dT on 1 September 2026, with the keeper in and this line out: the number of presses
 * that lit something outside the window went from 15 to 32, because the part the PREVIOUS press had
 * landed on was still lit and still first in the document. One press, one light.
 */
function unlight(): void {
  stopKeeping?.()
  stopKeeping = null
  for (const one of document.querySelectorAll(`.${LANDED_ON}`)) one.classList.remove(LANDED_ON)
}

/** How to stop the keeper that is running right now, or null because none is. See `keepLit`. */
let stopKeeping: (() => void) | null = null

/**
 * KEEP THE LIGHT ON FOR ITS FOUR SECONDS, EVEN THOUGH REACT WRITES THE WHOLE `class` ATTRIBUTE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY `gone` DID NOT CATCH IT
 * ---------------------------------------------------------------------------------------
 *
 * `classList.add` puts a class on an element React did not put there. The next time React renders
 * that element it writes `className` as one string, from its own props, and the added class is
 * simply not in it — the element is not replaced, it stays connected, its rect is unchanged, and
 * the light goes out. `showingNow` answers `gone` only for an element that has LEFT the document,
 * so this failed with nothing saying so: 6 of 488 presses on the owner's report OOOt4Kouc5dT lit a
 * part, printed *Showing …*, and left the reader looking at a page with nothing marked on it.
 *
 * ---------------------------------------------------------------------------------------
 * SO THE CLASS IS PUT BACK, AND THAT IS NOT A FALLBACK
 * ---------------------------------------------------------------------------------------
 *
 * Nothing is substituted for a value nobody chose. The press asked for one thing — this part is lit
 * for four seconds — and a redraw underneath it is the page losing that state, not the page
 * deciding against it. Re-applying is holding the state the reader asked for, and it stops when the
 * four seconds are up, which is the one place the light is ever taken off.
 *
 * A `MutationObserver` and not a timer, because the redraw happens whenever React feels like it and
 * a poll would leave the page unlit for however long its interval is.
 */
function keepLit(at: Element): () => void {
  const watch = new MutationObserver(() => {
    if (!at.classList.contains(LANDED_ON)) at.classList.add(LANDED_ON)
  })
  watch.observe(at, { attributes: true, attributeFilter: ['class'] })
  const stop = (): void => watch.disconnect()
  stopKeeping = stop
  return stop
}

/**
 * EVERY CLOSED FOLD FROM THIS ELEMENT ITSELF TO THE TOP OF THE PAGE, outermost last.
 *
 * A `<details>` is read by its tag and its `open` property rather than by a class, because the
 * class is one page's styling and the behaviour belongs to the element. Nothing else on the page
 * hides a part the way a closed fold does: the words are in the document, they have an element,
 * they have a rect, and none of it is on the screen.
 *
 * THE WALK STARTS AT THE ELEMENT, NOT AT ITS PARENT, because a declared section is drawn ON its
 * `<details>` rather than inside it. `section.links` is that case: the element this press lands on
 * is the shut fold itself, so a walk that begins at the parent never sees it and the press leaves
 * the links folded while saying it is showing them.
 */
function foldsAbove(at: Element): Element[] {
  const shut: Element[] = []
  let up: Element | null = at
  while (up !== null) {
    if (up.tagName === 'DETAILS' && (up as HTMLDetailsElement).open !== true) shut.push(up)
    up = up.parentElement ?? null
  }
  return shut
}

/**
 * WHAT THE READER CAN SEE OF THIS ELEMENT, NOW. Looked at, in this order, because each answer rules
 * out the ones after it.
 *
 * `gone`         the element is not in the document any more. The page redrew while the press was
 *                on its way, and nothing is lit because there is nothing to light.
 * `insideAFold`  a closed fold is still above it. Its rect is zero and its words are unreachable,
 *                and this is the state that was being reported as shown.
 * `offScreen`    it has a place on the page and that place is outside the window.
 * `onTheScreen`  its rect overlaps the window. The reader is looking at it.
 */
function showingNow(at: Element): Showing {
  if (at.isConnected !== true) return 'gone'
  if (foldsAbove(at).length > 0) return 'insideAFold'
  // THE SAME ARITHMETIC THE WAIT USED TO DECIDE THE SCROLL HAD ARRIVED, asked of the one function
  // that does it. Two copies would let the wait finish somewhere this sentence calls off the screen.
  return onTheScreenNow(at) ? 'onTheScreen' : 'offScreen'
}

/**
 * WHETHER THIS ELEMENT'S BOX OVERLAPS THE WINDOW AT ALL, right now.
 *
 * One reader, asked by `showingNow` for its answer and by `whenTheScrollHasStopped` for the second
 * half of its arrival test. A second copy of this arithmetic would let the wait decide the scroll
 * had arrived somewhere the sentence then called off the screen.
 */
function onTheScreenNow(at: Element): boolean {
  const box = at.getBoundingClientRect()
  if (box.width === 0 && box.height === 0) return false
  if (box.bottom <= 0 || box.top >= window.innerHeight) return false
  if (box.right <= 0 || box.left >= window.innerWidth) return false
  return true
}

/**
 * CALL BACK AT THE FIRST MOMENT THIS ELEMENT HAS STOPPED MOVING SOMEWHERE THE READER CAN SEE IT,
 * or at the deadline.
 *
 * See `SCROLL_SETTLES_IN_MS` for why the moment is chosen this way rather than taken at once, and
 * for the 19 presses out of 488 that the old test answered wrongly about.
 */
function whenTheScrollHasStopped(at: Element, then: () => void): void {
  const started = Date.now()
  let was: number | null = null
  const again = (): void => {
    const now = at.getBoundingClientRect().top
    // ARRIVED, OR OUT OF TIME. Both halves are needed: `now === was` alone is also true of a scroll
    // that has not begun, and `onTheScreenNow` alone is true of a part the page is still sliding
    // past. An element that has left the document has no box worth waiting for, so that answer is
    // taken at once and `showingNow` is what names it.
    const settled = now === was && onTheScreenNow(at)
    if (settled || at.isConnected !== true || Date.now() - started >= SCROLL_SETTLES_IN_MS) {
      then()
      return
    }
    was = now
    window.setTimeout(again, SCROLL_SAMPLE_MS)
  }
  window.setTimeout(again, SCROLL_SAMPLE_MS)
}

/**
 * WHAT READING LENGTH THE REPORT ON THIS PAGE IS DRAWN AT, LOOKED AT RATHER THAN ASSUMED, or null
 * because nothing on this page says.
 *
 * ---------------------------------------------------------------------------------------
 * THE EIGHTH DOOR: THE SENTENCE ASSERTED A STATE OF THE SCREEN IT NEVER LOOKED AT
 * ---------------------------------------------------------------------------------------
 *
 * `viewTheOriginal` writes the reading length with `setDetailHere` and every landed sentence used
 * to end *"with the whole report drawn."* Nothing looked. Measured on 1 September 2026 with
 * `sessionStorage` writes refused: the report body was 4,525 characters before the press AND 4,525
 * after it — Full is 30,297 — 34 of 141 regions were on the page, no preset was drawn as chosen,
 * and the composer said the whole report was drawn. At the card level it called `section.summary`
 * absent while sitting at 8,647 of 30,297. The whole rewrite of this file made the sentence follow
 * the looking for WHICH ELEMENT and WHETHER YOU CAN SEE IT. This one fact was still asserted.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS THE DRAWING, NOT THE SETTING IT JUST WROTE
 * ---------------------------------------------------------------------------------------
 *
 * The stored choice is what the press ASKED for; the attribute the drawing writes is what the page
 * DID. Reading the setting back would only prove storage kept it, which is the wrong question — a
 * locked-down browser that refuses the write and a React tree that has not redrawn yet leave the
 * reader looking at exactly the same screen.
 *
 * WHICH ELEMENT IS ASKED, AND WHY IT IS ONE INSIDE THE REPORT BODY. `readingLengthAbove` walks up
 * from an element to the nearest drawing that declares a length. A landing on a section panel — the
 * links fold, the shorter forms — is outside the report's own drawing and has no length above it,
 * which is why the element asked is the first part of the record's BODY the page is drawing rather
 * than the element the press landed on. Null when the page draws no part of the body at all, and
 * null is a real answer: nothing is claimed about the length then.
 */
function theReportsLengthNow(recordId: string): { length: Rung } | { problem: string } | null {
  const here = regionsDrawnOnHere(recordId)
  if (here === null) return null
  const body = `data.${here.report.blocksField}`
  for (const [id, at] of here.drawn) {
    if (id !== body && !id.startsWith(`${body}[`)) continue
    return readingLengthAbove(at)
  }
  return null
}

/**
 * WHAT THE PRESS LEFT DRAWN, IN A SENTENCE, or the empty string because nothing here can say.
 *
 * ONE KEY PER SENTENCE, NEVER TWO HALVES JOINED, for the reason `saysOf` gives. The caller joins
 * two whole sentences with the word list's own join, which is not the same thing.
 *
 * THE REFUSED WRITE IS NAMED WHERE IT HAPPENED. `setDetailHere` answers whether the browser kept
 * the choice, so a report still drawn short can say WHY it is short instead of leaving a reader to
 * guess between a browser that would not remember and a report that was already at that length.
 *
 * Exported so a test can read each sentence in the page language without a browser.
 */
export function aboutTheLength(drawnAt: { length: Rung } | { problem: string } | null, kept: boolean): string {
  if (drawnAt === null) return ''
  if ('problem' in drawnAt) return drawnAt.problem
  if (drawnAt.length === 'full') return t('agentWords.original.wholeDrawn')
  // THE NAME THE CONTROL DRAWS, NOT THE LENGTH'S NOUN. This read `RUNG_SPECS[…].noun` and printed
  // *the report is still drawn at report's outline* — the stored noun of a length used as if it
  // were the name of a position. The word list's level names are `levelLabel`'s own words in
  // English, so this sentence and the control a reader would press use one word in each language.
  const length = t(`settingsPanel.detail.level.${drawnAt.length}`)
  return t(kept ? 'agentWords.original.stillShort' : 'agentWords.original.notKept', { length })
}

/**
 * THE SENTENCE, WHICH IS THE LOOKING AND NOT THE INTENTION.
 *
 * `whenShown` is what the press meant to say and is said only where the looking agreed with it.
 * The other three are one literal each, whichever of the four places the press landed on, because
 * what a reader needs then is not where it landed but why they cannot see it.
 *
 * ONE KEY PER SENTENCE AND NEVER TWO HALVES JOINED. Each sentence is one entry of the word lists,
 * because a language with another word order cannot be built out of English halves. The part's
 * name is the record's own words and is passed in as content. Exported so a test can read each
 * sentence in the page language without a browser.
 */
export function saysOf(showing: Showing, whenShown: string, name: string, alsoDrawn: string): string {
  // WHAT THE PRESS LEFT DRAWN IS A SECOND SENTENCE AND IS SAID ONLY WHERE THE FIRST ONE IS. The
  // three below are about why the reader cannot see the part at all, and how much of the report is
  // drawn is not what they need then.
  if (showing === 'onTheScreen') {
    return alsoDrawn === '' ? whenShown : t('agentWords.twoSentences', { first: whenShown, second: alsoDrawn })
  }
  if (showing === 'gone') return t('agentWords.original.gone', { name: content(name) })
  // THE NAME IS THE FIRST WORD OF THESE TWO IN ENGLISH, so these two are where it takes a capital
  // and the one above is not. The capital belongs to the sentence and never to the name.
  const first = content(toStartASentence(name))
  if (showing === 'insideAFold') return t('agentWords.original.insideAFold', { name: first })
  return t('agentWords.original.offScreen', { name: first })
}

/**
 * WHAT A PRESS SAYS WHEN IT LANDS ON WHAT HOLDS THE PART, OR ON A PIECE OF IT. Both names are the
 * record's own parts, named by `namesOfParts`, and are passed in as content. Exported so a test can
 * read both sentences in the page language without a browser.
 */
export function insteadSays(landing: 'whatHoldsIt' | 'aPartOfIt', part: string, instead: string): string {
  return landing === 'whatHoldsIt'
    ? t('agentWords.original.holder', { part: content(part), holder: content(instead) })
    : t('agentWords.original.piece', { part: content(part), piece: content(instead) })
}

/**
 * WHAT A PRESS SAYS WHEN THIS PAGE DRAWS NONE OF THE PARTS, NOTHING THAT HOLDS THEM AND NO PIECE OF
 * THEM. One part is named; more than one are counted as "none of the parts". Exported so a test can
 * read both sentences in the page language without a browser.
 */
export function nowhereSays(names: readonly string[]): string {
  const [only] = names
  if (names.length === 1 && only !== undefined) {
    return t('agentWords.original.nowhereOne', { name: content(toStartASentence(only)) })
  }
  return t('agentWords.original.nowhereMany')
}

/**
 * A NAME AT THE START OF A SENTENCE STARTS WITH A CAPITAL. The names are the reader's own words for
 * the parts — "the body of the report", "the section “Links”" — and they are written to sit in the
 * middle of a sentence, so one used as the first word read "the body of the report … is not drawn".
 * One literal, one capital, and the name itself is never rewritten anywhere else.
 */
function toStartASentence(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * TAKE THE READER TO THE FIRST PART THIS PROJECTION STANDS FOR.
 *
 * `parts` is the recorded list, in the order it was recorded, and the FIRST one that this page is
 * drawing is where the reader lands. Landing on all of them at once is not a place; landing on the
 * first is, and the panel names all of them beside the control so nothing is hidden by the choice.
 *
 * `onDone` is called with what happened, because the surface that drew the control is the one with
 * somewhere to print a sentence. It is called ONCE, and after the looking rather than before it.
 */
export function viewTheOriginal(
  recordId: string,
  parts: readonly { regionId: string; name: string; stillThere: boolean }[],
  onDone: (landed: Landed) => void,
): void {
  const here = parts.filter((one) => one.stillThere)
  if (here.length === 0) {
    onDone({
      landing: 'nowhere',
      showing: 'noPlace',
      says: t('agentWords.original.noneLeft'),
    })
    return
  }
  unlight()
  // THE WHOLE REPORT, BECAUSE THE PARTS ARE WHAT A SHORTER LENGTH LEAVES OUT. Written through the
  // one function that writes that choice, so the control on the report agrees with it immediately.
  //
  // AND WHETHER IT TOOK IS KEPT, because a browser that refuses `sessionStorage` — Safari in
  // private browsing, some locked-down profiles — takes this write and drops it. It is not the
  // answer to "is the whole report drawn"; `theReportsLengthNow` is, and it is asked after the
  // page has settled. This is what lets the sentence say WHY a report that is still short is short.
  const kept = setDetailHere('reportContent', 'full')

  const started = Date.now()
  /**
   * Take the page there, open whatever is shut over it, light it, and then LOOK. The sentence for
   * a landing that worked is the caller's, because only it knows which of the four this is; the
   * sentence for one that did not is this function's, because only it did the looking.
   */
  const goTo = (at: Element, landing: Landing, whenShown: string, name: string): void => {
    // OPEN THE FOLD BEFORE SCROLLING, in that order: a shut fold has no height, so the place the
    // page would scroll to is not the place the words end up.
    for (const fold of foldsAbove(at)) (fold as HTMLDetailsElement).open = true
    at.scrollIntoView({ block: 'start', behavior: behaviorForJump() })
    if (typeof HTMLElement !== 'undefined' && at instanceof HTMLElement) washJumpTarget(at)
    at.classList.add(LANDED_ON)
    // AND IT STAYS LIT WHILE THE PAGE REDRAWS UNDER IT, UNTIL THE FOUR SECONDS ARE UP OR THE NEXT
    // PRESS PUTS IT OUT — `unlight` is the one place either happens. See `keepLit`.
    //
    // THE TIMER PUTS OUT ITS OWN LIGHT AND NEVER SOMEBODY ELSE'S. Presses come closer together than
    // four seconds, so this timer routinely comes due while a LATER press is being shown, and
    // `unlight` puts out whatever is lit. Measured over 488 presses on OOOt4Kouc5dT: with this
    // timer calling `unlight` unconditionally, 279 of them said "Showing" with nothing lit on the
    // page at all. Comparing the keeper is what says "the light burning now is still mine".
    const mine = keepLit(at)
    window.setTimeout(() => {
      if (stopKeeping === mine) unlight()
    }, LIT_FOR_MS)
    whenTheScrollHasStopped(at, () => {
      const showing = showingNow(at)
      // AND WHAT IS DRAWN IS READ HERE, AFTER THE PAGE HAS SETTLED, and never before. The press
      // asked for the whole report at the top of this function; this is the looking that says
      // whether it got it. See `theReportsLengthNow`.
      const says = saysOf(showing, whenShown, name, aboutTheLength(theReportsLengthNow(recordId), kept))
      onDone({ landing, showing, says })
    })
  }
  const look = (): void => {
    const waiting = Date.now() - started < WAIT_FOR_MS
    // THE FIRST RECORDED PART IS THE ONE TO LAND ON, AND IT IS WORTH WAITING FOR. Putting the
    // reading length to Full re-renders the report, and the parts appear in the order React draws
    // them — so taking whichever is on the page at the first tick lands on whichever happened to
    // render first, which is not a decision anybody made. Measured on 1 September 2026: a press
    // whose first recorded part was a table landed on the section recorded after it, because the
    // section was already on the page at the shorter length and the table was still arriving.
    //
    // AFTER THE WAIT, ANY OF THEM WILL DO, because by then a part that is not drawn is a part this
    // page is not going to draw, and landing on a later one beats landing nowhere.
    for (const part of waiting ? here.slice(0, 1) : here) {
      const at = elementFor(recordId, part.regionId)
      if (at === null) continue
      goTo(at, 'thePart', t('agentWords.original.showing', { name: content(part.name) }), part.name)
      return
    }
    if (waiting) {
      window.setTimeout(look, 60)
      return
    }
    // NO ELEMENT IS THE PART. THAT IS NOT THE SAME AS THE PART BEING ABSENT, and the difference is
    // most of this report: a stored table row, a cell, a list item is drawn INSIDE its table or its
    // list and has no address of its own, and the body of the report is drawn as the blocks that
    // make it up and has no address of its own either. Either way the reader is looking straight at
    // words this press used to call missing. Land on what the page does draw and name what it is.
    for (const part of here) {
      const instead = insteadOf(recordId, part.regionId)
      if (instead === null) continue
      goTo(instead.at, instead.landing, insteadSays(instead.landing, part.name, instead.name), part.name)
      return
    }
    // THE DEADLINE AND THE TWO WALKS TOGETHER ARE WHAT MAKE "IT IS NOT ON THIS PAGE" SAYABLE.
    // Without them a press that found nothing would look exactly like a press that had not
    // happened, and saying it without the walks said it about parts that were on the screen.
    onDone({ landing: 'nowhere', showing: 'noPlace', says: nowhereSays(here.map((one) => one.name)) })
  }
  // ONE TURN LATER, so the reading length written above has been drawn before the first look.
  window.setTimeout(look, 0)
}
