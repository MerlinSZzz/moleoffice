// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMMENTS ON A BLOCK, DRAWN AS ONE CIRCLE BESIDE IT, NEVER INSIDE ITS WORDS, EXCEPT ON A LANES CARD.
 *
 * A card on the lanes drawing is the one block the circle is drawn inside, in the card's own top-right corner. The
 * lanes drawing's cards stand close together, so the margin beside one card is the next card. A circle put there
 * covered the next card's step number and read as a comment on the wrong step.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS REPLACED
 * ---------------------------------------------------------------------------------------
 *
 * The count used to be generated content: `content: "❝ 1"` in a `::before` on the element carrying
 * the block's key. A `::before` on a paragraph is that paragraph's first inline box, so on a record
 * page the number was drawn at the start of the summary's own prose. One comment left on
 * a decision page put its number into the text, where it read as part of the prose.
 *
 * A floating circle carrying the number of comments, and nothing put into the article. Problem
 * `muxtJ4V4HfUj`. Section 8.3 of `design/ROUND-NINE-INTERACTION-CONTRACT.md` was changed to say so
 * before this was built, and it keeps the old wording quoted.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE CIRCLE GOES
 * ---------------------------------------------------------------------------------------
 *
 * In the margin at the block's right edge where there is room for it, and above the block's top-right
 * corner where there is not, in room the block is given for it. `whereTheCircleGoes` measures the room; `THE_MARGIN_WANTED`
 * is how much counts as room. A page at 1440 leaves about a hundred pixels of margin beside a
 * record's summary, and a page at 390 leaves none, so both branches are ordinary rather than one
 * being a fallback.
 *
 * INSIDE THE CARD'S OWN TOP-RIGHT CORNER WHEN THE BLOCK IS A CARD ON THE LANES DRAWING, at any width. Such a card is
 * a block that itself carries the card position attribute (`CARD_RUNG_ATTRIBUTE` in src/web/lib/drawnat.ts) and is
 * inside the lanes drawing (`LANES_DRAWING`). A block inside a card, such as one part of a card, does not carry the
 * attribute, so it keeps the two places above. A graph card and a plan card carry it too, and they keep the two
 * places above, as every other block does: their state mark is drawn in that corner, and it can be the only sign of
 * the card's state. The drawing's layout does not change for the circle: no card grows and nothing is laid out
 * again. So the circle covers the right end of the lanes card's first line, and the card's chip under that line
 * says the card's state in words.
 *
 * IT IS MEASURED IN THE DOCUMENT'S OWN COORDINATES, so the circle stays with the block while the
 * page scrolls and nothing measures again. On a page that scrolls in its own box it is drawn in that
 * box instead, in the box's coordinates, for the same reason (`theLayerFor` in
 * src/web/lib/page-scroll.ts). That is the same choice `AgentSaidHere` makes for the card, and both
 * ask `theBlockDrawnFor` which element the block is, so the circle and the card cannot end up
 * pointing at two different things.
 *
 * IT IS NEVER DRAWN PAST THE WINDOW'S RIGHT EDGE, NOT EVEN BEFORE IT IS MEASURED AGAIN. A measurement
 * comes on the next animation frame after the page changes, and on a busy machine that frame is late.
 * Until it comes, the circle keeps its last place in pixels. On the organising page narrowed from 1440
 * to 390, a circle kept its right edge at 1076, and the page scrolled sideways until the measurement
 * came (wave 13y round 123). So the circle's left edge is drawn at its measured place or at
 * `THE_FURTHEST_RIGHT`, whichever is further left. The browser works that limit out itself as the
 * window narrows, with no measurement. A measurement keeps the circle inside its column, so while the
 * column fits the window, a measured place is never further right than the limit and the limit moves
 * nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PRESS DOES
 * ---------------------------------------------------------------------------------------
 *
 * It opens the comments that are already there rather than making a new surface for them.
 * `showMeThat` takes the page to the comment's place and lights the words it quoted — the same
 * function the review pane's own "take me to it" calls. Where an agent spoke first, `AgentSaidHere`
 * has already drawn its card beside this block, and that press brings it into view. Where nobody
 * has, there is no card, and a person's own comments are read in the review column, so the press
 * opens the column as well.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Context } from '@shared/targets.ts'
import { openCommentsOn } from '../../lib/review.ts'
import { theBlockDrawnFor, theBoxToSitBeside } from './theblock.ts'
import { SIDE_BY_SIDE } from '../SideBySide.tsx'
import { theLayerFor, thePageScroller } from '../../lib/page-scroll.ts'
import { CARD_RUNG_ATTRIBUTE } from '../../lib/drawnat.ts'

/**
 * What one circle draws and what its press opens.
 *
 * `count` and `name` are worked out by the mark layer, from the one reading of what each object
 * holds. Nothing here counts anything: a second count would be the same fact in two places.
 */
export interface CircleToDraw {
  key: string
  /**
   * THE NUMBER DRAWN: what has not gone when anything here is unsent, and otherwise the sent comments when the person
   * has chosen to show their marks. A place holding both draws only its unsent count.
   */
  count: number
  /**
   * HOW MANY HAVE NOT GONE, counting one somebody has started and not sent. The mark draws this as a solid,
   * heavier circle and a sent-only mark as a dashed, quieter one, so a half-written comment cannot look like one that
   * has already gone.
   */
  unsent: number
  /** What the button is called: how many have not gone, or how many sent ones are shown, and which thing they are on. */
  name: string
  /** The comment a press goes to, or null where the only thing here is an unsent draft. */
  opensAt: { context: Context; annotationId: string } | null
}

/** Where one circle sits, in the document's own coordinates, and whether its block was given room above it. */
interface Where {
  top: number
  left: number
  above: boolean
}

/** Where one circle sits, and what it is drawn in: the page's own box, or the document when that is null. */
interface Placed extends Where {
  layer: HTMLElement | null
}

/**
 * THE MARK ON A BLOCK THAT HAS NO MARGIN BESIDE IT: the block is given room above itself, and the circle sits
 * in that room. Problem E73Do6DbqZCH, item 9: at 390 the circle straddled a report table's top-right corner
 * and covered the words of its first row. Only the corner chat button may cover words, by point 4 of a
 * decision. So the block moves down instead.
 */
export const ROOM_ATTRIBUTE = 'data-comment-room'

/** The space left between the block, the circle and whatever is beside them. */
const GAP = 6

/**
 * THE ELEMENT EVERY CARD OF THE LANES DRAWING IS INSIDE. It is the class that
 * src/web/components/graph/lanes/LanesDrawing.tsx gives the lanes drawing's root. Case (b) of
 * tests/a-record-drawn-in-lanes-carries-its-target.test.ts fails if that class changes, because the circle on a
 * lanes card would go back to the margin.
 */
const LANES_DRAWING = '.lanes-drawing'

/**
 * How wide the circle is, in pixels, and it is the same number the stylesheet draws.
 *
 * The stylesheet is the one place that says how big the circle is, and this is a measurement of
 * what it drew rather than a second declaration of it: `sizeOfTheCircle` reads it off a circle that
 * is on the page, and falls back to this only for the FIRST measurement, when no circle has been
 * drawn yet to read. A number written twice would let a change to the stylesheet move the circle
 * without moving the room measured for it.
 */
const SIZE_BEFORE_ONE_IS_DRAWN = 28

/**
 * THE FURTHEST RIGHT A CIRCLE'S LEFT EDGE IS DRAWN: the width of what the circle is placed in, less the
 * circle and one gap. What it is placed in is the window, or the page's box when the page scrolls in one.
 * The circle's size is the stylesheet's own, so this cannot say a different size from the one drawn.
 */
const THE_FURTHEST_RIGHT = `calc(100% - var(--px-circle-size) - ${String(GAP)}px)`

/** How much clear space to the right of a block counts as a margin the circle can sit in. */
function marginWanted(size: number): number {
  return size + GAP * 2
}

/** The circle's own width, read off one that is drawn, or the starting guess before any is. */
function sizeOfTheCircle(): number {
  const drawn = document.querySelector('.px-comment-circle')
  if (drawn === null) return SIZE_BEFORE_ONE_IS_DRAWN
  const box = drawn.getBoundingClientRect()
  return box.width === 0 ? SIZE_BEFORE_ONE_IS_DRAWN : box.width
}

/**
 * THE RIGHT EDGE OF THE COLUMN THIS BLOCK IS IN, which is what says whether there is a margin.
 *
 * Not the window's right edge. With the review column open the page is narrower than the window,
 * and the space to the right of the page is the column: a circle put there would sit on somebody
 * else's surface and move when that surface opened. The page's own box is the honest edge, and
 * `main.page` is the element every route's content is drawn in.
 *
 * AND NOT THE PAGE'S RIGHT EDGE EITHER, WHEN THE PAGE SETS TWO COLUMNS SIDE BY SIDE (SideBySide.tsx)
 * and the block is in the first. The space to the right of that block holds the second column. On
 * Home at 1440 the circle was put in the narrow gap between the two, and covered the first characters
 * of the second column's note. So the first column's own box is the edge, and the circle goes above
 * the block's corner when the gap is too narrow for it. The columns stand side by side when the
 * second one starts to the right of the first; stacked, or with an empty second column, they do not.
 * Nor do they when the first column draws no box of its own (display: contents, as the Decisions
 * page's does on a narrow screen). Its right edge then reads as 0, and the circle went left of the window.
 */
function theColumnsRightEdge(block: HTMLElement): number {
  const first = block.closest(`.${SIDE_BY_SIDE} > [data-column="start"]`)
  const second = first?.parentElement?.querySelector(':scope > [data-column="end"]')
  const firstBox = first?.getBoundingClientRect()
  if (firstBox && firstBox.width > 0 && second && second.getBoundingClientRect().left >= firstBox.right) {
    return firstBox.right
  }
  const column = block.closest('main.page') ?? block.closest('.shell-main') ?? document.body
  const box = column.getBoundingClientRect()
  // A PAGE THAT SCROLLS IN ITS OWN BOX HAS ITS SCROLLBAR INSIDE THAT EDGE, and a circle is not drawn on the bar.
  return column === thePageScroller() ? box.left + column.clientLeft + column.clientWidth : box.right
}

/**
 * Where the circle for this block goes. It goes inside the top-right corner of a card on the lanes drawing, in the
 * margin at the block's right edge, or above the block's top-right corner.
 *
 * Exported so a test can put a rectangle in and read the placement out, without a page.
 */
export function whereTheCircleGoes(
  block: { top: number; right: number },
  columnRight: number,
  size: number,
  scroll: { x: number; y: number },
  onALanesCard: boolean,
): Where {
  // INSIDE A LANES CARD, IN ITS OWN TOP-RIGHT CORNER. The lanes drawing's cards stand close together, so the margin
  // beside one card is the next card. So the circle goes in the card's own corner. The drawing's layout does not
  // change for it, so the circle covers the right end of the card's own first line, and the card's chip under that
  // line says its state in words. A graph card and a plan card keep the two places below: their state mark is drawn
  // in that corner, and it can be the only sign of the card's state. The left is the one the corner below uses, so
  // the circle is never put past the column's right edge. The card is given no room above it.
  if (onALanesCard) {
    return { top: block.top + GAP + scroll.y, left: Math.min(block.right, columnRight) - size - GAP + scroll.x, above: false }
  }
  const room = columnRight - block.right
  // IN THE MARGIN. The circle's left edge one gap clear of the block, its top level with the
  // block's, so a reader's eye runs along the first line of the block and finds it.
  if (room >= marginWanted(size)) {
    return { top: block.top + scroll.y, left: block.right + GAP + scroll.x, above: false }
  }
  // ABOVE THE CORNER. Its right edge one gap inside the block's, and all of it above the block's top
  // edge, one gap clear, in the room the block is given (ROOM_ATTRIBUTE). It used to straddle the
  // corner, half on the block, and on a table that half covered the first row's words.
  //
  // IT IS NEVER PUT PAST THE COLUMN'S RIGHT EDGE, and that is not tidiness. A circle centred on the
  // corner of a block that reaches the edge of the window makes the whole document scroll sideways:
  // measured at 660 and at 390 on 4 September 2026, `scrollWidth` came out 6 and 2 pixels wider
  // than `clientWidth`, so every page in the product grew a horizontal scrollbar the moment
  // somebody commented on a wide block.
  const inside = Math.min(block.right, columnRight) - size - GAP
  return { top: block.top - size - GAP + scroll.y, left: inside + scroll.x, above: true }
}

/**
 * GIVE ROOM ABOVE THESE BLOCKS AND TAKE IT BACK FROM EVERY OTHER. True when anything changed: the blocks have
 * moved, so the caller measures again on the next frame instead of placing circles on boxes that are gone.
 */
function giveRoom(blocks: ReadonlySet<HTMLElement>): boolean {
  let changed = false
  for (const had of document.querySelectorAll<HTMLElement>(`[${ROOM_ATTRIBUTE}]`)) {
    if (!blocks.has(had)) {
      had.removeAttribute(ROOM_ATTRIBUTE)
      changed = true
    }
  }
  for (const block of blocks) {
    if (!block.hasAttribute(ROOM_ATTRIBUTE)) {
      block.setAttribute(ROOM_ATTRIBUTE, 'above')
      changed = true
    }
  }
  return changed
}

/**
 * THE PAGE SAYS WHETHER ITS CIRCLES STAND WHERE THEY GO. The attribute on the `<html>` element is `waiting` while the
 * comments have not been read, `measuring` from the moment anything asks for a measurement until one finds every circle
 * where it already was, and `placed` after that. A test reads it to know the circles have stopped moving, rather than
 * waiting a fixed time that a slow redraw outlasts (wave 13t round 31). Nothing on the page draws from it.
 */
export const CIRCLES_ATTRIBUTE = 'data-comment-circles'

function say(state: 'waiting' | 'measuring' | 'placed'): void {
  document.documentElement.setAttribute(CIRCLES_ATTRIBUTE, state)
}

/** True when two measurements put every circle in the same place, drawn in the same thing. */
function samePlaces(a: Record<string, Placed>, b: Record<string, Placed>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => b[key]?.top === a[key]?.top && b[key]?.left === a[key]?.left && b[key]?.layer === a[key]?.layer)
}

export function CommentCircles({
  circles,
  read,
  showMe,
}: {
  circles: readonly CircleToDraw[]
  /** Whether the comments these circles count have been read. Until they are, the circles are not placed. */
  read: boolean
  /** What a press calls. Passed in so a test can press a circle and read what it asked for. */
  showMe: (request: { key: string; context: Context; annotationId: string }) => void
}) {
  /** Where each circle goes, measured from the page. Empty until the page has been measured. */
  const [places, setPlaces] = useState<Record<string, Placed>>({})
  /** The places last handed to React, so a measurement can tell whether it moved anything. */
  const placed = useRef(places)

  const measure = useCallback(() => {
    const next: Record<string, Placed> = {}
    const size = sizeOfTheCircle()
    const roomFor = new Set<HTMLElement>()
    for (const circle of circles) {
      const block = theBlockDrawnFor(circle.key)
      if (block === null) continue
      const box = theBoxToSitBeside(circle.key, block)
      // A BLOCK WITH NO BOX IS NOT DRAWN. It is inside a closed fold, or on a page that has
      // replaced it. A circle at the top-left corner of the document would be a mark pointing at
      // nothing, which is worse than no mark.
      if (box.width === 0 && box.height === 0) continue
      const { layer, x, y } = theLayerFor(block)
      // A LANES CARD IS A BLOCK THAT ITSELF CARRIES THE CARD POSITION, INSIDE THE LANES DRAWING. The attribute is read
      // on the block and not above it, so a block inside a card, such as one part of a card, keeps its place beside
      // that block. A graph card and a plan card carry the attribute too, and they are not inside the lanes drawing.
      const onALanesCard = block.hasAttribute(CARD_RUNG_ATTRIBUTE) && block.closest(LANES_DRAWING) !== null
      next[circle.key] = { ...whereTheCircleGoes(box, theColumnsRightEdge(block), size, { x, y }, onALanesCard), layer }
      if (next[circle.key]!.above) roomFor.add(block)
    }
    // THE ROOM IS GIVEN AND TAKEN BACK ONLY WHERE IT CHANGES. Writing an attribute is a change the watcher
    // below sees even when the value is the same, so an unconditional write would measure for ever.
    if (giveRoom(roomFor)) return
    // THE OLD OBJECT IS KEPT WHEN NOTHING MOVED, AND THAT IS NOT AN OPTIMISATION. Measuring makes a
    // new object every time; a new object is a new state, a new state is a render, a render changes
    // the page, and the watcher below fires on that and measures again. `AgentSaidHere` records the
    // same loop killing a page with "maximum update depth exceeded".
    if (!samePlaces(placed.current, next)) {
      placed.current = next
      setPlaces(next)
      return
    }
    say(read ? 'placed' : 'waiting')
  }, [circles, read])

  useEffect(() => {
    if (typeof document === 'undefined') return
    let asked = 0
    const soon = () => {
      say('measuring')
      if (asked !== 0) return
      asked = window.requestAnimationFrame(() => {
        asked = 0
        measure()
      })
    }
    soon()
    /**
     * MEASURED AGAIN WHENEVER THE DOCUMENT CHANGES, AND WATCHING THE SIZE IS NOT ENOUGH.
     *
     * This watched `document.body` for a resize and nothing else, and it drew no circle at all on
     * a list page. Measured on 4 September 2026 on the modules page with one comment waiting on a
     * row: nought circles, while the same comment drew one on the record's own page. Two things
     * have to be true for the first version to work and neither is: the marks would have to change
     * when the route does, so this effect runs again, and the body would have to change SIZE, so
     * the observer fires. A route change does neither — the same comments are waiting, and one list
     * is as tall as another.
     *
     * So the document itself is watched, the way the mark layer watches it for the same reason, and
     * the work is coalesced into one pass per frame so a page building itself row by row does not
     * measure once per row. Attributes are watched too, because a fold opening moves what is under
     * it and `open` is an attribute.
     *
     * IT CANNOT CHASE ITSELF. Placing a circle changes the document, which brings the observer back
     * here; the second measurement finds every circle where it already was, `samePlaces` keeps the
     * old object, React sees no new state, and nothing renders.
     */
    const watching = new MutationObserver(soon)
    watching.observe(document.body, { childList: true, subtree: true, attributes: true })
    const sized = new ResizeObserver(soon)
    sized.observe(document.body)
    window.addEventListener('resize', soon)
    return () => {
      giveRoom(new Set())
      document.documentElement.removeAttribute(CIRCLES_ATTRIBUTE)
      watching.disconnect()
      sized.disconnect()
      window.removeEventListener('resize', soon)
      if (asked !== 0) window.cancelAnimationFrame(asked)
    }
  }, [measure])

  if (circles.length === 0) return null

  return (
    <>
      <style href="mole-office-comment-circle" precedence="default">
        {CSS_RULES}
      </style>
      {circles.map((circle) => {
        const at = places[circle.key]
        if (at === undefined) return null
        const button = (
          <button
            key={circle.key}
            type="button"
            className="px-comment-circle"
            data-comments-on={circle.key}
            data-mark={circle.unsent > 0 ? 'unsent' : 'sent'}
            style={{ top: `${String(at.top)}px`, left: `min(${String(at.left)}px, ${THE_FURTHEST_RIGHT})` }}
            aria-label={circle.name}
            title={circle.name}
            onClick={() => {
              const opens = circle.opensAt
              if (opens !== null) showMe({ key: circle.key, context: opens.context, annotationId: opens.annotationId })
              /*
                AND THE COLUMN OPENS ON THE COMMENTS THIS CIRCLE COUNTED — CRITERION D30's second
                half: pressing the count shows the comment WITH THE OTHERS.

                IT USED TO OPEN THE LIST OF REVIEWS, and that is criterion D23. A comment is not a
                review, so the list could never show one: a press on a "1" on a card of a
                pipeline opened "Your reviews" with nothing in it, and the comment could not be seen.
                `openCommentsOn` draws what the number counted,
                including an instruction kept only in this browser — which is what that "1" was.

                IT USED TO BE SKIPPED WHERE AN AGENT'S CARD WAS ALREADY BESIDE THE BLOCK, on the
                ground that the press above brings that card into view. So a count of three on a
                block an agent had spoken on first opened one card and never named the other two.
                The count is a count of ALL of them, so the press answers for all of them.

                ON A PHONE THE COLUMN IS A BAND ABOVE THE PAGE, and the press takes the window to it
                rather than to the place `showMe` scrolls to (`ReviewPane`, wave 13y round 29).
              */
              openCommentsOn(circle.key)
            }}
          >
            {String(circle.count)}
          </button>
        )
        return at.layer === null ? button : createPortal(button, at.layer, circle.key)
      })}
    </>
  )
}

/**
 * The circle's own rules.
 *
 * EVERY VALUE THE MESSAGES CIRCLE USES, so the two read as one family: the same round shape, the
 * same border token, the same panel behind it and the same shadow. It is smaller because there are
 * many of them on a page and one of it, and it sits at `--z-circle` rather than `--z-drawer` because
 * it belongs to a block rather than to the window. That layer is under the top bar, so a circle
 * scrolls under the bar with its block instead of across it (wave 13t round 34).
 */
const CSS_RULES = `
.px-comment-circle {
  --px-circle-size: 1.75rem;
  position: absolute;
  z-index: var(--z-circle);
  width: var(--px-circle-size);
  height: var(--px-circle-size);
  padding: 0;
  border-radius: 50%;
  border: var(--border-w) solid var(--border-strong);
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
  display: grid;
  place-items: center;
  font: inherit;
  font-size: var(--fs-1);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 1px 6px rgb(0 0 0 / 18%);
}

/* THE ROOM ABOVE A BLOCK WITH NO MARGIN BESIDE IT: the circle's height and a gap above and below it. It
   wins over the block's own margin because without it the circle covers the block's first line. */
[data-comment-room='above'] { margin-top: calc(1.75rem + 12px) !important; }

.px-comment-circle:hover { background: var(--panel-2, var(--panel)); }
/* A COMMENT NOT YET SENT IS DRAWN PLAINLY DIFFERENT FROM ONE THAT HAS GONE (decided on 8
   November 2026): heavier and solid while it waits, dashed and quieter once it has gone. The difference is a shape and
   a weight, not a hue, so it survives greyscale. */
.px-comment-circle[data-mark="unsent"] { border-width: 2px; border-style: solid; font-weight: 700; }
.px-comment-circle[data-mark="sent"] { border-style: dashed; color: var(--text-2); background: var(--panel-2, var(--panel)); }

.px-comment-circle:focus-visible { outline: var(--focus-w) solid var(--accent); outline-offset: 2px; }
`
