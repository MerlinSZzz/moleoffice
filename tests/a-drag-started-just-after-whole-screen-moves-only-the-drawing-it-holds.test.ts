// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DRAG STARTED JUST AFTER WHOLE SCREEN MOVES ONLY THE DRAWING IT HOLDS. Wave 13u round 232.
 *
 * THE FAULT THIS CRITERION NAMES: Whole screen widens the frame and starts a new drawing of the same pipeline about
 * 40 ms after the press. That drawing is laid out for the wider frame and is shown 340 to 404 ms after it starts. A
 * drag that begins in that gap and passes the 4 px threshold is carried into the new drawing by src/web/components/
 * graph/lanes/LanesDrawing.tsx, and the view the drag placed on the old drawing is put on the new layout as well, so
 * cards the reader never touched jump elsewhere. The supervisor's decision of 17 November 2026 on a drag during a
 * change of width is: a drawing laid out for another width than the one being dragged waits, hidden, until the drag is
 * released or cancelled, and is then shown at its own fit; a view the reader placed is put only on a drawing laid out
 * for the same width. The made-up office and its waits are in tests/a-made-up-office-drawn-in-lanes.ts. Finding an
 * empty place and reading every card's place are copied from
 * tests/the-lanes-drawing-pans-and-keeps-card-presses.test.ts.
 *
 * HOW A CASE IS LAID OUT, on the master's lanes opened afresh at 1440 by 1000 in light, as
 * tests/a-lanes-drag-carries-on-when-the-next-drawing-is-shown.test.ts does:
 *   1. it waits until the lanes are drawn and nothing is being drawn (data-being-drawn), and marks the drawing shown;
 *   2. it presses Whole screen with a real mouse press and waits until a new drawing has been started (data-being-drawn
 *      is set) while the marked drawing is still the one shown. If the marked drawing has already left the page, the
 *      case fails and says the gap was missed: it never passes in that case;
 *   3. it reads every card's place now, after the frame has widened: the places at the press;
 *   4. it presses on the drawing and moves 60 px right and 40 px down in 4 steps with the button held. After each step
 *      every card shown is at its place at the press plus the movement so far, within 2 px;
 *   5. with the button still held it waits up to 20 seconds until either the new drawing has been shown, or the page
 *      says a drawing is waiting for the drag. THE FLAG IT READS IS data-waits-for-the-drag ON THE ELEMENT THAT HOLDS
 *      THE DRAWINGS, the slot with class lanes-slot. It then moves on to 120 px right and 80 px down in all, in 4 more
 *      steps, and after each step every card shown is at its place at the press plus the movement so far, within 2 px;
 *   6. it releases. Once the new drawing is shown and nothing is being drawn, every card is within 2 px of its place
 *      in a drawing opened at 1440 by 1000 in a fresh navigation, put on the whole screen with no drag, and drawn.
 *      That reference is read once in the beforeAll hook.
 *
 * WHAT IS PROVED, case by case:
 *   1. a drag that starts on an empty place, with nothing selected;
 *   2. a drag that starts on a card, with nothing selected; after it, nothing is selected.
 *
 * RED UNTIL THE CODE: at the cut f10a1a36b every case is red at 5, because the new drawing is shown under the button
 * while it is held and its cards are laid out for the wider frame.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { ElementHandle } from 'playwright'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, PROJECT, buildTheMadeUpOffice, openThePage, openTheWholeScreen, prepareThePage, theDrawingHoldsStill, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'

/** How far the first part of the drag goes, and how far the whole drag goes. */
const FIRST = { x: 60, y: 40 }
const ALL = { x: 120, y: 80 }
/** How long a case waits for a drawing, and for the page to say a drawing waits for the drag. */
const SHOWN_WITHIN = 30_000
const WAITING_WITHIN = 20_000

let app: LiveApp
let office: MadeUpOffice
/** Every card's place in a drawing opened fresh at 1440 by 1000, put on the whole screen with no drag, and drawn. */
let reference: Map<string, { x: number; y: number }>
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-drag-just-after-whole', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
  await openThePage(app, pipelinePath(office.id.master!))
  await theDrawingIsDrawn(app.page)
  await nothingIsBeingDrawn('while the reference drawing was opened')
  await openTheWholeScreen(app.page)
  await nothingIsBeingDrawn('while the reference whole-screen drawing was opened')
  reference = await placesById()
}, 300_000)
afterAll(async () => { await app?.stop() }, 120_000)

async function nothingIsBeingDrawn(when: string) {
  const still = await app.page.waitForFunction(() => document.querySelector('[data-being-drawn]') === null, null, { timeout: SHOWN_WITHIN })
    .then(() => false, () => true)
  expect(still, `${when}: a drawing was still being drawn (data-being-drawn) after ${SHOWN_WITHIN / 1000} seconds`).toBe(false)
}
async function open() {
  await openThePage(app, pipelinePath(office.id.master!))
  await theDrawingIsDrawn(app.page)
  await nothingIsBeingDrawn('after the page was opened')
  await theDrawingHoldsStill(app.page)
}
/**
 * Every card the reader can see, by id, in the drawings on the page. A drawing being replaced is hidden beside the one
 * shown, so its cards are left out; only the drawing on screen is read.
 */
async function placesById(): Promise<Map<string, { x: number; y: number }>> {
  const places = await app.page.evaluate((selector) => [...document.querySelectorAll(`${selector} .e-card`)]
    .filter(card => getComputedStyle(card).visibility !== 'hidden')
    .map(card => {
      const box = card.getBoundingClientRect()
      return { id: (card as HTMLElement).dataset.id ?? '', x: box.x, y: box.y }
    }), DRAWING)
  return new Map(places.map(place => [place.id, { x: place.x, y: place.y }]))
}
async function movedAll(before: Map<string, { x: number; y: number }>, by: { x: number; y: number }, when: string) {
  const after = await placesById()
  expect(after.size, `${when}: the number of cards shown`).toBe(before.size)
  for (const [id, place] of before) {
    const now = after.get(id)
    expect(now, `${when}: card ${id} is shown`).not.toBeUndefined()
    expect(Math.abs(now!.x - place.x - by.x), `${when}: ${id} moved ${(now!.x - place.x).toFixed(1)} px right, not ${by.x}`).toBeLessThanOrEqual(2)
    expect(Math.abs(now!.y - place.y - by.y), `${when}: ${id} moved ${(now!.y - place.y).toFixed(1)} px down, not ${by.y}`).toBeLessThanOrEqual(2)
  }
}
async function empty() {
  const p = await app.page.evaluate(() => {
    const frame = document.querySelector('.e-frame')!.getBoundingClientRect()
    for (let y = Math.max(10, frame.top + 15); y < Math.min(innerHeight - 100, frame.bottom - 100); y += 12) {
      for (let x = Math.max(10, frame.left + 15); x < Math.min(innerWidth - 140, frame.right - 140); x += 12) {
        const el = document.elementFromPoint(x, y)
        if (el && el.closest('.e-frame') && !el.closest('.e-card, a, button, .e-key, .e-path, .e-pill')) return { x, y }
      }
    }
    return null
  })
  expect(p, 'an empty place in the frame').not.toBeNull()
  return p!
}
/**
 * A place on a card the reader can see now, that is the card and not its title. It does not scroll: the places at
 * the press are read before it, and a scroll would move every card away from them. Copied from aPlaceOnTheCard in
 * tests/a-made-up-office-drawn-in-lanes.ts, without the scroll into view.
 */
async function aPlaceOnTheCardShownNow(recordId: string): Promise<{ x: number; y: number }> {
  const place = await app.page.evaluate(({ selector, id }) => {
    const card = [...document.querySelectorAll(`${selector} .e-card[data-id="${CSS.escape(id)}"]`)]
      .find(each => getComputedStyle(each).visibility !== 'hidden')
    if (card === undefined) return null
    const box = card.getBoundingClientRect()
    for (const down of [0.85, 0.7, 0.5, 0.3, 0.15]) {
      for (const across of [0.15, 0.3, 0.5, 0.7, 0.85]) {
        const x = box.left + box.width * across
        const y = box.top + box.height * down
        const hit = document.elementFromPoint(x, y)
        if (hit !== null && card.contains(hit) && hit.closest('a, .e-title') === null) return { x, y }
      }
    }
    return null
  }, { selector: DRAWING, id: recordId })
  expect(place, `a place on card ${recordId} that is not its title`).not.toBeNull()
  return place!
}
/** Presses Whole screen and waits for the new drawing to be started while the marked drawing is still the one shown. */
async function wholeScreenStartsADrawingBesideTheOneShown(shown: ElementHandle): Promise<void> {
  await app.page.getByRole('button', { name: 'Whole screen', exact: true }).click()
  const caught = await app.page.waitForFunction((marker) => {
    if (!marker.isConnected) return 'the new drawing was shown before the gap was seen'
    return document.querySelector('[data-being-drawn]') !== null ? 'the gap was caught' : false
  }, shown, { timeout: 10_000 }).then(handle => handle.jsonValue(), () => 'no new drawing was started within 10 seconds')
  expect(caught, `${String(caught)}: Whole screen widens the frame and starts a new drawing; the case must catch the gap`).toBe('the gap was caught')
}

/**
 * Waits up to 20 seconds, with the button still held, until the marked drawing has left the page for a new one, or the
 * page says a drawing waits for the drag. Says which of the two happened, or that neither did.
 */
async function theNewDrawingIsShownOrWaits(shown: ElementHandle): Promise<string> {
  return app.page.evaluate(({ marker, within }) => new Promise<string>(resolve => {
    const state: { observer: MutationObserver | null; limit: number } = { observer: null, limit: 0 }
    const settle = (said: string) => {
      state.observer?.disconnect()
      window.clearTimeout(state.limit)
      resolve(said)
    }
    const look = () => {
      if (!marker.isConnected) { settle('the new drawing was shown'); return }
      if (document.querySelector('[data-waits-for-the-drag]') !== null) settle('a drawing waits for the drag')
    }
    state.observer = new MutationObserver(look)
    state.observer.observe(document.body, { subtree: true, childList: true, attributes: true })
    state.limit = window.setTimeout(() => settle('neither'), within)
    look()
  }), { marker: shown, within: WAITING_WITHIN })
}

/** Drags from `p`, checks each step against the places at the press, and returns once the button is released. */
async function dragPastTheGap(p: { x: number; y: number }, atThePress: Map<string, { x: number; y: number }>, shown: ElementHandle) {
  await app.page.mouse.move(p.x, p.y)
  await app.page.mouse.down()
  try {
    for (let step = 1; step <= 4; step++) {
      await app.page.mouse.move(p.x + FIRST.x * step / 4, p.y + FIRST.y * step / 4)
      await movedAll(atThePress, { x: FIRST.x * step / 4, y: FIRST.y * step / 4 }, `after the first part of the drag, step ${step}`)
    }
    const outcome = await theNewDrawingIsShownOrWaits(shown)
    expect(outcome, `with the button still held, within ${WAITING_WITHIN / 1000} seconds the new drawing is shown or the page says it waits for the drag`).not.toBe('neither')
    for (let step = 1; step <= 4; step++) {
      await app.page.mouse.move(p.x + FIRST.x + (ALL.x - FIRST.x) * step / 4, p.y + FIRST.y + (ALL.y - FIRST.y) * step / 4)
      await movedAll(atThePress, { x: FIRST.x + (ALL.x - FIRST.x) * step / 4, y: FIRST.y + (ALL.y - FIRST.y) * step / 4 }, `after the second part of the drag, step ${step}`)
    }
  } finally {
    await app.page.mouse.up()
  }
}

/** Waits until the marked drawing has left the page, one drawing is shown in its place, and nothing is being drawn. */
async function theNewDrawingIsShown(shown: ElementHandle) {
  const shownNow = await app.page.waitForFunction((marker) => !marker.isConnected
    && document.querySelector('[data-being-drawn]') === null
    && document.querySelectorAll('[data-drawing="lanes"]').length === 1, shown, { timeout: SHOWN_WITHIN })
    .then(() => true, () => false)
  expect(shownNow, `the new drawing left the page and took the place of the one shown at the press, with nothing being drawn, within ${SHOWN_WITHIN / 1000} seconds`).toBe(true)
}
async function atItsOwnFit() {
  const after = await placesById()
  expect(after.size, 'the number of cards after the drag').toBe(reference.size)
  for (const [id, place] of reference) {
    const now = after.get(id)
    expect(now, `card ${id} is shown in the new drawing`).not.toBeUndefined()
    expect(Math.abs(now!.x - place.x), `${id} is ${Math.abs(now!.x - place.x).toFixed(1)} px from its own fit left and right`).toBeLessThanOrEqual(2)
    expect(Math.abs(now!.y - place.y), `${id} is ${Math.abs(now!.y - place.y).toFixed(1)} px from its own fit up and down`).toBeLessThanOrEqual(2)
  }
}
/** The drawing shown now, marked so a case can say later whether it is still the one shown. */
async function theDrawingShownNow(): Promise<ElementHandle> {
  return (await app.page.locator(DRAWING).elementHandle())!
}

it('a drag started on an empty place just after Whole screen moves only the drawing it holds', async () => {
  await open()
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBeNull()
  const shown = await theDrawingShownNow()
  await wholeScreenStartsADrawingBesideTheOneShown(shown)
  const atThePress = await placesById()
  const p = await empty()
  await dragPastTheGap(p, atThePress, shown)
  await theNewDrawingIsShown(shown)
  await atItsOwnFit()
  expect(await app.page.locator(DRAWING).getAttribute('data-selected'), 'nothing is selected after the drag').toBeNull()
}, 180_000)
it('a drag started on a card just after Whole screen moves only the drawing it holds, and selects nothing', async () => {
  await open()
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBeNull()
  const shown = await theDrawingShownNow()
  await wholeScreenStartsADrawingBesideTheOneShown(shown)
  const atThePress = await placesById()
  const p = await aPlaceOnTheCardShownNow(office.id.start!)
  await dragPastTheGap(p, atThePress, shown)
  await theNewDrawingIsShown(shown)
  await atItsOwnFit()
  expect(await app.page.locator(DRAWING).getAttribute('data-selected'), 'nothing is selected after the drag').toBeNull()
}, 180_000)
