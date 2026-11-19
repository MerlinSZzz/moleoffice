// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DRAG ON THE MADE-UP MASTER AT REAL SHAPE SELECTS NO WORDS, WITH NO NEW DRAWING SHOWN. Wave 13u round 231. This is
 * case 6 of the criterion whose cases 1 to 5 are in tests/a-drag-on-the-lanes-selects-no-words.test.ts, where the fault
 * is told whole. Case 6 has a file of its own because it needs a made-up office of its own.
 * The made-up master of 34 boxes in tests/a-made-up-master-at-real-shape.ts, at the Boxes level it opens at, at
 * 1440 x 1000, light, served from the production build, at the page's own size.
 *
 * THE DRAG OF CASE 6, as a script that took review pictures of this master made it: the drawing's frame is scrolled
 * into the window as Playwright's scrollIntoViewIfNeeded scrolls it. The press is at the first place on a 16 px grid,
 * row by row from 12 px inside the top-left corner of the part of the frame the window shows, that is in the frame, on
 * none of the things a press there would act on or that carry words, and leaves room for the whole drag inside that part.
 * Then come 15 moves, at once, to 300 px right and 200 px down, and the release. No new drawing is asked for.
 *
 * WHAT IS PROVED: 6. after that drag no new drawing was shown, no words are selected, read just after the release and
 * 600 ms later, and every card moved 300 px right and 200 px down. A failure names which read it was, the selected
 * words, cut to 80 characters, and the element they lie in.
 *
 * RED UNTIL THE CODE: at 5ac0fefd7, whose code is 236ceb7e9's, case 6 is red because the words "Example master step 01
 * (made up)" and "to do" are selected after the drag.
 */
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { DRAWING, openThePage, prepareThePage, theDrawingIsDrawn, writerFor } from './a-made-up-office-drawn-in-lanes.ts'
import { storeTheMadeUpMaster } from './a-made-up-master-at-real-shape.ts'

const PROJECT = { id: 'test-master-dragged', title: 'Example office for a master dragged (made up)' }
/** The drag, in px right and down. */
const DX = 300, DY = 200
/** What a press acts on, or what carries words, by the script's own list. The press place is on none of them. */
const BUSY = '.e-card, .e-path, .e-pill, a, button, input, select, textarea, .e-key, .e-area-head, .e-heading, .e-selected-words, .e-key-detail, .e-partial-companion'

let db: TestDb
let app: LiveApp
let master = ''
beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace(PROJECT)
  master = storeTheMadeUpMaster(db, PROJECT.id).master
  app = await liveApp({ name: 'master-dragged', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json')).call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: master })
  await prepareThePage(app, PROJECT.id)
}, 300_000)
afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

async function points() {
  return app.page.locator(`${DRAWING} .e-card`).evaluateAll(cards => cards.map(card => {
    const box = card.getBoundingClientRect()
    return { id: (card as HTMLElement).dataset.id, x: box.x, y: box.y }
  }))
}
/** The words the window holds selected, and the element they lie in, named by its tag, its classes and its card. */
async function theSelection() {
  return app.page.evaluate(() => {
    const selection = window.getSelection()
    const text = selection?.toString() ?? ''
    if (selection === null || selection.rangeCount === 0) return { text, where: 'no element' }
    const node = selection.getRangeAt(0).commonAncestorContainer
    const element = node instanceof Element ? node : node.parentElement
    if (element === null) return { text, where: 'no element' }
    const name = `${element.tagName.toLowerCase()}${[...element.classList].map(one => `.${one}`).join('')}`
    const card = element.closest('.e-card') as HTMLElement | null
    return { text, where: card === null ? name : `${name} on card ${card.dataset.id ?? 'with no id'}` }
  })
}
/** The script's press place: the first free place for the drag, worked out from the frame as the window shows it. */
async function thePressPlace() {
  return app.page.evaluate(({ selector, busy, dx, dy }) => {
    const frame = document.querySelector(`${selector} .e-frame`)!
    const shown = frame.getBoundingClientRect()
    const left = Math.max(shown.left, 0) + 12, top = Math.max(shown.top, 0) + 12
    const right = Math.min(shown.right, innerWidth) - 12, bottom = Math.min(shown.bottom, innerHeight) - 12
    for (let y = top; y + dy <= bottom; y += 16) {
      for (let x = left; x + dx <= right; x += 16) {
        const hit = document.elementFromPoint(x, y)
        if (hit !== null && frame.contains(hit) && hit.closest(busy) === null) return { x, y }
      }
    }
    return null
  }, { selector: DRAWING, busy: BUSY, dx: DX, dy: DY })
}

it('case 6: a 300 x 200 drag on the made-up master at real shape, with no new drawing shown, moves the view and selects no words', async () => {
  await openThePage(app, pipelinePath(master))
  await theDrawingIsDrawn(app.page)
  expect(await app.page.locator(DRAWING).getAttribute('data-level'), 'case 6: the master opens at its Boxes level').toBe('boxes')
  await app.page.locator(`${DRAWING} .e-frame`).scrollIntoViewIfNeeded()
  const p = await thePressPlace()
  expect(p, 'case 6: a free place for the drag in the part of the frame the window shows').not.toBeNull()
  const before = await points()
  const shown = await app.page.locator(DRAWING).elementHandle()
  await app.page.mouse.move(p!.x, p!.y)
  await app.page.mouse.down()
  try {
    for (let step = 1; step <= 15; step++) await app.page.mouse.move(p!.x + DX * step / 15, p!.y + DY * step / 15)
  } finally {
    await app.page.mouse.up()
  }
  const atTheRelease = await theSelection()
  expect(await app.page.evaluate(([old, selector]) => document.querySelector(selector) === old, [shown, DRAWING] as const), 'case 6: the drawing pressed is still the one shown after the release').toBe(true)
  await app.page.waitForTimeout(600)
  const later = await theSelection()
  for (const [read, { text, where }] of [['just after the release', atTheRelease], ['600 ms after the release', later]] as const) {
    expect(text, `case 6, after a 300 x 200 drag from (${p!.x}, ${p!.y}), read ${read}: the words "${text.slice(0, 80)}" are selected, in ${where}`).toBe('')
  }
  const after = await points()
  expect(after.length, 'case 6: the cards drawn').toBe(before.length)
  for (let i = 0; i < before.length; i++) {
    expect(after[i]!.id).toBe(before[i]!.id)
    expect(Math.abs(after[i]!.x - before[i]!.x - DX), `case 6: ${before[i]!.id} moved ${(after[i]!.x - before[i]!.x).toFixed(1)} px right, not ${DX}`).toBeLessThanOrEqual(2)
    expect(Math.abs(after[i]!.y - before[i]!.y - DY), `case 6: ${before[i]!.id} moved ${(after[i]!.y - before[i]!.y).toFixed(1)} px down, not ${DY}`).toBeLessThanOrEqual(2)
  }
}, 180_000)
