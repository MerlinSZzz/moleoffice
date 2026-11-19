// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE THAT ASKS FOR NOTHING AFTER A MOVE WITHIN THE DOCUMENT IS MARKED ONCE IT HAS DRAWN.
 *
 * The ready mark of src/web/lib/ready.ts waited for the page to have asked for something since the
 * address changed. A move to an address the shell draws with the page already on screen asks for
 * nothing: opening `#/decisions` a second time is one, because the shell draws it as the page it
 * already shows. Such a page then waited for the next request of any kind, which was the office's
 * machine read, every 30 seconds. Six waits of the browser tests took 28 to 30 s each that way
 * (wave 13t, round 28), and the shortcut keys' test passed its 30 s limit by about 2 s.
 *
 * WHAT IS HELD: after that move, the mark comes within 5 s, and at the moment it comes the page has
 * asked for nothing since the address changed. The second half proves the move took the path this
 * file is about; a page that asked for something would be marked by the old rule as well.
 *
 * MUTATIONS, each run and then restored on 10 October 2026:
 *   1. src/web/App.tsx's ready effect keyed on `routeKey` again, in place of `route`: red.
 *   2. src/web/lib/ready.ts's `theFirstDataHasArrived` without `theShellDrewSinceTheAddressChanged`: red.
 * The run of each is in the round's report.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, READY_ATTRIBUTE, type LiveApp } from './helpers.ts'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'asks-for-nothing', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
}, 120_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Far under the 30 s machine read, and far over a drawn page's 60 ms quiet period. */
const AT_MOST_MS = 5_000

it('marks a second visit to the decisions address without waiting for the machine read', async () => {
  const page = app.page
  const address = `${app.site}/?lang=en#/decisions`
  await page.goto(address, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // The shell draws #/decisions as the page on screen; it is opened again from there.
  await page.evaluate(() => window.scrollTo(0, 0))
  const started = Date.now()
  await page.goto(address, { timeout: 60_000 })
  await page.waitForFunction(
    (attribute) => document.documentElement.getAttribute(attribute) === window.location.hash,
    READY_ATTRIBUTE,
    { timeout: AT_MOST_MS },
  ).catch(async () => {
    const said = await page.evaluate(() => (window as unknown as { __moleOfficeReady: () => unknown }).__moleOfficeReady())
    throw new Error(`The second visit to #/decisions was not marked within ${String(AT_MOST_MS)} ms. The page said: ${JSON.stringify(said)}`)
  })
  const took = Date.now() - started
  const asked = await page.evaluate(() => (window as unknown as { __moleOfficeReady: () => { askedForSinceTheAddressChanged: number } }).__moleOfficeReady().askedForSinceTheAddressChanged)
  console.log(`The second visit to #/decisions was marked after ${String(took)} ms, having asked for ${String(asked)} things.`)
  expect(asked, 'the second visit asked for something, so it does not test a page that asks for nothing').toBe(0)
  expect(took).toBeLessThan(AT_MOST_MS)
}, 180_000)
