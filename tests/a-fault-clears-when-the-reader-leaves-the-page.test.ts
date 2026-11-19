// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CAUGHT FAULT IS GONE THE MOMENT THE READER GOES SOMEWHERE ELSE. Criterion E4.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN TEST
 * ---------------------------------------------------------------------------------------
 *
 * A React boundary remembers the fault it caught. It has to: that is how it goes on drawing the
 * words instead of the page. But it never forgets by itself, so a boundary that is mounted once
 * around every page keeps the reader's first fault on the screen for the rest of the session — they
 * press Citizens, then Records, then Today, and every one of them draws the fault from the page they
 * left. The critic named this before it was built (note IyKUXwTqwOTq, objection 7): *say the fault
 * clears; a boundary not keyed by the route keeps the page dead after the reader navigates away.*
 *
 * WHAT MAKES IT CLEAR is the key on the boundary in src/web/App.tsx: `window.location.hash`, which
 * is the address itself. A new address is a new boundary with nothing remembered. It is the ADDRESS
 * and not the route's name, because two citizens' pages share one route name and a boundary keyed
 * by the name would hold the first citizen's fault over the second citizen's page.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, IN A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 *   · the Embassy is answered with a shape it cannot draw, and the fault is on the screen;
 *   · the reader goes to Records, whose reply is untouched, and that page draws with no fault on it.
 *
 * GOING BACK TO THE BROKEN PAGE IS NOT MEASURED HERE, and the reason is worth writing down. On the
 * way back the page meets a different loud failure first: the office's own check that a reply came
 * from the world the page opened against, which the test's made-up reply cannot satisfy. That is the
 * product working, and a case that walked into it would be measuring the world check rather than
 * this one.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop `key={window.location.hash}` from `<TheFaultBoundary>` in src/web/App.tsx → the second
 *     case goes red: Records draws the Embassy's fault.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

async function faultsOnThePage(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('.fault').length)
}

describe('a fault clears when the reader leaves the page', () => {
  let app: LiveApp
  let page: Page

  beforeAll(async () => {
    app = await liveApp({ name: 'fault-clears', viewport: { width: 1440, height: 1000 } })
    page = app.page
    // THE REAL REPLY'S HEADERS, WITH A BODY THE PAGE CANNOT DRAW. The headers say which office answered;
    // a reply that names none is refused once the page has heard from its office, and the page's
    // language is read from the office before this page asks for anything.
    await page.route('**/api/office/embassy*', async (route) =>
      route.fulfill({ response: await route.fetch(), status: 200, contentType: 'application/json', body: '{}' }),
    )
    await page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('draws the fault on the page that failed', async () => {
    expect(await faultsOnThePage(page)).toBe(1)
  })

  it('draws no fault on the next page the reader opens', async () => {
    await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    expect(await faultsOnThePage(page), 'the fault belonged to the page it happened on').toBe(0)
    const drew = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').trim().length)
    expect(drew, 'and this page drew').toBeGreaterThan(0)
  })
})
