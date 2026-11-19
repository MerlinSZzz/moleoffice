// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRESS ON A CARD FOCUSES IT AND MOVES NOTHING — CRITERION D12, MEASURED IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHY A UNIT TEST COULD NOT HAVE FOUND IT
 * ---------------------------------------------------------------------------------------
 *
 * Section 20 of design/messages/ACCEPTANCE.md: a press made the card bigger, the picture moved,
 * pressing it again moved it back, and pressing the background repeatedly made the whole drawing
 * jump. The cause: inside a pipeline box, pressing a card changed the box.
 *
 * The three things that did it were all functions with green tests: focus was one size step
 * (`sizeWithFocus`), focus moved a card's rung (`CARD_RUNG_AT`'s tier columns), and the card's own
 * control strip was a child of the card. Each is a different box, every box goes into the layout
 * key, and a new layout key re-runs ELK over the whole drawing. Nothing about that is visible from
 * a function's return value, so this file measures the pixels: every node's box on screen and the
 * window onto the drawing, before a press and after it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put `plan.tier` back into `layoutKeyFor` (card.ts) → every section goes red: a press asks for a
 *     new layout and every card is placed again.
 *   make `sizeOf` add a step for the selected tier → every section goes red: the pressed card is
 *     drawn wider and its neighbours move out of its way.
 *   take `position: absolute` off `.gx-card-controls` (Canvas.tsx) → the pressed card grows taller
 *     by the height of its own strip, so its own box changes.
 *
 * ---------------------------------------------------------------------------------------
 * A PIPELINE'S STEP IS PRESSED ON THE LANES, SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes, not the canvas, and the lanes draw no box around a
 * pipeline's steps. So the second section presses a step's card on the lanes. It measures every
 * card and every row of the lanes on screen, and the window onto the drawing (the world's transform
 * and the frame's scroll), before the press and after it. A press on a lanes card selects it, and a
 * second press on the same card takes the selection off, because no press on the lanes' background
 * does that. The three mutations above reach only the first section since then, because the second
 * no longer draws on the canvas. Its own mutation, after a control run:
 *
 *   make the selected card's rule in src/web/components/graph/lanes/styles.ts scale the card by 1.1
 *     → the second section goes red: the pressed card is drawn bigger.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { DRAWING, aPlaceOnTheCard, theDrawingHoldsStill, theDrawingIsDrawn } from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let page: Page
let pipelineId = ''
let firstModuleId = ''
let secondModuleId = ''
let firstStepId = ''

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
  app = await liveApp({ name: 'press-moves-nothing', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Wrist calibration sweep',
    summary: 'Does the wrist camera hold its calibration across a working day?',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  // THREE STEPS INSIDE ONE BOX, so the box has children whose places a re-layout would move, and so
  // the compound node has a head whose height ELK is told about.
  for (const name of ['Collect boards', 'Solve the intrinsics', 'Check the reprojection']) {
    const block = await post(`/api/records/${pipelineId}/blocks`, { name, state: 'done' })
    if (firstStepId === '') firstStepId = block.record.id
  }

  const first = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: 'Three of four printed wrist mounts broke below the load the handover trials need.',
    data: { state: 'active', parts: [] },
  })
  firstModuleId = first.record.id
  const second = await post('/api/records', {
    kind: 'module',
    title: 'Bench jig',
    summary: 'Holds the mount while it is pulled.',
    data: { state: 'active', parts: [] },
  })
  secondModuleId = second.record.id
  const third = await post('/api/records', {
    kind: 'module',
    title: 'Load cell bench',
    summary: 'Where the pulls are done and the numbers come from.',
    data: { state: 'active', parts: [] },
  })
  for (const toId of [secondModuleId, third.record.id]) {
    const linked = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: firstModuleId, toId, type: 'relates_to' }),
    })
    if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Open one drawing from cold, with nothing chosen on it, and wait until it has been laid out. A filed
 * pipeline's address draws its lanes, so `lanes` waits for those instead of the canvas.
 */
async function openTheDrawing(hash: string, theme: 'light' | 'dark', drawn: 'canvas' | 'lanes' = 'canvas'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
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
  await page.goto(`${app.site}/#/${hash}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  if (drawn === 'lanes') {
    await theDrawingIsDrawn(page)
    return
  }
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** What is on screen: every node's box in screen pixels, and the window onto the drawing. */
interface Shot {
  boxes: Record<string, { x: number; y: number; w: number; h: number }>
  view: string
  selected: string[]
}

async function shot(): Promise<Shot> {
  return page.evaluate(() => {
    const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {}
    const selected: string[] = []
    for (const el of document.querySelectorAll('.react-flow__node')) {
      const id = el.getAttribute('data-id') ?? ''
      const r = el.getBoundingClientRect()
      // Rounded to whole pixels: a browser reports sub-pixel widths that wobble with the transform,
      // and a reader cannot see a thousandth of a pixel. A move a reader CAN see is a whole one.
      boxes[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      if (el.classList.contains('selected')) selected.push(id)
    }
    const port = document.querySelector('.react-flow__viewport')
    return { boxes, view: port instanceof HTMLElement ? port.style.transform : 'no viewport', selected }
  })
}

/**
 * What is on screen on the lanes: every card's box and every row's box in screen pixels, each named
 * by what it is, and the window onto the drawing. The lanes move their world by a transform and
 * their frame can scroll, so the window is both. A selected card is one pressed on (aria-pressed).
 */
async function aShotOfTheLanes(): Promise<Shot> {
  return page.evaluate((drawing) => {
    const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {}
    const selected: string[] = []
    const root = document.querySelector(drawing)
    for (const el of root?.querySelectorAll('.e-card, .e-area') ?? []) {
      const card = el.classList.contains('e-card')
      const id = card ? `card ${el.getAttribute('data-id') ?? ''}` : `row ${el.getAttribute('data-key') ?? ''}`
      const r = el.getBoundingClientRect()
      // Rounded to whole pixels, as on the canvas above.
      boxes[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      if (card && el.getAttribute('aria-pressed') === 'true') selected.push(el.getAttribute('data-id') ?? '')
    }
    const world = root?.querySelector('.e-world')
    const frame = root?.querySelector('.e-frame')
    const view =
      world instanceof HTMLElement && frame instanceof HTMLElement
        ? `${getComputedStyle(world).transform} scrolled ${String(frame.scrollLeft)},${String(frame.scrollTop)}`
        : 'no world'
    return { boxes, view, selected }
  }, DRAWING)
}

/**
 * THE DRAWING ONCE IT HAS STOPPED MOVING ON ITS OWN.
 *
 * A drawing settles by itself after it opens: the presence read and the restriction read each land
 * from the server and each can put a row on a card, which is a taller card and a new layout. This
 * file is about what a PRESS does, so it has to start from a drawing that has finished arriving —
 * otherwise the first shot catches the tail of the opening and the difference is blamed on the
 * press. `theDrawingHasSettled` waits until nothing on the drawing has changed for 300 milliseconds
 * and ten frames, and it fails the case if that has not happened within thirty seconds.
 */
async function whenItHasSettled(): Promise<Shot> {
  await theDrawingHasSettled(page)
  return shot()
}

/**
 * PRESS ONE CARD AT ITS CORNER, which is the card itself rather than its name.
 *
 * The name is a button that opens the record. The corner is the card's own padding, and that is
 * what focuses it.
 */
async function pressTheCard(recordId: string): Promise<void> {
  await page.locator(`[data-target^="record/${recordId}/"]`).first().click({ position: { x: 3, y: 3 } })
  await settled()
}

/** Press the empty canvas, which is what takes a focus off. */
async function pressTheBackground(): Promise<void> {
  const box = await page.locator('.react-flow__pane').first().boundingBox()
  if (box === null) throw new Error('the drawing has no pane to press')
  await page.mouse.click(box.x + box.width - 8, box.y + box.height - 8)
  await settled()
}

/**
 * WAIT UNTIL A LAYOUT WOULD HAVE HAPPENED, IF ONE WAS GOING TO.
 *
 * This test asserts that nothing moved, so it has to wait past the point where a move would have
 * arrived — otherwise it would pass on a build that lays out again half a second later. Two frames
 * start the layout effect, ELK answers in tens of milliseconds on a drawing this size, and the
 * viewport is set one frame after that. `theDrawingHasSettled` returns only once nothing has changed
 * for 300 milliseconds and ten frames after all of that.
 */
async function settled(): Promise<void> {
  await theDrawingHasSettled(page)
}

/** Which boxes differ between two shots, said as sentences a reader can act on. */
function moved(before: Shot, after: Shot): string[] {
  const out: string[] = []
  for (const [id, was] of Object.entries(before.boxes)) {
    const now = after.boxes[id]
    if (now === undefined) {
      out.push(`${id} left the drawing`)
      continue
    }
    if (was.x !== now.x || was.y !== now.y) out.push(`${id} moved from ${was.x},${was.y} to ${now.x},${now.y}`)
    if (was.w !== now.w || was.h !== now.h) {
      out.push(`${id} changed size from ${was.w}×${was.h} to ${now.w}×${now.h}`)
    }
  }
  for (const id of Object.keys(after.boxes)) if (before.boxes[id] === undefined) out.push(`${id} arrived`)
  if (before.view !== after.view) out.push(`the window onto the drawing moved: ${before.view} -> ${after.view}`)
  return out
}

for (const theme of ['light'] as const) {
  describe(`a press on the module drawing changes no box and no view, in ${theme}`, () => {
    it('focuses the card it was pressed on and leaves every box exactly where it was', async () => {
      await openTheDrawing('pipeline/drawing', theme)
      const before = await whenItHasSettled()
      expect(before.selected, 'nothing is focused on a drawing nobody has pressed').toEqual([])
      await pressTheCard(firstModuleId)
      const after = await shot()
      expect(after.selected.length, 'the press focused exactly one card').toBe(1)
      expect(moved(before, after)).toEqual([])
    }, 180_000)

    it('draws the focused card its own controls, over the drawing rather than in the card', async () => {
      const strip = await page.locator('.gx-card-controls').first()
      expect(await strip.count(), 'the focused card carries its own controls').toBeGreaterThan(0)
      const laidOut = await page.evaluate(() => {
        const el = document.querySelector('.gx-card-controls')
        return el === null ? null : window.getComputedStyle(el).position
      })
      expect(laidOut, 'the controls are out of the flow, so they change no box').toBe('absolute')
    }, 60_000)

    it('takes the focus off when the background is pressed, and still moves nothing', async () => {
      const before = await shot()
      await pressTheBackground()
      const after = await shot()
      expect(after.selected, 'a press on the background takes the focus off').toEqual([])
      expect(moved(before, after)).toEqual([])
    }, 120_000)

    it('moves nothing when the background is pressed again and again', async () => {
      const before = await shot()
      for (let i = 0; i < 3; i += 1) await pressTheBackground()
      expect(moved(before, await shot())).toEqual([])
    }, 180_000)

    it('moves nothing when a second card is pressed and then the first one again', async () => {
      const before = await shot()
      await pressTheCard(secondModuleId)
      expect(moved(before, await shot())).toEqual([])
      await pressTheCard(firstModuleId)
      expect(moved(before, await shot())).toEqual([])
    }, 180_000)
  })

  // A press on a step's card, at a place that is the card and not its title, which is a link. The
  // place is found, and the card scrolled into the window, before the first shot, so that scroll is
  // not blamed on the press.
  describe(`a press on a step on a pipeline's lanes moves nothing, in ${theme}`, () => {
    it('selects the step it was pressed on and leaves every card, every row and the window exactly where they were', async () => {
      await openTheDrawing(`pipeline/${pipelineId}`, theme, 'lanes')
      const at = await aPlaceOnTheCard(page, firstStepId)
      await theDrawingHoldsStill(page)
      const before = await aShotOfTheLanes()
      const cards = Object.keys(before.boxes).filter((key) => key.startsWith('card '))
      expect(cards.length, "the pipeline's lanes draw its three steps as cards").toBeGreaterThanOrEqual(3)
      expect(before.selected, 'nothing is selected on lanes nobody has pressed').toEqual([])
      await page.mouse.click(at.x, at.y)
      await theDrawingHoldsStill(page)
      const after = await aShotOfTheLanes()
      expect(after.selected, 'the press selected the step it was made on').toEqual([firstStepId])
      expect(moved(before, after)).toEqual([])
    }, 180_000)

    it('moves nothing when the step is pressed again and its selection comes off', async () => {
      const at = await aPlaceOnTheCard(page, firstStepId)
      await theDrawingHoldsStill(page)
      const before = await aShotOfTheLanes()
      expect(before.selected, 'the step is still selected from the case before').toEqual([firstStepId])
      await page.mouse.click(at.x, at.y)
      await theDrawingHoldsStill(page)
      const after = await aShotOfTheLanes()
      expect(after.selected, 'a second press on the step takes its selection off').toEqual([])
      expect(moved(before, after)).toEqual([])
    }, 120_000)
  })
}
