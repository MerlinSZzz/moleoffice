// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SWEEP'S SENTENCES TAKE THEIR OWN HEIGHT, NOT A WIDTH.
 *
 * The Agent runs page has one row with the press "Look for runs on this computer". Until November 2026 a
 * privacy sentence stood beside the press, a flex item with an 18em basis, which is a width there. What the
 * press found is drawn under that row in `.sx-look-did`, a flex COLUMN. Its sentences carried the same class,
 * so the 18em basis became each sentence's height: two sentences stood at the top of two empty blocks about
 * 230 pixels tall. The privacy sentence was taken off the page in November 2026, as decided; the class stays.
 *
 * THIS FILE PRESSES THE REAL PAGE, with the server's answer to POST /api/sessions/discover made up by
 * page.route. The made-up reply carries the world header and the CORS headers the page needs to read a
 * reply from the API's own port.
 *
 * 1. AT 1440 AND AT 390, after a press that answers a whole sweep, every sentence in `.sx-look-did` is no
 *    taller than a Range over its own text, within 2 pixels.
 *
 * MUTATIONS: put `flex: 1 1 18em` back on the sentences inside `.sx-look-did`, and 1 goes red on the
 * height.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { HEADERS_A_PAGE_MAY_READ } from '../src/config/what-a-page-may-read.mjs'
import { WORLD_HEADER } from '../src/config/world-header.mjs'
import { t } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
/** Which world the test office says answered, copied onto every reply this file makes up. */
let worldAnswered = ''
/**
 * The reply headers a page is allowed to read: the office's own list, joined as the office joins it for a page it
 * takes. A reply to a request with no Origin carries no CORS headers, so the test process's own health read has none
 * to copy.
 */
const exposedHeaders = HEADERS_A_PAGE_MAY_READ.join(', ')

beforeAll(async () => {
  app = await liveApp({ name: 'a-sweeps-sentences-take-their-own-height', viewport: { width: 1440, height: 900 } })
  const health = await fetch(`${app.api}/api/health`)
  worldAnswered = health.headers.get(WORLD_HEADER) ?? ''
  if (worldAnswered === '') throw new Error('the test office did not say which world answered GET /api/health')
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/**
 * THE CORS HEADERS A REPLY OWES A PAGE ON ANOTHER LOOPBACK PORT. The page is served on the web port and
 * calls the API on its own port; without these the browser refuses an intercepted answer and the component
 * sees a network error instead of the reply this case is about.
 */
function theHeadersThePageMayRead(): Record<string, string> {
  return {
    'access-control-allow-origin': app.site,
    vary: 'Origin',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': exposedHeaders,
    [WORLD_HEADER]: worldAnswered,
  }
}

/** A discovery answer a whole sweep gives: nothing unreadable, and a state every one of them can store. */
function aWholeSweep(): unknown {
  return {
    report: {
      discovered: 2,
      created: 1,
      adopted: 0,
      updated: 0,
      unchanged: 1,
      stampOnly: 1,
      stateNotStorable: 0,
      unreadable: [],
      notes: [],
      dryRun: false,
      where: [
        { conversation: 'claude-code:fixture-a', directory: '/srv/mole-office-fixtures/a', action: 'filed', project: 'default', because: 'The project holds this folder.' },
        { conversation: 'codex:fixture-b', directory: '/srv/mole-office-fixtures/b', action: 'observed', project: 'default', because: 'It already had a record here.' },
      ],
    },
    changeLog: {
      scanned: 0,
      alreadyRecordIds: 0,
      alreadyNamed: 0,
      migrated: [],
      dangling: [],
      namedElsewhere: [],
      rowsRepointed: 0,
      applied: true,
      note: 'Nothing in this test named a session.',
    },
    note: 'A made-up sweep answer for a test office.',
  }
}

interface Opened {
  page: Page
  close: () => Promise<void>
}

/** A window of this test's own, at one width, with its theme stored before the page loads. */
async function aWindow(width: number, theme: 'light' | 'dark'): Promise<Opened> {
  const context = await app.browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
  })
  await context.addInitScript((chosen) => localStorage.setItem('mole-office.preset.theme', chosen), theme)
  const page = await context.newPage()
  await page.route((url) => url.pathname === '/api/sessions/discover', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 200,
      headers: theHeadersThePageMayRead(),
      contentType: 'application/json',
      body: JSON.stringify(aWholeSweep()),
    })
  })
  return { page, close: () => context.close() }
}

/** Press the page's own press and wait until the answer is drawn and the press's waiting light has ended. */
async function pressLookForRuns(page: Page): Promise<void> {
  await page.goto(`${app.site}/#/sessions`)
  await waitForThePage(page, 60_000)
  const press = page.getByRole('button', { name: t('g6a.sessions.look') })
  await press.waitFor({ state: 'visible', timeout: 30_000 })
  await press.click()
  await page.locator('.sx-look-did').waitFor({ state: 'visible', timeout: 30_000 })
  await expect.poll(() => page.locator('canvas[data-wait-light]').count(), { timeout: 10_000, message: 'the press light has ended' }).toBe(0)
}

/**
 * Each sentence's box, and the height its words take, in the page's own pixels.
 *
 * THE RANGE COUNTS THE LINES; THE PARAGRAPH'S OWN LINE-HEIGHT GIVES THEIR HEIGHT. A Range's outer
 * rectangle in Chromium is the glyph box of the font (18 pixels here), not the line box (22.36), so
 * comparing the paragraph with that rectangle would fail a correct one by its leading. The Range is
 * still what says how many lines the words take, which is the part that changes with width.
 */
async function theSentences(page: Page): Promise<{ words: string; height: number; textHeight: number; lines: number }[]> {
  const sentences = page.locator('.sx-look-did .sx-look-say')
  await expect.poll(() => sentences.count(), { timeout: 10_000, message: 'the sweep drew its sentences' }).toBeGreaterThan(0)
  return sentences.evaluateAll((nodes) =>
    nodes.map((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0.5 && rect.height > 0)
      const lines = new Set(rects.map((rect) => Math.round(rect.top * 10) / 10)).size
      const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight)
      return {
        words: (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
        height: node.getBoundingClientRect().height,
        textHeight: lines * lineHeight,
        lines,
      }
    }),
  )
}

it('1. at 1440 and 390, each sentence of the sweep takes no more height than its own text', async () => {
  for (const width of [1440, 390]) {
    const { page, close } = await aWindow(width, 'light')
    try {
      await pressLookForRuns(page)
      const sentences = await theSentences(page)
      expect(sentences.length, `at ${String(width)}, the sweep drew its sentences`).toBeGreaterThan(0)
      for (const one of sentences) {
        expect(
          Math.abs(one.height - one.textHeight),
          `at ${String(width)}, "${one.words}" is ${String(Math.round(one.height))}px tall for ${String(Math.round(one.textHeight))}px of text in ${String(one.lines)} line(s)`,
        ).toBeLessThanOrEqual(2)
      }
    } finally {
      await close()
    }
  }
}, 180_000)
