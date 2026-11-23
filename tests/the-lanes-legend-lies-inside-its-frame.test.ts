// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LANES LEGEND LIES INSIDE ITS FRAME AND COVERS NO CARD AND NO AREA. Wave 13u round 231.
 *
 * The legend is the line at the bottom right of a lanes drawing's frame that says what each progress mark and each kind
 * of line means. It was one line that never broke, held to the frame's right edge, so where it was wider than the frame
 * it ran out on the left: at 660 the made-up master at real shape (tests/a-made-up-master-at-real-shape.ts) at Boxes
 * showed the first word of its first item cut. Since round 231's 9844d48a3 the legend may wrap onto a second line, and
 * the frame still holds only the 26 px of a one-line legend, so the second line lies over the bottom of the drawing.
 *
 * THE PAGES, each opened in this file's office of the made-up master at real shape:
 *   - the master at Boxes, the level it opens at;
 *   - the master at Steps, after a press on the level control's Steps button, as
 *     tests/the-made-up-master-keeps-card-words-inside.test.ts presses it;
 *   - block 03's page, its two boxes stored in two made-up areas, one each, the way
 *     tests/a-block-wider-than-its-frame-opens-with-the-whole-drawing-in-view.test.ts stores them;
 *   - the largest block's page (block 08), its boxes stored in six made-up areas the way
 *     tests/the-made-up-master-keeps-card-words-inside.test.ts stores them.
 *
 * EACH CASE opens one page at one width by 1000, in light, waits until it is drawn and no element says it is being drawn,
 * and makes no press except the level button where the page is the master at Steps. Then each item of the legend (each
 * child of .e-key) lies inside the frame's box on screen, to a pixel, and the legend's box covers no card's box (.e-card)
 * and no area's box (.e-area) by more than a pixel. A failure names the page, the width, each card and area covered with
 * its title and its top and bottom edges, and the legend's top edge.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { dirname, join } from 'node:path'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'
import { DRAWING, prepareThePage, storeTheAreas, theDrawingIsDrawn, writerFor } from './a-made-up-office-drawn-in-lanes.ts'
import { MASTER, storeTheMadeUpMaster } from './a-made-up-master-at-real-shape.ts'

const PROJECT = { id: 'test-lanes-legend', title: 'Example office for the legend (made up)' }
const BOXES = MASTER.blockPipelines.flatMap((block) => block.boxes)
const BLOCK = MASTER.blockPipelines.find((block) => block.key === 'block-03')!
const BLOCK_MODULES = [...new Set(MASTER.links.filter((link) => link.type === 'implements' && BLOCK.boxes.includes(link.to)).map((link) => link.from))]
const LARGEST = MASTER.blockPipelines.reduce((a, b) => a.boxes.length >= b.boxes.length ? a : b)
const WIDTHS = [1440, 660] as const
// Block 08 takes minutes to draw; two minutes is room for any other page on a loaded machine.
const BLOCK_DRAWN_WITHIN = 300_000
const DRAWN_WITHIN = 120_000

interface PageSpec {
  name: string
  key: string
  level: 'boxes' | 'steps'
  ids: string[]
  pressSteps: boolean
  drawnWithin: number
  allowance: number
}

const PAGES: PageSpec[] = [
  { name: 'the master at Boxes', key: MASTER.pipeline.key, level: 'boxes', ids: BOXES, pressSteps: false, drawnWithin: DRAWN_WITHIN, allowance: 300_000 },
  { name: 'the master at Steps', key: MASTER.pipeline.key, level: 'steps', ids: MASTER.steps.map((step) => step.key), pressSteps: true, drawnWithin: DRAWN_WITHIN, allowance: 300_000 },
  { name: 'block 03', key: BLOCK.key, level: 'steps', ids: [...BLOCK.boxes, ...BLOCK_MODULES], pressSteps: false, drawnWithin: DRAWN_WITHIN, allowance: 300_000 },
  { name: 'the largest block (block 08)', key: LARGEST.key, level: 'steps', ids: LARGEST.boxes, pressSteps: false, drawnWithin: BLOCK_DRAWN_WITHIN, allowance: 900_000 },
]

let db: TestDb
let app: LiveApp
let stored: ReturnType<typeof storeTheMadeUpMaster>
let opens = 0

beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace(PROJECT)
  stored = storeTheMadeUpMaster(db, PROJECT.id)
  app = await liveApp({ name: 'lanes-legend', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json'))
  await write.call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: stored.master })
  const blockLanes = BLOCK.boxes.map((_, n) => ({ name: `Example area ${n + 1} (made up)`, arrange: 'row', order: n, tint: `--area-${n + 1}` }))
  const blockNodes = Object.fromEntries(BLOCK.boxes.map((box, n) => [stored.id[box]!, { lane: blockLanes[n]!.name, order: n }]))
  const blockAreas = await storeTheAreas(write, stored.id[BLOCK.key]!, { lanes: blockLanes, nodes: blockNodes })
  expect(blockAreas.ok, `block 03's example areas were stored: ${blockAreas.text}`).toBe(true)
  const largestLanes = Array.from({ length: 6 }, (_, n) => ({ name: `Example area ${n + 1} (made up)`, arrange: 'row', order: n, tint: `--area-${n + 1}` }))
  const largestNodes = Object.fromEntries(LARGEST.boxes.map((box, n) => [stored.id[box]!, { lane: largestLanes[n % largestLanes.length]!.name, order: n }]))
  const largestAreas = await storeTheAreas(write, stored.id[LARGEST.key]!, { lanes: largestLanes, nodes: largestNodes })
  expect(largestAreas.ok, `the largest block's example areas were stored: ${largestAreas.text}`).toBe(true)
  await prepareThePage(app, PROJECT.id)
}, 300_000)
afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

type Edges = { left: number; right: number; top: number; bottom: number }
const edges = (box: Edges): string => `left ${box.left.toFixed(1)}, right ${box.right.toFixed(1)}, top ${box.top.toFixed(1)}, bottom ${box.bottom.toFixed(1)}`

async function openAt(page: PageSpec, width: number): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto(`${app.site}/?lang=en&theme=light&open=${++opens}#${pipelinePath(stored.id[page.key]!)}`, { waitUntil: 'commit', timeout: page.drawnWithin })
  await waitForThePage(app.page, 30_000)
  await waitForTheProjects(app.page)
  if (page.pressSteps) await app.page.locator('[data-level-control] button[data-level="steps"]').click()
  await app.page.waitForFunction(({ level, ids }) => {
    const root = document.querySelector(`[data-drawing="lanes"][data-level="${level}"][data-fit]`)
    if (root === null || document.querySelector('[data-being-drawn]') !== null) return false
    return ids.every((id) => [...root.querySelectorAll('.e-card')].some((card) => card.getAttribute('data-id') === id))
  }, { level: page.level, ids: page.ids.map((key) => stored.id[key]!) }, { timeout: page.drawnWithin, polling: 100 })
  await theDrawingIsDrawn(app.page)
}

for (const page of PAGES) for (const width of WIDTHS) {
  it(`${page.name}, ${width} x 1000: every item of the legend lies inside the frame, and the legend covers no card and no area`, async () => {
    await openAt(page, width)
    expect(await app.page.locator('[data-being-drawn]').count(), `${page.name}, ${width} x 1000: no element says it is being drawn`).toBe(0)

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
    expect(read.frame, `${page.name}, ${width} x 1000: the drawing has its frame (.e-frame)`).not.toBeNull()
    expect(read.key, `${page.name}, ${width} x 1000: the drawing has its legend (.e-key)`).not.toBeNull()
    expect(read.items.length, `${page.name}, ${width} x 1000: the legend has items`).toBeGreaterThan(0)
    const frame = read.frame!
    const legend = read.key!
    console.log(`LEGEND ${JSON.stringify({ page: page.name, width, frame, legend, items: read.items.map((item) => ({ words: item.words, left: Math.round(item.left * 10) / 10, right: Math.round(item.right * 10) / 10 })) })}`)

    const outside = (box: Edges) => box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1
    const itemsOutside = read.items.filter(outside).map((item) => `legend item "${item.words}" ${edges(item)}`)
    expect.soft(itemsOutside, `${page.name}, ${width} x 1000, frame ${edges(frame)}: ${itemsOutside.length} of ${read.items.length} legend items lie outside the frame`).toEqual([])
    const covers = (box: Edges) => Math.min(legend.right, box.right) - Math.max(legend.left, box.left) > 1 && Math.min(legend.bottom, box.bottom) - Math.max(legend.top, box.top) > 1
    const named = (kind: string, item: { name: string } & Edges) => `${kind} "${item.name}" top ${item.top.toFixed(1)}, bottom ${item.bottom.toFixed(1)}`
    const coveredCards = read.cards.filter(covers).map((card) => named('card', card))
    const coveredAreas = read.areas.filter(covers).map((area) => named('area', area))
    const covered = [...coveredCards, ...coveredAreas]
    expect.soft(covered, `${page.name}, ${width} x 1000: the legend, ${edges(legend)}, covers ${coveredCards.length} of ${read.cards.length} cards and ${coveredAreas.length} of ${read.areas.length} areas: ${covered.join('; ')}`).toEqual([])
  }, page.allowance)
}
