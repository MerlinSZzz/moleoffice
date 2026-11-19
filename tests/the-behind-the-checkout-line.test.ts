// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE 'BEHIND THE CHECKOUT' WARNING IS ONE LINE OF TITLE, AND THE PAGE STAYS USABLE UNDER IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE DECISION
 * ---------------------------------------------------------------------------------------
 *
 * A decision, on problem `mnCme7ZcHO3F`, says: change this part little. A person may be typing
 * while the warning shows: pressing and typing go on working, but no special code is written for that case.
 *
 * So the freshness warning stays, it becomes one line of title, and the page does not lock while it
 * shows. The reading itself is not this file's business: `tests/the-page-shouts-when-it-is-in-the-
 * wrong-world.test.ts` proves both directions are still worked out, and
 * `tests/staleness-is-counted-from-when-it-started.test.ts` proves the clock. What is proved here is
 * the drawing, and only the drawing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND HOW
 * ---------------------------------------------------------------------------------------
 *
 *   the line      rendered to markup, twice: direction 1 (this page's own old code) and direction 2
 *                 (the server behind the checkout). One sentence, one press, the same sentence in
 *                 both directions.
 *   the colour    direction 2 is red and direction 1 is not.
 *   the page      in a real browser, with the page really behind: the line is drawn, no sheet covers
 *                 the page, and a press on the page itself acts.
 *   the press     the refresh press reloads the page, which is the remedy the line asks for.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Page } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { formatFreshnessHeader } from '../src/config/freshness-header.mjs'
import { BehindTheCheckout } from '../src/web/components/BehindTheCheckout.tsx'
import {
  compareThisPageWith,
  forgetTheWorldOnThisPage,
  howOldTheServerSaysItIs,
  type RuntimeFactsForThePage,
} from '../src/web/lib/world.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The moment every reading below is measured against, so nothing here depends on the wall clock. */
const NOW = new Date('2026-09-03T10:05:00').getTime()

/** A world where everything agrees: the page is as new as the checkout and the database is real. */
function everythingAgrees(): RuntimeFactsForThePage {
  return {
    addresses: { canonicalWeb: 'http://127.0.0.1:5173', canonicalWebForOtherMachines: null },
    database: {
      path: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`,
      canonicalPath: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`,
      canonical: true,
    },
    freshness: {
      verdict: 'as new as the checkout',
      newestOnDisk: '2026-09-03 10:00:00',
      newestOnDiskFile: 'src/web/App.tsx',
      newestForThePage: '2026-09-03 10:00:00',
      newestFileForThePage: 'src/web/App.tsx',
    },
    supervisor: { failedStarts: null },
  }
}

/** Tell the page what the answering server says about the age of its own code. */
function theServerSays(verdict: 'fresh' | 'stale' | 'unknown', staleFor: number | null, grace = 15): void {
  howOldTheServerSaysItIs(formatFreshnessHeader({ verdict, staleFor, grace }), NOW)
}

/** The one line, drawn from whatever `worldTrouble()` holds right now. */
function drawnLine(): string {
  return renderToStaticMarkup(h(BehindTheCheckout))
}

/** Put direction 1 into `worldTrouble()`: the first look starts the clock, the second draws it. */
function thisPageIsBehind(): void {
  theServerSays('fresh', null)
  const page = { servedAt: '2026-09-03 09:00:00' }
  compareThisPageWith(everythingAgrees(), 'http://127.0.0.1:5173', page, NOW)
  compareThisPageWith(everythingAgrees(), 'http://127.0.0.1:5173', page, NOW + 16_000)
}

// =========================================================================== the line, rendered

describe('the freshness warning drawn as one line', () => {
  afterEach(() => {
    forgetTheWorldOnThisPage()
  })

  it('draws one sentence and one refresh press, and nothing that blocks the page', () => {
    thisPageIsBehind()
    const html = drawnLine()
    expect(html).toContain('class="px-btc"')
    expect(html).toContain('class="px-btc-said"')
    expect(html, 'the line carries no press').toContain('class="px-btc-do"')
    expect(html).toContain('Refresh')
    expect(html).toContain('This page is behind the checkout; refresh to get the new code.')
    // ONE LINE: one sentence and one press, and no sheet anywhere near it.
    expect((html.match(/class="px-btc-said"/g) ?? []).length).toBe(1)
    expect((html.match(/class="px-btc-do"/g) ?? []).length).toBe(1)
    expect(html).not.toContain('px-ww-block')
  })

  it('is quiet in direction 1, because a refresh is what cures it', () => {
    thisPageIsBehind()
    const html = drawnLine()
    expect(html).toContain('class="px-btc"')
    expect(html).not.toContain('class="px-btc px-btc-server"')
  })

  it('is red in direction 2, the server behind the checkout, which is the office’s fault', () => {
    theServerSays('stale', 240)
    const html = drawnLine()
    expect(html).toContain('class="px-btc px-btc-server"')
    expect(html).toContain('This page is behind the checkout; refresh to get the new code.')
  })

  it('draws the same sentence in both directions, so the colour is the only difference', () => {
    thisPageIsBehind()
    const quiet = drawnLine()
    forgetTheWorldOnThisPage()
    theServerSays('stale', 240)
    const red = drawnLine()
    const said = (html: string): string => html.match(/class="px-btc-said">([^<]*)</)?.[1] ?? ''
    expect(said(quiet)).toBe('This page is behind the checkout; refresh to get the new code.')
    expect(said(red)).toBe(said(quiet))
  })

  it('draws nothing at all when the code is level with the checkout', () => {
    theServerSays('fresh', null)
    expect(drawnLine()).toBe('')
  })
})

// =========================================================================== the line, in a browser

/**
 * A PAGE THAT IS REALLY BEHIND, IN A BROWSER THAT REALLY PRESSES IT.
 *
 * The stale stamp is served the way `tests/the-negative-control.test.ts` serves it — the virtual
 * module Vite builds is rewritten to a stamp an hour older than the newest file the page is built
 * from — so the fault is the real one and not a stub of it.
 *
 * THE SERVER IS STARTED WITH NO GRACE. The page draws the line only after it has been behind for
 * longer than `MOLE_OFFICE_STALE_CODE_GRACE`, fifteen seconds by default, and each case below waits
 * for a line. The grace is not this file's business (the head of this file names the tests that
 * prove the reading and its clock), so this file's own server is started with it at 0, as
 * tests/the-negative-control.test.ts does. The line then comes about a second after the page finds itself behind.
 */
describe('the page stays usable under the line', () => {
  let app: LiveApp
  let page: Page
  /** The grace setting as the runner had it, put back when this describe ends. */
  const graceBefore = process.env['MOLE_OFFICE_STALE_CODE_GRACE']

  const theStampModule = (url: URL): boolean => url.pathname.includes('virtual:mole-office-served')

  beforeAll(async () => {
    process.env['MOLE_OFFICE_STALE_CODE_GRACE'] = '0'
    app = await liveApp({
      name: 'behind-the-checkout-line',
      viewport: { width: 1440, height: 1000 },
      // THE DEV SERVER, BECAUSE THIS FILE REWRITES A MODULE ONLY A DEV SERVER SERVES. It makes the
      // page look old by intercepting `virtual:mole-office-served` and putting an older stamp in
      // it, which is `theStampModule` below. A built page carries that stamp inside a bundled chunk
      // with nothing to intercept, and is stamped with the moment of the build, so it can never be
      // behind and the line this whole file is about would never appear.
      theDevServerBecause:
        'this file makes the page look old by rewriting the served-stamp module, which only a dev server serves',
    })
    page = app.page
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
    if (graceBefore === undefined) delete process.env['MOLE_OFFICE_STALE_CODE_GRACE']
    else process.env['MOLE_OFFICE_STALE_CODE_GRACE'] = graceBefore
  }, 60_000)

  /** A stamp an hour before the newest file the page is built from, so the page is really behind. */
  async function anHourBehind(): Promise<string> {
    const freshness = (await (
      await fetch(`${app.api}/api/runtime/freshness`, { headers: { 'x-mole-office-workspace': 'default' } })
    ).json()) as { freshness?: { newestForThePage?: string | null } }
    const newest = freshness.freshness?.newestForThePage ?? null
    if (newest === null) throw new Error('the server did not say when the newest page file changed')
    const at = new Date(new Date(newest.replace(' ', 'T')).getTime() - 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
      `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
      `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
    )
  }

  async function serveAStaleStamp(): Promise<void> {
    const stamp = await anHourBehind()
    await page.route(theStampModule, async (route) => {
      const response = await route.fetch()
      const original = await response.text()
      await route.fulfill({
        response,
        body: original.replace(/export const servedAt = "[^"]*"/, `export const servedAt = ${JSON.stringify(stamp)}`),
      })
    })
  }

  it('draws the line, covers nothing, and a press on the page still acts', async () => {
    await serveAStaleStamp()
    await page.goto(`${app.site}/?behind=one#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    // THE LINE ARRIVES AFTER THE GRACE, which is the point: a save being picked up draws nothing.
    // This file's server has a grace of 0, so here that is about a second.
    await page.waitForSelector('.px-btc', { timeout: 40_000 })

    const drawn = await page.evaluate(() => {
      const line = document.querySelector('.px-btc')
      return {
        lines: document.querySelectorAll('.px-btc').length,
        sentence: document.querySelector('.px-btc-said')?.textContent ?? '',
        red: line?.classList.contains('px-btc-server') ?? false,
        sheet: document.querySelector('.px-ww-block') !== null,
        blockingBanner: document.querySelector('.px-ww') !== null,
        // WHAT A PRESS AT THE MIDDLE OF THE WINDOW LANDS ON. Asked of the browser rather than worked
        // out from a rectangle, the way the wrong-world test asks it.
        whatAPressWouldHit:
          document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.className ?? 'nothing',
      }
    })
    expect(drawn.lines).toBe(1)
    expect(drawn.sentence).toBe('This page is behind the checkout; refresh to get the new code.')
    expect(drawn.red, 'this page being behind was drawn in the office’s red').toBe(false)
    expect(drawn.sheet, 'the line put a blocking sheet over the page').toBe(false)
    expect(drawn.blockingBanner, 'the freshness reading was drawn in the blocking banner').toBe(false)
    expect(String(drawn.whatAPressWouldHit), 'the line covers the middle of the page').not.toContain('px-btc')

    // A PRESS ON THE PAGE ITSELF, not the line's own press: the first link that is not the address
    // the page is already at. If the line locked the page this press would land on nothing.
    const href = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href^="#/"]')]
      return links.find((one) => one.getAttribute('href') !== window.location.hash)?.getAttribute('href') ?? null
    })
    expect(href, 'there was no link on the page to press').not.toBeNull()
    await page.locator(`a[href="${String(href)}"]`).first().click()
    await page.waitForFunction((to) => window.location.hash === to, href, { timeout: 15_000 })
    expect(await page.evaluate(() => window.location.hash)).toBe(href)
    // AND THE LINE IS STILL THERE: the press acted and dismissed nothing.
    expect(await page.locator('.px-btc').count()).toBe(1)
    await page.unroute(theStampModule)
  }, 90_000)

  it('the refresh press reads the page again', async () => {
    await serveAStaleStamp()
    await page.goto(`${app.site}/?behind=two#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.px-btc', { timeout: 40_000 })
    // A MARKER THAT DIES WITH THE DOCUMENT. A reload takes it; nothing else on this page does.
    await page.evaluate(() => {
      ;(window as unknown as { behindLineMarker?: string }).behindLineMarker = 'the document that pressed Refresh'
    })
    await page.locator('.px-btc-do').click()
    await page.waitForFunction(() => (window as unknown as { behindLineMarker?: string }).behindLineMarker === undefined, undefined, {
      timeout: 30_000,
    })
    expect(
      await page.evaluate(() => (window as unknown as { behindLineMarker?: string }).behindLineMarker ?? null),
    ).toBeNull()
    // THE STALE STAMP IS STILL SERVED, so the line is owed again and comes back without a dismissal.
    await page.waitForSelector('.px-btc', { timeout: 40_000 })
    await page.unroute(theStampModule)
    await sleep(0)
  }, 120_000)
})
