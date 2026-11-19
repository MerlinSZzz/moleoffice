// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DRAGGING A CORNER MOVES BOTH THE EDGES THAT MEET THERE — CRITERION D41.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, AND WHAT WAS MEASURED BEFORE THIS
 * ---------------------------------------------------------------------------------------
 *
 * Sometimes when a corner is dragged it will not move one way, and the corner does not follow the
 * mouse.
 *
 * Measured in Chromium at 1440 on the owner's own Handover v2 (TEoKg5mV7egP, the Robotics project) on an
 * isolated copy of the owner's database, at the size the drawing opens at, dragging a module card's
 * bottom-right corner out 400 pixels in steps of 20: the card grew 20 pixels wide and 34 tall on
 * the first step and then neither side moved again over the remaining 380.
 *
 * The cause was `theTwoSharesWithinTheOneCap` in card.ts. Where a corner was held it scaled BOTH
 * shares down by one factor, so the moment their product touched the cap neither side could grow.
 * A single EDGE was not caught by this in the same way, which is why the defect looked intermittent
 * to the owner: it was the corners.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS NOW, MEASURED THE SAME WAY
 * ---------------------------------------------------------------------------------------
 *
 * Every one of the 41 steps of that corner drag is within 3.3 pixels of the pointer's ask, on both
 * axes, out and back, and the card returns to the size it started at.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Written after the control run and the mutations were run; the report says which.
 *
 *   in `keepDragging` in CardFace.tsx, read the height from the width — `const tall = wideNow` —
 *     which is a corner whose two edges are one edge.
 *   in `keepDragging`, make `across` null whenever `down` is not, so a corner sets only the height:
 *     the case that a corner moves the width goes red.
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
  app = await liveApp({ name: 'a-corner-moves-both-its-edges', viewport: { width: 1440, height: 1000 } })
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
      'calibration for eleven days and the drift is under a tenth of a degree.',
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

/** The card's box on the screen: where each of its four edges is, to a tenth of a pixel. */
async function edges(): Promise<{ left: number; right: number; top: number; bottom: number }> {
  return page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="mod:${id}"]`)
    if (node === null) return { left: 0, right: 0, top: 0, bottom: 0 }
    const r = node.getBoundingClientRect()
    const round = (n: number): number => Math.round(n * 10) / 10
    return { left: round(r.left), right: round(r.right), top: round(r.top), bottom: round(r.bottom) }
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

/** The same tolerance `a-cards-size-is-the-readers` uses, and the note there says where it comes from. */
const AS_CLOSE_AS_THE_POINTER = 4

describe('a corner moves both its edges', () => {
  it('moves the right edge and the bottom edge together, both with the pointer', async () => {
    await openTheDrawing()
    const grip = await theGrip('bottom-right')
    const start = await edges()
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    await page.mouse.move(grip.x + 240, grip.y + 180, { steps: 10 })
    await theDrawingHasSettled(page)
    const pulled = await edges()
    await page.mouse.up()
    await theDrawingHasSettled(page)
    expect(
      Math.abs(pulled.right - (start.right + 240)),
      `the right edge went ${String(Math.round(pulled.right - start.right))} pixels for 240 of pointer`,
    ).toBeLessThanOrEqual(AS_CLOSE_AS_THE_POINTER)
    expect(
      Math.abs(pulled.bottom - (start.bottom + 180)),
      `the bottom edge went ${String(Math.round(pulled.bottom - start.bottom))} pixels for 180 of pointer`,
    ).toBeLessThanOrEqual(AS_CLOSE_AS_THE_POINTER)
    // AND THE TWO EDGES NOBODY IS HOLDING STAY WHERE THEY ARE. That is criterion D29 and this drag
    // is the case that used to break it.
    expect(Math.abs(pulled.left - start.left), 'the left edge did not move').toBeLessThanOrEqual(
      AS_CLOSE_AS_THE_POINTER,
    )
    expect(Math.abs(pulled.top - start.top), 'the top edge did not move').toBeLessThanOrEqual(AS_CLOSE_AS_THE_POINTER)
  }, 240_000)

  it('keeps following both edges after a long drag, where it used to stop after 20', async () => {
    await openTheDrawing()
    const grip = await theGrip('bottom-right')
    const start = await edges()
    /**
     * AS FAR AS THE WINDOW ALLOWS, AND THE CASE SAYS HOW FAR THAT WAS.
     *
     * A POINTER OUTSIDE THE WINDOW REACHES NOTHING. A fixed 500 both across and down depends on
     * where the drawing happened to put this card: it passed alone and failed inside the full suite,
     * which is a case measuring the machine rather than the code. The travel is whatever fits, and a
     * travel too short to say anything fails rather than passing quietly.
     */
    const view = page.viewportSize()!
    const room = Math.floor(Math.min(view.width - grip.x, view.height - grip.y) - 40)
    expect(room, 'there is room in the window for a drag long enough to prove the point').toBeGreaterThanOrEqual(240)
    const far = Math.min(500, room)
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    const behind: { at: number; right: number; bottom: number }[] = []
    for (const travel of [20, 100, 200, Math.round(far * 0.6), Math.round(far * 0.8), far]) {
      await page.mouse.move(grip.x + travel, grip.y + travel, { steps: 3 })
      await theDrawingHasSettled(page)
      const now = await edges()
      behind.push({
        at: travel,
        right: Math.round(now.right - (start.right + travel)),
        bottom: Math.round(now.bottom - (start.bottom + travel)),
      })
    }
    await page.mouse.up()
    await theDrawingHasSettled(page)
    for (const step of behind) {
      expect(
        Math.abs(step.right),
        `at ${String(step.at)} pixels the right edge was ${String(step.right)} behind: ${JSON.stringify(behind)}`,
      ).toBeLessThanOrEqual(AS_CLOSE_AS_THE_POINTER)
      expect(
        Math.abs(step.bottom),
        `at ${String(step.at)} pixels the bottom edge was ${String(step.bottom)} behind`,
      ).toBeLessThanOrEqual(AS_CLOSE_AS_THE_POINTER)
    }
  }, 240_000)

  it('moves the left edge and the top edge on the corner that holds them', async () => {
    await openTheDrawing()
    const grip = await theGrip('top-left')
    const start = await edges()
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    await page.mouse.move(grip.x - 160, grip.y - 120, { steps: 8 })
    await theDrawingHasSettled(page)
    const pulled = await edges()
    await page.mouse.up()
    await theDrawingHasSettled(page)
    expect(
      Math.abs(pulled.left - (start.left - 160)),
      `the left edge went ${String(Math.round(start.left - pulled.left))} pixels for 160 of pointer`,
    ).toBeLessThanOrEqual(AS_CLOSE_AS_THE_POINTER)
    expect(
      Math.abs(pulled.top - (start.top - 120)),
      `the top edge went ${String(Math.round(start.top - pulled.top))} pixels for 120 of pointer`,
    ).toBeLessThanOrEqual(AS_CLOSE_AS_THE_POINTER)
    expect(Math.abs(pulled.right - start.right), 'the right edge did not move').toBeLessThanOrEqual(
      AS_CLOSE_AS_THE_POINTER,
    )
    expect(Math.abs(pulled.bottom - start.bottom), 'the bottom edge did not move').toBeLessThanOrEqual(
      AS_CLOSE_AS_THE_POINTER,
    )
  }, 240_000)
})
