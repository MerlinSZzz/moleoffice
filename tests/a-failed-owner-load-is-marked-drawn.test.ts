// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN THE PAGE CANNOT ASK WHO OWNS THE OFFICE, IT SAYS SO AND IS MARKED AS DRAWN. Problem sqPRXgx-wMXF.
 *
 * src/web/main.tsx asks GET /api/office/owner before it loads the app. When that fails, the page shows
 * one sentence saying what failed and loads nothing else. That page is final: nothing more will be
 * asked for or drawn. It never got the ready mark (`data-mole-office-ready`, src/web/lib/ready.ts),
 * because the mark waits for the shell or the first-run guide, and this page is neither. So any test or
 * tool that waited on it hung until its time ran out instead of reading the sentence.
 *
 * This file answers the owner request with a 500 and waits on the mark, then reads the sentence.
 *
 * MUTATION PROOF (after a green control), in src/web/main.tsx: do not mark the failed start as drawn.
 * The case is red: the wait for the mark runs out.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'failed-owner-load', viewport: { width: 1440, height: 972 } })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a page whose owner could not be read', () => {
  it('shows what failed and is marked as drawn', async () => {
    const page = await app.browser.newPage({ viewport: { width: 1440, height: 972 } })
    try {
      await page.route('**/api/office/owner**', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'made-up failure' }) }),
      )
      await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await waitForThePage(page, 20_000)
      const text = await page.evaluate(() => document.getElementById('root')?.innerText ?? '')
      expect(text).toContain('who owns this office')
      expect(text).toContain('500')
    } finally {
      await page.close()
    }
  }, 120_000)
})
