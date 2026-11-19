// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD THE READER PRESSED STAYS SELECTED WHEN THE LANES ARE DRAWN AGAIN. Wave 13u round 230, PV-2. The drawing and
 * the reading of it are in tests/a-made-up-office-drawn-in-lanes.ts.
 *
 * THE FAULT THIS CRITERION NAMES: src/web/components/graph/lanes/LanesDrawing.tsx draws the lanes afresh whenever the
 * page's input, the drawing's width, the theme, the narrow reading or the whole-window reading changes. Each new
 * drawing is told only of the card a comment opened, so a card the reader pressed goes unselected with nothing
 * pressed: after the app's own theme control is pressed, and after the window is made narrower.
 *
 * THE OFFICE: a made-up project with one pipeline of two steps, the second waiting on the first, and a module that
 * carries out the first step. An implements link is drawn only while a card at one of its ends is selected, so the
 * first step, once pressed, has a line of its own. Every title is made up and says so, and no record id is written
 * anywhere: ids come from the office's replies.
 *
 * HOW A CASE KNOWS THE LANES WERE DRAWN AGAIN: it keeps the drawing's root element before the change, and waits up to
 * 30 seconds for another root to stand in its place. A code that keeps the selection by not drawing the lanes again
 * keeps it as well, so after 30 seconds the case reads the drawing that is there, and its messages say which it was.
 *
 * WHY A FILE OF ITS OWN, and not tests/a-press-moves-nothing-on-a-drawing.test.ts: that file's office has no link at
 * a step, so a pressed step there has no line of its own. A module's implements link would give it one, but it would
 * also put a module card on the lanes that file measures and change the module drawing it presses on. And its sections
 * run once in each theme, set before the page opens, while these cases press the app's theme control and make the
 * window narrower in the middle of a case.
 *
 * WHAT IS PROVED, case by case, each on the pipeline's lanes opened afresh at 1440 by 1000 in light:
 *   1. the first step, pressed with the pointer, is selected and its implements line is drawn; after the app's own
 *      Dark control is pressed and the lanes are drawn again and hold still, the same card is still selected
 *      (data-selected and aria-pressed) and its implements line is still drawn;
 *   2. the same, with the window made 1400 by 1000 in place of the theme change;
 *   3. the first step pressed, the app's Dark control pressed, then Escape on the card: nothing is selected and the
 *      line is not drawn; after the app's Light control is pressed and the lanes are drawn again, still nothing is
 *      selected and the line is not drawn. A code that held the press and never let it go would pass 1 and 2.
 *
 * RED UNTIL THE CODE: at a build whose LanesDrawing.tsx is b3d219e8c's, cases 1 and 2 are red, because the lanes drawn
 * again have nothing selected; case 3 may be green there. Its two mutations, once the Code is in, each after a green
 * run, the file copied first and restored with cp and checked with cmp:
 *
 *   in src/web/components/graph/lanes/LanesDrawing.tsx, pass the new drawing no held selection → cases 1 and 2 go
 *     red: the lanes drawn again have nothing selected;
 *   never clear the held selection → case 3 goes red: the first step is selected again once the lanes are drawn in
 *     Light.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import {
  DRAWING,
  aPlaceOnTheCard,
  cardOf,
  openThePage,
  prepareThePage,
  readTheDrawing,
  theDrawingHoldsStill,
  theDrawingIsDrawn,
  writerFor,
  type TheDrawing,
} from './a-made-up-office-drawn-in-lanes.ts'

const PROJECT = { id: 'test-lanes-press-kept', title: 'Example office whose pressed card is kept (made up)' }

const TITLES = {
  pipeline: 'Example pipeline drawn again (made up)',
  first: 'Example first step (made up)',
  second: 'Example second step (made up)',
  module: 'Example module that carries out the first step (made up)',
} as const

let app: LiveApp
const id: Record<string, string> = {}
const link: Record<string, string> = {}

beforeAll(async () => {
  app = await liveApp({ name: 'lanes-press-kept', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id)
  await write.call('POST', '/api/workspaces', PROJECT)
  id['pipeline'] = (await write.call('POST', '/api/records', { kind: 'pipeline', title: TITLES.pipeline, data: { blockIds: [] } })).record.id
  id['first'] = (await write.call('POST', `/api/records/${id['pipeline']!}/blocks`, { name: TITLES.first, state: 'doing' })).record.id
  id['second'] = (await write.call('POST', `/api/records/${id['pipeline']!}/blocks`, { name: TITLES.second, state: 'todo' })).record.id
  id['module'] = (await write.call('POST', '/api/records', { kind: 'module', title: TITLES.module, data: { context: 'Made up for a test of the drawing in areas.' } })).record.id
  const join = async (key: string, from: string, to: string, type: string): Promise<void> => {
    link[key] = (await write.call('POST', '/api/links', { fromId: id[from]!, toId: id[to]!, type })).id as string
  }
  await join('steps', 'first', 'second', 'blocks')
  await join('implements', 'module', 'first', 'implements')
  await prepareThePage(app, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/** The pipeline's lanes, opened afresh in light at 1440 by 1000, with the first step pressed with the pointer. */
async function theFirstStepPressed(): Promise<TheDrawing> {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await openThePage(app, pipelinePath(id['pipeline']!), 'light')
  await theDrawingIsDrawn(app.page)
  const atRest = await readTheDrawing(app.page)
  expect(atRest.selected, 'nothing is selected on lanes nobody has pressed').toBeNull()
  expect(atRest.onSelection[id['first']!] ?? [], "the implements link is the first step's own line, drawn while it is selected").toContain(link['implements'])
  expect(atRest.paths.map((path) => path.link), 'the implements line is not drawn at rest').not.toContain(link['implements'])
  const at = await aPlaceOnTheCard(app.page, id['first']!)
  await app.page.mouse.click(at.x, at.y)
  await app.page.locator(`${DRAWING}[data-selected="${id['first']!}"]`).waitFor({ timeout: 15_000 })
  await theDrawingHoldsStill(app.page)
  const pressed = await readTheDrawing(app.page)
  theFirstStepIsSelected(pressed, 'after the press')
  return pressed
}

/**
 * Makes one change, then waits up to 30 seconds for the lanes to be drawn again in a root of their own, and until they
 * hold still. Says whether they were drawn again.
 */
async function afterTheChange(change: () => Promise<void>): Promise<string> {
  const before = await app.page.locator(DRAWING).elementHandle()
  await change()
  const again = await app.page
    .waitForFunction(
      ([selector, old]) => {
        const now = document.querySelector(selector)
        return now !== null && now !== old && now.hasAttribute('data-drawn-links')
      },
      [DRAWING, before] as const,
      { timeout: 30_000 },
    )
    .then(
      () => true,
      () => false,
    )
  await theDrawingHoldsStill(app.page)
  return again ? 'the lanes were drawn again' : 'the lanes were not drawn again within 30 seconds'
}

/** Presses one of the app's own theme controls and waits for the page to take its theme. */
async function pressTheTheme(name: 'Light' | 'Dark'): Promise<void> {
  await app.page.getByRole('group', { name: 'Light or dark' }).getByRole('button', { name, exact: true }).click()
  await expect
    .poll(() => app.page.evaluate(() => document.documentElement.getAttribute('data-theme')), { timeout: 15_000, message: `the page took the ${name} theme` })
    .toBe(name.toLowerCase())
}

function theFirstStepIsSelected(drawing: TheDrawing, when: string): void {
  expect(drawing.selected, `${when}: the drawing says the first step is selected (data-selected)`).toBe(id['first'])
  expect(drawing.cards.find((card) => card.id === id['first'])?.pressed, `${when}: the first step's card is pressed (aria-pressed)`).toBe('true')
  expect(drawing.paths.map((path) => path.link), `${when}: the first step's implements line is drawn`).toContain(link['implements'])
}

function nothingIsSelected(drawing: TheDrawing, when: string): void {
  expect(drawing.selected, `${when}: the drawing says nothing is selected (data-selected)`).toBeNull()
  expect(drawing.cards.filter((card) => card.pressed === 'true').map((card) => card.id), `${when}: no card is pressed (aria-pressed)`).toEqual([])
  expect(drawing.paths.map((path) => path.link), `${when}: the first step's implements line is not drawn`).not.toContain(link['implements'])
}

it('a pressed step is still selected, with its own line, after the app’s Dark control draws the lanes again', async () => {
  await theFirstStepPressed()
  const said = await afterTheChange(() => pressTheTheme('Dark'))
  theFirstStepIsSelected(await readTheDrawing(app.page), `after the Dark control (${said})`)
}, 180_000)

it('a pressed step is still selected, with its own line, after the window is made 1400 wide', async () => {
  await theFirstStepPressed()
  const said = await afterTheChange(() => app.page.setViewportSize({ width: 1400, height: 1000 }))
  theFirstStepIsSelected(await readTheDrawing(app.page), `after the window is made 1400 by 1000 (${said})`)
}, 180_000)

it('a step unselected with Escape stays unselected after the app’s Light control draws the lanes again', async () => {
  await theFirstStepPressed()
  await afterTheChange(() => pressTheTheme('Dark'))
  await app.page.locator(cardOf(id['first']!)).focus()
  await app.page.keyboard.press('Escape')
  await theDrawingHoldsStill(app.page)
  nothingIsSelected(await readTheDrawing(app.page), 'after Escape')
  const said = await afterTheChange(() => pressTheTheme('Light'))
  nothingIsSelected(await readTheDrawing(app.page), `after the Light control (${said})`)
}, 180_000)
