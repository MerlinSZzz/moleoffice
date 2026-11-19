// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CANVAS ZOOM IS NOT WHAT A CARD SAYS, AND NO POSITION OF THE LADDER DRAWS AN EMPTY BOX.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE WAS CALLED `the-graph-detail-control-is-on-screen` AND THAT CONTROL IS GONE
 * ---------------------------------------------------------------------------------------
 *
 * Criterion D14: the three-step `Detail` control over a drawing is taken away. Pressing it made the
 * graph jump, its name clashed with the detail in a block, and it was not needed.
 * Four cases about that control were deleted with it and the reason is written where
 * they stood. Everything else in this file was never about the control, so it is here under a name
 * that says what it is: zoom scales the picture and changes no word, the wheel over a drawing does
 * nothing, every object draws a name at the farthest view, and a pipeline box stays a box.
 *
 * The account below is kept because it is the reason the file exists at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AND WHY NO SOURCE TEST COULD REPLACE IT
 * ---------------------------------------------------------------------------------------
 *
 * The three-step detail control has been in `Canvas.tsx` since round ten, and until 27 August 2026
 * not one pixel of it had ever been on a screen. It was a plain child of a fixed-height box that
 * clips what overflows, drawn after a React Flow root that fills that box, so it began exactly at
 * the bottom edge and every part of it was cut away. Measured in a browser at 1440 on that day, at
 * `3d5d360`: three step buttons in the document, zero of them at a point a person could press, all
 * three starting at y=841 under a box whose visible area ended at y=841.
 *
 * EVERY OTHER INSTRUMENT SAID IT WAS FINE. It type-checked. `tests/graph-no-empty-boxes.test.ts`
 * proved the ladder table. `tests/a-detail-control-changes-what-is-drawn.test.ts` proved that
 * writing the stored setting changes what the page draws — it writes `localStorage` and reloads, so
 * it never touches the control at all. The owner reported the fault themselves: the drawing was calm,
 * it stayed at the least detail, and the owner could not find any way to make it say more.
 *
 * So the claim this file makes is the one nothing else can make: THE CONTROL IS AT A POINT A PERSON
 * CAN PRESS, and pressing it changes the drawing. `document.elementFromPoint` at the middle of each
 * step is the whole instrument — it answers "what would a click here hit", which is clipping,
 * covering, `pointer-events` and z-order all at once, and is the only question that matters.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT ELSE IS HELD HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. Zoom is not detail. The drawing's own bigger and smaller buttons are pressed until the readout
 *    passes 85% and 147%, and every card's text is compared BYTE FOR BYTE across the two.
 * 2. Every object draws a name at the farthest view of both kinds — the least detail, and Fit all.
 * 3. The wheel over the drawing changes nothing. There is no gesture that is the only way to
 *    anything, and this is the check that says so rather than a comment claiming it.
 *
 * ---------------------------------------------------------------------------------------
 * ON THE MODULES DRAWING SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes now, not this canvas, and no address draws a pipeline's
 * box or a step card any more. So the cases here open the modules drawing, which still draws this
 * canvas, on two linked modules that carry the same two lines and labels as the two steps.
 *
 * THE MUTATION FOR THE MOVED CASES, after a green run: set the modules drawing's `opensAt` in
 * `DRAWING_PLACES` (model.ts) to 'gist'. The first case must then go red, because every module card
 * opens at its own line. Only the modules drawing's place is changed, so the red also shows the case
 * is on the modules drawing.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'

let app: LiveApp
let page: Page
let pipelineId = ''

/** Lines this file writes into the corpus, so a measurement is never the page's own furniture. */
const FIRST_LINE = 'Nineteen boards, all of them at arm reach.'
const SECOND_LINE = 'Reprojection settled at four tenths of a pixel.'

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
  app = await liveApp({ name: 'graph-detail-control', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Wrist calibration sweep',
    summary: 'Does the wrist camera hold its calibration across a working day?',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  const modules: string[] = []
  for (const [name, line, label] of [
    ['Collect boards', FIRST_LINE, 'Board capture run'],
    ['Solve the intrinsics', SECOND_LINE, 'Intrinsics solve'],
  ] as const) {
    const block = await post(`/api/records/${pipelineId}/blocks`, { name, state: 'done' })
    const patched = await fetch(`${app.api}/api/records/${block.record.id}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ summary: line }),
    })
    if (!patched.ok) throw new Error(`PATCH the block answered ${String(patched.status)}: ${await patched.text()}`)
    // A MODULE WITH THE SAME NAME, LINE AND LABEL, for the cases on the modules drawing, which draws
    // modules only.
    const module = await post('/api/records', {
      kind: 'module',
      title: name,
      summary: line,
      data: { state: 'active', parts: [] },
    })
    modules.push(module.record.id)
    // LEVEL 1 IS WRITTEN ON BOTH STEPS, so the three steps of this control have three levels to
    // draw. A card's level 1 is a written label and nothing in the corpus had one, so on this
    // fixture steps 1 and 2 both drew the record's own name: the same words twice. The card skips a
    // level nobody wrote — a missing level is skipped when zooming — so a drawing whose records have no
    // level 1 really does say the same thing at steps 1 and 2, and a fixture asking whether the
    // three steps differ has to be a drawing whose records have all three.
    for (const id of [block.record.id, module.record.id]) {
      const revisions = await fetch(`${app.api}/api/records/${id}/revisions`, { headers: HEADERS })
      const list = (await revisions.json()) as { revisions: { seq: number; contentHash: string }[] }
      const newest = [...list.revisions].sort((a, b) => b.seq - a.seq)[0]
      if (newest === undefined) throw new Error(`${id} has no revision for a label to name`)
      const wrote = await fetch(`${app.api}/api/records/${id}/short-forms`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label } }),
      })
      if (!wrote.ok) throw new Error(`the label of ${id} was not stored: ${await wrote.text()}`)
    }
  }
  // THE TWO MODULES ARE LINKED, because the modules drawing folds away a module linked to no other.
  const linked = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fromId: modules[0], toId: modules[1], type: 'relates_to' }),
  })
  if (!linked.ok) throw new Error(`the two modules could not be linked: ${await linked.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open a drawing with nothing chosen, and wait until it has been laid out. */
async function openTheDrawing(hash = `pipeline/${pipelineId}`): Promise<void> {
  await page.goto(`${app.site}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await page.goto(`${app.site}/#/${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** Every object on the drawing, with the record it stands for and the words on it. */
async function whatTheCardsSay(): Promise<string> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.gx-card, .gx-group')]
      .map((el) => `${el.getAttribute('data-target') ?? ''} :: ${(el.textContent ?? '').replace(/\s+/g, ' ').trim()}`)
      .sort()
      .join('\n'),
  )
}

/**
 * What the drawing says its zoom is.
 *
 * IT REFUSES RATHER THAN ANSWERING ZERO when the readout is not on the page. A missing readout and
 * a drawing at 0% are different facts, and a helper that returns 0 for both turns "the drawing went
 * away" into "the zoom moved", which is a whole afternoon.
 */
async function zoomReadout(): Promise<number> {
  const seen = await page.evaluate(() => {
    const wrap = document.querySelector('.gx-canvas-wrap')
    return {
      words: document.querySelector('.gx-canvas-zoom')?.textContent ?? null,
      state: wrap === null ? 'there is no drawing on the page' : (wrap.getAttribute('data-state') ?? '?'),
      instead: wrap === null ? document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
    }
  })
  if (seen.words === null) {
    throw new Error(`the zoom readout is not on the page. The drawing is "${seen.state}". ${seen.instead}`)
  }
  return Number(seen.words.replace('%', ''))
}

/** Press the drawing's own bigger or smaller button until the readout is within 6 of the target. */
async function zoomTo(target: number): Promise<number> {
  for (let i = 0; i < 40; i += 1) {
    const at = await zoomReadout()
    if (Math.abs(at - target) <= 6) return at
    await page.getByRole('button', { name: at < target ? 'Bigger' : 'Smaller' }).click()
    await theDrawingHasSettled(page)
  }
  return zoomReadout()
}

/**
 * SET HOW MUCH THE DRAWING SAYS THE WAY A PERSON NOW DOES, and wait for it to be laid out again.
 *
 * IT USED TO PRESS A STEP OF A CONTROL OVER THE DRAWING. Criterion D14 took that control away,
 * because pressing it made the graph jump and it was not needed,
 * so the setting is written where the settings page writes it and the page is opened again. What
 * this file is about is unchanged: the drawing says something different at each position, zoom is
 * not one of them, and no position draws a box with no word in it.
 */
const THE_THREE = ['label', 'title', 'gist'] as const

async function setTheLevel(step: 1 | 2 | 3): Promise<void> {
  await page.evaluate((rung) => {
    window.localStorage.setItem('mole-office.detail.graph', rung)
  }, THE_THREE[step - 1] as string)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/**
 * THE CONTROL THIS FILE WAS NAMED AFTER IS GONE — CRITERION D14, 6 SEPTEMBER 2026.
 *
 * Four cases stood here and all four were about the three-step `Detail` control over a drawing: that
 * its steps were at a point a press would reach, that the row named its own axis, that each step
 * drew something different, and that `Put it back` appeared only once a choice had been made here.
 * The control itself was to go, as not needed, so there is nothing for them to
 * press. They are deleted rather than rewritten, because a control that does not exist cannot be
 * clipped away, which is the fault this file was written for.
 *
 * WHAT THE FILE STILL HOLDS is every claim that was never about the control: canvas zoom changes no
 * word, the wheel over the drawing does nothing, every object draws a name at the farthest view, and
 * the pipeline box stays a box at every position of the ladder. Those are now reached by setting the
 * level where the settings page sets it, which is where a person sets it now.
 */

describe('nothing over the drawing sets what its cards say', () => {
  it('draws no detail control over the drawing, and opens its cards where the place says', async () => {
    // CRITERION D14. The control is gone; where a card opens is `DRAWING_PLACES[…].opensAt` in
    // model.ts, which is `title` for all three drawings. A card at level 2 draws its name and its
    // state and not the record's own line, and this asserts the drawing opens there with nothing
    // stored — which is the whole of what the control used to be for.
    await openTheDrawing('pipeline/drawing')
    expect(await page.locator('.gx-says').count(), 'the drawing still carries a detail ladder').toBe(0)
    expect(await page.locator('.gx-says-step').count(), 'the drawing still carries detail steps').toBe(0)
    expect(await page.locator('.gx-says-back').count(), 'the drawing still offers to undo a detail choice').toBe(0)
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('.gx-control-name')].map((el) => (el.textContent ?? '').trim()),
    )
    expect(names, 'a control over the drawing is still named Detail').not.toContain('Detail')
    const words = await whatTheCardsSay()
    expect(words, 'the drawing opened above the level its place asks for').not.toContain(FIRST_LINE)
    expect(words, 'nothing was drawn at all').toContain('Collect boards')
  }, 180_000)
})

describe('canvas zoom is not semantic detail', () => {
  it('says exactly the same thing at about 85% and at about 147%', async () => {
    await openTheDrawing('pipeline/drawing')
    const low = await zoomTo(85)
    const atLow = await whatTheCardsSay()
    const high = await zoomTo(147)
    const atHigh = await whatTheCardsSay()
    expect(
      Math.abs(high - low),
      `the zoom buttons did not move the drawing: ${String(low)}% then ${String(high)}%. A run that ` +
        `never zoomed proves nothing about zoom.`,
    ).toBeGreaterThan(40)
    expect(
      atHigh,
      `a card said something different at ${String(high)}% from what it said at ${String(low)}%. Zoom scales ` +
        `geometry; how much a card says is the control above the drawing. Fusing them is what made every ` +
        `card an empty box at Fit all, and the two are kept apart.`,
    ).toBe(atLow)
  }, 300_000)

  it('leaves the zoom where it was when a card is given more room', async () => {
    // IT USED TO PRESS A DETAIL STEP, which no longer exists (D14). The claim is the same one and it
    // is about the two states staying two: moving how much a card says must not move the zoom. What
    // moves how much a card says now is the card's own controls, so those are what is pressed.
    await openTheDrawing('pipeline/drawing')
    const held = await zoomTo(147)
    // A CARD WHOSE CORNER NO CONTROL COVERS. At 147% on the modules drawing the first card's corner can
    // sit under the drawing's own controls, and the press would land on `Start again` instead.
    const free = await page.evaluate(() =>
      [...document.querySelectorAll('.gx-card')].findIndex((card) => {
        const box = card.getBoundingClientRect()
        const hit = document.elementFromPoint(box.left + 3, box.top + 3)
        return hit !== null && card.contains(hit)
      }),
    )
    if (free < 0) throw new Error('every card has a control over its corner at 147%, so no card could be pressed')
    await page.locator('.gx-card').nth(free).click({ position: { x: 3, y: 3 } })
    await theDrawingHasSettled(page)
    await page.locator('.gx-card-strip button[aria-label="More room for this card"]').first().click()
    await theDrawingHasSettled(page)
    expect(await zoomReadout(), 'giving a card more room moved the zoom').toBe(held)
  }, 300_000)

  it('changes nothing when the wheel is turned over the drawing', async () => {
    await openTheDrawing('pipeline/drawing')
    const before = { zoom: await zoomReadout(), cards: await whatTheCardsSay() }
    const box = await page.locator('.gx-canvas').boundingBox()
    if (box === null) throw new Error('the drawing has no box to put a pointer over')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (const by of [-600, 600, -600]) {
      await page.mouse.wheel(0, by)
      await theDrawingHasSettled(page)
    }
    expect(await zoomReadout(), 'the wheel zoomed the drawing, and the page can no longer be scrolled past it').toBe(
      before.zoom,
    )
    expect(await whatTheCardsSay(), 'the wheel changed what a card says, which is a hidden gesture').toBe(before.cards)
  }, 240_000)
})

describe('what survives at the farthest view', () => {
  it('draws a name on every object at the least detail and the smallest the drawing goes', async () => {
    await openTheDrawing('pipeline/drawing')
    await setTheLevel(1)
    const opened = await zoomReadout()
    // ALL THE WAY DOWN, not `Fit all`. Fit all is whatever fits, and on a drawing of three objects
    // in a 1440 window it zooms IN — so a test written against it would call 112% "the farthest
    // view" and prove nothing. Pressing Smaller until the readout stops moving reaches the floor
    // the product itself puts under the reader, whatever the drawing happens to hold.
    //
    // AND THE BUTTON ITSELF SAYS WHEN THE FLOOR IS REACHED, since 5 September 2026. Criterion D1 of
    // design/drawings/ACCEPTANCE.md: a control that would change nothing is drawn as not available,
    // so `Smaller` at the smallest zoom is `aria-disabled` and a `click()` on it waits for ever
    // rather than failing. Asking whether it is still available is therefore the same question as
    // asking whether the readout would move, one press earlier.
    let floor = opened
    for (let i = 0; i < 30; i += 1) {
      const smaller = page.getByRole('button', { name: 'Smaller' })
      if (!(await smaller.isEnabled())) break
      await smaller.click()
      await theDrawingHasSettled(page)
      const now = await zoomReadout()
      if (now === floor) break
      floor = now
    }
    await theDrawingHasSettled(page)
    const far = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.gx-card, .gx-group')]
      return {
        boxes: boxes.length,
        nameless: boxes
          .filter((el) => (el.querySelector('.gx-card-title')?.textContent ?? '').trim() === '')
          .map((el) => el.getAttribute('data-target') ?? '(no record)'),
      }
    })
    expect(far.boxes, 'nothing was drawn at all, so this proves nothing about names').toBeGreaterThan(0)
    expect(
      floor,
      `the drawing would not go any smaller than the ${String(opened)}% it opened at, so this is not the ` +
        `farthest view and the check below means nothing`,
    ).toBeLessThan(opened)
    expect(
      far.nameless,
      `at the least detail and ${String(floor)}% these objects were drawn with no name. Every position of ` +
        `this ladder draws a name: a box with no word in it is the drawing refusing to say what it knows, ` +
        `which is the fault the zoom bands were deleted for.`,
    ).toEqual([])
  }, 300_000)

})
