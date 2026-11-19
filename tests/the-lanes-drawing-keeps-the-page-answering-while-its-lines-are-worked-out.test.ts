// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LANES DRAWING KEEPS THE PAGE ANSWERING WHILE ITS LINES ARE WORKED OUT (round 231). The drawing is the made-up
 * master at its real shape (tests/a-made-up-master-at-real-shape.ts), whose Steps level takes seconds to route, in the
 * production page at 1440 by 1000, light. Each case opens it in a new browser context, so no case starts from what the
 * one before left. While the new drawing's lines are worked out:
 *   - the drawing's root says so: data-being-drawn names the level, aria-busy is true, and the words say it;
 *   - the drawing before it stays on screen, and a press on one of its cards is answered in under 300 ms with the
 *     same lines shown as when nothing is being drawn;
 *   - no task on the main thread is over 200 ms, from the press or the width that starts the new drawing until it is
 *     shown. The page's own work, with the routing taken out, was at most 52 ms in one go at Steps and 128 ms at the
 *     Boxes open, in profiles of this drawing, so 200 ms leaves room for a loaded machine;
 *   - the drawing before it still pans, and a pan or a zoom made on it is kept when the new drawing is shown;
 *   - a card pressed is the card held once the new drawing is shown;
 *   - a press on Boxes before Steps is drawn keeps Steps off the page, and every worker the drawing started is ended;
 *   - the words that say Steps is being drawn take no room above the drawing still on screen: at 1440, 990 and 660,
 *     on this master and on the made-up master of 54 boxes (tests/a-made-up-reel-page-and-a-master-of-54-boxes.ts),
 *     each card of the Boxes drawing is where it was on the page, within 1 px, while the words are shown. At 390 the
 *     words are not drawn at all: there Steps is drawn in one go, with no worker, in about 50 ms.
 * The page measures the cards before it sends their lines to the worker, so that measuring is not routing and stays on
 * the main thread. On block-08 of the made-up master, the largest block page in its file (63 cards at Steps), with six
 * made-up areas, no task on the main thread is over 200 ms from the open at 1440, and from each width change to 990
 * and to 660, until the new drawing's worker has answered its first call. Measured one card at a time, it was one
 * task of 238 to 266 ms at 1440, 196 to 198 ms at 990 and 210 to 223 ms at 660, at a load of about 11.
 * On the first open there is no drawing before, and the words say the boxes are being drawn. The words are read
 * wherever they are inside the drawing's root.
 *
 * HOW A PRESS IS TIMED. A script the page runs before its own notes each pointerdown on a card with its event time, and
 * each card that becomes aria-pressed, with the time it is seen. The answer is the second less the first, on the
 * page's own clock. The same script keeps each long task the page's PerformanceObserver reports, each change of
 * data-being-drawn with the root's status words at that moment, each time a lanes drawing at the Steps level is in the
 * document, and how many workers were started and ended.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import type { Page } from 'playwright'

import { enWave13u } from '../src/shared/words/en-wave-13u.ts'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { DRAWING, aPlaceOnTheCard, storeTheAreas, theAreasWereStored, writerFor, type Attempt } from './a-made-up-office-drawn-in-lanes.ts'
import { MASTER, storeTheMadeUpMaster } from './a-made-up-master-at-real-shape.ts'
import { storeTheMasterOf54Boxes, type Stored } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'

const PROJECT = { id: 'test-master-answers', title: 'Example office for a master that answers (made up)' }
const PROJECT_OF_54 = { id: 'test-master-of-54-answers', title: 'Example office for a master of 54 boxes that answers (made up)' }
/** Block-08 is in a project of its own, so its areas change no drawing the other cases open. */
const PROJECT_OF_THE_BLOCK = { id: 'test-block-answers', title: 'Example office for a block page that answers (made up)' }
const THE_BLOCK = MASTER.blockPipelines.find((block) => block.key === 'block-08')
/** Six areas in rows, the boxes dealt to them in turn. */
const AREAS_OF_THE_BLOCK = Array.from({ length: 6 }, (_, n) => ({ name: `Example area ${String(n + 1)} (made up)`, arrange: 'row', order: n, tint: `--area-${String(n + 1)}` }))
/** How long the worker of a new drawing of block-08 may take to answer its first call, on a loaded machine. */
const ROUTING_BEGUN_WITHIN = 60_000
/** The widths with a bar of controls, at the review tool's sizes. At 390 there is no bar. */
const WIDTHS = [{ width: 1440, height: 1000 }, { width: 990, height: 1000 }, { width: 660, height: 900 }]
/** How far a card may be from where it was on the page while the words show: rounding, and nothing more. */
const STAYS_WITHIN = 1
/** The words, read by key, because this file was written before them. */
const WORD = {
  steps: Reflect.get(enWave13u, 'lanes.drawingTheSteps') as unknown,
  boxes: Reflect.get(enWave13u, 'lanes.drawingTheBoxes') as unknown,
}
const ANSWER_WITHIN = 300
const LONGEST_TASK = 200
/** How long the root has to say it is drawing after the press that starts the drawing. */
const SAYS_IT_IS_DRAWING_WITHIN = 5_000
/** How long the Steps drawing may take to be shown, on a loaded machine. */
const DRAWN_WITHIN = 150_000
const ONE_CASE = 300_000
const BIGGER = 'Bigger'

let db: TestDb
let app: LiveApp
let stored: ReturnType<typeof storeTheMadeUpMaster>
let storedOf54: Stored
let areasOf54: Attempt
let storedBlock: ReturnType<typeof storeTheMadeUpMaster>
let areasOfTheBlock: Attempt

/** What the script the page runs before its own keeps. */
interface TheWatch {
  longTasks: { start: number; ms: number }[]
  presses: { card: string; at: number }[]
  answers: { card: string; at: number }[]
  beingDrawn: { level: string | null; busy: string | null; words: string[]; at: number }[]
  steps: number[]
  /** `answered` holds, for each worker in the order they were started, how many of its answers came. */
  workers: { started: number; ended: number; answered: number[] }
}

/** Run by the page before its own script: picks the project and the theme, and keeps what TheWatch says. */
function watchThePage(project: string): void {
  localStorage.setItem('mole-office.workspace', project)
  localStorage.setItem('mole-office.preset.theme', 'light')
  const watch: TheWatch = { longTasks: [], presses: [], answers: [], beingDrawn: [], steps: [], workers: { started: 0, ended: 0, answered: [] } }
  ;(window as unknown as { lanesWatch: TheWatch }).lanesWatch = watch
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) watch.longTasks.push({ start: entry.startTime, ms: entry.duration })
  }).observe({ type: 'longtask', buffered: true })
  document.addEventListener('pointerdown', (event) => {
    const card = event.target instanceof Element ? event.target.closest('.e-card[data-id]') : null
    if (card !== null) watch.presses.push({ card: card.getAttribute('data-id')!, at: event.timeStamp })
  }, true)
  const noteTheRoot = (root: Element, at: number) => {
    const words = [...root.querySelectorAll('[role="status"]')].map((node) => (node.textContent ?? '').trim())
    watch.beingDrawn.push({ level: root.getAttribute('data-being-drawn'), busy: root.getAttribute('aria-busy'), words, at })
  }
  new MutationObserver((changes) => {
    const at = performance.now()
    for (const change of changes) {
      if (change.type === 'childList') {
        // A root the page adds already saying it is being drawn changes no attribute, so it is noted as it is added.
        for (const node of change.addedNodes) {
          if (!(node instanceof Element)) continue
          for (const root of [...(node.matches('.lanes-drawing') ? [node] : []), ...node.querySelectorAll('.lanes-drawing')]) {
            if (root.hasAttribute('data-being-drawn')) noteTheRoot(root, at)
          }
        }
        continue
      }
      if (!(change.target instanceof Element)) continue
      const element = change.target
      if (change.attributeName === 'aria-pressed' && element.matches('.e-card') && element.getAttribute('aria-pressed') === 'true') {
        watch.answers.push({ card: element.getAttribute('data-id')!, at })
      }
      if (change.attributeName === 'data-being-drawn' && element.matches('.lanes-drawing')) noteTheRoot(element, at)
    }
    if (document.querySelector('[data-drawing="lanes"][data-level="steps"]') !== null) watch.steps.push(at)
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'data-being-drawn', 'data-drawing', 'data-level'] })
  const Started = window.Worker
  window.Worker = class extends Started {
    ended = false
    constructor(...made: ConstructorParameters<typeof Worker>) {
      super(...made)
      const n = watch.workers.answered.push(0) - 1
      this.addEventListener('message', () => { watch.workers.answered[n] = (watch.workers.answered[n] ?? 0) + 1 })
      watch.workers.started += 1
    }
    override terminate(): void {
      if (!this.ended) watch.workers.ended += 1
      this.ended = true
      super.terminate()
    }
  }
}

const theWatch = (page: Page) => page.evaluate(() => (window as unknown as { lanesWatch: TheWatch }).lanesWatch)
const now = (page: Page) => page.evaluate(() => performance.now())

/** Opens a master in a new context, at 1440 unless a size is given, and waits for its Boxes drawing to be shown. */
async function openTheMaster(
  master: { project: string; pipeline: string } = { project: PROJECT.id, pipeline: stored.master },
  viewport = { width: 1440, height: 1000 },
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await app.browser.newContext({ viewport })
  await context.addInitScript(watchThePage, master.project)
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en&theme=light#${pipelinePath(master.pipeline)}`, { waitUntil: 'commit' })
  await theLevelIsShown(page, 'boxes')
  return { page, close: () => context.close() }
}

/** Waits until a lanes drawing of the level is shown with its fit, and no root says it is being drawn. */
async function theLevelIsShown(page: Page, level: 'boxes' | 'steps', { not }: { not?: string } = {}): Promise<void> {
  await page.waitForFunction(
    ({ level, not }) => {
      const drawing = document.querySelector(`[data-drawing="lanes"][data-level="${level}"][data-fit]`)
      if (drawing === null || document.querySelector('[data-being-drawn]') !== null) return false
      return not === undefined || (drawing as HTMLElement).dataset.fit !== not
    },
    { level, not },
    { timeout: DRAWN_WITHIN, polling: 100 },
  )
}

/** Presses the level, and waits for the root to say it draws that level. */
async function pressTheLevel(page: Page, level: 'boxes' | 'steps'): Promise<number> {
  const at = await now(page)
  await page.locator(`[data-level-control] button[data-level="${level}"]`).click()
  await page.locator(`.lanes-drawing[data-being-drawn="${level}"]`).waitFor({ timeout: SAYS_IT_IS_DRAWING_WITHIN })
  return at
}

/** The drawing on screen, by a mark it carries as a property, so the drawing shown after it can be told apart. */
const markTheDrawing = (page: Page, mark: string) =>
  page.evaluate(({ selector, mark }) => { Object.assign(document.querySelector(selector)!, { lanesMark: mark }) }, { selector: DRAWING, mark })
const theOldDrawing = (page: Page, mark: string) =>
  page.evaluate(({ selector, mark }) => {
    const all = [...document.querySelectorAll(selector)]
    const old = all.find((node) => (node as unknown as { lanesMark?: string }).lanesMark === mark) as HTMLElement | undefined
    if (old === undefined) return null
    const box = old.getBoundingClientRect()
    const world = old.querySelector<HTMLElement>('.e-world')
    const matrix = world === null ? null : new DOMMatrixReadOnly(getComputedStyle(world).transform)
    return {
      connected: old.isConnected,
      visible: getComputedStyle(old).visibility === 'visible' && box.height > 0 && box.width > 0,
      level: old.dataset.level ?? null,
      cards: old.querySelectorAll('.e-card').length,
      world: matrix === null ? null : { x: matrix.e, y: matrix.f, zoom: matrix.a },
    }
  }, { selector: DRAWING, mark })
/** Each card of the drawing marked `mark`, in order, with where it is on the page: a press scrolls, so not the screen. */
const theCardsOnThePage = (page: Page, mark: string) =>
  page.evaluate(({ selector, mark }) => {
    const drawing = [...document.querySelectorAll(selector)].find((node) => (node as unknown as { lanesMark?: string }).lanesMark === mark)
    return drawing === undefined ? null : [...drawing.querySelectorAll('.e-card[data-id]')].map((card) => {
      const box = card.getBoundingClientRect()
      return { card: card.getAttribute('data-id')!, x: box.left + scrollX, y: box.top + scrollY }
    })
  }, { selector: DRAWING, mark })
/** Where the world of the drawing on screen is placed and how big it is drawn, from its computed transform. */
const theWorld = (page: Page) =>
  page.locator(`${DRAWING} .e-world`).evaluate((world) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform)
    return { x: matrix.e, y: matrix.f, zoom: matrix.a }
  })
const theSameWorld = (a: { x: number; y: number; zoom: number } | null, b: { x: number; y: number; zoom: number } | null) =>
  a !== null && b !== null && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.zoom - b.zoom) < 0.0001
/** The zoom the controls say, as a percentage. */
const theZoomSaid = async (page: Page) => /\d+%/.exec((await page.locator('.lanes-controls').textContent()) ?? '')?.[0] ?? null

/** Presses the card on the drawing on screen and gives how long the page took to answer, from TheWatch. */
async function pressTheCard(page: Page, card: string): Promise<number> {
  const place = await aPlaceOnTheCard(page, card)
  const before = (await theWatch(page)).presses.length
  await page.mouse.click(place.x, place.y)
  await page.waitForFunction(
    ({ card, before }) => {
      const watch = (window as unknown as { lanesWatch: TheWatch }).lanesWatch
      const press = watch.presses.slice(before).find((each) => each.card === card)
      return press !== undefined && watch.answers.some((each) => each.card === card && each.at >= press.at)
    },
    { card, before },
    { timeout: 30_000, polling: 50 },
  )
  const watch = await theWatch(page)
  const press = watch.presses.slice(before).find((each) => each.card === card)!
  return watch.answers.find((each) => each.card === card && each.at >= press.at)!.at - press.at
}

/**
 * A card of the drawing on screen whose selection shows at least one line drawn at rest, with those lines. Each card is
 * selected and let go again through its own click, so nothing is left held.
 */
async function aCardWithLines(page: Page): Promise<{ card: string; lines: string[] }> {
  const found = await page.evaluate((selector) => {
    const root = document.querySelector(selector)!
    for (const card of root.querySelectorAll<HTMLElement>('.e-card[data-id][role]')) {
      card.click()
      const lines = [...root.querySelectorAll('path.e-path[data-active="1"]')].map((path) => path.getAttribute('data-link')!)
      card.click()
      if (lines.length > 0) return { card: card.getAttribute('data-id')!, lines: lines.sort() }
    }
    return null
  }, DRAWING)
  expect(found, `a card on ${page.url()} whose selection shows a line drawn at rest`).not.toBeNull()
  expect(await page.locator(`${DRAWING} .e-card[aria-pressed="true"]`).count(), 'no card is left pressed after the cards were tried').toBe(0)
  return found!
}

/** The links of the lines the drawing on screen shows as the selected card's (data-active). */
const theActiveLines = (page: Page) =>
  page.evaluate((selector) => [...document.querySelectorAll(`${selector} path.e-path[data-active="1"]`)].map((path) => path.getAttribute('data-link')!).sort(), DRAWING)

/** The longest task the page reported that started from `from` on, and before `to`. */
async function theLongestTask(page: Page, from: number, to: number): Promise<{ start: number; ms: number } | null> {
  const tasks = (await theWatch(page)).longTasks.filter((task) => task.start + task.ms >= from && task.start <= to)
  return tasks.reduce<{ start: number; ms: number } | null>((a, b) => (a === null || b.ms > a.ms ? b : a), null)
}

/** Waits until at least `workers` workers were started and the newest has answered a call. */
async function theNewestWorkerHasAnswered(page: Page, workers: number): Promise<void> {
  await page.waitForFunction(
    (workers) => {
      const { started, answered } = (window as unknown as { lanesWatch: TheWatch }).lanesWatch.workers
      return started >= workers && (answered.at(-1) ?? 0) > 0
    },
    workers,
    { timeout: ROUTING_BEGUN_WITHIN, polling: 100 },
  )
}

/** A place on the drawing's frame with nothing drawn on it, inside the window, for a pan. */
async function anEmptyPlace(page: Page): Promise<{ x: number; y: number }> {
  const place = await page.evaluate((selector) => {
    const frame = document.querySelector(`${selector} .e-frame`)
    if (frame === null) return null
    const box = frame.getBoundingClientRect()
    for (let y = Math.max(box.top, 0) + 20; y < Math.min(box.bottom, innerHeight) - 60; y += 16) {
      for (let x = box.left + 20; x < box.right - 120; x += 16) {
        const hit = document.elementFromPoint(x, y)
        if (hit !== null && frame.contains(hit) && hit.closest('.e-card, a, button, input, select, textarea, .e-key, .e-path, .e-pill, .e-area-head') === null) return { x, y }
      }
    }
    return null
  }, DRAWING)
  expect(place, 'a place on the drawing with nothing drawn on it').not.toBeNull()
  return place!
}

describe('the lanes drawing keeps the page answering while its lines are worked out', () => {
  beforeAll(async () => {
    db = await freshDb()
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    const { anOfficeId } = await import('../src/server/db/ids.ts')
    createWorkspace(PROJECT)
    stored = storeTheMadeUpMaster(db, PROJECT.id)
    createWorkspace(PROJECT_OF_54)
    storedOf54 = storeTheMasterOf54Boxes(db, PROJECT_OF_54.id, anOfficeId)
    app = await liveApp({ name: 'master-answers', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
    // call() fails the hook with the office's reply when the master is not set.
    await writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json')).call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: stored.master })
    const writeOf54 = writerFor(app, PROJECT_OF_54.id, join(dirname(db.file), 'keys.json'))
    await writeOf54.call('PUT', `/api/projects/${PROJECT_OF_54.id}/master-pipeline`, { pipeline: storedOf54.master! })
    const [areas] = storedOf54.areas
    areasOf54 = await storeTheAreas(writeOf54, areas!.pipeline, areas!.intent)
    createWorkspace(PROJECT_OF_THE_BLOCK)
    storedBlock = storeTheMadeUpMaster(db, PROJECT_OF_THE_BLOCK.id)
    const writeOfTheBlock = writerFor(app, PROJECT_OF_THE_BLOCK.id, join(dirname(db.file), 'keys.json'))
    await writeOfTheBlock.call('PUT', `/api/projects/${PROJECT_OF_THE_BLOCK.id}/master-pipeline`, { pipeline: storedBlock.master })
    if (THE_BLOCK !== undefined) {
      const nodes = Object.fromEntries(THE_BLOCK.boxes.map((box, n) => [storedBlock.id[box]!, { lane: AREAS_OF_THE_BLOCK[n % AREAS_OF_THE_BLOCK.length]!.name, order: n }]))
      areasOfTheBlock = await storeTheAreas(writeOfTheBlock, storedBlock.id[THE_BLOCK.key]!, { lanes: AREAS_OF_THE_BLOCK, nodes })
    }
  }, 300_000)
  afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

  it('the first open says the boxes are being drawn until they are drawn', async () => {
    const { page, close } = await openTheMaster()
    try {
      const watch = await theWatch(page)
      expect(watch.beingDrawn[0], `the root said it was drawing before the first drawing was shown: ${JSON.stringify(watch.beingDrawn)}`).toMatchObject({ level: 'boxes', busy: 'true' })
      expect(watch.beingDrawn[0]!.words, 'the words the root said while the first drawing was drawn').toContain(WORD.boxes)
      expect(watch.beingDrawn.at(-1)!.level, 'the last change of data-being-drawn takes it away').toBeNull()
      expect(await page.locator('.lanes-drawing').getAttribute('aria-busy'), 'the root is not busy once the drawing is shown').not.toBe('true')
      expect(await page.locator('.lanes-drawing [role="status"]').allTextContents(), 'no words say a drawing is being drawn once it is shown').not.toContain(WORD.boxes)
    } finally {
      await close()
    }
  }, ONE_CASE)

  it('while Steps is drawn, Boxes stays on screen, answers a press in under 300 ms, pans, and no task is over 200 ms', async () => {
    const { page, close } = await openTheMaster()
    try {
      await markTheDrawing(page, 'boxes')
      const boxes = await page.locator(`${DRAWING} .e-card`).count()
      const chosen = await aCardWithLines(page)
      const pressed = await pressTheLevel(page, 'steps')
      expect(await page.locator('.lanes-drawing').getAttribute('aria-busy'), 'the root is busy while Steps is drawn').toBe('true')
      expect(await page.locator('.lanes-drawing [role="status"]').allTextContents(), 'the words while Steps is drawn').toContain(WORD.steps)
      const old = await theOldDrawing(page, 'boxes')
      expect(old, 'the Boxes drawing while Steps is drawn').toMatchObject({ connected: true, visible: true, level: 'boxes', cards: boxes })

      const answer = await pressTheCard(page, chosen.card)
      expect(await page.locator('.lanes-drawing').getAttribute('data-being-drawn'), 'Steps was still being drawn when the press was answered').toBe('steps')
      expect(answer, `the press on a Boxes card while Steps is drawn was answered in ${answer.toFixed(0)} ms`).toBeLessThan(ANSWER_WITHIN)
      expect(await theActiveLines(page), 'the pressed card shows its lines on the Boxes drawing').toEqual(chosen.lines)

      const start = await anEmptyPlace(page)
      const before = (await theOldDrawing(page, 'boxes'))!.world
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      await page.mouse.move(start.x + 80, start.y + 40, { steps: 8 })
      await page.mouse.up()
      const after = (await theOldDrawing(page, 'boxes'))!.world
      expect(await page.locator('.lanes-drawing').getAttribute('data-being-drawn'), 'Steps was still being drawn when the drag ended').toBe('steps')
      expect(before !== null && theSameWorld(after, { x: before.x + 80, y: before.y + 40, zoom: before.zoom }),
        `the Boxes drawing moved with the drag while Steps was drawn: from ${JSON.stringify(before)} to ${JSON.stringify(after)}`).toBe(true)

      await theLevelIsShown(page, 'steps')
      const shown = await now(page)
      expect(await theOldDrawing(page, 'boxes'), 'the Boxes drawing is gone once Steps is shown').toBeNull()
      const kept = await theWorld(page)
      expect(theSameWorld(kept, after), `the drag made while Steps was drawn is kept on the Steps drawing: ${JSON.stringify(kept)} against ${JSON.stringify(after)}`).toBe(true)
      const longest = await theLongestTask(page, pressed, shown)
      expect(longest?.ms ?? 0, `the longest task from the Steps press to the Steps drawing: ${JSON.stringify(longest)}`).toBeLessThanOrEqual(LONGEST_TASK)
    } finally {
      await close()
    }
  }, ONE_CASE)

  it('at a new width the drawing is drawn again, a press and a zoom made meanwhile are kept, and no task is over 200 ms', async () => {
    const { page, close } = await openTheMaster()
    try {
      await pressTheLevel(page, 'steps')
      await theLevelIsShown(page, 'steps')
      await markTheDrawing(page, 'at 1440')
      const fitAt1440 = await page.locator(DRAWING).getAttribute('data-fit')
      const chosen = await aCardWithLines(page)
      const widened = await now(page)
      await page.setViewportSize({ width: 990, height: 1000 })
      await page.locator('.lanes-drawing[data-being-drawn="steps"]').waitFor({ timeout: SAYS_IT_IS_DRAWING_WITHIN })

      const answer = await pressTheCard(page, chosen.card)
      expect(await page.locator('.lanes-drawing').getAttribute('data-being-drawn'), 'the drawing at 990 was still being drawn when the press was answered').toBe('steps')
      expect(answer, `the press while the drawing at 990 was drawn was answered in ${answer.toFixed(0)} ms`).toBeLessThan(ANSWER_WITHIN)
      await page.locator(`.lanes-controls button[aria-label="${BIGGER}"]`).click()
      const zoomed = (await theOldDrawing(page, 'at 1440'))!.world
      const zoomSaid = await theZoomSaid(page)
      expect(await page.locator('.lanes-drawing').getAttribute('data-being-drawn'), 'the drawing at 990 was still being drawn after the zoom').toBe('steps')

      await theLevelIsShown(page, 'steps', { not: fitAt1440! })
      const shown = await now(page)
      expect(await theOldDrawing(page, 'at 1440'), 'the drawing at 1440 is gone once the one at 990 is shown').toBeNull()
      expect(await page.locator(DRAWING).getAttribute('data-selected'), 'the card pressed while the drawing at 990 was drawn is the one held').toBe(chosen.card)
      expect(await page.locator(`${DRAWING} .e-card[data-id="${chosen.card}"]`).getAttribute('aria-pressed'), 'the held card is pressed on the drawing at 990').toBe('true')
      const kept = await theWorld(page)
      expect(theSameWorld(kept, zoomed), `the zoom made while the drawing at 990 was drawn is kept on it: ${JSON.stringify(kept)} against ${JSON.stringify(zoomed)}`).toBe(true)
      expect(await theZoomSaid(page), 'the zoom the controls say is kept').toBe(zoomSaid)
      const longest = await theLongestTask(page, widened, shown)
      expect(longest?.ms ?? 0, `the longest task from the new width to the drawing at 990: ${JSON.stringify(longest)}`).toBeLessThanOrEqual(LONGEST_TASK)
    } finally {
      await close()
    }
  }, ONE_CASE)

  it('a press on Boxes before Steps is drawn keeps Steps off the page and ends every worker the drawing started', async () => {
    const { page, close } = await openTheMaster()
    try {
      const pressed = await pressTheLevel(page, 'steps')
      await page.locator('[data-level-control] button[data-level="boxes"]').click()
      await page.waitForFunction(() => document.querySelector('[data-being-drawn]') === null && document.querySelector('[data-drawing="lanes"][data-level="boxes"][data-fit]') !== null, null, { timeout: DRAWN_WITHIN, polling: 100 })
      await page.waitForFunction(() => {
        const { started, ended } = (window as unknown as { lanesWatch: TheWatch }).lanesWatch.workers
        return started > 0 && started === ended
      }, null, { timeout: 10_000, polling: 100 }).catch(() => undefined)
      const watch = await theWatch(page)
      expect(watch.workers.started, 'the drawings started a worker each to route their lines').toBeGreaterThan(0)
      expect(watch.workers.ended, 'every worker started was ended within 10 s of Boxes being shown').toBe(watch.workers.started)
      expect(watch.steps.filter((at) => at >= pressed), 'times a Steps drawing was in the document after the Steps press').toEqual([])
      expect(await page.locator(DRAWING).getAttribute('data-level'), 'the drawing shown is Boxes').toBe('boxes')
    } finally {
      await close()
    }
  }, ONE_CASE)

  it('the words that say Steps is being drawn move no card of the Boxes drawing, at 1440, 990 and 660', async () => {
    theAreasWereStored(areasOf54, 'the made-up master of 54 boxes')
    const masters = [
      { name: 'the made-up master at its real shape', project: PROJECT.id, pipeline: stored.master },
      { name: 'the made-up master of 54 boxes', project: PROJECT_OF_54.id, pipeline: storedOf54.master! },
    ]
    const seen: { where: string; cards: number; moved: number; most: { card: string; x: number; y: number } | null }[] = []
    for (const master of masters) {
      for (const viewport of WIDTHS) {
        const where = `${master.name} at ${String(viewport.width)}`
        const { page, close } = await openTheMaster(master, viewport)
        try {
          await markTheDrawing(page, 'boxes')
          const before = (await theCardsOnThePage(page, 'boxes'))!
          await pressTheLevel(page, 'steps')
          await page.locator('.lanes-drawing [role="status"]', { hasText: String(WORD.steps) }).waitFor({ state: 'visible', timeout: SAYS_IT_IS_DRAWING_WITHIN })
          const during = await theCardsOnThePage(page, 'boxes')
          expect(await page.locator('.lanes-drawing').getAttribute('data-being-drawn'), `${where}: Steps was still being drawn when the cards were read`).toBe('steps')
          expect(during?.map((each) => each.card), `${where}: the Boxes drawing still holds the same cards while Steps is drawn`).toEqual(before.map((each) => each.card))
          const moves = before.map((was, n) => ({ card: was.card, x: during![n]!.x - was.x, y: during![n]!.y - was.y }))
          const moved = moves.filter((move) => Math.abs(move.x) > STAYS_WITHIN || Math.abs(move.y) > STAYS_WITHIN)
          const most = moved.reduce<(typeof moves)[number] | null>((a, b) => (a === null || Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y) ? b : a), null)
          seen.push({ where, cards: before.length, moved: moved.length, most: most === null ? null : { card: most.card, x: Math.round(most.x * 10) / 10, y: Math.round(most.y * 10) / 10 } })
        } finally {
          await close()
        }
      }
    }
    expect(seen.filter((each) => each.moved > 0), `cards of the Boxes drawing that moved on the page while the words said Steps was being drawn: ${JSON.stringify(seen)}`).toEqual([])
  }, WIDTHS.length * 2 * 120_000)

  it('block-08 is measured with no task over 200 ms, from its open at 1440 and from each width change to 990 and 660', async () => {
    expect(THE_BLOCK, 'block-08 is a block page in the made-up master at its real shape').toBeDefined()
    theAreasWereStored(areasOfTheBlock, 'block-08 of the made-up master')
    const context = await app.browser.newContext({ viewport: WIDTHS[0]! })
    await context.addInitScript(watchThePage, PROJECT_OF_THE_BLOCK.id)
    const page = await context.newPage()
    const seen: { width: number; longest: { start: number; ms: number } | null }[] = []
    try {
      await page.goto(`${app.site}/?lang=en&theme=light#${pipelinePath(storedBlock.id[THE_BLOCK!.key]!)}`, { waitUntil: 'commit' })
      for (const [n, viewport] of WIDTHS.entries()) {
        let from = 0
        if (n > 0) {
          from = await now(page)
          await page.setViewportSize(viewport)
        }
        await theNewestWorkerHasAnswered(page, n + 1)
        seen.push({ width: viewport.width, longest: await theLongestTask(page, from, await now(page)) })
      }
    } finally {
      await context.close()
    }
    expect(seen.filter((each) => (each.longest?.ms ?? 0) > LONGEST_TASK), `the longest task from the open at 1440, and from each width change, to the first answer of the new drawing's worker: ${JSON.stringify(seen)}`).toEqual([])
  }, ONE_CASE)
})
