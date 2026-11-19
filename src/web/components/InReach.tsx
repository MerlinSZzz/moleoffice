// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BOX THAT DOES NOT FIT ITS CONTENTS DRAWS A MARK SAYING SO, ON THE SIDE THERE IS MORE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FIXES, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Thirteen boxes in this product scroll and say nothing while they do it.
 * A box with
 * `overflow-x: auto` and nothing else takes content off its edge in silence, because on this
 * platform the scrollbar is 0px wide until a pointer moves. Measured on 20 August 2026 on the
 * owner's own report: four tables, each 89px wider than the box holding them, at 1024, 1280, 1440
 * and 1920 alike, with nothing on any of those screens saying a column was off the edge.
 *
 * `PlanTable` was the one box that answered. This is that answer, taken out of `PlanTable` and made
 * the one implementation, which is what step 24 of the round-nine plan owed and did not build. Four
 * pieces below — `NEARLY_IN_REACH`, `columnsOutOfReach`, `useReach` and the `bringHere` it hands
 * back — were moved here from `components/plans/PlanTable.tsx`; that file now imports them. A fifth,
 * `moreToSee`, became `sidesWithMore`, which answers about four sides rather than two. There is one
 * answer to "is anything off the edge", not two.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A MARK AND NOT A SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * `docs/UX-CONTRACT.md`: a fix that amounts to "add a sentence explaining it" is a failed fix.
 * Thirteen boxes would have been thirteen sentences. What is drawn instead is a 2px rule and a 24px
 * fade at the edge the content carries on past, and nothing at all at an edge it does not. The rule
 * is what makes it a mark rather than a soft edge somebody can read as the end of the box: a fade
 * alone against a matching page is invisible, which is how `PlanTable`'s own fade came to be
 * reported as a clip at 1440.
 *
 * ---------------------------------------------------------------------------------------
 * DOWNWARDS COUNTS, AND THAT IS THIS FILE ANSWERING AN OPEN QUESTION
 * ---------------------------------------------------------------------------------------
 *
 * `design/ROUND-NINE-INTERACTION-CONTRACT.md` question 17 asks whether an unannounced VERTICAL clip
 * is the same defect, and leaves it open. It is the same defect: a chart's data table with a 260px
 * `max-height` and a quoted passage with a 22rem one both take content out of sight and say nothing.
 * The answer costs nothing extra here, because the measurement is the same one — the box's scroll
 * size against the size it was given — so the mark simply has four sides instead of two.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * NOTHING IN THIS COMPONENT IS A LIVE REGION. The browser scrolls a box on its own while a person
 * drags a selection across it, so `role="status"` here would make Mole Office speak because somebody
 * selected text. The scrolling box carries `role="region"` and a name, so a screen reader says what
 * it is when focus arrives, which is the browser's own announcement and not one this file fires.
 *
 * `role="region"` AND `tabindex` ARE CONDITIONAL ON THERE BEING MORE. Unconditionally they would put
 * a tab stop and a landmark on every table, code block, equation and picture in every report, which
 * is a keyboard regression shipped inside a keyboard fix.
 *
 * THE SCROLL POSITION IS NOT REMEMBERED. Every box starts at its own edge on every load. A restored
 * offset puts the reader at a place nobody chose.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * How much of the content may hang over the edge before the box calls it out of reach, in pixels.
 *
 * IT IS TWO PIXELS BECAUSE THE COMPARISON IS BETWEEN TWO WHOLE NUMBERS ROUNDED FROM THE SAME
 * FRACTION. A browser lays a box out in fractions — 435.42px — and then reports its inside as
 * `clientHeight`, a whole number rounded DOWN, and its content as `scrollHeight`, a whole number
 * rounded UP. Each end can lose most of a pixel, so a box whose content fits exactly can measure two
 * pixels taller than the box holding it, with nothing off the edge at all.
 *
 * IT WAS ONE, AND THE SETTINGS GRID IS WHERE THAT SHOWED. `.dsay-grid` scrolls sideways, which makes
 * the browser treat its vertical axis as scrollable too, and its rows are fractional. Measured in a
 * browser on 3 September 2026 at 1440, 990, 660 and 390 in both themes: box 435.42px tall,
 * `clientHeight` 435, `scrollHeight` 437 — so the mark said there was more below, and its 24px fade
 * and 2px rule were drawn across the counter row. Every denominator under the grid — `/42`, `/566` —
 * came out washed away from about a third of the way down. Nothing was actually hidden; the mark was
 * answering a rounding. Problem `qdCdRX7EBg3j`.
 *
 * TWO PIXELS OF CONTENT IS NOT CONTENT, so nothing real stops being announced by this. A box that
 * genuinely holds a line of text out of sight is over this by an order of magnitude.
 */
export const NEARLY_IN_REACH = 2

/** One column heading as it was measured: which column, and where its two edges are. */
export interface HeadBox {
  key: string
  left: number
  right: number
}

/**
 * WHICH COLUMNS THE BOX IS NOT SHOWING IN FULL, from one reading of the boxes.
 *
 * A function of its own so that the rule can be read and tested without a browser: it is the rule
 * the owner reported as broken. The component does the measuring and draws what this hands back, so
 * there is no second answer.
 *
 * A COLUMN PARTLY OVER THE EDGE COUNTS. Half a column of boxes is a column somebody cannot type in,
 * and "part of it is off the edge" is what the press then puts right.
 */
export function columnsOutOfReach(
  box: { left: number; right: number },
  heads: readonly HeadBox[],
): string[] {
  return heads
    .filter((head) => head.left < box.left - NEARLY_IN_REACH || head.right > box.right + NEARLY_IN_REACH)
    .map((head) => head.key)
}

/** The sides of a box the content carries on past. */
export type Side = 'left' | 'right' | 'up' | 'down'

/** What a box measured: its scroll position, the room it has, and the size of what is in it. */
export interface BoxReading {
  scrollLeft: number
  clientWidth: number
  scrollWidth: number
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

/**
 * WHICH SIDES THE CONTENT GOES ON PAST, in the order the edges are drawn.
 *
 * It replaces `moreToSee`, which answered `'left' | 'right' | 'both' | undefined` and could not say
 * anything about downwards. The four sides are one list rather than two answers because the mark is
 * one mark: a box with a column off to the right and rows off the bottom draws two edges from one
 * reading, and nothing has to decide which of two facts wins.
 */
export function sidesWithMore(box: BoxReading): Side[] {
  const out: Side[] = []
  if (box.scrollLeft > NEARLY_IN_REACH) out.push('left')
  if (box.scrollLeft + box.clientWidth < box.scrollWidth - NEARLY_IN_REACH) out.push('right')
  if (box.scrollTop > NEARLY_IN_REACH) out.push('up')
  if (box.scrollTop + box.clientHeight < box.scrollHeight - NEARLY_IN_REACH) out.push('down')
  return out
}

/** The sides as one attribute value, so a stylesheet and a test read the same string. */
export const moreAttribute = (sides: readonly Side[]): string | undefined =>
  sides.length === 0 ? undefined : sides.join(' ')

/**
 * WHAT THE BOX IS NOT SHOWING RIGHT NOW, and the press that brings a column here.
 *
 * IT IS MEASURED RATHER THAN WORKED OUT FROM WIDTHS. What a column ends up being is decided by the
 * browser from its contents, and the box itself is decided by the layout the reader chose, so the
 * only thing that knows whether a column is on the screen is the browser after it has laid both
 * out. It reads again on every scroll and whenever either box changes size — typing a long note
 * widens a column, and a column that has just gone over the edge has to say so.
 *
 * IT ANSWERS "EVERYTHING IS IN REACH" UNTIL IT HAS MEASURED, and where there is nothing to measure
 * with. A server render and a runtime without ResizeObserver both get a box that claims nothing,
 * rather than a list of parts nobody has looked at.
 *
 * `shape` is what the caller has that would change the answer. It is a string rather than a list so
 * that the effect below has one dependency whose identity is its value.
 */
export function useReach(
  shape: string,
  /**
   * The element to measure, for a box that already has a ref of its own.
   *
   * The graph pane is scrolled by its own code as well as by the reader, so it holds a ref already.
   * Two refs on one element is one of them not being attached, so the caller passes the one it has
   * rather than this making a second.
   */
  on?: React.RefObject<HTMLElement | null>,
): {
  box: React.RefObject<HTMLElement | null>
  sides: readonly Side[]
  outOfReach: readonly string[]
  bringHere: (key: string) => void
} {
  const own = useRef<HTMLElement>(null)
  const box = on ?? own
  const [outOfReach, setOutOfReach] = useState<readonly string[]>([])
  const [sides, setSides] = useState<readonly Side[]>([])

  const headsOf = (el: HTMLElement): HTMLElement[] =>
    [...el.querySelectorAll<HTMLElement>('thead th')].filter((th) => th.dataset.col !== undefined)

  useLayoutEffect(() => {
    const el = box.current
    if (el === null) return
    const read = () => {
      const rect = el.getBoundingClientRect()
      const now = columnsOutOfReach(
        { left: rect.left, right: rect.right },
        headsOf(el).map((th) => {
          const r = th.getBoundingClientRect()
          return { key: th.dataset.col ?? '', left: r.left, right: r.right }
        }),
      )
      // THE SAME ANSWER IS NOT A NEW ANSWER. A scroll fires this many times a second and a fresh
      // array every time would re-draw the whole box on each one.
      const same = (was: readonly string[], next: readonly string[]) =>
        was.length === next.length && was.every((key, at) => key === next[at])
      setOutOfReach((was) => (same(was, now) ? was : now))
      const found = sidesWithMore({
        scrollLeft: el.scrollLeft,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      })
      setSides((was) => (same(was, found) ? was : found))
    }
    read()
    el.addEventListener('scroll', read, { passive: true })
    if (typeof ResizeObserver === 'undefined') {
      return () => el.removeEventListener('scroll', read)
    }
    const watch = new ResizeObserver(read)
    watch.observe(el)
    // WHAT IS INSIDE AS WELL AS THE BOX. The box can stay exactly where it is while the thing in it
    // grows past the edge, which is what typing into a cell does.
    for (const child of el.children) watch.observe(child)
    return () => {
      el.removeEventListener('scroll', read)
      watch.disconnect()
    }
  }, [shape])

  /** Scroll one column into the box, as near the middle of it as it will go. */
  const bringHere = (key: string) => {
    const el = box.current
    if (el === null) return
    const th = headsOf(el).find((one) => one.dataset.col === key)
    if (th === undefined) return
    const rect = el.getBoundingClientRect()
    const r = th.getBoundingClientRect()
    el.scrollLeft += r.left - rect.left - Math.max(0, (el.clientWidth - r.width) / 2)
  }

  return { box, sides, outOfReach, bringHere }
}

/** What `useReach` hands back, so a caller that wants the column names can pass its own in. */
export type Reach = ReturnType<typeof useReach>

/**
 * WHAT THE SCROLLING ELEMENT ITSELF CARRIES: the ref that measures it, and — only where there is
 * something off the edge — a landmark, a tab stop and a name.
 *
 * IT IS A FUNCTION BECAUSE THE SCROLLING ELEMENT IS NOT ALWAYS A `div`. Five of these boxes are a
 * `pre` or a `textarea` holding machine text, and moving the scrolling from those onto a wrapper
 * would change what each of those surfaces looks like. The caller writes its own element and spreads
 * this onto it, so the rule about when a landmark appears is written once.
 *
 * `name` is two or three words for what is in the box. A screen reader reads it when focus arrives,
 * which is the browser's own announcement; nothing here is a live region.
 */
export function reachBox(reach: Reach, name: string) {
  const there = reach.sides.length > 0
  return {
    ref: reach.box as React.RefObject<never>,
    role: there ? ('region' as const) : undefined,
    tabIndex: there ? 0 : undefined,
    'aria-label': there ? name : undefined,
  }
}

export interface InReachMarkProps {
  /** The reading the marks are drawn from. */
  reach: Reach
  /** A class for the holder, for a caller whose parent lays its children out. */
  className?: string
  /**
   * The holder's element: a `div` unless the caller asks for a `span`. A span may stand inside a
   * paragraph, where a div may not, and the caller's class then sets it on a line of its own.
   */
  element?: 'div' | 'span'
  /** The scrolling element, carrying `reachBox(reach, name)`. */
  children: ReactNode
}

/**
 * THE HOLDER THAT CARRIES THE MARKS, around a scrolling box the caller writes.
 *
 * The marks are on the holder and not on the box, because anything drawn inside a scrolling box
 * scrolls out of the way with the content. The box keeps the class it had, so every caller's own
 * stylesheet still applies to the element it was written for.
 *
 * IT TAKES THE READING RATHER THAN MAKING ONE, so that `PlanTable` — which draws the names of the
 * columns off the edge above the table and needs the same reading to do it — cannot end up with a
 * second measurement of one box.
 */
export function InReachMark({ reach, className, element: Holder = 'div', children }: InReachMarkProps) {
  return (
    <Holder
      className={className === undefined ? 'px-reach' : `px-reach ${className}`}
      data-more={moreAttribute(reach.sides)}
    >
      <style href="mole-office-in-reach" precedence="default">
        {IN_REACH_CSS}
      </style>
      {children}
      {reach.sides.map((side) => (
        <span key={side} className="px-reach-edge" data-side={side} aria-hidden="true" />
      ))}
    </Holder>
  )
}

export interface InReachBoxProps extends Omit<InReachMarkProps, 'children'> {
  /** The class the scrolling box already had. It keeps its own stylesheet; this adds the mark. */
  box: string
  /** What this box holds, in two or three words. */
  name: string
  children: ReactNode
}

/** A scrolling `div` with its marks, for the callers whose box is a plain one. */
export function InReachBox({ reach, box, name, className, children }: InReachBoxProps) {
  return (
    <InReachMark reach={reach} className={className}>
      <div className={box} {...reachBox(reach, name)}>
        {children}
      </div>
    </InReachMark>
  )
}

export interface InReachProps extends Omit<InReachBoxProps, 'reach'> {
  /** Anything the caller has that changes what is inside, so the measurement is taken again. */
  shape?: string
}

/** A scrolling box that measures itself. Most callers want this one. */
export function InReach({ shape = '', ...rest }: InReachProps) {
  return <InReachBox reach={useReach(shape)} {...rest} />
}

/**
 * THE MARK.
 *
 * A 24px fade and a 2px rule at the edge the content carries on past. `--reach-fade` is the colour
 * the content fades into and defaults to the page; a box with a background of its own sets it to
 * that background, because a fade into the wrong colour is a smear rather than an edge.
 * `--reach-edge` is how deep the fade is, named once here so that something inside the box which
 * must stay readable at an edge can keep that far in (the plan drawing's group headings do).
 *
 * IT IS NOT PART OF THE PRESS AREA. `pointer-events: none` on every edge, so a press near the edge
 * lands on the content and not on decoration, and a right-click resolves to the cell.
 */
const IN_REACH_CSS = `
.px-reach { position: relative; min-width: 0; max-width: 100%; --reach-fade: var(--bg); --reach-edge: 24px; }
.px-reach-edge { position: absolute; pointer-events: none; z-index: 2; }
.px-reach-edge[data-side='right'] { top: 0; bottom: 0; right: 0; width: var(--reach-edge);
  background: linear-gradient(to right, transparent, var(--reach-fade));
  border-right: 2px solid var(--border-strong); }
.px-reach-edge[data-side='left'] { top: 0; bottom: 0; left: 0; width: var(--reach-edge);
  background: linear-gradient(to left, transparent, var(--reach-fade));
  border-left: 2px solid var(--border-strong); }
.px-reach-edge[data-side='down'] { left: 0; right: 0; bottom: 0; height: var(--reach-edge);
  background: linear-gradient(to bottom, transparent, var(--reach-fade));
  border-bottom: 2px solid var(--border-strong); }
.px-reach-edge[data-side='up'] { left: 0; right: 0; top: 0; height: var(--reach-edge);
  background: linear-gradient(to top, transparent, var(--reach-fade));
  border-top: 2px solid var(--border-strong); }
/* A box that can be reached by keyboard shows where the focus is, in addition to the edges and
   never instead of them: focus is not what tells a person there is more. */
.px-reach > [role='region']:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
`
