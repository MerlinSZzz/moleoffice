// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A filed made-up reel page at 1440 x 1000, light, from the production build. Reader detail wins
 * over fit: when it does not fit, the view may be larger than its frame but the card keeps the
 * reader's level. Label uses a written label; title has no summary; gist and higher settings use
 * the title and available summary with the card tick off. Missing words are never invented.
 * Full remains a card at gist, not a whole record. Zoom changes no card's words.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { join, dirname } from 'node:path'
import { detailKeyForSurface } from '../src/shared/detail.ts'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { DRAWING, openThePage, prepareThePage, theDrawingIsDrawn, writerFor, type Attempt } from './a-made-up-office-drawn-in-lanes.ts'
import { setTheMasterAndStoreTheAreas, storeTheTwoDrawings, type Drawing } from './a-made-up-reel-page-and-master-opened-fresh.ts'
import type { Stored } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'
const PROJECT = { id: 'lanes-detail-test', title: 'Example detail test office' }
const SUMMARY = 'A made up summary about an amber wheel and a blue shelf.'
const LABEL = 'Amber shelf'
let app: LiveApp
let db: TestDb
let stored: Record<Drawing, Stored>
let areas: Record<Drawing, Attempt>
beforeAll(async () => {
  db = await freshDb()
  stored = await storeTheTwoDrawings(db, PROJECT)
  app = await liveApp({ name: 'lanes-detail', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  areas = await setTheMasterAndStoreTheAreas(app, db, PROJECT.id, stored)
  expect(areas.reel.ok).toBe(true)
  const write = writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json'))
  const id = stored.reel.id['module-1']!
  await write.call('PATCH', `/api/records/${id}`, { summary: SUMMARY })
  const revision = await write.call('GET', `/api/records/${id}/revisions`)
  const newest = revision.revisions[0]
  await write.call('POST', `/api/records/${id}/short-forms`, { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: LABEL } })
  await prepareThePage(app, PROJECT.id)
  await app.page.goto(app.site)
}, 300_000)
afterAll(async () => { await app?.stop(); db?.close() }, 120_000)
async function at(level: string) {
  await app.page.evaluate(([key, value]) => localStorage.setItem(key!, value!), [detailKeyForSurface('graph'), level])
  await openThePage(app, pipelinePath(stored.reel.pipeline))
  await theDrawingIsDrawn(app.page)
  await expect.poll(() => app.page.locator(DRAWING).getAttribute('data-fit'), { timeout: 120_000 }).not.toBeNull()
}
async function noOverlaps() {
  const boxes = await app.page.locator(`${DRAWING} .e-card`).evaluateAll(cards => cards.map(card => {
    const r = card.getBoundingClientRect()
    return { id: (card as HTMLElement).dataset.id, l: r.left, r: r.right, t: r.top, b: r.bottom }
  }))
  expect(boxes.length).toBeGreaterThan(20)
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!
    expect(a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1, `${a.id} overlaps ${b.id}`).toBe(false)
  }
}
for (const level of ['label', 'title', 'gist', 'outline', 'sketch', 'digest', 'full']) {
  it(`the ${level} setting draws its words and measured cards do not overlap`, async () => {
    await at(level)
    const card = app.page.locator(`${DRAWING} .e-card[data-id="${stored.reel.id['module-1']!}"]`)
    const text = await card.innerText()
    if (level === 'label') expect(text).toContain(LABEL)
    else expect(text).not.toContain(LABEL)
    if (level === 'label' || level === 'title') expect(text).not.toContain(SUMMARY)
    else expect(text).toContain(SUMMARY)
    await noOverlaps()
    const percent = app.page.locator('.lanes-controls span')
    const beforeZoom = await percent.innerText()
    await app.page.getByRole('button', { name: 'Bigger', exact: true }).click()
    await expect.poll(() => percent.innerText()).not.toBe(beforeZoom)
    // Give the drawing a fixed 300 ms to settle after the zoom control updates.
    await app.page.waitForTimeout(300)
    expect(await card.innerText()).toBe(text)
    await app.page.getByRole('button', { name: 'Smaller', exact: true }).click()
    await expect.poll(() => percent.innerText()).toBe(beforeZoom)
    await app.page.waitForTimeout(300)
    expect(await card.innerText()).toBe(text)
  }, 240_000)
}
