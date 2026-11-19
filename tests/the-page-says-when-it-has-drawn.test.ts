// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE SAYS WHEN IT HAS FINISHED DRAWING, AND THE CHANNEL IS OPEN ON EVERY PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED AND WHY BOTH HALVES ARE IN ONE FILE
 * ---------------------------------------------------------------------------------------
 *
 * The messages channel used to be open only while the messages panel was open. The reason was
 * that a held connection makes a page never network-idle, and 162 places across the browser tests
 * and the photographing tools waited that way: with the connection open on every page,
 * `tools/review.mjs` timed out on every photograph it took.
 *
 * An agent that offers to take somebody to a page (criterion M8) has to reach a page whose panel is
 * closed, so the connection has to be open on every page. That could only be done by changing what
 * the waiting is: the page now says when it has finished drawing, and everything waits for that.
 *
 * So the two halves are one change and they are tested together. The first two tests are the mark
 * the page writes; the third is the connection that could not be held before it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MARK HOLDS AN ADDRESS AND NOT THE WORD YES
 * ---------------------------------------------------------------------------------------
 *
 * Nearly every navigation in this app changes only the part of the address after the `#`, and the
 * browser does not reload the document for one. So the page that has finished drawing `#/records`
 * still carries its mark at the instant something asks for `#/plan`. A waiter looking for the word
 * "yes" would read the old page's mark and photograph the new page half drawn. The mark holds the
 * address it finished, and a waiter compares it against the address the browser is at.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { READY_ATTRIBUTE, type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { READY_ATTRIBUTE as WRITTEN_BY_THE_APP } from '../src/web/lib/ready.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))

/**
 * How many pages this server is holding a connection open for, asked from here and not from the
 * browser.
 *
 * The connection is opened by an effect after the page has drawn, so the count starts at nought
 * and this waits for it to move — up to ten seconds, and then it answers with whatever it saw
 * rather than throwing, so a failure reads as "nought pages were open" and not as a timeout.
 */
async function pagesTheServerIsHolding(apiPort: number): Promise<number> {
  let held = 0
  for (let tries = 0; tries < 50; tries += 1) {
    const res = await fetch(`http://127.0.0.1:${String(apiPort)}/api/events/state`)
    held = ((await res.json()) as { pagesOpen: number }).pagesOpen
    if (held >= 1) return held
    await new Promise((wake) => setTimeout(wake, 200))
  }
  return held
}

describe('the page says when it has finished drawing', () => {
  let app: LiveApp
  let page: Page

  beforeAll(async () => {
    app = await liveApp({ name: 'page-says-drawn', viewport: { width: 1440, height: 1000 } })
    page = app.page
    await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('marks the page with the address it has finished drawing, not with a word', async () => {
    const said = await page.evaluate(
      (attribute) => ({
        mark: document.documentElement.getAttribute(attribute),
        at: window.location.hash,
      }),
      READY_ATTRIBUTE,
    )
    expect(said.at).toBe('#/records')
    expect(said.mark).toBe('#/records')
  })

  it('moves the mark to the new address when the reader goes somewhere else', async () => {
    await page.goto(`${app.site}/#/settings`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const mark = await page.evaluate((attribute) => document.documentElement.getAttribute(attribute), READY_ATTRIBUTE)
    expect(mark).toBe('#/settings')
  })

  /**
   * THE HALF THAT COULD NOT BE DONE BEFORE. The panel is closed — nothing has been pressed on this
   * page — and the server is still holding a connection open for it.
   *
   * `GET /api/events/state` counts the connections this server is holding. One page is open, so it
   * says one. While the channel waited for the panel it said nought.
   */
  it('holds the messages connection open on a page whose panel nobody has opened', async () => {
    const panels = await page.evaluate(() => document.querySelectorAll('.px-chat').length)
    expect(panels).toBe(0)
    expect(await pagesTheServerIsHolding(app.apiPort)).toBeGreaterThanOrEqual(1)
  })

  /**
   * WHEN THE MARK NEVER COMES, THE FAILURE NAMES WHAT WAS STILL IN FLIGHT.
   *
   * A page that never writes the mark is either still asking for something or has failed to draw,
   * and the two want different mends. Problem e8piR9MLMR_- is three sightings of the overlay-host
   * file red under load, and the third cost a day because the failure could not say which it was.
   * `tools/the-page-is-ready.mjs` now reads `window.__moleOfficeReady` — the same counters the mark
   * waits on, in src/web/lib/ready.ts — and puts the still-out paths in its sentence.
   *
   * This holds one request open on purpose, which is the one shape the sentence has to name, and
   * asks a wait short enough to fail inside the test. Nothing here is about load: the request is
   * held, not slow, so the wait fails the same way on an idle machine.
   */
  it('says which request was still in flight when the wait ran out', async () => {
    const holdsTheAttentionRead = (url: URL): boolean => url.pathname === '/api/attention'
    // NEVER ANSWERED, SO IT IS STILL IN FLIGHT WHEN THE WAIT RUNS OUT. Playwright leaves a route
    // whose handler neither continues nor fulfils it pending, which is the state being named.
    await page.route(holdsTheAttentionRead, () => {
      /* held open */
    })
    try {
      // A DIFFERENT ADDRESS, so the shell reads /api/attention again for this page.
      await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      const failure = await waitForThePage(page, 2_000).then(
        () => null,
        (err: unknown) => err,
      )
      expect(failure, 'the wait finished even though a request was held open').not.toBeNull()
      const said = (failure as Error).message
      expect(said, said).toContain('/api/attention')
      expect(said, said).toContain('still in flight')
    } finally {
      await page.unroute(holdsTheAttentionRead)
    }
  }, 60_000)
})

describe('there is one way of waiting for a page', () => {
  it('names the same attribute in the app and in the module the tools wait with', () => {
    // The app writes it and `tools/the-page-is-ready.mjs` waits for it. They are two files because
    // the photographing tools are plain JavaScript and cannot import TypeScript, so this is what
    // makes them fail together rather than drift apart.
    expect(READY_ATTRIBUTE).toBe(WRITTEN_BY_THE_APP)
  })

  it('leaves no test and no tool waiting for the network to go quiet', () => {
    // THE WORD IS BUILT RATHER THAN WRITTEN, so that this line is not itself one of the things it
    // is looking for. Spelling it out here made the check find its own detector.
    const theOldWay = ['network', 'idle'].join('')
    const guilty: string[] = []
    for (const folder of ['tests', 'tools', 'for-agents']) {
      for (const name of readdirSync(`${repo}${folder}`)) {
        if (!name.endsWith('.ts') && !name.endsWith('.mjs')) continue
        const text = readFileSync(`${repo}${folder}/${name}`, 'utf8')
        for (const [at, line] of text.split('\n').entries()) {
          if (!line.includes(theOldWay)) continue
          // A line explaining what replaced it is prose, not a wait.
          if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue
          guilty.push(`${folder}/${name}:${String(at + 1)}: ${line.trim()}`)
        }
      }
    }
    expect(guilty).toEqual([])
  })
})
