// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD'S SIZE IS EXACTLY WHAT THE POINTER ASKED FOR — CRITERION D39.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED, AND WHAT WAS MEASURED BEFORE THIS
 * ---------------------------------------------------------------------------------------
 *
 * design/REVIEW-2026-09-07.md: the resize still felt the same. The card still jumped and was forced to
 * a size (from the smallest at the start to the second level, for example); dragging a corner
 * sometimes could not move it to one side, because the corner did not follow the pointer; and
 * resizing freely, following the pointer, as asked before, was not there.
 *
 * Measured in Chromium at 1440 on the owner's own Handover v2 (TEoKg5mV7egP, the Robotics project) on an
 * isolated copy of the owner's database, at the size the drawing opens at, dragging a module card's
 * bottom-right corner outwards 400 pixels in steps of 20 and back:
 *
 *   the card grew 20 pixels wide on the first step and then did not move for the remaining 380;
 *   at the end the pointer had asked for 457.9 pixels of width and the card was 78.3;
 *   that same first step also made the card 34 pixels TALLER than the pointer had asked for,
 *     because the level it crossed drew more words and the dragged height was a floor under them;
 *   dragging the right edge alone followed for 140 pixels and then held at 209.5, and coming all
 *     the way back left the card 30 pixels NARROWER than it started.
 *
 * The cause was `theTwoSharesWithinTheOneCap` in card.ts, which held the square root of the two
 * shares' product inside [0.62, 1.7] and, on a corner, scaled both sides down together.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS NOW, MEASURED THE SAME WAY
 * ---------------------------------------------------------------------------------------
 *
 *   every one of the 41 steps of that corner drag is within 3.3 pixels of the ask, out and back;
 *   the card returns to 57.9 by 15.1 where it started at 57.9 by 15.2;
 *   the right edge alone is within 1.9 pixels of the ask over 300, and moves the bottom edge by
 *     0.1 pixels instead of 38.6.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Written after the control run and the mutations were run; the report says which.
 *
 *   put the area cap back — wrap `wideNow` and `tall` in a clamp on `Math.sqrt(room * rise)` to
 *     1.7 — and the drag stops following the pointer partway through.
 *   make `sideWithin` in card.ts clamp to [44, 300] and a card cannot be dragged past 300 pixels,
 *     which is the direction-specific limit this criterion removes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let page: Page
let recordId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-cards-size-is-the-readers', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const make = async (title: string, summary: string): Promise<string> => {
    const res = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ kind: 'module', title, summary, data: { state: 'active', parts: [] } }),
    })
    if (!res.ok) throw new Error(`the module could not be made: ${await res.text()}`)
    return ((await res.json()) as { record: { id: string } }).record.id
  }
  recordId = await make(
    'Wrist camera driver',
    'Reads the wrist camera, rectifies the frames and publishes them on the bench topic. It has held ' +
      'calibration for eleven days and the drift is under a tenth of a degree, which is inside what the ' +
      'handover trials need and outside what the fixed camera manages at the same distance.',
  )
  for (const [title, summary] of [
    ['Bench jig', 'Holds the mount while it is pulled.'],
    ['Load cell bench', 'Where the pulls are done and the numbers come from.'],
  ] as const) {
    const toId = await make(title, summary)
    const linked = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: recordId, toId, type: 'relates_to' }),
    })
    if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(): Promise<void> {
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

/** The card's box on the screen, to a tenth of a pixel. */
async function box(): Promise<{ w: number; h: number }> {
  return page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="mod:${id}"]`)
    if (node === null) return { w: 0, h: 0 }
    const r = node.getBoundingClientRect()
    return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }
  }, recordId)
}

async function theGrip(at: string): Promise<{ x: number; y: number }> {
  const where = await page.evaluate(
    ([id, grip]) => {
      const el = document.querySelector(`.react-flow__node[data-id="mod:${id}"] .gx-grip[data-grip="${grip}"]`)
      if (el === null) return null
      const b = el.getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    },
    [recordId, at] as const,
  )
  if (where === null) throw new Error(`the card has no ${at} grip`)
  return where
}

/**
 * HOW FAR BEHIND THE POINTER THE CARD IS ALLOWED TO BE, in screen pixels.
 *
 * D39 says pixel for pixel and the measurement on the owner's own pipeline came to 3.3 at the worst step of
 * a 400-pixel corner drag. Three pixels is what the canvas's own rounding costs: a card's width is
 * a share of its role's width rounded to a whole layout pixel, and the layout pixel is then scaled
 * by the canvas zoom. Anything past this is the product deciding the size, which is the defect.
 */
const AS_CLOSE_AS_THE_POINTER = 4

/**
 * HOW LONG A DRAG HAS TO BE TO SAY ANYTHING ABOUT THE OLD CAP, in screen pixels.
 *
 * The cap held a card at 2.89 times its ordinary width, which this card reaches inside 300 pixels of
 * its right edge; measured before the change, the edge stopped following at 140 and was 148.4 short
 * of the ask at 300. So a drag of 300 is past everything a level asks for, and a case that could not
 * get 300 pixels of window is a case that proves nothing and says so rather than passing.
 */
const PAST_ANY_LEVELS_ASK = 300

describe("a card's size is the reader's", () => {
  it('follows a corner out 400 pixels and back, never more than four pixels behind', async () => {
    await openTheDrawing()
    const grip = await theGrip('bottom-right')
    const start = await box()
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    const worst = { out: 0, back: 0 }
    const seen: { travel: number; w: number; h: number }[] = []
    for (const phase of ['out', 'back'] as const) {
      const steps = phase === 'out' ? [20, 60, 100, 140, 180, 220, 260, 300, 340, 380, 400] : [300, 200, 100, 40, 0]
      for (const travel of steps) {
        await page.mouse.move(grip.x + travel, grip.y + travel, { steps: 2 })
        await page.waitForTimeout(160)
        const now = await box()
        seen.push({ travel, ...now })
        worst[phase] = Math.max(
          worst[phase],
          Math.abs(now.w - (start.w + travel)),
          Math.abs(now.h - (start.h + travel)),
        )
      }
    }
    await page.mouse.up()
    await theDrawingHasSettled(page)
    expect(worst.out, `pulling out, the worst step was ${String(worst.out)} px behind: ${JSON.stringify(seen)}`).toBeLessThanOrEqual(
      AS_CLOSE_AS_THE_POINTER,
    )
    expect(worst.back, `coming back, the worst step was ${String(worst.back)} px behind`).toBeLessThanOrEqual(
      AS_CLOSE_AS_THE_POINTER,
    )
    // AND IT ENDS WHERE IT BEGAN. Before this the same drag ended 30 pixels narrower than it started.
    const ended = await box()
    expect(Math.abs(ended.w - start.w), 'the card is back to the width it started at').toBeLessThanOrEqual(
      AS_CLOSE_AS_THE_POINTER,
    )
    expect(Math.abs(ended.h - start.h), 'and the height it started at').toBeLessThanOrEqual(AS_CLOSE_AS_THE_POINTER)
  }, 240_000)

  it('never stops following, however far the pointer goes past what a level asks for', async () => {
    await openTheDrawing()
    const grip = await theGrip('right')
    const start = await box()
    // AS FAR AS THE WINDOW ALLOWS, AND THE TEST SAYS HOW FAR THAT WAS.
    //
    // A POINTER OUTSIDE THE WINDOW REACHES NOTHING, so a fixed 600 pixels is a case whose result
    // depends on where the drawing happened to put this card. It passed alone and failed inside the
    // full suite for exactly that reason, which is a test measuring the machine and not the code.
    // The travel is whatever fits, the case refuses to run on a travel too short to prove anything,
    // and the number is in the message either way.
    const travel = Math.min(600, Math.floor(page.viewportSize()!.width - grip.x - 40))
    expect(travel, 'there is room in the window for a drag long enough to pass the old cap').toBeGreaterThanOrEqual(
      PAST_ANY_LEVELS_ASK,
    )
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    await page.mouse.move(grip.x + travel, grip.y, { steps: 12 })
    await page.waitForTimeout(500)
    const pulled = await box()
    await page.mouse.up()
    await theDrawingHasSettled(page)
    expect(
      Math.abs(pulled.w - (start.w + travel)),
      `${String(travel)} pixels of pointer gave ${String(Math.round(pulled.w - start.w))} pixels of card`,
    ).toBeLessThanOrEqual(AS_CLOSE_AS_THE_POINTER)
  }, 240_000)

  it('moves the edge the reader is holding and leaves the other where it is', async () => {
    await openTheDrawing()
    const grip = await theGrip('right')
    const start = await box()
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    await page.mouse.move(grip.x + 300, grip.y, { steps: 8 })
    await page.waitForTimeout(500)
    const wider = await box()
    await page.mouse.up()
    await theDrawingHasSettled(page)
    expect(wider.w, 'the right edge moved').toBeGreaterThan(start.w + 250)
    // THE BOTTOM EDGE DID NOT. Before this the level the widening crossed drew more words and the
    // card grew 38.6 pixels taller on an axis nobody was holding.
    expect(
      Math.abs(wider.h - start.h),
      `the bottom edge moved ${String(Math.round(wider.h - start.h))} pixels on a drag that only held the right one`,
    ).toBeLessThanOrEqual(AS_CLOSE_AS_THE_POINTER)
  }, 240_000)
})
