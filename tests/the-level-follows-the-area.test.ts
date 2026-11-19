// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READING LEVEL FOLLOWS THE AREA, AND NEITHER SIDE IS CAPPED ON ITS OWN — CRITERION D33.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS FOUND, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Section 11 of design/drawings/ACCEPTANCE.md, defect 3:
 *
 *   a card dragged to its set width could grow no wider, yet it could grow downward without end;
 *   after a long drag down, narrowing it a little sent it back to the level before, and some
 *   directions stuck when the level changed. A drag should change the size freely, with nothing
 *   sticking. The question was whether the level was bound to the width rather than the area.
 *
 * Measured in Chromium at 1440, zoom 0.85, on the owner's CaP planner bridge card, before the fix:
 *
 *   the width stopped at 417 screen pixels after 210 pixels of corner drag and never grew again
 *     over the next 510;
 *   the height went on growing to 646 screen pixels;
 *   narrowing the right edge by 120 pixels after that changed nothing at all — not the width, not
 *     the height, not the level.
 *
 * The cause, in the code: `sizeWordFor(roomOf(choice))` picked the level from the width share and
 * nothing else, `roomWithin` held the width inside [0.62, 1.7] while `heightWithin` held the height
 * inside [44, 760] — two ranges in two currencies, neither knowing about the other — and both sides
 * were worked out from where the drag started, so a drag past a cap had to travel all the way back
 * before anything moved.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS NOW, MEASURED THE SAME WAY
 * ---------------------------------------------------------------------------------------
 *
 *   the width alone reaches 707 screen pixels, which is 2.89 times the ordinary width — the one cap
 *     on the area, spent entirely on one side;
 *   the height alone takes the card from level 2 to level 3 with the width untouched;
 *   narrowing after a tall pull moves the width on the first step and does not change the level.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `sizeShareOf` in card.ts return `roomOf(choice, says)` again → 3 of the 11 go red, with
 *     "and so does the height alone: expected 'usual' to be 'largest'" and "and it says more than
 *     it did: expected 'title' not to be 'title'". Run.
 *   drop the width re-anchor block from `keepDragging` in CardFace.tsx → 2 of the 11 go red, with
 *     "the card came back on the way back: expected 832 to be less than 827". Run.
 *
 * AND ONE THING THAT IS NOT A MUTATION PROOF, SAID HERE RATHER THAN LEFT OUT. Dropping BOTH
 * re-anchor blocks left the corner-drag version of that case green, which is why the case drags one
 * EDGE. A corner holds both sides, the cap moves them together, and the card follows the pointer
 * whatever the anchor does; only a single edge shows the anchor doing its work.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import {
  LEAST_ON_ONE_AXIS,
  MOST_ON_ONE_AXIS,
  MOST_ROOM,
  NOTHING_PRESSED,
  riseOf,
  roomForSize,
  sizeOf,
  sizeShareOf,
  sideWithin,
  LEAST_SIDE,
  A_SIDE_AT_MOST,
  WIDTH_AT_SIZE,
} from '../src/web/components/graph/card.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

describe('the level follows the area', () => {
  it('reads a card nobody has dragged as the size the drawing opens it at', () => {
    expect(riseOf(NOTHING_PRESSED)).toBe(1)
    expect(sizeShareOf({ ...NOTHING_PRESSED, room: 1 }, 'gist')).toBe(1)
    expect(sizeOf({ ...NOTHING_PRESSED, room: 1 }, 'gist')).toBe('usual')
  })

  it('lets the height alone raise the level, which the width alone used to do', () => {
    const wide = { ...NOTHING_PRESSED, room: WIDTH_AT_SIZE.largest * WIDTH_AT_SIZE.largest }
    const tall = { ...NOTHING_PRESSED, room: 1, height: 200, rise: WIDTH_AT_SIZE.largest * WIDTH_AT_SIZE.largest }
    expect(sizeOf(wide, 'gist'), 'the width alone reaches the largest word').toBe('largest')
    expect(sizeOf(tall, 'gist'), 'and so does the height alone').toBe('largest')
  })

  it('counts the two sides together, so half of each is the same as all of one', () => {
    const both = { ...NOTHING_PRESSED, room: MOST_ROOM, height: 200, rise: MOST_ROOM }
    expect(sizeShareOf(both, 'gist')).toBeCloseTo(MOST_ROOM, 6)
    expect(sizeOf(both, 'gist')).toBe('largest')
  })

  /**
   * WHAT THE TWO CASES HERE ASSERTED UNTIL 7 SEPTEMBER 2026, AND WHY THEY SAY THE OPPOSITE NOW.
   *
   * They were "holds one cap on the area and never one on a side" and "holds a floor the same way",
   * and they asserted that `theTwoSharesWithinTheOneCap` held the square root of the two shares'
   * product inside [0.62, 1.7], a corner giving way on both sides in the same proportion. That cap
   * is exactly what D39 removes, because free resizing that follows the pointer had not been built.
   * The function is gone, so the cases that asserted it cannot stand, and what replaces them
   * asserts the rule that took its place: one floor and one ceiling, in pixels, per side.
   */
  it('holds one floor and one ceiling in pixels, and neither side limits the other', () => {
    expect(sideWithin(1000)).toBe(1000)
    expect(sideWithin(3578), 'the owner\'s own box is inside the range at its own size').toBe(3578)
    expect(sideWithin(9000), 'and so is a box dragged well past it').toBe(9000)
    expect(sideWithin(1), 'a side cannot be dragged to nothing').toBe(LEAST_SIDE)
    expect(sideWithin(999_999), 'and cannot be stored at a size nothing can place').toBe(A_SIDE_AT_MOST)
    // NOTHING HERE READS THE OTHER AXIS, and that is the whole of D39 and D41: a side is a function
    // of its own edge's travel, so no amount of pulling one side can stop the other from moving.
    expect(sideWithin.length, 'a side is worked out from one number and nothing else').toBe(1)
  })

  it('reads a share as large as a drag can now produce, rather than throwing it away', () => {
    // A card dragged to several times its role width, or a box to nine thousand pixels, is at a
    // share far outside the old [0.3844, 2.89]. Those were read as "nobody has touched this", which
    // is the silent fallback the invariants ban.
    expect(riseOf({ ...NOTHING_PRESSED, height: 200, rise: 9 })).toBe(9)
    expect(riseOf({ ...NOTHING_PRESSED, height: 200, rise: MOST_ON_ONE_AXIS })).toBe(MOST_ON_ONE_AXIS)
  })

  /**
   * WHAT THIS CASE ASSERTED UNTIL 7 SEPTEMBER 2026: that a press for a word put the card's average
   * side at that word's own number, which is an AREA of the word squared. D40 makes a word an area,
   * so a press puts the card at the word's own number of AREA, and this case says that instead.
   * Nothing about the two buttons changed: they still step by word at whatever height the card has.
   */
  it('steps the two buttons by word at whatever height the card already has', () => {
    for (const rise of [1, 1.3, MOST_ROOM]) {
      for (const word of ['smallest', 'small', 'usual', 'large', 'largest'] as const) {
        const room = roomForSize(word, rise)
        // A word the height alone has already passed cannot be reached by the width, and the answer
        // is the width held at its floor rather than a share outside the range.
        if (room > LEAST_ON_ONE_AXIS && room < MOST_ON_ONE_AXIS) {
          expect(room * rise, `${word} at rise ${String(rise)}`).toBeCloseTo(WIDTH_AT_SIZE[word], 6)
        }
      }
    }
  })

  it('reads a stored share that is out of range as no change at all', () => {
    expect(riseOf({ ...NOTHING_PRESSED, height: 200, rise: A_SIDE_AT_MOST })).toBe(1)
    expect(riseOf({ ...NOTHING_PRESSED, height: 200, rise: Number.NaN })).toBe(1)
    expect(riseOf({ ...NOTHING_PRESSED, height: 200, rise: null })).toBe(1)
  })
})

// ============================================================ and the same thing in a real browser

/**
 * THE ARITHMETIC ABOVE IS NOT THE DEFECT THE OWNER MET. The owner met a card under their hand that would not go
 * wider and would not come back, so the two cases below are a mouse on a card at 1440.
 */
describe('a card is dragged in a browser', () => {
  let app: LiveApp
  let page: Page
  let moduleId = ''

  beforeAll(async () => {
    app = await liveApp({ name: 'the-level-follows-the-area', viewport: { width: 1440, height: 1000 } })
    page = app.page
    const headers = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
    const made = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'module',
        title: 'Wrist mount pull rig',
        summary:
          'Three of four printed wrist mounts broke below the load the handover trials need, so only ' +
          'the aluminium one is worth another run this week.',
        data: { state: 'active', parts: [] },
      }),
    })
    if (!made.ok) throw new Error(`the module could not be filed: ${await made.text()}`)
    moduleId = ((await made.json()) as { record: { id: string } }).record.id
    // TWO NEIGHBOURS AND A LINE. A drawing with one card and no lines is not the drawing the owner was
    // looking at, and the canvas does not settle on one.
    for (const [title, summary] of [
      ['Bench jig', 'Holds the mount while it is pulled.'],
      ['Load cell bench', 'Where the pulls are done and the numbers come from.'],
    ] as const) {
      const other = await fetch(`${app.api}/api/records`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'module', title, summary, data: { state: 'active', parts: [] } }),
      })
      if (!other.ok) throw new Error(`the neighbour could not be filed: ${await other.text()}`)
      const neighbour = ((await other.json()) as { record: { id: string } }).record.id
      const linked = await fetch(`${app.api}/api/links`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fromId: moduleId, toId: neighbour, type: 'relates_to' }),
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

  /** The card's box on screen and the level it is drawn at. */
  async function theCard(): Promise<{ w: number; h: number; level: string | null }> {
    const at = await page.evaluate((id) => {
      const el = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
      if (el === null) return null
      const box = el.getBoundingClientRect()
      return { w: Math.round(box.width), h: Math.round(box.height), level: el.getAttribute('data-rung') }
    }, moduleId)
    if (at === null) throw new Error('the card is not on the drawing')
    return at
  }

  async function dragTheGrip(which: string, by: { x: number; y: number }, steps = 12): Promise<void> {
    const grip = await page.evaluate(
      ([id, what]) => {
        const el = document.querySelector(`.gx-card[data-target^="record/${id}/"] .gx-grip[data-grip="${what}"]`)
        if (el === null) return null
        const box = el.getBoundingClientRect()
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      },
      [moduleId, which] as const,
    )
    if (grip === null) throw new Error(`the card has no ${which} grip on screen`)
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    for (let step = 1; step <= steps; step += 1) {
      await page.mouse.move(grip.x + (by.x * step) / steps, grip.y + (by.y * step) / steps, { steps: 2 })
      await page.waitForTimeout(40)
    }
    await page.mouse.up()
    await theDrawingHasSettled(page)
  }

  // LIGHT ONLY. A drag and the level it reaches do not depend on the colour scheme.
  for (const theme of ['light'] as const) {
    it(`the height alone takes the card up a level, in ${theme}`, async () => {
      await openTheDrawing(theme)
      const before = await theCard()
      await dragTheGrip('bottom', { x: 0, y: 260 })
      const after = await theCard()
      expect(after.w, 'the width was not touched').toBeCloseTo(before.w, -1)
      expect(after.h, 'the card is taller').toBeGreaterThan(before.h)
      expect(after.level, 'and it says more than it did').not.toBe(before.level)
    }, 240_000)

    /**
     * THE STICKINESS IS INSIDE ONE DRAG, so this is one drag: out past the cap, then back, without
     * the pointer coming up. Before the fix both sides were worked out from where the drag started,
     * so the first 500 pixels of coming back moved nothing at all.
     */
    it(`a drag that goes past the cap comes back on the first pixel, in ${theme}`, async () => {
      await openTheDrawing(theme)
      const grip = await page.evaluate(
        (id) => {
          const el = document.querySelector(`.gx-card[data-target^="record/${id}/"] .gx-grip[data-grip="right"]`)
          if (el === null) return null
          const box = el.getBoundingClientRect()
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        },
        moduleId,
      )
      if (grip === null) throw new Error('the card has no right grip on screen')
      // ONE EDGE AND NOT A CORNER. A corner holds both sides, so the cap moves them together and
      // the card follows the pointer whatever the anchor does. One edge is where the anchor is the
      // only thing that can bring the card back.
      await page.mouse.move(grip.x, grip.y)
      await page.mouse.down()
      // OUT, far past the cap.
      for (let step = 1; step <= 12; step += 1) {
        await page.mouse.move(grip.x + step * 60, grip.y, { steps: 2 })
        await page.waitForTimeout(35)
      }
      await page.waitForTimeout(400)
      const far = await theCard()
      // AND BACK, a little, with the pointer still down.
      for (let step = 1; step <= 5; step += 1) {
        await page.mouse.move(grip.x + 720 - step * 24, grip.y, { steps: 2 })
        await page.waitForTimeout(45)
      }
      await page.waitForTimeout(400)
      const back = await theCard()
      await page.mouse.up()
      await theDrawingHasSettled(page)
      expect(back.w, 'the card came back on the way back').toBeLessThan(far.w - 5)
      expect(back.level, 'and the level did not flip').toBe(far.level)
    }, 240_000)
  }
})
