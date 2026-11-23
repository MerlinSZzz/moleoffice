// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GATE MARK OPENS ITS EXPLANATION ON THE DRAWING, AND A SECOND PRESS PUTS IT AWAY. Wave 13u round 232.
 *
 * THE FAULT THIS CRITERION NAMES: a waits-on line carries a hard or partial gate, and the drawing says what the gate
 * means only in the legend at the bottom right, when the line's own press writes it there. There is no control of the
 * gate's own on the drawing, so a reader cannot ask a gate why it is closed and put the answer away again.
 *
 * WHAT IS PROVED, with real mouse and key presses, on the lanes of the pipeline drawn in areas at 1440 by 1000 in light
 * (tests/a-made-up-office-drawn-in-lanes.ts), unless a case says otherwise:
 *   1. the hard gate's mark is a pressable control named "Why this is closed", at least 24 by 24 px on screen, and its
 *      press shows "must finish first" inside the drawing; the press writes nothing to the legend at the bottom; a
 *      second press puts it away, and the name and aria-expanded say which state it is in;
 *   2. the partial gate's mark shows "only as far as the first example batch (made up) until this finishes", and a
 *      second press puts it away;
 *   3. with the card that the gate's line starts from selected and the mark open, the first Escape closes the mark and
 *      the card stays selected; the next Escape lets the card go;
 *   4. on the made-up master of 54 boxes at 390 by 1000, the page draws the outline and no mark, because the narrow
 *      page is the outline; the card at the gate's near end says the gate in the same words there. This case is a
 *      guard for the narrow page and does not name the fault, so it is green at the control as well.
 * The open state is read from aria-expanded and data-open, and the explanation from its own box (width and height
 * above 0, getComputedStyle not display none or visibility hidden), not only from an attribute.
 *
 * THE CONTROL, read at the page of the step 3 Code ca7aa4f6d (its engine.ts and styles.ts restored) with the step 4 Code
 * not written: 1 test file, 4 tests, 3 failed, 1 passed (case 4). Case 1 failed first at "the drawing has a mark for
 * each of its two gated lines, and none else: expected +0 to be 2"; case 2 at "the partial gate has a pressable mark on
 * its line: expected +0 to be 1"; case 3 at "locator.scrollIntoViewIfNeeded: Timeout 30000ms exceeded", because there
 * is no mark to press. The fault is that the drawing has no gate mark at all, so the zero is the fault's.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'
import { DRAWING, PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, prepareThePage, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'
import type { Stored } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'
import { setTheMasterAndStoreTheAreas, storeTheTwoDrawings, type Drawing } from './a-made-up-reel-page-and-master-opened-fresh.ts'

const HARD_WORDS = 'must finish first'
const PARTIAL_WORDS = 'only as far as the first example batch (made up) until this finishes'

describe('the gates of the pipeline drawn in areas', () => {
  let app: LiveApp
  let office: MadeUpOffice
  beforeAll(async () => {
    app = await liveApp({ name: 'lanes-gate-mark', workspace: 'default', viewport: { width: 1440, height: 1000 } })
    office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
    await prepareThePage(app, PROJECT.id)
  }, 240_000)
  afterAll(async () => { await app?.stop() }, 120_000)

  async function open() {
    await openThePage(app, pipelinePath(office.id.drawn!))
    await theDrawingIsDrawn(app.page)
  }
  const markOf = (linkKey: string) => app.page.locator(`${DRAWING} .e-gate-mark[data-link="${office.link[linkKey]}"]`)
  async function press(locator: ReturnType<LiveApp['page']['locator']>) {
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    expect(box, 'the control has a box to press').not.toBeNull()
    await app.page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  }
  /** Whether an open explanation's words are shown, read from their own box and computed style. */
  async function wordsShown(where: ReturnType<LiveApp['page']['locator']>): Promise<boolean> {
    return where.evaluate((mark) => {
      const words = mark.querySelector('.e-gate-words')
      if (words === null) return false
      const style = getComputedStyle(words)
      const box = words.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
    })
  }
  async function legendWords(): Promise<string> {
    return (await app.page.locator(`${DRAWING} .e-key-detail`).textContent())?.trim() ?? ''
  }
  async function selectCard(recordId: string) {
    const place = await aPlaceOnTheCard(app.page, recordId)
    await app.page.mouse.click(place.x, place.y)
    await expect.poll(() => app.page.locator(DRAWING).getAttribute('data-selected')).toBe(recordId)
  }

  it('the hard gate mark shows its explanation on the drawing, writes nothing to the legend, and a second press puts it away', async () => {
    await open()
    expect(await app.page.locator(`${DRAWING} .e-gate-mark`).count(), 'the drawing has a mark for each of its two gated lines, and none else').toBe(2)
    for (const ungated of ['upward', 'loop-there', 'loop-back'])
      expect(await app.page.locator(`${DRAWING} .e-gate-mark[data-link="${office.link[ungated]}"]`).count(), `the ${ungated} line has no gate, so it has no mark to press`).toBe(0)
    const mark = markOf('hard')
    expect(await mark.count(), 'the hard gate has a pressable mark on its line').toBe(1)
    expect(await mark.getAttribute('aria-label'), 'the mark at rest is named "Why this is closed"').toBe('Why this is closed')
    expect(await mark.getAttribute('aria-expanded'), 'the mark at rest does not say it is open').toBe('false')
    const box = await mark.boundingBox()
    expect(box, 'the hard gate mark has a box').not.toBeNull()
    expect(box!.width, 'the hard gate mark is at least 24 px wide on screen').toBeGreaterThanOrEqual(24)
    expect(box!.height, 'the hard gate mark is at least 24 px high on screen').toBeGreaterThanOrEqual(24)
    const legendBefore = await legendWords()
    await press(mark)
    expect(await wordsShown(mark), 'the press shows the explanation on the drawing').toBe(true)
    expect((await mark.locator('.e-gate-words').textContent())?.trim(), 'the explanation is the gate\'s words').toBe(HARD_WORDS)
    expect(await mark.getAttribute('aria-expanded'), 'the open mark says it is open').toBe('true')
    expect(await mark.getAttribute('aria-label'), 'the open mark is named "Put away why this is closed"').toBe('Put away why this is closed')
    expect(await legendWords(), 'the press on the mark writes nothing to the legend at the bottom').toBe(legendBefore)
    await press(mark)
    expect(await wordsShown(mark), 'a second press puts the explanation away').toBe(false)
    expect(await mark.getAttribute('aria-expanded'), 'the mark says it is closed again').toBe('false')
    expect(await mark.getAttribute('aria-label'), 'the mark is named "Why this is closed" again').toBe('Why this is closed')
  }, 180_000)
  it('the partial gate mark shows the stage it stops at, and a second press puts it away', async () => {
    await open()
    const mark = markOf('partial')
    expect(await mark.count(), 'the partial gate has a pressable mark on its line').toBe(1)
    expect(await mark.getAttribute('aria-label'), 'the partial mark at rest is named "Why this is closed"').toBe('Why this is closed')
    await press(mark)
    expect(await wordsShown(mark), 'the press shows the explanation on the drawing').toBe(true)
    expect((await mark.locator('.e-gate-words').textContent())?.trim(), 'the explanation names the stage the gate stops at').toBe(PARTIAL_WORDS)
    await press(mark)
    expect(await wordsShown(mark), 'a second press puts the explanation away').toBe(false)
  }, 180_000)
  it('the first Escape closes an open mark and leaves the card selected; the next lets the card go', async () => {
    await open()
    await selectCard(office.id.start!)
    const mark = markOf('hard')
    await press(mark)
    expect(await wordsShown(mark), 'the mark is open before Escape').toBe(true)
    await app.page.keyboard.press('Escape')
    expect(await wordsShown(mark), 'the first Escape closes the open mark').toBe(false)
    expect(await app.page.locator(DRAWING).getAttribute('data-selected'), 'the first Escape leaves the card selected').toBe(office.id.start!)
    await app.page.keyboard.press('Escape')
    expect(await app.page.locator(DRAWING).getAttribute('data-selected'), 'the next Escape lets the card go').toBeNull()
  }, 180_000)
})

describe('the made-up master of 54 boxes at 390', () => {
  const project = { id: 'test-lanes-gate-mark-390', title: 'Example office for the gate mark at 390 (made up)' }
  let db: TestDb
  let app: LiveApp
  let stored: Record<Drawing, Stored>
  beforeAll(async () => {
    db = await freshDb()
    stored = await storeTheTwoDrawings(db, project)
    app = await liveApp({ name: 'lanes-gate-mark-390', database: db.file, workspace: 'default', viewport: { width: 390, height: 1000 } })
    const areas = await setTheMasterAndStoreTheAreas(app, db, project.id, stored)
    expect(areas.master.ok, `the master's areas were stored: ${areas.master.text}`).toBe(true)
    await prepareThePage(app, project.id)
  }, 300_000)
  afterAll(async () => { await app?.stop(); db?.close() }, 120_000)
  it('the narrow page draws the outline, which says the gate in words, and no mark', async () => {
    await app.page.setViewportSize({ width: 390, height: 1000 })
    await app.page.goto(`${app.site}/?lang=en&theme=light&open=1#${pipelinePath(stored.master.pipeline)}`, { waitUntil: 'commit', timeout: 120_000 })
    await waitForThePage(app.page, 30_000)
    await waitForTheProjects(app.page)
    await app.page.waitForFunction(() => document.querySelector('[data-drawing="lanes"][data-fit]') !== null && document.querySelector('[data-being-drawn]') === null, undefined, { timeout: 120_000, polling: 100 })
    await theDrawingIsDrawn(app.page, { outline: true })
    expect(await app.page.locator(`${DRAWING} .e-outline`).count(), 'at 390 the page draws the outline').toBe(1)
    expect(await app.page.locator(`${DRAWING} .e-gate-mark`).count(), 'at 390 the outline carries no gate mark').toBe(0)
    const gateFrom = stored.master.id['box-03']
    expect(gateFrom, 'the master stores the box the hard gate starts from').toBeTruthy()
    const said = await app.page.evaluate(({ selector, id }) => {
      const card = document.querySelector(`${selector} .e-card[data-id="${CSS.escape(id)}"]`)
      return card?.querySelector('.e-said')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    }, { selector: DRAWING, id: gateFrom! })
    expect(said, 'the outline card says the gate in words').toContain(HARD_WORDS)
  }, 240_000)
})
