// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MOVED CARD TAKES ITS LINES WITH IT — CRITERIA D32 AND D34.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Section 11 of design/drawings/ACCEPTANCE.md, defects 2 and 4:
 *
 * After a long-press drag of a large card, its lines did not follow: they stayed where they were, and
 * only resizing the card moved them. Dragging another card connected to it left that card's lines at
 * a fixed offset, at about the card's old place to the upper left, until a resize put them back.
 *
 * Measured in Chromium at 1440 on an isolated copy of the owner's database, before the fix. A long press
 * moved the owner's Handover v2 box from translate(771px, 116.333px) to translate(959.235px, 222.216px)
 * and its first step from translate(795px, 217.333px) to translate(983.235px, 323.216px) — and
 * 0 of the 11 lines on the drawing changed by a single pixel.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE CAUSE BEHIND BOTH
 * ---------------------------------------------------------------------------------------
 *
 * A line draws the route ELK worked out, in the drawing's absolute pixels. The route was dropped
 * only for a card with a STORED place, and a drag does not produce one until the store has answered
 * and the graph has been read again — which does not happen in that visit. So the route outlived
 * the move. `whatIsNotWhereElkPutIt` in Canvas.tsx now counts a card moved in this visit as well,
 * and every step inside a moved box with it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop `movedInThisVisit` from `whatIsNotWhereElkPutIt` (start the set empty) → 2 of the 4 cases
 *     go red, including the card case with "the line was redrawn: expected 'M 143 108 L 143 260'
 *     not to be 'M 143 108 L 143 260'". Run.
 *   drop the descendants pass from `whatIsNotWhereElkPutIt` → 2 of the 4 go red with "every line
 *     between the steps followed the box: expected [ …(3) ] to deeply equal []": the three lines
 *     between the steps inside the box keep ELK's route. Run.
 *
 * AND ONE MUTATION THAT DOES NOT TURN IT RED, SAID HERE RATHER THAN LEFT OUT. Taking `movedHere`
 * out of the `edges` memo's dependency list in Canvas.tsx left all 4 green (run, 6 September 2026).
 * The dependency is right — `toFlowEdges` reads that set — but something else changes on the render
 * after a drag and rebuilds the memo anyway, so this test does not catch its absence. Do not read
 * the green as permission to take it out.
 *
 * ---------------------------------------------------------------------------------------
 * THE BOX CASE IS NOT HERE SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The old canvas draws a pipeline's box at no address: a filed pipeline's page draws its lanes. So
 * no case in this file now proves the descendants pass in `whatIsNotWhereElkPutIt`, and the second
 * mutation above would leave this file green. It is kept here as what the file proved until then.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let page: Page
let pipelineId = ''
let moduleId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function link(fromId: string, toId: string, type: string): Promise<void> {
  const res = await fetch(`${app.api}/api/links`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ fromId, toId, type }) })
  if (!res.ok) throw new Error(`the link could not be made: ${await res.text()}`)
}

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-moved-card-takes-its-lines', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Wrist calibration sweep',
    summary: 'Does the wrist camera hold its calibration across a working day?',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  // FOUR STEPS THAT WAIT ON EACH OTHER. The lines between the steps are the ones a moved box has to
  // take with it, and a step that waits on nothing draws no line at all.
  const steps: string[] = []
  for (const name of ['Collect boards', 'Solve the intrinsics', 'Check the reprojection', 'Write the report']) {
    const made = await post(`/api/records/${pipelineId}/blocks`, { name, state: 'done' })
    steps.push(made.record.id)
  }
  for (let i = 1; i < steps.length; i += 1) await link(steps[i - 1] as string, steps[i] as string, 'blocks')

  // A MODULE BESIDE THE BOX, joined to another module, so the card case has a line of its own that
  // is drawn without anything being pressed.
  const module = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: 'Three of four printed wrist mounts broke below the load the handover trials need.',
    data: { state: 'active', parts: [] },
  })
  moduleId = module.record.id
  const bench = await post('/api/records', {
    kind: 'module',
    title: 'Load cell bench',
    summary: 'Where the pulls are done and the numbers come from.',
    data: { state: 'active', parts: [] },
  })
  await link(moduleId, bench.record.id, 'relates_to')
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(theme: 'light' | 'dark', which: 'this pipeline' | 'every module' = 'this pipeline'): Promise<void> {
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
  await page.goto(`${app.site}/#/pipeline${which === 'this pipeline' ? `/${pipelineId}` : '/drawing'}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** Wait until the page has drawn one more frame, so the last move of a drag is on the screen. */
async function aFrameIsDrawn(on: Page): Promise<void> {
  await on.evaluate(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))
}

/**
 * Hold the pressed pointer still until the card or box under it says it has been picked up
 * (`data-picked-up`, set half a second into a still press), for at most five seconds. If nothing
 * is picked up by then, the drag goes on anyway, and the case's own assertions say what a press
 * that picked nothing up did.
 */
async function holdUntilPickedUp(on: Page): Promise<void> {
  await on.waitForSelector('[data-picked-up="1"]', { state: 'attached', timeout: 5_000 }).catch(() => undefined)
}

interface Shot {
  places: Record<string, string>
  paths: Record<string, string>
}

async function shot(): Promise<Shot> {
  return page.evaluate(() => {
    const places: Record<string, string> = {}
    for (const el of document.querySelectorAll('.react-flow__node')) places[el.getAttribute('data-id') ?? ''] = (el as HTMLElement).style.transform
    const paths: Record<string, string> = {}
    for (const el of document.querySelectorAll('.react-flow__edge')) paths[el.getAttribute('data-id') ?? ''] = el.querySelector('path')?.getAttribute('d') ?? ''
    return { places, paths }
  })
}

/** A point well inside one node, which is not a grip, a button or a card's control strip. */
async function pointInside(selector: string): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((which) => {
    const wrap = document.querySelector('.gx-canvas-wrap')?.getBoundingClientRect()
    if (wrap === undefined) return null
    for (let y = wrap.top + 20; y < Math.min(wrap.bottom - 10, window.innerHeight - 10); y += 6) {
      for (let x = wrap.left + 20; x < Math.min(wrap.right - 10, window.innerWidth - 10); x += 6) {
        const el = document.elementFromPoint(x, y)
        if (el === null) continue
        const node = el.closest(which)
        if (node === null) continue
        if (el.closest('.gx-grip, button, a, .gx-card-controls') !== null) continue
        const box = node.getBoundingClientRect()
        const inx = Math.min(22, box.width / 3)
        const iny = Math.min(22, box.height / 3)
        if (x - box.left < inx || box.right - x < inx || y - box.top < iny || box.bottom - y < iny) continue
        return { x, y }
      }
    }
    return null
  }, selector)
  if (at === null) throw new Error(`nothing on screen is ${selector}`)
  return at
}

async function holdAndDrag(from: { x: number; y: number }, by: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await holdUntilPickedUp(page)
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(from.x + (by.x * step) / 12, from.y + (by.y * step) / 12, { steps: 2 })
    await aFrameIsDrawn(page)
  }
  await page.mouse.up()
  await theDrawingHasSettled(page)
}

/** Every point in an SVG path's `d`, as pairs of numbers. */
function pointsOf(d: string): { x: number; y: number }[] {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? []
  const out: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < numbers.length; i += 2) out.push({ x: Number(numbers[i]), y: Number(numbers[i + 1]) })
  return out
}

for (const theme of ['light'] as const) {
  describe(`a moved card takes its lines with it, in ${theme}`, () => {
    it('moving a card puts its line’s end on the card, not near where it used to be', async () => {
      await openTheDrawing(theme, 'every module')
      const cardId = await page.evaluate(
        (id) => document.querySelector(`.gx-card[data-target^="record/${id}/"]`)?.closest('.react-flow__node')?.getAttribute('data-id') ?? null,
        moduleId,
      )
      expect(cardId, 'the module card is on the drawing').not.toBeNull()
      const before = await shot()
      const touching = Object.keys(before.paths).filter((id) => id.startsWith('link:'))
      expect(touching.length, 'the card has a line').toBeGreaterThan(0)
      await holdAndDrag(await pointInside('.gx-card'), { x: 180, y: -120 })
      const after = await shot()
      const line = touching[0] as string
      expect(after.paths[line], 'the line was redrawn').not.toBe(before.paths[line])
      // AND IT ENDS ON THE CARD. A line that merely changed could still be off by a fixed distance,
      // which is exactly what the owner reported; this is the check that says where it ends.
      const box = await page.evaluate((id) => {
        const node = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
        const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null
        if (node === null || viewport === null) return null
        const m = new DOMMatrixReadOnly(window.getComputedStyle(viewport).transform)
        const r = node.getBoundingClientRect()
        const pane = (viewport.parentElement as HTMLElement).getBoundingClientRect()
        // The node's box in the drawing's own pixels, which is what a path is written in.
        return {
          left: (r.left - pane.left - m.e) / m.a,
          right: (r.right - pane.left - m.e) / m.a,
          top: (r.top - pane.top - m.f) / m.d,
          bottom: (r.bottom - pane.top - m.f) / m.d,
        }
      }, cardId as string)
      expect(box, 'the card’s place on the drawing could be read').not.toBeNull()
      const ends = pointsOf(after.paths[line] ?? '')
      expect(ends.length, 'the line has points').toBeGreaterThan(1)
      const on = ends.some(
        (p) =>
          p.x > (box?.left ?? 0) - 30 && p.x < (box?.right ?? 0) + 30 && p.y > (box?.top ?? 0) - 30 && p.y < (box?.bottom ?? 0) + 30,
      )
      expect(on, 'one end of the line is on the card where it now is').toBe(true)
    }, 240_000)
  })
}
