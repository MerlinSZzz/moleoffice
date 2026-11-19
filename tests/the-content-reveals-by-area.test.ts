// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONTENT REVEALS BY AREA, AND WHAT DOES NOT FIT RUNS ON UNDER A FADE — CRITERION D40.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE RULE COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * An example, given as a suggestion and not as a requirement:
 *
 *   the area is not held to any size, only what is shown inside it; covering and blank space are
 *   both allowed: content may be 80% covered before it changes, and change to the next level only
 *   when pulled to 120%.
 *
 * The band first built from it did not do what was wanted, and the decision it was built on no
 * longer stands.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE HOLDS, IN NUMBERS
 * ---------------------------------------------------------------------------------------
 *
 * A level's content appears past 0.8 of the AREA that level needs, and is given up below 0.6 of it.
 * So a level is drawn while the card still has only four fifths of the room it wants; the fifth
 * that does not fit runs on below inside the card, under the border, with a fade at the bottom.
 * What it takes to hold a level is 0.6/0.8 — three quarters of the area that revealed it.
 *
 * Measured in Chromium at 1440 on the owner's own Handover v2 (TEoKg5mV7egP, the Robotics project) on an
 * isolated copy, at the size the drawing opens at, dragging the pipeline box's right edge — where
 * one 20-pixel step changes the area by about two per cent, so a threshold can be seen on its own:
 *
 *   the next level appeared at 1.022 times the area the box opened with, which is the first step
 *     past 0.8 of what that level needs;
 *   the box then held that level over the remaining 880 pixels out and all 900 back, ending at the
 *     area it started with — it would have to lose a further quarter of its area to give it up.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Written after the control run and the mutations were run; the report says which.
 *
 *   set `THE_SHARE_A_LEVEL_IS_LEFT_AT` to `THE_SHARE_A_LEVEL_APPEARS_AT` in card.ts, which is one
 *     threshold each way and no band at all.
 *   take `overflow: hidden` off `.gx-card[data-cut='1'] .gx-card-words` in Canvas.tsx, so a card
 *     dragged shorter than its words is as tall as its words again.
 *   take `box.scrollHeight > box.clientHeight + 1` out of `more` in CardFace.tsx, which draws the fade
 *     on every card with a height, whether anything is hidden or not (run on 15 October 2026, problem
 *     p-Llfa4C4sC5).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import {
  CARD_SIZES,
  NOTHING_PRESSED,
  shareALevelAppearsAt,
  shareALevelIsLeftAt,
  sizeOf,
  sizeWordAfter,
  THE_SHARE_A_LEVEL_APPEARS_AT,
  THE_SHARE_A_LEVEL_IS_LEFT_AT,
  WIDTH_AT_SIZE,
} from '../src/web/components/graph/card.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** The area share a card at this word has when the drawing opens it there. */
const areaNeeded = (word: (typeof CARD_SIZES)[number]): number => WIDTH_AT_SIZE[word]

describe('the content reveals by area', () => {
  it('draws a level once the card has four fifths of the area that level needs', () => {
    for (const word of CARD_SIZES.slice(1) as (typeof CARD_SIZES)[number][]) {
      // The two functions speak in the card's average side, which is the square root of the area
      // share, so the area each one stands for is the square of what it returns.
      const appearsAtArea = shareALevelAppearsAt(word) ** 2
      expect(appearsAtArea, `${word} appears at four fifths of its area`).toBeCloseTo(
        THE_SHARE_A_LEVEL_APPEARS_AT * areaNeeded(word),
        6,
      )
      const leftAtArea = shareALevelIsLeftAt(word) ** 2
      expect(leftAtArea, `${word} is given up below three fifths of its area`).toBeCloseTo(
        THE_SHARE_A_LEVEL_IS_LEFT_AT * areaNeeded(word),
        6,
      )
    }
    expect(shareALevelAppearsAt('smallest'), 'the bottom of the ladder is reached at any size').toBe(
      Number.NEGATIVE_INFINITY,
    )
    expect(shareALevelIsLeftAt('smallest'), 'and is never given up').toBe(Number.NEGATIVE_INFINITY)
  })

  it('holds a level until a quarter of the area that revealed it has gone', () => {
    for (const word of CARD_SIZES.slice(1) as (typeof CARD_SIZES)[number][]) {
      const held = shareALevelIsLeftAt(word) ** 2 / shareALevelAppearsAt(word) ** 2
      expect(held, `${word} is held to three quarters of the area that revealed it`).toBeCloseTo(0.75, 6)
    }
    // A card that grew into `large` keeps it while it loses a fifth of the area that revealed it.
    const revealedLarge = shareALevelAppearsAt('large')
    expect(sizeWordAfter(revealedLarge * 1.001, 'usual'), 'it reaches large just past the threshold').toBe('large')
    expect(sizeWordAfter(revealedLarge * 0.95, 'large'), 'and keeps it a long way back down').toBe('large')
    expect(sizeWordAfter(shareALevelIsLeftAt('large') * 0.999, 'large'), 'and gives it up below the lower share').toBe(
      'usual',
    )
  })

  it('never flickers, and never crosses two thresholds on one pixel', () => {
    for (let at = 1; at < CARD_SIZES.length; at += 1) {
      const word = CARD_SIZES[at] as (typeof CARD_SIZES)[number]
      expect(shareALevelIsLeftAt(word), `${word} is given up below the size it appears at`).toBeLessThan(
        shareALevelAppearsAt(word),
      )
      const below = CARD_SIZES[at - 1] as (typeof CARD_SIZES)[number]
      // THE BAND A CARD SITS IN: it gives up the word below at one number and takes this one at a
      // higher number, so no size can do both.
      expect(shareALevelIsLeftAt(below), `${below} is left below where ${word} appears`).toBeLessThan(
        shareALevelAppearsAt(word),
      )
    }
  })

  it('opens every card at the word the drawing opened it at, and not one higher', () => {
    // `SIZE_A_CARD_STARTS_AT` puts a card at a word's own number, and 0.8 of `usual` is exactly the
    // number `small` opens at — so an `at` rather than a `past` opened every level-2 drawing one
    // level higher. Measured on the owner's pipeline before this was `past`: the box opened at R6, not R4.
    for (const word of CARD_SIZES) {
      expect(sizeOf({ ...NOTHING_PRESSED, room: WIDTH_AT_SIZE[word] }, 'gist'), word).toBe(word)
    }
  })
})

// ============================================================ and the same thing in a real browser

let app: LiveApp
let page: Page
let recordId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-content-reveals-by-area', viewport: { width: 1440, height: 1000 } })
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
      'handover trials need and well outside what the fixed camera manages at the same distance, so the ' +
      'wrist mount is the one the trials will use until somebody measures the fixed one again.',
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

/** The card's box, whether its words are cut, whether the fade is drawn, and the drawing's zoom. */
async function read(): Promise<{ h: number; cut: boolean; fade: boolean; hidden: number; zoom: number }> {
  return page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="mod:${id}"]`)
    const card = node?.querySelector('.gx-card') ?? null
    const words = node?.querySelector('.gx-card-words') ?? null
    if (node === null || card === null || words === null) return { h: 0, cut: false, fade: false, hidden: 0, zoom: 1 }
    return {
      h: Math.round(node.getBoundingClientRect().height * 10) / 10,
      cut: card.getAttribute('data-cut') === '1',
      fade: words.getAttribute('data-more') === '1',
      // HOW MUCH OF THE WORDS IS BELOW THE BOTTOM OF THE BOX THEY ARE IN.
      hidden: Math.max(0, words.scrollHeight - words.clientHeight),
      // HOW MANY PIXELS ON THE SCREEN ONE OF THE LAYOUT'S PIXELS IS. `hidden` is in the layout's.
      zoom: node.getBoundingClientRect().height / (card as HTMLElement).offsetHeight,
    }
  }, recordId)
}

/** Press the card's bottom grip, pull it down this many pixels on the screen, let go, and wait. */
async function pullTheBottomDown(by: number): Promise<void> {
  const grip = await page.evaluate((id) => {
    const el = document.querySelector(`.react-flow__node[data-id="mod:${id}"] .gx-grip[data-grip="bottom"]`)
    if (el === null) return null
    const b = el.getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }, recordId)
  if (grip === null) throw new Error('the card has no bottom grip')
  await page.mouse.move(grip.x, grip.y)
  await page.mouse.down()
  await page.mouse.move(grip.x, grip.y + by, { steps: 8 })
  await page.waitForTimeout(500)
  await page.mouse.up()
  await theDrawingHasSettled(page)
}

describe('the content reveals by area, in a browser', () => {
  it('cuts what does not fit and draws a fade over it, instead of growing the card', async () => {
    await openTheDrawing()
    const grip = await page.evaluate((id) => {
      const el = document.querySelector(`.react-flow__node[data-id="mod:${id}"] .gx-grip[data-grip="right"]`)
      if (el === null) return null
      const b = el.getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }, recordId)
    if (grip === null) throw new Error('the card has no right grip')
    const before = await read()
    expect(before.cut, 'a card nobody has dragged has no height of its own').toBe(false)
    expect(before.fade, 'and no fade').toBe(false)

    // WIDEN IT FAR ENOUGH TO CROSS A LEVEL. The bottom edge is not held, so D39 pins it where it is
    // and the level's extra words have nowhere to go but under the fade.
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    await page.mouse.move(grip.x + 300, grip.y, { steps: 8 })
    await page.waitForTimeout(500)
    await page.mouse.up()
    await theDrawingHasSettled(page)
    const after = await read()
    expect(after.cut, 'the card now has a height of its own').toBe(true)
    expect(
      Math.abs(after.h - before.h),
      `the card grew ${String(Math.round(after.h - before.h))} pixels taller on an axis nobody held`,
    ).toBeLessThanOrEqual(4)
    expect(after.hidden, 'the words that do not fit run on below inside the card').toBeGreaterThan(0)
    expect(after.fade, 'and the fade says there is more').toBe(true)
  }, 240_000)

  it('draws no fade where nothing is hidden', async () => {
    await openTheDrawing()
    // PULL IT TALLER THAN ITS WORDS. Blank space is allowed, as covering is, and a
    // fade over blank space would say there is more when there is not.
    //
    // HOW FAR THAT IS, IS THE FONT'S DOING, SO IT IS MEASURED (problem p-Llfa4C4sC5). The pull gives the
    // card the area of the next level, so the words it has to be taller than are that level's. After a
    // pull of 260 pixels they filled 300 of the card's 300 pixels in this sandbox's font, and ran on 68
    // pixels past it in the mono font Settings offers, under a fade; on the merge machine of 15 October
    // they ran on 11. So the card is pulled again by what is still hidden. If that reveals a level that
    // runs on again, it is pulled again; a level that never fits fails below with what is still hidden.
    await pullTheBottomDown(260)
    let after = await read()
    for (let again = 0; again < 3 && after.hidden > 0; again += 1) {
      await pullTheBottomDown(Math.ceil(after.hidden * after.zoom) + 20)
      after = await read()
    }
    expect(after.cut, 'the card has a height of its own').toBe(true)
    expect(after.hidden, 'and nothing is hidden').toBe(0)
    expect(after.fade, 'so there is no fade').toBe(false)
  }, 240_000)
})
