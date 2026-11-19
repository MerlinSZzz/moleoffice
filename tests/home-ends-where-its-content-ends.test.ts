// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S SCROLL ENDS WHERE ITS CONTENT ENDS, ON AN OFFICE WHOSE ANSWERS WEIGH WHAT THE OWNER'S DID.
 *
 * Round 19 of wave 13w. The owner found a blank space at the bottom of Home: the page scrolled on past its last
 * section. Measured on the made-up office of tests/an-office-with-answers-of-the-live-size.ts in Developer mode at 1440,
 * `.hm-page` was 8,561 pixels tall and the document scrolled to 24,720,824. Developer mode's question folds mounted
 * about 30,000 rows while closed; Chrome lays out a closed fold's content and only skips drawing it, so each row had a
 * real box. One row carried a comment, and its circle, which is placed at document coordinates from its block's box,
 * was put 24.7 million pixels down. Two changes hold it: the folds mount their rows only when opened
 * (`HealthGroupFold` in src/web/components/ui.tsx), and a block the browser does not draw gets no mark
 * (`notRendered` in src/web/components/agent/theblock.ts).
 *
 * WHAT IS HELD, at 1440, one width per page, scrolled to the bottom once everything near it has been read: the
 * document's scroll height is no more than the bottom of `.hm-page` plus the bottom padding, border and margin of
 * the elements that hold it, and two pixels for rounding.
 *
 * The existing height test (tests/home-on-a-busy-office-asks-once-and-ends-where-it-ends.test.ts) measures the lowest drawn element,
 * and the stray circle was itself that element, so it could not see this.
 *
 * THE QUESTION FOLDS LEFT HOME FOR THEIR OWN PAGE, `#/record-questions`, on 10 October 2026, by a
 * decision.
 * So the same thing is held on two pages: Home, which no longer draws the folds, and the page that does, whose
 * content is `[data-away-from-home="recordquestions"]` in place of `.hm-page`. That page is shorter than the window
 * when its folds are closed, and a document is never shorter than its window, so the bound is the window's height
 * when that is larger: such a page does not scroll at all.
 *
 * MUTATIONS, each run and then restored on 9 October 2026:
 *   1. `HealthGroupFold` renders its rows while closed, and `notRendered` answers false: red at every width. The
 *      document scrolled to 38,226 at 1440, where Home's content ended at 8,289, and to 68,704 at 390.
 *   1a. Run again on 10 October 2026, after the folds left Home: red on the questions page at every width, where
 *      the document scrolled to 30,017 at 1440 past content that ended at 273. Home stayed green, having no folds.
 *   2. Either one of those alone: green at every width. Each change on its own keeps the circle off a row nobody can
 *      see, so this test holds the two together and does not say which of them did it.
 *   3. Run on 11 October 2026, on one made-up office kept for every run: mutation 1, and `CommentCircles` measuring
 *      twelve seconds after it is asked rather than on the next frame. Red on the questions page at every width, twice,
 *      where the document scrolled to 21,738 at 1440 and 40,769 at 390. With the two waits of five seconds this file
 *      used before: green, twice, read while the circles were still `measuring` and none was drawn.
 *
 * THE MADE-UP OFFICE IS BUILT AGAIN FOR EACH RUN WITH NEW IDS, and mutation 1 is red only when a record with a comment
 * falls among the folds' rows. On 11 October 2026 the questions page drew a stray circle in four builds and none in a
 * fifth. Set MEASURE_KEEP to a file to build it once and reuse it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, READY_ATTRIBUTE, type LiveApp } from './helpers.ts'
import { CIRCLES_ATTRIBUTE } from '../src/web/components/agent/CommentCircle.tsx'
import { anOfficeWithAnswersOfTheLiveSize } from './an-office-with-answers-of-the-live-size.ts'

let app: LiveApp
let remove: () => void = () => {}

beforeAll(async () => {
  const office = await anOfficeWithAnswersOfTheLiveSize(process.env.MEASURE_KEEP)
  remove = office.remove
  app = await liveApp({ name: 'home-ends-where', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: office.file })
}, 900_000)

afterAll(async () => {
  await app?.stop()
  remove()
}, 60_000)

/**
 * HOW MANY FRAMES IN A ROW THE PAGE MUST STAND STILL. Scrolling brings rows near the screen, and each then asks for its
 * record. Until it asks, the page still says it is ready, so both marks must hold for thirty frames, half a second at
 * sixty a second. That is a margin and not a proof: a row that asked later than that would not be waited for. The
 * circles' own mark has no such margin.
 */
const STILL_FRAMES = 30

/**
 * WAIT UNTIL WHAT IS NEAR THE SCREEN HAS BEEN READ AND EVERY COMMENT CIRCLE STANDS WHERE IT GOES, and both have held
 * for `STILL_FRAMES` frames. The page says each itself, on the `<html>` element: `READY_ATTRIBUTE` names this
 * address when nothing it asked for is in flight (src/web/lib/ready.ts), and `CIRCLES_ATTRIBUTE` is `placed` when the
 * comments have been read and a measurement found every circle where it already was (CommentCircle.tsx). The stray
 * circle this file is about is one of those circles, so the wait cannot end before it is placed, however late that is.
 *
 * This replaced two waits of five seconds each (wave 13t round 31). Mutation 3 below is green with them and red with
 * this.
 */
async function untilTheCirclesStand(page: Page): Promise<void> {
  await page.evaluate(({ frames, ready, circles }) => new Promise<void>((resolve) => {
    let still = 0
    const look = () => {
      const html = document.documentElement
      const standing = html.getAttribute(ready) === window.location.hash && html.getAttribute(circles) === 'placed'
      still = standing ? still + 1 : 0
      if (still >= frames) resolve()
      else window.requestAnimationFrame(look)
    }
    window.requestAnimationFrame(look)
  }), { frames: STILL_FRAMES, ready: READY_ATTRIBUTE, circles: CIRCLES_ATTRIBUTE })
}

/** Each page held: where it is, what says it has drawn what this is about, and the element its content ends at. */
const PAGES = [
  { name: 'Home', hash: '#/', drawn: '[data-home-section="agents"] [data-agent-count]', content: '.hm-page' },
  // THE QUESTION COUNTS ARE DRAWN, so the folds this is about are on the page.
  { name: 'the questions about the records', hash: '#/record-questions', drawn: '.att-questions details', content: '[data-away-from-home="recordquestions"]' },
] as const

describe('Home and the questions page on an office whose answers weigh what the person’s did, in Developer mode', () => {
  for (const one of PAGES) {
    const width = 1440
    it(`${one.name} ends its scroll where its content ends at ${String(width)}`, async () => {
      const context = await app.browser.newContext({ viewport: { width, height: 1000 } })
      try {
        const page = await context.newPage()
        await page.goto(`${app.site}/?lang=en&mode=inspect${one.hash}`, { timeout: 120_000 })
        await page.locator(one.drawn).first().waitFor({ state: 'attached', timeout: 120_000 })
        await untilTheCirclesStand(page)
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await untilTheCirclesStand(page)
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        const seen = await page.evaluate((content) => {
          const home = document.querySelector(content)
          if (!(home instanceof HTMLElement)) return null
          let room = Number.parseFloat(window.getComputedStyle(home).marginBottom)
          for (let up = home.parentElement; up !== null; up = up.parentElement) {
            const style = window.getComputedStyle(up)
            room += Number.parseFloat(style.paddingBottom) + Number.parseFloat(style.borderBottomWidth)
            if (up !== document.documentElement) room += Number.parseFloat(style.marginBottom)
          }
          return {
            contentBottom: home.getBoundingClientRect().bottom + window.scrollY,
            room,
            scrollHeight: document.documentElement.scrollHeight,
            window: window.innerHeight,
          }
        }, one.content)
        expect(seen, `${one.name} drew no ${one.content}`).not.toBeNull()
        if (seen === null) return
        console.log(`${one.name} ${String(width)}: content ends at ${seen.contentBottom.toFixed(0)}, with ${seen.room.toFixed(0)} of padding below it; the document scrolls to ${String(seen.scrollHeight)}`)
        expect(seen.scrollHeight, `the document scrolls ${(seen.scrollHeight - seen.contentBottom - seen.room).toFixed(0)} pixels past the content of ${one.name}`).toBeLessThanOrEqual(Math.max(seen.window, seen.contentBottom + seen.room + 2))
      } finally {
        await context.close()
      }
    }, 300_000)
  }
})
