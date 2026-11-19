// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH BOX THE PAGE ON THE SCREEN SCROLLS IN, ASKED OF THE PAGE ITSELF.
 *
 * A report's page scrolls inside its own `main` on a window wider than a phone's, and every other page
 * scrolls the window. A test that reads or moves a page's scroll through `window.scrollY` or
 * `window.scrollTo` reads 0 and moves nothing on such a page, and still passes. So each test reads and
 * moves the scroll through this file.
 *
 * NOTHING HERE SAYS WHEN A PAGE SCROLLS IN ITS BOX. That is written once, in the page's own code and
 * stylesheet. A width or a rule copied here could go on agreeing with an old page while the page
 * changed. So this asks the browser what it drew: `main` when the browser gave `main` an overflow that
 * scrolls, and the window's own element otherwise.
 */
import type { ElementHandle, Page } from 'playwright'

/** The element the page scrolls in, as the browser drew the page at this moment. */
export async function thePageScroller(page: Page): Promise<ElementHandle<Element>> {
  return page.evaluateHandle(() => {
    const main = document.getElementById('main')
    if (main !== null && /^(auto|scroll)$/.test(getComputedStyle(main).overflowY)) return main
    return document.scrollingElement ?? document.documentElement
  })
}

/** Ask one question of the element the page scrolls in, with one number it reads, and let the element go after. */
async function askThePageScroller<R>(page: Page, question: (box: Element, by: number) => R | Promise<R>, by = 0): Promise<R> {
  const box = await thePageScroller(page)
  try {
    return await box.evaluate(question, by)
  } finally {
    await box.dispose()
  }
}

/** How far down the page is scrolled, in pixels. */
export async function whereThePageIs(page: Page): Promise<number> {
  return askThePageScroller(page, (box) => box.scrollTop)
}

/** The element the page scrolls in, named for a failure line: the window, or the element's tag and id. */
export async function theNameOfThePageScroller(page: Page): Promise<string> {
  return askThePageScroller(page, (box) => (box === document.scrollingElement ? 'the window' : `${box.tagName.toLowerCase()}#${box.id}`))
}

/** How tall the page is that scrolls, in pixels: the scroller's scroll height. */
export async function theLengthOfThePage(page: Page): Promise<number> {
  return askThePageScroller(page, (box) => box.scrollHeight)
}

/** How far the page runs past its scroller sideways, in pixels: 0 or less when it does not scroll sideways. */
export async function howFarThePageRunsSideways(page: Page): Promise<number> {
  return askThePageScroller(page, (box) => box.scrollWidth - box.clientWidth)
}

/** Put the page at this many pixels down, at once. */
export async function putThePageAt(page: Page, top: number): Promise<void> {
  await askThePageScroller(page, (box, to) => { box.scrollTo(0, to) }, top)
}

/** Scroll the page by this many pixels, at once: down when it is more than 0. */
export async function scrollThePageBy(page: Page, by: number): Promise<void> {
  await askThePageScroller(page, (box, step) => { box.scrollBy(0, step) }, by)
}

/** Put the page at its end, at once. */
export async function toTheEndOfThePage(page: Page): Promise<void> {
  await askThePageScroller(page, (box) => { box.scrollTo(0, box.scrollHeight) })
}

/** Wait until the page has not moved for five frames in a row, so a smooth scroll has ended. */
export async function thePageAtRest(page: Page): Promise<void> {
  await askThePageScroller(page, (box) => new Promise<void>((resolve) => {
    let last = box.scrollTop
    let still = 0
    const look = (): void => {
      still = box.scrollTop === last ? still + 1 : 0
      last = box.scrollTop
      if (still >= 5) resolve()
      else requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  }))
}
