// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LANES LEGEND COVERS NOTHING ON THE REEL PAGE OR THE 54-BOX MASTER. Wave 13u round 231.
 *
 * The legend is the line at the bottom right of a lanes drawing's frame that says what each progress mark and each kind
 * of line means. Since round 231's 9844d48a3 it may wrap onto a second line, and the frame still holds only the 26 px of
 * a one-line legend, so the second line lies over the bottom of the drawing. On the made-up master of 54 boxes at 660
 * the legend's top is over the bottoms of the cards "Example box 50 (made up)" and "Example box 51 (made up)" and of
 * Area H.
 *
 * THE TWO DRAWINGS are tests/a-made-up-reel-page-and-a-master-of-54-boxes.ts, stored by
 * tests/a-made-up-reel-page-and-master-opened-fresh.ts. Each is opened in its own test office of this file: the reel
 * page at its Steps level, the master of 54 boxes at its Boxes level.
 *
 * EACH CASE opens one page at one width by 1000, in light, waits until it is drawn and no element says it is being drawn,
 * and makes no press. Then each item of the legend (each child of .e-key) lies inside the frame's box on screen, to a
 * pixel, and the legend's box covers no card's box (.e-card) and no area's box (.e-area) by more than a pixel. A failure
 * names the page, the width, each card and area covered with its title and its top and bottom edges, and the legend's
 * top edge.
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

type Edges = { left: number; right: number; top: number; bottom: number }
const edges = (box: Edges): string => `left ${box.left.toFixed(1)}, right ${box.right.toFixed(1)}, top ${box.top.toFixed(1)}, bottom ${box.bottom.toFixed(1)}`

async function openAt(app: LiveApp, one: Stored, level: 'boxes' | 'steps', width: number): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto(`${app.site}/?lang=en&theme=light&open=${++opens}#${pipelinePath(one.pipeline)}`, { waitUntil: 'commit', timeout: DRAWN_WITHIN })
  await waitForThePage(app.page, 30_000)
  await waitForTheProjects(app.page)
  await app.page.waitForFunction(({ level, ids }) => {
    const root = document.querySelector(`[data-drawing="lanes"][data-level="${level}"][data-fit]`)
    if (root === null || document.querySelector('[data-being-drawn]') !== null) return false
    return ids.every((id) => [...root.querySelectorAll('.e-card')].some((card) => card.getAttribute('data-id') === id))
  }, { level, ids: one.cards }, { timeout: DRAWN_WITHIN, polling: 100 })
  await theDrawingIsDrawn(app.page)
}

async function theLegendCoversNothing(app: LiveApp, where: string, width: number): Promise<void> {
  expect(await app.page.locator('[data-being-drawn]').count(), `${where}, ${width} x 1000: no element says it is being drawn`).toBe(0)
  const read = await app.page.locator(DRAWING).evaluate((root) => {
    const edgesOf = (element: Element) => {
      const box = element.getBoundingClientRect()
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
    }
    const frame = root.querySelector('.e-frame')
    const key = root.querySelector('.e-key')
    const heads = [...root.querySelectorAll('[data-head-of]')]
    return {
      frame: frame === null ? null : edgesOf(frame),
      key: key === null ? null : edgesOf(key),
      items: key === null ? [] : [...key.children].map((item) => ({ words: (item.textContent ?? '').replace(/\s+/g, ' ').trim(), ...edgesOf(item) })),
      cards: [...root.querySelectorAll('.e-card')].map((card) => ({
        name: card.querySelector('.e-title')?.textContent?.trim() || card.getAttribute('data-id') || '(a card with no title)',
        ...edgesOf(card),
      })),
      areas: [...root.querySelectorAll('.e-area')].map((area) => ({
        name: heads.find((head) => head.getAttribute('data-head-of') === area.getAttribute('data-key'))?.textContent?.trim() || area.getAttribute('data-key') || '(an area with no title)',
        ...edgesOf(area),
      })),
    }
  })
  expect(read.frame, `${where}, ${width} x 1000: the drawing has its frame (.e-frame)`).not.toBeNull()
  expect(read.key, `${where}, ${width} x 1000: the drawing has its legend (.e-key)`).not.toBeNull()
  expect(read.items.length, `${where}, ${width} x 1000: the legend has items`).toBeGreaterThan(0)
  const frame = read.frame!
  const legend = read.key!
  console.log(`LEGEND ${JSON.stringify({ page: where, width, frame, legend, items: read.items.map((item) => ({ words: item.words, left: Math.round(item.left * 10) / 10, right: Math.round(item.right * 10) / 10 })) })}`)

  const outside = (box: Edges) => box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1
  const itemsOutside = read.items.filter(outside).map((item) => `legend item "${item.words}" ${edges(item)}`)
  expect.soft(itemsOutside, `${where}, ${width} x 1000, frame ${edges(frame)}: ${itemsOutside.length} of ${read.items.length} legend items lie outside the frame`).toEqual([])
  const covers = (box: Edges) => Math.min(legend.right, box.right) - Math.max(legend.left, box.left) > 1 && Math.min(legend.bottom, box.bottom) - Math.max(legend.top, box.top) > 1
  const named = (kind: string, item: { name: string } & Edges) => `${kind} "${item.name}" top ${item.top.toFixed(1)}, bottom ${item.bottom.toFixed(1)}`
  const coveredCards = read.cards.filter(covers).map((card) => named('card', card))
  const coveredAreas = read.areas.filter(covers).map((area) => named('area', area))
  const covered = [...coveredCards, ...coveredAreas]
  expect.soft(covered, `${where}, ${width} x 1000: the legend, ${edges(legend)}, covers ${coveredCards.length} of ${read.cards.length} cards and ${coveredAreas.length} of ${read.areas.length} areas: ${covered.join('; ')}`).toEqual([])
}

describe('the made-up reel page', () => {
  const PROJECT = { id: 'test-lanes-legend-reel', title: 'Example office for the reel page legend (made up)' }
  let db: TestDb
  let app: LiveApp
  let stored: Record<Drawing, Stored>

  beforeAll(async () => {
    db = await freshDb()
    stored = await storeTheTwoDrawings(db, PROJECT)
    app = await liveApp({ name: 'lanes-legend-reel', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
    const areas = await setTheMasterAndStoreTheAreas(app, db, PROJECT.id, stored)
    theAreasWereStored(areas.reel, 'the made-up reel page')
    await prepareThePage(app, PROJECT.id)
  }, 300_000)
  afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

  for (const width of WIDTHS) {
    it(`the made-up reel page, ${width} x 1000: every item of the legend lies inside the frame, and the legend covers no card and no area`, async () => {
      await openAt(app, stored.reel, 'steps', width)
      await theLegendCoversNothing(app, 'the made-up reel page', width)
    }, CASE_ALLOWANCE)
  }
})

describe('the made-up master of 54 boxes', () => {
  const PROJECT = { id: 'test-lanes-legend-master-54', title: 'Example office for the 54-box master legend (made up)' }
  let db: TestDb
  let app: LiveApp
  let stored: Record<Drawing, Stored>

  beforeAll(async () => {
    db = await freshDb()
    stored = await storeTheTwoDrawings(db, PROJECT)
    app = await liveApp({ name: 'lanes-legend-master-54', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
    const areas = await setTheMasterAndStoreTheAreas(app, db, PROJECT.id, stored)
    theAreasWereStored(areas.master, 'the made-up master of 54 boxes')
    await prepareThePage(app, PROJECT.id)
  }, 300_000)
  afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

  for (const width of WIDTHS) {
    it(`the made-up master of 54 boxes, ${width} x 1000: every item of the legend lies inside the frame, and the legend covers no card and no area`, async () => {
      await openAt(app, stored.master, 'boxes', width)
      await theLegendCoversNothing(app, 'the made-up master of 54 boxes', width)
    }, CASE_ALLOWANCE)
  }
})
