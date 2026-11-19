// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE IS NEVER MARKED READY BEFORE THE SHELL HAS DRAWN, HOWEVER SLOWLY THE APP LOADS.
 *
 * `src/web/lib/ready.ts` puts `data-mole-office-ready` on the html element when nothing the app asked
 * for is in flight AND React has drawn. tools/review.mjs and every browser test wait on it.
 *
 * WHAT WENT WRONG. Since the owner came from the installer (the owner migration
 * `the_owner_comes_from_the_installer`), src/web/main.tsx asks who owns the office first, then loads
 * src/web/lib/language.ts, then the app. language.ts asks for the participants as it loads. That
 * request answered while the app's modules were still loading, nothing was in flight, and the page
 * was marked ready with nothing drawn. On the built page the app loads in a few milliseconds and the
 * gap hardly opens. On Vite's dev server, which tools/review.mjs photographs, it takes about a second:
 * measured on 1 October 2026, the mark went on at 756 ms with an empty body and the app's first
 * request left at 1,836 ms. Every one of review's 456 pictures was blank (problem Nht4tEXhgM8B's round).
 *
 * HOW THIS FILE OPENS THE GAP ON THE BUILT PAGE. It holds back the app's own chunk (`assets/App-*.js`)
 * by HOLD_MS. language.ts loads and its participants request answers while the app is still on its way,
 * as on the dev server. Then it asks whether the shell had drawn at the moment the page said it was
 * ready. The case also proves the chunk was held and the participants request answered before it was
 * let through, so it cannot pass by opening no gap.
 *
 * BEFORE IT WAS LET THROUGH, NOT ONLY WHILE IT WAS HELD. The answer and the request for the chunk come
 * close together: in eight tabs measured on 7 November 2026, the chunk was asked for only 1 to 3 ms before
 * the participants answered. In the merge queue, under load, the answer once came first, while nothing
 * was held yet, and the case failed its own check though the page had waited for the shell. An answer
 * that came before the chunk was asked for came while the app was not drawn too, so it opens the gap.
 *
 * MUTATION PROOF (after a green control), in src/web/main.tsx: do not call `anAppIsStarting`, so the
 * mark may go on before the shell has drawn. The case is red: the mark is on with no shell. In this file,
 * count the answer to a path no page asks for in place of /api/participants: the case is red on its own
 * check that the gap opened.
 */

import type { Page, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const HOLD_MS = 1500

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'mark-waits-for-shell', viewport: { width: 1440, height: 972 } })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The app's own chunk on the built page. */
const THE_APP_CHUNK = /\/assets\/App-[^/]+\.js$/

/** A fresh tab whose app chunk is held back, whether it was, and whether the participants answered before it was let through. */
async function aSlowApp(): Promise<{ page: Page; held: () => boolean; answeredBeforeTheApp: () => boolean }> {
  const page = await app.browser.newPage({ viewport: { width: 1440, height: 972 } })
  let held = false
  let letThrough = false
  let answeredBeforeTheApp = false
  page.on('requestfinished', (request) => {
    if (!letThrough && new URL(request.url()).pathname === '/api/participants') answeredBeforeTheApp = true
  })
  await page.route(THE_APP_CHUNK, async (route: Route) => {
    held = true
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS))
    letThrough = true
    await route.continue()
  })
  return { page, held: () => held, answeredBeforeTheApp: () => answeredBeforeTheApp }
}

describe('the ready mark', () => {
  it('waits for the shell to draw, even when the app loads after the first data has arrived', async () => {
    const { page, held, answeredBeforeTheApp } = await aSlowApp()
    try {
      await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const atTheMark = await page.evaluate(() => ({
        shell: document.querySelector('main.page') !== null,
        text: (document.getElementById('root')?.innerText ?? '').length,
      }))
      expect(held(), 'the app chunk was never held, so this case opened no gap').toBe(true)
      expect(answeredBeforeTheApp(), 'the participants did not answer before the app chunk was let through, so this case opened no gap').toBe(true)
      expect(atTheMark.shell, `the page was marked ready with no content area (${String(atTheMark.text)} characters drawn)`).toBe(true)
    } finally {
      await page.close()
    }
  }, 180_000)
})
