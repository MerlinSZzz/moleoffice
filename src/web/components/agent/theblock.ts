// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH ELEMENT ON THIS PAGE IS THE BLOCK A COMMENT IS ABOUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ITS OWN MODULE
 * ---------------------------------------------------------------------------------------
 *
 * Two components draw something beside a commented block: the circle carrying the count
 * (`CommentCircle.tsx`) and the card holding an agent's words (`AgentSaidHere.tsx`). They have to
 * choose the same element, or the circle points at one thing and the card hangs under another.
 * Working it out twice is the defect CLAUDE.md names at the top of the file: the same fact in two
 * places, free to disagree, with nothing failing when they do. So it is worked out once, here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT SIMPLY THE ELEMENT CARRYING THE KEY
 * ---------------------------------------------------------------------------------------
 *
 * A page does not draw an element for every thing that can be pointed at. A whole block of a report
 * is a thing an agent may name, and what the page draws is the block's heading and its text, each
 * as its own region inside it. So the search falls back to everything drawn inside the thing, and
 * the element wanted is the one that holds all of them — which is the block.
 *
 * AND IT IS NEVER AN INLINE ELEMENT. A passage of words is drawn as a `span`, and a span's box is
 * the shape of the text rather than the shape of a block: its right edge is wherever the passage
 * happens to end, which is usually the middle of a line of prose. The first element above it that
 * lays its children out in lines of its own is the block, and that is the paragraph.
 */

import { TARGET_ATTRIBUTE } from '@shared/targets.ts'
import { thePageScroller } from '../../lib/page-scroll.ts'

/** A `data-target` value, safe to put inside a quoted CSS attribute selector. */
export function quotedKey(key: string): string {
  // Every part of a key is percent-encoded already, so neither character appears today; escaping
  // them is what keeps that true if the encoding ever changes.
  return key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** The innermost element that holds every one of these. */
function holderOf(elements: readonly Element[]): HTMLElement | null {
  const first = elements[0]
  if (first === undefined) return null
  let node: HTMLElement | null = first instanceof HTMLElement ? first : first.parentElement
  for (;;) {
    if (node === null) return null
    const here = node
    if (elements.every((one) => here.contains(one))) return here
    node = node.parentElement
  }
}

/**
 * The block this key is drawn on, or null when this page draws nothing for it.
 *
 * THE SHELL IS NOT A BLOCK. The whole window carries the page's own key, so a comment about the page
 * as a whole would put a circle in the top-right corner of the window, pointing at nothing a reader
 * can look at, and anything drawn as part of the shell would move the rail (section 3.2 of the
 * interaction contract).
 *
 * SO A COMMENT ABOUT THE PAGE IS DRAWN BESIDE THE PAGE'S OWN HEADING (problem 2ubMhLXPKUtx). Until
 * 30 September 2026 this answered null for the shell, and a comment left on a page was stored with
 * nothing on the page saying so. The contract had put that count in the review strip, and the strip
 * was removed (problem Wa-23qH_zbPx). The heading is the page saying what it
 * is, at the top where a reader arrives, which is the reason `theRecordsOwnHead` below gives for a
 * comment on a whole record. A page that draws no heading gets no circle, as before.
 */
export function theBlockDrawnFor(key: string): HTMLElement | null {
  const itself = document.querySelector(`[${TARGET_ATTRIBUTE}="${quotedKey(key)}"]`)
  const found = itself !== null ? [itself] : [...document.querySelectorAll(`[${TARGET_ATTRIBUTE}^="${quotedKey(key)}"]`)]
  if (found.length === 0) return null
  let node = holderOf(found)
  while (node !== null && window.getComputedStyle(node).display.startsWith('inline')) node = node.parentElement
  if (node !== null && node.classList.contains('shell')) node = thePagesOwnHeading(node)
  const head = node === null ? null : theRecordsOwnHead(node)
  if (head !== null) node = head
  if (node !== null && (notRendered(node) || clippedAway(node))) return null
  return node
}

/**
 * TRUE FOR AN ELEMENT THE BROWSER DOES NOT DRAW, THOUGH IT HAS A BOX: the rows inside a closed `<details>`.
 *
 * Chrome lays out a closed fold's content and skips only its drawing (`content-visibility: hidden` on the
 * fold's content), so `getBoundingClientRect` answers a real box for a row nobody can see, at the place it
 * would have if the fold were open. The circle's own guard, "a block with no box is not drawn", assumed a
 * closed fold left no box, and that is not so.
 *
 * MEASURED ON 9 OCTOBER 2026, round 19 of wave 13w, on a made-up office with answers of the owner's size:
 * Developer-mode Home mounted about 30,000 rows inside its closed question folds. One of them carried a
 * comment, and its circle was placed 24,720,824 pixels down the document, so Home's scroll ran on that far
 * past its 8,561 pixels of content: the blank space at the bottom of Home the owner reported.
 * tests/home-ends-where-its-content-ends.test.ts holds it.
 */
function notRendered(node: HTMLElement): boolean {
  return !node.checkVisibility()
}

/** The first heading of the page the shell holds, or null when the page draws none. */
function thePagesOwnHeading(shell: HTMLElement): HTMLElement | null {
  const heading = shell.querySelector('#main h1')
  return heading instanceof HTMLElement ? heading : null
}

/**
 * THE BOX A MARK FOR THIS KEY SITS BESIDE: the block's own box, except for the page itself.
 *
 * For the page itself the block is its heading, and a heading is as wide as the row it is in, so a
 * circle at its right edge sat on whatever the page draws at the end of that row. Measured at 1440
 * on the records page, 30 September 2026: it covered the first letter of New record. So the box is
 * the heading's words, and the circle sits just after them.
 */
export function theBoxToSitBeside(key: string, block: HTMLElement): DOMRect {
  const shell = document.querySelector('.shell')
  if (shell === null || shell.getAttribute(TARGET_ATTRIBUTE) !== key) return block.getBoundingClientRect()
  const words = document.createRange()
  words.selectNodeContents(block)
  const box = words.getBoundingClientRect()
  return box.width === 0 && box.height === 0 ? block.getBoundingClientRect() : box
}

/** The class the record page's own head carries, and the class of the page it heads. */
const A_RECORD_PAGE = 'rp'
const A_RECORD_PAGES_HEAD = 'rp-head'

/**
 * THE RECORD PAGE'S HEAD, WHEN THE BLOCK FOUND WAS THE WHOLE PAGE — CRITERION D30.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A comment addressed to the record itself rather than to one block of it — a message whose target
 * names the record and whose place is the page's surface — is drawn on the element carrying the
 * record's key, and on a record page that element is the whole article. So the count went to the top
 * of the page and the agent's card went under the article, which is the bottom of it.
 *
 * The agent's comment was at the very bottom of the whole module, and only the dashed selection box
 * showed that one had been sent at all. It belonged beside the comment's count.
 *
 * Measured on one of the owner's own pipelines, on its record page, on an isolated copy of the owner's
 * database, with the note
 * left on it (message XOXK16BCpR5Q):
 *
 *   - at 1440 the count sat at y=0 and the card at y=2622. Two thousand six hundred and twenty-two
 *     pixels apart, and the page was given a 229-pixel bottom margin to make room for the card.
 *   - at 390 the count sat at y=67 and the card at y=5135.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HEAD AND NOT THE WHOLE PAGE
 * ---------------------------------------------------------------------------------------
 *
 * The head is the record saying what it is: its name, its kind and its state. A comment about the
 * whole record is about that, so the mark belongs there — and a block at the TOP of the page puts
 * the count and the card together where a reader arrives, instead of a page apart.
 *
 * ONE ANSWER, SO THE COUNT AND THE CARD CANNOT DISAGREE. Both ask this function, which is the whole
 * reason this module exists.
 */
function theRecordsOwnHead(node: HTMLElement): HTMLElement | null {
  if (!node.classList.contains(A_RECORD_PAGE)) return null
  const head = node.querySelector(`:scope > .${A_RECORD_PAGES_HEAD}`)
  return head instanceof HTMLElement ? head : null
}

/**
 * TRUE WHEN THIS BLOCK IS THE HEAD STANDING FOR A WHOLE RECORD.
 *
 * The card that hangs under a block is drawn at the block's left edge, because a block of a report
 * is as wide as the page and its words start there. The head stands for the WHOLE record, and the
 * count for it sits at the head's top-right corner — so the card goes under that corner instead, and
 * the reader finds the words beside the number they pressed.
 */
export function isTheRecordsOwnHead(block: HTMLElement): boolean {
  return block.classList.contains(A_RECORD_PAGES_HEAD)
}

/**
 * TRUE WHEN THIS PAGE HAS CUT THE WHOLE OF THIS ELEMENT AWAY — CRITERION D27.
 *
 * ---------------------------------------------------------------------------------------
 * THE BLANK AREA UNDER THE PAGE, MEASURED
 * ---------------------------------------------------------------------------------------
 * After scrolling to the bottom, the page went on scrolling into a large blank area, and the two
 * sidebars and the middle all moved up with it.
 *
 * MEASURED ON THE OWNER'S OWN PIPELINE, on an isolated copy of the owner's database. With a comment on
 * the ZED 2i card, `document.documentElement.scrollHeight` and the height of `.shell` were both
 * 1521, and the comment's circle sat at 619. The drawing was then panned down by 900 — an ordinary
 * thing to do to a drawing wider than the window. The card's box went with it, out of the bottom of
 * `.gx-canvas`, which is `overflow: hidden`; the circle is placed from that box in the DOCUMENT's
 * own coordinates, so it was written at 1519 to 1547 — twenty-six pixels below the whole page.
 * `scrollHeight` became 1547 while `.shell` stayed 1521. At the bottom of that scroll the rail's
 * own sticky box read `top: -26`: the sidebars had slid off the top by exactly the overflow, which
 * is the second half of what was described.
 *
 * The circle and the agent's card are the only two things this page draws at document coordinates,
 * and both ask this function which element they are about. So one answer here fixes both, and there
 * is nothing to keep in step.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE SAME RULE THE CIRCLE ALREADY HAD, ONE STEP FURTHER
 * ---------------------------------------------------------------------------------------
 *
 * `CommentCircle` already refuses an element with no box at all: *A circle at the top-left corner
 * of the document would be a mark pointing at nothing, which is worse than no mark.* An element its
 * own page has clipped entirely away is the same thing with a box — a reader cannot see it either.
 * The mark is not lost: it comes back the moment the drawing is panned back, because the element
 * comes back with it.
 */
function clippedAway(node: HTMLElement): boolean {
  const box = node.getBoundingClientRect()
  if (box.width === 0 && box.height === 0) return false
  const page = thePageScroller()
  for (let up = node.parentElement; up !== null; up = up.parentElement) {
    const style = window.getComputedStyle(up)
    // `visible` IS THE ONLY VALUE THAT CLIPS NOTHING. The document's own scroller is `visible`, so
    // an element below the fold of an ordinary long page is not clipped by anything and keeps its
    // mark, which is what a reader scrolling down to it expects.
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
    // NOR DOES THE BOX A PAGE SCROLLS IN, a report's on a wide window (src/web/lib/page-scroll.ts). It scrolls the
    // page as the document's own scroller does, so an element below its fold is scrolled to and not clipped away.
    if (up === page) continue
    const edge = up.getBoundingClientRect()
    if (edge.width === 0 && edge.height === 0) continue
    const meets =
      box.right > edge.left && box.left < edge.right && box.bottom > edge.top && box.top < edge.bottom
    if (!meets) return true
  }
  return false
}
