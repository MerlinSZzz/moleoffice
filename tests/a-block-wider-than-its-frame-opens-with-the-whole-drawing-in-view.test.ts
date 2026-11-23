// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BLOCK WIDER THAN ITS FRAME OPENS WITH THE WHOLE DRAWING IN VIEW. Wave 13u round 231.
 *
 * A pipeline's lanes are drawn in a frame that hides what lies outside it while the drawing is at rest, so a reader
 * reaches the rest only by dragging or by Fit all. The largest block of the made-up master at real shape
 * (tests/a-made-up-master-at-real-shape.ts) opened on two areas at the top left: its Not placed row was one line of 28
 * module cards, wider than the frame even at the smallest card width and the 12 px text floor.
 *
 * THE PAGE. That block takes minutes to draw, so this file opens a smaller block of the same master: BLOCK below, with
 * its two boxes stored in two made-up areas, one each, and every module card that carries them left unplaced. On the
 * code this round started from, those module cards are one Not placed row wider than the frame at 1440, 990 and 660.
 *
 * EACH CASE opens the block's page at one width by 1000, in light, waits until it is drawn and no element says it is
 * being drawn, and makes no press, drag or zoom. Then every card and every area of the drawing lies inside the frame's
 * box on screen, to a pixel, and the fit's smallest text is 12 px or more, so the drawing is not brought inside by
 * making its words smaller than the floor. And the fit made one try (data-fit's tries list has one entry): its first
 * guess at the card width is the width it draws at, so the drawing's lines are worked out once, not once for each
 * card width the fit tries.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { DRAWING, openThePage, prepareThePage, storeTheAreas, theDrawingIsDrawn, writerFor } from './a-made-up-office-drawn-in-lanes.ts'
import { MASTER, storeTheMadeUpMaster } from './a-made-up-master-at-real-shape.ts'

const PROJECT = { id: 'test-block-wider-than-its-frame', title: 'Example office for a wide block (made up)' }
// Of the blocks with two boxes, the one with the most module cards carrying them: eleven.
const BLOCK = MASTER.blockPipelines.find((block) => block.key === 'block-03')!
const MODULES = [...new Set(MASTER.links.filter((link) => link.type === 'implements' && BLOCK.boxes.includes(link.to)).map((link) => link.from))]
const WIDTHS = [1440, 660] as const
// Each case's BLOCK_FIT line says how long the block took to draw; two minutes is room for a loaded machine.
const DRAWN_WITHIN = 120_000
const CASE_ALLOWANCE = 240_000

let db: TestDb
let app: LiveApp
let stored: ReturnType<typeof storeTheMadeUpMaster>

beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace(PROJECT)
  stored = storeTheMadeUpMaster(db, PROJECT.id)
  app = await liveApp({ name: 'block-wider-than-its-frame', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json'))
  await write.call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: stored.master })
  const lanes = BLOCK.boxes.map((_, n) => ({ name: `Example area ${n + 1} (made up)`, arrange: 'row', order: n, tint: `--area-${n + 1}` }))
  const nodes = Object.fromEntries(BLOCK.boxes.map((box, n) => [stored.id[box]!, { lane: lanes[n]!.name, order: n }]))
  const areas = await storeTheAreas(write, stored.id[BLOCK.key]!, { lanes, nodes })
  expect(areas.ok, `example areas were stored: ${areas.text}`).toBe(true)
  await prepareThePage(app, PROJECT.id)
}, 300_000)
afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

type Edges = { left: number; right: number; top: number; bottom: number }
const edges = (box: Edges): string => `left ${box.left.toFixed(1)}, right ${box.right.toFixed(1)}`

for (const width of WIDTHS) {
  it(`${width} x 1000: the block opens with every card and every area inside its frame, at words of 12 px or more`, async () => {
    await app.page.setViewportSize({ width, height: 1000 })
    const started = performance.now()
    await openThePage(app, pipelinePath(stored.id[BLOCK.key]!), 'light')
    const own = [...BLOCK.boxes, ...MODULES].map((key) => stored.id[key]!)
    await app.page.waitForFunction((ids) => {
      const root = document.querySelector('[data-drawing="lanes"][data-level="steps"][data-fit]')
      if (root === null || document.querySelector('[data-being-drawn]') !== null) return false
      return ids.every((id) => [...root.querySelectorAll('.e-card')].some((card) => card.getAttribute('data-id') === id))
    }, own, { timeout: DRAWN_WITHIN, polling: 100 })
    await theDrawingIsDrawn(app.page)
    const drawnIn = Math.round(performance.now() - started)
    expect(await app.page.locator('[data-being-drawn]').count(), 'no element says it is being drawn').toBe(0)

    const read = await app.page.locator(DRAWING).evaluate((root) => {
      const edgesOf = (element: Element) => {
        const box = element.getBoundingClientRect()
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
      }
      const frame = root.querySelector('.e-frame')
      const heads = [...root.querySelectorAll('[data-head-of]')]
      return {
        fit: root.getAttribute('data-fit'),
        frame: frame === null ? null : edgesOf(frame),
        cards: [...root.querySelectorAll('.e-card')].map((card) => ({
          name: card.querySelector('.e-title')?.textContent?.trim() || card.getAttribute('data-id') || '(a card with no title)',
          role: card.getAttribute('data-role') ?? '',
          ...edgesOf(card),
        })),
        areas: [...root.querySelectorAll('.e-area')].map((area) => ({
          name: heads.find((head) => head.getAttribute('data-head-of') === area.getAttribute('data-key'))?.textContent?.trim() || '(an area with no heading)',
          ...edgesOf(area),
        })),
      }
    })
    expect(read.frame, `${width} x 1000: the drawing has its frame (.e-frame)`).not.toBeNull()
    const frame = read.frame!
    const fit = JSON.parse(read.fit ?? '{}') as { smallestPx?: number; zoom?: number; card?: number; frame?: { w: number }; natural?: { w: number }; tries?: { card: number }[] }
    const outside = (box: Edges) => box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1
    const notPlaced = read.areas.find((area) => area.name === 'Not placed')
    console.log(`BLOCK_FIT ${JSON.stringify({ width, drawnInMs: drawnIn, frame: fit.frame, natural: fit.natural, zoom: fit.zoom, card: fit.card, smallestPx: fit.smallestPx, notPlacedPx: notPlaced ? Math.round((notPlaced.right - notPlaced.left) * 10) / 10 : null, tries: fit.tries })}`)

    expect(read.cards.length, `${width} x 1000: the block's ${own.length} own cards are drawn`).toBeGreaterThanOrEqual(own.length)
    const cardsOutside = read.cards.filter(outside).map((card) => `card "${card.name}" (${card.role}) ${edges(card)}`)
    const areasOutside = read.areas.filter(outside).map((area) => `area "${area.name}" ${edges(area)}`)
    expect.soft([...cardsOutside, ...areasOutside], `${width} x 1000, frame ${edges(frame)}: ${cardsOutside.length} of ${read.cards.length} cards and ${areasOutside.length} of ${read.areas.length} areas lie outside the frame`).toEqual([])
    expect.soft(fit.smallestPx, `${width} x 1000: the smallest text of the fit (data-fit's smallestPx) is 12 px or more`).toBeGreaterThanOrEqual(12)
    expect.soft(fit.tries?.length, `${width} x 1000: the fit made one try; data-fit's tries are ${JSON.stringify(fit.tries)}`).toBe(1)
  }, CASE_ALLOWANCE)
}
