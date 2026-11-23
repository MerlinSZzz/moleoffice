// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE 54-BOX MASTER CROWDS NO LINE'S WORDS, AT 1440 AND 660. Wave 13u round 232.
 *
 * A line's words are the small label on it, such as "waits on". The lanes engine places them on the line clear of the
 * cards, the area headings and the other words; when it finds no clear place, it puts them where they first fit and
 * names the line in the crowdedWords list of the drawing root's data-fit. The list holds the lines drawn at rest and the
 * lines drawn for each card's selection, since the engine works both out before it draws.
 *
 * WHY. On round 231's tip, a4df6fd83, the made-up master of 54 boxes at rest named 8 lines at 1440, 6 at 990 and 8 at
 * 660, in light and in dark. The made-up master at its real shape, the reel page and block 08 named none.
 *
 * THE DRAWING is tests/a-made-up-reel-page-and-a-master-of-54-boxes.ts's master of 54 boxes, stored by
 * tests/a-made-up-reel-page-and-master-opened-fresh.ts in a test office of this file, at its Boxes level.
 *
 * EACH CASE opens the master at one width by 1000, in light, with a fresh navigation, waits until it has written
 * data-fit, every card it draws is on it, and no element says it is being drawn, and makes no press. Then the
 * crowdedWords of data-fit is empty. A failure names the width and each line in the list, by its ends' keys in the
 * file and its type, with the zoom and card width the fit chose.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'
import { DRAWING, prepareThePage, theAreasWereStored, theDrawingIsDrawn } from './a-made-up-office-drawn-in-lanes.ts'
import type { Stored } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'
import { setTheMasterAndStoreTheAreas, storeTheTwoDrawings, type Drawing } from './a-made-up-reel-page-and-master-opened-fresh.ts'

const WIDTHS = [1440, 660] as const
const DRAWN_WITHIN = 120_000
const CASE_ALLOWANCE = 240_000
let opens = 0

describe('the made-up master of 54 boxes crowds no line words', () => {
  const PROJECT = { id: 'test-lanes-crowded-master-54', title: 'Example office for the 54-box master line words (made up)' }
  let db: TestDb
  let app: LiveApp
  let stored: Record<Drawing, Stored>

  beforeAll(async () => {
    db = await freshDb()
    stored = await storeTheTwoDrawings(db, PROJECT)
    app = await liveApp({ name: 'lanes-crowded-master-54', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
    const areas = await setTheMasterAndStoreTheAreas(app, db, PROJECT.id, stored)
    theAreasWereStored(areas.master, 'the made-up master of 54 boxes')
    await prepareThePage(app, PROJECT.id)
  }, 300_000)
  afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

  for (const width of WIDTHS) {
    it(`the made-up master of 54 boxes at rest, ${width} x 1000: data-fit names no line whose words are crowded`, async () => {
      const one = stored.master
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.goto(`${app.site}/?lang=en&theme=light&open=${++opens}#${pipelinePath(one.pipeline)}`, { waitUntil: 'commit', timeout: DRAWN_WITHIN })
      await waitForThePage(app.page, 30_000)
      await waitForTheProjects(app.page)
      await app.page.waitForFunction(({ ids }) => {
        const root = document.querySelector('[data-drawing="lanes"][data-level="boxes"][data-fit]')
        if (root === null || document.querySelector('[data-being-drawn]') !== null) return false
        return ids.every((id) => [...root.querySelectorAll('.e-card')].some((card) => card.getAttribute('data-id') === id))
      }, { ids: one.cards }, { timeout: DRAWN_WITHIN, polling: 100 })
      await theDrawingIsDrawn(app.page)
      const fit = JSON.parse((await app.page.locator(DRAWING).getAttribute('data-fit')) ?? 'null') as { crowdedWords?: unknown; zoom?: number; card?: number } | null
      expect(fit, `the made-up master of 54 boxes, ${width} x 1000: the drawing wrote data-fit`).not.toBeNull()
      expect(Array.isArray(fit!.crowdedWords), `the made-up master of 54 boxes, ${width} x 1000: data-fit has a crowdedWords list`).toBe(true)
      const crowded = (fit!.crowdedWords as string[]).map((link) => one.linkNamed.get(link) ?? `a line not in the file, ${link}`)
      console.log(`CROWDED ${JSON.stringify({ width, zoom: fit!.zoom, card: fit!.card, crowded })}`)
      expect(crowded, `the made-up master of 54 boxes at rest, ${width} x 1000, zoom ${String(fit!.zoom)}, card ${String(fit!.card)} px: ${crowded.length} lines have crowded words: ${crowded.join('; ')}`).toEqual([])
    }, CASE_ALLOWANCE)
  }
})
