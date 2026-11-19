// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LONG PRESS MOVES A CARD WITH A MOUSE HELD DOWN, AND THE CARD SAYS SO — CRITERION D25.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Section 23 of design/messages/ACCEPTANCE.md: after a long press, a card still could not be dragged.
 * A card held down with a mouse did not move.
 *
 * MEASURED ON THE OWNER'S OWN PIPELINE, on an isolated copy of the owner's database. A mouse held on a step card for
 * 900 milliseconds and then dragged 100 across and 60 down moved ALL EIGHTEEN cards by exactly that,
 * and the canvas transform with them. Nothing had picked the card up: React Flow was panning the
 * whole picture, because the free drag turned a mouse away at its first line and the pane took the
 * drag instead.
 *
 * TWO THINGS ARE UNDER TEST HERE, and the second is why the first was never found by anybody but
 * the owner. A long press has nothing to see: no handle, no cursor, no words. So the card now says what a
 * press on it does before anybody presses, and says when the hold has taken.
 *
 * tests/a-long-press-moves-a-card-on-a-phone.test.ts is the same gesture with a finger, and it
 * passed throughout — which is exactly why a phone test could not have caught this.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put `e.pointerType !== 'touch'` back into `useFreeDrag`'s pointer-down (Canvas.tsx) → the two
 *     moving cases go red, and the words case with them: nothing is ever picked up.
 *   set `A_LONG_PRESS_ON_A_CARD` to 30 seconds → the moving cases go red while the words on the
 *     card stay, so the hold itself is proved rather than the handler being present.
 *   drop `setPickedUp(true)` from the timer → the case about the card saying it is held goes red
 *     and the moving cases stay green, so the two halves are proved apart.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let page: Page
let richId = ''

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
  app = await liveApp({ name: 'long-press-with-a-mouse', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const rich = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: 'Three of four printed wrist mounts broke below the load the handover trials need.',
    data: { state: 'active', parts: [] },
  })
  richId = rich.record.id
  for (const [title, summary] of [
    ['Bench jig', 'Holds the mount while it is pulled.'],
    ['Load cell bench', 'Where the pulls are done and the numbers come from.'],
  ] as const) {
    const made = await post('/api/records', { kind: 'module', title, summary, data: { state: 'active', parts: [] } })
    const linked = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: richId, toId: made.record.id, type: 'relates_to' }),
    })
    if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(theme: 'light' | 'dark'): Promise<void> {
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
  await page.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** Wait until the page has drawn one more frame, so the last move of a drag is on the screen. */
async function aFrameIsDrawn(on: Page): Promise<void> {
  await on.evaluate(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))
}

/** Every card's place on screen, and the window onto the drawing. */
async function shot(): Promise<{ boxes: Record<string, { x: number; y: number }>; view: string }> {
  return page.evaluate(() => {
    const boxes: Record<string, { x: number; y: number }> = {}
    for (const el of document.querySelectorAll('.react-flow__node')) {
      const box = el.getBoundingClientRect()
      boxes[el.getAttribute('data-id') ?? ''] = { x: Math.round(box.x), y: Math.round(box.y) }
    }
    const view = document.querySelector('.react-flow__viewport')
    return { boxes, view: view === null ? 'none' : window.getComputedStyle(view).transform }
  })
}

/** The middle of the card, which is its empty space rather than its name or an edge. */
async function theMiddle(): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((id) => {
    const el = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
    if (el === null) return null
    const box = el.getBoundingClientRect()
    const x = Math.round(box.x + box.width / 2)
    const y = Math.round(box.y + box.height / 2)
    if (y > window.innerHeight - 8 || y < 8) return null
    const under = document.elementFromPoint(x, y)
    return under !== null && under.closest('button, a, .gx-grip, .gx-card-controls') === null ? { x, y } : null
  }, richId)
  if (at === null) throw new Error('the card’s empty space is not on screen')
  return at
}

function moved(before: Record<string, { x: number; y: number }>, after: Record<string, { x: number; y: number }>): string[] {
  return Object.keys(before).filter((id) => {
    const was = before[id]
    const now = after[id]
    return was === undefined || now === undefined || Math.abs(was.x - now.x) > 1 || Math.abs(was.y - now.y) > 1
  })
}

for (const theme of ['light'] as const) {
  describe(`a long press with a mouse moves the card, in ${theme}`, () => {
    it('moves that card and nothing else', async () => {
      await openTheDrawing(theme)
      const before = await shot()
      const at = await theMiddle()
      const card = await page.evaluate(
        (id) => document.querySelector(`.gx-card[data-target^="record/${id}/"]`)?.closest('.react-flow__node')?.getAttribute('data-id') ?? '',
        richId,
      )
      await page.mouse.move(at.x, at.y)
      await page.mouse.down()
      // A FIXED HOLD, NOT A WAIT FOR THE CARD'S MARK. This case must stay green when the mark is taken
      // away (the third mutation in the header), so it cannot wait on the mark.
      await page.waitForTimeout(900)
      for (let step = 1; step <= 10; step += 1) {
        await page.mouse.move(at.x + (130 * step) / 10, at.y + (70 * step) / 10, { steps: 2 })
        await aFrameIsDrawn(page)
      }
      await page.mouse.up()
      await theDrawingHasSettled(page)
      const after = await shot()
      expect(moved(before.boxes, after.boxes), 'only the card that was held moved').toEqual([card])
      expect(after.boxes[card]?.x ?? 0, 'it went where the pointer went, across').toBeGreaterThan(
        (before.boxes[card]?.x ?? 0) + 100,
      )
      expect(after.view, 'the window onto the drawing did not move').toBe(before.view)
    }, 240_000)

    it('says what a press does, and says when the card has been picked up', async () => {
      await openTheDrawing(theme)
      const said = await page.evaluate(
        (id) => document.querySelector(`.gx-card[data-target^="record/${id}/"]`)?.getAttribute('title') ?? null,
        richId,
      )
      expect(said ?? '', 'the card says a press moves it').toContain('drag it to move it')
      const at = await theMiddle()
      const held = async () =>
        page.evaluate(
          (id) => document.querySelector(`.gx-card[data-target^="record/${id}/"]`)?.getAttribute('data-picked-up') ?? null,
          richId,
        )
      expect(await held(), 'nothing is held before anybody presses').toBe(null)
      await page.mouse.move(at.x, at.y)
      await page.mouse.down()
      // THESE TWO ARE FIXED TIMES ON PURPOSE. What this case holds is how long a press must last:
      // nothing at 200 milliseconds, and picked up by 1.1 seconds.
      await page.waitForTimeout(200)
      expect(await held(), 'and nothing is held before the hold is long enough').toBe(null)
      await page.waitForTimeout(900)
      expect(await held(), 'the card says it has been picked up').toBe('1')
      await page.mouse.up()
      await theDrawingHasSettled(page)
      expect(await held(), 'and says it has been put down again').toBe(null)
    }, 240_000)
  })
}
