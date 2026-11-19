// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DRAG ON THE LANES DRAWING SELECTS NO WORDS, AND A READER CAN STILL SELECT A WORD ON PURPOSE. Wave 13u round 231.
 * The made-up office's master at its Boxes level, at 1440 x 1000, light, served from the production build. Opening it
 * and the waits are in tests/a-made-up-office-drawn-in-lanes.ts. Each case opens the page afresh.
 *
 * THE FAULT THIS CRITERION NAMES: in src/web/components/graph/lanes/LanesDrawing.tsx a press on the drawing starts the
 * browser's own selection of words, and the drag that follows does nothing to stop it, so the selection can grow from
 * the press to the pointer, over the drawing's words. It does so with no new drawing shown: on the made-up master of 34
 * boxes in tests/a-made-up-master-at-real-shape.ts, a drag from where a script that took review pictures pressed leaves
 * the words of the first step and its state selected. That is case 6, in
 * tests/a-drag-on-the-master-at-real-shape-selects-no-words.test.ts, which needs a made-up office of its own. On this
 * file's made-up office, a drag with no new drawing shown left nothing selected wherever it was tried. When the next
 * drawing is shown during the drag, the words the press was anchored in leave the page, and the selection grows from
 * where they were to the pointer, over the new drawing's words. The page draws the lanes afresh when what they draw, the
 * width or the theme changes, so the next drawing can be shown while a reader holds the button.
 *
 * THE DRAG OF CASE 1, at the page's own size with the frame's top scrolled to the window's top: a press 12 px inside the
 * frame's top-left corner, on no card, then 5 of 15 moves toward 300 px right and 200 px down with the button held; then
 * the next drawing is shown, by writing data-theme on the root element again, light as it was, as
 * tests/a-lanes-drag-carries-on-when-the-next-drawing-is-shown.test.ts does; then the other 10 moves, and the release.
 *
 * WHAT IS PROVED, case by case:
 *   1. after the drag of case 1, no words are selected, and every card moved 300 px right and 200 px down;
 *   2. after a 120 x 80 drag that starts on a card outside its title, no words are selected, and the view moved;
 *   3. after a 120 x 80 drag that starts inside a card's title text, no words are selected, the view moved, and the
 *      page's address has not changed;
 *   4. after the drag of case 1, a double-click on the word "to" of a card's "to do" state chip, which is in no link
 *      or button, selects that word (this master draws no count line at its Boxes level);
 *   5. after the drag of case 1, a press on a card's title opens what the title leads to. The drag keeps its own click
 *      from doing anything until a 0 ms timer started at the release has run. A reader cannot press that soon, but a
 *      test can, so the press waits for that timer first.
 * Cases 2 and 3 open the page at whole screen, wait for the drawing Whole screen starts to be shown, and draw it five
 * steps bigger, as
 * tests/the-lanes-drawing-pans-and-keeps-card-presses.test.ts does. "No words are selected" is read twice, just after
 * the release and 600 ms later. A failure names the case, which read it was, the selected words, cut to 80 characters,
 * and the element they lie in.
 *
 * RED UNTIL THE CODE: at 236ceb7e9, case 1 is red because words of the drawing's key are selected after the drag.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, openTheWholeScreen, prepareThePage, theDrawingHoldsStill, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'

/** How long a case waits for the next drawing to be shown, and for nothing to be being drawn. */
const SHOWN_WITHIN = 30_000

let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-select', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)

/** The page at its own size, with the frame's top scrolled to the window's top. */
async function openAtItsOwnSize() {
  await openThePage(app, pipelinePath(office.id.master!))
  await theDrawingIsDrawn(app.page)
  await app.page.evaluate((selector) => { window.scrollBy(0, document.querySelector(`${selector} .e-frame`)!.getBoundingClientRect().top) }, DRAWING)
  await theDrawingHoldsStill(app.page)
}
async function openWholeScreenAndBigger() {
  await openThePage(app, pipelinePath(office.id.master!))
  await theDrawingIsDrawn(app.page)
  await openTheWholeScreen(app.page)
  const bigger = app.page.getByRole('button', { name: 'Bigger', exact: true })
  for (let i = 0; i < 5 && await bigger.getAttribute('aria-disabled') !== 'true'; i++) await bigger.click()
  await app.page.waitForTimeout(150)
}
async function points() {
  return app.page.locator(`${DRAWING} .e-card`).evaluateAll(cards => cards.map(card => {
    const box = card.getBoundingClientRect()
    return { id: (card as HTMLElement).dataset.id, x: box.x, y: box.y }
  }))
}
async function drag(p: { x: number; y: number }, dx: number, dy: number) {
  await app.page.mouse.move(p.x, p.y)
  await app.page.mouse.down()
  await app.page.mouse.move(p.x + dx, p.y + dy, { steps: 10 })
  await app.page.mouse.up()
}
async function movedAll(named: string, before: Awaited<ReturnType<typeof points>>, dx: number, dy: number) {
  const after = await points()
  expect(after.length, `${named}: the cards drawn`).toBe(before.length)
  for (let i = 0; i < before.length; i++) {
    expect(after[i]!.id).toBe(before[i]!.id)
    expect(Math.abs(after[i]!.x - before[i]!.x - dx), `${named}: ${before[i]!.id} moved ${(after[i]!.x - before[i]!.x).toFixed(1)} px right, not ${dx}`).toBeLessThanOrEqual(2)
    expect(Math.abs(after[i]!.y - before[i]!.y - dy), `${named}: ${before[i]!.id} moved ${(after[i]!.y - before[i]!.y).toFixed(1)} px down, not ${dy}`).toBeLessThanOrEqual(2)
  }
}

/**
 * Writes the root's theme again, light as it was, and waits until the drawing shown has been replaced by a new one, and
 * nothing is being drawn. Copied from tests/a-lanes-drag-carries-on-when-the-next-drawing-is-shown.test.ts.
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

/** The drag of case 1, from a page opened at its own size. Returns every card's place before it. */
async function theDragOfCase1(named: string) {
  const p = await app.page.evaluate((selector) => {
    const frame = document.querySelector(`${selector} .e-frame`)!.getBoundingClientRect()
    const x = frame.left + 12, y = frame.top + 12
    const hit = document.elementFromPoint(x, y)
    return hit !== null && hit.closest('.e-frame') !== null && hit.closest('.e-card, a, button, .e-key, .e-path, .e-pill') === null ? { x, y } : null
  }, DRAWING)
  expect(p, `${named}: the place 12 px inside the frame's top-left corner is empty`).not.toBeNull()
  const before = await points()
  await app.page.mouse.move(p!.x, p!.y)
  await app.page.mouse.down()
  try {
    for (let step = 1; step <= 5; step++) await app.page.mouse.move(p!.x + 300 * step / 15, p!.y + 200 * step / 15)
    expect(await theNextDrawingIsShown(), `${named}: the next drawing, asked for while the button is held`).toBe('the new drawing was started and shown')
    for (let step = 6; step <= 15; step++) await app.page.mouse.move(p!.x + 300 * step / 15, p!.y + 200 * step / 15)
  } finally {
    await app.page.mouse.up()
  }
  return before
}

/** The words the window holds selected, and the element they lie in, named by its tag, its classes and its card. */
async function theSelection() {
  return app.page.evaluate(() => {
    const selection = window.getSelection()
    const text = selection?.toString() ?? ''
    if (selection === null || selection.rangeCount === 0) return { text, where: 'no element' }
    const node = selection.getRangeAt(0).commonAncestorContainer
    const element = node instanceof Element ? node : node.parentElement
    if (element === null) return { text, where: 'no element' }
    const name = `${element.tagName.toLowerCase()}${[...element.classList].map(one => `.${one}`).join('')}`
    const card = element.closest('.e-card') as HTMLElement | null
    return { text, where: card === null ? name : `${name} on card ${card.dataset.id ?? 'with no id'}` }
  })
}
/** Reads the selection just after the release and again 600 ms later. Both must hold no words. */
async function nothingIsSelected(named: string) {
  const atTheRelease = await theSelection()
  await app.page.waitForTimeout(600)
  const later = await theSelection()
  for (const [read, { text, where }] of [['just after the release', atTheRelease], ['600 ms after the release', later]] as const) {
    expect(text, `${named}, read ${read}: the words "${text.slice(0, 80)}" are selected, in ${where}`).toBe('')
  }
}
/**
 * A word the pointer reaches and the place at its middle: the first word of the first element matched by `within`
 * whose words are `words`, when given, and whose word's middle is that element. Cards are scrolled into the window when
 * `scroll` is given, as aPlaceOnTheCard does.
 */
async function aWordIn(within: string, scroll: boolean, words: string | null = null) {
  return app.page.evaluate(({ within, scroll, words }) => {
    for (const element of document.querySelectorAll(within)) {
      const card = element.closest('.e-card') as HTMLElement | null
      if (card === null || (words !== null && element.textContent?.trim() !== words)) continue
      if (scroll) card.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const word = /\p{L}{2,}/u.exec(node.textContent ?? '')
        if (word === null) continue
        const range = document.createRange()
        range.setStart(node, word.index)
        range.setEnd(node, word.index + word[0].length)
        const box = range.getBoundingClientRect()
        const x = box.left + box.width / 2, y = box.top + box.height / 2
        const hit = document.elementFromPoint(x, y)
        if (hit !== null && element.contains(hit)) {
          const link = hit.closest('a')
          return { x, y, word: word[0], card: card.dataset.id ?? '', href: link?.getAttribute('href') ?? null, inLinkOrButton: hit.closest('a, button') !== null }
        }
        break
      }
    }
    return null
  }, { within, scroll, words })
}

it('case 1: a 300 x 200 drag from an empty place, during which the next drawing is shown, moves the view and selects no words', async () => {
  await openAtItsOwnSize()
  const before = await theDragOfCase1('case 1')
  await nothingIsSelected('case 1, after a 300 x 200 drag from an empty place, during which the next drawing was shown')
  await movedAll('case 1, after the drag, on the next drawing', before, 300, 200)
}, 180_000)

it('case 2: a 120 x 80 drag from a card outside its title moves the view and selects no words', async () => {
  await openWholeScreenAndBigger()
  const p = await aPlaceOnTheCard(app.page, office.id.start!)
  const before = await points()
  await drag(p, 120, 80)
  await nothingIsSelected('case 2, after a 120 x 80 drag from a card outside its title')
  await movedAll('case 2', before, 120, 80)
}, 180_000)

it('case 3: a 120 x 80 drag from inside a title moves the view, selects no words and opens nothing', async () => {
  await openWholeScreenAndBigger()
  const place = await aWordIn(`${DRAWING} .e-card[data-id="${office.id.start!}"] .e-title`, true)
  expect(place, `case 3: a place inside the first word of the title of card ${office.id.start!}`).not.toBeNull()
  const address = await app.page.evaluate(() => location.href)
  const before = await points()
  await drag(place!, 120, 80)
  await nothingIsSelected(`case 3, after a 120 x 80 drag from the word "${place!.word}" of a title`)
  await movedAll('case 3', before, 120, 80)
  await app.page.waitForTimeout(200)
  expect(await app.page.evaluate(() => location.href), 'case 3: the address after the drag from a title').toBe(address)
}, 180_000)

it('case 4: after the drag of case 1, a double-click on the word "to" of a "to do" chip selects that word', async () => {
  await openAtItsOwnSize()
  await theDragOfCase1('case 4')
  const place = await aWordIn(`${DRAWING} .e-card .e-chip`, true, 'to do')
  expect(place, 'case 4: the word "to" of a card\'s "to do" state chip').not.toBeNull()
  expect(place!.word, 'case 4: the first word of the "to do" chip').toBe('to')
  expect(place!.inLinkOrButton, `case 4: the word "to" of the chip on card ${place!.card} is in a link or button`).toBe(false)
  await app.page.mouse.dblclick(place!.x, place!.y)
  const { text, where } = await theSelection()
  // A double-click selects the word with the space after it on some systems, so the space is not counted.
  expect(text.trim(), `case 4: the double-click on "to" of the chip on card ${place!.card} selected "${text.slice(0, 80)}", in ${where}`).toBe('to')
}, 180_000)

it('case 5: after the drag of case 1, a press on a card title opens what the title leads to', async () => {
  await openAtItsOwnSize()
  await theDragOfCase1('case 5')
  // A timer started now runs after the one the release started.
  await app.page.evaluate(() => new Promise(resolve => window.setTimeout(resolve, 0)))
  const place = await aWordIn(`${DRAWING} .e-card a.e-title`, true)
  expect(place, 'case 5: a card title that the pointer reaches after the drag').not.toBeNull()
  expect(place!.href, `case 5: the title of card ${place!.card} leads somewhere`).toMatch(/^#\//)
  const address = await app.page.evaluate(() => location.href)
  const expected = new URL(place!.href!, address).toString()
  expect(expected, `case 5: the title of card ${place!.card} leads away from this page`).not.toBe(address)
  await app.page.mouse.click(place!.x, place!.y)
  await app.page.waitForURL(url => url.toString() === expected, { timeout: 30_000 })
}, 180_000)
