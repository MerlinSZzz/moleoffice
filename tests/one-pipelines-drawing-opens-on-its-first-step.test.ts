// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PIPELINE'S DRAWING OPENS ON ITS FIRST STEP, IN A BOX DRAWN ONLY BY ITS DASHED EDGE (wave 13y round 82).
 *
 * The drawing of one pipeline is wider than the window. It opened at its top-left corner, on the modules that carry
 * the steps, so the pipeline's box began at the window's right edge, where only the empty space above its first step
 * showed, and in a narrow window none of the box was in view. The box is a React Flow node of the type "group", and
 * React Flow's own stylesheet gave that type a quarter-white fill and a near-black border: in dark a flat grey block,
 * in light a pale box with a second edge around the dashed one.
 *
 * Over the seed's made-up office, at 1440, 990 and 660 pixels in both themes, the card of the pipeline's first stored
 * step is wholly inside the drawing's pane and inside the window, and the box's holder has no fill and no border while
 * the box keeps its dashed edge. Every size and place is read from the page. With W13Y_ONE_PIPELINE_SHOTS set, it
 * photographs the drawing at those widths and the list at 390, under the made-up label.
 *
 * ---------------------------------------------------------------------------------------
 * THE CASES ARE ON THE PIPELINE'S LANES SINCE 15 NOVEMBER 2026, AND ASK NOTHING OF A BOX
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes, not the canvas. So the first step's card is read on the lanes
 * ([data-drawing="lanes"] .e-card), and the pane it must lie inside is the lanes' frame (.e-frame), which
 * clips what lies outside it as the canvas's pane did. The wait for the view to settle is the lanes' own
 * wait for ten still frames. The four checks on the box went: that a box's holder was drawn, that it had
 * no fill, that it had no border, and that the box kept its dashed edge. The lanes draw a pipeline's
 * steps in one lane that no record heads, with no frame, so there is no box on this page to ask about.
 * The photographs are taken of the lanes, and at 390 of the lanes' outline of cards.
 *
 * Its mutation, after a control run, and put back afterwards: in `drawTree` in
 * src/web/components/graph/lanes/engine.ts, add the frame's width to the world's left offset (`ox`), so
 * the whole drawing is placed one frame to the right of where it is laid out → both cases go red, with
 * the first step's card across the pane's side edge.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { DRAWING, cardOf, theDrawingHoldsStill } from './a-made-up-office-drawn-in-lanes.ts'

const TITLE = 'Reel to searchable page'
const SHOTS = process.env.W13Y_ONE_PIPELINE_SHOTS
const LABEL = 'Made-up data — the seed\'s pipeline "Reel to searchable page" in a test office, not real office data'
let db: TestDb, app: LiveApp
let pipelineId = '', firstStep = ''

async function firstStoredStep(id: string): Promise<string> {
  const read = (await (await fetch(`${app.api}/api/records/${encodeURIComponent(id)}`)).json()) as { record: { data: { blockIds?: unknown } } }
  const ids = read.record.data.blockIds
  if (!Array.isArray(ids) || typeof ids[0] !== 'string') throw new Error(`pipeline ${id} stores no first step`)
  return ids[0]
}

beforeAll(async () => {
  db = await freshDb()
  await import('../scripts/seed.ts')
  app = await liveApp({ name: 'one-pipeline-opens-on-its-first-step', database: db.file, viewport: { width: 1440, height: 1000 } })
  const listed = (await (await fetch(`${app.api}/api/records?kind=pipeline&limit=100`)).json()) as { records: { id: string; title: string }[] }
  const one = listed.records.find((record) => record.title === TITLE)
  if (one === undefined) throw new Error(`the seed no longer holds "${TITLE}"`)
  pipelineId = one.id
  firstStep = await firstStoredStep(pipelineId)
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

async function opened(theme: 'light' | 'dark', width: number, height: number) {
  const context = await app.browser.newContext({ viewport: { width, height }, colorScheme: theme })
  await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
  const page = await context.newPage()
  await page.goto(`${app.site}/#/pipeline/${encodeURIComponent(pipelineId)}`, { timeout: 60_000 })
  await page.locator('main.page').first().waitFor({ timeout: 60_000 })
  await page.waitForFunction(
    () => [...document.querySelectorAll('main.page .gx-loading')].every((one) => !(one as HTMLElement).checkVisibility()),
    undefined,
    { timeout: 60_000 },
  )
  return { context, page }
}

for (const theme of ['light', 'dark'] as const) {
  it(`in ${theme}, the first step is in the window and inside the lanes' frame at 1440, 990 and 660`, async () => {
    for (const width of [1440, 990, 660]) {
      const { context, page } = await opened(theme, width, 1000)
      const step = page.locator(cardOf(firstStep))
      await step.waitFor({ timeout: 60_000 })
      // The lanes are laid out again after the first step's card is drawn, so the reading waits until the drawing
      // has stayed the same for ten animation frames.
      await theDrawingHoldsStill(page)
      const seen = await step.evaluate((card, drawing) => {
        const edges = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
        return {
          card: edges(card.getBoundingClientRect()),
          pane: edges(document.querySelector(`${drawing} .e-frame`)!.getBoundingClientRect()),
          window: { right: document.documentElement.clientWidth, bottom: document.documentElement.clientHeight },
        }
      }, DRAWING)
      const at = `${theme} at ${width}: ${JSON.stringify(seen)}`
      expect.soft(seen.card.left >= seen.pane.left && seen.card.right <= seen.pane.right, `the first step's card lies across the pane's side edges, ${at}`).toBe(true)
      expect.soft(seen.card.top >= seen.pane.top && seen.card.bottom <= seen.pane.bottom, `the first step's card lies across the pane's top or bottom, ${at}`).toBe(true)
      expect.soft(seen.card.top >= 0 && seen.card.bottom <= seen.window.bottom && seen.card.right <= seen.window.right, `the first step's card is not wholly in the window, ${at}`).toBe(true)
      if (SHOTS) {
        await putTheMadeUpLabelIn(page, LABEL, page.locator(DRAWING), `the pipeline drawing, ${theme} at ${width}`)
        await page.screenshot({ path: `${SHOTS}/${theme}-${width}.png` })
      }
      await context.close()
    }
    if (SHOTS) {
      const { context, page } = await opened(theme, 390, 844)
      await page.locator(`${DRAWING} .e-card`).first().waitFor({ timeout: 60_000 })
      await putTheMadeUpLabelIn(page, LABEL, page.locator(DRAWING), `the pipeline list, ${theme} at 390`)
      await page.screenshot({ path: `${SHOTS}/${theme}-390.png` })
      await context.close()
    }
  }, 300_000)
}
