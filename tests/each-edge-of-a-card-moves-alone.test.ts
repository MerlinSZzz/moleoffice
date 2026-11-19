// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH EDGE OF A CARD MOVES ALONE — CRITERION D29, MEASURED IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET
 * ---------------------------------------------------------------------------------------
 *
 * Item 7 of design/messages/ACCEPTANCE.md section 32, on the Handover v2 pipeline:
 *
 * There is no downward drag; the bottom corners behave oddly and sometimes force the drag to the
 * right; dragging the left edge should grow the card to the LEFT; dragging one edge moves that edge
 * and no other; dragging a corner moves exactly its two adjacent edges.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, ON THE OWNER'S OWN PIPELINE
 * ---------------------------------------------------------------------------------------
 *
 * Handover v2 in Robotics, at 1440 with a mouse, on an isolated copy of the owner's database, on the ZED 2i
 * chest camera card (left 577, right 772, top 636, bottom 688):
 *
 *   grip           drag        left    right   top   bottom
 *   left           140 left       0     +141     0      +74
 *   right          140 right      0     +141     0      +74
 *   bottom-right   140 down       0     +141     0     +138
 *   bottom-left    140 down       0     +141     0     +138
 *   top / bottom   —           there was no such grip
 *
 * Every drag moved the RIGHT edge, whichever way the pointer went. The left edge never moved on any
 * of them, and the top edge never moved at all.
 *
 * TWO CAUSES. There were four grips and no top edge, no bottom edge and no top corner — the sides
 * ran from 8 pixels below the top to 12 above the bottom, so on a card 75 layout pixels tall a
 * pointer aiming at the bottom landed on a side, which holds no vertical edge. And `keepDragging`
 * set the WIDTH from `Math.abs(across) >= Math.abs(down) ? across : down`, so the width was taken
 * from whichever way the pointer had moved further.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put `Math.abs(across) >= Math.abs(down) ? across : down` back into `keepDragging`'s width in
 *     CardFace.tsx → the two corner cases go red: a corner pulled straight down widens the card.
 *   drop the `place.moveTo` call from `keepDragging` → the left-edge and top-edge cases go red: the
 *     card grows away from the pointer instead of towards it.
 *   take `top`, `bottom`, `top-left` and `top-right` out of `CARD_GRIPS` → the eight-grip case and
 *     the top and bottom cases go red.
 *   read `at` instead of `put ?? putHere` in the layout's `setNodes` in Canvas.tsx → the left-edge
 *     case goes red: a layout landing mid-drag puts the card back where ELK had it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let page: Page
let cardId = ''

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
  app = await liveApp({ name: 'edges-alone', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const rich = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: SUMMARY,
    data: { state: 'active', parts: [] },
  })
  cardId = rich.record.id
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
      body: JSON.stringify({ fromId: cardId, toId, type: 'relates_to' }),
    })
    if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * FORGET WHERE THE LAST DRAG LEFT THIS CARD, so every case starts from the layout's own answer.
 *
 * A drag that moves a card writes the place into the drawing's stored arrangement, which is shared
 * and outlives the visit — that is criterion D19 working. Without this, the second case starts on a
 * card the first one moved, the third on a card two drags have moved, and a card dragged far enough
 * ends up off the screen with no grip to take hold of.
 */
async function forgetWhereItWasLeft(): Promise<void> {
  const gone = await fetch(`${app.api}/api/presentation/structure/nodes/${cardId}`, {
    method: 'DELETE',
    headers: HEADERS,
  })
  if (!gone.ok) throw new Error(`the card's stored place could not be forgotten: ${await gone.text()}`)
}

async function openTheDrawing(on: Page, theme: 'light' | 'dark'): Promise<void> {
  await forgetWhereItWasLeft()
  await on.emulateMedia({ colorScheme: theme })
  // THE HOME PAGE ONLY WHEN THIS PAGE IS NOT ON THE APP YET. Its storage can be cleared only from a
  // page of the app. A page already on the drawing from the case before is on the app, and the
  // reload below starts it again from the cleared storage.
  if (!on.url().startsWith(app.site)) {
    await on.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  }
  await on.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await on.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
  await on.reload({ timeout: 60_000 })
  await waitForThePage(on, 60_000)
  // A NARROW SCREEN OPENS ON THE LIST AND NOT ON THE DRAWING, which is the page's own rule.
  if ((on.viewportSize()?.width ?? 1440) < 660) {
    await on.getByRole('button', { name: 'Graph' }).first().click()
  }
  await on.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(on)
}

/** Wait until the page has drawn one more frame, so the last move of a drag is on the screen. */
async function aFrameIsDrawn(on: Page): Promise<void> {
  await on.evaluate(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))
}

/** Where a card's four edges are on the screen. This is the whole measurement D29 asks for. */
interface Edges {
  left: number
  right: number
  top: number
  bottom: number
}

async function theEdges(on: Page, recordId: string): Promise<Edges> {
  const box = await on.evaluate((id) => {
    const el = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
    if (el === null) return null
    // IN PAGE COORDINATES, with the window's scroll added. On a phone the card can start below the
    // window (since plan row S2 a page in a group has its path and tabs above it), and taking hold
    // of a grip scrolls it into view; an edge measured on the screen before and after would then
    // report the scroll as a move.
    const at = el.getBoundingClientRect()
    return {
      left: Math.round(at.left + window.scrollX),
      right: Math.round(at.right + window.scrollX),
      top: Math.round(at.top + window.scrollY),
      bottom: Math.round(at.bottom + window.scrollY),
    }
  }, recordId)
  if (box === null) throw new Error(`the card for ${recordId} is not on the screen`)
  return box
}

/** Which grips this card offers, in the order they are drawn. */
async function theGrips(on: Page, recordId: string): Promise<string[]> {
  return on.evaluate((id) => {
    const el = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
    return el === null ? [] : [...el.querySelectorAll(':scope > .gx-grip')].map((g) => g.getAttribute('data-grip') ?? '?')
  }, recordId)
}

async function theGrip(on: Page, recordId: string, at: string): Promise<{ x: number; y: number }> {
  await on.locator(`.gx-card[data-target^="record/${recordId}/"]`).first().scrollIntoViewIfNeeded()
  await aFrameIsDrawn(on)
  const where = await on.evaluate(
    ([id, grip]) => {
      const el = document.querySelector(`.gx-card[data-target^="record/${id}/"] .gx-grip[data-grip="${grip}"]`)
      if (el === null) return null
      const box = el.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    },
    [recordId, at] as const,
  )
  if (where === null) throw new Error(`the card for ${recordId} has no ${at} grip on screen`)
  return where
}

/** Drag one grip by this much, with the mouse, the way a person does. */
async function drag(on: Page, recordId: string, at: string, by: { x: number; y: number }): Promise<void> {
  const grip = await theGrip(on, recordId, at)
  await on.mouse.move(grip.x, grip.y)
  await on.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await on.mouse.move(grip.x + (by.x * step) / 10, grip.y + (by.y * step) / 10, { steps: 2 })
    await aFrameIsDrawn(on)
  }
  await on.mouse.up()
  await theDrawingHasSettled(on)
}

/**
 * HOW FAR AN EDGE MAY MOVE AND STILL COUNT AS HAVING STAYED, in pixels.
 *
 * The stored room is a share rounded to a hundredth and the drawn width is that share times a whole
 * number of pixels, so the edge the drag is NOT holding lands within a pixel or two of where it was.
 * Measured on the owner's pipeline: the right edge moved by 1 pixel across a 140-pixel drag of the left one.
 */
const STAYED = 4

/** How far the edge under the pointer must move before the drag counts as having worked. */
const MOVED = 60

// DARK ONLY. This file is one of the four canary files whose dark run stays (tests/taken-out.json),
// so the light repeat is the half that goes; the cases are the same presses and the same assertions.
for (const theme of ['dark'] as const) {
  describe(`each edge of a card moves alone, in ${theme}`, () => {
    it('offers four edges and four corners', async () => {
      await openTheDrawing(page, theme)
      expect(await theGrips(page, cardId)).toEqual([
        'left',
        'right',
        'top',
        'bottom',
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right',
      ])
    }, 180_000)

    it('the left edge grows the card leftwards and the other three stay', async () => {
      await openTheDrawing(page, theme)
      const was = await theEdges(page, cardId)
      await drag(page, cardId, 'left', { x: -160, y: 0 })
      const now = await theEdges(page, cardId)
      expect(was.left - now.left, 'the left edge followed the pointer').toBeGreaterThan(MOVED)
      expect(Math.abs(now.right - was.right), 'the right edge stayed').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.top - was.top), 'the top edge stayed').toBeLessThanOrEqual(STAYED)
    }, 180_000)

    it('the right edge grows the card rightwards and the other three stay', async () => {
      await openTheDrawing(page, theme)
      const was = await theEdges(page, cardId)
      await drag(page, cardId, 'right', { x: 160, y: 0 })
      const now = await theEdges(page, cardId)
      expect(now.right - was.right, 'the right edge followed the pointer').toBeGreaterThan(MOVED)
      expect(Math.abs(now.left - was.left), 'the left edge stayed').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.top - was.top), 'the top edge stayed').toBeLessThanOrEqual(STAYED)
    }, 180_000)

    it('the bottom edge grows the card downwards and the other three stay', async () => {
      await openTheDrawing(page, theme)
      const was = await theEdges(page, cardId)
      await drag(page, cardId, 'bottom', { x: 0, y: 160 })
      const now = await theEdges(page, cardId)
      expect(now.bottom - was.bottom, 'the bottom edge followed the pointer').toBeGreaterThan(MOVED)
      expect(Math.abs(now.top - was.top), 'the top edge stayed').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.left - was.left), 'the left edge stayed').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.right - was.right), 'the right edge stayed').toBeLessThanOrEqual(STAYED)
    }, 180_000)

    it('the top edge grows the card upwards and the other three stay', async () => {
      await openTheDrawing(page, theme)
      const was = await theEdges(page, cardId)
      await drag(page, cardId, 'top', { x: 0, y: -160 })
      const now = await theEdges(page, cardId)
      expect(was.top - now.top, 'the top edge followed the pointer').toBeGreaterThan(MOVED)
      expect(Math.abs(now.bottom - was.bottom), 'the bottom edge stayed').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.left - was.left), 'the left edge stayed').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.right - was.right), 'the right edge stayed').toBeLessThanOrEqual(STAYED)
    }, 180_000)

    /**
     * THE CASE THE OWNER REPORTED, IN ONE TEST. A corner pulled straight down used to move the RIGHT edge
     * by the whole of the drag and nothing else: the drag was forced to the right.
     */
    it('a bottom corner pulled straight down moves the bottom edge and not the side', async () => {
      await openTheDrawing(page, theme)
      const was = await theEdges(page, cardId)
      await drag(page, cardId, 'bottom-right', { x: 0, y: 160 })
      const now = await theEdges(page, cardId)
      expect(now.bottom - was.bottom, 'the bottom edge followed the pointer').toBeGreaterThan(MOVED)
      expect(Math.abs(now.right - was.right), 'the right edge stayed: the drag went nowhere sideways').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.left - was.left), 'the left edge stayed').toBeLessThanOrEqual(STAYED)
    }, 180_000)

    it('the bottom-left corner pulled straight left moves the left edge and not the bottom', async () => {
      await openTheDrawing(page, theme)
      const was = await theEdges(page, cardId)
      await drag(page, cardId, 'bottom-left', { x: -160, y: 0 })
      const now = await theEdges(page, cardId)
      expect(was.left - now.left, 'the left edge followed the pointer').toBeGreaterThan(MOVED)
      expect(Math.abs(now.right - was.right), 'the right edge stayed').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.top - was.top), 'the top edge stayed').toBeLessThanOrEqual(STAYED)
    }, 180_000)

    it('a corner dragged diagonally moves exactly its two edges', async () => {
      await openTheDrawing(page, theme)
      const was = await theEdges(page, cardId)
      await drag(page, cardId, 'bottom-left', { x: -140, y: 140 })
      const now = await theEdges(page, cardId)
      expect(was.left - now.left, 'the left edge moved').toBeGreaterThan(MOVED)
      expect(now.bottom - was.bottom, 'the bottom edge moved').toBeGreaterThan(MOVED)
      expect(Math.abs(now.right - was.right), 'the right edge stayed').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.top - was.top), 'the top edge stayed').toBeLessThanOrEqual(STAYED)
    }, 180_000)

    it('the top-right corner moves the top edge and the right edge', async () => {
      await openTheDrawing(page, theme)
      const was = await theEdges(page, cardId)
      await drag(page, cardId, 'top-right', { x: 140, y: -140 })
      const now = await theEdges(page, cardId)
      expect(was.top - now.top, 'the top edge moved').toBeGreaterThan(MOVED)
      expect(now.right - was.right, 'the right edge moved').toBeGreaterThan(MOVED)
      expect(Math.abs(now.left - was.left), 'the left edge stayed').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.bottom - was.bottom), 'the bottom edge stayed').toBeLessThanOrEqual(STAYED)
    }, 180_000)
  })
}

/**
 * ON A PHONE, WITH A FINGER. The narrow width is the one the owner's rule asks for and the touch path is a
 * different one in the code: a finger has to hold the edge still for half a second before the drag
 * is armed, so a reader scrolling past a drawing does not resize a card by brushing it.
 */
describe('on a phone, the same edges move alone', () => {
  it('a finger that holds the bottom edge and pulls down moves the bottom and not the sides', async () => {
    const phone = await app.browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true })
    try {
      await openTheDrawing(phone, 'light')
      const was = await theEdges(phone, cardId)
      const grip = await theGrip(phone, cardId, 'bottom')
      const cdp = await phone.context().newCDPSession(phone)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: grip.x, y: grip.y }] })
      // THE LONG PRESS. Half a second is what the code asks for; this holds for longer so a machine
      // under load does not read as a finger that moved too soon. It stays a fixed time because the
      // page sets no mark when a finger's hold on an edge has taken (`A_LONG_PRESS` in CardFace.tsx).
      await phone.waitForTimeout(900)
      for (let step = 1; step <= 8; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: grip.x, y: grip.y + step * 18 }],
        })
        await aFrameIsDrawn(phone)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await theDrawingHasSettled(phone)
      const now = await theEdges(phone, cardId)
      expect(now.bottom - was.bottom, 'the bottom edge followed the finger').toBeGreaterThan(40)
      expect(Math.abs(now.right - was.right), 'the right edge stayed').toBeLessThanOrEqual(STAYED)
      expect(Math.abs(now.left - was.left), 'the left edge stayed').toBeLessThanOrEqual(STAYED)
    } finally {
      await phone.close()
    }
  }, 240_000)

  it('a finger that holds the bottom-left corner and pulls left moves the left edge', async () => {
    const phone = await app.browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true })
    try {
      await openTheDrawing(phone, 'light')
      const was = await theEdges(phone, cardId)
      const grip = await theGrip(phone, cardId, 'bottom-left')
      const cdp = await phone.context().newCDPSession(phone)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: grip.x, y: grip.y }] })
      // Fixed, for the same reason as the hold in the case above.
      await phone.waitForTimeout(900)
      for (let step = 1; step <= 8; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: grip.x - step * 14, y: grip.y }],
        })
        await aFrameIsDrawn(phone)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await theDrawingHasSettled(phone)
      const now = await theEdges(phone, cardId)
      expect(was.left - now.left, 'the left edge followed the finger').toBeGreaterThan(40)
      expect(Math.abs(now.right - was.right), 'the right edge stayed').toBeLessThanOrEqual(STAYED)
    } finally {
      await phone.close()
    }
  }, 240_000)
})
