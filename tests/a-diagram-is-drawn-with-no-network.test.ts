// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LIBRARY THAT DRAWS A DIAGRAM IS IN THE BUILT APP, AND NOTHING GOES OUT TO GET IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A GATE AND NOT A PREFERENCE
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office runs on the owner's own machine and that machine may have no internet. A page that
 * fetched a drawing library from a content network would draw eight blank boxes there, and the
 * failure would arrive months later on the one day it mattered. So the library is bundled.
 *
 * TWO HALVES, AND THE SECOND IS THE ONE THAT ROTS. Whether the library is in the built app is a
 * fact about `dist`; whether the page reaches for anything while it draws is a fact about a running
 * browser, and one import written as a URL would flip it with the first half still green.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT COUNTS AS THE NETWORK HERE
 * ---------------------------------------------------------------------------------------
 *
 * Anything that is not this test's own two servers on loopback. The app talks to its own API while
 * a page loads, and that is not the network — it is the product. Every other host, scheme and
 * origin is, including a `data:` document, a font service and a content network.
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page, Request } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'


/** One mermaid diagram, small, so this file is about where the code came from and not about drawing. */
const DIAGRAM = ['```mermaid', 'flowchart TD', '  A[Written] --> B[Drawn]', '```'].join('\n')

// ============================================================ half one: it is in the built app





// ============================================================ half two: nothing goes out

describe('drawing one, in a browser, reaches for nothing', () => {
  let app: LiveApp
  let page: Page
  const asked: string[] = []

  beforeAll(async () => {
    // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
    // The owner's act 3a of 15 September 2026 made a record page open at the
    // conclusion, where the body holds the summary and nothing else, so a test that measures a
    // diagram, a picture, a mark, a tab stop or a panel inside the writing found an empty body and
    // waited for a selector that would never appear. `opensAt` writes the reader's own stored
    // choice before the page loads, so this file is about its own subject again and not about the
    // level a page opens at. That level has its own test in
    // tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
    app = await liveApp({ opensAt: 'full', name: 'diagram-no-network', viewport: { width: 1440, height: 1000 } })
    page = app.page
    const mine = [`http://127.0.0.1:${String(app.apiPort)}`, `http://127.0.0.1:${String(app.webPort)}`]
    page.on('request', (req: Request) => {
      const url = req.url()
      if (mine.some((where) => url.startsWith(where))) return
      asked.push(url)
    })
    const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'report',
        title: 'One diagram, drawn on a machine with no internet',
        summary: 'A single mermaid fence, so what the page asks for while it draws can be counted.',
        data: { blocks: [{ id: 'b-1', type: 'text', heading: 'The diagram', text: DIAGRAM }] },
      }),
    })
    if (!res.ok) throw new Error(`filing the report answered ${String(res.status)}: ${await res.text()}`)
    const id = ((await res.json()) as { record: { id: string } }).record.id
    await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/r/${id}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.sb-diagram svg', { timeout: 60_000 })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('drew the picture, so this file is about a page that really used the library', async () => {
    expect(await page.locator('.sb-diagram svg').count()).toBe(1)
  })

  it('asked nothing of any address but its own two servers', () => {
    expect(asked, `the page went off this machine for ${asked.join(', ')}`).toEqual([])
  })
})
