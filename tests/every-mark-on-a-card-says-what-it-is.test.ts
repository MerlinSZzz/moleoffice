// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY MARK ON A CARD SAYS WHAT IT IS — CRITERION D20, MEASURED IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT TWO MARKS MEANT, AND WHY NOTHING ON THE CARD COULD SAY
 * ---------------------------------------------------------------------------------------
 *
 * Section 23 of design/messages/ACCEPTANCE.md asks what the grey dot at the top right of a card
 * and the box with 0 at the bottom left mean, and nothing on the card could say what either was.
 *
 * THE GREY DOT AT THE TOP-RIGHT is the record's state. It was drawn by
 * `.gx-card[data-state]::before`, a pseudo-element — which carries no title, no accessible name and
 * nothing to hover — so looking at it was the only thing anybody could do with it.
 *
 * THE BOX WITH A NUMBER AT THE BOTTOM-LEFT is a count: on the step cards of the owner's own Handover v2
 * pipeline it is `carries`, "2 modules carry this step". That one did carry its sentence on
 * `title`, and nothing else: no accessible name, and no word on a card with room for words.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   delete the `title` and `aria-label` from `StateMark` in CardFace.tsx → the state section goes
 *     red: the dot is drawn and says nothing, which is the page the owner met.
 *   stop drawing `StateMark` at all → the state section goes red twice over: no element, no name.
 *   make `cardAt` in card.ts pass `word: null` for every mark → the count section's word assertion
 *     goes red while its title assertion stays green, so the two halves are proved apart.
 *   drop `aria-label` from the count marks in CardFace.tsx → the count section goes red.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO COUNT CASES ARE ON THE MODULES DRAWING SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes now, not this canvas. The modules drawing still draws
 * this canvas and the count marks, so the two count cases open it and read the module's own marks.
 * The module's `carries` mark counts the steps that name the module, so its sentence says "name
 * this module".
 *
 * ---------------------------------------------------------------------------------------
 * THE STATE CASE IS ON THE PIPELINE'S LANES SINCE 15 NOVEMBER 2026, AND SAYS LESS
 * ---------------------------------------------------------------------------------------
 *
 * A module card on this canvas draws no state mark, and no address draws a step card on this canvas
 * any more, so the state case reads the pipeline's lanes. The lanes draw a state mark only on a step
 * that is not done, and the mark carries no hover words. So the case now proves this: the blocked
 * step's mark is in the top-right corner, carries its stored state and says that state out loud; the
 * done step draws no mark, and its chip says "done" in words. The two hover assertions are gone. That
 * is a change and not a fault: the chip says the state in words on every card.
 *
 * A MUTATION THAT TURNS IT RED: in `cardElement` in src/web/components/graph/lanes/engine.ts, take
 * out the `aria-label` the state mark is given. The blocked step's mark then says nothing out loud,
 * and the state case goes red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { cardOf, theDrawingIsDrawn } from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let page: Page
let pipelineId = ''
let doneStepId = ''
let blockedStepId = ''
let carrierId = ''

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
  app = await liveApp({ name: 'marks-say-what-they-are', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Wrist calibration sweep',
    summary: 'Does the wrist camera hold its calibration across a working day?',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  // TWO STATES, so the shape is read on two different stored words rather than on one.
  const done = await post(`/api/records/${pipelineId}/blocks`, { name: 'Collect boards', state: 'done' })
  doneStepId = done.record.id
  const blocked = await post(`/api/records/${pipelineId}/blocks`, { name: 'Solve the intrinsics', state: 'blocked' })
  blockedStepId = blocked.record.id

  // A MODULE THAT CARRIES A STEP, which is what puts the box-and-a-number mark on the step card.
  // It is the same mark the owner met on the owner's own pipeline: `carries`, drawn as a square.
  const carrier = await post('/api/records', {
    kind: 'module',
    title: 'Wrist camera',
    summary: 'The camera whose calibration this sweep is about, bolted above the gripper.',
    // A CHECKLIST, which is what draws the `progress` count on this module's own card. The module
    // is the card the third case grows, because it has a summary and so has a level 3 to grow into:
    // the automatic sizes skip a level nobody wrote, which is the owner's own rule.
    data: {
      state: 'active',
      parts: [
        {
          id: 'sweep',
          name: 'The sweep',
          items: [
            { id: 'sweep-1', text: 'Print the board', state: 'done' },
            { id: 'sweep-2', text: 'Warm the rig', state: 'done' },
            { id: 'sweep-3', text: 'Run the sweep', state: 'todo' },
            { id: 'sweep-4', text: 'Write the numbers up', state: 'todo' },
          ],
        },
      ],
    },
  })
  carrierId = carrier.record.id
  const carried = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fromId: carrierId, toId: doneStepId, type: 'implements' }),
  })
  if (!carried.ok) throw new Error(`the module could not be made to carry the step: ${await carried.text()}`)

  // A SECOND MODULE, linked to the first, so the modules drawing draws the first: it folds away a
  // module linked to no other module.
  const second = await post('/api/records', {
    kind: 'module',
    title: 'Bench jig',
    summary: 'Holds the board still while the sweep runs.',
    data: { state: 'active', parts: [] },
  })
  const paired = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fromId: carrierId, toId: second.record.id, type: 'relates_to' }),
  })
  if (!paired.ok) throw new Error(`the two modules could not be linked: ${await paired.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open one drawing from cold. A filed pipeline's address draws its lanes, so `lanes` waits for those. */
async function openTheDrawing(theme: 'light' | 'dark', hash: string, drawn: 'canvas' | 'lanes' = 'canvas'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
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

/** The state mark drawn on one lanes card, whether it is there, where it sits and what it says, and the card's chip. */
async function theStateMark(
  recordId: string,
): Promise<{ drawn: boolean; state: string | null; name: string | null; corner: string; chip: string | null }> {
  return page.evaluate((selector) => {
    const card = document.querySelector(selector)
    const chip = (card?.querySelector('.e-chip') as HTMLElement | null | undefined)?.innerText.trim() ?? null
    const mark = card?.querySelector('.e-mark')
    if (card === null || mark === null || mark === undefined) {
      return { drawn: false, state: null, name: null, corner: card === null ? 'no card' : 'no mark', chip }
    }
    const outer = card.getBoundingClientRect()
    const inner = mark.getBoundingClientRect()
    // WHICH CORNER IT IS IN, worked out from the boxes rather than from the stylesheet, because the
    // owner named a corner and that is the fact under test.
    const top = inner.top - outer.top < outer.height / 2
    const right = outer.right - inner.right < outer.width / 2
    return {
      drawn: true,
      state: mark.getAttribute('data-state'),
      name: mark.getAttribute('aria-label'),
      corner: `${top ? 'top' : 'bottom'}-${right ? 'right' : 'left'}`,
      chip,
    }
  }, cardOf(recordId))
}

/** Every count mark on one card: the numeral, the shape, the sentence, the name and the word. */
async function theCountMarks(
  recordId: string,
): Promise<{ kind: string | null; numeral: string; title: string | null; name: string | null; word: string | null }[]> {
  return page.evaluate((id) => {
    const card = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
    if (card === null) return []
    return [...card.querySelectorAll('.gx-mark')].map((mark) => ({
      kind: mark.getAttribute('data-mark'),
      numeral: (mark.querySelector('.num')?.textContent ?? '').trim(),
      title: mark.getAttribute('title'),
      name: mark.getAttribute('aria-label'),
      word: mark.querySelector('.gx-mark-word')?.textContent ?? null,
    }))
  }, recordId)
}

/** Grow one card by dragging its right edge, which is how it reaches the level that has room. */
async function growTheCard(recordId: string, by: number): Promise<void> {
  await page.locator(`.gx-card[data-target^="record/${recordId}/"]`).first().scrollIntoViewIfNeeded()
  await theDrawingHasSettled(page)
  const grip = await page.evaluate((id) => {
    const el = document.querySelector(`.gx-card[data-target^="record/${id}/"] .gx-grip[data-grip="right"]`)
    if (el === null) return null
    const box = el.getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }, recordId)
  if (grip === null) throw new Error(`the card for ${recordId} has no right grip on screen`)
  await page.mouse.move(grip.x, grip.y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(grip.x + (by * step) / 8, grip.y, { steps: 2 })
    await page.waitForTimeout(60)
  }
  await page.mouse.up()
  await theDrawingHasSettled(page)
}

// LIGHT ONLY. What a mark says on hover and out loud does not depend on the colour scheme.
for (const theme of ['light'] as const) {
  describe(`every mark on a card says what it is, in ${theme}`, () => {
    it('on a pipeline’s lanes, a blocked step’s top-right mark says its state out loud, and a done step’s chip says done', async () => {
      await openTheDrawing(theme, `pipeline/${pipelineId}`, 'lanes')
      const blocked = await theStateMark(blockedStepId)
      expect(blocked.drawn, 'the blocked step draws a state mark').toBe(true)
      expect(blocked.corner, 'it is in the corner that was asked about').toBe('top-right')
      expect(blocked.state, 'it carries the stored state it is drawn from').toBe('blocked')
      expect(blocked.name ?? '', 'a reader who cannot see the mark is told which state it is').toContain('blocked')

      // A SECOND STATE, so the words follow the record rather than being one string for every card. The
      // lanes draw no mark on a done step, and the step's chip says its state in words instead.
      const done = await theStateMark(doneStepId)
      expect(done.corner, 'the done step is not drawn on the lanes').not.toBe('no card')
      expect(done.drawn, 'a done step draws a state mark on the lanes').toBe(false)
      expect(done.chip, 'the done step’s chip does not say its state in words').toBe('done')
    }, 180_000)

    it('the box with a number says what it counts, on hover and out loud', async () => {
      await openTheDrawing(theme, 'pipeline/drawing')
      const marks = await theCountMarks(carrierId)
      expect(marks.length, 'the module a step names draws a count mark').toBeGreaterThan(0)
      const carries = marks.find((mark) => mark.kind === 'carries')
      expect(carries, 'the box-shaped mark is the one that was asked about').toBeDefined()
      expect(carries?.numeral, 'it draws the count as a numeral').toBe('1')
      expect(carries?.title ?? '', 'hovering it says what it counted').toContain('name this module')
      expect(carries?.name, 'a reader who cannot hover is told the same thing').toBe(carries?.title)
    }, 180_000)

    it('draws the word beside the numeral once the card has room for words', async () => {
      await openTheDrawing(theme, 'pipeline/drawing')
      const small = await theCountMarks(carrierId)
      const before = small.find((mark) => mark.kind === 'progress')
      expect(before, 'the module with a checklist draws a progress count').toBeDefined()
      expect(before?.word, 'a small card has no room for the word').toBe(null)
      await growTheCard(carrierId, 300)
      const big = await theCountMarks(carrierId)
      const grown = big.find((mark) => mark.kind === 'progress')
      expect(grown, 'the mark is still drawn on the grown card').toBeDefined()
      expect(grown?.word, 'a card with room for a sentence has room for the word').toBe('done')
      expect(grown?.title, 'and the whole sentence is still on it').toBe(before?.title)
    }, 180_000)
  })
}
