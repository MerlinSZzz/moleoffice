// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BLOCK OF THE MASTER IS PRESSED IN ITS DRAWING, AND ITS PART_OF LINK SAYS NOTHING. Wave 13u round 231, criterion 3.
 *
 * By the decision of 16 November 2026, which the secretary filed from the owner's words, the master's page
 * lists its blocks no more: each block is pressed in the drawing itself, and that press reaches the block's pipeline.
 * A block pipeline is part_of its block, and that link is drawn by the press, so no line draws it and no sentence says
 * it was not drawn. This file judges that on the made-up master of 34 boxes in tests/a-made-up-master-at-real-shape.ts,
 * whose 13 steps each have a block pipeline hung on them:
 *
 *   1. at the Boxes level each block has a legend entry with a link to its block pipeline (at the
 *      Steps level tests/the-lanes-drawing-titles-lead-and-say-no-study-words.test.ts presses a step's title);
 *   2. a real press on such a title opens the block pipeline in the same tab, at the Boxes level (at the Steps level
 *      tests/the-lanes-drawing-titles-lead-and-say-no-study-words.test.ts presses a step's title);
 *   3. no part_of link from a block pipeline to its block is drawn as a line or named for a selection, at either level;
 *   4. no sentence names the part_of link of a block pipeline and its block, on the master at either level, in the
 *      normal view or the developer view. On a block pipeline's own page this is judged without a browser, by case 3 of
 *      tests/the-lanes-input-is-read-from-records.test.ts.
 *
 * Parts 1 and 2 are expected to hold before the change; the decision asks for them, so they are judged here too.
 *
 * Part 4 first counted every sentence that named a block pipeline and its block. On a block pipeline's own page the
 * developer view also has a sentence for each "relates to" link from a box to a master step, which says the box is
 * here only as a step of that pipeline. Those sentences name the block pipeline and its block, but not the part_of
 * link, and the decision leaves them where they are. So part 4 counts only sentences that name the part_of link by its
 * word.
 *
 * The page is this checkout's page built for production, at 1440 by 1000, light. Nothing in the office is real.
 */
import { dirname, join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { sayInEnglish } from '../src/shared/i18n.ts'
import { linkWord } from '../src/shared/words.ts'
import { hrefOf, pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { A_PAGE_IS_READY_WITHIN, theDeveloperLines, openInTheDeveloperView, openInTheNormalView } from './a-pipeline-page-in-the-developer-view.ts'
import { DRAWING, SAID, prepareThePage, readTheDrawing, theDrawingHoldsStill, writerFor } from './a-made-up-office-drawn-in-lanes.ts'
import { MASTER, storeTheMadeUpMaster } from './a-made-up-master-at-real-shape.ts'

const PROJECT = { id: 'test-block-pressed', title: 'Example office for a block pressed in its drawing (made up)' }

let db: TestDb
let app: LiveApp
let stored: ReturnType<typeof storeTheMadeUpMaster>
/** Each block: its step on the master, its block pipeline, both titles, and the id of the part_of link between them. */
let blocks: { step: string; pipeline: string; stepTitle: string; pipelineTitle: string; partOf: string }[] = []

beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace(PROJECT)
  stored = storeTheMadeUpMaster(db, PROJECT.id)
  // storeTheMadeUpMaster does not name these links, so they are read from the database it wrote them into.
  const partOf = db.client.sqlite.prepare("SELECT id FROM links WHERE type = 'part_of' AND from_id = ? AND to_id = ?")
  blocks = MASTER.blockPipelines.map((block) => {
    const step = MASTER.steps.find((one) => one.key === block.partOf)!
    const row = partOf.get(stored.id[block.key]!, stored.id[block.partOf]!) as { id: string } | undefined
    if (row === undefined) throw new Error(`no part_of link was stored from ${block.key} to ${block.partOf}`)
    return { step: stored.id[block.partOf]!, pipeline: stored.id[block.key]!, stepTitle: step.title, pipelineTitle: block.title, partOf: row.id }
  })
  app = await liveApp({ name: 'block-pressed', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json'))
  await write.call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: stored.master })
  const outside = await write.call('POST', '/api/records', { kind: 'module', title: 'Outside service (made up)' })
  const outsideId = (outside as { record: { id: string } }).record.id
  await write.call('POST', '/api/links', { fromId: stored.id['box-01']!, toId: outsideId, type: 'feeds' })
  await prepareThePage(app, PROJECT.id)
}, 300_000)
afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

const STEPS_DRAWN = `${DRAWING}[data-level="steps"][data-fit]`

/** Waits for the drawing at the level asked, after the page is open. The master opens at Boxes. */
async function atTheLevel(page: Page, level: 'boxes' | 'steps'): Promise<void> {
  await page.locator(`${DRAWING}[data-fit]`).waitFor({ timeout: 300_000 })
  if (level === 'steps') {
    await page.locator('[data-level-control] button[data-level="steps"]').click()
    await page.locator(STEPS_DRAWN).waitFor({ timeout: 300_000 })
  }
  expect(await page.locator(DRAWING).getAttribute('data-level'), 'the level drawn').toBe(level)
  await theDrawingHoldsStill(page)
}

const titleOfTheBlock = (level: 'boxes' | 'steps', step: string): string =>
  level === 'boxes' ? `${DRAWING} .e-block-legend-entry[data-block="${step}"] a` : `${DRAWING} .e-card[data-id="${step}"] a.e-title`

/** Every sentence the said section and the developer section hold that names a part_of link, a block pipeline and its block. */
async function sentencesNamingABlockAndItsPipeline(page: Page): Promise<string[]> {
  const sentences = [...await page.locator(`${SAID} p`).allTextContents(), ...(await theDeveloperLines(page)).map((line) => line.words)]
  const partOf = `“${linkWord('part_of', 'forward').text}”`
  return sentences.filter((sentence) => sentence.includes(partOf) && blocks.some((block) => sentence.includes(`“${block.stepTitle}”`) && sentence.includes(`“${block.pipelineTitle}”`)))
}

/** Waits until neither the restriction read nor the work-domain read says it is running, so their sentences are in. */
async function theSentencesAreIn(page: Page): Promise<void> {
  const running = [sayInEnglish('g7b.Canvas.reading_what_restricts_these_records'), sayInEnglish('g7b.Canvas.reading_who_is_working_on_these_records')]
  await expect
    .poll(async () => {
      const text = await page.locator('.pp').innerText()
      return running.filter((one) => text.includes(one))
    }, { message: 'the restriction and work-domain reads have answered', timeout: 60_000 })
    .toEqual([])
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
}

for (const level of ['boxes'] as const) {
  it(`1. at the ${level} level, each of the 13 blocks has a title that leads to its block pipeline`, async () => {
    await openInTheNormalView(app, pipelinePath(stored.master))
    await atTheLevel(app.page, level)
    const wrong: string[] = []
    for (const block of blocks) {
      const title = app.page.locator(titleOfTheBlock(level, block.step))
      const count = await title.count()
      const href = count === 1 ? await title.getAttribute('href') : null
      if (count !== 1 || href !== hrefOf(pipelinePath(block.pipeline))) wrong.push(`${block.stepTitle}: ${String(count)} title links, the first to ${String(href)}`)
    }
    const entries = app.page.locator(`${DRAWING} .e-block-legend-entry`)
    expect(await entries.count()).toBe(13)
    for (let n = 0; n < 13; n++) {
      const badge = entries.nth(n).locator('.e-badge')
      expect(await badge.textContent()).toBe(`M${n}`)
      expect(await badge.getAttribute('data-module')).toBe(String(n))
    }
    expect(await app.page.locator(`${DRAWING} .e-area[data-key="api-server"]`).evaluate((el) => getComputedStyle(el).borderStyle)).toBe('solid')
    expect(await app.page.locator(`${DRAWING} .e-area[data-key="outside"]`).evaluate((el) => getComputedStyle(el).borderStyle)).toBe('dashed')
    expect(blocks, 'the made-up master has 13 blocks').toHaveLength(13)
    expect(wrong, `at ${level}, each block's title leads to its block pipeline`).toEqual([])
  }, 400_000)
}

for (const [level, at] of [['boxes', 8]] as const) {
  it(`2. at the ${level} level, a real press on a block's title opens its block pipeline in the same tab`, async () => {
    const block = blocks[at]!
    await openInTheNormalView(app, pipelinePath(stored.master))
    await atTheLevel(app.page, level)
    const tabs = app.page.context().pages().length
    const title = app.page.locator(titleOfTheBlock(level, block.step))
    expect(await title.getAttribute('target'), 'the title opens no other tab').toBeNull()
    await title.click()
    await app.page.waitForURL(`**${hrefOf(pipelinePath(block.pipeline))}`, { timeout: 30_000 })
    await app.page.locator('[data-pipeline-part="summary"] h2', { hasText: block.pipelineTitle }).waitFor({ timeout: A_PAGE_IS_READY_WITHIN })
    expect(app.page.context().pages().length, 'no other tab was opened').toBe(tabs)
  }, 400_000)
}

for (const level of ['boxes', 'steps'] as const) {
  it(`3 and 4. at the ${level} level, no part_of link of a block pipeline to its block is a line, and no sentence names one`, async () => {
    const said: Record<string, string[]> = {}
    for (const view of ['normal', 'developer'] as const) {
      if (view === 'normal') await openInTheNormalView(app, pipelinePath(stored.master))
      else await openInTheDeveloperView(app, pipelinePath(stored.master))
      await atTheLevel(app.page, level)
      await theSentencesAreIn(app.page)
      const drawing = await readTheDrawing(app.page)
      const named = new Set([...drawing.drawnLinks, ...Object.values(drawing.onSelection).flat(), ...drawing.paths.map((path) => path.link)])
      expect(blocks.filter((block) => named.has(block.partOf)).map((block) => block.pipelineTitle), `${view} view, ${level}: no part_of link of a block pipeline is drawn`).toEqual([])
      said[view] = await sentencesNamingABlockAndItsPipeline(app.page)
    }
    expect(said, `at ${level}, no sentence names the part_of link of a block pipeline and its block, in either view`).toEqual({ normal: [], developer: [] })
  }, 400_000)
}


it('names the step view in the key when no box has a tier', async () => {
  const write = writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json'))
  for (const box of MASTER.blockPipelines.flatMap((block) => block.boxes)) {
    await write.call('PATCH', `/api/records/${stored.id[box]!}`, { dataPatch: { tier: null } })
  }
  await openInTheNormalView(app, pipelinePath(stored.master))
  await atTheLevel(app.page, 'boxes')
  expect(await app.page.locator(`${DRAWING} .e-key`).innerText()).toContain('Drawn by step')
}, 400_000)
