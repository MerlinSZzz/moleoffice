// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DRAG UNDER WAY WHEN THE NEXT LANES DRAWING IS SHOWN CARRIES ON IN IT. Wave 13u round 231. The made-up office and
 * the waits are in tests/a-made-up-office-drawn-in-lanes.ts; finding an empty place and reading every card's position
 * are copied from tests/the-lanes-drawing-pans-and-keeps-card-presses.test.ts.
 *
 * THE FAULT THIS CRITERION NAMES: src/web/components/graph/lanes/LanesDrawing.tsx keeps the drawing before on the page
 * while the next one's lines are worked out, and then puts the next one in its place. A drag's handlers and its state
 * belong to one drawing's frame. So a drag under way when the next drawing is shown stops there: the frame that saw the
 * press has left the page, and the frame shown in its place never saw it. The view stays where the drag had put it.
 *
 * HOW A CASE DRAGS ACROSS TWO DRAWINGS, each on the master's lanes opened afresh at 1440 by 1000 in light:
 *   1. it waits until the lanes are drawn and nothing is being drawn (data-being-drawn), and reads every card's place;
 *   2. it presses and moves 60 px right and 40 px down in 4 steps, with the button held, and checks that the drawing
 *      shown at the press is still the one shown, that no new drawing has started, and that every card moved that far;
 *   3. with the button still held, it writes data-theme on the root element again, light as it was, which asks for a
 *      new drawing without the mouse, and waits until a new drawing has been started beside the one shown, the one
 *      shown has left the page, the new one is shown in its place and nothing is being drawn;
 *   4. it moves on to 120 px right and 80 px down in all, in 4 more steps, and releases;
 *   5. every card has moved 120 px right and 80 px down from its place in 1, within 2 px.
 * A case whose new drawing is not started, or is shown before the first part of the drag has ended, fails and says
 * which. The lanes are drawn afresh at every write of data-theme, and the page writes it again, with the same value,
 * whenever the reader chooses any of its presets. The theme is written as light and not changed to dark because the
 * dark theme draws borders 1 px wide where light draws them 2 px wide, and that alone moves a card by up to 2 px.
 *
 * WHAT IS PROVED, case by case:
 *   1. a drag from empty space with nothing selected moves every card, and nothing is selected after it;
 *   2. a drag from empty space with a card selected moves every card, and that card is still selected after it,
 *      since the release after a drag is not a press;
 *   3. a drag that starts on a card moves every card, and nothing is selected after it.
 *
 * RED UNTIL THE CODE: at 8d70cc0cf, every case is red at 5, because every card moved only by the first part.
 * Its mutation, once the Code is in, after a green run, the file copied first and restored with cp and checked with
 * cmp: in src/web/components/graph/lanes/LanesDrawing.tsx, put back the drag as 8d70cc0cf had it, its state held by
 * each drawing's frame → every case goes red at 5.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, prepareThePage, theDrawingHoldsStill, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'

/** How far the first part of the drag goes, on the drawing shown at the press, and how far the whole drag goes. */
const FIRST = { x: 60, y: 40 }
const ALL = { x: 120, y: 80 }
/** How long a case waits for the new drawing to be shown, and for nothing to be being drawn. */
const SHOWN_WITHIN = 30_000

let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-drag-across', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)
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
async function points() {
  return app.page.locator(`${DRAWING} .e-card`).evaluateAll(cards => cards.map(card => {
    const box = card.getBoundingClientRect()
    return { id: (card as HTMLElement).dataset.id, x: box.x, y: box.y }
  }))
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
async function movedAll(before: Awaited<ReturnType<typeof points>>, by: { x: number; y: number }, when: string) {
  const after = await points()
  expect(after.length, `${when}: the number of cards`).toBe(before.length)
  for (let i = 0; i < before.length; i++) {
    expect(after[i]!.id).toBe(before[i]!.id)
    expect(Math.abs(after[i]!.x - before[i]!.x - by.x), `${when}: ${before[i]!.id} moved ${(after[i]!.x - before[i]!.x).toFixed(1)} px right, not ${by.x}`).toBeLessThanOrEqual(2)
    expect(Math.abs(after[i]!.y - before[i]!.y - by.y), `${when}: ${before[i]!.id} moved ${(after[i]!.y - before[i]!.y).toFixed(1)} px down, not ${by.y}`).toBeLessThanOrEqual(2)
  }
}

/**
 * Writes the root's theme again, light as it was, and waits until the drawing shown has been replaced by a new one, and
 * nothing is being drawn. Says what happened: the sentence that the new drawing was started and shown, or which of the
 * two it was not.
 */
async function theNextDrawingIsShown(): Promise<string> {
  return app.page.evaluate(({ selector, within }) => new Promise<string>(resolve => {
    const shown = document.querySelector(selector)
    const slot = shown?.parentElement
    if (!shown || !slot) { resolve('there was no drawing on the page to replace'); return }
    const theme = document.documentElement.getAttribute('data-theme')
    if (theme !== 'light') { resolve(`the page's theme was ${String(theme)}, not light`); return }
    let started = false
    const settle = (said: string) => { observer.disconnect(); window.clearTimeout(limit); resolve(said) }
    const look = () => {
      if (!started && [...slot.children].some(child => child !== shown)) started = true
      if (shown.isConnected) return
      if (!started) { settle('the drawing shown left the page with no new drawing started beside it'); return }
      const now = document.querySelectorAll(selector)
      if (now.length !== 1 || now[0] === shown || (now[0] as HTMLElement).style.visibility === 'hidden') return
      if (document.querySelector('[data-being-drawn]') === null) settle('the new drawing was started and shown')
    }
    const observer = new MutationObserver(look)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-being-drawn', 'style'] })
    const limit = window.setTimeout(() => settle(started
      ? `a new drawing was started but not shown within ${within / 1000} seconds`
      : `no new drawing was started within ${within / 1000} seconds`), within)
    document.documentElement.setAttribute('data-theme', 'light')
  }), { selector: DRAWING, within: SHOWN_WITHIN })
}

/** Drags from `p` by ALL, with a new drawing shown in place of the one shown after the first part. */
async function dragAcrossTheNextDrawing(p: { x: number; y: number }, before: Awaited<ReturnType<typeof points>>) {
  const shown = await app.page.locator(DRAWING).elementHandle()
  await app.page.mouse.move(p.x, p.y)
  await app.page.mouse.down()
  try {
    await app.page.mouse.move(p.x + FIRST.x, p.y + FIRST.y, { steps: 4 })
    const atTheFirstPart = await app.page.evaluate(([old, selector]) => ({
      same: old !== null && old.isConnected && document.querySelectorAll(selector).length === 1 && document.querySelector(selector) === old,
      drawing: document.querySelector('[data-being-drawn]') !== null,
    }), [shown, DRAWING] as const)
    expect(atTheFirstPart.same, 'the drawing shown at the press is still the one shown after the first part of the drag').toBe(true)
    expect(atTheFirstPart.drawing, 'no new drawing has started before the first part of the drag ended (data-being-drawn)').toBe(false)
    await movedAll(before, FIRST, 'after the first part of the drag, on the drawing shown at the press')
    expect(await theNextDrawingIsShown(), 'a new drawing, asked for while the button is held').toBe('the new drawing was started and shown')
    await app.page.mouse.move(p.x + ALL.x, p.y + ALL.y, { steps: 4 })
  } finally {
    await app.page.mouse.up()
  }
  expect(await app.page.evaluate(([old, selector]) => document.querySelector(selector) !== old && !old?.isConnected, [shown, DRAWING] as const),
    'the drawing shown at the release is the new one').toBe(true)
}

it('a drag from empty space with nothing selected carries on in the next drawing, and selects nothing', async () => {
  await open()
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBeNull()
  const p = await empty()
  const before = await points()
  await dragAcrossTheNextDrawing(p, before)
  await movedAll(before, ALL, 'after the drag, on the new drawing')
  expect(await app.page.locator(DRAWING).getAttribute('data-selected'), 'nothing is selected after the drag').toBeNull()
}, 180_000)
it('a drag from empty space with a card selected carries on in the next drawing, and the card stays selected', async () => {
  await open()
  const card = await aPlaceOnTheCard(app.page, office.id.start!)
  await app.page.mouse.click(card.x, card.y)
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBe(office.id.start)
  await theDrawingHoldsStill(app.page)
  const p = await empty()
  const before = await points()
  await dragAcrossTheNextDrawing(p, before)
  await movedAll(before, ALL, 'after the drag, on the new drawing')
  expect(await app.page.locator(DRAWING).getAttribute('data-selected'), 'the card selected before the drag is still selected after it').toBe(office.id.start)
}, 180_000)
it('a drag that starts on a card carries on in the next drawing, and selects nothing', async () => {
  await open()
  const p = await aPlaceOnTheCard(app.page, office.id.start!)
  const before = await points()
  await dragAcrossTheNextDrawing(p, before)
  await movedAll(before, ALL, 'after the drag, on the new drawing')
  expect(await app.page.locator(DRAWING).getAttribute('data-selected'), 'nothing is selected after the drag').toBeNull()
}, 180_000)
