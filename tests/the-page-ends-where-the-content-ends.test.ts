// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE ENDS WHERE THE CONTENT ENDS — CRITERION D27, MEASURED IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET, AND WHERE THE OWNER LEFT A COMMENT ABOUT IT
 * ---------------------------------------------------------------------------------------
 *
 * Section 23 of design/messages/ACCEPTANCE.md:
 *
 *   A UI bug: scrolled to the very bottom, the page showed a lot of blank space. It used to stop at
 *   the bottom; now it scrolled further, and even the sidebars and the middle moved up. A review
 *   comment was left on that odd blank area at the bottom.
 *
 * ---------------------------------------------------------------------------------------
 * THE CAUSE, MEASURED ON THE OWNER'S OWN PIPELINE
 * ---------------------------------------------------------------------------------------
 *
 * On an isolated copy of the owner's database, on the Handover v2 drawing at 1440 by 1000. With a comment on
 * the ZED 2i card, `document.documentElement.scrollHeight` and the height of `.shell` were both 1521
 * and the comment's circle sat at 619. The drawing was then panned down by 900, which is an ordinary
 * thing to do to a drawing wider than the window. The card's box went with it, out of the bottom of
 * `.gx-canvas`, which is `overflow: hidden`. The circle is placed from that box in the DOCUMENT's
 * own coordinates, so it was written at 1519 to 1547 — twenty-six pixels below the whole page.
 * `scrollHeight` became 1547 while `.shell` stayed 1521. At the bottom of that scroll the rail's own
 * sticky box read `top: -26`, which is the sidebars sliding off the top by exactly the overflow.
 *
 * IT WAS NOT THE CARD'S CONTROL STRIP AND NOT THE WHOLE-SCREEN WRAP, the two other suspects the
 * criterion names. Both are inside `.gx-canvas`, which clips them, and the whole-screen rules are
 * gated on `:fullscreen` and do nothing at rest.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `clippedAway` in src/web/components/agent/theblock.ts return false → the case about the
 *     panned drawing goes red, and so does the case about the sidebars.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'

let app: LiveApp
let page: Page
let richId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-page-ends', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const rich = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: 'Three of four printed wrist mounts broke below the load the handover trials need.',
    data: { state: 'active', parts: [] },
  })
  richId = rich.record.id
  for (const [title, summary] of [
    ['Bench jig', 'Holds the mount while it is pulled.'],
    ['Load cell bench', 'Where the pulls are done and the numbers come from.'],
    ['Print queue', 'What printed each mount, and at which layer height.'],
  ] as const) {
    const made = await post('/api/records', { kind: 'module', title, summary, data: { state: 'active', parts: [] } })
    const linked = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: richId, toId: made.record.id, type: 'relates_to' }),
    })
    if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await page.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/**
 * HOW TALL THE DOCUMENT IS, AND HOW TALL THE APP INSIDE IT IS.
 *
 * `.shell` is the one thing in the flow of the page, so its height IS the content's height. Anything
 * that makes the document taller than that is something drawn at a document coordinate outside the
 * page, and the difference is the blank a reader can scroll into.
 */
async function heights(): Promise<{ document: number; content: number }> {
  return page.evaluate(() => {
    const shell = document.querySelector('.shell')
    return {
      document: document.documentElement.scrollHeight,
      content: shell === null ? -1 : Math.round(shell.getBoundingClientRect().height),
    }
  })
}

/**
 * THE TWO ANIMATION FRAMES A COMMENT'S CIRCLE NEEDS to be measured again after the page changed.
 *
 * `CommentCircle.tsx` measures where each circle goes on the animation frame after any change to
 * the document, so after two frames the circles are where the page as it now stands puts them.
 */
async function theCirclesAreMeasured(): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((done) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => done()))),
  )
}

/** Leave a comment on the card, which is what puts a mark at a document coordinate. */
async function commentOnTheCard(): Promise<void> {
  const words = 'A comment on this card, so the page has a mark to draw.'
  await page.locator(`.gx-card[data-target^="record/${richId}/"] .gx-card-title`).first().click({ button: 'right' })
  await page.getByRole('dialog', { name: 'Talk about this' }).waitFor({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Talk about this' }).locator('textarea').first().waitFor({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Talk about this' }).locator('textarea').first().fill(words)
  // KEPT IN THIS BROWSER on every change to the box (src/web/lib/drafts.ts), which is what draws the
  // mark once the composer is closed.
  await page.waitForFunction(
    (said) => (window.localStorage.getItem('mole-office.talk.drafts') ?? '').includes(said),
    words,
    { timeout: 30_000 },
  )
  await page.keyboard.press('Escape')
  await page.waitForSelector('.px-talk', { state: 'detached', timeout: 30_000 })
  await theDrawingHasSettled(page)
  await theCirclesAreMeasured()
  expect(await page.locator('.px-comment-circle').count(), 'the comment drew a mark').toBeGreaterThan(0)
}

/** Drag the drawing's background, which is how a reader moves a drawing under the window. */
async function panTheDrawing(by: number): Promise<void> {
  const at = await page.evaluate(() => {
    const box = document.querySelector('.gx-canvas')?.getBoundingClientRect()
    return box === undefined ? null : { x: Math.round(box.x + 60), y: Math.round(box.y + 40) }
  })
  if (at === null) throw new Error('the drawing has no canvas to pan')
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(at.x, at.y + (by * step) / 10, { steps: 2 })
    await page.waitForTimeout(45)
  }
  await page.mouse.up()
  await theDrawingHasSettled(page)
  await theCirclesAreMeasured()
}

for (const theme of ['light'] as const) {
  describe(`the page ends where the content ends, in ${theme}`, () => {
    it('is exactly as tall as the app, before and after the drawing is panned', async () => {
      await openTheDrawing(theme)
      await commentOnTheCard()
      const before = await heights()
      expect(before.content, 'the app is on the page').toBeGreaterThan(0)
      expect(before.document, 'the page is as tall as the app it holds').toBeLessThanOrEqual(before.content + 1)
      await panTheDrawing(900)
      const after = await heights()
      expect(after.document, 'and still is once the drawing has been panned').toBeLessThanOrEqual(after.content + 1)
    }, 240_000)

    it('keeps the sidebars where they are at the bottom of the page', async () => {
      await openTheDrawing(theme)
      await commentOnTheCard()
      await panTheDrawing(900)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      // AT THE BOTTOM OF THE PAGE, which is where the case reads the sidebar from.
      await page.waitForFunction(
        () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1,
        undefined,
        { timeout: 30_000 },
      )
      await theCirclesAreMeasured()
      const railTop = await page.evaluate(() => {
        const rail = document.querySelector('.shell-side-inner')
        // `+ 0` turns a rounded -0 into 0: a top less than half a pixel above the window is the top.
        return rail === null ? null : Math.round(rail.getBoundingClientRect().top) + 0
      })
      expect(railTop, 'the sidebar is still at the top of the window at the bottom of the page').toBe(0)
    }, 240_000)

    it('is exactly as tall as the app on a record page too', async () => {
      await page.emulateMedia({ colorScheme: theme })
      await page.goto(`${app.site}/#/record/${richId}`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await theCirclesAreMeasured()
      const now = await heights()
      expect(now.document, 'the record page is as tall as the app it holds').toBeLessThanOrEqual(now.content + 1)
    }, 240_000)
  })
}
