// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD'S LEVEL STEPS UP AND BACK DOWN AT DIFFERENT SIZES — CRITERION D38.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS FOUND, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Section 12 of design/drawings/ACCEPTANCE.md:
 *
 *   once a card reached a level its area was held fixed, and the level switched all at once when the
 *   drag crossed a threshold. The feel was to be designed: the area need not be held at all, only what
 *   is shown inside, with some covering and empty space allowed — for example, the content may be 80
 *   per cent covered before it changes, and the next level comes at 120 per cent. That was an example,
 *   not a requirement.
 *
 * and, before that: narrowing the width a little sent the card back to the level before.
 *
 * A card stepped up to a word the moment its area share reached that word's own number, and back
 * down the moment it fell below it. One threshold, crossed both ways.
 *
 * Measured in Chromium at 1440 on the owner's own Handover v2 (TEoKg5mV7egP, the Robotics project) on an
 * isolated copy of the owner's database, dragging the CaP planner bridge card's right edge out 420 pixels in
 * steps of 20 and then back 840, before the change:
 *
 *   out: the card went from small to usual at 257 pixels wide and from usual to large at 417;
 *   back: it gave large up again at 397 pixels wide — TWENTY pixels below where it had reached it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS NOW, MEASURED THE SAME WAY
 * ---------------------------------------------------------------------------------------
 *
 *   out: the same two numbers, 257 and 417, because growing is unchanged;
 *   back: it holds large all the way down to 235 pixels wide — 182 below where it reached it, where
 *     it used to give it up 20 below;
 *   the smallest word is still reached by dragging, at 94 pixels wide, which is the floor;
 *   no step of the drag moved the card by nothing anywhere between 420 out and 120 back: the
 *     biggest single change over one 20-pixel step was 23 pixels and the smallest was 19. The only
 *     steps that moved the card by nothing at all were at the floor, where the card is as small as
 *     a card may be and there is nothing left to give.
 *
 * The rule: a card steps UP to a word at that word's own share — 0.62, 0.8, 1.0, 1.3, 1.7 — and
 * gives a word up only when it has been shrunk to what the word BELOW it asks for: `largest` at
 * 1.3, `large` at 1.0, `usual` at 0.8, `small` at 0.62. What it takes to hold a word is 76 to 80
 * per cent of what it took to reach it, which is the owner's 80 said with the five numbers the product
 * already has. Which threshold to use is the owner's to settle: proposal `5sWJk10yAFEf`.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `shareALevelIsLeftAt` in card.ts return the word's OWN share, which is one threshold each
 *     way → 6 of the 8 go red, with "a card that grew into a word keeps it while it is shrunk a
 *     fifth: expected 'usual' to be 'large'", "small is left below the share it is reached at:
 *     expected 0.8 to be less than 0.8" and, in the browser, "the card kept the level it grew into:
 *     expected 'usual' to be 'large'". Run.
 *   make `sizeOf` in card.ts read `sizeWordFor(sizeShareOf(choice, says))` again, so the word the
 *     card came from is ignored → 1 of the 8 goes red, the browser case, the same way. The cases
 *     above it stay green because they call `sizeWordAfter` directly, which is the rule; this is
 *     the case that says the rule is what the screen uses. Run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import {
  CARD_SIZES,
  NOTHING_PRESSED,
  LEAST_ROOM,
  shareALevelAppearsAt,
  shareALevelIsLeftAt,
  sizeOf,
  sizeWordAfter,
  sizeWordFor,
  WIDTH_AT_SIZE,
} from '../src/web/components/graph/card.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/**
 * WHAT THE FIVE CASES BELOW ASSERTED UNTIL 7 SEPTEMBER 2026, AND WHY THEY SAY OTHER NUMBERS NOW.
 *
 * The band was read off the ladder itself: a word was reached at its OWN share — 0.62, 0.8, 1.0,
 * 1.3, 1.7 — and given up at the share the word BELOW is reached at. That band is proposal
 * `5sWJk10yAFEf`, which was withdrawn because it did not do what was wanted. D40 replaces it with
 * two fractions of the AREA a word needs — appears past 0.8 of it, given
 * up below 0.6 of it — and files them as proposal `t29v9sRzAAFT`.
 *
 * The two ends of the band are still two, they are still a real band at every rung, and a card
 * still keeps the word it grew into while it is shrunk. Only the numbers moved, and the cases below
 * are the same cases with the numbers the new rule gives.
 */
describe('the level holds through a band', () => {
  it('gives a word up at three quarters of the area that revealed it, which is the owner\'s eighty per cent', () => {
    // The functions speak in the card's average side, so the area each stands for is its square.
    for (const word of CARD_SIZES.slice(1) as (typeof CARD_SIZES)[number][]) {
      expect(shareALevelAppearsAt(word) ** 2, `${word} appears past four fifths of its area`).toBeCloseTo(
        0.8 * WIDTH_AT_SIZE[word],
        6,
      )
      expect(shareALevelIsLeftAt(word) ** 2, `${word} is given up below three fifths of its area`).toBeCloseTo(
        0.6 * WIDTH_AT_SIZE[word],
        6,
      )
    }
    // THE SMALLEST WORD IS THE BOTTOM and is never given up, said as a share no card can be at.
    expect(shareALevelIsLeftAt('smallest')).toBe(Number.NEGATIVE_INFINITY)
    // WHAT IT TAKES TO HOLD A WORD, as a share of the area that revealed it: three quarters, at
    // every rung. That is the example of letting the content be 80 per cent covered before it changes.
    for (let at = 1; at < CARD_SIZES.length; at += 1) {
      const word = CARD_SIZES[at] as (typeof CARD_SIZES)[number]
      const held = shareALevelIsLeftAt(word) ** 2 / shareALevelAppearsAt(word) ** 2
      expect(held, `${word} is held to three quarters of the area that revealed it`).toBeCloseTo(0.75, 6)
    }
  })

  it('reads a card with no history from its area alone', () => {
    for (const word of CARD_SIZES) {
      expect(sizeWordAfter(WIDTH_AT_SIZE[word], null), word).toBe(sizeWordFor(WIDTH_AT_SIZE[word]))
    }
    expect(sizeOf({ ...NOTHING_PRESSED, room: 1 }, 'gist')).toBe('usual')
  })

  it('steps up as soon as the card has four fifths of the area the next word needs', () => {
    const reachesLarge = shareALevelAppearsAt('large')
    expect(sizeWordAfter(reachesLarge * 0.999, 'usual')).toBe('usual')
    expect(sizeWordAfter(reachesLarge * 1.001, 'usual')).toBe('large')
    expect(sizeWordAfter(shareALevelAppearsAt('largest') * 1.001, 'large')).toBe('largest')
    expect(sizeWordAfter(shareALevelAppearsAt('small') * 1.001, 'smallest')).toBe('small')
  })

  it('keeps the word until a quarter of the area that revealed it has gone', () => {
    const leavesLarge = shareALevelIsLeftAt('large')
    expect(sizeWordAfter(leavesLarge * 1.05, 'large'), 'a card that grew into a word keeps it while it is shrunk').toBe(
      'large',
    )
    expect(sizeWordAfter(leavesLarge * 1.001, 'large')).toBe('large')
    expect(sizeWordAfter(leavesLarge * 0.999, 'large')).toBe('usual')
    // And a card that never grew into it reads the plain answer at the same size.
    expect(sizeWordAfter(leavesLarge * 1.05, null)).toBe('usual')
    // THE SMALLEST WORD IS REACHABLE BY SHRINKING, which is what the floor of a drag lands on.
    expect(sizeWordAfter(LEAST_ROOM * 0.5, 'small')).toBe('smallest')
  })

  it('never flickers: every word is left below the size the word under it is reached at', () => {
    for (let at = 1; at < CARD_SIZES.length; at += 1) {
      const word = CARD_SIZES[at] as (typeof CARD_SIZES)[number]
      const leaves = shareALevelIsLeftAt(word)
      const reached = shareALevelAppearsAt(word)
      expect(leaves, `${word} is left below the size it is reached at`).toBeLessThan(reached)
      // THE BAND IS WIDE ENOUGH THAT ONE PIXEL CANNOT CROSS BOTH ENDS: a quarter of the area that
      // revealed the word, which is a tenth of the card's average side at the narrowest rung.
      expect(reached - leaves, `${word} has a band worth having`).toBeGreaterThan(0.09)
    }
  })

  it('gives one answer however many times it is asked, and walks a jump all the way', () => {
    for (const word of CARD_SIZES) {
      for (const share of [0.2, 0.5, 0.7, 1.0, 1.25, 1.6, 2.5]) {
        const once = sizeWordAfter(share, word)
        expect(sizeWordAfter(share, once), `${word} at ${String(share)}`).toBe(once)
      }
    }
    // A SHARE THAT JUMPED SEVERAL WORDS — a press, or a value from another visit — walks all of it.
    expect(sizeWordAfter(1.7, 'smallest')).toBe('largest')
    expect(sizeWordAfter(0.2, 'largest')).toBe('smallest')
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
  app = await liveApp({ name: 'the-level-holds-through-a-band', viewport: { width: 1440, height: 1000 } })
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
    'Reads the wrist camera, rectifies the frames and publishes them on the bench topic. It has held calibration for eleven days and the drift is under a tenth of a degree.',
  )
  // TWO NEIGHBOURS AND A LINK EACH, because the modules drawing draws a card that is joined to
  // something. This is the same fixture `a-card-is-enlarged-by-dragging-its-edge` uses.
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

/** The card's drawn width, the word it is at and the level it draws. */
async function read(): Promise<{ wide: number; size: string; level: string }> {
  return page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="mod:${id}"]`)
    if (node === null) return { wide: 0, size: '', level: '' }
    return {
      wide: Math.round(node.getBoundingClientRect().width),
      size: node.querySelector('.gx-card-at[data-size]')?.getAttribute('data-size') ?? '',
      level: node.querySelector('.gx-card-at[data-level]')?.getAttribute('data-level') ?? '',
    }
  }, recordId)
}

describe('the level holds through a band, in a browser', () => {
  it('holds the level a long way back down, where it used to drop after twenty pixels', async () => {
    await openTheDrawing()
    // SELECT THE CARD, so its own size readout is drawn at all.
    const where = await page.evaluate((id) => {
      const node = document.querySelector(`.react-flow__node[data-id="mod:${id}"]`)
      if (node === null) return null
      const r = node.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.bottom - 8) }
    }, recordId)
    if (where === null) throw new Error('the card is not on the drawing')
    await page.mouse.click(where.x, where.y)
    await theDrawingHasSettled(page)
    const grip = await page.evaluate((id) => {
      const el = document.querySelector(`.react-flow__node[data-id="mod:${id}"] .gx-grip[data-grip="right"]`)
      if (el === null) return null
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
    }, recordId)
    if (grip === null) throw new Error('the card has no right grip')

    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    /**
     * OUT A LONG WAY, THEN MOST OF THE WAY BACK.
     *
     * IT USED TO STOP AT THE FIRST STEP THAT CHANGED THE WORD and then come back to a fixed 120.
     * Under D40 a word is reached at four fifths of the area it needs rather than at the whole of
     * it, so the first change now happens inside the first hundred pixels and 120 is FURTHER OUT
     * than where the word changed — the case was comparing a size against a smaller one. Pulling to
     * a fixed 400 and coming back to 120 is the same question with both numbers known.
     */
    const started = await read()
    await page.mouse.move(grip.x + 400, grip.y, { steps: 10 })
    await page.waitForTimeout(500)
    const at = await read()
    expect(at.size, 'the card grew into a bigger word').not.toBe(started.size)
    // MOST OF THE WAY BACK. Under one threshold each way this dropped a word on the first step.
    await page.mouse.move(grip.x + 120, grip.y, { steps: 6 })
    await page.waitForTimeout(400)
    const backABit = await read()
    await page.mouse.up()
    await theDrawingHasSettled(page)
    expect(backABit.wide, 'the card followed the pointer back').toBeLessThan(at.wide)
    expect(backABit.size, 'the card kept the level it grew into').toBe(at.size)
    expect(backABit.level, 'and drew the same level').toBe(at.level)
  }, 240_000)

  it('follows the pointer at every step, in both directions', async () => {
    await openTheDrawing()
    const grip = await page.evaluate((id) => {
      const el = document.querySelector(`.react-flow__node[data-id="mod:${id}"] .gx-grip[data-grip="right"]`)
      if (el === null) return null
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
    }, recordId)
    if (grip === null) throw new Error('the card has no right grip')
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    const widths: number[] = []
    for (let gone = 20; gone <= 300; gone += 20) {
      await page.mouse.move(grip.x + gone, grip.y, { steps: 2 })
      await page.waitForTimeout(140)
      widths.push((await read()).wide)
    }
    for (let gone = 280; gone >= 60; gone -= 20) {
      await page.mouse.move(grip.x + gone, grip.y, { steps: 2 })
      await page.waitForTimeout(140)
      widths.push((await read()).wide)
    }
    await page.mouse.up()
    await theDrawingHasSettled(page)
    // EVERY STEP MOVED THE CARD. A step that moved it by nothing is a direction that is stuck, which
    // is the fault where some directions stuck as the level changed. The bar is 8 pixels for 20 of
    // pointer, which is well under the 19 to 23 measured, and leaves room for a loaded browser
    // coalescing pointer moves.
    const stuck = widths.filter((wide, at) => at > 0 && Math.abs(wide - (widths[at - 1] as number)) < 8)
    expect(stuck, 'no step of the drag left the card standing still').toEqual([])
  }, 240_000)
})
