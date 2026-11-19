// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SHORT PRESS AND A DRAG MOVES THE WHOLE DRAWING — CRITERION D31.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAULT, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Section 11 of design/drawings/ACCEPTANCE.md, on the owner’s own Handover v2 pipeline:
 *
 *   a short press on anything followed by a drag did not move the view, since only a long press
 *   did, and inside a large drawn block the mouse could not move the view at all.
 *
 * Measured in Chromium at 1440 on an isolated copy of the owner’s database, before the fix. A short press
 * and a drag of 120 across and 60 up:
 *
 *   on the bare ground        the window went from translate(4px, 40px) to translate(124px, -20px)
 *   inside the pipeline box   the window stayed at translate(4px, 40px)
 *   on a card                 the window stayed at translate(4px, 40px)
 *
 * The owner’s box is 3578 layout pixels wide, so most of the owner’s drawing was a place the view could not be
 * moved from at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS TEST HOLDS, AND WHAT IT DELIBERATELY STILL HOLDS FROM D22
 * ---------------------------------------------------------------------------------------
 *
 * A short press and a drag pans, wherever it lands, and moves no card, on the bare ground and on a
 * card.
 *
 * ---------------------------------------------------------------------------------------
 * ON THE MODULES DRAWING SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes now, not this canvas, and no address draws a pipeline's
 * box any more. The bare ground and the card cases press the modules drawing, which still draws this
 * canvas.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put `nopan` back on `.gx-card` in Canvas.tsx → the card case goes red: the window stands still.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'

let app: LiveApp
let page: Page
let pipelineId = ''

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
  app = await liveApp({ name: 'a-short-press-pans', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Wrist calibration sweep',
    summary: 'Does the wrist camera hold its calibration across a working day?',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  for (const name of ['Collect boards', 'Solve the intrinsics', 'Check the reprojection']) {
    await post(`/api/records/${pipelineId}/blocks`, { name, state: 'done' })
  }
  // A CARD BESIDE THE BOX, so the card case has something to press that is not a step.
  const module = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: 'Three of four printed wrist mounts broke below the load the handover trials need.',
    data: { state: 'active', parts: [] },
  })
  const linked = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fromId: module.record.id, toId: pipelineId, type: 'relates_to' }),
  })
  if (!linked.ok) throw new Error(`the module could not be linked to the pipeline: ${await linked.text()}`)
  // A SECOND MODULE LINKED TO THE FIRST, so the modules drawing draws both cards. A module linked to
  // no other module is folded away there as isolated, and the card case would have no card to press.
  const second = await post('/api/records', {
    kind: 'module',
    title: 'Bench jig',
    summary: 'Holds the mount while it is pulled.',
    data: { state: 'active', parts: [] },
  })
  const paired = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fromId: module.record.id, toId: second.record.id, type: 'relates_to' }),
  })
  if (!paired.ok) throw new Error(`the two modules could not be linked: ${await paired.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(theme: 'light' | 'dark', hash = `pipeline/${pipelineId}`): Promise<void> {
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
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** Wait until the page has drawn one more frame, so the last move of a drag is on the screen. */
async function aFrameIsDrawn(on: Page): Promise<void> {
  await on.evaluate(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))
}

interface Shot {
  /**
   * WHERE EACH CARD IS ON THE DRAWING, not on the screen. A pan moves every card on screen by the
   * same amount, so a screen reading cannot tell "the picture moved" from "the cards moved" — which
   * is the exact confusion this criterion is about. The node's own transform is the drawing's own
   * pixels and does not change when the window does.
   */
  boxes: Record<string, string>
  view: string
}

async function shot(): Promise<Shot> {
  return page.evaluate(() => {
    const boxes: Record<string, string> = {}
    for (const el of document.querySelectorAll('.react-flow__node')) {
      boxes[el.getAttribute('data-id') ?? ''] = (el as HTMLElement).style.transform
    }
    const view = document.querySelector('.react-flow__viewport')
    return { boxes, view: view === null ? 'none' : window.getComputedStyle(view).transform }
  })
}

function moved(before: Shot, after: Shot): string[] {
  return Object.keys(before.boxes).filter((id) => before.boxes[id] !== after.boxes[id])
}

/**
 * A point on the drawing that really is the thing named, found by asking the browser what is under
 * it. `ground` is the bare canvas, `.gx-group` is the pipeline's box, `.gx-card` is a card. A grip,
 * a button and a card's control strip are all somebody else's press and are skipped.
 */
async function pointOn(what: 'ground' | '.gx-group' | '.gx-card'): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((which) => {
    const wrap = document.querySelector('.gx-canvas-wrap')?.getBoundingClientRect()
    if (wrap === undefined) return null
    for (let y = wrap.top + 30; y < Math.min(wrap.bottom - 20, window.innerHeight - 10); y += 7) {
      for (let x = wrap.left + 30; x < Math.min(wrap.right - 20, window.innerWidth - 10); x += 7) {
        const el = document.elementFromPoint(x, y)
        if (el === null) continue
        if (which === 'ground') {
          if (el.closest('.react-flow__node') === null && el.closest('.gx-canvas') !== null) return { x, y }
          continue
        }
        const node = el.closest(which)
        if (node === null) continue
        if (el.closest('.gx-grip, button, a, .gx-card-controls') !== null) continue
        // WELL INSIDE THE THING, not on its rim. The eight grips sit on the edges, and a press one
        // pixel off one of them is a press the grip may still take.
        const box = node.getBoundingClientRect()
        if (x - box.left < 25 || box.right - x < 25 || y - box.top < 25 || box.bottom - y < 25) continue
        return { x, y }
      }
    }
    return null
  }, what)
  if (at === null) throw new Error(`no point on screen is ${what}`)
  return at
}

/** Press at a point and drag 120 across and 60 up, moving the pointer at once. */
async function dragFrom(from: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(from.x + (120 * step) / 10, from.y - (60 * step) / 10, { steps: 2 })
    await aFrameIsDrawn(page)
  }
  await page.mouse.up()
  await theDrawingHasSettled(page)
}

// DARK ONLY. This file is one of the two canary files whose dark run stays, so the light repeat is
// the half that goes; the cases are the same presses and the same assertions.
for (const theme of ['dark'] as const) {
  describe(`a short press and a drag moves the drawing, in ${theme}`, () => {
    it('moves the window when the press lands on the bare ground', async () => {
      await openTheDrawing(theme, 'pipeline/drawing')
      const before = await shot()
      await dragFrom(await pointOn('ground'))
      const after = await shot()
      expect(after.view, 'the window moved').not.toBe(before.view)
      expect(moved(before, after), 'and no card moved on the drawing').toEqual([])
    }, 180_000)

    it('moves the window when the press lands on a card', async () => {
      await openTheDrawing(theme, 'pipeline/drawing')
      const before = await shot()
      await dragFrom(await pointOn('.gx-card'))
      const after = await shot()
      expect(after.view, 'the window moved from on a card').not.toBe(before.view)
      expect(moved(before, after), 'and no card moved on the drawing').toEqual([])
    }, 180_000)
  })
}
