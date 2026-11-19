// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH BOX THE PAGE SCROLLS IN, worked out here and nowhere else.
 *
 * A report's page scrolls inside its own box, the page's `main`, on any window wider than a phone's.
 * Its scrollbar then stands at the right edge of the page's own column, beside the words, and not at
 * the window's right edge past the margin and the chat. Every other page scrolls the window, and so
 * does a report on a phone: a phone's browser hides its own bars as the window scrolls, and a box
 * scrolling inside the window would keep them drawn.
 *
 * The report's body says its page scrolls in its box (`useThePageScrollsInItsBox`), which marks the
 * root, and the stylesheet in App.tsx reads the mark at `THE_PAGE_BOX_FROM`. Everything that reads or
 * moves the page's scroll asks `thePageScroller`, which reads what the browser made of that
 * stylesheet, so no reader can disagree with the drawing about which box scrolls.
 */
import { useLayoutEffect } from 'react'

/** The mark on the root that says the page on the screen scrolls in its own box. */
export const THE_PAGE_SCROLLS_IN_ITS_BOX = 'data-page-box'

/** The windows on which a page that asks for its own box gets it: those wider than a phone's. */
export const THE_PAGE_BOX_FROM = '(width > 40rem)'

/**
 * The class of the empty element at the end of `main` that a circle or a card beside a block is drawn
 * in while the page scrolls in its box. It takes no room and draws nothing of its own.
 */
export const THE_PAGE_LAYER = 'page-layer'

/** How far one press of an arrow key moves the page, in pixels: the browser's own step. */
const ONE_LINE = 40

/** How much of the box one page down moves, so the last lines read stay on the screen: the browser's own share. */
const ONE_PAGE = 0.875

/** Whether an element with this overflow value scrolls its contents. */
function scrolls(overflow: string): boolean {
  return overflow === 'auto' || overflow === 'scroll'
}

/** The element the page scrolls in: `main` when the page scrolls in its box, and the window's own otherwise. */
export function thePageScroller(): Element {
  const main = document.getElementById('main')
  if (main !== null && scrolls(getComputedStyle(main).overflowY)) return main
  return document.scrollingElement ?? document.documentElement
}

/** How far down the page is scrolled, in pixels. */
export function thePlaceOnThePage(): number {
  return thePageScroller().scrollTop
}

/** Scroll the page to this many pixels down. */
export function putThePageAt(top: number): void {
  thePageScroller().scrollTo(0, top)
}

/**
 * TO THE TOP, BOTH THE WINDOW AND THE BOX. Called as the address changes, before the next page is
 * drawn, so the page that goes may scroll in one and the page that comes in the other.
 */
export function toTheTopOfThePage(): void {
  window.scrollTo(0, 0)
  document.getElementById('main')?.scrollTo(0, 0)
}

/** Call `listener` whenever the page scrolls, in whichever box it scrolls. Returns what stops it. */
export function whenThePageScrolls(listener: () => void): () => void {
  // A box's scroll does not bubble, so it is heard on its way down. The window's is heard from the document.
  const heard = (event: Event): void => {
    const from = event.target
    if (from === document || (from instanceof Element && from.id === 'main')) listener()
  }
  window.addEventListener('scroll', heard, { capture: true, passive: true })
  return () => window.removeEventListener('scroll', heard, { capture: true })
}

/**
 * Call `listener` whenever the page changes size, in whichever box it scrolls. Returns what stops it.
 *
 * On a page the window scrolls, the body grows with the page. On a page that scrolls in its box, the
 * body and the box keep the window's size, and only what is in the box grows. So each element in
 * `main` is watched as well, and each one that comes into it later.
 */
export function whenThePageChangesSize(listener: () => void): () => void {
  const sized = new ResizeObserver(listener)
  sized.observe(document.body)
  const main = document.getElementById('main')
  if (main === null) return () => sized.disconnect()
  const watched = new WeakSet<Element>()
  const watchWhatIsInTheBox = (): void => {
    for (const part of main.children) {
      if (watched.has(part)) continue
      watched.add(part)
      sized.observe(part)
    }
  }
  watchWhatIsInTheBox()
  const arrivals = new MutationObserver(watchWhatIsInTheBox)
  arrivals.observe(main, { childList: true })
  return () => {
    sized.disconnect()
    arrivals.disconnect()
  }
}

/**
 * WHERE A THING DRAWN BESIDE THIS ELEMENT GOES, and what turns a place in the window into a place there.
 *
 * A circle or a card beside a block has to move with the block as the page scrolls, and nothing
 * measures it again while it does. On a page the window scrolls, it is drawn in the document, and the
 * window's scroll turns a place in the window into a place in the document. On a page that scrolls in
 * its box, a thing drawn in the document would stand still while its block scrolled away, so it is
 * drawn in the layer inside the box, and the box's own place and scroll do the turning. `layer` is
 * null for the document. Only `main` holds the layer, so an element outside the box gets the document.
 */
export function theLayerFor(element: Element): { layer: HTMLElement | null; x: number; y: number } {
  const box = thePageScroller()
  const layer = box.contains(element) ? box.querySelector<HTMLElement>(`:scope > .${THE_PAGE_LAYER}`) : null
  if (layer === null) return { layer: null, x: window.scrollX, y: window.scrollY }
  const at = box.getBoundingClientRect()
  return { layer, x: box.scrollLeft - at.left - box.clientLeft, y: box.scrollTop - at.top - box.clientTop }
}

/** Whether this box can still move `by` pixels' way, down or across. */
function canMove(box: Element, across: boolean, by: number): boolean {
  if (across) return by < 0 ? box.scrollLeft > 0 : box.scrollLeft + box.clientWidth < box.scrollWidth - 1
  return by < 0 ? box.scrollTop > 0 : box.scrollTop + box.clientHeight < box.scrollHeight - 1
}

/**
 * Whether the browser scrolls something itself for a wheel or a key that starts at this element: the
 * page's box, or a box around the element that can still move that way or keeps its scroll to itself.
 */
function somethingElseScrolls(from: Element, box: Element, across: boolean, by: number): boolean {
  for (let at: Element | null = from; at !== null && at !== document.body && at !== document.documentElement; at = at.parentElement) {
    if (at === box) return true
    const style = getComputedStyle(at)
    if (!scrolls(across ? style.overflowX : style.overflowY)) continue
    if ((across ? style.overscrollBehaviorX : style.overscrollBehaviorY) !== 'auto') return true
    if (canMove(at, across, by)) return true
  }
  return false
}

/** Whether something holds the page still: the open menu hides the body's overflow so nothing scrolls under it. */
function thePageIsHeldStill(): boolean {
  return getComputedStyle(document.body).overflowY === 'hidden' || getComputedStyle(document.documentElement).overflowY === 'hidden'
}

/** How far a scrolling key moves this box, down or across, or null when the key is not one of them. */
function theKeysStep(event: KeyboardEvent, box: Element): { across: boolean; by: number } | null {
  const page = box.clientHeight * ONE_PAGE
  if (event.shiftKey && event.key !== ' ') return null
  switch (event.key) {
    case 'ArrowDown': return { across: false, by: ONE_LINE }
    case 'ArrowUp': return { across: false, by: -ONE_LINE }
    case 'ArrowRight': return { across: true, by: ONE_LINE }
    case 'ArrowLeft': return { across: true, by: -ONE_LINE }
    case 'PageDown': return { across: false, by: page }
    case 'PageUp': return { across: false, by: -page }
    case ' ': return { across: false, by: event.shiftKey ? -page : page }
    case 'End': return { across: false, by: box.scrollHeight }
    case 'Home': return { across: false, by: -box.scrollHeight }
    default: return null
  }
}

/**
 * THE PAGE ON THE SCREEN SCROLLS IN ITS OWN BOX WHILE THIS IS DRAWN. The report's body calls it, and
 * nothing else does, so every other page keeps the window's scroll.
 *
 * WHAT THE WINDOW DID FOR THE PAGE, THE BOX IS ASKED TO DO. The wheel turned over the empty margin
 * beside the page, over the frame, or over a column that cannot move any further used to scroll the
 * window, and the page with it. It now meets a window that does not scroll, so it is passed to the
 * box. The scrolling keys pressed while nothing has the focus went to the window as well, and are
 * passed on in the same way. The browser still does whatever it does itself: the wheel and the keys
 * inside the box, in a list, in the sidebar, and the keys after a press inside the box, which the
 * browser sends to the box it was pressed in.
 */
export function useThePageScrollsInItsBox(): void {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute(THE_PAGE_SCROLLS_IN_ITS_BOX, 'yes')
    /** Where the last press landed, which is where the browser starts a key's scroll when nothing has the focus. */
    let pressed: Element | null = null
    const press = (event: PointerEvent): void => {
      pressed = event.target instanceof Element ? event.target : null
    }
    const wheel = (event: WheelEvent): void => {
      if (event.defaultPrevented || event.ctrlKey) return
      const box = thePageScroller()
      if (box.id !== 'main' || thePageIsHeldStill()) return
      const across = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      if (event.target instanceof Element && somethingElseScrolls(event.target, box, across, across ? event.deltaX : event.deltaY)) return
      const down = event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? box.clientHeight : event.deltaMode === WheelEvent.DOM_DELTA_LINE ? ONE_LINE : 1
      const sideways = event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? box.clientWidth : down
      box.scrollBy(event.deltaX * sideways, event.deltaY * down)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const focused = document.activeElement
      if (focused !== null && focused !== document.body && focused !== root) return
      const box = thePageScroller()
      if (box.id !== 'main' || thePageIsHeldStill()) return
      const step = theKeysStep(event, box)
      if (step === null) return
      if (pressed !== null && pressed.isConnected && somethingElseScrolls(pressed, box, step.across, step.by)) return
      event.preventDefault()
      box.scrollBy(step.across ? step.by : 0, step.across ? 0 : step.by)
    }
    window.addEventListener('pointerdown', press, { capture: true, passive: true })
    window.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('keydown', key)
    return () => {
      root.removeAttribute(THE_PAGE_SCROLLS_IN_ITS_BOX)
      window.removeEventListener('pointerdown', press, { capture: true })
      window.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
    }
  }, [])
}
