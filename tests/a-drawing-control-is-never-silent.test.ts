// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO CONTROL ON A DRAWING CHANGES NOTHING AND SAYS NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS SHUT
 * ---------------------------------------------------------------------------------------
 *
 * Problem 6: no control should look executable while doing nothing. A click that changes no pixel,
 * returns no refusal and gives no explanation is not acceptable. Criteria D1, D2 and D3 of
 * design/drawings/ACCEPTANCE.md.
 *
 * Measured on main at 9aa6940, before this: the two page controls — called `Draw it` and `Read it`
 * then, and `Graph` and `List` since criterion D26 on 6 September 2026 — set a view the page might
 * already be in; `Reading size` and `Fit all` animated to the window the reader was already looking
 * through; the zoom's minus and plus had no state at their limits; each step of the detail ladder
 * accepted a press on the step this drawing was already set to; and the chip in the picker for the
 * drawing on screen was a link to the address you were at. Nine controls, on two drawings, and not
 * one of them said anything.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A BROWSER, AND WHY BOTH DRAWINGS
 * ---------------------------------------------------------------------------------------
 *
 * Every one of these is a fact about a press. Whether a control is drawn as not available, what it
 * puts on the screen when it is pressed anyway, and whether the picture moved are all questions
 * about a real window with a real layout in it: the canvas has no measured card outside a browser,
 * so `Fit all` has no window to be already at.
 *
 * BOTH DRAWINGS BECAUSE THE CRITERION SAYS BOTH. The module drawing and the pipeline drawing mount
 * the same two components with different graphs, and the ONE thing that differs is exactly what
 * would break: the module drawing leaves cards out, so it draws `Show all`, and the pipeline drawing
 * does not.
 *
 * ---------------------------------------------------------------------------------------
 * PRESSING A CONTROL THAT IS DRAWN AS NOT AVAILABLE
 * ---------------------------------------------------------------------------------------
 *
 * `dispatchEvent('click')` and never `click()`. A refused control carries `aria-disabled`, which
 * Playwright reads as not enabled, so `click()` waits for it to come back and times out after
 * thirty seconds — which is the shape of a hang rather than of an answer. Dispatching the event is
 * what a reader's press does to a control that is still in the tab order, which is the whole point
 * of `aria-disabled` rather than `disabled`.
 *
 * Every failing case below was proved by mutation, with a control run of this file first.
 *
 * ---------------------------------------------------------------------------------------
 * THE PIPELINE DRAWING IS ITS LANES SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes, not the canvas, and keeps Graph, List and the chips over
 * them. So the two cases on the pipeline drawing open it and wait for the lanes, and their assertions
 * are as they were.
 *
 * The empty pipeline's case reads the same empty mark, in the same place, on the lanes. It was red
 * when it was moved there, on 15 November 2026: the lanes drew an empty frame with no words for a
 * pipeline with no step. It goes green when the page draws the empty mark there. Its Show all
 * assertion is gone, because no pipeline's lanes offer Show all: the lanes draw every step the
 * pipeline has.
 *
 * A MUTATION THAT TURNS IT RED: give Graph in src/web/components/graph/StructureView.tsx the words of
 * List's refusal ("Already open: …") as its reason. Graph on the lanes then refuses without saying
 * "Already drawn", and the case that refuses the view it is already showing goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Locator, Page } from 'playwright'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { deleteTheCopiedDefaultChapters, type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { theDrawingIsDrawn } from './a-made-up-office-drawn-in-lanes.ts'
import {
  DrawingControl,
  DrawingControls,
  type DrawingControlProps,
} from '../src/web/components/graph/controls.tsx'

let app: LiveApp
let page: Page
let pipelineId = ''
const moduleIds: string[] = []

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'drawing-controls', viewport: { width: 1440, height: 1000 } })
  // The default chapters a fresh office copies at its first start (wave 13s round 7) are module records
  // this test did not file, and it counts or draws modules, so it deletes them first.
  await deleteTheCopiedDefaultChapters(app.api)
  page = app.page
  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Wrist calibration sweep',
    summary: 'Does the wrist camera hold its calibration across a working day?',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  for (const name of ['Collect boards', 'Solve the intrinsics', 'Check the drift']) {
    await post(`/api/records/${pipelineId}/blocks`, { name, state: 'done' })
  }
  for (const title of ['Camera rig', 'Solver', 'Bench frame', 'Log store']) {
    const made = await post('/api/records', {
      kind: 'module',
      title,
      summary: `What ${title} is responsible for.`,
      data: { context: `Why ${title} exists.`, state: 'active', parts: [] },
    })
    moduleIds.push(made.record.id)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Open one drawing from cold, with nothing chosen on it, and wait until it has been laid out: the
 * canvas, or with `'lanes'` a filed pipeline's lanes.
 */
async function openTheDrawing(hash: string, laidOut: boolean | 'lanes'): Promise<void> {
  await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await page.goto(`${app.site}/#/${hash}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  if (laidOut === 'lanes') {
    await theDrawingIsDrawn(page)
  } else if (laidOut) {
    await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
    await theDrawingHasSettled(page)
  }
}

/**
 * WAIT UNTIL WHATEVER A PRESS DID HAS BEEN DRAWN, and nothing else.
 *
 * IT DOES NOT WAIT FOR THE THING THE CASE EXPECTS. This file's fault is a press that changes nothing
 * and says nothing, and a wait for a change or for a refusal would never end on that fault: the case
 * would fail at a timeout instead of at the assertion that names it. So this waits for the page to
 * have finished answering the press, whatever the answer was.
 *
 * Two animation frames first. React draws a press's result in the render that follows the press, so
 * after two frames that render is on the page. Then the ready mark, which is off while a request the
 * press started is out. Then, if a drawing is on the page — which a press of Graph can have just put
 * there — the drawing has stopped moving, which covers the window's own animation after Fit all,
 * Reading size, Smaller and Bigger. A drawing with nothing to draw has no canvas at all
 * (StructureView.tsx replaces it with a sentence), so there is nothing more to wait for there.
 */
async function thePressHasBeenDrawn(tab: Page = page): Promise<void> {
  await tab.evaluate(
    () =>
      new Promise<void>((done) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => done()))),
  )
  await waitForThePage(tab, 60_000)
  if ((await tab.locator('.gx-canvas-wrap').count()) > 0) await theDrawingHasSettled(tab)
}

/**
 * Everything on this page a press could move, as one string.
 *
 * IT IS THE INSTRUMENT FOR "THE PRESS CHANGED NOTHING", so it has to hold what each of these
 * controls would change if it worked: the window onto the drawing, the words on every card, and
 * which view is on screen.
 *
 * WHICH STEP OF THE LADDER IS MARKED CAME OFF THIS LIST ON 6 SEPTEMBER 2026, with criterion D14:
 * there is no ladder over a drawing any more, so there is no mark to read.
 *
 * A FILED PIPELINE'S LANES ARE READ TOO, since 15 November 2026: their window is `.e-world` and
 * their cards are `.e-card`.
 */
async function whatIsOnScreen(): Promise<string> {
  return page.evaluate(() => {
    const zoom = document.querySelector('.gx-canvas-zoom')?.textContent ?? '(no drawing)'
    const transform = (document.querySelector('.react-flow__viewport, .e-world') as HTMLElement | null)?.style.transform ?? '-'
    const cards = [...document.querySelectorAll('.gx-card, .gx-group, .e-card')]
      .map((el) => `${el.getAttribute('data-target') ?? ''} :: ${(el.textContent ?? '').replace(/\s+/g, ' ').trim()}`)
      .sort()
      .join('\n')
    const view = document.querySelector('.gx-stage-main')?.firstElementChild?.className ?? '-'
    return `zoom=${zoom}\ntransform=${transform}\nview=${view}\n${cards}`
  })
}

/** Every word the page is saying about a refused press, wherever it draws it. */
async function refusalsOnScreen(): Promise<string> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.px-why, .gx-refused')]
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .join(' | '),
  )
}

/**
 * A control that is in the state its own press would set: not available, and it says why.
 *
 * Three things at once, because they are one claim: the control is drawn as not available, pressing
 * it changes nothing on the page, and the page then says in words what did not happen.
 */
async function refuses(control: Locator, words: string, what: string): Promise<void> {
  expect(await control.getAttribute('aria-disabled'), `${what} is not drawn as unavailable`).toBe('true')
  const before = await whatIsOnScreen()
  await control.dispatchEvent('click')
  await thePressHasBeenDrawn()
  expect(await whatIsOnScreen(), `${what} was pressed and the page moved`).toBe(before)
  expect(await refusalsOnScreen(), `${what} was pressed and the page said nothing`).toContain(words)
}

/** A control that is NOT in its own state: available, and the press moves the page. */
async function acts(control: Locator, what: string): Promise<void> {
  expect(await control.getAttribute('aria-disabled'), `${what} is drawn as unavailable`).toBe(null)
  const before = await whatIsOnScreen()
  await control.click()
  await thePressHasBeenDrawn()
  expect(await whatIsOnScreen(), `${what} was pressed and nothing happened`).not.toBe(before)
}

/**
 * WHERE THE BUTTONS OVER A DRAWING ARE, and what the page is saying about a refused press.
 *
 * `tops` IS THE INSTRUMENT FOR "THE ROW IS STILL ONE ROW". A refusal is a full-width line under the
 * row rather than an item in it; when it was an item, the buttons after it dropped to a second line
 * under the reader's hand. One distinct top is one row.
 */
async function theButtonRow(tab: Page): Promise<{ tops: number[]; labels: string[]; said: string[] }> {
  return tab.evaluate(() => {
    const row = document.querySelector('.gx-switch')
    const buttons = row === null ? [] : [...row.querySelectorAll('.px-btn')]
    return {
      tops: buttons.map((el) => Math.round(el.getBoundingClientRect().top)),
      labels: buttons.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()),
      said: [...document.querySelectorAll('.px-why, .gx-refused')].map((el) =>
        (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
    }
  })
}

const drawIt = (): Locator => page.getByRole('button', { name: 'Graph' })
const readIt = (): Locator => page.getByRole('button', { name: 'List', exact: true })
const showAllButton = (): Locator => page.getByRole('button', { name: /^Show all/ })
const readingSize = (): Locator => page.getByRole('button', { name: 'Reading size' })
const fitAll = (): Locator => page.getByRole('button', { name: 'Fit all' })
const smaller = (): Locator => page.getByRole('button', { name: 'Smaller' })
const bigger = (): Locator => page.getByRole('button', { name: 'Bigger' })

/** Press one control until it stops being available, which is how the drawing says it is at a limit. */
async function pressUntilRefused(control: Locator, what: string): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if ((await control.getAttribute('aria-disabled')) === 'true') return
    await control.click()
    await thePressHasBeenDrawn()
  }
  throw new Error(`${what} never became unavailable, so its limit was never reached`)
}

// ============================================================ D2: an empty drawing says what would fill it

describe('a drawing with no card on it says why, and what would put one there', () => {
  it('uses the empty mark and offers the button that draws the cards', async () => {
    // The four modules are on file and none is linked to another, which is the workspace the owner
    // was looking at: fifteen modules, no link with both ends a module, and a highlighted primary
    // button whose press set the state the page was already in.
    await openTheDrawing('pipeline/drawing', false)
    const sentence = await page.locator('.gx-projection').first().innerText()
    // Plan 7FEOshq3mBGG uses the short mark for ordinary emptiness.
    expect(sentence).toBe('—')

    // AND THE OTHER THING THAT WOULD FILL IT. Show all is beside this sentence and puts every card
    // on the canvas in one press; the sentence named only the link nobody had made, so a reader was
    // told the drawing could not be filled next to the control that fills it — problem igS-XA9B7ejS.
    // THE LABEL IS READ OFF THE PAGE rather than typed in here: StructureView writes the label and
    // model.ts writes the sentence, and this is what stops those two drifting with nothing failing.
    const showAll = (await showAllButton().innerText()).trim()
    expect(showAll, 'Show all is not offered on an empty module drawing').toBe('Show all 4')

    expect(
      await drawIt().getAttribute('data-variant'),
      'Graph is still the highlighted primary button on a drawing with nothing to draw',
    ).toBe('secondary')
  }, 300_000)

  it('draws all cards without inventing links when Show all is pressed', async () => {
    // THE SENTENCE IS CHECKED AGAINST THE PRESS, which is the problem record's own way of telling
    // this has come back: press Show all on a drawing where nothing is linked, and if cards appear
    // then the sentence printed before that press had to have said so.
    await openTheDrawing('pipeline/drawing', false)
    const sentence = await page.locator('.gx-projection').first().innerText()
    await showAllButton().click()
    await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
    await theDrawingHasSettled(page)
    const cards = await page.locator('.gx-card').count()
    expect(cards, 'Show all drew nothing on the canvas').toBe(4)
    expect(sentence).toBe('—')
    expect(await page.locator('.react-flow__edge').count(), 'a line was drawn between cards nothing joins').toBe(0)
  }, 300_000)

  it('refuses Graph in one short line, and the row of buttons stays one row', async () => {
    // PRESSING IT USED TO PRINT THE PARAGRAPH A SECOND TIME, in red, 52 pixels from the first
    // copy, and the row of three buttons became three rows 126 px tall — problem f43ANgTxSkST.
    // Nothing on screen said which of the two copies was the answer to the press.
    await openTheDrawing('pipeline/drawing', false)
    const paragraph = await page.locator('.gx-projection').first().innerText()
    await refuses(drawIt(), 'Nothing to draw: no two modules are linked', 'Graph with nothing to draw')

    const said = await refusalsOnScreen()
    expect(
      said.length,
      `the refusal beside Graph is ${String(said.length)} characters, beside a paragraph already saying it all`,
    ).toBeLessThan(90)
    expect(paragraph, 'the refusal is the paragraph again, word for word').not.toContain(said)
    expect(said, 'the refusal does not name the button that would fill the canvas').toContain('Show all 4')

    const row = await theButtonRow(page)
    expect(new Set(row.tops).size, `the refusal split the button row: ${JSON.stringify(row)}`).toBe(1)
    expect(row.labels, 'the row lost a button').toEqual(['Graph', 'List', 'Show all 4'])
  }, 300_000)

  it('keeps the button row one row at 990, 660 and 390 as well', async () => {
    // FOUR WIDTHS, because a row that holds at 1440 is not a row that holds. At 390 the page opens
    // on the printed list, so the row is two buttons wide there and the words under it are the long
    // ones — three lines of them, under the row rather than through it.
    for (const [width, height] of [
      [990, 1000],
      [660, 900],
      [390, 844],
    ] as [number, number][]) {
      const context = await app.browser.newContext({ viewport: { width, height } })
      const tab = await context.newPage()
      try {
        await tab.goto(`${app.site}/#/pipeline/drawing`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await tab.reload({ timeout: 60_000 })
        await waitForThePage(tab, 60_000)
        await tab.getByRole('button', { name: 'Graph' }).waitFor({ timeout: 30_000 })
        await tab.getByRole('button', { name: 'Graph' }).dispatchEvent('click')
        await thePressHasBeenDrawn(tab)
        const row = await theButtonRow(tab)
        expect(row.said.length, `nothing was said about the refused press at ${String(width)}`).toBeGreaterThan(0)
        expect(
          new Set(row.tops).size,
          `at ${String(width)} the refusal split the button row: ${JSON.stringify(row)}`,
        ).toBe(1)
      } finally {
        await context.close()
      }
    }
  }, 300_000)

  it('gives the whole account to the printed list, where the paragraph is not on the page', async () => {
    // A READER IN THE PRINTED LIST NEVER SEES THE PARAGRAPH, so the short line would leave them
    // without the fact they need. That is builder DA's reason for making the reason the sentence and
    // it still holds; it is the canvas, where the sentence is 52 pixels away, that gets the short
    // one. Both are written in model.ts, out of the same clauses.
    await openTheDrawing('pipeline/drawing', false)
    await acts(readIt(), 'List on a drawing with nothing to draw')
    expect(
      await page.locator('.gx-projection').count(),
      'the printed list draws the paragraph after all, so the short reason would do here too',
    ).toBe(0)
    await drawIt().dispatchEvent('click')
    await thePressHasBeenDrawn()
    expect(await refusalsOnScreen(), 'the printed list is told less than the drawing is').toContain(
      'A link of any type between two module records draws both cards and the line between them',
    )
  }, 300_000)

  it('offers Show all in the printed list too, and one press puts every card back on the canvas', async () => {
    // A READER WHO PRESSED LIST ON AN EMPTY DRAWING HAD NO WAY BACK, problem YOiNLeTshUK6. Graph is
    // refused there, because the canvas would hold only a sentence, and Show all was drawn on the
    // canvas alone. Mutation: draw Show all only when `showing === 'canvas'` again in
    // src/web/components/graph/StructureView.tsx, and this fails because the list offers no Show all.
    await openTheDrawing('pipeline/drawing', false)
    await acts(readIt(), 'List on a drawing with nothing to draw')
    expect(await drawIt().getAttribute('aria-disabled'), 'Graph is offered on the list of an empty drawing').toBe('true')
    expect(await showAllButton().count(), 'the printed list of an empty drawing offers no way back to the canvas').toBe(1)
    expect((await showAllButton().innerText()).trim()).toBe('Show all 4')
    await showAllButton().click()
    await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
    await theDrawingHasSettled(page)
    expect(await page.locator('.gx-card').count(), 'Show all from the list drew no card on the canvas').toBe(4)
  }, 300_000)

  it('uses the empty mark on a pipeline with no step, drawn in lanes, and refuses Graph there', async () => {
    // THE OTHER DRAWING'S EMPTY CASE, and it is a different fact with different words: a module
    // drawing is empty because nothing is linked, a pipeline drawing because nothing is in it. One
    // sentence true of neither would be the easy thing to write here.
    const empty = await post('/api/records', {
      kind: 'pipeline',
      title: 'A sweep nobody has broken down yet',
      summary: 'Filed, and no step written for it.',
      data: { blockIds: [] },
    })
    // A FILED PIPELINE'S ADDRESS DRAWS ITS LANES, which come after the arrangement is read. So the mark
    // is waited for, and only for so long, and a page that never draws it fails here by name.
    await openTheDrawing(`pipeline/${empty.record.id}`, false)
    await expect
      .poll(() => page.locator('.gx-projection').count(), {
        timeout: 30_000,
        message: 'a pipeline with no step is drawn in lanes as an empty frame, with no empty mark and no words',
      })
      .toBeGreaterThan(0)
    const sentence = await page.locator('.gx-projection').first().innerText()
    expect(sentence).toBe('—')
    // NO SHOW ALL HERE. On the canvas, Show all 1 drew the pipeline's own box. No pipeline's lanes offer
    // Show all, because the lanes draw every step the pipeline has, so there is no button to read.
    expect(
      await drawIt().getAttribute('aria-disabled'),
      'Graph is offered as an action on a pipeline with no step',
    ).toBe('true')
  }, 300_000)
})

// ============================================================ D1: every control, in its own state

describe('every control on the module drawing', () => {
  beforeAll(async () => {
    const res = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: moduleIds[0], toId: moduleIds[1], type: 'relates_to' }),
    })
    if (!res.ok) throw new Error(`the two modules could not be linked: ${await res.text()}`)
  }, 60_000)

  it('takes the reason back when the control comes back', async () => {
    // A REASON IS A CLAIM ABOUT WHY A CONTROL IS OFF, so it may not outlive the control being off.
    // `Btn` kept the sentence it had shown for ever: press `Graph` while the drawing is on
    // screen, then press `List`, and "Already drawn" was still sitting under a button that now
    // worked.
    await openTheDrawing('pipeline/drawing', true)
    await refuses(drawIt(), 'Already drawn', 'Graph while the drawing is on screen')
    await acts(readIt(), 'List while the drawing is on screen')
    expect(
      await refusalsOnScreen(),
      'the reason Graph could not be pressed outlived Graph becoming pressable',
    ).not.toContain('Already drawn')
  }, 300_000)

  it('draws the chip for the drawing on screen as words rather than as a link', async () => {
    await openTheDrawing('pipeline/drawing', true)
    const here = page.locator('.gx-scope[data-current="1"]')
    expect(await here.count(), 'the picker does not mark the drawing on screen').toBe(1)
    expect(
      await here.evaluate((el) => el.tagName),
      'the chip for the drawing on screen is still a link to the address you are at',
    ).toBe('SPAN')
    expect(await here.innerText(), 'the chip does not say why it is not a link').toContain('on screen')
    // The chips for the OTHER drawings are still links, which is what makes middle-click and
    // copy-link-address work on them.
    const others = page.locator('.gx-scope:not([data-current="1"])')
    expect(await others.count()).toBeGreaterThan(0)
    for (const other of await others.all()) {
      expect(await other.evaluate((el) => el.tagName), 'a drawing you are not on is no longer a link').toBe('A')
    }
  }, 300_000)

  // THE STEPS OF THE LADDER OVER A DRAWING WERE PRESSED HERE, and there are none: criterion D14
  // took that control off both drawings on 6 September 2026, as not needed.
  // A control that does not exist cannot be silent, and the rest of this file still presses every
  // control that does.

  it('refuses the window it is already open at, and the ends of the zoom', async () => {
    await openTheDrawing('pipeline/drawing', true)
    await theWindowAndTheZoom()
  }, 300_000)
})

/**
 * The four controls over the window, each pressed in its own state, on whichever drawing is open.
 *
 * A PRESS OF `Bigger` BEFORE EACH ONE, and it is not a flourish. A drawing small enough to fit the
 * window opens at the size `Fit all` would set, so on these two drawings the reading window and the
 * fitted window are the same window — each button refuses from the moment it is drawn, and "press
 * it, then press it again" would never reach the first press. Moving the zoom puts the reader
 * somewhere that is neither, which is the state both buttons have to act from.
 */
async function theWindowAndTheZoom(): Promise<void> {
  // THE DRAWING MAY NOT BE AT ITS READING WINDOW WHEN THIS IS CALLED, and since 5 September 2026 it
  // usually is not: a step of the detail ladder puts every card at a different SIZE, so the drawing
  // is a different shape and the window it opens at is somewhere else. The reader is then looking
  // through a window that is neither, and `Reading size` is a press that does something — which is
  // the other half of D1 and is asserted here before the refusal it sets up.
  if ((await readingSize().getAttribute('aria-disabled')) === null) {
    await acts(readingSize(), 'Reading size after the drawing was laid out again')
  }
  await refuses(readingSize(), 'Already at the reading size', 'Reading size at the window it opens at')
  await acts(bigger(), 'Bigger from the size it opened at')

  await acts(fitAll(), 'Fit all from somewhere else')
  await refuses(fitAll(), 'Already showing the whole drawing', 'Fit all when the whole drawing already fits')
  await acts(bigger(), 'Bigger from the fitted window')
  await acts(readingSize(), 'Reading size from somewhere else')
  await refuses(readingSize(), 'Already at the reading size', 'Reading size twice')

  await pressUntilRefused(smaller(), 'Smaller')
  await refuses(smaller(), 'Already at the smallest', 'Smaller at the smallest zoom')
  await pressUntilRefused(bigger(), 'Bigger')
  await refuses(bigger(), 'Already at the largest', 'Bigger at the largest zoom')
}

describe('every control on the pipeline drawing', () => {
  it('refuses the view it is already showing', async () => {
    await openTheDrawing(`pipeline/${pipelineId}`, 'lanes')
    await refuses(drawIt(), 'Already drawn', 'Graph on the pipeline drawing')
    await acts(readIt(), 'List on the pipeline drawing')
    await refuses(readIt(), 'Already open', 'List on the pipeline drawing, twice')
  }, 300_000)

  it('draws the chip for the pipeline on screen as words rather than as a link', async () => {
    await openTheDrawing(`pipeline/${pipelineId}`, 'lanes')
    const here = page.locator('.gx-scope[data-current="1"]')
    expect(await here.evaluate((el) => el.tagName)).toBe('SPAN')
    expect(await here.innerText()).toContain('on screen')
  }, 300_000)
})

// ============================================================ D3: the rule is one rule

describe('the check that a press would change nothing is written once', () => {

  /**
   * THE TWO THROWS, RENDERED RATHER THAN READ.
   *
   * THIS USED TO BE A TEXT SEARCH and that is problem `bybKzoxVvTzw`: the case asserted that the
   * strings `is outside DrawingControls` and `has no reason to give` appeared somewhere in
   * controls.tsx. Verifier DV1 deleted both `throw` statements, left their sentences behind as dead
   * strings, and all thirteen tests in this file stayed green. The same fact — a control with
   * nowhere to say its reason must throw — was written in the code and asserted about the code, and
   * changing one left the other true with nothing failing.
   *
   * A RENDER SEES THE BEHAVIOUR. `renderToStaticMarkup` needs no window and no browser: these four
   * cases run in about a millisecond each and go red the moment a throw becomes a shrug.
   *
   * WHY EACH CASE IS SHAPED THE WAY IT IS. The two throws are checked in order — no reason to give
   * first, nowhere to say it second — so a case that tripped both would prove only the first. The
   * control with nowhere to say its reason is given one, and the control with no reason to give is
   * put inside a `DrawingControls`. Each case can then only fail for its own throw.
   *
   * THE `button` LOOK IS NOT HERE. Until November 2026 `Btn` threw for a disabled button with no
   * reason (ui.tsx), so the throws in controls.tsx were what protected the `link` and `plain` looks,
   * and those are what is rendered. `Btn` now draws such a button off, with a line saying that the
   * page does not say why. The throw for no reason to give comes before controls.tsx looks at the
   * look, so a `button` meets the same throw, and no case here renders one.
   */
  /** The two things these cases vary: whether the control has words, and what its press would set. */
  type Vary = { reason?: string; after?: string }
  // THE `step` LOOK WAS THE SECOND CONTROL RENDERED HERE, and it went with the control over a
  // drawing on 6 September 2026 (D14): a look with no caller is a second implementation waiting to
  // drift. `link` and `plain` are what is left, and both are still rendered below.
  const aLink = (over: Vary): DrawingControlProps<string> => ({
    look: 'link',
    className: 'gx-scope',
    href: '#/pipeline',
    now: 'here',
    after: 'here',
    children: 'Every module',
    ...over,
  })
  const aPlainControl = (over: Vary): DrawingControlProps<string> => ({
    look: 'plain',
    className: 'gx-canvas-btn',
    label: 'Fit all',
    onPress: () => {},
    now: 'here',
    after: 'here',
    children: 'Fit all',
    ...over,
  })
  const inARow = (control: DrawingControlProps<string>): string =>
    renderToStaticMarkup(h(DrawingControls, { children: h(DrawingControl<string>, control) }))

  it('throws when a control that reports its reason upward is drawn outside the row', () => {
    // WITH A REASON TO GIVE, so the only thing that can throw here is having nowhere to give it.
    for (const control of [
      aPlainControl({ reason: 'Already at the reading size: this is the window the drawing opens at.' }),
    ]) {
      expect(
        () => renderToStaticMarkup(h(DrawingControl<string>, control)),
        `a ${control.look} control outside DrawingControls swallowed its refusal`,
      ).toThrow(/is outside DrawingControls/)
    }
  })

  it('throws when a control is in the state its press would set and has no reason to give', () => {
    // INSIDE A ROW, so the only thing that can throw here is having no words for the refusal.
    for (const control of [aLink({}), aPlainControl({})]) {
      expect(
        () => inARow(control),
        `a ${control.look} control that would change nothing was drawn with nothing to say`,
      ).toThrow(/has no reason to give/)
    }
  })

  it('draws a control that can act, and does not mark it unavailable', () => {
    // THE CONTROL RUN FOR THE TWO CASES ABOVE. Without it, a render that threw for some third reason
    // — a missing import, a broken component — would read as both throws firing.
    const markup = inARow(aPlainControl({ after: 'somewhere else' }))
    expect(markup, 'a control that can act is drawn as unavailable').not.toContain('aria-disabled')
    expect(markup, 'nothing was drawn at all').toContain('Fit all')
  })
})
