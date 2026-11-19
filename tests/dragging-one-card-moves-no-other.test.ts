// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DRAGGING ONE CARD MOVES NO OTHER CARD, AND DOES NOT MOVE THE WINDOW — CRITERION D22.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, AND THE TWO THINGS THAT WERE DOING IT
 * ---------------------------------------------------------------------------------------
 *
 * Section 23 of design/messages/ACCEPTANCE.md:
 *
 *   Dragging the left edge made the right side grow and shrink, or the whole graph seemed to move. While a
 *   card is resized or moved, no other block may change; only the lines of the blocks it joins are redrawn.
 *
 * Measured on the owner's own Handover v2 pipeline, on an isolated copy of the owner's database, 6 September 2026.
 * Two separate faults, and the whole graph seeming to move is the second one:
 *
 *   RESIZING. Dragging the ZED 2i card's left edge 140 pixels to the left moved SIXTEEN of the
 *   eighteen cards on the drawing, each about 140 across and 76 down. A wider card is a different
 *   box, so the canvas asked ELK for a whole new arrangement and applied it. The window did not
 *   move; every other card did.
 *
 *   MOVING. A mouse held on a step card and dragged 100 across and 60 down moved ALL EIGHTEEN cards
 *   by exactly that, and the canvas transform with them. React Flow pans the picture on a drag over
 *   its pane, and a card is on the pane, so the drag was the canvas's rather than the card's.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   delete the `oneCardChanged` branch from the layout effect in Canvas.tsx → the resize case goes
 *     red: ELK lays the drawing out again and the neighbours move.
 *   the `nopan` mutation that used to be here is gone with criterion D31: `.gx-card` no longer
 *     carries it, and tests/a-short-press-pans-the-drawing.test.ts is where the panning is held.
 *   stop deleting the touching edges' routes in that branch → the lines case goes red: a line into
 *     the grown card keeps the route ELK worked out for the card's old width.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let page: Page
let richId = ''
/** The ids of the two links, so the lines can be told apart by name rather than guessed at. */
let linkToNeighbour = ''
let linkBetweenTwoOthers = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** Link two records and hand back the link's id, which is what names the line on the drawing. */
async function link(fromId: string, toId: string): Promise<string> {
  const res = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fromId, toId, type: 'relates_to' }),
  })
  if (!res.ok) throw new Error(`the modules could not be linked: ${await res.text()}`)
  const made = (await res.json()) as { link?: { id?: string }; id?: string }
  const id = made.link?.id ?? made.id
  if (typeof id !== 'string') throw new Error(`the link reply carried no id: ${JSON.stringify(made)}`)
  return id
}

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'one-card-moves-alone', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const rich = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary:
      'Quokka three of four printed wrist mounts broke below the load the handover trials need, so ' +
      'only the aluminium one is worth another run this week.',
    data: { state: 'active', parts: [] },
  })
  richId = rich.record.id
  // FOUR NEIGHBOURS, so a re-layout has plenty to move and a drawing with one card cannot pass.
  const neighbours: string[] = []
  for (const [title, summary] of [
    ['Bench jig', 'Holds the mount while it is pulled.'],
    ['Load cell bench', 'Where the pulls are done and the numbers come from.'],
    ['Print queue', 'What printed each mount, and at which layer height.'],
    ['Aluminium order', 'The shop cut of the same geometry, expected next week.'],
  ] as const) {
    const made = await post('/api/records', { kind: 'module', title, summary, data: { state: 'active', parts: [] } })
    neighbours.push(made.record.id)
    const linked = await link(richId, made.record.id)
    if (linkToNeighbour === '') linkToNeighbour = linked
  }
  // ONE LINE BETWEEN TWO OTHER CARDS, which is the line that must NOT be redrawn. Without it every
  // line on the drawing touches the dragged card and the second case says nothing.
  linkBetweenTwoOthers = await link(neighbours[0] as string, neighbours[1] as string)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  // THE HOME PAGE ONLY WHEN THIS PAGE IS NOT ON THE APP YET. Its storage can be cleared only from a
  // page of the app. A page already on the drawing from the case before is on the app, and the
  // reload below starts it again from the cleared storage.
  if (!page.url().startsWith(app.site)) {
    await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  }
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await page.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** Wait until the page has drawn one more frame, so the last move of a drag is on the screen. */
async function aFrameIsDrawn(on: Page): Promise<void> {
  await on.evaluate(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))
}

/** Every card's box on screen, the window onto the drawing, and every line's drawn path. */
interface Shot {
  boxes: Record<string, { x: number; y: number; w: number; h: number }>
  view: string
  paths: Record<string, string>
}

async function shot(): Promise<Shot> {
  return page.evaluate(() => {
    const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {}
    for (const el of document.querySelectorAll('.react-flow__node')) {
      const id = el.getAttribute('data-id') ?? ''
      const box = el.getBoundingClientRect()
      boxes[id] = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) }
    }
    const paths: Record<string, string> = {}
    for (const el of document.querySelectorAll('.react-flow__edge')) {
      const id = el.getAttribute('data-id') ?? ''
      paths[id] = el.querySelector('path')?.getAttribute('d') ?? ''
    }
    const view = document.querySelector('.react-flow__viewport')
    return { boxes, view: view === null ? 'none' : window.getComputedStyle(view).transform, paths }
  })
}

/** Which node id the card for this record is, so the boxes above can be told apart. */
async function nodeOf(recordId: string): Promise<string> {
  const id = await page.evaluate((record) => {
    const card = document.querySelector(`.gx-card[data-target^="record/${record}/"]`)
    return card?.closest('.react-flow__node')?.getAttribute('data-id') ?? null
  }, recordId)
  if (id === null) throw new Error(`no card on the drawing for ${recordId}`)
  return id
}

/** Which cards changed at all between two shots — moved, or a different size. */
function whatChanged(before: Shot, after: Shot): string[] {
  return Object.keys(before.boxes).filter((id) => {
    const was = before.boxes[id]
    const now = after.boxes[id]
    if (was === undefined || now === undefined) return true
    return (
      Math.abs(was.x - now.x) > 1 ||
      Math.abs(was.y - now.y) > 1 ||
      Math.abs(was.w - now.w) > 1 ||
      Math.abs(was.h - now.h) > 1
    )
  })
}

async function dragTheEdge(at: string, by: number): Promise<void> {
  await page.locator(`.gx-card[data-target^="record/${richId}/"]`).first().scrollIntoViewIfNeeded()
  await aFrameIsDrawn(page)
  const grip = await page.evaluate(
    ([id, which]) => {
      const el = document.querySelector(`.gx-card[data-target^="record/${id}/"] .gx-grip[data-grip="${which}"]`)
      if (el === null) return null
      const box = el.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    },
    [richId, at] as const,
  )
  if (grip === null) throw new Error(`the card has no ${at} grip on screen`)
  await page.mouse.move(grip.x, grip.y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(grip.x + (by * step) / 8, grip.y, { steps: 2 })
    await aFrameIsDrawn(page)
  }
  await page.mouse.up()
  await theDrawingHasSettled(page)
}

for (const theme of ['light'] as const) {
  describe(`dragging one card moves no other card, in ${theme}`, () => {
    it('resizing one card leaves every other card exactly where it was', async () => {
      await openTheDrawing(theme)
      const before = await shot()
      const dragged = await nodeOf(richId)
      expect(Object.keys(before.boxes).length, 'there are neighbours to move').toBeGreaterThan(3)
      await dragTheEdge('right', 200)
      const after = await shot()
      const changed = whatChanged(before, after)
      expect(changed, 'the card that was dragged is a different size').toContain(dragged)
      expect(changed, 'and it is the only thing on the drawing that changed').toEqual([dragged])
      expect(after.view, 'the window onto the drawing did not move').toBe(before.view)
    }, 180_000)

    it('redraws the lines touching the dragged card and leaves the others alone', async () => {
      await openTheDrawing(theme)
      const before = await shot()
      const dragged = await nodeOf(richId)
      await dragTheEdge('right', 200)
      const after = await shot()
      const touching = `link:${linkToNeighbour}`
      const away = `link:${linkBetweenTwoOthers}`
      expect(before.paths[touching], 'the line into the dragged card is drawn').toBeTruthy()
      expect(before.paths[away], 'the line between two other cards is drawn').toBeTruthy()
      expect(after.paths[touching], 'the line into the dragged card follows it').not.toBe(before.paths[touching])
      expect(after.paths[away], 'the line between two other cards is left alone').toBe(before.paths[away])
      void dragged
    }, 180_000)

  })
}
