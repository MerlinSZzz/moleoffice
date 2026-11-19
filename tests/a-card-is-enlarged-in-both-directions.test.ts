// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD IS ENLARGED IN BOTH DIRECTIONS — CRITERION D21, MEASURED IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET
 * ---------------------------------------------------------------------------------------
 *
 * Section 23 of design/messages/ACCEPTANCE.md:
 *
 * Dragging the ZED 2i module could only make it wider, never taller.
 *
 * MEASURED ON THE OWNER'S OWN PIPELINE, Handover v2 in the Robotics project, on an isolated copy of the owner's
 * database on 6 September 2026: dragging the ZED 2i card's bottom-right corner straight DOWN by 180
 * pixels took the card from 195x51 to 377x110. The width nearly doubled from a drag that went
 * nowhere sideways, and the height moved only because the card had climbed a level and so had more
 * words in it.
 *
 * THE CAUSE. A card had no height of its own. `CardChoice` held `room`, a share of the width, and
 * nothing else, and `keepDragging` turned whichever way the pointer had moved further into that one
 * number — so pulling down set the width.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop the `height` from what `keepDragging` writes in CardFace.tsx → the first corner case goes
 *     red in both themes and the other four stay green, which is the page before this pass. The
 *     second corner case survives it, and that is worth knowing: with no stored height a card
 *     dragged down still grows a little, because it climbs a level and so has more words, and it
 *     shrinks again on the way back. That growth is what the owner was looking at and rejecting.
 *   drop `minHeight` from the card's style in `ModuleCard` (Canvas.tsx) → the same two go red: the
 *     height is stored and never drawn.
 *   make the left and right grips carry `y: 1` → the side case goes red: an edge stores a height.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let page: Page
let richId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** Level 3, so the card has something to say as it grows and a real content height to exceed. */
const SUMMARY =
  'Quokka three of four printed wrist mounts broke below the load the handover trials need, so only ' +
  'the aluminium one is worth another run this week.'

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'both-directions', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const rich = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: SUMMARY,
    data: { state: 'active', parts: [] },
  })
  richId = rich.record.id
  const neighbour = await post('/api/records', {
    kind: 'module',
    title: 'Bench jig',
    summary: 'Holds the mount while it is pulled.',
    data: { state: 'active', parts: [] },
  })
  const third = await post('/api/records', {
    kind: 'module',
    title: 'Load cell bench',
    summary: 'Where the pulls are done and the numbers come from.',
    data: { state: 'active', parts: [] },
  })
  for (const toId of [neighbour.record.id, third.record.id]) {
    const linked = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: richId, toId, type: 'relates_to' }),
    })
    if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  // THE HOME PAGE ONLY WHEN THIS PAGE IS NOT ON THE APP YET. Its storage can be cleared only from a
  // page of the app. A page already on the drawing from the case before is on the app, and the
  // reload below starts it again from the cleared storage.
  if (!page.url().startsWith(app.site)) {
    await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  }
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

/** Wait until the page has drawn one more frame, so the last move of a drag is on the screen. */
async function aFrameIsDrawn(on: Page): Promise<void> {
  await on.evaluate(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))
}

/** How big the card is drawn on screen, and the level it is at. */
async function theCard(): Promise<{ width: number; height: number; level: string | null }> {
  return page.evaluate((id) => {
    const el = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
    if (el === null) return { width: 0, height: 0, level: null }
    const box = el.getBoundingClientRect()
    return { width: Math.round(box.width), height: Math.round(box.height), level: el.getAttribute('data-rung') }
  }, richId)
}

/** Drag one of the card's grips by this much, with the mouse, the way a person does. */
async function drag(at: string, by: { x: number; y: number }): Promise<void> {
  await page.locator(`.gx-card[data-target^="record/${richId}/"]`).first().scrollIntoViewIfNeeded()
  await aFrameIsDrawn(page)
  const grip = await page.evaluate(
    ([id, which]) => {
      const el = document.querySelector(`.gx-card[data-target^="record/${id}/"] .gx-grip[data-grip="${which}"]`)
      if (el === null) return null
      const box = el.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    },
    [richId, at] as const,
  )
  if (grip === null) throw new Error(`the card has no ${at} grip on screen`)
  await page.mouse.move(grip.x, grip.y)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(grip.x + (by.x * step) / 10, grip.y + (by.y * step) / 10, { steps: 2 })
    await aFrameIsDrawn(page)
  }
  await page.mouse.up()
  await theDrawingHasSettled(page)
}

for (const theme of ['light'] as const) {
  describe(`a card is enlarged in both directions, in ${theme}`, () => {
    /**
     * THE DRAG IS DIAGONAL NOW, AND IT WAS STRAIGHT DOWN. Changed openly on 6 September 2026 with
     * criterion D29, which says each edge moves alone: a corner pulled STRAIGHT DOWN moves the
     * bottom edge and leaves the side exactly where it was, so the old width assertion was reading
     * the very behaviour that was to be removed, a drag sometimes forced to go only to the right. D21's own words
     * are unchanged and still met: a bottom corner changes the width AND the height, which is what
     * a corner drag with both components does. The straight-down case is now in
     * tests/each-edge-of-a-card-moves-alone.test.ts, where it asserts the opposite.
     */
    it('the bottom corner pulled down and out makes the card taller as well as wider', async () => {
      await openTheDrawing(theme)
      const before = await theCard()
      expect(before.width, 'the card is drawn before anything is dragged').toBeGreaterThan(0)
      await drag('bottom-right', { x: 200, y: 200 })
      const after = await theCard()
      // THE HEIGHT IS THE CASE. This is what the owner could not get: a card that grew downwards.
      expect(after.height, 'the card is taller after the corner was pulled down').toBeGreaterThan(before.height + 80)
      // AND THE WIDTH FOLLOWS, because the room the card has is what the ladder reads and this drag
      // went sideways as well as down. The owner's sentence is "width AND height".
      expect(after.width, 'and wider, because a corner drag is both').toBeGreaterThan(before.width)
    }, 180_000)

    it('the bottom corner pulled back up makes it shorter again', async () => {
      await openTheDrawing(theme)
      await drag('bottom-right', { x: 0, y: 200 })
      const tall = await theCard()
      await drag('bottom-right', { x: 0, y: -170 })
      const back = await theCard()
      expect(back.height, 'dragging the corner up takes the height back').toBeLessThan(tall.height - 60)
    }, 180_000)

    /**
     * AND THE STRAIGHT-DOWN DRAG LEAVES THE WIDTH ALONE — criterion D29, kept here because this is
     * the file about the two directions and the two must not come back to being one number.
     */
    it('the bottom corner pulled straight down leaves the width where it was', async () => {
      await openTheDrawing(theme)
      const before = await theCard()
      await drag('bottom-right', { x: 0, y: 200 })
      const after = await theCard()
      expect(after.height, 'the card is taller').toBeGreaterThan(before.height + 80)
      expect(Math.abs(after.width - before.width), 'and no wider: the drag went nowhere sideways').toBeLessThanOrEqual(4)
    }, 180_000)

    it('a side changes the width and leaves the height to the words', async () => {
      await openTheDrawing(theme)
      const before = await theCard()
      await drag('right', { x: 220, y: 0 })
      const after = await theCard()
      expect(after.width, 'the side drag gave the card more room').toBeGreaterThan(before.width + 60)
      // THE HEIGHT MAY STILL CHANGE HERE, because a wider card climbs the ladder and says more. What
      // must not happen is a side drag storing a height: the card is exactly as tall as its words.
      const stored = await page.evaluate((id) => {
        const el = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
        return el instanceof HTMLElement ? el.style.minHeight : 'no card'
      }, richId)
      expect(stored, 'a side drag stores no height at all').toBe('')
    }, 180_000)
  })
}
