// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DRAWING GOES ON THE WHOLE SCREEN AND COMES BACK — CRITERION D17.
 *
 * Section 20 of design/messages/ACCEPTANCE.md: the drawing seemed to have no way to fill the
 * screen. It had none: there was no such control on either
 * drawing, so there was nothing to test and nothing failed.
 *
 * WHAT IS MEASURED HERE IS THE BROWSER'S OWN ANSWER. `document.fullscreenElement` is what says
 * whether an element is on the whole screen, so that is what is read — not a class, not a flag the
 * page set itself. A page that set a class and called it fullscreen would pass a test written
 * against its own class and fail a person.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `fillTheScreen` in Canvas.tsx return without asking → every section goes red.
 *   drop the Escape listener → the section about Escape goes red and the rest stay green.
 *   make the control's `now` and `after` the same value → the render throws, because a control that
 *     would change nothing must say why, which is the D1 rule this control goes through.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let page: Page
let pipelineId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'whole-screen', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Wrist calibration sweep',
    summary: 'Does the wrist camera hold its calibration across a working day?',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  for (const name of ['Collect boards', 'Solve the intrinsics', 'Check the reprojection']) {
    await post(`/api/records/${pipelineId}/blocks`, { name, state: 'done' })
  }
  const first = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: 'Three of four printed wrist mounts broke below the load the handover trials need.',
    data: { state: 'active', parts: [] },
  })
  const second = await post('/api/records', {
    kind: 'module',
    title: 'Bench jig',
    summary: 'Holds the mount while it is pulled.',
    data: { state: 'active', parts: [] },
  })
  const linked = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fromId: first.record.id, toId: second.record.id, type: 'relates_to' }),
  })
  if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(hash: string, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await page.goto(`${app.site}/#/${hash}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** What the browser says is on the whole screen, and how big the drawing's own box is. */
async function whatIsFilling(): Promise<{ element: string | null; canvas: number; window: number }> {
  return page.evaluate(() => ({
    element: document.fullscreenElement?.className ?? null,
    canvas: Math.round(document.querySelector('.gx-canvas')?.getBoundingClientRect().height ?? 0),
    window: window.innerHeight,
  }))
}

/**
 * WAIT UNTIL THE BROWSER HAS PUT THE DRAWING ON THE WHOLE SCREEN, OR TAKEN IT OFF, AND IT HAS
 * STOPPED MOVING.
 *
 * The browser answers a request for the whole screen, and a request to leave it, a moment after the
 * press, and the drawing is then drawn again at its new size. The answer is looked for on every
 * animation frame for ten seconds at most. IT DOES NOT THROW WHEN THE ANSWER NEVER COMES: a press
 * that asks the browser for nothing is this file's fault, and the assertion after this is what names
 * it, in its own words, rather than a timeout.
 */
async function theScreenHasAnswered(filled: boolean): Promise<void> {
  const until = Date.now() + 10_000
  while (Date.now() < until && ((await whatIsFilling()).element !== null) !== filled) {
    await page.evaluate(() => new Promise<void>((done) => window.requestAnimationFrame(() => done())))
  }
  await theDrawingHasSettled(page)
}

const CONTROL = 'Whole screen'
const BACK = 'Leave the whole screen'

for (const theme of ['light'] as const) {
  for (const [what, hash] of [['the module drawing', 'pipeline/drawing']] as const) {
    describe(`${what} goes on the whole screen and comes back, in ${theme}`, () => {
      const where = (): string => hash

      it('offers a control for it, and puts the drawing on the whole screen when it is pressed', async () => {
        await openTheDrawing(where(), theme)
        const before = await whatIsFilling()
        expect(before.element, 'something was already on the whole screen before anything was pressed').toBeNull()
        await page.getByRole('button', { name: CONTROL }).first().click()
        await theScreenHasAnswered(true)
        const after = await whatIsFilling()
        expect(after.element, 'pressing the control put nothing on the whole screen').toContain('gx-canvas-wrap')
        expect(
          after.canvas,
          `the drawing on the whole screen is ${String(after.canvas)}px tall in a ${String(after.window)}px window, ` +
            `so it did not take the room it was given`,
        ).toBeGreaterThan(after.window * 0.6)
      }, 180_000)

      it('names the way back while it is filling the screen, and comes back when it is pressed', async () => {
        expect(
          await page.getByRole('button', { name: BACK }).count(),
          'the control does not offer the way back while the drawing is on the whole screen',
        ).toBe(1)
        await page.getByRole('button', { name: BACK }).first().click()
        await theScreenHasAnswered(false)
        expect((await whatIsFilling()).element, 'the drawing stayed on the whole screen').toBeNull()
        expect(
          await page.getByRole('button', { name: CONTROL }).count(),
          'the control does not offer the whole screen again',
        ).toBe(1)
      }, 180_000)

      it('comes back when Escape is pressed', async () => {
        await openTheDrawing(where(), theme)
        await page.getByRole('button', { name: CONTROL }).first().click()
        await theScreenHasAnswered(true)
        expect((await whatIsFilling()).element, 'the drawing is not on the whole screen to escape from').toContain(
          'gx-canvas-wrap',
        )
        await page.keyboard.press('Escape')
        await theScreenHasAnswered(false)
        expect((await whatIsFilling()).element, 'Escape did not bring the drawing back').toBeNull()
      }, 180_000)

      it('still draws its cards while it is on the whole screen', async () => {
        await openTheDrawing(where(), theme)
        const onThePage = await page.locator('.gx-card, .gx-group').count()
        await page.getByRole('button', { name: CONTROL }).first().click()
        await theScreenHasAnswered(true)
        expect(
          await page.locator('.gx-card, .gx-group').count(),
          'the drawing lost cards when it filled the screen',
        ).toBe(onThePage)
        await page.keyboard.press('Escape')
        await theScreenHasAnswered(false)
      }, 180_000)
    })
  }
}
